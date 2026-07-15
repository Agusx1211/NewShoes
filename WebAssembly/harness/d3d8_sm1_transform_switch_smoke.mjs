#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const executorUrl = new URL("harness/d3d8_executor.mjs", server.url);
  await page.goto(executorUrl.href, { waitUntil: "load" });

  const result = await page.evaluate(async (moduleUrl) => {
    const { createD3D8Executor } = await import(moduleUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    document.body.append(canvas);

    const gl = canvas.getContext("webgl2", {
      depth: true,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 context unavailable");

    const { hooks, diag } = createD3D8Executor({
      canvas,
      gl,
      state: { graphics: {} },
      log() {},
    });
    const expect = (condition, message, detail) => {
      if (!condition) throw new Error(`${message}: ${JSON.stringify(detail)}`);
    };
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const makeTriangle = (rgba) => {
      const bytes = new Uint8Array(3 * 16);
      const view = new DataView(bytes.buffer);
      const positions = [[-1, -1, 0.5], [3, -1, 0.5], [-1, 3, 0.5]];
      for (let vertex = 0; vertex < positions.length; vertex += 1) {
        const base = vertex * 16;
        positions[vertex].forEach((value, component) =>
          view.setFloat32(base + component * 4, value, true));
        bytes.set([rgba[2], rgba[1], rgba[0], rgba[3]], base + 12);
      }
      return bytes;
    };
    const indexBytes = new Uint8Array(new Uint16Array([0, 1, 2]).buffer);
    const createBuffer = (kind, id, bytes) => {
      expect(hooks.cncPortD3D8BufferCreate({ kind, id, byteSize: bytes.byteLength }) === 1,
        "buffer creation failed", { kind, id });
      expect(hooks.cncPortD3D8BufferUpdate({ kind, id, byteOffset: 0, bytes }) === 1,
        "buffer upload failed", { kind, id });
    };

    createBuffer(1, 1, makeTriangle([255, 0, 0, 255]));
    createBuffer(1, 2, makeTriangle([0, 255, 0, 255]));
    createBuffer(2, 3, indexBytes);

    const pixelShaderHandle = 77;
    expect(hooks.cncPortD3D8ShaderCreate({
      handle: pixelShaderHandle,
      isPixel: true,
      tokens: new Uint32Array([
        0xffff0101,       // ps.1.1
        1,                // mov
        0x800f0000,       // r0
        0x90e40000,       // v0
        0x0000ffff,       // end
      ]),
    }) === true, "pixel shader registration failed");

    hooks.cncPortD3D8SetViewport({
      x: 0, y: 0, width: 64, height: 64, minZ: 0, maxZ: 1,
      targetWidth: 64, targetHeight: 64,
    });
    hooks.cncPortD3D8Clear(3, 0, 0, 0, 255, 1, 0);

    const renderState = {
      zEnable: 0,
      zWriteEnable: 0,
      cullMode: 1,
      lighting: 0,
      alphaBlendEnable: 0,
      colorWriteEnable: 0xf,
      textureStages: [{
        colorOp: 2,
        colorArg1: 0,
        alphaOp: 2,
        alphaArg1: 0,
      }],
    };
    const draw = (vertexBufferId, shaderHandle, hash) =>
      hooks.cncPortD3D8DrawIndexed({
        vertexBufferId,
        vertexByteOffset: 0,
        vertexBytes: 48,
        vertexCount: 3,
        vertexStride: 16,
        vertexShaderFvf: 0x42, // D3DFVF_XYZ | D3DFVF_DIFFUSE
        indexBufferId: 3,
        indexByteOffset: 0,
        indexBytes: 6,
        indexCount: 3,
        indexSize: 2,
        primitiveType: 4,
        pixelShaderHandle: shaderHandle,
        transformMask: 7,
        worldTransformRevision: 9,
        viewTransformRevision: 9,
        projectionTransformRevision: 9,
        transforms: { world: identity, view: identity, projection: identity },
        renderState,
        stateHash: hash,
        derivedStateHash: hash,
      });

    expect(draw(1, 0, 101) === 1, "fixed-function priming draw failed");
    expect(draw(2, pixelShaderHandle, 202) === 1, "translated shader draw failed");
    diag.flushD3D8PendingDrawBatch("sm1-transform-switch-smoke");

    const pixel = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const centerPixel = Array.from(pixel);
    expect(centerPixel[0] < 32 && centerPixel[1] > 220 && centerPixel[2] < 32,
      "newly bound SM1 program did not receive unchanged D3D transforms", centerPixel);

    return { ok: true, centerPixel, pixelShaderHandle };
  }, executorUrl.href);

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
