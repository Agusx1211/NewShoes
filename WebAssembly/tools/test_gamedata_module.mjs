import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_gamedata.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function scalarString(prefix) {
  return readString(
    exports[`generals_gamedata_${prefix}_ptr`](),
    exports[`generals_gamedata_${prefix}_size`]()
  );
}

function indexedString(kind, prefix, index) {
  return readString(
    exports[`generals_gamedata_${kind}_${prefix}_ptr`](index),
    exports[`generals_gamedata_${kind}_${prefix}_size`](index)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_gamedata_input_ptr());
  const parsedCount = exports.generals_gamedata_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_gamedata_error_count() !== 0) {
    throw new Error(`gamedata parse failed: parsed=${parsedCount}, errors=${exports.generals_gamedata_error_count()}`);
  }
  return parsedCount;
}

parse(`
GameData
  ShellMapName = Maps\\ShellMapMD\\ShellMapMD.map
  MapName = Assault.map
  MoveHintName = SCMoveHint
  UseTrees = Yes
  UseFPSLimit = Yes
  FramesPerSecondLimit = 30
  MaxShellScreens = 8
  UseCloudMap = Yes
  UseWaterPlane = Yes
  ShowObjectHealth = Yes
  Use3WayTerrainBlends = 1
  DrawSkyBox = Yes
  TerrainLOD = DISABLE
  TimeOfDay = AFTERNOON
  Weather = NORMAL
  WaterPositionZ = 7.0
  WaterExtentX = 2000.0
  WaterExtentY = 2000.0
  CameraPitch = 37.5
  CameraYaw = 0.0
  CameraHeight = 232.0
  MaxCameraHeight = 310.0
  MinCameraHeight = 120.0
  ScrollAmountCutoff = 50.0
  ParticleScale = 1.0
  AutoFireParticleSmallPrefix = FireS
  AutoFireParticleSmallSystem = FireFactionSmall
  AutoSmokeParticleLargeSystem = SmokeFactionLarge
  ValuePerSupplyBox = 75
  BuildSpeed = 1.0
  RefundPercent = 50.0%
  SellPercentage = 50%
  MaxParticleCount = 2500
  MaxFieldParticleCount = 30
  MaxLineBuildObjects = 50
  MaxTunnelCapacity = 10
  DefaultStartingCash = 10000
  ShroudColor = R:255 G:255 B:255
  ClearAlpha = 255
  FogAlpha = 127
  ShroudAlpha = 0
  NetworkKeepAliveDelay = 20
  NetworkDisconnectTime = 5000
  NetworkPlayerTimeoutTime = 60000
  KeyboardCameraRotateSpeed = 0.1
  SpecialPowerViewObject = SuperweaponPing
  AudioOn = Yes
  MusicOn = Yes
  SoundsOn = Yes
  SpeechOn = Yes
  VideoOn = Yes
  VertexWaterAvailableMaps1 = Maps\\nVidiaDemo\\nVidiaDemo.map
  VertexWaterAngle1 = 45
  VertexWaterXPosition1 = 2700.0
  VertexWaterYPosition1 = -750.0
  VertexWaterZPosition1 = 2.9
  VertexWaterXGridCells1 = 65
  VertexWaterYGridCells1 = 360
  VertexWaterGridSize1 = 10.0
  WeaponBonus = HORDE RATE_OF_FIRE 150%
  WeaponBonus = VETERAN DAMAGE 110%
  StandardPublicBone = FirePoint
  StandardPublicBone = Muzzle
End
`);

if (exports.generals_gamedata_block_count() !== 1 ||
    exports.generals_gamedata_field_count() !== 63 ||
    exports.generals_gamedata_weapon_bonus_count() !== 2 ||
    exports.generals_gamedata_standard_public_bone_count() !== 2 ||
    exports.generals_gamedata_vertex_water_count() !== 1) {
  throw new Error("unexpected aggregate GameData parse result");
}

if (scalarString("shell_map_name") !== "Maps\\ShellMapMD\\ShellMapMD.map" ||
    scalarString("map_name") !== "Assault.map" ||
    scalarString("move_hint_name") !== "SCMoveHint" ||
    scalarString("terrain_lod") !== "DISABLE" ||
    scalarString("time_of_day") !== "AFTERNOON" ||
    scalarString("weather") !== "NORMAL" ||
    scalarString("special_power_view_object") !== "SuperweaponPing" ||
    scalarString("auto_fire_particle_small_prefix") !== "FireS" ||
    scalarString("auto_fire_particle_small_system") !== "FireFactionSmall" ||
    scalarString("auto_smoke_particle_large_system") !== "SmokeFactionLarge") {
  throw new Error("unexpected GameData string parse result");
}

