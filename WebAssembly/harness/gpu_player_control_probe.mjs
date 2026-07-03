// GPU probe: boot real engine → campaign → player control → screenshot
// Run on Mac via: ssh cnc-gpu 'cd /Volumes/CnCWork/CnC_Generals_Zero_Hour/WebAssembly && node harness/gpu_player_control_probe.mjs'
// Requires: harness server running on :8123, Chrome installed, playwright-core

import { chromium } from "playwright-core";
import { stat, mkdir } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const deadline = Date.now() + 1200_000; // 20 min deadline

const HARNESS_URL = "http://127.0.0.1:8123/harness/index.html";

const realInitArchiveSpecs = [
  { name: "INIZH.big" },
  { name: "EnglishZH.big" },
  { name: "WindowZH.big" },
  { name: "MapsZH.big" },
  { name: "MusicZH.big" },
  { name: "GensecZH.big" },
  { name: "TerrainZH.big" },
  { name: "TexturesZH.big" },
  { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" },
  { name: "SpeechZH.big" },
  { name: "AudioZH.big" },
  { name: "ShadersZH.big" },
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

const win32MouseMessages = { mouseMove: 0x0200, leftButtonDown: 0x0201, leftButtonUp: 0x0202 };

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

async function rpc(page, method, params) {
  return page.evaluate((payload) => window.CnCPort.rpc(payload.method, payload.params), { method, params });
}

async function realEngineFrame(page, frames) {
  return rpc(page, "realEngineFrame", { frames });
}

async function postMouse(page, msg, point) {
  return rpc(page, "postMessage", { message: msg, lParam: win32PointLParam(point), point });
}

async function checkDeadline(label) {
  if (Date.now() > deadline) throw new Error(`DEADLINE: ${label}`);
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--enable-gpu", "--use-angle=metal"],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("crash", () => { console.error("PAGE CRASHED"); process.exit(2); });
  page.on("pageerror", (e) => console.error(`[pageerror] ${e.message}`));

  // Check renderer
  console.error("[gpu-probe] loading harness page...");
  await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc), { timeout: 60000 });

  const renderer = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    const ext = g.getExtension("WEBGL_debug_renderer_info");
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
  });
  console.error(`[gpu-probe] RENDERER: ${renderer}`);
  if (!renderer.includes("M4") && !renderer.includes("Apple")) {
    console.error("[gpu-probe] WARNING: not running on Apple GPU!");
  }

  // Boot
  console.error("[gpu-probe] booting...");
  const boot = await rpc(page, "boot", { source: "gpu player control probe" });
  console.error(`[gpu-probe] boot ok=${boot.ok}, wasm=${boot.state?.wasm}`);
  checkDeadline("boot");

  // Mount archives
  console.error("[gpu-probe] building archive list...");
  const archives = [];
  for (const spec of realInitArchiveSpecs) {
    const sourceName = spec.sourceName ?? spec.name;
    const path = resolve(archiveRoot, sourceName);
    const st = await stat(path);
    archives.push({
      name: spec.name,
      sourceName,
      url: new URL(relative(wasmRoot, path).split(sep).join("/"), "http://127.0.0.1:8123/").href,
      expectedBytes: st.size,
    });
  }

  console.error(`[gpu-probe] mounting ${archives.length} archives...`);
  const mount = await rpc(page, "mountArchives", {
    path: "/assets/real-init",
    verifyEach: false,
    archives,
  });
  console.error(`[gpu-probe] mount ok=${mount.ok}, count=${mount.archiveSet?.archiveCount}`);
  checkDeadline("mount");

  // Real engine init (no shellmap - we want full campaign)
  console.error("[gpu-probe] realEngineInit (full)...");
  const realInit = await rpc(page, "realEngineInit", { runDirectory: "/assets/real-init" });
  console.error(`[gpu-probe] init ok=${realInit.frontier?.initReturned}, subsystems=${realInit.frontier?.subsystemCompletedCount}, elapsed=${realInit.frontier?.elapsedMs}ms`);
  checkDeadline("init");

  // Initial frames to get to main menu
  console.error("[gpu-probe] initial frames to main menu...");
  let frameResult = await realEngineFrame(page, 5);
  if (frameResult.frame?.clientState?.shell?.screenCount > 0) {
    frameResult = await realEngineFrame(page, 2);
  }
  checkDeadline("menu-frames");

  // Reveal main menu by moving mouse
  console.error("[gpu-probe] revealing main menu...");
  await postMouse(page, win32MouseMessages.mouseMove, { x: 32, y: 32 });
  await realEngineFrame(page, 1);
  await postMouse(page, win32MouseMessages.mouseMove, { x: 96, y: 96 });

  // Wait for transition to finish and menu to be ready
  for (let i = 0; i < 100; i++) {
    frameResult = await realEngineFrame(page, 1);
    const transition = frameResult.frame?.clientState?.transition;
    const mouse = frameResult.frame?.clientState?.input?.mouse;
    if (transition?.finished === true && mouse?.visible === true) break;
    if (i % 20 === 0) console.error(`[gpu-probe] menu reveal frame ${i}, transition=${transition?.finished}, mouseVisible=${mouse?.visible}`);
  }
  await page.screenshot({ path: resolve(screenshotDir, "gpu-menu-reveal.png") });
  checkDeadline("menu-reveal");

  // Click Single Player button
  const mainMenu = frameResult.frame?.clientState?.mainMenu;
  const spButton = mainMenu?.buttonSinglePlayer;
  const spHit = mainMenu?.underButtonSinglePlayerCenter;
  console.error(`[gpu-probe] SinglePlayer button found=${spButton?.found}, clickable=${spButton?.clickable}`);

  const spPoint = spHit?.point ?? { x: spButton?.centerX ?? 644, y: spButton?.centerY ?? 134 };
  const spTarget = spHit?.window?.found === true ? spHit.window : spButton;

  await postMouse(page, win32MouseMessages.mouseMove, spPoint);
  await postMouse(page, win32MouseMessages.leftButtonDown, spPoint);
  // Wait for button grab
  for (let i = 0; i < 8; i++) {
    frameResult = await realEngineFrame(page, 1);
    const grab = frameResult.frame?.clientState?.input?.grabWindow;
    if (grab?.id === spTarget?.id) break;
  }
  await postMouse(page, win32MouseMessages.leftButtonUp, spPoint);
  // Wait for button release
  for (let i = 0; i < 8; i++) {
    frameResult = await realEngineFrame(page, 1);
  }
  // Wait for transition
  for (let i = 0; i < 90; i++) {
    frameResult = await realEngineFrame(page, 1);
    if (frameResult.frame?.clientState?.transition?.finished === true) break;
  }
  console.error(`[gpu-probe] SinglePlayer clicked, frame=${frameResult.frame?.framesCompleted}`);
  checkDeadline("click-sp");

  // Click USA button
  const usaMenu = frameResult.frame?.clientState?.mainMenu;
  const usaButton = usaMenu?.buttonUSA;
  const usaHit = usaMenu?.underButtonUSACenter;
  console.error(`[gpu-probe] USA button found=${usaButton?.found}, clickable=${usaButton?.clickable}`);

  const usaPoint = usaHit?.point ?? { x: usaButton?.centerX ?? 644, y: usaButton?.centerY ?? 134 };
  const usaTarget = usaHit?.window?.found === true ? usaHit.window : usaButton;

  await postMouse(page, win32MouseMessages.mouseMove, usaPoint);
  await postMouse(page, win32MouseMessages.leftButtonDown, usaPoint);
  for (let i = 0; i < 8; i++) {
    frameResult = await realEngineFrame(page, 1);
    const grab = frameResult.frame?.clientState?.input?.grabWindow;
    if (grab?.id === usaTarget?.id) break;
  }
  await postMouse(page, win32MouseMessages.leftButtonUp, usaPoint);
  for (let i = 0; i < 8; i++) {
    frameResult = await realEngineFrame(page, 1);
  }
  for (let i = 0; i < 90; i++) {
    frameResult = await realEngineFrame(page, 1);
    if (frameResult.frame?.clientState?.transition?.finished === true) break;
  }
  console.error(`[gpu-probe] USA clicked, frame=${frameResult.frame?.framesCompleted}`);
  checkDeadline("click-usa");

  // Click Easy button
  const diffMenu = frameResult.frame?.clientState?.mainMenu;
  const easyButton = diffMenu?.buttonEasy;
  const easyHit = diffMenu?.underButtonEasyCenter;
  console.error(`[gpu-probe] Easy button found=${easyButton?.found}, clickable=${easyButton?.clickable}`);

  const easyPoint = easyHit?.point ?? { x: easyButton?.centerX ?? 644, y: easyButton?.centerY ?? 134 };
  const easyTarget = easyHit?.window?.found === true ? easyHit.window : easyButton;

  await postMouse(page, win32MouseMessages.mouseMove, easyPoint);
  await postMouse(page, win32MouseMessages.leftButtonDown, easyPoint);
  for (let i = 0; i < 8; i++) {
    frameResult = await realEngineFrame(page, 1);
    const grab = frameResult.frame?.clientState?.input?.grabWindow;
    if (grab?.id === easyTarget?.id) break;
  }
  await postMouse(page, win32MouseMessages.leftButtonUp, easyPoint);
  for (let i = 0; i < 8; i++) {
    frameResult = await realEngineFrame(page, 1);
  }
  console.error(`[gpu-probe] Easy clicked, frame=${frameResult.frame?.framesCompleted}`);
  checkDeadline("click-easy");

  // Wait for campaign game start
  const baselineDebug = diffMenu?.debug;
  const baselineDoGameStart = Number(baselineDebug?.doGameStartCount ?? 0);
  console.error(`[gpu-probe] waiting for campaign game start (baseline doGameStart=${baselineDoGameStart})...`);

  for (let i = 0; i < 300; i++) {
    frameResult = await realEngineFrame(page, 1);
    const debug = frameResult.frame?.clientState?.mainMenu?.debug;
    if (Number(debug?.doGameStartCount ?? 0) > baselineDoGameStart
        && Number(debug?.lastCDPresent ?? 0) === 1
        && Number(debug?.lastNewGameMode ?? -1) === 0
        && Number(debug?.lastNewGameDifficulty ?? -1) === 0
        && typeof debug?.lastPendingFile === "string"
        && debug.lastPendingFile.length > 0) {
      console.error(`[gpu-probe] campaign game started! map=${debug.lastPendingFile}, frame=${frameResult.frame?.framesCompleted}`);
      break;
    }
    if (i % 50 === 0) {
      const debug = frameResult.frame?.clientState?.mainMenu?.debug;
      console.error(`[gpu-probe] game start wait frame ${i}, doGameStart=${debug?.doGameStartCount}, cdPresent=${debug?.lastCDPresent}, pendingFile=${debug?.lastPendingFile}`);
    }
    checkDeadline("game-start");
  }

  await page.screenshot({ path: resolve(screenshotDir, "gpu-campaign-start.png") });
  checkDeadline("campaign-start");

  // Now run frames until player control
  // Use summary frames (lighter weight) for the bulk intro sequence,
  // then switch to full frames near player control for state export.
  console.error("[gpu-probe] running frames until player control (max 3600)...");
  const maxFrames = 3600;
  let framesRun = 0;
  let playerControlReached = false;
  let playerControlFrame = null;
  let lastPlayerControlState = null;

  // Phase 1: summary frames in big chunks (fast, less state export)
  console.error("[gpu-probe] phase1: summary frames (bulk intro)...");
  for (let remaining = maxFrames; remaining > 0 && !playerControlReached && framesRun < 2800; ) {
    const frames = Math.min(500, remaining);
    frameResult = await rpc(page, "realEngineFrameSummary", { frames });
    framesRun += frames;

    const gameplay = frameResult.frame?.gameplay;
    const introDone = gameplay?.campaignIntroGates?.flags?.find(f => f.name === "INTRO_DONE")?.value;

    const inGame = gameplay?.inGame;
    const inputEnabled = gameplay?.inputEnabled;
    const letterBoxed = frameResult.frame?.display?.letterBoxed;
    const cb = frameResult.frame?.controlBar;
    const cbFound = cb?.found;
    const cbHidden = cb?.hidden;
    const cbManagerHidden = cb?.managerHidden;
    const cbClickable = cb?.clickable;
    const logicFrame = gameplay?.logicFrame;

    const reached = inGame === true
      && inputEnabled === true
      && introDone === true
      && letterBoxed === false
      && cbFound === true
      && cbHidden === false
      && cbManagerHidden === false
      && cbClickable === true;

    lastPlayerControlState = {
      framesRun, logicFrame, inGame, inputEnabled, introDone,
      letterBoxed, cbFound, cbHidden, cbManagerHidden, cbClickable,
      objectCount: gameplay?.objectCount, drawableCount: gameplay?.drawableCount,
    };

    if (framesRun % 400 === 0 || reached) {
      console.error(`[gpu-probe] frame ${framesRun}/3600 logic=${logicFrame} inGame=${inGame} input=${inputEnabled} introDone=${introDone} letterBoxed=${letterBoxed} cb=${cbFound}/${cbHidden}/${cbClickable} reached=${reached}`);
    }

    if (reached) {
      playerControlReached = true;
      playerControlFrame = framesRun;
    }

    remaining -= frames;
    checkDeadline("player-control-summary");
  }

  // Phase 2: if not reached yet, use full frames for richer state
  if (!playerControlReached) {
    console.error("[gpu-probe] phase2: full frames (detailed state)...");
    for (let remaining = maxFrames - framesRun; remaining > 0 && !playerControlReached; ) {
      const frames = Math.min(60, remaining);
      frameResult = await realEngineFrame(page, frames);
      framesRun += frames;

      const gameplay = frameResult.frame?.clientState?.gameplay;
      const scriptDebug = gameplay?.scriptDebug;
      const introDoneFlag = scriptDebug?.flags?.find(f => f.name === "INTRO_DONE");
      const introDone = introDoneFlag?.value;

      const display = frameResult.frame?.clientState?.display;
      const controlBar = frameResult.frame?.clientState?.controlBarWindows?.parent;

      const inGame = gameplay?.inGame;
      const inputEnabled = gameplay?.inputEnabled;
      const letterBoxed = display?.letterBoxed;
      const cbFound = controlBar?.found;
      const cbHidden = controlBar?.hidden;
      const cbManagerHidden = controlBar?.managerHidden;
      const cbClickable = controlBar?.clickable;
      const logicFrame = gameplay?.logicFrame;

      const reached = inGame === true
        && inputEnabled === true
        && introDone === true
        && letterBoxed === false
        && cbFound === true
        && cbHidden === false
        && cbManagerHidden === false
        && cbClickable === true;

      lastPlayerControlState = {
        framesRun, logicFrame, inGame, inputEnabled, introDone,
        letterBoxed, cbFound, cbHidden, cbManagerHidden, cbClickable,
        objectCount: gameplay?.objectCount, drawableCount: gameplay?.drawableCount,
      };

      if (framesRun % 200 === 0 || reached) {
        console.error(`[gpu-probe] frame ${framesRun}/3600 logic=${logicFrame} inGame=${inGame} input=${inputEnabled} introDone=${introDone} letterBoxed=${letterBoxed} cb=${cbFound}/${cbHidden}/${cbClickable} reached=${reached}`);
      }

      if (reached) {
        playerControlReached = true;
        playerControlFrame = framesRun;
      }

      remaining -= frames;
      checkDeadline("player-control-full");
    }
  }

  // Final state report
  console.error(`[gpu-probe] FINAL: reachedPlayerControl=${playerControlReached} @frame=${playerControlFrame ?? framesRun} logicFrame=${lastPlayerControlState?.logicFrame}`);
  console.error(`[gpu-probe] state: ${JSON.stringify(lastPlayerControlState)}`);

  // Texture diagnostics
  const texDiag = frameResult.frame?.textureDiagnostics;
  console.error(`[gpu-probe] textureDiagnostics: ${JSON.stringify(texDiag)}`);

  // FPS measurement: run 100 frames and time them
  console.error("[gpu-probe] FPS measurement...");
  const fpsStart = Date.now();
  await realEngineFrame(page, 100);
  const fpsElapsed = Date.now() - fpsStart;
  const fps = (100000 / fpsElapsed).toFixed(1);
  console.error(`[gpu-probe] FPS: ${fps} (100 frames in ${fpsElapsed}ms)`);

  // Screenshot at player control (or wherever we ended up)
  const screenshotPath = resolve(screenshotDir, "gpu-player-control.png");
  await page.screenshot({ path: screenshotPath });
  console.error(`[gpu-probe] screenshot saved: ${screenshotPath}`);

  // Also grab canvas pixels for analysis
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    if (!canvas) return { error: "no viewport" };
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { error: "no gl" };
    const samples = {};
    const pixel = new Uint8Array(4);
    const points = [
      { name: "terrain", x: 320, y: 300 },
      { name: "center", x: 640, y: 360 },
      { name: "hudLeft", x: 86, y: 682 },
      { name: "hudRight", x: 1200, y: 682 },
      { name: "minimap", x: 1150, y: 600 },
      { name: "skyTop", x: 640, y: 50 },
      { name: "controlBar", x: 640, y: 700 },
    ];
    for (const p of points) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(p.x)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(p.y)));
      gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples[p.name] = Array.from(pixel);
    }
    return { width: canvas.width, height: canvas.height, samples };
  });
  console.error(`[gpu-probe] canvas pixels: ${JSON.stringify(pixels)}`);

  // Full summary
  console.error("[gpu-probe] === SUMMARY ===");
  console.error(JSON.stringify({
    renderer,
    playerControlReached,
    playerControlFrame,
    totalFramesRun: framesRun,
    lastPlayerControlState,
    textureDiagnostics: texDiag,
    fps,
    screenshot: screenshotPath,
    canvasPixels: pixels,
  }, null, 2));

  await browser.close();
}

main().catch(e => { console.error(`[gpu-probe] FATAL: ${e.message}\n${e.stack}`); process.exit(1); });
