#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startNostrTestRelayServer } from "./nostr-test-relay-server.mjs";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot });
const publicDiscovery = process.env.CNC_TRYSTERO_PUBLIC === "1";
const configuredRelayUrls = String(process.env.CNC_TRYSTERO_RELAYS ?? "")
  .split(",").map((url) => url.trim()).filter(Boolean);
const lateJoinDelayMs = Number.parseInt(process.env.CNC_LATE_JOIN_DELAY_MS ?? "0", 10);
if (!Number.isInteger(lateJoinDelayMs) || lateJoinDelayMs < 0) {
  throw new Error("CNC_LATE_JOIN_DELAY_MS must be a non-negative integer");
}
let relayUrls = configuredRelayUrls;

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

async function createClient(browser, harnessUrl, label, browserEvents) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: process.env.CNC_IGNORE_HTTPS_ERRORS === "1",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    browserEvents.push({ client: label, type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ client: label, type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => browserEvents.push({ client: label, type: "crash" }));
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  const boot = await page.evaluate((source) => window.CnCPort.rpc("boot", { source }), label);
  expect(boot.ok === true && boot.state?.wasm === "loaded",
    `${label} browser context did not boot the wasm harness`, boot);
  await page.evaluate(() => window.__cncSetNetworkDiagnostics?.(true, {
    reset: true,
    reason: "webrtc-transport-smoke",
  }));
  return { context, page, boot };
}

async function connectClient(client, room, peerId) {
  const result = await client.page.evaluate(({ relays, roomName, id }) =>
    window.CnCPort.rpc("browserWebRtcEndpointConnect", {
      room: roomName,
      peerId: id,
      displayName: id,
      iceServers: [],
      relayUrls: relays.length ? relays : null,
      timeoutMs: 30000,
    }), { relays: relayUrls, roomName: room, id: peerId });
  expect(result.ok === true, `${peerId} failed to join the WebRTC room`, result);
  return result;
}

async function waitForPeer(client, peerId) {
  const result = await client.page.evaluate(() =>
    window.CnCPort.rpc("browserWebRtcEndpointWaitForPeers", { count: 1, timeoutMs: 60000 }));
  expect(result.ok === true
      && result.runtime?.endpoint?.openPeers === 1
      && result.runtime?.relayTransport === false
      && result.runtime?.endpoint?.discoveryStrategy === "trystero-nostr"
      && result.runtime?.endpoint?.peers?.[0]?.channelLabel === "cnc-udp-v1"
      && result.runtime?.endpoint?.peers?.[0]?.channelProtocol === "cnc-generals-udp-v1"
      && result.runtime?.endpoint?.peers?.[0]?.ordered === true,
    `${peerId} did not open its P2P data channel`, result);
  return result;
}

