import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const ingameUiWasmPath = resolve(wasmDir, "dist/generals_ingameui.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, ingameUiWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(ingameUiWasmPath),
  readFile(archivePath),
]);
const [bigModule, ingameUiModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(ingameUiWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const ingameUiExports = ingameUiModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const ingameUiMemory = new Uint8Array(ingameUiExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readIngameUiString(ptr, size) {
  return ptr ? textDecoder.decode(ingameUiMemory.slice(ptr, ptr + size)) : "";
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

const ingameUiBytes = entryBytes("data/ini/ingameui.ini");
if (ingameUiBytes.length > ingameUiExports.generals_ingameui_input_capacity()) {
  throw new Error(`InGameUI payload exceeds ${ingameUiExports.generals_ingameui_input_capacity()} byte wasm buffer`);
}

ingameUiMemory.set(ingameUiBytes, ingameUiExports.generals_ingameui_input_ptr());
const parsedFields = ingameUiExports.generals_ingameui_parse(ingameUiBytes.length);
if (parsedFields < 0 || ingameUiExports.generals_ingameui_error_count() !== 0) {
  throw new Error(`InGameUI parse failed: fields=${parsedFields}, errors=${ingameUiExports.generals_ingameui_error_count()}`);
}

const summary = {
  archive: archivePath,
  ingameUiBytes: ingameUiBytes.length,
  parsedFields,
  hasBlock: ingameUiExports.generals_ingameui_has_block(),
  fieldCount: ingameUiExports.generals_ingameui_field_count(),
  knownFieldCount: ingameUiExports.generals_ingameui_known_field_count(),
  radiusCursorCount: ingameUiExports.generals_ingameui_radius_cursor_count(),
  lineCount: ingameUiExports.generals_ingameui_line_count(),
  maxSelectionSize: ingameUiExports.generals_ingameui_max_selection_size(),
  messageColor1: [
    ingameUiExports.generals_ingameui_message_color1_r(),
    ingameUiExports.generals_ingameui_message_color1_g(),
    ingameUiExports.generals_ingameui_message_color1_b(),
  ],
  messageColor2: [
    ingameUiExports.generals_ingameui_message_color2_r(),
    ingameUiExports.generals_ingameui_message_color2_g(),
    ingameUiExports.generals_ingameui_message_color2_b(),
  ],
  messagePosition: [
    ingameUiExports.generals_ingameui_message_pos_x(),
    ingameUiExports.generals_ingameui_message_pos_y(),
  ],
  messageFont: readIngameUiString(ingameUiExports.generals_ingameui_message_font_ptr(), ingameUiExports.generals_ingameui_message_font_size()),
  messagePointSize: ingameUiExports.generals_ingameui_message_point_size(),
  messageBold: ingameUiExports.generals_ingameui_message_bold(),
  messageDelayMs: ingameUiExports.generals_ingameui_message_delay_ms(),
  militaryColor: [
    ingameUiExports.generals_ingameui_military_color_r(),
    ingameUiExports.generals_ingameui_military_color_g(),
    ingameUiExports.generals_ingameui_military_color_b(),
    ingameUiExports.generals_ingameui_military_color_a(),
  ],
  floatingTextTimeOut: ingameUiExports.generals_ingameui_floating_text_time_out(),
  storedRadiusCursorCount: ingameUiExports.generals_ingameui_stored_radius_cursor_count(),
  firstCursor: {
    name: readIngameUiString(ingameUiExports.generals_ingameui_radius_cursor_name_ptr(0), ingameUiExports.generals_ingameui_radius_cursor_name_size(0)),
    texture: readIngameUiString(ingameUiExports.generals_ingameui_radius_cursor_texture_ptr(0), ingameUiExports.generals_ingameui_radius_cursor_texture_size(0)),
    style: readIngameUiString(ingameUiExports.generals_ingameui_radius_cursor_style_ptr(0), ingameUiExports.generals_ingameui_radius_cursor_style_size(0)),
  },
};

if (summary.ingameUiBytes !== 10908 ||
    summary.hasBlock !== 1 ||
    summary.fieldCount !== 72 ||
    summary.knownFieldCount !== 77 ||
    summary.radiusCursorCount !== 29 ||
    summary.storedRadiusCursorCount !== 29 ||
    summary.lineCount !== 365) {
  throw new Error(`unexpected InGameUI aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.firstCursor.name !== "SpyDroneRadiusCursor" ||
    summary.firstCursor.texture !== "SccSpyDrone_USA" ||
    summary.firstCursor.style !== "SHADOW_ALPHA_DECAL") {
  throw new Error(`unexpected first radius cursor: ${JSON.stringify(summary.firstCursor)}`);
}

if (summary.maxSelectionSize !== 0 ||
    summary.messageColor1.join("/") !== "255/255/255" ||
    summary.messageColor2.join("/") !== "180/180/255" ||
    summary.messagePosition.join("/") !== "10/10" ||
    summary.messageFont !== "Arial" ||
    summary.messagePointSize !== 10 ||
    summary.messageBold !== 1 ||
    summary.messageDelayMs !== 75000 ||
    summary.militaryColor.join("/") !== "255/255/255/255" ||
    summary.floatingTextTimeOut !== 333) {
  throw new Error(`unexpected InGameUI settings: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
