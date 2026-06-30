#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { startBinaryWebSocketRelayServer } from "./websocket-binary-relay-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot });
const relayServer = await startBinaryWebSocketRelayServer();

const hostIp = 0x7f000002;
const joinerIp = 0x7f000003;
const broadcastIp = 0xffffffff;
const lobbyPort = 8086;

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
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

function assertSend(sendResult) {
  const probe = sendResult?.sendProbe;
  const runtime = sendResult?.browserUdpEndpointRuntime;
  const packet = probe?.packet;
  const transport = probe?.transport;
  const network = probe?.network;
  const callback = probe?.callback;
  expect(sendResult?.ok === true
      && probe?.ok === true
      && probe.source === "GameNetwork browser LANAPI live game-start send probe"
      && probe.browserTransport === "browser WebSocket live UDP endpoint"
      && probe.productionTransport === true
      && probe.relayTransport === true
      && probe.originalRequest === "LANAPI::RequestGameStart"
      && probe.originalSerializer === "LANAPI::sendMessage -> Transport::queueSend"
      && probe.originalTransport === "Transport::update"
      && probe.originalWireSend === "Transport::doSend -> Module.cncPortBrowserUdpSend"
      && probe.originalCallback === "LANAPI::OnGameStart"
      && probe.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
      && packet?.messageType === "MSG_GAME_START"
      && packet?.activeBytes > 0
      && packet?.wireBytes === packet.activeBytes + 6
      && packet?.remoteIp === broadcastIp
      && packet?.localIp === hostIp
      && packet?.port === lobbyPort
      && transport?.initialized === true
      && transport?.updateDriven === true
      && transport?.outBufferCleared === true
      && transport?.adapterWrites === 1
      && transport?.fallbackOutgoing === 0
      && probe.lanApi?.hostGameReady === true
      && probe.lanApi?.onGameStartCalls === 1
      && network?.created === true
      && network?.setupReady === true
      && network?.localSlot === 0
      && network?.numPlayers === 2
      && network?.runAhead === 30
      && network?.frameRate === 30
      && callback?.sideEffectsReady === true
      && callback?.gameInProgress === true
      && callback?.messageNewGame === true
      && runtime?.enabled === true
      && runtime?.connected === true
      && runtime?.sent === 1
      && runtime?.sentBytes === packet.wireBytes
      && runtime?.lastSent?.bytes === packet.wireBytes
      && runtime?.lastSent?.ip === broadcastIp
      && runtime?.lastSent?.port === lobbyPort,
    "host context did not send LANAPI game-start through the live browser UDP endpoint", sendResult);
}

function assertReceive(receiveResult, sendResult) {
  const probe = receiveResult?.receiveProbe;
  const runtime = receiveResult?.browserUdpEndpointRuntime;
  const packet = probe?.packet;
  const transport = probe?.transport;
  const network = probe?.network;
  const callback = probe?.callback;
  const sentPacket = sendResult?.sendProbe?.packet;
  expect(receiveResult?.ok === true
      && probe?.ok === true
      && probe.source === "GameNetwork browser LANAPI live game-start receive probe"
      && probe.browserTransport === "browser WebSocket live UDP endpoint"
      && probe.productionTransport === true
      && probe.relayTransport === true
      && probe.originalWireReceive === "Module.cncPortBrowserUdpRecv -> Transport::doRecv decryptBuf/isGeneralsPacket"
      && probe.originalTransport === "Transport::m_inBuffer"
      && probe.originalDispatch === "LANAPI::update"
      && probe.originalHandler === "LANAPI::handleGameStart"
      && probe.originalCallback === "LANAPI::OnGameStart"
      && probe.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
      && packet?.messageType === sentPacket?.messageType
      && packet?.activeBytes === sentPacket?.activeBytes
      && packet?.wireBytes === sentPacket?.wireBytes
      && packet?.remoteIp === hostIp
      && packet?.localIp === joinerIp
      && packet?.port === lobbyPort
      && transport?.initialized === true
      && transport?.updateDriven === true
      && transport?.cleared === true
      && transport?.adapterReads === 1
      && transport?.fallbackIncoming === 0
      && probe.lanApi?.joinedGameReady === true
      && probe.lanApi?.onGameStartCalls === 1
      && network?.created === true
      && network?.setupReady === true
      && network?.localSlot === 1
      && network?.numPlayers === 2
      && network?.runAhead === 30
      && network?.frameRate === 30
      && network?.remoteNameReady === true
      && callback?.sideEffectsReady === true
      && callback?.gameInProgress === true
      && callback?.messageNewGame === true
      && runtime?.enabled === true
      && runtime?.received === 1
      && runtime?.delivered === 1
      && runtime?.queuedIncoming === 0
      && runtime?.receivedBytes === sentPacket.wireBytes
      && runtime?.deliveredBytes === sentPacket.wireBytes,
    "joiner context did not receive LANAPI game-start through the live browser UDP endpoint", receiveResult);
}

