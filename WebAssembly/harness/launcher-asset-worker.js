/* Browser-local installer media reader for the Project New Shoes launcher.
 *
 * The worker accepts loose installed-game files, ISO 9660 images, and raw
 * MODE1/2352 BIN images. It extracts the original BIG archives needed by
 * cnc-port plus optional loose Bink movies, and writes them directly to OPFS.
 * Microsoft Cabinet/MSZIP is the format used by the original Generals and
 * Zero Hour installer discs.
 */

"use strict";

importScripts("./launcher-archive-specs.js", "./vendor/pako.es5.min.js");

const textDecoder = new TextDecoder("windows-1252");
const textEncoder = new TextEncoder();
const catalog = new Map();
let catalogSequence = 0;
const MAX_BIG_ENTRIES = 200000;
const MAX_BIG_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ISO_ROOT_BYTES = 64 * 1024 * 1024;
const MAX_LOOSE_SCRIPT_BYTES = 16 * 1024 * 1024;
const MAX_PRESENTATION_ICON_BYTES = 32 * 1024 * 1024;
const MAX_CURSOR_FILE_BYTES = 1024 * 1024;
const MAX_CURSOR_PACK_BYTES = 16 * 1024 * 1024;
const ORIGINAL_CURSOR_PACK_NAME = "OriginalCursors.big";
const REQUIRED_CURSOR_NAMES = ["sccpointer.ani", "sccattack.ani"];

const ARCHIVES = self.ZeroHArchiveSpecs;
const ARCHIVE_SOURCE_NAMES = new Set(ARCHIVES.map((archive) => archive.sourceName.toLowerCase()));

