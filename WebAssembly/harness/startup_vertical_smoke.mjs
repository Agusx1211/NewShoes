import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const desktopScreenshot = resolve(screenshotDir, "startup-vertical-browser.png");
const canvasScreenshot = resolve(screenshotDir, "startup-vertical-canvas.png");

const allAudioStartupFiles = [
  "Data\\INI\\AudioSettings.ini",
  "Data\\INI\\Default\\Music.ini",
  "Data\\INI\\Music.ini",
  "Data\\INI\\Default\\SoundEffects.ini",
  "Data\\INI\\SoundEffects.ini",
  "Data\\INI\\Default\\Speech.ini",
  "Data\\INI\\Speech.ini",
  "Data\\INI\\Default\\Voice.ini",
  "Data\\INI\\Voice.ini",
  "Data\\INI\\MiscAudio.ini",
];

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function entryByFactory(frontier, factory) {
  return (frontier?.entries ?? []).find((entry) => entry.factory === factory);
}

function assertStartupSingletonsMissing(state) {
  const probe = state.startupSingletons;
  expect(probe?.attempted === true, "startup singleton probe did not run", probe);
  expect(probe.ok === false, "startup singleton probe should not be ready without archives", probe);
  expect(probe.status === "missing_runtime_archives", "startup singleton status mismatch", probe);
  expect(probe.nextRequired === "runtimeArchiveSet", "startup singleton nextRequired mismatch", probe);
  expect(probe.runtimeArchiveRegistered === false, "startup singleton archive registration mismatch", probe);
  expect(probe.runtimeGlobalsInstalled === false, "startup singleton runtime globals mismatch", probe);
}

