import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const videoBufferScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-video-buffer-canvas.png",
);

const D3DFMT_X8R8G8B8 = 22;
const D3DPT_TRIANGLELIST = 4;
const D3DBLEND_SRCALPHA = 5;
const D3DBLEND_INVSRCALPHA = 6;
const D3DTOP_DISABLE = 1;
const D3DTOP_MODULATE = 4;
const D3DTA_DIFFUSE = 0;
const D3DTA_TEXTURE = 2;

function pixelLooksRed(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] <= 80
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function pixelLooksBlack(pixel) {
  return Array.isArray(pixel)
    && pixel[0] <= 16
    && pixel[1] <= 16
    && pixel[2] <= 16
    && pixel[3] >= 200;
}

function withTimeout(promise, milliseconds, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

await mkdir(screenshotDir, { recursive: true });

const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "W3DDisplay drawVideoBuffer smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3DDisplay video-buffer smoke: ${JSON.stringify(bootResult)}`);
  }

  let renderResult;
  try {
    renderResult = await withTimeout(
      page.evaluate(() => window.CnCPort.rpc("ww3dDisplayVideoBuffer")),
      30000,
      "W3DDisplay drawVideoBuffer",
    );
  } catch (error) {
    throw new Error(`W3DDisplay drawVideoBuffer crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const stage0 = renderResult.probe?.draw?.renderState?.textureStages?.[0];
  const stage1 = renderResult.probe?.draw?.renderState?.textureStages?.[1];
  if (!renderResult.ok
      || renderResult.probe?.source !== "ww3d_display_video_buffer_probe"
      || renderResult.probe?.display?.path !== "W3DDisplay::drawVideoBuffer"
      || renderResult.probe?.results?.videoAllocated !== true
      || renderResult.probe?.results?.videoValid !== true
      || renderResult.probe?.results?.videoLocked !== true
      || renderResult.probe?.results?.videoFilled !== true
      || renderResult.probe?.results?.displayAllocated !== true
      || renderResult.probe?.results?.displaySetup !== true
      || renderResult.probe?.results?.drawVideoBufferCalled !== true
      || renderResult.probe?.videoBuffer?.type !== 2
      || renderResult.probe?.videoBuffer?.format !== D3DFMT_X8R8G8B8
      || renderResult.probe?.videoBuffer?.textureId === 0
      || renderResult.probe?.videoBuffer?.visibleWidth !== 128
      || renderResult.probe?.videoBuffer?.visibleHeight !== 128
      || renderResult.probe?.videoBuffer?.textureWidth !== 128
      || renderResult.probe?.videoBuffer?.textureHeight !== 128
      || renderResult.probe?.videoBuffer?.pitch !== 512
      || renderResult.probe?.videoBuffer?.uploadChecksum === 0
      || renderResult.probe?.draw?.primitiveType !== D3DPT_TRIANGLELIST
      || renderResult.probe?.draw?.vertexCount !== 4
      || renderResult.probe?.draw?.primitiveCount !== 2
      || renderResult.probe?.draw?.vertexStride !== 44
      || renderResult.probe?.draw?.vertexBufferId === 0
      || renderResult.probe?.draw?.indexBufferId === 0
      || (renderResult.probe?.draw?.transformMask & 7) !== 7
      || renderResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || renderResult.probe?.draw?.renderState?.srcBlend !== D3DBLEND_SRCALPHA
      || renderResult.probe?.draw?.renderState?.destBlend !== D3DBLEND_INVSRCALPHA
      || stage0?.colorOp !== D3DTOP_MODULATE
      || stage0?.colorArg1 !== D3DTA_TEXTURE
      || stage0?.colorArg2 !== D3DTA_DIFFUSE
      || stage1?.colorOp !== D3DTOP_DISABLE
      || renderResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || renderResult.browserProbe?.texture0?.id !== renderResult.probe?.videoBuffer?.textureId
      || renderResult.browserProbe?.texture0?.ready !== true
      || renderResult.browserProbe?.texture0?.sampled !== true
      || renderResult.browserProbe?.texture0?.format !== D3DFMT_X8R8G8B8
      || renderResult.browserProbe?.texture0?.storage !== "rgba8"
      || renderResult.browserProbe?.texture0?.combiner?.supported !== true
      || renderResult.browserProbe?.texture0?.combiner?.colorOp !== D3DTOP_MODULATE
      || renderResult.browserProbe?.texture0?.combiner?.colorArg1 !== D3DTA_TEXTURE
      || renderResult.browserProbe?.texture0?.combiner?.colorArg2 !== D3DTA_DIFFUSE
      || !pixelLooksRed(renderResult.browserProbe?.centerPixel)
      || !pixelLooksRed(renderResult.videoPixels?.center)
      || !pixelLooksRed(renderResult.screenshot?.centerPixel)
      || !pixelLooksBlack(renderResult.videoPixels?.outside)
      || renderResult.textureDelta?.creates < 1
      || renderResult.textureDelta?.updates < 2
      || renderResult.textureDelta?.binds < 1
      || renderResult.textureDelta?.releases < 1) {
    throw new Error(`W3DDisplay drawVideoBuffer failed: ${JSON.stringify(renderResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: videoBufferScreenshot });

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    screenshot: videoBufferScreenshot,
    probe: renderResult.probe,
    browserProbe: renderResult.browserProbe,
    textureDelta: renderResult.textureDelta,
    renderer: "W3DVideoBuffer::lock/unlock + W3DDisplay::drawVideoBuffer + Render2DClass + browser D3D8/WebGL2 bridge",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
