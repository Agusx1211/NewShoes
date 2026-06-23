import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const miscAudioWasmPath = resolve(wasmDir, "dist/generals_miscaudio.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, miscAudioWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(miscAudioWasmPath),
  readFile(archivePath),
]);
const [bigModule, miscAudioModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(miscAudioWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const miscAudioExports = miscAudioModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const miscAudioMemory = new Uint8Array(miscAudioExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readMiscAudioString(ptr, size) {
  return ptr ? textDecoder.decode(miscAudioMemory.slice(ptr, ptr + size)) : "";
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

function parseMiscAudioPayload(bytes) {
  if (bytes.length > miscAudioExports.generals_miscaudio_input_capacity()) {
    throw new Error(`MiscAudio payload exceeds ${miscAudioExports.generals_miscaudio_input_capacity()} byte wasm buffer`);
  }

  miscAudioMemory.set(bytes, miscAudioExports.generals_miscaudio_input_ptr());
  const parsedCount = miscAudioExports.generals_miscaudio_parse(bytes.length);
  if (parsedCount < 0 || miscAudioExports.generals_miscaudio_error_count() !== 0) {
    throw new Error(`MiscAudio parse failed: parsed=${parsedCount}, errors=${miscAudioExports.generals_miscaudio_error_count()}`);
  }

  return parsedCount;
}

function slotField(index) {
  return readMiscAudioString(
    miscAudioExports.generals_miscaudio_slot_field_ptr(index),
    miscAudioExports.generals_miscaudio_slot_field_size(index)
  );
}

function slotEvent(index) {
  return readMiscAudioString(
    miscAudioExports.generals_miscaudio_slot_event_ptr(index),
    miscAudioExports.generals_miscaudio_slot_event_size(index)
  );
}

function slotSummary(index) {
  return {
    index,
    field: slotField(index),
    event: slotEvent(index),
    line: miscAudioExports.generals_miscaudio_slot_line(index),
    assigned: miscAudioExports.generals_miscaudio_slot_assigned(index),
    hasEvent: miscAudioExports.generals_miscaudio_slot_has_event(index),
    noSound: miscAudioExports.generals_miscaudio_slot_no_sound(index),
  };
}

function findSlot(field) {
  for (let index = 0; index < miscAudioExports.generals_miscaudio_slot_count(); ++index) {
    if (slotField(index) === field) {
      return slotSummary(index);
    }
  }

  throw new Error(`MiscAudio slot not found: ${field}`);
}

const miscAudioBytes = entryBytes("data/ini/miscaudio.ini");
const eventCount = parseMiscAudioPayload(miscAudioBytes);
const samples = {
  radarUnitUnderAttack: findSlot("RadarNotifyUnitUnderAttackSound"),
  radarInfiltration: findSlot("RadarNotifyInfiltrationSound"),
  defectorTick: findSlot("DefectorTimerTickSound"),
  defectorDing: findSlot("DefectorTimerDingSound"),
  lockonTick: findSlot("LockonTickSound"),
  crateSalvage: findSlot("CrateSalvage"),
  sabotagePower: findSlot("SabotageShutDownBuilding"),
  sabotageReset: findSlot("SabotageResetTimeBuilding"),
  aircraftWheelScreech: findSlot("AircraftWheelScreech"),
};

const summary = {
  archive: archivePath,
  miscAudioBytes: miscAudioBytes.length,
  slotCount: miscAudioExports.generals_miscaudio_slot_count(),
  fieldCount: miscAudioExports.generals_miscaudio_field_count(),
  assignedCount: miscAudioExports.generals_miscaudio_assigned_count(),
  eventCount,
  noSoundCount: miscAudioExports.generals_miscaudio_no_sound_count(),
  missingCount: miscAudioExports.generals_miscaudio_missing_count(),
  lineCount: miscAudioExports.generals_miscaudio_line_count(),
  first: slotSummary(0),
  last: slotSummary(miscAudioExports.generals_miscaudio_slot_count() - 1),
  samples,
};

if (summary.miscAudioBytes !== 4187 ||
    summary.slotCount !== 36 ||
    summary.fieldCount !== 35 ||
    summary.assignedCount !== 35 ||
    summary.eventCount !== 34 ||
    summary.noSoundCount !== 1 ||
    summary.missingCount !== 2 ||
    summary.lineCount !== 38 ||
    summary.first.field !== "RadarNotifyUnitUnderAttackSound" ||
    summary.first.event !== "RadarNotifyUnitUnderAttack" ||
    summary.last.field !== "AircraftWheelScreech" ||
    summary.last.event !== "JetSkid") {
  throw new Error(`unexpected MiscAudio aggregate parse: ${JSON.stringify(summary)}`);
}

if (samples.radarUnitUnderAttack.line !== 3 ||
    samples.radarInfiltration.assigned !== 1 ||
    samples.radarInfiltration.hasEvent !== 0 ||
    samples.radarInfiltration.noSound !== 1 ||
    samples.radarInfiltration.event !== "" ||
    samples.defectorTick.event !== "DefectorTimerTick" ||
    samples.defectorDing.assigned !== 0 ||
    samples.defectorDing.hasEvent !== 0 ||
    samples.defectorDing.line !== -1 ||
    samples.lockonTick.event !== "LockonTick" ||
    samples.crateSalvage.event !== "SalvageUpgrade" ||
    samples.sabotagePower.event !== "SabotageBuildingPower" ||
    samples.sabotageReset.event !== "SabotageBuilding" ||
    samples.aircraftWheelScreech.event !== "JetSkid") {
  throw new Error(`unexpected MiscAudio sample parse: ${JSON.stringify(samples)}`);
}

console.log(JSON.stringify(summary, null, 2));
