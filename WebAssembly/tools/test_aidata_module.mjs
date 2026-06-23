import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_aidata.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
AIData
  StructureSeconds = 1.5
  TeamSeconds = 10
  Wealthy = 7000
  EnableRepulsors = Yes
  MinClumpDensity = .5

  SideInfo America
    ResourceGatherersEasy = 2
    ResourceGatherersNormal = 3
    ResourceGatherersHard = 4
    BaseDefenseStructure1 = AmericaPatriotBattery
    SkillSet1
      Science = SCIENCE_PaladinTank
      Science = SCIENCE_StealthFighter
    End
  End

  SkirmishBuildList America
    Structure AmericaCommandCenter
      Name = USA_CC
      Location = X:501.22 Y:546.25
      Rebuilds = 2
      Angle = -135.00
      InitiallyBuilt = Yes
      RallyPointOffset = X:10.50 Y:-20.00
      AutomaticallyBuild = No
    End
  End
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_aidata_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_aidata_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_aidata_input_ptr());
const parsedCount = exports.generals_aidata_parse(bytes.length);
if (parsedCount < 0 || exports.generals_aidata_error_count() !== 0) {
  throw new Error(`AIData parse failed: parsed=${parsedCount}, errors=${exports.generals_aidata_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function scalarName(index) {
  return readString(
    exports.generals_aidata_scalar_name_ptr(index),
    exports.generals_aidata_scalar_name_size(index)
  );
}

function scalarRaw(index) {
  return readString(
    exports.generals_aidata_scalar_raw_ptr(index),
    exports.generals_aidata_scalar_raw_size(index)
  );
}

function scalarIndex(name) {
  for (let index = 0; index < exports.generals_aidata_scalar_field_count(); ++index) {
    if (scalarName(index) === name) {
      return index;
    }
  }

  throw new Error(`scalar not found: ${name}`);
}

function sideName(index) {
  return readString(
    exports.generals_aidata_side_name_ptr(index),
    exports.generals_aidata_side_name_size(index)
  );
}

function sideBaseDefense(index) {
  return readString(
    exports.generals_aidata_side_base_defense_ptr(index),
    exports.generals_aidata_side_base_defense_size(index)
  );
}

function scienceName(index) {
  return readString(
    exports.generals_aidata_science_name_ptr(index),
    exports.generals_aidata_science_name_size(index)
  );
}

function buildListSide(index) {
  return readString(
    exports.generals_aidata_build_list_side_ptr(index),
    exports.generals_aidata_build_list_side_size(index)
  );
}

function structureString(prefix, index) {
  return readString(
    exports[`generals_aidata_structure_${prefix}_ptr`](index),
    exports[`generals_aidata_structure_${prefix}_size`](index)
  );
}

const structureSeconds = scalarIndex("StructureSeconds");
const minClumpDensity = scalarIndex("MinClumpDensity");
const enableRepulsors = scalarIndex("EnableRepulsors");

if (parsedCount !== 7 ||
    exports.generals_aidata_scalar_assignment_count() !== 5 ||
    exports.generals_aidata_scalar_assigned_count() !== 5 ||
    exports.generals_aidata_side_count() !== 1 ||
    exports.generals_aidata_side_field_count() !== 4 ||
    exports.generals_aidata_skill_set_count() !== 1 ||
    exports.generals_aidata_science_count() !== 2 ||
    exports.generals_aidata_build_list_count() !== 1 ||
    exports.generals_aidata_structure_count() !== 1 ||
    exports.generals_aidata_structure_field_count() !== 7 ||
    exports.generals_aidata_auto_build_count() !== 0 ||
    exports.generals_aidata_initially_built_count() !== 1) {
  throw new Error("unexpected AIData aggregate parse");
}

if (scalarRaw(structureSeconds) !== "1.5" ||
    exports.generals_aidata_scalar_value_x100(structureSeconds) !== 150 ||
    scalarRaw(minClumpDensity) !== ".5" ||
    exports.generals_aidata_scalar_value_x100(minClumpDensity) !== 50 ||
    scalarRaw(enableRepulsors) !== "Yes" ||
    exports.generals_aidata_scalar_value_x100(enableRepulsors) !== 1 ||
    sideName(0) !== "America" ||
    sideBaseDefense(0) !== "AmericaPatriotBattery" ||
    exports.generals_aidata_side_resource_easy(0) !== 2 ||
    exports.generals_aidata_side_resource_normal(0) !== 3 ||
    exports.generals_aidata_side_resource_hard(0) !== 4 ||
    exports.generals_aidata_side_skill_set_count(0) !== 1 ||
    exports.generals_aidata_skill_set_slot(0) !== 1 ||
    exports.generals_aidata_skill_set_science_count(0) !== 2 ||
    scienceName(0) !== "SCIENCE_PaladinTank" ||
    scienceName(1) !== "SCIENCE_StealthFighter" ||
    buildListSide(0) !== "America" ||
    exports.generals_aidata_build_list_structure_count(0) !== 1 ||
    structureString("template", 0) !== "AmericaCommandCenter" ||
    structureString("name", 0) !== "USA_CC" ||
    exports.generals_aidata_structure_x_x100(0) !== 50122 ||
    exports.generals_aidata_structure_y_x100(0) !== 54625 ||
    exports.generals_aidata_structure_rally_x_x100(0) !== 1050 ||
    exports.generals_aidata_structure_rally_y_x100(0) !== -2000 ||
    exports.generals_aidata_structure_rebuilds(0) !== 2 ||
    exports.generals_aidata_structure_angle_x100(0) !== -13500 ||
    exports.generals_aidata_structure_initially_built(0) !== 1 ||
    exports.generals_aidata_structure_automatically_build(0) !== 0) {
  throw new Error("unexpected AIData parsed values");
}

console.log(JSON.stringify({
  module: wasmPath,
  scalars: exports.generals_aidata_scalar_assigned_count(),
  sides: exports.generals_aidata_side_count(),
  structures: exports.generals_aidata_structure_count(),
  side: sideName(0),
}, null, 2));
