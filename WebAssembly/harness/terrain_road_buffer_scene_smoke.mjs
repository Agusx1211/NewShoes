#!/usr/bin/env node
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultIniArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const defaultMapsArchivePath = resolve(wasmRoot, "artifacts/real-assets/MapsZH.big");
const defaultTerrainArchivePath = resolve(wasmRoot, "artifacts/real-assets/TerrainZH.big");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const mapsArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultMapsArchivePath);
const terrainArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultTerrainArchivePath);
const textureArchivePath = resolve(wasmRoot, process.argv[5] ?? defaultTextureArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-road-buffer-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-road-buffer-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsPath = `${runtimeArchivePath}/TerrainZH.big`;
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const roadsIniEntry = "Data\\INI\\Roads.ini";
const mapEntry = process.env.CNC_PORT_ROAD_MAP_ENTRY ?? "Maps\\MD_CHI01\\MD_CHI01.map";
const roadsIniBytes = 30946;

function summarizeDrawHistory(drawHistory) {
  if (!Array.isArray(drawHistory)) {
    return [];
  }
  return drawHistory.map((draw, index) => ({
    index,
    ok: draw?.ok,
    primitiveType: draw?.primitiveType,
    vertexShaderFvf: draw?.vertexShaderFvf,
    vertexStride: draw?.vertexStride,
    vertexCount: draw?.vertexCount,
    indexCount: draw?.indexCount,
    alphaBlendEnable: draw?.renderState?.alphaBlendEnable,
    zEnable: draw?.renderState?.zEnable,
    zWriteEnable: draw?.renderState?.zWriteEnable,
    zFunc: draw?.renderState?.zFunc,
    cullMode: draw?.renderState?.cullMode,
    colorWriteEnable: draw?.renderState?.colorWriteEnable,
    texture0Id: draw?.texture0?.id,
    texture0Sampled: draw?.texture0?.sampled,
    texture0TexCoordIndex: draw?.texture0?.texCoordIndex,
    texture0TexCoordSet: draw?.texture0?.texCoordSet,
    texture1Id: draw?.texture1?.id,
    texture1Sampled: draw?.texture1?.sampled,
    texture1TexCoordIndex: draw?.texture1?.texCoordIndex,
    texture1TexCoordSet: draw?.texture1?.texCoordSet,
    projected: draw?.vertexSummary?.projected,
    triangles: draw?.vertexSummary?.triangles,
    positionBounds: draw?.vertexSummary?.positionBounds,
    diffuse: draw?.vertexSummary?.diffuse,
    cull: draw?.appliedRenderState?.cull,
    depth: draw?.appliedRenderState?.depth,
    blend: draw?.appliedRenderState?.blend,
    colorWrite: draw?.appliedRenderState?.colorWrite,
    texture0SamplePixels: draw?.texture0?.samplePixels,
    texture0SampleVertexPixels: draw?.texture0?.sampleVertexPixels,
    texture1SamplePixels: draw?.texture1?.samplePixels,
    texture1SampleVertexPixels: draw?.texture1?.sampleVertexPixels,
    preDrawCenterPixel: draw?.preDrawCenterPixel,
    centerPixel: draw?.centerPixel,
  }));
}

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
const mapsArchiveEntries = await listBigArchiveEntries(mapsArchivePath);
const mapArchiveEntry = mapsArchiveEntries
  .find((entry) => entry.name.toLowerCase() === mapEntry.toLowerCase());
if (!mapArchiveEntry) {
  throw new Error(`Maps archive is missing selected map entry ${mapEntry}: ${mapsArchivePath}`);
}
const mapEntryBytes = mapArchiveEntry.bytes;
const terrainArchiveEntries = (await listBigArchiveEntries(terrainArchivePath))
  .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
const roadTextureEntries = (await listBigArchiveEntries(textureArchivePath))
  .filter((entry) => /^Art\\Textures\\tr.*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
if (terrainArchiveEntries.length === 0) {
  throw new Error(`Terrain archive has no Art\\Terrain image entries: ${terrainArchivePath}`);
}
if (roadTextureEntries.length === 0) {
  throw new Error(`Texture archive has no road-like Art\\Textures\\tr* entries: ${textureArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
const mapsArchiveRelativePath = relative(wasmRoot, mapsArchivePath).split(sep).join("/");
const terrainArchiveRelativePath = relative(wasmRoot, terrainArchivePath).split(sep).join("/");
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
  const iniArchiveUrl = new URL(iniArchiveRelativePath, server.url).href;
  const mapsArchiveUrl = new URL(mapsArchiveRelativePath, server.url).href;
  const terrainArchiveUrl = new URL(terrainArchiveRelativePath, server.url).href;
  const textureArchiveUrl = new URL(textureArchiveRelativePath, server.url).href;

  await withTimeout(
    "terrain road-buffer scene harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain road-buffer scene RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain road-buffer scene boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "W3D road-buffer scene drawRoads render smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D road-buffer scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    "terrain road-buffer scene archive mount RPC",
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
            entries: [terrainIniEntry, roadsIniEntry],
          },
          {
            url: mapsArchiveUrl,
            name: "MapsZH.big",
            expectedSourceBytes: mapsArchiveStat.size,
            sourceArchive: mapsArchivePath,
            entries: [mapEntry],
          },
          {
            url: terrainArchiveUrl,
            name: "TerrainZH.big",
            expectedSourceBytes: terrainArchiveStat.size,
            sourceArchive: terrainArchivePath,
            entries: terrainArchiveEntries,
          },
          {
            url: textureArchiveUrl,
            name: "TexturesZH.big",
            expectedSourceBytes: textureArchiveStat.size,
            sourceArchive: textureArchivePath,
            entries: roadTextureEntries,
          },
        ],
      }),
    120000,
  );
  const mountedArchives = archiveMountResult.archiveSet?.archives ?? [];
  const rangeIniArchive = mountedArchives[0];
  const rangeMapsArchive = mountedArchives[1];
  const rangeTerrainArchive = mountedArchives[2];
  const rangeTextureArchive = mountedArchives[3];
  const findMountedEntry = (archive, entryName) =>
    archive?.entries?.find((entry) => entry.path.toLowerCase() === entryName.toLowerCase());
  const terrainIniMountedEntry = findMountedEntry(rangeIniArchive, terrainIniEntry);
  const roadsIniMountedEntry = findMountedEntry(rangeIniArchive, roadsIniEntry);
  const mapMountedEntry = findMountedEntry(rangeMapsArchive, mapEntry);
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 4
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeMapsArchive?.path !== mapsArchiveMemfsPath
      || rangeTerrainArchive?.path !== terrainArchiveMemfsPath
      || rangeTextureArchive?.path !== textureArchiveMemfsPath
      || terrainIniMountedEntry?.bytes !== 25758
      || terrainIniMountedEntry?.reader !== "browser fetch Range"
      || roadsIniMountedEntry?.bytes !== roadsIniBytes
      || roadsIniMountedEntry?.reader !== "browser fetch Range"
      || mapMountedEntry?.bytes !== mapEntryBytes
      || mapMountedEntry?.reader !== "browser fetch Range") {
    throw new Error(`Runtime terrain road-buffer scene archives mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let result;
  try {
    result = await withTimeout(
      "terrain road-buffer scene render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainRoadBufferScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsPath,
          runtimeArchiveDirectory: `${runtimeArchivePath}/`,
          runtimeArchiveMask: "*.big",
          mapEntry,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain road-buffer scene render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  if (!result.ok
      || result.command !== "ww3dTerrainRoadBufferScene"
      || result.probe?.source !== "ww3d_terrain_road_buffer_scene_probe"
      || result.probe?.path !== "original WorldHeightMap + HeightMapRenderObjClass::Render -> ProbeHeightMapRenderObjWithRoadBuffer::Render -> W3DRoadBuffer::drawRoads"
      || result.probe?.results?.runtimeAssetSystemInstalled !== true
      || result.probe?.results?.roadBufferInstalled !== true
      || result.probe?.results?.loadRoadsInvoked !== true
      || result.probe?.results?.roadSceneDrawFlushed !== true
      || result.probe?.ini?.roadsParsed !== true
      || result.probe?.ini?.roadCount <= 0
      || !iniLayoutMatches(result.probe?.iniLayout)
      || result.probe?.map?.entry !== mapEntry
      || result.probe?.map?.parsed !== true
      || result.probe?.logicalTerrain?.loadReturned !== true
      || result.probe?.logicalTerrain?.loadException !== false
      || result.probe?.logicalTerrain?.sourceFilenameMatches !== true
      || result.probe?.logicalTerrain?.mapObjectsPresentAfterLoad !== true
      || result.probe?.logicalTerrain?.mapObjectsUsed !== true
      || result.probe?.logicalTerrain?.roadPairsWithRoadType <= 0
      || result.probe?.logicalTerrain?.timeOfDayNotified !== true
      || result.probe?.logicalTerrain?.notifiedTimeOfDay !== result.probe?.logicalTerrain?.mapTimeOfDay
      || result.probe?.results?.roadPairMapObjectsInstalled !== false
      || result.probe?.terrain?.renderObject !== "ProbeHeightMapRenderObjWithRoadBuffer"
      || result.probe?.roadObjects?.pairs <= 0
      || result.probe?.roadObjects?.pairsWithRoadType <= 0
      || result.probe?.roads?.afterLoad <= 0
      || result.probe?.roads?.typesWithDrawData <= 0
      || result.probe?.scene?.renderPath?.includes("W3DRoadBuffer::drawRoads") !== true
      || result.probe?.draw?.vertexShaderFvf !== 322
      || result.probe?.draw?.vertexStride !== 24
      || result.browserProbe?.vertexShaderFvf !== 322
      || result.browserProbe?.vertexStride !== 24
      || result.browserProbe?.texture0?.sampled !== true
      || result.browserProbe?.vertexDiagnostics?.projected?.visible <= 0
      || result.drawSequence?.roadAfterTerrain !== true
      || result.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`terrain road-buffer scene smoke failed: ${JSON.stringify({
      ok: result.ok,
      probeOk: result.probe?.ok,
      map: result.probe?.map,
      logicalTerrain: result.probe?.logicalTerrain,
      terrain: result.probe?.terrain,
      roadObjects: result.probe?.roadObjects,
      roads: result.probe?.roads,
      results: result.probe?.results,
      draw: result.probe?.draw,
      browserProbe: {
        ok: result.browserProbe?.ok,
        vertexShaderFvf: result.browserProbe?.vertexShaderFvf,
        vertexStride: result.browserProbe?.vertexStride,
        projected: result.browserProbe?.vertexDiagnostics?.projected,
        texture0: result.browserProbe?.texture0,
        centerPixel: result.browserProbe?.centerPixel,
      },
      drawSequence: result.drawSequence,
      drawHistory: summarizeDrawHistory(result.drawHistory),
      bufferDelta: result.bufferDelta,
      textureDelta: result.textureDelta,
      coverage: result.screenshot?.coverage,
    })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-road-buffer-scene",
    reader: "browser Range subset BIGs loaded by runtime-owned Win32BIGFileSystem",
    archives: {
      ini: {
        path: rangeIniArchive.path,
        terrainEntry: terrainIniEntry,
        roadsEntry: roadsIniEntry,
        parser: "GameEngine/Common/INI.cpp::load + INITerrain.cpp + INITerrainRoad.cpp + INITerrainBridge.cpp + TerrainRoads.cpp",
        originalIniParser: true,
        terrainTypeCount: result.probe.ini.terrainTypeCount,
        roadCount: result.probe.ini.roadCount,
        bridgeCount: result.probe.ini.bridgeCount,
        layout: result.probe.iniLayout,
      },
      maps: { path: rangeMapsArchive.path, entry: mapEntry },
      terrain: { path: rangeTerrainArchive.path, terrainImageEntries: terrainArchiveEntries.length },
      textures: { path: rangeTextureArchive.path, roadTextureEntries },
    },
    probe: result.probe,
    map: result.probe.map,
    logicalTerrain: result.probe.logicalTerrain,
    terrain: result.probe.terrain,
    scene: result.probe.scene,
    roadObjects: result.probe.roadObjects,
    roads: result.probe.roads,
    calls: result.probe.calls,
    draw: result.probe.draw,
    browserProbe: result.browserProbe,
    drawSequence: result.drawSequence,
    coverage: result.screenshot.coverage,
    bufferDelta: result.bufferDelta,
    textureDelta: result.textureDelta,
    screenshot: screenshotPath,
  }));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
