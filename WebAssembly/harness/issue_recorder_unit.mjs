import assert from "node:assert/strict";
import {
  compactRpcResult,
  createIssueRecorder,
  dataUrlSizeBytes,
  jsonBlobFromValue,
  jsonStringifyParts,
  makeDumpId,
  redactLarge,
  sanitizeDumpFileName,
} from "./issue-recorder.mjs";
import { normalizeCrashFailure } from "./crash-diagnostics.mjs";

assert.match(makeDumpId(new Date("2026-07-05T12:34:56.789Z")), /^cnc-2026-07-05T12-34-56-789Z$/);
assert.equal(sanitizeDumpFileName("bad / name ?.json"), "bad-name-.json");
assert.equal(sanitizeDumpFileName(""), "cnc-issue-dump");

const pngDataUrl = "data:image/png;base64,QUJDRA==";
assert.equal(dataUrlSizeBytes(pngDataUrl), 4);
assert.deepEqual(redactLarge({ dataUrl: pngDataUrl }).dataUrl, {
  redactedDataUrl: true,
  mime: "image/png",
  bytesApprox: 4,
});

const compact = compactRpcResult("realEngineFrameSummary", {
  ok: true,
  frame: {
    summary: true,
    framesCompleted: 42,
    lastFrameMs: 16.7,
    gameplay: {
      inGame: true,
      logicFrame: 11,
      objectCount: 3,
      renderedObjectCount: 2,
    },
  },
  state: {
    booted: true,
    frame: 42,
    runtime: "wasm",
    graphics: {
      api: "webgl2",
      d3d8DrawIndexedSequence: 10,
      d3d8Perf: { draws: 10 },
      d3d8DrawHistory: [1, 2, 3],
      d3d8SceneDrawHistory: [1],
    },
  },
});

assert.equal(compact.ok, true);
assert.equal(compact.frame.framesCompleted, 42);
assert.equal(compact.frame.gameplay.logicFrame, 11);
assert.equal(compact.state.graphics.d3d8DrawHistoryCount, 3);

const crash = normalizeCrashFailure({
  kind: "wasm-abort",
  stage: "engine",
  message: "GameEngine::init aborted",
  detail: { subsystem: "W3DDisplay" },
  error: new WebAssembly.RuntimeError("unreachable"),
});
assert.equal(crash.kind, "wasm-abort");
assert.equal(crash.stage, "engine");
assert.equal(crash.detail.subsystem, "W3DDisplay");
assert.equal(crash.error.name, "RuntimeError");
assert.match(crash.error.message, /unreachable/);
assert.match(crash.at, /^\d{4}-\d{2}-\d{2}T/);

const chunkedValue = {
  schema: "cnc.issue-dump.v1",
  generatedAt: new Date("2026-07-05T12:34:56.789Z"),
  timeline: Array.from({ length: 512 }, (_, index) => ({
    index,
    message: `event ${index} — ${"x".repeat(64)}`,
    optional: index % 2 === 0 ? undefined : true,
  })),
  largeScalar: `${"🙂\n".repeat(512)}done`,
  numbers: [1, Number.NaN, Number.POSITIVE_INFINITY, -0],
  omitted: undefined,
};
const expectedChunkedJson = JSON.stringify(chunkedValue, null, 2);
const originalStringify = JSON.stringify;
let chunkedParts;
let chunkedBlob;
try {
  JSON.stringify = function rejectWholeObjectStringify(value, ...args) {
    if (value != null && typeof value === "object") {
      throw new RangeError("Invalid string length");
    }
    if (typeof value === "string" && value.length > 256) {
      throw new RangeError("Invalid string length");
    }
    return originalStringify.call(this, value, ...args);
  };
  chunkedParts = jsonStringifyParts(chunkedValue, { space: 2, chunkChars: 256 });
  chunkedBlob = jsonBlobFromValue(chunkedValue, { space: 2, chunkChars: 256 });
} finally {
  JSON.stringify = originalStringify;
}
assert.ok(chunkedParts.length > 1, "large dump should be split across Blob parts");
assert.ok(chunkedParts.every((part) => part.length <= 256));
assert.equal(chunkedParts.join(""), expectedChunkedJson);
assert.equal(await chunkedBlob.text(), expectedChunkedJson);
assert.equal(chunkedBlob.type, "application/json");
assert.deepEqual(JSON.parse(jsonStringifyParts("🙂", { chunkChars: 1 }).join("")), "🙂");

const circular = {};
circular.self = circular;
assert.throws(() => jsonStringifyParts(circular), /circular structure/i);

globalThis.window = globalThis.window ?? {};
const recorder = createIssueRecorder();
recorder.recording = true;
const originalShift = Array.prototype.shift;
const originalSplice = Array.prototype.splice;
let frontRemovalCalls = 0;
try {
  Array.prototype.shift = function instrumentedShift(...args) {
    frontRemovalCalls += 1;
    return originalShift.apply(this, args);
  };
  Array.prototype.splice = function instrumentedSplice(start, deleteCount, ...items) {
    if (start === 0 && deleteCount > 0) {
      frontRemovalCalls += 1;
    }
    return originalSplice.call(this, start, deleteCount, ...items);
  };
  for (let index = 0; index < 20_128; index += 1) {
    recorder.record("retention.test", { index });
  }
} finally {
  Array.prototype.shift = originalShift;
  Array.prototype.splice = originalSplice;
}
assert.equal(frontRemovalCalls, 0, "saturated event retention must not copy the array front per event");
const retainedEvents = recorder.events;
assert.equal(retainedEvents.length, 20_000);
assert.equal(retainedEvents[0].seq, 129);
assert.equal(retainedEvents.at(-1).seq, 20_128);
assert.deepEqual(
  JSON.parse(JSON.stringify(retainedEvents)).map((event) => event.seq),
  retainedEvents.map((event) => event.seq),
);

console.log("issue recorder unit checks passed");
