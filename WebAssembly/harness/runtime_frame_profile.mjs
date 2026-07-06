#!/usr/bin/env node
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const artifactsRoot = resolve(wasmRoot, "artifacts/perf");
const screenshotsRoot = resolve(wasmRoot, "artifacts/screenshots");

const archiveSpecs = [
  { name: "INIZH.big" },
  { name: "EnglishZH.big" },
  { name: "WindowZH.big" },
  { name: "MapsZH.big" },
  { name: "MusicZH.big" },
  { name: "GensecZH.big" },
  { name: "TerrainZH.big" },
  { name: "TexturesZH.big" },
  { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" },
  { name: "SpeechZH.big" },
  { name: "AudioZH.big" },
  { name: "ShadersZH.big" },
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

function parsePositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseDistDir() {
  const value = process.env.PERF_PROFILE_DIST ?? "dist";
  if (!/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value)) {
    throw new Error(`Invalid PERF_PROFILE_DIST: ${value}`);
  }
  return value;
}

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function pixelHasColor(pixel, threshold = 2) {
  if (!Array.isArray(pixel) || pixel.length < 4 || pixel[3] < 200) {
    return false;
  }
  const [red, green, blue] = pixel;
  return red > threshold || green > threshold || blue > threshold;
}

function screenshotHasVisibleSample(screenshot) {
  return pixelHasColor(screenshot?.topLeftPixel) || pixelHasColor(screenshot?.centerPixel);
}

function summarizeScreenshot(screenshot) {
  return {
    ok: screenshot?.ok,
    width: screenshot?.screenshot?.width,
    height: screenshot?.screenshot?.height,
    topLeftPixel: screenshot?.screenshot?.topLeftPixel,
    centerPixel: screenshot?.screenshot?.centerPixel,
  };
}

function stats(values) {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) {
    return { count: 0, min: null, avg: null, median: null, p95: null, max: null };
  }
  const sum = finite.reduce((total, value) => total + value, 0);
  const percentile = (p) => finite[Math.min(finite.length - 1, Math.floor((finite.length - 1) * p))];
  return {
    count: finite.length,
    min: finite[0],
    avg: sum / finite.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    max: finite[finite.length - 1],
  };
}

function compactGameplay(gameplay) {
  if (!gameplay) {
    return null;
  }
  return {
    gameLogicReady: gameplay.gameLogicReady,
    inGame: gameplay.inGame,
    gameMode: gameplay.gameMode,
    logicFrame: gameplay.logicFrame,
    objectCount: gameplay.objectCount,
    loadingMap: gameplay.loadingMap,
    gameClientReady: gameplay.gameClientReady,
    clientFrame: gameplay.clientFrame,
    drawableCount: gameplay.drawableCount,
    renderedObjectCount: gameplay.renderedObjectCount,
    localPlayer: gameplay.localPlayer,
    inputEnabled: gameplay.inputEnabled,
    fade: gameplay.fade,
    fadeValue: gameplay.fadeValue,
  };
}

function compactDisplay(display) {
  if (!display) {
    return null;
  }
  return {
    width: display.width,
    height: display.height,
    moviePlaying: display.moviePlaying,
    letterBoxed: display.letterBoxed,
    letterBoxFading: display.letterBoxFading,
  };
}

function compactView(view) {
  if (!view) {
    return null;
  }
  return {
    ready: view.ready,
    zoom: view.zoom,
    pitch: view.pitch,
    angle: view.angle,
    position: view.position,
    cameraPosition: view.cameraPosition,
    cameraMovementFinished: view.cameraMovementFinished,
    zoomLimited: view.zoomLimited,
  };
}

function compactParticles(particles) {
  if (!particles) {
    return null;
  }
  return {
    managerReady: particles.managerReady,
    systemCount: particles.systemCount,
    particleCount: particles.particleCount,
    fieldParticleCount: particles.fieldParticleCount,
    onScreenParticleCount: particles.onScreenParticleCount,
  };
}

