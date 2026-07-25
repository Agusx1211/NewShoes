import { loadActiveModContext, modContextPaths } from "./mod-context.mjs";

const IDBFS_VERSION = 21;
const STORE_NAME = "FILE_DATA";
const DIRECTORY_MODE = 0o40777;
const FILE_MODE = 0o100666;
const AUTOSAVE_DB = "cnc-world-builder";
const AUTOSAVE_STORE = "documents";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed")), {
      once: true,
    });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted")), {
      once: true,
    });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed")), {
      once: true,
    });
  });
}

function safeMapName(value) {
  const name = String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/g, "")
    .trim()
    .slice(0, 120);
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
    throw new Error("Choose a valid map name");
  }
  return name;
}

function safeSidecarName(value) {
  const name = String(value ?? "").replaceAll("\\", "/").split("/").at(-1);
  if (!name || name === "." || name === ".." || /[<>:"/\\|?*\u0000-\u001f]/.test(name)) {
    throw new Error("Map sidecar has an invalid filename");
  }
  return name.slice(0, 180);
}

function openIdbfs(databaseName, indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) throw new Error("IndexedDB is unavailable; maps cannot be saved");
  const request = indexedDBImpl.open(databaseName, IDBFS_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    let store;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      store = database.createObjectStore(STORE_NAME);
    } else {
      store = request.transaction.objectStore(STORE_NAME);
    }
    if (!store.indexNames.contains("timestamp")) store.createIndex("timestamp", "timestamp");
  });
  return requestResult(request);
}

function openAutosaves(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) throw new Error("IndexedDB is unavailable; autosave is disabled");
  const request = indexedDBImpl.open(AUTOSAVE_DB, 1);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(AUTOSAVE_STORE)) {
      database.createObjectStore(AUTOSAVE_STORE, { keyPath: "contextId" });
    }
  });
  return requestResult(request);
}

function contextInfo(storage) {
  const context = loadActiveModContext(storage);
  const paths = modContextPaths(context);
  return {
    context,
    paths,
    mapsDir: `${paths.userDataDir}/Maps`,
  };
}

export class WorldBuilderStore {
  constructor({
    indexedDBImpl = globalThis.indexedDB,
    storage = globalThis.localStorage,
    getRuntimeFilesystem = () => globalThis.CnCPort?.engineModule?.()?.FS ?? null,
    persistRuntime = (reason) => globalThis.CnCPort?.persistSaves?.(reason),
  } = {}) {
    this.indexedDB = indexedDBImpl;
    this.storage = storage;
    this.getRuntimeFilesystem = getRuntimeFilesystem;
    this.persistRuntime = persistRuntime;
  }

  context() {
    return contextInfo(this.storage);
  }

