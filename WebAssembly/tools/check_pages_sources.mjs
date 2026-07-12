#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "yaml";

const wasmRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(wasmRoot, "..");
const scripts = [
  "cloudflare/coi-serviceworker.js",
  "cloudflare/retire-service-worker.js",
  "harness/analytics.mjs",
  "harness/analytics_unit.mjs",
  "harness/analytics_browser_smoke.mjs",
  "harness/bink_runtime.mjs",
  "harness/bridge.js",
  "harness/cloudflare_deployment_smoke.mjs",
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
  "harness/multiplayer_identity.mjs",
  "harness/multiplayer_launch_policy.mjs",
  "harness/network-diagnostics.mjs",
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
  "tools/build_cloudflare_site.mjs",
  "tools/build_pages_runtime.sh",
  "tools/build_trystero_bundle.mjs",
  "tools/check_pages_sources.mjs",
  "tools/cloudflare_artifact_guard_smoke.mjs",
  "tools/cloudflare_site_manifest.mjs",
  "tools/pages_artifact_guard_smoke.mjs",
  "tools/pages_site_manifest.mjs",
  "tools/verify_cloudflare_site.mjs",
  "tools/verify_pages_site.mjs",
];

for (const script of scripts.filter((name) => !name.endsWith(".sh"))) {
  const result = spawnSync(process.execPath, ["--check", resolve(wasmRoot, script)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`Syntax check failed: ${script}`);
  }
}

const workflowPaths = [
  ".github/actions/setup-wasm-build/action.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/cloudflare-pages.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/pr-preview.yml",
  ".github/workflows/wasm-smoke.yml",
];

for (const workflow of workflowPaths) {
  const source = await readFile(resolve(repoRoot, workflow), "utf8");
  const document = parse(source);
  if (!document || typeof document !== "object") throw new Error(`Invalid YAML document: ${workflow}`);
}

const pullRequestWorkflow = await readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8");
for (const contract of [
  "npm run test:cloudflare-artifact-guard",
  "npm run test:cloudflare-deployment",
  "name: cloudflare-preview-site",
  "github.event.pull_request.head.repo.full_name == github.repository",
]) {
  if (!pullRequestWorkflow.includes(contract)) throw new Error(`Pull request preview handoff missing: ${contract}`);
}

const previewWorkflow = await readFile(resolve(repoRoot, ".github/workflows/pr-preview.yml"), "utf8");
for (const contract of [
  'workflows: ["Pull request CI"]',
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "github.event.workflow_run.conclusion == 'success'",
  "name: cloudflare-pages",
  "name: cloudflare-preview-site",
  '--branch="pr-${PR_NUMBER}"',
  "transient_environment: true",
]) {
  if (!previewWorkflow.includes(contract)) throw new Error(`Trusted preview deployment contract missing: ${contract}`);
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
  "await waitForCurrentWorker(registration)",
  "const active = registration.active",
  "await serviceWorkerVersion(active) === workerVersion",
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

console.log(`Checked ${scripts.length - 1} JavaScript files, 1 shell file, and ${workflowPaths.length} workflow YAML files.`);
