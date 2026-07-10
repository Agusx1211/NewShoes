#!/usr/bin/env node
// Challenge (General's Challenge) start repro harness.
//
// Drives: Main Menu -> Single Player -> Challenge -> difficulty -> select a
// general -> "Play Game", then steps the engine watching lastGameLogicStep to
// find where the Challenge start path freezes (the owner reports a freeze on
// clicking "Play Game").  Modeled on skirmish_start_smoke.mjs.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotsRoot = resolve(wasmRoot, "artifacts/screenshots");
const artifactsRoot = resolve(wasmRoot, "artifacts/challenge");

const GAME_SINGLE_PLAYER = 0;
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
  { name: "ZZBase_Shaders.big", sourceName: "Shaders.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "ZZBase_Audio.big", sourceName: "base-generals/Audio.big" },
  { name: "ZZBase_AudioEnglish.big", sourceName: "base-generals/AudioEnglish.big" },
  { name: "ZZBase_Speech.big", sourceName: "base-generals/Speech.big" },
  { name: "ZZBase_SpeechEnglish.big", sourceName: "base-generals/SpeechEnglish.big" },
  { name: "ZZBase_Maps.big", sourceName: "base-generals/Maps.big" },
  { name: "Gensec.big" },
];

const distDir = process.env.CHALLENGE_START_DIST ?? "dist";
const maxStartFrames = Number.parseInt(process.env.CHALLENGE_START_MAX_FRAMES ?? "2000", 10);
const outputPath = resolve(artifactsRoot, "challenge-start-smoke.json");
const loadingScreenshotPath = resolve(screenshotsRoot, "challenge-loading.png");
const activeScreenshotPath = resolve(screenshotsRoot, "challenge-active.png");

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

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

function assertFrameResult(result, label) {
  expect(result?.ok === true && result?.aborted === false,
    `${label} frame RPC failed`, {
      aborted: result?.aborted,
      abortMessage: result?.abortMessage,
      abortStack: result?.abortStack,
      lastGameLogicStep: result?.lastGameLogicStep,
      frame: result?.frame,
    });
  expect(result.frame?.exceptionCaught === false,
    `${label} frame caught a C++ exception`, {
      exception: result.frame?.exception,
      lastGameLogicStep: result?.lastGameLogicStep ?? result.frame?.lastGameLogicStep,
    });
  expect(result.frame?.quitting === false, `${label} frame requested quit`, result.frame);
  return result;
}

