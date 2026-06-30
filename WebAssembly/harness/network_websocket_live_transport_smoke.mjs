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
  expect(sendResult?.ok === true
      && probe?.ok === true
      && probe.source === "GameNetwork browser live WebSocket Transport send probe"
      && probe.browserTransport === "browser WebSocket live UDP endpoint"
      && probe.productionTransport === true
      && probe.originalWireSend === "Transport::doSend -> Module.cncPortBrowserUdpSend"
      && transport?.initialized === true
      && transport?.queued === true
      && transport?.doSendDriven === true
      && transport?.outBufferCleared === true
      && transport?.adapterWrites === 1
      && transport?.fallbackOutgoing === 0
      && packet?.bytes > 0
      && packet?.commands === 2
      && packet?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
      && packet?.executionFrame === 2470
      && packet?.playerId === 2
      && packet?.runAheadCommandId === 316
      && runtime?.enabled === true
      && runtime?.connected === true
      && runtime?.sent === 1
      && runtime?.sentBytes === packet.bytes + 6
      && runtime?.lastSent?.bytes === runtime.sentBytes
      && runtime?.lastSent?.ip === 2130706434
      && runtime?.lastSent?.port === 8088,
    "source context did not send through the live browser UDP WebSocket endpoint", sendResult);
}

function assertReceive(receiveResult, sendResult) {
  const probe = receiveResult?.receiveProbe;
  const runtime = receiveResult?.browserUdpEndpointRuntime;
  const packet = probe?.packet;
  const transport = probe?.transport;
  const frameData = probe?.frameData;
  const sentPacket = sendResult?.sendProbe?.packet;
  expect(receiveResult?.ok === true
      && probe?.ok === true
      && probe.source === "GameNetwork browser live WebSocket Transport receive probe"
      && probe.browserTransport === "browser WebSocket live UDP endpoint"
      && probe.productionTransport === true
      && probe.originalWireReceive === "Module.cncPortBrowserUdpRecv -> Transport::doRecv decryptBuf/isGeneralsPacket"
      && probe.originalTransport === "Transport::m_inBuffer"
      && probe.originalRelay === "ConnectionManager::doRelay"
      && probe.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
      && packet?.bytes === sentPacket?.bytes
      && packet?.hex === sentPacket?.hex
      && packet?.commands === sentPacket?.commands
      && packet?.commandType === sentPacket?.commandType
      && packet?.executionFrame === sentPacket?.executionFrame
      && packet?.playerId === sentPacket?.playerId
      && packet?.runAheadCommandId === sentPacket?.runAheadCommandId
      && transport?.initialized === true
      && transport?.doRecvDriven === true
      && transport?.buffered === true
      && transport?.bufferedSlot === 0
      && transport?.cleared === true
      && transport?.adapterReads === 1
      && transport?.fallbackIncoming === 0
      && transport?.crcValid === true
      && runtime?.enabled === true
      && runtime?.received === 1
      && runtime?.delivered === 1
      && runtime?.receivedBytes === sentPacket.bytes + 6
      && runtime?.deliveredBytes === sentPacket.bytes + 6
      && runtime?.queuedIncoming === 0
      && frameData?.ready === true
      && frameData?.managerReady === true
      && frameData?.readyState === 2
      && frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
      && frameData?.storedCommandId === sentPacket.runAheadCommandId
      && frameData?.storedExecutionFrame === sentPacket.executionFrame
      && frameData?.storedPlayerId === sentPacket.playerId
      && frameData?.storedRunAhead === sentPacket.runAhead
      && frameData?.storedFrameRate === sentPacket.frameRate,
    "destination context did not receive through the live browser UDP WebSocket endpoint", receiveResult);
}

async function waitForEndpointReceive(page) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = await page.evaluate(() => window.CnCPort.rpc("browserUdpEndpointState"));
    if (state.runtime?.received > 0) {
      return state;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("timed out waiting for destination browser UDP endpoint receive");
}