const SCRIPT_FILES = [
  { sourceName: "SkirmishScripts.scb", path: "Data\\Scripts\\SkirmishScripts.scb" },
  { sourceName: "MultiplayerScripts.scb", path: "Data\\Scripts\\MultiplayerScripts.scb" },
  { sourceName: "Scripts.ini", path: "Data\\Scripts\\Scripts.ini" },
];

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function setU32BE(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function setU32LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function u32be(bytes, offset) {
  return (bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 + bytes[offset + 3]) >>> 0;
}

function ascii(bytes, start, length) {
  return textDecoder.decode(bytes.subarray(start, start + length));
}

function basename(path) {
  return String(path).replaceAll("\\", "/").split("/").pop() || "";
}

function installedArchiveName(path) {
  // InstallShield disambiguates cabinet source keys with a numeric suffix;
  // the retail Generals Data1.cab, for example, stores Maps.big as Maps.big1.
  return basename(path).replace(/(\.big)\d+$/i, "$1");
}

function dirname(path) {
  const normalized = String(path).replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? "" : normalized.slice(0, slash).toLowerCase();
}

function emitProgress(requestId, phase, detail, completed = 0, total = 0) {
  self.postMessage({ kind: "progress", requestId, phase, detail, completed, total });
}

class BlobReader {
  constructor(blob, label) {
    this.blob = blob;
    this.size = blob.size;
    this.label = label || blob.name || "local file";
  }

  async read(offset, length) {
    if (offset < 0 || length < 0 || offset + length > this.size) {
      throw new Error(`${this.label}: read outside source (${offset}+${length} > ${this.size})`);
    }
    return new Uint8Array(await this.blob.slice(offset, offset + length).arrayBuffer());
  }
}

class IsoEntryReader {
  constructor(image, entry, layout) {
    this.image = image;
    this.extent = entry.extent;
    this.size = entry.size;
    this.layout = layout;
    this.label = `${image.label}:${entry.name}`;
  }

  async read(offset, length) {
    if (offset < 0 || length < 0 || offset + length > this.size) {
      throw new Error(`${this.label}: read outside ISO entry`);
    }
    const { sectorSize, dataOffset, logicalSize } = this.layout;
    const logicalStart = this.extent * logicalSize + offset;
    if (sectorSize === logicalSize && dataOffset === 0) {
      return this.image.read(logicalStart, length);
    }

    const firstSector = Math.floor(logicalStart / logicalSize);
    const lastLogical = logicalStart + length;
    const lastSector = Math.ceil(lastLogical / logicalSize);
    const physicalStart = firstSector * sectorSize + dataOffset;
    const physicalLength = (lastSector - firstSector - 1) * sectorSize + logicalSize;
    const physical = await this.image.read(physicalStart, physicalLength);
    const output = new Uint8Array(length);
    let destination = 0;
    let logicalCursor = logicalStart;
    while (destination < length) {
      const sector = Math.floor(logicalCursor / logicalSize);
      const within = logicalCursor % logicalSize;
      const available = Math.min(logicalSize - within, length - destination);
      const source = (sector - firstSector) * sectorSize + within;
      output.set(physical.subarray(source, source + available), destination);
      destination += available;
      logicalCursor += available;
    }
    return output;
  }
}

async function detectIsoLayout(reader) {
  const layouts = [
    { sectorSize: 2048, dataOffset: 0, logicalSize: 2048 },
    { sectorSize: 2352, dataOffset: 16, logicalSize: 2048 },
  ];
  for (const layout of layouts) {
    for (let sector = 16; sector < 48; sector += 1) {
      const offset = sector * layout.sectorSize + layout.dataOffset;
      if (offset + layout.logicalSize > reader.size) break;
      const descriptor = await reader.read(offset, layout.logicalSize);
      if (ascii(descriptor, 1, 5) !== "CD001") break;
      if (descriptor[0] === 1) {
        return { ...layout, descriptor, descriptorSector: sector };
      }
      if (descriptor[0] === 255) break;
    }
  }
  throw new Error(`${reader.label}: not an ISO 9660 or MODE1/2352 image`);
}

async function validateBigReader(reader, label, requiredEntries = []) {
  if (!reader || reader.size < 16) throw new Error(`${label}: BIGF archive is too small`);
  const header = await reader.read(0, 16);
  if (ascii(header, 0, 4) !== "BIGF") throw new Error(`${label}: not a BIGF archive`);
  // This field is the format's odd one out: original Win32BIGFileSystem reads
  // it directly on little-endian x86. Count and directory entries are network
  // byte order and are swapped by the original source.
  const archiveSize = u32(header, 4);
  const entryCount = u32be(header, 8);
  if (archiveSize < 16 || archiveSize > reader.size) {
    throw new Error(`${label}: BIGF header size ${archiveSize} does not fit ${reader.size} bytes`);
  }
  if (entryCount > MAX_BIG_ENTRIES) throw new Error(`${label}: unreasonable BIGF entry count ${entryCount}`);

  const chunkSize = 64 * 1024;
  let directory = new Uint8Array(0);
  let cursor = 0;
  let lowestOffset = { offset: Infinity, index: -1 };
  const required = new Map(requiredEntries.map((path) => [path.toLowerCase(), path]));
  const ensure = async (length, message) => {
    if (length > MAX_BIG_DIRECTORY_BYTES) throw new Error(`${label}: BIGF directory exceeds 64 MB`);
    if (length > archiveSize - 16) throw new Error(message);
    while (directory.byteLength < length) {
      const start = 16 + directory.byteLength;
      if (start >= archiveSize) throw new Error(message);
      const next = await reader.read(start, Math.min(chunkSize, archiveSize - start));
      if (!next.byteLength) throw new Error(message);
      const combined = new Uint8Array(directory.byteLength + next.byteLength);
      combined.set(directory);
      combined.set(next, directory.byteLength);
      directory = combined;
    }
  };

  for (let index = 0; index < entryCount; index += 1) {
    await ensure(cursor + 9, `${label}: BIGF directory ended before entry ${index}`);
    const offset = u32be(directory, cursor);
    const size = u32be(directory, cursor + 4);
    let pathEnd = cursor + 8;
    for (;;) {
      while (pathEnd < directory.byteLength && directory[pathEnd] !== 0) pathEnd += 1;
      if (pathEnd - cursor - 8 > 260) {
        throw new Error(`${label}: BIGF entry ${index} path exceeds 260 bytes`);
      }
      if (pathEnd < directory.byteLength) break;
      await ensure(directory.byteLength + 1, `${label}: BIGF entry ${index} has no terminator`);
    }
    if (pathEnd === cursor + 8) throw new Error(`${label}: BIGF entry ${index} has an empty path`);
    if (required.size) {
      required.delete(ascii(directory, cursor + 8, pathEnd - cursor - 8).toLowerCase());
    }
    if (offset + size > archiveSize) throw new Error(`${label}: BIGF entry ${index} extends past archive end`);
    if (offset < lowestOffset.offset) lowestOffset = { offset, index };
    cursor = pathEnd + 1;
  }
  const dataStart = 16 + cursor;
  if (lowestOffset.offset < dataStart) {
    throw new Error(`${label}: BIGF entry ${lowestOffset.index} overlaps the directory`);
  }
  if (required.size) {
    throw new Error(`${label}: required game content is missing (${[...required.values()].join(", ")})`);
  }
  return { archiveSize, entryCount };
}

async function readIsoRoot(reader) {
  const layout = await detectIsoLayout(reader);
  const descriptor = layout.descriptor;
  const volume = ascii(descriptor, 40, 32).trim();
  const rootOffset = 156;
  const root = {
    name: "",
    extent: u32(descriptor, rootOffset + 2),
    size: u32(descriptor, rootOffset + 10),
    directory: true,
  };
  if (root.size <= 0 || root.size > MAX_ISO_ROOT_BYTES) {
    throw new Error(`${reader.label}: unreasonable ISO root directory size ${root.size}`);
  }
  const rootReader = new IsoEntryReader(reader, root, layout);
  const bytes = await rootReader.read(0, root.size);
  const entries = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const recordLength = bytes[cursor];
    if (recordLength === 0) {
      cursor = Math.ceil((cursor + 1) / layout.logicalSize) * layout.logicalSize;
      continue;
    }
    if (cursor + recordLength > bytes.length || recordLength < 34) break;
    const nameLength = bytes[cursor + 32];
    const rawName = bytes.subarray(cursor + 33, cursor + 33 + nameLength);
    if (!(nameLength === 1 && (rawName[0] === 0 || rawName[0] === 1))) {
      const name = textDecoder.decode(rawName).replace(/;\d+$/, "");
      entries.push({
        name,
        extent: u32(bytes, cursor + 2),
        size: u32(bytes, cursor + 10),
        directory: Boolean(bytes[cursor + 25] & 2),
      });
    }
    cursor += recordLength;
  }
  return { layout, volume, entries };
}

async function parseCab(reader) {
  const header = await reader.read(0, Math.min(reader.size, 65536));
  if (ascii(header, 0, 4) !== "MSCF") {
    throw new Error(`${reader.label}: not a Microsoft Cabinet file`);
  }
  const cabinetSize = u32(header, 8);
  const filesOffset = u32(header, 16);
  const folderCount = u16(header, 26);
  const fileCount = u16(header, 28);
  const flags = u16(header, 30);
  if (cabinetSize > reader.size || folderCount > 4096 || fileCount > 65535) {
    throw new Error(`${reader.label}: invalid cabinet header`);
  }

  let cursor = 36;
  let folderReserve = 0;
  let dataReserve = 0;
  const readCString = () => {
    while (cursor < header.length && header[cursor] !== 0) cursor += 1;
    cursor += 1;
  };
  if (flags & 0x0004) {
    const headerReserve = u16(header, cursor);
    folderReserve = header[cursor + 2];
    dataReserve = header[cursor + 3];
    cursor += 4 + headerReserve;
  }
  if (flags & 0x0001) {
    readCString();
    readCString();
  }
  if (flags & 0x0002) {
    readCString();
    readCString();
  }

  const folders = [];
  for (let index = 0; index < folderCount; index += 1) {
    folders.push({
      dataOffset: u32(header, cursor),
      blockCount: u16(header, cursor + 4),
      compression: u16(header, cursor + 6) & 0x000f,
    });
    cursor += 8 + folderReserve;
  }

  let fileBytes = header;
  if (filesOffset >= header.length - 1024) {
    fileBytes = await reader.read(filesOffset, Math.min(reader.size - filesOffset, 1024 * 1024));
    cursor = 0;
  } else {
    cursor = filesOffset;
  }
  const files = [];
  for (let index = 0; index < fileCount; index += 1) {
    if (cursor + 16 > fileBytes.length) {
      throw new Error(`${reader.label}: cabinet file directory is truncated`);
    }
    const size = u32(fileBytes, cursor);
    const folderOffset = u32(fileBytes, cursor + 4);
    const folderIndex = u16(fileBytes, cursor + 8);
    let nameEnd = cursor + 16;
    while (nameEnd < fileBytes.length && fileBytes[nameEnd] !== 0) nameEnd += 1;
    if (nameEnd === fileBytes.length) {
      throw new Error(`${reader.label}: cabinet filename is unterminated`);
    }
    files.push({
      name: textDecoder.decode(fileBytes.subarray(cursor + 16, nameEnd)),
      size,
      folderOffset,
      folderIndex,
    });
    cursor = nameEnd + 1;
  }
  return { reader, folders, files, dataReserve, cabinetSize };
}

