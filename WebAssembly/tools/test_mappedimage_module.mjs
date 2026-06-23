import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_mappedimage.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
MappedImage Ruler-Right End
  Texture = SCShellUserInterface512_001.tga
  TextureWidth = 512
  TextureHeight = 512
  Coords = Left:489 Top:83 Right:490 Bottom:93
  Status = NONE
End

MappedImage SSObserverUSA
  Texture = SSUserInterface512_001.tga
  TextureWidth = 512
  TextureHeight = 512
  Coords = Left:489 Top:53 Right:511 Bottom:77
  Status = ROTATED_90_CLOCKWISE
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_mappedimage_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_mappedimage_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_mappedimage_input_ptr());
const imageCount = exports.generals_mappedimage_parse(bytes.length);
if (imageCount < 0 || exports.generals_mappedimage_error_count() !== 0) {
  throw new Error(`MappedImage parse failed: parsed=${imageCount}, errors=${exports.generals_mappedimage_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function imageString(prefix, index) {
  return readString(
    exports[`generals_mappedimage_${prefix}_ptr`](index),
    exports[`generals_mappedimage_${prefix}_size`](index)
  );
}

if (imageCount !== 2 ||
    exports.generals_mappedimage_image_count() !== 2 ||
    exports.generals_mappedimage_field_count() !== 10 ||
    exports.generals_mappedimage_texture_assignment_count() !== 2 ||
    exports.generals_mappedimage_none_status_count() !== 1 ||
    exports.generals_mappedimage_rotated_count() !== 1 ||
    exports.generals_mappedimage_raw_texture_count() !== 0) {
  throw new Error("unexpected mapped image aggregate parse");
}

if (imageString("name", 0) !== "Ruler-Right End" ||
    imageString("texture", 0) !== "SCShellUserInterface512_001.tga" ||
    imageString("status_raw", 0) !== "NONE" ||
    exports.generals_mappedimage_texture_width(0) !== 512 ||
    exports.generals_mappedimage_texture_height(0) !== 512 ||
    exports.generals_mappedimage_left(0) !== 489 ||
    exports.generals_mappedimage_top(0) !== 83 ||
    exports.generals_mappedimage_right(0) !== 490 ||
    exports.generals_mappedimage_bottom(0) !== 93 ||
    exports.generals_mappedimage_image_width(0) !== 1 ||
    exports.generals_mappedimage_image_height(0) !== 10 ||
    exports.generals_mappedimage_status_mask(0) !== 0 ||
    imageString("name", 1) !== "SSObserverUSA" ||
    imageString("status_raw", 1) !== "ROTATED_90_CLOCKWISE" ||
    exports.generals_mappedimage_image_width(1) !== 24 ||
    exports.generals_mappedimage_image_height(1) !== 22 ||
    exports.generals_mappedimage_status_mask(1) !== 1) {
  throw new Error("unexpected mapped image parsed values");
}

console.log(JSON.stringify({
  module: wasmPath,
  images: exports.generals_mappedimage_image_count(),
  fields: exports.generals_mappedimage_field_count(),
  rotated: exports.generals_mappedimage_rotated_count(),
  first: imageString("name", 0),
}, null, 2));
