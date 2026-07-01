#!/usr/bin/env node
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultIniArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const defaultMapsArchivePath = resolve(wasmRoot, "artifacts/real-assets/MapsZH.big");
const defaultTerrainArchivePath = resolve(wasmRoot, "artifacts/real-assets/TerrainZH.big");
const defaultBaseTerrainArchivePath = resolve(wasmRoot, "artifacts/real-assets/Terrain.big");
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const mapsArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultMapsArchivePath);
const terrainArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultTerrainArchivePath);
const baseTerrainArchivePath = resolve(wasmRoot, process.argv[5] ?? defaultBaseTerrainArchivePath);
const baseTerrainArchiveRequired = Boolean(process.argv[5]);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const terrainScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-visual-scene-canvas.png",
);
const terrainLoadWindowScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-visual-load-window-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-visual-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsMaskPath = `${runtimeArchivePath}/Terrain*.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const terrainIniParser = "GameEngine/Common/INI.cpp::load + INITerrain.cpp";
const mapEntry = "Maps\\MD_GLA03\\MD_GLA03.map";

function hasTerrainPass(drawHistory, { alphaBlendEnable, texCoordIndex, firstIndex = null }) {
  const matches = (draw) =>
    draw?.renderState?.alphaBlendEnable === alphaBlendEnable
      && draw?.renderState?.textureStage0?.texCoordIndex === texCoordIndex
      && draw?.texture0?.sampled === true;
  if (firstIndex !== null) {
    return matches(drawHistory[firstIndex]);
  }
  return drawHistory.some(matches);
}

function summarizeDrawHistory(drawHistory) {
  return {
    count: drawHistory.length,
    first: drawHistory.slice(0, 4).map((draw) => ({
      drawSequence: draw?.drawSequence,
      ok: draw?.ok,
      alphaBlendEnable: draw?.renderState?.alphaBlendEnable,
      texCoordIndex: draw?.renderState?.textureStage0?.texCoordIndex,
      sampled: draw?.texture0?.sampled,
    })),
    last: drawHistory.slice(-4).map((draw) => ({
      drawSequence: draw?.drawSequence,
      ok: draw?.ok,
      alphaBlendEnable: draw?.renderState?.alphaBlendEnable,
      texCoordIndex: draw?.renderState?.textureStage0?.texCoordIndex,
      sampled: draw?.texture0?.sampled,
    })),
  };
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

async function checkedArchive(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
  await access(path);
  const archiveStat = await stat(path);
  if (!archiveStat.isFile() || archiveStat.size <= 0) {
    throw new Error(`${label} is not a readable file: ${path}`);
  }
  return archiveStat;
}

async function optionalArchive(path, label, required = false) {
  try {
    return await checkedArchive(path, label);
  } catch (error) {
    if (required) {
      throw error;
    }
    return null;
  }
}

async function listBigArchiveEntries(path) {
  const archiveBytes = await readFile(path);
  if (archiveBytes.toString("latin1", 0, 4) !== "BIGF") {
    throw new Error(`Unsupported BIG archive magic in ${path}`);
  }

  const entryCount = archiveBytes.readUInt32BE(8);
  const entries = [];
  let cursor = 0x10;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (cursor + 8 > archiveBytes.byteLength) {
      throw new Error(`Truncated BIG directory in ${path}`);
    }

    const sourceOffset = archiveBytes.readUInt32BE(cursor);
    const bytes = archiveBytes.readUInt32BE(cursor + 4);
    cursor += 8;

    let nameEnd = cursor;
    while (nameEnd < archiveBytes.byteLength && archiveBytes[nameEnd] !== 0) {
      nameEnd++;
    }
    if (nameEnd >= archiveBytes.byteLength) {
      throw new Error(`Unterminated BIG entry name in ${path}`);
    }

    const name = archiveBytes.toString("latin1", cursor, nameEnd);
    cursor = nameEnd + 1;
    entries.push({ name, sourceOffset, bytes });
  }

  return entries;
}

async function withTimeout(label, promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

const iniArchiveStat = await checkedArchive(iniArchivePath, "INI archive");
const mapsArchiveStat = await checkedArchive(mapsArchivePath, "Maps archive");
const terrainArchiveStat = await checkedArchive(terrainArchivePath, "Terrain archive");
const terrainArchiveEntries = (await listBigArchiveEntries(terrainArchivePath))
  .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
if (terrainArchiveEntries.length === 0) {
  throw new Error(`Terrain archive has no Art\\Terrain image entries: ${terrainArchivePath}`);
}
const terrainArchives = [{
  sourcePath: terrainArchivePath,
  memfsName: basename(terrainArchivePath),
  stat: terrainArchiveStat,
  entries: terrainArchiveEntries,
  optionalBase: false,
}];
const baseTerrainArchiveStat = await optionalArchive(
  baseTerrainArchivePath,
  "Base terrain archive",
  baseTerrainArchiveRequired,
);
if (baseTerrainArchiveStat !== null && baseTerrainArchivePath !== terrainArchivePath) {
  const baseTerrainArchiveEntries = (await listBigArchiveEntries(baseTerrainArchivePath))
    .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
    .map((entry) => entry.name);
  if (baseTerrainArchiveEntries.length === 0) {
    throw new Error(`Base terrain archive has no Art\\Terrain image entries: ${baseTerrainArchivePath}`);
  }
  terrainArchives.push({
    sourcePath: baseTerrainArchivePath,
    memfsName: basename(baseTerrainArchivePath),
    stat: baseTerrainArchiveStat,
    entries: baseTerrainArchiveEntries,
    optionalBase: true,
  });
}

await mkdir(screenshotDir, { recursive: true });

const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
const mapsArchiveRelativePath = relative(wasmRoot, mapsArchivePath).split(sep).join("/");
const terrainArchiveMounts = terrainArchives.map((archive) => ({
  ...archive,
  memfsPath: `${runtimeArchivePath}/${archive.memfsName}`,
  urlPath: relative(wasmRoot, archive.sourcePath).split(sep).join("/"),
}));
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
  const mapsArchiveUrl = new URL(mapsArchiveRelativePath, server.url).href;

  await withTimeout(
    "terrain visual harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain visual RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain visual boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "W3D visual-owned terrain scene render smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D visual terrain scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    "terrain visual archive mount RPC",
    page.evaluate((payload) =>
      window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
        path: runtimeArchivePath,
        register: false,
        verifyEach: false,
        archives: [
          {
            url: iniArchiveUrl,
            name: "INIZH.big",
            expectedSourceBytes: iniArchiveStat.size,
            sourceArchive: iniArchivePath,
            entries: [terrainIniEntry],
          },
          {
            url: mapsArchiveUrl,
            name: "MapsZH.big",
            expectedSourceBytes: mapsArchiveStat.size,
            sourceArchive: mapsArchivePath,
            entries: [mapEntry],
          },
          ...terrainArchiveMounts.map((archive) => ({
            url: new URL(archive.urlPath, server.url).href,
            name: archive.memfsName,
            expectedSourceBytes: archive.stat.size,
            sourceArchive: archive.sourcePath,
            entries: archive.entries,
          })),
        ],
      }),
    120000,
  );
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 2 + terrainArchiveMounts.length
      || archiveMountResult.archiveSet?.registered !== false) {
    throw new Error(`Runtime terrain visual archives mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let terrainResult;
  try {
    terrainResult = await withTimeout(
      "terrain visual render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainVisualScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsMaskPath,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain visual render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: terrainScreenshot });

  const terrainDrawHistory = Array.isArray(terrainResult.drawHistory)
    ? terrainResult.drawHistory
    : [];
  if (!terrainResult.ok
      || terrainResult.command !== "ww3dTerrainVisualScene"
      || terrainResult.probe?.source !== "ww3d_terrain_visual_scene_probe"
      || terrainResult.probe?.renderMode !== "selected-source-patch"
      || terrainResult.probe?.visual?.class !== "W3DTerrainVisual"
      || !terrainResult.probe?.visual?.loadPath?.includes("W3DTerrainVisual::load")
      || terrainResult.probe?.visual?.ownedTerrainRenderObject !== true
      || terrainResult.probe?.visual?.waterRenderObjectNull !== true
      || terrainResult.probe?.results?.loadWindowRenderSelected !== false
      || terrainResult.probe?.results?.patchReinitialized !== true
      || terrainResult.probe?.ini?.entry !== terrainIniEntry
      || terrainResult.probe?.ini?.loaded !== true
      || terrainResult.probe?.ini?.entryExists !== true
      || terrainResult.probe?.ini?.parsed !== true
      || terrainResult.probe?.ini?.parser !== terrainIniParser
      || terrainResult.probe?.ini?.originalIniParser !== true
      || terrainResult.probe?.ini?.terrainTypeCount <= 0
      || terrainResult.probe?.map?.entry !== mapEntry
      || terrainResult.probe?.map?.entryExists !== true
      || terrainResult.probe?.map?.entryOpenable !== true
      || terrainResult.probe?.map?.streamOpen !== true
      || terrainResult.probe?.map?.parsed !== true
      || terrainResult.probe?.map?.bytes <= 0
      || terrainResult.probe?.map?.width <= 16
      || terrainResult.probe?.map?.height <= 16
      || terrainResult.probe?.map?.heightChecksum <= 0
      || !terrainResult.probe?.scene?.renderPath?.includes("W3DDisplay::m_3DScene")
      || terrainResult.probe?.scene?.created !== true
      || terrainResult.probe?.scene?.objectAddedByVisualLoad !== true
      || terrainResult.probe?.scene?.path !== "W3DDisplay::m_3DScene"
      || terrainResult.probe?.scene?.terrainClassId !== 4
      || terrainResult.probe?.terrain?.tileSource !== "shipped-map-heightmap"
      || terrainResult.probe?.terrain?.renderObject !== "HeightMapRenderObjClass"
      || terrainResult.probe?.terrain?.verticesPerSide !== 33
      || terrainResult.probe?.terrain?.cellsPerSide !== 32
      || terrainResult.probe?.terrain?.tileDiagnostics?.sourceTilesLoaded <= 0
      || terrainResult.probe?.terrain?.tileDiagnostics?.sourceTilesPositioned <= 0
      || terrainResult.probe?.terrain?.tileDiagnostics?.patchCellsWithSource <= 0
      || terrainResult.probe?.terrain?.patchHeightChecksum <= 0
      || terrainResult.probe?.calls?.browserTextureCreate < 1
      || terrainResult.probe?.calls?.browserTextureUpdate < 1
      || terrainResult.probe?.calls?.drawIndexed < 1
      || terrainResult.probe?.draw?.vertexShaderFvf !== 578
      || terrainResult.probe?.draw?.vertexStride !== 32
      || terrainResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || terrainResult.browserProbe?.texture0?.sampled !== true
      || terrainDrawHistory.length < 2
      || !hasTerrainPass(terrainDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0, firstIndex: 0 })
      || !hasTerrainPass(terrainDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1, firstIndex: 1 })
      || terrainResult.textureDelta?.creates < 1
      || terrainResult.textureDelta?.updates < 1
      || terrainResult.textureDelta?.binds < 1
      || terrainResult.textureDelta?.samplerApplications < 1
      || terrainResult.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`W3D visual-owned terrain scene render failed: ${JSON.stringify({
      ok: terrainResult.ok,
      probe: terrainResult.probe,
      browserProbe: terrainResult.browserProbe,
      drawHistory: summarizeDrawHistory(terrainDrawHistory),
      passChecks: {
        base: hasTerrainPass(terrainDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0, firstIndex: 0 }),
        blend: hasTerrainPass(terrainDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1, firstIndex: 1 }),
      },
      textureDelta: terrainResult.textureDelta,
      screenshot: {
        width: terrainResult.screenshot?.width,
        height: terrainResult.screenshot?.height,
        centerPixel: terrainResult.screenshot?.centerPixel,
        coverage: terrainResult.screenshot?.coverage,
      },
    })}`);
  }
  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during W3D visual terrain scene: ${JSON.stringify(browserFailures)}`);
  }

  let loadWindowResult;
  try {
    loadWindowResult = await withTimeout(
      "terrain visual load-window render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainVisualLoadWindowScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsMaskPath,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain visual load-window render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: terrainLoadWindowScreenshot });

  const loadWindowDrawHistory = Array.isArray(loadWindowResult.drawHistory)
    ? loadWindowResult.drawHistory
    : [];
  if (!loadWindowResult.ok
      || loadWindowResult.command !== "ww3dTerrainVisualLoadWindowScene"
      || loadWindowResult.probe?.source !== "ww3d_terrain_visual_load_window_scene_probe"
      || loadWindowResult.probe?.renderMode !== "visual-load-window"
      || loadWindowResult.probe?.visual?.class !== "W3DTerrainVisual"
      || !loadWindowResult.probe?.visual?.loadPath?.includes("W3DTerrainVisual::load")
      || loadWindowResult.probe?.visual?.ownedTerrainRenderObject !== true
      || loadWindowResult.probe?.visual?.waterRenderObjectNull !== true
      || loadWindowResult.probe?.results?.loadWindowRenderSelected !== true
      || loadWindowResult.probe?.results?.patchReinitialized !== false
      || loadWindowResult.probe?.ini?.entry !== terrainIniEntry
      || loadWindowResult.probe?.ini?.loaded !== true
      || loadWindowResult.probe?.ini?.entryExists !== true
      || loadWindowResult.probe?.ini?.parsed !== true
      || loadWindowResult.probe?.ini?.parser !== terrainIniParser
      || loadWindowResult.probe?.ini?.originalIniParser !== true
      || loadWindowResult.probe?.ini?.terrainTypeCount <= 0
      || loadWindowResult.probe?.map?.entry !== mapEntry
      || loadWindowResult.probe?.map?.entryExists !== true
      || loadWindowResult.probe?.map?.entryOpenable !== true
      || loadWindowResult.probe?.map?.streamOpen !== true
      || loadWindowResult.probe?.map?.parsed !== true
      || loadWindowResult.probe?.map?.bytes <= 0
      || loadWindowResult.probe?.map?.width <= 16
      || loadWindowResult.probe?.map?.height <= 16
      || loadWindowResult.probe?.map?.heightChecksum <= 0
      || !loadWindowResult.probe?.scene?.renderPath?.includes("W3DDisplay::m_3DScene")
      || loadWindowResult.probe?.scene?.created !== true
      || loadWindowResult.probe?.scene?.objectAddedByVisualLoad !== true
      || loadWindowResult.probe?.scene?.path !== "W3DDisplay::m_3DScene"
      || loadWindowResult.probe?.scene?.terrainClassId !== 4
      || loadWindowResult.probe?.terrain?.tileSource !== "shipped-map-heightmap"
      || loadWindowResult.probe?.terrain?.renderObject !== "HeightMapRenderObjClass"
      || loadWindowResult.probe?.terrain?.verticesPerSide !== 129
      || loadWindowResult.probe?.terrain?.cellsPerSide !== 128
      || loadWindowResult.probe?.terrain?.renderWindowWidth !== loadWindowResult.probe?.visual?.loadDrawWidth
      || loadWindowResult.probe?.terrain?.renderWindowHeight !== loadWindowResult.probe?.visual?.loadDrawHeight
      || loadWindowResult.probe?.terrain?.renderOriginX !== loadWindowResult.probe?.visual?.loadDrawOriginX
      || loadWindowResult.probe?.terrain?.renderOriginY !== loadWindowResult.probe?.visual?.loadDrawOriginY
      || loadWindowResult.probe?.terrain?.tileDiagnostics?.sourceTilesLoaded <= 0
      || loadWindowResult.probe?.terrain?.tileDiagnostics?.sourceTilesPositioned <= 0
      || loadWindowResult.probe?.terrain?.tileDiagnostics?.patchCells !== 16384
      || (loadWindowResult.probe?.terrain?.tileDiagnostics?.patchCellsWithSource ?? 0)
          + (loadWindowResult.probe?.terrain?.tileDiagnostics?.patchCellsMissingSource ?? 0) !== 16384
      || loadWindowResult.probe?.terrain?.patchHeightChecksum <= 0
      || loadWindowResult.probe?.calls?.browserTextureCreate < 1
      || loadWindowResult.probe?.calls?.browserTextureUpdate < 1
      || loadWindowResult.probe?.calls?.drawIndexed < 1
      || loadWindowResult.probe?.draw?.vertexShaderFvf !== 578
      || loadWindowResult.probe?.draw?.vertexStride !== 32
      || loadWindowResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || loadWindowResult.browserProbe?.texture0?.sampled !== true
      || loadWindowDrawHistory.length < 2
      || !hasTerrainPass(loadWindowDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0 })
      || !hasTerrainPass(loadWindowDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1 })
      || loadWindowResult.textureDelta?.creates < 1
      || loadWindowResult.textureDelta?.updates < 1
      || loadWindowResult.textureDelta?.binds < 1
      || loadWindowResult.textureDelta?.samplerApplications < 1
      || loadWindowResult.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`W3D visual-owned terrain load-window render failed: ${JSON.stringify({
      ok: loadWindowResult.ok,
      probe: loadWindowResult.probe,
      browserProbe: loadWindowResult.browserProbe,
      drawHistory: summarizeDrawHistory(loadWindowDrawHistory),
      passChecks: {
        base: hasTerrainPass(loadWindowDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0 }),
        blend: hasTerrainPass(loadWindowDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1 }),
      },
      textureDelta: loadWindowResult.textureDelta,
      screenshot: {
        width: loadWindowResult.screenshot?.width,
        height: loadWindowResult.screenshot?.height,
        centerPixel: loadWindowResult.screenshot?.centerPixel,
        coverage: loadWindowResult.screenshot?.coverage,
      },
    })}`);
  }
  const loadWindowBrowserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (loadWindowBrowserFailures.length > 0) {
    throw new Error(`browser failures during W3D visual terrain load-window scene: ${JSON.stringify(loadWindowBrowserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-visual-scene",
    url: harnessUrl,
    screenshot: terrainScreenshot,
    archives: {
      ini: {
        path: iniArchiveMemfsPath,
        entry: terrainIniEntry,
        parser: terrainResult.probe.ini.parser,
        originalIniParser: terrainResult.probe.ini.originalIniParser,
        terrainTypeCount: terrainResult.probe.ini.terrainTypeCount,
      },
      maps: {
        path: mapsArchiveMemfsPath,
        entry: mapEntry,
      },
      terrain: {
        path: terrainArchiveMemfsMaskPath,
        entryCount: terrainArchiveMounts.reduce((sum, archive) => sum + archive.entries.length, 0),
        optionalBasePresent: terrainArchiveMounts.some((archive) => archive.optionalBase),
        mounted: terrainArchiveMounts.map((archive) => ({
          name: archive.memfsName,
          path: archive.memfsPath,
          sourceArchive: archive.sourcePath,
          entryCount: archive.entries.length,
          optionalBase: archive.optionalBase,
        })),
      },
    },
    visual: terrainResult.probe.visual,
    map: terrainResult.probe.map,
    scene: terrainResult.probe.scene,
    terrain: terrainResult.probe.terrain,
    loadWindowScreenshot: terrainLoadWindowScreenshot,
    loadWindowVisual: loadWindowResult.probe.visual,
    loadWindowMap: loadWindowResult.probe.map,
    loadWindowScene: loadWindowResult.probe.scene,
    loadWindowTerrain: loadWindowResult.probe.terrain,
    loadWindowCalls: loadWindowResult.probe.calls,
    loadWindowDraw: loadWindowResult.probe.draw,
    loadWindowCenterPixel: loadWindowResult.screenshot.centerPixel,
    loadWindowCoverage: loadWindowResult.screenshot.coverage,
    calls: terrainResult.probe.calls,
    draw: terrainResult.probe.draw,
    centerPixel: terrainResult.screenshot.centerPixel,
    coverage: terrainResult.screenshot.coverage,
    renderer: "original W3DTerrainVisual::load owns WorldHeightMap + HeightMapRenderObjClass scene attachment, then W3DDisplay::m_3DScene renders through browser D3D8/WebGL2",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
