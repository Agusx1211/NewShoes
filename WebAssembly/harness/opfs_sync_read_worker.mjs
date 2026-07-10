// opfs_sync_read_worker.mjs — dedicated-worker half of the OPFS sync-read
// feasibility smoke ("the browser as a 2003 PC" P2 groundwork, JS-only lane).
//
// Streams a served archive chunk-by-chunk from fetch() straight into an OPFS
// file via FileSystemSyncAccessHandle.write(chunk, {at}) — the whole file is
// never resident in memory — then measures genuinely synchronous reads in the
// patterns the engine's Win32BIGFile/RAMFile path would issue: header read,
// TOC-like read, random-access reads, sequential streaming reads. Finally
// returns sampled ranges so the page can verify byte-exactness against
// HTTP Range requests, and deletes the OPFS file.
//
// Availability failures (no OPFS, no createSyncAccessHandle) are reported as
// structured results, never faked around: they are the critical finding.

const OPFS_FILE_NAME = "opfs-sync-read-smoke.bin";

// Deterministic PRNG so the random-read pattern is reproducible run-to-run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function throughputMBps(bytes, ms) {
  if (!(ms > 0)) return null;
  return Number(((bytes / (1024 * 1024)) / (ms / 1000)).toFixed(1));
}

async function cleanup(root, handle) {
  try {
    handle?.close();
  } catch {
    // already closed
  }
  if (!root) return false;
  try {
    await root.removeEntry(OPFS_FILE_NAME);
    return true;
  } catch {
    return false;
  }
}

