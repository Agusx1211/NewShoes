#!/usr/bin/env node

import { rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const wasmRoot = resolve(import.meta.dirname, "..");
const siteRoot = resolve(wasmRoot, "pages-dist");
const runtimeRoot = resolve(process.env.PAGES_RUNTIME_DIST
  || join(wasmRoot, "pages-build/dist-threaded-release"));

function run(script, args = []) {
  return spawnSync(process.execPath, [resolve(wasmRoot, script), ...args], {
    cwd: wasmRoot,
    env: process.env,
    encoding: "utf8",
  });
}

function expect(result, success, label, pattern = null) {
  if ((result.status === 0) !== success) {
    throw new Error(`${label}: unexpected exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  if (pattern && !pattern.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(`${label}: expected ${pattern}\n${result.stdout}\n${result.stderr}`);
  }
}

const runtimeExtra = join(runtimeRoot, "unexpected.env");
const outputExtra = join(siteRoot, "unexpected.env");
const outputLink = join(siteRoot, "unexpected-link");

try {
  await writeFile(runtimeExtra, "must never ship\n");
  expect(run("tools/build_pages_site.mjs"), false, "runtime-extra guard", /Runtime directory must contain exactly/);
} finally {
  await rm(runtimeExtra, { force: true });
}

expect(run("tools/build_pages_site.mjs"), true, "baseline package");
expect(run("tools/verify_pages_site.mjs", [siteRoot]), true, "baseline verification");

try {
  await writeFile(outputExtra, "must never ship\n");
  expect(run("tools/verify_pages_site.mjs", [siteRoot]), false, "output-extra guard", /not in the exact Pages allowlist/);
} finally {
  await rm(outputExtra, { force: true });
}

try {
  await symlink("LICENSE.md", outputLink);
  expect(run("tools/verify_pages_site.mjs", [siteRoot]), false, "symlink guard", /symbolic links are not allowed/);
} finally {
  await rm(outputLink, { force: true });
}

expect(run("tools/verify_pages_site.mjs", [siteRoot]), true, "final verification");
console.log("Pages artifact fail-closed guards: OK");
