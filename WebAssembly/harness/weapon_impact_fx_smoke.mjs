#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(screenshotDir, "weapon-impact-fx-smoke.png");
const weaponName = process.env.WEAPON_IMPACT_FX_WEAPON ?? "auto";
const maxFrames = Number(process.env.WEAPON_IMPACT_FX_FRAMES ?? 45);

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

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function impactSummary(impact) {
  return {
    ok: impact?.ok,
    aborted: impact?.aborted,
    abortMessage: impact?.abortMessage,
    result: impact?.result,
  };
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

async function findSourceDrawable(page) {
  const drawables = await rpc(page, "queryDrawables");
  const source = drawables?.result?.drawables?.find((drawable) =>
    drawable.localOwned === true &&
    drawable.onScreen === true &&
    Number(drawable.id) > 0 &&
    drawable.worldPos);
  return source ?? null;
}

const server = await startStaticServer({ root: wasmRoot });
let browser;
try {
  await mkdir(screenshotDir, { recursive: true });
  const launchOptions = { headless: true };
  const executablePath = process.env.WEAPON_IMPACT_FX_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  if (process.env.WEAPON_IMPACT_FX_BROWSER_ARGS) {
    launchOptions.args = process.env.WEAPON_IMPACT_FX_BROWSER_ARGS.split(/\s+/).filter(Boolean);
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
    path: "/assets/weapon-impact-fx",
    verifyEach: false,
    archives: buildArchives(server.url),
  });
  expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
    "weapon impact FX smoke failed to mount runtime archives", mount?.archiveSet ?? mount);

  const init = await rpc(page, "realEngineInit", {
    runDirectory: "/assets/weapon-impact-fx",
    shellMap: true,
  });
  expect(init?.ok === true && init?.frontier?.initReturned === true,
    "weapon impact FX smoke failed real engine init", init?.frontier ?? init);

  await rpc(page, "realEngineFrameSummary", { frames: 10 });
  const before = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  expect(before?.frame?.particles?.managerReady === true,
    "particle manager was not ready before weapon impact", before?.frame?.particles);

  const source = await findSourceDrawable(page);
  const impact = await rpc(page, "realEngineDetonateWeapon", {
    name: weaponName,
    sourceObjectId: source?.id ?? 0,
    x: source?.worldPos?.x ?? 0,
    y: source?.worldPos?.y ?? 0,
    z: source?.worldPos?.z ?? 0,
    useSourcePosition: source == null,
    clampToTerrain: true,
    inflictDamage: true,
  });
  expect(impact?.ok === true, "real weapon detonation did not run", impactSummary(impact));
  expect(impact.result?.projectileDetonationFX === true &&
      Number(impact.result?.detonationNuggets ?? 0) > 0,
    "real weapon detonation did not use a loaded ProjectileDetonationFX", impact.result);
  expect(impact.result?.selectedWeapon && impact.result?.selectedWeapon !== "",
    "real weapon detonation did not select a weapon template", impact.result);
  expect(impact.result?.systemsAfter > impact.result?.systemsBefore ||
      impact.result?.particlesAfter > impact.result?.particlesBefore,
    "real weapon detonation did not create particle work", impact.result);

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
    const particles = liteResult?.frame?.particles ?? {};
    let result = liteResult;
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
    "real weapon detonation did not produce live/rendered particles", {
      source,
      before: before.frame.particles,
      impact: impact.result,
      best,
    });
  expect(best.effectDrawCount > 0,
    "real weapon detonation did not produce visible effect texture draws", {
      source,
      impact: impact.result,
      best,
    });

  console.log(JSON.stringify({
    ok: true,
    requestedWeaponName: weaponName,
    selectedWeaponName: impact.result.selectedWeapon,
    source: {
      id: source?.id ?? impact.result.sourceObjectId,
      name: source?.name ?? impact.result.sourceTemplate,
      worldPos: source?.worldPos ?? impact.result.position,
    },
    impact: impact.result,
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
