import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_ocl.wasm");
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
    exports.generals_ocl_type_name_ptr(type),
    exports.generals_ocl_type_name_size(type)
  );
}

function listName(index) {
  return readString(
    exports.generals_ocl_list_name_ptr(index),
    exports.generals_ocl_list_name_size(index)
  );
}

function nuggetString(prefix, index) {
  return readString(
    exports[`generals_ocl_nugget_${prefix}_ptr`](index),
    exports[`generals_ocl_nugget_${prefix}_size`](index)
  );
}

function parse(source) {
  const bytes = textEncoder.encode(source);
  memory.set(bytes, exports.generals_ocl_input_ptr());
  const parsedCount = exports.generals_ocl_parse(bytes.length);
  if (parsedCount < 0 || exports.generals_ocl_error_count() !== 0) {
    throw new Error(`OCL parse failed: parsed=${parsedCount}, errors=${exports.generals_ocl_error_count()}`);
  }
  return parsedCount;
}

parse(`
ObjectCreationList OCL_CreateDamagedBarrel
  CreateDebris
    ModelNames = PMBarrel01_D1 ; comment after a string value
    Offset = X:0 Y:0 Z:0
    Mass = 2
    Count = 1
    Disposition = RANDOM_FORCE
    ParticleSystem = BlackTrail
  End
End

ObjectCreationList OCL_Airstrike
  DeliverPayload
    Transport = AmericaJetCargoPlane
    StartAtPreferredHeight = Yes
    FormationSize = 2
    Payload = DaisyCutterBomb 1
    DeliveryDecal
      Texture = SCCDaisyCutter
    End
  End
  FireWeapon
    Weapon = DaisyCutterShockwave
  End
End

ObjectCreationList OCL_Attack
  Attack
    NumberOfShots = 3
    WeaponSlot = PRIMARY_WEAPON
  End
  ApplyRandomForce
    SpinRate = 180
    MinForceMagnitude = 5
    MaxForceMagnitude = 7
  End
End
`);

if (exports.generals_ocl_list_count() !== 3 ||
    exports.generals_ocl_nugget_count() !== 5 ||
    exports.generals_ocl_field_count() !== 17 ||
    exports.generals_ocl_type_count(0) !== 0 ||
    exports.generals_ocl_type_count(1) !== 1 ||
    exports.generals_ocl_type_count(2) !== 1 ||
    exports.generals_ocl_type_count(3) !== 1 ||
    exports.generals_ocl_type_count(4) !== 1 ||
    exports.generals_ocl_type_count(5) !== 1) {
  throw new Error("unexpected aggregate OCL parse result");
}

if (typeName(0) !== "CreateObject" ||
    typeName(1) !== "CreateDebris" ||
    typeName(2) !== "ApplyRandomForce" ||
    typeName(3) !== "DeliverPayload" ||
    typeName(4) !== "FireWeapon" ||
    typeName(5) !== "Attack") {
  throw new Error("unexpected OCL type names");
}

if (listName(0) !== "OCL_CreateDamagedBarrel" ||
    exports.generals_ocl_list_line(0) !== 2 ||
    exports.generals_ocl_list_first_nugget(0) !== 0 ||
    exports.generals_ocl_list_nugget_count(0) !== 1) {
  throw new Error("unexpected first OCL list parse result");
}

if (exports.generals_ocl_nugget_list_index(0) !== 0 ||
    exports.generals_ocl_nugget_type(0) !== 1 ||
    exports.generals_ocl_nugget_field_count(0) !== 6 ||
    nuggetString("target", 0) !== "PMBarrel01_D1" ||
    nuggetString("disposition", 0) !== "RANDOM_FORCE" ||
    nuggetString("particle_system", 0) !== "BlackTrail" ||
    exports.generals_ocl_nugget_count_value(0) !== 1 ||
    exports.generals_ocl_nugget_mass_x100(0) !== 200) {
  throw new Error("unexpected CreateDebris nugget parse result");
}

if (listName(1) !== "OCL_Airstrike" ||
    exports.generals_ocl_list_nugget_count(1) !== 2 ||
    exports.generals_ocl_nugget_type(1) !== 3 ||
    exports.generals_ocl_nugget_field_count(1) !== 5 ||
    nuggetString("target", 1) !== "AmericaJetCargoPlane" ||
    nuggetString("secondary", 1) !== "DaisyCutterBomb" ||
    exports.generals_ocl_nugget_count_value(1) !== 2 ||
    exports.generals_ocl_nugget_type(2) !== 4 ||
    nuggetString("target", 2) !== "DaisyCutterShockwave") {
  throw new Error("unexpected payload/fire weapon parse result");
}

if (listName(2) !== "OCL_Attack" ||
    exports.generals_ocl_list_nugget_count(2) !== 2 ||
    exports.generals_ocl_nugget_type(3) !== 5 ||
    exports.generals_ocl_nugget_count_value(3) !== 3 ||
    nuggetString("target", 3) !== "PRIMARY_WEAPON" ||
    exports.generals_ocl_nugget_type(4) !== 2 ||
    exports.generals_ocl_nugget_field_count(4) !== 3) {
  throw new Error("unexpected attack/random force parse result");
}

console.log(JSON.stringify({
  module: wasmPath,
  lists: exports.generals_ocl_list_count(),
  nuggets: exports.generals_ocl_nugget_count(),
  fields: exports.generals_ocl_field_count(),
  first: listName(0),
}, null, 2));
