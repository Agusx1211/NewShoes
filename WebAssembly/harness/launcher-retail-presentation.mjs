const CACHE_DB = "zeroh-retail-presentation";
const CACHE_STORE = "art";
const CACHE_VERSION = 1;
const ART_ARCHIVE = "EnglishZH.big";
const ART_PATH = "Data\\English\\Install_Final.bmp";
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ART_BYTES = 32 * 1024 * 1024;
const MAX_ICON_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_ICON_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_ICON_ENTRIES = 64;

function u16le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32le(bytes, offset) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function i32le(bytes, offset) {
  return u32le(bytes, offset) | 0;
}

function setU16le(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function setU32le(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
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

function iconDimension(value) {
  return value === 0 ? 256 : value;
}

function validateIconFrame(bytes, width, height) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 24
      || bytes.byteLength > MAX_ICON_FRAME_BYTES) {
    throw new Error("Retail icon frame has an invalid size");
  }
  const png = bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG"
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (png) {
    if (u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR"
        || u32be(bytes, 16) !== width || u32be(bytes, 20) !== height) {
      throw new Error("Retail PNG icon dimensions do not match its directory entry");
    }
    return "png";
  }
  const dibSize = u32le(bytes, 0);
  const dibWidth = i32le(bytes, 4);
  const dibHeight = i32le(bytes, 8);
  const planes = u16le(bytes, 12);
  const bitsPerPixel = u16le(bytes, 14);
  if (dibSize < 40 || dibSize > 124 || dibWidth !== width || Math.abs(dibHeight) !== height * 2
      || planes !== 1 || ![1, 4, 8, 16, 24, 32].includes(bitsPerPixel)) {
    throw new Error("Retail DIB icon frame is invalid");
  }
  return "dib";
}

function singleFrameIco(directoryEntry, frame) {
  const output = new Uint8Array(22 + frame.byteLength);
  setU16le(output, 2, 1);
  setU16le(output, 4, 1);
  output.set(directoryEntry, 6);
  setU32le(output, 14, frame.byteLength);
  setU32le(output, 18, 22);
  output.set(frame, 22);
  return new Blob([output], { type: "image/x-icon" });
}

function chooseBestIconFrame(candidates) {
  return candidates.sort((left, right) => right.width - left.width
    || right.bitsPerPixel - left.bitsPerPixel
    || right.frame.byteLength - left.frame.byteLength)[0] || null;
}

export async function extractBestRetailIco(file) {
  if (!(file instanceof Blob) || file.size < 22 || file.size > MAX_ICON_SOURCE_BYTES) {
    throw new Error("Retail ICO source has an invalid size");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const count = u16le(bytes, 4);
  const directoryEnd = 6 + count * 16;
  if (u16le(bytes, 0) !== 0 || u16le(bytes, 2) !== 1 || count < 1
      || count > MAX_ICON_ENTRIES || directoryEnd > bytes.byteLength) {
    throw new Error("Retail ICO directory is invalid");
  }
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const cursor = 6 + index * 16;
    const width = iconDimension(bytes[cursor]);
    const height = iconDimension(bytes[cursor + 1]);
    const bitsPerPixel = u16le(bytes, cursor + 6);
    const size = u32le(bytes, cursor + 8);
    const offset = u32le(bytes, cursor + 12);
    if (width !== height || width < 16 || width > 256 || size < 24
        || size > MAX_ICON_FRAME_BYTES || offset < directoryEnd
        || offset + size > bytes.byteLength) continue;
    const frame = bytes.slice(offset, offset + size);
    try {
      const encoding = validateIconFrame(frame, width, height);
      candidates.push({
        width,
        height,
        bitsPerPixel,
        encoding,
        frame,
        directoryEntry: bytes.slice(cursor, cursor + 16),
      });
    } catch {
      // Other frames may still be valid and preferable.
    }
  }
  const best = chooseBestIconFrame(candidates);
  if (!best) throw new Error("Retail ICO contains no supported square frame");
  return {
    blob: singleFrameIco(best.directoryEntry, best.frame),
    image: {
      width: best.width,
      height: best.height,
      bitsPerPixel: best.bitsPerPixel,
      encoding: best.encoding,
    },
    entry: "ICO frame",
  };
}

