#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotsRoot = resolve(wasmRoot, "artifacts/screenshots");
const artifactsRoot = resolve(wasmRoot, "artifacts/skirmish");

const GAME_SKIRMISH = 2;
const WIN_STATUS_IMAGE = 0x80;
const D3DTOP_DISABLE = 1;
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
  { name: "ZZBase_Audio.big", sourceName: "base-generals/Audio.big" },
  { name: "ZZBase_AudioEnglish.big", sourceName: "base-generals/AudioEnglish.big" },
  { name: "ZZBase_Speech.big", sourceName: "base-generals/Speech.big" },
  { name: "ZZBase_SpeechEnglish.big", sourceName: "base-generals/SpeechEnglish.big" },
  { name: "ZZBase_Maps.big", sourceName: "base-generals/Maps.big" },
  { name: "Gensec.big" },
];

const screenshotPath = resolve(
  process.env.SKIRMISH_START_SCREENSHOT ??
    resolve(screenshotsRoot, "skirmish-start-smoke.png"));
const loadingScreenshotPath = resolve(
  process.env.SKIRMISH_START_LOADING_SCREENSHOT ??
    resolve(screenshotsRoot, "skirmish-start-loading-screen.png"));
const textEntryScreenshotPath = resolve(
  process.env.SKIRMISH_TEXT_ENTRY_SCREENSHOT ??
    resolve(screenshotsRoot, "skirmish-text-entry-smoke.png"));
const requestedMenuScreenshot = String(process.env.SKIRMISH_MENU_SCREENSHOT ?? "").trim();
const menuScreenshotPath = requestedMenuScreenshot ? resolve(requestedMenuScreenshot) : null;
const outputPath = resolve(
  process.env.SKIRMISH_START_OUTPUT ??
    resolve(artifactsRoot, "skirmish-start-smoke.json"));
const maxStartFrames = parsePositiveInt("SKIRMISH_START_MAX_FRAMES", 4200);
const frameChunk = parsePositiveInt("SKIRMISH_START_FRAME_CHUNK", 30);
const expectPostActiveSurvival = process.env.SKIRMISH_START_EXPECT_SURVIVE === "1";
const expectMenuMusicStop = process.env.SKIRMISH_START_EXPECT_MUSIC_STOP === "1";
const expectEscMenuResume = process.env.SKIRMISH_START_EXPECT_ESC_MENU_RESUME === "1";
const expectEnemyStartAssets = process.env.SKIRMISH_START_EXPECT_ENEMY_START_ASSETS === "1";
const expectEnemyAiActivity = process.env.SKIRMISH_START_EXPECT_ENEMY_AI_ACTIVITY === "1";
const collectPlayerDiagnostics = expectEnemyStartAssets || expectEnemyAiActivity;
const requestedPostActiveFrames = parsePositiveInt("SKIRMISH_START_POST_ACTIVE_FRAMES", 0);
const enemyAiActivityFrames = parsePositiveInt("SKIRMISH_START_ENEMY_AI_ACTIVITY_FRAMES", 1200);
const postActiveFrames = expectEnemyAiActivity
  ? Math.max(requestedPostActiveFrames, enemyAiActivityFrames)
  : requestedPostActiveFrames;
const postActiveFrameChunk = parsePositiveInt("SKIRMISH_START_POST_ACTIVE_CHUNK", frameChunk);
const musicStopMaxFrames = parsePositiveInt("SKIRMISH_START_MUSIC_STOP_MAX_FRAMES", 360);
const requestedSkirmishMap = String(process.env.SKIRMISH_START_MAP ?? "").trim();
const captureD3D8History = process.env.SKIRMISH_START_CAPTURE_D3D8_HISTORY === "1";
const expectLightPulseProbe = process.env.SKIRMISH_START_LIGHT_PULSE_PROBE === "1";
const expectReplayRoundTrip = process.env.SKIRMISH_START_REPLAY_ROUNDTRIP === "1";
const retailReplayFixture = String(process.env.SKIRMISH_REPLAY_FIXTURE ?? "").trim();
const expectScorchProbe = process.env.SKIRMISH_START_SCORCH_PROBE === "1";
const expectParticleVisibilityProbe =
  process.env.SKIRMISH_START_PARTICLE_VISIBILITY_PROBE === "1";
const expectTouchControlsProbe = process.env.SKIRMISH_START_TOUCH_PROBE === "1";
const particleVisibilityFrames = parsePositiveInt(
  "SKIRMISH_START_PARTICLE_VISIBILITY_FRAMES", 30);
const distDir = parseDistDir();
const replayMenuScreenshotPath = resolve(
  process.env.SKIRMISH_REPLAY_MENU_SCREENSHOT ??
    resolve(screenshotsRoot, "replay-menu-roundtrip.png"));
const replayPlaybackScreenshotPath = resolve(
  process.env.SKIRMISH_REPLAY_PLAYBACK_SCREENSHOT ??
    resolve(screenshotsRoot, "replay-playback-roundtrip.png"));
const browserProfileDir = String(process.env.SKIRMISH_START_PROFILE_DIR ?? "").trim();
const requestedModPackage = String(process.env.SKIRMISH_START_MOD_PACKAGE ?? "").trim();
const requestedModName = String(process.env.SKIRMISH_START_MOD_NAME ?? "").trim();
const requestedModLocalPath = String(process.env.SKIRMISH_START_MOD_LOCAL_PATH ?? "").trim();
const requestedModLocalDir = String(process.env.SKIRMISH_START_MOD_LOCAL_DIR ?? "").trim();
if (requestedModPackage && !/^[A-Za-z0-9_.-]+\.(?:zip|7z|rar|exe|big)$/i.test(requestedModPackage)) {
  throw new Error(`Invalid SKIRMISH_START_MOD_PACKAGE: ${requestedModPackage}`);
}
if ((requestedModLocalPath || requestedModLocalDir) && !requestedModPackage) {
  throw new Error("Local mod input requires SKIRMISH_START_MOD_PACKAGE");
}
if (requestedModLocalPath && requestedModLocalDir) {
  throw new Error("Choose either SKIRMISH_START_MOD_LOCAL_PATH or SKIRMISH_START_MOD_LOCAL_DIR");
}

function parsePositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseDistDir() {
  const value = process.env.SKIRMISH_START_DIST ?? "dist";
  if (!/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value)) {
    throw new Error(`Invalid SKIRMISH_START_DIST: ${value}`);
  }
  return value;
}

function expect(condition, message, payload = null) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function buildArchives(baseUrl) {
  return archiveSpecs.map((spec) => {
    const sourceName = spec.sourceName ?? spec.name;
    return {
      name: spec.name,
      sourceName,
      url: new URL(`artifacts/real-assets/${sourceName}`, baseUrl).href,
    };
  });
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

function compactGameplay(frame) {
  const gameplay = frame?.gameplay ?? frame?.clientState?.gameplay ?? null;
  const display = frame?.display ?? frame?.clientState?.display ?? null;
  return {
    framesCompleted: frame?.framesCompleted ?? null,
    gameMode: gameplay?.gameMode ?? null,
    inGame: gameplay?.inGame ?? null,
    loadingMap: gameplay?.loadingMap ?? null,
    objectCount: gameplay?.objectCount ?? null,
    drawableCount: gameplay?.drawableCount ?? null,
    renderedObjectCount: gameplay?.renderedObjectCount ?? null,
    inputEnabled: gameplay?.inputEnabled ?? null,
    localPlayer: gameplay?.localPlayer ?? null,
    ai: gameplay?.ai ?? null,
    playerDiagnostics: gameplay?.playerDiagnostics ?? null,
    display,
  };
}

function locateNested(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = locateNested(v, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function pixelHasVisibleColor(pixel, threshold = 8) {
  return Array.isArray(pixel)
    && pixel.length >= 4
    && pixel[3] >= 200
    && pixel.slice(0, 3).some((component) => component > threshold);
}

async function sampleViewportGrid(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, error: "viewport canvas is missing" };
    }
    let gl = null;
    try {
      gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    } catch {
      // Threaded builds transfer this canvas to the engine worker. The
      // placeholder remains drawable, but requesting its context is invalid.
    }
    let snapshot = null;
    if (gl == null) {
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      snapshot = scratch.getContext("2d", { willReadFrequently: true });
      snapshot?.drawImage(canvas, 0, 0);
    }
    if (gl == null && snapshot == null) {
      return { ok: false, error: "viewport pixels are unavailable" };
    }

    const samplePoints = [
      { name: "upperLeft", x: 0.18, y: 0.18 },
      { name: "upperCenter", x: 0.50, y: 0.18 },
      { name: "upperRight", x: 0.82, y: 0.18 },
      { name: "midLeft", x: 0.18, y: 0.44 },
      { name: "center", x: 0.50, y: 0.44 },
      { name: "midRight", x: 0.82, y: 0.44 },
      { name: "lowerLeft", x: 0.18, y: 0.68 },
      { name: "lowerCenter", x: 0.50, y: 0.68 },
      { name: "lowerRight", x: 0.82, y: 0.68 },
      { name: "hudLeft", x: 0.22, y: 0.88 },
      { name: "hudCenter", x: 0.50, y: 0.88 },
      { name: "hudRight", x: 0.78, y: 0.88 },
    ];
    const pixels = {};
    const pixel = new Uint8Array(4);
    for (const point of samplePoints) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x * canvas.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y * canvas.height)));
      if (gl != null) {
        gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      } else {
        pixel.set(snapshot.getImageData(x, y, 1, 1).data);
      }
      pixels[point.name] = Array.from(pixel);
    }

    const colors = Object.values(pixels).map((value) => value.join(","));
    const visible = Object.values(pixels).filter((value) =>
      value.length >= 4 &&
      value[3] >= 200 &&
      (value[0] > 8 || value[1] > 8 || value[2] > 8));
    return {
      ok: true,
      width: canvas.width,
      height: canvas.height,
      source: gl != null ? "webgl" : "threaded-placeholder",
      sampleCount: samplePoints.length,
      visibleSampleCount: visible.length,
      uniqueColorCount: new Set(colors).size,
      pixels,
    };
  });
}

async function sampleViewportAnnulus(page, screenPos, innerRadius = 14, outerRadius = 42) {
  return page.evaluate(([position, inner, outer]) => {
    const canvas = document.querySelector("#viewport");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, error: "viewport canvas is missing" };
    }
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl == null) {
      return { ok: false, error: "viewport WebGL context is missing" };
    }
    const centerX = Math.round(Number(position?.x));
    const centerY = Math.round(Number(position?.y));
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      return { ok: false, error: "screen position is invalid", position };
    }
    const x0 = Math.max(0, centerX - outer);
    const y0 = Math.max(0, centerY - outer);
    const x1 = Math.min(canvas.width - 1, centerX + outer);
    const y1 = Math.min(canvas.height - 1, centerY + outer);
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x0, canvas.height - y1 - 1, width, height,
      gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const sum = [0, 0, 0];
    let count = 0;
    let minLuminance = Number.POSITIVE_INFINITY;
    let maxLuminance = Number.NEGATIVE_INFINITY;
    for (let y = y0; y <= y1; ++y) {
      for (let x = x0; x <= x1; ++x) {
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance < inner || distance > outer) continue;
        // readPixels is bottom-up relative to screen coordinates.
        const row = y1 - y;
        const offset = (row * width + (x - x0)) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        sum[0] += red;
        sum[1] += green;
        sum[2] += blue;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        minLuminance = Math.min(minLuminance, luminance);
        maxLuminance = Math.max(maxLuminance, luminance);
        count += 1;
      }
    }
    const mean = sum.map((component) => Number((component / Math.max(1, count)).toFixed(3)));
    return {
      ok: count > 0,
      center: { x: centerX, y: centerY },
      innerRadius: inner,
      outerRadius: outer,
      sampleCount: count,
      mean,
      meanLuminance: Number((mean[0] * 0.2126 + mean[1] * 0.7152 + mean[2] * 0.0722).toFixed(3)),
      minLuminance: Number(minLuminance.toFixed(3)),
      maxLuminance: Number(maxLuminance.toFixed(3)),
    };
  }, [screenPos, innerRadius, outerRadius]);
}

function lightProbeDrawHistory(frameResult) {
  return frameResult?.state?.graphics?.d3d8SceneDrawHistory
    ?? frameResult?.frame?.graphics?.d3d8SceneDrawHistory
    ?? frameResult?.result?.state?.graphics?.d3d8SceneDrawHistory
    ?? frameResult?.result?.frame?.graphics?.d3d8SceneDrawHistory
    ?? [];
}

function summarizeLightProbeTerrain(drawHistory) {
  const byVertexBuffer = new Map();
  for (const draw of drawHistory) {
    if (!(Number(draw?.vertexStride) === 32
      && Number(draw?.vertexShaderFvf) === 578
      && draw?.vertexSummary?.diffuse?.checksum != null)) continue;
    if (byVertexBuffer.has(Number(draw.vertexBufferId))) continue;
    byVertexBuffer.set(Number(draw.vertexBufferId), {
      vertexBufferId: Number(draw.vertexBufferId),
      checksum: Number(draw.vertexSummary.diffuse.checksum) >>> 0,
      average: draw.vertexSummary.diffuse.average,
      positionBounds: draw.vertexSummary.positionBounds,
    });
  }
  return Array.from(byVertexBuffer.values());
}

async function captureLightPulseFrame(page, label, screenPos, screenshot) {
  await page.evaluate(() => {
    window.__cncSetDiagLevel?.("full");
    window.__cncSetD3D8SceneDrawHistoryLimit?.(8192);
    window.__cncClearD3D8SceneDrawHistory?.();
  });
  const frame = await runFrames(page, 1, label);
  const drawHistory = lightProbeDrawHistory(frame);
  await page.locator("#viewport").screenshot({ path: screenshot });
  return {
    frame: frame.frame?.framesCompleted ?? null,
    screenshot,
    canvas: await sampleViewportAnnulus(page, screenPos),
    pointLights: drawHistory.flatMap((draw) => draw?.activeLights ?? [])
      .filter((light) => Number(light?.type) === 1)
      .map((light) => ({
        diffuse: light.diffuse,
        position: light.position,
        range: light.range,
      }))
      .slice(0, 8),
    pointLightDrawCount: drawHistory.filter((draw) =>
      (draw?.activeLights ?? []).some((light) => Number(light?.type) === 1)).length,
    terrain: summarizeLightProbeTerrain(drawHistory),
  };
}

