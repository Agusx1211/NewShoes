#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "yaml";

const wasmRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(wasmRoot, "..");
const scripts = [
  "harness/bridge.js",
  "harness/d3d8_executor.mjs",
  "harness/engine_realm_boot.mjs",
  "harness/gdi_executor.mjs",
  "harness/fixtures/coi-serviceworker-18b95831.js",
  "harness/io_worker.mjs",
  "harness/issue-recorder.mjs",
  "harness/launcher-archive-specs.js",
  "harness/launcher-asset-manager.mjs",
  "harness/launcher-asset-worker.js",
  "harness/launcher-desktop-apps.js",
  "harness/launcher-entry.mjs",
  "harness/launcher-hardware-info.js",
  "harness/launcher-os-shutdown.mjs",
  "harness/launcher-retail-presentation.mjs",
  "harness/launcher.js",
  "harness/opfs_realm_files.mjs",
  "harness/pages_deployment_smoke.mjs",
  "harness/play.mjs",
  "harness/runtime-shutdown-sequence.mjs",
  "harness/save-persistence-coordinator.mjs",
  "harness/shader-tier-config.mjs",
  "harness/udp_realm_bridge.mjs",
  "harness/webrtc-udp-endpoint.mjs",
  "pages/coi-bootstrap.js",
  "pages/coi-direct.js",
  "pages/coi-serviceworker.js",
  "tools/build_pages_site.mjs",
  "tools/build_pages_runtime.sh",
  "tools/check_pages_sources.mjs",
  "tools/pages_artifact_guard_smoke.mjs",
  "tools/pages_site_manifest.mjs",
  "tools/verify_pages_site.mjs",
];

for (const script of scripts.filter((name) => !name.endsWith(".sh"))) {
  const result = spawnSync(process.execPath, ["--check", resolve(wasmRoot, script)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`Syntax check failed: ${script}`);
  }
}

for (const workflow of [
  ".github/actions/setup-wasm-build/action.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/wasm-smoke.yml",
]) {
  const source = await readFile(resolve(repoRoot, workflow), "utf8");
  const document = parse(source);
  if (!document || typeof document !== "object") throw new Error(`Invalid YAML document: ${workflow}`);
}

const serviceWorker = await readFile(resolve(wasmRoot, "pages/coi-serviceworker.js"), "utf8");
for (const contract of [
  'headers.set("Cross-Origin-Opener-Policy", COOP)',
  'headers.set("Cross-Origin-Embedder-Policy", COEP)',
  'url.origin !== self.location.origin',
  'new URL("launcher.html", scopeUrl)',
  'url.pathname === scopeUrl.pathname',
  'Response.redirect(canonicalLocation(url), 302)',
  'const WORKER_VERSION = "project-new-shoes.pages-root.v1"',
  'event.data?.type === VERSION_REQUEST',
]) {
  if (!serviceWorker.includes(contract)) throw new Error(`Isolation worker contract missing: ${contract}`);
}
if (/https?:\/\//.test(serviceWorker)) throw new Error("Isolation worker must not load a third-party runtime");

const bootstrap = await readFile(resolve(wasmRoot, "pages/coi-bootstrap.js"), "utf8");
for (const contract of [
  'const workerVersion = "project-new-shoes.pages-root.v1"',
  "await installCurrentWorker()",
  "await waitForCurrentWorker()",
  "if (destination === location.href)",
  "location.reload()",
]) {
  if (!bootstrap.includes(contract)) throw new Error(`Isolation bootstrap contract missing: ${contract}`);
}

const shell = spawnSync("bash", ["-n", resolve(wasmRoot, "tools/build_pages_runtime.sh")], { encoding: "utf8" });
if (shell.status !== 0) {
  process.stderr.write(shell.stderr || shell.stdout);
  throw new Error("Syntax check failed: tools/build_pages_runtime.sh");
}

console.log(`Checked ${scripts.length - 1} JavaScript files, 1 shell file, and 4 workflow YAML files.`);
