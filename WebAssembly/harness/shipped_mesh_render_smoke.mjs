import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/W3DZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const shippedMeshScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-shipped-mesh-canvas.png",
);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function pixelLooksRed(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] <= 80
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

if (!isInside(wasmRoot, archivePath)) {
  throw new Error(`archive must be inside ${wasmRoot}: ${archivePath}`);
}

await access(archivePath);
const archiveStat = await stat(archivePath);
if (!archiveStat.isFile() || archiveStat.size <= 0) {
  throw new Error(`archive is not a readable file: ${archivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const archiveRelativePath = relative(wasmRoot, archivePath).split(sep).join("/");
const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const archiveUrl = new URL(archiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "shipped mesh render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3DZH mount: ${JSON.stringify(bootResult)}`);
  }

  const mountResult = await page.evaluate((archiveUrl) => window.CnCPort.rpc("mountArchive", {
    url: archiveUrl,
    name: "W3DZH.big",
    path: "/assets/runtime/W3DZH.big",
  }), archiveUrl);
  if (!mountResult.ok || mountResult.archive?.path !== "/assets/runtime/W3DZH.big") {
    throw new Error(`W3DZH.big mount failed: ${JSON.stringify(mountResult)}`);
  }

  const renderResult = await page.evaluate(() => window.CnCPort.rpc("ww3dShippedMesh", {
    archivePath: "/assets/runtime/W3DZH.big",
  }));
  if (!renderResult.ok
      || renderResult.probe?.source !== "ww3d_shipped_mesh_probe"
      || renderResult.probe?.mesh?.path !== "art\\w3d\\cine_moon.w3d"
      || renderResult.probe?.mesh?.name !== "CINE_MOON"
      || renderResult.probe?.mesh?.bytes !== 594
      || renderResult.probe?.mesh?.vertices !== 4
      || renderResult.probe?.mesh?.polygons !== 2
      || renderResult.probe?.results?.archiveLoaded !== true
      || renderResult.probe?.results?.fileRead !== true
      || renderResult.probe?.results?.meshLoaded !== true
      || renderResult.probe?.results?.meshLoad !== 0
      || renderResult.probe?.results?.textureRegistered !== true
      || renderResult.probe?.texture?.name !== "cine_moon.tga"
      || renderResult.probe?.draw?.primitiveType !== 4
      || renderResult.probe?.draw?.vertexCount !== 4
      || renderResult.probe?.draw?.primitiveCount !== 2
      || renderResult.probe?.calls?.drawIndexed < 1
      || renderResult.probe?.calls?.browserTextureCreate < 1
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
      || renderResult.browserProbe?.texture0?.combiner?.supported !== true
      || renderResult.browserProbe?.texture0?.sampler?.supported !== true
      || !pixelLooksRed(renderResult.browserProbe?.centerPixel)
      || !pixelLooksRed(renderResult.screenshot?.centerPixel)
      || renderResult.textureDelta?.creates < 1
      || renderResult.textureDelta?.updates < 1
      || renderResult.textureDelta?.binds < 1) {
    throw new Error(`shipped WW3D mesh render failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: shippedMeshScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archive: mountResult.archive,
    screenshot: shippedMeshScreenshot,
    probe: renderResult.probe,
    browserProbe: renderResult.browserProbe,
    textureDelta: renderResult.textureDelta,
    reader: "Win32BIGFileSystem",
    renderer: "WW3D::Render + browser D3D8/WebGL2 bridge",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
