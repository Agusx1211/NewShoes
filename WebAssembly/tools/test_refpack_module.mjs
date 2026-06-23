import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRefPackLiteralSample } from "../public/fixtures.js";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_refpack.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);

const inputOffset = exports.generals_refpack_input_ptr();
const outputOffset = exports.generals_refpack_output_ptr();
const compressed = createRefPackLiteralSample();

memory.set(compressed, inputOffset);

const isRefPack = exports.generals_refpack_is(0);
const expectedSize = exports.generals_refpack_size(0);
const decodedSize = exports.generals_refpack_decode(0, 0);
const consumedSize = exports.generals_refpack_last_consumed_size();
const decoded = new TextDecoder().decode(memory.slice(outputOffset, outputOffset + decodedSize));

if (isRefPack !== 1) {
  throw new Error(`expected RefPack detection to pass, got ${isRefPack}`);
}

if (expectedSize !== 3) {
  throw new Error(`expected decoded size 3, got ${expectedSize}`);
}

if (decodedSize !== 3) {
  throw new Error(`expected decode result 3, got ${decodedSize}`);
}

if (consumedSize !== compressed.length) {
  throw new Error(`expected consumed size ${compressed.length}, got ${consumedSize}`);
}

if (decoded !== "ABC") {
  throw new Error(`expected decoded text ABC, got ${decoded}`);
}

console.log(JSON.stringify({
  module: wasmPath,
  inputOffset,
  outputOffset,
  compressedSize: compressed.length,
  decodedSize,
  consumedSize,
  decoded,
}, null, 2));