function addCandidate(sourceName, edition, candidate) {
  const key = sourceName.toLowerCase();
  if (!catalog.has(key)) catalog.set(key, []);
  catalog.get(key).push({ ...candidate, sourceName, edition, sequence: ++catalogSequence });
}

function inferDirectEditions(files) {
  const directoryKinds = new Map();
  for (const item of files) {
    const leaf = basename(item.path).toLowerCase();
    const directory = dirname(item.path);
    if (leaf === "inizh.big") directoryKinds.set(directory, "zh");
    if (leaf === "ini.big" && !directoryKinds.has(directory)) directoryKinds.set(directory, "base");
  }
  return directoryKinds;
}

function directEdition(path, directoryKinds, leaf = basename(path)) {
  const lowerLeaf = leaf.toLowerCase();
  if (lowerLeaf.endsWith("zh.big")) {
    return "zh";
  }
  if (ARCHIVES.some((archive) => archive.edition === "base"
      && archive.sourceName.toLowerCase() === lowerLeaf)) {
    return "base";
  }
  const directory = dirname(path);
  if (directoryKinds.has(directory)) return directoryKinds.get(directory);
  const installationRoot = [...directoryKinds.keys()]
    .filter((root) => root && directory.startsWith(`${root}/`))
    .sort((left, right) => right.length - left.length)[0];
  if (installationRoot) return directoryKinds.get(installationRoot);
  const lower = path.toLowerCase();
  if (lower.includes("zero hour") || lower.includes("zerohour")) return "zh";
  return lower.includes("generals") ? "base" : "unknown";
}

function entryEdition(path, fallback) {
  // A cabinet is an edition boundary. Zero Hour's Data1.cab deliberately
  // contains a tiny base-named Music.big security stub; classifying entries
  // solely by that filename makes it outrank the real Generals Music.big.
  // ZH-suffixed names remain unambiguous, while all other cabinet members
  // inherit the edition established from that cabinet's contents.
  if (/zh\.big\d*$/i.test(basename(path))) return "zh";
  return fallback === "unknown" ? directEdition(path, new Map()) : fallback;
}

