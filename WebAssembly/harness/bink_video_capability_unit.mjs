import assert from "node:assert/strict";
import {
  loadBinkVideoManifest,
  probeBinkVideoSupport,
} from "./bink_runtime.mjs";

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
  assert.deepEqual(support, { available: true, payloadCount: 1, reason: null });
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
