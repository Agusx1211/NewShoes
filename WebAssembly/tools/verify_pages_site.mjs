#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(process.argv[2] || "pages-dist");
const forbiddenExtensions = new Set([
  ".big", ".bin", ".cab", ".cer", ".cncdump", ".crt", ".cue", ".iso", ".key", ".pem", ".pfx",
]);
const forbiddenSegments = new Set([".certs", "artifacts", "build", "node_modules", "profiles"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt", ".webmanifest"]);
const required = [
  "index.html",
  "coi-bootstrap.js",
  "coi-serviceworker.js",
  "harness/play.html",
  "harness/bridge.js",
  "dist-threaded-release/cnc-port.js",
  "dist-threaded-release/cnc-port.wasm",
  "dist-threaded-release/cnc-port.worker.js",
];
const findings = [];
const inventory = [];
let totalBytes = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const name = relative(root, path).replaceAll("\\", "/");
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      findings.push(`${name}: symbolic links are not allowed in Pages artifacts`);
      continue;
    }
    if (entry.isDirectory()) {
      if (name.split("/").some((segment) => forbiddenSegments.has(segment))) {
        findings.push(`${name}: forbidden directory`);
      }
      await walk(path);
      continue;
    }
    if (!entry.isFile()) continue;
    totalBytes += stat.size;
    inventory.push({ name, bytes: stat.size });
    if (forbiddenExtensions.has(extname(name).toLowerCase())) findings.push(`${name}: forbidden file type`);
    const bytes = await readFile(path);
    for (const marker of ["-----BEGIN PRIVATE KEY-----", "/Users/", "C:\\Users\\", "/tmp/cnc-captures", "agusx1211"]) {
      if (bytes.includes(Buffer.from(marker))) findings.push(`${name}: contains private or build path marker ${marker}`);
    }
    // Emscripten's virtual filesystem intentionally uses /home/web_user.
    // Reject every other Unix home path, including compiler-expanded __FILE__
    // strings from a developer or Actions checkout.
    if (bytes.toString("latin1").replaceAll("/home/web_user", "").includes("/home/")) {
      findings.push(`${name}: contains an absolute host home path`);
    }
    if (textExtensions.has(extname(name).toLowerCase()) && stat.size <= 2 * 1024 * 1024) {
      const text = bytes.toString("utf8");
      if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)) findings.push(`${name}: contains an AWS-style access key`);
    }
  }
}

await walk(root);
for (const name of required) {
  try { await lstat(resolve(root, name)); } catch { findings.push(`${name}: required file is missing`); }
}
if (totalBytes > 250 * 1024 * 1024) findings.push(`artifact is unexpectedly large: ${totalBytes} bytes`);

inventory.sort((a, b) => a.name.localeCompare(b.name));
console.log(JSON.stringify({ root, files: inventory.length, totalBytes, inventory }, null, 2));
if (findings.length) {
  for (const finding of findings) console.error(`ERROR: ${finding}`);
  process.exitCode = 1;
}
