// threaded_skirmish_memory_probe.mjs — P3 fixed-heap sizing instrument.
//
// Boots the REAL play page in threaded mode (?threads=1, OPFS mounts), waits
// for the title/shellmap, then drives the engine's own UI path into a REAL
// SKIRMISH MATCH (clickWindowByName RPC -> winSendInputMsg, the same exports
// the non-threaded harness uses) and samples wasm memory + JS heap while the
// match runs on the engine thread. Peak wasm memory (with ALLOW_MEMORY_GROWTH
// on, buffer.byteLength tracks real growth) is the sizing input for the
// threaded build's fixed-size heap; on a fixed-heap build the same probe
// proves the match runs without an OOM abort.
//
// Usage: node harness/threaded_skirmish_memory_probe.mjs
//   SKIRMISH_MAP=<mapcache name>   optional map override (default: whatever
//                                  the skirmish menu has pre-selected)
//   RUN_SECONDS=120                in-match sampling window
//   BOOT_TIMEOUT_MS / VERBOSE=1    as threaded_play_gate.mjs
// Screenshots: artifacts/screenshots/p3-skirmish-threaded*.png

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const shotDir = resolve(wasmRoot, "artifacts/screenshots");
const BOOT_TIMEOUT_MS = Number(process.env.BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const RUN_SECONDS = Number(process.env.RUN_SECONDS ?? 120);
const SKIRMISH_MAP = String(process.env.SKIRMISH_MAP ?? "").trim();
const verbose = process.env.VERBOSE === "1";

function log(line) {
  process.stdout.write(`[threaded-skirmish-mem] ${line}\n`);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(
    ({ command, payload }) => window.CnCPort.rpc(command, payload),
    { command, payload },
  );
}

async function sampleMemory(page) {
  return page.evaluate(() => {
    const module = window.CnCPort?.engineModule?.();
    const engine = window.CnCPort?.state?.threadedEngine;
    return {
      at: Date.now(),
      wasmMemoryBytes: module?.wasmMemory?.buffer?.byteLength ?? null,
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
      loop: engine?.loop
        ? { clientFrames: engine.loop.clientFrames, logicFrames: engine.loop.logicFrames }
        : null,
      loadSessionActive: engine?.frame?.loadSessionActive ?? null,
      logicFrame: engine?.frame?.logicFrame ?? null,
    };
  });
}

async function clickWithRetry(page, name, { attempts = 30, delayMs = 2000 } = {}) {
  let lastResult = null;
  for (let i = 0; i < attempts; i += 1) {
    const result = await rpc(page, "clickWindowByName", { name });
    lastResult = result;
    if (result?.result?.clicked === true) {
      return result.result;
    }
    if (verbose) {
      log(`click ${name} attempt ${i + 1}: ${JSON.stringify(result?.result ?? result).slice(0, 160)}`);
    }
    await page.waitForTimeout(delayMs);
  }
  throw new Error(`window ${name} never became clickable: ${JSON.stringify(lastResult?.result ?? lastResult).slice(0, 300)}`);
}

async function captureViewport(page, path) {
  const shot = await page.evaluate(() => window.CnCPort.rpc("screenshot"));
  const dataUrl = typeof shot?.screenshot === "string"
    ? shot.screenshot
    : shot?.screenshot?.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("screenshot rpc returned no dataUrl");
  }
  const buffer = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  await writeFile(path, buffer);
  return buffer;
}

