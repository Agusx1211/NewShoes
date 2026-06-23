import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_command.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function buttonString(prefix, index) {
  return readString(
    exports[`generals_command_button_${prefix}_ptr`](index),
    exports[`generals_command_button_${prefix}_size`](index)
  );
}

function setName(index) {
  return readString(
    exports.generals_command_set_name_ptr(index),
    exports.generals_command_set_name_size(index)
  );
}

function entryButton(index) {
  return readString(
    exports.generals_command_set_entry_button_ptr(index),
    exports.generals_command_set_entry_button_size(index)
  );
}

const source = textEncoder.encode(`
CommandButton Command_ConstructAmericaPowerPlant
  Command           = DOZER_CONSTRUCT
  Object            = AmericaPowerPlant
  Options           = NEED_TARGET_POS CONTEXTMODE_COMMAND
  TextLabel         = CONTROLBAR:ConstructAmericaPowerPlant
  ButtonImage       = SAPowerPlant
  ButtonBorderType  = BUILD
  DescriptLabel     = CONTROLBAR:ToolTipUSABuildPowerPlant
End

CommandButton Command_FireMissile
  Command           = FIRE_WEAPON
  WeaponSlot        = PRIMARY
  MaxShotsToFire    = 2
  UnitSpecificSound = VoiceFireSpecialWeapon
End

CommandSet AmericaDozerCommandSet
  1  = Command_ConstructAmericaPowerPlant
  14 = Command_DisarmMinesAtPosition
End
`);

memory.set(source, exports.generals_command_input_ptr());
const parsedCount = exports.generals_command_parse(source.length);

if (parsedCount !== 3 ||
    exports.generals_command_button_count() !== 2 ||
    exports.generals_command_button_field_count() !== 11 ||
    exports.generals_command_set_count() !== 1 ||
    exports.generals_command_set_entry_count() !== 2 ||
    exports.generals_command_error_count() !== 0) {
  throw new Error(`unexpected command parse counts: parsed=${parsedCount}, buttons=${exports.generals_command_button_count()}, fields=${exports.generals_command_button_field_count()}, sets=${exports.generals_command_set_count()}, entries=${exports.generals_command_set_entry_count()}, errors=${exports.generals_command_error_count()}`);
}

if (buttonString("name", 0) !== "Command_ConstructAmericaPowerPlant" ||
    buttonString("command", 0) !== "DOZER_CONSTRUCT" ||
    buttonString("object", 0) !== "AmericaPowerPlant" ||
    buttonString("options", 0) !== "NEED_TARGET_POS CONTEXTMODE_COMMAND" ||
    buttonString("text_label", 0) !== "CONTROLBAR:ConstructAmericaPowerPlant" ||
    buttonString("button_image", 0) !== "SAPowerPlant" ||
    buttonString("button_border_type", 0) !== "BUILD" ||
    buttonString("descript_label", 0) !== "CONTROLBAR:ToolTipUSABuildPowerPlant") {
  throw new Error("unexpected first command button fields");
}

if (buttonString("weapon_slot", 1) !== "PRIMARY" ||
    buttonString("unit_specific_sound", 1) !== "VoiceFireSpecialWeapon" ||
    exports.generals_command_button_max_shots_to_fire(1) !== 2) {
  throw new Error("unexpected weapon command button fields");
}

if (setName(0) !== "AmericaDozerCommandSet" ||
    exports.generals_command_set_entry_count_at(0) !== 2 ||
    exports.generals_command_set_first_entry(0) !== 0 ||
    exports.generals_command_set_entry_slot(0) !== 1 ||
    exports.generals_command_set_entry_slot(1) !== 14 ||
    entryButton(0) !== "Command_ConstructAmericaPowerPlant" ||
    entryButton(1) !== "Command_DisarmMinesAtPosition") {
  throw new Error("unexpected command set fields");
}

console.log(JSON.stringify({
  module: wasmPath,
  parsedCount,
  buttonCount: exports.generals_command_button_count(),
  buttonFieldCount: exports.generals_command_button_field_count(),
  commandSetCount: exports.generals_command_set_count(),
  commandSetEntryCount: exports.generals_command_set_entry_count(),
  firstButton: buttonString("name", 0),
  firstSet: setName(0),
  firstSetButton: entryButton(0),
}, null, 2));
