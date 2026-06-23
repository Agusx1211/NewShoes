import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBigArchiveSample } from "../public/fixtures.js";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textDecoder = new TextDecoder();
const { archive, files } = createBigArchiveSample();
const inputOffset = exports.generals_big_input_ptr();

memory.set(archive, inputOffset);

const isBig = exports.generals_big_is(archive.length);
const parsedCount = exports.generals_big_parse(archive.length);

if (isBig !== 1) {
  throw new Error(`expected BIG detection to pass, got ${isBig}`);
}

if (parsedCount !== files.length) {
  throw new Error(`expected ${files.length} files, got ${parsedCount}`);
}

for (let index = 0; index < files.length; ++index) {
  const namePtr = exports.generals_big_entry_name_ptr(index);
  const nameSize = exports.generals_big_entry_name_size(index);
  const dataOffset = exports.generals_big_entry_data_offset(index);
  const dataPtr = exports.generals_big_entry_data_ptr(index);
  const dataSize = exports.generals_big_entry_data_size(index);
  const name = textDecoder.decode(memory.slice(namePtr, namePtr + nameSize));

  if (name !== files[index].name) {
    throw new Error(`entry ${index} name mismatch: expected ${files[index].name}, got ${name}`);
  }

  if (dataOffset !== files[index].offset || dataSize !== files[index].size) {
    throw new Error(`entry ${index} data range mismatch`);
  }

  const data = textDecoder.decode(memory.slice(dataPtr, dataPtr + dataSize));
  if (data !== files[index].text) {
    throw new Error(`entry ${index} data payload mismatch`);
  }
}

console.log(JSON.stringify({
  module: wasmPath,
  inputOffset,
  archiveSize: archive.length,
  parsedCount,
  firstFile: files[0],
}, null, 2));
