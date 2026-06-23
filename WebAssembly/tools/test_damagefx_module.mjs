import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_damagefx.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
DamageFX TestDamageFX
  AmountForMajorFX = Default 10.0
  MajorFX = Default FX_DefaultMajor
  MinorFX = EXPLOSION FX_ExplosionMinor
  ThrottleTime = CRUSH 250
  VeterancyAmountForMajorFX = HEROIC EXPLOSION 25.5
  VeterancyMajorFX = ELITE CRUSH FX_EliteCrush
  VeterancyMinorFX = VETERAN Default FX_VeteranMinor
  VeterancyThrottleTime = HEROIC Default 500
End

DamageFX EmptyDamageFX
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_damagefx_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_damagefx_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_damagefx_input_ptr());
const parsedCount = exports.generals_damagefx_parse(bytes.length);
if (parsedCount < 0 || exports.generals_damagefx_error_count() !== 0) {
  throw new Error(`DamageFX parse failed: parsed=${parsedCount}, errors=${exports.generals_damagefx_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function damageName(index) {
  return readString(
    exports.generals_damagefx_damage_name_ptr(index),
    exports.generals_damagefx_damage_name_size(index)
  );
}

function templateName(index) {
  return readString(
    exports.generals_damagefx_template_name_ptr(index),
    exports.generals_damagefx_template_name_size(index)
  );
}

function cellString(prefix, templateIndex, damageType, veterancy) {
  return readString(
    exports[`generals_damagefx_cell_${prefix}_ptr`](templateIndex, damageType, veterancy),
    exports[`generals_damagefx_cell_${prefix}_size`](templateIndex, damageType, veterancy)
  );
}

if (parsedCount !== 2 ||
    exports.generals_damagefx_assignment_count() !== 8 ||
    exports.generals_damagefx_resolved_update_count() !== 390 ||
    exports.generals_damagefx_amount_cell_count() !== 152 ||
    exports.generals_damagefx_major_fx_cell_count() !== 152 ||
    exports.generals_damagefx_minor_fx_cell_count() !== 41 ||
    exports.generals_damagefx_throttle_cell_count() !== 41 ||
    exports.generals_damagefx_veterancy_assignment_count() !== 4 ||
    templateName(0) !== "TestDamageFX" ||
    templateName(1) !== "EmptyDamageFX" ||
    damageName(35) !== "MICROWAVE") {
  throw new Error("unexpected DamageFX aggregate parse");
}

if (exports.generals_damagefx_field_type_count(0) !== 2 ||
    exports.generals_damagefx_field_type_count(1) !== 2 ||
    exports.generals_damagefx_field_type_count(2) !== 2 ||
    exports.generals_damagefx_field_type_count(3) !== 2) {
  throw new Error("unexpected DamageFX field type counts");
}

if (exports.generals_damagefx_template_assignment_count(0) !== 8 ||
    exports.generals_damagefx_template_assignment_count(1) !== 0 ||
    exports.generals_damagefx_assignment_expanded_count(0) !== 152 ||
    exports.generals_damagefx_assignment_expanded_count(4) !== 1 ||
    exports.generals_damagefx_assignment_expanded_count(6) !== 38) {
  throw new Error("unexpected DamageFX assignment expansion counts");
}

if (exports.generals_damagefx_cell_amount_x100(0, 0, 3) !== 2550 ||
    exports.generals_damagefx_cell_amount_x100(0, 1, 0) !== 1000 ||
    cellString("major_fx", 0, 1, 2) !== "FX_EliteCrush" ||
    cellString("major_fx", 0, 0, 0) !== "FX_DefaultMajor" ||
    cellString("minor_fx", 0, 9, 1) !== "FX_VeteranMinor" ||
    cellString("minor_fx", 0, 0, 0) !== "FX_ExplosionMinor" ||
    exports.generals_damagefx_cell_throttle_time(0, 0, 3) !== 500 ||
    exports.generals_damagefx_cell_throttle_time(0, 1, 0) !== 250) {
  throw new Error("unexpected DamageFX resolved cell values");
}

console.log(JSON.stringify({
  module: wasmPath,
  templates: parsedCount,
  assignments: exports.generals_damagefx_assignment_count(),
  resolvedUpdates: exports.generals_damagefx_resolved_update_count(),
  first: templateName(0),
}, null, 2));
