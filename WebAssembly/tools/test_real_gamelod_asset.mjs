import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const gameLodWasmPath = resolve(wasmDir, "dist/generals_gamelod.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, gameLodWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(gameLodWasmPath),
  readFile(archivePath),
]);
const [bigModule, gameLodModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(gameLodWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const gameLodExports = gameLodModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const gameLodMemory = new Uint8Array(gameLodExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readGameLodString(ptr, size) {
  return ptr ? textDecoder.decode(gameLodMemory.slice(ptr, ptr + size)) : "";
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

const gameLodBytes = entryBytes("data/ini/gamelod.ini");
if (gameLodBytes.length > gameLodExports.generals_gamelod_input_capacity()) {
  throw new Error(`GameLOD payload exceeds ${gameLodExports.generals_gamelod_input_capacity()} byte wasm buffer`);
}

gameLodMemory.set(gameLodBytes, gameLodExports.generals_gamelod_input_ptr());
const parsedCount = gameLodExports.generals_gamelod_parse(gameLodBytes.length);
if (parsedCount < 0 || gameLodExports.generals_gamelod_error_count() !== 0) {
  throw new Error(`GameLOD parse failed: parsed=${parsedCount}, errors=${gameLodExports.generals_gamelod_error_count()}`);
}

function staticName(index) {
  return readGameLodString(
    gameLodExports.generals_gamelod_static_name_ptr(index),
    gameLodExports.generals_gamelod_static_name_size(index)
  );
}

function dynamicName(index) {
  return readGameLodString(
    gameLodExports.generals_gamelod_dynamic_name_ptr(index),
    gameLodExports.generals_gamelod_dynamic_name_size(index)
  );
}

function dynamicString(prefix, index) {
  return readGameLodString(
    gameLodExports[`generals_gamelod_dynamic_${prefix}_ptr`](index),
    gameLodExports[`generals_gamelod_dynamic_${prefix}_size`](index)
  );
}

function staticSummary(index) {
  return {
    index,
    name: staticName(index),
    line: gameLodExports.generals_gamelod_static_line(index),
    fields: gameLodExports.generals_gamelod_static_field_count_at(index),
    minimumFps: gameLodExports.generals_gamelod_static_minimum_fps(index),
    minimumProcessorFps: gameLodExports.generals_gamelod_static_minimum_processor_fps(index),
    sampleCount2D: gameLodExports.generals_gamelod_static_sample_count_2d(index),
    sampleCount3D: gameLodExports.generals_gamelod_static_sample_count_3d(index),
    streamCount: gameLodExports.generals_gamelod_static_stream_count(index),
    maxParticleCount: gameLodExports.generals_gamelod_static_max_particle_count(index),
    useShadowVolumes: gameLodExports.generals_gamelod_static_use_shadow_volumes(index),
    useShadowDecals: gameLodExports.generals_gamelod_static_use_shadow_decals(index),
    useCloudMap: gameLodExports.generals_gamelod_static_use_cloud_map(index),
    useLightMap: gameLodExports.generals_gamelod_static_use_light_map(index),
    showSoftWaterEdge: gameLodExports.generals_gamelod_static_show_soft_water_edge(index),
    maxTankTrackEdges: gameLodExports.generals_gamelod_static_max_tank_track_edges(index),
    maxTankTrackOpaqueEdges: gameLodExports.generals_gamelod_static_max_tank_track_opaque_edges(index),
    maxTankTrackFadeDelay: gameLodExports.generals_gamelod_static_max_tank_track_fade_delay(index),
    useBuildupScaffolds: gameLodExports.generals_gamelod_static_use_buildup_scaffolds(index),
    useTreeSway: gameLodExports.generals_gamelod_static_use_tree_sway(index),
    useEmissiveNightMaterials: gameLodExports.generals_gamelod_static_use_emissive_night_materials(index),
    useHeatEffects: gameLodExports.generals_gamelod_static_use_heat_effects(index),
    textureReductionFactor: gameLodExports.generals_gamelod_static_texture_reduction_factor(index),
  };
}

function dynamicSummary(index) {
  return {
    index,
    name: dynamicName(index),
    line: gameLodExports.generals_gamelod_dynamic_line(index),
    fields: gameLodExports.generals_gamelod_dynamic_field_count_at(index),
    minimumFps: gameLodExports.generals_gamelod_dynamic_minimum_fps(index),
    particleSkipMask: gameLodExports.generals_gamelod_dynamic_particle_skip_mask(index),
    debrisSkipMask: gameLodExports.generals_gamelod_dynamic_debris_skip_mask(index),
    slowDeathScale: gameLodExports.generals_gamelod_dynamic_slow_death_scale_x100(index),
    minParticlePriority: dynamicString("min_particle_priority", index),
    minParticleSkipPriority: dynamicString("min_particle_skip_priority", index),
  };
}

function findStatic(name) {
  for (let index = 0; index < gameLodExports.generals_gamelod_static_count(); ++index) {
    const lod = staticSummary(index);
    if (lod.name === name) {
      return lod;
    }
  }

  throw new Error(`StaticGameLOD not found: ${name}`);
}

function findDynamic(name) {
  for (let index = 0; index < gameLodExports.generals_gamelod_dynamic_count(); ++index) {
    const lod = dynamicSummary(index);
    if (lod.name === name) {
      return lod;
    }
  }

  throw new Error(`DynamicGameLOD not found: ${name}`);
}

const summary = {
  archive: archivePath,
  gameLodBytes: gameLodBytes.length,
  parsedCount,
  staticCount: gameLodExports.generals_gamelod_static_count(),
  dynamicCount: gameLodExports.generals_gamelod_dynamic_count(),
  fieldCount: gameLodExports.generals_gamelod_field_count(),
  lineCount: gameLodExports.generals_gamelod_line_count(),
  low: findStatic("Low"),
  medium: findStatic("Medium"),
  high: findStatic("High"),
  veryHighDynamic: findDynamic("VeryHigh"),
  highDynamic: findDynamic("High"),
  mediumDynamic: findDynamic("Medium"),
  lowDynamic: findDynamic("Low"),
};

if (summary.gameLodBytes !== 7090 ||
    summary.parsedCount !== 7 ||
    summary.staticCount !== 3 ||
    summary.dynamicCount !== 4 ||
    summary.fieldCount !== 78 ||
    summary.lineCount !== 115) {
  throw new Error(`unexpected GameLOD aggregate parse: ${JSON.stringify(summary)}`);
}

if (summary.low.line !== 13 ||
    summary.low.fields !== 18 ||
    summary.low.minimumFps !== 10 ||
    summary.low.minimumProcessorFps !== 0 ||
    summary.low.maxParticleCount !== 500 ||
    summary.low.useShadowVolumes !== 0 ||
    summary.low.useShadowDecals !== 0 ||
    summary.low.useCloudMap !== 0 ||
    summary.low.useLightMap !== 0 ||
    summary.low.showSoftWaterEdge !== 0 ||
    summary.low.maxTankTrackEdges !== 30 ||
    summary.low.maxTankTrackOpaqueEdges !== 15 ||
    summary.low.maxTankTrackFadeDelay !== 5000 ||
    summary.low.useBuildupScaffolds !== 0 ||
    summary.low.useTreeSway !== 0 ||
    summary.low.useEmissiveNightMaterials !== 0 ||
    summary.low.textureReductionFactor !== 1) {
  throw new Error(`unexpected low StaticGameLOD parse: ${JSON.stringify(summary.low)}`);
}

if (summary.medium.line !== 34 ||
    summary.medium.minimumFps !== 15 ||
    summary.medium.minimumProcessorFps !== 20 ||
    summary.medium.maxParticleCount !== 1500 ||
    summary.medium.useShadowVolumes !== 0 ||
    summary.medium.useShadowDecals !== 1 ||
    summary.medium.useCloudMap !== 1 ||
    summary.medium.useLightMap !== 1 ||
    summary.medium.showSoftWaterEdge !== 1 ||
    summary.medium.maxTankTrackFadeDelay !== 30000 ||
    summary.medium.textureReductionFactor !== 0) {
  throw new Error(`unexpected medium StaticGameLOD parse: ${JSON.stringify(summary.medium)}`);
}

if (summary.high.line !== 55 ||
    summary.high.minimumFps !== 25 ||
    summary.high.minimumProcessorFps !== 29 ||
    summary.high.maxParticleCount !== 3000 ||
    summary.high.useShadowVolumes !== 1 ||
    summary.high.useShadowDecals !== 1 ||
    summary.high.maxTankTrackFadeDelay !== 60000 ||
    summary.high.textureReductionFactor !== 0) {
  throw new Error(`unexpected high StaticGameLOD parse: ${JSON.stringify(summary.high)}`);
}

if (summary.veryHighDynamic.line !== 76 ||
    summary.veryHighDynamic.fields !== 6 ||
    summary.veryHighDynamic.minimumFps !== 25 ||
    summary.veryHighDynamic.particleSkipMask !== 0 ||
    summary.veryHighDynamic.debrisSkipMask !== 0 ||
    summary.veryHighDynamic.slowDeathScale !== 100 ||
    summary.veryHighDynamic.minParticlePriority !== "WEAPON_EXPLOSION" ||
    summary.veryHighDynamic.minParticleSkipPriority !== "CRITICAL" ||
    summary.highDynamic.minimumFps !== 20 ||
    summary.highDynamic.minParticlePriority !== "UNIT_DAMAGE_FX" ||
    summary.mediumDynamic.minimumFps !== 10 ||
    summary.mediumDynamic.particleSkipMask !== 1 ||
    summary.mediumDynamic.minParticlePriority !== "WEAPON_TRAIL" ||
    summary.lowDynamic.minimumFps !== 0 ||
    summary.lowDynamic.particleSkipMask !== 3 ||
    summary.lowDynamic.minParticlePriority !== "AREA_EFFECT") {
  throw new Error(`unexpected DynamicGameLOD parse: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
