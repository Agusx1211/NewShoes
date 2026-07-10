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
  // Legacy main-thread path, pinned explicitly: this probe's dist build has
  // no pthread runtime, so it must stay legacy when the prepared
  // threaded-by-default play-page flip lands.
  url.searchParams.set("threads", "0");
  url.searchParams.set("shaderTier", tier);
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  console.error(`[shader-tier] [${tier}] booting...`);
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: 600_000 });
  // Let the shellmap render a few frames so shader draws accumulate.
  await page.evaluate(async () => {
    await window.CnCPort.rpc("realEngineFrame", { frames: 30 });
  });
  const summary = await page.evaluate(() => {
    const perf = globalThis.__cncD3D8PerfSummary?.() ?? {};
    return {
      sm1PixelShadersRegistered: perf.sm1PixelShadersRegistered ?? 0,
      sm1VertexShadersRegistered: perf.sm1VertexShadersRegistered ?? 0,
      sm1PairProgramsLinked: perf.sm1PairProgramsLinked ?? 0,
      sm1PairProgramFailures: perf.sm1PairProgramFailures ?? 0,
      sm1ShaderDraws: perf.sm1ShaderDraws ?? 0,
      sm1TranslatedVsDraws: perf.sm1TranslatedVsDraws ?? 0,
      sm1FallbackDraws: perf.sm1FallbackDraws ?? 0,
      draws: perf.draws ?? 0,
    };
  });
  const shot = await page.evaluate(async () => {
    const result = await window.CnCPort.rpc("screenshot", {});
    return result?.screenshot?.dataUrl ?? null;
  });
  if (shot) {
    writeFileSync(
      resolve(outDir, `shellmap-${tier}.png`),
      Buffer.from(shot.split(",")[1], "base64"),
    );
  }
  console.error(`[shader-tier] [${tier}] summary ${JSON.stringify(summary)}`);
  await page.close();
  return { summary, sm1Warnings };
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
