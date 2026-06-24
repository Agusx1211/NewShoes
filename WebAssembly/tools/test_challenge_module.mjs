import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_challenge.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
ChallengeGenerals

  GeneralPersona0
    PlayerTemplate = FactionAmericaAirForceGeneral
    StartsEnabled = yes
    BioNameString = GUI:BioNameEntry_Pos0
    BioRankString = GUI:BioRankEntry_Pos0
    BioStrategyString = GUI:BioStrategyEntry_Pos0
    BioPortraitLarge = PAAirGen
    Campaign = CHALLENGE_0
    SelectionSound = Taunts_Grainger009
    TauntSound1 =Taunts_Grainger061
  End

  GeneralPersona1
    PlayerTemplate = FactionGLAToxinGeneral
    StartsEnabled = no
    BioNameString = GUI:BioNameEntry_Pos1
    Campaign = unimplemented
  End

End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_challenge_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_challenge_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_challenge_input_ptr());
const count = exports.generals_challenge_parse(bytes.length);
if (count < 0 || exports.generals_challenge_error_count() !== 0) {
  throw new Error(`Challenge parse failed: parsed=${count}, errors=${exports.generals_challenge_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function personaString(prefix, index) {
  return readString(
    exports[`generals_challenge_${prefix}_ptr`](index),
    exports[`generals_challenge_${prefix}_size`](index)
  );
}

if (count !== 2 ||
    exports.generals_challenge_count() !== 2 ||
    exports.generals_challenge_has_block() !== 1 ||
    exports.generals_challenge_enabled_count() !== 1 ||
    exports.generals_challenge_field_count_at(0) !== 9 ||
    exports.generals_challenge_field_count_at(1) !== 4) {
  throw new Error("unexpected Challenge aggregate parse");
}

if (exports.generals_challenge_position(0) !== 0 ||
    exports.generals_challenge_starts_enabled(0) !== 1 ||
    personaString("player_template", 0) !== "FactionAmericaAirForceGeneral" ||
    personaString("bio_name", 0) !== "GUI:BioNameEntry_Pos0" ||
    personaString("bio_rank", 0) !== "GUI:BioRankEntry_Pos0" ||
    personaString("campaign", 0) !== "CHALLENGE_0" ||
    personaString("portrait_large", 0) !== "PAAirGen" ||
    personaString("selection_sound", 0) !== "Taunts_Grainger009") {
  throw new Error("unexpected first persona");
}

if (exports.generals_challenge_position(1) !== 1 ||
    exports.generals_challenge_starts_enabled(1) !== 0 ||
    personaString("player_template", 1) !== "FactionGLAToxinGeneral" ||
    personaString("campaign", 1) !== "unimplemented") {
  throw new Error("unexpected second persona");
}

console.log(JSON.stringify({
  module: wasmPath,
  personas: exports.generals_challenge_count(),
  enabled: exports.generals_challenge_enabled_count(),
  fields: exports.generals_challenge_field_count(),
  first: personaString("player_template", 0),
}, null, 2));
