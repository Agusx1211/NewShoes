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
];

const results = steps.map((step) => runNodeStep(step, step.root ?? wasmRoot));

console.log(JSON.stringify({
  ok: true,
  path: "vertical-integrations",
  covered: [
    "runtime archive preload, boot-time startup asset consumption, MSS 2D Web Audio sample playback, and startup singleton pre-audio frontier diagnostics",
    "browser relay-shaped networking path carrying original GameNetwork NetPacket bytes through wasm serializer/parser",
    "browser Range archive delivery through synthesized BIG files, original Win32BIGFileSystem, and base INI blocker reporting",
    "WindowZH/INIZH-backed Shell MainMenu-to-CreditsMenu callback execution and real input navigation",
    "mapped-image W3DDisplay drawImage over real INIZH/EnglishZH assets",
    "shipped W3D mesh and DDS texture rendering through the browser D3D8/WebGL bridge",
  ],
  nextRequired: [
    "supply base Generals INI.big/English.big to promote startup default-file coverage where available",
    "advance another independent vertical beyond the shell menu path, preferably audio/video/network device ownership",
    "connect browser transport receives into original Transport/ConnectionManager/FrameDataManager ownership",
    "replace focused browser GameEngine lifetime with production original GameEngine.cpp init/createAudioManager ownership",
  ],
  steps: results.map((result) => result.name),
}));