async function waitForDatagram(client) {
  for (let attempt = 0; attempt < 100; ++attempt) {
    const result = await client.page.evaluate(() =>
      window.CnCPort.rpc("browserWebRtcEndpointState"));
    if (result.runtime?.queuedIncoming === 1) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("timed out waiting for the WebRTC P2P transport datagram");
}

let browser;
let source;
let destination;
const browserEvents = [];
let testRelay;

try {
  if (!publicDiscovery && configuredRelayUrls.length === 0) {
    testRelay = await startNostrTestRelayServer();
  }
  relayUrls = testRelay ? [testRelay.url] : configuredRelayUrls;
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const room = `webrtc-transport-${Date.now()}`;
  source = await createClient(browser, harnessUrl, "webrtc-source", browserEvents);
  destination = await createClient(browser, harnessUrl, "webrtc-destination", browserEvents);

  const sourceConnect = await connectClient(source, room, "source");
  if (lateJoinDelayMs > 0) {
    await new Promise((resolveWait) => setTimeout(resolveWait, lateJoinDelayMs));
  }
  const destinationConnect = await connectClient(destination, room, "destination");
  const [sourceReady, destinationReady] = await Promise.all([
    waitForPeer(source, "source"),
    waitForPeer(destination, "destination"),
  ]);

  expect((sourceReady.runtime.endpoint.localIp >>> 24) === 10
      && (destinationReady.runtime.endpoint.localIp >>> 24) === 10
      && sourceReady.runtime.endpoint.localIp !== destinationReady.runtime.endpoint.localIp,
    "Trystero peer IDs did not map to unique private virtual IPv4 addresses", {
      source: sourceReady.runtime.endpoint.localIp,
      destination: destinationReady.runtime.endpoint.localIp,
    });

  const reconnectResult = await destination.page.evaluate(() =>
    window.CnCPort.rpc("browserWebRtcEndpointReconnect"));
  expect(reconnectResult.ok === true
      && reconnectResult.runtime?.reconnectCount === 1,
  "destination endpoint did not accept a reconnect request", reconnectResult);
  const [sourceRecovered, destinationRecovered] = await Promise.all([
    waitForPeer(source, "source after destination reconnect"),
    waitForPeer(destination, "destination after reconnect"),
  ]);
  expect(sourceRecovered.runtime?.endpoint?.openPeers === 1
      && destinationRecovered.runtime?.endpoint?.openPeers === 1,
  "both WebRTC endpoints did not recover their peer channel",
  { sourceRecovered, destinationRecovered });

  const sendResult = await source.page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkTransportWebRtcSendProbe"));
  expect(sendResult.ok === true
      && sendResult.sendProbe?.transport?.adapterWrites === 1
      && sendResult.sendProbe?.transport?.fallbackOutgoing === 0
      && sendResult.browserWebRtcUdpEndpointRuntime?.endpoint?.sent === 1,
    "original Transport::doSend did not write through WebRTC", sendResult);

  const queued = await waitForDatagram(destination);
  expect(queued.runtime?.lastReceived?.ip === sourceReady.runtime.endpoint.localIp
      && queued.runtime?.lastReceived?.port === 8088,
    "WebRTC did not preserve the virtual source address and UDP source port", queued);

  const receiveResult = await destination.page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkTransportWebRtcReceiveProbe"));
  expect(receiveResult.ok === true
      && receiveResult.receiveProbe?.transport?.adapterReads === 1
      && receiveResult.receiveProbe?.transport?.fallbackIncoming === 0
      && receiveResult.receiveProbe?.transport?.crcValid === true
      && receiveResult.receiveProbe?.frameData?.ready === true,
    "original Transport::doRecv/ConnectionManager frame path did not consume WebRTC bytes", receiveResult);

  const [sourceFinal, destinationFinal] = await Promise.all([
    source.page.evaluate(() => window.CnCPort.rpc("browserWebRtcEndpointState")),
    destination.page.evaluate(() => window.CnCPort.rpc("browserWebRtcEndpointState")),
  ]);
  expect(sourceFinal.runtime?.endpoint?.sent === 1
      && destinationFinal.runtime?.endpoint?.received === 1,
    "final Trystero endpoint counters did not record the direct game datagram",
    { sourceFinal, destinationFinal });

  await new Promise((resolveWait) => setTimeout(resolveWait, 1100));
  const [sourceDiagnostics, destinationDiagnostics] = await Promise.all([
    source.page.evaluate(() => window.__cncNetworkDiagnosticsSnapshot?.()),
    destination.page.evaluate(() => window.__cncNetworkDiagnosticsSnapshot?.()),
  ]);
  const sentPacket = sourceDiagnostics?.packets?.find((packet) =>
    packet.direction === "send" && packet.outcome === "sent");
  const receivedPacket = destinationDiagnostics?.packets?.find((packet) =>
    packet.direction === "receive" && packet.outcome === "queued-for-engine");
  expect(sentPacket?.payloadHex?.length === sentPacket?.byteLength * 2
      && receivedPacket?.payloadHex === sentPacket.payloadHex
      && sourceDiagnostics?.rtcSamples?.length > 0
      && destinationDiagnostics?.rtcSamples?.length > 0,
    "detailed diagnostics did not preserve packet bytes and RTC samples",
    { sourceDiagnostics, destinationDiagnostics });

  expect(sourceConnect.runtime?.endpoint?.openRelays > 0
      && destinationConnect.runtime?.endpoint?.openRelays > 0,
    "Trystero did not connect each browser to a discovery relay", { sourceConnect, destinationConnect });
  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context failed during WebRTC transport smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-network-webrtc-live-transport",
    browserContexts: 2,
    p2p: true,
    reliable: true,
    ordered: true,
    lateJoinDelayMs,
    gameBytesRelayedByDiscovery: 0,
    source: sourceFinal.runtime.endpoint,
    destination: destinationFinal.runtime.endpoint,
    packet: sendResult.sendProbe.packet,
    receive: receiveResult.receiveProbe.frameData,
    diagnostics: {
      source: sourceDiagnostics.retained,
      destination: destinationDiagnostics.retained,
      payloadHex: sentPacket.payloadHex,
    },
    discovery: {
      strategy: "trystero-nostr",
      testRelay: testRelay?.stats() ?? null,
      configuredRelays: relayUrls,
      sourceRelays: sourceConnect.runtime.endpoint.relays,
      destinationRelays: destinationConnect.runtime.endpoint.relays,
    },
    browserFailures,
  }));
} finally {
  await source?.context.close();
  await destination?.context.close();
  await browser?.close();
  await testRelay?.close();
  await server.close();
}
