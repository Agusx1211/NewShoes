#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot });

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function assertFrame(frame, expectedFrame) {
  expect(frame?.ready === true
      && frame.frame === expectedFrame
      && frame.commandListResetBefore === true
      && frame.commandListInjected === true
      && frame.updateDriven === true
      && frame.logicFrameBefore === expectedFrame - 1
      && frame.logicFrameForUpdate === expectedFrame
      && frame.tickMessageType === 1
      && frame.commandListCountBefore === 1
      && frame.commandListCountAfter === 1
      && frame.localSlot === 0
      && frame.numPlayers === 2
      && frame.runAhead === 30
      && frame.frameRate === 30
      && frame.localConnectedAfter === true,
    `multi-frame Network::update frame ${expectedFrame} did not advance through the original update loop`, frame);

  if (expectedFrame === 1) {
    expect(frame.beforeFrameDataReady === false
        && frame.afterFrameDataReady === true
        && frame.localConnectedBefore === false
        && frame.readinessTransition === true
        && frame.inGamePromoted === true,
      "first Network::update frame did not promote pregame into in-game readiness", frame);
  } else {
    expect(frame.localConnectedBefore === true
        && frame.readinessTransition === false
        && frame.inGamePromoted === false,
      `Network::update frame ${expectedFrame} did not preserve in-game connection state`, frame);
  }
}

function assertMultiFrameProbe(probe) {
  expect(probe?.ok === true
      && probe.source === "GameNetwork browser multi-frame Network::update/desync probe"
      && probe.lanApiReady === true
      && probe.browserTransport === "harness relay queue"
      && probe.productionTransport === false
      && probe.relayTransport === true
      && probe.framesDriven === 3
      && probe.originalSetup === "LANAPI::RequestGameStart -> LANAPI::OnGameStart"
      && probe.originalUpdate === "Network::update"
      && probe.originalCommandPath === "Network::GetCommandsFromCommandList -> Network::processCommand"
      && probe.originalFrameReadiness === "Network::AllCommandsReady -> ConnectionManager::allCommandsReady -> FrameDataManager::allCommandsReady"
      && probe.originalTiming === "Network::timeForNewFrame"
      && probe.originalRelay === "Network::RelayCommandsToCommandList"
      && probe.originalDesync === "FrameData::allCommandsReady FRAMEDATA_NOTREADY/FRAMEDATA_RESEND"
      && probe.nextRequired === "productionWebSocketWebRTCTransportOrTwoClientMatchSync"
      && probe.lanApi?.hostGameReady === true
      && probe.lanApi?.onGameStartCalls === 1
      && probe.lanApi?.gameStartMessageDecoded === true
      && probe.lanApi?.messageType === "MSG_GAME_START",
    "multi-frame Network::update/desync probe did not report the expected original source path", probe);

  expect(probe.before?.network?.setupReady === true
      && probe.before.network.localSlot === 0
      && probe.before.network.numPlayers === 2
      && probe.before.network.runAhead === 30
      && probe.before.network.frameRate === 30
      && probe.before.network.frameDataReady === false
      && probe.before.network.remoteNameReady === true
      && probe.before.callback?.sideEffectsReady === true
      && probe.before.callback.messageArgumentReady === true
      && probe.before.callback.randomSeedReady === true
      && probe.before.callback.mapCacheReady === true,
    "LANAPI setup was not ready before the multi-frame Network::update run", probe.before);

  expect(Array.isArray(probe.frames) && probe.frames.length === 3,
    "multi-frame probe did not return exactly three frame records", probe.frames);
  probe.frames.forEach((frame, index) => assertFrame(frame, index + 1));

  expect(probe.after?.network?.setupReady === true
      && probe.after.network.localSlot === 0
      && probe.after.network.numPlayers === 2
      && probe.after.network.runAhead === 30
      && probe.after.network.frameRate === 30
      && probe.after.network.remoteNameReady === true
      && probe.after.callback?.sideEffectsReady === true
      && probe.after.callback.messageArgumentReady === true
      && probe.after.callback.randomSeedReady === true
      && probe.after.callback.mapCacheReady === true,
    "network state was not ready after the multi-frame Network::update run", probe.after);

  expect(probe.desync?.ok === true
      && probe.desync.source === "FrameData::allCommandsReady"
      && probe.desync.frameDataNotReady === 0
      && probe.desync.frameDataResend === 1
      && probe.desync.frameDataReady === 2
      && probe.desync.notReady?.ok === true
      && probe.desync.notReady.result === 0
      && probe.desync.notReady.commandCount === 0
      && probe.desync.notReady.frameCommandCount === 1
      && probe.desync.resend?.ok === true
      && probe.desync.resend.result === 1
      && probe.desync.resend.commandType === "NETCOMMANDTYPE_RUNAHEAD"
      && probe.desync.resend.commandTypeValue === 7
      && probe.desync.resend.commandInserted === true
      && probe.desync.resend.commandCountBefore === 1
      && probe.desync.resend.frameCommandCountBefore === 0
      && probe.desync.resend.commandCountAfter === 0,
    "original FrameData desync/not-ready states were not reported correctly", probe.desync);
}

let browser;
let context;
const browserEvents = [];

try {
  browser = await chromium.launch();
  context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  const boot = await page.evaluate(() =>
    window.CnCPort.rpc("boot", { source: "browser-network-multiframe-lockstep" }));
  expect(boot.ok === true && boot.state?.wasm === "loaded",
    "browser multi-frame Network::update context did not boot the wasm harness", boot);

  const result = await page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkMultiFrameLockstepProbe"));
  expect(result.ok === true, "multi-frame Network::update RPC failed", result);
  assertMultiFrameProbe(result.probe);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0,
    "browser context emitted an error during multi-frame Network::update smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-network-multiframe-lockstep",
    harnessUrl,
    wasm: result.state?.wasm,
    originalSetup: result.probe.originalSetup,
    originalUpdate: result.probe.originalUpdate,
    originalCommandPath: result.probe.originalCommandPath,
    originalFrameReadiness: result.probe.originalFrameReadiness,
    originalTiming: result.probe.originalTiming,
    originalRelay: result.probe.originalRelay,
    originalDesync: result.probe.originalDesync,
    relay: {
      browserTransport: result.probe.browserTransport,
      productionTransport: result.probe.productionTransport,
      nextRequired: result.probe.nextRequired,
    },
    lanApi: result.probe.lanApi,
    before: result.probe.before,
    frames: result.probe.frames,
    after: result.probe.after,
    desync: result.probe.desync,
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
}
