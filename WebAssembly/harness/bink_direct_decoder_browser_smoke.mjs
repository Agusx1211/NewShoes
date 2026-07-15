import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const siteRoot = resolve(process.argv[2] || "pages-dist");
const sourcePath = resolve(process.argv[3] || "artifacts/real-assets/EA_LOGO640.BIK");
const screenshotPath = process.env.BINK_DIRECT_DECODER_SCREENSHOT
  ? resolve(process.env.BINK_DIRECT_DECODER_SCREENSHOT) : null;
const browserArgs = JSON.parse(process.env.BINK_DIRECT_BROWSER_ARGS || "[]");
if (!Array.isArray(browserArgs) || !browserArgs.every((arg) => typeof arg === "string")) {
  throw new Error("BINK_DIRECT_BROWSER_ARGS must be a JSON array of Chromium arguments");
}
const expectedRenderer = String(process.env.BINK_DIRECT_EXPECT_RENDERER || "").trim();
const sourceName = basename(sourcePath);
const sourceBytes = await readFile(sourcePath);
if (!(await stat(siteRoot)).isDirectory() || sourceBytes.byteLength <= 44) {
  throw new Error("Direct Bink smoke requires a built site and a readable classic Bink movie");
}
if (screenshotPath) await mkdir(resolve(screenshotPath, ".."), { recursive: true });

