#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(screenshotDir, "real-fx-render-smoke.png");
const fxName = process.env.REAL_FX_NAME ?? "WeaponFX_MOAB_Blast";
const maxFrames = Number(process.env.REAL_FX_FRAMES ?? 45);

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

async function triggerOriginalFX(page, name) {
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
  const launchOptions = { headless: true };
  const executablePath = process.env.REAL_FX_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  if (process.env.REAL_FX_BROWSER_ARGS) {
    launchOptions.args = process.env.REAL_FX_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  }
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  page.setDefaultNavigationTimeout(240000);

  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
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

  await rpc(page, "realEngineFrameSummary", { frames: 4 });
  const before = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  expect(before?.frame?.particles?.managerReady === true,
    "particle manager was not ready before FX trigger", before?.frame?.particles);

  const trigger = await triggerOriginalFX(page, fxName);
  expect(trigger?.ok === true, "real FX trigger did not run", trigger);
  expect(trigger.result?.systemsAfter > trigger.result?.systemsBefore ||
      trigger.result?.particlesAfter > trigger.result?.particlesBefore,
    "real FX trigger did not create particle work", trigger.result);

  let best = {
    frame: 0,
    particleCount: 0,
    onScreenParticleCount: 0,
    effectDrawCount: 0,
    effectTextures: [],
    result: null,
  };
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
  for (let frame = 1; frame <= maxFrames; ++frame) {
    const liteResult = await rpc(page, "realEngineFrameSummary", { frames: 1 });
    let result = liteResult;
    const particles = liteResult?.frame?.particles ?? {};
    let draws = [];
    if (Number(particles.particleCount ?? 0) > Number(before.frame.particles.particleCount ?? 0) ||
        Number(particles.onScreenParticleCount ?? 0) > 0) {
      await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
      result = await rpc(page, "realEngineFrameSummary", { frames: 1 });
      draws = effectDraws(result);
      await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
    }
    const score = Number(particles.onScreenParticleCount ?? 0) + draws.length;
    const bestScore = best.onScreenParticleCount + best.effectDrawCount;
    if (score > bestScore) {
      best = {
        frame,
        particleCount: Number(result?.frame?.particles?.particleCount ?? particles.particleCount ?? 0),
        onScreenParticleCount: Number(result?.frame?.particles?.onScreenParticleCount ?? particles.onScreenParticleCount ?? 0),
        effectDrawCount: draws.length,
        effectTextures: Array.from(new Set(draws.map((draw) => draw.texture).filter(Boolean))).slice(0, 12),
        result,
      };
    }
    if (best.effectDrawCount > 0) {
      break;
    }
  }

  await page.locator("#viewport").screenshot({ path: screenshotPath });

  expect(best.particleCount > Number(before.frame.particles.particleCount ?? 0) ||
      best.onScreenParticleCount > Number(before.frame.particles.onScreenParticleCount ?? 0),
    "real FX trigger did not produce live/rendered particles", {
      before: before.frame.particles,
      best,
      trigger: trigger.result,
    });
  expect(best.effectDrawCount > 0,
    "real FX trigger did not produce visible effect texture draws", {
      best,
      trigger: trigger.result,
    });

  console.log(JSON.stringify({
    ok: true,
    fxName,
    trigger: trigger.result,
    beforeParticles: before.frame.particles,
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
