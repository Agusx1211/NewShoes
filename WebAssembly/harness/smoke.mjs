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
const ww3dDisplayFillRectCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-display-fillrect-canvas.png");
const ww3dDisplayOpenRectCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-display-openrect-canvas.png");
const ww3dTexturedMeshCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-textured-mesh-canvas.png");
const ww3dTerrainTileCanvasScreenshot = resolve(screenshotDir, "harness-smoke-ww3d-terrain-tile-canvas.png");
const gdiFontCanvasScreenshot = resolve(screenshotDir, "harness-smoke-gdi-font-canvas.png");
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

function assertOriginalEngineStartup(state, label, expectedStatus) {
  const startup = state.originalEngineStartup;
  if (!startup
      || startup.ok !== false
      || startup.initAttempted !== false
      || startup.source !== "GameEngine/Common/GameEngine.cpp::init"
      || startup.status !== expectedStatus) {
    throw new Error(`${label} original engine startup state mismatch: ${JSON.stringify(startup)}`);
  }

  if (startup.browserDeviceLayer?.ready !== false
      || startup.browserDeviceLayer?.createGameEngine !== false
      || startup.originalSetup?.probeOnly !== true
      || startup.originalSetup?.runtimeOwned !== false
      || startup.originalSetup?.globalData !== true
      || startup.originalSetup?.commandLine !== true
      || startup.originalSetup?.cdManager !== true
      || startup.browserDeviceLayer?.cdManager !== true
      || startup.browserDeviceLayer?.localFileSystem !== true
      || startup.browserDeviceLayer?.archiveFileSystem !== false
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

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const harnessUrl = new URL("harness/index.html", server.url).href;

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
    const wmMouseMove = 0x0200;
    const wmLeftButtonDown = 0x0201;
    const gcsCompStr = 0x0008;
    const gcsResultStr = 0x0800;
    const vkShift = 0x10;
    const vkA = 0x41;
    const vkF6 = 0x75;
    const charA = 0x41;
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

    const resetD3DCallsBeforeBlur = browserDoubleClickReleaseProbe.probe.resetD3D?.calls ?? 0;
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
  }

  const initialFrame = bootResult.state.frame;
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
      || combinerCases.length !== 35
      || combinerCaseNames !== "selectTexture,selectDiffuse,modulate,add,selectAlphaTexture,selectAlphaDiffuse,modulateAlpha,addAlpha,complementTexture,alphaReplicateTexture,alphaReplicateComplementTexture,complementAlphaTexture,alphaReplicateComplementDiffuse,selectTextureFactor,modulateTextureFactor,selectAlphaTextureFactor,alphaReplicateTextureFactor,multiplyAddColorArg0,multiplyAddAlphaArg0,stage1DotProduct3Grayscale,resultArgTempPreservesCurrent,stage1SelectTemp,modulate2X,modulate4X,addSigned,addSigned2X,subtract,addSmooth,blendTextureAlpha,blendFactorAlpha,blendCurrentAlpha,lerpColorArg0,blendDiffuseAlpha,stage1MultiplyAddColorArg0,stage1LerpColorArg0"
      || combinerCenters !== "255,0,0,255|0,255,0,255|128,0,0,255|255,255,0,255|128,0,0,255|64,0,0,255|96,0,0,255|64,0,0,255|0,255,255,255|64,64,64,255|191,191,191,255|191,0,0,255|191,191,191,255|32,64,128,255|128,0,0,255|64,0,0,255|128,128,128,255|255,128,128,255|160,0,0,255|117,117,117,255|0,255,0,255|255,0,0,255|64,0,0,255|129,0,0,255|128,128,0,255|255,255,0,255|191,96,0,255|192,128,128,255|64,191,0,255|64,191,0,255|128,127,0,255|64,191,0,255|64,191,0,255|128,64,64,255|64,191,0,255"
      || combinerCases.some((entry) => entry.probe?.source !== "browser_d3d8_texture_combiner_probe")
      || combinerCases.some((entry) => entry.probe?.calls?.setTextureStageState !== entry.probe?.expectedStageStateCalls)
      || combinerCases.some((entry) => entry.browserProbe?.texture0?.combiner?.colorArg0 !== entry.probe?.combiner?.colorArg0)
      || combinerCases.some((entry) => entry.browserProbe?.texture0?.combiner?.resultArg !== entry.probe?.combiner?.resultArg)
      || combinerCases.some((entry) => entry.browserProbe?.texture0?.combiner?.alphaArg0 !== entry.probe?.combiner?.alphaArg0)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorOp !== entry.probe?.stage1Combiner?.colorOp)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorArg0 !== entry.probe?.stage1Combiner?.colorArg0)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorArg1 !== entry.probe?.stage1Combiner?.colorArg1)
      || combinerCases.some((entry) => entry.browserProbe?.stage1Combiner?.colorArg2 !== entry.probe?.stage1Combiner?.colorArg2)
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
  if (!d3d8TexCoordIndexResult.ok
      || texCoordCases.length !== 2
      || texCoordCaseNames !== "uv0,uv1"
      || texCoordCenters !== "255,0,0,255|0,0,255,255"
      || texCoordSets !== "0,1"
      || texCoordOffsets !== "28,36"
      || texCoordCases.some((entry) => entry.probe?.source !== "browser_d3d8_texcoord_index_probe")
      || texCoordCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 12)
      || texCoordCases.some((entry) => entry.browserProbe?.texture0?.texCoordModeName !== "passthru")
      || texCoordCases.some((entry) => entry.browserProbe?.texture0?.textureTransformFlags !== 0)
      || texCoordCases.some((entry) => entry.browserProbe?.texture0?.texCoordSupported !== true)
      || texCoordCases.some((entry) => entry.centerPixelOk !== true)
      || texCoordCases.some((entry) => entry.textureDelta?.creates !== 1)
      || texCoordCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)) {
    throw new Error(`D3D8 texcoord index probe failed: ${JSON.stringify(d3d8TexCoordIndexResult)}`);
  }

  const d3d8TextureTransformResult = await page.evaluate(() => window.CnCPort.rpc("d3d8TextureTransform"));
  const textureTransformCases = d3d8TextureTransformResult.cases ?? [];
  const textureTransformCaseNames = textureTransformCases.map((entry) => entry.probe?.caseName).join(",");
  const textureTransformCenters = textureTransformCases.map((entry) => entry.browserProbe?.centerPixel?.join(",")).join("|");
  const textureTransformFlags = textureTransformCases.map((entry) => entry.browserProbe?.texture0?.textureTransformFlags).join(",");
  const textureTransformApplied = textureTransformCases.map((entry) => entry.browserProbe?.texture0?.textureTransformApplied).join(",");
  if (!d3d8TextureTransformResult.ok
      || textureTransformCases.length !== 2
      || textureTransformCaseNames !== "disable,count2TranslateU"
      || textureTransformCenters !== "255,0,0,255|0,0,255,255"
      || textureTransformFlags !== "0,2"
      || textureTransformApplied !== "false,true"
      || textureTransformCases.some((entry) => entry.probe?.source !== "browser_d3d8_texture_transform_probe")
      || textureTransformCases.some((entry) => entry.probe?.calls?.setTextureStageState !== 12)
      || textureTransformCases.some((entry) => entry.browserProbe?.texture0?.texCoordModeName !== "passthru")
      || textureTransformCases.some((entry) => entry.browserProbe?.texture0?.textureTransformSupported !== true)
      || textureTransformCases.some((entry) => entry.browserProbe?.texture0?.texCoordSupported !== true)
      || textureTransformCases.some((entry) => entry.centerPixelOk !== true)
      || textureTransformCases.some((entry) => entry.textureDelta?.creates !== 1)
      || textureTransformCases.some((entry) => entry.textureDelta?.releaseUnbinds !== 1)) {
    throw new Error(`D3D8 texture transform probe failed: ${JSON.stringify(d3d8TextureTransformResult)}`);
  }

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
  if (!d3d8DxtTextureDrawResult.ok
      || d3d8DxtTextureDrawResult.s3tc !== true
      || dxtDrawCases.length !== 3
      || dxtDrawNames !== "DXT1Red,DXT3AlphaRed,DXT5AlphaRed"
      || dxtDrawCenters !== "255,0,0,255|136,0,0,255|128,0,0,255"
      || dxtDrawBlocks !== "8,16,16"
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
      ww3dAABoxCanvasScreenshot,
      ww3dSceneCameraCanvasScreenshot,
      ww3dRTSSceneCanvasScreenshot,
      ww3dDisplaySceneCanvasScreenshot,
      ww3dRender2DCanvasScreenshot,
      ww3dRender2DSentenceCanvasScreenshot,
      ww3dDisplayStringCanvasScreenshot,
      ww3dDisplayDrawImageCanvasScreenshot,
      ww3dDisplayFillRectCanvasScreenshot,
      ww3dDisplayOpenRectCanvasScreenshot,
      ww3dTexturedMeshCanvasScreenshot,
      ww3dTerrainTileCanvasScreenshot,
      gdiFontCanvasScreenshot,
    ],
    state: stateResult.state,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
