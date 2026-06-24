import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_transition.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
WindowTransition MainMenuFade
  Window
    WinName = MainMenu.wnd:MainMenuRuler
    Style   = WINFADE
    FrameDelay = 0
  END
  FireOnce = YES
END

WindowTransition MainMenuButtons
  Window
    WinName = MainMenu.wnd:ButtonSinglePlayer
    Style   = BUTTONFLASH
    FrameDelay = 5
  END
  Window
    WinName = MainMenu.wnd:ButtonOptions
    Style   = BUTTONFLASH
    FrameDelay = 8
  END
  FireOnce = NO
END
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_transition_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_transition_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_transition_input_ptr());
const count = exports.generals_transition_parse(bytes.length);
if (count < 0 || exports.generals_transition_error_count() !== 0) {
  throw new Error(`Transition parse failed: parsed=${count}, errors=${exports.generals_transition_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function groupName(index) {
  return readString(exports.generals_transition_name_ptr(index), exports.generals_transition_name_size(index));
}

function windowName(index) {
  return readString(exports.generals_transition_window_name_ptr(index), exports.generals_transition_window_name_size(index));
}

function windowStyleName(index) {
  return readString(exports.generals_transition_window_style_name_ptr(index), exports.generals_transition_window_style_name_size(index));
}

if (count !== 2 ||
    exports.generals_transition_count() !== 2 ||
    exports.generals_transition_window_total() !== 3 ||
    exports.generals_transition_style_count() !== 15 ||
    exports.generals_transition_field_count_at(0) !== 2 ||
    exports.generals_transition_field_count_at(1) !== 3) {
  throw new Error("unexpected Transition aggregate parse");
}

if (groupName(0) !== "MainMenuFade" ||
    exports.generals_transition_fire_once(0) !== 1 ||
    exports.generals_transition_window_count(0) !== 1 ||
    exports.generals_transition_first_window(0) !== 0) {
  throw new Error("unexpected first group");
}

if (groupName(1) !== "MainMenuButtons" ||
    exports.generals_transition_fire_once(1) !== 0 ||
    exports.generals_transition_window_count(1) !== 2 ||
    exports.generals_transition_first_window(1) !== 1) {
  throw new Error("unexpected second group");
}

// Lookup-list style names map to the sequential transition enum: WINFADE = 2,
// BUTTONFLASH = 1.
if (windowName(0) !== "MainMenu.wnd:MainMenuRuler" ||
    exports.generals_transition_window_group_index(0) !== 0 ||
    exports.generals_transition_window_style(0) !== 2 ||
    windowStyleName(0) !== "WINFADE" ||
    exports.generals_transition_window_frame_delay(0) !== 0 ||
    windowName(1) !== "MainMenu.wnd:ButtonSinglePlayer" ||
    exports.generals_transition_window_style(1) !== 1 ||
    windowStyleName(1) !== "BUTTONFLASH" ||
    exports.generals_transition_window_frame_delay(1) !== 5 ||
    exports.generals_transition_window_group_index(2) !== 1 ||
    exports.generals_transition_window_frame_delay(2) !== 8) {
  throw new Error("unexpected Window sub-block parse");
}

console.log(JSON.stringify({
  module: wasmPath,
  groups: exports.generals_transition_count(),
  windows: exports.generals_transition_window_total(),
  fields: exports.generals_transition_field_count(),
  first: groupName(0),
}, null, 2));
