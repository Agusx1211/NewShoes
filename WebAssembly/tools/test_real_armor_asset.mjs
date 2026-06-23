import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const armorWasmPath = resolve(wasmDir, "dist/generals_armor.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const targetIni = process.argv[3] ?? "data/ini/armor.ini";
const [bigWasmBytes, armorWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(armorWasmPath),
  readFile(archivePath),
]);
const [bigModule, armorModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(armorWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const armorExports = armorModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const armorMemory = new Uint8Array(armorExports.memory.buffer);
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

if (dataSize > armorExports.generals_armor_input_capacity()) {
  throw new Error(`${targetIni} exceeds armor wasm input capacity`);
}

armorMemory.set(bigMemory.slice(dataPtr, dataPtr + dataSize), armorExports.generals_armor_input_ptr());
const templateCount = armorExports.generals_armor_parse(dataSize);

if (templateCount !== 51 || armorExports.generals_armor_error_count() !== 0) {
  throw new Error(`real armor parse failed: templates=${templateCount}, errors=${armorExports.generals_armor_error_count()}`);
}

if (armorExports.generals_armor_assignment_count() !== 855) {
  throw new Error(`expected 855 real armor assignments, got ${armorExports.generals_armor_assignment_count()}`);
}

function readString(ptr, size) {
  return textDecoder.decode(armorMemory.slice(ptr, ptr + size));
}

function templateName(index) {
  return readString(
    armorExports.generals_armor_template_name_ptr(index),
    armorExports.generals_armor_template_name_size(index)
  );
}

const firstName = templateName(0);
const humanName = templateName(1);
const defaultExplosion = armorExports.generals_armor_template_damage_percent_x100(0, 0);
const noArmorHazardCleanup = armorExports.generals_armor_template_damage_percent_x100(0, 21);
const noArmorSubdualMissile = armorExports.generals_armor_template_damage_percent_x100(0, 31);
const humanCrush = armorExports.generals_armor_template_damage_percent_x100(1, 1);

if (firstName !== "NoArmor" || humanName !== "HumanArmor") {
  throw new Error(`unexpected real armor names: ${firstName}, ${humanName}`);
}

if (defaultExplosion !== 10000 || noArmorHazardCleanup !== 0 || noArmorSubdualMissile !== 0 || humanCrush !== 20000) {
  throw new Error(`unexpected real armor coefficients: default=${defaultExplosion}, hazardCleanup=${noArmorHazardCleanup}, subdualMissile=${noArmorSubdualMissile}, humanCrush=${humanCrush}`);
}

const preview = [];
for (let index = 0; index < Math.min(templateCount, 8); ++index) {
  preview.push({
    index,
    name: templateName(index),
    assignments: armorExports.generals_armor_template_assignment_count(index),
    line: armorExports.generals_armor_template_line(index),
  });
}

console.log(JSON.stringify({
  archive: archivePath,
  targetIni,
  dataSize,
  templateCount,
  assignmentCount: armorExports.generals_armor_assignment_count(),
  resolvedCoefficientCount: armorExports.generals_armor_resolved_coefficient_count(),
  firstName,
  defaultExplosion,
  noArmorHazardCleanup,
  noArmorSubdualMissile,
  humanCrush,
  preview,
}, null, 2));
