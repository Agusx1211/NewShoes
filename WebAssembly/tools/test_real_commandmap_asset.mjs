import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const commandMapWasmPath = resolve(wasmDir, "dist/generals_commandmap.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const entryName = process.argv[3] ?? "data/ini/commandmapdebug.ini";
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
if (commandMapBytes.length > commandMapExports.generals_commandmap_input_capacity()) {
  throw new Error(`CommandMap payload exceeds ${commandMapExports.generals_commandmap_input_capacity()} byte wasm buffer`);
}

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

function summarize(index) {
  return {
    index,
    name: commandString("name", index),
    key: commandString("key", index),
    transition: commandString("transition", index),
    modifiers: commandString("modifiers", index),
    useableIn: commandString("useable_in", index),
    line: commandMapExports.generals_commandmap_line(index),
    fields: commandMapExports.generals_commandmap_field_count_at(index),
  };
}

function find(name) {
  for (let index = 0; index < commandMapExports.generals_commandmap_count(); ++index) {
    if (commandString("name", index) === name) {
      return summarize(index);
    }
  }

  throw new Error(`CommandMap not found: ${name}`);
}

const count = commandMapExports.generals_commandmap_count();
// Every command should bind a key and at least carry its 4 core fields.
let missingKey = 0;
for (let index = 0; index < count; ++index) {
  if (commandString("key", index) === "") {
    ++missingKey;
  }
}

const summary = {
  archive: archivePath,
  entry: entryName,
  commandMapBytes: commandMapBytes.length,
  parsedCount,
  count,
  missingKey,
  fieldCount: commandMapExports.generals_commandmap_field_count(),
  lineCount: commandMapExports.generals_commandmap_line_count(),
  first: summarize(0),
  last: summarize(count - 1),
};

if (summary.commandMapBytes !== 13129 ||
    summary.parsedCount !== 85 ||
    summary.count !== 85 ||
    summary.missingKey !== 0 ||
    summary.fieldCount !== 341 ||
    summary.lineCount !== 727) {
  throw new Error(`unexpected CommandMap aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.first.name !== "DEBUG_OBJECT_ID_PERFORMANCE" ||
    summary.first.key !== "KEY_Q" ||
    summary.first.transition !== "DOWN" ||
    summary.first.modifiers !== "SHIFT_ALT_CTRL" ||
    summary.first.useableIn !== "GAME" ||
    summary.first.fields !== 4) {
  throw new Error(`unexpected first command: ${JSON.stringify(summary.first)}`);
}

// The final command's UseableIn keeps its full multi-flag bit string.
if (summary.last.useableIn !== "GAME SHELL") {
  throw new Error(`unexpected last command useableIn: ${JSON.stringify(summary.last)}`);
}

console.log(JSON.stringify(summary, null, 2));
