#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotsRoot = resolve(wasmRoot, "artifacts/screenshots");
const artifactsRoot = resolve(wasmRoot, "artifacts/skirmish");

const GAME_SKIRMISH = 2;
const WIN_STATUS_IMAGE = 0x80;
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;

const archiveSpecs = [
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
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

const screenshotPath = resolve(
  process.env.SKIRMISH_START_SCREENSHOT ??
    resolve(screenshotsRoot, "skirmish-start-smoke.png"));
const loadingScreenshotPath = resolve(
  process.env.SKIRMISH_START_LOADING_SCREENSHOT ??
    resolve(screenshotsRoot, "skirmish-start-loading-screen.png"));
const outputPath = resolve(
  process.env.SKIRMISH_START_OUTPUT ??
    resolve(artifactsRoot, "skirmish-start-smoke.json"));
const maxStartFrames = parsePositiveInt("SKIRMISH_START_MAX_FRAMES", 4200);
const frameChunk = parsePositiveInt("SKIRMISH_START_FRAME_CHUNK", 30);
const expectPostActiveSurvival = process.env.SKIRMISH_START_EXPECT_SURVIVE === "1";
const expectMenuMusicStop = process.env.SKIRMISH_START_EXPECT_MUSIC_STOP === "1";
const expectEscMenuResume = process.env.SKIRMISH_START_EXPECT_ESC_MENU_RESUME === "1";
const expectEnemyStartAssets = process.env.SKIRMISH_START_EXPECT_ENEMY_START_ASSETS === "1";
const expectEnemyAiActivity = process.env.SKIRMISH_START_EXPECT_ENEMY_AI_ACTIVITY === "1";
const collectPlayerDiagnostics = expectEnemyStartAssets || expectEnemyAiActivity;
const requestedPostActiveFrames = parsePositiveInt("SKIRMISH_START_POST_ACTIVE_FRAMES", 0);
const enemyAiActivityFrames = parsePositiveInt("SKIRMISH_START_ENEMY_AI_ACTIVITY_FRAMES", 1200);
const postActiveFrames = expectEnemyAiActivity
  ? Math.max(requestedPostActiveFrames, enemyAiActivityFrames)
  : requestedPostActiveFrames;
const postActiveFrameChunk = parsePositiveInt("SKIRMISH_START_POST_ACTIVE_CHUNK", frameChunk);
const musicStopMaxFrames = parsePositiveInt("SKIRMISH_START_MUSIC_STOP_MAX_FRAMES", 360);
const requestedSkirmishMap = String(process.env.SKIRMISH_START_MAP ?? "").trim();
const captureD3D8History = process.env.SKIRMISH_START_CAPTURE_D3D8_HISTORY === "1";
const distDir = parseDistDir();

function parsePositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseDistDir() {
  const value = process.env.SKIRMISH_START_DIST ?? "dist";
  if (!/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value)) {
    throw new Error(`Invalid SKIRMISH_START_DIST: ${value}`);
  }
  return value;
}

function expect(condition, message, payload = null) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function buildArchives(baseUrl) {
  return archiveSpecs.map((spec) => {
    const sourceName = spec.sourceName ?? spec.name;
    return {
      name: spec.name,
      sourceName,
      url: new URL(`artifacts/real-assets/${sourceName}`, baseUrl).href,
    };
  });
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

function compactGameplay(frame) {
  const gameplay = frame?.gameplay ?? frame?.clientState?.gameplay ?? null;
  const display = frame?.display ?? frame?.clientState?.display ?? null;
  return {
    framesCompleted: frame?.framesCompleted ?? null,
    gameMode: gameplay?.gameMode ?? null,
    inGame: gameplay?.inGame ?? null,
    loadingMap: gameplay?.loadingMap ?? null,
    objectCount: gameplay?.objectCount ?? null,
    drawableCount: gameplay?.drawableCount ?? null,
    renderedObjectCount: gameplay?.renderedObjectCount ?? null,
    inputEnabled: gameplay?.inputEnabled ?? null,
    localPlayer: gameplay?.localPlayer ?? null,
    ai: gameplay?.ai ?? null,
    playerDiagnostics: gameplay?.playerDiagnostics ?? null,
    display,
  };
}

function locateNested(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = locateNested(v, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function pixelHasVisibleColor(pixel, threshold = 8) {
  return Array.isArray(pixel)
    && pixel.length >= 4
    && pixel[3] >= 200
    && pixel.slice(0, 3).some((component) => component > threshold);
}

async function sampleViewportGrid(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, error: "viewport canvas is missing" };
    }
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl == null) {
      return { ok: false, error: "viewport WebGL context is missing" };
    }

    const samplePoints = [
      { name: "upperLeft", x: 0.18, y: 0.18 },
      { name: "upperCenter", x: 0.50, y: 0.18 },
      { name: "upperRight", x: 0.82, y: 0.18 },
      { name: "midLeft", x: 0.18, y: 0.44 },
      { name: "center", x: 0.50, y: 0.44 },
      { name: "midRight", x: 0.82, y: 0.44 },
      { name: "lowerLeft", x: 0.18, y: 0.68 },
      { name: "lowerCenter", x: 0.50, y: 0.68 },
      { name: "lowerRight", x: 0.82, y: 0.68 },
      { name: "hudLeft", x: 0.22, y: 0.88 },
      { name: "hudCenter", x: 0.50, y: 0.88 },
      { name: "hudRight", x: 0.78, y: 0.88 },
    ];
    const pixels = {};
    const pixel = new Uint8Array(4);
    for (const point of samplePoints) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x * canvas.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y * canvas.height)));
      gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      pixels[point.name] = Array.from(pixel);
    }

    const colors = Object.values(pixels).map((value) => value.join(","));
    const visible = Object.values(pixels).filter((value) =>
      value.length >= 4 &&
      value[3] >= 200 &&
      (value[0] > 8 || value[1] > 8 || value[2] > 8));
    return {
      ok: true,
      width: canvas.width,
      height: canvas.height,
      sampleCount: samplePoints.length,
      visibleSampleCount: visible.length,
      uniqueColorCount: new Set(colors).size,
      pixels,
    };
  });
}

