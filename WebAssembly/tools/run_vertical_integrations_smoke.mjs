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
  expect(frontier.factoryMappings?.createArchiveFileSystem === "Win32BIGFileSystem",
    `${label} did not preserve the archive filesystem mapping`, frontier);
  expect(frontier.factoryMappings?.createAudioManager === "MilesAudioManager",
    `${label} did not preserve the Miles audio mapping`, frontier);
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
      assertDeviceFrontier(payload, "runtime archive smoke");
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
      expect(payload.callbackPaths?.includes("W3DMainMenuInit->original MainMenuInit"),
        "W3D window layout script smoke did not execute original MainMenuInit", payload);
      expect(payload.callbackPaths?.includes("MainMenuUpdate(first idle frame)"),
        "W3D window layout script smoke did not execute MainMenuUpdate", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonSinglePlayer click->MainMenuSystem dropdown transition"),
        "W3D window layout script smoke did not execute real MainMenu button input/navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonSingleBack click->MainMenuSystem dropdown return"),
        "W3D window layout script smoke did not execute real MainMenu dropdown return navigation", payload);
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
    "runtime archive preload and boot-time startup asset consumption",
    "browser Range archive delivery through synthesized BIG files and original Win32BIGFileSystem",
    "WindowZH-backed Shell/MainMenu layout callback execution and MainMenu dropdown input navigation",
    "mapped-image W3DDisplay drawImage over real INIZH/EnglishZH assets",
    "shipped W3D mesh and DDS texture rendering through the browser D3D8/WebGL bridge",
  ],
  nextRequired: [
    "supply base Generals INI.big/English.big to promote startup default-file coverage where available",
    "advance beyond MainMenu dropdown navigation to a real submenu selection without crossing into campaign/skirmish startup",
    "replace browser device-layer probe ownership with production CreateGameEngine/createAudioManager ownership",
  ],
  steps: results.map((result) => result.name),
}));
