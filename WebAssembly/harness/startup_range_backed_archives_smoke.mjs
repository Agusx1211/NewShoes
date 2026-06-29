import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? defaultArchiveRoot);
const runtimeArchivePath = "/assets/range-startup";

const mappedImageIniEntries = [
  "Data\\INI\\MappedImages\\HandCreated\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGameUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeLoad512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeSelect512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeWinLoss512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCLogosUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCPurchasePowers512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCShellUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCSmShellUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SNUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SSUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SUUserInterface512.INI",
];

const archiveSpecs = [
  {
    name: "INIZH.big",
    entries: [
      "Data\\INI\\Armor.ini",
      "Data\\INI\\CommandButton.ini",
      "Data\\INI\\CommandSet.ini",
      "Data\\INI\\ControlBarScheme.ini",
      "Data\\INI\\Crate.ini",
      "Data\\INI\\DamageFX.ini",
      "Data\\INI\\Default\\AIData.ini",
      "Data\\INI\\Default\\ControlBarScheme.ini",
      "Data\\INI\\Default\\Object.ini",
      "Data\\INI\\Default\\SoundEffects.ini",
      "Data\\INI\\Default\\Weather.ini",
      "Data\\INI\\FXList.ini",
      "Data\\INI\\GameData.ini",
      "Data\\INI\\Locomotor.ini",
      "Data\\INI\\MiscAudio.ini",
      "Data\\INI\\multiplayer.ini",
      "Data\\INI\\Music.ini",
      ...mappedImageIniEntries,
      "Data\\INI\\ObjectCreationList.ini",
      "Data\\INI\\Object\\AmericaInfantry.ini",
      "Data\\INI\\ParticleSystem.ini",
      "Data\\INI\\PlayerTemplate.ini",
      "Data\\INI\\Roads.ini",
      "Data\\INI\\Science.ini",
      "Data\\INI\\SoundEffects.ini",
      "Data\\INI\\SpecialPower.ini",
      "Data\\INI\\Speech.ini",
      "Data\\INI\\Terrain.ini",
      "Data\\INI\\Upgrade.ini",
      "Data\\INI\\Video.ini",
      "Data\\INI\\Voice.ini",
      "Data\\INI\\Water.ini",
      "Data\\INI\\Weather.ini",
      "Data\\INI\\Weapon.ini",
    ],
  },
  {
    name: "EnglishZH.big",
    entries: [
      "Data\\English\\CommandMap.ini",
      "Data\\English\\Generals.csf",
    ],
  },
  {
    name: "MapsZH.big",
    entries: [
      "Maps\\MapCache.ini",
    ],
  },
];

const expectedMissingStartupFiles = [
  "Data\\INI\\Default\\GameData.ini",
  "Data\\INI\\Default\\Water.ini",
  "Data\\INI\\Default\\Science.ini",
  "Data\\INI\\Default\\Multiplayer.ini",
  "Data\\INI\\Default\\Terrain.ini",
  "Data\\INI\\Default\\Roads.ini",
  "Data\\INI\\Rank.ini",
  "Data\\INI\\Default\\PlayerTemplate.ini",
  "Data\\INI\\Default\\FXList.ini",
  "Data\\INI\\Default\\ObjectCreationList.ini",
  "Data\\INI\\Default\\SpecialPower.ini",
  "Data\\INI\\Default\\Upgrade.ini",
  "Data\\INI\\Default\\Crate.ini",
  "Data\\INI\\CommandMap.ini",
  "Data\\INI\\Default\\Video.ini",
];

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function requireStartupAssetReady(startupAssets, key, context) {
  if (startupAssets?.required?.[key] !== true) {
    throw new Error(`${context} startup asset ${key} is not ready: ${JSON.stringify(startupAssets)}`);
  }
}

function assertStartupAssetsReady(state, context) {
  const startupAssets = state.startupAssets;
  if (!startupAssets?.ok
      || startupAssets.status !== "ready"
      || !startupAssets.archiveSetRegistered
      || !startupAssets.bootProbeAttempted
      || !startupAssets.bootProbeOk) {
    throw new Error(`${context} startup assets are not ready: ${JSON.stringify(startupAssets)}`);
  }

  for (const key of [
    "inizh",
    "armor",
    "damageFX",
    "fxList",
    "science",
    "objectCreationList",
    "weapon",
    "particleSystem",
    "aiData",
    "locomotor",
    "upgrade",
    "commandButton",
    "commandSet",
    "controlBarScheme",
    "crate",
    "specialPower",
    "playerTemplate",
    "multiplayer",
    "terrain",
    "terrainRoads",
    "gameData",
    "water",
    "weather",
    "video",
    "gameText",
    "mapCache",
  ]) {
    requireStartupAssetReady(startupAssets, key, context);
  }
}

