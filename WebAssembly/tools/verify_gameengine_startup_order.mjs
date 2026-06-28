#!/usr/bin/env node
// Verifies that the harness-visible original startup frontier is still
// grounded in the checked-in GeneralsMD source facts.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const repoRoot = resolve(wasmRoot, "..");

const GAMEENGINE_CPP = "GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp";
const WINMAIN_CPP = "GeneralsMD/Code/Main/WinMain.cpp";
const WIN32GAMEENGINE_H =
  "GeneralsMD/Code/GameEngineDevice/Include/Win32Device/Common/Win32GameEngine.h";
const GAMEAUDIO_CPP =
  "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp";

const sourcePaths = {
  gameEngineCpp: resolve(repoRoot, GAMEENGINE_CPP),
  winMainCpp: resolve(repoRoot, WINMAIN_CPP),
  win32GameEngineHeader: resolve(repoRoot, WIN32GAMEENGINE_H),
  gameAudioCpp: resolve(repoRoot, GAMEAUDIO_CPP),
};

const REQUIRED_INIT_ORDER = [
  {
    key: "createFileSystem",
    label: "TheFileSystem = createFileSystem()",
    expectedLine: 305,
    patterns: [/TheFileSystem\s*=\s*createFileSystem\s*\(\s*\)/],
  },
  {
    key: "createLocalFileSystem",
    label: "TheLocalFileSystem",
    expectedLine: 342,
    patterns: [/initSubsystem\s*\(\s*TheLocalFileSystem/],
  },
  {
    key: "createArchiveFileSystem",
    label: "TheArchiveFileSystem",
    expectedLine: 353,
    patterns: [/initSubsystem\s*\(\s*TheArchiveFileSystem/],
  },
  {
    key: "defaultGameData",
    label: "TheWritableGlobalData / GameData.ini",
    expectedLine: 363,
    patterns: [/initSubsystem\s*\(\s*TheWritableGlobalData\b/],
  },
  {
    key: "waterIni",
    label: "Water INI load",
    expectedLine: 394,
    patterns: [/ini\.load.*Default.*Water\.ini/],
  },
  {
    key: "weatherIni",
    label: "Weather INI load",
    expectedLine: 396,
    patterns: [/ini\.load.*Default.*Weather\.ini/],
  },
  {
    key: "gameText",
    label: "TheGameText",
    expectedLine: 412,
    patterns: [/initSubsystem\s*\(\s*TheGameText\b/],
  },
  {
    key: "science",
    label: "TheScienceStore / Science.ini",
    expectedLine: 422,
    patterns: [/initSubsystem\s*\(\s*TheScienceStore/],
  },
  {
    key: "multiplayer",
    label: "TheMultiplayerSettings / Multiplayer.ini",
    expectedLine: 423,
    patterns: [/initSubsystem\s*\(\s*TheMultiplayerSettings/],
  },
  {
    key: "terrain",
    label: "TheTerrainTypes / Terrain.ini",
    expectedLine: 424,
    patterns: [/initSubsystem\s*\(\s*TheTerrainTypes/],
  },
  {
    key: "roads",
    label: "TheTerrainRoads / Roads.ini",
    expectedLine: 425,
    patterns: [/initSubsystem\s*\(\s*TheTerrainRoads/],
  },
  {
    key: "cdManager",
    label: "TheCDManager",
    expectedLine: 427,
    patterns: [/initSubsystem\s*\(\s*TheCDManager/],
  },
  {
    key: "createAudioManager",
    label: "TheAudio / createAudioManager()",
    expectedLine: 434,
    patterns: [/initSubsystem\s*\(\s*TheAudio\b/],
  },
  {
    key: "createFunctionLexicon",
    label: "TheFunctionLexicon",
    expectedLine: 446,
    patterns: [/initSubsystem\s*\(\s*TheFunctionLexicon/],
  },
  {
    key: "createModuleFactory",
    label: "TheModuleFactory",
    expectedLine: 447,
    patterns: [/initSubsystem\s*\(\s*TheModuleFactory/],
  },
  {
    key: "rankInfo",
    label: "TheRankInfoStore / Rank.ini",
    expectedLine: 451,
    patterns: [/initSubsystem\s*\(\s*TheRankInfoStore/],
  },
  {
    key: "playerTemplate",
    label: "ThePlayerTemplateStore / PlayerTemplate.ini",
    expectedLine: 452,
    patterns: [/initSubsystem\s*\(\s*ThePlayerTemplateStore/],
  },
  {
    key: "createParticleSystemManager",
    label: "TheParticleSystemManager",
    expectedLine: 453,
    patterns: [/initSubsystem\s*\(\s*TheParticleSystemManager/],
  },
  {
    key: "thingFactory",
    label: "TheThingFactory / createThingFactory()",
    expectedLine: 482,
    patterns: [/initSubsystem\s*\(\s*TheThingFactory/],
  },
  {
    key: "createGameClient",
    label: "TheGameClient",
    expectedLine: 493,
    patterns: [/initSubsystem\s*\(\s*TheGameClient/],
  },
  {
    key: "createGameLogic",
    label: "TheGameLogic",
    expectedLine: 505,
    patterns: [/initSubsystem\s*\(\s*TheGameLogic/],
  },
  {
    key: "createRadar",
    label: "TheRadar",
    expectedLine: 510,
    patterns: [/initSubsystem\s*\(\s*TheRadar/],
  },
  {
    key: "createWebBrowser",
    label: "createWebBrowser() commented init call",
    expectedLine: 537,
    patterns: [/createWebBrowser\s*\(\s*\)/],
  },
];

const CREATE_GAME_ENGINE = {
  method: "CreateGameEngine",
  expectedLine: 1122,
  expectedConcrete: "Win32GameEngine",
};

const KNOWN_FACTORY_MAPPINGS = {
  createGameLogic: { expected: "W3DGameLogic", expectedLine: 93 },
  createGameClient: { expected: "W3DGameClient", expectedLine: 94 },
  createModuleFactory: { expected: "W3DModuleFactory", expectedLine: 95 },
  createThingFactory: { expected: "W3DThingFactory", expectedLine: 96 },
  createFunctionLexicon: { expected: "W3DFunctionLexicon", expectedLine: 97 },
  createLocalFileSystem: { expected: "Win32LocalFileSystem", expectedLine: 98 },
  createArchiveFileSystem: { expected: "Win32BIGFileSystem", expectedLine: 99 },
  createParticleSystemManager: {
    expected: "W3DParticleSystemManager",
    expectedLine: 100,
  },
  createNetwork: {
    expected: "NetworkInterface::createNetwork",
    expectedLine: 102,
  },
  createRadar: { expected: "W3DRadar", expectedLine: 103 },
  createWebBrowser: { expected: "CComObject<W3DWebBrowser>", expectedLine: 104 },
  createAudioManager: { expected: "MilesAudioManager", expectedLine: 105 },
};

const AUDIO_STARTUP_LOADS = [
  {
    key: "audioSettingsIni",
    path: "Data\\INI\\AudioSettings.ini",
    expectedLine: 219,
  },
  {
    key: "defaultMusicIni",
    path: "Data\\INI\\Default\\Music.ini",
    expectedLine: 221,
  },
  { key: "musicIni", path: "Data\\INI\\Music.ini", expectedLine: 222 },
  {
    key: "defaultSoundEffectsIni",
    path: "Data\\INI\\Default\\SoundEffects.ini",
    expectedLine: 224,
  },
  {
    key: "soundEffectsIni",
    path: "Data\\INI\\SoundEffects.ini",
    expectedLine: 225,
  },
  {
    key: "defaultSpeechIni",
    path: "Data\\INI\\Default\\Speech.ini",
    expectedLine: 227,
  },
  { key: "speechIni", path: "Data\\INI\\Speech.ini", expectedLine: 228 },
  {
    key: "defaultVoiceIni",
    path: "Data\\INI\\Default\\Voice.ini",
    expectedLine: 230,
  },
  { key: "voiceIni", path: "Data\\INI\\Voice.ini", expectedLine: 231 },
  { key: "miscAudioIni", path: "Data\\INI\\MiscAudio.ini", expectedLine: 234 },
];

function readText(path, label, errors) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    errors.push(`failed to read ${label}: ${error.message}`);
    return null;
  }
}

function findFunctionBody(text, headerRegex) {
  const match = headerRegex.exec(text);
  if (!match) {
    return null;
  }

  const bodyStart = text.indexOf("{", match.index);
  if (bodyStart === -1) {
    return null;
  }

  let depth = 0;
  for (let i = bodyStart; i < text.length; i += 1) {
    if (text[i] === "{") {
      depth += 1;
    } else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          headerOffset: match.index,
          bodyOffset: bodyStart,
          body: text.slice(bodyStart, i + 1),
        };
      }
    }
  }

  return null;
}

function lineOfOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scanInitMarkers(cppText, errors) {
  const body = findFunctionBody(
    cppText,
    /\bvoid\s+GameEngine\s*::\s*init\s*\(\s*int\s+argc\s*,\s*char\s*\*\s*argv\s*\[\s*\]\s*\)/g
  );
  if (!body) {
    errors.push(`${GAMEENGINE_CPP}: GameEngine::init(int,char**) body not found`);
    return [];
  }

  const bodyStartLine = lineOfOffset(cppText, body.bodyOffset);
  const bodyLines = body.body.split(/\r?\n/);
  return REQUIRED_INIT_ORDER.map((entry) => {
    let line = null;
    let pattern = null;

    for (let i = 0; i < bodyLines.length; i += 1) {
      for (const regex of entry.patterns) {
        if (regex.test(bodyLines[i])) {
          line = bodyStartLine + i;
          pattern = regex.source;
          break;
        }
      }
      if (line !== null) {
        break;
      }
    }

    return {
      key: entry.key,
      label: entry.label,
      expectedLine: entry.expectedLine,
      line,
      ok: line === entry.expectedLine,
      ...(pattern ? { pattern } : {}),
    };
  });
}

function scanAudioStartupLoads(audioText, errors) {
  const body = findFunctionBody(
    audioText,
    /\bvoid\s+AudioManager\s*::\s*init\s*\(\s*\)/g
  );
  if (!body) {
    errors.push(`${GAMEAUDIO_CPP}: AudioManager::init() body not found`);
    return [];
  }

  const bodyStartLine = lineOfOffset(audioText, body.bodyOffset);
  const bodyLines = body.body.split(/\r?\n/);
  let searchStart = 0;
  return AUDIO_STARTUP_LOADS.map((entry) => {
    const sourcePathLiteral = entry.path.replaceAll("\\", "\\\\");
    const loadPattern = new RegExp(
      `\\bini\\.load\\s*\\(\\s*AsciiString\\s*\\(\\s*"${escapeRegExp(sourcePathLiteral)}"\\s*\\)`
    );
    let line = null;

    for (let i = searchStart; i < bodyLines.length; i += 1) {
      if (loadPattern.test(bodyLines[i])) {
        line = bodyStartLine + i;
        searchStart = i + 1;
        break;
      }
    }

    return {
      key: entry.key,
      path: entry.path,
      expectedLine: entry.expectedLine,
      line,
      ok: line === entry.expectedLine,
    };
  });
}

function scanCreateGameEngine(winMainText) {
  const body = findFunctionBody(
    winMainText,
    /\bGameEngine\s*\*\s*CreateGameEngine\s*\(\s*void\s*\)/g
  );
  if (!body) {
    return {
      method: CREATE_GAME_ENGINE.method,
      expectedLine: CREATE_GAME_ENGINE.expectedLine,
      expectedConcrete: CREATE_GAME_ENGINE.expectedConcrete,
      line: null,
      concrete: null,
      ok: false,
    };
  }

  const allocation = /\bNEW\s+([A-Za-z_]\w*)\b/.exec(body.body);
  return {
    method: CREATE_GAME_ENGINE.method,
    expectedLine: CREATE_GAME_ENGINE.expectedLine,
    expectedConcrete: CREATE_GAME_ENGINE.expectedConcrete,
    line: lineOfOffset(winMainText, body.headerOffset),
    concrete: allocation?.[1] ?? null,
    ok:
      lineOfOffset(winMainText, body.headerOffset) === CREATE_GAME_ENGINE.expectedLine &&
      allocation?.[1] === CREATE_GAME_ENGINE.expectedConcrete,
  };
}

function normalizeFactoryReturn(returnExpression) {
  return returnExpression
    .trim()
    .replace(/^NEW\s+/, "")
    .replace(/\(\s*\)$/, "")
    .trim();
}

function scanWin32FactoryMappings(headerText) {
  const found = {};
  const factoryRegex =
    /inline\s+[\w:*&]+\s+\*?\s*Win32GameEngine\s*::\s*(\w+)\s*\(\s*void\s*\)\s*\{\s*return\s+([^;]+?);/g;

  let match;
  while ((match = factoryRegex.exec(headerText)) !== null) {
    found[match[1]] = {
      line: lineOfOffset(headerText, match.index),
      concrete: normalizeFactoryReturn(match[2]),
    };
  }

  return Object.fromEntries(
    Object.entries(KNOWN_FACTORY_MAPPINGS).map(([method, expected]) => {
      const actual = found[method] ?? { line: null, concrete: null };
      return [
        method,
        {
          expected: expected.expected,
          expectedLine: expected.expectedLine,
          actual: actual.concrete,
          line: actual.line,
          ok:
            actual.concrete === expected.expected &&
            actual.line === expected.expectedLine,
        },
      ];
    })
  );
}

function addInitErrors(initOrder, errors) {
  let orderOk = true;
  let previousLine = -1;

  for (const entry of initOrder) {
    if (entry.line === null) {
      errors.push(
        `${GAMEENGINE_CPP}: missing init marker ${entry.key} (${entry.label})`
      );
      orderOk = false;
      continue;
    }

    if (entry.line !== entry.expectedLine) {
      errors.push(
        `${GAMEENGINE_CPP}: ${entry.key} expected line ${entry.expectedLine} but found ${entry.line}`
      );
    }

    if (entry.line < previousLine) {
      errors.push(
        `${GAMEENGINE_CPP}: init marker order violation at ${entry.key} line ${entry.line}`
      );
      orderOk = false;
    }
    previousLine = entry.line;
  }

  return orderOk && initOrder.every((entry) => entry.line !== null);
}

function addCreateGameEngineErrors(createGameEngine, errors) {
  if (createGameEngine.line === null) {
    errors.push(`${WINMAIN_CPP}: CreateGameEngine body not found`);
    return;
  }
  if (createGameEngine.line !== createGameEngine.expectedLine) {
    errors.push(
      `${WINMAIN_CPP}: CreateGameEngine expected line ${createGameEngine.expectedLine} but found ${createGameEngine.line}`
    );
  }
  if (createGameEngine.concrete !== createGameEngine.expectedConcrete) {
    errors.push(
      `${WINMAIN_CPP}: CreateGameEngine expected ${createGameEngine.expectedConcrete} but found ${createGameEngine.concrete}`
    );
  }
}

function addFactoryMappingErrors(factoryMappings, errors) {
  for (const [method, mapping] of Object.entries(factoryMappings)) {
    if (mapping.actual === null) {
      errors.push(`${WIN32GAMEENGINE_H}: missing factory mapping ${method}`);
      continue;
    }
    if (mapping.actual !== mapping.expected) {
      errors.push(
        `${WIN32GAMEENGINE_H}: ${method} expected ${mapping.expected} but found ${mapping.actual}`
      );
    }
    if (mapping.line !== mapping.expectedLine) {
      errors.push(
        `${WIN32GAMEENGINE_H}: ${method} expected line ${mapping.expectedLine} but found ${mapping.line}`
      );
    }
  }
}

function addAudioStartupErrors(audioStartupLoads, errors) {
  let orderOk = true;
  let previousLine = -1;

  for (const entry of audioStartupLoads) {
    if (entry.line === null) {
      errors.push(`${GAMEAUDIO_CPP}: missing audio startup load ${entry.path}`);
      orderOk = false;
      continue;
    }

    if (entry.line !== entry.expectedLine) {
      errors.push(
        `${GAMEAUDIO_CPP}: ${entry.path} expected line ${entry.expectedLine} but found ${entry.line}`
      );
    }

    if (entry.line < previousLine) {
      errors.push(
        `${GAMEAUDIO_CPP}: audio startup order violation at ${entry.path} line ${entry.line}`
      );
      orderOk = false;
    }
    previousLine = entry.line;
  }

  return orderOk && audioStartupLoads.every((entry) => entry.line !== null);
}

function main() {
  const errors = [];
  const cppText = readText(sourcePaths.gameEngineCpp, GAMEENGINE_CPP, errors);
  const winMainText = readText(sourcePaths.winMainCpp, WINMAIN_CPP, errors);
  const headerText = readText(
    sourcePaths.win32GameEngineHeader,
    WIN32GAMEENGINE_H,
    errors
  );
  const audioText = readText(sourcePaths.gameAudioCpp, GAMEAUDIO_CPP, errors);

  const initOrder = cppText ? scanInitMarkers(cppText, errors) : [];
  const audioStartupLoads = audioText ? scanAudioStartupLoads(audioText, errors) : [];
  const createGameEngine = winMainText
    ? scanCreateGameEngine(winMainText)
    : {
        method: CREATE_GAME_ENGINE.method,
        expectedLine: CREATE_GAME_ENGINE.expectedLine,
        expectedConcrete: CREATE_GAME_ENGINE.expectedConcrete,
        line: null,
        concrete: null,
        ok: false,
      };
  const factoryMappings = headerText ? scanWin32FactoryMappings(headerText) : {};

  const orderOk = cppText ? addInitErrors(initOrder, errors) : false;
  if (winMainText) {
    addCreateGameEngineErrors(createGameEngine, errors);
  }
  if (headerText) {
    addFactoryMappingErrors(factoryMappings, errors);
  }
  const audioStartupOrderOk = audioText
    ? addAudioStartupErrors(audioStartupLoads, errors)
    : false;

  const ok =
    errors.length === 0 &&
    orderOk &&
    audioStartupOrderOk &&
    createGameEngine.ok &&
    Object.values(factoryMappings).every((mapping) => mapping.ok);

  const report = {
    ok,
    sources: {
      gameEngineCpp: GAMEENGINE_CPP,
      winMainCpp: WINMAIN_CPP,
      win32GameEngineHeader: WIN32GAMEENGINE_H,
      gameAudioCpp: GAMEAUDIO_CPP,
    },
    createGameEngine,
    initOrder,
    factoryMappings,
    audioStartupLoads,
    orderOk,
    audioStartupOrderOk,
    errors,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

main();
