#!/usr/bin/env node
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(
  wasmRoot,
  process.argv[2] ?? "artifacts/real-assets",
);
const runtimeArchivePath = "/assets/runtime-road-lighting-refresh";
const requiredArchives = [
  { name: "INIZH.big" },
  { name: "MapsZH.big" },
  { name: "TerrainZH.big" },
  { name: "TexturesZH.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
];
const mapEntry = "Maps\\MD_CHI01\\MD_CHI01.map";
const diagnosticLevel = process.env.CNC_ROAD_LIGHTING_DIAG_LEVEL ?? "lite";
const screenshotPath = resolve(
  wasmRoot,
  "artifacts/screenshots/harness-smoke-ww3d-terrain-road-lighting-refresh.png",
);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

if (!isInside(wasmRoot, archiveRoot)) {
  throw new Error(`archive root must be inside ${wasmRoot}: ${archiveRoot}`);
}

const archives = [];
for (const spec of requiredArchives) {
  const sourceName = spec.sourceName ?? spec.name;
  const path = resolve(archiveRoot, sourceName);
  if (!isInside(archiveRoot, path)) {
    throw new Error(`archive path escaped ${archiveRoot}: ${path}`);
  }
  await access(path);
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error(`archive is not a readable file: ${path}`);
  }
  archives.push({
    name: spec.name,
    sourceName,
    bytes: fileStat.size,
    expectedBytes: fileStat.size,
    urlPath: relative(wasmRoot, path).split(sep).join("/"),
  });
}

await mkdir(dirname(screenshotPath), { recursive: true });

const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];
const contextTimeline = [];

