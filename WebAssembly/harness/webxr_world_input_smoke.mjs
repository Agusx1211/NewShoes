#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/webxr-world-input");
const timeoutMs = Math.max(30000, Number(process.env.WEBXR_WORLD_INPUT_TIMEOUT_MS
  ?? 15 * 60 * 1000));
const executablePath = process.env.WEBXR_WORLD_INPUT_BROWSER_EXECUTABLE
  ?? process.env.CHROME_PATH;
const dist = process.env.WEBXR_WORLD_INPUT_DIST ?? "dist-threaded-release";
const browserArgs = (process.env.WEBXR_WORLD_INPUT_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const reuseProfile = process.env.WEBXR_WORLD_INPUT_REUSE_PROFILE === "1";

function expectFiniteRay(ray) {
  assert.equal(ray.active, true, "native W3DView ray must be active during tracked input");
  assert.equal(ray.rejected, 0, "native W3DView must not reject the transformed ray");
  assert.ok(ray.updates > 0, "the ordered input bridge must update the native ray");
  assert.ok(ray.start.every(Number.isFinite) && ray.end.every(Number.isFinite),
    `native ray contains non-finite coordinates: ${JSON.stringify(ray)}`);
  const length = Math.hypot(...ray.end.map((value, index) => value - ray.start[index]));
  assert.ok(Math.abs(length - 12000) < 2,
    `native ray length must preserve the engine picking range: ${length}`);
  return length;
}

function angularDistance(left, right) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function stage(message) {
  process.stderr.write(`[webxr-world-input] ${message}\n`);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function fullFrame(page) {
  const result = await rpc(page, "realEngineFrame", { frames: 1 });
  assert.equal(result?.ok, true, `real engine frame failed: ${JSON.stringify(result)}`);
  assert.equal(result?.aborted, false, `real engine frame aborted: ${JSON.stringify(result)}`);
  return result.frame;
}

async function waitForFrame(page, label, predicate, waitMs = 120000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await fullFrame(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last?.clientState ?? last)}`);
}

async function waitForSelectionMode(page, label, predicate, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    last = await rpc(page, "querySelection");
    if (last?.ok === true && predicate(last.result?.modes ?? {})) return last.result.modes;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function aimWebXrAtEnginePoint(page, geometry, point, label) {
  assert.ok(Number.isFinite(point?.x) && Number.isFinite(point?.y),
    `${label} has no engine coordinates: ${JSON.stringify(point)}`);
  let diagnostic = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const spatial = await page.evaluate(() => ({
      comfort: window.CnCPort.getWebXrState()?.renderer?.comfort,
      displaySize: window.CnCPort?.state?.engineDisplaySize,
    }));
    const width = Number(spatial.displaySize?.width ?? geometry.engineWidth);
    const height = Number(spatial.displaySize?.height ?? geometry.engineHeight);
    assert.ok(Number(spatial.comfort?.panelWidthMeters) > 0 && width > 1 && height > 1,
      `${label} has no floating-panel geometry: ${JSON.stringify(spatial)}`);
    await page.evaluate(([x, y, targetWidth, targetHeight, panelWidth]) =>
      window.__emulatedXrPointAtEnginePixel(
        x, y, targetWidth, targetHeight, panelWidth,
      ), [point.x, point.y, width, height, spatial.comfort.panelWidthMeters]);
    const deadline = Date.now() + 2500;
    let pointer = null;
    while (Date.now() < deadline) {
      pointer = await page.evaluate(() =>
        window.CnCPort.getWebXrState()?.renderer?.controllerPointer ?? null);
      if (pointer?.target === "ui"
          && Math.abs(pointer.point?.x - point.x) <= 2
          && Math.abs(pointer.point?.y - point.y) <= 2) return pointer;
      await page.waitForTimeout(50);
    }
    diagnostic = { point, width, height, pointer };
    if (attempt < 2) await fullFrame(page);
  }
  throw new Error(`${label} controller ray missed the floating panel target: ${JSON.stringify(
    diagnostic)}`);
}

async function clickEngineButton(page, geometry, button, label) {
  assert.equal(button?.clickable, true, `${label} is not clickable`);
  const point = { x: button.centerX, y: button.centerY };
  await aimWebXrAtEnginePoint(page, geometry, point, label);
  await page.evaluate(() => window.__emulatedXrTrigger(true));
  await page.waitForTimeout(80);
  await fullFrame(page);
  await page.evaluate(() => window.__emulatedXrTrigger(false));
  await page.waitForTimeout(80);
  await fullFrame(page);
  return point;
}

async function exerciseWebXrTextEntry(page, geometry, skirmishMenu) {
  const entry = skirmishMenu?.textEntryPlayerName;
  assert.equal(entry?.clickable, true,
    `skirmish player-name entry is unavailable: ${JSON.stringify(entry)}`);
  const point = { x: entry.centerX, y: entry.centerY };
  await page.waitForFunction(({ x, y }) =>
    window.CnCPort.state.touchUi?.entries?.some((candidate) =>
      x >= candidate.rect.x && x < candidate.rect.x + candidate.rect.width
        && y >= candidate.rect.y && y < candidate.rect.y + candidate.rect.height),
  point, { timeout: 30000, polling: 100 });
  const before = String(skirmishMenu.playerNameText ?? "");
  await clickEngineButton(page, geometry, entry, "skirmish player-name entry");
  await page.waitForFunction(() => document.activeElement?.id === "touchTextInput"
    && window.CnCPort.getTouchControlsState?.().keyboardOpen === true
    && window.CnCPort.getWebXrState()?.systemKeyboardSupported === true,
  null, { timeout: 30000, polling: 50 });
  await page.locator("#touchTextInput").evaluate((input) => {
    input.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "vr",
      inputType: "insertText",
    }));
  });
  const typed = await waitForFrame(page, "tracked-controller player-name text entry",
    (candidate) => candidate?.clientState?.skirmishMenu?.playerNameText === `${before}vr`,
    30000);
  await page.locator("[data-touch-text-done]").click();
  await page.waitForFunction(() =>
    window.CnCPort.getTouchControlsState?.().keyboardOpen === false);
  return {
    keyboardSupported: true,
    before,
    after: typed.clientState.skirmishMenu.playerNameText,
  };
}

async function enterSkirmish(page, geometry) {
  await aimWebXrAtEnginePoint(page, geometry, { x: 32, y: 32 }, "main menu wake-up");
  await page.waitForTimeout(250);
  await fullFrame(page);
  await aimWebXrAtEnginePoint(page, geometry, { x: 96, y: 96 }, "main menu wake-up");
  let frame = await waitForFrame(page, "main menu",
    (candidate) => candidate?.clientState?.mainMenu?.buttonSinglePlayer?.clickable === true);
  await clickEngineButton(page, geometry, frame.clientState.mainMenu.buttonSinglePlayer,
    "Single Player button");
  frame = await waitForFrame(page, "single-player menu",
    (candidate) => candidate?.clientState?.mainMenu?.buttonSkirmish?.clickable === true);
  await clickEngineButton(page, geometry,
    frame.clientState.mainMenu.buttonSkirmish, "Skirmish button");
  for (let retry = 0; retry < 3; retry += 1) {
    await page.waitForTimeout(2000);
    frame = await fullFrame(page);
    if (frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true) break;
    const retryButton = frame?.clientState?.mainMenu?.buttonSkirmish;
    if (retryButton?.clickable === true) {
      await clickEngineButton(page, geometry,
        retryButton, `Skirmish button retry ${retry + 1}`);
    }
  }
  frame = await waitForFrame(page, "skirmish options",
    (candidate) => candidate?.clientState?.skirmishMenu?.buttonStart?.clickable === true);
  const textEntry = await exerciseWebXrTextEntry(page, geometry, frame.clientState.skirmishMenu);
  await clickEngineButton(page, geometry,
    frame.clientState.skirmishMenu.buttonStart, "Start button");
  await waitForFrame(page, "active skirmish", (candidate) => {
    const gameplay = candidate?.gameplay ?? candidate?.clientState?.gameplay;
    return gameplay?.inGame === true && gameplay?.loadingMap === false
      && gameplay?.inputEnabled === true && Number(gameplay?.renderedObjectCount ?? 0) > 0;
  }, 6 * 60 * 1000);
  return textEntry;
}

async function tapWebXrButton(page, index) {
  await page.evaluate((buttonIndex) => window.__emulatedXrButton(buttonIndex, true), index);
  await page.waitForTimeout(80);
  await fullFrame(page);
  await page.evaluate((buttonIndex) => window.__emulatedXrButton(buttonIndex, false), index);
  await page.waitForTimeout(80);
  await fullFrame(page);
}

function visibleQuitMenuButton(quitMenu, fieldNames) {
  if (!quitMenu?.visible) return null;
  return fieldNames.map((name) => quitMenu[name]).find((button) =>
    button?.clickable === true && button.hidden === false && button.managerHidden === false) ?? null;
}

async function waitForAgentUiWindow(page, name, predicate = () => true, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    const response = await rpc(page, "agentUiSnapshot");
    last = response?.result?.windows?.find((window) => window.name === name) ?? null;
    if (last && predicate(last)) return last;
    await page.waitForTimeout(50);
  }
  throw new Error(`${name} did not reach the expected UI state: ${JSON.stringify(last)}`);
}

async function waitForEngineWindow(page, name, predicate = () => true, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    const response = await rpc(page, "queryWindowByName", { name });
    last = response?.result ?? null;
    if (last && predicate(last)) return last;
    await page.waitForTimeout(50);
  }
  throw new Error(`${name} did not reach the expected engine state: ${JSON.stringify(last)}`);
}

async function waitForSaveFiles(page, expectedCount, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await rpc(page, "listSaves");
    if (last?.ok === true && last.files?.length === expectedCount) return last.files;
    await fullFrame(page);
    await page.waitForTimeout(50);
  }
  throw new Error(`save-file count did not become ${expectedCount}: ${JSON.stringify(last)}`);
}

function targetFromAgentUiWindow(window, label) {
  assert.equal(window?.visible, true, `${label} is not visible`);
  assert.equal(window?.interactive, true, `${label} is not interactive`);
  assert.ok(Number(window?.rect?.width) > 0 && Number(window?.rect?.height) > 0,
    `${label} has no target geometry: ${JSON.stringify(window)}`);
  return {
    clickable: true,
    centerX: window.rect.x + Math.floor(window.rect.width / 2),
    centerY: window.rect.y + Math.floor(window.rect.height / 2),
  };
}

async function selectWebXrListRow(page, geometry, name, rowIndex, label) {
  const list = await waitForEngineWindow(page, name,
    (window) => Number(window?.listBox?.entryCount) > rowIndex);
  const row = list.listBox.rows?.[rowIndex];
  assert.ok(row && row.bottom > row.top,
    `${label} has no row geometry: ${JSON.stringify(list.listBox)}`);
  const target = {
    clickable: true,
    centerX: Math.round(list.x + Math.min(list.width - 4, Math.max(4, list.width * 0.35))),
    centerY: Math.round((row.top + row.bottom) / 2),
  };
  await clickEngineButton(page, geometry, target, label);
  return waitForEngineWindow(page, name,
    (window) => window?.listBox?.selected === rowIndex);
}

async function typeIntoWebXrEngineEntry(page, geometry, name, suffix, label) {
  const entry = await waitForAgentUiWindow(page, name,
    (window) => window.visible === true && window.interactive === true);
  const before = String(entry.value ?? "");
  const target = targetFromAgentUiWindow(entry, label);
  await page.waitForFunction(({ x, y }) =>
    window.CnCPort.state.touchUi?.entries?.some((candidate) =>
      x >= candidate.rect.x && x < candidate.rect.x + candidate.rect.width
        && y >= candidate.rect.y && y < candidate.rect.y + candidate.rect.height),
  { x: target.centerX, y: target.centerY }, { timeout: 30000, polling: 100 });
  await clickEngineButton(page, geometry, target, label);
  await page.waitForFunction(() => document.activeElement?.id === "touchTextInput"
    && window.CnCPort.getTouchControlsState?.().keyboardOpen === true
    && window.CnCPort.getWebXrState()?.systemKeyboardSupported === true,
  null, { timeout: 30000, polling: 50 });
  await page.locator("#touchTextInput").evaluate((input, text) => {
    input.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: "insertText",
    }));
  }, suffix);
  const typed = await waitForAgentUiWindow(page, name,
    (window) => window.value === `${before}${suffix}`);
  await page.locator("[data-touch-text-done]").click();
  await page.waitForFunction(() =>
    window.CnCPort.getTouchControlsState?.().keyboardOpen === false);
  return {
    keyboardSupported: true,
    before,
    after: typed.value,
  };
}

async function exerciseWebXrSaveDescription(page, geometry) {
  const savesBefore = await rpc(page, "listSaves");
  assert.equal(savesBefore?.ok, true,
    `save-file baseline is unavailable: ${JSON.stringify(savesBefore)}`);
  const saveButton = await waitForAgentUiWindow(page, "PopupSaveLoad.wnd:ButtonSave",
    (window) => window.visible === true && window.interactive === true);
  const saveTarget = targetFromAgentUiWindow(saveButton, "save/load Save button");
  await aimWebXrAtEnginePoint(page, geometry,
    { x: saveTarget.centerX, y: saveTarget.centerY }, "save/load Save button hover");
  const hilitedSaveButton = await waitForAgentUiWindow(page,
    "PopupSaveLoad.wnd:ButtonSave", (window) => window.hilited === true);
  await clickEngineButton(page, geometry, saveTarget, "save/load Save button");

  const cancelButton = await waitForAgentUiWindow(page,
    "PopupSaveLoad.wnd:ButtonSaveDescCancel",
    (window) => window.visible === true && window.interactive === true);
  const typed = await typeIntoWebXrEngineEntry(page, geometry,
    "PopupSaveLoad.wnd:EntryDesc", " vr", "save-description entry");

  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(cancelButton, "save-description Cancel button"),
    "save-description Cancel button");
  await waitForAgentUiWindow(page, "PopupSaveLoad.wnd:ButtonSave",
    (window) => window.visible === true && window.interactive === true);
  const savesAfter = await rpc(page, "listSaves");
  assert.equal(savesAfter?.ok, true,
    `post-cancel save-file list is unavailable: ${JSON.stringify(savesAfter)}`);
  assert.deepEqual(savesAfter.files, savesBefore.files,
    "cancelling the save-description modal must not create or replace a save file");
  return {
    saveHover: hilitedSaveButton.hilited === true,
    ...typed,
    cancelled: true,
    saveFilesUnchanged: true,
  };
}

async function driveWebXrModalFlow(page, geometry) {
  await tapWebXrButton(page, 5);
  await waitForFrame(page, "tracked-controller quit menu", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true
      && candidate?.clientState?.gameplay?.gamePaused === true
      && visibleQuitMenuButton(candidate.clientState.quitMenu,
        ["buttonOptionsFull", "buttonOptionsNoSave"]) !== null);
  const saveLoadButton = await waitForAgentUiWindow(page, "QuitMenu.wnd:ButtonSaveLoad",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(saveLoadButton, "quit-menu Save/Load button"),
    "quit-menu Save/Load button");
  await waitForAgentUiWindow(page, "PopupSaveLoad.wnd:SaveLoadMenu",
    (window) => window.visible === true);
  const saveDescription = await exerciseWebXrSaveDescription(page, geometry);
  const saveLoadBackButton = await waitForAgentUiWindow(page,
    "PopupSaveLoad.wnd:ButtonBack",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(saveLoadBackButton, "save/load Back button"),
    "save/load Back button");
  const returnedFromSaveLoad = await waitForFrame(page, "quit menu after save/load", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true
      && candidate?.clientState?.gameplay?.gamePaused === true
      && visibleQuitMenuButton(candidate.clientState.quitMenu,
        ["buttonOptionsFull", "buttonOptionsNoSave"]) !== null);

  const optionsButton = visibleQuitMenuButton(returnedFromSaveLoad.clientState.quitMenu,
    ["buttonOptionsFull", "buttonOptionsNoSave"]);
  assert.ok(optionsButton, `quit menu has no tracked options target: ${JSON.stringify(
    returnedFromSaveLoad.clientState.quitMenu)}`);
  await clickEngineButton(page, geometry, optionsButton, "quit-menu Options button");

  let backButton = await waitForAgentUiWindow(page, "OptionsMenu.wnd:ButtonBack",
    (window) => window.visible === true && window.interactive === true);
  const backTarget = {
    clickable: true,
    centerX: backButton.rect.x + Math.floor(backButton.rect.width / 2),
    centerY: backButton.rect.y + Math.floor(backButton.rect.height / 2),
  };
  await aimWebXrAtEnginePoint(page, geometry,
    { x: backTarget.centerX, y: backTarget.centerY }, "options Back button hover");
  backButton = await waitForAgentUiWindow(page, "OptionsMenu.wnd:ButtonBack",
    (window) => window.hilited === true);
  assert.equal(backButton.hilited, true,
    "tracked pointer movement must drive the original options hover state");
  await clickEngineButton(page, geometry, backTarget, "options Back button");

  const returned = await waitForFrame(page, "quit menu after options", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true
      && candidate?.clientState?.gameplay?.gamePaused === true
      && visibleQuitMenuButton(candidate.clientState.quitMenu,
        ["buttonReturnFull", "buttonReturnNoSave"]) !== null);
  const returnButton = visibleQuitMenuButton(returned.clientState.quitMenu,
    ["buttonReturnFull", "buttonReturnNoSave"]);
  assert.ok(returnButton, `quit menu has no tracked return target: ${JSON.stringify(
    returned.clientState.quitMenu)}`);
  await clickEngineButton(page, geometry, returnButton, "quit-menu Return button");
  await waitForFrame(page, "tracked-controller match resume", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === false
      && candidate?.clientState?.gameplay?.gamePaused === false);
  return {
    quitOpened: true,
    saveLoadOpened: true,
    saveDescription,
    optionsOpened: true,
    optionsHover: backButton.hilited === true,
    resumed: true,
  };
}

async function openWebXrSaveLoadFromMatch(page, geometry, label) {
  await tapWebXrButton(page, 5);
  await waitForFrame(page, `${label} quit menu`, (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true
      && candidate?.clientState?.gameplay?.gamePaused === true);
  const saveLoadButton = await waitForAgentUiWindow(page, "QuitMenu.wnd:ButtonSaveLoad",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(saveLoadButton, `${label} Save/Load button`),
    `${label} Save/Load button`);
  return waitForEngineWindow(page, "PopupSaveLoad.wnd:ListboxGames",
    (window) => window.found === true && window.hidden === false && window.listBox != null);
}

async function resumeWebXrMatchFromQuit(page, geometry, label) {
  const frame = await waitForFrame(page, `${label} quit menu`, (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true
      && visibleQuitMenuButton(candidate.clientState.quitMenu,
        ["buttonReturnFull", "buttonReturnNoSave"]) !== null);
  const returnButton = visibleQuitMenuButton(frame.clientState.quitMenu,
    ["buttonReturnFull", "buttonReturnNoSave"]);
  await clickEngineButton(page, geometry, returnButton, `${label} Return button`);
  await waitForFrame(page, `${label} resumed match`, (candidate) =>
    candidate?.clientState?.quitMenu?.visible === false
      && candidate?.clientState?.gameplay?.gamePaused === false);
}

async function currentLogicFrame(page) {
  return page.evaluate(() => Number(
    window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1,
  ));
}

async function armWebXrSaveLoadFrameObserver(page) {
  return page.evaluate(() => {
    const initialFrame = Number(
      window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1,
    );
    const observation = { running: true, initialFrame, firstDrop: null };
    window.__webXrSaveLoadFrameObserver = observation;
    const sample = () => {
      if (!observation.running || window.__webXrSaveLoadFrameObserver !== observation) return;
      const frame = Number(window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1);
      if (observation.firstDrop === null && frame <= initialFrame - 5) {
        observation.firstDrop = frame;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return initialFrame;
  });
}

async function waitForWebXrSaveLoadFrameDrop(page) {
  await page.waitForFunction(() =>
    window.__webXrSaveLoadFrameObserver?.firstDrop !== null,
  null, { timeout: 120000, polling: 50 });
  return page.evaluate(() => {
    const observation = window.__webXrSaveLoadFrameObserver;
    observation.running = false;
    return { initialFrame: observation.initialFrame, firstDrop: observation.firstDrop };
  });
}

async function driveWebXrSaveLoadRoundTrip(page, geometry) {
  const baseline = await rpc(page, "listSaves");
  assert.equal(baseline?.ok, true, `save-file baseline failed: ${JSON.stringify(baseline)}`);
  assert.equal(baseline.files.length, 0,
    `disposable WebXR profile must begin without saves: ${JSON.stringify(baseline.files)}`);

  const emptyList = await openWebXrSaveLoadFromMatch(page, geometry, "save round-trip");
  assert.equal(emptyList.listBox.entryCount, 1,
    `save menu must begin with only the new-save row: ${JSON.stringify(emptyList.listBox)}`);
  const saveButton = await waitForAgentUiWindow(page, "PopupSaveLoad.wnd:ButtonSave",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(saveButton, "round-trip Save button"),
    "round-trip Save button");
  const typed = await typeIntoWebXrEngineEntry(page, geometry,
    "PopupSaveLoad.wnd:EntryDesc", " xr cycle", "round-trip save-description entry");
  const saveConfirm = await waitForAgentUiWindow(page,
    "PopupSaveLoad.wnd:ButtonSaveDescConfirm",
    (window) => window.visible === true && window.interactive === true);
  const savedLogicFrame = await currentLogicFrame(page);
  assert.ok(savedLogicFrame > 0, `saved logic frame is invalid: ${savedLogicFrame}`);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(saveConfirm, "save-description Confirm button"),
    "save-description Confirm button");
  const savedFiles = await waitForSaveFiles(page, 1);
  assert.ok(savedFiles[0].size > 1024,
    `original save file is unexpectedly small: ${JSON.stringify(savedFiles[0])}`);
  await resumeWebXrMatchFromQuit(page, geometry, "post-save");
  await page.waitForFunction((frame) =>
    Number(window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1) >= frame + 30,
  savedLogicFrame, { timeout: 30000, polling: 50 });
  const advancedLogicFrame = await currentLogicFrame(page);

  const populatedList = await openWebXrSaveLoadFromMatch(page, geometry, "load round-trip");
  assert.equal(populatedList.listBox.entryCount, 2,
    `save menu must contain new-save and saved rows: ${JSON.stringify(populatedList.listBox)}`);
  assert.match(populatedList.listBox.rows?.[1]?.cells?.[0] ?? "", /xr cycle/i,
    "saved description is missing from the original listbox");
  await selectWebXrListRow(page, geometry,
    "PopupSaveLoad.wnd:ListboxGames", 1, "saved-game list row");
  const loadButton = await waitForAgentUiWindow(page, "PopupSaveLoad.wnd:ButtonLoad",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(loadButton, "round-trip Load button"),
    "round-trip Load button");
  const loadConfirm = await waitForAgentUiWindow(page,
    "PopupSaveLoad.wnd:ButtonLoadConfirm",
    (window) => window.visible === true && window.interactive === true);
  const xrBeforeLoad = await page.evaluate(() => window.CnCPort.getWebXrState());
  const loadStartFrame = await armWebXrSaveLoadFrameObserver(page);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(loadConfirm, "load Confirm button"),
    "load Confirm button");
  const rewind = await waitForWebXrSaveLoadFrameDrop(page);
  assert.equal(rewind.initialFrame, loadStartFrame);
  assert.ok(rewind.firstDrop < rewind.initialFrame - 10
      && Math.abs(rewind.firstDrop - savedLogicFrame) <= 20,
  `load did not rewind to the saved simulation frame: ${JSON.stringify({
    savedLogicFrame, advancedLogicFrame, rewind,
  })}`);
  const restoredFrame = await waitForFrame(page, "loaded WebXR match", (candidate) => {
    const gameplay = candidate?.gameplay ?? candidate?.clientState?.gameplay;
    return gameplay?.inGame === true && gameplay?.loadingMap === false
      && gameplay?.inputEnabled === true && Number(gameplay?.renderedObjectCount ?? 0) > 0;
  }, 120000);
  await waitForEngineRay(page);
  const xrAfterLoad = await page.evaluate(() => window.CnCPort.getWebXrState());
  assert.equal(xrAfterLoad.phase, "running",
    `load reset ended the immersive session: ${JSON.stringify(xrAfterLoad)}`);
  assert.equal(xrAfterLoad.viewCount, 2,
    "restored match must continue rendering both XR views");
  assert.equal(await page.evaluate(() => window.__emulatedXrSessionCount), 1,
    "in-game load must preserve the original XRSession");
  assert.ok(Number(xrAfterLoad.renderer?.frames) > Number(xrBeforeLoad.renderer?.frames),
    "stereo renderer did not advance across the engine load reset");

  const deleteList = await openWebXrSaveLoadFromMatch(page, geometry, "delete round-trip");
  assert.equal(deleteList.listBox.entryCount, 2,
    `loaded save is unavailable for cleanup: ${JSON.stringify(deleteList.listBox)}`);
  await selectWebXrListRow(page, geometry,
    "PopupSaveLoad.wnd:ListboxGames", 1, "cleanup saved-game list row");
  const deleteButton = await waitForAgentUiWindow(page, "PopupSaveLoad.wnd:ButtonDelete",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(deleteButton, "round-trip Delete button"),
    "round-trip Delete button");
  const deleteConfirm = await waitForAgentUiWindow(page,
    "PopupSaveLoad.wnd:ButtonDeleteConfirm",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(deleteConfirm, "delete Confirm button"),
    "delete Confirm button");
  await waitForSaveFiles(page, 0);
  const saveLoadBack = await waitForAgentUiWindow(page, "PopupSaveLoad.wnd:ButtonBack",
    (window) => window.visible === true && window.interactive === true);
  await clickEngineButton(page, geometry,
    targetFromAgentUiWindow(saveLoadBack, "cleanup Save/Load Back button"),
    "cleanup Save/Load Back button");
  await resumeWebXrMatchFromQuit(page, geometry, "post-delete");

  return {
    description: typed.after,
    savedFileBytes: savedFiles[0].size,
    savedLogicFrame,
    advancedLogicFrame,
    loadedLogicFrame: rewind.firstDrop,
    sessionCount: await page.evaluate(() => window.__emulatedXrSessionCount),
    rendererFramesBeforeLoad: xrBeforeLoad.renderer?.frames ?? 0,
    rendererFramesAfterLoad: xrAfterLoad.renderer?.frames ?? 0,
    restoredObjects: Number(
      restoredFrame?.clientState?.gameplay?.renderedObjectCount ?? 0,
    ),
    saveDeleted: true,
  };
}

async function waitForEngineRay(page) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let nextReport = 0;
  while (Date.now() < deadline) {
    await fullFrame(page);
    last = await page.evaluate(() => {
      const webxr = window.CnCPort?.state?.webxr ?? null;
      return {
        phase: webxr?.phase ?? null,
        frames: webxr?.frames ?? 0,
        renderer: webxr?.renderer ?? null,
      };
    });
    if (last.phase === "running" && last.frames > 0
        && last.renderer?.enginePickRayReady === true
        && last.renderer?.controllerPointer?.ray != null) {
      return last;
    }
    if (Date.now() >= nextReport) {
      stage(`waiting for engine camera: ${JSON.stringify(last)}`);
      nextReport = Date.now() + 10000;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`real engine did not produce a tracked world ray: ${JSON.stringify(last)}`);
}

async function waitForWebXrSessionReentry(page, previousRendererFrames) {
  const deadline = Date.now() + 30000;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    last = await page.evaluate(() => {
      const state = window.CnCPort.getWebXrState();
      return {
        sessionCount: window.__emulatedXrSessionCount,
        phase: state.phase,
        runtimeFrames: state.frames,
        rendererActive: state.renderer?.active,
        rendererFrames: state.renderer?.frames,
        rendererTransport: state.rendererTransport,
        engineLoop: window.CnCPort.state.threadedEngine?.loop ?? null,
        engineFrame: window.CnCPort.state.threadedEngine?.frame ?? null,
        recorder: window.CnCPort.state.threadedEngine?.graphics?.webXrD3D8Recorder ?? null,
      };
    });
    if (last.sessionCount === 2 && last.phase === "running"
        && last.runtimeFrames > 0 && last.rendererActive === true
        && last.rendererFrames > previousRendererFrames) {
      return last;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`fresh WebXR session did not resume engine frames: ${JSON.stringify(last)}`);
}

async function waitForWebXrAudioListener(page, label, predicate, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    const response = await rpc(page, "browserMss3DSamplePlaybackRuntime");
    last = response?.browserMss3DSamplePlaybackRuntime ?? null;
    if (predicate(last)) return last;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

if (!reuseProfile) {
  await rm(profileDir, { recursive: true, force: true });
}
await mkdir(profileDir, { recursive: true });
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: 1280, height: 800 },
  ...(executablePath ? { executablePath } : {}),
  args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
});

try {
  await browser.addInitScript(() => {
    localStorage.setItem("cncPortWebXrSettings.v1", JSON.stringify({
      rotationMode: "stepped",
      motionVignette: true,
    }));
    const identity = () => [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const projection = [
      1.1, 0, 0, 0,
      0, 1.1, 0, 0,
      0, 0, -1.002, -1,
      0, 0, -0.2002, 0,
    ];
    const targetRaySpace = {};
    const targetRayMatrix = identity();
    const viewerMatrix = identity();
    const inputSource = {
      handedness: "right",
      targetRayMode: "tracked-pointer",
      profiles: ["generic-trigger-squeeze-thumbstick"],
      targetRaySpace,
      gamepad: {
        id: "emulated WebXR controller",
        mapping: "xr-standard",
        connected: true,
        axes: [0, 0],
        buttons: Array.from({ length: 6 }, () => ({
          pressed: false,
          touched: false,
          value: 0,
        })),
      },
    };

    class EmulatedXrSession extends EventTarget {
      constructor() {
        super();
        this.inputSources = [inputSource];
        this.renderState = null;
        this.ended = false;
        this.visibilityState = "visible";
        this.isSystemKeyboardSupported = true;
        this.timers = new Set();
      }

      updateRenderState(state) {
        this.renderState = state;
      }

      async requestReferenceSpace(type) {
        return { type };
      }

      requestAnimationFrame(callback) {
        if (this.ended) return 0;
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          if (this.ended) return;
          const layer = this.renderState.baseLayer;
          const halfWidth = Math.floor(layer.framebufferWidth / 2);
          const makeView = (eye, x) => ({
            eye,
            projectionMatrix: projection,
            transform: {
              matrix: [...viewerMatrix],
              inverse: { matrix: [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                -viewerMatrix[12], -viewerMatrix[13], -viewerMatrix[14], 1,
              ] },
            },
            viewport: { x, y: 0, width: halfWidth, height: layer.framebufferHeight },
          });
          const frame = {
            getViewerPose: () => ({
              transform: { matrix: [...viewerMatrix] },
              views: [makeView("left", 0), makeView("right", halfWidth)],
            }),
            getPose: (space) => space === targetRaySpace
              ? { emulatedPosition: false, transform: { matrix: targetRayMatrix } }
              : null,
          };
          callback(performance.now(), frame);
        }, 16);
        this.timers.add(timer);
        return timer;
      }

      async end() {
        if (this.ended) return;
        this.ended = true;
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        this.dispatchEvent(new Event("end"));
      }
    }

    class EmulatedXrWebGlLayer {
      constructor(session, gl) {
        this.session = session;
        this.gl = gl;
        this.framebufferWidth = Math.max(2, gl.drawingBufferWidth);
        this.framebufferHeight = Math.max(1, gl.drawingBufferHeight);
        this.framebuffer = gl.createFramebuffer();
        this.color = gl.createTexture();
        this.depthStencil = gl.createRenderbuffer();
        gl.bindTexture(gl.TEXTURE_2D, this.color);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,
          this.framebufferWidth, this.framebufferHeight, 0,
          gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthStencil);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8,
          this.framebufferWidth, this.framebufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D, this.color, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT,
          gl.RENDERBUFFER, this.depthStencil);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error("emulated XR framebuffer is incomplete");
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      getViewport(view) {
        return view.viewport;
      }
    }

    let session = null;
    let sessionCount = 0;
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: {
        isSessionSupported: async (mode) => mode === "immersive-vr",
        requestSession: () => {
          session = new EmulatedXrSession();
          sessionCount += 1;
          window.__emulatedXrSession = session;
          window.__emulatedXrSessionCount = sessionCount;
          return Promise.resolve(session);
        },
      },
    });
    Object.defineProperty(window, "XRWebGLLayer", {
      configurable: true,
      value: EmulatedXrWebGlLayer,
    });
    Object.defineProperty(WebGL2RenderingContext.prototype, "makeXRCompatible", {
      configurable: true,
      value: async function makeXRCompatible() {},
    });
    window.__emulatedXrSession = null;
    window.__emulatedXrSessionCount = 0;
    window.__emulatedXrTrigger = (down) => {
      inputSource.gamepad.buttons[0] = {
        pressed: down === true,
        touched: down === true,
        value: down === true ? 1 : 0,
      };
    };
    window.__emulatedXrButton = (index, down) => {
      inputSource.gamepad.buttons[index] = {
        pressed: down === true,
        touched: down === true,
        value: down === true ? 1 : 0,
      };
    };
    window.__emulatedXrAxes = (x, y) => {
      inputSource.gamepad.axes = [Number(x), Number(y)];
    };
    window.__emulatedXrPointAtEnginePixel = (x, y, width, height, panelWidth) => {
      const pixelWidth = Math.max(2, Number(width));
      const pixelHeight = Math.max(2, Number(height));
      const widthMeters = Number(panelWidth);
      const heightMeters = widthMeters * pixelHeight / pixelWidth;
      const u = Math.max(0, Math.min(1, Number(x) / (pixelWidth - 1)));
      const v = Math.max(0, Math.min(1, Number(y) / (pixelHeight - 1)));
      targetRayMatrix[12] = (u - 0.5) * widthMeters;
      targetRayMatrix[13] = (0.5 - v) * heightMeters;
      targetRayMatrix[14] = 0;
    };
    window.__emulatedXrViewerPosition = (x, y, z) => {
      viewerMatrix[12] = Number(x);
      viewerMatrix[13] = Number(y);
      viewerMatrix[14] = Number(z);
    };
    window.__emulatedXrNeutral = () => {
      inputSource.gamepad.axes = [0, 0];
      for (let index = 0; index < inputSource.gamepad.buttons.length; index += 1) {
        inputSource.gamepad.buttons[index] = { pressed: false, touched: false, value: 0 };
      }
    };
    window.__emulatedXrVisibility = (visibilityState) => {
      if (!session) throw new Error("no emulated immersive session is active");
      session.visibilityState = String(visibilityState);
      session.dispatchEvent(new Event("visibilitychange"));
    };
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const url = new URL(
    `harness/play.html?autostart=1&dist=${encodeURIComponent(dist)}&vr=1&shellmap=0&videos=0`,
    server.url,
  );
  stage("loading shipping VR page");
  await page.goto(url.href, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#overlay")?.classList.contains("hidden")
    || document.querySelector("#progress")?.textContent?.startsWith("FAILED:"),
  null, { timeout: timeoutMs, polling: 100 });
  const launch = await page.evaluate(() => ({
    running: document.querySelector("#overlay")?.classList.contains("hidden") === true,
    progress: document.querySelector("#progress")?.textContent ?? "",
  }));
  assert.equal(launch.running, true, `real threaded runtime failed to start: ${launch.progress}`);
  stage("real threaded runtime started");
  const inputGeometry = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const rect = canvas?.getBoundingClientRect();
    const size = window.CnCPort?.state?.engineDisplaySize;
    return rect && size ? {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      engineWidth: size.width,
      engineHeight: size.height,
    } : null;
  });
  assert.ok(inputGeometry?.engineWidth > 0 && inputGeometry?.engineHeight > 0,
    `runtime viewport has no input geometry: ${JSON.stringify(inputGeometry)}`);
  const support = await page.evaluate(() => window.CnCPort.probeWebXrSession());
  assert.equal(support.support?.immersiveVrSupported, true,
    `emulated immersive session was not available: ${JSON.stringify(support)}`);
  stage("immersive support probe passed");
  await page.evaluate(() => window.CnCPort.startWebXrSession());
  const textEntry = await enterSkirmish(page, inputGeometry);
  stage("tracked controller operated the floating main shell and skirmish setup");
  await waitForEngineRay(page);
  stage("real engine view produced a tracked world ray");

  const active = await page.evaluate(() => window.CnCPort.rpc("webxrPickRayState"));
  assert.equal(active.ok, true, `native WebXR ray diagnostic failed: ${JSON.stringify(active)}`);
  const rayLength = expectFiniteRay(active.result);
  const running = await page.evaluate(() => window.CnCPort.getWebXrState());
  assert.equal(running.viewCount, 2, "emulated compositor must supply distinct eye views");
  assert.equal(running.renderer?.comfort?.rotationMode, "stepped");
  assert.equal(running.renderer?.comfort?.motionVignette, true);
  assert.equal(running.renderer?.controllerPointer?.target, "ui",
    "tracked controller ray must retain the floating engine UI target");
  await page.evaluate(() => window.__emulatedXrTrigger(true));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__emulatedXrTrigger(false));
  await page.waitForTimeout(100);
  const driven = await rpc(page, "webxrPickRayState");
  assert.ok(driven.result.consumed > active.result.consumed,
    `controller trigger did not reach the original W3D picker: ${JSON.stringify(driven)}`);
  stage("native W3DView accepted the transformed ray");

  const centeredListener = await waitForWebXrAudioListener(page,
    "centered WebXR audio listener",
    (runtime) => runtime?.webXrListenerActive === true
      && runtime?.lastListener?.mode === "webxr-head-tracked"
      && runtime?.lastListener?.xrOffset != null);
  const worldScale = Number(running.renderer?.comfort?.worldScale ?? 1);
  const expectedHeadOffset = 0.25 * (1 / 0.3048) / worldScale;
  await page.evaluate(() => window.__emulatedXrViewerPosition(0.25, 0, 0));
  const movedListener = await waitForWebXrAudioListener(page,
    "head-tracked WebXR audio listener",
    (runtime) => {
      const offset = runtime?.lastListener?.xrOffset;
      return Math.abs(Math.hypot(offset?.x, offset?.y, offset?.z)
        - expectedHeadOffset) < 0.001;
    });
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(movedListener.lastListener.position[axis]
        - movedListener.lastListener.enginePosition[axis]
        - movedListener.lastListener.xrOffset[axis]) < 0.001,
    `XR head movement must offset the engine-owned listener on ${axis}`);
  }
  const orientation = movedListener.lastListener.orientation;
  assert.ok(Math.abs(Math.hypot(orientation.frontX, orientation.frontY, orientation.frontZ) - 1)
      < 0.001
    && Math.abs(Math.hypot(orientation.upX, orientation.upY, orientation.upZ) - 1) < 0.001,
  "XR viewer orientation must publish normalized listener directions");
  assert.ok(movedListener.webXrListenerAppliedUpdates
      > centeredListener.webXrListenerAppliedUpdates,
  "XR frames must apply new head poses to the Web Audio listener");
  stage("head pose updated the engine-owned HRTF listener at world scale");

  const modalFlow = await driveWebXrModalFlow(page, inputGeometry);
  stage("tracked controller operated save/load, save-description, and options modals");
  const saveLoadRoundTrip = await driveWebXrSaveLoadRoundTrip(page, inputGeometry);
  stage("tracked controller saved, loaded, and deleted without ending the XR session");

  await page.evaluate(() => {
    window.__emulatedXrButton(2, true);
    window.__emulatedXrTrigger(true);
  });
  await waitForSelectionMode(page, "single-controller force-fire layer",
    (modes) => modes.forceAttack === true);
  await page.evaluate(() => window.__emulatedXrNeutral());
  await waitForSelectionMode(page, "single-controller force-fire release",
    (modes) => modes.forceAttack === false);

  await page.evaluate(() => window.__emulatedXrButton(3, true));
  await waitForSelectionMode(page, "single-controller waypoint layer",
    (modes) => modes.waypoint === true);
  await page.evaluate(() => window.__emulatedXrButton(3, false));
  await waitForSelectionMode(page, "single-controller waypoint release",
    (modes) => modes.waypoint === false);

  await page.evaluate(() => window.__emulatedXrButton(4, true));
  await waitForSelectionMode(page, "single-controller selection layer",
    (modes) => modes.preferSelection === true);
  await page.evaluate(() => window.__emulatedXrButton(4, false));
  await waitForSelectionMode(page, "single-controller selection release",
    (modes) => modes.preferSelection === false);

  const cameraBeforeTurn = await fullFrame(page);
  const cameraAngleBeforeTurn = Number(cameraBeforeTurn?.clientState?.view?.angle);
  assert.ok(Number.isFinite(cameraAngleBeforeTurn),
    `real camera angle is unavailable: ${JSON.stringify(cameraBeforeTurn?.clientState?.view)}`);
  const vignetteFramesBeforeTurn = Number(
    (await page.evaluate(() => window.CnCPort.getWebXrState().renderer?.vignetteFrames)) ?? 0,
  );
  await page.evaluate(() => {
    window.__emulatedXrButton(5, true);
    window.__emulatedXrAxes(0.8, 0);
  });
  await page.waitForTimeout(50);
  await fullFrame(page);
  const cameraAfterTurn = await waitForFrame(page, "single-controller stepped turn",
    (candidate) => angularDistance(
      Number(candidate?.clientState?.view?.angle), cameraAngleBeforeTurn,
    ) > 0.05);
  const vignetteObserved = await page.evaluate(() => ({
    cameraMotion: window.CnCPort.getWebXrState().renderer?.cameraMotion,
    vignetteDraws: window.CnCPort.getWebXrState().renderer?.vignetteDraws,
    vignetteFrames: window.CnCPort.getWebXrState().renderer?.vignetteFrames,
  }));
  assert.ok(Number(vignetteObserved.vignetteFrames) > vignetteFramesBeforeTurn,
    `the stepped camera frame did not render a comfort vignette: ${JSON.stringify(
      vignetteObserved)}`);
  await waitForSelectionMode(page, "single-controller stepped turn release",
    (modes) => modes.cameraRotateRight === false);
  assert.equal((await page.evaluate(() =>
    window.CnCPort.getWebXrState().renderer?.cameraMotion?.active)), false,
  "the compositor vignette must release with the bounded stepped camera key");
  const settledTurn = await fullFrame(page);
  const settledTurnAngle = Number(settledTurn.clientState.view.angle);
  await page.waitForTimeout(350);
  const heldTurn = await fullFrame(page);
  assert.ok(angularDistance(Number(heldTurn.clientState.view.angle), settledTurnAngle) < 0.05,
    "a held stick must not repeat a stepped turn before returning to neutral");
  await page.evaluate(() => window.__emulatedXrAxes(0, 0));
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__emulatedXrAxes(0.8, 0));
  await page.waitForTimeout(50);
  await fullFrame(page);
  const cameraAfterRearmedTurn = await waitForFrame(page,
    "neutral-rearmed single-controller stepped turn",
    (candidate) => angularDistance(
      Number(candidate?.clientState?.view?.angle), Number(heldTurn.clientState.view.angle),
    ) > 0.05);
  await page.evaluate(() => window.__emulatedXrAxes(0, 0));

  const cameraBeforeWheel = await fullFrame(page);
  const cameraHeightBeforeWheel = Number(
    cameraBeforeWheel?.clientState?.view?.currentHeightAboveGround,
  );
  assert.ok(Number.isFinite(cameraHeightBeforeWheel),
    `real camera height is unavailable: ${JSON.stringify(cameraBeforeWheel?.clientState?.view)}`);
  await page.evaluate(() => {
    window.__emulatedXrAxes(0, -0.8);
  });
  const cameraAfterWheel = await waitForFrame(page, "single-controller wheel zoom",
    (candidate) => Number(candidate?.clientState?.view?.currentHeightAboveGround)
      < cameraHeightBeforeWheel - 1);
  const cameraHeightAfterWheel = Number(
    cameraAfterWheel.clientState.view.currentHeightAboveGround,
  );
  await page.evaluate(() => {
    window.__emulatedXrAxes(0, 0);
    window.__emulatedXrButton(5, false);
  });
  await waitForSelectionMode(page, "single-controller camera release", (modes) =>
    modes.cameraRotateRight === false && modes.cameraZoomIn === false);
  stage("stepped camera turns, motion vignette, and mouse-wheel zoom used original input paths");

  await page.evaluate(() => {
    window.__emulatedXrButton(2, true);
    window.__emulatedXrTrigger(true);
  });
  await waitForSelectionMode(page, "pre-suspension held input",
    (modes) => modes.forceAttack === true);
  await page.evaluate(() => window.__emulatedXrVisibility("visible-blurred"));
  await page.waitForFunction(() =>
    window.CnCPort.getWebXrState().renderer?.inputSuspended === true);
  await waitForSelectionMode(page, "visibility suspension release",
    (modes) => modes.forceAttack === false);
  const suspendedRay = await rpc(page, "webxrPickRayState");
  assert.equal(suspendedRay.result.active, false,
    "losing exclusive XR visibility must clear the native pick ray");

  await page.evaluate(() => window.__emulatedXrVisibility("visible"));
  await page.waitForFunction(() =>
    window.CnCPort.getWebXrState().renderer?.inputSuspended === false);
  await page.waitForTimeout(250);
  const heldAfterResume = await rpc(page, "querySelection");
  assert.equal(heldAfterResume.result.modes.forceAttack, false,
    "held controls must not reactivate before returning to neutral");
  assert.equal((await rpc(page, "webxrPickRayState")).result.active, false,
    "a held trigger must not restore the pick ray on visibility resume");
  await page.evaluate(() => window.__emulatedXrNeutral());
  stage(`neutral controller state: ${JSON.stringify(await page.evaluate(() => ({
    axes: window.__emulatedXrSession.inputSources[0].gamepad.axes,
    buttons: window.__emulatedXrSession.inputSources[0].gamepad.buttons,
  })))}`);
  await waitForEngineRay(page);
  stage("visibility suspension released input and resumed only after neutral");

  await page.evaluate(() => window.CnCPort.stopWebXrSession("world-input-smoke"));
  await page.waitForFunction(async () => {
    const state = await window.CnCPort.rpc("webxrPickRayState");
    return state?.ok === true && state.result?.active === false;
  }, null, { timeout: 30000, polling: 100 });
  const cleared = await page.evaluate(() => window.CnCPort.rpc("webxrPickRayState"));
  assert.ok(cleared.result.clears > active.result.clears,
    "ending immersive mode must clear the native W3DView ray");
  const restoredListener = await waitForWebXrAudioListener(page,
    "restored engine audio listener",
    (runtime) => runtime?.webXrListenerActive === false
      && runtime?.lastListener?.mode === "engine");
  assert.deepEqual(restoredListener.lastListener.position,
    restoredListener.lastListener.enginePosition,
    "session shutdown must restore the unmodified engine listener");
  await page.waitForFunction(() =>
    document.querySelector("#webXrButton")?.textContent === "Enter VR");
  stage("first session shutdown cleared native input state");

  const rendererFramesBeforeReentry = Number(
    (await page.evaluate(() => window.CnCPort.getWebXrState())).renderer?.frames ?? 0,
  );
  await page.evaluate(() => window.CnCPort.startWebXrSession());
  await waitForWebXrSessionReentry(page, rendererFramesBeforeReentry);
  await page.waitForFunction(() =>
    document.querySelector("#webXrButton")?.textContent === "Exit VR");
  const reentered = await waitForEngineRay(page);
  const reenteredRay = await rpc(page, "webxrPickRayState");
  assert.equal(reenteredRay.result.active, true,
    "a fresh immersive session must restore the native W3DView ray");
  assert.ok(reenteredRay.result.updates > cleared.result.updates,
    "the live engine must publish new tracked rays after session re-entry");
  const reenteredListener = await waitForWebXrAudioListener(page,
    "re-entered WebXR audio listener",
    (runtime) => runtime?.webXrListenerActive === true
      && runtime?.lastListener?.mode === "webxr-head-tracked");
  const reenteredGameplay = await fullFrame(page);
  assert.equal(reenteredGameplay?.clientState?.gameplay?.inGame, true,
    "session re-entry must preserve the live match instead of rebooting the engine");
  stage("fresh immersive session resumed stereo frames, native picking, and spatial audio");

  const contextLossTrigger = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const context = canvas?.getContext("webgl2");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("WEBGL_lose_context is unavailable");
    extension.loseContext();
    return { extensionAvailable: true };
  });
  await page.waitForFunction(async () => {
    const xr = window.CnCPort.getWebXrState();
    const ray = await window.CnCPort.rpc("webxrPickRayState");
    return xr.phase === "failed" && xr.renderer?.active === false
      && ray?.ok === true && ray.result?.active === false
      && document.querySelector("#webglContextLostBanner") !== null;
  }, null, { timeout: 30000, polling: 100 });
  const finalCleared = await rpc(page, "webxrPickRayState");
  assert.ok(finalCleared.result.clears > cleared.result.clears,
    "graphics loss in the replacement session must clear its native W3DView ray");
  const finalRestoredListener = await waitForWebXrAudioListener(page,
    "restored engine audio listener after graphics loss",
    (runtime) => runtime?.webXrListenerActive === false
      && runtime?.lastListener?.mode === "engine");
  assert.deepEqual(finalRestoredListener.lastListener.position,
    finalRestoredListener.lastListener.enginePosition,
    "graphics-loss shutdown must restore the unmodified engine listener");
  const failedXr = await page.evaluate(() => window.CnCPort.getWebXrState());
  assert.match(failedXr.error, /graphics context was lost/i);
  const rejectedReentry = await page.evaluate(async () => {
    try {
      await window.CnCPort.startWebXrSession();
      return { rejected: false, error: null };
    } catch (error) {
      return { rejected: true, error: error?.message ?? String(error) };
    }
  });
  assert.equal(rejectedReentry.rejected, true);
  assert.match(rejectedReentry.error, /context is lost/);
  assert.equal(await page.evaluate(() => window.__emulatedXrSessionCount), 2,
    "lost-context re-entry must be rejected before requesting another XRSession");
  stage("graphics loss failed the session and restored native input/audio ownership");

  console.log(JSON.stringify({
    ok: true,
    smoke: "webxr-world-input",
    rayLength,
    active: active.result,
    cleared: finalCleared.result,
    runtimeFrames: running.frames,
    rendererFrames: running.renderer?.frames ?? 0,
    audioHeadOffset: movedListener.lastListener.xrOffset,
    audioListenerRestored: finalRestoredListener.webXrListenerActive === false,
    sessionReentry: {
      sessionCount: await page.evaluate(() => window.__emulatedXrSessionCount),
      runtimeFrames: reentered.frames,
      rendererFrames: reentered.renderer?.frames ?? 0,
      rayRestored: reenteredRay.result.active,
      audioListenerRestored: finalRestoredListener.webXrListenerActive === false,
      matchPreserved: reenteredGameplay.clientState.gameplay.inGame,
      listenerMode: reenteredListener.lastListener.mode,
    },
    contextLoss: {
      ...contextLossTrigger,
      phase: failedXr.phase,
      rendererActive: failedXr.renderer?.active,
      error: failedXr.error,
      reloadBanner: await page.evaluate(() =>
        document.querySelector("#webglContextLostBanner")?.textContent ?? null),
      reentryRejected: rejectedReentry.rejected,
    },
    modalFlow,
    saveLoadRoundTrip,
    textEntry,
    wheelCameraZoom: {
      before: cameraHeightBeforeWheel,
      after: cameraHeightAfterWheel,
    },
    steppedTurn: {
      firstDelta: angularDistance(
        Number(cameraAfterTurn.clientState.view.angle), cameraAngleBeforeTurn,
      ),
      rearmedDelta: angularDistance(
        Number(cameraAfterRearmedTurn.clientState.view.angle),
        Number(heldTurn.clientState.view.angle),
      ),
      heldStable: angularDistance(
        Number(heldTurn.clientState.view.angle), settledTurnAngle,
      ) < 0.05,
      vignetteObserved,
    },
  }));
} finally {
  await browser.close();
  await server.close();
  if (!reuseProfile) await rm(profileDir, { recursive: true, force: true });
}
