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

function assertNetworkUpdateProbe(probe) {
  const before = probe?.before?.network;
  const beforeCallback = probe?.before?.callback;
  const update = probe?.update;
  const after = probe?.after?.network;
  const afterCallback = probe?.after?.callback;
  expect(probe?.ok === true
      && probe.source === "GameNetwork browser LANAPI Network::update frame-readiness probe"
      && probe.lanApiReady === true
      && probe.browserTransport === "harness relay queue"
      && probe.productionTransport === false
      && probe.relayTransport === true
      && probe.originalSetup === "LANAPI::RequestGameStart -> LANAPI::OnGameStart"
      && probe.originalUpdate === "Network::update"
      && probe.originalCommandPath === "Network::GetCommandsFromCommandList -> Network::processCommand"
      && probe.originalFrameReadiness === "Network::AllCommandsReady -> ConnectionManager::allCommandsReady -> FrameDataManager::allCommandsReady"
      && probe.originalTiming === "Network::timeForNewFrame"
      && probe.originalRelay === "Network::RelayCommandsToCommandList"
      && probe.nextRequired === "productionWebSocketWebRTCTransportOrTwoClientMatchSync"
      && probe.lanApi?.hostGameReady === true
      && probe.lanApi?.onGameStartCalls === 1
      && probe.lanApi?.gameStartMessageDecoded === true
      && probe.lanApi?.messageType === "MSG_GAME_START",
    "LANAPI Network::update probe did not report the expected original source path", probe);

  expect(before?.created === true
      && before.setupReady === true
      && before.localSlot === 0
      && before.numPlayers === 2
      && before.runAhead === 30
      && before.frameRate === 30
      && before.frameDataReady === false
      && before.remoteNameReady === true
      && beforeCallback?.sideEffectsReady === true
      && beforeCallback.gameInProgress === true
      && beforeCallback.pendingFileReady === true
      && beforeCallback.useFpsLimitDisabled === true
      && beforeCallback.messageNewGame === true
      && beforeCallback.messageArgumentReady === true
      && beforeCallback.messageArgument === 1
      && beforeCallback.randomSeedReady === true
      && beforeCallback.mapCacheReady === true,
    "LANAPI game-start setup was not ready before Network::update", probe);

  expect(update?.commandListInjected === true
      && update.updateDriven === true
      && update.logicFrameBefore === 0
      && update.logicFrameForUpdate === 1
      && update.tickMessageType === 1
      && update.commandListCountBefore === 1
      && update.commandListCountAfter === 1
      && update.localSlot === 0
      && update.numPlayers === 2
      && update.runAhead === 30
      && update.frameRate === 30
      && update.beforeFrameDataReady === false
      && update.afterFrameDataReady === true
      && update.localConnectedBefore === false
      && update.localConnectedAfter === true
      && update.readinessTransition === true
      && update.inGamePromoted === true,
    "Network::update did not promote LAN game-start state into first-frame readiness", probe);

  expect(after?.created === true
      && after.setupReady === true
      && after.localSlot === 0
      && after.numPlayers === 2
      && after.runAhead === 30
      && after.frameRate === 30
      && after.frameDataReady === true
      && after.remoteNameReady === true
      && afterCallback?.sideEffectsReady === true
      && afterCallback.gameInProgress === true
      && afterCallback.pendingFileReady === true
      && afterCallback.useFpsLimitDisabled === true
      && afterCallback.messageNewGame === true
      && afterCallback.messageArgumentReady === true
      && afterCallback.messageArgument === 1
      && afterCallback.randomSeedReady === true
      && afterCallback.mapCacheReady === true,
    "LANAPI game-start network state was not frame-ready after Network::update", probe);
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
    window.CnCPort.rpc("boot", { source: "browser-lanapi-network-update" }));
  expect(boot.ok === true && boot.state?.wasm === "loaded",
    "browser LANAPI Network::update context did not boot the wasm harness", boot);

  const result = await page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiNetworkUpdateProbe"));
  expect(result.ok === true, "LANAPI Network::update RPC failed", result);
  assertNetworkUpdateProbe(result.probe);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error during LANAPI Network::update smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-lanapi-network-update",
    harnessUrl,
    wasm: result.state?.wasm,
    originalSetup: result.probe.originalSetup,
    originalUpdate: result.probe.originalUpdate,
    originalCommandPath: result.probe.originalCommandPath,
    originalFrameReadiness: result.probe.originalFrameReadiness,
    originalTiming: result.probe.originalTiming,
    originalRelay: result.probe.originalRelay,
    relay: {
      browserTransport: result.probe.browserTransport,
      productionTransport: result.probe.productionTransport,
      nextRequired: result.probe.nextRequired,
    },
    lanApi: result.probe.lanApi,
    before: result.probe.before,
    update: result.probe.update,
    after: result.probe.after,
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
}
