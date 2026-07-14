import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const siteRoot = resolve(process.argv[2] || "pages-dist");
const sourcePath = resolve(process.argv[3] || "artifacts/real-assets/EA_LOGO640.BIK");
const screenshotPath = process.env.BINK_HOSTED_TRANSCODE_SCREENSHOT
  ? resolve(process.env.BINK_HOSTED_TRANSCODE_SCREENSHOT) : null;
const browserArgs = JSON.parse(process.env.BINK_HOSTED_BROWSER_ARGS || "[]");
if (!Array.isArray(browserArgs) || !browserArgs.every((arg) => typeof arg === "string")) {
  throw new Error("BINK_HOSTED_BROWSER_ARGS must be a JSON array of Chromium arguments");
}
const expectedRenderer = String(process.env.BINK_HOSTED_EXPECT_RENDERER || "").trim();
const sourceName = basename(sourcePath);
const sourceBytes = await readFile(sourcePath);
if (!(await stat(siteRoot)).isDirectory() || sourceBytes.byteLength <= 44) {
  throw new Error("Hosted Bink smoke requires a built site and a readable classic Bink movie");
}
if (screenshotPath) await mkdir(resolve(screenshotPath, ".."), { recursive: true });

const server = await startStaticServer({ root: siteRoot });
const browser = await chromium.launch({ headless: true, args: browserArgs });
const context = await browser.newContext();
const page = await context.newPage({ viewport: { width: 900, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
await page.route("**/__hosted_bink_source", (route) => route.fulfill({
  status: 200,
  contentType: "application/octet-stream",
  body: sourceBytes,
}));

try {
  await page.goto(new URL("legal.html", server.url).href, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async ({ sourceName }) => {
    const rendererCanvas = document.createElement("canvas");
    const gl = rendererCanvas.getContext("webgl2");
    const rendererExtension = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = rendererExtension
      ? gl.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL)
      : gl?.getParameter(gl.RENDERER) ?? null;
    const module = await import("./harness/bink_transcoder.mjs");
    const runtimeModule = await import("./harness/bink_runtime.mjs");
    const sourceResponse = await fetch("/__hosted_bink_source");
    const source = new Uint8Array(await sourceResponse.arrayBuffer());
    const header = module.parseBrowserBinkHeader(source, source.byteLength);
    const installName = "install-hosted-bink-smoke";
    const sourcePath = `cnc-library/${installName}/movies/${sourceName}`;

    async function directory(path, create = false) {
      let handle = await navigator.storage.getDirectory();
      for (const part of path.split("/").filter(Boolean)) {
        handle = await handle.getDirectoryHandle(part, { create });
      }
      return handle;
    }

    async function writeSource() {
      const movies = await directory(`cnc-library/${installName}/movies`, true);
      const handle = await movies.getFileHandle(sourceName, { create: true });
      const writer = await handle.createWritable({ keepExistingData: false });
      await writer.write(source);
      await writer.close();
    }

    function waitForMedia(element, eventName, timeoutMs = 10000) {
      return new Promise((resolveEvent, rejectEvent) => {
        const timer = setTimeout(() => {
          cleanup();
          rejectEvent(new Error(`${eventName} timed out`));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timer);
          element.removeEventListener(eventName, loaded);
          element.removeEventListener("error", failed);
        };
        const loaded = () => { cleanup(); resolveEvent(); };
        const failed = () => { cleanup(); rejectEvent(new Error(`media error ${element.error?.code ?? "unknown"}`)); };
        element.addEventListener(eventName, loaded, { once: true });
        element.addEventListener("error", failed, { once: true });
      });
    }

    await writeSource();
    const progress = [];
    let cancelNextConversion = true;
    let transcoder;
    transcoder = module.createBinkTranscoder({
      onProgress: (detail) => {
        progress.push({
          phase: detail.phase,
          progress: Number.isFinite(detail.progress) ? detail.progress : null,
        });
        if (cancelNextConversion && detail.phase === "video") {
          cancelNextConversion = false;
          transcoder.cancelActive();
        }
      },
    });
    transcoder.registerSources([{
      name: sourceName,
      opfsPath: sourcePath,
      bytes: source.byteLength,
      ...header,
    }]);
    const payload = { sourcePath: `Data/English/Movies/${sourceName}` };
    let cancellation = null;
    try {
      await transcoder.mediaFor(payload);
    } catch (error) {
      cancellation = { name: error?.name, message: error?.message };
    }
    if (cancellation?.name !== "AbortError") {
      throw new Error(`Hosted conversion cancellation did not abort: ${JSON.stringify(cancellation)}`);
    }
    const first = await transcoder.mediaFor(payload);
    if (!first?.videoUrl) throw new Error("Hosted conversion returned no video");

    const heading = document.createElement("h1");
    heading.textContent = `Hosted movie prepared: ${sourceName}`;
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.src = first.videoUrl;
    await waitForMedia(video, "loadedmetadata");
    video.currentTime = Math.min(1, Math.max(0, video.duration / 2));
    await waitForMedia(video, "seeked");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const drawing = canvas.getContext("2d", { willReadFrequently: true });
    drawing.drawImage(video, 0, 0);
    const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
    let rgbChecksum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      rgbChecksum = (rgbChecksum + pixels[index] + pixels[index + 1] * 3 + pixels[index + 2] * 7) >>> 0;
    }

    let audio = null;
    if (first.audioUrl) {
      const element = document.createElement("audio");
      element.preload = "auto";
      element.src = first.audioUrl;
      await waitForMedia(element, "loadedmetadata");
      await element.play();
      const startedAt = performance.now();
      while (element.currentTime <= 0.02 && performance.now() - startedAt < 3000) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      }
      element.pause();
      audio = {
        duration: element.duration,
        readyState: element.readyState,
        played: element.currentTime > 0.02,
      };
    }
    const summary = document.createElement("p");
    summary.textContent = `${canvas.width}×${canvas.height} · ${video.duration.toFixed(2)}s video`
      + (audio ? ` · ${audio.duration.toFixed(2)}s audio` : " · no audio track");
    document.body.replaceChildren(heading, canvas, summary);

    first.revoke();
    let runtimeCached = null;
    let runtimeReady = null;
    let runtimeFrame = null;
    let playbackRuntime = null;
    const runtimeComplete = new Promise((resolveRuntime, rejectRuntime) => {
      const timeout = setTimeout(() => rejectRuntime(new Error("Bink runtime frame timed out")), 10000);
      const finish = () => {
        if (!runtimeReady || !runtimeFrame) return;
        clearTimeout(timeout);
        resolveRuntime();
      };
      playbackRuntime = runtimeModule.createBinkVideoRuntime({
        resolveMedia: async (runtimePayload, options) => {
          const media = await transcoder.mediaFor(runtimePayload, options);
          runtimeCached = media?.cached === true;
          return media;
        },
        onPreparation: (detail) => {
          if (detail.phase === "ready") {
            runtimeReady = detail;
            finish();
          }
        },
        sendFrame: ({ frameNum, width, height, bytes }) => {
          let checksum = 0;
          for (let index = 0; index < bytes.byteLength; index += 4) {
            checksum = (checksum + bytes[index] + bytes[index + 1] * 3 + bytes[index + 2] * 7) >>> 0;
          }
          if (checksum > 0) {
            runtimeFrame = { frameNum, width, height, checksum };
            finish();
          }
        },
      });
      playbackRuntime.open({
        handle: 1,
        sourcePath: payload.sourcePath,
        videoPath: "unused.webm",
        width: header.width,
        height: header.height,
        frames: header.frames,
        durationSeconds: header.durationSeconds,
      });
    });
    await runtimeComplete;
    playbackRuntime.shutdown();
    const cacheDirectory = await directory(`cnc-library/${installName}/browser-video`);
    const cacheFiles = [];
    for await (const [name, handle] of cacheDirectory.entries()) {
      if (handle.kind === "file") cacheFiles.push(name);
    }
    const result = {
      renderer,
      header,
      cancellation,
      firstCached: first.cached,
      runtimeCached,
      runtimeReady,
      runtimeFrame,
      video: {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        rgbChecksum,
      },
      audio,
      cacheFiles: cacheFiles.sort(),
      progress,
    };
    transcoder.shutdown();
    const root = await navigator.storage.getDirectory();
    const library = await root.getDirectoryHandle("cnc-library");
    await library.removeEntry(installName, { recursive: true });
    return result;
  }, { sourceName });

  const durationDelta = Math.abs(result.video.duration - result.header.durationSeconds);
  if ((expectedRenderer && !result.renderer?.toLowerCase().includes(expectedRenderer.toLowerCase()))
      || result.cancellation?.name !== "AbortError"
      || result.firstCached !== false || result.runtimeCached !== true
      || result.runtimeReady?.phase !== "ready"
      || result.runtimeFrame?.width !== result.header.width
      || result.runtimeFrame?.height !== result.header.height
      || result.runtimeFrame?.checksum === 0
      || result.video.width !== result.header.width || result.video.height !== result.header.height
      || durationDelta > 0.25 || result.video.rgbChecksum === 0
      || !result.progress.some(({ phase }) => phase === "video")
      || (result.header.audioTracks > 0
        && (!result.audio || result.audio.played !== true
          || Math.abs(result.audio.duration - result.header.durationSeconds) > 0.25
          || !result.progress.some(({ phase }) => phase === "audio")
          || !result.cacheFiles.some((name) => name.endsWith(".wav"))))
      || !result.cacheFiles.some((name) => name.endsWith(".webm"))) {
    throw new Error(`Hosted Bink conversion failed: ${JSON.stringify(result)}`);
  }
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  if (errors.length) throw new Error(`Unexpected browser errors:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ ok: true, sourceName, ...result }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
