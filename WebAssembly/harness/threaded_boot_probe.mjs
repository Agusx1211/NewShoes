// threaded_boot_probe.mjs — DISPOSABLE P0 spike driver (engine-on-its-own-
// thread, IDEAS.md "the browser as a 2003 PC"). Drives
// harness/threaded_boot_probe.html against dist-threaded/cnc-port.js in
// headless Chromium and reports:
//   - does the pthread-enabled runtime instantiate (shared heap, worker pool)?
//   - does a spawned pthread run concurrently with main-thread JS?
//   - does the pthread worker realm miss the main-realm bridge hooks (the
//     realm split P1 must close)?
//   - what happens when the real cnc_port_real_engine_init runs on a pthread
//     with no bridge/assets (recorded as a finding, not asserted)?
//
// Build first: npm run build:port:threaded
// Run:         node harness/threaded_boot_probe.mjs
// NOT wired into test:all — this is spike tooling.

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

// Realm bits from wasm_engine_thread_spike.cpp cnc_port_spike_realm_bits:
const BIT_MODULE = 1;
const BIT_BRIDGE_HOOK = 2;
const BIT_DOCUMENT = 4;
const BIT_WORKER_REALM = 8;

async function main() {
  for (const artifact of [
    "dist-threaded/cnc-port.js",
    "dist-threaded/cnc-port.wasm",
    "dist-threaded/cnc-port.worker.js",
  ]) {
    await access(resolve(wasmRoot, artifact)).catch(() => {
      throw new Error(`missing ${artifact} — run \`npm run build:port:threaded\` first`);
    });
  }

  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const browser = await chromium.launch();
  let failure = null;
  try {
    const page = await browser.newPage();
    const consoleLines = [];
    page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => consoleLines.push(`pageerror: ${err.message}`));
    page.on("worker", (worker) => consoleLines.push(`worker-spawned: ${worker.url()}`));

    const url = new URL("harness/threaded_boot_probe.html", server.url).href;
    await page.goto(url, { waitUntil: "load" });

    const init = await page.evaluate(() => window.__initThreadedModule());
    process.stdout.write(`init: ${JSON.stringify(init, null, 2)}\n`);

    let prove = null;
    if (init.instantiated) {
      prove = await page.evaluate(() => window.__spawnAndProve());
      process.stdout.write(`spawnAndProve: ${JSON.stringify(prove, null, 2)}\n`);
    }

    let initOnThread = null;
    if (prove && prove.spawnRc === 0) {
      // Finding-gathering step, not asserted: run the real engine init on a
      // pthread with no bridge/assets and record where it stops.
      initOnThread = await page.evaluate(() => window.__attemptInitOnThread(30000));
      process.stdout.write(`initOnThread: ${JSON.stringify(initOnThread, null, 2)}\n`);
    }

    const checks = [];
    checks.push(["module imported (ES6 dynamic import)", init.imported === true]);
    checks.push(["runtime instantiated", init.instantiated === true]);
    checks.push(["page is crossOriginIsolated", init.crossOriginIsolated === true]);
    checks.push(["wasm heap is a SharedArrayBuffer", init.heapIsShared === true]);
    checks.push([
      "pthread pool workers spawned",
      Number(init.pthreadPoolWorkers) >= 1,
    ]);
    if (prove) {
      checks.push(["engine thread spawn rc==0", prove.spawnRc === 0]);
      checks.push([
        "engine thread heartbeat advanced while main thread ran",
        Number(prove.heartbeatDelta) >= 5,
      ]);
      checks.push([
        "main-thread rAF kept ticking during heartbeat sample",
        Number(prove.rafTicksDuringSample) >= 10,
      ]);
      checks.push([
        "engine thread ran off the main runtime thread",
        prove.engineThreadIsMainRuntime === 0 && prove.engineThreadIsMainBrowser === 0,
      ]);
      checks.push([
        "main realm sees Module + bridge hook + document",
        (prove.mainRealmBits & BIT_MODULE) !== 0 &&
          (prove.mainRealmBits & BIT_BRIDGE_HOOK) !== 0 &&
          (prove.mainRealmBits & BIT_DOCUMENT) !== 0,
      ]);
      checks.push([
        "pthread realm sees its own Module but NOT the bridge hook nor document",
        (prove.engineRealmBits & BIT_MODULE) !== 0 &&
          (prove.engineRealmBits & BIT_BRIDGE_HOOK) === 0 &&
          (prove.engineRealmBits & BIT_DOCUMENT) === 0 &&
          (prove.engineRealmBits & BIT_WORKER_REALM) !== 0,
      ]);
    }

    const failed = checks.filter(([, ok]) => !ok);
    for (const [name, ok] of checks) {
      process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
    }
    if (initOnThread) {
      const stateNames = { 0: "idle", 1: "still-running", 2: "returned", 3: "spawn-failed" };
      process.stdout.write(
        `finding  real_engine_init on pthread: state=${stateNames[initOnThread.state] ?? initOnThread.state}` +
          ` elapsedMs=${Math.round(initOnThread.elapsedMs ?? -1)}` +
          ` timedOut=${initOnThread.timedOut === true}\n`,
      );
    }

    process.stdout.write("---- full page/worker console ----\n");
    for (const line of consoleLines) process.stdout.write(`${line}\n`);
    process.stdout.write("---- end console ----\n");

    if (failed.length > 0) {
      failure = `threaded boot probe failed: ${failed.map(([n]) => n).join(", ")}`;
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
  process.stdout.write("threaded boot probe: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
