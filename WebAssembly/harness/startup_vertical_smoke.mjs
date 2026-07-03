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
const realInitScreenshot = resolve(screenshotDir, "startup-vertical-real-init.png");
const realInitMenuClickScreenshot = resolve(screenshotDir, "startup-vertical-real-init-menu-click.png");
const realInitCampaignStartScreenshot = resolve(screenshotDir, "startup-vertical-real-init-campaign-start.png");
const realInitPostCampaignScreenshot = resolve(screenshotDir, "startup-vertical-real-init-post-campaign.png");
const debugStartupVertical = process.env.STARTUP_VERTICAL_DEBUG === "1";
const realInitOnly = process.env.STARTUP_VERTICAL_REAL_INIT_ONLY === "1";
const postCampaignFrameCount = Number(process.env.STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES ?? 0);
const postCampaignFrameChunkCount =
  Number(process.env.STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK ?? 0);
const postCampaignUntilPlayerControl =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL === "1";
const postCampaignExpectPlayerControl =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_EXPECT_PLAYER_CONTROL === "1";
const postCampaignBreakpoint = process.env.STARTUP_VERTICAL_POST_CAMPAIGN_BREAKPOINT ?? "";
const postCampaignPreBreakpointFrameCount =
  Number(process.env.STARTUP_VERTICAL_POST_CAMPAIGN_PRE_BREAKPOINT_FRAMES ?? 0);
const postCampaignEngineBreakpoint =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_ENGINE_BREAKPOINT ?? "";
const postCampaignAfterGameLogicBreakpoint =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_AFTER_GAME_LOGIC_BREAKPOINT ?? "";

const gameModes = Object.freeze({
  singlePlayer: 0,
});

const gameDifficulties = Object.freeze({
  easy: 0,
});

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

function pixelLooksLikeMenuChrome(pixel) {
  if (!Array.isArray(pixel) || pixel.length < 4 || pixel[3] < 200) {
    return false;
  }
  const [red, green, blue] = pixel;
  const blueBorder = red < 90 && green >= 15 && blue >= 50;
  const whiteText = red >= 150 && green >= 150 && blue >= 150;
  const yellowHilite = red >= 150 && green >= 150 && blue < 120;
  return blueBorder || whiteText || yellowHilite;
}

function entryByFactory(frontier, factory) {
  return (frontier?.entries ?? []).find((entry) => entry.factory === factory);
}

function debugLog(message) {
  if (debugStartupVertical) {
    console.error(`[startup-vertical] ${message}`);
  }
}

