#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "yaml";
import { readReleaseMetadata } from "./release_metadata.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(wasmRoot, "..");
const scripts = [
  "cloudflare/coi-serviceworker.js",
  "cloudflare/retire-service-worker.js",
  "harness/analytics.mjs",
  "harness/analytics_unit.mjs",
  "harness/analytics_browser_smoke.mjs",
  "harness/agent_resources_smoke.mjs",
  "harness/bink_direct_decoder_browser_smoke.mjs",
  "harness/bink_decode_worker.mjs",
  "harness/bink_decoder.mjs",
  "harness/bink_direct_runtime.mjs",
  "harness/bink_runtime.mjs",
  "harness/clickteam-installer.mjs",
  "harness/clickteam-installer_unit.mjs",
  "harness/bink_video_capability_unit.mjs",
  "harness/bridge.js",
  "harness/agent_bridge.mjs",
  "harness/agent_bridge_browser_smoke.mjs",
  "harness/agent_bridge_unit.mjs",
  "harness/camera-zoom-config.mjs",
  "harness/camera_zoom_browser_smoke.mjs",
  "harness/camera_zoom_config_unit.mjs",
  "harness/camera_zoom_runtime_smoke.mjs",
  "harness/cursor-style-config.mjs",
  "harness/cursor_style_config_unit.mjs",
  "harness/cloudflare_deployment_smoke.mjs",
  "harness/crash-diagnostics.mjs",
  "harness/d3d8_executor.mjs",
  "harness/device-transfer-protocol.mjs",
  "harness/device_transfer_browser_smoke.mjs",
  "harness/device_transfer_protocol_unit.mjs",
  "harness/display-resolution.mjs",
  "harness/display_resolution_unit.mjs",
  "harness/engine_realm_boot.mjs",
  "harness/gdi_executor.mjs",
  "harness/game-data-store.mjs",
  "harness/game-data-store_unit.mjs",
  "harness/fixtures/coi-serviceworker-18b95831.js",
  "harness/io_worker.mjs",
  "harness/issue-recorder.mjs",
  "harness/launcher-archive-specs.js",
  "harness/launcher-asset-manager.mjs",
  "harness/launcher-asset-worker.js",
  "harness/launcher-build-info.js",
  "harness/launcher-desktop-apps.js",
  "harness/launcher-device-transfer.mjs",
  "harness/launcher-entry.mjs",
  "harness/launcher-file-collector.mjs",
  "harness/launcher_file_collector_unit.mjs",
  "harness/launcher-games.mjs",
  "harness/launcher_games_browser_smoke.mjs",
  "harness/launcher-hardware-info.js",
  "harness/launcher-os-shutdown.mjs",
  "harness/launcher-retail-presentation.mjs",
  "harness/launcher.js",
  "harness/multiplayer_identity.mjs",
  "harness/multiplayer_launch_policy.mjs",
  "harness/multiplayer-network-status.mjs",
  "harness/mod-context.mjs",
  "harness/mod-context_unit.mjs",
  "harness/mod-manager-ui.mjs",
  "harness/mod-package-format.mjs",
  "harness/mod-package-format_unit.mjs",
  "harness/mod-package-store.mjs",
  "harness/mod-package-store_unit.mjs",
  "harness/mod-package-worker.mjs",
  "harness/mod_manager_browser_smoke.mjs",
  "harness/mod_real_package_smoke.mjs",
  "harness/network-diagnostics.mjs",
  "harness/original-cursor-assets.mjs",
  "harness/original_cursor_assets_unit.mjs",
  "harness/opfs_realm_files.mjs",
  "harness/pages_deployment_smoke.mjs",
  "harness/play.mjs",
  "harness/replay-file-store.mjs",
  "harness/replay_desktop_transfer_smoke.mjs",
  "harness/runtime-shutdown-sequence.mjs",
  "harness/save-persistence-coordinator.mjs",
  "harness/shader-tier-config.mjs",
  "harness/udp_realm_bridge.mjs",
  "harness/transfer-user-data-store.mjs",
  "harness/transfer_user_data_store_unit.mjs",
  "harness/webrtc-udp-endpoint.mjs",
  "pages/coi-bootstrap.js",
  "pages/coi-direct.js",
  "pages/coi-serviceworker.js",
  "tools/build_pages_site.mjs",
  "tools/build_seek_bzip_bundle.mjs",
  "tools/build_bink_decoder.mjs",
  "tools/build_cloudflare_site.mjs",
  "tools/build_pages_runtime.sh",
  "tools/build_trystero_bundle.mjs",
  "tools/seek_bzip_buffer_shim.mjs",
  "tools/check_pages_sources.mjs",
  "tools/cloudflare_artifact_guard_smoke.mjs",
  "tools/cloudflare_site_manifest.mjs",
  "tools/pages_artifact_guard_smoke.mjs",
  "tools/pages_site_manifest.mjs",
  "tools/public_project_content.mjs",
  "tools/public_project_content_unit.mjs",
  "tools/release_metadata.mjs",
  "tools/release_metadata_unit.mjs",
  "tools/verify_crash_diagnostics_zero_overhead.mjs",
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
  ".github/workflows/public-project-content.yml",
  ".github/workflows/wasm-smoke.yml",
];