function compareLightProbeTerrain(baseline, sample, worldPos) {
  const baselineById = new Map(baseline.terrain.map((terrain) =>
    [terrain.vertexBufferId, terrain]));
  const containsTarget = (terrain) => {
    const bounds = terrain.positionBounds;
    return bounds != null
      && Number(worldPos.x) >= Number(bounds.min?.[0])
      && Number(worldPos.x) <= Number(bounds.max?.[0])
      && Number(worldPos.y) >= Number(bounds.min?.[1])
      && Number(worldPos.y) <= Number(bounds.max?.[1]);
  };
  const comparisons = sample.terrain
    .filter((terrain) => baselineById.has(terrain.vertexBufferId))
    .map((terrain) => {
      const before = baselineById.get(terrain.vertexBufferId);
      return {
        vertexBufferId: terrain.vertexBufferId,
        containsTarget: containsTarget(terrain),
        changed: terrain.checksum !== before.checksum,
        beforeChecksum: before.checksum,
        checksum: terrain.checksum,
        averageDelta: terrain.average.map((value, index) =>
          Number((value - before.average[index]).toFixed(3))),
      };
    });
  return {
    compared: comparisons.length,
    changed: comparisons.filter((comparison) => comparison.changed),
    targetBuffers: comparisons.filter((comparison) => comparison.containsTarget),
  };
}

function compactClickFrame(frameResult) {
  const clientState = frameResult?.frame?.clientState ?? {};
  return {
    framesCompleted: frameResult?.frame?.framesCompleted ?? null,
    shell: clientState.shell ?? null,
    transition: clientState.transition ?? null,
    gameplay: compactGameplay(frameResult?.frame),
    mouse: clientState.input?.mouse ?? null,
    top: clientState.shell?.topFilename ?? null,
    mainMenu: {
      buttonSinglePlayer: clientState.mainMenu?.buttonSinglePlayer ?? null,
      buttonSingleBack: clientState.mainMenu?.buttonSingleBack ?? null,
      buttonSkirmish: clientState.mainMenu?.buttonSkirmish ?? null,
      buttonLoadReplay: clientState.mainMenu?.buttonLoadReplay ?? null,
      buttonReplay: clientState.mainMenu?.buttonReplay ?? null,
    },
    skirmishMenu: {
      parent: clientState.skirmishMenu?.parent ?? null,
      buttonStart: clientState.skirmishMenu?.buttonStart ?? null,
    },
    quitMenu: {
      visible: clientState.quitMenu?.visible ?? null,
      quitMenuSystemLookup: clientState.quitMenu?.quitMenuSystemLookup ?? null,
      fullParent: clientState.quitMenu?.fullParent ?? null,
      noSaveParent: clientState.quitMenu?.noSaveParent ?? null,
      buttonReturnFull: clientState.quitMenu?.buttonReturnFull ?? null,
      buttonReturnNoSave: clientState.quitMenu?.buttonReturnNoSave ?? null,
      underButtonReturnFullCenter: clientState.quitMenu?.underButtonReturnFullCenter ?? null,
      underButtonReturnNoSaveCenter: clientState.quitMenu?.underButtonReturnNoSaveCenter ?? null,
    },
  };
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function resumeAudio(page) {
  const point = await page.evaluate(() => {
    const target = document.querySelector("#viewport");
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2)),
      y: rect.top + Math.max(1, Math.min(rect.height - 1, rect.height / 2)),
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(async () => {
    const result = await window.CnCPort.rpc("browserAudioRuntime");
    return result.browserAudioRuntime?.contextState === "running"
      && result.browserAudioRuntime?.resumeSuccesses >= 1;
  }, null, { timeout: 5000 });
  return rpc(page, "browserAudioRuntime");
}

async function streamRuntime(page) {
  const runtime = await rpc(page, "browserAudioRuntime");
  return runtime.state?.browserMssStreamPlaybackRuntime ?? null;
}

function activeStreamHandles(runtime) {
  return (runtime?.activeStreamHandles ?? [])
    .map((handle) => Number(handle))
    .filter((handle) => Number.isFinite(handle));
}

function handleClosed(runtime, handle) {
  return (runtime?.eventLog ?? []).some((event) =>
    event.phase === "AIL_close_stream" && Number(event.handle) === Number(handle));
}

async function waitForActiveMusic(page, label, maxFrames = 240) {
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced < maxFrames) {
    const runtime = await streamRuntime(page);
    const handles = activeStreamHandles(runtime);
    samples.push({
      framesAdvanced,
      activeSources: runtime?.activeSources ?? null,
      activeStreamHandles: handles,
      lastEvent: runtime?.lastEvent ?? null,
      lastError: runtime?.lastError ?? null,
    });
    if (runtime?.lastError) {
      throw new Error(`${label} Web Audio stream runtime reported an error: ${runtime.lastError}`);
    }
    if (handles.length > 0 && runtime?.lastEvent?.nodeGraph?.includes("musicGainNode")) {
      return { runtime, handles, framesAdvanced, samples };
    }
    await runSummary(page, 4, label);
    framesAdvanced += 4;
  }
  expect(false, `${label} did not start an active music stream`, {
    maxFrames,
    samples: samples.slice(-16),
  });
}

async function waitForHandlesClosed(page, handles, label, maxFrames) {
  const targets = handles.map((handle) => Number(handle));
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced <= maxFrames) {
    const runtime = await streamRuntime(page);
    const active = activeStreamHandles(runtime);
    const remainingActive = targets.filter((handle) => active.includes(handle));
    const missingCloseEvents = targets.filter((handle) => !handleClosed(runtime, handle));
    samples.push({
      framesAdvanced,
      activeStreamHandles: active,
      remainingActive,
      missingCloseEvents,
      stopped: runtime?.stopped ?? null,
      volumeUpdates: runtime?.volumeUpdates ?? null,
      lastVolumeUpdate: runtime?.lastVolumeUpdate ?? null,
      lastEvent: runtime?.lastEvent ?? null,
      lastError: runtime?.lastError ?? null,
    });
    if (runtime?.lastError) {
      throw new Error(`${label} Web Audio stream runtime reported an error: ${runtime.lastError}`);
    }
    if (remainingActive.length === 0 && missingCloseEvents.length === 0) {
      return { runtime, framesAdvanced, samples };
    }
    if (framesAdvanced >= maxFrames) {
      break;
    }
    const frames = Math.min(frameChunk, maxFrames - framesAdvanced);
    await runSummary(page, frames, label);
    framesAdvanced += frames;
  }
  expect(false, `${label} did not close the pre-skirmish music handles`, {
    handles: targets,
    maxFrames,
    samples: samples.slice(-16),
  });
}

function assertFrameResult(result, label) {
  expect(result?.ok === true && result?.aborted === false,
    `${label} frame RPC failed`, {
      aborted: result?.aborted,
      abortMessage: result?.abortMessage,
      abortStack: result?.abortStack,
      lastUpdateTarget: result?.lastUpdateTarget,
      lastGameLogicStep: result?.lastGameLogicStep,
      frame: result?.frame,
    });
  expect(result.frame?.exceptionCaught === false,
    `${label} frame caught a C++ exception`, result.frame);
  expect(result.frame?.quitting === false,
    `${label} frame requested quit`, result.frame);
  return result;
}

async function runFrames(page, frames, label = "real engine") {
  return assertFrameResult(
    await rpc(page, "realEngineFrame", { frames, playerDiagnostics: collectPlayerDiagnostics }),
    label);
}

async function runSummary(page, frames, label = "real engine summary") {
  return assertFrameResult(
    await rpc(page, "realEngineFrameSummary", { frames, playerDiagnostics: collectPlayerDiagnostics }),
    label);
}

async function postMouse(page, message, point) {
  const result = await rpc(page, "postMessage", {
    message,
    lParam: win32PointLParam(point),
    point,
  });
  expect(result?.ok === true, "mouse message was not posted", result);
  return result;
}

async function touchPointToClient(page, point) {
  return page.evaluate((enginePoint) => {
    const canvas = document.querySelector("#viewport");
    const rect = canvas.getBoundingClientRect();
    const size = window.CnCPort.state.engineDisplaySize ?? {
      width: canvas.width,
      height: canvas.height,
    };
    const scale = Math.min(rect.width / size.width, rect.height / size.height);
    const contentWidth = size.width * scale;
    const contentHeight = size.height * scale;
    const contentLeft = rect.left + (rect.width - contentWidth) / 2;
    const contentTop = rect.top + (rect.height - contentHeight) / 2;
    return {
      x: contentLeft + enginePoint.x * scale,
      y: contentTop + enginePoint.y * scale,
    };
  }, point);
}

async function dispatchTouchPointer(page, type, pointerId, point, isPrimary = false) {
  await page.locator("#viewport").evaluate((canvas, event) => {
    canvas.dispatchEvent(new PointerEvent(event.type, {
      bubbles: true,
      cancelable: true,
      pointerId: event.pointerId,
      pointerType: "touch",
      isPrimary: event.isPrimary,
      clientX: event.point.x,
      clientY: event.point.y,
    }));
  }, { type, pointerId, point, isPrimary });
}

async function tapTouchPoint(page, enginePoint, pointerId = 501) {
  const point = await touchPointToClient(page, enginePoint);
  await dispatchTouchPointer(page, "pointerdown", pointerId, point, true);
  await dispatchTouchPointer(page, "pointerup", pointerId, point, true);
  await page.waitForTimeout(40);
}

async function touchCameraState(page) {
  const snapshot = await rpc(page, "agentWorldSnapshot", { mode: "camera" });
  expect(snapshot?.ok === true && snapshot.result?.camera,
    "touch camera snapshot was unavailable", snapshot);
  return snapshot.result.camera;
}

function coordinateDelta(left, right) {
  return Math.hypot(
    Number(right?.x ?? 0) - Number(left?.x ?? 0),
    Number(right?.y ?? 0) - Number(left?.y ?? 0),
  );
}

