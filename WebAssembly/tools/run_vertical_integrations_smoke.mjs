#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const distRoot = resolve(wasmRoot, "dist");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function expect(condition, message, payload) {
  if (!condition) {
    fail(`${message}: ${JSON.stringify(payload)}`);
  }
}

function extractJson(stdout, label) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; --index) {
    const line = lines[index].trim();
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(lines.slice(index).join("\n"));
    } catch {
      // Continue scanning upward; most browser smokes emit pretty JSON.
    }
  }
  fail(`${label} did not emit a JSON result`);
}

function runNodeStep(step, root = wasmRoot) {
  const executable = resolve(root, step.file);
  console.log(`\n== ${step.name} ==`);
  const result = spawnSync(process.execPath, [executable, ...(step.args ?? [])], {
    cwd: wasmRoot,
    env: { ...process.env, ...(step.env ?? {}) },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
      if (!result.stdout.endsWith("\n")) {
        process.stdout.write("\n");
      }
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    fail(`${step.name} failed with exit code ${result.status}`);
  }

  const payload = extractJson(result.stdout, step.name);
  step.validate(payload);
  console.log(`${step.name}: ok`);
  return {
    name: step.name,
    file: step.file,
  };
}

function assertDeviceFrontier(payload, label) {
  const frontier = payload.originalEngineStartup?.deviceFactoryFrontier;
  expect(frontier?.firstUnownedInitFactory === "createAudioManager",
    `${label} did not preserve createAudioManager as the first unowned factory`, frontier);
  expect(frontier.firstUnownedInitLine === 434,
    `${label} did not preserve the createAudioManager line`, frontier);
  expect(frontier.factoryMappings?.CreateGameEngine === "Win32GameEngine",
    `${label} did not preserve the Win32GameEngine mapping`, frontier);
  expect((frontier.entries ?? []).find((entry) => entry.factory === "CreateGameEngine")?.ready === true,
    `${label} did not preserve browser CreateGameEngine construction readiness`, frontier);
  expect(frontier.factoryMappings?.createArchiveFileSystem === "Win32BIGFileSystem",
    `${label} did not preserve the archive filesystem mapping`, frontier);
  expect(frontier.factoryMappings?.createAudioManager === "MilesAudioManager",
    `${label} did not preserve the Miles audio mapping`, frontier);
}

function hasBaseIniArchive(payload) {
  return (payload.optionalBaseArchives ?? []).some((archive) =>
    archive.sourceName === "INI.big" && archive.mountName === "ZZBase_INI.big");
}

function assertStartupSingletonFrontier(payload, label) {
  const startup = payload.originalEngineStartup;
  const frontier = startup?.deviceFactoryFrontier;
  const entries = frontier?.entries ?? [];
  const byFactory = new Map(entries.map((entry) => [entry.factory, entry]));
  const baseIniMounted = hasBaseIniArchive(payload);
  const expectedSingletonReady = baseIniMounted;

  expect(startup?.originalSetup?.subsystemList === true,
    `${label} did not preserve browser-owned SubsystemInterfaceList setup`, startup?.originalSetup);
  expect(startup.originalSetup?.startupSingletons === expectedSingletonReady,
    `${label} startup singleton readiness did not match base INI availability`, startup?.originalSetup);
  expect(startup.browserDeviceLayer?.startupSingletons === expectedSingletonReady,
    `${label} browser device layer startup singleton readiness mismatch`, startup?.browserDeviceLayer);
  expect(frontier.startupSingletonsReady === expectedSingletonReady,
    `${label} device frontier startup singleton readiness mismatch`, frontier);
  expect(byFactory.get("SubsystemInterfaceList")?.ready === true,
    `${label} did not mark SubsystemInterfaceList ready at the GameEngine.cpp line`, frontier);
  expect(byFactory.get("GameLODManager")?.ready === expectedSingletonReady,
    `${label} GameLODManager readiness did not track base GameLODPresets.ini availability`, frontier);
  expect(byFactory.get("MapCache")?.ready === false,
    `${label} should keep MapCache::updateCache deferred until the post-audio GameEngine.cpp point`, frontier);

  if (baseIniMounted) {
    expect(startup.status === "browser_device_layer_pending",
      `${label} with base INI mounted should advance to browser device layer pending`, startup);
    expect(frontier.nextRequired === "originalGameEngineInitOwnership" && frontier.setupReady === true,
      `${label} with base INI mounted should be ready for original GameEngine init ownership`, frontier);
  } else {
    expect(startup.status === "missing_startup_files",
      `${label} without base INI should report missing startup files`, startup);
    expect(frontier.nextRequired === "startupFiles" && frontier.setupReady === false,
      `${label} without base INI should keep startup files as next required`, frontier);
    expect(startup.startupFiles?.baseIniArchive?.missing?.includes("Data\\INI\\GameLODPresets.ini"),
      `${label} should name base GameLODPresets.ini as the GameLOD blocker`, startup.startupFiles);
  }
}

const steps = [
  {
    name: "startup-vertical",
    file: "tools/run_startup_vertical_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "startup vertical smoke did not report ok", payload);
      expect(payload.path === "startup-vertical",
        "startup vertical smoke emitted the wrong path", payload);
      expect(payload.covered?.includes("browser wasm original GameEngine.cpp startup frontier"),
        "startup vertical smoke did not cover the browser GameEngine.cpp startup frontier", payload);
      expect(payload.covered?.includes("original GameEngine.cpp constructor/destructor lifetime with global TheGameEngine ownership"),
        "startup vertical smoke did not cover original GameEngine.cpp lifetime ownership", payload);
      expect(payload.covered?.includes("original MilesAudioManager openDevice"),
        "startup vertical smoke did not cover original MilesAudioManager openDevice", payload);
      expect(payload.covered?.includes("original W3DGameWindowManager window and gadget ownership"),
        "startup vertical smoke did not cover original W3DGameWindowManager ownership", payload);
      expect(payload.sourceChecks?.includes("gameengine-startup-order")
          && payload.sourceChecks?.includes("w3d-module-factory-frontier"),
        "startup vertical smoke did not include the expected source frontier checks", payload);
      expect(payload.browserChecks?.includes("startup-browser-frontier"),
        "startup vertical smoke did not include the browser startup frontier check", payload);
      expect(payload.smokes?.includes("win32-gameengine-original-lifetime")
          && payload.smokes?.includes("miles-audio-open-device")
          && payload.smokes?.includes("w3d-window-layout-script"),
        "startup vertical smoke did not include the expected original lifetime/audio/W3D smokes", payload);
    },
  },
  {
    name: "runtime-archives-startup-data",
    file: "harness/runtime_archives_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "runtime archive smoke did not report ok", payload);
      expect(payload.reader === "Win32BIGFileSystem",
        "runtime archive smoke did not use the original BIG reader", payload);
      expect(payload.filesystem === "Emscripten MEMFS",
        "runtime archive smoke did not preload through MEMFS", payload);
      expect(payload.archiveCount >= 17,
        "runtime archive smoke did not mount the expected runtime archive set", payload);
      expect(payload.startupAssets?.status === "ready" && payload.startupAssets?.ok === true,
        "runtime archive smoke did not reach startup asset readiness", payload.startupAssets);
      expect(payload.aggregateProbe?.gameData?.ok === true,
        "runtime archive smoke did not parse GameData through the original INI path", payload.aggregateProbe);
      expect(payload.aggregateProbe?.gameText?.ok === true,
        "runtime archive smoke did not load real GameText", payload.aggregateProbe);
      expect(payload.aggregateProbe?.mapCache?.ok === true,
        "runtime archive smoke did not load real MapCache metadata", payload.aggregateProbe);
      expect(payload.browserMssSamplePlaybackRuntime?.runtimePlayback === true
          && payload.browserMssSamplePlaybackRuntime?.mssDriven === true
          && payload.browserMssSamplePlaybackRuntime?.lastEvent?.webAudioNode === "AudioBufferSourceNode",
        "runtime archive smoke did not prove MSS 2D sample playback through Web Audio", payload.browserMssSamplePlaybackRuntime);
      assertDeviceFrontier(payload, "runtime archive smoke");
      assertStartupSingletonFrontier(payload, "runtime archive smoke");
    },
  },
  {
    name: "browser-network-relay",
    file: "harness/smoke.mjs",
    env: { EXPECT_WASM: "1" },
    validate(payload) {
      expect(payload.ok === true, "browser network relay smoke did not report ok", payload);
      const relay = payload.state?.browserNetworkRelayRuntime;
      expect(relay?.ready === true
          && relay?.source === "GameNetwork browser relay NetPacket byte path proof"
          && relay?.sent === 1
          && relay?.delivered === 1
          && relay?.received === 1
          && relay?.packets?.[0]?.commandType === "NETCOMMANDTYPE_FRAMEINFO"
          && relay?.packets?.[0]?.executionFrame === 2468
          && relay?.packets?.[0]?.playerId === 2
          && relay?.packets?.[0]?.commandId === 314,
        "browser network relay smoke did not prove original NetPacket bytes through the relay", relay);
      const transport = payload.state?.browserNetworkTransportRuntime;
      expect(transport?.ready === true
          && transport?.source === "GameNetwork browser Transport/FrameData frame sync proof"
          && transport?.transportInjected === true
          && transport?.connectionManagerDriven === true
          && transport?.frameDataReady === true
          && transport?.sent === 1
          && transport?.delivered === 1
          && transport?.received === 1
          && transport?.packets?.[0]?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
          && transport?.packets?.[0]?.commands === 2
          && transport?.packets?.[0]?.executionFrame === 2470
          && transport?.packets?.[0]?.playerId === 2
          && transport?.packets?.[0]?.commandId === 315
          && transport?.packets?.[0]?.runAheadCommandId === 316,
        "browser network relay smoke did not drive original Transport/FrameData frame readiness", transport);
    },
  },
  {
    name: "browser-audio-request-path",
    file: "harness/audio_request_path_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "browser audio request path smoke did not report ok", payload);
      expect(payload.path === "browser-audio-request-path"
          && payload.archiveCount >= 17
          && payload.audioContext?.state === "running"
          && payload.audioContext?.resumeTrigger === "canvas.pointerdown"
          && payload.mixer?.source === "browser Web Audio runtime mixer GainNode proof"
          && payload.mixer?.nodeGraph?.includes("GainNode")
          && payload.mixer?.nodeGraph?.includes("AudioDestinationNode")
          && payload.requestPath?.source === "browser source-shaped audio request queue live playback proof"
          && payload.requestPath?.sourcePathDriven === true
          && payload.requestPath?.engineDriven === false
          && payload.requestPath?.nextRequired === "realMilesAudioManagerWebAudioBackend"
          && payload.requestPath?.cacheEntries === 5
          && payload.requestPath?.completed === 3
          && payload.requestPath?.enqueued === 3
          && payload.requestPath?.drained === 3
          && payload.requestPath?.dispatched === 3
          && payload.requestPath?.started === 3
          && payload.requestPath?.released === 3
          && payload.requestPath?.coveredPlayingTypes?.includes("PAT_Sample")
          && payload.requestPath?.coveredPlayingTypes?.includes("PAT_3DSample")
          && payload.requestPath?.coveredPlayingTypes?.includes("PAT_Stream")
          && payload.requestPath?.coveredDeviceStarts?.includes("playSample")
          && payload.requestPath?.coveredDeviceStarts?.includes("playSample3D")
          && payload.requestPath?.coveredDeviceStarts?.includes("playStream")
          && payload.requestPath?.coveredAudioTypes?.includes("AT_SoundEffect")
          && payload.requestPath?.coveredAudioTypes?.includes("AT_Streaming")
          && payload.requestPath?.coveredBuses?.includes("sound")
          && payload.requestPath?.coveredBuses?.includes("sound3D")
          && payload.requestPath?.coveredBuses?.includes("speech")
          && payload.liveEventRuntime?.completed >= 3
          && payload.liveEventRuntime?.released >= 3,
        "browser audio request path smoke did not prove source-shaped audio request queue playback coverage", payload);
    },
  },
  {
    name: "miles-audio-play-sample",
    file: "miles-audio-play-sample-smoke.cjs",
    root: distRoot,
    validate(payload) {
      expect(payload.ok === true, "MilesAudioManager play-sample smoke did not report ok", payload);
      expect(payload.path === "MilesAudioManager::processRequest->playAudioEvent->playSample"
          && payload.request === "AR_Play"
          && payload.event === "PortSmoke2D"
          && payload.filename === "Data\\Audio\\Sounds\\PortSmoke.wav"
          && payload.sample?.statusAfterStart === 2
          && payload.sample?.statusAfterEnd === 1
          && payload.sample?.volume > 0.499
          && payload.sample?.volume < 0.501
          && payload.sample?.pan > 0.499
          && payload.sample?.pan < 0.501
          && payload.wav?.format === "PCM"
          && payload.wav?.rate === 44100
          && payload.wav?.channels === 2
          && payload.wav?.bits === 16
          && payload.manager?.samples2D === 2
          && payload.manager?.available2DAfterRelease === 2
          && payload.manager?.playingSoundsAfterRelease === 0
          && payload.manager?.audioEventReleases === 1,
        "MilesAudioManager play-sample smoke did not prove original processRequest/playAudioEvent/playSample lifecycle", payload);
    },
  },
  {
    name: "browser-audio-miles-webaudio-vertical",
    file: "harness/audio_miles_webaudio_vertical_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "paired Miles/Web Audio vertical did not report ok", payload);
      expect(payload.path === "browser-audio-miles-webaudio-vertical"
          && payload.archiveCount >= 17
          && payload.originalMilesManager?.path === "MilesAudioManager::processRequest->playAudioEvent->playSample"
          && payload.originalMilesManager?.event === "PortSmoke2D"
          && payload.originalMilesManager?.filename === "Data\\Audio\\Sounds\\PortSmoke.wav"
          && payload.originalMilesManager?.sample?.browserPlaybackRequested === false
          && payload.originalMilesManager?.sample?.statusAfterStart === 2
          && payload.originalMilesManager?.sample?.statusAfterEnd === 1
          && payload.originalMilesManager?.wav?.format === "PCM"
          && payload.originalMilesManager?.wav?.rate === 44100
          && payload.originalMilesManager?.wav?.channels === 2
          && payload.originalMilesManager?.wav?.bits === 16
          && payload.originalMilesManager?.manager?.audioEventReleases === 1
          && payload.browserMssSamplePlayback?.runtimePlayback === true
          && payload.browserMssSamplePlayback?.completed === 1
          && payload.browserMssSamplePlayback?.released === 1
          && payload.browserMssSamplePlayback?.webAudioNode === "AudioBufferSourceNode"
          && payload.browserMssSamplePlayback?.completionCallback === "AudioBufferSourceNode.onended"
          && payload.requestPath?.sourcePathDriven === true
          && payload.requestPath?.engineDriven === false
          && payload.requestPath?.completed === 1
          && payload.requestPath?.released === 1
          && payload.requestPath?.eventName === "CIAAgentVoiceAttack"
          && payload.requestPath?.audioType === "AT_SoundEffect"
          && payload.requestPath?.deviceStart === "playSample"
          && payload.requestPath?.playingType === "PAT_Sample"
          && payload.requestPath?.bus === "sound"
          && payload.nextRequired === "sameRuntimeMilesAudioManagerWebAudioBackend",
        "paired Miles/Web Audio vertical did not prove the original-manager leg beside browser Web Audio completion", payload);
    },
  },
  {
    name: "browser-network-two-contexts",
    file: "harness/network_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser two-context network smoke did not report ok", payload);
      expect(payload.path === "browser-network-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.source?.client === "browser-client-0"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalSerializer === "NetPacket::addCommand"
          && payload.source?.packet?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
          && payload.source?.packet?.commands === 2
          && payload.source?.packet?.executionFrame === 2470
          && payload.source?.packet?.playerId === 2
          && payload.source?.packet?.runAheadCommandId === 316
          && payload.destination?.client === "browser-client-1"
          && payload.destination?.wasm === "loaded"
          && payload.destination?.originalTransport === "Transport::m_inBuffer"
          && payload.destination?.originalRelay === "ConnectionManager::doRelay"
          && payload.destination?.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
          && payload.destination?.transport?.injected === true
          && payload.destination?.connectionManager?.doRelayDriven === true
          && payload.destination?.frameData?.ready === true
          && payload.destination?.frameData?.managerReady === true
          && payload.destination?.frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD",
        "browser two-context network smoke did not prove isolated wasm packet relay into original frame data", payload);
    },
  },
  {
    name: "browser-network-websocket-transport",
    file: "harness/network_websocket_transport_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser WebSocket transport smoke did not report ok", payload);
      expect(payload.path === "browser-network-websocket-transport"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.browserTransport === "browser WebSocket binary relay"
          && payload.relay?.serverTransport === "Node WebSocket relay server"
          && payload.relay?.productionTransport === false
          && payload.relay?.hexHandoff === false
          && payload.relay?.binaryFrames === 1
          && payload.source?.client === "websocket-source"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalSerializer === "NetPacket::addCommand"
          && payload.source?.websocket?.binaryType === "arraybuffer"
          && payload.source?.websocket?.sentBytes === payload.source?.packet?.bytes
          && payload.source?.packet?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
          && payload.source?.packet?.commands === 2
          && payload.source?.packet?.executionFrame === 2470
          && payload.source?.packet?.playerId === 2
          && payload.source?.packet?.runAheadCommandId === 316
          && payload.destination?.client === "websocket-destination"
          && payload.destination?.wasm === "loaded"
          && payload.destination?.websocket?.binaryType === "arraybuffer"
          && payload.destination?.websocket?.receivedBytes === payload.source?.packet?.bytes
          && payload.destination?.originalTransport === "Transport::m_inBuffer"
          && payload.destination?.originalRelay === "ConnectionManager::doRelay"
          && payload.destination?.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
          && payload.destination?.transport?.injected === true
          && payload.destination?.connectionManager?.doRelayDriven === true
          && payload.destination?.frameData?.ready === true
          && payload.destination?.frameData?.managerReady === true
          && payload.destination?.frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
          && payload.relayStats?.receivedFrames === 1
          && payload.relayStats?.forwardedFrames === 1
          && payload.relayStats?.receivedBytes === payload.source?.packet?.bytes
          && payload.relayStats?.forwardedBytes === payload.source?.packet?.bytes,
        "browser WebSocket transport smoke did not carry original packet bytes into original frame-data readiness", payload);
    },
  },
  {
    name: "browser-lanapi-announce-two-contexts",
    file: "harness/lanapi_announce_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI announce smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-announce-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.source?.client === "browser-client-0"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalSerializer === "LANMessage struct byte payload"
          && payload.source?.packet?.messageType === "MSG_GAME_ANNOUNCE"
          && payload.source?.packet?.remoteIp === 0x7f000002
          && payload.source?.packet?.localIp === 0x7f000001
          && payload.source?.packet?.port === 8086
          && payload.source?.packet?.gameName === "Browser LAN Game"
          && payload.destination?.client === "browser-client-1"
          && payload.destination?.wasm === "loaded"
          && payload.destination?.originalTransport === "Transport::m_inBuffer"
          && payload.destination?.originalDispatch === "LANAPI::update"
          && payload.destination?.originalHandler === "LANAPI::handleGameAnnounce"
          && payload.destination?.originalParser === "ParseGameOptionsString"
          && payload.destination?.originalCallback === "LANAPI::OnGameList"
          && payload.destination?.transport?.injected === true
          && payload.destination?.lanApi?.updateDriven === true
          && payload.destination?.lanApi?.handleGameAnnounceRecorded === true
          && payload.destination?.game?.recorded === true
          && payload.destination?.game?.mapOk === true
          && payload.destination?.game?.slotsClosed === true,
        "browser LANAPI announce smoke did not prove isolated LANMessage relay into original LANAPI game discovery", payload);
    },
  },
  {
    name: "browser-lanapi-join-options-two-contexts",
    file: "harness/lanapi_join_options_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI join/options smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-join-options-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.source?.client === "browser-client-1"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalRequest === "LANAPI::RequestGameJoin"
          && payload.source?.originalTransport === "Transport::queueSend"
          && payload.source?.packet?.messageType === "MSG_REQUEST_JOIN"
          && payload.source?.packet?.remoteIp === 0x7f000002
          && payload.source?.packet?.localIp === 0x7f000003
          && payload.source?.packet?.gameIP === 0x7f000002
          && payload.host?.client === "browser-client-0"
          && payload.host?.wasm === "loaded"
          && payload.host?.originalTransport === "Transport::m_inBuffer"
          && payload.host?.originalDispatch === "LANAPI::update"
          && payload.host?.originalHandler === "LANAPI::handleRequestJoin"
          && payload.host?.originalCallback === "LANAPI::OnPlayerJoin"
          && payload.host?.originalReply === "LANAPI::RequestGameOptions"
          && payload.host?.transport?.injected === true
          && payload.host?.lanApi?.updateDriven === true
          && payload.host?.game?.joinerAdded === true
          && payload.host?.reply?.joinAcceptType === "MSG_JOIN_ACCEPT"
          && payload.host?.reply?.gameOptionsType === "MSG_GAME_OPTIONS"
          && payload.host?.reply?.optionsLength > 0
          && payload.joiner?.client === "browser-client-1"
          && payload.joiner?.wasm === "loaded"
          && payload.joiner?.originalTransport === "Transport::m_inBuffer"
          && payload.joiner?.originalDispatch === "LANAPI::update"
          && payload.joiner?.originalHandlers === "LANAPI::handleJoinAccept+LANAPI::handleGameOptions"
          && payload.joiner?.originalParser === "GameInfoToAsciiString -> ParseAsciiStringToGameInfo"
          && payload.joiner?.originalCallbacks === "LANAPI::OnGameJoin+LANAPI::OnGameOptions"
          && payload.joiner?.transport?.joinAcceptInjected === true
          && payload.joiner?.transport?.gameOptionsInjected === true
          && payload.joiner?.lanApi?.inLobby === false
          && payload.joiner?.lanApi?.onGameJoinCalls === 1
          && payload.joiner?.lanApi?.onGameOptionsCalls >= 1
          && payload.joiner?.game?.joinRecorded === true
          && payload.joiner?.game?.optionsParsed === true
          && payload.joiner?.game?.localSlot === 1,
        "browser LANAPI join/options smoke did not prove isolated join/options relay into original LANAPI", payload);
    },
  },
  {
    name: "browser-lanapi-game-start-two-contexts",
    file: "harness/lanapi_game_start_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI game-start smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-game-start-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.host?.client === "browser-client-0"
          && payload.host?.wasm === "loaded"
          && payload.host?.originalRequest === "LANAPI::RequestGameStart"
          && payload.host?.originalTransport === "Transport::queueSend"
          && payload.host?.originalCallback === "LANAPI::OnGameStart"
          && payload.host?.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.host?.packet?.messageType === "MSG_GAME_START"
          && payload.host?.packet?.activeBytes > 0
          && payload.host?.packet?.activeBytes <= 476
          && payload.host?.lanApi?.hostGameReady === true
          && payload.host?.lanApi?.onGameStartCalls === 1
          && payload.host?.network?.setupReady === true
          && payload.host?.network?.localSlot === 0
          && payload.host?.network?.numPlayers === 2
          && payload.host?.callback?.sideEffectsReady === true
          && payload.host?.callback?.messageArgument === 1
          && payload.joiner?.client === "browser-client-1"
          && payload.joiner?.wasm === "loaded"
          && payload.joiner?.originalTransport === "Transport::m_inBuffer"
          && payload.joiner?.originalDispatch === "LANAPI::update"
          && payload.joiner?.originalHandler === "LANAPI::handleGameStart"
          && payload.joiner?.originalCallback === "LANAPI::OnGameStart"
          && payload.joiner?.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.joiner?.transport?.injected === true
          && payload.joiner?.transport?.cleared === true
          && payload.joiner?.lanApi?.updateDriven === true
          && payload.joiner?.lanApi?.onGameStartCalls === 1
          && payload.joiner?.network?.setupReady === true
          && payload.joiner?.network?.localSlot === 1
          && payload.joiner?.network?.numPlayers === 2
          && payload.joiner?.callback?.sideEffectsReady === true
          && payload.joiner?.callback?.messageArgument === 1,
        "browser LANAPI game-start smoke did not prove isolated game-start relay into original NetworkInterface", payload);
    },
  },
  {
    name: "browser-lanapi-websocket-flow",
    file: "harness/lanapi_websocket_flow_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI WebSocket flow smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-websocket-flow"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.browserTransport === "browser WebSocket binary LANAPI relay"
          && payload.relay?.serverTransport === "Node WebSocket relay server"
          && payload.relay?.productionTransport === false
          && payload.relay?.hexHandoff === false
          && payload.relay?.binaryFrames === 5
          && payload.announce?.originalSerializer === "LANMessage struct byte payload"
          && payload.announce?.originalDispatch === "LANAPI::update"
          && payload.announce?.originalHandler === "LANAPI::handleGameAnnounce"
          && payload.announce?.originalParser === "ParseGameOptionsString"
          && payload.announce?.originalCallback === "LANAPI::OnGameList"
          && payload.announce?.packet?.messageType === "MSG_GAME_ANNOUNCE"
          && payload.announce?.transport?.injected === true
          && payload.announce?.lanApi?.updateDriven === true
          && payload.announce?.game?.recorded === true
          && payload.announce?.game?.slotsClosed === true
          && payload.join?.originalRequest === "LANAPI::RequestGameJoin"
          && payload.join?.originalHostHandler === "LANAPI::handleRequestJoin"
          && payload.join?.originalReply === "LANAPI::RequestGameOptions"
          && payload.join?.originalJoinerHandlers === "LANAPI::handleJoinAccept+LANAPI::handleGameOptions"
          && payload.join?.originalJoinerCallbacks === "LANAPI::OnGameJoin+LANAPI::OnGameOptions"
          && payload.join?.request?.messageType === "MSG_REQUEST_JOIN"
          && payload.join?.reply?.joinAcceptType === "MSG_JOIN_ACCEPT"
          && payload.join?.reply?.gameOptionsType === "MSG_GAME_OPTIONS"
          && payload.join?.host?.transport?.injected === true
          && payload.join?.host?.lanApi?.onPlayerJoinCalls === 1
          && payload.join?.joiner?.transport?.joinAcceptInjected === true
          && payload.join?.joiner?.transport?.gameOptionsInjected === true
          && payload.join?.joiner?.game?.localSlot === 1
          && payload.gameStart?.originalRequest === "LANAPI::RequestGameStart"
          && payload.gameStart?.originalHostNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.gameStart?.originalJoinerHandler === "LANAPI::handleGameStart"
          && payload.gameStart?.originalJoinerNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.gameStart?.packet?.messageType === "MSG_GAME_START"
          && payload.gameStart?.packet?.activeBytes > 0
          && payload.gameStart?.packet?.activeBytes <= 476
          && payload.gameStart?.host?.lanApi?.onGameStartCalls === 1
          && payload.gameStart?.host?.network?.setupReady === true
          && payload.gameStart?.joiner?.transport?.injected === true
          && payload.gameStart?.joiner?.lanApi?.onGameStartCalls === 1
          && payload.gameStart?.joiner?.network?.setupReady === true
          && payload.gameStart?.joiner?.callback?.sideEffectsReady === true
          && payload.relayStats?.receivedFrames === 5
          && payload.relayStats?.forwardedFrames === 5
          && payload.relayStats?.receivedBytes > 0
          && payload.relayStats?.forwardedBytes === payload.relayStats?.receivedBytes,
        "browser LANAPI WebSocket flow smoke did not carry discovery/join/start through WebSocket binary frames into original LANAPI", payload);
    },
  },
  {
    name: "browser-lanapi-network-update",
    file: "harness/lanapi_network_update_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI Network::update smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-network-update"
          && payload.relay?.productionTransport === false
          && payload.originalSetup === "LANAPI::RequestGameStart -> LANAPI::OnGameStart"
          && payload.originalUpdate === "Network::update"
          && payload.originalCommandPath === "Network::GetCommandsFromCommandList -> Network::processCommand"
          && payload.originalFrameReadiness === "Network::AllCommandsReady -> ConnectionManager::allCommandsReady -> FrameDataManager::allCommandsReady"
          && payload.originalTiming === "Network::timeForNewFrame"
          && payload.originalRelay === "Network::RelayCommandsToCommandList"
          && payload.lanApi?.hostGameReady === true
          && payload.lanApi?.onGameStartCalls === 1
          && payload.lanApi?.gameStartMessageDecoded === true
          && payload.before?.network?.setupReady === true
          && payload.before?.network?.localSlot === 0
          && payload.before?.network?.frameDataReady === false
          && payload.before?.callback?.sideEffectsReady === true
          && payload.update?.commandListInjected === true
          && payload.update?.updateDriven === true
          && payload.update?.logicFrameBefore === 0
          && payload.update?.logicFrameForUpdate === 1
          && payload.update?.tickMessageType === 1
          && payload.update?.commandListCountBefore === 1
          && payload.update?.commandListCountAfter === 1
          && payload.update?.localConnectedBefore === false
          && payload.update?.localConnectedAfter === true
          && payload.update?.beforeFrameDataReady === false
          && payload.update?.afterFrameDataReady === true
          && payload.update?.readinessTransition === true
          && payload.update?.inGamePromoted === true
          && payload.after?.network?.setupReady === true
          && payload.after?.network?.frameDataReady === true
          && payload.after?.callback?.sideEffectsReady === true,
        "browser LANAPI Network::update smoke did not prove first-frame readiness through the original network loop", payload);
    },
  },
  {
    name: "range-backed-startup-archives",
    file: "harness/startup_range_backed_archives_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "range-backed startup archive smoke did not report ok", payload);
      expect(payload.storage === "range-backed-subset-big",
        "range-backed startup archive smoke used the wrong storage mode", payload);
      expect(payload.reader === "browser fetch Range -> synthesized BIG -> Win32BIGFileSystem",
        "range-backed startup archive smoke did not route through the original BIG reader", payload);
      expect(payload.startupAssets?.status === "ready" && payload.startupAssets?.ok === true,
        "range-backed startup archive smoke did not reach startup asset readiness", payload.startupAssets);
      assertDeviceFrontier(payload, "range-backed startup archive smoke");
      assertStartupSingletonFrontier(payload, "range-backed startup archive smoke");
    },
  },
  {
    name: "main-menu-layout-callbacks",
    file: "w3d-window-layout-script-smoke.cjs",
    root: distRoot,
    validate(payload) {
      expect(payload.ok === true, "W3D window layout script smoke did not report ok", payload);
      expect(payload.archiveLayouts?.includes("Menus/MainMenu.wnd"),
        "W3D window layout script smoke did not load MainMenu.wnd from WindowZH.big", payload);
      expect(payload.archiveLayouts?.includes("Menus/CreditsMenu.wnd"),
        "W3D window layout script smoke did not load CreditsMenu.wnd from WindowZH.big", payload);
      expect(payload.assetArchives?.includes("INIZH.big"),
        "W3D window layout script smoke did not mount INIZH.big for the CreditsMenu vertical", payload);
      expect(payload.callbackPaths?.includes("W3DMainMenuInit->original MainMenuInit"),
        "W3D window layout script smoke did not execute original MainMenuInit", payload);
      expect(payload.callbackPaths?.includes("MainMenuUpdate(first idle frame)"),
        "W3D window layout script smoke did not execute MainMenuUpdate", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonSinglePlayer click->MainMenuSystem dropdown transition"),
        "W3D window layout script smoke did not execute real MainMenu button input/navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonSingleBack click->MainMenuSystem dropdown return"),
        "W3D window layout script smoke did not execute real MainMenu dropdown return navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonCredits click->MainMenuSystem pending Shell::push CreditsMenu"),
        "W3D window layout script smoke did not execute real ButtonCredits submenu navigation", payload);
      expect(payload.callbackPaths?.includes("MainMenuUpdate shutdownComplete->original CreditsMenuInit"),
        "W3D window layout script smoke did not execute original CreditsMenuInit through Shell::push", payload);
      expect(payload.callbackPaths?.includes("CreditsMenuUpdate real callback"),
        "W3D window layout script smoke did not execute original CreditsMenuUpdate", payload);
    },
  },
  {
    name: "mapped-image-display",
    file: "harness/display_mapped_image_smoke.mjs",
    args: ["artifacts/real-assets/INIZH.big", "artifacts/real-assets/EnglishZH.big"],
    validate(payload) {
      expect(payload.ok === true, "mapped-image display smoke did not report ok", payload);
      expect(payload.reader === "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
        "mapped-image display smoke did not use range-backed BIG assets", payload);
      expect(payload.probe?.results?.mappedImages === 1186,
        "mapped-image display smoke did not load the expected mapped-image collection", payload.probe);
      expect(payload.probe?.results?.drawImageCalled === true,
        "mapped-image display smoke did not exercise W3DDisplay::drawImage", payload.probe);
      expect(payload.browserProbe?.source === "browser_d3d8_draw_indexed",
        "mapped-image display smoke did not reach the browser D3D8/WebGL draw path", payload.browserProbe);
    },
  },
  {
    name: "shipped-mesh-render",
    file: "harness/shipped_mesh_render_smoke.mjs",
    args: ["artifacts/real-assets/W3DZH.big", "artifacts/real-assets/TexturesZH.big"],
    validate(payload) {
      expect(payload.ok === true, "shipped mesh render smoke did not report ok", payload);
      expect(payload.reader === "browser Range subset BIGs registered through runtime-owned Win32BIGFileSystem",
        "shipped mesh render smoke did not use range-backed BIG assets", payload);
      expect(payload.probe?.mesh?.name === "CINE_MOON",
        "shipped mesh render smoke did not load the expected shipped W3D mesh", payload.probe);
      expect(payload.probe?.results?.textureDDSLoaded === true,
        "shipped mesh render smoke did not load DDS texture data", payload.probe);
      expect(payload.browserProbe?.source === "browser_d3d8_draw_indexed",
        "shipped mesh render smoke did not reach the browser D3D8/WebGL draw path", payload.browserProbe);
      expect(payload.multiTextureProbe?.ok === true
          && payload.multiTextureProbe?.results?.meshLoaded === true
          && payload.multiTextureProbe?.mesh?.passCount === 1
          && payload.multiTextureProbe?.mesh?.uvArrayCount === 2,
        "shipped mesh render smoke did not exercise same-pass multi-texture rendering", payload.multiTextureProbe);
    },
  },
  {
    name: "bink-w3d-video-presentation",
    file: "harness/bink_w3d_video_buffer_upload_smoke.mjs",
    args: [
      "artifacts/real-assets/GC_Background.bik",
      "artifacts/real-assets/VS_small.bik",
      "artifacts/browser-video/bink/bink-browser-video-manifest.json",
    ],
    validate(payload) {
      expect(payload.ok === true, "Bink W3D video presentation smoke did not report ok", payload);
      expect(payload.source === "WebAssembly/harness/bink_w3d_video_buffer_upload_smoke.mjs",
        "Bink W3D video presentation smoke reported the wrong source", payload);
      expect(payload.screenshotPath?.endsWith("harness-smoke-bink-w3d-video-buffer-upload.png"),
        "Bink W3D video presentation smoke did not capture the expected screenshot", payload);
      expect(payload.counts?.binkOpen === 12
          && payload.counts?.binkClose === 12
          && payload.counts?.binkCopyComplete === 766
          && payload.counts?.copyEvents === 766
          && payload.counts?.drawEvents >= 766
          && payload.counts?.textureCreates === 13
          && payload.counts?.textureUpdates === 779
          && payload.counts?.textureReleases === 12
          && payload.counts?.liveTextureCount === 1,
        "Bink W3D video presentation smoke did not prove the expected original video lifecycle counts", payload.counts);
      expect(payload.lastDraw?.source === "browser_d3d8_draw_indexed"
          && payload.lastDraw?.primitiveType === 4
          && payload.lastDraw?.vertexCount === 4
          && payload.lastDraw?.indexCount === 6
          && payload.lastDraw?.vertexStride === 44
          && payload.lastDraw?.texture0?.format === 22
          && payload.lastDraw?.texture0?.storage === "rgba8"
          && payload.lastDraw?.texture0?.ready === true
          && payload.lastDraw?.texture0?.sampled === true
          && Array.isArray(payload.lastDraw?.centerPixel)
          && payload.lastDraw.centerPixel.some((channel, index) => index < 3 && channel > 0),
        "Bink W3D video presentation smoke did not reach browser D3D8/WebGL textured draw presentation", payload.lastDraw);
      expect((payload.copyChecksums ?? []).some((event) =>
            event.videoPath === "artifacts/browser-video/bink/GC_Background.webm"
            && event.copyWidth === 800
            && event.copyHeight === 600
            && event.bytesWritten > 0
            && event.checksum > 0)
          && (payload.copyChecksums ?? []).some((event) =>
            event.videoPath === "artifacts/browser-video/bink/VS_small.webm"
            && event.copyWidth === 96
            && event.copyHeight === 120
            && event.bytesWritten > 0
            && event.checksum > 0),
        "Bink W3D video presentation smoke did not copy decoded shipped sidecar frames", payload.copyChecksums?.slice?.(0, 8));
    },
  },
];

