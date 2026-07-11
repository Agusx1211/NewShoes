// io_worker.mjs — dedicated I/O Web Worker for the C&C Generals: Zero Hour port.
//
// GOAL (owner): "move IO to its own thread, so we stop blocking the main
// thread every time we load a screen." This worker streams archive downloads
// straight to OPFS (the engine thread reads them back through the
// shims/io.h fd-intercept seam) so archive bytes are never RAM-resident on
// the main thread. The whole-buffer `fetchArchive` transfer command from the
// MEMFS-mount era was deleted 2026-07-10 with the play-page legacy path.
//
// Protocol (main thread -> worker):
//   { id, kind: "fetchRange", url, start, end }
//       -> HTTP Range request, transfer the range bytes back.
//   { id, kind: "fetchToOpfs", url, opfsPath }
//       -> stream fetch straight into an OPFS file (P2 "OPFS as the disk",
//          IDEAS.md "the browser as a 2003 PC"): each chunk is written through
//          a FileSystemSyncAccessHandle as it arrives, so the whole file is
//          NEVER resident in worker memory (peak = one fetch chunk). While the
//          body streams, interim { id, ok: true, kind: "progress", url,
//          received, total } messages are posted (throttled to ~4/sec; total
//          is the Content-Length, 0 when the server did not send one).
//          Responds { id, ok: true, kind, bytesWritten, opfsPath, status }.
//          opfsPath may contain '/' separators; directories are created.
//   { id, kind: "opfsCollectNamespaces", root, keep: [names], lockPrefix }
//       -> garbage-collect per-boot archive namespaces under `root` (P2 OPFS
//          mounts write to <root>/ns-<bootId>-<seq>/...). Every child of
//          `root` is removed EXCEPT entries named in `keep` and namespace
//          dirs whose owning page still holds the `${lockPrefix}<bootId>` Web
//          Lock (live tab). Lock-held / mid-delete failures are per-entry and
//          non-fatal. Responds { id, ok: true, kind, removed, kept, failed }.
//   { id, kind: "releaseHandles" }
//       -> close every OPFS sync access handle this worker still has open
//          (pagehide teardown; a dying page's worker may otherwise hold
//          exclusive OPFS locks until the browser reaps it). Fire-and-forget
//          safe: responds { id, ok: true, kind, closed } when an id is given.
//   { id, kind: "ping" }
//       -> liveness check.
//
// Response (worker -> main thread):
//   { id, ok: true, kind, bytes: ArrayBuffer, byteLength, status }   // transferred
//   { id, ok: true, kind: "progress", url, received, total }         // interim
//   { id, ok: false, kind, error }

const PROGRESS_POST_INTERVAL_MS = 250; // ~4 progress posts per second per archive

// Walk an OPFS path like "cnc-assets/INIZH.big", creating intermediate
// directories, and return the FileSystemFileHandle for the final component.
async function resolveOpfsFileHandle(opfsPath, { create }) {
  if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    throw new Error("OPFS (navigator.storage.getDirectory) is unavailable in this worker");
  }
  const parts = String(opfsPath ?? "")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0 || parts.includes("..")) {
    throw new Error(`invalid OPFS path: ${opfsPath}`);
  }
  let directory = await navigator.storage.getDirectory();
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return directory.getFileHandle(parts[parts.length - 1], { create });
}

// Every OPFS sync access handle currently open in this worker, so a pagehide
// "releaseHandles" message can drop the exclusive file locks immediately
// instead of waiting for the browser to reap the dying page's worker (a
// reaped-late worker was one suspected source of "archive mount failed" on
// the next boot).
const openSyncHandles = new Set();

function isOpfsLockError(error) {
  const name = error?.name ?? "";
  return name === "NoModificationAllowedError" || name === "InvalidStateError";
}