async function driveTouchControlsProbe(page) {
  console.error("[skirmish-start] verify touch controls");
  const screenshot = resolve(screenshotsRoot, "touch-controls-live-skirmish.png");
  const state = await page.evaluate(() => window.CnCPort.getTouchControlsState?.());
  expect(state?.enabled === true, "touch controls did not enable in a touch context", state);
  expect(await page.locator("#touchControls").isVisible(),
    "touch controls were not visible over the live game");
  const renderGeometry = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const rect = canvas.getBoundingClientRect();
    const display = window.CnCPort.state.engineDisplaySize;
    return {
      css: { width: rect.width, height: rect.height },
      display,
      backingStore: { width: canvas.width, height: canvas.height },
    };
  });
  const cssAspect = renderGeometry.css.width / renderGeometry.css.height;
  const displayAspect = renderGeometry.display.width / renderGeometry.display.height;
  expect(Math.abs(cssAspect - displayAspect) <=
      1 / Math.min(renderGeometry.display.width, renderGeometry.display.height)
      && renderGeometry.backingStore.width === renderGeometry.display.width
      && renderGeometry.backingStore.height === renderGeometry.display.height,
  "mobile render resolution must preserve the device box aspect and backing store", renderGeometry);
  const dismiss = page.locator("[data-touch-action='dismiss-help']");
  if (await dismiss.isVisible()) await dismiss.click();

  await rpc(page, "revealLocalMap", { permanent: true });
  await runFrames(page, 6, "touch reveal settle");
  let drawablesReply = await rpc(page, "queryDrawables");
  expect(drawablesReply?.ok === true, "touch drawable query failed", drawablesReply);
  let drawableState = drawablesReply.result ?? drawablesReply.drawables ?? {};
  let drawables = drawableState.drawables ?? [];
  let allDrawables = drawableState.allDrawables ?? drawables;
  let unit = drawables.find((drawable) =>
    drawable?.localOwned === true && drawable?.structure !== true
      && drawable?.kindOf?.selectable === true && drawable?.onScreen === true
      && drawable?.screenPos?.x > 80
      && drawable?.screenPos?.x < renderGeometry.display.width - 80
      && drawable?.screenPos?.y > 80
      && drawable?.screenPos?.y < renderGeometry.display.height - 120);
  if (!unit) {
    const offscreenUnit = allDrawables.find((drawable) =>
      drawable?.localOwned === true && drawable?.structure !== true
        && drawable?.kindOf?.selectable === true && drawable?.worldPos != null)
      ?? allDrawables.find((drawable) =>
        drawable?.structure !== true && drawable?.hidden !== true
          && drawable?.effectivelyDead !== true && drawable?.kindOf?.selectable === true
          && drawable?.worldPos != null);
    if (offscreenUnit) {
      const lookAt = await rpc(page, "tacticalViewLookAt", { worldPos: offscreenUnit.worldPos });
      expect(lookAt?.ok === true, "touch probe could not frame a selectable unit", {
        offscreenUnit,
        lookAt,
      });
      await runFrames(page, 10, "touch camera frame unit");
      drawablesReply = await rpc(page, "queryDrawables");
      expect(drawablesReply?.ok === true,
        "touch drawable query failed after framing the local unit", drawablesReply);
      drawableState = drawablesReply.result ?? drawablesReply.drawables ?? {};
      drawables = drawableState.drawables ?? [];
      allDrawables = drawableState.allDrawables ?? drawables;
      unit = allDrawables.find((drawable) =>
        Number(drawable.id) === Number(offscreenUnit.id) && drawable?.onScreen === true);
    }
  }
  expect(Boolean(unit), "touch selection could not find an on-screen selectable unit", {
    stats: drawableState.stats,
    sample: allDrawables.slice(0, 24).map((drawable) => ({
      name: drawable.name,
      playerIndex: drawable.playerIndex,
      localOwned: drawable.localOwned,
      onScreen: drawable.onScreen,
      hidden: drawable.hidden,
      selectable: drawable.kindOf?.selectable,
    })),
    localDrawables: allDrawables.filter((drawable) => drawable?.localOwned === true)
      .map((drawable) => ({ name: drawable.name, screenPos: drawable.screenPos,
        structure: drawable.structure, selectable: drawable.kindOf?.selectable })),
  });

  const unitPoint = { x: Math.round(unit.screenPos.x), y: Math.round(unit.screenPos.y) };
  await tapTouchPoint(page, unitPoint);
  await runFrames(page, 6, "touch selection settle");
  const selected = await rpc(page, "querySelection");
  expect(selected?.result?.selected?.some((entry) => Number(entry.id) === Number(unit.id)),
    "one-finger tap did not select the on-screen unit", selected?.result);

  const beforeOrder = selected.result.commandPath;
  await page.locator("[data-touch-action='order']").click();
  const occupiedPoints = allDrawables
    .filter((drawable) => drawable?.onScreen === true && drawable?.screenPos)
    .map((drawable) => drawable.screenPos);
  const orderPoint = Array.from({ length: 35 }, (_, index) => ({
    x: 100 + (index % 7) * 100,
    y: 120 + Math.floor(index / 7) * 65,
  })).map((point) => ({
    ...point,
    clearance: occupiedPoints.reduce((nearest, occupied) => Math.min(nearest,
      Math.hypot(point.x - occupied.x, point.y - occupied.y)), Number.POSITIVE_INFINITY),
  })).sort((left, right) => right.clearance - left.clearance)[0];
  await tapTouchPoint(page, orderPoint, 502);
  await runFrames(page, 10, "touch order settle");
  const ordered = await rpc(page, "querySelection");
  const afterOrder = ordered?.result?.commandPath;
  expect(Number(afterOrder?.rawRightDownCount) > Number(beforeOrder?.rawRightDownCount)
      && Number(afterOrder?.rawRightUpCount) > Number(beforeOrder?.rawRightUpCount),
    "Order then tap did not traverse the real right-click path", { beforeOrder, afterOrder });
  if (selected.result.selectedControllable === true) {
    expect(Number(afterOrder?.dispatchMoveCommandCount) >
        Number(beforeOrder?.dispatchMoveCommandCount),
      "Order then tap did not dispatch a real move command", { beforeOrder, afterOrder });
  }

  const cameraBefore = await touchCameraState(page);
  const navigationPathBefore = (await rpc(page, "querySelection"))?.result?.commandPath;
  const panStart = [{ x: 280, y: 240 }, { x: 440, y: 240 }];
  const panEnd = panStart.map((point) => ({ x: point.x + 70, y: point.y + 35 }));
  const panStartClient = await Promise.all(panStart.map((point) => touchPointToClient(page, point)));
  const panEndClient = await Promise.all(panEnd.map((point) => touchPointToClient(page, point)));
  await dispatchTouchPointer(page, "pointerdown", 511, panStartClient[0], true);
  await dispatchTouchPointer(page, "pointerdown", 512, panStartClient[1]);
  await dispatchTouchPointer(page, "pointermove", 511, panEndClient[0], true);
  await dispatchTouchPointer(page, "pointermove", 512, panEndClient[1]);
  await page.waitForTimeout(40);
  await runFrames(page, 4, "touch direct pan");
  const cameraPanMoved = await touchCameraState(page);
  const navigationDiagnostics = await page.evaluate(() => ({
    touchControls: window.CnCPort.getTouchControlsState?.() ?? null,
    threadedInputLogs: window.CnCPort.state.threadedEngine?.recentLogs ?? null,
  }));
  expect(coordinateDelta(cameraBefore.lookAt, cameraPanMoved.lookAt) > 0.1,
    "two-finger pan did not move the tactical camera", {
      cameraBefore,
      cameraPanMoved,
      navigationDiagnostics,
    });
  await runFrames(page, 12, "touch pan stationary");
  const cameraPanStationary = await touchCameraState(page);
  expect(coordinateDelta(cameraPanMoved.lookAt, cameraPanStationary.lookAt) < 0.01,
    "stationary fingers must not leave velocity scrolling active", {
      cameraPanMoved, cameraPanStationary,
    });
  await dispatchTouchPointer(page, "pointerup", 511, panEndClient[0], true);
  await dispatchTouchPointer(page, "pointerup", 512, panEndClient[1]);
  await runFrames(page, 6, "touch pan settle");
  const cameraAfterPan = await touchCameraState(page);
  expect(coordinateDelta(cameraPanStationary.lookAt, cameraAfterPan.lookAt) < 0.01,
    "releasing a direct pan must not add residual camera movement", {
      cameraPanStationary, cameraAfterPan,
    });

  const gestureStartCenter = { x: 390, y: 250 };
  const gestureStartRadius = 60;
  let leftClient = await touchPointToClient(page, {
    x: gestureStartCenter.x - gestureStartRadius,
    y: gestureStartCenter.y,
  });
  let rightClient = await touchPointToClient(page, {
    x: gestureStartCenter.x + gestureStartRadius,
    y: gestureStartCenter.y,
  });
  await dispatchTouchPointer(page, "pointerdown", 521, leftClient, true);
  await dispatchTouchPointer(page, "pointerdown", 522, rightClient);
  for (let step = 1; step <= 5; step += 1) {
    const progress = step / 5;
    const center = {
      x: gestureStartCenter.x + 65 * progress,
      y: gestureStartCenter.y + 30 * progress,
    };
    const radius = gestureStartRadius + 45 * progress;
    const radians = Math.PI / 7 * progress;
    leftClient = await touchPointToClient(page, {
      x: center.x - Math.cos(radians) * radius,
      y: center.y - Math.sin(radians) * radius,
    });
    rightClient = await touchPointToClient(page, {
      x: center.x + Math.cos(radians) * radius,
      y: center.y + Math.sin(radians) * radius,
    });
    await dispatchTouchPointer(page, "pointermove", 521, leftClient, true);
    await dispatchTouchPointer(page, "pointermove", 522, rightClient);
    await page.waitForTimeout(20);
  }
  await runFrames(page, 6, "touch combined navigation");
  const cameraCombined = await touchCameraState(page);
  expect(coordinateDelta(cameraAfterPan.lookAt, cameraCombined.lookAt) > 0.1,
    "combined gesture did not pan the tactical camera", { cameraAfterPan, cameraCombined });
  expect(Math.abs(Number(cameraCombined.zoom) - Number(cameraAfterPan.zoom)) > 0.001,
    "combined gesture did not pinch-zoom the tactical camera", {
      cameraAfterPan, cameraCombined,
    });
  expect(Math.abs(Number(cameraCombined.angle) - Number(cameraAfterPan.angle)) > 0.001,
    "combined gesture did not twist the tactical camera", {
      cameraAfterPan, cameraCombined,
    });
  await runFrames(page, 12, "touch combined gesture stationary");
  const cameraCombinedStationary = await touchCameraState(page);
  expect(coordinateDelta(cameraCombined.lookAt, cameraCombinedStationary.lookAt) < 0.01
      && Math.abs(Number(cameraCombined.zoom) - Number(cameraCombinedStationary.zoom)) < 0.0001
      && Math.abs(Number(cameraCombined.angle) - Number(cameraCombinedStationary.angle)) < 0.0001,
    "a stationary combined gesture must not continue changing the camera", {
      cameraCombined, cameraCombinedStationary,
    });
  await dispatchTouchPointer(page, "pointerup", 521, leftClient, true);
  await dispatchTouchPointer(page, "pointerup", 522, rightClient);
  await runFrames(page, 8, "touch combined navigation release");
  const cameraAfterRelease = await touchCameraState(page);
  expect(coordinateDelta(cameraCombinedStationary.lookAt, cameraAfterRelease.lookAt) < 0.01,
    "combined navigation release must not add camera drift", {
      cameraCombinedStationary, cameraAfterRelease,
    });

  const navigationPathAfter = (await rpc(page, "querySelection"))?.result?.commandPath;
  expect(Number(navigationPathAfter?.rawRightDownCount) ===
      Number(navigationPathBefore?.rawRightDownCount)
      && Number(navigationPathAfter?.rawRightUpCount) ===
        Number(navigationPathBefore?.rawRightUpCount)
      && Number(navigationPathAfter?.dispatchMoveCommandCount) ===
        Number(navigationPathBefore?.dispatchMoveCommandCount),
  "camera navigation must not leak a right click or contextual order", {
    navigationPathBefore, navigationPathAfter,
  });

  await page.screenshot({ path: screenshot });
  return {
    enabled: state.enabled,
    selectedObject: { id: unit.id, name: unit.name, localOwned: unit.localOwned },
    order: { before: beforeOrder, after: afterOrder },
    camera: { before: cameraBefore, panMoved: cameraPanMoved,
      panStationary: cameraPanStationary, afterPan: cameraAfterPan,
      combined: cameraCombined, combinedStationary: cameraCombinedStationary,
      afterRelease: cameraAfterRelease },
    renderGeometry,
    screenshot,
  };
}

function realMenuHitMatches(menu, hitProbeName, buttonFieldName) {
  const hitWindow = menu?.[hitProbeName]?.window;
  const button = menu?.[buttonFieldName];
  return button?.clickable === true && hitWindow?.found === true && hitWindow.id === button.id;
}

