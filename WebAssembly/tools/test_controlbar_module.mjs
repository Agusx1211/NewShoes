import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_controlbar.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function schemeString(prefix, index) {
  return readString(
    exports[`generals_controlbar_scheme_${prefix}_ptr`](index),
    exports[`generals_controlbar_scheme_${prefix}_size`](index)
  );
}

function imageName(index) {
  return readString(
    exports.generals_controlbar_image_part_name_ptr(index),
    exports.generals_controlbar_image_part_name_size(index)
  );
}

function animationString(prefix, index) {
  return readString(
    exports[`generals_controlbar_animation_${prefix}_ptr`](index),
    exports[`generals_controlbar_animation_${prefix}_size`](index)
  );
}

const source = `
ControlBarScheme Test8x6
  ScreenCreationRes X:800 Y:600
  Side America
  QueueButtonImage SCBigButton
  RightHUDImage SALogo
  CommandBarBorderColor R:1 G:2 B:3 A:4
  BuildUpClockColor R:5 G:6 B:7 A:8
  PowerBarUL X:260 Y:470
  PowerBarLR X:538 Y:476
  MoneyUL X:360 Y:438
  MoneyLR X:439 Y:457
  CommandMarkerImage SAEmptyFrame
  PowerPurchaseImage GeneralsPowerWindow_American
  ImagePart
    Position X:0 Y:408
    Size X:800 Y:191
    ImageName InGameUIAmericaBase
    Layer 4
  End
  AnimatingPart
    Name Slide
    Animation SLIDE_RIGHT
    Duration 750
    FinalPos X:12 Y:34
    ImagePart
      Position X:1 Y:2
      Size X:3 Y:4
      ImageName AnimImage
      Layer 2
    End
  End
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_controlbar_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_controlbar_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_controlbar_input_ptr());
const parsedCount = exports.generals_controlbar_parse(bytes.length);
if (parsedCount < 0 || exports.generals_controlbar_error_count() !== 0) {
  throw new Error(`ControlBarScheme parse failed: parsed=${parsedCount}, errors=${exports.generals_controlbar_error_count()}`);
}

if (parsedCount !== 4 ||
    exports.generals_controlbar_scheme_count() !== 1 ||
    exports.generals_controlbar_image_part_count() !== 2 ||
    exports.generals_controlbar_animation_count() !== 1 ||
    exports.generals_controlbar_field_count() !== 24 ||
    exports.generals_controlbar_scheme_field_count_at(0) !== 24 ||
    exports.generals_controlbar_scheme_image_count_at(0) !== 2 ||
    exports.generals_controlbar_scheme_animation_count_at(0) !== 1) {
  throw new Error("unexpected ControlBarScheme aggregate parse");
}

if (schemeString("name", 0) !== "Test8x6" ||
    schemeString("side", 0) !== "America" ||
    schemeString("queue_button_image", 0) !== "SCBigButton" ||
    schemeString("right_hud_image", 0) !== "SALogo" ||
    schemeString("command_marker_image", 0) !== "SAEmptyFrame" ||
    schemeString("power_purchase_image", 0) !== "GeneralsPowerWindow_American" ||
    exports.generals_controlbar_scheme_screen_creation_res_x(0) !== 800 ||
    exports.generals_controlbar_scheme_screen_creation_res_y(0) !== 600 ||
    exports.generals_controlbar_scheme_command_bar_border_color_r(0) !== 1 ||
    exports.generals_controlbar_scheme_command_bar_border_color_a(0) !== 4 ||
    exports.generals_controlbar_scheme_build_up_clock_color_g(0) !== 6 ||
    exports.generals_controlbar_scheme_power_bar_ul_x(0) !== 260 ||
    exports.generals_controlbar_scheme_power_bar_lr_y(0) !== 476 ||
    exports.generals_controlbar_scheme_money_ul_y(0) !== 438) {
  throw new Error("unexpected ControlBarScheme values");
}

if (exports.generals_controlbar_scheme_first_image(0) !== 0 ||
    imageName(0) !== "InGameUIAmericaBase" ||
    exports.generals_controlbar_image_part_position_y(0) !== 408 ||
    exports.generals_controlbar_image_part_size_x(0) !== 800 ||
    exports.generals_controlbar_image_part_layer(0) !== 4 ||
    exports.generals_controlbar_image_part_animation_index(0) !== -1 ||
    imageName(1) !== "AnimImage" ||
    exports.generals_controlbar_image_part_animation_index(1) !== 0 ||
    animationString("name", 0) !== "Slide" ||
    animationString("type", 0) !== "SLIDE_RIGHT" ||
    exports.generals_controlbar_animation_duration(0) !== 750 ||
    exports.generals_controlbar_animation_final_pos_x(0) !== 12 ||
    exports.generals_controlbar_animation_image_index(0) !== 1) {
  throw new Error("unexpected ControlBarScheme nested values");
}

console.log(JSON.stringify({
  module: wasmPath,
  schemes: exports.generals_controlbar_scheme_count(),
  images: exports.generals_controlbar_image_part_count(),
  animations: exports.generals_controlbar_animation_count(),
  first: schemeString("name", 0),
}, null, 2));
