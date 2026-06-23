import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_video.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
Video Sizzle
  Filename = sizzle_review ; native line comment
  Comment = This is the EA logo screen
End

Video VSSmall
  Filename = VS_small
  Comment = "VS" logo, in flames ; comment after quoted text
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_video_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_video_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_video_input_ptr());
const videoCount = exports.generals_video_parse(bytes.length);
if (videoCount < 0 || exports.generals_video_error_count() !== 0) {
  throw new Error(`Video parse failed: parsed=${videoCount}, errors=${exports.generals_video_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function videoString(prefix, index) {
  return readString(
    exports[`generals_video_${prefix}_ptr`](index),
    exports[`generals_video_${prefix}_size`](index)
  );
}

if (videoCount !== 2 ||
    exports.generals_video_count() !== 2 ||
    exports.generals_video_field_count() !== 4 ||
    exports.generals_video_field_count_at(0) !== 2 ||
    exports.generals_video_field_count_at(1) !== 2) {
  throw new Error("unexpected Video aggregate parse");
}

if (videoString("name", 0) !== "Sizzle" ||
    videoString("filename", 0) !== "sizzle_review" ||
    videoString("comment", 0) !== "This is the EA logo screen" ||
    videoString("name", 1) !== "VSSmall" ||
    videoString("filename", 1) !== "VS_small" ||
    videoString("comment", 1) !== "\"VS\" logo, in flames") {
  throw new Error("unexpected Video parsed values");
}

console.log(JSON.stringify({
  module: wasmPath,
  videos: exports.generals_video_count(),
  fields: exports.generals_video_field_count(),
  first: videoString("name", 0),
}, null, 2));
