#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/webxr-world-input");
const timeoutMs = Math.max(30000, Number(process.env.WEBXR_WORLD_INPUT_TIMEOUT_MS
  ?? 15 * 60 * 1000));
const executablePath = process.env.WEBXR_WORLD_INPUT_BROWSER_EXECUTABLE
  ?? process.env.CHROME_PATH;
const dist = process.env.WEBXR_WORLD_INPUT_DIST ?? "dist-threaded-release";
const browserArgs = (process.env.WEBXR_WORLD_INPUT_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const reuseProfile = process.env.WEBXR_WORLD_INPUT_REUSE_PROFILE === "1";

function expectFiniteRay(ray) {
  assert.equal(ray.active, true, "native W3DView ray must be active during tracked input");
  assert.equal(ray.rejected, 0, "native W3DView must not reject the transformed ray");
  assert.ok(ray.updates > 0, "the ordered input bridge must update the native ray");
  assert.ok(ray.start.every(Number.isFinite) && ray.end.every(Number.isFinite),
    `native ray contains non-finite coordinates: ${JSON.stringify(ray)}`);
  const length = Math.hypot(...ray.end.map((value, index) => value - ray.start[index]));
  assert.ok(Math.abs(length - 12000) < 2,
    `native ray length must preserve the engine picking range: ${length}`);
  return length;
}

function stage(message) {
  process.stderr.write(`[webxr-world-input] ${message}\n`);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function fullFrame(page) {
  const result = await rpc(page, "realEngineFrame", { frames: 1 });
  assert.equal(result?.ok, true, `real engine frame failed: ${JSON.stringify(result)}`);
  assert.equal(result?.aborted, false, `real engine frame aborted: ${JSON.stringify(result)}`);
  return result.frame;
}

async function waitForFrame(page, label, predicate, waitMs = 120000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await fullFrame(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last?.clientState ?? last)}`);
}

function enginePointToCss(geometry, point) {
  if (!geometry?.engineWidth || !geometry?.engineHeight) return null;
  return {
    x: geometry.left + point.x * geometry.width / geometry.engineWidth,
    y: geometry.top + point.y * geometry.height / geometry.engineHeight,
  };
}

async function moveToEnginePoint(page, geometry, point, label) {
  const cssPoint = enginePointToCss(geometry, point);
  assert.ok(Number.isFinite(cssPoint?.x) && Number.isFinite(cssPoint?.y),
    `${label} has no browser coordinates: ${JSON.stringify({ point, cssPoint })}`);
  await page.mouse.move(cssPoint.x, cssPoint.y, { steps: 4 });
  return cssPoint;
}

async function clickEngineButton(page, geometry, button, label) {
  assert.equal(button?.clickable, true, `${label} is not clickable`);
  await moveToEnginePoint(page, geometry,
    { x: button.centerX, y: button.centerY }, label);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
}

async function enterSkirmish(page, geometry) {
  await moveToEnginePoint(page, geometry, { x: 32, y: 32 }, "main menu wake-up");
  await page.waitForTimeout(250);
  await moveToEnginePoint(page, geometry, { x: 96, y: 96 }, "main menu wake-up");
  let frame = await waitForFrame(page, "main menu",
    (candidate) => candidate?.clientState?.mainMenu?.buttonSinglePlayer?.clickable === true);
  await clickEngineButton(page, geometry, frame.clientState.mainMenu.buttonSinglePlayer,
    "Single Player button");
  frame = await waitForFrame(page, "single-player menu",
    (candidate) => candidate?.clientState?.mainMenu?.buttonSkirmish?.clickable === true);
  await clickEngineButton(page, geometry,
    frame.clientState.mainMenu.buttonSkirmish, "Skirmish button");
  for (let retry = 0; retry < 3; retry += 1) {
    await page.waitForTimeout(2000);
    frame = await fullFrame(page);
    if (frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true) break;
    const retryButton = frame?.clientState?.mainMenu?.buttonSkirmish;
    if (retryButton?.clickable === true) {
      await clickEngineButton(page, geometry,
        retryButton, `Skirmish button retry ${retry + 1}`);
    }
  }
  frame = await waitForFrame(page, "skirmish options",
    (candidate) => candidate?.clientState?.skirmishMenu?.buttonStart?.clickable === true);
  await clickEngineButton(page, geometry,
    frame.clientState.skirmishMenu.buttonStart, "Start button");
  await waitForFrame(page, "active skirmish", (candidate) => {
    const gameplay = candidate?.gameplay ?? candidate?.clientState?.gameplay;
    return gameplay?.inGame === true && gameplay?.loadingMap === false
      && gameplay?.inputEnabled === true && Number(gameplay?.renderedObjectCount ?? 0) > 0;
  }, 6 * 60 * 1000);
}

async function waitForEngineRay(page) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let nextReport = 0;
  while (Date.now() < deadline) {
    await fullFrame(page);
    last = await page.evaluate(() => {
      const webxr = window.CnCPort?.state?.webxr ?? null;
      return {
        phase: webxr?.phase ?? null,
        frames: webxr?.frames ?? 0,
        renderer: webxr?.renderer ?? null,
      };
    });
    if (last.phase === "running" && last.frames > 0
        && last.renderer?.enginePickRayReady === true
        && last.renderer?.controllerPointer?.ray != null) {
      return last;
    }
    if (Date.now() >= nextReport) {
      stage(`waiting for engine camera: ${JSON.stringify(last)}`);
      nextReport = Date.now() + 10000;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`real engine did not produce a tracked world ray: ${JSON.stringify(last)}`);
}

if (!reuseProfile) {
  await rm(profileDir, { recursive: true, force: true });
}
await mkdir(profileDir, { recursive: true });
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: 1280, height: 800 },
  ...(executablePath ? { executablePath } : {}),
  args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
});

try {
  await browser.addInitScript(() => {
    const identity = () => [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const projection = [
      1.1, 0, 0, 0,
      0, 1.1, 0, 0,
      0, 0, -1.002, -1,
      0, 0, -0.2002, 0,
    ];
    const targetRaySpace = {};
    const targetRayMatrix = identity();
    const inputSource = {
      handedness: "right",
      targetRayMode: "tracked-pointer",
      profiles: ["generic-trigger-squeeze-thumbstick"],
      targetRaySpace,
      gamepad: {
        id: "emulated WebXR controller",
        mapping: "xr-standard",
        connected: true,
        axes: [0, 0],
        buttons: Array.from({ length: 6 }, () => ({
          pressed: false,
          touched: false,
          value: 0,
        })),
      },
    };

    class EmulatedXrSession extends EventTarget {
      constructor() {
        super();
        this.inputSources = [inputSource];
        this.renderState = null;
        this.ended = false;
        this.timers = new Set();
      }

      updateRenderState(state) {
        this.renderState = state;
      }

      async requestReferenceSpace(type) {
        return { type };
      }

      requestAnimationFrame(callback) {
        if (this.ended) return 0;
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          if (this.ended) return;
          const layer = this.renderState.baseLayer;
          const halfWidth = Math.floor(layer.framebufferWidth / 2);
          const makeView = (eye, x) => ({
            eye,
            projectionMatrix: projection,
            transform: { matrix: identity(), inverse: { matrix: identity() } },
            viewport: { x, y: 0, width: halfWidth, height: layer.framebufferHeight },
          });
          const frame = {
            getViewerPose: () => ({
              transform: { matrix: identity() },
              views: [makeView("left", 0), makeView("right", halfWidth)],
            }),
            getPose: (space) => space === targetRaySpace
              ? { emulatedPosition: false, transform: { matrix: targetRayMatrix } }
              : null,
          };
          callback(performance.now(), frame);
        }, 16);
        this.timers.add(timer);
        return timer;
      }

      async end() {
        if (this.ended) return;
        this.ended = true;
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        this.dispatchEvent(new Event("end"));
      }
    }

    class EmulatedXrWebGlLayer {
      constructor(session, gl) {
        this.session = session;
        this.gl = gl;
        this.framebufferWidth = Math.max(2, gl.drawingBufferWidth);
        this.framebufferHeight = Math.max(1, gl.drawingBufferHeight);
        this.framebuffer = gl.createFramebuffer();
        this.color = gl.createTexture();
        this.depthStencil = gl.createRenderbuffer();
        gl.bindTexture(gl.TEXTURE_2D, this.color);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,
          this.framebufferWidth, this.framebufferHeight, 0,
          gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthStencil);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8,
          this.framebufferWidth, this.framebufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D, this.color, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT,
          gl.RENDERBUFFER, this.depthStencil);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error("emulated XR framebuffer is incomplete");
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      getViewport(view) {
        return view.viewport;
      }
    }

    const session = new EmulatedXrSession();
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: {
        isSessionSupported: async (mode) => mode === "immersive-vr",
        requestSession: () => Promise.resolve(session),
      },
    });
    Object.defineProperty(window, "XRWebGLLayer", {
      configurable: true,
      value: EmulatedXrWebGlLayer,
    });
    Object.defineProperty(WebGL2RenderingContext.prototype, "makeXRCompatible", {
      configurable: true,
      value: async function makeXRCompatible() {},
    });
    window.__emulatedXrSession = session;
    window.__emulatedXrTrigger = (down) => {
      inputSource.gamepad.buttons[0] = {
        pressed: down === true,
        touched: down === true,
        value: down === true ? 1 : 0,
      };
    };
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const url = new URL(
    `harness/play.html?autostart=1&dist=${encodeURIComponent(dist)}&vr=1&shellmap=0&videos=0`,
    server.url,
  );
  stage("loading shipping VR page");
  await page.goto(url.href, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#overlay")?.classList.contains("hidden")
    || document.querySelector("#progress")?.textContent?.startsWith("FAILED:"),
  null, { timeout: timeoutMs, polling: 100 });
  const launch = await page.evaluate(() => ({
    running: document.querySelector("#overlay")?.classList.contains("hidden") === true,
    progress: document.querySelector("#progress")?.textContent ?? "",
  }));
  assert.equal(launch.running, true, `real threaded runtime failed to start: ${launch.progress}`);
  stage("real threaded runtime started");
  const inputGeometry = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const rect = canvas?.getBoundingClientRect();
    const size = window.CnCPort?.state?.engineDisplaySize;
    return rect && size ? {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      engineWidth: size.width,
      engineHeight: size.height,
    } : null;
  });
  assert.ok(inputGeometry?.engineWidth > 0 && inputGeometry?.engineHeight > 0,
    `runtime viewport has no input geometry: ${JSON.stringify(inputGeometry)}`);
  const support = await page.evaluate(() => window.CnCPort.probeWebXrSession());
  assert.equal(support.support?.immersiveVrSupported, true,
    `emulated immersive session was not available: ${JSON.stringify(support)}`);
  stage("immersive support probe passed");
  await page.evaluate(() => window.CnCPort.startWebXrSession());
  await enterSkirmish(page, inputGeometry);
  stage("real skirmish input path is active");
  await waitForEngineRay(page);
  stage("real engine view produced a tracked world ray");

  const active = await page.evaluate(() => window.CnCPort.rpc("webxrPickRayState"));
  assert.equal(active.ok, true, `native WebXR ray diagnostic failed: ${JSON.stringify(active)}`);
  const rayLength = expectFiniteRay(active.result);
  const running = await page.evaluate(() => window.CnCPort.getWebXrState());
  assert.equal(running.viewCount, 2, "emulated compositor must supply distinct eye views");
  assert.equal(running.renderer?.controllerPointer?.target, "ui",
    "tracked controller ray must retain the floating engine UI target");
  await page.evaluate(() => window.__emulatedXrTrigger(true));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__emulatedXrTrigger(false));
  const driven = await rpc(page, "webxrPickRayState");
  assert.ok(driven.result.consumed > active.result.consumed,
    `controller trigger did not reach the original W3D picker: ${JSON.stringify(driven)}`);
  stage("native W3DView accepted the transformed ray");

  await page.evaluate(() => window.CnCPort.stopWebXrSession("world-input-smoke"));
  await page.waitForFunction(async () => {
    const state = await window.CnCPort.rpc("webxrPickRayState");
    return state?.ok === true && state.result?.active === false;
  }, null, { timeout: 30000, polling: 100 });
  const cleared = await page.evaluate(() => window.CnCPort.rpc("webxrPickRayState"));
  assert.ok(cleared.result.clears > active.result.clears,
    "ending immersive mode must clear the native W3DView ray");
  stage("session shutdown cleared native input state");

  console.log(JSON.stringify({
    ok: true,
    smoke: "webxr-world-input",
    rayLength,
    active: active.result,
    cleared: cleared.result,
    runtimeFrames: running.frames,
    rendererFrames: running.renderer?.frames ?? 0,
  }));
} finally {
  await browser.close();
  await server.close();
  if (!reuseProfile) await rm(profileDir, { recursive: true, force: true });
}
