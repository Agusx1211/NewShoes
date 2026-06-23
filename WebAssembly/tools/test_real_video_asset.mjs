import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const videoWasmPath = resolve(wasmDir, "dist/generals_video.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, videoWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(videoWasmPath),
  readFile(archivePath),
]);
const [bigModule, videoModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(videoWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const videoExports = videoModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const videoMemory = new Uint8Array(videoExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readVideoString(ptr, size) {
  return ptr ? textDecoder.decode(videoMemory.slice(ptr, ptr + size)) : "";
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

const videoBytes = entryBytes("data/ini/video.ini");
if (videoBytes.length > videoExports.generals_video_input_capacity()) {
  throw new Error(`Video payload exceeds ${videoExports.generals_video_input_capacity()} byte wasm buffer`);
}

videoMemory.set(videoBytes, videoExports.generals_video_input_ptr());
const parsedCount = videoExports.generals_video_parse(videoBytes.length);
if (parsedCount < 0 || videoExports.generals_video_error_count() !== 0) {
  throw new Error(`Video parse failed: parsed=${parsedCount}, errors=${videoExports.generals_video_error_count()}`);
}

function videoString(prefix, index) {
  return readVideoString(
    videoExports[`generals_video_${prefix}_ptr`](index),
    videoExports[`generals_video_${prefix}_size`](index)
  );
}

function videoSummary(index) {
  return {
    index,
    name: videoString("name", index),
    filename: videoString("filename", index),
    comment: videoString("comment", index),
    line: videoExports.generals_video_line(index),
    fields: videoExports.generals_video_field_count_at(index),
  };
}

function findVideo(name) {
  for (let index = 0; index < videoExports.generals_video_count(); ++index) {
    if (videoString("name", index) === name) {
      return videoSummary(index);
    }
  }

  throw new Error(`Video not found: ${name}`);
}

const first = videoSummary(0);
const last = videoSummary(videoExports.generals_video_count() - 1);
const vsSmall = findVideo("VSSmall");
const thraxLeft = findVideo("PortraitDrThraxLeft");
const usa05 = findVideo("MD_USA05");
const summary = {
  archive: archivePath,
  videoBytes: videoBytes.length,
  parsedCount,
  videoCount: videoExports.generals_video_count(),
  fieldCount: videoExports.generals_video_field_count(),
  lineCount: videoExports.generals_video_line_count(),
  first,
  last,
  vsSmall,
  thraxLeft,
  usa05,
};

if (summary.videoBytes !== 4959 ||
    summary.parsedCount !== 41 ||
    summary.videoCount !== 41 ||
    summary.fieldCount !== 82 ||
    summary.lineCount !== 212) {
  throw new Error(`unexpected Video aggregate parse: ${JSON.stringify(summary)}`);
}

if (first.name !== "Sizzle" ||
    first.filename !== "sizzle_review" ||
    first.comment !== "This is the EA logo screen" ||
    first.line !== 4 ||
    first.fields !== 2 ||
    vsSmall.filename !== "VS_small" ||
    vsSmall.comment !== "\"VS\" logo, in flames" ||
    thraxLeft.filename !== "Comp_ThraxGen_000" ||
    thraxLeft.comment !== "portrait transition for Generals Challenge load screen" ||
    usa05.filename !== "MD_USA05_0" ||
    usa05.comment !== "campaign transition movie" ||
    last.name !== "MD_USA05" ||
    last.filename !== "MD_USA05_0") {
  throw new Error(`unexpected Video sample parse: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