function collectWindowRefs(clientState) {
  const refs = [];
  for (const group of [
    clientState?.mainMenu,
    clientState?.skirmishMenu,
    clientState?.quitMenu,
    clientState?.replayMenu,
    clientState?.scoreScreen,
  ]) {
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

async function waitForCondition(page, label, predicate, maxFrames = 180) {
  const attempts = [];
  let last = null;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    last = await runFrames(page, 1, label);
    attempts.push(compactClickFrame(last));
    if (predicate(last.frame?.clientState ?? {}, last)) {
      return last;
    }
  }
  expect(false, `${label} did not satisfy condition`, {
    attempts: attempts.slice(-12),
    last: compactClickFrame(last),
  });
}

async function waitForBrowserInput(page, predicate, label) {
  const deadline = Date.now() + 5000;
  let result = await rpc(page, "state");

  while (true) {
    if (predicate(result.state?.browserInput)) {
      return result.state.browserInput;
    }
    if (Date.now() >= deadline) {
      break;
    }
    await page.waitForTimeout(20);
    result = await rpc(page, "state");
  }

  expect(false, `${label} browser input state not observed`, result.state?.browserInput ?? null);
}

async function waitForTransitionIdle(page, label, maxFrames = 120) {
  return waitForCondition(
    page,
    label,
    (clientState) => clientState.transition?.ready === true &&
      clientState.transition?.finished === true,
    maxFrames);
}

async function revealMainMenu(page) {
  const seedPoint = { x: 32, y: 32 };
  const revealPoint = { x: 96, y: 96 };
  await postMouse(page, WM_MOUSEMOVE, seedPoint);
  await waitForCondition(
    page,
    "main-menu seed mouse move",
    (clientState) => clientState.input?.mouse?.x === seedPoint.x &&
      clientState.input?.mouse?.y === seedPoint.y,
    12);

  await postMouse(page, WM_MOUSEMOVE, revealPoint);
  return waitForCondition(
    page,
    "main-menu reveal",
    (clientState) => clientState.input?.mouse?.x === revealPoint.x &&
      clientState.input?.mouse?.y === revealPoint.y &&
      clientState.transition?.finished === true &&
      clientState.input?.mouse?.visible === true &&
      clientState.gates?.breakTheMovie === false &&
      realMenuHitMatches(clientState.mainMenu, "underButtonSinglePlayerCenter", "buttonSinglePlayer"),
    120);
}

async function waitForButtonDown(page, target, label, maxFrames = 12) {
  return waitForCondition(
    page,
    `${label} down`,
    (clientState) => {
      const downTarget = findWindowById(clientState, target.id);
      return clientState.input?.grabWindow?.id === target.id && downTarget?.selected === true;
    },
    maxFrames);
}

async function waitForButtonReleased(page, target, label, maxFrames = 12) {
  return waitForCondition(
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
  const settled = settleFrames == null ? released : await waitForTransitionIdle(page, label, settleFrames);
  return { point, target, released, settled };
}

function visibleQuitMenuReturnButton(quitMenu) {
  if (!quitMenu?.visible) {
    return null;
  }
  for (const button of [quitMenu.buttonReturnNoSave, quitMenu.buttonReturnFull]) {
    if (button?.clickable === true && button.hidden === false && button.managerHidden === false) {
      return button;
    }
  }
  return null;
}

function visibleQuitMenuReturnHitProbe(quitMenu, button) {
  const candidates = [
    quitMenu?.underButtonReturnNoSaveCenter,
    quitMenu?.underButtonReturnFullCenter,
  ];
  return candidates.find((probe) => probe?.window?.found === true &&
    probe.window.id === button?.id) ?? null;
}

function visibleQuitMenuExitButton(quitMenu) {
  if (!quitMenu?.visible) return null;
  for (const button of [quitMenu.buttonExitNoSave, quitMenu.buttonExitFull]) {
    if (button?.clickable === true && button.hidden === false && button.managerHidden === false) return button;
  }
  return null;
}

async function clickWindowByName(page, name, label) {
  const response = await rpc(page, "clickWindowByName", { name });
  expect(response?.ok === true && response?.result?.clicked === true,
    `${label} did not traverse the real window input path`, response);
  return response.result;
}

async function driveReplayRoundTrip(page) {
  const savedReplayBaseName = "Browser Roundtrip";
  const savedReplayFileName = `${savedReplayBaseName}.rep`;
  console.error("[skirmish-start] finalize and name replay");
  const beforeExit = await runFrames(page, 2, "replay recording precheck");
  expect(beforeExit.frame?.clientState?.gameplay?.recorder?.recording === true,
    "active skirmish was not being recorded", beforeExit.frame?.clientState?.gameplay?.recorder);

  await page.keyboard.down("Escape");
  const opened = await waitForCondition(
    page,
    "replay roundtrip quit menu",
    (clientState) => clientState.quitMenu?.visible === true
      && visibleQuitMenuExitButton(clientState.quitMenu)?.clickable === true,
    120);
  await page.keyboard.up("Escape");
  await runFrames(page, 1, "replay roundtrip escape release");
  const exitButton = visibleQuitMenuExitButton(opened.frame.clientState.quitMenu);
  await clickButton(page, exitButton, null, "replay roundtrip exit match", null);
  await runFrames(page, 2, "replay roundtrip quit confirmation");
  await clickWindowByName(page, "QuitMessageBox.wnd:ButtonYes", "quit confirmation");

  const score = await waitForCondition(
    page,
    "replay roundtrip score screen",
    (clientState) => clientState.scoreScreen?.buttonOk?.clickable === true
      && clientState.gameplay?.recorder?.recording === false,
    300);

  await clickButton(page, score.frame.clientState.scoreScreen.buttonSaveReplay,
    null, "score-screen save replay");
  const savePopup = await waitForCondition(
    page,
    "save replay popup",
    (clientState) => clientState.scoreScreen?.popupParent?.managerHidden === false
      && clientState.scoreScreen?.popupTextEntry?.clickable === true,
    120);
  const replayNameEntry = savePopup.frame.clientState.scoreScreen.popupTextEntry;
  const replayNamePoint = { x: replayNameEntry.centerX, y: replayNameEntry.centerY };
  await postMouse(page, WM_MOUSEMOVE, replayNamePoint);
  await postMouse(page, WM_LBUTTONDOWN, replayNamePoint);
  await waitForCondition(
    page,
    "replay-name focus",
    (clientState) => clientState.input?.focusWindow?.id === replayNameEntry.id,
    30);
  await postMouse(page, WM_LBUTTONUP, replayNamePoint);
  await runFrames(page, 2, "replay-name release");
  await page.locator("#viewport").focus();
  await page.keyboard.type(savedReplayBaseName);
  await page.waitForTimeout(50);
  const namedSaveReady = await waitForCondition(
    page,
    "named replay entry",
    (clientState) => clientState.scoreScreen?.popupButtonSave?.clickable === true,
    60);
  await clickButton(page, namedSaveReady.frame.clientState.scoreScreen.popupButtonSave,
    null, "named replay save");
  await page.waitForTimeout(1100);
  await waitForCondition(
    page,
    "named replay save completion",
    (clientState) => clientState.scoreScreen?.popupParent?.managerHidden === true
      && clientState.scoreScreen?.buttonOk?.clickable === true,
    120);

  const persisted = await rpc(page, "persistSaves", { reason: "replay-roundtrip-finalized" });
  expect(persisted?.ok === true, "finalized replay did not persist", persisted);
  const replayFiles = await rpc(page, "listReplays");
  const lastReplay = replayFiles?.files?.find((file) => file.name.toLowerCase() === "00000000.rep");
  const namedReplay = replayFiles?.files?.find((file) => file.name === savedReplayFileName);
  expect(replayFiles?.ok === true && Number(lastReplay?.size ?? 0) > 128,
    "recording did not create Last Replay", replayFiles);
  expect(Number(namedReplay?.size ?? 0) === Number(lastReplay.size),
    "named replay was not copied from Last Replay", replayFiles);
  const replayRead = await rpc(page, "readReplay", { name: namedReplay.name });
  const replayPrefix = replayRead?.bytesBase64 ? atob(replayRead.bytesBase64).slice(0, 6) : "";
  expect(replayRead?.ok === true && replayPrefix === "GENREP",
    "recorded replay bytes were not downloadable", replayRead);

  let playbackFile = namedReplay;
  const removedLastReplay = await rpc(page, "deleteReplay", {
    name: lastReplay.name,
    allowLastReplay: true,
  });
  expect(removedLastReplay?.ok === true, "Last Replay could not be cleared", removedLastReplay);
  if (retailReplayFixture) {
    console.error("[skirmish-start] import retail replay fixture");
    const fixtureBytes = await readFile(resolve(retailReplayFixture));
    const imported = await rpc(page, "importReplay", {
      name: basename(retailReplayFixture),
      bytesBase64: fixtureBytes.toString("base64"),
    });
    expect(imported?.ok === true, "retail replay fixture could not be imported", imported);
    const removed = await rpc(page, "deleteReplay", {
      name: namedReplay.name,
    });
    expect(removed?.ok === true, "named replay could not be cleared for retail playback", removed);
    playbackFile = imported;
  }

  await clickWindowByName(page, "ScoreScreen.wnd:ButtonOk", "score-screen OK");
  console.error("[skirmish-start] open replay menu");
  let shellMenu = await waitForCondition(
    page,
    "replay roundtrip post-score shell",
    (clientState) => clientState.skirmishMenu?.buttonBack?.clickable === true
      || clientState.mainMenu?.buttonLoadReplay?.clickable === true
      || clientState.mainMenu?.buttonSingleBack?.clickable === true,
    300);
  if (shellMenu.frame.clientState.skirmishMenu?.buttonBack?.clickable === true) {
    await clickButton(page, shellMenu.frame.clientState.skirmishMenu.buttonBack,
      null, "replay roundtrip skirmish back");
    shellMenu = await waitForCondition(
      page,
      "replay roundtrip main menu",
      (clientState) => clientState.shell?.topIsMainMenu === true
        && (clientState.mainMenu?.buttonLoadReplay?.clickable === true
          || clientState.mainMenu?.buttonSingleBack?.clickable === true),
      300);
  }
  if (shellMenu.frame.clientState.mainMenu?.buttonLoadReplay?.clickable !== true) {
    await clickButton(page, shellMenu.frame.clientState.mainMenu.buttonSingleBack,
      null, "replay roundtrip single-player back");
  }
  const replayEntry = shellMenu.frame.clientState.mainMenu?.buttonLoadReplay?.clickable === true
    ? shellMenu
    : await waitForCondition(
      page,
      "replay roundtrip load replay entry",
      (clientState) => clientState.mainMenu?.buttonLoadReplay?.clickable === true,
      180);
  await clickButton(page, replayEntry.frame.clientState.mainMenu.buttonLoadReplay,
    null, "replay roundtrip load replay");
  const replayButton = await waitForCondition(
    page,
    "replay roundtrip replay entry",
    (clientState) => clientState.mainMenu?.buttonReplay?.clickable === true,
    180);
  await clickButton(page, replayButton.frame.clientState.mainMenu.buttonReplay,
    null, "replay roundtrip replay list");
  const replayMenu = await waitForCondition(
    page,
    "replay menu populated",
    (clientState) => clientState.replayMenu?.parent?.found === true
      && clientState.replayMenu?.buttonLoad?.clickable === true
      && clientState.replayMenu?.entryCount > 0,
    240);
  await page.locator("#viewport").screenshot({ path: replayMenuScreenshotPath });
  await clickButton(page, replayMenu.frame.clientState.replayMenu.buttonLoad,
    null, "replay menu play");
  if (retailReplayFixture) {
    await runFrames(page, 2, "retail replay version prompt");
    await clickWindowByName(page, "MessageBox.wnd:ButtonOk",
      "retail replay version confirmation");
  }
  console.error("[skirmish-start] wait for replay playback");
  const playback = await waitForCondition(
    page,
    "recorded replay playback",
    (clientState) => clientState.gameplay?.gameMode === 3
      && clientState.gameplay?.inGame === true
      && clientState.gameplay?.loadingMap === false
      && clientState.gameplay?.recorder?.playback === true,
    maxStartFrames);
  await runFrames(page, 30, "recorded replay advances");
  await page.locator("#viewport").screenshot({ path: replayPlaybackScreenshotPath });

  return {
    recording: beforeExit.frame.clientState.gameplay.recorder,
    namedSave: {
      name: namedReplay.name,
      size: namedReplay.size,
    },
    recordedFile: lastReplay,
    playbackFile,
    selectedName: replayMenu.frame.clientState.replayMenu.selectedName,
    playback: {
      gameMode: playback.frame.clientState.gameplay.gameMode,
      recorder: playback.frame.clientState.gameplay.recorder,
      objectCount: playback.frame.clientState.gameplay.objectCount,
      drawableCount: playback.frame.clientState.gameplay.drawableCount,
    },
    screenshots: {
      menu: replayMenuScreenshotPath,
      playback: replayPlaybackScreenshotPath,
    },
  };
}

async function driveEscMenuResume(page) {
  const before = await runFrames(page, 1, "esc menu precheck");
  expect(before.frame?.clientState?.gameplay?.inGame === true &&
      before.frame.clientState.gameplay.gameMode === GAME_SKIRMISH &&
      before.frame.clientState.gameplay.loadingMap === false,
    "ESC menu check requires an active skirmish", before.frame?.clientState?.gameplay);

  await page.keyboard.down("Escape");
  await waitForBrowserInput(
    page,
    (input) => input?.messageQueue?.count >= 1 &&
      input?.keyboardMessageQueue?.count >= 1,
    "Escape keydown");
  const opened = await waitForCondition(
    page,
    "quit menu open",
    (clientState) => clientState.quitMenu?.visible === true &&
      clientState.gameplay?.gamePaused === true &&
      visibleQuitMenuReturnButton(clientState.quitMenu)?.clickable === true,
    120);
  await page.keyboard.up("Escape");
  await waitForBrowserInput(
    page,
    (input) => input?.messageQueue?.count >= 1 &&
      input?.keyboardMessageQueue?.count >= 1,
    "Escape keyup");
  await runFrames(page, 1, "quit menu escape release");

  const returnButton = visibleQuitMenuReturnButton(opened.frame?.clientState?.quitMenu);
  const returnHit = visibleQuitMenuReturnHitProbe(opened.frame?.clientState?.quitMenu, returnButton);
  expect(returnButton?.clickable === true, "quit menu Return button was not clickable",
    opened.frame?.clientState?.quitMenu);

  const resumeClick = await clickButton(
    page,
    returnButton,
    returnHit,
    "quit-menu return",
    null);
  const closed = await waitForCondition(
    page,
    "quit menu close",
    (clientState) => clientState.quitMenu?.visible === false &&
      clientState.gameplay?.gamePaused === false,
    120);

  return {
    opened: {
      gameplay: opened.frame?.clientState?.gameplay ?? null,
      quitMenu: opened.frame?.clientState?.quitMenu ?? null,
    },
    returnClick: {
      point: resumeClick.point,
      target: resumeClick.target,
      releasedGameplay: resumeClick.released.frame?.clientState?.gameplay ?? null,
    },
    closed: {
      gameplay: closed.frame?.clientState?.gameplay ?? null,
      quitMenu: closed.frame?.clientState?.quitMenu ?? null,
    },
  };
}

async function waitForSkirmishMatch(page) {
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced < maxStartFrames) {
    const frames = Math.min(frameChunk, maxStartFrames - framesAdvanced);
    const startedAt = performance.now();
    const result = await runSummary(page, frames, "skirmish match wait");
    const wallMs = performance.now() - startedAt;
    framesAdvanced += frames;
    const gameplay = result.frame?.gameplay;
    const sample = {
      ...compactGameplay(result.frame),
      requestedFrames: frames,
      wallMs,
      wallMsPerFrame: wallMs / frames,
    };
    samples.push(sample);
    if (gameplay?.gameMode === GAME_SKIRMISH &&
        gameplay?.inGame === true &&
        gameplay?.loadingMap === false &&
        gameplay?.inputEnabled === true &&
        Number(gameplay?.objectCount ?? 0) > 0 &&
        Number(gameplay?.drawableCount ?? 0) > 0 &&
        Number(gameplay?.renderedObjectCount ?? 0) > 0) {
      return { result, framesAdvanced, samples };
    }
  }
  expect(false, "skirmish did not reach an active match", {
    maxStartFrames,
    samples: samples.slice(-12),
  });
}

async function runPostActiveFrames(page, totalFrames, chunkSize) {
  const samples = [];
  let framesAdvanced = 0;
  let last = null;
  while (framesAdvanced < totalFrames) {
    const frames = Math.min(chunkSize, totalFrames - framesAdvanced);
    const startedAt = performance.now();
    last = await runSummary(page, frames, "skirmish post-active wait");
    const wallMs = performance.now() - startedAt;
    framesAdvanced += frames;
    samples.push({
      ...compactGameplay(last.frame),
      requestedFrames: frames,
      wallMs,
      wallMsPerFrame: wallMs / frames,
    });
  }
  return { result: last, framesAdvanced, samples };
}

function indexedPlayers(diagnostics) {
  const players = diagnostics?.players;
  if (!Array.isArray(players)) return new Map();
  return new Map(players.map((player) => [Number(player.index), player]));
}

function enemyAiPlayers(diagnostics) {
  const players = diagnostics?.players;
  if (!Array.isArray(players)) return [];
  return players.filter((player) =>
    player?.local !== true &&
    player?.skirmishAI === true &&
    player?.relationshipToLocal === "enemy");
}

function summarizeEnemyStartAssets(gameplay) {
  const diagnostics = gameplay?.playerDiagnostics;
  const players = Array.isArray(diagnostics?.players) ? diagnostics.players : [];
  const enemies = enemyAiPlayers(diagnostics);
  const neutralCommandCenters = players
    .filter((player) => player?.relationshipToLocal === "neutral")
    .reduce((count, player) => count + Number(player?.objects?.commandCenters ?? 0), 0);
  const enemySummaries = enemies.map((enemy) => {
    const objects = enemy.objects ?? {};
    const buildList = enemy.buildList ?? {};
    const hasStartAssets = enemy.active === true &&
      enemy.dead !== true &&
      Number(objects.commandCenters ?? 0) > 0 &&
      Number(objects.dozers ?? 0) > 0 &&
      Number(objects.productionObjects ?? 0) > 0 &&
      Number(buildList.entries ?? 0) > 0;
    return {
      index: enemy.index,
      name: enemy.name,
      side: enemy.side,
      difficultyName: enemy.difficultyName,
      active: enemy.active,
      dead: enemy.dead,
      money: enemy.money,
      objects,
      buildList,
      hasStartAssets,
    };
  });
  return {
    frame: gameplay?.framesCompleted ?? null,
    localPlayerIndex: diagnostics?.localPlayerIndex ?? null,
    enemyAiCount: enemies.length,
    neutralCommandCenters,
    enemySummaries,
    ready: enemies.length > 0 &&
      neutralCommandCenters === 0 &&
      enemySummaries.every((summary) => summary.hasStartAssets),
  };
}

function summarizeEnemyAiActivity(activeGameplay, postActive) {
  const samples = [
    activeGameplay,
    ...(postActive?.samples ?? []),
    postActive?.finalGameplay,
  ].filter((sample) => sample?.playerDiagnostics?.players);
  const first = samples[0] ?? null;
  const last = samples[samples.length - 1] ?? null;
  const firstEnemies = enemyAiPlayers(first?.playerDiagnostics);
  const lastPlayers = indexedPlayers(last?.playerDiagnostics);
  const enemySummaries = firstEnemies.map((initial) => {
    const final = lastPlayers.get(Number(initial.index)) ?? null;
    const initialObjects = Number(initial.objects?.total ?? 0);
    const finalObjects = Number(final?.objects?.total ?? 0);
    const initialMoney = Number(initial.money ?? 0);
    const finalMoney = Number(final?.money ?? initialMoney);
    return {
      index: initial.index,
      name: initial.name,
      side: initial.side,
      difficultyName: initial.difficultyName,
      initial: {
        active: initial.active,
        money: initialMoney,
        objects: initial.objects ?? null,
        buildList: initial.buildList ?? null,
      },
      final: final == null ? null : {
        active: final.active,
        money: finalMoney,
        objects: final.objects ?? null,
        buildList: final.buildList ?? null,
      },
      objectDelta: finalObjects - initialObjects,
      moneyDelta: finalMoney - initialMoney,
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
    framesAdvanced: postActive?.framesAdvanced ?? 0,
    sampleCount: samples.length,
    firstFrame: first?.framesCompleted ?? null,
    lastFrame: last?.framesCompleted ?? null,
    localPlayerIndex: last?.playerDiagnostics?.localPlayerIndex ?? null,
    ai: last?.ai ?? first?.ai ?? null,
    enemyAiCount: firstEnemies.length,
    enemySummaries,
    activityDetected: enemySummaries.some((summary) => summary.activeEvidence),
  };
}

// Rally-point render probe. Selects a local production structure, issues a
// right-click on the ground to set its rally point, and reports (a) whether the
// engine issued MSG_SET_RALLY_POINT (logic-level, render-independent) and (b)
// before/after screenshots so the blue rally line can be visually confirmed.
async function driveRallyPointProbe(page) {
  const WM_RBUTTONDOWN = 0x0204;
  const WM_RBUTTONUP = 0x0205;
  const info = { steps: [] };
  const rallyBeforePath = resolve(screenshotsRoot, "rally-before.png");
  const rallyAfterPath = resolve(screenshotsRoot, "rally-after.png");
  try {
    await rpc(page, "revealLocalMap", { permanent: true });
    await runFrames(page, 6, "rally reveal settle");

    const drawablesResult = await rpc(page, "queryDrawables");
    const drawables = drawablesResult?.result?.drawables ?? [];
    info.localDrawableCount = drawables.length;
    const candidates0 = drawables.filter((d) =>
      d?.structure === true && d?.localOwned === true && d?.hidden !== true &&
      d?.screenPos != null && d?.worldPos != null);
    info.candidateCount = candidates0.length;
    const building = candidates0[0] ?? null;
    if (!building) {
      info.ok = false;
      info.reason = "no local structure found for rally probe";
      return info;
    }
    info.building = { name: building.name, screenPos: building.screenPos, worldPos: building.worldPos };
    // postMouse and queryDrawables screenPos share the engine display space
    // (800x600), so clicking the building's screenPos selects it directly.
    const origin = { x: Math.round(building.screenPos.x), y: Math.round(building.screenPos.y) };
    const bp = { x: origin.x, y: origin.y };
    info.selectClick = bp;

    // Select the building.
    await postMouse(page, WM_MOUSEMOVE, bp);
    await postMouse(page, WM_LBUTTONDOWN, bp);
    await postMouse(page, WM_LBUTTONUP, bp);
    await runFrames(page, 4, "rally select settle");
    await page.locator("#viewport").screenshot({ path: rallyBeforePath });

    // Right-click a ground point lower-left of the building to set the rally
    // point. A correct rally line would run diagonally down-left — clearly
    // distinct from the suspected horizontal render artifact above the dome.
    const rp = {
      x: Math.max(20, origin.x - 100),
      y: Math.min(420, origin.y + 150),
    };
    info.rallyTarget = rp;
    await postMouse(page, WM_MOUSEMOVE, rp);
    await postMouse(page, WM_RBUTTONDOWN, rp);
    await postMouse(page, WM_RBUTTONUP, rp);
    await runFrames(page, 8, "rally set settle");

    // Re-select and hold selection so drawWaypoints() renders the rally line
    // (the line only draws while the production structure is selected). The
    // before/after screenshots capture the blue rally line running from the
    // building exit to the rally flag (visual verification).
    await postMouse(page, WM_MOUSEMOVE, bp);
    await postMouse(page, WM_LBUTTONDOWN, bp);
    await postMouse(page, WM_LBUTTONUP, bp);
    await runFrames(page, 6, "rally reselect settle");
    await page.locator("#viewport").screenshot({ path: rallyAfterPath });
    info.ok = true;
    info.screenshots = { before: rallyBeforePath, after: rallyAfterPath };
  } catch (error) {
    info.ok = false;
    info.error = error?.message ?? String(error);
  }
  return info;
}

// Decal probe: reveal the map, find the local player's Command Center (which
// carries the faction/general house-color insignia decal on its concrete
// plaza), point the tactical camera at it, and screenshot twice (two frames
// apart) so a flickering/z-fighting insignia decal is visible as a difference
// between frames. Used to verify the D3D8 ZBIAS polygon-offset fix renders the
// whole insignia decal stably.
async function driveDecalProbe(page) {
  const info = { steps: [] };
  const decalAPath = resolve(screenshotsRoot, "decal-cc-a.png");
  const decalBPath = resolve(screenshotsRoot, "decal-cc-b.png");
  try {
    await rpc(page, "revealLocalMap", { permanent: true });
    await runFrames(page, 6, "decal reveal settle");

    const drawablesResult = await rpc(page, "queryDrawables");
    const drawables = drawablesResult?.result?.drawables ?? [];
    info.localDrawableCount = drawables.length;
    // Prefer the local player's command center; fall back to any command
    // center, then any local structure.
    const isCommandCenter = (d) =>
      typeof d?.name === "string" && /commandcenter|command_center/i.test(d.name);
    const localStructures = drawables.filter((d) =>
      d?.structure === true && d?.localOwned === true && d?.hidden !== true &&
      d?.worldPos != null);
    const target =
      localStructures.find(isCommandCenter) ??
      drawables.filter((d) => isCommandCenter(d) && d?.worldPos != null)[0] ??
      localStructures[0] ??
      null;
    if (!target) {
      info.ok = false;
      info.reason = "no command center / local structure found for decal probe";
      info.sampleNames = drawables.slice(0, 40).map((d) => d?.name).filter(Boolean);
      return info;
    }
    info.target = { name: target.name, worldPos: target.worldPos, localOwned: target.localOwned };

    // Center the tactical camera on the building so its plaza insignia decal
    // fills the frame.
    const look = await rpc(page, "tacticalViewLookAt", {
      x: Number(target.worldPos.x ?? 0),
      y: Number(target.worldPos.y ?? 0),
      z: Number(target.worldPos.z ?? 0),
    });
    info.lookAt = { ok: look?.ok === true, result: look?.result ?? null };
    await runFrames(page, 8, "decal lookat settle");

    await page.locator("#viewport").screenshot({ path: decalAPath });
    await runFrames(page, 3, "decal inter-frame settle");
    await page.locator("#viewport").screenshot({ path: decalBPath });
    info.ok = true;
    info.screenshots = { a: decalAPath, b: decalBPath };
  } catch (error) {
    info.ok = false;
    info.error = error?.message ?? String(error);
  }
  return info;
}

async function driveScorchProbe(page) {
  const screenshot = resolve(screenshotsRoot, "scorch-depth-bias.png");
  const reveal = await rpc(page, "revealLocalMap", { permanent: true });
  expect(reveal?.ok === true, "scorch probe could not reveal the local map", reveal);
  await runFrames(page, 2, "scorch reveal settle");

  const drawables = await rpc(page, "queryDrawables");
  const target = (drawables?.result?.drawables ?? []).find((drawable) =>
    drawable.localOwned === true && drawable.onScreen === true &&
    drawable.hidden !== true && drawable.worldPos);
  expect(Boolean(target), "scorch probe could not find a visible local target", drawables?.result);

  const position = {
    x: Number(target.worldPos.x) + 40,
    y: Number(target.worldPos.y) + 40,
    z: Number(target.worldPos.z),
  };
  const trigger = await rpc(page, "realEngineDoFX", {
    name: "WeaponFX_BattleshipTargetExplode",
    useViewPosition: false,
    clampToTerrain: true,
    ...position,
  });
  expect(trigger?.ok === true, "scorch probe could not trigger the shipped explosion FX", trigger);

  await page.evaluate(() => {
    window.__cncSetD3D8SceneDrawHistoryLimit?.(4096);
    window.__cncSetDiagLevel?.("full");
  });
  const frame = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  const labels = new Map(
    (locateNested(frame?.frame, ["textureDiagnostics"])?.labels ?? [])
      .map((label) => [Number(label.id), label.name || label.path || ""]),
  );
  const sceneDraws = (frame?.state?.graphics?.d3d8SceneDrawHistory ?? [])
    .map((draw) => ({
      sequence: draw.drawSequence,
      texture: labels.get(Number(draw.texture0?.id ?? 0)) ?? "",
      zBias: Number(draw.renderState?.zBias ?? 0),
      polygonOffset: draw.appliedRenderState?.depth?.bias?.polygonOffset ?? null,
    }));
  const scorchDraws = sceneDraws.filter((draw) => /scorch/i.test(draw.texture));
  await page.locator("#viewport").screenshot({ path: screenshot });
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

  expect(scorchDraws.length > 0,
    "shipped explosion FX did not reach the terrain scorch draw", { trigger, scorchDraws });
  expect(scorchDraws.every((draw) =>
    draw.zBias === 1 && draw.polygonOffset?.enabled === true),
    "terrain scorch draw did not reach WebGL with D3D8 depth bias enabled", scorchDraws);
  const lastScorchSequence = Math.max(...scorchDraws.map((draw) => draw.sequence));
  const firstPostScorchDraw = sceneDraws.find((draw) => draw.sequence > lastScorchSequence) ?? null;
  expect(firstPostScorchDraw?.zBias === 0 && firstPostScorchDraw?.polygonOffset?.enabled !== true,
    "terrain scorch draw leaked its depth bias into following scene draws", {
      lastScorchSequence,
      firstPostScorchDraw,
    });
  return {
    target: target.name,
    position,
    trigger: trigger.result,
    scorchDraws,
    firstPostScorchDraw,
    screenshot,
  };
}

function particleEffectDraws(frame) {
  const labels = new Map(
    (locateNested(frame?.frame, ["textureDiagnostics"])?.labels ?? [])
      .map((label) => [Number(label.id), label.name || label.path || ""]),
  );
  return lightProbeDrawHistory(frame)
    .map((draw) => ({
      label: labels.get(Number(draw.texture0?.id ?? 0)) ?? "",
      sequence: draw.drawSequence,
      indexCount: draw.indexCount,
      stage0: {
        colorOp: draw.renderState?.textureStage0?.colorOp ?? null,
        alphaOp: draw.renderState?.textureStage0?.alphaOp ?? null,
      },
      stage1: {
        colorOp: draw.renderState?.textureStage1?.colorOp ?? null,
        alphaOp: draw.renderState?.textureStage1?.alphaOp ?? null,
      },
      projectedVertices: draw.vertexSummary?.projected?.visible ?? 0,
    }))
    .filter((draw) => /cloud|smoke|dust/i.test(draw.label));
}

async function inspectGraphics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const context = canvas?.getContext("webgl2");
    const debugInfo = context?.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: context?.getParameter(
        debugInfo?.UNMASKED_RENDERER_WEBGL ?? context?.RENDERER,
      ) ?? null,
      contextLost: context?.isContextLost() ?? true,
      contextLossBanner: Boolean(document.querySelector("#webglContextLostBanner")),
    };
  });
}

