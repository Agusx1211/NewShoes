import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_armor.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = textEncoder.encode(`
Armor NoArmor
  Armor = DEFAULT 100%
  Armor = UNRESISTABLE 0%
End

Armor HumanArmor
  Armor = DEFAULT 100%
  Armor = CRUSH 200%
  Armor = FLAME 150.5%
End
`);

memory.set(source, exports.generals_armor_input_ptr());
const templateCount = exports.generals_armor_parse(source.length);

if (templateCount !== 2) {
  throw new Error(`expected 2 armor templates, got ${templateCount}`);
}

if (exports.generals_armor_error_count() !== 0) {
  throw new Error(`expected 0 armor parse errors, got ${exports.generals_armor_error_count()}`);
}

if (exports.generals_armor_assignment_count() !== 5) {
  throw new Error(`expected 5 armor assignments, got ${exports.generals_armor_assignment_count()}`);
}

function readString(ptr, size) {
  return textDecoder.decode(memory.slice(ptr, ptr + size));
}

function templateName(index) {
  return readString(
    exports.generals_armor_template_name_ptr(index),
    exports.generals_armor_template_name_size(index)
  );
}

const firstName = templateName(0);
const secondName = templateName(1);
const crushIndex = 1;
const flameIndex = 6;
const unresistableIndex = 11;
const humanCrush = exports.generals_armor_template_damage_percent_x100(1, crushIndex);
const humanFlame = exports.generals_armor_template_damage_percent_x100(1, flameIndex);
const noArmorUnresistable = exports.generals_armor_template_damage_percent_x100(0, unresistableIndex);

if (firstName !== "NoArmor" || secondName !== "HumanArmor") {
  throw new Error(`unexpected armor template names: ${firstName}, ${secondName}`);
}

if (humanCrush !== 20000 || humanFlame !== 15050 || noArmorUnresistable !== 0) {
  throw new Error(`unexpected armor coefficients: crush=${humanCrush}, flame=${humanFlame}, unresistable=${noArmorUnresistable}`);
}

console.log(JSON.stringify({
  module: wasmPath,
  templateCount,
  assignmentCount: exports.generals_armor_assignment_count(),
  resolvedCoefficientCount: exports.generals_armor_resolved_coefficient_count(),
  firstName,
  secondName,
  humanCrush,
  humanFlame,
  noArmorUnresistable,
}, null, 2));
