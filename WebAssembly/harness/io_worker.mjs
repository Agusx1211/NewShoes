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
