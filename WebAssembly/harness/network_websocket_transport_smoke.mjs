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

function assertBuildProbe(buildProbe) {
  const packet = buildProbe?.packet;
  expect(buildProbe?.ok === true
      && buildProbe.source === "GameNetwork browser Transport/FrameData packet build probe"
      && buildProbe.transportReady === true
      && buildProbe.originalSerializer === "NetPacket::addCommand"
      && typeof packet?.hex === "string"
      && packet.hex.length === packet.bytes * 2
      && packet.bytes > 0
      && packet.commands === 2
      && packet.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
      && packet.relay === 4
      && packet.executionFrame === 2470
      && packet.playerId === 2
      && packet.commandId === 315
      && packet.frameCommandCount === 1
      && packet.runAheadCommandId === 316
      && packet.runAhead === 20
      && packet.frameRate === 30,
    "source browser context did not build the expected original GameNetwork transport packet", buildProbe);
}

function assertReceiveProbe(receiveProbe, buildPacket) {
  const packet = receiveProbe?.packet;
  const frameData = receiveProbe?.frameData;
  expect(receiveProbe?.ok === true
      && receiveProbe.source === "GameNetwork browser Transport/FrameData relay probe"
      && receiveProbe.transportReady === true
      && receiveProbe.originalTransport === "Transport::m_inBuffer"
      && receiveProbe.originalRelay === "ConnectionManager::doRelay"
      && receiveProbe.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
      && packet?.decoded === true
      && packet.bytes === buildPacket.bytes
      && packet.commands === buildPacket.commands
      && packet.commandType === buildPacket.commandType
      && packet.relay === buildPacket.relay
      && packet.executionFrame === buildPacket.executionFrame
      && packet.playerId === buildPacket.playerId
      && packet.commandId === buildPacket.commandId
      && packet.frameCommandCount === buildPacket.frameCommandCount
      && packet.runAheadCommandId === buildPacket.runAheadCommandId
      && packet.runAhead === buildPacket.runAhead
      && packet.frameRate === buildPacket.frameRate
      && receiveProbe.transport?.injected === true
      && receiveProbe.transport?.cleared === true
      && receiveProbe.connectionManager?.doRelayDriven === true
      && frameData?.ready === true
      && frameData?.managerReady === true
      && frameData?.readyState === 2
      && frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
      && frameData?.storedCommandId === buildPacket.runAheadCommandId
      && frameData?.storedExecutionFrame === buildPacket.executionFrame
      && frameData?.storedPlayerId === buildPacket.playerId
      && frameData?.storedRunAhead === buildPacket.runAhead
      && frameData?.storedFrameRate === buildPacket.frameRate,
    "destination browser context did not accept the WebSocket-delivered packet through original Transport/FrameData readiness", receiveProbe);
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
let sourceClient;
let destinationClient;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  sourceClient = await createClient(browser, harnessUrl, "websocket-source", browserEvents);
  destinationClient = await createClient(browser, harnessUrl, "websocket-destination", browserEvents);
  expect(sourceClient.context !== destinationClient.context,
    "WebSocket transport smoke did not create isolated browser contexts", {});

  const destinationReceivePromise = destinationClient.page.evaluate((webSocketUrl) =>
    new Promise((resolveResult, rejectResult) => {
      const socket = new WebSocket(webSocketUrl);
      const timeout = setTimeout(() => {
        socket.close();
        rejectResult(new Error("timed out waiting for WebSocket binary packet"));
      }, 5000);
      socket.binaryType = "arraybuffer";
      socket.onerror = () => {
        clearTimeout(timeout);
        rejectResult(new Error("destination WebSocket error"));
      };
      socket.onmessage = async (event) => {
        try {
          const bytes = new Uint8Array(event.data);
          const packetHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
          const acceptResult = await window.CnCPort.rpc("browserNetworkTransportAcceptPacket", { packetHex });
          clearTimeout(timeout);
          socket.close();
          resolveResult({
            ok: acceptResult.ok === true,
            websocket: {
              binaryType: socket.binaryType,
              receivedBytes: bytes.length,
              hexLength: packetHex.length,
            },
            acceptResult,
          });
        } catch (error) {
          clearTimeout(timeout);
          rejectResult(error);
        }
      };
    }), relayServer.url);
  await relayServer.waitForConnections(1);

  const buildResult = await sourceClient.page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkTransportBuildPacket"));
  expect(buildResult.ok === true, "source context packet build RPC failed", buildResult);
  assertBuildProbe(buildResult.buildProbe);

  const sendResult = await sourceClient.page.evaluate(({ webSocketUrl, packetHex }) =>
    new Promise((resolveResult, rejectResult) => {
      const socket = new WebSocket(webSocketUrl);
      const timeout = setTimeout(() => {
        socket.close();
        rejectResult(new Error("timed out sending WebSocket binary packet"));
      }, 5000);
      const bytePairs = packetHex.match(/../g) ?? [];
      const bytes = new Uint8Array(bytePairs.map((pair) => Number.parseInt(pair, 16)));
      socket.binaryType = "arraybuffer";
      socket.onerror = () => {
        clearTimeout(timeout);
        rejectResult(new Error("source WebSocket error"));
      };
      socket.onopen = () => {
        socket.send(bytes);
        setTimeout(() => {
          clearTimeout(timeout);
          socket.close();
          resolveResult({
            ok: true,
            binaryType: socket.binaryType,
            sentBytes: bytes.length,
            hexLength: packetHex.length,
          });
        }, 50);
      };
    }), {
    webSocketUrl: relayServer.url,
    packetHex: buildResult.buildProbe.packet.hex,
  });
  expect(sendResult.ok === true
      && sendResult.sentBytes === buildResult.buildProbe.packet.bytes
      && sendResult.hexLength === buildResult.buildProbe.packet.hex.length,
    "source context did not send the expected WebSocket binary packet", sendResult);

  const relayStats = await relayServer.waitForForwardedFrames(1);
  const destinationResult = await destinationReceivePromise;
  expect(destinationResult.ok === true, "destination context packet accept RPC failed", destinationResult);
  expect(destinationResult.websocket?.binaryType === "arraybuffer"
      && destinationResult.websocket.receivedBytes === buildResult.buildProbe.packet.bytes
      && destinationResult.websocket.hexLength === buildResult.buildProbe.packet.hex.length,
    "destination context did not receive the expected WebSocket binary payload", destinationResult.websocket);
  assertReceiveProbe(destinationResult.acceptResult.receiveProbe, buildResult.buildProbe.packet);

  const finalRelayStats = relayServer.stats();
  expect(finalRelayStats.receivedFrames === 1
      && finalRelayStats.forwardedFrames === 1
      && finalRelayStats.receivedBytes === buildResult.buildProbe.packet.bytes
      && finalRelayStats.forwardedBytes === buildResult.buildProbe.packet.bytes
      && finalRelayStats.lastFrame?.bytes === buildResult.buildProbe.packet.bytes
      && finalRelayStats.lastFrame?.forwarded === 1,
    "WebSocket relay server did not forward exactly one binary packet", finalRelayStats);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error during WebSocket transport smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-network-websocket-transport",
    harnessUrl,
    browserContexts: 2,
    isolatedContexts: true,
    relay: {
      browserTransport: "browser WebSocket binary relay",
      serverTransport: "Node WebSocket relay server",
      productionTransport: false,
      hexHandoff: false,
      binaryFrames: relayStats.forwardedFrames,
      nextRequired: "wireWebSocketBinaryTransportIntoTransportDoSendDoRecv",
    },
    source: {
      client: "websocket-source",
      wasm: buildResult.state?.wasm,
      originalSerializer: buildResult.buildProbe.originalSerializer,
      websocket: {
        binaryType: sendResult.binaryType,
        sentBytes: sendResult.sentBytes,
      },
      packet: {
        bytes: buildResult.buildProbe.packet.bytes,
        commands: buildResult.buildProbe.packet.commands,
        commandType: buildResult.buildProbe.packet.commandType,
        relay: buildResult.buildProbe.packet.relay,
        executionFrame: buildResult.buildProbe.packet.executionFrame,
        playerId: buildResult.buildProbe.packet.playerId,
        commandId: buildResult.buildProbe.packet.commandId,
        runAheadCommandId: buildResult.buildProbe.packet.runAheadCommandId,
      },
    },
    destination: {
      client: "websocket-destination",
      wasm: destinationResult.acceptResult.state?.wasm,
      websocket: destinationResult.websocket,
      originalTransport: destinationResult.acceptResult.receiveProbe.originalTransport,
      originalRelay: destinationResult.acceptResult.receiveProbe.originalRelay,
      originalFrameData: destinationResult.acceptResult.receiveProbe.originalFrameData,
      transport: destinationResult.acceptResult.receiveProbe.transport,
      connectionManager: destinationResult.acceptResult.receiveProbe.connectionManager,
      frameData: destinationResult.acceptResult.receiveProbe.frameData,
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
