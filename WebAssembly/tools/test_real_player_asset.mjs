import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const playerWasmPath = resolve(wasmDir, "dist/generals_player.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, playerWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(playerWasmPath),
  readFile(archivePath),
]);
const [bigModule, playerModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(playerWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const playerExports = playerModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const playerMemory = new Uint8Array(playerExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readPlayerString(ptr, size) {
  return ptr ? textDecoder.decode(playerMemory.slice(ptr, ptr + size)) : "";
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

function parsePlayerPayload(bytes) {
  if (bytes.length > playerExports.generals_player_input_capacity()) {
    throw new Error(`player payload exceeds ${playerExports.generals_player_input_capacity()} byte wasm buffer`);
  }

  playerMemory.set(bytes, playerExports.generals_player_input_ptr());
  const parsedCount = playerExports.generals_player_parse(bytes.length);
  if (parsedCount < 0 || playerExports.generals_player_error_count() !== 0) {
    throw new Error(`player parse failed: parsed=${parsedCount}, errors=${playerExports.generals_player_error_count()}`);
  }

  return parsedCount;
}

function templateString(prefix, index) {
  return readPlayerString(
    playerExports[`generals_player_template_${prefix}_ptr`](index),
    playerExports[`generals_player_template_${prefix}_size`](index)
  );
}

function startingUnit(index, slot) {
  return readPlayerString(
    playerExports.generals_player_template_starting_unit_ptr(index, slot),
    playerExports.generals_player_template_starting_unit_size(index, slot)
  );
}

function findTemplate(name) {
  for (let index = 0; index < playerExports.generals_player_template_count(); ++index) {
    if (templateString("name", index) === name) {
      return {
        index,
        name,
        side: templateString("side", index),
        baseSide: templateString("base_side", index),
        displayName: templateString("display_name", index),
        intrinsicSciences: templateString("intrinsic_sciences", index),
        rank1: templateString("purchase_science_command_set_rank1", index),
        rank3: templateString("purchase_science_command_set_rank3", index),
        rank8: templateString("purchase_science_command_set_rank8", index),
        shortcutCommandSet: templateString("special_power_shortcut_command_set", index),
        shortcutWinName: templateString("special_power_shortcut_win_name", index),
        startingBuilding: templateString("starting_building", index),
        startingUnit0: startingUnit(index, 0),
        scoreScreenImage: templateString("score_screen_image", index),
        loadScreenImage: templateString("load_screen_image", index),
        loadScreenMusic: templateString("load_screen_music", index),
        scoreScreenMusic: templateString("score_screen_music", index),
        flagWaterMark: templateString("flag_water_mark", index),
        sideIconImage: templateString("side_icon_image", index),
        generalImage: templateString("general_image", index),
        beaconName: templateString("beacon_name", index),
        fields: playerExports.generals_player_template_field_count_at(index),
        line: playerExports.generals_player_template_line(index),
        playable: playerExports.generals_player_template_playable_side(index),
        observer: playerExports.generals_player_template_observer(index),
        oldFaction: playerExports.generals_player_template_old_faction(index),
        startMoney: playerExports.generals_player_template_start_money(index),
        color: [
          playerExports.generals_player_template_preferred_color_r(index),
          playerExports.generals_player_template_preferred_color_g(index),
          playerExports.generals_player_template_preferred_color_b(index),
        ],
        intrinsicScienceTokens: playerExports.generals_player_template_intrinsic_science_token_count(index),
        purchaseCommandSets: playerExports.generals_player_template_purchase_science_command_set_count(index),
        shortcutButtons: playerExports.generals_player_template_special_power_shortcut_button_count(index),
      };
    }
  }
  return null;
}

const playerBytes = entryBytes("data/ini/playertemplate.ini");
parsePlayerPayload(playerBytes);

const america = findTemplate("FactionAmerica");
const observer = findTemplate("FactionObserver");
const boss = findTemplate("FactionBossGeneral");
const summary = {
  archive: archivePath,
  playerBytes: playerBytes.length,
  templateCount: playerExports.generals_player_template_count(),
  fieldCount: playerExports.generals_player_field_count(),
  playableCount: playerExports.generals_player_playable_count(),
  observerCount: playerExports.generals_player_observer_count(),
  oldFactionCount: playerExports.generals_player_old_faction_count(),
  intrinsicScienceCount: playerExports.generals_player_intrinsic_science_count(),
  purchaseScienceCommandSetCount: playerExports.generals_player_purchase_science_command_set_count(),
  america,
  observer,
  boss,
};

if (summary.playerBytes !== 22451 ||
    summary.templateCount !== 15 ||
    summary.fieldCount !== 409 ||
    summary.playableCount !== 13 ||
    summary.observerCount !== 1 ||
    summary.oldFactionCount !== 5 ||
    summary.intrinsicScienceCount !== 15 ||
    summary.purchaseScienceCommandSetCount !== 39) {
  throw new Error(`unexpected player aggregate parse: ${JSON.stringify(summary)}`);
}

if (!america ||
    america.side !== "America" ||
    america.baseSide !== "USA" ||
    america.displayName !== "INI:FactionAmerica" ||
    america.intrinsicSciences !== "SCIENCE_AMERICA" ||
    america.rank1 !== "SCIENCE_AMERICA_CommandSetRank1" ||
    america.rank3 !== "SCIENCE_AMERICA_CommandSetRank3" ||
    america.rank8 !== "SCIENCE_AMERICA_CommandSetRank8" ||
    america.shortcutCommandSet !== "SpecialPowerShortcutUSA" ||
    america.shortcutWinName !== "GenPowersShortcutBarUS.wnd" ||
    america.startingBuilding !== "AmericaCommandCenter" ||
    america.startingUnit0 !== "AmericaVehicleDozer" ||
    america.scoreScreenImage !== "America_ScoreScreen" ||
    america.loadScreenImage !== "SAFactionLogoPage_US" ||
    america.loadScreenMusic !== "Load_USA" ||
    america.scoreScreenMusic !== "Score_USA" ||
    america.flagWaterMark !== "WatermarkUSA" ||
    america.sideIconImage !== "GameinfoAMRCA" ||
    america.generalImage !== "USA_Logo" ||
    america.beaconName !== "MultiplayerBeacon" ||
    america.fields !== 30 ||
    america.playable !== 1 ||
    america.observer !== 0 ||
    america.oldFaction !== 1 ||
    america.startMoney !== 0 ||
    america.color.join(",") !== "0,0,255" ||
    america.intrinsicScienceTokens !== 1 ||
    america.purchaseCommandSets !== 3 ||
    america.shortcutButtons !== 10) {
  throw new Error(`unexpected FactionAmerica parse: ${JSON.stringify(summary)}`);
}

if (!observer ||
    observer.side !== "Observer" ||
    observer.intrinsicSciences !== "None" ||
    observer.playable !== 0 ||
    observer.observer !== 1 ||
    observer.oldFaction !== 1 ||
    observer.fields !== 14 ||
    observer.color.join(",") !== "255,255,255" ||
    observer.intrinsicScienceTokens !== 0 ||
    observer.purchaseCommandSets !== 0) {
  throw new Error(`unexpected FactionObserver parse: ${JSON.stringify(summary)}`);
}

if (!boss ||
    boss.side !== "Boss" ||
    boss.baseSide !== "China" ||
    boss.playable !== 1 ||
    boss.oldFaction !== 0 ||
    boss.intrinsicSciences !== "SCIENCE_GLA SCIENCE_AMERICA SCIENCE_CHINA" ||
    boss.intrinsicScienceTokens !== 3 ||
    boss.purchaseCommandSets !== 3) {
  throw new Error(`unexpected FactionBossGeneral parse: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
