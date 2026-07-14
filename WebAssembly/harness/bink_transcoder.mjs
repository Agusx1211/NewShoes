const MANAGED_SOURCE_PATTERN = /^(cnc-library\/install-[a-z0-9-]+|cnc-archives\/ns-[a-z0-9-]+)\/movies\/([A-Za-z0-9_.-]+\.bik)$/i;

export function browserBinkTranscodeSupport(scope = globalThis) {
  const missing = [];
  if (typeof scope.Worker !== "function") missing.push("Web Workers");
  if (typeof scope.WebAssembly !== "object") missing.push("WebAssembly");
  if (typeof scope.crypto?.subtle?.digest !== "function") missing.push("Web Crypto");
  if (typeof scope.navigator?.storage?.getDirectory !== "function") missing.push("browser storage");
  if (typeof scope.URL?.createObjectURL !== "function") missing.push("local media URLs");
  return missing.length === 0
    ? { available: true, reason: null }
    : { available: false, reason: `On-device video preparation requires ${missing.join(", ")}.` };
}

function u32(bytes, offset) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function parseBrowserBinkHeader(value, fileSize = value?.byteLength ?? 0) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value ?? 0);
  if (bytes.byteLength < 44
      || bytes[0] !== 0x42 || bytes[1] !== 0x49 || bytes[2] !== 0x4b) {
    throw new Error("Video source is not a supported classic Bink file");
  }
  const frames = u32(bytes, 8);
  const width = u32(bytes, 20);
  const height = u32(bytes, 24);
  const fpsNum = u32(bytes, 28);
  const fpsDen = u32(bytes, 32);
  const sizeField = u32(bytes, 4);
  if (fileSize <= 44 || sizeField !== fileSize - 8 || frames === 0
      || u32(bytes, 16) !== frames || width === 0 || height === 0
      || fpsNum === 0 || fpsDen === 0) {
    throw new Error("Video source has an invalid Bink header");
  }
  return {
    signature: `BIK${String.fromCharCode(bytes[3])}`,
    headerHex: bytesToHex(bytes.subarray(0, 44)),
    frames,
    width,
    height,
    fpsNum,
    fpsDen,
    durationSeconds: frames * fpsDen / fpsNum,
    audioTracks: u32(bytes, 40),
  };
}

