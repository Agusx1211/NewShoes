// Verifies stock right-drag camera speed, the original Options scroll slider,
// and browser screen-edge scrolling through the shipping threaded runtime.

import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outputDir = resolve(process.env.CAMERA_SCROLL_OUTPUT_DIR
  ?? join(wasmRoot, "artifacts/screenshots/camera-scroll-runtime"));
const profileDir = resolve(process.env.CAMERA_SCROLL_PROFILE_DIR
  ?? join(wasmRoot, "artifacts/pw-profiles/camera-scroll-runtime"));
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const bootTimeoutMs = Number(process.env.BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const matchTimeoutMs = Number(process.env.MATCH_TIMEOUT_MS ?? 6 * 60 * 1000);
const distDir = process.env.CAMERA_SCROLL_DIST ?? "dist-threaded-release";
const expectedRenderer = process.env.CAMERA_SCROLL_EXPECT_RENDERER ?? "";
const verbose = process.env.VERBOSE === "1";

const resolutions = Object.freeze([
  { width: 800, height: 600 },
  { width: 1600, height: 1200 },
]);

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

async function waitForFrame(page, label, predicate, timeoutMs = 120000, readFrame = frameSummary) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readFrame(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out\n${JSON.stringify({
    shell: last?.clientState?.shell ?? null,
    mainMenu: last?.clientState?.mainMenu ?? null,
    skirmishMenu: last?.clientState?.skirmishMenu ?? null,
    quitMenu: last?.clientState?.quitMenu ?? null,
    gameplay: last?.gameplay ?? last?.clientState?.gameplay ?? null,
    view: last?.view ?? last?.clientState?.view ?? null,
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
    const contentLeft = rect.left + (rect.width - contentWidth) / 2;
    const contentTop = rect.top + (rect.height - contentHeight) / 2;
    return {
      x: contentLeft + enginePoint.x * scale,
      y: contentTop + enginePoint.y * scale,
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

async function clickEngineButton(page, button, label) {
  expect(button?.clickable === true, `${label} is not clickable`, button);
  await moveToEnginePoint(page, { x: button.centerX, y: button.centerY }, 4);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
}

async function clickWindowByName(page, name, label) {
  const result = await rpc(page, "clickWindowByName", { name });
  expect(result?.ok === true && result?.result?.clicked === true,
    `${label} did not traverse the real window input path`, result);
  return result.result;
}

async function waitForWindow(page, name, label, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    last = await rpc(page, "queryWindowByName", { name });
    if (last?.ok === true && last?.result?.clickable === true) return last.result;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out\n${JSON.stringify(last, null, 2)}`);
}

async function captureViewport(page, filename) {
  const result = await rpc(page, "screenshot");
  const dataUrl = typeof result?.screenshot === "string"
    ? result.screenshot
    : result?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    "screenshot RPC did not return a PNG", result);
  const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  expect(bytes.length > 10 * 1024, "runtime screenshot is unexpectedly small", {
    filename,
    bytes: bytes.length,
  });
  await writeFile(join(outputDir, filename), bytes);
  return bytes.length;
}

async function engineRenderer(page) {
  await page.waitForFunction(() =>
    Boolean(window.CnCPort?.state?.threadedEngine?.graphics?.renderer),
  null, { timeout: 30000, polling: 250 });
  return page.evaluate(() => window.CnCPort.state.threadedEngine.graphics.renderer);
}

function viewFromFrame(frame) {
  return frame?.view ?? frame?.clientState?.view ?? null;
}

function viewDistance(before, after) {
  return Math.hypot(
    Number(after?.position?.x ?? 0) - Number(before?.position?.x ?? 0),
    Number(after?.position?.y ?? 0) - Number(before?.position?.y ?? 0),
  );
}

async function applyResolution(page, resolution) {
  const result = await rpc(page, "setEngineResolution", resolution);
  expect(result?.ok === true, "engine resolution change failed", { resolution, result });
  await waitForFrame(page, `${resolution.width}x${resolution.height} display`,
    (candidate) => candidate?.display?.width === resolution.width
      && candidate?.display?.height === resolution.height);
}

async function resetCamera(page, baseline) {
  const result = await rpc(page, "agentCameraLookAt", {
    x: baseline.x,
    y: baseline.y,
  });
  expect(result?.ok === true, "could not reset the tactical camera", result);
  return viewFromFrame(await frameSummary(page, 2));
}

async function rightDragTrial(page, resolution, baseline, label) {
  await applyResolution(page, resolution);
  await resetCamera(page, baseline);
  const start = {
    x: Math.round(resolution.width * 0.45),
    y: Math.round(resolution.height * 0.45),
  };
  const end = {
    x: Math.round(resolution.width * 0.50),
    y: start.y,
  };
  await moveToEnginePoint(page, start, 4);
  const before = viewFromFrame(await frameSummary(page, 2));
  await page.mouse.down({ button: "right" });
  await moveToEnginePoint(page, end);
  await frameSummary(page, 6);
  await page.mouse.up({ button: "right" });
  const after = viewFromFrame(await frameSummary(page, 2));
  const distance = viewDistance(before, after);
  expect(distance > 1, `${label} did not move the camera`, { before, after, distance });
  return { label, resolution, start, end, before, after, distance };
}

async function setScrollSlider(page, value) {
  await page.keyboard.press("Escape");
  await waitForFrame(page, "quit menu", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true,
  120000, fullFrame);
  await clickWindowByName(page, "QuitMenu.wnd:ButtonOptions", "quit-menu Options button");
  await waitForWindow(page, "OptionsMenu.wnd:SliderScrollSpeed", "Options scroll slider");

  const snapshot = await rpc(page, "agentUiSnapshot");
  const slider = snapshot?.result?.windows?.find((window) =>
    window?.name === "OptionsMenu.wnd:SliderScrollSpeed");
  expect(slider?.kind === "horizontalSlider" && slider?.slider,
    "Options did not expose its original Scroll Speed slider", snapshot);
  expect(value >= slider.slider.min && value <= slider.slider.max,
    "requested scroll speed is outside the original slider range", { value, slider });
  const setValue = await rpc(page, "agentUiSetValue", {
    windowId: slider.id,
    name: slider.name,
    value,
  });
  expect(setValue?.ok === true && setValue?.result?.value === value,
    "original Scroll Speed slider rejected the new value", setValue);
  const screenshotBytes = await captureViewport(page, `options-scroll-speed-${value}.png`);
  await clickWindowByName(page, "OptionsMenu.wnd:ButtonAccept", "Options Accept button");
  await clickWindowByName(page, "QuitMenu.wnd:ButtonReturn", "quit-menu Return button");
  await waitForFrame(page, "resumed skirmish", (candidate) => {
    const gameplay = candidate?.gameplay ?? candidate?.clientState?.gameplay;
    return gameplay?.inGame === true && gameplay?.inputEnabled === true;
  });
  return { before: slider.slider.value, value, min: slider.slider.min,
    max: slider.slider.max, screenshotBytes };
}

async function edgeScrollTrial(page, resolution, baseline) {
  await applyResolution(page, resolution);
  await resetCamera(page, baseline);
  const before = viewFromFrame(await frameSummary(page, 2));
  await moveToEnginePoint(page, {
    x: resolution.width - 2,
    y: Math.round(resolution.height * 0.5),
  }, 4);
  await frameSummary(page, 8);
  const atEdge = viewFromFrame(await frameSummary(page, 1));
  const distance = viewDistance(before, atEdge);
  expect(distance > 1, "browser canvas edge did not scroll the tactical camera", {
    before,
    atEdge,
    distance,
  });

  await moveToEnginePoint(page, {
    x: Math.round(resolution.width * 0.5),
    y: Math.round(resolution.height * 0.5),
  }, 4);
  // DOM input is forwarded to the pthread asynchronously. Let the interior
  // mouse-position message reach the engine before measuring residual motion.
  await page.waitForTimeout(100);
  const settledInside = viewFromFrame(await frameSummary(page, 2));
  const stopped = viewFromFrame(await frameSummary(page, 6));
  const driftAfterLeavingEdge = viewDistance(settledInside, stopped);
  expect(driftAfterLeavingEdge < Math.max(1, distance * 0.15),
    "edge scrolling continued after the cursor returned to the canvas interior", {
      atEdge,
      settledInside,
      stopped,
      distance,
      driftAfterLeavingEdge,
    });
  return {
    resolution,
    before,
    atEdge,
    settledInside,
    stopped,
    distance,
    driftAfterLeavingEdge,
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  if (process.env.CAMERA_SCROLL_REUSE_PROFILE !== "1") {
    await rm(profileDir, { recursive: true, force: true });
  }
  await mkdir(profileDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, host: "127.0.0.1", port: 0 });
  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: true,
    viewport: { width: 1600, height: 1200 },
    args: [
      "--autoplay-policy=no-user-gesture-required",
      ...(process.env.CAMERA_SCROLL_BROWSER_ARGS ?? "").split(/\s+/).filter(Boolean),
    ],
  });
  const summary = { resolutions };
  let page = null;

  try {
    await browser.addInitScript(() => {
      localStorage.setItem("cncPortDisplaySettings.v2", JSON.stringify({
        mode: "fixed",
        width: 1600,
        height: 1200,
      }));
    });
    page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.on("console", (message) => {
      if (verbose) process.stderr.write(`[camera-scroll-runtime] ${message.type()}: ${message.text()}\n`);
    });
    const url = new URL(
      `harness/play.html?autostart=1&dist=${distDir}&shellmap=0`, server.url);
    await page.goto(url.href, { waitUntil: "load" });
    await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: bootTimeoutMs });
    summary.engineRenderer = await engineRenderer(page);
    if (expectedRenderer) {
      expect(new RegExp(expectedRenderer, "i").test(summary.engineRenderer),
        "engine worker did not use the expected renderer", {
          expectedRenderer,
          actualRenderer: summary.engineRenderer,
        });
    }

    await moveToEnginePoint(page, { x: 32, y: 32 });
    await page.waitForTimeout(250);
    await moveToEnginePoint(page, { x: 96, y: 96 });

    let frame = await waitForFrame(page, "main menu", (candidate) =>
      candidate?.clientState?.mainMenu?.buttonSinglePlayer?.clickable === true,
    120000, fullFrame);
    await clickEngineButton(page, frame.clientState.mainMenu.buttonSinglePlayer,
      "Single Player button");
    frame = await waitForFrame(page, "single-player menu", (candidate) =>
      candidate?.clientState?.mainMenu?.buttonSkirmish?.clickable === true,
    120000, fullFrame);
    await clickEngineButton(page, frame.clientState.mainMenu.buttonSkirmish,
      "Skirmish button");
    for (let retry = 0; retry < 3; ++retry) {
      await page.waitForTimeout(2000);
      frame = await fullFrame(page);
      if (frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true) break;
      const retryButton = frame?.clientState?.mainMenu?.buttonSkirmish;
      if (retryButton?.clickable === true) {
        await clickEngineButton(page, retryButton, `Skirmish button retry ${retry + 1}`);
      }
    }
    frame = await waitForFrame(page, "skirmish options", (candidate) =>
      candidate?.clientState?.skirmishMenu?.buttonStart?.clickable === true,
    120000, fullFrame);
    await clickEngineButton(page, frame.clientState.skirmishMenu.buttonStart,
      "Start button");
    frame = await waitForFrame(page, "active skirmish", (candidate) => {
      const gameplay = candidate?.gameplay ?? candidate?.clientState?.gameplay;
      return gameplay?.inGame === true && gameplay?.loadingMap === false
        && gameplay?.inputEnabled === true
        && Number(gameplay?.renderedObjectCount ?? 0) > 0;
    }, matchTimeoutMs);

    const initialView = viewFromFrame(frame);
    const baseline = { x: initialView.position.x, y: initialView.position.y };
    summary.baseline = baseline;
    summary.beforeScreenshotBytes = await captureViewport(page, "camera-scroll-before.png");
    summary.default800 = await rightDragTrial(page, resolutions[0], baseline, "default 800x600");
    summary.default1600 = await rightDragTrial(page, resolutions[1], baseline, "default 1600x1200");
    summary.resolutionDistanceRatio = summary.default1600.distance / summary.default800.distance;
    expect(summary.resolutionDistanceRatio >= 0.75 && summary.resolutionDistanceRatio <= 1.25,
      "right-drag speed changed with render resolution", summary);

    summary.slider = await setScrollSlider(page, 25);
    summary.sensitive1600 = await rightDragTrial(
      page, resolutions[1], baseline, "25 percent 1600x1200");
    summary.sensitivityDistanceRatio =
      summary.sensitive1600.distance / summary.default1600.distance;
    expect(summary.sensitivityDistanceRatio >= 0.35 && summary.sensitivityDistanceRatio <= 0.65,
      "Scroll Speed slider did not scale right-drag sensitivity", summary);

    summary.edge = await edgeScrollTrial(page, resolutions[1], baseline);
    summary.afterScreenshotBytes = await captureViewport(page, "camera-scroll-after-edge.png");
    await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    if (page) await page.evaluate(() => window.ZeroHRuntime?.exit?.()).catch(() => null);
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
