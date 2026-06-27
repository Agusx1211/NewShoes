import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const wasmDir = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);

const archivePath = process.argv[2];
if (!archivePath) {
  console.error("usage: node tools/run_ww3d2_shipped_material_pass_smoke.mjs path/to/W3DZH.big");
  process.exit(2);
}

const smoke = require(resolve(wasmDir, "dist/ww3d2-shipped-material-pass-smoke.cjs"));

for (let attempt = 0; attempt < 100 && !smoke.calledRun; ++attempt) {
  await delay(10);
}

if (!smoke.calledRun || typeof smoke.ccall !== "function") {
  console.error("ww3d2-shipped-material-pass-smoke runtime did not initialize");
  process.exit(1);
}

const status = smoke.ccall(
  "run_ww3d2_shipped_material_pass_smoke",
  "number",
  ["string"],
  [archivePath],
);
process.exit(status);
