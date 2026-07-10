#!/usr/bin/env node
// D3D8 SM1 shader-tier probe.
//
// Boots play.html twice on the same build:
//   1. shaderTier=ps11 (the default tier) — the shim advertises ps.1.1/vs.1.1
//      caps and a generic adapter, so W3DShaderManager::getChipset() selects
//      DC_GENERIC_PIXEL_SHADER_1_1 and the engine loads the shipped .pso/.vso
//      shaders (terrain/roads/trees/water/BW filter). Asserts shaders were
//      registered + drawn with zero translation/link failures and captures a
//      screenshot for eyeballing.
//   2. shaderTier=ff — asserts the legacy fixed-function tier is byte-for-byte
//      untouched (no SM1 shaders registered) and captures the baseline
//      screenshot.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.CNC_CHROMIUM ?? undefined;
const playwrightModule = executablePath ? "playwright-core" : "playwright";
const { chromium } = await import(playwrightModule);

let server = null;
let serverUrl = process.env.CNC_HARNESS_URL ?? null;
if (!serverUrl) {
  const { startStaticServer } = await import("./static-server.mjs");
  server = await startStaticServer({ root: wasmRoot });
  serverUrl = server.url;
}
const outDir = process.env.CNC_PROBE_OUT ?? "/tmp/cnc-shader-tier-probe";
mkdirSync(outDir, { recursive: true });

setTimeout(() => {
  console.error("[shader-tier] WATCHDOG: 25 minutes elapsed");
  process.exit(3);
}, 25 * 60 * 1000).unref();

const failures = [];
const viewFilter = {
  monochrome: { filter: 1, mode: 1 },
  motionBlurInAlpha: { filter: 2, mode: 8 },
  default: { filter: 4, mode: 13 },
};
function check(name, ok, detail) {
  console.error(`[shader-tier] ${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail ?? null)}`);
  if (!ok) {
    failures.push({ name, detail });
  }
}

const extraArgs = (process.env.CNC_CHROMIUM_ARGS ?? "")
  .split(",")
  .map((arg) => arg.trim())
  .filter(Boolean);
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1400,940", ...extraArgs],
});

async function bootAndInspect(tier) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    globalThis.__cncSM1DebugCapture = true;
  });
  const sm1Warnings = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("D3D8 SM1") || text.includes("WasmD3D8:")) {
      sm1Warnings.push(text);
      console.error(`[shader-tier] [${tier}] console: ${text}`);
    }
  });
  page.on("pageerror", (error) => console.error(`[shader-tier] [${tier}] pageerror`, error.message));
  const url = new URL("harness/play.html", serverUrl);
  url.searchParams.set("autostart", "1");
  url.searchParams.set("diag", "lite");
  url.searchParams.set("dist", process.env.CNC_DIST ?? "dist");
  url.searchParams.set("shaderTier", tier);
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  console.error(`[shader-tier] [${tier}] booting...`);
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: 600_000 });
  // Let the shellmap render a few frames so shader draws accumulate.
  await page.evaluate(async () => {
    await window.CnCPort.rpc("realEngineFrame", { frames: 30 });
  });
  const inspection = await page.evaluate(() => {
    const perf = globalThis.__cncD3D8PerfSummary?.() ?? {};
    const context = document.querySelector("#viewport")?.getContext("webgl2");
    const rendererInfo = context?.getExtension("WEBGL_debug_renderer_info");
    return {
      summary: {
        renderer: context?.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? context?.RENDERER) ?? "unknown",
        sm1PixelShadersRegistered: perf.sm1PixelShadersRegistered ?? 0,
        sm1VertexShadersRegistered: perf.sm1VertexShadersRegistered ?? 0,
        sm1PairProgramsLinked: perf.sm1PairProgramsLinked ?? 0,
        sm1PairProgramFailures: perf.sm1PairProgramFailures ?? 0,
        sm1ShaderDraws: perf.sm1ShaderDraws ?? 0,
        sm1TranslatedVsDraws: perf.sm1TranslatedVsDraws ?? 0,
        sm1FallbackDraws: perf.sm1FallbackDraws ?? 0,
        destinationAlphaBlendDraws: perf.destinationAlphaBlendDraws ?? 0,
        destinationAlphaBlendOffscreenDraws: perf.destinationAlphaBlendOffscreenDraws ?? 0,
        draws: perf.draws ?? 0,
      },
      sm1DebugLog: globalThis.__cncSM1DebugLog ?? {},
    };
  });
  const capture = async (name) => {
    const shot = await page.evaluate(async () => {
      const result = await window.CnCPort.rpc("screenshot", {});
      return result?.screenshot?.dataUrl ?? null;
    });
    if (shot) {
      writeFileSync(resolve(outDir, name), Buffer.from(shot.split(",")[1], "base64"));
    }
    return Boolean(shot);
  };
  await capture(`shellmap-${tier}.png`);

  const effects = {};
  if (tier === "ps11") {
    effects.monochromeCommand = await page.evaluate((payload) => window.CnCPort.rpc(
      "realEngineSetViewFilter", payload,
    ), { ...viewFilter.monochrome, fadeFrames: 1, fadeDirection: 1 });
    await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 2 }));
    effects.monochromeScreenshot = await capture("shellmap-ps11-monochrome.png");
    effects.afterMonochrome = await page.evaluate(() => ({
      perf: {
        fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
        draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
      },
      debugLog: globalThis.__cncSM1DebugLog ?? {},
    }));

    effects.motionBlurCommand = await page.evaluate((payload) => window.CnCPort.rpc(
      "realEngineSetViewFilter", payload,
    ), viewFilter.motionBlurInAlpha);
    await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 2 }));
    effects.motionBlurScreenshot = await capture("shellmap-ps11-motion-blur.png");
    effects.afterMotionBlur = await page.evaluate(() => ({
      fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
      draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
    }));

    await page.evaluate((payload) => window.CnCPort.rpc(
      "realEngineSetViewFilter", payload,
    ), viewFilter.default);
  }
  console.error(`[shader-tier] [${tier}] summary ${JSON.stringify(inspection.summary)}`);
  await page.close();
  return { ...inspection, effects, sm1Warnings };
}

