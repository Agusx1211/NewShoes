import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_campaign.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Campaign.INI uses whitespace-separated field/value with a stray '=' allowed.
const source = `
Campaign TRAINING
  CampaignNameLabel CAMPAIGN:TRAINING
  FirstMission Mission01
  Mission Mission01
    Map Maps\\Training01\\Training01.map
    ObjectiveLine0 GUI:Objectives:
    ObjectiveLine1 LOAD:TRAINING_1
    UnitNames0 OBJECT:Ranger
    VoiceLength = 17
  END
END

Campaign CHALLENGE_0
  CampaignNameLabel CAMPAIGN:CHALLENGE_0
  FirstMission Mission01
  FinalVictoryMovie USACampaignVictory
  IsChallengeCampaign yes
  PlayerFaction FactionAmericaAirForceGeneral
  Mission Mission01
    Map Maps\\GC_ChemGeneral\\GC_ChemGeneral.map
    GeneralName GUI:BioNameEntry_Pos1
    NextMission Mission02
  END
  Mission Mission02
    Map Maps\\GC_NukeGeneral\\GC_NukeGeneral.map
  END
END
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_campaign_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_campaign_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_campaign_input_ptr());
const count = exports.generals_campaign_parse(bytes.length);
if (count < 0 || exports.generals_campaign_error_count() !== 0) {
  throw new Error(`Campaign parse failed: parsed=${count}, errors=${exports.generals_campaign_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function campaignString(prefix, index) {
  return readString(
    exports[`generals_campaign_${prefix}_ptr`](index),
    exports[`generals_campaign_${prefix}_size`](index)
  );
}

function missionString(prefix, index) {
  return readString(
    exports[`generals_campaign_mission_${prefix}_ptr`](index),
    exports[`generals_campaign_mission_${prefix}_size`](index)
  );
}

if (count !== 2 ||
    exports.generals_campaign_count() !== 2 ||
    exports.generals_campaign_mission_total() !== 3 ||
    exports.generals_campaign_field_count_at(0) !== 3 ||
    exports.generals_campaign_field_count_at(1) !== 7) {
  throw new Error("unexpected Campaign aggregate parse");
}

if (campaignString("name", 0) !== "TRAINING" ||
    campaignString("name_label", 0) !== "CAMPAIGN:TRAINING" ||
    campaignString("first_mission", 0) !== "Mission01" ||
    exports.generals_campaign_is_challenge(0) !== 0 ||
    exports.generals_campaign_mission_count(0) !== 1 ||
    exports.generals_campaign_first_mission_index(0) !== 0) {
  throw new Error("unexpected first campaign");
}

if (campaignString("name", 1) !== "CHALLENGE_0" ||
    campaignString("player_faction", 1) !== "FactionAmericaAirForceGeneral" ||
    campaignString("final_movie", 1) !== "USACampaignVictory" ||
    exports.generals_campaign_is_challenge(1) !== 1 ||
    exports.generals_campaign_mission_count(1) !== 2 ||
    exports.generals_campaign_first_mission_index(1) !== 1) {
  throw new Error("unexpected second campaign");
}

// Whitespace-separated values plus the stray '=' on VoiceLength must parse.
if (missionString("name", 0) !== "Mission01" ||
    exports.generals_campaign_mission_campaign_index(0) !== 0 ||
    missionString("map", 0) !== "Maps\\Training01\\Training01.map" ||
    missionString("objective0", 0) !== "GUI:Objectives:" ||
    missionString("general_name", 0) !== "" ||
    exports.generals_campaign_mission_voice_length(0) !== 17 ||
    exports.generals_campaign_mission_field_count_at(0) !== 5) {
  throw new Error("unexpected first mission");
}

if (missionString("name", 1) !== "Mission01" ||
    exports.generals_campaign_mission_campaign_index(1) !== 1 ||
    missionString("general_name", 1) !== "GUI:BioNameEntry_Pos1" ||
    missionString("next", 1) !== "Mission02") {
  throw new Error("unexpected challenge mission");
}

console.log(JSON.stringify({
  module: wasmPath,
  campaigns: exports.generals_campaign_count(),
  missions: exports.generals_campaign_mission_total(),
  fields: exports.generals_campaign_field_count(),
  first: campaignString("name", 0),
}, null, 2));
