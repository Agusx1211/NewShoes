const RUNTIME_MANIFEST_URL = new URL(
  "../video-runtime/ffmpeg-core-manifest.json",
  import.meta.url,
).href;

let corePromise = null;
let activeJob = null;

function postJob(jobId, type, data = {}) {
  self.postMessage({ jobId, type, ...data });
}

function hex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", value)));
}

async function fetchRuntimePart(baseUrl, part, index, count, jobId) {
  const url = new URL(String(part.name), baseUrl).href;
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Video decoder part ${index + 1} failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== Number(part.bytes)) {
    throw new Error(`Video decoder part ${index + 1} has the wrong size`);
  }
  if (await sha256(bytes) !== String(part.sha256)) {
    throw new Error(`Video decoder part ${index + 1} failed integrity validation`);
  }
  postJob(jobId, "progress", {
    phase: "runtime",
    progress: (index + 1) / count,
    detail: `Loading video decoder (${index + 1}/${count})`,
  });
  return bytes;
}

async function loadCore(jobId) {
  if (corePromise) return corePromise;
  corePromise = (async () => {
    const response = await fetch(RUNTIME_MANIFEST_URL, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Video decoder manifest failed (${response.status})`);
    const manifest = await response.json();
    if (manifest?.schema !== "cnc-zh-browser-video-runtime/v1"
        || manifest?.coreVersion !== "0.12.10"
        || manifest?.coreScript !== "ffmpeg-core.js"
        || !Array.isArray(manifest.wasmParts)
        || manifest.wasmParts.length < 2
        || manifest.wasmParts.some((part, index) =>
          part?.name !== `ffmpeg-core.wasm.part${index}`
          || !(Number(part?.bytes) > 0)
          || !/^[a-f0-9]{64}$/.test(String(part?.sha256)))) {
      throw new Error("Video decoder manifest is invalid");
    }
    const baseUrl = new URL(".", RUNTIME_MANIFEST_URL);
    const parts = [];
    for (let index = 0; index < manifest.wasmParts.length; index += 1) {
      parts.push(await fetchRuntimePart(
        baseUrl, manifest.wasmParts[index], index, manifest.wasmParts.length, jobId));
    }
    const totalBytes = parts.reduce((total, part) => total + part.byteLength, 0);
    if (totalBytes !== Number(manifest.wasmBytes)) {
      throw new Error("Video decoder payload has the wrong total size");
    }
    const wasmUrl = URL.createObjectURL(new Blob(parts, { type: "application/wasm" }));
    const coreUrl = new URL(String(manifest.coreScript), baseUrl).href;
    const createCore = (await import(coreUrl)).default;
    if (typeof createCore !== "function") throw new Error("Video decoder entry point is missing");
    const mainScriptUrlOrBlob = `${coreUrl}#${btoa(JSON.stringify({ wasmURL: wasmUrl }))}`;
    try {
      return await createCore({ mainScriptUrlOrBlob });
    } finally {
      URL.revokeObjectURL(wasmUrl);
    }
  })().catch((error) => {
    corePromise = null;
    throw error;
  });
  return corePromise;
}

function safeUnlink(core, path) {
  try { core.FS.unlink(path); } catch { /* optional output may not exist */ }
}

function execute(core, args) {
  core.setTimeout(-1);
  core.exec(...args);
  const result = Number(core.ret);
  core.reset();
  return result;
}

async function transcode(message) {
  const jobId = String(message.jobId ?? "");
  if (!jobId || activeJob) throw new Error("Video decoder received an invalid concurrent job");
  const source = message.source instanceof Uint8Array
    ? message.source : new Uint8Array(message.source ?? 0);
  if (source.byteLength <= 44) throw new Error("Bink source is empty");
  activeJob = jobId;
  const core = await loadCore(jobId);
  const inputName = `input-${jobId}.bik`;
  const videoName = `video-${jobId}.webm`;
  const audioName = `audio-${jobId}.wav`;
  let phase = "video";
  core.setLogger(({ message: detail }) => postJob(jobId, "log", { detail }));
  core.setProgress(({ progress, time }) => postJob(jobId, "progress", {
    phase,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null,
    mediaTime: Number(time ?? 0),
    detail: phase === "video" ? "Preparing browser video" : "Preparing movie audio",
  }));
  try {
    core.FS.writeFile(inputName, source);
    const videoResult = execute(core, [
      "-nostdin", "-y", "-threads", "1", "-i", inputName,
      "-map", "0:v:0", "-an",
      "-c:v", "libvpx", "-pix_fmt", "yuv420p",
      "-deadline", "realtime", "-cpu-used", "8",
      "-b:v", "256k", "-crf", "36", "-threads", "1",
      videoName,
    ]);
    if (videoResult !== 0) throw new Error(`Bink video conversion failed (${videoResult})`);
    const video = core.FS.readFile(videoName).slice();
    if (video.byteLength < 64) throw new Error("Bink video conversion produced an empty movie");

    let audio = null;
    if (message.hasAudio === true) {
      phase = "audio";
      const audioResult = execute(core, [
        "-nostdin", "-y", "-threads", "1", "-i", inputName,
        "-vn", "-c:a", "pcm_s16le", audioName,
      ]);
      if (audioResult !== 0) throw new Error(`Bink audio conversion failed (${audioResult})`);
      audio = core.FS.readFile(audioName).slice();
      if (audio.byteLength < 44) throw new Error("Bink audio conversion produced an empty stream");
    }
    const transfer = [video.buffer];
    if (audio) transfer.push(audio.buffer);
    self.postMessage({ jobId, type: "result", video, audio }, transfer);
  } finally {
    safeUnlink(core, inputName);
    safeUnlink(core, videoName);
    safeUnlink(core, audioName);
    activeJob = null;
  }
}

self.onmessage = (event) => {
  const message = event.data ?? {};
  if (message.type !== "transcode") return;
  transcode(message).catch((error) => {
    activeJob = null;
    postJob(String(message.jobId ?? ""), "error", {
      error: error?.message ?? String(error),
    });
  });
};
