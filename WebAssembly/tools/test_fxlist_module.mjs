import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_fxlist.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function typeName(type) {
  return readString(
    exports.generals_fxlist_type_name_ptr(type),
    exports.generals_fxlist_type_name_size(type)
  );
}

function listName(index) {
  return readString(
    exports.generals_fxlist_list_name_ptr(index),
    exports.generals_fxlist_list_name_size(index)
  );
}

function nuggetString(prefix, index) {
  return readString(
    exports[`generals_fxlist_nugget_${prefix}_ptr`](index),
    exports[`generals_fxlist_nugget_${prefix}_size`](index)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_fxlist_input_ptr());
  const parsedCount = exports.generals_fxlist_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_fxlist_error_count() !== 0) {
    throw new Error(`FXList parse failed: parsed=${parsedCount}, errors=${exports.generals_fxlist_error_count()}`);
  }
  return parsedCount;
}

parse(`
FXList FX_TestImpact
  Sound
    Name = CarMount ; comment after value
  End
  ParticleSystem
    Name = ToxicShellExplosion
    Count = 3
    Radius = 12.5
  End
  ViewShake
    Type = STRONG
  End
End

FXList FX_TestBeam
  Tracer
    TracerName = GenericTracer
    BoneName = Muzzle
    Speed = 90
  End
  RayEffect
    Name = LaserRay
  End
  LightPulse
    Color = R:255 G:64 B:32
    Radius = 15
  End
  TerrainScorch
    Type = SCORCH_3
    Radius = 8
  End
  FXListAtBonePos
    FX = FX_Spark
    BoneName = HOUSECOLOR01
  End
End

FXList FX_Empty
End
`);

if (exports.generals_fxlist_list_count() !== 3 ||
    exports.generals_fxlist_nugget_count() !== 8 ||
    exports.generals_fxlist_field_count() !== 15 ||
    exports.generals_fxlist_type_count(0) !== 1 ||
    exports.generals_fxlist_type_count(1) !== 1 ||
    exports.generals_fxlist_type_count(2) !== 1 ||
    exports.generals_fxlist_type_count(3) !== 1 ||
    exports.generals_fxlist_type_count(4) !== 1 ||
    exports.generals_fxlist_type_count(5) !== 1 ||
    exports.generals_fxlist_type_count(6) !== 1 ||
    exports.generals_fxlist_type_count(7) !== 1) {
  throw new Error("unexpected aggregate FXList parse result");
}

if (typeName(0) !== "Sound" ||
    typeName(1) !== "RayEffect" ||
    typeName(2) !== "Tracer" ||
    typeName(3) !== "LightPulse" ||
    typeName(4) !== "ViewShake" ||
    typeName(5) !== "TerrainScorch" ||
    typeName(6) !== "ParticleSystem" ||
    typeName(7) !== "FXListAtBonePos") {
  throw new Error("unexpected FXList type names");
}

if (listName(0) !== "FX_TestImpact" ||
    exports.generals_fxlist_list_line(0) !== 2 ||
    exports.generals_fxlist_list_first_nugget(0) !== 0 ||
    exports.generals_fxlist_list_nugget_count(0) !== 3) {
  throw new Error("unexpected first FXList parse result");
}

if (exports.generals_fxlist_nugget_list_index(0) !== 0 ||
    exports.generals_fxlist_nugget_type(0) !== 0 ||
    exports.generals_fxlist_nugget_field_count(0) !== 1 ||
    nuggetString("target", 0) !== "CarMount") {
  throw new Error("unexpected Sound nugget parse result");
}

if (exports.generals_fxlist_nugget_type(1) !== 6 ||
    nuggetString("target", 1) !== "ToxicShellExplosion" ||
    exports.generals_fxlist_nugget_field_count(1) !== 3 ||
    exports.generals_fxlist_nugget_count_value(1) !== 3 ||
    exports.generals_fxlist_nugget_radius_x100(1) !== 1250) {
  throw new Error("unexpected ParticleSystem nugget parse result");
}

if (exports.generals_fxlist_nugget_type(2) !== 4 ||
    nuggetString("target", 2) !== "STRONG") {
  throw new Error("unexpected ViewShake nugget parse result");
}

if (listName(1) !== "FX_TestBeam" ||
    exports.generals_fxlist_list_nugget_count(1) !== 5 ||
    exports.generals_fxlist_nugget_type(3) !== 2 ||
    nuggetString("target", 3) !== "GenericTracer" ||
    nuggetString("secondary", 3) !== "Muzzle" ||
    exports.generals_fxlist_nugget_field_count(3) !== 3 ||
    exports.generals_fxlist_nugget_type(4) !== 1 ||
    nuggetString("target", 4) !== "LaserRay" ||
    exports.generals_fxlist_nugget_type(5) !== 3 ||
    exports.generals_fxlist_nugget_radius_x100(5) !== 1500 ||
    exports.generals_fxlist_nugget_type(6) !== 5 ||
    nuggetString("target", 6) !== "SCORCH_3" ||
    exports.generals_fxlist_nugget_radius_x100(6) !== 800 ||
    exports.generals_fxlist_nugget_type(7) !== 7 ||
    nuggetString("target", 7) !== "FX_Spark" ||
    nuggetString("secondary", 7) !== "HOUSECOLOR01") {
  throw new Error("unexpected mixed FXList nugget parse result");
}

if (listName(2) !== "FX_Empty" ||
    exports.generals_fxlist_list_nugget_count(2) !== 0) {
  throw new Error("unexpected empty FXList parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  lists: exports.generals_fxlist_list_count(),
  nuggets: exports.generals_fxlist_nugget_count(),
  fields: exports.generals_fxlist_field_count(),
  first: listName(0),
}, null, 2));
