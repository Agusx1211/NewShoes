#!/usr/bin/env node
// Verifies that the next Skirmish start frontier is pinned to the original
// GameLogic MSG_NEW_GAME dispatch path, and that the current shell smoke still
// stops before claiming original GameLogic runtime ownership.

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
  covered: [
    "MessageStream::propagateMessages transfers messages to TheCommandList",
    "GameLogic::processCommandList dispatches CommandList messages through logicMessageDispatcher",
    "MSG_NEW_GAME reads game mode, difficulty, rank points, and game speed arguments",
    "MSG_NEW_GAME applies the FPS limit, calls prepareNewGame, then calls startNewGame(FALSE)",
    "prepareNewGame owns difficulty, BlankWindow background, game-mode, pending-map, and shell-hide setup",
    "startNewGame(FALSE) records the pristine map and defers the first call before terrain load",
    "w3d-window-layout-script-smoke still uses a focused GameLogic shim and sentinel gameplay owners",
  ],
  nextRequired: [
    "link a runtime target against original GameLogic.cpp and GameLogicDispatch.cpp",
    "replace the shell-smoke GameState sentinel with a real GameState owner",
    "replace the no-player PlayerList boundary with real PlayerList/Player ownership",
    "own the BlankWindow/load-screen/background path before entering prepareNewGame at runtime",
    "then continue from the deferred startNewGame update into terrain, player, and script map-load ownership",
  ],
}, null, 2));
