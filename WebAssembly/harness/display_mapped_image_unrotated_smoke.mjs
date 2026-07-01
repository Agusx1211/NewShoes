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
const mappedImageScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-mapped-image-unrotated-canvas.png",
);

const D3DPT_TRIANGLELIST = 4;
const D3DBLEND_SRCALPHA = 5;
const D3DBLEND_INVSRCALPHA = 6;
const D3DTOP_DISABLE = 1;
const D3DTOP_MODULATE = 4;
const D3DTA_DIFFUSE = 0;
const D3DTA_TEXTURE = 2;
const runtimeArchivePath = "/assets/runtime-mapped-image-unrotated";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const englishArchiveMemfsPath = `${runtimeArchivePath}/EnglishZH.big`;
const mappedImageTextureEntry = "Data\\English\\Art\\Textures\\SAUserInterface512_001.tga";
const mappedImageSampleIniEntry =
  "Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI";
const mappedImageIniEntries = [
  "Data\\INI\\MappedImages\\HandCreated\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\HandCreatedMappedImages.INI",
  mappedImageSampleIniEntry,
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGameUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeLoad512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeSelect512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeWinLoss512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCLogosUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCPurchasePowers512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCShellUserInterface512.INI",
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
    source: "non-rotated mapped-image W3DDisplay drawImage smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before non-rotated mapped-image archive mount: ${JSON.stringify(bootResult)}`);
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
  const saChinookIniEntry = rangeIniArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === mappedImageSampleIniEntry.toLowerCase());
  const saChinookTextureEntry = rangeEnglishArchive?.entries?.find((entry) =>
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
      || archiveMountResult.archiveSet?.probes?.length !== 0
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeIniArchive?.storage !== "range-backed-subset-big"
      || rangeIniArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeIniArchive?.sourceBytes !== iniArchiveStat.size
      || rangeIniArchive?.entryCount !== mappedImageIniEntries.length
      || rangeEnglishArchive?.path !== englishArchiveMemfsPath
      || rangeEnglishArchive?.storage !== "range-backed-subset-big"
      || rangeEnglishArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeEnglishArchive?.sourceBytes !== englishArchiveStat.size
      || rangeEnglishArchive?.entryCount !== 1
      || saChinookIniEntry?.sourceOffset !== 4387556
      || saChinookIniEntry?.bytes !== 31939
      || saChinookIniEntry?.reader !== "browser fetch Range"
      || saChinookTextureEntry?.sourceOffset !== 13587040
      || saChinookTextureEntry?.bytes !== 1048620
      || saChinookTextureEntry?.reader !== "browser fetch Range") {
    throw new Error(`range-backed non-rotated mapped-image archive subset mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let renderResult;
  try {
    renderResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dDisplayMappedImageUnrotated", payload), {
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
      }),
      30000,
      "non-rotated mapped-image W3DDisplay drawImage",
    );
  } catch (error) {
    throw new Error(`non-rotated mapped-image W3DDisplay drawImage crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const stage0 = renderResult.probe?.draw?.renderState?.textureStages?.[0];
  const stage1 = renderResult.probe?.draw?.renderState?.textureStages?.[1];
  if (!renderResult.ok
      || renderResult.command !== "ww3dDisplayMappedImageUnrotated"
      || renderResult.probe?.source !== "ww3d_display_mapped_image_unrotated_probe"
      || renderResult.probe?.archives?.ini !== iniArchiveMemfsPath
      || renderResult.probe?.archives?.texture !== englishArchiveMemfsPath
      || renderResult.probe?.results?.runtimeAssetSystemInstalled !== true
      || renderResult.probe?.results?.mappedIniExists !== true
      || renderResult.probe?.results?.textureArchiveLoaded !== true
      || renderResult.probe?.results?.textureFileExists !== true
      || renderResult.probe?.results?.textureFileFactoryInstalled !== true
      || renderResult.probe?.results?.mappedCollectionAllocated !== true
      || renderResult.probe?.results?.mappedCollectionLoaded !== true
      || renderResult.probe?.results?.mappedImages !== 1186
      || renderResult.probe?.results?.mappedImageFound !== true
      || renderResult.probe?.results?.mappedImageRotated !== false
      || renderResult.probe?.results?.texturePreloaded !== true
      || renderResult.probe?.results?.textureRegistered !== true
      || renderResult.probe?.results?.textureResolved !== true
      || renderResult.probe?.results?.textureLoaded !== true
      || renderResult.probe?.results?.textureHasD3DSurface !== true
      || renderResult.probe?.results?.textureLevelDesc !== 0
      || renderResult.probe?.results?.displayAllocated !== true
      || renderResult.probe?.results?.displaySetup !== true
      || renderResult.probe?.results?.drawImageCalled !== true
      || String(renderResult.probe?.texture?.name ?? "").toLowerCase() !==
        "sauserinterface512_001.tga"
      || renderResult.probe?.texture?.archiveEntry !== mappedImageTextureEntry
      || renderResult.probe?.texture?.width !== 512
      || renderResult.probe?.texture?.height !== 512
      || renderResult.probe?.texture?.levels <= 0
      || renderResult.probe?.texture?.uploadedLevels !== renderResult.probe?.texture?.levels
      || renderResult.probe?.texture?.source !== "Original ImageCollection::load(512) / INI::loadDirectory non-rotated path via W3DDisplay::drawImage, WW3DAssetManager, TextureClass::Init, and runtime W3DFileSystem BIG archives"
      || renderResult.probe?.runtimeAssets?.installed !== true
      || renderResult.probe?.runtimeAssets?.archiveLoaded !== true
      || renderResult.probe?.runtimeAssets?.w3dFileSystemInstalled !== true
      || renderResult.probe?.image?.name !== "SAChinook_L"
      || renderResult.probe?.image?.filename !== "SAUserInterface512_001.tga"
      || renderResult.probe?.image?.rawTexture !== false
      || renderResult.probe?.image?.status !== 0
      || renderResult.probe?.image?.rotated !== false
      || renderResult.probe?.image?.textureWidth !== 512
      || renderResult.probe?.image?.textureHeight !== 512
      || !nearlyEqual(renderResult.probe?.image?.uvLoX ?? 0, 367 / 512)
      || !nearlyEqual(renderResult.probe?.image?.uvLoY ?? 0, 393 / 512)
      || !nearlyEqual(renderResult.probe?.image?.uvHiX ?? 0, 487 / 512)
      || !nearlyEqual(renderResult.probe?.image?.uvHiY ?? 0, 489 / 512)
      || renderResult.probe?.image?.width !== 120
      || renderResult.probe?.image?.height !== 96
      || renderResult.probe?.draw?.screenRect?.left !== 340
      || renderResult.probe?.draw?.screenRect?.top !== 252
      || renderResult.probe?.draw?.screenRect?.right !== 460
      || renderResult.probe?.draw?.screenRect?.bottom !== 348
      || renderResult.probe?.draw?.primitiveType !== D3DPT_TRIANGLELIST
      || renderResult.probe?.draw?.vertexCount !== 4
      || renderResult.probe?.draw?.primitiveCount !== 2
      || renderResult.probe?.draw?.vertexStride !== 44
      || renderResult.probe?.draw?.vertexBufferId === 0
      || renderResult.probe?.draw?.indexBufferId === 0
      || (renderResult.probe?.draw?.transformMask & 7) !== 7
      || renderResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || renderResult.probe?.draw?.renderState?.srcBlend !== D3DBLEND_SRCALPHA
      || renderResult.probe?.draw?.renderState?.destBlend !== D3DBLEND_INVSRCALPHA
      || stage0?.colorOp !== D3DTOP_MODULATE
      || stage0?.colorArg1 !== D3DTA_TEXTURE
      || stage0?.colorArg2 !== D3DTA_DIFFUSE
      || stage1?.colorOp !== D3DTOP_DISABLE
      || renderResult.probe?.calls?.drawIndexed < 1
      || renderResult.probe?.calls?.browserTextureCreate < 1
      || renderResult.probe?.calls?.browserTextureUpdate < renderResult.probe?.texture?.levels
      || renderResult.probe?.calls?.browserTextureBind < 1
      || renderResult.probe?.calls?.browserBufferCreate < 2
      || renderResult.probe?.calls?.browserBufferUpdate < 2
      || renderResult.probe?.calls?.setTexture < 1
      || renderResult.probe?.calls?.setTransform < 3
      || renderResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || renderResult.browserProbe?.usedPersistentBuffers !== true
      || renderResult.browserProbe?.usedTransforms !== true
      || renderResult.browserProbe?.usedIdentityClipSpace !== true
      || renderResult.browserProbe?.primitiveType !== D3DPT_TRIANGLELIST
      || renderResult.browserProbe?.texture0?.id !== renderResult.probe?.texture?.id
      || renderResult.browserProbe?.texture0?.ready !== true
      || renderResult.browserProbe?.texture0?.sampled !== true
      || renderResult.browserProbe?.texture0?.format !== renderResult.probe?.texture?.format
      || renderResult.browserProbe?.texture0?.storage !== "rgba8"
      || renderResult.browserProbe?.texture0?.combiner?.supported !== true
      || renderResult.browserProbe?.texture0?.combiner?.colorOp !== D3DTOP_MODULATE
      || renderResult.browserProbe?.texture0?.sampler?.supported !== true
      || renderResult.browserProbe?.renderState?.textureStages?.[0]?.colorOp !== D3DTOP_MODULATE
      || renderResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg1 !== D3DTA_TEXTURE
      || renderResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg2 !== D3DTA_DIFFUSE
      || renderResult.browserProbe?.renderState?.textureStages?.[1]?.colorOp !== D3DTOP_DISABLE
      || !pixelHasColor(renderResult.browserProbe?.centerPixel, 8)
      || !pixelHasColor(renderResult.screenshot?.centerPixel, 8)
      || renderResult.textureDelta?.creates < 1
      || renderResult.textureDelta?.updates < renderResult.probe?.texture?.levels
      || renderResult.textureDelta?.binds < 1) {
    throw new Error(`non-rotated mapped-image W3DDisplay drawImage failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: mappedImageScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archiveSet: archiveMountResult.archiveSet,
    screenshot: mappedImageScreenshot,
    probe: renderResult.probe,
    browserProbe: renderResult.browserProbe,
    textureDelta: renderResult.textureDelta,
    reader: "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
    renderer: "ImageCollection::load(512) + W3DDisplay::drawImage non-rotated + browser D3D8/WebGL2 bridge",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
