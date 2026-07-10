// io_worker.mjs — dedicated I/O Web Worker for the C&C Generals: Zero Hour port.
//
// GOAL (owner): "move IO to its own thread, so we stop blocking the main thread
// every time we load a screen." This worker moves the archive *fetch + decode*
// off the main (render/engine) thread. The engine itself stays single-threaded
// and keeps consuming ready bytes from MEMFS; only the browser-side network
// download and the big ArrayBuffer allocation happen here, then the finished
// bytes are transferred (zero-copy) back to the main thread for the single
// `FS.writeFile` memcpy into the wasm heap.
//
// This is the first, least-invasive slice of the "IO off-thread" work (option
// (c) in the architecture report): no pthreads, no ASYNCIFY, no engine changes,
// no shared wasm heap. A plain module Worker can `fetch()` and post an
// `ArrayBuffer` back via a Transferable, so the ~1.6 GB archive download and
// its decode no longer contend with the main thread that owns WebGL and the
// engine loop.
//
// Protocol (main thread -> worker):
//   { id, kind: "fetchArchive", url }
//       -> fetch whole archive (streamed), transfer bytes back. While the body
//          streams, interim { id, ok: true, kind: "progress", url, received,
//          total } messages are posted (throttled to ~4/sec; total is the
//          Content-Length, 0 when the server did not send one).
//   { id, kind: "fetchRange", url, start, end }
//       -> HTTP Range request, transfer the range bytes back.
//   { id, kind: "fetchToOpfs", url, opfsPath }
//       -> stream fetch straight into an OPFS file (P2 "OPFS as the disk",
//          IDEAS.md "the browser as a 2003 PC"): each chunk is written through
//          a FileSystemSyncAccessHandle as it arrives, so the whole file is
//          NEVER resident in worker memory (peak = one fetch chunk). Interim
//          progress messages identical to fetchArchive. Responds
//          { id, ok: true, kind, bytesWritten, opfsPath, status }.
//          opfsPath may contain '/' separators; directories are created.
//   { id, kind: "ping" }
//       -> liveness check.
//
// Response (worker -> main thread):
//   { id, ok: true, kind, bytes: ArrayBuffer, byteLength, status }   // transferred
//   { id, ok: true, kind: "progress", url, received, total }         // interim
//   { id, ok: false, kind, error }

const PROGRESS_POST_INTERVAL_MS = 250; // ~4 progress posts per second per archive

// Streamed whole-archive fetch: reads the response body chunk by chunk so the
// caller can observe real download progress, then hands back ONE contiguous
// ArrayBuffer (still transferred zero-copy to the main thread). When the
// Content-Length is known the bytes land directly in a single preallocated
// buffer; otherwise chunks accumulate and are joined once at the end.
async function fetchWholeArchive(url, reportProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  const total = Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : 0;

  if (typeof response.body?.getReader !== "function") {
    // No streaming support in this context: fall back to the single-shot read
    // and report completion only.
    const buffer = await response.arrayBuffer();
    reportProgress?.(buffer.byteLength, total || buffer.byteLength, true);
    return { buffer, status: response.status };
  }

  const reader = response.body.getReader();
  let flat = total > 0 ? new Uint8Array(total) : null;
  let chunks = null; // fallback accumulator (unknown or wrong Content-Length)
  let received = 0;
  reportProgress?.(0, total, true);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (flat && received + value.byteLength <= flat.byteLength) {
      flat.set(value, received);
    } else {
      if (!chunks) {
        // Content-Length was missing or too small; switch to chunk mode.
        chunks = flat ? [flat.subarray(0, received)] : [];
        flat = null;
      }
      chunks.push(value);
    }
    received += value.byteLength;
    reportProgress?.(received, total, false);
  }
  reportProgress?.(received, total || received, true);

  let buffer;
  if (flat) {
    buffer = received === flat.byteLength ? flat.buffer : flat.buffer.slice(0, received);
  } else {
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks ?? []) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    buffer = merged.buffer;
  }
  return { buffer, status: response.status };
}

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

// Streamed fetch -> OPFS: the P0-proven pattern from opfs_sync_read_worker.mjs
// promoted into the shipping IO worker. Bytes go chunk-by-chunk from the fetch
// body reader into FileSystemSyncAccessHandle.write(chunk, { at }) — the whole
// file is never held in memory. createSyncAccessHandle is dedicated-worker-only,
// which this worker is.
async function fetchToOpfs(url, opfsPath, reportProgress) {
  const fileHandle = await resolveOpfsFileHandle(opfsPath, { create: true });
  if (typeof fileHandle.createSyncAccessHandle !== "function") {
    throw new Error("FileSystemFileHandle.createSyncAccessHandle is unavailable in this worker");
  }
  const handle = await fileHandle.createSyncAccessHandle();
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
    try {
      handle.close();
    } catch {
      // already closed
    }
  }
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

    if (kind === "fetchArchive") {
      const url = String(message.url ?? "");
      let lastProgressAt = -Infinity;
      const reportProgress = (received, total, force) => {
        const now = performance.now();
        if (!force && now - lastProgressAt < PROGRESS_POST_INTERVAL_MS) {
          return;
        }
        lastProgressAt = now;
        self.postMessage({ id, ok: true, kind: "progress", url, received, total });
      };
      const { buffer, status } = await fetchWholeArchive(url, reportProgress);
      self.postMessage(
        { id, ok: true, kind, bytes: buffer, byteLength: buffer.byteLength, status },
        [buffer],
      );
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
    self.postMessage({
      id,
      ok: false,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// Announce readiness so the main thread can detect a live worker.
self.postMessage({ id: 0, ok: true, kind: "ready" });
