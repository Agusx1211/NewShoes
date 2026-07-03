// GPU probe v3: chunked frames with progress, minimal overhead
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

function win32PointLParam(p) { return ((p.y & 0xffff) << 16) | (p.x & 0xffff); }
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

  // Load
  await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc), { timeout: 60000 });

  const renderer = await page.evaluate(() => {
    const c = document.createElement("canvas"); const g = c.getContext("webgl2");
    const ext = g.getExtension("WEBGL_debug_renderer_info");
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
  });
  console.error(`[gpu] RENDERER: ${renderer}`);

  // Boot
  const boot = await rpc(page, "boot", { source: "gpu probe v3" });
  console.error(`[gpu] boot ok=${boot.ok}`);

  // Mount
  const archives = [];
  for (const spec of realInitArchiveSpecs) {
    const sn = spec.sourceName ?? spec.name;
    const path = resolve(archiveRoot, sn);
    const st = await stat(path);
    archives.push({ name: spec.name, sourceName: sn,
      url: new URL(relative(wasmRoot, path).split(sep).join("/"), "http://127.0.0.1:8123/").href,
      expectedBytes: st.size });
  }
  const mount = await rpc(page, "mountArchives", { path: "/assets/real-init", verifyEach: false, archives });
  console.error(`[gpu] mount ok=${mount.ok} count=${mount.archiveSet?.archiveCount}`);

  // Init
  const ri = await rpc(page, "realEngineInit", { runDirectory: "/assets/real-init" });
  console.error(`[gpu] init subsys=${ri.frontier?.subsystemCompletedCount} ms=${ri.frontier?.elapsedMs}`);

  // Frames to menu
  let fr = await rpc(page, "realEngineFrame", { frames: 9 });
  // Reveal
  await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam({ x: 32, y: 32 }), point: { x: 32, y: 32 } });
  await rpc(page, "realEngineFrame", { frames: 1 });
  await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam({ x: 96, y: 96 }), point: { x: 96, y: 96 } });
  for (let i = 0; i < 100; i++) {
    fr = await rpc(page, "realEngineFrame", { frames: 1 });
    if (fr.frame?.clientState?.transition?.finished && fr.frame?.clientState?.input?.mouse?.visible) break;
  }

  // Click: SinglePlayer -> USA -> Easy
  async function clickBtn(btn, hit, label) {
    const pt = hit?.point ?? { x: btn?.centerX ?? 644, y: btn?.centerY ?? 134 };
    const tgt = hit?.window?.found ? hit.window : btn;
    await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam(pt), point: pt });
    await rpc(page, "postMessage", { message: 0x0201, lParam: win32PointLParam(pt), point: pt });
    for (let i = 0; i < 8; i++) { fr = await rpc(page, "realEngineFrame", { frames: 1 }); if (fr.frame?.clientState?.input?.grabWindow?.id === tgt?.id) break; }
    await rpc(page, "postMessage", { message: 0x0202, lParam: win32PointLParam(pt), point: pt });
    for (let i = 0; i < 16; i++) fr = await rpc(page, "realEngineFrame", { frames: 1 });
    console.error(`[gpu] clicked ${label}`);
  }

  clickBtn((await (async () => { for (let i = 0; i < 20; i++) fr = await rpc(page, "realEngineFrame", { frames: 1 }); return fr; })())?.frame?.clientState?.mainMenu?.buttonSinglePlayer,
    (await (async () => { return fr; })())?.frame?.clientState?.mainMenu?.underButtonSinglePlayerCenter, "SP");

  const mm2 = fr.frame?.clientState?.mainMenu;
  clickBtn(mm2?.buttonUSA, mm2?.underButtonUSACenter, "USA");

  const mm3 = fr.frame?.clientState?.mainMenu;
  clickBtn(mm3?.buttonEasy, mm3?.underButtonEasyCenter, "Easy");

  // Campaign start
  const bl = Number(mm3?.debug?.doGameStartCount ?? 0);
  for (let i = 0; i < 300; i++) {
    fr = await rpc(page, "realEngineFrame", { frames: 1 });
    const d = fr.frame?.clientState?.mainMenu?.debug;
    if (Number(d?.doGameStartCount ?? 0) > bl && Number(d?.lastCDPresent ?? 0) === 1
        && typeof d?.lastPendingFile === "string" && d.lastPendingFile.length > 0) {
      console.error(`[gpu] campaign: ${d.lastPendingFile}`);
      break;
    }
  }

  // === CHUNKED frame stepping with summary frames ===
  console.error("[gpu] stepping frames...");
  const t0 = Date.now();
  let totalFrames = 0;
  let reached = false;

  // Use summary frames for speed - they skip heavy state export
  // Run in 1000-frame chunks
  for (const chunk of [1000, 1000, 1000, 600]) {
    const ct = Date.now();
    fr = await rpc(page, "realEngineFrameSummary", { frames: chunk });
    totalFrames += chunk;
    const ce = Date.now() - ct;

    const gp = fr.frame?.gameplay;
    const cd = gp?.campaignIntroGates;
    const introDone = cd?.flags?.find(f => f.name === "INTRO_DONE")?.value;
    const letterBoxed = fr.frame?.display?.letterBoxed;
    const cb = fr.frame?.controlBar;

    const isReached = gp?.inGame && gp?.inputEnabled && introDone && !letterBoxed
      && cb?.found && !cb?.hidden && !cb?.managerHidden && cb?.clickable;

    console.error(`[gpu] ${totalFrames}f in ${ce}ms (${(chunk*1000/ce).toFixed(1)}fps) logic=${gp?.logicFrame} introDone=${introDone} letterBoxed=${letterBoxed} input=${gp?.inputEnabled} cbClick=${cb?.clickable} reached=${isReached}`);

    if (isReached) { reached = true; break; }
  }

  const wallMs = Date.now() - t0;
  console.error(`[gpu] total ${totalFrames} frames in ${wallMs}ms (${(totalFrames*1000/wallMs).toFixed(1)}fps)`);

  // If reached via summary, do a final full frame for rich state export
  if (reached) {
    fr = await rpc(page, "realEngineFrame", { frames: 1 });
  }

  // Extract final state
  const cs = fr.frame?.clientState || {};
  const gp = cs.gameplay || fr.frame?.gameplay || {};
  const sd = gp.scriptDebug || {};
  const introDone = sd.flags?.find(f => f.name === "INTRO_DONE")?.value
    || fr.frame?.gameplay?.campaignIntroGates?.flags?.find(f => f.name === "INTRO_DONE")?.value;
  const display = cs.display || fr.frame?.display || {};
  const cb = cs.controlBarWindows?.parent || fr.frame?.controlBar || {};
  const texDiag = fr.frame?.textureDiagnostics;
  const view = cs.view || fr.frame?.view || {};

  const finalReached = gp.inGame && gp.inputEnabled && introDone && !display.letterBoxed
    && cb.found && !cb.hidden && !cb.managerHidden && cb.clickable;

  // FPS measurement
  const fpsStart = Date.now();
  await rpc(page, "realEngineFrame", { frames: 100 });
  const fpsMs = Date.now() - fpsStart;
  const fps = (100000 / fpsMs).toFixed(1);

  // Screenshot
  const ssPath = resolve(screenshotDir, "gpu-player-control.png");
  await page.screenshot({ path: ssPath });

  // Pixel samples
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    if (!canvas) return { error: "no viewport" };
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { error: "no gl" };
    const samples = {};
    const pixel = new Uint8Array(4);
    for (const p of [
      { name: "terrain", x: 320, y: 300 }, { name: "center", x: 640, y: 360 },
      { name: "hudLeft", x: 86, y: 682 }, { name: "hudRight", x: 1200, y: 682 },
      { name: "minimap", x: 1150, y: 600 }, { name: "skyTop", x: 640, y: 50 },
      { name: "controlBar", x: 640, y: 700 },
    ]) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(p.x)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(p.y)));
      gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples[p.name] = Array.from(pixel);
    }
    return { width: canvas.width, height: canvas.height, samples };
  });

  console.error("[gpu] === FINAL ===");
  console.error(JSON.stringify({
    renderer,
    reachedPlayerControl: finalReached,
    totalFrames,
    logicFrame: gp.logicFrame,
    inGame: gp.inGame, inputEnabled: gp.inputEnabled, introDone,
    letterBoxed: display.letterBoxed,
    controlBar: { found: cb.found, hidden: cb.hidden, managerHidden: cb.managerHidden, clickable: cb.clickable },
    objects: gp.objectCount, drawables: gp.drawableCount, rendered: gp.renderedObjectCount,
    missingTexApplies: texDiag?.missingApplies,
    viewReady: view.ready, cameraPos: view.cameraPosition,
    fps, screenshot: ssPath, canvasPixels: pixels,
  }, null, 2));

  await browser.close();
}

main().catch(e => { console.error(`[gpu] FATAL: ${e.message}\n${e.stack}`); process.exit(1); });
