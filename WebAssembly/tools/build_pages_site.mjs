#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(process.argv[2] || join(wasmRoot, "pages-dist"));
const runtimeDist = resolve(process.env.PAGES_RUNTIME_DIST
  || join(wasmRoot, "pages-build/dist-threaded-release"));

const harnessFiles = [
  "assets/brand/project-new-shoes-apple-touch.png",
  "assets/brand/project-new-shoes-icon-192.png",
  "assets/brand/project-new-shoes-icon-512.png",
  "assets/brand/project-new-shoes.ico",
  "assets/launcher-logo.webp",
  "assets/zeroh-autumn-offensive-1440p.webp",
  "assets/zeroh-autumn-offensive-swatch.webp",
  "assets/zeroh-azul-armada-1440p.webp",
  "assets/zeroh-azul-armada-swatch.webp",
  "assets/zeroh-bliss-at-war-4k.webp",
  "assets/zeroh-bliss-at-war-swatch.webp",
  "assets/zeroh-command-desert.webp",
  "assets/zeroh-red-moon-front-1440p.webp",
  "assets/zeroh-red-moon-front-swatch.webp",
  "bridge.js",
  "d3d8_executor.mjs",
  "engine_realm_boot.mjs",
  "gdi_executor.mjs",
  "harness.css",
  "io_worker.mjs",
  "issue-recorder.mjs",
  "launcher-archive-specs.js",
  "launcher-asset-manager.mjs",
  "launcher-asset-worker.js",
  "launcher-desktop-apps.js",
  "launcher-entry.mjs",
  "launcher-hardware-info.js",
  "launcher-runtime.css",
  "launcher.css",
  "launcher.js",
  "manifest.webmanifest",
  "opfs_realm_files.mjs",
  "play.mjs",
  "runtime-shutdown-sequence.mjs",
  "save-persistence-coordinator.mjs",
  "shader-tier-config.mjs",
  "udp_realm_bridge.mjs",
  "vendor",
  "webrtc-udp-endpoint.mjs",
];

async function copy(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, dereference: true, preserveTimestamps: true });
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "harness"), { recursive: true });

for (const name of ["index.html", "coi-bootstrap.js", "coi-direct.js", "coi-serviceworker.js"]) {
  await copy(join(wasmRoot, "pages", name), join(outputRoot, name));
}
for (const name of harnessFiles) {
  await copy(join(wasmRoot, "harness", name), join(outputRoot, "harness", name));
}

const playSource = await readFile(join(wasmRoot, "harness", "play.html"), "utf8");
const directBootstrap = "    <script src=\"../coi-direct.js\"></script>\n";
if (!playSource.includes("<head>")) throw new Error("play.html has no <head> element");
await writeFile(
  join(outputRoot, "harness", "play.html"),
  playSource.replace("<head>\n", `<head>\n${directBootstrap}`),
);

await copy(runtimeDist, join(outputRoot, "dist-threaded-release"));
await writeFile(join(outputRoot, ".nojekyll"), "");
console.log(outputRoot);