if (exports.generals_gamedata_use_trees() !== 1 ||
    exports.generals_gamedata_use_fps_limit() !== 1 ||
    exports.generals_gamedata_frames_per_second_limit() !== 30 ||
    exports.generals_gamedata_max_shell_screens() !== 8 ||
    exports.generals_gamedata_use_cloud_map() !== 1 ||
    exports.generals_gamedata_use_water_plane() !== 1 ||
    exports.generals_gamedata_show_object_health() !== 1 ||
    exports.generals_gamedata_use_three_way_terrain_blends() !== 1 ||
    exports.generals_gamedata_draw_sky_box() !== 1 ||
    exports.generals_gamedata_audio_on() !== 1 ||
    exports.generals_gamedata_music_on() !== 1 ||
    exports.generals_gamedata_sounds_on() !== 1 ||
    exports.generals_gamedata_speech_on() !== 1 ||
    exports.generals_gamedata_video_on() !== 1 ||
    exports.generals_gamedata_value_per_supply_box() !== 75 ||
    exports.generals_gamedata_max_particle_count() !== 2500 ||
    exports.generals_gamedata_max_field_particle_count() !== 30 ||
    exports.generals_gamedata_max_line_build_objects() !== 50 ||
    exports.generals_gamedata_max_tunnel_capacity() !== 10 ||
    exports.generals_gamedata_default_starting_cash() !== 10000 ||
    exports.generals_gamedata_clear_alpha() !== 255 ||
    exports.generals_gamedata_fog_alpha() !== 127 ||
    exports.generals_gamedata_shroud_alpha() !== 0 ||
    exports.generals_gamedata_shroud_color_r() !== 255 ||
    exports.generals_gamedata_shroud_color_g() !== 255 ||
    exports.generals_gamedata_shroud_color_b() !== 255 ||
    exports.generals_gamedata_network_keep_alive_delay() !== 20 ||
    exports.generals_gamedata_network_disconnect_time() !== 5000 ||
    exports.generals_gamedata_network_player_timeout_time() !== 60000) {
  throw new Error("unexpected GameData integer/bool parse result");
}

if (exports.generals_gamedata_water_position_z_x100() !== 700 ||
    exports.generals_gamedata_water_extent_x_x100() !== 200000 ||
    exports.generals_gamedata_water_extent_y_x100() !== 200000 ||
    exports.generals_gamedata_camera_pitch_x100() !== 3750 ||
    exports.generals_gamedata_camera_yaw_x100() !== 0 ||
    exports.generals_gamedata_camera_height_x100() !== 23200 ||
    exports.generals_gamedata_max_camera_height_x100() !== 31000 ||
    exports.generals_gamedata_min_camera_height_x100() !== 12000 ||
    exports.generals_gamedata_scroll_amount_cutoff_x100() !== 5000 ||
    exports.generals_gamedata_particle_scale_x100() !== 100 ||
    exports.generals_gamedata_build_speed_x100() !== 100 ||
    exports.generals_gamedata_refund_percent_x100() !== 5000 ||
    exports.generals_gamedata_sell_percentage_x100() !== 5000 ||
    exports.generals_gamedata_keyboard_camera_rotate_speed_x100() !== 10) {
  throw new Error("unexpected GameData real parse result");
}

if (indexedString("weapon_bonus", "bonus", 0) !== "HORDE" ||
    indexedString("weapon_bonus", "field", 0) !== "RATE_OF_FIRE" ||
    exports.generals_gamedata_weapon_bonus_percent_x100(0) !== 15000 ||
    indexedString("weapon_bonus", "bonus", 1) !== "VETERAN" ||
    indexedString("weapon_bonus", "field", 1) !== "DAMAGE" ||
    exports.generals_gamedata_weapon_bonus_percent_x100(1) !== 11000 ||
    indexedString("standard_public_bone", "name", 0) !== "FirePoint" ||
    indexedString("standard_public_bone", "name", 1) !== "Muzzle" ||
    indexedString("vertex_water", "map", 0) !== "Maps\\nVidiaDemo\\nVidiaDemo.map" ||
    exports.generals_gamedata_vertex_water_angle_x100(0) !== 4500 ||
    exports.generals_gamedata_vertex_water_x_position_x100(0) !== 270000 ||
    exports.generals_gamedata_vertex_water_y_position_x100(0) !== -75000 ||
    exports.generals_gamedata_vertex_water_z_position_x100(0) !== 290 ||
    exports.generals_gamedata_vertex_water_x_grid_cells(0) !== 65 ||
    exports.generals_gamedata_vertex_water_y_grid_cells(0) !== 360 ||
    exports.generals_gamedata_vertex_water_grid_size_x100(0) !== 1000) {
  throw new Error("unexpected GameData collection parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  fields: exports.generals_gamedata_field_count(),
  weaponBonuses: exports.generals_gamedata_weapon_bonus_count(),
  publicBones: exports.generals_gamedata_standard_public_bone_count(),
  shellMap: scalarString("shell_map_name"),
}, null, 2));
