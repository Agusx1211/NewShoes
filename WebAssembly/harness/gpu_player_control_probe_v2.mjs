// GPU probe v2: minimal RPC calls, single batch for intro sequence
import { chromium } from "playwright-core";
import { stat, mkdir } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");

const HARNESS_URL = "http://127.0.0.1:8123/harness/index.html";

const realInitArchiveSpecs = [
  { name: "INIZH.big" }, { name: "EnglishZH.big" }, { name: "WindowZH.big" },
  { name: "MapsZH.big" }, { name: "MusicZH.big" }, { name: "GensecZH.big" },
  { name: "TerrainZH.big" }, { name: "TexturesZH.big" }, { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" }, { name: "SpeechZH.big" }, { name: "AudioZH.big" },
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
function win32PointLParam(point) { return ((point.y & 0xffff) << 16) | (point.x & 0xffff); }

async function rpc(page, method, params) {
  return page.evaluate((p) => window.CnCPort.rpc(p.method, p.params), { method, params });
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

  // Load and check renderer
  console.error("[gpu] loading...");
  await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc), { timeout: 60000 });

  const renderer = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    const ext = g.getExtension("WEBGL_debug_renderer_info");
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
  });
  console.error(`[gpu] RENDERER: ${renderer}`);

  // Boot
  const boot = await rpc(page, "boot", { source: "gpu probe v2" });
  console.error(`[gpu] boot ok=${boot.ok}`);

  // Mount archives
  const archives = [];
  for (const spec of realInitArchiveSpecs) {
    const sourceName = spec.sourceName ?? spec.name;
    const path = resolve(archiveRoot, sourceName);
    const st = await stat(path);
    archives.push({
      name: spec.name, sourceName,
      url: new URL(relative(wasmRoot, path).split(sep).join("/"), "http://127.0.0.1:8123/").href,
      expectedBytes: st.size,
    });
  }
  const mount = await rpc(page, "mountArchives", { path: "/assets/real-init", verifyEach: false, archives });
  console.error(`[gpu] mount ok=${mount.ok} count=${mount.archiveSet?.archiveCount}`);

  // Real engine init
  const realInit = await rpc(page, "realEngineInit", { runDirectory: "/assets/real-init" });
  console.error(`[gpu] init ok=${realInit.frontier?.initReturned} subsys=${realInit.frontier?.subsystemCompletedCount} ms=${realInit.frontier?.elapsedMs}`);

  // Frames to main menu
  let fr = await rpc(page, "realEngineFrame", { frames: 7 });
  if (fr.frame?.clientState?.shell?.screenCount > 0) fr = await rpc(page, "realEngineFrame", { frames: 2 });

  // Reveal menu
  await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam({ x: 32, y: 32 }), point: { x: 32, y: 32 } });
  await rpc(page, "realEngineFrame", { frames: 1 });
  await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam({ x: 96, y: 96 }), point: { x: 96, y: 96 } });
  for (let i = 0; i < 100; i++) {
    fr = await rpc(page, "realEngineFrame", { frames: 1 });
    if (fr.frame?.clientState?.transition?.finished === true && fr.frame?.clientState?.input?.mouse?.visible === true) break;
  }
  await page.screenshot({ path: resolve(screenshotDir, "gpu-menu.png") });

  // Helper: click a button
  async function clickButton(button, hitProbe, label) {
    const point = hitProbe?.point ?? { x: button?.centerX ?? 644, y: button?.centerY ?? 134 };
    const target = hitProbe?.window?.found === true ? hitProbe.window : button;
    await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam(point), point });
    await rpc(page, "postMessage", { message: 0x0201, lParam: win32PointLParam(point), point });
    for (let i = 0; i < 8; i++) {
      fr = await rpc(page, "realEngineFrame", { frames: 1 });
      if (fr.frame?.clientState?.input?.grabWindow?.id === target?.id) break;
    }
    await rpc(page, "postMessage", { message: 0x0202, lParam: win32PointLParam(point), point });
    for (let i = 0; i < 8; i++) fr = await rpc(page, "realEngineFrame", { frames: 1 });
    for (let i = 0; i < 90; i++) {
      fr = await rpc(page, "realEngineFrame", { frames: 1 });
      if (fr.frame?.clientState?.transition?.finished === true) break;
    }
    console.error(`[gpu] clicked ${label}, frame=${fr.frame?.framesCompleted}`);
  }

  // Click Single Player
  const mm = fr.frame?.clientState?.mainMenu;
  await clickButton(mm?.buttonSinglePlayer, mm?.underButtonSinglePlayerCenter, "SinglePlayer");

  // Click USA
  const mm2 = fr.frame?.clientState?.mainMenu;
  await clickButton(mm2?.buttonUSA, mm2?.underButtonUSACenter, "USA");

  // Click Easy
  const mm3 = fr.frame?.clientState?.mainMenu;
  await clickButton(mm3?.buttonEasy, mm3?.underButtonEasyCenter, "Easy");

  // Wait for campaign start
  const baseline = Number(mm3?.debug?.doGameStartCount ?? 0);
  for (let i = 0; i < 300; i++) {
    fr = await rpc(page, "realEngineFrame", { frames: 1 });
    const d = fr.frame?.clientState?.mainMenu?.debug;
    if (Number(d?.doGameStartCount ?? 0) > baseline && Number(d?.lastCDPresent ?? 0) === 1
        && typeof d?.lastPendingFile === "string" && d.lastPendingFile.length > 0) {
      console.error(`[gpu] campaign started: ${d.lastPendingFile}`);
      break;
    }
  }
  await page.screenshot({ path: resolve(screenshotDir, "gpu-campaign-start.png") });

  // === KEY CHANGE: run 3600 frames in ONE RPC call, then check result ===
  console.error("[gpu] running 3600 frames in single batch...");
  const t0 = Date.now();
  fr = await rpc(page, "realEngineFrame", { frames: 3600 });
  const elapsed = Date.now() - t0;
  console.error(`[gpu] 3600 frames done in ${elapsed}ms (${(3600000/elapsed).toFixed(1)} fps wall-clock)`);

  // Extract state
  const cs = fr.frame?.clientState;
  const gp = cs?.gameplay;
  const sd = gp?.scriptDebug;
  const introDone = sd?.flags?.find(f => f.name === "INTRO_DONE")?.value;
  const display = cs?.display;
  const cb = cs?.controlBarWindows?.parent;
  const texDiag = fr.frame?.textureDiagnostics;

  const reached = gp?.inGame === true
    && gp?.inputEnabled === true
    && introDone === true
    && display?.letterBoxed === false
    && cb?.found === true
    && cb?.hidden === false
    && cb?.managerHidden === false
    && cb?.clickable === true;

  console.error(`[gpu] === RESULTS ===`);
  console.error(`[gpu] framesCompleted=${fr.frame?.framesCompleted}`);
  console.error(`[gpu] reachedPlayerControl=${reached}`);
  console.error(`[gpu] logicFrame=${gp?.logicFrame}`);
  console.error(`[gpu] inGame=${gp?.inGame} inputEnabled=${gp?.inputEnabled} introDone=${introDone}`);
  console.error(`[gpu] letterBoxed=${display?.letterBoxed}`);
  console.error(`[gpu] controlBar found=${cb?.found} hidden=${cb?.hidden} mgrHidden=${cb?.managerHidden} clickable=${cb?.clickable}`);
  console.error(`[gpu] objects=${gp?.objectCount} drawables=${gp?.drawableCount} rendered=${gp?.renderedObjectCount}`);
  console.error(`[gpu] missingTextureApplies=${texDiag?.missingApplies}`);
  console.error(`[gpu] view ready=${cs?.view?.ready} cameraPos=${JSON.stringify(cs?.view?.cameraPosition)}`);

  // Screenshot
  const ssPath = resolve(screenshotDir, "gpu-player-control.png");
  await page.screenshot({ path: ssPath });

  // Canvas pixel samples
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
      { name: "bottomCenter", x: 640, y: 710 },
    ];
    for (const p of points) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(p.x)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(p.y)));
      gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples[p.name] = Array.from(pixel);
    }
    return { width: canvas.width, height: canvas.height, samples };
  });
  console.error(`[gpu] canvas pixels: ${JSON.stringify(pixels)}`);

  // FPS measurement: 100 frames
  const fpsStart = Date.now();
  await rpc(page, "realEngineFrame", { frames: 100 });
  const fpsMs = Date.now() - fpsStart;
  const fps = (100000 / fpsMs).toFixed(1);
  console.error(`[gpu] FPS: ${fps} (100 frames in ${fpsMs}ms)`);

  // Final summary JSON
  console.error("[gpu] === FINAL SUMMARY ===");
  console.error(JSON.stringify({
    renderer,
    reachedPlayerControl: reached,
    framesCompleted: fr.frame?.framesCompleted,
    logicFrame: gp?.logicFrame,
    inGame: gp?.inGame,
    inputEnabled: gp?.inputEnabled,
    introDone,
    letterBoxed: display?.letterBoxed,
    controlBar: { found: cb?.found, hidden: cb?.hidden, managerHidden: cb?.managerHidden, clickable: cb?.clickable },
    objectCount: gp?.objectCount,
    drawableCount: gp?.drawableCount,
    renderedObjectCount: gp?.renderedObjectCount,
    missingTextureApplies: texDiag?.missingApplies,
    viewReady: cs?.view?.ready,
    cameraPosition: cs?.view?.cameraPosition,
    fps,
    screenshot: ssPath,
    canvasPixels: pixels,
  }, null, 2));

  await browser.close();
}

main().catch(e => { console.error(`[gpu] FATAL: ${e.message}\n${e.stack}`); process.exit(1); });