const server = await startStaticServer({ root: siteRoot });
const browser = await chromium.launch({ headless: true, args: browserArgs });
const context = await browser.newContext();
const page = await context.newPage({ viewport: { width: 900, height: 720 } });
const errors = [];
const decoderRequests = [];
page.on("request", (request) => {
  if (request.url().endsWith("/video-runtime/bink-decoder.wasm")) decoderRequests.push(request.url());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
await page.route("**/__direct_bink_source", (route) => route.fulfill({
  status: 200,
  contentType: "application/octet-stream",
  body: sourceBytes,
}));

try {
  await page.goto(new URL("legal.html", server.url).href, { waitUntil: "domcontentloaded" });
  if (decoderRequests.length !== 0) throw new Error("Bink decoder loaded before any movie was opened");
  const result = await page.evaluate(async ({ sourceName }) => {
    const rendererCanvas = document.createElement("canvas");
    const gl = rendererCanvas.getContext("webgl2");
    const rendererExtension = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = rendererExtension
      ? gl.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL)
      : gl?.getParameter(gl.RENDERER) ?? null;
    const decoderModule = await import("./harness/bink_decoder.mjs");
    const runtimeModule = await import("./harness/bink_direct_runtime.mjs");
    const sourceResponse = await fetch("/__direct_bink_source");
    const source = new Uint8Array(await sourceResponse.arrayBuffer());
    const header = decoderModule.parseBrowserBinkHeader(source, source.byteLength);
    const installName = "install-direct-bink-smoke";
    const opfsPath = `cnc-library/${installName}/movies/${sourceName}`;

    async function directory(path, create = false) {
      let handle = await navigator.storage.getDirectory();
      for (const part of path.split("/").filter(Boolean)) {
        handle = await handle.getDirectoryHandle(part, { create });
      }
      return handle;
    }

    const movies = await directory(`cnc-library/${installName}/movies`, true);
    const sourceHandle = await movies.getFileHandle(sourceName, { create: true });
    const writer = await sourceHandle.createWritable({ keepExistingData: false });
    await writer.write(source);
    await writer.close();

    const registry = decoderModule.createBinkDecoderSourceRegistry();
    registry.registerSources([{ name: sourceName, opfsPath, bytes: source.byteLength, ...header }]);
    const frames = [];
    const preparation = [];
    let audioContext = null;
    const runtime = runtimeModule.createBinkDirectVideoRuntime({
      resolveSource: (payload, options) => registry.sourceFor(payload, options),
      audioContext: () => {
        audioContext ??= new AudioContext();
        return audioContext;
      },
      onPreparation: (detail) => preparation.push(detail),
      sendFrame: ({ frameNum, width, height, bytes }) => {
        let checksum = 0;
        for (let index = 0; index < bytes.byteLength; index += 997) {
          checksum = Math.imul(checksum ^ bytes[index], 16777619) >>> 0;
        }
        frames.push({ frameNum, width, height, checksum, bytes: bytes.slice() });
      },
    });
    const startedAt = performance.now();
    runtime.open({
      handle: 1,
      sourcePath: `Data/English/Movies/${sourceName}`,
      videoPath: `artifacts/browser-video/bink/${sourceName}`,
      width: header.width,
      height: header.height,
      frames: header.frames,
      frameNum: 1,
      durationSeconds: header.durationSeconds,
    });

    async function waitFor(predicate, label, timeoutMs = 15000) {
      const deadline = performance.now() + timeoutMs;
      while (!predicate()) {
        if (performance.now() >= deadline) throw new Error(`${label} timed out`);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      }
    }

    await waitFor(() => frames.some((frame) => frame.frameNum >= 3), "initial direct frames");
    const firstFrameMs = performance.now() - startedAt;
    runtime.event({ handle: 1, event: "gotoFrame", arg0: Math.min(48, header.frames) });
    const seekTarget = Math.min(48, header.frames);
    await waitFor(() => frames.some((frame) => frame.frameNum === seekTarget), "direct seek frame");
    runtime.event({ handle: 1, event: "setVolume", arg0: 16384 });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    const snapshot = runtime.snapshot();

    const selected = frames.find((frame) => frame.frameNum === seekTarget) ?? frames[0];
    const canvas = document.createElement("canvas");
    canvas.width = selected.width;
    canvas.height = selected.height;
    const rgba = new Uint8ClampedArray(selected.bytes.byteLength);
    for (let offset = 0; offset < selected.bytes.byteLength; offset += 4) {
      rgba[offset] = selected.bytes[offset + 2];
      rgba[offset + 1] = selected.bytes[offset + 1];
      rgba[offset + 2] = selected.bytes[offset];
      rgba[offset + 3] = 255;
    }
    canvas.getContext("2d").putImageData(new ImageData(rgba, selected.width, selected.height), 0, 0);
    const heading = document.createElement("h1");
    heading.textContent = `Direct Bink decode: ${sourceName}`;
    const summary = document.createElement("p");
    summary.textContent = `${selected.width}×${selected.height} · frame ${selected.frameNum}`
      + ` · ${snapshot.decoderBytes} byte lazy decoder`;
    document.body.replaceChildren(heading, canvas, summary);

    runtime.shutdown();
    await audioContext?.close();

    let cacheDirectoryExists = true;
    try { await directory(`cnc-library/${installName}/browser-video`); } catch (error) {
      if (error?.name === "NotFoundError") cacheDirectoryExists = false;
      else throw error;
    }
    const root = await navigator.storage.getDirectory();
    const library = await root.getDirectoryHandle("cnc-library");
    await library.removeEntry(installName, { recursive: true });
    return {
      renderer,
      header,
      firstFrameMs,
      preparation,
      frames: frames.map(({ bytes, ...frame }) => frame),
      snapshot,
      cacheDirectoryExists,
      selectedFrame: { frameNum: selected.frameNum, checksum: selected.checksum },
    };
  }, { sourceName });

  if ((expectedRenderer && !result.renderer?.toLowerCase().includes(expectedRenderer.toLowerCase()))
      || result.preparation[0]?.phase !== "start"
      || !result.preparation.some((entry) => entry.phase === "ready")
      || result.frames.length < 4
      || !result.frames.some((frame) => frame.frameNum === Math.min(48, result.header.frames))
      || result.frames.some((frame) => frame.width !== result.header.width
        || frame.height !== result.header.height || frame.checksum === 0)
      || !(result.snapshot.decoderBytes > 0) || result.snapshot.decoderBytes > 128 * 1024
      || !(result.snapshot.audioSamples > 0)
      || decoderRequests.length !== 1
      || result.cacheDirectoryExists !== false
      || result.selectedFrame.checksum === 0) {
    throw new Error(`Direct Bink decode failed: ${JSON.stringify(result)}`);
  }
  if (screenshotPath) {
    await page.evaluate(() => new Promise((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
    }));
    await page.waitForTimeout(100);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  if (errors.length) throw new Error(`Unexpected browser errors:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ ok: true, sourceName, ...result }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
