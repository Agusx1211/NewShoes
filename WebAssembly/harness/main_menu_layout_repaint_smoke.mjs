#!/usr/bin/env node
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultWindowArchivePath = resolve(wasmRoot, "artifacts/real-assets/WindowZH.big");
const windowArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultWindowArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const repaintScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-repaint-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-main-menu-layout-repaint";
const windowArchiveMemfsPath = `${runtimeArchivePath}/WindowZH.big`;
const layoutEntry = "Window\\Menus\\MainMenu.wnd";

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function withTimeout(promise, milliseconds, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

function assertArchivePath(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
}

assertArchivePath(windowArchivePath, "Window archive");

await access(windowArchivePath);
const windowArchiveStat = await stat(windowArchivePath);
if (!windowArchiveStat.isFile() || windowArchiveStat.size <= 0) {
  throw new Error(`Window archive is not a readable file: ${windowArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const windowArchiveRelativePath = relative(wasmRoot, windowArchivePath).split(sep).join("/");
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
  const windowArchiveUrl = new URL(windowArchiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "W3D MainMenu WindowLayout repaint render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D MainMenu WindowLayout repaint: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountArchives", payload), {
      path: runtimeArchivePath,
      archives: [
        {
          url: windowArchiveUrl,
          name: "WindowZH.big",
          expectedBytes: windowArchiveStat.size,
        },
      ],
    });
  const mountedWindowArchive = archiveMountResult.archiveSet?.archives?.[0];
  const mountedWindowProbe = archiveMountResult.archiveSet?.probes?.[0];
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountArchives"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 1
      || mountedWindowArchive?.path !== windowArchiveMemfsPath
      || mountedWindowArchive?.bytes !== windowArchiveStat.size
      || mountedWindowArchive?.bytesMatch !== true
      || mountedWindowProbe?.ok !== true
      || mountedWindowProbe?.indexedFiles <= 0) {
    throw new Error(`WindowZH archive mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let repaintResult;
  try {
    repaintResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutRepaint", payload), {
        windowArchivePath: windowArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  if (!repaintResult.ok
      || repaintResult.command !== "ww3dMainMenuLayoutRepaint"
      || repaintResult.probe?.source !== "ww3d_main_menu_layout_repaint_probe"
      || !repaintResult.probe?.originalPaths?.includes("WindowLayout::load -> GameWindowManager::winCreateFromScript")
      || !repaintResult.probe?.originalPaths?.includes("GameWindowManager::winRepaint -> W3DGameWinDefaultDraw")
      || repaintResult.probe?.archive?.entry !== layoutEntry
      || repaintResult.probe?.layout?.path !== "Menus/MainMenu.wnd"
      || repaintResult.probe?.layout?.root?.name !== "MainMenu.wnd:MainMenuParent"
      || repaintResult.probe?.layout?.root?.systemFunc !== "MainMenuSystem"
      || repaintResult.probe?.layout?.root?.drawFunc !== "W3DNoDraw"
      || repaintResult.probe?.layout?.parent?.name !== "MainMenu.wnd:MapBorder4"
      || repaintResult.probe?.layout?.parent?.systemFunc !== "PassSelectedButtonsToParentSystem"
      || repaintResult.probe?.layout?.parent?.drawFunc !== "W3DGameWinDefaultDraw"
      || repaintResult.probe?.layout?.parent?.borderColor?.[2] !== 168
      || repaintResult.probe?.calls?.drawIndexed < 2
      || repaintResult.probe?.calls?.displayOpenRect < 1
      || repaintResult.probe?.calls?.displayFillRect < 1
      || repaintResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || repaintResult.browserProbe?.texture0?.sampled === true
      || repaintResult.layoutPixels?.parentBorderCorner?.[2] < 140
      || repaintResult.layoutPixels?.parentBorderTop?.[2] < 70
      || repaintResult.layoutPixels?.parentBorderLeft?.[2] < 70
      || repaintResult.layoutPixels?.parentInterior?.some((component, index) => index < 3 && component > 8)
      || repaintResult.layoutPixels?.outside?.some((component, index) => index < 3 && component > 8)) {
    throw new Error(`W3D MainMenu WindowLayout repaint render failed: ${JSON.stringify({
      ok: repaintResult.ok,
      probe: repaintResult.probe,
      browserProbe: repaintResult.browserProbe,
      layoutPixels: repaintResult.layoutPixels,
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
    throw new Error(`browser failures during W3D MainMenu WindowLayout repaint: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-main-menu-layout-repaint",
    url: harnessUrl,
    screenshot: repaintScreenshot,
    archive: {
      path: windowArchiveMemfsPath,
      entry: layoutEntry,
    },
    originalPaths: repaintResult.probe.originalPaths,
    layout: repaintResult.probe.layout,
    calls: repaintResult.probe.calls,
    draw: repaintResult.probe.draw,
    layoutPixels: repaintResult.layoutPixels,
    renderer: "WindowLayout::load MainMenu.wnd from WindowZH.big through GameWindowManager::winRepaint, W3DGameWinDefaultDraw, W3DDisplay, and browser D3D8/WebGL2 bridge",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