try {
  const launchOptions = { headless: true };
  const executablePath = process.env.CNC_ROAD_LIGHTING_BROWSER_EXECUTABLE;
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  if (process.env.CNC_ROAD_LIGHTING_BROWSER_ARGS) {
    launchOptions.args = process.env.CNC_ROAD_LIGHTING_BROWSER_ARGS
      .split(/\s+/)
      .filter(Boolean);
  }
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({
      type: "console",
      level: message.type(),
      text: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  const archiveInputs = archives.map((archive) => ({
    name: archive.name,
    sourceName: archive.sourceName,
    expectedBytes: archive.expectedBytes,
    url: new URL(archive.urlPath, server.url).href,
  }));

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  const readContext = (phase) => page.evaluate((currentPhase) => {
    const canvas = document.querySelector("#viewport");
    const gl = canvas?.getContext("webgl2");
    return {
      phase: currentPhase,
      lost: gl?.isContextLost() ?? true,
      banner: Boolean(document.querySelector("#webglContextLostBanner")),
    };
  }, phase);
  const startupContext = {
    beforeReload: await readContext("browser-startup"),
    reloaded: false,
    afterReload: null,
  };
  if (startupContext.beforeReload.lost || startupContext.beforeReload.banner) {
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#viewport");
      return canvas?.getContext("webgl2")?.isContextLost() === false;
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    startupContext.reloaded = true;
    startupContext.afterReload = await readContext("browser-startup-reload");
    if (startupContext.afterReload.lost || startupContext.afterReload.banner) {
      throw new Error(`WebGL context remained unhealthy after startup reload: ${
        JSON.stringify(startupContext)
      }`);
    }
  }
  const recordContext = async (phase) => {
    contextTimeline.push(await readContext(phase));
  };
  const selectedDiagnosticLevel = await page.evaluate(
    (level) => globalThis.__cncSetDiagLevel?.(level) ?? null,
    diagnosticLevel,
  );
  if (selectedDiagnosticLevel !== diagnosticLevel) {
    throw new Error(`failed to select D3D8 diagnostic level ${diagnosticLevel}`);
  }
  await recordContext("harness-ready");

  const mountResult = await page.evaluate(
    ({ path, archives: archivePayload }) =>
      window.CnCPort.rpc("mountArchives", {
        path,
        archives: archivePayload,
      }),
    { path: runtimeArchivePath, archives: archiveInputs },
  );
  if (!mountResult.ok
      || mountResult.archiveSet?.path !== runtimeArchivePath
      || mountResult.archiveSet?.archiveCount !== requiredArchives.length
      || mountResult.archiveSet?.archives?.some((archive) => !archive.bytesMatch)
      || mountResult.archiveSet?.probes?.some((probe) => !probe.ok)) {
    throw new Error(`road lighting runtime archive mount failed: ${JSON.stringify(mountResult)}`);
  }
  await recordContext("archives-mounted");

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "W3D road lighting refresh shipped-map regression",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before road lighting refresh: ${JSON.stringify(bootResult)}`);
  }
  await recordContext("port-booted");

  const mountedPath = (name) => `${runtimeArchivePath}/${name}`;
  const terrainResult = await page.evaluate(
    (payload) => window.CnCPort.rpc("ww3dTerrainRoadBufferScene", payload),
    {
      iniArchivePath: mountedPath("INIZH.big"),
      mapsArchivePath: mountedPath("MapsZH.big"),
      terrainArchivePath: mountedPath("TerrainZH.big"),
      runtimeArchiveDirectory: `${runtimeArchivePath}/`,
      runtimeArchiveMask: "*.big",
      mapEntry,
    },
  );
  await recordContext("road-scene-rendered");

  await page.locator("#viewport").screenshot({ path: screenshotPath });
  await recordContext("screenshot-captured");

  const probe = terrainResult.probe;
  const lightingRefresh = probe?.lightingRefresh;
  const preconditionsOk = probe?.source === "ww3d_terrain_road_buffer_scene_probe"
    && probe?.results?.roadBufferInitialized === true
    && probe?.results?.loadRoadsInvoked === true
    && probe?.results?.roadDrawInvoked === true
    && probe?.results?.roadSceneDrawFlushed === true
    && probe?.map?.entry === mapEntry
    && probe?.map?.parsed === true
    && probe?.terrain?.tileSource === "shipped-map-heightmap"
    && (probe?.roadObjects?.pairsWithRoadType ?? 0) > 0
    && (probe?.roads?.segmentsWithVertices ?? 0) > 0
    && (probe?.roads?.typesWithDrawData ?? 0) > 0
    && lightingRefresh?.path ===
      "W3DRoadBuffer::updateLighting -> W3DRoadBuffer::drawRoads with unchanged camera bounds"
    && lightingRefresh?.invoked === true
    && lightingRefresh?.requestedBufferUpdate === true
    && lightingRefresh?.requestedVertexDataUpload === true
    && (lightingRefresh?.cpuDiffuse?.vertices ?? 0) > 0
    && lightingRefresh?.cpuDiffuse?.beforeChecksum
      !== lightingRefresh?.cpuDiffuse?.afterChecksum
    && lightingRefresh?.cpuDiffuse?.afterRgbSum
      < lightingRefresh?.cpuDiffuse?.beforeRgbSum
    && lightingRefresh?.drawInvoked === true;
  const refreshOk = (lightingRefresh?.browserBufferUpdates ?? 0) > 0
    && lightingRefresh?.clearedBufferUpdate === true
    && lightingRefresh?.clearedVertexDataDirty === true
    && lightingRefresh?.steadyState?.drawInvoked === true
    && lightingRefresh?.steadyState?.browserBufferUpdates === 0;
  const graphicalProofOk = terrainResult.screenshot?.coverage?.coloredPixelCount > 0
    && (diagnosticLevel !== "full"
      || (terrainResult.browserProbe?.source === "browser_d3d8_draw_indexed"
        && terrainResult.browserProbe?.texture0?.sampled === true));
  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  const context = contextTimeline.at(-1);
  const contextClean = contextTimeline.every((entry) => !entry.lost && !entry.banner);
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const gl = canvas?.getContext("webgl2");
    const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
    return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
  });

  if (!terrainResult.ok
      || !preconditionsOk
      || !refreshOk
      || !graphicalProofOk
      || !contextClean
      || browserFailures.length > 0) {
    throw new Error(`W3D road lighting refresh regression failed: ${JSON.stringify({
      commandOk: terrainResult.ok,
      probeOk: probe?.ok,
      preconditionsOk,
      refreshOk,
      graphicalProofOk,
      context,
      contextClean,
      contextTimeline,
      startupContext,
      lightingRefresh,
      results: probe?.results,
      logicalTerrain: probe?.logicalTerrain,
      ini: probe?.ini,
      map: probe?.map,
      terrain: probe?.terrain,
      roadObjects: probe?.roadObjects,
      roads: probe?.roads,
      runtimeAssets: probe?.runtimeAssets,
      calls: probe?.calls,
      browserProbe: terrainResult.browserProbe,
      drawSequence: terrainResult.drawSequence,
      bufferDelta: terrainResult.bufferDelta,
      textureDelta: terrainResult.textureDelta,
      diagnosticLevel: terrainResult.diagnosticLevel,
      coverage: terrainResult.screenshot?.coverage,
      browserFailures,
      screenshot: screenshotPath,
    })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-road-lighting-refresh",
    url: harnessUrl,
    screenshot: screenshotPath,
    map: probe.map,
    roads: probe.roads,
    lightingRefresh,
    calls: probe.calls,
    coverage: terrainResult.screenshot.coverage,
    diagnosticLevel: selectedDiagnosticLevel,
    context,
    contextClean,
    contextTimeline,
    startupContext,
    renderer,
    renderPath: "retail map/terrain/road archives -> original W3DRoadBuffer -> browser D3D8/WebGL2",
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
