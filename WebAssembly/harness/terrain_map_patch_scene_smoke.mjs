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
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const mapsArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultMapsArchivePath);
const terrainArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultTerrainArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const terrainScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-map-patch-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-map-patch-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsPath = `${runtimeArchivePath}/TerrainZH.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const terrainIniParser = "GameEngine/Common/INI.cpp::load + INITerrain.cpp";
const mapEntry = "Maps\\Tournament Desert\\Tournament Desert.map";

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function assertArchivePath(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
}

async function checkedArchive(path, label) {
  assertArchivePath(path, label);
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

  await withTimeout(
    "terrain map patch harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain map patch RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain map patch boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "W3D real map terrain patch scene render smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D real map terrain scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    "terrain map patch archive mount RPC",
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
            entries: [
              terrainIniEntry,
            ],
          },
          {
            url: mapsArchiveUrl,
            name: "MapsZH.big",
            expectedSourceBytes: mapsArchiveStat.size,
            sourceArchive: mapsArchivePath,
            entries: [
              mapEntry,
            ],
          },
          {
            url: terrainArchiveUrl,
            name: "TerrainZH.big",
            expectedSourceBytes: terrainArchiveStat.size,
            sourceArchive: terrainArchivePath,
            entries: terrainArchiveEntries,
          },
        ],
      }),
    120000,
  );
  const mountedArchives = archiveMountResult.archiveSet?.archives ?? [];
  const mountedProbes = archiveMountResult.archiveSet?.probes ?? [];
  const rangeIniArchive = mountedArchives[0];
  const rangeMapsArchive = mountedArchives[1];
  const rangeTerrainArchive = mountedArchives[2];
  const terrainIniMountedEntry = rangeIniArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === terrainIniEntry.toLowerCase());
  const mapMountedEntry = rangeMapsArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === mapEntry.toLowerCase());
  const firstTerrainMountedEntry = rangeTerrainArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === terrainArchiveEntries[0].toLowerCase());
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 3
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || archiveMountResult.archiveSet?.sourceTotalBytes !== iniArchiveStat.size + mapsArchiveStat.size + terrainArchiveStat.size
      || archiveMountResult.archiveSet?.totalBytes >= archiveMountResult.archiveSet?.sourceTotalBytes
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeIniArchive?.storage !== "range-backed-subset-big"
      || rangeIniArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeIniArchive?.sourceBytes !== iniArchiveStat.size
      || rangeIniArchive?.entryCount !== 1
      || rangeMapsArchive?.path !== mapsArchiveMemfsPath
      || rangeMapsArchive?.storage !== "range-backed-subset-big"
      || rangeMapsArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeMapsArchive?.sourceBytes !== mapsArchiveStat.size
      || rangeMapsArchive?.entryCount !== 1
      || rangeTerrainArchive?.path !== terrainArchiveMemfsPath
      || rangeTerrainArchive?.storage !== "range-backed-subset-big"
      || rangeTerrainArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeTerrainArchive?.sourceBytes !== terrainArchiveStat.size
      || rangeTerrainArchive?.entryCount !== terrainArchiveEntries.length
      || terrainIniMountedEntry?.bytes !== 25758
      || terrainIniMountedEntry?.reader !== "browser fetch Range"
      || mapMountedEntry?.bytes !== 144534
      || mapMountedEntry?.reader !== "browser fetch Range"
      || firstTerrainMountedEntry?.bytes <= 0
      || firstTerrainMountedEntry?.reader !== "browser fetch Range"
      || mountedProbes.length !== 0) {
    throw new Error(`Runtime terrain map patch archives mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let terrainResult;
  try {
    terrainResult = await withTimeout(
      "terrain map patch render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainMapPatchScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsPath,
        }),
      240000,
    );
  } catch (error) {
    throw new Error(`terrain map patch render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }

  if (!terrainResult.ok
      || terrainResult.command !== "ww3dTerrainMapPatchScene"
      || terrainResult.probe?.source !== "ww3d_terrain_map_patch_scene_probe"
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
      || !terrainResult.probe?.scene?.renderPath?.includes("RTS3DScene::Customized_Render")
      || terrainResult.probe?.scene?.created !== true
      || terrainResult.probe?.scene?.objectAdded !== true
      || terrainResult.probe?.scene?.terrainClassId !== 4
      || terrainResult.probe?.terrain?.tileSource !== "shipped-map-heightmap"
      || terrainResult.probe?.terrain?.verticesPerSide !== 17
      || terrainResult.probe?.terrain?.cellsPerSide !== 16
      || terrainResult.probe?.terrain?.patchHeightChecksum <= 0
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
    throw new Error(`W3D real map terrain scene render failed: ${JSON.stringify({
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
    throw new Error(`browser failures during W3D real map terrain scene: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-map-patch-scene",
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
        path: terrainArchiveMemfsPath,
        entryCount: terrainArchiveEntries.length,
      },
    },
    map: terrainResult.probe.map,
    scene: terrainResult.probe.scene,
    terrain: terrainResult.probe.terrain,
    calls: terrainResult.probe.calls,
    draw: terrainResult.probe.draw,
    centerPixel: terrainResult.screenshot.centerPixel,
    renderer: "original INI::load Terrain.ini terrain texture mappings + MapsZH Tournament Desert -> original WorldHeightMap -> RTS3DScene::Customized_Render CLASSID_TILEMAP -> W3DTerrainBackground -> browser D3D8/WebGL2",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
