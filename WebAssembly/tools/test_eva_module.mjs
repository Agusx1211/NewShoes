import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_eva.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
EvaEvent LowPower
  Priority = 2
  TimeBetweenChecksMS = 120000
  ExpirationTimeMS = 5000

  SideSounds
    Side = America
    Sounds = EvaUSA_LowPower
  End

  SideSounds
    Side = China
    Sounds = EvaChina_LowPower EvaChina_LowPowerAlt
  End
End

EvaEvent InsufficientFunds
  Priority = 3
  ExpirationTimeMS = 5000

  SideSounds
    Side = GLA
    Sounds = EvaGLA_InsufficientFunds
  End
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_eva_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_eva_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_eva_input_ptr());
const count = exports.generals_eva_parse(bytes.length);
if (count < 0 || exports.generals_eva_error_count() !== 0) {
  throw new Error(`Eva parse failed: parsed=${count}, errors=${exports.generals_eva_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function eventName(index) {
  return readString(exports.generals_eva_name_ptr(index), exports.generals_eva_name_size(index));
}

function sideSoundSide(index) {
  return readString(exports.generals_eva_side_sound_side_ptr(index), exports.generals_eva_side_sound_side_size(index));
}

function sideSoundFirst(index) {
  return readString(exports.generals_eva_side_sound_first_sound_ptr(index), exports.generals_eva_side_sound_first_sound_size(index));
}

if (count !== 2 ||
    exports.generals_eva_count() !== 2 ||
    exports.generals_eva_side_sounds_total() !== 3 ||
    exports.generals_eva_field_count() !== 11 ||
    exports.generals_eva_field_count_at(0) !== 3 ||
    exports.generals_eva_field_count_at(1) !== 2) {
  throw new Error("unexpected Eva aggregate parse");
}

if (eventName(0) !== "LowPower" ||
    exports.generals_eva_priority(0) !== 2 ||
    exports.generals_eva_time_between_checks_ms(0) !== 120000 ||
    exports.generals_eva_expiration_time_ms(0) !== 5000 ||
    exports.generals_eva_side_sounds_count(0) !== 2 ||
    exports.generals_eva_first_side_sound(0) !== 0) {
  throw new Error("unexpected first Eva event");
}

if (eventName(1) !== "InsufficientFunds" ||
    exports.generals_eva_priority(1) !== 3 ||
    exports.generals_eva_time_between_checks_ms(1) !== 0 ||
    exports.generals_eva_side_sounds_count(1) !== 1 ||
    exports.generals_eva_first_side_sound(1) !== 2) {
  throw new Error("unexpected second Eva event");
}

// SideSounds groups are flat and keyed back to their owning event.
if (sideSoundSide(0) !== "America" ||
    sideSoundFirst(0) !== "EvaUSA_LowPower" ||
    exports.generals_eva_side_sound_count_at(0) !== 1 ||
    exports.generals_eva_side_sound_event_index(0) !== 0 ||
    sideSoundSide(1) !== "China" ||
    sideSoundFirst(1) !== "EvaChina_LowPower" ||
    exports.generals_eva_side_sound_count_at(1) !== 2 ||
    sideSoundSide(2) !== "GLA" ||
    exports.generals_eva_side_sound_event_index(2) !== 1) {
  throw new Error("unexpected Eva SideSounds parse");
}

console.log(JSON.stringify({
  module: wasmPath,
  events: exports.generals_eva_count(),
  sideSounds: exports.generals_eva_side_sounds_total(),
  fields: exports.generals_eva_field_count(),
  first: eventName(0),
}, null, 2));
