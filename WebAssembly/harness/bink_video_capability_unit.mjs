import assert from "node:assert/strict";
import {
  buildPreparedBinkManifest,
  loadBinkVideoManifest,
  probeBinkVideoSupport,
} from "./bink_runtime.mjs";
import { parseBrowserBinkHeader } from "./bink_transcoder.mjs";

function response(status, body, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    text: async () => body,
  };
}

const validManifest = {
  ok: true,
  payloads: [{
    sourceFile: "EA_LOGO.BIK",
    outputFile: "EA_LOGO.webm",
    frames: 96,
    width: 640,
    height: 480,
    outputDurationSeconds: 3.2,
  }],
};

const transcodeScope = {
  Worker: class {},
  WebAssembly: {},
  crypto: { subtle: { digest() {} } },
  navigator: { storage: { getDirectory() {} } },
  URL: { createObjectURL() {} },
};

const runtimeManifest = {
  schema: "cnc-zh-browser-video-runtime/v1",
  coreVersion: "0.12.10",
  coreScript: "ffmpeg-core.js",
  wasmParts: Array.from({ length: 4 }, (_, index) => ({
    name: `ffmpeg-core.wasm.part${index}`,
    bytes: 1,
    sha256: "0".repeat(64),
  })),
};

{
  const support = await probeBinkVideoSupport({
    policy: "transcode",
    scope: transcodeScope,
    fetchImpl: async () => response(200, JSON.stringify(runtimeManifest)),
  });
  assert.deepEqual(support, {
    available: true,
    payloadCount: 0,
    reason: null,
    mode: "transcode",
  });
}

{
  const support = await probeBinkVideoSupport({
    policy: "transcode",
    scope: { ...transcodeScope, Worker: undefined },
    fetchImpl: async () => { throw new Error("must not fetch without worker support"); },
  });
  assert.equal(support.available, false);
  assert.match(support.reason, /Web Workers/);
}

{
  let fetches = 0;
  const support = await probeBinkVideoSupport({
    policy: "unavailable",
    fetchImpl: async () => { fetches += 1; },
  });
  assert.equal(support.available, false);
  assert.match(support.reason, /unavailable in this hosted build/i);
  assert.equal(fetches, 0, "hosted policy must not request a manifest the deployment does not ship");
}

{
  const support = await probeBinkVideoSupport({
    policy: "auto",
    fetchImpl: async () => response(200, "<!doctype html><title>Launcher</title>", "text/html; charset=utf-8"),
  });
  assert.equal(support.available, false);
  assert.match(support.reason, /not JSON \(text\/html/i,
    "the production SPA fallback must be diagnosed instead of throwing during launch");
}

{
  const support = await probeBinkVideoSupport({
    policy: "auto",
    fetchImpl: async () => response(404, "not found", "text/plain"),
  });
  assert.equal(support.available, false);
  assert.match(support.reason, /fetch failed \(404\)/i);
}

{
  const manifest = await loadBinkVideoManifest({
    policy: "auto",
    fetchImpl: async () => response(200, JSON.stringify(validManifest)),
  });
  assert.equal(manifest.payloads.length, 1);
  const support = await probeBinkVideoSupport({
    policy: "auto",
    fetchImpl: async () => response(200, JSON.stringify(validManifest)),
  });
  assert.deepEqual(support, { available: true, payloadCount: 1, reason: null, mode: "sidecar" });
}

{
  const bytes = new Uint8Array(52);
  bytes.set([0x42, 0x49, 0x4b, 0x69]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 44, true);
  view.setUint32(8, 96, true);
  view.setUint32(16, 96, true);
  view.setUint32(20, 640, true);
  view.setUint32(24, 480, true);
  view.setUint32(28, 30, true);
  view.setUint32(32, 1, true);
  view.setUint32(40, 1, true);
  const header = parseBrowserBinkHeader(bytes, bytes.byteLength);
  assert.equal(header.signature, "BIKi");
  assert.equal(header.durationSeconds, 3.2);
  assert.equal(header.audioTracks, 1);
  const manifest = buildPreparedBinkManifest([{
    name: "EA_LOGO.BIK",
    bytes: bytes.byteLength,
    ...header,
  }]);
  assert.equal(manifest.payloads[0].preparation, "on-device");
  assert.equal(manifest.payloads[0].outputVideoCodec, "vp8");
  assert.deepEqual(manifest.payloads[0].outputAudioCodecs, ["pcm_s16le"]);
}

{
  const invalid = structuredClone(validManifest);
  invalid.payloads[0].outputFile = "EA_LOGO.bik";
  const support = await probeBinkVideoSupport({
    policy: "auto",
    fetchImpl: async () => response(200, JSON.stringify(invalid)),
  });
  assert.equal(support.available, false);
  assert.match(support.reason, /invalid payload/i);
}

console.log("Bink video capability checks passed.");
