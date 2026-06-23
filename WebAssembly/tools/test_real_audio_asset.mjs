import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const audioWasmPath = resolve(wasmDir, "dist/generals_audio.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const audioFiles = [
  "data/ini/default/soundeffects.ini",
  "data/ini/music.ini",
  "data/ini/soundeffects.ini",
  "data/ini/speech.ini",
  "data/ini/voice.ini",
];
const [bigWasmBytes, audioWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(audioWasmPath),
  readFile(archivePath),
]);
const [bigModule, audioModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(audioWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const audioExports = audioModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const audioMemory = new Uint8Array(audioExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readAudioString(ptr, size) {
  return ptr ? textDecoder.decode(audioMemory.slice(ptr, ptr + size)) : "";
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

function parseAudioPayload(bytes) {
  if (bytes.length > audioExports.generals_audio_input_capacity()) {
    throw new Error(`AudioEvent payload exceeds ${audioExports.generals_audio_input_capacity()} byte wasm buffer`);
  }

  audioMemory.set(bytes, audioExports.generals_audio_input_ptr());
  const parsedCount = audioExports.generals_audio_parse(bytes.length);
  if (parsedCount < 0 || audioExports.generals_audio_error_count() !== 0) {
    throw new Error(`AudioEvent parse failed: parsed=${parsedCount}, errors=${audioExports.generals_audio_error_count()}`);
  }

  return parsedCount;
}

function eventString(prefix, index) {
  return readAudioString(
    audioExports[`generals_audio_event_${prefix}_ptr`](index),
    audioExports[`generals_audio_event_${prefix}_size`](index)
  );
}

function eventSummary(index, file) {
  return {
    file,
    index,
    name: eventString("name", index),
    filename: eventString("filename", index),
    sounds: eventString("sounds", index),
    attack: eventString("attack", index),
    decay: eventString("decay", index),
    category: audioExports.generals_audio_event_category(index),
    priority: audioExports.generals_audio_event_priority(index),
    fields: audioExports.generals_audio_event_field_count_at(index),
    line: audioExports.generals_audio_event_line(index),
    typeMask: audioExports.generals_audio_event_type_mask(index),
    controlMask: audioExports.generals_audio_event_control_mask(index),
    volume: audioExports.generals_audio_event_volume_x100(index),
    volumeShift: audioExports.generals_audio_event_volume_shift_x100(index),
    minVolume: audioExports.generals_audio_event_min_volume_x100(index),
    pitchMin: audioExports.generals_audio_event_pitch_shift_min_x100(index),
    pitchMax: audioExports.generals_audio_event_pitch_shift_max_x100(index),
    limit: audioExports.generals_audio_event_limit(index),
    minRange: audioExports.generals_audio_event_min_range_x100(index),
    maxRange: audioExports.generals_audio_event_max_range_x100(index),
    lowPass: audioExports.generals_audio_event_low_pass_cutoff_x100(index),
    soundTokens: audioExports.generals_audio_event_sound_token_count(index),
  };
}

const totals = {
  eventCount: 0,
  fieldCount: 0,
  lineCount: 0,
  soundReferenceCount: 0,
  audioEventCount: 0,
  musicTrackCount: 0,
  dialogEventCount: 0,
  uiCount: 0,
  worldCount: 0,
  voiceCount: 0,
  globalCount: 0,
  randomCount: 0,
  loopCount: 0,
};
const fileSummaries = [];
const samples = {};

for (const file of audioFiles) {
  const bytes = entryBytes(file);
  const eventCount = parseAudioPayload(bytes);
  const fileSummary = {
    file,
    bytes: bytes.length,
    eventCount,
    fieldCount: audioExports.generals_audio_field_count(),
    lineCount: audioExports.generals_audio_line_count(),
    soundReferenceCount: audioExports.generals_audio_sound_reference_count(),
    audioEventCount: audioExports.generals_audio_category_count(0),
    musicTrackCount: audioExports.generals_audio_category_count(1),
    dialogEventCount: audioExports.generals_audio_category_count(2),
    first: eventCount > 0 ? eventSummary(0, file) : null,
    last: eventCount > 0 ? eventSummary(eventCount - 1, file) : null,
  };
  fileSummaries.push(fileSummary);

  totals.eventCount += fileSummary.eventCount;
  totals.fieldCount += fileSummary.fieldCount;
  totals.lineCount += fileSummary.lineCount;
  totals.soundReferenceCount += fileSummary.soundReferenceCount;
  totals.audioEventCount += fileSummary.audioEventCount;
  totals.musicTrackCount += fileSummary.musicTrackCount;
  totals.dialogEventCount += fileSummary.dialogEventCount;
  totals.uiCount += audioExports.generals_audio_type_flag_count(0);
  totals.worldCount += audioExports.generals_audio_type_flag_count(1);
  totals.globalCount += audioExports.generals_audio_type_flag_count(3);
  totals.voiceCount += audioExports.generals_audio_type_flag_count(4);
  totals.loopCount += audioExports.generals_audio_control_flag_count(0);
  totals.randomCount += audioExports.generals_audio_control_flag_count(1);

  for (let index = 0; index < eventCount; ++index) {
    const name = eventString("name", index);
    if (name === "DefaultSoundEffect" ||
        name === "Track1" ||
        name === "GenericTankMoveLoop" ||
        name === "Explosion" ||
        name === "EvaGLA_AllyUnderAttack" ||
        name === "RangerVoiceSelect") {
      samples[name] = eventSummary(index, file);
    }
  }
}

const summary = {
  archive: archivePath,
  files: fileSummaries,
  totals,
  samples,
};

const filesByName = new Map(fileSummaries.map((file) => [file.file, file]));

if (totals.eventCount !== 4046 ||
    totals.fieldCount !== 11158 ||
    totals.lineCount !== 24254 ||
    totals.soundReferenceCount !== 5298 ||
    totals.audioEventCount !== 1410 ||
    totals.musicTrackCount !== 68 ||
    totals.dialogEventCount !== 2568 ||
    totals.uiCount !== 572 ||
    totals.worldCount !== 856 ||
    totals.globalCount !== 181 ||
    totals.voiceCount !== 444 ||
    totals.loopCount !== 246 ||
    totals.randomCount !== 1039) {
  throw new Error(`unexpected AudioEvent aggregate parse: ${JSON.stringify(summary)}`);
}

const defaultSoundEffects = filesByName.get("data/ini/default/soundeffects.ini");
const music = filesByName.get("data/ini/music.ini");
const soundEffects = filesByName.get("data/ini/soundeffects.ini");
const speech = filesByName.get("data/ini/speech.ini");
const voice = filesByName.get("data/ini/voice.ini");

if (!defaultSoundEffects || defaultSoundEffects.bytes !== 351 || defaultSoundEffects.eventCount !== 1 || defaultSoundEffects.fieldCount !== 9 ||
    !music || music.bytes !== 4201 || music.eventCount !== 68 || music.fieldCount !== 67 ||
    !soundEffects || soundEffects.bytes !== 163417 || soundEffects.eventCount !== 743 || soundEffects.fieldCount !== 5171 || soundEffects.soundReferenceCount !== 2290 ||
    !speech || speech.bytes !== 201615 || speech.eventCount !== 2568 || speech.fieldCount !== 2639 ||
    !voice || voice.bytes !== 121307 || voice.eventCount !== 666 || voice.fieldCount !== 3272 || voice.soundReferenceCount !== 3008) {
  throw new Error(`unexpected AudioEvent file summary: ${JSON.stringify(summary)}`);
}

if (samples.DefaultSoundEffect.priority !== 3 ||
    samples.DefaultSoundEffect.volume !== 10000 ||
    samples.DefaultSoundEffect.minVolume !== 4000 ||
    samples.DefaultSoundEffect.typeMask !== 33 ||
    samples.DefaultSoundEffect.controlMask !== 2 ||
    samples.DefaultSoundEffect.minRange !== 17500 ||
    samples.DefaultSoundEffect.maxRange !== 80000) {
  throw new Error(`unexpected DefaultSoundEffect parse: ${JSON.stringify(samples.DefaultSoundEffect)}`);
}

if (samples.Track1.category !== 1 ||
    samples.Track1.filename !== "USA_09.mp3" ||
    samples.Track1.fields !== 1) {
  throw new Error(`unexpected Track1 parse: ${JSON.stringify(samples.Track1)}`);
}

if (samples.GenericTankMoveLoop.category !== 0 ||
    samples.GenericTankMoveLoop.sounds !== "vgenlo2a vgenlo2b vgenlo2c" ||
    samples.GenericTankMoveLoop.attack !== "vgenlo1a" ||
    samples.GenericTankMoveLoop.decay !== "vgenlo3a" ||
    samples.GenericTankMoveLoop.priority !== 1 ||
    samples.GenericTankMoveLoop.typeMask !== 262 ||
    samples.GenericTankMoveLoop.controlMask !== 5 ||
    samples.GenericTankMoveLoop.volume !== 4000 ||
    samples.GenericTankMoveLoop.limit !== 2 ||
    samples.GenericTankMoveLoop.soundTokens !== 5) {
  throw new Error(`unexpected GenericTankMoveLoop parse: ${JSON.stringify(samples.GenericTankMoveLoop)}`);
}

if (samples.Explosion.sounds !== "bgendiea bgendieb bgendiec bgendied bgendiee bgendief" ||
    samples.Explosion.controlMask !== 18 ||
    samples.Explosion.volume !== 9000 ||
    samples.Explosion.volumeShift !== -2000 ||
    samples.Explosion.pitchMin !== 9000 ||
    samples.Explosion.pitchMax !== 11000 ||
    samples.Explosion.lowPass !== 5000 ||
    samples.Explosion.soundTokens !== 6) {
  throw new Error(`unexpected Explosion parse: ${JSON.stringify(samples.Explosion)}`);
}

if (samples.EvaGLA_AllyUnderAttack.category !== 2 ||
    samples.EvaGLA_AllyUnderAttack.filename !== "egallyu.wav" ||
    samples.EvaGLA_AllyUnderAttack.volume !== 9000) {
  throw new Error(`unexpected EvaGLA_AllyUnderAttack parse: ${JSON.stringify(samples.EvaGLA_AllyUnderAttack)}`);
}

if (samples.RangerVoiceSelect.sounds !== "iransea iranseb iransec iransee iransef" ||
    samples.RangerVoiceSelect.typeMask !== 49 ||
    samples.RangerVoiceSelect.controlMask !== 2 ||
    samples.RangerVoiceSelect.volume !== 9000 ||
    samples.RangerVoiceSelect.soundTokens !== 5) {
  throw new Error(`unexpected RangerVoiceSelect parse: ${JSON.stringify(samples.RangerVoiceSelect)}`);
}

console.log(JSON.stringify(summary, null, 2));
