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
//       -> fetch whole archive, transfer bytes back.
//   { id, kind: "fetchRange", url, start, end }
//       -> HTTP Range request, transfer the range bytes back.
//   { id, kind: "ping" }
//       -> liveness check.
//
// Response (worker -> main thread):
//   { id, ok: true, kind, bytes: ArrayBuffer, byteLength, status }   // transferred
//   { id, ok: false, kind, error }

async function fetchWholeArchive(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
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
      const { buffer, status } = await fetchWholeArchive(String(message.url ?? ""));
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
