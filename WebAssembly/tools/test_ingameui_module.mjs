import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_ingameui.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Two RadiusCursor fields open nested sub-blocks; their inner End must not close
// the InGameUI block, and their inner Texture/Style lines must not be counted.
const source = `
InGameUI
  MaxSelectionSize = 0
  MessageColor1 = R:255 G:255 B:255
  MessageColor2 = R:180 G:180 B:255
  MessagePosition = X:10 Y:10
  MessageFont = Arial
  MessagePointSize = 10
  MessageBold = Yes
  MessageDelayMS = 75000
  MilitaryCaptionColor = R:255 G:255 B:255 A:255
  FloatingTextTimeOut = 333

  SpyDroneRadiusCursor
    Texture = SccSpyDrone_USA
    Style = SHADOW_ALPHA_DECAL
    OpacityMin = 50%
  End

  AttackDamageAreaRadiusCursor
    Texture = SccAttackDamage
    Style = SHADOW_ALPHA_DECAL
  End

  DrawableCaptionFont = Arial
  DrawableCaptionPointSize = 9
  DrawableCaptionBold = Yes
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_ingameui_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_ingameui_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_ingameui_input_ptr());
const fields = exports.generals_ingameui_parse(bytes.length);
if (fields < 0 || exports.generals_ingameui_error_count() !== 0) {
  throw new Error(`InGameUI parse failed: fields=${fields}, errors=${exports.generals_ingameui_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

// 10 scalar fields + 2 radius-cursor bindings + 3 drawable-caption fields = 15.
if (fields !== 15 ||
    exports.generals_ingameui_field_count() !== 15 ||
    exports.generals_ingameui_has_block() !== 1 ||
    exports.generals_ingameui_radius_cursor_count() !== 2 ||
    exports.generals_ingameui_known_field_count() !== 77) {
  throw new Error("unexpected InGameUI aggregate parse");
}

if (exports.generals_ingameui_max_selection_size() !== 0 ||
    exports.generals_ingameui_message_color1_r() !== 255 ||
    exports.generals_ingameui_message_color1_g() !== 255 ||
    exports.generals_ingameui_message_color1_b() !== 255 ||
    exports.generals_ingameui_message_color2_r() !== 180 ||
    exports.generals_ingameui_message_color2_b() !== 255 ||
    exports.generals_ingameui_message_pos_x() !== 10 ||
    exports.generals_ingameui_message_pos_y() !== 10 ||
    readString(exports.generals_ingameui_message_font_ptr(), exports.generals_ingameui_message_font_size()) !== "Arial" ||
    exports.generals_ingameui_message_point_size() !== 10 ||
    exports.generals_ingameui_message_bold() !== 1 ||
    exports.generals_ingameui_message_delay_ms() !== 75000 ||
    exports.generals_ingameui_military_color_a() !== 255 ||
    exports.generals_ingameui_floating_text_time_out() !== 333) {
  throw new Error("unexpected InGameUI message settings");
}

if (readString(exports.generals_ingameui_drawable_caption_font_ptr(), exports.generals_ingameui_drawable_caption_font_size()) !== "Arial" ||
    exports.generals_ingameui_drawable_caption_point_size() !== 9 ||
    exports.generals_ingameui_drawable_caption_bold() !== 1) {
  throw new Error("unexpected InGameUI drawable caption settings (block nesting may be wrong)");
}

function cursorString(prefix, index) {
  return readString(
    exports[`generals_ingameui_radius_cursor_${prefix}_ptr`](index),
    exports[`generals_ingameui_radius_cursor_${prefix}_size`](index)
  );
}

// The two RadiusCursor sub-blocks must be captured with their texture and style.
if (exports.generals_ingameui_stored_radius_cursor_count() !== 2 ||
    cursorString("name", 0) !== "SpyDroneRadiusCursor" ||
    cursorString("texture", 0) !== "SccSpyDrone_USA" ||
    cursorString("style", 0) !== "SHADOW_ALPHA_DECAL" ||
    cursorString("name", 1) !== "AttackDamageAreaRadiusCursor" ||
    cursorString("texture", 1) !== "SccAttackDamage") {
  throw new Error("unexpected InGameUI radius cursor capture");
}

console.log(JSON.stringify({
  module: wasmPath,
  fields: exports.generals_ingameui_field_count(),
  radiusCursors: exports.generals_ingameui_radius_cursor_count(),
  messageFont: readString(exports.generals_ingameui_message_font_ptr(), exports.generals_ingameui_message_font_size()),
  messageDelayMs: exports.generals_ingameui_message_delay_ms(),
}, null, 2));
