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

const GAME_SKIRMISH = 2;
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;

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
  { name: "SpeechEnglishZH.big" },
  { name: "AudioZH.big" },
  { name: "AudioEnglishZH.big" },
  { name: "ShadersZH.big" },
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "LooseScripts.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Shaders.big", sourceName: "Shaders.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

function parsePositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseNonNegativeInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseOptionalUint31(name) {
  const text = String(process.env[name] ?? "").trim();
  if (!text) {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${name}: ${text}`);
  }
  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value > 0x7fffffff) {
    throw new Error(`Invalid ${name}: ${text}`);
  }
  return value;
}

function parseDistDir() {
  const value = process.env.PERF_PROFILE_DIST ?? "dist";
  if (!/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value)) {
    throw new Error(`Invalid PERF_PROFILE_DIST: ${value}`);
  }
  return value;
}

function parseProfileScene() {
  const value = (process.env.PERF_PROFILE_SCENE ?? "shellmap").trim().toLowerCase();
  if (value === "shellmap" || value === "skirmish") {
    return value;
  }
  throw new Error(`Invalid PERF_PROFILE_SCENE: ${value}`);
}

function parseOptionalBoolean(name) {
  const value = process.env[name];
  if (value == null || value === "") {
    return null;
  }
  if (/^(1|true|yes|on)$/i.test(value)) {
    return true;
  }
  if (/^(0|false|no|off)$/i.test(value)) {
    return false;
  }
  throw new Error(`Invalid ${name}: ${value}`);
}

async function startWorkerCpuProfile(browser, samplingIntervalUs) {
  if (!browser) {
    throw new Error("CPU profiling requires a Chromium browser session");
  }
  const rootSession = await browser.newBrowserCDPSession();
  const { targetInfos = [] } = await rootSession.send("Target.getTargets");
  const workerTarget = targetInfos.find((target) =>
    target.type === "worker" && /engine[_-]realm/i.test(target.url))
    ?? targetInfos.find((target) => target.type === "worker");
  if (!workerTarget) {
    await rootSession.detach();
    throw new Error(`CPU profiling could not find the engine worker: ${JSON.stringify(
      targetInfos.map(({ type, url }) => ({ type, url })),
    )}`);
  }

  // Playwright exposes CDP sessions for pages/frames, but the threaded engine
  // runs in a dedicated Worker. Attach through the browser Target domain and
  // relay nested-protocol messages to profile the realm that owns Wasm/WebGL.
  const { sessionId } = await rootSession.send("Target.attachToTarget", {
    targetId: workerTarget.targetId,
    flatten: false,
  });
  let nextCommandId = 0;
  const pending = new Map();
  const onMessage = ({ sessionId: incomingSessionId, message }) => {
    if (incomingSessionId !== sessionId) {
      return;
    }
    const response = JSON.parse(message);
    const waiter = pending.get(response.id);
    if (!waiter) {
      return;
    }
    pending.delete(response.id);
    if (response.error) {
      waiter.reject(new Error(`Worker CDP command failed: ${JSON.stringify(response.error)}`));
    } else {
      waiter.resolve(response.result);
    }
  };
  rootSession.on("Target.receivedMessageFromTarget", onMessage);
  const send = async (method, params = {}) => {
    const id = ++nextCommandId;
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    await rootSession.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({ id, method, params }),
    });
    return response;
  };

  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: samplingIntervalUs });
  await send("Profiler.start");
  const startedAt = performance.now();
  return {
    targetUrl: workerTarget.url,
    samplingIntervalUs,
    async stop() {
      const result = await send("Profiler.stop");
      const elapsedMs = performance.now() - startedAt;
      rootSession.off("Target.receivedMessageFromTarget", onMessage);
      await rootSession.send("Target.detachFromTarget", { sessionId }).catch(() => {});
      await rootSession.detach().catch(() => {});
      return {
        profile: result.profile,
        elapsedMs,
        targetUrl: workerTarget.url,
        samplingIntervalUs,
      };
    },
  };
}

async function runWithDeadline(label, timeoutMs, task) {
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    timeoutId.unref?.();
  });
  const work = Promise.resolve()
    .then(task)
    .then(() => ({ timedOut: false }))
    .catch((error) => ({ timedOut: false, error }));
  const result = await Promise.race([work, timeout]);
  if (timeoutId != null) {
    clearTimeout(timeoutId);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.timedOut) {
    console.error(`[runtime-profile] ${label} timed out after ${timeoutMs}ms`);
    return false;
  }
  return true;
}

async function flushOutputStreams() {
  await new Promise((resolve) => process.stdout.write("", resolve));
  await new Promise((resolve) => process.stderr.write("", resolve));
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
  if (typeof screenshot === "string") {
    return screenshot.startsWith("data:image/png;base64,") && screenshot.length > 1024;
  }
  return pixelHasColor(screenshot?.topLeftPixel) || pixelHasColor(screenshot?.centerPixel);
}

function summarizeScreenshot(screenshot) {
  if (typeof screenshot?.screenshot === "string") {
    return {
      ok: screenshot?.ok,
      format: screenshot.screenshot.startsWith("data:image/png;base64,") ? "png-data-url" : "unknown",
      encodedBytes: screenshot.screenshot.length,
    };
  }
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
    return { count: 0, min: null, avg: null, median: null, p95: null, p99: null, max: null };
  }
  const sum = finite.reduce((total, value) => total + value, 0);
  const percentile = (p) => finite[Math.min(finite.length - 1, Math.floor((finite.length - 1) * p))];
  return {
    count: finite.length,
    min: finite[0],
    avg: sum / finite.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: finite[finite.length - 1],
  };
}

function framePacingStats(values, budgetMs = 1000 / 30) {
  const finite = values.filter((value) => Number.isFinite(value) && value >= 0);
  const summary = stats(finite);
  if (finite.length === 0) {
    return {
      ...summary,
      standardDeviation: null,
      coefficientOfVariation: null,
      equivalentFps: null,
      onePercentLowFps: null,
      budgetMs,
      overBudget: 0,
      overBudgetRatio: null,
      over50Ms: 0,
      over100Ms: 0,
    };
  }
  const variance = finite.reduce(
    (total, value) => total + (value - summary.avg) ** 2,
    0,
  ) / finite.length;
  const standardDeviation = Math.sqrt(variance);
  const overBudget = finite.filter((value) => value > budgetMs).length;
  return {
    ...summary,
    standardDeviation,
    coefficientOfVariation: summary.avg > 0 ? standardDeviation / summary.avg : null,
    equivalentFps: summary.avg > 0 ? 1000 / summary.avg : null,
    onePercentLowFps: summary.p99 > 0 ? 1000 / summary.p99 : null,
    budgetMs,
    overBudget,
    overBudgetRatio: overBudget / finite.length,
    over50Ms: finite.filter((value) => value > 50).length,
    over100Ms: finite.filter((value) => value > 100).length,
  };
}

function compactProfileTop(profile, limit = 8) {
  return Array.isArray(profile?.top)
    ? profile.top.slice(0, limit).map((entry) => ({
        name: entry.name,
        totalMs: entry.totalMs,
        maxMs: entry.maxMs,
        samples: entry.samples,
      }))
    : [];
}

function slowestSamples(samples, valueField, limit = 8) {
  return samples
    .map((sample, sampleIndex) => ({
      sampleIndex,
      value: Number(sample[valueField] ?? Number.NaN),
      sample,
    }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
    .map(({ sampleIndex, value, sample }) => ({
      sampleIndex,
      value,
      frames: sample.frames,
      wallMs: sample.wallMs,
      wallMsPerFrame: sample.wallMsPerFrame,
      engineLastFrameMs: sample.engineLastFrameMs,
      logicFrame: sample.logicFrame,
      objectCount: sample.objectCount,
      drawableCount: sample.drawableCount,
      renderedObjectCount: sample.renderedObjectCount,
      ai: sample.ai ?? null,
      particleSystemCount: sample.particleSystemCount,
      drawSequence: sample.drawSequence,
      browserPerf: compactBrowserPerfSample(sample.browserPerf),
      profileElapsedMs: sample.profile?.elapsedMs ?? null,
      profileTop: compactProfileTop(sample.profile),
    }));
}

function compactBrowserPerfSample(browserPerf) {
  const perFrame = browserPerf?.perFrame;
  if (!perFrame) {
    return null;
  }
  return {
    trackedBrowserMs: perFrame.trackedBrowserMs,
    trackedGlCallMs: perFrame.trackedGlCallMs,
    draws: perFrame.draws,
    drawMs: perFrame.drawMs,
    drawDepthStencilOnlyProgramDraws: perFrame.drawDepthStencilOnlyProgramDraws,
    drawDepthStencilOnlyFastDerivedDraws: perFrame.drawDepthStencilOnlyFastDerivedDraws,
    drawMatrixNormalizations: perFrame.drawMatrixNormalizations,
    drawMatrixScratchCopies: perFrame.drawMatrixScratchCopies,
    drawMatrixAllocatedCopies: perFrame.drawMatrixAllocatedCopies,
    drawPayloadCalls: perFrame.drawPayloadCalls,
    drawPayloadReused: perFrame.drawPayloadReused,
    drawMultiWorldBatches: perFrame.drawMultiWorldBatches,
    drawMultiWorldCopies: perFrame.drawMultiWorldCopies,
    drawMultiWorldFallbacks: perFrame.drawMultiWorldFallbacks,
    drawClipPlanePayloadCopies: perFrame.drawClipPlanePayloadCopies,
    drawClipPlanePayloadSkips: perFrame.drawClipPlanePayloadSkips,
    drawMaterialPayloadCopies: perFrame.drawMaterialPayloadCopies,
    drawMaterialPayloadSkips: perFrame.drawMaterialPayloadSkips,
    drawLightPayloadCopies: perFrame.drawLightPayloadCopies,
    drawLightPayloadSkips: perFrame.drawLightPayloadSkips,
    sortedDrawProfiledMs: perFrame.sortedDrawProfiledMs,
    sortedDrawUniformMs: perFrame.sortedDrawUniformMs,
    sortedDrawRenderUniformMs: perFrame.sortedDrawRenderUniformMs,
    sortedDrawRenderBaseUniformMs: perFrame.sortedDrawRenderBaseUniformMs,
    sortedDrawRenderMaterialUniformMs: perFrame.sortedDrawRenderMaterialUniformMs,
    sortedDrawRenderLightUniformMs: perFrame.sortedDrawRenderLightUniformMs,
    sortedDrawRenderStageUniformMs: perFrame.sortedDrawRenderStageUniformMs,
    sortedDrawRenderAlphaFogUniformMs: perFrame.sortedDrawRenderAlphaFogUniformMs,
    sortedDrawTransformUniformMs: perFrame.sortedDrawTransformUniformMs,
    sortedDrawTransformCompareMs: perFrame.sortedDrawTransformCompareMs,
    sortedDrawWorldTransformUniformMs: perFrame.sortedDrawWorldTransformUniformMs,
    sortedDrawViewTransformUniformMs: perFrame.sortedDrawViewTransformUniformMs,
    sortedDrawProjectionTransformUniformMs: perFrame.sortedDrawProjectionTransformUniformMs,
    sortedDrawPointSpriteUniformMs: perFrame.sortedDrawPointSpriteUniformMs,
    sortedDrawTextureUniformMs: perFrame.sortedDrawTextureUniformMs,
    sortedDrawGeometryMs: perFrame.sortedDrawGeometryMs,
    sortedDrawVertexAttribMs: perFrame.sortedDrawVertexAttribMs,
    sortedDrawDrawOrBatchMs: perFrame.sortedDrawDrawOrBatchMs,
    bufferUpdates: perFrame.bufferUpdates,
    bufferUploadBytes: perFrame.bufferUploadBytes,
    bufferSubDataMs: perFrame.bufferSubDataMs,
    textureUploadMs: perFrame.textureUploadMs,
    readPixelsMs: perFrame.readPixelsMs,
  };
}

const render2DProfileFields = [
  "calls",
  "draws",
  "emptyCalls",
  "hiddenCalls",
  "texturedDraws",
  "untexturedDraws",
  "grayscaleDraws",
  "vertices",
  "indices",
  "triangles",
  "maxVertices",
  "maxIndices",
];

const d3d8DrawCacheFields = [
  "derivedStateHits",
  "derivedStateMisses",
  "bufferChecksumHits",
  "bufferChecksumMisses",
];

function summarizeProfileGroup(samples, groupName, fields) {
  const summary = {};
  for (const field of fields) {
    summary[field] = stats(samples.map((sample) => Number(sample.profile?.[groupName]?.[field] ?? Number.NaN)));
  }
  return summary;
}

function summarizeSampleCounterDelta(samples, groupName, fields, framesAdvanced) {
  if (samples.length < 2) {
    return null;
  }
  const first = samples[0]?.[groupName] ?? null;
  const last = samples[samples.length - 1]?.[groupName] ?? null;
  if (!first || !last) {
    return null;
  }
  const countedFrames = Math.max(0, framesAdvanced - Number(samples[0]?.frames ?? 0));
  const delta = {};
  const perFrame = {};
  for (const field of fields) {
    const beforeValue = Number(first[field] ?? 0);
    const afterValue = Number(last[field] ?? 0);
    delta[field] = Number.isFinite(beforeValue) && Number.isFinite(afterValue)
      ? afterValue - beforeValue
      : null;
    perFrame[field] = countedFrames > 0 && delta[field] !== null
      ? delta[field] / countedFrames
      : null;
  }
  return { first, last, delta, countedFrames, perFrame };
}

function summarizeProfileCounters(samples) {
  return {
    render2D: summarizeProfileGroup(samples, "render2D", render2DProfileFields),
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
    ai: gameplay.ai ?? null,
    playerDiagnostics: compactPlayerDiagnostics(gameplay.playerDiagnostics),
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

function compactD3D8DrawCache(cache) {
  if (!cache) {
    return null;
  }
  return {
    derivedStateHits: Number(cache.derivedStateHits ?? 0),
    derivedStateMisses: Number(cache.derivedStateMisses ?? 0),
    bufferChecksumHits: Number(cache.bufferChecksumHits ?? 0),
    bufferChecksumMisses: Number(cache.bufferChecksumMisses ?? 0),
  };
}

function compactPlayerDiagnostics(diagnostics) {
  if (!diagnostics?.players || !Array.isArray(diagnostics.players)) {
    return null;
  }
  return {
    playerListReady: diagnostics.playerListReady ?? null,
    gameLogicReady: diagnostics.gameLogicReady ?? null,
    playerCount: diagnostics.playerCount ?? diagnostics.players.length,
    localPlayerIndex: diagnostics.localPlayerIndex ?? null,
    unownedObjects: diagnostics.unownedObjects ?? null,
    invalidOwnerObjects: diagnostics.invalidOwnerObjects ?? null,
    players: diagnostics.players.map((player) => ({
      index: player.index,
      local: player.local,
      name: player.name,
      side: player.side,
      baseSide: player.baseSide,
      playerTypeName: player.playerTypeName,
      skirmishAI: player.skirmishAI,
      difficultyName: player.difficultyName,
      active: player.active,
      dead: player.dead,
      playableSide: player.playableSide,
      money: player.money,
      relationshipToLocal: player.relationshipToLocal,
      templateName: player.template?.name ?? null,
      buildList: player.buildList ?? null,
      objects: player.objects ? {
        total: player.objects.total,
        structures: player.objects.structures,
        infantry: player.objects.infantry,
        vehicles: player.objects.vehicles,
        commandCenters: player.objects.commandCenters,
        productionObjects: player.objects.productionObjects,
        dozers: player.objects.dozers,
        harvesters: player.objects.harvesters,
        supplySources: player.objects.supplySources,
      } : null,
    })),
  };
}

function indexedPlayers(diagnostics) {
  const players = diagnostics?.players;
  if (!Array.isArray(players)) {
    return new Map();
  }
  return new Map(players.map((player) => [Number(player.index), player]));
}

function enemyAiPlayers(diagnostics) {
  const players = diagnostics?.players;
  if (!Array.isArray(players)) {
    return [];
  }
  return players.filter((player) =>
    player?.local !== true &&
    player?.skirmishAI === true &&
    player?.relationshipToLocal === "enemy");
}

function summarizeEnemyAiActivity(initialGameplay, finalGameplay, framesAdvanced) {
  const initialDiagnostics = initialGameplay?.playerDiagnostics;
  const finalDiagnostics = finalGameplay?.playerDiagnostics;
  const initialEnemies = enemyAiPlayers(initialDiagnostics);
  const finalPlayers = indexedPlayers(finalDiagnostics);
  const enemySummaries = initialEnemies.map((initial) => {
    const final = finalPlayers.get(Number(initial.index)) ?? null;
    const initialObjects = Number(initial.objects?.total ?? 0);
    const finalObjects = Number(final?.objects?.total ?? 0);
    const initialMoney = Number(initial.money ?? 0);
    const finalMoney = Number(final?.money ?? initialMoney);
    return {
      index: initial.index,
      side: initial.side,
      difficultyName: initial.difficultyName,
      initialMoney,
      finalMoney: final == null ? null : finalMoney,
      initialObjects,
      finalObjects: final == null ? null : finalObjects,
      objectDelta: final == null ? null : finalObjects - initialObjects,
      moneyDelta: final == null ? null : finalMoney - initialMoney,
      initialBuildListEntries: initial.buildList?.entries ?? null,
      finalBuildListEntries: final?.buildList?.entries ?? null,
      finalObjectBreakdown: final?.objects ?? null,
      activeEvidence: final != null && (
        finalObjects > initialObjects ||
        finalMoney < initialMoney ||
        Number(final.objects?.structures ?? 0) > Number(initial.objects?.structures ?? 0) ||
        Number(final.objects?.infantry ?? 0) > Number(initial.objects?.infantry ?? 0) ||
        Number(final.objects?.vehicles ?? 0) > Number(initial.objects?.vehicles ?? 0)
      ),
    };
  });
  return {
    framesAdvanced,
    initialFrame: initialGameplay?.logicFrame ?? null,
    finalFrame: finalGameplay?.logicFrame ?? null,
    localPlayerIndex: finalDiagnostics?.localPlayerIndex ?? initialDiagnostics?.localPlayerIndex ?? null,
    enemyAiCount: initialEnemies.length,
    activityDetected: enemySummaries.some((summary) => summary.activeEvidence),
    enemySummaries,
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
    d3d8DrawCache: compactD3D8DrawCache(frame.d3d8DrawCache),
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

async function findOrPromotePreparedArchives(page, archives) {
  return page.evaluate(async (inputs) => {
    const installName = "install-runtime-frame-profile";
    const installRoot = `cnc-library/${installName}`;
    const root = await navigator.storage.getDirectory();

    const openDirectory = async (start, components, create = false) => {
      let directory = start;
      for (const component of components) {
        directory = await directory.getDirectoryHandle(component, { create });
      }
      return directory;
    };
    const validateDirectory = async (directory) => {
      const prepared = [];
      for (const input of inputs) {
        try {
          const handle = await directory.getFileHandle(input.name);
          const file = await handle.getFile();
          if (file.size !== input.expectedBytes) {
            return null;
          }
          prepared.push({
            name: input.name,
            sourceName: input.sourceName,
            size: file.size,
            bytes: file.size,
            expectedBytes: input.expectedBytes,
            opfsPath: `${installRoot}/${input.name}`,
          });
        } catch {
          return null;
        }
      }
      return prepared;
    };

    try {
      const installed = await openDirectory(root, ["cnc-library", installName]);
      const prepared = await validateDirectory(installed);
      if (prepared) {
        return { ok: true, source: "installed-cache", installRoot, archives: prepared };
      }
    } catch {
      // A missing or incomplete cache is repaired from the prior benchmark
      // namespace below when one is available.
    }

    let archiveRoot;
    try {
      archiveRoot = await root.getDirectoryHandle("cnc-archives");
    } catch {
      return { ok: false, source: "none", installRoot, archives: [] };
    }

    let sourceDirectory = null;
    let sourceNamespace = null;
    for await (const [name, handle] of archiveRoot.entries()) {
      if (handle.kind !== "directory" || !name.startsWith("ns-")) {
        continue;
      }
      try {
        const candidate = await openDirectory(handle, ["assets", "runtime-frame-profile"]);
        let complete = true;
        for (const input of inputs) {
          const file = await (await candidate.getFileHandle(input.name)).getFile();
          if (file.size !== input.expectedBytes) {
            complete = false;
            break;
          }
        }
        if (complete) {
          sourceDirectory = candidate;
          sourceNamespace = name;
          break;
        }
      } catch {
        // Continue looking for a complete namespace.
      }
    }
    if (!sourceDirectory) {
      return { ok: false, source: "none", installRoot, archives: [] };
    }

    const library = await root.getDirectoryHandle("cnc-library", { create: true });
    const installed = await library.getDirectoryHandle(installName, { create: true });
    for (const input of inputs) {
      const source = await sourceDirectory.getFileHandle(input.name);
      let moved = false;
      if (typeof source.move === "function") {
        try {
          await source.move(installed, input.name);
          moved = true;
        } catch {
          moved = false;
        }
      }
      if (!moved) {
        const sourceFile = await source.getFile();
        const target = await installed.getFileHandle(input.name, { create: true });
        const writable = await target.createWritable();
        await sourceFile.stream().pipeTo(writable);
      }
    }
    const prepared = await validateDirectory(installed);
    return prepared
      ? {
          ok: true,
          source: "promoted-namespace",
          sourceNamespace,
          installRoot,
          archives: prepared,
        }
      : { ok: false, source: "promotion-failed", sourceNamespace, installRoot, archives: [] };
  }, archives);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, args]) => window.CnCPort.rpc(name, args), [command, payload]);
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

async function postMouse(page, message, point) {
  const result = await rpc(page, "postMessage", {
    message,
    lParam: win32PointLParam(point),
    point,
  });
  expect(result?.ok === true, "profile mouse message was not posted", result);
  return result;
}

async function runUiFrames(page, frames, label) {
  const result = await rpc(page, "realEngineFrame", { frames });
  expect(result?.ok === true && result.aborted === false,
    `${label} UI frame failed`, result);
  return result;
}

async function runUiSummary(page, frames, label, payload = {}) {
  const result = await rpc(page, "realEngineFrameSummary", { frames, ...payload });
  expect(result?.ok === true && result.aborted === false,
    `${label} summary frame failed`, result);
  return result;
}

async function waitForUiCondition(page, label, predicate, maxFrames = 180) {
  const attempts = [];
  let last = null;
  for (let frame = 0; frame < maxFrames;) {
    const frames = Math.min(uiBatchSize, maxFrames - frame);
    last = await runUiFrames(page, frames, label);
    frame += frames;
    const clientState = last.frame?.clientState ?? {};
    attempts.push({
      framesCompleted: last.frame?.framesCompleted ?? null,
      shell: clientState.shell ?? null,
      transition: clientState.transition ?? null,
      gameplay: compactGameplay(last.frame?.gameplay),
      mainMenu: clientState.mainMenu ?? null,
      skirmishMenu: clientState.skirmishMenu ?? null,
    });
    if (predicate(clientState, last)) {
      return last;
    }
  }
  expect(false, `${label} did not satisfy condition`, {
    attempts: attempts.slice(-8),
    last: attempts[attempts.length - 1] ?? null,
  });
}

async function revealShellMenu(page, shellMap) {
  if (!shellMap) {
    return;
  }
  for (const point of [{ x: 32, y: 32 }, { x: 96, y: 96 }]) {
    await rpc(page, "postMessage", {
      message: 0x0200,
      lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
      point,
    });
    const frame = await rpc(page, "realEngineFrameTick", { frames: 2 });
    expect(frame?.ok === true && frame.aborted === false,
      "runtime frame profile menu reveal frame failed", frame);
  }
}

function realMenuHitMatches(menu, hitProbeName, buttonFieldName) {
  const hitWindow = menu?.[hitProbeName]?.window;
  const button = menu?.[buttonFieldName];
  return button?.clickable === true && hitWindow?.found === true && hitWindow.id === button.id;
}

function collectWindowRefs(clientState) {
  const refs = [];
  for (const group of [clientState?.mainMenu, clientState?.skirmishMenu]) {
    for (const value of Object.values(group ?? {})) {
      if (value?.found === true && Number.isFinite(value.id)) {
        refs.push(value);
      }
      if (value?.window?.found === true && Number.isFinite(value.window.id)) {
        refs.push(value.window);
      }
    }
  }
  for (const field of ["focusWindow", "captureWindow", "grabWindow"]) {
    const ref = clientState?.input?.[field];
    if (ref?.found === true && Number.isFinite(ref.id)) {
      refs.push(ref);
    }
  }
  return refs;
}

function findWindowById(clientState, id) {
  return collectWindowRefs(clientState).find((ref) => ref.id === id) ?? null;
}

async function revealMainMenu(page) {
  const seedPoint = { x: 32, y: 32 };
  const revealPoint = { x: 96, y: 96 };
  await postMouse(page, WM_MOUSEMOVE, seedPoint);
  await waitForUiCondition(
    page,
    "profile main-menu seed mouse move",
    (clientState) => clientState.input?.mouse?.x === seedPoint.x &&
      clientState.input?.mouse?.y === seedPoint.y,
    12);

  await postMouse(page, WM_MOUSEMOVE, revealPoint);
  return waitForUiCondition(
    page,
    "profile main-menu reveal",
    (clientState) => clientState.input?.mouse?.x === revealPoint.x &&
      clientState.input?.mouse?.y === revealPoint.y &&
      clientState.transition?.finished === true &&
      clientState.input?.mouse?.visible === true &&
      realMenuHitMatches(clientState.mainMenu, "underButtonSinglePlayerCenter", "buttonSinglePlayer"),
    120);
}

async function waitForButtonDown(page, target, label, maxFrames = 12) {
  return waitForUiCondition(
    page,
    `${label} down`,
    (clientState) => {
      const downTarget = findWindowById(clientState, target.id);
      return clientState.input?.grabWindow?.id === target.id && downTarget?.selected === true;
    },
    maxFrames);
}

async function waitForButtonReleased(page, target, label, maxFrames = 12) {
  return waitForUiCondition(
    page,
    `${label} release`,
    (clientState) => {
      const finalTarget = findWindowById(clientState, target.id);
      return finalTarget == null || finalTarget.selected === false;
    },
    maxFrames);
}

async function clickButton(page, button, hitProbe, label, settleFrames = 120) {
  expect(button?.clickable === true, `${label} button is not clickable`, button);
  const point = hitProbe?.point ?? { x: button.centerX, y: button.centerY };
  expect(Number.isFinite(point.x) && Number.isFinite(point.y),
    `${label} click point is invalid`, { button, hitProbe, point });
  const target = hitProbe?.window?.found === true ? hitProbe.window : button;
  expect(target?.clickable === true, `${label} target is not clickable`, { button, hitProbe, target });

  await postMouse(page, WM_MOUSEMOVE, point);
  await postMouse(page, WM_LBUTTONDOWN, point);
  await waitForButtonDown(page, target, label);
  await postMouse(page, WM_LBUTTONUP, point);
  const released = await waitForButtonReleased(page, target, label);
  if (settleFrames == null) {
    return { point, target, released, settled: released };
  }
  const settled = await waitForUiCondition(
    page,
    label,
    (clientState) => clientState.transition?.ready === true &&
      clientState.transition?.finished === true,
    settleFrames);
  return { point, target, released, settled };
}

async function waitForSkirmishMatch(page, maxFrames, chunkSize, summaryPayload = {}) {
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced < maxFrames) {
    if (setupRenderDisabled) {
      const suppressed = await rpc(page, "realEngineSetRenderDisabled", { disabled: true });
      expect(suppressed?.ok === true,
        "runtime frame profile could not retain map-load render suppression", suppressed);
    }
    const frames = Math.min(chunkSize, maxFrames - framesAdvanced);
    let result = await runUiSummary(page, frames, "profile skirmish match wait", summaryPayload);
    framesAdvanced += frames;
    let gameplay = result.frame?.gameplay;
    samples.push({
      framesCompleted: result.frame?.framesCompleted ?? null,
      ...compactGameplay(gameplay),
    });
    const simulationReady = gameplay?.gameMode === GAME_SKIRMISH &&
        gameplay?.inGame === true &&
        gameplay?.loadingMap === false &&
        gameplay?.inputEnabled === true &&
        Number(gameplay?.objectCount ?? 0) > 0 &&
        Number(gameplay?.drawableCount ?? 0) > 0;
    if (simulationReady && setupRenderDisabled &&
        Number(gameplay?.renderedObjectCount ?? 0) <= 0) {
      const restored = await rpc(page, "realEngineSetRenderDisabled", { disabled: false });
      expect(restored?.ok === true,
        "runtime frame profile could not render the active match", restored);
      for (let renderFrame = 0;
        renderFrame < 8 && Number(gameplay?.renderedObjectCount ?? 0) <= 0;
        renderFrame += 1) {
        result = await runUiSummary(page, 1, "profile active match first rendered frame", summaryPayload);
        framesAdvanced += 1;
        gameplay = result.frame?.gameplay;
        samples.push({
          framesCompleted: result.frame?.framesCompleted ?? null,
          ...compactGameplay(gameplay),
        });
      }
    }
    if (simulationReady && Number(gameplay?.renderedObjectCount ?? 0) > 0) {
      return { result, framesAdvanced, samples };
    }
  }
  expect(false, "profile skirmish did not reach an active match", {
    maxFrames,
    samples: samples.slice(-12),
  });
}

async function enterSkirmishScene(page) {
  let frame = await runUiFrames(page, 5, "profile initial menu frames");
  if (frame.frame?.clientState?.shell?.topIsMainMenu !== true) {
    frame = await waitForUiCondition(
      page,
      "profile main menu available",
      (clientState) => clientState.shell?.topIsMainMenu === true &&
        clientState.shell?.topHidden === false,
      120);
  }
  expect(frame.frame?.clientState?.mainMenu?.buttonSinglePlayer?.found === true,
    "profile main menu Single Player button geometry is unavailable",
    frame.frame?.clientState?.mainMenu?.buttonSinglePlayer);

  const revealed = await revealMainMenu(page);
  const singlePlayerClick = await clickButton(
    page,
    revealed.frame.clientState.mainMenu.buttonSinglePlayer,
    revealed.frame.clientState.mainMenu.underButtonSinglePlayerCenter,
    "profile single-player");
  const singlePlayerMenu = singlePlayerClick.settled.frame?.clientState?.mainMenu;
  expect(singlePlayerMenu?.buttonSkirmish?.clickable === true,
    "profile single-player menu did not expose ButtonSkirmish", singlePlayerMenu);

  const skirmishClick = await clickButton(
    page,
    singlePlayerMenu.buttonSkirmish,
    null,
    "profile skirmish");
  const skirmishMenuReady = skirmishClick.settled.frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true
    ? skirmishClick.settled
    : await waitForUiCondition(
      page,
      "profile skirmish options menu",
      (clientState) => clientState.skirmishMenu?.buttonStart?.clickable === true,
      180);
  const skirmishMenu = skirmishMenuReady.frame?.clientState?.skirmishMenu;
  expect(skirmishMenu?.parent?.found === true && skirmishMenu?.buttonStart?.clickable === true,
    "profile skirmish game options menu did not become startable", skirmishMenu);

  const requestedMap = String(process.env.PERF_PROFILE_SKIRMISH_MAP ?? "").trim();
  let skirmishMapSet = null;
  if (requestedMap) {
    skirmishMapSet = await rpc(page, "realEngineSetSkirmishMap", { map: requestedMap });
    expect(skirmishMapSet?.ok === true && skirmishMapSet.result?.applied,
      "profile requested skirmish map was not applied", skirmishMapSet);
    await runUiSummary(page, 1, "profile skirmish map apply settle");
  }

  const requestedTemplate = String(process.env.PERF_PROFILE_SKIRMISH_TEMPLATE ?? "").trim();
  let skirmishTemplateSet = null;
  if (requestedTemplate) {
    skirmishTemplateSet = await rpc(page, "realEngineSetSkirmishLocalTemplate", {
      templateName: requestedTemplate,
    });
    expect(skirmishTemplateSet?.ok === true && skirmishTemplateSet.result?.applied,
      "profile requested skirmish player template was not applied", skirmishTemplateSet);
    await runUiSummary(page, 1, "profile skirmish template apply settle");
  }

  const requestedSeed = parseOptionalUint31("PERF_PROFILE_SKIRMISH_SEED");
  let skirmishSeedSet = null;
  if (requestedSeed != null) {
    skirmishSeedSet = await rpc(page, "realEngineSetSkirmishSeed", {
      seed: requestedSeed,
    });
    expect(skirmishSeedSet?.ok === true
        && skirmishSeedSet.result?.applied === requestedSeed,
      "profile requested skirmish seed was not applied", skirmishSeedSet);
  }

  await clickButton(
    page,
    skirmishMenu.buttonStart,
    skirmishMenu.underButtonStartCenter,
    "profile skirmish start",
    null);
  let loadRenderToggle = null;
  let loadResetFrames = 0;
  if (setupRenderDisabled) {
    // startNewGame recreates GlobalData, which restores m_disableRender to
    // its product default on a later update. Step the reset boundary one frame
    // at a time and reapply suppression before every step; at most the reset
    // frame itself can draw, while the measured match remains unaffected.
    loadResetFrames = parsePositiveInt("PERF_PROFILE_SKIRMISH_RESET_FRAMES", 8);
    for (let frame = 0; frame < loadResetFrames; frame += 1) {
      loadRenderToggle = await rpc(page, "realEngineSetRenderDisabled", { disabled: true });
      expect(loadRenderToggle?.ok === true,
        "runtime frame profile could not suppress map-load rendering", loadRenderToggle);
      await runUiSummary(page, 1, "profile skirmish start reset settle");
    }
  }
  const active = await waitForSkirmishMatch(
    page,
    parsePositiveInt("PERF_PROFILE_SKIRMISH_MAX_START_FRAMES", 4200),
    parsePositiveInt("PERF_PROFILE_SKIRMISH_START_CHUNK", 30),
    skirmishPlayerDiagnostics ? { playerDiagnostics: true } : {});
  const postActiveFrames = parsePositiveInt("PERF_PROFILE_SKIRMISH_POST_ACTIVE_FRAMES", 0);
  let postActive = null;
  if (postActiveFrames > 0) {
    postActive = await runUiSummary(
      page,
      postActiveFrames,
      "profile skirmish post-active settle",
      skirmishPlayerDiagnostics ? { playerDiagnostics: true } : {});
  }
  const activeGameplay = compactGameplay(active.result?.frame?.gameplay);
  const postActiveGameplay = compactGameplay(postActive?.frame?.gameplay);

  return {
    requestedMap: requestedMap || null,
    skirmishMapSet: skirmishMapSet?.result ?? null,
    requestedTemplate: requestedTemplate || null,
    skirmishTemplateSet: skirmishTemplateSet?.result ?? null,
    requestedSeed,
    skirmishSeedSet: skirmishSeedSet?.result ?? null,
    loadRenderToggle,
    loadResetFrames,
    activeFramesAdvanced: active.framesAdvanced,
    activeSamples: active.samples.slice(-12),
    activeGameplay,
    postActiveFrames,
    postActiveGameplay,
    enemyAiActivity: skirmishPlayerDiagnostics && postActiveGameplay != null
      ? summarizeEnemyAiActivity(activeGameplay, postActiveGameplay, postActiveFrames)
      : null,
  };
}

async function queryRenderer(browser) {
  try {
    // Ask the browser process instead of creating a disposable page context.
    // Headless real-GPU ANGLE can evict the game context when a second WebGL
    // context is created, which turns the profiled canvas black before boot.
    const session = await browser.newBrowserCDPSession();
    try {
      const info = await session.send("SystemInfo.getInfo");
      return info?.gpu?.devices?.[0]?.deviceString
        ?? info?.gpu?.auxAttributes?.glRenderer
        ?? "NO_GPU_DEVICE";
    } finally {
      await session.detach();
    }
  } catch (error) {
    return `ERROR: ${error?.message ?? String(error)}`;
  }
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
  "drawNativeRepeatedAppendBatches",
  "drawNativeRepeatedAppends",
  "drawNativeRepeatedAppendFailures",
  "frameCommandSegments",
  "frameCommandQueuedDraws",
  "frameCommandReplayedDraws",
  "frameCommandImmediateDraws",
  "frameCommandMaxSegmentDraws",
  "frameCommandDynamicSnapshots",
  "frameCommandDynamicSnapshotBytes",
  "frameCommandArenaUploads",
  "frameCommandArenaUploadBytes",
  "frameCommandCaptureMs",
  "frameCommandArenaUploadMs",
  "frameCommandReplayMs",
  "drawRepeatedGeometryBatches",
  "drawRepeatedGeometryCopies",
  "drawRepeatedGeometryCopyBytes",
  "drawRepeatedGeometryFallbacks",
  "drawMultiWorldBatches",
  "drawMultiWorldCopies",
  "drawMultiWorldCopyBytes",
  "drawMultiWorldFallbacks",
  "drawMultiWorldSnapshots",
  "drawMultiWorldQueueCandidates",
  "drawLitTex1ProgramDraws",
  "drawDepthStencilOnlyProgramDraws",
  "drawDepthStencilNoDiscardDraws",
  "drawDepthStencilOnlyFastDerivedDraws",
  "unlitTex2ProgramDraws",
  "unlitTex2FixedFunctionDraws",
  "unlitTex2SM1Draws",
  "simpleFFProgramDraws",
  "fastSimpleFFProgramDraws",
  "staticSM1ProgramDraws",
  "terrainShroudFusedDraws",
  "gpuFrameTimerSampleCount",
  "gpuFrameTimerTotalMs",
  "gpuFrameTimerDisjointSamples",
  "drawMatrixNormalizations",
  "drawMatrixScratchCopies",
  "drawMatrixAllocatedCopies",
  "drawPayloadCalls",
  "drawPayloadReused",
  "drawClipPlanePayloadCopies",
  "drawClipPlanePayloadSkips",
  "drawMaterialPayloadCopies",
  "drawMaterialPayloadSkips",
  "drawLightPayloadCopies",
  "drawLightPayloadSkips",
  "drawDerivedCacheHits",
  "drawDerivedCacheMisses",
  "drawUniformCacheHits",
  "drawUniformCacheMisses",
  "drawTransformUniformCacheHits",
  "drawTransformUniformCacheMisses",
  "drawWorldTransformUniformCacheHits",
  "drawWorldTransformUniformCacheMisses",
  "drawViewTransformUniformCacheHits",
  "drawViewTransformUniformCacheMisses",
  "drawProjectionTransformUniformCacheHits",
  "drawProjectionTransformUniformCacheMisses",
  "drawPointSpriteUniformCacheHits",
  "drawPointSpriteUniformCacheMisses",
  "drawTextureUniformCacheHits",
  "drawTextureUniformCacheMisses",
  "drawTextureActiveCacheHits",
  "drawTextureActiveCacheMisses",
  "drawTextureBindCacheHits",
  "drawTextureBindCacheMisses",
  "drawTextureSamplerCacheHits",
  "drawTextureSamplerCacheMisses",
  "drawVertexAttribCacheHits",
  "drawVertexAttribCacheMisses",
  "drawVertexArrayCacheHits",
  "drawVertexArrayCacheMisses",
  "drawViewportCacheHits",
  "drawViewportCacheMisses",
  "drawRenderStateGlCacheHits",
  "drawRenderStateGlCacheMisses",
  "drawBaseUniformCacheHits",
  "drawBaseUniformCacheMisses",
  "drawMaterialUniformCacheHits",
  "drawMaterialUniformCacheMisses",
  "drawFixedLightUniformCacheHits",
  "drawFixedLightUniformCacheMisses",
  "drawStageUniformCacheHits",
  "drawStageUniformCacheMisses",
  "drawAlphaFogUniformCacheHits",
  "drawAlphaFogUniformCacheMisses",
  "uniformGlCalls",
  "uniformGlSkipped",
  "sortedDrawProfiledCalls",
  "sortedDrawProfiledMs",
  "sortedDrawPreBatchMs",
  "sortedDrawDerivedMs",
  "sortedDrawTextureDiagMs",
  "sortedDrawViewportMs",
  "sortedDrawDiagnosticsMs",
  "sortedDrawGeometryMs",
  "sortedDrawProgramMs",
  "sortedDrawFillShadeMs",
  "sortedDrawVertexAttribMs",
  "sortedDrawTextureBindMs",
  "sortedDrawUniformMs",
  "sortedDrawApplyRenderStateMs",
  "sortedDrawRenderBuildMs",
  "sortedDrawRenderBaseUniformMs",
  "sortedDrawRenderMaterialUniformMs",
  "sortedDrawRenderLightUniformMs",
  "sortedDrawRenderStageUniformMs",
  "sortedDrawRenderAlphaFogUniformMs",
  "sortedDrawRenderUniformMs",
  "sortedDrawTransformUniformMs",
  "sortedDrawTransformCompareMs",
  "sortedDrawWorldTransformUniformMs",
  "sortedDrawViewTransformUniformMs",
  "sortedDrawProjectionTransformUniformMs",
  "sortedDrawPointSpriteUniformMs",
  "sortedDrawTextureUniformMs",
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
  "bufferVertexUpdates",
  "bufferVertexUploadBytes",
  "bufferIndexUpdates",
  "bufferIndexUploadBytes",
  "bufferDynamicUpdates",
  "bufferDynamicUploadBytes",
  "bufferDiscardUpdates",
  "bufferDiscardUploadBytes",
  "bufferNoOverwriteUpdates",
  "bufferNoOverwriteUploadBytes",
  "bufferOrphanedUpdates",
  "bufferDynamicRedirectedUpdates",
  "bufferDynamicRangeUploads",
  "bufferDynamicRangeUploadBytes",
  "bufferDynamicRedirectFallbacks",
  "drawDynamicVertexRedirects",
  "drawDynamicVertexSharedFallbacks",
  "drawDynamicIndexRedirects",
  "drawDynamicIndexSharedFallbacks",
  "bufferResizedUpdates",
  "bufferUpdateMs",
  "bufferSubDataMs",
  "bufferMirrorBytes",
  "bufferMirrorMs",
  "bufferMirrorSkippedBytes",
];

const bufferProducerFields = [
  "updates",
  "uploadBytes",
  "vertexUpdates",
  "vertexUploadBytes",
  "indexUpdates",
  "indexUploadBytes",
  "dynamicUpdates",
  "dynamicUploadBytes",
  "discardUpdates",
  "discardUploadBytes",
  "noOverwriteUpdates",
  "noOverwriteUploadBytes",
  "orphanedUpdates",
  "resizedUpdates",
  "updateMs",
  "bufferSubDataMs",
  "mirrorMs",
  "mirrorBytes",
  "mirrorSkippedBytes",
];

const drawProducerPhaseSuffixes = [
  "PreBatch",
  "Derived",
  "TextureDiag",
  "Viewport",
  "Diagnostics",
  "Geometry",
  "Program",
  "FillShade",
  "VertexAttrib",
  "TextureBind",
  "Uniform",
  "ApplyRenderState",
  "RenderBuild",
  "RenderBaseUniform",
  "RenderMaterialUniform",
  "RenderLightUniform",
  "RenderStageUniform",
  "RenderAlphaFogUniform",
  "RenderUniform",
  "TransformUniform",
  "TransformCompare",
  "WorldTransformUniform",
  "ViewTransformUniform",
  "ProjectionTransformUniform",
  "PointSpriteUniform",
  "TextureUniform",
  "DrawOrBatch",
  "Tail",
];
const drawProducerGenericPhaseFields = drawProducerPhaseSuffixes.map((suffix) => `draw${suffix}Ms`);
const drawProducerSortedPhaseFields = drawProducerPhaseSuffixes.map((suffix) => `sortedDraw${suffix}Ms`);

const drawProducerFields = [
  "calls",
  "indices",
  "drawProfiledMs",
  ...drawProducerGenericPhaseFields,
  "sortedCalls",
  "sortedIndices",
  "sortedDrawProfiledMs",
  ...drawProducerSortedPhaseFields,
];

function bufferProducerMap(perf) {
  const result = new Map();
  for (const entry of perf?.bufferProducers ?? []) {
    if (typeof entry?.producer === "string" && entry.producer.length > 0) {
      result.set(entry.producer, entry);
    }
  }
  return result;
}

function bufferProducerDelta(before, after, framesAdvanced) {
  if (!before?.bufferProducerTracking && !after?.bufferProducerTracking) {
    return [];
  }
  const beforeMap = bufferProducerMap(before);
  const afterMap = bufferProducerMap(after);
  const producers = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const delta = [];
  for (const producer of producers) {
    const beforeEntry = beforeMap.get(producer) ?? {};
    const afterEntry = afterMap.get(producer) ?? {};
    const entry = { producer };
    for (const field of bufferProducerFields) {
      const beforeValue = Number(beforeEntry[field] ?? 0);
      const afterValue = Number(afterEntry[field] ?? 0);
      entry[field] = Number.isFinite(beforeValue) && Number.isFinite(afterValue)
        ? afterValue - beforeValue
        : null;
    }
    if (framesAdvanced > 0) {
      entry.perFrame = {};
      for (const field of bufferProducerFields) {
        entry.perFrame[field] = Number(entry[field] ?? 0) / framesAdvanced;
      }
    }
    delta.push(entry);
  }
  return delta
    .filter((entry) => Number(entry.uploadBytes ?? 0) > 0 || Number(entry.updates ?? 0) > 0)
    .sort((a, b) =>
      Number(b.uploadBytes ?? 0) - Number(a.uploadBytes ?? 0)
      || Number(b.updates ?? 0) - Number(a.updates ?? 0))
    .slice(0, 64);
}

function drawProducerMap(perf) {
  const result = new Map();
  for (const entry of perf?.drawProducers ?? []) {
    if (typeof entry?.producer === "string" && entry.producer.length > 0) {
      result.set(entry.producer, entry);
    }
  }
  return result;
}

function drawProducerDelta(before, after, framesAdvanced) {
  if (!before?.drawProducerTracking && !after?.drawProducerTracking) {
    return [];
  }
  const beforeMap = drawProducerMap(before);
  const afterMap = drawProducerMap(after);
  const producers = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const delta = [];
  for (const producer of producers) {
    const beforeEntry = beforeMap.get(producer) ?? {};
    const afterEntry = afterMap.get(producer) ?? {};
    const entry = { producer };
    for (const field of drawProducerFields) {
      const beforeValue = Number(beforeEntry[field] ?? 0);
      const afterValue = Number(afterEntry[field] ?? 0);
      entry[field] = Number.isFinite(beforeValue) && Number.isFinite(afterValue)
        ? afterValue - beforeValue
        : null;
    }
    if (framesAdvanced > 0) {
      entry.perFrame = {};
      for (const field of drawProducerFields) {
        entry.perFrame[field] = Number(entry[field] ?? 0) / framesAdvanced;
      }
    }
    delta.push(entry);
  }
  return delta
    .filter((entry) => Number(entry.calls ?? 0) > 0 || Number(entry.sortedDrawProfiledMs ?? 0) > 0)
    .sort((a, b) =>
      Number(b.drawProfiledMs ?? 0) - Number(a.drawProfiledMs ?? 0)
      || Number(b.sortedDrawProfiledMs ?? 0) - Number(a.sortedDrawProfiledMs ?? 0)
      || Number(b.calls ?? 0) - Number(a.calls ?? 0))
    .slice(0, 64);
}

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
  const bufferProducers = bufferProducerDelta(before, after, framesAdvanced);
  const drawProducers = drawProducerDelta(before, after, framesAdvanced);
  return {
    before,
    after,
    delta,
    trackedGlCallMs,
    trackedBrowserMs,
    bufferProducers,
    drawProducers,
    perFrame: framesAdvanced > 0
      ? {
          draws: Number(delta.draws ?? 0) / framesAdvanced,
          drawMs: Number(delta.drawMs ?? 0) / framesAdvanced,
          drawBatchCandidates: Number(delta.drawBatchCandidates ?? 0) / framesAdvanced,
          drawBatchMerged: Number(delta.drawBatchMerged ?? 0) / framesAdvanced,
          drawBatchFlushes: Number(delta.drawBatchFlushes ?? 0) / framesAdvanced,
          drawBatchSavedDrawElements: Number(delta.drawBatchSavedDrawElements ?? 0) / framesAdvanced,
          drawBatchMergedIndices: Number(delta.drawBatchMergedIndices ?? 0) / framesAdvanced,
          drawRepeatedGeometryBatches:
            Number(delta.drawRepeatedGeometryBatches ?? 0) / framesAdvanced,
          drawRepeatedGeometryCopies:
            Number(delta.drawRepeatedGeometryCopies ?? 0) / framesAdvanced,
          drawRepeatedGeometryCopyBytes:
            Number(delta.drawRepeatedGeometryCopyBytes ?? 0) / framesAdvanced,
          drawRepeatedGeometryFallbacks:
            Number(delta.drawRepeatedGeometryFallbacks ?? 0) / framesAdvanced,
          drawMultiWorldBatches: Number(delta.drawMultiWorldBatches ?? 0) / framesAdvanced,
          drawMultiWorldCopies: Number(delta.drawMultiWorldCopies ?? 0) / framesAdvanced,
          drawMultiWorldCopyBytes:
            Number(delta.drawMultiWorldCopyBytes ?? 0) / framesAdvanced,
          drawMultiWorldFallbacks:
            Number(delta.drawMultiWorldFallbacks ?? 0) / framesAdvanced,
          drawMultiWorldSnapshots:
            Number(delta.drawMultiWorldSnapshots ?? 0) / framesAdvanced,
          drawMultiWorldQueueCandidates:
            Number(delta.drawMultiWorldQueueCandidates ?? 0) / framesAdvanced,
          drawLitTex1ProgramDraws:
            Number(delta.drawLitTex1ProgramDraws ?? 0) / framesAdvanced,
          drawNativeRepeatedAppendBatches:
            Number(delta.drawNativeRepeatedAppendBatches ?? 0) / framesAdvanced,
          drawNativeRepeatedAppends:
            Number(delta.drawNativeRepeatedAppends ?? 0) / framesAdvanced,
          drawNativeRepeatedAppendFailures:
            Number(delta.drawNativeRepeatedAppendFailures ?? 0) / framesAdvanced,
          frameCommandSegments:
            Number(delta.frameCommandSegments ?? 0) / framesAdvanced,
          frameCommandQueuedDraws:
            Number(delta.frameCommandQueuedDraws ?? 0) / framesAdvanced,
          frameCommandReplayedDraws:
            Number(delta.frameCommandReplayedDraws ?? 0) / framesAdvanced,
          frameCommandImmediateDraws:
            Number(delta.frameCommandImmediateDraws ?? 0) / framesAdvanced,
          frameCommandDynamicSnapshots:
            Number(delta.frameCommandDynamicSnapshots ?? 0) / framesAdvanced,
          frameCommandDynamicSnapshotBytes:
            Number(delta.frameCommandDynamicSnapshotBytes ?? 0) / framesAdvanced,
          frameCommandArenaUploads:
            Number(delta.frameCommandArenaUploads ?? 0) / framesAdvanced,
          frameCommandArenaUploadBytes:
            Number(delta.frameCommandArenaUploadBytes ?? 0) / framesAdvanced,
          frameCommandCaptureMs:
            Number(delta.frameCommandCaptureMs ?? 0) / framesAdvanced,
          frameCommandArenaUploadMs:
            Number(delta.frameCommandArenaUploadMs ?? 0) / framesAdvanced,
          frameCommandReplayMs:
            Number(delta.frameCommandReplayMs ?? 0) / framesAdvanced,
          drawDepthStencilOnlyProgramDraws:
            Number(delta.drawDepthStencilOnlyProgramDraws ?? 0) / framesAdvanced,
          drawDepthStencilOnlyFastDerivedDraws:
            Number(delta.drawDepthStencilOnlyFastDerivedDraws ?? 0) / framesAdvanced,
          unlitTex2ProgramDraws: Number(delta.unlitTex2ProgramDraws ?? 0) / framesAdvanced,
          unlitTex2FixedFunctionDraws:
            Number(delta.unlitTex2FixedFunctionDraws ?? 0) / framesAdvanced,
          unlitTex2SM1Draws: Number(delta.unlitTex2SM1Draws ?? 0) / framesAdvanced,
          simpleFFProgramDraws: Number(delta.simpleFFProgramDraws ?? 0) / framesAdvanced,
          fastSimpleFFProgramDraws:
            Number(delta.fastSimpleFFProgramDraws ?? 0) / framesAdvanced,
          staticSM1ProgramDraws: Number(delta.staticSM1ProgramDraws ?? 0) / framesAdvanced,
          terrainShroudFusedDraws:
            Number(delta.terrainShroudFusedDraws ?? 0) / framesAdvanced,
          gpuFrameTimerSamples: Number(delta.gpuFrameTimerSampleCount ?? 0),
          gpuFrameMs: Number(delta.gpuFrameTimerSampleCount ?? 0) > 0
            ? Number(delta.gpuFrameTimerTotalMs ?? 0) /
              Number(delta.gpuFrameTimerSampleCount ?? 0)
            : null,
          gpuFrameDisjointSamples: Number(delta.gpuFrameTimerDisjointSamples ?? 0),
          drawMatrixNormalizations: Number(delta.drawMatrixNormalizations ?? 0) / framesAdvanced,
          drawMatrixScratchCopies: Number(delta.drawMatrixScratchCopies ?? 0) / framesAdvanced,
          drawMatrixAllocatedCopies: Number(delta.drawMatrixAllocatedCopies ?? 0) / framesAdvanced,
          drawPayloadCalls: Number(delta.drawPayloadCalls ?? 0) / framesAdvanced,
          drawPayloadReused: Number(delta.drawPayloadReused ?? 0) / framesAdvanced,
          drawClipPlanePayloadCopies:
            Number(delta.drawClipPlanePayloadCopies ?? 0) / framesAdvanced,
          drawClipPlanePayloadSkips:
            Number(delta.drawClipPlanePayloadSkips ?? 0) / framesAdvanced,
          drawMaterialPayloadCopies:
            Number(delta.drawMaterialPayloadCopies ?? 0) / framesAdvanced,
          drawMaterialPayloadSkips:
            Number(delta.drawMaterialPayloadSkips ?? 0) / framesAdvanced,
          drawLightPayloadCopies: Number(delta.drawLightPayloadCopies ?? 0) / framesAdvanced,
          drawLightPayloadSkips: Number(delta.drawLightPayloadSkips ?? 0) / framesAdvanced,
          drawDerivedCacheHits: Number(delta.drawDerivedCacheHits ?? 0) / framesAdvanced,
          drawDerivedCacheMisses: Number(delta.drawDerivedCacheMisses ?? 0) / framesAdvanced,
          drawUniformCacheHits: Number(delta.drawUniformCacheHits ?? 0) / framesAdvanced,
          drawUniformCacheMisses: Number(delta.drawUniformCacheMisses ?? 0) / framesAdvanced,
          drawTransformUniformCacheHits: Number(delta.drawTransformUniformCacheHits ?? 0) / framesAdvanced,
          drawTransformUniformCacheMisses: Number(delta.drawTransformUniformCacheMisses ?? 0) / framesAdvanced,
          drawWorldTransformUniformCacheHits:
            Number(delta.drawWorldTransformUniformCacheHits ?? 0) / framesAdvanced,
          drawWorldTransformUniformCacheMisses:
            Number(delta.drawWorldTransformUniformCacheMisses ?? 0) / framesAdvanced,
          drawViewTransformUniformCacheHits:
            Number(delta.drawViewTransformUniformCacheHits ?? 0) / framesAdvanced,
          drawViewTransformUniformCacheMisses:
            Number(delta.drawViewTransformUniformCacheMisses ?? 0) / framesAdvanced,
          drawProjectionTransformUniformCacheHits:
            Number(delta.drawProjectionTransformUniformCacheHits ?? 0) / framesAdvanced,
          drawProjectionTransformUniformCacheMisses:
            Number(delta.drawProjectionTransformUniformCacheMisses ?? 0) / framesAdvanced,
          drawPointSpriteUniformCacheHits: Number(delta.drawPointSpriteUniformCacheHits ?? 0) / framesAdvanced,
          drawPointSpriteUniformCacheMisses: Number(delta.drawPointSpriteUniformCacheMisses ?? 0) / framesAdvanced,
          drawTextureUniformCacheHits: Number(delta.drawTextureUniformCacheHits ?? 0) / framesAdvanced,
          drawTextureUniformCacheMisses: Number(delta.drawTextureUniformCacheMisses ?? 0) / framesAdvanced,
          drawTextureActiveCacheHits: Number(delta.drawTextureActiveCacheHits ?? 0) / framesAdvanced,
          drawTextureActiveCacheMisses: Number(delta.drawTextureActiveCacheMisses ?? 0) / framesAdvanced,
          drawTextureBindCacheHits: Number(delta.drawTextureBindCacheHits ?? 0) / framesAdvanced,
          drawTextureBindCacheMisses: Number(delta.drawTextureBindCacheMisses ?? 0) / framesAdvanced,
          drawTextureSamplerCacheHits: Number(delta.drawTextureSamplerCacheHits ?? 0) / framesAdvanced,
          drawTextureSamplerCacheMisses: Number(delta.drawTextureSamplerCacheMisses ?? 0) / framesAdvanced,
          drawVertexAttribCacheHits: Number(delta.drawVertexAttribCacheHits ?? 0) / framesAdvanced,
          drawVertexAttribCacheMisses: Number(delta.drawVertexAttribCacheMisses ?? 0) / framesAdvanced,
          drawVertexArrayCacheHits: Number(delta.drawVertexArrayCacheHits ?? 0) / framesAdvanced,
          drawVertexArrayCacheMisses: Number(delta.drawVertexArrayCacheMisses ?? 0) / framesAdvanced,
          drawViewportCacheHits: Number(delta.drawViewportCacheHits ?? 0) / framesAdvanced,
          drawViewportCacheMisses: Number(delta.drawViewportCacheMisses ?? 0) / framesAdvanced,
          drawRenderStateGlCacheHits: Number(delta.drawRenderStateGlCacheHits ?? 0) / framesAdvanced,
          drawRenderStateGlCacheMisses: Number(delta.drawRenderStateGlCacheMisses ?? 0) / framesAdvanced,
          drawBaseUniformCacheHits: Number(delta.drawBaseUniformCacheHits ?? 0) / framesAdvanced,
          drawBaseUniformCacheMisses: Number(delta.drawBaseUniformCacheMisses ?? 0) / framesAdvanced,
          drawMaterialUniformCacheHits: Number(delta.drawMaterialUniformCacheHits ?? 0) / framesAdvanced,
          drawMaterialUniformCacheMisses: Number(delta.drawMaterialUniformCacheMisses ?? 0) / framesAdvanced,
          drawFixedLightUniformCacheHits: Number(delta.drawFixedLightUniformCacheHits ?? 0) / framesAdvanced,
          drawFixedLightUniformCacheMisses: Number(delta.drawFixedLightUniformCacheMisses ?? 0) / framesAdvanced,
          drawStageUniformCacheHits: Number(delta.drawStageUniformCacheHits ?? 0) / framesAdvanced,
          drawStageUniformCacheMisses: Number(delta.drawStageUniformCacheMisses ?? 0) / framesAdvanced,
          drawAlphaFogUniformCacheHits: Number(delta.drawAlphaFogUniformCacheHits ?? 0) / framesAdvanced,
          drawAlphaFogUniformCacheMisses: Number(delta.drawAlphaFogUniformCacheMisses ?? 0) / framesAdvanced,
          sortedDrawProfiledCalls: Number(delta.sortedDrawProfiledCalls ?? 0) / framesAdvanced,
          sortedDrawProfiledMs: Number(delta.sortedDrawProfiledMs ?? 0) / framesAdvanced,
          sortedDrawPreBatchMs: Number(delta.sortedDrawPreBatchMs ?? 0) / framesAdvanced,
          sortedDrawDerivedMs: Number(delta.sortedDrawDerivedMs ?? 0) / framesAdvanced,
          sortedDrawTextureDiagMs: Number(delta.sortedDrawTextureDiagMs ?? 0) / framesAdvanced,
          sortedDrawViewportMs: Number(delta.sortedDrawViewportMs ?? 0) / framesAdvanced,
          sortedDrawDiagnosticsMs: Number(delta.sortedDrawDiagnosticsMs ?? 0) / framesAdvanced,
          sortedDrawGeometryMs: Number(delta.sortedDrawGeometryMs ?? 0) / framesAdvanced,
          sortedDrawProgramMs: Number(delta.sortedDrawProgramMs ?? 0) / framesAdvanced,
          sortedDrawFillShadeMs: Number(delta.sortedDrawFillShadeMs ?? 0) / framesAdvanced,
          sortedDrawVertexAttribMs: Number(delta.sortedDrawVertexAttribMs ?? 0) / framesAdvanced,
          sortedDrawTextureBindMs: Number(delta.sortedDrawTextureBindMs ?? 0) / framesAdvanced,
          sortedDrawUniformMs: Number(delta.sortedDrawUniformMs ?? 0) / framesAdvanced,
          sortedDrawApplyRenderStateMs: Number(delta.sortedDrawApplyRenderStateMs ?? 0) / framesAdvanced,
          sortedDrawRenderBuildMs: Number(delta.sortedDrawRenderBuildMs ?? 0) / framesAdvanced,
          sortedDrawRenderBaseUniformMs: Number(delta.sortedDrawRenderBaseUniformMs ?? 0) / framesAdvanced,
          sortedDrawRenderMaterialUniformMs: Number(delta.sortedDrawRenderMaterialUniformMs ?? 0) / framesAdvanced,
          sortedDrawRenderLightUniformMs: Number(delta.sortedDrawRenderLightUniformMs ?? 0) / framesAdvanced,
          sortedDrawRenderStageUniformMs: Number(delta.sortedDrawRenderStageUniformMs ?? 0) / framesAdvanced,
          sortedDrawRenderAlphaFogUniformMs: Number(delta.sortedDrawRenderAlphaFogUniformMs ?? 0) / framesAdvanced,
          sortedDrawRenderUniformMs: Number(delta.sortedDrawRenderUniformMs ?? 0) / framesAdvanced,
          sortedDrawTransformUniformMs: Number(delta.sortedDrawTransformUniformMs ?? 0) / framesAdvanced,
          sortedDrawTransformCompareMs: Number(delta.sortedDrawTransformCompareMs ?? 0) / framesAdvanced,
          sortedDrawWorldTransformUniformMs: Number(delta.sortedDrawWorldTransformUniformMs ?? 0) / framesAdvanced,
          sortedDrawViewTransformUniformMs: Number(delta.sortedDrawViewTransformUniformMs ?? 0) / framesAdvanced,
          sortedDrawProjectionTransformUniformMs: Number(delta.sortedDrawProjectionTransformUniformMs ?? 0) / framesAdvanced,
          sortedDrawPointSpriteUniformMs: Number(delta.sortedDrawPointSpriteUniformMs ?? 0) / framesAdvanced,
          sortedDrawTextureUniformMs: Number(delta.sortedDrawTextureUniformMs ?? 0) / framesAdvanced,
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
          bufferVertexUpdates: Number(delta.bufferVertexUpdates ?? 0) / framesAdvanced,
          bufferVertexUploadBytes: Number(delta.bufferVertexUploadBytes ?? 0) / framesAdvanced,
          bufferIndexUpdates: Number(delta.bufferIndexUpdates ?? 0) / framesAdvanced,
          bufferIndexUploadBytes: Number(delta.bufferIndexUploadBytes ?? 0) / framesAdvanced,
          bufferDynamicUpdates: Number(delta.bufferDynamicUpdates ?? 0) / framesAdvanced,
          bufferDynamicUploadBytes: Number(delta.bufferDynamicUploadBytes ?? 0) / framesAdvanced,
          bufferDiscardUpdates: Number(delta.bufferDiscardUpdates ?? 0) / framesAdvanced,
          bufferDiscardUploadBytes: Number(delta.bufferDiscardUploadBytes ?? 0) / framesAdvanced,
          bufferNoOverwriteUpdates: Number(delta.bufferNoOverwriteUpdates ?? 0) / framesAdvanced,
          bufferNoOverwriteUploadBytes: Number(delta.bufferNoOverwriteUploadBytes ?? 0) / framesAdvanced,
          bufferOrphanedUpdates: Number(delta.bufferOrphanedUpdates ?? 0) / framesAdvanced,
          bufferDynamicRedirectedUpdates:
            Number(delta.bufferDynamicRedirectedUpdates ?? 0) / framesAdvanced,
          bufferDynamicRangeUploads: Number(delta.bufferDynamicRangeUploads ?? 0) / framesAdvanced,
          bufferDynamicRangeUploadBytes: Number(delta.bufferDynamicRangeUploadBytes ?? 0) / framesAdvanced,
          bufferDynamicRedirectFallbacks:
            Number(delta.bufferDynamicRedirectFallbacks ?? 0) / framesAdvanced,
          drawDynamicVertexRedirects: Number(delta.drawDynamicVertexRedirects ?? 0) / framesAdvanced,
          drawDynamicVertexSharedFallbacks:
            Number(delta.drawDynamicVertexSharedFallbacks ?? 0) / framesAdvanced,
          drawDynamicIndexRedirects: Number(delta.drawDynamicIndexRedirects ?? 0) / framesAdvanced,
          drawDynamicIndexSharedFallbacks:
            Number(delta.drawDynamicIndexSharedFallbacks ?? 0) / framesAdvanced,
          bufferResizedUpdates: Number(delta.bufferResizedUpdates ?? 0) / framesAdvanced,
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
  let sampleBrowserPerfBefore = sampleBrowserPerf ? browserPerfBefore : null;

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
    let browserPerf = null;
    if (sampleBrowserPerf) {
      const sampleBrowserPerfAfter = await queryBrowserPerf(page);
      browserPerf = browserPerfDelta(sampleBrowserPerfBefore, sampleBrowserPerfAfter, frames);
      sampleBrowserPerfBefore = sampleBrowserPerfAfter;
    }
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
      ai: frame.gameplay?.ai ?? null,
      particleSystemCount: Number(frame.particles?.systemCount ?? Number.NaN),
      d3d8DrawCache: compactD3D8DrawCache(frame.d3d8DrawCache),
      browserPerf,
      profile: frame.profile ?? null,
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
    d3d8DrawCache: summarizeSampleCounterDelta(
      samples,
      "d3d8DrawCache",
      d3d8DrawCacheFields,
      framesAdvanced,
    ),
    browserPerf: browserPerfDelta(browserPerfBefore, browserPerfAfter, framesAdvanced),
    profileCounters: profile ? summarizeProfileCounters(samples) : null,
    finalState: compactFrameState(finalFrame),
    sampleCount: samples.length,
    slowestEngineSamples: slowestSamples(samples, "engineLastFrameMs"),
    slowestRpcSamples: slowestSamples(samples, "wallMsPerFrame"),
    firstSample: samples[0] ?? null,
    lastSample: samples[samples.length - 1] ?? null,
  };
  if (includeSamples) {
    result.samples = samples;
  }
  Object.defineProperty(result, "rawFinalFrame", { value: finalFrame, enumerable: false });
  return result;
}

async function queryThreadedStatus(page, label) {
  const result = await rpc(page, "threadedStatus");
  expect(result?.ok === true && result.status?.loop,
    `${label} threaded status query failed`, result);
  return result.status;
}

async function runPacedFramePass(page, frameCount, label, options) {
  const {
    clientFps,
    logicFps,
    catchup,
    timeoutMs,
    allowPartial,
  } = options;
  // One more client frame than requested is needed to produce frameCount
  // presentation intervals.
  const targetClientFrames = frameCount + 1;
  const beforeStatus = await queryThreadedStatus(page, `${label} before`);
  const browserPerfBefore = beforeStatus.graphics?.d3d8Perf ?? null;
  const startedAt = performance.now();
  const started = await rpc(page, "threadedStartLoop", {
    clientFps,
    logicFps,
    catchup,
    maxClientFrames: targetClientFrames,
  });
  expect(started?.ok === true, `${label} paced loop did not start`, started);
  // The main-realm status mirror is updated asynchronously.  Immediately
  // after restarting the loop it can still contain the preceding pass's
  // completed frame count, which would make this pass appear finished before
  // the worker has run a frame.  Query the worker once to identify this pass,
  // then ignore mirrored status from an older loop generation.
  const startedStatus = await queryThreadedStatus(page, `${label} started`);
  const loopStartedAt = Number(startedStatus.loop.startedAt);
  expect(Number.isFinite(loopStartedAt) &&
      loopStartedAt !== Number(beforeStatus.loop.startedAt),
    `${label} paced loop did not start a new generation`, {
      before: beforeStatus.loop,
      started: startedStatus.loop,
    });

  let waitError = null;
  let stopped = null;
  try {
    const deadline = performance.now() + timeoutMs;
    let nextProgressFrame = 0;
    let lastProgressAt = -Infinity;
    for (;;) {
      const loop = await page.evaluate(() => {
        const value = window.CnCPort?.state?.threadedEngine?.loop;
        return value ? {
          active: value.active,
          error: value.error,
          startedAt: Number(value.startedAt),
          clientFrames: Number(value.clientFrames ?? 0),
          logicFrames: Number(value.logicFrames ?? 0),
          engineFrameSamples: Number(value.engineFrameSamples ?? 0),
          suppressedRenderFrames: Number(value.suppressedRenderFrames ?? 0),
        } : null;
      });
      const now = performance.now();
      const currentGeneration = loop?.startedAt === loopStartedAt;
      if ((currentGeneration && loop.clientFrames >= targetClientFrames) ||
          (currentGeneration && loop.active === false && loop.error != null)) {
        break;
      }
      if (currentGeneration &&
          (loop.clientFrames >= nextProgressFrame || now - lastProgressAt >= 10000)) {
        console.error(`[runtime-profile] ${label} progress ` +
          `${loop.clientFrames}/${targetClientFrames} client frames, ` +
          `${loop.logicFrames} logic frames, ${loop.engineFrameSamples} engine samples, ` +
          `${loop.suppressedRenderFrames} catch-up renders suppressed`);
        nextProgressFrame = loop.clientFrames + Math.max(10, Math.ceil(frameCount / 20));
        lastProgressAt = now;
      }
      if (now >= deadline) {
        throw new Error(`${label} timed out after ${timeoutMs}ms`);
      }
      await page.waitForTimeout(250);
    }
  } catch (error) {
    waitError = error;
  } finally {
    stopped = await rpc(page, "threadedStopLoop", { timeoutMs: 120000 });
  }
  expect(stopped?.ok === true, `${label} paced loop did not stop`, stopped);
  if (waitError && !allowPartial) {
    throw waitError;
  }

  const wallMs = performance.now() - startedAt;
  const status = await queryThreadedStatus(page, `${label} after`);
  expect(status.loop.error == null &&
      (allowPartial || status.loop.clientFrames >= targetClientFrames),
    `${label} paced loop ended before its target`, status.loop);
  const retainedPresentationSamples = (status.timing?.presentationFrameMs ?? [])
    .filter(Number.isFinite);
  const retainedFrames = Math.min(frameCount, retainedPresentationSamples.length);
  const presentationSamples = retainedPresentationSamples.slice(-retainedFrames);
  expect((allowPartial && presentationSamples.length > 0) ||
      presentationSamples.length === frameCount,
    `${label} did not retain every requested presentation interval`, {
      requested: frameCount,
      retained: presentationSamples.length,
      loop: status.loop,
    });
  const engineSamples = (status.timing?.presentedEngineFrameMs ?? status.timing?.engineFrameMs ?? [])
    .filter(Number.isFinite)
    .slice(-retainedFrames);
  const allEngineSamples = (status.timing?.engineFrameMs ?? [])
    .filter(Number.isFinite);
  const pacingResult = await rpc(page, "threadedPacingSamples");
  expect(pacingResult?.ok === true, `${label} pacing sample query failed`, pacingResult);
  const pacingSamples = (pacingResult.samples ?? []).slice(-retainedFrames);
  const browserPerfAfter = status.graphics?.d3d8Perf ?? null;
  const engineFrameSamples = Number(status.loop.engineFrameSamples ?? 0);
  const presentedEngineFrameSamples = Number(
    status.loop.presentedEngineFrameSamples ?? status.loop.clientFrames ?? 0,
  );
  const browserPerf = browserPerfDelta(
    browserPerfBefore,
    browserPerfAfter,
    presentedEngineFrameSamples,
  );
  const final = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  expect(final?.ok === true && final.aborted === false,
    `${label} final state query failed`, final);

  const result = {
    label,
    mode: "paced",
    requestedFrames: frameCount,
    completedFrames: presentationSamples.length,
    partial: Boolean(waitError),
    timeoutError: waitError ? String(waitError?.message ?? waitError) : null,
    targetClientFrames,
    clientFps,
    logicFps,
    catchup,
    wallMs,
    wallMsPerFrame: status.loop.clientFrames > 0 ? wallMs / status.loop.clientFrames : null,
    clientFrames: status.loop.clientFrames,
    logicFrames: status.loop.logicFrames,
    engineFrameSamples,
    presentedEngineFrameSamples,
    suppressedRenderFrames: Number(status.loop.suppressedRenderFrames ?? 0),
    effectiveClientFps: wallMs > 0 ? status.loop.clientFrames * 1000 / wallMs : null,
    presentationFrameMs: framePacingStats(presentationSamples),
    engineLastFrameMs: framePacingStats(engineSamples),
    allEngineFrameMs: framePacingStats(allEngineSamples),
    pacing: {
      sampleCount: pacingSamples.length,
      zeroLogicFrames: pacingSamples.filter((sample) => Number(sample.logic) === 0).length,
      catchupFrames: pacingSamples.filter((sample) => Number(sample.logic) > 1).length,
      maxLogicFramesPerClientFrame: pacingSamples.reduce(
        (maximum, sample) => Math.max(maximum, Number(sample.logic) || 0),
        0,
      ),
    },
    drawCalls: Number(browserPerf?.delta?.draws ?? 0),
    drawCallsPerFrame: presentedEngineFrameSamples > 0
      ? Number(browserPerf?.delta?.draws ?? 0) / presentedEngineFrameSamples
      : null,
    browserPerf,
    finalState: compactFrameState(final.frame),
  };
  if (includeSamples) {
    result.samples = {
      presentationFrameMs: presentationSamples,
      engineLastFrameMs: engineSamples,
      allEngineFrameMs: allEngineSamples,
      pacing: pacingSamples,
    };
  }
  Object.defineProperty(result, "rawFinalFrame", { value: final.frame, enumerable: false });
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
      d3d8DrawCache: compactD3D8DrawCache(frame.d3d8DrawCache),
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
    d3d8DrawCache: summarizeSampleCounterDelta(
      samples,
      "d3d8DrawCache",
      d3d8DrawCacheFields,
      samples.length,
    ),
    browserPerf: browserPerfDelta(browserPerfBefore, browserPerfAfter, samples.length),
    finalState: compactFrameState(finalFrame),
    sampleCount: samples.length,
    slowestEngineSamples: slowestSamples(samples, "engineLastFrameMs"),
    slowestRpcSamples: slowestSamples(samples, "wallMs"),
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
const uiBatchSize = parsePositiveInt("PERF_PROFILE_UI_BATCH", 1);
const pacedMode = parseOptionalBoolean("PERF_PROFILE_PACED") === true;
const pacedClientFps = parsePositiveInt("PERF_PROFILE_CLIENT_FPS", 30);
const pacedLogicFps = parsePositiveInt("PERF_PROFILE_LOGIC_FPS", 30);
const pacedCatchup = parsePositiveInt("PERF_PROFILE_CATCHUP", 4);
const pacedWarmupFrames = parsePositiveInt(
  "PERF_PROFILE_PACED_WARMUP_FRAMES",
  Math.min(60, warmupFrames),
);
const pacedTimeoutMs = parsePositiveInt("PERF_PROFILE_PACED_TIMEOUT_MS", 600000);
const allowPartialPacedPass = parseOptionalBoolean("PERF_PROFILE_ALLOW_PARTIAL") === true;
const leanPassFrames = parseNonNegativeInt("PERF_PROFILE_LEAN_PASS_FRAMES", 0);
const diagLevel = process.env.PERF_PROFILE_DIAG ?? "lite";
const measuredFrameCommand = process.env.PERF_PROFILE_FRAME_COMMAND ?? "realEngineFrameSummary";
const distDir = parseDistDir();
const requestedShaderTier = String(process.env.PERF_PROFILE_SHADER_TIER ?? "").trim();
const shaderTier = requestedShaderTier === "ps11" || requestedShaderTier === "ff"
  ? requestedShaderTier : null;
const profileScene = parseProfileScene();
const shellMap = profileScene === "skirmish" ? true : process.env.PERF_PROFILE_SHELLMAP !== "0";
const settledSceneUsesShellMap = profileScene === "shellmap" && shellMap;
const viewportWidth = parsePositiveInt("PERF_PROFILE_WIDTH", 1280);
const viewportHeight = parsePositiveInt("PERF_PROFILE_HEIGHT", 720);
const includeSamples = process.env.PERF_PROFILE_SAMPLES === "1";
const sampleBrowserPerf = process.env.PERF_PROFILE_SAMPLE_BROWSER === "1";
const skirmishPlayerDiagnosticsSetting = parseOptionalBoolean("PERF_PROFILE_SKIRMISH_PLAYER_DIAGNOSTICS");
const skirmishPlayerDiagnostics = profileScene === "skirmish" &&
  (skirmishPlayerDiagnosticsSetting ?? true);
const d3d8AdjacentBatching = process.env.PERF_PROFILE_D3D8_BATCH !== "0";
const d3d8NativeRepeatedAppend =
  parseOptionalBoolean("PERF_PROFILE_D3D8_NATIVE_REPEAT") !== false;
const d3d8FrameCommandQueue =
  parseOptionalBoolean("PERF_PROFILE_D3D8_FRAME_QUEUE") !== false;
const d3d8LiteVertexMirrors = process.env.PERF_PROFILE_D3D8_VERTEX_MIRRORS === "1";
const d3d8BufferProducers = process.env.PERF_PROFILE_D3D8_BUFFER_PRODUCERS === "1";
const d3d8DrawProducers = process.env.PERF_PROFILE_D3D8_DRAW_PRODUCERS === "1";
const d3d8SkippedProgramKind = String(
  process.env.PERF_PROFILE_D3D8_SKIP_PROGRAM_KIND ?? "",
).trim().toLowerCase();
const validD3D8ProgramKinds = new Set([
  "", "generic", "simple", "terrain", "sm1", "lit", "depth", "particle", "other",
]);
if (!validD3D8ProgramKinds.has(d3d8SkippedProgramKind)) {
  throw new Error(
    `Invalid PERF_PROFILE_D3D8_SKIP_PROGRAM_KIND: ${d3d8SkippedProgramKind}`,
  );
}
const d3d8PerfTimingSetting = parseOptionalBoolean("PERF_PROFILE_D3D8_TIMING");
const d3d8PerfCountersSetting = parseOptionalBoolean("PERF_PROFILE_D3D8_COUNTERS");
const d3d8BoundDrawDiagnostics = parseOptionalBoolean("PERF_PROFILE_D3D8_BOUND_DIAG");
const setupRenderDisabled = parseOptionalBoolean("PERF_PROFILE_SETUP_RENDER_DISABLED") === true;
// Match play.html by default: preserving the drawing buffer forces an extra
// full-frame copy on tile-based GPUs. Tests that specifically need retained
// pixels can opt back in without contaminating performance measurements.
const preserveDrawingBuffer =
  parseOptionalBoolean("PERF_PROFILE_PRESERVE_BUFFER") === true;
const gpuTiming = parseOptionalBoolean("PERF_PROFILE_GPU_TIMING") === true;
const headless = parseOptionalBoolean("PERF_PROFILE_HEADLESS") !== false;
const browserUserDataDir = String(
  process.env.PERF_PROFILE_BROWSER_USER_DATA_DIR ?? "",
).trim();
const engineFrameProfile = process.env.PERF_PROFILE_ENGINE_PROFILE === "1" ||
  d3d8BufferProducers ||
  d3d8DrawProducers;
const cpuProfileOutputName = String(
  process.env.PERF_PROFILE_CPU_PROFILE_OUTPUT ?? "",
).trim();
const cpuProfileSamplingIntervalUs = parsePositiveInt(
  "PERF_PROFILE_CPU_PROFILE_INTERVAL_US",
  100,
);

const serverPort = parseNonNegativeInt("PERF_PROFILE_SERVER_PORT", 0);
const usePreparedArchives = parseOptionalBoolean("PERF_PROFILE_PREPARED_ARCHIVES") === true;
const server = await startStaticServer({ root: wasmRoot, port: serverPort });
let browser;
let browserContext;
let page;
let renderer;
let profileCompleted = false;

try {
  const launchOptions = { headless };
  const executablePath = process.env.PERF_PROFILE_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  if (process.env.PERF_PROFILE_BROWSER_ARGS) {
    launchOptions.args = process.env.PERF_PROFILE_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  }

  if (browserUserDataDir) {
    browserContext = await chromium.launchPersistentContext(browserUserDataDir, {
      ...launchOptions,
      viewport: { width: viewportWidth, height: viewportHeight },
    });
    browser = browserContext.browser();
  } else {
    browser = await chromium.launch(launchOptions);
  }
  // SystemInfo may initialize the GPU process. Do that before the page creates
  // the game's sole WebGL context so the query cannot disturb a live renderer.
  renderer = await queryRenderer(browser);
  await mkdir(artifactsRoot, { recursive: true });
  await mkdir(screenshotsRoot, { recursive: true });

  page = browserContext
    ? (browserContext.pages()[0] ?? await browserContext.newPage())
    : await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
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
  // Threaded mode creates the engine realm while bridge.js loads. Put the
  // diagnostics level in the URL so that worker starts in the requested mode;
  // changing only the main realm after navigation leaves the worker on the
  // harness page's expensive `full` default (including per-draw readPixels).
  harnessUrl.searchParams.set("diag", diagLevel);
  harnessUrl.searchParams.set("preserveBuffer", preserveDrawingBuffer ? "1" : "0");
  harnessUrl.searchParams.set("gpuTiming", gpuTiming ? "1" : "0");
  // Threaded play owns the shipping D3D8 executor in the worker realm. The
  // worker is created while bridge.js loads, before the page-level setters
  // below run, so A/B controls that affect renderer construction must also be
  // present in the harness URL inherited by the worker setup.
  harnessUrl.searchParams.set("d3d8Batch", d3d8AdjacentBatching ? "1" : "0");
  harnessUrl.searchParams.set(
    "d3d8NativeRepeat",
    d3d8NativeRepeatedAppend ? "1" : "0",
  );
  harnessUrl.searchParams.set(
    "d3d8FrameQueue",
    d3d8FrameCommandQueue ? "1" : "0",
  );
  harnessUrl.searchParams.set(
    "d3d8LiteVertexMirrors",
    d3d8LiteVertexMirrors ? "1" : "0",
  );
  harnessUrl.searchParams.set(
    "perfCounters",
    (d3d8PerfCountersSetting ?? true) ? "1" : "0",
  );
  if (pacedMode) {
    harnessUrl.searchParams.set("threads", "1");
  }
  if (shaderTier) {
    harnessUrl.searchParams.set("shaderTier", shaderTier);
  }
  await page.goto(harnessUrl.href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  await page.evaluate((level) => window.__cncSetDiagLevel?.(level), diagLevel);
  // Profiling defaults to detailed counters/timings. Performance A/B runs can
  // explicitly match the lean human-play path without changing the build.
  const d3d8PerfTimingActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8PerfTiming?.(enabled) ?? null, d3d8PerfTimingSetting ?? true);
  const d3d8PerfCountersActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8PerfCounters?.(enabled) ?? null, d3d8PerfCountersSetting ?? true);
  const d3d8AdjacentBatchingActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8AdjacentBatching?.(enabled) ?? null, d3d8AdjacentBatching);
  const d3d8NativeRepeatedAppendActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8NativeRepeatedAppend?.(enabled) ?? null, d3d8NativeRepeatedAppend);
  const d3d8FrameCommandQueueActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8FrameCommandQueue?.(enabled) ?? null, d3d8FrameCommandQueue);
  const d3d8LiteVertexMirrorsActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8LiteVertexMirrors?.(enabled) ?? null, d3d8LiteVertexMirrors);
  const d3d8BufferProducersActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8BufferProducerTracking?.(enabled) ?? null, d3d8BufferProducers);
  const d3d8DrawProducersActive = await page.evaluate((enabled) =>
    window.__cncSetD3D8DrawProducerTracking?.(enabled) ?? null, d3d8DrawProducers);
  const d3d8BoundDrawDiagnosticsActive = d3d8BoundDrawDiagnostics == null
    ? await page.evaluate(() => window.__cncGetD3D8BoundDrawDiagnostics?.() ?? null)
    : await page.evaluate((enabled) =>
      window.__cncSetD3D8BoundDrawDiagnostics?.(enabled) ?? null, d3d8BoundDrawDiagnostics);

  const archiveInputs = await buildArchives(server.url);
  const preparedArchiveCache = usePreparedArchives
    ? await findOrPromotePreparedArchives(page, archiveInputs)
    : null;
  const mount = await rpc(page, preparedArchiveCache?.ok ? "mountPreparedArchives" : "mountArchives", {
    path: "/assets/runtime-frame-profile",
    verifyEach: false,
    archives: preparedArchiveCache?.ok ? preparedArchiveCache.archives : archiveInputs,
  });
  expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
    "runtime frame profile failed to mount archives", mount?.archiveSet ?? mount);

  const initStartedAt = performance.now();
  const init = await rpc(page, "realEngineInit", {
    runDirectory: "/assets/runtime-frame-profile",
    shellMap,
    bootWidth: viewportWidth,
    bootHeight: viewportHeight,
  });
  const initWallMs = performance.now() - initStartedAt;
  expect(init?.ok === true && init.aborted === false && init.frontier?.initReturned === true,
    "runtime frame profile failed real engine init", init);
  const workerD3D8PerfConfig = pacedMode
    ? await rpc(page, "d3d8PerfConfigure", {
        timing: d3d8PerfTimingSetting ?? true,
        counters: d3d8PerfCountersSetting ?? true,
        bufferProducers: d3d8BufferProducers,
        drawProducers: d3d8DrawProducers,
        skippedProgramKind: d3d8SkippedProgramKind,
      })
    : null;
  if (pacedMode) {
    expect(workerD3D8PerfConfig?.ok === true,
      "runtime frame profile could not configure worker D3D8 profiling",
      workerD3D8PerfConfig);
  }
  let setupRenderToggle = null;
  if (setupRenderDisabled) {
    setupRenderToggle = await rpc(page, "realEngineSetRenderDisabled", { disabled: true });
    expect(setupRenderToggle?.ok === true,
      "runtime frame profile could not disable setup rendering", setupRenderToggle);
  }
  let skirmishSetup = null;
  if (profileScene === "skirmish") {
    skirmishSetup = await enterSkirmishScene(page);
  } else {
    await revealShellMenu(page, shellMap);
  }
  if (setupRenderDisabled) {
    const enabled = await rpc(page, "realEngineSetRenderDisabled", { disabled: false });
    expect(enabled?.ok === true,
      "runtime frame profile could not restore setup rendering", enabled);
  }

  const warmup = await runFramePass(page, warmupFrames, batchSize, "warmup");
  const settle = sceneIsSettled(warmup.rawFinalFrame, settledSceneUsesShellMap)
    ? {
        label: "settle",
        requestedFrames: 0,
        framesAdvanced: 0,
        settled: true,
        wallMs: 0,
        wallMsPerFrame: null,
        finalState: compactFrameState(warmup.rawFinalFrame),
      }
    : await runUntilSettled(page, settleFrames, settledSceneUsesShellMap);
  expect(settle.settled === true, "runtime frame profile scene did not settle", settle);
  const settledDisplay = settle.finalState?.display ?? warmup.finalState?.display;
  expect(settledDisplay?.width === viewportWidth && settledDisplay?.height === viewportHeight,
    "runtime frame profile engine display does not match the requested resolution", {
      requested: { width: viewportWidth, height: viewportHeight },
      applied: settledDisplay,
    });
  const pacedWarmup = pacedMode
    ? await runPacedFramePass(page, pacedWarmupFrames, "paced-warmup", {
        clientFps: pacedClientFps,
        logicFps: pacedLogicFps,
        catchup: pacedCatchup,
        timeoutMs: pacedTimeoutMs,
        allowPartial: false,
      })
    : null;
  const workerCpuProfiler = cpuProfileOutputName
    ? await startWorkerCpuProfile(browser, cpuProfileSamplingIntervalUs)
    : null;
  let workerCpuProfile = null;
  let measured;
  try {
    measured = pacedMode
      ? await runPacedFramePass(page, measuredFrames, "measured", {
          clientFps: pacedClientFps,
          logicFps: pacedLogicFps,
          catchup: pacedCatchup,
          timeoutMs: pacedTimeoutMs,
          allowPartial: allowPartialPacedPass,
        })
      : await runFramePass(
          page,
          measuredFrames,
          batchSize,
          "measured",
          measuredFrameCommand,
          engineFrameProfile,
        );
  } finally {
    if (workerCpuProfiler) {
      workerCpuProfile = await workerCpuProfiler.stop();
    }
  }
  let workerCpuProfileSummary = null;
  if (workerCpuProfile) {
    const cpuProfilePath = resolve(artifactsRoot, cpuProfileOutputName);
    await writeFile(cpuProfilePath, `${JSON.stringify(workerCpuProfile.profile)}\n`);
    workerCpuProfileSummary = {
      path: cpuProfilePath,
      targetUrl: workerCpuProfile.targetUrl,
      samplingIntervalUs: workerCpuProfile.samplingIntervalUs,
      elapsedMs: workerCpuProfile.elapsedMs,
      nodeCount: workerCpuProfile.profile?.nodes?.length ?? 0,
      sampleCount: workerCpuProfile.profile?.samples?.length ?? 0,
    };
  }
  let leanPerfConfig = null;
  let leanMeasured = null;
  if (pacedMode && leanPassFrames > 0) {
    leanPerfConfig = await rpc(page, "d3d8PerfConfigure", {
      timing: false,
      counters: false,
      bufferProducers: false,
      drawProducers: false,
      skippedProgramKind: d3d8SkippedProgramKind,
    });
    expect(leanPerfConfig?.ok === true,
      "runtime frame profile could not configure the lean production pass",
      leanPerfConfig);
    leanMeasured = await runPacedFramePass(page, leanPassFrames, "lean-measured", {
      clientFps: pacedClientFps,
      logicFps: pacedLogicFps,
      catchup: pacedCatchup,
      timeoutMs: pacedTimeoutMs,
      allowPartial: allowPartialPacedPass,
    });
  }
  const screenshot = await rpc(page, "screenshot");
  expect(screenshot?.ok === true && screenshotHasVisibleSample(screenshot.screenshot),
    "runtime frame profile screenshot stayed blank", summarizeScreenshot(screenshot));
  const screenshotPath = resolve(
    screenshotsRoot,
    profileScene === "skirmish" ? "runtime-frame-profile-skirmish.png" : "runtime-frame-profile.png");
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  const output = {
    ok: true,
    source: "cnc-port-runtime-frame-profile",
    profileScene,
    renderer,
    m4Metal: renderer.includes("Apple M4") && renderer.includes("Metal"),
    swiftShader: /SwiftShader/i.test(renderer),
    diagLevel,
    distDir,
    shaderTier,
    measurementMode: pacedMode ? "paced" : "stepped-rpc",
    d3d8AdjacentBatching: d3d8AdjacentBatchingActive,
    d3d8NativeRepeatedAppend: d3d8NativeRepeatedAppendActive,
    d3d8FrameCommandQueue:
      workerD3D8PerfConfig?.summary?.frameCommandQueueEnabled ??
      d3d8FrameCommandQueueActive,
    d3d8LiteVertexMirrors: d3d8LiteVertexMirrorsActive,
    d3d8BufferProducers: d3d8BufferProducersActive,
    d3d8DrawProducers: d3d8DrawProducersActive,
    d3d8SkippedProgramKind:
      workerD3D8PerfConfig?.skippedProgramKind ?? d3d8SkippedProgramKind,
    d3d8PerfTiming: workerD3D8PerfConfig?.timing ?? d3d8PerfTimingActive,
    d3d8PerfCounters: workerD3D8PerfConfig?.counters ?? d3d8PerfCountersActive,
    d3d8BoundDrawDiagnostics: d3d8BoundDrawDiagnosticsActive,
    engineFrameProfile,
    sampleBrowserPerf,
    skirmishPlayerDiagnostics,
    measuredFrameCommand,
    shellMap,
    setupRenderDisabled,
    preserveDrawingBuffer,
    gpuTiming,
    headless,
    setupRenderToggle,
    skirmishSetup,
    viewport: { width: viewportWidth, height: viewportHeight },
    initWallMs,
    archiveCount: archiveSpecs.length,
    preparedArchiveCache,
    warmup,
    settle,
    pacedWarmup,
    measured,
    workerCpuProfile: workerCpuProfileSummary,
    leanPerfConfig,
    leanMeasured,
    screenshot: screenshotPath,
  };
  const outputPath = resolve(
    artifactsRoot,
    process.env.PERF_PROFILE_OUTPUT ??
      (profileScene === "skirmish"
        ? "runtime-frame-profile-skirmish.json"
        : "runtime-frame-profile.json"));
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ ...output, outputPath }, null, 2));
  profileCompleted = true;
} finally {
  let cleanupTimedOut = false;
  if (page) {
    cleanupTimedOut = !(await runWithDeadline(
      "page.close",
      3000,
      () => page.close({ runBeforeUnload: false }))) || cleanupTimedOut;
  }
  if (browser) {
    cleanupTimedOut = !(await runWithDeadline(
      "browser.close",
      5000,
      () => browser.close())) || cleanupTimedOut;
  }
  cleanupTimedOut = !(await runWithDeadline(
    "static server close",
    5000,
    () => server.close())) || cleanupTimedOut;
  if (cleanupTimedOut) {
    if (!profileCompleted) {
      console.error("[runtime-profile] cleanup timed out before profile completed");
    }
    await flushOutputStreams();
    process.exit(profileCompleted ? (process.exitCode ?? 0) : 1);
  }
}
