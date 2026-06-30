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

function assertBuildProbe(buildProbe) {
  const packet = buildProbe?.packet;
  expect(buildProbe?.ok === true
      && buildProbe.source === "GameNetwork browser Transport/FrameData packet build probe"
      && buildProbe.transportReady === true
      && buildProbe.originalSerializer === "NetPacket::addCommand"
      && buildProbe.nextRequired === "twoBrowserContextsOrLanApiRelay"
      && typeof packet?.hex === "string"
      && packet.hex.length > 0
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
      && receiveProbe.browserTransport === "harness relay queue"
      && receiveProbe.originalTransport === "Transport::m_inBuffer"
      && receiveProbe.originalRelay === "ConnectionManager::doRelay"
      && receiveProbe.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
      && receiveProbe.nextRequired === "twoBrowserContextsOrLanApiRelay"
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
      && frameData?.frameCommandCount === 1
      && frameData?.commandCount === 1
      && frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
      && frameData?.storedCommandId === buildPacket.runAheadCommandId
      && frameData?.storedExecutionFrame === buildPacket.executionFrame
      && frameData?.storedPlayerId === buildPacket.playerId
      && frameData?.storedRunAhead === buildPacket.runAhead
      && frameData?.storedFrameRate === buildPacket.frameRate,
    "destination browser context did not accept the packet through original Transport/FrameData readiness", receiveProbe);
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
  sourceClient = await createClient(browser, harnessUrl, "browser-client-0", browserEvents);
  destinationClient = await createClient(browser, harnessUrl, "browser-client-1", browserEvents);
  expect(sourceClient.context !== destinationClient.context,
    "network smoke did not create isolated browser contexts", {});

  const destinationBefore = await destinationClient.page.evaluate(() => window.CnCPort.rpc("state"));
  expect(destinationBefore.state?.browserNetworkTransportRuntime?.sent === 0
      && destinationBefore.state?.browserNetworkTransportRuntime?.received === 0,
    "destination context had network transport runtime state before packet relay", destinationBefore.state?.browserNetworkTransportRuntime);

  const buildResult = await sourceClient.page.evaluate(() =>
    window.CnCPort.rpc("browserNetworkTransportBuildPacket"));
  expect(buildResult.ok === true, "source context packet build RPC failed", buildResult);
  assertBuildProbe(buildResult.buildProbe);

  const packetHex = buildResult.buildProbe.packet.hex;
  const receiveResult = await destinationClient.page.evaluate((hex) =>
    window.CnCPort.rpc("browserNetworkTransportAcceptPacket", { packetHex: hex }), packetHex);
  expect(receiveResult.ok === true, "destination context packet accept RPC failed", receiveResult);
  assertReceiveProbe(receiveResult.receiveProbe, buildResult.buildProbe.packet);
  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error while relaying network packet", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-network-two-contexts",
    harnessUrl,
    browserContexts: 2,
    isolatedContexts: true,
    relay: {
      browserTransport: "Node-mediated packet.hex handoff between isolated Playwright contexts",
      productionTransport: false,
      nextRequired: "LANAPIOrWebSocketDataChannel",
    },
    source: {
      client: "browser-client-0",
      wasm: buildResult.state?.wasm,
      originalSerializer: buildResult.buildProbe.originalSerializer,
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
      client: "browser-client-1",
      wasm: receiveResult.state?.wasm,
      originalTransport: receiveResult.receiveProbe.originalTransport,
      originalRelay: receiveResult.receiveProbe.originalRelay,
      originalFrameData: receiveResult.receiveProbe.originalFrameData,
      transport: receiveResult.receiveProbe.transport,
      connectionManager: receiveResult.receiveProbe.connectionManager,
      frameData: receiveResult.receiveProbe.frameData,
    },
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await sourceClient?.context.close();
  await destinationClient?.context.close();
  await browser?.close();
  await server.close();
}
