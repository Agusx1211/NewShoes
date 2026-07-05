import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outDir = resolve(process.env.SHELLMAP_CAPTURE_DIR ?? "/Users/aa/cnc-verify/shellmap-texture-labels");
const captureFrames = (process.env.SHELLMAP_CAPTURE_FRAMES ?? "360,720")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

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

function compactDraw(draw, labelById) {
  const texture0Id = Number(draw.texture0?.id ?? 0);
  const texture1Id = Number(draw.texture1?.id ?? 0);
  return {
    seq: draw.drawSequence,
    primitiveType: draw.primitiveType,
    fvf: draw.vertexShaderFvf,
    stride: draw.vertexStride,
    vertexCount: draw.vertexCount,
    indexCount: draw.indexCount,
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
    const texture = draw.texture0 ?? {};
    const label = texture.label ?? {};
    const name = label.name || label.path || `(id ${texture.id ?? 0})`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 24)
    .map(([name, count]) => ({ name, count }));
}

async function main() {
  if (captureFrames.length === 0) {
    throw new Error("no capture frames requested");
  }
  await mkdir(outDir, { recursive: true });

  const server = await startStaticServer({ root: wasmRoot });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SHELLMAP_BROWSER_EXECUTABLE
      ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: (process.env.SHELLMAP_BROWSER_ARGS ?? "--enable-gpu --use-angle=metal --disable-gpu-compositing")
      .split(/\s+/)
      .filter(Boolean),
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);
  page.on("pageerror", (error) => {
    console.error(`[shellmap-labels] pageerror ${error.stack ?? error.message}`);
  });

  const rpc = (command, payload = {}) =>
    page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);

  try {
    await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

    console.error("[shellmap-labels] mounting archives");
    const mount = await rpc("mountArchives", {
      path: "/assets/real-init",
      verifyEach: false,
      archives: buildArchives(server.url),
    });
    if (mount?.archiveSet?.archiveCount !== archiveSpecs.length) {
      throw new Error(`archive mount failed: ${JSON.stringify(mount?.archiveSet ?? mount)}`);
    }

    console.error("[shellmap-labels] real init shell map");
    const init = await rpc("realEngineInit", { runDirectory: "/assets/real-init", shellMap: true });
    if (init?.ok !== true || init?.frontier?.initReturned !== true) {
      throw new Error(`real init failed: ${JSON.stringify(init?.frontier ?? init)}`);
    }

    for (const point of [{ x: 32, y: 32 }, { x: 96, y: 96 }]) {
      await rpc("postMessage", {
        message: 0x0200,
        lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
        point,
      });
      await rpc("realEngineFrameSummary", { frames: 2 });
    }

    let completedFrames = 4;
    const captures = [];
    for (const targetFrame of captureFrames.sort((left, right) => left - right)) {
      const liteFrames = Math.max(0, targetFrame - completedFrames - 1);
      if (liteFrames > 0) {
        await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
        const liteResult = await rpc("realEngineFrameSummary", { frames: liteFrames });
        completedFrames = Number(liteResult?.frame?.framesCompleted ?? completedFrames + liteFrames);
      }

      await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
      const result = await rpc("realEngineFrameSummary", { frames: 1 });
      completedFrames = Number(result?.frame?.framesCompleted ?? completedFrames + 1);

      const screenshotPath = resolve(outDir, `shellmap-frame-${targetFrame}.png`);
      await page.locator("#viewport").screenshot({ path: screenshotPath });

      const labels = result?.frame?.textureDiagnostics?.labels ?? [];
      const labelById = new Map(labels.map((label) => [Number(label.id), label]));
      const history = (result?.state?.graphics?.d3d8SceneDrawHistory ?? [])
        .map((draw) => compactDraw(draw, labelById));

      const capture = {
        targetFrame,
        frameCompleted: completedFrames,
        screenshotPath,
        textureDiagnostics: result?.frame?.textureDiagnostics ?? null,
        historyLength: history.length,
        historySeqRange: history.length ? [history[0].seq, history[history.length - 1].seq] : [],
        topTextures: topTextureNames(history),
        history,
      };
      captures.push(capture);
      console.error(`[shellmap-labels] captured target=${targetFrame} completed=${completedFrames} history=${history.length} labels=${labels.length}`);
    }

    const renderer = await page.evaluate(() => {
      const canvas = document.querySelector("#viewport");
      const gl = canvas?.getContext("webgl2");
      const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
      return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
    });
    const summary = { ok: true, renderer, captures };
    await writeFile(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({
      ok: true,
      renderer,
      captures: captures.map((capture) => ({
        targetFrame: capture.targetFrame,
        frameCompleted: capture.frameCompleted,
        historyLength: capture.historyLength,
        labels: capture.textureDiagnostics?.labels?.length ?? 0,
        screenshotPath: capture.screenshotPath,
        topTextures: capture.topTextures.slice(0, 8),
      })),
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
