// p2_opfs_probe.mjs — DISPOSABLE P2-prep proof probe driver (lane P2-prep).
// Drives harness/p2_opfs_probe.html against dist-threaded/cnc-port.js in
// headless Chromium and asserts the OPFS-as-disk read layer end to end:
//
//   1. io_worker fetchToOpfs streams the served INIZH.big into OPFS,
//   2. the pool worker realm is staged (opfs_realm_files.mjs pre-opens sync
//      access handles, installs globalThis.__cncOpfs*),
//   3. the intercept prefix is registered + 0-byte MEMFS marker created,
//   4. the probe pthread reads /assets/INIZH.big through the shims/io.h seam
//      (C-level _open/_read/_lseek/_close): BIG magic, full TOC walk, random
//      64KB preads, sequential full read, largest-entry read — all from OPFS
//      sync access handles, bypassing the pthread->main FS proxy,
//   5. the same patterns run against a MEMFS copy (the FS proxy path) for
//      the decisive throughput comparison,
//   6. sample checksums from the C side are verified against HTTP Range
//      fetches (byte-exactness proof).
//
// Build first: npm run build:port:threaded
// Run:         node harness/p2_opfs_probe.mjs   (npm run probe:p2-opfs)
// Payload:     artifacts/real-assets/INIZH.big (P2_PROBE_BIG env overrides;
//              if missing, the driver auto-links the main checkout's copy).
// NOT part of test:all — P2 groundwork verification tooling.

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { access, mkdir, stat, symlink } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

const ENGINE_PATH = "/assets/INIZH.big";
const PROXY_PATH = "/proxy-assets/INIZH.big";
const OPFS_ROOT_DIR = "cnc-p2-probe";
const OPFS_PATH = `${OPFS_ROOT_DIR}/INIZH.big`;

function mbps(bytes, ms) {
  if (!(ms > 0)) return null;
  return Number(((bytes / (1024 * 1024)) / (ms / 1000)).toFixed(1));
}

