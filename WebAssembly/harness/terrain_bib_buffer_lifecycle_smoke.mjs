#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-bib-buffer-lifecycle-canvas.png",
);

async function withTimeout(label, promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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
  await withTimeout(
    "terrain bib-buffer lifecycle harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain bib-buffer lifecycle RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain bib-buffer lifecycle boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "original W3DBibBuffer lifecycle smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D bib-buffer lifecycle: ${JSON.stringify(bootResult)}`);
  }

  const result = await withTimeout(
    "terrain bib-buffer lifecycle RPC",
    page.evaluate(() => window.CnCPort.rpc("ww3dTerrainBibBufferLifecycle")),
    60000,
  );
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  if (!result.ok
      || result.command !== "ww3dTerrainBibBufferLifecycle"
      || result.probe?.source !== "ww3d_terrain_bib_buffer_lifecycle_probe"
      || result.probe?.results?.globalDataReady !== true
      || result.probe?.results?.init !== 0
      || result.probe?.results?.setRenderDevice !== 0
      || result.probe?.results?.bufferCreated !== true
      || result.probe?.results?.initialized !== true
      || result.probe?.results?.vertexBufferAllocated !== true
      || result.probe?.results?.indexBufferAllocated !== true
      || result.probe?.results?.normalTextureCreated !== true
      || result.probe?.results?.highlightTextureCreated !== true
      || result.probe?.results?.addBibInvoked !== true
      || result.probe?.results?.removeHighlightingInvoked !== true
      || result.probe?.results?.removeBibInvoked !== true
      || result.probe?.results?.clearBibsInvoked !== true
      || result.probe?.results?.freeBuffersInvoked !== true
      || result.probe?.results?.vertexBufferReleased !== true
      || result.probe?.results?.indexBufferReleased !== true
      || result.probe?.bibs?.afterAdd !== 1
      || result.probe?.bibs?.afterRemove !== 1
      || result.probe?.bibs?.afterClear !== 0
      || result.probe?.bibs?.changedAfterAdd !== true
      || result.probe?.calls?.createVertexBuffer < 1
      || result.probe?.calls?.createIndexBuffer < 1
      || result.bufferDelta?.creates < 2
      || result.bufferDelta?.releases < 2
      || result.textureDelta?.creates < 1
      || result.textureDelta?.updates < 1
      || result.textureDelta?.releases < 1) {
    throw new Error(`W3D bib-buffer lifecycle failed: ${JSON.stringify(result)}`);
  }

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during W3D bib-buffer lifecycle: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-bib-buffer-lifecycle",
    url: harnessUrl,
    screenshot: screenshotPath,
    probe: result.probe,
    bufferDelta: result.bufferDelta,
    textureDelta: result.textureDelta,
    renderer: "original W3DBibBuffer lifecycle over browser D3D8/WebGL2 buffer allocation",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
