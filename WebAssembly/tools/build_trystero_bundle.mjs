#!/usr/bin/env node

import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(wasmRoot, "harness/vendor/trystero-nostr.min.mjs");
const checkOnly = process.argv.includes("--check");
const banner = [
  "/* Project New Shoes browser bundle: Trystero 0.25.2 + @noble/secp256k1 3.1.0.",
  " * MIT license notices: trystero-LICENSE.txt and noble-secp256k1-LICENSE.txt. */",
].join("\n");

const result = await build({
  stdin: {
    contents: 'export { getRelaySockets, joinRoom, selfId } from "trystero";',
    loader: "js",
    resolveDir: wasmRoot,
    sourcefile: "trystero-browser-entry.mjs",
  },
  banner: { js: banner },
  bundle: true,
  format: "esm",
  legalComments: "none",
  minify: true,
  platform: "browser",
  target: ["es2022"],
  treeShaking: true,
  write: false,
});

const output = result.outputFiles?.[0]?.text;
if (!output) throw new Error("esbuild did not produce the Trystero browser bundle");

if (checkOnly) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== output) {
    throw new Error("Trystero browser bundle is missing or stale; run npm run build:browser-vendor");
  }
  console.log("Trystero browser bundle is current.");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(`Wrote ${outputPath} (${Buffer.byteLength(output)} bytes).`);
}
