import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_roads.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
;; Roads.INI mixes Road and Bridge blocks onto one terrain road type.
Road TwoLane
  Texture = TRTwoLane.tga
  RoadWidth = 35.0
  RoadWidthInTexture = 0.9
End

Bridge IronSectionalDoublewide
  BridgeScale = 0.85
  RadarColor = R:192 G:192 B:192
  BridgeModelName = TBDoubWide
  Texture = TBDoubWide.tga
  BridgeModelNameDamaged = TBDoubWide_d
  TextureDamaged = TBDoubWide_d.tga
  BridgeModelNameBroken = TBDoubWide_r
  TextureBroken = TBDoubWide_r.tga
  TowerObjectNameFromLeft = BridgeTowerConcreteLeft01
  ScaffoldObjectName = BridgeScaffold01
  NumFXPerType = 3
  DamagedToSound = BridgeDamaged
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_roads_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_roads_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_roads_input_ptr());
const count = exports.generals_roads_parse(bytes.length);
if (count < 0 || exports.generals_roads_error_count() !== 0) {
  throw new Error(`Roads parse failed: parsed=${count}, errors=${exports.generals_roads_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function roadString(prefix, index) {
  return readString(
    exports[`generals_roads_${prefix}_ptr`](index),
    exports[`generals_roads_${prefix}_size`](index)
  );
}

if (count !== 2 ||
    exports.generals_roads_count() !== 2 ||
    exports.generals_roads_road_count() !== 1 ||
    exports.generals_roads_bridge_count() !== 1 ||
    exports.generals_roads_field_count() !== 15 ||
    exports.generals_roads_field_count_at(0) !== 3 ||
    exports.generals_roads_field_count_at(1) !== 12) {
  throw new Error("unexpected Roads aggregate parse");
}

if (roadString("name", 0) !== "TwoLane" ||
    exports.generals_roads_is_bridge(0) !== 0 ||
    roadString("texture", 0) !== "TRTwoLane.tga" ||
    exports.generals_roads_road_width_x100(0) !== 3500 ||
    exports.generals_roads_road_width_in_texture_x100(0) !== 90) {
  throw new Error("unexpected road parse");
}

if (roadString("name", 1) !== "IronSectionalDoublewide" ||
    exports.generals_roads_is_bridge(1) !== 1 ||
    exports.generals_roads_bridge_scale_x100(1) !== 85 ||
    exports.generals_roads_radar_color_r(1) !== 192 ||
    exports.generals_roads_radar_color_g(1) !== 192 ||
    exports.generals_roads_radar_color_b(1) !== 192 ||
    roadString("bridge_model_name", 1) !== "TBDoubWide" ||
    roadString("texture", 1) !== "TBDoubWide.tga" ||
    roadString("bridge_model_name_damaged", 1) !== "TBDoubWide_d" ||
    roadString("bridge_model_name_broken", 1) !== "TBDoubWide_r" ||
    roadString("tower_from_left", 1) !== "BridgeTowerConcreteLeft01" ||
    roadString("scaffold_object_name", 1) !== "BridgeScaffold01" ||
    roadString("damaged_to_sound", 1) !== "BridgeDamaged" ||
    exports.generals_roads_num_fx_per_type(1) !== 3) {
  throw new Error("unexpected bridge parse");
}

console.log(JSON.stringify({
  module: wasmPath,
  count: exports.generals_roads_count(),
  roads: exports.generals_roads_road_count(),
  bridges: exports.generals_roads_bridge_count(),
  fields: exports.generals_roads_field_count(),
  bridgeModel: roadString("bridge_model_name", 1),
}, null, 2));
