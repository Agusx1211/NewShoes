import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const fxlistWasmPath = resolve(wasmDir, "dist/generals_fxlist.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, fxlistWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(fxlistWasmPath),
  readFile(archivePath),
]);
const [bigModule, fxlistModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(fxlistWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const fxlistExports = fxlistModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const fxlistMemory = new Uint8Array(fxlistExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readFxString(ptr, size) {
  return ptr ? textDecoder.decode(fxlistMemory.slice(ptr, ptr + size)) : "";
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

function parseFxListPayload(bytes) {
  if (bytes.length > fxlistExports.generals_fxlist_input_capacity()) {
    throw new Error(`FXList payload exceeds ${fxlistExports.generals_fxlist_input_capacity()} byte wasm buffer`);
  }

  fxlistMemory.set(bytes, fxlistExports.generals_fxlist_input_ptr());
  const parsedCount = fxlistExports.generals_fxlist_parse(bytes.length);
  if (parsedCount < 0 || fxlistExports.generals_fxlist_error_count() !== 0) {
    throw new Error(`FXList parse failed: parsed=${parsedCount}, errors=${fxlistExports.generals_fxlist_error_count()}`);
  }

  return parsedCount;
}

function listName(index) {
  return readFxString(
    fxlistExports.generals_fxlist_list_name_ptr(index),
    fxlistExports.generals_fxlist_list_name_size(index)
  );
}

function typeName(type) {
  return readFxString(
    fxlistExports.generals_fxlist_type_name_ptr(type),
    fxlistExports.generals_fxlist_type_name_size(type)
  );
}

function nuggetString(prefix, index) {
  return readFxString(
    fxlistExports[`generals_fxlist_nugget_${prefix}_ptr`](index),
    fxlistExports[`generals_fxlist_nugget_${prefix}_size`](index)
  );
}

function nuggetSummary(index) {
  const type = fxlistExports.generals_fxlist_nugget_type(index);
  return {
    index,
    type: typeName(type),
    line: fxlistExports.generals_fxlist_nugget_line(index),
    fields: fxlistExports.generals_fxlist_nugget_field_count(index),
    target: nuggetString("target", index),
    secondary: nuggetString("secondary", index),
    count: fxlistExports.generals_fxlist_nugget_count_value(index),
    radius: fxlistExports.generals_fxlist_nugget_radius_x100(index),
  };
}

function listSummary(index, maxNuggets = 4) {
  const firstNugget = fxlistExports.generals_fxlist_list_first_nugget(index);
  const nuggetCount = fxlistExports.generals_fxlist_list_nugget_count(index);
  return {
    index,
    name: listName(index),
    line: fxlistExports.generals_fxlist_list_line(index),
    nuggets: nuggetCount,
    firstNugget,
    preview: Array.from({ length: Math.min(nuggetCount, maxNuggets) }, (_, offset) => {
      return nuggetSummary(firstNugget + offset);
    }),
  };
}

function findList(name) {
  for (let index = 0; index < fxlistExports.generals_fxlist_list_count(); ++index) {
    if (listName(index) === name) {
      return listSummary(index);
    }
  }

  throw new Error(`FXList not found: ${name}`);
}

const fxlistBytes = entryBytes("data/ini/fxlist.ini");
const listCount = parseFxListPayload(fxlistBytes);
const samples = {
  toxinShell: findList("WeaponFX_ToxinShellWeapon"),
  crushedCar: findList("FX_CarOverlappedByCrusher"),
  emptyDie: findList("FX_GIDie"),
  tankExplosion: findList("FX_GenericTankDeathExplosion"),
  nuke: findList("FX_Nuke"),
};

const summary = {
  archive: archivePath,
  fxlistBytes: fxlistBytes.length,
  listCount,
  nuggetCount: fxlistExports.generals_fxlist_nugget_count(),
  fieldCount: fxlistExports.generals_fxlist_field_count(),
  lineCount: fxlistExports.generals_fxlist_line_count(),
  soundCount: fxlistExports.generals_fxlist_type_count(0),
  rayEffectCount: fxlistExports.generals_fxlist_type_count(1),
  tracerCount: fxlistExports.generals_fxlist_type_count(2),
  lightPulseCount: fxlistExports.generals_fxlist_type_count(3),
  viewShakeCount: fxlistExports.generals_fxlist_type_count(4),
  terrainScorchCount: fxlistExports.generals_fxlist_type_count(5),
  particleSystemCount: fxlistExports.generals_fxlist_type_count(6),
  atBoneCount: fxlistExports.generals_fxlist_type_count(7),
  first: listName(0),
  last: listName(listCount - 1),
  samples,
};

if (summary.fxlistBytes !== 184917 ||
    summary.listCount !== 430 ||
    summary.nuggetCount !== 1466 ||
    summary.fieldCount !== 2747 ||
    summary.lineCount !== 8419 ||
    summary.soundCount !== 321 ||
    summary.rayEffectCount !== 0 ||
    summary.tracerCount !== 18 ||
    summary.lightPulseCount !== 65 ||
    summary.viewShakeCount !== 140 ||
    summary.terrainScorchCount !== 47 ||
    summary.particleSystemCount !== 870 ||
    summary.atBoneCount !== 5 ||
    summary.first !== "WeaponFX_ToxinShellWeapon" ||
    summary.last !== "WeaponFX_DemoSuicideDynamitePackDetonationPlusFire") {
  throw new Error(`unexpected FXList aggregate parse: ${JSON.stringify(summary)}`);
}

const toxinShell = samples.toxinShell;
if (toxinShell.index !== 0 ||
    toxinShell.nuggets !== 1 ||
    toxinShell.preview[0].type !== "ParticleSystem" ||
    toxinShell.preview[0].target !== "ToxicShellExplosion" ||
    toxinShell.preview[0].fields !== 1) {
  throw new Error(`unexpected toxin shell FXList parse: ${JSON.stringify(toxinShell)}`);
}

const crushedCar = samples.crushedCar;
if (crushedCar.index !== 1 ||
    crushedCar.nuggets !== 1 ||
    crushedCar.preview[0].type !== "Sound" ||
    crushedCar.preview[0].target !== "CarMount") {
  throw new Error(`unexpected crushed car FXList parse: ${JSON.stringify(crushedCar)}`);
}

const emptyDie = samples.emptyDie;
if (emptyDie.index !== 2 ||
    emptyDie.nuggets !== 0 ||
    emptyDie.preview.length !== 0) {
  throw new Error(`unexpected empty FXList parse: ${JSON.stringify(emptyDie)}`);
}

const tankExplosion = samples.tankExplosion;
if (tankExplosion.index !== 104 ||
    tankExplosion.nuggets !== 8 ||
    tankExplosion.preview[0].type !== "ParticleSystem" ||
    tankExplosion.preview[0].target !== "MammothTankExplosionSmoke" ||
    tankExplosion.preview[1].target !== "MammothTankSubExplosionSmoke" ||
    tankExplosion.preview[1].radius !== 1500) {
  throw new Error(`unexpected tank explosion FXList parse: ${JSON.stringify(tankExplosion)}`);
}

const nuke = samples.nuke;
if (nuke.index !== 274 ||
    nuke.nuggets !== 12 ||
    nuke.preview[0].type !== "ViewShake" ||
    nuke.preview[0].target !== "SEVERE" ||
    nuke.preview[1].type !== "Sound" ||
    nuke.preview[1].target !== "ExplosionNeutron" ||
    nuke.preview[2].type !== "ParticleSystem" ||
    nuke.preview[2].target !== "NukeFlare") {
  throw new Error(`unexpected nuke FXList parse: ${JSON.stringify(nuke)}`);
}

console.log(JSON.stringify(summary, null, 2));
