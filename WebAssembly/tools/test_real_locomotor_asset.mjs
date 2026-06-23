import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const locomotorWasmPath = resolve(wasmDir, "dist/generals_locomotor.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, locomotorWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(locomotorWasmPath),
  readFile(archivePath),
]);
const [bigModule, locomotorModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(locomotorWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const locomotorExports = locomotorModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const locomotorMemory = new Uint8Array(locomotorExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readLocomotorString(ptr, size) {
  return ptr ? textDecoder.decode(locomotorMemory.slice(ptr, ptr + size)) : "";
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

function parseLocomotorPayload(bytes) {
  if (bytes.length > locomotorExports.generals_locomotor_input_capacity()) {
    throw new Error(`Locomotor payload exceeds ${locomotorExports.generals_locomotor_input_capacity()} byte wasm buffer`);
  }

  locomotorMemory.set(bytes, locomotorExports.generals_locomotor_input_ptr());
  const parsedCount = locomotorExports.generals_locomotor_parse(bytes.length);
  if (parsedCount < 0 || locomotorExports.generals_locomotor_error_count() !== 0) {
    throw new Error(`Locomotor parse failed: parsed=${parsedCount}, errors=${locomotorExports.generals_locomotor_error_count()}`);
  }

  return parsedCount;
}

function templateString(prefix, index) {
  return readLocomotorString(
    locomotorExports[`generals_locomotor_template_${prefix}_ptr`](index),
    locomotorExports[`generals_locomotor_template_${prefix}_size`](index)
  );
}

function enumString(kind, index) {
  return readLocomotorString(
    locomotorExports[`generals_locomotor_${kind}_name_ptr`](index),
    locomotorExports[`generals_locomotor_${kind}_name_size`](index)
  );
}

function templateName(index) {
  return templateString("name", index);
}

function templateSurfaces(index) {
  return templateString("surfaces", index);
}

function templateSummary(index) {
  const appearance = locomotorExports.generals_locomotor_template_appearance(index);
  const behaviorZ = locomotorExports.generals_locomotor_template_behavior_z(index);
  const priority = locomotorExports.generals_locomotor_template_move_priority(index);
  return {
    index,
    name: templateName(index),
    line: locomotorExports.generals_locomotor_template_line(index),
    fields: locomotorExports.generals_locomotor_template_field_count(index),
    surfaces: templateSurfaces(index),
    mask: locomotorExports.generals_locomotor_template_surfaces_mask(index),
    speed: locomotorExports.generals_locomotor_template_speed_x100(index),
    speedDamaged: locomotorExports.generals_locomotor_template_speed_damaged_x100(index),
    turnRate: locomotorExports.generals_locomotor_template_turn_rate_x100(index),
    acceleration: locomotorExports.generals_locomotor_template_acceleration_x100(index),
    braking: locomotorExports.generals_locomotor_template_braking_x100(index),
    minSpeed: locomotorExports.generals_locomotor_template_min_speed_x100(index),
    preferredHeight: locomotorExports.generals_locomotor_template_preferred_height_x100(index),
    appearance: enumString("appearance", appearance),
    behaviorZ: enumString("behavior_z", behaviorZ),
    priority: enumString("priority", priority),
    stickToGround: locomotorExports.generals_locomotor_template_stick_to_ground(index),
    canMoveBackwards: locomotorExports.generals_locomotor_template_can_move_backwards(index),
    allowAirborneMotiveForce: locomotorExports.generals_locomotor_template_allow_airborne_motive_force(index),
  };
}

const locomotorBytes = entryBytes("data/ini/locomotor.ini");
const templateCount = parseLocomotorPayload(locomotorBytes);
const namedTemplates = new Map();

for (let index = 0; index < templateCount; ++index) {
  const name = templateName(index);
  if (name === "BasicHumanLocomotor" ||
      name === "RocketBuggyLocomotor" ||
      name === "ComancheLocomotor" ||
      name === "AuroraJetLocomotor") {
    namedTemplates.set(name, templateSummary(index));
  }
}

const summary = {
  archive: archivePath,
  locomotorBytes: locomotorBytes.length,
  templateCount,
  fieldCount: locomotorExports.generals_locomotor_field_count(),
  lineCount: locomotorExports.generals_locomotor_line_count(),
  groundTemplates: locomotorExports.generals_locomotor_ground_template_count(),
  airTemplates: locomotorExports.generals_locomotor_air_template_count(),
  waterTemplates: locomotorExports.generals_locomotor_water_template_count(),
  cliffTemplates: locomotorExports.generals_locomotor_cliff_template_count(),
  first: templateName(0),
  last: templateName(templateCount - 1),
  samples: Object.fromEntries(namedTemplates),
};

if (summary.locomotorBytes !== 261327 ||
    summary.templateCount !== 182 ||
    summary.fieldCount !== 3548 ||
    summary.lineCount !== 4607 ||
    summary.groundTemplates !== 110 ||
    summary.airTemplates !== 65 ||
    summary.waterTemplates !== 4 ||
    summary.cliffTemplates !== 7 ||
    summary.first !== "BasicHumanLocomotor" ||
    summary.last !== "Nuke_FusionOverlordLocomotor") {
  throw new Error(`unexpected Locomotor aggregate parse: ${JSON.stringify(summary)}`);
}

const basic = namedTemplates.get("BasicHumanLocomotor");
if (!basic ||
    basic.index !== 0 ||
    basic.fields !== 13 ||
    basic.surfaces !== "GROUND RUBBLE" ||
    basic.mask !== 17 ||
    basic.speed !== 2000 ||
    basic.speedDamaged !== 1000 ||
    basic.turnRate !== 50000 ||
    basic.acceleration !== 10000 ||
    basic.braking !== 10000 ||
    basic.appearance !== "TWO_LEGS" ||
    basic.behaviorZ !== "NO_Z_MOTIVE_FORCE" ||
    basic.priority !== "MOVES_FRONT" ||
    basic.stickToGround !== 1) {
  throw new Error(`unexpected BasicHumanLocomotor parse: ${JSON.stringify(basic)}`);
}

const buggy = namedTemplates.get("RocketBuggyLocomotor");
if (!buggy ||
    buggy.fields !== 26 ||
    buggy.surfaces !== "GROUND" ||
    buggy.mask !== 1 ||
    buggy.speed !== 9000 ||
    buggy.speedDamaged !== 8000 ||
    buggy.appearance !== "FOUR_WHEELS" ||
    buggy.canMoveBackwards !== 1) {
  throw new Error(`unexpected RocketBuggyLocomotor parse: ${JSON.stringify(buggy)}`);
}

const comanche = namedTemplates.get("ComancheLocomotor");
if (!comanche ||
    comanche.fields !== 24 ||
    comanche.surfaces !== "AIR" ||
    comanche.mask !== 8 ||
    comanche.speed !== 12000 ||
    comanche.speedDamaged !== 12000 ||
    comanche.preferredHeight !== 10000 ||
    comanche.appearance !== "HOVER" ||
    comanche.behaviorZ !== "SURFACE_RELATIVE_HEIGHT" ||
    comanche.allowAirborneMotiveForce !== 1) {
  throw new Error(`unexpected ComancheLocomotor parse: ${JSON.stringify(comanche)}`);
}

const aurora = namedTemplates.get("AuroraJetLocomotor");
if (!aurora ||
    aurora.fields !== 27 ||
    aurora.surfaces !== "AIR" ||
    aurora.mask !== 8 ||
    aurora.speed !== 18000 ||
    aurora.speedDamaged !== 12000 ||
    aurora.minSpeed !== 6000 ||
    aurora.appearance !== "WINGS" ||
    aurora.behaviorZ !== "SURFACE_RELATIVE_HEIGHT" ||
    aurora.allowAirborneMotiveForce !== 1) {
  throw new Error(`unexpected AuroraJetLocomotor parse: ${JSON.stringify(aurora)}`);
}

console.log(JSON.stringify(summary, null, 2));