async function run({ url }) {
  const result = {
    opfsAvailable: false,
    syncAccessHandleAvailable: false,
    bytesWritten: 0,
    streamedChunkCount: 0,
    streamedPeakBufferBytes: 0,
    streamMs: null,
    streamWriteMBps: null,
    fileSizeOnOpfs: null,
    headerReadOk: false,
    headerAscii: null,
    patterns: {},
    verifySamples: [],
    cleanupOk: false,
    quotaEstimate: null,
  };

  // --- Availability ---
  if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    result.error = "CRITICAL: navigator.storage.getDirectory (OPFS) is unavailable in this worker";
    return { result, transfers: [] };
  }
  result.opfsAvailable = true;
  try {
    const estimate = await navigator.storage.estimate();
    result.quotaEstimate = { quota: estimate.quota, usage: estimate.usage };
  } catch {
    // informational only
  }

  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(OPFS_FILE_NAME, { create: true });
  if (typeof fileHandle.createSyncAccessHandle !== "function") {
    result.error = "CRITICAL: FileSystemFileHandle.createSyncAccessHandle is unavailable in this worker";
    await cleanup(root, null);
    return { result, transfers: [] };
  }
  result.syncAccessHandleAvailable = true;

  let handle = await fileHandle.createSyncAccessHandle();
  try {
    // --- 1. Stream download -> OPFS, chunk by chunk, no accumulation ---
    handle.truncate(0);
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
    }
    const reader = response.body.getReader();
    const streamStart = performance.now();
    let offset = 0;
    let lastProgressPost = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Each chunk is written to OPFS immediately and then released — the
      // peak JS-held buffer is a single fetch chunk, proving streaming.
      const written = handle.write(value, { at: offset });
      if (written !== value.byteLength) {
        throw new Error(`short OPFS write: ${written} of ${value.byteLength} at ${offset}`);
      }
      offset += written;
      result.streamedChunkCount += 1;
      if (value.byteLength > result.streamedPeakBufferBytes) {
        result.streamedPeakBufferBytes = value.byteLength;
      }
      if (offset - lastProgressPost >= 4 * 1024 * 1024) {
        lastProgressPost = offset;
        self.postMessage({ kind: "progress", received: offset });
      }
    }
    handle.flush();
    result.streamMs = Number((performance.now() - streamStart).toFixed(1));
    result.bytesWritten = offset;
    result.streamWriteMBps = throughputMBps(offset, result.streamMs);
    handle.close();

    // --- 2. Fresh sync handle; measured synchronous read patterns ---
    handle = await fileHandle.createSyncAccessHandle();
    const fileSize = handle.getSize();
    result.fileSizeOnOpfs = fileSize;
    const random = mulberry32(0xc0ffee);

    // (a) 16-byte header read.
    {
      const buffer = new Uint8Array(16);
      const start = performance.now();
      const bytesRead = handle.read(buffer, { at: 0 });
      const ms = performance.now() - start;
      result.headerReadOk = bytesRead === 16;
      result.headerAscii = String.fromCharCode(...buffer.subarray(0, 4));
      result.patterns.header16B = {
        bytes: bytesRead,
        ms: Number(ms.toFixed(3)),
      };
    }

    // (b) 256KB "TOC-like" read at offset 16.
    {
      const length = 256 * 1024;
      const buffer = new Uint8Array(length);
      const start = performance.now();
      const bytesRead = handle.read(buffer, { at: 16 });
      const ms = performance.now() - start;
      result.patterns.toc256KB = {
        bytes: bytesRead,
        ms: Number(ms.toFixed(3)),
        mbps: throughputMBps(bytesRead, ms),
        ok: bytesRead === Math.min(length, fileSize - 16),
      };
    }

    // (c) 200 random 64KB reads.
    {
      const length = 64 * 1024;
      const reads = 200;
      const buffer = new Uint8Array(length);
      let bytes = 0;
      const start = performance.now();
      for (let i = 0; i < reads; i += 1) {
        const at = Math.floor(random() * (fileSize - length));
        bytes += handle.read(buffer, { at });
      }
      const ms = performance.now() - start;
      result.patterns.random64KBx200 = {
        reads,
        bytes,
        ms: Number(ms.toFixed(1)),
        mbps: throughputMBps(bytes, ms),
        ok: bytes === reads * length,
      };
    }

    // (d) 16 sequential 1MB reads.
    {
      const length = 1024 * 1024;
      const reads = 16;
      const buffer = new Uint8Array(length);
      let bytes = 0;
      const start = performance.now();
      for (let i = 0; i < reads; i += 1) {
        bytes += handle.read(buffer, { at: i * length });
      }
      const ms = performance.now() - start;
      result.patterns.sequential1MBx16 = {
        reads,
        bytes,
        ms: Number(ms.toFixed(1)),
        mbps: throughputMBps(bytes, ms),
        ok: bytes === Math.min(reads * length, fileSize),
      };
    }

    // --- 3. Sampled ranges for byte-exact verification on the main thread ---
    const transfers = [];
    for (let i = 0; i < 5; i += 1) {
      const length = Math.min(
        1024 + Math.floor(random() * (128 * 1024 - 1024)),
        fileSize,
      );
      const at = Math.floor(random() * (fileSize - length));
      const buffer = new Uint8Array(length);
      const bytesRead = handle.read(buffer, { at });
      result.verifySamples.push({ at, length, bytesRead, buffer: buffer.buffer });
      transfers.push(buffer.buffer);
    }

    // --- 4. Cleanup ---
    result.cleanupOk = await cleanup(root, handle);
    return { result, transfers };
  } catch (error) {
    result.error =
      error instanceof Error ? error.stack ?? error.message : String(error);
    result.cleanupOk = await cleanup(root, handle);
    return { result, transfers: [] };
  }
}

self.onmessage = async (event) => {
  const message = event.data ?? {};
  if (message.kind !== "run") return;
  try {
    const { result, transfers } = await run(message);
    self.postMessage({ kind: "result", ok: !result.error, result }, transfers);
  } catch (error) {
    self.postMessage({
      kind: "result",
      ok: false,
      result: {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      },
    });
  }
};

self.postMessage({ kind: "boot" });
