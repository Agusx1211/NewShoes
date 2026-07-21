#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/webxr-d3d8-replay");
const screenshotPath = resolve(
  process.env.WEBXR_REPLAY_SCREENSHOT
    ?? resolve(wasmRoot, "artifacts/screenshots/webxr-d3d8-window-replay.png"),
);
const timeoutMs = Math.max(30000, Number(process.env.WEBXR_REPLAY_TIMEOUT_MS ?? 15 * 60 * 1000));
const minimumPresentedFrames = Math.max(3,
  Number(process.env.WEBXR_REPLAY_MIN_PRESENTS ?? 30) >>> 0);
const executablePath = process.env.WEBXR_REPLAY_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
const browserArgs = (process.env.WEBXR_REPLAY_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const expectedRenderer = process.env.WEBXR_REPLAY_EXPECT_RENDERER?.trim().toLowerCase() ?? "";

function expect(condition, message, detail = null) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(detail)}`);
  }
}

async function captureViewport(page) {
  const result = await page.evaluate(() => window.CnCPort.rpc("screenshot"));
  const dataUrl = typeof result?.screenshot === "string"
    ? result.screenshot
    : result?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    "screenshot RPC returned no PNG", result);
  return Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
}

async function samplePng(page, png) {
  return page.evaluate(async (base64) => {
    const raw = atob(base64);
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const sample = document.createElement("canvas");
    sample.width = 96;
    sample.height = 60;
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let sum = 0;
    let sumSquared = 0;
    let maximum = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const luminance = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      sum += luminance;
      sumSquared += luminance * luminance;
      maximum = Math.max(maximum, luminance);
    }
    const count = pixels.length / 4;
    const mean = sum / count;
    return {
      mean,
      maximum,
      standardDeviation: Math.sqrt(Math.max(0, sumSquared / count - mean * mean)),
    };
  }, png.toString("base64"));
}

async function captureVisibleViewport(page, initialSequence) {
  const deadline = Date.now() + Math.min(timeoutMs, 120000);
  let sequence = Number(initialSequence) >>> 0;
  let png = null;
  let pixels = null;
  while (Date.now() < deadline) {
    png = await captureViewport(page);
    pixels = await samplePng(page, png);
    if (pixels.maximum > 24 && pixels.standardDeviation > 2) return { png, pixels };
    const nextSequence = sequence + 10;
    await page.waitForFunction((target) =>
      Number(window.CnCPort?.state?.webxr?.rendererTransport?.sequence ?? 0) >= target,
    nextSequence, { timeout: Math.max(1000, deadline - Date.now()), polling: 100 });
    sequence = nextSequence;
  }
  return { png, pixels };
}

await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
await mkdir(dirname(screenshotPath), { recursive: true });

const server = await startStaticServer({ root: wasmRoot, port: 0, host: "0.0.0.0" });
const browser = await chromium.launchPersistentContext(profileDir, {
  viewport: { width: 1280, height: 800 },
  ...(executablePath ? { executablePath } : {}),
  args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
});
const consoleErrors = [];

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const url = new URL(
    "harness/play.html?autostart=1&dist=dist-threaded&vr=1&shellmap=0&videos=0",
    server.url,
  );
  await page.goto(url.href, { waitUntil: "load" });
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: timeoutMs });
  await page.waitForFunction((minimumSequence) => {
    const transport = window.CnCPort?.state?.webxr?.rendererTransport;
    return transport?.active === true && transport.sequence >= minimumSequence;
  }, minimumPresentedFrames, { timeout: timeoutMs, polling: 250 });

  const state = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const gl = canvas?.getContext("webgl2") ?? null;
    const rendererInfo = gl?.getExtension("WEBGL_debug_renderer_info") ?? null;
    const transport = window.CnCPort?.state?.webxr?.rendererTransport ?? null;
    const graphics = window.CnCPort?.state?.graphics ?? null;
    return {
      crossOriginIsolated,
      threadedMode: window.CnCPort?.state?.threadedMode === true,
      transport,
      graphics: graphics ? {
        api: graphics.api,
        ok: graphics.ok,
        drawSequence: graphics.d3d8DrawIndexedSequence ?? 0,
      } : null,
      windowOwnsWebGl: gl instanceof WebGL2RenderingContext,
      windowRenderer: gl
        ? gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)
        : null,
    };
  });
  // The original shell deliberately begins with black title/fade frames. On a
  // loaded software renderer, a fixed Present count can reach that fade much
  // sooner than the shell animation. Keep consuming real frames until the
  // product has produced a meaningful image; the pixel assertion still fails
  // closed if it never does.
  const { png, pixels } = await captureVisibleViewport(page, state.transport.sequence);
  await writeFile(screenshotPath, png);

  expect(state.crossOriginIsolated === true, "threaded browser was not cross-origin isolated", state);
  expect(state.threadedMode === true, "engine did not run in pthread mode", state);
  expect(state.windowOwnsWebGl === true, "Window does not own the VR WebGL2 context", state);
  expect(state.transport?.active === true && state.transport.error == null,
    "D3D8 replay transport failed", state.transport);
  expect(state.transport.sequence >= minimumPresentedFrames && state.transport.commands > 0,
    "real Present packets did not reach the Window executor", state.transport);
  expect(state.graphics?.api === "webgl2" && state.graphics?.ok === true
      && state.graphics.drawSequence > 0,
  "Window executor did not replay real engine draws", state.graphics);
  expect(!expectedRenderer || state.windowRenderer?.toLowerCase().includes(expectedRenderer),
    `Window WebGL renderer does not contain ${expectedRenderer}`, state.windowRenderer);
  expect(png.length > 10 * 1024, "replayed viewport screenshot is unexpectedly small", png.length);
  expect(pixels.maximum > 24 && pixels.standardDeviation > 2,
    "replayed viewport lacks meaningful visible pixels", pixels);

  console.log(JSON.stringify({
    ok: true,
    smoke: "webxr-d3d8-threaded-replay",
    state,
    pixels,
    screenshotPath,
    screenshotBytes: png.length,
    consoleErrors: consoleErrors.slice(-20),
  }));
} finally {
  await browser.close();
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}
