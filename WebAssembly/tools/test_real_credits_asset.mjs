import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const creditsWasmPath = resolve(wasmDir, "dist/generals_credits.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, creditsWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(creditsWasmPath),
  readFile(archivePath),
]);
const [bigModule, creditsModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(creditsWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const creditsExports = creditsModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const creditsMemory = new Uint8Array(creditsExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readCreditsString(ptr, size) {
  return ptr ? textDecoder.decode(creditsMemory.slice(ptr, ptr + size)) : "";
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

const creditsBytes = entryBytes("data/ini/credits.ini");
if (creditsBytes.length > creditsExports.generals_credits_input_capacity()) {
  throw new Error(`Credits payload exceeds ${creditsExports.generals_credits_input_capacity()} byte wasm buffer`);
}

creditsMemory.set(creditsBytes, creditsExports.generals_credits_input_ptr());
const parsedCount = creditsExports.generals_credits_parse(creditsBytes.length);
if (parsedCount < 0 || creditsExports.generals_credits_error_count() !== 0) {
  throw new Error(`Credits parse failed: parsed=${parsedCount}, errors=${creditsExports.generals_credits_error_count()}`);
}

function lineText(index) {
  return readCreditsString(creditsExports.generals_credits_line_text_ptr(index), creditsExports.generals_credits_line_text_size(index));
}

function lineStyleName(index) {
  return readCreditsString(creditsExports.generals_credits_line_style_name_ptr(index), creditsExports.generals_credits_line_style_name_size(index));
}

// Cross-check: text + blank == total, and each text line carries non-blank text.
const lineTotal = creditsExports.generals_credits_line_total();
let textSeen = 0;
let blankSeen = 0;
let quotedFound = false;
for (let index = 0; index < lineTotal; ++index) {
  if (creditsExports.generals_credits_line_type(index) === 0) {
    ++textSeen;
    if (lineText(index) === "Mark Skaggs") {
      quotedFound = true;
    }
  } else {
    ++blankSeen;
  }
}

const summary = {
  archive: archivePath,
  creditsBytes: creditsBytes.length,
  parsedCount,
  lineTotal,
  textCount: creditsExports.generals_credits_text_count(),
  blankCount: creditsExports.generals_credits_blank_count(),
  textSeen,
  blankSeen,
  styleDeclCount: creditsExports.generals_credits_style_decl_count(),
  fieldCount: creditsExports.generals_credits_field_count(),
  settingsFieldCount: creditsExports.generals_credits_settings_field_count(),
  lineCount: creditsExports.generals_credits_line_count(),
  quotedFound,
  hasBlock: creditsExports.generals_credits_has_block(),
  scrollRate: creditsExports.generals_credits_scroll_rate(),
  scrollRateEveryFrames: creditsExports.generals_credits_scroll_rate_every_frames(),
  scrollDown: creditsExports.generals_credits_scroll_down(),
  titleColor: [
    creditsExports.generals_credits_title_color_r(),
    creditsExports.generals_credits_title_color_g(),
    creditsExports.generals_credits_title_color_b(),
    creditsExports.generals_credits_title_color_a(),
  ],
  firstLine: { type: creditsExports.generals_credits_line_type(0), style: lineStyleName(0), text: lineText(0) },
};

if (summary.creditsBytes !== 18784 ||
    summary.parsedCount !== 515 ||
    summary.lineTotal !== 515 ||
    summary.textCount !== 345 ||
    summary.blankCount !== 170 ||
    summary.textSeen !== 345 ||
    summary.blankSeen !== 170 ||
    summary.styleDeclCount !== 158 ||
    summary.fieldCount !== 679 ||
    summary.settingsFieldCount !== 6 ||
    summary.lineCount !== 772 ||
    summary.quotedFound !== true ||
    summary.hasBlock !== 1) {
  throw new Error(`unexpected Credits aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.scrollRate !== 2 ||
    summary.scrollRateEveryFrames !== 1 ||
    summary.scrollDown !== 0 ||
    summary.titleColor.join("/") !== "161/179/255/255") {
  throw new Error(`unexpected Credits settings: ${JSON.stringify(summary)}`);
}

if (summary.firstLine.type !== 0 ||
    summary.firstLine.style !== "MINORTITLE" ||
    summary.firstLine.text !== "CREDITS:DevelopmentTitle") {
  throw new Error(`unexpected first credit line: ${JSON.stringify(summary.firstLine)}`);
}

console.log(JSON.stringify(summary, null, 2));
