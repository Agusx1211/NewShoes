import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const mouseWasmPath = resolve(wasmDir, "dist/generals_mouse.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, mouseWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(mouseWasmPath),
  readFile(archivePath),
]);
const [bigModule, mouseModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(mouseWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const mouseExports = mouseModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const mouseMemory = new Uint8Array(mouseExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readMouseString(ptr, size) {
  return ptr ? textDecoder.decode(mouseMemory.slice(ptr, ptr + size)) : "";
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

const mouseBytes = entryBytes("data/ini/mouse.ini");
if (mouseBytes.length > mouseExports.generals_mouse_input_capacity()) {
  throw new Error(`Mouse payload exceeds ${mouseExports.generals_mouse_input_capacity()} byte wasm buffer`);
}

mouseMemory.set(mouseBytes, mouseExports.generals_mouse_input_ptr());
const parsedCount = mouseExports.generals_mouse_parse(mouseBytes.length);
if (parsedCount < 0 || mouseExports.generals_mouse_error_count() !== 0) {
  throw new Error(`Mouse parse failed: parsed=${parsedCount}, errors=${mouseExports.generals_mouse_error_count()}`);
}

function cursorString(prefix, index) {
  return readMouseString(
    mouseExports[`generals_mouse_cursor_${prefix}_ptr`](index),
    mouseExports[`generals_mouse_cursor_${prefix}_size`](index)
  );
}

function summarize(index) {
  return {
    index,
    name: cursorString("name", index),
    image: cursorString("image", index),
    texture: cursorString("texture", index),
    directions: mouseExports.generals_mouse_cursor_directions(index),
    frames: mouseExports.generals_mouse_cursor_frames(index),
    line: mouseExports.generals_mouse_cursor_line(index),
    fields: mouseExports.generals_mouse_cursor_field_count_at(index),
  };
}

function find(name) {
  for (let index = 0; index < mouseExports.generals_mouse_count(); ++index) {
    if (cursorString("name", index) === name) {
      return summarize(index);
    }
  }

  throw new Error(`MouseCursor not found: ${name}`);
}

const settings = {
  fontName: readMouseString(mouseExports.generals_mouse_tooltip_font_name_ptr(), mouseExports.generals_mouse_tooltip_font_name_size()),
  fontSize: mouseExports.generals_mouse_tooltip_font_size(),
  fillTime: mouseExports.generals_mouse_tooltip_fill_time(),
  delayTime: mouseExports.generals_mouse_tooltip_delay_time(),
  width: mouseExports.generals_mouse_tooltip_width(),
  dragTolerance: mouseExports.generals_mouse_drag_tolerance(),
  dragToleranceMs: mouseExports.generals_mouse_drag_tolerance_ms(),
  orthoCamera: mouseExports.generals_mouse_ortho_camera(),
  orthoZoomX100: mouseExports.generals_mouse_ortho_zoom_x100(),
};

const summary = {
  archive: archivePath,
  mouseBytes: mouseBytes.length,
  parsedCount,
  count: mouseExports.generals_mouse_count(),
  hasSettings: mouseExports.generals_mouse_has_settings(),
  settingsFieldCount: mouseExports.generals_mouse_settings_field_count(),
  fieldCount: mouseExports.generals_mouse_field_count(),
  lineCount: mouseExports.generals_mouse_line_count(),
  settings,
  first: summarize(0),
  scroll: find("Scroll"),
};

if (summary.mouseBytes !== 5663 ||
    summary.parsedCount !== 37 ||
    summary.count !== 37 ||
    summary.hasSettings !== 1 ||
    summary.settingsFieldCount !== 20 ||
    summary.fieldCount !== 95 ||
    summary.lineCount !== 220) {
  throw new Error(`unexpected Mouse aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (settings.fontName !== "Arial" ||
    settings.fontSize !== 8 ||
    settings.fillTime !== 250 ||
    settings.delayTime !== 800 ||
    settings.width !== 20 ||
    settings.dragTolerance !== 25 ||
    settings.dragToleranceMs !== 250 ||
    settings.orthoCamera !== 1 ||
    settings.orthoZoomX100 !== 50) {
  throw new Error(`unexpected Mouse settings: ${JSON.stringify(settings)}`);
}

if (summary.first.name !== "Normal" ||
    summary.first.image !== "SCCPointer" ||
    summary.first.texture !== "SCCPointer" ||
    summary.first.fields !== 2) {
  throw new Error(`unexpected first cursor: ${JSON.stringify(summary.first)}`);
}

if (summary.scroll.directions !== 8 ||
    summary.scroll.image !== "SCCScroll") {
  throw new Error(`unexpected Scroll cursor: ${JSON.stringify(summary.scroll)}`);
}

console.log(JSON.stringify(summary, null, 2));
