#!/usr/bin/env node
/**
 * END-TO-END proof: click in a REAL loaded skirmish match actually SELECTS units.
 *
 * Reuses the full boot flow from skirmish_start_smoke.mjs:
 *   mountArchives → realEngineInit → main-menu reveal → Single Player → Skirmish → Start
 *   → wait for GAME_SKIRMISH + inputEnabled + objectCount > 0.
 *
 * Then:
 *   1. Post a WM_LBUTTONDOWN → WM_MOUSEMOVE × 2 → WM_LBUTTONUP drag box-select
 *      over the central play area where the base sits.
 *   2. Step ~10 frames, call querySelection → report selectCount + selected ids/worldPos.
 *   3. If drag selects nothing, try a direct click at ~(640,250) and re-query.
 *   4. Capture screenshot to artifacts/screenshots/input-select-e2e.png.
 *
 * On errno=17/EEXIST wait 30s and retry up to 3x.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotsRoot = resolve(wasmRoot, "artifacts/screenshots");

const GAME_SKIRMISH = 2;
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;

const screenshotPath = resolve(screenshotsRoot, "input-select-e2e.png");
const outputPath = resolve(wasmRoot, "artifacts/input-select-e2e.json");

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

function parsePositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  return {
    framesCompleted: frame?.framesCompleted ?? null,
    gameMode: gameplay?.gameMode ?? null,
    inGame: gameplay?.inGame ?? null,
    loadingMap: gameplay?.loadingMap ?? null,
    inputEnabled: gameplay?.inputEnabled ?? null,
    localPlayer: gameplay?.localPlayer ?? null,
    objectCount: gameplay?.objectCount ?? null,
    drawableCount: gameplay?.drawableCount ?? null,
    renderedObjectCount: gameplay?.renderedObjectCount ?? null,
  };
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
  };
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
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
  return assertFrameResult(await rpc(page, "realEngineFrame", { frames }), label);
}

async function runSummary(page, frames, label = "real engine summary") {
  return assertFrameResult(await rpc(page, "realEngineFrameSummary", { frames }), label);
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
  for (const group of [clientState?.mainMenu, clientState?.skirmishMenu, clientState?.controlBarWindows]) {
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

function commandButtonEntries(controlBarWindows) {
  return Object.entries(controlBarWindows ?? {})
    .filter(([key, value]) => /^buttonCommand\d+$/.test(key) &&
      value?.found === true &&
      value?.clickable === true &&
      value?.command != null)
    .map(([slot, button]) => ({ slot, button }));
}

function chooseBuildCommandButton(entries) {
  const preferredBuildNames = [
    /DemoTrap/i,
    /Tunnel/i,
    /Stinger/i,
    /Barracks/i,
    /Supply/i,
  ];
  const dozerButtons = entries.filter(({ button }) =>
    button.command?.typeName === "GUI_COMMAND_DOZER_CONSTRUCT");
  for (const pattern of preferredBuildNames) {
    const match = dozerButtons.find(({ button }) =>
      pattern.test(button.command?.buildTemplate ?? "") ||
      pattern.test(button.command?.name ?? ""));
    if (match) {
      return match;
    }
  }
  if (dozerButtons.length > 0) {
    return dozerButtons[0];
  }

  return entries.find(({ button }) =>
    button.command?.typeName === "GUI_COMMAND_UNIT_BUILD" ||
    button.command?.typeName === "GUI_COMMAND_PLAYER_UPGRADE" ||
    button.command?.typeName === "GUI_COMMAND_OBJECT_UPGRADE" ||
    button.command?.typeName === "GUI_COMMAND_PURCHASE_SCIENCE") ?? null;
}

function compactCommandPath(selectionResult) {
  const path = selectionResult?.commandPath ?? {};
  return {
    dispatchBuildCommandCount: path.dispatchBuildCommandCount ?? null,
    dispatchLastBuildCommandType: path.dispatchLastBuildCommandType ?? null,
    dispatchLastBuildHadGroup: path.dispatchLastBuildHadGroup ?? null,
    dispatchLastBuildArg0: path.dispatchLastBuildArg0 ?? null,
    dispatchQueueUpgradeCount: path.dispatchQueueUpgradeCount ?? null,
    dispatchQueueUnitCreateCount: path.dispatchQueueUnitCreateCount ?? null,
    dispatchDozerConstructCount: path.dispatchDozerConstructCount ?? null,
    dispatchPurchaseScienceCount: path.dispatchPurchaseScienceCount ?? null,
  };
}

function buildDispatchDelta(before, after) {
  return {
    build: (after.dispatchBuildCommandCount ?? 0) - (before.dispatchBuildCommandCount ?? 0),
    queueUpgrade: (after.dispatchQueueUpgradeCount ?? 0) - (before.dispatchQueueUpgradeCount ?? 0),
    queueUnit: (after.dispatchQueueUnitCreateCount ?? 0) - (before.dispatchQueueUnitCreateCount ?? 0),
    dozerConstruct: (after.dispatchDozerConstructCount ?? 0) - (before.dispatchDozerConstructCount ?? 0),
    purchaseScience: (after.dispatchPurchaseScienceCount ?? 0) - (before.dispatchPurchaseScienceCount ?? 0),
  };
}

async function waitForCommandButtons(page) {
  return waitForCondition(
    page,
    "command bar buttons after selection",
    (clientState) => commandButtonEntries(clientState.controlBarWindows).length > 0,
    90);
}

async function clickMapPoint(page, point, label) {
  await postMouse(page, WM_MOUSEMOVE, point);
  await runFrames(page, 1, `${label} move`);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await runFrames(page, 1, `${label} down`);
  await postMouse(page, WM_LBUTTONUP, point);
  return runFrames(page, 8, `${label} up`);
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

async function waitForSkirmishMatch(page) {
  const samples = [];
  let framesAdvanced = 0;
  const maxStartFrames = parsePositiveInt("E2E_MAX_FRAMES", 6000);
  const frameChunk = parsePositiveInt("E2E_FRAME_CHUNK", 30);

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
        Number(gameplay?.drawableCount ?? 0) > 0) {
      return { result, framesAdvanced, samples };
    }
  }
  expect(false, "skirmish did not reach an active match", {
    maxStartFrames,
    samples: samples.slice(-12),
  });
}

/**
 * Retry wrapper for extraction race (errno=17/EEXIST).
 */
