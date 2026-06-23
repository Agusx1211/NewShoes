import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_crate.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
CrateData TestCrate
  CreationChance = .75
  VeterancyLevel = ELITE
  KilledByType = SALVAGER VEHICLE
  KillerScience = SCIENCE_TestCrate
  OwnedByMaker = Yes
  CrateObject = 1000DollarCrate .75
  CrateObject = SmallLevelUpCrate .25
End

Object IgnoredCrateObject
  KindOf = CRATE
End

CrateData AlwaysCrate
  CreationChance = 1.0
  CrateObject = SupplyDropZoneCrate 1.0
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_crate_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_crate_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_crate_input_ptr());
const parsedCount = exports.generals_crate_parse(bytes.length);
if (parsedCount < 0 || exports.generals_crate_error_count() !== 0) {
  throw new Error(`CrateData parse failed: parsed=${parsedCount}, errors=${exports.generals_crate_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function templateName(index) {
  return readString(
    exports.generals_crate_template_name_ptr(index),
    exports.generals_crate_template_name_size(index)
  );
}

function templateString(prefix, index) {
  return readString(
    exports[`generals_crate_template_${prefix}_ptr`](index),
    exports[`generals_crate_template_${prefix}_size`](index)
  );
}

function objectName(index) {
  return readString(
    exports.generals_crate_object_name_ptr(index),
    exports.generals_crate_object_name_size(index)
  );
}

function veterancyName(index) {
  return readString(
    exports.generals_crate_veterancy_name_ptr(index),
    exports.generals_crate_veterancy_name_size(index)
  );
}

if (parsedCount !== 2 ||
    exports.generals_crate_object_count() !== 3 ||
    exports.generals_crate_field_count() !== 9 ||
    exports.generals_crate_owned_by_maker_count() !== 1 ||
    exports.generals_crate_veterancy_condition_count() !== 1 ||
    exports.generals_crate_kindof_condition_count() !== 1 ||
    exports.generals_crate_science_condition_count() !== 1 ||
    templateName(0) !== "TestCrate" ||
    templateName(1) !== "AlwaysCrate" ||
    veterancyName(2) !== "ELITE") {
  throw new Error("unexpected CrateData aggregate parse");
}

if (exports.generals_crate_template_creation_chance_x100(0) !== 75 ||
    exports.generals_crate_template_veterancy_level(0) !== 2 ||
    templateString("killed_by_type", 0) !== "SALVAGER VEHICLE" ||
    templateString("killer_science", 0) !== "SCIENCE_TestCrate" ||
    exports.generals_crate_template_owned_by_maker(0) !== 1 ||
    exports.generals_crate_template_object_count(0) !== 2 ||
    objectName(0) !== "1000DollarCrate" ||
    exports.generals_crate_object_chance_x100(0) !== 75 ||
    objectName(1) !== "SmallLevelUpCrate" ||
    exports.generals_crate_object_chance_x100(1) !== 25 ||
    exports.generals_crate_template_creation_chance_x100(1) !== 100 ||
    objectName(2) !== "SupplyDropZoneCrate" ||
    exports.generals_crate_object_chance_x100(2) !== 100) {
  throw new Error("unexpected CrateData template values");
}

console.log(JSON.stringify({
  module: wasmPath,
  templates: parsedCount,
  objects: exports.generals_crate_object_count(),
  first: templateName(0),
}, null, 2));