function compactClickFrame(frameResult) {
  const clientState = frameResult?.frame?.clientState ?? {};
  return {
    framesCompleted: frameResult?.frame?.framesCompleted ?? null,
    shell: clientState.shell ?? null,
    transition: clientState.transition ?? null,
    gameplay: compactGameplay(frameResult?.frame),
    mouse: clientState.input?.mouse ?? null,
    top: clientState.shell?.topFilename ?? null,
    mainMenu: {
      buttonSinglePlayer: clientState.mainMenu?.buttonSinglePlayer ?? null,
      buttonSkirmish: clientState.mainMenu?.buttonSkirmish ?? null,
    },
    skirmishMenu: {
      parent: clientState.skirmishMenu?.parent ?? null,
      buttonStart: clientState.skirmishMenu?.buttonStart ?? null,
    },
    quitMenu: {
      visible: clientState.quitMenu?.visible ?? null,
      quitMenuSystemLookup: clientState.quitMenu?.quitMenuSystemLookup ?? null,
      fullParent: clientState.quitMenu?.fullParent ?? null,
      noSaveParent: clientState.quitMenu?.noSaveParent ?? null,
      buttonReturnFull: clientState.quitMenu?.buttonReturnFull ?? null,
      buttonReturnNoSave: clientState.quitMenu?.buttonReturnNoSave ?? null,
      underButtonReturnFullCenter: clientState.quitMenu?.underButtonReturnFullCenter ?? null,
      underButtonReturnNoSaveCenter: clientState.quitMenu?.underButtonReturnNoSaveCenter ?? null,
    },
  };
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function resumeAudio(page) {
  const point = await page.evaluate(() => {
    const target = document.querySelector("#viewport");
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2)),
      y: rect.top + Math.max(1, Math.min(rect.height - 1, rect.height / 2)),
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(async () => {
    const result = await window.CnCPort.rpc("browserAudioRuntime");
    return result.browserAudioRuntime?.contextState === "running"
      && result.browserAudioRuntime?.resumeSuccesses >= 1;
  }, null, { timeout: 5000 });
  return rpc(page, "browserAudioRuntime");
}

async function streamRuntime(page) {
  const runtime = await rpc(page, "browserAudioRuntime");
  return runtime.state?.browserMssStreamPlaybackRuntime ?? null;
}

function activeStreamHandles(runtime) {
  return (runtime?.activeStreamHandles ?? [])
    .map((handle) => Number(handle))
    .filter((handle) => Number.isFinite(handle));
}

function handleClosed(runtime, handle) {
  return (runtime?.eventLog ?? []).some((event) =>
    event.phase === "AIL_close_stream" && Number(event.handle) === Number(handle));
}

async function waitForActiveMusic(page, label, maxFrames = 240) {
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced < maxFrames) {
    const runtime = await streamRuntime(page);
    const handles = activeStreamHandles(runtime);
    samples.push({
      framesAdvanced,
      activeSources: runtime?.activeSources ?? null,
      activeStreamHandles: handles,
      lastEvent: runtime?.lastEvent ?? null,
      lastError: runtime?.lastError ?? null,
    });
    if (runtime?.lastError) {
      throw new Error(`${label} Web Audio stream runtime reported an error: ${runtime.lastError}`);
    }
    if (handles.length > 0 && runtime?.lastEvent?.nodeGraph?.includes("musicGainNode")) {
      return { runtime, handles, framesAdvanced, samples };
    }
    await runSummary(page, 4, label);
    framesAdvanced += 4;
  }
  expect(false, `${label} did not start an active music stream`, {
    maxFrames,
    samples: samples.slice(-16),
  });
}

async function waitForHandlesClosed(page, handles, label, maxFrames) {
  const targets = handles.map((handle) => Number(handle));
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced <= maxFrames) {
    const runtime = await streamRuntime(page);
    const active = activeStreamHandles(runtime);
    const remainingActive = targets.filter((handle) => active.includes(handle));
    const missingCloseEvents = targets.filter((handle) => !handleClosed(runtime, handle));
    samples.push({
      framesAdvanced,
      activeStreamHandles: active,
      remainingActive,
      missingCloseEvents,
      stopped: runtime?.stopped ?? null,
      volumeUpdates: runtime?.volumeUpdates ?? null,
      lastVolumeUpdate: runtime?.lastVolumeUpdate ?? null,
      lastEvent: runtime?.lastEvent ?? null,
      lastError: runtime?.lastError ?? null,
    });
    if (runtime?.lastError) {
      throw new Error(`${label} Web Audio stream runtime reported an error: ${runtime.lastError}`);
    }
    if (remainingActive.length === 0 && missingCloseEvents.length === 0) {
      return { runtime, framesAdvanced, samples };
    }
    if (framesAdvanced >= maxFrames) {
      break;
    }
    const frames = Math.min(frameChunk, maxFrames - framesAdvanced);
    await runSummary(page, frames, label);
    framesAdvanced += frames;
  }
  expect(false, `${label} did not close the pre-skirmish music handles`, {
    handles: targets,
    maxFrames,
    samples: samples.slice(-16),
  });
}

