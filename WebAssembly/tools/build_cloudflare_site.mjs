#!/usr/bin/env node

import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { CLOUDFLARE_OUTPUT_FILES } from "./cloudflare_site_manifest.mjs";
import { PAGES_OUTPUT_FILES } from "./pages_site_manifest.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const inputRoot = resolve(process.argv[2] || resolve(wasmRoot, "pages-dist"));
const outputRoot = resolve(process.argv[3] || resolve(wasmRoot, "cloudflare-dist"));

function inside(parent, child) {
  const name = relative(parent, child);
  return name === "" || (!name.startsWith("..") && !name.startsWith(sep));
}

async function inventory(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (!inside(root, path)) throw new Error(`Artifact path escaped its root: ${path}`);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Artifact inputs must not contain symlinks: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
      else throw new Error(`Artifact inputs must be regular files: ${path}`);
    }
  }
  await walk(root);
  return files.sort();
}

const actualInput = await inventory(inputRoot);
const expectedInput = [...PAGES_OUTPUT_FILES].sort();
if (JSON.stringify(actualInput) !== JSON.stringify(expectedInput)) {
  throw new Error("Cloudflare packaging requires an exact verified GitHub Pages staging artifact");
}

await rm(outputRoot, { recursive: true, force: true });

const directBootstrap = '    <script src="../coi-direct.js"></script>\n';
const retirementBootstrap = '    <script defer src="../retire-service-worker.js"></script>\n';
const launcherTemplate = await readFile(resolve(inputRoot, "launcher.html"), "utf8");
if (!launcherTemplate.includes(directBootstrap)) {
  throw new Error("The Pages launcher has no removable isolation-direct bootstrap");
}

const headers = `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()
  Cache-Control: public, max-age=0, must-revalidate
`;
const redirects = `/launcher.html / 302
/harness/play.html / 302
`;

for (const name of CLOUDFLARE_OUTPUT_FILES) {
  const destination = resolve(outputRoot, name);
  await mkdir(dirname(destination), { recursive: true });
  if (name === "index.html") {
    await writeFile(destination, launcherTemplate.replace(directBootstrap, retirementBootstrap));
  } else if (name === "_headers") {
    await writeFile(destination, headers);
  } else if (name === "_redirects") {
    await writeFile(destination, redirects);
  } else if (name === "coi-serviceworker.js" || name === "retire-service-worker.js") {
    await copyFile(resolve(wasmRoot, "cloudflare", name), destination);
  } else {
    const source = resolve(inputRoot, name);
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Cloudflare input must be a regular non-symlink file: ${source}`);
    }
    await copyFile(source, destination);
  }
}

console.log(outputRoot);