async function directoryAndName(path, { create = false } = {}) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Invalid managed video path: ${path}`);
  }
  let directory = await navigator.storage.getDirectory();
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return { directory, name };
}

async function readFile(path) {
  const { directory, name } = await directoryAndName(path);
  return (await directory.getFileHandle(name, { create: false })).getFile();
}

async function readOptionalFile(path) {
  try { return await readFile(path); } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

async function writeFile(path, bytes) {
  const { directory, name } = await directoryAndName(path, { create: true });
  const handle = await directory.getFileHandle(name, { create: true });
  const writer = await handle.createWritable({ keepExistingData: false });
  try {
    await writer.write(bytes);
    await writer.close();
  } catch (error) {
    try { await writer.abort(); } catch { /* already closed */ }
    try { await directory.removeEntry(name); } catch { /* partial file cleanup */ }
    throw error;
  }
  const stored = await handle.getFile();
  if (stored.size !== bytes.byteLength) {
    try { await directory.removeEntry(name); } catch { /* failed output stays invalid */ }
    throw new Error(`Prepared video cache write was incomplete: ${name}`);
  }
  return stored;
}

async function digestBytes(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", value))).slice(0, 20);
}

function sourceNameFromPayload(payload) {
  return String(payload?.sourcePath ?? "").replaceAll("\\", "/").split("/").pop().toLowerCase();
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason : new DOMException("Movie preparation was cancelled", "AbortError");
}

class TranscodeWorker {
  constructor({ onProgress, log }) {
    this.onProgress = onProgress;
    this.log = log;
    this.worker = null;
    this.pending = null;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./bink_transcode_worker.mjs", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => this.handleMessage(event.data ?? {});
    worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || "Video preparation worker crashed"));
    };
    worker.onmessageerror = () => this.fail(new Error("Video preparation worker returned unreadable data"));
    this.worker = worker;
    return worker;
  }

  handleMessage(message) {
    if (!this.pending || message.jobId !== this.pending.jobId) return;
    if (message.type === "progress") {
      this.onProgress?.(message);
    } else if (message.type === "log") {
      this.log?.("Bink transcode", { detail: message.detail });
    } else if (message.type === "error") {
      this.fail(new Error(message.error || "Video preparation failed"), false);
    } else if (message.type === "result") {
      const { resolve, cleanup } = this.pending;
      this.pending = null;
      cleanup();
      resolve({ video: message.video, audio: message.audio ?? null });
    }
  }

  fail(error, terminate = true) {
    const pending = this.pending;
    this.pending = null;
    if (terminate) {
      this.worker?.terminate();
      this.worker = null;
    }
    if (pending) {
      pending.cleanup();
      pending.reject(error);
    }
  }

  transcode({ source, hasAudio, signal }) {
    if (this.pending) return Promise.reject(new Error("Another movie is already being prepared"));
    try {
      throwIfAborted(signal);
    } catch (error) {
      return Promise.reject(error);
    }
    const jobId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const onAbort = () => this.fail(new DOMException("Movie preparation was cancelled", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      this.pending = { jobId, resolve, reject, cleanup };
      try {
        this.ensureWorker().postMessage({
          type: "transcode",
          jobId,
          source: new Uint8Array(source),
          hasAudio,
        }, [source]);
      } catch (error) {
        this.fail(error);
      }
    });
  }

  cancel() {
    if (!this.pending) return false;
    this.fail(new DOMException("Movie preparation was cancelled", "AbortError"));
    return true;
  }

  shutdown() {
    if (!this.cancel()) {
      this.worker?.terminate();
      this.worker = null;
    }
  }
}

export function createBinkTranscoder({ onProgress, log = () => {} } = {}) {
  const sources = new Map();
  const inFlight = new Map();
  const worker = new TranscodeWorker({ onProgress, log });

  function registerSources(descriptors = []) {
    sources.clear();
    for (const descriptor of descriptors) {
      const name = String(descriptor?.name ?? "");
      const opfsPath = String(descriptor?.opfsPath ?? "").replace(/^\/+/, "");
      const match = MANAGED_SOURCE_PATTERN.exec(opfsPath);
      if (!/^[A-Za-z0-9_.-]+\.bik$/i.test(name)
          || match?.[2]?.toLowerCase() !== name.toLowerCase()) continue;
      sources.set(name.toLowerCase(), { ...descriptor, name, opfsPath, storageRoot: match[1] });
    }
  }

  async function prepare(descriptor, signal) {
    throwIfAborted(signal);
    const sourceFile = await readFile(descriptor.opfsPath);
    if (sourceFile.size !== Number(descriptor.bytes)) {
      throw new Error(`${descriptor.name} changed after library preparation`);
    }
    const header = parseBrowserBinkHeader(
      new Uint8Array(await sourceFile.slice(0, 44).arrayBuffer()), sourceFile.size);
    if (header.headerHex !== descriptor.headerHex
        || header.frames !== Number(descriptor.frames)
        || header.width !== Number(descriptor.width)
        || header.height !== Number(descriptor.height)) {
      throw new Error(`${descriptor.name} no longer matches its prepared metadata`);
    }
    const source = await sourceFile.arrayBuffer();
    const fingerprint = await digestBytes(source);
    throwIfAborted(signal);
    const stem = descriptor.name.replace(/\.bik$/i, "").toLowerCase();
    const cacheRoot = `${descriptor.storageRoot}/browser-video`;
    const videoPath = `${cacheRoot}/${stem}-${fingerprint}.webm`;
    const audioPath = `${cacheRoot}/${stem}-${fingerprint}.wav`;
    const cachedVideo = await readOptionalFile(videoPath);
    const cachedAudio = header.audioTracks > 0 ? await readOptionalFile(audioPath) : null;
    if (cachedVideo?.size > 64 && (header.audioTracks === 0 || cachedAudio?.size > 44)) {
      return { videoFile: cachedVideo, audioFile: cachedAudio, cached: true };
    }
    onProgress?.({ phase: "source", progress: 0, detail: `Reading ${descriptor.name}` });
    const output = await worker.transcode({
      source,
      hasAudio: header.audioTracks > 0,
      signal,
    });
    throwIfAborted(signal);
    const videoFile = await writeFile(videoPath, output.video);
    const audioFile = output.audio ? await writeFile(audioPath, output.audio) : null;
    return { videoFile, audioFile, cached: false };
  }

  async function mediaFor(payload, { signal } = {}) {
    const name = sourceNameFromPayload(payload);
    const descriptor = sources.get(name);
    if (!descriptor) return null;
    let pending = inFlight.get(name);
    if (!pending) {
      pending = prepare(descriptor, signal).finally(() => inFlight.delete(name));
      inFlight.set(name, pending);
    }
    const prepared = await pending;
    const videoUrl = URL.createObjectURL(prepared.videoFile);
    const audioUrl = prepared.audioFile ? URL.createObjectURL(prepared.audioFile) : null;
    return {
      videoUrl,
      audioUrl,
      videoOnly: true,
      cached: prepared.cached,
      revoke() {
        URL.revokeObjectURL(videoUrl);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
      },
    };
  }

  return {
    registerSources,
    mediaFor,
    cancelActive: () => worker.cancel(),
    shutdown() {
      sources.clear();
      inFlight.clear();
      worker.shutdown();
    },
  };
}
