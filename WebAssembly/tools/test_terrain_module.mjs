import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_terrain.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
;; A couple of terrain types in the real Terrain.ini block style.
Terrain GrassRockTransitionType1
  Texture = TTGrasRock01a.tga
  Class = TRANSITION
End

Terrain AsphaltType1
  Texture = TXAsph01a.tga
  Class = ASPHALT
End

Terrain BuildableConcrete
  Texture = TXConc01a.tga ; trailing comment
  Class = concrete
  BlendEdges = Yes
  RestrictConstruction = Yes
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_terrain_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_terrain_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_terrain_input_ptr());
const terrainCount = exports.generals_terrain_parse(bytes.length);
if (terrainCount < 0 || exports.generals_terrain_error_count() !== 0) {
  throw new Error(`Terrain parse failed: parsed=${terrainCount}, errors=${exports.generals_terrain_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function terrainString(prefix, index) {
  return readString(
    exports[`generals_terrain_${prefix}_ptr`](index),
    exports[`generals_terrain_${prefix}_size`](index)
  );
}

function className(index) {
  return readString(
    exports.generals_terrain_class_name_for_ptr(index),
    exports.generals_terrain_class_name_for_size(index)
  );
}

if (terrainCount !== 3 ||
    exports.generals_terrain_count() !== 3 ||
    exports.generals_terrain_field_count() !== 8 ||
    exports.generals_terrain_field_count_at(0) !== 2 ||
    exports.generals_terrain_field_count_at(1) !== 2 ||
    exports.generals_terrain_field_count_at(2) !== 4) {
  throw new Error("unexpected Terrain aggregate parse");
}

// Class index list must match terrainTypeNames[] ordering: TRANSITION=15,
// ASPHALT=33, CONCRETE=34. Case-insensitive ("concrete") must still resolve.
if (terrainString("name", 0) !== "GrassRockTransitionType1" ||
    terrainString("texture", 0) !== "TTGrasRock01a.tga" ||
    exports.generals_terrain_class(0) !== 15 ||
    className(0) !== "TRANSITION" ||
    exports.generals_terrain_blend_edges(0) !== 0 ||
    exports.generals_terrain_restrict_construction(0) !== 0) {
  throw new Error("unexpected first Terrain parse");
}

if (terrainString("name", 1) !== "AsphaltType1" ||
    exports.generals_terrain_class(1) !== 33 ||
    className(1) !== "ASPHALT") {
  throw new Error("unexpected second Terrain parse");
}

if (terrainString("name", 2) !== "BuildableConcrete" ||
    terrainString("texture", 2) !== "TXConc01a.tga" ||
    exports.generals_terrain_class(2) !== 34 ||
    className(2) !== "CONCRETE" ||
    exports.generals_terrain_blend_edges(2) !== 1 ||
    exports.generals_terrain_restrict_construction(2) !== 1) {
  throw new Error("unexpected third Terrain parse");
}

// The exported class-name table should agree with the index mapping above.
if (exports.generals_terrain_class_count() !== 38 ||
    readString(exports.generals_terrain_class_name_ptr(0), exports.generals_terrain_class_name_size(0)) !== "NONE" ||
    readString(exports.generals_terrain_class_name_ptr(15), exports.generals_terrain_class_name_size(15)) !== "TRANSITION") {
  throw new Error("unexpected Terrain class table");
}

console.log(JSON.stringify({
  module: wasmPath,
  terrains: exports.generals_terrain_count(),
  fields: exports.generals_terrain_field_count(),
  lines: exports.generals_terrain_line_count(),
  classCount: exports.generals_terrain_class_count(),
  first: terrainString("name", 0),
  firstClass: className(0),
}, null, 2));
