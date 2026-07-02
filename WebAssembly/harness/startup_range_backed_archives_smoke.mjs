import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { assertBrowserRuntimeFileSystem } from "./browser_runtime_filesystem_assertions.mjs";
import { assertWin32GameEngineProbe } from "./win32_gameengine_assertions.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? defaultArchiveRoot);
const runtimeArchivePath = "/assets/range-startup";

function withTimeout(promise, milliseconds, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

const baseIniStartupEntries = [
  "Data\\INI\\Default\\GameData.ini",
  "Data\\INI\\GameLODPresets.ini",
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

const baseIniAudioStartupEntries = [
  "Data\\INI\\AudioSettings.ini",
  "Data\\INI\\Default\\Music.ini",
  "Data\\INI\\Default\\Speech.ini",
  "Data\\INI\\Default\\Voice.ini",
];

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

const requiredArchiveSpecs = [
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
      "Data\\INI\\GameLOD.ini",
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

const optionalBaseArchiveSpecs = [
  {
    name: "ZZBase_INI.big",
    sourceName: "INI.big",
    description: "base Generals default/startup INI data",
    entries: [
      ...baseIniStartupEntries,
      ...baseIniAudioStartupEntries,
    ],
  },
  {
    name: "ZZBase_English.big",
    sourceName: "English.big",
    description: "base Generals English localization data",
    entries: [
      "Data\\English\\CommandMap.ini",
    ],
  },
];

const expectedMissingStartupFiles = baseIniStartupEntries;
const expectedBaseAudioStartupMissing = [
  "Data\\INI\\AudioSettings.ini",
  "Data\\INI\\Default\\Music.ini",
  "Data\\INI\\Default\\Speech.ini",
  "Data\\INI\\Default\\Voice.ini",
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
    "gameLOD",
    "water",
    "weather",
    "video",
    "gameText",
    "mapCache",
  ]) {
    requireStartupAssetReady(startupAssets, key, context);
  }
}

function assertStartupSingletons(state, context, expectedReady) {
  const probe = state.startupSingletons;
  const commonReady = probe
    && probe.attempted === true
    && probe.runtimeArchiveRegistered === true
    && probe.runtimeGlobalsInstalled === true
    && probe.heapAllocated === true
    && probe.nameKeyGeneratorOwned === true
    && probe.commandList?.owned === true
    && probe.commandList.initialized === true
    && probe.commandList.empty === true
    && probe.xferCRC?.opened === true
    && probe.xferCRC.initialCRC === 0
    && probe.globalDataOwned === true
    && probe.subsystemListOwned === true
    && probe.gameLOD?.owned === true
    && probe.mapCache?.owned === true
    && probe.mapCache?.loaded === false
    && probe.mapCache?.updateCacheRuntimeReady === false;
  if (!commonReady) {
    throw new Error(`${context} startup singleton ownership mismatch: ${JSON.stringify(probe)}`);
  }

  if (expectedReady
      && (probe.ok !== true
        || probe.status !== "ready"
        || probe.nextRequired !== "createAudioManager"
        || probe.subsystemInitShutdownOk !== true
        || probe.subsystemShutdownDeferred !== true
        || probe.subsystemInitCount !== 1
        || probe.subsystemShutdownCount !== 0
        || probe.gameLOD?.filesReady !== true
        || probe.gameLOD?.initialized !== true
        || probe.mapCache?.loaded !== false
        || probe.mapCache?.updateCacheRuntimeReady !== false
        || probe.gameLOD?.textureReduction < 0
        || typeof probe.gameLOD?.memoryPassed !== "boolean")) {
    throw new Error(`${context} startup singleton readiness mismatch: ${JSON.stringify(probe)}`);
  }

  if (!expectedReady
      && (probe.ok !== false
        || probe.status !== "missing_game_lod_files"
        || probe.nextRequired !== "GameLODStartupFiles"
        || probe.subsystemInitShutdownOk !== false
        || probe.subsystemShutdownDeferred !== false
        || probe.subsystemInitCount !== 0
        || probe.subsystemShutdownCount !== 0
        || probe.gameLOD?.filesReady !== false
        || probe.gameLOD?.initialized !== false)) {
    throw new Error(`${context} startup singleton ownership mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertDeviceFactoryFrontier(startup, context, expected) {
  const frontier = startup.deviceFactoryFrontier;
  const entries = frontier?.entries ?? [];
  const byFactory = new Map(entries.map((entry) => [entry.factory, entry]));
  const audioFiles = frontier?.audioStartupFiles;
  const expectedAudioMissing = expected.audioStartupMissing ?? [];
  const audioMissing = new Set(audioFiles?.missing ?? []);
  const milesAudio = frontier?.milesAudioDeviceFrontier;
  const preAudio = frontier?.preAudioInitOwnership;
  if (!frontier
      || frontier.probeOnly !== true
      || frontier.ready !== false
      || frontier.nextRequired !== expected.nextRequired
      || frontier.firstUnownedInitFactory !== "createAudioManager"
      || frontier.fileSystemReady !== true
      || frontier.startupFilesReady !== expected.startupFilesReady
      || frontier.startupSingletonsReady !== expected.startupSingletonsReady
      || frontier.setupReady !== expected.setupReady
      || frontier.factoryMappings?.CreateGameEngine !== "Win32GameEngine"
      || frontier.factoryMappings?.createLocalFileSystem !== "Win32LocalFileSystem"
      || frontier.factoryMappings?.createArchiveFileSystem !== "Win32BIGFileSystem"
      || frontier.factoryMappings?.createAudioManager !== "MilesAudioManager"
      || preAudio?.source !== "GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp lines 297-427"
      || preAudio.nameKeyGenerator?.line !== 314
      || preAudio.nameKeyGenerator.ready !== true
      || preAudio.commandList?.line !== 327
      || preAudio.commandList.ready !== true
      || preAudio.commandList.owned !== true
      || preAudio.commandList.initialized !== true
      || preAudio.commandList.empty !== true
      || preAudio.xferCRC?.line !== 338
      || preAudio.xferCRC.ready !== true
      || preAudio.xferCRC.initialCRC !== 0
      || preAudio.parseCommandLine?.line !== 381
      || preAudio.parseCommandLine.ready !== true
      || preAudio.firstUnownedFactory?.line !== 434
      || preAudio.firstUnownedFactory.factory !== "createAudioManager"
      || byFactory.get("CreateGameEngine")?.line !== 1126
      || byFactory.get("CreateGameEngine")?.ready !== true
      || byFactory.get("SubsystemInterfaceList")?.line !== 297
      || byFactory.get("SubsystemInterfaceList")?.ready !== true
      || byFactory.get("NameKeyGenerator")?.line !== 314
      || byFactory.get("NameKeyGenerator")?.ready !== true
      || byFactory.get("CommandList")?.line !== 327
      || byFactory.get("CommandList")?.ready !== true
      || byFactory.get("XferCRC")?.line !== 338
      || byFactory.get("XferCRC")?.ready !== true
      || byFactory.get("parseCommandLine")?.line !== 381
      || byFactory.get("parseCommandLine")?.ready !== true
      || byFactory.get("GameLODManager")?.line !== 384
      || byFactory.get("GameLODManager")?.ready !== expected.gameLODReady
      || byFactory.get("MapCache")?.line !== 606
      || byFactory.get("MapCache")?.ready !== expected.mapCacheReady
      || audioFiles?.source !== "GameAudio.cpp::AudioManager::init"
      || audioFiles?.ready !== expected.audioStartupFilesReady
      || audioFiles?.audioSettingsIni !== expected.audioStartupFilesReady
      || audioFiles?.defaultMusicIni !== expected.audioStartupFilesReady
      || audioFiles?.musicIni !== true
      || audioFiles?.defaultSoundEffectsIni !== true
      || audioFiles?.soundEffectsIni !== true
      || audioFiles?.defaultSpeechIni !== expected.audioStartupFilesReady
      || audioFiles?.speechIni !== true
      || audioFiles?.defaultVoiceIni !== expected.audioStartupFilesReady
      || audioFiles?.voiceIni !== true
      || audioFiles?.miscAudioIni !== true
      || audioMissing.size !== expectedAudioMissing.length
      || expectedAudioMissing.some((path) => !audioMissing.has(path))
      || milesAudio?.source !== "MilesAudioManager.cpp::init/openDevice + Mss.H"
      || milesAudio?.ready !== false
      || milesAudio?.startupBoundaryReady !== true
      || milesAudio?.playbackReady !== false
      || milesAudio?.browserTarget !== "Web Audio"
      || milesAudio?.nextRequired !== expected.milesNextRequired) {
    throw new Error(`${context} device factory frontier mismatch: ${JSON.stringify(frontier)}`);
  }
}

function assertOriginalStartupHeader(state, context, expected) {
  const startup = state.originalEngineStartup;
  if (!startup
      || startup.ok !== false
      || startup.initAttempted !== false
      || startup.source !== "GameEngine/Common/GameEngine.cpp::init"
      || startup.status !== expected.status
      || startup.startupAssetsReady !== true
      || startup.dataPreflightReady !== true
      || startup.originalSetup?.globalData !== true
      || startup.originalSetup?.commandLine !== true
      || startup.originalSetup?.cdManager !== true
      || startup.originalSetup?.startupSingletons !== expected.startupSingletonsReady
      || startup.originalSetup?.subsystemList !== true
      || startup.originalSetup?.gameLODManager !== expected.gameLODReady
      || startup.originalSetup?.mapCache !== expected.mapCacheReady
      || startup.browserDeviceLayer?.ready !== false
      || startup.browserDeviceLayer?.createGameEngine !== true
      || startup.browserDeviceLayer?.browserGameEngine !== true
      || startup.browserDeviceLayer?.cdManager !== true
      || startup.browserDeviceLayer?.localFileSystem !== true
      || startup.browserDeviceLayer?.archiveFileSystem !== true
      || startup.browserDeviceLayer?.startupSingletons !== expected.startupSingletonsReady) {
    throw new Error(`${context} original startup state mismatch: ${JSON.stringify(startup)}`);
  }

  assertDeviceFactoryFrontier(startup, context, expected);
  return startup;
}

function assertOriginalStartupMissingOnlyBaseFiles(state, context) {
  const startup = assertOriginalStartupHeader(state, context, {
    status: "missing_startup_files",
    nextRequired: "startupFiles",
    startupFilesReady: false,
    startupSingletonsReady: false,
    gameLODReady: false,
    mapCacheReady: false,
    setupReady: false,
    audioStartupFilesReady: false,
    audioStartupMissing: expectedBaseAudioStartupMissing,
    milesNextRequired: "audioStartupFiles",
  });
  const files = startup.startupFiles;
  const missing = new Set(files?.missing ?? []);
  if (files?.ready !== false
      || files.gameDataIni !== true
      || files.gameLODIni !== true
      || files.gameLODPresetsIni !== false
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

  const baseIniArchive = files.baseIniArchive;
  const baseMissing = new Set(baseIniArchive?.missing ?? []);
  if (baseIniArchive?.ready !== false
      || baseIniArchive.archive !== "INI.big"
      || baseIniArchive.source !== "Base Generals Data1.cab"
      || baseIniArchive.mounted !== false
      || baseIniArchive.mountName !== null
      || baseIniArchive.sourceName !== null
      || baseMissing.size !== expectedMissingStartupFiles.length
      || !baseIniArchive.message?.includes("base Generals INI.big")) {
    throw new Error(`${context} base INI startup diagnostic mismatch: ${JSON.stringify(baseIniArchive)}`);
  }

  for (const expected of expectedMissingStartupFiles) {
    if (!missing.has(expected)) {
      throw new Error(`${context} did not report expected missing base startup file ${expected}: ${JSON.stringify(files)}`);
    }
    if (!baseMissing.has(expected)) {
      throw new Error(`${context} did not report expected missing base INI file ${expected}: ${JSON.stringify(baseIniArchive)}`);
    }
  }
}

function assertOriginalStartupWithBaseFiles(state, context) {
  const startup = assertOriginalStartupHeader(state, context, {
    status: "browser_device_layer_pending",
    nextRequired: "originalGameEngineInitOwnership",
    startupFilesReady: true,
    startupSingletonsReady: true,
    gameLODReady: true,
    mapCacheReady: false,
    setupReady: true,
    audioStartupFilesReady: true,
    audioStartupMissing: [],
    milesNextRequired: "webAudioPlaybackBackend",
  });
  const files = startup.startupFiles;
  if (files?.ready !== true
      || files.defaultGameDataIni !== true
      || files.gameDataIni !== true
      || files.gameLODIni !== true
      || files.gameLODPresetsIni !== true
      || files.defaultWaterIni !== true
      || files.waterIni !== true
      || files.defaultWeatherIni !== true
      || files.weatherIni !== true
      || files.generalsCsf !== true
      || files.defaultScienceIni !== true
      || files.scienceIni !== true
      || files.defaultMultiplayerIni !== true
      || files.multiplayerIni !== true
      || files.defaultTerrainIni !== true
      || files.terrainIni !== true
      || files.defaultRoadsIni !== true
      || files.roadsIni !== true
      || files.rankIni !== true
      || files.defaultPlayerTemplateIni !== true
      || files.playerTemplateIni !== true
      || files.defaultFXListIni !== true
      || files.fxListIni !== true
      || files.weaponIni !== true
      || files.defaultObjectCreationListIni !== true
      || files.objectCreationListIni !== true
      || files.locomotorIni !== true
      || files.defaultSpecialPowerIni !== true
      || files.specialPowerIni !== true
      || files.damageFXIni !== true
      || files.armorIni !== true
      || files.defaultObjectIni !== true
      || files.objectIniFiles !== 1
      || files.defaultUpgradeIni !== true
      || files.upgradeIni !== true
      || files.defaultAIDataIni !== true
      || files.defaultCrateIni !== true
      || files.crateIni !== true
      || files.englishCommandMapIni !== true
      || files.commandMapIni !== true
      || files.mapCacheIni !== true
      || files.defaultVideoIni !== true
      || files.videoIni !== true
      || (files.missing?.length ?? -1) !== 0) {
    throw new Error(`${context} base startup file readiness mismatch: ${JSON.stringify(files)}`);
  }

  const baseIniArchive = files.baseIniArchive;
  if (baseIniArchive?.ready !== true
      || baseIniArchive.archive !== "INI.big"
      || baseIniArchive.source !== "Base Generals Data1.cab"
      || baseIniArchive.mounted !== true
      || baseIniArchive.mountName !== "ZZBase_INI.big"
      || baseIniArchive.sourceName !== "INI.big"
      || (baseIniArchive.missing?.length ?? -1) !== 0
      || !baseIniArchive.message?.includes("base INI startup files are visible")) {
    throw new Error(`${context} base INI startup diagnostic should be clear: ${JSON.stringify(baseIniArchive)}`);
  }
}

if (!isInside(wasmRoot, archiveRoot)) {
  throw new Error(`archive root must be inside ${wasmRoot}: ${archiveRoot}`);
}

const archiveSpecs = [...requiredArchiveSpecs];
const availableOptionalBaseArchives = [];
for (const spec of optionalBaseArchiveSpecs) {
  const sourceName = spec.sourceName ?? spec.name;
  const path = resolve(archiveRoot, sourceName);
  if (!isInside(archiveRoot, path)) {
    throw new Error(`optional archive path escaped ${archiveRoot}: ${path}`);
  }

  try {
    await access(path);
  } catch {
    continue;
  }

  archiveSpecs.push(spec);
  availableOptionalBaseArchives.push(spec);
}

const archives = [];
for (const spec of archiveSpecs) {
  const sourceName = spec.sourceName ?? spec.name;
  const path = resolve(archiveRoot, sourceName);
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
    sourceName,
    path,
    bytes: fileStat.size,
    urlPath: relative(wasmRoot, path).split(sep).join("/"),
  });
}
const hasBaseIniArchive = archives.some((archive) => archive.sourceName === "INI.big");

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const browserLogs = [];
  page.on("console", (message) => {
    browserLogs.push(`[${message.type()}] ${message.text()}`);
    if (browserLogs.length > 80) browserLogs.shift();
  });
  page.on("pageerror", (error) => {
    browserLogs.push(`[pageerror] ${error.message}`);
    if (browserLogs.length > 80) browserLogs.shift();
  });
  const harnessUrl = new URL("harness/index.html", server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const mountResult = await withTimeout(page.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
    path: runtimeArchivePath,
    verifyEach: false,
    archives: archives.map((archive) => ({
      url: new URL(archive.urlPath, server.url).href,
      name: archive.name,
      sourceName: archive.sourceName,
      expectedSourceBytes: archive.bytes,
      sourceArchive: archive.path,
      entries: archive.entries,
    })),
  }), 45000, "range-backed startup archive mount");

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
  assertBrowserRuntimeFileSystem(preloadState, "range-backed startup preload", {
    directory: `${runtimeArchivePath}/`,
  });

  let bootResult;
  try {
    bootResult = await withTimeout(
      page.evaluate(() => window.CnCPort.rpc("boot")),
      30000,
      "range-backed startup boot RPC",
    );
  } catch (error) {
    throw new Error(`range-backed startup boot RPC failed: ${error.message}\n${browserLogs.join("\n")}`);
  }
  if (!bootResult.ok || !bootResult.state?.booted) {
    throw new Error(`range-backed startup boot failed: ${JSON.stringify(bootResult)}`);
  }

  assertStartupAssetsReady(bootResult.state, "range-backed startup boot");
  assertBrowserRuntimeFileSystem(bootResult.state, "range-backed startup boot", {
    directory: `${runtimeArchivePath}/`,
  });
  assertStartupSingletons(bootResult.state, "range-backed startup boot", hasBaseIniArchive);
  if (hasBaseIniArchive) {
    assertOriginalStartupWithBaseFiles(bootResult.state, "range-backed startup boot");
  } else {
    assertOriginalStartupMissingOnlyBaseFiles(bootResult.state, "range-backed startup boot");
  }
  const win32GameEngineResult = await page.evaluate(() => window.CnCPort.rpc("win32GameEngineProbe"));
  if (!win32GameEngineResult.ok) {
    throw new Error(`Win32GameEngine probe RPC failed: ${JSON.stringify(win32GameEngineResult)}`);
  }
  assertWin32GameEngineProbe(win32GameEngineResult.probe, "range-backed startup boot");

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archiveCount: archiveSet.archiveCount,
    subsetBytes: archiveSet.totalBytes,
    sourceBytes: archiveSet.sourceTotalBytes,
    entries: totalEntryCount,
    optionalBaseArchives: availableOptionalBaseArchives.map((archive) => ({
      sourceName: archive.sourceName,
      mountName: archive.name,
      description: archive.description,
      entries: archive.entries.length,
    })),
    bootFrame: bootResult.state.frame,
    win32GameEngineProbe: win32GameEngineResult.probe,
    startupAssets: bootResult.state.startupAssets,
    originalEngineStartup: bootResult.state.originalEngineStartup,
    reader: archiveSet.reader,
    storage: archiveSet.storage,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
