import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultManifestPath = resolve(
  wasmRoot,
  "artifacts/browser-video/bink/bink-browser-video-manifest.json",
);
const manifestPath = resolve(wasmRoot, process.argv[2] ?? defaultManifestPath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(screenshotDir, "harness-smoke-bink-browser-video.png");

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function assertInsideWasm(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
}

function nearlyEqual(left, right, epsilon = 0.15) {
  return Math.abs(Number(left) - Number(right)) <= epsilon;
}

assertInsideWasm(manifestPath, "Bink browser video manifest");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!manifest.ok) {
  throw new Error(`Bink browser video manifest is not ok: ${JSON.stringify(manifest.errors ?? [])}`);
}
if (manifest.schema !== "cnc-zh-bink-browser-video-manifest/v1") {
  throw new Error(`Unexpected Bink browser video manifest schema: ${manifest.schema}`);
}
if (!Array.isArray(manifest.payloads) || manifest.payloads.length !== 2) {
  throw new Error(`Expected exactly two Bink browser video payloads, got ${manifest.payloads?.length}`);
}

const payloads = [];
for (const payload of manifest.payloads) {
  const outputPath = resolve(payload.outputPath);
  assertInsideWasm(outputPath, `${payload.name} output video`);
  const outputStat = await stat(outputPath);
  if (!outputStat.isFile() || outputStat.size <= 0) {
    throw new Error(`${payload.name} output video is not a readable file: ${outputPath}`);
  }
  payloads.push({
    name: payload.name,
    outputPath,
    relativeOutputPath: relative(wasmRoot, outputPath).split(sep).join("/"),
    width: payload.width,
    height: payload.height,
    frames: payload.frames,
    fpsNum: payload.fpsNum,
    fpsDen: payload.fpsDen,
    outputDurationSeconds: payload.outputDurationSeconds,
    outputVideoCodec: payload.outputVideoCodec,
    outputAudioCodecs: payload.outputAudioCodecs,
  });
}

await mkdir(screenshotDir, { recursive: true });

const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });

  const videoPayloads = payloads.map((payload) => ({
    ...payload,
    url: new URL(payload.relativeOutputPath, server.url).href,
  }));

  const results = await page.evaluate(async (items) => {
    function waitForEvent(target, eventName, timeoutMs) {
      return new Promise((resolveEvent, rejectEvent) => {
        const timeout = setTimeout(() => {
          cleanup();
          rejectEvent(new Error(`${eventName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timeout);
          target.removeEventListener(eventName, onEvent);
          target.removeEventListener("error", onError);
        };
        const onEvent = () => {
          cleanup();
          resolveEvent();
        };
        const onError = () => {
          cleanup();
          rejectEvent(new Error(`${eventName} failed: video error ${target.error?.code ?? "unknown"}`));
        };
        target.addEventListener(eventName, onEvent, { once: true });
        target.addEventListener("error", onError, { once: true });
      });
    }

    async function waitUntil(predicate, timeoutMs, label) {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        if (predicate()) {
          return;
        }
        await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 25));
      }
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    async function exerciseVideo(item) {
      const wrapper = document.createElement("section");
      wrapper.style.cssText =
        "display:inline-block;margin:8px;padding:8px;border:1px solid #333;background:#111;color:#eee;font:12px sans-serif";
      const label = document.createElement("div");
      label.textContent = item.name;
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.controls = true;
      video.style.width = `${Math.max(160, Math.min(400, item.width))}px`;
      video.style.height = "auto";
      wrapper.append(label, video);
      document.body.append(wrapper);

      const codecString = item.outputAudioCodecs.length > 0
        ? 'video/webm; codecs="vp9, opus"'
        : 'video/webm; codecs="vp9"';
      const canPlayType = video.canPlayType(codecString);
      video.src = item.url;
      await waitForEvent(video, "loadedmetadata", 10000);
      await waitForEvent(video, "canplay", 10000);

      await video.play();
      await waitUntil(() => video.currentTime > 0.05, 5000, `${item.name} playback`);
      video.pause();

      const seekTarget = Math.min(
        Math.max(0.1, item.outputDurationSeconds / 2),
        Math.max(0.1, video.duration - 0.1),
      );
      video.currentTime = seekTarget;
      await waitForEvent(video, "seeked", 10000);

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(64, video.videoWidth);
      canvas.height = Math.min(64, video.videoHeight);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let checksum = 0;
      let nonTransparentSamples = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        checksum = (checksum + pixels[i] + pixels[i + 1] * 3 + pixels[i + 2] * 7 + pixels[i + 3] * 11) >>> 0;
        if (pixels[i + 3] > 0) {
          nonTransparentSamples += 1;
        }
      }

      return {
        name: item.name,
        url: item.url,
        canPlayType,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        currentTimeAfterSeek: video.currentTime,
        seekTarget,
        paused: video.paused,
        canvasReadable: true,
        canvasChecksum: checksum,
        nonTransparentSamples,
      };
    }

    const body = document.body;
    body.style.margin = "0";
    body.style.background = "#202020";
    body.innerHTML = "";

    const out = [];
    for (const item of items) {
      out.push(await exerciseVideo(item));
    }
    return out;
  }, videoPayloads);

  for (const result of results) {
    const expected = payloads.find((payload) => payload.name === result.name);
    if (!expected) {
      throw new Error(`Unexpected Bink browser video result: ${JSON.stringify(result)}`);
    }
    if (result.canPlayType === "") {
      throw new Error(`${result.name}: Chromium reports it cannot play VP9 WebM`);
    }
    if (result.videoWidth !== expected.width || result.videoHeight !== expected.height) {
      throw new Error(
        `${result.name}: video dimensions ${result.videoWidth}x${result.videoHeight} !== ` +
        `${expected.width}x${expected.height}`,
      );
    }
    if (!nearlyEqual(result.duration, expected.outputDurationSeconds)) {
      throw new Error(`${result.name}: duration ${result.duration} !== ${expected.outputDurationSeconds}`);
    }
    if (!nearlyEqual(result.currentTimeAfterSeek, result.seekTarget)) {
      throw new Error(`${result.name}: seek result ${result.currentTimeAfterSeek} !== ${result.seekTarget}`);
    }
    if (!result.canvasReadable || result.nonTransparentSamples <= 0) {
      throw new Error(`${result.name}: decoded frame was not readable from canvas`);
    }
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(JSON.stringify({
    ok: true,
    source: "WebAssembly/harness/bink_browser_video_smoke.mjs",
    manifestPath,
    screenshotPath,
    payloads: results,
    browserEvents,
  }, null, 2));
} catch (error) {
  throw new Error(
    `Bink browser video sidecar smoke failed: ${error?.message ?? String(error)}; ` +
    `browser events: ${JSON.stringify(browserEvents)}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
