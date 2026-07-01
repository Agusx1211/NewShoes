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
const defaultW3DArchivePath = resolve(wasmRoot, "artifacts/real-assets/W3DZH.big");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const mapsArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultMapsArchivePath);
const terrainArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultTerrainArchivePath);
const w3dArchivePath = resolve(wasmRoot, process.argv[5] ?? defaultW3DArchivePath);
const textureArchivePath = resolve(wasmRoot, process.argv[6] ?? defaultTextureArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-bridge-buffer-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-bridge-buffer-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsPath = `${runtimeArchivePath}/TerrainZH.big`;
const w3dArchiveMemfsPath = `${runtimeArchivePath}/W3DZH.big`;
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const roadsIniEntry = "Data\\INI\\Roads.ini";
const mapEntry = process.env.CNC_PORT_BRIDGE_MAP_ENTRY ?? "Maps\\MD_CHI01\\MD_CHI01.map";
const renderTimeoutMs = Number(process.env.CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS ?? 240000);
const D3DCMP_EQUAL = 3;
const D3DTSS_TCI_CAMERASPACEPOSITION = 0x00020000;
const D3DTTFF_COUNT2 = 2;

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
    texture0Id: draw?.texture0?.id,
    texture0Sampled: draw?.texture0?.sampled,
    texture0TexCoordIndex: draw?.texture0?.texCoordIndex,
    texture0TextureTransformFlags: draw?.texture0?.textureTransformFlags,
    projected: draw?.vertexSummary?.projected,
    triangles: draw?.vertexSummary?.triangles,
    positionBounds: draw?.vertexSummary?.positionBounds,
    diffuse: draw?.vertexSummary?.diffuse,
    centerPixel: draw?.centerPixel,
  }));
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

async function readBigArchive(path) {
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

  return { archiveBytes, entries };
}

function findEntry(entries, entryName) {
  return entries.find((entry) => entry.name.toLowerCase() === entryName.toLowerCase());
}

function uniqueSorted(entries) {
  return [...new Map(entries.map((entry) => [entry.toLowerCase(), entry])).values()].sort((left, right) =>
    left.localeCompare(right));
}

