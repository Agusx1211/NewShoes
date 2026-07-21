#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import {
  emulatedXrEyeSeparationMeters,
  installEmulatedWebXr,
} from "./webxr-emulator-init.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/webxr-bink-video");
const screenshotPath = resolve(
  process.env.WEBXR_BINK_SCREENSHOT
    ?? resolve(wasmRoot, "artifacts/screenshots/webxr-bink-video-stereo.png"),
);
const decoderRuntimeRoot = resolve(
  wasmRoot,
  "artifacts/bink-decoder-runtime/video-runtime",
);
const timeoutMs = Math.max(30000, Number(process.env.WEBXR_BINK_TIMEOUT_MS ?? 15 * 60 * 1000));
const dist = /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(process.env.WEBXR_BINK_DIST ?? "")
  ? process.env.WEBXR_BINK_DIST
  : "dist-threaded-release";
const executablePath = process.env.WEBXR_BINK_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
const browserArgs = (process.env.WEBXR_BINK_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const browserStagePrefix = "[webxr-bink-stage]";

function stage(message) {
  process.stdout.write(`[webxr-bink-video] ${message}\n`);
}

function decoderContentType(name) {
  if (name.endsWith(".wasm")) return "application/wasm";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
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
  page.setDefaultTimeout(timeoutMs);
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith(browserStagePrefix)) stage(text.slice(browserStagePrefix.length).trim());
    if (message.type() === "error") consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.addInitScript(installEmulatedWebXr);
  await page.route("**/video-runtime/*", async (route) => {
    const name = basename(new URL(route.request().url()).pathname);
    await route.fulfill({
      path: resolve(decoderRuntimeRoot, name),
      contentType: decoderContentType(name),
    });
  });

  const url = new URL(
    `harness/play.html?autostart=0&dist=${encodeURIComponent(dist)}&vr=1&shellmap=0&videos=1&diag=lite`,
    server.url,
  );
  stage("loading the shipping VR page");
  await page.goto(url.href, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(
    window.CnCPort?.rpc
      && window.ZeroHRuntime?.launch
      && window.ZeroHAssetLibrary
      && window.ZeroHArchiveSpecs?.length,
  ));

  stage("streaming the retail archive set and original EA logo movies into installed-library OPFS");
  const prepared = await page.evaluate(async () => {
    const installRoot = "cnc-library/install-webxr-bink";
    const root = await navigator.storage.getDirectory();
    const cncLibrary = await root.getDirectoryHandle("cnc-library", { create: true });
    const installDirectory = await cncLibrary.getDirectoryHandle("install-webxr-bink", { create: true });
    const movieDirectory = await installDirectory.getDirectoryHandle("movies", { create: true });
    const { parseBrowserBinkHeader } = await import("./bink_decoder.mjs");
    const encodePath = (path) => String(path).split("/").map(encodeURIComponent).join("/");

    async function streamFile(sourcePath, directory, targetName) {
      const sourceUrl = new URL(
        `../artifacts/real-assets/${encodePath(sourcePath)}`,
        document.baseURI,
      );
      const response = await fetch(sourceUrl, { cache: "no-store" });
      if (!response.ok || !response.body) {
        throw new Error(`${sourcePath}: retail asset fetch failed (${response.status})`);
      }
      const handle = await directory.getFileHandle(targetName, { create: true });
      const writable = await handle.createWritable();
      try {
        await response.body.pipeTo(writable);
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
      const stored = await handle.getFile();
      if (stored.size <= 4) throw new Error(`${targetName}: OPFS copy is unexpectedly small`);
      return stored;
    }

    const specs = [...window.ZeroHArchiveSpecs];
    const archives = new Array(specs.length);
    let completedArchives = 0;
    let nextArchive = 0;
    async function archiveWorker() {
      while (nextArchive < specs.length) {
        const index = nextArchive++;
        const spec = specs[index];
        const stored = await streamFile(
          spec.artifactSourceName ?? spec.sourceName ?? spec.name,
          installDirectory,
          spec.name,
        );
        archives[index] = {
          name: spec.name,
          sourceName: spec.sourceName ?? spec.name,
          opfsPath: `${installRoot}/${spec.name}`,
          bytes: stored.size,
        };
        completedArchives += 1;
        console.log(`[webxr-bink-stage] archives ${completedArchives}/${specs.length}: ${spec.name}`);
      }
    }
    await Promise.all(Array.from({ length: 3 }, archiveWorker));

    const videos = [];
    for (const name of ["EA_LOGO.BIK", "EA_LOGO640.BIK"]) {
      const stored = await streamFile(name, movieDirectory, name);
      const header = new Uint8Array(await stored.slice(0, 44).arrayBuffer());
      videos.push({
        name,
        opfsPath: `${installRoot}/movies/${name}`,
        bytes: stored.size,
        ...parseBrowserBinkHeader(header, stored.size),
      });
      console.log(`[webxr-bink-stage] movie staged: ${name}`);
    }

    document.documentElement.dataset.binkVideoSidecars = "direct";
    window.ZeroHAssetLibrary.preparedArchives = archives;
    window.ZeroHAssetLibrary.preparedVideos = videos;
    window.ZeroHAssetLibrary.includeVideos = true;
    return {
      archiveCount: archives.length,
      videoCount: videos.length,
      archiveBytes: archives.reduce((sum, archive) => sum + archive.bytes, 0),
      videoBytes: videos.reduce((sum, video) => sum + video.bytes, 0),
      videos: videos.map(({ name, bytes, signature, frames, width, height, fpsNum, fpsDen }) => ({
        name, bytes, signature, frames, width, height, fpsNum, fpsDen,
      })),
    };
  });
  assert.equal(prepared.archiveCount, 30, "the complete retail archive contract must be staged");
  assert.equal(prepared.videoCount, 2, "both EA logo resolution variants must be staged");

  stage("launching the real threaded engine through prepared OPFS mounts");
  await page.evaluate(() => window.ZeroHRuntime.launch());
  await page.waitForFunction(() => document.querySelector("#overlay")?.classList.contains("hidden")
    || document.querySelector("#progress")?.textContent?.startsWith("FAILED:"),
  null, { polling: 100 });
  const launch = await page.evaluate(() => ({
    running: document.querySelector("#overlay")?.classList.contains("hidden") === true,
    progress: document.querySelector("#progress")?.textContent ?? "",
    assets: (() => {
      const assets = window.CnCPort?.state?.binkVideoAssets;
      return assets ? {
        ready: assets.ready,
        mode: assets.mode,
        payloadCount: assets.payloadCount,
        fileCount: assets.files?.length ?? 0,
      } : null;
    })(),
  }));
  assert.equal(launch.running, true, `real threaded runtime failed to start: ${launch.progress}`);
  assert.equal(launch.assets?.ready, true,
    `direct Bink runtime assets were not staged: ${JSON.stringify(launch.assets)}`);

  await page.evaluate(() => window.CnCPort.rpc("realEngineStopMovie"));
  await page.waitForFunction(() =>
    (window.CnCPort?.state?.threadedEngine?.bink?.activeHandles ?? 0) === 0,
  null, { polling: 100 });
  const support = await page.evaluate(() => window.CnCPort.probeWebXrSession());
  assert.equal(support.support?.immersiveVrSupported, true,
    `emulated immersive session was not available: ${JSON.stringify(support)}`);
  await page.evaluate(() => window.CnCPort.startWebXrSession());
  await page.waitForFunction(() => {
    const xr = window.CnCPort?.getWebXrState?.();
    return xr?.phase === "running" && xr.renderer?.active === true && xr.viewCount === 2;
  }, null, { polling: 100 });
  stage("immersive stereo session started; asking the original engine to play EALogoMovie");

  const beforeMovie = await page.evaluate(() => ({
    ...(window.CnCPort.state.threadedEngine?.bink ?? {}),
  }));
  const play = await page.evaluate(() =>
    window.CnCPort.rpc("realEnginePlayMovie", { name: "EALogoMovie" }));
  assert.equal(play?.result?.moviePlaying, true,
    `the original engine did not start EALogoMovie: ${JSON.stringify(play)}`);
  await page.waitForFunction(({ framesReceived, copies }) => {
    const bink = window.CnCPort?.state?.threadedEngine?.bink;
    const xr = window.CnCPort?.getWebXrState?.();
    return bink?.activeHandles > 0
      && bink.framesReceived >= framesReceived + 2
      && bink.copies >= copies + 2
      && bink.bytesCopied > 0
      && xr?.phase === "running"
      && xr.viewCount === 2
      && xr.renderer?.active === true
      && xr.renderer?.error == null
      && xr.renderer?.uiDraws > 0;
  }, {
    framesReceived: Number(beforeMovie.framesReceived ?? 0),
    copies: Number(beforeMovie.copies ?? 0),
  }, { polling: 50 });

  const frame = await page.evaluate(() => window.CnCPort.rpc(
    "realEngineFrameSummary", { frames: 1 },
  ));
  assert.equal(frame?.frame?.display?.moviePlaying, true,
    `frame summary lost active movie ownership: ${JSON.stringify(frame)}`);

  stage("reading the active movie from both compositor eye buffers");
  const stereoCapture = await page.evaluate(async () => {
    const session = window.__emulatedXrSession;
    const canvas = document.querySelector("#viewport");
    const gl = canvas?.getContext("webgl2");
    const layer = session?.renderState?.baseLayer;
    if (!gl || !layer?.framebuffer) throw new Error("active emulated XR framebuffer is unavailable");
    const width = layer.framebufferWidth;
    const height = layer.framebufferHeight;
    function eyeStats(pixels, startX, eyeWidth) {
      let luminanceSum = 0;
      let luminanceSquaredSum = 0;
      let maximum = 0;
      let nonBlack = 0;
      let hash = 2166136261;
      const count = eyeWidth * height;
      for (let y = 0; y < height; y += 1) {
        for (let x = startX; x < startX + eyeWidth; x += 1) {
          const offset = (y * width + x) * 4;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const luminance = (red + green + blue) / 3;
          luminanceSum += luminance;
          luminanceSquaredSum += luminance * luminance;
          maximum = Math.max(maximum, red, green, blue);
          if (red > 4 || green > 4 || blue > 4) nonBlack += 1;
          hash ^= red;
          hash = Math.imul(hash, 16777619);
          hash ^= green;
          hash = Math.imul(hash, 16777619);
          hash ^= blue;
          hash = Math.imul(hash, 16777619);
        }
      }
      const mean = luminanceSum / count;
      return {
        mean,
        maximum,
        standardDeviation: Math.sqrt(
          Math.max(0, luminanceSquaredSum / count - mean * mean),
        ),
        nonBlack,
        nonBlackFraction: nonBlack / count,
        hash: (hash >>> 0).toString(16).padStart(8, "0"),
      };
    }

    function pngDataUrl(pixels) {
      const source = document.createElement("canvas");
      source.width = width;
      source.height = height;
      source.getContext("2d").putImageData(new ImageData(
        new Uint8ClampedArray(pixels.buffer), width, height,
      ), 0, 0);
      const flipped = document.createElement("canvas");
      flipped.width = width;
      flipped.height = height;
      const context = flipped.getContext("2d");
      context.translate(0, height);
      context.scale(1, -1);
      context.drawImage(source, 0, 0);
      return flipped.toDataURL("image/png");
    }

    function capture() {
      const pixels = new Uint8Array(width * height * 4);
      const priorFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.finish();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, priorFramebuffer);

      const halfWidth = Math.floor(width / 2);
      return {
        pixels,
        result: {
          width,
          height,
          left: eyeStats(pixels, 0, halfWidth),
          right: eyeStats(pixels, halfWidth, width - halfWidth),
          xr: window.CnCPort.getWebXrState(),
          stereo: window.__emulatedXrStereo,
          bink: window.CnCPort.state.threadedEngine?.bink ?? null,
        },
      };
    }

    const deadline = performance.now() + 6000;
    let captureResult = capture();
    while (performance.now() < deadline) {
      const eyesVisible = [captureResult.result.left, captureResult.result.right].every((stats) =>
        stats.nonBlackFraction > 0.005
          && stats.standardDeviation > 3
          && stats.maximum > 32);
      if (eyesVisible && captureResult.result.bink?.activeHandles > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
      captureResult = capture();
    }
    captureResult.result.dataUrl = pngDataUrl(captureResult.pixels);
    return captureResult.result;
  });
  const screenshotPrefix = "data:image/png;base64,";
  assert.ok(stereoCapture.dataUrl.startsWith(screenshotPrefix),
    "stereo framebuffer capture did not produce a PNG");
  await writeFile(
    screenshotPath,
    Buffer.from(stereoCapture.dataUrl.slice(screenshotPrefix.length), "base64"),
  );
  delete stereoCapture.dataUrl;

  for (const [eye, stats] of [["left", stereoCapture.left], ["right", stereoCapture.right]]) {
    assert.ok(stats.nonBlackFraction > 0.005,
      `${eye} eye contains too few visible movie pixels: ${JSON.stringify(stats)}`);
    assert.ok(stats.standardDeviation > 3 && stats.maximum > 32,
      `${eye} eye is flat while the movie is active: ${JSON.stringify(stats)}`);
  }
  assert.ok(stereoCapture.bink?.activeHandles > 0,
    `the visible eye-buffer evidence outlived movie ownership: ${JSON.stringify(stereoCapture.bink)}`);
  assert.equal(stereoCapture.xr.viewCount, 2, "the movie frame was not rendered for two XR views");
  assert.ok(stereoCapture.xr.renderer?.uiDraws > 0,
    "the original screen-space movie draw did not reach the spatial UI compositor");
  assert.equal(stereoCapture.xr.renderer?.error, null,
    `native VR renderer failed during movie playback: ${stereoCapture.xr.renderer?.error}`);
  const eyeSeparationMeters = emulatedXrEyeSeparationMeters(stereoCapture.stereo);
  assert.ok(Math.abs(eyeSeparationMeters - 0.064) < 0.000001,
    `emulated compositor eye transforms are not distinct: ${JSON.stringify(stereoCapture.stereo)}`);

  const stop = await page.evaluate(() => window.CnCPort.rpc("realEngineStopMovie"));
  await page.waitForFunction(() =>
    (window.CnCPort?.state?.threadedEngine?.bink?.activeHandles ?? 0) === 0,
  null, { polling: 100 });
  await page.evaluate(() => window.CnCPort.stopWebXrSession("webxr-bink-video-smoke"));
  const exit = await page.evaluate(() => window.ZeroHRuntime.exit());
  assert.equal(exit?.ok, true, `runtime shutdown failed: ${JSON.stringify(exit)}`);
  assert.equal(stop?.result?.moviePlaying, false,
    `Display::stopMovie did not stop the decoder: ${JSON.stringify(stop)}`);

  console.log(JSON.stringify({
    ok: true,
    smoke: "webxr-bink-video",
    dist,
    prepared,
    launch,
    play,
    bink: stereoCapture.bink,
    xr: stereoCapture.xr,
    eyes: { left: stereoCapture.left, right: stereoCapture.right },
    eyeSeparationMeters,
    screenshotPath,
    stop,
    exit,
    consoleErrors: consoleErrors.slice(-20),
  }));
} finally {
  await browser.close();
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}
