// Node runner for the ShatterPlanes0.w3d M4 rendering probe.
// Reads the real source-tree W3D asset on the host, copies it into the wasm
// heap, and invokes the original MeshClass::Load_W3D probe. This mirrors how
// the browser harness will eventually feed fetched asset bytes to the engine.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const wasmDir = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);

const w3dPath = process.argv[2];
if (!w3dPath) {
  console.error(
    "usage: node tools/run_ww3d2_shatterplanes_smoke.mjs path/to/ShatterPlanes0.w3d",
  );
  process.exit(2);
}

let realBytes;
try {
  realBytes = new Uint8Array(readFileSync(w3dPath));
} catch (err) {
  console.error(`could not read real W3D asset: ${w3dPath}: ${err.message}`);
  process.exit(1);
}

const smoke = require(resolve(wasmDir, "dist/ww3d2-shatterplanes-loader-smoke.cjs"));

for (let attempt = 0; attempt < 100 && !smoke.calledRun; ++attempt) {
  await delay(10);
}

if (
  !smoke.calledRun ||
  typeof smoke.ccall !== "function" ||
  typeof smoke._malloc !== "function" ||
  !smoke.HEAPU8
) {
  console.error("ww3d2-shatterplanes-loader-smoke runtime did not initialize");
  process.exit(1);
}

const ptr = smoke._malloc(realBytes.length);
if (!ptr) {
  console.error("wasm _malloc failed for asset bytes");
  process.exit(1);
}
smoke.HEAPU8.set(realBytes, ptr);

try {
  const status = smoke.ccall(
    "run_ww3d2_shatterplanes_loader_smoke",
    "number",
    ["number", "number"],
    [ptr, realBytes.length],
  );
  process.exit(status);
} finally {
  smoke._free(ptr);
}