// The probe payload must be inside the static-server root. Worktrees do not
// carry the (gitignored) artifacts/ tree; auto-link the main checkout's
// real-assets directory when it is available.
async function ensurePayload() {
  const override = process.env.P2_PROBE_BIG;
  if (override) {
    await access(resolve(wasmRoot, override));
    return override.replace(/\\/g, "/");
  }
  const servedPath = "artifacts/real-assets/INIZH.big";
  const absolute = resolve(wasmRoot, servedPath);
  try {
    await access(absolute);
    return servedPath;
  } catch {
    // fall through to auto-link
  }
  const mainCopy = "/home/agusx1211/personal/CnC_Generals_Zero_Hour/WebAssembly/artifacts/real-assets";
  await access(resolve(mainCopy, "INIZH.big"));
  await mkdir(resolve(wasmRoot, "artifacts"), { recursive: true });
  await symlink(mainCopy, resolve(wasmRoot, "artifacts/real-assets"), "dir");
  await access(absolute);
  return servedPath;
}

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
  const servedPath = await ensurePayload();
  const payloadStat = await stat(resolve(wasmRoot, servedPath));
  process.stdout.write(`payload: ${servedPath} (${payloadStat.size} bytes)\n`);

  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const browser = await chromium.launch();
  let failure = null;
  const summary = {};
  try {
    const page = await browser.newPage();
    const consoleLines = [];
    page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => consoleLines.push(`pageerror: ${err.message}`));

    const url = new URL("harness/p2_opfs_probe.html", server.url).href;
    const payloadUrl = new URL(servedPath, server.url).href;
    await page.goto(url, { waitUntil: "load" });

    // Fresh OPFS between runs.
    await page.evaluate((dir) => window.__cleanupOpfs(dir), OPFS_ROOT_DIR);

    summary.init = await page.evaluate(() => window.__init());
    if (summary.init.instantiated && summary.init.workerFound) {
      summary.fetchToOpfs = await page.evaluate(
        ([u, p]) => window.__fetchToOpfs(u, p),
        [payloadUrl, OPFS_PATH],
      );
      summary.memfsSeed = await page.evaluate(
        ([u, p]) => window.__seedMemfs(u, p),
        [payloadUrl, PROXY_PATH],
      );
      summary.stage = await page.evaluate(
        (map) => window.__connectAndStage(map),
        { [ENGINE_PATH]: OPFS_PATH },
      );
    }

    if (summary.stage?.setupOk) {
      summary.register = await page.evaluate(
        ([prefix, marker]) => window.__registerAndMark(prefix, marker),
        ["/assets/", ENGINE_PATH],
      );
      summary.start = await page.evaluate(
        ([opfsPath, proxyPath]) => window.__startProbe(opfsPath, proxyPath),
        [ENGINE_PATH, PROXY_PATH],
      );

      const deadline = Date.now() + 180000;
      let state = 0;
      while (Date.now() < deadline) {
        state = await page.evaluate(() => window.__probeState());
        if (state >= 2) break;
        await page.waitForTimeout(200);
      }
      summary.probeState = state;
      summary.probe = await page.evaluate(() => window.__probeSummary());
      summary.realmDiag = await page.evaluate(() => window.__realmDiag()).catch((e) => ({
        error: String(e),
      }));
    }

    // Verify sampled checksums (and the largest entry) against HTTP Range
    // fetches of the served file.
    const opfs = summary.probe?.opfs;
    if (opfs?.ok) {
      summary.sampleVerification = [];
      for (const sample of opfs.samples ?? []) {
        const ranged = await page.evaluate(
          ([u, offset, length]) => window.__verifyRange(u, offset, length),
          [payloadUrl, sample.offset, sample.length],
        );
        summary.sampleVerification.push({
          offset: sample.offset,
          length: sample.length,
          probeFnv: sample.fnv,
          rangeFnv: ranged.fnv,
          match: sample.fnv === ranged.fnv,
        });
      }
      const biggest = await page.evaluate(
        ([u, offset, length]) => window.__verifyRange(u, offset, length),
        [payloadUrl, opfs.biggestOffset, opfs.biggestSize],
      );
      summary.biggestVerification = {
        name: opfs.biggestName,
        size: opfs.biggestSize,
        probeFnv: opfs.biggestFnv,
        rangeFnv: biggest.fnv,
        match: opfs.biggestFnv === biggest.fnv,
      };
    }

    // Cleanup OPFS.
    summary.cleanup = await page.evaluate((dir) => window.__cleanupOpfs(dir), OPFS_ROOT_DIR);

    // ---- assertions ----
    const proxy = summary.probe?.proxy;
    const checks = [];
    checks.push(["threaded runtime instantiated", summary.init?.instantiated === true]);
    checks.push(["page is crossOriginIsolated", summary.init?.crossOriginIsolated === true]);
    checks.push(["wasm heap is a SharedArrayBuffer", summary.init?.heapIsShared === true]);
    checks.push(["pool worker located", summary.init?.workerFound === true]);
    checks.push([
      "fetchToOpfs streamed the full archive to OPFS",
      Number(summary.fetchToOpfs?.bytesWritten) === payloadStat.size,
    ]);
    checks.push([
      "memfs proxy copy staged",
      Number(summary.memfsSeed?.byteLength) === payloadStat.size,
    ]);
    checks.push(["realm staged (sync handles pre-opened)", summary.stage?.setupOk === true]);
    checks.push([
      "realm installed __cncOpfs* hooks",
      Array.isArray(summary.stage?.hooksInstalled) &&
        summary.stage.hooksInstalled.includes("__cncOpfsRead"),
    ]);
    checks.push(["intercept prefix registered", Number(summary.register?.registerRc) >= 1]);
    checks.push(["MEMFS marker created (0 bytes)", summary.register?.markerSize === 0]);
    checks.push(["probe pthread spawned (rc==0)", summary.start?.rc === 0]);
    checks.push(["probe completed (state 2)", summary.probeState === 2]);
    checks.push([
      "marker visible to stat() with size 0 (enumeration contract)",
      summary.probe?.markerStatRc === 0 && summary.probe?.markerStatSize === 0,
    ]);
    checks.push(["opfs phase ok", opfs?.ok === true]);
    checks.push([
      "opfs phase used the VIRTUAL fd (intercept active)",
      opfs?.interceptActive === 1,
    ]);
    checks.push([
      "opfs fd size == real archive size (not the 0-byte marker)",
      Number(opfs?.fileSize) === payloadStat.size,
    ]);
    checks.push(["BIG magic read == BIGF", opfs?.magic === "BIGF"]);
    checks.push(["TOC walk found entries", Number(opfs?.tocEntries) > 0]);
    checks.push([
      "sequential read covered the whole archive",
      Number(opfs?.sequentialBytes) === payloadStat.size,
    ]);
    checks.push([
      "all sample checksums match HTTP Range fetches",
      Array.isArray(summary.sampleVerification) &&
        summary.sampleVerification.length === 5 &&
        summary.sampleVerification.every((s) => s.match),
    ]);
    checks.push([
      "largest-entry checksum matches HTTP Range fetch",
      summary.biggestVerification?.match === true,
    ]);
    checks.push(["proxy phase ok (MEMFS comparison ran)", proxy?.ok === true]);
    checks.push([
      "proxy phase used a REAL fd (no intercept)",
      proxy?.interceptActive === 0,
    ]);
    checks.push([
      "opfs and proxy full-file checksums agree",
      opfs?.fullFileFnv === proxy?.fullFileFnv,
    ]);

    const failed = checks.filter(([, ok]) => !ok);
    summary.throughput = {
      opfs: opfs && {
        tocMs: opfs.tocMs,
        tocReads: opfs.tocReads,
        randomMBps: mbps(opfs.randomBytes, opfs.randomMs),
        sequentialMBps: mbps(opfs.sequentialBytes, opfs.sequentialMs),
        biggestEntryMs: opfs.biggestMs,
      },
      proxy: proxy && {
        tocMs: proxy.tocMs,
        tocReads: proxy.tocReads,
        randomMBps: mbps(proxy.randomBytes, proxy.randomMs),
        sequentialMBps: mbps(proxy.sequentialBytes, proxy.sequentialMs),
        biggestEntryMs: proxy.biggestMs,
      },
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    for (const [name, ok] of checks) {
      process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
    }
    if (failed.length > 0) {
      process.stdout.write("---- page/worker console ----\n");
      for (const line of consoleLines) process.stdout.write(`${line}\n`);
      process.stdout.write("---- end console ----\n");
      failure = `p2 opfs probe failed: ${failed.map(([n]) => n).join(", ")}`;
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
  process.stdout.write("p2 opfs probe: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
