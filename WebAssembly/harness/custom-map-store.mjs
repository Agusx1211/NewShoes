import { gameDataDirectoryForContext } from "./game-data-store.mjs";
import { loadActiveModContext, loadModContextHistory } from "./mod-context.mjs";
import {
  MAX_CUSTOM_MAP_FILE_BYTES,
  MAX_CUSTOM_MAP_FILES,
  MAX_CUSTOM_MAP_INPUT_BYTES,
  MAX_CUSTOM_MAPS_PER_IMPORT,
  normalizeCustomMapName,
  safeCustomMapRelativePath,
} from "./custom-map-package-format.mjs";

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

function exists(FS, path) {
  try {
    FS.stat(path);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(FS, stat) {
  return typeof FS.isDir === "function" ? FS.isDir(stat.mode) : (stat.mode & 0xf000) === 0x4000;
}

function isFile(FS, stat) {
  return typeof FS.isFile === "function" ? FS.isFile(stat.mode) : (stat.mode & 0xf000) === 0x8000;
}

function removeTree(FS, path) {
  let stat;
  try {
    stat = FS.stat(path);
  } catch {
    return false;
  }
  if (isDirectory(FS, stat)) {
    for (const name of FS.readdir(path)) {
      if (name !== "." && name !== "..") removeTree(FS, `${path}/${name}`);
    }
    FS.rmdir(path);
  } else {
    FS.unlink(path);
  }
  return true;
}

function removeWorkspace(FS, userDataRoot, workspaceRoot) {
  removeTree(FS, workspaceRoot);
  const managerRoot = `${userDataRoot}/.MapManager`;
  try {
    if (FS.readdir(managerRoot).every((name) => name === "." || name === "..")) FS.rmdir(managerRoot);
  } catch {
    // A different serialized transaction cannot be active, but leave any
    // unexpected recovery data for cleanStaleWorkspaces rather than widening
    // deletion beyond this store's owned directory.
  }
}

function childName(FS, directory, requested) {
  try {
    return FS.readdir(directory).find((name) =>
      name !== "." && name !== ".." && name.toLowerCase() === requested.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}

function bytesValue(value, path) {
  const bytes = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
  if (!bytes || bytes.byteLength <= 0 || bytes.byteLength > MAX_CUSTOM_MAP_FILE_BYTES) {
    throw new Error(`${path}: map file must be between 1 byte and 256 MB`);
  }
  return bytes;
}

function normalizeImportMaps(values) {
  const maps = Array.from(values ?? []);
  if (maps.length === 0 || maps.length > MAX_CUSTOM_MAPS_PER_IMPORT) {
    throw new Error(`A map import must contain between 1 and ${MAX_CUSTOM_MAPS_PER_IMPORT} maps`);
  }
  const names = new Set();
  let totalBytes = 0;
  let totalFiles = 0;
  const normalized = maps.map((value) => {
    const name = normalizeCustomMapName(value?.name);
    const nameKey = name.toLowerCase();
    if (names.has(nameKey)) throw new Error(`${name}: map appears more than once in the import`);
    names.add(nameKey);
    const files = Array.from(value?.files ?? []);
    if (files.length === 0) throw new Error(`${name}: map has no files`);
    const paths = new Set();
    const normalizedFiles = files.map((file) => {
      const path = safeCustomMapRelativePath(file?.path);
      if (!path) throw new Error(`${name}: map contains an unsafe relative path`);
      const key = path.toLowerCase();
      if (paths.has(key)) throw new Error(`${name}: map contains duplicate file ${path}`);
      paths.add(key);
      const bytes = bytesValue(file?.bytes, path);
      if (Number(file?.size ?? bytes.byteLength) !== bytes.byteLength) {
        throw new Error(`${name}: ${path} size does not match its data`);
      }
      totalBytes += bytes.byteLength;
      totalFiles += 1;
      return { path, bytes };
    });
    if (!paths.has(`${name}.map`.toLowerCase())) {
      throw new Error(`${name}: main ${name}.map file is missing`);
    }
    return { name, files: normalizedFiles };
  });
  if (totalFiles > MAX_CUSTOM_MAP_FILES) throw new Error("Map import contains too many files");
  if (totalBytes > MAX_CUSTOM_MAP_INPUT_BYTES) throw new Error("Map import exceeds the 512 MB browser limit");
  return normalized;
}

function modifiedIso(stat) {
  const date = stat?.mtime instanceof Date ? stat.mtime : new Date(stat?.mtime ?? 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inventoryTree(FS, root) {
  let size = 0;
  let fileCount = 0;
  let modified = null;
  const files = [];
  const visit = (directory, relativeRoot = "") => {
    for (const name of FS.readdir(directory)) {
      if (name === "." || name === "..") continue;
      const path = `${directory}/${name}`;
      const relative = relativeRoot ? `${relativeRoot}/${name}` : name;
      const stat = FS.stat(path);
      if (isDirectory(FS, stat)) {
        visit(path, relative);
      } else if (isFile(FS, stat)) {
        size += Number(stat.size);
        fileCount += 1;
        const timestamp = modifiedIso(stat);
        if (timestamp && (!modified || timestamp > modified)) modified = timestamp;
        files.push(relative);
      }
    }
  };
  visit(root);
  return { size, fileCount, modified, files };
}

function contextDescription(storage, contextId) {
  const context = loadModContextHistory(storage).find((candidate) => candidate.id === contextId);
  return context?.label ?? (contextId === "vanilla"
    ? "Vanilla Zero Hour"
    : `Unknown mod configuration ${contextId.slice(0, 10)}`);
}

export function customMapDirectoryForContext(contextId) {
  return `${gameDataDirectoryForContext(contextId)}/Maps`;
}

export function createCustomMapStore({
  ready,
  getModule,
  persist,
  storage = globalThis.localStorage,
  randomId = () => crypto.randomUUID(),
}) {
  if (typeof ready !== "function" || typeof getModule !== "function" || typeof persist !== "function") {
    throw new TypeError("Custom-map store requires ready, getModule, and persist functions");
  }
  let operationTail = Promise.resolve();

  async function filesystem() {
    await ready();
    const FS = getModule()?.FS;
    if (!FS) throw new Error("Custom-map filesystem is unavailable");
    return FS;
  }

  function serialized(callback) {
    const result = operationTail.then(callback, callback);
    operationTail = result.catch(() => {});
    return result;
  }

  async function cleanStaleWorkspaces(FS, contextId) {
    const root = `${gameDataDirectoryForContext(contextId)}/.MapManager`;
    if (!exists(FS, root)) return null;
    removeTree(FS, root);
    const result = await persist("custom-map-recovery-cleanup");
    return result?.ok ? null : (result?.error || "Old map-manager staging data could not be cleaned up");
  }

  function scanMaps(FS, contextId) {
    const directory = customMapDirectoryForContext(contextId);
    if (!exists(FS, directory)) return [];
    const maps = [];
    for (const name of FS.readdir(directory)) {
      if (name === "." || name === ".." || name.toLowerCase() === "mapcache.ini") continue;
      const root = `${directory}/${name}`;
      let stat;
      try { stat = FS.stat(root); } catch { continue; }
      if (!isDirectory(FS, stat)) continue;
      const mainFile = childName(FS, root, `${name}.map`);
      if (!mainFile) continue;
      const inventory = inventoryTree(FS, root);
      maps.push({
        name,
        path: `${root}/${mainFile}`,
        size: inventory.size,
        fileCount: inventory.fileCount,
        modified: inventory.modified,
        hasPreview: inventory.files.some((path) => /\.tga$/i.test(path)),
        hasStrings: inventory.files.some((path) => /(?:^|\/)map\.str$/i.test(path)),
      });
    }
    return maps.sort((left, right) => left.name.localeCompare(right.name));
  }

  async function listUnlocked(contextId = null) {
    const active = loadActiveModContext(storage);
    const id = String(contextId ?? active.id);
    gameDataDirectoryForContext(id);
    const FS = await filesystem();
    const cleanupWarning = await cleanStaleWorkspaces(FS, id);
    const maps = scanMaps(FS, id);
    return {
      ok: true,
      contextId: id,
      contextLabel: contextDescription(storage, id),
      active: id === active.id,
      maps,
      totalBytes: maps.reduce((sum, map) => sum + map.size, 0),
      cleanupWarning,
    };
  }

  async function commitMutation(FS, contextId, {
    installMaps = [],
    removeNames = [],
    replace = false,
  }) {
    const userDataRoot = gameDataDirectoryForContext(contextId);
    const mapsRoot = customMapDirectoryForContext(contextId);
    const transactionId = String(randomId()).replace(/[^a-zA-Z0-9-]/g, "");
    if (!transactionId) throw new Error("Could not create a custom-map transaction");
    const workspaceRoot = `${userDataRoot}/.MapManager/${transactionId}`;
    const stageRoot = `${workspaceRoot}/stage`;
    const backupRoot = `${workspaceRoot}/backup`;
    mkdirTree(FS, stageRoot);
    mkdirTree(FS, backupRoot);
    mkdirTree(FS, mapsRoot);

    const targetNames = new Map();
    for (const name of FS.readdir(mapsRoot)) {
      if (name !== "." && name !== "..") targetNames.set(name.toLowerCase(), name);
    }
    for (const map of installMaps) {
      const existing = targetNames.get(map.name.toLowerCase());
      if (existing && existing.toLowerCase() !== "mapcache.ini" && !replace) {
        removeWorkspace(FS, userDataRoot, workspaceRoot);
        throw new Error(`${map.name} is already installed`);
      }
      const root = `${stageRoot}/${map.name}`;
      mkdirTree(FS, root);
      for (const file of map.files) {
        const path = `${root}/${file.path}`;
        mkdirTree(FS, path.slice(0, path.lastIndexOf("/")));
        FS.writeFile(path, file.bytes, { canOwn: false });
      }
    }

    const removals = new Map();
    for (const requested of removeNames) {
      const name = normalizeCustomMapName(requested);
      const existing = targetNames.get(name.toLowerCase());
      if (!existing || existing.toLowerCase() === "mapcache.ini") {
        removeWorkspace(FS, userDataRoot, workspaceRoot);
        throw new Error(`${name} is not installed`);
      }
      removals.set(existing.toLowerCase(), existing);
    }
    for (const map of installMaps) {
      const existing = targetNames.get(map.name.toLowerCase());
      if (existing && existing.toLowerCase() !== "mapcache.ini") {
        removals.set(existing.toLowerCase(), existing);
      }
    }

    const movedBackups = [];
    const installedTargets = [];
    let durable = false;
    try {
      for (const existing of removals.values()) {
        const from = `${mapsRoot}/${existing}`;
        const to = `${backupRoot}/${existing}`;
        FS.rename(from, to);
        movedBackups.push({ from, to });
      }
      const cacheName = targetNames.get("mapcache.ini");
      if (cacheName) {
        const from = `${mapsRoot}/${cacheName}`;
        const to = `${backupRoot}/${cacheName}`;
        FS.rename(from, to);
        movedBackups.push({ from, to });
      }
      for (const map of installMaps) {
        const from = `${stageRoot}/${map.name}`;
        const to = `${mapsRoot}/${map.name}`;
        FS.rename(from, to);
        installedTargets.push(to);
      }

      const persisted = await persist("custom-map-update");
      if (!persisted?.ok) throw new Error(persisted?.error || "Custom-map changes could not be persisted");
      durable = true;
      removeWorkspace(FS, userDataRoot, workspaceRoot);
      let cleanup;
      try {
        cleanup = await persist("custom-map-transaction-cleanup");
      } catch (error) {
        cleanup = { ok: false, error: error?.message ?? String(error) };
      }
      return {
        ok: true,
        cleanupWarning: cleanup?.ok
          ? null
          : (cleanup?.error || "Map changes are safe, but old transaction data will be cleaned next launch"),
      };
    } catch (error) {
      if (!durable) {
        for (const target of installedTargets.reverse()) removeTree(FS, target);
        for (const backup of movedBackups.reverse()) {
          if (exists(FS, backup.to)) FS.rename(backup.to, backup.from);
        }
        removeWorkspace(FS, userDataRoot, workspaceRoot);
      }
      throw error;
    }
  }

  async function install(contextId, values, { replace = false } = {}) {
    return serialized(async () => {
      const id = String(contextId ?? loadActiveModContext(storage).id);
      gameDataDirectoryForContext(id);
      const maps = normalizeImportMaps(values);
      const FS = await filesystem();
      await cleanStaleWorkspaces(FS, id);
      const result = await commitMutation(FS, id, { installMaps: maps, replace: replace === true });
      return {
        ...result,
        contextId: id,
        installed: maps.map((map) => map.name),
        maps: scanMaps(FS, id),
      };
    });
  }

  async function remove(contextId, name) {
    return serialized(async () => {
      const id = String(contextId ?? loadActiveModContext(storage).id);
      gameDataDirectoryForContext(id);
      const FS = await filesystem();
      await cleanStaleWorkspaces(FS, id);
      const safeName = normalizeCustomMapName(name);
      const result = await commitMutation(FS, id, { removeNames: [safeName] });
      return {
        ...result,
        contextId: id,
        removed: safeName,
        maps: scanMaps(FS, id),
      };
    });
  }

  return {
    list: (contextId = null) => serialized(() => listUnlocked(contextId)),
    install,
    remove,
  };
}
