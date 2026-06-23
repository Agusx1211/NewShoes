import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const aiDataWasmPath = resolve(wasmDir, "dist/generals_aidata.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, aiDataWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(aiDataWasmPath),
  readFile(archivePath),
]);
const [bigModule, aiDataModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(aiDataWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const aiDataExports = aiDataModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const aiDataMemory = new Uint8Array(aiDataExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readAIDataString(ptr, size) {
  return ptr ? textDecoder.decode(aiDataMemory.slice(ptr, ptr + size)) : "";
}

function entryBytes(name) {
  for (let index = 0; index < fileCount; ++index) {
    const entryName = readBigString(
      bigExports.generals_big_entry_name_ptr(index),
      bigExports.generals_big_entry_name_size(index)
    );
    if (entryName === name) {
      const dataPtr = bigExports.generals_big_entry_data_ptr(index);
      const dataSize = bigExports.generals_big_entry_data_size(index);
      return bigMemory.slice(dataPtr, dataPtr + dataSize);
    }
  }

  throw new Error(`${name} not found in ${archivePath}`);
}

function parseAIDataPayload(bytes) {
  if (bytes.length > aiDataExports.generals_aidata_input_capacity()) {
    throw new Error(`AIData payload exceeds ${aiDataExports.generals_aidata_input_capacity()} byte wasm buffer`);
  }

  aiDataMemory.set(bytes, aiDataExports.generals_aidata_input_ptr());
  const parsedCount = aiDataExports.generals_aidata_parse(bytes.length);
  if (parsedCount < 0 || aiDataExports.generals_aidata_error_count() !== 0) {
    throw new Error(`AIData parse failed: parsed=${parsedCount}, errors=${aiDataExports.generals_aidata_error_count()}`);
  }

  return parsedCount;
}

function scalarName(index) {
  return readAIDataString(
    aiDataExports.generals_aidata_scalar_name_ptr(index),
    aiDataExports.generals_aidata_scalar_name_size(index)
  );
}

function scalarRaw(index) {
  return readAIDataString(
    aiDataExports.generals_aidata_scalar_raw_ptr(index),
    aiDataExports.generals_aidata_scalar_raw_size(index)
  );
}

function scalarSummary(name) {
  for (let index = 0; index < aiDataExports.generals_aidata_scalar_field_count(); ++index) {
    if (scalarName(index) === name) {
      return {
        index,
        raw: scalarRaw(index),
        value: aiDataExports.generals_aidata_scalar_value_x100(index),
        line: aiDataExports.generals_aidata_scalar_line(index),
        assigned: aiDataExports.generals_aidata_scalar_assigned(index),
      };
    }
  }

  throw new Error(`AIData scalar not found: ${name}`);
}

function sideName(index) {
  return readAIDataString(
    aiDataExports.generals_aidata_side_name_ptr(index),
    aiDataExports.generals_aidata_side_name_size(index)
  );
}

function sideBaseDefense(index) {
  return readAIDataString(
    aiDataExports.generals_aidata_side_base_defense_ptr(index),
    aiDataExports.generals_aidata_side_base_defense_size(index)
  );
}

function sideSummary(index) {
  return {
    index,
    name: sideName(index),
    line: aiDataExports.generals_aidata_side_line(index),
    fields: aiDataExports.generals_aidata_side_field_count_at(index),
    easy: aiDataExports.generals_aidata_side_resource_easy(index),
    normal: aiDataExports.generals_aidata_side_resource_normal(index),
    hard: aiDataExports.generals_aidata_side_resource_hard(index),
    baseDefense: sideBaseDefense(index),
    firstSkillSet: aiDataExports.generals_aidata_side_first_skill_set(index),
    skillSets: aiDataExports.generals_aidata_side_skill_set_count(index),
  };
}

function scienceName(index) {
  return readAIDataString(
    aiDataExports.generals_aidata_science_name_ptr(index),
    aiDataExports.generals_aidata_science_name_size(index)
  );
}

function buildListSide(index) {
  return readAIDataString(
    aiDataExports.generals_aidata_build_list_side_ptr(index),
    aiDataExports.generals_aidata_build_list_side_size(index)
  );
}

function buildListSummary(index) {
  return {
    index,
    side: buildListSide(index),
    line: aiDataExports.generals_aidata_build_list_line(index),
    firstStructure: aiDataExports.generals_aidata_build_list_first_structure(index),
    structures: aiDataExports.generals_aidata_build_list_structure_count(index),
  };
}

function structureString(prefix, index) {
  return readAIDataString(
    aiDataExports[`generals_aidata_structure_${prefix}_ptr`](index),
    aiDataExports[`generals_aidata_structure_${prefix}_size`](index)
  );
}

function structureSummary(index) {
  return {
    index,
    buildList: aiDataExports.generals_aidata_structure_build_list_index(index),
    template: structureString("template", index),
    name: structureString("name", index),
    line: aiDataExports.generals_aidata_structure_line(index),
    fields: aiDataExports.generals_aidata_structure_field_count_at(index),
    x: aiDataExports.generals_aidata_structure_x_x100(index),
    y: aiDataExports.generals_aidata_structure_y_x100(index),
    rebuilds: aiDataExports.generals_aidata_structure_rebuilds(index),
    angle: aiDataExports.generals_aidata_structure_angle_x100(index),
    initiallyBuilt: aiDataExports.generals_aidata_structure_initially_built(index),
    automaticallyBuild: aiDataExports.generals_aidata_structure_automatically_build(index),
  };
}

function findSide(name) {
  for (let index = 0; index < aiDataExports.generals_aidata_side_count(); ++index) {
    if (sideName(index) === name) {
      return sideSummary(index);
    }
  }

  throw new Error(`AIData side not found: ${name}`);
}

function findBuildList(side) {
  for (let index = 0; index < aiDataExports.generals_aidata_build_list_count(); ++index) {
    if (buildListSide(index) === side) {
      return buildListSummary(index);
    }
  }

  throw new Error(`AIData build list not found: ${side}`);
}

const aiDataBytes = entryBytes("data/ini/default/aidata.ini");
const parsedCount = parseAIDataPayload(aiDataBytes);
const firstBuildList = buildListSummary(0);
const lastBuildList = buildListSummary(aiDataExports.generals_aidata_build_list_count() - 1);
const firstStructure = structureSummary(0);
const lastStructure = structureSummary(aiDataExports.generals_aidata_structure_count() - 1);
const summary = {
  archive: archivePath,
  aiDataBytes: aiDataBytes.length,
  parsedCount,
  lineCount: aiDataExports.generals_aidata_line_count(),
  scalarFieldCount: aiDataExports.generals_aidata_scalar_field_count(),
  scalarAssignmentCount: aiDataExports.generals_aidata_scalar_assignment_count(),
  scalarAssignedCount: aiDataExports.generals_aidata_scalar_assigned_count(),
  sideCount: aiDataExports.generals_aidata_side_count(),
  sideFieldCount: aiDataExports.generals_aidata_side_field_count(),
  skillSetCount: aiDataExports.generals_aidata_skill_set_count(),
  scienceCount: aiDataExports.generals_aidata_science_count(),
  buildListCount: aiDataExports.generals_aidata_build_list_count(),
  structureCount: aiDataExports.generals_aidata_structure_count(),
  structureFieldCount: aiDataExports.generals_aidata_structure_field_count(),
  autoBuildCount: aiDataExports.generals_aidata_auto_build_count(),
  initiallyBuiltCount: aiDataExports.generals_aidata_initially_built_count(),
  scalars: {
    structureSeconds: scalarSummary("StructureSeconds"),
    teamSeconds: scalarSummary("TeamSeconds"),
    wealthy: scalarSummary("Wealthy"),
    rebuildDelay: scalarSummary("RebuildDelayTimeSeconds"),
    attackUsesLineOfSight: scalarSummary("AttackUsesLineOfSight"),
    minClumpDensity: scalarSummary("MinClumpDensity"),
  },
  america: findSide("America"),
  toxin: findSide("GLAToxinGeneral"),
  firstScience: scienceName(0),
  lastScience: scienceName(aiDataExports.generals_aidata_science_count() - 1),
  firstBuildList,
  lastBuildList,
  firstStructure,
  lastStructure,
  toxinBuildList: findBuildList("GLAToxinGeneral"),
};

if (summary.aiDataBytes !== 62907 ||
    summary.parsedCount !== 66 ||
    summary.lineCount !== 1985 ||
    summary.scalarFieldCount !== 43 ||
    summary.scalarAssignmentCount !== 42 ||
    summary.scalarAssignedCount !== 42 ||
    summary.sideCount !== 12 ||
    summary.sideFieldCount !== 48 ||
    summary.skillSetCount !== 24 ||
    summary.scienceCount !== 168 ||
    summary.buildListCount !== 12 ||
    summary.structureCount !== 214 ||
    summary.structureFieldCount !== 1070 ||
    summary.autoBuildCount !== 12 ||
    summary.initiallyBuiltCount !== 0) {
  throw new Error(`unexpected AIData aggregate parse: ${JSON.stringify(summary)}`);
}

if (summary.scalars.structureSeconds.raw !== "0.0" ||
    summary.scalars.teamSeconds.value !== 1000 ||
    summary.scalars.wealthy.raw !== "7000" ||
    summary.scalars.rebuildDelay.raw !== "30" ||
    summary.scalars.attackUsesLineOfSight.raw !== "Yes" ||
    summary.scalars.minClumpDensity.assigned !== 0) {
  throw new Error(`unexpected AIData scalar parse: ${JSON.stringify(summary.scalars)}`);
}

if (summary.america.index !== 0 ||
    summary.america.easy !== 2 ||
    summary.america.normal !== 2 ||
    summary.america.hard !== 2 ||
    summary.america.baseDefense !== "AmericaPatriotBattery" ||
    summary.america.skillSets !== 2 ||
    summary.toxin.index !== 11 ||
    summary.toxin.easy !== 5 ||
    summary.toxin.baseDefense !== "Chem_GLAStingerSite" ||
    summary.firstScience !== "SCIENCE_PaladinTank" ||
    summary.lastScience !== "SCIENCE_SneakAttack") {
  throw new Error(`unexpected AIData side/skill parse: ${JSON.stringify({ america: summary.america, toxin: summary.toxin, firstScience: summary.firstScience, lastScience: summary.lastScience })}`);
}

if (summary.firstBuildList.side !== "America" ||
    summary.firstBuildList.structures !== 18 ||
    summary.lastBuildList.side !== "GLAToxinGeneral" ||
    summary.lastBuildList.structures !== 14 ||
    summary.firstStructure.template !== "AmericaCommandCenter" ||
    summary.firstStructure.x !== 50122 ||
    summary.firstStructure.y !== 54625 ||
    summary.firstStructure.angle !== -13500 ||
    summary.firstStructure.automaticallyBuild !== 1 ||
    summary.lastStructure.template !== "Chem_GLATunnelNetwork" ||
    summary.lastStructure.x !== 54765 ||
    summary.lastStructure.y !== 56538 ||
    summary.lastStructure.angle !== 4500 ||
    summary.lastStructure.automaticallyBuild !== 0) {
  throw new Error(`unexpected AIData build-list parse: ${JSON.stringify({ firstBuildList, lastBuildList, firstStructure, lastStructure })}`);
}

console.log(JSON.stringify(summary, null, 2));
