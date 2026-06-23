import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const weaponWasmPath = resolve(wasmDir, "dist/generals_weapon.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const targetIni = process.argv[3] ?? "data/ini/weapon.ini";
const [bigWasmBytes, weaponWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(weaponWasmPath),
  readFile(archivePath),
]);
const [bigModule, weaponModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(weaponWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const weaponExports = weaponModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const weaponMemory = new Uint8Array(weaponExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);
let dataPtr = 0;
let dataSize = 0;

for (let index = 0; index < fileCount; ++index) {
  const namePtr = bigExports.generals_big_entry_name_ptr(index);
  const nameSize = bigExports.generals_big_entry_name_size(index);
  const name = textDecoder.decode(bigMemory.slice(namePtr, namePtr + nameSize));
  if (name === targetIni) {
    dataPtr = bigExports.generals_big_entry_data_ptr(index);
    dataSize = bigExports.generals_big_entry_data_size(index);
    break;
  }
}

if (!dataPtr || !dataSize) {
  throw new Error(`could not find ${targetIni}`);
}

if (dataSize > weaponExports.generals_weapon_input_capacity()) {
  throw new Error(`${targetIni} exceeds weapon wasm input capacity`);
}

weaponMemory.set(bigMemory.slice(dataPtr, dataPtr + dataSize), weaponExports.generals_weapon_input_ptr());
const templateCount = weaponExports.generals_weapon_parse(dataSize);

if (templateCount !== 360 || weaponExports.generals_weapon_error_count() !== 0) {
  throw new Error(`real weapon parse failed: templates=${templateCount}, errors=${weaponExports.generals_weapon_error_count()}`);
}

if (weaponExports.generals_weapon_field_count() !== 6244) {
  throw new Error(`expected 6244 real weapon fields, got ${weaponExports.generals_weapon_field_count()}`);
}

function readString(ptr, size) {
  return textDecoder.decode(weaponMemory.slice(ptr, ptr + size));
}

function templateName(index) {
  return readString(
    weaponExports.generals_weapon_template_name_ptr(index),
    weaponExports.generals_weapon_template_name_size(index)
  );
}

function projectileName(index) {
  const ptr = weaponExports.generals_weapon_template_projectile_name_ptr(index);
  const size = weaponExports.generals_weapon_template_projectile_name_size(index);
  return ptr ? readString(ptr, size) : "";
}

const firstName = templateName(0);
const firstProjectile = projectileName(0);
const firstDamage = weaponExports.generals_weapon_template_primary_damage_x100(0);
const firstRadius = weaponExports.generals_weapon_template_primary_damage_radius_x100(0);
const firstRange = weaponExports.generals_weapon_template_attack_range_x100(0);
const firstDamageType = weaponExports.generals_weapon_template_damage_type(0);
const firstSpeed = weaponExports.generals_weapon_template_weapon_speed_x100(0);
const firstDelay = weaponExports.generals_weapon_template_delay_between_shots_min_ms(0);

if (firstName !== "MarauderTankGun" || firstProjectile !== "MarauderTankShell") {
  throw new Error(`unexpected first weapon names: ${firstName}, ${firstProjectile}`);
}

if (firstDamage !== 6000 || firstRadius !== 500 || firstRange !== 15000 || firstDamageType !== 2 || firstSpeed !== 30000 || firstDelay !== 2000) {
  throw new Error(`unexpected first weapon values: damage=${firstDamage}, radius=${firstRadius}, range=${firstRange}, type=${firstDamageType}, speed=${firstSpeed}, delay=${firstDelay}`);
}

const preview = [];
for (let index = 0; index < Math.min(templateCount, 8); ++index) {
  preview.push({
    index,
    name: templateName(index),
    fields: weaponExports.generals_weapon_template_field_count(index),
    primaryDamage: weaponExports.generals_weapon_template_primary_damage_x100(index),
    attackRange: weaponExports.generals_weapon_template_attack_range_x100(index),
    damageType: weaponExports.generals_weapon_template_damage_type(index),
    projectile: projectileName(index),
    line: weaponExports.generals_weapon_template_line(index),
  });
}

console.log(JSON.stringify({
  archive: archivePath,
  targetIni,
  dataSize,
  templateCount,
  fieldCount: weaponExports.generals_weapon_field_count(),
  firstName,
  firstProjectile,
  firstDamage,
  firstRange,
  firstDamageType,
  firstSpeed,
  firstDelay,
  preview,
}, null, 2));
