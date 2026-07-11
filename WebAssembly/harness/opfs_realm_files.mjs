// opfs_realm_files.mjs — realm-side OPFS file registry (P2 "OPFS as the
// disk"). Imported INTO A WORKER REALM (the engine pthread's realm) either
// directly via the threads_realm_stub `setup` command (the p2_opfs_probe
// path; its default export matches the stub's executor contract:
// default({ canvas, Module, realm })) or by engine_realm_boot.mjs's
// "stageOpfsFiles" command (the play.html threaded mount path).
//
// It pre-opens FileSystemSyncAccessHandle objects (async — must happen while
// the worker's event loop is free, i.e. BEFORE the engine/probe pthread is
// spawned onto this worker) for a { enginePath -> opfsPath } map, then
// installs the synchronous functions the EM_JS half of
// src/wasm_opfs_files.cpp calls:
//
//   globalThis.__cncOpfsOpen(path)                 -> id (>=0) or -1
//   globalThis.__cncOpfsSize(id)                   -> byte size (double)
//   globalThis.__cncOpfsRead(id, destPtr, len, at) -> bytesRead
//   globalThis.__cncOpfsClose(id)                  -> 0
//
// The path map rides the import URL's ?map= query (JSON): the realm stub's
// setup command forwards only { canvas, Module, realm }, and a
// query-suffixed URL yields a fresh module instance per distinct map. All
// instances share ONE realm-global registry (globalThis.__cncOpfsRegistry),
// so staging is cumulative: engine_realm_boot's setup import and any number
// of later stageOpfsFiles imports merge into the same open-file table and
// the hooks/diag/message-listener are installed exactly once.
//
// Runtime archives are opened read-only, allowing an installed archive set to
// be mounted directly (and by multiple tabs) without a per-tab disk copy.
// Exactly one handle is opened per opfsPath in this realm and all virtual
// opens share it — safe because every read is stateless (`read(view, { at })`),
// the C side owns the per-fd position. Closed virtual-open ids are recycled
// through a free-list (the engine re-opens the archive for every inner-file
// read, so the id table must not grow with session length).
//
// Heap views: a FRESH Uint8Array is built per read from the CURRENT wasm
// memory buffer (growth of a shared memory mints a new SAB object; stale
// views silently cover only the old range). If this Chromium rejects
// SAB-backed views in FileSystemSyncAccessHandle.read (the WebIDL was only
// later widened to AllowSharedBufferSource), the read falls back to a
// non-shared scratch buffer + copy and records readMode "copy" — a real
// finding the probe must report either way.

function currentHeapU8(Module) {
  const memory = Module && Module["wasmMemory"];
  if (memory && memory.buffer) {
    return new Uint8Array(memory.buffer);
  }
  // Fallback: Module.HEAPU8 (kept fresh by emscripten's growth handlers in
  // the realm that grew; for shared memory a stale view still covers the
  // pre-growth range without throwing).
  return Module ? Module["HEAPU8"] : null;
}

async function resolveOpfsFileHandle(opfsPath) {
  const parts = String(opfsPath ?? "")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0 || parts.includes("..")) {
    throw new Error(`invalid OPFS path: ${opfsPath}`);
  }
  let directory = await navigator.storage.getDirectory();
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create: false });
  }
  return directory.getFileHandle(parts[parts.length - 1], { create: false });
}

async function createReadAccessHandle(fileHandle) {
  try {
    return await fileHandle.createSyncAccessHandle({ mode: "read-only" });
  } catch (error) {
    // Chromium before the access-mode extension rejects the options object.
    // Preserve the prior exclusive-read behavior on those browsers.
    if (error?.name !== "TypeError" && error?.name !== "NotSupportedError") throw error;
    return fileHandle.createSyncAccessHandle();
  }
}

