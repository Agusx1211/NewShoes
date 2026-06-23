import { createBigArchiveSample, createRefPackLiteralSample } from "./fixtures.js";

const compressedLiteralSample = createRefPackLiteralSample();
const bigArchiveSample = createBigArchiveSample();

const elements = {
  status: document.querySelector("[data-status]"),
  module: document.querySelector("[data-module]"),
  compressed: document.querySelector("[data-compressed]"),
  decoded: document.querySelector("[data-decoded]"),
  consumed: document.querySelector("[data-consumed]"),
  bigFiles: document.querySelector("[data-big-files]"),
  bigBytes: document.querySelector("[data-big-bytes]"),
  bigFirst: document.querySelector("[data-big-first]"),
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
  const decodedText = new TextDecoder().decode(decodedBytes);

  if (isRefPack !== 1 || expectedSize !== 3 || decodedSize !== 3 || decodedText !== "ABC") {
    throw new Error("RefPack decode validation failed");
  }

  const bigModule = await loadWasm("../dist/generals_big.wasm");
  const bigExports = bigModule.instance.exports;
  const bigMemory = new Uint8Array(bigExports.memory.buffer);
  const bigInputOffset = bigExports.generals_big_input_ptr();
  bigMemory.set(bigArchiveSample.archive, bigInputOffset);

  const isBig = bigExports.generals_big_is(bigArchiveSample.archive.length);
  const bigFileCount = bigExports.generals_big_parse(bigArchiveSample.archive.length);

  if (isBig !== 1 || bigFileCount !== bigArchiveSample.files.length) {
    throw new Error("BIG archive validation failed");
  }

  const bigEntries = [];
  for (let index = 0; index < bigFileCount; ++index) {
    const namePtr = bigExports.generals_big_entry_name_ptr(index);
    const nameSize = bigExports.generals_big_entry_name_size(index);
    const dataSize = bigExports.generals_big_entry_data_size(index);
    const name = new TextDecoder().decode(bigMemory.slice(namePtr, namePtr + nameSize));
    bigEntries.push(`${name} (${dataSize} bytes)`);
  }

  if (bigEntries[0] !== "data/ini/gamedata.ini (15 bytes)") {
    throw new Error("BIG archive entry validation failed");
  }

  elements.module.textContent = `${refpackExports.generals_refpack_input_capacity() / 1024} KiB input / ${refpackExports.generals_refpack_output_capacity() / 1024} KiB output`;
  elements.compressed.textContent = `${compressedLiteralSample.length} bytes`;
  elements.decoded.textContent = `${decodedSize} bytes`;
  elements.consumed.textContent = `${consumedSize} bytes`;
  elements.bigFiles.textContent = `${bigFileCount} files`;
  elements.bigBytes.textContent = `${bigArchiveSample.archive.length} bytes`;
  elements.bigFirst.textContent = bigArchiveSample.files[0].name;
  elements.bytes.textContent = hex(compressedLiteralSample);
  elements.bigListing.textContent = bigEntries.join("\n");
  elements.output.textContent = decodedText;
  drawByteBars(compressedLiteralSample);
  setStatus("pass", "pass");
}

boot().catch((error) => {
  console.error(error);
  elements.output.textContent = error.message;
  setStatus("fail", "fail");
});
