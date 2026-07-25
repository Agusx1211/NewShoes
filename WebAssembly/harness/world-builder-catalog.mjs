import { activeModMountPlan, loadActiveModContext } from "./mod-context.mjs";

const TEXT = new TextDecoder("windows-1252");
const MAX_ENTRIES = 300_000;
const MAX_INI_BYTES = 64 * 1024 * 1024;

function u32le(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function u32be(bytes, offset) {
  return (bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100 + bytes[offset + 3]) >>> 0;
}

async function opfsFile(path) {
  let directory = await navigator.storage.getDirectory();
  const parts = String(path).split("/").filter(Boolean);
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create: false });
  }
  return (await directory.getFileHandle(parts.at(-1), { create: false })).getFile();
}

export class BigArchive {
  static async open(path) {
    const file = await opfsFile(path);
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (header.byteLength < 16 || TEXT.decode(header.subarray(0, 4)) !== "BIGF") {
      throw new Error(`${path} is not a BIGF archive`);
    }
    const archiveSize = u32le(header, 4);
    const entryCount = u32be(header, 8);
    if (archiveSize > file.size || entryCount > MAX_ENTRIES) {
      throw new Error(`${path} has an invalid BIGF directory`);
    }
    let cursor = 16;
    const entries = [];
    for (let index = 0; index < entryCount; index += 1) {
      const prefix = new Uint8Array(await file.slice(cursor, Math.min(file.size, cursor + 268)).arrayBuffer());
      if (prefix.byteLength < 9) throw new Error(`${path} directory is truncated`);
      const terminator = prefix.indexOf(0, 8);
      if (terminator < 0) throw new Error(`${path} has an overlong BIGF path`);
      const offset = u32be(prefix, 0);
      const size = u32be(prefix, 4);
      const name = TEXT.decode(prefix.subarray(8, terminator)).replaceAll("\\", "/");
      if (offset + size > archiveSize) throw new Error(`${path}:${name} extends outside its archive`);
      entries.push({ name, normalized: name.toLowerCase(), offset, size });
      cursor += terminator + 1;
    }
    return new BigArchive(path, file, entries);
  }

  constructor(path, file, entries) {
    this.path = path;
    this.file = file;
    this.entries = entries;
    this.byName = new Map(entries.map((entry) => [entry.normalized, entry]));
  }

  async read(entry) {
    const value = typeof entry === "string" ? this.byName.get(entry.replaceAll("\\", "/").toLowerCase()) : entry;
    if (!value) return null;
    return new Uint8Array(await this.file.slice(value.offset, value.offset + value.size).arrayBuffer());
  }

  async readPrefix(entry, length) {
    return new Uint8Array(await this.file.slice(entry.offset, entry.offset + Math.min(entry.size, length)).arrayBuffer());
  }
}

function iniDefinitions(text, source) {
  const definitions = [];
  const lines = text.replaceAll("\r", "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*(Object|Terrain|Road|WaterTransparency|PlayerTemplate)\s+([^\s;]+)/i.exec(lines[index]);
    if (!match) continue;
    const attributes = {};
    for (index += 1; index < lines.length && !/^\s*End\s*(?:;.*)?$/i.test(lines[index]); index += 1) {
      const assignment = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*(?:;.*)?$/.exec(lines[index]);
      if (assignment) attributes[assignment[1].toLowerCase()] = assignment[2];
    }
    definitions.push({
      kind: match[1].toLowerCase(),
      name: match[2],
      source,
      attributes,
    });
  }
  return definitions;
}

function relevantIni(entry) {
  return /^data\/ini\/(?:object\/.*|object|terrain|roads?|water|playertemplate)\.ini$/i.test(entry.name);
}

export async function loadWorldBuilderCatalog({
  storage = globalThis.localStorage,
  onProgress = null,
} = {}) {
  const retail = await window.ZeroHAssetLibrary?.archivesForLaunch?.();
  if (!retail?.length) throw new Error("Install the original Generals and Zero Hour files to load editor assets");
  const context = loadActiveModContext(storage);
  const archives = [
    ...retail.map((archive) => ({ name: archive.name, path: archive.opfsPath })),
    ...activeModMountPlan(context).map((archive) => ({ name: archive.name, path: archive.opfsPath })),
  ];
  const merged = new Map();
  const terrainAssets = new Map();
  let loadedBytes = 0;
  for (let archiveIndex = 0; archiveIndex < archives.length; archiveIndex += 1) {
    const spec = archives[archiveIndex];
    onProgress?.(`Indexing ${spec.name}`, archiveIndex, archives.length);
    const archive = await BigArchive.open(spec.path);
    for (const entry of archive.entries) {
      if (/^art\/terrain\/[^/]+\.tga$/i.test(entry.name)) {
        terrainAssets.set(entry.name.split("/").at(-1).toLowerCase(), { archive, entry });
      }
    }
    for (const entry of archive.entries.filter(relevantIni)) {
      if (entry.size > MAX_INI_BYTES) continue;
      loadedBytes += entry.size;
      if (loadedBytes > MAX_INI_BYTES) throw new Error("Installed INI catalog is unreasonably large");
      const content = TEXT.decode(await archive.read(entry));
      for (const definition of iniDefinitions(content, `${spec.name}:${entry.name}`)) {
        merged.set(`${definition.kind}:${definition.name}`.toLowerCase(), definition);
      }
    }
  }
  const all = [...merged.values()].sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));
  const terrains = all.filter((item) => item.kind === "terrain");
  for (let index = 0; index < terrains.length; index += 1) {
    const terrain = terrains[index];
    const texture = terrain.attributes.texture?.split(/[\\/]/).at(-1)?.toLowerCase();
    const asset = terrainAssets.get(texture);
    if (!asset) {
      terrain.cellWidth = 1;
      continue;
    }
    const header = await asset.archive.readPrefix(asset.entry, 18);
    const width = header.byteLength >= 18 ? header[12] | (header[13] << 8) : 64;
    const height = header.byteLength >= 18 ? header[14] | (header[15] << 8) : 64;
    terrain.cellWidth = Math.max(1, Math.min(16, Math.floor(Math.min(width, height) / 64)));
  }
  return Object.freeze({
    context,
    objects: Object.freeze(all.filter((item) => item.kind === "object")),
    terrains: Object.freeze(terrains),
    roads: Object.freeze(all.filter((item) => item.kind === "road")),
    waters: Object.freeze(all.filter((item) => item.kind === "watertransparency")),
    players: Object.freeze(all.filter((item) => item.kind === "playertemplate")),
    archives: Object.freeze(archives),
  });
}

export const WorldBuilderCatalog = Object.freeze({
  iniDefinitions,
  relevantIni,
});