function assertFrameResult(result, label) {
  expect(result?.ok === true && result?.aborted === false,
    `${label} frame RPC failed`, {
      aborted: result?.aborted,
      abortMessage: result?.abortMessage,
      abortStack: result?.abortStack,
      lastUpdateTarget: result?.lastUpdateTarget,
      lastGameLogicStep: result?.lastGameLogicStep,
      frame: result?.frame,
    });
  expect(result.frame?.exceptionCaught === false,
    `${label} frame caught a C++ exception`, result.frame);
  expect(result.frame?.quitting === false,
    `${label} frame requested quit`, result.frame);
  return result;
}

async function runFrames(page, frames, label = "real engine") {
  return assertFrameResult(
    await rpc(page, "realEngineFrame", { frames, playerDiagnostics: collectPlayerDiagnostics }),
    label);
}

async function runSummary(page, frames, label = "real engine summary") {
  return assertFrameResult(
    await rpc(page, "realEngineFrameSummary", { frames, playerDiagnostics: collectPlayerDiagnostics }),
    label);
}

async function postMouse(page, message, point) {
  const result = await rpc(page, "postMessage", {
    message,
    lParam: win32PointLParam(point),
    point,
  });
  expect(result?.ok === true, "mouse message was not posted", result);
  return result;
}

function realMenuHitMatches(menu, hitProbeName, buttonFieldName) {
  const hitWindow = menu?.[hitProbeName]?.window;
  const button = menu?.[buttonFieldName];
  return button?.clickable === true && hitWindow?.found === true && hitWindow.id === button.id;
}

function collectWindowRefs(clientState) {
  const refs = [];
  for (const group of [clientState?.mainMenu, clientState?.skirmishMenu, clientState?.quitMenu]) {
    for (const value of Object.values(group ?? {})) {
      if (value?.found === true && Number.isFinite(value.id)) {
        refs.push(value);
      }
      if (value?.window?.found === true && Number.isFinite(value.window.id)) {
        refs.push(value.window);
      }
    }
  }
  for (const field of ["focusWindow", "captureWindow", "grabWindow"]) {
    const ref = clientState?.input?.[field];
    if (ref?.found === true && Number.isFinite(ref.id)) {
      refs.push(ref);
    }
  }
  return refs;
}

function findWindowById(clientState, id) {
  return collectWindowRefs(clientState).find((ref) => ref.id === id) ?? null;
}

async function waitForCondition(page, label, predicate, maxFrames = 180) {
  const attempts = [];
  let last = null;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    last = await runFrames(page, 1, label);
    attempts.push(compactClickFrame(last));
    if (predicate(last.frame?.clientState ?? {}, last)) {
      return last;
    }
  }
  expect(false, `${label} did not satisfy condition`, {
    attempts: attempts.slice(-12),
    last: compactClickFrame(last),
  });
}

async function waitForBrowserInput(page, predicate, label) {
  const deadline = Date.now() + 5000;
  let result = await rpc(page, "state");

  while (true) {
    if (predicate(result.state?.browserInput)) {
      return result.state.browserInput;
    }
    if (Date.now() >= deadline) {
      break;
    }
    await page.waitForTimeout(20);
    result = await rpc(page, "state");
  }

  expect(false, `${label} browser input state not observed`, result.state?.browserInput ?? null);
}

async function waitForTransitionIdle(page, label, maxFrames = 120) {
  return waitForCondition(
    page,
    label,
    (clientState) => clientState.transition?.ready === true &&
      clientState.transition?.finished === true,
    maxFrames);
}

async function revealMainMenu(page) {
  const seedPoint = { x: 32, y: 32 };
  const revealPoint = { x: 96, y: 96 };
  await postMouse(page, WM_MOUSEMOVE, seedPoint);
  await waitForCondition(
    page,
    "main-menu seed mouse move",
    (clientState) => clientState.input?.mouse?.x === seedPoint.x &&
      clientState.input?.mouse?.y === seedPoint.y,
    12);

  await postMouse(page, WM_MOUSEMOVE, revealPoint);
  return waitForCondition(
    page,
    "main-menu reveal",
    (clientState) => clientState.input?.mouse?.x === revealPoint.x &&
      clientState.input?.mouse?.y === revealPoint.y &&
      clientState.transition?.finished === true &&
      clientState.input?.mouse?.visible === true &&
      clientState.gates?.breakTheMovie === false &&
      realMenuHitMatches(clientState.mainMenu, "underButtonSinglePlayerCenter", "buttonSinglePlayer"),
    120);
}

async function waitForButtonDown(page, target, label, maxFrames = 12) {
  return waitForCondition(
    page,
    `${label} down`,
    (clientState) => {
      const downTarget = findWindowById(clientState, target.id);
      return clientState.input?.grabWindow?.id === target.id && downTarget?.selected === true;
    },
    maxFrames);
}

async function waitForButtonReleased(page, target, label, maxFrames = 12) {
  return waitForCondition(
    page,
    `${label} release`,
    (clientState) => {
      const finalTarget = findWindowById(clientState, target.id);
      return finalTarget == null || finalTarget.selected === false;
    },
    maxFrames);
}

