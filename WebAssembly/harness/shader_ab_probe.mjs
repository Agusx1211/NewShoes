#!/usr/bin/env node
// Shader-tier A/B comparator.
//
// Boots play.html twice on the same build — shaderTier=ff and shaderTier=ps11
// — and captures canvas screenshots at the SAME shellmap logic frames (the
// intro is scripted and logic-deterministic), then pixel-diffs each pair.
// Output: per-milestone diff stats + side-by-side PNGs for eyeballing, so
// per-shader fidelity regressions show up as measurable, reviewable deltas
// instead of relying on someone noticing them in play.
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
const outDir = process.env.CNC_PROBE_OUT ?? "/tmp/cnc-shader-ab";
mkdirSync(outDir, { recursive: true });

// Shellmap intro logic-frame milestones (30 LF/s): water pan, battleship
// bombardment, beach assault, land battle.
const MILESTONES = (process.env.CNC_AB_MILESTONES ?? "150,400,700,1000,1400,1900")
  .split(",").map((value) => Number(value.trim())).filter((value) => value > 0);

setTimeout(() => {
  console.error("[shader-ab] WATCHDOG: 30 minutes elapsed");
  process.exit(3);
}, 30 * 60 * 1000).unref();

const extraArgs = (process.env.CNC_CHROMIUM_ARGS ?? "")
  .split(",").map((arg) => arg.trim()).filter(Boolean);
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1400,940", ...extraArgs],
});

async function captureTier(tier) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (error) => console.error(`[shader-ab] [${tier}] pageerror`, error.message));
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
  console.error(`[shader-ab] [${tier}] booting...`);
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: 600_000 });

  const shots = {};
  for (const milestone of MILESTONES) {
    const reached = await page.evaluate(async (target) => {
      const readLogicFrame = async () => {
        for (const command of ["realEngineFrameSummary", "realEngineFrame"]) {
          try {
            const result = await window.CnCPort.rpc(command, { frames: 0 });
            const match = JSON.stringify(result ?? {}).match(/"logicFrame":(\d+)/);
            if (match) {
              return Number(match[1]);
            }
          } catch { /* try next */ }
        }
        return -1;
      };
      const deadline = Date.now() + 240_000;
      while (Date.now() < deadline) {
        const logicFrame = await readLogicFrame();
        if (logicFrame >= target) {
          return logicFrame;
        }
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
      }
      return -1;
    }, milestone);
    if (reached < 0) {
      console.error(`[shader-ab] [${tier}] TIMEOUT waiting for LF ${milestone}`);
      continue;
    }
    const dataUrl = await page.evaluate(async () => {
      const result = await window.CnCPort.rpc("screenshot", {});
      return result?.screenshot?.dataUrl ?? null;
    });
    if (dataUrl) {
      shots[milestone] = { dataUrl, atLogicFrame: reached };
      writeFileSync(
        resolve(outDir, `lf${milestone}-${tier}.png`),
        Buffer.from(dataUrl.split(",")[1], "base64"),
      );
      console.error(`[shader-ab] [${tier}] captured LF ${milestone} (at ${reached})`);
    }
  }
  const perf = await page.evaluate(() => globalThis.__cncD3D8PerfSummary?.() ?? {});
  await page.close();
  return { shots, perf };
}

function pickSm1(perf) {
  return {
    ps: perf.sm1PixelShadersRegistered ?? 0,
    vs: perf.sm1VertexShadersRegistered ?? 0,
    pairs: perf.sm1PairProgramsLinked ?? 0,
    failures: perf.sm1PairProgramFailures ?? 0,
    shaderDraws: perf.sm1ShaderDraws ?? 0,
    fallbacks: perf.sm1FallbackDraws ?? 0,
  };
}

try {
  const ff = await captureTier("ff");
  const ps11 = await captureTier("ps11");
  console.error(`[shader-ab] ff sm1=${JSON.stringify(pickSm1(ff.perf))}`);
  console.error(`[shader-ab] ps11 sm1=${JSON.stringify(pickSm1(ps11.perf))}`);

  // Diff each milestone pair in a plain page (no node-side PNG dependency).
  const diffPage = await browser.newPage();
  const results = [];
  for (const milestone of MILESTONES) {
    const a = ff.shots[milestone];
    const b = ps11.shots[milestone];
    if (!a || !b) {
      results.push({ milestone, error: "missing capture" });
      continue;
    }
    const stats = await diffPage.evaluate(async ({ urlA, urlB }) => {
      const load = (src) => new Promise((resolveImage, rejectImage) => {
        const image = new Image();
        image.onload = () => resolveImage(image);
        image.onerror = rejectImage;
        image.src = src;
      });
      const [imageA, imageB] = await Promise.all([load(urlA), load(urlB)]);
      if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
        return { error: `size mismatch ${imageA.width}x${imageA.height} vs ${imageB.width}x${imageB.height}` };
      }
      const canvas = document.createElement("canvas");
      canvas.width = imageA.width;
      canvas.height = imageA.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(imageA, 0, 0);
      const dataA = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.drawImage(imageB, 0, 0);
      const dataB = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let sumAbs = 0;
      let changed = 0;
      const pixelCount = canvas.width * canvas.height;
      for (let index = 0; index < dataA.length; index += 4) {
        const delta = Math.abs(dataA[index] - dataB[index]) +
          Math.abs(dataA[index + 1] - dataB[index + 1]) +
          Math.abs(dataA[index + 2] - dataB[index + 2]);
        sumAbs += delta;
        if (delta > 24) {
          changed += 1;
        }
      }
      return {
        meanAbsDiff: Number((sumAbs / (pixelCount * 3)).toFixed(2)),
        pctChanged: Number(((changed / pixelCount) * 100).toFixed(2)),
      };
    }, { urlA: a.dataUrl, urlB: b.dataUrl });
    results.push({ milestone, atFf: a.atLogicFrame, atPs11: b.atLogicFrame, ...stats });
    console.error(`[shader-ab] LF ${milestone}: ${JSON.stringify(stats)}`);
  }
  writeFileSync(resolve(outDir, "ab-report.json"), JSON.stringify({
    milestones: results,
    ff: pickSm1(ff.perf),
    ps11: pickSm1(ps11.perf),
  }, null, 2));
  console.error(`[shader-ab] report + screenshots in ${outDir}`);
} finally {
  await browser.close();
  await server?.close?.();
}
