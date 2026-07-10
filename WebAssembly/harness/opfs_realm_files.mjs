// opfs_realm_files.mjs — realm-side OPFS file registry (P2 "OPFS as the
// disk"; lane P2-prep). Imported INTO A WORKER REALM (the engine pthread's
// realm) via the threads_realm_stub `setup` command; its default export
// matches the stub's executor contract: default({ canvas, Module, realm }).
//
// It pre-opens FileSystemSyncAccessHandle objects (async — must happen while
// the worker's event loop is free, i.e. BEFORE the engine/probe pthread is
// spawned onto this worker) for a { enginePath -> opfsPath } map, then
// installs the synchronous functions the EM_JS half of
// src/wasm_opfs_files.cpp calls:
//
//   globalThis.__cncOpfsOpen(path)                 -> id (>=0) or -1
//   globalThis.__cncOpfsSize(id)                   -> byte size
//   globalThis.__cncOpfsRead(id, destPtr, len, at) -> bytesRead
//   globalThis.__cncOpfsClose(id)                  -> 0
//
// The path map rides the import URL's ?map= query (JSON), because the realm
// stub's setup command forwards only { canvas, Module, realm } — and a
// query-suffixed URL yields a fresh module instance per distinct map.
//
// createSyncAccessHandle takes an EXCLUSIVE lock per OPFS file, so exactly
// one handle is opened per opfsPath and all virtual opens of that path share
// it — safe because every read is stateless (`read(view, { at })`), the C
// side owns the per-fd position.
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

export default async function setupOpfsRealmFiles({ Module }) {
  if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    throw new Error("OPFS unavailable in this realm (navigator.storage.getDirectory missing)");
  }

  const url = new URL(import.meta.url);
  const map = JSON.parse(url.searchParams.get("map") || "{}");

  // enginePath -> { handle, size }; pre-open every sync access handle now,
  // while this worker's event loop is still free.
  const files = new Map();
  for (const [enginePath, opfsPath] of Object.entries(map)) {
    const fileHandle = await resolveOpfsFileHandle(opfsPath);
    if (typeof fileHandle.createSyncAccessHandle !== "function") {
      throw new Error("createSyncAccessHandle unavailable in this realm (not a dedicated worker?)");
    }
    const handle = await fileHandle.createSyncAccessHandle();
    files.set(enginePath, { handle, size: handle.getSize(), opfsPath });
  }

  const openIds = []; // id -> { handle, size } | null
  const diag = {
    stagedPaths: [...files.keys()],
    opens: 0,
    openMisses: 0,
    reads: 0,
    bytesRead: 0,
    closes: 0,
    readMode: null, // "shared-view" | "copy"
    errors: [],
  };

  globalThis.__cncOpfsOpen = (path) => {
    const entry = files.get(path);
    if (!entry) {
      diag.openMisses += 1;
      return -1;
    }
    diag.opens += 1;
    openIds.push(entry);
    return openIds.length - 1;
  };

  globalThis.__cncOpfsSize = (id) => {
    const entry = openIds[id];
    return entry ? entry.size : -1;
  };

  globalThis.__cncOpfsRead = (id, destPtr, len, at) => {
    const entry = openIds[id];
    if (!entry || len < 0) {
      return -1;
    }
    if (len === 0) {
      return 0;
    }
    const heap = currentHeapU8(Module);
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
    if (openIds[id]) {
      openIds[id] = null;
      diag.closes += 1;
      return 0;
    }
    return -1;
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

  return {
    hooksInstalled: ["__cncOpfsOpen", "__cncOpfsSize", "__cncOpfsRead", "__cncOpfsClose"],
  };
}
