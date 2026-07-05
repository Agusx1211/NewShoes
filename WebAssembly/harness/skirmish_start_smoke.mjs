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

const screenshotPath = resolve(
  process.env.SKIRMISH_START_SCREENSHOT ??
    resolve(screenshotsRoot, "skirmish-start-smoke.png"));
const outputPath = resolve(
  process.env.SKIRMISH_START_OUTPUT ??
    resolve(artifactsRoot, "skirmish-start-smoke.json"));
const maxStartFrames = parsePositiveInt("SKIRMISH_START_MAX_FRAMES", 4200);
const frameChunk = parsePositiveInt("SKIRMISH_START_FRAME_CHUNK", 30);
const requestedSkirmishMap = String(process.env.SKIRMISH_START_MAP ?? "").trim();

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
    display,
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
  for (const group of [clientState?.mainMenu, clientState?.skirmishMenu]) {
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

    await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

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
    await clickButton(
      page,
      skirmishMenu.buttonStart,
      skirmishMenu.underButtonStartCenter,
      "skirmish start",
      null);

    console.error("[skirmish-start] wait for active match");
    const active = await waitForSkirmishMatch(page);
    await page.locator("#viewport").screenshot({ path: screenshotPath });

    // ADD-ONLY HUD geometry probe: one full realEngineFrame to capture the
    // per-window control-bar geometry (drawFunc/systemFunc/x/y/w/h/hidden) so
    // the bottom-strip pixels can be mapped to specific HUD windows. Read-only.
    let controlBarWindows = null;
    let controlBarWindowFull = null;
    try {
      const full = await runFrames(page, 1, "hud geometry probe");
      const locate = (obj, keys, depth = 0) => {
        if (!obj || typeof obj !== "object" || depth > 6) return undefined;
        for (const k of keys) { if (obj[k] !== undefined) return obj[k]; }
        for (const v of Object.values(obj)) {
          if (v && typeof v === "object") {
            const found = locate(v, keys, depth + 1);
            if (found !== undefined) return found;
          }
        }
        return undefined;
      };
      controlBarWindowFull = locate(full.frame, ["controlBarWindows"]) ?? null;
      controlBarWindows = controlBarWindowFull;
    } catch (error) {
      controlBarWindows = { error: error?.message ?? String(error) };
    }

    const mapCache = await rpc(page, "mapCacheProbe");
    const result = {
      ok: true,
      source: "skirmish-start-smoke",
      archiveCount: mount.archiveSet.archiveCount,
      requestedMap: requestedSkirmishMap || null,
      selectedMap: mapCache?.probe?.skirmishGameInfo?.map
        ?? mapCache?.probe?.gameInfo?.map
        ?? mapCache?.probe?.firstOfficialMultiplayerMap
        ?? null,
      skirmishMapSet: skirmishMapSet?.result ?? null,
      firstOfficialMultiplayerMetadata: mapCache?.probe?.firstOfficialMultiplayerMetadata ?? null,
      officialMultiplayerCount: mapCache?.probe?.officialMultiplayerCount ?? null,
      officialMultiplayerMaps: mapCache?.probe?.officialMultiplayerMaps ?? [],
      framesAdvancedAfterStart: active.framesAdvanced,
      finalGameplay: compactGameplay(active.result.frame),
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