for (const workflow of workflowPaths) {
  const source = await readFile(resolve(repoRoot, workflow), "utf8");
  const document = parse(source);
  if (!document || typeof document !== "object") throw new Error(`Invalid YAML document: ${workflow}`);
}

const buildWorkflow = await readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8");
for (const contract of [
  "branches: [dev]",
  "npm run test:cloudflare-artifact-guard",
  "npm run test:cloudflare-deployment",
  "name: cloudflare-preview-site",
  "github.event_name != 'pull_request'",
  "github.event.pull_request.head.repo.full_name == github.repository",
]) {
  if (!buildWorkflow.includes(contract)) throw new Error(`Trusted Cloudflare artifact handoff missing: ${contract}`);
}

const freshnessWorkflow = await readFile(resolve(repoRoot, ".github/workflows/public-project-content.yml"), "utf8");
for (const contract of [
  "schedule:",
  "workflow_dispatch:",
  "npm run test:public-project-content",
  "permissions:\n  contents: read",
]) {
  if (!freshnessWorkflow.includes(contract)) throw new Error(`Public project freshness workflow missing: ${contract}`);
}

const previewWorkflow = await readFile(resolve(repoRoot, ".github/workflows/pr-preview.yml"), "utf8");
for (const contract of [
  'workflows: ["Pull request CI"]',
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "github.event.workflow_run.conclusion == 'success'",
  "name: cloudflare-pages",
  "name: cloudflare-preview-site",
  '.base.ref == $base or .base.ref == "dev"',
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.event == 'workflow_dispatch'",
  "github.event.workflow_run.head_branch == 'dev'",
  '"repos/${GITHUB_REPOSITORY}/git/ref/heads/dev"',
  'https://dev.newshoes.gg/',
  'echo "branch=dev"',
  'echo "environment=cloudflare-pages-dev"',
  'echo "transient=false"',
  'echo "branch=pr-${pr_number}"',
  'echo "environment=pr-${pr_number}"',
  'echo "transient=true"',
  '--argjson transient "${DEPLOYMENT_TRANSIENT}"',
  "transient_environment: $transient",
  "production_environment: false",
  '--branch="${DEPLOYMENT_BRANCH}"',
]) {
  if (!previewWorkflow.includes(contract)) throw new Error(`Trusted Cloudflare deployment contract missing: ${contract}`);
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

await readReleaseMetadata(repoRoot);

console.log(`Checked ${scripts.length - 1} JavaScript files, 1 shell file, and ${workflowPaths.length} workflow YAML files.`);
