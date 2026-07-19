#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/webxr-spatial-ui");
const screenshotPath = resolve(process.env.WEBXR_SPATIAL_UI_SCREENSHOT
  ?? resolve(wasmRoot, "artifacts/screenshots/webxr-spatial-ui-emulated.png"));
const executablePath = process.env.WEBXR_SPATIAL_UI_BROWSER_EXECUTABLE
  ?? process.env.CHROME_PATH;
const browserArgs = (process.env.WEBXR_SPATIAL_UI_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const expectedRenderer = process.env.WEBXR_SPATIAL_UI_EXPECT_RENDERER
  ?.trim().toLowerCase() ?? "";
await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
await mkdir(dirname(screenshotPath), { recursive: true });

const server = await startStaticServer({ root: wasmRoot, port: 0, host: "0.0.0.0" });
const browser = await chromium.launchPersistentContext(profileDir, {
  viewport: { width: 900, height: 700 },
  ...(executablePath ? { executablePath } : {}),
  args: browserArgs,
});

try {
  const page = await browser.newPage();
  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "load" });
  const result = await page.evaluate(async () => {
    const { createWebXrD3D8Renderer } = await import("./webxr-d3d8-renderer.mjs");
    document.body.replaceChildren();
    document.body.style.margin = "0";
    document.body.style.background = "#111";
    const canvas = document.createElement("canvas");
    canvas.id = "spatial-ui-smoke";
    canvas.width = 800;
    canvas.height = 600;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    document.body.append(canvas);
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    const hooks = new Proxy({}, {
      get(_target, hook) {
        if (hook === "cncPortD3D8SetViewport") {
          return (viewport) => {
            gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            gl.scissor(viewport.x, viewport.y, viewport.width, viewport.height);
            return true;
          };
        }
        if (hook === "cncPortD3D8DrawIndexed") {
          return () => {
            gl.colorMask(true, true, true, true);
            gl.clearColor(0.08, 0.55, 0.9, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return 1;
          };
        }
        return () => true;
      },
    });
    const diag = {
      bindD3D8ExternalFramebuffer(framebuffer, width, height) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, width, height);
      },
      setD3D8XrViewOverride() {},
      invalidateD3D8ExternalGlState() {},
      flushD3D8PendingDrawBatch() {},
    };
    const renderer = createWebXrD3D8Renderer({ gl, executorHooks: hooks, executorDiag: diag });
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const windowRenderer = gl.getParameter(
      rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER,
    );
    renderer.onSessionStart();
    let accepted = null;
    renderer.acceptFrame({
      version: 1,
      sequence: 1,
      present: { backBufferWidth: 1280, backBufferHeight: 720 },
      commands: [
        { hook: "cncPortD3D8BindFramebuffer", args: [{ colorTextureId: 0 }] },
        { hook: "cncPortD3D8Clear", args: [3, 0, 0, 0, 255, 1, 0] },
        { hook: "cncPortD3D8DrawIndexed", args: [{ vertexShaderFvf: 0x004 }] },
        { hook: "cncPortD3D8Present", args: [{}] },
      ],
    }, (value) => { accepted = value; });
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const projection = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1.02, -1,
      0, 0, -0.202, 0,
    ];
    renderer.renderFrame({
      time: 1,
      pose: { transform: { matrix: identity } },
      views: [
        { eye: "left", viewMatrix: identity, projectionMatrix: projection,
          viewport: { x: 0, y: 0, width: 400, height: 600 } },
        { eye: "right", viewMatrix: identity, projectionMatrix: projection,
          viewport: { x: 400, y: 0, width: 400, height: 600 } },
      ],
      inputSources: [],
      layer: { framebuffer: null, framebufferWidth: 800, framebufferHeight: 600 },
    });
    gl.finish();
    const pixels = new Uint8Array(800 * 600 * 4);
    gl.readPixels(0, 0, 800, 600, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const halves = [0, 1].map((half) => {
      let colored = 0;
      let blue = 0;
      const startX = half * 400;
      for (let y = 0; y < 600; y += 1) {
        for (let x = startX; x < startX + 400; x += 1) {
          const offset = (y * 800 + x) * 4;
          if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 48) colored += 1;
          blue += pixels[offset + 2];
        }
      }
      return { colored, meanBlue: blue / (400 * 600) };
    });
    return {
      accepted,
      halves,
      state: renderer.snapshot(),
      glError: gl.getError(),
      windowRenderer,
    };
  });
  assert.equal(result.accepted, true);
  assert.equal(result.glError, 0);
  assert.equal(result.state.uiDraws, 1);
  assert.equal(result.state.viewCount, 2);
  assert.ok(!expectedRenderer || result.windowRenderer.toLowerCase().includes(expectedRenderer),
    `Window WebGL renderer does not contain ${expectedRenderer}: ${result.windowRenderer}`);
  for (const half of result.halves) {
    assert.ok(half.colored > 20000 && half.meanBlue > 20,
      `floating panel did not render into both XR views: ${JSON.stringify(result)}`);
  }
  await page.locator("#spatial-ui-smoke").screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ ok: true, smoke: "webxr-spatial-ui", result, screenshotPath }));
} finally {
  await browser.close();
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}
