import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_particle.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function templateString(prefix, index) {
  return readString(
    exports[`generals_particle_template_${prefix}_ptr`](index),
    exports[`generals_particle_template_${prefix}_size`](index)
  );
}

function enumName(kind, index) {
  return readString(
    exports[`generals_particle_${kind}_name_ptr`](index),
    exports[`generals_particle_${kind}_name_size`](index)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_particle_input_ptr());
  const parsedCount = exports.generals_particle_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_particle_error_count() !== 0) {
    throw new Error(`ParticleSystem parse failed: parsed=${parsedCount}, errors=${exports.generals_particle_error_count()}`);
  }
  return parsedCount;
}

parse(`
ParticleSystem TestSmoke
  Priority = WEAPON_EXPLOSION
  IsOneShot = No
  Shader = ALPHA
  Type = PARTICLE
  ParticleName = EXSmoke.tga ; comment after value
  Lifetime = 60.00 90.00
  SystemLifetime = 10
  Size = 5.00 7.50
  BurstDelay = 20.00 20.00
  BurstCount = 1.00 2.00
  InitialDelay = 0.00 5.00
  Gravity = -0.25
  VelocityType = OUTWARD
  VolumeType = SPHERE
  VolSphereRadius = 4.00
  IsHollow = Yes
  IsGroundAligned = No
  IsEmitAboveGroundOnly = Yes
  IsParticleUpTowardsEmitter = No
End

ParticleSystem TestTrail
  Priority = WEAPON_TRAIL
  IsOneShot = Yes
  Shader = ADDITIVE
  Type = STREAK
  ParticleName = EXTrail.tga
  SlaveSystem = SlaveSmoke
  PerParticleAttachedSystem = SparkChild
  Lifetime = 75.00 75.00
  Size = 0.10 0.20
  BurstDelay = 3.00 3.00
  BurstCount = 1.00 1.00
  InitialDelay = 0.00 0.00
  VelocityType = ORTHO
  VolumeType = CYLINDER
  VolCylinderRadius = 10.00
  VolCylinderLength = 20.00
End
`);

if (exports.generals_particle_template_count() !== 2 ||
    exports.generals_particle_field_count() !== 35 ||
    exports.generals_particle_priority_count(1) !== 1 ||
    exports.generals_particle_priority_count(10) !== 1 ||
    exports.generals_particle_shader_count(1) !== 1 ||
    exports.generals_particle_shader_count(2) !== 1 ||
    exports.generals_particle_type_count(1) !== 1 ||
    exports.generals_particle_type_count(3) !== 1 ||
    exports.generals_particle_velocity_count(1) !== 1 ||
    exports.generals_particle_velocity_count(5) !== 1 ||
    exports.generals_particle_volume_count(4) !== 1 ||
    exports.generals_particle_volume_count(5) !== 1) {
  throw new Error("unexpected aggregate ParticleSystem parse result");
}

if (enumName("shader", 2) !== "ALPHA" ||
    enumName("type", 3) !== "STREAK" ||
    enumName("priority", 12) !== "CRITICAL" ||
    enumName("velocity", 5) !== "OUTWARD" ||
    enumName("volume", 5) !== "CYLINDER") {
  throw new Error("unexpected ParticleSystem enum names");
}

if (templateString("name", 0) !== "TestSmoke" ||
    templateString("particle_name", 0) !== "EXSmoke.tga" ||
    exports.generals_particle_template_line(0) !== 2 ||
    exports.generals_particle_template_field_count_at(0) !== 19 ||
    exports.generals_particle_template_priority(0) !== 1 ||
    exports.generals_particle_template_shader(0) !== 2 ||
    exports.generals_particle_template_type(0) !== 1 ||
    exports.generals_particle_template_is_one_shot(0) !== 0 ||
    exports.generals_particle_template_lifetime_low_x100(0) !== 6000 ||
    exports.generals_particle_template_lifetime_high_x100(0) !== 9000 ||
    exports.generals_particle_template_system_lifetime(0) !== 10 ||
    exports.generals_particle_template_size_low_x100(0) !== 500 ||
    exports.generals_particle_template_size_high_x100(0) !== 750 ||
    exports.generals_particle_template_burst_delay_low_x100(0) !== 2000 ||
    exports.generals_particle_template_burst_count_high_x100(0) !== 200 ||
    exports.generals_particle_template_initial_delay_high_x100(0) !== 500 ||
    exports.generals_particle_template_gravity_x100(0) !== -25 ||
    exports.generals_particle_template_velocity_type(0) !== 5 ||
    exports.generals_particle_template_volume_type(0) !== 4 ||
    exports.generals_particle_template_volume_radius_x100(0) !== 400 ||
    exports.generals_particle_template_is_hollow(0) !== 1 ||
    exports.generals_particle_template_is_emit_above_ground_only(0) !== 1) {
  throw new Error("unexpected TestSmoke parse result");
}

if (templateString("name", 1) !== "TestTrail" ||
    templateString("particle_name", 1) !== "EXTrail.tga" ||
    templateString("slave_system", 1) !== "SlaveSmoke" ||
    templateString("attached_system", 1) !== "SparkChild" ||
    exports.generals_particle_template_field_count_at(1) !== 16 ||
    exports.generals_particle_template_priority(1) !== 10 ||
    exports.generals_particle_template_shader(1) !== 1 ||
    exports.generals_particle_template_type(1) !== 3 ||
    exports.generals_particle_template_is_one_shot(1) !== 1 ||
    exports.generals_particle_template_size_low_x100(1) !== 10 ||
    exports.generals_particle_template_size_high_x100(1) !== 20 ||
    exports.generals_particle_template_burst_delay_low_x100(1) !== 300 ||
    exports.generals_particle_template_velocity_type(1) !== 1 ||
    exports.generals_particle_template_volume_type(1) !== 5 ||
    exports.generals_particle_template_volume_radius_x100(1) !== 1000 ||
    exports.generals_particle_template_volume_length_x100(1) !== 2000) {
  throw new Error("unexpected TestTrail parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  templates: exports.generals_particle_template_count(),
  fields: exports.generals_particle_field_count(),
  first: templateString("name", 0),
}, null, 2));
