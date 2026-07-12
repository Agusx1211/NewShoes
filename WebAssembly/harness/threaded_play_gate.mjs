// threaded_play_gate.mjs — P1c gates B/C for the engine-thread architecture
// (WebAssembly/notes/p1-engine-thread.md).
//
// Drives the REAL play page (threaded/OPFS-only since 2026-07-10 — the
// ?threads=0 legacy leg was deleted with the play-page legacy path; the
// non-threaded real-init reference lives in shellmap_real_init_gate.mjs on
// harness/index.html) in headless Chromium and asserts:
//   GATE B — the threaded boot reaches the title screen (real init 43/43 on
//     the engine thread; overlay hidden; #viewport screenshot non-black —
//     the PNG is saved for eyeball comparison).
//   GATE C — the engine-realm paced loop runs (client/logic counters advance
//     at a sane ratio; exact 60/30 only holds on a real GPU — SwiftShader
//     rates are recorded, not asserted); synthetic DOM input forwarded over
//     the realm port reaches the engine (pointermove -> engine browser-input
//     cursor matches via state RPC; menu click -> screenshot delta); state
//     RPCs round-trip.
//
// P2 addition: the threaded boot mounts archives onto OPFS by default (no
// MEMFS residency); the gate asserts the OPFS-backed mount actually ran and
// records main-thread memory (performance.memory + wasm memory size) in the
// summary for the OPFS-vs-MEMFS comparison.
//
// Gap-closure additions (2026-07-10, owner directive "fully migrate to the
// engine-thread path"): the browser launches with autoplay allowed (mimics
// the owner's Play-click gesture) and the gate additionally asserts:
//   - threaded `state` RPC carries the wasm cnc_port_state fields;
//   - issue-dump RPC routes (realEngineAnimReport / querySelection /
//     realEngineFrameSummary / d3d8TextureInventory) round-trip;
//   - placeholder-canvas captureStream stays live (issue-recorder video);
//   - AUDIBLE PATH: menu-music stream decodes+schedules from the OPFS-backed
//     archives, samples start (decode+buffer+source.start), completions
//     drain back into the engine (2D completed counter + no completion-
//     failure logs), and the worker-side byte-copy dedupe engages;
//   - resolution-change flow: setEngineResolution round-trips on the engine
//     thread and the placeholder/status sizes follow;
//   - saves: a .sav written into the IDBFS-mounted user-data dir survives
//     persistSaves + a fresh page load (listSaves round trip).
//
// Build first: npm run build:port:threaded (and build:port:threaded:release
// for the play-page default dist). Run: node harness/threaded_play_gate.mjs
//   THREADED_PLAY_DIST=dist-threaded-release
//                     gates the RELEASE threaded build (the play-page default
//                     dist) instead of the Debug dist-threaded
// Screenshots: artifacts/screenshots/p1c-*.png

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const shotDir = resolve(wasmRoot, "artifacts/screenshots");
// Optional dist override for the threaded leg (e.g. dist-threaded-release,
// the play-page default build). Empty = the page default (dist-threaded).
const threadedPlayDist = /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(process.env.THREADED_PLAY_DIST ?? "")
  ? process.env.THREADED_PLAY_DIST
  : "";
const BOOT_TIMEOUT_MS = Number(process.env.BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
// Post-boot settle before the title capture: the main-menu fade-in advances
// per RENDERED frame, so slow SwiftShader runs need tens of seconds before
// the menu is fully lit.
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 30000);
// Runs only the production Bink movie leg after boot. This keeps video
// iteration fast while retaining the same real play page, archive mount,
// engine loop, and screenshot path as the complete threaded gate.
const BINK_VIDEO_ONLY = process.env.BINK_VIDEO_ONLY === "1";
const BINK_VIDEO_DISABLED = process.env.BINK_VIDEO_DISABLED === "1";

class BinkVideoGateComplete extends Error {}

function log(line) {
  process.stdout.write(`[threaded-play-gate] ${line}\n`);
}

const verbose = process.env.VERBOSE === "1";

// Capture the game canvas through the bridge's own screenshot RPC instead of
// Playwright element screenshots: on the NON-threaded page the free-running
// engine loop saturates the main thread and Playwright's action pipeline
// times out waiting for element stability (the exact symptom the engine
// thread removes). The RPC path re-renders synchronously when needed
// (snapshotCanvas) and reads the transferred placeholder via drawImage in
// threaded mode (snapshotThreadedViewport).
async function captureViewport(page, path) {
  const shot = await page.evaluate(() => window.CnCPort.rpc("screenshot"));
  const dataUrl = typeof shot?.screenshot === "string"
    ? shot.screenshot
    : shot?.screenshot?.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`screenshot rpc returned no dataUrl (${JSON.stringify(shot)?.slice(0, 200)})`);
  }
  const buffer = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  if (path) {
    await writeFile(path, buffer);
  }
  return buffer;
}

async function samplePageScreenshot(page, buffer) {
  return page.evaluate(async (base64) => {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const scratch = document.createElement("canvas");
    scratch.width = 128;
    scratch.height = 80;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, scratch.width, scratch.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
    let sum = 0;
    let sumSquared = 0;
    let bottomBlue = 0;
    let bottomCount = 0;
    let upperEdgeSky = 0;
    let upperEdgeTerrain = 0;
    let upperEdgeCount = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const luminance = (red + green + blue) / 3;
      sum += luminance;
      sumSquared += luminance * luminance;
      const pixelIndex = offset / 4;
      const x = pixelIndex % scratch.width;
      const y = Math.floor(pixelIndex / scratch.width);
      if (y < 50 && (x < 19 || x >= 109)) {
        upperEdgeCount += 1;
        if (blue > 90 && blue > red * 1.2 && blue > green * 1.02) upperEdgeSky += 1;
        if (red > blue * 1.2 && green > blue * 1.08 && red < 210) upperEdgeTerrain += 1;
      }
      if (y >= 76) {
        bottomCount += 1;
        if (blue > red * 1.15 && blue > green * 1.05) bottomBlue += 1;
      }
    }
    const count = pixels.length / 4;
    const mean = sum / count;
    return {
      mean,
      standardDeviation: Math.sqrt(Math.max(0, sumSquared / count - mean * mean)),
      bottomBlueFraction: bottomCount > 0 ? bottomBlue / bottomCount : 0,
      upperEdgeSkyFraction: upperEdgeCount > 0 ? upperEdgeSky / upperEdgeCount : 0,
      upperEdgeTerrainFraction: upperEdgeCount > 0 ? upperEdgeTerrain / upperEdgeCount : 0,
    };
  }, buffer.toString("base64"));
}

