const CACHE_DB = "zeroh-retail-presentation";
const CACHE_STORE = "art";
const CACHE_VERSION = 1;
const ART_ARCHIVE = "EnglishZH.big";
const ART_PATH = "Data\\English\\Install_Final.bmp";
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ART_BYTES = 32 * 1024 * 1024;

function u16le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32le(bytes, offset) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function u32be(bytes, offset) {
  return ((bytes[offset] << 24)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]) >>> 0;
}

function ascii(bytes, start, length) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[start + index]);
  }
  return value;
}

function normalizedPath(value) {
  return String(value || "").replaceAll("/", "\\").toLowerCase();
}

async function bigEntry(file, requestedPath) {
  if (!(file instanceof Blob) || file.size < 16) throw new Error("Retail archive is too small");
  const target = normalizedPath(requestedPath);
  let directory = new Uint8Array(await file.slice(0, Math.min(file.size, 64 * 1024)).arrayBuffer());
  if (ascii(directory, 0, 4) !== "BIGF") throw new Error("Retail archive is not BIGF");
  const archiveSize = u32le(directory, 4);
  const entryCount = u32be(directory, 8);
  if (archiveSize < 16 || archiveSize > file.size || entryCount > 200000) {
    throw new Error("Retail archive header is invalid");
  }

  const ensure = async (length) => {
    if (length > MAX_DIRECTORY_BYTES || length > archiveSize) {
      throw new Error("Retail archive directory is invalid");
    }
    if (directory.byteLength >= length) return;
    const nextLength = Math.min(archiveSize, Math.max(length, directory.byteLength + 64 * 1024));
    directory = new Uint8Array(await file.slice(0, nextLength).arrayBuffer());
  };

  let cursor = 16;
  for (let index = 0; index < entryCount; index += 1) {
    await ensure(cursor + 9);
    const offset = u32be(directory, cursor);
    const size = u32be(directory, cursor + 4);
    let pathEnd = cursor + 8;
    for (;;) {
      while (pathEnd < directory.byteLength && directory[pathEnd] !== 0) pathEnd += 1;
      if (pathEnd - cursor - 8 > 1024) throw new Error("Retail archive path is invalid");
      if (pathEnd < directory.byteLength) break;
      await ensure(directory.byteLength + 1);
    }
    const path = ascii(directory, cursor + 8, pathEnd - cursor - 8);
    if (offset + size > archiveSize) throw new Error("Retail archive entry extends past the archive");
    if (normalizedPath(path) === target) return { offset, size, path };
    cursor = pathEnd + 1;
  }
  return null;
}

export function validateRetailBmp(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 54 || ascii(bytes, 0, 2) !== "BM") {
    throw new Error("Retail presentation art is not a BMP image");
  }
  const pixelOffset = u32le(bytes, 10);
  const dibSize = u32le(bytes, 14);
  const width = u32le(bytes, 18);
  const rawHeight = u32le(bytes, 22);
  const height = rawHeight > 0x7fffffff ? 0x100000000 - rawHeight : rawHeight;
  const planes = u16le(bytes, 26);
  const bitsPerPixel = u16le(bytes, 28);
  const compression = u32le(bytes, 30);
  if (dibSize < 40 || width < 16 || width > 8192 || height < 16 || height > 8192
      || planes !== 1 || ![16, 24, 32].includes(bitsPerPixel)
      || ![0, 3].includes(compression) || pixelOffset >= bytes.byteLength) {
    throw new Error("Retail presentation BMP has unsupported dimensions or encoding");
  }
  return { width, height, bitsPerPixel };
}

export async function extractRetailPresentationFromBig(file) {
  const entry = await bigEntry(file, ART_PATH);
  if (!entry) throw new Error(`${ART_PATH} is not present in ${ART_ARCHIVE}`);
  if (entry.size < 54 || entry.size > MAX_ART_BYTES) throw new Error("Retail presentation art has an invalid size");
  const blob = file.slice(entry.offset, entry.offset + entry.size, "image/bmp");
  const prefix = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
  const image = validateRetailBmp(prefix);
  return { blob, image, archive: ART_ARCHIVE, entry: ART_PATH };
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function retailPresentationKey(archives) {
  const manifest = [...(archives || [])]
    .map((archive) => `${archive.name}:${Number(archive.bytes) || 0}:${Number(archive.entryCount) || 0}`)
    .sort()
    .join("|");
  return manifest ? `retail-art-v1-${hashString(manifest)}` : null;
}

function openCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, CACHE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
        request.result.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cacheRequest(mode, callback) {
  if (typeof indexedDB === "undefined") return null;
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE, mode);
      const result = callback(transaction.objectStore(CACHE_STORE));
      transaction.oncomplete = () => resolve(result?.result ?? null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Presentation cache transaction aborted"));
    });
  } finally {
    db.close();
  }
}

export async function cachedRetailPresentation(key) {
  if (!key) return null;
  return cacheRequest("readonly", (store) => store.get(key)).catch(() => null);
}

async function cacheRetailPresentation(entry) {
  return cacheRequest("readwrite", (store) => {
    store.clear();
    return store.put(entry);
  }).catch(() => null);
}

export async function clearRetailPresentationCache() {
  return cacheRequest("readwrite", (store) => store.clear()).catch(() => null);
}

async function openOpfsFile(path) {
  let directory = await navigator.storage.getDirectory();
  const parts = String(path || "").split("/").filter(Boolean);
  const name = parts.pop();
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: false });
  return (await directory.getFileHandle(name, { create: false })).getFile();
}

export async function retailPresentationForLibrary(archives, rememberedKey = null, { cache = true } = {}) {
  const key = retailPresentationKey(archives) || rememberedKey;
  if (cache) {
    const cached = await cachedRetailPresentation(key);
    if (cached?.blob instanceof Blob) return { ...cached, source: "browser cache" };
  }
  const archive = (archives || []).find((item) => item.name === ART_ARCHIVE);
  if (!archive?.opfsPath || !key) return null;
  const extracted = await extractRetailPresentationFromBig(await openOpfsFile(archive.opfsPath));
  const entry = { key, ...extracted, derivedAt: Date.now() };
  if (cache) await cacheRetailPresentation(entry);
  return { ...entry, source: "user-owned retail archive" };
}

export const retailPresentationSource = Object.freeze({ archive: ART_ARCHIVE, entry: ART_PATH });
