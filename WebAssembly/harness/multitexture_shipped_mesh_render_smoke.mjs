import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/W3DZH.big");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);
const textureArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultTextureArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(
  screenshotDir,
  "harness-smoke-ww3d-multitexture-shipped-mesh-canvas.png",
);
const runtimeArchivePath = "/assets/runtime";
const meshArchiveMemfsPath = `${runtimeArchivePath}/W3DZH.big`;
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function pixelHasColor(pixel, threshold = 16) {
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

if (!isInside(wasmRoot, archivePath)) {
  throw new Error(`archive must be inside ${wasmRoot}: ${archivePath}`);
}
if (!isInside(wasmRoot, textureArchivePath)) {
  throw new Error(`texture archive must be inside ${wasmRoot}: ${textureArchivePath}`);
}

await access(archivePath);
const archiveStat = await stat(archivePath);
if (!archiveStat.isFile() || archiveStat.size <= 0) {
  throw new Error(`archive is not a readable file: ${archivePath}`);
}
await access(textureArchivePath);
const textureArchiveStat = await stat(textureArchivePath);
if (!textureArchiveStat.isFile() || textureArchiveStat.size <= 0) {
  throw new Error(`texture archive is not a readable file: ${textureArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const archiveRelativePath = relative(wasmRoot, archivePath).split(sep).join("/");
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
  const archiveUrl = new URL(archiveRelativePath, server.url).href;
  const textureArchiveUrl = new URL(textureArchiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "multi-texture shipped mesh render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before archive mount: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await page.evaluate((payload) => window.CnCPort.rpc("mountArchives", payload), {
    path: runtimeArchivePath,
    archives: [
      {
        url: archiveUrl,
        name: "W3DZH.big",
        expectedBytes: archiveStat.size,
      },
      {
        url: textureArchiveUrl,
        name: "TexturesZH.big",
        expectedBytes: textureArchiveStat.size,
      },
    ],
  });
  if (!archiveMountResult.ok
      || archiveMountResult.archiveSet?.archiveCount !== 2
      || archiveMountResult.archiveSet?.totalBytes !== archiveStat.size + textureArchiveStat.size
      || archiveMountResult.archiveSet?.archives?.[0]?.path !== meshArchiveMemfsPath
      || archiveMountResult.archiveSet?.archives?.[1]?.path !== textureArchiveMemfsPath
      || archiveMountResult.state?.browserRuntimeAssets?.installed !== true
      || archiveMountResult.state?.browserRuntimeAssets?.w3dFileSystemInstalled !== true) {
    throw new Error(`runtime W3D/texture archive registration failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let renderResult;
  try {
    renderResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMultitextureShippedMesh", payload), {
        archivePath: meshArchiveMemfsPath,
        textureArchivePath: textureArchiveMemfsPath,
      }),
      30000,
      "multi-texture shipped WW3D mesh render",
    );
  } catch (error) {
    throw new Error(`multi-texture shipped WW3D mesh render crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const probe = renderResult.probe;
  const browserProbe = renderResult.browserProbe;
  if (!renderResult.ok
      || probe?.source !== "ww3d_multitexture_shipped_mesh_probe"
      || probe?.mesh?.path !== "art\\w3d\\pablinkliteb.w3d"
      || probe?.mesh?.name !== "PABLINKLITEB.OBJECT01"
      || probe?.mesh?.maxTextureStagesInPass < 2
      || probe?.mesh?.maxUvStagesInPass < 2
      || probe?.mesh?.samePassMultitexturePasses < 1
      || probe?.archives?.mesh !== meshArchiveMemfsPath
      || probe?.archives?.texture !== textureArchiveMemfsPath
      || probe?.results?.meshArchiveLoaded !== true
      || probe?.results?.textureArchiveLoaded !== true
      || probe?.results?.runtimeAssetSystemInstalled !== true
      || probe?.results?.fileRead !== true
      || probe?.results?.stage0TextureFileExists !== true
      || probe?.results?.stage1TextureFileExists !== true
      || probe?.results?.textureFileFactoryInstalled !== true
      || probe?.results?.stage0TextureDDSAvailable !== true
      || probe?.results?.stage1TextureDDSAvailable !== true
      || probe?.results?.stage0TextureResolved !== true
      || probe?.results?.stage1TextureResolved !== true
      || probe?.results?.stage0TextureHasD3DSurface !== true
      || probe?.results?.stage1TextureHasD3DSurface !== true
      || probe?.results?.meshLoaded !== true
      || probe?.results?.meshLoad !== 0
      || probe?.stage0Texture?.name !== "psblink.tga"
      || probe?.stage1Texture?.name !== "psgrad.tga"
      || probe?.stage0Texture?.archiveEntry !== "art\\textures\\psblink.dds"
      || probe?.stage1Texture?.archiveEntry !== "art\\textures\\psgrad.dds"
      || probe?.stage0Texture?.width <= 0
      || probe?.stage0Texture?.height <= 0
      || probe?.stage1Texture?.width <= 0
      || probe?.stage1Texture?.height <= 0
      || probe?.textureStages?.stage1?.colorOp === 1 // D3DTOP_DISABLE
      || probe?.runtimeAssets?.installed !== true
      || probe?.runtimeAssets?.archiveLoaded !== true
      || probe?.runtimeAssets?.w3dFileSystemInstalled !== true
      || probe?.calls?.drawIndexed < 1
      || probe?.calls?.browserTextureCreate < 2
      || probe?.calls?.browserTextureBind < 2
      || probe?.calls?.setTexture < 2
      || probe?.calls?.setTransform < 3
      || browserProbe?.source !== "browser_d3d8_draw_indexed"
      || browserProbe?.usedPersistentBuffers !== true
      || browserProbe?.usedTransforms !== true
      || browserProbe?.texture0?.ready !== true
      || browserProbe?.texture0?.sampled !== true
      || browserProbe?.texture1?.ready !== true
      || browserProbe?.texture1?.sampled !== true
      || !pixelHasColor(browserProbe?.centerPixel)
      || !pixelHasColor(renderResult.screenshot?.centerPixel)
      || renderResult.textureDelta?.creates < 2
      || renderResult.textureDelta?.binds < 2) {
    throw new Error(`multi-texture shipped WW3D mesh render failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: screenshotPath });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archiveSet: archiveMountResult.archiveSet,
    screenshot: screenshotPath,
    probe,
    browserProbe,
    textureDelta: renderResult.textureDelta,
    renderer: "WW3D::Render + browser D3D8/WebGL2 bridge (same-pass multi-texture)",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
