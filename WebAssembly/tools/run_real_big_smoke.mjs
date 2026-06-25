import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const wasmDir = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);

const archivePath = process.argv[2];
if (!archivePath) {
  console.error("usage: node tools/run_real_big_smoke.mjs path/to/INIZH.big");
  process.exit(2);
}

const smoke = require(resolve(wasmDir, "dist/gameengine-real-big-smoke.cjs"));

for (let attempt = 0; attempt < 100 && !smoke.calledRun; ++attempt) {
  await delay(10);
}

if (!smoke.calledRun || typeof smoke.ccall !== "function") {
  console.error("gameengine-real-big-smoke runtime did not initialize");
  process.exit(1);
}

const status = smoke.ccall("run_real_big_smoke", "number", ["string"], [archivePath]);
process.exit(status);
