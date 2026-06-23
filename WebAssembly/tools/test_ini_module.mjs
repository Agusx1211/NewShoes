import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_ini.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = textEncoder.encode(`
; synthetic shape matches Generals INI block syntax
GameData
  FramesPerSecondLimit = 30
  UseWaterPlane = Yes

Armor HumanArmor
  Armor = CRUSH 200%
  Armor = FLAME 150%
End
`);

memory.set(source, exports.generals_ini_input_ptr());
const parsedCount = exports.generals_ini_parse(source.length);

if (parsedCount !== 2) {
  throw new Error(`expected 2 parsed blocks, got ${parsedCount}`);
}

if (exports.generals_ini_error_count() !== 0) {
  throw new Error(`expected 0 parse errors, got ${exports.generals_ini_error_count()}`);
}

if (exports.generals_ini_property_count() !== 4) {
  throw new Error(`expected 4 properties, got ${exports.generals_ini_property_count()}`);
}

function readString(ptr, size) {
  return textDecoder.decode(memory.slice(ptr, ptr + size));
}

const firstType = readString(
  exports.generals_ini_block_type_ptr(0),
  exports.generals_ini_block_type_size(0)
);
const secondName = readString(
  exports.generals_ini_block_name_ptr(1),
  exports.generals_ini_block_name_size(1)
);

if (firstType !== "GameData" || secondName !== "HumanArmor") {
  throw new Error(`unexpected parsed block data: ${firstType}, ${secondName}`);
}

console.log(JSON.stringify({
  module: wasmPath,
  parsedCount,
  propertyCount: exports.generals_ini_property_count(),
  lineCount: exports.generals_ini_line_count(),
  firstType,
  secondName,
}, null, 2));
