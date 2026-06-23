import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_player.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function templateString(prefix, index) {
  return readString(
    exports[`generals_player_template_${prefix}_ptr`](index),
    exports[`generals_player_template_${prefix}_size`](index)
  );
}

function startingUnit(index, slot) {
  return readString(
    exports.generals_player_template_starting_unit_ptr(index, slot),
    exports.generals_player_template_starting_unit_size(index, slot)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_player_input_ptr());
  const parsedCount = exports.generals_player_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_player_error_count() !== 0) {
    throw new Error(`player template parse failed: parsed=${parsedCount}, errors=${exports.generals_player_error_count()}`);
  }
  return parsedCount;
}

parse(`
PlayerTemplate FactionAmerica
  Side              = America
  BaseSide          = USA
  PlayableSide      = Yes
  StartMoney        = 10000
  PreferredColor    = R:0 G:0 B:255
  IntrinsicSciences = SCIENCE_AMERICA SCIENCE_Rank1
  PurchaseScienceCommandSetRank1  = SCIENCE_AMERICA_CommandSetRank1
  PurchaseScienceCommandSetRank3  = SCIENCE_AMERICA_CommandSetRank3
  PurchaseScienceCommandSetRank8  = SCIENCE_AMERICA_CommandSetRank8
  SpecialPowerShortcutCommandSet  = SpecialPowerShortcutUSA
  SpecialPowerShortcutWinName     = GenPowersShortcutBarUS.wnd
  SpecialPowerShortcutButtonCount = 10
  DisplayName       = INI:FactionAmerica
  StartingBuilding  = AmericaCommandCenter
  StartingUnit0     = AmericaVehicleDozer
  ScoreScreenImage  = America_ScoreScreen
  LoadScreenImage   = SAFactionLogoPage_US
  LoadScreenMusic   = Load_USA
  ScoreScreenMusic  = Score_USA
  FlagWaterMark     = WatermarkUSA
  EnabledImage      = SSObserverUSA
  BeaconName        = MultiplayerBeacon
  SideIconImage     = GameinfoAMRCA
  GeneralImage      = USA_Logo
  OldFaction        = Yes
  ArmyTooltip       = TOOLTIP:BioStrategyLong_USA
  Features          = GUI:BioFeatures_USA
  MedallionRegular  = USAGeneral_slvr
  MedallionHilite   = USAGeneral_blue
  MedallionSelect   = USAGeneral_orng
  IntrinsicSciencePurchasePoints = 2
End

PlayerTemplate FactionObserver
  Side              = Observer
  PlayableSide      = No
  IsObserver        = Yes
  PreferredColor    = R:255 G:255 B:255
  IntrinsicSciences = None
  OldFaction        = Yes
End
`);

if (exports.generals_player_template_count() !== 2 ||
    exports.generals_player_field_count() !== 37 ||
    exports.generals_player_playable_count() !== 1 ||
    exports.generals_player_observer_count() !== 1 ||
    exports.generals_player_old_faction_count() !== 2 ||
    exports.generals_player_intrinsic_science_count() !== 2 ||
    exports.generals_player_purchase_science_command_set_count() !== 3) {
  throw new Error("unexpected player aggregate parse result");
}

if (templateString("name", 0) !== "FactionAmerica" ||
    templateString("side", 0) !== "America" ||
    templateString("base_side", 0) !== "USA" ||
    templateString("display_name", 0) !== "INI:FactionAmerica" ||
    templateString("preferred_color", 0) !== "R:0 G:0 B:255" ||
    templateString("intrinsic_sciences", 0) !== "SCIENCE_AMERICA SCIENCE_Rank1" ||
    templateString("purchase_science_command_set_rank1", 0) !== "SCIENCE_AMERICA_CommandSetRank1" ||
    templateString("purchase_science_command_set_rank3", 0) !== "SCIENCE_AMERICA_CommandSetRank3" ||
    templateString("purchase_science_command_set_rank8", 0) !== "SCIENCE_AMERICA_CommandSetRank8" ||
    templateString("special_power_shortcut_command_set", 0) !== "SpecialPowerShortcutUSA" ||
    templateString("special_power_shortcut_win_name", 0) !== "GenPowersShortcutBarUS.wnd" ||
    templateString("starting_building", 0) !== "AmericaCommandCenter" ||
    startingUnit(0, 0) !== "AmericaVehicleDozer" ||
    templateString("score_screen_image", 0) !== "America_ScoreScreen" ||
    templateString("load_screen_image", 0) !== "SAFactionLogoPage_US" ||
    templateString("load_screen_music", 0) !== "Load_USA" ||
    templateString("score_screen_music", 0) !== "Score_USA" ||
    templateString("flag_water_mark", 0) !== "WatermarkUSA" ||
    templateString("enabled_image", 0) !== "SSObserverUSA" ||
    templateString("beacon_name", 0) !== "MultiplayerBeacon" ||
    templateString("side_icon_image", 0) !== "GameinfoAMRCA" ||
    templateString("general_image", 0) !== "USA_Logo" ||
    templateString("army_tooltip", 0) !== "TOOLTIP:BioStrategyLong_USA" ||
    templateString("features", 0) !== "GUI:BioFeatures_USA" ||
    templateString("medallion_regular", 0) !== "USAGeneral_slvr" ||
    templateString("medallion_hilite", 0) !== "USAGeneral_blue" ||
    templateString("medallion_select", 0) !== "USAGeneral_orng") {
  throw new Error("unexpected FactionAmerica string parse result");
}

if (exports.generals_player_template_playable_side(0) !== 1 ||
    exports.generals_player_template_observer(0) !== 0 ||
    exports.generals_player_template_old_faction(0) !== 1 ||
    exports.generals_player_template_start_money(0) !== 10000 ||
    exports.generals_player_template_preferred_color_r(0) !== 0 ||
    exports.generals_player_template_preferred_color_g(0) !== 0 ||
    exports.generals_player_template_preferred_color_b(0) !== 255 ||
    exports.generals_player_template_intrinsic_science_token_count(0) !== 2 ||
    exports.generals_player_template_purchase_science_command_set_count(0) !== 3 ||
    exports.generals_player_template_special_power_shortcut_button_count(0) !== 10 ||
    exports.generals_player_template_intrinsic_science_purchase_points(0) !== 2 ||
    exports.generals_player_template_field_count_at(0) !== 31) {
  throw new Error("unexpected FactionAmerica numeric parse result");
}

if (templateString("name", 1) !== "FactionObserver" ||
    templateString("side", 1) !== "Observer" ||
    templateString("intrinsic_sciences", 1) !== "None" ||
    exports.generals_player_template_playable_side(1) !== 0 ||
    exports.generals_player_template_observer(1) !== 1 ||
    exports.generals_player_template_intrinsic_science_token_count(1) !== 0 ||
    exports.generals_player_template_field_count_at(1) !== 6) {
  throw new Error("unexpected FactionObserver parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  templates: exports.generals_player_template_count(),
  featured: templateString("name", 0),
  observer: templateString("name", 1),
}, null, 2));