async function driveParticleVisibilityProbe(page) {
  const screenshot = resolve(screenshotsRoot, "particle-visibility-smoke.png");
  await rpc(page, "revealLocalMap", { permanent: true });
  await runFrames(page, 2, "particle visibility reveal settle");

  const drawables = await rpc(page, "queryDrawables");
  const target = (drawables?.result?.drawables ?? []).find((drawable) =>
    drawable.localOwned === true && drawable.onScreen === true &&
    drawable.hidden !== true && drawable.worldPos);
  expect(Boolean(target),
    "particle visibility probe could not find a visible local target", drawables?.result);

  const before = await runSummary(page, 1, "particle visibility baseline");
  const beforeParticleCount = Number(before?.frame?.particles?.particleCount ?? 0);
  const beforeOnScreenCount = Number(before?.frame?.particles?.onScreenParticleCount ?? 0);
  await page.evaluate(() => {
    window.__cncSetD3D8PerfCounters?.(true);
    window.__cncSetD3D8SceneDrawHistoryLimit?.(4096);
  });

  const systems = ["MOABDustWave", "SubExplosionSmoke02"];
  const triggers = [];
  for (const name of systems) {
    const trigger = await rpc(page, "realEngineSpawnParticleSystem", {
      name,
      ...target.worldPos,
      useViewPosition: false,
      clampToTerrain: true,
    });
    expect(trigger?.ok === true, "particle visibility system trigger failed", { name, trigger });
    triggers.push(trigger.result);
  }

  const frames = [];
  const maxFrames = particleVisibilityFrames + 120;
  for (let advanced = 1; advanced <= maxFrames && frames.length < particleVisibilityFrames;
    ++advanced) {
    const beforePerf = await page.evaluate(() => window.__cncD3D8PerfSummary?.() ?? {});
    const frame = await runSummary(page, 1, "particle visibility continuity");
    const afterPerf = await page.evaluate(() => window.__cncD3D8PerfSummary?.() ?? {});
    const particleCount = Number(frame?.frame?.particles?.particleCount ?? 0);
    const onScreenParticleCount = Number(
      frame?.frame?.particles?.onScreenParticleCount ?? 0);
    if (particleCount <= beforeParticleCount + 10 ||
        onScreenParticleCount <= beforeOnScreenCount + 10) {
      continue;
    }

    const activeFrame = frames.length + 1;
    const sample = {
      advanced,
      activeFrame,
      particleCount,
      onScreenParticleCount,
      particleProgramDraws: Number(afterPerf.particleProgramDraws ?? 0) -
        Number(beforePerf.particleProgramDraws ?? 0),
      effectDraws: null,
    };

    // Full draw history synchronizes the GPU once per draw. Sample it at
    // intervals while the lightweight counter checks every continuity frame.
    if (activeFrame === 1 || activeFrame % 10 === 0) {
      await page.evaluate(() => {
        window.__cncClearD3D8SceneDrawHistory?.();
        window.__cncSetDiagLevel?.("full");
      });
      const diagnostic = await runSummary(page, 1, "particle visibility draw-state sample");
      sample.effectDraws = particleEffectDraws(diagnostic);
      await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
    }
    frames.push(sample);

    if (activeFrame === 8) {
      await page.locator("#viewport").screenshot({ path: screenshot });
    }
  }

  if (frames.length < 8) {
    await page.locator("#viewport").screenshot({ path: screenshot });
  }

  const missingProgramFrames = frames.filter((frame) => frame.particleProgramDraws <= 0);
  const diagnosticFrames = frames.filter((frame) => frame.effectDraws !== null);
  const missingDrawFrames = diagnosticFrames.filter((frame) => frame.effectDraws.length === 0);
  const missingTextureFrames = diagnosticFrames.filter((frame) =>
    !frame.effectDraws.some((draw) => /excloud01/i.test(draw.label)) ||
    !frame.effectDraws.some((draw) => /exsmokepuff/i.test(draw.label)));
  const sampledDraws = diagnosticFrames.flatMap((frame) => frame.effectDraws);
  const staleStageDraws = sampledDraws.filter((draw) =>
    draw.stage1.colorOp !== D3DTOP_DISABLE || draw.stage1.alphaOp !== D3DTOP_DISABLE);
  const offscreenDraws = sampledDraws
    .filter((draw) => draw.projectedVertices === 0);
  const graphics = await inspectGraphics(page);
  const expectedRenderer = String(
    process.env.SKIRMISH_START_EXPECT_RENDERER ?? "").trim().toLowerCase();

  expect(frames.length === particleVisibilityFrames,
    "spawned smoke and dust did not stay visibly active long enough", {
      beforeParticleCount,
      beforeOnScreenCount,
      frames,
    });
  expect(missingProgramFrames.length === 0,
    "visible smoke or dust intermittently missed the particle renderer", missingProgramFrames);
  expect(missingDrawFrames.length === 0,
    "visible smoke or dust intermittently lost its renderer draw", missingDrawFrames);
  expect(missingTextureFrames.length === 0,
    "sampled frames did not contain both shipped smoke and dust textures",
    missingTextureFrames);
  expect(staleStageDraws.length === 0,
    "particle draws inherited a stale stage-one texture combiner", staleStageDraws);
  expect(offscreenDraws.length === 0,
    "sampled particle draws did not project into the viewport", offscreenDraws);
  expect(graphics.contextLost === false && graphics.contextLossBanner === false,
    "particle visibility run lost its WebGL context", graphics);
  if (expectedRenderer) {
    expect(String(graphics.renderer ?? "").toLowerCase().includes(expectedRenderer),
      "particle visibility run used an unexpected GPU renderer", graphics);
  }

  return {
    target: { name: target.name, worldPos: target.worldPos, screenPos: target.screenPos },
    systems,
    triggers,
    beforeParticleCount,
    beforeOnScreenCount,
    frames,
    graphics,
    screenshot,
  };
}