function ensureRegistry(Module) {
  let registry = globalThis.__cncOpfsRegistry;
  if (registry) {
    if (Module) {
      registry.Module = Module;
    }
    return registry;
  }

  const diag = {
    stagedPaths: [],
    opens: 0,
    openMisses: 0,
    reads: 0,
    bytesRead: 0,
    closes: 0,
    readMode: null, // "shared-view" | "copy"
    errors: [],
  };
  registry = {
    Module,
    files: new Map(), // enginePath -> { handle, size, opfsPath }
    openIds: [], // id -> { handle, size } | null
    freeIds: [], // recycled id slots
    diag,
  };
  globalThis.__cncOpfsRegistry = registry;

  globalThis.__cncOpfsOpen = (path) => {
    const entry = registry.files.get(path);
    if (!entry) {
      diag.openMisses += 1;
      return -1;
    }
    diag.opens += 1;
    const recycled = registry.freeIds.pop();
    if (recycled !== undefined) {
      registry.openIds[recycled] = entry;
      return recycled;
    }
    registry.openIds.push(entry);
    return registry.openIds.length - 1;
  };

  globalThis.__cncOpfsSize = (id) => {
    const entry = registry.openIds[id];
    return entry ? entry.size : -1;
  };

  globalThis.__cncOpfsRead = (id, destPtr, len, at) => {
    const entry = registry.openIds[id];
    if (!entry || len < 0) {
      return -1;
    }
    if (len === 0) {
      return 0;
    }
    const heap = currentHeapU8(registry.Module);
    if (!heap) {
      diag.errors.push("no heap view available");
      return -1;
    }
    try {
      if (diag.readMode !== "copy") {
        try {
          const view = heap.subarray(destPtr, destPtr + len);
          const read = entry.handle.read(view, { at });
          diag.readMode = diag.readMode ?? "shared-view";
          diag.reads += 1;
          diag.bytesRead += read;
          return read;
        } catch (error) {
          // Probable SAB-view rejection: switch to scratch-copy mode for all
          // subsequent reads and record the finding.
          if (diag.readMode === null) {
            diag.readMode = "copy";
            diag.errors.push(`shared-view read rejected: ${error}`);
          } else {
            throw error;
          }
        }
      }
      const scratch = new Uint8Array(len);
      const read = entry.handle.read(scratch, { at });
      heap.set(read === len ? scratch : scratch.subarray(0, read), destPtr);
      diag.reads += 1;
      diag.bytesRead += read;
      return read;
    } catch (error) {
      diag.errors.push(String(error));
      return -1;
    }
  };

  globalThis.__cncOpfsClose = (id) => {
    if (registry.openIds[id]) {
      registry.openIds[id] = null;
      registry.freeIds.push(id);
      diag.closes += 1;
      return 0;
    }
    return -1;
  };

  // Close every staged handle + every virtual open (pagehide teardown from
  // the main realm via engine_realm_boot's "releaseOpfsHandles" command).
  // Releasing the exclusive OPFS locks eagerly keeps a dying page's worker
  // from blocking the NEXT boot's writes until the browser reaps it.
  registry.closeAll = () => {
    let closed = 0;
    for (const entry of registry.files.values()) {
      try {
        entry.handle.close();
        closed += 1;
      } catch {
        // already closed
      }
    }
    registry.files.clear();
    registry.openIds.length = 0;
    registry.freeIds.length = 0;
    diag.stagedPaths = [];
    return closed;
  };

  globalThis.__cncOpfsDiag = diag;

  // Diag responder: the threads_realm_stub silently ignores __cncRealm
  // commands it does not know, so this module can ride the same envelope for
  // its own {cmd:"opfsDiagRequest", id} query. The reply goes out on the
  // default channel with target:"setimmediate" (the 3.1.6 silent-branch
  // convention; the main-thread PThread handler echoes it back, which this
  // listener ignores because the echoed cmd is reply-shaped).
  self.addEventListener("message", (event) => {
    const data = event && event.data;
    const msg = data && typeof data === "object" ? data.__cncRealm : null;
    if (!msg || msg.cmd !== "opfsDiagRequest") {
      return;
    }
    self.postMessage({
      target: "setimmediate",
      __cncRealm: { cmd: "opfsDiag", id: msg.id, diag: JSON.parse(JSON.stringify(diag)) },
    });
  });

  return registry;
}

export default async function setupOpfsRealmFiles({ Module }) {
  if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    throw new Error("OPFS unavailable in this realm (navigator.storage.getDirectory missing)");
  }

  const registry = ensureRegistry(Module);

  const url = new URL(import.meta.url);
  const map = JSON.parse(url.searchParams.get("map") || "{}");

  // Pre-open every sync access handle now, while this worker's event loop is
  // still free. Cumulative: already-staged enginePaths with the same
  // opfsPath are kept (their handle stays valid); a re-stage to a DIFFERENT
  // opfsPath replaces the entry (old handle closed first — createSyncAccess-
  // Handle would otherwise throw on the exclusive lock).
  const stagedPaths = [];
  for (const [enginePath, opfsPath] of Object.entries(map)) {
    const existing = registry.files.get(enginePath);
    if (existing) {
      if (existing.opfsPath === opfsPath) {
        stagedPaths.push(enginePath);
        continue;
      }
      try {
        existing.handle.close();
      } catch {
        // already closed
      }
      registry.files.delete(enginePath);
    }
    const fileHandle = await resolveOpfsFileHandle(opfsPath);
    if (typeof fileHandle.createSyncAccessHandle !== "function") {
      throw new Error("createSyncAccessHandle unavailable in this realm (not a dedicated worker?)");
    }
    const handle = await createReadAccessHandle(fileHandle);
    registry.files.set(enginePath, { handle, size: handle.getSize(), opfsPath });
    stagedPaths.push(enginePath);
  }
  registry.diag.stagedPaths = [...registry.files.keys()];

  return {
    hooksInstalled: ["__cncOpfsOpen", "__cncOpfsSize", "__cncOpfsRead", "__cncOpfsClose"],
    stagedPaths,
  };
}
