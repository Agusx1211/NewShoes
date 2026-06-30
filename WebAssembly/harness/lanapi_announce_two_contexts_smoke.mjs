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
      && buildProbe.source === "GameNetwork browser LANAPI announce build probe"
      && buildProbe.lanApiReady === true
      && buildProbe.originalMessage === "LANMessage::MSG_GAME_ANNOUNCE"
      && buildProbe.originalSerializer === "LANMessage struct byte payload"
      && buildProbe.nextRequired === "lanApiJoinOrProductionTransport"
      && typeof packet?.hex === "string"
      && packet.hex.length > 0
      && packet.bytes > 0
      && packet.messageType === "MSG_GAME_ANNOUNCE"
      && packet.remoteIp === 0x7f000002
      && packet.localIp === 0x7f000001
      && packet.port === 8086
      && packet.gameName === "Browser LAN Game"
      && packet.playerName === "Browser Host"
      && packet.map === "Maps/TournamentDesert"
      && packet.parsedMap === "Maps/TournamentDesert/TournamentDesert.map"
      && packet.seed === 98765
      && packet.mapCRC === 0x1234abcd
      && packet.mapSize === 43210
      && packet.crcInterval === 100
      && packet.startingCash === 0
      && packet.slotList === "X:X:X:X:X:X:X:X",
    "source browser context did not build the expected original LANAPI announce packet", buildProbe);
}

function assertReceiveProbe(receiveProbe, buildPacket) {
  const packet = receiveProbe?.packet;
  expect(receiveProbe?.ok === true
      && receiveProbe.source === "GameNetwork browser LANAPI announce relay probe"
      && receiveProbe.lanApiReady === true
      && receiveProbe.browserTransport === "harness relay queue"
      && receiveProbe.originalTransport === "Transport::m_inBuffer"
      && receiveProbe.originalDispatch === "LANAPI::update"
      && receiveProbe.originalHandler === "LANAPI::handleGameAnnounce"
      && receiveProbe.originalParser === "ParseGameOptionsString"
      && receiveProbe.originalCallback === "LANAPI::OnGameList"
      && receiveProbe.nextRequired === "lanApiJoinOrProductionTransport"
      && packet?.decoded === true
      && packet.bytes === buildPacket.bytes
      && packet.messageType === buildPacket.messageType
      && packet.remoteIp === buildPacket.remoteIp
      && packet.localIp === buildPacket.localIp
      && packet.port === buildPacket.port
      && receiveProbe.globals?.ready === true
      && receiveProbe.transport?.injected === true
      && receiveProbe.transport?.cleared === true
      && receiveProbe.lanApi?.updateDriven === true
      && receiveProbe.lanApi?.handleGameAnnounceRecorded === true
      && receiveProbe.lanApi?.onGameListCalls === 1
      && receiveProbe.lanApi?.gamesSeen === 1
      && receiveProbe.game?.recorded === true
      && receiveProbe.game?.gameName === buildPacket.gameName
      && receiveProbe.game?.map === buildPacket.parsedMap
      && receiveProbe.game?.mapOk === true
      && receiveProbe.game?.seed === buildPacket.seed
      && receiveProbe.game?.mapCRC === buildPacket.mapCRC
      && receiveProbe.game?.mapSize === buildPacket.mapSize
      && receiveProbe.game?.crcInterval === buildPacket.crcInterval
      && receiveProbe.game?.startingCash === buildPacket.startingCash
      && receiveProbe.game?.closedSlots === 8
      && receiveProbe.game?.slotsClosed === true
      && receiveProbe.game?.inProgress === false
      && receiveProbe.game?.directConnect === false,
    "destination browser context did not route the announce through original LANAPI game discovery", receiveProbe);
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
    "LANAPI smoke did not create isolated browser contexts", {});

  const buildResult = await sourceClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiAnnounceBuildPacket"));
  expect(buildResult.ok === true, "source context LANAPI announce build RPC failed", buildResult);
  assertBuildProbe(buildResult.buildProbe);

  const packetHex = buildResult.buildProbe.packet.hex;
  const receiveResult = await destinationClient.page.evaluate((hex) =>
    window.CnCPort.rpc("browserLanApiAnnounceAcceptPacket", { packetHex: hex }), packetHex);
  expect(receiveResult.ok === true, "destination context LANAPI announce accept RPC failed", receiveResult);
  assertReceiveProbe(receiveResult.receiveProbe, buildResult.buildProbe.packet);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error while relaying LANAPI announce", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-lanapi-announce-two-contexts",
    harnessUrl,
    browserContexts: 2,
    isolatedContexts: true,
    relay: {
      browserTransport: "Node-mediated LANMessage hex handoff between isolated Playwright contexts",
      productionTransport: false,
      nextRequired: "lanApiJoinOrProductionTransport",
    },
    source: {
      client: "browser-client-0",
      wasm: buildResult.state?.wasm,
      originalSerializer: buildResult.buildProbe.originalSerializer,
      packet: {
        bytes: buildResult.buildProbe.packet.bytes,
        messageType: buildResult.buildProbe.packet.messageType,
        remoteIp: buildResult.buildProbe.packet.remoteIp,
        localIp: buildResult.buildProbe.packet.localIp,
        port: buildResult.buildProbe.packet.port,
        gameName: buildResult.buildProbe.packet.gameName,
        map: buildResult.buildProbe.packet.map,
        seed: buildResult.buildProbe.packet.seed,
      },
    },
    destination: {
      client: "browser-client-1",
      wasm: receiveResult.state?.wasm,
      originalTransport: receiveResult.receiveProbe.originalTransport,
      originalDispatch: receiveResult.receiveProbe.originalDispatch,
      originalHandler: receiveResult.receiveProbe.originalHandler,
      originalParser: receiveResult.receiveProbe.originalParser,
      originalCallback: receiveResult.receiveProbe.originalCallback,
      transport: receiveResult.receiveProbe.transport,
      lanApi: receiveResult.receiveProbe.lanApi,
      game: receiveResult.receiveProbe.game,
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
