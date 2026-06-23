import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_thing.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = textEncoder.encode(`
Object AmericaVehicleHumvee
  DisplayName           = OBJECT:Humvee
  Side                  = America
  EditorSorting         = VEHICLE
  TransportSlotCount    = 3
  WeaponSet
    Conditions = None
    Weapon = PRIMARY HumveeGun
  End
  WeaponSet
    Conditions = PLAYER_UPGRADE
    Weapon = PRIMARY HumveeGun
    Weapon = SECONDARY HumveeMissileWeapon
    Weapon = TERTIARY HumveeMissileWeaponAir
  End
  ArmorSet
    Conditions      = None
    Armor           = HumveeArmor
    DamageFX        = TruckDamageFX
  End
  BuildCost       = 700
  BuildTime       = 10.0
  VisionRange     = 150
  ShroudClearingRange = 320
  Prerequisites
    Object = AmericaWarFactory
  End
  CommandSet      = AmericaVehicleHumveeCommandSet
  KindOf = PRELOAD SELECTABLE CAN_ATTACK VEHICLE SCORE TRANSPORT
  Body = ActiveBody ModuleTag_02
    MaxHealth = 240.0
  End
End
`);

memory.set(source, exports.generals_thing_input_ptr());
const templateCount = exports.generals_thing_parse(source.length);

if (templateCount !== 1) {
  throw new Error(`expected 1 thing template, got ${templateCount}`);
}

if (exports.generals_thing_error_count() !== 0) {
  throw new Error(`expected 0 thing parse errors, got ${exports.generals_thing_error_count()}`);
}

if (exports.generals_thing_weapon_set_count() !== 2 || exports.generals_thing_armor_set_count() !== 1) {
  throw new Error(`unexpected set counts: weapon=${exports.generals_thing_weapon_set_count()}, armor=${exports.generals_thing_armor_set_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function templateString(prefix, index) {
  return readString(exports[`generals_thing_template_${prefix}_ptr`](index), exports[`generals_thing_template_${prefix}_size`](index));
}

function weaponSetString(prefix, index) {
  return readString(exports[`generals_thing_weapon_set_${prefix}_ptr`](index), exports[`generals_thing_weapon_set_${prefix}_size`](index));
}

function armorSetString(prefix, index) {
  return readString(exports[`generals_thing_armor_set_${prefix}_ptr`](index), exports[`generals_thing_armor_set_${prefix}_size`](index));
}

const name = readString(exports.generals_thing_template_name_ptr(0), exports.generals_thing_template_name_size(0));
const displayName = templateString("display_name", 0);
const side = templateString("side", 0);
const commandSet = templateString("command_set", 0);
const primaryWeapon = weaponSetString("primary", 0);
const upgradedSecondary = weaponSetString("secondary", 1);
const armor = armorSetString("armor", 0);
const kindFlags = exports.generals_thing_template_kind_flags(0);

if (name !== "AmericaVehicleHumvee" || displayName !== "OBJECT:Humvee" || side !== "America" || commandSet !== "AmericaVehicleHumveeCommandSet") {
  throw new Error(`unexpected thing strings: ${name}, ${displayName}, ${side}, ${commandSet}`);
}

if (primaryWeapon !== "HumveeGun" || upgradedSecondary !== "HumveeMissileWeapon" || armor !== "HumveeArmor") {
  throw new Error(`unexpected thing links: ${primaryWeapon}, ${upgradedSecondary}, ${armor}`);
}

if (exports.generals_thing_template_build_cost(0) !== 700 ||
    exports.generals_thing_template_build_time_x100(0) !== 1000 ||
    exports.generals_thing_template_vision_range_x100(0) !== 15000 ||
    exports.generals_thing_template_shroud_clearing_range_x100(0) !== 32000 ||
    exports.generals_thing_template_transport_slot_count(0) !== 3) {
  throw new Error("unexpected numeric thing fields");
}

const requiredKindFlags = (1 << 0) | (1 << 1) | (1 << 4);
if ((kindFlags & requiredKindFlags) !== requiredKindFlags) {
  throw new Error(`missing expected kind flags: ${kindFlags}`);
}

console.log(JSON.stringify({
  module: wasmPath,
  templateCount,
  fieldCount: exports.generals_thing_field_count(),
  armorSetCount: exports.generals_thing_armor_set_count(),
  weaponSetCount: exports.generals_thing_weapon_set_count(),
  moduleCount: exports.generals_thing_module_count(),
  name,
  displayName,
  side,
  commandSet,
  primaryWeapon,
  upgradedSecondary,
  armor,
  kindFlags,
}, null, 2));
