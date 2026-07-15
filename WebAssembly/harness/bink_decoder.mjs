const MANAGED_SOURCE_PATTERN = /^(cnc-library\/install-[a-z0-9-]+|cnc-archives\/ns-[a-z0-9-]+)\/movies\/([A-Za-z0-9_.-]+\.bik)$/i;
const CLASSIC_BINK_SIGNATURES = new Set(["BIKb", "BIKf", "BIKg", "BIKh", "BIKi", "BIKk"]);

export function browserBinkDecoderSupport(scope = globalThis) {
  const missing = [];
  if (typeof scope.Worker !== "function") missing.push("Web Workers");
  if (typeof scope.WebAssembly !== "object") missing.push("WebAssembly");
  if (typeof scope.crypto?.subtle?.digest !== "function") missing.push("Web Crypto");
  if (typeof scope.navigator?.storage?.getDirectory !== "function") missing.push("browser storage");
  return missing.length === 0
    ? { available: true, reason: null }
    : { available: false, reason: `On-device Bink decoding requires ${missing.join(", ")}.` };
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
  if (bytes.byteLength < 44) throw new Error("Video source has a truncated Bink header");
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  if (!CLASSIC_BINK_SIGNATURES.has(signature)) {
    throw new Error(signature.startsWith("KB2")
      ? "Bink 2 movies are not supported by the compact decoder"
      : "Video source is not a supported classic Bink file");
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
    signature,
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

async function directoryAndName(path) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Invalid managed video path: ${path}`);
  }
  let directory = await navigator.storage.getDirectory();
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: false });
  return { directory, name };
}

async function readFile(path) {
  const { directory, name } = await directoryAndName(path);
  return (await directory.getFileHandle(name, { create: false })).getFile();
}

function sourceNameFromPayload(payload) {
  return String(payload?.sourcePath ?? "").replaceAll("\\", "/").split("/").pop().toLowerCase();
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason : new DOMException("Movie decoding was cancelled", "AbortError");
}

export function createBinkDecoderSourceRegistry({ log = () => {} } = {}) {
  const sources = new Map();

  function registerSources(entries = []) {
    sources.clear();
    for (const entry of entries) {
      const name = String(entry?.name ?? "").toLowerCase();
      const path = String(entry?.opfsPath ?? "");
      const match = path.match(MANAGED_SOURCE_PATTERN);
      if (!/^[A-Za-z0-9_.-]+\.bik$/i.test(name) || !match
          || match[2].toLowerCase() !== name
          || !Number.isSafeInteger(Number(entry?.bytes)) || Number(entry.bytes) <= 44) {
        throw new Error(`Invalid installed Bink source: ${entry?.name ?? "unnamed"}`);
      }
      sources.set(name, { ...entry, name, opfsPath: path });
    }
  }

  async function sourceFor(payload, { signal } = {}) {
    throwIfAborted(signal);
    const name = sourceNameFromPayload(payload);
    const descriptor = sources.get(name);
    if (!descriptor) throw new Error(`Installed Bink source is unavailable: ${name || "unnamed movie"}`);
    const file = await readFile(descriptor.opfsPath);
    if (file.size !== Number(descriptor.bytes)) throw new Error(`Installed Bink source changed: ${descriptor.name}`);
    const source = await file.arrayBuffer();
    throwIfAborted(signal);
    const metadata = parseBrowserBinkHeader(source, source.byteLength);
    for (const field of ["frames", "width", "height", "fpsNum", "fpsDen"]) {
      if (Number(descriptor[field]) !== Number(metadata[field])) {
        throw new Error(`Installed Bink metadata changed for ${descriptor.name}: ${field}`);
      }
    }
    log("Bink source loaded", { name: descriptor.name, bytes: source.byteLength });
    return { source, metadata };
  }

  return {
    registerSources,
    sourceFor,
    snapshot: () => ({ registeredSources: sources.size }),
  };
}