function attachConsoleLogger(page, label) {
  if (!debugStartupVertical) {
    return;
  }
  page.on("console", (message) => {
    console.error(`[${label} console:${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    console.error(`[${label} pageerror] ${error.stack ?? error.message}`);
  });
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
  "Data\\INI\\Default\\CommandButton.ini",
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

const objectIniStartupEntries = [
  "Data\\INI\\Object\\AirforceGeneral.ini",
  "Data\\INI\\Object\\AmericaAir.ini",
  "Data\\INI\\Object\\AmericaCINEUnit.ini",
  "Data\\INI\\Object\\AmericaInfantry.ini",
  "Data\\INI\\Object\\AmericaMiscUnit.ini",
  "Data\\INI\\Object\\AmericaVehicle.ini",
  "Data\\INI\\Object\\BossGeneral.ini",
  "Data\\INI\\Object\\ChemicalGeneral.ini",
  "Data\\INI\\Object\\ChinaAir.ini",
  "Data\\INI\\Object\\ChinaCINEUnit.ini",
  "Data\\INI\\Object\\ChinaInfantry.ini",
  "Data\\INI\\Object\\ChinaMiscUnit.ini",
  "Data\\INI\\Object\\ChinaVehicle.ini",
  "Data\\INI\\Object\\CivilianBuilding.ini",
  "Data\\INI\\Object\\CivilianProp.ini",
  "Data\\INI\\Object\\CivilianUnit.ini",
  "Data\\INI\\Object\\DemoGeneral.ini",
  "Data\\INI\\Object\\FactionBuilding.ini",
  "Data\\INI\\Object\\FactionUnit.ini",
  "Data\\INI\\Object\\GC_Chem_GLABuildings.ini",
  "Data\\INI\\Object\\GC_Chem_GLASystem.ini",
  "Data\\INI\\Object\\GC_Chem_GLAUnits.ini",
  "Data\\INI\\Object\\GC_Slth_GLABuildings.ini",
  "Data\\INI\\Object\\GC_Slth_GLASystem.ini",
  "Data\\INI\\Object\\GC_Slth_GLAUnits.ini",
  "Data\\INI\\Object\\GLAAir.ini",
  "Data\\INI\\Object\\GLACINEUnit.ini",
  "Data\\INI\\Object\\GLAInfantry.ini",
  "Data\\INI\\Object\\GLAMiscUnit.ini",
  "Data\\INI\\Object\\GLAVehicle.ini",
  "Data\\INI\\Object\\Hulk.ini",
  "Data\\INI\\Object\\InfantryGeneral.ini",
  "Data\\INI\\Object\\LaserGeneral.ini",
  "Data\\INI\\Object\\NatureProp.ini",
  "Data\\INI\\Object\\NatureUnit.ini",
  "Data\\INI\\Object\\NukeGeneral.ini",
  "Data\\INI\\Object\\SpecialPowerObjects.ini",
  "Data\\INI\\Object\\StealthGeneral.ini",
  "Data\\INI\\Object\\SuperWeaponGeneral.ini",
  "Data\\INI\\Object\\System.ini",
  "Data\\INI\\Object\\TankGeneral.ini",
  "Data\\INI\\Object\\TechBuildings.ini",
  "Data\\INI\\Object\\WeaponObjects.ini",
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
  ...objectIniStartupEntries,
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

// Whole-file archive set for the REAL GameEngine::init() lifecycle run.
// Original Win32BIGFileSystem::init() enumerates *.big in the run directory;
// base-Generals archives mount under ZZBase_* so the ZH archives win the
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

// The 43 subsystems GameEngine::init() (GeneralsMD GameEngine.cpp) brings up
// through SubsystemInterfaceList::initSubsystem, in original order.
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

function assertRealEngineInit(realInit) {
  expect(realInit?.aborted === false, "real engine init aborted", {
    abortMessage: realInit?.abortMessage,
    releaseCrash: realInit?.releaseCrash,
    inFlightSubsystem: realInit?.inFlightSubsystem,
  });
  expect(realInit.releaseCrash === null, "real engine init hit RELEASE_CRASH", realInit.releaseCrash);
  const frontier = realInit.frontier;
  expect(frontier?.attempted === true && frontier.initReturned === true,
    "real GameEngine::init() did not return", frontier);
  expect(frontier.exceptionCaught === false, "real GameEngine::init() threw", frontier);
  expect(frontier.quittingAfterInit === false,
    "real GameEngine::init() set quitting", frontier);
  expect(frontier.subsystemCompletedCount === expectedRealInitSubsystems.length,
    "real init subsystem count mismatch", {
      expected: expectedRealInitSubsystems.length,
      actual: frontier.subsystemCompletedCount,
      completed: frontier.subsystemsCompleted,
    });
  expect(JSON.stringify(frontier.subsystemsCompleted) === JSON.stringify(expectedRealInitSubsystems),
    "real init subsystem order mismatch", frontier.subsystemsCompleted);
  expect(frontier.inFlightSubsystem === null,
    "real init left a subsystem in flight", frontier.inFlightSubsystem);
}

function assertRealEngineFrames(realFrames) {
  expect(realFrames?.aborted === false, "real engine frames aborted", {
    abortMessage: realFrames?.abortMessage,
    abortStack: realFrames?.abortStack,
    lastUpdateTarget: realFrames?.lastUpdateTarget,
    lastGameLogicStep: realFrames?.lastGameLogicStep,
    frame: realFrames?.frame,
  });
  const frame = realFrames.frame;
  expect(frame?.initReturned === true, "real engine frame ran without init", frame);
  expect(frame.framesCompleted >= 5 && frame.exceptionCaught === false,
    "real GameEngine::update() frames did not complete", frame);
  expect(frame.quitting === false, "real engine quit during frames", frame);
  const clientState = frame.clientState;
  expect(clientState?.globalDataReady === true
      && clientState.displayReady === true
      && clientState.shellReady === true
      && clientState.windowManagerReady === true,
    "real frame client subsystem state was not exported", clientState);
  expect(clientState.input?.windowReady === true,
    "real frame input window is not backed by the original WndProc", clientState.input);
  expect(clientState.gates?.playIntro === false,
    "real GameClient::update() did not consume the intro gate", clientState);
  const startedGame = Number(clientState.mainMenu?.debug?.doGameStartCount ?? 0) > 0;
  expect(clientState.display?.moviePlaying === true
      || clientState.shell?.screenCount > 0
      || startedGame,
    "real frames reached neither an intro/title movie, shell stack, nor real game-start transition",
    clientState);
  if (clientState.shell?.screenCount > 0 && !startedGame) {
    expect(clientState.shell.topIsMainMenu === true
        && clientState.mainMenu?.mainMenuParent?.found === true,
      "real shell stack did not expose MainMenu.wnd", clientState);
  }
}

const win32MouseMessages = Object.freeze({
  mouseMove: 0x0200,
  leftButtonDown: 0x0201,
  leftButtonUp: 0x0202,
});

const directInputKeys = Object.freeze({
  a: 0x1e,
});

const keyStates = Object.freeze({
  up: 0x0001,
  down: 0x0002,
});

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

async function runRealEngineFrames(page, frames) {
  const result = await page.evaluate((frameCount) =>
    window.CnCPort.rpc("realEngineFrame", { frames: frameCount }), frames);
  assertRealEngineFrames(result);
  return result;
}

const campaignIntroCounterWatches = [
  "CINE_MoveTo06Delay",
  "CINE_CameraCutTo04",
  "CINE_LaunchPadMoveDelay",
  "CINE_Pt2CameraLocation01Delay",
  "CINE_Pt2MoveTransportsDelay",
  "CINE_ScudSoundDelay",
  "CINE_BasePullOut01Delay",
  "CINE_BackToRocket01Delay",
  "CINE_BackToBaseDelay",
  "CINE_ZoomInMoreOnBaseDelay",
  "CINE_RocketAirShot01Delay",
  "CINE_BackToBaseYetAgainDelay",
  "CINE_ZoomInMoreOnBaseDelayAgain",
  "CINE_RocketAirShot02Delay",
  "CINE_LastBaseShotDelay",
  "CINE_BlowUp",
  "CINE_FlashWhiteDelay",
  "CINE_ReturnToPlayerStartDelay",
  "CINE_ReturnToPlayerStartDelay_2",
  "Give it back",
];

const campaignIntroCounterWatchNames = new Set(campaignIntroCounterWatches);

const campaignIntroFlagWatches = [
  "INTRO_DONE",
  "Inside Base",
  "Mission_Phase_Three",
];

const campaignIntroScriptWatches = [
  "CINE_CameraMoveTo06",
  "CINE_LaunchPad & BuggiesMove",
  "CINE_BasePos01",
  "CINE_MoveTransports",
  "CINE_BasePanTo01",
  "CINE_BackToUSBase",
  "CINE_ZoomInMoreOnBase",
  "CINE_BackToBaseYetAgain & DeleteRocketAir01",
  "CINE_ZoomInMoreOnBaseAgain",
  "CINE_LastBaseShot",
  "CINE_FlashWhite",
  "CINE_ReturnToPlayerLocation",
  "CINE_ReturnToPlayerLocation C",
  "Give Player The Game",
  "ReturnToPlayerControl",
];

const campaignIntroScriptWatchNames = new Set(campaignIntroScriptWatches);

const scriptTimerActionLayouts = Object.freeze({
  SET_TIMER: { counterIndex: 0, valueIndex: 1, units: "frames" },
  SET_RANDOM_TIMER: { counterIndex: 0, minIndex: 1, maxIndex: 2, units: "frames" },
  SET_MILLISECOND_TIMER: { counterIndex: 0, valueIndex: 1, units: "seconds" },
  SET_RANDOM_MSEC_TIMER: { counterIndex: 0, minIndex: 1, maxIndex: 2, units: "seconds" },
  ADD_TO_MSEC_TIMER: { counterIndex: 1, valueIndex: 0, units: "seconds" },
  SUB_FROM_MSEC_TIMER: { counterIndex: 1, valueIndex: 0, units: "seconds" },
});

const campaignIntroReleaseActionNames = new Set([
  "SET_FLAG",
  "ENABLE_SCRIPT",
  "CAMERA_LETTERBOX_END",
  "ENABLE_INPUT",
  "DRAW_SKYBOX_END",
]);

function namedEntry(entries, name) {
  return (entries ?? []).find((entry) => entry?.name === name);
}

function compactWatchedCounter(scriptDebug, name) {
  const counter = namedEntry(scriptDebug?.counters, name);
  return {
    name,
    found: counter != null,
    value: counter?.value,
    countdownTimer: counter?.countdownTimer,
  };
}

function compactCurrentCounter(scriptDebug, name) {
  const counter = namedEntry(scriptDebug?.counters, name);
  return {
    found: counter != null,
    value: counter?.value,
    countdownTimer: counter?.countdownTimer,
  };
}

function compactWatchedFlag(scriptDebug, name) {
  const flag = namedEntry(scriptDebug?.flags, name);
  return {
    name,
    found: flag != null,
    value: flag?.value,
  };
}

function compactCatalogScript(script) {
  return {
    name: script?.name,
    groupName: script?.groupName,
    active: script?.active,
    oneShot: script?.oneShot,
    priority: script?.priority,
    frameToEvaluate: script?.frameToEvaluate,
    delayEvalSeconds: script?.delayEvalSeconds,
    conditionTypes: (script?.conditions ?? [])
      .slice(0, 6)
      .map((condition) => condition.internalName),
    actionTypes: (script?.actions ?? [])
      .slice(0, 8)
      .map((action) => action.internalName),
  };
}

function scriptParameterValue(parameter) {
  if (parameter == null) {
    return undefined;
  }
  if (typeof parameter.string === "string" && parameter.string.length > 0) {
    return parameter.string;
  }
  if (parameter.typeName === "BOOLEAN") {
    return parameter.int !== 0;
  }
  if (parameter.typeName === "REAL" || parameter.typeName === "PERCENT") {
    return parameter.real;
  }
  if (parameter.typeName === "INT") {
    return parameter.int;
  }
  return parameter.real !== 0 ? parameter.real : parameter.int;
}

function scriptParameterString(parameter) {
  return typeof parameter?.string === "string" && parameter.string.length > 0
    ? parameter.string
    : undefined;
}

function compactTimerCondition(scriptDebug, condition) {
  const counter = scriptParameterString((condition?.parameters ?? [])[0]);
  return {
    condition: condition?.internalName,
    counter,
    current: counter !== undefined
      ? compactCurrentCounter(scriptDebug, counter)
      : undefined,
  };
}

function compactTimerAction(scriptDebug, action) {
  const layout = scriptTimerActionLayouts[action?.internalName];
  if (layout == null) {
    return null;
  }
  const parameters = action?.parameters ?? [];
  const counter = scriptParameterString(parameters[layout.counterIndex]);
  const compact = {
    index: action?.index,
    action: action?.internalName,
    counter,
    units: layout.units,
    current: counter !== undefined
      ? compactCurrentCounter(scriptDebug, counter)
      : undefined,
  };
  if (layout.valueIndex !== undefined) {
    compact.value = scriptParameterValue(parameters[layout.valueIndex]);
  }
  if (layout.minIndex !== undefined) {
    compact.min = scriptParameterValue(parameters[layout.minIndex]);
    compact.max = scriptParameterValue(parameters[layout.maxIndex]);
  }
  return compact;
}

function compactReleaseAction(action) {
  const parameters = action?.parameters ?? [];
  return {
    index: action?.index,
    action: action?.internalName,
    target: scriptParameterValue(parameters[0]),
    value: scriptParameterValue(parameters[1]),
  };
}

function scriptTouchesWatchedIntroGate(script) {
  const waitsOnWatchedCounter = (script?.conditions ?? [])
    .some((condition) =>
      condition?.internalName === "TIMER_EXPIRED"
        && campaignIntroCounterWatchNames.has(
          scriptParameterString((condition.parameters ?? [])[0])));
  const setsWatchedCounter = (script?.actions ?? [])
    .some((action) => {
      const layout = scriptTimerActionLayouts[action?.internalName];
      if (layout == null) {
        return false;
      }
      return campaignIntroCounterWatchNames.has(
        scriptParameterString((action.parameters ?? [])[layout.counterIndex]));
    });
  return waitsOnWatchedCounter || setsWatchedCounter;
}

function compactCampaignIntroReleaseScript(scriptDebug, script) {
  const timerConditions = (script?.conditions ?? [])
    .filter((condition) => condition?.internalName === "TIMER_EXPIRED")
    .map((condition) => compactTimerCondition(scriptDebug, condition));
  const timerActions = (script?.actions ?? [])
    .map((action) => compactTimerAction(scriptDebug, action))
    .filter((action) => action !== null);
  const releaseActions = (script?.actions ?? [])
    .filter((action) => campaignIntroReleaseActionNames.has(action?.internalName))
    .map((action) => compactReleaseAction(action));
  return {
    name: script?.name,
    groupName: script?.groupName,
    active: script?.active,
    oneShot: script?.oneShot,
    frameToEvaluate: script?.frameToEvaluate,
    waitTimers: timerConditions,
    timerActions,
    releaseActions,
  };
}

function summarizeCampaignIntroReleaseChain(scriptDebug) {
  const scripts = (scriptDebug?.catalog?.scripts ?? [])
    .filter((script) =>
      campaignIntroScriptWatchNames.has(script?.name) || scriptTouchesWatchedIntroGate(script))
    .map((script) => compactCampaignIntroReleaseScript(scriptDebug, script));
  const includedScripts = scripts.slice(0, 40);
  const activeTimerWaits = includedScripts
    .flatMap((script) => (script.waitTimers ?? []).map((timer) => ({
      script: script.name,
      active: script.active,
      counter: timer.counter,
      current: timer.current,
    })))
    .filter((timer) =>
      timer.active === true
        && timer.current?.found === true
        && (timer.current.countdownTimer === true || timer.current.value > 0))
    .slice(0, 12);
  return {
    includedCount: includedScripts.length,
    truncated: scripts.length > includedScripts.length,
    activeTimerWaits,
    scripts: includedScripts,
  };
}

function compactWatchedScript(scriptDebug, name) {
  const script = namedEntry(scriptDebug?.catalog?.scripts, name);
  return {
    ...compactCatalogScript(script),
    name,
    found: script != null,
  };
}

function summarizeCampaignIntroGates(scriptDebug) {
  return {
    counters: campaignIntroCounterWatches.map((name) =>
      compactWatchedCounter(scriptDebug, name)),
    flags: campaignIntroFlagWatches.map((name) =>
      compactWatchedFlag(scriptDebug, name)),
    scripts: campaignIntroScriptWatches.map((name) =>
      compactWatchedScript(scriptDebug, name)),
    releaseChain: summarizeCampaignIntroReleaseChain(scriptDebug),
  };
}

function summarizeRealEngineFrameChunk(result, requestedFrames) {
  const frame = result?.frame;
  const clientState = frame?.clientState;
  const gameplay = clientState?.gameplay;
  const scriptDebug = gameplay?.scriptDebug;
  const scriptCatalog = scriptDebug?.catalog;
  const controlBarParent = clientState?.controlBarWindows?.parent;
  return {
    requestedFrames,
    ok: result?.ok === true,
    framesCompleted: frame?.framesCompleted,
    framesAttempted: frame?.framesAttempted,
    exceptionCaught: frame?.exceptionCaught,
    lastUpdateTarget: frame?.lastUpdateTarget,
    lastGameLogicStep: frame?.lastGameLogicStep,
    textureDiagnostics: frame?.textureDiagnostics,
    display: {
      letterBoxed: clientState?.display?.letterBoxed,
      letterBoxFading: clientState?.display?.letterBoxFading,
      moviePlaying: clientState?.display?.moviePlaying,
    },
    view: {
      ready: clientState?.view?.ready,
      position: clientState?.view?.position,
      cameraPosition: clientState?.view?.cameraPosition,
      zoom: clientState?.view?.zoom,
      pitch: clientState?.view?.pitch,
      angle: clientState?.view?.angle,
      fieldOfView: clientState?.view?.fieldOfView,
      terrainHeightUnderCamera: clientState?.view?.terrainHeightUnderCamera,
      currentHeightAboveGround: clientState?.view?.currentHeightAboveGround,
      cameraMovementFinished: clientState?.view?.cameraMovementFinished,
      timeFrozen: clientState?.view?.timeFrozen,
      timeMultiplier: clientState?.view?.timeMultiplier,
      cameraLock: clientState?.view?.cameraLock,
    },
    gameplay: {
      inGame: gameplay?.inGame,
      inputEnabled: gameplay?.inputEnabled,
      logicFrame: gameplay?.logicFrame,
      objectCount: gameplay?.objectCount,
      drawableCount: gameplay?.drawableCount,
      localPlayerActive: gameplay?.localPlayer?.active,
      localPlayerSide: gameplay?.localPlayer?.side,
      scriptFade: gameplay?.fade,
      scriptFadeValue: gameplay?.fadeValue,
      scriptCounterCount: scriptDebug?.counterCount,
      scriptFlagCount: scriptDebug?.flagCount,
      scriptSequentialScriptCount: scriptDebug?.sequentialScriptCount,
      scriptCounters: (scriptDebug?.counters ?? []).slice(0, 8),
      scriptFlags: (scriptDebug?.flags ?? []).slice(0, 8),
      scriptSequentialScripts: (scriptDebug?.sequentialScripts ?? []).slice(0, 4),
      scriptCatalog: {
        ready: scriptCatalog?.ready,
        sideCount: scriptCatalog?.sideCount,
        groupCount: scriptCatalog?.groupCount,
        scriptCount: scriptCatalog?.scriptCount,
        interestingScriptCount: scriptCatalog?.interestingScriptCount,
        includedCount: scriptCatalog?.includedCount,
        includedTruncated: scriptCatalog?.includedTruncated,
        includedScripts: (scriptCatalog?.scripts ?? [])
          .slice(0, 8)
          .map((script) => ({
            sideIndex: script.sideIndex,
            groupName: script.groupName,
            name: script.name,
            active: script.active,
            oneShot: script.oneShot,
            frameToEvaluate: script.frameToEvaluate,
            actionTypes: (script.actions ?? [])
              .slice(0, 6)
              .map((action) => action.internalName),
            conditionTypes: (script.conditions ?? [])
              .slice(0, 6)
              .map((condition) => condition.internalName),
          })),
      },
      campaignIntroGates: summarizeCampaignIntroGates(scriptDebug),
    },
    controlBar: {
      found: controlBarParent?.found,
      hidden: controlBarParent?.hidden,
      managerHidden: controlBarParent?.managerHidden,
      clickable: controlBarParent?.clickable,
    },
  };
}

function summarizePlayerControlState(result) {
  const frame = result?.frame;
  const clientState = frame?.clientState;
  const gameplay = clientState?.gameplay;
  const scriptDebug = gameplay?.scriptDebug;
  const introDone = namedEntry(scriptDebug?.flags, "INTRO_DONE");
  const returnToPlayerControl = namedEntry(scriptDebug?.catalog?.scripts, "ReturnToPlayerControl");
  const controlBarParent = clientState?.controlBarWindows?.parent;
  return {
    framesCompleted: frame?.framesCompleted,
    logicFrame: gameplay?.logicFrame,
    inGame: gameplay?.inGame,
    inputEnabled: gameplay?.inputEnabled,
    introDone: introDone?.value,
    letterBoxed: clientState?.display?.letterBoxed,
    letterBoxFading: clientState?.display?.letterBoxFading,
    controlBarFound: controlBarParent?.found,
    controlBarHidden: controlBarParent?.hidden,
    controlBarManagerHidden: controlBarParent?.managerHidden,
    controlBarClickable: controlBarParent?.clickable,
    selectCount: gameplay?.selectCount,
    selectedControllable: gameplay?.selectedControllable,
    returnToPlayerControlActive: returnToPlayerControl?.active,
    returnToPlayerControlFrameToEvaluate: returnToPlayerControl?.frameToEvaluate,
    textureDiagnostics: frame?.textureDiagnostics,
  };
}

function playerControlStateReached(state) {
  return state.inGame === true
    && state.inputEnabled === true
    && state.introDone === true
    && state.letterBoxed === false
    && state.controlBarFound === true
    && state.controlBarHidden === false
    && state.controlBarManagerHidden === false
    && state.controlBarClickable === true;
}

async function runRealEngineFrameBatches(page, totalFrames, chunkFrames) {
  if (chunkFrames <= 0 || chunkFrames >= totalFrames) {
    return runRealEngineFrames(page, totalFrames);
  }

  const chunks = [];
  let lastResult = null;
  for (let remaining = totalFrames; remaining > 0;) {
    const frames = Math.min(chunkFrames, remaining);
    lastResult = await runRealEngineFrames(page, frames);
    const summary = summarizeRealEngineFrameChunk(lastResult, frames);
    chunks.push(summary);
    console.error("[vertical] post-campaign chunk", JSON.stringify(summary));
    remaining -= frames;
  }

  return {
    ...lastResult,
    chunked: {
      totalFrames,
      chunkFrames,
      chunks,
    },
  };
}

async function runRealEngineFramesUntilPlayerControl(page, maxFrames, chunkFrames) {
  const framesPerChunk = chunkFrames > 0 ? chunkFrames : 60;
  const chunks = [];
  let lastResult = null;
  let framesRun = 0;
  for (let remaining = maxFrames; remaining > 0;) {
    const frames = Math.min(framesPerChunk, remaining);
    lastResult = await runRealEngineFrames(page, frames);
    framesRun += frames;
    const summary = summarizeRealEngineFrameChunk(lastResult, frames);
    const playerControl = summarizePlayerControlState(lastResult);
    const reached = playerControlStateReached(playerControl);
    const chunk = {
      ...summary,
      playerControl,
      reachedPlayerControl: reached,
    };
    chunks.push(chunk);
    console.error("[vertical] post-campaign player-control chunk", JSON.stringify(chunk));
    if (reached) {
      return {
        ...lastResult,
        reachedPlayerControl: true,
        playerControl,
        chunked: {
          totalFrames: framesRun,
          maxFrames,
          chunkFrames: framesPerChunk,
          chunks,
        },
      };
    }
    remaining -= frames;
  }

  return {
    ...lastResult,
    reachedPlayerControl: false,
    playerControl: summarizePlayerControlState(lastResult),
    chunked: {
      totalFrames: framesRun,
      maxFrames,
      chunkFrames: framesPerChunk,
      chunks,
    },
  };
}

async function runRealEngineFramesUnchecked(page, frames) {
  return page.evaluate((frameCount) =>
    window.CnCPort.rpc("realEngineFrame", { frames: frameCount }), frames);
}

async function setRealEngineUpdateBreakpoint(page, target) {
  const result = await page.evaluate((breakpointTarget) =>
    window.CnCPort.rpc("realEngineUpdateBreakpoint", { target: breakpointTarget }), target);
  expect(result?.ok === true,
    "real engine update breakpoint could not be set",
    result);
  return result;
}

async function setRealEngineGameLogicBreakpoint(page, step) {
  const result = await page.evaluate((breakpointStep) =>
    window.CnCPort.rpc("realEngineGameLogicBreakpoint", { step: breakpointStep }), step);
  expect(result?.ok === true,
    "real engine GameLogic breakpoint could not be set",
    result);
  return result;
}

async function postRealEngineMouseMessage(page, message, point) {
  const result = await page.evaluate((payload) =>
    window.CnCPort.rpc("postMessage", payload), {
    message,
    lParam: win32PointLParam(point),
    point,
  });
  expect(result?.ok === true, "real engine mouse message was not posted", result);
  return result;
}

async function waitForBrowserDirectInputQueue(page, expectedCount, label) {
  const handle = await page.waitForFunction((count) =>
    (window.CnCPort?.state?.browserDirectInput?.queuedKeyCount ?? 0) >= count,
    expectedCount,
    { timeout: 5000 });
  const queued = await handle.jsonValue();
  expect(queued === true, `${label} did not queue DirectInput key input`, {
    expectedCount,
    directInput: await page.evaluate(() => window.CnCPort?.state?.browserDirectInput),
  });
}

function assertRealKeyboardFrame(frameResult, expectedKey, expectedState, label) {
  const keyboard = frameResult?.frame?.clientState?.input?.keyboard;
  expect(keyboard?.ready === true,
    `${label} did not have the original keyboard singleton ready`, keyboard);
  expect(keyboard.pendingDInputKeys === 0,
    `${label} left DirectInput keys queued after the real frame`, keyboard);
  expect(keyboard.eventCount >= 1
      && keyboard.firstKey === expectedKey
      && (keyboard.firstState & expectedState) !== 0,
    `${label} did not reach the original DirectInputKeyboard update path`,
    keyboard);
}

async function sampleViewportPixels(page, points) {
  return page.evaluate((samplePoints) => {
    const canvas = document.querySelector("#viewport");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, error: "viewport canvas is missing" };
    }
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl == null) {
      return { ok: false, error: "viewport WebGL context is missing" };
    }
    const pixels = {};
    const pixel = new Uint8Array(4);
    for (const point of samplePoints) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y)));
      gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      pixels[point.name] = Array.from(pixel);
    }
    return { ok: true, width: canvas.width, height: canvas.height, pixels };
  }, points);
}

async function assertRealMenuCanvasVisible(page, label) {
  const probe = await sampleViewportPixels(page, [
    { name: "gameButtonCenter", x: 644, y: 134 },
    { name: "gameButtonBorder", x: 540, y: 116 },
    { name: "scaledButtonCenter", x: 1030, y: 146 },
    { name: "scaledButtonBorder", x: 870, y: 130 },
    { name: "scaledSecondButtonCenter", x: 1030, y: 190 },
  ]);
  expect(probe.ok === true, "real MainMenu canvas pixels could not be sampled", probe);
  const coloredSamples = Object.values(probe.pixels ?? {}).filter((pixel) =>
    pixelLooksLikeMenuChrome(pixel));
  expect(coloredSamples.length > 0,
    `${label} did not render visible MainMenu pixels over the stale title screen`,
    probe);
  return probe;
}

async function revealRealEngineMainMenu(page, button) {
  expect(button?.found === true
      && Number.isFinite(button.centerX)
      && Number.isFinite(button.centerY),
    "real engine menu button geometry is not available for reveal movement", button);
  const seedPoint = { x: 32, y: 32 };
  const revealPoint = { x: 96, y: 96 };

  await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, seedPoint);
  let seedFrame = await runRealEngineFrames(page, 1);
  for (let frameIndex = 0;
      frameIndex < 8
        && (seedFrame.frame?.clientState?.input?.mouse?.x !== seedPoint.x
          || seedFrame.frame?.clientState?.input?.mouse?.y !== seedPoint.y);
      frameIndex += 1) {
    seedFrame = await runRealEngineFrames(page, 1);
  }
  expect(seedFrame.frame?.clientState?.input?.mouse?.x === seedPoint.x
      && seedFrame.frame?.clientState?.input?.mouse?.y === seedPoint.y,
    "real MainMenu reveal seed movement did not reach the original mouse state",
    { seedPoint, seedFrame: seedFrame.frame?.clientState?.input });

  await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, revealPoint);
  let revealFrame = await runRealEngineFrames(page, 1);

  for (let frameIndex = 0;
      frameIndex < 90
        && (revealFrame.frame?.clientState?.input?.mouse?.x !== revealPoint.x
          || revealFrame.frame?.clientState?.input?.mouse?.y !== revealPoint.y
          || revealFrame.frame?.clientState?.transition?.finished !== true
          || !realMenuHitMatches(
            revealFrame.frame?.clientState?.mainMenu,
            "underButtonSinglePlayerCenter",
            "buttonSinglePlayer")
          || revealFrame.frame?.clientState?.input?.mouse?.visible !== true);
      frameIndex += 1) {
    revealFrame = await runRealEngineFrames(page, 1);
  }

  const revealedMenu = revealFrame.frame?.clientState?.mainMenu;
  expect(revealFrame.frame?.clientState?.input?.mouse?.x === revealPoint.x
      && revealFrame.frame?.clientState?.input?.mouse?.y === revealPoint.y,
    "real MainMenu reveal movement did not reach the original mouse state",
    { revealPoint, revealFrame: revealFrame.frame?.clientState?.input });
  expect(revealFrame.frame?.clientState?.transition?.finished === true,
    "real MainMenu first-run transition did not finish after reveal movement",
    { seedPoint, revealPoint, seedFrame: seedFrame.frame?.clientState, revealFrame: revealFrame.frame?.clientState });
  expect(realMenuHitMatches(revealedMenu, "underButtonSinglePlayerCenter", "buttonSinglePlayer"),
    "real MainMenu reveal did not align the visible default button with engine hit-testing",
    { seedPoint, revealPoint, seedFrame: seedFrame.frame?.clientState, revealFrame: revealFrame.frame?.clientState });
  expect(revealFrame.frame?.clientState?.input?.mouse?.visible === true,
    "real MainMenu reveal did not restore the mouse cursor", revealFrame.frame?.clientState?.input);
  expect(revealFrame.frame?.clientState?.gates?.breakTheMovie === false,
    "real MainMenu reveal left the stale movie-break render gate set",
    revealFrame.frame?.clientState?.gates);
  const clickTarget = {
    button: revealedMenu?.buttonSinglePlayer,
    hitProbe: revealedMenu?.underButtonSinglePlayerCenter,
  };
  return { seedPoint, revealPoint, seedFrame, revealFrame, clickTarget };
}

function assertRealMenuClickOutcome(clickedMenu, expectedTarget) {
  const targetName = expectedTarget?.decoratedName || expectedTarget?.name || "";
  if (targetName.includes(":ButtonSinglePlayer")) {
    expect(clickedMenu?.mapBorderSinglePlayer?.managerHidden === false
        && clickedMenu?.buttonSingleBack?.clickable === true
        && clickedMenu?.buttonUSA?.clickable === true,
      "real ButtonSinglePlayer click did not leave single-player controls reachable",
      clickedMenu);
    return;
  }
  if (targetName.includes(":ButtonUSA")) {
    expect(clickedMenu?.mapBorderDifficulty?.managerHidden === false
        && clickedMenu?.buttonEasy?.clickable === true
        && clickedMenu?.buttonMedium?.clickable === true
        && clickedMenu?.buttonHard?.clickable === true
        && clickedMenu?.buttonDiffBack?.clickable === true,
      "real ButtonUSA click did not leave difficulty controls reachable",
      clickedMenu);
    return;
  }
  expect(false,
    "real menu click used an unsupported target",
    { expectedTarget, clickedMenu });
}

function realMenuHitMatches(menu, hitProbeName, buttonFieldName) {
  const hitWindow = menu?.[hitProbeName]?.window;
  const button = menu?.[buttonFieldName];
  return button?.clickable === true
    && hitWindow?.found === true
    && hitWindow.id === button.id;
}

async function waitForRealTransitionIdle(page, label, maxFrames = 90) {
  const attempts = [];
  for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
    const frame = await runRealEngineFrames(page, 1);
    attempts.push({
      framesCompleted: frame.frame?.framesCompleted,
      transition: frame.frame?.clientState?.transition,
      underButtonSinglePlayerCenter:
        frame.frame?.clientState?.mainMenu?.underButtonSinglePlayerCenter?.window?.decoratedName,
      underButtonUSACenter:
        frame.frame?.clientState?.mainMenu?.underButtonUSACenter?.window?.decoratedName,
      underButtonEasyCenter:
        frame.frame?.clientState?.mainMenu?.underButtonEasyCenter?.window?.decoratedName,
    });
    if (frame.frame?.clientState?.transition?.ready === true
        && frame.frame.clientState.transition.finished === true) {
      return frame;
    }
  }
  expect(false, `${label} transition did not finish in real engine frames`, attempts);
}

function collectRealMenuWindows(clientState) {
  const windows = [];
  const mainMenu = clientState?.mainMenu ?? {};
  for (const value of Object.values(mainMenu)) {
    if (value?.found === true && Number.isFinite(value.id)) {
      windows.push(value);
    }
    if (value?.window?.found === true && Number.isFinite(value.window.id)) {
      windows.push(value.window);
    }
  }
  for (const field of ["focusWindow", "captureWindow", "grabWindow"]) {
    const windowRef = clientState?.input?.[field];
    if (windowRef?.found === true && Number.isFinite(windowRef.id)) {
      windows.push(windowRef);
    }
  }
  return windows;
}

function findRealMenuWindowById(clientState, id) {
  return collectRealMenuWindows(clientState).find((windowRef) => windowRef.id === id);
}

function compactRealClickProbe(frameResult, targetId) {
  const clientState = frameResult?.frame?.clientState;
  return {
    framesCompleted: frameResult?.frame?.framesCompleted,
    mouse: clientState?.input?.mouse,
    grabWindow: clientState?.input?.grabWindow,
    target: findRealMenuWindowById(clientState, targetId),
  };
}

async function waitForRealMenuButtonDown(page, expectedTarget, maxFrames = 8) {
  const attempts = [];
  for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
    const frame = await runRealEngineFrames(page, 1);
    const downClient = frame.frame?.clientState;
    const downTarget = findRealMenuWindowById(downClient, expectedTarget.id);
    const downGrab = downClient?.input?.grabWindow;
    attempts.push(compactRealClickProbe(frame, expectedTarget.id));
    if (downGrab?.id === expectedTarget.id && downTarget?.selected === true) {
      return { frame, downClient, downGrab, downTarget, attempts };
    }
  }
  expect(false,
    "real menu mouse down did not grab and select the hit-tested button",
    { expectedTarget, attempts });
}

async function waitForRealMenuButtonReleased(page, expectedTarget, maxFrames = 8) {
  const attempts = [];
  let lastFrame = null;
  for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
    lastFrame = await runRealEngineFrames(page, 1);
    const finalTarget = findRealMenuWindowById(lastFrame.frame?.clientState, expectedTarget.id);
    attempts.push(compactRealClickProbe(lastFrame, expectedTarget.id));
    if (finalTarget == null || finalTarget.selected === false) {
      return { frame: lastFrame, finalTarget, attempts };
    }
  }
  expect(false,
    "real menu mouse up did not release the hit-tested button selection",
    { expectedTarget, attempts });
}

async function clickRealEngineMenuButton(page, button, hitProbe, settleFrames = 90) {
  expect(button?.clickable === true, "real engine menu button is not clickable", button);
  const point = hitProbe?.point ?? { x: button.centerX, y: button.centerY };
  const expectedTarget = hitProbe?.window?.found === true ? hitProbe.window : button;
  expect(expectedTarget?.clickable === true,
    "real engine menu hit test did not resolve a clickable target", { button, hitProbe });
  const targetName = expectedTarget.decoratedName || expectedTarget.name || "";
  expect(targetName.includes(":Button"),
    "real engine menu hit test did not resolve a button", { button, hitProbe, expectedTarget });

  await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, point);
  await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonDown, point);
  const down = await waitForRealMenuButtonDown(page, expectedTarget);

  await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonUp, point);
  const up = await waitForRealMenuButtonReleased(page, expectedTarget);
  const finalFrame = settleFrames == null
    ? up.frame
    : await waitForRealTransitionIdle(
      page,
      `real menu ${targetName} click`,
      settleFrames); // lets original menu transitions settle after button-up.
  return { point, expectedTarget, down, up, finalFrame };
}

function compactCampaignStartProbe(frameResult) {
  const clientState = frameResult?.frame?.clientState;
  return {
    framesCompleted: frameResult?.frame?.framesCompleted,
    transition: clientState?.transition,
    shell: clientState?.shell,
    debug: clientState?.mainMenu?.debug,
    top: {
      filename: clientState?.shell?.topFilename,
      hidden: clientState?.shell?.topHidden,
      screenCount: clientState?.shell?.screenCount,
    },
  };
}

async function waitForRealCampaignGameStart(page, baselineDebug, label, maxFrames = 240) {
  const baseline = {
    checkCDCount: Number(baselineDebug?.checkCDCount ?? 0),
    prepareCampaignCount: Number(baselineDebug?.prepareCampaignCount ?? 0),
    setupGameStartCount: Number(baselineDebug?.setupGameStartCount ?? 0),
    doGameStartCount: Number(baselineDebug?.doGameStartCount ?? 0),
  };
  const attempts = [];
  for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
    const frame = await runRealEngineFrames(page, 1);
    const debug = frame.frame?.clientState?.mainMenu?.debug;
    attempts.push(compactCampaignStartProbe(frame));

    if (Number(debug?.checkCDCount ?? 0) > baseline.checkCDCount
        && Number(debug?.lastCDPresent ?? 0) !== 1
        && Number(debug?.prepareCampaignCount ?? 0) <= baseline.prepareCampaignCount) {
      expect(false,
        `${label} stopped at the original insert-CD check instead of using browser-mounted assets`,
        { baseline, frame: compactCampaignStartProbe(frame), attempts });
    }

    if (Number(debug?.prepareCampaignCount ?? 0) > baseline.prepareCampaignCount
        && Number(debug?.setupGameStartCount ?? 0) > baseline.setupGameStartCount
        && Number(debug?.doGameStartCount ?? 0) > baseline.doGameStartCount
        && Number(debug?.lastCDPresent ?? 0) === 1
        && Number(debug?.lastPrepareDifficulty ?? -1) === gameDifficulties.easy
        && Number(debug?.lastSetupDifficulty ?? -1) === gameDifficulties.easy
        && Number(debug?.lastNewGameMode ?? -1) === gameModes.singlePlayer
        && Number(debug?.lastNewGameDifficulty ?? -1) === gameDifficulties.easy
        && typeof debug?.lastPendingFile === "string"
        && debug.lastPendingFile.length > 0
        && debug.lastPendingFile === debug.lastSetupMap) {
      return { frame, attempts };
    }
  }

  expect(false,
    `${label} did not reach original doGameStart()/MSG_NEW_GAME queueing`,
    { baseline, attempts });
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
  expect(probe.status === "base_function_lexicon_remaining_callback_groups_deferred",
    "function lexicon runtime status mismatch", probe);
  expect(probe.nextRequired === "originalFunctionLexiconRemainingCallbackOwners",
    "function lexicon runtime nextRequired mismatch", probe);
  expect(probe.missingCallbackGroupCount === 13
      && probe.missingCallbackGroups?.saveLoadMenu === true
      && probe.missingCallbackGroups.quitMenu === true
      && probe.missingCallbackGroups.popupReplayScoreState === true
      && probe.missingCallbackGroups.scoreScreen === true
      && probe.missingCallbackGroups.controlBarCommandHud === true
      && probe.missingCallbackGroups.generalsExpPoints === true
      && probe.missingCallbackGroups.lanMenus === true
      && probe.missingCallbackGroups.inGameNetworkMenus === true
      && probe.missingCallbackGroups.hostJoinNetworkPopups === true
      && probe.missingCallbackGroups.onlineOverlayAndBattleHonors === true
      && probe.missingCallbackGroups.wolShellMenus === true
      && probe.missingCallbackGroups.networkDirectConnect === true
      && probe.missingCallbackGroups.downloadMenu === true,
    "function lexicon runtime did not report the expected remaining owner groups", probe);
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
      && probe.lookups.motdSystem === true
      && probe.lookups.mainMenuSystem === true
      && probe.lookups.optionsMenuSystem === true
      && probe.lookups.creditsMenuSystem === true
      && probe.lookups.skirmishGameOptionsMenuSystem === true
      && probe.lookups.skirmishMapSelectMenuSystem === true
      && probe.lookups.singlePlayerMenuSystem === true
      && probe.lookups.challengeMenuSystem === true
      && probe.lookups.popupCommunicatorSystem === true
      && probe.lookups.mapSelectMenuSystem === true
      && probe.lookups.replayMenuSystem === true
      && probe.lookups.difficultySelectSystem === true
      && probe.lookups.keyboardOptionsMenuSystem === true
      && probe.lookups.inGamePopupMessageSystem === true
      && probe.lookups.idleWorkerSystem === true
      && probe.lookups.replayControlSystem === true
      && probe.lookups.controlBarObserverSystem === true
      && probe.lookups.gameInfoWindowSystem === true
      && probe.lookups.gameWindowDefaultInput === true
      && probe.lookups.gameWinBlockInput === true
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
      && probe.lookups.optionsMenuInput === true
      && probe.lookups.creditsMenuInput === true
      && probe.lookups.skirmishGameOptionsMenuInput === true
      && probe.lookups.skirmishMapSelectMenuInput === true
      && probe.lookups.singlePlayerMenuInput === true
      && probe.lookups.challengeMenuInput === true
      && probe.lookups.popupCommunicatorInput === true
      && probe.lookups.mapSelectMenuInput === true
      && probe.lookups.replayMenuInput === true
      && probe.lookups.popupReplayInput === true
      && probe.lookups.difficultySelectInput === true
      && probe.lookups.keyboardOptionsMenuInput === true
      && probe.lookups.inGamePopupMessageInput === true
      && probe.lookups.controlBarInput === true
      && probe.lookups.beaconWindowInput === true
      && probe.lookups.replayControlInput === true
      && probe.lookups.gameWindowDefaultTooltip === true
      && probe.lookups.imeCandidateMainDraw === true
      && probe.lookups.imeCandidateTextAreaDraw === true
      && probe.lookups.mainMenuInit === true
      && probe.lookups.optionsMenuInit === true
      && probe.lookups.creditsMenuInit === true
      && probe.lookups.skirmishGameOptionsMenuInit === true
      && probe.lookups.skirmishMapSelectMenuInit === true
      && probe.lookups.singlePlayerMenuInit === true
      && probe.lookups.challengeMenuInit === true
      && probe.lookups.popupCommunicatorInit === true
      && probe.lookups.mapSelectMenuInit === true
      && probe.lookups.replayMenuInit === true
      && probe.lookups.gameInfoWindowInit === true
      && probe.lookups.popupReplayInit === true
      && probe.lookups.difficultySelectInit === true
      && probe.lookups.keyboardOptionsMenuInit === true
      && probe.lookups.inGamePopupMessageInit === true
      && probe.lookups.mainMenuUpdate === true
      && probe.lookups.optionsMenuUpdate === true
      && probe.lookups.creditsMenuUpdate === true
      && probe.lookups.skirmishGameOptionsMenuUpdate === true
      && probe.lookups.skirmishMapSelectMenuUpdate === true
      && probe.lookups.singlePlayerMenuUpdate === true
      && probe.lookups.challengeMenuUpdate === true
      && probe.lookups.mapSelectMenuUpdate === true
      && probe.lookups.replayMenuUpdate === true
      && probe.lookups.keyboardOptionsMenuUpdate === true
      && probe.lookups.mainMenuShutdown === true
      && probe.lookups.optionsMenuShutdown === true
      && probe.lookups.creditsMenuShutdown === true
      && probe.lookups.skirmishGameOptionsMenuShutdown === true
      && probe.lookups.skirmishMapSelectMenuShutdown === true
      && probe.lookups.singlePlayerMenuShutdown === true
      && probe.lookups.challengeMenuShutdown === true
      && probe.lookups.popupCommunicatorShutdown === true
      && probe.lookups.mapSelectMenuShutdown === true
      && probe.lookups.replayMenuShutdown === true
      && probe.lookups.keyboardOptionsMenuShutdown === true
      && probe.lookups.popupReplayShutdown === true
      && probe.lookups.w3dGadgetPushButtonDraw === true
      && probe.lookups.w3dGameWindowDefaultDraw === true
      && probe.lookups.w3dMainMenuInit === true,
    "FunctionLexicon widget/draw/layout/W3D callback lookups did not resolve", probe.lookups);
}

function assertModuleFactoryRuntimeFrontier(state) {
  const probe = state.moduleFactoryRuntime;
  expect(probe?.attempted === true, "module factory runtime probe did not run", probe);
  expect(probe.ok === true, "module factory runtime did not report ready", probe);
  expect(probe.status === "ready", "module factory runtime status mismatch", probe);
  expect(probe.nextRequired === "createParticleSystemManager",
    "module factory runtime nextRequired mismatch", probe);
  expect(probe.constructed === true && probe.theModuleFactoryOwned === true,
    "original W3DModuleFactory was not constructed as TheModuleFactory", probe);
  expect(probe.initRan === true && probe.initThrew === false,
    "original W3DModuleFactory::init() did not complete", probe);
  expect(probe.gameEngineInit?.factory === "createModuleFactory"
      && probe.gameEngineInit.line === 447
      && probe.gameEngineInit.originalConcrete === "W3DModuleFactory",
    "GameEngine.cpp createModuleFactory ownership mismatch", probe);
  expect(probe.lookups?.activeBody === true
      && probe.lookups.destroyDie === true
      && probe.lookups.inactiveBody === true
      && probe.lookups.beaconClientUpdate === true
      && probe.lookups.w3dDefaultDraw === true
      && probe.lookups.w3dModelDraw === true
      && probe.lookups.w3dLaserDraw === true
      && probe.lookups.w3dPropDraw === true,
    "ModuleFactory gameplay/client-update/W3D draw lookups did not resolve", probe.lookups);
}

function assertParticleSystemRuntimeFrontier(state) {
  const probe = state.particleSystemRuntime;
  expect(probe?.attempted === true, "particle system runtime probe did not run", probe);
  expect(probe.ok === true, "particle system runtime did not report ready", probe);
  expect(probe.status === "ready", "particle system runtime status mismatch", probe);
  expect(probe.nextRequired === "createThingFactory",
    "particle system runtime nextRequired mismatch", probe);
  expect(probe.constructed === true
      && probe.w3dManagerConstructed === true
      && probe.theParticleSystemManagerOwned === true,
    "original W3DParticleSystemManager was not constructed as TheParticleSystemManager", probe);
  expect(probe.initRan === true && probe.initThrew === false,
    "original W3DParticleSystemManager::init() did not complete", probe);
  expect(probe.gameEngineInit?.factory === "createParticleSystemManager"
      && probe.gameEngineInit.line === 453
      && probe.gameEngineInit.originalConcrete === "W3DParticleSystemManager",
    "GameEngine.cpp createParticleSystemManager ownership mismatch", probe);
  expect(probe.queueParticleRenderCalled === true,
    "W3DParticleSystemManager virtual queue path was not exercised", probe);
  expect(probe.templateCount > 100
      && probe.templates?.tsingMaTrailSmoke === true
      && probe.templates.jetContrailThin === true
      && probe.templates.toxinLenzflare === true
      && probe.templates.smallTankStruckSmoke === true
      && probe.templates.nukeMushroomRing === true,
    "ParticleSystem.ini template load did not resolve expected shipped templates", probe);
  expect(probe.zeroLiveSystems === true && probe.zeroLiveParticles === true,
    "particle manager should only own templates during startup init", probe);
}

function lookupByName(lookups, name) {
  return (lookups ?? []).find((entry) => entry?.name === name);
}

function assertObjectIniThingFactoryRuntime(probe, context) {
  expect(probe?.attempted === true
      && probe.ok === true
      && probe.stage === "done"
      && probe.error === "",
    `${context} object INI runtime did not finish cleanly`, probe);
  expect(probe.source === "GameEngine.cpp::init initSubsystem(TheThingFactory) + "
      + "W3DModuleFactory::init + ThingFactory::parseObjectDefinition + INI.cpp::load/loadDirectory",
    `${context} object INI runtime source mismatch`, probe);
  expect(probe.loadedArchives === true
      && probe.defaultObjectIniExists === true
      && probe.defaultObjectIniBytes === 5530
      && probe.defaultObjectIniLoaded === true
      && probe.objectDirectoryLoaded === true
      && probe.objectIniFileCount === 43
      && probe.fileSystemObjectIniFileCount === 43
      && probe.objectIniFilesLoaded === 43,
    `${context} object INI file coverage mismatch`, probe);
  expect(probe.gameDataLoaded === true
      && probe.gameTextCsfLoaded === true
      && probe.scienceLoaded === true
      && probe.particleSystemLoaded === true
      && probe.fxListLoaded === true
      && probe.weaponLoaded === true
      && probe.objectCreationListLoaded === true
      && probe.locomotorLoaded === true
      && probe.specialPowerLoaded === true
      && probe.damageFXLoaded === true
      && probe.armorLoaded === true,
    `${context} object-template prerequisite stores did not load`, probe);
  expect(probe.moduleFactoryInitialized === true
      && probe.moduleFactoryIsW3D === true
      && probe.hasW3DDefaultDraw === true
      && probe.hasW3DModelDraw === true
      && probe.hasDestroyDie === true
      && probe.hasInactiveBody === true
      && probe.hasAIUpdateInterface === true
      && probe.hasGarrisonContain === true
      && probe.thingFactoryIsW3D === true,
    `${context} W3D module/thing factory ownership mismatch`, probe);
  expect(Number.isInteger(probe.templateCount) && probe.templateCount >= 1800,
    `${context} object template count too low`, probe);

  const humvee = lookupByName(probe.lookups, "AmericaVehicleHumvee");
  const rebel = lookupByName(probe.lookups, "GLAInfantryRebel");
  const raptor = lookupByName(probe.lookups, "AmericaJetRaptor");
  const overlord = lookupByName(probe.lookups, "ChinaTankOverlord");
  expect(lookupByName(probe.lookups, "DefaultThingTemplate")?.found === true,
    `${context} DefaultThingTemplate lookup failed`, probe.lookups);
  expect(humvee?.found === true
      && humvee.side === "America"
      && humvee.buildCost === 700
      && humvee.transportSlotCount === 3
      && humvee.isVehicle === true
      && humvee.isInfantry === false
      && humvee.isSelectable === true,
    `${context} AmericaVehicleHumvee fields mismatch`, humvee);
  expect(rebel?.found === true
      && rebel.side === "GLA"
      && rebel.buildCost === 150
      && rebel.transportSlotCount === 1
      && rebel.isVehicle === false
      && rebel.isInfantry === true
      && rebel.isSelectable === true,
    `${context} GLAInfantryRebel fields mismatch`, rebel);
  expect(raptor?.found === true && overlord?.found === true,
    `${context} representative vehicle/aircraft template lookup failed`, probe.lookups);
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
      && frontier.functionLexiconRuntime.status === "base_function_lexicon_remaining_callback_groups_deferred"
      && frontier.functionLexiconRuntime.w3dDeviceDrawReady === true
      && frontier.functionLexiconRuntime.w3dLayoutInitReady === true
      && frontier.functionLexiconRuntime.messageBoxSystemReady === true
      && frontier.functionLexiconRuntime.nextRequired === "originalFunctionLexiconRemainingCallbackOwners"
      && frontier.functionLexiconRuntime.missingCallbackGroupCount === 13,
    "frontier functionLexiconRuntime summary mismatch", frontier.functionLexiconRuntime);
  expect(frontier.moduleFactoryRuntime?.ready === true
      && frontier.moduleFactoryRuntime.status === "ready"
      && frontier.moduleFactoryRuntime.baseBehaviorReady === true
      && frontier.moduleFactoryRuntime.clientUpdateReady === true
      && frontier.moduleFactoryRuntime.w3dDrawReady === true
      && frontier.moduleFactoryRuntime.nextRequired === "createParticleSystemManager",
    "frontier moduleFactoryRuntime summary mismatch", frontier.moduleFactoryRuntime);
  expect(frontier.particleSystemRuntime?.ready === true
      && frontier.particleSystemRuntime.status === "ready"
      && frontier.particleSystemRuntime.w3dManagerReady === true
      && frontier.particleSystemRuntime.templateCount > 100
      && frontier.particleSystemRuntime.templateLookupsReady === true
      && frontier.particleSystemRuntime.zeroLiveSystems === true
      && frontier.particleSystemRuntime.nextRequired === "createThingFactory",
    "frontier particleSystemRuntime summary mismatch", frontier.particleSystemRuntime);
  expect(entryByFactory(frontier, "createModuleFactory")?.ready === true
      && entryByFactory(frontier, "createModuleFactory")?.status === "browser_runtime_initialized_original_w3d_module_factory",
    "createModuleFactory frontier entry should be runtime-owned", frontier);
  expect(entryByFactory(frontier, "createParticleSystemManager")?.ready === true
      && entryByFactory(frontier, "createParticleSystemManager")?.status === "browser_runtime_initialized_original_w3d_particle_system_manager",
    "createParticleSystemManager frontier entry should be runtime-owned", frontier);
  expect(entryByFactory(frontier, "createThingFactory")?.ready === false
      && entryByFactory(frontier, "createThingFactory")?.status === "needs_browser_thing_factory",
    "createThingFactory frontier entry should remain blocked until FunctionLexicon is fully owned",
    frontier);
  expect(startup.browserDeviceLayer?.functionLexicon === false,
    "browser device layer should not mark the full function lexicon runtime-owned", startup.browserDeviceLayer);
  expect(startup.browserDeviceLayer.moduleFactory === true,
    "browser device layer should mark the module factory runtime-owned", startup.browserDeviceLayer);
  expect(startup.browserDeviceLayer.particleSystemManager === true,
    "browser device layer should mark the particle system manager runtime-owned", startup.browserDeviceLayer);
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
  expect(browserLayer.moduleFactory === false,
    "browser module factory should not be runtime-ready without archives", browserLayer);
  expect(browserLayer.particleSystemManager === false,
    "browser particle system manager should not be runtime-ready without archives", browserLayer);
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

  expect(entryByFactory(frontier, "CreateGameEngine")?.line === 1125,
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
  expect(frontier.moduleFactoryRuntime?.attempted === true
      && frontier.moduleFactoryRuntime.ready === false
      && frontier.moduleFactoryRuntime.status === "missing_runtime_archives",
    "module factory runtime should be blocked without archives",
    frontier.moduleFactoryRuntime);
  expect(frontier.particleSystemRuntime?.attempted === true
      && frontier.particleSystemRuntime.ready === false
      && frontier.particleSystemRuntime.status === "missing_runtime_archives",
    "particle system runtime should be blocked without archives",
    frontier.particleSystemRuntime);

  expect(frontier.fileSystemReady === false, "frontier filesystem should not be archive-ready", frontier);
  expect(frontier.startupFilesReady === false, "frontier startup files should be missing", frontier);
  expect(frontier.startupSingletonsReady === false, "frontier startup singletons should be missing", frontier);
  expect(frontier.setupReady === false, "frontier setup should not be ready", frontier);
}

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  await mkdir(screenshotDir, { recursive: true });

  let page = null;
  let audioPage = null;
  let bootResult = null;
  let mountResult = null;
  let audioBootResult = null;
  let objectIniResult = null;

  if (realInitOnly) {
    console.error("[vertical] phase1+2 skipped (real-init only)");
  } else {
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    attachConsoleLogger(page, "startup");

    debugLog("loading initial harness page");
    await page.goto(harnessUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

    console.error("[vertical] phase1 boot");
    debugLog("running archiveless boot");
    bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
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

    await page.screenshot({ path: desktopScreenshot });
    await page.locator("#viewport").screenshot({ path: canvasScreenshot });

    // Archive-backed boot: mount the startup + audio archive set and prove the
    // boot constructs the original MilesAudioManager, W3DFunctionLexicon, and
    // W3DModuleFactory / W3DParticleSystemManager,
    // runs the real AudioManager::init()/openDevice() path plus the original
    // W3DFunctionLexicon device-table load, original ControlBarObserver/GameWinBlockInput/MOTD/MainMenu/Credits/Skirmish
    // base shell callbacks, the promoted Options/SkirmishMapSelect/Challenge/PopupCommunicator/MapSelect/Replay/PopupReplay-modal/GameInfo owners,
    // and the post-particle W3DThingFactory/object-template parse surface,
    // and honestly keeps the device-factory frontier at createFunctionLexicon
    // until the remaining shell callback graph is owned by cnc-port.
    // W3DFunctionLexicon device-table load, representative original base
    // layout callbacks, and honestly keeps the device-factory frontier at
    // createFunctionLexicon until the remaining shell callback graph is owned
    // by cnc-port.
    console.error("[vertical] phase2 audio archives");
    // until the remaining callback owner groups are owned by cnc-port.
    const archives = await buildAudioOwnershipArchiveSpecs();
    audioPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    attachConsoleLogger(audioPage, "archive");
    debugLog("loading archive-backed harness page");
    await audioPage.goto(harnessUrl, { waitUntil: "networkidle" });
    await audioPage.waitForFunction(() => Boolean(window.CnCPort?.rpc));

    debugLog("mounting archive-backed startup set");
    mountResult = await audioPage.evaluate((payload) =>
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

    console.error("[vertical] phase2 audio boot");
    debugLog("running archive-backed boot");
    audioBootResult = await audioPage.evaluate(() => window.CnCPort.rpc("boot", {
      source: "startup vertical smoke (audio ownership)",
    }));
    debugLog("archive-backed boot returned");
    expect(audioBootResult.ok === true, "audio-ownership boot RPC failed", audioBootResult);
    expect(audioBootResult.state?.booted === true, "audio-ownership boot state mismatch", audioBootResult);
    expect(audioBootResult.state.startupSingletons?.ok === true,
      "audio-ownership boot should own the startup singletons",
      audioBootResult.state.startupSingletons);

    assertAudioManagerRuntimeOwned(audioBootResult.state);
    assertFunctionLexiconRuntimeFrontier(audioBootResult.state);
    assertModuleFactoryRuntimeFrontier(audioBootResult.state);
    assertParticleSystemRuntimeFrontier(audioBootResult.state);
    assertAudioOwnedFrontier(audioBootResult.state);

    debugLog("probing archive-backed object INI runtime");
    objectIniResult = await audioPage.evaluate(() => window.CnCPort.rpc("probeObjectIni", {
      path: "/assets/startup-audio/*.big",
    }));
    expect(objectIniResult.ok === true, "archive-backed object INI probe RPC failed", objectIniResult);
    assertObjectIniThingFactoryRuntime(objectIniResult.probe, "archive-backed startup");

    await audioPage.screenshot({ path: audioBootScreenshot });
  }

  // REAL engine lifecycle: fresh page, whole-file archive set, original
  // CreateGameEngine() -> GameEngine::init(-noshellmap -win) -> update()
  // frames, with the frontier computed from the actual run.
  // Close the earlier phases' pages first: each holds a full wasm heap plus
  // mounted archives, and keeping three alive can crash the phase-3 tab
  // (renderer OOM) while it fetches the whole-file archive set.
  await audioPage?.close();
  await page?.close();
  console.error("[vertical] phase3 real-init page");
  const realInitPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await realInitPage.goto(harnessUrl, { waitUntil: "networkidle" });
  await realInitPage.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const realInitArchives = await buildRealInitArchives(server.url);
  console.error("[vertical] phase3 mounting");
  const realInitMount = await realInitPage.evaluate((payload) =>
    window.CnCPort.rpc("mountArchives", payload), {
    path: "/assets/real-init",
    verifyEach: false,
    archives: realInitArchives,
  });
  expect(realInitMount.archiveSet?.archiveCount === realInitArchiveSpecs.length,
    "real-init archive mount failed", realInitMount.error ?? realInitMount.archiveSet);

  console.error("[vertical] phase3 realEngineInit");
  const realInit = await realInitPage.evaluate(() =>
    window.CnCPort.rpc("realEngineInit", { runDirectory: "/assets/real-init" }));
  assertRealEngineInit(realInit);

  console.error("[vertical] phase3 frames");
  let realFrames = await runRealEngineFrames(realInitPage, 5);
  if (realFrames.frame?.clientState?.shell?.screenCount > 0) {
    realFrames = await runRealEngineFrames(realInitPage, 2);
  }

  console.error("[vertical] phase3 real menu reveal");
  const singlePlayerButton = realFrames.frame?.clientState?.mainMenu?.buttonSinglePlayer;
  const realMenuReveal = await revealRealEngineMainMenu(realInitPage, singlePlayerButton);
  await realInitPage.screenshot({ path: realInitScreenshot });
  const realInitCanvasProbe = await assertRealMenuCanvasVisible(realInitPage, "real MainMenu reveal screenshot");

  console.error("[vertical] phase3 real keyboard input");
  await realInitPage.keyboard.down("A");
  await waitForBrowserDirectInputQueue(realInitPage, 1, "real MainMenu A keydown");
  const realKeyboardDown = await runRealEngineFrames(realInitPage, 1);
  assertRealKeyboardFrame(
    realKeyboardDown,
    directInputKeys.a,
    keyStates.down,
    "real MainMenu A keydown");

  await realInitPage.keyboard.up("A");
  await waitForBrowserDirectInputQueue(realInitPage, 1, "real MainMenu A keyup");
  const realKeyboardUp = await runRealEngineFrames(realInitPage, 1);
  assertRealKeyboardFrame(
    realKeyboardUp,
    directInputKeys.a,
    keyStates.up,
    "real MainMenu A keyup");

  console.error("[vertical] phase3 real single-player click");
  const realMenuSinglePlayerClick = await clickRealEngineMenuButton(
    realInitPage,
    realMenuReveal.clickTarget.button,
    realMenuReveal.clickTarget.hitProbe);
  const singlePlayerClientState = realMenuSinglePlayerClick.finalFrame.frame?.clientState;
  const singlePlayerMenu = singlePlayerClientState?.mainMenu;
  assertRealMenuClickOutcome(singlePlayerMenu, realMenuSinglePlayerClick.expectedTarget);
  expect(realMenuHitMatches(singlePlayerMenu, "underButtonUSACenter", "buttonUSA"),
    "real ButtonSinglePlayer click did not align visible ButtonUSA with engine hit-testing",
    singlePlayerClientState);

  console.error("[vertical] phase3 real menu click");
  const realMenuClickTarget = {
    button: singlePlayerMenu?.buttonUSA,
    hitProbe: singlePlayerMenu?.underButtonUSACenter,
  };
  const realMenuClick = await clickRealEngineMenuButton(
    realInitPage,
    realMenuClickTarget.button,
    realMenuClickTarget.hitProbe);
  const clickedMenu = realMenuClick.finalFrame.frame?.clientState?.mainMenu;
  assertRealMenuClickOutcome(clickedMenu, realMenuClick.expectedTarget);
  expect(realMenuHitMatches(clickedMenu, "underButtonEasyCenter", "buttonEasy"),
    "real ButtonUSA click did not align visible difficulty controls with engine hit-testing",
    realMenuClick.finalFrame.frame?.clientState);

  await realInitPage.screenshot({ path: realInitMenuClickScreenshot });
  const realInitMenuClickCanvasProbe = await assertRealMenuCanvasVisible(
    realInitPage,
    "real MainMenu click screenshot");

  console.error("[vertical] phase3 real campaign easy click");
  const campaignBaselineDebug = clickedMenu?.debug;
  const realCampaignClickTarget = {
    button: clickedMenu?.buttonEasy,
    hitProbe: clickedMenu?.underButtonEasyCenter,
  };
  const realCampaignClick = await clickRealEngineMenuButton(
    realInitPage,
    realCampaignClickTarget.button,
    realCampaignClickTarget.hitProbe,
    null);
  if (postCampaignBreakpoint.length > 0) {
    await setRealEngineGameLogicBreakpoint(realInitPage, postCampaignBreakpoint);
  }
  const realCampaignStart = postCampaignBreakpoint.length > 0
    ? {
      frame: await runRealEngineFramesUnchecked(
        realInitPage,
        postCampaignFrameCount > 0 ? postCampaignFrameCount : 1),
      attempts: [],
    }
    : await waitForRealCampaignGameStart(
      realInitPage,
      campaignBaselineDebug,
      "real ButtonEasy campaign start");
  await realInitPage.screenshot({ path: realInitCampaignStartScreenshot });
  const realCampaignStartCanvasProbe = await sampleViewportPixels(realInitPage, [
    { name: "upperLeft", x: 64, y: 64 },
    { name: "center", x: 400, y: 300 },
    { name: "buttonArea", x: 644, y: 134 },
    { name: "fadeArea", x: 1030, y: 190 },
  ]);
  const hasPostCampaignAfterBreakpoint =
    postCampaignEngineBreakpoint.length > 0 || postCampaignAfterGameLogicBreakpoint.length > 0;
  const realPostCampaignPreBreakpointFrames =
    postCampaignBreakpoint.length === 0
      && hasPostCampaignAfterBreakpoint
      && postCampaignPreBreakpointFrameCount > 0
      ? await runRealEngineFrames(realInitPage, postCampaignPreBreakpointFrameCount)
      : null;
  if (postCampaignBreakpoint.length === 0 && postCampaignEngineBreakpoint.length > 0) {
    await setRealEngineUpdateBreakpoint(realInitPage, postCampaignEngineBreakpoint);
  }
  if (postCampaignBreakpoint.length === 0 && postCampaignAfterGameLogicBreakpoint.length > 0) {
    await setRealEngineGameLogicBreakpoint(realInitPage, postCampaignAfterGameLogicBreakpoint);
  }
  const shouldRunUntilPlayerControl =
    postCampaignBreakpoint.length === 0
      && !hasPostCampaignAfterBreakpoint
      && (postCampaignUntilPlayerControl || postCampaignExpectPlayerControl);
  const realPostCampaignDiagnosticFrames =
    postCampaignBreakpoint.length === 0 && hasPostCampaignAfterBreakpoint
      ? await runRealEngineFramesUnchecked(
        realInitPage,
        postCampaignFrameCount > 0 ? postCampaignFrameCount : 1)
      : null;
  const realPostCampaignPlayerControlFrames = shouldRunUntilPlayerControl
    ? await runRealEngineFramesUntilPlayerControl(
      realInitPage,
      postCampaignFrameCount > 0 ? postCampaignFrameCount : 3600,
      postCampaignFrameChunkCount)
    : null;
  if (postCampaignExpectPlayerControl) {
    expect(realPostCampaignPlayerControlFrames?.reachedPlayerControl === true,
      "loaded-map intro did not return original player control before the frame limit",
      realPostCampaignPlayerControlFrames?.playerControl);
  }
  const realPostCampaignFrames = postCampaignBreakpoint.length === 0
    && !hasPostCampaignAfterBreakpoint
    && !shouldRunUntilPlayerControl
    && postCampaignFrameCount > 0
    ? await runRealEngineFrameBatches(
      realInitPage,
      postCampaignFrameCount,
      postCampaignFrameChunkCount)
    : null;
  const shouldCapturePostCampaign =
    realPostCampaignFrames !== null
      || realPostCampaignPlayerControlFrames !== null
      || realPostCampaignDiagnosticFrames !== null;
  const realPostCampaignScreenshotPath = shouldCapturePostCampaign
    ? realInitPostCampaignScreenshot
    : null;
  if (shouldCapturePostCampaign) {
    await realInitPage.screenshot({ path: realInitPostCampaignScreenshot });
  }
  const realPostCampaignCanvasProbe = shouldCapturePostCampaign
    ? await sampleViewportPixels(realInitPage, [
      { name: "upperLeft", x: 64, y: 64 },
      { name: "center", x: 640, y: 360 },
      { name: "terrainArea", x: 640, y: 500 },
      { name: "hudArea", x: 86, y: 682 },
    ])
    : null;
  const realPostCampaignFrameResult =
    realPostCampaignFrames
      ?? realPostCampaignPlayerControlFrames
      ?? realPostCampaignDiagnosticFrames;
  const realPostCampaignTextureDiagnostics =
    realPostCampaignFrameResult?.frame?.textureDiagnostics;
  if (shouldCapturePostCampaign) {
    expect(realPostCampaignTextureDiagnostics?.missingApplies === 0,
      "loaded-map render should not apply WW3D missing texture fallback",
      realPostCampaignTextureDiagnostics);
  }

  const audioFrontier =
    audioBootResult?.state?.originalEngineStartup?.deviceFactoryFrontier;
  console.log(JSON.stringify({
    ok: true,
    mode: realInitOnly ? "real-init-only" : "full",
    url: harnessUrl,
    wasm: bootResult?.state?.wasm ?? null,
    frame: bootResult?.state?.frame ?? null,
    screenshots: [
      ...(bootResult !== null ? [desktopScreenshot, canvasScreenshot] : []),
      ...(audioBootResult !== null ? [audioBootScreenshot] : []),
      realInitScreenshot,
      realInitMenuClickScreenshot,
      realInitCampaignStartScreenshot,
      ...(realPostCampaignScreenshotPath !== null ? [realPostCampaignScreenshotPath] : []),
    ],
    originalEngineStartup: bootResult?.state?.originalEngineStartup ?? null,
    archiveBackedStartup: audioBootResult !== null ? {
      archiveCount: mountResult?.archiveSet?.archiveCount,
      firstUnownedInitFactory: audioFrontier?.firstUnownedInitFactory,
      firstUnownedInitLine: audioFrontier?.firstUnownedInitLine,
      audioManagerRuntime: audioBootResult.state.audioManagerRuntime,
      functionLexiconRuntime: audioBootResult.state.functionLexiconRuntime,
      moduleFactoryRuntime: audioBootResult.state.moduleFactoryRuntime,
      particleSystemRuntime: audioBootResult.state.particleSystemRuntime,
      objectIniRuntime: objectIniResult?.probe,
    } : null,
    realEngineInit: {
      archiveCount: realInitMount.archiveSet?.archiveCount,
      runDirectory: realInit.runDirectory,
      initReturned: realInit.frontier?.initReturned === true,
      subsystemCompletedCount: realInit.frontier?.subsystemCompletedCount,
      quittingAfterInit: realInit.frontier?.quittingAfterInit,
      elapsedMs: realInit.frontier?.elapsedMs,
      framesCompleted: realFrames.frame?.framesCompleted,
      clientState: realFrames.frame?.clientState,
      keyboard: {
        down: realKeyboardDown.frame?.clientState?.input?.keyboard,
        up: realKeyboardUp.frame?.clientState?.input?.keyboard,
      },
      menuClick: {
        framesCompleted: realMenuClick.finalFrame.frame?.framesCompleted,
        staleMovieBreakClears: realMenuClick.finalFrame.staleMovieBreakClears,
        singlePlayer: {
          framesCompleted: realMenuSinglePlayerClick.finalFrame.frame?.framesCompleted,
          point: realMenuSinglePlayerClick.point,
          target: realMenuSinglePlayerClick.expectedTarget,
          clientState: realMenuSinglePlayerClick.finalFrame.frame?.clientState,
        },
        reveal: {
          seedPoint: realMenuReveal.seedPoint,
          revealPoint: realMenuReveal.revealPoint,
          clientState: realMenuReveal.revealFrame.frame?.clientState,
          canvasProbe: realInitCanvasProbe,
        },
        point: realMenuClick.point,
        hitProbe: realMenuClickTarget.hitProbe,
        target: realMenuClick.expectedTarget,
        downInput: realMenuClick.down.frame.frame?.clientState?.input,
        downTarget: findRealMenuWindowById(
          realMenuClick.down.frame.frame?.clientState,
          realMenuClick.expectedTarget?.id),
        downAttempts: realMenuClick.down.attempts,
        upAttempts: realMenuClick.up.attempts,
        button: realMenuClickTarget.button,
        clientState: realMenuClick.finalFrame.frame?.clientState,
        canvasProbe: realInitMenuClickCanvasProbe,
        screenshot: realInitMenuClickScreenshot,
      },
      campaignStart: {
        framesCompleted: realCampaignStart.frame.frame?.framesCompleted,
        frameResult: realCampaignStart.frame,
        point: realCampaignClick.point,
        hitProbe: realCampaignClickTarget.hitProbe,
        target: realCampaignClick.expectedTarget,
        downInput: realCampaignClick.down.frame.frame?.clientState?.input,
        downTarget: findRealMenuWindowById(
          realCampaignClick.down.frame.frame?.clientState,
          realCampaignClick.expectedTarget?.id),
        downAttempts: realCampaignClick.down.attempts,
        upAttempts: realCampaignClick.up.attempts,
        button: realCampaignClickTarget.button,
        clickFinalClientState: realCampaignClick.finalFrame.frame?.clientState,
        clientState: realCampaignStart.frame.frame?.clientState,
        attempts: realCampaignStart.attempts,
        canvasProbe: realCampaignStartCanvasProbe,
        screenshot: realInitCampaignStartScreenshot,
      },
      postCampaignFrames: realPostCampaignFrames,
      postCampaignPlayerControlFrames: realPostCampaignPlayerControlFrames,
      postCampaignPreBreakpointFrames: realPostCampaignPreBreakpointFrames,
      postCampaignDiagnosticFrames: realPostCampaignDiagnosticFrames,
      postCampaignCanvasProbe: realPostCampaignCanvasProbe,
      postCampaignScreenshot: realPostCampaignScreenshotPath,
      screenshot: realInitScreenshot,
    },
  }));
} finally {
  await browser?.close();
  await server.close();
}
