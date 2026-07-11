#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { PAGES_OUTPUT_FILES } from "./pages_site_manifest.mjs";

const root = resolve(process.argv[2] || "pages-dist");
const forbiddenExtensions = new Set([
  ".big", ".bin", ".cab", ".cer", ".cncdump", ".crt", ".cue", ".iso", ".key", ".pem", ".pfx",
]);
const forbiddenSegments = new Set([".certs", "artifacts", "build", "node_modules", "profiles"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".txt", ".webmanifest"]);
const expectedFiles = new Set(PAGES_OUTPUT_FILES);
const expectedDirectories = new Set([""]);
for (const name of expectedFiles) {
  let parent = dirname(name).replaceAll("\\", "/");
  while (parent !== "." && !expectedDirectories.has(parent)) {
    expectedDirectories.add(parent);
    parent = dirname(parent).replaceAll("\\", "/");
  }
}
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
      if (!expectedDirectories.has(name)) findings.push(`${name}: directory is not in the exact Pages allowlist`);
      if (name.split("/").some((segment) => forbiddenSegments.has(segment))) findings.push(`${name}: forbidden directory`);
      await walk(path);
      continue;
    }
    if (!entry.isFile()) {
      findings.push(`${name}: artifact entries must be regular files`);
      continue;
    }
    totalBytes += stat.size;
    inventory.push({ name, bytes: stat.size });
    if (!expectedFiles.has(name)) findings.push(`${name}: file is not in the exact Pages allowlist`);
    if (forbiddenExtensions.has(extname(name).toLowerCase())) findings.push(`${name}: forbidden file type`);
    const bytes = await readFile(path);
    for (const marker of ["-----BEGIN PRIVATE KEY-----", "/Users/", "C:\\Users\\", "/tmp/cnc-captures", "agusx1211"]) {
      if (bytes.includes(Buffer.from(marker))) findings.push(`${name}: contains private or build path marker ${marker}`);
    }
    if (bytes.toString("latin1").replaceAll("/home/web_user", "").includes("/home/")) {
      findings.push(`${name}: contains an absolute host home path`);
    }
    if (textExtensions.has(extname(name).toLowerCase()) && stat.size <= 2 * 1024 * 1024) {
      const text = bytes.toString("utf8");
      if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)) findings.push(`${name}: contains an AWS-style access key`);
    }
  }
}

function moduleReferences(text, extension) {
  const references = [];
  if (extension === ".html") {
    for (const match of text.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      references.push(match[1]);
    }
    return references;
  }
  for (const match of text.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g)) references.push(match[1]);
  for (const match of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) references.push(match[1]);
  for (const call of text.matchAll(/\bimportScripts\(([^)]*)\)/g)) {
    for (const match of call[1].matchAll(/["']([^"']+)["']/g)) references.push(match[1]);
  }
  return references;
}

async function verifyStaticModuleReferences() {
  for (const { name } of inventory) {
    const extension = extname(name).toLowerCase();
    if (!new Set([".html", ".js", ".mjs"]).has(extension)) continue;
    const text = await readFile(resolve(root, name), "utf8");
    for (const reference of moduleReferences(text, extension)) {
      if (!reference.startsWith(".")) continue;
      const target = resolve(root, dirname(name), reference.split(/[?#]/, 1)[0]);
      const targetName = relative(root, target).replaceAll("\\", "/");
      if (targetName.startsWith("../") || !expectedFiles.has(targetName)) {
        findings.push(`${name}: unresolved static module import ${reference}`);
      }
    }
  }
}

await walk(root);
const actualFiles = new Set(inventory.map(({ name }) => name));
for (const name of expectedFiles) {
  if (!actualFiles.has(name)) findings.push(`${name}: allowlisted file is missing`);
}
await verifyStaticModuleReferences();
if (totalBytes > 250 * 1024 * 1024) findings.push(`artifact is unexpectedly large: ${totalBytes} bytes`);

const [license, index, legal, play] = await Promise.all([
  readFile(resolve(root, "LICENSE.md"), "utf8").catch(() => ""),
  readFile(resolve(root, "index.html"), "utf8").catch(() => ""),
  readFile(resolve(root, "legal.html"), "utf8").catch(() => ""),
  readFile(resolve(root, "harness/play.html"), "utf8").catch(() => ""),
]);
const analytics = await readFile(resolve(root, "harness/analytics.mjs"), "utf8").catch(() => "");
if (analytics.includes("__GA_MEASUREMENT_ID__")) findings.push("harness/analytics.mjs: unresolved analytics configuration marker");
for (const match of analytics.matchAll(/\bG-[A-Z0-9]+\b/g)) {
  if (!/^G-[A-Z0-9]+$/.test(match[0])) findings.push("harness/analytics.mjs: invalid generated measurement ID");
}
if (!license.includes("ADDITIONAL TERMS per GNU GPL Section 7") || !license.includes("Disclaimer of Warranty")) {
  findings.push("LICENSE.md: complete GPLv3 license and additional terms are missing");
}
if (!index.includes("No warranty") || !index.includes("./legal.html")) findings.push("index.html: visible legal notice is missing");
if (!legal.includes("absolutely no warranty") || !legal.includes("Corresponding source") || legal.includes("__PAGES_SOURCE_URL__")) {
  findings.push("legal.html: no-warranty, source, or resolved legal notice is missing");
}
if (!play.includes('id="publicLegalNotice"') || !play.includes("Corresponding source")) {
  findings.push("harness/play.html: launcher About legal notice is missing");
}

inventory.sort((a, b) => a.name.localeCompare(b.name));
console.log(JSON.stringify({ root, files: inventory.length, totalBytes, inventory }, null, 2));
if (findings.length) {
  for (const finding of [...new Set(findings)]) console.error(`ERROR: ${finding}`);
  process.exitCode = 1;
}
