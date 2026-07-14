import {
  MOD_ACTIVE_CONTEXT_KEY,
  MOD_CONTEXT_HISTORY_KEY,
  MOD_LIBRARY_KEY,
  createModContext,
  loadActiveModContext,
  loadModLibrary,
  normalizeInstalledMod,
  saveActiveModContext,
  saveModLibrary,
  vanillaModContext,
} from "./mod-context.mjs";
import { Sha256, modContentHash } from "./mod-package-format.mjs";

const TRANSFER_SCHEMA = 1;
const MOD_ID_PATTERN = /^mod-[a-f0-9-]{8,64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ARCHIVE_NAME_PATTERN = /^[A-Za-z0-9._ -]+\.big$/i;
const MAX_TRANSFER_MODS = 512;
const MAX_TRANSFER_ARCHIVES = 512;

function safeTransferText(value, maxLength, fallback = null) {
  const text = String(value ?? "").trim();
  return text && text.length <= maxLength ? text : fallback;
}

function storedValue(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function restoreStoredValue(storage, key, value) {
  if (!storage) return;
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

async function opfsFile(path) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  let directory = await navigator.storage.getDirectory();
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: false });
  return (await directory.getFileHandle(name, { create: false })).getFile();
}

async function fileSha256(file) {
  const hash = new Sha256();
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return hash.digestHex();
    hash.update(value);
  }
}

async function installedModFilesMatch(mod, contentHash) {
  if (modContentHash(mod.archives) !== contentHash) return false;
  for (const archive of mod.archives) {
    const file = await opfsFile(archive.opfsPath);
    if (file.size !== archive.size || await fileSha256(file) !== archive.sha256) return false;
  }
  return true;
}

async function createOpfsWriter(path) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  let directory = await navigator.storage.getDirectory();
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
  const handle = await directory.getFileHandle(name, { create: true });
  return { handle, writer: await handle.createWritable() };
}

async function removeOpfsRoot(path) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return;
  try {
    let directory = await navigator.storage.getDirectory();
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: false });
    await directory.removeEntry(name, { recursive: true });
  } catch (error) {
    if (error?.name !== "NotFoundError") throw error;
  }
}

function normalizeTransferFiles(values) {
  const files = Array.from(values ?? [], (value) => ({
    id: String(value?.id ?? ""),
    kind: String(value?.kind ?? ""),
    name: String(value?.name ?? ""),
    bytes: Number(value?.bytes),
  }));
  const ids = new Set(files.map((file) => file.id));
  if (files.some((file) => !file.id || file.id.length > 160 || file.kind !== "mod-archive"
      || !ARCHIVE_NAME_PATTERN.test(file.name) || file.name.length > 160
      || !Number.isSafeInteger(file.bytes) || file.bytes <= 0)
      || ids.size !== files.length) {
    throw new Error("Transferred mod file list is invalid");
  }
  return files;
}

