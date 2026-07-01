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
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const defaultBaseTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/Textures.big");
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const mapsArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultMapsArchivePath);
const terrainArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultTerrainArchivePath);
const baseTerrainArchivePath = resolve(wasmRoot, process.argv[5] ?? defaultBaseTerrainArchivePath);
const baseTerrainArchiveRequired = Boolean(process.argv[5]);
const textureArchivePath = resolve(
  wasmRoot,
  process.env.CNC_PORT_TERRAIN_TEXTURE_ARCHIVE ?? defaultTextureArchivePath,
);
const baseTextureArchivePath = resolve(
  wasmRoot,
  process.env.CNC_PORT_BASE_TERRAIN_TEXTURE_ARCHIVE ?? defaultBaseTextureArchivePath,
);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const terrainScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-visual-scene-canvas.png",
);
const terrainVisualShroudScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-visual-shroud-scene-canvas.png",
);
const terrainFullSceneScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-full-scene-canvas.png",
);
const terrainLoadWindowScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-visual-load-window-scene-canvas.png",
);
const terrainCameraPanScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-visual-camera-pan-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-visual-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsMaskPath = `${runtimeArchivePath}/Terrain*.big`;
const fullSceneArchiveMemfsMaskPath = `${runtimeArchivePath}/*.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const waterIniEntry = "Data\\INI\\Water.ini";
const terrainIniParser = "GameEngine/Common/INI.cpp::load + INITerrain.cpp";
const mapEntry = "Maps\\MD_GLA03\\MD_GLA03.map";
const D3DCMP_EQUAL = 3;
const D3DTSS_TCI_CAMERASPACEPOSITION = 0x00020000;
const D3DTTFF_COUNT2 = 2;
const waterTextureBaseNames = [
  "TSCloudWis.tga",
  "TSCloudSun.tga",
  "TSStarFeld.tga",
  "TSWater.tga",
  "TWWater01.tga",
  "TSMoonLarg.tga",
  "Noise0000.tga",
  "TWAlphaEdge.tga",
  "WaterSurfaceBubbles.tga",
  "wave256.tga",
];
const waterTextureCandidateNames = new Set(waterTextureBaseNames.flatMap((name) => {
  const lower = name.toLowerCase();
  return [lower, lower.replace(/\.[^.]+$/, ".dds")];
}));

function iniLayoutMatches(layout) {
  return layout?.source === "terrain-probe-tu-vs-real-ini-runtime"
    && layout?.matches === true
    && layout?.probe?.sizeofINI === layout?.runtime?.sizeofINI
    && layout?.probe?.offsets?.m_seps === layout?.runtime?.offsets?.m_seps
    && layout?.probe?.offsets?.m_sepsPercent === layout?.runtime?.offsets?.m_sepsPercent
    && layout?.probe?.offsets?.m_sepsColon === layout?.runtime?.offsets?.m_sepsColon
    && layout?.probe?.offsets?.m_sepsQuote === layout?.runtime?.offsets?.m_sepsQuote
    && layout?.probe?.separators?.seps === layout?.runtime?.separators?.seps
    && layout?.probe?.separators?.sepsPercent === layout?.runtime?.separators?.sepsPercent
    && layout?.probe?.separators?.sepsColon === layout?.runtime?.separators?.sepsColon
    && layout?.probe?.separators?.sepsQuote === layout?.runtime?.separators?.sepsQuote;
}

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

function terrainStage0(draw) {
  return draw?.renderState?.textureStage0 ?? draw?.renderState?.textureStages?.[0];
}

function isShroudTerrainPass(draw) {
  const stage0 = terrainStage0(draw);
  return draw?.vertexShaderFvf === 578
    && draw?.vertexStride === 32
    && draw?.renderState?.zFunc === D3DCMP_EQUAL
    && stage0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
    && stage0?.textureTransformFlags === D3DTTFF_COUNT2
    && draw?.texture0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
    && draw?.texture0?.textureTransformFlags === D3DTTFF_COUNT2;
}

function logicalTerrainMatches(probe) {
  const logicalTerrain = probe?.logicalTerrain;
  return logicalTerrain?.loadReturned === true
    && logicalTerrain?.loadException === false
    && logicalTerrain?.mapCacheInstalled === true
    && logicalTerrain?.terrainLogicInstalled === true
    && logicalTerrain?.gameClientInstalled === true
    && logicalTerrain?.thingFactoryInstalled === true
    && logicalTerrain?.scriptEngineInstalled === true
    && logicalTerrain?.sourceFilenameMatches === true
    && logicalTerrain?.extentMatchesVisual === true
    && logicalTerrain?.heightRangeMatchesVisual === true
    && logicalTerrain?.mapObjectsPresentAfterLoad === true
    && logicalTerrain?.mapObjectCount > 0
    && logicalTerrain?.timeOfDayNotified === true
    && logicalTerrain?.notifiedTimeOfDay === logicalTerrain?.mapTimeOfDay;
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

function isWaterTextureArchiveEntry(entryName) {
  if (!/^Art\\Textures\\/i.test(entryName)) {
    return false;
  }
  const leafName = entryName.split("\\").pop().toLowerCase();
  return waterTextureCandidateNames.has(leafName);
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
const textureArchiveStat = await checkedArchive(textureArchivePath, "Texture archive");
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
const textureArchiveEntries = (await listBigArchiveEntries(textureArchivePath))
  .filter((entry) => isWaterTextureArchiveEntry(entry.name))
  .map((entry) => entry.name);
const textureArchives = [];
if (textureArchiveEntries.length > 0) {
  textureArchives.push({
    sourcePath: textureArchivePath,
    memfsName: basename(textureArchivePath),
    stat: textureArchiveStat,
    entries: textureArchiveEntries,
    optionalBase: false,
  });
}
const baseTextureArchiveStat = await optionalArchive(baseTextureArchivePath, "Base texture archive");
if (baseTextureArchiveStat !== null && baseTextureArchivePath !== textureArchivePath) {
  const baseTextureArchiveEntries = (await listBigArchiveEntries(baseTextureArchivePath))
    .filter((entry) => isWaterTextureArchiveEntry(entry.name))
    .map((entry) => entry.name);
  if (baseTextureArchiveEntries.length > 0) {
    textureArchives.push({
      sourcePath: baseTextureArchivePath,
      memfsName: basename(baseTextureArchivePath),
      stat: baseTextureArchiveStat,
      entries: baseTextureArchiveEntries,
      optionalBase: true,
    });
  }
}

await mkdir(screenshotDir, { recursive: true });

const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
const mapsArchiveRelativePath = relative(wasmRoot, mapsArchivePath).split(sep).join("/");
const terrainArchiveMounts = terrainArchives.map((archive) => ({
  ...archive,
  memfsPath: `${runtimeArchivePath}/${archive.memfsName}`,
  urlPath: relative(wasmRoot, archive.sourcePath).split(sep).join("/"),
}));
const textureArchiveMounts = textureArchives.map((archive) => ({
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
            entries: [terrainIniEntry, waterIniEntry],
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
          ...textureArchiveMounts.map((archive) => ({
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
      || archiveMountResult.archiveSet?.archiveCount !== 2 + terrainArchiveMounts.length + textureArchiveMounts.length
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
      || !iniLayoutMatches(terrainResult.probe?.iniLayout)
      || terrainResult.probe?.map?.entry !== mapEntry
      || terrainResult.probe?.map?.entryExists !== true
      || terrainResult.probe?.map?.entryOpenable !== true
      || terrainResult.probe?.map?.streamOpen !== true
      || terrainResult.probe?.map?.parsed !== true
      || terrainResult.probe?.map?.bytes <= 0
      || terrainResult.probe?.map?.width <= 16
      || terrainResult.probe?.map?.height <= 16
      || terrainResult.probe?.map?.heightChecksum <= 0
      || !logicalTerrainMatches(terrainResult.probe)
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

  let visualShroudResult;
  try {
    visualShroudResult = await withTimeout(
      "terrain visual shroud render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainVisualShroudScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsMaskPath,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain visual shroud render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: terrainVisualShroudScreenshot });

  const visualShroudDrawHistory = Array.isArray(visualShroudResult.drawHistory)
    ? visualShroudResult.drawHistory
    : [];
  if (!visualShroudResult.ok
      || visualShroudResult.command !== "ww3dTerrainVisualShroudScene"
      || visualShroudResult.probe?.source !== "ww3d_terrain_visual_shroud_scene_probe"
      || visualShroudResult.probe?.renderMode !== "visual-owned-shroud-source-patch"
      || visualShroudResult.probe?.visual?.class !== "W3DTerrainVisual"
      || !visualShroudResult.probe?.visual?.loadPath?.includes("W3DTerrainVisual::load")
      || visualShroudResult.probe?.visual?.ownedTerrainRenderObject !== true
      || visualShroudResult.probe?.visual?.waterRenderObjectNull !== true
      || visualShroudResult.probe?.visual?.shroudRenderObject !== true
      || visualShroudResult.probe?.results?.visualShroudRequested !== true
      || visualShroudResult.probe?.results?.loadWindowRenderSelected !== false
      || visualShroudResult.probe?.results?.patchReinitialized !== true
      || visualShroudResult.probe?.ini?.entry !== terrainIniEntry
      || visualShroudResult.probe?.ini?.loaded !== true
      || visualShroudResult.probe?.ini?.entryExists !== true
      || visualShroudResult.probe?.ini?.parsed !== true
      || visualShroudResult.probe?.ini?.parser !== terrainIniParser
      || visualShroudResult.probe?.ini?.originalIniParser !== true
      || visualShroudResult.probe?.ini?.terrainTypeCount <= 0
      || !iniLayoutMatches(visualShroudResult.probe?.iniLayout)
      || visualShroudResult.probe?.map?.entry !== mapEntry
      || visualShroudResult.probe?.map?.entryExists !== true
      || visualShroudResult.probe?.map?.entryOpenable !== true
      || visualShroudResult.probe?.map?.streamOpen !== true
      || visualShroudResult.probe?.map?.parsed !== true
      || visualShroudResult.probe?.map?.bytes <= 0
      || visualShroudResult.probe?.map?.width <= 16
      || visualShroudResult.probe?.map?.height <= 16
      || visualShroudResult.probe?.map?.heightChecksum <= 0
      || !logicalTerrainMatches(visualShroudResult.probe)
      || !visualShroudResult.probe?.scene?.renderPath?.includes("W3DDisplay::m_3DScene")
      || !visualShroudResult.probe?.scene?.renderPath?.includes("W3DShroudMaterialPassClass")
      || visualShroudResult.probe?.scene?.created !== true
      || visualShroudResult.probe?.scene?.objectAddedByVisualLoad !== true
      || visualShroudResult.probe?.scene?.path !== "W3DDisplay::m_3DScene"
      || visualShroudResult.probe?.scene?.terrainClassId !== 4
      || visualShroudResult.probe?.terrain?.tileSource !== "shipped-map-heightmap"
      || visualShroudResult.probe?.terrain?.renderObject !== "ProbeHeightMapRenderObjWithShroud"
      || visualShroudResult.probe?.terrain?.verticesPerSide !== 33
      || visualShroudResult.probe?.terrain?.cellsPerSide !== 32
      || visualShroudResult.probe?.terrain?.tileDiagnostics?.sourceTilesLoaded <= 0
      || visualShroudResult.probe?.terrain?.tileDiagnostics?.sourceTilesPositioned <= 0
      || visualShroudResult.probe?.terrain?.tileDiagnostics?.patchCellsWithSource <= 0
      || visualShroudResult.probe?.terrain?.patchHeightChecksum <= 0
      || visualShroudResult.probe?.shroud?.requested !== true
      || visualShroudResult.probe?.shroud?.installed !== true
      || visualShroudResult.probe?.shroud?.initialized !== true
      || visualShroudResult.probe?.shroud?.fillInvoked !== true
      || visualShroudResult.probe?.shroud?.renderInvoked !== true
      || visualShroudResult.probe?.shroud?.textureReady !== true
      || visualShroudResult.probe?.shroud?.terrainRenderInvoked !== true
      || visualShroudResult.probe?.shroud?.terrainRenderSawShroud !== true
      || visualShroudResult.probe?.shroud?.terrainRenderSawShroudAfter !== true
      || visualShroudResult.probe?.shroud?.terrainAdditionalPassCount <= 0
      || visualShroudResult.probe?.shroud?.terrainOriginalInstallZFuncEqualSeen !== true
      || visualShroudResult.probe?.shroud?.terrainOriginalInstallCameraSpaceSeen !== true
      || visualShroudResult.probe?.shroud?.terrainOriginalInstallCount2Seen !== true
      || visualShroudResult.probe?.shroud?.terrainOriginalDrawSeen !== true
      || visualShroudResult.probe?.shroud?.terrainFinalDrawSeen !== true
      || visualShroudResult.probe?.shroud?.terrainFallbackInvoked !== false
      || visualShroudResult.probe?.shroud?.cellsX <= 0
      || visualShroudResult.probe?.shroud?.cellsY <= 0
      || visualShroudResult.probe?.shroud?.textureWidth <= 0
      || visualShroudResult.probe?.shroud?.textureHeight <= 0
      || visualShroudResult.probe?.shroud?.sampleLevel < 0
      || visualShroudResult.probe?.calls?.browserTextureCreate < 1
      || visualShroudResult.probe?.calls?.browserTextureUpdate < 1
      || visualShroudResult.probe?.calls?.drawIndexed < 3
      || visualShroudResult.probe?.draw?.vertexShaderFvf !== 578
      || visualShroudResult.probe?.draw?.vertexStride !== 32
      || visualShroudResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || !isShroudTerrainPass(visualShroudResult.browserProbe)
      || visualShroudDrawHistory.length < 3
      || !hasTerrainPass(visualShroudDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0 })
      || !hasTerrainPass(visualShroudDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1 })
      || visualShroudResult.drawSequence?.shroudAfterTerrain !== true
      || visualShroudResult.textureDelta?.creates < 1
      || visualShroudResult.textureDelta?.updates < 1
      || visualShroudResult.textureDelta?.binds < 1
      || visualShroudResult.textureDelta?.samplerApplications < 1
      || visualShroudResult.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`W3D visual-owned terrain shroud render failed: ${JSON.stringify({
      ok: visualShroudResult.ok,
      probe: visualShroudResult.probe,
      browserProbe: visualShroudResult.browserProbe,
      drawHistory: summarizeDrawHistory(visualShroudDrawHistory),
      drawSequence: visualShroudResult.drawSequence,
      passChecks: {
        base: hasTerrainPass(visualShroudDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0 }),
        blend: hasTerrainPass(visualShroudDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1 }),
        shroud: visualShroudDrawHistory.some(isShroudTerrainPass),
      },
      textureDelta: visualShroudResult.textureDelta,
      screenshot: {
        width: visualShroudResult.screenshot?.width,
        height: visualShroudResult.screenshot?.height,
        centerPixel: visualShroudResult.screenshot?.centerPixel,
        coverage: visualShroudResult.screenshot?.coverage,
      },
    })}`);
  }
  const visualShroudBrowserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (visualShroudBrowserFailures.length > 0) {
    throw new Error(`browser failures during W3D visual terrain shroud scene: ${JSON.stringify(visualShroudBrowserFailures)}`);
  }

  let fullSceneResult;
  try {
    fullSceneResult = await withTimeout(
      "terrain full scene render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainFullScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: fullSceneArchiveMemfsMaskPath,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain full scene render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: terrainFullSceneScreenshot });

  const fullSceneDrawHistory = Array.isArray(fullSceneResult.drawHistory)
    ? fullSceneResult.drawHistory
    : [];
  const fullSceneMissingWaterAssets =
    fullSceneResult.probe?.results?.fullInitBlockedByMissingWaterAssets === true;
  const fullSceneWaterInitialized = !fullSceneMissingWaterAssets;
  if (!fullSceneResult.ok
      || fullSceneResult.command !== "ww3dTerrainFullScene"
      || fullSceneResult.probe?.source !== "ww3d_terrain_full_scene_probe"
      || !["full-init-source-patch", "full-init-missing-water-assets-frontier"]
        .includes(fullSceneResult.probe?.renderMode)
      || fullSceneResult.probe?.visual?.class !== "W3DTerrainVisual"
      || fullSceneResult.probe?.visual?.fullInit !== true
      || fullSceneResult.probe?.visual?.ownedTerrainRenderObject !== true
      || fullSceneResult.probe?.visual?.waterRenderObjectNull !== fullSceneMissingWaterAssets
      || fullSceneResult.probe?.results?.fullInitAttempted !== fullSceneWaterInitialized
      || fullSceneResult.probe?.results?.visualInitCompleted !== fullSceneWaterInitialized
      || fullSceneResult.probe?.results?.visualInitException !== false
      || fullSceneResult.probe?.results?.patchReinitialized !== true
      || fullSceneResult.probe?.water?.iniEntry !== "Data\\INI\\Water.ini"
      || fullSceneResult.probe?.water?.iniLoaded !== true
      || fullSceneResult.probe?.water?.iniException !== false
      || fullSceneResult.probe?.water?.waterSettingCount !== 4
      || fullSceneResult.probe?.water?.assetsReady !== fullSceneWaterInitialized
      || (fullSceneMissingWaterAssets
        ? ((fullSceneResult.probe?.water?.missingTextureCount ?? 0) <= 0
          || !fullSceneResult.probe?.water?.firstMissingTexture)
        : (fullSceneResult.probe?.water?.missingTextureCount !== 0
          || fullSceneResult.probe?.water?.renderObjectCreated !== true
          || fullSceneResult.probe?.water?.globalPointerMatches !== true
          || fullSceneResult.probe?.water?.sceneObjectAdded !== true))
      || fullSceneResult.probe?.ini?.entry !== terrainIniEntry
      || fullSceneResult.probe?.ini?.loaded !== true
      || fullSceneResult.probe?.ini?.entryExists !== true
      || fullSceneResult.probe?.ini?.parsed !== true
      || !iniLayoutMatches(fullSceneResult.probe?.iniLayout)
      || fullSceneResult.probe?.map?.entry !== mapEntry
      || fullSceneResult.probe?.map?.entryExists !== true
      || fullSceneResult.probe?.map?.entryOpenable !== true
      || fullSceneResult.probe?.map?.parsed !== true
      || !logicalTerrainMatches(fullSceneResult.probe)
      || fullSceneResult.probe?.terrain?.renderObject !== "HeightMapRenderObjClass"
      || fullSceneResult.probe?.terrain?.verticesPerSide !== 33
      || fullSceneResult.probe?.terrain?.cellsPerSide !== 32
      || fullSceneResult.probe?.terrain?.tileDiagnostics?.sourceTilesLoaded <= 0
      || fullSceneResult.probe?.terrain?.tileDiagnostics?.sourceTilesPositioned <= 0
      || fullSceneResult.probe?.terrain?.tileDiagnostics?.patchCellsWithSource <= 0
      || fullSceneResult.probe?.terrain?.patchHeightChecksum <= 0
      || fullSceneResult.probe?.calls?.browserTextureCreate < 1
      || fullSceneResult.probe?.calls?.browserTextureUpdate < 1
      || fullSceneResult.probe?.calls?.drawIndexed < 1
      || fullSceneResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || fullSceneDrawHistory.length < 2
      || !hasTerrainPass(fullSceneDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0 })
      || !hasTerrainPass(fullSceneDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1 })
      || fullSceneResult.textureDelta?.creates < 1
      || fullSceneResult.textureDelta?.updates < 1
      || fullSceneResult.textureDelta?.binds < 1
      || fullSceneResult.textureDelta?.samplerApplications < 1
      || fullSceneResult.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`W3D terrain full scene render failed: ${JSON.stringify({
      ok: fullSceneResult.ok,
      probe: fullSceneResult.probe,
      browserProbe: fullSceneResult.browserProbe,
      drawHistory: summarizeDrawHistory(fullSceneDrawHistory),
      passChecks: {
        base: hasTerrainPass(fullSceneDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0 }),
        blend: hasTerrainPass(fullSceneDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1 }),
      },
      textureDelta: fullSceneResult.textureDelta,
      screenshot: {
        width: fullSceneResult.screenshot?.width,
        height: fullSceneResult.screenshot?.height,
        centerPixel: fullSceneResult.screenshot?.centerPixel,
        coverage: fullSceneResult.screenshot?.coverage,
      },
    })}`);
  }
  const fullSceneBrowserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (fullSceneBrowserFailures.length > 0) {
    throw new Error(`browser failures during W3D terrain full scene: ${JSON.stringify(fullSceneBrowserFailures)}`);
  }

  let cameraPanResult;
  try {
    cameraPanResult = await withTimeout(
      "terrain visual camera-pan render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainVisualCameraPanScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsMaskPath,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain visual camera-pan render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: terrainCameraPanScreenshot });

  const cameraPanDrawHistory = Array.isArray(cameraPanResult.drawHistory)
    ? cameraPanResult.drawHistory
    : [];
  const cameraPanSecondFrameDraws = cameraPanDrawHistory.slice(2);
  if (!cameraPanResult.ok
      || cameraPanResult.command !== "ww3dTerrainVisualCameraPanScene"
      || cameraPanResult.probe?.source !== "ww3d_terrain_visual_camera_pan_scene_probe"
      || cameraPanResult.probe?.renderMode !== "selected-source-patch-camera-pan"
      || cameraPanResult.probe?.visual?.class !== "W3DTerrainVisual"
      || !cameraPanResult.probe?.visual?.loadPath?.includes("W3DTerrainVisual::load")
      || cameraPanResult.probe?.visual?.ownedTerrainRenderObject !== true
      || cameraPanResult.probe?.visual?.waterRenderObjectNull !== true
      || cameraPanResult.probe?.results?.loadWindowRenderSelected !== false
      || cameraPanResult.probe?.results?.patchReinitialized !== true
      || cameraPanResult.probe?.results?.cameraConfigured !== true
      || cameraPanResult.probe?.results?.cameraPanRequested !== true
      || cameraPanResult.probe?.results?.cameraPanMoved !== true
      || cameraPanResult.probe?.results?.cameraPanBeginRender !== 0
      || cameraPanResult.probe?.results?.cameraPanRender !== 0
      || cameraPanResult.probe?.results?.cameraPanEndRender !== 0
      || cameraPanResult.probe?.renderFrames?.count !== 2
      || cameraPanResult.probe?.renderFrames?.firstDrawIndexed < 2
      || cameraPanResult.probe?.renderFrames?.secondDrawIndexed < 4
      || cameraPanResult.probe?.renderFrames?.firstClear < 1
      || cameraPanResult.probe?.renderFrames?.secondClear < 2
      || cameraPanResult.probe?.camera?.pan?.targetX <= cameraPanResult.probe?.camera?.primary?.targetX
      || cameraPanResult.probe?.camera?.pan?.targetY >= cameraPanResult.probe?.camera?.primary?.targetY
      || cameraPanResult.probe?.camera?.pan?.eyeX <= cameraPanResult.probe?.camera?.primary?.eyeX
      || cameraPanResult.probe?.ini?.entry !== terrainIniEntry
      || cameraPanResult.probe?.ini?.loaded !== true
      || cameraPanResult.probe?.ini?.entryExists !== true
      || cameraPanResult.probe?.ini?.parsed !== true
      || cameraPanResult.probe?.ini?.parser !== terrainIniParser
      || cameraPanResult.probe?.ini?.originalIniParser !== true
      || cameraPanResult.probe?.ini?.terrainTypeCount <= 0
      || !iniLayoutMatches(cameraPanResult.probe?.iniLayout)
      || cameraPanResult.probe?.map?.entry !== mapEntry
      || cameraPanResult.probe?.map?.entryExists !== true
      || cameraPanResult.probe?.map?.entryOpenable !== true
      || cameraPanResult.probe?.map?.streamOpen !== true
      || cameraPanResult.probe?.map?.parsed !== true
      || cameraPanResult.probe?.map?.bytes <= 0
      || cameraPanResult.probe?.map?.width <= 16
      || cameraPanResult.probe?.map?.height <= 16
      || cameraPanResult.probe?.map?.heightChecksum <= 0
      || !logicalTerrainMatches(cameraPanResult.probe)
      || !cameraPanResult.probe?.scene?.renderPath?.includes("W3DDisplay::m_3DScene")
      || cameraPanResult.probe?.scene?.created !== true
      || cameraPanResult.probe?.scene?.objectAddedByVisualLoad !== true
      || cameraPanResult.probe?.scene?.path !== "W3DDisplay::m_3DScene"
      || cameraPanResult.probe?.scene?.terrainClassId !== 4
      || cameraPanResult.probe?.terrain?.tileSource !== "shipped-map-heightmap"
      || cameraPanResult.probe?.terrain?.renderObject !== "HeightMapRenderObjClass"
      || cameraPanResult.probe?.terrain?.verticesPerSide !== 33
      || cameraPanResult.probe?.terrain?.cellsPerSide !== 32
      || cameraPanResult.probe?.terrain?.tileDiagnostics?.sourceTilesLoaded <= 0
      || cameraPanResult.probe?.terrain?.tileDiagnostics?.sourceTilesPositioned <= 0
      || cameraPanResult.probe?.terrain?.tileDiagnostics?.patchCellsWithSource <= 0
      || cameraPanResult.probe?.terrain?.patchHeightChecksum <= 0
      || cameraPanResult.probe?.calls?.browserTextureCreate < 1
      || cameraPanResult.probe?.calls?.browserTextureUpdate < 1
      || cameraPanResult.probe?.calls?.drawIndexed < 4
      || cameraPanResult.probe?.calls?.clear < 2
      || cameraPanResult.probe?.draw?.vertexShaderFvf !== 578
      || cameraPanResult.probe?.draw?.vertexStride !== 32
      || cameraPanResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || cameraPanResult.browserProbe?.texture0?.sampled !== true
      || cameraPanDrawHistory.length < 4
      || !hasTerrainPass(cameraPanDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0, firstIndex: 0 })
      || !hasTerrainPass(cameraPanDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1, firstIndex: 1 })
      || !hasTerrainPass(cameraPanSecondFrameDraws, { alphaBlendEnable: 0, texCoordIndex: 0 })
      || !hasTerrainPass(cameraPanSecondFrameDraws, { alphaBlendEnable: 1, texCoordIndex: 1 })
      || cameraPanResult.textureDelta?.creates < 1
      || cameraPanResult.textureDelta?.updates < 1
      || cameraPanResult.textureDelta?.binds < 1
      || cameraPanResult.textureDelta?.samplerApplications < 1
      || cameraPanResult.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`W3D visual-owned terrain camera-pan render failed: ${JSON.stringify({
      ok: cameraPanResult.ok,
      probe: cameraPanResult.probe,
      browserProbe: cameraPanResult.browserProbe,
      drawHistory: summarizeDrawHistory(cameraPanDrawHistory),
      passChecks: {
        firstBase: hasTerrainPass(cameraPanDrawHistory, { alphaBlendEnable: 0, texCoordIndex: 0, firstIndex: 0 }),
        firstBlend: hasTerrainPass(cameraPanDrawHistory, { alphaBlendEnable: 1, texCoordIndex: 1, firstIndex: 1 }),
        secondBase: hasTerrainPass(cameraPanSecondFrameDraws, { alphaBlendEnable: 0, texCoordIndex: 0 }),
        secondBlend: hasTerrainPass(cameraPanSecondFrameDraws, { alphaBlendEnable: 1, texCoordIndex: 1 }),
      },
      textureDelta: cameraPanResult.textureDelta,
      screenshot: {
        width: cameraPanResult.screenshot?.width,
        height: cameraPanResult.screenshot?.height,
        centerPixel: cameraPanResult.screenshot?.centerPixel,
        coverage: cameraPanResult.screenshot?.coverage,
      },
    })}`);
  }
  const cameraPanBrowserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (cameraPanBrowserFailures.length > 0) {
    throw new Error(`browser failures during W3D visual terrain camera-pan scene: ${JSON.stringify(cameraPanBrowserFailures)}`);
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
      || !iniLayoutMatches(loadWindowResult.probe?.iniLayout)
      || loadWindowResult.probe?.map?.entry !== mapEntry
      || loadWindowResult.probe?.map?.entryExists !== true
      || loadWindowResult.probe?.map?.entryOpenable !== true
      || loadWindowResult.probe?.map?.streamOpen !== true
      || loadWindowResult.probe?.map?.parsed !== true
      || loadWindowResult.probe?.map?.bytes <= 0
      || loadWindowResult.probe?.map?.width <= 16
      || loadWindowResult.probe?.map?.height <= 16
      || loadWindowResult.probe?.map?.heightChecksum <= 0
      || !logicalTerrainMatches(loadWindowResult.probe)
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
        layout: terrainResult.probe.iniLayout,
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
      textures: {
        path: fullSceneArchiveMemfsMaskPath,
        entryCount: textureArchiveMounts.reduce((sum, archive) => sum + archive.entries.length, 0),
        optionalBasePresent: textureArchiveMounts.some((archive) => archive.optionalBase),
        mounted: textureArchiveMounts.map((archive) => ({
          name: archive.memfsName,
          path: archive.memfsPath,
          sourceArchive: archive.sourcePath,
          entryCount: archive.entries.length,
          optionalBase: archive.optionalBase,
        })),
      },
    },
    visual: terrainResult.probe.visual,
    logicalTerrain: terrainResult.probe.logicalTerrain,
    map: terrainResult.probe.map,
    scene: terrainResult.probe.scene,
    terrain: terrainResult.probe.terrain,
    visualShroudScreenshot: terrainVisualShroudScreenshot,
    visualShroudLogicalTerrain: visualShroudResult.probe.logicalTerrain,
    visualShroudVisual: visualShroudResult.probe.visual,
    visualShroudScene: visualShroudResult.probe.scene,
    visualShroudTerrain: visualShroudResult.probe.terrain,
    visualShroudShroud: visualShroudResult.probe.shroud,
    visualShroudCalls: visualShroudResult.probe.calls,
    visualShroudDraw: visualShroudResult.probe.draw,
    visualShroudDrawSequence: visualShroudResult.drawSequence,
    visualShroudCenterPixel: visualShroudResult.screenshot.centerPixel,
    visualShroudCoverage: visualShroudResult.screenshot.coverage,
    fullSceneScreenshot: terrainFullSceneScreenshot,
    fullSceneLogicalTerrain: fullSceneResult.probe.logicalTerrain,
    fullSceneVisual: fullSceneResult.probe.visual,
    fullSceneWater: fullSceneResult.probe.water,
    fullSceneScene: fullSceneResult.probe.scene,
    fullSceneTerrain: fullSceneResult.probe.terrain,
    fullSceneCalls: fullSceneResult.probe.calls,
    fullSceneDraw: fullSceneResult.probe.draw,
    fullSceneCenterPixel: fullSceneResult.screenshot.centerPixel,
    fullSceneCoverage: fullSceneResult.screenshot.coverage,
    cameraPanScreenshot: terrainCameraPanScreenshot,
    cameraPanLogicalTerrain: cameraPanResult.probe.logicalTerrain,
    cameraPanScene: cameraPanResult.probe.scene,
    cameraPanTerrain: cameraPanResult.probe.terrain,
    cameraPanCamera: cameraPanResult.probe.camera,
    cameraPanFrames: cameraPanResult.probe.renderFrames,
    cameraPanCalls: cameraPanResult.probe.calls,
    cameraPanDraw: cameraPanResult.probe.draw,
    cameraPanCenterPixel: cameraPanResult.screenshot.centerPixel,
    cameraPanCoverage: cameraPanResult.screenshot.coverage,
    loadWindowScreenshot: terrainLoadWindowScreenshot,
    loadWindowLogicalTerrain: loadWindowResult.probe.logicalTerrain,
    loadWindowVisual: loadWindowResult.probe.visual,
    loadWindowMap: loadWindowResult.probe.map,
    loadWindowScene: loadWindowResult.probe.scene,
    loadWindowTerrain: loadWindowResult.probe.terrain,
    loadWindowIniLayout: loadWindowResult.probe.iniLayout,
    loadWindowCalls: loadWindowResult.probe.calls,
    loadWindowDraw: loadWindowResult.probe.draw,
    loadWindowCenterPixel: loadWindowResult.screenshot.centerPixel,
    loadWindowCoverage: loadWindowResult.screenshot.coverage,
    calls: terrainResult.probe.calls,
    draw: terrainResult.probe.draw,
    centerPixel: terrainResult.screenshot.centerPixel,
    coverage: terrainResult.screenshot.coverage,
    renderer: "original W3DTerrainVisual::load owns WorldHeightMap + HeightMapRenderObjClass scene attachment, with visual-owned W3DShroud material pass coverage, then W3DDisplay::m_3DScene renders through browser D3D8/WebGL2",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
