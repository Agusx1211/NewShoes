import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_miscaudio.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
MiscAudio
  RadarNotifyUnitUnderAttackSound = TestRadarNotify
  RadarNotifyInfiltrationSound = NoSound
  DefectorTimerDingSound = DefectorDing ExtraTokenIgnored
  CrateMoney = CrateMoneyEvent ; comment
  SabotageResetTimeBuilding = SabotageBuilding;temp
  UnknownField = Ignored
End

CrateMoney = IgnoredOutsideBlock
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_miscaudio_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_miscaudio_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_miscaudio_input_ptr());
const parsedCount = exports.generals_miscaudio_parse(bytes.length);
if (parsedCount < 0 || exports.generals_miscaudio_error_count() !== 0) {
  throw new Error(`MiscAudio parse failed: parsed=${parsedCount}, errors=${exports.generals_miscaudio_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function slotField(index) {
  return readString(
    exports.generals_miscaudio_slot_field_ptr(index),
    exports.generals_miscaudio_slot_field_size(index)
  );
}

function slotEvent(index) {
  return readString(
    exports.generals_miscaudio_slot_event_ptr(index),
    exports.generals_miscaudio_slot_event_size(index)
  );
}

function findSlot(field) {
  for (let index = 0; index < exports.generals_miscaudio_slot_count(); ++index) {
    if (slotField(index) === field) {
      return index;
    }
  }

  throw new Error(`slot not found: ${field}`);
}

const unitAttack = findSlot("RadarNotifyUnitUnderAttackSound");
const infiltration = findSlot("RadarNotifyInfiltrationSound");
const defectorDing = findSlot("DefectorTimerDingSound");
const crateMoney = findSlot("CrateMoney");
const sabotageReset = findSlot("SabotageResetTimeBuilding");

if (exports.generals_miscaudio_slot_count() !== 36 ||
    exports.generals_miscaudio_field_count() !== 5 ||
    exports.generals_miscaudio_assigned_count() !== 5 ||
    exports.generals_miscaudio_event_count() !== 4 ||
    parsedCount !== 4 ||
    exports.generals_miscaudio_no_sound_count() !== 1 ||
    exports.generals_miscaudio_missing_count() !== 32) {
  throw new Error("unexpected MiscAudio aggregate parse");
}

if (slotEvent(unitAttack) !== "TestRadarNotify" ||
    exports.generals_miscaudio_slot_line(unitAttack) !== 3 ||
    exports.generals_miscaudio_slot_assigned(unitAttack) !== 1 ||
    exports.generals_miscaudio_slot_has_event(unitAttack) !== 1) {
  throw new Error("unexpected RadarNotifyUnitUnderAttackSound parse");
}

if (slotEvent(infiltration) !== "" ||
    exports.generals_miscaudio_slot_assigned(infiltration) !== 1 ||
    exports.generals_miscaudio_slot_has_event(infiltration) !== 0 ||
    exports.generals_miscaudio_slot_no_sound(infiltration) !== 1) {
  throw new Error("unexpected NoSound parse");
}

if (slotEvent(defectorDing) !== "DefectorDing" ||
    slotEvent(crateMoney) !== "CrateMoneyEvent" ||
    slotEvent(sabotageReset) !== "SabotageBuilding") {
  throw new Error("unexpected MiscAudio event values");
}

console.log(JSON.stringify({
  module: wasmPath,
  slots: exports.generals_miscaudio_slot_count(),
  events: exports.generals_miscaudio_event_count(),
  first: slotEvent(unitAttack),
}, null, 2));
