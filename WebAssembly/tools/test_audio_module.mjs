import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_audio.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function eventString(prefix, index) {
  return readString(
    exports[`generals_audio_event_${prefix}_ptr`](index),
    exports[`generals_audio_event_${prefix}_size`](index)
  );
}

function enumName(kind, index) {
  return readString(
    exports[`generals_audio_${kind}_name_ptr`](index),
    exports[`generals_audio_${kind}_name_size`](index)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_audio_input_ptr());
  const parsedCount = exports.generals_audio_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_audio_error_count() !== 0) {
    throw new Error(`AudioEvent parse failed: parsed=${parsedCount}, errors=${exports.generals_audio_error_count()}`);
  }
  return parsedCount;
}

parse(`
AudioEvent TestExplosion
  Sounds = boom1 boom2 boom3 ; comment after list
  Attack = start1
  Decay = end1 end2
  Control = interrupt random
  Priority = low
  Limit = 2
  PitchShift = -10 10
  VolumeShift = -20
  Volume = 90
  LowPassCutoff = 50
  Type = world shrouded everyone
  MinRange = 175.00
  MaxRange = 800.00
End

MusicTrack TrackTest
  Filename = USA_09.mp3
  Volume = 70
End

DialogEvent EvaTest
  Filename = eva.wav
  Volume = 90
  Delay = 100 250
  Type = ui voice player
End
`);

if (exports.generals_audio_event_count() !== 3 ||
    exports.generals_audio_field_count() !== 19 ||
    exports.generals_audio_sound_reference_count() !== 6 ||
    exports.generals_audio_category_count(0) !== 1 ||
    exports.generals_audio_category_count(1) !== 1 ||
    exports.generals_audio_category_count(2) !== 1 ||
    exports.generals_audio_priority_count(1) !== 1 ||
    exports.generals_audio_priority_count(2) !== 2 ||
    exports.generals_audio_type_flag_count(0) !== 1 ||
    exports.generals_audio_type_flag_count(1) !== 1 ||
    exports.generals_audio_type_flag_count(2) !== 1 ||
    exports.generals_audio_type_flag_count(4) !== 1 ||
    exports.generals_audio_type_flag_count(5) !== 1 ||
    exports.generals_audio_type_flag_count(8) !== 1 ||
    exports.generals_audio_control_flag_count(1) !== 1 ||
    exports.generals_audio_control_flag_count(4) !== 1) {
  throw new Error("unexpected aggregate AudioEvent parse result");
}

if (enumName("category", 0) !== "AudioEvent" ||
    enumName("priority", 3) !== "HIGH" ||
    enumName("type", 8) !== "EVERYONE" ||
    enumName("control", 4) !== "INTERRUPT") {
  throw new Error("unexpected AudioEvent enum names");
}

if (eventString("name", 0) !== "TestExplosion" ||
    eventString("sounds", 0) !== "boom1 boom2 boom3" ||
    eventString("attack", 0) !== "start1" ||
    eventString("decay", 0) !== "end1 end2" ||
    exports.generals_audio_event_line(0) !== 2 ||
    exports.generals_audio_event_field_count_at(0) !== 13 ||
    exports.generals_audio_event_category(0) !== 0 ||
    exports.generals_audio_event_priority(0) !== 1 ||
    exports.generals_audio_event_type_mask(0) !== 262 ||
    exports.generals_audio_event_control_mask(0) !== 18 ||
    exports.generals_audio_event_volume_x100(0) !== 9000 ||
    exports.generals_audio_event_volume_shift_x100(0) !== -2000 ||
    exports.generals_audio_event_pitch_shift_min_x100(0) !== 9000 ||
    exports.generals_audio_event_pitch_shift_max_x100(0) !== 11000 ||
    exports.generals_audio_event_limit(0) !== 2 ||
    exports.generals_audio_event_min_range_x100(0) !== 17500 ||
    exports.generals_audio_event_max_range_x100(0) !== 80000 ||
    exports.generals_audio_event_low_pass_cutoff_x100(0) !== 5000 ||
    exports.generals_audio_event_sound_token_count(0) !== 6) {
  throw new Error("unexpected TestExplosion parse result");
}

if (eventString("name", 1) !== "TrackTest" ||
    eventString("filename", 1) !== "USA_09.mp3" ||
    exports.generals_audio_event_category(1) !== 1 ||
    exports.generals_audio_event_volume_x100(1) !== 7000) {
  throw new Error("unexpected TrackTest parse result");
}

if (eventString("name", 2) !== "EvaTest" ||
    eventString("filename", 2) !== "eva.wav" ||
    exports.generals_audio_event_category(2) !== 2 ||
    exports.generals_audio_event_delay_min(2) !== 100 ||
    exports.generals_audio_event_delay_max(2) !== 250 ||
    exports.generals_audio_event_type_mask(2) !== 49) {
  throw new Error("unexpected EvaTest parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  events: exports.generals_audio_event_count(),
  fields: exports.generals_audio_field_count(),
  sounds: exports.generals_audio_sound_reference_count(),
  first: eventString("name", 0),
}, null, 2));
