import { mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const shellmapScreenshot = resolve(screenshotDir, "shellmap-real-init-gate-canvas.png");

// Whole-file archive set for the real GameEngine::init() lifecycle run.
// Base Generals archives mount under ZZBase_* so Zero Hour archives keep the
// original first-loaded-wins override order.
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
  { name: "SpeechEnglishZH.big" },
  { name: "AudioZH.big" },
  { name: "AudioEnglishZH.big" },
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

const expectedRealInitSubsystems = [
  "TheLocalFileSystem",
  "TheArchiveFileSystem",
  "TheWritableGlobalData",
  "TheGameText",
  "TheScienceStore",
  "TheMultiplayerSettings",
  "TheTerrainTypes",
  "TheTerrainRoads",
  "TheGlobalLanguageData",
  "TheCDManager",
  "TheAudio",
  "TheFunctionLexicon",
  "TheModuleFactory",
  "TheMessageStream",
  "TheSidesList",
  "TheCaveSystem",
  "TheRankInfoStore",
  "ThePlayerTemplateStore",
  "TheParticleSystemManager",
  "TheFXListStore",
  "TheWeaponStore",
  "TheObjectCreationListStore",
  "TheLocomotorStore",
  "TheSpecialPowerStore",
  "TheDamageFXStore",
  "TheArmorStore",
  "TheBuildAssistant",
  "TheThingFactory",
  "TheUpgradeCenter",
  "TheGameClient",
  "TheAI",
  "TheGameLogic",
  "TheTeamFactory",
  "TheCrateSystem",
  "ThePlayerList",
  "TheRecorder",
  "TheRadar",
  "TheVictoryConditions",
  "TheMetaMap",
  "TheActionManager",
  "TheGameStateMap",
  "TheGameState",
  "TheGameResultsQueue",
];

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function pixelHasColor(pixel, threshold = 8) {
  if (!Array.isArray(pixel) || pixel.length < 4 || pixel[3] < 200) {
    return false;
  }
  const [red, green, blue] = pixel;
  return red > threshold || green > threshold || blue > threshold;
}

async function buildRealInitArchives(serverUrl) {
  const archives = [];
  for (const spec of realInitArchiveSpecs) {
    const sourceName = spec.sourceName ?? spec.name;
    const path = resolve(archiveRoot, sourceName);
    const fileStat = await stat(path);
    archives.push({
      name: spec.name,
      sourceName,
      url: new URL(relative(wasmRoot, path).split(sep).join("/"), serverUrl).href,
      expectedBytes: fileStat.size,
    });
  }
  return archives;
}

function assertRealEngineInit(realInit) {
  expect(realInit?.ok === true, "realEngineInit RPC failed", realInit);
  expect(realInit.aborted === false, "real engine init aborted", {
    abortMessage: realInit.abortMessage,
    releaseCrash: realInit.releaseCrash,
    inFlightSubsystem: realInit.inFlightSubsystem,
  });
  expect(realInit.releaseCrash === null, "real engine init hit RELEASE_CRASH", realInit.releaseCrash);
  const frontier = realInit.frontier;
  expect(frontier?.attempted === true && frontier.initReturned === true,
    "real GameEngine::init() did not return", frontier);
  expect(frontier.exceptionCaught === false, "real GameEngine::init() threw", frontier);
  expect(frontier.quittingAfterInit === false,
    "real GameEngine::init() set quitting", frontier);
  expect(JSON.stringify(frontier.subsystemsCompleted) === JSON.stringify(expectedRealInitSubsystems),
    "real init subsystem order mismatch", frontier.subsystemsCompleted);
}

function assertShellMapFrame(realFrames) {
  expect(realFrames?.ok === true && realFrames.aborted === false,
    "real shell-map frames failed", {
      abortMessage: realFrames?.abortMessage,
      lastUpdateTarget: realFrames?.lastUpdateTarget,
      lastGameLogicStep: realFrames?.lastGameLogicStep,
      frame: realFrames?.frame,
    });

  const frame = realFrames.frame;
  expect(frame?.initReturned === true && frame.exceptionCaught === false,
    "real engine frame state was not healthy", frame);
  expect(frame.quitting === false, "real engine quit during shell-map frames", frame);

  const clientState = frame.clientState;
  expect(clientState?.globalDataReady === true
      && clientState.displayReady === true
      && clientState.shellReady === true
      && clientState.windowManagerReady === true,
    "real client state is not ready", clientState);
  expect(clientState.input?.windowReady === true,
    "real input window is not backed by the original WndProc", clientState.input);
  expect(clientState.gameplay?.gameMode === 4,
    "shell-map run did not preserve GAME_SHELL", clientState.gameplay);
  expect(clientState.gameplay?.lifecycleDebug?.lastModeAfterSet === 4,
    "prepareNewGame did not set GAME_SHELL in the real lifecycle", clientState.gameplay?.lifecycleDebug);
  expect(clientState.shell?.screenCount === 1
      && clientState.shell?.topFilename === "Menus/MainMenu.wnd"
      && clientState.shell?.topIsMainMenu === true,
    "real shell stack did not expose MainMenu.wnd", clientState.shell);
  expect(clientState.layoutDebug?.shell?.pushCount >= 1
      && clientState.layoutDebug?.shell?.startNewGameShell?.branchCount >= 1,
    "real startNewGame shell branch was not exercised", clientState.layoutDebug?.shell);
  expect(clientState.gameplay?.objectCount > 0
      && clientState.gameplay?.drawableCount > 0
      && clientState.gameplay?.renderedObjectCount > 0,
    "shell map did not produce drawable/rendered objects", clientState.gameplay);
}

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  await mkdir(screenshotDir, { recursive: true });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  page.setDefaultNavigationTimeout(240000);
  page.on("pageerror", (error) => {
    console.error(`[shellmap] pageerror ${error.stack ?? error.message}`);
  });

  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const archives = await buildRealInitArchives(server.url);
  console.error("[shellmap] mounting real-init archives");
  const mount = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountArchives", payload), {
    path: "/assets/real-init",
    verifyEach: false,
    archives,
  });
  expect(mount.ok === true && mount.archiveSet?.archiveCount === realInitArchiveSpecs.length,
    "real-init archive mount failed", mount.error ?? mount.archiveSet);

  console.error("[shellmap] realEngineInit shellMap=true");
  const realInit = await page.evaluate(() =>
    window.CnCPort.rpc("realEngineInit", {
      runDirectory: "/assets/real-init",
      shellMap: true,
    }));
  assertRealEngineInit(realInit);

  const mapCache = await page.evaluate(() => window.CnCPort.rpc("mapCacheProbe"));
  expect(mapCache.ok === true
      && mapCache.probe?.mapCacheReady === true
      && mapCache.probe?.shellMapFound === true
      && mapCache.probe?.shellMapOn === true
      && mapCache.probe?.shellMapName === "maps\\shellmapmd\\shellmapmd.map",
    "ShellMapMD was not available and enabled after real init", mapCache);

  console.error("[shellmap] stepping real frames");
  let frame = null;
  for (const frames of [1, 1, 1, 3, 10]) {
    frame = await page.evaluate((frameCount) =>
      window.CnCPort.rpc("realEngineFrame", { frames: frameCount }), frames);
  }
  // The shell-map load is now stepped (startNewGame spreads its steps across
  // GameEngine::update calls so the real load screen presents between slices).
  // Keep ticking until the load session drains instead of assuming the whole
  // load completed inside one update call.
  {
    const deadline = Date.now() + 8 * 60 * 1000; // SwiftShader shell load is slow
    let lastProgressLog = 0;
    while (frame?.frame?.loadSessionActive === true) {
      if (Date.now() > deadline) {
        throw new Error(`shell-map load session did not finish before deadline: ${JSON.stringify({
          loadProgress: frame?.frame?.loadProgress,
          lastGameLogicStep: frame?.frame?.lastGameLogicStep,
        })}`);
      }
      const progress = frame?.frame?.loadProgress ?? -1;
      if (progress !== lastProgressLog) {
        console.error(`[shellmap] load session progress=${progress}`);
        lastProgressLog = progress;
      }
      frame = await page.evaluate(() =>
        window.CnCPort.rpc("realEngineFrame", { frames: 10 }));
    }
    // a few settle frames so the shell pushes MainMenu and renders it
    frame = await page.evaluate(() =>
      window.CnCPort.rpc("realEngineFrame", { frames: 5 }));
  }
  assertShellMapFrame(frame);

  const screenshot = await page.evaluate(() => window.CnCPort.rpc("screenshot"));
  const canvas = screenshot.screenshot;
  expect(screenshot.ok === true
      && canvas?.width > 0
      && canvas?.height > 0
      && pixelHasColor(canvas?.centerPixel),
    "shell-map canvas center stayed blank", {
      ok: screenshot.ok,
      width: canvas?.width,
      height: canvas?.height,
      topLeftPixel: canvas?.topLeftPixel,
      centerPixel: canvas?.centerPixel,
    });
  await page.locator("#viewport").screenshot({ path: shellmapScreenshot });

  const clientState = frame.frame.clientState;
  console.log(JSON.stringify({
    ok: true,
    archiveCount: mount.archiveSet.archiveCount,
    subsystemsCompleted: realInit.frontier.subsystemsCompleted.length,
    frame: frame.frame.framesCompleted,
    gameMode: clientState.gameplay.gameMode,
    shellTop: clientState.shell.topFilename,
    objectCount: clientState.gameplay.objectCount,
    drawableCount: clientState.gameplay.drawableCount,
    renderedObjectCount: clientState.gameplay.renderedObjectCount,
    canvasSize: { width: canvas.width, height: canvas.height },
    centerPixel: canvas.centerPixel,
    screenshot: relative(wasmRoot, shellmapScreenshot),
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
