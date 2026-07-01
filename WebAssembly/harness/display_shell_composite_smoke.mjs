#!/usr/bin/env node
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultIniArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const defaultEnglishArchivePath = resolve(wasmRoot, "artifacts/real-assets/EnglishZH.big");
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const englishArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultEnglishArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const compositeScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-shell-composite-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-shell-composite";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const englishArchiveMemfsPath = `${runtimeArchivePath}/EnglishZH.big`;
const mappedImageTextureEntry = "Data\\English\\Art\\Textures\\SCShellUserInterface512_001.tga";
const gameTextCsfEntry = "Data\\English\\Generals.csf";
const mappedImageSampleIniEntry =
  "Data\\INI\\MappedImages\\TextureSize_512\\SCShellUserInterface512.INI";
const mappedImageIniEntries = [
  "Data\\INI\\MappedImages\\HandCreated\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGameUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeLoad512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeSelect512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeWinLoss512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCLogosUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCPurchasePowers512.INI",
  mappedImageSampleIniEntry,
  "Data\\INI\\MappedImages\\TextureSize_512\\SCSmShellUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SNUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SSUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SUUserInterface512.INI",
];

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function pixelHasColor(pixel, threshold = 8) {
  return Array.isArray(pixel)
    && pixel[3] >= 200
    && pixel.slice(0, 3).some((component) => component > threshold);
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

function compactDraw(draw) {
  return {
    primitiveType: draw?.primitiveType,
    vertexCount: draw?.vertexCount,
    primitiveCount: draw?.primitiveCount,
    vertexStride: draw?.vertexStride,
    screenRect: draw?.screenRect,
  };
}

assertArchivePath(iniArchivePath, "INI archive");
assertArchivePath(englishArchivePath, "English archive");

await access(iniArchivePath);
await access(englishArchivePath);
const iniArchiveStat = await stat(iniArchivePath);
const englishArchiveStat = await stat(englishArchivePath);
if (!iniArchiveStat.isFile() || iniArchiveStat.size <= 0) {
  throw new Error(`INI archive is not a readable file: ${iniArchivePath}`);
}
if (!englishArchiveStat.isFile() || englishArchiveStat.size <= 0) {
  throw new Error(`English archive is not a readable file: ${englishArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
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
  const iniArchiveUrl = new URL(iniArchiveRelativePath, server.url).href;
  const englishArchiveUrl = new URL(englishArchiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "W3DDisplay shell composite render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before shell composite archive mount: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
      path: runtimeArchivePath,
      register: false,
      archives: [
        {
          url: iniArchiveUrl,
          name: "INIZH.big",
          expectedSourceBytes: iniArchiveStat.size,
          sourceArchive: iniArchivePath,
          entries: mappedImageIniEntries,
        },
        {
          url: englishArchiveUrl,
          name: "EnglishZH.big",
          expectedSourceBytes: englishArchiveStat.size,
          sourceArchive: englishArchivePath,
          entries: [
            mappedImageTextureEntry,
            gameTextCsfEntry,
          ],
        },
      ],
    });
  const rangeIniArchive = archiveMountResult.archiveSet?.archives?.[0];
  const rangeEnglishArchive = archiveMountResult.archiveSet?.archives?.[1];
  const shellMappedImageEntry = rangeIniArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === mappedImageSampleIniEntry.toLowerCase());
  const watermarkTextureEntry = rangeEnglishArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === mappedImageTextureEntry.toLowerCase());
  const gameTextCsf = rangeEnglishArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === gameTextCsfEntry.toLowerCase());
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 2
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeIniArchive?.entryCount !== mappedImageIniEntries.length
      || rangeEnglishArchive?.path !== englishArchiveMemfsPath
      || rangeEnglishArchive?.entryCount !== 2
      || shellMappedImageEntry?.bytes !== 22423
      || watermarkTextureEntry?.sourceOffset !== 51337360
      || watermarkTextureEntry?.bytes !== 1048620
      || gameTextCsf?.bytes <= 0) {
    throw new Error(`range-backed shell composite archive subset mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let renderResult;
  try {
    renderResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dDisplayShellComposite", payload), {
        iniArchivePath: iniArchiveMemfsPath,
        englishArchivePath: englishArchiveMemfsPath,
      }),
      45000,
      "W3DDisplay shell composite render",
    );
  } catch (error) {
    throw new Error(`W3DDisplay shell composite render crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  if (!renderResult.ok
      || renderResult.command !== "ww3dDisplayShellComposite"
      || renderResult.source !== "ww3d_display_shell_composite"
      || renderResult.checks?.sceneOk !== true
      || renderResult.checks?.mappedOk !== true
      || renderResult.checks?.textOk !== true
      || !renderResult.originalPaths?.includes("W3DDisplay::m_3DScene -> WW3D::Render")
      || !renderResult.originalPaths?.includes("ImageCollection::load(512) -> INI::loadDirectory -> W3DDisplay::drawImage")
      || !renderResult.originalPaths?.includes("GameText::fetch -> W3DDisplayString::draw")
      || renderResult.scene?.probe?.source !== "ww3d_display_scene_probe"
      || renderResult.scene?.probe?.scene?.type !== "RTS3DScene"
      || renderResult.scene?.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || !pixelHasColor(renderResult.scene?.centerPixel)
      || renderResult.mappedImage?.probe?.source !== "ww3d_display_mapped_image_probe"
      || renderResult.mappedImage?.probe?.results?.mappedImages !== 1186
      || renderResult.mappedImage?.probe?.image?.name !== "WatermarkChina"
      || renderResult.mappedImage?.browserProbe?.texture0?.sampled !== true
      || !pixelHasColor(renderResult.mappedImage?.centerPixel, 8)
      || renderResult.gameText?.probe?.source !== "ww3d_display_game_text_probe"
      || renderResult.gameText?.probe?.gameText?.label !== "GUI:Command&ConquerGenerals"
      || renderResult.gameText?.probe?.results?.drawCalled !== true
      || renderResult.gameText?.browserProbe?.texture0?.sampled !== true
      || renderResult.gameText?.textRegion?.coloredPixelCount <= 16
      || renderResult.textureDelta?.creates < 2
      || renderResult.textureDelta?.updates < 2
      || renderResult.textureDelta?.binds < 2
      || !pixelHasColor(renderResult.screenshot?.centerPixel, 8)) {
    throw new Error(`W3DDisplay shell composite render failed: ${JSON.stringify({
      ok: renderResult.ok,
      checks: renderResult.checks,
      scene: renderResult.scene?.probe,
      mappedImage: renderResult.mappedImage?.probe,
      gameText: renderResult.gameText?.probe,
      textureDelta: renderResult.textureDelta,
      screenshot: {
        width: renderResult.screenshot?.width,
        height: renderResult.screenshot?.height,
        centerPixel: renderResult.screenshot?.centerPixel,
      },
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: compositeScreenshot });

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during shell composite render: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-display-shell-composite",
    url: harnessUrl,
    archiveSet: archiveMountResult.archiveSet,
    rangeEntries: {
      mappedImageIni: {
        sourceArchive: iniArchivePath,
        archiveEntry: shellMappedImageEntry.path,
        offset: shellMappedImageEntry.sourceOffset,
        bytes: shellMappedImageEntry.bytes,
      },
      texture: {
        sourceArchive: englishArchivePath,
        archiveEntry: watermarkTextureEntry.path,
        offset: watermarkTextureEntry.sourceOffset,
        bytes: watermarkTextureEntry.bytes,
      },
      gameText: {
        sourceArchive: englishArchivePath,
        archiveEntry: gameTextCsf.path,
        offset: gameTextCsf.sourceOffset,
        bytes: gameTextCsf.bytes,
      },
    },
    screenshot: compositeScreenshot,
    originalPaths: renderResult.originalPaths,
    checks: renderResult.checks,
    scene: {
      source: renderResult.scene.probe.source,
      path: renderResult.scene.probe.scene.path,
      centerPixel: renderResult.scene.centerPixel,
      draw: compactDraw(renderResult.scene.probe.draw),
    },
    mappedImage: {
      source: renderResult.mappedImage.probe.source,
      image: renderResult.mappedImage.probe.image,
      center: renderResult.mappedImage.center,
      centerPixel: renderResult.mappedImage.centerPixel,
      draw: compactDraw(renderResult.mappedImage.probe.draw),
    },
    gameText: {
      source: renderResult.gameText.probe.source,
      label: renderResult.gameText.probe.gameText.label,
      text: renderResult.gameText.probe.gameText.ascii,
      textRegion: renderResult.gameText.textRegion,
    },
    textureDelta: renderResult.textureDelta,
    reader: "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
    renderer: "W3DDisplay scene + mapped Image + GameText DisplayString through browser D3D8/WebGL2 bridge",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
