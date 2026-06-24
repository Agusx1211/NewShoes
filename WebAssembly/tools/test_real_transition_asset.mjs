import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const transitionWasmPath = resolve(wasmDir, "dist/generals_transition.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, transitionWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(transitionWasmPath),
  readFile(archivePath),
]);
const [bigModule, transitionModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(transitionWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const transitionExports = transitionModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const transitionMemory = new Uint8Array(transitionExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readTransitionString(ptr, size) {
  return ptr ? textDecoder.decode(transitionMemory.slice(ptr, ptr + size)) : "";
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

const transitionBytes = entryBytes("data/ini/windowtransitions.ini");
if (transitionBytes.length > transitionExports.generals_transition_input_capacity()) {
  throw new Error(`Transition payload exceeds ${transitionExports.generals_transition_input_capacity()} byte wasm buffer`);
}

transitionMemory.set(transitionBytes, transitionExports.generals_transition_input_ptr());
const parsedCount = transitionExports.generals_transition_parse(transitionBytes.length);
if (parsedCount < 0 || transitionExports.generals_transition_error_count() !== 0) {
  throw new Error(`Transition parse failed: parsed=${parsedCount}, errors=${transitionExports.generals_transition_error_count()}`);
}

function groupName(index) {
  return readTransitionString(transitionExports.generals_transition_name_ptr(index), transitionExports.generals_transition_name_size(index));
}

function windowString(prefix, index) {
  return readTransitionString(
    transitionExports[`generals_transition_window_${prefix}_ptr`](index),
    transitionExports[`generals_transition_window_${prefix}_size`](index)
  );
}

function summarize(index) {
  const firstWindow = transitionExports.generals_transition_first_window(index);
  return {
    index,
    name: groupName(index),
    fireOnce: transitionExports.generals_transition_fire_once(index),
    windowCount: transitionExports.generals_transition_window_count(index),
    firstWindow,
    firstWinName: windowString("name", firstWindow),
    firstStyle: windowString("style_name", firstWindow),
    line: transitionExports.generals_transition_line(index),
    fields: transitionExports.generals_transition_field_count_at(index),
  };
}

function find(name) {
  for (let index = 0; index < transitionExports.generals_transition_count(); ++index) {
    if (groupName(index) === name) {
      return summarize(index);
    }
  }

  throw new Error(`WindowTransition not found: ${name}`);
}

// Cross-check: every window's style must resolve and group links must be valid.
const windowTotal = transitionExports.generals_transition_window_total();
let summedWindows = 0;
for (let index = 0; index < transitionExports.generals_transition_count(); ++index) {
  summedWindows += transitionExports.generals_transition_window_count(index);
}
let unknownStyles = 0;
let badLinks = 0;
for (let index = 0; index < windowTotal; ++index) {
  if (transitionExports.generals_transition_window_style(index) < 0) {
    ++unknownStyles;
  }
  const owner = transitionExports.generals_transition_window_group_index(index);
  if (owner < 0 || owner >= transitionExports.generals_transition_count()) {
    ++badLinks;
  }
}

const summary = {
  archive: archivePath,
  transitionBytes: transitionBytes.length,
  parsedCount,
  count: transitionExports.generals_transition_count(),
  windowTotal,
  summedWindows,
  unknownStyles,
  badLinks,
  styleCount: transitionExports.generals_transition_style_count(),
  fieldCount: transitionExports.generals_transition_field_count(),
  lineCount: transitionExports.generals_transition_line_count(),
  first: summarize(0),
  logoFade: find("MainMenuDefaultMenuLogoFade"),
};

if (summary.transitionBytes !== 50306 ||
    summary.parsedCount !== 56 ||
    summary.count !== 56 ||
    summary.windowTotal !== 381 ||
    summary.summedWindows !== 381 ||
    summary.unknownStyles !== 0 ||
    summary.badLinks !== 0 ||
    summary.styleCount !== 15 ||
    summary.fieldCount !== 1561 ||
    summary.lineCount !== 2420) {
  throw new Error(`unexpected Transition aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.first.name !== "MainMenuFade" ||
    summary.first.fireOnce !== 1 ||
    summary.first.windowCount !== 1 ||
    summary.first.firstWinName !== "MainMenu.wnd:MainMenuRuler" ||
    summary.first.firstStyle !== "WINFADE" ||
    summary.first.fields !== 2) {
  throw new Error(`unexpected first group: ${JSON.stringify(summary.first)}`);
}

if (summary.logoFade.windowCount !== 8 ||
    summary.logoFade.fireOnce !== 1) {
  throw new Error(`unexpected MainMenuDefaultMenuLogoFade group: ${JSON.stringify(summary.logoFade)}`);
}

console.log(JSON.stringify(summary, null, 2));