function peResourceReader(bytes) {
  if (bytes.byteLength < 0x100 || ascii(bytes, 0, 2) !== "MZ") {
    throw new Error("Retail executable is not a PE image");
  }
  const peOffset = u32le(bytes, 0x3c);
  if (peOffset < 0x40 || peOffset + 24 > bytes.byteLength || ascii(bytes, peOffset, 4) !== "PE\0\0") {
    throw new Error("Retail executable PE header is invalid");
  }
  const sectionCount = u16le(bytes, peOffset + 6);
  const optionalBytes = u16le(bytes, peOffset + 20);
  const optional = peOffset + 24;
  const magic = u16le(bytes, optional);
  const directoryOffset = magic === 0x10b ? 96 : magic === 0x20b ? 112 : 0;
  const sectionTable = optional + optionalBytes;
  if (!directoryOffset || sectionCount < 1 || sectionCount > 96
      || optionalBytes < directoryOffset + 24 || sectionTable + sectionCount * 40 > bytes.byteLength) {
    throw new Error("Retail executable optional header is invalid");
  }
  const resourceRva = u32le(bytes, optional + directoryOffset + 16);
  const resourceSize = u32le(bytes, optional + directoryOffset + 20);
  if (!resourceRva || resourceSize < 32 || resourceSize > MAX_ICON_SOURCE_BYTES) {
    throw new Error("Retail executable has no bounded icon resources");
  }
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const cursor = sectionTable + index * 40;
    sections.push({
      virtualSize: u32le(bytes, cursor + 8),
      virtualAddress: u32le(bytes, cursor + 12),
      rawSize: u32le(bytes, cursor + 16),
      rawOffset: u32le(bytes, cursor + 20),
    });
  }
  const mapRva = (rva, size) => {
    const section = sections.find((candidate) => rva >= candidate.virtualAddress
      && rva - candidate.virtualAddress + size <= candidate.rawSize
      && rva - candidate.virtualAddress < Math.max(candidate.virtualSize, candidate.rawSize));
    if (!section) throw new Error("Retail executable resource points outside its sections");
    const offset = section.rawOffset + rva - section.virtualAddress;
    if (offset + size > bytes.byteLength) throw new Error("Retail executable resource is truncated");
    return offset;
  };
  const resourceBase = mapRva(resourceRva, Math.min(resourceSize, 32));
  const resourceEnd = Math.min(bytes.byteLength, resourceBase + resourceSize);
  const checkRelative = (relative, size) => {
    if (relative < 0 || resourceBase + relative + size > resourceEnd) {
      throw new Error("Retail executable resource directory is out of bounds");
    }
    return resourceBase + relative;
  };
  const directory = (relative) => {
    const cursor = checkRelative(relative, 16);
    const count = u16le(bytes, cursor + 12) + u16le(bytes, cursor + 14);
    if (count > 4096) throw new Error("Retail executable resource directory is unreasonable");
    checkRelative(relative, 16 + count * 8);
    return Array.from({ length: count }, (_, index) => {
      const entry = cursor + 16 + index * 8;
      const name = u32le(bytes, entry);
      const child = u32le(bytes, entry + 4);
      return {
        id: (name & 0x80000000) === 0 ? name & 0xffff : null,
        child: child & 0x7fffffff,
        isDirectory: Boolean(child & 0x80000000),
      };
    });
  };
  const data = (relative) => {
    const cursor = checkRelative(relative, 16);
    const rva = u32le(bytes, cursor);
    const size = u32le(bytes, cursor + 4);
    if (size < 1 || size > MAX_ICON_FRAME_BYTES) throw new Error("Retail executable icon resource is too large");
    const offset = mapRva(rva, size);
    return bytes.slice(offset, offset + size);
  };
  const typeDirectory = (type) => {
    const entry = directory(0).find((candidate) => candidate.id === type && candidate.isDirectory);
    if (!entry) throw new Error(`Retail executable resource type ${type} is missing`);
    return entry.child;
  };
  const firstLanguageData = (entry) => {
    if (!entry?.isDirectory) throw new Error("Retail executable resource name is invalid");
    const language = directory(entry.child).find((candidate) => !candidate.isDirectory);
    if (!language) throw new Error("Retail executable resource language is missing");
    return data(language.child);
  };
  return { directory, typeDirectory, firstLanguageData };
}

