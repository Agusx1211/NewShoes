import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const damageFxWasmPath = resolve(wasmDir, "dist/generals_damagefx.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, damageFxWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(damageFxWasmPath),
  readFile(archivePath),
]);
const [bigModule, damageFxModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(damageFxWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const damageFxExports = damageFxModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const damageFxMemory = new Uint8Array(damageFxExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readDamageFxString(ptr, size) {
  return ptr ? textDecoder.decode(damageFxMemory.slice(ptr, ptr + size)) : "";
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

function parseDamageFxPayload(bytes) {
  if (bytes.length > damageFxExports.generals_damagefx_input_capacity()) {
    throw new Error(`DamageFX payload exceeds ${damageFxExports.generals_damagefx_input_capacity()} byte wasm buffer`);
  }

  damageFxMemory.set(bytes, damageFxExports.generals_damagefx_input_ptr());
  const parsedCount = damageFxExports.generals_damagefx_parse(bytes.length);
  if (parsedCount < 0 || damageFxExports.generals_damagefx_error_count() !== 0) {
    throw new Error(`DamageFX parse failed: parsed=${parsedCount}, errors=${damageFxExports.generals_damagefx_error_count()}`);
  }

  return parsedCount;
}

function templateName(index) {
  return readDamageFxString(
    damageFxExports.generals_damagefx_template_name_ptr(index),
    damageFxExports.generals_damagefx_template_name_size(index)
  );
}

function damageName(index) {
  return readDamageFxString(
    damageFxExports.generals_damagefx_damage_name_ptr(index),
    damageFxExports.generals_damagefx_damage_name_size(index)
  );
}

function cellString(prefix, templateIndex, damageType, veterancy) {
  return readDamageFxString(
    damageFxExports[`generals_damagefx_cell_${prefix}_ptr`](templateIndex, damageType, veterancy),
    damageFxExports[`generals_damagefx_cell_${prefix}_size`](templateIndex, damageType, veterancy)
  );
}

function templateSummary(index) {
  return {
    index,
    name: templateName(index),
    line: damageFxExports.generals_damagefx_template_line(index),
    assignments: damageFxExports.generals_damagefx_template_assignment_count(index),
    explosion: {
      amount: damageFxExports.generals_damagefx_cell_amount_x100(index, 0, 0),
      major: cellString("major_fx", index, 0, 0),
      minor: cellString("minor_fx", index, 0, 0),
      throttle: damageFxExports.generals_damagefx_cell_throttle_time(index, 0, 0),
    },
    crush: {
      amount: damageFxExports.generals_damagefx_cell_amount_x100(index, 1, 0),
      major: cellString("major_fx", index, 1, 0),
      minor: cellString("minor_fx", index, 1, 0),
      throttle: damageFxExports.generals_damagefx_cell_throttle_time(index, 1, 0),
    },
    water: {
      major: cellString("major_fx", index, 12, 0),
      minor: cellString("minor_fx", index, 12, 0),
    },
  };
}

function findTemplate(name) {
  for (let index = 0; index < damageFxExports.generals_damagefx_template_count(); ++index) {
    if (templateName(index) === name) {
      return templateSummary(index);
    }
  }

  throw new Error(`DamageFX template not found: ${name}`);
}

const damageFxBytes = entryBytes("data/ini/damagefx.ini");
const templateCount = parseDamageFxPayload(damageFxBytes);
const samples = {
  defaultDamage: findTemplate("DefaultDamageFX"),
  crushableCar: findTemplate("CrushableCarDamageFX"),
  tank: findTemplate("TankDamageFX"),
  infantry: findTemplate("InfantryDamageFX"),
  empty: findTemplate("EmptyDamageFX"),
};

const summary = {
  archive: archivePath,
  damageFxBytes: damageFxBytes.length,
  templateCount,
  assignmentCount: damageFxExports.generals_damagefx_assignment_count(),
  resolvedUpdateCount: damageFxExports.generals_damagefx_resolved_update_count(),
  lineCount: damageFxExports.generals_damagefx_line_count(),
  amountAssignments: damageFxExports.generals_damagefx_field_type_count(0),
  majorAssignments: damageFxExports.generals_damagefx_field_type_count(1),
  minorAssignments: damageFxExports.generals_damagefx_field_type_count(2),
  throttleAssignments: damageFxExports.generals_damagefx_field_type_count(3),
  veterancyAssignments: damageFxExports.generals_damagefx_veterancy_assignment_count(),
  amountCells: damageFxExports.generals_damagefx_amount_cell_count(),
  majorFxCells: damageFxExports.generals_damagefx_major_fx_cell_count(),
  minorFxCells: damageFxExports.generals_damagefx_minor_fx_cell_count(),
  throttleCells: damageFxExports.generals_damagefx_throttle_cell_count(),
  first: templateName(0),
  last: templateName(templateCount - 1),
  damageSample: damageName(35),
  samples,
};

if (summary.damageFxBytes !== 20616 ||
    summary.templateCount !== 11 ||
    summary.assignmentCount !== 242 ||
    summary.resolvedUpdateCount !== 5794 ||
    summary.lineCount !== 489 ||
    summary.amountAssignments !== 9 ||
    summary.majorAssignments !== 112 ||
    summary.minorAssignments !== 112 ||
    summary.throttleAssignments !== 9 ||
    summary.veterancyAssignments !== 44 ||
    summary.amountCells !== 1072 ||
    summary.majorFxCells !== 1244 ||
    summary.minorFxCells !== 1244 ||
    summary.throttleCells !== 1368 ||
    summary.first !== "DefaultDamageFX" ||
    summary.last !== "EmptyDamageFX" ||
    summary.damageSample !== "MICROWAVE") {
  throw new Error(`unexpected DamageFX aggregate parse: ${JSON.stringify(summary)}`);
}

const defaultDamage = samples.defaultDamage;
if (defaultDamage.index !== 0 ||
    defaultDamage.assignments !== 10 ||
    defaultDamage.explosion.throttle !== 300 ||
    defaultDamage.crush.throttle !== 300) {
  throw new Error(`unexpected DefaultDamageFX parse: ${JSON.stringify(defaultDamage)}`);
}

const crushableCar = samples.crushableCar;
if (crushableCar.index !== 1 ||
    crushableCar.assignments !== 8 ||
    crushableCar.crush.amount !== 100 ||
    crushableCar.crush.major !== "FX_CarOverlappedByCrusher" ||
    crushableCar.crush.minor !== "FX_CarOverlappedByCrusher" ||
    crushableCar.crush.throttle !== 300) {
  throw new Error(`unexpected CrushableCarDamageFX parse: ${JSON.stringify(crushableCar)}`);
}

const tank = samples.tank;
if (tank.index !== 2 ||
    tank.assignments !== 40 ||
    tank.explosion.amount !== 200 ||
    tank.explosion.major !== "FX_DamageTankStruck" ||
    tank.explosion.minor !== "FX_DamageTankStruck" ||
    tank.explosion.throttle !== 100 ||
    tank.water.major !== "FX_DamageTankStruck") {
  throw new Error(`unexpected TankDamageFX parse: ${JSON.stringify(tank)}`);
}

const infantry = samples.infantry;
if (infantry.index !== 9 ||
    infantry.assignments !== 40 ||
    infantry.explosion.major !== "FX_DamageInfantryStruck" ||
    infantry.water.major !== "None" ||
    infantry.water.minor !== "None") {
  throw new Error(`unexpected InfantryDamageFX parse: ${JSON.stringify(infantry)}`);
}

const empty = samples.empty;
if (empty.index !== 10 ||
    empty.assignments !== 3 ||
    empty.explosion.amount !== 100 ||
    empty.explosion.major !== "None" ||
    empty.explosion.minor !== "None") {
  throw new Error(`unexpected EmptyDamageFX parse: ${JSON.stringify(empty)}`);
}

console.log(JSON.stringify(summary, null, 2));
