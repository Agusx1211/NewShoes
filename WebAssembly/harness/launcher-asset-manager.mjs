import "./launcher-archive-specs.js";

const INSTALLED_KEY = "zeroh-installed-library.v3";
const OLD_INSTALLED_KEYS = ["zeroh-installed-library.v2", "zeroh-installed-library.v1"];
const LIBRARY_VERSION = 3;
const HANDLE_DB = "zeroh-asset-handles";
const HANDLE_STORE = "sources";
const LIBRARY_MUTATION_LOCK = "zeroh-library-mutation";
const REQUIRED_ARCHIVE_NAMES = window.ZeroHArchiveSpecs.map((archive) => archive.name);

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* storage is optional */ }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
        request.result.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeHandles(handles) {
  const db = await openHandleDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, "readwrite");
      transaction.objectStore(HANDLE_STORE).put(handles, "active");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Source permission storage was aborted"));
    });
  } finally {
    db.close();
  }
}

async function readHandles() {
  const db = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get("active");
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function clearHandles() {
  const db = await openHandleDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, "readwrite");
      transaction.objectStore(HANDLE_STORE).delete("active");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Source permission cleanup was aborted"));
    });
  } finally {
    db.close();
  }
}

async function filesFromDirectory(handle, prefix = handle.name) {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    const relativePath = `${prefix}/${name}`;
    if (entry.kind === "directory") {
      files.push(...await filesFromDirectory(entry, relativePath));
    } else {
      const file = await entry.getFile();
      Object.defineProperty(file, "relativePath", { value: relativePath, configurable: true });
      files.push(file);
    }
  }
  return files;
}

async function filesFromHandles(handles, requestPermission = false) {
  const files = [];
  for (const handle of handles) {
    let permission = await handle.queryPermission?.({ mode: "read" });
    if (permission !== "granted" && requestPermission) {
      permission = await handle.requestPermission?.({ mode: "read" });
    }
    if (permission !== "granted") {
      throw new Error(`Permission is required to read ${handle.name}`);
    }
    if (handle.kind === "directory") files.push(...await filesFromDirectory(handle));
    else {
      const file = await handle.getFile();
      Object.defineProperty(file, "relativePath", { value: handle.name, configurable: true });
      files.push(file);
    }
  }
  return files;
}

class AssetLibrary {
  constructor() {
    this.pending = new Map();
    this.sequence = 0;
    this.sourceHandles = [];
    this.scanResult = null;
    this.preparedArchives = null;
    this.queue = Promise.resolve();
    this.rememberedHandlesPromise = readHandles().catch(() => []);
    this.createWorker();
  }

