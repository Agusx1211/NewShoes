#!/usr/bin/env node

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot, host: "127.0.0.1", port: 0 });
let browser;

try {
  const browserArgs = process.env.CNC_BROWSER_ARGS
    ? JSON.parse(process.env.CNC_BROWSER_ARGS)
    : [];
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CNC_BROWSER_EXECUTABLE || undefined,
    args: browserArgs,
  });
  const page = await browser.newPage();
  const executorUrl = new URL("harness/d3d8_executor.mjs", server.url);
  await page.goto(executorUrl.href, { waitUntil: "load" });

  const result = await page.evaluate(async (moduleUrl) => {
    const { createD3D8Executor } = await import(moduleUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    document.body.append(canvas);
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable");

    const debugRendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const { hooks, diag } = createD3D8Executor({
      canvas,
      gl,
      s3tc: null,
      fallbackContext: null,
      log() {},
      state: { canvas: {}, graphics: {} },
    });
    globalThis.__cncSetDiagLevel("lite");

    const format = 0x31545844;
    const created = hooks.cncPortD3D8TextureCreate({
      id: 7,
      width: 4,
      height: 4,
      levels: 1,
      format,
      pool: 1,
    });
    const updated = hooks.cncPortD3D8TextureUpdate({
      id: 7,
      level: 0,
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      format,
      bytes: new Uint8Array([
        0x00, 0xf8,
        0xe0, 0x07,
        0x00, 0x00, 0x00, 0x00,
      ]),
    });
    const resource = diag.d3d8Textures.get(7);
    return {
      created,
      updated,
      pixel: diag.sampleD3D8TextureCenter(7),
      storage: resource?.storage ?? null,
      initialized: resource?.initializedLevels.has("0") ?? false,
      s3tcForcedOff: diag.s3tc() === null,
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedRenderer: debugRendererInfo
        ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
        : null,
    };
  }, executorUrl.href);

  assert.equal(result.created, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.s3tcForcedOff, true);
  assert.equal(result.storage, "rgba8");
  assert.equal(result.initialized, true);
  assert.deepEqual(result.pixel, [255, 0, 0, 255]);
  console.log(JSON.stringify({
    ok: true,
    source: "d3d8-dxt-cpu-fallback-browser-smoke",
    ...result,
  }));
} finally {
  await browser?.close();
  await server.close();
}
