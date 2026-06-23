import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const iniWasmPath = resolve(wasmDir, "dist/generals_ini.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const targetIni = process.argv[3] ?? "data/ini/armor.ini";
const [bigWasmBytes, iniWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(iniWasmPath),
  readFile(archivePath),
]);
const [bigModule, iniModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(iniWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const iniExports = iniModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const iniMemory = new Uint8Array(iniExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);
let dataPtr = 0;
let dataSize = 0;

for (let index = 0; index < fileCount; ++index) {
  const namePtr = bigExports.generals_big_entry_name_ptr(index);
  const nameSize = bigExports.generals_big_entry_name_size(index);
  const name = textDecoder.decode(bigMemory.slice(namePtr, namePtr + nameSize));
  if (name === targetIni) {
    dataPtr = bigExports.generals_big_entry_data_ptr(index);
    dataSize = bigExports.generals_big_entry_data_size(index);
    break;
  }
}

if (!dataPtr || !dataSize) {
  throw new Error(`could not find ${targetIni}`);
}

if (dataSize > iniExports.generals_ini_input_capacity()) {
  throw new Error(`${targetIni} exceeds INI wasm input capacity`);
}

iniMemory.set(bigMemory.slice(dataPtr, dataPtr + dataSize), iniExports.generals_ini_input_ptr());
const parsedCount = iniExports.generals_ini_parse(dataSize);

if (parsedCount < 1 || iniExports.generals_ini_error_count() !== 0) {
  throw new Error(`real INI parse failed: blocks=${parsedCount}, errors=${iniExports.generals_ini_error_count()}`);
}

const preview = [];
for (let index = 0; index < Math.min(parsedCount, 8); ++index) {
  const typePtr = iniExports.generals_ini_block_type_ptr(index);
  const typeSize = iniExports.generals_ini_block_type_size(index);
  const namePtr = iniExports.generals_ini_block_name_ptr(index);
  const nameSize = iniExports.generals_ini_block_name_size(index);
  preview.push({
    index,
    type: textDecoder.decode(iniMemory.slice(typePtr, typePtr + typeSize)),
    name: namePtr ? textDecoder.decode(iniMemory.slice(namePtr, namePtr + nameSize)) : "",
    properties: iniExports.generals_ini_block_property_count(index),
    line: iniExports.generals_ini_block_line(index),
  });
}

console.log(JSON.stringify({
  archive: archivePath,
  targetIni,
  dataSize,
  parsedCount,
  propertyCount: iniExports.generals_ini_property_count(),
  lineCount: iniExports.generals_ini_line_count(),
  preview,
}, null, 2));