function compactFrameState(frame) {
  if (!frame) {
    return null;
  }
  return {
    framesAttempted: frame.framesAttempted,
    framesCompleted: frame.framesCompleted,
    lastFrameMs: frame.lastFrameMs,
    missingApplies: frame.missingApplies,
    missingBailouts: frame.missingBailouts,
    gameplay: compactGameplay(frame.gameplay),
    display: compactDisplay(frame.display),
    view: compactView(frame.view),
    particles: compactParticles(frame.particles),
    profile: frame.profile ?? null,
  };
}

function sceneIsSettled(frame, shellMap) {
  const gameplay = frame?.gameplay ?? {};
  if (gameplay.loadingMap === true) {
    return false;
  }
  if (!shellMap) {
    return true;
  }
  return Number(gameplay.drawableCount ?? 0) > 0
    && Number(gameplay.renderedObjectCount ?? 0) > 0;
}

async function buildArchives(serverUrl) {
  const archives = [];
  for (const spec of archiveSpecs) {
    const sourceName = spec.sourceName ?? spec.name;
    const path = resolve(archiveRoot, sourceName);
    const fileStat = await stat(path);
    archives.push({
      name: spec.name,
      sourceName,
      url: new URL(relative(wasmRoot, path).split(sep).join("/"), serverUrl).href,
      expectedBytes: fileStat.size,
    });
  }
  return archives;
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, args]) => window.CnCPort.rpc(name, args), [command, payload]);
}

async function queryRenderer(page) {
  return page.evaluate(() => {
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") || probe.getContext("webgl");
      if (!gl) {
        return "NO_WEBGL";
      }
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    } catch (error) {
      return `ERROR: ${error?.message ?? String(error)}`;
    }
  });
}

function readDrawSequence(state) {
  const value = Number(state?.graphics?.d3d8DrawIndexedSequence);
  return Number.isFinite(value) ? value : null;
}

async function queryBrowserPerf(page) {
  return page.evaluate(() => window.__cncD3D8PerfSummary?.() ?? null);
}

const browserPerfFields = [
  "draws",
  "drawElements",
  "drawIndices",
  "drawMs",
  "drawBatchCandidates",
  "drawBatchQueued",
  "drawBatchMerged",
  "drawBatchFlushes",
  "drawBatchSavedDrawElements",
  "drawBatchMergedIndices",
  "drawBatchMaxRunLength",
  "drawDerivedCacheHits",
  "drawDerivedCacheMisses",
  "drawUniformCacheHits",
  "drawUniformCacheMisses",
  "sortedDrawProfiledCalls",
  "sortedDrawProfiledMs",
  "sortedDrawPreBatchMs",
  "sortedDrawDerivedMs",
  "sortedDrawTextureDiagMs",
  "sortedDrawViewportMs",
  "sortedDrawDiagnosticsMs",
  "sortedDrawGeometryMs",
  "sortedDrawUniformMs",
  "sortedDrawDrawOrBatchMs",
  "sortedDrawTailMs",
  "clears",
  "clearMs",
  "clearTotalMs",
  "clearInvalidateMs",
  "clearSyncCanvasMs",
  "clearSetupMs",
  "clearContextAttrMs",
  "clearDepthMaskCheckMs",
  "clearDepthMaskToggleMs",
  "clearPostDiagMs",
  "textureUploads",
  "textureUploadBytes",
  "textureUploadPixels",
  "textureUploadMs",
  "textureConvertBytes",
  "textureConvertMs",
  "dxtDecodeMs",
  "volumeTextureUploads",
  "readPixels",
  "readPixelsPixels",
  "readPixelsMs",
  "fboBinds",
  "fboBindMs",
  "fboCreates",
  "fboIncomplete",
  "bufferUpdates",
  "bufferUploadBytes",
  "bufferUpdateMs",
  "bufferSubDataMs",
  "bufferMirrorBytes",
  "bufferMirrorMs",
  "bufferMirrorSkippedBytes",
];

