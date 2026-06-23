import { createBigArchiveSample, createRefPackLiteralSample } from "./fixtures.js";

const compressedLiteralSample = createRefPackLiteralSample();
const bigArchiveSample = createBigArchiveSample();
const textDecoder = new TextDecoder();
let bigRuntime = null;

const elements = {
  status: document.querySelector("[data-status]"),
  module: document.querySelector("[data-module]"),
  compressed: document.querySelector("[data-compressed]"),
  decoded: document.querySelector("[data-decoded]"),
  consumed: document.querySelector("[data-consumed]"),
  bigFiles: document.querySelector("[data-big-files]"),
  bigBytes: document.querySelector("[data-big-bytes]"),
  bigFirst: document.querySelector("[data-big-first]"),
  bigFile: document.querySelector("[data-big-file]"),
  bytes: document.querySelector("[data-bytes]"),
  bigListing: document.querySelector("[data-big-listing]"),
  output: document.querySelector("[data-output]"),
  canvas: document.querySelector("canvas"),
};

function setStatus(text, state) {
  elements.status.textContent = text;
  elements.status.dataset.state = state;
  document.body.dataset.validation = state;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function drawByteBars(bytes) {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111827";
  context.fillRect(0, 0, width, height);

  bytes.forEach((byte, index) => {
    const barWidth = width / bytes.length;
    const barHeight = Math.max(18, (byte / 255) * (height - 24));
    const x = index * barWidth;
    const y = height - barHeight;
    context.fillStyle = index < 5 ? "#38bdf8" : "#f59e0b";
    context.fillRect(x + 3, y, Math.max(4, barWidth - 6), barHeight);
  });
}

async function loadWasm(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`wasm fetch failed: ${response.status}`);
  }

  return WebAssembly.instantiateStreaming(response, {});
}

function parseBigArchive(archive, expectedFileCount = null) {
  const { exports, memory } = bigRuntime;
  const inputOffset = exports.generals_big_input_ptr();
  const capacity = exports.generals_big_input_capacity();

  if (archive.length > capacity) {
    throw new Error(`BIG archive exceeds ${capacity} byte wasm buffer`);
  }

  memory.set(archive, inputOffset);

  const isBig = exports.generals_big_is(archive.length);
  const fileCount = exports.generals_big_parse(archive.length);

  if (isBig !== 1 || fileCount < 0) {
    throw new Error("BIG archive validation failed");
  }

  if (expectedFileCount !== null && fileCount !== expectedFileCount) {
    throw new Error("BIG archive entry count validation failed");
  }

  const entries = [];
  for (let index = 0; index < fileCount; ++index) {
    const namePtr = exports.generals_big_entry_name_ptr(index);
    const nameSize = exports.generals_big_entry_name_size(index);
    const dataSize = exports.generals_big_entry_data_size(index);
    const name = textDecoder.decode(memory.slice(namePtr, namePtr + nameSize));
    entries.push({ name, dataSize });
  }

  return entries;
}

function renderBigArchive(archive, entries) {
  elements.bigFiles.textContent = `${entries.length} files`;
  elements.bigBytes.textContent = `${archive.length} bytes`;
  elements.bigFirst.textContent = entries[0]?.name ?? "empty";
  elements.bigListing.textContent = entries
    .slice(0, 16)
    .map((entry) => `${entry.name} (${entry.dataSize} bytes)`)
    .join("\n");
}

async function boot() {
  setStatus("loading", "loading");

  const refpackModule = await loadWasm("../dist/generals_refpack.wasm");
  const refpackExports = refpackModule.instance.exports;
  const refpackMemory = new Uint8Array(refpackExports.memory.buffer);
  const inputOffset = refpackExports.generals_refpack_input_ptr();
  const outputOffset = refpackExports.generals_refpack_output_ptr();

  refpackMemory.set(compressedLiteralSample, inputOffset);

  const isRefPack = refpackExports.generals_refpack_is(0);
  const expectedSize = refpackExports.generals_refpack_size(0);
  const decodedSize = refpackExports.generals_refpack_decode(0, 0);
  const consumedSize = refpackExports.generals_refpack_last_consumed_size();
  const decodedBytes = refpackMemory.slice(outputOffset, outputOffset + decodedSize);
  const decodedText = textDecoder.decode(decodedBytes);

  if (isRefPack !== 1 || expectedSize !== 3 || decodedSize !== 3 || decodedText !== "ABC") {
    throw new Error("RefPack decode validation failed");
  }

  const bigModule = await loadWasm("../dist/generals_big.wasm");
  const bigExports = bigModule.instance.exports;
  bigRuntime = {
    exports: bigExports,
    memory: new Uint8Array(bigExports.memory.buffer),
  };
  const bigEntries = parseBigArchive(bigArchiveSample.archive, bigArchiveSample.files.length);

  if (bigEntries[0]?.name !== "data/ini/gamedata.ini" || bigEntries[0]?.dataSize !== 15) {
    throw new Error("BIG archive entry validation failed");
  }

  elements.module.textContent = `${refpackExports.generals_refpack_input_capacity() / 1024} KiB input / ${refpackExports.generals_refpack_output_capacity() / 1024} KiB output`;
  elements.compressed.textContent = `${compressedLiteralSample.length} bytes`;
  elements.decoded.textContent = `${decodedSize} bytes`;
  elements.consumed.textContent = `${consumedSize} bytes`;
  elements.bytes.textContent = hex(compressedLiteralSample);
  elements.output.textContent = decodedText;
  renderBigArchive(bigArchiveSample.archive, bigEntries);
  drawByteBars(compressedLiteralSample);
  setStatus("pass", "pass");
}

elements.bigFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file || !bigRuntime) {
    return;
  }

  try {
    setStatus("loading", "loading");
    const archive = new Uint8Array(await file.arrayBuffer());
    const entries = parseBigArchive(archive);
    renderBigArchive(archive, entries);
    setStatus("pass", "pass");
  } catch (error) {
    console.error(error);
    elements.bigListing.textContent = error.message;
    setStatus("fail", "fail");
  }
});

boot().catch((error) => {
  console.error(error);
  elements.output.textContent = error.message;
  setStatus("fail", "fail");
});
