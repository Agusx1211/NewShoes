#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const { chromium } = await loadPlaywrightCore();

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outDir = resolve(
  process.env.SKIRMISH_STRUCTURE_CAPTURE_DIR ??
    resolve(wasmRoot, "artifacts/skirmish-structure"));
const screenshotPath = resolve(outDir, "enemy-structure.png");
const outputPath = resolve(outDir, "enemy-structure-textures.json");

const GAME_SKIRMISH = 2;
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;

const maxStartFrames = parsePositiveInt("SKIRMISH_STRUCTURE_MAX_FRAMES", 4200);
const frameChunk = parsePositiveInt("SKIRMISH_STRUCTURE_FRAME_CHUNK", 30);
const postActiveFrames = parsePositiveInt("SKIRMISH_STRUCTURE_POST_ACTIVE_FRAMES", 0);
const postActiveFrameChunk = parsePositiveInt(
  "SKIRMISH_STRUCTURE_POST_ACTIVE_CHUNK",
  frameChunk);
const drawHistoryLimit = parsePositiveInt("SKIRMISH_STRUCTURE_DRAW_HISTORY_LIMIT", 8192);
const requestedSkirmishMap = String(process.env.SKIRMISH_STRUCTURE_MAP ?? "").trim();
const revealLocalMap = process.env.SKIRMISH_STRUCTURE_REVEAL_MAP !== "0";
const distDir = parseDistDir();
let cleanupTimedOut = false;

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
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

async function loadPlaywrightCore() {
  try {
    return await import("playwright-core");
  } catch (error) {
    const fallback = process.env.PLAYWRIGHT_CORE_MODULE ??
      resolve(homedir(), "cnc-verify/node_modules/playwright-core/index.js");
    try {
      return await import(pathToFileURL(fallback).href);
    } catch {
      throw error;
    }
  }
}

function parsePositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseDistDir() {
  const value = process.env.SKIRMISH_STRUCTURE_DIST ?? "dist-release";
  if (!/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value)) {
    throw new Error(`Invalid SKIRMISH_STRUCTURE_DIST: ${value}`);
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
      buttonSkirmish: clientState.mainMenu?.buttonSkirmish ?? null,
    },
    skirmishMenu: {
      parent: clientState.skirmishMenu?.parent ?? null,
      buttonStart: clientState.skirmishMenu?.buttonStart ?? null,
    },
  };
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
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
    await rpc(page, "realEngineFrame", { frames }),
    label);
}

