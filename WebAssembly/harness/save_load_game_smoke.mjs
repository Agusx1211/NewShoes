#!/usr/bin/env node

import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const artifactRoot = resolve(
  process.env.SAVE_LOAD_ARTIFACT_DIR ?? join(wasmRoot, "artifacts/save-load-game"),
);
const profileDir = join(artifactRoot, "browser-profile");
const distDir = process.env.SAVE_LOAD_DIST ?? "dist-threaded-release";
const bootTimeoutMs = Number(process.env.SAVE_LOAD_BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const expectedGpuRenderer = process.env.SAVE_LOAD_EXPECT_GPU ?? null;
const verbose = process.env.VERBOSE === "1";
const browserArgs = (process.env.SAVE_LOAD_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);

const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const saveDescriptionSuffix = " Issue 34 UI Save";

function expect(condition, message, payload = null) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function log(message) {
  process.stdout.write(`[save-load-game] ${message}\n`);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(
    ({ command: name, payload: data }) => window.CnCPort.rpc(name, data),
    { command, payload },
  );
}

async function clickWithRetry(page, name, attempts = 40) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await rpc(page, "clickWindowByName", { name });
    if (last?.result?.clicked === true) return last.result;
    await page.waitForTimeout(500);
  }
  throw new Error(`window never became clickable: ${name}: ${JSON.stringify(last)}`);
}

async function queryWithRetry(page, name, predicate = (window) => window.found === true, attempts = 60) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await rpc(page, "queryWindowByName", { name });
    if (last?.result && predicate(last.result)) return last.result;
    await page.waitForTimeout(500);
  }
  throw new Error(`window did not reach expected state: ${name}: ${JSON.stringify(last)}`);
}

async function clickUntilWindow(page, sourceName, targetName, targetPredicate, attempts = 40) {
  let lastClick = null;
  let lastTarget = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastClick = await rpc(page, "clickWindowByName", { name: sourceName });
    await page.waitForTimeout(500);
    lastTarget = await rpc(page, "queryWindowByName", { name: targetName });
    if (lastTarget?.result && targetPredicate(lastTarget.result)) return lastTarget.result;
  }
  throw new Error(`clicking ${sourceName} did not expose ${targetName}: ${JSON.stringify({ lastClick, lastTarget })}`);
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

async function postMouse(page, message, point) {
  const result = await rpc(page, "postMessage", {
    message,
    lParam: win32PointLParam(point),
    point,
  });
  expect(result?.ok === true, "mouse input was not forwarded", { message, point, result });
}

async function selectListRow(page, name, rowIndex) {
  const list = await queryWithRetry(
    page,
    name,
    (window) => window.found === true && (window.listBox?.entryCount ?? 0) > rowIndex,
  );
  const row = list.listBox.rows[rowIndex];
  expect(row != null && row.bottom > row.top, "list row has no clickable geometry", { list, rowIndex });
  const point = {
    x: Math.round(list.x + Math.min(list.width - 4, Math.max(4, list.width * 0.35))),
    y: Math.round((row.top + row.bottom) / 2),
  };
  await postMouse(page, WM_MOUSEMOVE, point);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await postMouse(page, WM_LBUTTONUP, point);
  return queryWithRetry(page, name, (window) => window.listBox?.selected === rowIndex);
}

async function viewportPngDataUrl(page) {
  const result = await rpc(page, "screenshot");
  const dataUrl = typeof result?.screenshot === "string"
    ? result.screenshot
    : result?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    "screenshot RPC returned no PNG", result);
  return dataUrl;
}

async function captureViewport(page, filename) {
  const dataUrl = await viewportPngDataUrl(page);
  const path = join(artifactRoot, filename);
  await writeFile(path, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  return path;
}

async function waitForRuntimeReady(page) {
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: bootTimeoutMs });
  await page.waitForFunction(() => {
    const engine = window.CnCPort?.state?.threadedEngine;
    return engine?.loop?.active === true
      && engine?.frame != null
      && engine.frame.loadSessionActive === false
      && (engine.loop.clientFrames ?? 0) > 30;
  }, null, { timeout: bootTimeoutMs, polling: 1000 });
}

