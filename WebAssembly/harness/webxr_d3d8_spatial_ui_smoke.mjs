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
          return (payload) => {
            if (((Number(payload?.vertexShaderFvf ?? 0) >>> 0) & 0x004) === 0) return 1;
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
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const commands = [
      { hook: "cncPortD3D8BindFramebuffer", args: [{ colorTextureId: 0 }] },
      { hook: "cncPortD3D8Clear", args: [3, 0, 0, 0, 255, 1, 0] },
      { hook: "cncPortD3D8DrawIndexed", args: [{
        vertexShaderFvf: 0x002,
        transformMask: 2,
        transforms: { view: identity },
      }] },
      { hook: "cncPortD3D8DrawIndexed", args: [{ vertexShaderFvf: 0x004 }] },
      { hook: "cncPortD3D8Present", args: [{}] },
    ];
    renderer.acceptFrame({
      version: 1,
      sequence: 1,
      present: { backBufferWidth: 1280, backBufferHeight: 720 },
      commands,
    }, (value) => { accepted = value; });
    const targetRay = [...identity];
    targetRay[12] = -0.3;
    targetRay[14] = -0.4;
    const projection = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1.02, -1,
      0, 0, -0.202, 0,
    ];
    const inputSource = {
      handedness: "right",
      profiles: ["generic-trigger-squeeze-thumbstick"],
      targetRayPose: { matrix: targetRay },
      gamepad: {
        mapping: "xr-standard",
        axes: [0, 0],
        buttons: Array.from({ length: 6 }, () => ({ pressed: false, value: 0 })),
      },
    };
    const frameContext = {
      time: 1,
      pose: { transform: { matrix: identity } },
      views: [
        { eye: "left", viewMatrix: identity, projectionMatrix: projection,
          viewport: { x: 0, y: 0, width: 400, height: 600 } },
        { eye: "right", viewMatrix: identity, projectionMatrix: projection,
          viewport: { x: 400, y: 0, width: 400, height: 600 } },
      ],
      inputSources: [inputSource],
      layer: { framebuffer: null, framebufferWidth: 800, framebufferHeight: 600 },
    };
    const readHalves = () => {
      gl.finish();
      const pixels = new Uint8Array(800 * 600 * 4);
      gl.readPixels(0, 0, 800, 600, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return [0, 1].map((half) => {
        let colored = 0;
        let blue = 0;
        let pointerPixels = 0;
        let pressedPixels = 0;
        let worldPointerPixels = 0;
        const startX = half * 400;
        for (let y = 0; y < 600; y += 1) {
          for (let x = startX; x < startX + 400; x += 1) {
            const offset = (y * 800 + x) * 4;
            if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 48) colored += 1;
            if (pixels[offset] > 200 && pixels[offset + 1] < 100
                && pixels[offset + 2] > 150) pointerPixels += 1;
            if (pixels[offset] > 220 && pixels[offset + 1] > 190
                && pixels[offset + 2] > 140) pressedPixels += 1;
            if (pixels[offset] > 200 && pixels[offset + 1] > 100
                && pixels[offset + 1] < 190 && pixels[offset + 2] < 100) {
              worldPointerPixels += 1;
            }
            blue += pixels[offset + 2];
          }
        }
        return {
          colored,
          pointerPixels,
          pressedPixels,
          worldPointerPixels,
          meanBlue: blue / (400 * 600),
        };
      });
    };
    renderer.renderFrame(frameContext);
    const halves = readHalves();
    inputSource.gamepad.buttons[0] = { pressed: true, value: 1 };
    renderer.acceptFrame({
      version: 1,
      sequence: 2,
      present: { backBufferWidth: 1280, backBufferHeight: 720 },
      commands,
    }, (value) => { accepted &&= value; });
    renderer.renderFrame({ ...frameContext, time: 2 });
    const pressedHalves = readHalves();
    inputSource.gamepad.buttons[0] = { pressed: false, value: 0 };
    targetRay[12] = 1;
    renderer.acceptFrame({
      version: 1,
      sequence: 3,
      present: { backBufferWidth: 1280, backBufferHeight: 720 },
      commands,
    }, (value) => { accepted &&= value; });
    renderer.renderFrame({ ...frameContext, time: 3 });
    const worldHalves = readHalves();
    return {
      accepted,
      halves,
      pressedHalves,
      worldHalves,
      state: renderer.snapshot(),
      glError: gl.getError(),
      windowRenderer,
    };
  });
  assert.equal(result.accepted, true);
  assert.equal(result.glError, 0);
  assert.equal(result.state.uiDraws, 1);
  assert.equal(result.state.pointerDraws, 2);
  assert.equal(result.state.controllerPointer?.target, "world");
  assert.equal(result.state.viewCount, 2);
  assert.ok(!expectedRenderer || result.windowRenderer.toLowerCase().includes(expectedRenderer),
    `Window WebGL renderer does not contain ${expectedRenderer}: ${result.windowRenderer}`);
  for (const half of result.halves) {
    assert.ok(half.colored > 20000 && half.meanBlue > 20,
      `floating panel did not render into both XR views: ${JSON.stringify(result)}`);
    assert.ok(half.pointerPixels > 25,
      `tracked pointer feedback did not render into both XR views: ${JSON.stringify(result)}`);
  }
  for (const half of result.pressedHalves) {
    assert.ok(half.pressedPixels > 25,
      `pressed pointer confirmation did not render into both XR views: ${JSON.stringify(result)}`);
  }
  for (const half of result.worldHalves) {
    assert.ok(half.worldPointerPixels > 25,
      `battlefield pointer feedback did not render into both XR views: ${JSON.stringify(result)}`);
  }
  await page.locator("#spatial-ui-smoke").screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ ok: true, smoke: "webxr-spatial-ui", result, screenshotPath }));
} finally {
  await browser.close();
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}