  createWorker() {
    const worker = new Worker("./launcher-asset-worker.js");
    this.worker = worker;
    worker.addEventListener("message", (event) => this.onWorkerMessage(event.data || {}));
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      this.recoverWorker(worker, event.message || "Asset worker crashed");
    });
    worker.addEventListener("messageerror", () => {
      this.recoverWorker(worker, "Asset worker returned an unreadable response");
    });
  }

  recoverWorker(failedWorker, message) {
    if (failedWorker !== this.worker) return;
    failedWorker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error(message));
    this.pending.clear();
    this.createWorker();
  }

  onWorkerMessage(message) {
    if (message.kind === "progress") {
      this.pending.get(message.requestId)?.onProgress?.(message);
      return;
    }
    if (message.kind !== "result") return;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || "Asset worker failed"));
  }

  request(kind, payload = {}, onProgress = null) {
    const execute = () => {
      const requestId = ++this.sequence;
      return new Promise((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject, onProgress });
        try {
          this.worker.postMessage({ ...payload, kind, requestId });
        } catch (error) {
          this.pending.delete(requestId);
          reject(error);
        }
      });
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.catch(() => {});
    return result;
  }

  async pickImages() {
    if (typeof window.showOpenFilePicker !== "function") return null;
    const handles = await window.showOpenFilePicker({
      multiple: true,
      types: [{
        description: "Original Generals disc images",
        accept: { "application/octet-stream": [".iso", ".bin", ".img", ".cue", ".cab", ".big"] },
      }],
    });
    const files = await filesFromHandles(handles, true);
    this.sourceHandles = handles;
    return files;
  }

  async pickFolder() {
    if (typeof window.showDirectoryPicker !== "function") return null;
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const files = await filesFromHandles([handle], true);
    this.sourceHandles = [handle];
    return files;
  }

  async scan(files, { handles = null, onProgress = null } = {}) {
    if (window.ZeroHRuntime?.started) {
      throw new Error("Reload ZeroH before changing game files after the engine has started");
    }
    await this.discardPreparedArchives();
    this.sourceHandles = handles ? [...handles] : [];
    this.scanResult = null;
    const sources = [...files].map((file) => ({
      file,
      path: file.relativePath || file.webkitRelativePath || file.name,
    }));
    this.scanResult = await this.request("scan", { files: sources }, onProgress);
    return this.scanResult;
  }

  async clearSource() {
    if (window.ZeroHRuntime?.started) {
      throw new Error("Reload ZeroH before changing game files after the engine has started");
    }
    await this.discardPreparedArchives();
    this.sourceHandles = [];
    this.scanResult = null;
  }

  async waitForRpc() {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (window.CnCPort?.rpc) return window.CnCPort.rpc.bind(window.CnCPort);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Game runtime bridge did not become ready");
  }

  async allocateNamespace() {
    const rpc = await this.waitForRpc();
    const allocation = await rpc("allocateArchiveNamespace", {});
    if (allocation?.ok !== true || !allocation.namespaceRoot) {
      throw new Error(allocation?.error || "Could not allocate browser asset storage");
    }
    return allocation.namespaceRoot;
  }

  async prepare(mode, onProgress = null) {
    if (!["once", "remember", "install"].includes(mode)) {
      throw new Error(`Unsupported launcher storage mode: ${mode}`);
    }
    if (mode === "install") return this.withLibraryMutation(() => this.prepareUnlocked(mode, onProgress));
    return this.prepareUnlocked(mode, onProgress);
  }

  withLibraryMutation(callback) {
    return navigator.locks?.request
      ? navigator.locks.request(LIBRARY_MUTATION_LOCK, { mode: "exclusive" }, callback)
      : callback();
  }

  async prepareUnlocked(mode, onProgress = null) {
    if (!this.scanResult?.ok) throw new Error("Select complete Generals + Zero Hour original media first");
    const estimate = await navigator.storage?.estimate?.();
    const quota = Number(estimate?.quota);
    const usage = Number(estimate?.usage);
    const available = quota - usage;
    const required = this.scanResult.totalBytes * (mode === "install" ? 2.05 : 1.05);
    if (Number.isFinite(quota) && quota > 0 && Number.isFinite(usage) && available < required) {
      throw new Error(`Browser storage needs about ${formatBytes(required)} free; ${formatBytes(available)} is available`);
    }
    let persistenceGranted = null;
    if (mode === "install") {
      // The installed library remains persistent while a per-tab runtime copy
      // is staged for exclusive synchronous access handles.
      persistenceGranted = await navigator.storage?.persist?.().catch(() => false) ?? false;
    }
    const namespaceRoot = await this.allocateNamespace();
    const installRoot = mode === "install"
      ? `cnc-library/install-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
      : null;
    const previousInstall = this.installedLibrary();
    try {
      const result = await this.request("prepare", {
        mode,
        namespaceRoot,
        installRoot,
      }, onProgress);
      this.preparedArchives = result.archives;
      result.effectiveMode = mode;
      if (mode === "install" && !persistenceGranted) {
        result.warning = {
          title: "Persistent storage not granted",
          message: "The library is installed, but this browser may reclaim it automatically when storage is low.",
        };
      }
      if (mode === "install" && result.installed) {
        const manifest = {
          version: LIBRARY_VERSION,
          game: "zeroHour",
          root: installRoot,
          preparedAt: Date.now(),
          totalBytes: result.installed.reduce((sum, archive) => sum + archive.bytes, 0),
          archives: result.installed,
        };
        if (!storageSet(INSTALLED_KEY, JSON.stringify(manifest))) {
          throw new Error("Browser storage could not save the installed-library manifest");
        }
        OLD_INSTALLED_KEYS.forEach(storageRemove);
        await this.clearRememberedHandles();
        if (previousInstall?.root && previousInstall.root !== installRoot) {
          await this.request("discard", { path: previousInstall.root }).catch(() => {});
        }
      } else {
        if (mode === "remember" && this.sourceHandles.length) {
          try {
            await storeHandles(this.sourceHandles);
            this.rememberedHandlesPromise = Promise.resolve([...this.sourceHandles]);
          } catch {
            result.effectiveMode = "once";
            result.warning = {
              title: "Source permission not retained",
              message: "This browser could not retain the source permission; files remain ready for this session.",
            };
          }
        } else if (mode === "remember") {
          result.effectiveMode = "once";
          result.warning = {
            title: "Source permission not retained",
            message: "This source does not expose a reusable browser permission; files remain ready for this session.",
          };
        }
        if (result.effectiveMode !== "remember") await this.clearRememberedHandles();
        storageRemove(INSTALLED_KEY);
        OLD_INSTALLED_KEYS.forEach(storageRemove);
        if (previousInstall?.root) {
          await this.request("discard", { path: previousInstall.root }).catch(() => {});
        }
      }
      return result;
    } catch (error) {
      await this.request("discard", { path: namespaceRoot }).catch(() => {});
      if (installRoot) await this.request("discard", { path: installRoot }).catch(() => {});
      throw error;
    }
  }

  installedLibrary() {
    try {
      const value = JSON.parse(storageGet(INSTALLED_KEY) || "null");
      if (value?.version !== LIBRARY_VERSION
          || value?.game !== "zeroHour"
          || !/^cnc-library\/install-[a-z0-9-]+$/i.test(value.root ?? "")
          || !Array.isArray(value.archives)
          || value.archives.length !== REQUIRED_ARCHIVE_NAMES.length) return null;
      const names = new Set(value.archives.map((archive) => archive?.name));
      if (names.size !== REQUIRED_ARCHIVE_NAMES.length
          || REQUIRED_ARCHIVE_NAMES.some((name) => !names.has(name))) return null;
      if (value.archives.some((archive) => archive.opfsPath !== `${value.root}/${archive.name}`
          || !Number.isSafeInteger(archive.bytes) || archive.bytes <= 16)) return null;
      const totalBytes = value.archives.reduce((sum, archive) => sum + archive.bytes, 0);
      if (!Number.isSafeInteger(value.totalBytes) || value.totalBytes !== totalBytes) return null;
      return value;
    } catch {
      return null;
    }
  }

  async verifyInstalledLibrary() {
    return this.withLibraryMutation(() => this.verifyInstalledLibraryUnlocked());
  }

  async verifyInstalledLibraryUnlocked() {
    const installed = this.installedLibrary();
    OLD_INSTALLED_KEYS.forEach(storageRemove);
    if (!installed) {
      storageRemove(INSTALLED_KEY);
      await this.collectInstalledRoots(null);
      return null;
    }
    try {
      let directory = await navigator.storage.getDirectory();
      for (const part of installed.root.split("/")) {
        directory = await directory.getDirectoryHandle(part, { create: false });
      }
      for (const archive of installed.archives) {
        const file = await (await directory.getFileHandle(archive.name, { create: false })).getFile();
        if (file.size !== archive.bytes) throw new Error(`${archive.name} size changed`);
      }
      await this.collectInstalledRoots(installed.root);
      return installed;
    } catch {
      storageRemove(INSTALLED_KEY);
      await this.collectInstalledRoots(null);
      return null;
    }
  }

  async collectInstalledRoots(keepRoot) {
    const keepName = keepRoot?.split("/").at(-1) || null;
    try {
      const root = await navigator.storage.getDirectory();
      const library = await root.getDirectoryHandle("cnc-library", { create: false });
      for await (const [name, entry] of library.entries()) {
        const managed = entry.kind === "directory"
          && (name === "v1" || /^install-[a-z0-9-]+$/i.test(name));
        if (managed && name !== keepName) {
          try { await library.removeEntry(name, { recursive: true }); } catch { /* live/locked root */ }
        }
      }
    } catch {
      // No legacy/orphaned install roots, or another live page still owns one.
    }
  }

  async restoreRemembered({ requestPermission = false, onProgress = null } = {}) {
    let handles = await this.rememberedHandlesPromise;
    if (!handles.length) {
      handles = await readHandles().catch(() => []);
      this.rememberedHandlesPromise = Promise.resolve(handles);
    }
    if (!handles.length) return null;
    const files = await filesFromHandles(handles, requestPermission);
    this.sourceHandles = handles;
    return this.scan(files, { handles, onProgress });
  }

  async hasRememberedSource() {
    const handles = await readHandles().catch(() => []);
    this.rememberedHandlesPromise = Promise.resolve(handles);
    return handles.length > 0;
  }

  async clearRememberedHandles() {
    try { await clearHandles(); } catch { /* IDB may be unavailable */ }
    this.rememberedHandlesPromise = Promise.resolve([]);
  }

  async archivesForLaunch(onProgress = null) {
    if (this.preparedArchives?.length) return this.preparedArchives;
    const installed = this.installedLibrary();
    if (installed) {
      const namespaceRoot = await this.allocateNamespace();
      const result = await this.request("loadInstalled", {
        namespaceRoot,
        installRoot: installed.root,
        archives: installed.archives,
      }, onProgress);
      this.preparedArchives = result.archives;
      return this.preparedArchives;
    }
    throw new Error("Prepare your game library before launching");
  }

  async forget() {
    return this.withLibraryMutation(() => this.forgetUnlocked());
  }

  async forgetUnlocked() {
    await this.discardPreparedArchives();
    this.scanResult = null;
    this.sourceHandles = [];
    storageRemove(INSTALLED_KEY);
    OLD_INSTALLED_KEYS.forEach(storageRemove);
    await this.clearRememberedHandles();
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("cnc-library", { recursive: true });
    } catch {
      // No installed OPFS library (or a live tab still has it open).
    }
  }

  async discardPreparedArchives() {
    const roots = new Set((this.preparedArchives || []).map((archive) =>
      String(archive.opfsPath || "").split("/").slice(0, 2).join("/")));
    this.preparedArchives = null;
    for (const path of roots) {
      if (path) await this.request("discard", { path }).catch(() => {});
    }
  }

  summary() {
    const installed = this.installedLibrary();
    return {
      installed: Boolean(installed),
      totalBytes: installed?.totalBytes || this.scanResult?.totalBytes || 0,
      formattedBytes: formatBytes(installed?.totalBytes || this.scanResult?.totalBytes || 0),
      ready: Boolean(this.preparedArchives?.length || installed),
    };
  }
}

export const assetLibrary = new AssetLibrary();
window.ZeroHAssetLibrary = assetLibrary;
