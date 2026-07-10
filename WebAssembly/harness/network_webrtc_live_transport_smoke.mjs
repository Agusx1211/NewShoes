#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { attachWebRtcSignalingServer } from "./webrtc-signaling-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot });
const signaling = attachWebRtcSignalingServer({
  server: server.server,
  virtualIpBase: 0x7f000000,
});
const signalingUrl = new URL("/webrtc", server.url);
signalingUrl.protocol = "ws:";

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
  page.on("crash", () => browserEvents.push({ client: label, type: "crash" }));
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  const boot = await page.evaluate((source) => window.CnCPort.rpc("boot", { source }), label);
  expect(boot.ok === true && boot.state?.wasm === "loaded",
    `${label} browser context did not boot the wasm harness`, boot);
  return { context, page, boot };
}

async function connectClient(client, room, peerId) {
  const result = await client.page.evaluate(({ url, roomName, id }) =>
    window.CnCPort.rpc("browserWebRtcEndpointConnect", {
      signalingUrl: url,
      room: roomName,
      peerId: id,
      displayName: id,
      iceServers: [],
    }), { url: signalingUrl.href, roomName: room, id: peerId });
  expect(result.ok === true, `${peerId} failed to join the WebRTC room`, result);
  return result;
}

async function waitForPeer(client, peerId) {
  const result = await client.page.evaluate(() =>
    window.CnCPort.rpc("browserWebRtcEndpointWaitForPeers", { count: 1, timeoutMs: 15000 }));
  expect(result.ok === true
      && result.runtime?.endpoint?.openPeers === 1
      && result.runtime?.relayTransport === false,
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

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const room = `webrtc-transport-${Date.now()}`;
  source = await createClient(browser, harnessUrl, "webrtc-source", browserEvents);
  destination = await createClient(browser, harnessUrl, "webrtc-destination", browserEvents);

  const sourceConnect = await connectClient(source, room, "source");
  const destinationConnect = await connectClient(destination, room, "destination");
  await signaling.waitForPeers(2);
  const [sourceReady, destinationReady] = await Promise.all([
    waitForPeer(source, "source"),
    waitForPeer(destination, "destination"),
  ]);

  expect(sourceReady.runtime.endpoint.localIp === 0x7f000001
      && destinationReady.runtime.endpoint.localIp === 0x7f000002,
    "signaling did not assign deterministic virtual IPv4 addresses", {
      source: sourceReady.runtime.endpoint.localIp,
      destination: destinationReady.runtime.endpoint.localIp,
    });

  const sendResult = await source.page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkTransportWebRtcSendProbe"));
  expect(sendResult.ok === true
      && sendResult.sendProbe?.transport?.adapterWrites === 1
      && sendResult.sendProbe?.transport?.fallbackOutgoing === 0
      && sendResult.browserWebRtcUdpEndpointRuntime?.endpoint?.sent === 1,
    "original Transport::doSend did not write through WebRTC", sendResult);

  const queued = await waitForDatagram(destination);
  expect(queued.runtime?.lastReceived?.ip === 0x7f000001
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

  const signalingStats = signaling.stats();
  expect(signalingStats.relayedSignals > 0
      && signalingStats.binaryFramesRejected === 0
      && signalingStats.gamePayloadBytes === 0,
    "signaling server carried or rejected unexpected game payload bytes", signalingStats);
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
    gameBytesRelayedByServer: signalingStats.gamePayloadBytes,
    source: sourceReady.runtime.endpoint,
    destination: destinationReady.runtime.endpoint,
    packet: sendResult.sendProbe.packet,
    receive: receiveResult.receiveProbe.frameData,
    signaling: signalingStats,
    browserFailures,
  }));
} finally {
  await source?.context.close();
  await destination?.context.close();
  await browser?.close();
  signaling.close();
  await server.close();
}