// Tree-lighting discriminator: read the baked per-vertex diffuse of the tree
// draw pass (FVF XYZ|NORMAL|DIFFUSE|TEX1 = 0x152, stride 36) from the draw
// history. If diffuse is ~white the CPU bake is wrong (sun-direction/light data
// → hypothesis A); if it is shaded/dark but trees still look wrong on GPU the
// Metal combiner drops it (hypothesis B).
async function driveTreeDiffuseProbe(page) {
  const info = { steps: [] };
  try {
    await page.evaluate(() => { window.__cncSetDiagLevel?.("full"); window.__cncSetD3D8SceneDrawHistoryLimit?.(8192); });
    await rpc(page, "revealLocalMap", { permanent: true });
    await runFrames(page, 4, "tree probe reveal settle");
    // realEngineFrameSummary populates the scene draw history (realEngineFrame does not).
    const frame = await runSummary(page, 1, "tree probe frame");
    const hist = frame?.result?.state?.graphics?.d3d8SceneDrawHistory
      ?? frame?.frame?.graphics?.d3d8SceneDrawHistory
      ?? frame?.result?.frame?.graphics?.d3d8SceneDrawHistory
      ?? frame?.result?.state?.graphics?.d3d8DrawHistory ?? [];
    info.totalDraws = hist.length;
    const treeDraws = hist.filter((d) => Number(d.vertexStride) === 36 &&
      (Number(d.vertexShaderFvf) === 0x152 || Number(d.vertexShaderFvf) === 338));
    info.treeDrawCount = treeDraws.length;
    info.treeDraws = treeDraws.slice(0, 6).map((d) => ({
      seq: d.drawSequence, fvf: d.vertexShaderFvf, stride: d.vertexStride,
      verts: d.vertexCount, tex0: d.texture0?.id ?? null,
      lighting: d.renderState?.lighting ?? null,
      colorOp0: d.renderState?.textureStage0?.colorOp ?? d.renderState?.colorOp ?? null,
      diffuse: d.vertexSummary?.diffuse ?? d.vertexSummary ?? null,
    }));
    // Always aggregate diffuse min/max/avg per (stride, fvf) group so the tree
    // draws can be compared against the TERRAIN draws (the in-frame dark
    // reference) on the same map -- this makes the tree-lighting verification
    // map-agnostic: on a dark map the terrain diffuse is dark, and after the
    // re-bake fix the tree diffuse should land in the same dark range instead of
    // staying bright.
    {
      const groups = new Map();
      for (const d of hist) {
        const key = `${d.vertexStride}/${d.vertexShaderFvf}`;
        const diff = d.vertexSummary?.diffuse ?? null;
        let g = groups.get(key);
        if (!g) {
          g = { stride: d.vertexStride, fvf: d.vertexShaderFvf, drawCount: 0,
                min: [255, 255, 255, 255], max: [0, 0, 0, 0], avgSum: [0, 0, 0, 0], avgN: 0 };
          groups.set(key, g);
        }
        g.drawCount += 1;
        if (diff && diff.min && diff.max && diff.average) {
          for (let c = 0; c < 4; c++) {
            g.min[c] = Math.min(g.min[c], diff.min[c]);
            g.max[c] = Math.max(g.max[c], diff.max[c]);
            g.avgSum[c] += diff.average[c];
          }
          g.avgN += 1;
        }
      }
      info.diffuseByGroup = [...groups.values()].map((g) => ({
        stride: g.stride, fvf: g.fvf, drawCount: g.drawCount,
        diffuseMin: g.avgN ? g.min : null, diffuseMax: g.avgN ? g.max : null,
        diffuseAvg: g.avgN ? g.avgSum.map((s) => Number((s / g.avgN).toFixed(1))) : null,
      })).sort((a, b) => b.drawCount - a.drawCount).slice(0, 30);
    }
    info.ok = true;
  } catch (error) {
    info.ok = false;
    info.error = error?.message ?? String(error);
  }
  return info;
}

