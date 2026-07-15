import {
  CNC_PORT_MOD_DATA_ROOT,
  CNC_PORT_USER_DATA_DIR,
  CNC_PORT_USER_DATA_LEAF,
  loadActiveModContext,
  loadModContextHistory,
} from "./mod-context.mjs";

export const MAX_GAME_DATA_BYTES = 512 * 1024 * 1024;
export const MAX_REPLAY_DATA_BYTES = 64 * 1024 * 1024;
const CONTEXT_ID_PATTERN = /^(?:vanilla|[a-f0-9]{64})$/;
const REPLAY_MAGIC = Uint8Array.from([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50]);

export function gameDataDirectoryForContext(contextId) {
  const id = String(contextId ?? "");
  if (!CONTEXT_ID_PATTERN.test(id)) throw new Error("Game-data context ID is invalid");
  return id === "vanilla"
    ? CNC_PORT_USER_DATA_DIR
    : `${CNC_PORT_MOD_DATA_ROOT}/${id}/Home/${CNC_PORT_USER_DATA_LEAF}`;
}

export function normalizeGameDataFileName(value, kind) {
  const name = String(value ?? "").trim();
  const extension = kind === "save" ? ".sav" : kind === "replay" ? ".rep" : null;
  if (!extension) throw new Error("Game-data kind must be save or replay");
  if (!name || name.length > 255 || /[\\/\0-\x1f]/.test(name)
      || !name.toLowerCase().endsWith(extension)) {
    throw new Error(`${kind === "save" ? "Save" : "Replay"} filename must end in ${extension}`);
  }
  return name;
}

function bytesValue(value, kind) {
  const bytes = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
  const maxBytes = kind === "replay" ? MAX_REPLAY_DATA_BYTES : MAX_GAME_DATA_BYTES;
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error(`Game-data file must be between 1 byte and ${maxBytes / 1024 / 1024} MB`);
  }
  if (kind === "replay" && !REPLAY_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new Error("Replay does not have a GENREP header");
  }
  return bytes;
}

function mkdirTree(FS, path) {
  let current = "";
  for (const part of String(path).split("/").filter(Boolean)) {
    current += `/${part}`;
    try {
      FS.mkdir(current);
    } catch (error) {
      try { FS.stat(current); } catch { throw error; }
    }
  }
}

