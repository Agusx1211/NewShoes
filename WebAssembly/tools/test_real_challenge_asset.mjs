import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const challengeWasmPath = resolve(wasmDir, "dist/generals_challenge.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, challengeWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(challengeWasmPath),
  readFile(archivePath),
]);
const [bigModule, challengeModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(challengeWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const challengeExports = challengeModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const challengeMemory = new Uint8Array(challengeExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readChallengeString(ptr, size) {
  return ptr ? textDecoder.decode(challengeMemory.slice(ptr, ptr + size)) : "";
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

const challengeBytes = entryBytes("data/ini/challengemode.ini");
if (challengeBytes.length > challengeExports.generals_challenge_input_capacity()) {
  throw new Error(`Challenge payload exceeds ${challengeExports.generals_challenge_input_capacity()} byte wasm buffer`);
}

challengeMemory.set(challengeBytes, challengeExports.generals_challenge_input_ptr());
const parsedCount = challengeExports.generals_challenge_parse(challengeBytes.length);
if (parsedCount < 0 || challengeExports.generals_challenge_error_count() !== 0) {
  throw new Error(`Challenge parse failed: parsed=${parsedCount}, errors=${challengeExports.generals_challenge_error_count()}`);
}

function personaString(prefix, index) {
  return readChallengeString(
    challengeExports[`generals_challenge_${prefix}_ptr`](index),
    challengeExports[`generals_challenge_${prefix}_size`](index)
  );
}

function summarize(index) {
  return {
    index,
    position: challengeExports.generals_challenge_position(index),
    startsEnabled: challengeExports.generals_challenge_starts_enabled(index),
    playerTemplate: personaString("player_template", index),
    bioName: personaString("bio_name", index),
    campaign: personaString("campaign", index),
    portraitLarge: personaString("portrait_large", index),
    selectionSound: personaString("selection_sound", index),
    line: challengeExports.generals_challenge_line(index),
    fields: challengeExports.generals_challenge_field_count_at(index),
  };
}

const count = challengeExports.generals_challenge_count();
// Persona positions should be the contiguous range 0..count-1.
let positionsContiguous = true;
for (let index = 0; index < count; ++index) {
  if (challengeExports.generals_challenge_position(index) !== index) {
    positionsContiguous = false;
  }
}

const summary = {
  archive: archivePath,
  challengeBytes: challengeBytes.length,
  parsedCount,
  count,
  hasBlock: challengeExports.generals_challenge_has_block(),
  enabledCount: challengeExports.generals_challenge_enabled_count(),
  positionsContiguous,
  fieldCount: challengeExports.generals_challenge_field_count(),
  lineCount: challengeExports.generals_challenge_line_count(),
  first: summarize(0),
  last: summarize(count - 1),
};

if (summary.challengeBytes !== 13263 ||
    summary.parsedCount !== 12 ||
    summary.count !== 12 ||
    summary.hasBlock !== 1 ||
    summary.enabledCount !== 9 ||
    summary.positionsContiguous !== true ||
    summary.fieldCount !== 304 ||
    summary.lineCount !== 356) {
  throw new Error(`unexpected Challenge aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.first.position !== 0 ||
    summary.first.startsEnabled !== 1 ||
    summary.first.playerTemplate !== "FactionAmericaAirForceGeneral" ||
    summary.first.bioName !== "GUI:BioNameEntry_Pos0" ||
    summary.first.campaign !== "CHALLENGE_0" ||
    summary.first.portraitLarge !== "PAAirGen") {
  throw new Error(`unexpected first persona: ${JSON.stringify(summary.first)}`);
}

if (summary.last.position !== 11 ||
    summary.last.startsEnabled !== 0 ||
    summary.last.campaign !== "unimplemented") {
  throw new Error(`unexpected last persona: ${JSON.stringify(summary.last)}`);
}

console.log(JSON.stringify(summary, null, 2));