// createSyncAccessHandle takes an EXCLUSIVE lock; a stale holder (previous
// boot's engine worker not yet reaped, another tab) makes it throw
// NoModificationAllowedError. Retry briefly (stale holders usually die within
// ~1s of navigation), then delete-and-recreate the file, then fail with a
// message that names the file and the underlying exception.
async function createSyncAccessHandleRobust(opfsPath) {
  const fileHandle = await resolveOpfsFileHandle(opfsPath, { create: true });
  if (typeof fileHandle.createSyncAccessHandle !== "function") {
    throw new Error("FileSystemFileHandle.createSyncAccessHandle is unavailable in this worker");
  }
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await fileHandle.createSyncAccessHandle();
    } catch (error) {
      if (!isOpfsLockError(error)) {
        throw error;
      }
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  // Still locked: try replacing the file entirely (a fresh inode cannot be
  // lock-held by anyone).
  try {
    const parts = String(opfsPath).split("/").filter((part) => part.length > 0 && part !== ".");
    let directory = await navigator.storage.getDirectory();
    for (const part of parts.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(part, { create: true });
    }
    await directory.removeEntry(parts[parts.length - 1]);
    const recreated = await directory.getFileHandle(parts[parts.length - 1], { create: true });
    return await recreated.createSyncAccessHandle();
  } catch (error) {
    lastError = isOpfsLockError(error) || isOpfsLockError(lastError) ? (lastError ?? error) : error;
  }
  throw new Error(`createSyncAccessHandle(${opfsPath}) failed after retries + delete-and-recreate: `
    + `${lastError?.name ?? "Error"}: ${lastError?.message ?? lastError}`
    + " (another tab or a not-yet-reaped worker likely holds this file's exclusive OPFS lock)");
}

// Streamed fetch -> OPFS: the P0-proven pattern from opfs_sync_read_worker.mjs
// promoted into the shipping IO worker. Bytes go chunk-by-chunk from the fetch
// body reader into FileSystemSyncAccessHandle.write(chunk, { at }) — the whole
// file is never held in memory. createSyncAccessHandle is dedicated-worker-only,
// which this worker is.
async function fetchToOpfs(url, opfsPath, reportProgress) {
  const handle = await createSyncAccessHandleRobust(opfsPath);
  openSyncHandles.add(handle);
  try {
    handle.truncate(0);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
    }
    const contentLength = Number(response.headers.get("content-length"));
    const total = Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : 0;

    let offset = 0;
    if (typeof response.body?.getReader !== "function") {
      // No streaming support in this context: single-shot fallback (still one
      // buffer, immediately written out and released).
      const buffer = new Uint8Array(await response.arrayBuffer());
      const written = handle.write(buffer, { at: 0 });
      if (written !== buffer.byteLength) {
        throw new Error(`short OPFS write: ${written} of ${buffer.byteLength} at 0`);
      }
      offset = written;
      reportProgress?.(offset, total || offset, true);
    } else {
      const reader = response.body.getReader();
      reportProgress?.(0, total, true);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const written = handle.write(value, { at: offset });
        if (written !== value.byteLength) {
          throw new Error(`short OPFS write: ${written} of ${value.byteLength} at ${offset}`);
        }
        offset += written;
        reportProgress?.(offset, total, false);
      }
      reportProgress?.(offset, total || offset, true);
    }
    handle.flush();
    if (handle.getSize() !== offset) {
      throw new Error(`OPFS size mismatch after write: ${handle.getSize()} != ${offset}`);
    }
    return { bytesWritten: offset, status: response.status };
  } finally {
    openSyncHandles.delete(handle);
    try {
      handle.close();
    } catch {
      // already closed
    }
  }
}