async function scanSources(files, requestId) {
  catalog.clear();
  catalogSequence = 0;
  const normalized = files.map((source) => {
    const file = source?.file || source;
    return {
      file,
      path: source?.path || file.webkitRelativePath || file.name,
    };
  });
  const directoryKinds = inferDirectEditions(normalized);
  const errors = [];
  let scanned = 0;

  for (const item of normalized) {
    const leaf = basename(item.path);
    const lower = leaf.toLowerCase();
    scanned += 1;
    emitProgress(requestId, "scan", `Inspecting ${leaf}`, scanned, normalized.length);
    try {
      if (lower.endsWith(".big")) {
        // Installed games can include patch/mod archives that are not part of
        // the browser runtime contract. Do not parse or warn about unrelated
        // BIG files the launcher will never materialize.
        if (!ARCHIVE_SOURCE_NAMES.has(lower)) continue;
        const reader = new BlobReader(item.file, item.path);
        await validateBigReader(reader, item.path);
        addCandidate(leaf, directEdition(item.path, directoryKinds, leaf), {
          kind: "reader", reader, label: item.path,
        });
        continue;
      }
      if (SCRIPT_FILES.some((script) => script.sourceName.toLowerCase() === lower)) {
        addCandidate(leaf, directEdition(item.path, directoryKinds, leaf), {
          kind: "reader", reader: new BlobReader(item.file, item.path), label: item.path,
        });
        continue;
      }
      if (lower.endsWith(".ani")) {
        addCandidate(leaf, directEdition(item.path, directoryKinds, leaf), {
          kind: "reader", reader: new BlobReader(item.file, item.path), label: item.path,
        });
        continue;
      }
      if (lower.endsWith(".bik")) {
        addCandidate(leaf, directEdition(item.path, directoryKinds, leaf), {
          kind: "reader", reader: new BlobReader(item.file, item.path), label: item.path,
        });
        continue;
      }
      if (lower === "generalszh.ico" || lower === "generals.exe") {
        addCandidate(leaf, directEdition(item.path, directoryKinds, leaf), {
          kind: "reader", reader: new BlobReader(item.file, item.path), label: item.path,
        });
        continue;
      }
      if (lower.endsWith(".cab")) {
        const reader = new BlobReader(item.file, item.path);
        const cabinet = await parseCab(reader);
        const names = new Set(cabinet.files.map((entry) => installedArchiveName(entry.name).toLowerCase()));
        const edition = names.has("inizh.big") || names.has("englishzh.big") ? "zh"
          : names.has("ini.big") || names.has("english.big") ? "base" : "unknown";
        for (const entry of cabinet.files) {
          const leaf = installedArchiveName(entry.name);
          addCandidate(leaf, entryEdition(entry.name, edition), {
            kind: "cab", cabinet, entry, label: `${item.path}:${entry.name}`,
          });
        }
        continue;
      }
      if (/\.(iso|bin|img)$/i.test(lower)) {
        const image = new BlobReader(item.file, item.path);
        const iso = await readIsoRoot(image);
        for (const entry of iso.entries.filter((value) => !value.directory)) {
          const entryReader = new IsoEntryReader(image, entry, iso.layout);
          if (entry.name.toLowerCase().endsWith(".cab")) {
            const cabinet = await parseCab(entryReader);
            const names = new Set(cabinet.files.map((value) => installedArchiveName(value.name).toLowerCase()));
            const edition = names.has("inizh.big") || names.has("englishzh.big") ? "zh"
              : names.has("ini.big") || names.has("english.big") ? "base" : "unknown";
            for (const cabEntry of cabinet.files) {
              const leaf = installedArchiveName(cabEntry.name);
              addCandidate(leaf, entryEdition(cabEntry.name, edition), {
                kind: "cab", cabinet, entry: cabEntry,
                label: `${item.path}:${entry.name}:${cabEntry.name}`,
              });
            }
          } else if (entry.name.toLowerCase().endsWith(".big")) {
            const edition = entryEdition(entry.name, /zh/i.test(iso.volume) ? "zh" : "base");
            await validateBigReader(entryReader, `${item.path}:${entry.name}`);
            addCandidate(entry.name, edition, {
              kind: "reader", reader: entryReader, label: `${item.path}:${entry.name}`,
            });
          } else if (["generalszh.ico", "generals.exe"].includes(entry.name.toLowerCase())) {
            addCandidate(entry.name, /zh/i.test(iso.volume) ? "zh" : "unknown", {
              kind: "reader", reader: entryReader, label: `${item.path}:${entry.name}`,
            });
          }
        }
      }
    } catch (error) {
      errors.push(`${item.path}: ${error?.message || error}`);
    }
  }

  const selection = resolveCatalog();
  const videoSelection = resolveVideoCatalog();
  const cursorSelection = resolveCursorCatalog();
  const presentationCandidate = chooseCandidate("GeneralsZH.ico", "zh")
    || chooseCandidate("generals.exe", "zh");
  let presentationIcon = null;
  if (presentationCandidate
      && (presentationCandidate.edition === "zh" || presentationCandidate.edition === "unknown")) {
    try {
      const blob = new Blob([await readBoundedCandidateBytes(
        presentationCandidate, MAX_PRESENTATION_ICON_BYTES, "retail icon")], {
        type: presentationCandidate.sourceName.toLowerCase().endsWith(".ico")
          ? "image/x-icon" : "application/vnd.microsoft.portable-executable",
      });
      presentationIcon = {
        blob,
        name: presentationCandidate.sourceName,
      };
    } catch (error) {
      errors.push(`Zero Hour icon: ${error?.message || error}`);
    }
  }
  return {
    ok: selection.missing.length === 0,
    filesScanned: normalized.length,
    bytesScanned: normalized.reduce((sum, item) => sum + item.file.size, 0),
    sourceNames: normalized.map((item) => item.path),
    found: selection.found,
    missing: selection.missing,
    totalBytes: selection.totalBytes,
    videoCount: videoSelection.selected.length,
    videoBytes: videoSelection.totalBytes,
    cursorCount: cursorSelection.selected.length,
    cursorMissing: cursorSelection.missing,
    errors,
    presentationIcon,
  };
}

function chooseCandidate(sourceName, edition, acceptedEditions = [edition]) {
  const candidates = catalog.get(sourceName.toLowerCase()) || [];
  const scriptName = SCRIPT_FILES.some((script) =>
    script.sourceName.toLowerCase() === sourceName.toLowerCase());
  return [...candidates].sort((left, right) => {
    const score = (candidate) => {
      let value = candidate.edition === edition ? 6
        : acceptedEditions.includes(candidate.edition) ? 4
        : candidate.edition === "unknown" ? 2 : 0;
      if (scriptName && candidate.kind === "cab") value += 3;
      if (scriptName && /(^|[\\/])data[\\/]scripts[\\/]/i.test(candidate.label)) value += 2;
      return value;
    };
    const leftScore = score(left);
    const rightScore = score(right);
    return rightScore - leftScore || right.sequence - left.sequence;
  })[0] || null;
}

function acceptedArchiveEditions(archive) {
  return Array.isArray(archive.acceptedEditions) ? archive.acceptedEditions : [archive.edition];
}

function resolveCatalog() {
  const selected = [];
  const found = [];
  const missing = [];
  let totalBytes = 0;
  for (const archive of ARCHIVES) {
    if (archive.name === "LooseScripts.big") {
      const packaged = chooseCandidate(archive.sourceName, archive.edition);
      if (packaged && (packaged.edition === archive.edition || packaged.edition === "unknown")) {
        const size = packaged.kind === "cab" ? packaged.entry.size : packaged.reader.size;
        selected.push({ archive, kind: packaged.kind, candidate: packaged, size });
        found.push({ name: archive.name, sourceName: archive.sourceName, bytes: size, source: packaged.label });
        totalBytes += size;
        continue;
      }
      const scripts = SCRIPT_FILES.map((entry) => ({
        ...entry,
        candidate: chooseCandidate(entry.sourceName, "zh"),
      }));
      if (scripts.every((entry) => entry.candidate
          && (entry.candidate.edition === "zh" || entry.candidate.edition === "unknown"))) {
        const size = 16 + scripts.reduce((sum, entry) => sum + 8
          + textEncoder.encode(entry.path).byteLength + 1
          + (entry.candidate.kind === "cab" ? entry.candidate.entry.size : entry.candidate.reader.size), 0);
        selected.push({ archive, kind: "scripts", scripts, size });
        found.push({ name: archive.name, sourceName: "loose installer scripts", bytes: size });
        totalBytes += size;
      } else {
        missing.push(archive.sourceName);
      }
      continue;
    }
    const acceptedEditions = acceptedArchiveEditions(archive);
    const candidate = chooseCandidate(archive.sourceName, archive.edition, acceptedEditions);
    if (!candidate || (candidate.edition !== "unknown"
        && !acceptedEditions.includes(candidate.edition))) {
      missing.push(archive.sourceName);
      continue;
    }
    const size = candidate.kind === "cab" ? candidate.entry.size : candidate.reader.size;
    selected.push({ archive, kind: candidate.kind, candidate, size });
    found.push({ name: archive.name, sourceName: archive.sourceName, bytes: size, source: candidate.label });
    totalBytes += size;
  }
  return { selected, found, missing, totalBytes };
}

