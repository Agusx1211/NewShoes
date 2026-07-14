#!/usr/bin/env node

import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(wasmRoot, "harness/vendor/seek-bzip.min.mjs");
const checkOnly = process.argv.includes("--check");
const banner = [
  "/* Project New Shoes browser bundle: seek-bzip 2.0.0.",
  " * MIT license notice: seek-bzip-LICENSE.txt. */",
].join("\n");

const result = await build({
  stdin: {
    contents: [
      'import Bunzip from "seek-bzip";',
      "export function decompressBzip(bytes, expectedSize) {",
      "  const input = new Bunzip.Stream();",
      "  input.position = 0;",
      "  input.readByte = function () { return this.position < bytes.length ? bytes[this.position++] : -1; };",
      "  input.seek = function (position) { this.position = position; };",
      "  input.eof = function () { return this.position >= bytes.length; };",
      "  const outputBytes = new Uint8Array(expectedSize);",
      "  const output = new Bunzip.Stream();",
      "  output.position = 0;",
      "  output.writeByte = function (value) {",
      "    if (this.position >= outputBytes.length) throw new Error('BZip2 payload exceeds its declared size');",
      "    outputBytes[this.position++] = value;",
      "  };",
      "  const decoder = new Bunzip(input, output);",
      "  while (output.position < expectedSize) {",
      "    if (!decoder._init_block()) break;",
      "    decoder._read_bunzip();",
      "  }",
      "  if (output.position !== expectedSize) throw new Error(`BZip2 payload expanded to ${output.position} bytes; expected ${expectedSize}`);",
      "  return outputBytes;",
      "}",
    ].join("\n"),
    loader: "js",
    resolveDir: wasmRoot,
    sourcefile: "seek-bzip-browser-entry.mjs",
  },
  banner: { js: banner },
  bundle: true,
  format: "esm",
  inject: [resolve(wasmRoot, "tools/seek_bzip_buffer_shim.mjs")],
  legalComments: "none",
  minify: true,
  platform: "browser",
  target: ["es2022"],
  treeShaking: true,
  write: false,
});

const rawOutput = result.outputFiles?.[0]?.text;
if (!rawOutput) throw new Error("esbuild did not produce the seek-bzip browser bundle");

// esbuild 0.28 retains this redundant directive on ARM64 but removes it on x64.
// ESM is always strict, so normalizing it out keeps the checked-in bundle portable.
const output = rawOutput.replaceAll('"use strict";', "");

if (checkOnly) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== output) {
    throw new Error("seek-bzip browser bundle is missing or stale; run npm run build:browser-vendor");
  }
  console.log("seek-bzip browser bundle is current.");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(`Wrote ${outputPath} (${Buffer.byteLength(output)} bytes).`);
}