function parseBridgeAssetNames(roadsIniText) {
  const models = [];
  const textures = [];
  const bridgeBlock = /^\s*Bridge\s+[^\r\n]+([\s\S]*?)^\s*End\s*$/gmi;
  let match;
  while ((match = bridgeBlock.exec(roadsIniText))) {
    const body = match[1];
    for (const key of [
      "BridgeModelName",
      "BridgeModelNameDamaged",
      "BridgeModelNameReallyDamaged",
      "BridgeModelNameBroken",
    ]) {
      const field = new RegExp(`^\\s*${key}\\s*=\\s*([^\\r\\n]+)`, "mi").exec(body);
      if (field?.[1]?.trim()) {
        models.push(field[1].trim());
      }
    }
    for (const key of [
      "Texture",
      "TextureDamaged",
      "TextureReallyDamaged",
      "TextureBroken",
    ]) {
      const field = new RegExp(`^\\s*${key}\\s*=\\s*([^\\r\\n]+)`, "mi").exec(body);
      if (field?.[1]?.trim()) {
        textures.push(field[1].trim());
      }
    }
  }
  return { models: uniqueSorted(models), textures: uniqueSorted(textures) };
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
const w3dArchiveStat = await checkedArchive(w3dArchivePath, "W3D archive");
const textureArchiveStat = await checkedArchive(textureArchivePath, "Texture archive");
const iniArchive = await readBigArchive(iniArchivePath);
const mapsArchive = await readBigArchive(mapsArchivePath);
const terrainArchive = await readBigArchive(terrainArchivePath);
const w3dArchive = await readBigArchive(w3dArchivePath);
const textureArchive = await readBigArchive(textureArchivePath);
const roadsIniArchiveEntry = findEntry(iniArchive.entries, roadsIniEntry);
if (!roadsIniArchiveEntry) {
  throw new Error(`INI archive is missing ${roadsIniEntry}: ${iniArchivePath}`);
}
const roadsIniText = iniArchive.archiveBytes.toString(
  "latin1",
  roadsIniArchiveEntry.sourceOffset,
  roadsIniArchiveEntry.sourceOffset + roadsIniArchiveEntry.bytes,
);
const mapArchiveEntry = findEntry(mapsArchive.entries, mapEntry);
if (!mapArchiveEntry) {
  throw new Error(`Maps archive is missing selected map entry ${mapEntry}: ${mapsArchivePath}`);
}

const bridgeAssets = parseBridgeAssetNames(roadsIniText);
const terrainArchiveEntries = terrainArchive.entries
  .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
const w3dEntriesByLower = new Map(w3dArchive.entries.map((entry) => [entry.name.toLowerCase(), entry.name]));
const textureEntriesByLower = new Map(textureArchive.entries.map((entry) => [entry.name.toLowerCase(), entry.name]));
const bridgeModelEntries = bridgeAssets.models
  .flatMap((model) => [`Art\\W3D\\${model}.w3d`, `Art\\W3D\\${model}.W3D`])
  .map((entry) => w3dEntriesByLower.get(entry.toLowerCase()))
  .filter(Boolean);
const broadBridgeModelEntries = w3dArchive.entries
  .filter((entry) => /^Art\\W3D\\.*(?:bridge|bridg|brdg|tbdoub|tampico).*\.(?:w3d)$/i.test(entry.name))
  .map((entry) => entry.name);
const bridgeTextureEntries = bridgeAssets.textures
  .flatMap((texture) => {
    const base = `Art\\Textures\\${texture}`;
    return [base, base.replace(/\.[^.\\]+$/i, ".dds"), base.replace(/\.[^.\\]+$/i, ".tga")];
  })
  .map((entry) => textureEntriesByLower.get(entry.toLowerCase()))
  .filter(Boolean);
const broadBridgeTextureEntries = textureArchive.entries
  .filter((entry) => /^Art\\Textures\\.*(?:bridge|bridg|brdg|tbdoub|tampico).*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
const w3dArchiveEntries = uniqueSorted([
  "Art\\W3D\\Models.txt",
  ...bridgeModelEntries,
  ...broadBridgeModelEntries,
].filter((entry) => w3dEntriesByLower.has(entry.toLowerCase())));
const textureArchiveEntries = uniqueSorted([
  ...bridgeTextureEntries,
  ...broadBridgeTextureEntries,
]);
if (terrainArchiveEntries.length === 0) {
  throw new Error(`Terrain archive has no Art\\Terrain image entries: ${terrainArchivePath}`);
}
if (w3dArchiveEntries.length === 0) {
  throw new Error(`W3D archive has no bridge-like model entries: ${w3dArchivePath}`);
}
if (textureArchiveEntries.length === 0) {
  throw new Error(`Texture archive has no bridge-like texture entries: ${textureArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
const mapsArchiveRelativePath = relative(wasmRoot, mapsArchivePath).split(sep).join("/");
const terrainArchiveRelativePath = relative(wasmRoot, terrainArchivePath).split(sep).join("/");
const w3dArchiveRelativePath = relative(wasmRoot, w3dArchivePath).split(sep).join("/");
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
  const w3dArchiveUrl = new URL(w3dArchiveRelativePath, server.url).href;
  const textureArchiveUrl = new URL(textureArchiveRelativePath, server.url).href;

  await withTimeout(
    "terrain bridge-buffer scene harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain bridge-buffer scene RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain bridge-buffer scene boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "W3D bridge-buffer scene renderBridge smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D bridge-buffer scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    "terrain bridge-buffer scene archive mount RPC",
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
            url: w3dArchiveUrl,
            name: "W3DZH.big",
            expectedSourceBytes: w3dArchiveStat.size,
            sourceArchive: w3dArchivePath,
            entries: w3dArchiveEntries,
          },
          {
            url: textureArchiveUrl,
            name: "TexturesZH.big",
            expectedSourceBytes: textureArchiveStat.size,
            sourceArchive: textureArchivePath,
            entries: textureArchiveEntries,
          },
        ],
      }),
    120000,
  );
  const mountedArchives = archiveMountResult.archiveSet?.archives ?? [];
  const rangeIniArchive = mountedArchives[0];
  const rangeMapsArchive = mountedArchives[1];
  const rangeTerrainArchive = mountedArchives[2];
  const rangeW3DArchive = mountedArchives[3];
  const rangeTextureArchive = mountedArchives[4];
  const findMountedEntry = (archive, entryName) =>
    archive?.entries?.find((entry) => entry.path.toLowerCase() === entryName.toLowerCase());
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
      || rangeW3DArchive?.path !== w3dArchiveMemfsPath
      || rangeTextureArchive?.path !== textureArchiveMemfsPath
      || findMountedEntry(rangeIniArchive, terrainIniEntry)?.bytes !== 25758
      || findMountedEntry(rangeIniArchive, roadsIniEntry)?.bytes !== roadsIniArchiveEntry.bytes
      || findMountedEntry(rangeMapsArchive, mapEntry)?.bytes !== mapArchiveEntry.bytes) {
    throw new Error(`Runtime terrain bridge-buffer scene archives mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let result;
  try {
    result = await withTimeout(
      "terrain bridge-buffer scene render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainBridgeBufferScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsPath,
          runtimeArchiveDirectory: `${runtimeArchivePath}/`,
          runtimeArchiveMask: "*.big",
          mapEntry,
        }),
      renderTimeoutMs,
    );
  } catch (error) {
    throw new Error(`terrain bridge-buffer scene render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  if (!result.ok
      || result.command !== "ww3dTerrainBridgeBufferScene"
      || result.probe?.source !== "ww3d_terrain_bridge_buffer_scene_probe"
      || result.probe?.path !== "original WorldHeightMap + HeightMapRenderObjClass::Render -> W3DBridgeBuffer::loadBridges/updateCenter/drawBridges(FALSE) -> W3DBridge::renderBridge + bridge shroud overlay"
      || result.probe?.results?.runtimeAssetSystemInstalled !== true
      || result.probe?.results?.bridgeBufferInstalled !== true
      || result.probe?.results?.loadBridgesInvoked !== true
      || result.probe?.results?.terrainLogicClearedForDraw !== true
      || result.probe?.results?.bridgeDrawWrapperInvoked !== true
      || result.probe?.results?.bridgeDrawWrapperWireframe !== false
      || result.probe?.results?.bridgeTerrainRenderObjectPinned !== true
      || result.probe?.results?.bridgeShroudOverlaySuppressed !== false
      || result.probe?.results?.bridgeShroudTextureReady !== true
      || result.probe?.results?.bridgeShroudDrawSeen !== true
      || (result.probe?.results?.bridgeDrawCallDelta ?? 0) < 2
      || result.probe?.results?.bridgeSceneDrawFlushed !== true
      || result.probe?.ini?.roadsParsed !== true
      || result.probe?.ini?.bridgeCount <= 0
      || !iniLayoutMatches(result.probe?.iniLayout)
      || result.probe?.map?.entry !== mapEntry
      || result.probe?.map?.parsed !== true
      || result.probe?.terrain?.renderObject !== "ProbeHeightMapRenderObjWithBridgeBuffer"
      || result.probe?.bridgeObjects?.pairs <= 0
      || result.probe?.bridgeObjects?.pairsWithBridgeType <= 0
      || result.probe?.bridgeObjects?.selectedModelAvailable !== true
      || result.probe?.bridgeObjects?.selectedTextureAvailable !== true
      || result.probe?.bridges?.afterLoad <= 0
      || result.probe?.bridges?.verticesAfterUpdate <= 0
      || result.probe?.bridges?.indicesAfterUpdate <= 0
      || result.probe?.scene?.renderPath?.includes("W3DBridgeBuffer::drawBridges(FALSE)") !== true
      || result.probe?.scene?.renderPath?.includes("W3DBridge::renderBridge") !== true
      || result.probe?.draw?.vertexShaderFvf !== 338
      || result.probe?.draw?.vertexStride !== 36
      || result.browserProbe?.vertexShaderFvf !== 338
      || result.browserProbe?.vertexStride !== 36
      || result.browserProbe?.texture0?.sampled !== true
      || result.browserProbe?.renderState?.zFunc !== D3DCMP_EQUAL
      || result.browserProbe?.texture0?.texCoordIndex !== D3DTSS_TCI_CAMERASPACEPOSITION
      || result.browserProbe?.texture0?.textureTransformFlags !== D3DTTFF_COUNT2
      || result.browserProbe?.vertexDiagnostics?.projected?.visible <= 0
      || result.drawSequence?.bridgeAfterTerrain !== true
      || result.drawSequence?.bridgeShroudAfterBridge !== true
      || result.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`terrain bridge-buffer scene smoke failed: ${JSON.stringify({
      ok: result.ok,
      probeOk: result.probe?.ok,
      map: result.probe?.map,
      terrain: result.probe?.terrain,
      bridgeObjects: result.probe?.bridgeObjects,
      bridges: result.probe?.bridges,
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
    path: "browser-ww3d-terrain-bridge-buffer-scene",
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
      w3d: { path: rangeW3DArchive.path, bridgeModelEntries: w3dArchiveEntries },
      textures: { path: rangeTextureArchive.path, bridgeTextureEntries: textureArchiveEntries },
    },
    probe: result.probe,
    map: result.probe.map,
    terrain: result.probe.terrain,
    scene: result.probe.scene,
    bridgeObjects: result.probe.bridgeObjects,
    bridges: result.probe.bridges,
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
