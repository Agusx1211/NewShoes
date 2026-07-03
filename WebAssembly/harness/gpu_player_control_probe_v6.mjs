// GPU probe v6: with campaign start diagnostics
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

async function clickButton(page, button, hitProbe, label) {
  const pt = hitProbe?.point ?? { x: button?.centerX ?? 644, y: button?.centerY ?? 134 };
  const tgt = hitProbe?.window?.found === true ? hitProbe.window : button;
  console.error(`[gpu] clicking ${label} at (${pt.x},${pt.y}) target=${tgt?.decoratedName ?? tgt?.name ?? "unknown"}`);
  await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam(pt), point: pt });
  await rpc(page, "postMessage", { message: 0x0201, lParam: win32PointLParam(pt), point: pt });
  let grabbed = false;
  for (let i = 0; i < 8; i++) {
    const f = await rpc(page, "realEngineFrame", { frames: 1 });
    if (f.frame?.clientState?.input?.grabWindow?.id === tgt?.id) { grabbed = true; break; }
  }
  await rpc(page, "postMessage", { message: 0x0202, lParam: win32PointLParam(pt), point: pt });
  for (let i = 0; i < 16; i++) await rpc(page, "realEngineFrame", { frames: 1 });
  console.error(`[gpu] ${label} grabbed=${grabbed}`);
}

