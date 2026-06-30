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

function assertJoinRequestBuild(buildProbe) {
  const packet = buildProbe?.packet;
  expect(buildProbe?.ok === true
      && buildProbe.source === "GameNetwork browser LANAPI join request build probe"
      && buildProbe.lanApiReady === true
      && buildProbe.originalRequest === "LANAPI::RequestGameJoin"
      && buildProbe.originalTransport === "Transport::queueSend"
      && buildProbe.nextRequired === "lanApiJoinAcceptAndGameOptions"
      && typeof packet?.hex === "string"
      && packet.hex.length > 0
      && packet.bytes > 0
      && packet.messageType === "MSG_REQUEST_JOIN"
      && packet.remoteIp === 0x7f000002
      && packet.localIp === 0x7f000003
      && packet.port === 8086
      && packet.gameIP === 0x7f000002
      && packet.iniCRC === 0x13572468
      && packet.exeCRC === 0x24681357
      && buildProbe.lanApi?.gamesSeen === 1
      && buildProbe.lanApi?.pendingJoinQueued === true,
    "joiner browser context did not build the expected original LANAPI join request", buildProbe);
}

function assertHostJoinRequest(hostProbe, requestPacket) {
  const packet = hostProbe?.packet;
  const reply = hostProbe?.reply;
  expect(hostProbe?.ok === true
      && hostProbe.source === "GameNetwork browser LANAPI join request relay probe"
      && hostProbe.lanApiReady === true
      && hostProbe.browserTransport === "harness relay queue"
      && hostProbe.originalTransport === "Transport::m_inBuffer"
      && hostProbe.originalDispatch === "LANAPI::update"
      && hostProbe.originalHandler === "LANAPI::handleRequestJoin"
      && hostProbe.originalCallback === "LANAPI::OnPlayerJoin"
      && hostProbe.originalReply === "LANAPI::RequestGameOptions"
      && hostProbe.nextRequired === "lanApiJoinAcceptIntoClient"
      && packet?.decoded === true
      && packet.bytes === requestPacket.bytes
      && packet.messageType === requestPacket.messageType
      && packet.remoteIp === requestPacket.localIp
      && packet.localIp === requestPacket.remoteIp
      && packet.port === requestPacket.port
      && packet.gameIP === requestPacket.gameIP
      && hostProbe.transport?.injected === true
      && hostProbe.transport?.cleared === true
      && hostProbe.lanApi?.updateDriven === true
      && hostProbe.lanApi?.hostGameReady === true
      && hostProbe.lanApi?.onPlayerJoinCalls === 1
      && hostProbe.game?.joinerAdded === true
      && hostProbe.game?.slotPosition === 1
      && hostProbe.game?.playerIP === 0x7f000003
      && typeof reply?.joinAcceptHex === "string"
      && reply.joinAcceptHex.length > 0
      && typeof reply?.gameOptionsHex === "string"
      && reply.gameOptionsHex.length > 0
      && reply.joinAcceptType === "MSG_JOIN_ACCEPT"
      && reply.gameOptionsType === "MSG_GAME_OPTIONS"
      && reply.optionsLength > 0,
    "host browser context did not accept the join through original LANAPI and emit replies", hostProbe);
}

