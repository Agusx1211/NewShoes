#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const executablePath = process.env.CNC_CHROMIUM ??
  process.env.REAL_FX_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
const { chromium } = await import(executablePath ? "playwright-core" : "playwright");
const fxName = process.env.REAL_FX_NAME ?? "WeaponFX_MOAB_Blast";
const maxFrames = Number(process.env.REAL_FX_FRAMES ?? 45);
const expectHeatDistortion = process.env.REAL_FX_EXPECT_HEAT === "1";
const heatParticleSystemName = process.env.REAL_HEAT_PARTICLE_SYSTEM ?? "MicrowaveEmitter";
const shaderTier = process.env.REAL_FX_SHADER_TIER ?? (expectHeatDistortion ? "ps11" : "ff");
const screenshotPath = resolve(
  screenshotDir,
  expectHeatDistortion ? "real-heat-distortion-smoke.png" : "real-fx-render-smoke.png",
);

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
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Shaders.big", sourceName: "Shaders.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

function expect(condition, message, payload) {
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

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, args]) => window.CnCPort.rpc(name, args), [command, payload]);
}

function labelMap(frame) {
  return new Map((frame?.textureDiagnostics?.labels ?? [])
    .map((label) => [Number(label.id), label]));
}

function textureLabel(draw, labels) {
  const texture0Id = Number(draw.texture0?.id ?? 0);
  const texture1Id = Number(draw.texture1?.id ?? 0);
  return labels.get(texture0Id)?.name ||
    labels.get(texture0Id)?.path ||
    labels.get(texture1Id)?.name ||
    labels.get(texture1Id)?.path ||
    "";
}

function effectDraws(result) {
  const labels = labelMap(result?.frame);
  return (result?.state?.graphics?.d3d8SceneDrawHistory ?? [])
    .map((draw) => ({ seq: draw.drawSequence, texture: textureLabel(draw, labels) }))
    .filter((draw) => /^(ex|fx)|expl|blast|shock|smoke|fire/i.test(draw.texture));
}

async function sampleTacticalView(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!(canvas instanceof HTMLCanvasElement) || !context) {
      return { ok: false, error: "viewport WebGL context unavailable" };
    }
    const xs = [0.18, 0.30, 0.42, 0.54, 0.66, 0.78];
    const ys = [0.14, 0.28, 0.42, 0.56, 0.70, 0.84];
    const pixel = new Uint8Array(4);
    const samples = [];
    for (const xRatio of xs) {
      for (const yRatio of ys) {
        context.readPixels(
          Math.min(canvas.width - 1, Math.floor(canvas.width * xRatio)),
          Math.min(canvas.height - 1, Math.floor(canvas.height * yRatio)),
          1,
          1,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixel,
        );
        samples.push(Array.from(pixel));
      }
    }
    const luminances = samples.map((rgba) =>
      (rgba[0] * 0.2126) + (rgba[1] * 0.7152) + (rgba[2] * 0.0722));
    return {
      ok: true,
      sampleCount: samples.length,
      uniqueColorCount: new Set(samples.map((rgba) => rgba.join(","))).size,
      minimumLuminance: Math.min(...luminances),
      maximumLuminance: Math.max(...luminances),
      meanLuminance: luminances.reduce((total, value) => total + value, 0) / luminances.length,
      luminanceRange: Math.max(...luminances) - Math.min(...luminances),
    };
  });
}

async function triggerOriginalFX(page, name) {
  if (expectHeatDistortion) {
    return rpc(page, "realEngineSpawnParticleSystem", {
      name: heatParticleSystemName,
      useViewPosition: true,
      clampToTerrain: true,
    });
  }
  const first = await rpc(page, "realEngineDoFX", {
    name,
    useViewPosition: true,
    clampToTerrain: true,
  });
  if (first.ok || first.result?.guard !== "shrouded") {
    return first;
  }

  const drawables = await rpc(page, "queryDrawables");
  const fallback = drawables?.result?.drawables?.find((drawable) =>
    drawable.localOwned && drawable.onScreen && drawable.worldPos);
  if (!fallback) {
    return first;
  }

  return rpc(page, "realEngineDoFX", {
    name,
    useViewPosition: false,
    clampToTerrain: true,
    x: fallback.worldPos.x,
    y: fallback.worldPos.y,
    z: fallback.worldPos.z,
  });
}

