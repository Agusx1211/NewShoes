import {
  createModContext,
  loadActiveModContext,
  loadModLibrary,
  normalizeInstalledMod,
  saveActiveModContext,
  saveModLibrary,
  vanillaModContext,
} from "./mod-context.mjs";

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
  }

  list() {
    return [...loadModLibrary(this.storage).mods];
  }

  active() {
    return loadActiveModContext(this.storage);
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
    saveActiveModContext(this.storage, vanillaModContext());
    return vanillaModContext();
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(new Error("Mod manager closed"));
    this.pending.clear();
  }
}