async function compareUpperDesktopScreenshots(page, actual, reference) {
  return page.evaluate(async ([actualBase64, referenceBase64]) => {
    async function pixels(base64) {
      const raw = atob(base64);
      const bytes = new Uint8Array(raw.length);
      for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const scratch = document.createElement("canvas");
      scratch.width = 128;
      scratch.height = 80;
      const context = scratch.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, scratch.width, scratch.height);
      bitmap.close();
      return context.getImageData(0, 0, scratch.width, scratch.height).data;
    }
    const [actualPixels, referencePixels] = await Promise.all([
      pixels(actualBase64),
      pixels(referenceBase64),
    ]);
    let difference = 0;
    let changed = 0;
    let count = 0;
    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        if (x >= 19 && x < 109) continue;
        const offset = (y * 128 + x) * 4;
        const pixelDifference = (
          Math.abs(actualPixels[offset] - referencePixels[offset])
          + Math.abs(actualPixels[offset + 1] - referencePixels[offset + 1])
          + Math.abs(actualPixels[offset + 2] - referencePixels[offset + 2])
        ) / 3;
        difference += pixelDifference;
        if (pixelDifference > 24) changed += 1;
        count += 1;
      }
    }
    return {
      meanAbsoluteDifference: difference / count,
      changedFraction: changed / count,
    };
  }, [actual.toString("base64"), reference.toString("base64")]);
}

async function runBinkVideoGate(page, summary, checks) {
  const binkAssets = await page.evaluate(async () => {
    const state = await window.CnCPort.rpc("state");
    return state?.state?.binkVideoAssets ?? null;
  });
  const startupFrame = await page.evaluate(() =>
    window.CnCPort.rpc("realEngineFrameSummary", { frames: 1 }));
  const statusBeforeDiagnostic = await page.evaluate(() =>
    window.CnCPort.state.threadedEngine?.bink ?? null);
  let diagnosticPlays = [];
  if ((statusBeforeDiagnostic?.openedSourcePaths?.length ?? 0) === 0) {
    for (const name of ["EALogoMovie", "Sizzle"]) {
      const play = await page.evaluate((movieName) =>
        window.CnCPort.rpc("realEnginePlayMovie", { name: movieName }), name);
      diagnosticPlays.push({ name, play });
      if (play?.result?.moviePlaying === true) break;
    }
  }
  let frameWaitError = null;
  try {
    await page.waitForFunction(() => {
      const bink = window.CnCPort?.state?.threadedEngine?.bink;
      const opened = bink?.openedSourcePaths ?? [];
      return opened.some((path) => /EA_LOGO(?:640)?\.BIK$/i.test(path))
        && opened.some((path) => /sizzle_review(?:640)?\.bik$/i.test(path))
        && (bink?.framesReceived ?? 0) >= 3
        && (bink?.copies ?? 0) >= 2;
    }, null, { timeout: 60000, polling: 250 });
  } catch (error) {
    frameWaitError = error?.message ?? String(error);
  }
  const movieStatus = await page.evaluate(() => window.CnCPort.state.threadedEngine?.bink ?? null);
  const decoderStatus = await page.evaluate(() => window.CnCPort.state.binkVideo ?? null);
  const movieShotPath = join(shotDir, "p1c-bink-natural-intro-threaded.png");
  const movieShot = await captureViewport(page, movieShotPath);
  const moviePixels = await samplePageScreenshot(page, movieShot);
  const movieStop = await page.evaluate(() => window.CnCPort.rpc("realEngineStopMovie"));
  await page.waitForFunction(() =>
    (window.CnCPort?.state?.threadedEngine?.bink?.activeHandles ?? 0) === 0,
  null, { timeout: 30000, polling: 250 }).catch(() => {});
  const movieStoppedStatus = await page.evaluate(() =>
    window.CnCPort.state.threadedEngine?.bink ?? null);
  summary.binkVideo = {
    assets: binkAssets,
    startupFrame,
    diagnosticPlays,
    frameWaitError,
    decoder: decoderStatus,
    status: movieStatus,
    screenshot: movieShotPath,
    screenshotBytes: movieShot.length,
    pixels: moviePixels,
    stop: movieStop,
    stoppedStatus: movieStoppedStatus,
  };
  checks.push([
    "Bink sources and browser sidecar manifest are staged",
    binkAssets?.ready === true,
  ]);
  checks.push([
    "original boot flow opens EA logo then sizzle",
    (() => {
      const opened = movieStatus?.openedSourcePaths ?? [];
      const logo = opened.findIndex((path) => /EA_LOGO(?:640)?\.BIK$/i.test(path));
      const sizzle = opened.findIndex((path) => /sizzle_review(?:640)?\.bik$/i.test(path));
      return logo >= 0 && sizzle > logo;
    })(),
  ]);
  checks.push([
    "browser-decoded Bink frames reach and copy in the engine worker",
    frameWaitError == null
      && movieStatus?.opens >= 2
      && movieStatus?.framesReceived >= 3
      && movieStatus?.copies >= 2
      && movieStatus?.bytesCopied > 0,
  ]);
  checks.push([
    "Bink movie renders a non-flat viewport screenshot",
    movieShot.length > 10 * 1024 && moviePixels.standardDeviation > 8,
  ]);
  checks.push([
    "Display::stopMovie closes the browser decoder",
    movieStop?.ok === true
      && movieStop?.result?.wasPlaying === true
      && movieStop?.result?.moviePlaying === false
      && movieStoppedStatus?.activeHandles === 0
      && movieStoppedStatus?.closes >= 1,
  ]);
}

