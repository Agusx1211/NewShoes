#!/usr/bin/env node
// verify_bink_runtime_callsite_frontier.mjs
//
// Source-only verifier (it reads files, never executes the engine or wasm)
// for the original Bink runtime *callsite* frontier: the integration points
// in the original GameEngine/GameEngineDevice C++ source that own Bink video
// playback at runtime, and that any future browser-side presentation bridge
// must preserve when wiring the WebM sidecar provider into the original
// `BinkVideoPlayer` flows.
//
// This is intentionally narrower than `verify_bink_video_device_frontier.mjs`,
// which pins the Bink device header/shim/provider/CMake surface itself. This
// verifier instead pins the *callers* of that surface in the original engine:
//
//   1. W3DGameClient::createVideoPlayer() constructs `NEW BinkVideoPlayer`.
//   2. GameClient::init() assigns `TheVideoPlayer = createVideoPlayer()`, then
//      calls `TheVideoPlayer->init()` and `setName("TheVideoPlayer")`.
//   3. BinkVideoPlayer::open/createStream/load create/own a BinkVideoStream,
//      set `stream->m_handle`, and call `BinkSetVolume`.
//   4. Representative original frame loops call isFrameReady, frameDecompress,
//      frameRender, frameNext in order inside Display::update, InGameUI::update,
//      WindowVideoManager::update, the SinglePlayerLoadScreen and
//      ChallengeLoadScreen init load-video loops, and the ScoreScreen
//      `PlayMovieAndBlock` cutscene loop.
//   5. The LoadScreen min-spec skip path `frameGoto(frameCount())`.
//   6. The abstract VideoBuffer lock/unlock/format/pitch contract and the
//      W3DVideoBuffer lock/unlock/texture-surface facts.
//   7. The existing CMake compile frontier target for the original Bink player.
//
// Where the original-source integration point is a single stable line, the
// verifier pins the exact line (matching the existing frontier verifier style).
// For the broader multi-line frame-loop callsites it uses robust function-body
// range searches rather than brittle full-file line equality, so incidental
// edits elsewhere in those files do not break the frontier.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  gameClient: "GeneralsMD/Code/GameEngine/Source/GameClient/GameClient.cpp",
  w3dGameClientH:
    "GeneralsMD/Code/GameEngineDevice/Include/W3DDevice/GameClient/W3DGameClient.h",
  binkPlayer:
    "GeneralsMD/Code/GameEngineDevice/Source/VideoDevice/Bink/BinkVideoPlayer.cpp",
  display: "GeneralsMD/Code/GameEngine/Source/GameClient/Display.cpp",
  inGameUI: "GeneralsMD/Code/GameEngine/Source/GameClient/InGameUI.cpp",
  windowVideoManager:
    "GeneralsMD/Code/GameEngine/Source/GameClient/GUI/WindowVideoManager.cpp",
  loadScreen: "GeneralsMD/Code/GameEngine/Source/GameClient/GUI/LoadScreen.cpp",
  scoreScreen:
    "GeneralsMD/Code/GameEngine/Source/GameClient/GUI/GUICallbacks/Menus/ScoreScreen.cpp",
  videoPlayerH: "GeneralsMD/Code/GameEngine/Include/GameClient/VideoPlayer.h",
  w3dVideoBufferH:
    "GeneralsMD/Code/GameEngineDevice/Include/W3DDevice/GameClient/W3DVideobuffer.h",
  w3dVideoBuffer:
    "GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DVideoBuffer.cpp",
  cmake: "WebAssembly/CMakeLists.txt",
};

function readSourceLines(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  const text = readFileSync(abs, "utf8");
  return { abs, text, lines: text.split(/\r?\n/) };
}

function lineNumber(lines, predicate) {
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i + 1;
  }
  return -1;
}

// Given a 1-based definition line, return the 1-based inclusive body line
// range { start, end } by brace matching. Returns null if not found.
function functionBodyLineRange(lines, definitionLine) {
  if (definitionLine <= 0) {
    return null;
  }
  let bodyStart = -1;
  let depth = 0;
  for (let i = definitionLine - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        if (bodyStart === -1) {
          bodyStart = i + 1;
        }
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (bodyStart !== -1 && depth === 0) {
          return { start: bodyStart, end: i + 1 };
        }
      }
    }
  }
  return null;
}

