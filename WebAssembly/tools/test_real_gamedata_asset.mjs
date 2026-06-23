import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const gameDataWasmPath = resolve(wasmDir, "dist/generals_gamedata.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, gameDataWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(gameDataWasmPath),
  readFile(archivePath),
]);
const [bigModule, gameDataModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(gameDataWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const gameDataExports = gameDataModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const gameDataMemory = new Uint8Array(gameDataExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readGameDataString(ptr, size) {
  return ptr ? textDecoder.decode(gameDataMemory.slice(ptr, ptr + size)) : "";
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

function parseGameDataPayload(bytes) {
  if (bytes.length > gameDataExports.generals_gamedata_input_capacity()) {
    throw new Error(`GameData payload exceeds ${gameDataExports.generals_gamedata_input_capacity()} byte wasm buffer`);
  }

  gameDataMemory.set(bytes, gameDataExports.generals_gamedata_input_ptr());
  const parsedCount = gameDataExports.generals_gamedata_parse(bytes.length);
  if (parsedCount < 0 || gameDataExports.generals_gamedata_error_count() !== 0) {
    throw new Error(`GameData parse failed: parsed=${parsedCount}, errors=${gameDataExports.generals_gamedata_error_count()}`);
  }

  return parsedCount;
}

function scalarString(prefix) {
  return readGameDataString(
    gameDataExports[`generals_gamedata_${prefix}_ptr`](),
    gameDataExports[`generals_gamedata_${prefix}_size`]()
  );
}

function indexedString(kind, prefix, index) {
  return readGameDataString(
    gameDataExports[`generals_gamedata_${kind}_${prefix}_ptr`](index),
    gameDataExports[`generals_gamedata_${kind}_${prefix}_size`](index)
  );
}

const gameDataBytes = entryBytes("data/ini/gamedata.ini");
parseGameDataPayload(gameDataBytes);

const summary = {
  archive: archivePath,
  gameDataBytes: gameDataBytes.length,
  blockCount: gameDataExports.generals_gamedata_block_count(),
  fieldCount: gameDataExports.generals_gamedata_field_count(),
  weaponBonusCount: gameDataExports.generals_gamedata_weapon_bonus_count(),
  publicBoneCount: gameDataExports.generals_gamedata_standard_public_bone_count(),
  vertexWaterCount: gameDataExports.generals_gamedata_vertex_water_count(),
  shellMap: scalarString("shell_map_name"),
  mapName: scalarString("map_name"),
  moveHint: scalarString("move_hint_name"),
  terrainLOD: scalarString("terrain_lod"),
  timeOfDay: scalarString("time_of_day"),
  weather: scalarString("weather"),
  specialPowerViewObject: scalarString("special_power_view_object"),
  autoFireSmall: {
    prefix: scalarString("auto_fire_particle_small_prefix"),
    system: scalarString("auto_fire_particle_small_system"),
  },
  firstWeaponBonus: {
    bonus: indexedString("weapon_bonus", "bonus", 0),
    field: indexedString("weapon_bonus", "field", 0),
    percent: gameDataExports.generals_gamedata_weapon_bonus_percent_x100(0),
  },
  lastWeaponBonus: {
    bonus: indexedString("weapon_bonus", "bonus", gameDataExports.generals_gamedata_weapon_bonus_count() - 1),
    field: indexedString("weapon_bonus", "field", gameDataExports.generals_gamedata_weapon_bonus_count() - 1),
    percent: gameDataExports.generals_gamedata_weapon_bonus_percent_x100(gameDataExports.generals_gamedata_weapon_bonus_count() - 1),
  },
  firstPublicBone: indexedString("standard_public_bone", "name", 0),
  lastPublicBone: indexedString("standard_public_bone", "name", gameDataExports.generals_gamedata_standard_public_bone_count() - 1),
  firstVertexWater: {
    map: indexedString("vertex_water", "map", 0),
    angle: gameDataExports.generals_gamedata_vertex_water_angle_x100(0),
    xPosition: gameDataExports.generals_gamedata_vertex_water_x_position_x100(0),
    yPosition: gameDataExports.generals_gamedata_vertex_water_y_position_x100(0),
    zPosition: gameDataExports.generals_gamedata_vertex_water_z_position_x100(0),
    xGridCells: gameDataExports.generals_gamedata_vertex_water_x_grid_cells(0),
    yGridCells: gameDataExports.generals_gamedata_vertex_water_y_grid_cells(0),
    gridSize: gameDataExports.generals_gamedata_vertex_water_grid_size_x100(0),
  },
  values: {
    useTrees: gameDataExports.generals_gamedata_use_trees(),
    useFpsLimit: gameDataExports.generals_gamedata_use_fps_limit(),
    fpsLimit: gameDataExports.generals_gamedata_frames_per_second_limit(),
    maxShellScreens: gameDataExports.generals_gamedata_max_shell_screens(),
    useCloudMap: gameDataExports.generals_gamedata_use_cloud_map(),
    useWaterPlane: gameDataExports.generals_gamedata_use_water_plane(),
    showObjectHealth: gameDataExports.generals_gamedata_show_object_health(),
    waterPositionZ: gameDataExports.generals_gamedata_water_position_z_x100(),
    waterExtentX: gameDataExports.generals_gamedata_water_extent_x_x100(),
    cameraPitch: gameDataExports.generals_gamedata_camera_pitch_x100(),
    cameraHeight: gameDataExports.generals_gamedata_camera_height_x100(),
    maxCameraHeight: gameDataExports.generals_gamedata_max_camera_height_x100(),
    minCameraHeight: gameDataExports.generals_gamedata_min_camera_height_x100(),
    particleScale: gameDataExports.generals_gamedata_particle_scale_x100(),
    valuePerSupplyBox: gameDataExports.generals_gamedata_value_per_supply_box(),
    buildSpeed: gameDataExports.generals_gamedata_build_speed_x100(),
    refundPercent: gameDataExports.generals_gamedata_refund_percent_x100(),
    sellPercentage: gameDataExports.generals_gamedata_sell_percentage_x100(),
    maxParticleCount: gameDataExports.generals_gamedata_max_particle_count(),
    maxFieldParticleCount: gameDataExports.generals_gamedata_max_field_particle_count(),
    maxLineBuildObjects: gameDataExports.generals_gamedata_max_line_build_objects(),
    maxTunnelCapacity: gameDataExports.generals_gamedata_max_tunnel_capacity(),
    defaultStartingCash: gameDataExports.generals_gamedata_default_starting_cash(),
    shroudColor: [
      gameDataExports.generals_gamedata_shroud_color_r(),
      gameDataExports.generals_gamedata_shroud_color_g(),
      gameDataExports.generals_gamedata_shroud_color_b(),
    ],
    clearAlpha: gameDataExports.generals_gamedata_clear_alpha(),
    fogAlpha: gameDataExports.generals_gamedata_fog_alpha(),
    shroudAlpha: gameDataExports.generals_gamedata_shroud_alpha(),
    networkKeepAliveDelay: gameDataExports.generals_gamedata_network_keep_alive_delay(),
    networkDisconnectTime: gameDataExports.generals_gamedata_network_disconnect_time(),
    networkPlayerTimeoutTime: gameDataExports.generals_gamedata_network_player_timeout_time(),
    keyboardCameraRotateSpeed: gameDataExports.generals_gamedata_keyboard_camera_rotate_speed_x100(),
  },
};

if (summary.gameDataBytes !== 21181 ||
    summary.blockCount !== 1 ||
    summary.fieldCount !== 323 ||
    summary.weaponBonusCount !== 23 ||
    summary.publicBoneCount !== 30 ||
    summary.vertexWaterCount !== 4) {
  throw new Error(`unexpected GameData aggregate parse: ${JSON.stringify(summary)}`);
}

if (summary.shellMap !== "Maps\\ShellMapMD\\ShellMapMD.map" ||
    summary.mapName !== "Assault.map" ||
    summary.moveHint !== "SCMoveHint" ||
    summary.terrainLOD !== "DISABLE" ||
    summary.timeOfDay !== "AFTERNOON" ||
    summary.weather !== "NORMAL" ||
    summary.specialPowerViewObject !== "SuperweaponPing" ||
    summary.autoFireSmall.prefix !== "FireS" ||
    summary.autoFireSmall.system !== "FireFactionSmall") {
  throw new Error(`unexpected GameData string parse: ${JSON.stringify(summary)}`);
}

if (summary.firstWeaponBonus.bonus !== "HORDE" ||
    summary.firstWeaponBonus.field !== "RATE_OF_FIRE" ||
    summary.firstWeaponBonus.percent !== 15000 ||
    summary.lastWeaponBonus.bonus !== "SOLO_AI_HARD" ||
    summary.lastWeaponBonus.field !== "RATE_OF_FIRE" ||
    summary.lastWeaponBonus.percent !== 12000 ||
    summary.firstPublicBone !== "FirePoint" ||
    summary.lastPublicBone !== "Aflame" ||
    summary.firstVertexWater.map !== "Maps\\nVidiaDemo\\nVidiaDemo.map" ||
    summary.firstVertexWater.angle !== 4500 ||
    summary.firstVertexWater.xPosition !== 270000 ||
    summary.firstVertexWater.yPosition !== -75000 ||
    summary.firstVertexWater.zPosition !== 290 ||
    summary.firstVertexWater.xGridCells !== 65 ||
    summary.firstVertexWater.yGridCells !== 360 ||
    summary.firstVertexWater.gridSize !== 1000) {
  throw new Error(`unexpected GameData collection parse: ${JSON.stringify(summary)}`);
}

if (summary.values.useTrees !== 1 ||
    summary.values.useFpsLimit !== 1 ||
    summary.values.fpsLimit !== 30 ||
    summary.values.maxShellScreens !== 8 ||
    summary.values.useCloudMap !== 1 ||
    summary.values.useWaterPlane !== 1 ||
    summary.values.showObjectHealth !== 1 ||
    summary.values.waterPositionZ !== 700 ||
    summary.values.waterExtentX !== 200000 ||
    summary.values.cameraPitch !== 3750 ||
    summary.values.cameraHeight !== 23200 ||
    summary.values.maxCameraHeight !== 31000 ||
    summary.values.minCameraHeight !== 12000 ||
    summary.values.particleScale !== 100 ||
    summary.values.valuePerSupplyBox !== 75 ||
    summary.values.buildSpeed !== 100 ||
    summary.values.refundPercent !== 5000 ||
    summary.values.sellPercentage !== 5000 ||
    summary.values.maxParticleCount !== 2500 ||
    summary.values.maxFieldParticleCount !== 30 ||
    summary.values.maxLineBuildObjects !== 50 ||
    summary.values.maxTunnelCapacity !== 10 ||
    summary.values.defaultStartingCash !== 10000 ||
    summary.values.shroudColor.join(",") !== "255,255,255" ||
    summary.values.clearAlpha !== 255 ||
    summary.values.fogAlpha !== 127 ||
    summary.values.shroudAlpha !== 0 ||
    summary.values.networkKeepAliveDelay !== 20 ||
    summary.values.networkDisconnectTime !== 5000 ||
    summary.values.networkPlayerTimeoutTime !== 60000 ||
    summary.values.keyboardCameraRotateSpeed !== 10) {
  throw new Error(`unexpected GameData scalar parse: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
