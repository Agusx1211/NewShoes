import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const mappedImageWasmPath = resolve(wasmDir, "dist/generals_mappedimage.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, mappedImageWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(mappedImageWasmPath),
  readFile(archivePath),
]);
const [bigModule, mappedImageModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(mappedImageWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const mappedImageExports = mappedImageModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const mappedImageMemory = new Uint8Array(mappedImageExports.memory.buffer);
const textDecoder = new TextDecoder();
const separator = new TextEncoder().encode("\n");

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readMappedImageString(ptr, size) {
  return ptr ? textDecoder.decode(mappedImageMemory.slice(ptr, ptr + size)) : "";
}

function mappedImageString(prefix, index) {
  return readMappedImageString(
    mappedImageExports[`generals_mappedimage_${prefix}_ptr`](index),
    mappedImageExports[`generals_mappedimage_${prefix}_size`](index)
  );
}

const mappedEntries = [];
for (let index = 0; index < fileCount; ++index) {
  const name = readBigString(
    bigExports.generals_big_entry_name_ptr(index),
    bigExports.generals_big_entry_name_size(index)
  );
  if (!name.startsWith("data/ini/mappedimages/") || !name.endsWith(".ini")) {
    continue;
  }

  const dataPtr = bigExports.generals_big_entry_data_ptr(index);
  const dataSize = bigExports.generals_big_entry_data_size(index);
  mappedEntries.push({
    name,
    size: dataSize,
    bytes: bigMemory.slice(dataPtr, dataPtr + dataSize),
  });
}

const sourceBytes = mappedEntries.reduce((total, entry) => total + entry.size, 0);
const combinedBytes = new Uint8Array(sourceBytes + Math.max(0, mappedEntries.length - 1));
let cursor = 0;
for (let index = 0; index < mappedEntries.length; ++index) {
  combinedBytes.set(mappedEntries[index].bytes, cursor);
  cursor += mappedEntries[index].bytes.length;
  if (index + 1 < mappedEntries.length) {
    combinedBytes.set(separator, cursor);
    cursor += separator.length;
  }
}

if (combinedBytes.length > mappedImageExports.generals_mappedimage_input_capacity()) {
  throw new Error(`mapped image payload exceeds ${mappedImageExports.generals_mappedimage_input_capacity()} byte wasm buffer`);
}

mappedImageMemory.set(combinedBytes, mappedImageExports.generals_mappedimage_input_ptr());
const parsedCount = mappedImageExports.generals_mappedimage_parse(combinedBytes.length);
if (parsedCount < 0 || mappedImageExports.generals_mappedimage_error_count() !== 0) {
  throw new Error(`mapped image parse failed: parsed=${parsedCount}, errors=${mappedImageExports.generals_mappedimage_error_count()}`);
}

function imageSummary(index) {
  return {
    index,
    name: mappedImageString("name", index),
    texture: mappedImageString("texture", index),
    status: mappedImageString("status_raw", index),
    line: mappedImageExports.generals_mappedimage_line(index),
    fields: mappedImageExports.generals_mappedimage_field_count_at(index),
    textureWidth: mappedImageExports.generals_mappedimage_texture_width(index),
    textureHeight: mappedImageExports.generals_mappedimage_texture_height(index),
    left: mappedImageExports.generals_mappedimage_left(index),
    top: mappedImageExports.generals_mappedimage_top(index),
    right: mappedImageExports.generals_mappedimage_right(index),
    bottom: mappedImageExports.generals_mappedimage_bottom(index),
    width: mappedImageExports.generals_mappedimage_image_width(index),
    height: mappedImageExports.generals_mappedimage_image_height(index),
    statusMask: mappedImageExports.generals_mappedimage_status_mask(index),
  };
}

function findImage(name) {
  for (let index = 0; index < mappedImageExports.generals_mappedimage_image_count(); ++index) {
    if (mappedImageString("name", index) === name) {
      return imageSummary(index);
    }
  }

  throw new Error(`mapped image not found: ${name}`);
}

const texturePages = new Set();
let totalArea = 0;
for (let index = 0; index < mappedImageExports.generals_mappedimage_image_count(); ++index) {
  texturePages.add(mappedImageString("texture", index));
  totalArea += mappedImageExports.generals_mappedimage_image_width(index) *
    mappedImageExports.generals_mappedimage_image_height(index);
}

const first = imageSummary(0);
const last = imageSummary(mappedImageExports.generals_mappedimage_image_count() - 1);
const ruler = findImage("Ruler-Right End");
const observer = findImage("SSObserverUSA");
const purchasePower = findImage("GeneralsPowerWindow_American");
const summary = {
  archive: archivePath,
  entryCount: mappedEntries.length,
  sourceBytes,
  combinedBytes: combinedBytes.length,
  parsedCount,
  imageCount: mappedImageExports.generals_mappedimage_image_count(),
  fieldCount: mappedImageExports.generals_mappedimage_field_count(),
  textureAssignments: mappedImageExports.generals_mappedimage_texture_assignment_count(),
  texturePages: texturePages.size,
  rotatedCount: mappedImageExports.generals_mappedimage_rotated_count(),
  rawTextureCount: mappedImageExports.generals_mappedimage_raw_texture_count(),
  noneStatusCount: mappedImageExports.generals_mappedimage_none_status_count(),
  totalArea,
  first,
  last,
  ruler,
  observer,
  purchasePower,
};

if (summary.entryCount !== 14 ||
    summary.sourceBytes !== 234435 ||
    summary.combinedBytes !== 234448 ||
    summary.parsedCount !== 1231 ||
    summary.imageCount !== 1231 ||
    summary.fieldCount !== 6155 ||
    summary.textureAssignments !== 1231 ||
    summary.texturePages !== 117 ||
    summary.rotatedCount !== 5 ||
    summary.rawTextureCount !== 0 ||
    summary.noneStatusCount !== 1226 ||
    summary.totalArea !== 27265376) {
  throw new Error(`unexpected mapped image aggregate parse: ${JSON.stringify(summary)}`);
}

if (summary.first.name !== "LoadPageHuge" ||
    summary.first.texture !== "loadpageuserinterface.tga" ||
    summary.first.textureWidth !== 1024 ||
    summary.first.textureHeight !== 1024 ||
    summary.first.left !== 0 ||
    summary.first.top !== 0 ||
    summary.first.right !== 799 ||
    summary.first.bottom !== 599 ||
    summary.first.width !== 799 ||
    summary.first.height !== 599 ||
    summary.first.status !== "NONE" ||
    summary.last.name !== "SSToxinShells" ||
    summary.last.texture !== "SUUserInterface512_004.tga" ||
    summary.last.width !== 60 ||
    summary.last.height !== 48 ||
    summary.last.status !== "NONE") {
  throw new Error(`unexpected mapped image first/last parse: ${JSON.stringify(summary)}`);
}

if (summary.ruler.texture !== "SCShellUserInterface512_001.tga" ||
    summary.ruler.width !== 1 ||
    summary.ruler.height !== 10 ||
    summary.observer.texture !== "SSUserInterface512_001.tga" ||
    summary.observer.status !== "ROTATED_90_CLOCKWISE" ||
    summary.observer.statusMask !== 1 ||
    summary.observer.width !== 24 ||
    summary.observer.height !== 22 ||
    summary.purchasePower.texture !== "SCPurchasePowers512_001.tga" ||
    summary.purchasePower.width !== 392 ||
    summary.purchasePower.height !== 430) {
  throw new Error(`unexpected mapped image sample parse: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