const server = await startStaticServer({ root: wasmRoot });
let browser;
try {
  await mkdir(screenshotDir, { recursive: true });
  const launchOptions = { headless: true, executablePath };
  const browserArgs = process.env.CNC_CHROMIUM_ARGS
    ? process.env.CNC_CHROMIUM_ARGS.split(",").map((arg) => arg.trim()).filter(Boolean)
    : process.env.REAL_FX_BROWSER_ARGS?.split(/\s+/).filter(Boolean);
  if (browserArgs?.length) {
    launchOptions.args = browserArgs;
  }
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  page.setDefaultNavigationTimeout(240000);

  const harnessUrl = new URL("harness/index.html", server.url);
  harnessUrl.searchParams.set("shaderTier", shaderTier);
  if (expectHeatDistortion) {
    harnessUrl.searchParams.set("preserveBuffer", "1");
  }
  await page.goto(harnessUrl.href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
  await page.evaluate(() => window.__cncSetD3D8SceneDrawHistoryLimit?.(4096));

  const mount = await rpc(page, "mountArchives", {
    path: "/assets/real-fx",
    verifyEach: false,
    archives: buildArchives(server.url),
  });
  expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
    "real FX smoke failed to mount runtime archives", mount?.archiveSet ?? mount);

  const init = await rpc(page, "realEngineInit", {
    runDirectory: "/assets/real-fx",
    shellMap: true,
  });
  expect(init?.ok === true && init?.frontier?.initReturned === true,
    "real FX smoke failed real engine init", init?.frontier ?? init);

  await rpc(page, "realEngineFrameSummary", { frames: expectHeatDistortion ? 30 : 4 });
  const before = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  const beforePerf = await page.evaluate(() => globalThis.__cncD3D8PerfSummary?.() ?? {});
  expect(before?.frame?.particles?.managerReady === true,
    "particle manager was not ready before FX trigger", before?.frame?.particles);
  const beforePixels = expectHeatDistortion ? await sampleTacticalView(page) : null;

  const trigger = await triggerOriginalFX(page, fxName);
  expect(trigger?.ok === true, "real FX trigger did not run", trigger?.result ?? trigger);
  expect(trigger.result?.systemsAfter > trigger.result?.systemsBefore ||
      trigger.result?.particlesAfter > trigger.result?.particlesBefore,
    "real FX trigger did not create particle work", trigger.result);

  let best = {
    frame: 0,
    particleCount: 0,
    onScreenParticleCount: 0,
    heatEffectsEnabled: null,
    smudgeManagerReady: null,
    smudgeCountLastFrame: 0,
    effectDrawCount: 0,
    effectTextures: [],
  };
  const beforeParticleCount = Number(before.frame.particles.particleCount ?? 0);
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
  for (let frame = 1; frame <= maxFrames; ++frame) {
    const liteResult = await rpc(page, "realEngineFrameSummary", { frames: 1 });
    let result = liteResult;
    const particles = liteResult?.frame?.particles ?? {};
    let draws = [];
    if (!expectHeatDistortion &&
        (Number(particles.particleCount ?? 0) > Number(before.frame.particles.particleCount ?? 0) ||
          Number(particles.onScreenParticleCount ?? 0) > 0)) {
      await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
      result = await rpc(page, "realEngineFrameSummary", { frames: 1 });
      draws = effectDraws(result);
      await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
    }
    const particleCount = Number(result?.frame?.particles?.particleCount ?? particles.particleCount ?? 0);
    const score = Math.max(0, particleCount - beforeParticleCount) +
      Number(particles.onScreenParticleCount ?? 0) + draws.length;
    const bestScore = Math.max(0, best.particleCount - beforeParticleCount) +
      best.onScreenParticleCount + best.effectDrawCount;
    if (score > bestScore) {
      best = {
        frame,
        particleCount,
        onScreenParticleCount: Number(result?.frame?.particles?.onScreenParticleCount ?? particles.onScreenParticleCount ?? 0),
        heatEffectsEnabled: result?.frame?.particles?.heatEffectsEnabled ?? null,
        smudgeManagerReady: result?.frame?.particles?.smudgeManagerReady ?? null,
        smudgeCountLastFrame: Number(result?.frame?.particles?.smudgeCountLastFrame ?? 0),
        effectDrawCount: draws.length,
        effectTextures: Array.from(new Set(draws.map((draw) => draw.texture).filter(Boolean))).slice(0, 12),
      };
    }
    const feedbackResolves = await page.evaluate(() =>
      globalThis.__cncD3D8PerfSummary?.().framebufferFeedbackResolves ?? 0);
    if (best.effectDrawCount > 0 ||
        (expectHeatDistortion && feedbackResolves > (beforePerf.framebufferFeedbackResolves ?? 0))) {
      break;
    }
  }

  const afterPerf = await page.evaluate(() => globalThis.__cncD3D8PerfSummary?.() ?? {});
  const afterPixels = expectHeatDistortion ? await sampleTacticalView(page) : null;

  await page.locator("#viewport").screenshot({ path: screenshotPath });

  expect(best.particleCount > Number(before.frame.particles.particleCount ?? 0) ||
      best.onScreenParticleCount > Number(before.frame.particles.onScreenParticleCount ?? 0),
    "real FX trigger did not produce live/rendered particles", {
      before: before.frame.particles,
      best,
      trigger: trigger.result,
    });
  expect(expectHeatDistortion || best.effectDrawCount > 0,
    "real FX trigger did not produce visible effect texture draws", {
      best,
      trigger: trigger.result,
    });
  if (expectHeatDistortion) {
    expect(afterPerf.framebufferFeedbackResolves >
        (beforePerf.framebufferFeedbackResolves ?? 0),
      "heat-smudge FX did not resolve and sample the active scene target", {
        before: beforePerf.framebufferFeedbackResolves ?? 0,
        after: afterPerf.framebufferFeedbackResolves ?? 0,
        fboBinds: afterPerf.fboBinds ?? null,
        fboIncomplete: afterPerf.fboIncomplete ?? null,
        best,
      });
    expect((afterPerf.fboIncomplete ?? 0) === 0,
      "heat-smudge FX produced an incomplete framebuffer", afterPerf);
    expect(afterPixels?.ok === true &&
        afterPixels.uniqueColorCount >= 8 &&
        afterPixels.luminanceRange >= 24 &&
        afterPixels.maximumLuminance >= 40 &&
        afterPixels.meanLuminance >= Math.max(4, beforePixels.meanLuminance * 0.35),
      "heat-smudge FX left a black or flat tactical view", { beforePixels, afterPixels });
  }

  console.log(JSON.stringify({
    ok: true,
    fxName: expectHeatDistortion ? heatParticleSystemName : fxName,
    trigger: trigger.result,
    beforeParticles: before.frame.particles,
    framebufferFeedbackResolves: {
      before: beforePerf.framebufferFeedbackResolves ?? 0,
      after: afterPerf.framebufferFeedbackResolves ?? 0,
    },
    tacticalPixels: expectHeatDistortion ? { before: beforePixels, after: afterPixels } : undefined,
    best: {
      frame: best.frame,
      particleCount: best.particleCount,
      onScreenParticleCount: best.onScreenParticleCount,
      effectDrawCount: best.effectDrawCount,
      effectTextures: best.effectTextures,
    },
    screenshotPath,
  }, null, 2));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
