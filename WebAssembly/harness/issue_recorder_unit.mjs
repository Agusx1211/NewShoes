import assert from "node:assert/strict";
import {
  compactRpcResult,
  dataUrlSizeBytes,
  makeDumpId,
  redactLarge,
  sanitizeDumpFileName,
} from "./issue-recorder.mjs";

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

console.log("issue recorder unit checks passed");