function browserPerfDelta(before, after, framesAdvanced) {
  if (!before || !after) {
    return null;
  }
  const delta = {};
  for (const field of browserPerfFields) {
    const beforeValue = Number(before[field] ?? 0);
    const afterValue = Number(after[field] ?? 0);
    delta[field] = Number.isFinite(beforeValue) && Number.isFinite(afterValue)
      ? afterValue - beforeValue
      : null;
  }
  const clearBridgeMs = Math.max(0, Number(delta.clearTotalMs ?? 0) - Number(delta.clearMs ?? 0));
  const trackedGlCallMs =
    Number(delta.drawMs ?? 0) +
    Number(delta.clearMs ?? 0) +
    Number(delta.textureUploadMs ?? 0) +
    Number(delta.readPixelsMs ?? 0) +
    Number(delta.fboBindMs ?? 0) +
    Number(delta.bufferSubDataMs ?? 0);
  const trackedBrowserMs = trackedGlCallMs +
    clearBridgeMs +
    Number(delta.textureConvertMs ?? 0) +
    Math.max(0, Number(delta.bufferUpdateMs ?? 0) - Number(delta.bufferSubDataMs ?? 0));
  return {
    before,
    after,
    delta,
    trackedGlCallMs,
    trackedBrowserMs,
    perFrame: framesAdvanced > 0
      ? {
          draws: Number(delta.draws ?? 0) / framesAdvanced,
          drawMs: Number(delta.drawMs ?? 0) / framesAdvanced,
          drawBatchCandidates: Number(delta.drawBatchCandidates ?? 0) / framesAdvanced,
          drawBatchMerged: Number(delta.drawBatchMerged ?? 0) / framesAdvanced,
          drawBatchFlushes: Number(delta.drawBatchFlushes ?? 0) / framesAdvanced,
          drawBatchSavedDrawElements: Number(delta.drawBatchSavedDrawElements ?? 0) / framesAdvanced,
          drawBatchMergedIndices: Number(delta.drawBatchMergedIndices ?? 0) / framesAdvanced,
          drawDerivedCacheHits: Number(delta.drawDerivedCacheHits ?? 0) / framesAdvanced,
          drawDerivedCacheMisses: Number(delta.drawDerivedCacheMisses ?? 0) / framesAdvanced,
          drawUniformCacheHits: Number(delta.drawUniformCacheHits ?? 0) / framesAdvanced,
          drawUniformCacheMisses: Number(delta.drawUniformCacheMisses ?? 0) / framesAdvanced,
          sortedDrawProfiledCalls: Number(delta.sortedDrawProfiledCalls ?? 0) / framesAdvanced,
          sortedDrawProfiledMs: Number(delta.sortedDrawProfiledMs ?? 0) / framesAdvanced,
          sortedDrawPreBatchMs: Number(delta.sortedDrawPreBatchMs ?? 0) / framesAdvanced,
          sortedDrawDerivedMs: Number(delta.sortedDrawDerivedMs ?? 0) / framesAdvanced,
          sortedDrawTextureDiagMs: Number(delta.sortedDrawTextureDiagMs ?? 0) / framesAdvanced,
          sortedDrawViewportMs: Number(delta.sortedDrawViewportMs ?? 0) / framesAdvanced,
          sortedDrawDiagnosticsMs: Number(delta.sortedDrawDiagnosticsMs ?? 0) / framesAdvanced,
          sortedDrawGeometryMs: Number(delta.sortedDrawGeometryMs ?? 0) / framesAdvanced,
          sortedDrawUniformMs: Number(delta.sortedDrawUniformMs ?? 0) / framesAdvanced,
          sortedDrawDrawOrBatchMs: Number(delta.sortedDrawDrawOrBatchMs ?? 0) / framesAdvanced,
          sortedDrawTailMs: Number(delta.sortedDrawTailMs ?? 0) / framesAdvanced,
          clearMs: Number(delta.clearMs ?? 0) / framesAdvanced,
          clearTotalMs: Number(delta.clearTotalMs ?? 0) / framesAdvanced,
          clearInvalidateMs: Number(delta.clearInvalidateMs ?? 0) / framesAdvanced,
          clearSyncCanvasMs: Number(delta.clearSyncCanvasMs ?? 0) / framesAdvanced,
          clearSetupMs: Number(delta.clearSetupMs ?? 0) / framesAdvanced,
          clearContextAttrMs: Number(delta.clearContextAttrMs ?? 0) / framesAdvanced,
          clearDepthMaskCheckMs: Number(delta.clearDepthMaskCheckMs ?? 0) / framesAdvanced,
          clearDepthMaskToggleMs: Number(delta.clearDepthMaskToggleMs ?? 0) / framesAdvanced,
          clearPostDiagMs: Number(delta.clearPostDiagMs ?? 0) / framesAdvanced,
          clearBridgeMs: clearBridgeMs / framesAdvanced,
          textureUploadMs: Number(delta.textureUploadMs ?? 0) / framesAdvanced,
          textureConvertMs: Number(delta.textureConvertMs ?? 0) / framesAdvanced,
          readPixelsMs: Number(delta.readPixelsMs ?? 0) / framesAdvanced,
          fboBindMs: Number(delta.fboBindMs ?? 0) / framesAdvanced,
          bufferUpdates: Number(delta.bufferUpdates ?? 0) / framesAdvanced,
          bufferUploadBytes: Number(delta.bufferUploadBytes ?? 0) / framesAdvanced,
          bufferUpdateMs: Number(delta.bufferUpdateMs ?? 0) / framesAdvanced,
          bufferSubDataMs: Number(delta.bufferSubDataMs ?? 0) / framesAdvanced,
          bufferMirrorBytes: Number(delta.bufferMirrorBytes ?? 0) / framesAdvanced,
          bufferMirrorMs: Number(delta.bufferMirrorMs ?? 0) / framesAdvanced,
          bufferMirrorSkippedBytes: Number(delta.bufferMirrorSkippedBytes ?? 0) / framesAdvanced,
          trackedGlCallMs: trackedGlCallMs / framesAdvanced,
          trackedBrowserMs: trackedBrowserMs / framesAdvanced,
        }
      : null,
  };
}

