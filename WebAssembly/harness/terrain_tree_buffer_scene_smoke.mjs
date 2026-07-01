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
  "harness-smoke-ww3d-terrain-tree-buffer-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-tree-buffer-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsPath = `${runtimeArchivePath}/TerrainZH.big`;
const w3dArchiveMemfsPath = `${runtimeArchivePath}/W3DZH.big`;
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const mapEntry = "Maps\\MD_GLA03\\MD_GLA03.map";
const mapEntryBytes = 295065;
const treeModelsEntry = "Art\\W3D\\Models.txt";
const treeMeshEntry = "Art\\W3D\\PTDogwod01_S.W3D";
const treeTextureEntry = "Art\\Terrain\\PTDogwod01_S.tga";
const treeMaterialTextureEntry = "Art\\Textures\\ptdogwod01_s.dds";

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
const w3dArchiveStat = await checkedArchive(w3dArchivePath, "W3D archive");
const textureArchiveStat = await checkedArchive(textureArchivePath, "Texture archive");
const terrainArchiveEntries = (await listBigArchiveEntries(terrainArchivePath))
  .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
if (!terrainArchiveEntries.some((entry) => entry.toLowerCase() === treeTextureEntry.toLowerCase())) {
  throw new Error(`Terrain archive does not contain ${treeTextureEntry}: ${terrainArchivePath}`);
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
    "terrain tree-buffer scene harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain tree-buffer scene RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain tree-buffer scene boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "W3D tree-buffer scene drawTrees render smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D tree-buffer scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    "terrain tree-buffer scene archive mount RPC",
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
            url: w3dArchiveUrl,
            name: "W3DZH.big",
            expectedSourceBytes: w3dArchiveStat.size,
            sourceArchive: w3dArchivePath,
            entries: [treeModelsEntry, treeMeshEntry],
          },
          {
            url: textureArchiveUrl,
            name: "TexturesZH.big",
            expectedSourceBytes: textureArchiveStat.size,
            sourceArchive: textureArchivePath,
            entries: [treeMaterialTextureEntry],
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
  const terrainIniMountedEntry = findMountedEntry(rangeIniArchive, terrainIniEntry);
  const mapMountedEntry = findMountedEntry(rangeMapsArchive, mapEntry);
  const treeTerrainMountedEntry = findMountedEntry(rangeTerrainArchive, treeTextureEntry);
  const treeModelsMountedEntry = findMountedEntry(rangeW3DArchive, treeModelsEntry);
  const treeMeshMountedEntry = findMountedEntry(rangeW3DArchive, treeMeshEntry);
  const treeMaterialTextureMountedEntry = findMountedEntry(rangeTextureArchive, treeMaterialTextureEntry);
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
      || terrainIniMountedEntry?.bytes !== 25758
      || terrainIniMountedEntry?.reader !== "browser fetch Range"
      || mapMountedEntry?.bytes !== mapEntryBytes
      || mapMountedEntry?.reader !== "browser fetch Range"
      || treeTerrainMountedEntry?.bytes <= 0
      || treeTerrainMountedEntry?.reader !== "browser fetch Range"
      || treeModelsMountedEntry?.bytes <= 0
      || treeMeshMountedEntry?.bytes <= 0
      || treeMaterialTextureMountedEntry?.bytes <= 0) {
    throw new Error(`Runtime terrain tree-buffer scene archives mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let result;
  try {
    result = await withTimeout(
      "terrain tree-buffer scene render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainTreeBufferScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsPath,
          runtimeArchiveDirectory: `${runtimeArchivePath}/`,
          runtimeArchiveMask: "*.big",
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain tree-buffer scene render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  if (!result.ok
      || result.command !== "ww3dTerrainTreeBufferScene"
      || result.probe?.source !== "ww3d_terrain_tree_buffer_scene_probe"
      || result.probe?.path !== "original WorldHeightMap + HeightMapRenderObjClass::Render -> RTS3DScene::Flush -> DoTrees -> BaseHeightMapRenderObjClass::renderTrees -> W3DTreeBuffer::drawTrees"
      || result.probe?.asset?.model !== "PTDogwod01_S"
      || result.probe?.asset?.texture !== "PTDogwod01_S.tga"
      || result.probe?.asset?.meshEntry !== treeMeshEntry
      || result.probe?.asset?.textureEntry !== treeTextureEntry
      || result.probe?.results?.runtimeAssetSystemInstalled !== true
      || result.probe?.results?.meshFileExists !== true
      || result.probe?.results?.treeTextureFileExists !== true
      || result.probe?.results?.treeBufferInstalled !== true
      || result.probe?.results?.addTreeInvoked !== true
      || result.probe?.results?.treeSceneDrawFlushed !== true
      || result.probe?.tree?.tilesAfterScene <= 0
      || result.probe?.ini?.parsed !== true
      || !iniLayoutMatches(result.probe?.iniLayout)
      || result.probe?.map?.entry !== mapEntry
      || result.probe?.map?.parsed !== true
      || result.probe?.terrain?.renderObject !== "ProbeHeightMapRenderObjWithTreeBuffer"
      || result.probe?.scene?.renderPath?.includes("W3DTreeBuffer::drawTrees") !== true
      || result.probe?.draw?.vertexShaderFvf !== 338
      || result.probe?.draw?.vertexStride !== 36
      || result.browserProbe?.vertexShaderFvf !== 338
      || result.browserProbe?.vertexStride !== 36
      || result.browserProbe?.texture0?.sampled !== true
      || result.drawSequence?.treeAfterTerrain !== true
      || result.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`terrain tree-buffer scene smoke failed: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-tree-buffer-scene",
    reader: "browser Range subset BIGs loaded by runtime-owned Win32BIGFileSystem",
    archives: {
      ini: {
        path: rangeIniArchive.path,
        entry: terrainIniEntry,
        parser: "GameEngine/Common/INI.cpp::load + INITerrain.cpp",
        originalIniParser: true,
        terrainTypeCount: result.probe.ini.terrainTypeCount,
        layout: result.probe.iniLayout,
      },
      maps: { path: rangeMapsArchive.path, entry: mapEntry },
      terrain: { path: rangeTerrainArchive.path, treeTextureEntry },
      w3d: { path: rangeW3DArchive.path, modelsEntry: treeModelsEntry, meshEntry: treeMeshEntry },
      textures: { path: rangeTextureArchive.path, materialTextureEntry: treeMaterialTextureEntry },
    },
    probe: result.probe,
    map: result.probe.map,
    terrain: result.probe.terrain,
    scene: result.probe.scene,
    tree: result.probe.tree,
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
