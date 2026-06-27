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
      || d3d8TexturedQuadResult.browserProbe?.texture0?.id !== d3d8TexturedQuadResult.probe?.texture?.id
      || d3d8TexturedQuadResult.browserProbe?.texture0?.ready !== true
      || d3d8TexturedQuadResult.browserProbe?.texture0?.sampled !== true
      || d3d8TexturedQuadResult.browserProbe?.texture0?.texCoordOffset !== 28
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
    ],
    state: stateResult.state,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
