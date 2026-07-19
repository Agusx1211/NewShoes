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

async function waitForSelectionMode(page, label, predicate, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    last = await rpc(page, "querySelection");
    if (last?.ok === true && predicate(last.result?.modes ?? {})) return last.result.modes;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function aimWebXrAtEnginePoint(page, geometry, point, label) {
  assert.ok(Number.isFinite(point?.x) && Number.isFinite(point?.y),
    `${label} has no engine coordinates: ${JSON.stringify(point)}`);
  let diagnostic = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const spatial = await page.evaluate(() => ({
      comfort: window.CnCPort.getWebXrState()?.renderer?.comfort,
      displaySize: window.CnCPort?.state?.engineDisplaySize,
    }));
    const width = Number(spatial.displaySize?.width ?? geometry.engineWidth);
    const height = Number(spatial.displaySize?.height ?? geometry.engineHeight);
    assert.ok(Number(spatial.comfort?.panelWidthMeters) > 0 && width > 1 && height > 1,
      `${label} has no floating-panel geometry: ${JSON.stringify(spatial)}`);
    await page.evaluate(([x, y, targetWidth, targetHeight, panelWidth]) =>
      window.__emulatedXrPointAtEnginePixel(
        x, y, targetWidth, targetHeight, panelWidth,
      ), [point.x, point.y, width, height, spatial.comfort.panelWidthMeters]);
    const deadline = Date.now() + 2500;
    let pointer = null;
    while (Date.now() < deadline) {
      pointer = await page.evaluate(() =>
        window.CnCPort.getWebXrState()?.renderer?.controllerPointer ?? null);
      if (pointer?.target === "ui"
          && Math.abs(pointer.point?.x - point.x) <= 2
          && Math.abs(pointer.point?.y - point.y) <= 2) return pointer;
      await page.waitForTimeout(50);
    }
    diagnostic = { point, width, height, pointer };
    if (attempt < 2) await fullFrame(page);
  }
  throw new Error(`${label} controller ray missed the floating panel target: ${JSON.stringify(
    diagnostic)}`);
}

async function clickEngineButton(page, geometry, button, label) {
  assert.equal(button?.clickable, true, `${label} is not clickable`);
  const point = { x: button.centerX, y: button.centerY };
  await aimWebXrAtEnginePoint(page, geometry, point, label);
  await page.evaluate(() => window.__emulatedXrTrigger(true));
  await page.waitForTimeout(80);
  await fullFrame(page);
  await page.evaluate(() => window.__emulatedXrTrigger(false));
  await page.waitForTimeout(80);
  await fullFrame(page);
  return point;
}

async function enterSkirmish(page, geometry) {
  await aimWebXrAtEnginePoint(page, geometry, { x: 32, y: 32 }, "main menu wake-up");
  await page.waitForTimeout(250);
  await fullFrame(page);
  await aimWebXrAtEnginePoint(page, geometry, { x: 96, y: 96 }, "main menu wake-up");
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

async function tapWebXrButton(page, index) {
  await page.evaluate((buttonIndex) => window.__emulatedXrButton(buttonIndex, true), index);
  await page.waitForTimeout(80);
  await fullFrame(page);
  await page.evaluate((buttonIndex) => window.__emulatedXrButton(buttonIndex, false), index);
  await page.waitForTimeout(80);
  await fullFrame(page);
}

function visibleQuitMenuButton(quitMenu, fieldNames) {
  if (!quitMenu?.visible) return null;
  return fieldNames.map((name) => quitMenu[name]).find((button) =>
    button?.clickable === true && button.hidden === false && button.managerHidden === false) ?? null;
}

async function waitForAgentUiWindow(page, name, predicate = () => true, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    const response = await rpc(page, "agentUiSnapshot");
    last = response?.result?.windows?.find((window) => window.name === name) ?? null;
    if (last && predicate(last)) return last;
    await page.waitForTimeout(50);
  }
  throw new Error(`${name} did not reach the expected UI state: ${JSON.stringify(last)}`);
}