async function runFrames(page, frames, label = "real engine") {
  return assertFrameResult(await rpc(page, "realEngineFrame", { frames }), label);
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

function collectWindowRefs(clientState) {
  const refs = [];
  for (const group of [
    clientState?.mainMenu,
    clientState?.skirmishMenu,
    clientState?.challengeMenu,
    clientState?.quitMenu,
  ]) {
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

function compactFrame(result) {
  const cs = result?.frame?.clientState ?? {};
  return {
    framesCompleted: result?.frame?.framesCompleted ?? null,
    top: cs.shell?.topFilename ?? null,
    transition: cs.transition ?? null,
    gameplay: {
      gameMode: cs.gameplay?.gameMode ?? null,
      inGame: cs.gameplay?.inGame ?? null,
      loadingMap: cs.gameplay?.loadingMap ?? null,
      inputEnabled: cs.gameplay?.inputEnabled ?? null,
      objectCount: cs.gameplay?.objectCount ?? null,
    },
    lastGameLogicStep: result?.lastGameLogicStep ?? result?.frame?.lastGameLogicStep ?? null,
    challengeMenu: cs.challengeMenu ?? null,
  };
}

async function waitForCondition(page, label, predicate, maxFrames = 240) {
  const attempts = [];
  let last = null;
  for (let f = 0; f < maxFrames; f += 1) {
    last = await runFrames(page, 1, label);
    attempts.push(compactFrame(last));
    if (predicate(last.frame?.clientState ?? {}, last)) {
      return last;
    }
  }
  expect(false, `${label} did not satisfy condition`, { attempts: attempts.slice(-14) });
}

async function waitForTransitionIdle(page, label, maxFrames = 180) {
  return waitForCondition(page, label,
    (cs) => cs.transition?.ready === true && cs.transition?.finished === true, maxFrames);
}

async function waitForButtonDown(page, target, label, maxFrames = 24) {
  return waitForCondition(page, `${label} down`,
    (cs) => {
      const d = findWindowById(cs, target.id);
      return cs.input?.grabWindow?.id === target.id && d?.selected === true;
    }, maxFrames);
}

async function waitForButtonReleased(page, target, label, maxFrames = 24) {
  return waitForCondition(page, `${label} release`,
    (cs) => {
      const t = findWindowById(cs, target.id);
      return t == null || t.selected === false;
    }, maxFrames);
}

async function clickButton(page, button, hitProbe, label, settleFrames = 180) {
  expect(button?.clickable === true, `${label} button is not clickable`, button);
  const point = hitProbe?.point ?? { x: button.centerX, y: button.centerY };
  expect(Number.isFinite(point.x) && Number.isFinite(point.y),
    `${label} click point is invalid`, { button, hitProbe, point });
  const target = hitProbe?.window?.found === true ? hitProbe.window : button;
  await postMouse(page, WM_MOUSEMOVE, point);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await waitForButtonDown(page, target, label);
  await postMouse(page, WM_LBUTTONUP, point);
  const released = await waitForButtonReleased(page, target, label);
  const settled = settleFrames == null ? released : await waitForTransitionIdle(page, label, settleFrames);
  return { point, target, released, settled };
}

async function revealMainMenu(page) {
  await postMouse(page, WM_MOUSEMOVE, { x: 32, y: 32 });
  await waitForCondition(page, "seed mouse",
    (cs) => cs.input?.mouse?.x === 32 && cs.input?.mouse?.y === 32, 12);
  await postMouse(page, WM_MOUSEMOVE, { x: 96, y: 96 });
  return waitForCondition(page, "main-menu reveal",
    (cs) => cs.input?.mouse?.visible === true &&
      cs.transition?.finished === true &&
      cs.mainMenu?.buttonSinglePlayer?.clickable === true, 180);
}

async function main() {
  await mkdir(artifactsRoot, { recursive: true });
  await mkdir(screenshotsRoot, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot });
  let browser = null;
  const trace = [];
  try {
    const launchOptions = { headless: true };
    if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
    if (process.env.CHALLENGE_START_BROWSER_ARGS) {
      launchOptions.args = process.env.CHALLENGE_START_BROWSER_ARGS.split(/\s+/).filter(Boolean);
    }
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(300000);
    page.on("pageerror", (e) => console.error(`[challenge] pageerror ${e.stack ?? e.message}`));
    page.on("console", (msg) => {
      const t = msg.text();
      if (msg.type() === "error" || /cnc-port:|ChallengeLoadScreen|startNewGame/.test(t)) {
        console.error(`[challenge page] ${t}`);
      }
    });

    const harnessUrl = new URL("harness/index.html", server.url);
    harnessUrl.searchParams.set("dist", distDir);
    await page.goto(harnessUrl.href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

    console.error("[challenge] mounting archives");
    const mount = await rpc(page, "mountArchives", {
      path: "/assets/challenge-start",
      verifyEach: false,
      archives: buildArchives(server.url),
    });
    expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
      "failed to mount runtime archives", mount?.archiveSet ?? mount);

    console.error("[challenge] real init");
    const init = await rpc(page, "realEngineInit", {
      runDirectory: "/assets/challenge-start",
      shellMap: true,
    });
    expect(init?.ok === true && init?.aborted === false && init?.frontier?.initReturned === true,
      "real engine init failed", init?.frontier ?? init);

    let frame = await runFrames(page, 5, "initial menu frames");
    if (frame.frame?.clientState?.shell?.topIsMainMenu !== true) {
      frame = await waitForCondition(page, "main menu available",
        (cs) => cs.shell?.topIsMainMenu === true && cs.shell?.topHidden === false, 180);
    }

    console.error("[challenge] reveal main menu");
    const revealed = await revealMainMenu(page);
    const mainMenu = revealed.frame.clientState.mainMenu;

    console.error("[challenge] click single player");
    const spClick = await clickButton(page, mainMenu.buttonSinglePlayer,
      mainMenu.underButtonSinglePlayerCenter, "single-player");
    let mm = spClick.settled.frame?.clientState?.mainMenu;
    expect(mm?.buttonChallenge?.clickable === true,
      "single-player menu did not expose ButtonChallenge", mm);

    console.error("[challenge] click Challenge");
    const chClick = await clickButton(page, mm.buttonChallenge, null, "challenge");
    mm = chClick.settled.frame?.clientState?.mainMenu;
    // difficulty buttons should now be exposed
    expect(mm?.buttonEasy?.clickable === true || mm?.buttonMedium?.clickable === true,
      "challenge did not expose difficulty buttons", mm);

    console.error("[challenge] click Easy difficulty");
    const diffButton = mm.buttonEasy?.clickable === true ? mm.buttonEasy : mm.buttonMedium;
    const diffHit = mm.buttonEasy?.clickable === true
      ? mm.underButtonEasyCenter : null;
    const diffClick = await clickButton(page, diffButton, diffHit, "difficulty");

    console.error("[challenge] wait for ChallengeMenu general buttons to reveal");
    // The challenge menu fades in (ChallengeMenuFade transition); the general
    // position medallions are managerHidden until the fade + shell-map settle,
    // so wait for the first medallion to become genuinely clickable.
    const chMenuReady = await waitForCondition(page, "challenge menu general clickable",
      (cs) => cs.challengeMenu?.parent?.found === true &&
        cs.challengeMenu?.generalPosition0?.clickable === true, 600);
    const chMenu = chMenuReady.frame.clientState.challengeMenu;
    trace.push({ stage: "challengeMenu", challengeMenu: chMenu });

    console.error("[challenge] select general position 0");
    // These medallions are checkbox gadgets; a plain down/up at the button
    // center fires GBM_SELECTED, which reveals the "Play Game" button.
    const genPoint = { x: chMenu.generalPosition0.centerX, y: chMenu.generalPosition0.centerY };
    await postMouse(page, WM_MOUSEMOVE, genPoint);
    await postMouse(page, WM_LBUTTONDOWN, genPoint);
    await runFrames(page, 2, "general down");
    await postMouse(page, WM_LBUTTONUP, genPoint);
    // ButtonPlay is winHidden until a general is chosen; wait until clickable.
    const playReady = await waitForCondition(page, "play button clickable",
      (cs) => cs.challengeMenu?.buttonPlay?.clickable === true, 240);
    const playMenu = playReady.frame.clientState.challengeMenu;
    trace.push({ stage: "afterGeneralSelect", challengeMenu: playMenu });

    console.error("[challenge] click PLAY GAME");
    const playPoint = playMenu.underButtonPlayCenter?.point
      ?? { x: playMenu.buttonPlay.centerX, y: playMenu.buttonPlay.centerY };
    await postMouse(page, WM_MOUSEMOVE, playPoint);
    await postMouse(page, WM_LBUTTONDOWN, playPoint);
    await runFrames(page, 2, "play down");
    await postMouse(page, WM_LBUTTONUP, playPoint);
    const afterPlay = await runFrames(page, 3, "after play click");
    trace.push({ stage: "afterPlayClick", frame: compactFrame(afterPlay) });

    console.error("[challenge] stepping frames, watching for freeze / load / active");
    let steps = 0;
    const chunk = 20;
    let lastStep = null;
    // "Loaded and simulating" is the freeze-repro pass condition: the challenge
    // game reached in-game with a populated map and the sim advancing. Input on a
    // challenge map can stay disabled while the map's intro script runs, so we do
    // NOT require inputEnabled for the pass -- we record it (and how long we saw
    // it stay disabled) as diagnostics instead.
    let reachedLoaded = false;
    let inputEnabledSeen = false;
    let loadingSeen = false;
    let framesAfterLoaded = 0;
    let activeFrame = null;
    while (steps < maxStartFrames) {
      const r = await runFrames(page, chunk, "challenge step");
      steps += chunk;
      const cf = compactFrame(r);
      const step = cf.lastGameLogicStep;
      lastStep = step;
      if (cf.gameplay.loadingMap === true) loadingSeen = true;
      const loaded = cf.gameplay.inGame === true && cf.gameplay.loadingMap === false &&
        (cf.gameplay.objectCount ?? 0) > 0;
      if (loaded && !reachedLoaded) {
        reachedLoaded = true;
        activeFrame = cf;
        trace.push({ stage: "loaded", frame: cf });
        console.error(`[challenge] LOADED at +${steps}f objs=${cf.gameplay.objectCount} inputEnabled=${cf.gameplay.inputEnabled}`);
      }
      if (reachedLoaded) framesAfterLoaded += chunk;
      if (cf.gameplay.inputEnabled === true) inputEnabledSeen = true;
      if (steps % 100 === 0 || loaded) {
        console.error(`[challenge] +${steps}f step=${step} inGame=${cf.gameplay.inGame} loadingMap=${cf.gameplay.loadingMap} inputEnabled=${cf.gameplay.inputEnabled} objs=${cf.gameplay.objectCount}`);
      }
      // Once loaded, give the intro script a bounded window to enable input,
      // then finish -- the freeze is disproven the moment we are loaded+simulating.
      if (reachedLoaded && (inputEnabledSeen || framesAfterLoaded >= 400)) {
        activeFrame = cf;
        break;
      }
    }
    const reachedActive = reachedLoaded;
    if (loadingSeen) {
      await page.locator("#viewport").screenshot({ path: loadingScreenshotPath }).catch(() => {});
    }
    if (reachedActive) {
      await page.locator("#viewport").screenshot({ path: activeScreenshotPath }).catch(() => {});
    }

    const result = {
      ok: reachedActive,
      dist: distDir,
      reachedLoaded,
      inputEnabledSeen,
      loadingSeen,
      totalStepped: steps,
      objectCount: activeFrame?.gameplay?.objectCount ?? null,
      lastGameLogicStep: lastStep,
      trace,
    };
    await writeFile(outputPath, JSON.stringify(result, null, 2));
    console.error(`[challenge] result: reachedLoaded=${reachedLoaded} inputEnabledSeen=${inputEnabledSeen} loadingSeen=${loadingSeen} objs=${result.objectCount} lastStep=${lastStep}`);
    if (!reachedActive) {
      throw new Error(`Challenge did not load into a simulating game. lastGameLogicStep=${lastStep} loadingSeen=${loadingSeen}`);
    }
    console.error("[challenge] PASS: challenge game loaded and simulating (freeze fixed)");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