async function runFramePass(page, frameCount, batchSize, label, command = "realEngineFrameSummary", profile = false) {
  const samples = [];
  let completedBefore = null;
  let drawSequenceBefore = null;
  let completedAfter = null;
  let drawSequenceAfter = null;
  let finalFrame = null;
  const browserPerfBefore = await queryBrowserPerf(page);

  for (let remaining = frameCount; remaining > 0;) {
    const frames = Math.min(batchSize, remaining);
    const startedAt = performance.now();
    const result = await rpc(page, command, profile ? { frames, profile: true } : { frames });
    const wallMs = performance.now() - startedAt;
    expect(result?.ok === true && result.aborted === false,
      `${label} ${command} failed`, result);
    const frame = result.frame ?? {};
    const drawSequence = readDrawSequence(result.state);
    if (completedBefore === null) {
      completedBefore = Number(frame.framesCompleted ?? 0) - frames;
      drawSequenceBefore = drawSequence;
    }
    completedAfter = Number(frame.framesCompleted ?? 0);
    drawSequenceAfter = drawSequence;
    finalFrame = frame;
    samples.push({
      frames,
      wallMs,
      wallMsPerFrame: wallMs / frames,
      engineLastFrameMs: Number(frame.lastFrameMs ?? Number.NaN),
      drawSequence,
      logicFrame: Number(frame.gameplay?.logicFrame ?? Number.NaN),
      objectCount: Number(frame.gameplay?.objectCount ?? Number.NaN),
      drawableCount: Number(frame.gameplay?.drawableCount ?? Number.NaN),
      renderedObjectCount: Number(frame.gameplay?.renderedObjectCount ?? Number.NaN),
      particleSystemCount: Number(frame.particles?.systemCount ?? Number.NaN),
    });
    remaining -= frames;
  }

  const totalWallMs = samples.reduce((total, sample) => total + sample.wallMs, 0);
  const framesAdvanced = Math.max(0, (completedAfter ?? 0) - (completedBefore ?? 0));
  const browserPerfAfter = await queryBrowserPerf(page);
  const drawCalls = drawSequenceBefore !== null && drawSequenceAfter !== null
    ? Math.max(0, drawSequenceAfter - drawSequenceBefore)
    : null;
  const result = {
    label,
    command,
    requestedFrames: frameCount,
    batchSize,
    rpcCalls: samples.length,
    framesCompletedBefore: completedBefore,
    framesCompletedAfter: completedAfter,
    framesAdvanced,
    wallMs: totalWallMs,
    wallMsPerFrame: framesAdvanced > 0 ? totalWallMs / framesAdvanced : null,
    rpcWallMs: stats(samples.map((sample) => sample.wallMs)),
    rpcWallMsPerFrame: stats(samples.map((sample) => sample.wallMsPerFrame)),
    engineLastFrameMs: stats(samples.map((sample) => sample.engineLastFrameMs)),
    drawCalls,
    drawCallsPerFrame: drawCalls !== null && framesAdvanced > 0 ? drawCalls / framesAdvanced : null,
    browserPerf: browserPerfDelta(browserPerfBefore, browserPerfAfter, framesAdvanced),
    finalState: compactFrameState(finalFrame),
    sampleCount: samples.length,
    firstSample: samples[0] ?? null,
    lastSample: samples[samples.length - 1] ?? null,
  };
  if (includeSamples) {
    result.samples = samples;
  }
  Object.defineProperty(result, "rawFinalFrame", { value: finalFrame, enumerable: false });
  return result;
}