function assertOriginalStartupMissingOnlyBaseFiles(state, context) {
  const startup = state.originalEngineStartup;
  if (!startup
      || startup.ok !== false
      || startup.initAttempted !== false
      || startup.source !== "GameEngine/Common/GameEngine.cpp::init"
      || startup.status !== "missing_startup_files"
      || startup.startupAssetsReady !== true
      || startup.dataPreflightReady !== true
      || startup.deviceFactoryFrontier?.nextRequired !== "startupFiles"
      || startup.deviceFactoryFrontier?.fileSystemReady !== true
      || startup.deviceFactoryFrontier?.startupFilesReady !== false
      || startup.browserDeviceLayer?.localFileSystem !== true
      || startup.browserDeviceLayer?.archiveFileSystem !== true) {
    throw new Error(`${context} original startup state mismatch: ${JSON.stringify(startup)}`);
  }

  const files = startup.startupFiles;
  const missing = new Set(files?.missing ?? []);
  if (files?.ready !== false
      || files.gameDataIni !== true
      || files.waterIni !== true
      || files.weatherIni !== true
      || files.scienceIni !== true
      || files.multiplayerIni !== true
      || files.terrainIni !== true
      || files.roadsIni !== true
      || files.playerTemplateIni !== true
      || files.fxListIni !== true
      || files.weaponIni !== true
      || files.objectCreationListIni !== true
      || files.locomotorIni !== true
      || files.specialPowerIni !== true
      || files.damageFXIni !== true
      || files.armorIni !== true
      || files.defaultObjectIni !== true
      || files.upgradeIni !== true
      || files.defaultAIDataIni !== true
      || files.crateIni !== true
      || files.englishCommandMapIni !== true
      || files.mapCacheIni !== true
      || files.videoIni !== true
      || files.objectIniFiles !== 1
      || missing.size !== expectedMissingStartupFiles.length) {
    throw new Error(`${context} startup file readiness mismatch: ${JSON.stringify(files)}`);
  }

  for (const expected of expectedMissingStartupFiles) {
    if (!missing.has(expected)) {
      throw new Error(`${context} did not report expected missing base startup file ${expected}: ${JSON.stringify(files)}`);
    }
  }
}

if (!isInside(wasmRoot, archiveRoot)) {
  throw new Error(`archive root must be inside ${wasmRoot}: ${archiveRoot}`);
}

const archives = [];
for (const spec of archiveSpecs) {
  const path = resolve(archiveRoot, spec.name);
  if (!isInside(archiveRoot, path)) {
    throw new Error(`archive path escaped ${archiveRoot}: ${path}`);
  }

  await access(path);
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error(`archive is not a readable file: ${path}`);
  }

  archives.push({
    ...spec,
    path,
    bytes: fileStat.size,
    urlPath: relative(wasmRoot, path).split(sep).join("/"),
  });
}

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const mountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
    path: runtimeArchivePath,
    verifyEach: false,
    archives: archives.map((archive) => ({
      url: new URL(archive.urlPath, server.url).href,
      name: archive.name,
      sourceName: archive.name,
      expectedSourceBytes: archive.bytes,
      sourceArchive: archive.path,
      entries: archive.entries,
    })),
  });

  if (!mountResult.ok) {
    throw new Error(`range-backed startup archive mount failed: ${JSON.stringify(mountResult)}`);
  }

  const archiveSet = mountResult.archiveSet;
  const totalEntryCount = archives.reduce((sum, archive) => sum + archive.entries.length, 0);
  if (!archiveSet?.registered
      || archiveSet.path !== runtimeArchivePath
      || archiveSet.archiveCount !== archives.length
      || archiveSet.storage !== "range-backed-subset-big"
      || archiveSet.reader !== "browser fetch Range -> synthesized BIG -> Win32BIGFileSystem"
      || archiveSet.sourceTotalBytes <= archiveSet.totalBytes
      || archiveSet.probes?.length !== 0
      || archiveSet.archives?.reduce((sum, archive) => sum + archive.entryCount, 0) !== totalEntryCount) {
    throw new Error(`range-backed startup archive metadata mismatch: ${JSON.stringify(archiveSet)}`);
  }

  const preloadState = mountResult.state;
  if (preloadState.booted
      || preloadState.startupAssets?.status !== "pending_boot_probe"
      || preloadState.originalEngineStartup?.status !== "pending_boot_probe"
      || preloadState.archiveMount?.registered !== true
      || preloadState.archiveMount?.bootProbe?.attempted) {
    throw new Error(`range-backed startup archives should register before boot probing: ${JSON.stringify(preloadState)}`);
  }

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot"));
  if (!bootResult.ok || !bootResult.state?.booted) {
    throw new Error(`range-backed startup boot failed: ${JSON.stringify(bootResult)}`);
  }

  assertStartupAssetsReady(bootResult.state, "range-backed startup boot");
  assertOriginalStartupMissingOnlyBaseFiles(bootResult.state, "range-backed startup boot");

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archiveCount: archiveSet.archiveCount,
    subsetBytes: archiveSet.totalBytes,
    sourceBytes: archiveSet.sourceTotalBytes,
    entries: totalEntryCount,
    bootFrame: bootResult.state.frame,
    startupAssets: bootResult.state.startupAssets,
    originalEngineStartup: bootResult.state.originalEngineStartup,
    reader: archiveSet.reader,
    storage: archiveSet.storage,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
