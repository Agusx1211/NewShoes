import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const crateWasmPath = resolve(wasmDir, "dist/generals_crate.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, crateWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(crateWasmPath),
  readFile(archivePath),
]);
const [bigModule, crateModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(crateWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const crateExports = crateModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const crateMemory = new Uint8Array(crateExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readCrateString(ptr, size) {
  return ptr ? textDecoder.decode(crateMemory.slice(ptr, ptr + size)) : "";
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

function parseCratePayload(bytes) {
  if (bytes.length > crateExports.generals_crate_input_capacity()) {
    throw new Error(`CrateData payload exceeds ${crateExports.generals_crate_input_capacity()} byte wasm buffer`);
  }

  crateMemory.set(bytes, crateExports.generals_crate_input_ptr());
  const parsedCount = crateExports.generals_crate_parse(bytes.length);
  if (parsedCount < 0 || crateExports.generals_crate_error_count() !== 0) {
    throw new Error(`CrateData parse failed: parsed=${parsedCount}, errors=${crateExports.generals_crate_error_count()}`);
  }

  return parsedCount;
}

function templateName(index) {
  return readCrateString(
    crateExports.generals_crate_template_name_ptr(index),
    crateExports.generals_crate_template_name_size(index)
  );
}

function templateString(prefix, index) {
  return readCrateString(
    crateExports[`generals_crate_template_${prefix}_ptr`](index),
    crateExports[`generals_crate_template_${prefix}_size`](index)
  );
}

function objectName(index) {
  return readCrateString(
    crateExports.generals_crate_object_name_ptr(index),
    crateExports.generals_crate_object_name_size(index)
  );
}

function templateObjects(index) {
  const firstObject = crateExports.generals_crate_template_first_object(index);
  const objectCount = crateExports.generals_crate_template_object_count(index);
  return Array.from({ length: objectCount }, (_, offset) => {
    const objectIndex = firstObject + offset;
    return {
      index: objectIndex,
      name: objectName(objectIndex),
      chance: crateExports.generals_crate_object_chance_x100(objectIndex),
      line: crateExports.generals_crate_object_line(objectIndex),
    };
  });
}

function templateSummary(index) {
  return {
    index,
    name: templateName(index),
    line: crateExports.generals_crate_template_line(index),
    fields: crateExports.generals_crate_template_field_count_at(index),
    creationChance: crateExports.generals_crate_template_creation_chance_x100(index),
    veterancy: crateExports.generals_crate_template_veterancy_level(index),
    killedByType: templateString("killed_by_type", index),
    killerScience: templateString("killer_science", index),
    ownedByMaker: crateExports.generals_crate_template_owned_by_maker(index),
    objects: templateObjects(index),
  };
}

function findTemplate(name) {
  for (let index = 0; index < crateExports.generals_crate_template_count(); ++index) {
    if (templateName(index) === name) {
      return templateSummary(index);
    }
  }

  throw new Error(`CrateData not found: ${name}`);
}

const crateBytes = entryBytes("data/ini/crate.ini");
const templateCount = parseCratePayload(crateBytes);
const samples = {
  salvage: findTemplate("SalvageCrateData"),
  eliteTank: findTemplate("EliteTankCrateData"),
  heroicTank: findTemplate("HeroicTankCrateData"),
  gla100: findTemplate("GLA02_Always100DollarCrate"),
  gla2500: findTemplate("GLA02_Always2500DollarCrate"),
};

const summary = {
  archive: archivePath,
  crateBytes: crateBytes.length,
  templateCount,
  objectCount: crateExports.generals_crate_object_count(),
  fieldCount: crateExports.generals_crate_field_count(),
  lineCount: crateExports.generals_crate_line_count(),
  ownedByMakerCount: crateExports.generals_crate_owned_by_maker_count(),
  veterancyConditionCount: crateExports.generals_crate_veterancy_condition_count(),
  kindofConditionCount: crateExports.generals_crate_kindof_condition_count(),
  scienceConditionCount: crateExports.generals_crate_science_condition_count(),
  first: templateName(0),
  last: templateName(templateCount - 1),
  samples,
};

if (summary.crateBytes !== 20005 ||
    summary.templateCount !== 8 ||
    summary.objectCount !== 11 ||
    summary.fieldCount !== 28 ||
    summary.lineCount !== 621 ||
    summary.ownedByMakerCount !== 5 ||
    summary.veterancyConditionCount !== 2 ||
    summary.kindofConditionCount !== 1 ||
    summary.scienceConditionCount !== 1 ||
    summary.first !== "SalvageCrateData" ||
    summary.last !== "GLA02_Always2500DollarCrate") {
  throw new Error(`unexpected CrateData aggregate parse: ${JSON.stringify(summary)}`);
}

const salvage = samples.salvage;
if (salvage.index !== 0 ||
    salvage.creationChance !== 100 ||
    salvage.killedByType !== "SALVAGER" ||
    salvage.killerScience !== "SCIENCE_GLA" ||
    salvage.objects.length !== 1 ||
    salvage.objects[0].name !== "SalvageCrate" ||
    salvage.objects[0].chance !== 100) {
  throw new Error(`unexpected SalvageCrateData parse: ${JSON.stringify(salvage)}`);
}

const eliteTank = samples.eliteTank;
if (eliteTank.index !== 1 ||
    eliteTank.creationChance !== 75 ||
    eliteTank.veterancy !== 2 ||
    eliteTank.objects.length !== 2 ||
    eliteTank.objects[0].name !== "1000DollarCrate" ||
    eliteTank.objects[0].chance !== 75 ||
    eliteTank.objects[1].name !== "SmallLevelUpCrate" ||
    eliteTank.objects[1].chance !== 25) {
  throw new Error(`unexpected EliteTankCrateData parse: ${JSON.stringify(eliteTank)}`);
}

const heroicTank = samples.heroicTank;
if (heroicTank.index !== 2 ||
    heroicTank.creationChance !== 100 ||
    heroicTank.veterancy !== 3 ||
    heroicTank.objects.length !== 3 ||
    heroicTank.objects[0].name !== "2500DollarCrate" ||
    heroicTank.objects[1].name !== "MediumLevelUpCrate" ||
    heroicTank.objects[2].name !== "2FreeCrusadersCrate") {
  throw new Error(`unexpected HeroicTankCrateData parse: ${JSON.stringify(heroicTank)}`);
}

const gla100 = samples.gla100;
if (gla100.index !== 3 ||
    gla100.ownedByMaker !== 1 ||
    gla100.objects[0].name !== "100DollarCrate" ||
    gla100.objects[0].chance !== 100) {
  throw new Error(`unexpected GLA02_Always100DollarCrate parse: ${JSON.stringify(gla100)}`);
}

const gla2500 = samples.gla2500;
if (gla2500.index !== 7 ||
    gla2500.ownedByMaker !== 1 ||
    gla2500.objects[0].name !== "2500DollarCrate" ||
    gla2500.objects[0].chance !== 100) {
  throw new Error(`unexpected GLA02_Always2500DollarCrate parse: ${JSON.stringify(gla2500)}`);
}

console.log(JSON.stringify(summary, null, 2));
