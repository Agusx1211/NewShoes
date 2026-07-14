import assert from "node:assert/strict";
import {
  compactRpcResult,
  dataUrlSizeBytes,
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

console.log("issue recorder unit checks passed");