async function verifyWorkerGpuRenderer(page) {
  await page.waitForFunction(() =>
    String(window.CnCPort?.state?.threadedEngine?.graphics?.renderer ?? "").length > 0,
  null, { timeout: 30000, polling: 250 });
  const renderer = await page.evaluate(() =>
    String(window.CnCPort.state.threadedEngine.graphics.renderer));
  if (expectedGpuRenderer) {
    expect(renderer.includes(expectedGpuRenderer),
      "engine worker is not using the expected GPU renderer", { renderer, expectedGpuRenderer });
  }
  log(`engine worker GPU renderer: ${renderer}`);
  return renderer;
}

async function openPlayPage(browser, serverUrl) {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on("console", (message) => {
    if (verbose || message.type() === "error") {
      process.stderr.write(`[save-load page] ${message.type()}: ${message.text()}\n`);
    }
  });
  page.on("pageerror", (error) => {
    process.stderr.write(`[save-load pageerror] ${error.stack ?? error.message}\n`);
  });
  const url = new URL("harness/play.html", serverUrl);
  url.searchParams.set("autostart", "1");
  url.searchParams.set("dist", distDir);
  await page.goto(url.href, { waitUntil: "load" });
  await waitForRuntimeReady(page);
  return page;
}

async function startSkirmish(page) {
  log("opening a skirmish through the original shell UI");
  await clickUntilWindow(
    page,
    "MainMenu.wnd:ButtonSinglePlayer",
    "MainMenu.wnd:ButtonSkirmish",
    (window) => window.clickable && !window.managerHidden,
  );
  await clickUntilWindow(
    page,
    "MainMenu.wnd:ButtonSkirmish",
    "SkirmishGameOptionsMenu.wnd:ButtonStart",
    (window) => window.clickable && !window.managerHidden,
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await rpc(page, "clickWindowByName", { name: "SkirmishGameOptionsMenu.wnd:ButtonStart" });
    const loadStarted = await page.waitForFunction(() =>
      window.CnCPort?.state?.threadedEngine?.frame?.loadSessionActive === true,
    null, { timeout: 3000, polling: 250 }).then(() => true).catch(() => false);
    if (loadStarted) break;
    if (attempt === 19) throw new Error("skirmish load session never started");
  }
  await page.waitForFunction(() => {
    const engine = window.CnCPort?.state?.threadedEngine;
    return engine?.frame?.loadSessionActive === false
      && Number(engine.frame.logicFrame ?? 0) > 0;
  }, null, { timeout: bootTimeoutMs, polling: 1000 });
  await waitForPlayableGame(page, "new skirmish");
}

async function waitForPlayableGame(page, label) {
  let last = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    last = await rpc(page, "queryDrawables");
    const drawables = last?.drawables?.drawables ?? [];
    if (last?.ok === true && drawables.length > 0) return last;
    await page.waitForTimeout(1000);
  }
  throw new Error(`${label} did not expose playable drawables: ${JSON.stringify(summarizeDrawables(last))}`);
}

function summarizeDrawables(result) {
  const payload = result?.drawables ?? {};
  const byPlayer = {};
  for (const drawable of payload.allDrawables ?? []) {
    const key = String(drawable.playerIndex ?? "none");
    byPlayer[key] = (byPlayer[key] ?? 0) + 1;
  }
  return {
    ok: result?.ok,
    ready: payload.ready,
    guard: payload.guard,
    localPlayerIndex: payload.localPlayerIndex,
    localOwned: (payload.drawables ?? []).length,
    all: (payload.allDrawables ?? []).length,
    byPlayer,
    stats: payload.stats,
  };
}

async function waitForRestoredGameState(page, label, expectedState) {
  let last = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const frame = await windowFrame(page);
    const state = summarizeDrawables(await rpc(page, "queryDrawables"));
    last = { frame, state };
    if (state.ok === true
        && state.localPlayerIndex === expectedState.localPlayerIndex
        && state.localOwned === expectedState.localOwned
        && state.all === expectedState.all) {
      return last;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`${label} did not restore ownership and drawables: ${JSON.stringify(last)}`);
}

async function openInGameSaveLoad(page) {
  await page.locator("#viewport").focus();
  await page.keyboard.press("Escape");
  await queryWithRetry(page, "QuitMenu.wnd:ButtonSaveLoad", (window) => window.clickable);
  await clickWithRetry(page, "QuitMenu.wnd:ButtonSaveLoad");
  return queryWithRetry(page, "PopupSaveLoad.wnd:ListboxGames", (window) =>
    window.found === true && window.hidden === false && window.listBox != null);
}

