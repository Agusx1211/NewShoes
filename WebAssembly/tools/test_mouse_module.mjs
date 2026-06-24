import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_mouse.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
Mouse
  TooltipFontName = Arial
  TooltipFontSize = 8
  TooltipFontIsBold = No
  TooltipTextColor = R:220 G:220 B:220 A:255
  TooltipWidth = 20
  OrthoCamera = Yes
  OrthoZoom = 0.5
  DragTolerance = 25
End

MouseCursor Normal
  Texture = SCCPointer
  Image = SCCPointer
End

MouseCursor Scroll
  Texture = SCCScroll
  Image = SCCScroll
  Directions = 8
End

MouseCursor Target
  CursorText = TOOLTIP_TARGET
  CursorTextColor = R:255 G:0 B:0 A:255
  Image = SCCAttack
  Texture = SCCAttack
  HotSpot = X:16 Y:15
  Frames = 4
  FPS = 30.0
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_mouse_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_mouse_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_mouse_input_ptr());
const count = exports.generals_mouse_parse(bytes.length);
if (count < 0 || exports.generals_mouse_error_count() !== 0) {
  throw new Error(`Mouse parse failed: parsed=${count}, errors=${exports.generals_mouse_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function cursorString(prefix, index) {
  return readString(
    exports[`generals_mouse_cursor_${prefix}_ptr`](index),
    exports[`generals_mouse_cursor_${prefix}_size`](index)
  );
}

if (count !== 3 ||
    exports.generals_mouse_count() !== 3 ||
    exports.generals_mouse_has_settings() !== 1 ||
    exports.generals_mouse_settings_field_count() !== 8 ||
    exports.generals_mouse_field_count() !== 20 ||
    exports.generals_mouse_cursor_field_count_at(0) !== 2 ||
    exports.generals_mouse_cursor_field_count_at(1) !== 3 ||
    exports.generals_mouse_cursor_field_count_at(2) !== 7) {
  throw new Error("unexpected Mouse aggregate parse");
}

if (readString(exports.generals_mouse_tooltip_font_name_ptr(), exports.generals_mouse_tooltip_font_name_size()) !== "Arial" ||
    exports.generals_mouse_tooltip_font_size() !== 8 ||
    exports.generals_mouse_tooltip_font_is_bold() !== 0 ||
    exports.generals_mouse_tooltip_width() !== 20 ||
    exports.generals_mouse_ortho_camera() !== 1 ||
    exports.generals_mouse_ortho_zoom_x100() !== 50 ||
    exports.generals_mouse_drag_tolerance() !== 25) {
  throw new Error("unexpected Mouse settings parse");
}

if (cursorString("name", 0) !== "Normal" ||
    cursorString("image", 0) !== "SCCPointer" ||
    cursorString("texture", 0) !== "SCCPointer" ||
    cursorString("name", 1) !== "Scroll" ||
    exports.generals_mouse_cursor_directions(1) !== 8) {
  throw new Error("unexpected basic cursor parse");
}

if (cursorString("name", 2) !== "Target" ||
    cursorString("text", 2) !== "TOOLTIP_TARGET" ||
    exports.generals_mouse_cursor_text_color_r(2) !== 255 ||
    exports.generals_mouse_cursor_text_color_g(2) !== 0 ||
    exports.generals_mouse_cursor_text_color_b(2) !== 0 ||
    exports.generals_mouse_cursor_text_color_a(2) !== 255 ||
    exports.generals_mouse_cursor_hotspot_x(2) !== 16 ||
    exports.generals_mouse_cursor_hotspot_y(2) !== 15 ||
    exports.generals_mouse_cursor_frames(2) !== 4 ||
    exports.generals_mouse_cursor_fps_x100(2) !== 3000) {
  throw new Error("unexpected animated cursor parse");
}

console.log(JSON.stringify({
  module: wasmPath,
  cursors: exports.generals_mouse_count(),
  settingsFields: exports.generals_mouse_settings_field_count(),
  fields: exports.generals_mouse_field_count(),
  font: readString(exports.generals_mouse_tooltip_font_name_ptr(), exports.generals_mouse_tooltip_font_name_size()),
}, null, 2));