export async function extractBestRetailPeIcon(file) {
  if (!(file instanceof Blob) || file.size < 0x100 || file.size > MAX_ICON_SOURCE_BYTES) {
    throw new Error("Retail executable icon source has an invalid size");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const resources = peResourceReader(bytes);
  const groupEntry = resources.directory(resources.typeDirectory(14))
    .find((entry) => entry.id !== null && entry.isDirectory);
  const group = resources.firstLanguageData(groupEntry);
  const count = group.byteLength >= 6 ? u16le(group, 4) : 0;
  if (u16le(group, 0) !== 0 || u16le(group, 2) !== 1 || count < 1
      || count > MAX_ICON_ENTRIES || 6 + count * 14 > group.byteLength) {
    throw new Error("Retail executable GROUP_ICON resource is invalid");
  }
  const iconEntries = resources.directory(resources.typeDirectory(3));
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const cursor = 6 + index * 14;
    const width = iconDimension(group[cursor]);
    const height = iconDimension(group[cursor + 1]);
    const bitsPerPixel = u16le(group, cursor + 6);
    const resourceId = u16le(group, cursor + 12);
    const iconEntry = iconEntries.find((entry) => entry.id === resourceId && entry.isDirectory);
    if (!iconEntry || width !== height || width < 16 || width > 256) continue;
    try {
      const frame = resources.firstLanguageData(iconEntry);
      const encoding = validateIconFrame(frame, width, height);
      const directoryEntry = new Uint8Array(16);
      directoryEntry.set(group.subarray(cursor, cursor + 12), 0);
      candidates.push({ width, height, bitsPerPixel, encoding, frame, directoryEntry });
    } catch {
      // Continue to another frame in the group.
    }
  }
  const best = chooseBestIconFrame(candidates);
  if (!best) throw new Error("Retail executable contains no supported square icon frame");
  return {
    blob: singleFrameIco(best.directoryEntry, best.frame),
    image: {
      width: best.width,
      height: best.height,
      bitsPerPixel: best.bitsPerPixel,
      encoding: best.encoding,
    },
    entry: "PE GROUP_ICON/RT_ICON frame",
  };
}

export async function extractRetailIcon(file) {
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (magic[0] === 0 && magic[1] === 0 && magic[2] === 1 && magic[3] === 0) {
    return extractBestRetailIco(file);
  }
  if (magic[0] === 0x4d && magic[1] === 0x5a) return extractBestRetailPeIcon(file);
  throw new Error("Retail icon source is neither ICO nor PE");
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
  return manifest ? `retail-art-v2-${hashString(manifest)}` : null;
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

export async function retailPresentationForLibrary(archives, rememberedKey = null, {
  cache = true,
  iconCandidate = null,
} = {}) {
  const key = retailPresentationKey(archives) || rememberedKey;
  if (cache) {
    const cached = await cachedRetailPresentation(key);
    if (cached?.blob instanceof Blob
        && (!(iconCandidate?.blob instanceof Blob) || cached.iconBlob instanceof Blob)) {
      return { ...cached, source: "browser cache" };
    }
  }
  const archive = (archives || []).find((item) => item.name === ART_ARCHIVE);
  if (!archive?.opfsPath || !key) return null;
  const extracted = await extractRetailPresentationFromBig(await openOpfsFile(archive.opfsPath));
  let icon = null;
  if (iconCandidate?.blob instanceof Blob) {
    try { icon = await extractRetailIcon(iconCandidate.blob); } catch { /* project fallback remains visible */ }
  }
  const entry = {
    key,
    ...extracted,
    ...(icon ? {
      iconBlob: icon.blob,
      iconImage: icon.image,
      iconEntry: icon.entry,
      iconOrigin: iconCandidate.name || "user-owned game media",
    } : {}),
    derivedAt: Date.now(),
  };
  if (cache) await cacheRetailPresentation(entry);
  return {
    ...entry,
    source: "user-owned retail archive",
    iconSource: icon ? "user-owned retail icon" : null,
  };
}

export const retailPresentationSource = Object.freeze({
  archive: ART_ARCHIVE,
  entry: ART_PATH,
  iconPriority: ["GeneralsZH.ico", "generals.exe GROUP_ICON/RT_ICON"],
});
