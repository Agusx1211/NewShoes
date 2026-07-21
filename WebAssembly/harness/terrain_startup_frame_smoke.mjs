#!/usr/bin/env node

// Starts a shipping threaded skirmish through the real browser mouse path,
// applies the late dynamic-resolution reconciliation that used to expose the
// cleared backing store, then proves the first resized gameplay frame is
// already visible before the next pointer event.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outputDir = resolve(process.env.TERRAIN_STARTUP_OUTPUT_DIR
  ?? join(wasmRoot, "artifacts/terrain-startup-frame"));
const profileDir = resolve(process.env.TERRAIN_STARTUP_PROFILE_DIR
  ?? join(outputDir, "browser-profile"));
const distDir = process.env.TERRAIN_STARTUP_DIST ?? "dist-threaded-release";
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const expectedRenderer = process.env.TERRAIN_STARTUP_EXPECT_RENDERER ?? "";
const expectBlackRegression = process.env.TERRAIN_STARTUP_EXPECT_BLACK === "1";
const keepProfile = process.env.TERRAIN_STARTUP_KEEP_PROFILE === "1";
const bootTimeoutMs = Number(process.env.BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const matchTimeoutMs = Number(process.env.MATCH_TIMEOUT_MS ?? 8 * 60 * 1000);
const verbose = process.env.VERBOSE === "1";
const startedAt = Date.now();
const wmMouseMove = 0x0200;
const resizedWidth = 1600;
const resizedHeight = 900;

function progress(message) {
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stderr.write(`[terrain-startup +${elapsedSeconds}s] ${message}\n`);
}

function expect(condition, message, detail = null) {
  if (!condition) {
    throw new Error(`${message}${detail == null ? "" : `\n${JSON.stringify(detail, null, 2)}`}`);
  }
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function frameSummary(page, frames = 1) {
  const result = await rpc(page, "realEngineFrameSummary", { frames });
  expect(result?.ok === true && result?.aborted === false,
    "real engine frame summary failed", result);
  return result.frame;
}

async function fullFrame(page, frames = 1) {
  const result = await rpc(page, "realEngineFrame", { frames });
  expect(result?.ok === true && result?.aborted === false,
    "real engine full frame failed", result);
  return result.frame;
}

function clientState(frame) {
  return frame?.clientState ?? frame;
}

function buttonState(button) {
  return button ? {
    found: button.found,
    clickable: button.clickable,
    hidden: button.hidden,
    managerHidden: button.managerHidden,
  } : null;
}

async function waitForFrame(page, label, predicate, timeoutMs, readFrame = frameSummary) {
  const deadline = Date.now() + timeoutMs;
  let nextProgressAt = Date.now() + 15_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await readFrame(page);
    if (predicate(last)) return last;
    if (Date.now() >= nextProgressAt) {
      progress(`${label}: ${JSON.stringify({
        inGame: clientState(last)?.gameplay?.inGame ?? null,
        loadingMap: clientState(last)?.gameplay?.loadingMap ?? null,
        inputEnabled: clientState(last)?.gameplay?.inputEnabled ?? null,
        mouse: clientState(last)?.input?.mouse ? {
          x: clientState(last).input.mouse.x,
          y: clientState(last).input.mouse.y,
          visible: clientState(last).input.mouse.visible,
        } : null,
        transitionFinished: clientState(last)?.transition?.finished ?? null,
        singlePlayer: buttonState(clientState(last)?.mainMenu?.buttonSinglePlayer),
        skirmish: buttonState(clientState(last)?.mainMenu?.buttonSkirmish),
        start: buttonState(clientState(last)?.skirmishMenu?.buttonStart),
      })}`);
      nextProgressAt = Date.now() + 15_000;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out\n${JSON.stringify({
    gameplay: clientState(last)?.gameplay ?? null,
    mainMenu: clientState(last)?.mainMenu ?? null,
    skirmishMenu: clientState(last)?.skirmishMenu ?? null,
  }, null, 2)}`);
}

async function enginePointToCss(page, point) {
  return page.locator("#viewport").evaluate((canvas, enginePoint) => {
    const rect = canvas.getBoundingClientRect();
    const engineSize = window.CnCPort?.state?.engineDisplaySize;
    if (!engineSize?.width || !engineSize?.height) return null;
    const scale = Math.min(rect.width / engineSize.width, rect.height / engineSize.height);
    const contentWidth = engineSize.width * scale;
    const contentHeight = engineSize.height * scale;
    return {
      x: rect.left + (rect.width - contentWidth) / 2 + enginePoint.x * scale,
      y: rect.top + (rect.height - contentHeight) / 2 + enginePoint.y * scale,
    };
  }, point);
}

async function moveToEnginePoint(page, point, steps = 1) {
  const cssPoint = await enginePointToCss(page, point);
  expect(Number.isFinite(cssPoint?.x) && Number.isFinite(cssPoint?.y),
    "could not map engine coordinates to the canvas", { point, cssPoint });
  await page.mouse.move(cssPoint.x, cssPoint.y, { steps });
  return cssPoint;
}

function win32PointLParam(point) {
  return ((Math.trunc(point.y) & 0xffff) << 16) | (Math.trunc(point.x) & 0xffff);
}

async function postEngineMouseMessage(page, message, point) {
  const result = await rpc(page, "postMessage", {
    message,
    lParam: win32PointLParam(point),
    point,
  });
  expect(result?.ok === true, "real engine mouse message was not posted", result);
}

async function clickEngineButton(page, button, label) {
  expect(button?.clickable === true, `${label} is not clickable`, button);
  const point = { x: button.centerX, y: button.centerY };
  await moveToEnginePoint(page, point, 4);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await fullFrame(page);
}

async function screenshotDataUrl(page) {
  const result = await rpc(page, "screenshot");
  const dataUrl = typeof result?.screenshot === "string"
    ? result.screenshot
    : result?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    "screenshot RPC did not return a PNG", result);
  return dataUrl;
}

async function analyzeTerrainPixels(page, dataUrl) {
  return page.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Exclude the command bar, extreme viewport edges, and the top strip where
    // sky or letterboxing can legitimately be black on some camera pitches.
    const left = Math.floor(canvas.width * 0.08);
    const right = Math.ceil(canvas.width * 0.92);
    const top = Math.floor(canvas.height * 0.10);
    const bottom = Math.ceil(canvas.height * 0.68);
    const pixels = context.getImageData(left, top, right - left, bottom - top).data;
    let exactBlack = 0;
    let nearBlack = 0;
    let luminance = 0;
    let opaque = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (alpha === 0) continue;
      opaque += 1;
      if (red === 0 && green === 0 && blue === 0) exactBlack += 1;
      if (red <= 5 && green <= 5 && blue <= 5) nearBlack += 1;
      luminance += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      sampleRect: { left, top, right, bottom },
      samples: opaque,
      exactBlackFraction: opaque > 0 ? exactBlack / opaque : 1,
      nearBlackFraction: opaque > 0 ? nearBlack / opaque : 1,
      meanLuminance: opaque > 0 ? luminance / opaque : 0,
    };
  }, dataUrl);
}

async function capture(page, label) {
  const [frame, dataUrl, renderer] = await Promise.all([
    frameSummary(page),
    screenshotDataUrl(page),
    page.evaluate(() => window.CnCPort?.state?.threadedEngine?.graphics?.renderer ?? null),
  ]);
  const path = join(outputDir, `${label}.png`);
  await writeFile(path, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  const state = clientState(frame);
  const view = frame?.view ?? state?.view ?? null;
  return {
    label,
    path,
    pixels: await analyzeTerrainPixels(page, dataUrl),
    gameplay: state?.gameplay ? {
      logicFrame: state.gameplay.logicFrame,
      clientFrame: state.gameplay.clientFrame,
      loadingMap: state.gameplay.loadingMap,
      renderedObjectCount: state.gameplay.renderedObjectCount,
    } : null,
    view: view ? { size: view.size, terrainDrawArea: view.terrainDrawArea } : null,
    renderer,
  };
}

function blackTerrainTransition(before, after) {
  return before.pixels.nearBlackFraction >= after.pixels.nearBlackFraction + 0.20
    && before.pixels.meanLuminance <= after.pixels.meanLuminance * 0.55;
}

async function main() {
  expect(/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(distDir),
    "unsafe dist directory", distDir);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(profileDir, { recursive: true });

  const server = await startStaticServer({ root: wasmRoot, host: "127.0.0.1", port: 0 });
  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      "--autoplay-policy=no-user-gesture-required",
      ...(process.env.TERRAIN_STARTUP_BROWSER_ARGS ?? "").split(/\s+/).filter(Boolean),
    ],
  });
  let page = null;
  try {
    progress("browser started");
    page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    page.on("console", (message) => {
      const relayConnectionError = message.type() === "error"
        && message.text().startsWith("WebSocket connection to 'wss://");
      if (verbose || (message.type() === "error" && !relayConnectionError)) {
        process.stderr.write(`[terrain-startup] ${message.type()}: ${message.text()}\n`);
      }
    });

    const url = new URL(`harness/play.html?autostart=1&dist=${distDir}&shellmap=0&videos=0`,
      server.url);
    await page.goto(url.href, { waitUntil: "load" });
    progress("play harness loaded; waiting for engine boot");
    await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: bootTimeoutMs });
    progress("engine booted; revealing the main menu through original mouse messages");
    await postEngineMouseMessage(page, wmMouseMove, { x: 32, y: 32 });
    await fullFrame(page);
    await postEngineMouseMessage(page, wmMouseMove, { x: 96, y: 96 });
    let frame = await waitForFrame(page, "main menu", (candidate) =>
      clientState(candidate)?.mainMenu?.buttonSinglePlayer?.clickable === true,
    bootTimeoutMs, fullFrame);
    progress("opening Single Player");
    await clickEngineButton(page, clientState(frame).mainMenu.buttonSinglePlayer,
      "Single Player button");
    frame = await waitForFrame(page, "single-player menu", (candidate) =>
      clientState(candidate)?.mainMenu?.buttonSkirmish?.clickable === true,
    120_000, fullFrame);
    progress("opening Skirmish");
    await clickEngineButton(page, clientState(frame).mainMenu.buttonSkirmish,
      "Skirmish button");
    for (let retry = 0; retry < 3; retry += 1) {
      await page.waitForTimeout(2_000);
      frame = await fullFrame(page);
      if (clientState(frame)?.skirmishMenu?.buttonStart?.clickable === true) break;
      const retryButton = clientState(frame)?.mainMenu?.buttonSkirmish;
      if (retryButton?.clickable === true) {
        await clickEngineButton(page, retryButton, `Skirmish button retry ${retry + 1}`);
      }
    }
    frame = await waitForFrame(page, "skirmish options", (candidate) =>
      clientState(candidate)?.skirmishMenu?.buttonStart?.clickable === true,
    120_000, fullFrame);
    progress("starting the skirmish; pausing in-game pointer input");
    // This is the last pointer movement before the first gameplay capture.
    await clickEngineButton(page, clientState(frame).skirmishMenu.buttonStart,
      "Start button");
    await waitForFrame(page, "skirmish load", (candidate) => {
      const gameplay = clientState(candidate)?.gameplay;
      return candidate?.loadSessionActive === true || gameplay?.loadingMap === true
        || gameplay?.inGame === true;
    }, 120_000);
    progress("map load started");
    await waitForFrame(page, "active skirmish", (frame) => {
      const gameplay = clientState(frame)?.gameplay;
      return gameplay?.inGame === true && gameplay?.loadingMap === false
        && gameplay?.inputEnabled === true
        && Number(gameplay?.renderedObjectCount ?? 0) > 0;
    }, matchTimeoutMs);
    progress("gameplay is active; capturing without pointer movement");

    const resize = await rpc(page, "setEngineResolution", {
      width: resizedWidth,
      height: resizedHeight,
    });
    expect(resize?.ok === true, "post-load resolution change failed", resize);
    await waitForFrame(page, "post-load resolution", (candidate) =>
      candidate?.display?.width === resizedWidth
        && candidate?.display?.height === resizedHeight, 120_000);
    progress("post-load resolution applied without pointer movement");

    const initial = await capture(page, "initial-no-pointer");
    await page.waitForTimeout(1_000);
    const settled = await capture(page, "settled-no-pointer");
    progress("captured pre-pointer frames; sending the first gameplay pointer event");

    const viewport = await page.locator("#viewport").boundingBox();
    expect(viewport != null, "runtime viewport has no browser geometry");
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.waitForTimeout(500);
    const afterPointer = await capture(page, "after-first-pointer");

    const initialTransition = blackTerrainTransition(initial, afterPointer);
    const settledTransition = blackTerrainTransition(settled, afterPointer);
    const blackRegression = initialTransition || settledTransition;
    const redraw = resize.redraw ? {
      ranLogicRequested: resize.redraw.ranLogicRequested,
      initReturned: resize.redraw.initReturned,
      framesCompleted: resize.redraw.framesCompleted,
      logicFrame: resize.redraw.logicFrame,
      clientFrame: resize.redraw.clientFrame,
      exceptionCaught: resize.redraw.exceptionCaught,
    } : null;
    const report = {
      ok: expectBlackRegression ? blackRegression : !blackRegression,
      expected: expectBlackRegression ? "black-regression" : "visible-before-pointer",
      distDir,
      renderer: afterPointer.renderer,
      redraw,
      blackRegression,
      initialTransition,
      settledTransition,
      initial,
      settled,
      afterPointer,
    };
    await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);

    if (expectedRenderer) {
      expect(new RegExp(expectedRenderer, "i").test(report.renderer ?? ""),
        "engine worker did not use the expected renderer", report);
    }
    expect(redraw?.ranLogicRequested === false && redraw?.exceptionCaught === false,
      "post-resize redraw did not stay client-only", report);
    if (expectBlackRegression) {
      expect(blackRegression,
        "black terrain regression was not reproduced before the first pointer event", report);
    } else {
      expect(!initialTransition && !settledTransition,
        "terrain changed from black only after the first pointer event", report);
      expect(settled.pixels.nearBlackFraction < 0.35
          && settled.pixels.meanLuminance > 12,
        "terrain was still predominantly black before the first pointer event", report);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await page?.evaluate(() => window.ZeroHRuntime?.exit?.()).catch(() => null);
    await browser.close();
    await server.close();
    if (!keepProfile) {
      await rm(profileDir, { recursive: true, force: true });
    }
  }
}

await main();
