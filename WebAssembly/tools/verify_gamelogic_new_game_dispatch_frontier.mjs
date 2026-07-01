#!/usr/bin/env node
// Verifies that the Skirmish start frontier is pinned to the original
// GameLogic MSG_NEW_GAME dispatch path, that the current shell smoke still
// stops before claiming original GameLogic ownership, and that the focused
// runtime smoke links original GameLogic.cpp/GameLogicDispatch.cpp.

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
  ],
  "GameLogic::startNewGame first-call deferral",
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
const runtimeLinkOptions = cmakeInvocationBlock(
  cmake,
  /target_link_options\s*\(\s*gamelogic-new-game-dispatch-smoke\b/,
  "gamelogic-new-game-dispatch-smoke target_link_options",
);
expect(
  runtimeLinkOptions.block.includes("--wrap=_ZN10PlayerList12getNthPlayerEi"),
  "gamelogic-new-game-dispatch-smoke does not declare the focused PlayerList lookup wrap",
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
const runtimePlayerWrapLine = lineOf(
  runtimeSmoke,
  /__wrap__ZN10PlayerList12getNthPlayerEi/,
  "runtime smoke focused PlayerList::getNthPlayer wrapper",
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
  /shell->isShellActive\s*\(\s*\)\s*==\s*FALSE\s*&&\s*g_layout_shutdowns\s*==\s*1/,
  "runtime smoke original Shell::hideShell state proof",
);
const runtimeOriginalOwnersLine = lineOf(
  runtimeSmoke,
  /originalOwners/,
  "runtime smoke originalOwners JSON",
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
    cmakeLinkOptionsLine: runtimeLinkOptions.line,
    originalGameLogicCppLinked: true,
    originalGameLogicDispatchCppLinked: true,
    originalGameStateCppLinked: true,
    originalScriptEngineCppLinked: true,
    originalScriptsCppLinked: true,
    originalDisplayCppLinked: true,
    originalShellCppLinked: true,
    processCommandListLine: runtimeProcessCommandListLine,
    runtimePathLine,
    focusedPlayerLookupWrapLine: runtimePlayerWrapLine,
    gameLogicAllocationLine: runtimeGameLogicLine,
    scriptEngineAllocationLine: runtimeScriptEngineLine,
    scriptEngineConstructorDifficultyLine: runtimeScriptNormalLine,
    scriptEnginePrepareDifficultyLine: runtimeScriptHardLine,
    shellAllocationLine: runtimeShellLine,
    shellPushLine: runtimeShellPushLine,
    shellHideStateProofLine: runtimeShellHideProofLine,
    originalOwnersLine: runtimeOriginalOwnersLine,
  },
  covered: [
    "MessageStream::propagateMessages transfers messages to TheCommandList",
    "GameLogic::processCommandList dispatches CommandList messages through logicMessageDispatcher",
    "MSG_NEW_GAME reads game mode, difficulty, rank points, and game speed arguments",
    "MSG_NEW_GAME applies the FPS limit, calls prepareNewGame, then calls startNewGame(FALSE)",
    "prepareNewGame owns original ScriptEngine difficulty, BlankWindow background, game-mode, pending-map, and original Shell::hideShell setup",
    "startNewGame(FALSE) records the pristine map and defers the first call before terrain load",
    "w3d-window-layout-script-smoke still uses a focused GameLogic shim and sentinel gameplay owners",
    "gamelogic-new-game-dispatch-smoke links original GameLogic.cpp/GameLogicDispatch.cpp/GameState.cpp/ScriptEngine.cpp/Scripts.cpp/Shell.cpp and calls GameLogic::processCommandList at runtime through original ScriptEngine and Shell ownership",
  ],
  nextRequired: [
    "replace the runtime PlayerList::getNthPlayer linker wrap with real PlayerList/Player ownership",
    "replace the runtime shim GlobalData bridge with original GlobalData ownership",
    "replace the runtime BlankWindow in-memory adapter with the archive-backed layout path",
    "then continue from the deferred startNewGame update into terrain, player, and script map-load ownership",
  ],
}, null, 2));
