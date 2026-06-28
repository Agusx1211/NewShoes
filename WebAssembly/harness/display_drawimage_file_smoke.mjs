import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const textureArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultTextureArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const drawImageFileScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-drawimage-file-canvas.png",
);
const D3DFMT_DXT1 = 0x31545844;
const D3DFMT_DXT3 = 0x33545844;
const D3DFMT_DXT5 = 0x35545844;
const D3DPT_TRIANGLELIST = 4;
const D3DBLEND_SRCALPHA = 5;
const D3DBLEND_INVSRCALPHA = 6;
const D3DTOP_DISABLE = 1;
const D3DTOP_MODULATE = 4;
const D3DTA_DIFFUSE = 0;
const D3DTA_TEXTURE = 2;
const textureArchiveEntry = "Art\\Textures\\cine_moon.dds";
const runtimeArchivePath = "/assets/runtime-display-drawimage-file";
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function pixelHasColor(pixel, threshold = 8) {
  return Array.isArray(pixel)
    && pixel[3] >= 200
    && pixel.slice(0, 3).some((component) => component > threshold);
}

function pixelLooksSyntheticRed(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] <= 80
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function isDxtFormat(format) {
  return format === D3DFMT_DXT1 || format === D3DFMT_DXT3 || format === D3DFMT_DXT5;
}

function isDxtStorage(storage) {
  return storage === "dxt1" || storage === "dxt3" || storage === "dxt5";
}

