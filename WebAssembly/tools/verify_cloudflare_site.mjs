#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, relative, resolve } from "node:path";
import { CLOUDFLARE_OUTPUT_FILES } from "./cloudflare_site_manifest.mjs";
import { validateBuildInfo } from "./release_metadata.mjs";

const root = resolve(process.argv[2] || "cloudflare-dist");
const expectedFiles = new Set(CLOUDFLARE_OUTPUT_FILES);
const expectedDirectories = new Set([""]);
const forbiddenExtensions = new Set([".big", ".bin", ".cab", ".cer", ".cncdump", ".crt", ".cue", ".iso", ".key", ".pem", ".pfx"]);
const forbiddenSegments = new Set([".certs", ".wrangler", "artifacts", "build", "node_modules", "profiles"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".txt", ".webmanifest", ""]);
const findings = [];
const inventory = [];
let totalBytes = 0;

for (const name of expectedFiles) {
  let parent = dirname(name).replaceAll("\\", "/");
  while (parent !== "." && !expectedDirectories.has(parent)) {
    expectedDirectories.add(parent);
    parent = dirname(parent).replaceAll("\\", "/");
  }
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const name = relative(root, path).replaceAll("\\", "/");
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      findings.push(`${name}: symbolic links are not allowed in Cloudflare artifacts`);
      continue;
    }
    if (entry.isDirectory()) {
      if (!expectedDirectories.has(name)) findings.push(`${name}: directory is not in the exact Cloudflare allowlist`);
      if (name.split("/").some((segment) => forbiddenSegments.has(segment))) findings.push(`${name}: forbidden directory`);
      await walk(path);
      continue;
    }
    if (!entry.isFile()) {
      findings.push(`${name}: artifact entries must be regular files`);
      continue;
    }
    inventory.push({ name, bytes: info.size });
    totalBytes += info.size;
    if (!expectedFiles.has(name)) findings.push(`${name}: file is not in the exact Cloudflare allowlist`);
    if (info.size > 25 * 1024 * 1024) findings.push(`${name}: exceeds Cloudflare Pages' 25 MiB per-file limit`);
    if (forbiddenExtensions.has(extname(name).toLowerCase())) findings.push(`${name}: forbidden file type`);
    const bytes = await readFile(path);
    for (const marker of ["-----BEGIN PRIVATE KEY-----", "/Users/", "C:\\Users\\", "/tmp/cnc-captures", "agusx1211"]) {
      if (bytes.includes(Buffer.from(marker))) findings.push(`${name}: contains private or build path marker ${marker}`);
    }
    if (bytes.toString("latin1").replaceAll("/home/web_user", "").includes("/home/")) {
      findings.push(`${name}: contains an absolute host home path`);
    }
    if (textExtensions.has(extname(name).toLowerCase()) && info.size <= 2 * 1024 * 1024) {
      const text = bytes.toString("utf8");
      if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)) findings.push(`${name}: contains an AWS-style access key`);
    }
  }
}

function moduleReferences(text, extension) {
  const references = [];
  if (extension === ".html") {
    for (const match of text.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) references.push(match[1]);
    return references;
  }
  for (const match of text.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g)) references.push(match[1]);
  for (const match of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) references.push(match[1]);
  for (const call of text.matchAll(/\bimportScripts\(([^)]*)\)/g)) {
    for (const match of call[1].matchAll(/["']([^"']+)["']/g)) references.push(match[1]);
  }
  return references;
}

async function verifyVideoRuntime() {
  try {
    const runtimeRoot = resolve(root, "video-runtime");
    const manifest = JSON.parse(await readFile(resolve(runtimeRoot, "bink-decoder-manifest.json"), "utf8"));
    if (manifest.schema !== "cnc-zh-bink-decoder-runtime/v1"
        || manifest.abiVersion !== 1
        || manifest.wasmFile !== "bink-decoder.wasm"
        || !(manifest.wasmBytes > 0) || manifest.wasmBytes > 128 * 1024
        || manifest.maxWasmBytes !== 128 * 1024
        || !/^[a-f0-9]{64}$/.test(String(manifest.wasmSha256))) {
      findings.push("video-runtime: decoder manifest contract is invalid");
      return;
    }
    const bytes = await readFile(resolve(runtimeRoot, manifest.wasmFile));
    if (bytes.byteLength !== manifest.wasmBytes
        || createHash("sha256").update(bytes).digest("hex") !== manifest.wasmSha256) {
      findings.push("video-runtime: decoder failed integrity validation");
    }
  } catch (error) {
    findings.push(`video-runtime: decoder packaging is unreadable (${error?.message ?? String(error)})`);
  }
}

await walk(root);
const actualFiles = new Set(inventory.map(({ name }) => name));
for (const name of expectedFiles) if (!actualFiles.has(name)) findings.push(`${name}: allowlisted file is missing`);
await verifyVideoRuntime();