async function driveWebXrModalFlow(page, geometry) {
  await tapWebXrButton(page, 5);
  const opened = await waitForFrame(page, "tracked-controller quit menu", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true
      && candidate?.clientState?.gameplay?.gamePaused === true
      && visibleQuitMenuButton(candidate.clientState.quitMenu,
        ["buttonOptionsFull", "buttonOptionsNoSave"]) !== null);
  const optionsButton = visibleQuitMenuButton(opened.clientState.quitMenu,
    ["buttonOptionsFull", "buttonOptionsNoSave"]);
  assert.ok(optionsButton, `quit menu has no tracked options target: ${JSON.stringify(
    opened.clientState.quitMenu)}`);
  await clickEngineButton(page, geometry, optionsButton, "quit-menu Options button");

  let backButton = await waitForAgentUiWindow(page, "OptionsMenu.wnd:ButtonBack",
    (window) => window.visible === true && window.interactive === true);
  const backTarget = {
    clickable: true,
    centerX: backButton.rect.x + Math.floor(backButton.rect.width / 2),
    centerY: backButton.rect.y + Math.floor(backButton.rect.height / 2),
  };
  await aimWebXrAtEnginePoint(page, geometry,
    { x: backTarget.centerX, y: backTarget.centerY }, "options Back button hover");
  backButton = await waitForAgentUiWindow(page, "OptionsMenu.wnd:ButtonBack",
    (window) => window.hilited === true);
  assert.equal(backButton.hilited, true,
    "tracked pointer movement must drive the original options hover state");
  await clickEngineButton(page, geometry, backTarget, "options Back button");

  const returned = await waitForFrame(page, "quit menu after options", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === true
      && candidate?.clientState?.gameplay?.gamePaused === true
      && visibleQuitMenuButton(candidate.clientState.quitMenu,
        ["buttonReturnFull", "buttonReturnNoSave"]) !== null);
  const returnButton = visibleQuitMenuButton(returned.clientState.quitMenu,
    ["buttonReturnFull", "buttonReturnNoSave"]);
  assert.ok(returnButton, `quit menu has no tracked return target: ${JSON.stringify(
    returned.clientState.quitMenu)}`);
  await clickEngineButton(page, geometry, returnButton, "quit-menu Return button");
  await waitForFrame(page, "tracked-controller match resume", (candidate) =>
    candidate?.clientState?.quitMenu?.visible === false
      && candidate?.clientState?.gameplay?.gamePaused === false);
  return {
    quitOpened: true,
    optionsOpened: true,
    optionsHover: backButton.hilited === true,
    resumed: true,
  };
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

async function waitForWebXrAudioListener(page, label, predicate, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    await fullFrame(page);
    const response = await rpc(page, "browserMss3DSamplePlaybackRuntime");
    last = response?.browserMss3DSamplePlaybackRuntime ?? null;
    if (predicate(last)) return last;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
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
    const viewerMatrix = identity();
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
        this.visibilityState = "visible";
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
            transform: {
              matrix: [...viewerMatrix],
              inverse: { matrix: [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                -viewerMatrix[12], -viewerMatrix[13], -viewerMatrix[14], 1,
              ] },
            },
            viewport: { x, y: 0, width: halfWidth, height: layer.framebufferHeight },
          });
          const frame = {
            getViewerPose: () => ({
              transform: { matrix: [...viewerMatrix] },
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
    window.__emulatedXrButton = (index, down) => {
      inputSource.gamepad.buttons[index] = {
        pressed: down === true,
        touched: down === true,
        value: down === true ? 1 : 0,
      };
    };
    window.__emulatedXrAxes = (x, y) => {
      inputSource.gamepad.axes = [Number(x), Number(y)];
    };
    window.__emulatedXrPointAtEnginePixel = (x, y, width, height, panelWidth) => {
      const pixelWidth = Math.max(2, Number(width));
      const pixelHeight = Math.max(2, Number(height));
      const widthMeters = Number(panelWidth);
      const heightMeters = widthMeters * pixelHeight / pixelWidth;
      const u = Math.max(0, Math.min(1, Number(x) / (pixelWidth - 1)));
      const v = Math.max(0, Math.min(1, Number(y) / (pixelHeight - 1)));
      targetRayMatrix[12] = (u - 0.5) * widthMeters;
      targetRayMatrix[13] = (0.5 - v) * heightMeters;
      targetRayMatrix[14] = 0;
    };
    window.__emulatedXrViewerPosition = (x, y, z) => {
      viewerMatrix[12] = Number(x);
      viewerMatrix[13] = Number(y);
      viewerMatrix[14] = Number(z);
    };
    window.__emulatedXrNeutral = () => {
      inputSource.gamepad.axes = [0, 0];
      for (let index = 0; index < inputSource.gamepad.buttons.length; index += 1) {
        inputSource.gamepad.buttons[index] = { pressed: false, touched: false, value: 0 };
      }
    };
    window.__emulatedXrVisibility = (visibilityState) => {
      session.visibilityState = String(visibilityState);
      session.dispatchEvent(new Event("visibilitychange"));
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
  stage("tracked controller operated the floating main shell and skirmish setup");
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
  await page.waitForTimeout(100);
  const driven = await rpc(page, "webxrPickRayState");
  assert.ok(driven.result.consumed > active.result.consumed,
    `controller trigger did not reach the original W3D picker: ${JSON.stringify(driven)}`);
  stage("native W3DView accepted the transformed ray");

  const centeredListener = await waitForWebXrAudioListener(page,
    "centered WebXR audio listener",
    (runtime) => runtime?.webXrListenerActive === true
      && runtime?.lastListener?.mode === "webxr-head-tracked"
      && runtime?.lastListener?.xrOffset != null);
  const worldScale = Number(running.renderer?.comfort?.worldScale ?? 1);
  const expectedHeadOffset = 0.25 * (1 / 0.3048) / worldScale;
  await page.evaluate(() => window.__emulatedXrViewerPosition(0.25, 0, 0));
  const movedListener = await waitForWebXrAudioListener(page,
    "head-tracked WebXR audio listener",
    (runtime) => {
      const offset = runtime?.lastListener?.xrOffset;
      return Math.abs(Math.hypot(offset?.x, offset?.y, offset?.z)
        - expectedHeadOffset) < 0.001;
    });
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(movedListener.lastListener.position[axis]
        - movedListener.lastListener.enginePosition[axis]
        - movedListener.lastListener.xrOffset[axis]) < 0.001,
    `XR head movement must offset the engine-owned listener on ${axis}`);
  }
  const orientation = movedListener.lastListener.orientation;
  assert.ok(Math.abs(Math.hypot(orientation.frontX, orientation.frontY, orientation.frontZ) - 1)
      < 0.001
    && Math.abs(Math.hypot(orientation.upX, orientation.upY, orientation.upZ) - 1) < 0.001,
  "XR viewer orientation must publish normalized listener directions");
  assert.ok(movedListener.webXrListenerAppliedUpdates
      > centeredListener.webXrListenerAppliedUpdates,
  "XR frames must apply new head poses to the Web Audio listener");
  stage("head pose updated the engine-owned HRTF listener at world scale");

  const modalFlow = await driveWebXrModalFlow(page, inputGeometry);
  stage("tracked controller operated the quit modal and nested options surface");

  await page.evaluate(() => {
    window.__emulatedXrButton(2, true);
    window.__emulatedXrTrigger(true);
  });
  await waitForSelectionMode(page, "single-controller force-fire layer",
    (modes) => modes.forceAttack === true);
  await page.evaluate(() => window.__emulatedXrNeutral());
  await waitForSelectionMode(page, "single-controller force-fire release",
    (modes) => modes.forceAttack === false);

  await page.evaluate(() => window.__emulatedXrButton(3, true));
  await waitForSelectionMode(page, "single-controller waypoint layer",
    (modes) => modes.waypoint === true);
  await page.evaluate(() => window.__emulatedXrButton(3, false));
  await waitForSelectionMode(page, "single-controller waypoint release",
    (modes) => modes.waypoint === false);

  await page.evaluate(() => window.__emulatedXrButton(4, true));
  await waitForSelectionMode(page, "single-controller selection layer",
    (modes) => modes.preferSelection === true);
  await page.evaluate(() => window.__emulatedXrButton(4, false));
  await waitForSelectionMode(page, "single-controller selection release",
    (modes) => modes.preferSelection === false);

  const cameraBeforeWheel = await fullFrame(page);
  const cameraHeightBeforeWheel = Number(
    cameraBeforeWheel?.clientState?.view?.currentHeightAboveGround,
  );
  assert.ok(Number.isFinite(cameraHeightBeforeWheel),
    `real camera height is unavailable: ${JSON.stringify(cameraBeforeWheel?.clientState?.view)}`);
  await page.evaluate(() => {
    window.__emulatedXrButton(5, true);
    window.__emulatedXrAxes(0.8, -0.8);
  });
  await waitForSelectionMode(page, "single-controller camera layer", (modes) =>
    modes.cameraRotateRight === true && modes.cameraZoomIn === false);
  const cameraAfterWheel = await waitForFrame(page, "single-controller wheel zoom",
    (candidate) => Number(candidate?.clientState?.view?.currentHeightAboveGround)
      < cameraHeightBeforeWheel - 1);
  const cameraHeightAfterWheel = Number(
    cameraAfterWheel.clientState.view.currentHeightAboveGround,
  );
  await page.evaluate(() => {
    window.__emulatedXrAxes(0, 0);
    window.__emulatedXrButton(5, false);
  });
  await waitForSelectionMode(page, "single-controller camera release", (modes) =>
    modes.cameraRotateRight === false && modes.cameraZoomIn === false);
  stage("original modifier, camera-key, and mouse-wheel translators accepted controller layers");

  await page.evaluate(() => {
    window.__emulatedXrButton(2, true);
    window.__emulatedXrTrigger(true);
  });
  await waitForSelectionMode(page, "pre-suspension held input",
    (modes) => modes.forceAttack === true);
  await page.evaluate(() => window.__emulatedXrVisibility("visible-blurred"));
  await page.waitForFunction(() =>
    window.CnCPort.getWebXrState().renderer?.inputSuspended === true);
  await waitForSelectionMode(page, "visibility suspension release",
    (modes) => modes.forceAttack === false);
  const suspendedRay = await rpc(page, "webxrPickRayState");
  assert.equal(suspendedRay.result.active, false,
    "losing exclusive XR visibility must clear the native pick ray");

  await page.evaluate(() => window.__emulatedXrVisibility("visible"));
  await page.waitForFunction(() =>
    window.CnCPort.getWebXrState().renderer?.inputSuspended === false);
  await page.waitForTimeout(250);
  const heldAfterResume = await rpc(page, "querySelection");
  assert.equal(heldAfterResume.result.modes.forceAttack, false,
    "held controls must not reactivate before returning to neutral");
  assert.equal((await rpc(page, "webxrPickRayState")).result.active, false,
    "a held trigger must not restore the pick ray on visibility resume");
  await page.evaluate(() => window.__emulatedXrNeutral());
  stage(`neutral controller state: ${JSON.stringify(await page.evaluate(() => ({
    axes: window.__emulatedXrSession.inputSources[0].gamepad.axes,
    buttons: window.__emulatedXrSession.inputSources[0].gamepad.buttons,
  })))}`);
  await waitForEngineRay(page);
  stage("visibility suspension released input and resumed only after neutral");

  await page.evaluate(() => window.CnCPort.stopWebXrSession("world-input-smoke"));
  await page.waitForFunction(async () => {
    const state = await window.CnCPort.rpc("webxrPickRayState");
    return state?.ok === true && state.result?.active === false;
  }, null, { timeout: 30000, polling: 100 });
  const cleared = await page.evaluate(() => window.CnCPort.rpc("webxrPickRayState"));
  assert.ok(cleared.result.clears > active.result.clears,
    "ending immersive mode must clear the native W3DView ray");
  const restoredListener = await waitForWebXrAudioListener(page,
    "restored engine audio listener",
    (runtime) => runtime?.webXrListenerActive === false
      && runtime?.lastListener?.mode === "engine");
  assert.deepEqual(restoredListener.lastListener.position,
    restoredListener.lastListener.enginePosition,
    "session shutdown must restore the unmodified engine listener");
  stage("session shutdown cleared native input state");

  console.log(JSON.stringify({
    ok: true,
    smoke: "webxr-world-input",
    rayLength,
    active: active.result,
    cleared: cleared.result,
    runtimeFrames: running.frames,
    rendererFrames: running.renderer?.frames ?? 0,
    audioHeadOffset: movedListener.lastListener.xrOffset,
    audioListenerRestored: restoredListener.webXrListenerActive === false,
    modalFlow,
    wheelCameraZoom: {
      before: cameraHeightBeforeWheel,
      after: cameraHeightAfterWheel,
    },
  }));
} finally {
  await browser.close();
  await server.close();
  if (!reuseProfile) await rm(profileDir, { recursive: true, force: true });
}
