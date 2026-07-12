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
    canvas.width = 1920;
    canvas.height = 1080;
    document.body.append(canvas);

    const gl = canvas.getContext("webgl2", {
      depth: true,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error("WebGL2 context unavailable");
    }

    const { hooks, diag } = createD3D8Executor({
      canvas,
      gl,
      state: { graphics: {} },
      log() {},
    });

    const expect = (condition, message, detail) => {
      if (!condition) {
        throw new Error(`${message}: ${JSON.stringify(detail)}`);
      }
    };
    const readPixel = (x, y) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Array.from(pixel);
    };
    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS),
        "probe shader compilation failed", gl.getShaderInfoLog(shader));
      return shader;
    };

    expect(hooks.cncPortD3D8TextureCreate({
      id: 1,
      width: 256,
      height: 256,
      levels: 1,
      format: 21,
      usage: 1,
      pool: 0,
    }) === 1, "render-target texture creation failed");
    expect(hooks.cncPortD3D8BindFramebuffer({
      colorTextureId: 1,
      depthTextureId: 0,
      width: 256,
      height: 256,
    }) === 1, "offscreen framebuffer bind failed");

    hooks.cncPortD3D8Clear(1, 255, 0, 0, 255, 1, 0);

    // Terrain rendering leaves alpha writes disabled after drawing the
    // destination-alpha shoreline mask. D3D8 Clear must still replace alpha;
    // WebGL clear would preserve stale alpha unless the executor temporarily
    // overrides and then restores the draw color mask.
    diag.setD3D8ColorMask(true, true, true, false);
    hooks.cncPortD3D8Clear(1, 12, 34, 56, 64, 1, 0);
    const maskedClearPixel = readPixel(128, 128);
    const restoredColorMask = Array.from(gl.getParameter(gl.COLOR_WRITEMASK));
    expect(maskedClearPixel.join(",") === "12,34,56,64",
      "D3D8 clear incorrectly obeyed the draw color mask", maskedClearPixel);
    expect(restoredColorMask.join(",") === "true,true,true,false",
      "D3D8 clear did not restore the draw color mask", restoredColorMask);
    diag.setD3D8ColorMask(true, true, true, true);
    hooks.cncPortD3D8SetViewport({
      x: 0,
      y: 0,
      width: 256,
      height: 256,
      minZ: 0,
      maxZ: 1,
      targetWidth: 256,
      targetHeight: 256,
    });

    const offscreenViewport = Array.from(gl.getParameter(gl.VIEWPORT));
    const offscreenScissor = Array.from(gl.getParameter(gl.SCISSOR_BOX));
    expect(offscreenViewport.join(",") === "0,0,256,256",
      "offscreen viewport used backbuffer dimensions", offscreenViewport);
    expect(offscreenScissor.join(",") === "0,0,256,256",
      "offscreen scissor used backbuffer dimensions", offscreenScissor);

    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, `#version 300 es
      void main() {
        vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
      }
    `));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      out vec4 color;
      void main() {
        color = vec4(0.0, 0.0, 1.0, 1.0);
      }
    `));
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS),
      "probe program link failed", gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const samplePoints = [[1, 1], [254, 1], [128, 128], [1, 254], [254, 254]];
    const samples = samplePoints.map(([x, y]) => readPixel(x, y));
    expect(samples.every((pixel) => pixel.join(",") === "0,0,255,255"),
      "fullscreen draw did not cover the offscreen target", samples);

    expect(hooks.cncPortD3D8BindFramebuffer({
      colorTextureId: 0,
      depthTextureId: 0,
      width: 0,
      height: 0,
    }) === 1, "default framebuffer restore failed");
    hooks.cncPortD3D8SetViewport({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      minZ: 0,
      maxZ: 1,
      targetWidth: 1920,
      targetHeight: 1080,
    });

    const restoredViewport = Array.from(gl.getParameter(gl.VIEWPORT));
    const restoredScissor = Array.from(gl.getParameter(gl.SCISSOR_BOX));
    expect(restoredViewport.join(",") === "0,0,1920,1080",
      "backbuffer viewport was not restored", restoredViewport);
    expect(restoredScissor.join(",") === "0,0,1920,1080",
      "backbuffer scissor was not restored", restoredScissor);

    return {
      ok: true,
      backbuffer: [1920, 1080],
      renderTarget: [256, 256],
      offscreenViewport,
      offscreenScissor,
      maskedClearPixel,
      restoredColorMask,
      samples,
      restoredViewport,
      restoredScissor,
    };
  }, executorUrl.href);

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
