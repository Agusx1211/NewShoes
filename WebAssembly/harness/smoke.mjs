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
  if (expectWasm) {
    assertWasmTiming(bootResult.state, "boot");
  }
  if (bootResult.state.graphics?.api !== "webgl2" || !bootResult.state.graphics?.ok) {
    throw new Error(`Expected browser harness to initialize WebGL2: ${JSON.stringify(bootResult.state.graphics)}`);
  }
  if (bootResult.state.graphics.drawingBufferWidth !== 1280
      || bootResult.state.graphics.drawingBufferHeight !== 720) {
    throw new Error(`Unexpected initial WebGL2 drawing buffer: ${JSON.stringify(bootResult.state)}`);
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