async function runUntilSettled(page, maxFrames, shellMap) {
  const samples = [];
  let finalFrame = null;
  let settled = false;
  const startedAt = performance.now();
  const browserPerfBefore = await queryBrowserPerf(page);
  for (let index = 0; index < maxFrames; index += 1) {
    const frameStartedAt = performance.now();
    const result = await rpc(page, "realEngineFrameSummary", { frames: 1 });
    const wallMs = performance.now() - frameStartedAt;
    expect(result?.ok === true && result.aborted === false,
      "settle frame summary failed", result);
    const frame = result.frame ?? {};
    finalFrame = frame;
    samples.push({
      frames: 1,
      wallMs,
      wallMsPerFrame: wallMs,
      engineLastFrameMs: Number(frame.lastFrameMs ?? Number.NaN),
      drawSequence: Number(result.state?.graphics?.d3d8DrawIndexedSequence ?? 0),
      logicFrame: Number(frame.gameplay?.logicFrame ?? Number.NaN),
      objectCount: Number(frame.gameplay?.objectCount ?? Number.NaN),
      drawableCount: Number(frame.gameplay?.drawableCount ?? Number.NaN),
      renderedObjectCount: Number(frame.gameplay?.renderedObjectCount ?? Number.NaN),
      particleSystemCount: Number(frame.particles?.systemCount ?? Number.NaN),
    });
    if (sceneIsSettled(frame, shellMap)) {
      settled = true;
      break;
    }
  }

  const totalWallMs = performance.now() - startedAt;
  const browserPerfAfter = await queryBrowserPerf(page);
  const result = {
    label: "settle",
    requestedFrames: maxFrames,
    framesAdvanced: samples.length,
    settled,
    wallMs: totalWallMs,
    wallMsPerFrame: samples.length > 0 ? totalWallMs / samples.length : null,
    rpcWallMs: stats(samples.map((sample) => sample.wallMs)),
    engineLastFrameMs: stats(samples.map((sample) => sample.engineLastFrameMs)),
    browserPerf: browserPerfDelta(browserPerfBefore, browserPerfAfter, samples.length),
    finalState: compactFrameState(finalFrame),
    sampleCount: samples.length,
    firstSample: samples[0] ?? null,
    lastSample: samples[samples.length - 1] ?? null,
  };
  if (includeSamples) {
    result.samples = samples;
  }
  Object.defineProperty(result, "rawFinalFrame", { value: finalFrame, enumerable: false });
  return result;
}

