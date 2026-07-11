import assert from "node:assert/strict";
import { createSavePersistenceCoordinator } from "./save-persistence-coordinator.mjs";

const pending = [];
let memoryVersion = 1;
const snapshots = [];
const coordinator = createSavePersistenceCoordinator(({ reason, sequence }) => {
  const snapshot = memoryVersion;
  snapshots.push({ reason, sequence, snapshot });
  return new Promise((resolve) => pending.push(() => resolve({ ok: true, snapshot })));
});

const interval = coordinator.persistPeriodic("interval");
const joinedInterval = coordinator.persistPeriodic("interval-overlap");
assert.equal(snapshots.length, 1, "overlapping periodic requests must share one syncfs");

// This write happens after the first syncfs took its snapshot. A correct exit
// must not report that older in-flight operation as its final durable flush.
memoryVersion = 2;
const scheduler = coordinator.stopScheduling();
assert.equal(scheduler.inFlight, true);
const final = coordinator.persistFinal("launcher-exit-final");
await Promise.resolve();
assert.equal(snapshots.length, 1, "final flush must first drain the pre-exit syncfs");

pending.shift()();
const [intervalResult, joinedResult] = await Promise.all([interval, joinedInterval]);
assert.equal(intervalResult.snapshot, 1);
assert.equal(joinedResult.joined, true);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(snapshots.length, 2, "exit must start a distinct trailing syncfs");
assert.deepEqual(snapshots[1], {
  reason: "launcher-exit-final",
  sequence: 2,
  snapshot: 2,
});

pending.shift()();
const finalResult = await final;
assert.equal(finalResult.ok, true);
assert.equal(finalResult.finalFresh, true);
assert.equal(finalResult.priorFlushesDrained, 1);
assert.equal(finalResult.snapshot, 2, "final syncfs must include the post-snapshot write");

const latePeriodic = await coordinator.persistPeriodic("late-interval");
assert.equal(latePeriodic.skipped, true, "periodic scheduling stays stopped during teardown");
assert.equal(snapshots.length, 2);

process.stdout.write("save persistence order smoke: OK\n");
