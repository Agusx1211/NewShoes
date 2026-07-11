const INSTALLED_KEY = "zeroh-installed-library.v1";
const HANDLE_DB = "zeroh-asset-handles";
const HANDLE_STORE = "sources";

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
      const request = db.transaction(HANDLE_STORE, "readwrite").objectStore(HANDLE_STORE).delete("active");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
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
    this.worker = new Worker("./launcher-asset-worker.js");
    this.pending = new Map();
    this.sequence = 0;
    this.sourceHandles = [];
    this.scanResult = null;
    this.preparedArchives = null;
    this.progressHandler = null;
    this.worker.addEventListener("message", (event) => this.onWorkerMessage(event.data || {}));
  }

  onWorkerMessage(message) {
    if (message.kind === "progress") {
      this.progressHandler?.(message);
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
    const requestId = ++this.sequence;
    this.progressHandler = onProgress;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ ...payload, kind, requestId });
    }).finally(() => {
      this.progressHandler = null;
    });
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
    if (handles) this.sourceHandles = handles;
    this.preparedArchives = null;
    const sources = [...files].map((file) => ({
      file,
      path: file.relativePath || file.webkitRelativePath || file.name,
    }));
    this.scanResult = await this.request("scan", { files: sources }, onProgress);
    return this.scanResult;
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
    if (!this.scanResult?.ok) throw new Error("Select a complete Generals + Zero Hour asset source first");
    if (mode === "install") {
      const estimate = await navigator.storage?.estimate?.();
      const available = Number(estimate?.quota || 0) - Number(estimate?.usage || 0);
      // The installed library remains persistent while a per-tab runtime copy
      // is staged for exclusive synchronous access handles.
      const required = this.scanResult.totalBytes * 2.05;
      if (available > 0 && available < required) {
        throw new Error(`Browser storage needs about ${formatBytes(required)} free; ${formatBytes(available)} is available`);
      }
      await navigator.storage?.persist?.().catch(() => false);
    }
    const namespaceRoot = await this.allocateNamespace();
    const result = await this.request("prepare", {
      mode,
      namespaceRoot,
      installRoot: "cnc-library/v1",
    }, onProgress);
    this.preparedArchives = result.archives;
    if (mode === "install" && result.installed) {
      localStorage.setItem(INSTALLED_KEY, JSON.stringify({
        version: 1,
        preparedAt: Date.now(),
        totalBytes: result.installed.reduce((sum, archive) => sum + archive.bytes, 0),
        archives: result.installed,
      }));
    } else if (mode === "remember" && this.sourceHandles.length) {
      await storeHandles(this.sourceHandles);
    }
    return result;
  }

  installedLibrary() {
    try {
      const value = JSON.parse(localStorage.getItem(INSTALLED_KEY) || "null");
      return value?.version === 1 && Array.isArray(value.archives) ? value : null;
    } catch {
      return null;
    }
  }

  async restoreRemembered({ requestPermission = false, onProgress = null } = {}) {
    const handles = await readHandles().catch(() => []);
    if (!handles.length) return null;
    const files = await filesFromHandles(handles, requestPermission);
    this.sourceHandles = handles;
    return this.scan(files, { handles, onProgress });
  }

  async archivesForLaunch(onProgress = null) {
    if (this.preparedArchives?.length) return this.preparedArchives;
    const installed = this.installedLibrary();
    if (installed) {
      const namespaceRoot = await this.allocateNamespace();
      const result = await this.request("loadInstalled", {
        namespaceRoot,
        archives: installed.archives,
      }, onProgress);
      this.preparedArchives = result.archives;
      return this.preparedArchives;
    }
    throw new Error("Prepare your game library before launching");
  }

  async forget() {
    this.preparedArchives = null;
    this.scanResult = null;
    this.sourceHandles = [];
    localStorage.removeItem(INSTALLED_KEY);
    await clearHandles().catch(() => {});
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("cnc-library", { recursive: true });
    } catch {
      // No installed OPFS library (or a live tab still has it open).
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