const measuredFrames = parsePositiveInt("PERF_PROFILE_FRAMES", 60);
const warmupFrames = parsePositiveInt("PERF_PROFILE_WARMUP_FRAMES", 10);
const settleFrames = parsePositiveInt("PERF_PROFILE_SETTLE_FRAMES", 30);
const batchSize = parsePositiveInt("PERF_PROFILE_BATCH", 1);
const diagLevel = process.env.PERF_PROFILE_DIAG ?? "lite";
const measuredFrameCommand = process.env.PERF_PROFILE_FRAME_COMMAND ?? "realEngineFrameSummary";
const distDir = parseDistDir();
const shellMap = process.env.PERF_PROFILE_SHELLMAP !== "0";
const viewportWidth = parsePositiveInt("PERF_PROFILE_WIDTH", 1280);
const viewportHeight = parsePositiveInt("PERF_PROFILE_HEIGHT", 720);
const includeSamples = process.env.PERF_PROFILE_SAMPLES === "1";
const d3d8AdjacentBatching = process.env.PERF_PROFILE_D3D8_BATCH !== "0";
const d3d8LiteVertexMirrors = process.env.PERF_PROFILE_D3D8_VERTEX_MIRRORS === "1";
const engineFrameProfile = process.env.PERF_PROFILE_ENGINE_PROFILE === "1";

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  const launchOptions = { headless: true };
  const executablePath = process.env.PERF_PROFILE_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  if (process.env.PERF_PROFILE_BROWSER_ARGS) {
    launchOptions.args = process.env.PERF_PROFILE_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  }

  browser = await chromium.launch(launchOptions);
  await mkdir(artifactsRoot, { recursive: true });
  await mkdir(screenshotsRoot, { recursive: true });

  const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);
  page.on("pageerror", (error) => {
    console.error(`[runtime-profile] pageerror ${error.stack ?? error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[runtime-profile page] ${msg.text()}`);
    }
  });

  const harnessUrl = new URL("harness/index.html", server.url);
  harnessUrl.searchParams.set("dist", distDir);
  await page.goto(harnessUrl.href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  const renderer = await queryRenderer(page);
  await page.evaluate((level) => window.__cncSetDiagLevel?.(level), diagLevel);
  const d3d8AdjacentBatchingActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8AdjacentBatching?.(enabled) ?? null, d3d8AdjacentBatching);
  const d3d8LiteVertexMirrorsActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8LiteVertexMirrors?.(enabled) ?? null, d3d8LiteVertexMirrors);

  const mount = await rpc(page, "mountArchives", {
    path: "/assets/runtime-frame-profile",
    verifyEach: false,
    archives: await buildArchives(server.url),
  });
  expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
    "runtime frame profile failed to mount archives", mount?.archiveSet ?? mount);

  const initStartedAt = performance.now();
  const init = await rpc(page, "realEngineInit", {
    runDirectory: "/assets/runtime-frame-profile",
    shellMap,
  });
  const initWallMs = performance.now() - initStartedAt;
  expect(init?.ok === true && init.aborted === false && init.frontier?.initReturned === true,
    "runtime frame profile failed real engine init", init);

  const warmup = await runFramePass(page, warmupFrames, batchSize, "warmup");
  const settle = sceneIsSettled(warmup.rawFinalFrame, shellMap)
    ? {
        label: "settle",
        requestedFrames: 0,
        framesAdvanced: 0,
        settled: true,
        wallMs: 0,
        wallMsPerFrame: null,
        finalState: compactFrameState(warmup.rawFinalFrame),
      }
    : await runUntilSettled(page, settleFrames, shellMap);
  expect(settle.settled === true, "runtime frame profile scene did not settle", settle);
  const measured = await runFramePass(
    page,
    measuredFrames,
    batchSize,
    "measured",
    measuredFrameCommand,
    engineFrameProfile,
  );
  const screenshot = await rpc(page, "screenshot");
  expect(screenshot?.ok === true && screenshotHasVisibleSample(screenshot.screenshot),
    "runtime frame profile screenshot stayed blank", summarizeScreenshot(screenshot));
  const screenshotPath = resolve(screenshotsRoot, "runtime-frame-profile.png");
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  const output = {
    ok: true,
    source: "cnc-port-runtime-frame-profile",
    renderer,
    m4Metal: renderer.includes("Apple M4") && renderer.includes("Metal"),
    swiftShader: /SwiftShader/i.test(renderer),
    diagLevel,
    distDir,
    d3d8AdjacentBatching: d3d8AdjacentBatchingActive,
    d3d8LiteVertexMirrors: d3d8LiteVertexMirrorsActive,
    engineFrameProfile,
    measuredFrameCommand,
    shellMap,
    viewport: { width: viewportWidth, height: viewportHeight },
    initWallMs,
    archiveCount: archiveSpecs.length,
    warmup,
    settle,
    measured,
    screenshot: screenshotPath,
  };
  const outputPath = resolve(artifactsRoot, "runtime-frame-profile.json");
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ ...output, outputPath }, null, 2));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