function resolveVideoCatalog() {
  const selected = [];
  let totalBytes = 0;
  for (const sourceName of [...catalog.keys()]
    .filter((name) => name.endsWith(".bik"))
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))) {
    const candidate = chooseCandidate(sourceName, "zh", ["zh", "base"]);
    if (!candidate) continue;
    const size = candidate.kind === "cab" ? candidate.entry.size : candidate.reader.size;
    selected.push({
      archive: { name: candidate.sourceName, sourceName: candidate.sourceName },
      kind: candidate.kind,
      candidate,
      size,
      video: true,
    });
    totalBytes += size;
  }
  return { selected, totalBytes };
}

function resolveCursorCatalog() {
  const selected = [];
  for (const sourceName of [...catalog.keys()]
    .filter((name) => name.endsWith(".ani"))
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))) {
    const candidate = chooseCandidate(sourceName, "zh");
    if (!candidate || !["zh", "unknown"].includes(candidate.edition)) continue;
    const size = candidate.kind === "cab" ? candidate.entry.size : candidate.reader.size;
    if (!Number.isSafeInteger(size) || size <= 12 || size > MAX_CURSOR_FILE_BYTES) continue;
    selected.push({ sourceName: basename(candidate.sourceName), candidate, size });
  }
  const names = new Set(selected.map((entry) => entry.sourceName.toLowerCase()));
  const missing = REQUIRED_CURSOR_NAMES.filter((name) => !names.has(name));
  const directoryBytes = selected.reduce((sum, entry) =>
    sum + 9 + textEncoder.encode(`Data\\Cursors\\${entry.sourceName}`).byteLength, 0);
  const totalBytes = 16 + directoryBytes
    + selected.reduce((sum, entry) => sum + entry.size, 0);
  return {
    selected,
    missing,
    ready: missing.length === 0 && totalBytes <= MAX_CURSOR_PACK_BYTES,
    totalBytes,
  };
}

function targetOutputPath(outputRoot, target) {
  return target.video
    ? `${outputRoot}/movies/${target.archive.name}`
    : `${outputRoot}/${target.archive.name}`;
}

async function getDirectory(path, create = true) {
  let directory = await navigator.storage.getDirectory();
  for (const part of String(path).split("/").filter(Boolean)) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return directory;
}

async function openOutput(path) {
  const normalized = String(path).split("/").filter(Boolean);
  const name = normalized.pop();
  const directory = await getDirectory(normalized.join("/"), true);
  const file = await directory.getFileHandle(name, { create: true });
  const handle = await file.createSyncAccessHandle();
  handle.truncate(0);
  return handle;
}

async function readOpfsFile(path) {
  const normalized = String(path).split("/").filter(Boolean);
  const name = normalized.pop();
  const directory = await getDirectory(normalized.join("/"), false);
  const handle = await directory.getFileHandle(name, { create: false });
  const file = await handle.getFile();
  return new BlobReader(file, path);
}

async function removeOpfsPath(path) {
  const normalized = String(path).split("/").filter(Boolean);
  const name = normalized.pop();
  if (!name) return false;
  try {
    const parent = await getDirectory(normalized.join("/"), false);
    await parent.removeEntry(name, { recursive: true });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

function safeDisposableRoot(path) {
  const normalized = String(path).replace(/^\/+|\/+$/g, "");
  return /^cnc-archives\/ns-[a-z0-9-]+$/i.test(normalized)
    || /^cnc-library\/install-[a-z0-9-]+$/i.test(normalized)
    ? normalized : null;
}

function updatedDictionary(previous, block) {
  const keep = Math.min(32768, previous.byteLength + block.byteLength);
  const dictionary = new Uint8Array(keep);
  const fromBlock = Math.min(keep, block.byteLength);
  dictionary.set(block.subarray(block.byteLength - fromBlock), keep - fromBlock);
  const fromPrevious = keep - fromBlock;
  if (fromPrevious > 0) {
    dictionary.set(previous.subarray(previous.byteLength - fromPrevious), 0);
  }
  return dictionary;
}

function writeAll(output, bytes, at, label) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const remaining = bytes.byteLength - offset;
    const written = output.write(bytes.subarray(offset), { at: at + offset });
    if (written === 0) {
      throw new Error(`Browser storage stopped accepting data while extracting ${label}; free browser or disk storage and try again`);
    }
    if (!Number.isInteger(written) || written < 0 || written > remaining) {
      throw new Error(`${label}: invalid OPFS write result (${written} for ${remaining} bytes)`);
    }
    offset += written;
  }
  return bytes.byteLength;
}

async function copyReader(reader, outputPath, requestId, progress) {
  const output = await openOutput(outputPath);
  try {
    const chunkSize = 4 * 1024 * 1024;
    let offset = 0;
    while (offset < reader.size) {
      const bytes = await reader.read(offset, Math.min(chunkSize, reader.size - offset));
      const written = writeAll(output, bytes, offset, outputPath);
      offset += written;
      progress.completed += written;
      emitProgress(requestId, "prepare", basename(outputPath), progress.completed, progress.total);
    }
    output.flush();
    if (output.getSize() !== reader.size) throw new Error(`${outputPath}: OPFS size mismatch`);
  } finally {
    output.close();
  }
}

