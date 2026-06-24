import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const terrainWasmPath = resolve(wasmDir, "dist/generals_terrain.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, terrainWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(terrainWasmPath),
  readFile(archivePath),
]);
const [bigModule, terrainModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(terrainWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const terrainExports = terrainModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const terrainMemory = new Uint8Array(terrainExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readTerrainString(ptr, size) {
  return ptr ? textDecoder.decode(terrainMemory.slice(ptr, ptr + size)) : "";
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

const terrainBytes = entryBytes("data/ini/terrain.ini");
if (terrainBytes.length > terrainExports.generals_terrain_input_capacity()) {
  throw new Error(`Terrain payload exceeds ${terrainExports.generals_terrain_input_capacity()} byte wasm buffer`);
}

terrainMemory.set(terrainBytes, terrainExports.generals_terrain_input_ptr());
const parsedCount = terrainExports.generals_terrain_parse(terrainBytes.length);
if (parsedCount < 0 || terrainExports.generals_terrain_error_count() !== 0) {
  throw new Error(`Terrain parse failed: parsed=${parsedCount}, errors=${terrainExports.generals_terrain_error_count()}`);
}

function terrainString(prefix, index) {
  return readTerrainString(
    terrainExports[`generals_terrain_${prefix}_ptr`](index),
    terrainExports[`generals_terrain_${prefix}_size`](index)
  );
}

function className(index) {
  return readTerrainString(
    terrainExports.generals_terrain_class_name_for_ptr(index),
    terrainExports.generals_terrain_class_name_for_size(index)
  );
}

function summarize(index) {
  return {
    index,
    name: terrainString("name", index),
    texture: terrainString("texture", index),
    classIndex: terrainExports.generals_terrain_class(index),
    className: className(index),
    blendEdges: terrainExports.generals_terrain_blend_edges(index),
    restrictConstruction: terrainExports.generals_terrain_restrict_construction(index),
    line: terrainExports.generals_terrain_line(index),
    fields: terrainExports.generals_terrain_field_count_at(index),
  };
}

function find(name) {
  for (let index = 0; index < terrainExports.generals_terrain_count(); ++index) {
    if (terrainString("name", index) === name) {
      return summarize(index);
    }
  }

  throw new Error(`Terrain not found: ${name}`);
}

const count = terrainExports.generals_terrain_count();
let unknownClasses = 0;
const classHistogram = {};
for (let index = 0; index < count; ++index) {
  if (terrainExports.generals_terrain_class(index) < 0) {
    ++unknownClasses;
  }
  const cls = className(index) || "<unknown>";
  classHistogram[cls] = (classHistogram[cls] ?? 0) + 1;
}

const summary = {
  archive: archivePath,
  terrainBytes: terrainBytes.length,
  parsedCount,
  count,
  fieldCount: terrainExports.generals_terrain_field_count(),
  lineCount: terrainExports.generals_terrain_line_count(),
  classCount: terrainExports.generals_terrain_class_count(),
  unknownClasses,
  first: summarize(0),
  last: summarize(count - 1),
  asphalt: find("AsphaltType1"),
  classHistogram,
};

if (summary.terrainBytes !== 25758 ||
    summary.parsedCount !== 291 ||
    summary.count !== 291 ||
    summary.fieldCount !== 582 ||
    summary.lineCount !== 1557 ||
    summary.classCount !== 38 ||
    summary.unknownClasses !== 0) {
  throw new Error(`unexpected Terrain aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.first.name !== "GrassRockTransitionType1" ||
    summary.first.texture !== "TTGrasRock01a.tga" ||
    summary.first.classIndex !== 15 ||
    summary.first.className !== "TRANSITION" ||
    summary.first.blendEdges !== 0 ||
    summary.first.restrictConstruction !== 0 ||
    summary.first.fields !== 2) {
  throw new Error(`unexpected first Terrain: ${JSON.stringify(summary.first)}`);
}

if (summary.asphalt.classIndex !== 33 ||
    summary.asphalt.className !== "ASPHALT" ||
    summary.asphalt.texture !== "TXAsph01a.tga") {
  throw new Error(`unexpected AsphaltType1 Terrain: ${JSON.stringify(summary.asphalt)}`);
}

console.log(JSON.stringify(summary, null, 2));