let browser;
let sourceClient;
let destinationClient;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  sourceClient = await createClient(browser, harnessUrl, "live-websocket-source", browserEvents);
  destinationClient = await createClient(browser, harnessUrl, "live-websocket-destination", browserEvents);
  expect(sourceClient.context !== destinationClient.context,
    "Live WebSocket transport smoke did not create isolated browser contexts", {});

  const destinationConnect = await destinationClient.page.evaluate((webSocketUrl) =>
    window.CnCPort.rpc("browserUdpEndpointConnect", {
      webSocketUrl,
      client: "live-websocket-destination",
      incomingIp: 2130706433,
      incomingPort: 8088,
    }), relayServer.url);
  expect(destinationConnect.ok === true, "destination live UDP endpoint did not connect", destinationConnect);

  const sourceConnect = await sourceClient.page.evaluate((webSocketUrl) =>
    window.CnCPort.rpc("browserUdpEndpointConnect", {
      webSocketUrl,
      client: "live-websocket-source",
      incomingIp: 2130706433,
      incomingPort: 8088,
    }), relayServer.url);
  expect(sourceConnect.ok === true, "source live UDP endpoint did not connect", sourceConnect);
  await relayServer.waitForConnections(2);

  const sendResult = await sourceClient.page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkTransportLiveSendProbe"));
  assertSend(sendResult);

  const relayStats = await relayServer.waitForForwardedFrames(1);
  const destinationState = await waitForEndpointReceive(destinationClient.page);
  expect(destinationState.runtime?.received === 1
      && destinationState.runtime?.receivedBytes === sendResult.browserUdpEndpointRuntime.sentBytes,
    "destination endpoint did not queue exactly one WebSocket-delivered UDP datagram", destinationState);

  const receiveResult = await destinationClient.page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkTransportLiveReceiveProbe"));
  assertReceive(receiveResult, sendResult);

  const finalRelayStats = relayServer.stats();
  expect(finalRelayStats.receivedFrames === 1
      && finalRelayStats.forwardedFrames === 1
      && finalRelayStats.receivedBytes === sendResult.browserUdpEndpointRuntime.sentBytes
      && finalRelayStats.forwardedBytes === sendResult.browserUdpEndpointRuntime.sentBytes,
    "WebSocket relay server did not forward exactly one live UDP transport datagram", finalRelayStats);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error during live WebSocket transport smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-network-websocket-live-transport",
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
      nextRequired: "twoBrowserClientsShareProductionTransportAdapterForNetworkUpdate",
    },
    source: {
      client: "live-websocket-source",
      wasm: sendResult.state?.wasm,
      originalSerializer: sendResult.sendProbe.originalSerializer,
      originalWireSend: sendResult.sendProbe.originalWireSend,
      transport: sendResult.sendProbe.transport,
      endpoint: sendResult.browserUdpEndpointRuntime,
      packet: sendResult.sendProbe.packet,
    },
    destination: {
      client: "live-websocket-destination",
      wasm: receiveResult.state?.wasm,
      originalWireReceive: receiveResult.receiveProbe.originalWireReceive,
      originalTransport: receiveResult.receiveProbe.originalTransport,
      originalRelay: receiveResult.receiveProbe.originalRelay,
      originalFrameData: receiveResult.receiveProbe.originalFrameData,
      endpointBeforeRecv: destinationState.runtime,
      endpoint: receiveResult.browserUdpEndpointRuntime,
      packet: receiveResult.receiveProbe.packet,
      transport: receiveResult.receiveProbe.transport,
      connectionManager: receiveResult.receiveProbe.connectionManager,
      frameData: receiveResult.receiveProbe.frameData,
    },
    relayStats: finalRelayStats,
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await sourceClient?.context.close();
  await destinationClient?.context.close();
  await browser?.close();
  await relayServer.close();
  await server.close();
}