async function bootPlayPage(browser, url, label, consoleLines) {
  const page = await browser.newPage();
  // The non-threaded page saturates its main thread once the engine loop
  // runs; give Playwright actions a generous budget.
  page.setDefaultTimeout(120000);
  page.on("console", (msg) => {
    consoleLines.push(`${label} ${msg.type()}: ${msg.text()}`);
    if (verbose) {
      process.stderr.write(`[console:${label}] ${msg.type()}: ${msg.text()}\n`);
    }
  });
  page.on("pageerror", (err) => {
    consoleLines.push(`${label} pageerror: ${err.message}`);
    if (verbose) {
      process.stderr.write(`[pageerror:${label}] ${err.message}\n`);
    }
  });
  await page.goto(url, { waitUntil: "load" });
  // Boot progress heartbeat: the mount/init phases only touch the DOM, so in
  // verbose mode poll the overlay status line for the log.
  const progressTimer = verbose ? setInterval(() => {
    page.evaluate(() => ({
      progress: document.querySelector("#progress")?.textContent ?? "",
      threaded: window.CnCPort?.state?.threadedEngine
        ? {
          init: window.CnCPort.state.threadedEngine.initState,
          loop: window.CnCPort.state.threadedEngine.loop?.active,
          clientFrames: window.CnCPort.state.threadedEngine.loop?.clientFrames,
        }
        : null,
    })).then((info) => {
      process.stderr.write(`[boot:${label}] ${JSON.stringify(info)}\n`);
    }).catch(() => {});
  }, 20000) : null;
  try {
    // Boot is done when play.mjs hides the overlay (init returned + HUD
    // shown). state:"attached" — the .hidden overlay is display:none, so the
    // default visible-state wait would never fire.
    await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: BOOT_TIMEOUT_MS });
  } finally {
    if (progressTimer) {
      clearInterval(progressTimer);
    }
  }
  return page;
}

