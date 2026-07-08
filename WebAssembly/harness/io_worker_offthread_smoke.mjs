// io_worker_offthread_smoke.mjs — proves harness/io_worker.mjs fetches bytes off
// the main thread and that the main thread stays responsive while it does.
//
// This is the first-slice verification for "move IO to its own thread": it does
// NOT need the 1.6 GB archive set. It fetches a served file through the IO
// worker while a main-thread rAF heartbeat runs, and asserts (a) the worker
// returned the right bytes via a zero-copy Transferable, and (b) the main-thread
// heartbeat kept ticking during the fetch (i.e. the fetch did not block it).
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

    // Assertions.
    const checks = [];
    checks.push(["worker reported ready", result.ready === true]);
    checks.push(["worker returned bytes", Number(result.byteLength) > 0]);
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
      "worker fetch produced a detached (transferred) buffer",
      result.transferred === true,
    ]);
    // A 300ms busy task on the worker thread must NOT freeze the main-thread
    // heartbeat: at ~60fps we expect well over 5 ticks in 300ms. This is the
    // unambiguous "off-thread work does not block the main thread" proof.
    checks.push([
      "main-thread heartbeat kept ticking during 300ms worker-CPU task",
      Number(result.heartbeatTicksDuringBusy) >= 5,
    ]);

    const failed = checks.filter(([, ok]) => !ok);
    for (const [name, ok] of checks) {
      process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
    }
    process.stdout.write(
      `info  byteLength=${result.byteLength} expected=${fileStat.size} ` +
        `heartbeatTicksDuringFetch=${result.heartbeatTicksDuringFetch} ` +
        `heartbeatTicksDuringBusy=${result.heartbeatTicksDuringBusy} ` +
        `fetchMs=${result.fetchMs?.toFixed?.(1) ?? result.fetchMs}\n`,
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
