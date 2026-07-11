import assert from "node:assert/strict";
import {
  runRuntimeShutdownSequence,
  runtimeShutdownWarning,
} from "./runtime-shutdown-sequence.mjs";

const terminated = () => ({
  ok: true,
  result: { engine: { workerTerminated: true, pendingCommands: 0, pthreadRunning: 0 } },
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