async function main() {
  await mkdir(shotDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  // PERSISTENT context (fresh profile per run), not chromium.launch():
  // launch() contexts are incognito-like and their OPFS is backed by an
  // in-memory filesystem that fails writes with base::File NO_SPACE (write()
  // returns 2^32-8) at ~1.25GiB on this box — smaller than the archive set.
  // A persistent profile gets the real disk-backed quota, matching how the
  // owner's Chrome runs the page. The profile is deleted first so every run
  // still starts with an empty OPFS (no cache layers).
  const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/threaded-play-gate");
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  const browser = await chromium.launchPersistentContext(profileDir, {
    viewport: { width: 1280, height: 800 },
    // Autoplay allowed = the AudioContext runs from boot, matching the real
    // play flow where the owner's Play click is the resuming gesture before
    // any engine audio starts. Required for the audible-path checks.
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const consoleLines = [];
  const summary = {};
  const checks = [];
  let failure = null;
  try {
    // Isolate the visual reference from the persistent game profile. Closing
    // a same-profile reference page would launch its own pagehide IDBFS flush
    // and can contend with the save-order race this gate intentionally tests.
    const referenceBrowser = await chromium.launch({ headless: true });
    const desktopReferencePath = join(shotDir, "p1c-desktop-reference.png");
    let desktopReference;
    try {
      const referenceContext = await referenceBrowser.newContext({ viewport: { width: 1280, height: 800 } });
      const referencePage = await referenceContext.newPage();
      await referencePage.goto(new URL("harness/play.html", server.url).href, { waitUntil: "load" });
      await referencePage.waitForFunction(() => window.ZeroHRuntime && window.ZeroHDesktop, null, {
        timeout: 120000,
      });
      desktopReference = await referencePage.screenshot({ path: desktopReferencePath });
    } finally {
      await referenceBrowser.close();
    }
    summary.desktopReference = desktopReferencePath;

    // ---------- threaded boot (GATE B) ----------
    const threadedQuery = "harness/play.html?autostart=1"
      + (BINK_VIDEO_ONLY ? "&shellmap=0" : "")
      + (BINK_VIDEO_ONLY && !BINK_VIDEO_DISABLED ? "&videos=1" : "")
      + (threadedPlayDist ? `&dist=${threadedPlayDist}` : "");
    log(`booting THREADED (${threadedPlayDist || "dist-threaded-release"}, engine on pthread, OPFS mounts)...`);
    const bootStartedAt = Date.now();
    const page = await bootPlayPage(
      browser,
      new URL(threadedQuery, server.url).href,
      "thr",
      consoleLines,
    );
    summary.threadedBootMs = Date.now() - bootStartedAt;
    summary.archiveBacking = "opfs";
    log(`threaded boot reached title in ${(summary.threadedBootMs / 1000).toFixed(1)}s`);

    // Archive backing + main-thread memory (the P2 payoff measurement):
    // MEMFS mounts keep every archive byte resident in the wasm heap (the
    // SharedArrayBuffer grows to hold them); OPFS mounts leave them on disk.
    const mountInfo = await page.evaluate(() => {
      const mounted = window.CnCPort?.state?.mountedArchives ?? [];
      const module = window.CnCPort?.engineModule?.();
      const perfMemory = performance.memory
        ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
        }
        : null;
      return {
        archives: mounted.map((archive) => ({
          name: archive.name,
          reader: archive.reader,
          bytes: archive.bytes,
          opfsPath: archive.opfsPath ?? null,
        })),
        wasmMemoryBytes: module?.wasmMemory?.buffer?.byteLength ?? null,
        perfMemory,
      };
    });
    summary.mountedArchives = mountInfo.archives.length;
    summary.memory = {
      wasmMemoryBytes: mountInfo.wasmMemoryBytes,
      wasmMemoryGiB: mountInfo.wasmMemoryBytes != null
        ? Number((mountInfo.wasmMemoryBytes / 1024 ** 3).toFixed(2)) : null,
      perfMemory: mountInfo.perfMemory,
    };
    log(`post-boot memory: wasm ${summary.memory.wasmMemoryGiB ?? "?"} GiB, `
      + `js used ${mountInfo.perfMemory ? (mountInfo.perfMemory.usedJSHeapSize / 1024 ** 2).toFixed(0) : "?"} MiB`);
    const opfsBacked = mountInfo.archives.length > 0
      && mountInfo.archives.every((archive) =>
        archive.reader === "io-worker fetchToOpfs" && archive.opfsPath);
    summary.opfsBackedMount = opfsBacked;
    checks.push(["threaded mount is OPFS-backed (no MEMFS archive bytes)", opfsBacked]);

    const initState = await page.evaluate(() => ({
      threadedMode: window.CnCPort?.state?.threadedMode === true,
      init: window.CnCPort?.state?.realEngineInit ?? null,
    }));
    summary.threadedMode = initState.threadedMode;
    summary.initThreaded = initState.init?.threaded === true;
    summary.initFrontier = {
      initReturned: initState.init?.frontier?.initReturned,
      subsystemsCompleted: initState.init?.frontier?.subsystemsCompleted
        ?? initState.init?.subsystemsCompleted?.length,
    };
    checks.push(["threaded mode active (bridge state)", summary.threadedMode === true]);
    checks.push(["real init ran on the engine thread", summary.initThreaded === true]);
    checks.push([
      "real init returned (frontier.initReturned)",
      initState.init?.frontier?.initReturned === true,
    ]);

    // The shellmap LOAD runs inside the engine-thread loop's first frames
    // (threaded mode skips the boot-time reveal pumps), so wait for the load
    // session to drain and real frames to accumulate before judging pixels.
    // Read the push-fed status snapshot (state.threadedEngine) — no port
    // round-trip, so long load frames cannot starve this wait.
    log("waiting for the engine-thread loop to drain the shellmap load...");
    await page.waitForFunction(() => {
      const engine = window.CnCPort?.state?.threadedEngine;
      return engine?.loop?.active === true
        && engine?.frame != null
        && engine.frame.loadSessionActive === false
        && (engine.loop.clientFrames ?? 0) > 30;
    }, null, { timeout: 12 * 60 * 1000, polling: 2000 });
    log("shellmap load drained; settling before capture...");
    // Let the menu fade-in (per rendered frame) complete, then capture GATE B.
    await page.waitForTimeout(SETTLE_MS);
    const threadedShot = join(shotDir, "p1c-title-threaded.png");
    const shotBuffer = await captureViewport(page, threadedShot);
    summary.threadedShot = threadedShot;
    log(`threaded title screenshot: ${threadedShot}`);
    // Non-black check via an in-page sample of the placeholder canvas.
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector("#viewport");
      const scratch = document.createElement("canvas");
      scratch.width = 64;
      scratch.height = 64;
      const ctx = scratch.getContext("2d");
      ctx.drawImage(canvas, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      let sum = 0;
      let max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] + data[i + 1] + data[i + 2];
        sum += lum;
        max = Math.max(max, lum);
      }
      return { mean: sum / (data.length / 4), max };
    });
    summary.threadedPixels = pixels;
    checks.push(["threaded canvas renders (non-black)", pixels.max > 48 && pixels.mean > 4]);
    checks.push(["screenshot captured (>10KB PNG)", shotBuffer.length > 10 * 1024]);

    // ---------- GATE C: paced loop measurement ----------
    // Sample the unsolicited 500ms status feed twice (push-fed snapshots —
    // immune to long frames starving a port round-trip).
    const statusA = { status: await page.evaluate(() => window.CnCPort.state.threadedEngine) };
    await page.waitForTimeout(5000);
    const statusB = { status: await page.evaluate(() => window.CnCPort.state.threadedEngine) };
    const loopA = statusA?.status?.loop;
    const loopB = statusB?.status?.loop;
    const seconds = (statusB?.status?.now - statusA?.status?.now) / 1000;
    const clientRate = loopA && loopB && seconds > 0
      ? (loopB.clientFrames - loopA.clientFrames) / seconds : 0;
    const logicRate = loopA && loopB && seconds > 0
      ? (loopB.logicFrames - loopA.logicFrames) / seconds : 0;
    summary.pacing = {
      seconds,
      clientRate: Number(clientRate.toFixed(2)),
      logicRate: Number(logicRate.toFixed(2)),
      loopActive: loopB?.active === true,
      loopError: loopB?.error ?? null,
      frame: statusB?.status?.frame ?? null,
    };
    log(`paced loop measured over ${seconds.toFixed(1)}s: client ${clientRate.toFixed(1)}/s logic ${logicRate.toFixed(1)}/s`);
    checks.push(["paced loop active on the engine thread", loopB?.active === true]);
    checks.push(["client frames advancing", clientRate > 1]);
    checks.push(["logic frames advancing", logicRate > 0.5]);
    checks.push([
      // Paced-mode invariant: logic never exceeds catchup (2) logic frames
      // per client frame. Under SwiftShader overload the loop legitimately
      // runs AT the catchup bound (sim slows gracefully, original engine
      // behavior); exact 60/30 is a real-GPU (Mac Metal) measurement.
      "logic within paced catchup bound (<= 2x client rate)",
      logicRate <= clientRate * 2.1 + 1,
    ]);
    // Exact 60/30 only holds on a real GPU; record it when SwiftShader keeps up.
    summary.pacing.hitsTargetRates = clientRate >= 55 && clientRate <= 65
      && logicRate >= 27 && logicRate <= 33;

    if (BINK_VIDEO_ONLY) {
      if (BINK_VIDEO_DISABLED) {
        const disabledVideo = await page.evaluate(async () => {
          const state = await window.CnCPort.rpc("state");
          return {
            assets: state?.state?.binkVideoAssets ?? null,
            worker: window.CnCPort.state.threadedEngine?.bink ?? null,
          };
        });
        summary.binkVideoDisabled = disabledVideo;
        checks.push([
          "optional videos stay unstaged when installation choice is off",
          disabledVideo.assets?.skipped === true
            && disabledVideo.assets?.files?.length === 0
            && disabledVideo.worker?.opens === 0,
        ]);
      } else {
        await runBinkVideoGate(page, summary, checks);
      }
      summary.videoOnlyExit = await page.evaluate(() => window.ZeroHRuntime.exit());
      checks.push([
        "video-only gate shuts the threaded runtime down cleanly",
        summary.videoOnlyExit?.ok === true
          && summary.videoOnlyExit?.result?.engine?.workerTerminated === true,
      ]);
      throw new BinkVideoGateComplete();
    }

    // ---------- GATE C: forwarded input reaches the engine ----------
    const canvasBox = await page.locator("#viewport").boundingBox();
    const targetCss = {
      x: canvasBox.x + canvasBox.width * 0.5,
      y: canvasBox.y + canvasBox.height * 0.55,
    };
    await page.mouse.move(targetCss.x, targetCss.y, { steps: 5 });
    await page.waitForTimeout(1000);
    const inputProbe = await page.evaluate(() => window.CnCPort.rpc("probeBrowserInput"));
    const expectedEnginePoint = await page.evaluate(({ x, y }) => {
      // Recompute the engine-space point the bridge should have forwarded
      // (mirror of canvasInputPointFromEvent for the aspect-matched case).
      const canvas = document.querySelector("#viewport");
      const rect = canvas.getBoundingClientRect();
      const size = window.CnCPort.state.engineDisplaySize;
      if (!size) return null;
      const scaleX = size.width / rect.width;
      const scaleY = size.height / rect.height;
      return {
        x: Math.round((x - rect.left) * scaleX),
        y: Math.round((y - rect.top) * scaleY),
        engine: size,
      };
    }, targetCss);
    const engineCursor = inputProbe?.probe?.cursor ?? null;
    summary.input = { expectedEnginePoint, engineCursor };
    const probedX = Number(engineCursor?.x ?? NaN);
    const probedY = Number(engineCursor?.y ?? NaN);
    const cursorMatches = expectedEnginePoint
      && Number.isFinite(probedX) && Number.isFinite(probedY)
      && Math.abs(probedX - expectedEnginePoint.x) <= 12
      && Math.abs(probedY - expectedEnginePoint.y) <= 12;
    checks.push([
      "forwarded pointermove visible in engine browser-input state",
      Boolean(cursorMatches),
    ]);

    // The original Win32 mouse owns cursor selection. The wasm platform shim
    // preserves its LoadCursorFromFile handle, and bridge.js presents the
    // extracted frame from the shipped ANI rather than a generic CSS arrow.
    await page.waitForFunction(() =>
      window.CnCPort?.state?.browserCursor?.source === "game_ani_cursor_css",
    null, { timeout: 10000 }).catch(() => {});
    const cursorPresentation = await page.evaluate(async () => {
      const cursor = window.CnCPort?.state?.browserCursor ?? null;
      const response = cursor?.frameUrl ? await fetch(cursor.frameUrl, { cache: "no-store" }) : null;
      const bytes = response?.ok ? new Uint8Array(await response.arrayBuffer()) : null;
      return {
        cursor,
        computedCss: getComputedStyle(document.querySelector("#viewport")).cursor,
        frameFetched: response?.ok === true,
        frameIsCur: bytes?.length >= 6
          && bytes[0] === 0 && bytes[1] === 0
          && bytes[2] === 2 && bytes[3] === 0,
      };
    });
    summary.cursorPresentation = cursorPresentation;
    checks.push([
      "original SCCPointer ANI cursor is presented on the canvas",
      cursorPresentation.cursor?.cursorFile?.toLowerCase().endsWith("sccpointer.ani")
        && cursorPresentation.cursor?.frameCount === 1
        && cursorPresentation.cursor?.frameUrl?.endsWith(".cur")
        && cursorPresentation.computedCss.includes("sccpointer/frame-000.cur")
        && cursorPresentation.frameFetched === true
        && cursorPresentation.frameIsCur === true,
    ]);

    const attackCursorResult = await page.evaluate(() => window.CnCPort.rpc(
      "setMouseCursorForHarness",
      { cursor: 7 }, // Mouse::ATTACK_OBJECT
    ));
    await page.waitForFunction(() => {
      const cursor = window.CnCPort?.state?.browserCursor;
      return cursor?.source === "game_ani_cursor_css"
        && cursor?.cursorFile?.toLowerCase().endsWith("sccattack.ani");
    }, null, { timeout: 10000 }).catch(() => {});
    const attackFrames = await page.evaluate(async () => {
      const frames = new Set();
      for (let sample = 0; sample < 12; sample += 1) {
        const frame = window.CnCPort?.state?.browserCursor?.frame;
        if (Number.isInteger(frame)) frames.add(frame);
        await new Promise((resolveSample) => setTimeout(resolveSample, 80));
      }
      return [...frames];
    });
    const attackCursorPresentation = await page.evaluate(() =>
      window.CnCPort?.state?.browserCursor ?? null);
    const restoreCursorResult = await page.evaluate(() => window.CnCPort.rpc(
      "setMouseCursorForHarness",
      { cursor: 2 }, // Mouse::ARROW
    ));
    summary.attackCursorPresentation = {
      rpc: attackCursorResult,
      cursor: attackCursorPresentation,
      observedFrames: attackFrames,
      restoreRpc: restoreCursorResult,
    };
    checks.push([
      "original SCCAttack ANI sequence animates on the canvas",
      attackCursorResult.ok === true
        && attackCursorPresentation?.cursorFile?.toLowerCase().endsWith("sccattack.ani")
        && attackCursorPresentation?.frameCount === 8
        && attackCursorPresentation?.stepCount === 10
        && attackFrames.length >= 2
        && restoreCursorResult.ok === true,
    ]);

    // Hover/click visual evidence: sweep the mouse across the menu band and
    // capture before/after shots; a hilite change is expected but only
    // recorded (menu layout varies with resolution), the click state check
    // below is the hard gate.
    const beforeHover = await captureViewport(page, null);
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.35, { steps: 8 });
    await page.waitForTimeout(1200);
    const afterHover = await captureViewport(page, join(shotDir, "p1c-menu-hover-threaded.png"));
    summary.hoverScreenshotDiffers = !beforeHover.equals(afterHover);
    checks.push([
      "canvas still animating around input (screenshots differ)",
      summary.hoverScreenshotDiffers === true,
    ]);

    // State RPC round trip (windows dump through the engine-call facade).
    const windowsDump = await page.evaluate(() => window.CnCPort.rpc("realEngineDumpWindows"));
    const windowCount = Array.isArray(windowsDump?.windows?.windows)
      ? windowsDump.windows.windows.length : 0;
    summary.windowsDump = { ok: windowsDump?.ok === true, windowCount };
    checks.push(["state RPC round-trips (realEngineDumpWindows)", windowsDump?.ok === true && windowCount > 0]);
    // The main-menu shell proves the ordinary intro flow completed without a
    // hang. Exercise a real shipped movie explicitly so the gate can verify
    // browser decode, worker frame copy, original display presentation, and
    // teardown without depending on the user's intro-movie preference.
    const menuWindowPresent = JSON.stringify(windowsDump?.windows ?? {}).includes("MainMenu.wnd");
    summary.menuWindowPresent = menuWindowPresent;
    checks.push(["main-menu shell reached (intro movie path completed, no hang)", menuWindowPresent]);

    await runBinkVideoGate(page, summary, checks);

    // ---------- threaded `state` carries the wasm cnc_port_state fields ----------
    const stateRpc = await page.evaluate(() => window.CnCPort.rpc("state"));
    summary.threadedStateRpc = {
      wasmStateSource: stateRpc?.wasmStateSource ?? null,
      originalEngineLinked: stateRpc?.state?.originalEngineLinked === true,
      hasGlobalDataProbe: stateRpc?.state?.globalDataProbe != null,
    };
    checks.push([
      "threaded state RPC merges cnc_port_state (engine-thread source + wasm fields)",
      stateRpc?.wasmStateSource === "engine-thread"
        && stateRpc?.state?.originalEngineLinked === true,
    ]);

    // ---------- issue-dump RPC routes ----------
    const dumpRoutes = await page.evaluate(async () => {
      const animReport = await window.CnCPort.rpc("realEngineAnimReport", { maxEntries: 8 });
      const selection = await window.CnCPort.rpc("querySelection", {});
      const frameSummary = await window.CnCPort.rpc("realEngineFrameSummary", { frames: 1 });
      const textures = await window.CnCPort.rpc("d3d8TextureInventory", { sizes: [], sampleLimit: 0 });
      return {
        animReport: { ok: animReport?.ok === true, entries: animReport?.report?.drawables?.length ?? null },
        selection: { ok: selection?.ok === true, error: selection?.error ?? null, ready: selection?.result?.ready ?? null },
        frameSummary: { ok: frameSummary?.ok === true, frames: frameSummary?.frame?.framesCompleted ?? null },
        textures: { ok: textures?.ok === true, liveCount: textures?.liveCount ?? null },
      };
    });
    summary.issueDumpRoutes = dumpRoutes;
    checks.push(["realEngineAnimReport routed (issue dumps)", dumpRoutes.animReport.ok === true]);
    checks.push([
      "querySelection routed (no threaded-unsupported error)",
      dumpRoutes.selection.error !== "not yet supported in threaded mode"
        && dumpRoutes.selection.ready !== null,
    ]);
    checks.push(["realEngineFrameSummary routed (deep snapshots)", dumpRoutes.frameSummary.ok === true]);
    checks.push([
      "d3d8TextureInventory routed to the engine realm",
      dumpRoutes.textures.ok === true && (dumpRoutes.textures.liveCount ?? 0) > 0,
    ]);

    // ---------- issue-recorder video: placeholder canvas captureStream ----------
    const captureProbe = await page.evaluate(() => {
      const viewport = document.querySelector("#viewport");
      if (typeof viewport?.captureStream !== "function") {
        return { ok: false, reason: "captureStream unavailable" };
      }
      try {
        const stream = viewport.captureStream(2);
        const track = stream.getVideoTracks()[0] ?? null;
        const ok = track != null && track.readyState === "live";
        track?.stop();
        return { ok };
      } catch (error) {
        return { ok: false, reason: String(error) };
      }
    });
    summary.captureStream = captureProbe;
    checks.push([
      "placeholder canvas captureStream live (issue-recorder video)",
      captureProbe.ok === true,
    ]);

    // ---------- audible path: streams decode, samples start, completions drain ----------
    const audioResume = await page.evaluate(() =>
      window.CnCPort.rpc("resumeBrowserAudioRuntime", { trigger: "threaded-gate" }));
    summary.audioContextState = audioResume?.browserAudioRuntime?.contextState
      ?? audioResume?.contextState ?? null;
    const audioContextRunning = await page.evaluate(async () => {
      const result = await window.CnCPort.rpc("resumeBrowserAudioRuntime", { trigger: "threaded-gate-2" });
      return result?.browserAudioRuntime?.contextState ?? result?.contextState ?? null;
    });
    checks.push([
      "AudioContext running (autoplay-authorized boot)",
      summary.audioContextState === "running" || audioContextRunning === "running",
    ]);
    // Trigger a deterministic 2D GUI-click sample through the engine's own
    // input path, then wait for the shellmap/menu audio evidence to
    // accumulate: music stream scheduled, samples started, completions back.
    await page.evaluate(() =>
      window.CnCPort.rpc("clickWindowByName", { name: "MainMenu.wnd:ButtonSinglePlayer" }));
    log("waiting for audible-path evidence (stream + samples + completions)...");
    const audioStartedAt = Date.now();
    const audioDeadline = audioStartedAt + 180000;
    let audio = null;
    let secondClickIssued = false;
    for (;;) {
      const state = await page.evaluate(() => window.CnCPort.rpc("state"));
      const stream = state?.state?.browserMssStreamPlaybackRuntime ?? {};
      const s2d = state?.state?.browserMssSamplePlaybackRuntime ?? {};
      const s3d = state?.state?.browserMss3DSamplePlaybackRuntime ?? {};
      const worker = await page.evaluate(() => window.CnCPort.state.threadedEngine?.mssForward ?? null);
      audio = {
        streamStarted: stream.started ?? 0,
        streamDecoded: stream.decoded ?? 0,
        streamScheduled: stream.scheduled ?? 0,
        streamLastError: stream.lastError ?? null,
        sample2dStarted: s2d.started ?? 0,
        sample2dCompleted: s2d.completed ?? 0,
        sample2dLastError: s2d.lastError ?? null,
        sample3dStarted: s3d.started ?? 0,
        decodedCache: s2d.decodedCache ?? null,
        mssForward: worker,
        completionFailureLogged: (state?.logs ?? []).some((entry) =>
          entry?.message === "threaded audio completion failed"),
      };
      const startedTotal = audio.sample2dStarted + audio.sample3dStarted;
      const dedupeEngaged = (audio.mssForward?.dedupeSkips ?? 0) > 0;
      if (audio.streamScheduled > 0 && startedTotal > 0 && audio.sample2dCompleted > 0 && dedupeEngaged) {
        break;
      }
      if (Date.now() > audioDeadline) {
        break;
      }
      if (!secondClickIssued && !dedupeEngaged && Date.now() - audioStartedAt > 30000) {
        // Deterministic dedupe trigger: a second button click replays the
        // same GUI-click sample, which must ride the key-only path.
        secondClickIssued = true;
        await page.evaluate(() =>
          window.CnCPort.rpc("clickWindowByName", { name: "MainMenu.wnd:ButtonSkirmish" }));
      }
      await page.waitForTimeout(5000);
    }
    summary.audio = audio;
    log(`audio evidence: ${JSON.stringify(audio)}`);
    checks.push([
      "music/speech stream decoded + scheduled from OPFS-backed archives",
      audio.streamScheduled > 0 && audio.streamDecoded > 0,
    ]);
    checks.push([
      "MSS samples started (decode+buffer+start proof)",
      audio.sample2dStarted + audio.sample3dStarted > 0,
    ]);
    checks.push([
      "sample completions drain back into the engine (onended -> engineCall)",
      audio.sample2dCompleted > 0 && audio.completionFailureLogged === false,
    ]);
    checks.push([
      "worker byte-copy dedupe engaged (repeat starts key-only, no lost plays)",
      (audio.mssForward?.dedupeSkips ?? 0) > 0
        && (audio.decodedCache?.dedupeMisses ?? 0) === 0,
    ]);

    // ---------- shader tier plumbed into the worker realm ----------
    const shaderTier = await page.evaluate(() => window.CnCPort.state.threadedEngine?.shaderTier ?? null);
    summary.shaderTier = shaderTier;
    checks.push([
      "worker executor uses the default enhanced shader tier (setup-options plumbing)",
      shaderTier === "ps11",
    ]);

    // ---------- resolution-change flow on the engine thread ----------
    const resolutionTarget = { width: 1024, height: 768 };
    const resolutionResult = await page.evaluate((target) =>
      window.CnCPort.rpc("setEngineResolution", target), resolutionTarget);
    summary.resolutionChange = {
      ok: resolutionResult?.ok === true,
      applied: resolutionResult?.applied ?? null,
      reflow: resolutionResult?.reflow ?? null,
      error: resolutionResult?.error ?? null,
    };
    let resolutionFollowed = false;
    if (resolutionResult?.ok === true) {
      try {
        await page.waitForFunction((target) => {
          const size = window.CnCPort?.state?.engineDisplaySize;
          return size?.width === target.width && size?.height === target.height;
        }, resolutionTarget, { timeout: 180000, polling: 1000 });
        resolutionFollowed = true;
      } catch {
        resolutionFollowed = false;
      }
    }
    summary.resolutionChange.followed = resolutionFollowed;
    checks.push([
      "setEngineResolution round-trips on the engine thread and sizes follow",
      resolutionResult?.ok === true
        && resolutionResult?.applied?.width === resolutionTarget.width
        && resolutionResult?.applied?.height === resolutionTarget.height
        && resolutionFollowed,
    ]);

    const finalStatus = { status: await page.evaluate(() => window.CnCPort.state.threadedEngine) };
    summary.finalStatus = {
      initState: finalStatus?.status?.initState,
      loop: finalStatus?.status?.loop,
      frame: finalStatus?.status?.frame,
      engineDisplaySize: finalStatus?.status?.engineDisplaySize,
      contextLost: finalStatus?.status?.contextLost,
    };
    checks.push(["no WebGL context loss in the worker", finalStatus?.status?.contextLost !== true]);

    // ---------- saves: IDBFS persist + fresh-page listSaves round trip ----------
    // The engine writes saves through the pthread->main FS proxy into the
    // main runtime's MEMFS, where IDBFS is mounted (bridge preRun). Write a
    // marker .sav into the real save dir, persist, then verify a FRESH page
    // (same profile => same IndexedDB) lists it after its boot-time syncfs.
    const saveMarker = "__threaded_gate_roundtrip.sav";
    const saveWrite = await page.evaluate(async (markerName) => {
      const module = window.CnCPort.engineModule();
      const dir = "/home/web_user/Command and Conquer Generals Zero Hour Data/Save";
      let current = "";
      for (const part of dir.split("/").filter(Boolean)) {
        current += `/${part}`;
        try {
          module.FS.mkdir(current);
        } catch { /* exists */ }
      }
      module.FS.writeFile(`${dir}/${markerName}`, new Uint8Array([0x4f, 0x4c, 0x44]));
      // Start the same coordinator path used by the five-second interval, then
      // mutate the save AFTER syncfs has begun. Exit must drain this older
      // snapshot and issue a fresh trailing syncfs containing "SAVE!".
      window.__threadedGatePreExitPersist = window.CnCPort.persistScheduledSaves(
        "threaded-gate-periodic-race",
      );
      module.FS.writeFile(`${dir}/${markerName}`, new Uint8Array([0x53, 0x41, 0x56, 0x45, 0x21]));
      const listed = await window.CnCPort.rpc("listSaves");
      return { periodicStarted: true, listed };
    }, saveMarker);
    summary.saveWrite = {
      periodicStarted: saveWrite?.periodicStarted === true,
      listedHere: (saveWrite?.listed?.files ?? []).some((file) => file.name === saveMarker),
    };
    checks.push([
      "periodic save race is armed after syncfs starts",
      summary.saveWrite.periodicStarted && summary.saveWrite.listedHere,
    ]);

    // ---------- clean launcher exit: compositor + worker teardown ----------
    // The game canvas is transferred to OffscreenCanvas and promoted to its
    // own compositor layer. A state-only assertion misses Chrome retaining
    // that layer's last terrain frame over the desktop, so capture the whole
    // page after the real launcher exit and assert desktop pixels too.
    const exitStartedAt = Date.now();
    const exitResult = await page.evaluate(() => window.ZeroHRuntime.exit());
    const exitElapsedMs = Date.now() - exitStartedAt;
    await page.waitForTimeout(250);
    const desktopAfterExitPath = join(shotDir, "p1c-desktop-after-exit.png");
    const desktopAfterExit = await page.screenshot({ path: desktopAfterExitPath, timeout: 60000 });
    const desktopPixels = await samplePageScreenshot(page, desktopAfterExit);
    const desktopComparison = await compareUpperDesktopScreenshots(
      page,
      desktopAfterExit,
      desktopReference,
    );
    const exitDom = await page.evaluate(() => {
      const overlay = document.querySelector("#launchOverlay");
      const viewport = document.querySelector("#viewport");
      const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return {
        closed: window.ZeroHRuntime.closed,
        closing: window.ZeroHRuntime.closing,
        overlayConnected: Boolean(overlay?.isConnected),
        viewportConnected: Boolean(viewport?.isConnected),
        centerInsideRuntime: Boolean(center?.closest("#launchOverlay")),
      };
    });
    summary.cleanExit = {
      elapsedMs: exitElapsedMs,
      result: exitResult,
      dom: exitDom,
      screenshot: desktopAfterExitPath,
      screenshotBytes: desktopAfterExit.length,
      pixels: desktopPixels,
      referenceComparison: desktopComparison,
    };
    checks.push([
      "launcher exit is bounded and terminates the engine worker",
      exitElapsedMs < 45000
        && exitResult?.ok === true
        && exitResult?.close?.viewportRetired === true
        && exitResult?.result?.engine?.workerTerminated === true
        && exitResult?.result?.engine?.pendingCommands === 0
        && exitResult?.result?.engine?.pthreadRunning === 0
        && exitResult?.result?.engine?.engineThreadStarted === false
        && exitResult?.close?.finalSaveFresh === true
        && exitResult?.close?.saves?.value?.sequence
          > exitResult?.close?.saveScheduling?.value?.sequence
        && JSON.stringify(exitResult?.close?.order) === JSON.stringify([
          "save-scheduling-stopped",
          "frame-loop-stopped",
          "final-save-flushed",
          "runtime-destroyed",
        ]),
    ]);
    checks.push([
      "transferred game canvas is retired from the desktop compositor",
      exitDom.closed === true
        && exitDom.closing === false
        && exitDom.overlayConnected === false
        && exitDom.viewportConnected === false
        && exitDom.centerInsideRuntime === false,
    ]);
    checks.push([
      "post-exit upper desktop shows sky instead of a ghost terrain frame",
      desktopAfterExit.length > 10 * 1024
        && desktopPixels.standardDeviation > 12
        && desktopPixels.bottomBlueFraction > 0.45
        && desktopPixels.upperEdgeSkyFraction > 0.35
        && desktopPixels.upperEdgeTerrainFraction < 0.25
        && desktopComparison.meanAbsoluteDifference < 18
        && desktopComparison.changedFraction < 0.2,
    ]);

    // Exercise the user's actual desktop path: click the visible Zero Hour
    // shortcut, observe the fresh document load, wait for autostart to reach a
    // second real runtime, and close that runtime through the same durable
    // shutdown sequence. This is deliberately not location.reload() from the
    // test: the launcher's click handler owns the transparent reload contract.
    const shortcut = page.locator("[data-game-shortcut]");
    await shortcut.waitFor({ state: "visible", timeout: 30000 });
    const reloaded = page.waitForEvent("domcontentloaded", { timeout: 120000 });
    await shortcut.click();
    await reloaded;
    await page.waitForFunction(() => window.ZeroHRuntime?.started === true, null, {
      timeout: BOOT_TIMEOUT_MS,
      polling: 500,
    });
    const relaunchState = await page.evaluate(() => ({
      started: window.ZeroHRuntime.started,
      closed: window.ZeroHRuntime.closed,
      shaderTier: window.CnCPort?.state?.threadedEngine?.shaderTier ?? null,
      saveBytes: Array.from(window.CnCPort.engineModule().FS.readFile(
        "/home/web_user/Command and Conquer Generals Zero Hour Data/Save/__threaded_gate_roundtrip.sav",
      )),
    }));
    const relaunchExit = await page.evaluate(() => window.ZeroHRuntime.exit());
    summary.cleanExit.relaunch = { state: relaunchState, exit: relaunchExit };
    checks.push([
      "desktop shortcut transparently relaunches and cleanly closes a fresh runtime",
      relaunchState.started === true
        && relaunchState.closed === false
        && JSON.stringify(relaunchState.saveBytes) === JSON.stringify([0x53, 0x41, 0x56, 0x45, 0x21])
        && relaunchExit?.ok === true
        && relaunchExit?.result?.engine?.workerTerminated === true
        && relaunchExit?.result?.engine?.pendingCommands === 0
        && relaunchExit?.result?.engine?.pthreadRunning === 0
        && relaunchExit?.result?.engine?.engineThreadStarted === false
        && relaunchExit?.close?.viewportRetired === true
        && relaunchExit?.close?.finalSaveFresh === true,
    ]);

    const warningShortcut = page.locator("[data-game-shortcut]");
    await warningShortcut.waitFor({ state: "visible", timeout: 30000 });
    const warningReload = page.waitForEvent("domcontentloaded", { timeout: 120000 });
    await warningShortcut.click();
    await warningReload;
    await page.waitForFunction(() => window.ZeroHRuntime?.started === true, null, {
      timeout: BOOT_TIMEOUT_MS,
      polling: 500,
    });
    await page.evaluate(() => {
      window.CnCPort.persistFinalSaves = () => Promise.resolve({
        ok: false,
        finalFresh: false,
        error: "threaded gate injected final-save failure",
      });
    });
    const failedSaveExit = await page.evaluate(() => window.ZeroHRuntime.exit());
    const failedSaveWarning = await page.locator(".toast.warning").last().textContent();
    summary.cleanExit.failedSave = { exit: failedSaveExit, warning: failedSaveWarning };
    checks.push([
      "final-save failure fails close and shows a visible warning",
      failedSaveExit?.ok === false
        && failedSaveExit?.close?.finalSaveFresh === false
        && failedSaveExit?.result?.engine?.workerTerminated === true
        && failedSaveExit?.result?.engine?.pendingCommands === 0
        && failedSaveExit?.result?.engine?.pthreadRunning === 0
        && /save warning/i.test(failedSaveWarning ?? "")
        && /latest save/i.test(failedSaveWarning ?? ""),
    ]);

    await page.close();

    const savePage = await browser.newPage();
    await savePage.goto(new URL("harness/play.html", server.url).href, { waitUntil: "load" });
    let savedAcrossReload = false;
    let saveList = null;
    const saveDeadline = Date.now() + 120000;
    while (Date.now() < saveDeadline) {
      saveList = await savePage.evaluate(() => window.CnCPort?.rpc
        ? window.CnCPort.rpc("listSaves")
        : null);
      if (saveList?.ok === true
          && (saveList.files ?? []).some((file) => file.name === saveMarker && file.size === 5)) {
        savedAcrossReload = true;
        break;
      }
      await savePage.waitForTimeout(2000);
    }
    summary.saveRoundTrip = { savedAcrossReload, files: saveList?.files ?? null };
    checks.push([
      "save file survives a fresh page load (IDBFS round trip, threaded)",
      savedAcrossReload,
    ]);
    // Clean up the marker so repeated runs (and the owner's profile pattern)
    // never accumulate gate artifacts.
    await savePage.evaluate(async (markerName) => {
      try {
        const module = window.CnCPort.engineModule();
        module.FS.unlink(`/home/web_user/Command and Conquer Generals Zero Hour Data/Save/${markerName}`);
        await window.CnCPort.rpc("persistSaves", { reason: "threaded-gate-cleanup" });
      } catch { /* best effort */ }
    }, saveMarker);
    await savePage.close();
  } catch (error) {
    if (!(error instanceof BinkVideoGateComplete)) {
      failure = error instanceof Error ? error.stack ?? error.message : String(error);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) {
    process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
  }
  if (failure || failed.length > 0) {
    process.stdout.write("---- page console (tail) ----\n");
    for (const line of consoleLines.slice(-120)) {
      process.stdout.write(`${line}\n`);
    }
    process.stdout.write("---- end console ----\n");
    if (failure) {
      process.stderr.write(`${failure}\n`);
    }
    if (failed.length > 0) {
      process.stderr.write(`threaded play gate failed: ${failed.map(([n]) => n).join(", ")}\n`);
    }
    process.exit(1);
  }
  process.stdout.write("threaded play gate: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