async function extractCabGroup(cabinet, targets, requestId, progress, outputRoot) {
  const byFolder = new Map();
  for (const target of targets) {
    if (!byFolder.has(target.candidate.entry.folderIndex)) byFolder.set(target.candidate.entry.folderIndex, []);
    byFolder.get(target.candidate.entry.folderIndex).push(target);
  }

  for (const [folderIndex, folderTargets] of byFolder) {
    const folder = cabinet.folders[folderIndex];
    if (!folder) throw new Error(`${cabinet.reader.label}: invalid CAB folder ${folderIndex}`);
    if (folder.compression !== 0 && folder.compression !== 1) {
      throw new Error(`${cabinet.reader.label}: unsupported CAB compression ${folder.compression}`);
    }
    const outputs = new Map();
    try {
      for (const target of folderTargets) {
        outputs.set(target, await openOutput(targetOutputPath(outputRoot, target)));
      }
      let dataCursor = folder.dataOffset;
      let folderCursor = 0;
      let dictionary = new Uint8Array(0);
      const finalByte = Math.max(...folderTargets.map((target) =>
        target.candidate.entry.folderOffset + target.candidate.entry.size));
      for (let blockIndex = 0; blockIndex < folder.blockCount && folderCursor < finalByte; blockIndex += 1) {
        const blockHeader = await cabinet.reader.read(dataCursor, 8 + cabinet.dataReserve);
        const compressedSize = u16(blockHeader, 4);
        const uncompressedSize = u16(blockHeader, 6);
        const compressed = await cabinet.reader.read(
          dataCursor + 8 + cabinet.dataReserve, compressedSize);
        let block;
        if (folder.compression === 0) {
          block = compressed;
        } else {
          if (compressed[0] !== 0x43 || compressed[1] !== 0x4b) {
            throw new Error(`${cabinet.reader.label}: invalid MSZIP block signature`);
          }
          block = self.pako.inflateRaw(compressed.subarray(2),
            dictionary.byteLength ? { dictionary } : undefined);
        }
        if (block.byteLength !== uncompressedSize) {
          throw new Error(`${cabinet.reader.label}: CAB block expanded to ${block.byteLength}, expected ${uncompressedSize}`);
        }
        const blockEnd = folderCursor + block.byteLength;
        for (const target of folderTargets) {
          const entry = target.candidate.entry;
          const entryEnd = entry.folderOffset + entry.size;
          if (blockEnd <= entry.folderOffset || folderCursor >= entryEnd) continue;
          const sourceStart = Math.max(0, entry.folderOffset - folderCursor);
          const sourceEnd = Math.min(block.byteLength, entryEnd - folderCursor);
          const destination = Math.max(0, folderCursor - entry.folderOffset);
          const slice = block.subarray(sourceStart, sourceEnd);
          const written = writeAll(outputs.get(target), slice, destination, target.archive.name);
          progress.completed += written;
          emitProgress(requestId, "prepare", target.archive.name, progress.completed, progress.total);
        }
        dictionary = updatedDictionary(dictionary, block);
        folderCursor = blockEnd;
        dataCursor += 8 + cabinet.dataReserve + compressedSize;
      }
      if (folderCursor < finalByte) {
        throw new Error(`${cabinet.reader.label}: CAB folder ended before required files`);
      }
      for (const target of folderTargets) {
        const output = outputs.get(target);
        output.flush();
        if (output.getSize() !== target.size) {
          throw new Error(`${target.archive.name}: extracted ${output.getSize()} bytes, expected ${target.size}`);
        }
        const magic = new Uint8Array(4);
        output.read(magic, { at: 0 });
        const valid = target.video
          ? ["BIK", "KB2"].includes(ascii(magic, 0, 3))
          : ascii(magic, 0, 4) === "BIGF";
        if (!valid) {
          throw new Error(`${target.archive.name}: extracted file has an invalid ${target.video ? "Bink" : "BIGF"} header`);
        }
      }
    } finally {
      for (const output of outputs.values()) {
        try { output.close(); } catch { /* already closed */ }
      }
    }
  }
}

async function writeLooseScripts(target, outputRoot, requestId, progress) {
  const loaded = [];
  for (const script of target.scripts) {
    const bytes = await readCandidateBytes(script.candidate);
    loaded.push({ ...script, bytes, pathBytes: textEncoder.encode(script.path) });
  }
  const directoryBytes = loaded.reduce((sum, entry) => sum + 8 + entry.pathBytes.byteLength + 1, 0);
  const dataStart = 16 + directoryBytes;
  const total = dataStart + loaded.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
  const archive = new Uint8Array(total);
  archive.set([0x42, 0x49, 0x47, 0x46], 0);
  setU32LE(archive, 4, total);
  setU32BE(archive, 8, loaded.length);
  setU32BE(archive, 12, 0);
  let directoryCursor = 16;
  let dataCursor = dataStart;
  for (const entry of loaded) {
    setU32BE(archive, directoryCursor, dataCursor);
    setU32BE(archive, directoryCursor + 4, entry.bytes.byteLength);
    archive.set(entry.pathBytes, directoryCursor + 8);
    archive[directoryCursor + 8 + entry.pathBytes.byteLength] = 0;
    archive.set(entry.bytes, dataCursor);
    directoryCursor += 8 + entry.pathBytes.byteLength + 1;
    dataCursor += entry.bytes.byteLength;
  }
  const output = await openOutput(`${outputRoot}/${target.archive.name}`);
  try {
    const written = writeAll(output, archive, 0, target.archive.name);
    output.flush();
    if (output.getSize() !== archive.byteLength) throw new Error(`${target.archive.name}: OPFS size mismatch`);
  } finally {
    output.close();
  }
  target.size = total;
  progress.completed += total;
  emitProgress(requestId, "prepare", target.archive.name, progress.completed, progress.total);
}

