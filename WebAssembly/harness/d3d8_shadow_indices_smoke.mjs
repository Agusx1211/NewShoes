#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const server = await startStaticServer({ root: resolve(dirname(fileURLToPath(import.meta.url)), "..") });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: process.env.D3D8_SHADOW_BROWSER_ARGS?.split(/\s+/).filter(Boolean),
  });
  const page = await browser.newPage();
  const url = new URL("harness/d3d8_executor.mjs", server.url).href;
  await page.goto(url);
  const result = await page.evaluate(async (moduleUrl) => {
    const { createD3D8Executor } = await import(moduleUrl);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    document.body.append(canvas);
    const gl = canvas.getContext("webgl2", { depth: true, stencil: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 unavailable");
    // Exercise the fallback on hardware both with and without this extension.
    const getExtension = gl.getExtension.bind(gl);
    gl.getExtension = (name) => name === "WEBGL_provoking_vertex" ? null : getExtension(name);
    let indexUploads = 0;
    for (const name of ["bufferData", "bufferSubData"]) {
      const original = gl[name].bind(gl);
      gl[name] = (...args) => {
        if (args[0] === gl.ELEMENT_ARRAY_BUFFER) ++indexUploads;
        return original(...args);
      };
    }
    const heap = new ArrayBuffer(8192);
    const u32 = new Uint32Array(heap), f32 = new Float32Array(heap);
    const { hooks, diag } = createD3D8Executor({
      canvas, gl, state: { graphics: {} }, log() {},
      getHeapU32: () => u32, getHeapF32: () => f32,
    });
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const pixel = (x) => {
      diag.flushD3D8PendingDrawBatch();
      const rgba = new Uint8Array(4);
      gl.readPixels(x, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return Array.from(rgba).join(",");
    };
    const buffer = (kind, id, bytes) => {
      expect(hooks.cncPortD3D8BufferCreate({ kind, id, byteSize: bytes.byteLength }) === 1, "create buffer");
      expect(hooks.cncPortD3D8BufferUpdate({ kind, id, bytes, byteOffset: 0 }) === 1, "upload buffer");
    };
    const vertices = (z, colors) => {
      const bytes = new Uint8Array(48), view = new DataView(bytes.buffer);
      [[-1, -1], [3, -1], [-1, 3]].forEach(([x, y], i) => {
        view.setFloat32(i * 16, x, true);
        view.setFloat32(i * 16 + 4, y, true);
        view.setFloat32(i * 16 + 8, z, true);
        bytes.set(colors[i], i * 16 + 12);
      });
      return bytes;
    };
    buffer(1, 1, vertices(0.25, [[0, 0, 255, 255], [0, 255, 0, 255], [255, 0, 0, 255]]));
    buffer(1, 2, vertices(0.5, Array(3).fill([0, 255, 0, 255])));
    buffer(1, 3, vertices(0.25, [[0, 0, 255, 0], [0, 255, 0, 255], [255, 0, 0, 255]]));
    buffer(1, 6, vertices(0.25, [[0, 0, 255, 255], [0, 255, 0, 0], [255, 0, 0, 255]]));
    buffer(2, 4, new Uint8Array(new Uint16Array([0, 1, 2]).buffer));
    buffer(2, 5, new Uint8Array(new Uint32Array([0, 1, 2]).buffer));
    const state = u32.subarray(64, 64 + 50 + 8 * 29);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const ptr of [1536, 1600, 1664]) f32.set(identity, ptr >>> 2);
    f32.set([1, 0, 0, 0], 1728 >>> 2);
    hooks.cncPortD3D8SetViewport({ x: 0, y: 0, width: 64, height: 64, minZ: 0, maxZ: 1, targetWidth: 64, targetHeight: 64 });
    let hash = 1, checks = 0;
    const draw = (vertexBufferId, primitiveType, indexSize) => {
      hooks.cncPortD3D8DrawIndexed({
        vertexBufferId, vertexByteOffset: 0, vertexBytes: 48, vertexCount: 3,
        vertexStride: 16, vertexShaderFvf: 0x42,
        indexBufferId: indexSize === 2 ? 4 : 5, indexByteOffset: 0,
        indexBytes: 3 * indexSize, indexCount: 3, indexSize, primitiveType,
        pixelShaderHandle: 0, transformMask: 7,
        transforms: { world: 1536, view: 1600, projection: 1664 },
        worldTransformRevision: 1, viewTransformRevision: 1, projectionTransformRevision: 1,
        statePayloadPointers: true, renderStatePtr: 256, clipPlanesPtr: 1728,
        lightsPtr: 2048, materialPtr: 3072, stateHash: ++hash, derivedStateHash: hash,
      });
      // Full diagnostics report zero for a black center pixel, including a
      // successful color-masked draw. Verify its actual depth/stencil below.
      diag.flushD3D8PendingDrawBatch();
    };
    for (const level of ["full", "lite"]) for (const primitive of [4, 5, 6])
      for (const indexSize of [2, 4]) for (const clipped of [false, true]) {
        globalThis.__cncSetDiagLevel(level);
        state.fill(0);
        state[0] = 1; state[11] = 15; state[27] = 3; state[29] = 1; state[37] = 1;
        for (let stage = 0; stage < 8; ++stage) {
          state[50 + stage * 29 + 1] = stage === 0 ? 2 : 1;
          state[50 + stage * 29 + 4] = stage === 0 ? 2 : 1;
          state[50 + stage * 29 + 28] = 1; // D3DTA_CURRENT
        }
        hooks.cncPortD3D8Clear(7, 0, 0, 0, 255, 1, 0);
        draw(1, primitive, indexSize);
        const flatColor = pixel(32);
        // D3D triangle fans use the first rim vertex, not the center vertex.
        expect(flatColor === (primitive === 6 ? "0,255,0,255" : "255,0,0,255"),
          `visible flat color ${flatColor}: ${level}, primitive=${primitive}, index=${indexSize}, clipped=${clipped}`);
        hooks.cncPortD3D8Clear(7, 0, 0, 0, 255, 1, 0);
        state[1] = state[2] = 1; state[3] = 2; state[11] = 0;
        state[13] = 1; state[14] = state[15] = 1; state[16] = 3; state[17] = 8;
        state[18] = 7; state[19] = state[20] = 255; state[38] = Number(clipped);
        indexUploads = 0;
        draw(1, primitive, indexSize);
        expect(indexUploads === 0, `shadow uploaded ${indexUploads} temporary index buffers (${level})`);
        expect(pixel(32) === "0,0,0,255", "color-masked shadow changed color");
        state[11] = 15; state[13] = 0; state[38] = 0;
        draw(2, primitive, indexSize);
        expect(pixel(48) === "0,0,0,255", "shadow did not write depth");
        expect(pixel(16) === (clipped ? "0,255,0,255" : "0,0,0,255"), "clipped shadow depth changed");
        hooks.cncPortD3D8Clear(1, 0, 0, 0, 255, 1, 0);
        state[1] = 0; state[13] = 1; state[16] = 1; state[17] = 3;
        draw(2, primitive, indexSize);
        expect(pixel(48) === "0,255,0,255", "shadow did not write stencil");
        expect(pixel(16) === (clipped ? "0,0,0,255" : "0,255,0,255"), "clipped shadow stencil changed");
        // Alpha-tested color-masked draws still need the first vertex's alpha.
        hooks.cncPortD3D8Clear(7, 0, 0, 0, 255, 1, 0);
        state[11] = 0; state[16] = 3; state[17] = 8;
        state[8] = 1; state[9] = 5; state[10] = 128;
        draw(primitive === 6 ? 6 : 3, primitive, indexSize);
        state[8] = 0; state[11] = 15; state[16] = 1; state[17] = 3;
        draw(2, primitive, indexSize);
        expect(pixel(32) === "0,0,0,255", "alpha-tested draw incorrectly used the shadow shortcut");
        expect(gl.getError() === gl.NO_ERROR, "WebGL error");
        ++checks;
      }
    const rendererInfo = getExtension("WEBGL_debug_renderer_info");
    return { ok: true, checks, renderer: gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
  }, url);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