function normalizeTransferSnapshot(value, fileValues) {
  const files = normalizeTransferFiles(fileValues);
  if (value?.schema !== TRANSFER_SCHEMA || !Array.isArray(value.mods)
      || value.mods.length === 0 || value.mods.length > MAX_TRANSFER_MODS
      || !Array.isArray(value.activeModIds)) {
    throw new Error("Transferred mod library is invalid");
  }
  const byFileId = new Map(files.map((file) => [file.id, file]));
  const referencedFiles = new Set();
  const mods = value.mods.map((input) => {
    const id = String(input?.id ?? "");
    const name = safeTransferText(input?.name, 120);
    const contentHash = String(input?.contentHash ?? "").toLowerCase();
    if (!MOD_ID_PATTERN.test(id) || !name || !SHA256_PATTERN.test(contentHash)
        || !Array.isArray(input.archives) || input.archives.length === 0
        || input.archives.length > MAX_TRANSFER_ARCHIVES) {
      throw new Error("Transferred mod metadata is invalid");
    }
    const archives = input.archives.map((archive) => {
      const fileId = String(archive?.fileId ?? "");
      const file = byFileId.get(fileId);
      const archiveName = String(archive?.name ?? "");
      const size = Number(archive?.size);
      const sha256 = String(archive?.sha256 ?? "").toLowerCase();
      if (!file || referencedFiles.has(fileId) || archiveName !== file.name || size !== file.bytes
          || !SHA256_PATTERN.test(sha256)) {
        throw new Error("Transferred mod archive metadata is invalid");
      }
      referencedFiles.add(fileId);
      return { fileId, name: archiveName, size, sha256, enabled: archive.enabled !== false };
    });
    if (modContentHash(archives) !== contentHash) {
      throw new Error(`${name} has an invalid transferred content identity`);
    }
    return {
      id,
      name,
      version: safeTransferText(input.version, 80, "Unknown"),
      sourceName: safeTransferText(input.sourceName, 255, name),
      contentHash,
      archives,
      warnings: Array.isArray(input.warnings)
        ? input.warnings.map((warning) => safeTransferText(warning, 500)).filter(Boolean).slice(0, 100)
        : [],
      installedAt: safeTransferText(input.installedAt, 40),
    };
  });
  if (referencedFiles.size !== files.length
      || new Set(mods.map((mod) => mod.id)).size !== mods.length) {
    throw new Error("Transferred mod library contains duplicate or unowned files");
  }
  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const activeIds = value.activeModIds.map((id) => String(id));
  if (new Set(activeIds).size !== activeIds.length || activeIds.some((id) => !byId.has(id))) {
    throw new Error("Transferred active mod order is invalid");
  }
  return { mods, activeIds, files };
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultWorkerFactory() {
  return new Worker(new URL("./mod-package-worker.mjs", import.meta.url), { type: "module" });
}

export class ModPackageStore {
  constructor({
    storage = globalThis.localStorage,
    workerFactory = defaultWorkerFactory,
    onProgress = null,
  } = {}) {
    this.storage = storage;
    this.workerFactory = workerFactory;
    this.onProgress = onProgress;
    this.worker = null;
    this.pending = new Map();
    this.incomingTransfer = false;
  }

  list() {
    return [...loadModLibrary(this.storage).mods];
  }

  active() {
    return loadActiveModContext(this.storage);
  }

  #assertMutable() {
    if (this.incomingTransfer) throw new Error("A mod transfer is still being received");
  }

  #ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.addEventListener("message", (event) => {
      const message = event.data ?? {};
      if (message.kind === "progress") {
        this.onProgress?.(message);
        return;
      }
      if (message.kind !== "result") return;
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "Mod operation failed"));
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Mod package worker failed");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  #request(command, payload = {}) {
    const id = requestId();
    const worker = this.#ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ command, requestId: id, ...payload });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async importFiles(files, { name = "", version = "" } = {}) {
    this.#assertMutable();
    const selected = Array.from(files ?? []);
    if (selected.length === 0) throw new Error("Choose a mod package or folder first");
    // Installed mods are durable product data, just like an installed retail
    // library. A denied request does not block import, but asking here protects
    // large libraries from automatic eviction where the browser allows it.
    await globalThis.navigator?.storage?.persist?.().catch(() => false);
    const importedValue = await this.#request("import", { files: selected, name, version });
    const imported = normalizeInstalledMod(importedValue);
    if (!imported) throw new Error("The importer returned invalid mod metadata");
    const library = loadModLibrary(this.storage);
    const duplicate = library.mods.find((mod) => mod.contentHash === imported.contentHash);
    if (duplicate) {
      await this.#request("remove", { root: `cnc-mods/${imported.id}` }).catch(() => {});
      return { mod: duplicate, duplicate: true };
    }
    saveModLibrary(this.storage, { schema: 1, mods: [...library.mods, imported] });
    return { mod: imported, duplicate: false };
  }

  async remove(modId) {
    this.#assertMutable();
    const id = String(modId ?? "");
    const library = loadModLibrary(this.storage);
    const mod = library.mods.find((candidate) => candidate.id === id);
    if (!mod) throw new Error("Installed mod was not found");
    if (this.active().mods.some((candidate) => candidate.id === id)) {
      throw new Error("Disable this mod and apply the new launch configuration before removing it");
    }
    await this.#request("remove", { root: `cnc-mods/${id}` });
    saveModLibrary(this.storage, {
      schema: 1,
      mods: library.mods.filter((candidate) => candidate.id !== id),
    });
    return mod;
  }

  setArchiveEnabled(modId, opfsPath, enabled) {
    this.#assertMutable();
    const id = String(modId ?? "");
    const path = String(opfsPath ?? "");
    const library = loadModLibrary(this.storage);
    const mod = library.mods.find((candidate) => candidate.id === id);
    if (!mod) throw new Error("Installed mod was not found");
    if (!mod.archives.some((archive) => archive.opfsPath === path)) {
      throw new Error("Mod archive was not found");
    }
    const updated = {
      ...mod,
      archives: mod.archives.map((archive) => archive.opfsPath === path
        ? { ...archive, enabled: Boolean(enabled) }
        : archive),
    };
    saveModLibrary(this.storage, {
      schema: 1,
      mods: library.mods.map((candidate) => candidate.id === id ? updated : candidate),
    });
    return normalizeInstalledMod(updated);
  }

  async apply(modIds) {
    this.#assertMutable();
    const ids = Array.from(modIds ?? [], (value) => String(value));
    if (new Set(ids).size !== ids.length) throw new Error("A mod can only be enabled once");
    const byId = new Map(loadModLibrary(this.storage).mods.map((mod) => [mod.id, mod]));
    const mods = ids.map((id) => byId.get(id));
    if (mods.some((mod) => !mod)) throw new Error("The launch configuration references a missing mod");
    if (mods.some((mod) => !mod.archives.some((archive) => archive.enabled))) {
      throw new Error("Select at least one archive for every enabled mod");
    }
    const context = await createModContext(mods);
    saveActiveModContext(this.storage, context);
    return context;
  }

  async useVanilla() {
    this.#assertMutable();
    saveActiveModContext(this.storage, vanillaModContext());
    return vanillaModContext();
  }

  async createTransferSource() {
    const mods = this.list();
    const active = this.active();
    const files = [];
    const snapshots = new Map();
    const transferredMods = [];
    for (const mod of mods) {
      const archives = [];
      for (const archive of mod.archives) {
        const file = await opfsFile(archive.opfsPath);
        if (file.size !== archive.size) throw new Error(`${mod.name}: ${archive.name} changed before transfer`);
        const descriptor = {
          id: `mod-archive-${files.length + 1}`,
          kind: "mod-archive",
          name: archive.name,
          bytes: archive.size,
        };
        files.push(descriptor);
        snapshots.set(descriptor.id, file);
        archives.push({
          fileId: descriptor.id,
          name: archive.name,
          size: archive.size,
          sha256: archive.sha256,
          enabled: archive.enabled,
        });
      }
      transferredMods.push({
        id: mod.id,
        name: mod.name,
        version: mod.version,
        sourceName: mod.sourceName,
        contentHash: mod.contentHash,
        archives,
        warnings: [...mod.warnings],
        installedAt: mod.installedAt,
      });
    }
    return {
      manifest: {
        schema: TRANSFER_SCHEMA,
        mods: transferredMods,
        activeModIds: active.mods.map((mod) => mod.id),
      },
      files,
      async readChunk(id, offset, length) {
        const file = snapshots.get(id);
        if (!file || !Number.isSafeInteger(offset) || offset < 0
            || !Number.isSafeInteger(length) || length < 0 || offset + length > file.size) {
          throw new Error("Installed-mod transfer read range is invalid");
        }
        return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
      },
    };
  }

  async beginTransferImport(value, fileValues, { expectedContextId = null } = {}) {
    this.#assertMutable();
    this.incomingTransfer = true;
    try {
      const snapshot = normalizeTransferSnapshot(value, fileValues);
      await globalThis.navigator?.storage?.persist?.().catch(() => false);
      const currentLibrary = loadModLibrary(this.storage);
      const existingIds = new Set(currentLibrary.mods.map((mod) => mod.id));
      const existingByContent = new Map();
      for (const mod of currentLibrary.mods) {
        const matches = existingByContent.get(mod.contentHash) ?? [];
        matches.push(mod);
        existingByContent.set(mod.contentHash, matches);
      }
      const incomingBySourceId = new Map();
      const archiveByFileId = new Map();
      const addedMods = [];
      let reusedCount = 0;
      const replacedById = new Map();

      for (const incoming of snapshot.mods) {
        let existing = null;
        const candidates = existingByContent.get(incoming.contentHash) ?? [];
        while (!existing && candidates.length) {
          const candidate = candidates.shift();
          try {
            if (await installedModFilesMatch(candidate, incoming.contentHash)) existing = candidate;
          } catch {
            // A missing or changed local copy is not reusable; import a fresh copy.
          }
        }
        let targetId = existing?.id ?? incoming.id;
        while (!existing && existingIds.has(targetId)) targetId = `mod-${crypto.randomUUID().toLowerCase()}`;
        existingIds.add(targetId);
        const archives = incoming.archives.map((archive, archiveIndex) => {
          const stored = existing?.archives[archiveIndex];
          const normalized = {
            opfsPath: stored?.opfsPath ?? `cnc-mods/${targetId}/archives/${archive.name}`,
            name: stored?.name ?? archive.name,
            size: archive.size,
            sha256: archive.sha256,
            enabled: archive.enabled,
          };
          archiveByFileId.set(archive.fileId, { ...archive, target: normalized, reuse: Boolean(existing) });
          return normalized;
        });
        const mod = normalizeInstalledMod({ ...incoming, id: targetId, archives });
        if (!mod) throw new Error(`${incoming.name} could not be normalized for local storage`);
        incomingBySourceId.set(incoming.id, mod);
        if (existing) {
          reusedCount += 1;
          replacedById.set(mod.id, mod);
        } else {
          addedMods.push(mod);
        }
      }

      const activeMods = snapshot.activeIds.map((id) => incomingBySourceId.get(id));
      const activeContext = await createModContext(activeMods);
      if (expectedContextId !== null && activeContext.id !== expectedContextId) {
        throw new Error("Transferred mods do not match the sender's active configuration");
      }
      const mergedMods = [
        ...currentLibrary.mods.map((mod) => replacedById.get(mod.id) ?? mod),
        ...addedMods,
      ];
      const previousStorage = new Map([
        [MOD_LIBRARY_KEY, storedValue(this.storage, MOD_LIBRARY_KEY)],
        [MOD_ACTIVE_CONTEXT_KEY, storedValue(this.storage, MOD_ACTIVE_CONTEXT_KEY)],
        [MOD_CONTEXT_HISTORY_KEY, storedValue(this.storage, MOD_CONTEXT_HISTORY_KEY)],
      ]);
      const createdRoots = new Set(addedMods.map((mod) => `cnc-mods/${mod.id}`));
      let index = 0;
      let current = null;
      let finished = false;

      const cleanupCreated = async () => {
        await Promise.allSettled([...createdRoots].map((root) => removeOpfsRoot(root)));
      };
      const closeSession = () => {
        finished = true;
        this.incomingTransfer = false;
      };
      const ensureActive = () => {
        if (finished) throw new Error("Transferred mod session is closed");
      };

      return {
        async beginFile(id) {
          ensureActive();
          if (current || index >= snapshot.files.length || snapshot.files[index].id !== id) {
            throw new Error("Transferred mod file order is invalid");
          }
          const file = snapshot.files[index];
          const archive = archiveByFileId.get(id);
          if (!archive) throw new Error("Transferred mod archive is not owned by a package");
          const output = archive.reuse ? null : await createOpfsWriter(archive.target.opfsPath);
          current = { ...file, archive, ...output, written: 0, hash: new Sha256() };
        },
        async writeChunk(id, offset, value) {
          ensureActive();
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          if (!current || current.id !== id || offset !== current.written
              || current.written + bytes.byteLength > current.bytes) {
            throw new Error("Transferred mod chunk is out of order");
          }
          if (current.writer) await current.writer.write(bytes);
          current.hash.update(bytes);
          current.written += bytes.byteLength;
        },
        async finishFile(id) {
          ensureActive();
          if (!current || current.id !== id || current.written !== current.bytes) {
            throw new Error("Transferred mod archive is incomplete");
          }
          if (current.writer) {
            await current.writer.close();
            current.writer = null;
            const stored = await current.handle.getFile();
            if (stored.size !== current.bytes) throw new Error(`${current.name} was not stored completely`);
          }
          if (current.hash.digestHex() !== current.archive.sha256) {
            throw new Error(`${current.name} failed its content hash check`);
          }
          current = null;
          index += 1;
        },
        finish: async () => {
          ensureActive();
          if (current || index !== snapshot.files.length) throw new Error("Transferred mod library is incomplete");
          try {
            saveModLibrary(this.storage, { schema: 1, mods: mergedMods });
            saveActiveModContext(this.storage, activeContext);
            closeSession();
            window.dispatchEvent(new CustomEvent("zeroh:mods-transferred", {
              detail: { installed: addedMods.length, reused: reusedCount, activeContext },
            }));
            return { installed: addedMods.length, reused: reusedCount, activeContext };
          } catch (error) {
            for (const [key, previous] of previousStorage) restoreStoredValue(this.storage, key, previous);
            await cleanupCreated();
            closeSession();
            throw error;
          }
        },
        async abort() {
          if (finished) return;
          if (current?.writer) {
            try { await current.writer.abort(); } catch { /* already closed */ }
          }
          current = null;
          await cleanupCreated();
          closeSession();
        },
      };
    } catch (error) {
      this.incomingTransfer = false;
      throw error;
    }
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(new Error("Mod manager closed"));
    this.pending.clear();
  }
}
