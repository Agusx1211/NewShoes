import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_weapon.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = textEncoder.encode(`
Weapon MarauderTankGun
  PrimaryDamage = 60.0
  PrimaryDamageRadius = 5.0
  AttackRange = 150.0
  DamageType = ARMOR_PIERCING
  WeaponSpeed = 300
  ProjectileObject = MarauderTankShell
  DelayBetweenShots = 2000
  ClipSize = 0
  ClipReloadTime = 0
End

Weapon MicrowaveBeam
  PrimaryDamage = 12.5
  DamageType = MICROWAVE
  DelayBetweenShots = Min: 50 Max: 100
End
`);

memory.set(source, exports.generals_weapon_input_ptr());
const templateCount = exports.generals_weapon_parse(source.length);

if (templateCount !== 2) {
  throw new Error(`expected 2 weapon templates, got ${templateCount}`);
}

if (exports.generals_weapon_error_count() !== 0) {
  throw new Error(`expected 0 weapon parse errors, got ${exports.generals_weapon_error_count()}`);
}

if (exports.generals_weapon_field_count() !== 12) {
  throw new Error(`expected 12 weapon fields, got ${exports.generals_weapon_field_count()}`);
}

function readString(ptr, size) {
  return textDecoder.decode(memory.slice(ptr, ptr + size));
}

function templateName(index) {
  return readString(
    exports.generals_weapon_template_name_ptr(index),
    exports.generals_weapon_template_name_size(index)
  );
}

function projectileName(index) {
  return readString(
    exports.generals_weapon_template_projectile_name_ptr(index),
    exports.generals_weapon_template_projectile_name_size(index)
  );
}

const firstName = templateName(0);
const secondName = templateName(1);
const firstProjectile = projectileName(0);
const firstDamage = exports.generals_weapon_template_primary_damage_x100(0);
const firstRadius = exports.generals_weapon_template_primary_damage_radius_x100(0);
const firstRange = exports.generals_weapon_template_attack_range_x100(0);
const firstDamageType = exports.generals_weapon_template_damage_type(0);
const firstDelay = exports.generals_weapon_template_delay_between_shots_min_ms(0);
const secondDamage = exports.generals_weapon_template_primary_damage_x100(1);
const secondDamageType = exports.generals_weapon_template_damage_type(1);
const secondDelayMin = exports.generals_weapon_template_delay_between_shots_min_ms(1);
const secondDelayMax = exports.generals_weapon_template_delay_between_shots_max_ms(1);

if (firstName !== "MarauderTankGun" || secondName !== "MicrowaveBeam" || firstProjectile !== "MarauderTankShell") {
  throw new Error(`unexpected weapon names: ${firstName}, ${secondName}, ${firstProjectile}`);
}

if (firstDamage !== 6000 || firstRadius !== 500 || firstRange !== 15000 || firstDamageType !== 2 || firstDelay !== 2000) {
  throw new Error(`unexpected first weapon values: damage=${firstDamage}, radius=${firstRadius}, range=${firstRange}, type=${firstDamageType}, delay=${firstDelay}`);
}

if (secondDamage !== 1250 || secondDamageType !== 35 || secondDelayMin !== 50 || secondDelayMax !== 100) {
  throw new Error(`unexpected second weapon values: damage=${secondDamage}, type=${secondDamageType}, delay=${secondDelayMin}-${secondDelayMax}`);
}

console.log(JSON.stringify({
  module: wasmPath,
  templateCount,
  fieldCount: exports.generals_weapon_field_count(),
  firstName,
  firstProjectile,
  firstDamage,
  firstRange,
  firstDamageType,
  secondName,
  secondDamage,
  secondDamageType,
  secondDelayMin,
  secondDelayMax,
}, null, 2));
