import { mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const screenshotDir = process.env.STARTUP_VERTICAL_SCREENSHOT_DIR
  ? resolve(process.env.STARTUP_VERTICAL_SCREENSHOT_DIR)
  : resolve(wasmRoot, "artifacts/screenshots");
const realInitScreenshot = resolve(screenshotDir, "startup-vertical-real-init.png");
const realInitMenuClickScreenshot = resolve(screenshotDir, "startup-vertical-real-init-menu-click.png");
const realInitCampaignStartScreenshot = resolve(screenshotDir, "startup-vertical-real-init-campaign-start.png");
const realInitPostCampaignScreenshot = resolve(screenshotDir, "startup-vertical-real-init-post-campaign.png");
const interactScreenshot = resolve(screenshotDir, "interact-milestone.png");
const attackScreenshot = resolve(screenshotDir, "attack-milestone.png");
const attackMoveScreenshot = resolve(screenshotDir, "attack-move-milestone.png");
const generalsExpScreenshot = resolve(screenshotDir, "generals-exp-milestone.png");
const proveInteract = process.env.STARTUP_VERTICAL_PROVE_INTERACT === "1";
const proveRadar = process.env.STARTUP_VERTICAL_PROVE_RADAR === "1";
const proveAttack = process.env.STARTUP_VERTICAL_PROVE_ATTACK === "1";
const proveAttackMove = process.env.STARTUP_VERTICAL_PROVE_ATTACK_MOVE === "1";
const proveGeneralsExp = process.env.STARTUP_VERTICAL_PROVE_GENERALS_EXP === "1";
const postCampaignFrameCount = Number(process.env.STARTUP_VERTICAL_POST_CAMPAIGN_FRAMES ?? 0);
const postCampaignFrameChunkCount =
  Number(process.env.STARTUP_VERTICAL_POST_CAMPAIGN_FRAME_CHUNK ?? 0);
const postCampaignUntilPlayerControl =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL === "1";
const postCampaignExpectPlayerControl =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_EXPECT_PLAYER_CONTROL === "1";
const postCampaignCompactChunks =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS === "1";
const postCampaignLightweightFrames =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_LIGHTWEIGHT === "1";
const postCampaignBreakpoint = process.env.STARTUP_VERTICAL_POST_CAMPAIGN_BREAKPOINT ?? "";
const postCampaignPreBreakpointFrameCount =
  Number(process.env.STARTUP_VERTICAL_POST_CAMPAIGN_PRE_BREAKPOINT_FRAMES ?? 0);
const postCampaignEngineBreakpoint =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_ENGINE_BREAKPOINT ?? "";
const postCampaignAfterGameLogicBreakpoint =
  process.env.STARTUP_VERTICAL_POST_CAMPAIGN_AFTER_GAME_LOGIC_BREAKPOINT ?? "";
const browserExecutable =
  process.env.STARTUP_VERTICAL_BROWSER_EXECUTABLE
  ?? process.env.CHROME_PATH
  ?? "";
const browserArgs = (process.env.STARTUP_VERTICAL_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter((arg) => arg.length > 0);

const gameModes = Object.freeze({
  singlePlayer: 0,
});

const gameDifficulties = Object.freeze({
  easy: 0,
});

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function startupBrowserLaunchOptions() {
  const options = {};
  if (browserExecutable.length > 0) {
    options.executablePath = browserExecutable;
  }
  if (browserArgs.length > 0) {
    options.args = browserArgs;
  }
  return options;
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
  { name: "LooseScripts.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Shaders.big", sourceName: "Shaders.big" },
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

function assertRealEngineFrameSummary(realFrames) {
  expect(realFrames?.aborted === false, "real engine summary frames aborted", {
    abortMessage: realFrames?.abortMessage,
    abortStack: realFrames?.abortStack,
    lastUpdateTarget: realFrames?.lastUpdateTarget,
    lastGameLogicStep: realFrames?.lastGameLogicStep,
    frame: realFrames?.frame,
  });
  const frame = realFrames.frame;
  expect(frame?.summary === true && frame.initReturned === true,
    "real engine summary frame ran without init", frame);
  expect(frame.framesCompleted > 0 && frame.exceptionCaught === false,
    "real GameEngine::update() summary frames did not complete", frame);
  expect(frame.quitting === false, "real engine quit during summary frames", frame);
  expect(frame.gameplay?.gameLogicReady === true
      && frame.gameplay?.gameClientReady === true
      && frame.gameplay?.scriptEngineReady === true,
    "real summary frame gameplay state was not exported", frame.gameplay);
}

const win32MouseMessages = Object.freeze({
  mouseMove: 0x0200,
  leftButtonDown: 0x0201,
  leftButtonUp: 0x0202,
  rightButtonDown: 0x0204,
  rightButtonUp: 0x0205,
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

async function runRealEngineFrameSummary(page, frames) {
  const result = await page.evaluate((frameCount) =>
    window.CnCPort.rpc("realEngineFrameSummary", { frames: frameCount }), frames);
  assertRealEngineFrameSummary(result);
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

function summarizeRealEngineSummaryFrameChunk(result, requestedFrames) {
  const frame = result?.frame;
  const gameplay = frame?.gameplay;
  return {
    requestedFrames,
    ok: result?.ok === true,
    framesCompleted: frame?.framesCompleted,
    framesAttempted: frame?.framesAttempted,
    exceptionCaught: frame?.exceptionCaught,
    lastUpdateTarget: frame?.lastUpdateTarget,
    lastGameLogicStep: frame?.lastGameLogicStep,
    textureDiagnostics: frame?.textureDiagnostics,
    display: frame?.display,
    view: {
      ready: frame?.view?.ready,
      position: frame?.view?.position,
      cameraPosition: frame?.view?.cameraPosition,
      zoom: frame?.view?.zoom,
      pitch: frame?.view?.pitch,
      angle: frame?.view?.angle,
      fieldOfView: frame?.view?.fieldOfView,
      terrainHeightUnderCamera: frame?.view?.terrainHeightUnderCamera,
      currentHeightAboveGround: frame?.view?.currentHeightAboveGround,
      cameraMovementFinished: frame?.view?.cameraMovementFinished,
      timeFrozen: frame?.view?.timeFrozen,
      timeMultiplier: frame?.view?.timeMultiplier,
      cameraLock: frame?.view?.cameraLock,
    },
    gameplay: {
      inGame: gameplay?.inGame,
      inputEnabled: gameplay?.inputEnabled,
      logicFrame: gameplay?.logicFrame,
      objectCount: gameplay?.objectCount,
      drawableCount: gameplay?.drawableCount,
      renderedObjectCount: gameplay?.renderedObjectCount,
      localPlayerActive: gameplay?.localPlayer?.active,
      localPlayerSide: gameplay?.localPlayer?.side,
      scriptFade: gameplay?.fade,
      scriptFadeValue: gameplay?.fadeValue,
      campaignIntroGates: gameplay?.campaignIntroGates,
    },
    controlBar: frame?.controlBar,
  };
}

function summarizeRealEngineFrameChunk(result, requestedFrames) {
  const frame = result?.frame;
  if (frame?.summary === true) {
    return summarizeRealEngineSummaryFrameChunk(result, requestedFrames);
  }
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
  if (frame?.summary === true) {
    return {
      ...frame.playerControl,
      useAlternateMouse: frame.inputSettings?.useAlternateMouse,
      textureDiagnostics: frame.textureDiagnostics,
    };
  }
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
    useAlternateMouse: clientState?.inputSettings?.useAlternateMouse,
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

function summarizePlayerControlPhase(chunk, framesRun) {
  const activeTimerWaits =
    chunk?.gameplay?.campaignIntroGates?.releaseChain?.activeTimerWaits ?? [];
  const playerControl = chunk?.playerControl ?? {};
  return {
    afterFrames: framesRun,
    logicFrame: playerControl.logicFrame ?? chunk?.gameplay?.logicFrame,
    reachedPlayerControl: chunk?.reachedPlayerControl,
    inGame: playerControl.inGame,
    inputEnabled: playerControl.inputEnabled,
    introDone: playerControl.introDone,
    letterBoxed: playerControl.letterBoxed,
    controlBarHidden: playerControl.controlBarHidden,
    controlBarClickable: playerControl.controlBarClickable,
    activeTimerWaits: activeTimerWaits.map((timer) => ({
      script: timer.script,
      counter: timer.counter,
      value: timer.current?.value,
      countdownTimer: timer.current?.countdownTimer,
    })),
  };
}

function playerControlPhaseKey(phase) {
  return JSON.stringify({
    reachedPlayerControl: phase.reachedPlayerControl,
    inGame: phase.inGame,
    inputEnabled: phase.inputEnabled,
    introDone: phase.introDone,
    letterBoxed: phase.letterBoxed,
    controlBarHidden: phase.controlBarHidden,
    controlBarClickable: phase.controlBarClickable,
    activeTimerWaits: phase.activeTimerWaits.map((timer) => ({
      script: timer.script,
      counter: timer.counter,
      countdownTimer: timer.countdownTimer,
    })),
  });
}

function appendPlayerControlPhaseChange(phaseChanges, chunk, framesRun) {
  const phase = summarizePlayerControlPhase(chunk, framesRun);
  const key = playerControlPhaseKey(phase);
  const last = phaseChanges.at(-1);
  if (last?.key === key) {
    last.lastAfterFrames = framesRun;
    last.lastLogicFrame = phase.logicFrame;
    last.activeTimerWaits = phase.activeTimerWaits;
    return;
  }
  const { afterFrames, logicFrame, ...phaseDetails } = phase;
  phaseChanges.push({
    key,
    firstAfterFrames: afterFrames,
    lastAfterFrames: afterFrames,
    firstLogicFrame: logicFrame,
    lastLogicFrame: logicFrame,
    ...phaseDetails,
  });
}

function compactActiveTimerWaits(chunk) {
  const activeTimerWaits =
    chunk?.gameplay?.campaignIntroGates?.releaseChain?.activeTimerWaits ?? [];
  return activeTimerWaits.map((timer) => ({
    script: timer.script,
    counter: timer.counter,
    value: timer.current?.value,
    countdownTimer: timer.current?.countdownTimer,
  }));
}

function compactPostCampaignFrameChunk(chunk) {
  return {
    requestedFrames: chunk?.requestedFrames,
    ok: chunk?.ok,
    framesCompleted: chunk?.framesCompleted,
    framesAttempted: chunk?.framesAttempted,
    exceptionCaught: chunk?.exceptionCaught,
    lastUpdateTarget: chunk?.lastUpdateTarget,
    lastGameLogicStep: chunk?.lastGameLogicStep,
    textureDiagnostics: chunk?.textureDiagnostics,
    display: chunk?.display,
    view: {
      ready: chunk?.view?.ready,
      cameraPosition: chunk?.view?.cameraPosition,
      cameraMovementFinished: chunk?.view?.cameraMovementFinished,
      timeFrozen: chunk?.view?.timeFrozen,
      timeMultiplier: chunk?.view?.timeMultiplier,
    },
    gameplay: {
      inGame: chunk?.gameplay?.inGame,
      inputEnabled: chunk?.gameplay?.inputEnabled,
      logicFrame: chunk?.gameplay?.logicFrame,
      objectCount: chunk?.gameplay?.objectCount,
      drawableCount: chunk?.gameplay?.drawableCount,
      scriptFade: chunk?.gameplay?.scriptFade,
      scriptFadeValue: chunk?.gameplay?.scriptFadeValue,
      localPlayerActive: chunk?.gameplay?.localPlayerActive,
      localPlayerSide: chunk?.gameplay?.localPlayerSide,
      activeTimerWaits: compactActiveTimerWaits(chunk),
    },
    controlBar: chunk?.controlBar,
    playerControl: chunk?.playerControl,
    reachedPlayerControl: chunk?.reachedPlayerControl,
  };
}

function storePostCampaignChunk(chunks, chunk, compactChunks) {
  const storedChunk = compactChunks ? compactPostCampaignFrameChunk(chunk) : chunk;
  chunks.push(storedChunk);
  return storedChunk;
}

async function runRealEngineFrameBatches(page, totalFrames, chunkFrames, compactChunks = false) {
  if (chunkFrames <= 0 || chunkFrames >= totalFrames) {
    return runRealEngineFrames(page, totalFrames);
  }

  const chunks = [];
  let lastResult = null;
  for (let remaining = totalFrames; remaining > 0;) {
    const frames = Math.min(chunkFrames, remaining);
    lastResult = await runRealEngineFrames(page, frames);
    const summary = summarizeRealEngineFrameChunk(lastResult, frames);
    const storedChunk = storePostCampaignChunk(chunks, summary, compactChunks);
    console.error("[vertical] post-campaign chunk", JSON.stringify(storedChunk));
    remaining -= frames;
  }

  return {
    ...lastResult,
    chunked: {
      totalFrames,
      chunkFrames,
      compactChunks,
      chunks,
    },
  };
}

async function runRealEngineFramesUntilPlayerControl(
  page,
  maxFrames,
  chunkFrames,
  compactChunks = false,
  lightweightFrames = false) {
  const framesPerChunk = chunkFrames > 0 ? chunkFrames : 60;
  const chunks = [];
  const phaseChanges = [];
  let lastResult = null;
  let framesRun = 0;
  for (let remaining = maxFrames; remaining > 0;) {
    const frames = Math.min(framesPerChunk, remaining);
    lastResult = lightweightFrames
      ? await runRealEngineFrameSummary(page, frames)
      : await runRealEngineFrames(page, frames);
    framesRun += frames;
    const summary = summarizeRealEngineFrameChunk(lastResult, frames);
    const playerControl = summarizePlayerControlState(lastResult);
    const reached = playerControlStateReached(playerControl);
    const chunk = {
      ...summary,
      playerControl,
      reachedPlayerControl: reached,
    };
    appendPlayerControlPhaseChange(phaseChanges, chunk, framesRun);
    const storedChunk = storePostCampaignChunk(chunks, chunk, compactChunks);
    console.error("[vertical] post-campaign player-control chunk", JSON.stringify(storedChunk));
    if (reached) {
      return {
        ...lastResult,
        reachedPlayerControl: true,
        playerControl,
        chunked: {
          totalFrames: framesRun,
          maxFrames,
          chunkFrames: framesPerChunk,
          compactChunks,
          lightweightFrames,
          phaseChanges: phaseChanges.map(({ key, ...phase }) => phase),
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
      compactChunks,
      lightweightFrames,
      phaseChanges: phaseChanges.map(({ key, ...phase }) => phase),
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

async function postShortRealEngineClick(page, click, point, settleFrames = 5) {
  await postRealEngineMouseMessage(page, click.down, point);
  await postRealEngineMouseMessage(page, click.up, point);
  return runRealEngineFrames(page, settleFrames);
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

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch(startupBrowserLaunchOptions());
  const harnessUrl = new URL("harness/index.html", server.url).href;
  await mkdir(screenshotDir, { recursive: true });

  // REAL engine lifecycle: whole-file archive set, original
  // CreateGameEngine() -> GameEngine::init(-noshellmap -win) -> update()
  // frames, with the frontier computed from the actual run. (The former
  // phase-1 archiveless boot and phase-2 range-backed "audio ownership"
  // frontier boot were retired 2026-07-10 with the range-backed subset-mount
  // machinery — the probe-frontier contracts they asserted predate real
  // init and had already drifted red; real init owns this coverage.)
  console.error("[vertical] real-init page");
  const realInitPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // Always-on console listener for the real-init page so that wasm stdout
  // phase markers (e.g. `cnc-port: query_drawables START ...`) survive a
  // hard wasm trap, which the JS try/catch in the bridge cannot intercept.
  // Only echo lines tagged with the `cnc-port:` trace prefix to stay quiet.
  realInitPage.on("console", (message) => {
    const text = message.text();
    if (typeof text === "string" && text.startsWith("cnc-port:")) {
      console.error(`[realinit console:${message.type()}] ${text}`);
    }
  });
  realInitPage.on("pageerror", (error) => {
    console.error(`[realinit pageerror] ${error.stack ?? error.message}`);
  });
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
    ? await (async () => {
        await realInitPage.evaluate(() => {
          if (window.__cncSetDiagLevel) window.__cncSetDiagLevel("lite");
        });
        const result = await runRealEngineFramesUntilPlayerControl(
          realInitPage,
          postCampaignFrameCount > 0 ? postCampaignFrameCount : 3600,
          postCampaignFrameChunkCount,
          postCampaignCompactChunks,
          postCampaignLightweightFrames);
        await realInitPage.evaluate(() => {
          if (window.__cncSetDiagLevel) window.__cncSetDiagLevel("full");
        });
        return result;
      })()
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
      postCampaignFrameChunkCount,
      postCampaignCompactChunks)
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

  // Phase 2: select-and-move unit interactivity proof (gated by env flag).
  // The function def is below; the invocation is placed after it.

  // ---- selectAndMoveUnit: Phase 2 interactivity proof ----
  /**
   * Reach player control, pick a local-owned non-structure unit on screen,
   * left-click to select it, right-click a destination, step ~90 frames,
   * verify the unit moved, and screenshot.
   */
  async function selectAndMoveUnit(page) {
    const summary = {
      reachedControl: false,
      unitPicked: null,
      selectCount: 0,
      attackOrder: null,
      attackMoveOrder: null,
      generalsExp: null,
      radarMove: null,
      moveSource: null,
      moveDelta: null,
      screenshotPath: null,
    };

    // 1. Reach player control. While we walk toward it we also probe
    //    queryDrawables directly so the WTS/auto-guard breakdown is captured
    //    at the real md_USA01 scene, NOT just at the final reachedControl
    //    gate — that turns out to matter on WASM because the campaign intro
    //    movie can stall GameLogic before INTRO_DONE releases input, in which
    //    case the harness never reaches control and the query is the only
    //    runnable probe we have to diagnose a 0-drawable return.
    console.error("[interact] reaching player control...");
    await page.evaluate(() => {
      if (window.__cncSetDiagLevel) window.__cncSetDiagLevel("lite");
    });
    // Inline a reach-control loop so we can probe queryDrawables each chunk.
    const reachMax = 3600;
    const reachChunk = 60;
    let pcResult = null;
    for (let remaining = reachMax; remaining > 0;) {
      const frames = Math.min(reachChunk, remaining);
      pcResult = await runRealEngineFrames(page, frames);
      const pc = summarizePlayerControlState(pcResult);
      const reached = playerControlStateReached(pc);
      // Probe queryDrawables once per chunk. "Aborted/ready:undefined" or zero
      // kept drawables with all-offScreen is what we need to capture.
      let probe = null;
      try {
        probe = await page.evaluate(() =>
          window.CnCPort.rpc("queryDrawables"));
      } catch (error) {
        probe = { ok: false, error: error?.message ?? String(error) };
      }
      const stats = probe?.result?.stats;
      const guard = probe?.result?.guard;
      console.error(
        "[interact] reach-chunk frames",
        pcResult?.frame?.framesCompleted,
        "logicFrame", pc.logicFrame,
        "objects", pcResult?.frame?.clientState?.gameplay?.objectCount,
        "reached", reached,
        "inGame", pc.inGame,
        "inputEnabled", pc.inputEnabled,
        "letterBoxed", pc.letterBoxed,
        "introDone", pc.introDone,
        "| queryDrawables",
        "ok", probe?.ok, "aborted", probe?.aborted,
        "abortMsg", probe?.abortMessage,
        "ready", probe?.result?.ready, "guard", guard,
        "localIdx", probe?.result?.localPlayerIndex,
        "kept", stats?.kept,
        "wtsI/O/Inv", stats?.wtsInside, stats?.wtsOutside, stats?.wtsInvalid,
        "ownedLocal", stats?.ownedLocal,
        "ownedNotNullLocal", stats?.ownedNotLocal,
        "ownedNull", stats?.ownedNull,
        "noObject", stats?.noObject);
      if (reached) {
        break;
      }
      remaining -= frames;
    }
    await page.evaluate(() => {
      if (window.__cncSetDiagLevel) window.__cncSetDiagLevel("full");
    });
    summary.reachedControl = pcResult != null && playerControlStateReached(summarizePlayerControlState(pcResult));
    console.error("[interact] reachedPlayerControl:", summary.reachedControl);
    if (!summary.reachedControl) {
      throw new Error(
        `[interact] did not reach player control before interaction proof; ` +
        `lastState=${JSON.stringify(summarizePlayerControlState(pcResult))}`
      );
    }

    // 2. queryDrawables → pick first local-owned, non-structure, non-hidden, on-screen unit.
    const dr = await page.evaluate(() =>
      window.CnCPort.rpc("queryDrawables"));
    console.error("[interact] queryDrawables ok:", dr?.ok, "aborted:", dr?.aborted, "abortMessage:", dr?.abortMessage, "started:", dr?.result?.started, "ready:", dr?.result?.ready, "guard:", dr?.result?.guard, "localPlayerIndex:", dr?.result?.localPlayerIndex, "stats:", JSON.stringify(dr?.result?.stats), "drawables:", (dr?.result?.drawables ?? []).length);
    const drawables = dr?.result?.drawables ?? [];
    const localUnits = drawables.filter(
      (d) => d.localOwned === true && d.structure === false && d.hidden === false && d.onScreen === true
    );
    console.error(
      "[interact] drawables:", drawables.length,
      "localOwned units:", drawables.filter((d) => d.localOwned).length,
      "on-screen local units:", localUnits.length
    );
    if (localUnits.length === 0) {
      // Log all localOwned units and their onScreen flags for debugging.
      const localOwnedUnits = drawables.filter((d) => d.localOwned);
      console.error(
        "[interact] no on-screen local unit found; localOwned units and onScreen flags:",
        JSON.stringify(localOwnedUnits.map((d) => ({ id: d.id, name: d.name, onScreen: d.onScreen, structure: d.structure, hidden: d.hidden })))
      );
      return summary;
    }
    const combatNamePattern = /Tank|Paladin|Humvee|Ranger|Missile|Comanche|Crusader|Raptor|Aurora|Tomahawk/i;
    const unit = localUnits.find((d) => combatNamePattern.test(d.name ?? ""))
      ?? localUnits[0];
    summary.unitPicked = { id: unit.id, name: unit.name, screenPos: unit.screenPos, worldPos: unit.worldPos };
    console.error("[interact] picked unit:", JSON.stringify(summary.unitPicked));

    // 3. Left-click to select: mouseMove → leftButtonDown → step → leftButtonUp.
    // Click-select sequence. Win32Mouse->addWin32Event() only ENQUEUES a
    // GameMessage into TheMessageStream; the queue is processed on the NEXT
    // GameClient::update() frame: SelectionTranslator converts RAW mouse
    // down→up into MSG_MOUSE_LEFT_CLICK, which is itself processed on the
    // frame AFTER that. The original harness only stepped 1 frame between
    // left-Down and left-Up (and zero frames after left-Up) so the click was
    // never delivered to SelectionTranslator and selectCount stayed 0 — the
    // pre-fix probe5 returned `selectCount: 0, moveDelta: 0`. Step a few
    // frames on each side of every mouse-button transition so the click is
    // guaranteed to run through Mouse → MessageStream → SelectionTranslator
    // → TheInGameUI->selectDrawable / pickDrawable → MSG_CREATE_SELECTED_GROUP,
    // and right-click through CommandTranslator issueMoveToLocationCommand →
    // MSG_DO_MOVETO → Object::issueMoveToLocation.
    const CLICK_FORWARD_FRAMES = 5;
    const clickPoint = { x: unit.screenPos.x, y: unit.screenPos.y };
    await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, clickPoint);
    await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
    await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonDown, clickPoint);
    await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
    await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonUp, clickPoint);
    await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);

    // 4. querySelection → assert selectCount >= 1.
    let selBefore = await page.evaluate(() =>
      window.CnCPort.rpc("querySelection"));
    console.error("[interact] querySelection before move ok:", selBefore?.ok, "aborted:", selBefore?.aborted, "abortMessage:", selBefore?.abortMessage, "selectCount:", selBefore?.result?.selectCount, "rawResult:", selBefore?.result);
    summary.selectCount = selBefore?.result?.selectCount ?? 0;
    expect(summary.selectCount >= 1,
      "[interact] unit click did not select any controllable drawable",
      selBefore?.result);

    // 5. Click a destination offset: +200px x on-screen, clamped. The original
    // CommandTranslator only actions MSG_MOUSE_RIGHT_CLICK when alternate mouse
    // mode is enabled; otherwise the default move command is a left-click.
    const useAlternateMouse = summarizePlayerControlState(pcResult).useAlternateMouse === true;
    const moveClick = useAlternateMouse
      ? {
          name: "right",
          down: win32MouseMessages.rightButtonDown,
          up: win32MouseMessages.rightButtonUp,
        }
      : {
          name: "left",
          down: win32MouseMessages.leftButtonDown,
          up: win32MouseMessages.leftButtonUp,
        };
    console.error(
      "[interact] move input scheme: useAlternateMouse",
      useAlternateMouse,
      "moveButton", moveClick.name
    );
    const displayWidth = pcResult?.frame?.clientState?.display?.width
      ?? pcResult?.frame?.display?.width
      ?? 800;
    const displayHeight = pcResult?.frame?.clientState?.display?.height
      ?? pcResult?.frame?.display?.height
      ?? 600;

    const compactWindowProbe = (window) => window == null ? null : ({
      name: window.name,
      found: window.found,
      id: window.id,
      decoratedName: window.decoratedName,
      x: window.x,
      y: window.y,
      width: window.width,
      height: window.height,
      centerX: window.centerX,
      centerY: window.centerY,
      systemFunc: window.systemFunc,
      inputFunc: window.inputFunc,
      drawFunc: window.drawFunc,
      hidden: window.hidden,
      managerHidden: window.managerHidden,
      enabled: window.enabled,
      clickable: window.clickable,
      owner: window.owner == null ? null : {
        found: window.owner.found,
        id: window.owner.id,
        decoratedName: window.owner.decoratedName,
        systemFunc: window.owner.systemFunc,
        inputFunc: window.owner.inputFunc,
        drawFunc: window.owner.drawFunc,
        hidden: window.owner.hidden,
      },
      command: window.command ?? undefined,
    });
    const visibleWindow = (window) =>
      window?.found === true && window.hidden !== true && window.managerHidden !== true;
    const hiddenWindow = (window) =>
      window?.found === true && (window.hidden === true || window.managerHidden === true);
    const clickNamedWindow = async (name) => {
      const result = await page.evaluate((windowName) =>
        window.CnCPort.rpc("clickWindowByName", { name: windowName }), name);
      expect(result?.ok === true,
        "[interact] named GameWindow click failed",
        { name, result });
      return result.result;
    };

    const worldDistance2d = (a, b) => {
      if (a == null || b == null) {
        return null;
      }
      const dx = Number(a.x) - Number(b.x);
      const dy = Number(a.y) - Number(b.y);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
      }
      return Math.sqrt(dx * dx + dy * dy);
    };

    async function reselectPickedUnit() {
      const currentDrawables = await page.evaluate(() =>
        window.CnCPort.rpc("queryDrawables"));
      const currentUnit = (currentDrawables?.result?.drawables ?? [])
        .find((candidate) => candidate.id === unit.id);
      const currentPoint = currentUnit?.onScreen === true && currentUnit.screenPos != null
        ? {
            x: Math.round(currentUnit.screenPos.x),
            y: Math.round(currentUnit.screenPos.y),
          }
        : clickPoint;
      await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, currentPoint);
      await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonDown, currentPoint);
      await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonUp, currentPoint);
      await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      return page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
    }

    async function proveGeneralsExpHud() {
      const generalsExpRouted = (windows) => {
        const parent = windows?.parent;
        const exitButton = windows?.buttonExit;
        return parent?.systemFunc === "GeneralsExpPointsSystem"
          || parent?.inputFunc === "GeneralsExpPointsInput"
          || exitButton?.owner?.systemFunc === "GeneralsExpPointsSystem"
          || exitButton?.owner?.inputFunc === "GeneralsExpPointsInput";
      };
      const compactGeneralsExpAttempt = (frame) => {
        const clientState = frame?.frame?.clientState;
        const windows = clientState?.generalsExpWindows;
        const parent = windows?.parent;
        const buttonExit = windows?.buttonExit;
        return {
          framesCompleted: frame?.frame?.framesCompleted,
          transition: clientState?.transition,
          parent: parent == null ? null : {
            found: parent.found,
            hidden: parent.hidden,
            managerHidden: parent.managerHidden,
            clickable: parent.clickable,
            systemFunc: parent.systemFunc,
            inputFunc: parent.inputFunc,
          },
          buttonExit: buttonExit == null ? null : {
            found: buttonExit.found,
            hidden: buttonExit.hidden,
            managerHidden: buttonExit.managerHidden,
            clickable: buttonExit.clickable,
            inputFunc: buttonExit.inputFunc,
            ownerHidden: buttonExit.owner?.hidden,
            ownerSystemFunc: buttonExit.owner?.systemFunc,
          },
          purchaseScience: clientState?.purchaseScience,
        };
      };
      const waitForGeneralsExpPanelState = async (expectedVisible, label, maxFrames = 45) => {
        const attempts = [];
        for (let frameIndex = 0; frameIndex < maxFrames; frameIndex += 1) {
          const frame = await runRealEngineFrames(page, 1);
          const clientState = frame?.frame?.clientState;
          const windows = clientState?.generalsExpWindows;
          const parent = windows?.parent;
          const visible = visibleWindow(parent);
          const hidden = hiddenWindow(parent);
          const routed = generalsExpRouted(windows);
          attempts.push(compactGeneralsExpAttempt(frame));
          if ((expectedVisible ? visible : hidden) && routed) {
            return { frame, clientState, windows, parent, attempts };
          }
        }
        expect(false,
          `[interact] Generals Experience panel did not become ${label}`,
          attempts);
      };

      const beforeFrame = await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      const beforeClientState = beforeFrame?.frame?.clientState;
      const buttonGeneral = beforeClientState?.controlBarWindows?.buttonGeneral;
      const beforeParent = beforeClientState?.generalsExpWindows?.parent;
      expect(buttonGeneral?.found === true
          && buttonGeneral.clickable === true
          && buttonGeneral.inputFunc === "GadgetPushButtonInput"
          && buttonGeneral.owner?.systemFunc === "ControlBarSystem",
        "[interact] General button is not routed through the original control-bar callback owner",
        compactWindowProbe(buttonGeneral));
      expect(hiddenWindow(beforeParent),
        "[interact] Generals Experience panel should start hidden before ButtonGeneral click",
        compactWindowProbe(beforeParent));

      const openClick = await clickNamedWindow("ControlBar.wnd:ButtonGeneral");
      const openResult = await waitForGeneralsExpPanelState(true, "visible");
      const openClientState = openResult.clientState;
      const openParent = openResult.parent;
      const exitButton = openResult.windows?.buttonExit;
      expect(exitButton?.found === true
          && exitButton.clickable === true
          && exitButton.inputFunc === "GadgetPushButtonInput",
        "[interact] Generals Experience exit button is not clickable",
        compactWindowProbe(exitButton));

      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: generalsExpScreenshot });
      const closeClick = await clickNamedWindow("GeneralsExpPoints.wnd:ButtonExit");
      const closeResult = await waitForGeneralsExpPanelState(false, "hidden", CLICK_FORWARD_FRAMES);
      const closedFrame = closeResult.frame;
      const closedParent = closeResult.parent;

      return {
        buttonGeneral: compactWindowProbe(buttonGeneral),
        beforeParent: compactWindowProbe(beforeParent),
        openMethod: "gadgetInput",
        openClick,
        openAttemptCount: openResult.attempts.length,
        openFirstAttempt: openResult.attempts[0] ?? null,
        openFinalAttempt: openResult.attempts.at(-1) ?? null,
        openParent: compactWindowProbe(openParent),
        buttonExit: compactWindowProbe(exitButton),
        openPurchaseScience: openClientState?.purchaseScience,
        closeMethod: "gadgetInput",
        closeClick,
        closeAttemptCount: closeResult.attempts.length,
        closeFinalAttempt: closeResult.attempts.at(-1) ?? null,
        closedParent: compactWindowProbe(closedParent),
        closedPurchaseScience: closedFrame?.frame?.clientState?.purchaseScience,
        screenshotPath: generalsExpScreenshot,
      };
    }

    async function proveAttackObjectOrder() {
      const beforeTargets = await page.evaluate(() =>
        window.CnCPort.rpc("queryDrawables"));
      const enemies = beforeTargets?.result?.enemyDrawables ?? [];
      const targetCombatNamePattern =
        /GLA|China|America|Tank|Infantry|Soldier|Rebel|RPG|Missile|Quad|Scorpion|Technical|Terror|Worker|Stinger|Tunnel|Barracks|ArmsDealer|Command|Supply|Patriot|Gattling|Dozer|Humvee|Paladin|Comanche|Mig|Raptor|Ranger|Trooper|AngryMob|Hijacker|Jarmen|Dragon|Overlord|Marauder|RocketBuggy|Toxin|Demo/i;
      const targetSceneryNamePattern =
        /Fence|Wall|Road|Tree|Shrub|Bush|Rock|Boulder|Barrel|Traffic|Sign|Light|Lamp|Pole|Bridge|Ambient|Prop|Debris|Crate|Cargo|CivilianCar|Car|Truck|Train|Flag/i;
      const targetAttackRank = (candidate) => {
        const name = candidate?.name ?? "";
        if (targetCombatNamePattern.test(name)) {
          return 0;
        }
        if (candidate?.structure === true) {
          return 1;
        }
        if (!targetSceneryNamePattern.test(name)) {
          return 2;
        }
        return 3;
      };
      const isUsableAttackTarget = (candidate) =>
          candidate?.onScreen === true
            && candidate.hidden === false
            && candidate.effectivelyDead !== true
            && candidate.screenPos != null
            && candidate.worldPos != null
            && candidate.screenPos.x >= 8
            && candidate.screenPos.x <= displayWidth - 8
            && candidate.screenPos.y >= 8
            && candidate.screenPos.y <= displayHeight - 150
            && (candidate.body?.ready !== true || candidate.body.health > 0)
            && targetAttackRank(candidate) < 3;
      const rankTargets = (candidates) => candidates
        .sort((a, b) => {
          const aRank = targetAttackRank(a);
          const bRank = targetAttackRank(b);
          if (aRank !== bRank) {
            return aRank - bRank;
          }
          const aStructure = a.structure === true ? 1 : 0;
          const bStructure = b.structure === true ? 1 : 0;
          if (aStructure !== bStructure) {
            return aStructure - bStructure;
          }
          return (worldDistance2d(unit.worldPos, a.worldPos) ?? Number.MAX_SAFE_INTEGER)
            - (worldDistance2d(unit.worldPos, b.worldPos) ?? Number.MAX_SAFE_INTEGER);
        });
      const hostileTargets = rankTargets(enemies
        .filter((candidate) => isUsableAttackTarget(candidate)
          && candidate.hostileToLocal === true))
        .slice(0, 16)
        .map((candidate) => ({ ...candidate, forceAttack: false }));
      const forceAttackTargets = rankTargets(enemies
        .filter((candidate) => isUsableAttackTarget(candidate)
          && candidate.hostileToLocal !== true))
        .slice(0, 16)
        .map((candidate) => ({ ...candidate, forceAttack: true }));
      const usableTargets = hostileTargets.length > 0 ? hostileTargets : forceAttackTargets;
      console.error(
        "[interact] attack target candidates:",
        JSON.stringify(usableTargets.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          rank: targetAttackRank(candidate),
          forceAttack: candidate.forceAttack === true,
          playerIndex: candidate.playerIndex,
          relationshipToLocal: candidate.relationshipToLocalName ?? candidate.relationshipToLocal,
          structure: candidate.structure,
          screenPos: candidate.screenPos,
          worldPos: candidate.worldPos,
          health: candidate.body?.health,
          maxHealth: candidate.body?.maxHealth,
        }))));
      expect(usableTargets.length > 0,
        "[interact] no visible attack target is available for attack proof",
        {
          stats: beforeTargets?.result?.stats,
          enemyCount: enemies.length,
          hostileCount: enemies.filter((candidate) =>
            candidate?.onScreen === true && candidate.hostileToLocal === true).length,
          fallbackForceAttack: hostileTargets.length === 0,
          rejectedSceneryCount: enemies.filter((candidate) =>
            candidate?.onScreen === true && targetAttackRank(candidate) >= 3).length,
          sampleEnemies: enemies.slice(0, 12),
        });

      const beforeCommandPath = selBefore?.result?.commandPath ?? {};
      const beforeAttackCount = beforeCommandPath.dispatchAttackCommandCount ?? 0;
      const targetIds = new Set(usableTargets.map((candidate) => candidate.id));
      const attempts = [];
      let accepted = null;
      for (const target of usableTargets) {
        const point = {
          x: Math.round(target.screenPos.x),
          y: Math.round(target.screenPos.y),
        };
        let forceAttackSelection = null;
        if (target.forceAttack === true) {
          await page.keyboard.down("Control");
          await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
          forceAttackSelection = await page.evaluate(() =>
            window.CnCPort.rpc("querySelection"));
          expect(forceAttackSelection?.result?.modes?.forceAttack === true,
            "[interact] CTRL did not enter force-attack mode before force attack proof",
            forceAttackSelection?.result?.modes);
        }
        await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, point);
        await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
        await postShortRealEngineClick(page, moveClick, point);
        if (target.forceAttack === true) {
          await page.keyboard.up("Control");
          await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
        }

        const afterClickSelection = await page.evaluate(() =>
          window.CnCPort.rpc("querySelection"));
        const commandPath = afterClickSelection?.result?.commandPath ?? {};
        const attempt = {
          target: {
            id: target.id,
            name: target.name,
            rank: targetAttackRank(target),
            forceAttack: target.forceAttack === true,
            relationshipToLocal: target.relationshipToLocalName ?? target.relationshipToLocal,
            point,
            structure: target.structure,
          },
          forceAttackModeBeforeClick: forceAttackSelection?.result?.modes?.forceAttack,
          selectCount: afterClickSelection?.result?.selectCount,
          selectedIds: (afterClickSelection?.result?.selected ?? [])
            .map((selected) => selected.id),
          lastClickIssuedType: commandPath.lastClickIssuedType,
          lastClickDrawId: commandPath.lastClickDrawId,
          dispatchAttackCommandCount: commandPath.dispatchAttackCommandCount,
          dispatchLastAttackCommandType: commandPath.dispatchLastAttackCommandType,
          dispatchLastAttackHadGroup: commandPath.dispatchLastAttackHadGroup,
          dispatchLastAttackTargetId: commandPath.dispatchLastAttackTargetId,
        };
        attempts.push(attempt);
        console.error("[interact] attack target candidate:", JSON.stringify(attempt));
        if ((commandPath.dispatchAttackCommandCount ?? 0) > beforeAttackCount
            && commandPath.dispatchLastAttackHadGroup === 1
            && targetIds.has(commandPath.dispatchLastAttackTargetId)) {
          const acceptedTarget = usableTargets.find((candidate) =>
            candidate.id === commandPath.dispatchLastAttackTargetId) ?? target;
          accepted = {
            target: acceptedTarget,
            clickedPoint: point,
            forceAttack: target.forceAttack === true,
            beforeCommandPath,
            afterCommandPath: commandPath,
            attempts,
          };
          break;
        }

        const stillSelected = (afterClickSelection?.result?.selected ?? [])
          .some((selected) => selected.id === unit.id);
        if (!stillSelected) {
          await reselectPickedUnit();
        }
      }

      if (accepted == null) {
        throw new Error(
          `[interact] no visible enemy target produced an attack dispatch; ` +
          `beforeCommandPath=${JSON.stringify(beforeCommandPath)}; ` +
          `attempts=${JSON.stringify(attempts)}`
        );
      }

      console.error("[interact] accepted attack target:", JSON.stringify({
        id: accepted.target.id,
        name: accepted.target.name,
        forceAttack: accepted.forceAttack === true,
        clickedPoint: accepted.clickedPoint,
        afterCommandPath: accepted.afterCommandPath,
      }));
      console.error("[interact] stepping 180 frames for attack order to affect object state...");
      await runRealEngineFrames(page, 180);

      const afterTargets = await page.evaluate(() =>
        window.CnCPort.rpc("queryDrawables"));
      const afterUnit = (afterTargets?.result?.drawables ?? [])
        .find((candidate) => candidate.id === unit.id);
      const afterTarget = (afterTargets?.result?.enemyDrawables ?? [])
        .find((candidate) => candidate.id === accepted.target.id);
      const beforeDistance = worldDistance2d(unit.worldPos, accepted.target.worldPos);
      const afterDistance = worldDistance2d(afterUnit?.worldPos, afterTarget?.worldPos);
      const unitDelta = worldDistance2d(unit.worldPos, afterUnit?.worldPos);
      const beforeHealth = accepted.target.body?.ready === true
        ? accepted.target.body.health
        : null;
      const afterHealth = afterTarget?.body?.ready === true
        ? afterTarget.body.health
        : null;
      const beforeDamageTimestamp = accepted.target.body?.lastDamageTimestamp ?? 0;
      const afterDamageTimestamp = afterTarget?.body?.lastDamageTimestamp ?? 0;
      const targetDamaged = (
        Number.isFinite(beforeHealth)
          && Number.isFinite(afterHealth)
          && afterHealth < beforeHealth - 0.1
      )
        || afterDamageTimestamp > beforeDamageTimestamp
        || afterTarget?.effectivelyDead === true;
      const unitMoved = Number.isFinite(unitDelta) && unitDelta > 1.0;
      const distanceClosed = Number.isFinite(beforeDistance)
        && Number.isFinite(afterDistance)
        && afterDistance < beforeDistance - 1.0;
      const postState = {
        unitDelta,
        beforeDistance,
        afterDistance,
        beforeHealth,
        afterHealth,
        beforeDamageTimestamp,
        afterDamageTimestamp,
        targetStillVisible: afterTarget != null,
        targetDamaged,
        unitMoved,
        distanceClosed,
      };
      console.error("[interact] attack post-state:", JSON.stringify(postState));
      if (!targetDamaged && !unitMoved && !distanceClosed) {
        throw new Error(
          `[interact] attack command dispatched but object state did not change; ` +
          `attack=${JSON.stringify(accepted)}; postState=${JSON.stringify(postState)}`
        );
      }

      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: attackScreenshot });
      return {
        target: {
          id: accepted.target.id,
          name: accepted.target.name,
          playerIndex: accepted.target.playerIndex,
          structure: accepted.target.structure,
          forceAttack: accepted.forceAttack === true,
          screenPos: accepted.target.screenPos,
          worldPos: accepted.target.worldPos,
        },
        clickedPoint: accepted.clickedPoint,
        beforeCommandPath: accepted.beforeCommandPath,
        afterCommandPath: accepted.afterCommandPath,
        attempts: accepted.attempts,
        postState,
        screenshotPath: attackScreenshot,
      };
    }

    if (proveGeneralsExp) {
      summary.generalsExp = await proveGeneralsExpHud();
      summary.screenshotPath = summary.generalsExp.screenshotPath;
      console.error("[interact] Generals Experience HUD proof accepted:", JSON.stringify(summary.generalsExp));
      if (!proveInteract && !proveRadar && !proveAttack && !proveAttackMove) {
        return summary;
      }
      selBefore = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
    }

    if (proveAttack) {
      summary.attackOrder = await proveAttackObjectOrder();
      summary.moveSource = "attackObject";
      summary.moveDelta = summary.attackOrder.postState?.unitDelta ?? null;
      summary.screenshotPath = summary.attackOrder.screenshotPath;
      console.error("[interact] attack proof accepted:", JSON.stringify(summary.attackOrder));
      if (!proveInteract && !proveRadar) {
        return summary;
      }
      selBefore = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
    }

    async function proveLeftHudRadarMove() {
      const currentFrame = await runRealEngineFrames(page, 1);
      const clientState = currentFrame?.frame?.clientState;
      const radar = clientState?.radar;
      const leftHud = clientState?.controlBarWindows?.leftHud;
      expect(radar?.ready === true && radar.usable === true,
        "[interact] radar is not usable for LeftHUD input",
        { radar, gameplay: clientState?.gameplay });
      expect(leftHud?.found === true
          && leftHud.clickable === true
          && leftHud.inputFunc === "LeftHUDInput",
        "[interact] ControlBar LeftHUD is not routed to LeftHUDInput",
        leftHud);

      const beforeCommandPath = selBefore?.result?.commandPath ?? {};
      const beforeMoveAppendCount = beforeCommandPath.moveAppendCount ?? 0;
      const beforeDispatchMoveCount = beforeCommandPath.dispatchMoveCommandCount ?? 0;
      const clampHudPoint = (point) => ({
        x: Math.max(leftHud.x + 3, Math.min(Math.round(point.x), leftHud.x + leftHud.width - 4)),
        y: Math.max(leftHud.y + 3, Math.min(Math.round(point.y), leftHud.y + leftHud.height - 4)),
      });
      const hudPoint = (fx, fy) => clampHudPoint({
        x: leftHud.x + leftHud.width * fx,
        y: leftHud.y + leftHud.height * fy,
      });
      const radarCandidates = [
        hudPoint(0.25, 0.25),
        hudPoint(0.75, 0.25),
        hudPoint(0.25, 0.75),
        hudPoint(0.75, 0.75),
        hudPoint(0.50, 0.20),
        hudPoint(0.80, 0.50),
        hudPoint(0.50, 0.80),
        hudPoint(0.20, 0.50),
        hudPoint(0.50, 0.50),
      ].filter((point, index, points) =>
        points.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y) === index);

      const attempts = [];
      let acceptedPoint = null;
      let acceptedSelection = null;
      for (const candidate of radarCandidates) {
        await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, candidate);
        await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
        await postShortRealEngineClick(page, moveClick, candidate);

        const radarSelection = await page.evaluate(() =>
          window.CnCPort.rpc("querySelection"));
        const commandPath = radarSelection?.result?.commandPath ?? {};
        const attempt = {
          point: candidate,
          ok: radarSelection?.ok === true,
          selectCount: radarSelection?.result?.selectCount,
          moveAppendCount: commandPath.moveAppendCount,
          dispatchMoveCommandCount: commandPath.dispatchMoveCommandCount,
        };
        attempts.push(attempt);
        console.error(
          "[interact] LeftHUD radar move candidate:",
          JSON.stringify(attempt));
        if ((commandPath.moveAppendCount ?? 0) > beforeMoveAppendCount
            || (commandPath.dispatchMoveCommandCount ?? 0) > beforeDispatchMoveCount) {
          acceptedPoint = candidate;
          acceptedSelection = radarSelection;
          break;
        }
      }

      if (acceptedPoint == null) {
        throw new Error(
          `[interact] LeftHUD radar click did not queue a move command; ` +
          `beforeCommandPath=${JSON.stringify(beforeCommandPath)}; ` +
          `attempts=${JSON.stringify(attempts)}`
        );
      }

      return {
        point: acceptedPoint,
        button: moveClick.name,
        radar,
        leftHud: {
          id: leftHud.id,
          x: leftHud.x,
          y: leftHud.y,
          width: leftHud.width,
          height: leftHud.height,
          inputFunc: leftHud.inputFunc,
          drawFunc: leftHud.drawFunc,
        },
        beforeCommandPath,
        afterCommandPath: acceptedSelection?.result?.commandPath ?? null,
        attempts,
      };
    }

    if (proveRadar) {
      summary.radarMove = await proveLeftHudRadarMove();
      console.error("[interact] LeftHUD radar move accepted:", JSON.stringify(summary.radarMove));
      selBefore = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
      if (!proveInteract) {
        summary.moveSource = "leftHudRadar";
        console.error("[interact] stepping 90 frames for radar-issued move...");
        await runRealEngineFrames(page, 90);
        const radarMoveDrawables = await page.evaluate(() =>
          window.CnCPort.rpc("queryDrawables"));
        const radarMovedUnit = (radarMoveDrawables?.result?.drawables ?? [])
          .find((d) => d.id === unit.id);
        if (radarMovedUnit?.worldPos != null) {
          const dx = radarMovedUnit.worldPos.x - unit.worldPos.x;
          const dy = radarMovedUnit.worldPos.y - unit.worldPos.y;
          summary.moveDelta = Math.sqrt(dx * dx + dy * dy);
          console.error(
            "[interact] radar-issued unit move delta:",
            summary.moveDelta,
            "dx:", dx, "dy:", dy);
        }
        const MOVE_DELTA_THRESHOLD = 1.0;
        if (summary.moveDelta == null || summary.moveDelta <= MOVE_DELTA_THRESHOLD) {
          throw new Error(
            `[interact] radar-issued move did not move unit: delta=${summary.moveDelta} ` +
            `(threshold=${MOVE_DELTA_THRESHOLD}); ` +
            `radarMove=${JSON.stringify(summary.radarMove)}`
          );
        }
        await mkdir(screenshotDir, { recursive: true });
        await page.screenshot({ path: interactScreenshot });
        summary.screenshotPath = interactScreenshot;
        console.error("[interact] screenshot saved to", interactScreenshot);
        return summary;
      }
    }

    const clampPoint = (point) => ({
      x: Math.max(16, Math.min(Math.round(point.x), displayWidth - 16)),
      y: Math.max(16, Math.min(Math.round(point.y), displayHeight - 140)),
    });
    const candidateDestinations = [
      clampPoint({ x: unit.screenPos.x + 200, y: unit.screenPos.y }),
      clampPoint({ x: unit.screenPos.x + 220, y: unit.screenPos.y + 80 }),
      clampPoint({ x: unit.screenPos.x + 160, y: unit.screenPos.y + 140 }),
      clampPoint({ x: unit.screenPos.x - 200, y: unit.screenPos.y }),
      clampPoint({ x: unit.screenPos.x - 220, y: unit.screenPos.y + 80 }),
      clampPoint({ x: unit.screenPos.x, y: unit.screenPos.y + 180 }),
      clampPoint({ x: displayWidth - 96, y: Math.floor(displayHeight * 0.45) }),
      clampPoint({ x: Math.floor(displayWidth * 0.5), y: Math.floor(displayHeight * 0.55) }),
      clampPoint({ x: 96, y: Math.floor(displayHeight * 0.45) }),
    ].filter((point, index, points) =>
      points.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y) === index);

    const leftClick = {
      name: "left",
      down: win32MouseMessages.leftButtonDown,
      up: win32MouseMessages.leftButtonUp,
    };
    const isAttackMoveArmed = (selection) =>
      selection?.result?.modes?.attackMoveTo === true
        || selection?.result?.guiCommand?.typeName === "GUI_COMMAND_ATTACK_MOVE";
    const commandButtonEntries = (controlBarWindows) =>
      Object.entries(controlBarWindows ?? {})
        .filter(([name, button]) =>
          /^buttonCommand\d+$/.test(name) && button?.found === true);
    const compactCommandButton = ([name, button]) => ({
      slot: name,
      id: button.id,
      x: button.x,
      y: button.y,
      width: button.width,
      height: button.height,
      centerX: button.centerX,
      centerY: button.centerY,
      clickable: button.clickable,
      hidden: button.hidden,
      enabled: button.enabled,
      inputFunc: button.inputFunc,
      command: button.command,
    });
    const clickGameWindowButton = async (button) => {
      const point = {
        x: Math.round(button.centerX ?? (button.x + button.width / 2)),
        y: Math.round(button.centerY ?? (button.y + button.height / 2)),
      };
      await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, point);
      await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonDown, point);
      await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonUp, point);
      await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      return point;
    };

    async function findAttackMoveButton() {
      const frame = await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      const buttons = commandButtonEntries(frame?.frame?.clientState?.controlBarWindows)
        .map(compactCommandButton);
      const attackMoveButton = buttons.find((button) =>
        button.clickable === true
          && button.hidden !== true
          && button.command?.typeName === "GUI_COMMAND_ATTACK_MOVE");
      return { frame, buttons, attackMoveButton };
    }

    async function armAttackMoveCommand() {
      let selection = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
      if (isAttackMoveArmed(selection)) {
        return {
          alreadyArmed: true,
          buttonPoint: null,
          attackMoveButton: null,
          buttons: [],
          selection,
        };
      }

      const buttonState = await findAttackMoveButton();
      expect(buttonState.attackMoveButton != null,
        "[interact] selected unit command bar does not expose a clickable attack-move button",
        {
          buttons: buttonState.buttons,
          selectCount: selection?.result?.selectCount,
          selected: selection?.result?.selected,
        });

      const buttonPoint = await clickGameWindowButton(buttonState.attackMoveButton);
      selection = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
      if (!isAttackMoveArmed(selection)) {
        await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
        selection = await page.evaluate(() =>
          window.CnCPort.rpc("querySelection"));
      }
      expect(isAttackMoveArmed(selection),
        "[interact] attack-move command button did not arm attack-move",
        {
          button: buttonState.attackMoveButton,
          buttonPoint,
          buttons: buttonState.buttons,
          selection: selection?.result,
        });

      return {
        alreadyArmed: false,
        buttonPoint,
        attackMoveButton: buttonState.attackMoveButton,
        buttons: buttonState.buttons,
        selection,
      };
    }

    async function proveAttackMoveOrder() {
      const attempts = [];
      let accepted = null;
      for (const candidate of candidateDestinations) {
        const armed = await armAttackMoveCommand();
        const beforeCommandPath = armed.selection?.result?.commandPath ?? {};
        const beforeDispatchMoveCount = beforeCommandPath.dispatchMoveCommandCount ?? 0;
        const destinationClick =
          armed.selection?.result?.guiCommand?.typeName === "GUI_COMMAND_ATTACK_MOVE"
            ? leftClick
            : moveClick;

        await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, candidate);
        await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
        await postShortRealEngineClick(page, destinationClick, candidate);

        const afterClickSelection = await page.evaluate(() =>
          window.CnCPort.rpc("querySelection"));
        const commandPath = afterClickSelection?.result?.commandPath ?? {};
        const attempt = {
          destination: candidate,
          destinationClick: destinationClick.name,
          armedByButton: armed.alreadyArmed !== true,
          buttonPoint: armed.buttonPoint,
          button: armed.attackMoveButton,
          modeBeforeDestination: armed.selection?.result?.modes,
          guiCommandBeforeDestination: armed.selection?.result?.guiCommand,
          selectCount: afterClickSelection?.result?.selectCount,
          selectedIds: (afterClickSelection?.result?.selected ?? [])
            .map((selected) => selected.id),
          dispatchMoveCommandCount: commandPath.dispatchMoveCommandCount,
          dispatchLastMoveCommandTypeName: commandPath.dispatchLastMoveCommandTypeName,
          dispatchLastMoveHadGroup: commandPath.dispatchLastMoveHadGroup,
          moveLastMsgTypeName: commandPath.moveLastMsgTypeName,
        };
        attempts.push(attempt);
        console.error("[interact] attack-move destination candidate:", JSON.stringify(attempt));

        const moveDispatchAdvanced =
          (commandPath.dispatchMoveCommandCount ?? 0) > beforeDispatchMoveCount;
        if (moveDispatchAdvanced
            && commandPath.dispatchLastMoveCommandTypeName === "MSG_DO_ATTACKMOVETO"
            && commandPath.dispatchLastMoveHadGroup === 1) {
          accepted = {
            destination: candidate,
            destinationClick: destinationClick.name,
            button: armed.attackMoveButton,
            buttonPoint: armed.buttonPoint,
            beforeCommandPath,
            afterCommandPath: commandPath,
            attempts,
          };
          break;
        }

        if (moveDispatchAdvanced) {
          throw new Error(
            `[interact] attack-move destination dispatched ` +
            `${commandPath.dispatchLastMoveCommandTypeName} instead of MSG_DO_ATTACKMOVETO; ` +
            `attempt=${JSON.stringify(attempt)}`
          );
        }

        const stillSelected = (afterClickSelection?.result?.selected ?? [])
          .some((selected) => selected.id === unit.id);
        if (!stillSelected) {
          await reselectPickedUnit();
        }
      }

      if (accepted == null) {
        throw new Error(
          `[interact] no attack-move destination produced MSG_DO_ATTACKMOVETO; ` +
          `attempts=${JSON.stringify(attempts)}`
        );
      }

      console.error("[interact] accepted attack-move destination:", JSON.stringify({
        destination: accepted.destination,
        destinationClick: accepted.destinationClick,
        button: accepted.button,
        afterCommandPath: accepted.afterCommandPath,
      }));
      console.error("[interact] stepping 120 frames for attack-move order to affect unit state...");
      await runRealEngineFrames(page, 120);

      const afterDrawables = await page.evaluate(() =>
        window.CnCPort.rpc("queryDrawables"));
      const afterUnit = (afterDrawables?.result?.drawables ?? [])
        .find((candidate) => candidate.id === unit.id);
      const unitDelta = worldDistance2d(unit.worldPos, afterUnit?.worldPos);
      const afterSelection = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
      const postState = {
        unitDelta,
        beforeWorldPos: unit.worldPos,
        afterWorldPos: afterUnit?.worldPos ?? null,
        selectCount: afterSelection?.result?.selectCount,
        modes: afterSelection?.result?.modes,
        commandPath: afterSelection?.result?.commandPath,
      };
      console.error("[interact] attack-move post-state:", JSON.stringify(postState));
      if (!Number.isFinite(unitDelta) || unitDelta <= 1.0) {
        throw new Error(
          `[interact] attack-move dispatch did not move the unit: ` +
          `postState=${JSON.stringify(postState)}; accepted=${JSON.stringify(accepted)}`
        );
      }

      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: attackMoveScreenshot });
      return {
        destination: accepted.destination,
        destinationClick: accepted.destinationClick,
        button: accepted.button,
        buttonPoint: accepted.buttonPoint,
        beforeCommandPath: accepted.beforeCommandPath,
        afterCommandPath: accepted.afterCommandPath,
        attempts: accepted.attempts,
        postState,
        screenshotPath: attackMoveScreenshot,
      };
    }

    if (proveAttackMove) {
      summary.attackMoveOrder = await proveAttackMoveOrder();
      summary.moveSource = "attackMove";
      summary.moveDelta = summary.attackMoveOrder.postState?.unitDelta ?? null;
      summary.screenshotPath = summary.attackMoveOrder.screenshotPath;
      console.error("[interact] attack-move proof accepted:", JSON.stringify(summary.attackMoveOrder));
      if (!proveInteract && !proveRadar) {
        return summary;
      }
      selBefore = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
    }

    const beforeMoveAppendCount = selBefore?.result?.commandPath?.moveAppendCount ?? 0;
    const beforeDispatchMoveCount = selBefore?.result?.commandPath?.dispatchMoveCommandCount ?? 0;
    let selAfterMoveClick = null;
    let destPoint = null;
    for (const candidate of candidateDestinations) {
      await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, candidate);
      await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      await postShortRealEngineClick(page, moveClick, candidate);
      selAfterMoveClick = await page.evaluate(() =>
        window.CnCPort.rpc("querySelection"));
      const commandPath = selAfterMoveClick?.result?.commandPath ?? {};
      console.error(
        "[interact] querySelection after move click candidate:",
        JSON.stringify(candidate),
        "ok:", selAfterMoveClick?.ok,
        "selectCount:", selAfterMoveClick?.result?.selectCount,
        "selectedControllable:", selAfterMoveClick?.result?.selectedControllable,
        "commandPath:", JSON.stringify(commandPath));
      if ((commandPath.moveAppendCount ?? 0) > beforeMoveAppendCount
          || (commandPath.dispatchMoveCommandCount ?? 0) > beforeDispatchMoveCount) {
        destPoint = candidate;
        break;
      }

      const stillSelected = (selAfterMoveClick?.result?.selected ?? [])
        .some((selected) => selected.id === unit.id);
      if (!stillSelected) {
        await postRealEngineMouseMessage(page, win32MouseMessages.mouseMove, clickPoint);
        await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
        await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonDown, clickPoint);
        await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
        await postRealEngineMouseMessage(page, win32MouseMessages.leftButtonUp, clickPoint);
        await runRealEngineFrames(page, CLICK_FORWARD_FRAMES);
      }
    }
    if (destPoint == null) {
      throw new Error(
        `[interact] no move command was created for any destination candidate; ` +
        `lastCommandPath=${JSON.stringify(selAfterMoveClick?.result?.commandPath)}`
      );
    }
    console.error("[interact] accepted move destination:", JSON.stringify(destPoint));
    summary.moveSource = proveRadar ? "screenAfterLeftHudRadar" : "screen";

    // 6. Step ~90 frames.
    console.error("[interact] stepping 90 frames for unit to move...");
    await runRealEngineFrames(page, 90);

    // 7. queryDrawables again → find same unit by id → compute worldPos delta.
    const dr2 = await page.evaluate(() =>
      window.CnCPort.rpc("queryDrawables"));
    console.error("[interact] queryDrawables (2nd) ok:", dr2?.ok, "aborted:", dr2?.aborted, "abortMessage:", dr2?.abortMessage, "started:", dr2?.result?.started, "ready:", dr2?.result?.ready, "guard:", dr2?.result?.guard, "localPlayerIndex:", dr2?.result?.localPlayerIndex, "stats:", JSON.stringify(dr2?.result?.stats), "drawables:", (dr2?.result?.drawables ?? []).length);
    const drawables2 = dr2?.result?.drawables ?? [];
    const unit2 = drawables2.find((d) => d.id === unit.id);
    const selAfterMoveStep = await page.evaluate(() =>
      window.CnCPort.rpc("querySelection"));
    console.error(
      "[interact] querySelection after move frames ok:",
      selAfterMoveStep?.ok,
      "selectCount:", selAfterMoveStep?.result?.selectCount,
      "selectedControllable:", selAfterMoveStep?.result?.selectedControllable,
      "commandPath:", JSON.stringify(selAfterMoveStep?.result?.commandPath));
    if (unit2 && unit2.worldPos) {
      const dx = unit2.worldPos.x - unit.worldPos.x;
      const dy = unit2.worldPos.y - unit.worldPos.y;
      const delta = Math.sqrt(dx * dx + dy * dy);
      summary.moveDelta = delta;
      console.error(
        "[interact] unit moved delta:", delta,
        "dx:", dx, "dy:", dy
      );
    } else {
      console.error("[interact] unit not found in drawables2 or no worldPos");
    }

    // 7b. Load-bearing assertion: unit MUST have moved.
    const MOVE_DELTA_THRESHOLD = 1.0; // world units — units move noticeably in 90 frames
    if (summary.moveDelta == null || summary.moveDelta <= MOVE_DELTA_THRESHOLD) {
      throw new Error(
        `[interact] unit did not move: delta=${summary.moveDelta} (threshold=${MOVE_DELTA_THRESHOLD}); ` +
        `unitPicked=${JSON.stringify(summary.unitPicked)}; ` +
        `commandPath=${JSON.stringify(selAfterMoveStep?.result?.commandPath)}`
      );
    }

    // 8. Screenshot.
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: interactScreenshot });
    summary.screenshotPath = interactScreenshot;
    console.error("[interact] screenshot saved to", interactScreenshot);

    return summary;
  }

  const interactResult = (proveInteract || proveRadar || proveAttack || proveAttackMove || proveGeneralsExp)
    ? await selectAndMoveUnit(realInitPage)
    : null;

  console.log(JSON.stringify({
    ok: true,
    mode: "real-init",
    url: harnessUrl,
    screenshots: [
      realInitScreenshot,
      realInitMenuClickScreenshot,
      realInitCampaignStartScreenshot,
      ...(realPostCampaignScreenshotPath !== null ? [realPostCampaignScreenshotPath] : []),
      ...(interactResult?.screenshotPath != null ? [interactResult.screenshotPath] : []),
    ],
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
      interactResult: interactResult,
      screenshot: realInitScreenshot,
    },
  }));
} finally {
  await browser?.close();
  await server.close();
}