async function main() {
  await mkdir(shotDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/threaded-skirmish-mem");
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  const browser = await chromium.launchPersistentContext(profileDir, {
    viewport: { width: 1280, height: 800 },
  });
  let failure = null;
  const summary = { runSeconds: RUN_SECONDS, map: SKIRMISH_MAP || "(menu default)" };
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.on("pageerror", (err) => {
      if (verbose) process.stderr.write(`[pageerror] ${err.message}\n`);
    });
    if (verbose) {
      page.on("console", (msg) => process.stderr.write(`[console] ${msg.type()}: ${msg.text()}\n`));
    }
    log("booting threaded play page (OPFS mounts)...");
    const bootStart = Date.now();
    await page.goto(new URL("harness/play.html?autostart=1&threads=1", server.url).href, { waitUntil: "load" });
    await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: BOOT_TIMEOUT_MS });
    log(`boot returned in ${((Date.now() - bootStart) / 1000).toFixed(1)}s; draining shellmap load...`);
    await page.waitForFunction(() => {
      const engine = window.CnCPort?.state?.threadedEngine;
      return engine?.loop?.active === true
        && engine?.frame != null
        && engine.frame.loadSessionActive === false
        && (engine.loop.clientFrames ?? 0) > 30;
    }, null, { timeout: 12 * 60 * 1000, polling: 2000 });
    summary.titleMemory = await sampleMemory(page);
    log(`title: wasm ${(summary.titleMemory.wasmMemoryBytes / 1024 ** 2).toFixed(0)} MiB, `
      + `js ${(summary.titleMemory.jsHeapBytes / 1024 ** 2).toFixed(0)} MiB`);

    // Menu navigation through the engine's own window path. Menu transitions
    // animate PER CLIENT FRAME (~1.5fps under SwiftShader), so one-shot
    // clicks get swallowed while a transition runs — click in rounds and
    // poll an engine-state readiness signal between rounds.
    log("clicking Single Player...");
    await clickWithRetry(page, "MainMenu.wnd:ButtonSinglePlayer");

    // Skirmish menu readiness signal: TheSkirmishGameInfo exists once the
    // menu is up — poll the map-set export until it stops reporting
    // skirmishGameInfoNotReady (an empty map name reports mapNotFound once
    // ready, which is fine as a readiness signal).
    log("clicking Skirmish (rounds) + waiting for TheSkirmishGameInfo...");
    let menuReady = false;
    for (let round = 0; round < 20 && !menuReady; round += 1) {
      const click = await rpc(page, "clickWindowByName", { name: "MainMenu.wnd:ButtonSkirmish" });
      if (verbose) {
        log(`skirmish click round ${round}: ${JSON.stringify(click?.result ?? click).slice(0, 140)}`);
      }
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !menuReady) {
        const probe = await rpc(page, "realEngineSetSkirmishMap", { map: SKIRMISH_MAP });
        const err = probe?.result?.error ?? null;
        if (SKIRMISH_MAP ? probe?.ok === true : (err === "mapNotFound")) {
          menuReady = true;
          summary.mapSet = probe?.result ?? null;
          break;
        }
        if (SKIRMISH_MAP && err === "mapNotFound") {
          throw new Error(`requested map not in TheMapCache: ${SKIRMISH_MAP}`);
        }
        await page.waitForTimeout(2500);
      }
    }
    if (!menuReady) {
      throw new Error("skirmish menu never became ready (TheSkirmishGameInfo missing)");
    }
    log(`skirmish menu ready${SKIRMISH_MAP ? ` (map ${SKIRMISH_MAP} applied)` : ""}`);
    await captureViewport(page, join(shotDir, "p3-skirmish-threaded-menu.png"));

    // Start: same click-round pattern; the readiness signal is the load
    // session actually activating on the engine-thread status feed.
    log("clicking Start (rounds) + waiting for the match load session...");
    let loadSeen = false;
    for (let round = 0; round < 12 && !loadSeen; round += 1) {
      const click = await rpc(page, "clickWindowByName", { name: "SkirmishGameOptionsMenu.wnd:ButtonStart" });
      if (verbose) {
        log(`start click round ${round}: ${JSON.stringify(click?.result ?? click).slice(0, 140)}`);
      }
      loadSeen = await page.waitForFunction(() => {
        const engine = window.CnCPort?.state?.threadedEngine;
        return engine?.frame?.loadSessionActive === true;
      }, null, { timeout: 20000, polling: 1000 }).then(() => true).catch(() => false);
    }
    if (!loadSeen) {
      throw new Error("skirmish load session never activated after Start clicks");
    }
    await page.waitForFunction(() => {
      const engine = window.CnCPort?.state?.threadedEngine;
      return engine?.frame?.loadSessionActive === false;
    }, null, { timeout: 20 * 60 * 1000, polling: 2000 });
    log("load session drained; confirming match state...");
    const drawables = await rpc(page, "queryDrawables");
    const drawableCount = Array.isArray(drawables?.drawables?.drawables)
      ? drawables.drawables.drawables.length
      : (drawables?.drawables?.count ?? null);
    summary.drawableCount = drawableCount;
    log(`drawables in world: ${JSON.stringify(drawableCount)}`);
    await captureViewport(page, join(shotDir, "p3-skirmish-threaded-ingame.png"));

    // In-match sampling window.
    const samples = [];
    const start = Date.now();
    let peak = 0;
    while (Date.now() - start < RUN_SECONDS * 1000) {
      const sample = await sampleMemory(page);
      samples.push(sample);
      if (sample.wasmMemoryBytes != null) {
        peak = Math.max(peak, sample.wasmMemoryBytes);
      }
      if (verbose) {
        log(`t+${((sample.at - start) / 1000).toFixed(0)}s wasm ${(sample.wasmMemoryBytes / 1024 ** 2).toFixed(0)} MiB js ${(sample.jsHeapBytes / 1024 ** 2).toFixed(0)} MiB logicFrame ${sample.logicFrame}`);
      }
      await page.waitForTimeout(5000);
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    summary.samples = samples.length;
    summary.peakWasmBytes = peak;
    summary.peakWasmMiB = Number((peak / 1024 ** 2).toFixed(1));
    summary.lastJsHeapMiB = Number((last.jsHeapBytes / 1024 ** 2).toFixed(1));
    summary.logicFramesAdvanced = (last.logicFrame ?? 0) - (first.logicFrame ?? 0);
    summary.matchRanLogic = summary.logicFramesAdvanced > 0;
    await captureViewport(page, join(shotDir, "p3-skirmish-threaded-final.png"));

    log(`RESULT peak wasm ${summary.peakWasmMiB} MiB `
      + `(title ${(summary.titleMemory.wasmMemoryBytes / 1024 ** 2).toFixed(0)} MiB), `
      + `js heap ${summary.lastJsHeapMiB} MiB, `
      + `logic frames advanced ${summary.logicFramesAdvanced}, drawables ${JSON.stringify(drawableCount)}`);
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.matchRanLogic) {
      throw new Error("logic frames did not advance during the in-match window");
    }
    await page.close();
  } catch (error) {
    failure = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    await browser.close();
    await server.close();
  }
  if (failure) {
    console.error(`threaded skirmish memory probe: FAIL\n${failure}`);
    process.exit(1);
  }
  log("threaded skirmish memory probe: OK");
}

await main();