async function waitForEndpointReceive(page) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = await page.evaluate(() => window.CnCPort.rpc("browserUdpEndpointState"));
    if (state.runtime?.received > 0) {
      return state;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("timed out waiting for joiner browser UDP endpoint receive");
}

let browser;
let hostClient;
let joinerClient;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  hostClient = await createClient(browser, harnessUrl, "lanapi-live-host", browserEvents);
  joinerClient = await createClient(browser, harnessUrl, "lanapi-live-joiner", browserEvents);
  expect(hostClient.context !== joinerClient.context,
    "LANAPI live game-start smoke did not create isolated browser contexts", {});

  const joinerConnect = await joinerClient.page.evaluate((payload) =>
    window.CnCPort.rpc("browserUdpEndpointConnect", payload), {
    webSocketUrl: relayServer.url,
    client: "lanapi-live-joiner",
    incomingIp: hostIp,
    incomingPort: lobbyPort,
  });
  expect(joinerConnect.ok === true, "joiner live UDP endpoint did not connect", joinerConnect);

  const hostConnect = await hostClient.page.evaluate((payload) =>
    window.CnCPort.rpc("browserUdpEndpointConnect", payload), {
    webSocketUrl: relayServer.url,
    client: "lanapi-live-host",
    incomingIp: joinerIp,
    incomingPort: lobbyPort,
  });
  expect(hostConnect.ok === true, "host live UDP endpoint did not connect", hostConnect);
  await relayServer.waitForConnections(2);

  const sendResult = await hostClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiLiveGameStartSendProbe"));
  assertSend(sendResult);

  const relayStats = await relayServer.waitForForwardedFrames(1);
  const joinerState = await waitForEndpointReceive(joinerClient.page);
  expect(joinerState.runtime?.received === 1
      && joinerState.runtime?.receivedBytes === sendResult.browserUdpEndpointRuntime.sentBytes,
    "joiner endpoint did not queue exactly one WebSocket-delivered LANAPI game-start datagram", joinerState);

  const receiveResult = await joinerClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiLiveGameStartReceiveProbe"));
  assertReceive(receiveResult, sendResult);

  const finalRelayStats = relayServer.stats();
  expect(finalRelayStats.receivedFrames === 1
      && finalRelayStats.forwardedFrames === 1
      && finalRelayStats.receivedBytes === sendResult.browserUdpEndpointRuntime.sentBytes
      && finalRelayStats.forwardedBytes === sendResult.browserUdpEndpointRuntime.sentBytes,
    "WebSocket relay server did not forward exactly one live LANAPI game-start datagram", finalRelayStats);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error during LANAPI live game-start smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-lanapi-live-game-start",
    harnessUrl,
    browserContexts: 2,
    isolatedContexts: true,
    relay: {
      browserTransport: "browser WebSocket live UDP endpoint",
      serverTransport: "Node WebSocket relay server",
      productionTransport: true,
      productionTransportWire: true,
      binaryFrames: relayStats.forwardedFrames,
      hexHandoff: false,
      nextRequired: "liveEndpointNetworkUpdateTwoClientFrameSync",
    },
    host: {
      client: "lanapi-live-host",
      wasm: sendResult.state?.wasm,
      originalRequest: sendResult.sendProbe.originalRequest,
      originalSerializer: sendResult.sendProbe.originalSerializer,
      originalTransport: sendResult.sendProbe.originalTransport,
      originalWireSend: sendResult.sendProbe.originalWireSend,
      originalCallback: sendResult.sendProbe.originalCallback,
      originalNetwork: sendResult.sendProbe.originalNetwork,
      endpoint: sendResult.browserUdpEndpointRuntime,
      packet: sendResult.sendProbe.packet,
      transport: sendResult.sendProbe.transport,
      network: sendResult.sendProbe.network,
      callback: sendResult.sendProbe.callback,
    },
    joiner: {
      client: "lanapi-live-joiner",
      wasm: receiveResult.state?.wasm,
      originalWireReceive: receiveResult.receiveProbe.originalWireReceive,
      originalTransport: receiveResult.receiveProbe.originalTransport,
      originalDispatch: receiveResult.receiveProbe.originalDispatch,
      originalHandler: receiveResult.receiveProbe.originalHandler,
      originalCallback: receiveResult.receiveProbe.originalCallback,
      originalNetwork: receiveResult.receiveProbe.originalNetwork,
      endpointBeforeRecv: joinerState.runtime,
      endpoint: receiveResult.browserUdpEndpointRuntime,
      packet: receiveResult.receiveProbe.packet,
      transport: receiveResult.receiveProbe.transport,
      network: receiveResult.receiveProbe.network,
      callback: receiveResult.receiveProbe.callback,
    },
    relayStats: finalRelayStats,
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await hostClient?.context.close();
  await joinerClient?.context.close();
  await browser?.close();
  await relayServer.close();
  await server.close();
}