for (const { name } of inventory) {
  const extension = extname(name).toLowerCase();
  if (![".html", ".js", ".mjs"].includes(extension)) continue;
  const text = await readFile(resolve(root, name), "utf8");
  let referenceBase = resolve(root, dirname(name));
  if (extension === ".html") {
    const baseHref = text.match(/<base\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
    if (baseHref?.startsWith(".")) referenceBase = resolve(referenceBase, baseHref.split(/[?#]/, 1)[0]);
  }
  for (const reference of moduleReferences(text, extension)) {
    if (!reference.startsWith(".")) continue;
    const targetName = relative(root, resolve(referenceBase, reference.split(/[?#]/, 1)[0])).replaceAll("\\", "/");
    if (targetName.startsWith("../") || !expectedFiles.has(targetName)) findings.push(`${name}: unresolved static module import ${reference}`);
  }
}

const [index, headers, redirects, license, legal, manifestText, analytics, retirementWorker, retirementBootstrap, buildInfoText] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8").catch(() => ""),
  readFile(resolve(root, "_headers"), "utf8").catch(() => ""),
  readFile(resolve(root, "_redirects"), "utf8").catch(() => ""),
  readFile(resolve(root, "LICENSE.md"), "utf8").catch(() => ""),
  readFile(resolve(root, "legal.html"), "utf8").catch(() => ""),
  readFile(resolve(root, "manifest.webmanifest"), "utf8").catch(() => ""),
  readFile(resolve(root, "harness/analytics.mjs"), "utf8").catch(() => ""),
  readFile(resolve(root, "coi-serviceworker.js"), "utf8").catch(() => ""),
  readFile(resolve(root, "retire-service-worker.js"), "utf8").catch(() => ""),
  readFile(resolve(root, "harness/build-info.json"), "utf8").catch(() => ""),
]);

for (const contract of [
  "Cross-Origin-Opener-Policy: same-origin",
  "Cross-Origin-Embedder-Policy: require-corp",
  "Cross-Origin-Resource-Policy: same-origin",
]) if (!headers.includes(contract)) findings.push(`_headers: missing ${contract}`);
for (const contract of ["/launcher.html / 302", "/harness/play.html / 302"]) {
  if (!redirects.includes(contract)) findings.push(`_redirects: missing ${contract}`);
}
if (!index.includes('<base href="./harness/">')
    || !index.includes('rel="canonical" href="../"')
    || !index.includes("data-cnc-play-page")
    || !index.includes('data-bink-video-sidecars="direct"')
    || !index.includes('id="publicLegalNotice"')) {
  findings.push("index.html: direct root launcher contract is incomplete");
}
if (/coi-(?:bootstrap|direct)/.test(index) || !index.includes('src="../retire-service-worker.js"')) {
  findings.push("index.html: direct launcher isolation or worker-retirement contract is invalid");
}
for (const forbidden of ["coi-bootstrap.js", "coi-direct.js", "launcher.html", "harness/play.html"]) {
  if (actualFiles.has(forbidden)) findings.push(`${forbidden}: GitHub Pages compatibility file must not ship to Cloudflare`);
}
if (!retirementWorker.includes("self.registration.unregister()")
    || !retirementWorker.includes("self.clients.claim()")
    || !retirementWorker.includes("client.navigate(client.url)")
    || retirementWorker.includes('addEventListener("fetch"')) {
  findings.push("coi-serviceworker.js: one-time legacy-worker retirement contract is invalid");
}
if (!retirementBootstrap.includes("navigator.serviceWorker.controller")
    || !retirementBootstrap.includes("registration?.update()")) {
  findings.push("retire-service-worker.js: controlled-client update trigger is invalid");
}
if (!license.includes("ADDITIONAL TERMS per GNU GPL Section 7") || !license.includes("Disclaimer of Warranty")) findings.push("LICENSE.md: complete license is missing");
if (!legal.includes("absolutely no warranty") || !legal.includes("Corresponding source")
    || !legal.includes("bink-decoder-SOURCE.txt") || legal.includes("__PAGES_SOURCE_URL__")) findings.push("legal.html: resolved legal/source notice is missing");
if (analytics.includes("__GA_MEASUREMENT_ID__")) findings.push("harness/analytics.mjs: unresolved analytics marker");
for (const match of analytics.matchAll(/\bG-[A-Z0-9]+\b/g)) if (!/^G-[A-Z0-9]+$/.test(match[0])) findings.push("harness/analytics.mjs: invalid generated measurement ID");
try {
  validateBuildInfo(JSON.parse(buildInfoText));
} catch {
  findings.push("harness/build-info.json: version, commit, or changelog metadata is invalid");
}
try {
  const manifest = JSON.parse(manifestText);
  if (manifest.start_url !== "./" || manifest.scope !== "./") findings.push("manifest.webmanifest: root start URL or scope is invalid");
} catch {
  findings.push("manifest.webmanifest: invalid JSON");
}
if (totalBytes > 250 * 1024 * 1024) findings.push(`artifact is unexpectedly large: ${totalBytes} bytes`);

inventory.sort((a, b) => a.name.localeCompare(b.name));
console.log(JSON.stringify({ root, files: inventory.length, totalBytes, inventory }, null, 2));
if (findings.length) {
  for (const finding of [...new Set(findings)]) console.error(`ERROR: ${finding}`);
  process.exitCode = 1;
}
