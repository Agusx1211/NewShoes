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
  redWhite: { filter: 1, mode: 2 },
  greenWhite: { filter: 1, mode: 3 },
  crossfadeCircle: { filter: 3, mode: 4 },
  crossfadeFramebufferMask: { filter: 3, mode: 5 },
  motionBlurInOutAlpha: { filter: 2, mode: 6 },
  motionBlurInOutSaturate: { filter: 2, mode: 7 },
  motionBlurInAlpha: { filter: 2, mode: 8 },
  motionBlurOutAlpha: { filter: 2, mode: 9 },
  motionBlurInSaturate: { filter: 2, mode: 10 },
  motionBlurOutSaturate: { filter: 2, mode: 11 },
  motionBlurEndPanAlpha: { filter: 2, mode: 12 },
  motionBlurPanAlpha: { filter: 2, mode: 14 },
  default: { filter: 4, mode: 13 },
};
function check(name, ok, detail) {
  console.error(`[shader-tier] ${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail ?? null)}`);
  if (!ok) {
    failures.push({ name, detail });
  }
}

function effectSummary(variant) {
  return {
    command: variant?.command?.result,
    before: variant?.before,
    after: variant?.after,
    screenshot: variant?.screenshot,
    pixels: variant?.pixels ? {
      ok: variant.pixels.ok,
      uniqueColorCount: variant.pixels.uniqueColorCount,
      luminanceRange: variant.pixels.luminanceRange,
    } : null,
  };
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

async function sampleTacticalView(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!(canvas instanceof HTMLCanvasElement) || !context) {
      return { ok: false, error: "viewport WebGL context unavailable" };
    }
    // Stay inside the animated shell-map viewport and away from the right-side
    // menu/logo.  A valid frame has terrain/water/object variation here; the
    // broken RTT depth path leaves every sample at the same clear color while
    // still reporting thousands of successful draw calls.
    const xs = [0.12, 0.23, 0.34, 0.45, 0.56, 0.67];
    const ys = [0.13, 0.27, 0.41, 0.55, 0.69, 0.83];
    const pixel = new Uint8Array(4);
    const samples = [];
    for (const xRatio of xs) {
      for (const yRatio of ys) {
        const x = Math.min(canvas.width - 1, Math.floor(canvas.width * xRatio));
        const y = Math.min(canvas.height - 1, Math.floor(canvas.height * yRatio));
        context.readPixels(x, y, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
        samples.push(Array.from(pixel));
      }
    }
    const colors = samples.map((rgba) => rgba.join(","));
    const luminances = samples.map((rgba) =>
      (rgba[0] * 0.2126) + (rgba[1] * 0.7152) + (rgba[2] * 0.0722));
    return {
      ok: true,
      sampleCount: samples.length,
      uniqueColorCount: new Set(colors).size,
      luminanceRange: Math.max(...luminances) - Math.min(...luminances),
      samples,
    };
  });
}

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
  url.searchParams.set("preserveBuffer", "1");
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
  inspection.tacticalFrames = [];
  for (let frame = 0; frame < 6; frame += 1) {
    inspection.tacticalFrames.push(await sampleTacticalView(page));
    await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 1 }));
  }
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
    effects.monochromePixels = await sampleTacticalView(page);
    effects.monochromeScreenshot = await capture("shellmap-ps11-monochrome.png");
    effects.afterMonochrome = await page.evaluate(() => ({
      perf: {
        fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
        draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
      },
      debugLog: globalThis.__cncSM1DebugLog ?? {},
    }));

    effects.bwVariants = {};
    for (const [name, filter] of Object.entries({
      redWhite: viewFilter.redWhite,
      greenWhite: viewFilter.greenWhite,
    })) {
      const command = await page.evaluate((payload) => window.CnCPort.rpc(
        "realEngineSetViewFilter", payload,
      ), { ...filter, fadeFrames: 1, fadeDirection: 1 });
      await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 2 }));
      effects.bwVariants[name] = {
        command,
        pixels: await sampleTacticalView(page),
        screenshot: await capture(`shellmap-ps11-${name}.png`),
      };
    }

    effects.crossfades = {};
    for (const [name, filter] of Object.entries({
      circle: viewFilter.crossfadeCircle,
      framebufferMask: viewFilter.crossfadeFramebufferMask,
    })) {
      await page.evaluate((payload) => window.CnCPort.rpc(
        "realEngineSetViewFilter", payload,
      ), viewFilter.default);
      const before = await page.evaluate(() => ({
        fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
        draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
      }));
      const command = await page.evaluate((payload) => window.CnCPort.rpc(
        "realEngineSetViewFilter", payload,
      ), { ...filter, fadeFrames: 6, fadeDirection: -1 });
      await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 2 }));
      const after = await page.evaluate(() => ({
        fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
        draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
      }));
      effects.crossfades[name] = {
        command,
        before,
        after,
        pixels: await sampleTacticalView(page),
        screenshot: await capture(`shellmap-ps11-crossfade-${name}.png`),
      };
    }

    effects.motionBlurVariants = {};
    for (const [name, filter] of Object.entries({
      inOutAlpha: viewFilter.motionBlurInOutAlpha,
      inOutSaturate: viewFilter.motionBlurInOutSaturate,
      inAlpha: viewFilter.motionBlurInAlpha,
      outAlpha: viewFilter.motionBlurOutAlpha,
      inSaturate: viewFilter.motionBlurInSaturate,
      outSaturate: viewFilter.motionBlurOutSaturate,
    })) {
      await page.evaluate((payload) => window.CnCPort.rpc(
        "realEngineSetViewFilter", payload,
      ), viewFilter.default);
      const before = await page.evaluate(() => ({
        fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
        draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
      }));
      const command = await page.evaluate((payload) => window.CnCPort.rpc(
        "realEngineSetViewFilter", payload,
      ), filter);
      await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 2 }));
      const after = await page.evaluate(() => ({
        fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
        draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
      }));
      effects.motionBlurVariants[name] = {
        command,
        before,
        after,
        pixels: await sampleTacticalView(page),
        screenshot: await capture(`shellmap-ps11-motion-${name}.png`),
      };
    }

    await page.evaluate((payload) => window.CnCPort.rpc(
      "realEngineSetViewFilter", payload,
    ), viewFilter.default);
    const panBefore = await page.evaluate(() => ({
      fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
      draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
    }));
    const panCommand = await page.evaluate((payload) => window.CnCPort.rpc(
      "realEngineSetViewFilter", payload,
    ), viewFilter.motionBlurPanAlpha);
    const panLookAt = await page.evaluate(() => window.CnCPort.rpc(
      "tacticalViewLookAt", { x: 300, y: 300, z: 0 },
    ));
    await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 2 }));
    const panAfter = await page.evaluate(() => ({
      fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
      draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
    }));
    effects.motionBlurVariants.panAlpha = {
      command: panCommand,
      lookAt: panLookAt,
      before: panBefore,
      after: panAfter,
      pixels: await sampleTacticalView(page),
      screenshot: await capture("shellmap-ps11-motion-panAlpha.png"),
    };

    const endPanCommand = await page.evaluate((payload) => window.CnCPort.rpc(
      "realEngineSetViewFilter", payload,
    ), viewFilter.motionBlurEndPanAlpha);
    const endPanBefore = panAfter;
    await page.evaluate(() => window.CnCPort.rpc("realEngineFrame", { frames: 2 }));
    const endPanAfter = await page.evaluate(() => ({
      fboBinds: globalThis.__cncD3D8PerfSummary?.().fboBinds ?? 0,
      draws: globalThis.__cncD3D8PerfSummary?.().draws ?? 0,
    }));
    effects.motionBlurVariants.endPanAlpha = {
      command: endPanCommand,
      before: endPanBefore,
      after: endPanAfter,
      pixels: await sampleTacticalView(page),
      screenshot: await capture("shellmap-ps11-motion-endPanAlpha.png"),
    };

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
  check("ps11: tactical scene pixels are visible", ps11.tacticalFrames.every((frame) =>
    frame.ok === true && frame.uniqueColorCount >= 8 && frame.luminanceRange >= 24),
  ps11.tacticalFrames.map(({ samples, ...frame }) => frame));
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
  check("ps11: monochrome filter preserves the tactical scene",
    ps11.effects.monochromePixels?.ok === true &&
      ps11.effects.monochromePixels.uniqueColorCount >= 24 &&
      ps11.effects.monochromePixels.luminanceRange >= 24,
    ps11.effects.monochromePixels);
  check("ps11: all BW color variants captured",
    Object.keys(ps11.effects.bwVariants ?? {}).length === 2,
    Object.keys(ps11.effects.bwVariants ?? {}));
  for (const [name, variant] of Object.entries(ps11.effects.bwVariants ?? {})) {
    check(`ps11: ${name} filter triggered`, variant.command?.ok === true &&
      variant.screenshot === true &&
      variant.pixels?.ok === true &&
      variant.pixels.uniqueColorCount >= 24 &&
      variant.pixels.luminanceRange >= 24, effectSummary(variant));
  }
  check("ps11: both crossfade modes captured",
    Object.keys(ps11.effects.crossfades ?? {}).length === 2,
    Object.keys(ps11.effects.crossfades ?? {}));
  for (const [name, variant] of Object.entries(ps11.effects.crossfades ?? {})) {
    check(`ps11: ${name} crossfade triggered`, variant.command?.ok === true &&
      variant.command?.result?.filter === viewFilter.crossfadeCircle.filter &&
      variant.screenshot === true &&
      variant.after?.fboBinds > variant.before?.fboBinds &&
      variant.after?.draws > variant.before?.draws &&
      variant.pixels?.ok === true &&
      variant.pixels.uniqueColorCount >= 24 &&
      variant.pixels.luminanceRange >= 24, effectSummary(variant));
  }
  check("ps11: all motion-blur modes captured",
    Object.keys(ps11.effects.motionBlurVariants ?? {}).length === 8,
    Object.keys(ps11.effects.motionBlurVariants ?? {}));
  for (const [name, variant] of Object.entries(ps11.effects.motionBlurVariants ?? {})) {
    check(`ps11: ${name} motion blur triggered`, variant.command?.ok === true &&
      variant.command?.result?.filter === viewFilter.motionBlurInAlpha.filter &&
      variant.screenshot === true &&
      variant.after?.fboBinds > variant.before?.fboBinds &&
      variant.after?.draws > variant.before?.draws &&
      variant.pixels?.ok === true &&
      variant.pixels.uniqueColorCount >= 24 &&
      variant.pixels.luminanceRange >= 24 &&
      (name !== "panAlpha" || variant.lookAt?.ok === true), {
      ...effectSummary(variant),
      lookAt: variant.lookAt?.result,
    });
  }

  const ff = await bootAndInspect("ff");
  check("ff: no SM1 shaders registered", ff.summary.sm1PixelShadersRegistered === 0 &&
    ff.summary.sm1VertexShadersRegistered === 0, ff.summary);
  check("ff: no shader draws", ff.summary.sm1ShaderDraws === 0, ff.summary);
  check("ff: draws happened at all", ff.summary.draws > 0, ff.summary);
  check("ff: tactical scene pixels are visible", ff.tacticalFrames.every((frame) =>
    frame.ok === true && frame.uniqueColorCount >= 8 && frame.luminanceRange >= 24),
  ff.tacticalFrames.map(({ samples, ...frame }) => frame));
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