async function runSummary(page, frames, label = "real engine summary") {
  return assertFrameResult(
    await rpc(page, "realEngineFrameSummary", { frames }),
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

async function waitForSkirmishMatch(page) {
  const samples = [];
  let framesAdvanced = 0;
  while (framesAdvanced < maxStartFrames) {
    const frames = Math.min(frameChunk, maxStartFrames - framesAdvanced);
    const result = await runSummary(page, frames, "skirmish match wait");
    framesAdvanced += frames;
    const gameplay = result.frame?.gameplay;
    const sample = compactGameplay(result.frame);
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
    last = await runSummary(page, frames, "skirmish post-active wait");
    framesAdvanced += frames;
    samples.push(compactGameplay(last.frame));
  }
  return { result: last, framesAdvanced, samples };
}

function chooseEnemyStructure(query) {
  const all = query?.result?.allDrawables ?? [];
  const candidates = all.filter((drawable) =>
    drawable?.hostileToLocal === true &&
    drawable?.structure === true &&
    drawable?.worldPos != null &&
    drawable?.effectivelyDead !== true &&
    Number(drawable?.body?.health ?? 1) > 0 &&
    (!revealLocalMap || Number(drawable?.shroudStatus ?? 99) < 3));
  const score = (drawable) => {
    const name = String(drawable?.name ?? "");
    if (/CommandCenter/i.test(name)) return 0;
    if (/SupplyCenter|WarFactory|Barracks|PowerPlant/i.test(name)) return 1;
    return 2;
  };
  return candidates
    .map((drawable, order) => ({ drawable, order, score: score(drawable) }))
    .sort((left, right) => left.score - right.score || left.order - right.order);
}

async function frameEnemyStructure(page) {
  const initial = await rpc(page, "queryDrawables");
  expect(initial?.ok === true && initial?.result?.ready === true,
    "queryDrawables failed before enemy-structure framing", initial);
  const candidates = chooseEnemyStructure(initial);
  expect(candidates.length > 0, "no hostile structures were available to frame", {
    stats: initial.result?.stats ?? null,
    hostile: (initial.result?.allDrawables ?? [])
      .filter((drawable) => drawable?.hostileToLocal === true)
      .slice(0, 24),
  });

  const attempts = [];
  for (const { drawable } of candidates.slice(0, 12)) {
    const lookAt = await rpc(page, "tacticalViewLookAt", { worldPos: drawable.worldPos });
    expect(lookAt?.ok === true, "tacticalViewLookAt failed for enemy structure", {
      target: compactDrawable(drawable),
      lookAt,
    });
    await runSummary(page, 12, "enemy structure camera settle");
    const framed = await rpc(page, "queryDrawables");
    expect(framed?.ok === true && framed?.result?.ready === true,
      "queryDrawables failed after enemy-structure framing", framed);
    const visible = (framed.result?.enemyDrawables ?? [])
      .filter((candidate) =>
        candidate?.structure === true &&
        candidate?.hostileToLocal === true &&
        candidate?.onScreen === true &&
        candidate?.hidden !== true &&
        (!revealLocalMap || Number(candidate?.shroudStatus ?? 99) < 3));
    const matchingVisible = visible.find((candidate) => candidate.id === drawable.id) ?? null;
    const selected = matchingVisible ?? visible[0] ?? null;
    attempts.push({
      requested: compactDrawable(drawable),
      lookAt: lookAt.result ?? null,
      visibleCount: visible.length,
      selected: selected == null ? null : compactDrawable(selected),
      stats: framed.result?.stats ?? null,
    });
    if (selected != null) {
      return { initial, framed, target: selected, attempts };
    }
  }

  expect(false, "no hostile structure became visible after camera framing", {
    attempts,
    initialStats: initial.result?.stats ?? null,
  });
}

function compactDrawable(drawable) {
  if (drawable == null) {
    return null;
  }
  return {
    id: drawable.id,
    name: drawable.name,
    displayName: drawable.displayName,
    playerIndex: drawable.playerIndex,
    localOwned: drawable.localOwned,
    hostileToLocal: drawable.hostileToLocal,
    relationshipToLocalName: drawable.relationshipToLocalName,
    structure: drawable.structure,
    hidden: drawable.hidden,
    shroudStatus: drawable.shroudStatus,
    body: drawable.body ?? null,
    worldPos: drawable.worldPos,
    onScreen: drawable.onScreen,
    screenPos: drawable.screenPos,
  };
}

function textureLabelName(texture) {
  return String(texture?.label?.name ?? texture?.label?.path ?? "").toLowerCase();
}

function textureSamplePixels(texture) {
  const pixels = [];
  for (const pixel of Object.values(texture?.samplePixels ?? {})) {
    if (Array.isArray(pixel)) {
      pixels.push(pixel);
    }
  }
  for (const sample of texture?.sampleVertexPixels ?? []) {
    if (Array.isArray(sample?.pixel)) {
      pixels.push(sample.pixel);
    }
  }
  return pixels;
}

function pixelLooksWhite(pixel) {
  return Array.isArray(pixel) &&
    pixel[0] >= 220 &&
    pixel[1] >= 220 &&
    pixel[2] >= 220 &&
    pixel[3] >= 200;
}

function pixelLooksBlack(pixel) {
  return Array.isArray(pixel) &&
    pixel[0] <= 8 &&
    pixel[1] <= 8 &&
    pixel[2] <= 8 &&
    pixel[3] >= 200;
}

function pixelHasVisibleColor(pixel) {
  return Array.isArray(pixel) &&
    pixel[3] > 0 &&
    Math.max(pixel[0], pixel[1], pixel[2]) > 8;
}

function isGeneratedHouseColorTexture(texture) {
  const name = textureLabelName(texture);
  return /^#-?\d+#zh/.test(name);
}

function compactDraw(draw, labelById) {
  const texture0Id = Number(draw.texture0?.id ?? 0);
  const texture1Id = Number(draw.texture1?.id ?? 0);
  return {
    seq: draw.drawSequence,
    producer: draw.producer ?? null,
    primitiveType: draw.primitiveType,
    fvf: draw.vertexShaderFvf,
    stride: draw.vertexStride,
    vertexCount: draw.vertexCount,
    indexCount: draw.indexCount,
    pretransformedPosition: draw.pretransformedPosition,
    renderState: draw.renderState,
    appliedRenderState: draw.appliedRenderState,
    texture0: { ...draw.texture0, label: labelById.get(texture0Id) ?? null },
    texture1: { ...draw.texture1, label: labelById.get(texture1Id) ?? null },
    vertexSummary: draw.vertexSummary,
    preDrawCenterPixel: draw.preDrawCenterPixel,
    centerPixel: draw.centerPixel,
  };
}

function topTextureNames(history) {
  const counts = new Map();
  for (const draw of history) {
    for (const texture of [draw.texture0, draw.texture1]) {
      const textureId = Number(texture?.id ?? 0);
      if (textureId === 0) {
        continue;
      }
      const label = texture?.label ?? {};
      const name = label.name || label.path || `(id ${textureId})`;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 32)
    .map(([name, count]) => ({ name, count }));
}

function analyzeGeneratedHouseColorTextures(history) {
  const records = [];
  for (const draw of history) {
    if (draw.pretransformedPosition === true) {
      continue;
    }
    for (const texture of [draw.texture0, draw.texture1]) {
      if (isGeneratedHouseColorTexture(texture)) {
        records.push({ draw, texture, name: textureLabelName(texture) });
      }
    }
  }

  const notReady = [];
  const notSampled = [];
  const missingUploads = [];
  const whiteOnly = [];
  const unique = new Map();

  for (const record of records) {
    const { draw, texture, name } = record;
    if (!unique.has(name)) {
      unique.set(name, {
        name,
        width: texture.width ?? null,
        height: texture.height ?? null,
        storage: texture.storage ?? null,
        drawCount: 0,
      });
    }
    unique.get(name).drawCount += 1;

    if (texture.ready !== true) {
      notReady.push({ seq: draw.seq, name });
    }
    if (texture.sampled !== true) {
      notSampled.push({ seq: draw.seq, name });
    }
    if (Number(texture.uploads ?? 0) < 1) {
      missingUploads.push({ seq: draw.seq, name, uploads: texture.uploads ?? null });
    }
    const visiblePixels = textureSamplePixels(texture).filter((pixel) =>
      pixelHasVisibleColor(pixel) && !pixelLooksBlack(pixel));
    const allVisibleSamplesWhite = visiblePixels.length > 0 &&
      visiblePixels.every((pixel) => pixelLooksWhite(pixel));
    if (allVisibleSamplesWhite) {
      whiteOnly.push({ seq: draw.seq, name });
    }
  }

  const errors = [];
  if (notReady.length) {
    errors.push(`generated house-color textures not ready at seq ${notReady.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (notSampled.length) {
    errors.push(`generated house-color textures not sampled at seq ${notSampled.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (missingUploads.length) {
    errors.push(`generated house-color textures missing uploads at seq ${missingUploads.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (whiteOnly.length) {
    errors.push(`generated house-color textures exposed only white/black samples at seq ${whiteOnly.slice(0, 8).map((item) => item.seq).join(",")}`);
  }

  return {
    ok: errors.length === 0,
    present: records.length > 0,
    errors,
    counts: {
      drawCount: records.length,
      uniqueTextureCount: unique.size,
      notReady: notReady.length,
      notSampled: notSampled.length,
      missingUploads: missingUploads.length,
      whiteOnly: whiteOnly.length,
    },
    textures: Array.from(unique.values()).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

async function sampleTargetPatch(page, target) {
  return page.evaluate((drawable) => {
    const canvas = document.querySelector("#viewport");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, error: "viewport canvas is missing" };
    }
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl == null) {
      return { ok: false, error: "viewport WebGL context is missing" };
    }
    const screenPos = drawable?.screenPos ?? null;
    if (screenPos == null || !Number.isFinite(screenPos.x) || !Number.isFinite(screenPos.y)) {
      return { ok: false, error: "target screen position is missing", screenPos };
    }
    const baseX = Math.round(screenPos.x);
    const baseY = Math.round(screenPos.y);
    const offsets = [
      [0, 0], [-32, 0], [32, 0], [0, -32], [0, 32],
      [-24, -24], [24, -24], [-24, 24], [24, 24],
      [0, -56], [-40, -40], [40, -40],
    ];
    const pixel = new Uint8Array(4);
    const samples = offsets.map(([dx, dy], index) => {
      const x = Math.max(0, Math.min(canvas.width - 1, baseX + dx));
      const y = Math.max(0, Math.min(canvas.height - 1, baseY + dy));
      gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const rgba = Array.from(pixel);
      const visible = rgba[3] > 0 && Math.max(rgba[0], rgba[1], rgba[2]) > 8;
      const white = rgba[0] >= 220 && rgba[1] >= 220 && rgba[2] >= 220 && rgba[3] >= 200;
      const black = rgba[0] <= 8 && rgba[1] <= 8 && rgba[2] <= 8 && rgba[3] >= 200;
      return { index, x, y, rgba, visible, white, black };
    });
    const visible = samples.filter((sample) => sample.visible);
    const nonWhiteVisible = visible.filter((sample) => !sample.white && !sample.black);
    return {
      ok: true,
      width: canvas.width,
      height: canvas.height,
      targetScreenPos: screenPos,
      sampleCount: samples.length,
      visibleCount: visible.length,
      nonWhiteVisibleCount: nonWhiteVisible.length,
      whiteVisibleCount: visible.filter((sample) => sample.white).length,
      samples,
    };
  }, compactDrawable(target));
}

function analyzeTargetPatch(patch) {
  const errors = [];
  if (patch?.ok !== true) {
    errors.push(patch?.error ?? "target patch sampling failed");
  }
  if (Number(patch?.visibleCount ?? 0) < 4) {
    errors.push(`expected at least 4 visible target patch samples, got ${patch?.visibleCount ?? 0}`);
  }
  if (Number(patch?.nonWhiteVisibleCount ?? 0) < 1) {
    errors.push("target patch did not expose any non-white visible samples");
  }
  if (Number(patch?.whiteVisibleCount ?? 0) > 0 &&
      Number(patch?.whiteVisibleCount ?? 0) === Number(patch?.visibleCount ?? 0)) {
    errors.push("target patch visible samples were all white");
  }
  return {
    ok: errors.length === 0,
    errors,
    counts: {
      visible: patch?.visibleCount ?? null,
      nonWhiteVisible: patch?.nonWhiteVisibleCount ?? null,
      whiteVisible: patch?.whiteVisibleCount ?? null,
    },
  };
}

async function queryRenderer(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const gl = canvas?.getContext("webgl2");
    const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
    return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
  });
}

async function runWithDeadline(label, timeoutMs, task) {
  let timeoutHandle = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((resolve) => {
        timeoutHandle = setTimeout(() => {
          console.error(`[skirmish-structure] ${label} timed out after ${timeoutMs}ms`);
          resolve(false);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    console.error(`[skirmish-structure] ${label} failed: ${error?.message ?? String(error)}`);
    return false;
  } finally {
    if (timeoutHandle != null) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function enterSkirmish(page, serverUrl) {
  console.error("[skirmish-structure] mounting archives");
  const mount = await rpc(page, "mountArchives", {
    path: "/assets/skirmish-structure",
    verifyEach: false,
    archives: buildArchives(serverUrl),
  });
  expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
    "failed to mount runtime archives", mount?.archiveSet ?? mount);

  console.error("[skirmish-structure] real init");
  const init = await rpc(page, "realEngineInit", {
    runDirectory: "/assets/skirmish-structure",
    shellMap: true,
  });
  expect(init?.ok === true && init?.aborted === false && init?.frontier?.initReturned === true,
    "real engine init failed", init?.frontier ?? init);

  let frame = await runFrames(page, 5, "initial menu frames");
  if (frame.frame?.clientState?.shell?.topIsMainMenu !== true) {
    frame = await waitForCondition(
      page,
      "main menu available",
      (clientState) => clientState.shell?.topIsMainMenu === true &&
        clientState.shell?.topHidden === false,
      120);
  }
  expect(frame.frame?.clientState?.mainMenu?.buttonSinglePlayer?.found === true,
    "main menu Single Player button geometry is unavailable",
    frame.frame?.clientState?.mainMenu?.buttonSinglePlayer);

  console.error("[skirmish-structure] reveal main menu");
  const revealed = await revealMainMenu(page);

  console.error("[skirmish-structure] click single player");
  const singlePlayerClick = await clickButton(
    page,
    revealed.frame.clientState.mainMenu.buttonSinglePlayer,
    revealed.frame.clientState.mainMenu.underButtonSinglePlayerCenter,
    "single-player");
  const singlePlayerMenu = singlePlayerClick.settled.frame?.clientState?.mainMenu;
  expect(singlePlayerMenu?.buttonSkirmish?.clickable === true,
    "single-player menu did not expose ButtonSkirmish", singlePlayerMenu);

  console.error("[skirmish-structure] click skirmish");
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

  let skirmishMapSet = null;
  if (requestedSkirmishMap) {
    console.error(`[skirmish-structure] set skirmish map ${requestedSkirmishMap}`);
    skirmishMapSet = await rpc(page, "realEngineSetSkirmishMap", {
      map: requestedSkirmishMap,
    });
    expect(skirmishMapSet?.ok === true && skirmishMapSet.result?.applied,
      "requested skirmish map was not applied", skirmishMapSet);
    await runSummary(page, 1, "skirmish map apply settle");
  }

  console.error("[skirmish-structure] click start");
  await clickButton(
    page,
    skirmishMenu.buttonStart,
    skirmishMenu.underButtonStartCenter,
    "skirmish start",
    null);

  console.error("[skirmish-structure] wait for active match");
  const active = await waitForSkirmishMatch(page);
  const postActive = postActiveFrames > 0
    ? await runPostActiveFrames(page, postActiveFrames, postActiveFrameChunk)
    : null;
  let reveal = null;
  if (revealLocalMap) {
    console.error("[skirmish-structure] reveal local map");
    reveal = await rpc(page, "revealLocalMap", { permanent: true });
    expect(reveal?.ok === true && reveal?.result?.ok === true,
      "revealLocalMap failed", reveal);
    await runSummary(page, 4, "reveal local map settle");
  }

  return { mount, init, skirmishMapSet, active, postActive, reveal };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot });
  let browser;
  try {
    const launchOptions = { headless: true };
    const executablePath = process.env.SKIRMISH_STRUCTURE_BROWSER_EXECUTABLE ??
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : process.env.CHROME_PATH);
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    if (process.env.SKIRMISH_STRUCTURE_BROWSER_ARGS) {
      launchOptions.args = process.env.SKIRMISH_STRUCTURE_BROWSER_ARGS.split(/\s+/).filter(Boolean);
    }

    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(300000);
    page.on("pageerror", (error) => {
      console.error(`[skirmish-structure] pageerror ${error.stack ?? error.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[skirmish-structure page] ${msg.text()}`);
      }
    });

    const harnessUrl = new URL("harness/index.html", server.url);
    harnessUrl.searchParams.set("dist", distDir);
    await page.goto(harnessUrl.href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
    const renderer = await queryRenderer(page);

    const skirmishSetup = await enterSkirmish(page, server.url);
    const framing = await frameEnemyStructure(page);

    await page.evaluate((limit) =>
      window.__cncSetD3D8SceneDrawHistoryLimit?.(limit), drawHistoryLimit);
    await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
    console.error(`[skirmish-structure] capture ${framing.target.name}#${framing.target.id}`);
    const full = await runSummary(page, 1, "enemy-structure texture capture");
    await page.locator("#viewport").screenshot({ path: screenshotPath });
    const patch = await sampleTargetPatch(page, framing.target);

    const labels = full.frame?.textureDiagnostics?.labels ?? [];
    const labelById = new Map(labels.map((label) => [Number(label.id), label]));
    const history = (full.state?.graphics?.d3d8SceneDrawHistory ?? [])
      .map((draw) => compactDraw(draw, labelById));
    const generatedHouseColor = analyzeGeneratedHouseColorTextures(history);
    const targetPatch = analyzeTargetPatch(patch);
    const ok = targetPatch.ok && generatedHouseColor.ok;
    const summary = {
      ok,
      source: "skirmish-structure-texture-capture",
      renderer,
      m4Metal: String(renderer ?? "").includes("Apple M4") &&
        String(renderer ?? "").includes("Metal"),
      distDir,
      archiveCount: skirmishSetup.mount.archiveSet.archiveCount,
      requestedMap: requestedSkirmishMap || null,
      revealLocalMap: skirmishSetup.reveal?.result ?? null,
      skirmishMapSet: skirmishSetup.skirmishMapSet?.result ?? null,
      framesAdvancedAfterStart: skirmishSetup.active.framesAdvanced,
      postActive: skirmishSetup.postActive == null ? null : {
        framesAdvanced: skirmishSetup.postActive.framesAdvanced,
        finalGameplay: compactGameplay(skirmishSetup.postActive.result?.frame),
        samples: skirmishSetup.postActive.samples.slice(-12),
      },
      target: compactDrawable(framing.target),
      framingAttempts: framing.attempts,
      screenshot: screenshotPath,
      targetPatch: patch,
      textureDiagnostics: {
        labelCount: labels.length,
      },
      drawHistory: {
        limit: drawHistoryLimit,
        length: history.length,
        seqRange: history.length ? [history[0].seq, history[history.length - 1].seq] : [],
        topTextures: topTextureNames(history),
      },
      assertions: {
        targetPatch,
        generatedHouseColor,
      },
      captures: {
        history,
      },
    };

    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: summary.ok,
      renderer,
      distDir,
      target: summary.target,
      screenshot: summary.screenshot,
      outputPath,
      assertions: summary.assertions,
      drawHistory: summary.drawHistory,
      targetPatch: summary.targetPatch,
    }, null, 2));
    if (!summary.ok) {
      const errors = [
        ...targetPatch.errors,
        ...generatedHouseColor.errors,
      ];
      throw new Error(`skirmish structure texture assertion failed: ${errors.join("; ")}`);
    }
  } finally {
    if (browser) {
      cleanupTimedOut = !(await runWithDeadline("browser.close", 5000, () => browser.close())) ||
        cleanupTimedOut;
    }
    cleanupTimedOut = !(await runWithDeadline("static server close", 5000, () => server.close())) ||
      cleanupTimedOut;
  }
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error(error?.stack ?? error?.message ?? String(error));
}
if (cleanupTimedOut) {
  process.exit(failed ? 1 : 0);
}
if (failed) {
  process.exitCode = 1;
}
