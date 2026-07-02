import { access, mkdir, open, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const desktopScreenshot = resolve(screenshotDir, "startup-vertical-browser.png");
const canvasScreenshot = resolve(screenshotDir, "startup-vertical-canvas.png");
const audioBootScreenshot = resolve(screenshotDir, "startup-vertical-audio-owned.png");

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

async function readBigEntryNames(path) {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    if (header.toString("ascii", 0, 4) !== "BIGF") {
      throw new Error(`not a BIGF archive: ${path}`);
    }
    const entryCount = header.readUInt32BE(8);
    const directorySize = header.readUInt32BE(12);
    const directory = Buffer.alloc(directorySize + 16);
    await handle.read(directory, 0, directory.length, 0);
    const entries = [];
    let cursor = 16;
    for (let index = 0; index < entryCount; ++index) {
      cursor += 8; // offset + size
      let end = cursor;
      while (end < directory.length && directory[end] !== 0) ++end;
      entries.push(directory.toString("latin1", cursor, end));
      cursor = end + 1;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

// GameEngine.cpp startup INI/data files served from the base Generals INI.big
// (mounted as ZZBase_INI.big, mirroring the runtime-archives smokes).
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

// AudioManager::init() (GameAudio.cpp) INI set that lives in base INI.big.
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

const inizhStartupEntries = [
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
];

async function buildAudioOwnershipArchiveSpecs() {
  // AudioManager::isMusicAlreadyLoaded() checks a real MusicTrack file from
  // Music.ini, so the boot needs the base Generals Music.big (the ZH disc
  // Music.big only carries the copy-protection payload). Staged from the base
  // Generals Data1.cab via:
  //   cabextract -d artifacts/real-assets/base-generals -F Music.big <Data1.cab>
  const baseMusicPath = resolve(archiveRoot, "base-generals/Music.big");
  await access(baseMusicPath).catch(() => {
    throw new Error(
      "artifacts/real-assets/base-generals/Music.big is required for the "
      + "audio-ownership boot; extract it from the base Generals Data1.cab");
  });

  const specs = [
    { name: "INIZH.big", entries: inizhStartupEntries },
    {
      name: "EnglishZH.big",
      entries: ["Data\\English\\CommandMap.ini", "Data\\English\\Generals.csf"],
    },
    { name: "MapsZH.big", entries: ["Maps\\MapCache.ini"] },
    {
      name: "MusicZH.big",
      entries: await readBigEntryNames(resolve(archiveRoot, "MusicZH.big")),
    },
    {
      name: "Music.big",
      sourceName: "base-generals/Music.big",
      entries: await readBigEntryNames(baseMusicPath),
    },
    {
      name: "ZZBase_INI.big",
      sourceName: "INI.big",
      entries: [...baseIniStartupEntries, ...baseIniAudioStartupEntries],
    },
    {
      name: "ZZBase_English.big",
      sourceName: "English.big",
      entries: ["Data\\English\\CommandMap.ini"],
    },
  ];

  const archives = [];
  for (const spec of specs) {
    const sourceName = spec.sourceName ?? spec.name;
    const path = resolve(archiveRoot, sourceName);
    const fileStat = await stat(path);
    archives.push({
      ...spec,
      sourceName,
      path,
      bytes: fileStat.size,
      urlPath: relative(wasmRoot, path).split(sep).join("/"),
    });
  }
  return archives;
}

function assertAudioManagerRuntimeOwned(state) {
  const probe = state.audioManagerRuntime;
  expect(probe?.attempted === true, "audio manager runtime probe did not run", probe);
  expect(probe.ok === true, "audio manager runtime probe is not ready", probe);
  expect(probe.status === "ready", "audio manager runtime status mismatch", probe);
  expect(probe.nextRequired === "createFunctionLexicon",
    "audio manager runtime nextRequired mismatch", probe);
  expect(probe.constructed === true && probe.theAudioOwned === true,
    "original MilesAudioManager was not constructed as TheAudio", probe);
  expect(probe.initRan === true && probe.initThrew === false,
    "original MilesAudioManager::init() did not complete", probe);
  expect(probe.gameEngineInit?.factory === "createAudioManager"
      && probe.gameEngineInit.line === 434
      && probe.gameEngineInit.musicCheckLine === 435
      && probe.gameEngineInit.wouldSetQuitting === false,
    "GameEngine.cpp createAudioManager ownership mismatch", probe);
  expect(probe.audioSettings?.audioRoot === "Data\\Audio",
    "AudioSettings.ini audio root did not parse through the real INI path", probe);
  expect(probe.audioSettings.outputRate > 0 && probe.audioSettings.sampleCount2D > 0
      && probe.audioSettings.sampleCount3D > 0 && probe.audioSettings.streamCount > 0,
    "AudioSettings.ini device settings did not parse", probe);
  expect(probe.audioEventInfo?.musicTracks >= 60,
    "Music.ini tracks did not parse through the real INI path", probe);
  expect(probe.audioEventInfo.soundEffects >= 1000,
    "SoundEffects.ini events did not parse through the real INI path", probe);
  expect(probe.audioEventInfo.streamingEvents >= 1000,
    "Speech.ini/Voice.ini events did not parse through the real INI path", probe);
  expect(probe.audioEventInfo.miscAudioParsed === true,
    "MiscAudio.ini did not parse through the real INI path", probe);
  expect(probe.music?.alreadyLoaded === true,
    "AudioManager::isMusicAlreadyLoaded() did not find the music archive", probe);
  expect(probe.music.osDisplayWarningPrompts === 0,
    "music check should not raise the insert-CD prompt with archives mounted", probe);
  expect(probe.openDevice?.startupCalled === true
      && probe.openDevice.quickStartupOk === true
      && probe.openDevice.fileCallbacksSet === true,
    "MilesAudioManager::openDevice() did not drive the browser MSS runtime", probe);
  expect(probe.openDevice.providerCount >= 2
      && probe.openDevice.providerSelected === true
      && probe.openDevice.selectedProviderOpen === true
      && probe.openDevice.selectedProvider.length > 0,
    "openDevice provider selection mismatch", probe);
  expect(probe.openDevice.samples2D > 0
      && probe.openDevice.samples3D > 0
      && probe.openDevice.streams > 0
      && probe.openDevice.mssSamples2DAllocated === probe.openDevice.samples2D
      && probe.openDevice.mssSamples3DAllocated === probe.openDevice.samples3D
      && probe.openDevice.mssListenersAllocated === 1,
    "openDevice sample/listener pools mismatch", probe);
  expect(probe.teardown?.tornDown === true
      && probe.teardown.mssShutdownCalled === true
      && probe.teardown.theAudioCleared === true,
    "original MilesAudioManager teardown mismatch", probe);
}

function assertFunctionLexiconRuntimeFrontier(state) {
  const probe = state.functionLexiconRuntime;
  expect(probe?.attempted === true, "function lexicon runtime probe did not run", probe);
  expect(probe.ok === false, "function lexicon runtime should not claim full ownership yet", probe);
  expect(probe.status === "base_function_lexicon_replay_control_runtime_owned",
    "function lexicon runtime status mismatch", probe);
  expect(probe.nextRequired === "originalFunctionLexiconRemainingShellCallbacks",
    "function lexicon runtime nextRequired mismatch", probe);
  expect(probe.constructed === true && probe.theFunctionLexiconOwned === true,
    "original W3DFunctionLexicon was not constructed as TheFunctionLexicon", probe);
  expect(probe.initRan === true && probe.initThrew === false,
    "original W3DFunctionLexicon::init() did not complete", probe);
  expect(probe.gameEngineInit?.factory === "createFunctionLexicon"
      && probe.gameEngineInit.line === 446
      && probe.gameEngineInit.originalConcrete === "W3DFunctionLexicon",
    "GameEngine.cpp createFunctionLexicon ownership mismatch", probe);
  expect(probe.tables?.gameWindowSystem === true
      && probe.tables.gameWindowInput === true
      && probe.tables.gameWindowTooltip === true
      && probe.tables.gameWindowDraw === true
      && probe.tables.gameWindowDeviceDraw === true
      && probe.tables.windowLayoutDeviceInit === true
      && probe.tables.windowLayoutInit === true
      && probe.tables.windowLayoutUpdate === true
      && probe.tables.windowLayoutShutdown === true,
    "FunctionLexicon widget/draw, representative layout, and W3D device tables should be loaded", probe.tables);
  expect(probe.lookups?.passMessagesToParentSystem === true
      && probe.lookups.passSelectedButtonsToParentSystem === true
      && probe.lookups.gameWindowDefaultSystem === true
      && probe.lookups.gadgetPushButtonSystem === true
      && probe.lookups.gadgetCheckBoxSystem === true
      && probe.lookups.gadgetRadioButtonSystem === true
      && probe.lookups.gadgetTabControlSystem === true
      && probe.lookups.gadgetListBoxSystem === true
      && probe.lookups.gadgetComboBoxSystem === true
      && probe.lookups.gadgetHorizontalSliderSystem === true
      && probe.lookups.gadgetVerticalSliderSystem === true
      && probe.lookups.gadgetProgressBarSystem === true
      && probe.lookups.gadgetStaticTextSystem === true
      && probe.lookups.gadgetTextEntrySystem === true
      && probe.lookups.messageBoxSystem === true
      && probe.lookups.quitMessageBoxSystem === true
      && probe.lookups.extendedMessageBoxSystem === true
      && probe.lookups.imeCandidateWindowSystem === true
      && probe.lookups.mainMenuSystem === true
      && probe.lookups.creditsMenuSystem === true
      && probe.lookups.skirmishGameOptionsMenuSystem === true
      && probe.lookups.singlePlayerMenuSystem === true
      && probe.lookups.difficultySelectSystem === true
      && probe.lookups.keyboardOptionsMenuSystem === true
      && probe.lookups.inGamePopupMessageSystem === true
      && probe.lookups.idleWorkerSystem === true
      && probe.lookups.replayControlSystem === true
      && probe.lookups.gameWindowDefaultInput === true
      && probe.lookups.gadgetPushButtonInput === true
      && probe.lookups.gadgetCheckBoxInput === true
      && probe.lookups.gadgetRadioButtonInput === true
      && probe.lookups.gadgetTabControlInput === true
      && probe.lookups.gadgetListBoxInput === true
      && probe.lookups.gadgetListBoxMultiInput === true
      && probe.lookups.gadgetComboBoxInput === true
      && probe.lookups.gadgetHorizontalSliderInput === true
      && probe.lookups.gadgetVerticalSliderInput === true
      && probe.lookups.gadgetStaticTextInput === true
      && probe.lookups.gadgetTextEntryInput === true
      && probe.lookups.imeCandidateWindowInput === true
      && probe.lookups.mainMenuInput === true
      && probe.lookups.creditsMenuInput === true
      && probe.lookups.skirmishGameOptionsMenuInput === true
      && probe.lookups.singlePlayerMenuInput === true
      && probe.lookups.difficultySelectInput === true
      && probe.lookups.keyboardOptionsMenuInput === true
      && probe.lookups.inGamePopupMessageInput === true
      && probe.lookups.beaconWindowInput === true
      && probe.lookups.replayControlInput === true
      && probe.lookups.gameWindowDefaultTooltip === true
      && probe.lookups.imeCandidateMainDraw === true
      && probe.lookups.imeCandidateTextAreaDraw === true
      && probe.lookups.mainMenuInit === true
      && probe.lookups.creditsMenuInit === true
      && probe.lookups.skirmishGameOptionsMenuInit === true
      && probe.lookups.singlePlayerMenuInit === true
      && probe.lookups.difficultySelectInit === true
      && probe.lookups.keyboardOptionsMenuInit === true
      && probe.lookups.inGamePopupMessageInit === true
      && probe.lookups.mainMenuUpdate === true
      && probe.lookups.creditsMenuUpdate === true
      && probe.lookups.skirmishGameOptionsMenuUpdate === true
      && probe.lookups.singlePlayerMenuUpdate === true
      && probe.lookups.keyboardOptionsMenuUpdate === true
      && probe.lookups.mainMenuShutdown === true
      && probe.lookups.creditsMenuShutdown === true
      && probe.lookups.skirmishGameOptionsMenuShutdown === true
      && probe.lookups.singlePlayerMenuShutdown === true
      && probe.lookups.keyboardOptionsMenuShutdown === true
      && probe.lookups.popupReplayShutdown === true
      && probe.lookups.w3dGadgetPushButtonDraw === true
      && probe.lookups.w3dGameWindowDefaultDraw === true
      && probe.lookups.w3dMainMenuInit === true,
    "FunctionLexicon widget/draw/layout/W3D callback lookups did not resolve", probe.lookups);
}

function assertAudioOwnedFrontier(state) {
  const startup = state.originalEngineStartup;
  const frontier = startup?.deviceFactoryFrontier;
  expect(frontier?.firstUnownedInitFactory === "createFunctionLexicon",
    "audio-owned frontier should remain at createFunctionLexicon", frontier);
  expect(frontier.firstUnownedInitLine === 446,
    "audio-owned frontier line should remain 446", frontier);
  expect(frontier.nextRequired === "createFunctionLexicon",
    "audio-owned frontier nextRequired mismatch", frontier);
  const preAudio = frontier.preAudioInitOwnership;
  expect(preAudio?.firstUnownedFactory?.line === 446
      && preAudio.firstUnownedFactory.factory === "createFunctionLexicon"
      && preAudio.firstUnownedFactory.subsystem === "TheFunctionLexicon",
    "audio-owned first unowned factory mismatch", frontier);
  const audioEntry = entryByFactory(frontier, "createAudioManager");
  expect(audioEntry?.line === 434 && audioEntry.ready === true
      && audioEntry.status === "browser_runtime_initialized_original_audio_manager",
    "createAudioManager frontier entry should be runtime-owned", frontier);
  const lexiconEntry = entryByFactory(frontier, "createFunctionLexicon");
  expect(lexiconEntry?.line === 446 && lexiconEntry.ready === false
      && lexiconEntry.status === "needs_browser_w3d_function_lexicon",
    "createFunctionLexicon frontier entry should remain the runtime frontier", frontier);
  expect(frontier.milesAudioDeviceFrontier?.runtimeReady === true,
    "Miles frontier runtimeReady mismatch", frontier.milesAudioDeviceFrontier);
  const refresh = frontier.milesAudioDeviceFrontier?.openDeviceCalls?.[6];
  expect(refresh?.call === "refreshCachedVariables" && refresh.ready === true
      && refresh.status === "browser_audio_manager_runtime_refreshed",
    "refreshCachedVariables should be runtime-owned", frontier.milesAudioDeviceFrontier);
  expect(frontier.audioManagerRuntime?.ready === true
      && frontier.audioManagerRuntime.musicAlreadyLoaded === true
      && frontier.audioManagerRuntime.wouldSetQuitting === false
      && frontier.audioManagerRuntime.tornDown === true,
    "frontier audioManagerRuntime summary mismatch", frontier.audioManagerRuntime);
  expect(frontier.functionLexiconRuntime?.ready === false
      && frontier.functionLexiconRuntime.status === "base_function_lexicon_replay_control_runtime_owned"
      && frontier.functionLexiconRuntime.w3dDeviceDrawReady === true
      && frontier.functionLexiconRuntime.w3dLayoutInitReady === true
      && frontier.functionLexiconRuntime.messageBoxSystemReady === true
      && frontier.functionLexiconRuntime.nextRequired === "originalFunctionLexiconRemainingShellCallbacks",
    "frontier functionLexiconRuntime summary mismatch", frontier.functionLexiconRuntime);
  expect(startup.browserDeviceLayer?.functionLexicon === false,
    "browser device layer should not mark the full function lexicon runtime-owned", startup.browserDeviceLayer);
}

function assertStartupSingletonsMissing(state) {
  const probe = state.startupSingletons;
  expect(probe?.attempted === true, "startup singleton probe did not run", probe);
  expect(probe.ok === false, "startup singleton probe should not be ready without archives", probe);
  expect(probe.status === "missing_runtime_archives", "startup singleton status mismatch", probe);
  expect(probe.nextRequired === "runtimeArchiveSet", "startup singleton nextRequired mismatch", probe);
  expect(probe.runtimeArchiveRegistered === false, "startup singleton archive registration mismatch", probe);
  expect(probe.runtimeGlobalsInstalled === false, "startup singleton runtime globals mismatch", probe);
  expect(probe.heapAllocated === false, "startup singleton heap allocation mismatch", probe);
  expect(probe.nameKeyGeneratorOwned === false, "startup singleton name-key ownership mismatch", probe);
  expect(probe.commandList?.owned === false, "startup singleton command-list ownership mismatch", probe);
  expect(probe.xferCRC?.opened === false, "startup singleton XferCRC mismatch", probe);
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
  expect(browserLayer.createGameEngine === true, "CreateGameEngine should be browser-construction ready", browserLayer);
  expect(browserLayer.browserGameEngine === true, "browser GameEngine lifetime should be constructed", browserLayer);
  expect(browserLayer.localFileSystem === true, "browser local filesystem probe should be ready", browserLayer);
  expect(browserLayer.archiveFileSystem === false, "browser archive filesystem should lack runtime archives", browserLayer);
  expect(browserLayer.audioManager === false, "browser audio manager should not be runtime-ready", browserLayer);
  expect(browserLayer.functionLexicon === false,
    "browser function lexicon should not be runtime-ready without archives", browserLayer);
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

  const preAudio = frontier.preAudioInitOwnership;
  expect(preAudio?.source === "GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp lines 297-427",
    "pre-audio init ownership source mismatch", frontier);
  expect(preAudio.nameKeyGenerator?.line === 314 && preAudio.nameKeyGenerator.ready === false,
    "pre-audio NameKeyGenerator ownership mismatch", frontier);
  expect(preAudio.commandList?.line === 327 && preAudio.commandList.ready === false,
    "pre-audio CommandList ownership mismatch", frontier);
  expect(preAudio.xferCRC?.line === 338 && preAudio.xferCRC.ready === false,
    "pre-audio XferCRC ownership mismatch", frontier);
  expect(preAudio.parseCommandLine?.line === 381 && preAudio.parseCommandLine.ready === true,
    "pre-audio parseCommandLine ownership mismatch", frontier);
  expect(preAudio.firstUnownedFactory?.line === 434
      && preAudio.firstUnownedFactory.factory === "createAudioManager",
    "pre-audio first unowned factory mismatch", frontier);

  expect(entryByFactory(frontier, "CreateGameEngine")?.line === 1122,
    "CreateGameEngine frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "CreateGameEngine")?.ready === true,
    "CreateGameEngine should be browser-construction ready", frontier);
  expect(entryByFactory(frontier, "SubsystemInterfaceList")?.line === 297,
    "SubsystemInterfaceList frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "NameKeyGenerator")?.line === 314,
    "NameKeyGenerator frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "CommandList")?.line === 327,
    "CommandList frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "XferCRC")?.line === 338,
    "XferCRC frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createFileSystem")?.line === 305,
    "createFileSystem frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createLocalFileSystem")?.line === 342,
    "createLocalFileSystem frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "createArchiveFileSystem")?.line === 353,
    "createArchiveFileSystem frontier line mismatch", frontier);
  expect(entryByFactory(frontier, "parseCommandLine")?.line === 381,
    "parseCommandLine frontier line mismatch", frontier);
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
  expect(frontier.milesAudioDeviceFrontier?.runtimeReady === false,
    "Miles frontier should not claim the audio runtime without archives",
    frontier.milesAudioDeviceFrontier);
  expect(frontier.audioManagerRuntime?.attempted === true
      && frontier.audioManagerRuntime.ready === false
      && frontier.audioManagerRuntime.status === "missing_runtime_archives",
    "audio manager runtime should be blocked without archives",
    frontier.audioManagerRuntime);
  expect(frontier.functionLexiconRuntime?.attempted === true
      && frontier.functionLexiconRuntime.ready === false
      && frontier.functionLexiconRuntime.status === "missing_runtime_archives",
    "function lexicon runtime should be blocked without archives",
    frontier.functionLexiconRuntime);

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

  // Archive-backed boot: mount the startup + audio archive set and prove the
  // boot constructs the original MilesAudioManager and W3DFunctionLexicon,
  // runs the real AudioManager::init()/openDevice() path plus the original
  // W3DFunctionLexicon device-table load, original MainMenu/Credits/Skirmish
  // base shell callbacks, and honestly keeps the device-factory frontier at
  // createFunctionLexicon until the remaining shell callback graph is owned
  // by cnc-port.
  const archives = await buildAudioOwnershipArchiveSpecs();
  const audioPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await audioPage.goto(harnessUrl, { waitUntil: "networkidle" });
  await audioPage.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const mountResult = await audioPage.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
    path: "/assets/startup-audio",
    verifyEach: false,
    archives: archives.map((archive) => ({
      url: new URL(archive.urlPath, server.url).href,
      name: archive.name,
      sourceName: archive.sourceName,
      expectedSourceBytes: archive.bytes,
      sourceArchive: archive.path,
      entries: archive.entries,
    })),
  });
  expect(mountResult.ok === true, "audio-ownership archive mount failed", mountResult.archiveSet);

  const audioBootResult = await audioPage.evaluate(() => window.CnCPort.rpc("boot", {
    source: "startup vertical smoke (audio ownership)",
  }));
  expect(audioBootResult.ok === true, "audio-ownership boot RPC failed", audioBootResult);
  expect(audioBootResult.state?.booted === true, "audio-ownership boot state mismatch", audioBootResult);
  expect(audioBootResult.state.startupSingletons?.ok === true,
    "audio-ownership boot should own the startup singletons",
    audioBootResult.state.startupSingletons);

  assertAudioManagerRuntimeOwned(audioBootResult.state);
  assertFunctionLexiconRuntimeFrontier(audioBootResult.state);
  assertAudioOwnedFrontier(audioBootResult.state);

  await audioPage.screenshot({ path: audioBootScreenshot });

  const audioFrontier =
    audioBootResult.state.originalEngineStartup.deviceFactoryFrontier;
  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    wasm: bootResult.state.wasm,
    frame: bootResult.state.frame,
    screenshots: [desktopScreenshot, canvasScreenshot, audioBootScreenshot],
    originalEngineStartup: bootResult.state.originalEngineStartup,
    archiveBackedStartup: {
      archiveCount: mountResult.archiveSet?.archiveCount,
      firstUnownedInitFactory: audioFrontier.firstUnownedInitFactory,
      firstUnownedInitLine: audioFrontier.firstUnownedInitLine,
      audioManagerRuntime: audioBootResult.state.audioManagerRuntime,
      functionLexiconRuntime: audioBootResult.state.functionLexiconRuntime,
    },
  }));
} finally {
  await browser?.close();
  await server.close();
}
