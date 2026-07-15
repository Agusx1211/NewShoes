const DECODER_MANIFEST_URL = new URL(
  "../video-runtime/bink-decoder-manifest.json",
  import.meta.url,
).href;
const MAX_DECODER_BYTES = 128 * 1024;
const REQUIRED_EXPORTS = [
  "memory",
  "bink_decoder_abi_version",
  "bink_decoder_alloc",
  "bink_decoder_free_input",
  "bink_decoder_open",
  "bink_decoder_close",
  "bink_decoder_decode_next",
  "bink_decoder_seek",
  "bink_decoder_width",
  "bink_decoder_height",
  "bink_decoder_frame_count",
  "bink_decoder_frame_duration_us",
  "bink_decoder_frame_number",
  "bink_decoder_frame_pointer",
  "bink_decoder_frame_length",
  "bink_decoder_audio_pointer",
  "bink_decoder_audio_length",
  "bink_decoder_audio_channels",
  "bink_decoder_audio_sample_rate",
];

let decoderPromise = null;
let decoder = null;

function hex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadDecoder() {
  if (decoderPromise) return decoderPromise;
  decoderPromise = (async () => {
    const manifestResponse = await fetch(DECODER_MANIFEST_URL, { cache: "no-store" });
    if (!manifestResponse.ok) throw new Error(`decoder manifest failed (${manifestResponse.status})`);
    const manifest = await manifestResponse.json();
    if (manifest?.schema !== "cnc-zh-bink-decoder-runtime/v1"
        || manifest?.abiVersion !== 1
        || manifest?.wasmFile !== "bink-decoder.wasm"
        || !(Number(manifest?.wasmBytes) > 0)
        || Number(manifest.wasmBytes) > MAX_DECODER_BYTES
        || !/^[a-f0-9]{64}$/.test(String(manifest?.wasmSha256))) {
      throw new Error("decoder manifest is invalid");
    }
    const response = await fetch(new URL(manifest.wasmFile, DECODER_MANIFEST_URL), { cache: "force-cache" });
    if (!response.ok) throw new Error(`decoder module failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    if (bytes.byteLength !== manifest.wasmBytes || digest !== manifest.wasmSha256) {
      throw new Error("decoder module failed integrity validation");
    }
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports;
    for (const name of REQUIRED_EXPORTS) {
      if (!(name in exports)) throw new Error(`decoder module has no ${name} export`);
    }
    if (exports.bink_decoder_abi_version() !== manifest.abiVersion) {
      throw new Error("decoder ABI version does not match its manifest");
    }
    return { exports, manifest };
  })();
  try {
    return await decoderPromise;
  } catch (error) {
    decoderPromise = null;
    throw error;
  }
}

function decodedMessage(exports, generation) {
  const frameLength = Number(exports.bink_decoder_frame_length());
  const framePointer = Number(exports.bink_decoder_frame_pointer());
  const width = Number(exports.bink_decoder_width());
  const height = Number(exports.bink_decoder_height());
  if (frameLength !== width * height * 4 || framePointer <= 0) {
    throw new Error("decoder returned invalid frame storage");
  }
  const bytes = new Uint8Array(frameLength);
  bytes.set(new Uint8Array(exports.memory.buffer, framePointer, frameLength));

  const audioLength = Number(exports.bink_decoder_audio_length());
  const audioPointer = Number(exports.bink_decoder_audio_pointer());
  let audio = null;
  if (audioLength > 0) {
    if (audioPointer <= 0) throw new Error("decoder returned invalid audio storage");
    audio = new Int16Array(audioLength);
    audio.set(new Int16Array(exports.memory.buffer, audioPointer, audioLength));
  }
  return {
    type: "frame",
    generation,
    frameNum: Number(exports.bink_decoder_frame_number()),
    width,
    height,
    frameDurationUs: Number(exports.bink_decoder_frame_duration_us()),
    bytes,
    audio,
    audioChannels: Number(exports.bink_decoder_audio_channels()),
    audioSampleRate: Number(exports.bink_decoder_audio_sample_rate()),
  };
}

async function open(source, generation) {
  const runtime = await loadDecoder();
  const exports = runtime.exports;
  exports.bink_decoder_close();
  decoder = null;
  const input = source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source ?? 0);
  if (input.byteLength <= 44) throw new Error("Bink source is empty");
  const pointer = Number(exports.bink_decoder_alloc(input.byteLength));
  if (pointer <= 0) throw new Error("Bink input allocation failed");
  let consumed = false;
  try {
    new Uint8Array(exports.memory.buffer, pointer, input.byteLength).set(input);
    const status = exports.bink_decoder_open(pointer, input.byteLength);
    consumed = true;
    if (status !== 1) throw new Error(`Bink open failed (${status})`);
  } finally {
    if (!consumed) exports.bink_decoder_free_input(pointer, input.byteLength);
  }
  decoder = runtime;
  postMessage({
    type: "ready",
    generation,
    abiVersion: runtime.manifest.abiVersion,
    decoderBytes: runtime.manifest.wasmBytes,
    width: Number(exports.bink_decoder_width()),
    height: Number(exports.bink_decoder_height()),
    frames: Number(exports.bink_decoder_frame_count()),
    frameDurationUs: Number(exports.bink_decoder_frame_duration_us()),
  });
}

function decode(generation, seekFrame = 0) {
  if (!decoder) throw new Error("Bink decoder is not open");
  const exports = decoder.exports;
  const status = seekFrame > 0
    ? exports.bink_decoder_seek(seekFrame)
    : exports.bink_decoder_decode_next();
  if (status === 0) {
    postMessage({ type: "end", generation });
    return;
  }
  if (status !== 1) throw new Error(`Bink frame decode failed (${status})`);
  const message = decodedMessage(exports, generation);
  const transfer = [message.bytes.buffer];
  if (message.audio) transfer.push(message.audio.buffer);
  postMessage(message, transfer);
}

self.onmessage = async (event) => {
  const message = event.data ?? {};
  try {
    if (message.type === "open") await open(message.source, message.generation);
    else if (message.type === "decode") decode(message.generation);
    else if (message.type === "seek") decode(message.generation, Number(message.frameNum) >>> 0);
    else if (message.type === "close") {
      decoder?.exports?.bink_decoder_close();
      decoder = null;
      close();
    }
  } catch (error) {
    postMessage({
      type: "error",
      generation: message.generation,
      error: error?.message ?? String(error),
    });
  }
};
