export function settleWithin(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise)
      .then((value) => ({ ok: true, value }))
      .catch((error) => ({ ok: false, error: error?.message ?? String(error) })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({
        ok: false,
        timedOut: true,
        error: `${label} timed out after ${timeoutMs}ms`,
      }), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function invoke(operation) {
  try {
    return operation();
  } catch (error) {
    return Promise.reject(error);
  }
}

function hasStrictForcedTerminationEvidence(settled) {
  const operation = settled?.value;
  const result = operation?.result;
  const engine = result?.engine;
  return settled?.ok === true
    && operation?.ok === true
    && result?.ok === true
    && engine?.ok === true
    && engine.workerTerminated === true
    && engine.pendingCommands === 0
    && engine.pthreadRunning === 0
    && engine.engineThreadStarted === false;
}

export async function runRuntimeShutdownSequence(operations, timeouts = {}) {
  const stopTimeoutMs = timeouts.stopTimeoutMs ?? 6500;
  const finalSaveTimeoutMs = timeouts.finalSaveTimeoutMs ?? 10000;
  const shutdownTimeoutMs = timeouts.shutdownTimeoutMs ?? 30000;
  const forceTimeoutMs = timeouts.forceTimeoutMs ?? 3000;
  const order = [];

  const saveScheduling = await settleWithin(
    invoke(operations.stopSaveScheduling),
    forceTimeoutMs,
    "save scheduler stop",
  );
  const saveSchedulingStopped = saveScheduling.ok && saveScheduling.value?.ok === true;
  order.push(saveSchedulingStopped ? "save-scheduling-stopped" : "save-scheduling-stop-failed");

  const loopStop = await settleWithin(
    invoke(operations.stopLoop),
    stopTimeoutMs,
    "frame-loop stop",
  );
  const loopStopped = loopStop.ok && loopStop.value?.ok === true;
  let forced = null;
  let forceQuiescenceProven = null;
  if (loopStopped) {
    order.push("frame-loop-stopped");
  } else {
    forced = await settleWithin(
      invoke(operations.forceShutdown),
      forceTimeoutMs,
      "forced runtime shutdown",
    );
    forceQuiescenceProven = hasStrictForcedTerminationEvidence(forced);
    order.push(forceQuiescenceProven
      ? "worker-force-quiesced"
      : "worker-force-quiesce-failed");
  }

  const saves = loopStopped || forceQuiescenceProven
    ? await settleWithin(
      invoke(operations.persistFinalSave),
      finalSaveTimeoutMs,
      "final save flush",
    )
    : {
      ok: false,
      skipped: true,
      error: "final durability could not be established because worker quiescence was not proven",
    };
  const finalSaveFresh = saves.ok
    && saves.value?.ok === true
    && saves.value?.finalFresh === true;
  if (!saves.skipped) {
    order.push(finalSaveFresh ? "final-save-flushed" : "final-save-failed");
  }

  const graceful = loopStopped
    ? await settleWithin(
      invoke(operations.gracefulShutdown),
      shutdownTimeoutMs,
      "runtime shutdown",
    )
    : { ok: false, skipped: true, error: "worker was force-quiesced before final save" };
  let result = forced?.value ?? graceful.value ?? {
    ok: false,
    error: graceful.error ?? "runtime shutdown failed",
  };
  if (graceful.ok && result.ok === true) {
    order.push("runtime-destroyed");
  } else if (loopStopped) {
    forced = await settleWithin(
      invoke(operations.forceShutdown),
      forceTimeoutMs,
      "forced runtime shutdown",
    );
    if (forced.value) result = forced.value;
    forceQuiescenceProven = hasStrictForcedTerminationEvidence(forced);
    order.push(forceQuiescenceProven
      ? "worker-force-terminated"
      : "worker-force-termination-failed");
  }

  return {
    result: {
      ...result,
      ok: result.ok === true
        && finalSaveFresh
        && saveSchedulingStopped
        && forceQuiescenceProven !== false,
    },
    close: {
      saveScheduling,
      loopStop,
      saves,
      finalSaveFresh,
      graceful,
      forced,
      forceQuiescenceProven,
      order,
    },
  };
}

export function runtimeShutdownWarning(result) {
  if (result?.close?.forceQuiescenceProven === false) {
    return {
      title: "Game closed — save warning",
      message: "The game worker could not be proven stopped, so final save durability could not be established. Your latest save may not be stored.",
    };
  }
  if (result?.close?.finalSaveFresh !== true) {
    return {
      title: "Game closed — save warning",
      message: "The final save flush did not finish. Your latest save may not be stored.",
    };
  }
  if (result?.ok !== true) {
    return {
      title: "Game force-closed",
      message: "Cleanup reported an error. The game was stopped, but some runtime resources may need the next reload.",
    };
  }
  return null;
}