async function clickButton(page, button, hitProbe, label, settleFrames = 120) {
  expect(button?.clickable === true, `${label} button is not clickable`, button);
  const point = hitProbe?.point ?? { x: button.centerX, y: button.centerY };
  expect(Number.isFinite(point.x) && Number.isFinite(point.y),
    `${label} click point is invalid`, { button, hitProbe, point });
  const target = hitProbe?.window?.found === true ? hitProbe.window : button;
  expect(target?.clickable === true, `${label} target is not clickable`, { button, hitProbe, target });

  await postMouse(page, WM_MOUSEMOVE, point);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await waitForButtonDown(page, target, label);
  await postMouse(page, WM_LBUTTONUP, point);
  const released = await waitForButtonReleased(page, target, label);
  const settled = settleFrames == null ? released : await waitForTransitionIdle(page, label, settleFrames);
  return { point, target, released, settled };
}

function visibleQuitMenuReturnButton(quitMenu) {
  if (!quitMenu?.visible) {
    return null;
  }
  for (const button of [quitMenu.buttonReturnNoSave, quitMenu.buttonReturnFull]) {
    if (button?.clickable === true && button.hidden === false && button.managerHidden === false) {
      return button;
    }
  }
  return null;
}

function visibleQuitMenuReturnHitProbe(quitMenu, button) {
  const candidates = [
    quitMenu?.underButtonReturnNoSaveCenter,
    quitMenu?.underButtonReturnFullCenter,
  ];
  return candidates.find((probe) => probe?.window?.found === true &&
    probe.window.id === button?.id) ?? null;
}

async function driveEscMenuResume(page) {
  const before = await runFrames(page, 1, "esc menu precheck");
  expect(before.frame?.clientState?.gameplay?.inGame === true &&
      before.frame.clientState.gameplay.gameMode === GAME_SKIRMISH &&
      before.frame.clientState.gameplay.loadingMap === false,
    "ESC menu check requires an active skirmish", before.frame?.clientState?.gameplay);

  await page.keyboard.down("Escape");
  await waitForBrowserInput(
    page,
    (input) => input?.messageQueue?.count >= 1 &&
      input?.keyboardMessageQueue?.count >= 1,
    "Escape keydown");
  const opened = await waitForCondition(
    page,
    "quit menu open",
    (clientState) => clientState.quitMenu?.visible === true &&
      clientState.gameplay?.gamePaused === true &&
      visibleQuitMenuReturnButton(clientState.quitMenu)?.clickable === true,
    120);
  await page.keyboard.up("Escape");
  await waitForBrowserInput(
    page,
    (input) => input?.messageQueue?.count >= 1 &&
      input?.keyboardMessageQueue?.count >= 1,
    "Escape keyup");
  await runFrames(page, 1, "quit menu escape release");

  const returnButton = visibleQuitMenuReturnButton(opened.frame?.clientState?.quitMenu);
  const returnHit = visibleQuitMenuReturnHitProbe(opened.frame?.clientState?.quitMenu, returnButton);
  expect(returnButton?.clickable === true, "quit menu Return button was not clickable",
    opened.frame?.clientState?.quitMenu);

  const resumeClick = await clickButton(
    page,
    returnButton,
    returnHit,
    "quit-menu return",
    null);
  const closed = await waitForCondition(
    page,
    "quit menu close",
    (clientState) => clientState.quitMenu?.visible === false &&
      clientState.gameplay?.gamePaused === false,
    120);

  return {
    opened: {
      gameplay: opened.frame?.clientState?.gameplay ?? null,
      quitMenu: opened.frame?.clientState?.quitMenu ?? null,
    },
    returnClick: {
      point: resumeClick.point,
      target: resumeClick.target,
      releasedGameplay: resumeClick.released.frame?.clientState?.gameplay ?? null,
    },
    closed: {
      gameplay: closed.frame?.clientState?.gameplay ?? null,
      quitMenu: closed.frame?.clientState?.quitMenu ?? null,
    },
  };
}

async function waitForSkirmishMatch(page) {
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced < maxStartFrames) {
    const frames = Math.min(frameChunk, maxStartFrames - framesAdvanced);
    const result = await runSummary(page, frames, "skirmish match wait");
    framesAdvanced += frames;
    const gameplay = result.frame?.gameplay;
    const sample = compactGameplay(result.frame);
    samples.push(sample);
    if (gameplay?.gameMode === GAME_SKIRMISH &&
        gameplay?.inGame === true &&
        gameplay?.loadingMap === false &&
        gameplay?.inputEnabled === true &&
        Number(gameplay?.objectCount ?? 0) > 0 &&
        Number(gameplay?.drawableCount ?? 0) > 0 &&
        Number(gameplay?.renderedObjectCount ?? 0) > 0) {
      return { result, framesAdvanced, samples };
    }
  }
  expect(false, "skirmish did not reach an active match", {
    maxStartFrames,
    samples: samples.slice(-12),
  });
}

async function runPostActiveFrames(page, totalFrames, chunkSize) {
  const samples = [];
  let framesAdvanced = 0;
  let last = null;
  while (framesAdvanced < totalFrames) {
    const frames = Math.min(chunkSize, totalFrames - framesAdvanced);
    last = await runSummary(page, frames, "skirmish post-active wait");
    framesAdvanced += frames;
    samples.push(compactGameplay(last.frame));
  }
  return { result: last, framesAdvanced, samples };
}

function indexedPlayers(diagnostics) {
  const players = diagnostics?.players;
  if (!Array.isArray(players)) return new Map();
  return new Map(players.map((player) => [Number(player.index), player]));
}

function enemyAiPlayers(diagnostics) {
  const players = diagnostics?.players;
  if (!Array.isArray(players)) return [];
  return players.filter((player) =>
    player?.local !== true &&
    player?.skirmishAI === true &&
    player?.relationshipToLocal === "enemy");
}