async function main() {
  await mkdir(dirname(screenshotPath), { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });
  if (menuScreenshotPath) {
    await mkdir(dirname(menuScreenshotPath), { recursive: true });
  }
  if (browserProfileDir) {
    await rm(browserProfileDir, { recursive: true, force: true });
    await mkdir(browserProfileDir, { recursive: true });
  }

  const server = await startStaticServer({ root: wasmRoot });
  let browser;
  try {
    const launchOptions = { headless: true };
    const executablePath = process.env.SKIRMISH_START_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    if (process.env.SKIRMISH_START_BROWSER_ARGS) {
      launchOptions.args = process.env.SKIRMISH_START_BROWSER_ARGS.split(/\s+/).filter(Boolean);
    }
    const pageOptions = expectTouchControlsProbe
      ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1280, height: 720 } };
    if (browserProfileDir) Object.assign(launchOptions, pageOptions);

    browser = browserProfileDir
      ? await chromium.launchPersistentContext(browserProfileDir, launchOptions)
      : await chromium.launch(launchOptions);
    const page = browserProfileDir
      ? await browser.newPage()
      : await browser.newPage(pageOptions);
    page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(300000);
    page.on("pageerror", (error) => {
      console.error(`[skirmish-start] pageerror ${error.stack ?? error.message}`);
    });
    page.on("console", (msg) => {
      const text = msg.text();
      // Forward engine diagnostic prints (TREEBAKE / staticLightingChanged) on
      // whatever console channel emscripten routes stdout/stderr to, plus errors.
      if (msg.type() === "error" || /cnc-port:|TREEBAKE|staticLightingChanged/.test(text)) {
        console.error(`[skirmish-start page] ${text}`);
      }
    });

    let activeMod = null;
    if (requestedModPackage) {
      console.error(`[skirmish-start] import mod ${requestedModPackage}`);
      await page.goto(new URL("harness/play.html", server.url).href, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(window.ZeroHModManager?.store));
      const displayName = requestedModName || requestedModPackage.replace(/\.[^.]+$/, "");
      if (requestedModLocalPath || requestedModLocalDir) {
        const before = await page.evaluate(() => window.ZeroHModManager.store.list().length);
        await page.locator('.desktop-icon[data-open="mods"]').click();
        await page.waitForSelector("#modsWindow.is-open");
        await page.locator("#modImportName").fill(displayName);
        const inputSelector = requestedModLocalDir
          ? "#modImportFolderInput"
          : "#modImportPackageInput";
        const localInput = resolve(requestedModLocalDir || requestedModLocalPath);
        await page.locator(inputSelector).setInputFiles(localInput);
        await page.waitForFunction((count) => {
          const progress = document.querySelector("#modImportProgress")?.textContent || "";
          return window.ZeroHModManager.store.list().length === count + 1
            || progress.startsWith("Import failed:");
        }, before, { timeout: 30 * 60_000 });
        const progress = await page.locator("#modImportProgress").textContent();
        if (progress.startsWith("Import failed:")) {
          throw new Error(`${requestedModPackage}: ${progress}`);
        }
      } else {
        const importUrl = new URL(
          `artifacts/mod-packages/${encodeURIComponent(requestedModPackage)}`, server.url).href;
        await page.evaluate(async ({ url, fileName, name }) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Mod package fetch failed (${response.status})`);
          const file = new File([await response.blob()], fileName);
          await window.ZeroHModManager.store.importFiles([file], { name });
        }, {
          url: importUrl,
          fileName: requestedModPackage,
          name: displayName,
        });
      }
      activeMod = await page.evaluate(async () => {
        const imported = window.ZeroHModManager.store.list().at(-1);
        const context = await window.ZeroHModManager.store.apply([imported.id]);
        return {
          id: imported.id,
          name: imported.name,
          archiveCount: imported.archives.filter((archive) => archive.enabled).length,
          totalBytes: imported.totalBytes,
          contentHash: imported.contentHash,
          contextId: context.id,
        };
      });
      console.error(`[skirmish-start] imported ${activeMod.name}: ${activeMod.archiveCount} enabled archives`);
    }

    const harnessUrl = new URL(
      expectTouchControlsProbe ? "harness/play.html" : "harness/index.html",
      server.url,
    );
    harnessUrl.searchParams.set("dist", distDir);
    if (process.env.SKIRMISH_START_THREADS === "1") harnessUrl.searchParams.set("threads", "1");
    if (expectLightPulseProbe) {
      // Terrain buffers are created while diagnostics are in lite mode. Keep
      // their CPU mirrors from creation so the probe can compare the original
      // per-vertex diffuse values before, during, and after the light pulse.
      harnessUrl.searchParams.set("d3d8LiteVertexMirrors", "1");
    }
    await page.goto(harnessUrl.href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    if (expectTouchControlsProbe) {
      await page.evaluate(() => {
        const overlay = document.querySelector("#launchOverlay");
        overlay.hidden = false;
        overlay.classList.add("is-running");
        document.querySelector("#launchLoader").hidden = true;
        document.querySelector("#viewport").hidden = false;
      });
    }
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
    const modMountPlan = activeMod
      ? await page.evaluate(async () => {
        const { activeModMountPlan, loadActiveModContext } = await import("./mod-context.mjs");
        return activeModMountPlan(loadActiveModContext(window.localStorage));
      })
      : [];

    let audioSetup = null;
    if (expectMenuMusicStop) {
      console.error("[skirmish-start] enable Web Audio for music transition check");
      const audioRuntime = await resumeAudio(page);
      const mixer = await rpc(page, "setBrowserAudioMixerVolumes", {
        trigger: "skirmish_start_smoke.mjs music transition",
      });
      expect(audioRuntime?.browserAudioRuntime?.contextState === "running"
          && mixer?.browserAudioMixerRuntime?.created === true
          && mixer?.browserAudioMixerRuntime?.contextState === "running",
        "Web Audio was not ready for skirmish music transition check", {
          audioRuntime,
          mixer,
        });
      audioSetup = {
        runtime: audioRuntime.browserAudioRuntime,
        mixer: mixer.browserAudioMixerRuntime,
      };
    }

    console.error("[skirmish-start] mounting archives");
    const mount = await rpc(page, "mountArchives", {
      path: "/assets/skirmish-start",
      verifyEach: false,
      archives: buildArchives(server.url),
      mods: modMountPlan,
    });
    expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
      "failed to mount runtime archives", mount?.archiveSet ?? mount);
    if (activeMod) {
      expect(mount?.modSet?.archiveCount === activeMod.archiveCount
          && mount?.modSet?.modCount === 1,
      "failed to mount imported mod archives", mount?.modSet ?? mount);
    }

    let touchBootResolution = null;
    if (expectTouchControlsProbe) {
      // This harness initializes the engine through RPC instead of invoking
      // play.mjs's normal launch sequence, so explicitly replay the shipping
      // dynamic-resolution decision through the same pre-init hook.
      touchBootResolution = await page.evaluate(async () => {
        const {
          dynamicResolutionForBox,
          isIOSLikeNavigator,
          isIPadLikeNavigator,
        } = await import("./display-resolution.mjs");
        const canvas = document.querySelector("#viewport");
        const rect = canvas.getBoundingClientRect();
        return dynamicResolutionForBox({
          cssWidth: rect.width || window.innerWidth,
          cssHeight: rect.height || window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
          iosLike: isIOSLikeNavigator(navigator),
          ipadLike: isIPadLikeNavigator(navigator),
        });
      });
    }

    console.error("[skirmish-start] real init");
    const init = await rpc(page, "realEngineInit", {
      runDirectory: "/assets/skirmish-start",
      shellMap: true,
      modDirectory: mount.modDirectory ?? "",
      bootWidth: touchBootResolution?.width,
      bootHeight: touchBootResolution?.height,
    });
    expect(init?.ok === true && init?.aborted === false && init?.frontier?.initReturned === true,
      "real engine init failed", init?.frontier ?? init);
    if (activeMod) {
      expect(init.frontier.commandLine?.includes("-mod /assets/cnc-mods-active"),
        "real engine did not receive the imported mod directory", init.frontier);
    }
    if (expectReplayRoundTrip) {
      const existingReplays = await rpc(page, "listReplays");
      const priorLastReplay = existingReplays?.files?.find((file) =>
        file.name.toLowerCase() === "00000000.rep");
      if (priorLastReplay) {
        const removed = await rpc(page, "deleteReplay", {
          name: priorLastReplay.name,
          allowLastReplay: true,
        });
        expect(removed?.ok === true, "old Last Replay could not be cleared", removed);
      }
    }

    let frame = await runFrames(page, 5, "initial menu frames");
    if (frame.frame?.clientState?.shell?.topIsMainMenu !== true) {
      frame = await waitForCondition(
        page,
        "main menu available",
        (clientState) => clientState.shell?.topIsMainMenu === true &&
          clientState.shell?.topHidden === false,
        activeMod ? 1200 : 120);
    }
    expect(frame.frame?.clientState?.mainMenu?.buttonSinglePlayer?.found === true,
      "main menu Single Player button geometry is unavailable",
      frame.frame?.clientState?.mainMenu?.buttonSinglePlayer);
    console.error("[skirmish-start] reveal main menu");
    const revealed = await revealMainMenu(page);
    if (menuScreenshotPath) {
      await page.locator("#viewport").screenshot({ path: menuScreenshotPath });
    }
    const menuMusic = expectMenuMusicStop
      ? await waitForActiveMusic(page, "main menu music")
      : null;

    console.error("[skirmish-start] click single player");
    const singlePlayerClick = await clickButton(
      page,
      revealed.frame.clientState.mainMenu.buttonSinglePlayer,
      revealed.frame.clientState.mainMenu.underButtonSinglePlayerCenter,
      "single-player");
    const singlePlayerMenu = singlePlayerClick.settled.frame?.clientState?.mainMenu;
    expect(singlePlayerMenu?.buttonSkirmish?.clickable === true,
      "single-player menu did not expose ButtonSkirmish", singlePlayerMenu);

    console.error("[skirmish-start] click skirmish");
    const skirmishClick = await clickButton(
      page,
      singlePlayerMenu.buttonSkirmish,
      null,
      "skirmish");
    const skirmishMenuReady = skirmishClick.settled.frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true
      ? skirmishClick.settled
      : await waitForCondition(
        page,
        "skirmish options menu",
        (clientState) => clientState.skirmishMenu?.buttonStart?.clickable === true,
        180);
    const skirmishMenu = skirmishMenuReady.frame?.clientState?.skirmishMenu;
    expect(skirmishMenu?.parent?.found === true && skirmishMenu?.buttonStart?.clickable === true,
      "skirmish game options menu did not become startable", skirmishMenu);

    console.error("[skirmish-start] type player name");
    const playerNameEntry = skirmishMenu.textEntryPlayerName;
    expect(playerNameEntry?.clickable === true,
      "skirmish player-name entry is unavailable", playerNameEntry);
    const playerNamePoint = { x: playerNameEntry.centerX, y: playerNameEntry.centerY };
    await postMouse(page, WM_MOUSEMOVE, playerNamePoint);
    await postMouse(page, WM_LBUTTONDOWN, playerNamePoint);
    const playerNameFocused = await waitForCondition(
      page,
      "skirmish player-name focus",
      (clientState) => clientState.input?.focusWindow?.id === playerNameEntry.id &&
        clientState.skirmishMenu?.imeAttached === true,
      30);
    await postMouse(page, WM_LBUTTONUP, playerNamePoint);
    await runFrames(page, 2, "skirmish player-name release");

    const playerNameBefore = playerNameFocused.frame.clientState.skirmishMenu.playerNameText;
    if (expectTouchControlsProbe) {
      await page.waitForFunction((point) =>
        window.CnCPort.state.touchUi?.entries?.some((entry) =>
          point.x >= entry.rect.x && point.x < entry.rect.x + entry.rect.width
            && point.y >= entry.rect.y && point.y < entry.rect.y + entry.rect.height),
      playerNamePoint, { timeout: 5000 });
      await tapTouchPoint(page, playerNamePoint, 541);
      try {
        await page.waitForFunction(() => document.activeElement?.id === "touchTextInput",
          null, { timeout: 5000 });
      } catch (error) {
        const diagnostics = await page.evaluate(() => {
          const canvas = document.querySelector("#viewport");
          const rect = canvas.getBoundingClientRect();
          return {
            activeElement: document.activeElement?.id ?? null,
            touchControls: window.CnCPort.getTouchControlsState?.(),
            touchUi: window.CnCPort.state.touchUi,
            engineDisplaySize: window.CnCPort.state.engineDisplaySize,
            canvasRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        });
        expect(false, "tapping the engine entry did not open the native text proxy", {
          error: error?.message ?? String(error),
          diagnostics,
        });
      }
      await page.locator("#touchTextInput").evaluate((input) => {
        input.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: "zxq",
          inputType: "insertText",
        }));
      });
    } else {
      await page.locator("#viewport").focus();
      await page.keyboard.type("zxq");
    }
    await page.waitForTimeout(50);
    const playerNameTyped = await runFrames(page, 4, "skirmish player-name typing");
    expect(playerNameTyped.frame?.clientState?.skirmishMenu?.playerNameText === `${playerNameBefore}zxq`,
      "printable text did not mutate the real skirmish player-name gadget",
      playerNameTyped.frame?.clientState?.skirmishMenu);

    if (expectTouchControlsProbe) {
      await page.locator("#touchTextInput").evaluate((input) => {
        input.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward",
        }));
      });
    } else {
      await page.keyboard.press("Backspace");
    }
    await page.waitForTimeout(50);
    const playerNameBackspaced = await runFrames(page, 4, "skirmish player-name backspace");
    expect(playerNameBackspaced.frame?.clientState?.skirmishMenu?.playerNameText === `${playerNameBefore}zx`,
      "Backspace did not mutate the real skirmish player-name gadget",
      playerNameBackspaced.frame?.clientState?.skirmishMenu);

    await page.locator(expectTouchControlsProbe ? "#touchTextInput" : "#viewport").evaluate((target) => {
      target.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      target.dispatchEvent(new CompositionEvent("compositionupdate", { data: "r" }));
      target.dispatchEvent(new CompositionEvent("compositionend", { data: "r" }));
    });
    await page.waitForTimeout(50);
    const playerNameComposed = await runFrames(page, 4, "skirmish player-name composition");
    expect(playerNameComposed.frame?.clientState?.skirmishMenu?.playerNameText === `${playerNameBefore}zxr`,
      "composition text did not mutate the real skirmish player-name gadget",
      playerNameComposed.frame?.clientState?.skirmishMenu);
    await page.locator("#viewport").screenshot({ path: textEntryScreenshotPath });
    if (expectTouchControlsProbe) {
      await page.locator("[data-touch-text-done]").click();
    }

    let skirmishMapSet = null;
    if (requestedSkirmishMap) {
      console.error(`[skirmish-start] set skirmish map ${requestedSkirmishMap}`);
      skirmishMapSet = await rpc(page, "realEngineSetSkirmishMap", {
        map: requestedSkirmishMap,
      });
      expect(skirmishMapSet?.ok === true
          && skirmishMapSet.result?.applied,
        "requested skirmish map was not applied", skirmishMapSet);
      await runSummary(page, 1, "skirmish map apply settle");
    }

    // Optional: force the local player's faction/general (e.g.
    // FactionAmericaSuperWeaponGeneral) so a specific insignia decal is placed.
    let localTemplateSet = null;
    const requestedLocalTemplate = String(process.env.SKIRMISH_START_LOCAL_TEMPLATE ?? "").trim()
      || (expectTouchControlsProbe ? "FactionAmerica" : "");
    if (requestedLocalTemplate) {
      console.error(`[skirmish-start] set local template ${requestedLocalTemplate}`);
      localTemplateSet = await rpc(page, "realEngineSetSkirmishLocalTemplate", {
        template: requestedLocalTemplate,
      });
      console.error("[skirmish-start] localTemplateSet:", JSON.stringify(localTemplateSet));
      await runSummary(page, 1, "skirmish local template apply settle");
    }

    console.error("[skirmish-start] click start");
    const musicBeforeStart = expectMenuMusicStop ? await streamRuntime(page) : null;
    const preSkirmishMusicHandles = expectMenuMusicStop
      ? Array.from(new Set([
          ...menuMusic.handles,
          ...activeStreamHandles(musicBeforeStart),
        ])).sort((left, right) => left - right)
      : [];
    const skirmishStartClick = await clickButton(
      page,
      skirmishMenu.buttonStart,
      skirmishMenu.underButtonStartCenter,
      "skirmish start",
      null);
    const loadingGameplay = compactGameplay(skirmishStartClick.settled.frame);
    const loadingWindows =
      skirmishStartClick.settled.frame?.clientState?.loadScreen?.multiplayer ?? null;
    expect(loadingGameplay.gameMode === GAME_SKIRMISH &&
        loadingGameplay.loadingMap === true &&
        loadingWindows?.mapPreview?.found === true &&
        loadingWindows?.progressLocal?.found === true,
      "skirmish start did not present the multiplayer loading screen before loading the map", {
        loadingGameplay,
        loadingWindows,
        lastGameLogicStep: skirmishStartClick.settled.lastGameLogicStep,
      });
    expect((loadingWindows.mapPreview.status & WIN_STATUS_IMAGE) !== 0 &&
        loadingWindows.mapPreview.enabledImage0?.present === true &&
        loadingWindows.mapPreview.enabledImage0?.name !== "UnknownMap" &&
        Boolean(loadingWindows.mapPreview.enabledImage0?.filename),
      "skirmish loading screen did not bind the selected map preview image",
      loadingWindows.mapPreview);
    expect((loadingWindows.localGeneralPortrait?.status & WIN_STATUS_IMAGE) !== 0 &&
        loadingWindows.localGeneralPortrait?.enabledImage0?.present === true &&
        Boolean(loadingWindows.localGeneralPortrait?.enabledImage0?.name) &&
        Boolean(loadingWindows.localGeneralPortrait?.enabledImage0?.filename),
      "skirmish loading screen did not bind the local player faction portrait",
      loadingWindows.localGeneralPortrait);
    await page.locator("#viewport").screenshot({ path: loadingScreenshotPath });
    const loadingRenderProbe = await sampleViewportGrid(page);
    expect(loadingRenderProbe.ok === true &&
        loadingRenderProbe.visibleSampleCount > 0 &&
        loadingRenderProbe.uniqueColorCount > 1,
      "skirmish loading screen canvas did not expose visible non-black pixel variance",
      loadingRenderProbe);

    console.error("[skirmish-start] wait for active match");
    let active;
    try {
      active = await waitForSkirmishMatch(page);
    } catch (error) {
      const ctx = await page.evaluate(() => window.__lastBadJsonContext ?? null).catch(() => null);
      console.error("WAIT FAILED; badJsonContext:", JSON.stringify(ctx));
      throw error;
    }
    let postActive = null;
    let enemyStartAssets = null;
    let enemyAiActivity = null;
    let musicTransition = null;
    if (expectMenuMusicStop) {
      console.error("[skirmish-start] wait for pre-skirmish music handles to close");
      const stopped = await waitForHandlesClosed(
        page,
        preSkirmishMusicHandles,
        "skirmish music transition",
        musicStopMaxFrames);
      musicTransition = {
        audioSetup,
        menuMusic: {
          handles: menuMusic.handles,
          runtime: menuMusic.runtime,
          framesAdvanced: menuMusic.framesAdvanced,
          samples: menuMusic.samples.slice(-16),
        },
        preSkirmishHandles: preSkirmishMusicHandles,
        beforeStart: musicBeforeStart,
        afterActive: {
          framesAdvanced: stopped.framesAdvanced,
          runtime: stopped.runtime,
          samples: stopped.samples.slice(-16),
        },
      };
    }
    if (postActiveFrames > 0) {
      console.error(`[skirmish-start] run ${postActiveFrames} post-active frames`);
      postActive = await runPostActiveFrames(page, postActiveFrames, postActiveFrameChunk);
      if (expectPostActiveSurvival) {
        const gameplay = postActive.result?.frame?.gameplay;
        expect(gameplay?.gameMode === GAME_SKIRMISH &&
            gameplay?.inGame === true &&
            gameplay?.loadingMap === false &&
            gameplay?.inputEnabled === true &&
            Number(gameplay?.objectCount ?? 0) > 0 &&
            Number(gameplay?.drawableCount ?? 0) > 0 &&
            Number(gameplay?.renderedObjectCount ?? 0) > 0,
          "skirmish did not survive post-active frames", {
            postActiveFrames,
            samples: postActive.samples.slice(-12),
          });
      }
    }
    if (expectEnemyStartAssets) {
      enemyStartAssets = summarizeEnemyStartAssets(compactGameplay(active.result.frame));
      expect(enemyStartAssets.ready === true,
        "enemy skirmish AI did not receive starting assets", enemyStartAssets);
    }
    if (expectEnemyAiActivity) {
      enemyAiActivity = summarizeEnemyAiActivity(compactGameplay(active.result.frame), postActive);
      expect(enemyAiActivity.enemyAiCount > 0,
        "skirmish did not expose an enemy skirmish AI player", enemyAiActivity);
      expect(enemyAiActivity.activityDetected === true,
        "enemy skirmish AI did not produce activity during post-active frames", enemyAiActivity);
    }
    let escMenuResume = null;
    if (expectEscMenuResume) {
      console.error("[skirmish-start] verify ESC quit menu Resume button");
      escMenuResume = await driveEscMenuResume(page);
    }
    let rallyProbe = null;
    if (process.env.SKIRMISH_START_RALLY_PROBE === "1") {
      rallyProbe = await driveRallyPointProbe(page);
      console.error("[skirmish-start] rallyProbe:", JSON.stringify(rallyProbe));
    }
    let treeProbe = null;
    if (process.env.SKIRMISH_START_TREE_PROBE === "1") {
      treeProbe = await driveTreeDiffuseProbe(page);
      console.error("[skirmish-start] treeProbe:", JSON.stringify(treeProbe));
    }
    let decalProbe = null;
    if (process.env.SKIRMISH_START_DECAL_PROBE === "1") {
      decalProbe = await driveDecalProbe(page);
      console.error("[skirmish-start] decalProbe:", JSON.stringify(decalProbe));
    }
    let scorchProbe = null;
    if (expectScorchProbe) {
      scorchProbe = await driveScorchProbe(page);
      console.error("[skirmish-start] scorchProbe:", JSON.stringify(scorchProbe));
    }
    let particleVisibilityProbe = null;
    if (expectParticleVisibilityProbe) {
      particleVisibilityProbe = await driveParticleVisibilityProbe(page);
      console.error("[skirmish-start] particleVisibilityProbe:",
        JSON.stringify(particleVisibilityProbe));
    }
    const touchControlsProbe = expectTouchControlsProbe
      ? await driveTouchControlsProbe(page)
      : null;
    await page.locator("#viewport").screenshot({ path: screenshotPath });
    const renderProbe = await sampleViewportGrid(page);
    expect(renderProbe.ok === true,
      "active skirmish canvas pixels could not be sampled", renderProbe);
    const visibleSamples = Object.values(renderProbe.pixels ?? {}).filter((pixel) =>
      pixelHasVisibleColor(pixel));
    expect(visibleSamples.length > 0 && renderProbe.uniqueColorCount > 1,
      "active skirmish canvas did not expose visible non-black pixel variance", renderProbe);

    let lightPulseProbe = null;
    if (expectLightPulseProbe) {
      const drawables = await rpc(page, "queryDrawables");
      const target = drawables?.result?.drawables?.find((drawable) =>
        drawable.localOwned && drawable.onScreen && drawable.worldPos && drawable.screenPos);
      expect(Boolean(target), "light-pulse probe could not find a local on-screen drawable",
        drawables?.result ?? drawables);
      const baseline = await captureLightPulseFrame(
        page,
        "light-pulse baseline",
        target.screenPos,
        resolve(screenshotsRoot, "light-pulse-before.png"));
      const targetInfo = {
        id: target.id,
        template: target.template,
        worldPos: target.worldPos,
        screenPos: target.screenPos,
      };
      const trigger = await rpc(page, "realEngineDoFX", {
        // This shipped muzzle FX is intentionally almost light-only: unlike
        // an explosion it leaves no scorch and has no persistent particles,
        // so the final canvas can return to the same baseline.
        name: "WeaponFX_RangerAdvancedCombatRifleFire",
        useViewPosition: false,
        clampToTerrain: true,
        x: target.worldPos.x,
        y: target.worldPos.y,
        z: target.worldPos.z,
      });
      expect(trigger?.ok === true, "light-pulse probe could not trigger original FX",
        trigger?.result ?? trigger);
      const peak = await captureLightPulseFrame(
        page,
        "light-pulse peak",
        target.screenPos,
        resolve(screenshotsRoot, "light-pulse-peak.png"));
      await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
      await runFrames(page, 4, "light-pulse decay to midpoint");
      const midpoint = await captureLightPulseFrame(
        page,
        "light-pulse midpoint",
        target.screenPos,
        resolve(screenshotsRoot, "light-pulse-midpoint.png"));
      await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
      await runFrames(page, 12, "light-pulse decay to baseline");
      const after = await captureLightPulseFrame(
        page,
        "light-pulse after decay",
        target.screenPos,
        resolve(screenshotsRoot, "light-pulse-after.png"));
      const peakTerrain = compareLightProbeTerrain(baseline, peak, target.worldPos);
      const midpointTerrain = compareLightProbeTerrain(baseline, midpoint, target.worldPos);
      const afterTerrain = compareLightProbeTerrain(baseline, after, target.worldPos);
      const canvasDelta = (sample) => ({
        rgb: sample.canvas.mean.map((value, index) =>
          Number((value - baseline.canvas.mean[index]).toFixed(3))),
        luminance: Number((sample.canvas.meanLuminance - baseline.canvas.meanLuminance).toFixed(3)),
      });
      lightPulseProbe = {
        target: targetInfo,
        trigger: trigger.result,
        baseline,
        peak,
        midpoint,
        after,
        comparisons: {
          peakTerrain,
          midpointTerrain,
          afterTerrain,
          peakCanvas: canvasDelta(peak),
          midpointCanvas: canvasDelta(midpoint),
          afterCanvas: canvasDelta(after),
        },
      };
      await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
      expect(peak.pointLightDrawCount > 0,
        "original FX LightPulse did not reach a real scene draw", lightPulseProbe);
      expect(peakTerrain.targetBuffers.some((buffer) => buffer.changed),
        "original FX LightPulse did not change terrain diffuse vertices at its position",
        lightPulseProbe);
      expect(afterTerrain.targetBuffers.length > 0
          && afterTerrain.targetBuffers.every((buffer) => !buffer.changed),
        "terrain diffuse vertices did not return to baseline after LightPulse decay",
        lightPulseProbe);
      expect(lightPulseProbe.comparisons.peakCanvas.luminance > 1
          && lightPulseProbe.comparisons.peakCanvas.rgb.some((component) => component > 1),
        "LightPulse did not produce a localized canvas luminance/color change",
        lightPulseProbe);
      expect(Math.abs(lightPulseProbe.comparisons.afterCanvas.luminance) <= 1,
        "localized canvas luminance did not return to baseline after LightPulse decay",
        lightPulseProbe);
    }

    // ADD-ONLY HUD geometry probe: one full realEngineFrame to capture the
    // per-window control-bar geometry (drawFunc/systemFunc/x/y/w/h/hidden) so
    // the bottom-strip pixels can be mapped to specific HUD windows. Read-only.
    const shroudDiagnostics = locateNested(active.result.frame, ["shroud"]) ?? null;
    const postActiveShroudDiagnostics =
      postActive == null ? null : locateNested(postActive.result?.frame, ["shroud"]) ?? null;
    let controlBarWindows = null;
    let controlBarWindowFull = null;
    let fullFrameShroudDiagnostics = null;
    let textureDiagnostics = null;
    let uiDrawCaptures = null;
    let d3d8SceneDrawHistory = null;
    let lastD3D8Clear = null;
    let badJsonContext = null;
    try {
      if (captureD3D8History) {
        await page.evaluate(() => window.__cncSetD3D8SceneDrawHistoryLimit?.(8192));
        await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
      }
      const full = await runFrames(page, 1, "hud geometry probe");
      controlBarWindowFull = locateNested(full.frame, ["controlBarWindows"]) ?? null;
      controlBarWindows = controlBarWindowFull;
      fullFrameShroudDiagnostics = locateNested(full.frame, ["shroud"]) ?? null;
      // ADD-ONLY: also surface the frame's texture diagnostics so a background
      // that resolves to a valid Image* but still draws black can be traced to
      // a missing/failed texture upload. Read-only.
      textureDiagnostics = locateNested(full.frame, ["textureDiagnostics"]) ?? null;
      // ADD-ONLY Stage-1: the per-draw render-state capture for the command-bar
      // atlas (1024x256) background draws vs small UI icon draws, collected by
      // bridge.js during the frame.
      uiDrawCaptures = full.state?.graphics?.uiDrawCaptures ?? null;
      d3d8SceneDrawHistory = captureD3D8History
        ? (full.state?.graphics?.d3d8SceneDrawHistory ?? null)
        : null;
      lastD3D8Clear = captureD3D8History
        ? (full.state?.graphics?.lastD3D8Clear ?? null)
        : null;
      badJsonContext = await page.evaluate(() => window.__lastBadJsonContext ?? null).catch(() => null);
    } catch (error) {
      controlBarWindows = { error: error?.message ?? String(error) };
    }
    const mapCache = await rpc(page, "mapCacheProbe");
    // ADD-ONLY Stage-1: full live D3D8 texture inventory, to determine whether
    // the command-bar atlas (1024x256 SN/SA/SUCommandBar.tga) was ever uploaded.
    let d3d8TextureInventory = null;
    try {
      const textureSizes = new Set([
        "1024x256",
        "128x128",
        "256x256",
        "256x512",
        "512x256",
        "512x512",
      ]);
      for (const shroud of [shroudDiagnostics, postActiveShroudDiagnostics, fullFrameShroudDiagnostics]) {
        const width = Number(shroud?.visual?.textureWidth ?? 0);
        const height = Number(shroud?.visual?.textureHeight ?? 0);
        if (width > 0 && height > 0) {
          textureSizes.add(`${width}x${height}`);
        }
      }
      d3d8TextureInventory = await rpc(page, "d3d8TextureInventory", {
        sizes: Array.from(textureSizes),
        sampleLimit: 128,
      });
    } catch (error) {
      d3d8TextureInventory = { error: error?.message ?? String(error) };
    }
    const replayRoundTrip = expectReplayRoundTrip ? await driveReplayRoundTrip(page) : null;
    const result = {
      ok: true,
      source: "skirmish-start-smoke",
      distDir,
      activeMod,
      modSet: mount.modSet ?? null,
      engineCommandLine: init.frontier?.commandLine ?? null,
      engineUserDataHome: init.frontier?.userDataHome ?? null,
      archiveCount: mount.archiveSet.archiveCount,
      requestedMap: requestedSkirmishMap || null,
      selectedMap: mapCache?.probe?.skirmishGameInfo?.map
        ?? mapCache?.probe?.gameInfo?.map
        ?? mapCache?.probe?.firstOfficialMultiplayerMap
        ?? null,
      skirmishMapSet: skirmishMapSet?.result ?? null,
      loadingScreen: {
        gameplay: loadingGameplay,
        windows: loadingWindows,
        renderProbe: loadingRenderProbe,
        screenshot: loadingScreenshotPath,
      },
      firstOfficialMultiplayerMetadata: mapCache?.probe?.firstOfficialMultiplayerMetadata ?? null,
      officialMultiplayerCount: mapCache?.probe?.officialMultiplayerCount ?? null,
      officialMultiplayerMaps: mapCache?.probe?.officialMultiplayerMaps ?? [],
      mapPreviewDiagnostic: mapCache?.probe?.mapPreviewDiagnostic ?? null,
      framesAdvancedAfterStart: active.framesAdvanced,
      finalGameplay: compactGameplay(active.result.frame),
      musicTransition,
      shroudDiagnostics,
      postActive: postActive == null ? null : {
        framesAdvanced: postActive.framesAdvanced,
        finalGameplay: compactGameplay(postActive.result?.frame),
        shroudDiagnostics: postActiveShroudDiagnostics,
        samples: postActive.samples,
      },
      enemyStartAssets,
      enemyAiActivity,
      escMenuResume,
      rallyProbe,
      scorchProbe,
      particleVisibilityProbe,
      touchControlsProbe,
      lightPulseProbe,
      replayRoundTrip,
      renderProbe,
      // ADD-ONLY HUD diagnostics: full control-bar / shell / startNewGame state
      // from the final active-match frame (read-only; does not gate anything).
      hudDiagnostics: (() => {
        // ADD-ONLY: walk the final frame to find the control-bar / shell /
        // startNewGame state regardless of the exact nesting used by the RPC.
        const f = active.result.frame ?? {};
        const locate = (obj, keys, depth = 0) => {
          if (!obj || typeof obj !== "object" || depth > 6) return undefined;
          for (const k of keys) {
            if (obj[k] !== undefined) return obj[k];
          }
          for (const v of Object.values(obj)) {
            if (v && typeof v === "object") {
              const found = locate(v, keys, depth + 1);
              if (found !== undefined) return found;
            }
          }
          return undefined;
        };
        const cb = locate(f, ["controlBar"]) ?? {};
        const summary = locate(f, ["summary"]) ?? {};
        const shell = locate(f, ["shell"]) ?? {};
        return {
          controlBarFound: cb.controlBarFound ?? summary.controlBarFound ?? null,
          controlBarHidden: cb.controlBarHidden ?? summary.controlBarHidden ?? null,
          controlBarManagerHidden: cb.controlBarManagerHidden ?? summary.controlBarManagerHidden ?? null,
          controlBarClickable: cb.controlBarClickable ?? summary.controlBarClickable ?? null,
          shellTopHidden: shell.topHidden ?? null,
          shellTopFilename: shell.topFilename ?? null,
          startNewGameShell: shell.startNewGameShell ?? null,
          rawControlBar: cb,
          rawShellKeys: Object.keys(shell),
          controlBarWindows,
          textureDiagnostics,
          uiDrawCaptures,
          d3d8SceneDrawHistory,
          lastD3D8Clear,
          fullFrameShroudDiagnostics,
          d3d8TextureInventory: d3d8TextureInventory?.inventory ?? null,
          d3d8TextureLiveCount: d3d8TextureInventory?.liveCount ?? null,
          badJsonContext,
        };
      })(),
      samples: active.samples.slice(-12),
      screenshot: screenshotPath,
    };
    await writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
    if (browserProfileDir) {
      await rm(browserProfileDir, { recursive: true, force: true });
    }
  }
}

await main();