function withTimeout(promise, milliseconds, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

if (!isInside(wasmRoot, textureArchivePath)) {
  throw new Error(`texture archive must be inside ${wasmRoot}: ${textureArchivePath}`);
}

await access(textureArchivePath);
const textureArchiveStat = await stat(textureArchivePath);
if (!textureArchiveStat.isFile() || textureArchiveStat.size <= 0) {
  throw new Error(`texture archive is not a readable file: ${textureArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const textureArchiveRelativePath = relative(wasmRoot, textureArchivePath).split(sep).join("/");
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
  const textureArchiveUrl = new URL(textureArchiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "filename-backed W3DDisplay drawImage smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before TexturesZH mount: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
      path: runtimeArchivePath,
      register: false,
      archives: [
        {
          url: textureArchiveUrl,
          name: "TexturesZH.big",
          expectedSourceBytes: textureArchiveStat.size,
          sourceArchive: textureArchivePath,
          entries: [
            textureArchiveEntry,
          ],
        },
      ],
    });
  const rangeTextureArchive = archiveMountResult.archiveSet?.archives?.[0];
  const cineMoonTextureEntry = rangeTextureArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === textureArchiveEntry.toLowerCase());
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 1
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || archiveMountResult.archiveSet?.sourceTotalBytes !== textureArchiveStat.size
      || archiveMountResult.archiveSet?.totalBytes >= archiveMountResult.archiveSet?.sourceTotalBytes
      || archiveMountResult.archiveSet?.probes?.length !== 0
      || rangeTextureArchive?.path !== textureArchiveMemfsPath
      || rangeTextureArchive?.storage !== "range-backed-subset-big"
      || rangeTextureArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeTextureArchive?.sourceBytes !== textureArchiveStat.size
      || rangeTextureArchive?.entryCount !== 1
      || cineMoonTextureEntry?.sourceOffset !== 137149396
      || cineMoonTextureEntry?.bytes !== 87536
      || cineMoonTextureEntry?.reader !== "browser fetch Range") {
    throw new Error(`range-backed TexturesZH subset mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let renderResult;
  try {
    renderResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dDisplayDrawImageFile", payload), {
        textureArchivePath: textureArchiveMemfsPath,
      }),
      30000,
      "filename-backed W3DDisplay drawImage",
    );
  } catch (error) {
    throw new Error(`filename-backed W3DDisplay drawImage crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const stage0 = renderResult.probe?.draw?.renderState?.textureStages?.[0];
  const stage1 = renderResult.probe?.draw?.renderState?.textureStages?.[1];
  if (!renderResult.ok
      || renderResult.probe?.source !== "ww3d_display_drawimage_file_probe"
      || renderResult.probe?.archives?.texture !== textureArchiveMemfsPath
      || renderResult.probe?.results?.runtimeAssetSystemInstalled !== true
      || renderResult.probe?.results?.textureArchiveLoaded !== true
      || renderResult.probe?.results?.textureFileExists !== true
      || renderResult.probe?.results?.textureFileFactoryInstalled !== true
      || renderResult.probe?.results?.textureDDSAvailable !== true
      || renderResult.probe?.results?.texturePreloaded !== true
      || renderResult.probe?.results?.textureRegistered !== true
      || renderResult.probe?.results?.textureResolved !== true
      || renderResult.probe?.results?.textureDDSLoaded !== true
      || renderResult.probe?.results?.textureHasD3DSurface !== true
      || renderResult.probe?.results?.textureLevelDesc !== 0
      || renderResult.probe?.results?.displayAllocated !== true
      || renderResult.probe?.results?.displaySetup !== true
      || renderResult.probe?.results?.imageAllocated !== true
      || renderResult.probe?.results?.imageConfigured !== true
      || renderResult.probe?.results?.drawImageCalled !== true
      || renderResult.probe?.texture?.name !== "cine_moon.tga"
      || renderResult.probe?.texture?.archiveEntry !== "art\\textures\\cine_moon.dds"
      || renderResult.probe?.texture?.width <= 0
      || renderResult.probe?.texture?.height <= 0
      || renderResult.probe?.texture?.levels <= 0
      || renderResult.probe?.texture?.uploadedLevels !== renderResult.probe?.texture?.levels
      || !isDxtFormat(renderResult.probe?.texture?.format)
      || renderResult.probe?.texture?.uploadFormat !== renderResult.probe?.texture?.format
      || renderResult.probe?.texture?.source !== "W3DDisplay::drawImage filename path via Render2DClass::Set_Texture, WW3DAssetManager, TextureClass::Apply, and runtime W3DFileSystem BIG archive"
      || renderResult.probe?.runtimeAssets?.installed !== true
      || renderResult.probe?.runtimeAssets?.archiveLoaded !== true
      || renderResult.probe?.runtimeAssets?.w3dFileSystemInstalled !== true
      || renderResult.probe?.runtimeAssets?.directory !== `${runtimeArchivePath}/`
      || renderResult.probe?.runtimeAssets?.fileMask !== "TexturesZH.big"
      || renderResult.probe?.image?.filename !== "cine_moon.tga"
      || renderResult.probe?.image?.rawTexture !== false
      || renderResult.probe?.image?.status !== 0
      || renderResult.probe?.image?.uvLoX !== 0
      || renderResult.probe?.image?.uvLoY !== 0
      || renderResult.probe?.image?.uvHiX !== 1
      || renderResult.probe?.image?.uvHiY !== 1
      || renderResult.probe?.image?.width !== 200
      || renderResult.probe?.image?.height !== 160
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
      || !isDxtStorage(renderResult.browserProbe?.texture0?.storage)
      || renderResult.browserProbe?.texture0?.combiner?.supported !== true
      || renderResult.browserProbe?.texture0?.combiner?.colorOp !== D3DTOP_MODULATE
      || renderResult.browserProbe?.texture0?.sampler?.supported !== true
      || renderResult.browserProbe?.renderState?.textureStages?.[0]?.colorOp !== D3DTOP_MODULATE
      || renderResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg1 !== D3DTA_TEXTURE
      || renderResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg2 !== D3DTA_DIFFUSE
      || renderResult.browserProbe?.renderState?.textureStages?.[1]?.colorOp !== D3DTOP_DISABLE
      || !pixelHasColor(renderResult.browserProbe?.centerPixel, 8)
      || !pixelHasColor(renderResult.screenshot?.centerPixel, 8)
      || pixelLooksSyntheticRed(renderResult.browserProbe?.centerPixel)
      || pixelLooksSyntheticRed(renderResult.screenshot?.centerPixel)
      || renderResult.textureDelta?.creates < 1
      || renderResult.textureDelta?.updates < renderResult.probe?.texture?.levels
      || renderResult.textureDelta?.binds < 1) {
    throw new Error(`filename-backed W3DDisplay drawImage failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: drawImageFileScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archiveSet: archiveMountResult.archiveSet,
    rangeEntry: {
      sourceArchive: textureArchivePath,
      archiveUrl: textureArchiveUrl,
      archiveEntry: cineMoonTextureEntry.path,
      offset: cineMoonTextureEntry.sourceOffset,
      bytes: cineMoonTextureEntry.bytes,
      indexedEntries: cineMoonTextureEntry.sourceIndexedEntries,
      directoryBytes: cineMoonTextureEntry.sourceDirectoryBytes,
      mount: rangeTextureArchive,
    },
    screenshot: drawImageFileScreenshot,
    probe: renderResult.probe,
    browserProbe: renderResult.browserProbe,
    textureDelta: renderResult.textureDelta,
    reader: "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
    renderer: "W3DDisplay::drawImage + Render2DClass filename texture path + browser D3D8/WebGL2 bridge",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
