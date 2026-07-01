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
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/W3DZH.big");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const mapsArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultMapsArchivePath);
const terrainArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultTerrainArchivePath);
const archivePath = resolve(wasmRoot, process.argv[5] ?? defaultArchivePath);
const textureArchivePath = resolve(wasmRoot, process.argv[6] ?? defaultTextureArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-prop-buffer-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-prop-buffer-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsPath = `${runtimeArchivePath}/TerrainZH.big`;
const meshArchiveMemfsPath = `${runtimeArchivePath}/W3DZH.big`;
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const terrainIniParser = "GameEngine/Common/INI.cpp::load + INITerrain.cpp";
const mapEntry = "Maps\\MD_GLA03\\MD_GLA03.map";
const mapEntryBytes = 295065;
const propMeshEntry = "Art\\W3D\\CINE_Moon.W3D";
const propTextureEntry = "Art\\Textures\\cine_moon.dds";

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
const archiveStat = await checkedArchive(archivePath, "W3D archive");
const textureArchiveStat = await checkedArchive(textureArchivePath, "Texture archive");
const terrainArchiveEntries = (await listBigArchiveEntries(terrainArchivePath))
  .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
if (terrainArchiveEntries.length === 0) {
  throw new Error(`Terrain archive has no Art\\Terrain image entries: ${terrainArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
const mapsArchiveRelativePath = relative(wasmRoot, mapsArchivePath).split(sep).join("/");
const terrainArchiveRelativePath = relative(wasmRoot, terrainArchivePath).split(sep).join("/");
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
  const iniArchiveUrl = new URL(iniArchiveRelativePath, server.url).href;
  const mapsArchiveUrl = new URL(mapsArchiveRelativePath, server.url).href;
  const terrainArchiveUrl = new URL(terrainArchiveRelativePath, server.url).href;
  const archiveUrl = new URL(archiveRelativePath, server.url).href;
  const textureArchiveUrl = new URL(textureArchiveRelativePath, server.url).href;

  await withTimeout(
    "terrain prop-buffer scene harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain prop-buffer scene RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain prop-buffer scene boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "W3D prop-buffer scene drawProps render smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D prop-buffer scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    "terrain prop-buffer scene archive mount RPC",
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
          {
            url: terrainArchiveUrl,
            name: "TerrainZH.big",
            expectedSourceBytes: terrainArchiveStat.size,
            sourceArchive: terrainArchivePath,
            entries: terrainArchiveEntries,
          },
          {
            url: archiveUrl,
            name: "W3DZH.big",
            expectedSourceBytes: archiveStat.size,
            sourceArchive: archivePath,
            entries: [propMeshEntry],
          },
          {
            url: textureArchiveUrl,
            name: "TexturesZH.big",
            expectedSourceBytes: textureArchiveStat.size,
            sourceArchive: textureArchivePath,
            entries: [propTextureEntry],
          },
        ],
      }),
    120000,
  );
  const mountedArchives = archiveMountResult.archiveSet?.archives ?? [];
  const rangeIniArchive = mountedArchives[0];
  const rangeMapsArchive = mountedArchives[1];
  const rangeTerrainArchive = mountedArchives[2];
  const rangeMeshArchive = mountedArchives[3];
  const rangeTextureArchive = mountedArchives[4];
  const terrainIniMountedEntry = rangeIniArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === terrainIniEntry.toLowerCase());
  const mapMountedEntry = rangeMapsArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === mapEntry.toLowerCase());
  const firstTerrainMountedEntry = rangeTerrainArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === terrainArchiveEntries[0].toLowerCase());
  const meshMountedEntry = rangeMeshArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === propMeshEntry.toLowerCase());
  const textureMountedEntry = rangeTextureArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === propTextureEntry.toLowerCase());
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 5
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeMapsArchive?.path !== mapsArchiveMemfsPath
      || rangeTerrainArchive?.path !== terrainArchiveMemfsPath
      || rangeMeshArchive?.path !== meshArchiveMemfsPath
      || rangeTextureArchive?.path !== textureArchiveMemfsPath
      || terrainIniMountedEntry?.bytes !== 25758
      || terrainIniMountedEntry?.reader !== "browser fetch Range"
      || mapMountedEntry?.bytes !== mapEntryBytes
      || mapMountedEntry?.reader !== "browser fetch Range"
      || firstTerrainMountedEntry?.bytes <= 0
      || firstTerrainMountedEntry?.reader !== "browser fetch Range"
      || meshMountedEntry?.bytes <= 0
      || meshMountedEntry?.reader !== "browser fetch Range"
      || textureMountedEntry?.bytes <= 0
      || textureMountedEntry?.reader !== "browser fetch Range") {
    throw new Error(`Runtime terrain prop-buffer scene archives mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let result;
  try {
    result = await withTimeout(
      "terrain prop-buffer scene render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainPropBufferScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsPath,
          archivePath: meshArchiveMemfsPath,
          textureArchivePath: textureArchiveMemfsPath,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain prop-buffer scene render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  if (!result.ok
      || result.command !== "ww3dTerrainPropBufferScene"
      || result.probe?.source !== "ww3d_terrain_prop_buffer_scene_probe"
      || !result.probe?.path?.includes("W3DPropBuffer::drawProps")
      || !result.probe?.path?.includes("RTS3DScene::Flush")
      || result.probe?.asset?.model !== "CINE_MOON"
      || result.probe?.results?.runtimeAssetSystemInstalled !== true
      || result.probe?.results?.textureFileFactoryInstalled !== true
      || result.probe?.results?.meshFileExists !== true
      || result.probe?.results?.textureFileExists !== true
      || result.probe?.results?.renderObjectInitialized !== true
      || result.probe?.results?.propBufferInstalled !== true
      || result.probe?.results?.propBufferInitialized !== true
      || result.probe?.results?.addPropInvoked !== true
      || result.probe?.results?.updateCenterInvoked !== true
      || result.probe?.results?.propRenderObjectClassId !== 0
      || result.probe?.results?.propMeshNormalized !== true
      || result.probe?.results?.propVisibleAfterScene !== true
      || result.probe?.results?.propSceneDrawFlushed !== true
      || result.probe?.ini?.parser !== terrainIniParser
      || result.probe?.ini?.originalIniParser !== true
      || result.probe?.ini?.terrainTypeCount <= 0
      || !iniLayoutMatches(result.probe?.iniLayout)
      || result.probe?.map?.entry !== mapEntry
      || result.probe?.map?.parsed !== true
      || result.probe?.map?.bytes <= 0
      || result.probe?.terrain?.renderObject !== "ProbeHeightMapRenderObjWithPropBuffer"
      || result.probe?.terrain?.verticesPerSide !== 33
      || result.probe?.terrain?.cellsPerSide !== 32
      || result.probe?.terrain?.tileDiagnostics?.sourceTilesLoaded <= 0
      || result.probe?.terrain?.tileDiagnostics?.sourceTilesPositioned <= 0
      || result.probe?.terrain?.tileDiagnostics?.patchCellsWithSource <= 0
      || !result.probe?.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
      || !result.probe?.scene?.renderPath?.includes("W3DPropBuffer::drawProps")
      || result.probe?.scene?.created !== true
      || result.probe?.scene?.objectAdded !== true
      || result.probe?.scene?.terrainClassId !== 4
      || result.probe?.props?.afterAdd !== 1
      || result.probe?.props?.typesAfterAdd !== 1
      || result.probe?.props?.afterClear !== 0
      || result.probe?.calls?.drawIndexed < 3
      || result.probe?.draw?.vertexShaderFvf !== 594
      || result.probe?.draw?.vertexStride !== 44
      || result.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || result.browserProbe?.ok !== true
      || result.browserProbe?.usedPersistentBuffers !== true
      || result.browserProbe?.usedTransforms !== true
      || result.browserProbe?.vertexShaderFvf !== 594
      || result.browserProbe?.vertexStride !== 44
      || result.browserProbe?.texture0?.sampled !== true
      || result.drawSequence?.propAfterTerrain !== true
      || result.bufferDelta?.creates < 4
      || result.bufferDelta?.updates < 4
      || result.textureDelta?.creates < 2
      || result.textureDelta?.updates < 2
      || result.textureDelta?.binds < 1
      || result.textureDelta?.samplerApplications < 1
      || result.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`W3D prop-buffer scene drawProps render failed: ${JSON.stringify({
      ok: result.ok,
      probe: result.probe,
      browserProbe: result.browserProbe,
      drawSequence: result.drawSequence,
      drawHistory: result.drawHistory,
      bufferDelta: result.bufferDelta,
      textureDelta: result.textureDelta,
      screenshot: {
        width: result.screenshot?.width,
        height: result.screenshot?.height,
        centerPixel: result.screenshot?.centerPixel,
        coverage: result.screenshot?.coverage,
      },
    })}`);
  }

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during W3D prop-buffer scene: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-prop-buffer-scene",
    url: harnessUrl,
    screenshot: screenshotPath,
    archiveSet: archiveMountResult.archiveSet,
    archives: {
      ini: {
        path: iniArchiveMemfsPath,
        entry: terrainIniEntry,
        parser: result.probe.ini.parser,
        originalIniParser: result.probe.ini.originalIniParser,
        terrainTypeCount: result.probe.ini.terrainTypeCount,
        layout: result.probe.iniLayout,
      },
      maps: {
        path: mapsArchiveMemfsPath,
        entry: mapEntry,
      },
      terrain: {
        path: terrainArchiveMemfsPath,
        entryCount: terrainArchiveEntries.length,
      },
      mesh: {
        path: meshArchiveMemfsPath,
        entry: propMeshEntry,
      },
      texture: {
        path: textureArchiveMemfsPath,
        entry: propTextureEntry,
      },
    },
    map: result.probe.map,
    terrain: result.probe.terrain,
    scene: result.probe.scene,
    props: result.probe.props,
    calls: result.probe.calls,
    draw: result.probe.draw,
    browserProbe: result.browserProbe,
    drawSequence: result.drawSequence,
    bufferDelta: result.bufferDelta,
    textureDelta: result.textureDelta,
    coverage: result.screenshot.coverage,
    renderer: "original WorldHeightMap + HeightMapRenderObjClass::Render -> W3DPropBuffer::drawProps -> RTS3DScene::Flush -> browser D3D8/WebGL2 prop mesh draw",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
