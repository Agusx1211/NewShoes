import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const realBigPath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [wasmBytes, archive] = await Promise.all([
  readFile(wasmPath),
  readFile(realBigPath),
]);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const inputOffset = exports.generals_big_input_ptr();

if (archive.length > exports.generals_big_input_capacity()) {
  throw new Error(`archive is ${archive.length} bytes, capacity is ${exports.generals_big_input_capacity()}`);
}

memory.set(archive, inputOffset);

const isBig = exports.generals_big_is(archive.length);
const parsedCount = exports.generals_big_parse(archive.length);

if (isBig !== 1) {
  throw new Error("real asset was not detected as a BIG archive");
}

if (parsedCount < 1) {
  throw new Error(`expected at least one BIG entry, got ${parsedCount}`);
}

const textDecoder = new TextDecoder();
const preview = [];
for (let index = 0; index < Math.min(parsedCount, 8); ++index) {
  const namePtr = exports.generals_big_entry_name_ptr(index);
  const nameSize = exports.generals_big_entry_name_size(index);
  const dataPtr = exports.generals_big_entry_data_ptr(index);
  const dataSize = exports.generals_big_entry_data_size(index);
  const name = textDecoder.decode(memory.slice(namePtr, namePtr + nameSize));
  const textPreview = name.endsWith(".ini")
    ? textDecoder.decode(memory.slice(dataPtr, dataPtr + Math.min(dataSize, 80))).replace(/\s+/g, " ").trim()
    : "";
  preview.push({ index, name, size: dataSize, textPreview });
}

console.log(JSON.stringify({
  module: wasmPath,
  asset: realBigPath,
  archiveSize: archive.length,
  parsedCount,
  preview,
}, null, 2));
