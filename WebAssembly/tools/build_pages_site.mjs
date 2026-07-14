#!/usr/bin/env node

import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAGES_HARNESS_FILES,
  PAGES_DEPENDENCY_FILES,
  PAGES_RUNTIME_FILES,
  PAGES_TEMPLATE_FILES,
} from "./pages_site_manifest.mjs";
import { createBuildInfo, readReleaseMetadata } from "./release_metadata.mjs";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(wasmRoot, "..");
const outputRoot = resolve(process.argv[2] || join(wasmRoot, "pages-dist"));
const runtimeDist = resolve(process.env.PAGES_RUNTIME_DIST
  || join(wasmRoot, "pages-build/dist-threaded-release"));
const defaultSourceUrl = "https://github.com/Agusx1211/NewShoes";
const sourceUrl = String(process.env.PAGES_SOURCE_URL || defaultSourceUrl);
const requestedMeasurementId = String(process.env.GA_MEASUREMENT_ID || "").trim();
const measurementId = /^G-[A-Z0-9]+$/.test(requestedMeasurementId) ? requestedMeasurementId : "";
if (requestedMeasurementId && !measurementId) {
  console.warn("GA_MEASUREMENT_ID is invalid; analytics will be disabled in this artifact.");
}

if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:tree|commit)\/[A-Fa-f0-9]+)?\/?$/.test(sourceUrl)) {
  throw new Error(`PAGES_SOURCE_URL must be a GitHub repository or revision URL: ${sourceUrl}`);
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function copyRegularFile(source, destination) {
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Pages input must be a regular non-symlink file: ${source}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

function gitOutput(args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    timeout: 5000,
  }).trimEnd();
}

async function assertExactRuntimeDirectory() {
  const rootInfo = await lstat(runtimeDist);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`Runtime output must be a regular non-symlink directory: ${runtimeDist}`);
  }
  const entries = await readdir(runtimeDist, { withFileTypes: true });
  const actual = entries.map((entry) => entry.name).sort();
  const expected = [...PAGES_RUNTIME_FILES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Runtime directory must contain exactly ${expected.join(", ")}; found ${actual.join(", ")}`);
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Runtime artifact must be a regular non-symlink file: ${entry.name}`);
    }
  }
}

await assertExactRuntimeDirectory();
await rm(outputRoot, { recursive: true, force: true });

for (const name of PAGES_TEMPLATE_FILES) {
  const source = join(wasmRoot, "pages", name);
  const destination = join(outputRoot, name);
  if (name.endsWith(".html")) {
    const template = await readFile(source, "utf8");
    if (!template.includes("__PAGES_SOURCE_URL__")) {
      throw new Error(`${name} must expose the corresponding-source URL`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, template.replaceAll("__PAGES_SOURCE_URL__", escapeHtml(sourceUrl)));
  } else {
    await copyRegularFile(source, destination);
  }
}

for (const name of PAGES_HARNESS_FILES) {
  const source = join(wasmRoot, "harness", name);
  const destination = join(outputRoot, "harness", name);
  if (name === "analytics.mjs") {
    const template = await readFile(source, "utf8");
    if (!template.includes("__GA_MEASUREMENT_ID__")) {
      throw new Error("analytics.mjs has no measurement-ID injection marker");
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, template.replaceAll("__GA_MEASUREMENT_ID__", measurementId));
  } else if (name === "mod-package-worker.mjs") {
    const sourceText = await readFile(source, "utf8");
    const developmentRoot = "../node_modules/7z-wasm/";
    if (!sourceText.includes(developmentRoot)) {
      throw new Error("mod-package-worker.mjs has no development 7z-wasm path marker");
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, sourceText.replaceAll(developmentRoot, "./vendor/7z-wasm/"));
  } else {
    await copyRegularFile(source, destination);
  }
}

for (const name of PAGES_DEPENDENCY_FILES) {
  await copyRegularFile(
    join(wasmRoot, "node_modules/7z-wasm", basename(name)),
    join(outputRoot, name),
  );
}

const release = await readReleaseMetadata(repoRoot);
const requestedCommit = String(process.env.PAGES_BUILD_COMMIT || "").trim();
const buildCommit = requestedCommit || gitOutput(["rev-parse", "HEAD"]);
if (!/^[a-f0-9]{40}$/i.test(buildCommit)) {
  throw new Error(`PAGES_BUILD_COMMIT must be a full Git commit hash: ${buildCommit}`);
}
const buildStatus = gitOutput(["status", "--short"]);
const buildInfo = createBuildInfo({
  release,
  commit: buildCommit,
  branch: gitOutput(["branch", "--show-current"]),
  describe: gitOutput(["describe", "--always", "--dirty", "--tags"]),
  dirty: buildStatus !== "",
  status: buildStatus ? buildStatus.split("\n").slice(0, 200) : [],
});
await mkdir(join(outputRoot, "harness"), { recursive: true });
await writeFile(join(outputRoot, "harness", "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);

const playSource = await readFile(join(wasmRoot, "harness", "play.html"), "utf8");
const directBootstrap = "    <script src=\"../coi-direct.js\"></script>\n";
const legacyDocumentHead = `    <link rel="canonical" href="../">\n${directBootstrap}`;
const rootDocumentHead = [
  "    <base href=\"./harness/\">",
  "    <link rel=\"canonical\" href=\"../\">",
  directBootstrap.trimEnd(),
  "",
].join("\n");
const aboutLegalPattern = /<p class="about-legal">[\s\S]*?<\/p>/;
const legalNotice = `<p class="about-legal" id="publicLegalNotice" style="font-size:9px;line-height:1.55;color:#536b78">Modified browser port, 2026. Copyright © Electronic Arts Inc. and Project New Shoes contributors. This GPLv3 software comes with absolutely no warranty. <a href="../legal.html">License and notices</a> · <a href="${escapeHtml(sourceUrl)}">Corresponding source</a></p>`;
if (!playSource.includes("<head>")) throw new Error("play.html has no <head> element");
if (!aboutLegalPattern.test(playSource)) throw new Error("play.html has no About legal-notice surface");
await mkdir(join(outputRoot, "harness"), { recursive: true });
await writeFile(
  join(outputRoot, "harness", "play.html"),
  playSource
    .replace("<head>\n", `<head>\n${legacyDocumentHead}`)
    .replace(aboutLegalPattern, legalNotice),
);
await writeFile(
  join(outputRoot, "launcher.html"),
  playSource
    .replace("<head>\n", `<head>\n${rootDocumentHead}`)
    .replace('href="./manifest.webmanifest"', 'href="../manifest.webmanifest"')
    .replace(aboutLegalPattern, legalNotice),
);

const harnessManifest = JSON.parse(await readFile(join(wasmRoot, "harness", "manifest.webmanifest"), "utf8"));
const rootManifest = {
  ...harnessManifest,
  start_url: "./",
  scope: "./",
  icons: harnessManifest.icons.map((icon) => ({
    ...icon,
    src: `./harness/${String(icon.src).replace(/^\.\//, "")}`,
  })),
};
await writeFile(join(outputRoot, "manifest.webmanifest"), `${JSON.stringify(rootManifest, null, 2)}\n`);

for (const name of PAGES_RUNTIME_FILES) {
  await copyRegularFile(join(runtimeDist, name), join(outputRoot, "dist-threaded-release", name));
}
await copyRegularFile(join(repoRoot, "LICENSE.md"), join(outputRoot, "LICENSE.md"));
await writeFile(join(outputRoot, ".nojekyll"), "");
console.log(outputRoot);
