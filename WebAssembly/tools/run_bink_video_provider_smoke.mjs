#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv.length < 4) {
  console.error(
    "usage: node tools/run_bink_video_provider_smoke.mjs " +
      "artifacts/real-assets/GC_Background.bik artifacts/real-assets/VS_small.bik",
  );
  console.error("Run npm run extract:runtime-archives first if the files are missing.");
  process.exit(1);
}

const gcPath = resolve(process.cwd(), process.argv[2]);
const vsPath = resolve(process.cwd(), process.argv[3]);
for (const path of [gcPath, vsPath]) {
  if (!existsSync(path)) {
    console.error(`Bink payload not found: ${path}`);
    console.error("Run npm run extract:runtime-archives first.");
    process.exit(1);
  }
}

const smoke = require(resolve(wasmDir, "dist/bink-video-provider-smoke.cjs"));
for (let attempt = 0; attempt < 100 && !smoke.calledRun; ++attempt) {
  await new Promise((resolveAttempt) => setTimeout(resolveAttempt, 10));
}

if (!smoke.calledRun || typeof smoke.ccall !== "function") {
  console.error("bink-video-provider-smoke runtime did not initialize");
  process.exit(1);
}

const status = smoke.ccall(
  "run_bink_video_provider_smoke",
  "number",
  ["string", "string"],
  [gcPath, vsPath],
);
process.exit(status);
