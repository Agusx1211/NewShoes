import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const oclWasmPath = resolve(wasmDir, "dist/generals_ocl.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, oclWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(oclWasmPath),
  readFile(archivePath),
]);
const [bigModule, oclModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(oclWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const oclExports = oclModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const oclMemory = new Uint8Array(oclExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readOclString(ptr, size) {
  return ptr ? textDecoder.decode(oclMemory.slice(ptr, ptr + size)) : "";
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

function parseOclPayload(bytes) {
  if (bytes.length > oclExports.generals_ocl_input_capacity()) {
    throw new Error(`OCL payload exceeds ${oclExports.generals_ocl_input_capacity()} byte wasm buffer`);
  }

  oclMemory.set(bytes, oclExports.generals_ocl_input_ptr());
  const parsedCount = oclExports.generals_ocl_parse(bytes.length);
  if (parsedCount < 0 || oclExports.generals_ocl_error_count() !== 0) {
    throw new Error(`OCL parse failed: parsed=${parsedCount}, errors=${oclExports.generals_ocl_error_count()}`);
  }

  return parsedCount;
}

function listName(index) {
  return readOclString(
    oclExports.generals_ocl_list_name_ptr(index),
    oclExports.generals_ocl_list_name_size(index)
  );
}

function typeName(type) {
  return readOclString(
    oclExports.generals_ocl_type_name_ptr(type),
    oclExports.generals_ocl_type_name_size(type)
  );
}

function nuggetString(prefix, index) {
  return readOclString(
    oclExports[`generals_ocl_nugget_${prefix}_ptr`](index),
    oclExports[`generals_ocl_nugget_${prefix}_size`](index)
  );
}

function nuggetSummary(index) {
  const type = oclExports.generals_ocl_nugget_type(index);
  return {
    index,
    type: typeName(type),
    line: oclExports.generals_ocl_nugget_line(index),
    fields: oclExports.generals_ocl_nugget_field_count(index),
    target: nuggetString("target", index),
    secondary: nuggetString("secondary", index),
    disposition: nuggetString("disposition", index),
    particleSystem: nuggetString("particle_system", index),
    count: oclExports.generals_ocl_nugget_count_value(index),
    mass: oclExports.generals_ocl_nugget_mass_x100(index),
  };
}

function listSummary(index) {
  const firstNugget = oclExports.generals_ocl_list_first_nugget(index);
  return {
    index,
    name: listName(index),
    line: oclExports.generals_ocl_list_line(index),
    nuggets: oclExports.generals_ocl_list_nugget_count(index),
    firstNugget,
    first: nuggetSummary(firstNugget),
  };
}

function findList(name) {
  for (let index = 0; index < oclExports.generals_ocl_list_count(); ++index) {
    if (listName(index) === name) {
      return listSummary(index);
    }
  }

  throw new Error(`OCL list not found: ${name}`);
}

const oclBytes = entryBytes("data/ini/objectcreationlist.ini");
const listCount = parseOclPayload(oclBytes);
const samples = {
  damagedBarrel: findList("OCL_CreateDamagedBarrel"),
  fireWall: findList("OCL_FireWallSegment"),
  genericCar: findList("OCL_GenericCarExplode"),
  daisyCutter: findList("SUPERWEAPON_DaisyCutter"),
  neutronMissile: findList("SUPERWEAPON_NeutronMissile"),
  scudStorm: findList("SUPERWEAPON_ScudStorm"),
  lastNeutronMissile: findList("SupW_SUPERWEAPON_NeutronMissile"),
};

const summary = {
  archive: archivePath,
  oclBytes: oclBytes.length,
  listCount,
  nuggetCount: oclExports.generals_ocl_nugget_count(),
  fieldCount: oclExports.generals_ocl_field_count(),
  lineCount: oclExports.generals_ocl_line_count(),
  createObjectCount: oclExports.generals_ocl_type_count(0),
  createDebrisCount: oclExports.generals_ocl_type_count(1),
  applyRandomForceCount: oclExports.generals_ocl_type_count(2),
  deliverPayloadCount: oclExports.generals_ocl_type_count(3),
  fireWeaponCount: oclExports.generals_ocl_type_count(4),
  attackCount: oclExports.generals_ocl_type_count(5),
  first: listName(0),
  last: listName(listCount - 1),
  samples,
};

if (summary.oclBytes !== 254440 ||
    summary.listCount !== 282 ||
    summary.nuggetCount !== 704 ||
    summary.fieldCount !== 4747 ||
    summary.lineCount !== 8154 ||
    summary.createObjectCount !== 172 ||
    summary.createDebrisCount !== 473 ||
    summary.applyRandomForceCount !== 10 ||
    summary.deliverPayloadCount !== 45 ||
    summary.fireWeaponCount !== 3 ||
    summary.attackCount !== 1 ||
    summary.first !== "OCL_CreateDamagedBarrel" ||
    summary.last !== "SupW_SUPERWEAPON_NeutronMissile") {
  throw new Error(`unexpected OCL aggregate parse: ${JSON.stringify(summary)}`);
}

const damagedBarrel = samples.damagedBarrel;
if (damagedBarrel.index !== 0 ||
    damagedBarrel.line !== 6 ||
    damagedBarrel.nuggets !== 1 ||
    damagedBarrel.first.type !== "CreateDebris" ||
    damagedBarrel.first.fields !== 11 ||
    damagedBarrel.first.target !== "PMBarrel01_D1" ||
    damagedBarrel.first.disposition !== "RANDOM_FORCE" ||
    damagedBarrel.first.particleSystem !== "BlackTrail" ||
    damagedBarrel.first.count !== 1 ||
    damagedBarrel.first.mass !== 200) {
  throw new Error(`unexpected damaged barrel OCL parse: ${JSON.stringify(damagedBarrel)}`);
}

const fireWall = samples.fireWall;
if (fireWall.index !== 1 ||
    fireWall.first.type !== "CreateObject" ||
    fireWall.first.fields !== 3 ||
    fireWall.first.target !== "FireWallSegment" ||
    fireWall.first.disposition !== "LIKE_EXISTING INHERIT_VELOCITY") {
  throw new Error(`unexpected firewall OCL parse: ${JSON.stringify(fireWall)}`);
}

const genericCar = samples.genericCar;
if (genericCar.index !== 50 ||
    genericCar.nuggets !== 14 ||
    genericCar.first.type !== "CreateDebris" ||
    genericCar.first.target !== "CVGeneric_X01" ||
    genericCar.first.disposition !== "SEND_IT_FLYING" ||
    genericCar.first.mass !== 500) {
  throw new Error(`unexpected generic car OCL parse: ${JSON.stringify(genericCar)}`);
}

const daisyCutter = samples.daisyCutter;
if (daisyCutter.index !== 118 ||
    daisyCutter.first.type !== "DeliverPayload" ||
    daisyCutter.first.fields !== 9 ||
    daisyCutter.first.target !== "AmericaJetB52" ||
    daisyCutter.first.secondary !== "DaisyCutterBomb" ||
    daisyCutter.first.count !== 1) {
  throw new Error(`unexpected Daisy Cutter OCL parse: ${JSON.stringify(daisyCutter)}`);
}

const neutronMissile = samples.neutronMissile;
if (neutronMissile.index !== 121 ||
    neutronMissile.first.type !== "FireWeapon" ||
    neutronMissile.first.target !== "NeutronMissileWeapon") {
  throw new Error(`unexpected neutron missile OCL parse: ${JSON.stringify(neutronMissile)}`);
}

const scudStorm = samples.scudStorm;
if (scudStorm.index !== 122 ||
    scudStorm.first.type !== "Attack" ||
    scudStorm.first.target !== "PRIMARY" ||
    scudStorm.first.count !== 9) {
  throw new Error(`unexpected Scud Storm OCL parse: ${JSON.stringify(scudStorm)}`);
}

const lastNeutronMissile = samples.lastNeutronMissile;
if (lastNeutronMissile.index !== 281 ||
    lastNeutronMissile.first.type !== "FireWeapon" ||
    lastNeutronMissile.first.target !== "SupW_NeutronMissileWeapon") {
  throw new Error(`unexpected last OCL parse: ${JSON.stringify(lastNeutronMissile)}`);
}

console.log(JSON.stringify(summary, null, 2));
