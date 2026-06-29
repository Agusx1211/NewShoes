import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const desktopScreenshot = resolve(screenshotDir, "harness-smoke-desktop.png");
const canvasScreenshot = resolve(screenshotDir, "harness-smoke-canvas.png");
const clearCanvasScreenshot = resolve(screenshotDir, "harness-smoke-clear-canvas.png");
const d3d8ClearCanvasScreenshot = resolve(screenshotDir, "harness-smoke-d3d8-clear-canvas.png");
const d3d8TwoTextureAlphaCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-two-texture-alpha-canvas.png",
);
const d3d8GeneratedTexCoordCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-generated-texcoord-canvas.png",
);
const d3d8FvfTexCoordSizesCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-fvf-texcoord-sizes-canvas.png",
);
const d3d8TextureTransformCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-texture-transform-canvas.png",
);
const d3d8Stage1TextureTransformCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-stage1-texture-transform-canvas.png",
);
const d3d8ClipPlaneCanvasScreenshot = resolve(screenshotDir, "harness-smoke-d3d8-clip-plane-canvas.png");
const d3d8DirectionalLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-directional-light-canvas.png",
);
const d3d8MultiDirectionalLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-multi-directional-light-canvas.png",
);
const d3d8SpecularLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-specular-light-canvas.png",
);
const d3d8SpecularOffAxisLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-specular-offaxis-light-canvas.png",
);
const d3d8SpecularTransformedLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-specular-transformed-light-canvas.png",
);
const d3d8NormalizeNormalsCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-normalize-normals-canvas.png",
);
const d3d8LocalViewerCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-local-viewer-canvas.png",
);
const d3d8PointLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-point-light-canvas.png",
);
const d3d8PointQuadraticLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-point-quadratic-light-canvas.png",
);
const d3d8PointRangeLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-point-range-light-canvas.png",
);
const d3d8PointMixedLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-point-mixed-light-canvas.png",
);
const d3d8SpotLightCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-spot-light-canvas.png",
);
const d3d8SpotFalloffCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-spot-falloff-canvas.png",
);
const d3d8LitMaterialSourcesCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-lit-material-sources-canvas.png",
);
const d3d8LitSpecularMaterialSourceCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-lit-specular-material-source-canvas.png",
);
const d3d8LitEmissiveColor1MaterialSourceCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-lit-emissive-color1-material-source-canvas.png",
);
const d3d8LitEmissiveColor2MaterialSourceCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-d3d8-lit-emissive-color2-material-source-canvas.png",
);
const ww3dAABoxCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-aabox-canvas.png");
const ww3dSceneCameraCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-scene-camera-canvas.png");
const ww3dRTSSceneCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-rts-scene-canvas.png");
const ww3dDisplaySceneCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-display-scene-canvas.png");
const ww3dRender2DCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-render2d-canvas.png");
const ww3dRender2DSentenceCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-render2d-sentence-canvas.png",
);
const ww3dDisplayStringCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-string-canvas.png",
);
const ww3dDisplayDrawImageCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-display-drawimage-canvas.png");
const ww3dDisplayDrawImageAdditiveCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-drawimage-additive-canvas.png",
);
const ww3dDisplayDrawImageSolidCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-drawimage-solid-canvas.png",
);
const ww3dDisplayDrawImageGrayscaleCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-drawimage-grayscale-canvas.png",
);
const ww3dDisplayFillRectCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-display-fillrect-canvas.png");
const ww3dDisplayLineCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-display-line-canvas.png");
const ww3dDisplayLineGradientCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-line-gradient-canvas.png",
);
const ww3dDisplayOpenRectCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-display-openrect-canvas.png");
const ww3dDisplayRectClockCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-rectclock-canvas.png",
);
const ww3dDisplayRemainingRectClockCanvasScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-display-remaining-rectclock-canvas.png",
);
const ww3dTexturedMeshCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-textured-mesh-canvas.png");
const ww3dTerrainTileCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-terrain-tile-canvas.png");
const gdiFontCanvasScreenshot = resolve(screenshotDir, "harness-smoke-gdi-font-canvas.png");
const cursorCanvasScreenshot = resolve(screenshotDir, "harness-smoke-cursor-css-canvas.png");
const expectWasm = process.env.EXPECT_WASM === "1";

await mkdir(screenshotDir, { recursive: true });

async function waitForCanvasSize(page, width, height) {
  await page.waitForFunction(async ({ expectedWidth, expectedHeight }) => {
    const result = await window.CnCPort.rpc("state");
    return result.state.canvas.width === expectedWidth
      && result.state.canvas.height === expectedHeight
      && result.state.graphics.drawingBufferWidth === expectedWidth
      && result.state.graphics.drawingBufferHeight === expectedHeight;
  }, { expectedWidth: width, expectedHeight: height });

  const result = await page.evaluate(() => window.CnCPort.rpc("state"));
  return result.state;
}

async function waitForMainLoopTicks(page, startingFrame, startingTicks, tickCount) {
  const deadline = Date.now() + 2000;
  let result = await page.evaluate(() => window.CnCPort.rpc("state"));

  while (Date.now() < deadline) {
    if (result.state.mainLoop.running
        && result.state.frame >= startingFrame + tickCount
        && result.state.mainLoop.ticks >= startingTicks + tickCount) {
      return result.state;
    }

    await page.waitForTimeout(20);
    result = await page.evaluate(() => window.CnCPort.rpc("state"));
  }

  throw new Error(`Main loop did not advance ${tickCount} ticks: ${JSON.stringify(result.state)}`);
}

async function waitForBrowserInput(page, predicate, label) {
  const deadline = Date.now() + 2000;
  let result = await page.evaluate(() => window.CnCPort.rpc("state"));

  while (Date.now() < deadline) {
    if (predicate(result.state.browserInput)) {
      return result.state.browserInput;
    }

    await page.waitForTimeout(20);
    result = await page.evaluate(() => window.CnCPort.rpc("state"));
  }

  throw new Error(`${label} browser input state not observed: ${JSON.stringify(result.state.browserInput)}`);
}

async function waitForHarnessState(page, predicate, label) {
  const deadline = Date.now() + 2000;
  let result = await page.evaluate(() => window.CnCPort.rpc("state"));

  while (Date.now() < deadline) {
    if (predicate(result.state)) {
      return result.state;
    }

    await page.waitForTimeout(20);
    result = await page.evaluate(() => window.CnCPort.rpc("state"));
  }

  throw new Error(`${label} harness state not observed: ${JSON.stringify(result.state)}`);
}

async function assertQueuedMessages(page, expectedMessages, label) {
  for (let index = 0; index < expectedMessages.length; ++index) {
    const expected = expectedMessages[index];
    const result = await page.evaluate(() => window.CnCPort.rpc("messageQueueProbe"));
    const probe = result.probe;
    const removed = probe?.removed;
    const expectedCount = expectedMessages.length - index;
    const mismatches = [];

    if (!result.ok || probe?.source !== "browser_win32_message_queue") {
      mismatches.push("probe failed");
    }
    if (probe?.beforeCount !== expectedCount) {
      mismatches.push(`beforeCount ${probe?.beforeCount} !== ${expectedCount}`);
    }
    if (probe?.afterRemoveCount !== expectedCount - 1) {
      mismatches.push(`afterRemoveCount ${probe?.afterRemoveCount} !== ${expectedCount - 1}`);
    }
    if (removed?.message !== expected.message) {
      mismatches.push(`message ${removed?.message} !== ${expected.message}`);
    }
    for (const field of ["wParam", "lParam"]) {
      if (Object.prototype.hasOwnProperty.call(expected, field) && removed?.[field] !== expected[field]) {
        mismatches.push(`${field} ${removed?.[field]} !== ${expected[field]}`);
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`${label} queued message ${index} mismatch (${mismatches.join(", ")}): ${JSON.stringify(result)}`);
    }
  }
}

function assertWasmTiming(state, label) {
  const timing = state.timing;
  if (!timing?.ok || timing.source !== "emscripten_get_now") {
    throw new Error(`${label} timing probe missing: ${JSON.stringify(timing)}`);
  }

  for (const field of ["bootMs", "lastTickMs", "lastDeltaMs"]) {
    if (!Number.isFinite(timing[field])) {
      throw new Error(`${label} timing field ${field} is not finite: ${JSON.stringify(timing)}`);
    }
  }

  if (timing.lastTickMs < timing.bootMs || timing.lastDeltaMs < 0) {
    throw new Error(`${label} timing is not monotonic: ${JSON.stringify(timing)}`);
  }
}

function assertOriginalMouseSemanticMessage(message, expected, label) {
  const mismatches = [];
  const hasExpectedPositionX = Object.prototype.hasOwnProperty.call(expected, "positionX");
  const hasExpectedPositionY = Object.prototype.hasOwnProperty.call(expected, "positionY");
  const hasDragDelta = Object.prototype.hasOwnProperty.call(expected, "dragDeltaX")
    || Object.prototype.hasOwnProperty.call(expected, "dragDeltaY");
  const hasWheelClicks = Object.prototype.hasOwnProperty.call(expected, "wheelClicks");
  const hasTimestamp = expected.hasTimestamp === true;

  if (!message) {
    throw new Error(`${label} raw mouse stream message missing`);
  }
  if (message.hasPosition !== true) {
    mismatches.push(`hasPosition ${message.hasPosition} !== true`);
  }
  if (message.hasPosition === true && message.positionX !== message.x) {
    mismatches.push(`positionX ${message.positionX} !== legacy x ${message.x}`);
  }
  if (message.hasPosition === true && message.positionY !== message.y) {
    mismatches.push(`positionY ${message.positionY} !== legacy y ${message.y}`);
  }
  if (hasExpectedPositionX && message.positionX !== expected.positionX) {
    mismatches.push(`positionX ${message.positionX} !== ${expected.positionX}`);
  }
  if (hasExpectedPositionY && message.positionY !== expected.positionY) {
    mismatches.push(`positionY ${message.positionY} !== ${expected.positionY}`);
  }
  if (message.hasModifiers !== true) {
    mismatches.push(`hasModifiers ${message.hasModifiers} !== true`);
  }
  if (message.modifiers !== (expected.modifiers ?? 0)) {
    mismatches.push(`modifiers ${message.modifiers} !== ${expected.modifiers ?? 0}`);
  }
  if (message.hasTimestamp !== hasTimestamp) {
    mismatches.push(`hasTimestamp ${message.hasTimestamp} !== ${hasTimestamp}`);
  }
  if (hasTimestamp) {
    if (!Number.isFinite(message.timestamp) || message.timestamp < 0) {
      mismatches.push(`timestamp ${message.timestamp} is not a non-negative number`);
    }
  } else if (message.timestamp !== -1) {
    mismatches.push(`timestamp ${message.timestamp} !== -1`);
  }
  if (message.hasDragDelta !== hasDragDelta) {
    mismatches.push(`hasDragDelta ${message.hasDragDelta} !== ${hasDragDelta}`);
  }
  if (message.dragDeltaX !== (hasDragDelta ? expected.dragDeltaX : 0)) {
    mismatches.push(`dragDeltaX ${message.dragDeltaX} !== ${hasDragDelta ? expected.dragDeltaX : 0}`);
  }
  if (message.dragDeltaY !== (hasDragDelta ? expected.dragDeltaY : 0)) {
    mismatches.push(`dragDeltaY ${message.dragDeltaY} !== ${hasDragDelta ? expected.dragDeltaY : 0}`);
  }
  if (message.hasWheelClicks !== hasWheelClicks) {
    mismatches.push(`hasWheelClicks ${message.hasWheelClicks} !== ${hasWheelClicks}`);
  }
  if (message.wheelClicks !== (hasWheelClicks ? expected.wheelClicks : 0)) {
    mismatches.push(`wheelClicks ${message.wheelClicks} !== ${hasWheelClicks ? expected.wheelClicks : 0}`);
  }

  if (mismatches.length > 0) {
    throw new Error(`${label} raw mouse semantic fields mismatch (${mismatches.join(", ")}): ${JSON.stringify(message)}`);
  }
}

function assertBrowserInputInitial(state, label) {
  const input = state.browserInput;
  if (!input || input.source !== "browser_win32_input_shim") {
    throw new Error(`${label} browser input shim state missing: ${JSON.stringify(input)}`);
  }

  if (input.cursor?.available !== false
      || input.cursor.x !== 0
      || input.cursor.y !== 0
      || input.messageQueue?.count !== 0
      || input.messageQueue?.overflowed !== false
      || input.keys?.f6?.down !== false
      || input.keys?.f6?.pressedSinceLastQuery !== false) {
    throw new Error(`${label} browser input initial state mismatch: ${JSON.stringify(input)}`);
  }
}

function pixelHasColor(pixel, threshold = 8) {
  return Array.isArray(pixel) && pixel.slice(0, 3).some((component) => component > threshold);
}

function pixelsApproximatelyEqual(left, right, tolerance = 1) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === 4
    && right.length === 4
    && left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
}

function floatVectorApproximatelyEqual(left, right, tolerance = 0.00001) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
}

function expectedD3D8ViewportGlBox(d3dViewport = {}, browserViewport = {}) {
  const renderTarget = browserViewport.renderTarget ?? {};
  const drawingBuffer = browserViewport.drawingBuffer ?? {};
  const targetWidth = Math.max(1, Math.trunc(Number(renderTarget.width ?? d3dViewport.width ?? 1)));
  const targetHeight = Math.max(1, Math.trunc(Number(renderTarget.height ?? d3dViewport.height ?? 1)));
  const bufferWidth = Math.max(0, Math.trunc(Number(drawingBuffer.width ?? 0)));
  const bufferHeight = Math.max(0, Math.trunc(Number(drawingBuffer.height ?? 0)));
  const scaleX = bufferWidth / targetWidth;
  const scaleY = bufferHeight / targetHeight;
  const x = Math.round(Number(d3dViewport.x ?? 0) * scaleX);
  const top = Math.round(Number(d3dViewport.y ?? 0) * scaleY);
  const width = Math.round(Number(d3dViewport.width ?? 0) * scaleX);
  const height = Math.round(Number(d3dViewport.height ?? 0) * scaleY);
  return [x, Math.max(0, bufferHeight - top - height), width, height];
}

function pixelLooksRed(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] <= 80
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function pixelLooksGreen(pixel) {
  return Array.isArray(pixel)
    && pixel[0] <= 80
    && pixel[1] >= 180
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function pixelLooksYellow(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] >= 180
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function pixelLooksBlack(pixel, threshold = 8) {
  return Array.isArray(pixel)
    && pixel[0] <= threshold
    && pixel[1] <= threshold
    && pixel[2] <= threshold
    && pixel[3] >= 200;
}

function pixelLooksBlue(pixel) {
  return Array.isArray(pixel)
    && pixel[0] <= 80
    && pixel[1] <= 80
    && pixel[2] >= 180
    && pixel[3] >= 200;
}

function pixelLooksBlueClear(pixel) {
  return Array.isArray(pixel)
    && pixel[0] <= 16
    && pixel[1] <= 16
    && pixel[2] >= 112
    && pixel[2] <= 144
    && pixel[3] >= 200;
}

function assertWin32Timing(state, label, previous = null) {
  const timing = state.win32Timing;
  if (!timing?.ok || timing.source !== "browser_win32_shim") {
    throw new Error(`${label} Win32 timing probe missing: ${JSON.stringify(timing)}`);
  }

  if (timing.frequency !== 1000000) {
    throw new Error(`${label} unexpected QPC frequency: ${JSON.stringify(timing)}`);
  }

  for (const field of ["bootQpc", "lastQpc", "bootTimeGetTime", "lastTimeGetTime", "bootTickCount", "lastTickCount"]) {
    if (!Number.isFinite(timing[field])) {
      throw new Error(`${label} Win32 timing field ${field} is not finite: ${JSON.stringify(timing)}`);
    }
  }

  if (timing.lastQpc < timing.bootQpc
      || timing.lastTimeGetTime < timing.bootTimeGetTime
      || timing.lastTickCount < timing.bootTickCount) {
    throw new Error(`${label} Win32 timing is not monotonic: ${JSON.stringify(timing)}`);
  }

  if (previous && timing.lastQpc < previous.lastQpc) {
    throw new Error(`${label} Win32 QPC regressed: ${JSON.stringify({ previous, timing })}`);
  }
}

function assertWwDebugProbe(state, label) {
  const probe = state.debugProbe;
  if (!probe?.ok || probe.source !== "WWVegas/WWDebug/wwdebug.cpp") {
    throw new Error(`${label} WWDebug probe missing: ${JSON.stringify(probe)}`);
  }

  if (!probe.handlersInstalled
      || probe.messageCount < 3
      || probe.information < 1
      || probe.warnings < 1
      || probe.errors < 1
      || probe.asserts < 1) {
    throw new Error(`${label} WWDebug counters incomplete: ${JSON.stringify(probe)}`);
  }

  if (probe.lastType !== "error" || !String(probe.lastAssert ?? "").includes("cnc_port_debug_probe")) {
    throw new Error(`${label} WWDebug last values unexpected: ${JSON.stringify(probe)}`);
  }
}

function assertCommonDebugLog(state, label) {
  const probe = state.commonDebugLog;
  if (!probe?.ok || probe.source !== "GameEngine/Common/System/Debug.cpp") {
    throw new Error(`${label} Common DebugLog probe missing: ${JSON.stringify(probe)}`);
  }

  if (!probe.console || probe.logCount < 1 || !String(probe.lastMessage ?? "").includes("cnc-port debuglog")) {
    throw new Error(`${label} Common DebugLog values incomplete: ${JSON.stringify(probe)}`);
  }
}

function assertGlobalDataProbe(state, label) {
  const probe = state.globalDataProbe;
  if (!probe?.ok || probe.source !== "GameEngine/Common/GlobalData.cpp") {
    throw new Error(`${label} GlobalData probe missing: ${JSON.stringify(probe)}`);
  }

  if (probe.resolution?.x !== 800 || probe.resolution?.y !== 600) {
    throw new Error(`${label} GlobalData resolution defaults changed: ${JSON.stringify(probe)}`);
  }

  if (probe.defaults?.networkDisconnectTime !== 5000
      || probe.defaults?.networkPlayerTimeoutTime !== 60000
      || probe.defaults?.doubleClickTimeMs !== 500
      || probe.shellMap?.name !== "Maps\\ShellMap1\\ShellMap1.map"
      || !String(probe.userDataPath ?? "").includes("Command and Conquer Generals Zero Hour Data")
      || !probe.setTimeOfDay?.ok) {
    throw new Error(`${label} GlobalData defaults incomplete: ${JSON.stringify(probe)}`);
  }
}

function assertCommandLineProbe(state, label) {
  const probe = state.commandLineProbe;
  if (!probe?.ok || probe.source !== "GameEngine/Common/CommandLine.cpp") {
    throw new Error(`${label} CommandLine probe missing: ${JSON.stringify(probe)}`);
  }

  if (probe.resolution?.x !== 1024
      || probe.resolution?.y !== 768
      || !probe.windowed
      || probe.shellMapOn
      || probe.playSizzle
      || probe.animateWindows
      || !probe.scriptDebug
      || !probe.particleEdit
      || probe.playStats !== 23
      || probe.chipSetType !== 1) {
    throw new Error(`${label} CommandLine mutations incomplete: ${JSON.stringify(probe)}`);
  }
}

function assertCDManagerProbe(state, label) {
  const probe = state.cdManagerProbe;
  if (!probe?.ok || probe.source !== "Win32Device/Common/Win32CDManager.cpp") {
    throw new Error(`${label} CD manager probe missing: ${JSON.stringify(probe)}`);
  }

  if (!probe.created || !probe.initialized || probe.driveCount !== 0 || !probe.noCdDrives) {
    throw new Error(`${label} CD manager browser no-CD state incomplete: ${JSON.stringify(probe)}`);
  }
}

function assertFileSystemProbe(state, label) {
  const probe = state.fileSystemProbe;
  if (!probe?.ok || probe.source !== "GameEngine/Common/System/FileSystem.cpp") {
    throw new Error(`${label} FileSystem probe missing: ${JSON.stringify(probe)}`);
  }

  if (!probe.local?.ok
      || probe.local.path !== "cnc-port-fs-probe/local-file.txt"
      || probe.local.bytes <= 0
      || !probe.local.directory
      || !probe.local.write
      || !probe.local.exists
      || !probe.local.cache
      || !probe.local.info
      || probe.local.infoSize !== probe.local.bytes
      || !probe.local.list
      || !probe.local.read
      || !probe.local.missingCache) {
    throw new Error(`${label} FileSystem local facade incomplete: ${JSON.stringify(probe.local)}`);
  }

  if (probe.archive?.attempted) {
    throw new Error(`${label} FileSystem archive branch should wait for registered archives: ${JSON.stringify(probe.archive)}`);
  }
}

function assertGameNetworkProbe(state, label) {
  const probe = state.gameNetworkProbe;
  if (!probe?.ok || probe.source !== "GameEngine/GameNetwork") {
    throw new Error(`${label} GameNetwork probe missing: ${JSON.stringify(probe)}`);
  }

  if (!probe.commandIds?.ok
      || probe.commandIds.maxFramesAhead !== 128
      || probe.commandIds.minRunAhead !== 10
      || probe.commandIds.frameDataLength !== 258
      || probe.commandIds.framesToKeep !== 65) {
    throw new Error(`${label} GameNetwork command-id constants changed: ${JSON.stringify(probe)}`);
  }

  if (!probe.frameData?.ok
      || probe.frameData.frame !== 77
      || probe.frameData.frameCommandCount !== 0
      || probe.frameData.readyState !== 2) {
    throw new Error(`${label} GameNetwork FrameData state mismatch: ${JSON.stringify(probe.frameData)}`);
  }

  if (!probe.frameDataManager?.ok
      || probe.frameDataManager.quitFrame !== 42
      || probe.frameDataManager.readyState !== 2) {
    throw new Error(`${label} GameNetwork FrameDataManager state mismatch: ${JSON.stringify(probe.frameDataManager)}`);
  }

  if (!probe.packetRoundTrip?.ok
      || probe.packetRoundTrip.length <= 0
      || probe.packetRoundTrip.commands !== 1
      || probe.packetRoundTrip.relay !== 15
      || probe.packetRoundTrip.executionFrame !== 1234
      || probe.packetRoundTrip.playerId !== 3
      || probe.packetRoundTrip.commandId !== 42
      || probe.packetRoundTrip.frameCommandCount !== 5) {
    throw new Error(`${label} GameNetwork packet round-trip mismatch: ${JSON.stringify(probe.packetRoundTrip)}`);
  }
}

function assertStartupAssets(state, label, expectedStatus, expectedOk = false) {
  const startupAssets = state.startupAssets;
  if (startupAssets?.ok !== expectedOk || startupAssets.status !== expectedStatus) {
    throw new Error(`${label} startup asset state mismatch: ${JSON.stringify(startupAssets)}`);
  }
}

function assertStartupSingletonsMissing(state, label) {
  const probe = state.startupSingletons;
  if (!probe
      || probe.attempted !== true
      || probe.ok !== false
      || probe.status !== "missing_runtime_archives"
      || probe.nextRequired !== "runtimeArchiveSet"
      || probe.runtimeArchiveRegistered !== false
      || probe.runtimeGlobalsInstalled !== false) {
    throw new Error(`${label} startup singleton state mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertAudioRuntimeAssets(state, label, expectedReady) {
  const audioAssets = state.audioRuntimeAssets;
  if (!audioAssets
      || audioAssets.source !== "runtime BIG archive manifest"
      || audioAssets.ready !== expectedReady
      || audioAssets.browserAudioDevice !== false
      || audioAssets.webAudioRuntime !== false
      || audioAssets.nextRequired !== (expectedReady ? "browserAudioDevice" : "audioPayloadArchives")) {
    throw new Error(`${label} audio runtime asset state mismatch: ${JSON.stringify(audioAssets)}`);
  }

  for (const key of [
    "audioZH",
    "audioEnglishZH",
    "speechZH",
    "speechEnglishZH",
    "musicZH",
    "music",
  ]) {
    if (audioAssets.required?.[key] !== expectedReady) {
      throw new Error(`${label} audio runtime archive ${key} mismatch: ${JSON.stringify(audioAssets)}`);
    }
  }
}

function assertMssStartupProbe(probe, label) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser startup handle contract probe"
      || probe.runtimeReady !== false
      || probe.startupBoundaryReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.calls?.AIL_set_redist_directory !== true
      || probe.calls?.AIL_startup !== true
      || probe.calls?.AIL_quick_startup !== true
      || probe.calls?.AIL_quick_handles !== true
      || probe.calls?.AIL_enumerate_3D_providers !== 2
      || probe.calls?.AIL_open_3D_provider !== true
      || probe.calls?.AIL_open_3D_listener !== true
      || probe.calls?.AIL_allocate_sample_handle !== true
      || probe.calls?.AIL_allocate_3D_sample_handle !== true
      || probe.calls?.AIL_set_file_callbacks !== true
      || probe.calls?.AIL_shutdown !== true
      || probe.quickStartup?.result !== 1
      || probe.quickStartup?.useDigital !== 1
      || probe.quickStartup?.outputRate !== 44100
      || probe.quickStartup?.outputBits !== 16
      || probe.quickStartup?.outputChannels !== 2
      || probe.digitalHandle?.nonNull !== true
      || probe.digitalHandle?.emulatedDirectSound !== true
      || probe.provider?.preferredName !== "Miles Fast 2D Positional Audio"
      || probe.provider?.openResult !== 0
      || !Number.isFinite(probe.handles?.listener)
      || !Number.isFinite(probe.handles?.sample2D)
      || !Number.isFinite(probe.handles?.sample3D)
      || probe.shutdown?.called !== true
      || probe.shutdown?.quickStartupActive !== false) {
    throw new Error(`${label} MSS startup probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertMssSampleLifecycleProbe(probe, label) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser 2D sample lifecycle contract probe"
      || probe.runtimeReady !== false
      || probe.sampleLifecycleReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.quickStartup?.result !== 1
      || probe.quickStartup?.digitalHandle !== true
      || probe.calls?.AIL_allocate_sample_handle !== true
      || probe.calls?.AIL_init_sample !== true
      || probe.calls?.AIL_set_sample_user_data !== true
      || probe.calls?.AIL_sample_user_data !== 77
      || probe.calls?.AIL_set_sample_file !== true
      || probe.calls?.AIL_register_EOS_callback !== true
      || probe.calls?.AIL_set_sample_volume !== 96
      || probe.calls?.AIL_set_sample_pan !== 32
      || Math.abs((probe.calls?.AIL_set_sample_volume_pan?.volume ?? 0) - 0.625) > 0.001
      || Math.abs((probe.calls?.AIL_set_sample_volume_pan?.pan ?? 0) - 0.25) > 0.001
      || probe.calls?.AIL_set_sample_playback_rate !== 22050
      || probe.calls?.AIL_set_sample_loop_count !== 3
      || probe.calls?.AIL_set_sample_ms_position !== 125
      || probe.calls?.AIL_start_sample !== 2
      || probe.calls?.AIL_stop_sample !== 4
      || probe.calls?.AIL_resume_sample !== 2
      || probe.calls?.AIL_end_sample !== 1
      || probe.calls?.AIL_release_sample_handle !== true
      || probe.callback?.count !== 1
      || !Number.isFinite(probe.callback?.lastHandle)
      || !Number.isFinite(probe.handle?.sample2D)
      || probe.handle?.validBeforeRelease !== true
      || probe.handle?.released !== true
      || probe.handle?.statusAfterRelease !== 1
      || probe.handle?.userDataAfterRelease !== 0) {
    throw new Error(`${label} MSS sample lifecycle probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertMssStreamLifecycleProbe(probe, label) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser stream lifecycle contract probe"
      || probe.runtimeReady !== false
      || probe.streamLifecycleReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.quickStartup?.result !== 1
      || probe.quickStartup?.digitalHandle !== true
      || probe.calls?.AIL_open_stream !== true
      || probe.calls?.AIL_open_stream_by_sample !== true
      || probe.calls?.AIL_register_stream_callback !== true
      || probe.calls?.AIL_set_stream_volume !== 88
      || probe.calls?.AIL_set_stream_pan !== 48
      || Math.abs((probe.calls?.AIL_set_stream_volume_pan?.volume ?? 0) - 0.75) > 0.001
      || Math.abs((probe.calls?.AIL_set_stream_volume_pan?.pan ?? 0) - 0.375) > 0.001
      || probe.calls?.AIL_set_stream_playback_rate !== 32000
      || probe.calls?.AIL_set_stream_loop_block?.start !== 5
      || probe.calls?.AIL_set_stream_loop_block?.end !== 125
      || probe.calls?.AIL_set_stream_loop_count !== 2
      || probe.calls?.AIL_set_stream_ms_position !== 250
      || probe.calls?.AIL_start_stream !== 2
      || probe.calls?.AIL_pause_stream_stop !== 4
      || probe.calls?.AIL_pause_stream_resume !== 2
      || probe.calls?.AIL_close_stream !== true
      || probe.callback?.count !== 0
      || probe.callback?.lastHandle !== 0
      || !Number.isFinite(probe.handle?.stream)
      || !Number.isFinite(probe.handle?.bySampleStream)
      || probe.handle?.validBeforeClose !== true
      || probe.handle?.closed !== true
      || probe.handle?.bySampleClosed !== true
      || probe.handle?.statusAfterClose !== 1
      || probe.handle?.panAfterClose !== 0) {
    throw new Error(`${label} MSS stream lifecycle probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertMss3DSampleLifecycleProbe(probe, label) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser 3D sample lifecycle contract probe"
      || probe.runtimeReady !== false
      || probe.sample3DLifecycleReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.provider?.enumerated !== true
      || probe.provider?.id !== 1
      || probe.provider?.opened !== true
      || probe.provider?.speakerType !== 4
      || probe.provider?.closed !== true
      || !Number.isFinite(probe.listener?.handle)
      || probe.listener?.opened !== true
      || probe.listener?.position?.x !== 10
      || probe.listener?.position?.y !== 20
      || probe.listener?.position?.z !== 30
      || probe.listener?.orientation?.frontY !== 1
      || probe.listener?.orientation?.upZ !== -1
      || probe.listener?.closed !== true
      || probe.calls?.AIL_allocate_3D_sample_handle !== true
      || probe.calls?.AIL_set_3D_user_data !== 7
      || probe.calls?.AIL_set_3D_object_user_data !== 99
      || probe.calls?.AIL_set_3D_sample_file !== 1
      || probe.calls?.AIL_register_3D_EOS_callback !== true
      || Math.abs((probe.calls?.AIL_set_3D_sample_distances?.min ?? 0) - 12) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_sample_distances?.max ?? 0) - 345) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_position?.x ?? 0) - 100) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_position?.y ?? 0) - 200) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_position?.z ?? 0) - 300) > 0.001
      || probe.calls?.AIL_set_3D_sample_volume !== 66
      || probe.calls?.AIL_set_3D_sample_loop_count !== 3
      || probe.calls?.AIL_set_3D_sample_offset !== 17
      || probe.calls?.AIL_set_3D_sample_playback_rate !== 22050
      || Math.abs((probe.calls?.AIL_set_3D_sample_occlusion ?? 0) - 0.25) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_sample_effects_level ?? 0) - 0.5) > 0.001
      || probe.calls?.AIL_start_3D_sample !== 2
      || probe.calls?.AIL_stop_3D_sample !== 4
      || probe.calls?.AIL_resume_3D_sample !== 2
      || probe.calls?.AIL_end_3D_sample !== 1
      || probe.calls?.AIL_release_3D_sample_handle !== true
      || probe.callback?.count !== 1
      || probe.callback?.lastHandle !== probe.handle?.sample
      || !Number.isFinite(probe.handle?.sample)
      || probe.handle?.validBeforeRelease !== true
      || probe.handle?.released !== true
      || probe.handle?.statusAfterRelease !== 1) {
    throw new Error(`${label} MSS 3D sample lifecycle probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertOriginalEngineStartup(state, label, expectedStatus) {
  const startup = state.originalEngineStartup;
  if (!startup
      || startup.ok !== false
      || startup.initAttempted !== false
      || startup.source !== "GameEngine/Common/GameEngine.cpp::init"
      || startup.status !== expectedStatus) {
    throw new Error(`${label} original engine startup state mismatch: ${JSON.stringify(startup)}`);
  }

  const frontier = startup.deviceFactoryFrontier;
  const entries = frontier?.entries ?? [];
  const byFactory = new Map(entries.map((entry) => [entry.factory, entry]));
  const audioFiles = frontier?.audioStartupFiles;
  const milesAudio = frontier?.milesAudioDeviceFrontier;
  const milesCalls = milesAudio?.openDeviceCalls ?? [];
  const expectedMilesNextRequired = audioFiles?.ready ? "webAudioPlaybackBackend" : "audioStartupFiles";
  if (!frontier
      || frontier.probeOnly !== true
      || frontier.ready !== false
      || frontier.nextRequired !== "startupAssets"
      || frontier.firstUnownedInitFactory !== "createAudioManager"
      || frontier.firstUnownedInitLine !== 434
      || audioFiles?.source !== "GameAudio.cpp::AudioManager::init"
      || audioFiles?.ready !== false
      || audioFiles?.audioSettingsIni !== false
      || audioFiles?.defaultMusicIni !== false
      || audioFiles?.musicIni !== false
      || audioFiles?.defaultSoundEffectsIni !== false
      || audioFiles?.soundEffectsIni !== false
      || audioFiles?.defaultSpeechIni !== false
      || audioFiles?.speechIni !== false
      || audioFiles?.defaultVoiceIni !== false
      || audioFiles?.voiceIni !== false
      || audioFiles?.miscAudioIni !== false
      || milesAudio?.source !== "MilesAudioManager.cpp::init/openDevice + Mss.H"
      || milesAudio?.ready !== false
      || milesAudio?.runtimeReady !== false
      || milesAudio?.compileOnly !== false
      || milesAudio?.probeOnly !== true
      || milesAudio?.startupBoundaryReady !== true
      || milesAudio?.playbackReady !== false
      || milesAudio?.browserTarget !== "Web Audio"
      || milesAudio?.nextRequired !== expectedMilesNextRequired
      || milesAudio?.startupProbeCommand !== "mssStartupProbe"
      || milesAudio?.initLine !== 444
      || milesAudio?.audioManagerInitLine !== 446
      || milesAudio?.openDeviceCallLine !== 454
      || milesAudio?.fileCallbacksLine !== 458
      || milesAudio?.openDeviceLine !== 1444
      || milesAudio?.mssShim?.compileOnly !== false
      || milesAudio?.mssShim?.startupBoundaryReady !== true
      || milesAudio?.mssShim?.playbackReady !== false
      || milesAudio?.mssShim?.AIL_startup !== "stateful"
      || milesAudio?.mssShim?.AIL_shutdown !== "stateful"
      || milesAudio?.mssShim?.AIL_quick_startup !== "stateful"
      || milesAudio?.mssShim?.AIL_quick_handles !== "stateful"
      || milesAudio?.mssShim?.AIL_set_file_callbacks !== "stateful"
      || milesAudio?.mssShim?.AIL_enumerate_3D_providers !== "stateful"
      || milesAudio?.mssShim?.AIL_open_3D_provider !== "stateful"
      || milesAudio?.mssShim?.AIL_open_3D_listener !== "stateful"
      || milesAudio?.mssShim?.AIL_allocate_sample_handle !== "stateful"
      || milesAudio?.mssShim?.AIL_allocate_3D_sample_handle !== "stateful"
      || milesCalls.length !== 8
      || milesCalls[0]?.call !== "AIL_set_redist_directory"
      || milesCalls[0]?.line !== 1450
      || milesCalls[0]?.ready !== true
      || milesCalls[1]?.call !== "AIL_startup"
      || milesCalls[1]?.line !== 1451
      || milesCalls[1]?.ready !== true
      || milesCalls[2]?.call !== "AIL_quick_startup"
      || milesCalls[2]?.line !== 1458
      || milesCalls[2]?.ready !== true
      || milesCalls[3]?.call !== "AIL_quick_handles"
      || milesCalls[3]?.line !== 1461
      || milesCalls[3]?.ready !== true
      || milesCalls[4]?.call !== "buildProviderList"
      || milesCalls[4]?.line !== 1464
      || milesCalls[4]?.ready !== true
      || milesCalls[5]?.call !== "selectProvider"
      || milesCalls[5]?.line !== 1470
      || milesCalls[5]?.ready !== true
      || milesCalls[6]?.call !== "refreshCachedVariables"
      || milesCalls[6]?.line !== 1473
      || milesCalls[6]?.ready !== false
      || milesCalls[7]?.call !== "initDelayFilter"
      || milesCalls[7]?.line !== 1479
      || milesCalls[7]?.ready !== false
      || frontier.fileSystemReady !== false
      || frontier.startupFilesReady !== false
      || frontier.startupSingletonsReady !== false
      || frontier.setupReady !== false
      || frontier.factoryMappings?.CreateGameEngine !== "Win32GameEngine"
      || frontier.factoryMappings?.createAudioManager !== "MilesAudioManager"
      || frontier.factoryMappings?.createGameClient !== "W3DGameClient"
      || byFactory.get("CreateGameEngine")?.line !== 1122
      || byFactory.get("createLocalFileSystem")?.line !== 342
      || byFactory.get("createArchiveFileSystem")?.line !== 353
      || byFactory.get("createAudioManager")?.line !== 434
      || byFactory.get("createAudioManager")?.ready !== false
      || byFactory.get("createWebBrowser")?.called !== false) {
    throw new Error(`${label} startup device frontier mismatch: ${JSON.stringify(frontier)}`);
  }

  if (startup.browserDeviceLayer?.ready !== false
      || startup.browserDeviceLayer?.createGameEngine !== false
      || startup.originalSetup?.probeOnly !== true
      || startup.originalSetup?.runtimeOwned !== false
      || startup.originalSetup?.globalData !== true
      || startup.originalSetup?.commandLine !== true
      || startup.originalSetup?.cdManager !== true
      || startup.originalSetup?.startupSingletons !== false
      || startup.originalSetup?.subsystemList !== false
      || startup.originalSetup?.gameLODManager !== false
      || startup.originalSetup?.mapCache !== false
      || startup.browserDeviceLayer?.cdManager !== true
      || startup.browserDeviceLayer?.localFileSystem !== true
      || startup.browserDeviceLayer?.archiveFileSystem !== false
      || startup.browserDeviceLayer?.startupSingletons !== false
      || startup.browserDeviceLayer?.gameClient !== false
      || startup.browserDeviceLayer?.audioManager !== false
      || startup.browserDeviceLayer?.display !== false
      || startup.browserDeviceLayer?.input !== false) {
    throw new Error(`${label} should report browser device layer as not runtime-ready: ${JSON.stringify(startup.browserDeviceLayer)}`);
  }
}

async function assertHarnessLog(page, message, textSubstring) {
  const result = await page.evaluate(() => window.CnCPort.rpc("state"));
  const found = result.logs.some((entry) => (
    entry.message === message
    && String(entry.data?.text ?? "").includes(textSubstring)
  ));
  if (!found) {
    throw new Error(`Harness log missing ${message}/${textSubstring}: ${JSON.stringify(result.logs)}`);
  }
}

async function assertFreshFrameOwnerReset(browser, harnessUrl, command, expectedSource) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(harnessUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

    const bootResult = await page.evaluate((source) => window.CnCPort.rpc("boot", {
      source,
    }), `${command} first-reset smoke`);
    if (!bootResult.ok || !bootResult.state.booted || bootResult.state.wasm !== "loaded") {
      throw new Error(`${command} first-reset boot failed: ${JSON.stringify(bootResult)}`);
    }

    const resetResult = await page.evaluate((resetCommand) =>
      window.CnCPort.rpc(resetCommand), command);
    if (!resetResult.ok
        || resetResult.probe?.source !== expectedSource
        || resetResult.probe?.initialized !== true
        || resetResult.probe?.lastRan !== false
        || resetResult.probe?.stream?.count !== 0
        || resetResult.probe?.commandList?.countAfterPropagate !== 0
        || resetResult.state?.booted !== true) {
      throw new Error(`${command} first reset mismatch: ${JSON.stringify(resetResult)}`);
    }
  } finally {
    await page.close();
  }
}

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();

  const harnessUrl = new URL("harness/index.html", server.url).href;

  if (expectWasm) {
    await assertFreshFrameOwnerReset(
      browser,
      harnessUrl,
      "resetOriginalKeyboardFrameInput",
      "browser_original_keyboard_frame_input",
    );
    await assertFreshFrameOwnerReset(
      browser,
      harnessUrl,
      "resetOriginalMouseFrameInput",
      "browser_original_mouse_frame_input",
    );
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "harness smoke",
  }));
  if (!bootResult.ok || !bootResult.state.booted) {
    throw new Error(`Boot RPC failed: ${JSON.stringify(bootResult)}`);
  }
  if (expectWasm && bootResult.state.wasm !== "loaded") {
    throw new Error(`Expected wasm module to load: ${JSON.stringify(bootResult.state)}`);
  }
  if (expectWasm && !bootResult.state.originalEngineLinked) {
    throw new Error(`Expected original engine probe to be linked: ${JSON.stringify(bootResult.state)}`);
  }
  if (expectWasm && bootResult.state.originalCoreProbe?.logicRandomValue !== 14) {
    throw new Error(`Original RandomValue probe mismatch: ${JSON.stringify(bootResult.state.originalCoreProbe)}`);
  }
  if (expectWasm && bootResult.state.originalCoreProbe?.logicSeedCRC !== 2826459604) {
    throw new Error(`Original RandomValue seed CRC mismatch: ${JSON.stringify(bootResult.state.originalCoreProbe)}`);
  }
  if (expectWasm && bootResult.state.archiveMount?.registered !== false) {
    throw new Error(`Archive set should not be registered before asset mount: ${JSON.stringify(bootResult.state.archiveMount)}`);
  }
  if (expectWasm) {
    assertStartupAssets(bootResult.state, "boot", "missing_runtime_archives");
    assertStartupSingletonsMissing(bootResult.state, "boot");
    assertAudioRuntimeAssets(bootResult.state, "boot", false);
    assertOriginalEngineStartup(bootResult.state, "boot", "missing_runtime_archives");
    assertWasmTiming(bootResult.state, "boot");
    assertWin32Timing(bootResult.state, "boot");
    assertWwDebugProbe(bootResult.state, "boot");
    assertCommonDebugLog(bootResult.state, "boot");
    assertGlobalDataProbe(bootResult.state, "boot");
    assertCommandLineProbe(bootResult.state, "boot");
    assertCDManagerProbe(bootResult.state, "boot");
    assertFileSystemProbe(bootResult.state, "boot");
    assertGameNetworkProbe(bootResult.state, "boot");
    assertBrowserInputInitial(bootResult.state, "boot");
    const mssStartupResult = await page.evaluate(() => window.CnCPort.rpc("mssStartupProbe"));
    if (!mssStartupResult.ok) {
      throw new Error(`MSS startup probe RPC failed: ${JSON.stringify(mssStartupResult)}`);
    }
    assertMssStartupProbe(mssStartupResult.probe, "boot");
    const mssSampleLifecycleResult = await page.evaluate(() => window.CnCPort.rpc("mssSampleLifecycleProbe"));
    if (!mssSampleLifecycleResult.ok) {
      throw new Error(`MSS sample lifecycle probe RPC failed: ${JSON.stringify(mssSampleLifecycleResult)}`);
    }
    assertMssSampleLifecycleProbe(mssSampleLifecycleResult.probe, "boot");
    const mssStreamLifecycleResult = await page.evaluate(() => window.CnCPort.rpc("mssStreamLifecycleProbe"));
    if (!mssStreamLifecycleResult.ok) {
      throw new Error(`MSS stream lifecycle probe RPC failed: ${JSON.stringify(mssStreamLifecycleResult)}`);
    }
    assertMssStreamLifecycleProbe(mssStreamLifecycleResult.probe, "boot");
    const mss3DSampleLifecycleResult = await page.evaluate(() => window.CnCPort.rpc("mss3DSampleLifecycleProbe"));
    if (!mss3DSampleLifecycleResult.ok) {
      throw new Error(`MSS 3D sample lifecycle probe RPC failed: ${JSON.stringify(mss3DSampleLifecycleResult)}`);
    }
    assertMss3DSampleLifecycleProbe(mss3DSampleLifecycleResult.probe, "boot");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: boot");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: wwdebug information");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: wwdebug assert");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: globaldata probe ok=1");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: commandline probe ok=1");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: cdmanager probe ok=1");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: filesystem probe ok=1");
    await assertHarnessLog(page, "wasm stdout", "cnc-port: gamenetwork probe ok=1");
    await assertHarnessLog(page, "wasm stderr", "cnc-port debuglog frame=1");
  }
  if (bootResult.state.graphics?.api !== "webgl2" || !bootResult.state.graphics?.ok) {
    throw new Error(`Expected browser harness to initialize WebGL2: ${JSON.stringify(bootResult.state.graphics)}`);
  }
  if (bootResult.state.graphics.drawingBufferWidth !== 1280
      || bootResult.state.graphics.drawingBufferHeight !== 720) {
    throw new Error(`Unexpected initial WebGL2 drawing buffer: ${JSON.stringify(bootResult.state)}`);
  }

  if (expectWasm) {
    const canvasBox = await page.locator("#viewport").boundingBox();
    if (!canvasBox) {
      throw new Error("Viewport canvas has no bounding box");
    }
    await page.mouse.move(canvasBox.x + 321, canvasBox.y + 123);
    const inputAfterPointer = await waitForBrowserInput(
      page,
      (input) => input?.cursor?.available
        && input.cursor.x === 321
        && input.cursor.y === 123
        && input.messageQueue?.count >= 1,
      "pointer move",
    );
    if (inputAfterPointer.keys?.f6?.down) {
      throw new Error(`Pointer input should not mutate key state: ${JSON.stringify(inputAfterPointer)}`);
    }

    await page.keyboard.down("F6");
    await waitForBrowserInput(
      page,
      (input) => input?.keys?.f6?.down === true
        && input.keys.f6.pressedSinceLastQuery === true
        && input.messageQueue?.count >= 2,
      "F6 keydown",
    );
    const inputProbe = await page.evaluate(() => window.CnCPort.rpc("inputProbe"));
    if (!inputProbe.ok
        || !inputProbe.probe?.cursor?.ok
        || inputProbe.probe.cursor.x !== 321
        || inputProbe.probe.cursor.y !== 123
        || inputProbe.probe.f6?.first !== 0x8001
        || inputProbe.probe.f6?.second !== 0x8000) {
      throw new Error(`Browser input probe did not observe Win32 cursor/key state: ${JSON.stringify(inputProbe)}`);
    }

    await page.keyboard.up("F6");
    await waitForBrowserInput(
      page,
      (input) => input?.keys?.f6?.down === false && input.keys.f6.pressedSinceLastQuery === false,
      "F6 keyup",
    );

    const resetInputResult = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetInputResult.ok
        || resetInputResult.state.browserInput?.messageQueue?.count !== 0
        || resetInputResult.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Browser input reset did not clear Win32 message queue: ${JSON.stringify(resetInputResult)}`);
    }

    const wmKeyDown = 0x0100;
    const wmChar = 0x0102;
    const wmImeStartComposition = 0x010d;
    const wmImeEndComposition = 0x010e;
    const wmImeComposition = 0x010f;
    const wmSetCursor = 0x0020;
    const wmMouseMove = 0x0200;
    const wmLeftButtonDown = 0x0201;
    const gcsCompStr = 0x0008;
    const gcsResultStr = 0x0800;
    const vkShift = 0x10;
    const vkA = 0x41;
    const vkF6 = 0x75;
    const charA = 0x41;
    const keyStateUp = 0x0001;
    const keyStateDown = 0x0002;
    const keyStateLShift = 0x0010;
    const keyStateAutoRepeat = 0x0100;
    const keyA = 0x1e;
    const keyEsc = 0x01;
    const keyLShift = 0x2a;
    const keyLost = 0xff;
    const mouseCursorArrow = 2;
    const compositionDraft = "\u304b";
    const compositionResult = "\u754c";
    const compositionDraftChar = compositionDraft.charCodeAt(0);
    const compositionResultChar = compositionResult.charCodeAt(0);
    const mouseMoveLParam = (34 << 16) | 12;
    await page.keyboard.down("Shift");
    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "Shift+A keydown queue",
    );
    const browserTextKeyProbe = await page.evaluate(() => window.CnCPort.rpc("messageQueueProbe"));
    if (!browserTextKeyProbe.ok
        || browserTextKeyProbe.probe.beforeCount !== 3
        || browserTextKeyProbe.probe.peek?.message !== wmKeyDown
        || browserTextKeyProbe.probe.peek?.wParam !== vkShift
        || browserTextKeyProbe.probe.after?.message !== wmKeyDown
        || browserTextKeyProbe.probe.after?.wParam !== vkA) {
      throw new Error(`Browser text key mapping probe mismatch: ${JSON.stringify(browserTextKeyProbe)}`);
    }
    const browserCharProbe = await page.evaluate(() => window.CnCPort.rpc("messageQueueProbe"));
    if (!browserCharProbe.ok
        || browserCharProbe.probe.beforeCount !== 2
        || browserCharProbe.probe.peek?.message !== wmKeyDown
        || browserCharProbe.probe.peek?.wParam !== vkA
        || browserCharProbe.probe.after?.message !== wmChar
        || browserCharProbe.probe.after?.wParam !== charA) {
      throw new Error(`Browser WM_CHAR mapping probe mismatch: ${JSON.stringify(browserCharProbe)}`);
    }
    await page.keyboard.up("A");
    await page.keyboard.up("Shift");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "Shift+A keyup queue",
    );
    const resetTextKeysResult = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetTextKeysResult.ok
        || resetTextKeysResult.state.browserInput?.messageQueue?.count !== 0
        || resetTextKeysResult.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Browser text key reset mismatch: ${JSON.stringify(resetTextKeysResult)}`);
    }

    const initialOriginalKeyboardReset = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!initialOriginalKeyboardReset.ok
        || initialOriginalKeyboardReset.probe?.source !== "browser_original_keyboard_reset"
        || initialOriginalKeyboardReset.probe?.inputFrame !== 0
        || initialOriginalKeyboardReset.probe?.modifiers !== 0
        || initialOriginalKeyboardReset.probe?.keyStatus?.aDown !== false
        || initialOriginalKeyboardReset.probe?.keyStatus?.leftShiftDown !== false
        || initialOriginalKeyboardReset.probe?.focusLost?.pending !== false) {
      throw new Error(`Original Keyboard probe reset did not clear state: ${JSON.stringify(initialOriginalKeyboardReset)}`);
    }

    await page.keyboard.down("Shift");
    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard frame-tick Shift+A queue",
    );
    const originalKeyboardFrameTickProbe = await page.evaluate(() =>
      window.CnCPort.rpc("originalKeyboardFrameTickProbe"));
    const frameTickMessages = originalKeyboardFrameTickProbe.probe?.stream?.messages ?? [];
    if (!originalKeyboardFrameTickProbe.ok
        || originalKeyboardFrameTickProbe.probe?.source !== "browser_original_keyboard_frame_tick"
        || originalKeyboardFrameTickProbe.probe?.ok !== true
        || originalKeyboardFrameTickProbe.probe?.keyboardAttached !== true
        || originalKeyboardFrameTickProbe.probe?.frameTick?.probe !== true
        || originalKeyboardFrameTickProbe.probe?.frameTick?.messageStream !== "probe-local"
        || originalKeyboardFrameTickProbe.probe?.frameTick?.promotedToTickFrame !== false
        || originalKeyboardFrameTickProbe.probe?.queue?.before !== 3
        || originalKeyboardFrameTickProbe.probe?.queue?.drained !== 3
        || originalKeyboardFrameTickProbe.probe?.queue?.ignored !== 1
        || originalKeyboardFrameTickProbe.probe?.stream?.count !== 2
        || frameTickMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || frameTickMessages[0]?.key !== keyLShift
        || (frameTickMessages[0]?.state & keyStateDown) === 0
        || (frameTickMessages[0]?.state & keyStateLShift) === 0
        || frameTickMessages[1]?.typeName !== "MSG_RAW_KEY_DOWN"
        || frameTickMessages[1]?.key !== keyA
        || (frameTickMessages[1]?.state & keyStateDown) === 0
        || (frameTickMessages[1]?.state & keyStateLShift) === 0
        || (originalKeyboardFrameTickProbe.probe?.modifiers & keyStateLShift) === 0) {
      throw new Error(`Original Keyboard frame-tick probe failed: ${JSON.stringify(originalKeyboardFrameTickProbe)}`);
    }
    await page.keyboard.up("A");
    await page.keyboard.up("Shift");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2,
      "original Keyboard frame-tick cleanup queue",
    );
    const resetFrameTickInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameTickInput.ok
        || resetFrameTickInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameTickInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard frame-tick cleanup reset mismatch: ${JSON.stringify(resetFrameTickInput)}`);
    }
    const resetFrameTickKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFrameTickKeyboard.ok
        || resetFrameTickKeyboard.probe?.inputFrame !== 0
        || resetFrameTickKeyboard.probe?.modifiers !== 0
        || resetFrameTickKeyboard.probe?.keyStatus?.aDown !== false
        || resetFrameTickKeyboard.probe?.keyStatus?.leftShiftDown !== false) {
      throw new Error(`Original Keyboard frame-tick state cleanup mismatch: ${JSON.stringify(resetFrameTickKeyboard)}`);
    }

    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2,
      "original Keyboard frame-tick A repeat seed queue",
    );
    const frameTickRepeatSeedProbe = await page.evaluate(() =>
      window.CnCPort.rpc("originalKeyboardFrameTickProbe"));
    const frameTickRepeatSeedMessages = frameTickRepeatSeedProbe.probe?.stream?.messages ?? [];
    if (!frameTickRepeatSeedProbe.ok
        || frameTickRepeatSeedProbe.probe?.source !== "browser_original_keyboard_frame_tick"
        || frameTickRepeatSeedProbe.probe?.ok !== true
        || frameTickRepeatSeedProbe.probe?.frameTick?.probe !== true
        || frameTickRepeatSeedProbe.probe?.queue?.before !== 2
        || frameTickRepeatSeedProbe.probe?.queue?.drained !== 2
        || frameTickRepeatSeedProbe.probe?.queue?.ignored !== 1
        || frameTickRepeatSeedProbe.probe?.inputFrame !== 1
        || frameTickRepeatSeedProbe.probe?.stream?.count !== 1
        || frameTickRepeatSeedMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || frameTickRepeatSeedMessages[0]?.key !== keyA
        || (frameTickRepeatSeedMessages[0]?.state & keyStateDown) === 0
        || (frameTickRepeatSeedMessages[0]?.state & keyStateAutoRepeat) !== 0
        || frameTickRepeatSeedProbe.probe?.keyStatus?.aDown !== true) {
      throw new Error(`Original Keyboard frame-tick repeat seed failed: ${JSON.stringify(frameTickRepeatSeedProbe)}`);
    }

    for (let frame = 0; frame < 10; ++frame) {
      const quietFrameTickRepeatProbe = await page.evaluate(() =>
        window.CnCPort.rpc("originalKeyboardFrameTickProbe"));
      if (!quietFrameTickRepeatProbe.ok
          || quietFrameTickRepeatProbe.probe?.source !== "browser_original_keyboard_frame_tick"
          || quietFrameTickRepeatProbe.probe?.ok !== true
          || quietFrameTickRepeatProbe.probe?.queue?.before !== 0
          || quietFrameTickRepeatProbe.probe?.queue?.drained !== 0
          || quietFrameTickRepeatProbe.probe?.stream?.count !== 0
          || quietFrameTickRepeatProbe.probe?.inputFrame !== frame + 2
          || quietFrameTickRepeatProbe.probe?.keyStatus?.aDown !== true) {
        throw new Error(`Original Keyboard frame-tick repeated before delay frame ${frame}: ${JSON.stringify(quietFrameTickRepeatProbe)}`);
      }
    }

    const frameTickRepeatProbe = await page.evaluate(() =>
      window.CnCPort.rpc("originalKeyboardFrameTickProbe"));
    const frameTickRepeatMessages = frameTickRepeatProbe.probe?.stream?.messages ?? [];
    if (!frameTickRepeatProbe.ok
        || frameTickRepeatProbe.probe?.source !== "browser_original_keyboard_frame_tick"
        || frameTickRepeatProbe.probe?.ok !== true
        || frameTickRepeatProbe.probe?.inputFrame !== 12
        || frameTickRepeatProbe.probe?.stream?.count !== 1
        || frameTickRepeatMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || frameTickRepeatMessages[0]?.key !== keyA
        || (frameTickRepeatMessages[0]?.state & keyStateDown) === 0
        || (frameTickRepeatMessages[0]?.state & keyStateAutoRepeat) === 0
        || frameTickRepeatProbe.probe?.keyStatus?.aDown !== true) {
      throw new Error(`Original Keyboard frame-tick autorepeat did not fire after delay: ${JSON.stringify(frameTickRepeatProbe)}`);
    }

    await page.keyboard.up("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "original Keyboard frame-tick A repeat release queue",
    );
    const resetFrameTickRepeatInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameTickRepeatInput.ok
        || resetFrameTickRepeatInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameTickRepeatInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard frame-tick repeat cleanup reset mismatch: ${JSON.stringify(resetFrameTickRepeatInput)}`);
    }
    const resetFrameTickRepeatKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFrameTickRepeatKeyboard.ok
        || resetFrameTickRepeatKeyboard.probe?.inputFrame !== 0
        || resetFrameTickRepeatKeyboard.probe?.keyStatus?.aDown !== false) {
      throw new Error(`Original Keyboard frame-tick repeat state cleanup mismatch: ${JSON.stringify(resetFrameTickRepeatKeyboard)}`);
    }

    await page.locator("#viewport").focus();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard frame-tick focus-loss setup queue",
    );
    const resetFrameTickFocusSetupInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameTickFocusSetupInput.ok
        || resetFrameTickFocusSetupInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameTickFocusSetupInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard frame-tick focus setup reset mismatch: ${JSON.stringify(resetFrameTickFocusSetupInput)}`);
    }
    const resetFrameTickFocusSetupKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFrameTickFocusSetupKeyboard.ok
        || resetFrameTickFocusSetupKeyboard.probe?.inputFrame !== 0
        || resetFrameTickFocusSetupKeyboard.probe?.modifiers !== 0) {
      throw new Error(`Original Keyboard frame-tick focus setup state reset mismatch: ${JSON.stringify(resetFrameTickFocusSetupKeyboard)}`);
    }

    await page.keyboard.down("Shift");
    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard frame-tick focus-loss held-key queue",
    );
    const frameTickFocusHeldProbe = await page.evaluate(() =>
      window.CnCPort.rpc("originalKeyboardFrameTickProbe"));
    if (!frameTickFocusHeldProbe.ok
        || frameTickFocusHeldProbe.probe?.source !== "browser_original_keyboard_frame_tick"
        || frameTickFocusHeldProbe.probe?.ok !== true
        || frameTickFocusHeldProbe.probe?.stream?.count !== 2
        || frameTickFocusHeldProbe.probe?.keyStatus?.aDown !== true
        || frameTickFocusHeldProbe.probe?.keyStatus?.leftShiftDown !== true
        || (frameTickFocusHeldProbe.probe?.modifiers & keyStateLShift) === 0) {
      throw new Error(`Original Keyboard frame-tick focus-loss setup did not hold Shift+A: ${JSON.stringify(frameTickFocusHeldProbe)}`);
    }

    await page.evaluate(() => document.querySelector("#viewport").blur());
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard frame-tick focus-loss blur queue",
    );
    const frameTickFocusLostProbe = await page.evaluate(() =>
      window.CnCPort.rpc("originalKeyboardFrameTickProbe"));
    const frameTickFocusLostEvents = frameTickFocusLostProbe.probe?.events ?? [];
    if (!frameTickFocusLostProbe.ok
        || frameTickFocusLostProbe.probe?.source !== "browser_original_keyboard_frame_tick"
        || frameTickFocusLostProbe.probe?.ok !== true
        || frameTickFocusLostProbe.probe?.queue?.drained !== 0
        || frameTickFocusLostProbe.probe?.focusLost?.pendingBefore !== true
        || frameTickFocusLostProbe.probe?.focusLost?.delivered !== true
        || frameTickFocusLostProbe.probe?.stream?.count !== 0
        || frameTickFocusLostProbe.probe?.keyStatus?.aDown !== false
        || frameTickFocusLostProbe.probe?.keyStatus?.leftShiftDown !== false
        || frameTickFocusLostProbe.probe?.modifiers !== 0
        || !frameTickFocusLostEvents.some((event) => event.focusLost === true && event.engineKey === keyLost)) {
      throw new Error(`Browser blur did not deliver original Keyboard frame-tick KEY_LOST reset: ${JSON.stringify(frameTickFocusLostProbe)}`);
    }

    await page.keyboard.up("A");
    await page.keyboard.up("Shift");
    const resetFrameTickFocusLostInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameTickFocusLostInput.ok
        || resetFrameTickFocusLostInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameTickFocusLostInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard frame-tick focus-loss cleanup reset mismatch: ${JSON.stringify(resetFrameTickFocusLostInput)}`);
    }
    const resetFrameTickFocusLostKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFrameTickFocusLostKeyboard.ok
        || resetFrameTickFocusLostKeyboard.probe?.inputFrame !== 0
        || resetFrameTickFocusLostKeyboard.probe?.modifiers !== 0
        || resetFrameTickFocusLostKeyboard.probe?.keyStatus?.aDown !== false
        || resetFrameTickFocusLostKeyboard.probe?.keyStatus?.leftShiftDown !== false) {
      throw new Error(`Original Keyboard frame-tick focus-loss state cleanup mismatch: ${JSON.stringify(resetFrameTickFocusLostKeyboard)}`);
    }

    await page.keyboard.down("Shift");
    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard Shift+A queue",
    );
    const originalKeyboardDownProbe = await page.evaluate(() => window.CnCPort.rpc("originalKeyboardInputProbe"));
    const keyboardDownMessages = originalKeyboardDownProbe.probe?.stream?.messages ?? [];
    if (!originalKeyboardDownProbe.ok
        || originalKeyboardDownProbe.probe?.source !== "browser_original_keyboard_stream"
        || originalKeyboardDownProbe.probe?.ok !== true
        || originalKeyboardDownProbe.probe?.keyboardAttached !== true
        || originalKeyboardDownProbe.probe?.queue?.before !== 3
        || originalKeyboardDownProbe.probe?.queue?.drained !== 3
        || originalKeyboardDownProbe.probe?.queue?.ignored !== 1
        || originalKeyboardDownProbe.probe?.stream?.count !== 2
        || keyboardDownMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || keyboardDownMessages[0]?.key !== keyLShift
        || (keyboardDownMessages[0]?.state & keyStateDown) === 0
        || (keyboardDownMessages[0]?.state & keyStateLShift) === 0
        || keyboardDownMessages[1]?.typeName !== "MSG_RAW_KEY_DOWN"
        || keyboardDownMessages[1]?.key !== keyA
        || (keyboardDownMessages[1]?.state & keyStateDown) === 0
        || (keyboardDownMessages[1]?.state & keyStateLShift) === 0
        || (originalKeyboardDownProbe.probe?.modifiers & keyStateLShift) === 0) {
      throw new Error(`DOM Shift+A did not reach original Keyboard stream: ${JSON.stringify(originalKeyboardDownProbe)}`);
    }

    await page.keyboard.up("A");
    await page.keyboard.up("Shift");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2,
      "original Keyboard Shift+A release queue",
    );
    const originalKeyboardUpProbe = await page.evaluate(() => window.CnCPort.rpc("originalKeyboardInputProbe"));
    const keyboardUpMessages = originalKeyboardUpProbe.probe?.stream?.messages ?? [];
    if (!originalKeyboardUpProbe.ok
        || originalKeyboardUpProbe.probe?.ok !== true
        || originalKeyboardUpProbe.probe?.queue?.drained !== 2
        || originalKeyboardUpProbe.probe?.stream?.count !== 2
        || keyboardUpMessages[0]?.typeName !== "MSG_RAW_KEY_UP"
        || keyboardUpMessages[0]?.key !== keyA
        || (keyboardUpMessages[0]?.state & keyStateUp) === 0
        || keyboardUpMessages[1]?.typeName !== "MSG_RAW_KEY_UP"
        || keyboardUpMessages[1]?.key !== keyLShift
        || (keyboardUpMessages[1]?.state & keyStateUp) === 0) {
      throw new Error(`DOM Shift+A release did not reach original Keyboard stream: ${JSON.stringify(originalKeyboardUpProbe)}`);
    }

    const resetOriginalKeyboardResult = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetOriginalKeyboardResult.ok
        || resetOriginalKeyboardResult.state.browserInput?.messageQueue?.count !== 0
        || resetOriginalKeyboardResult.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard probe reset mismatch: ${JSON.stringify(resetOriginalKeyboardResult)}`);
    }
    const resetOriginalKeyboardState = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetOriginalKeyboardState.ok
        || resetOriginalKeyboardState.probe?.inputFrame !== 0
        || resetOriginalKeyboardState.probe?.modifiers !== 0
        || resetOriginalKeyboardState.probe?.keyStatus?.aDown !== false
        || resetOriginalKeyboardState.probe?.keyStatus?.leftShiftDown !== false) {
      throw new Error(`Original Keyboard state reset mismatch: ${JSON.stringify(resetOriginalKeyboardState)}`);
    }

    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2,
      "original Keyboard A repeat seed queue",
    );
    const repeatSeedProbe = await page.evaluate(() => window.CnCPort.rpc("originalKeyboardInputProbe"));
    const repeatSeedMessages = repeatSeedProbe.probe?.stream?.messages ?? [];
    if (!repeatSeedProbe.ok
        || repeatSeedProbe.probe?.ok !== true
        || repeatSeedProbe.probe?.queue?.before !== 2
        || repeatSeedProbe.probe?.queue?.drained !== 2
        || repeatSeedProbe.probe?.queue?.ignored !== 1
        || repeatSeedProbe.probe?.inputFrame !== 1
        || repeatSeedProbe.probe?.stream?.count !== 1
        || repeatSeedMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || repeatSeedMessages[0]?.key !== keyA
        || (repeatSeedMessages[0]?.state & keyStateDown) === 0
        || (repeatSeedMessages[0]?.state & keyStateAutoRepeat) !== 0
        || repeatSeedProbe.probe?.keyStatus?.aDown !== true) {
      throw new Error(`DOM A did not seed original Keyboard repeat state: ${JSON.stringify(repeatSeedProbe)}`);
    }

    for (let frame = 0; frame < 10; ++frame) {
      const quietRepeatProbe = await page.evaluate(() => window.CnCPort.rpc("originalKeyboardInputProbe"));
      if (!quietRepeatProbe.ok
          || quietRepeatProbe.probe?.ok !== true
          || quietRepeatProbe.probe?.queue?.before !== 0
          || quietRepeatProbe.probe?.queue?.drained !== 0
          || quietRepeatProbe.probe?.stream?.count !== 0
          || quietRepeatProbe.probe?.inputFrame !== frame + 2
          || quietRepeatProbe.probe?.keyStatus?.aDown !== true) {
        throw new Error(`Original Keyboard repeated before delay frame ${frame}: ${JSON.stringify(quietRepeatProbe)}`);
      }
    }

    const repeatProbe = await page.evaluate(() => window.CnCPort.rpc("originalKeyboardInputProbe"));
    const repeatMessages = repeatProbe.probe?.stream?.messages ?? [];
    if (!repeatProbe.ok
        || repeatProbe.probe?.ok !== true
        || repeatProbe.probe?.inputFrame !== 12
        || repeatProbe.probe?.stream?.count !== 1
        || repeatMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || repeatMessages[0]?.key !== keyA
        || (repeatMessages[0]?.state & keyStateDown) === 0
        || (repeatMessages[0]?.state & keyStateAutoRepeat) === 0
        || repeatProbe.probe?.keyStatus?.aDown !== true) {
      throw new Error(`Original Keyboard autorepeat did not fire after delay: ${JSON.stringify(repeatProbe)}`);
    }

    await page.keyboard.up("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "original Keyboard A repeat release queue",
    );
    const resetRepeatInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetRepeatInput.ok
        || resetRepeatInput.state.browserInput?.messageQueue?.count !== 0
        || resetRepeatInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard repeat cleanup reset mismatch: ${JSON.stringify(resetRepeatInput)}`);
    }
    const resetRepeatKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetRepeatKeyboard.ok
        || resetRepeatKeyboard.probe?.inputFrame !== 0
        || resetRepeatKeyboard.probe?.keyStatus?.aDown !== false) {
      throw new Error(`Original Keyboard repeat state cleanup mismatch: ${JSON.stringify(resetRepeatKeyboard)}`);
    }

    await page.locator("#viewport").focus();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard focus-loss setup queue",
    );
    const resetFocusSetupInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFocusSetupInput.ok
        || resetFocusSetupInput.state.browserInput?.messageQueue?.count !== 0
        || resetFocusSetupInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard focus setup reset mismatch: ${JSON.stringify(resetFocusSetupInput)}`);
    }
    const resetFocusSetupKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFocusSetupKeyboard.ok
        || resetFocusSetupKeyboard.probe?.inputFrame !== 0
        || resetFocusSetupKeyboard.probe?.modifiers !== 0) {
      throw new Error(`Original Keyboard focus setup state reset mismatch: ${JSON.stringify(resetFocusSetupKeyboard)}`);
    }

    await page.keyboard.down("Shift");
    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard focus-loss held-key queue",
    );
    const focusHeldProbe = await page.evaluate(() => window.CnCPort.rpc("originalKeyboardInputProbe"));
    if (!focusHeldProbe.ok
        || focusHeldProbe.probe?.ok !== true
        || focusHeldProbe.probe?.stream?.count !== 2
        || focusHeldProbe.probe?.keyStatus?.aDown !== true
        || focusHeldProbe.probe?.keyStatus?.leftShiftDown !== true
        || (focusHeldProbe.probe?.modifiers & keyStateLShift) === 0) {
      throw new Error(`Original Keyboard focus-loss setup did not hold Shift+A: ${JSON.stringify(focusHeldProbe)}`);
    }

    await page.evaluate(() => document.querySelector("#viewport").blur());
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard focus-loss blur queue",
    );
    const focusLostProbe = await page.evaluate(() => window.CnCPort.rpc("originalKeyboardInputProbe"));
    const focusLostEvents = focusLostProbe.probe?.events ?? [];
    if (!focusLostProbe.ok
        || focusLostProbe.probe?.ok !== true
        || focusLostProbe.probe?.queue?.drained !== 0
        || focusLostProbe.probe?.focusLost?.pendingBefore !== true
        || focusLostProbe.probe?.focusLost?.delivered !== true
        || focusLostProbe.probe?.stream?.count !== 0
        || focusLostProbe.probe?.keyStatus?.aDown !== false
        || focusLostProbe.probe?.keyStatus?.leftShiftDown !== false
        || focusLostProbe.probe?.modifiers !== 0
        || !focusLostEvents.some((event) => event.focusLost === true && event.engineKey === keyLost)) {
      throw new Error(`Browser blur did not deliver original Keyboard KEY_LOST reset: ${JSON.stringify(focusLostProbe)}`);
    }

    await page.keyboard.up("A");
    await page.keyboard.up("Shift");
    const resetFocusLostInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFocusLostInput.ok
        || resetFocusLostInput.state.browserInput?.messageQueue?.count !== 0
        || resetFocusLostInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard focus-loss cleanup reset mismatch: ${JSON.stringify(resetFocusLostInput)}`);
    }
    const resetFocusLostKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFocusLostKeyboard.ok
        || resetFocusLostKeyboard.probe?.inputFrame !== 0
        || resetFocusLostKeyboard.probe?.modifiers !== 0
        || resetFocusLostKeyboard.probe?.keyStatus?.aDown !== false
        || resetFocusLostKeyboard.probe?.keyStatus?.leftShiftDown !== false) {
      throw new Error(`Original Keyboard focus-loss state cleanup mismatch: ${JSON.stringify(resetFocusLostKeyboard)}`);
    }

    await page.evaluate(({ compositionDraft, compositionResult }) => {
      const viewport = document.querySelector("#viewport");
      viewport.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      viewport.dispatchEvent(new CompositionEvent("compositionupdate", { data: compositionDraft }));
      viewport.dispatchEvent(new CompositionEvent("compositionend", { data: compositionResult }));
    }, { compositionDraft, compositionResult });
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 5,
      "browser IME composition queue",
    );
    await assertQueuedMessages(page, [
      { message: wmImeStartComposition, wParam: 0, lParam: 0 },
      { message: wmImeComposition, wParam: compositionDraftChar, lParam: gcsCompStr },
      { message: wmImeComposition, wParam: compositionResultChar, lParam: gcsResultStr },
      { message: wmImeEndComposition, wParam: 0, lParam: 0 },
      { message: wmChar, wParam: compositionResultChar, lParam: 0 },
    ], "Browser IME composition");

    await page.evaluate(({ wmKeyDown, vkF6 }) => window.CnCPort.rpc("postMessage", {
      message: wmKeyDown,
      wParam: vkF6,
      lParam: 0,
      point: { x: 9, y: 10 },
    }), { wmKeyDown, vkF6 });
    await page.evaluate(({ wmMouseMove, mouseMoveLParam }) => window.CnCPort.rpc("postMessage", {
      message: wmMouseMove,
      wParam: 0,
      lParam: mouseMoveLParam,
      point: { x: 12, y: 34 },
    }), { wmMouseMove, mouseMoveLParam });

    const firstQueueProbe = await page.evaluate(() => window.CnCPort.rpc("messageQueueProbe"));
    if (!firstQueueProbe.ok
        || firstQueueProbe.probe?.source !== "browser_win32_message_queue"
        || firstQueueProbe.probe.beforeCount !== 2
        || firstQueueProbe.probe.afterPeekCount !== 2
        || firstQueueProbe.probe.afterRemoveCount !== 1
        || firstQueueProbe.probe.peek?.message !== wmKeyDown
        || firstQueueProbe.probe.peek?.wParam !== vkF6
        || firstQueueProbe.probe.peek?.pt?.x !== 9
        || firstQueueProbe.probe.peek?.pt?.y !== 10
        || firstQueueProbe.probe.removed?.message !== wmKeyDown
        || firstQueueProbe.probe.after?.message !== wmMouseMove) {
      throw new Error(`Win32 message queue first probe mismatch: ${JSON.stringify(firstQueueProbe)}`);
    }

    const secondQueueProbe = await page.evaluate(() => window.CnCPort.rpc("messageQueueProbe"));
    if (!secondQueueProbe.ok
        || secondQueueProbe.probe.beforeCount !== 1
        || secondQueueProbe.probe.afterPeekCount !== 1
        || secondQueueProbe.probe.afterRemoveCount !== 0
        || secondQueueProbe.probe.removed?.message !== wmMouseMove
        || secondQueueProbe.probe.removed?.lParam !== mouseMoveLParam
        || secondQueueProbe.probe.removed?.pt?.x !== 12
        || secondQueueProbe.probe.removed?.pt?.y !== 34
        || secondQueueProbe.probe.after !== null) {
      throw new Error(`Win32 message queue second probe mismatch: ${JSON.stringify(secondQueueProbe)}`);
    }

    const originalWndProcInit = await page.evaluate(() => window.CnCPort.rpc(
      "initOriginalWndProcInput",
      { width: 1280, height: 720 },
    ));
    if (!originalWndProcInit.ok
        || !originalWndProcInit.probe?.ready
        || !originalWndProcInit.probe.registered
        || !originalWndProcInit.probe.windowCreated
        || !originalWndProcInit.probe.mouse?.attached) {
      throw new Error(`Original WndProc input did not initialize: ${JSON.stringify(originalWndProcInit)}`);
    }

    const originalCursorVisible = await page.evaluate(() => window.CnCPort.rpc(
      "originalCursorVisibilityProbe",
      { visible: true },
    ));
    if (!originalCursorVisible.ok
        || !originalCursorVisible.probe?.mouse?.visible
        || originalCursorVisible.probe.mouse.currentCursor !== mouseCursorArrow
        || originalCursorVisible.probe.mouse.browserCursorSet !== true
        || originalCursorVisible.state.browserInput?.cursorSet !== true
        || originalCursorVisible.state.browserCursor?.css !== "default"
        || originalCursorVisible.state.browserCursor?.visible !== true) {
      throw new Error(`Original cursor visible probe did not expose a browser cursor: ${JSON.stringify(originalCursorVisible)}`);
    }

    await page.evaluate(({ wmSetCursor }) => window.CnCPort.rpc("postMessage", {
      message: wmSetCursor,
      wParam: 0,
      lParam: 0,
    }), { wmSetCursor });
    const browserSetCursorPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    const visibleCursorCss = await page.locator("#viewport").evaluate((viewport) =>
      getComputedStyle(viewport).cursor);
    if (!browserSetCursorPump.ok
        || browserSetCursorPump.probe.pump?.lastPumped !== 1
        || browserSetCursorPump.probe.mouse?.currentCursor !== mouseCursorArrow
        || browserSetCursorPump.probe.mouse?.browserCursorSet !== true
        || browserSetCursorPump.state.browserInput?.cursorSet !== true
        || browserSetCursorPump.state.browserCursor?.css !== "default"
        || browserSetCursorPump.state.browserCursor?.visible !== true
        || visibleCursorCss !== "default") {
      throw new Error(`Original WM_SETCURSOR did not apply browser CSS cursor: ${JSON.stringify({ browserSetCursorPump, visibleCursorCss })}`);
    }
    await page.locator("#viewport").screenshot({ path: cursorCanvasScreenshot });

    const originalCursorHidden = await page.evaluate(() => window.CnCPort.rpc(
      "originalCursorVisibilityProbe",
      { visible: false },
    ));
    const hiddenCursorCss = await page.locator("#viewport").evaluate((viewport) =>
      getComputedStyle(viewport).cursor);
    if (!originalCursorHidden.ok
        || originalCursorHidden.probe?.mouse?.visible !== false
        || originalCursorHidden.probe.mouse.currentCursor !== mouseCursorArrow
        || originalCursorHidden.probe.mouse.browserCursorSet !== false
        || originalCursorHidden.state.browserInput?.cursorSet !== false
        || originalCursorHidden.state.browserCursor?.css !== "none"
        || originalCursorHidden.state.browserCursor?.visible !== false
        || hiddenCursorCss !== "none") {
      throw new Error(`Original cursor hidden probe did not apply CSS cursor:none: ${JSON.stringify({ originalCursorHidden, hiddenCursorCss })}`);
    }

    const resetD3DCallsBeforeFocus = originalWndProcInit.probe.resetD3D?.calls ?? 0;
    await page.locator("#viewport").focus();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "browser focus activation queue",
    );
    const browserFocusPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserFocusPump.ok
        || browserFocusPump.probe.pump?.lastPumped !== 3
        || browserFocusPump.probe.messageQueue?.count !== 0
        || browserFocusPump.probe.resetD3D?.calls !== resetD3DCallsBeforeFocus + 1
        || browserFocusPump.probe.resetD3D?.lastActive !== true
        || browserFocusPump.probe.mouse?.lostFocus !== false) {
      throw new Error(`Browser focus did not activate original WndProc state: ${JSON.stringify(browserFocusPump)}`);
    }

    const quitPostsBeforeEscape = browserFocusPump.probe.keyboard?.quitPosts ?? 0;
    await page.keyboard.down("Escape");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "browser escape keydown queue",
    );
    const browserEscapePump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserEscapePump.ok
        || browserEscapePump.probe.pump?.lastPumped !== 1
        || browserEscapePump.probe.messageQueue?.count !== 0
        || browserEscapePump.probe.keyboard?.quitPosts !== quitPostsBeforeEscape + 1
        || browserEscapePump.probe.keyboard?.lastQuitExitCode !== 0) {
      throw new Error(`Browser Escape key did not reach original WndProc quit path: ${JSON.stringify(browserEscapePump)}`);
    }
    await page.keyboard.up("Escape");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "browser escape keyup queue",
    );
    const browserEscapeReleasePump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserEscapeReleasePump.ok
        || browserEscapeReleasePump.probe.pump?.lastPumped !== 1
        || browserEscapeReleasePump.probe.messageQueue?.count !== 0
        || browserEscapeReleasePump.probe.keyboard?.quitPosts !== quitPostsBeforeEscape + 1) {
      throw new Error(`Browser Escape release did not leave original WndProc quit state stable: ${JSON.stringify(browserEscapeReleasePump)}`);
    }

    const leftButtonLParam = (45 << 16) | 123;
    await page.evaluate(({ wmLeftButtonDown, leftButtonLParam }) => window.CnCPort.rpc("postMessage", {
      message: wmLeftButtonDown,
      wParam: 0,
      lParam: leftButtonLParam,
      point: { x: 123, y: 45 },
    }), { wmLeftButtonDown, leftButtonLParam });

    const originalWndProcPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!originalWndProcPump.ok
        || originalWndProcPump.probe.pump?.lastPumped !== 1
        || originalWndProcPump.probe.messageQueue?.count !== 0) {
      throw new Error(`Original WndProc pump did not dispatch browser message: ${JSON.stringify(originalWndProcPump)}`);
    }

    const originalWndProcProbe = await page.evaluate(() => window.CnCPort.rpc("originalWndProcInputProbe"));
    const lastMouseEvent = originalWndProcProbe.probe?.mouse?.lastEvent;
    if (!originalWndProcProbe.ok
        || originalWndProcProbe.probe.mouse?.events !== 1
        || originalWndProcProbe.probe.mouse?.lastProbeDrained !== 1
        || lastMouseEvent?.pos?.x !== 123
        || lastMouseEvent?.pos?.y !== 45
        || lastMouseEvent?.left?.state !== "down"
        || lastMouseEvent?.left?.frame !== 1) {
      throw new Error(`Original WndProc did not feed Win32Mouse: ${JSON.stringify(originalWndProcProbe)}`);
    }

    const resetBeforeGuiMouseStream = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetBeforeGuiMouseStream.ok
        || resetBeforeGuiMouseStream.state.browserInput?.messageQueue?.count !== 0
        || resetBeforeGuiMouseStream.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Browser GUI mouse-stream reset mismatch: ${JSON.stringify(resetBeforeGuiMouseStream)}`);
    }

    const guiMouseLParam = (95 << 16) | 120;
    await page.evaluate(({ wmLeftButtonDown, guiMouseLParam }) => window.CnCPort.rpc("postMessage", {
      message: wmLeftButtonDown,
      wParam: 0,
      lParam: guiMouseLParam,
      point: { x: 120, y: 95 },
    }), { wmLeftButtonDown, guiMouseLParam });

    const guiMouseStreamProbe = await page.evaluate(() => window.CnCPort.rpc("originalGuiMouseStreamProbe"));
    if (!guiMouseStreamProbe.ok
        || guiMouseStreamProbe.probe?.ok !== true
        || guiMouseStreamProbe.probe.queue?.before !== 1
        || guiMouseStreamProbe.probe.queue?.pumped !== 1
        || guiMouseStreamProbe.probe.queue?.afterPump !== 0
        || guiMouseStreamProbe.probe.mouse?.win32Attached !== true
        || guiMouseStreamProbe.probe.mouse?.streamAttached !== true
        || guiMouseStreamProbe.probe.mouse?.eventsThisFrame !== 1
        || guiMouseStreamProbe.probe.streamBefore?.count !== 2
        || guiMouseStreamProbe.probe.streamBefore?.rawPosition !== true
        || guiMouseStreamProbe.probe.streamBefore?.rawLeftDown !== true
        || guiMouseStreamProbe.probe.window?.mousePos !== 1
        || guiMouseStreamProbe.probe.window?.leftDown !== 1
        || guiMouseStreamProbe.probe.window?.leftDownX !== 120
        || guiMouseStreamProbe.probe.window?.leftDownY !== 95
        || guiMouseStreamProbe.probe.window?.grabbed !== true
        || guiMouseStreamProbe.probe.streamRemaining !== 0
        || guiMouseStreamProbe.probe.commandListRemaining !== 0) {
      throw new Error(`Browser GUI mouse stream did not reach original WindowTranslator/GameWindowManager: ${JSON.stringify(guiMouseStreamProbe)}`);
    }

    await page.mouse.move(canvasBox.x + 111, canvasBox.y + 88);
    const resetBeforePointerCapture = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetBeforePointerCapture.ok
        || resetBeforePointerCapture.state.browserInput?.messageQueue?.count !== 0
        || resetBeforePointerCapture.state.browserInput?.messageQueue?.overflowed !== false
        || resetBeforePointerCapture.state.browserPointerCapture?.active !== false) {
      throw new Error(`Browser pointer-capture reset mismatch: ${JSON.stringify(resetBeforePointerCapture)}`);
    }

    await page.mouse.down();
    const pointerCaptureDownState = await waitForHarnessState(
      page,
      (state) => state.browserPointerCapture?.supported === true
        && state.browserPointerCapture.active === true
        && state.browserPointerCapture.pointerId !== null
        && state.browserPointerCapture.claims === 1
        && state.browserInput?.messageQueue?.count >= 1,
      "browser pointer-capture down",
    );
    if (pointerCaptureDownState.browserInput?.cursor?.x !== 111
        || pointerCaptureDownState.browserInput?.cursor?.y !== 88
        || pointerCaptureDownState.browserPointerCapture.lastError !== null) {
      throw new Error(`Browser pointer down did not claim pointer capture cleanly: ${JSON.stringify(pointerCaptureDownState.browserPointerCapture)}`);
    }

    await page.mouse.move(canvasBox.x + canvasBox.width + 80, canvasBox.y + 88);
    const pointerCaptureDragState = await waitForHarnessState(
      page,
      (state) => state.browserPointerCapture?.active === true
        && state.browserInput?.cursor?.available
        && state.browserInput.cursor.x === 1279
        && state.browserInput.cursor.y === 88
        && state.browserInput.messageQueue?.count >= 2,
      "browser pointer-captured drag outside canvas",
    );
    if (pointerCaptureDragState.browserPointerCapture.lastEvent?.pointerId === null) {
      throw new Error(`Browser pointer-captured drag did not retain pointer identity: ${JSON.stringify(pointerCaptureDragState.browserPointerCapture)}`);
    }

    const pointerCaptureDragPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!pointerCaptureDragPump.ok
        || pointerCaptureDragPump.probe.pump?.lastPumped !== 2
        || pointerCaptureDragPump.probe.messageQueue?.count !== 0) {
      throw new Error(`Browser pointer-captured drag did not pump through original WndProc: ${JSON.stringify(pointerCaptureDragPump)}`);
    }
    const pointerCaptureDragProbe = await page.evaluate(() => window.CnCPort.rpc("originalWndProcInputProbe"));
    const pointerCaptureDragEvent = pointerCaptureDragProbe.probe?.mouse?.lastEvent;
    if (!pointerCaptureDragProbe.ok
        || pointerCaptureDragProbe.probe.mouse?.lastProbeDrained !== 2
        || pointerCaptureDragEvent?.pos?.x !== 1279
        || pointerCaptureDragEvent?.pos?.y !== 88) {
      throw new Error(`Browser pointer-captured drag did not feed Win32Mouse outside-canvas coordinates: ${JSON.stringify(pointerCaptureDragProbe)}`);
    }

    await page.mouse.up();
    const pointerCaptureReleaseState = await waitForHarnessState(
      page,
      (state) => state.browserPointerCapture?.active === false
        && state.browserPointerCapture.releases === 1
        && state.browserInput?.messageQueue?.count >= 1
        && state.browserInput.cursor?.x === 1279
        && state.browserInput.cursor?.y === 88,
      "browser pointer-capture release",
    );
    if (pointerCaptureReleaseState.browserPointerCapture.lastError !== null) {
      throw new Error(`Browser pointer capture release failed: ${JSON.stringify(pointerCaptureReleaseState.browserPointerCapture)}`);
    }
    const pointerCaptureReleasePump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!pointerCaptureReleasePump.ok
        || pointerCaptureReleasePump.probe.pump?.lastPumped !== 1
        || pointerCaptureReleasePump.probe.messageQueue?.count !== 0) {
      throw new Error(`Browser pointer capture release did not pump through original WndProc: ${JSON.stringify(pointerCaptureReleasePump)}`);
    }
    const pointerCaptureReleaseProbe = await page.evaluate(() => window.CnCPort.rpc("originalWndProcInputProbe"));
    const pointerCaptureReleaseEvent = pointerCaptureReleaseProbe.probe?.mouse?.lastEvent;
    if (!pointerCaptureReleaseProbe.ok
        || pointerCaptureReleaseProbe.probe.mouse?.lastProbeDrained !== 1
        || pointerCaptureReleaseEvent?.pos?.x !== 1279
        || pointerCaptureReleaseEvent?.pos?.y !== 88
        || pointerCaptureReleaseEvent?.left?.state !== "up") {
      throw new Error(`Browser pointer capture release did not feed Win32Mouse: ${JSON.stringify(pointerCaptureReleaseProbe)}`);
    }

    const resetAfterPointerCapture = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetAfterPointerCapture.ok
        || resetAfterPointerCapture.state.browserInput?.messageQueue?.count !== 0
        || resetAfterPointerCapture.state.browserPointerCapture?.active !== false) {
      throw new Error(`Browser pointer-capture cleanup mismatch: ${JSON.stringify(resetAfterPointerCapture)}`);
    }

    await page.mouse.move(canvasBox.x + 234, canvasBox.y + 56);
    const resetBeforeDoubleClick = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetBeforeDoubleClick.ok
        || resetBeforeDoubleClick.state.browserInput?.messageQueue?.count !== 0
        || resetBeforeDoubleClick.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Browser double-click reset mismatch: ${JSON.stringify(resetBeforeDoubleClick)}`);
    }

    await page.mouse.down();
    await page.mouse.up();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2,
      "first browser click queue",
    );
    const firstBrowserClickPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!firstBrowserClickPump.ok
        || firstBrowserClickPump.probe.pump?.lastPumped !== 2
        || firstBrowserClickPump.probe.messageQueue?.count !== 0) {
      throw new Error(`First browser click did not pump through original WndProc: ${JSON.stringify(firstBrowserClickPump)}`);
    }
    const firstBrowserClickProbe = await page.evaluate(() => window.CnCPort.rpc("originalWndProcInputProbe"));
    const firstBrowserClickEvent = firstBrowserClickProbe.probe?.mouse?.lastEvent;
    if (!firstBrowserClickProbe.ok
        || firstBrowserClickProbe.probe.mouse?.lastProbeDrained !== 2
        || firstBrowserClickEvent?.pos?.x !== 234
        || firstBrowserClickEvent?.pos?.y !== 56
        || firstBrowserClickEvent?.left?.state !== "up"
        || firstBrowserClickEvent?.left?.frame !== 1) {
      throw new Error(`First browser click did not feed Win32Mouse down/up events: ${JSON.stringify(firstBrowserClickProbe)}`);
    }

    await page.mouse.down();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "browser double-click down queue",
    );
    const browserDoubleClickPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserDoubleClickPump.ok
        || browserDoubleClickPump.probe.pump?.lastPumped !== 1
        || browserDoubleClickPump.probe.messageQueue?.count !== 0) {
      throw new Error(`Browser double-click did not pump through original WndProc: ${JSON.stringify(browserDoubleClickPump)}`);
    }
    const browserDoubleClickProbe = await page.evaluate(() => window.CnCPort.rpc("originalWndProcInputProbe"));
    const browserDoubleClickEvent = browserDoubleClickProbe.probe?.mouse?.lastEvent;
    if (!browserDoubleClickProbe.ok
        || browserDoubleClickProbe.probe.mouse?.lastProbeDrained !== 1
        || browserDoubleClickEvent?.pos?.x !== 234
        || browserDoubleClickEvent?.pos?.y !== 56
        || browserDoubleClickEvent?.left?.state !== "doubleClick"
        || browserDoubleClickEvent?.left?.frame !== 1) {
      throw new Error(`Browser double-click did not feed Win32Mouse: ${JSON.stringify(browserDoubleClickProbe)}`);
    }

    await page.mouse.up();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "browser double-click release queue",
    );
    const browserDoubleClickReleasePump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserDoubleClickReleasePump.ok
        || browserDoubleClickReleasePump.probe.pump?.lastPumped !== 1
        || browserDoubleClickReleasePump.probe.messageQueue?.count !== 0) {
      throw new Error(`Browser double-click release did not pump through original WndProc: ${JSON.stringify(browserDoubleClickReleasePump)}`);
    }
    const browserDoubleClickReleaseProbe = await page.evaluate(() => window.CnCPort.rpc("originalWndProcInputProbe"));
    const browserDoubleClickReleaseEvent = browserDoubleClickReleaseProbe.probe?.mouse?.lastEvent;
    if (!browserDoubleClickReleaseProbe.ok
        || browserDoubleClickReleaseProbe.probe.mouse?.lastProbeDrained !== 1
        || browserDoubleClickReleaseEvent?.pos?.x !== 234
        || browserDoubleClickReleaseEvent?.pos?.y !== 56
        || browserDoubleClickReleaseEvent?.left?.state !== "up"
        || browserDoubleClickReleaseEvent?.left?.frame !== 1) {
      throw new Error(`Browser double-click release did not feed Win32Mouse: ${JSON.stringify(browserDoubleClickReleaseProbe)}`);
    }

    await page.mouse.move(canvasBox.x + 345, canvasBox.y + 67);
    const resetBeforeWheel = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetBeforeWheel.ok
        || resetBeforeWheel.state.browserInput?.messageQueue?.count !== 0
        || resetBeforeWheel.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Browser wheel reset mismatch: ${JSON.stringify(resetBeforeWheel)}`);
    }

    await page.mouse.wheel(0, -120);
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "browser mouse wheel queue",
    );
    const browserWheelPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserWheelPump.ok
        || browserWheelPump.probe.pump?.lastPumped !== 1
        || browserWheelPump.probe.messageQueue?.count !== 0) {
      throw new Error(`Browser mouse wheel did not pump through original WndProc: ${JSON.stringify(browserWheelPump)}`);
    }
    const browserWheelProbe = await page.evaluate(() => window.CnCPort.rpc("originalWndProcInputProbe"));
    const browserWheelEvent = browserWheelProbe.probe?.mouse?.lastEvent;
    if (!browserWheelProbe.ok
        || browserWheelProbe.probe.mouse?.lastProbeDrained !== 1
        || browserWheelEvent?.pos?.x !== 345
        || browserWheelEvent?.pos?.y !== 67
        || browserWheelEvent?.wheelPos !== 120
        || browserWheelEvent?.left?.state !== "up"
        || browserWheelEvent?.left?.frame !== 0) {
      throw new Error(`Browser mouse wheel did not feed Win32Mouse: ${JSON.stringify(browserWheelProbe)}`);
    }

    const resetD3DCallsBeforeBlur = browserWheelProbe.probe.resetD3D?.calls ?? 0;
    await page.evaluate(() => document.querySelector("#viewport").blur());
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "browser blur deactivation queue",
    );
    const browserBlurPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserBlurPump.ok
        || browserBlurPump.probe.pump?.lastPumped !== 3
        || browserBlurPump.probe.messageQueue?.count !== 0
        || browserBlurPump.probe.resetD3D?.calls !== resetD3DCallsBeforeBlur + 1
        || browserBlurPump.probe.resetD3D?.lastActive !== false
        || browserBlurPump.probe.mouse?.lostFocus !== true) {
      throw new Error(`Browser blur did not deactivate original WndProc state: ${JSON.stringify(browserBlurPump)}`);
    }

    await page.locator("#viewport").focus();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "browser refocus activation queue",
    );
    const browserRefocusPump = await page.evaluate(() => window.CnCPort.rpc("pumpOriginalWndProcInput"));
    if (!browserRefocusPump.ok
        || browserRefocusPump.probe.pump?.lastPumped !== 3
        || browserRefocusPump.probe.messageQueue?.count !== 0
        || browserRefocusPump.probe.resetD3D?.calls !== resetD3DCallsBeforeBlur + 2
        || browserRefocusPump.probe.resetD3D?.lastActive !== true
        || browserRefocusPump.probe.mouse?.lostFocus !== false) {
      throw new Error(`Browser refocus did not reactivate original WndProc state: ${JSON.stringify(browserRefocusPump)}`);
    }
    const resetWndProcFocusKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetWndProcFocusKeyboard.ok
        || resetWndProcFocusKeyboard.probe?.focusLost?.pending !== false
        || resetWndProcFocusKeyboard.probe?.modifiers !== 0
        || resetWndProcFocusKeyboard.probe?.keyStatus?.aDown !== false) {
      throw new Error(`Browser WndProc focus cleanup left original Keyboard state dirty: ${JSON.stringify(resetWndProcFocusKeyboard)}`);
    }

    await page.locator("#viewport").focus();
    const resetFrameOwnerInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameOwnerInput.ok
        || resetFrameOwnerInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameOwnerInput.state.browserInput?.messageQueue?.overflowed !== false
        || resetFrameOwnerInput.state.browserInput?.keyboardMessageQueue?.count !== 0
        || resetFrameOwnerInput.state.browserInput?.keyboardMessageQueue?.overflowed !== false) {
      throw new Error(`Original Keyboard frame-owned input reset mismatch: ${JSON.stringify(resetFrameOwnerInput)}`);
    }
    const disableFrameOwnerKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("setOriginalKeyboardFrameInput", { enabled: false }));
    if (!disableFrameOwnerKeyboard.ok
        || disableFrameOwnerKeyboard.probe?.source !== "browser_original_keyboard_frame_input"
        || disableFrameOwnerKeyboard.probe?.enabled !== false) {
      throw new Error(`Original Keyboard frame-owned input did not disable cleanly: ${JSON.stringify(disableFrameOwnerKeyboard)}`);
    }
    const resetFrameOwnerProbeKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFrameOwnerProbeKeyboard.ok
        || resetFrameOwnerProbeKeyboard.probe?.inputFrame !== 0
        || resetFrameOwnerProbeKeyboard.probe?.modifiers !== 0
        || resetFrameOwnerProbeKeyboard.probe?.keyStatus?.aDown !== false
        || resetFrameOwnerProbeKeyboard.probe?.keyStatus?.leftShiftDown !== false) {
      throw new Error(`Original Keyboard frame-owned shared keyboard reset mismatch: ${JSON.stringify(resetFrameOwnerProbeKeyboard)}`);
    }
    const resetFrameOwnerKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardFrameInput"));
    if (!resetFrameOwnerKeyboard.ok
        || resetFrameOwnerKeyboard.probe?.source !== "browser_original_keyboard_frame_input"
        || resetFrameOwnerKeyboard.probe?.enabled !== false
        || resetFrameOwnerKeyboard.probe?.initialized !== true
        || resetFrameOwnerKeyboard.probe?.lastRan !== false
        || resetFrameOwnerKeyboard.probe?.ticks !== 0
        || resetFrameOwnerKeyboard.probe?.stream?.count !== 0
        || resetFrameOwnerKeyboard.probe?.queue?.mirrorRemaining !== 0) {
      throw new Error(`Original Keyboard frame-owned state reset mismatch: ${JSON.stringify(resetFrameOwnerKeyboard)}`);
    }
    const enableFrameOwnerKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("setOriginalKeyboardFrameInput", { enabled: true }));
    if (!enableFrameOwnerKeyboard.ok
        || enableFrameOwnerKeyboard.probe?.enabled !== true
        || enableFrameOwnerKeyboard.probe?.initialized !== true
        || enableFrameOwnerKeyboard.probe?.lastRan !== false
        || enableFrameOwnerKeyboard.probe?.ticks !== 0
        || enableFrameOwnerKeyboard.probe?.lifecycle?.messageStream !== "frame-owned"
        || enableFrameOwnerKeyboard.probe?.lifecycle?.commandList !== "frame-owned"
        || enableFrameOwnerKeyboard.probe?.lifecycle?.promotedToTickFrame !== true) {
      throw new Error(`Original Keyboard frame-owned input did not enable: ${JSON.stringify(enableFrameOwnerKeyboard)}`);
    }

    const wndProcBeforeFrameKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("originalWndProcInputProbe"));
    const frameKeyboardQuitPostsBefore = wndProcBeforeFrameKeyboard.probe?.keyboard?.quitPosts ?? 0;
    await page.keyboard.down("Escape");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1
        && input?.keyboardMessageQueue?.count >= 1,
      "original Keyboard frame-owned Escape keydown queues",
    );
    const frameKeyboardDown = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    const frameKeyboardDownProbe = frameKeyboardDown.state.originalKeyboardFrameInput;
    const frameKeyboardDownMessages = frameKeyboardDownProbe?.stream?.messages ?? [];
    if (!frameKeyboardDown.ok
        || frameKeyboardDownProbe?.source !== "browser_original_keyboard_frame_input"
        || frameKeyboardDownProbe?.enabled !== true
        || frameKeyboardDownProbe?.initialized !== true
        || frameKeyboardDownProbe?.lastRan !== true
        || frameKeyboardDownProbe?.ticks !== 1
        || frameKeyboardDownProbe?.lifecycle?.promotedToTickFrame !== true
        || frameKeyboardDownProbe?.queue?.primaryRemainingBefore !== 0
        || frameKeyboardDownProbe?.queue?.primaryRemainingAfter !== 0
        || frameKeyboardDownProbe?.queue?.mirrorBefore !== 1
        || frameKeyboardDownProbe?.queue?.mirrorDrained !== 1
        || frameKeyboardDownProbe?.queue?.mirrorRemaining !== 0
        || frameKeyboardDownProbe?.queue?.ignored !== 0
        || frameKeyboardDownProbe?.stream?.count !== 1
        || frameKeyboardDownProbe?.commandList?.countAfterPropagate !== 1
        || frameKeyboardDownMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || frameKeyboardDownMessages[0]?.key !== keyEsc
        || (frameKeyboardDownMessages[0]?.state & keyStateDown) === 0
        || frameKeyboardDown.state.browserInput?.messageQueue?.count !== 0
        || frameKeyboardDown.state.browserInput?.keyboardMessageQueue?.count !== 0) {
      throw new Error(`Original Keyboard frame-owned Escape keydown did not run through tick_frame: ${JSON.stringify(frameKeyboardDown)}`);
    }
    const wndProcAfterFrameKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("originalWndProcInputProbe"));
    if (!wndProcAfterFrameKeyboard.ok
        || wndProcAfterFrameKeyboard.probe?.keyboard?.quitPosts !== frameKeyboardQuitPostsBefore + 1
        || wndProcAfterFrameKeyboard.probe?.keyboard?.lastQuitExitCode !== 0
        || wndProcAfterFrameKeyboard.probe?.messageQueue?.count !== 0) {
      throw new Error(`Original WndProc did not retain Escape ownership during frame Keyboard input: ${JSON.stringify(wndProcAfterFrameKeyboard)}`);
    }

    await page.keyboard.up("Escape");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1
        && input?.keyboardMessageQueue?.count >= 1,
      "original Keyboard frame-owned Escape keyup queues",
    );
    const frameKeyboardUp = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    const frameKeyboardUpProbe = frameKeyboardUp.state.originalKeyboardFrameInput;
    const frameKeyboardUpMessages = frameKeyboardUpProbe?.stream?.messages ?? [];
    if (!frameKeyboardUp.ok
        || frameKeyboardUpProbe?.enabled !== true
        || frameKeyboardUpProbe?.lastRan !== true
        || frameKeyboardUpProbe?.ticks !== 2
        || frameKeyboardUpProbe?.queue?.primaryRemainingBefore !== 0
        || frameKeyboardUpProbe?.queue?.primaryRemainingAfter !== 0
        || frameKeyboardUpProbe?.queue?.mirrorBefore !== 1
        || frameKeyboardUpProbe?.queue?.mirrorDrained !== 1
        || frameKeyboardUpProbe?.queue?.mirrorRemaining !== 0
        || frameKeyboardUpProbe?.queue?.ignored !== 0
        || frameKeyboardUpProbe?.stream?.count !== 1
        || frameKeyboardUpProbe?.commandList?.countAfterPropagate !== 1
        || frameKeyboardUpMessages[0]?.typeName !== "MSG_RAW_KEY_UP"
        || frameKeyboardUpMessages[0]?.key !== keyEsc
        || (frameKeyboardUpMessages[0]?.state & keyStateUp) === 0
        || frameKeyboardUp.state.browserInput?.messageQueue?.count !== 0
        || frameKeyboardUp.state.browserInput?.keyboardMessageQueue?.count !== 0) {
      throw new Error(`Original Keyboard frame-owned Escape keyup did not run through tick_frame: ${JSON.stringify(frameKeyboardUp)}`);
    }

    const resetFrameOwnerRepeatInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameOwnerRepeatInput.ok
        || resetFrameOwnerRepeatInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameOwnerRepeatInput.state.browserInput?.keyboardMessageQueue?.count !== 0) {
      throw new Error(`Original Keyboard frame-owned repeat input reset mismatch: ${JSON.stringify(resetFrameOwnerRepeatInput)}`);
    }
    const resetFrameOwnerRepeatKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardFrameInput"));
    if (!resetFrameOwnerRepeatKeyboard.ok
        || resetFrameOwnerRepeatKeyboard.probe?.enabled !== true
        || resetFrameOwnerRepeatKeyboard.probe?.ticks !== 0
        || resetFrameOwnerRepeatKeyboard.probe?.keyStatus?.aDown !== false) {
      throw new Error(`Original Keyboard frame-owned repeat keyboard reset mismatch: ${JSON.stringify(resetFrameOwnerRepeatKeyboard)}`);
    }

    await page.keyboard.down("A");
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2
        && input?.keyboardMessageQueue?.count >= 2,
      "original Keyboard frame-owned A repeat seed queues",
    );
    const frameKeyboardRepeatSeed = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    const frameKeyboardRepeatSeedProbe = frameKeyboardRepeatSeed.state.originalKeyboardFrameInput;
    const frameKeyboardRepeatSeedMessages = frameKeyboardRepeatSeedProbe?.stream?.messages ?? [];
    if (!frameKeyboardRepeatSeed.ok
        || frameKeyboardRepeatSeedProbe?.enabled !== true
        || frameKeyboardRepeatSeedProbe?.lastRan !== true
        || frameKeyboardRepeatSeedProbe?.ticks !== 1
        || frameKeyboardRepeatSeedProbe?.inputFrame !== 1
        || frameKeyboardRepeatSeedProbe?.queue?.primaryRemainingBefore !== 0
        || frameKeyboardRepeatSeedProbe?.queue?.primaryRemainingAfter !== 0
        || frameKeyboardRepeatSeedProbe?.queue?.mirrorBefore !== 2
        || frameKeyboardRepeatSeedProbe?.queue?.mirrorDrained !== 2
        || frameKeyboardRepeatSeedProbe?.queue?.mirrorRemaining !== 0
        || frameKeyboardRepeatSeedProbe?.queue?.ignored !== 1
        || frameKeyboardRepeatSeedProbe?.stream?.count !== 1
        || frameKeyboardRepeatSeedProbe?.commandList?.countAfterPropagate !== 1
        || frameKeyboardRepeatSeedMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || frameKeyboardRepeatSeedMessages[0]?.key !== keyA
        || (frameKeyboardRepeatSeedMessages[0]?.state & keyStateDown) === 0
        || (frameKeyboardRepeatSeedMessages[0]?.state & keyStateAutoRepeat) !== 0
        || frameKeyboardRepeatSeedProbe?.keyStatus?.aDown !== true
        || frameKeyboardRepeatSeed.state.browserInput?.messageQueue?.count !== 0
        || frameKeyboardRepeatSeed.state.browserInput?.keyboardMessageQueue?.count !== 0) {
      throw new Error(`Original Keyboard frame-owned repeat seed did not run through tick_frame: ${JSON.stringify(frameKeyboardRepeatSeed)}`);
    }

    for (let frame = 0; frame < 10; ++frame) {
      const quietFrameKeyboardRepeat = await page.evaluate(() => window.CnCPort.rpc("frame", {
        count: 1,
      }));
      const quietFrameKeyboardRepeatProbe = quietFrameKeyboardRepeat.state.originalKeyboardFrameInput;
      if (!quietFrameKeyboardRepeat.ok
          || quietFrameKeyboardRepeatProbe?.enabled !== true
          || quietFrameKeyboardRepeatProbe?.lastRan !== true
          || quietFrameKeyboardRepeatProbe?.ticks !== frame + 2
          || quietFrameKeyboardRepeatProbe?.inputFrame !== frame + 2
          || quietFrameKeyboardRepeatProbe?.queue?.mirrorBefore !== 0
          || quietFrameKeyboardRepeatProbe?.queue?.mirrorDrained !== 0
          || quietFrameKeyboardRepeatProbe?.queue?.ignored !== 0
          || quietFrameKeyboardRepeatProbe?.stream?.count !== 0
          || quietFrameKeyboardRepeatProbe?.commandList?.countAfterPropagate !== 0
          || quietFrameKeyboardRepeatProbe?.keyStatus?.aDown !== true) {
        throw new Error(`Original Keyboard frame-owned repeated before delay frame ${frame}: ${JSON.stringify(quietFrameKeyboardRepeat)}`);
      }
    }

    const frameKeyboardRepeat = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    const frameKeyboardRepeatProbe = frameKeyboardRepeat.state.originalKeyboardFrameInput;
    const frameKeyboardRepeatMessages = frameKeyboardRepeatProbe?.stream?.messages ?? [];
    if (!frameKeyboardRepeat.ok
        || frameKeyboardRepeatProbe?.enabled !== true
        || frameKeyboardRepeatProbe?.lastRan !== true
        || frameKeyboardRepeatProbe?.ticks !== 12
        || frameKeyboardRepeatProbe?.inputFrame !== 12
        || frameKeyboardRepeatProbe?.queue?.mirrorBefore !== 0
        || frameKeyboardRepeatProbe?.queue?.mirrorDrained !== 0
        || frameKeyboardRepeatProbe?.queue?.ignored !== 0
        || frameKeyboardRepeatProbe?.stream?.count !== 1
        || frameKeyboardRepeatProbe?.commandList?.countAfterPropagate !== 1
        || frameKeyboardRepeatMessages[0]?.typeName !== "MSG_RAW_KEY_DOWN"
        || frameKeyboardRepeatMessages[0]?.key !== keyA
        || (frameKeyboardRepeatMessages[0]?.state & keyStateDown) === 0
        || (frameKeyboardRepeatMessages[0]?.state & keyStateAutoRepeat) === 0
        || frameKeyboardRepeatProbe?.keyStatus?.aDown !== true) {
      throw new Error(`Original Keyboard frame-owned autorepeat did not run through tick_frame: ${JSON.stringify(frameKeyboardRepeat)}`);
    }

    await page.evaluate(() => document.querySelector("#viewport").blur());
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard frame-owned focus-loss blur queue",
    );
    const frameKeyboardFocusLost = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    const frameKeyboardFocusLostProbe = frameKeyboardFocusLost.state.originalKeyboardFrameInput;
    const frameKeyboardFocusLostEvents = frameKeyboardFocusLostProbe?.events ?? [];
    if (!frameKeyboardFocusLost.ok
        || frameKeyboardFocusLostProbe?.enabled !== true
        || frameKeyboardFocusLostProbe?.lastRan !== true
        || frameKeyboardFocusLostProbe?.ticks !== 13
        || frameKeyboardFocusLostProbe?.inputFrame !== 13
        || frameKeyboardFocusLostProbe?.queue?.primaryRemainingBefore !== 0
        || frameKeyboardFocusLostProbe?.queue?.primaryRemainingAfter !== 0
        || frameKeyboardFocusLostProbe?.queue?.mirrorBefore !== 0
        || frameKeyboardFocusLostProbe?.queue?.mirrorDrained !== 0
        || frameKeyboardFocusLostProbe?.queue?.mirrorRemaining !== 0
        || frameKeyboardFocusLostProbe?.focusLost?.pendingBefore !== true
        || frameKeyboardFocusLostProbe?.focusLost?.delivered !== true
        || frameKeyboardFocusLostProbe?.stream?.count !== 0
        || frameKeyboardFocusLostProbe?.commandList?.countAfterPropagate !== 0
        || frameKeyboardFocusLostProbe?.keyStatus?.aDown !== false
        || frameKeyboardFocusLostProbe?.keyStatus?.leftShiftDown !== false
        || frameKeyboardFocusLostProbe?.modifiers !== 0
        || frameKeyboardFocusLost.state.browserInput?.messageQueue?.count !== 0
        || frameKeyboardFocusLost.state.browserInput?.keyboardMessageQueue?.count !== 0
        || !frameKeyboardFocusLostEvents.some((event) => event.focusLost === true && event.engineKey === keyLost)) {
      throw new Error(`Original Keyboard frame-owned focus loss did not run through tick_frame: ${JSON.stringify(frameKeyboardFocusLost)}`);
    }

    await page.keyboard.up("A");
    await page.locator("#viewport").focus();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 3,
      "original Keyboard frame-owned focus-loss cleanup queue",
    );
    const resetFrameOwnerAfterInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameOwnerAfterInput.ok
        || resetFrameOwnerAfterInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameOwnerAfterInput.state.browserInput?.keyboardMessageQueue?.count !== 0) {
      throw new Error(`Original Keyboard frame-owned input cleanup mismatch: ${JSON.stringify(resetFrameOwnerAfterInput)}`);
    }
    const resetFrameOwnerAfterKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardFrameInput"));
    if (!resetFrameOwnerAfterKeyboard.ok
        || resetFrameOwnerAfterKeyboard.probe?.ticks !== 0
        || resetFrameOwnerAfterKeyboard.probe?.lastRan !== false
        || resetFrameOwnerAfterKeyboard.probe?.stream?.count !== 0
        || resetFrameOwnerAfterKeyboard.probe?.queue?.mirrorRemaining !== 0) {
      throw new Error(`Original Keyboard frame-owned keyboard cleanup mismatch: ${JSON.stringify(resetFrameOwnerAfterKeyboard)}`);
    }
    const resetFrameOwnerSharedAfterKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalKeyboardInputProbe"));
    if (!resetFrameOwnerSharedAfterKeyboard.ok
        || resetFrameOwnerSharedAfterKeyboard.probe?.inputFrame !== 0
        || resetFrameOwnerSharedAfterKeyboard.probe?.focusLost?.pending !== false
        || resetFrameOwnerSharedAfterKeyboard.probe?.modifiers !== 0
        || resetFrameOwnerSharedAfterKeyboard.probe?.keyStatus?.aDown !== false) {
      throw new Error(`Original Keyboard frame-owned shared cleanup mismatch: ${JSON.stringify(resetFrameOwnerSharedAfterKeyboard)}`);
    }
    const disableFrameOwnerAfterKeyboard = await page.evaluate(() =>
      window.CnCPort.rpc("setOriginalKeyboardFrameInput", { enabled: false }));
    if (!disableFrameOwnerAfterKeyboard.ok
        || disableFrameOwnerAfterKeyboard.probe?.enabled !== false
        || disableFrameOwnerAfterKeyboard.probe?.lastRan !== false) {
      throw new Error(`Original Keyboard frame-owned input cleanup disable mismatch: ${JSON.stringify(disableFrameOwnerAfterKeyboard)}`);
    }

    const resetFrameOwnerMouseInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameOwnerMouseInput.ok
        || resetFrameOwnerMouseInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameOwnerMouseInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Mouse frame-owned input reset mismatch: ${JSON.stringify(resetFrameOwnerMouseInput)}`);
    }
    const disableFrameOwnerMouse = await page.evaluate(() =>
      window.CnCPort.rpc("setOriginalMouseFrameInput", { enabled: false }));
    if (!disableFrameOwnerMouse.ok
        || disableFrameOwnerMouse.probe?.source !== "browser_original_mouse_frame_input"
        || disableFrameOwnerMouse.probe?.enabled !== false) {
      throw new Error(`Original Mouse frame-owned input did not disable cleanly: ${JSON.stringify(disableFrameOwnerMouse)}`);
    }
    const resetFrameOwnerMouse = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalMouseFrameInput"));
    if (!resetFrameOwnerMouse.ok
        || resetFrameOwnerMouse.probe?.source !== "browser_original_mouse_frame_input"
        || resetFrameOwnerMouse.probe?.enabled !== false
        || resetFrameOwnerMouse.probe?.initialized !== true
        || resetFrameOwnerMouse.probe?.lastRan !== false
        || resetFrameOwnerMouse.probe?.ticks !== 0
        || resetFrameOwnerMouse.probe?.stream?.count !== 0
        || resetFrameOwnerMouse.probe?.mouse?.win32Attached !== true
        || resetFrameOwnerMouse.probe?.gui?.attached !== true
        || resetFrameOwnerMouse.probe?.gui?.windowReady !== true
        || resetFrameOwnerMouse.probe?.gui?.buttonReady !== true
        || resetFrameOwnerMouse.probe?.gui?.leftDown !== 0
        || resetFrameOwnerMouse.probe?.gui?.leftUp !== 0
        || resetFrameOwnerMouse.probe?.gui?.leftDrag !== 0
        || resetFrameOwnerMouse.probe?.gui?.wheel !== 0
        || resetFrameOwnerMouse.probe?.gui?.buttonSelected !== 0
        || resetFrameOwnerMouse.probe?.gui?.grabbed !== false) {
      throw new Error(`Original Mouse frame-owned state reset mismatch: ${JSON.stringify(resetFrameOwnerMouse)}`);
    }
    const enableFrameOwnerMouse = await page.evaluate(() =>
      window.CnCPort.rpc("setOriginalMouseFrameInput", { enabled: true }));
    if (!enableFrameOwnerMouse.ok
        || enableFrameOwnerMouse.probe?.ok !== true
        || enableFrameOwnerMouse.probe?.enabled !== true
        || enableFrameOwnerMouse.probe?.initialized !== true
        || enableFrameOwnerMouse.probe?.lastRan !== false
        || enableFrameOwnerMouse.probe?.ticks !== 0
        || enableFrameOwnerMouse.probe?.lifecycle?.messageStream !== "frame-owned"
        || enableFrameOwnerMouse.probe?.lifecycle?.commandList !== "frame-owned"
        || enableFrameOwnerMouse.probe?.lifecycle?.promotedToTickFrame !== true
        || enableFrameOwnerMouse.probe?.gui?.attached !== true
        || enableFrameOwnerMouse.probe?.gui?.windowReady !== true
        || enableFrameOwnerMouse.probe?.gui?.buttonReady !== true
        || enableFrameOwnerMouse.probe?.gui?.grabbed !== false) {
      throw new Error(`Original Mouse frame-owned input did not enable: ${JSON.stringify(enableFrameOwnerMouse)}`);
    }

    const GWM_LEFT_DOWN = 5;
    const GWM_LEFT_UP = 6;
    const GWM_LEFT_DRAG = 8;
    const GWM_WHEEL_UP = 19;
    const frameMouseX = 456;
    const frameMouseY = 123;
    await page.mouse.move(canvasBox.x + frameMouseX, canvasBox.y + frameMouseY);
    await page.mouse.down();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2,
      "original Mouse frame-owned move/down queue",
    );
    const frameMouseDown = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    if (!frameMouseDown.ok) {
      throw new Error(`Original Mouse frame-owned frame RPC failed: ${JSON.stringify(frameMouseDown)}`);
    }
    const frameMouseProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameInputProbe"));
    const frameMouseDownProbe = frameMouseProbeResult.probe;
    const frameMouseDownMessages = frameMouseDownProbe?.stream?.messages ?? [];
    const frameMousePositionMessage = frameMouseDownMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_POSITION",
    );
    const frameMouseLeftDownMessage = frameMouseDownMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_DOWN",
    );
    assertOriginalMouseSemanticMessage(
      frameMousePositionMessage,
      {},
      "Original Mouse frame-owned position",
    );
    assertOriginalMouseSemanticMessage(
      frameMouseLeftDownMessage,
      { positionX: frameMouseX, positionY: frameMouseY, hasTimestamp: true },
      "Original Mouse frame-owned left down",
    );
    if (!frameMouseProbeResult.ok
        || frameMouseDownProbe?.source !== "browser_original_mouse_frame_input"
        || frameMouseDownProbe?.ok !== true
        || frameMouseDownProbe?.enabled !== true
        || frameMouseDownProbe?.initialized !== true
        || frameMouseDownProbe?.lastRan !== true
        || frameMouseDownProbe?.ticks !== 1
        || frameMouseDownProbe?.lifecycle?.promotedToTickFrame !== true
        || frameMouseDownProbe?.queue?.primaryRemainingBefore !== 0
        || frameMouseDownProbe?.queue?.primaryRemainingAfter !== 0
        || frameMouseDownProbe?.mouse?.win32Attached !== true
        || frameMouseDownProbe?.mouse?.streamAttached !== true
        || frameMouseDownProbe?.mouse?.inputFrame !== 1
        || (frameMouseDownProbe?.mouse?.eventsThisFrame ?? 0) < 1
        || frameMouseDownProbe?.stream?.count < 2
        || frameMouseDownProbe?.commandList?.countAfterPropagate !== 0
        || frameMouseDownProbe?.gui?.attached !== true
        || frameMouseDownProbe?.gui?.windowReady !== true
        || frameMouseDownProbe?.gui?.buttonReady !== true
        || frameMouseDownProbe?.gui?.mousePos < 1
        || frameMouseDownProbe?.gui?.leftDown !== 1
        || frameMouseDownProbe?.gui?.leftDownX !== frameMouseX
        || frameMouseDownProbe?.gui?.leftDownY !== frameMouseY
        || frameMouseDownProbe?.gui?.lastMessage !== GWM_LEFT_DOWN
        || frameMouseDownProbe?.gui?.grabbed !== true
        || !frameMousePositionMessage
        || frameMouseLeftDownMessage?.x !== frameMouseX
        || frameMouseLeftDownMessage?.y !== frameMouseY
        || frameMouseDown.state.browserInput?.messageQueue?.count !== 0
        || frameMouseProbeResult.state.browserInput?.messageQueue?.count !== 0) {
      throw new Error(`Original Mouse frame-owned down did not run through tick_frame: ${JSON.stringify({ frameMouseDown, frameMouseProbeResult })}`);
    }

    const frameMouseDragX = frameMouseX + 24;
    const frameMouseDragY = frameMouseY + 18;
    await page.mouse.move(canvasBox.x + frameMouseDragX, canvasBox.y + frameMouseDragY);
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "original Mouse frame-owned drag queue",
    );
    const frameMouseDrag = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    if (!frameMouseDrag.ok) {
      throw new Error(`Original Mouse frame-owned drag frame RPC failed: ${JSON.stringify(frameMouseDrag)}`);
    }
    const frameMouseDragProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameInputProbe"));
    const frameMouseDragProbe = frameMouseDragProbeResult.probe;
    const frameMouseDragMessages = frameMouseDragProbe?.stream?.messages ?? [];
    const frameMouseDragMessage = frameMouseDragMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_LEFT_DRAG",
    );
    assertOriginalMouseSemanticMessage(
      frameMouseDragMessage,
      {
        positionX: frameMouseDragX,
        positionY: frameMouseDragY,
        dragDeltaX: frameMouseDragX - frameMouseX,
        dragDeltaY: frameMouseDragY - frameMouseY,
      },
      "Original Mouse frame-owned left drag",
    );
    if (!frameMouseDragProbeResult.ok
        || frameMouseDragProbe?.enabled !== true
        || frameMouseDragProbe?.lastRan !== true
        || frameMouseDragProbe?.ticks !== 2
        || frameMouseDragProbe?.queue?.primaryRemainingBefore !== 0
        || frameMouseDragProbe?.queue?.primaryRemainingAfter !== 0
        || frameMouseDragProbe?.mouse?.win32Attached !== true
        || frameMouseDragProbe?.mouse?.streamAttached !== true
        || frameMouseDragProbe?.mouse?.inputFrame !== 2
        || (frameMouseDragProbe?.mouse?.eventsThisFrame ?? 0) < 1
        || frameMouseDragProbe?.stream?.count < 2
        || frameMouseDragProbe?.commandList?.countAfterPropagate !== 0
        || frameMouseDragProbe?.gui?.attached !== true
        || frameMouseDragProbe?.gui?.windowReady !== true
        || frameMouseDragProbe?.gui?.buttonReady !== true
        || frameMouseDragProbe?.gui?.leftDown !== 1
        || frameMouseDragProbe?.gui?.leftDrag !== 1
        || frameMouseDragProbe?.gui?.leftDragX !== frameMouseDragX
        || frameMouseDragProbe?.gui?.leftDragY !== frameMouseDragY
        || frameMouseDragProbe?.gui?.lastMessage !== GWM_LEFT_DRAG
        || frameMouseDragProbe?.gui?.grabbed !== true
        || frameMouseDragMessage?.x !== frameMouseDragX
        || frameMouseDragMessage?.y !== frameMouseDragY
        || frameMouseDragMessage?.deltaX !== frameMouseDragX - frameMouseX
        || frameMouseDragMessage?.deltaY !== frameMouseDragY - frameMouseY
        || frameMouseDrag.state.browserInput?.messageQueue?.count !== 0
        || frameMouseDragProbeResult.state.browserInput?.messageQueue?.count !== 0) {
      throw new Error(`Original Mouse frame-owned drag did not run through tick_frame: ${JSON.stringify({ frameMouseDrag, frameMouseDragProbeResult })}`);
    }

    await page.mouse.up();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "original Mouse frame-owned cleanup up queue",
    );
    const frameMouseUp = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    if (!frameMouseUp.ok) {
      throw new Error(`Original Mouse frame-owned up frame RPC failed: ${JSON.stringify(frameMouseUp)}`);
    }
    const frameMouseUpProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameInputProbe"));
    const frameMouseUpProbe = frameMouseUpProbeResult.probe;
    const frameMouseUpMessages = frameMouseUpProbe?.stream?.messages ?? [];
    const frameMouseUpMessage = frameMouseUpMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_UP",
    );
    assertOriginalMouseSemanticMessage(
      frameMouseUpMessage,
      { positionX: frameMouseDragX, positionY: frameMouseDragY, hasTimestamp: true },
      "Original Mouse frame-owned left up",
    );
    if (!frameMouseUpProbeResult.ok
        || frameMouseUpProbe?.enabled !== true
        || frameMouseUpProbe?.lastRan !== true
        || frameMouseUpProbe?.ticks !== 3
        || frameMouseUpProbe?.queue?.primaryRemainingBefore !== 0
        || frameMouseUpProbe?.queue?.primaryRemainingAfter !== 0
        || frameMouseUpProbe?.mouse?.win32Attached !== true
        || frameMouseUpProbe?.mouse?.streamAttached !== true
        || frameMouseUpProbe?.mouse?.inputFrame !== 3
        || (frameMouseUpProbe?.mouse?.eventsThisFrame ?? 0) < 1
        || frameMouseUpProbe?.stream?.count < 2
        || frameMouseUpProbe?.commandList?.countAfterPropagate !== 0
        || frameMouseUpProbe?.gui?.attached !== true
        || frameMouseUpProbe?.gui?.windowReady !== true
        || frameMouseUpProbe?.gui?.buttonReady !== true
        || frameMouseUpProbe?.gui?.leftDown !== 1
        || frameMouseUpProbe?.gui?.leftDrag !== 1
        || frameMouseUpProbe?.gui?.leftUp !== 1
        || frameMouseUpProbe?.gui?.leftUpX !== frameMouseDragX
        || frameMouseUpProbe?.gui?.leftUpY !== frameMouseDragY
        || frameMouseUpProbe?.gui?.lastMessage !== GWM_LEFT_UP
        || frameMouseUpProbe?.gui?.grabbed !== false
        || frameMouseUpMessage?.x !== frameMouseDragX
        || frameMouseUpMessage?.y !== frameMouseDragY
        || frameMouseUp.state.browserInput?.messageQueue?.count !== 0
        || frameMouseUpProbeResult.state.browserInput?.messageQueue?.count !== 0) {
      throw new Error(`Original Mouse frame-owned up did not run through tick_frame: ${JSON.stringify({ frameMouseUp, frameMouseUpProbeResult })}`);
    }
    const resetFrameOwnerAfterMouse = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalMouseFrameInput"));
    if (!resetFrameOwnerAfterMouse.ok
        || resetFrameOwnerAfterMouse.probe?.ticks !== 0
        || resetFrameOwnerAfterMouse.probe?.lastRan !== false
        || resetFrameOwnerAfterMouse.probe?.stream?.count !== 0
        || resetFrameOwnerAfterMouse.probe?.mouse?.win32Attached !== true
        || resetFrameOwnerAfterMouse.probe?.gui?.attached !== true
        || resetFrameOwnerAfterMouse.probe?.gui?.buttonReady !== true
        || resetFrameOwnerAfterMouse.probe?.gui?.leftDown !== 0
        || resetFrameOwnerAfterMouse.probe?.gui?.leftUp !== 0
        || resetFrameOwnerAfterMouse.probe?.gui?.leftDrag !== 0
        || resetFrameOwnerAfterMouse.probe?.gui?.buttonSelected !== 0
        || resetFrameOwnerAfterMouse.probe?.gui?.grabbed !== false) {
      throw new Error(`Original Mouse frame-owned mouse cleanup mismatch: ${JSON.stringify(resetFrameOwnerAfterMouse)}`);
    }

    const frameMouseButtonX = 64;
    const frameMouseButtonY = 48;
    const frameMouseButtonStyle = 0x00000401; // GWS_PUSH_BUTTON | GWS_MOUSE_TRACK.
    const frameMouseButtonEnabledStatus = 0x00000008; // WIN_STATUS_ENABLED.
    await page.mouse.move(canvasBox.x + frameMouseButtonX, canvasBox.y + frameMouseButtonY);
    await page.mouse.down();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 2,
      "original Mouse frame-owned GadgetPushButton down queue",
    );
    const frameMouseButtonDown = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    if (!frameMouseButtonDown.ok) {
      throw new Error(`Original Mouse frame-owned GadgetPushButton down frame RPC failed: ${JSON.stringify(frameMouseButtonDown)}`);
    }
    const frameMouseButtonDownProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameInputProbe"));
    const frameMouseButtonDownProbe = frameMouseButtonDownProbeResult.probe;
    const frameMouseButtonDownMessages = frameMouseButtonDownProbe?.stream?.messages ?? [];
    const frameMouseButtonLeftDownMessage = frameMouseButtonDownMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_DOWN",
    );
    assertOriginalMouseSemanticMessage(
      frameMouseButtonLeftDownMessage,
      { positionX: frameMouseButtonX, positionY: frameMouseButtonY, hasTimestamp: true },
      "Original Mouse frame-owned GadgetPushButton left down",
    );
    if (!frameMouseButtonDownProbeResult.ok
        || frameMouseButtonDownProbe?.enabled !== true
        || frameMouseButtonDownProbe?.lastRan !== true
        || frameMouseButtonDownProbe?.ticks !== 1
        || frameMouseButtonDownProbe?.commandList?.countAfterPropagate !== 0
        || frameMouseButtonDownProbe?.gui?.attached !== true
        || frameMouseButtonDownProbe?.gui?.windowReady !== true
        || frameMouseButtonDownProbe?.gui?.buttonReady !== true
        || frameMouseButtonDownProbe?.gui?.buttonSelected !== 0
        || frameMouseButtonDownProbe?.gui?.buttonGrabbed !== true
        || frameMouseButtonDownProbe?.gui?.grabbed !== false
        || frameMouseButtonLeftDownMessage?.x !== frameMouseButtonX
        || frameMouseButtonLeftDownMessage?.y !== frameMouseButtonY
        || frameMouseButtonDown.state.browserInput?.messageQueue?.count !== 0
        || frameMouseButtonDownProbeResult.state.browserInput?.messageQueue?.count !== 0) {
      throw new Error(`Original Mouse frame-owned GadgetPushButton down did not run through tick_frame: ${JSON.stringify({ frameMouseButtonDown, frameMouseButtonDownProbeResult })}`);
    }

    await page.mouse.up();
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "original Mouse frame-owned GadgetPushButton up queue",
    );
    const frameMouseButtonUp = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    if (!frameMouseButtonUp.ok) {
      throw new Error(`Original Mouse frame-owned GadgetPushButton up frame RPC failed: ${JSON.stringify(frameMouseButtonUp)}`);
    }
    const frameMouseButtonUpProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameInputProbe"));
    const frameMouseButtonUpProbe = frameMouseButtonUpProbeResult.probe;
    const frameMouseButtonUpMessages = frameMouseButtonUpProbe?.stream?.messages ?? [];
    const frameMouseButtonLeftUpMessage = frameMouseButtonUpMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_UP",
    );
    assertOriginalMouseSemanticMessage(
      frameMouseButtonLeftUpMessage,
      { positionX: frameMouseButtonX, positionY: frameMouseButtonY, hasTimestamp: true },
      "Original Mouse frame-owned GadgetPushButton left up",
    );
    if (!frameMouseButtonUpProbeResult.ok
        || frameMouseButtonUpProbe?.enabled !== true
        || frameMouseButtonUpProbe?.lastRan !== true
        || frameMouseButtonUpProbe?.ticks !== 2
        || frameMouseButtonUpProbe?.commandList?.countAfterPropagate !== 0
        || frameMouseButtonUpProbe?.gui?.attached !== true
        || frameMouseButtonUpProbe?.gui?.windowReady !== true
        || frameMouseButtonUpProbe?.gui?.buttonReady !== true
        || frameMouseButtonUpProbe?.gui?.buttonSelected !== 1
        || frameMouseButtonUpProbe?.gui?.buttonSelectedX !== frameMouseButtonX
        || frameMouseButtonUpProbe?.gui?.buttonSelectedY !== frameMouseButtonY
        || frameMouseButtonUpProbe?.gui?.buttonSelectedSourceMatches !== true
        || frameMouseButtonUpProbe?.gui?.buttonGrabbed !== false
        || frameMouseButtonUpProbe?.gui?.grabbed !== false
        || frameMouseButtonLeftUpMessage?.x !== frameMouseButtonX
        || frameMouseButtonLeftUpMessage?.y !== frameMouseButtonY
        || frameMouseButtonUp.state.browserInput?.messageQueue?.count !== 0
        || frameMouseButtonUpProbeResult.state.browserInput?.messageQueue?.count !== 0) {
      throw new Error(`Original Mouse frame-owned GadgetPushButton up did not send GBM_SELECTED: ${JSON.stringify({ frameMouseButtonUp, frameMouseButtonUpProbeResult })}`);
    }

    const resetFrameOwnerAfterButton = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalMouseFrameInput"));
    if (!resetFrameOwnerAfterButton.ok
        || resetFrameOwnerAfterButton.probe?.ticks !== 0
        || resetFrameOwnerAfterButton.probe?.lastRan !== false
        || resetFrameOwnerAfterButton.probe?.stream?.count !== 0
        || resetFrameOwnerAfterButton.probe?.mouse?.win32Attached !== true
        || resetFrameOwnerAfterButton.probe?.gui?.attached !== true
        || resetFrameOwnerAfterButton.probe?.gui?.buttonReady !== true
        || resetFrameOwnerAfterButton.probe?.gui?.buttonSelected !== 0
        || resetFrameOwnerAfterButton.probe?.gui?.buttonGrabbed !== false
        || resetFrameOwnerAfterButton.probe?.gui?.grabbed !== false) {
      throw new Error(`Original Mouse frame-owned GadgetPushButton cleanup mismatch: ${JSON.stringify(resetFrameOwnerAfterButton)}`);
    }

    const frameMouseWindowProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameWindows"));
    const frameMouseWindowProbe = frameMouseWindowProbeResult.probe;
    const frameMouseButtonWindow = frameMouseWindowProbe?.windows?.find(
      (window) => window.name === "frameMouseProbeButton",
    );
    const resolvedFrameMouseButtonId = await page.evaluate(() =>
      window.CnCPort.rpc("resolveOriginalMouseFrameWindowId", { name: "frameMouseProbeButton" }));
    const missingFrameMouseButtonId = await page.evaluate(() =>
      window.CnCPort.rpc("resolveOriginalMouseFrameWindowId", { name: "missingFrameMouseWidget" }));
    if (!frameMouseWindowProbeResult.ok
        || frameMouseWindowProbe?.ok !== true
        || frameMouseWindowProbe?.windowManagerReady !== true
        || frameMouseWindowProbe?.windowCount < 2
        || !frameMouseButtonWindow
        || frameMouseButtonWindow.id <= 0
        || frameMouseButtonWindow.nameKey !== frameMouseButtonWindow.id
        || frameMouseButtonWindow.kind !== "GadgetPushButton"
        || frameMouseButtonWindow.clickable !== true
        || frameMouseButtonWindow.x !== 32
        || frameMouseButtonWindow.y !== 32
        || frameMouseButtonWindow.width !== 96
        || frameMouseButtonWindow.height !== 32
        || frameMouseButtonWindow.clickX !== frameMouseButtonX
        || frameMouseButtonWindow.clickY !== frameMouseButtonY
        || frameMouseButtonWindow.clickInside !== true
        || frameMouseButtonWindow.style !== frameMouseButtonStyle
        || (frameMouseButtonWindow.status & frameMouseButtonEnabledStatus) !== frameMouseButtonEnabledStatus
        || !resolvedFrameMouseButtonId.ok
        || resolvedFrameMouseButtonId.id !== frameMouseButtonWindow.id
        || missingFrameMouseButtonId.ok !== false
        || missingFrameMouseButtonId.id !== 0) {
      throw new Error(`Original Mouse frame window list did not expose the named button: ${JSON.stringify({ frameMouseWindowProbeResult, resolvedFrameMouseButtonId, missingFrameMouseButtonId })}`);
    }

    const missingFrameMouseWidgetClick = await page.evaluate(() =>
      window.CnCPort.rpc("clickOriginalMouseFrameWidget", { name: "missingFrameMouseWidget" }));
    if (missingFrameMouseWidgetClick.ok !== false
        || !String(missingFrameMouseWidgetClick.error ?? "").includes("Unknown original mouse frame widget")
        || !missingFrameMouseWidgetClick.knownWidgets?.includes("frameMouseProbeButton")
        || !missingFrameMouseWidgetClick.windowProbe?.windows?.some((window) => window.name === "frameMouseProbeButton")) {
      throw new Error(`Original Mouse named widget click did not reject an unknown widget: ${JSON.stringify(missingFrameMouseWidgetClick)}`);
    }

    const wrongCaseFrameMouseWidgetClick = await page.evaluate(() =>
      window.CnCPort.rpc("clickOriginalMouseFrameWidget", { name: "FrameMouseProbeButton" }));
    if (wrongCaseFrameMouseWidgetClick.ok !== false
        || !String(wrongCaseFrameMouseWidgetClick.error ?? "").includes("Unknown original mouse frame widget")
        || !wrongCaseFrameMouseWidgetClick.knownWidgets?.includes("frameMouseProbeButton")) {
      throw new Error(`Original Mouse named widget click did not reject a case-mismatched widget: ${JSON.stringify(wrongCaseFrameMouseWidgetClick)}`);
    }

    const namedFrameMouseWidgetClick = await page.evaluate(() =>
      window.CnCPort.rpc("clickOriginalMouseFrameWidget", { name: "frameMouseProbeButton" }));
    const namedFrameMouseWidget = namedFrameMouseWidgetClick.widget;
    const namedFrameMouseDownProbe = namedFrameMouseWidgetClick.down?.probe;
    const namedFrameMouseUpProbe = namedFrameMouseWidgetClick.up?.probe;
    const namedFrameMouseDownMessages = namedFrameMouseDownProbe?.stream?.messages ?? [];
    const namedFrameMouseUpMessages = namedFrameMouseUpProbe?.stream?.messages ?? [];
    const namedFrameMouseLeftDownMessage = namedFrameMouseDownMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_DOWN",
    );
    const namedFrameMouseLeftUpMessage = namedFrameMouseUpMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_UP",
    );
    assertOriginalMouseSemanticMessage(
      namedFrameMouseLeftDownMessage,
      { positionX: frameMouseButtonX, positionY: frameMouseButtonY, hasTimestamp: true },
      "Original Mouse named frame widget left down",
    );
    assertOriginalMouseSemanticMessage(
      namedFrameMouseLeftUpMessage,
      { positionX: frameMouseButtonX, positionY: frameMouseButtonY, hasTimestamp: true },
      "Original Mouse named frame widget left up",
    );
    if (!namedFrameMouseWidgetClick.ok
        || namedFrameMouseWidgetClick.name !== "frameMouseProbeButton"
        || namedFrameMouseWidgetClick.selectedBefore !== 0
        || namedFrameMouseWidgetClick.selectedAfter !== 1
        || namedFrameMouseWidget?.kind !== "GadgetPushButton"
        || namedFrameMouseWidget?.id !== frameMouseButtonWindow.id
        || namedFrameMouseWidget?.nameKey !== frameMouseButtonWindow.id
        || namedFrameMouseWidget?.rect?.x !== 32
        || namedFrameMouseWidget?.rect?.y !== 32
        || namedFrameMouseWidget?.rect?.width !== 96
        || namedFrameMouseWidget?.rect?.height !== 32
        || namedFrameMouseWidget?.point?.x !== frameMouseButtonX
        || namedFrameMouseWidget?.point?.y !== frameMouseButtonY
        || namedFrameMouseWidget?.window?.name !== "frameMouseProbeButton"
        || namedFrameMouseWidget?.window?.id !== frameMouseButtonWindow.id
        || namedFrameMouseWidget?.window?.clickable !== true
        || !namedFrameMouseWidgetClick.windowProbe?.windows?.some(
          (window) => window.name === "frameMouseProbeButton" && window.id === frameMouseButtonWindow.id)
        || namedFrameMouseDownProbe?.gui?.buttonName !== "frameMouseProbeButton"
        || namedFrameMouseDownProbe?.gui?.buttonNameMatches !== true
        || namedFrameMouseDownProbe?.gui?.buttonStyle !== frameMouseButtonStyle
        || (namedFrameMouseDownProbe?.gui?.buttonStatus & frameMouseButtonEnabledStatus) !== frameMouseButtonEnabledStatus
        || namedFrameMouseDownProbe?.gui?.buttonClickX !== frameMouseButtonX
        || namedFrameMouseDownProbe?.gui?.buttonClickY !== frameMouseButtonY
        || namedFrameMouseDownProbe?.gui?.buttonClickInside !== true
        || namedFrameMouseWidgetClick.down?.postQueueCount !== 2
        || namedFrameMouseWidgetClick.down?.frameQueueCount !== 0
        || namedFrameMouseWidgetClick.up?.postQueueCount !== 1
        || namedFrameMouseWidgetClick.up?.frameQueueCount !== 0
        || namedFrameMouseDownProbe?.enabled !== true
        || namedFrameMouseDownProbe?.lastRan !== true
        || namedFrameMouseDownProbe?.commandList?.countAfterPropagate !== 0
        || namedFrameMouseDownProbe?.gui?.buttonSelected !== 0
        || namedFrameMouseDownProbe?.gui?.buttonGrabbed !== true
        || namedFrameMouseDownProbe?.gui?.grabbed !== false
        || namedFrameMouseUpProbe?.enabled !== true
        || namedFrameMouseUpProbe?.lastRan !== true
        || namedFrameMouseUpProbe?.commandList?.countAfterPropagate !== 0
        || namedFrameMouseUpProbe?.gui?.buttonName !== "frameMouseProbeButton"
        || namedFrameMouseUpProbe?.gui?.buttonNameMatches !== true
        || namedFrameMouseUpProbe?.gui?.buttonStyle !== frameMouseButtonStyle
        || (namedFrameMouseUpProbe?.gui?.buttonStatus & frameMouseButtonEnabledStatus) !== frameMouseButtonEnabledStatus
        || namedFrameMouseUpProbe?.gui?.buttonClickX !== frameMouseButtonX
        || namedFrameMouseUpProbe?.gui?.buttonClickY !== frameMouseButtonY
        || namedFrameMouseUpProbe?.gui?.buttonClickInside !== true
        || namedFrameMouseUpProbe?.gui?.buttonSelected !== 1
        || namedFrameMouseUpProbe?.gui?.buttonSelectedX !== frameMouseButtonX
        || namedFrameMouseUpProbe?.gui?.buttonSelectedY !== frameMouseButtonY
        || namedFrameMouseUpProbe?.gui?.buttonSelectedSourceMatches !== true
        || namedFrameMouseUpProbe?.gui?.buttonGrabbed !== false
        || namedFrameMouseUpProbe?.gui?.grabbed !== false
        || namedFrameMouseLeftDownMessage?.x !== frameMouseButtonX
        || namedFrameMouseLeftDownMessage?.y !== frameMouseButtonY
        || namedFrameMouseLeftUpMessage?.x !== frameMouseButtonX
        || namedFrameMouseLeftUpMessage?.y !== frameMouseButtonY
        || namedFrameMouseWidgetClick.state?.browserInput?.messageQueue?.count !== 0) {
      throw new Error(`Original Mouse named frame widget click did not route through the original button path: ${JSON.stringify(namedFrameMouseWidgetClick)}`);
    }

    const resetFrameOwnerAfterNamedButton = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalMouseFrameInput"));
    if (!resetFrameOwnerAfterNamedButton.ok
        || resetFrameOwnerAfterNamedButton.probe?.ticks !== 0
        || resetFrameOwnerAfterNamedButton.probe?.lastRan !== false
        || resetFrameOwnerAfterNamedButton.probe?.stream?.count !== 0
        || resetFrameOwnerAfterNamedButton.probe?.mouse?.win32Attached !== true
        || resetFrameOwnerAfterNamedButton.probe?.gui?.buttonReady !== true
        || resetFrameOwnerAfterNamedButton.probe?.gui?.buttonSelected !== 0
        || resetFrameOwnerAfterNamedButton.probe?.gui?.buttonGrabbed !== false
        || resetFrameOwnerAfterNamedButton.probe?.gui?.grabbed !== false) {
      throw new Error(`Original Mouse named frame widget cleanup mismatch: ${JSON.stringify(resetFrameOwnerAfterNamedButton)}`);
    }
    const resetFrameMouseWindowProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameWindows"));
    const resetFrameMouseButtonWindow = resetFrameMouseWindowProbeResult.probe?.windows?.find(
      (window) => window.name === "frameMouseProbeButton",
    );
    if (!resetFrameMouseWindowProbeResult.ok
        || resetFrameMouseButtonWindow?.id !== frameMouseButtonWindow.id
        || resetFrameMouseButtonWindow?.nameKey !== frameMouseButtonWindow.id
        || resetFrameMouseButtonWindow?.clickable !== true
        || resetFrameMouseButtonWindow?.clickInside !== true) {
      throw new Error(`Original Mouse frame window list was not stable after reset: ${JSON.stringify(resetFrameMouseWindowProbeResult)}`);
    }

    const frameMouseWheelX = 345;
    const frameMouseWheelY = 67;
    await page.mouse.move(canvasBox.x + frameMouseWheelX, canvasBox.y + frameMouseWheelY);
    const resetFrameOwnerWheelInput = await page.evaluate(() => window.CnCPort.rpc("resetInput"));
    if (!resetFrameOwnerWheelInput.ok
        || resetFrameOwnerWheelInput.state.browserInput?.messageQueue?.count !== 0
        || resetFrameOwnerWheelInput.state.browserInput?.messageQueue?.overflowed !== false) {
      throw new Error(`Original Mouse frame-owned wheel input reset mismatch: ${JSON.stringify(resetFrameOwnerWheelInput)}`);
    }
    await page.mouse.wheel(0, -120);
    await waitForBrowserInput(
      page,
      (input) => input?.messageQueue?.count >= 1,
      "original Mouse frame-owned wheel queue",
    );
    const frameMouseWheel = await page.evaluate(() => window.CnCPort.rpc("frame", {
      count: 1,
    }));
    if (!frameMouseWheel.ok) {
      throw new Error(`Original Mouse frame-owned wheel frame RPC failed: ${JSON.stringify(frameMouseWheel)}`);
    }
    const frameMouseWheelProbeResult = await page.evaluate(() =>
      window.CnCPort.rpc("originalMouseFrameInputProbe"));
    const frameMouseWheelProbe = frameMouseWheelProbeResult.probe;
    const frameMouseWheelMessages = frameMouseWheelProbe?.stream?.messages ?? [];
    const frameMouseWheelMessage = frameMouseWheelMessages.find(
      (message) => message.typeName === "MSG_RAW_MOUSE_WHEEL",
    );
    assertOriginalMouseSemanticMessage(
      frameMouseWheelMessage,
      { positionX: frameMouseWheelX, positionY: frameMouseWheelY, wheelClicks: 1 },
      "Original Mouse frame-owned wheel",
    );
    if (!frameMouseWheelProbeResult.ok
        || frameMouseWheelProbe?.enabled !== true
        || frameMouseWheelProbe?.lastRan !== true
        || frameMouseWheelProbe?.ticks !== 1
        || frameMouseWheelProbe?.queue?.primaryRemainingBefore !== 0
        || frameMouseWheelProbe?.queue?.primaryRemainingAfter !== 0
        || frameMouseWheelProbe?.mouse?.win32Attached !== true
        || frameMouseWheelProbe?.mouse?.streamAttached !== true
        || frameMouseWheelProbe?.mouse?.inputFrame !== 1
        || (frameMouseWheelProbe?.mouse?.eventsThisFrame ?? 0) < 1
        || frameMouseWheelProbe?.stream?.count < 2
        || frameMouseWheelProbe?.commandList?.countAfterPropagate !== 0
        || frameMouseWheelProbe?.gui?.attached !== true
        || frameMouseWheelProbe?.gui?.windowReady !== true
        || frameMouseWheelProbe?.gui?.wheelUp !== 1
        || frameMouseWheelProbe?.gui?.wheelDown !== 0
        || frameMouseWheelProbe?.gui?.wheel !== 1
        || frameMouseWheelProbe?.gui?.wheelX !== frameMouseWheelX
        || frameMouseWheelProbe?.gui?.wheelY !== frameMouseWheelY
        || frameMouseWheelProbe?.gui?.lastMessage !== GWM_WHEEL_UP
        || frameMouseWheelProbe?.gui?.grabbed !== false
        || frameMouseWheelMessage?.x !== frameMouseWheelX
        || frameMouseWheelMessage?.y !== frameMouseWheelY
        || frameMouseWheel.state.browserInput?.messageQueue?.count !== 0
        || frameMouseWheelProbeResult.state.browserInput?.messageQueue?.count !== 0) {
      throw new Error(`Original Mouse frame-owned wheel did not run through tick_frame: ${JSON.stringify({ frameMouseWheel, frameMouseWheelProbeResult })}`);
    }

    const resetFrameOwnerAfterWheel = await page.evaluate(() =>
      window.CnCPort.rpc("resetOriginalMouseFrameInput"));
    if (!resetFrameOwnerAfterWheel.ok
        || resetFrameOwnerAfterWheel.probe?.ticks !== 0
        || resetFrameOwnerAfterWheel.probe?.lastRan !== false
        || resetFrameOwnerAfterWheel.probe?.stream?.count !== 0
        || resetFrameOwnerAfterWheel.probe?.mouse?.win32Attached !== true
        || resetFrameOwnerAfterWheel.probe?.gui?.attached !== true
        || resetFrameOwnerAfterWheel.probe?.gui?.wheel !== 0
        || resetFrameOwnerAfterWheel.probe?.gui?.grabbed !== false) {
      throw new Error(`Original Mouse frame-owned wheel cleanup mismatch: ${JSON.stringify(resetFrameOwnerAfterWheel)}`);
    }
    const disableFrameOwnerAfterMouse = await page.evaluate(() =>
      window.CnCPort.rpc("setOriginalMouseFrameInput", { enabled: false }));
    if (!disableFrameOwnerAfterMouse.ok
        || disableFrameOwnerAfterMouse.probe?.enabled !== false
        || disableFrameOwnerAfterMouse.probe?.lastRan !== false) {
      throw new Error(`Original Mouse frame-owned input cleanup disable mismatch: ${JSON.stringify(disableFrameOwnerAfterMouse)}`);
    }
  }

  const frameBaseline = await page.evaluate(() => window.CnCPort.rpc("state"));
  const initialFrame = frameBaseline.state.frame;
  const frameResult = await page.evaluate(() => window.CnCPort.rpc("frame", {
    count: 3,
  }));
  if (!frameResult.ok) {
    throw new Error(`Frame RPC failed: ${JSON.stringify(frameResult)}`);
  }
  if (frameResult.state.frame !== initialFrame + 3) {
    throw new Error(`Frame RPC did not advance deterministically: ${JSON.stringify(frameResult.state)}`);
  }
  if (expectWasm) {
    assertWasmTiming(frameResult.state, "frame");
    assertWin32Timing(frameResult.state, "frame", bootResult.state.win32Timing);
    if (frameResult.state.timing.lastTickMs < bootResult.state.timing.lastTickMs) {
      throw new Error(`Frame timing regressed: ${JSON.stringify(frameResult.state.timing)}`);
    }
  }

  if (expectWasm) {
    const loopStartResult = await page.evaluate(() => window.CnCPort.rpc("startMainLoop"));
    if (!loopStartResult.ok || !loopStartResult.state.mainLoop.running) {
      throw new Error(`Main loop start RPC failed: ${JSON.stringify(loopStartResult)}`);
    }
    if (loopStartResult.state.mainLoop.fps !== 60) {
      throw new Error(`Unexpected main loop FPS: ${JSON.stringify(loopStartResult.state.mainLoop)}`);
    }
    assertWasmTiming(loopStartResult.state, "main loop start");
    assertWin32Timing(loopStartResult.state, "main loop start", frameResult.state.win32Timing);
    const loopStartTickMs = loopStartResult.state.timing.lastTickMs;

    const loopState = await waitForMainLoopTicks(
      page,
      loopStartResult.state.frame,
      loopStartResult.state.mainLoop.ticks,
      2,
    );
    if (!loopState.mainLoop.running) {
      throw new Error(`Main loop stopped before ticking: ${JSON.stringify(loopState)}`);
    }
    assertWasmTiming(loopState, "main loop tick");
    assertWin32Timing(loopState, "main loop tick", loopStartResult.state.win32Timing);
    if (loopState.timing.lastTickMs < loopStartTickMs) {
      throw new Error(`Main loop timing regressed: ${JSON.stringify(loopState.timing)}`);
    }

    const loopStopResult = await page.evaluate(() => window.CnCPort.rpc("stopMainLoop"));
    if (!loopStopResult.ok || loopStopResult.state.mainLoop.running) {
      throw new Error(`Main loop stop RPC failed: ${JSON.stringify(loopStopResult)}`);
    }

    const stoppedFrame = loopStopResult.state.frame;
    await page.waitForTimeout(80);
    const afterStopResult = await page.evaluate(() => window.CnCPort.rpc("state"));
    if (afterStopResult.state.frame !== stoppedFrame || afterStopResult.state.mainLoop.running) {
      throw new Error(`Main loop advanced after stop: ${JSON.stringify(afterStopResult.state)}`);
    }
  }

  const logResult = await page.evaluate(() => window.CnCPort.rpc("log", {
    message: "smoke test reached browser harness",
  }));
  if (!logResult.ok) {
    throw new Error(`Log RPC failed: ${JSON.stringify(logResult)}`);
  }

  await page.setViewportSize({ width: 960, height: 640 });
  const resizedState = await waitForCanvasSize(page, 960, 540);
  if (resizedState.graphics.api !== "webgl2" || resizedState.graphics.contextLost) {
    throw new Error(`WebGL2 context did not survive resize: ${JSON.stringify(resizedState.graphics)}`);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await waitForCanvasSize(page, 1280, 720);

  const clearResult = await page.evaluate(() => window.CnCPort.rpc("clearCanvas", {
    rgba: [32, 64, 128, 255],
  }));
  if (!clearResult.ok
      || clearResult.probe?.source !== "browser_webgl2_clear"
      || clearResult.probe?.clearColor?.join(",") !== "32,64,128,255"
      || clearResult.probe?.topLeftPixel?.join(",") !== "32,64,128,255"
      || clearResult.state.graphics?.lastClearOk !== true) {
    throw new Error(`Canvas WebGL2 clear probe failed: ${JSON.stringify(clearResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: clearCanvasScreenshot });

  const d3d8ClearResult = await page.evaluate(() => window.CnCPort.rpc("d3d8Clear", {
    rgba: [48, 96, 144, 255],
  }));
  if (!d3d8ClearResult.ok
      || d3d8ClearResult.probe?.source !== "browser_d3d8_clear_probe"
      || d3d8ClearResult.probe?.rgba?.join(",") !== "48,96,144,255"
      || d3d8ClearResult.probe?.calls?.clear !== 1
      || d3d8ClearResult.browserProbe?.source !== "browser_d3d8_clear"
      || d3d8ClearResult.browserProbe?.topLeftPixel?.join(",") !== "48,96,144,255"
      || d3d8ClearResult.screenshot?.topLeftPixel?.join(",") !== "48,96,144,255") {
    throw new Error(`D3D8 WebGL2 clear probe failed: ${JSON.stringify(d3d8ClearResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: d3d8ClearCanvasScreenshot });

  const d3d8ViewportResult = await page.evaluate(() => window.CnCPort.rpc("d3d8Viewport"));
  const expectedD3D8ViewportBox = expectedD3D8ViewportGlBox(
    d3d8ViewportResult.probe?.viewport,
    d3d8ViewportResult.browserProbe,
  );
  if (!d3d8ViewportResult.ok
      || d3d8ViewportResult.probe?.source !== "browser_d3d8_viewport_probe"
      || d3d8ViewportResult.probe?.calls?.setViewport !== 1
      || d3d8ViewportResult.probe?.calls?.getViewport !== 1
      || d3d8ViewportResult.probe?.viewport?.x !== 32
      || d3d8ViewportResult.probe?.viewport?.y !== 48
      || d3d8ViewportResult.probe?.viewport?.width !== 320
      || d3d8ViewportResult.probe?.viewport?.height !== 180
      || Math.abs((d3d8ViewportResult.probe?.viewport?.minZ ?? 0) - 0.25) > 0.00001
      || Math.abs((d3d8ViewportResult.probe?.viewport?.maxZ ?? 0) - 0.75) > 0.00001
      || d3d8ViewportResult.browserProbe?.source !== "browser_d3d8_viewport"
      || d3d8ViewportResult.browserProbe?.reason !== "set"
      || d3d8ViewportResult.browserProbe?.d3d?.x !== 32
      || d3d8ViewportResult.browserProbe?.d3d?.y !== 48
      || d3d8ViewportResult.browserProbe?.d3d?.width !== 320
      || d3d8ViewportResult.browserProbe?.d3d?.height !== 180
      || d3d8ViewportResult.browserProbe?.renderTarget?.width !== 800
      || d3d8ViewportResult.browserProbe?.renderTarget?.height !== 600
      || d3d8ViewportResult.browserProbe?.gl?.x !== expectedD3D8ViewportBox[0]
      || d3d8ViewportResult.browserProbe?.gl?.y !== expectedD3D8ViewportBox[1]
      || d3d8ViewportResult.browserProbe?.gl?.width !== expectedD3D8ViewportBox[2]
      || d3d8ViewportResult.browserProbe?.gl?.height !== expectedD3D8ViewportBox[3]
      || Math.abs((d3d8ViewportResult.browserProbe?.gl?.minZ ?? 0) - 0.25) > 0.00001
      || Math.abs((d3d8ViewportResult.browserProbe?.gl?.maxZ ?? 0) - 0.75) > 0.00001
      || d3d8ViewportResult.browserProbe?.scissorEnabled !== true) {
    throw new Error(`D3D8 viewport bridge probe failed: ${JSON.stringify(d3d8ViewportResult)}`);
  }

  const d3d8BufferDirtyResult = await page.evaluate(() => window.CnCPort.rpc("d3d8BufferDirty"));
  if (!d3d8BufferDirtyResult.ok
      || d3d8BufferDirtyResult.probe?.source !== "browser_d3d8_buffer_dirty_probe"
      || d3d8BufferDirtyResult.probe?.vertexUpdate?.offset !== 24
      || d3d8BufferDirtyResult.probe?.vertexUpdate?.bytes !== 40
      || d3d8BufferDirtyResult.probe?.indexUpdate?.offset !== 8
      || d3d8BufferDirtyResult.probe?.indexUpdate?.bytes !== 20
      || d3d8BufferDirtyResult.browserProbe?.lastUpdate?.byteOffset !== 8
      || d3d8BufferDirtyResult.browserProbe?.lastUpdate?.byteSize !== 20
      || d3d8BufferDirtyResult.browserProbe?.liveVertex !== 0
      || d3d8BufferDirtyResult.browserProbe?.liveIndex !== 0) {
    throw new Error(`D3D8 dirty buffer update probe failed: ${JSON.stringify(d3d8BufferDirtyResult)}`);
  }

  const d3d8BufferHintsResult = await page.evaluate(() => window.CnCPort.rpc("d3d8BufferHints"));
  if (!d3d8BufferHintsResult.ok
      || d3d8BufferHintsResult.probe?.source !== "browser_d3d8_buffer_hints_probe"
      || d3d8BufferHintsResult.probe?.staticUpdate?.usage !== 8
      || d3d8BufferHintsResult.probe?.staticUpdate?.lockFlags !== 0
      || d3d8BufferHintsResult.probe?.dynamicUpdate?.usage !== 520
      || d3d8BufferHintsResult.probe?.dynamicUpdate?.lockFlags !== 10240
      || d3d8BufferHintsResult.browserProbe?.lastStaticCreate?.glUsage !== "staticDraw"
      || d3d8BufferHintsResult.browserProbe?.lastStaticCreate?.writeOnly !== true
      || d3d8BufferHintsResult.browserProbe?.lastDynamicCreate?.glUsage !== "streamDraw"
      || d3d8BufferHintsResult.browserProbe?.lastCreate?.glUsage !== "streamDraw"
      || d3d8BufferHintsResult.browserProbe?.lastUpdate?.glUsage !== "streamDraw"
      || d3d8BufferHintsResult.browserProbe?.lastUpdate?.discard !== true
      || d3d8BufferHintsResult.browserProbe?.lastUpdate?.noOverwrite !== false
      || d3d8BufferHintsResult.browserProbe?.lastUpdate?.orphaned !== true
      || d3d8BufferHintsResult.browserProbe?.lastUpdate?.byteOffset !== 0
      || d3d8BufferHintsResult.browserProbe?.lastUpdate?.byteSize !== 32
      || d3d8BufferHintsResult.browserProbe?.liveVertex !== 0
      || d3d8BufferHintsResult.browserProbe?.liveIndex !== 0) {
    throw new Error(`D3D8 buffer hint probe failed: ${JSON.stringify(d3d8BufferHintsResult)}`);
  }

  const d3d8TextureUploadResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TextureUpload"));
  if (!d3d8TextureUploadResult.ok
      || d3d8TextureUploadResult.probe?.source !== "browser_d3d8_texture_upload_probe"
      || d3d8TextureUploadResult.probe?.calls?.createTexture !== 2
      || d3d8TextureUploadResult.probe?.calls?.textureLockRect !== 3
      || d3d8TextureUploadResult.probe?.calls?.textureUnlockRect !== 3
      || d3d8TextureUploadResult.probe?.calls?.browserTextureCreate !== 2
      || d3d8TextureUploadResult.probe?.calls?.browserTextureUpdate !== 3
      || d3d8TextureUploadResult.probe?.calls?.browserTextureRelease !== 2
      || d3d8TextureUploadResult.probe?.argbUpdate?.pitch !== 16
      || d3d8TextureUploadResult.probe?.argbUpdate?.rowBytes !== 16
      || d3d8TextureUploadResult.probe?.subrectUpdate?.x !== 1
      || d3d8TextureUploadResult.probe?.subrectUpdate?.y !== 2
      || d3d8TextureUploadResult.probe?.subrectUpdate?.rowBytes !== 4
      || d3d8TextureUploadResult.browserProbe?.updates !== 3
      || d3d8TextureUploadResult.browserProbe?.releases !== 2
      || d3d8TextureUploadResult.browserProbe?.live !== 0
      || d3d8TextureUploadResult.browserProbe?.lastSubrectUpdate?.samplePixel?.join(",") !== "48,32,16,64"
      || d3d8TextureUploadResult.browserProbe?.lastUpdate?.format !== 22
      || d3d8TextureUploadResult.browserProbe?.lastUpdate?.samplePixel?.join(",") !== "7,6,5,255") {
    throw new Error(`D3D8 texture upload probe failed: ${JSON.stringify(d3d8TextureUploadResult)}`);
  }

  const d3d8VolumeTextureUploadResult = await page.evaluate(() => window.CnCPort.rpc("d3d8VolumeTextureUpload"));
  if (!d3d8VolumeTextureUploadResult.ok
      || d3d8VolumeTextureUploadResult.probe?.source !== "browser_d3d8_volume_texture_upload_probe"
      || d3d8VolumeTextureUploadResult.probe?.calls?.createVolumeTexture !== 1
      || d3d8VolumeTextureUploadResult.probe?.calls?.textureLockBox !== 3
      || d3d8VolumeTextureUploadResult.probe?.calls?.textureUnlockBox !== 3
      || d3d8VolumeTextureUploadResult.probe?.calls?.browserTextureCreate !== 1
      || d3d8VolumeTextureUploadResult.probe?.calls?.browserTextureUpdate !== 3
      || d3d8VolumeTextureUploadResult.probe?.calls?.browserTextureRelease !== 1
      || d3d8VolumeTextureUploadResult.probe?.calls?.browserTextureBind !== 2
      || d3d8VolumeTextureUploadResult.browserDelta?.creates !== 1
      || d3d8VolumeTextureUploadResult.browserDelta?.updates !== 3
      || d3d8VolumeTextureUploadResult.browserDelta?.binds !== 1
      || d3d8VolumeTextureUploadResult.browserDelta?.unbinds !== 1
      || d3d8VolumeTextureUploadResult.browserDelta?.unsupportedUpdates !== 0
      || d3d8VolumeTextureUploadResult.browserProbe?.live !== 0
      || d3d8VolumeTextureUploadResult.browserProbe?.lastCreate?.type !== "volume"
      || d3d8VolumeTextureUploadResult.browserProbe?.lastCreate?.depth !== 4
      || d3d8VolumeTextureUploadResult.browserProbe?.lastSubrectUpdate?.x !== 1
      || d3d8VolumeTextureUploadResult.browserProbe?.lastSubrectUpdate?.y !== 1
      || d3d8VolumeTextureUploadResult.browserProbe?.lastSubrectUpdate?.z !== 1
      || d3d8VolumeTextureUploadResult.browserProbe?.lastSubrectUpdate?.depth !== 2
      || d3d8VolumeTextureUploadResult.browserProbe?.lastSubrectUpdate?.slicePitch !== 64
      || d3d8VolumeTextureUploadResult.browserProbe?.lastUpdate?.level !== 1
      || d3d8VolumeTextureUploadResult.browserProbe?.lastUpdate?.type !== "volume"
      || d3d8VolumeTextureUploadResult.browserProbe?.lastUpdate?.depth !== 2
      || d3d8VolumeTextureUploadResult.browserProbe?.lastUpdate?.slicePitch !== 16
      || d3d8VolumeTextureUploadResult.browserProbe?.lastUpdate?.byteSize !== 32
      || d3d8VolumeTextureUploadResult.browserProbe?.lastUpdate?.convertedByteSize !== 32
      || d3d8VolumeTextureUploadResult.browserProbe?.lastBind?.stage !== 2
      || d3d8VolumeTextureUploadResult.browserProbe?.lastBind?.id !== 0
      || d3d8VolumeTextureUploadResult.browserProbe?.lastBind?.nullBind !== true) {
    throw new Error(`D3D8 volume texture upload probe failed: ${JSON.stringify(d3d8VolumeTextureUploadResult)}`);
  }

  const d3d8TextureBindResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TextureBind"));
  if (!d3d8TextureBindResult.ok
      || d3d8TextureBindResult.probe?.source !== "browser_d3d8_texture_bind_probe"
      || d3d8TextureBindResult.probe?.calls?.setTexture !== 3
      || d3d8TextureBindResult.probe?.calls?.browserTextureBind !== 3
      || d3d8TextureBindResult.browserDelta?.binds !== 2
      || d3d8TextureBindResult.browserDelta?.unbinds !== 1
      || d3d8TextureBindResult.browserDelta?.releaseUnbinds !== 1
      || d3d8TextureBindResult.browserDelta?.missingBinds !== 0
      || d3d8TextureBindResult.browserDelta?.releases !== 1
      || d3d8TextureBindResult.browserProbe?.lastBind?.stage !== 0
      || d3d8TextureBindResult.browserProbe?.lastBind?.id !== 0
      || d3d8TextureBindResult.browserProbe?.lastBind?.nullBind !== true
      || d3d8TextureBindResult.browserProbe?.lastReleaseUnbind?.stages?.join(",") !== "1"
      || Object.keys(d3d8TextureBindResult.browserProbe?.boundTextures ?? {}).length !== 0
      || d3d8TextureBindResult.browserProbe?.live !== 0) {
    throw new Error(`D3D8 texture bind probe failed: ${JSON.stringify(d3d8TextureBindResult)}`);
  }

  const d3d8TexturedQuadResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TexturedQuad"));
  if (!d3d8TexturedQuadResult.ok
      || d3d8TexturedQuadResult.probe?.source !== "browser_d3d8_textured_quad_probe"
      || d3d8TexturedQuadResult.probe?.calls?.createTexture !== 1
      || d3d8TexturedQuadResult.probe?.calls?.browserTextureUpdate !== 1
      || d3d8TexturedQuadResult.probe?.calls?.browserTextureBind !== 1
      || d3d8TexturedQuadResult.probe?.calls?.setTextureStageState !== 11
      || d3d8TexturedQuadResult.probe?.calls?.drawIndexed !== 1
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 4
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.minFilter !== 2
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.magFilter !== 1
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.mipFilter !== 0
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.addressU !== 3
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[0]?.addressV !== 1
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || d3d8TexturedQuadResult.probe?.draw?.renderState?.textureStages?.[1]?.texCoordIndex !== 1
      || d3d8TexturedQuadResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || d3d8TexturedQuadResult.browserProbe?.usedPersistentBuffers !== true
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.colorOp !== 4
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.minFilter !== 2
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.magFilter !== 1
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.mipFilter !== 0
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.addressU !== 3
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[0]?.addressV !== 1
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[1]?.colorOp !== 1
      || d3d8TexturedQuadResult.browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex !== 1
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.d3d?.minFilter !== 2
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.d3d?.magFilter !== 1
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.d3d?.mipFilter !== 0
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.d3d?.addressU !== 3
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.d3d?.addressV !== 1
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.gl?.minFilter !== 9729
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.gl?.magFilter !== 9728
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.gl?.wrapS !== 33071
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.gl?.wrapT !== 10497
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampler?.usedMipmaps !== false
      || d3d8TexturedQuadResult.textureProbe?.lastSampler?.textureId !== d3d8TexturedQuadResult.probe?.texture?.id
      || d3d8TexturedQuadResult.browserProbe?.texture0?.combiner?.colorOp !== 4
      || d3d8TexturedQuadResult.browserProbe?.texture0?.combiner?.colorArg1 !== 2
      || d3d8TexturedQuadResult.browserProbe?.texture0?.combiner?.colorArg2 !== 0
      || d3d8TexturedQuadResult.browserProbe?.texture0?.combiner?.opName !== "modulate"
      || d3d8TexturedQuadResult.browserProbe?.texture0?.combiner?.arg1Name !== "texture"
      || d3d8TexturedQuadResult.browserProbe?.texture0?.combiner?.arg2Name !== "diffuse"
      || d3d8TexturedQuadResult.browserProbe?.texture0?.combiner?.supported !== true
      || d3d8TexturedQuadResult.browserProbe?.texture0?.id !== d3d8TexturedQuadResult.probe?.texture?.id
      || d3d8TexturedQuadResult.browserProbe?.texture0?.ready !== true
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampled !== true
      || d3d8TexturedQuadResult.browserProbe?.texture0?.texCoordIndex !== 0
      || d3d8TexturedQuadResult.browserProbe?.texture0?.texCoordModeName !== "passthru"
      || d3d8TexturedQuadResult.browserProbe?.texture0?.texCoordSet !== 0
      || d3d8TexturedQuadResult.browserProbe?.texture0?.texCoordOffset !== 28
      || d3d8TexturedQuadResult.browserProbe?.texture0?.textureTransformFlags !== 0
      || d3d8TexturedQuadResult.browserProbe?.texture0?.texCoordSupported !== true
      || d3d8TexturedQuadResult.browserProbe?.texture0?.format !== 21
      || d3d8TexturedQuadResult.browserProbe?.boundTextures?.["0"] !== d3d8TexturedQuadResult.probe?.texture?.id
      || !pixelLooksRed(d3d8TexturedQuadResult.browserProbe?.centerPixel)
      || d3d8TexturedQuadResult.textureDelta?.creates !== 1
      || d3d8TexturedQuadResult.textureDelta?.updates !== 1
      || d3d8TexturedQuadResult.textureDelta?.binds !== 1
      || d3d8TexturedQuadResult.textureDelta?.releaseUnbinds !== 1
      || d3d8TexturedQuadResult.textureDelta?.releases !== 1
      || d3d8TexturedQuadResult.textureProbe?.live !== 0
      || Object.keys(d3d8TexturedQuadResult.textureProbe?.boundTextures ?? {}).length !== 0) {
    throw new Error(`D3D8 textured quad probe failed: ${JSON.stringify(d3d8TexturedQuadResult)}`);
  }

  const d3d8TwoTextureQuadResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TwoTextureQuad"));
  if (!d3d8TwoTextureQuadResult.ok
      || d3d8TwoTextureQuadResult.probe?.source !== "browser_d3d8_two_texture_quad_probe"
      || d3d8TwoTextureQuadResult.probe?.calls?.createTexture !== 2
      || d3d8TwoTextureQuadResult.probe?.calls?.browserTextureUpdate !== 2
      || d3d8TwoTextureQuadResult.probe?.calls?.browserTextureBind !== 2
      || d3d8TwoTextureQuadResult.probe?.calls?.setTexture !== 2
      || d3d8TwoTextureQuadResult.probe?.calls?.setTextureStageState !== 18
      || d3d8TwoTextureQuadResult.probe?.calls?.drawIndexed !== 1
      || d3d8TwoTextureQuadResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || d3d8TwoTextureQuadResult.browserProbe?.usedPersistentBuffers !== true
      || d3d8TwoTextureQuadResult.browserProbe?.renderState?.textureStages?.[0]?.colorOp !== 2
      || d3d8TwoTextureQuadResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || d3d8TwoTextureQuadResult.browserProbe?.renderState?.textureStages?.[0]?.texCoordIndex !== 0
      || d3d8TwoTextureQuadResult.browserProbe?.renderState?.textureStages?.[1]?.colorOp !== 2
      || d3d8TwoTextureQuadResult.browserProbe?.renderState?.textureStages?.[1]?.colorArg1 !== 2
      || d3d8TwoTextureQuadResult.browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex !== 1
      || d3d8TwoTextureQuadResult.browserProbe?.texture0?.id !== d3d8TwoTextureQuadResult.probe?.textures?.stage0?.id
      || d3d8TwoTextureQuadResult.browserProbe?.texture0?.sampled !== true
      || d3d8TwoTextureQuadResult.browserProbe?.texture0?.texCoordSet !== 0
      || d3d8TwoTextureQuadResult.browserProbe?.texture0?.texCoordOffset !== 28
      || d3d8TwoTextureQuadResult.browserProbe?.texture0?.sampler?.gl?.minFilter !== 9728
      || d3d8TwoTextureQuadResult.browserProbe?.texture0?.sampler?.gl?.magFilter !== 9728
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.id !== d3d8TwoTextureQuadResult.probe?.textures?.stage1?.id
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.sampled !== true
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.texCoordSet !== 1
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.texCoordOffset !== 36
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.combiner?.colorOp !== 2
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.combiner?.colorArg1 !== 2
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.combiner?.supported !== true
      || d3d8TwoTextureQuadResult.browserProbe?.stage1Combiner?.textureAvailable !== true
      || d3d8TwoTextureQuadResult.browserProbe?.stage1Combiner?.supported !== true
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.sampler?.gl?.minFilter !== 9728
      || d3d8TwoTextureQuadResult.browserProbe?.texture1?.sampler?.gl?.magFilter !== 9728
      || d3d8TwoTextureQuadResult.browserProbe?.boundTextures?.["0"] !== d3d8TwoTextureQuadResult.probe?.textures?.stage0?.id
      || d3d8TwoTextureQuadResult.browserProbe?.boundTextures?.["1"] !== d3d8TwoTextureQuadResult.probe?.textures?.stage1?.id
      || !pixelLooksBlue(d3d8TwoTextureQuadResult.browserProbe?.centerPixel)
      || d3d8TwoTextureQuadResult.textureDelta?.creates !== 2
      || d3d8TwoTextureQuadResult.textureDelta?.updates !== 2
      || d3d8TwoTextureQuadResult.textureDelta?.binds !== 2
      || d3d8TwoTextureQuadResult.textureDelta?.releaseUnbinds !== 2
      || d3d8TwoTextureQuadResult.textureDelta?.releases !== 2
      || d3d8TwoTextureQuadResult.textureDelta?.samplerApplications !== 2
      || d3d8TwoTextureQuadResult.textureProbe?.live !== 0
      || Object.keys(d3d8TwoTextureQuadResult.textureProbe?.boundTextures ?? {}).length !== 0) {
    throw new Error(`D3D8 two-texture quad probe failed: ${JSON.stringify(d3d8TwoTextureQuadResult)}`);
  }

  const d3d8TwoTextureAlphaResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TwoTextureAlphaQuad"));
  const d3d8TwoTextureAlphaExpectedCenter =
    d3d8TwoTextureAlphaResult.probe?.textures?.stage1?.expectedCenter ?? [128, 0, 0, 255];
  if (!d3d8TwoTextureAlphaResult.ok
      || d3d8TwoTextureAlphaResult.probe?.source !== "browser_d3d8_two_texture_alpha_quad_probe"
      || d3d8TwoTextureAlphaResult.probe?.calls?.setRenderState !== 7
      || d3d8TwoTextureAlphaResult.probe?.calls?.createTexture !== 2
      || d3d8TwoTextureAlphaResult.probe?.calls?.browserTextureUpdate !== 2
      || d3d8TwoTextureAlphaResult.probe?.calls?.browserTextureBind !== 2
      || d3d8TwoTextureAlphaResult.probe?.calls?.setTexture !== 2
      || d3d8TwoTextureAlphaResult.probe?.calls?.setTextureStageState !== 21
      || d3d8TwoTextureAlphaResult.probe?.calls?.drawIndexed !== 1
      || d3d8TwoTextureAlphaResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || d3d8TwoTextureAlphaResult.probe?.draw?.renderState?.srcBlend !== 5
      || d3d8TwoTextureAlphaResult.probe?.draw?.renderState?.destBlend !== 6
      || d3d8TwoTextureAlphaResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || d3d8TwoTextureAlphaResult.browserProbe?.usedPersistentBuffers !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.alphaBlendEnable !== 1
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.srcBlend !== 5
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.destBlend !== 6
      || d3d8TwoTextureAlphaResult.browserProbe?.appliedRenderState?.blend?.enabled !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.appliedRenderState?.blend?.src !== 770
      || d3d8TwoTextureAlphaResult.browserProbe?.appliedRenderState?.blend?.dest !== 771
      || d3d8TwoTextureAlphaResult.browserProbe?.appliedRenderState?.blend?.equation !== 32774
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[0]?.colorOp !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[0]?.alphaOp !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[0]?.alphaArg1 !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[0]?.texCoordIndex !== 0
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[1]?.colorOp !== 4
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[1]?.colorArg1 !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[1]?.colorArg2 !== 1
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[1]?.alphaOp !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[1]?.alphaArg1 !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex !== 1
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.id !==
        d3d8TwoTextureAlphaResult.probe?.textures?.stage0?.id
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.sampled !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.texCoordSet !== 0
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.texCoordOffset !== 28
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.combiner?.alphaOp !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.combiner?.alphaArg1 !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.sampler?.gl?.minFilter !== 9728
      || d3d8TwoTextureAlphaResult.browserProbe?.texture0?.sampler?.gl?.magFilter !== 9728
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.id !==
        d3d8TwoTextureAlphaResult.probe?.textures?.stage1?.id
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.sampled !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.texCoordSet !== 1
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.texCoordOffset !== 36
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.combiner?.colorOp !== 4
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.combiner?.colorArg1 !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.combiner?.colorArg2 !== 1
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.combiner?.alphaOp !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.combiner?.alphaArg1 !== 2
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.combiner?.textureAvailable !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.combiner?.supported !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.stage1Combiner?.textureAvailable !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.stage1Combiner?.supported !== true
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.sampler?.gl?.minFilter !== 9728
      || d3d8TwoTextureAlphaResult.browserProbe?.texture1?.sampler?.gl?.magFilter !== 9728
      || d3d8TwoTextureAlphaResult.browserProbe?.boundTextures?.["0"] !==
        d3d8TwoTextureAlphaResult.probe?.textures?.stage0?.id
      || d3d8TwoTextureAlphaResult.browserProbe?.boundTextures?.["1"] !==
        d3d8TwoTextureAlphaResult.probe?.textures?.stage1?.id
      || !pixelsApproximatelyEqual(
        d3d8TwoTextureAlphaResult.browserProbe?.centerPixel,
        d3d8TwoTextureAlphaExpectedCenter,
        3,
      )
      || d3d8TwoTextureAlphaResult.centerPixelOk !== true
      || d3d8TwoTextureAlphaResult.textureDelta?.creates !== 2
      || d3d8TwoTextureAlphaResult.textureDelta?.updates !== 2
      || d3d8TwoTextureAlphaResult.textureDelta?.binds !== 2
      || d3d8TwoTextureAlphaResult.textureDelta?.releaseUnbinds !== 2
      || d3d8TwoTextureAlphaResult.textureDelta?.releases !== 2
      || d3d8TwoTextureAlphaResult.textureDelta?.samplerApplications !== 2
      || d3d8TwoTextureAlphaResult.textureProbe?.live !== 0
      || Object.keys(d3d8TwoTextureAlphaResult.textureProbe?.boundTextures ?? {}).length !== 0) {
    throw new Error(`D3D8 two-texture alpha quad probe failed: ${JSON.stringify(d3d8TwoTextureAlphaResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8TwoTextureAlphaCanvasScreenshot });

  const d3d8TextureMipChainResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TextureMipChainDraw"));
  const mipCases = d3d8TextureMipChainResult.cases ?? [];
  const mipCaseNames = mipCases.map((entry) => entry.probe?.caseName).join(",");
  const mipCenters = mipCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  const mipUsed = mipCases.map((entry) => entry.browserProbe?.texture0?.sampler?.usedMipmaps).join(",");
  const mipComplete = mipCases.map((entry) => entry.browserProbe?.texture0?.completeMipChain).join(",");
  const mipGlMin = mipCases.map((entry) => entry.browserProbe?.texture0?.sampler?.gl?.minFilter).join(",");
  const mipBaseLevels = mipCases.map((entry) => entry.browserProbe?.texture0?.sampler?.gl?.baseLevel).join(",");
  const mipMaxLevels = mipCases.map((entry) => entry.browserProbe?.texture0?.sampler?.gl?.maxLevel).join(",");
  const mipBiases = mipCases.map((entry) => entry.browserProbe?.texture0?.sampler?.gl?.lodBias).join(",");
  if (!d3d8TextureMipChainResult.ok
      || mipCases.length !== 4
      || mipCaseNames !== "IncompleteMipFallback,CompleteMipChain,MaxMipLevelBase,LodBiasSmallest"
      || mipCenters !== "255,0,0,255|0,0,255,255|0,255,0,255|0,0,255,255"
      || mipUsed !== "false,true,false,true"
      || mipComplete !== "false,true,true,true"
      || mipGlMin !== "9728,9984,9728,9984"
      || mipBaseLevels !== "0,0,1,0"
      || mipMaxLevels !== "0,2,2,2"
      || mipBiases !== "0,0,0,12"
      || mipCases.some((entry) => entry.probe?.source !== "browser_d3d8_texture_mip_chain_draw_probe")
      || mipCases.some((entry) => entry.probe?.calls?.createTexture !== 1)
      || mipCases.some((entry) => entry.probe?.calls?.browserTextureBind !== 1)
      || mipCases.some((entry) => entry.probe?.calls?.browserTextureRelease !== 1)
      || mipCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 16)
      || mipCases.some((entry) => entry.browserProbe?.texture0?.sampler?.d3d?.maxMipLevel !== entry.probe?.texture?.maxMipLevel)
      || mipCases.some((entry) => entry.browserProbe?.texture0?.sampler?.d3d?.mipMapLodBiasBits !== entry.probe?.texture?.mipMapLodBiasBits)
      || mipCases.some((entry) => Math.abs(
        (entry.browserProbe?.texture0?.sampler?.d3d?.mipMapLodBias ?? 0) -
        (entry.probe?.texture?.mipMapLodBias ?? 0)) > 0.001)
      || mipCases.some((entry) => entry.browserProbe?.texture0?.sampler?.supported !== true)
      || mipCases.some((entry) => entry.browserProbe?.texture0?.sampler?.gl?.lodBiasSource !== "shader")
      || mipCases.some((entry) => entry.browserProbe?.texture0?.levels !== 3)
      || mipCases.some((entry) => entry.browserProbe?.texture0?.combiner?.opName !== "selectArg1")
      || mipCases.some((entry) => entry.centerPixelOk !== true)
      || mipCases[0]?.probe?.texture?.uploadedLevels !== 1
      || mipCases[0]?.browserProbe?.texture0?.initializedLevels?.join(",") !== "0"
      || mipCases[0]?.browserProbe?.texture0?.sampler?.requestedMipmaps !== true
      || mipCases[0]?.browserProbe?.texture0?.sampler?.fallbackReason !== "incomplete mip chain"
      || mipCases[0]?.textureDelta?.updates !== 1
      || mipCases[1]?.probe?.texture?.uploadedLevels !== 3
      || mipCases[1]?.browserProbe?.texture0?.initializedLevels?.join(",") !== "0,1,2"
      || mipCases[1]?.browserProbe?.texture0?.sampler?.requestedMipmaps !== true
      || mipCases[1]?.browserProbe?.texture0?.sampler?.fallbackReason !== null
      || mipCases[1]?.textureDelta?.updates !== 3
      || mipCases[2]?.probe?.texture?.uploadedLevels !== 3
      || mipCases[2]?.browserProbe?.texture0?.initializedLevels?.join(",") !== "0,1,2"
      || mipCases[2]?.browserProbe?.texture0?.sampler?.d3d?.mipFilter !== 0
      || mipCases[2]?.browserProbe?.texture0?.sampler?.requestedMipmaps !== false
      || mipCases[2]?.browserProbe?.texture0?.sampler?.fallbackReason !== null
      || mipCases[2]?.textureDelta?.updates !== 3
      || mipCases[3]?.probe?.texture?.uploadedLevels !== 3
      || mipCases[3]?.browserProbe?.texture0?.initializedLevels?.join(",") !== "0,1,2"
      || mipCases[3]?.browserProbe?.texture0?.sampler?.d3d?.mipFilter !== 1
      || mipCases[3]?.browserProbe?.texture0?.sampler?.requestedMipmaps !== true
      || mipCases[3]?.browserProbe?.texture0?.sampler?.fallbackReason !== null
      || mipCases[3]?.textureDelta?.updates !== 3
      || mipCases.some((entry) => entry.textureDelta?.creates !== 1)
      || mipCases.some((entry) => entry.textureDelta?.binds !== 1)
      || mipCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)
      || mipCases.some((entry) => entry.textureDelta?.releases !== 1)
      || mipCases.some((entry) => entry.textureDelta?.samplerApplications !== 1)
      || mipCases.some((entry) => entry.textureProbe?.live !== 0)) {
    throw new Error(`D3D8 texture mip-chain probe failed: ${JSON.stringify(d3d8TextureMipChainResult)}`);
  }

  const d3d8TextureCombinerResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TextureCombiner"));
  const combinerCases = d3d8TextureCombinerResult.cases ?? [];
  const combinerCaseNames = combinerCases.map((entry) => entry.probe?.caseName).join(",");
  const combinerCenters = combinerCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  if (!d3d8TextureCombinerResult.ok
      || combinerCases.length !== 36
      || combinerCaseNames !== "selectTexture,selectDiffuse,modulate,add,selectAlphaTexture,selectAlphaDiffuse,modulateAlpha,addAlpha,complementTexture,alphaReplicateTexture,alphaReplicateComplementTexture,complementAlphaTexture,alphaReplicateComplementDiffuse,selectTextureFactor,modulateTextureFactor,selectAlphaTextureFactor,alphaReplicateTextureFactor,multiplyAddColorArg0,multiplyAddAlphaArg0,stage1DotProduct3Grayscale,resultArgTempPreservesCurrent,stage1SelectTemp,modulate2X,modulate4X,addSigned,addSigned2X,subtract,addSmooth,blendTextureAlpha,blendFactorAlpha,blendCurrentAlpha,lerpColorArg0,blendDiffuseAlpha,stage1MultiplyAddColorArg0,stage1LerpColorArg0,stage1SelectAlphaTextureFactor"
      || combinerCenters !== "255,0,0,255|0,255,0,255|128,0,0,255|255,255,0,255|128,0,0,255|64,0,0,255|96,0,0,255|64,0,0,255|0,255,255,255|64,64,64,255|191,191,191,255|191,0,0,255|191,191,191,255|32,64,128,255|128,0,0,255|64,0,0,255|128,128,128,255|255,128,128,255|160,0,0,255|117,117,117,255|0,255,0,255|255,0,0,255|64,0,0,255|129,0,0,255|128,128,0,255|255,255,0,255|191,96,0,255|192,128,128,255|64,191,0,255|64,191,0,255|128,127,0,255|64,191,0,255|64,191,0,255|128,64,64,255|64,191,0,255|64,0,0,255"
      || combinerCases.some((entry) => entry.probe?.source !== "browser_d3d8_texture_combiner_probe")
      || combinerCases.some((entry) => entry.probe?.calls?.setTextureStageState !== entry.probe?.expectedStageStateCalls)
      || combinerCases.some((entry) => entry.browserProbe?.texture0?.combiner?.colorArg0 !== entry.probe?.combiner?.colorArg0)
      || combinerCases.some((entry) => entry.browserProbe?.texture0?.combiner?.resultArg !== entry.probe?.combiner?.resultArg)
      || combinerCases.some((entry) => entry.browserProbe?.texture0?.combiner?.alphaArg0 !== entry.probe?.combiner?.alphaArg0)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorOp !== entry.probe?.stage1Combiner?.colorOp)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorArg0 !== entry.probe?.stage1Combiner?.colorArg0)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorArg1 !== entry.probe?.stage1Combiner?.colorArg1)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorArg2 !== entry.probe?.stage1Combiner?.colorArg2)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.alphaOp !== entry.probe?.stage1Combiner?.alphaOp)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.alphaArg0 !== entry.probe?.stage1Combiner?.alphaArg0)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.alphaArg1 !== entry.probe?.stage1Combiner?.alphaArg1)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.alphaArg2 !== entry.probe?.stage1Combiner?.alphaArg2)
      || combinerCases.some((entry) => entry.browserProbe?.texture0?.combiner?.supported !== true)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.supported !== true)
      || combinerCases.some((entry) => entry.centerPixelOk !== true)
      || combinerCases.some((entry) => entry.textureDelta?.creates !== 1)
      || combinerCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)) {
    throw new Error(`D3D8 texture combiner probe failed: ${JSON.stringify(d3d8TextureCombinerResult)}`);
  }

  const d3d8TexCoordIndexResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TexCoordIndex"));
  const texCoordCases = d3d8TexCoordIndexResult.cases ?? [];
  const texCoordCaseNames = texCoordCases.map((entry) => entry.probe?.caseName).join(",");
  const texCoordCenters = texCoordCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  const texCoordSets = texCoordCases.map((entry) => entry.browserProbe?.texture0?.texCoordSet).join(",");
  const texCoordOffsets = texCoordCases.map((entry) => entry.browserProbe?.texture0?.texCoordOffset).join(",");
  const texCoordModes = texCoordCases.map((entry) => entry.browserProbe?.texture0?.texCoordModeName).join(",");
  const texCoordGenerated = texCoordCases.map((entry) => entry.browserProbe?.texture0?.texCoordGenerated).join(",");
  const texCoordUsesVertex = texCoordCases.map((entry) => entry.browserProbe?.texture0?.texCoordUsesVertex).join(",");
  const texCoordTransformFlags = texCoordCases.map((entry) =>
    entry.browserProbe?.texture0?.textureTransformFlags).join(",");
  const texCoordTransformApplied = texCoordCases.map((entry) =>
    entry.browserProbe?.texture0?.textureTransformApplied).join(",");
  if (!d3d8TexCoordIndexResult.ok
      || texCoordCases.length !== 6
      || texCoordCaseNames !==
        "uv0,uv1,cameraSpacePosition,cameraSpaceNormal,cameraSpaceReflectionVector,projectedCameraSpacePosition"
      || texCoordCenters !==
        "255,0,0,255|0,0,255,255|0,0,255,255|0,0,255,255|0,0,255,255|0,0,255,255"
      || texCoordSets !== "0,1,0,0,0,0"
      || texCoordOffsets !== "28,36,,,,"
      || texCoordModes !==
        "passthru,passthru,cameraSpacePosition,cameraSpaceNormal,cameraSpaceReflectionVector,cameraSpacePosition"
      || texCoordGenerated !== "false,false,true,true,true,true"
      || texCoordUsesVertex !== "true,true,false,false,false,false"
      || texCoordTransformFlags !== "0,0,2,2,2,259"
      || texCoordTransformApplied !== "false,false,true,true,true,true"
      || texCoordCases.some((entry) => entry.probe?.source !== "browser_d3d8_texcoord_index_probe")
      || texCoordCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 12)
      || texCoordCases.some((entry) =>
        entry.browserProbe?.texture0?.texCoordModeName !== entry.probe?.texcoord?.modeName)
      || texCoordCases.some((entry) =>
        entry.browserProbe?.texture0?.texCoordGenerated !== Boolean(entry.probe?.texcoord?.generated))
      || texCoordCases.some((entry) =>
        entry.browserProbe?.texture0?.textureTransformFlags !== entry.probe?.texcoord?.textureTransformFlags)
      || texCoordCases.some((entry) =>
        entry.browserProbe?.texture0?.textureTransformModeName !== entry.probe?.transform?.modeName)
      || texCoordCases.some((entry) =>
        entry.browserProbe?.texture0?.textureTransformComponentCount !== entry.probe?.transform?.componentCount)
      || texCoordCases.some((entry) =>
        entry.browserProbe?.texture0?.textureTransformProjected !== Boolean(entry.probe?.transform?.projected))
      || texCoordCases.some((entry) => entry.browserProbe?.texture0?.texCoordSupported !== true)
      || texCoordCases.some((entry) => entry.centerPixelOk !== true)
      || texCoordCases.some((entry) => entry.texCoordOffsetOk !== true)
      || texCoordCases.some((entry) => entry.textureDelta?.creates !== 1)
      || texCoordCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)) {
    throw new Error(`D3D8 texcoord index probe failed: ${JSON.stringify(d3d8TexCoordIndexResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8GeneratedTexCoordCanvasScreenshot });

  const d3d8FvfTexCoordSizesResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8FvfTexCoordSizes"));
  const fvfTexCoordCases = d3d8FvfTexCoordSizesResult.cases ?? [];
  const fvfTexCoordCaseNames = fvfTexCoordCases.map((entry) => entry.probe?.caseName).join(",");
  const fvfTexCoordCenters = fvfTexCoordCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  const fvfTexCoordSets = fvfTexCoordCases.map((entry) => entry.browserProbe?.texture0?.texCoordSet).join(",");
  const fvfTexCoordOffsets = fvfTexCoordCases.map((entry) => entry.browserProbe?.texture0?.texCoordOffset).join(",");
  const fvfTexCoordComponents = fvfTexCoordCases
    .map((entry) => entry.browserProbe?.texture0?.texCoordComponents)
    .join(",");
  const fvfTexCoordStrides = fvfTexCoordCases.map((entry) => entry.browserProbe?.vertexLayout?.computedStride).join(",");
  if (!d3d8FvfTexCoordSizesResult.ok
      || fvfTexCoordCases.length !== 2
      || fvfTexCoordCaseNames !== "uv1After3Duv0,uv2After1D4D"
      || fvfTexCoordCenters !== "0,0,255,255|0,0,255,255"
      || fvfTexCoordSets !== "1,2"
      || fvfTexCoordOffsets !== "28,36"
      || fvfTexCoordComponents !== "2,2"
      || fvfTexCoordStrides !== "36,44"
      || fvfTexCoordCases.some((entry) => entry.probe?.source !== "browser_d3d8_fvf_texcoord_sizes_probe")
      || fvfTexCoordCases.some((entry) => entry.probe?.calls?.setVertexShader !== 1)
      || fvfTexCoordCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 12)
      || fvfTexCoordCases.some((entry) => entry.browserProbe?.vertexLayout?.source !== "fvf")
      || fvfTexCoordCases.some((entry) =>
        entry.browserProbe?.vertexLayout?.texCoords?.length !== entry.probe?.fvf?.expectedTexCoordCount)
      || fvfTexCoordCases.some((entry) =>
        entry.browserProbe?.vertexLayout?.texCoords?.[entry.probe?.texcoord?.set]?.offset !==
          entry.probe?.texcoord?.expectedOffset)
      || fvfTexCoordCases.some((entry) =>
        entry.browserProbe?.vertexLayout?.texCoords?.[entry.probe?.texcoord?.set]?.components !==
          entry.probe?.texcoord?.expectedComponents)
      || fvfTexCoordCases.some((entry) => entry.browserProbe?.texture0?.texCoordModeName !== "passthru")
      || fvfTexCoordCases.some((entry) => entry.browserProbe?.texture0?.textureTransformFlags !== 0)
      || fvfTexCoordCases.some((entry) => entry.browserProbe?.texture0?.textureTransformApplied !== false)
      || fvfTexCoordCases.some((entry) => entry.browserProbe?.texture0?.texCoordSupported !== true)
      || fvfTexCoordCases.some((entry) => entry.centerPixelOk !== true)
      || fvfTexCoordCases.some((entry) => entry.textureDelta?.creates !== 1)
      || fvfTexCoordCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)) {
    throw new Error(`D3D8 FVF texcoord-size probe failed: ${JSON.stringify(d3d8FvfTexCoordSizesResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8FvfTexCoordSizesCanvasScreenshot });

  const d3d8TextureTransformResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TextureTransform"));
  const textureTransformCases = d3d8TextureTransformResult.cases ?? [];
  const textureTransformCaseNames = textureTransformCases.map((entry) => entry.probe?.caseName).join(",");
  const textureTransformCenters = textureTransformCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  const textureTransformFlags = textureTransformCases.map((entry) => entry.browserProbe?.texture0?.textureTransformFlags).join(",");
  const textureTransformModes = textureTransformCases.map((entry) => entry.browserProbe?.texture0?.textureTransformModeName).join(",");
  const textureTransformComponentCounts = textureTransformCases.map((entry) =>
    entry.browserProbe?.texture0?.textureTransformComponentCount).join(",");
  const textureTransformProjected = textureTransformCases.map((entry) =>
    entry.browserProbe?.texture0?.textureTransformProjected).join(",");
  const textureTransformApplied = textureTransformCases.map((entry) => entry.browserProbe?.texture0?.textureTransformApplied).join(",");
  if (!d3d8TextureTransformResult.ok
      || textureTransformCases.length !== 5
      || textureTransformCaseNames !==
        "disable,count2TranslateU,count3TranslateU,count4TranslateU,projectedCount3TranslateU"
      || textureTransformCenters !==
        "255,0,0,255|0,0,255,255|0,0,255,255|0,0,255,255|0,0,255,255"
      || textureTransformFlags !== "0,2,3,4,259"
      || textureTransformModes !== "disable,count2,count3,count4,count3Projected"
      || textureTransformComponentCounts !== "0,2,3,4,3"
      || textureTransformProjected !== "false,false,false,false,true"
      || textureTransformApplied !== "false,true,true,true,true"
      || textureTransformCases.some((entry) => entry.probe?.source !== "browser_d3d8_texture_transform_probe")
      || textureTransformCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 12)
      || textureTransformCases.some((entry) => entry.browserProbe?.texture0?.texCoordModeName !== "passthru")
      || textureTransformCases.some((entry) => entry.browserProbe?.texture0?.textureTransformSupported !== true)
      || textureTransformCases.some((entry) =>
        entry.browserProbe?.texture0?.textureTransformComponentCount !== entry.probe?.transform?.componentCount)
      || textureTransformCases.some((entry) =>
        entry.browserProbe?.texture0?.textureTransformProjected !== Boolean(entry.probe?.transform?.projected))
      || textureTransformCases.some((entry) => entry.browserProbe?.texture0?.texCoordSupported !== true)
      || textureTransformCases.some((entry) => entry.centerPixelOk !== true)
      || textureTransformCases.some((entry) => entry.textureDelta?.creates !== 1)
      || textureTransformCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)) {
    throw new Error(`D3D8 texture transform probe failed: ${JSON.stringify(d3d8TextureTransformResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8TextureTransformCanvasScreenshot });

  const d3d8Stage1TextureTransformResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8Stage1TextureTransform"));
  if (!d3d8Stage1TextureTransformResult.ok
      || d3d8Stage1TextureTransformResult.probe?.source !==
        "browser_d3d8_stage1_texture_transform_probe"
      || d3d8Stage1TextureTransformResult.probe?.calls?.createTexture !== 2
      || d3d8Stage1TextureTransformResult.probe?.calls?.browserTextureUpdate !== 2
      || d3d8Stage1TextureTransformResult.probe?.calls?.browserTextureBind !== 2
      || d3d8Stage1TextureTransformResult.probe?.calls?.setTexture !== 2
      || d3d8Stage1TextureTransformResult.probe?.calls?.setTransform !== 1
      || d3d8Stage1TextureTransformResult.probe?.calls?.setTextureStageState !== 22
      || d3d8Stage1TextureTransformResult.probe?.calls?.drawIndexed !== 1
      || d3d8Stage1TextureTransformResult.probe?.transform?.mask !== 2
      || d3d8Stage1TextureTransformResult.probe?.transform?.expectedMask !== 2
      || Math.abs(
        (d3d8Stage1TextureTransformResult.probe?.transform?.translationU ?? 0) -
        (d3d8Stage1TextureTransformResult.probe?.transform?.expectedTranslationU ?? 0)) > 0.0001
      || d3d8Stage1TextureTransformResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || d3d8Stage1TextureTransformResult.browserProbe?.usedPersistentBuffers !== true
      || d3d8Stage1TextureTransformResult.browserProbe?.texture0?.sampled !== true
      || d3d8Stage1TextureTransformResult.browserProbe?.texture0?.id !==
        d3d8Stage1TextureTransformResult.probe?.textures?.stage0?.id
      || d3d8Stage1TextureTransformResult.browserProbe?.texture0?.texCoordSet !== 0
      || d3d8Stage1TextureTransformResult.browserProbe?.texture0?.texCoordOffset !== 28
      || d3d8Stage1TextureTransformResult.browserProbe?.texture0?.textureTransformFlags !== 0
      || d3d8Stage1TextureTransformResult.browserProbe?.texture0?.textureTransformModeName !== "disable"
      || d3d8Stage1TextureTransformResult.browserProbe?.texture0?.textureTransformApplied !== false
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.sampled !== true
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.id !==
        d3d8Stage1TextureTransformResult.probe?.textures?.stage1?.id
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.texCoordSet !== 1
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.texCoordOffset !== 36
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.textureTransformFlags !== 2
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.textureTransformModeName !== "count2"
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.textureTransformApplied !== true
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.combiner?.colorOp !== 2
      || d3d8Stage1TextureTransformResult.browserProbe?.texture1?.combiner?.colorArg1 !== 2
      || d3d8Stage1TextureTransformResult.browserProbe?.stage1Combiner?.textureAvailable !== true
      || d3d8Stage1TextureTransformResult.browserProbe?.stage1Combiner?.supported !== true
      || d3d8Stage1TextureTransformResult.centerPixelOk !== true
      || d3d8Stage1TextureTransformResult.texture1TranslationOk !== true
      || d3d8Stage1TextureTransformResult.browserProbe?.centerPixel?.join(",") !== "0,0,255,255"
      || d3d8Stage1TextureTransformResult.textureDelta?.creates !== 2
      || d3d8Stage1TextureTransformResult.textureDelta?.updates !== 2
      || d3d8Stage1TextureTransformResult.textureDelta?.binds !== 2
      || d3d8Stage1TextureTransformResult.textureDelta?.releaseUnbinds !== 2
      || d3d8Stage1TextureTransformResult.textureDelta?.releases !== 2
      || d3d8Stage1TextureTransformResult.textureDelta?.samplerApplications !== 2
      || d3d8Stage1TextureTransformResult.textureProbe?.live !== 0) {
    throw new Error(
      `D3D8 stage-1 texture transform probe failed: ${JSON.stringify(d3d8Stage1TextureTransformResult)}`,
    );
  }
  await page.locator("#viewport").screenshot({ path: d3d8Stage1TextureTransformCanvasScreenshot });

  const d3d8StencilStateResult = await page.evaluate(() => window.CnCPort.rpc("d3d8StencilState"));
  if (!d3d8StencilStateResult.ok
      || d3d8StencilStateResult.probe?.source !== "browser_d3d8_stencil_state_probe"
      || d3d8StencilStateResult.probe?.calls?.drawIndexed !== 2
      || d3d8StencilStateResult.browserProbe?.centerPixel?.join(",") !== "0,255,0,255"
      || d3d8StencilStateResult.cornerPixel?.join(",") !== "0,0,0,255"
      || d3d8StencilStateResult.browserProbe?.renderState?.stencilEnable !== 1
      || d3d8StencilStateResult.browserProbe?.renderState?.stencilFunc !== 3
      || d3d8StencilStateResult.browserProbe?.renderState?.stencilRef !== 7
      || d3d8StencilStateResult.browserProbe?.renderState?.stencilMask !== 255
      || d3d8StencilStateResult.browserProbe?.renderState?.stencilWriteMask !== 0
      || d3d8StencilStateResult.browserProbe?.renderState?.stencilPass !== 1
      || d3d8StencilStateResult.browserProbe?.appliedRenderState?.stencil?.available !== true
      || d3d8StencilStateResult.browserProbe?.appliedRenderState?.stencil?.enabled !== true
      || d3d8StencilStateResult.browserProbe?.appliedRenderState?.stencil?.ref !== 7
      || d3d8StencilStateResult.centerPixelOk !== true
      || d3d8StencilStateResult.cornerPixelOk !== true) {
    throw new Error(`D3D8 stencil-state probe failed: ${JSON.stringify(d3d8StencilStateResult)}`);
  }

  const d3d8FogStateResult = await page.evaluate(() => window.CnCPort.rpc("d3d8FogState"));
  if (!d3d8FogStateResult.ok
      || d3d8FogStateResult.probe?.source !== "browser_d3d8_fog_state_probe"
      || d3d8FogStateResult.probe?.calls?.drawIndexed !== 1
      || d3d8FogStateResult.browserProbe?.renderState?.fogEnable !== 1
      || d3d8FogStateResult.browserProbe?.renderState?.fogColor !== 0xff0000ff
      || d3d8FogStateResult.browserProbe?.renderState?.fogStart !== 0
      || d3d8FogStateResult.browserProbe?.renderState?.fogEnd !== 0x3f800000
      || d3d8FogStateResult.browserProbe?.renderState?.fogVertexMode !== 3
      || d3d8FogStateResult.browserProbe?.renderState?.rangeFogEnable !== 0
      || d3d8FogStateResult.browserProbe?.appliedRenderState?.fog?.enabled !== true
      || d3d8FogStateResult.browserProbe?.appliedRenderState?.fog?.rangeEnabled !== false
      || d3d8FogStateResult.centerPixelOk !== true) {
    throw new Error(`D3D8 fog-state probe failed: ${JSON.stringify(d3d8FogStateResult)}`);
  }

  const d3d8FillModeResult = await page.evaluate(() => window.CnCPort.rpc("d3d8FillMode"));
  if (!d3d8FillModeResult.ok
      || d3d8FillModeResult.probe?.source !== "browser_d3d8_fill_mode_probe"
      || d3d8FillModeResult.probe?.calls?.drawIndexed !== 1
      || d3d8FillModeResult.browserProbe?.renderState?.fillMode !== 2
      || d3d8FillModeResult.browserProbe?.appliedRenderState?.fillMode?.name !== "wireframe"
      || d3d8FillModeResult.browserProbe?.fillMode?.modeName !== "wireframe"
      || d3d8FillModeResult.browserProbe?.fillMode?.wireframe !== true
      || d3d8FillModeResult.browserProbe?.fillMode?.temporaryIndexBuffer !== true
      || d3d8FillModeResult.browserProbe?.fillMode?.glPrimitiveName !== "lines"
      || d3d8FillModeResult.browserProbe?.fillMode?.generatedIndexCount !== 12
      || d3d8FillModeResult.browserProbe?.fillMode?.sourceTriangleCount !== 2
      || d3d8FillModeResult.browserProbe?.centerPixel?.join(",") !== "0,255,0,255"
      || d3d8FillModeResult.centerPixelOk !== true) {
    throw new Error(`D3D8 fill-mode probe failed: ${JSON.stringify(d3d8FillModeResult)}`);
  }

  const d3d8ZBiasResult = await page.evaluate(() => window.CnCPort.rpc("d3d8ZBias"));
  if (!d3d8ZBiasResult.ok
      || d3d8ZBiasResult.probe?.source !== "browser_d3d8_z_bias_probe"
      || d3d8ZBiasResult.probe?.calls?.drawIndexed !== 2
      || d3d8ZBiasResult.browserProbe?.renderState?.zBias !== 8
      || d3d8ZBiasResult.browserProbe?.renderState?.zFunc !== 2
      || d3d8ZBiasResult.browserProbe?.renderState?.zEnable !== 1
      || d3d8ZBiasResult.browserProbe?.appliedRenderState?.depth?.enabled !== true
      || d3d8ZBiasResult.browserProbe?.appliedRenderState?.depth?.func !== 513
      || d3d8ZBiasResult.browserProbe?.appliedRenderState?.depth?.bias?.raw !== 8
      || d3d8ZBiasResult.browserProbe?.appliedRenderState?.depth?.bias?.clamped !== 8
      || !(d3d8ZBiasResult.browserProbe?.appliedRenderState?.depth?.bias?.ndc > 0)
      || d3d8ZBiasResult.browserProbe?.centerPixel?.join(",") !== "0,255,0,255"
      || d3d8ZBiasResult.centerPixelOk !== true) {
    throw new Error(`D3D8 z-bias probe failed: ${JSON.stringify(d3d8ZBiasResult)}`);
  }

  const d3d8ShadeModeResult = await page.evaluate(() => window.CnCPort.rpc("d3d8ShadeMode"));
  if (!d3d8ShadeModeResult.ok
      || d3d8ShadeModeResult.probe?.source !== "browser_d3d8_shade_mode_probe"
      || d3d8ShadeModeResult.probe?.calls?.drawIndexed !== 1
      || d3d8ShadeModeResult.browserProbe?.renderState?.shadeMode !== 1
      || d3d8ShadeModeResult.browserProbe?.appliedRenderState?.shadeMode?.name !== "flat"
      || d3d8ShadeModeResult.browserProbe?.shadeMode?.modeName !== "flat"
      || d3d8ShadeModeResult.browserProbe?.shadeMode?.usesFlatShader !== true
      || d3d8ShadeModeResult.browserProbe?.shadeMode?.glPrimitiveName !== "triangles"
      || d3d8ShadeModeResult.browserProbe?.shadeMode?.drawIndexCount !== 3
      || d3d8ShadeModeResult.firstVertexFlatPath !== true
      || d3d8ShadeModeResult.browserProbe?.centerPixel?.join(",") !== "255,0,0,255"
      || d3d8ShadeModeResult.centerPixelOk !== true) {
    throw new Error(`D3D8 shade-mode probe failed: ${JSON.stringify(d3d8ShadeModeResult)}`);
  }

  const d3d8ClipPlaneResult = await page.evaluate(() => window.CnCPort.rpc("d3d8ClipPlane"));
  const expectedClipPlane = d3d8ClipPlaneResult.probe?.clipPlane?.plane ?? [1, 0, 0, 0];
  if (!d3d8ClipPlaneResult.ok
      || d3d8ClipPlaneResult.probe?.source !== "browser_d3d8_clip_plane_probe"
      || d3d8ClipPlaneResult.probe?.calls?.setClipPlane !== 1
      || d3d8ClipPlaneResult.probe?.calls?.drawIndexed !== 1
      || d3d8ClipPlaneResult.probe?.draw?.renderState?.clipping !== 1
      || d3d8ClipPlaneResult.probe?.draw?.renderState?.clipPlaneEnable !== 1
      || !floatVectorApproximatelyEqual(d3d8ClipPlaneResult.probe?.draw?.capturedPlane, expectedClipPlane)
      || d3d8ClipPlaneResult.browserProbe?.renderState?.clipping !== 1
      || d3d8ClipPlaneResult.browserProbe?.renderState?.clipPlaneEnable !== 1
      || !floatVectorApproximatelyEqual(d3d8ClipPlaneResult.browserProbe?.clipPlanes?.[0], expectedClipPlane)
      || d3d8ClipPlaneResult.browserProbe?.appliedRenderState?.clipPlanes?.enabled !== true
      || d3d8ClipPlaneResult.browserProbe?.appliedRenderState?.clipPlanes?.mask !== 1
      || d3d8ClipPlaneResult.browserProbe?.appliedRenderState?.clipPlanes?.enabledIndices?.join(",") !== "0"
      || !floatVectorApproximatelyEqual(
        d3d8ClipPlaneResult.browserProbe?.appliedRenderState?.clipPlanes?.planes?.[0],
        expectedClipPlane)
      || d3d8ClipPlaneResult.leftPixelOk !== true
      || d3d8ClipPlaneResult.rightPixelOk !== true
      || !pixelLooksBlack(d3d8ClipPlaneResult.clipPixels?.left)
      || !pixelLooksGreen(d3d8ClipPlaneResult.clipPixels?.right)) {
    throw new Error(`D3D8 clip-plane probe failed: ${JSON.stringify(d3d8ClipPlaneResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8ClipPlaneCanvasScreenshot });

  const d3d8LightingAmbientResult = await page.evaluate(() => window.CnCPort.rpc("d3d8LightingAmbient"));
  if (!d3d8LightingAmbientResult.ok
      || d3d8LightingAmbientResult.probe?.source !== "browser_d3d8_lighting_ambient_probe"
      || d3d8LightingAmbientResult.probe?.calls?.drawIndexed !== 1
      || d3d8LightingAmbientResult.browserProbe?.renderState?.lighting !== 0
      || d3d8LightingAmbientResult.browserProbe?.renderState?.ambient !== 0xff405060
      || d3d8LightingAmbientResult.browserProbe?.appliedRenderState?.lighting?.enabled !== false
      || d3d8LightingAmbientResult.browserProbe?.appliedRenderState?.ambient?.color !== 0xff405060
      || d3d8LightingAmbientResult.ambientRgbaOk !== true
      || d3d8LightingAmbientResult.browserProbe?.centerPixel?.join(",") !== "0,255,0,255"
      || d3d8LightingAmbientResult.centerPixelOk !== true) {
    throw new Error(`D3D8 lighting/ambient probe failed: ${JSON.stringify(d3d8LightingAmbientResult)}`);
  }

  const d3d8DirectionalLightResult = await page.evaluate(() => window.CnCPort.rpc("d3d8DirectionalLight"));
  if (!d3d8DirectionalLightResult.ok
      || d3d8DirectionalLightResult.probe?.source !== "browser_d3d8_directional_light_probe"
      || d3d8DirectionalLightResult.probe?.calls?.setLight !== 1
      || d3d8DirectionalLightResult.probe?.calls?.lightEnable !== 1
      || d3d8DirectionalLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8DirectionalLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8DirectionalLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8DirectionalLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8DirectionalLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8DirectionalLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8DirectionalLightResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8DirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8DirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8DirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== true
      || d3d8DirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 1
      || d3d8DirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLights?.[0]?.index !== 0
      || d3d8DirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.firstDirectionalLight?.index !== 0
      || d3d8DirectionalLightResult.lightDiffuseOk !== true
      || d3d8DirectionalLightResult.lightDirectionOk !== true
      || d3d8DirectionalLightResult.materialOk !== true
      || d3d8DirectionalLightResult.leftPixelOk !== true
      || d3d8DirectionalLightResult.rightPixelOk !== true
      || !pixelLooksBlack(d3d8DirectionalLightResult.lightPixels?.left)
      || !pixelLooksGreen(d3d8DirectionalLightResult.lightPixels?.right)) {
    throw new Error(`D3D8 directional-light probe failed: ${JSON.stringify(d3d8DirectionalLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8DirectionalLightCanvasScreenshot });

  const d3d8MultiDirectionalLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8MultiDirectionalLight"));
  const expectedMultiLeft = d3d8MultiDirectionalLightResult.probe?.expectedLeft ?? [0, 0, 0, 255];
  const expectedMultiRight = d3d8MultiDirectionalLightResult.probe?.expectedRight ?? [255, 0, 255, 255];
  if (!d3d8MultiDirectionalLightResult.ok
      || d3d8MultiDirectionalLightResult.probe?.source !== "browser_d3d8_multi_directional_light_probe"
      || d3d8MultiDirectionalLightResult.probe?.calls?.setLight !== 2
      || d3d8MultiDirectionalLightResult.probe?.calls?.lightEnable !== 2
      || d3d8MultiDirectionalLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8MultiDirectionalLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8MultiDirectionalLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8MultiDirectionalLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8MultiDirectionalLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8MultiDirectionalLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8MultiDirectionalLightResult.browserProbe?.lights?.[3]?.enabled !== true
      || d3d8MultiDirectionalLightResult.browserProbe?.lights?.[1]?.enabled !== false
      || d3d8MultiDirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8MultiDirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8MultiDirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== true
      || d3d8MultiDirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 2
      || d3d8MultiDirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLights?.[0]?.index !== 0
      || d3d8MultiDirectionalLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLights?.[1]?.index !== 3
      || d3d8MultiDirectionalLightResult.redLightOk !== true
      || d3d8MultiDirectionalLightResult.blueLightOk !== true
      || d3d8MultiDirectionalLightResult.selectedLightsOk !== true
      || d3d8MultiDirectionalLightResult.materialOk !== true
      || d3d8MultiDirectionalLightResult.leftPixelOk !== true
      || d3d8MultiDirectionalLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(d3d8MultiDirectionalLightResult.lightPixels?.left, expectedMultiLeft, 2)
      || !pixelsApproximatelyEqual(d3d8MultiDirectionalLightResult.lightPixels?.right, expectedMultiRight, 2)
      || !pixelLooksBlack(d3d8MultiDirectionalLightResult.lightPixels?.left)) {
    throw new Error(`D3D8 multi-directional-light probe failed: ${JSON.stringify(d3d8MultiDirectionalLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8MultiDirectionalLightCanvasScreenshot });

  const d3d8SpecularLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8SpecularLight"));
  const expectedSpecularLeft = d3d8SpecularLightResult.probe?.expectedLeft ?? [0, 0, 0, 255];
  const expectedSpecularRight = d3d8SpecularLightResult.probe?.expectedRight ?? [255, 255, 255, 255];
  if (!d3d8SpecularLightResult.ok
      || d3d8SpecularLightResult.probe?.source !== "browser_d3d8_specular_light_probe"
      || d3d8SpecularLightResult.probe?.calls?.setMaterial !== 1
      || d3d8SpecularLightResult.probe?.calls?.setLight !== 1
      || d3d8SpecularLightResult.probe?.calls?.lightEnable !== 1
      || d3d8SpecularLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8SpecularLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8SpecularLightResult.browserProbe?.renderState?.specularEnable !== 1
      || d3d8SpecularLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8SpecularLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8SpecularLightResult.browserProbe?.renderState?.specularMaterialSource !== 0
      || d3d8SpecularLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8SpecularLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8SpecularLightResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8SpecularLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8SpecularLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8SpecularLightResult.browserProbe?.appliedRenderState?.lighting?.specular?.enabled !== true
      || d3d8SpecularLightResult.browserProbe?.appliedRenderState?.lighting?.specular?.sourceName !== "material"
      || d3d8SpecularLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== true
      || d3d8SpecularLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 1
      || d3d8SpecularLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLights?.[0]?.index !== 0
      || d3d8SpecularLightResult.materialOk !== true
      || d3d8SpecularLightResult.lightSpecularOk !== true
      || d3d8SpecularLightResult.selectedLightOk !== true
      || d3d8SpecularLightResult.appliedSpecularOk !== true
      || d3d8SpecularLightResult.leftPixelOk !== true
      || d3d8SpecularLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(d3d8SpecularLightResult.specularPixels?.left, expectedSpecularLeft, 2)
      || !pixelsApproximatelyEqual(d3d8SpecularLightResult.specularPixels?.right, expectedSpecularRight, 2)
      || !pixelLooksBlack(d3d8SpecularLightResult.specularPixels?.left)) {
    throw new Error(`D3D8 specular-light probe failed: ${JSON.stringify(d3d8SpecularLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8SpecularLightCanvasScreenshot });

  const d3d8SpecularOffAxisLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8SpecularOffAxisLight"));
  const expectedSpecularOffAxisLeft = d3d8SpecularOffAxisLightResult.probe?.expectedLeft ?? [0, 0, 0, 255];
  const expectedSpecularOffAxisRight = d3d8SpecularOffAxisLightResult.probe?.expectedRight ?? [255, 255, 255, 255];
  const expectedOffAxisDirection = d3d8SpecularOffAxisLightResult.probe?.light?.direction ?? [-0.8, 0, -0.6];
  if (!d3d8SpecularOffAxisLightResult.ok
      || d3d8SpecularOffAxisLightResult.probe?.source !== "browser_d3d8_specular_offaxis_light_probe"
      || d3d8SpecularOffAxisLightResult.probe?.calls?.setMaterial !== 1
      || d3d8SpecularOffAxisLightResult.probe?.calls?.setLight !== 1
      || d3d8SpecularOffAxisLightResult.probe?.calls?.lightEnable !== 1
      || d3d8SpecularOffAxisLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8SpecularOffAxisLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8SpecularOffAxisLightResult.browserProbe?.renderState?.specularEnable !== 1
      || d3d8SpecularOffAxisLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8SpecularOffAxisLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8SpecularOffAxisLightResult.browserProbe?.renderState?.specularMaterialSource !== 0
      || d3d8SpecularOffAxisLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8SpecularOffAxisLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8SpecularOffAxisLightResult.browserProbe?.lights?.[0]?.type !== 3
      || !floatVectorApproximatelyEqual(
        d3d8SpecularOffAxisLightResult.browserProbe?.lights?.[0]?.direction,
        expectedOffAxisDirection,
      )
      || d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.specular?.enabled !== true
      || d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.specular?.sourceName !== "material"
      || d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== true
      || d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 1
      || d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLights?.[0]?.index !== 0
      || !floatVectorApproximatelyEqual(
        d3d8SpecularOffAxisLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLights?.[0]?.direction,
        expectedOffAxisDirection,
      )
      || d3d8SpecularOffAxisLightResult.materialOk !== true
      || d3d8SpecularOffAxisLightResult.lightSpecularOk !== true
      || d3d8SpecularOffAxisLightResult.selectedLightOk !== true
      || d3d8SpecularOffAxisLightResult.appliedSpecularOk !== true
      || d3d8SpecularOffAxisLightResult.offAxisShapeOk !== true
      || d3d8SpecularOffAxisLightResult.leftPixelOk !== true
      || d3d8SpecularOffAxisLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8SpecularOffAxisLightResult.specularOffAxisPixels?.left,
        expectedSpecularOffAxisLeft,
        2,
      )
      || !pixelsApproximatelyEqual(
        d3d8SpecularOffAxisLightResult.specularOffAxisPixels?.right,
        expectedSpecularOffAxisRight,
        3,
      )
      || !pixelLooksBlack(d3d8SpecularOffAxisLightResult.specularOffAxisPixels?.left, 5)) {
    throw new Error(
      `D3D8 off-axis specular-light probe failed: ${JSON.stringify(d3d8SpecularOffAxisLightResult)}`,
    );
  }
  await page.locator("#viewport").screenshot({ path: d3d8SpecularOffAxisLightCanvasScreenshot });

  const d3d8SpecularTransformedLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8SpecularTransformedLight"));
  const expectedSpecularTransformedLeft =
    d3d8SpecularTransformedLightResult.probe?.expectedLeft ?? [0, 0, 0, 255];
  const expectedSpecularTransformedRight =
    d3d8SpecularTransformedLightResult.probe?.expectedRight ?? [255, 255, 255, 255];
  const expectedTransformedDirection =
    d3d8SpecularTransformedLightResult.probe?.light?.direction ?? [-15 / 17, 0, -8 / 17];
  if (!d3d8SpecularTransformedLightResult.ok
      || d3d8SpecularTransformedLightResult.probe?.source !==
        "browser_d3d8_specular_transformed_light_probe"
      || d3d8SpecularTransformedLightResult.probe?.calls?.setTransform !== 3
      || d3d8SpecularTransformedLightResult.probe?.calls?.setMaterial !== 1
      || d3d8SpecularTransformedLightResult.probe?.calls?.setLight !== 1
      || d3d8SpecularTransformedLightResult.probe?.calls?.lightEnable !== 1
      || d3d8SpecularTransformedLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8SpecularTransformedLightResult.probe?.transforms?.mask !== 7
      || Math.abs((d3d8SpecularTransformedLightResult.probe?.transforms?.worldScaleX ?? 0) - 2) >
        0.00001
      || d3d8SpecularTransformedLightResult.browserProbe?.transformMask !== 7
      || d3d8SpecularTransformedLightResult.browserProbe?.usedTransforms !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8SpecularTransformedLightResult.browserProbe?.renderState?.specularEnable !== 1
      || d3d8SpecularTransformedLightResult.browserProbe?.renderState?.normalizeNormals !== 1
      || d3d8SpecularTransformedLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8SpecularTransformedLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8SpecularTransformedLightResult.browserProbe?.renderState?.specularMaterialSource !== 0
      || d3d8SpecularTransformedLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8SpecularTransformedLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.lights?.[0]?.type !== 3
      || !floatVectorApproximatelyEqual(
        d3d8SpecularTransformedLightResult.browserProbe?.lights?.[0]?.direction,
        expectedTransformedDirection,
      )
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting?.specular?.enabled !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting?.specular?.sourceName !==
        "material"
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.source !== "inverseTransposeWorld"
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.inverseTransposeWorld !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.normalizeNormals !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightSupported !== true
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightCount !== 1
      || d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLights?.[0]?.index !== 0
      || !floatVectorApproximatelyEqual(
        d3d8SpecularTransformedLightResult.browserProbe?.appliedRenderState?.lighting
          ?.directionalLights?.[0]?.direction,
        expectedTransformedDirection,
      )
      || d3d8SpecularTransformedLightResult.materialOk !== true
      || d3d8SpecularTransformedLightResult.lightSpecularOk !== true
      || d3d8SpecularTransformedLightResult.selectedLightOk !== true
      || d3d8SpecularTransformedLightResult.appliedSpecularOk !== true
      || d3d8SpecularTransformedLightResult.transformOk !== true
      || d3d8SpecularTransformedLightResult.normalTransformOk !== true
      || d3d8SpecularTransformedLightResult.transformedShapeOk !== true
      || d3d8SpecularTransformedLightResult.leftPixelOk !== true
      || d3d8SpecularTransformedLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8SpecularTransformedLightResult.specularTransformedPixels?.left,
        expectedSpecularTransformedLeft,
        2,
      )
      || !pixelsApproximatelyEqual(
        d3d8SpecularTransformedLightResult.specularTransformedPixels?.right,
        expectedSpecularTransformedRight,
        8,
      )
      || !pixelLooksBlack(d3d8SpecularTransformedLightResult.specularTransformedPixels?.left, 5)) {
    throw new Error(
      `D3D8 transformed specular-light probe failed: ${JSON.stringify(d3d8SpecularTransformedLightResult)}`,
    );
  }
  await page.locator("#viewport").screenshot({ path: d3d8SpecularTransformedLightCanvasScreenshot });

  const d3d8NormalizeNormalsResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8NormalizeNormals"));
  const expectedNormalizeNormalsLeft =
    d3d8NormalizeNormalsResult.probe?.expectedLeft ?? [128, 128, 128, 255];
  const expectedNormalizeNormalsRight =
    d3d8NormalizeNormalsResult.probe?.expectedRight ?? [255, 255, 255, 255];
  if (!d3d8NormalizeNormalsResult.ok
      || d3d8NormalizeNormalsResult.probe?.source !== "browser_d3d8_normalize_normals_probe"
      || d3d8NormalizeNormalsResult.probe?.calls?.setTransform !== 3
      || d3d8NormalizeNormalsResult.probe?.calls?.setMaterial !== 1
      || d3d8NormalizeNormalsResult.probe?.calls?.setLight !== 1
      || d3d8NormalizeNormalsResult.probe?.calls?.lightEnable !== 1
      || d3d8NormalizeNormalsResult.probe?.calls?.drawIndexed !== 2
      || d3d8NormalizeNormalsResult.probe?.normalStates?.falseDraw !== 0
      || d3d8NormalizeNormalsResult.probe?.normalStates?.trueDraw !== 1
      || d3d8NormalizeNormalsResult.probe?.transforms?.mask !== 7
      || Math.abs((d3d8NormalizeNormalsResult.probe?.transforms?.worldScaleZ ?? 0) - 2) > 0.00001
      || d3d8NormalizeNormalsResult.probe?.draw?.vertexCount !== 4
      || d3d8NormalizeNormalsResult.probe?.draw?.primitiveCount !== 2
      || d3d8NormalizeNormalsResult.probe?.draw?.normalizeNormals !== 1
      || d3d8NormalizeNormalsResult.browserProbe?.transformMask !== 7
      || d3d8NormalizeNormalsResult.browserProbe?.usedTransforms !== true
      || d3d8NormalizeNormalsResult.browserProbe?.renderState?.lighting !== 1
      || d3d8NormalizeNormalsResult.browserProbe?.renderState?.normalizeNormals !== 1
      || d3d8NormalizeNormalsResult.browserProbe?.renderState?.specularEnable !== 0
      || d3d8NormalizeNormalsResult.browserProbe?.renderState?.ambient !== 0
      || d3d8NormalizeNormalsResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8NormalizeNormalsResult.browserProbe?.renderState?.diffuseMaterialSource !== 0
      || d3d8NormalizeNormalsResult.browserProbe?.vertexCount !== 8
      || d3d8NormalizeNormalsResult.browserProbe?.indexCount !== 6
      || d3d8NormalizeNormalsResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8NormalizeNormalsResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8NormalizeNormalsResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting?.normalizeNormals?.enabled !== true
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.source !== "inverseTransposeWorld"
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.inverseTransposeWorld !== true
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.normalizeNormals !== true
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightSupported !== true
      || d3d8NormalizeNormalsResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightCount !== 1
      || d3d8NormalizeNormalsResult.materialOk !== true
      || d3d8NormalizeNormalsResult.lightDiffuseOk !== true
      || d3d8NormalizeNormalsResult.selectedLightOk !== true
      || d3d8NormalizeNormalsResult.transformOk !== true
      || d3d8NormalizeNormalsResult.normalStatesOk !== true
      || d3d8NormalizeNormalsResult.normalTransformOk !== true
      || d3d8NormalizeNormalsResult.normalizedShapeOk !== true
      || d3d8NormalizeNormalsResult.leftPixelOk !== true
      || d3d8NormalizeNormalsResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8NormalizeNormalsResult.normalizeNormalPixels?.left,
        expectedNormalizeNormalsLeft,
        8,
      )
      || !pixelsApproximatelyEqual(
        d3d8NormalizeNormalsResult.normalizeNormalPixels?.right,
        expectedNormalizeNormalsRight,
        3,
      )) {
    throw new Error(`D3D8 normalize-normals probe failed: ${JSON.stringify(d3d8NormalizeNormalsResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8NormalizeNormalsCanvasScreenshot });

  const d3d8LocalViewerResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8LocalViewer"));
  const expectedLocalViewerLeft =
    d3d8LocalViewerResult.probe?.expectedLeft ?? [0, 0, 0, 255];
  const expectedLocalViewerRight =
    d3d8LocalViewerResult.probe?.expectedRight ?? [255, 255, 255, 255];
  if (!d3d8LocalViewerResult.ok
      || d3d8LocalViewerResult.probe?.source !== "browser_d3d8_local_viewer_probe"
      || d3d8LocalViewerResult.probe?.calls?.setTransform !== 3
      || d3d8LocalViewerResult.probe?.calls?.setMaterial !== 1
      || d3d8LocalViewerResult.probe?.calls?.setLight !== 1
      || d3d8LocalViewerResult.probe?.calls?.lightEnable !== 1
      || d3d8LocalViewerResult.probe?.calls?.drawIndexed !== 2
      || d3d8LocalViewerResult.probe?.localViewerStates?.trueDraw !== 1
      || d3d8LocalViewerResult.probe?.localViewerStates?.falseDraw !== 0
      || d3d8LocalViewerResult.probe?.transforms?.mask !== 7
      || d3d8LocalViewerResult.probe?.draw?.vertexCount !== 4
      || d3d8LocalViewerResult.probe?.draw?.primitiveCount !== 2
      || d3d8LocalViewerResult.probe?.draw?.localViewer !== 0
      || d3d8LocalViewerResult.browserProbe?.transformMask !== 7
      || d3d8LocalViewerResult.browserProbe?.usedTransforms !== true
      || d3d8LocalViewerResult.browserProbe?.renderState?.lighting !== 1
      || d3d8LocalViewerResult.browserProbe?.renderState?.specularEnable !== 1
      || d3d8LocalViewerResult.browserProbe?.renderState?.normalizeNormals !== 1
      || d3d8LocalViewerResult.browserProbe?.renderState?.localViewer !== 0
      || d3d8LocalViewerResult.browserProbe?.renderState?.ambient !== 0
      || d3d8LocalViewerResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8LocalViewerResult.browserProbe?.renderState?.specularMaterialSource !== 0
      || d3d8LocalViewerResult.browserProbe?.vertexCount !== 8
      || d3d8LocalViewerResult.browserProbe?.indexCount !== 6
      || d3d8LocalViewerResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8LocalViewerResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8LocalViewerResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.normalizeNormals?.enabled !== true
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.localViewer?.enabled !== false
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.viewDirection?.source !== "orthogonal"
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.viewDirection?.localViewer !== false
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.source !== "inverseTransposeWorld"
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.inverseTransposeWorld !== true
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting?.normalTransform
        ?.normalizeNormals !== true
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightSupported !== true
      || d3d8LocalViewerResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightCount !== 1
      || d3d8LocalViewerResult.materialOk !== true
      || d3d8LocalViewerResult.lightSpecularOk !== true
      || d3d8LocalViewerResult.selectedLightOk !== true
      || d3d8LocalViewerResult.appliedSpecularOk !== true
      || d3d8LocalViewerResult.transformOk !== true
      || d3d8LocalViewerResult.localViewerStatesOk !== true
      || d3d8LocalViewerResult.normalTransformOk !== true
      || d3d8LocalViewerResult.localViewerOk !== true
      || d3d8LocalViewerResult.localViewerShapeOk !== true
      || d3d8LocalViewerResult.leftPixelOk !== true
      || d3d8LocalViewerResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8LocalViewerResult.localViewerPixels?.left,
        expectedLocalViewerLeft,
        5,
      )
      || !pixelsApproximatelyEqual(
        d3d8LocalViewerResult.localViewerPixels?.right,
        expectedLocalViewerRight,
        4,
      )
      || !pixelLooksBlack(d3d8LocalViewerResult.localViewerPixels?.left, 5)) {
    throw new Error(`D3D8 local-viewer probe failed: ${JSON.stringify(d3d8LocalViewerResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8LocalViewerCanvasScreenshot });

  const d3d8PointLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8PointLight"));
  const expectedPointLeft = d3d8PointLightResult.probe?.expectedLeft ?? [128, 128, 128, 255];
  const expectedPointRight = d3d8PointLightResult.probe?.expectedRight ?? [254, 254, 254, 255];
  if (!d3d8PointLightResult.ok
      || d3d8PointLightResult.probe?.source !== "browser_d3d8_point_light_probe"
      || d3d8PointLightResult.probe?.calls?.setMaterial !== 1
      || d3d8PointLightResult.probe?.calls?.setLight !== 1
      || d3d8PointLightResult.probe?.calls?.lightEnable !== 1
      || d3d8PointLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8PointLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8PointLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8PointLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8PointLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8PointLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8PointLightResult.browserProbe?.lights?.[0]?.type !== 1
      || d3d8PointLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8PointLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8PointLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported !== true
      || d3d8PointLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightCount !== 1
      || d3d8PointLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLights?.[0]?.type !== 1
      || d3d8PointLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== false
      || d3d8PointLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 0
      || d3d8PointLightResult.materialOk !== true
      || d3d8PointLightResult.lightAttenuationOk !== true
      || d3d8PointLightResult.selectedLightOk !== true
      || d3d8PointLightResult.leftPixelOk !== true
      || d3d8PointLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(d3d8PointLightResult.pointLightPixels?.left, expectedPointLeft, 10)
      || !pixelsApproximatelyEqual(d3d8PointLightResult.pointLightPixels?.right, expectedPointRight, 3)) {
    throw new Error(`D3D8 point-light probe failed: ${JSON.stringify(d3d8PointLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8PointLightCanvasScreenshot });

  const d3d8PointQuadraticLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8PointQuadraticLight"));
  const expectedPointQuadraticLeft = d3d8PointQuadraticLightResult.probe?.expectedLeft ?? [90, 90, 90, 255];
  const expectedPointQuadraticRight = d3d8PointQuadraticLightResult.probe?.expectedRight ?? [253, 253, 253, 255];
  if (!d3d8PointQuadraticLightResult.ok
      || d3d8PointQuadraticLightResult.probe?.source !== "browser_d3d8_point_quadratic_light_probe"
      || d3d8PointQuadraticLightResult.probe?.calls?.setMaterial !== 1
      || d3d8PointQuadraticLightResult.probe?.calls?.setLight !== 1
      || d3d8PointQuadraticLightResult.probe?.calls?.lightEnable !== 1
      || d3d8PointQuadraticLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8PointQuadraticLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8PointQuadraticLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8PointQuadraticLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8PointQuadraticLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8PointQuadraticLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8PointQuadraticLightResult.browserProbe?.lights?.[0]?.type !== 1
      || Math.abs(d3d8PointQuadraticLightResult.browserProbe?.lights?.[0]?.attenuation0 ?? 1) > 0.00001
      || Math.abs(d3d8PointQuadraticLightResult.browserProbe?.lights?.[0]?.attenuation1 ?? 1) > 0.00001
      || Math.abs((d3d8PointQuadraticLightResult.browserProbe?.lights?.[0]?.attenuation2 ?? 0) - 1) > 0.00001
      || d3d8PointQuadraticLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8PointQuadraticLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8PointQuadraticLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported !== true
      || d3d8PointQuadraticLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightCount !== 1
      || d3d8PointQuadraticLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLights?.[0]?.type !== 1
      || d3d8PointQuadraticLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== false
      || d3d8PointQuadraticLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 0
      || d3d8PointQuadraticLightResult.materialOk !== true
      || d3d8PointQuadraticLightResult.lightAttenuationOk !== true
      || d3d8PointQuadraticLightResult.selectedLightOk !== true
      || d3d8PointQuadraticLightResult.quadraticShapeOk !== true
      || d3d8PointQuadraticLightResult.leftPixelOk !== true
      || d3d8PointQuadraticLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(d3d8PointQuadraticLightResult.pointQuadraticLightPixels?.left,
        expectedPointQuadraticLeft, 8)
      || !pixelsApproximatelyEqual(d3d8PointQuadraticLightResult.pointQuadraticLightPixels?.right,
        expectedPointQuadraticRight, 4)) {
    throw new Error(`D3D8 quadratic point-light probe failed: ${JSON.stringify(d3d8PointQuadraticLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8PointQuadraticLightCanvasScreenshot });

  const d3d8PointRangeLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8PointRangeLight"));
  const expectedPointRangeLeft = d3d8PointRangeLightResult.probe?.expectedLeft ?? [0, 0, 0, 255];
  const expectedPointRangeRight = d3d8PointRangeLightResult.probe?.expectedRight ?? [254, 254, 254, 255];
  const pointRangeLight = d3d8PointRangeLightResult.browserProbe?.lights?.[0] ?? {};
  if (!d3d8PointRangeLightResult.ok
      || d3d8PointRangeLightResult.probe?.source !== "browser_d3d8_point_range_light_probe"
      || d3d8PointRangeLightResult.probe?.calls?.setMaterial !== 1
      || d3d8PointRangeLightResult.probe?.calls?.setLight !== 1
      || d3d8PointRangeLightResult.probe?.calls?.lightEnable !== 1
      || d3d8PointRangeLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8PointRangeLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8PointRangeLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8PointRangeLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8PointRangeLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || pointRangeLight.enabled !== true
      || pointRangeLight.type !== 1
      || Math.abs((pointRangeLight.range ?? 0) - 1.25) > 0.00001
      || Math.abs((pointRangeLight.attenuation0 ?? 0) - 1) > 0.00001
      || Math.abs(pointRangeLight.attenuation1 ?? 1) > 0.00001
      || Math.abs(pointRangeLight.attenuation2 ?? 1) > 0.00001
      || d3d8PointRangeLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8PointRangeLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8PointRangeLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported !== true
      || d3d8PointRangeLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightCount !== 1
      || d3d8PointRangeLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLights?.[0]?.type !== 1
      || d3d8PointRangeLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== false
      || d3d8PointRangeLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 0
      || d3d8PointRangeLightResult.materialOk !== true
      || d3d8PointRangeLightResult.lightAttenuationOk !== true
      || d3d8PointRangeLightResult.selectedLightOk !== true
      || d3d8PointRangeLightResult.rangeShapeOk !== true
      || d3d8PointRangeLightResult.leftPixelOk !== true
      || d3d8PointRangeLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(d3d8PointRangeLightResult.pointRangeLightPixels?.left,
        expectedPointRangeLeft, 2)
      || !pixelsApproximatelyEqual(d3d8PointRangeLightResult.pointRangeLightPixels?.right,
        expectedPointRangeRight, 4)) {
    throw new Error(`D3D8 point-light range probe failed: ${JSON.stringify(d3d8PointRangeLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8PointRangeLightCanvasScreenshot });

  const d3d8PointMixedLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8PointMixedLight"));
  const expectedPointMixedLeft = d3d8PointMixedLightResult.probe?.expectedLeft ?? [101, 101, 101, 255];
  const expectedPointMixedRight = d3d8PointMixedLightResult.probe?.expectedRight ?? [254, 254, 254, 255];
  const pointMixedLight = d3d8PointMixedLightResult.browserProbe?.lights?.[0] ?? {};
  if (!d3d8PointMixedLightResult.ok
      || d3d8PointMixedLightResult.probe?.source !== "browser_d3d8_point_mixed_light_probe"
      || d3d8PointMixedLightResult.probe?.calls?.setMaterial !== 1
      || d3d8PointMixedLightResult.probe?.calls?.setLight !== 1
      || d3d8PointMixedLightResult.probe?.calls?.lightEnable !== 1
      || d3d8PointMixedLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8PointMixedLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8PointMixedLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8PointMixedLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8PointMixedLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || pointMixedLight.enabled !== true
      || pointMixedLight.type !== 1
      || Math.abs((pointMixedLight.range ?? 0) - 10) > 0.00001
      || Math.abs((pointMixedLight.attenuation0 ?? 0) - 0.1) > 0.00001
      || Math.abs((pointMixedLight.attenuation1 ?? 0) - 0.2) > 0.00001
      || Math.abs((pointMixedLight.attenuation2 ?? 0) - 0.7) > 0.00001
      || d3d8PointMixedLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8PointMixedLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8PointMixedLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported !== true
      || d3d8PointMixedLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightCount !== 1
      || d3d8PointMixedLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLights?.[0]?.type !== 1
      || d3d8PointMixedLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== false
      || d3d8PointMixedLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 0
      || d3d8PointMixedLightResult.materialOk !== true
      || d3d8PointMixedLightResult.lightAttenuationOk !== true
      || d3d8PointMixedLightResult.selectedLightOk !== true
      || d3d8PointMixedLightResult.mixedShapeOk !== true
      || d3d8PointMixedLightResult.leftPixelOk !== true
      || d3d8PointMixedLightResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(d3d8PointMixedLightResult.pointMixedLightPixels?.left,
        expectedPointMixedLeft, 8)
      || !pixelsApproximatelyEqual(d3d8PointMixedLightResult.pointMixedLightPixels?.right,
        expectedPointMixedRight, 4)) {
    throw new Error(`D3D8 mixed point-light probe failed: ${JSON.stringify(d3d8PointMixedLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8PointMixedLightCanvasScreenshot });

  const d3d8SpotLightResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8SpotLight"));
  const expectedSpotOutside = d3d8SpotLightResult.probe?.expectedOutside ?? [0, 0, 0, 255];
  const expectedSpotInside = d3d8SpotLightResult.probe?.expectedInside ?? [255, 255, 255, 255];
  if (!d3d8SpotLightResult.ok
      || d3d8SpotLightResult.probe?.source !== "browser_d3d8_spot_light_probe"
      || d3d8SpotLightResult.probe?.calls?.setMaterial !== 1
      || d3d8SpotLightResult.probe?.calls?.setLight !== 1
      || d3d8SpotLightResult.probe?.calls?.lightEnable !== 1
      || d3d8SpotLightResult.probe?.calls?.drawIndexed !== 1
      || d3d8SpotLightResult.browserProbe?.renderState?.lighting !== 1
      || d3d8SpotLightResult.browserProbe?.renderState?.ambient !== 0
      || d3d8SpotLightResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8SpotLightResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8SpotLightResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8SpotLightResult.browserProbe?.lights?.[0]?.type !== 2
      || d3d8SpotLightResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8SpotLightResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8SpotLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported !== true
      || d3d8SpotLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightCount !== 1
      || d3d8SpotLightResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLights?.[0]?.type !== 2
      || d3d8SpotLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== false
      || d3d8SpotLightResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 0
      || d3d8SpotLightResult.materialOk !== true
      || d3d8SpotLightResult.lightConeOk !== true
      || d3d8SpotLightResult.selectedLightOk !== true
      || d3d8SpotLightResult.outsidePixelOk !== true
      || d3d8SpotLightResult.insidePixelOk !== true
      || !pixelsApproximatelyEqual(d3d8SpotLightResult.spotLightPixels?.outside, expectedSpotOutside, 2)
      || !pixelsApproximatelyEqual(d3d8SpotLightResult.spotLightPixels?.inside, expectedSpotInside, 3)
      || !pixelLooksBlack(d3d8SpotLightResult.spotLightPixels?.outside)) {
    throw new Error(`D3D8 spot-light probe failed: ${JSON.stringify(d3d8SpotLightResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8SpotLightCanvasScreenshot });

  const d3d8SpotFalloffResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8SpotFalloff"));
  const expectedFalloffInside = d3d8SpotFalloffResult.probe?.expectedInside ?? [255, 255, 255, 255];
  const expectedFalloffPenumbra = d3d8SpotFalloffResult.probe?.expectedPenumbra ?? [61, 61, 61, 255];
  const expectedFalloffOutside = d3d8SpotFalloffResult.probe?.expectedOutside ?? [0, 0, 0, 255];
  if (!d3d8SpotFalloffResult.ok
      || d3d8SpotFalloffResult.probe?.source !== "browser_d3d8_spot_falloff_probe"
      || d3d8SpotFalloffResult.probe?.calls?.setMaterial !== 1
      || d3d8SpotFalloffResult.probe?.calls?.setLight !== 1
      || d3d8SpotFalloffResult.probe?.calls?.lightEnable !== 1
      || d3d8SpotFalloffResult.probe?.calls?.drawIndexed !== 1
      || d3d8SpotFalloffResult.browserProbe?.renderState?.lighting !== 1
      || d3d8SpotFalloffResult.browserProbe?.renderState?.ambient !== 0
      || d3d8SpotFalloffResult.browserProbe?.renderState?.colorVertex !== 0
      || d3d8SpotFalloffResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8SpotFalloffResult.browserProbe?.vertexCount !== 12
      || d3d8SpotFalloffResult.browserProbe?.indexCount !== 18
      || d3d8SpotFalloffResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8SpotFalloffResult.browserProbe?.lights?.[0]?.type !== 2
      || d3d8SpotFalloffResult.browserProbe?.lights?.[0]?.theta >=
        d3d8SpotFalloffResult.browserProbe?.lights?.[0]?.phi
      || Math.abs((d3d8SpotFalloffResult.browserProbe?.lights?.[0]?.falloff ?? 0) - 2) > 0.00001
      || d3d8SpotFalloffResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8SpotFalloffResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8SpotFalloffResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported !== true
      || d3d8SpotFalloffResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightCount !== 1
      || d3d8SpotFalloffResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLights?.[0]?.type !== 2
      || d3d8SpotFalloffResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== false
      || d3d8SpotFalloffResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 0
      || d3d8SpotFalloffResult.materialOk !== true
      || d3d8SpotFalloffResult.lightFalloffOk !== true
      || d3d8SpotFalloffResult.selectedLightOk !== true
      || d3d8SpotFalloffResult.insidePixelOk !== true
      || d3d8SpotFalloffResult.penumbraPixelOk !== true
      || d3d8SpotFalloffResult.outsidePixelOk !== true
      || d3d8SpotFalloffResult.penumbraSeparatedOk !== true
      || !pixelsApproximatelyEqual(d3d8SpotFalloffResult.spotFalloffPixels?.inside,
        expectedFalloffInside, 3)
      || !pixelsApproximatelyEqual(d3d8SpotFalloffResult.spotFalloffPixels?.penumbra,
        expectedFalloffPenumbra, 16)
      || !pixelsApproximatelyEqual(d3d8SpotFalloffResult.spotFalloffPixels?.outside,
        expectedFalloffOutside, 2)
      || !pixelLooksBlack(d3d8SpotFalloffResult.spotFalloffPixels?.outside)) {
    throw new Error(`D3D8 spot falloff probe failed: ${JSON.stringify(d3d8SpotFalloffResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8SpotFalloffCanvasScreenshot });

  const d3d8MaterialResult = await page.evaluate(() => window.CnCPort.rpc("d3d8Material"));
  const expectedMaterial = d3d8MaterialResult.probe?.material ?? {};
  const browserMaterial = d3d8MaterialResult.browserProbe?.material ?? {};
  if (!d3d8MaterialResult.ok
      || d3d8MaterialResult.probe?.source !== "browser_d3d8_material_probe"
      || d3d8MaterialResult.probe?.calls?.setMaterial !== 1
      || d3d8MaterialResult.probe?.calls?.getMaterial !== 1
      || d3d8MaterialResult.probe?.calls?.drawIndexed !== 1
      || d3d8MaterialResult.browserProbe?.renderState?.lighting !== 0
      || d3d8MaterialResult.materialOk !== true
      || d3d8MaterialResult.appliedMaterialOk !== true
      || !floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse)
      || !floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient)
      || !floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular)
      || !floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive)
      || Math.abs((browserMaterial.power ?? 0) - (expectedMaterial.power ?? 0)) > 0.00001
      || d3d8MaterialResult.browserProbe?.centerPixel?.join(",") !== "0,255,0,255"
      || d3d8MaterialResult.centerPixelOk !== true) {
    throw new Error(`D3D8 material probe failed: ${JSON.stringify(d3d8MaterialResult)}`);
  }

  const d3d8MaterialSourcesResult = await page.evaluate(() => window.CnCPort.rpc("d3d8MaterialSources"));
  const materialSources = d3d8MaterialSourcesResult.probe?.materialSources ?? {};
  const appliedSources = d3d8MaterialSourcesResult.browserProbe?.appliedRenderState?.materialSources ?? {};
  if (!d3d8MaterialSourcesResult.ok
      || d3d8MaterialSourcesResult.probe?.source !== "browser_d3d8_material_sources_probe"
      || d3d8MaterialSourcesResult.probe?.calls?.setRenderState !== 11
      || d3d8MaterialSourcesResult.probe?.calls?.drawIndexed !== 1
      || d3d8MaterialSourcesResult.browserProbe?.renderState?.lighting !== 0
      || d3d8MaterialSourcesResult.browserProbe?.renderState?.colorVertex !== materialSources.colorVertex
      || d3d8MaterialSourcesResult.browserProbe?.renderState?.diffuseMaterialSource !== materialSources.diffuse
      || d3d8MaterialSourcesResult.browserProbe?.renderState?.specularMaterialSource !== materialSources.specular
      || d3d8MaterialSourcesResult.browserProbe?.renderState?.ambientMaterialSource !== materialSources.ambient
      || d3d8MaterialSourcesResult.browserProbe?.renderState?.emissiveMaterialSource !== materialSources.emissive
      || appliedSources.colorVertex?.enabled !== false
      || appliedSources.diffuse?.name !== "material"
      || appliedSources.specular?.name !== "material"
      || appliedSources.ambient?.name !== "color2"
      || appliedSources.emissive?.name !== "color1"
      || d3d8MaterialSourcesResult.sourceValueOk !== true
      || d3d8MaterialSourcesResult.appliedSourcesOk !== true
      || d3d8MaterialSourcesResult.browserProbe?.centerPixel?.join(",") !== "0,255,0,255"
      || d3d8MaterialSourcesResult.centerPixelOk !== true) {
    throw new Error(`D3D8 material-source probe failed: ${JSON.stringify(d3d8MaterialSourcesResult)}`);
  }

  const d3d8LitMaterialSourcesResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8LitMaterialSources"));
  const litMaterialSources = d3d8LitMaterialSourcesResult.probe?.materialSources ?? {};
  const litAppliedSources = d3d8LitMaterialSourcesResult.browserProbe?.appliedRenderState?.materialSources ?? {};
  const expectedLitLeft = d3d8LitMaterialSourcesResult.probe?.expectedLeft ?? [192, 0, 0, 255];
  const expectedLitRight = d3d8LitMaterialSourcesResult.probe?.expectedRight ?? [0, 192, 0, 255];
  if (!d3d8LitMaterialSourcesResult.ok
      || d3d8LitMaterialSourcesResult.probe?.source !== "browser_d3d8_lit_material_sources_probe"
      || d3d8LitMaterialSourcesResult.probe?.calls?.setRenderState !== 13
      || d3d8LitMaterialSourcesResult.probe?.calls?.setMaterial !== 1
      || d3d8LitMaterialSourcesResult.probe?.calls?.setLight !== 1
      || d3d8LitMaterialSourcesResult.probe?.calls?.lightEnable !== 1
      || d3d8LitMaterialSourcesResult.probe?.calls?.drawIndexed !== 1
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.lighting !== 1
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.ambient !==
        d3d8LitMaterialSourcesResult.probe?.sceneAmbient
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.colorVertex !== litMaterialSources.colorVertex
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.diffuseMaterialSource !==
        litMaterialSources.diffuse
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.specularMaterialSource !==
        litMaterialSources.specular
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.ambientMaterialSource !==
        litMaterialSources.ambient
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.emissiveMaterialSource !==
        litMaterialSources.emissive
      || d3d8LitMaterialSourcesResult.browserProbe?.renderState?.specularEnable !== 0
      || litAppliedSources.colorVertex?.enabled !== true
      || litAppliedSources.diffuse?.name !== "color1"
      || litAppliedSources.specular?.name !== "material"
      || litAppliedSources.ambient?.name !== "color1"
      || litAppliedSources.emissive?.name !== "material"
      || d3d8LitMaterialSourcesResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8LitMaterialSourcesResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8LitMaterialSourcesResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8LitMaterialSourcesResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8LitMaterialSourcesResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8LitMaterialSourcesResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported !== true
      || d3d8LitMaterialSourcesResult.browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightCount !== 1
      || d3d8LitMaterialSourcesResult.browserProbe?.appliedRenderState?.lighting?.directionalLightSupported !== true
      || d3d8LitMaterialSourcesResult.browserProbe?.appliedRenderState?.lighting?.directionalLightCount !== 1
      || d3d8LitMaterialSourcesResult.sourceValueOk !== true
      || d3d8LitMaterialSourcesResult.appliedSourcesOk !== true
      || d3d8LitMaterialSourcesResult.materialOk !== true
      || d3d8LitMaterialSourcesResult.lightOk !== true
      || d3d8LitMaterialSourcesResult.selectedLightOk !== true
      || d3d8LitMaterialSourcesResult.litColor1ShapeOk !== true
      || d3d8LitMaterialSourcesResult.leftPixelOk !== true
      || d3d8LitMaterialSourcesResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8LitMaterialSourcesResult.litMaterialSourcePixels?.left,
        expectedLitLeft,
        3,
      )
      || !pixelsApproximatelyEqual(
        d3d8LitMaterialSourcesResult.litMaterialSourcePixels?.right,
        expectedLitRight,
        3,
      )) {
    throw new Error(`D3D8 lit material-source probe failed: ${JSON.stringify(d3d8LitMaterialSourcesResult)}`);
  }
  await page.locator("#viewport").screenshot({ path: d3d8LitMaterialSourcesCanvasScreenshot });

  const d3d8LitSpecularMaterialSourceResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8LitSpecularMaterialSource"));
  const litSpecularMaterialSources = d3d8LitSpecularMaterialSourceResult.probe?.materialSources ?? {};
  const litSpecularAppliedSources =
    d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.materialSources ?? {};
  const expectedLitSpecularLeft =
    d3d8LitSpecularMaterialSourceResult.probe?.expectedLeft ?? [255, 0, 0, 255];
  const expectedLitSpecularRight =
    d3d8LitSpecularMaterialSourceResult.probe?.expectedRight ?? [0, 255, 0, 255];
  if (!d3d8LitSpecularMaterialSourceResult.ok
      || d3d8LitSpecularMaterialSourceResult.probe?.source !==
        "browser_d3d8_lit_specular_material_source_probe"
      || d3d8LitSpecularMaterialSourceResult.probe?.calls?.setRenderState !== 13
      || d3d8LitSpecularMaterialSourceResult.probe?.calls?.setMaterial !== 1
      || d3d8LitSpecularMaterialSourceResult.probe?.calls?.setLight !== 1
      || d3d8LitSpecularMaterialSourceResult.probe?.calls?.lightEnable !== 1
      || d3d8LitSpecularMaterialSourceResult.probe?.calls?.drawIndexed !== 1
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.lighting !== 1
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.ambient !==
        d3d8LitSpecularMaterialSourceResult.probe?.sceneAmbient
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.colorVertex !==
        litSpecularMaterialSources.colorVertex
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.diffuseMaterialSource !==
        litSpecularMaterialSources.diffuse
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.specularMaterialSource !==
        litSpecularMaterialSources.specular
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.ambientMaterialSource !==
        litSpecularMaterialSources.ambient
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.emissiveMaterialSource !==
        litSpecularMaterialSources.emissive
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.renderState?.specularEnable !== 1
      || litSpecularAppliedSources.colorVertex?.enabled !== true
      || litSpecularAppliedSources.diffuse?.name !== "material"
      || litSpecularAppliedSources.specular?.name !== "color1"
      || litSpecularAppliedSources.ambient?.name !== "material"
      || litSpecularAppliedSources.emissive?.name !== "material"
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.vertexLayout?.normalOffset !== 12
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.specular
        ?.enabled !== true
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.specular
        ?.sourceName !== "color1"
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.fixedFunctionLightSupported !== true
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.fixedFunctionLightCount !== 1
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightSupported !== true
      || d3d8LitSpecularMaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.directionalLightCount !== 1
      || d3d8LitSpecularMaterialSourceResult.sourceValueOk !== true
      || d3d8LitSpecularMaterialSourceResult.appliedSourcesOk !== true
      || d3d8LitSpecularMaterialSourceResult.materialOk !== true
      || d3d8LitSpecularMaterialSourceResult.lightOk !== true
      || d3d8LitSpecularMaterialSourceResult.selectedLightOk !== true
      || d3d8LitSpecularMaterialSourceResult.appliedSpecularOk !== true
      || d3d8LitSpecularMaterialSourceResult.litSpecularSourceShapeOk !== true
      || d3d8LitSpecularMaterialSourceResult.leftPixelOk !== true
      || d3d8LitSpecularMaterialSourceResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8LitSpecularMaterialSourceResult.litSpecularMaterialSourcePixels?.left,
        expectedLitSpecularLeft,
        4,
      )
      || !pixelsApproximatelyEqual(
        d3d8LitSpecularMaterialSourceResult.litSpecularMaterialSourcePixels?.right,
        expectedLitSpecularRight,
        4,
      )) {
    throw new Error(
      `D3D8 lit specular material-source probe failed: ${JSON.stringify(d3d8LitSpecularMaterialSourceResult)}`,
    );
  }
  await page.locator("#viewport").screenshot({ path: d3d8LitSpecularMaterialSourceCanvasScreenshot });

  const d3d8LitEmissiveColor1MaterialSourceResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8LitEmissiveColor1MaterialSource"));
  const litEmissiveColor1Sources =
    d3d8LitEmissiveColor1MaterialSourceResult.probe?.materialSources ?? {};
  const litEmissiveColor1AppliedSources =
    d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.appliedRenderState?.materialSources ?? {};
  const litEmissiveColor1Layout =
    d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.vertexLayout ?? {};
  const litEmissiveColor1Fvf =
    d3d8LitEmissiveColor1MaterialSourceResult.probe?.draw?.vertexShaderFvf ?? 0;
  const expectedLitEmissiveColor1Left =
    d3d8LitEmissiveColor1MaterialSourceResult.probe?.expectedLeft ?? [255, 0, 0, 255];
  const expectedLitEmissiveColor1Right =
    d3d8LitEmissiveColor1MaterialSourceResult.probe?.expectedRight ?? [0, 255, 0, 255];
  if (!d3d8LitEmissiveColor1MaterialSourceResult.ok
      || d3d8LitEmissiveColor1MaterialSourceResult.probe?.source !==
        "browser_d3d8_lit_emissive_color1_material_source_probe"
      || d3d8LitEmissiveColor1MaterialSourceResult.probe?.calls?.setRenderState !== 13
      || d3d8LitEmissiveColor1MaterialSourceResult.probe?.calls?.setMaterial !== 1
      || d3d8LitEmissiveColor1MaterialSourceResult.probe?.calls?.setLight !== 1
      || d3d8LitEmissiveColor1MaterialSourceResult.probe?.calls?.lightEnable !== 1
      || d3d8LitEmissiveColor1MaterialSourceResult.probe?.calls?.setVertexShader !== 1
      || d3d8LitEmissiveColor1MaterialSourceResult.probe?.calls?.drawIndexed !== 1
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.lighting !== 1
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.ambient !==
        d3d8LitEmissiveColor1MaterialSourceResult.probe?.sceneAmbient
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.colorVertex !==
        litEmissiveColor1Sources.colorVertex
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.diffuseMaterialSource !==
        litEmissiveColor1Sources.diffuse
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.specularMaterialSource !==
        litEmissiveColor1Sources.specular
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.ambientMaterialSource !==
        litEmissiveColor1Sources.ambient
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.emissiveMaterialSource !==
        litEmissiveColor1Sources.emissive
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.renderState?.specularEnable !== 0
      || litEmissiveColor1AppliedSources.colorVertex?.enabled !== true
      || litEmissiveColor1AppliedSources.diffuse?.name !== "material"
      || litEmissiveColor1AppliedSources.specular?.name !== "material"
      || litEmissiveColor1AppliedSources.ambient?.name !== "material"
      || litEmissiveColor1AppliedSources.emissive?.name !== "color1"
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.vertexShaderFvf !== litEmissiveColor1Fvf
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.vertexStride !== 44
      || litEmissiveColor1Layout.source !== "fvf"
      || litEmissiveColor1Layout.stride !== 44
      || litEmissiveColor1Layout.computedStride !== 44
      || litEmissiveColor1Layout.normalOffset !== 12
      || litEmissiveColor1Layout.diffuseOffset !== 24
      || litEmissiveColor1Layout.specularOffset !== null
      || litEmissiveColor1Layout.texCoords?.[0]?.offset !== 28
      || litEmissiveColor1Layout.texCoords?.[1]?.offset !== 36
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.fixedFunctionLightSupported !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.fixedFunctionLightCount !== 1
      || d3d8LitEmissiveColor1MaterialSourceResult.sourceValueOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.appliedSourcesOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.materialOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.lightOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.selectedLightOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.vertexLayoutOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.emissiveColor1ShapeOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.leftPixelOk !== true
      || d3d8LitEmissiveColor1MaterialSourceResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8LitEmissiveColor1MaterialSourceResult.litEmissiveColor1MaterialSourcePixels?.left,
        expectedLitEmissiveColor1Left,
        4,
      )
      || !pixelsApproximatelyEqual(
        d3d8LitEmissiveColor1MaterialSourceResult.litEmissiveColor1MaterialSourcePixels?.right,
        expectedLitEmissiveColor1Right,
        4,
      )) {
    throw new Error(
      `D3D8 lit emissive COLOR1 material-source probe failed: ${
        JSON.stringify(d3d8LitEmissiveColor1MaterialSourceResult)
      }`,
    );
  }
  await page.locator("#viewport").screenshot({ path: d3d8LitEmissiveColor1MaterialSourceCanvasScreenshot });

  const d3d8LitEmissiveColor2MaterialSourceResult = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8LitEmissiveColor2MaterialSource"));
  const litEmissiveColor2Sources =
    d3d8LitEmissiveColor2MaterialSourceResult.probe?.materialSources ?? {};
  const litEmissiveColor2AppliedSources =
    d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.appliedRenderState?.materialSources ?? {};
  const litEmissiveColor2Layout =
    d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.vertexLayout ?? {};
  const litEmissiveColor2Fvf =
    d3d8LitEmissiveColor2MaterialSourceResult.probe?.draw?.vertexShaderFvf ?? 0;
  const expectedLitEmissiveColor2Left =
    d3d8LitEmissiveColor2MaterialSourceResult.probe?.expectedLeft ?? [255, 0, 0, 255];
  const expectedLitEmissiveColor2Right =
    d3d8LitEmissiveColor2MaterialSourceResult.probe?.expectedRight ?? [0, 0, 255, 255];
  if (!d3d8LitEmissiveColor2MaterialSourceResult.ok
      || d3d8LitEmissiveColor2MaterialSourceResult.probe?.source !==
        "browser_d3d8_lit_emissive_color2_material_source_probe"
      || d3d8LitEmissiveColor2MaterialSourceResult.probe?.calls?.setRenderState !== 13
      || d3d8LitEmissiveColor2MaterialSourceResult.probe?.calls?.setMaterial !== 1
      || d3d8LitEmissiveColor2MaterialSourceResult.probe?.calls?.setLight !== 1
      || d3d8LitEmissiveColor2MaterialSourceResult.probe?.calls?.lightEnable !== 1
      || d3d8LitEmissiveColor2MaterialSourceResult.probe?.calls?.setVertexShader !== 1
      || d3d8LitEmissiveColor2MaterialSourceResult.probe?.calls?.drawIndexed !== 1
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.lighting !== 1
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.ambient !==
        d3d8LitEmissiveColor2MaterialSourceResult.probe?.sceneAmbient
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.colorVertex !==
        litEmissiveColor2Sources.colorVertex
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.diffuseMaterialSource !==
        litEmissiveColor2Sources.diffuse
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.specularMaterialSource !==
        litEmissiveColor2Sources.specular
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.ambientMaterialSource !==
        litEmissiveColor2Sources.ambient
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.emissiveMaterialSource !==
        litEmissiveColor2Sources.emissive
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.renderState?.specularEnable !== 0
      || litEmissiveColor2AppliedSources.colorVertex?.enabled !== true
      || litEmissiveColor2AppliedSources.diffuse?.name !== "material"
      || litEmissiveColor2AppliedSources.specular?.name !== "material"
      || litEmissiveColor2AppliedSources.ambient?.name !== "material"
      || litEmissiveColor2AppliedSources.emissive?.name !== "color2"
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.vertexShaderFvf !== litEmissiveColor2Fvf
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.vertexStride !== 48
      || litEmissiveColor2Layout.source !== "fvf"
      || litEmissiveColor2Layout.stride !== 48
      || litEmissiveColor2Layout.computedStride !== 48
      || litEmissiveColor2Layout.normalOffset !== 12
      || litEmissiveColor2Layout.diffuseOffset !== 24
      || litEmissiveColor2Layout.specularOffset !== 28
      || litEmissiveColor2Layout.texCoords?.[0]?.offset !== 32
      || litEmissiveColor2Layout.texCoords?.[1]?.offset !== 40
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.lights?.[0]?.enabled !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.lights?.[0]?.type !== 3
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.enabled !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.appliedRenderState?.lighting?.shaderEnabled !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.fixedFunctionLightSupported !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.browserProbe?.appliedRenderState?.lighting
        ?.fixedFunctionLightCount !== 1
      || d3d8LitEmissiveColor2MaterialSourceResult.sourceValueOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.appliedSourcesOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.materialOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.lightOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.selectedLightOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.vertexLayoutOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.emissiveColor2ShapeOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.leftPixelOk !== true
      || d3d8LitEmissiveColor2MaterialSourceResult.rightPixelOk !== true
      || !pixelsApproximatelyEqual(
        d3d8LitEmissiveColor2MaterialSourceResult.litEmissiveColor2MaterialSourcePixels?.left,
        expectedLitEmissiveColor2Left,
        4,
      )
      || !pixelsApproximatelyEqual(
        d3d8LitEmissiveColor2MaterialSourceResult.litEmissiveColor2MaterialSourcePixels?.right,
        expectedLitEmissiveColor2Right,
        4,
      )) {
    throw new Error(
      `D3D8 lit emissive COLOR2 material-source probe failed: ${
        JSON.stringify(d3d8LitEmissiveColor2MaterialSourceResult)
      }`,
    );
  }
  await page.locator("#viewport").screenshot({ path: d3d8LitEmissiveColor2MaterialSourceCanvasScreenshot });

  const d3d8LegacyTextureUploadResult = await page.evaluate(() => window.CnCPort.rpc("d3d8LegacyTextureUpload"));
  const legacyPerFormat = d3d8LegacyTextureUploadResult.perFormat ?? [];
  const legacyNames = legacyPerFormat.map((entry) => entry.name).join(",");
  const legacySamples = legacyPerFormat.map((entry) => (entry.browser?.samplePixel ?? []).join(",")).join("|");
  const legacyDecoded = legacyPerFormat.map((entry) => (entry.browser?.legacySamplePixel ?? []).join(",")).join("|");
  if (!d3d8LegacyTextureUploadResult.ok
      || d3d8LegacyTextureUploadResult.probe?.source !== "browser_d3d8_legacy_texture_upload_probe"
      || d3d8LegacyTextureUploadResult.probe?.calls?.createTexture !== 3
      || d3d8LegacyTextureUploadResult.probe?.calls?.textureLockRect !== 3
      || d3d8LegacyTextureUploadResult.probe?.calls?.textureUnlockRect !== 3
      || d3d8LegacyTextureUploadResult.probe?.calls?.browserTextureCreate !== 3
      || d3d8LegacyTextureUploadResult.probe?.calls?.browserTextureUpdate !== 3
      || d3d8LegacyTextureUploadResult.probe?.calls?.browserTextureRelease !== 3
      || legacyNames !== "A8,L8,A8L8"
      || legacySamples !== "64,0,0,255|85,0,0,255|51,119,0,255"
      || legacyDecoded !== "64|85|51,119"
      || legacyPerFormat.some((entry) => entry.bytesPerPixel !== (entry.name === "A8L8" ? 2 : 1))
      || legacyPerFormat.some((entry) => entry.pitch !== 2 * entry.bytesPerPixel)
      || legacyPerFormat.some((entry) => entry.nativeOk !== true)
      || legacyPerFormat.some((entry) => entry.swizzleOk !== true)
      || legacyPerFormat.some((entry) => entry.samplePixelOk !== true)
      || legacyPerFormat.some((entry) => entry.legacySampleOk !== true)
      || legacyPerFormat.some((entry) => entry.browser?.swizzle?.semantic !== (entry.name === "A8L8" ? "luminanceAlpha" : entry.name === "L8" ? "luminance" : "alpha"))
      || d3d8LegacyTextureUploadResult.browserDelta?.creates !== 3
      || d3d8LegacyTextureUploadResult.browserDelta?.updates !== 3
      || d3d8LegacyTextureUploadResult.browserDelta?.releases !== 3
      || d3d8LegacyTextureUploadResult.browserProbe?.live !== 0) {
    throw new Error(`D3D8 legacy texture upload probe failed: ${JSON.stringify(d3d8LegacyTextureUploadResult)}`);
  }

  const d3d8LegacyTextureDrawResult = await page.evaluate(() => window.CnCPort.rpc("d3d8LegacyTextureDraw"));
  const legacyDrawCases = d3d8LegacyTextureDrawResult.cases ?? [];
  const legacyDrawNames = legacyDrawCases.map((entry) => entry.probe?.caseName).join(",");
  const legacyDrawCenters = legacyDrawCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  const legacyDrawSemantics = legacyDrawCases.map((entry) => entry.legacyUpload?.semantic).join(",");
  const legacyDrawModes = legacyDrawCases.map((entry) => entry.browserProbe?.texture0?.semanticMode).join(",");
  if (!d3d8LegacyTextureDrawResult.ok
      || legacyDrawCases.length !== 3
      || legacyDrawNames !== "A8AlphaBlend,L8Luminance,A8L8LuminanceAlpha"
      || legacyDrawCenters !== "128,128,128,255|102,102,102,255|128,128,128,255"
      || legacyDrawSemantics !== "alpha,luminance,luminanceAlpha"
      || legacyDrawModes !== "1,2,3"
      || legacyDrawCases.some((entry) => entry.probe?.source !== "browser_d3d8_legacy_texture_draw_probe")
      || legacyDrawCases.some((entry) => entry.probe?.calls?.createTexture !== 1)
      || legacyDrawCases.some((entry) => entry.probe?.calls?.textureLockRect !== 1)
      || legacyDrawCases.some((entry) => entry.probe?.calls?.textureUnlockRect !== 1)
      || legacyDrawCases.some((entry) => entry.probe?.calls?.browserTextureBind !== 1)
      || legacyDrawCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 14)
      || legacyDrawCases.some((entry) => entry.browserProbe?.texture0?.sampled !== true)
      || legacyDrawCases.some((entry) => entry.browserProbe?.texture0?.semantic !== entry.legacyUpload?.semantic)
      || legacyDrawCases.some((entry) => entry.browserProbe?.texture0?.combiner?.supported !== true)
      || legacyDrawCases.some((entry) => entry.browserProbe?.texture0?.sampler?.supported !== true)
      || legacyDrawCases.some((entry) => entry.centerPixelOk !== true)
      || legacyDrawCases.some((entry) => entry.swizzleOk !== true)
      || legacyDrawCases.some((entry) => entry.rawSampleOk !== true)
      || legacyDrawCases.some((entry) => entry.textureDelta?.creates !== 1)
      || legacyDrawCases.some((entry) => entry.textureDelta?.updates !== 1)
      || legacyDrawCases.some((entry) => entry.textureDelta?.binds !== 1)
      || legacyDrawCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)
      || legacyDrawCases.some((entry) => entry.textureDelta?.releases !== 1)
      || legacyDrawCases.some((entry) => entry.textureDelta?.samplerApplications !== 1)) {
    throw new Error(`D3D8 legacy texture draw probe failed: ${JSON.stringify(d3d8LegacyTextureDrawResult)}`);
  }

  const d3d8DxtTextureDrawResult = await page.evaluate(() => window.CnCPort.rpc("d3d8DxtTextureDraw"));
  const dxtDrawCases = d3d8DxtTextureDrawResult.cases ?? [];
  const dxtDrawNames = dxtDrawCases.map((entry) => entry.probe?.caseName).join(",");
  const dxtDrawCenters = dxtDrawCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  const dxtDrawBlocks = dxtDrawCases.map((entry) => entry.lastUpdate?.blockBytes).join(",");
  const dxtDrawStorages = dxtDrawCases.map((entry) => entry.lastUpdate?.storage).join(",");
  const dxtDrawAliases = dxtDrawCases.map((entry) => entry.lastUpdate?.aliasedStorage ?? "").join(",");
  const dxtDrawPremultipliedAlpha = dxtDrawCases.map((entry) => entry.lastUpdate?.premultipliedAlpha === true ? "1" : "0").join(",");
  if (!d3d8DxtTextureDrawResult.ok
      || d3d8DxtTextureDrawResult.s3tc !== true
      || dxtDrawCases.length !== 5
      || dxtDrawNames !== "DXT1Red,DXT3AlphaRed,DXT5AlphaRed,DXT2PremultipliedAlphaRed,DXT4PremultipliedAlphaRed"
      || dxtDrawCenters !== "255,0,0,255|136,0,0,255|128,0,0,255|136,0,0,255|128,0,0,255"
      || dxtDrawBlocks !== "8,16,16,16,16"
      || dxtDrawStorages !== "dxt1,dxt3,dxt5,dxt2,dxt4"
      || dxtDrawAliases !== ",,,dxt3,dxt5"
      || dxtDrawPremultipliedAlpha !== "0,0,0,1,1"
      || dxtDrawCases.some((entry) => entry.probe?.source !== "browser_d3d8_dxt_texture_draw_probe")
      || dxtDrawCases.some((entry) => entry.probe?.calls?.createTexture !== 1)
      || dxtDrawCases.some((entry) => entry.probe?.calls?.textureLockRect !== 2)
      || dxtDrawCases.some((entry) => entry.probe?.calls?.textureUnlockRect !== 1)
      || dxtDrawCases.some((entry) => entry.probe?.results?.partialLock === 0)
      || dxtDrawCases.some((entry) => entry.probe?.calls?.browserTextureUpdate !== 1)
      || dxtDrawCases.some((entry) => entry.probe?.calls?.browserTextureBind !== 1)
      || dxtDrawCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 14)
      || dxtDrawCases.some((entry) => entry.lastUpdate?.compressed !== true)
      || dxtDrawCases.some((entry) => entry.lastUpdate?.byteSize !== entry.probe?.texture?.byteSize)
      || dxtDrawCases.some((entry) => entry.browserProbe?.texture0?.sampled !== true)
      || dxtDrawCases.some((entry) => entry.browserProbe?.texture0?.combiner?.supported !== true)
      || dxtDrawCases.some((entry) => entry.centerPixelOk !== true)
      || dxtDrawCases.some((entry) => entry.textureDelta?.creates !== 1)
      || dxtDrawCases.some((entry) => entry.textureDelta?.updates !== 1)
      || dxtDrawCases.some((entry) => entry.textureDelta?.unsupportedUpdates !== 0)
      || dxtDrawCases.some((entry) => entry.textureDelta?.samplerApplications !== 1)) {
    throw new Error(`D3D8 DXT texture draw probe failed: ${JSON.stringify(d3d8DxtTextureDrawResult)}`);
  }

  const aaBoxResult = await page.evaluate(() => window.CnCPort.rpc("ww3dAABox"));
  // AABoxRenderObjClass uses VertexFormatXYZNDUV2: 8 vertices at stride 44,
  // 12 triangles, 36 16-bit indices, and captures world/view/projection
  // transforms before the browser WebGL2 draw through persistent GL buffers.
  if (!aaBoxResult.ok
      || aaBoxResult.probe?.source !== "ww3d_aabox_render_probe"
      || aaBoxResult.probe?.calls?.drawIndexed < 1
      || aaBoxResult.probe?.calls?.browserBufferCreate < 2
      || aaBoxResult.probe?.calls?.browserBufferUpdate < 2
      || aaBoxResult.probe?.calls?.setTransform < 3
      || aaBoxResult.probe?.draw?.primitiveType !== 4
      || aaBoxResult.probe?.draw?.vertexCount !== 8
      || aaBoxResult.probe?.draw?.primitiveCount !== 12
      || aaBoxResult.probe?.draw?.vertexBufferId <= 0
      || aaBoxResult.probe?.draw?.indexBufferId <= 0
      || aaBoxResult.probe?.draw?.transformMask !== 7
      || aaBoxResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || aaBoxResult.browserProbe?.vertexStride !== 44
      || aaBoxResult.browserProbe?.indexCount !== 36
      || aaBoxResult.browserProbe?.vertexBufferId <= 0
      || aaBoxResult.browserProbe?.indexBufferId <= 0
      || aaBoxResult.browserProbe?.usedPersistentBuffers !== true
      || aaBoxResult.browserProbe?.usedTransforms !== true
      || aaBoxResult.probe?.draw?.renderState?.cullMode !== 2
      || aaBoxResult.probe?.draw?.renderState?.zEnable !== 1
      || aaBoxResult.probe?.draw?.renderState?.zWriteEnable !== 0
      || aaBoxResult.probe?.draw?.renderState?.zFunc !== 4
      || aaBoxResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || aaBoxResult.probe?.draw?.renderState?.srcBlend !== 5
      || aaBoxResult.probe?.draw?.renderState?.destBlend !== 6
      || aaBoxResult.probe?.draw?.renderState?.blendOp !== 1
      || aaBoxResult.probe?.draw?.renderState?.alphaTestEnable !== 0
      || aaBoxResult.probe?.draw?.renderState?.alphaFunc !== 4
      || aaBoxResult.probe?.draw?.renderState?.colorWriteEnable !== 15
      || aaBoxResult.browserProbe?.renderState?.cullMode !== 2
      || aaBoxResult.browserProbe?.renderState?.zEnable !== 1
      || aaBoxResult.browserProbe?.renderState?.zWriteEnable !== 0
      || aaBoxResult.browserProbe?.renderState?.zFunc !== 4
      || aaBoxResult.browserProbe?.renderState?.alphaBlendEnable !== 1
      || aaBoxResult.browserProbe?.renderState?.srcBlend !== 5
      || aaBoxResult.browserProbe?.renderState?.destBlend !== 6
      || aaBoxResult.browserProbe?.renderState?.blendOp !== 1
      || aaBoxResult.browserProbe?.renderState?.alphaTestEnable !== 0
      || aaBoxResult.browserProbe?.renderState?.alphaFunc !== 4
      || aaBoxResult.browserProbe?.renderState?.colorWriteEnable !== 15
      || aaBoxResult.browserProbe?.appliedRenderState?.cull?.enabled !== true
      || aaBoxResult.browserProbe?.appliedRenderState?.cull?.frontFace !== 2304
      || aaBoxResult.browserProbe?.appliedRenderState?.cull?.cullFace !== 1029
      || aaBoxResult.browserProbe?.appliedRenderState?.depth?.enabled !== true
      || aaBoxResult.browserProbe?.appliedRenderState?.depth?.mask !== false
      || aaBoxResult.browserProbe?.appliedRenderState?.depth?.func !== 515
      || aaBoxResult.browserProbe?.appliedRenderState?.blend?.enabled !== true
      || aaBoxResult.browserProbe?.appliedRenderState?.blend?.src !== 770
      || aaBoxResult.browserProbe?.appliedRenderState?.blend?.dest !== 771
      || aaBoxResult.browserProbe?.appliedRenderState?.blend?.equation !== 32774
      || aaBoxResult.browserProbe?.appliedRenderState?.alphaTest?.enabled !== false
      || aaBoxResult.browserProbe?.appliedRenderState?.colorWrite?.r !== true
      || aaBoxResult.browserProbe?.appliedRenderState?.colorWrite?.g !== true
      || aaBoxResult.browserProbe?.appliedRenderState?.colorWrite?.b !== true
      || aaBoxResult.browserProbe?.appliedRenderState?.colorWrite?.a !== true
      || aaBoxResult.state?.graphics?.d3d8Buffers?.creates < 2
      || aaBoxResult.state?.graphics?.d3d8Buffers?.updates < 2
      || !pixelHasColor(aaBoxResult.browserProbe?.centerPixel)
      || !pixelHasColor(aaBoxResult.screenshot?.centerPixel)) {
    throw new Error(`WW3D AABox WebGL2 draw probe failed: ${JSON.stringify(aaBoxResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dAABoxCanvasScreenshot });

  const sceneCameraResult = await page.evaluate(() => window.CnCPort.rpc("ww3dSceneCamera"));
  const sceneViewport = sceneCameraResult.probe?.viewport ?? {};
  const sceneBrowserViewport = sceneCameraResult.browserProbe?.viewport ?? {};
  const expectedSceneViewportBox = expectedD3D8ViewportGlBox(sceneViewport, sceneBrowserViewport);
  if (!sceneCameraResult.ok
      || sceneCameraResult.probe?.source !== "ww3d_scene_camera_probe"
      || sceneCameraResult.probe?.results?.cameraCreated !== true
      || sceneCameraResult.probe?.results?.sceneCreated !== true
      || sceneCameraResult.probe?.results?.renderObjectCreated !== true
      || sceneCameraResult.probe?.results?.objectAdded !== true
      || sceneCameraResult.probe?.calls?.drawIndexed < 1
      || sceneCameraResult.probe?.calls?.browserBufferCreate < 2
      || sceneCameraResult.probe?.calls?.browserBufferUpdate < 2
      || sceneCameraResult.probe?.calls?.setTransform < 3
      || sceneCameraResult.probe?.calls?.setViewport < 1
      || sceneViewport.x !== 0
      || sceneViewport.y !== 0
      || sceneViewport.width <= 0
      || sceneViewport.height <= 0
      || Math.abs((sceneViewport.minZ ?? -1) - 0) > 0.00001
      || Math.abs((sceneViewport.maxZ ?? -1) - 1) > 0.00001
      || sceneCameraResult.probe?.draw?.primitiveType !== 4
      || sceneCameraResult.probe?.draw?.vertexCount !== 8
      || sceneCameraResult.probe?.draw?.primitiveCount !== 12
      || sceneCameraResult.probe?.draw?.vertexBufferId <= 0
      || sceneCameraResult.probe?.draw?.indexBufferId <= 0
      || sceneCameraResult.probe?.draw?.transformMask !== 7
      || sceneCameraResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || sceneCameraResult.browserProbe?.vertexStride !== 44
      || sceneCameraResult.browserProbe?.indexCount !== 36
      || sceneCameraResult.browserProbe?.usedPersistentBuffers !== true
      || sceneCameraResult.browserProbe?.usedTransforms !== true
      || sceneCameraResult.browserProbe?.renderState?.cullMode !== 2
      || sceneCameraResult.browserProbe?.renderState?.zEnable !== 1
      || sceneCameraResult.browserProbe?.renderState?.zWriteEnable !== 0
      || sceneCameraResult.browserProbe?.renderState?.zFunc !== 4
      || sceneCameraResult.browserProbe?.renderState?.alphaBlendEnable !== 1
      || sceneBrowserViewport.source !== "browser_d3d8_viewport"
      || sceneBrowserViewport.reason !== "draw"
      || sceneBrowserViewport.d3d?.x !== sceneViewport.x
      || sceneBrowserViewport.d3d?.y !== sceneViewport.y
      || sceneBrowserViewport.d3d?.width !== sceneViewport.width
      || sceneBrowserViewport.d3d?.height !== sceneViewport.height
      || sceneBrowserViewport.renderTarget?.width <= 0
      || sceneBrowserViewport.renderTarget?.height <= 0
      || sceneBrowserViewport.gl?.x !== expectedSceneViewportBox[0]
      || sceneBrowserViewport.gl?.y !== expectedSceneViewportBox[1]
      || sceneBrowserViewport.gl?.width !== expectedSceneViewportBox[2]
      || sceneBrowserViewport.gl?.height !== expectedSceneViewportBox[3]
      || Math.abs((sceneBrowserViewport.gl?.minZ ?? -1) - 0) > 0.00001
      || Math.abs((sceneBrowserViewport.gl?.maxZ ?? -1) - 1) > 0.00001
      || !pixelHasColor(sceneCameraResult.browserProbe?.centerPixel)
      || !pixelHasColor(sceneCameraResult.screenshot?.centerPixel)) {
    throw new Error(`WW3D scene/camera probe failed: ${JSON.stringify(sceneCameraResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dSceneCameraCanvasScreenshot });

  const rtsSceneResult = await page.evaluate(() => window.CnCPort.rpc("ww3dRTSScene"));
  if (!rtsSceneResult.ok
      || rtsSceneResult.probe?.source !== "ww3d_rts_scene_probe"
      || rtsSceneResult.probe?.scene?.type !== "RTS3DScene"
      || rtsSceneResult.probe?.scene?.path !== "WW3D::Render(scene,camera)"
      || rtsSceneResult.probe?.scene?.shadowFlushes < 2
      || rtsSceneResult.probe?.scene?.particleFlushes < 1
      || rtsSceneResult.probe?.results?.sceneCreated !== true
      || rtsSceneResult.probe?.results?.cameraCreated !== true
      || rtsSceneResult.probe?.results?.renderObjectCreated !== true
      || rtsSceneResult.probe?.results?.objectAdded !== true
      || rtsSceneResult.probe?.results?.objectVisibleAfterRender !== true
      || rtsSceneResult.probe?.calls?.drawIndexed < 1
      || rtsSceneResult.probe?.calls?.browserBufferCreate < 2
      || rtsSceneResult.probe?.calls?.browserBufferUpdate < 2
      || rtsSceneResult.probe?.calls?.setTransform < 3
      || rtsSceneResult.probe?.draw?.primitiveType !== 4
      || rtsSceneResult.probe?.draw?.vertexCount !== 8
      || rtsSceneResult.probe?.draw?.primitiveCount !== 12
      || rtsSceneResult.probe?.draw?.vertexBufferId <= 0
      || rtsSceneResult.probe?.draw?.indexBufferId <= 0
      || rtsSceneResult.probe?.draw?.transformMask !== 7
      || rtsSceneResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || rtsSceneResult.browserProbe?.vertexStride !== 44
      || rtsSceneResult.browserProbe?.indexCount !== 36
      || rtsSceneResult.browserProbe?.usedPersistentBuffers !== true
      || rtsSceneResult.browserProbe?.usedTransforms !== true
      || !pixelHasColor(rtsSceneResult.browserProbe?.centerPixel)
      || !pixelHasColor(rtsSceneResult.screenshot?.centerPixel)) {
    throw new Error(`WW3D RTS3DScene probe failed: ${JSON.stringify(rtsSceneResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dRTSSceneCanvasScreenshot });

  const displaySceneResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayScene"));
  if (!displaySceneResult.ok
      || displaySceneResult.probe?.source !== "ww3d_display_scene_probe"
      || displaySceneResult.probe?.display?.path !== "W3DDisplay::m_3DScene"
      || displaySceneResult.probe?.display?.width !== 800
      || displaySceneResult.probe?.display?.height !== 600
      || displaySceneResult.probe?.display?.bitDepth !== 32
      || displaySceneResult.probe?.display?.windowed !== true
      || displaySceneResult.probe?.scene?.type !== "RTS3DScene"
      || displaySceneResult.probe?.scene?.path !== "WW3D::Render(W3DDisplay::m_3DScene,camera)"
      || displaySceneResult.probe?.scene?.shadowFlushes < 2
      || displaySceneResult.probe?.scene?.particleFlushes < 1
      || displaySceneResult.probe?.results?.displayPrepared !== true
      || displaySceneResult.probe?.results?.sceneOwned !== true
      || displaySceneResult.probe?.results?.sceneCreated !== true
      || displaySceneResult.probe?.results?.scene2DCreated !== true
      || displaySceneResult.probe?.results?.interfaceSceneCreated !== true
      || displaySceneResult.probe?.results?.lightCreated !== true
      || displaySceneResult.probe?.results?.timeOfDayApplied !== true
      || displaySceneResult.probe?.results?.cameraCreated !== true
      || displaySceneResult.probe?.results?.renderObjectCreated !== true
      || displaySceneResult.probe?.results?.objectAdded !== true
      || displaySceneResult.probe?.results?.objectVisibleAfterRender !== true
      || displaySceneResult.probe?.calls?.drawIndexed < 1
      || displaySceneResult.probe?.calls?.browserBufferCreate < 2
      || displaySceneResult.probe?.calls?.browserBufferUpdate < 2
      || displaySceneResult.probe?.calls?.setTransform < 3
      || displaySceneResult.probe?.draw?.primitiveType !== 4
      || displaySceneResult.probe?.draw?.vertexCount !== 8
      || displaySceneResult.probe?.draw?.primitiveCount !== 12
      || displaySceneResult.probe?.draw?.vertexBufferId <= 0
      || displaySceneResult.probe?.draw?.indexBufferId <= 0
      || displaySceneResult.probe?.draw?.transformMask !== 7
      || displaySceneResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displaySceneResult.browserProbe?.vertexStride !== 44
      || displaySceneResult.browserProbe?.indexCount !== 36
      || displaySceneResult.browserProbe?.usedPersistentBuffers !== true
      || displaySceneResult.browserProbe?.usedTransforms !== true
      || !pixelHasColor(displaySceneResult.browserProbe?.centerPixel)
      || !pixelHasColor(displaySceneResult.screenshot?.centerPixel)) {
    throw new Error(`WW3DDisplay scene probe failed: ${JSON.stringify(displaySceneResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplaySceneCanvasScreenshot });

  const render2DResult = await page.evaluate(() => window.CnCPort.rpc("ww3dRender2DTexturedQuad"));
  if (!render2DResult.ok
      || render2DResult.probe?.source !== "ww3d_render2d_textured_quad_probe"
      || render2DResult.probe?.calls?.drawIndexed < 1
      || render2DResult.probe?.calls?.browserTextureCreate < 1
      || render2DResult.probe?.calls?.browserTextureUpdate < 1
      || render2DResult.probe?.calls?.browserTextureBind < 2
      || render2DResult.probe?.calls?.browserTextureRelease < 1
      || render2DResult.probe?.calls?.browserBufferCreate < 2
      || render2DResult.probe?.calls?.browserBufferUpdate < 2
      || render2DResult.probe?.draw?.primitiveType !== 4
      || render2DResult.probe?.draw?.vertexCount !== 4
      || render2DResult.probe?.draw?.primitiveCount !== 2
      || render2DResult.probe?.draw?.vertexStride !== 44
      || render2DResult.probe?.draw?.vertexBufferId <= 0
      || render2DResult.probe?.draw?.indexBufferId <= 0
      || render2DResult.probe?.draw?.transformMask !== 7
      || render2DResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || render2DResult.probe?.draw?.renderState?.srcBlend !== 5
      || render2DResult.probe?.draw?.renderState?.destBlend !== 6
      || render2DResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 4
      || render2DResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || render2DResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || render2DResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || render2DResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || render2DResult.browserProbe?.vertexStride !== 44
      || render2DResult.browserProbe?.indexCount !== 6
      || render2DResult.browserProbe?.usedPersistentBuffers !== true
      || render2DResult.browserProbe?.usedTransforms !== true
      || render2DResult.browserProbe?.usedIdentityClipSpace !== true
      || render2DResult.browserProbe?.appliedRenderState?.cull?.invertWinding !== true
      || render2DResult.browserProbe?.appliedRenderState?.cull?.cullFace !== 1028
      || render2DResult.browserProbe?.texture0?.id !== render2DResult.probe?.texture?.id
      || render2DResult.browserProbe?.texture0?.ready !== true
      || render2DResult.browserProbe?.texture0?.sampled !== true
      || render2DResult.browserProbe?.texture0?.texCoordOffset !== 28
      || render2DResult.browserProbe?.texture0?.combiner?.opName !== "modulate"
      || render2DResult.browserProbe?.texture0?.combiner?.arg1Name !== "texture"
      || render2DResult.browserProbe?.texture0?.combiner?.arg2Name !== "diffuse"
      || render2DResult.browserProbe?.texture0?.combiner?.supported !== true
      || render2DResult.browserProbe?.texture0?.sampler?.supported !== true
      || !pixelLooksRed(render2DResult.browserProbe?.centerPixel)
      || !pixelLooksRed(render2DResult.screenshot?.centerPixel)
      || render2DResult.textureDelta?.creates < 1
      || render2DResult.textureDelta?.updates < 1
      || render2DResult.textureDelta?.binds < 1
      || render2DResult.textureDelta?.releases < 1) {
    throw new Error(`WW3D Render2D textured quad probe failed: ${JSON.stringify(render2DResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dRender2DCanvasScreenshot });

  const render2DSentenceResult = await page.evaluate(() => window.CnCPort.rpc("ww3dRender2DSentence"));
  if (!render2DSentenceResult.ok
      || render2DSentenceResult.probe?.source !== "ww3d_render2d_sentence_probe"
      || render2DSentenceResult.probe?.font?.created !== true
      || (render2DSentenceResult.probe?.font?.charHeight ?? 0) <= 0
      || render2DSentenceResult.probe?.results?.sentenceBuilt !== true
      || render2DSentenceResult.probe?.results?.sentenceDrawn !== true
      || render2DSentenceResult.probe?.results?.sentenceRendered !== true
      || (render2DSentenceResult.probe?.extents?.text?.x ?? 0) <= 0
      || (render2DSentenceResult.probe?.extents?.text?.y ?? 0) <= 0
      || (render2DSentenceResult.probe?.calls?.copyRects ?? 0) < 1
      || (render2DSentenceResult.probe?.calls?.browserTextureCreate ?? 0) < 1
      || (render2DSentenceResult.probe?.calls?.browserTextureUpdate ?? 0) < 1
      || (render2DSentenceResult.probe?.calls?.browserTextureBind ?? 0) < 1
      || (render2DSentenceResult.probe?.calls?.browserBufferCreate ?? 0) < 2
      || (render2DSentenceResult.probe?.calls?.browserBufferUpdate ?? 0) < 2
      || render2DSentenceResult.probe?.copyRects?.format !== 26
      || (render2DSentenceResult.probe?.copyRects?.uploadedTextureId ?? 0) <= 0
      || render2DSentenceResult.probe?.draw?.primitiveType !== 4
      || (render2DSentenceResult.probe?.draw?.vertexCount ?? 0) < 4
      || (render2DSentenceResult.probe?.draw?.primitiveCount ?? 0) < 2
      || render2DSentenceResult.probe?.draw?.vertexStride !== 44
      || render2DSentenceResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || render2DSentenceResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 4
      || render2DSentenceResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || render2DSentenceResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || render2DSentenceResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || render2DSentenceResult.browserProbe?.vertexStride !== 44
      || render2DSentenceResult.browserProbe?.usedPersistentBuffers !== true
      || render2DSentenceResult.browserProbe?.usedTransforms !== true
      || render2DSentenceResult.browserProbe?.usedIdentityClipSpace !== true
      || render2DSentenceResult.browserProbe?.texture0?.id !==
        render2DSentenceResult.probe?.copyRects?.uploadedTextureId
      || render2DSentenceResult.browserProbe?.texture0?.ready !== true
      || render2DSentenceResult.browserProbe?.texture0?.sampled !== true
      || render2DSentenceResult.browserProbe?.texture0?.format !== 26
      || render2DSentenceResult.browserProbe?.texture0?.combiner?.opName !== "modulate"
      || render2DSentenceResult.browserProbe?.texture0?.sampler?.supported !== true
      || (render2DSentenceResult.textRegion?.coloredPixelCount ?? 0) <= 16
      || (render2DSentenceResult.textRegion?.maxComponent ?? 0) <= 32
      || render2DSentenceResult.textureDelta?.creates < 1
      || render2DSentenceResult.textureDelta?.updates < 1
      || render2DSentenceResult.textureDelta?.binds < 1) {
    throw new Error(`WW3D Render2DSentence text probe failed: ${JSON.stringify(render2DSentenceResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dRender2DSentenceCanvasScreenshot });

  const displayStringResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayString"));
  if (!displayStringResult.ok
      || displayStringResult.probe?.source !== "ww3d_display_string_probe"
      || displayStringResult.probe?.font?.normalLoaded !== true
      || displayStringResult.probe?.font?.boldLoaded !== true
      || (displayStringResult.probe?.font?.normalHeight ?? 0) <= 0
      || (displayStringResult.probe?.font?.boldHeight ?? 0) <= 0
      || displayStringResult.probe?.results?.displayStringAllocated !== true
      || displayStringResult.probe?.results?.fontSet !== true
      || displayStringResult.probe?.results?.textSet !== true
      || displayStringResult.probe?.results?.sizeComputed !== true
      || displayStringResult.probe?.results?.drawCalled !== true
      || displayStringResult.probe?.textMetrics?.length !== 7
      || (displayStringResult.probe?.textMetrics?.width ?? 0) <= 0
      || (displayStringResult.probe?.textMetrics?.height ?? 0) <= 0
      || (displayStringResult.probe?.textMetrics?.widthViaChars ?? 0) <= 0
      || (displayStringResult.probe?.calls?.copyRects ?? 0) < 1
      || (displayStringResult.probe?.calls?.browserTextureCreate ?? 0) < 1
      || (displayStringResult.probe?.calls?.browserTextureUpdate ?? 0) < 1
      || (displayStringResult.probe?.calls?.browserTextureBind ?? 0) < 1
      || (displayStringResult.probe?.calls?.browserBufferCreate ?? 0) < 2
      || (displayStringResult.probe?.calls?.browserBufferUpdate ?? 0) < 2
      || displayStringResult.probe?.copyRects?.format !== 26
      || (displayStringResult.probe?.copyRects?.uploadedTextureId ?? 0) <= 0
      || displayStringResult.probe?.draw?.primitiveType !== 4
      || (displayStringResult.probe?.draw?.vertexCount ?? 0) < 8
      || (displayStringResult.probe?.draw?.primitiveCount ?? 0) < 4
      || displayStringResult.probe?.draw?.vertexStride !== 44
      || displayStringResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayStringResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 4
      || displayStringResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayStringResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayStringResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayStringResult.browserProbe?.vertexStride !== 44
      || displayStringResult.browserProbe?.usedPersistentBuffers !== true
      || displayStringResult.browserProbe?.usedTransforms !== true
      || displayStringResult.browserProbe?.usedIdentityClipSpace !== true
      || displayStringResult.browserProbe?.texture0?.id !==
        displayStringResult.probe?.copyRects?.uploadedTextureId
      || displayStringResult.browserProbe?.texture0?.ready !== true
      || displayStringResult.browserProbe?.texture0?.sampled !== true
      || displayStringResult.browserProbe?.texture0?.format !== 26
      || displayStringResult.browserProbe?.texture0?.combiner?.opName !== "modulate"
      || displayStringResult.browserProbe?.texture0?.sampler?.supported !== true
      || (displayStringResult.textRegion?.coloredPixelCount ?? 0) <= 16
      || (displayStringResult.textRegion?.maxComponent ?? 0) <= 32
      || displayStringResult.textureDelta?.creates < 1
      || displayStringResult.textureDelta?.updates < 1
      || displayStringResult.textureDelta?.binds < 1) {
    throw new Error(`WW3DDisplayString text probe failed: ${JSON.stringify(displayStringResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayStringCanvasScreenshot });

  const displayDrawImageResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayDrawImage"));
  if (!displayDrawImageResult.ok
      || displayDrawImageResult.probe?.source !== "ww3d_display_drawimage_probe"
      || displayDrawImageResult.probe?.results?.displayAllocated !== true
      || displayDrawImageResult.probe?.results?.displaySetup !== true
      || displayDrawImageResult.probe?.results?.imageConfigured !== true
      || displayDrawImageResult.probe?.results?.drawImageCalled !== true
      || displayDrawImageResult.probe?.image?.rawTexture !== true
      || displayDrawImageResult.probe?.image?.status !== 2
      || displayDrawImageResult.probe?.image?.width !== 200
      || displayDrawImageResult.probe?.image?.height !== 160
      || displayDrawImageResult.probe?.calls?.drawIndexed < 1
      || displayDrawImageResult.probe?.calls?.browserTextureCreate < 1
      || displayDrawImageResult.probe?.calls?.browserTextureUpdate < 1
      || displayDrawImageResult.probe?.calls?.browserTextureBind < 2
      || displayDrawImageResult.probe?.calls?.browserTextureRelease < 1
      || displayDrawImageResult.probe?.draw?.primitiveType !== 4
      || displayDrawImageResult.probe?.draw?.vertexCount !== 4
      || displayDrawImageResult.probe?.draw?.primitiveCount !== 2
      || displayDrawImageResult.probe?.draw?.vertexStride !== 44
      || displayDrawImageResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayDrawImageResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 4
      || displayDrawImageResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayDrawImageResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayDrawImageResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayDrawImageResult.browserProbe?.usedPersistentBuffers !== true
      || displayDrawImageResult.browserProbe?.usedTransforms !== true
      || displayDrawImageResult.browserProbe?.usedIdentityClipSpace !== true
      || displayDrawImageResult.browserProbe?.appliedRenderState?.cull?.invertWinding !== true
      || displayDrawImageResult.browserProbe?.appliedRenderState?.cull?.cullFace !== 1028
      || displayDrawImageResult.browserProbe?.texture0?.id !== displayDrawImageResult.probe?.texture?.id
      || displayDrawImageResult.browserProbe?.texture0?.ready !== true
      || displayDrawImageResult.browserProbe?.texture0?.sampled !== true
      || displayDrawImageResult.browserProbe?.texture0?.combiner?.opName !== "modulate"
      || displayDrawImageResult.browserProbe?.texture0?.combiner?.supported !== true
      || displayDrawImageResult.browserProbe?.texture0?.sampler?.supported !== true
      || !pixelLooksRed(displayDrawImageResult.browserProbe?.centerPixel)
      || !pixelLooksRed(displayDrawImageResult.screenshot?.centerPixel)
      || displayDrawImageResult.textureDelta?.creates < 1
      || displayDrawImageResult.textureDelta?.updates < 1
      || displayDrawImageResult.textureDelta?.binds < 1
      || displayDrawImageResult.textureDelta?.releases < 1) {
    throw new Error(`WW3DDisplay drawImage probe failed: ${JSON.stringify(displayDrawImageResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayDrawImageCanvasScreenshot });

  const displayDrawImageAdditiveResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayDrawImageAdditive"));
  if (!displayDrawImageAdditiveResult.ok
      || displayDrawImageAdditiveResult.probe?.source !== "ww3d_display_drawimage_additive_probe"
      || displayDrawImageAdditiveResult.probe?.results?.displayAllocated !== true
      || displayDrawImageAdditiveResult.probe?.results?.displaySetup !== true
      || displayDrawImageAdditiveResult.probe?.results?.imageConfigured !== true
      || displayDrawImageAdditiveResult.probe?.results?.drawImageCalled !== true
      || displayDrawImageAdditiveResult.probe?.display?.path !== "W3DDisplay::drawImage"
      || displayDrawImageAdditiveResult.probe?.display?.mode !== "DRAW_IMAGE_ADDITIVE"
      || displayDrawImageAdditiveResult.probe?.image?.rawTexture !== true
      || displayDrawImageAdditiveResult.probe?.image?.status !== 2
      || displayDrawImageAdditiveResult.probe?.image?.width !== 200
      || displayDrawImageAdditiveResult.probe?.image?.height !== 160
      || displayDrawImageAdditiveResult.probe?.calls?.drawIndexed < 1
      || displayDrawImageAdditiveResult.probe?.calls?.browserTextureCreate < 1
      || displayDrawImageAdditiveResult.probe?.calls?.browserTextureUpdate < 1
      || displayDrawImageAdditiveResult.probe?.calls?.browserTextureBind < 2
      || displayDrawImageAdditiveResult.probe?.calls?.browserTextureRelease < 1
      || displayDrawImageAdditiveResult.probe?.draw?.primitiveType !== 4
      || displayDrawImageAdditiveResult.probe?.draw?.vertexCount !== 4
      || displayDrawImageAdditiveResult.probe?.draw?.primitiveCount !== 2
      || displayDrawImageAdditiveResult.probe?.draw?.vertexStride !== 44
      || displayDrawImageAdditiveResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayDrawImageAdditiveResult.probe?.draw?.renderState?.srcBlend !== 2
      || displayDrawImageAdditiveResult.probe?.draw?.renderState?.destBlend !== 2
      || displayDrawImageAdditiveResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 4
      || displayDrawImageAdditiveResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayDrawImageAdditiveResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayDrawImageAdditiveResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayDrawImageAdditiveResult.browserProbe?.usedPersistentBuffers !== true
      || displayDrawImageAdditiveResult.browserProbe?.usedTransforms !== true
      || displayDrawImageAdditiveResult.browserProbe?.usedIdentityClipSpace !== true
      || displayDrawImageAdditiveResult.browserProbe?.renderState?.srcBlend !== 2
      || displayDrawImageAdditiveResult.browserProbe?.renderState?.destBlend !== 2
      || displayDrawImageAdditiveResult.browserProbe?.texture0?.id !== displayDrawImageAdditiveResult.probe?.texture?.id
      || displayDrawImageAdditiveResult.browserProbe?.texture0?.ready !== true
      || displayDrawImageAdditiveResult.browserProbe?.texture0?.sampled !== true
      || displayDrawImageAdditiveResult.browserProbe?.texture0?.combiner?.opName !== "modulate"
      || displayDrawImageAdditiveResult.browserProbe?.texture0?.combiner?.supported !== true
      || displayDrawImageAdditiveResult.browserProbe?.texture0?.sampler?.supported !== true
      || !pixelLooksRed(displayDrawImageAdditiveResult.browserProbe?.centerPixel)
      || !pixelLooksRed(displayDrawImageAdditiveResult.additivePixels?.center)
      || !pixelLooksBlack(displayDrawImageAdditiveResult.additivePixels?.outside)
      || displayDrawImageAdditiveResult.textureDelta?.creates < 1
      || displayDrawImageAdditiveResult.textureDelta?.updates < 1
      || displayDrawImageAdditiveResult.textureDelta?.binds < 1
      || displayDrawImageAdditiveResult.textureDelta?.releases < 1) {
    throw new Error(`WW3DDisplay additive drawImage probe failed: ${JSON.stringify(displayDrawImageAdditiveResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayDrawImageAdditiveCanvasScreenshot });

  const displayDrawImageSolidResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayDrawImageSolid"));
  if (!displayDrawImageSolidResult.ok
      || displayDrawImageSolidResult.probe?.source !== "ww3d_display_drawimage_solid_probe"
      || displayDrawImageSolidResult.probe?.results?.displayAllocated !== true
      || displayDrawImageSolidResult.probe?.results?.displaySetup !== true
      || displayDrawImageSolidResult.probe?.results?.imageConfigured !== true
      || displayDrawImageSolidResult.probe?.results?.drawImageCalled !== true
      || displayDrawImageSolidResult.probe?.display?.path !== "W3DDisplay::drawImage"
      || displayDrawImageSolidResult.probe?.display?.mode !== "DRAW_IMAGE_SOLID"
      || displayDrawImageSolidResult.probe?.texture?.expectedSource?.[3] !== 64
      || displayDrawImageSolidResult.probe?.image?.rawTexture !== true
      || displayDrawImageSolidResult.probe?.image?.status !== 2
      || displayDrawImageSolidResult.probe?.image?.width !== 200
      || displayDrawImageSolidResult.probe?.image?.height !== 160
      || displayDrawImageSolidResult.probe?.calls?.drawIndexed < 1
      || displayDrawImageSolidResult.probe?.calls?.browserTextureCreate < 1
      || displayDrawImageSolidResult.probe?.calls?.browserTextureUpdate < 1
      || displayDrawImageSolidResult.probe?.calls?.browserTextureBind < 2
      || displayDrawImageSolidResult.probe?.calls?.browserTextureRelease < 1
      || displayDrawImageSolidResult.probe?.draw?.primitiveType !== 4
      || displayDrawImageSolidResult.probe?.draw?.vertexCount !== 4
      || displayDrawImageSolidResult.probe?.draw?.primitiveCount !== 2
      || displayDrawImageSolidResult.probe?.draw?.vertexStride !== 44
      || displayDrawImageSolidResult.probe?.draw?.renderState?.alphaBlendEnable !== 0
      || displayDrawImageSolidResult.probe?.draw?.renderState?.srcBlend !== 2
      || displayDrawImageSolidResult.probe?.draw?.renderState?.destBlend !== 1
      || displayDrawImageSolidResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 4
      || displayDrawImageSolidResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayDrawImageSolidResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayDrawImageSolidResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayDrawImageSolidResult.browserProbe?.usedPersistentBuffers !== true
      || displayDrawImageSolidResult.browserProbe?.usedTransforms !== true
      || displayDrawImageSolidResult.browserProbe?.usedIdentityClipSpace !== true
      || displayDrawImageSolidResult.browserProbe?.renderState?.alphaBlendEnable !== 0
      || displayDrawImageSolidResult.browserProbe?.renderState?.srcBlend !== 2
      || displayDrawImageSolidResult.browserProbe?.renderState?.destBlend !== 1
      || displayDrawImageSolidResult.browserProbe?.texture0?.id !== displayDrawImageSolidResult.probe?.texture?.id
      || displayDrawImageSolidResult.browserProbe?.texture0?.ready !== true
      || displayDrawImageSolidResult.browserProbe?.texture0?.sampled !== true
      || displayDrawImageSolidResult.browserProbe?.texture0?.combiner?.opName !== "modulate"
      || displayDrawImageSolidResult.browserProbe?.texture0?.combiner?.supported !== true
      || displayDrawImageSolidResult.browserProbe?.texture0?.sampler?.supported !== true
      || !pixelLooksRed(displayDrawImageSolidResult.browserProbe?.centerPixel)
      || !pixelLooksRed(displayDrawImageSolidResult.solidPixels?.center)
      || !pixelLooksBlueClear(displayDrawImageSolidResult.solidPixels?.outside)
      || displayDrawImageSolidResult.textureDelta?.creates < 1
      || displayDrawImageSolidResult.textureDelta?.updates < 1
      || displayDrawImageSolidResult.textureDelta?.binds < 1
      || displayDrawImageSolidResult.textureDelta?.releases < 1) {
    throw new Error(`WW3DDisplay solid drawImage probe failed: ${JSON.stringify(displayDrawImageSolidResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayDrawImageSolidCanvasScreenshot });

  const displayDrawImageGrayscaleResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayDrawImageGrayscale"));
  const expectedGrayscaleCenter = [117, 117, 117, 255];
  if (!displayDrawImageGrayscaleResult.ok
      || displayDrawImageGrayscaleResult.probe?.source !== "ww3d_display_drawimage_grayscale_probe"
      || displayDrawImageGrayscaleResult.probe?.results?.displayAllocated !== true
      || displayDrawImageGrayscaleResult.probe?.results?.displaySetup !== true
      || displayDrawImageGrayscaleResult.probe?.results?.imageConfigured !== true
      || displayDrawImageGrayscaleResult.probe?.results?.drawImageCalled !== true
      || displayDrawImageGrayscaleResult.probe?.display?.path !== "W3DDisplay::drawImage"
      || displayDrawImageGrayscaleResult.probe?.display?.mode !== "DRAW_IMAGE_GRAYSCALE"
      || displayDrawImageGrayscaleResult.probe?.texture?.expectedSource?.join(",") !== "64,128,192,255"
      || displayDrawImageGrayscaleResult.probe?.texture?.expectedCenter?.join(",") !== "117,117,117,255"
      || displayDrawImageGrayscaleResult.probe?.image?.rawTexture !== true
      || displayDrawImageGrayscaleResult.probe?.image?.status !== 2
      || displayDrawImageGrayscaleResult.probe?.image?.width !== 200
      || displayDrawImageGrayscaleResult.probe?.image?.height !== 160
      || displayDrawImageGrayscaleResult.probe?.calls?.drawIndexed < 1
      || displayDrawImageGrayscaleResult.probe?.calls?.setTextureStageState < 7
      || displayDrawImageGrayscaleResult.probe?.calls?.browserTextureCreate < 1
      || displayDrawImageGrayscaleResult.probe?.calls?.browserTextureUpdate < 1
      || displayDrawImageGrayscaleResult.probe?.calls?.browserTextureBind < 2
      || displayDrawImageGrayscaleResult.probe?.calls?.browserTextureRelease < 1
      || displayDrawImageGrayscaleResult.probe?.draw?.primitiveType !== 4
      || displayDrawImageGrayscaleResult.probe?.draw?.vertexCount !== 4
      || displayDrawImageGrayscaleResult.probe?.draw?.primitiveCount !== 2
      || displayDrawImageGrayscaleResult.probe?.draw?.vertexStride !== 44
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.alphaBlendEnable !== 0
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.srcBlend !== 2
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.destBlend !== 1
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureFactor !== 0x80a5ca8e
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 25
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg0 !== 35
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 35
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 24
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureStages?.[1]?.colorArg1 !== 1
      || displayDrawImageGrayscaleResult.probe?.draw?.renderState?.textureStages?.[1]?.colorArg2 !== 3
      || displayDrawImageGrayscaleResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayDrawImageGrayscaleResult.browserProbe?.usedPersistentBuffers !== true
      || displayDrawImageGrayscaleResult.browserProbe?.usedTransforms !== true
      || displayDrawImageGrayscaleResult.browserProbe?.usedIdentityClipSpace !== true
      || displayDrawImageGrayscaleResult.browserProbe?.renderState?.alphaBlendEnable !== 0
      || displayDrawImageGrayscaleResult.browserProbe?.renderState?.srcBlend !== 2
      || displayDrawImageGrayscaleResult.browserProbe?.renderState?.destBlend !== 1
      || displayDrawImageGrayscaleResult.browserProbe?.renderState?.textureFactor !== 0x80a5ca8e
      || displayDrawImageGrayscaleResult.browserProbe?.textureFactor !== 0x80a5ca8e
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.id !== displayDrawImageGrayscaleResult.probe?.texture?.id
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.ready !== true
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.sampled !== true
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.combiner?.opName !== "multiplyAdd"
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.combiner?.colorArg0 !== 35
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.combiner?.colorArg1 !== 2
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.combiner?.colorArg2 !== 35
      || displayDrawImageGrayscaleResult.browserProbe?.texture0?.combiner?.supported !== true
      || displayDrawImageGrayscaleResult.browserProbe?.stage1Combiner?.opName !== "dotProduct3"
      || displayDrawImageGrayscaleResult.browserProbe?.stage1Combiner?.colorArg1 !== 1
      || displayDrawImageGrayscaleResult.browserProbe?.stage1Combiner?.colorArg2 !== 3
      || displayDrawImageGrayscaleResult.browserProbe?.stage1Combiner?.supported !== true
      || !pixelsApproximatelyEqual(displayDrawImageGrayscaleResult.browserProbe?.centerPixel, expectedGrayscaleCenter, 2)
      || !pixelsApproximatelyEqual(displayDrawImageGrayscaleResult.grayscalePixels?.center, expectedGrayscaleCenter, 2)
      || !pixelLooksBlack(displayDrawImageGrayscaleResult.grayscalePixels?.outside)
      || displayDrawImageGrayscaleResult.textureDelta?.creates < 1
      || displayDrawImageGrayscaleResult.textureDelta?.updates < 1
      || displayDrawImageGrayscaleResult.textureDelta?.binds < 1
      || displayDrawImageGrayscaleResult.textureDelta?.releases < 1) {
    throw new Error(`WW3DDisplay grayscale drawImage probe failed: ${JSON.stringify(displayDrawImageGrayscaleResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayDrawImageGrayscaleCanvasScreenshot });

  const displayFillRectResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayFillRect"));
  if (!displayFillRectResult.ok
      || displayFillRectResult.probe?.source !== "ww3d_display_fillrect_probe"
      || displayFillRectResult.probe?.results?.displayAllocated !== true
      || displayFillRectResult.probe?.results?.displaySetup !== true
      || displayFillRectResult.probe?.results?.drawFillRectCalled !== true
      || displayFillRectResult.probe?.display?.path !== "W3DDisplay::drawFillRect"
      || displayFillRectResult.probe?.calls?.drawIndexed < 1
      || displayFillRectResult.probe?.calls?.browserBufferCreate < 2
      || displayFillRectResult.probe?.calls?.browserBufferUpdate < 2
      || displayFillRectResult.probe?.draw?.primitiveType !== 4
      || displayFillRectResult.probe?.draw?.vertexCount !== 4
      || displayFillRectResult.probe?.draw?.primitiveCount !== 2
      || displayFillRectResult.probe?.draw?.vertexStride !== 44
      || displayFillRectResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayFillRectResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 3
      || displayFillRectResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayFillRectResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayFillRectResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || displayFillRectResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayFillRectResult.browserProbe?.usedPersistentBuffers !== true
      || displayFillRectResult.browserProbe?.usedTransforms !== true
      || displayFillRectResult.browserProbe?.usedIdentityClipSpace !== true
      || displayFillRectResult.browserProbe?.vertexStride !== 44
      || displayFillRectResult.browserProbe?.indexCount !== 6
      || displayFillRectResult.browserProbe?.texture0?.sampled === true
      || !pixelLooksGreen(displayFillRectResult.browserProbe?.centerPixel)
      || !pixelLooksGreen(displayFillRectResult.screenshot?.centerPixel)) {
    throw new Error(`WW3DDisplay fill rect probe failed: ${JSON.stringify(displayFillRectResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayFillRectCanvasScreenshot });

  const displayLineResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayLine"));
  if (!displayLineResult.ok
      || displayLineResult.probe?.source !== "ww3d_display_line_probe"
      || displayLineResult.probe?.results?.displayAllocated !== true
      || displayLineResult.probe?.results?.displaySetup !== true
      || displayLineResult.probe?.results?.drawLineCalled !== true
      || displayLineResult.probe?.display?.path !== "W3DDisplay::drawLine"
      || displayLineResult.probe?.calls?.drawIndexed < 1
      || displayLineResult.probe?.calls?.browserBufferCreate < 2
      || displayLineResult.probe?.calls?.browserBufferUpdate < 2
      || displayLineResult.probe?.draw?.primitiveType !== 4
      || displayLineResult.probe?.draw?.vertexCount !== 4
      || displayLineResult.probe?.draw?.primitiveCount !== 2
      || displayLineResult.probe?.draw?.vertexStride !== 44
      || displayLineResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayLineResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 3
      || displayLineResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayLineResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayLineResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || displayLineResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayLineResult.browserProbe?.ok !== true
      || displayLineResult.browserProbe?.usedPersistentBuffers !== true
      || displayLineResult.browserProbe?.usedTransforms !== true
      || displayLineResult.browserProbe?.usedIdentityClipSpace !== true
      || displayLineResult.browserProbe?.vertexCount !== 4
      || displayLineResult.browserProbe?.vertexStride !== 44
      || displayLineResult.browserProbe?.indexCount !== 6
      || displayLineResult.browserProbe?.texture0?.sampled === true
      || !pixelLooksGreen(displayLineResult.browserProbe?.centerPixel)
      || !pixelLooksGreen(displayLineResult.screenshot?.centerPixel)
      || !pixelLooksGreen(displayLineResult.linePixels?.center)
      || !pixelLooksBlack(displayLineResult.linePixels?.above)
      || !pixelLooksBlack(displayLineResult.linePixels?.below)
      || !pixelLooksBlack(displayLineResult.linePixels?.leftOutside)
      || !pixelLooksBlack(displayLineResult.linePixels?.rightOutside)) {
    throw new Error(`WW3DDisplay line probe failed: ${JSON.stringify(displayLineResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayLineCanvasScreenshot });

  const displayLineGradientResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayLineGradient"));
  const expectedGradientLeft = displayLineGradientResult.probe?.draw?.expectedLeft ?? [241, 0, 14, 255];
  const expectedGradientCenter = displayLineGradientResult.probe?.draw?.expectedCenter ?? [128, 0, 128, 255];
  const expectedGradientRight = displayLineGradientResult.probe?.draw?.expectedRight ?? [14, 0, 241, 255];
  if (!displayLineGradientResult.ok
      || displayLineGradientResult.probe?.source !== "ww3d_display_line_gradient_probe"
      || displayLineGradientResult.probe?.results?.displayAllocated !== true
      || displayLineGradientResult.probe?.results?.displaySetup !== true
      || displayLineGradientResult.probe?.results?.drawLineGradientCalled !== true
      || displayLineGradientResult.probe?.display?.path !== "W3DDisplay::drawLine(two-color)"
      || displayLineGradientResult.probe?.calls?.drawIndexed < 1
      || displayLineGradientResult.probe?.calls?.browserBufferCreate < 2
      || displayLineGradientResult.probe?.calls?.browserBufferUpdate < 2
      || displayLineGradientResult.probe?.draw?.primitiveType !== 4
      || displayLineGradientResult.probe?.draw?.vertexCount !== 4
      || displayLineGradientResult.probe?.draw?.primitiveCount !== 2
      || displayLineGradientResult.probe?.draw?.vertexStride !== 44
      || displayLineGradientResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayLineGradientResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 3
      || displayLineGradientResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayLineGradientResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayLineGradientResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || displayLineGradientResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayLineGradientResult.browserProbe?.ok !== true
      || displayLineGradientResult.browserProbe?.usedPersistentBuffers !== true
      || displayLineGradientResult.browserProbe?.usedTransforms !== true
      || displayLineGradientResult.browserProbe?.usedIdentityClipSpace !== true
      || displayLineGradientResult.browserProbe?.vertexCount !== 4
      || displayLineGradientResult.browserProbe?.vertexStride !== 44
      || displayLineGradientResult.browserProbe?.indexCount !== 6
      || displayLineGradientResult.browserProbe?.texture0?.sampled === true
      || !pixelsApproximatelyEqual(displayLineGradientResult.browserProbe?.centerPixel, expectedGradientCenter, 16)
      || !pixelsApproximatelyEqual(displayLineGradientResult.screenshot?.centerPixel, expectedGradientCenter, 16)
      || !pixelsApproximatelyEqual(displayLineGradientResult.gradientPixels?.left, expectedGradientLeft, 16)
      || !pixelsApproximatelyEqual(displayLineGradientResult.gradientPixels?.center, expectedGradientCenter, 16)
      || !pixelsApproximatelyEqual(displayLineGradientResult.gradientPixels?.right, expectedGradientRight, 16)
      || !pixelLooksBlack(displayLineGradientResult.gradientPixels?.above)
      || !pixelLooksBlack(displayLineGradientResult.gradientPixels?.below)
      || !pixelLooksBlack(displayLineGradientResult.gradientPixels?.leftOutside)
      || !pixelLooksBlack(displayLineGradientResult.gradientPixels?.rightOutside)) {
    throw new Error(`WW3DDisplay gradient line probe failed: ${JSON.stringify(displayLineGradientResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayLineGradientCanvasScreenshot });

  const displayOpenRectResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayOpenRect"));
  if (!displayOpenRectResult.ok
      || displayOpenRectResult.probe?.source !== "ww3d_display_openrect_probe"
      || displayOpenRectResult.probe?.results?.displayAllocated !== true
      || displayOpenRectResult.probe?.results?.displaySetup !== true
      || displayOpenRectResult.probe?.results?.drawOpenRectCalled !== true
      || displayOpenRectResult.probe?.display?.path !== "W3DDisplay::drawOpenRect"
      || displayOpenRectResult.probe?.calls?.drawIndexed < 1
      || displayOpenRectResult.probe?.calls?.browserBufferCreate < 2
      || displayOpenRectResult.probe?.calls?.browserBufferUpdate < 2
      || displayOpenRectResult.probe?.draw?.primitiveType !== 4
      || displayOpenRectResult.probe?.draw?.vertexCount !== 16
      || displayOpenRectResult.probe?.draw?.primitiveCount !== 8
      || displayOpenRectResult.probe?.draw?.vertexStride !== 44
      || displayOpenRectResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayOpenRectResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 3
      || displayOpenRectResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayOpenRectResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayOpenRectResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || displayOpenRectResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayOpenRectResult.browserProbe?.usedPersistentBuffers !== true
      || displayOpenRectResult.browserProbe?.usedTransforms !== true
      || displayOpenRectResult.browserProbe?.usedIdentityClipSpace !== true
      || displayOpenRectResult.browserProbe?.vertexCount !== 16
      || displayOpenRectResult.browserProbe?.vertexStride !== 44
      || displayOpenRectResult.browserProbe?.indexCount !== 24
      || displayOpenRectResult.browserProbe?.texture0?.sampled === true
      || !pixelLooksYellow(displayOpenRectResult.borderPixels?.left)
      || !pixelLooksYellow(displayOpenRectResult.borderPixels?.top)
      || !pixelLooksYellow(displayOpenRectResult.borderPixels?.right)
      || !pixelLooksYellow(displayOpenRectResult.borderPixels?.bottom)
      || !pixelLooksBlack(displayOpenRectResult.borderPixels?.center)
      || !pixelLooksBlack(displayOpenRectResult.screenshot?.centerPixel)) {
    throw new Error(`WW3DDisplay open rect probe failed: ${JSON.stringify(displayOpenRectResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayOpenRectCanvasScreenshot });

  const displayRectClockResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayRectClock"));
  if (!displayRectClockResult.ok
      || displayRectClockResult.probe?.source !== "ww3d_display_rectclock_probe"
      || displayRectClockResult.probe?.results?.displayAllocated !== true
      || displayRectClockResult.probe?.results?.displaySetup !== true
      || displayRectClockResult.probe?.results?.drawRectClockCalled !== true
      || displayRectClockResult.probe?.display?.path !== "W3DDisplay::drawRectClock"
      || displayRectClockResult.probe?.display?.clock?.percent !== 88
      || displayRectClockResult.probe?.calls?.drawIndexed < 1
      || displayRectClockResult.probe?.calls?.browserBufferCreate < 2
      || displayRectClockResult.probe?.calls?.browserBufferUpdate < 2
      || displayRectClockResult.probe?.draw?.primitiveType !== 4
      || displayRectClockResult.probe?.draw?.vertexCount !== 14
      || displayRectClockResult.probe?.draw?.primitiveCount !== 6
      || displayRectClockResult.probe?.draw?.vertexStride !== 44
      || displayRectClockResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayRectClockResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 3
      || displayRectClockResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayRectClockResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayRectClockResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || displayRectClockResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayRectClockResult.browserProbe?.ok !== true
      || displayRectClockResult.browserProbe?.usedPersistentBuffers !== true
      || displayRectClockResult.browserProbe?.usedTransforms !== true
      || displayRectClockResult.browserProbe?.usedIdentityClipSpace !== true
      || displayRectClockResult.browserProbe?.vertexCount !== 14
      || displayRectClockResult.browserProbe?.vertexStride !== 44
      || displayRectClockResult.browserProbe?.indexCount !== 18
      || displayRectClockResult.browserProbe?.texture0?.sampled === true
      || !pixelLooksGreen(displayRectClockResult.clockPixels?.rightHalf)
      || !pixelLooksGreen(displayRectClockResult.clockPixels?.bottomLeft)
      || !pixelLooksGreen(displayRectClockResult.clockPixels?.topLeftTriangle)
      || !pixelLooksBlack(displayRectClockResult.clockPixels?.topLeftGap)
      || !pixelLooksBlack(displayRectClockResult.clockPixels?.outsideLeft)
      || !pixelLooksBlack(displayRectClockResult.clockPixels?.outsideBottom)) {
    throw new Error(`WW3DDisplay rect clock probe failed: ${JSON.stringify(displayRectClockResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayRectClockCanvasScreenshot });

  const displayRemainingRectClockResult = await page.evaluate(() => window.CnCPort.rpc("ww3dDisplayRemainingRectClock"));
  if (!displayRemainingRectClockResult.ok
      || displayRemainingRectClockResult.probe?.source !== "ww3d_display_remaining_rectclock_probe"
      || displayRemainingRectClockResult.probe?.results?.displayAllocated !== true
      || displayRemainingRectClockResult.probe?.results?.displaySetup !== true
      || displayRemainingRectClockResult.probe?.results?.drawRemainingRectClockCalled !== true
      || displayRemainingRectClockResult.probe?.display?.path !== "W3DDisplay::drawRemainingRectClock"
      || displayRemainingRectClockResult.probe?.display?.clock?.percent !== 50
      || displayRemainingRectClockResult.probe?.calls?.drawIndexed < 1
      || displayRemainingRectClockResult.probe?.calls?.browserBufferCreate < 2
      || displayRemainingRectClockResult.probe?.calls?.browserBufferUpdate < 2
      || displayRemainingRectClockResult.probe?.draw?.primitiveType !== 4
      || displayRemainingRectClockResult.probe?.draw?.vertexCount !== 10
      || displayRemainingRectClockResult.probe?.draw?.primitiveCount !== 4
      || displayRemainingRectClockResult.probe?.draw?.vertexStride !== 44
      || displayRemainingRectClockResult.probe?.draw?.renderState?.alphaBlendEnable !== 1
      || displayRemainingRectClockResult.probe?.draw?.renderState?.textureStages?.[0]?.colorOp !== 3
      || displayRemainingRectClockResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || displayRemainingRectClockResult.probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 !== 0
      || displayRemainingRectClockResult.probe?.draw?.renderState?.textureStages?.[1]?.colorOp !== 1
      || displayRemainingRectClockResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || displayRemainingRectClockResult.browserProbe?.usedPersistentBuffers !== true
      || displayRemainingRectClockResult.browserProbe?.usedTransforms !== true
      || displayRemainingRectClockResult.browserProbe?.usedIdentityClipSpace !== true
      || displayRemainingRectClockResult.browserProbe?.vertexCount !== 10
      || displayRemainingRectClockResult.browserProbe?.vertexStride !== 44
      || displayRemainingRectClockResult.browserProbe?.indexCount !== 12
      || displayRemainingRectClockResult.browserProbe?.texture0?.sampled === true
      || !pixelLooksRed(displayRemainingRectClockResult.remainingClockPixels?.topLeft)
      || !pixelLooksRed(displayRemainingRectClockResult.remainingClockPixels?.bottomLeft)
      || !pixelLooksRed(displayRemainingRectClockResult.remainingClockPixels?.leftSeam)
      || !pixelLooksBlack(displayRemainingRectClockResult.remainingClockPixels?.topRight)
      || !pixelLooksBlack(displayRemainingRectClockResult.remainingClockPixels?.bottomRight)
      || !pixelLooksBlack(displayRemainingRectClockResult.remainingClockPixels?.rightSeam)
      || !pixelLooksBlack(displayRemainingRectClockResult.remainingClockPixels?.outsideLeft)) {
    throw new Error(`WW3DDisplay remaining rect clock probe failed: ${JSON.stringify(displayRemainingRectClockResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dDisplayRemainingRectClockCanvasScreenshot });

  const texturedMeshResult = await page.evaluate(() => window.CnCPort.rpc("ww3dTexturedMesh"));
  if (!texturedMeshResult.ok
      || texturedMeshResult.probe?.source !== "ww3d_textured_mesh_probe"
      || texturedMeshResult.probe?.results?.meshLoaded !== true
      || texturedMeshResult.probe?.results?.meshLoad !== 0
      || texturedMeshResult.probe?.results?.textureRegistered !== true
      || texturedMeshResult.probe?.calls?.drawIndexed < 1
      || texturedMeshResult.probe?.calls?.browserTextureCreate < 1
      || texturedMeshResult.probe?.calls?.browserTextureBind < 1
      || texturedMeshResult.probe?.calls?.browserBufferCreate < 2
      || texturedMeshResult.probe?.calls?.browserBufferUpdate < 2
      || texturedMeshResult.probe?.calls?.setTexture < 1
      || texturedMeshResult.probe?.calls?.setTransform < 3
      || texturedMeshResult.probe?.draw?.primitiveType !== 4
      || texturedMeshResult.probe?.draw?.vertexBufferId <= 0
      || texturedMeshResult.probe?.draw?.indexBufferId <= 0
      || texturedMeshResult.probe?.draw?.transformMask !== 7
      || texturedMeshResult.probe?.renderState?.textureStages?.[0]?.colorOp !== 4
      || texturedMeshResult.probe?.renderState?.textureStages?.[0]?.colorArg1 !== 2
      || texturedMeshResult.probe?.renderState?.textureStages?.[1]?.colorOp !== 1
      || texturedMeshResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || texturedMeshResult.browserProbe?.usedPersistentBuffers !== true
      || texturedMeshResult.browserProbe?.usedTransforms !== true
      || texturedMeshResult.browserProbe?.texture0?.id !== texturedMeshResult.probe?.texture?.id
      || texturedMeshResult.browserProbe?.texture0?.ready !== true
      || texturedMeshResult.browserProbe?.texture0?.sampled !== true
      || texturedMeshResult.browserProbe?.texture0?.combiner?.supported !== true
      || texturedMeshResult.browserProbe?.texture0?.sampler?.supported !== true
      || !pixelLooksRed(texturedMeshResult.browserProbe?.centerPixel)
      || !pixelLooksRed(texturedMeshResult.screenshot?.centerPixel)
      || texturedMeshResult.textureDelta?.creates < 1
      || texturedMeshResult.textureDelta?.updates < 1
      || texturedMeshResult.textureDelta?.binds < 1) {
    throw new Error(`WW3D textured mesh probe failed: ${JSON.stringify(texturedMeshResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dTexturedMeshCanvasScreenshot });

  const terrainTileResult = await page.evaluate(() => window.CnCPort.rpc("ww3dTerrainTile"));
  if (!terrainTileResult.ok
      || terrainTileResult.probe?.source !== "ww3d_terrain_tile_probe"
      || terrainTileResult.probe?.results?.mapCreated !== true
      || terrainTileResult.probe?.results?.tileCreated !== true
      || terrainTileResult.probe?.results?.ownerCreated !== true
      || terrainTileResult.probe?.results?.renderObjectCreated !== true
      || terrainTileResult.probe?.terrain?.verticesPerSide !== 17
      || terrainTileResult.probe?.terrain?.cellsPerSide !== 16
      || terrainTileResult.probe?.terrain?.expectedFlatTextureSize !== 128
      || terrainTileResult.probe?.calls?.browserTextureCreate < 1
      || terrainTileResult.probe?.calls?.browserTextureUpdate < 1
      || terrainTileResult.probe?.calls?.browserBufferCreate < 2
      || terrainTileResult.probe?.calls?.browserBufferUpdate < 2
      || terrainTileResult.probe?.calls?.setStreamSource < 1
      || terrainTileResult.probe?.calls?.setIndices < 1
      || terrainTileResult.probe?.calls?.drawIndexed < 1
      || terrainTileResult.probe?.draw?.primitiveType !== 4
      || terrainTileResult.probe?.draw?.vertexShaderFvf !== 578
      || (terrainTileResult.probe?.draw?.vertexCount ?? 0) <= 0
      || (terrainTileResult.probe?.draw?.primitiveCount ?? 0) <= 0
      || terrainTileResult.probe?.draw?.vertexStride !== 32
      || terrainTileResult.probe?.draw?.transformMask !== 7
      || terrainTileResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || terrainTileResult.browserProbe?.usedPersistentBuffers !== true
      || terrainTileResult.browserProbe?.usedTransforms !== true
      || terrainTileResult.browserProbe?.vertexStride !== 32
      || terrainTileResult.browserProbe?.vertexLayout?.source !== "fvf"
      || terrainTileResult.browserProbe?.vertexShaderFvf !== terrainTileResult.probe?.draw?.vertexShaderFvf
      || terrainTileResult.browserProbe?.renderState?.cullMode !== 1
      || terrainTileResult.textureDelta?.creates < 1
      || terrainTileResult.textureDelta?.updates < 1
      || !pixelHasColor(terrainTileResult.browserProbe?.centerPixel, 8)
      || !pixelHasColor(terrainTileResult.screenshot?.centerPixel, 8)) {
    throw new Error(`WW3D terrain tile heightmap probe failed: ${JSON.stringify(terrainTileResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: ww3dTerrainTileCanvasScreenshot });

  const sourceAssetLoadResult = await page.evaluate(() => window.CnCPort.rpc("ww3dSourceAssetLoad"));
  if (!sourceAssetLoadResult.ok
      || sourceAssetLoadResult.probe?.source !== "ww3d_source_asset_load_probe"
      || sourceAssetLoadResult.probe?.asset?.name !== "ShatterPlanes0.w3d"
      || sourceAssetLoadResult.probe?.asset?.bytes !== 2444
      || sourceAssetLoadResult.probe?.inventory?.fileOpened !== true
      || sourceAssetLoadResult.probe?.inventory?.chunksScanned < 1
      || sourceAssetLoadResult.probe?.inventory?.hierarchyChunksSeen < 1
      || sourceAssetLoadResult.probe?.inventory?.hmodelChunksSeen !== 0
      || sourceAssetLoadResult.probe?.inventory?.firstHierarchyDepth < 1
      || sourceAssetLoadResult.probe?.inventory?.firstHierarchyLength <= 0
      || sourceAssetLoadResult.probe?.hierarchy?.loaded !== true
      || sourceAssetLoadResult.probe?.hierarchy?.load !== 0
      || sourceAssetLoadResult.probe?.hierarchy?.name !== "SHATTERPLANES0"
      || sourceAssetLoadResult.probe?.hierarchy?.pivots !== 22
      || sourceAssetLoadResult.probe?.hierarchy?.firstBone !== "ROOTTRANSFORM") {
    throw new Error(`WW3D source asset load probe failed: ${JSON.stringify(sourceAssetLoadResult)}`);
  }

  const wwshadeCubeMapApplyResult = await page.evaluate(() => window.CnCPort.rpc("wwshadeCubeMapApply"));
  if (!wwshadeCubeMapApplyResult.ok
      || wwshadeCubeMapApplyResult.probe?.source !== "wwshade_cubemap_apply_probe"
      || wwshadeCubeMapApplyResult.probe?.results?.applyCalled !== true
      || wwshadeCubeMapApplyResult.probe?.textureStages?.stage0?.texCoordIndex !== 0x00030000
      || wwshadeCubeMapApplyResult.probe?.textureStages?.stage0?.colorArg1 !== 2
      || wwshadeCubeMapApplyResult.probe?.textureStages?.stage0?.colorOp !== 4
      || wwshadeCubeMapApplyResult.probe?.textureStages?.stage0?.colorArg2 !== 0
      || wwshadeCubeMapApplyResult.probe?.textureStages?.stage0?.alphaOp !== 4
      || wwshadeCubeMapApplyResult.probe?.textureStages?.stage1?.colorOp !== 1
      || wwshadeCubeMapApplyResult.probe?.textureStages?.stage1?.alphaOp !== 1
      || wwshadeCubeMapApplyResult.probe?.renderState?.lighting !== 1
      || wwshadeCubeMapApplyResult.probe?.renderState?.specularEnable !== 1
      || wwshadeCubeMapApplyResult.probe?.renderState?.ambientMaterialSource !== 0
      || wwshadeCubeMapApplyResult.probe?.renderState?.diffuseMaterialSource !== 0
      || wwshadeCubeMapApplyResult.probe?.renderState?.specularMaterialSource !== 0
      || wwshadeCubeMapApplyResult.probe?.renderState?.emissiveMaterialSource !== 0
      || wwshadeCubeMapApplyResult.probe?.vertexShader?.fvf !== wwshadeCubeMapApplyResult.probe?.vertexShader?.expected
      || wwshadeCubeMapApplyResult.probe?.material?.ok !== true
      || (wwshadeCubeMapApplyResult.probe?.callDeltas?.textureStageState ?? 0) < 7
      || (wwshadeCubeMapApplyResult.probe?.callDeltas?.renderState ?? 0) < 6
      || wwshadeCubeMapApplyResult.probe?.callDeltas?.vertexShader !== 1
      || wwshadeCubeMapApplyResult.probe?.callDeltas?.material !== 1) {
    throw new Error(`WWShade cubemap apply probe failed: ${JSON.stringify(wwshadeCubeMapApplyResult)}`);
  }

  const matrixMapperApplyResult = await page.evaluate(() => window.CnCPort.rpc("matrixMapperApply"));
  if (!matrixMapperApplyResult.ok
      || matrixMapperApplyResult.probe?.source !== "matrixmapper_apply_probe"
      || matrixMapperApplyResult.probe?.results?.applyCalled !== true
      || matrixMapperApplyResult.probe?.results?.stage !== 1
      || matrixMapperApplyResult.probe?.textureStage?.texCoordIndex !== 0x00020000
      || matrixMapperApplyResult.probe?.textureStage?.textureTransformFlags !== (256 | 3)
      || matrixMapperApplyResult.probe?.transform?.state !== matrixMapperApplyResult.probe?.transform?.expectedState
      || matrixMapperApplyResult.probe?.transform?.perspectiveRowsOk !== true
      || matrixMapperApplyResult.probe?.transform?.row0Ok !== true
      || matrixMapperApplyResult.probe?.transform?.row1Ok !== true
      || matrixMapperApplyResult.probe?.transform?.row2FromRow3Ok !== true
      || matrixMapperApplyResult.probe?.callDeltas?.transform !== 1
      || matrixMapperApplyResult.probe?.callDeltas?.textureStageState !== 2) {
    throw new Error(`MatrixMapper apply probe failed: ${JSON.stringify(matrixMapperApplyResult)}`);
  }

  const classicEnvironmentMapperApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("classicEnvironmentMapperApply"));
  if (!classicEnvironmentMapperApplyResult.ok
      || classicEnvironmentMapperApplyResult.probe?.source !== "classic_environment_mapper_apply_probe"
      || classicEnvironmentMapperApplyResult.probe?.results?.applyCalled !== true
      || classicEnvironmentMapperApplyResult.probe?.results?.stage !== 1
      || classicEnvironmentMapperApplyResult.probe?.textureStage?.texCoordIndex !== 0x00010000
      || classicEnvironmentMapperApplyResult.probe?.textureStage?.textureTransformFlags !== 2
      || classicEnvironmentMapperApplyResult.probe?.transform?.state
          !== classicEnvironmentMapperApplyResult.probe?.transform?.expectedState
      || classicEnvironmentMapperApplyResult.probe?.transform?.rowsOk !== true
      || classicEnvironmentMapperApplyResult.probe?.transform?.row0Ok !== true
      || classicEnvironmentMapperApplyResult.probe?.transform?.row1Ok !== true
      || classicEnvironmentMapperApplyResult.probe?.transform?.row2Ok !== true
      || classicEnvironmentMapperApplyResult.probe?.transform?.row3Ok !== true
      || classicEnvironmentMapperApplyResult.probe?.callDeltas?.transform !== 1
      || classicEnvironmentMapperApplyResult.probe?.callDeltas?.textureStageState !== 2) {
    throw new Error(
      `ClassicEnvironmentMapper apply probe failed: ${JSON.stringify(classicEnvironmentMapperApplyResult)}`,
    );
  }

  const edgeMapperApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("edgeMapperApply"));
  const edgeNormal = edgeMapperApplyResult.probe?.cases?.normal;
  const edgeReflect = edgeMapperApplyResult.probe?.cases?.reflect;
  const edgeCaseOk = (edgeCase, expectedStage, expectedTexCoord) =>
    edgeCase?.ok === true
    && edgeCase?.stage === expectedStage
    && edgeCase?.mapperCreated === true
    && edgeCase?.mapperIdOk === true
    && edgeCase?.needsNormalsOk === true
    && edgeCase?.timeVariantOk === true
    && edgeCase?.applyCalled === true
    && edgeCase?.texCoordIndex === expectedTexCoord
    && edgeCase?.textureTransformFlags === 2
    && edgeCase?.transform?.state === edgeCase?.transform?.expectedState
    && edgeCase?.transform?.rowsOk === true
    && edgeCase?.transform?.row0Ok === true
    && edgeCase?.transform?.row1Ok === true
    && edgeCase?.transform?.row2Ok === true
    && edgeCase?.transform?.row3Ok === true
    && edgeCase?.callDeltas?.transform === 1
    && edgeCase?.callDeltas?.textureStageState === 2;
  if (!edgeMapperApplyResult.ok
      || edgeMapperApplyResult.probe?.source !== "edge_mapper_apply_probe"
      || !edgeCaseOk(edgeNormal, 1, 0x00010000)
      || !edgeCaseOk(edgeReflect, 1, 0x00030000)) {
    throw new Error(
      `EdgeMapper apply probe failed: ${JSON.stringify(edgeMapperApplyResult)}`,
    );
  }

  const environmentMapperApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("environmentMapperApply"));
  if (!environmentMapperApplyResult.ok
      || environmentMapperApplyResult.probe?.source !== "environment_mapper_apply_probe"
      || environmentMapperApplyResult.probe?.results?.applyCalled !== true
      || environmentMapperApplyResult.probe?.results?.stage !== 1
      || environmentMapperApplyResult.probe?.textureStage?.texCoordIndex !== 0x00030000
      || environmentMapperApplyResult.probe?.textureStage?.textureTransformFlags !== 2
      || environmentMapperApplyResult.probe?.transform?.state
          !== environmentMapperApplyResult.probe?.transform?.expectedState
      || environmentMapperApplyResult.probe?.transform?.rowsOk !== true
      || environmentMapperApplyResult.probe?.transform?.row0Ok !== true
      || environmentMapperApplyResult.probe?.transform?.row1Ok !== true
      || environmentMapperApplyResult.probe?.transform?.row2Ok !== true
      || environmentMapperApplyResult.probe?.transform?.row3Ok !== true
      || environmentMapperApplyResult.probe?.callDeltas?.transform !== 1
      || environmentMapperApplyResult.probe?.callDeltas?.textureStageState !== 2) {
    throw new Error(
      `EnvironmentMapper apply probe failed: ${JSON.stringify(environmentMapperApplyResult)}`,
    );
  }

  const gridEnvironmentMapperApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("gridEnvironmentMapperApply"));
  const gridClassic = gridEnvironmentMapperApplyResult.probe?.cases?.classic;
  const gridReflection = gridEnvironmentMapperApplyResult.probe?.cases?.reflection;
  const gridCaseOk = (gridCase, expectedClass, expectedStage, expectedOffset, expectedTexCoord) =>
    gridCase?.ok === true
    && gridCase?.class === expectedClass
    && gridCase?.stage === expectedStage
    && gridCase?.gridWidthLog2 === 2
    && gridCase?.lastFrame === 16
    && gridCase?.offset === expectedOffset
    && gridCase?.mapperCreated === true
    && gridCase?.mapperIdOk === true
    && gridCase?.needsNormalsOk === true
    && gridCase?.timeVariantOk === true
    && gridCase?.stageOk === true
    && gridCase?.applyCalled === true
    && gridCase?.texCoordIndex === expectedTexCoord
    && gridCase?.textureTransformFlags === 2
    && gridCase?.transform?.state === gridCase?.transform?.expectedState
    && gridCase?.transform?.rowsOk === true
    && gridCase?.transform?.row0Ok === true
    && gridCase?.transform?.row1Ok === true
    && gridCase?.transform?.row2Ok === true
    && gridCase?.transform?.row3Ok === true
    && gridCase?.callDeltas?.transform === 1
    && gridCase?.callDeltas?.textureStageState === 2;
  if (!gridEnvironmentMapperApplyResult.ok
      || gridEnvironmentMapperApplyResult.probe?.source !== "grid_environment_mapper_apply_probe"
      || !gridCaseOk(gridClassic, "GridClassicEnvironmentMapperClass", 1, 5, 0x00010000)
      || !gridCaseOk(gridReflection, "GridEnvironmentMapperClass", 1, 10, 0x00030000)) {
    throw new Error(
      `Grid environment mapper apply probe failed: ${JSON.stringify(gridEnvironmentMapperApplyResult)}`,
    );
  }

  const gridWSEnvironmentMapperApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("gridWSEnvironmentMapperApply"));
  const gridWSClassic = gridWSEnvironmentMapperApplyResult.probe?.cases?.classic;
  const gridWSReflection = gridWSEnvironmentMapperApplyResult.probe?.cases?.reflection;
  const gridWSCaseOk = (
    gridWsCase,
    expectedClass,
    expectedAxis,
    expectedStage,
    expectedOffset,
    expectedTexCoord,
  ) =>
    gridWsCase?.ok === true
    && gridWsCase?.class === expectedClass
    && gridWsCase?.axis === expectedAxis
    && gridWsCase?.stage === expectedStage
    && gridWsCase?.gridWidthLog2 === 2
    && gridWsCase?.lastFrame === 16
    && gridWsCase?.offset === expectedOffset
    && gridWsCase?.mapperCreated === true
    && gridWsCase?.mapperIdOk === true
    && gridWsCase?.needsNormalsOk === true
    && gridWsCase?.timeVariantOk === true
    && gridWsCase?.stageOk === true
    && gridWsCase?.viewInfluencedOk === true
    && gridWsCase?.applyCalled === true
    && gridWsCase?.texCoordIndex === expectedTexCoord
    && gridWsCase?.textureTransformFlags === 2
    && gridWsCase?.transform?.state === gridWsCase?.transform?.expectedState
    && gridWsCase?.transform?.rowsOk === true
    && gridWsCase?.transform?.row0Ok === true
    && gridWsCase?.transform?.row1Ok === true
    && gridWsCase?.transform?.row2Ok === true
    && gridWsCase?.transform?.row3Ok === true
    && gridWsCase?.callDeltas?.transform === 1
    && gridWsCase?.callDeltas?.textureStageState === 2;
  if (!gridWSEnvironmentMapperApplyResult.ok
      || gridWSEnvironmentMapperApplyResult.probe?.source
          !== "grid_ws_environment_mapper_apply_probe"
      || !gridWSCaseOk(
        gridWSClassic,
        "GridWSClassicEnvironmentMapperClass",
        "X",
        1,
        5,
        0x00010000,
      )
      || !gridWSCaseOk(
        gridWSReflection,
        "GridWSEnvironmentMapperClass",
        "Y",
        1,
        10,
        0x00030000,
      )) {
    throw new Error(
      `Grid WS environment mapper apply probe failed: ${JSON.stringify(gridWSEnvironmentMapperApplyResult)}`,
    );
  }

  const wsEnvironmentMapperApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("wsEnvironmentMapperApply"));
  const wsClassic = wsEnvironmentMapperApplyResult.probe?.cases?.classic;
  const wsReflection = wsEnvironmentMapperApplyResult.probe?.cases?.reflection;
  const wsCaseOk = (wsCase, expectedClass, expectedAxis, expectedStage, expectedTexCoord) =>
    wsCase?.ok === true
    && wsCase?.class === expectedClass
    && wsCase?.axis === expectedAxis
    && wsCase?.stage === expectedStage
    && wsCase?.mapperCreated === true
    && wsCase?.mapperIdOk === true
    && wsCase?.needsNormalsOk === true
    && wsCase?.timeVariantOk === true
    && wsCase?.stageOk === true
    && wsCase?.viewInfluencedOk === true
    && wsCase?.applyCalled === true
    && wsCase?.texCoordIndex === expectedTexCoord
    && wsCase?.textureTransformFlags === 2
    && wsCase?.transform?.state === wsCase?.transform?.expectedState
    && wsCase?.transform?.rowsOk === true
    && wsCase?.transform?.row0Ok === true
    && wsCase?.transform?.row1Ok === true
    && wsCase?.transform?.row2Ok === true
    && wsCase?.transform?.row3Ok === true
    && wsCase?.callDeltas?.transform === 1
    && wsCase?.callDeltas?.textureStageState === 2;
  if (!wsEnvironmentMapperApplyResult.ok
      || wsEnvironmentMapperApplyResult.probe?.source !== "ws_environment_mapper_apply_probe"
      || !wsCaseOk(wsClassic, "WSClassicEnvironmentMapperClass", "X", 1, 0x00010000)
      || !wsCaseOk(wsReflection, "WSEnvironmentMapperClass", "Y", 1, 0x00030000)) {
    throw new Error(
      `WS environment mapper apply probe failed: ${JSON.stringify(wsEnvironmentMapperApplyResult)}`,
    );
  }

  const screenMapperApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("screenMapperApply"));
  if (!screenMapperApplyResult.ok
      || screenMapperApplyResult.probe?.source !== "screen_mapper_apply_probe"
      || screenMapperApplyResult.probe?.results?.applyCalled !== true
      || screenMapperApplyResult.probe?.results?.stage !== 1
      || screenMapperApplyResult.probe?.results?.mapperIdOk !== true
      || screenMapperApplyResult.probe?.textureStage?.texCoordIndex !== 0x00020000
      || screenMapperApplyResult.probe?.textureStage?.textureTransformFlags !== (256 | 3)
      || screenMapperApplyResult.probe?.transform?.state
          !== screenMapperApplyResult.probe?.transform?.expectedState
      || screenMapperApplyResult.probe?.transform?.rowsOk !== true
      || screenMapperApplyResult.probe?.transform?.row0Ok !== true
      || screenMapperApplyResult.probe?.transform?.row1Ok !== true
      || screenMapperApplyResult.probe?.transform?.row2Ok !== true
      || screenMapperApplyResult.probe?.transform?.row3Ok !== true
      || screenMapperApplyResult.probe?.callDeltas?.transform !== 1
      || screenMapperApplyResult.probe?.callDeltas?.textureStageState !== 2) {
    throw new Error(
      `ScreenMapper apply probe failed: ${JSON.stringify(screenMapperApplyResult)}`,
    );
  }

  const projectionStateApplyResult =
      await page.evaluate(() => window.CnCPort.rpc("projectionStateApply"));
  const terrainProjection = projectionStateApplyResult.probe?.cases?.terrain;
  const waterProjection = projectionStateApplyResult.probe?.cases?.water;
  const projectionCaseOk = (projectionCase, expectedStage, expectedTransformState) =>
    projectionCase?.ok === true
    && projectionCase?.stage === expectedStage
    && projectionCase?.texCoordIndex === 0x00020000
    && projectionCase?.textureTransformFlags === 2
    && projectionCase?.addressU === 1
    && projectionCase?.addressV === 1
    && projectionCase?.transform?.state === expectedTransformState
    && projectionCase?.transform?.state === projectionCase?.transform?.expectedState
    && projectionCase?.transform?.rowsOk === true
    && projectionCase?.transform?.row0Ok === true
    && projectionCase?.transform?.row1Ok === true
    && projectionCase?.transform?.row2Ok === true
    && projectionCase?.transform?.row3Ok === true
    && projectionCase?.callDeltas?.transform === 1
    && projectionCase?.callDeltas?.textureStageState === 4;
  if (!projectionStateApplyResult.ok
      || projectionStateApplyResult.probe?.source !== "projection_state_apply_probe"
      || !projectionCaseOk(terrainProjection, 0, 16)
      || !projectionCaseOk(waterProjection, 2, 18)) {
    throw new Error(
      `Projection state apply probe failed: ${JSON.stringify(projectionStateApplyResult)}`,
    );
  }

  const gdiFontProbeResult = await page.evaluate(() => window.CnCPort.rpc("gdiFontProbe", {
    pointSize: 24,
    face: "Arial",
  }));
  if (!gdiFontProbeResult.ok
      || gdiFontProbeResult.probe?.rasterizerInstalled !== true
      || gdiFontProbeResult.probe?.rasterized !== true
      || gdiFontProbeResult.probe?.fontCreated !== true
      || gdiFontProbeResult.probe?.bitmapAllocated !== true
      || gdiFontProbeResult.probe?.metricsReported !== true
      || gdiFontProbeResult.probe?.measureReported !== true
      || (gdiFontProbeResult.probe?.fontHeight ?? 0) <= 0
      || (gdiFontProbeResult.probe?.measureCx ?? 0) <= 0
      || (gdiFontProbeResult.probe?.glyphCoverage ?? 0) <= 0
      || (gdiFontProbeResult.probe?.bitmapBytes ?? 0) <= 0) {
    throw new Error(`GDI font bridge probe failed: ${JSON.stringify(gdiFontProbeResult)}`);
  }
  // The white-on-black glyph rasterization must leave non-background samples.
  // Blue channel of the first pixel of the last drawn cell: background fill is
  // black (0) and any coverage of 'M' should leave the cell mostly painted.
  if ((gdiFontProbeResult.probe?.totalPixels ?? 0) <= 0
      || (gdiFontProbeResult.probe?.glyphCoverage ?? 0) < (gdiFontProbeResult.probe?.totalPixels ?? 0) * 0.001) {
    throw new Error(`GDI font bridge produced no glyph coverage: ${JSON.stringify(gdiFontProbeResult)}`);
  }

  const ww3dFontCharsResult = await page.evaluate(() => window.CnCPort.rpc("ww3dFontChars", {
    pointSize: 24,
    face: "Arial",
  }));
  if (!ww3dFontCharsResult.ok
      || ww3dFontCharsResult.probe?.source !== "ww3d_font_chars_probe"
      || ww3dFontCharsResult.probe?.assetManagerCreated !== true
      || ww3dFontCharsResult.probe?.usedExistingAssetManager !== false
      || ww3dFontCharsResult.probe?.fontCreated !== true
      || (ww3dFontCharsResult.probe?.refsAfterGet ?? 0) < 2
      || (ww3dFontCharsResult.probe?.charHeight ?? 0) <= 0
      || ww3dFontCharsResult.probe?.glyphCount !== 4
      || ww3dFontCharsResult.probe?.positiveWidths !== 4
      || ww3dFontCharsResult.probe?.charsWithCoverage !== 4
      || (ww3dFontCharsResult.probe?.positiveSpacings ?? 0) < 3
      || (ww3dFontCharsResult.probe?.blitCoverage ?? 0) <= 0
      || (ww3dFontCharsResult.probe?.glyphs?.A?.width ?? 0) <= 0
      || (ww3dFontCharsResult.probe?.glyphs?.M?.width ?? 0) <= 0
      || (ww3dFontCharsResult.probe?.glyphs?.g?.width ?? 0) <= 0
      || (ww3dFontCharsResult.probe?.glyphs?.W?.width ?? 0) <= 0) {
    throw new Error(`WW3D FontChars original glyph cache probe failed: ${JSON.stringify(ww3dFontCharsResult)}`);
  }

  await page.locator("#viewport").screenshot({ path: gdiFontCanvasScreenshot });

  const resetClearResult = await page.evaluate(() => window.CnCPort.rpc("clearCanvas", {
    rgba: [0, 0, 0, 255],
  }));
  if (!resetClearResult.ok
      || resetClearResult.probe?.topLeftPixel?.join(",") !== "0,0,0,255") {
    throw new Error(`Canvas black reset failed: ${JSON.stringify(resetClearResult)}`);
  }

  const screenshotResult = await page.evaluate(() => window.CnCPort.rpc("screenshot"));
  if (!screenshotResult.ok) {
    throw new Error(`Screenshot RPC failed: ${JSON.stringify(screenshotResult)}`);
  }

  const { width, height, topLeftPixel, dataUrl } = screenshotResult.screenshot;
  if (width !== 1280 || height !== 720) {
    throw new Error(`Unexpected canvas size ${width}x${height}`);
  }
  if (topLeftPixel.join(",") !== "0,0,0,255") {
    throw new Error(`Canvas black-window check failed: ${topLeftPixel.join(",")}`);
  }
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Canvas screenshot RPC did not return a PNG data URL");
  }

  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  await page.locator("#viewport").screenshot({ path: canvasScreenshot });

  const stateResult = await page.evaluate(() => window.CnCPort.rpc("state"));
  if (!stateResult.ok) {
    throw new Error(`State RPC failed: ${JSON.stringify(stateResult)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    screenshots: [
      desktopScreenshot,
      canvasScreenshot,
      clearCanvasScreenshot,
      d3d8ClearCanvasScreenshot,
      d3d8TwoTextureAlphaCanvasScreenshot,
      d3d8GeneratedTexCoordCanvasScreenshot,
      d3d8FvfTexCoordSizesCanvasScreenshot,
      d3d8TextureTransformCanvasScreenshot,
      d3d8Stage1TextureTransformCanvasScreenshot,
      d3d8ClipPlaneCanvasScreenshot,
      d3d8DirectionalLightCanvasScreenshot,
      d3d8MultiDirectionalLightCanvasScreenshot,
      d3d8SpecularLightCanvasScreenshot,
      d3d8SpecularOffAxisLightCanvasScreenshot,
      d3d8SpecularTransformedLightCanvasScreenshot,
      d3d8NormalizeNormalsCanvasScreenshot,
      d3d8LocalViewerCanvasScreenshot,
      d3d8PointLightCanvasScreenshot,
      d3d8PointQuadraticLightCanvasScreenshot,
      d3d8PointRangeLightCanvasScreenshot,
      d3d8PointMixedLightCanvasScreenshot,
      d3d8SpotLightCanvasScreenshot,
      d3d8SpotFalloffCanvasScreenshot,
      d3d8LitMaterialSourcesCanvasScreenshot,
      d3d8LitSpecularMaterialSourceCanvasScreenshot,
      d3d8LitEmissiveColor1MaterialSourceCanvasScreenshot,
      d3d8LitEmissiveColor2MaterialSourceCanvasScreenshot,
      ww3dAABoxCanvasScreenshot,
      ww3dSceneCameraCanvasScreenshot,
      ww3dRTSSceneCanvasScreenshot,
      ww3dDisplaySceneCanvasScreenshot,
      ww3dRender2DCanvasScreenshot,
      ww3dRender2DSentenceCanvasScreenshot,
      ww3dDisplayStringCanvasScreenshot,
      ww3dDisplayDrawImageCanvasScreenshot,
      ww3dDisplayDrawImageAdditiveCanvasScreenshot,
      ww3dDisplayDrawImageSolidCanvasScreenshot,
      ww3dDisplayDrawImageGrayscaleCanvasScreenshot,
      ww3dDisplayFillRectCanvasScreenshot,
      ww3dDisplayLineCanvasScreenshot,
      ww3dDisplayLineGradientCanvasScreenshot,
      ww3dDisplayOpenRectCanvasScreenshot,
      ww3dDisplayRectClockCanvasScreenshot,
      ww3dDisplayRemainingRectClockCanvasScreenshot,
      ww3dTexturedMeshCanvasScreenshot,
      ww3dTerrainTileCanvasScreenshot,
      gdiFontCanvasScreenshot,
      cursorCanvasScreenshot,
    ],
    state: stateResult.state,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
