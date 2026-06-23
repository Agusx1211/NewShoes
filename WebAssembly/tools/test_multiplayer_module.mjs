import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_multiplayer.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function chatColorName(index) {
  return readString(
    exports.generals_multiplayer_chat_color_name_ptr(index),
    exports.generals_multiplayer_chat_color_name_size(index)
  );
}

function colorString(prefix, index) {
  return readString(
    exports[`generals_multiplayer_color_${prefix}_ptr`](index),
    exports[`generals_multiplayer_color_${prefix}_size`](index)
  );
}

const source = `
OnlineChatColors
  Default = R:255 G:255 B:255
  ChatSelf = R:255 G:128 B:0
End

MultiplayerSettings
  StartCountdownTimer = 5
  MaxBeaconsPerPlayer = 3
  UseShroud = No
  ShowRandomPlayerTemplate = Yes
  ShowRandomStartPos = Yes
  ShowRandomColor = Yes
End

MultiplayerColor ColorGold
  RGBColor = R:221 G:226 B:13
  RGBNightColor = R:201 G:206 B:33
  TooltipName = Color:Gold
End

MultiplayerStartingMoneyChoice
  Value = 5000

MultiplayerStartingMoneyChoice
  Value = 10000
  Default = Yes
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_multiplayer_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_multiplayer_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_multiplayer_input_ptr());
const parsedCount = exports.generals_multiplayer_parse(bytes.length);
if (parsedCount < 0 || exports.generals_multiplayer_error_count() !== 0) {
  throw new Error(`Multiplayer parse failed: parsed=${parsedCount}, errors=${exports.generals_multiplayer_error_count()}`);
}

if (parsedCount !== 5 ||
    exports.generals_multiplayer_field_count() !== 14 ||
    exports.generals_multiplayer_settings_field_count() !== 6 ||
    exports.generals_multiplayer_chat_color_count() !== 2 ||
    exports.generals_multiplayer_color_count() !== 1 ||
    exports.generals_multiplayer_money_choice_count() !== 2) {
  throw new Error("unexpected Multiplayer aggregate parse");
}

if (exports.generals_multiplayer_start_countdown_timer() !== 5 ||
    exports.generals_multiplayer_max_beacons_per_player() !== 3 ||
    exports.generals_multiplayer_use_shroud() !== 0 ||
    exports.generals_multiplayer_show_random_player_template() !== 1 ||
    exports.generals_multiplayer_show_random_start_pos() !== 1 ||
    exports.generals_multiplayer_show_random_color() !== 1 ||
    exports.generals_multiplayer_default_starting_money() !== 10000) {
  throw new Error("unexpected Multiplayer settings values");
}

if (chatColorName(0) !== "Default" ||
    exports.generals_multiplayer_chat_color_r(0) !== 255 ||
    exports.generals_multiplayer_chat_color_g(0) !== 255 ||
    exports.generals_multiplayer_chat_color_b(0) !== 255 ||
    chatColorName(1) !== "ChatSelf" ||
    exports.generals_multiplayer_chat_color_r(1) !== 255 ||
    exports.generals_multiplayer_chat_color_g(1) !== 128 ||
    exports.generals_multiplayer_chat_color_b(1) !== 0) {
  throw new Error("unexpected Multiplayer chat color parse");
}

if (colorString("name", 0) !== "ColorGold" ||
    colorString("tooltip", 0) !== "Color:Gold" ||
    exports.generals_multiplayer_color_r(0) !== 221 ||
    exports.generals_multiplayer_color_g(0) !== 226 ||
    exports.generals_multiplayer_color_b(0) !== 13 ||
    exports.generals_multiplayer_color_night_r(0) !== 201 ||
    exports.generals_multiplayer_color_night_g(0) !== 206 ||
    exports.generals_multiplayer_color_night_b(0) !== 33 ||
    exports.generals_multiplayer_color_field_count_at(0) !== 3) {
  throw new Error("unexpected Multiplayer color parse");
}

if (exports.generals_multiplayer_money_value(0) !== 5000 ||
    exports.generals_multiplayer_money_is_default(0) !== 0 ||
    exports.generals_multiplayer_money_field_count_at(0) !== 1 ||
    exports.generals_multiplayer_money_value(1) !== 10000 ||
    exports.generals_multiplayer_money_is_default(1) !== 1 ||
    exports.generals_multiplayer_money_field_count_at(1) !== 2) {
  throw new Error("unexpected Multiplayer money choice parse");
}

console.log(JSON.stringify({
  module: wasmPath,
  parsed: exports.generals_multiplayer_parsed_count(),
  colors: exports.generals_multiplayer_color_count(),
  moneyChoices: exports.generals_multiplayer_money_choice_count(),
  defaultMoney: exports.generals_multiplayer_default_starting_money(),
}, null, 2));