async function resumeFromQuitMenu(page) {
  await queryWithRetry(page, "QuitMenu.wnd:ButtonReturn", (window) =>
    window.found === true && window.clickable === true && !window.managerHidden);
  const before = await windowFrame(page);
  await clickWithRetry(page, "QuitMenu.wnd:ButtonReturn");
  await page.waitForFunction((beforeFrame) =>
    Number(window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1) > beforeFrame,
  before, { timeout: 30000, polling: 250 });
}

async function createSaveThroughUi(page) {
  log("saving through the in-game popup");
  const emptyList = await openInGameSaveLoad(page);
  expect(emptyList.listBox.entryCount === 1 && emptyList.listBox.selected === 0,
    "new-save row was not the only initial entry", emptyList.listBox);
  const menuScreenshot = await captureViewport(page, "01-in-game-save-menu.png");
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonSave");
  const entry = await queryWithRetry(page, "PopupSaveLoad.wnd:EntryDesc", (window) =>
    window.found === true && window.hidden === false && window.clickable === true);
  await clickWithRetry(page, "PopupSaveLoad.wnd:EntryDesc");
  await page.locator("#viewport").focus();
  await page.keyboard.type(saveDescriptionSuffix);
  const typedEntry = await queryWithRetry(page, "PopupSaveLoad.wnd:EntryDesc", (window) =>
    window.entryText?.includes(saveDescriptionSuffix.trim()));
  const beforeSaveState = summarizeDrawables(await rpc(page, "queryDrawables"));
  log(`pre-save ownership: ${JSON.stringify(beforeSaveState)}`);
  const descriptionScreenshot = await captureViewport(page, "02-save-description.png");
  const savedFrame = await windowFrame(page);
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonSaveDescConfirm");

  const files = await waitForSaveCount(page, 1);
  expect(files[0].size > 1024, "real save file is unexpectedly small", files[0]);
  const format = await inspectSaveFormat(page);
  expect(format.sawEof === true && format.blockVersions.CHUNK_Players === 1,
    "new save is not compatible with the original PlayerList v1 format", format);
  const persisted = await rpc(page, "persistSaves", { reason: "save-load-game-ui-save" });
  expect(persisted?.ok === true, "new save did not persist to IDBFS", persisted);
  await resumeFromQuitMenu(page);
  const afterSaveState = summarizeDrawables(await rpc(page, "queryDrawables"));
  log(`after-save ownership: ${JSON.stringify(afterSaveState)}`);
  return {
    files,
    format,
    savedFrame,
    beforeSaveState,
    afterSaveState,
    menuScreenshot,
    descriptionScreenshot,
    entry,
    typedEntry,
  };
}

async function waitForSaveCount(page, expectedCount) {
  let last = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    last = await rpc(page, "listSaves");
    if (last?.ok === true && (last.files ?? []).length === expectedCount) return last.files;
    await page.waitForTimeout(500);
  }
  throw new Error(`save count did not become ${expectedCount}: ${JSON.stringify(last)}`);
}

