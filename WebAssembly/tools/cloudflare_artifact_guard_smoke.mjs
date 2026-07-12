#!/usr/bin/env node

import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const wasmRoot = resolve(import.meta.dirname, "..");
const siteRoot = resolve(wasmRoot, "cloudflare-dist");

function run(script, args = []) {
  return spawnSync(process.execPath, [resolve(wasmRoot, script), ...args], { cwd: wasmRoot, env: process.env, encoding: "utf8" });
}

function expect(result, success, label, pattern = null) {
  if ((result.status === 0) !== success) throw new Error(`${label}: unexpected exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  if (pattern && !pattern.test(`${result.stdout}\n${result.stderr}`)) throw new Error(`${label}: expected ${pattern}\n${result.stdout}\n${result.stderr}`);
}

expect(run("tools/verify_pages_site.mjs", [resolve(wasmRoot, "pages-dist")]), true, "verified staging input");
expect(run("tools/build_cloudflare_site.mjs"), true, "baseline package");
expect(run("tools/verify_cloudflare_site.mjs", [siteRoot]), true, "baseline verification");

const outputExtra = join(siteRoot, "unexpected.env");
const outputLink = join(siteRoot, "unexpected-link");
const headersPath = join(siteRoot, "_headers");
const originalHeaders = await readFile(headersPath, "utf8");
try {
  await writeFile(outputExtra, "must never ship\n");
  expect(run("tools/verify_cloudflare_site.mjs", [siteRoot]), false, "output-extra guard", /not in the exact Cloudflare allowlist/);
} finally {
  await rm(outputExtra, { force: true });
}
try {
  await symlink("LICENSE.md", outputLink);
  expect(run("tools/verify_cloudflare_site.mjs", [siteRoot]), false, "symlink guard", /symbolic links are not allowed/);
} finally {
  await rm(outputLink, { force: true });
}
try {
  await writeFile(headersPath, originalHeaders.replace("Cross-Origin-Embedder-Policy: require-corp", ""));
  expect(run("tools/verify_cloudflare_site.mjs", [siteRoot]), false, "COEP header guard", /missing Cross-Origin-Embedder-Policy/);
} finally {
  await writeFile(headersPath, originalHeaders);
}
expect(run("tools/verify_cloudflare_site.mjs", [siteRoot]), true, "final verification");
console.log("Cloudflare artifact fail-closed guards: OK");