try {
  const ps11 = await bootAndInspect("ps11");
  check("ps11: pixel shaders registered", ps11.summary.sm1PixelShadersRegistered > 0, ps11.summary);
  check("ps11: vertex shaders registered", ps11.summary.sm1VertexShadersRegistered > 0, ps11.summary);
  check("ps11: pair programs linked", ps11.summary.sm1PairProgramsLinked > 0, ps11.summary);
  check("ps11: zero pair failures", ps11.summary.sm1PairProgramFailures === 0, ps11.summary);
  check("ps11: shader draws happened", ps11.summary.sm1ShaderDraws > 0, ps11.summary);
  check("ps11: zero fallback draws", ps11.summary.sm1FallbackDraws === 0, ps11.summary);
  check("ps11: no translation warnings", ps11.sm1Warnings.length === 0, ps11.sm1Warnings.slice(0, 5));
  check("ps11: shoreline destination alpha uses RGBA scene target",
    ps11.summary.destinationAlphaBlendDraws > 0 &&
    ps11.summary.destinationAlphaBlendOffscreenDraws ===
      ps11.summary.destinationAlphaBlendDraws, ps11.summary);
  const flatWaterSignature = ["tex", "tex", "tex", "tex", "mul", "mad", "mul"];
  const flatWaterEntries = Object.values(ps11.sm1DebugLog).filter((entry) =>
    entry.instructions?.length === flatWaterSignature.length &&
    entry.instructions.every((instruction, index) => instruction === flatWaterSignature[index]));
  const flatWaterSamples = flatWaterEntries.flatMap((entry) => entry.samples ?? []);
  const flatWaterDetail = {
    entries: flatWaterEntries.length,
    draws: flatWaterEntries.reduce((total, entry) => total + (entry.count ?? 0), 0),
    samples: flatWaterSamples.slice(0, 3).map((sample) => ({
      vertexShaderFvf: sample.vertexShaderFvf,
      vertexStride: sample.vertexStride,
      diffuseOffset: sample.diffuseOffset,
      firstVertexDiffuse: sample.firstVertexDiffuse,
    })),
  };
  check("ps11: flat-water shader draw captured", flatWaterSamples.length > 0, flatWaterDetail);
  check("ps11: flat-water shader receives vertex diffuse", flatWaterSamples.length > 0 &&
    flatWaterSamples.every((sample) =>
      (sample.vertexShaderFvf & 0x40) !== 0 &&
      sample.diffuseOffset !== null &&
      Array.isArray(sample.firstVertexDiffuse)), flatWaterDetail);
  const monochromeSamples = Object.values(ps11.effects.afterMonochrome?.debugLog ?? {})
    .flatMap((entry) => entry.samples ?? [])
    .filter((sample) => sample.vertexShaderFvf === 0x144 && sample.vertexStride === 28);
  check("ps11: monochrome filter triggered", ps11.effects.monochromeCommand?.ok === true &&
    ps11.effects.monochromeScreenshot === true && monochromeSamples.length > 0, {
    command: ps11.effects.monochromeCommand?.result,
    samples: monochromeSamples.length,
  });
  check("ps11: motion-blur filter triggered", ps11.effects.motionBlurCommand?.ok === true &&
    ps11.effects.motionBlurScreenshot === true &&
    ps11.effects.afterMotionBlur?.fboBinds > ps11.effects.afterMonochrome?.perf?.fboBinds &&
    ps11.effects.afterMotionBlur?.draws > ps11.effects.afterMonochrome?.perf?.draws, {
    command: ps11.effects.motionBlurCommand?.result,
    before: ps11.effects.afterMonochrome?.perf,
    after: ps11.effects.afterMotionBlur,
  });

  const ff = await bootAndInspect("ff");
  check("ff: no SM1 shaders registered", ff.summary.sm1PixelShadersRegistered === 0 &&
    ff.summary.sm1VertexShadersRegistered === 0, ff.summary);
  check("ff: no shader draws", ff.summary.sm1ShaderDraws === 0, ff.summary);
  check("ff: draws happened at all", ff.summary.draws > 0, ff.summary);
} finally {
  await browser.close();
  await server?.close?.();
}

console.error(`[shader-tier] screenshots in ${outDir}`);
if (failures.length > 0) {
  console.error(`[shader-tier] ${failures.length} FAILURES`);
  process.exit(1);
}
console.error("[shader-tier] ALL PASS");