function assertOriginalStartupFrontier(state) {
  const startup = state.originalEngineStartup;
  expect(startup?.ok === false, "original startup should not be ready", startup);
  expect(startup.initAttempted === false, "original startup should not call GameEngine::init yet", startup);
  expect(startup.source === "GameEngine/Common/GameEngine.cpp::init", "original startup source mismatch", startup);
  expect(startup.status === "missing_runtime_archives", "original startup status mismatch", startup);
  expect(startup.startupAssetsReady === false, "startup assets should be missing", startup);
  expect(startup.dataPreflightReady === false, "startup data preflight should be missing", startup);

  const setup = startup.originalSetup;
  expect(setup?.probeOnly === true, "original setup probeOnly mismatch", setup);
  expect(setup.runtimeOwned === false, "original setup should not claim runtime ownership", setup);
  expect(setup.globalData === true, "global data probe should be ready", setup);
  expect(setup.commandLine === true, "command-line probe should be ready", setup);
  expect(setup.cdManager === true, "CD manager probe should be ready", setup);
  expect(setup.startupSingletons === false, "startup singletons should not be archive-ready", setup);

  const browserLayer = startup.browserDeviceLayer;
  expect(browserLayer?.ready === false, "browser device layer should not be ready", browserLayer);
  expect(browserLayer.createGameEngine === false, "CreateGameEngine should remain probe-only", browserLayer);
  expect(browserLayer.localFileSystem === true, "browser local filesystem probe should be ready", browserLayer);
  expect(browserLayer.archiveFileSystem === false, "browser archive filesystem should lack runtime archives", browserLayer);
  expect(browserLayer.audioManager === false, "browser audio manager should not be runtime-ready", browserLayer);
  expect(browserLayer.display === false, "browser display should not be production-ready", browserLayer);

  const frontier = startup.deviceFactoryFrontier;
  expect(frontier?.source === "GameEngine.cpp::init + WinMain.cpp::CreateGameEngine + Win32GameEngine.h",
    "device factory frontier source mismatch", frontier);
  expect(frontier.probeOnly === true, "device factory frontier should be probe-only", frontier);
  expect(frontier.ready === false, "device factory frontier should not be ready", frontier);
  expect(frontier.nextRequired === "startupAssets", "device factory frontier nextRequired mismatch", frontier);
  expect(frontier.firstUnownedInitFactory === "createAudioManager",
    "first unowned factory mismatch", frontier);
  expect(frontier.firstUnownedInitLine === 434, "first unowned factory line mismatch", frontier);
  expect(frontier.factoryMappings?.CreateGameEngine === "Win32GameEngine",
    "CreateGameEngine mapping mismatch", frontier);
  expect(frontier.factoryMappings?.createLocalFileSystem === "Win32LocalFileSystem",
    "local filesystem mapping mismatch", frontier);
  expect(frontier.factoryMappings?.createArchiveFileSystem === "Win32BIGFileSystem",
    "archive filesystem mapping mismatch", frontier);
  expect(frontier.factoryMappings?.createAudioManager === "MilesAudioManager",
    "audio manager mapping mismatch", frontier);
  expect(frontier.factoryMappings?.createFunctionLexicon === "W3DFunctionLexicon",
    "function lexicon mapping mismatch", frontier);
  expect(frontier.factoryMappings?.createModuleFactory === "W3DModuleFactory",
    "module factory mapping mismatch", frontier);

  expect(entryByFactory(frontier, "CreateGameEngine")?.line === 1122,
    "CreateGameEngine frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createFileSystem")?.line === 305,
    "createFileSystem frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createLocalFileSystem")?.line === 342,
    "createLocalFileSystem frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createArchiveFileSystem")?.line === 353,
    "createArchiveFileSystem frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "GameLODManager")?.line === 384,
    "GameLODManager frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "CreateCDManager")?.line === 427,
    "CreateCDManager frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createAudioManager")?.line === 434,
    "createAudioManager frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createFunctionLexicon")?.line === 446,
    "createFunctionLexicon frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createModuleFactory")?.line === 447,
    "createModuleFactory frontier line mismatch", frontier);

  const audioFiles = frontier.audioStartupFiles;
  const audioMissing = new Set(audioFiles?.missing ?? []);
  expect(audioFiles?.source === "GameAudio.cpp::AudioManager::init",
    "audio startup file source mismatch", audioFiles);
  expect(audioFiles.ready === false, "audio startup files should be missing without archives", audioFiles);
  expect(allAudioStartupFiles.every((path) => audioMissing.has(path)),
    "audio startup missing-file set mismatch", audioFiles);
  expect(frontier.milesAudioDeviceFrontier?.startupBoundaryReady === true,
    "Miles startup boundary should remain covered", frontier.milesAudioDeviceFrontier);
  expect(frontier.milesAudioDeviceFrontier?.nextRequired === "audioStartupFiles",
    "Miles frontier nextRequired mismatch", frontier.milesAudioDeviceFrontier);

  expect(frontier.fileSystemReady === false, "frontier filesystem should not be archive-ready", frontier);
  expect(frontier.startupFilesReady === false, "frontier startup files should be missing", frontier);
  expect(frontier.startupSingletonsReady === false, "frontier startup singletons should be missing", frontier);
  expect(frontier.setupReady === false, "frontier setup should not be ready", frontier);
}

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const harnessUrl = new URL("harness/index.html", server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "startup vertical smoke",
  }));
  expect(bootResult.ok === true, "boot RPC failed", bootResult);
  expect(bootResult.state?.booted === true, "boot state mismatch", bootResult);
  expect(bootResult.state.wasm === "loaded", "wasm module did not load", bootResult.state);
  expect(bootResult.state.originalEngineLinked === true,
    "original engine probes are not linked", bootResult.state);
  expect(bootResult.state.archiveMount?.registered === false,
    "startup vertical smoke should run without mounted archives", bootResult.state.archiveMount);
  expect(bootResult.state.graphics?.api === "webgl2" && bootResult.state.graphics.ok === true,
    "browser harness did not initialize WebGL2", bootResult.state.graphics);

  assertStartupSingletonsMissing(bootResult.state);
  assertOriginalStartupFrontier(bootResult.state);

  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: desktopScreenshot });
  await page.locator("#viewport").screenshot({ path: canvasScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    wasm: bootResult.state.wasm,
    frame: bootResult.state.frame,
    screenshots: [desktopScreenshot, canvasScreenshot],
    originalEngineStartup: bootResult.state.originalEngineStartup,
  }));
} finally {
  await browser?.close();
  await server.close();
}
