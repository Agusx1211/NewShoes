import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const evaWasmPath = resolve(wasmDir, "dist/generals_eva.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, evaWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(evaWasmPath),
  readFile(archivePath),
]);
const [bigModule, evaModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(evaWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const evaExports = evaModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const evaMemory = new Uint8Array(evaExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readEvaString(ptr, size) {
  return ptr ? textDecoder.decode(evaMemory.slice(ptr, ptr + size)) : "";
}

function entryBytes(name) {
  for (let index = 0; index < fileCount; ++index) {
    const entryName = readBigString(
      bigExports.generals_big_entry_name_ptr(index),
      bigExports.generals_big_entry_name_size(index)
    );
    if (entryName === name) {
      const dataPtr = bigExports.generals_big_entry_data_ptr(index);
      const dataSize = bigExports.generals_big_entry_data_size(index);
      return bigMemory.slice(dataPtr, dataPtr + dataSize);
    }
  }

  throw new Error(`${name} not found in ${archivePath}`);
}

const evaBytes = entryBytes("data/ini/eva.ini");
if (evaBytes.length > evaExports.generals_eva_input_capacity()) {
  throw new Error(`Eva payload exceeds ${evaExports.generals_eva_input_capacity()} byte wasm buffer`);
}

evaMemory.set(evaBytes, evaExports.generals_eva_input_ptr());
const parsedCount = evaExports.generals_eva_parse(evaBytes.length);
if (parsedCount < 0 || evaExports.generals_eva_error_count() !== 0) {
  throw new Error(`Eva parse failed: parsed=${parsedCount}, errors=${evaExports.generals_eva_error_count()}`);
}

function eventName(index) {
  return readEvaString(evaExports.generals_eva_name_ptr(index), evaExports.generals_eva_name_size(index));
}

function summarize(index) {
  const firstSound = evaExports.generals_eva_first_side_sound(index);
  return {
    index,
    name: eventName(index),
    priority: evaExports.generals_eva_priority(index),
    timeBetweenChecksMs: evaExports.generals_eva_time_between_checks_ms(index),
    expirationTimeMs: evaExports.generals_eva_expiration_time_ms(index),
    sideSoundsCount: evaExports.generals_eva_side_sounds_count(index),
    firstSideSound: firstSound,
    firstSide: readEvaString(evaExports.generals_eva_side_sound_side_ptr(firstSound), evaExports.generals_eva_side_sound_side_size(firstSound)),
    firstSound: readEvaString(evaExports.generals_eva_side_sound_first_sound_ptr(firstSound), evaExports.generals_eva_side_sound_first_sound_size(firstSound)),
    line: evaExports.generals_eva_line(index),
    fields: evaExports.generals_eva_field_count_at(index),
  };
}

function find(name) {
  for (let index = 0; index < evaExports.generals_eva_count(); ++index) {
    if (eventName(index) === name) {
      return summarize(index);
    }
  }

  throw new Error(`EvaEvent not found: ${name}`);
}

// Cross-check: the sum of every event's side-sound count must equal the flat
// total, and every flat group must point back to a valid event.
let summedSideSounds = 0;
for (let index = 0; index < evaExports.generals_eva_count(); ++index) {
  summedSideSounds += evaExports.generals_eva_side_sounds_count(index);
}
let badLinks = 0;
for (let index = 0; index < evaExports.generals_eva_side_sounds_total(); ++index) {
  const owner = evaExports.generals_eva_side_sound_event_index(index);
  if (owner < 0 || owner >= evaExports.generals_eva_count()) {
    ++badLinks;
  }
}

const summary = {
  archive: archivePath,
  evaBytes: evaBytes.length,
  parsedCount,
  count: evaExports.generals_eva_count(),
  sideSoundsTotal: evaExports.generals_eva_side_sounds_total(),
  summedSideSounds,
  badLinks,
  fieldCount: evaExports.generals_eva_field_count(),
  lineCount: evaExports.generals_eva_line_count(),
  lowPower: find("LowPower"),
  insufficientFunds: find("InsufficientFunds"),
};

if (summary.evaBytes !== 69393 ||
    summary.parsedCount !== 49 ||
    summary.count !== 49 ||
    summary.sideSoundsTotal !== 559 ||
    summary.summedSideSounds !== 559 ||
    summary.badLinks !== 0 ||
    summary.fieldCount !== 1241 ||
    summary.lineCount !== 3439) {
  throw new Error(`unexpected Eva aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.lowPower.priority !== 2 ||
    summary.lowPower.timeBetweenChecksMs !== 120000 ||
    summary.lowPower.expirationTimeMs !== 5000 ||
    summary.lowPower.sideSoundsCount !== 13 ||
    summary.lowPower.firstSide !== "America" ||
    summary.lowPower.firstSound !== "EvaUSA_LowPower" ||
    summary.lowPower.fields !== 3) {
  throw new Error(`unexpected LowPower event: ${JSON.stringify(summary.lowPower)}`);
}

if (summary.insufficientFunds.priority !== 3 ||
    summary.insufficientFunds.sideSoundsCount !== 13) {
  throw new Error(`unexpected InsufficientFunds event: ${JSON.stringify(summary.insufficientFunds)}`);
}

console.log(JSON.stringify(summary, null, 2));
