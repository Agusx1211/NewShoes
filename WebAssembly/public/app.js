const compressedLiteralSample = Uint8Array.from([
  0x10, 0xfb, 0x00, 0x00, 0x03, 0xff, 0x41, 0x42, 0x43,
]);

const elements = {
  status: document.querySelector("[data-status]"),
  module: document.querySelector("[data-module]"),
  compressed: document.querySelector("[data-compressed]"),
  decoded: document.querySelector("[data-decoded]"),
  consumed: document.querySelector("[data-consumed]"),
  bytes: document.querySelector("[data-bytes]"),
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

async function boot() {
  setStatus("loading", "loading");

  const response = await fetch("../dist/generals_refpack.wasm");
  if (!response.ok) {
    throw new Error(`wasm fetch failed: ${response.status}`);
  }

  const { instance } = await WebAssembly.instantiateStreaming(response, {});
  const exports = instance.exports;
  const memory = new Uint8Array(exports.memory.buffer);
  const inputOffset = exports.generals_refpack_input_ptr();
  const outputOffset = exports.generals_refpack_output_ptr();

  memory.set(compressedLiteralSample, inputOffset);

  const isRefPack = exports.generals_refpack_is(0);
  const expectedSize = exports.generals_refpack_size(0);
  const decodedSize = exports.generals_refpack_decode(0, 0);
  const consumedSize = exports.generals_refpack_last_consumed_size();
  const decodedBytes = memory.slice(outputOffset, outputOffset + decodedSize);
  const decodedText = new TextDecoder().decode(decodedBytes);

  if (isRefPack !== 1 || expectedSize !== 3 || decodedSize !== 3 || decodedText !== "ABC") {
    throw new Error("RefPack decode validation failed");
  }

  elements.module.textContent = `${exports.generals_refpack_input_capacity()} byte input / ${exports.generals_refpack_output_capacity()} byte output`;
  elements.compressed.textContent = `${compressedLiteralSample.length} bytes`;
  elements.decoded.textContent = `${decodedSize} bytes`;
  elements.consumed.textContent = `${consumedSize} bytes`;
  elements.bytes.textContent = hex(compressedLiteralSample);
  elements.output.textContent = decodedText;
  drawByteBars(compressedLiteralSample);
  setStatus("pass", "pass");
}

boot().catch((error) => {
  console.error(error);
  elements.output.textContent = error.message;
  setStatus("fail", "fail");
});
