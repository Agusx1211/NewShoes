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
      || input.keys?.f6?.down !== false
      || input.keys?.f6?.pressedSinceLastQuery !== false) {
    throw new Error(`${label} browser input initial state mismatch: ${JSON.stringify(input)}`);
  }
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
      (input) => input?.cursor?.available && input.cursor.x === 321 && input.cursor.y === 123,
      "pointer move",
    );
    if (inputAfterPointer.keys?.f6?.down) {
      throw new Error(`Pointer input should not mutate key state: ${JSON.stringify(inputAfterPointer)}`);
    }

    await page.keyboard.down("F6");
    await waitForBrowserInput(
      page,
      (input) => input?.keys?.f6?.down === true && input.keys.f6.pressedSinceLastQuery === true,
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
    screenshots: [desktopScreenshot, canvasScreenshot],
    state: stateResult.state,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