async function loadCursorFiles(selection) {
  const files = new Map();
  const cabinetGroups = new Map();
  for (const selected of selection.selected) {
    if (selected.candidate.kind !== "cab") {
      files.set(selected, await selected.candidate.reader.read(0, selected.size));
      continue;
    }
    const { cabinet, entry } = selected.candidate;
    if (!cabinetGroups.has(cabinet)) cabinetGroups.set(cabinet, new Map());
    const byFolder = cabinetGroups.get(cabinet);
    if (!byFolder.has(entry.folderIndex)) byFolder.set(entry.folderIndex, []);
    byFolder.get(entry.folderIndex).push(selected);
  }

  for (const [cabinet, byFolder] of cabinetGroups) {
    for (const selections of byFolder.values()) {
      const entries = selections.map((selected) => selected.candidate.entry);
      const extracted = await readCabEntryGroup(cabinet, entries, MAX_CURSOR_FILE_BYTES);
      for (const selected of selections) {
        const bytes = extracted.get(selected.candidate.entry);
        if (!bytes) throw new Error(`${selected.candidate.label}: cursor entry was not extracted`);
        files.set(selected, bytes);
      }
    }
  }
  return files;
}

async function writeOriginalCursorPack(selection, outputRoot, requestId, progress) {
  if (!selection.ready) return null;
  const loaded = await loadCursorFiles(selection);
  const entries = selection.selected.map((selected) => ({
    pathBytes: textEncoder.encode(`Data\\Cursors\\${selected.sourceName}`),
    bytes: loaded.get(selected),
  }));
  const directoryBytes = entries.reduce((sum, entry) => sum + 9 + entry.pathBytes.byteLength, 0);
  const dataStart = 16 + directoryBytes;
  const total = dataStart + entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
  if (total !== selection.totalBytes || total > MAX_CURSOR_PACK_BYTES) {
    throw new Error("Original cursor pack size changed during extraction");
  }
  const pack = new Uint8Array(total);
  pack.set([0x42, 0x49, 0x47, 0x46], 0);
  setU32LE(pack, 4, total);
  setU32BE(pack, 8, entries.length);
  let directoryCursor = 16;
  let dataCursor = dataStart;
  for (const entry of entries) {
    setU32BE(pack, directoryCursor, dataCursor);
    setU32BE(pack, directoryCursor + 4, entry.bytes.byteLength);
    pack.set(entry.pathBytes, directoryCursor + 8);
    pack.set(entry.bytes, dataCursor);
    directoryCursor += 9 + entry.pathBytes.byteLength;
    dataCursor += entry.bytes.byteLength;
  }

  const outputPath = `${outputRoot}/${ORIGINAL_CURSOR_PACK_NAME}`;
  const output = await openOutput(outputPath);
  try {
    writeAll(output, pack, 0, ORIGINAL_CURSOR_PACK_NAME);
    output.flush();
    if (output.getSize() !== total) throw new Error(`${ORIGINAL_CURSOR_PACK_NAME}: OPFS size mismatch`);
  } finally {
    output.close();
  }
  progress.completed += total;
  emitProgress(requestId, "prepare", "Original game cursors", progress.completed, progress.total);
  const validation = await validateBigReader(
    await readOpfsFile(outputPath), ORIGINAL_CURSOR_PACK_NAME,
    REQUIRED_CURSOR_NAMES.map((name) => `Data\\Cursors\\${name}`));
  return {
    name: ORIGINAL_CURSOR_PACK_NAME,
    bytes: total,
    entryCount: validation.entryCount,
    opfsPath: outputPath,
  };
}

async function readCandidateBytes(candidate) {
  if (candidate.kind !== "cab") {
    if (candidate.reader.size > MAX_LOOSE_SCRIPT_BYTES) {
      throw new Error(`${candidate.label}: loose script exceeds 16 MB`);
    }
    return candidate.reader.read(0, candidate.reader.size);
  }
  const { cabinet, entry } = candidate;
  if (entry.size > MAX_LOOSE_SCRIPT_BYTES) {
    throw new Error(`${candidate.label}: loose script exceeds 16 MB`);
  }
  cabinet.scriptFolderReads ||= new Map();
  let readPromise = cabinet.scriptFolderReads.get(entry.folderIndex);
  if (!readPromise) {
    const entries = cabinet.files.filter((value) => value.folderIndex === entry.folderIndex
      && SCRIPT_FILES.some((script) => script.sourceName.toLowerCase() === basename(value.name).toLowerCase()));
    readPromise = readCabEntryGroup(cabinet, entries);
    cabinet.scriptFolderReads.set(entry.folderIndex, readPromise);
  }
  try {
    const bytes = (await readPromise).get(entry);
    if (!bytes) throw new Error(`${candidate.label}: CAB script entry was not extracted`);
    return bytes;
  } catch (error) {
    cabinet.scriptFolderReads.delete(entry.folderIndex);
    throw error;
  }
}

