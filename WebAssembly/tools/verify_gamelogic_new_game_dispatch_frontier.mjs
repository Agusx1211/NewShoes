#!/usr/bin/env node
// Verifies that the Skirmish start frontier is pinned to the original
// GameLogic MSG_NEW_GAME dispatch path, that the current shell smoke still
// stops before claiming original GameLogic ownership, and that the focused
// runtime smoke links original GlobalData.cpp/PlayerList.cpp/Player.cpp/
// GameLogic.cpp/GameLogicDispatch.cpp.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const repoRoot = resolve(wasmRoot, "..");

const paths = {
  messageStream: "GeneralsMD/Code/GameEngine/Source/Common/MessageStream.cpp",
  gameLogic: "GeneralsMD/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp",
  gameLogicDispatch:
    "GeneralsMD/Code/GameEngine/Source/GameLogic/System/GameLogicDispatch.cpp",
  shellSmoke: "WebAssembly/tests/w3d_window_layout_script_smoke.cpp",
  runtimeSmoke: "WebAssembly/tests/gamelogic_new_game_dispatch_smoke.cpp",
  gameLogicShim: "WebAssembly/shims/GameLogic/GameLogic.h",
  preRts: "WebAssembly/shims/PreRTS.h",
  cmake: "WebAssembly/CMakeLists.txt",
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readRepoText(relativePath) {
  try {
    return readFileSync(resolve(repoRoot, relativePath), "utf8");
  } catch (error) {
    fail(`failed to read ${relativePath}: ${error.message}`);
  }
}

function lineAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function lineOf(text, pattern, label) {
  const match = pattern.exec(text);
  if (!match) {
    fail(`missing ${label}`);
  }
  return lineAt(text, match.index);
}

function functionBody(text, signaturePattern, label) {
  const match = signaturePattern.exec(text);
  if (!match) {
    fail(`missing ${label}`);
  }

  const bodyStart = text.indexOf("{", match.index);
  if (bodyStart === -1) {
    fail(`missing body for ${label}`);
  }

  let depth = 0;
  for (let index = bodyStart; index < text.length; ++index) {
    if (text[index] === "{") {
      ++depth;
    } else if (text[index] === "}") {
      --depth;
      if (depth === 0) {
        return {
          body: text.slice(bodyStart + 1, index),
          bodyStart,
          bodyEnd: index,
          line: lineAt(text, match.index),
        };
      }
    }
  }

  fail(`unterminated body for ${label}`);
}

function expectInBody(text, info, pattern, label) {
  const match = pattern.exec(info.body);
  if (!match) {
    fail(`missing ${label}`);
  }
  return lineAt(text, info.bodyStart + 1 + match.index);
}

function expectOrderedInBody(text, info, steps, label) {
  const lines = [];
  let cursor = 0;
  for (const step of steps) {
    const match = step.pattern.exec(info.body.slice(cursor));
    if (!match) {
      fail(`missing ${label}: ${step.label}`);
    }
    const absoluteIndex = info.bodyStart + 1 + cursor + match.index;
    lines.push({
      label: step.label,
      line: lineAt(text, absoluteIndex),
    });
    cursor += match.index + match[0].length;
  }
  return lines;
}

function cmakeInvocationBlock(text, invocationPattern, label) {
  const match = invocationPattern.exec(text);
  if (!match) {
    fail(`missing ${label}`);
  }

  const openParen = text.indexOf("(", match.index);
  if (openParen === -1) {
    fail(`missing opening paren for ${label}`);
  }

  let depth = 0;
  for (let index = openParen; index < text.length; ++index) {
    if (text[index] === "(") {
      ++depth;
    } else if (text[index] === ")") {
      --depth;
      if (depth === 0) {
        return {
          block: text.slice(openParen + 1, index),
          line: lineAt(text, match.index),
        };
      }
    }
  }

  fail(`unterminated CMake invocation for ${label}`);
}

function expect(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const messageStream = readRepoText(paths.messageStream);
const gameLogic = readRepoText(paths.gameLogic);
const gameLogicDispatch = readRepoText(paths.gameLogicDispatch);
const shellSmoke = readRepoText(paths.shellSmoke);
const runtimeSmoke = readRepoText(paths.runtimeSmoke);
const gameLogicShim = readRepoText(paths.gameLogicShim);
const preRts = readRepoText(paths.preRts);
const cmake = readRepoText(paths.cmake);

const propagate = functionBody(
  messageStream,
  /void\s+MessageStream::propagateMessages\s*\(\s*void\s*\)/,
  "MessageStream::propagateMessages",
);
const propagateTransferLines = expectOrderedInBody(
  messageStream,
  propagate,
  [
    {
      label: "appendMessageList",
      pattern: /TheCommandList->appendMessageList\s*\(\s*m_firstMessage\s*\)\s*;/,
    },
    { label: "clear first message", pattern: /m_firstMessage\s*=\s*NULL\s*;/ },
    { label: "clear last message", pattern: /m_lastMessage\s*=\s*NULL\s*;/ },
  ],
  "MessageStream::propagateMessages transfer",
);

const processCommandList = functionBody(
  gameLogic,
  /void\s+GameLogic::processCommandList\s*\(\s*CommandList\s*\*\s*list\s*\)/,
  "GameLogic::processCommandList",
);
const processLines = expectOrderedInBody(
  gameLogic,
  processCommandList,
  [
    {
      label: "iterate command list",
      pattern: /for\s*\(\s*msg\s*=\s*list->getFirstMessage\s*\(\s*\)\s*;\s*msg\s*;\s*msg\s*=\s*msg->next\s*\(\s*\)\s*\)/,
    },
    {
      label: "dispatch message",
      pattern: /logicMessageDispatcher\s*\(\s*msg\s*,\s*NULL\s*\)\s*;/,
    },
  ],
  "GameLogic::processCommandList dispatch",
);

const dispatcher = functionBody(
  gameLogicDispatch,
  /void\s+GameLogic::logicMessageDispatcher\s*\(\s*GameMessage\s*\*\s*msg\s*,\s*void\s*\*\s*userData\s*\)/,
  "GameLogic::logicMessageDispatcher",
);
const dispatcherLines = expectOrderedInBody(
  gameLogicDispatch,
  dispatcher,
  [
    {
      label: "player lookup",
      pattern: /ThePlayerList->getNthPlayer\s*\(\s*msg->getPlayerIndex\s*\(\s*\)\s*\)/,
    },
    { label: "MSG_NEW_GAME case", pattern: /case\s+GameMessage::MSG_NEW_GAME\s*:/ },
    {
      label: "game mode argument",
      pattern: /Int\s+gameMode\s*=\s*msg->getArgument\s*\(\s*0\s*\)->integer\s*;/,
    },
    {
      label: "difficulty argument",
      pattern: /diff\s*=\s*\(GameDifficulty\)\s*msg->getArgument\s*\(\s*1\s*\)->integer\s*;/,
    },
    {
      label: "rank-points argument",
      pattern: /rankPoints\s*=\s*msg->getArgument\s*\(\s*2\s*\)->integer\s*;/,
    },
    {
      label: "game-speed argument",
      pattern: /Int\s+maxFPS\s*=\s*msg->getArgument\s*\(\s*3\s*\)->integer\s*;/,
    },
    {
      label: "fps-limit call",
      pattern: /TheGameEngine->setFramesPerSecondLimit\s*\(\s*maxFPS\s*\)\s*;/,
    },
    {
      label: "fps-limit global flag",
      pattern: /TheWritableGlobalData->m_useFpsLimit\s*=\s*true\s*;/,
    },
    {
      label: "prepare new game",
      pattern: /prepareNewGame\s*\(\s*gameMode\s*,\s*diff\s*,\s*rankPoints\s*\)\s*;/,
    },
    {
      label: "start new game",
      pattern: /startNewGame\s*\(\s*FALSE\s*\)\s*;/,
    },
  ],
  "GameLogic::logicMessageDispatcher MSG_NEW_GAME",
);

const prepareNewGame = functionBody(
  gameLogicDispatch,
  /void\s+GameLogic::prepareNewGame\s*\(\s*Int\s+gameMode\s*,\s*GameDifficulty\s+diff\s*,\s*Int\s+rankPoints\s*\)/,
  "GameLogic::prepareNewGame",
);
const prepareLines = expectOrderedInBody(
  gameLogicDispatch,
  prepareNewGame,
  [
    {
      label: "script difficulty",
      pattern: /TheScriptEngine->setGlobalDifficulty\s*\(\s*diff\s*\)\s*;/,
    },
    {
      label: "blank background layout",
      pattern: /m_background\s*=\s*TheWindowManager->winCreateLayout\s*\(\s*"Menus\/BlankWindow\.wnd"\s*\)\s*;/,
    },
    {
      label: "clear background image",
      pattern: /m_background->getFirstWindow\s*\(\s*\)->winClearStatus\s*\(\s*WIN_STATUS_IMAGE\s*\)\s*;/,
    },
    {
      label: "set game mode",
      pattern: /TheGameLogic->setGameMode\s*\(\s*gameMode\s*\)\s*;/,
    },
    {
      label: "pending file promoted to map",
      pattern: /TheWritableGlobalData->m_mapName\s*=\s*TheGlobalData->m_pendingFile\s*;/,
    },
    {
      label: "hide shell",
      pattern: /TheShell->hideShell\s*\(\s*\)\s*;/,
    },
    {
      label: "defer first startNewGame",
      pattern: /m_startNewGame\s*=\s*FALSE\s*;/,
    },
  ],
  "GameLogic::prepareNewGame setup",
);

const startNewGame = functionBody(
  gameLogic,
  /void\s+GameLogic::startNewGame\s*\(\s*Bool\s+loadingSaveGame\s*\)/,
  "GameLogic::startNewGame",
);
const startLines = expectOrderedInBody(
  gameLogic,
  startNewGame,
  [
    { label: "enter loading map", pattern: /setLoadingMap\s*\(\s*TRUE\s*\)\s*;/ },
    {
      label: "record pristine map",
      pattern: /TheGameState->setPristineMapName\s*\(\s*TheGlobalData->m_mapName\s*\)\s*;/,
    },
    {
      label: "reject save-directory map",
      pattern: /TheGameState->isInSaveDirectory\s*\(\s*TheGlobalData->m_mapName\s*\)/,
    },
    {
      label: "first-call defer flag",
      pattern: /m_startNewGame\s*=\s*TRUE\s*;/,
    },
    { label: "first-call return", pattern: /return\s*;/ },
    {
      label: "later terrain load",
      pattern: /TheTerrainLogic->loadMap\s*\(\s*TheGlobalData->m_mapName\s*,\s*false\s*\)\s*;/,
    },
    {
      label: "player list new game",
      pattern: /ThePlayerList->newGame\s*\(\s*\)\s*;/,
    },
    {
      label: "script engine new map",
      pattern: /TheScriptEngine->newMap\s*\(\s*\)\s*;/,
    },
    {
      label: "radar new map",
      pattern: /TheRadar->newMap\s*\(\s*TheTerrainLogic\s*\)\s*;/,
    },
    {
      label: "in-game ui client quiet",
      pattern: /TheInGameUI->setClientQuiet\s*\(\s*FALSE\s*\)\s*;/,
    },
    {
      label: "victory cache players",
      pattern: /TheVictoryConditions->cachePlayerPtrs\s*\(\s*\)\s*;/,
    },
    {
      label: "victory condition set",
      pattern: /TheVictoryConditions->setVictoryConditions\s*\(\s*VICTORY_NOBUILDINGS\s*\)\s*;/,
    },
    {
      label: "game logic width",
      pattern: /TheGameLogic->setWidth\s*\(\s*extent\.hi\.x\s*-\s*extent\.lo\.x\s*\)\s*;/,
    },
    {
      label: "game logic height",
      pattern: /TheGameLogic->setHeight\s*\(\s*extent\.hi\.y\s*-\s*extent\.lo\.y\s*\)\s*;/,
    },
    {
      label: "partition init",
      pattern: /ThePartitionManager->init\s*\(\s*\)\s*;/,
    },
    {
      label: "partition shroud refresh",
      pattern: /ThePartitionManager->refreshShroudForLocalPlayer\s*\(\s*\)\s*;/,
    },
    {
      label: "ghost local player",
      pattern: /TheGhostObjectManager->setLocalPlayerIndex\s*\(\s*ThePlayerList->getLocalPlayer\s*\(\s*\)->getPlayerIndex\s*\(\s*\)\s*\)\s*;/,
    },
    {
      label: "ghost reset",
      pattern: /TheGhostObjectManager->reset\s*\(\s*\)\s*;/,
    },
    {
      label: "terrain logic new map",
      pattern: /TheTerrainLogic->newMap\s*\(\s*loadingSaveGame\s*\)\s*;/,
    },
  ],
  "GameLogic::startNewGame first-call deferral and post-radar partition handoff",
);

const targetSources = cmakeInvocationBlock(
  cmake,
  /add_executable\s*\(\s*w3d-window-layout-script-smoke\b/,
  "w3d-window-layout-script-smoke add_executable",
);
const targetIncludes = cmakeInvocationBlock(
  cmake,
  /target_include_directories\s*\(\s*w3d-window-layout-script-smoke\b/,
  "w3d-window-layout-script-smoke target_include_directories",
);
const shimIncludeIndex = targetIncludes.block.indexOf("${WASM_SHIMS_DIR}");
const originalIncludeIndex = targetIncludes.block.indexOf("${GAMEENGINE_INCLUDE_DIR}");
expect(shimIncludeIndex !== -1, "w3d-window-layout-script-smoke does not include WASM_SHIMS_DIR");
expect(originalIncludeIndex !== -1, "w3d-window-layout-script-smoke does not include GAMEENGINE_INCLUDE_DIR");
expect(
  shimIncludeIndex < originalIncludeIndex,
  "w3d-window-layout-script-smoke no longer resolves shim headers before original headers",
);
expect(
  !/System\/GameLogic\.cpp|System\\GameLogic\.cpp/.test(targetSources.block),
  "w3d-window-layout-script-smoke unexpectedly links original GameLogic.cpp",
);
expect(
  !/System\/GameLogicDispatch\.cpp|System\\GameLogicDispatch\.cpp/.test(targetSources.block),
  "w3d-window-layout-script-smoke unexpectedly links original GameLogicDispatch.cpp",
);

const shimPrepareLine = lineOf(
  gameLogicShim,
  /void\s+prepareNewGame\s*\(\s*Int\s*,\s*GameDifficulty\s*,\s*Int\s*\)\s*\{\s*\}/,
  "focused GameLogic shim no-op prepareNewGame",
);
expect(
  !/processCommandList\s*\(/.test(gameLogicShim),
  "focused GameLogic shim now exposes processCommandList; update this frontier before claiming runtime coverage",
);

const gameStateSentinelLine = lineOf(
  shellSmoke,
  /TheGameState\s*=\s*reinterpret_cast<GameState\s*\*>\s*\(\s*1\s*\)\s*;/,
  "shell smoke GameState sentinel",
);
const playerLookupShim = functionBody(
  shellSmoke,
  /Player\s*\*\s*PlayerList::getNthPlayer\s*\(\s*Int\s*\)/,
  "shell smoke PlayerList::getNthPlayer boundary",
);
const playerLookupShimReturnLine = expectInBody(
  shellSmoke,
  playerLookupShim,
  /return\s+nullptr\s*;/,
  "shell smoke PlayerList::getNthPlayer returns null",
);

const runtimeTargetSources = cmakeInvocationBlock(
  cmake,
  /add_executable\s*\(\s*gamelogic-new-game-dispatch-smoke\b/,
  "gamelogic-new-game-dispatch-smoke add_executable",
);
expect(
  /\$\{GAMEENGINE_COMMON_DIR\}\/GlobalData\.cpp|Common\/GlobalData\.cpp|Common\\GlobalData\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original GlobalData.cpp",
);
expect(
  /INI\/INI\.cpp|INI\\INI\.cpp/.test(runtimeTargetSources.block)
    && /INI\/INIGameData\.cpp|INI\\INIGameData\.cpp/.test(runtimeTargetSources.block)
    && /INI\/INIAiData\.cpp|INI\\INIAiData\.cpp/.test(runtimeTargetSources.block)
    && /INI\/INIMultiplayer\.cpp|INI\\INIMultiplayer\.cpp/.test(runtimeTargetSources.block)
    && /MultiplayerSettings\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original startup INI/MultiplayerSettings sources",
);
expect(
  /UserPreferences\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original UserPreferences.cpp for GameData preference storage",
);
expect(
  /System\/FunctionLexicon\.cpp|System\\FunctionLexicon\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original FunctionLexicon.cpp",
);
expect(
  /RTS\/PlayerList\.cpp|RTS\\PlayerList\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/Player\.cpp|RTS\\Player\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original PlayerList.cpp/Player.cpp",
);
expect(
  /RTS\/AcademyStats\.cpp|RTS\\AcademyStats\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/Energy\.cpp|RTS\\Energy\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/Money\.cpp|RTS\\Money\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/PlayerTemplate\.cpp|RTS\\PlayerTemplate\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/ResourceGatheringManager\.cpp|RTS\\ResourceGatheringManager\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/ScoreKeeper\.cpp|RTS\\ScoreKeeper\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/Science\.cpp|RTS\\Science\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/Team\.cpp|RTS\\Team\.cpp/.test(runtimeTargetSources.block)
    && /RTS\/TunnelTracker\.cpp|RTS\\TunnelTracker\.cpp/.test(runtimeTargetSources.block)
    && /AI\/Squad\.cpp|AI\\Squad\.cpp/.test(runtimeTargetSources.block)
    && /System\/RankInfo\.cpp|System\\RankInfo\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original Player support sources",
);
expect(
  /System\/GameLogic\.cpp|System\\GameLogic\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original GameLogic.cpp",
);
expect(
  /System\/GameLogicDispatch\.cpp|System\\GameLogicDispatch\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original GameLogicDispatch.cpp",
);
expect(
  /System\/SaveGame\/GameState\.cpp|System\\SaveGame\\GameState\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original GameState.cpp",
);
expect(
  /System\/Radar\.cpp|System\\Radar\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original Radar.cpp",
);
expect(
  /ScriptEngine\/ScriptEngine\.cpp|ScriptEngine\\ScriptEngine\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original ScriptEngine.cpp",
);
expect(
  /ScriptEngine\/Scripts\.cpp|ScriptEngine\\Scripts\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original Scripts.cpp for ScriptEngine templates",
);
expect(
  /Display\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original Display.cpp for Shell display-size ownership",
);
expect(
  /GUI\/Shell\/Shell\.cpp|GUI\\Shell\\Shell\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original Shell.cpp",
);
expect(
  /GUI\/AnimateWindowManager\.cpp|GUI\\AnimateWindowManager\.cpp/.test(runtimeTargetSources.block)
    && /GUI\/ProcessAnimateWindow\.cpp|GUI\\ProcessAnimateWindow\.cpp/.test(runtimeTargetSources.block)
    && /GUI\/Shell\/ShellMenuScheme\.cpp|GUI\\Shell\\ShellMenuScheme\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original Shell support sources",
);
expect(
  /GUI\/GameWindowManagerScript\.cpp|GUI\\GameWindowManagerScript\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original GameWindowManagerScript.cpp for archive-backed BlankWindow layouts",
);
expect(
  /GUI\/HeaderTemplate\.cpp|GUI\\HeaderTemplate\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original HeaderTemplate.cpp for archive layout parsing",
);
expect(
  /Map\/SidesList\.cpp|Map\\SidesList\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original SidesList.cpp for shipped map side parsing",
);
expect(
  /AI\/AI\.cpp|AI\\AI\.cpp/.test(runtimeTargetSources.block)
    && /AI\/AIPathfind\.cpp|AI\\AIPathfind\.cpp/.test(runtimeTargetSources.block)
    && /AI\/AIPlayer\.cpp|AI\\AIPlayer\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original AI/AIPlayer sources for non-human sides",
);
expect(
  /Object\/Weapon\.cpp|Object\\Weapon\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original Weapon.cpp for GameData WeaponBonus parsing",
);
expect(
  /GameSpy\/Chat\.cpp|GameSpy\\Chat\.cpp/.test(runtimeTargetSources.block),
  "gamelogic-new-game-dispatch-smoke does not link original OnlineChatColors parser source",
);
const runtimeLinkLibraries = cmakeInvocationBlock(
  cmake,
  /target_link_libraries\s*\(\s*gamelogic-new-game-dispatch-smoke\b/,
  "gamelogic-new-game-dispatch-smoke target_link_libraries",
);
expect(
  /zh_w3d_terrain_probe_runtime/.test(runtimeLinkLibraries.block),
  "gamelogic-new-game-dispatch-smoke does not link the W3D terrain runtime library",
);
const runtimeCompileDefinitions = cmakeInvocationBlock(
  cmake,
  /target_compile_definitions\s*\(\s*gamelogic-new-game-dispatch-smoke\b/,
  "gamelogic-new-game-dispatch-smoke target_compile_definitions",
);
expect(
  /WASM_USE_ORIGINAL_GLOBALDATA\s*=\s*1/.test(runtimeCompileDefinitions.block),
  "gamelogic-new-game-dispatch-smoke does not opt into original GlobalData headers",
);
const runtimeCompileOptions = cmakeInvocationBlock(
  cmake,
  /target_compile_options\s*\(\s*gamelogic-new-game-dispatch-smoke\b/,
  "gamelogic-new-game-dispatch-smoke target_compile_options",
);
const originalGlobalDataHeaderIndex =
  runtimeCompileOptions.block.indexOf("-include${GAMEENGINE_INCLUDE_DIR}/Common/GlobalData.h");
const preRtsHeaderIndex = runtimeCompileOptions.block.indexOf("-include${WASM_SHIMS_DIR}/PreRTS.h");
expect(
  originalGlobalDataHeaderIndex !== -1,
  "gamelogic-new-game-dispatch-smoke does not force-include original GlobalData.h",
);
expect(
  preRtsHeaderIndex !== -1,
  "gamelogic-new-game-dispatch-smoke does not force-include PreRTS.h",
);
expect(
  originalGlobalDataHeaderIndex < preRtsHeaderIndex,
  "gamelogic-new-game-dispatch-smoke does not include original GlobalData.h before PreRTS.h",
);
expect(
  /#if\s+defined\s*\(\s*WASM_USE_ORIGINAL_GLOBALDATA\s*\)[\s\S]*#include_next\s+"Common\/GlobalData\.h"[\s\S]*#else[\s\S]*#include\s+"Common\/GlobalData\.h"/.test(preRts),
  "PreRTS.h does not preserve the original GlobalData escape hatch",
);
const runtimeLinkOptions = cmakeInvocationBlock(
  cmake,
  /target_link_options\s*\(\s*gamelogic-new-game-dispatch-smoke\b/,
  "gamelogic-new-game-dispatch-smoke target_link_options",
);
expect(
  !runtimeLinkOptions.block.includes("--wrap=_ZN10PlayerList12getNthPlayerEi"),
  "gamelogic-new-game-dispatch-smoke still declares the focused PlayerList lookup wrap",
);
expect(
  /-sNODERAWFS=1/.test(runtimeLinkOptions.block),
  "gamelogic-new-game-dispatch-smoke does not expose raw FS access for base Window.big",
);
const runtimeProcessCommandListLine = lineOf(
  runtimeSmoke,
  /logic->processCommandList\s*\(\s*TheCommandList\s*\)\s*;/,
  "runtime smoke GameLogic::processCommandList call",
);
const runtimePathLine = lineOf(
  runtimeSmoke,
  /gamelogic-new-game-dispatch-runtime/,
  "runtime smoke JSON path",
);
const runtimeSourceLine = lineOf(
  runtimeSmoke,
  /GlobalData\.cpp\/INI\.cpp\/INIGameData\.cpp\/INIAiData\.cpp\/INIMultiplayer\.cpp\/UserPreferences\.cpp\/MultiplayerSettings\.cpp\/Science\.cpp\/PlayerTemplate\.cpp\/FunctionLexicon\.cpp\/PlayerList\.cpp\/Player\.cpp\/AI\.cpp\/AIPathfind\.cpp\/AIPlayer\.cpp\/Weapon\.cpp\/GameLogic\.cpp\/GameLogicDispatch\.cpp\/GameState\.cpp\/Radar\.cpp\/PartitionManager\.cpp\/ScriptEngine\.cpp\/Scripts\.cpp\/Shell\.cpp\/GameWindowManagerScript\.cpp\/HeaderTemplate\.cpp\/TerrainLogic\.cpp\/W3DTerrainLogic\.cpp\/WorldHeightMap\.cpp\/TerrainVisual\.cpp\/SidesList\.cpp\/ThingFactory\.cpp/,
  "runtime smoke original source JSON",
);
const runtimeArchivePathLine = lineOf(
  runtimeSmoke,
  /artifacts\/real-assets\/Window\.big/,
  "runtime smoke base Window.big path",
);
const runtimeArchiveLoadLine = lineOf(
  runtimeSmoke,
  /loadBigFilesFromDirectory\s*\(\s*archive_directory\s*,\s*archive_mask\s*\)/,
  "runtime smoke base Window.big load",
);
const runtimeMapsArchiveLoadLine = lineOf(
  runtimeSmoke,
  /loadBigFilesFromDirectory\s*\(\s*archive_directory\s*,\s*maps_archive_mask\s*\)/,
  "runtime smoke MapsZH.big load",
);
const runtimeZhIniArchiveLoadLine = lineOf(
  runtimeSmoke,
  /loadBigFilesFromDirectory\s*\(\s*archive_directory\s*,\s*zh_ini_archive_mask\s*\)/,
  "runtime smoke INIZH.big load",
);
const runtimeBaseIniArchiveLoadLine = lineOf(
  runtimeSmoke,
  /loadBigFilesFromDirectory\s*\(\s*archive_directory\s*,\s*base_ini_archive_mask\s*\)/,
  "runtime smoke base INI.big load",
);
const runtimePromotedMapLine = lineOf(
  runtimeSmoke,
  /global_data\.m_pendingFile\s*=\s*gameplay_map_path\s*;/,
  "runtime smoke promoted shipped map assignment",
);
const runtimeBlankWindowExistsLine = lineOf(
  runtimeSmoke,
  /doesFileExist\s*\(\s*"Window\\\\Menus\\\\BlankWindow\.wnd"\s*\)/,
  "runtime smoke BlankWindow.wnd archive existence proof",
);
const runtimeWinCreateLayoutDelegationLine = lineOf(
  runtimeSmoke,
  /GameWindowManager::winCreateLayout\s*\(\s*filename\s*\)/,
  "runtime smoke original GameWindowManager::winCreateLayout delegation",
);
const runtimeArchiveBlankWindowProofLine = lineOf(
  runtimeSmoke,
  /g_prepare_blank_window_loaded_from_archive\s*&&[\s\S]*g_prepare_blank_window_root_ready/,
  "runtime smoke prepareNewGame archive-backed BlankWindow proof",
);
const runtimeTerrainLogicLine = lineOf(
  runtimeSmoke,
  /W3DTerrainLogic\s+terrain_logic\s*;/,
  "runtime smoke original W3DTerrainLogic allocation",
);
const runtimeTerrainVisualLine = lineOf(
  runtimeSmoke,
  /SmokeTerrainVisual\s+terrain_visual\s*;/,
  "runtime smoke TerrainVisual handoff owner",
);
const runtimeTerrainLoadLine = lineOf(
  runtimeSmoke,
  /terrain_logic\.loadMap\s*\(\s*global_data\.m_mapName\s*,\s*FALSE\s*\)/,
  "runtime smoke original W3DTerrainLogic::loadMap(false) call",
);
const runtimeTerrainExtentLine = lineOf(
  runtimeSmoke,
  /terrain_extent_hi_x\s*==\s*3800\s*&&\s*terrain_extent_hi_y\s*==\s*3800/,
  "runtime smoke MD_GLA03 terrain extent proof",
);
expect(
  !/__wrap__ZN10PlayerList12getNthPlayerEi/.test(runtimeSmoke),
  "runtime smoke still provides a focused PlayerList::getNthPlayer wrapper",
);
expect(
  !/focused in-memory BlankWindow layout adapter/.test(runtimeSmoke),
  "runtime smoke still reports the focused in-memory BlankWindow layout adapter",
);
const runtimePlayerListLine = lineOf(
  runtimeSmoke,
  /PlayerList\s*\*\s*player_list\s*=\s*new\s+PlayerList\s*;/,
  "runtime smoke original PlayerList allocation",
);
const runtimePlayerListSingletonLine = lineOf(
  runtimeSmoke,
  /ThePlayerList\s*=\s*player_list\s*;/,
  "runtime smoke original ThePlayerList assignment",
);
const runtimePlayerListProofLine = lineOf(
  runtimeSmoke,
  /player_list->getNthPlayer\s*\(\s*0\s*\)\s*!=\s*nullptr[\s\S]*player_list->getNeutralPlayer\s*\(\s*\)[\s\S]*player_list->getPlayerCount\s*\(\s*\)\s*==\s*1/,
  "runtime smoke original PlayerList neutral-player proof",
);
const runtimePlayerListNewGameLine = lineOf(
  runtimeSmoke,
  /player_list->newGame\s*\(\s*\)\s*;/,
  "runtime smoke original PlayerList::newGame call",
);
const runtimeTeamFactoryLine = lineOf(
  runtimeSmoke,
  /TeamFactory\s*\*\s*team_factory\s*=\s*new\s+TeamFactory\s*;/,
  "runtime smoke original TeamFactory allocation",
);
const runtimeScriptNewMapLine = lineOf(
  runtimeSmoke,
  /script_engine->newMap\s*\(\s*\)\s*;/,
  "runtime smoke original ScriptEngine::newMap call",
);
const runtimeRadarLine = lineOf(
  runtimeSmoke,
  /SmokeRadar\s*\*\s*radar\s*=\s*new\s+SmokeRadar\s*;/,
  "runtime smoke Radar allocation",
);
const runtimeRadarSingletonLine = lineOf(
  runtimeSmoke,
  /TheRadar\s*=\s*radar\s*;/,
  "runtime smoke original TheRadar assignment",
);
const runtimeRadarNewMapLine = lineOf(
  runtimeSmoke,
  /TheRadar->newMap\s*\(\s*TheTerrainLogic\s*\)\s*;/,
  "runtime smoke original Radar::newMap call",
);
const runtimeRadarWindowLine = lineOf(
  runtimeSmoke,
  /installRadarWindow\s*\(\s*\)\s*;/,
  "runtime smoke ControlBar LeftHUD radar window installation",
);
const runtimeRadarProofLine = lineOf(
  runtimeSmoke,
  /radar_extent_hi_x\s*==\s*terrain_extent_hi_x[\s\S]*radar_extent_hi_y\s*==\s*terrain_extent_hi_y[\s\S]*radar->xSample\s*\(\s*\)/,
  "runtime smoke original Radar::newMap extent/sample proof",
);
const runtimeDefaultGameDataLoadLine = lineOf(
  runtimeSmoke,
  /startup_ini\.load\s*\(\s*"Data\\\\INI\\\\Default\\\\GameData\.ini"\s*,\s*INI_LOAD_OVERWRITE\s*,\s*nullptr\s*\)\s*;/,
  "runtime smoke original default GameData.ini load",
);
const runtimeGameDataLoadLine = lineOf(
  runtimeSmoke,
  /startup_ini\.load\s*\(\s*"Data\\\\INI\\\\GameData\.ini"\s*,\s*INI_LOAD_OVERWRITE\s*,\s*nullptr\s*\)\s*;/,
  "runtime smoke original GameData.ini load",
);
if (runtimeDefaultGameDataLoadLine >= runtimeGameDataLoadLine) {
  fail("runtime smoke should load default GameData.ini before Zero Hour GameData.ini");
}
const runtimeGameDataPartitionSizeLine = lineOf(
  runtimeSmoke,
  /startup_partition_cell_size\s*=\s*global_data\.m_partitionCellSize\s*;/,
  "runtime smoke GlobalData partition cell-size capture",
);
const runtimeVictoryCacheLine = lineOf(
  runtimeSmoke,
  /TheVictoryConditions->cachePlayerPtrs\s*\(\s*\)\s*;/,
  "runtime smoke victory cache boundary call",
);
const runtimeVictorySetLine = lineOf(
  runtimeSmoke,
  /TheVictoryConditions->setVictoryConditions\s*\(\s*VICTORY_NOBUILDINGS\s*\)\s*;/,
  "runtime smoke victory condition set call",
);
const runtimeGameLogicWidthLine = lineOf(
  runtimeSmoke,
  /TheGameLogic->setWidth\s*\(\s*terrain_extent\.hi\.x\s*-\s*terrain_extent\.lo\.x\s*\)\s*;/,
  "runtime smoke GameLogic width from terrain extent",
);
const runtimePartitionAllocationLine = lineOf(
  runtimeSmoke,
  /PartitionManager\s*\*\s*partition_manager\s*=\s*new\s+PartitionManager\s*;/,
  "runtime smoke original PartitionManager allocation",
);
const runtimePartitionSingletonLine = lineOf(
  runtimeSmoke,
  /ThePartitionManager\s*=\s*partition_manager\s*;/,
  "runtime smoke original ThePartitionManager assignment",
);
const runtimePartitionInitLine = lineOf(
  runtimeSmoke,
  /partition_manager->init\s*\(\s*\)\s*;/,
  "runtime smoke original PartitionManager::init call",
);
const runtimePartitionRefreshLine = lineOf(
  runtimeSmoke,
  /partition_manager->refreshShroudForLocalPlayer\s*\(\s*\)\s*;/,
  "runtime smoke original PartitionManager::refreshShroudForLocalPlayer call",
);
const runtimePartitionGridProofLine = lineOf(
  runtimeSmoke,
  /partition_cell_count_x\s*==\s*expected_partition_cell_count_x[\s\S]*partition_cell_count_y\s*==\s*expected_partition_cell_count_y/,
  "runtime smoke original PartitionManager cell-grid proof",
);
const runtimePartitionShroudProofLine = lineOf(
  runtimeSmoke,
  /g_display_clear_shroud_calls\s*==\s*1[\s\S]*g_radar_clear_shroud_calls\s*==\s*1[\s\S]*g_display_set_shroud_calls\s*==\s*partition_total_cells[\s\S]*g_radar_set_shroud_calls\s*==\s*partition_total_cells/,
  "runtime smoke original PartitionManager shroud-refresh proof",
);
const runtimeAiLine = lineOf(
  runtimeSmoke,
  /AI\s+ai\s*;/,
  "runtime smoke original AI allocation",
);
const runtimeRankInfoStoreLine = lineOf(
  runtimeSmoke,
  /RankInfoStore\s+rank_info_store\s*;/,
  "runtime smoke original RankInfoStore allocation",
);
expect(
  !/reinterpret_cast<PlayerList\s*\*>\s*\(\s*1\s*\)/.test(runtimeSmoke),
  "runtime smoke still uses the focused PlayerList sentinel",
);
const runtimeGlobalDataLine = lineOf(
  runtimeSmoke,
  /GlobalData\s+global_data\s*;/,
  "runtime smoke original GlobalData allocation",
);
const runtimeGlobalDataWritableLine = lineOf(
  runtimeSmoke,
  /TheWritableGlobalData\s*=\s*&global_data\s*;/,
  "runtime smoke original TheWritableGlobalData assignment",
);
const runtimeGlobalDataMacroProofLine = lineOf(
  runtimeSmoke,
  /TheGlobalData\s*==\s*&global_data/,
  "runtime smoke original TheGlobalData macro proof",
);
expect(
  !/GlobalData\s*\*\s*TheGlobalData\s*=/.test(runtimeSmoke),
  "runtime smoke still defines the shim TheGlobalData singleton",
);
expect(
  !/shim GlobalData bridge/.test(runtimeSmoke),
  "runtime smoke still reports the shim GlobalData bridge",
);
const runtimeGameLogicLine = lineOf(
  runtimeSmoke,
  /GameLogic\s*\*\s*logic\s*=\s*new\s+GameLogic\s*;/,
  "runtime smoke original GameLogic allocation",
);
expect(
  !/void\s+Shell::hideShell\s*\(/.test(runtimeSmoke),
  "runtime smoke still provides a focused Shell::hideShell body",
);
expect(
  !/void\s+ScriptEngine::setGlobalDifficulty\s*\(/.test(runtimeSmoke),
  "runtime smoke still provides a focused ScriptEngine::setGlobalDifficulty body",
);
const runtimeScriptEngineLine = lineOf(
  runtimeSmoke,
  /ScriptEngine\s*\*\s*script_engine\s*=\s*new\s+ScriptEngine\s*;/,
  "runtime smoke original ScriptEngine allocation",
);
const runtimeScriptNormalLine = lineOf(
  runtimeSmoke,
  /script_engine->getGlobalDifficulty\s*\(\s*\)\s*==\s*DIFFICULTY_NORMAL/,
  "runtime smoke original ScriptEngine constructor difficulty proof",
);
const runtimeScriptHardLine = lineOf(
  runtimeSmoke,
  /script_engine->getGlobalDifficulty\s*\(\s*\)\s*==\s*DIFFICULTY_HARD/,
  "runtime smoke original ScriptEngine prepareNewGame difficulty proof",
);
const runtimeShellLine = lineOf(
  runtimeSmoke,
  /Shell\s*\*\s*shell\s*=\s*new\s+Shell\s*;/,
  "runtime smoke original Shell allocation",
);
const runtimeShellPushLine = lineOf(
  runtimeSmoke,
  /shell->push\s*\(\s*"Menus\/BlankWindow\.wnd"\s*\)\s*;/,
  "runtime smoke original Shell::push seed",
);
const runtimeShellHideProofLine = lineOf(
  runtimeSmoke,
  /shell->isShellActive\s*\(\s*\)\s*==\s*FALSE[\s\S]*shell->getScreenCount\s*\(\s*\)\s*==\s*1/,
  "runtime smoke original Shell::hideShell state proof",
);
const runtimeOriginalOwnersLine = lineOf(
  runtimeSmoke,
  /originalOwners/,
  "runtime smoke originalOwners JSON",
);
const runtimeOriginalGlobalDataOwnerLine = lineOf(
  runtimeSmoke,
  /GlobalData TheWritableGlobalData/,
  "runtime smoke original GlobalData owner JSON",
);

console.log(JSON.stringify({
  ok: true,
  source: "GeneralsMD original",
  path: "gamelogic-new-game-dispatch-frontier",
  commandTransfer: {
    source: paths.messageStream,
    propagateMessagesLine: propagate.line,
    transfer: propagateTransferLines,
  },
  processCommandList: {
    source: paths.gameLogic,
    line: processCommandList.line,
    dispatch: processLines,
  },
  dispatcher: {
    source: paths.gameLogicDispatch,
    line: dispatcher.line,
    playerLookupBeforeNewGame: true,
    newGame: dispatcherLines,
  },
  prepareNewGame: {
    source: paths.gameLogicDispatch,
    line: prepareNewGame.line,
    setup: prepareLines,
  },
  startNewGame: {
    source: paths.gameLogic,
    line: startNewGame.line,
    firstCallDefersBeforeTerrainLoad: true,
    setup: startLines,
  },
  currentShellSmokeBoundary: {
    smokeSource: paths.shellSmoke,
    cmakeTargetLine: targetSources.line,
    cmakeIncludeLine: targetIncludes.line,
    shimHeader: paths.gameLogicShim,
    shimPrepareNewGameLine: shimPrepareLine,
    originalGameLogicCppLinked: false,
    originalGameLogicDispatchCppLinked: false,
    gameStateSentinelLine,
    playerLookupShimLine: playerLookupShim.line,
    playerLookupShimReturnLine,
  },
  runtimeTargetBoundary: {
    smokeSource: paths.runtimeSmoke,
    cmakeTargetLine: runtimeTargetSources.line,
    cmakeCompileDefinitionsLine: runtimeCompileDefinitions.line,
    cmakeCompileOptionsLine: runtimeCompileOptions.line,
    cmakeLinkOptionsLine: runtimeLinkOptions.line,
    preRtsHeader: paths.preRts,
    originalGlobalDataCppLinked: true,
    originalFunctionLexiconCppLinked: true,
    originalPlayerListCppLinked: true,
    originalPlayerCppLinked: true,
    originalPlayerSupportSourcesLinked: true,
    originalStartupIniSourcesLinked: true,
    originalGameDataIniParserLinked: true,
    originalUserPreferencesCppLinked: true,
    originalAiPlayerSourcesLinked: true,
    originalWeaponCppLinked: true,
    originalGlobalDataHeaderPreincluded: true,
    preRtsOriginalGlobalDataEscapeHatch: true,
    originalGameLogicCppLinked: true,
    originalGameLogicDispatchCppLinked: true,
    originalGameStateCppLinked: true,
    originalRadarCppLinked: true,
    originalScriptEngineCppLinked: true,
    originalScriptsCppLinked: true,
    originalDisplayCppLinked: true,
    originalShellCppLinked: true,
    originalGameWindowManagerScriptCppLinked: true,
    originalHeaderTemplateCppLinked: true,
    originalSidesListCppLinked: true,
    w3dTerrainRuntimeLinked: true,
    rawFilesystemForWindowBig: true,
    processCommandListLine: runtimeProcessCommandListLine,
    runtimePathLine,
    runtimeSourceLine,
    archivePathLine: runtimeArchivePathLine,
    archiveLoadLine: runtimeArchiveLoadLine,
    mapsArchiveLoadLine: runtimeMapsArchiveLoadLine,
    zhIniArchiveLoadLine: runtimeZhIniArchiveLoadLine,
    baseIniArchiveLoadLine: runtimeBaseIniArchiveLoadLine,
    promotedMapLine: runtimePromotedMapLine,
    blankWindowExistsLine: runtimeBlankWindowExistsLine,
    winCreateLayoutDelegationLine: runtimeWinCreateLayoutDelegationLine,
    archiveBlankWindowProofLine: runtimeArchiveBlankWindowProofLine,
    terrainLogicLine: runtimeTerrainLogicLine,
    terrainVisualLine: runtimeTerrainVisualLine,
    terrainLoadLine: runtimeTerrainLoadLine,
    terrainExtentLine: runtimeTerrainExtentLine,
    playerListAllocationLine: runtimePlayerListLine,
    playerListSingletonLine: runtimePlayerListSingletonLine,
    playerListNeutralPlayerProofLine: runtimePlayerListProofLine,
    playerListNewGameLine: runtimePlayerListNewGameLine,
    teamFactoryLine: runtimeTeamFactoryLine,
    scriptNewMapLine: runtimeScriptNewMapLine,
    radarLine: runtimeRadarLine,
    radarSingletonLine: runtimeRadarSingletonLine,
    radarNewMapLine: runtimeRadarNewMapLine,
    radarWindowLine: runtimeRadarWindowLine,
    radarProofLine: runtimeRadarProofLine,
    defaultGameDataLoadLine: runtimeDefaultGameDataLoadLine,
    gameDataLoadLine: runtimeGameDataLoadLine,
    gameDataPartitionCellSizeLine: runtimeGameDataPartitionSizeLine,
    victoryCacheLine: runtimeVictoryCacheLine,
    victorySetLine: runtimeVictorySetLine,
    gameLogicWidthLine: runtimeGameLogicWidthLine,
    partitionAllocationLine: runtimePartitionAllocationLine,
    partitionSingletonLine: runtimePartitionSingletonLine,
    partitionInitLine: runtimePartitionInitLine,
    partitionRefreshLine: runtimePartitionRefreshLine,
    partitionGridProofLine: runtimePartitionGridProofLine,
    partitionShroudProofLine: runtimePartitionShroudProofLine,
    aiLine: runtimeAiLine,
    rankInfoStoreLine: runtimeRankInfoStoreLine,
    noFocusedPlayerLookupWrap: true,
    noPlayerListSentinel: true,
    globalDataAllocationLine: runtimeGlobalDataLine,
    globalDataWritableSingletonLine: runtimeGlobalDataWritableLine,
    globalDataMacroProofLine: runtimeGlobalDataMacroProofLine,
    noLocalTheGlobalDataSingleton: true,
    gameLogicAllocationLine: runtimeGameLogicLine,
    scriptEngineAllocationLine: runtimeScriptEngineLine,
    scriptEngineConstructorDifficultyLine: runtimeScriptNormalLine,
    scriptEnginePrepareDifficultyLine: runtimeScriptHardLine,
    shellAllocationLine: runtimeShellLine,
    shellPushLine: runtimeShellPushLine,
    shellHideStateProofLine: runtimeShellHideProofLine,
    originalOwnersLine: runtimeOriginalOwnersLine,
    originalGlobalDataOwnerLine: runtimeOriginalGlobalDataOwnerLine,
  },
  covered: [
    "MessageStream::propagateMessages transfers messages to TheCommandList",
    "GameLogic::processCommandList dispatches CommandList messages through logicMessageDispatcher",
    "MSG_NEW_GAME reads game mode, difficulty, rank points, and game speed arguments",
    "MSG_NEW_GAME applies the FPS limit, calls prepareNewGame, then calls startNewGame(FALSE)",
    "prepareNewGame owns original ScriptEngine difficulty, BlankWindow background, game-mode, pending-map, and original Shell::hideShell setup",
    "startNewGame(FALSE) records the pristine map and defers the first call before terrain load",
    "w3d-window-layout-script-smoke still uses a focused GameLogic shim and sentinel gameplay owners",
    "gamelogic-new-game-dispatch-smoke links original GlobalData.cpp/FunctionLexicon.cpp/INI.cpp/INIGameData.cpp/INIAiData.cpp/INIMultiplayer.cpp/UserPreferences.cpp/MultiplayerSettings.cpp/Science.cpp/PlayerTemplate.cpp/PlayerList.cpp/Player.cpp/AI.cpp/AIPathfind.cpp/AIPlayer.cpp/Weapon.cpp/GameLogic.cpp/GameLogicDispatch.cpp/GameState.cpp/Radar.cpp/PartitionManager.cpp/ScriptEngine.cpp/Scripts.cpp/Shell.cpp/GameWindowManagerScript.cpp/HeaderTemplate.cpp/SidesList.cpp plus the W3D terrain runtime, then calls GameLogic::processCommandList at runtime through original GlobalData, FunctionLexicon, PlayerList, ScriptEngine, Shell, archive-backed BlankWindow ownership, MapsZH.big MD_GLA03 promotion, original default and Zero Hour startup INI/GameData parsing, original W3DTerrainLogic::loadMap(false), WorldHeightMap object/waypoint/sides parsing, SidesList::validateSides, TeamFactory::initFromSides, PlayerList::newGame, AIPlayer construction, ScriptEngine::newMap, Radar::newMap, GameLogic width/height copying, and PartitionManager::init/refreshShroudForLocalPlayer",
  ],
  nextRequired: [
    "continue startNewGame after PartitionManager shroud refresh into GhostObjectManager reset, TerrainLogic::newMap, and map object spawning",
  ],
}, null, 2));