async function withRetry(fn, maxRetries = 3, retryDelayMs = 30000) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isExtractionRace = error?.code === "EEXIST" ||
        String(error).includes("EEXIST") ||
        String(error).includes("extraction race");
      if (isExtractionRace && attempt < maxRetries - 1) {
        console.error(`[input-select-e2e] extraction race detected (attempt ${attempt + 1}/${maxRetries}), waiting ${retryDelayMs}ms...`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

async function main() {
  const results = {
    ok: false,
    archivesMounted: false,
    activeMatch: false,
    matchState: null,
    dragProof: { selectCount: null, selectedCount: 0, selected: [] },
    clickProof: { selectCount: null, selectedCount: 0, selected: [] },
    commandBarProof: {
      ok: false,
      selectedTemplate: null,
      selectedKindOf: null,
      visibleCommandCount: 0,
      chosen: null,
      beforeCommandPath: null,
      afterClickCommandPath: null,
      afterPlacementCommandPath: null,
      dispatchDeltaAfterClick: null,
      dispatchDeltaAfterPlacement: null,
      pendingAfterClick: null,
      placementAttempts: [],
      verdict: null,
    },
    screenshot: null,
    verdict: null,
  };

  await mkdir(dirname(screenshotPath), { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });

  const server = await startStaticServer({ root: wasmRoot });
  let browser;
  try {
    const launchOptions = { headless: true };
    const executablePath = process.env.E2E_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    if (process.env.E2E_BROWSER_ARGS) {
      launchOptions.args = process.env.E2E_BROWSER_ARGS.split(/\s+/).filter(Boolean);
    }

    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(300000);
    page.on("pageerror", (error) => {
      console.error(`[input-select-e2e] pageerror ${error.stack ?? error.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[input-select-e2e page] ${msg.text()}`);
      }
    });

    await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

    // ── Phase 1: mount archives ──
    console.error("[input-select-e2e] mounting archives...");
    const mount = await withRetry(async () =>
      rpc(page, "mountArchives", {
        path: "/assets/e2e-select",
        verifyEach: false,
        archives: buildArchives(server.url),
      }));
    expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
      "failed to mount runtime archives", mount?.archiveSet ?? mount);
    results.archivesMounted = true;
    console.error(`[input-select-e2e] mounted ${mount.archiveSet.archiveCount} archives`);

    // ── Phase 2: realEngineInit ──
    console.error("[input-select-e2e] real engine init...");
    const init = await rpc(page, "realEngineInit", {
      runDirectory: "/assets/e2e-select",
      shellMap: true,
    });
    expect(init?.ok === true && init?.aborted === false && init?.frontier?.initReturned === true,
      "real engine init failed", init?.frontier ?? init);
    console.error("[input-select-e2e] real engine init succeeded");

    // ── Phase 3: navigate to main menu ──
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

    console.error("[input-select-e2e] revealing main menu");
    const revealed = await revealMainMenu(page);

    console.error("[input-select-e2e] clicking single player");
    const singlePlayerClick = await clickButton(
      page,
      revealed.frame.clientState.mainMenu.buttonSinglePlayer,
      revealed.frame.clientState.mainMenu.underButtonSinglePlayerCenter,
      "single-player");
    const singlePlayerMenu = singlePlayerClick.settled.frame?.clientState?.mainMenu;
    expect(singlePlayerMenu?.buttonSkirmish?.clickable === true,
      "single-player menu did not expose ButtonSkirmish", singlePlayerMenu);

    console.error("[input-select-e2e] clicking skirmish");
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

    // ── Phase 4: start skirmish match ──
    console.error("[input-select-e2e] starting skirmish match...");
    await clickButton(
      page,
      skirmishMenu.buttonStart,
      skirmishMenu.underButtonStartCenter,
      "skirmish start",
      null);

    console.error("[input-select-e2e] waiting for active match...");
    const active = await waitForSkirmishMatch(page);
    const gameplay = active.result.frame?.gameplay;
    results.activeMatch = true;
    results.matchState = {
      gameMode: gameplay?.gameMode,
      inGame: gameplay?.inGame,
      loadingMap: gameplay?.loadingMap,
      inputEnabled: gameplay?.inputEnabled,
      objectCount: gameplay?.objectCount,
      drawableCount: gameplay?.drawableCount,
      renderedObjectCount: gameplay?.renderedObjectCount,
      localPlayer: gameplay?.localPlayer,
    };
    console.error(`[input-select-e2e] ACTIVE MATCH: gameMode=${gameplay?.gameMode}, inGame=${gameplay?.inGame}, ` +
      `loadingMap=${gameplay?.loadingMap}, inputEnabled=${gameplay?.inputEnabled}, ` +
      `objectCount=${gameplay?.objectCount}, drawableCount=${gameplay?.drawableCount}`);
    expect(gameplay?.gameMode === GAME_SKIRMISH, "game mode is not GAME_SKIRMISH");
    expect(gameplay?.inGame === true, "not inGame");
    expect(gameplay?.loadingMap === false, "still loading map");
    expect(gameplay?.inputEnabled === true, "input not enabled");
    expect(Number(gameplay?.objectCount ?? 0) > 0, "no objects present");

    // ── Phase 5: DRAG BOX-SELECT ──
    // The player's base should be near screen center in Alpine Assault.
    // Drag from (300,150) to (980,520) to cover the central area.
    console.error("[input-select-e2e] === DRAG BOX-SELECT ===");
    const dragStart = { x: 300, y: 150 };
    const dragEnd = { x: 980, y: 520 };
    console.error(`[input-select-e2e] posting drag box-select: (${dragStart.x},${dragStart.y}) -> (${dragEnd.x},${dragEnd.y})`);

    // LBUTTONDOWN at drag start
    await postMouse(page, WM_LBUTTONDOWN, dragStart);
    // A couple of WM_MOUSEMOVE steps during the drag
    await postMouse(page, WM_MOUSEMOVE, { x: 640, y: 335 });
    await postMouse(page, WM_MOUSEMOVE, { x: 800, y: 420 });
    // LBUTTONUP at drag end
    await postMouse(page, WM_LBUTTONUP, dragEnd);

    // Step ~10 frames for selection to settle
    console.error("[input-select-e2e] stepping 10 frames for selection...");
    const selStepResult = await runFrames(page, 10, "selection proof step");

    // Query selection
    console.error("[input-select-e2e] querying selection after drag...");
    const selQuery = await rpc(page, "querySelection");
    const selResult = selQuery?.result ?? {};
    let currentSelectionResult = selResult;
    results.dragProof.selectCount = selResult.selectCount ?? 0;
    results.dragProof.selectedCount = (selResult.selected ?? []).length;
    results.dragProof.selected = (selResult.selected ?? []).map((s) => ({
      id: s.id,
      worldPos: s.worldPos ?? null,
    }));
    console.error(`[input-select-e2e] querySelection after drag: selectCount=${results.dragProof.selectCount}, ` +
      `selectedCount=${results.dragProof.selectedCount}`);
    if (results.dragProof.selected.length > 0) {
      for (const sel of results.dragProof.selected.slice(0, 10)) {
        console.error(`[input-select-e2e]   selected: id=${sel.id}, worldPos=${JSON.stringify(sel.worldPos)}`);
      }
    }

    // ── Phase 6: DIRECT CLICK ──
    // If the drag didn't select anything, try a direct click near screen center
    // where the base structure should be.
    if (results.dragProof.selectCount === 0) {
      console.error("[input-select-e2e] drag didn't select units, trying direct click at screen center...");
      const clickPos = { x: 640, y: 250 };
      await postMouse(page, WM_LBUTTONDOWN, clickPos);
      await runFrames(page, 1, "click down settle");
      await postMouse(page, WM_LBUTTONUP, clickPos);
      await runFrames(page, 5, "click up settle");

      const selQuery2 = await rpc(page, "querySelection");
      const selResult2 = selQuery2?.result ?? {};
      currentSelectionResult = selResult2;
      results.clickProof.selectCount = selResult2.selectCount ?? 0;
      results.clickProof.selectedCount = (selResult2.selected ?? []).length;
      results.clickProof.selected = (selResult2.selected ?? []).map((s) => ({
        id: s.id,
        worldPos: s.worldPos ?? null,
      }));
      console.error(`[input-select-e2e] querySelection after click: selectCount=${results.clickProof.selectCount}, ` +
        `selectedCount=${results.clickProof.selectedCount}`);
      if (results.clickProof.selected.length > 0) {
        for (const sel of results.clickProof.selected.slice(0, 10)) {
          console.error(`[input-select-e2e]   selected: id=${sel.id}, worldPos=${JSON.stringify(sel.worldPos)}`);
        }
      }
    }

    // ── Phase 7: COMMAND BAR BUILD/QUEUE BUTTON ──
    const selectionWorksNow = Number(currentSelectionResult.selectCount ?? 0) > 0;
    if (selectionWorksNow) {
      console.error("[input-select-e2e] === COMMAND BAR BUILD/QUEUE BUTTON ===");
      const firstSelected = currentSelectionResult.selected?.[0] ?? null;
      results.commandBarProof.selectedTemplate = firstSelected?.templateName ?? null;
      results.commandBarProof.selectedKindOf = firstSelected?.kindOf ?? null;
      results.commandBarProof.beforeCommandPath = compactCommandPath(currentSelectionResult);

      const commandReady = await waitForCommandButtons(page);
      const entries = commandButtonEntries(commandReady.frame?.clientState?.controlBarWindows);
      results.commandBarProof.visibleCommandCount = entries.length;
      results.commandBarProof.visibleCommands = entries.map(({ slot, button }) => ({
        slot,
        id: button.id,
        centerX: button.centerX,
        centerY: button.centerY,
        clickable: button.clickable,
        command: button.command,
      }));
      console.error(`[input-select-e2e] visible command buttons: ${entries.length}`);

      const chosen = chooseBuildCommandButton(entries);
      expect(chosen != null,
        "no build/queue command button was visible after selecting a controllable object",
        results.commandBarProof.visibleCommands);
      results.commandBarProof.chosen = {
        slot: chosen.slot,
        id: chosen.button.id,
        centerX: chosen.button.centerX,
        centerY: chosen.button.centerY,
        command: chosen.button.command,
      };
      console.error(`[input-select-e2e] clicking ${chosen.slot}: ${JSON.stringify(chosen.button.command)}`);

      await clickButton(page, chosen.button, null,
        `command-bar ${chosen.slot} ${chosen.button.command?.name ?? "command"}`,
        null);
      await runFrames(page, 3, "command-bar click settle");

      const afterClickQuery = await rpc(page, "querySelection");
      const afterClickResult = afterClickQuery?.result ?? {};
      results.commandBarProof.afterClickCommandPath = compactCommandPath(afterClickResult);
      results.commandBarProof.dispatchDeltaAfterClick = buildDispatchDelta(
        results.commandBarProof.beforeCommandPath,
        results.commandBarProof.afterClickCommandPath);
      results.commandBarProof.pendingAfterClick = {
        pendingPlaceType: afterClickResult.modes?.pendingPlaceType ?? null,
        pendingPlaceSourceObjectId: afterClickResult.modes?.pendingPlaceSourceObjectId ?? null,
        placementAnchored: afterClickResult.modes?.placementAnchored ?? null,
      };

      const clickDispatched = Object.values(results.commandBarProof.dispatchDeltaAfterClick)
        .some((value) => value > 0);
      const pendingMatchesCommand =
        afterClickResult.modes?.pendingPlaceType != null &&
        (chosen.button.command?.buildTemplate == null ||
          afterClickResult.modes.pendingPlaceType === chosen.button.command.buildTemplate);

      let placementDispatched = false;
      if (!clickDispatched && pendingMatchesCommand &&
          chosen.button.command?.typeName === "GUI_COMMAND_DOZER_CONSTRUCT") {
        const placementCandidates = [
          { x: 760, y: 360 },
          { x: 860, y: 390 },
          { x: 690, y: 420 },
          { x: 930, y: 430 },
          { x: 570, y: 360 },
        ];
        for (const point of placementCandidates) {
          console.error(`[input-select-e2e] trying placement click at (${point.x},${point.y})`);
          await clickMapPoint(page, point, "dozer placement");
          const placementQuery = await rpc(page, "querySelection");
          const placementResult = placementQuery?.result ?? {};
          const placementPath = compactCommandPath(placementResult);
          const delta = buildDispatchDelta(
            results.commandBarProof.beforeCommandPath,
            placementPath);
          const attempt = {
            point,
            pendingPlaceType: placementResult.modes?.pendingPlaceType ?? null,
            commandPath: placementPath,
            delta,
          };
          results.commandBarProof.placementAttempts.push(attempt);
          if (delta.dozerConstruct > 0 || delta.build > 0) {
            results.commandBarProof.afterPlacementCommandPath = placementPath;
            results.commandBarProof.dispatchDeltaAfterPlacement = delta;
            placementDispatched = true;
            break;
          }
          if (placementResult.modes?.pendingPlaceType == null) {
            break;
          }
        }
      }

      results.commandBarProof.ok = clickDispatched || pendingMatchesCommand || placementDispatched;
      if (placementDispatched) {
        results.commandBarProof.verdict = "COMMAND-BAR-BUILD-DISPATCHED";
      } else if (clickDispatched) {
        results.commandBarProof.verdict = "COMMAND-BAR-QUEUE-DISPATCHED";
      } else if (pendingMatchesCommand) {
        results.commandBarProof.verdict = "COMMAND-BAR-BUILD-PLACEMENT-PENDING";
      } else {
        results.commandBarProof.verdict = "COMMAND-BAR-CLICK-NO-BUILD-EFFECT";
      }
      console.error(`[input-select-e2e] command-bar verdict: ${results.commandBarProof.verdict}`);
    }

    // ── Phase 8: screenshot ──
    console.error("[input-select-e2e] capturing screenshot...");
    await page.locator("#viewport").screenshot({ path: screenshotPath });
    results.screenshot = screenshotPath;
    console.error(`[input-select-e2e] screenshot saved to ${screenshotPath}`);

    // ── Phase 9: verdict ──
    const dragWorks = results.dragProof.selectCount > 0;
    const clickWorks = results.clickProof.selectCount > 0;
    const selectionWorks = dragWorks || clickWorks;
    results.ok = selectionWorks;

    if (selectionWorks && results.commandBarProof.ok) {
      results.verdict = `SELECT-AND-COMMAND-BAR-WORK (${results.commandBarProof.verdict})`;
    } else if (dragWorks) {
      results.verdict = "SELECT-WORKS-COMMAND-BAR-FAILS";
    } else if (clickWorks) {
      results.verdict = "SELECT-WORKS-COMMAND-BAR-FAILS";
    } else {
      results.verdict = "SELECT-FAILS (selectCount=0 in live match with units present — needs more investigation, e.g. coordinate scaling)";
    }

    console.error("[input-select-e2e] === VERDICT ===");
    console.error(`[input-select-e2e] Active match: ${results.activeMatch}`);
    console.error(`[input-select-e2e] Match state: ${JSON.stringify(results.matchState)}`);
    console.error(`[input-select-e2e] Drag proof: selectCount=${results.dragProof.selectCount}, selectedCount=${results.dragProof.selectedCount}`);
    console.error(`[input-select-e2e] Click proof: selectCount=${results.clickProof.selectCount}, selectedCount=${results.clickProof.selectedCount}`);
    console.error(`[input-select-e2e] Command proof: ${JSON.stringify(results.commandBarProof)}`);
    console.error(`[input-select-e2e] Screenshot: ${results.screenshot}`);
    console.error(`[input-select-e2e] VERDICT: ${results.verdict}`);

    await writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));

  } catch (error) {
    console.error(`[input-select-e2e] FATAL: ${error.message}`);
    console.error(error.stack);
    results.error = error.message;
    results.verdict = "ERROR: " + error.message;
    try {
      await writeFile(outputPath, JSON.stringify(results, null, 2));
    } catch (_) { /* ignore */ }
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
  }

  process.exit(results.ok ? 0 : 1);
}

await main();