function assertJoinerAcceptOptions(joinerProbe) {
  expect(joinerProbe?.ok === true
      && joinerProbe.source === "GameNetwork browser LANAPI join accept/options relay probe"
      && joinerProbe.lanApiReady === true
      && joinerProbe.browserTransport === "harness relay queue"
      && joinerProbe.originalTransport === "Transport::m_inBuffer"
      && joinerProbe.originalDispatch === "LANAPI::update"
      && joinerProbe.originalHandlers === "LANAPI::handleJoinAccept+LANAPI::handleGameOptions"
      && joinerProbe.originalParser === "GameInfoToAsciiString -> ParseAsciiStringToGameInfo"
      && joinerProbe.originalCallbacks === "LANAPI::OnGameJoin+LANAPI::OnGameOptions"
      && joinerProbe.nextRequired === "lanApiGameStartOrProductionTransport"
      && joinerProbe.packets?.joinAcceptDecoded === true
      && joinerProbe.packets?.gameOptionsDecoded === true
      && joinerProbe.packets?.joinAcceptType === "MSG_JOIN_ACCEPT"
      && joinerProbe.packets?.gameOptionsType === "MSG_GAME_OPTIONS"
      && joinerProbe.packets?.slotPosition === 1
      && joinerProbe.packets?.playerIP === 0x7f000003
      && joinerProbe.packets?.gameIP === 0x7f000002
      && joinerProbe.transport?.joinAcceptInjected === true
      && joinerProbe.transport?.joinAcceptCleared === true
      && joinerProbe.transport?.gameOptionsInjected === true
      && joinerProbe.transport?.gameOptionsCleared === true
      && joinerProbe.lanApi?.acceptUpdateDriven === true
      && joinerProbe.lanApi?.optionsUpdateDriven === true
      && joinerProbe.lanApi?.inLobby === false
      && joinerProbe.lanApi?.onGameJoinCalls === 1
      && joinerProbe.lanApi?.lastGameJoinReturn === 0
      && joinerProbe.lanApi?.onGameOptionsCalls >= 1
      && joinerProbe.lanApi?.lastGameOptionsPlayerIP === 0x7f000002
      && joinerProbe.lanApi?.lastGameOptionsPlayerSlot === 0
      && joinerProbe.game?.joinRecorded === true
      && joinerProbe.game?.optionsRecorded === true
      && joinerProbe.game?.optionsParsed === true
      && joinerProbe.game?.localSlot === 1
      && joinerProbe.game?.hostSlotReady === true
      && joinerProbe.game?.joinerSlotReady === true
      && joinerProbe.game?.mapCRC === 0x1234abcd
      && joinerProbe.game?.mapSize === 43210
      && joinerProbe.game?.seed === 98765
      && joinerProbe.game?.crcInterval === 100,
    "joiner browser context did not consume the accept/options replies through original LANAPI", joinerProbe);
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
let joinerClient;
let hostClient;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  joinerClient = await createClient(browser, harnessUrl, "browser-client-1", browserEvents);
  hostClient = await createClient(browser, harnessUrl, "browser-client-0", browserEvents);
  expect(joinerClient.context !== hostClient.context,
    "LANAPI join/options smoke did not create isolated browser contexts", {});

  const buildResult = await joinerClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiJoinRequestBuildPacket"));
  expect(buildResult.ok === true, "joiner context LANAPI join request build RPC failed", buildResult);
  assertJoinRequestBuild(buildResult.buildProbe);

  const requestHex = buildResult.buildProbe.packet.hex;
  const hostResult = await hostClient.page.evaluate((hex) =>
    window.CnCPort.rpc("browserLanApiJoinRequestAcceptPacket", { packetHex: hex }), requestHex);
  expect(hostResult.ok === true, "host context LANAPI join request accept RPC failed", hostResult);
  assertHostJoinRequest(hostResult.hostProbe, buildResult.buildProbe.packet);

  const joinAcceptHex = hostResult.hostProbe.reply.joinAcceptHex;
  const gameOptionsHex = hostResult.hostProbe.reply.gameOptionsHex;
  const joinerResult = await joinerClient.page.evaluate((payload) =>
    window.CnCPort.rpc("browserLanApiJoinAcceptAcceptPacket", payload), { joinAcceptHex, gameOptionsHex });
  expect(joinerResult.ok === true, "joiner context LANAPI join accept/options RPC failed", joinerResult);
  assertJoinerAcceptOptions(joinerResult.joinerProbe);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error while relaying LANAPI join/options", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-lanapi-join-options-two-contexts",
    harnessUrl,
    browserContexts: 2,
    isolatedContexts: true,
    relay: {
      browserTransport: "Node-mediated LANMessage hex handoff between isolated Playwright contexts",
      productionTransport: false,
      nextRequired: "lanApiGameStartOrProductionTransport",
    },
    source: {
      client: "browser-client-1",
      wasm: buildResult.state?.wasm,
      originalRequest: buildResult.buildProbe.originalRequest,
      originalTransport: buildResult.buildProbe.originalTransport,
      packet: {
        bytes: buildResult.buildProbe.packet.bytes,
        messageType: buildResult.buildProbe.packet.messageType,
        remoteIp: buildResult.buildProbe.packet.remoteIp,
        localIp: buildResult.buildProbe.packet.localIp,
        port: buildResult.buildProbe.packet.port,
        gameIP: buildResult.buildProbe.packet.gameIP,
      },
    },
    host: {
      client: "browser-client-0",
      wasm: hostResult.state?.wasm,
      originalTransport: hostResult.hostProbe.originalTransport,
      originalDispatch: hostResult.hostProbe.originalDispatch,
      originalHandler: hostResult.hostProbe.originalHandler,
      originalCallback: hostResult.hostProbe.originalCallback,
      originalReply: hostResult.hostProbe.originalReply,
      transport: hostResult.hostProbe.transport,
      lanApi: hostResult.hostProbe.lanApi,
      game: hostResult.hostProbe.game,
      reply: {
        joinAcceptType: hostResult.hostProbe.reply.joinAcceptType,
        gameOptionsType: hostResult.hostProbe.reply.gameOptionsType,
        optionsLength: hostResult.hostProbe.reply.optionsLength,
      },
    },
    joiner: {
      client: "browser-client-1",
      wasm: joinerResult.state?.wasm,
      originalTransport: joinerResult.joinerProbe.originalTransport,
      originalDispatch: joinerResult.joinerProbe.originalDispatch,
      originalHandlers: joinerResult.joinerProbe.originalHandlers,
      originalParser: joinerResult.joinerProbe.originalParser,
      originalCallbacks: joinerResult.joinerProbe.originalCallbacks,
      transport: joinerResult.joinerProbe.transport,
      lanApi: joinerResult.joinerProbe.lanApi,
      game: joinerResult.joinerProbe.game,
    },
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await joinerClient?.context.close();
  await hostClient?.context.close();
  await browser?.close();
  await server.close();
}