async function readBoundedCandidateBytes(candidate, maxBytes, label) {
  const size = candidate.kind === "cab" ? candidate.entry.size : candidate.reader.size;
  if (!Number.isSafeInteger(size) || size < 4 || size > maxBytes) {
    throw new Error(`${candidate.label}: ${label} exceeds ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
  if (candidate.kind !== "cab") return candidate.reader.read(0, size);
  const bytes = (await readCabEntryGroup(candidate.cabinet, [candidate.entry], maxBytes))
    .get(candidate.entry);
  if (!bytes) throw new Error(`${candidate.label}: ${label} was not extracted`);
  return bytes;
}

async function readCabEntryGroup(cabinet, entries, maxBytes = MAX_LOOSE_SCRIPT_BYTES) {
  if (!entries.length) throw new Error(`${cabinet.reader.label}: no requested CAB entries found`);
  if (entries.some((entry) => entry.size > maxBytes)) {
    throw new Error(`${cabinet.reader.label}: requested entry exceeds ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
  const folderIndex = entries[0].folderIndex;
  const folder = cabinet.folders[folderIndex];
  if (!folder || (folder.compression !== 0 && folder.compression !== 1)) {
    throw new Error(`${cabinet.reader.label}: unsupported CAB folder`);
  }
  const outputs = new Map(entries.map((entry) => [entry, new Uint8Array(entry.size)]));
  let dataCursor = folder.dataOffset;
  let folderCursor = 0;
  let dictionary = new Uint8Array(0);
  const finalByte = Math.max(...entries.map((entry) => entry.folderOffset + entry.size));
  for (let blockIndex = 0; blockIndex < folder.blockCount && folderCursor < finalByte; blockIndex += 1) {
    const header = await cabinet.reader.read(dataCursor, 8 + cabinet.dataReserve);
    const compressedSize = u16(header, 4);
    const uncompressedSize = u16(header, 6);
    const compressed = await cabinet.reader.read(dataCursor + 8 + cabinet.dataReserve, compressedSize);
    let block = compressed;
    if (folder.compression === 1) {
      if (compressed[0] !== 0x43 || compressed[1] !== 0x4b) {
        throw new Error(`${cabinet.reader.label}: invalid MSZIP block signature`);
      }
      block = self.pako.inflateRaw(compressed.subarray(2),
        dictionary.byteLength ? { dictionary } : undefined);
    }
    if (block.byteLength !== uncompressedSize) throw new Error(`${cabinet.reader.label}: CAB block size mismatch`);
    const blockEnd = folderCursor + block.byteLength;
    for (const entry of entries) {
      const entryEnd = entry.folderOffset + entry.size;
      if (blockEnd <= entry.folderOffset || folderCursor >= entryEnd) continue;
      const sourceStart = Math.max(0, entry.folderOffset - folderCursor);
      const sourceEnd = Math.min(block.byteLength, entryEnd - folderCursor);
      const destination = Math.max(0, folderCursor - entry.folderOffset);
      outputs.get(entry).set(block.subarray(sourceStart, sourceEnd), destination);
    }
    dictionary = updatedDictionary(dictionary, block);
    folderCursor = blockEnd;
    dataCursor += 8 + cabinet.dataReserve + compressedSize;
  }
  if (folderCursor < finalByte) throw new Error(`${cabinet.reader.label}: CAB folder ended before script data`);
  return outputs;
}

async function materializeSelection(selection, outputRoot, requestId,
    progress = { completed: 0, total: selection.totalBytes }, videoSelection = { selected: [] },
    cursorSelection = { ready: false }) {
  const cabGroups = new Map();
  const targets = [...selection.selected, ...videoSelection.selected];
  for (const target of targets) {
    if (target.kind === "cab") {
      if (!cabGroups.has(target.candidate.cabinet)) cabGroups.set(target.candidate.cabinet, []);
      cabGroups.get(target.candidate.cabinet).push(target);
    } else if (target.kind === "scripts") {
      await writeLooseScripts(target, outputRoot, requestId, progress);
    } else {
      await copyReader(target.candidate.reader, targetOutputPath(outputRoot, target),
        requestId, progress);
    }
  }
  for (const [cabinet, targets] of cabGroups) {
    await extractCabGroup(cabinet, targets, requestId, progress, outputRoot);
  }
  const archives = selection.selected.map((target) => ({
    name: target.archive.name,
    sourceName: target.archive.sourceName,
    bytes: target.size,
    opfsPath: `${outputRoot}/${target.archive.name}`,
  }));
  for (const archive of archives) {
    const spec = ARCHIVES.find((candidate) => candidate.name === archive.name);
    const validation = await validateBigReader(
      await readOpfsFile(archive.opfsPath), archive.name, spec?.requiredEntries);
    archive.entryCount = validation.entryCount;
  }
  const videos = videoSelection.selected.map((target) => ({
    name: target.archive.name,
    bytes: target.size,
    opfsPath: targetOutputPath(outputRoot, target),
  }));
  for (const video of videos) {
    const reader = await readOpfsFile(video.opfsPath);
    const magic = ascii(await reader.read(0, 4), 0, 3);
    if (reader.size !== video.bytes || !["BIK", "KB2"].includes(magic)) {
      throw new Error(`${video.name}: prepared Bink payload failed validation`);
    }
  }
  const cursorAsset = await writeOriginalCursorPack(
    cursorSelection, outputRoot, requestId, progress);
  return { archives, videos, cursorAsset };
}

async function prepare(request, requestId) {
  const selection = resolveCatalog();
  if (selection.missing.length) {
    throw new Error(`Missing required original game files: ${selection.missing.join(", ")}`);
  }
  const namespaceRoot = safeDisposableRoot(request.namespaceRoot);
  const installRoot = request.mode === "install" ? safeDisposableRoot(request.installRoot) : null;
  if (!installRoot && !namespaceRoot) throw new Error("Invalid launcher archive namespace");
  if (request.mode === "install" && !installRoot) throw new Error("Invalid browser install namespace");
  const outputRoot = installRoot || namespaceRoot;
  const videoSelection = request.includeVideos === true
    ? resolveVideoCatalog() : { selected: [], totalBytes: 0 };
  const cursorSelection = resolveCursorCatalog();
  const progress = {
    completed: 0,
    total: selection.totalBytes + videoSelection.totalBytes
      + (cursorSelection.ready ? cursorSelection.totalBytes : 0),
  };
  try {
    const materialized = await materializeSelection(
      selection, outputRoot, requestId, progress, videoSelection, cursorSelection);
    return {
      ...materialized,
      installed: installRoot ? materialized : null,
    };
  } catch (error) {
    if (namespaceRoot) await removeOpfsPath(namespaceRoot).catch(() => {});
    if (installRoot) await removeOpfsPath(installRoot).catch(() => {});
    throw error;
  }
}

self.onmessage = async (event) => {
  const message = event.data || {};
  const requestId = message.requestId;
  try {
    let result;
    if (message.kind === "scan") result = await scanSources(message.files || [], requestId);
    else if (message.kind === "prepare") result = await prepare(message, requestId);
    else if (message.kind === "discard") {
      const path = safeDisposableRoot(message.path);
      if (!path) throw new Error("Refusing to discard an unsafe OPFS path");
      result = { removed: await removeOpfsPath(path) };
    }
    else throw new Error(`Unknown asset worker command: ${message.kind}`);
    self.postMessage({ kind: "result", requestId, ok: true, result });
  } catch (error) {
    self.postMessage({
      kind: "result", requestId, ok: false,
      error: error?.message || String(error), stack: error?.stack || null,
    });
  }
};
