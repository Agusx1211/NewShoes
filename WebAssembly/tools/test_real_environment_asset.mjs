import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const environmentWasmPath = resolve(wasmDir, "dist/generals_environment.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, environmentWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(environmentWasmPath),
  readFile(archivePath),
]);
const [bigModule, environmentModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(environmentWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const environmentExports = environmentModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const environmentMemory = new Uint8Array(environmentExports.memory.buffer);
const textDecoder = new TextDecoder();
const separator = new TextEncoder().encode("\n");

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readEnvironmentString(ptr, size) {
  return ptr ? textDecoder.decode(environmentMemory.slice(ptr, ptr + size)) : "";
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

const waterBytes = entryBytes("data/ini/water.ini");
const weatherBytes = entryBytes("data/ini/weather.ini");
const combinedBytes = new Uint8Array(waterBytes.length + separator.length + weatherBytes.length);
combinedBytes.set(waterBytes, 0);
combinedBytes.set(separator, waterBytes.length);
combinedBytes.set(weatherBytes, waterBytes.length + separator.length);

if (combinedBytes.length > environmentExports.generals_environment_input_capacity()) {
  throw new Error(`environment payload exceeds ${environmentExports.generals_environment_input_capacity()} byte wasm buffer`);
}

environmentMemory.set(combinedBytes, environmentExports.generals_environment_input_ptr());
const parsedCount = environmentExports.generals_environment_parse(combinedBytes.length);
if (parsedCount < 0 || environmentExports.generals_environment_error_count() !== 0) {
  throw new Error(`environment parse failed: parsed=${parsedCount}, errors=${environmentExports.generals_environment_error_count()}`);
}

function waterString(prefix, index) {
  return readEnvironmentString(
    environmentExports[`generals_environment_water_set_${prefix}_ptr`](index),
    environmentExports[`generals_environment_water_set_${prefix}_size`](index)
  );
}

function transparencyString(prefix, index) {
  return readEnvironmentString(
    environmentExports[`generals_environment_transparency_${prefix}_ptr`](index),
    environmentExports[`generals_environment_transparency_${prefix}_size`](index)
  );
}

function weatherString(prefix, index) {
  return readEnvironmentString(
    environmentExports[`generals_environment_weather_${prefix}_ptr`](index),
    environmentExports[`generals_environment_weather_${prefix}_size`](index)
  );
}

function waterSummary(index) {
  return {
    index,
    name: waterString("name", index),
    line: environmentExports.generals_environment_water_set_line(index),
    fields: environmentExports.generals_environment_water_set_field_count_at(index),
    skyTexture: waterString("sky_texture", index),
    waterTexture: waterString("water_texture", index),
    vertex00: [
      environmentExports.generals_environment_water_set_vertex_r(index, 0),
      environmentExports.generals_environment_water_set_vertex_g(index, 0),
      environmentExports.generals_environment_water_set_vertex_b(index, 0),
      environmentExports.generals_environment_water_set_vertex_a(index, 0),
    ],
    diffuse: [
      environmentExports.generals_environment_water_set_diffuse_r(index),
      environmentExports.generals_environment_water_set_diffuse_g(index),
      environmentExports.generals_environment_water_set_diffuse_b(index),
      environmentExports.generals_environment_water_set_diffuse_a(index),
    ],
    transparentDiffuse: [
      environmentExports.generals_environment_water_set_transparent_diffuse_r(index),
      environmentExports.generals_environment_water_set_transparent_diffuse_g(index),
      environmentExports.generals_environment_water_set_transparent_diffuse_b(index),
      environmentExports.generals_environment_water_set_transparent_diffuse_a(index),
    ],
    uScroll: environmentExports.generals_environment_water_set_u_scroll_per_ms_x10000(index),
    vScroll: environmentExports.generals_environment_water_set_v_scroll_per_ms_x10000(index),
    skyTexelsPerUnit: environmentExports.generals_environment_water_set_sky_texels_per_unit_x10000(index),
    repeat: environmentExports.generals_environment_water_set_repeat_count(index),
  };
}

const morning = waterSummary(0);
const afternoon = waterSummary(1);
const night = waterSummary(3);
const transparency = {
  line: environmentExports.generals_environment_transparency_line(0),
  fields: environmentExports.generals_environment_transparency_field_count_at(0),
  depth: environmentExports.generals_environment_transparency_depth_x10000(0),
  minOpacity: environmentExports.generals_environment_transparency_min_opacity_x10000(0),
  standingColor: [
    environmentExports.generals_environment_transparency_standing_color_r(0),
    environmentExports.generals_environment_transparency_standing_color_g(0),
    environmentExports.generals_environment_transparency_standing_color_b(0),
  ],
  standingTexture: transparencyString("standing_water_texture", 0),
  additiveBlending: environmentExports.generals_environment_transparency_additive_blending(0),
  radarColor: [
    environmentExports.generals_environment_transparency_radar_color_r(0),
    environmentExports.generals_environment_transparency_radar_color_g(0),
    environmentExports.generals_environment_transparency_radar_color_b(0),
  ],
  defaultSkyboxN: readEnvironmentString(
    environmentExports.generals_environment_transparency_skybox_texture_ptr(0, 0),
    environmentExports.generals_environment_transparency_skybox_texture_size(0, 0)
  ),
};
const weather = {
  line: environmentExports.generals_environment_weather_line(0),
  fields: environmentExports.generals_environment_weather_field_count_at(0),
  snowTexture: weatherString("snow_texture", 0),
  enabled: environmentExports.generals_environment_weather_snow_enabled(0),
  pointSprites: environmentExports.generals_environment_weather_use_point_sprites(0),
  frequencyScaleX: environmentExports.generals_environment_weather_snow_frequency_scale_x_x10000(0),
  frequencyScaleY: environmentExports.generals_environment_weather_snow_frequency_scale_y_x10000(0),
  amplitude: environmentExports.generals_environment_weather_snow_amplitude_x10000(0),
  velocity: environmentExports.generals_environment_weather_snow_velocity_x10000(0),
  pointSize: environmentExports.generals_environment_weather_snow_point_size_x10000(0),
  maxPointSize: environmentExports.generals_environment_weather_snow_max_point_size_x10000(0),
  minPointSize: environmentExports.generals_environment_weather_snow_min_point_size_x10000(0),
  quadSize: environmentExports.generals_environment_weather_snow_quad_size_x10000(0),
  boxDimensions: environmentExports.generals_environment_weather_snow_box_dimensions_x10000(0),
  boxDensity: environmentExports.generals_environment_weather_snow_box_density_x10000(0),
};
const summary = {
  archive: archivePath,
  waterBytes: waterBytes.length,
  weatherBytes: weatherBytes.length,
  combinedBytes: combinedBytes.length,
  parsedCount,
  waterSets: environmentExports.generals_environment_water_set_count(),
  transparencies: environmentExports.generals_environment_transparency_count(),
  weatherSettings: environmentExports.generals_environment_weather_count(),
  fieldCount: environmentExports.generals_environment_field_count(),
  lineCount: environmentExports.generals_environment_line_count(),
  morning,
  afternoon,
  night,
  transparency,
  weather,
};

if (summary.waterBytes !== 2814 ||
    summary.weatherBytes !== 1352 ||
    summary.combinedBytes !== 4167 ||
    summary.parsedCount !== 6 ||
    summary.waterSets !== 4 ||
    summary.transparencies !== 1 ||
    summary.weatherSettings !== 1 ||
    summary.fieldCount !== 67 ||
    summary.lineCount !== 102) {
  throw new Error(`unexpected environment aggregate parse: ${JSON.stringify(summary)}`);
}

if (morning.name !== "MORNING" ||
    morning.line !== 5 ||
    morning.fields !== 12 ||
    morning.skyTexture !== "TSCloudWis.tga" ||
    morning.waterTexture !== "TSWater.tga" ||
    morning.vertex00.join(",") !== "200,200,200,255" ||
    morning.diffuse.join(",") !== "175,175,175,255" ||
    morning.transparentDiffuse.join(",") !== "150,150,150,128" ||
    morning.uScroll !== 20 ||
    morning.vScroll !== 20 ||
    morning.skyTexelsPerUnit !== 8000 ||
    morning.repeat !== 32 ||
    afternoon.name !== "AFTERNOON" ||
    afternoon.diffuse.join(",") !== "185,185,185,255" ||
    night.name !== "NIGHT" ||
    night.line !== 50 ||
    night.skyTexture !== "TSStarFeld.tga" ||
    night.vertex00.join(",") !== "255,255,255,255" ||
    night.diffuse.join(",") !== "100,100,100,255" ||
    night.uScroll !== 0 ||
    night.skyTexelsPerUnit !== 16000) {
  throw new Error(`unexpected WaterSet parse: ${JSON.stringify(summary)}`);
}

if (transparency.line !== 66 ||
    transparency.fields !== 6 ||
    transparency.depth !== 30000 ||
    transparency.minOpacity !== 10000 ||
    transparency.standingColor.join(",") !== "255,255,255" ||
    transparency.standingTexture !== "TWWater01.tga" ||
    transparency.additiveBlending !== 0 ||
    transparency.radarColor.join(",") !== "140,140,255" ||
    transparency.defaultSkyboxN !== "TSMorningN.tga") {
  throw new Error(`unexpected WaterTransparency parse: ${JSON.stringify(transparency)}`);
}

if (weather.line !== 84 ||
    weather.fields !== 13 ||
    weather.snowTexture !== "ExSnowFlake.tga" ||
    weather.enabled !== 0 ||
    weather.pointSprites !== 1 ||
    weather.frequencyScaleX !== 533 ||
    weather.frequencyScaleY !== 275 ||
    weather.amplitude !== 50000 ||
    weather.velocity !== 40000 ||
    weather.pointSize !== 10000 ||
    weather.maxPointSize !== 640000 ||
    weather.minPointSize !== 0 ||
    weather.quadSize !== 5000 ||
    weather.boxDimensions !== 2000000 ||
    weather.boxDensity !== 10000) {
  throw new Error(`unexpected Weather parse: ${JSON.stringify(weather)}`);
}

console.log(JSON.stringify(summary, null, 2));
