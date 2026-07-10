#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(screenshotDir, "real-laser-draw-smoke.png");
const maxFrames = Number(process.env.REAL_LASER_DRAW_FRAMES ?? 6);
const templateCandidates = (process.env.REAL_LASER_DRAW_TEMPLATES ??
  "LaserBeam,PointDefenseLaserBeam,AirF_RaptorPointDefenseLaserBeam,AirF_PointDefenseLaserBeam")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

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

function laserDraws(result) {
  const labels = labelMap(result?.frame);
  return (result?.state?.graphics?.d3d8SceneDrawHistory ?? [])
    .map((draw) => ({ seq: draw.drawSequence, texture: textureLabel(draw, labels) }))
    .filter((draw) => /exlaser|laser|beam|binary|noise/i.test(draw.texture));
}

async function spawnFirstAvailableLaser(page) {
  const attempts = [];
  for (const templateName of templateCandidates) {
    const result = await rpc(page, "realEngineSpawnLaser", {
      templateName,
      useViewPosition: true,
      clampToTerrain: true,
      length: 180,
      height: 45,
    });
    attempts.push({
      templateName,
      ok: result?.ok,
      guard: result?.result?.guard,
      result: result?.result,
    });
    if (result?.ok === true) {
      return { result, attempts };
    }
  }
  return { result: null, attempts };
}

const server = await startStaticServer({ root: wasmRoot });
let browser;
try {
  await mkdir(screenshotDir, { recursive: true });
  const launchOptions = { headless: true };
  const executablePath = process.env.REAL_LASER_DRAW_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  if (process.env.REAL_LASER_DRAW_BROWSER_ARGS) {
    launchOptions.args = process.env.REAL_LASER_DRAW_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  }
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  page.setDefaultNavigationTimeout(240000);

  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
  await page.evaluate(() => window.__cncSetD3D8SceneDrawHistoryLimit?.(8192));

  const mount = await rpc(page, "mountArchives", {
    path: "/assets/real-laser-draw",
    verifyEach: false,
    archives: buildArchives(server.url),
  });
  expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
    "real laser draw smoke failed to mount runtime archives", mount?.archiveSet ?? mount);

  const init = await rpc(page, "realEngineInit", {
    runDirectory: "/assets/real-laser-draw",
    shellMap: true,
  });
  expect(init?.ok === true && init?.frontier?.initReturned === true,
    "real laser draw smoke failed real engine init", init?.frontier ?? init);

  await rpc(page, "realEngineFrameSummary", { frames: 8 });
  const spawn = await spawnFirstAvailableLaser(page);
  expect(spawn.result?.ok === true,
    "no shipped W3DLaserDraw template could be spawned", spawn.attempts);

  let best = { frame: 0, drawCount: 0, textures: [], result: null };
  await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
  for (let frame = 1; frame <= maxFrames; ++frame) {
    const result = await rpc(page, "realEngineFrameSummary", { frames: 1 });
    const draws = laserDraws(result);
    if (draws.length > best.drawCount) {
      best = {
        frame,
        drawCount: draws.length,
        textures: Array.from(new Set(draws.map((draw) => draw.texture).filter(Boolean))).slice(0, 12),
        result,
      };
    }
    if (draws.length > 0) {
      break;
    }
  }
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  expect(best.drawCount > 0,
    "spawned W3DLaserDraw did not produce visible laser texture draws", {
      spawn: spawn.result.result,
      attempts: spawn.attempts,
      best,
    });
  const cleanup = await rpc(page, "realEngineSpawnLaser", {
    templateName: "__missing_cleanup_laser_template__",
    useViewPosition: true,
  });
  expect(cleanup?.ok === false && cleanup?.result?.guard === "missingTemplate",
    "laser cleanup did not clear the probe drawable through the spawn guard", cleanup);

  console.log(JSON.stringify({
    ok: true,
    templateName: spawn.result.result.requested,
    spawn: spawn.result.result,
    best: {
      frame: best.frame,
      drawCount: best.drawCount,
      textures: best.textures,
    },
    cleanup: cleanup.result,
    screenshotPath,
  }, null, 2));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
