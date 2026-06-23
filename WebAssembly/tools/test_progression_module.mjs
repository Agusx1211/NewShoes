import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_progression.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function recordString(kind, prefix, index) {
  return readString(
    exports[`generals_progression_${kind}_${prefix}_ptr`](index),
    exports[`generals_progression_${kind}_${prefix}_size`](index)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_progression_input_ptr());
  const parsedCount = exports.generals_progression_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_progression_error_count() !== 0) {
    throw new Error(`progression parse failed: parsed=${parsedCount}, errors=${exports.generals_progression_error_count()}`);
  }
  return parsedCount;
}

parse(`
Upgrade Upgrade_AmericaRadar
  DisplayName        = UPGRADE:Radar
  Type               = OBJECT
  BuildTime          = 10.0
  BuildCost          = 500
  ButtonImage        = SARadarUpgrade
  ResearchSound      = NoSound
  AcademyClassify    = ACT_UPGRADE_RADAR
End
`);

if (exports.generals_progression_upgrade_count() !== 1 ||
    exports.generals_progression_upgrade_field_count() !== 7 ||
    recordString("upgrade", "name", 0) !== "Upgrade_AmericaRadar" ||
    recordString("upgrade", "display_name", 0) !== "UPGRADE:Radar" ||
    recordString("upgrade", "type", 0) !== "OBJECT" ||
    recordString("upgrade", "button_image", 0) !== "SARadarUpgrade" ||
    recordString("upgrade", "academy", 0) !== "ACT_UPGRADE_RADAR" ||
    exports.generals_progression_upgrade_build_time_x100(0) !== 1000 ||
    exports.generals_progression_upgrade_build_cost(0) !== 500) {
  throw new Error("unexpected upgrade parse result");
}

parse(`
SpecialPower SuperweaponDaisyCutter
  Enum                = SPECIAL_DAISY_CUTTER
  ReloadTime          = 360000
  RequiredScience     = SCIENCE_DaisyCutter
  PublicTimer         = No
  SharedSyncedTimer   = Yes
  ViewObjectDuration  = 30000
  ViewObjectRange     = 250
  RadiusCursorRadius  = 170
  ShortcutPower       = Yes
  AcademyClassify     = ACT_SUPERPOWER
End
`);

if (exports.generals_progression_special_power_count() !== 1 ||
    exports.generals_progression_special_power_field_count() !== 10 ||
    recordString("special_power", "name", 0) !== "SuperweaponDaisyCutter" ||
    recordString("special_power", "enum", 0) !== "SPECIAL_DAISY_CUTTER" ||
    recordString("special_power", "required_science", 0) !== "SCIENCE_DaisyCutter" ||
    recordString("special_power", "academy", 0) !== "ACT_SUPERPOWER" ||
    exports.generals_progression_special_power_reload_time_ms(0) !== 360000 ||
    exports.generals_progression_special_power_public_timer(0) !== 0 ||
    exports.generals_progression_special_power_shared_synced_timer(0) !== 1 ||
    exports.generals_progression_special_power_view_object_duration_ms(0) !== 30000 ||
    exports.generals_progression_special_power_view_object_range_x100(0) !== 25000 ||
    exports.generals_progression_special_power_radius_cursor_radius_x100(0) !== 17000 ||
    exports.generals_progression_special_power_shortcut_power(0) !== 1) {
  throw new Error("unexpected special power parse result");
}

parse(`
Science SCIENCE_DaisyCutter
  PrerequisiteSciences = SCIENCE_AMERICA SCIENCE_Rank5
  SciencePurchasePointCost = 1
  IsGrantable = Yes
  DisplayName = SCIENCE:USADaisyCutter
  Description = CONTROLBAR:ToolTipUSAScienceDaisyCutter
End
`);

if (exports.generals_progression_science_count() !== 1 ||
    exports.generals_progression_science_field_count() !== 5 ||
    recordString("science", "name", 0) !== "SCIENCE_DaisyCutter" ||
    recordString("science", "prerequisite_sciences", 0) !== "SCIENCE_AMERICA SCIENCE_Rank5" ||
    recordString("science", "display_name", 0) !== "SCIENCE:USADaisyCutter" ||
    recordString("science", "description", 0) !== "CONTROLBAR:ToolTipUSAScienceDaisyCutter" ||
    exports.generals_progression_science_purchase_point_cost(0) !== 1 ||
    exports.generals_progression_science_is_grantable(0) !== 1) {
  throw new Error("unexpected science parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  upgrade: "Upgrade_AmericaRadar",
  specialPower: "SuperweaponDaisyCutter",
  science: "SCIENCE_DaisyCutter",
}, null, 2));
