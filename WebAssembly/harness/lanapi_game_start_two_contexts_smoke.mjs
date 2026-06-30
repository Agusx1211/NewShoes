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

function assertNetworkStartState(probe, expectedLocalSlot) {
  const network = probe?.network;
  const callback = probe?.callback;
  expect(network?.created === true
      && network.setupReady === true
      && network.localSlot === expectedLocalSlot
      && network.numPlayers === 2
      && network.runAhead === 30
      && network.frameRate === 30
      && network.frameDataReady === false
      && network.remoteNameReady === true
      && callback?.sideEffectsReady === true
      && callback.gameInProgress === true
      && callback.pendingFileReady === true
      && callback.useFpsLimitDisabled === true
      && callback.messageNewGame === true
      && callback.messageArgumentReady === true
      && callback.messageArgument === 1
      && callback.randomSeedReady === true
      && callback.mapCacheReady === true,
    "original LANAPI game-start callback did not create the expected Network/ConnectionManager state", probe);
}

function assertHostStartBuild(buildProbe) {
  const packet = buildProbe?.packet;
  expect(buildProbe?.ok === true
      && buildProbe.source === "GameNetwork browser LANAPI game-start host probe"
      && buildProbe.lanApiReady === true
      && buildProbe.browserTransport === "harness relay queue"
      && buildProbe.originalRequest === "LANAPI::RequestGameStart"
      && buildProbe.originalSerializer === "LANMessage::MSG_GAME_START"
      && buildProbe.originalTransport === "Transport::queueSend"
      && buildProbe.originalCallback === "LANAPI::OnGameStart"
      && buildProbe.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
      && buildProbe.nextRequired === "networkUpdateFrameReadinessOrProductionWebSocketWebRTCTransport"
      && typeof packet?.hex === "string"
      && packet.hex.length > 0
      && packet.messageType === "MSG_GAME_START"
      && packet.localIp === 0x7f000002
      && packet.port === 8086
      && packet.activeBytes > 0
      && packet.activeBytes <= 476
      && buildProbe.lanApi?.hostGameReady === true
      && buildProbe.lanApi?.onGameStartCalls === 1,
    "host browser context did not build the expected original LANAPI game-start packet", buildProbe);
  assertNetworkStartState(buildProbe, 0);
}

function assertClientStartAccept(clientProbe) {
  const packet = clientProbe?.packet;
  expect(clientProbe?.ok === true
      && clientProbe.source === "GameNetwork browser LANAPI game-start client probe"
      && clientProbe.lanApiReady === true
      && clientProbe.browserTransport === "harness relay queue"
      && clientProbe.originalTransport === "Transport::m_inBuffer"
      && clientProbe.originalDispatch === "LANAPI::update"
      && clientProbe.originalHandler === "LANAPI::handleGameStart"
      && clientProbe.originalCallback === "LANAPI::OnGameStart"
      && clientProbe.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
      && clientProbe.nextRequired === "networkUpdateFrameReadinessOrProductionWebSocketWebRTCTransport"
      && packet?.decoded === true
      && packet.messageType === "MSG_GAME_START"
      && packet.remoteIp === 0x7f000002
      && packet.localIp === 0x7f000003
      && packet.port === 8086
      && clientProbe.transport?.injected === true
      && clientProbe.transport?.cleared === true
      && clientProbe.lanApi?.updateDriven === true
      && clientProbe.lanApi?.joinedGameReady === true
      && clientProbe.lanApi?.onGameStartCalls === 1,
    "joiner browser context did not consume game-start through original LANAPI", clientProbe);
  assertNetworkStartState(clientProbe, 1);
}

async function createClient(browser, harnessUrl, label, browserEvents) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (message) => {
    browserEvents.push({ client: label, type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ client: label, type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ client: label, type: "crash" });
  });

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  const boot = await page.evaluate((source) => window.CnCPort.rpc("boot", { source }), label);
  expect(boot.ok === true && boot.state?.wasm === "loaded",
    `${label} browser context did not boot the wasm harness`, boot);
  return { context, page, boot };
}

let browser;
let hostClient;
let joinerClient;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  hostClient = await createClient(browser, harnessUrl, "browser-client-0", browserEvents);
  joinerClient = await createClient(browser, harnessUrl, "browser-client-1", browserEvents);
  expect(hostClient.context !== joinerClient.context,
    "LANAPI game-start smoke did not create isolated browser contexts", {});

  const buildResult = await hostClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiGameStartBuildPacket"));
  expect(buildResult.ok === true, "host context LANAPI game-start build RPC failed", buildResult);
  assertHostStartBuild(buildResult.buildProbe);

  const gameStartHex = buildResult.buildProbe.packet.hex;
  const joinerResult = await joinerClient.page.evaluate((packetHex) =>
    window.CnCPort.rpc("browserLanApiGameStartAcceptPacket", { packetHex }), gameStartHex);
  expect(joinerResult.ok === true, "joiner context LANAPI game-start accept RPC failed", joinerResult);
  assertClientStartAccept(joinerResult.clientProbe);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error while relaying LANAPI game-start", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-lanapi-game-start-two-contexts",
    harnessUrl,
    browserContexts: 2,
    isolatedContexts: true,
    relay: {
      browserTransport: "Node-mediated LANMessage hex handoff between isolated Playwright contexts",
      productionTransport: false,
      nextRequired: "networkUpdateFrameReadinessOrProductionWebSocketWebRTCTransport",
    },
    host: {
      client: "browser-client-0",
      wasm: buildResult.state?.wasm,
      originalRequest: buildResult.buildProbe.originalRequest,
      originalTransport: buildResult.buildProbe.originalTransport,
      originalCallback: buildResult.buildProbe.originalCallback,
      originalNetwork: buildResult.buildProbe.originalNetwork,
      packet: {
        bytes: buildResult.buildProbe.packet.bytes,
        activeBytes: buildResult.buildProbe.packet.activeBytes,
        messageType: buildResult.buildProbe.packet.messageType,
        localIp: buildResult.buildProbe.packet.localIp,
        port: buildResult.buildProbe.packet.port,
      },
      lanApi: buildResult.buildProbe.lanApi,
      network: buildResult.buildProbe.network,
      callback: buildResult.buildProbe.callback,
    },
    joiner: {
      client: "browser-client-1",
      wasm: joinerResult.state?.wasm,
      originalTransport: joinerResult.clientProbe.originalTransport,
      originalDispatch: joinerResult.clientProbe.originalDispatch,
      originalHandler: joinerResult.clientProbe.originalHandler,
      originalCallback: joinerResult.clientProbe.originalCallback,
      originalNetwork: joinerResult.clientProbe.originalNetwork,
      transport: joinerResult.clientProbe.transport,
      lanApi: joinerResult.clientProbe.lanApi,
      network: joinerResult.clientProbe.network,
      callback: joinerResult.clientProbe.callback,
    },
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await hostClient?.context.close();
  await joinerClient?.context.close();
  await browser?.close();
  await server.close();
}
