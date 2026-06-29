import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

const defaultGcPath = resolve(wasmRoot, "artifacts/real-assets/GC_Background.bik");
const defaultVsPath = resolve(wasmRoot, "artifacts/real-assets/VS_small.bik");
const defaultManifestPath = resolve(
  wasmRoot,
  "artifacts/browser-video/bink/bink-browser-video-manifest.json",
);

const gcPath = resolve(wasmRoot, process.argv[2] ?? defaultGcPath);
const vsPath = resolve(wasmRoot, process.argv[3] ?? defaultVsPath);
const manifestPath = resolve(wasmRoot, process.argv[4] ?? defaultManifestPath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(screenshotDir, "harness-smoke-bink-provider-sidecar-video.png");

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

for (const [path, label] of [
  [gcPath, "GC_Background.bik"],
  [vsPath, "VS_small.bik"],
  [manifestPath, "Bink browser video manifest"],
]) {
  assertInsideWasm(path, label);
  const s = await stat(path);
  if (!s.isFile() || s.size <= 0) {
    throw new Error(`${label} is not a readable file: ${path}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!manifest.ok || manifest.schema !== "cnc-zh-bink-browser-video-manifest/v1") {
  throw new Error(`Unexpected Bink browser manifest state: ${JSON.stringify(manifest)}`);
}

const payloads = manifest.payloads.map((payload) => {
  const outputPath = resolve(payload.outputPath);
  assertInsideWasm(outputPath, `${payload.name} output video`);
  return {
    name: payload.name,
    outputPath,
    relativeOutputPath: relative(wasmRoot, outputPath).split(sep).join("/"),
    width: payload.width,
    height: payload.height,
    outputDurationSeconds: payload.outputDurationSeconds,
    outputAudioCodecs: payload.outputAudioCodecs,
  };
});

await mkdir(screenshotDir, { recursive: true });

const gcBytes = await readFile(gcPath);
const vsBytes = await readFile(vsPath);
const manifestBytes = await readFile(manifestPath);

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

  const moduleUrl = new URL("dist/bink-video-provider-browser-smoke.js", server.url).href;
  const providerResult = await page.evaluate(async ({ moduleUrl, gcBytes, vsBytes, manifestText }) => {
    function ensureDirectory(fs, path) {
      const parts = path.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current += `/${part}`;
        try {
          fs.mkdir(current);
        } catch (error) {
          if (error?.code !== "EEXIST") {
            throw error;
          }
        }
      }
    }

    const moduleExports = await import(moduleUrl);
    const createModule =
      moduleExports.default ?? moduleExports.createBinkVideoProviderBrowserSmokeModule;
    const distUrl = new URL("../dist/", window.location.href).href;
    const module = await createModule({
      locateFile: (path) => new URL(path, distUrl).href,
    });

    ensureDirectory(module.FS, "artifacts/real-assets");
    ensureDirectory(module.FS, "artifacts/browser-video/bink");
    module.FS.writeFile("artifacts/real-assets/GC_Background.bik", new Uint8Array(gcBytes));
    module.FS.writeFile("artifacts/real-assets/VS_small.bik", new Uint8Array(vsBytes));
    module.FS.writeFile(
      "artifacts/browser-video/bink/bink-browser-video-manifest.json",
      manifestText,
    );

    const status = module.ccall(
      "run_bink_video_sidecar_provider_smoke",
      "number",
      ["string", "string"],
      ["artifacts/real-assets/GC_Background.bik", "artifacts/real-assets/VS_small.bik"],
    );
    return { ok: status === 0, status };
  }, {
    moduleUrl,
    gcBytes: Array.from(gcBytes),
    vsBytes: Array.from(vsBytes),
    manifestText: manifestBytes.toString("utf8"),
  });

  if (!providerResult.ok) {
    throw new Error(`Bink provider sidecar smoke failed: ${JSON.stringify(providerResult)}`);
  }

  const videoPayloads = payloads.map((payload) => ({
    ...payload,
    url: new URL(payload.relativeOutputPath, server.url).href,
  }));

  const videoResults = await page.evaluate(async (items) => {
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
        canPlayType,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        currentTimeAfterSeek: video.currentTime,
        seekTarget,
        canvasChecksum: checksum,
        nonTransparentSamples,
      };
    }

    document.body.style.margin = "0";
    document.body.style.background = "#202020";
    document.body.innerHTML = "";

    const out = [];
    for (const item of items) {
      out.push(await exerciseVideo(item));
    }
    return out;
  }, videoPayloads);

  for (const result of videoResults) {
    const expected = payloads.find((payload) => payload.name === result.name);
    if (!expected) {
      throw new Error(`Unexpected provider sidecar browser video result: ${JSON.stringify(result)}`);
    }
    if (result.canPlayType === "") {
      throw new Error(`${result.name}: Chromium reports it cannot play VP9 WebM`);
    }
    if (result.videoWidth !== expected.width || result.videoHeight !== expected.height) {
      throw new Error(`${result.name}: dimensions ${result.videoWidth}x${result.videoHeight} !== ${expected.width}x${expected.height}`);
    }
    if (!nearlyEqual(result.duration, expected.outputDurationSeconds)) {
      throw new Error(`${result.name}: duration ${result.duration} !== ${expected.outputDurationSeconds}`);
    }
    if (!nearlyEqual(result.currentTimeAfterSeek, result.seekTarget)) {
      throw new Error(`${result.name}: seek ${result.currentTimeAfterSeek} !== ${result.seekTarget}`);
    }
    if (result.nonTransparentSamples <= 0) {
      throw new Error(`${result.name}: decoded frame was not readable from canvas`);
    }
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    source: "WebAssembly/harness/bink_provider_sidecar_browser_smoke.mjs",
    providerResult,
    manifestPath,
    screenshotPath,
    payloads: videoResults,
    browserEvents,
  }, null, 2));
} catch (error) {
  throw new Error(
    `Bink provider sidecar browser smoke failed: ${error?.message ?? String(error)}; ` +
    `browser events: ${JSON.stringify(browserEvents)}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
