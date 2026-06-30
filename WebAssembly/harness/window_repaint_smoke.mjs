#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const repaintScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-window-repaint-canvas.png",
);

await mkdir(screenshotDir, { recursive: true });

const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "W3D window repaint render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D window repaint: ${JSON.stringify(bootResult)}`);
  }

  const repaintResult = await page.evaluate(() => window.CnCPort.rpc("ww3dWindowRepaint"));
  if (!repaintResult.ok
      || repaintResult.command !== "ww3dWindowRepaint"
      || repaintResult.probe?.source !== "ww3d_window_repaint_probe"
      || !repaintResult.probe?.originalPaths?.includes("W3DGameWindowManager::gogoGadgetPushButton")
      || !repaintResult.probe?.originalPaths?.includes("GameWindowManager::winRepaint -> W3DGadgetPushButtonDraw")
      || !repaintResult.probe?.originalPaths?.includes("GameWindowManager::winOpenRect/winFillRect -> TheDisplay virtual dispatch")
      || !repaintResult.probe?.originalPaths?.includes("ProbeForwardingW3DDisplay -> W3DDisplay::drawOpenRect/drawFillRect")
      || repaintResult.probe?.window?.manager !== "W3DGameWindowManager"
      || repaintResult.probe?.window?.button?.drawFunc !== "W3DGadgetPushButtonDraw"
      || repaintResult.probe?.window?.button?.inputFunc !== "GadgetPushButtonInput"
      || repaintResult.probe?.calls?.drawIndexed < 2
      || repaintResult.probe?.calls?.displayOpenRect < 1
      || repaintResult.probe?.calls?.displayFillRect < 1
      || repaintResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || repaintResult.browserProbe?.texture0?.sampled === true
      || repaintResult.repaintPixels?.center?.[1] < 160
      || repaintResult.repaintPixels?.outside?.some((component, index) => index < 3 && component > 8)) {
    throw new Error(`W3D window repaint render failed: ${JSON.stringify({
      ok: repaintResult.ok,
      probe: repaintResult.probe,
      browserProbe: repaintResult.browserProbe,
      repaintPixels: repaintResult.repaintPixels,
      screenshot: {
        width: repaintResult.screenshot?.width,
        height: repaintResult.screenshot?.height,
        centerPixel: repaintResult.screenshot?.centerPixel,
      },
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: repaintScreenshot });

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during W3D window repaint: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-window-repaint",
    url: harnessUrl,
    screenshot: repaintScreenshot,
    originalPaths: repaintResult.probe.originalPaths,
    window: repaintResult.probe.window,
    calls: repaintResult.probe.calls,
    draw: repaintResult.probe.draw,
    repaintPixels: repaintResult.repaintPixels,
    renderer: "W3DGameWindowManager winRepaint through Display adapter, W3DDisplay, and browser D3D8/WebGL2 bridge",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
