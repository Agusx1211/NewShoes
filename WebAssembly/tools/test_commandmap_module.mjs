import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_commandmap.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
CommandMap DEBUG_OBJECT_ID_PERFORMANCE
  Key = KEY_Q
  Transition = DOWN
  Modifiers = SHIFT_ALT_CTRL
  UseableIn = GAME
End

CommandMap PLACE_BEACON
  Key = KEY_B
  Transition = DOWN
  Modifiers = None
  UseableIn = GAME SHELL
  Category = MISC
  Description = TOOLTIP:PlaceBeacon
  DisplayName = GUI:PlaceBeacon
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_commandmap_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_commandmap_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_commandmap_input_ptr());
const count = exports.generals_commandmap_parse(bytes.length);
if (count < 0 || exports.generals_commandmap_error_count() !== 0) {
  throw new Error(`CommandMap parse failed: parsed=${count}, errors=${exports.generals_commandmap_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function commandString(prefix, index) {
  return readString(
    exports[`generals_commandmap_${prefix}_ptr`](index),
    exports[`generals_commandmap_${prefix}_size`](index)
  );
}

if (count !== 2 ||
    exports.generals_commandmap_count() !== 2 ||
    exports.generals_commandmap_field_count_at(0) !== 4 ||
    exports.generals_commandmap_field_count_at(1) !== 7 ||
    exports.generals_commandmap_field_count() !== 11) {
  throw new Error("unexpected CommandMap aggregate parse");
}

if (commandString("name", 0) !== "DEBUG_OBJECT_ID_PERFORMANCE" ||
    commandString("key", 0) !== "KEY_Q" ||
    commandString("transition", 0) !== "DOWN" ||
    commandString("modifiers", 0) !== "SHIFT_ALT_CTRL" ||
    commandString("useable_in", 0) !== "GAME") {
  throw new Error("unexpected first command");
}

// UseableIn keeps the full multi-token bit string; the translated labels parse.
if (commandString("name", 1) !== "PLACE_BEACON" ||
    commandString("key", 1) !== "KEY_B" ||
    commandString("modifiers", 1) !== "None" ||
    commandString("useable_in", 1) !== "GAME SHELL" ||
    commandString("category", 1) !== "MISC" ||
    commandString("description", 1) !== "TOOLTIP:PlaceBeacon" ||
    commandString("display_name", 1) !== "GUI:PlaceBeacon") {
  throw new Error("unexpected second command");
}

console.log(JSON.stringify({
  module: wasmPath,
  commands: exports.generals_commandmap_count(),
  fields: exports.generals_commandmap_field_count(),
  first: commandString("name", 0),
  firstKey: commandString("key", 0),
}, null, 2));
