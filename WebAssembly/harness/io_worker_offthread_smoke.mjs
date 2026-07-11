// io_worker_offthread_smoke.mjs — proves harness/io_worker.mjs streams bytes
// to OPFS off the main thread and that the main thread stays responsive
// while it does.
//
// It does NOT need the 1.6 GB archive set. It streams a served file into
// OPFS through the IO worker (fetchToOpfs — the shipping mount transport)
// while a main-thread rAF heartbeat runs, and asserts (a) the streamed bytes
// are byte-exact, (b) the main-thread heartbeat kept ticking during the
// fetch and during a worker CPU-busy task, and (c) the retired whole-buffer
// fetchArchive command is refused (deleted 2026-07-10 with the play-page
// MEMFS pipeline).
//
// Run: node harness/io_worker_offthread_smoke.mjs

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

async function main() {
  // Use a modest, always-present served file as the "archive" payload.
  const targetPath = "harness/bridge.js";
  const fileStat = await stat(resolve(wasmRoot, targetPath));

  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const browser = await chromium.launch();
  let failure = null;
  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        // Surface page errors to the node log for debugging.
        process.stderr.write(`[page:error] ${msg.text()}\n`);
      }
    });

    const url = new URL("harness/io_worker_offthread_smoke.html", server.url).href;
    await page.goto(url, { waitUntil: "load" });

    const result = await page.evaluate(async (payloadUrl) => {
      return window.__runIoWorkerSmoke(payloadUrl);
    }, new URL(targetPath, server.url).href);

    // fetchToOpfs (P2 "OPFS as the disk"): stream the same served payload into
    // OPFS through the worker and byte-compare the OPFS contents.
    const opfsResult = await page.evaluate(async (payloadUrl) => {
      return window.__runFetchToOpfsSmoke(payloadUrl);
    }, new URL(targetPath, server.url).href);

    // Assertions.
    const checks = [];
    checks.push(["worker reported ready", result.ready === true]);
    checks.push(["worker streamed bytes to OPFS", Number(result.byteLength) > 0]);
    checks.push([
      "byte length matches served file",
      Number(result.byteLength) === fileStat.size,
    ]);
    // The fetch runs off-thread, so the main-thread heartbeat must keep ticking
    // during the fetch. Any positive tick count proves the main thread was not
    // frozen for the whole fetch.
    checks.push([
      "main-thread heartbeat kept ticking during fetch",
      Number(result.heartbeatTicksDuringFetch) >= 1,
    ]);
    checks.push([
      "retired whole-buffer fetchArchive command is refused",
      result.fetchArchiveRefused === true,
    ]);
    // A 300ms busy task on the worker thread must NOT freeze the main-thread
    // heartbeat: at ~60fps we expect well over 5 ticks in 300ms. This is the
    // unambiguous "off-thread work does not block the main thread" proof.
    checks.push([
      "main-thread heartbeat kept ticking during 300ms worker-CPU task",
      Number(result.heartbeatTicksDuringBusy) >= 5,
    ]);
    // Streamed-fetch progress: the worker must post interim
    // { kind: "progress", received, total } messages so the play page can
    // render a real download bar. Total comes from Content-Length and the
    // final (forced) progress post must cover the whole payload.
    checks.push([
      "worker posted streamed progress events",
      Number(result.progressEventCount) >= 1,
    ]);
    checks.push([
      "progress total matches Content-Length",
      Number(result.progressTotal) === fileStat.size,
    ]);
    checks.push([
      "final progress covered the full payload",
      Number(result.progressMaxReceived) === fileStat.size,
    ]);
    // Byte-exactness leg: bytes streamed into OPFS must match the served
    // file exactly (read back through the async File API).
    checks.push([
      "fetchToOpfs wrote the full payload to OPFS",
      Number(opfsResult.bytesWritten) === fileStat.size,
    ]);
    checks.push([
      "OPFS file byte-length matches served file",
      Number(opfsResult.opfsByteLength) === fileStat.size,
    ]);
    checks.push([
      "OPFS bytes match served bytes exactly",
      opfsResult.bytesMatch === true,
    ]);
    checks.push([
      "fetchToOpfs posted streamed progress events",
      Number(opfsResult.progressEventCount) >= 1,
    ]);
    checks.push([
      "fetchToOpfs progress total matches Content-Length",
      Number(opfsResult.progressTotal) === fileStat.size,
    ]);
    checks.push([
      "fetchToOpfs final progress covered the full payload",
      Number(opfsResult.progressMaxReceived) === fileStat.size,
    ]);

    const failed = checks.filter(([, ok]) => !ok);
    for (const [name, ok] of checks) {
      process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
    }
    process.stdout.write(
      `info  byteLength=${result.byteLength} expected=${fileStat.size} ` +
        `heartbeatTicksDuringFetch=${result.heartbeatTicksDuringFetch} ` +
        `heartbeatTicksDuringBusy=${result.heartbeatTicksDuringBusy} ` +
        `progressEvents=${result.progressEventCount} ` +
        `fetchMs=${result.fetchMs?.toFixed?.(1) ?? result.fetchMs}\n`,
    );
    process.stdout.write(
      `info  fetchToOpfs bytesWritten=${opfsResult.bytesWritten} ` +
        `opfsBytes=${opfsResult.opfsByteLength} match=${opfsResult.bytesMatch} ` +
        `progressEvents=${opfsResult.progressEventCount}\n`,
    );
    if (failed.length > 0) {
      failure = `IO worker off-thread smoke failed: ${failed.map(([n]) => n).join(", ")}`;
    }
  } catch (error) {
    failure = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    await browser.close();
    await server.close();
  }

  if (failure) {
    process.stderr.write(`${failure}\n`);
    process.exit(1);
  }
  process.stdout.write("IO worker off-thread smoke: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
