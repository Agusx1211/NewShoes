import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const campaignWasmPath = resolve(wasmDir, "dist/generals_campaign.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, campaignWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(campaignWasmPath),
  readFile(archivePath),
]);
const [bigModule, campaignModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(campaignWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const campaignExports = campaignModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const campaignMemory = new Uint8Array(campaignExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readCampaignString(ptr, size) {
  return ptr ? textDecoder.decode(campaignMemory.slice(ptr, ptr + size)) : "";
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

const campaignBytes = entryBytes("data/ini/campaign.ini");
if (campaignBytes.length > campaignExports.generals_campaign_input_capacity()) {
  throw new Error(`Campaign payload exceeds ${campaignExports.generals_campaign_input_capacity()} byte wasm buffer`);
}

campaignMemory.set(campaignBytes, campaignExports.generals_campaign_input_ptr());
const parsedCount = campaignExports.generals_campaign_parse(campaignBytes.length);
if (parsedCount < 0 || campaignExports.generals_campaign_error_count() !== 0) {
  throw new Error(`Campaign parse failed: parsed=${parsedCount}, errors=${campaignExports.generals_campaign_error_count()}`);
}

function campaignString(prefix, index) {
  return readCampaignString(
    campaignExports[`generals_campaign_${prefix}_ptr`](index),
    campaignExports[`generals_campaign_${prefix}_size`](index)
  );
}

function missionString(prefix, index) {
  return readCampaignString(
    campaignExports[`generals_campaign_mission_${prefix}_ptr`](index),
    campaignExports[`generals_campaign_mission_${prefix}_size`](index)
  );
}

function summarize(index) {
  return {
    index,
    name: campaignString("name", index),
    nameLabel: campaignString("name_label", index),
    firstMission: campaignString("first_mission", index),
    playerFaction: campaignString("player_faction", index),
    isChallenge: campaignExports.generals_campaign_is_challenge(index),
    missionCount: campaignExports.generals_campaign_mission_count(index),
    firstMissionIndex: campaignExports.generals_campaign_first_mission_index(index),
    line: campaignExports.generals_campaign_line(index),
    fields: campaignExports.generals_campaign_field_count_at(index),
  };
}

function find(name) {
  for (let index = 0; index < campaignExports.generals_campaign_count(); ++index) {
    if (campaignString("name", index) === name) {
      return summarize(index);
    }
  }

  throw new Error(`Campaign not found: ${name}`);
}

// Cross-check: the sum of every campaign's mission count must equal the flat
// total, and every mission must point back to a valid campaign.
let summedMissions = 0;
for (let index = 0; index < campaignExports.generals_campaign_count(); ++index) {
  summedMissions += campaignExports.generals_campaign_mission_count(index);
}
let badLinks = 0;
for (let index = 0; index < campaignExports.generals_campaign_mission_total(); ++index) {
  const owner = campaignExports.generals_campaign_mission_campaign_index(index);
  if (owner < 0 || owner >= campaignExports.generals_campaign_count()) {
    ++badLinks;
  }
}

const training = find("TRAINING");
const firstTrainingMission = training.firstMissionIndex;

const summary = {
  archive: archivePath,
  campaignBytes: campaignBytes.length,
  parsedCount,
  count: campaignExports.generals_campaign_count(),
  missionTotal: campaignExports.generals_campaign_mission_total(),
  summedMissions,
  badLinks,
  fieldCount: campaignExports.generals_campaign_field_count(),
  lineCount: campaignExports.generals_campaign_line_count(),
  training,
  challenge0: find("CHALLENGE_0"),
  trainingMission01: {
    name: missionString("name", firstTrainingMission),
    map: missionString("map", firstTrainingMission),
    objective0: missionString("objective0", firstTrainingMission),
    voiceLength: campaignExports.generals_campaign_mission_voice_length(firstTrainingMission),
    fields: campaignExports.generals_campaign_mission_field_count_at(firstTrainingMission),
  },
};

if (summary.campaignBytes !== 16986 ||
    summary.parsedCount !== 17 ||
    summary.count !== 17 ||
    summary.missionTotal !== 85 ||
    summary.summedMissions !== 85 ||
    summary.badLinks !== 0 ||
    summary.fieldCount !== 439 ||
    summary.lineCount !== 592) {
  throw new Error(`unexpected Campaign aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.training.nameLabel !== "CAMPAIGN:TRAINING" ||
    summary.training.firstMission !== "Mission01" ||
    summary.training.isChallenge !== 0 ||
    summary.training.missionCount !== 1 ||
    summary.training.fields !== 3) {
  throw new Error(`unexpected TRAINING campaign: ${JSON.stringify(summary.training)}`);
}

if (summary.challenge0.playerFaction !== "FactionAmericaAirForceGeneral" ||
    summary.challenge0.isChallenge !== 1 ||
    summary.challenge0.missionCount !== 7) {
  throw new Error(`unexpected CHALLENGE_0 campaign: ${JSON.stringify(summary.challenge0)}`);
}

if (summary.trainingMission01.name !== "Mission01" ||
    summary.trainingMission01.map !== "Maps\\Training01\\Training01.map" ||
    summary.trainingMission01.objective0 !== "GUI:Objectives:" ||
    summary.trainingMission01.voiceLength !== 17) {
  throw new Error(`unexpected TRAINING Mission01: ${JSON.stringify(summary.trainingMission01)}`);
}

console.log(JSON.stringify(summary, null, 2));