// GC of per-boot OPFS archive namespaces (see the protocol comment above).
async function opfsCollectNamespaces(root, keep, lockPrefix) {
  if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    throw new Error("OPFS (navigator.storage.getDirectory) is unavailable in this worker");
  }
  const keepNames = new Set(Array.isArray(keep) ? keep.map(String) : []);
  let liveBootIds = new Set();
  try {
    if (navigator.locks && typeof navigator.locks.query === "function" && lockPrefix) {
      const snapshot = await navigator.locks.query();
      liveBootIds = new Set((snapshot.held ?? [])
        .filter((lock) => typeof lock?.name === "string" && lock.name.startsWith(lockPrefix))
        .map((lock) => lock.name.slice(lockPrefix.length)));
    }
  } catch {
    // Web Locks query unavailable: fall back to best-effort deletes below
    // (a live tab's staged handles make its files undeletable anyway).
  }
  const removed = [];
  const kept = [];
  const failed = [];
  const opfsRoot = await navigator.storage.getDirectory();
  let rootDir = null;
  try {
    rootDir = await opfsRoot.getDirectoryHandle(String(root), { create: false });
  } catch {
    return { removed, kept, failed }; // no archive root yet: nothing to collect
  }
  const names = [];
  for await (const name of rootDir.keys()) {
    names.push(name);
  }
  for (const name of names) {
    if (keepNames.has(name)) {
      kept.push(name);
      continue;
    }
    const match = /^ns-(.+)-\d+$/.exec(name);
    if (match && liveBootIds.has(match[1])) {
      kept.push(name); // another LIVE tab owns this namespace
      continue;
    }
    try {
      await rootDir.removeEntry(name, { recursive: true });
      removed.push(name);
    } catch (error) {
      // Lock-held files (stale worker not yet reaped) make removeEntry throw;
      // non-fatal — the new boot writes into its own fresh namespace anyway
      // and the next boot's GC retries.
      failed.push({ name, error: `${error?.name ?? "Error"}: ${error?.message ?? error}` });
    }
  }
  return { removed, kept, failed };
}

async function fetchRange(url, start, end) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (response.status !== 206) {
    throw new Error(`range fetch failed: HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const expected = end - start + 1;
  if (buffer.byteLength !== expected) {
    throw new Error(`range length mismatch: ${buffer.byteLength} != ${expected}`);
  }
  return { buffer, status: response.status };
}

self.onmessage = async (event) => {
  const message = event.data ?? {};
  const { id, kind } = message;

  try {
    if (kind === "ping") {
      self.postMessage({ id, ok: true, kind });
      return;
    }

    if (kind === "busy") {
      // Verification-only: burn CPU for ~`ms` on the worker thread so a smoke
      // can prove the main thread stays responsive while the worker is busy.
      const ms = Number(message.ms ?? 200);
      const deadline = performance.now() + ms;
      let sink = 0;
      while (performance.now() < deadline) {
        sink += Math.sqrt(sink + 1);
      }
      self.postMessage({ id, ok: true, kind, sink });
      return;
    }

    if (kind === "fetchToOpfs") {
      const url = String(message.url ?? "");
      const opfsPath = String(message.opfsPath ?? "");
      let lastProgressAt = -Infinity;
      const reportProgress = (received, total, force) => {
        const now = performance.now();
        if (!force && now - lastProgressAt < PROGRESS_POST_INTERVAL_MS) {
          return;
        }
        lastProgressAt = now;
        self.postMessage({ id, ok: true, kind: "progress", url, received, total });
      };
      const { bytesWritten, status } = await fetchToOpfs(url, opfsPath, reportProgress);
      self.postMessage({ id, ok: true, kind, bytesWritten, opfsPath, status });
      return;
    }

    if (kind === "opfsCollectNamespaces") {
      const { removed, kept, failed } = await opfsCollectNamespaces(
        String(message.root ?? ""),
        message.keep,
        String(message.lockPrefix ?? ""),
      );
      self.postMessage({ id, ok: true, kind, removed, kept, failed });
      return;
    }

    if (kind === "releaseHandles") {
      let closed = 0;
      for (const handle of openSyncHandles) {
        try {
          handle.close();
          closed += 1;
        } catch {
          // already closed
        }
      }
      openSyncHandles.clear();
      if (id !== undefined) {
        self.postMessage({ id, ok: true, kind, closed });
      }
      return;
    }

    if (kind === "fetchRange") {
      const { buffer, status } = await fetchRange(
        String(message.url ?? ""),
        Number(message.start),
        Number(message.end),
      );
      self.postMessage(
        { id, ok: true, kind, bytes: buffer, byteLength: buffer.byteLength, status },
        [buffer],
      );
      return;
    }

    self.postMessage({ id, ok: false, kind, error: `Unknown IO worker command: ${kind}` });
  } catch (error) {
    const errorName = error?.name && error.name !== "Error" ? `${error.name}: ` : "";
    self.postMessage({
      id,
      ok: false,
      kind,
      error: error instanceof Error ? `${errorName}${error.message}` : String(error),
    });
  }
};

// Announce readiness so the main thread can detect a live worker.
self.postMessage({ id: 0, ok: true, kind: "ready" });
