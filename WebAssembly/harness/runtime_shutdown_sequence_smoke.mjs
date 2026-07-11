import assert from "node:assert/strict";
import {
  runRuntimeShutdownSequence,
  runtimeShutdownWarning,
} from "./runtime-shutdown-sequence.mjs";

const terminated = () => ({
  ok: true,
  result: {
    ok: true,
    engine: {
      ok: true,
      workerTerminated: true,
      pendingCommands: 0,
      pthreadRunning: 0,
      engineThreadStarted: false,
    },
  },
});
const finalSave = () => ({ ok: true, finalFresh: true, sequence: 2 });
const never = () => new Promise(() => {});
const fastTimeouts = {
  stopTimeoutMs: 5,
  finalSaveTimeoutMs: 5,
  shutdownTimeoutMs: 5,
  forceTimeoutMs: 5,
};

{
  const events = [];
  const shutdown = await runRuntimeShutdownSequence({
    stopSaveScheduling: () => { events.push("scheduler"); return { ok: true }; },
    stopLoop: () => { events.push("stop"); return { ok: true }; },
    persistFinalSave: () => { events.push("save"); return finalSave(); },
    gracefulShutdown: () => { events.push("destroy"); return terminated(); },
    forceShutdown: () => { events.push("force"); return terminated(); },
  }, fastTimeouts);
  assert.equal(shutdown.result.ok, true);
  assert.deepEqual(events, ["scheduler", "stop", "save", "destroy"]);
  assert.deepEqual(shutdown.close.order, [
    "save-scheduling-stopped",
    "frame-loop-stopped",
    "final-save-flushed",
    "runtime-destroyed",
  ]);
}

for (const [name, forceShutdown] of [
  ["rejected", () => Promise.reject(new Error("force rejected"))],
  ["timed out", never],
  ["reported failure", () => ({
    ok: false,
    result: {
      ok: false,
      engine: {
        ok: false,
        workerTerminated: false,
        pendingCommands: 1,
        pthreadRunning: 1,
        engineThreadStarted: true,
      },
    },
  })],
  ["omitted terminal metrics", () => ({
    ok: true,
    result: { ok: true, engine: { ok: true, workerTerminated: true } },
  })],
]) {
  const events = [];
  const shutdown = await runRuntimeShutdownSequence({
    stopSaveScheduling: () => ({ ok: true }),
    stopLoop: never,
    persistFinalSave: () => { events.push("save"); return finalSave(); },
    gracefulShutdown: terminated,
    forceShutdown,
  }, fastTimeouts);
  assert.equal(shutdown.result.ok, false, `${name}: close must fail`);
  assert.equal(shutdown.close.finalSaveFresh, false, `${name}: save must not be credited`);
  assert.equal(shutdown.close.saves.skipped, true, `${name}: save must be skipped`);
  assert.deepEqual(events, [], `${name}: save callback must not be reached`);
  assert.equal(shutdown.close.order.includes("worker-force-quiesced"), false);
  assert.equal(shutdown.close.order.includes("final-save-flushed"), false);
  assert.match(
    runtimeShutdownWarning({ ...shutdown.result, close: shutdown.close }).message,
    /durability could not be established/i,
  );
}

{
  const events = [];
  const shutdown = await runRuntimeShutdownSequence({
    stopSaveScheduling: () => { events.push("scheduler"); return { ok: true }; },
    stopLoop: () => { events.push("stop-timeout"); return never(); },
    persistFinalSave: () => { events.push("save"); return finalSave(); },
    gracefulShutdown: () => { events.push("destroy"); return terminated(); },
    forceShutdown: () => { events.push("force"); return terminated(); },
  }, fastTimeouts);
  assert.equal(shutdown.result.ok, true);
  assert.deepEqual(events, ["scheduler", "stop-timeout", "force", "save"]);
  assert.deepEqual(shutdown.close.order, [
    "save-scheduling-stopped",
    "worker-force-quiesced",
    "final-save-flushed",
  ]);
}

{
  const events = [];
  const shutdown = await runRuntimeShutdownSequence({
    stopSaveScheduling: () => { events.push("scheduler"); return { ok: true }; },
    stopLoop: () => { events.push("stop"); return { ok: true }; },
    persistFinalSave: () => { events.push("save"); return finalSave(); },
    gracefulShutdown: () => { events.push("destroy-timeout"); return never(); },
    forceShutdown: () => { events.push("force"); return terminated(); },
  }, fastTimeouts);
  assert.equal(shutdown.result.ok, true);
  assert.deepEqual(events, ["scheduler", "stop", "save", "destroy-timeout", "force"]);
  assert.deepEqual(shutdown.close.order, [
    "save-scheduling-stopped",
    "frame-loop-stopped",
    "final-save-flushed",
    "worker-force-terminated",
  ]);
}

{
  const shutdown = await runRuntimeShutdownSequence({
    stopSaveScheduling: () => ({ ok: true }),
    stopLoop: () => ({ ok: true }),
    persistFinalSave: () => ({ ok: false, finalFresh: false, error: "quota" }),
    gracefulShutdown: terminated,
    forceShutdown: terminated,
  }, fastTimeouts);
  assert.equal(shutdown.result.ok, false, "save failure must fail the overall close result");
  assert.match(runtimeShutdownWarning({ ...shutdown.result, close: shutdown.close }).message, /latest save/i);
}

process.stdout.write("runtime shutdown sequence smoke: OK\n");