function summarizeEnemyStartAssets(gameplay) {
  const diagnostics = gameplay?.playerDiagnostics;
  const players = Array.isArray(diagnostics?.players) ? diagnostics.players : [];
  const enemies = enemyAiPlayers(diagnostics);
  const neutralCommandCenters = players
    .filter((player) => player?.relationshipToLocal === "neutral")
    .reduce((count, player) => count + Number(player?.objects?.commandCenters ?? 0), 0);
  const enemySummaries = enemies.map((enemy) => {
    const objects = enemy.objects ?? {};
    const buildList = enemy.buildList ?? {};
    const hasStartAssets = enemy.active === true &&
      enemy.dead !== true &&
      Number(objects.commandCenters ?? 0) > 0 &&
      Number(objects.dozers ?? 0) > 0 &&
      Number(objects.productionObjects ?? 0) > 0 &&
      Number(buildList.entries ?? 0) > 0;
    return {
      index: enemy.index,
      name: enemy.name,
      side: enemy.side,
      difficultyName: enemy.difficultyName,
      active: enemy.active,
      dead: enemy.dead,
      money: enemy.money,
      objects,
      buildList,
      hasStartAssets,
    };
  });
  return {
    frame: gameplay?.framesCompleted ?? null,
    localPlayerIndex: diagnostics?.localPlayerIndex ?? null,
    enemyAiCount: enemies.length,
    neutralCommandCenters,
    enemySummaries,
    ready: enemies.length > 0 &&
      neutralCommandCenters === 0 &&
      enemySummaries.every((summary) => summary.hasStartAssets),
  };
}

function summarizeEnemyAiActivity(activeGameplay, postActive) {
  const samples = [
    activeGameplay,
    ...(postActive?.samples ?? []),
    postActive?.finalGameplay,
  ].filter((sample) => sample?.playerDiagnostics?.players);
  const first = samples[0] ?? null;
  const last = samples[samples.length - 1] ?? null;
  const firstEnemies = enemyAiPlayers(first?.playerDiagnostics);
  const lastPlayers = indexedPlayers(last?.playerDiagnostics);
  const enemySummaries = firstEnemies.map((initial) => {
    const final = lastPlayers.get(Number(initial.index)) ?? null;
    const initialObjects = Number(initial.objects?.total ?? 0);
    const finalObjects = Number(final?.objects?.total ?? 0);
    const initialMoney = Number(initial.money ?? 0);
    const finalMoney = Number(final?.money ?? initialMoney);
    return {
      index: initial.index,
      name: initial.name,
      side: initial.side,
      difficultyName: initial.difficultyName,
      initial: {
        active: initial.active,
        money: initialMoney,
        objects: initial.objects ?? null,
        buildList: initial.buildList ?? null,
      },
      final: final == null ? null : {
        active: final.active,
        money: finalMoney,
        objects: final.objects ?? null,
        buildList: final.buildList ?? null,
      },
      objectDelta: finalObjects - initialObjects,
      moneyDelta: finalMoney - initialMoney,
      activeEvidence: final != null && (
        finalObjects > initialObjects ||
        finalMoney < initialMoney ||
        Number(final.objects?.structures ?? 0) > Number(initial.objects?.structures ?? 0) ||
        Number(final.objects?.infantry ?? 0) > Number(initial.objects?.infantry ?? 0) ||
        Number(final.objects?.vehicles ?? 0) > Number(initial.objects?.vehicles ?? 0)
      ),
    };
  });
  return {
    framesAdvanced: postActive?.framesAdvanced ?? 0,
    sampleCount: samples.length,
    firstFrame: first?.framesCompleted ?? null,
    lastFrame: last?.framesCompleted ?? null,
    localPlayerIndex: last?.playerDiagnostics?.localPlayerIndex ?? null,
    ai: last?.ai ?? first?.ai ?? null,
    enemyAiCount: firstEnemies.length,
    enemySummaries,
    activityDetected: enemySummaries.some((summary) => summary.activeEvidence),
  };
}

