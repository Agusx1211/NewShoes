// Verifies the launcher camera-zoom setting through the shipping threaded page:
// persisted setting -> real GameEngine init -> original skirmish menu/input path
// -> tactical camera zoom above the retail 310-unit limit.

import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";
import { CAMERA_ZOOM_SETTINGS_KEY } from "./camera-zoom-config.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outputDir = resolve(process.env.CAMERA_ZOOM_OUTPUT_DIR
  ?? join(wasmRoot, "artifacts/screenshots/camera-zoom-runtime"));
const profileDir = resolve(process.env.CAMERA_ZOOM_PROFILE_DIR
  ?? join(wasmRoot, "artifacts/pw-profiles/camera-zoom-runtime"));
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const bootTimeoutMs = Number(process.env.BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const matchTimeoutMs = Number(process.env.MATCH_TIMEOUT_MS ?? 6 * 60 * 1000);
const verbose = process.env.VERBOSE === "1";

function expect(condition, message, detail = null) {
  if (!condition) {
    throw new Error(`${message}${detail == null ? "" : `\n${JSON.stringify(detail, null, 2)}`}`);
  }
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function frameSummary(page) {
  const result = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  expect(result?.ok === true && result?.aborted === false,
    "real engine frame summary failed", result);
  return result.frame;
}

async function waitForFrame(page, label, predicate, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await frameSummary(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out\n${JSON.stringify(last, null, 2)}`);
}

async function enginePointToCss(page, point) {
  return page.locator("#viewport").evaluate((canvas, enginePoint) => {
    const rect = canvas.getBoundingClientRect();
    const engineSize = window.CnCPort?.state?.engineDisplaySize;
    if (!engineSize?.width || !engineSize?.height) return null;
    return {
      x: rect.left + enginePoint.x * rect.width / engineSize.width,
      y: rect.top + enginePoint.y * rect.height / engineSize.height,
    };
  }, point);
}

async function moveToEnginePoint(page, point) {
  const cssPoint = await enginePointToCss(page, point);
  expect(Number.isFinite(cssPoint?.x) && Number.isFinite(cssPoint?.y),
    "could not map engine input coordinates to the canvas", { point, cssPoint });
  await page.mouse.move(cssPoint.x, cssPoint.y, { steps: 4 });
  return cssPoint;
}

async function clickEngineButton(page, button, label) {
  expect(button?.clickable === true, `${label} is not clickable`, button);
  const point = { x: button.centerX, y: button.centerY };
  const cssPoint = await moveToEnginePoint(page, point);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  return { point, cssPoint };
}

async function captureViewport(page, path) {
  const shot = await rpc(page, "screenshot");
  const dataUrl = typeof shot?.screenshot === "string"
    ? shot.screenshot
    : shot?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    "screenshot RPC did not return a PNG", shot);
  const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  expect(bytes.length > 10 * 1024, "runtime screenshot is unexpectedly small", { bytes: bytes.length });
  await writeFile(path, bytes);
  return bytes.length;
}

async function gpuRenderer(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return null;
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, host: "127.0.0.1", port: 0 });
  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      "--autoplay-policy=no-user-gesture-required",
      ...(process.env.CAMERA_ZOOM_BROWSER_ARGS ?? "")
        .split(/\s+/)
        .filter(Boolean),
    ],
  });
  const summary = { setting: 500 };
  let page = null;

  try {
    await browser.addInitScript(([key, value]) => {
      localStorage.setItem(key, JSON.stringify({ maxCameraHeight: value }));
    }, [CAMERA_ZOOM_SETTINGS_KEY, summary.setting]);

    page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.on("console", (message) => {
      if (verbose) process.stderr.write(`[camera-zoom-runtime] ${message.type()}: ${message.text()}\n`);
    });
    const url = new URL("harness/play.html?autostart=1&dist=dist-threaded-release", server.url);
    await page.goto(url.href, { waitUntil: "load" });
    await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: bootTimeoutMs });

    const state = await rpc(page, "state");
    summary.frontier = state?.state?.realEngineInit?.frontier ?? null;
    summary.gpu = await gpuRenderer(page);
    expect(summary.frontier?.initReturned === true, "real threaded engine did not initialize", summary.frontier);
    expect(summary.frontier?.maxCameraHeight === 500,
      "launcher camera setting did not reach GlobalData before engine initialization", summary.frontier);

    let frame = await waitForFrame(page, "main menu", (candidate) =>
      candidate?.clientState?.mainMenu?.buttonSinglePlayer?.clickable === true);
    summary.singlePlayerClick = await clickEngineButton(
      page, frame.clientState.mainMenu.buttonSinglePlayer, "Single Player button");

    frame = await waitForFrame(page, "single-player menu", (candidate) =>
      candidate?.clientState?.mainMenu?.buttonSkirmish?.clickable === true);
    summary.skirmishClick = await clickEngineButton(
      page, frame.clientState.mainMenu.buttonSkirmish, "Skirmish button");

    frame = await waitForFrame(page, "skirmish options", (candidate) =>
      candidate?.clientState?.skirmishMenu?.buttonStart?.clickable === true);
    summary.startClick = await clickEngineButton(
      page, frame.clientState.skirmishMenu.buttonStart, "Start button");

    frame = await waitForFrame(page, "active skirmish", (candidate) => {
      const gameplay = candidate?.gameplay ?? candidate?.clientState?.gameplay;
      return gameplay?.inGame === true
        && gameplay?.loadingMap === false
        && gameplay?.inputEnabled === true
        && Number(gameplay?.renderedObjectCount ?? 0) > 0;
    }, matchTimeoutMs);
    summary.activeGameplay = frame.gameplay ?? frame.clientState?.gameplay ?? null;
    summary.beforeZoom = frame.view ?? frame.clientState?.view ?? null;
    summary.beforeScreenshotBytes = await captureViewport(
      page, join(outputDir, "camera-zoom-before.png"));

    const viewportBox = await page.locator("#viewport").boundingBox();
    expect(viewportBox != null, "runtime viewport has no browser geometry");
    await page.mouse.move(
      viewportBox.x + viewportBox.width / 2,
      viewportBox.y + viewportBox.height / 2,
    );
    for (let step = 0; step < 40; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(40);
    }

    frame = await waitForFrame(page, "camera zoom to configured limit", (candidate) => {
      const view = candidate?.view ?? candidate?.clientState?.view;
      return Number(view?.heightAboveGround ?? 0) >= 499
        && Number(view?.currentHeightAboveGround ?? 0) > 450;
    }, 30000);
    summary.afterZoom = frame.view ?? frame.clientState?.view ?? null;
    expect(summary.afterZoom.currentHeightAboveGround <= 505,
      "camera exceeded the configured 500-unit upper bound", summary.afterZoom);
    summary.afterScreenshotBytes = await captureViewport(
      page, join(outputDir, "camera-zoom-500.png"));

    await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    if (page) {
      await page.evaluate(() => window.ZeroHRuntime?.exit?.()).catch(() => null);
    }
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
