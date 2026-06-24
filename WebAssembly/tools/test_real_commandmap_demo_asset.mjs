import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Validates the command-map parser against a second real file
// (commandmapdemo.ini) to exercise it on different bindings than the debug map.
const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const commandMapWasmPath = resolve(wasmDir, "dist/generals_commandmap.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const entryName = "data/ini/commandmapdemo.ini";
const [bigWasmBytes, commandMapWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(commandMapWasmPath),
  readFile(archivePath),
]);
const [bigModule, commandMapModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(commandMapWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const commandMapExports = commandMapModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const commandMapMemory = new Uint8Array(commandMapExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readCommandMapString(ptr, size) {
  return ptr ? textDecoder.decode(commandMapMemory.slice(ptr, ptr + size)) : "";
}

function entryBytes(name) {
  for (let index = 0; index < fileCount; ++index) {
    const candidate = readBigString(
      bigExports.generals_big_entry_name_ptr(index),
      bigExports.generals_big_entry_name_size(index)
    );
    if (candidate === name) {
      const dataPtr = bigExports.generals_big_entry_data_ptr(index);
      const dataSize = bigExports.generals_big_entry_data_size(index);
      return bigMemory.slice(dataPtr, dataPtr + dataSize);
    }
  }

  throw new Error(`${name} not found in ${archivePath}`);
}

const commandMapBytes = entryBytes(entryName);
commandMapMemory.set(commandMapBytes, commandMapExports.generals_commandmap_input_ptr());
const parsedCount = commandMapExports.generals_commandmap_parse(commandMapBytes.length);
if (parsedCount < 0 || commandMapExports.generals_commandmap_error_count() !== 0) {
  throw new Error(`CommandMap parse failed: parsed=${parsedCount}, errors=${commandMapExports.generals_commandmap_error_count()}`);
}

function commandString(prefix, index) {
  return readCommandMapString(
    commandMapExports[`generals_commandmap_${prefix}_ptr`](index),
    commandMapExports[`generals_commandmap_${prefix}_size`](index)
  );
}

let missingKey = 0;
for (let index = 0; index < commandMapExports.generals_commandmap_count(); ++index) {
  if (commandString("key", index) === "") {
    ++missingKey;
  }
}

const summary = {
  archive: archivePath,
  entry: entryName,
  commandMapBytes: commandMapBytes.length,
  parsedCount,
  count: commandMapExports.generals_commandmap_count(),
  missingKey,
  fieldCount: commandMapExports.generals_commandmap_field_count(),
  lineCount: commandMapExports.generals_commandmap_line_count(),
  first: {
    name: commandString("name", 0),
    key: commandString("key", 0),
    transition: commandString("transition", 0),
    modifiers: commandString("modifiers", 0),
    useableIn: commandString("useable_in", 0),
  },
};

if (summary.commandMapBytes !== 2813 ||
    summary.parsedCount !== 20 ||
    summary.count !== 20 ||
    summary.missingKey !== 0 ||
    summary.fieldCount !== 80 ||
    summary.lineCount !== 145) {
  throw new Error(`unexpected CommandMap (demo) aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.first.name !== "CHEAT_RUNSCRIPT1" ||
    summary.first.key !== "KEY_F1" ||
    summary.first.transition !== "DOWN" ||
    summary.first.modifiers !== "SHIFT_CTRL" ||
    summary.first.useableIn !== "GAME") {
  throw new Error(`unexpected first demo command: ${JSON.stringify(summary.first)}`);
}

console.log(JSON.stringify(summary, null, 2));
