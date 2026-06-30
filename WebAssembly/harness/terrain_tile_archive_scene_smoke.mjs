#!/usr/bin/env node
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultTerrainArchivePath = resolve(wasmRoot, "artifacts/real-assets/TerrainZH.big");
const terrainArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultTerrainArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const terrainScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-tile-archive-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-tile-scene";
const terrainArchiveMemfsPath = `${runtimeArchivePath}/TerrainZH.big`;
const terrainEntry = "Art\\Terrain\\PTBlossom01.tga";

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function assertArchivePath(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
}

assertArchivePath(terrainArchivePath, "Terrain archive");

await access(terrainArchivePath);
const terrainArchiveStat = await stat(terrainArchivePath);
if (!terrainArchiveStat.isFile() || terrainArchiveStat.size <= 0) {
  throw new Error(`Terrain archive is not a readable file: ${terrainArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const terrainArchiveRelativePath = relative(wasmRoot, terrainArchivePath).split(sep).join("/");
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
  const terrainArchiveUrl = new URL(terrainArchiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "W3D archive terrain tile scene render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D archive terrain scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountArchives", payload), {
      path: runtimeArchivePath,
      archives: [
        {
          url: terrainArchiveUrl,
          name: "TerrainZH.big",
          expectedBytes: terrainArchiveStat.size,
        },
      ],
    });
  const mountedTerrainArchive = archiveMountResult.archiveSet?.archives?.[0];
  const mountedTerrainProbe = archiveMountResult.archiveSet?.probes?.[0];
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountArchives"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 1
      || mountedTerrainArchive?.path !== terrainArchiveMemfsPath
      || mountedTerrainArchive?.bytes !== terrainArchiveStat.size
      || mountedTerrainArchive?.bytesMatch !== true
      || mountedTerrainProbe?.ok !== true
      || mountedTerrainProbe?.indexedFiles <= 0) {
    throw new Error(`TerrainZH archive mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  const terrainResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("ww3dTerrainTileArchiveScene", payload), {
      terrainArchivePath: terrainArchiveMemfsPath,
    });

  if (!terrainResult.ok
      || terrainResult.command !== "ww3dTerrainTileArchiveScene"
      || terrainResult.probe?.source !== "ww3d_terrain_tile_archive_scene_probe"
      || !terrainResult.probe?.scene?.renderPath?.includes("RTS3DScene::Customized_Render")
      || terrainResult.probe?.scene?.created !== true
      || terrainResult.probe?.scene?.objectAdded !== true
      || terrainResult.probe?.scene?.terrainClassId !== 4
      || terrainResult.probe?.archive?.entry !== terrainEntry
      || terrainResult.probe?.archive?.loaded !== true
      || terrainResult.probe?.archive?.entryExists !== true
      || terrainResult.probe?.archive?.entryOpenable !== true
      || terrainResult.probe?.archive?.countedTiles < 1
      || terrainResult.probe?.archive?.readTilesOk !== true
      || terrainResult.probe?.terrain?.tileSource !== "archive-tga"
      || terrainResult.probe?.terrain?.verticesPerSide !== 17
      || terrainResult.probe?.terrain?.cellsPerSide !== 16
      || terrainResult.probe?.calls?.browserTextureCreate < 1
      || terrainResult.probe?.calls?.browserTextureUpdate < 1
      || terrainResult.probe?.calls?.drawIndexed < 1
      || terrainResult.probe?.draw?.vertexShaderFvf !== 578
      || terrainResult.probe?.draw?.vertexStride !== 32
      || terrainResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || terrainResult.browserProbe?.texture1?.sampled !== true
      || terrainResult.browserProbe?.boundTextures?.["1"] !== terrainResult.probe?.texture?.id
      || terrainResult.textureDelta?.creates < 1
      || terrainResult.textureDelta?.updates < 1
      || terrainResult.textureDelta?.binds < 1
      || terrainResult.textureDelta?.samplerApplications < 1
      || terrainResult.screenshot?.centerPixel?.slice(0, 3).every((component) => component <= 8)) {
    throw new Error(`W3D archive terrain scene render failed: ${JSON.stringify({
      ok: terrainResult.ok,
      probe: terrainResult.probe,
      browserProbe: terrainResult.browserProbe,
      textureDelta: terrainResult.textureDelta,
      screenshot: {
        width: terrainResult.screenshot?.width,
        height: terrainResult.screenshot?.height,
        centerPixel: terrainResult.screenshot?.centerPixel,
      },
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: terrainScreenshot });

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during W3D archive terrain scene: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-tile-archive-scene",
    url: harnessUrl,
    screenshot: terrainScreenshot,
    archive: {
      path: terrainArchiveMemfsPath,
      entry: terrainEntry,
      countedTiles: terrainResult.probe.archive.countedTiles,
      firstPixelRgba: terrainResult.probe.archive.firstPixelRgba,
      tileChecksum: terrainResult.probe.archive.tileChecksum,
    },
    scene: terrainResult.probe.scene,
    terrain: terrainResult.probe.terrain,
    calls: terrainResult.probe.calls,
    draw: terrainResult.probe.draw,
    centerPixel: terrainResult.screenshot.centerPixel,
    renderer: "TerrainZH.big TGA -> original WorldHeightMap::readTiles -> RTS3DScene::Customized_Render CLASSID_TILEMAP -> W3DTerrainBackground -> browser D3D8/WebGL2",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