function firstMatchInRange(lines, startLine, endLine, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  for (let i = Math.max(startLine - 1, 0); i < endLine && i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return -1;
}

function findFunctionDef(lines, defRe) {
  return lineNumber(lines, (line) => defRe.test(line));
}

// Assert that the given list of patterns all match, in order, somewhere within
// [startLine, endLine). Returns the array of matched line numbers (or -1).
function orderedMatchesInRange(lines, startLine, endLine, patterns) {
  const result = [];
  let cursor = Math.max(startLine - 1, 0);
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(p);
    let found = -1;
    for (let i = cursor; i < endLine && i < lines.length; i++) {
      if (re.test(lines[i])) {
        found = i + 1;
        cursor = i + 1;
        break;
      }
    }
    result.push(found);
  }
  return result;
}

function assertExact(errors, facts, key, actual, expected, label) {
  facts[key] = actual;
  if (actual !== expected) {
    errors.push(`${label}: expected line ${expected} but found ${actual}`);
  }
}

function assertPresent(errors, facts, key, actual, label) {
  facts[key] = actual;
  if (actual === -1) {
    errors.push(`${label}: not found`);
  }
}

function main() {
  const errors = [];
  const facts = {
    createVideoPlayer: {},
    gameClientInit: {},
    binkPlayer: {},
    frameLoops: {},
    loadScreenSkip: {},
    videoBuffer: {},
    w3dVideoBuffer: {},
    cmake: {},
  };

  const gameClient = readSourceLines(SOURCES.gameClient);
  const w3dGameClientH = readSourceLines(SOURCES.w3dGameClientH);
  const binkPlayer = readSourceLines(SOURCES.binkPlayer);
  const display = readSourceLines(SOURCES.display);
  const inGameUI = readSourceLines(SOURCES.inGameUI);
  const windowVideoManager = readSourceLines(SOURCES.windowVideoManager);
  const loadScreen = readSourceLines(SOURCES.loadScreen);
  const scoreScreen = readSourceLines(SOURCES.scoreScreen);
  const videoPlayerH = readSourceLines(SOURCES.videoPlayerH);
  const w3dVideoBufferH = readSourceLines(SOURCES.w3dVideoBufferH);
  const w3dVideoBuffer = readSourceLines(SOURCES.w3dVideoBuffer);
  const cmake = readSourceLines(SOURCES.cmake);

  // ------------------------------------------------------------------
  // 1. W3DGameClient::createVideoPlayer() — NEW BinkVideoPlayer factory.
  // ------------------------------------------------------------------
  const createVideoPlayerDef = lineNumber(
    w3dGameClientH.lines,
    (line) => /createVideoPlayer\s*\(\s*void\s*\)/.test(line) &&
      /return\s+NEW\s+BinkVideoPlayer/.test(line),
  );
  assertExact(errors, facts.createVideoPlayer, "factoryDefLine",
    createVideoPlayerDef, 115,
    "W3DGameClient.h createVideoPlayer NEW BinkVideoPlayer");
  assertPresent(errors, facts.createVideoPlayer, "binkIncludeLine",
    lineNumber(w3dGameClientH.lines,
      (line) => /#include\s+"VideoDevice\/Bink\/BinkVideoPlayer\.h"/.test(line)),
    'W3DGameClient.h #include "VideoDevice/Bink/BinkVideoPlayer.h"');

  // ------------------------------------------------------------------
  // 2. GameClient::init() — TheVideoPlayer = createVideoPlayer(); init();
  //    setName("TheVideoPlayer").
  // ------------------------------------------------------------------
  const gameClientInitDef = findFunctionDef(gameClient.lines,
    /void\s+GameClient\s*::\s*init\s*\(\s*void\s*\)/);
  assertExact(errors, facts.gameClientInit, "initDefLine",
    gameClientInitDef, 249, "GameClient::init");
  const initRange = functionBodyLineRange(gameClient.lines, gameClientInitDef);
  if (!initRange) {
    errors.push("GameClient::init: function body not found");
  } else {
    const assign = firstMatchInRange(gameClient.lines, initRange.start, initRange.end,
      /TheVideoPlayer\s*=\s*createVideoPlayer\s*\(\s*\)/);
    const initCall = firstMatchInRange(gameClient.lines, initRange.start, initRange.end,
      /TheVideoPlayer\s*->\s*init\s*\(\s*\)/);
    const setName = firstMatchInRange(gameClient.lines, initRange.start, initRange.end,
      /TheVideoPlayer\s*->\s*setName\s*\(\s*"TheVideoPlayer"\s*\)/);
    assertExact(errors, facts.gameClientInit, "assignLine", assign, 411,
      "GameClient::init TheVideoPlayer assignment");
    assertExact(errors, facts.gameClientInit, "initCallLine", initCall, 414,
      "GameClient::init TheVideoPlayer->init()");
    assertExact(errors, facts.gameClientInit, "setNameLine", setName, 415,
      'GameClient::init TheVideoPlayer->setName("TheVideoPlayer")');
    if (assign !== -1 && initCall !== -1 && !(assign < initCall)) {
      errors.push("GameClient::init: assignment must come before init()");
    }
    if (initCall !== -1 && setName !== -1 && !(initCall < setName)) {
      errors.push("GameClient::init: init() must come before setName()");
    }
  }

  // ------------------------------------------------------------------
  // 3. BinkVideoPlayer::open / createStream / load.
  //    createStream sets m_handle and calls BinkSetVolume.
  //    open calls BinkOpen and createStream.
  //    load delegates to open.
  // ------------------------------------------------------------------
  const createStreamDef = findFunctionDef(binkPlayer.lines,
    /VideoStreamInterface\s*\*\s*BinkVideoPlayer\s*::\s*createStream\s*\(\s*HBINK\s+handle\s*\)/);
  assertExact(errors, facts.binkPlayer, "createStreamDefLine", createStreamDef, 187,
    "BinkVideoPlayer::createStream");
  if (createStreamDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, createStreamDef);
    if (!range) {
      errors.push("BinkVideoPlayer::createStream: body not found");
    } else {
      const handleSet = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /stream\s*->\s*m_handle\s*=/);
      const setVolume = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /\bBinkSetVolume\s*\(/);
      assertExact(errors, facts.binkPlayer, "createStreamHandleSetLine", handleSet, 200,
        "BinkVideoPlayer::createStream m_handle assignment");
      assertExact(errors, facts.binkPlayer, "createStreamBinkSetVolumeLine", setVolume, 210,
        "BinkVideoPlayer::createStream BinkSetVolume");
      if (handleSet !== -1 && setVolume !== -1 && !(handleSet < setVolume)) {
        errors.push("BinkVideoPlayer::createStream: m_handle assignment must precede BinkSetVolume");
      }
    }
  }

  const openDef = findFunctionDef(binkPlayer.lines,
    /VideoStreamInterface\s*\*\s*BinkVideoPlayer\s*::\s*open\s*\(\s*AsciiString\s+movieTitle\s*\)/);
  assertExact(errors, facts.binkPlayer, "openDefLine", openDef, 221,
    "BinkVideoPlayer::open");
  if (openDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, openDef);
    if (!range) {
      errors.push("BinkVideoPlayer::open: body not found");
    } else {
      const binkOpen = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /\bBinkOpen\s*\(/);
      const createStreamCall = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /\bcreateStream\s*\(\s*handle\s*\)/);
      assertPresent(errors, facts.binkPlayer, "openBinkOpenLine", binkOpen,
        "BinkVideoPlayer::open BinkOpen call");
      assertPresent(errors, facts.binkPlayer, "openCreateStreamLine", createStreamCall,
        "BinkVideoPlayer::open createStream call");
      if (binkOpen !== -1 && createStreamCall !== -1 && !(binkOpen < createStreamCall)) {
        errors.push("BinkVideoPlayer::open: BinkOpen must come before createStream");
      }
    }
  }

  const loadDef = findFunctionDef(binkPlayer.lines,
    /VideoStreamInterface\s*\*\s*BinkVideoPlayer\s*::\s*load\s*\(\s*AsciiString\s+movieTitle\s*\)/);
  assertExact(errors, facts.binkPlayer, "loadDefLine", loadDef, 264,
    "BinkVideoPlayer::load");
  if (loadDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, loadDef);
    if (!range) {
      errors.push("BinkVideoPlayer::load: body not found");
    } else {
      const delegates = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /return\s+open\s*\(\s*movieTitle\s*\)/);
      assertPresent(errors, facts.binkPlayer, "loadDelegatesToOpenLine", delegates,
        "BinkVideoPlayer::load delegates to open(movieTitle)");
    }
  }

  // ------------------------------------------------------------------
  // 4. Representative original frame loops: in each function body the
  //    isFrameReady / frameDecompress / frameRender / frameNext calls must
  //    appear in that order. Verified by body/range ordered search, not by
  //    brittle full-file line equality.
  // ------------------------------------------------------------------
  const loopSpecs = [
    {
      key: "displayUpdate",
      src: display,
      defRe: /void\s+Display\s*::\s*update\s*\(\s*void\s*\)/,
      patterns: [
        /isFrameReady\s*\(\s*\)/,
        /frameDecompress\s*\(\s*\)/,
        /frameRender\s*\(\s*\s*m_videoBuffer\s*\)/,
        /frameNext\s*\(\s*\)/,
      ],
      labels: ["isFrameReady", "frameDecompress", "frameRender(m_videoBuffer)", "frameNext"],
    },
    {
      key: "inGameUIUpdate",
      src: inGameUI,
      defRe: /void\s+InGameUI\s*::\s*update\s*\(\s*void\s*\)/,
      patterns: [
        /m_videoStream\s*->\s*isFrameReady\s*\(\s*\)/,
        /m_videoStream\s*->\s*frameDecompress\s*\(\s*\)/,
        /m_videoStream\s*->\s*frameRender\s*\(\s*m_videoBuffer\s*\)/,
        /m_videoStream\s*->\s*frameNext\s*\(\s*\)/,
      ],
      labels: ["isFrameReady", "frameDecompress", "frameRender(m_videoBuffer)", "frameNext"],
    },
    {
      key: "windowVideoManagerUpdate",
      src: windowVideoManager,
      defRe: /void\s+WindowVideoManager\s*::\s*update\s*\(\s*void\s*\)/,
      patterns: [
        /videoStream\s*->\s*isFrameReady\s*\(\s*\)/,
        /videoStream\s*->\s*frameDecompress\s*\(\s*\)/,
        /videoStream\s*->\s*frameRender\s*\(\s*videoBuffer\s*\)/,
        /videoStream\s*->\s*frameNext\s*\(\s*\)/,
      ],
      labels: ["isFrameReady", "frameDecompress", "frameRender(videoBuffer)", "frameNext"],
    },
    {
      key: "singlePlayerLoadScreenInit",
      src: loadScreen,
      defRe: /void\s+SinglePlayerLoadScreen\s*::\s*init\s*\(\s*GameInfo\s*\*\s*game\s*\)/,
      patterns: [
        /isFrameReady\s*\(\s*\)/,
        /frameDecompress\s*\(\s*\)/,
        /frameRender\s*\(\s*m_videoBuffer\s*\)/,
        /frameNext\s*\(\s*\)/,
      ],
      labels: ["isFrameReady", "frameDecompress", "frameRender(m_videoBuffer)", "frameNext"],
    },
    {
      key: "challengeLoadScreenInit",
      src: loadScreen,
      defRe: /void\s+ChallengeLoadScreen\s*::\s*init\s*\(\s*GameInfo\s*\*\s*game\s*\)/,
      patterns: [
        /isFrameReady\s*\(\s*\)/,
        /frameDecompress\s*\(\s*\)/,
        /frameRender\s*\(\s*m_videoBuffer\s*\)/,
        /frameNext\s*\(\s*\)/,
      ],
      labels: ["isFrameReady", "frameDecompress", "frameRender(m_videoBuffer)", "frameNext"],
    },
    {
      key: "scoreScreenPlayMovieAndBlock",
      src: scoreScreen,
      defRe: /void\s+PlayMovieAndBlock\s*\(\s*AsciiString\s+movieTitle\s*\)/,
      patterns: [
        /isFrameReady\s*\(\s*\)/,
        /frameDecompress\s*\(\s*\)/,
        /frameRender\s*\(\s*videoBuffer\s*\)/,
        /frameNext\s*\(\s*\)/,
      ],
      labels: ["isFrameReady", "frameDecompress", "frameRender(videoBuffer)", "frameNext"],
    },
  ];

  for (const spec of loopSpecs) {
    const def = findFunctionDef(spec.src.lines, spec.defRe);
    facts.frameLoops[spec.key] = { defLine: def, calls: {} };
    if (def === -1) {
      errors.push(`${spec.key}: function definition not found`);
      continue;
    }
    const range = functionBodyLineRange(spec.src.lines, def);
    if (!range) {
      errors.push(`${spec.key}: function body not found`);
      continue;
    }
    const matched = orderedMatchesInRange(spec.src.lines, range.start, range.end, spec.patterns);
    let prev = -1;
    for (let i = 0; i < matched.length; i++) {
      facts.frameLoops[spec.key].calls[spec.labels[i]] = matched[i];
      if (matched[i] === -1) {
        errors.push(`${spec.key}: ${spec.labels[i]} call not found in body`);
      } else if (prev !== -1 && !(prev < matched[i])) {
        errors.push(`${spec.key}: ${spec.labels[i]} must come after previous loop step`);
      }
      if (matched[i] !== -1) prev = matched[i];
    }
  }

  // ------------------------------------------------------------------
  // 5. LoadScreen min-spec skip path: frameGoto(frameCount()).
  //    Lives in ChallengeLoadScreen::init; verify the frameGoto(frameCount())
  //    followed by an isFrameReady wait, frameDecompress, frameRender.
  // ------------------------------------------------------------------
  const challengeInitDef = findFunctionDef(loadScreen.lines,
    /void\s+ChallengeLoadScreen\s*::\s*init\s*\(\s*GameInfo\s*\*\s*game\s*\)/);
  if (challengeInitDef === -1) {
    errors.push("ChallengeLoadScreen::init: definition not found for skip-path check");
  } else {
    const range = functionBodyLineRange(loadScreen.lines, challengeInitDef);
    if (!range) {
      errors.push("ChallengeLoadScreen::init: body not found for skip-path check");
    } else {
      const frameGoto = firstMatchInRange(loadScreen.lines, range.start, range.end,
        /frameGoto\s*\(\s*m_videoStream\s*->\s*frameCount\s*\(\s*\)\s*\)/);
      // The skip path's own ready-wait/decompress/render steps appear *after*
      // the frameGoto call, so search forward from frameGoto rather than from
      // the function start (the body also contains an earlier normal loop).
      const skipSearchStart = frameGoto === -1 ? range.end : frameGoto + 1;
      const readyWait = firstMatchInRange(loadScreen.lines, skipSearchStart, range.end,
        /isFrameReady\s*\(\s*\)/);
      const decompress = firstMatchInRange(loadScreen.lines, skipSearchStart, range.end,
        /frameDecompress\s*\(\s*\)/);
      const render = firstMatchInRange(loadScreen.lines, skipSearchStart, range.end,
        /frameRender\s*\(\s*m_videoBuffer\s*\)/);
      facts.loadScreenSkip = {
        frameGotoLine: frameGoto,
        readyWaitLine: readyWait,
        decompressLine: decompress,
        renderLine: render,
      };
      if (frameGoto === -1) {
        errors.push("ChallengeLoadScreen::init: frameGoto(frameCount()) skip path not found");
      } else {
        if (readyWait === -1) {
          errors.push("ChallengeLoadScreen::init: skip-path isFrameReady wait not found after frameGoto");
        }
        if (decompress === -1) {
          errors.push("ChallengeLoadScreen::init: skip-path frameDecompress not found after frameGoto");
        }
        if (render === -1) {
          errors.push("ChallengeLoadScreen::init: skip-path frameRender not found after frameGoto");
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 6. VideoBuffer abstract contract (lock/unlock/format/pitch) and
  //    W3DVideoBuffer lock/unlock texture-surface facts.
  // ------------------------------------------------------------------
  assertExact(errors, facts.videoBuffer, "classLine",
    lineNumber(videoPlayerH.lines, (line) => /\bclass\s+VideoBuffer\b/.test(line)), 91,
    "VideoPlayer.h class VideoBuffer");
  assertExact(errors, facts.videoBuffer, "lockDeclLine",
    lineNumber(videoPlayerH.lines, (line) => /virtual\s+void\s*\*\s*lock\s*\(\s*void\s*\)\s*=\s*0/.test(line)), 126,
    "VideoBuffer abstract lock()");
  assertExact(errors, facts.videoBuffer, "unlockDeclLine",
    lineNumber(videoPlayerH.lines, (line) => /virtual\s+void\s+unlock\s*\(\s*void\s*\)\s*=\s*0/.test(line)), 127,
    "VideoBuffer abstract unlock()");
  assertExact(errors, facts.videoBuffer, "pitchDeclLine",
    lineNumber(videoPlayerH.lines, (line) => /UnsignedInt\s+pitch\s*\(\s*void\s*\)\s*\{\s*return\s+m_pitch/.test(line)), 137,
    "VideoBuffer pitch()");
  assertExact(errors, facts.videoBuffer, "formatDeclLine",
    lineNumber(videoPlayerH.lines, (line) => /Type\s+format\s*\(\s*void\s*\)\s*\{\s*return\s+m_format/.test(line)), 138,
    "VideoBuffer format()");

  // W3DVideoBuffer surface-backed lock/unlock.
  const w3dLockDef = findFunctionDef(w3dVideoBuffer.lines,
    /void\s*\*\s*W3DVideoBuffer\s*::\s*lock\s*\(\s*void\s*\)/);
  assertExact(errors, facts.w3dVideoBuffer, "lockDefLine", w3dLockDef, 167,
    "W3DVideoBuffer::lock");
  if (w3dLockDef > 0) {
    const range = functionBodyLineRange(w3dVideoBuffer.lines, w3dLockDef);
    if (!range) {
      errors.push("W3DVideoBuffer::lock: body not found");
    } else {
      const surfaceLevel = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_texture\s*->\s*Get_Surface_Level\s*\(\s*\)/);
      const surfaceLock = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_surface\s*->\s*Lock\s*\(/);
      facts.w3dVideoBuffer.lockSurfaceLevelLine = surfaceLevel;
      facts.w3dVideoBuffer.lockSurfaceLockLine = surfaceLock;
      if (surfaceLevel === -1) {
        errors.push("W3DVideoBuffer::lock: m_texture->Get_Surface_Level() not found");
      }
      if (surfaceLock === -1) {
        errors.push("W3DVideoBuffer::lock: m_surface->Lock() not found");
      }
    }
  }
  const w3dUnlockDef = findFunctionDef(w3dVideoBuffer.lines,
    /void\s+W3DVideoBuffer\s*::\s*unlock\s*\(\s*void\s*\)/);
  assertExact(errors, facts.w3dVideoBuffer, "unlockDefLine", w3dUnlockDef, 190,
    "W3DVideoBuffer::unlock");
  if (w3dUnlockDef > 0) {
    const range = functionBodyLineRange(w3dVideoBuffer.lines, w3dUnlockDef);
    if (!range) {
      errors.push("W3DVideoBuffer::unlock: body not found");
    } else {
      const surfaceUnlock = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_surface\s*->\s*Unlock\s*\(\s*\)/);
      const releaseRef = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_surface\s*->\s*Release_Ref\s*\(\s*\)/);
      facts.w3dVideoBuffer.unlockSurfaceUnlockLine = surfaceUnlock;
      facts.w3dVideoBuffer.unlockReleaseRefLine = releaseRef;
      if (surfaceUnlock === -1) {
        errors.push("W3DVideoBuffer::unlock: m_surface->Unlock() not found");
      }
      if (releaseRef === -1) {
        errors.push("W3DVideoBuffer::unlock: m_surface->Release_Ref() not found");
      }
    }
  }
  // W3DVideoBuffer owns a TextureClass + SurfaceClass pair.
  assertPresent(errors, facts.w3dVideoBuffer, "textureMemberLine",
    lineNumber(w3dVideoBufferH.lines, (line) => /TextureClass\s*\*\s*m_texture\s*;/.test(line)),
    "W3DVideoBuffer.h TextureClass m_texture member");
  assertPresent(errors, facts.w3dVideoBuffer, "surfaceMemberLine",
    lineNumber(w3dVideoBufferH.lines, (line) => /SurfaceClass\s*\*\s*m_surface\s*;/.test(line)),
    "W3DVideoBuffer.h SurfaceClass m_surface member");

  // ------------------------------------------------------------------
  // 7. Existing CMake compile frontier target for the original Bink player
  //    (the original-source side that this callsite frontier integrates with).
  // ------------------------------------------------------------------
  assertExact(errors, facts.cmake, "frontierTargetLine",
    lineNumber(cmake.lines,
      (line) => /add_library\s*\(\s*zh_bink_video_device_compile_frontier\b/.test(line)), 2469,
    "CMake zh_bink_video_device_compile_frontier target");
  assertExact(errors, facts.cmake, "frontierSourceLine",
    lineNumber(cmake.lines, (line) => /BinkVideoPlayer\.cpp/.test(line)), 2470,
    "CMake BinkVideoPlayer.cpp source");
  assertPresent(errors, facts.cmake, "frontierLinkLine",
    lineNumber(cmake.lines,
      (line) => /target_link_libraries\s*\(\s*zh_bink_video_device_compile_frontier\s+PUBLIC/.test(line)),
    "CMake Bink frontier target_link_libraries");

  // ------------------------------------------------------------------
  const report = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
    note:
      "Source-only verifier. Pins the original Bink runtime *callsite* " +
      "frontier (factory, GameClient::init ownership, BinkVideoPlayer " +
      "open/createStream/load, representative frame loops, LoadScreen skip " +
      "path, VideoBuffer/W3DVideoBuffer contract, and the CMake compile " +
      "frontier). It does NOT mark runtime playback, frame upload, or " +
      "BinkCopyToBuffer pixel copy complete; those remain open M8 tasks.",
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