const results = steps.map((step) => runNodeStep(step, step.root ?? wasmRoot));

console.log(JSON.stringify({
  ok: true,
  path: "vertical-integrations",
  covered: [
    "aggregate startup vertical covering browser GameEngine.cpp startup frontier, original GameEngine lifetime, original Miles openDevice, and W3D window/layout ownership",
    "runtime archive preload, boot-time startup asset consumption, MSS 2D Web Audio sample playback, and startup singleton pre-audio frontier diagnostics",
    "browser Web Audio request-path playback for source-shaped AudioManager/SoundManager/MilesAudioManager 2D sample, 3D sample, and speech stream events",
    "original MilesAudioManager processRequest/playAudioEvent/playSample 2D sample playback through AudioFileCache, AIL_WAV_info, and MSS sample completion/release",
    "paired audio vertical proving the original MilesAudioManager 2D sample leg beside browser MSS AudioBufferSourceNode completion/release in one Playwright-owned gate",
    "browser relay-shaped networking path carrying original GameNetwork NetPacket bytes into Transport::m_inBuffer, ConnectionManager::doRelay, and FrameDataManager readiness",
    "two isolated Playwright browser contexts carrying original GameNetwork transport bytes from one wasm instance into another",
    "two isolated Playwright browser contexts carrying original GameNetwork transport bytes through a browser WebSocket binary relay into original frame-data readiness",
    "two isolated Playwright browser contexts carrying a LANMessage MSG_GAME_ANNOUNCE into original LANAPI::update, handleGameAnnounce, ParseGameOptionsString, and OnGameList",
    "two isolated Playwright browser contexts carrying original LANAPI RequestGameJoin, handleRequestJoin, handleJoinAccept, and handleGameOptions through queued Transport bytes",
    "two isolated Playwright browser contexts carrying original LANAPI RequestGameStart and handleGameStart into OnGameStart, Network::init/initTransport/parseUserList, and MSG_NEW_GAME setup",
    "two isolated Playwright browser contexts carrying LANAPI announce, join/options, and game-start messages through browser WebSocket binary frames into original LANAPI handlers",
    "original LANAPI game-start state driven through Network::update, GetCommandsFromCommandList, processCommand, ConnectionManager::allCommandsReady, timeForNewFrame, RelayCommandsToCommandList, and frameDataReady transition",
    "browser Range archive delivery through synthesized BIG files, original Win32BIGFileSystem, and base INI blocker reporting",
    "WindowZH/INIZH-backed Shell MainMenu-to-CreditsMenu callback execution and real input navigation",
    "mapped-image W3DDisplay drawImage over real INIZH/EnglishZH assets",
    "shipped W3D mesh and DDS texture rendering through the browser D3D8/WebGL bridge",
    "shipped Bink sidecar frames copied by original BinkVideoPlayer into real W3DVideoBuffer textures and presented through original W3DDisplay::drawVideoBuffer",
  ],
  nextRequired: [
    "supply base Generals INI.big/English.big to promote startup default-file coverage where available",
    "advance full production video ownership beyond focused Bink/load-screen/score-screen harness hooks into the normal InGameUI/campaign shell path",
    "move original MilesAudioManager 2D sample playback into the same browser cnc-port runtime/Web Audio backend instead of a paired standalone/browser gate",
    "wire browser WebSocket binary send/receive into the production Transport::doSend/doRecv and LANAPI ownership paths or extend networking coverage to multi-frame deterministic sync/desync detection",
    "replace focused browser GameEngine lifetime with production original GameEngine.cpp init/createAudioManager ownership",
  ],
  steps: results.map((result) => result.name),
}));
