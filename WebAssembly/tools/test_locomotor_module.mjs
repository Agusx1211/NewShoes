import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_locomotor.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function templateName(index) {
  return readString(
    exports.generals_locomotor_template_name_ptr(index),
    exports.generals_locomotor_template_name_size(index)
  );
}

function templateSurfaces(index) {
  return readString(
    exports.generals_locomotor_template_surfaces_ptr(index),
    exports.generals_locomotor_template_surfaces_size(index)
  );
}

function enumName(kind, index) {
  return readString(
    exports[`generals_locomotor_${kind}_name_ptr`](index),
    exports[`generals_locomotor_${kind}_name_size`](index)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_locomotor_input_ptr());
  const parsedCount = exports.generals_locomotor_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_locomotor_error_count() !== 0) {
    throw new Error(`locomotor parse failed: parsed=${parsedCount}, errors=${exports.generals_locomotor_error_count()}`);
  }
  return parsedCount;
}

parse(`
Locomotor BasicHumanLocomotor
  Surfaces = GROUND RUBBLE
  Speed = 20 ; comment after value
  SpeedDamaged = 10
  TurnRate = 500
  TurnRateDamaged = 450
  Acceleration = 100
  AccelerationDamaged = 50
  Braking = 100
  MinTurnSpeed = 0
  ZAxisBehavior = NO_Z_MOTIVE_FORCE
  Appearance = TWO_LEGS
  StickToGround = Yes
  GroupMovementPriority = MOVES_FRONT
End

Locomotor JetLocomotor
  Surfaces = AIR
  Speed = 120
  TurnRate = 180
  Acceleration = 80
  Lift = 120
  Braking = 10
  MinSpeed = 30
  PreferredHeight = 120
  PreferredHeightDamping = 0.75
  ZAxisBehavior = ABSOLUTE_HEIGHT
  Appearance = WINGS
  GroupMovementPriority = MOVES_BACK
  AllowAirborneMotiveForce = Yes
  LocomotorWorksWhenDead = Yes
  AirborneTargetingHeight = 100
  CanMoveBackwards = No
  CloseEnoughDist = 5.5
  CloseEnoughDist3D = Yes
  PitchStiffness = 0.2
End
`);

if (exports.generals_locomotor_template_count() !== 2 ||
    exports.generals_locomotor_field_count() !== 32 ||
    exports.generals_locomotor_ground_template_count() !== 1 ||
    exports.generals_locomotor_air_template_count() !== 1 ||
    exports.generals_locomotor_water_template_count() !== 0 ||
    exports.generals_locomotor_cliff_template_count() !== 0) {
  throw new Error("unexpected aggregate Locomotor parse result");
}

if (enumName("surface", 0) !== "GROUND" ||
    enumName("behavior_z", 3) !== "ABSOLUTE_HEIGHT" ||
    enumName("appearance", 5) !== "WINGS" ||
    enumName("priority", 2) !== "MOVES_FRONT") {
  throw new Error("unexpected Locomotor enum names");
}

if (templateName(0) !== "BasicHumanLocomotor" ||
    templateSurfaces(0) !== "GROUND RUBBLE" ||
    exports.generals_locomotor_template_surfaces_mask(0) !== 17 ||
    exports.generals_locomotor_template_field_count(0) !== 13 ||
    exports.generals_locomotor_template_speed_x100(0) !== 2000 ||
    exports.generals_locomotor_template_speed_damaged_x100(0) !== 1000 ||
    exports.generals_locomotor_template_turn_rate_x100(0) !== 50000 ||
    exports.generals_locomotor_template_turn_rate_damaged_x100(0) !== 45000 ||
    exports.generals_locomotor_template_acceleration_x100(0) !== 10000 ||
    exports.generals_locomotor_template_acceleration_damaged_x100(0) !== 5000 ||
    exports.generals_locomotor_template_braking_x100(0) !== 10000 ||
    exports.generals_locomotor_template_behavior_z(0) !== 0 ||
    exports.generals_locomotor_template_appearance(0) !== 0 ||
    exports.generals_locomotor_template_move_priority(0) !== 2 ||
    exports.generals_locomotor_template_stick_to_ground(0) !== 1) {
  throw new Error("unexpected BasicHumanLocomotor parse result");
}

if (templateName(1) !== "JetLocomotor" ||
    templateSurfaces(1) !== "AIR" ||
    exports.generals_locomotor_template_surfaces_mask(1) !== 8 ||
    exports.generals_locomotor_template_field_count(1) !== 19 ||
    exports.generals_locomotor_template_speed_x100(1) !== 12000 ||
    exports.generals_locomotor_template_speed_damaged_x100(1) !== 12000 ||
    exports.generals_locomotor_template_turn_rate_x100(1) !== 18000 ||
    exports.generals_locomotor_template_turn_rate_damaged_x100(1) !== 18000 ||
    exports.generals_locomotor_template_acceleration_x100(1) !== 8000 ||
    exports.generals_locomotor_template_acceleration_damaged_x100(1) !== 8000 ||
    exports.generals_locomotor_template_lift_x100(1) !== 12000 ||
    exports.generals_locomotor_template_lift_damaged_x100(1) !== 12000 ||
    exports.generals_locomotor_template_min_speed_x100(1) !== 3000 ||
    exports.generals_locomotor_template_preferred_height_x100(1) !== 12000 ||
    exports.generals_locomotor_template_preferred_height_damping_x100(1) !== 75 ||
    exports.generals_locomotor_template_behavior_z(1) !== 3 ||
    exports.generals_locomotor_template_appearance(1) !== 5 ||
    exports.generals_locomotor_template_move_priority(1) !== 0 ||
    exports.generals_locomotor_template_allow_airborne_motive_force(1) !== 1 ||
    exports.generals_locomotor_template_locomotor_works_when_dead(1) !== 1 ||
    exports.generals_locomotor_template_airborne_targeting_height(1) !== 100 ||
    exports.generals_locomotor_template_can_move_backwards(1) !== 0 ||
    exports.generals_locomotor_template_close_enough_dist_x100(1) !== 550 ||
    exports.generals_locomotor_template_close_enough_dist_3d(1) !== 1) {
  throw new Error("unexpected JetLocomotor parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  templates: exports.generals_locomotor_template_count(),
  fields: exports.generals_locomotor_field_count(),
  groundTemplates: exports.generals_locomotor_ground_template_count(),
  airTemplates: exports.generals_locomotor_air_template_count(),
  first: templateName(0),
}, null, 2));