  async #database() {
    return openIdbfs(this.context().paths.userDataDir, this.indexedDB);
  }

  #runtimeFilesystem() {
    try {
      return this.getRuntimeFilesystem?.() || null;
    } catch {
      return null;
    }
  }

  #mkdirTree(filesystem, path) {
    let current = "";
    for (const part of String(path).split("/").filter(Boolean)) {
      current += `/${part}`;
      try {
        filesystem.mkdir(current);
      } catch (error) {
        try {
          filesystem.stat(current);
        } catch {
          throw error;
        }
      }
    }
  }

  async #saveRuntimePackage(folder, path, data, sidecars) {
    const filesystem = this.#runtimeFilesystem();
    if (!filesystem) return false;
    this.#mkdirTree(filesystem, folder);
    filesystem.writeFile(path, data);
    const keep = new Set([path.slice(folder.length + 1)]);
    for (const [filename, value] of sidecars) {
      const sidecarName = safeSidecarName(filename);
      const sidecar = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
      if (!sidecar.byteLength) continue;
      keep.add(sidecarName);
      filesystem.writeFile(`${folder}/${sidecarName}`, sidecar);
    }
    for (const filename of filesystem.readdir(folder)) {
      if (filename === "." || filename === ".." || keep.has(filename)) continue;
      try {
        const candidate = `${folder}/${filename}`;
        const stat = filesystem.stat(candidate);
        if (typeof filesystem.isFile !== "function" || filesystem.isFile(stat.mode)) {
          filesystem.unlink(candidate);
        }
      } catch {
        // A concurrently replaced sidecar can disappear between readdir and stat.
      }
    }
    const persisted = await this.persistRuntime?.("world-builder-save");
    if (persisted?.ok !== true) return false;
    return true;
  }

  async #deleteRuntimePackage(folder) {
    const filesystem = this.#runtimeFilesystem();
    if (!filesystem) return false;
    try {
      for (const filename of filesystem.readdir(folder)) {
        if (filename === "." || filename === "..") continue;
        const candidate = `${folder}/${filename}`;
        const stat = filesystem.stat(candidate);
        if (typeof filesystem.isFile !== "function" || filesystem.isFile(stat.mode)) {
          filesystem.unlink(candidate);
        }
      }
      filesystem.rmdir(folder);
    } catch {
      return false;
    }
    const persisted = await this.persistRuntime?.("world-builder-delete");
    return persisted?.ok === true;
  }

  async listMaps() {
    const { mapsDir } = this.context();
    const database = await this.#database();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const done = transactionDone(transaction);
      const keysRequest = store.getAllKeys();
      const recordsRequest = store.getAll();
      const [keys, records] = await Promise.all([
        requestResult(keysRequest),
        requestResult(recordsRequest),
      ]);
      const mapPaths = keys
        .filter((key) => typeof key === "string"
          && key.startsWith(`${mapsDir}/`)
          && /\.map$/i.test(key))
        .sort((left, right) => left.localeCompare(right));
      const byPath = new Map(keys.map((key, index) => [key, records[index]]));
      const maps = mapPaths.map((path) => {
        const record = byPath.get(path);
        const relative = path.slice(mapsDir.length + 1);
        const parts = relative.split("/");
        return {
          name: parts.length > 1 ? parts[0] : parts.at(-1).replace(/\.map$/i, ""),
          path,
          bytes: record?.contents?.byteLength || 0,
          modifiedAt: record?.timestamp instanceof Date
            ? record.timestamp.toISOString()
            : new Date(record?.timestamp || 0).toISOString(),
          sidecars: keys.filter((key) => typeof key === "string"
            && key.startsWith(`${path.slice(0, path.lastIndexOf("/"))}/`)
            && key !== path
            && byPath.get(key)?.contents).length,
        };
      });
      await done;
      return maps;
    } finally {
      database.close();
    }
  }

  async readMap(path) {
    const { mapsDir } = this.context();
    if (typeof path !== "string" || !path.startsWith(`${mapsDir}/`) || !/\.map$/i.test(path)) {
      throw new Error("Map path is outside the active game profile");
    }
    const database = await this.#database();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const done = transactionDone(transaction);
      const record = await requestResult(transaction.objectStore(STORE_NAME).get(path));
      await done;
      if (!record?.contents) throw new Error("Map no longer exists");
      return new Uint8Array(record.contents);
    } finally {
      database.close();
    }
  }

  async readMapPackage(path) {
    const { mapsDir } = this.context();
    if (typeof path !== "string" || !path.startsWith(`${mapsDir}/`) || !/\.map$/i.test(path)) {
      throw new Error("Map path is outside the active game profile");
    }
    const folder = path.slice(0, path.lastIndexOf("/"));
    const database = await this.#database();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const done = transactionDone(transaction);
      const [keys, records] = await Promise.all([
        requestResult(store.getAllKeys()),
        requestResult(store.getAll()),
      ]);
      await done;
      const files = new Map();
      keys.forEach((key, index) => {
        if (typeof key !== "string" || !key.startsWith(`${folder}/`) || !records[index]?.contents) return;
        files.set(key.slice(folder.length + 1), new Uint8Array(records[index].contents));
      });
      const contents = files.get(path.slice(folder.length + 1));
      if (!contents) throw new Error("Map no longer exists");
      files.delete(path.slice(folder.length + 1));
      return { contents, sidecars: files };
    } finally {
      database.close();
    }
  }

  async saveMap(name, contents, sidecars = new Map()) {
    const mapName = safeMapName(name);
    const data = contents instanceof Uint8Array ? new Uint8Array(contents) : new Uint8Array(contents);
    if (!data.byteLength) throw new Error("Cannot save an empty map");
    const { paths, mapsDir } = this.context();
    const folder = `${mapsDir}/${mapName}`;
    const path = `${folder}/${mapName}.map`;
    const timestamp = new Date();
    const entries = sidecars instanceof Map ? sidecars : new Map(Object.entries(sidecars || {}));
    if (await this.#saveRuntimePackage(folder, path, data, entries)) {
      return {
        name: mapName,
        path,
        bytes: data.byteLength,
        modifiedAt: timestamp.toISOString(),
        sidecars: entries.size,
      };
    }
    const database = await this.#database();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const done = transactionDone(transaction);
      store.put({ timestamp, mode: DIRECTORY_MODE }, paths.userDataDir);
      store.put({ timestamp, mode: DIRECTORY_MODE }, mapsDir);
      store.put({ timestamp, mode: DIRECTORY_MODE }, folder);
      store.put({ timestamp, mode: FILE_MODE, contents: data }, path);
      for (const [filename, value] of entries) {
        const sidecarName = safeSidecarName(filename);
        const sidecar = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
        if (sidecar.byteLength) {
          store.put({ timestamp, mode: FILE_MODE, contents: sidecar }, `${folder}/${sidecarName}`);
        }
      }
      await done;
      return {
        name: mapName,
        path,
        bytes: data.byteLength,
        modifiedAt: timestamp.toISOString(),
        sidecars: entries.size,
      };
    } finally {
      database.close();
    }
  }

  async deleteMap(path) {
    const { mapsDir } = this.context();
    if (typeof path !== "string" || !path.startsWith(`${mapsDir}/`) || !/\.map$/i.test(path)) {
      throw new Error("Map path is outside the active game profile");
    }
    const folder = path.slice(0, path.lastIndexOf("/"));
    if (await this.#deleteRuntimePackage(folder)) return;
    const database = await this.#database();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const done = transactionDone(transaction);
      const keys = await requestResult(store.getAllKeys());
      for (const key of keys) {
        if (key === folder || (typeof key === "string" && key.startsWith(`${folder}/`))) store.delete(key);
      }
      await done;
    } finally {
      database.close();
    }
  }

  async saveAutosave(name, contents, summary = null) {
    const { context } = this.context();
    const database = await openAutosaves(this.indexedDB);
    try {
      const transaction = database.transaction(AUTOSAVE_STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(AUTOSAVE_STORE).put({
        contextId: context.id,
        contextLabel: context.label,
        name: safeMapName(name),
        contents: new Uint8Array(contents),
        summary,
        modifiedAt: new Date().toISOString(),
      });
      await done;
    } finally {
      database.close();
    }
  }

  async readAutosave() {
    const { context } = this.context();
    const database = await openAutosaves(this.indexedDB);
    try {
      const transaction = database.transaction(AUTOSAVE_STORE, "readonly");
      const done = transactionDone(transaction);
      const record = await requestResult(transaction.objectStore(AUTOSAVE_STORE).get(context.id));
      await done;
      return record ? { ...record, contents: new Uint8Array(record.contents) } : null;
    } finally {
      database.close();
    }
  }

  async clearAutosave() {
    const { context } = this.context();
    const database = await openAutosaves(this.indexedDB);
    try {
      const transaction = database.transaction(AUTOSAVE_STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(AUTOSAVE_STORE).delete(context.id);
      await done;
    } finally {
      database.close();
    }
  }
}

export const WorldBuilderStorage = Object.freeze({
  safeMapName,
  safeSidecarName,
  contextInfo,
  requestResult,
  transactionDone,
  DIRECTORY_MODE,
  FILE_MODE,
  STORE_NAME,
});
