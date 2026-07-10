// p1_scaffold_probe.mjs — DISPOSABLE P1a scaffold probe driver (design:
// WebAssembly/notes/p1-engine-thread.md; lane P1a). Drives
// harness/p1_scaffold_probe.html against dist-threaded/cnc-port.js in
// headless Chromium and asserts the P1 runtime scaffold works end to end:
//
//   1. threaded runtime instantiates (single pool worker, shared heap),
//   2. the pre-js realm stub answers ping over the default worker channel,
//   3. connect + OffscreenCanvas transfer + test-executor import into the
//      worker realm succeed (Module.cncPortD3D8Clear installed there),
//   4. engine pthread boots, go flag releases it, its rAF main loop runs ON
//      the pthread: heartbeat advances while the main thread's rAF stays
//      alive,
//   5. the placeholder canvas visibly animates: two element screenshots
//      ~500ms apart are non-black AND differ (plus a drawImage pixel sample
//      as a state check),
//   6. {cmd:"callExport"} round-trips through the stub with a value
//      consistent with the main-realm reading of the same atomic.
//
// Build first: npm run build:port:threaded
// Run:         node harness/p1_scaffold_probe.mjs
// Screenshots: scratch dir (P1_PROBE_SHOT_DIR env or /tmp).
// NOT wired into test:all — this is P1 scaffolding verification tooling.

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { access, mkdir, writeFile } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const shotDir = process.env.P1_PROBE_SHOT_DIR || "/tmp/p1-scaffold-probe";

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
  await mkdir(shotDir, { recursive: true });

  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const browser = await chromium.launch();
  let failure = null;
  const summary = {};
  try {
    const page = await browser.newPage();
    const consoleLines = [];
    page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => consoleLines.push(`pageerror: ${err.message}`));

    const url = new URL("harness/p1_scaffold_probe.html", server.url).href;
    await page.goto(url, { waitUntil: "load" });

    summary.init = await page.evaluate(() => window.__init());
    if (summary.init.instantiated) {
      summary.ping = await page.evaluate(() => window.__pingWorker());
    }
    if (summary.ping?.ok) {
      summary.setup = await page.evaluate(() => window.__connectAndSetup());
    }
    if (summary.setup?.setupOk) {
      summary.bootAndGo = await page.evaluate(() => window.__bootAndGo());
    }

    // Screenshots + pixel samples of the animated clear, ~500ms apart.
    const canvasEl = page.locator("#engine-canvas");
    const shotA = join(shotDir, "clear-a.png");
    const shotB = join(shotDir, "clear-b.png");
    let bufA = null;
    let bufB = null;
    if (summary.bootAndGo && !summary.bootAndGo.error) {
      summary.pixelA = await page.evaluate(() => window.__sampleCanvasPixel());
      bufA = await canvasEl.screenshot({ path: shotA });
      await page.waitForTimeout(500);
      summary.pixelB = await page.evaluate(() => window.__sampleCanvasPixel());
      bufB = await canvasEl.screenshot({ path: shotB });
      summary.screenshots = { a: shotA, b: shotB, differ: !bufA.equals(bufB) };
      summary.callExport = await page.evaluate(() => window.__callExportRoundTrip());
      summary.finalHeartbeat = await page.evaluate(() =>
        window.__cncModule._cnc_port_engine_thread_boot_heartbeat());
      summary.finalMainRafTicks = await page.evaluate(() => window.__mainRafTicks());
    }

    const nonBlack = (p) => p && (p.r > 8 || p.g > 8 || p.b > 8);
    const pixelsDiffer = (p, q) =>
      p && q && (Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b) > 12);

    const checks = [];
    checks.push(["threaded runtime instantiated", summary.init?.instantiated === true]);
    checks.push(["page is crossOriginIsolated", summary.init?.crossOriginIsolated === true]);
    checks.push(["wasm heap is a SharedArrayBuffer", summary.init?.heapIsShared === true]);
    checks.push(["exactly one pool worker (PTHREAD_POOL_SIZE=1)", summary.init?.pthreadPoolWorkers === 1]);
    checks.push(["pool worker located via Module.PThread", summary.init?.workerFound === true]);
    checks.push(["realm stub pong (default channel, isPthread)", summary.ping?.ok === true && summary.ping?.isPthread === true]);
    checks.push(["realm port connected", summary.setup?.connected === true]);
    checks.push(["executor setup in worker realm ok", summary.setup?.setupOk === true]);
    checks.push([
      "executor reported cncPortD3D8Clear installed",
      Array.isArray(summary.setup?.hooksInstalled) &&
        summary.setup.hooksInstalled.includes("cncPortD3D8Clear"),
    ]);
    checks.push(["engine thread boot rc==0", summary.bootAndGo?.bootRc === 0]);
    checks.push(["engine thread reached main-loop state (2)", summary.bootAndGo?.state === 2]);
    checks.push([
      "heartbeat advanced across 1.5s sample (>=15 ticks)",
      Number(summary.bootAndGo?.heartbeatDelta) >= 15,
    ]);
    checks.push([
      "main rAF alive during engine-thread run (>=10 ticks)",
      Number(summary.bootAndGo?.mainRafTicksDuringSample) >= 10,
    ]);
    checks.push(["canvas pixel A non-black", nonBlack(summary.pixelA)]);
    checks.push(["canvas pixel B non-black", nonBlack(summary.pixelB)]);
    checks.push(["canvas pixels A/B differ (animated clear)", pixelsDiffer(summary.pixelA, summary.pixelB)]);
    checks.push(["screenshots A/B differ", summary.screenshots?.differ === true]);
    checks.push([
      "callExport round trip ok (worker-realm export call consistent)",
      summary.callExport?.ok === true,
    ]);

    const failed = checks.filter(([, ok]) => !ok);
    summary.checks = Object.fromEntries(checks.map(([n, ok]) => [n, ok]));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    for (const [name, ok] of checks) {
      process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
    }
    if (failed.length > 0) {
      process.stdout.write("---- page/worker console ----\n");
      for (const line of consoleLines) process.stdout.write(`${line}\n`);
      process.stdout.write("---- end console ----\n");
      failure = `p1 scaffold probe failed: ${failed.map(([n]) => n).join(", ")}`;
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
  process.stdout.write("p1 scaffold probe: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
