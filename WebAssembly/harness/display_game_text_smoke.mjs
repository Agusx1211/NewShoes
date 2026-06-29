import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultEnglishArchivePath = resolve(wasmRoot, "artifacts/real-assets/EnglishZH.big");
const englishArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultEnglishArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const gameTextScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-game-text-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-game-text";
const englishArchiveMemfsPath = `${runtimeArchivePath}/EnglishZH.big`;
const gameTextCsfEntry = "Data\\English\\Generals.csf";

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

assertArchivePath(englishArchivePath, "English archive");

await access(englishArchivePath);
const englishArchiveStat = await stat(englishArchivePath);
if (!englishArchiveStat.isFile() || englishArchiveStat.size <= 0) {
  throw new Error(`English archive is not a readable file: ${englishArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const englishArchiveRelativePath = relative(wasmRoot, englishArchivePath).split(sep).join("/");
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
  const englishArchiveUrl = new URL(englishArchiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "GameText-backed W3DDisplayString smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before GameText archive mount: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
      path: runtimeArchivePath,
      register: false,
      archives: [
        {
          url: englishArchiveUrl,
          name: "EnglishZH.big",
          expectedSourceBytes: englishArchiveStat.size,
          sourceArchive: englishArchivePath,
          entries: [
            gameTextCsfEntry,
          ],
        },
      ],
    });
  const rangeEnglishArchive = archiveMountResult.archiveSet?.archives?.[0];
  const gameTextCsf = rangeEnglishArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === gameTextCsfEntry.toLowerCase());
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 1
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || archiveMountResult.archiveSet?.sourceTotalBytes !== englishArchiveStat.size
      || archiveMountResult.archiveSet?.totalBytes >= archiveMountResult.archiveSet?.sourceTotalBytes
      || archiveMountResult.archiveSet?.probes?.length !== 0
      || rangeEnglishArchive?.path !== englishArchiveMemfsPath
      || rangeEnglishArchive?.storage !== "range-backed-subset-big"
      || rangeEnglishArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeEnglishArchive?.sourceBytes !== englishArchiveStat.size
      || rangeEnglishArchive?.entryCount !== 1
      || gameTextCsf?.bytes <= 0
      || gameTextCsf?.reader !== "browser fetch Range") {
    throw new Error(`range-backed GameText archive subset mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let renderResult;
  try {
    renderResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dDisplayGameText", payload), {
        englishArchivePath: englishArchiveMemfsPath,
      }),
      30000,
      "GameText-backed W3DDisplayString",
    );
  } catch (error) {
    throw new Error(`GameText-backed W3DDisplayString crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  if (!renderResult.ok
      || renderResult.command !== "ww3dDisplayGameText"
      || renderResult.probe?.source !== "ww3d_display_game_text_probe"
      || renderResult.probe?.archives?.english !== englishArchiveMemfsPath
      || renderResult.probe?.gameText?.csfPath !== gameTextCsfEntry
      || renderResult.probe?.gameText?.label !== "GUI:Command&ConquerGenerals"
      || renderResult.probe?.gameText?.labelExists !== true
      || renderResult.probe?.gameText?.nonEmpty !== true
      || typeof renderResult.probe?.gameText?.ascii !== "string"
      || renderResult.probe.gameText.ascii.length === 0
      || renderResult.probe?.results?.runtimeAssetSystemInstalled !== true
      || renderResult.probe?.results?.csfExists !== true
      || renderResult.probe?.results?.displayStringAllocated !== true
      || renderResult.probe?.results?.fontSet !== true
      || renderResult.probe?.results?.textSet !== true
      || renderResult.probe?.results?.drawCalled !== true
      || renderResult.probe?.runtimeAssets?.installed !== true
      || renderResult.probe?.runtimeAssets?.archiveLoaded !== true
      || renderResult.probe?.runtimeAssets?.w3dFileSystemInstalled !== true
      || renderResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || renderResult.browserProbe?.usedPersistentBuffers !== true
      || renderResult.browserProbe?.usedTransforms !== true
      || renderResult.browserProbe?.usedIdentityClipSpace !== true
      || renderResult.browserProbe?.texture0?.sampled !== true
      || renderResult.browserProbe?.texture0?.id !== renderResult.probe?.copyRects?.uploadedTextureId
      || renderResult.textRegion?.coloredPixelCount <= 16
      || renderResult.textureDelta?.creates < 1
      || renderResult.textureDelta?.updates < 1
      || renderResult.textureDelta?.binds < 1) {
    throw new Error(`GameText-backed W3DDisplayString failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: gameTextScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archiveSet: archiveMountResult.archiveSet,
    rangeEntry: {
      sourceArchive: englishArchivePath,
      archiveUrl: englishArchiveUrl,
      archiveEntry: gameTextCsf.path,
      offset: gameTextCsf.sourceOffset,
      bytes: gameTextCsf.bytes,
      indexedEntries: gameTextCsf.sourceIndexedEntries,
      directoryBytes: gameTextCsf.sourceDirectoryBytes,
    },
    screenshot: gameTextScreenshot,
    fetchedText: renderResult.probe.gameText.ascii,
    probe: renderResult.probe,
    browserProbe: renderResult.browserProbe,
    textureDelta: renderResult.textureDelta,
    reader: "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
    renderer: "GameText::fetch + W3DDisplayString::draw + browser D3D8/WebGL2 bridge",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