async function main() {
  await mkdir(dirname(screenshotPath), { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });

  const server = await startStaticServer({ root: wasmRoot });
  let browser;
  try {
    const launchOptions = { headless: true };
    const executablePath = process.env.SKIRMISH_START_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    if (process.env.SKIRMISH_START_BROWSER_ARGS) {
      launchOptions.args = process.env.SKIRMISH_START_BROWSER_ARGS.split(/\s+/).filter(Boolean);
    }

    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(300000);
    page.on("pageerror", (error) => {
      console.error(`[skirmish-start] pageerror ${error.stack ?? error.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[skirmish-start page] ${msg.text()}`);
      }
    });

    const harnessUrl = new URL("harness/index.html", server.url);
    harnessUrl.searchParams.set("dist", distDir);
    await page.goto(harnessUrl.href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

    let audioSetup = null;
    if (expectMenuMusicStop) {
      console.error("[skirmish-start] enable Web Audio for music transition check");
      const audioRuntime = await resumeAudio(page);
      const mixer = await rpc(page, "setBrowserAudioMixerVolumes", {
        trigger: "skirmish_start_smoke.mjs music transition",
      });
      expect(audioRuntime?.browserAudioRuntime?.contextState === "running"
          && mixer?.browserAudioMixerRuntime?.created === true
          && mixer?.browserAudioMixerRuntime?.contextState === "running",
        "Web Audio was not ready for skirmish music transition check", {
          audioRuntime,
          mixer,
        });
      audioSetup = {
        runtime: audioRuntime.browserAudioRuntime,
        mixer: mixer.browserAudioMixerRuntime,
      };
    }

    console.error("[skirmish-start] mounting archives");
    const mount = await rpc(page, "mountArchives", {
      path: "/assets/skirmish-start",
      verifyEach: false,
      archives: buildArchives(server.url),
    });
    expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
      "failed to mount runtime archives", mount?.archiveSet ?? mount);

    console.error("[skirmish-start] real init");
    const init = await rpc(page, "realEngineInit", {
      runDirectory: "/assets/skirmish-start",
      shellMap: true,
    });
    expect(init?.ok === true && init?.aborted === false && init?.frontier?.initReturned === true,
      "real engine init failed", init?.frontier ?? init);

    let frame = await runFrames(page, 5, "initial menu frames");
    if (frame.frame?.clientState?.shell?.topIsMainMenu !== true) {
      frame = await waitForCondition(
        page,
        "main menu available",
        (clientState) => clientState.shell?.topIsMainMenu === true &&
          clientState.shell?.topHidden === false,
        120);
    }
    expect(frame.frame?.clientState?.mainMenu?.buttonSinglePlayer?.found === true,
      "main menu Single Player button geometry is unavailable",
      frame.frame?.clientState?.mainMenu?.buttonSinglePlayer);

    console.error("[skirmish-start] reveal main menu");
    const revealed = await revealMainMenu(page);
    const menuMusic = expectMenuMusicStop
      ? await waitForActiveMusic(page, "main menu music")
      : null;

    console.error("[skirmish-start] click single player");
    const singlePlayerClick = await clickButton(
      page,
      revealed.frame.clientState.mainMenu.buttonSinglePlayer,
      revealed.frame.clientState.mainMenu.underButtonSinglePlayerCenter,
      "single-player");
    const singlePlayerMenu = singlePlayerClick.settled.frame?.clientState?.mainMenu;
    expect(singlePlayerMenu?.buttonSkirmish?.clickable === true,
      "single-player menu did not expose ButtonSkirmish", singlePlayerMenu);

    console.error("[skirmish-start] click skirmish");
    const skirmishClick = await clickButton(
      page,
      singlePlayerMenu.buttonSkirmish,
      null,
      "skirmish");
    const skirmishMenuReady = skirmishClick.settled.frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true
      ? skirmishClick.settled
      : await waitForCondition(
        page,
        "skirmish options menu",
        (clientState) => clientState.skirmishMenu?.buttonStart?.clickable === true,
        180);
    const skirmishMenu = skirmishMenuReady.frame?.clientState?.skirmishMenu;
    expect(skirmishMenu?.parent?.found === true && skirmishMenu?.buttonStart?.clickable === true,
      "skirmish game options menu did not become startable", skirmishMenu);

    let skirmishMapSet = null;
    if (requestedSkirmishMap) {
      console.error(`[skirmish-start] set skirmish map ${requestedSkirmishMap}`);
      skirmishMapSet = await rpc(page, "realEngineSetSkirmishMap", {
        map: requestedSkirmishMap,
      });
      expect(skirmishMapSet?.ok === true
          && skirmishMapSet.result?.applied,
        "requested skirmish map was not applied", skirmishMapSet);
      await runSummary(page, 1, "skirmish map apply settle");
    }

    console.error("[skirmish-start] click start");
    const musicBeforeStart = expectMenuMusicStop ? await streamRuntime(page) : null;
    const preSkirmishMusicHandles = expectMenuMusicStop
      ? Array.from(new Set([
          ...menuMusic.handles,
          ...activeStreamHandles(musicBeforeStart),
        ])).sort((left, right) => left - right)
      : [];
    const skirmishStartClick = await clickButton(
      page,
      skirmishMenu.buttonStart,
      skirmishMenu.underButtonStartCenter,
      "skirmish start",
      null);
    const loadingGameplay = compactGameplay(skirmishStartClick.settled.frame);
    const loadingWindows =
      skirmishStartClick.settled.frame?.clientState?.loadScreen?.multiplayer ?? null;
    expect(loadingGameplay.gameMode === GAME_SKIRMISH &&
        loadingGameplay.loadingMap === true &&
        loadingWindows?.mapPreview?.found === true &&
        loadingWindows?.progressLocal?.found === true,
      "skirmish start did not present the multiplayer loading screen before loading the map", {
        loadingGameplay,
        loadingWindows,
        lastGameLogicStep: skirmishStartClick.settled.lastGameLogicStep,
      });
    expect((loadingWindows.mapPreview.status & WIN_STATUS_IMAGE) !== 0 &&
        loadingWindows.mapPreview.enabledImage0?.present === true &&
        loadingWindows.mapPreview.enabledImage0?.name !== "UnknownMap" &&
        Boolean(loadingWindows.mapPreview.enabledImage0?.filename),
      "skirmish loading screen did not bind the selected map preview image",
      loadingWindows.mapPreview);
    expect((loadingWindows.localGeneralPortrait?.status & WIN_STATUS_IMAGE) !== 0 &&
        loadingWindows.localGeneralPortrait?.enabledImage0?.present === true &&
        Boolean(loadingWindows.localGeneralPortrait?.enabledImage0?.name) &&
        Boolean(loadingWindows.localGeneralPortrait?.enabledImage0?.filename),
      "skirmish loading screen did not bind the local player faction portrait",
      loadingWindows.localGeneralPortrait);
    await page.locator("#viewport").screenshot({ path: loadingScreenshotPath });
    const loadingRenderProbe = await sampleViewportGrid(page);
    expect(loadingRenderProbe.ok === true &&
        loadingRenderProbe.visibleSampleCount > 0 &&
        loadingRenderProbe.uniqueColorCount > 1,
      "skirmish loading screen canvas did not expose visible non-black pixel variance",
      loadingRenderProbe);

    console.error("[skirmish-start] wait for active match");
    let active;
    try {
      active = await waitForSkirmishMatch(page);
    } catch (error) {
      const ctx = await page.evaluate(() => window.__lastBadJsonContext ?? null).catch(() => null);
      console.error("WAIT FAILED; badJsonContext:", JSON.stringify(ctx));
      throw error;
    }
    let postActive = null;
    let enemyStartAssets = null;
    let enemyAiActivity = null;
    let musicTransition = null;
    if (expectMenuMusicStop) {
      console.error("[skirmish-start] wait for pre-skirmish music handles to close");
      const stopped = await waitForHandlesClosed(
        page,
        preSkirmishMusicHandles,
        "skirmish music transition",
        musicStopMaxFrames);
      musicTransition = {
        audioSetup,
        menuMusic: {
          handles: menuMusic.handles,
          runtime: menuMusic.runtime,
          framesAdvanced: menuMusic.framesAdvanced,
          samples: menuMusic.samples.slice(-16),
        },
        preSkirmishHandles: preSkirmishMusicHandles,
        beforeStart: musicBeforeStart,
        afterActive: {
          framesAdvanced: stopped.framesAdvanced,
          runtime: stopped.runtime,
          samples: stopped.samples.slice(-16),
        },
      };
    }
    if (postActiveFrames > 0) {
      console.error(`[skirmish-start] run ${postActiveFrames} post-active frames`);
      postActive = await runPostActiveFrames(page, postActiveFrames, postActiveFrameChunk);
      if (expectPostActiveSurvival) {
        const gameplay = postActive.result?.frame?.gameplay;
        expect(gameplay?.gameMode === GAME_SKIRMISH &&
            gameplay?.inGame === true &&
            gameplay?.loadingMap === false &&
            gameplay?.inputEnabled === true &&
            Number(gameplay?.objectCount ?? 0) > 0 &&
            Number(gameplay?.drawableCount ?? 0) > 0 &&
            Number(gameplay?.renderedObjectCount ?? 0) > 0,
          "skirmish did not survive post-active frames", {
            postActiveFrames,
            samples: postActive.samples.slice(-12),
          });
      }
    }
    if (expectEnemyStartAssets) {
      enemyStartAssets = summarizeEnemyStartAssets(compactGameplay(active.result.frame));
      expect(enemyStartAssets.ready === true,
        "enemy skirmish AI did not receive starting assets", enemyStartAssets);
    }
    if (expectEnemyAiActivity) {
      enemyAiActivity = summarizeEnemyAiActivity(compactGameplay(active.result.frame), postActive);
      expect(enemyAiActivity.enemyAiCount > 0,
        "skirmish did not expose an enemy skirmish AI player", enemyAiActivity);
      expect(enemyAiActivity.activityDetected === true,
        "enemy skirmish AI did not produce activity during post-active frames", enemyAiActivity);
    }
    let escMenuResume = null;
    if (expectEscMenuResume) {
      console.error("[skirmish-start] verify ESC quit menu Resume button");
      escMenuResume = await driveEscMenuResume(page);
    }
    await page.locator("#viewport").screenshot({ path: screenshotPath });
    const renderProbe = await sampleViewportGrid(page);
    expect(renderProbe.ok === true,
      "active skirmish canvas pixels could not be sampled", renderProbe);
    const visibleSamples = Object.values(renderProbe.pixels ?? {}).filter((pixel) =>
      pixelHasVisibleColor(pixel));
    expect(visibleSamples.length > 0 && renderProbe.uniqueColorCount > 1,
      "active skirmish canvas did not expose visible non-black pixel variance", renderProbe);

    // ADD-ONLY HUD geometry probe: one full realEngineFrame to capture the
    // per-window control-bar geometry (drawFunc/systemFunc/x/y/w/h/hidden) so
    // the bottom-strip pixels can be mapped to specific HUD windows. Read-only.
    const shroudDiagnostics = locateNested(active.result.frame, ["shroud"]) ?? null;
    const postActiveShroudDiagnostics =
      postActive == null ? null : locateNested(postActive.result?.frame, ["shroud"]) ?? null;
    let controlBarWindows = null;
    let controlBarWindowFull = null;
    let fullFrameShroudDiagnostics = null;
    let textureDiagnostics = null;
    let uiDrawCaptures = null;
    let d3d8SceneDrawHistory = null;
    let lastD3D8Clear = null;
    let badJsonContext = null;
    try {
      if (captureD3D8History) {
        await page.evaluate(() => window.__cncSetD3D8SceneDrawHistoryLimit?.(8192));
        await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
      }
      const full = await runFrames(page, 1, "hud geometry probe");
      controlBarWindowFull = locateNested(full.frame, ["controlBarWindows"]) ?? null;
      controlBarWindows = controlBarWindowFull;
      fullFrameShroudDiagnostics = locateNested(full.frame, ["shroud"]) ?? null;
      // ADD-ONLY: also surface the frame's texture diagnostics so a background
      // that resolves to a valid Image* but still draws black can be traced to
      // a missing/failed texture upload. Read-only.
      textureDiagnostics = locateNested(full.frame, ["textureDiagnostics"]) ?? null;
      // ADD-ONLY Stage-1: the per-draw render-state capture for the command-bar
      // atlas (1024x256) background draws vs small UI icon draws, collected by
      // bridge.js during the frame.
      uiDrawCaptures = full.state?.graphics?.uiDrawCaptures ?? null;
      d3d8SceneDrawHistory = captureD3D8History
        ? (full.state?.graphics?.d3d8SceneDrawHistory ?? null)
        : null;
      lastD3D8Clear = captureD3D8History
        ? (full.state?.graphics?.lastD3D8Clear ?? null)
        : null;
      badJsonContext = await page.evaluate(() => window.__lastBadJsonContext ?? null).catch(() => null);
    } catch (error) {
      controlBarWindows = { error: error?.message ?? String(error) };
    }

    const mapCache = await rpc(page, "mapCacheProbe");
    // ADD-ONLY Stage-1: full live D3D8 texture inventory, to determine whether
    // the command-bar atlas (1024x256 SN/SA/SUCommandBar.tga) was ever uploaded.
    let d3d8TextureInventory = null;
    try {
      const textureSizes = new Set([
        "1024x256",
        "128x128",
        "256x256",
        "256x512",
        "512x256",
        "512x512",
      ]);
      for (const shroud of [shroudDiagnostics, postActiveShroudDiagnostics, fullFrameShroudDiagnostics]) {
        const width = Number(shroud?.visual?.textureWidth ?? 0);
        const height = Number(shroud?.visual?.textureHeight ?? 0);
        if (width > 0 && height > 0) {
          textureSizes.add(`${width}x${height}`);
        }
      }
      d3d8TextureInventory = await rpc(page, "d3d8TextureInventory", {
        sizes: Array.from(textureSizes),
        sampleLimit: 128,
      });
    } catch (error) {
      d3d8TextureInventory = { error: error?.message ?? String(error) };
    }
    const result = {
      ok: true,
      source: "skirmish-start-smoke",
      distDir,
      archiveCount: mount.archiveSet.archiveCount,
      requestedMap: requestedSkirmishMap || null,
      selectedMap: mapCache?.probe?.skirmishGameInfo?.map
        ?? mapCache?.probe?.gameInfo?.map
        ?? mapCache?.probe?.firstOfficialMultiplayerMap
        ?? null,
      skirmishMapSet: skirmishMapSet?.result ?? null,
      loadingScreen: {
        gameplay: loadingGameplay,
        windows: loadingWindows,
        renderProbe: loadingRenderProbe,
        screenshot: loadingScreenshotPath,
      },
      firstOfficialMultiplayerMetadata: mapCache?.probe?.firstOfficialMultiplayerMetadata ?? null,
      officialMultiplayerCount: mapCache?.probe?.officialMultiplayerCount ?? null,
      officialMultiplayerMaps: mapCache?.probe?.officialMultiplayerMaps ?? [],
      mapPreviewDiagnostic: mapCache?.probe?.mapPreviewDiagnostic ?? null,
      framesAdvancedAfterStart: active.framesAdvanced,
      finalGameplay: compactGameplay(active.result.frame),
      musicTransition,
      shroudDiagnostics,
      postActive: postActive == null ? null : {
        framesAdvanced: postActive.framesAdvanced,
        finalGameplay: compactGameplay(postActive.result?.frame),
        shroudDiagnostics: postActiveShroudDiagnostics,
        samples: postActive.samples,
      },
      enemyStartAssets,
      enemyAiActivity,
      escMenuResume,
      renderProbe,
      // ADD-ONLY HUD diagnostics: full control-bar / shell / startNewGame state
      // from the final active-match frame (read-only; does not gate anything).
      hudDiagnostics: (() => {
        // ADD-ONLY: walk the final frame to find the control-bar / shell /
        // startNewGame state regardless of the exact nesting used by the RPC.
        const f = active.result.frame ?? {};
        const locate = (obj, keys, depth = 0) => {
          if (!obj || typeof obj !== "object" || depth > 6) return undefined;
          for (const k of keys) {
            if (obj[k] !== undefined) return obj[k];
          }
          for (const v of Object.values(obj)) {
            if (v && typeof v === "object") {
              const found = locate(v, keys, depth + 1);
              if (found !== undefined) return found;
            }
          }
          return undefined;
        };
        const cb = locate(f, ["controlBar"]) ?? {};
        const summary = locate(f, ["summary"]) ?? {};
        const shell = locate(f, ["shell"]) ?? {};
        return {
          controlBarFound: cb.controlBarFound ?? summary.controlBarFound ?? null,
          controlBarHidden: cb.controlBarHidden ?? summary.controlBarHidden ?? null,
          controlBarManagerHidden: cb.controlBarManagerHidden ?? summary.controlBarManagerHidden ?? null,
          controlBarClickable: cb.controlBarClickable ?? summary.controlBarClickable ?? null,
          shellTopHidden: shell.topHidden ?? null,
          shellTopFilename: shell.topFilename ?? null,
          startNewGameShell: shell.startNewGameShell ?? null,
          rawControlBar: cb,
          rawShellKeys: Object.keys(shell),
          controlBarWindows,
          textureDiagnostics,
          uiDrawCaptures,
          d3d8SceneDrawHistory,
          lastD3D8Clear,
          fullFrameShroudDiagnostics,
          d3d8TextureInventory: d3d8TextureInventory?.inventory ?? null,
          d3d8TextureLiveCount: d3d8TextureInventory?.liveCount ?? null,
          badJsonContext,
        };
      })(),
      samples: active.samples.slice(-12),
      screenshot: screenshotPath,
    };
    await writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
  }
}

await main();
