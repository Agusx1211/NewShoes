import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const roadsWasmPath = resolve(wasmDir, "dist/generals_roads.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, roadsWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(roadsWasmPath),
  readFile(archivePath),
]);
const [bigModule, roadsModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(roadsWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const roadsExports = roadsModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const roadsMemory = new Uint8Array(roadsExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readRoadsString(ptr, size) {
  return ptr ? textDecoder.decode(roadsMemory.slice(ptr, ptr + size)) : "";
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

const roadsBytes = entryBytes("data/ini/roads.ini");
if (roadsBytes.length > roadsExports.generals_roads_input_capacity()) {
  throw new Error(`Roads payload exceeds ${roadsExports.generals_roads_input_capacity()} byte wasm buffer`);
}

roadsMemory.set(roadsBytes, roadsExports.generals_roads_input_ptr());
const parsedCount = roadsExports.generals_roads_parse(roadsBytes.length);
if (parsedCount < 0 || roadsExports.generals_roads_error_count() !== 0) {
  throw new Error(`Roads parse failed: parsed=${parsedCount}, errors=${roadsExports.generals_roads_error_count()}`);
}

function roadString(prefix, index) {
  return readRoadsString(
    roadsExports[`generals_roads_${prefix}_ptr`](index),
    roadsExports[`generals_roads_${prefix}_size`](index)
  );
}

function summarize(index) {
  return {
    index,
    name: roadString("name", index),
    isBridge: roadsExports.generals_roads_is_bridge(index),
    texture: roadString("texture", index),
    roadWidthX100: roadsExports.generals_roads_road_width_x100(index),
    roadWidthInTextureX100: roadsExports.generals_roads_road_width_in_texture_x100(index),
    bridgeScaleX100: roadsExports.generals_roads_bridge_scale_x100(index),
    radarColor: [
      roadsExports.generals_roads_radar_color_r(index),
      roadsExports.generals_roads_radar_color_g(index),
      roadsExports.generals_roads_radar_color_b(index),
    ],
    bridgeModelName: roadString("bridge_model_name", index),
    scaffoldObjectName: roadString("scaffold_object_name", index),
    towerFromLeft: roadString("tower_from_left", index),
    line: roadsExports.generals_roads_line(index),
    fields: roadsExports.generals_roads_field_count_at(index),
  };
}

function find(name) {
  for (let index = 0; index < roadsExports.generals_roads_count(); ++index) {
    if (roadString("name", index) === name) {
      return summarize(index);
    }
  }

  throw new Error(`Road/Bridge not found: ${name}`);
}

const summary = {
  archive: archivePath,
  roadsBytes: roadsBytes.length,
  parsedCount,
  count: roadsExports.generals_roads_count(),
  roadCount: roadsExports.generals_roads_road_count(),
  bridgeCount: roadsExports.generals_roads_bridge_count(),
  fieldCount: roadsExports.generals_roads_field_count(),
  lineCount: roadsExports.generals_roads_line_count(),
  first: summarize(0),
  doublewide: find("IronSectionalDoublewide"),
};

if (summary.roadsBytes !== 30946 ||
    summary.parsedCount !== 90 ||
    summary.count !== 90 ||
    summary.roadCount !== 63 ||
    summary.bridgeCount !== 27 ||
    summary.fieldCount !== 595 ||
    summary.lineCount !== 879) {
  throw new Error(`unexpected Roads aggregate parse: ${JSON.stringify(summary, null, 2)}`);
}

if (summary.first.name !== "TwoLane" ||
    summary.first.isBridge !== 0 ||
    summary.first.texture !== "TRTwoLane.tga" ||
    summary.first.roadWidthX100 !== 3500 ||
    summary.first.roadWidthInTextureX100 !== 90 ||
    summary.first.fields !== 3) {
  throw new Error(`unexpected first road: ${JSON.stringify(summary.first)}`);
}

if (summary.doublewide.isBridge !== 1 ||
    summary.doublewide.bridgeScaleX100 !== 85 ||
    summary.doublewide.radarColor.join("/") !== "192/192/192" ||
    summary.doublewide.bridgeModelName !== "TBDoubWide" ||
    summary.doublewide.scaffoldObjectName !== "BridgeScaffold01" ||
    summary.doublewide.towerFromLeft !== "BridgeTowerConcreteLeft01" ||
    summary.doublewide.fields !== 16) {
  throw new Error(`unexpected IronSectionalDoublewide bridge: ${JSON.stringify(summary.doublewide)}`);
}

console.log(JSON.stringify(summary, null, 2));
