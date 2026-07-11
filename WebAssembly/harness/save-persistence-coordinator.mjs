export function createSavePersistenceCoordinator(runSync) {
  if (typeof runSync !== "function") {
    throw new TypeError("runSync must be a function");
  }

  let inFlight = null;
  let schedulingStopped = false;
  let sequence = 0;

  function start(reason) {
    const syncSequence = ++sequence;
    let operation;
    try {
      operation = Promise.resolve(runSync({ reason, sequence: syncSequence }));
    } catch (error) {
      operation = Promise.reject(error);
    }
    let tracked;
    tracked = operation
      .then((result) => ({ ...result, reason, sequence: syncSequence }))
      .finally(() => {
        if (inFlight === tracked) inFlight = null;
      });
    inFlight = tracked;
    return tracked;
  }

  function persist(reason = "manual") {
    if (!inFlight) return start(reason);
    return inFlight.then((result) => ({
      ...result,
      joined: true,
      requestedReason: reason,
    }));
  }

  function persistPeriodic(reason = "interval") {
    if (schedulingStopped) {
      return Promise.resolve({ ok: false, skipped: true, reason, schedulingStopped: true });
    }
    return persist(reason);
  }

  function stopScheduling() {
    schedulingStopped = true;
    return { ok: true, schedulingStopped: true, inFlight: Boolean(inFlight), sequence };
  }

  async function persistFinal(reason = "runtime-exit-final") {
    schedulingStopped = true;
    let priorFlushesDrained = 0;
    while (inFlight) {
      const prior = inFlight;
      await prior;
      priorFlushesDrained += 1;
    }
    const result = await start(reason);
    return {
      ...result,
      finalFresh: true,
      priorFlushesDrained,
    };
  }

  return {
    persist,
    persistPeriodic,
    persistFinal,
    stopScheduling,
    get inFlight() { return Boolean(inFlight); },
    get schedulingStopped() { return schedulingStopped; },
    get sequence() { return sequence; },
  };
}