async function inspectSaveFormat(page) {
  return page.evaluate(() => {
    const saves = window.CnCPort.listSaves();
    const file = saves.files?.[0];
    if (!file) return { error: "save file is missing", blockVersions: {}, sawEof: false };

    const bytes = window.CnCPort.engineModule().FS.readFile(`${saves.dir}/${file.name}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder("ascii");
    const blockVersions = {};
    let offset = 0;
    let sawEof = false;
    while (offset < bytes.length) {
      const tokenLength = bytes[offset];
      offset += 1;
      if (offset + tokenLength > bytes.length) break;
      const token = decoder.decode(bytes.subarray(offset, offset + tokenLength));
      offset += tokenLength;
      if (token === "SG_EOF") {
        sawEof = true;
        break;
      }
      if (offset + 4 > bytes.length) break;
      const blockSize = view.getInt32(offset, true);
      offset += 4;
      if (blockSize < 1 || offset + blockSize > bytes.length) break;
      blockVersions[token] = bytes[offset];
      offset += blockSize;
    }
    return { file: file.name, size: bytes.length, blockVersions, sawEof };
  });
}

async function windowFrame(page) {
  return page.evaluate(() => Number(window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1));
}

async function armLogicFrameObserver(page) {
  return page.evaluate(() => {
    const initialFrame = Number(window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1);
    const observation = {
      running: true,
      initialFrame,
      firstChanged: null,
      firstDrop: null,
      minimumFrame: initialFrame,
      samples: [],
    };
    window.__saveLoadLogicFrameObserver = observation;
    const sample = () => {
      if (!observation.running || window.__saveLoadLogicFrameObserver !== observation) return;
      const frame = Number(window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1);
      if (Number.isFinite(frame) && frame >= 0) {
        const previous = observation.samples.at(-1)?.frame;
        if (frame !== previous && observation.samples.length < 256) {
          observation.samples.push({ frame, atMs: performance.now() });
        }
        observation.minimumFrame = Math.min(observation.minimumFrame, frame);
        if (observation.firstChanged === null && Math.abs(frame - initialFrame) >= 5) {
          observation.firstChanged = frame;
        }
        if (observation.firstDrop === null && frame <= initialFrame - 5) {
          observation.firstDrop = frame;
        }
      }
      requestAnimationFrame(sample);
    };
    sample();
    return { initialFrame };
  });
}

async function waitForLogicFrameObservation(page, field) {
  expect(field === "firstDrop" || field === "firstChanged", "invalid frame observation field", field);
  await page.waitForFunction((name) =>
    Number.isFinite(window.__saveLoadLogicFrameObserver?.[name]),
  field, { timeout: 120000, polling: 16 });
  return page.evaluate(() => {
    const observation = window.__saveLoadLogicFrameObserver;
    observation.running = false;
    return {
      initialFrame: observation.initialFrame,
      firstChanged: observation.firstChanged,
      firstDrop: observation.firstDrop,
      minimumFrame: observation.minimumFrame,
      samples: observation.samples,
    };
  });
}

async function waitForLogicAdvance(page, minimumDelta) {
  const start = await windowFrame(page);
  await page.waitForFunction(({ startFrame, delta }) =>
    Number(window.CnCPort?.state?.threadedEngine?.frame?.logicFrame ?? -1) >= startFrame + delta,
  { startFrame: start, delta: minimumDelta }, { timeout: 120000, polling: 250 });
  return { start, end: await windowFrame(page) };
}

function isVisibleWindow(window) {
  return window?.found === true
    && window.hidden === false
    && window.managerHidden === false
    && window.width > 0
    && window.height > 0;
}

async function waitForControlBarRestored(page) {
  const names = [
    "ControlBar.wnd:ControlBarParent",
    "ControlBar.wnd:LeftHUD",
    "ControlBar.wnd:RightHUD",
    "ControlBar.wnd:MoneyDisplay",
  ];
  let last = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const windows = await Promise.all(names.map(async (name) =>
      (await rpc(page, "queryWindowByName", { name }))?.result));
    const [parent, ...children] = windows;
    last = { parent, children };
    const viewport = page.viewportSize();
    if (isVisibleWindow(parent)
        && parent.clickable === true
        && parent.y < viewport.height
        && parent.y + parent.height <= viewport.height
        && children.every(isVisibleWindow)) {
      // ShowControlBar animates the real window for 500 ms. Require its final
      // geometry to remain stable before treating the loaded UI as restored.
      await page.waitForTimeout(750);
      const settled = (await rpc(page, "queryWindowByName", { name: names[0] }))?.result;
      if (isVisibleWindow(settled)
          && settled.clickable === true
          && settled.x === parent.x
          && settled.y === parent.y
          && settled.width === parent.width
          && settled.height === parent.height) {
        const render = await page.evaluate(async ({ dataUrl, region }) => {
          const image = new Image();
          const loaded = new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
          });
          image.src = dataUrl;
          await loaded;
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(region.x, region.y, region.width, region.height).data;
          const totals = [0, 0, 0];
          for (let offset = 0; offset < pixels.length; offset += 4) {
            totals[0] += pixels[offset];
            totals[1] += pixels[offset + 1];
            totals[2] += pixels[offset + 2];
          }
          const count = pixels.length / 4;
          return {
            region,
            meanRed: totals[0] / count,
            meanGreen: totals[1] / count,
            meanBlue: totals[2] / count,
          };
        }, {
          dataUrl: await viewportPngDataUrl(page),
          region: {
            x: Math.round(settled.x + settled.width * 0.30),
            y: Math.round(settled.y + settled.height * 0.48),
            width: Math.round(settled.width * 0.40),
            height: Math.round(settled.height * 0.40),
          },
        });
        if (render.meanRed + render.meanGreen + render.meanBlue > 30) {
          return { parent: settled, children, render };
        }
        last = { parent: settled, children, render };
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`control bar did not return after loading: ${JSON.stringify(last)}`);
}

async function loadFromInGameUi(page, savedFrame, expectedState) {
  log("loading the snapshot from the in-game popup");
  const advanced = await waitForLogicAdvance(page, 30);
  const list = await openInGameSaveLoad(page);
  expect(list.listBox.entryCount === 2, "popup did not enumerate new-save plus saved game", list.listBox);
  expect(list.listBox.rows[1]?.cells?.[0]?.includes(saveDescriptionSuffix.trim()),
    "saved description is missing from the popup list", list.listBox.rows);
  await selectListRow(page, "PopupSaveLoad.wnd:ListboxGames", 1);
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonLoad");
  await queryWithRetry(page, "PopupSaveLoad.wnd:ButtonLoadConfirm", (window) =>
    window.found === true && window.hidden === false && window.clickable === true);
  await page.waitForTimeout(750);
  const confirmScreenshot = await captureViewport(page, "03-in-game-load-confirm.png");
  await armLogicFrameObserver(page);
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonLoadConfirm");
  const rewind = await waitForLogicFrameObservation(page, "firstDrop");
  expect(rewind.firstDrop < rewind.initialFrame - 10
      && Math.abs(rewind.firstDrop - savedFrame) <= 20,
    "loading did not publish the saved simulation frame rewind", { savedFrame, advanced, rewind });
  const restored = await waitForRestoredGameState(page, "in-game loaded save", expectedState);
  log(`post-load ownership: ${JSON.stringify(restored.state)}`);
  const controlBar = await waitForControlBarRestored(page);
  const screenshot = await captureViewport(page, "04-in-game-load-restored.png");
  return {
    advanced,
    loadedFrame: rewind.firstDrop,
    settledFrame: restored.frame,
    rewind,
    restoredState: restored.state,
    controlBar,
    confirmScreenshot,
    screenshot,
  };
}

async function overwriteThroughUi(page) {
  log("overwriting the save through its confirmation UI");
  await waitForLogicAdvance(page, 15);
  const list = await openInGameSaveLoad(page);
  await selectListRow(page, "PopupSaveLoad.wnd:ListboxGames", 1);
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonSave");
  await queryWithRetry(page, "PopupSaveLoad.wnd:ButtonOverwriteConfirm", (window) =>
    window.found === true && window.hidden === false && window.clickable === true);
  await page.waitForTimeout(750);
  const screenshot = await captureViewport(page, "05-overwrite-confirm.png");
  const frame = await windowFrame(page);
  const savedState = summarizeDrawables(await rpc(page, "queryDrawables"));
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonOverwriteConfirm");
  await queryWithRetry(page, "QuitMenu.wnd:ButtonReturn", (window) =>
    window.found === true && window.clickable === true && !window.managerHidden);
  const files = await waitForSaveCount(page, 1);
  const persisted = await rpc(page, "persistSaves", { reason: "save-load-game-ui-overwrite" });
  expect(persisted?.ok === true, "overwritten save did not persist", persisted);
  return { files, frame, savedState, screenshot };
}

async function exitRuntime(page) {
  const result = await page.evaluate(() => window.ZeroHRuntime.exit());
  expect(result?.ok === true, "runtime did not close with a durable save flush", result);
  return result;
}

async function loadFromShellUi(page, overwrittenFrame, expectedState) {
  log("loading the persisted save through the title-screen UI");
  await clickUntilWindow(
    page,
    "MainMenu.wnd:ButtonLoadReplay",
    "MainMenu.wnd:ButtonLoadGame",
    (window) => window.clickable && !window.managerHidden,
  );
  await clickUntilWindow(
    page,
    "MainMenu.wnd:ButtonLoadGame",
    "SaveLoad.wnd:ListboxGames",
    (window) => window.found === true && !window.managerHidden && window.listBox?.entryCount === 1,
  );
  const list = await queryWithRetry(page, "SaveLoad.wnd:ListboxGames", (window) =>
    window.found === true && window.hidden === false && window.listBox?.entryCount === 1);
  expect(list.listBox.rows[0]?.cells?.[0]?.includes(saveDescriptionSuffix.trim()),
    "persisted save description is missing from shell load UI", list.listBox.rows);
  const menuScreenshot = await captureViewport(page, "06-shell-load-menu.png");
  await selectListRow(page, "SaveLoad.wnd:ListboxGames", 0);
  await armLogicFrameObserver(page);
  await clickWithRetry(page, "SaveLoad.wnd:ButtonLoad");
  const transition = await waitForLogicFrameObservation(page, "firstChanged");
  expect(Math.abs(transition.firstChanged - overwrittenFrame) <= 20,
    "title load did not publish the saved simulation frame", { overwrittenFrame, transition });
  const restored = await waitForRestoredGameState(page, "shell loaded save", expectedState);
  await page.waitForFunction(() =>
    window.CnCPort?.state?.threadedEngine?.frame?.loadSessionActive === false,
  null, { timeout: bootTimeoutMs, polling: 250 });
  await waitForLogicAdvance(page, 2);
  const controlBar = await waitForControlBarRestored(page);
  const screenshot = await captureViewport(page, "07-shell-load-restored.png");
  return {
    loadedFrame: transition.firstChanged,
    settledFrame: restored.frame,
    transition,
    restoredState: restored.state,
    controlBar,
    menuScreenshot,
    screenshot,
  };
}

async function deleteThroughUi(page) {
  log("deleting the save through the in-game confirmation UI");
  await openInGameSaveLoad(page);
  await selectListRow(page, "PopupSaveLoad.wnd:ListboxGames", 1);
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonDelete");
  await queryWithRetry(page, "PopupSaveLoad.wnd:ButtonDeleteConfirm", (window) =>
    window.found === true && window.hidden === false && window.clickable === true);
  await page.waitForTimeout(750);
  const confirmScreenshot = await captureViewport(page, "08-delete-confirm.png");
  await clickWithRetry(page, "PopupSaveLoad.wnd:ButtonDeleteConfirm");
  const list = await queryWithRetry(page, "PopupSaveLoad.wnd:ListboxGames", (window) =>
    window.listBox?.entryCount === 1 && window.listBox?.selected === 0);
  const files = await waitForSaveCount(page, 0);
  const persisted = await rpc(page, "persistSaves", { reason: "save-load-game-ui-delete" });
  expect(persisted?.ok === true, "save deletion did not persist", persisted);
  return { list: list.listBox, files, confirmScreenshot };
}

async function main() {
  expect(/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(distDir), "unsafe dist directory", distDir);
  await mkdir(artifactRoot, { recursive: true });
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });

  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "0.0.0.0" });
  log(`ephemeral harness server: ${server.url}`);
  const browser = await chromium.launchPersistentContext(profileDir, {
    viewport: { width: 1280, height: 800 },
    args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
  });
  let page = null;
  try {
    page = await openPlayPage(browser, server.url);
    const gpuRenderer = await verifyWorkerGpuRenderer(page);
    await startSkirmish(page);
    const initialState = await rpc(page, "queryDrawables");
    log(`initial ownership: ${JSON.stringify(summarizeDrawables(initialState))}`);
    const beforeSaveScreenshot = await captureViewport(page, "00-skirmish-before-save.png");
    const created = await createSaveThroughUi(page);
    const inGameLoad = await loadFromInGameUi(page, created.savedFrame, created.beforeSaveState);
    const overwritten = await overwriteThroughUi(page);
    const firstExit = await exitRuntime(page);
    await page.close();

    page = await openPlayPage(browser, server.url);
    const persistedFiles = await waitForSaveCount(page, 1);
    const shellLoad = await loadFromShellUi(page, overwritten.frame, overwritten.savedState);
    const deleted = await deleteThroughUi(page);
    const finalExit = await exitRuntime(page);

    const summary = {
      ok: true,
      distDir,
      gpuRenderer,
      beforeSaveScreenshot,
      initialState: summarizeDrawables(initialState),
      created,
      inGameLoad,
      overwritten,
      firstExit,
      persistedFiles,
      shellLoad,
      deleted,
      finalExit,
    };
    await writeFile(join(artifactRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    log(`PASS: ${join(artifactRoot, "summary.json")}`);
  } finally {
    await page?.close().catch(() => {});
    await browser.close();
    await server.close();
    await rm(profileDir, { recursive: true, force: true });
  }
}

await main();