function fileModified(stat) {
  const date = stat?.mtime instanceof Date ? stat.mtime : new Date(stat?.mtime ?? 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fileDirectory(contextId, kind) {
  return `${gameDataDirectoryForContext(contextId)}/${kind === "save" ? "Save" : "Replays"}`;
}

function listFiles(FS, contextId, kind) {
  const directory = fileDirectory(contextId, kind);
  try { FS.stat(directory); } catch { return []; }
  const extension = kind === "save" ? /\.sav$/i : /\.rep$/i;
  const files = [];
  for (const name of FS.readdir(directory)) {
    if (name === "." || name === ".." || !extension.test(name)) continue;
    try {
      const stat = FS.stat(`${directory}/${name}`);
      if (typeof FS.isFile === "function" && !FS.isFile(stat.mode)) continue;
      files.push({ name, kind, size: Number(stat.size), modified: fileModified(stat) });
    } catch {
      // The engine can finalize a save/replay while the manager is listing it.
    }
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

function uniqueName(FS, directory, requested) {
  const dot = requested.lastIndexOf(".");
  const stem = dot > 0 ? requested.slice(0, dot) : requested;
  const extension = dot > 0 ? requested.slice(dot) : "";
  let candidate = requested;
  let index = 2;
  for (;;) {
    try {
      FS.stat(`${directory}/${candidate}`);
      candidate = `${stem} (${index++})${extension}`;
    } catch {
      return candidate;
    }
  }
}

export function createGameDataStore({
  ready,
  getModule,
  persist,
  storage = globalThis.localStorage,
}) {
  if (typeof ready !== "function" || typeof getModule !== "function" || typeof persist !== "function") {
    throw new TypeError("Game-data store requires ready, getModule, and persist functions");
  }

  async function filesystem() {
    await ready();
    const FS = getModule()?.FS;
    if (!FS) throw new Error("Game-data filesystem is unavailable");
    return FS;
  }

  async function list() {
    const FS = await filesystem();
    const activeId = loadActiveModContext(storage).id;
    const contexts = new Map(loadModContextHistory(storage).map((context) => [context.id, context]));
    try {
      for (const name of FS.readdir(CNC_PORT_MOD_DATA_ROOT)) {
        if (/^[a-f0-9]{64}$/.test(name) && !contexts.has(name)) {
          contexts.set(name, { id: name, label: `Unknown mod configuration ${name.slice(0, 10)}`, mods: [] });
        }
      }
    } catch {
      // The ModData root does not exist until a modded context is launched.
    }
    const result = [];
    for (const context of contexts.values()) {
      const saves = listFiles(FS, context.id, "save");
      const replays = listFiles(FS, context.id, "replay");
      result.push({
        id: context.id,
        label: context.label,
        active: context.id === activeId,
        mods: (context.mods ?? []).map((mod) => ({
          id: mod.id,
          name: mod.name,
          version: mod.version,
          contentHash: mod.contentHash,
        })),
        saves,
        replays,
        totalBytes: [...saves, ...replays].reduce((sum, file) => sum + file.size, 0),
      });
    }
    return { ok: true, activeId, contexts: result };
  }

  async function read(contextId, kind, name) {
    const safeName = normalizeGameDataFileName(name, kind);
    const FS = await filesystem();
    const bytes = FS.readFile(`${fileDirectory(contextId, kind)}/${safeName}`, { encoding: "binary" });
    return new Uint8Array(bytes);
  }

  async function importFile(contextId, kind, name, value) {
    const safeName = normalizeGameDataFileName(name, kind);
    const bytes = bytesValue(value, kind);
    const FS = await filesystem();
    const directory = fileDirectory(contextId, kind);
    mkdirTree(FS, directory);
    const finalName = uniqueName(FS, directory, safeName);
    const path = `${directory}/${finalName}`;
    FS.writeFile(path, bytes, { canOwn: false });
    const result = await persist(`game-data-import-${kind}`);
    if (!result?.ok) {
      try { FS.unlink(path); } catch { /* rollback best effort */ }
      throw new Error(result?.error || "Imported game data could not be persisted");
    }
    return { ok: true, contextId, kind, name: finalName, size: bytes.byteLength };
  }

  async function copyWithCompatibilityOverride({
    sourceContextId,
    targetContextId,
    kind,
    name,
    acknowledgeCompatibilityRisk = false,
  }) {
    if (sourceContextId === targetContextId) throw new Error("Choose a different target configuration");
    if (acknowledgeCompatibilityRisk !== true) {
      throw new Error("Compatibility-risk acknowledgement is required");
    }
    const inventory = await list();
    if (!inventory.contexts.some((context) => context.id === sourceContextId)
        || !inventory.contexts.some((context) => context.id === targetContextId)) {
      throw new Error("Source or target configuration was not found");
    }
    const bytes = await read(sourceContextId, kind, name);
    return importFile(targetContextId, kind, name, bytes);
  }

  async function remove(contextId, kind, name, { allowActiveLastReplay = false } = {}) {
    const safeName = normalizeGameDataFileName(name, kind);
    const activeId = loadActiveModContext(storage).id;
    if (kind === "replay" && safeName.toLowerCase() === "00000000.rep"
        && contextId === activeId && !allowActiveLastReplay) {
      throw new Error("Last Replay is protected in the active configuration while the runtime is open");
    }
    const FS = await filesystem();
    const path = `${fileDirectory(contextId, kind)}/${safeName}`;
    const backup = FS.readFile(path, { encoding: "binary" });
    FS.unlink(path);
    const result = await persist(`game-data-delete-${kind}`);
    if (!result?.ok) {
      FS.writeFile(path, backup, { canOwn: false });
      throw new Error(result?.error || "Game-data deletion could not be persisted");
    }
    return { ok: true, contextId, kind, name: safeName };
  }

  return { list, read, importFile, copyWithCompatibilityOverride, remove };
}