function checkPlayerControl(pc) {
  return pc?.inGame === true
    && pc?.inputEnabled === true
    && pc?.introDone === true
    && pc?.letterBoxed === false
    && pc?.controlBarFound === true
    && pc?.controlBarHidden === false
    && pc?.controlBarManagerHidden === false
    && pc?.controlBarClickable === true;
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

  await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc), { timeout: 60000 });

  const renderer = await page.evaluate(() => {
    const c = document.createElement("canvas"); const g = c.getContext("webgl2");
    const ext = g.getExtension("WEBGL_debug_renderer_info");
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
  });
  console.error(`[gpu] RENDERER: ${renderer}`);

  const boot = await rpc(page, "boot", { source: "gpu probe v6" });
  console.error(`[gpu] boot ok=${boot.ok}`);

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

  const ri = await rpc(page, "realEngineInit", { runDirectory: "/assets/real-init" });
  console.error(`[gpu] init subsys=${ri.frontier?.subsystemCompletedCount} ms=${ri.frontier?.elapsedMs}`);

  // Frames to menu + reveal
  let fr = await rpc(page, "realEngineFrame", { frames: 9 });
  await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam({ x: 32, y: 32 }), point: { x: 32, y: 32 } });
  await rpc(page, "realEngineFrame", { frames: 1 });
  await rpc(page, "postMessage", { message: 0x0200, lParam: win32PointLParam({ x: 96, y: 96 }), point: { x: 96, y: 96 } });
  for (let i = 0; i < 100; i++) {
    fr = await rpc(page, "realEngineFrame", { frames: 1 });
    if (fr.frame?.clientState?.transition?.finished && fr.frame?.clientState?.input?.mouse?.visible) break;
  }

  // Click SP -> USA -> Easy with diagnostics
  let mm = fr.frame?.clientState?.mainMenu;
  console.error(`[gpu] SP button: found=${mm?.buttonSinglePlayer?.found} clickable=${mm?.buttonSinglePlayer?.clickable}`);
  await clickButton(page, mm?.buttonSinglePlayer, mm?.underButtonSinglePlayerCenter, "SP");
  fr = await rpc(page, "realEngineFrame", { frames: 1 });

  mm = fr.frame?.clientState?.mainMenu;
  console.error(`[gpu] USA button: found=${mm?.buttonUSA?.found} clickable=${mm?.buttonUSA?.clickable}`);
  await clickButton(page, mm?.buttonUSA, mm?.underButtonUSACenter, "USA");
  fr = await rpc(page, "realEngineFrame", { frames: 1 });

  mm = fr.frame?.clientState?.mainMenu;
  console.error(`[gpu] Easy button: found=${mm?.buttonEasy?.found} clickable=${mm?.buttonEasy?.clickable}`);
  const debugBeforeEasy = mm?.debug;
  console.error(`[gpu] debug before Easy: doGameStart=${debugBeforeEasy?.doGameStartCount} prepareCampaign=${debugBeforeEasy?.prepareCampaignCount} setupGameStart=${debugBeforeEasy?.setupGameStartCount}`);
  await clickButton(page, mm?.buttonEasy, mm?.underButtonEasyCenter, "Easy");

  // Wait for campaign start with DETAILED diagnostics
  const bl = Number(debugBeforeEasy?.doGameStartCount ?? 0);
  console.error(`[gpu] waiting for campaign start (baseline doGameStart=${bl})...`);
  let campaignStarted = false;
  for (let i = 0; i < 500; i++) {
    fr = await rpc(page, "realEngineFrame", { frames: 1 });
    const d = fr.frame?.clientState?.mainMenu?.debug;
    if (!d) {
      if (i < 5 || i % 50 === 0) console.error(`[gpu] campaign wait ${i}: debug=null`);
      continue;
    }
    const doGS = Number(d.doGameStartCount ?? 0);
    const cd = Number(d.lastCDPresent ?? 0);
    const diff = Number(d.lastNewGameDifficulty ?? -1);
    const mode = Number(d.lastNewGameMode ?? -1);
    const pf = d.lastPendingFile;
    const sm = d.lastSetupMap;
    const prep = Number(d.prepareCampaignCount ?? 0);
    const setup = Number(d.setupGameStartCount ?? 0);
    const checkCD = Number(d.checkCDCount ?? 0);

    if (i < 3 || i % 50 === 0 || doGS > bl) {
      console.error(`[gpu] campaign wait ${i}: doGS=${doGS}(bl=${bl}) cd=${cd} diff=${diff} mode=${mode} prep=${prep} setup=${setup} checkCD=${checkCD} pf="${pf}" sm="${sm}"`);
    }

    if (doGS > bl && cd === 1 && diff === 0 && mode === 0
        && typeof pf === "string" && pf.length > 0 && pf === sm) {
      console.error(`[gpu] CAMPAIGN STARTED! map=${pf} frame=${fr.frame?.framesCompleted}`);
      campaignStarted = true;
      break;
    }
  }
  if (!campaignStarted) {
    console.error("[gpu] WARNING: campaign start NOT detected after 500 frames");
    // Check game mode via summary frame
    const sf = await rpc(page, "realEngineFrameSummary", { frames: 1 });
    console.error(`[gpu] summary check: gameMode=${sf.frame?.gameplay?.gameMode} inGame=${sf.frame?.gameplay?.inGame} loading=${sf.frame?.gameplay?.loadingMap} objects=${sf.frame?.gameplay?.objectCount}`);
  }

  // Screenshot at this point
  await page.screenshot({ path: resolve(screenshotDir, "gpu-after-easy.png") });

  // === CHUNKED summary frames until player control ===
  console.error("[gpu] stepping frames (summary mode)...");
  const t0 = Date.now();
  let totalFrames = 0;
  let reached = false;
  let reachedAt = 0;

  for (const chunk of [500, 500, 500, 500, 500, 500, 600]) {
    const ct = Date.now();
    fr = await rpc(page, "realEngineFrameSummary", { frames: chunk });
    totalFrames += chunk;
    const ce = Date.now() - ct;

    const gp = fr.frame?.gameplay || {};
    const pc = fr.frame?.playerControl || {};
    const isReached = checkPlayerControl(pc);

    console.error(`[gpu] ${totalFrames}f in ${ce}ms (${(chunk*1000/ce).toFixed(1)}fps) logic=${gp.logicFrame} mode=${gp.gameMode} loading=${gp.loadingMap} inGame=${gp.inGame} objs=${gp.objectCount} introDone=${pc.introDone} input=${pc.inputEnabled} letterBoxed=${pc.letterBoxed} cbClick=${pc.controlBarClickable} reached=${isReached}`);

    if (isReached) {
      reached = true;
      reachedAt = totalFrames;
      break;
    }
  }

  const wallMs = Date.now() - t0;
  console.error(`[gpu] total ${totalFrames}f in ${wallMs}ms (${(totalFrames*1000/wallMs).toFixed(1)}fps) reached=${reached} @${reachedAt}`);

  // Final full frame
  fr = await rpc(page, "realEngineFrame", { frames: 1 });
  const cs = fr.frame?.clientState || {};
  const gp = cs.gameplay || {};
  const sd = gp.scriptDebug || {};
  const introDone = sd.flags?.find(f => f.name === "INTRO_DONE")?.value;
  const display = cs.display || {};
  const cb = cs.controlBarWindows?.parent || {};
  const texDiag = fr.frame?.textureDiagnostics;
  const view = cs.view || {};

  const finalReached = gp.inGame && gp.inputEnabled && introDone && !display.letterBoxed
    && cb.found && !cb.hidden && !cb.managerHidden && cb.clickable;

  // FPS
  const fpsStart = Date.now();
  await rpc(page, "realEngineFrame", { frames: 100 });
  const fpsMs = Date.now() - fpsStart;
  const fps = (100000 / fpsMs).toFixed(1);

  // Screenshot
  const ssPath = resolve(screenshotDir, "gpu-player-control.png");
  await page.screenshot({ path: ssPath });

  // Pixels
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
    renderer, campaignStarted,
    reachedPlayerControl: finalReached, reachedAtSummary: reachedAt,
    totalFrames, logicFrame: gp.logicFrame,
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
