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
const mappedImageClipScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-mapped-image-clip-canvas.png",
);

const D3DPT_TRIANGLELIST = 4;
const runtimeArchivePath = "/assets/runtime-mapped-image-clip";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const englishArchiveMemfsPath = `${runtimeArchivePath}/EnglishZH.big`;
const mappedImageTextureEntry = "Data\\English\\Art\\Textures\\SCShellUserInterface512_001.tga";
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

function nearlyEqual(left, right, epsilon = 0.00001) {
  return Math.abs(left - right) < epsilon;
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
    source: "clipped mapped-image W3DDisplay drawImage smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before clipped mapped-image archive mount: ${JSON.stringify(bootResult)}`);
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
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 2
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || archiveMountResult.archiveSet?.sourceTotalBytes !== iniArchiveStat.size + englishArchiveStat.size
      || archiveMountResult.archiveSet?.totalBytes >= archiveMountResult.archiveSet?.sourceTotalBytes
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeIniArchive?.entryCount !== mappedImageIniEntries.length
      || rangeEnglishArchive?.path !== englishArchiveMemfsPath
      || rangeEnglishArchive?.entryCount !== 1
      || shellMappedImageEntry?.sourceOffset !== 4476120
      || shellMappedImageEntry?.bytes !== 22423
      || watermarkTextureEntry?.sourceOffset !== 51337360
      || watermarkTextureEntry?.bytes !== 1048620) {
    throw new Error(`range-backed clipped mapped-image archive subset mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let renderResult;
  try {
    renderResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dDisplayMappedImageClip", payload), {
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
      }),
      30000,
      "clipped mapped-image W3DDisplay drawImage",
    );
  } catch (error) {
    throw new Error(`clipped mapped-image W3DDisplay drawImage crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const expectedUv = renderResult.probe?.draw?.clip?.expectedRotatedUV ?? {};
  if (!renderResult.ok
      || renderResult.command !== "ww3dDisplayMappedImageClip"
      || renderResult.probe?.source !== "ww3d_display_mapped_image_clip_probe"
      || renderResult.probe?.archives?.ini !== iniArchiveMemfsPath
      || renderResult.probe?.archives?.texture !== englishArchiveMemfsPath
      || renderResult.probe?.results?.runtimeAssetSystemInstalled !== true
      || renderResult.probe?.results?.mappedIniExists !== true
      || renderResult.probe?.results?.textureFileExists !== true
      || renderResult.probe?.results?.mappedCollectionLoaded !== true
      || renderResult.probe?.results?.mappedImages < 1
      || renderResult.probe?.results?.mappedImageFound !== true
      || renderResult.probe?.results?.mappedImageRotated !== true
      || renderResult.probe?.results?.texturePreloaded !== true
      || renderResult.probe?.results?.textureResolved !== true
      || renderResult.probe?.results?.textureLoaded !== true
      || renderResult.probe?.results?.textureHasD3DSurface !== true
      || renderResult.probe?.results?.clipRegionSet !== true
      || renderResult.probe?.results?.clipEnabledBeforeDraw !== true
      || renderResult.probe?.results?.clipDisabledAfterDraw !== true
      || renderResult.probe?.image?.name !== "WatermarkChina"
      || renderResult.probe?.image?.filename !== "SCShellUserInterface512_001.tga"
      || renderResult.probe?.image?.status !== 1
      || renderResult.probe?.image?.rotated !== true
      || renderResult.probe?.texture?.archiveEntry !== mappedImageTextureEntry
      || renderResult.probe?.texture?.width !== 512
      || renderResult.probe?.texture?.height !== 512
      || renderResult.probe?.draw?.primitiveType !== D3DPT_TRIANGLELIST
      || renderResult.probe?.draw?.vertexCount !== 6
      || renderResult.probe?.draw?.primitiveCount !== 2
      || renderResult.probe?.draw?.screenRect?.left !== 320
      || renderResult.probe?.draw?.screenRect?.top !== 252
      || renderResult.probe?.draw?.screenRect?.right !== 480
      || renderResult.probe?.draw?.screenRect?.bottom !== 348
      || renderResult.probe?.draw?.clip?.enabled !== true
      || renderResult.probe?.draw?.clip?.rect?.left !== 360
      || renderResult.probe?.draw?.clip?.rect?.top !== 276
      || renderResult.probe?.draw?.clip?.rect?.right !== 440
      || renderResult.probe?.draw?.clip?.rect?.bottom !== 324
      || renderResult.probe?.draw?.clip?.width !== 80
      || renderResult.probe?.draw?.clip?.height !== 48
      || !nearlyEqual(expectedUv.left ?? 0, 415 / 512)
      || !nearlyEqual(expectedUv.top ?? 0, 41 / 512)
      || !nearlyEqual(expectedUv.right ?? 0, 463 / 512)
      || !nearlyEqual(expectedUv.bottom ?? 0, 121 / 512)
      || renderResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || renderResult.browserProbe?.usedPersistentBuffers !== true
      || renderResult.browserProbe?.usedTransforms !== true
      || renderResult.browserProbe?.usedIdentityClipSpace !== true
      || renderResult.browserProbe?.texture0?.id !== renderResult.probe?.texture?.id
      || renderResult.browserProbe?.texture0?.ready !== true
      || renderResult.browserProbe?.texture0?.sampled !== true
      || !pixelHasColor(renderResult.clipPixels?.center, 8)
      || pixelHasColor(renderResult.clipPixels?.outsideLeft, 8)
      || pixelHasColor(renderResult.clipPixels?.outsideTop, 8)
      || !pixelHasColor(renderResult.screenshot?.centerPixel, 8)
      || renderResult.textureDelta?.creates < 1
      || renderResult.textureDelta?.updates < renderResult.probe?.texture?.levels
      || renderResult.textureDelta?.binds < 1) {
    throw new Error(`clipped mapped-image W3DDisplay drawImage failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: mappedImageClipScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archiveSet: archiveMountResult.archiveSet,
    rangeEntries: {
      ini: {
        sourceArchive: iniArchivePath,
        archiveUrl: iniArchiveUrl,
        archiveEntry: shellMappedImageEntry.path,
        offset: shellMappedImageEntry.sourceOffset,
        bytes: shellMappedImageEntry.bytes,
      },
      texture: {
        sourceArchive: englishArchivePath,
        archiveUrl: englishArchiveUrl,
        archiveEntry: watermarkTextureEntry.path,
        offset: watermarkTextureEntry.sourceOffset,
        bytes: watermarkTextureEntry.bytes,
      },
    },
    screenshot: mappedImageClipScreenshot,
    clipPixels: renderResult.clipPixels,
    probe: renderResult.probe,
    browserProbe: renderResult.browserProbe,
    textureDelta: renderResult.textureDelta,
    reader: "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
    renderer: "Exact mapped-image INI block + W3DDisplay::setClipRegion + W3DDisplay::drawImage",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
