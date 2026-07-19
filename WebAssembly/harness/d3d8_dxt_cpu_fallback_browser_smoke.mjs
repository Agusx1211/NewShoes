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

    const upload = (id, format, bytes) => {
      const created = hooks.cncPortD3D8TextureCreate({
        id,
        width: 4,
        height: 4,
        levels: 1,
        format,
        pool: 1,
      });
      const updated = hooks.cncPortD3D8TextureUpdate({
        id,
        level: 0,
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        format,
        bytes,
      });
      const resource = diag.d3d8Textures.get(id);
      return {
        created,
        updated,
        resource,
        storage: resource?.storage ?? null,
        initialized: resource?.initializedLevels.has("0") ?? false,
      };
    };
    const dxt1 = upload(
      7,
      0x31545844,
      new Uint8Array([
        0x00, 0xf8,
        0xe0, 0x07,
        0x00, 0x00, 0x00, 0x00,
      ]),
    );
    const dxt3 = upload(
      8,
      0x33545844,
      new Uint8Array([
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0x00, 0x00,
        0xff, 0xff,
        0xff, 0xff, 0xff, 0xff,
      ]),
    );
    const selectors = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];
    const alphaBytes = new Uint8Array(8);
    alphaBytes[0] = 255;
    for (let texel = 0; texel < selectors.length; ++texel) {
      for (let selectorBit = 0; selectorBit < 3; ++selectorBit) {
        if ((selectors[texel] & (1 << selectorBit)) === 0) continue;
        const streamBit = texel * 3 + selectorBit;
        alphaBytes[2 + Math.floor(streamBit / 8)] |= 1 << (streamBit % 8);
      }
    }
    const dxt5 = upload(
      9,
      0x35545844,
      new Uint8Array([
        ...alphaBytes,
        0x00, 0xf8,
        0xe0, 0x07,
        0x00, 0x00, 0x00, 0x00,
      ]),
    );
    return {
      created: dxt1.created,
      updated: dxt1.updated,
      pixel: diag.sampleD3D8TextureCenter(7),
      storage: dxt1.storage,
      initialized: dxt1.initialized,
      dxt3: {
        created: dxt3.created,
        updated: dxt3.updated,
        pixel: diag.sampleD3D8TextureCenter(8),
        storage: dxt3.storage,
        initialized: dxt3.initialized,
      },
      dxt5: {
        created: dxt5.created,
        updated: dxt5.updated,
        firstPixel: diag.sampleD3D8TexturePixel(dxt5.resource, 0, 0),
        centerPixel: diag.sampleD3D8TexturePixel(dxt5.resource, 2, 2),
        lastPixel: diag.sampleD3D8TexturePixel(dxt5.resource, 3, 3),
        storage: dxt5.storage,
        initialized: dxt5.initialized,
      },
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
  assert.deepEqual(result.dxt3, {
    created: 1,
    updated: 1,
    pixel: [170, 170, 170, 255],
    storage: "rgba8",
    initialized: true,
  });
  assert.deepEqual(result.dxt5, {
    created: 1,
    updated: 1,
    firstPixel: [255, 0, 0, 255],
    centerPixel: [255, 0, 0, 219],
    lastPixel: [255, 0, 0, 36],
    storage: "rgba8",
    initialized: true,
  });
  console.log(JSON.stringify({
    ok: true,
    source: "d3d8-dxt-cpu-fallback-browser-smoke",
    ...result,
  }));
} finally {
  await browser?.close();
  await server.close();
}
