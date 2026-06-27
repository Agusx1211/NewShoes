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
const shippedMeshScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-shipped-mesh-canvas.png",
);
const D3DFMT_DXT5 = 0x35545844;
const meshArchiveEntry = "Art\\W3D\\CINE_Moon.W3D";
const meshMountPath = "/Art/W3D/CINE_Moon.W3D";
const textureArchiveEntry = "Art\\Textures\\cine_moon.dds";
const textureMountPath = "/art/textures/cine_moon.dds";
const meshSourceLabel = `W3DZH.big:${meshArchiveEntry}`;
const textureSourceLabel = `TexturesZH.big:${textureArchiveEntry}`;

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function pixelHasColor(pixel, threshold = 16) {
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
    source: "shipped mesh render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3DZH mount: ${JSON.stringify(bootResult)}`);
  }

  const meshMountResult = await page.evaluate((payload) => window.CnCPort.rpc("mountBigArchiveEntry", payload), {
    url: archiveUrl,
    path: meshMountPath,
    sourceArchive: archivePath,
    entry: meshArchiveEntry,
  });
  if (!meshMountResult.ok
      || meshMountResult.asset?.path !== meshMountPath
      || meshMountResult.asset?.archiveEntry !== meshArchiveEntry
      || meshMountResult.asset?.offset !== 91765912
      || meshMountResult.asset?.bytes !== 594
      || meshMountResult.asset?.reader !== "browser fetch Range") {
    throw new Error(`cine_moon.w3d mount failed: ${JSON.stringify(meshMountResult)}`);
  }

  const textureMountResult = await page.evaluate((payload) => window.CnCPort.rpc("mountBigArchiveEntry", payload), {
    url: textureArchiveUrl,
    path: textureMountPath,
    sourceArchive: textureArchivePath,
    entry: textureArchiveEntry,
  });
  if (!textureMountResult.ok
      || textureMountResult.asset?.path !== textureMountPath
      || textureMountResult.asset?.archiveEntry !== textureArchiveEntry
      || textureMountResult.asset?.offset !== 137149396
      || textureMountResult.asset?.bytes !== 87536
      || textureMountResult.asset?.reader !== "browser fetch Range") {
    throw new Error(`cine_moon.dds mount failed: ${JSON.stringify(textureMountResult)}`);
  }

  let renderResult;
  try {
    renderResult = await page.evaluate(() => window.CnCPort.rpc("ww3dShippedMesh", {
      archivePath: "W3DZH.big:Art\\W3D\\CINE_Moon.W3D",
      textureArchivePath: "TexturesZH.big:Art\\Textures\\cine_moon.dds",
    }));
  } catch (error) {
    throw new Error(`shipped WW3D mesh render crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }
  if (!renderResult.ok
      || renderResult.probe?.source !== "ww3d_shipped_mesh_probe"
      || renderResult.probe?.mesh?.path !== "art\\w3d\\cine_moon.w3d"
      || renderResult.probe?.mesh?.name !== "CINE_MOON"
      || renderResult.probe?.mesh?.bytes !== 594
      || renderResult.probe?.mesh?.vertices !== 4
      || renderResult.probe?.mesh?.polygons !== 2
      || renderResult.probe?.archives?.mesh !== meshSourceLabel
      || renderResult.probe?.archives?.texture !== textureSourceLabel
      || renderResult.probe?.results?.meshArchiveLoaded !== true
      || renderResult.probe?.results?.textureArchiveLoaded !== true
      || renderResult.probe?.results?.fileRead !== true
      || renderResult.probe?.results?.textureFileExists !== true
      || renderResult.probe?.results?.textureSearchPathSet !== true
      || renderResult.probe?.results?.textureRegistered !== true
      || renderResult.probe?.results?.textureDDSAvailable !== true
      || renderResult.probe?.results?.textureDDSLoaded !== true
      || renderResult.probe?.results?.textureResolved !== true
      || renderResult.probe?.results?.textureHasD3DSurface !== true
      || renderResult.probe?.results?.textureLevelDesc !== 0
      || renderResult.probe?.results?.meshLoaded !== true
      || renderResult.probe?.results?.meshLoad !== 0
      || renderResult.probe?.texture?.name !== "cine_moon.tga"
      || renderResult.probe?.texture?.archiveEntry !== "art\\textures\\cine_moon.dds"
      || renderResult.probe?.texture?.width <= 0
      || renderResult.probe?.texture?.height <= 0
      || renderResult.probe?.texture?.levels <= 0
      || renderResult.probe?.texture?.uploadedLevels !== renderResult.probe?.texture?.levels
      || renderResult.probe?.texture?.format !== D3DFMT_DXT5
      || renderResult.probe?.texture?.uploadFormat !== D3DFMT_DXT5
      || renderResult.probe?.texture?.source !== "original TextureClass::Init / TextureLoader foreground DDS path from mounted Art/Textures"
      || renderResult.probe?.draw?.primitiveType !== 4
      || renderResult.probe?.draw?.vertexCount !== 4
      || renderResult.probe?.draw?.primitiveCount !== 2
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
      || renderResult.browserProbe?.texture0?.id !== renderResult.probe?.texture?.id
      || renderResult.browserProbe?.texture0?.ready !== true
      || renderResult.browserProbe?.texture0?.sampled !== true
      || renderResult.browserProbe?.texture0?.storage !== "dxt5"
      || renderResult.browserProbe?.texture0?.combiner?.supported !== true
      || renderResult.browserProbe?.texture0?.sampler?.supported !== true
      || !pixelHasColor(renderResult.browserProbe?.centerPixel)
      || !pixelHasColor(renderResult.screenshot?.centerPixel)
      || pixelLooksSyntheticRed(renderResult.browserProbe?.centerPixel)
      || pixelLooksSyntheticRed(renderResult.screenshot?.centerPixel)
      || renderResult.textureDelta?.creates < 1
      || renderResult.textureDelta?.updates < renderResult.probe?.texture?.levels
      || renderResult.textureDelta?.binds < 1) {
    throw new Error(`shipped WW3D mesh render failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: shippedMeshScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archives: {
      mesh: {
        sourceArchive: archivePath,
        archiveUrl,
        archiveEntry: meshMountResult.asset.archiveEntry,
        offset: meshMountResult.asset.offset,
        bytes: meshMountResult.asset.bytes,
        indexedEntries: meshMountResult.asset.indexedEntries,
        directoryBytes: meshMountResult.asset.directoryBytes,
        mount: meshMountResult.asset,
      },
      texture: {
        sourceArchive: textureArchivePath,
        archiveUrl: textureArchiveUrl,
        archiveEntry: textureMountResult.asset.archiveEntry,
        offset: textureMountResult.asset.offset,
        bytes: textureMountResult.asset.bytes,
        indexedEntries: textureMountResult.asset.indexedEntries,
        directoryBytes: textureMountResult.asset.directoryBytes,
        mount: textureMountResult.asset,
      },
    },
    screenshot: shippedMeshScreenshot,
    probe: renderResult.probe,
    browserProbe: renderResult.browserProbe,
    textureDelta: renderResult.textureDelta,
    reader: "browser fetch Range + mounted MEMFS files",
    renderer: "WW3D::Render + browser D3D8/WebGL2 bridge",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
