import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_environment.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
WaterSet MORNING
  SkyTexture = TSCloudWis.tga
  WaterTexture = TSWater.tga
  Vertex00Color = R:1 G:2 B:3
  Vertex10Color = R:4 G:5 B:6 A:7
  Vertex01Color = R:8 G:9 B:10
  Vertex11Color = R:11 G:12 B:13 A:14
  DiffuseColor = R:17 G:18 B:19 A:20
  TransparentDiffuseColor = R:21 G:22 B:23 A:24
  UScrollPerMS = 0.002
  VScrollPerMS = 0.125
  SkyTexelsPerUnit = 1.6
  WaterRepeatCount = 32
End

WaterTransparency
  TransparentWaterMinOpacity = 0.25
  TransparentWaterDepth = 5.5
  StandingWaterColor = R:10 G:20 B:30
  StandingWaterTexture = TWWater01.tga
  AdditiveBlending = yes
  RadarWaterColor = R:140 G:141 B:142
  SkyboxTextureN = North.tga
End

Weather
  SnowEnabled = yes
  SnowTexture = ExSnowFlake.tga
  SnowBoxDimensions = 200
  SnowBoxDensity = 1
  SnowFrequencyScaleX = 0.0533
  SnowFrequencyScaleY = 0.0275
  SnowAmplitude = 5.0
  SnowVelocity = 4.0
  SnowPointSize = 1.25
  SnowMaxPointSize = 64.0
  SnowMinPointSize = 0.5
  SnowPointSprites = no
  SnowQuadSize = 0.5
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_environment_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_environment_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_environment_input_ptr());
const blockCount = exports.generals_environment_parse(bytes.length);
if (blockCount < 0 || exports.generals_environment_error_count() !== 0) {
  throw new Error(`environment parse failed: parsed=${blockCount}, errors=${exports.generals_environment_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function waterString(prefix, index) {
  return readString(
    exports[`generals_environment_water_set_${prefix}_ptr`](index),
    exports[`generals_environment_water_set_${prefix}_size`](index)
  );
}

function transparencyString(prefix, index) {
  return readString(
    exports[`generals_environment_transparency_${prefix}_ptr`](index),
    exports[`generals_environment_transparency_${prefix}_size`](index)
  );
}

function weatherString(prefix, index) {
  return readString(
    exports[`generals_environment_weather_${prefix}_ptr`](index),
    exports[`generals_environment_weather_${prefix}_size`](index)
  );
}

if (blockCount !== 3 ||
    exports.generals_environment_water_set_count() !== 1 ||
    exports.generals_environment_transparency_count() !== 1 ||
    exports.generals_environment_weather_count() !== 1 ||
    exports.generals_environment_field_count() !== 32 ||
    exports.generals_environment_water_set_field_count_at(0) !== 12 ||
    exports.generals_environment_transparency_field_count_at(0) !== 7 ||
    exports.generals_environment_weather_field_count_at(0) !== 13) {
  throw new Error("unexpected environment aggregate parse");
}

if (waterString("name", 0) !== "MORNING" ||
    waterString("sky_texture", 0) !== "TSCloudWis.tga" ||
    waterString("water_texture", 0) !== "TSWater.tga" ||
    exports.generals_environment_water_set_vertex_r(0, 0) !== 1 ||
    exports.generals_environment_water_set_vertex_g(0, 0) !== 2 ||
    exports.generals_environment_water_set_vertex_b(0, 0) !== 3 ||
    exports.generals_environment_water_set_vertex_a(0, 0) !== 255 ||
    exports.generals_environment_water_set_vertex_a(0, 1) !== 7 ||
    exports.generals_environment_water_set_diffuse_r(0) !== 17 ||
    exports.generals_environment_water_set_diffuse_a(0) !== 20 ||
    exports.generals_environment_water_set_transparent_diffuse_b(0) !== 23 ||
    exports.generals_environment_water_set_transparent_diffuse_a(0) !== 24 ||
    exports.generals_environment_water_set_u_scroll_per_ms_x10000(0) !== 20 ||
    exports.generals_environment_water_set_v_scroll_per_ms_x10000(0) !== 1250 ||
    exports.generals_environment_water_set_sky_texels_per_unit_x10000(0) !== 16000 ||
    exports.generals_environment_water_set_repeat_count(0) !== 32) {
  throw new Error("unexpected WaterSet parsed values");
}

if (exports.generals_environment_transparency_depth_x10000(0) !== 55000 ||
    exports.generals_environment_transparency_min_opacity_x10000(0) !== 2500 ||
    exports.generals_environment_transparency_standing_color_r(0) !== 10 ||
    exports.generals_environment_transparency_standing_color_g(0) !== 20 ||
    exports.generals_environment_transparency_standing_color_b(0) !== 30 ||
    transparencyString("standing_water_texture", 0) !== "TWWater01.tga" ||
    readString(
      exports.generals_environment_transparency_skybox_texture_ptr(0, 0),
      exports.generals_environment_transparency_skybox_texture_size(0, 0)
    ) !== "North.tga" ||
    readString(
      exports.generals_environment_transparency_skybox_texture_ptr(0, 1),
      exports.generals_environment_transparency_skybox_texture_size(0, 1)
    ) !== "TSMorningE.tga" ||
    exports.generals_environment_transparency_additive_blending(0) !== 1 ||
    exports.generals_environment_transparency_radar_color_b(0) !== 142) {
  throw new Error("unexpected WaterTransparency parsed values");
}

if (weatherString("snow_texture", 0) !== "ExSnowFlake.tga" ||
    exports.generals_environment_weather_snow_enabled(0) !== 1 ||
    exports.generals_environment_weather_use_point_sprites(0) !== 0 ||
    exports.generals_environment_weather_snow_frequency_scale_x_x10000(0) !== 533 ||
    exports.generals_environment_weather_snow_frequency_scale_y_x10000(0) !== 275 ||
    exports.generals_environment_weather_snow_amplitude_x10000(0) !== 50000 ||
    exports.generals_environment_weather_snow_velocity_x10000(0) !== 40000 ||
    exports.generals_environment_weather_snow_point_size_x10000(0) !== 12500 ||
    exports.generals_environment_weather_snow_max_point_size_x10000(0) !== 640000 ||
    exports.generals_environment_weather_snow_min_point_size_x10000(0) !== 5000 ||
    exports.generals_environment_weather_snow_quad_size_x10000(0) !== 5000 ||
    exports.generals_environment_weather_snow_box_dimensions_x10000(0) !== 2000000 ||
    exports.generals_environment_weather_snow_box_density_x10000(0) !== 10000) {
  throw new Error("unexpected Weather parsed values");
}

console.log(JSON.stringify({
  module: wasmPath,
  waterSets: exports.generals_environment_water_set_count(),
  transparency: exports.generals_environment_transparency_count(),
  weather: exports.generals_environment_weather_count(),
  fields: exports.generals_environment_field_count(),
  first: waterString("name", 0),
}, null, 2));
