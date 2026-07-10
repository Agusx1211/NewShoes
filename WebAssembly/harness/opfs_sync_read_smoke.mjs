// opfs_sync_read_smoke.mjs — JS-only feasibility smoke for the OPFS-as-disk
// half of the engine-thread architecture ("the browser as a 2003 PC",
// IDEAS.md P2): proves streamed-download -> OPFS and genuinely synchronous
// worker-thread reads under this dev box's headless Chromium.
//
// What it proves:
//   1. OPFS + FileSystemSyncAccessHandle are available in a dedicated worker
//      (their ABSENCE is the critical finding — reported loudly, never faked).
//   2. A served ~18MB archive (artifacts/real-assets/INIZH.big) streams
//      chunk-by-chunk from fetch() into OPFS without ever being resident
//      (peak JS-held buffer = one fetch chunk).
//   3. Synchronous read throughput in engine-shaped patterns: 16B header,
//      256KB TOC-like read, 200 random 64KB reads, 16 sequential 1MB reads.
//   4. Byte-exactness: sampled OPFS ranges match HTTP Range fetches exactly.
//
// Run: node harness/opfs_sync_read_smoke.mjs

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRelativePath = "artifacts/real-assets/INIZH.big";

async function main() {
  let archiveStat;
  try {
    archiveStat = await stat(resolve(wasmRoot, archiveRelativePath));
  } catch {
    process.stderr.write(
      `missing ${archiveRelativePath} under ${wasmRoot} — this smoke needs the ` +
        "extracted real-assets archives (see ASSETS.md)\n",
    );
    process.exit(1);
  }

  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const browser = await chromium.launch();
  let failure = null;
  let summary = { smoke: "opfs-sync-read", archiveBytes: archiveStat.size };

  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        process.stderr.write(`[page:error] ${msg.text()}\n`);
      }
    });
    page.on("pageerror", (error) => {
      process.stderr.write(`[page:pageerror] ${error?.message ?? error}\n`);
    });

    const url = new URL("harness/opfs_sync_read_smoke.html", server.url).href;
    await page.goto(url, { waitUntil: "load" });

    const archiveUrl = new URL(archiveRelativePath, server.url).href;
    const result = await page.evaluate(
      (payloadUrl) => window.__runOpfsSmoke(payloadUrl),
      archiveUrl,
    );
    summary = { ...summary, ...result };

    if (result.error) {
      process.stderr.write(`[worker:error] ${result.error}\n`);
    }
    if (!result.opfsAvailable) {
      throw new Error("CRITICAL: OPFS (navigator.storage.getDirectory) unavailable in worker");
    }
    if (!result.syncAccessHandleAvailable) {
      throw new Error("CRITICAL: createSyncAccessHandle unavailable in worker");
    }

    const patterns = result.patterns ?? {};
    const checks = [];
    checks.push(["OPFS available in worker", result.opfsAvailable === true]);
    checks.push(["createSyncAccessHandle available", result.syncAccessHandleAvailable === true]);
    checks.push([
      `streamed full archive into OPFS (bytesWritten=${result.bytesWritten} expected=${archiveStat.size})`,
      Number(result.bytesWritten) === archiveStat.size,
    ]);
    checks.push([
      `OPFS file size matches (fileSizeOnOpfs=${result.fileSizeOnOpfs})`,
      Number(result.fileSizeOnOpfs) === archiveStat.size,
    ]);
    checks.push([
      `download was streamed, never resident (peakChunk=${result.streamedPeakBufferBytes} ` +
        `chunks=${result.streamedChunkCount})`,
      Number(result.streamedPeakBufferBytes) > 0 &&
        Number(result.streamedPeakBufferBytes) <= 8 * 1024 * 1024 &&
        Number(result.streamedChunkCount) >= 4,
    ]);
    checks.push([
      `16-byte header sync read ok (ascii=${JSON.stringify(result.headerAscii)})`,
      result.headerReadOk === true,
    ]);
    checks.push([
      `256KB TOC-like sync read ok (${patterns.toc256KB?.mbps} MB/s)`,
      patterns.toc256KB?.ok === true,
    ]);
    checks.push([
      `200 random 64KB sync reads ok (${patterns.random64KBx200?.mbps} MB/s)`,
      patterns.random64KBx200?.ok === true,
    ]);
    checks.push([
      `16 sequential 1MB sync reads ok (${patterns.sequential1MBx16?.mbps} MB/s)`,
      patterns.sequential1MBx16?.ok === true,
    ]);
    // Lenient floor on a loaded shared box; the measured numbers in the JSON
    // summary are the primary value.
    checks.push([
      `sequential sync read >= 50 MB/s (${patterns.sequential1MBx16?.mbps} MB/s)`,
      Number(patterns.sequential1MBx16?.mbps) >= 50,
    ]);
    checks.push([
      "5 sampled OPFS ranges byte-match HTTP Range fetches",
      result.rangeVerifyOk === true,
    ]);
    checks.push(["OPFS file cleaned up", result.cleanupOk === true]);

    for (const [name, ok] of checks) {
      process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
    }
    process.stdout.write(
      `info  streamWrite=${result.streamWriteMBps} MB/s (${result.streamMs}ms) ` +
        `progressEvents=${result.progressEvents} ` +
        `quota=${JSON.stringify(result.quotaEstimate)}\n`,
    );

    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length > 0) {
      failure = `OPFS sync read smoke failed: ${failed.map(([n]) => n).join(", ")}`;
    }
  } catch (error) {
    failure = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    await browser.close();
    await server.close();
  }

  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (failure) {
    process.stderr.write(`${failure}\n`);
    process.exit(1);
  }
  process.stdout.write("OPFS sync read smoke: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
