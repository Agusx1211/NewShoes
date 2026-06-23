import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_gamelod.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function staticName(index) {
  return readString(
    exports.generals_gamelod_static_name_ptr(index),
    exports.generals_gamelod_static_name_size(index)
  );
}

function dynamicName(index) {
  return readString(
    exports.generals_gamelod_dynamic_name_ptr(index),
    exports.generals_gamelod_dynamic_name_size(index)
  );
}

function dynamicString(prefix, index) {
  return readString(
    exports[`generals_gamelod_dynamic_${prefix}_ptr`](index),
    exports[`generals_gamelod_dynamic_${prefix}_size`](index)
  );
}

const source = `
StaticGameLOD = Low
  MinimumFPS = 10
  MinimumProcessorFps = 0
  SampleCount2D = 6
  SampleCount3D = 24
  StreamCount = 2
  MaxParticleCount = 500
  UseShadowVolumes = No
  UseShadowDecals = Yes
  UseCloudMap = No
  UseLightMap = Yes
  ShowSoftWaterEdge = No
  MaxTankTrackEdges = 30
  MaxTankTrackOpaqueEdges = 15
  MaxTankTrackFadeDelay = 5000
  UseBuildupScaffolds = No
  UseTreeSway = Yes
  UseEmissiveNightMaterials = No
  UseHeatEffects = Yes
  TextureReductionFactor = 1
End

DynamicGameLOD = VeryHigh
  MinimumFPS = 25
  ParticleSkipMask = 0
  DebrisSkipMask = 0
  SlowDeathScale = 1.25
  MinParticlePriority = WEAPON_EXPLOSION
  MinParticleSkipPriority = CRITICAL
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_gamelod_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_gamelod_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_gamelod_input_ptr());
const parsedCount = exports.generals_gamelod_parse(bytes.length);
if (parsedCount < 0 || exports.generals_gamelod_error_count() !== 0) {
  throw new Error(`GameLOD parse failed: parsed=${parsedCount}, errors=${exports.generals_gamelod_error_count()}`);
}

if (parsedCount !== 2 ||
    exports.generals_gamelod_static_count() !== 1 ||
    exports.generals_gamelod_dynamic_count() !== 1 ||
    exports.generals_gamelod_field_count() !== 25 ||
    exports.generals_gamelod_static_field_count_at(0) !== 19 ||
    exports.generals_gamelod_dynamic_field_count_at(0) !== 6) {
  throw new Error("unexpected GameLOD aggregate parse");
}

if (staticName(0) !== "Low" ||
    exports.generals_gamelod_static_minimum_fps(0) !== 10 ||
    exports.generals_gamelod_static_sample_count_3d(0) !== 24 ||
    exports.generals_gamelod_static_max_particle_count(0) !== 500 ||
    exports.generals_gamelod_static_use_shadow_volumes(0) !== 0 ||
    exports.generals_gamelod_static_use_shadow_decals(0) !== 1 ||
    exports.generals_gamelod_static_use_light_map(0) !== 1 ||
    exports.generals_gamelod_static_use_tree_sway(0) !== 1 ||
    exports.generals_gamelod_static_use_heat_effects(0) !== 1 ||
    exports.generals_gamelod_static_texture_reduction_factor(0) !== 1) {
  throw new Error("unexpected static GameLOD values");
}

if (dynamicName(0) !== "VeryHigh" ||
    exports.generals_gamelod_dynamic_minimum_fps(0) !== 25 ||
    exports.generals_gamelod_dynamic_particle_skip_mask(0) !== 0 ||
    exports.generals_gamelod_dynamic_debris_skip_mask(0) !== 0 ||
    exports.generals_gamelod_dynamic_slow_death_scale_x100(0) !== 125 ||
    dynamicString("min_particle_priority", 0) !== "WEAPON_EXPLOSION" ||
    dynamicString("min_particle_skip_priority", 0) !== "CRITICAL") {
  throw new Error("unexpected dynamic GameLOD values");
}

console.log(JSON.stringify({
  module: wasmPath,
  static: exports.generals_gamelod_static_count(),
  dynamic: exports.generals_gamelod_dynamic_count(),
  firstStatic: staticName(0),
  firstDynamic: dynamicName(0),
}, null, 2));
