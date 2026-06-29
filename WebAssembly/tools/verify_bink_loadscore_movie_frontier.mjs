#!/usr/bin/env node
// verify_bink_loadscore_movie_frontier.mjs
//
// Source-only verifier for the original LoadScreen and ScoreScreen Bink movie
// ownership frontier. It reads repo files and never executes the engine or wasm.
//
// This complements the focused browser Bink/W3D presentation smoke, which
// already proves decoded sidecar frames can reach a real W3DVideoBuffer and
// W3DDisplay::drawVideoBuffer. Pulling the full original load-screen and
// score-screen flows into that runtime path still depends on CampaignManager,
// GameInfo, GameWindow layout, LOD, shell, and broader GUI/game singleton
// ownership, so this pins the original source contract until those dependencies
// can be linked and harness-driven.
//
// Pinned contract:
//   1. LoadScreen.h stores VideoBuffer / VideoStreamInterface ownership fields
//      for SinglePlayerLoadScreen and ChallengeLoadScreen.
//   2. SinglePlayerLoadScreen::init opens the mission movie through
//      TheVideoPlayer, allocates a Display video buffer, loops through
//      isFrameReady -> frameDecompress -> frameRender(buffer) -> frameNext,
//      attaches the buffer to the load-screen GameWindow, draws, then closes.
//   3. ChallengeLoadScreen::init owns the same background movie loop, plus a
//      WindowVideoManager that plays portrait and VS overlay movies.
//   4. ScoreScreen final-victory movies route through PlayMovieAndBlock,
//      creating Menus/BlankWindow.wnd, attaching a VideoBuffer to its first
//      window, drawing each decompressed frame, and cleaning up the layout.
//   5. WindowLayout / GameWindowManager still expose the layout/window hooks
//      those ScoreScreen ownership paths depend on.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  loadScreenH: "GeneralsMD/Code/GameEngine/Include/GameClient/LoadScreen.h",
  loadScreen: "GeneralsMD/Code/GameEngine/Source/GameClient/GUI/LoadScreen.cpp",
  scoreScreen:
    "GeneralsMD/Code/GameEngine/Source/GameClient/GUI/GUICallbacks/Menus/ScoreScreen.cpp",
  gameWindowManagerH:
    "GeneralsMD/Code/GameEngine/Include/GameClient/GameWindowManager.h",
  windowLayoutH: "GeneralsMD/Code/GameEngine/Include/GameClient/WindowLayout.h",
  windowLayout:
    "GeneralsMD/Code/GameEngine/Source/GameClient/GUI/WindowLayout.cpp",
  packageJson: "WebAssembly/package.json",
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

function findFunctionDef(lines, defRe) {
  return lineNumber(lines, (line) => defRe.test(line) && !line.trimEnd().endsWith(";"));
}

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

function assertOrdered(errors, label, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === -1) {
      errors.push(`${label}: ordered pattern ${i + 1} not found`);
    }
    if (i > 0 && lines[i - 1] !== -1 && lines[i] !== -1 && !(lines[i - 1] < lines[i])) {
      errors.push(`${label}: pattern ${i} at line ${lines[i - 1]} must precede pattern ${i + 1} at line ${lines[i]}`);
    }
  }
}

function assertFunctionRange(errors, facts, key, source, defRe, expectedLine, label) {
  const defLine = findFunctionDef(source.lines, defRe);
  assertExact(errors, facts, `${key}DefLine`, defLine, expectedLine, label);
  const range = functionBodyLineRange(source.lines, defLine);
  facts[`${key}Range`] = range;
  if (defLine > 0 && !range) {
    errors.push(`${label}: function body not found`);
  }
  return range;
}

function main() {
  const errors = [];
  const facts = {
    header: {},
    loadScreenBase: {},
    singlePlayer: {},
    challenge: {},
    scoreScreen: {},
    windowLayout: {},
    packageJson: {},
  };

  const loadScreenH = readSourceLines(SOURCES.loadScreenH);
  const loadScreen = readSourceLines(SOURCES.loadScreen);
  const scoreScreen = readSourceLines(SOURCES.scoreScreen);
  const gameWindowManagerH = readSourceLines(SOURCES.gameWindowManagerH);
  const windowLayoutH = readSourceLines(SOURCES.windowLayoutH);
  const windowLayout = readSourceLines(SOURCES.windowLayout);
  const packageJson = readSourceLines(SOURCES.packageJson);

  // ------------------------------------------------------------------
  // 1. LoadScreen.h movie ownership fields and init/update declarations.
  // ------------------------------------------------------------------
  assertExact(errors, facts.header, "loadScreenClassLine",
    lineNumber(loadScreenH.lines, (line) => /class\s+LoadScreen\b/.test(line)),
    57, "LoadScreen.h LoadScreen class");
  assertExact(errors, facts.header, "singlePlayerClassLine",
    lineNumber(loadScreenH.lines, (line) => /class\s+SinglePlayerLoadScreen\s*:\s*public\s+LoadScreen/.test(line)),
    80, "LoadScreen.h SinglePlayerLoadScreen class");
  assertExact(errors, facts.header, "singlePlayerInitDeclLine",
    lineNumber(loadScreenH.lines, (line, i) => i + 1 > 80 && i + 1 < 130 && /virtual\s+void\s+init\s*\(\s*GameInfo\s*\*\s*game\s*\)/.test(line)),
    86, "LoadScreen.h SinglePlayerLoadScreen::init declaration");
  assertExact(errors, facts.header, "singlePlayerUpdateIntDeclLine",
    lineNumber(loadScreenH.lines, (line, i) => i + 1 > 80 && i + 1 < 130 && /virtual\s+void\s+update\s*\(\s*Int\s+percent\s*\)/.test(line)),
    92, "LoadScreen.h SinglePlayerLoadScreen::update(Int) declaration");
  assertExact(errors, facts.header, "singlePlayerVideoBufferFieldLine",
    lineNumber(loadScreenH.lines, (line) => /VideoBuffer\s*\*\s*m_videoBuffer\s*;/.test(line)),
    116, "LoadScreen.h SinglePlayerLoadScreen m_videoBuffer field");
  assertExact(errors, facts.header, "singlePlayerVideoStreamFieldLine",
    lineNumber(loadScreenH.lines, (line) => /VideoStreamInterface\s*\*\s*m_videoStream\s*;/.test(line)),
    117, "LoadScreen.h SinglePlayerLoadScreen m_videoStream field");
  assertExact(errors, facts.header, "challengeClassLine",
    lineNumber(loadScreenH.lines, (line) => /class\s+ChallengeLoadScreen\s*:\s*public\s+LoadScreen/.test(line)),
    130, "LoadScreen.h ChallengeLoadScreen class");
  assertExact(errors, facts.header, "challengeInitDeclLine",
    lineNumber(loadScreenH.lines, (line, i) => i + 1 > 130 && /virtual\s+void\s+init\s*\(\s*GameInfo\s*\*\s*game\s*\)/.test(line)),
    136, "LoadScreen.h ChallengeLoadScreen::init declaration");
  assertExact(errors, facts.header, "challengeUpdateIntDeclLine",
    lineNumber(loadScreenH.lines, (line, i) => i + 1 > 130 && /virtual\s+void\s+update\s*\(\s*Int\s+percent\s*\)/.test(line)),
    142, "LoadScreen.h ChallengeLoadScreen::update(Int) declaration");
  assertExact(errors, facts.header, "challengeVideoBufferFieldLine",
    lineNumber(loadScreenH.lines, (line, i) => i + 1 > 130 && /VideoBuffer\s*\*\s*m_videoBuffer\s*;/.test(line)),
    153, "LoadScreen.h ChallengeLoadScreen m_videoBuffer field");
  assertExact(errors, facts.header, "challengeVideoStreamFieldLine",
    lineNumber(loadScreenH.lines, (line, i) => i + 1 > 130 && /VideoStreamInterface\s*\*\s*m_videoStream\s*;/.test(line)),
    154, "LoadScreen.h ChallengeLoadScreen m_videoStream field");
  assertExact(errors, facts.header, "challengeWindowVideoManagerFieldLine",
    lineNumber(loadScreenH.lines, (line) => /WindowVideoManager\s*\*\s*m_wndVideoManager\s*;/.test(line)),
    156, "LoadScreen.h ChallengeLoadScreen m_wndVideoManager field");
  assertExact(errors, facts.header, "challengePortraitMovieLeftFieldLine",
    lineNumber(loadScreenH.lines, (line) => /GameWindow\s*\*\s*m_portraitMovieLeft\s*;/.test(line)),
    182, "LoadScreen.h ChallengeLoadScreen m_portraitMovieLeft field");
  assertExact(errors, facts.header, "challengePortraitMovieRightFieldLine",
    lineNumber(loadScreenH.lines, (line) => /GameWindow\s*\*\s*m_portraitMovieRight\s*;/.test(line)),
    183, "LoadScreen.h ChallengeLoadScreen m_portraitMovieRight field");
  assertExact(errors, facts.header, "challengeOverlayVsFieldLine",
    lineNumber(loadScreenH.lines, (line) => /GameWindow\s*\*\s*m_overlayVs\s*;/.test(line)),
    191, "LoadScreen.h ChallengeLoadScreen m_overlayVs field");
  assertExact(errors, facts.header, "challengeActivatePiecesDeclLine",
    lineNumber(loadScreenH.lines, (line) => /void\s+activatePieces\s*\(\s*Int\s+frame/.test(line)),
    193, "LoadScreen.h ChallengeLoadScreen activatePieces declaration");
  assertExact(errors, facts.header, "challengeActivatePiecesMinSpecDeclLine",
    lineNumber(loadScreenH.lines, (line) => /void\s+activatePiecesMinSpec\s*\(/.test(line)),
    194, "LoadScreen.h ChallengeLoadScreen activatePiecesMinSpec declaration");

  // ------------------------------------------------------------------
  // 2. LoadScreen base ownership and per-frame update draw pump.
  // ------------------------------------------------------------------
  const loadCtorRange = assertFunctionRange(errors, facts.loadScreenBase, "loadCtor", loadScreen,
    /LoadScreen\s*::\s*LoadScreen\s*\(\s*void\s*\)/, 150, "LoadScreen::LoadScreen");
  if (loadCtorRange) {
    assertExact(errors, facts.loadScreenBase, "loadScreenNullInitLine",
      firstMatchInRange(loadScreen.lines, loadCtorRange.start, loadCtorRange.end,
        /m_loadScreen\s*=\s*NULL\s*;/),
      152, "LoadScreen constructor m_loadScreen init");
  }

  const loadDtorRange = assertFunctionRange(errors, facts.loadScreenBase, "loadDtor", loadScreen,
    /LoadScreen\s*::\s*~LoadScreen\s*\(\s*void\s*\)/, 155, "LoadScreen::~LoadScreen");
  if (loadDtorRange) {
    assertExact(errors, facts.loadScreenBase, "loadScreenDestroyLine",
      firstMatchInRange(loadScreen.lines, loadDtorRange.start, loadDtorRange.end,
        /TheWindowManager\s*->\s*winDestroy\s*\(\s*m_loadScreen\s*\)/),
      160, "LoadScreen destructor TheWindowManager->winDestroy");
  }

  const loadUpdateRange = assertFunctionRange(errors, facts.loadScreenBase, "loadUpdate", loadScreen,
    /void\s+LoadScreen\s*::\s*update\s*\(\s*Int\s+percent\s*\)/, 164, "LoadScreen::update(Int)");
  if (loadUpdateRange) {
    const updateLoop = orderedMatchesInRange(loadScreen.lines, loadUpdateRange.start, loadUpdateRange.end, [
      /TheGameEngine\s*->\s*serviceWindowsOS\s*\(\s*\)/,
      /TheWindowManager\s*->\s*update\s*\(\s*\)/,
      /TheDisplay\s*->\s*update\s*\(\s*\)/,
      /TheDisplay\s*->\s*draw\s*\(\s*\)/,
      /setFPMode\s*\(\s*\)/,
    ]);
    facts.loadScreenBase.updatePumpLines = updateLoop;
    assertOrdered(errors, "LoadScreen::update(Int) service/update/draw pump", updateLoop);
    assertExact(errors, facts.loadScreenBase, "serviceWindowsOSLine", updateLoop[0], 166,
      "LoadScreen::update TheGameEngine->serviceWindowsOS");
    assertExact(errors, facts.loadScreenBase, "windowManagerUpdateLine", updateLoop[1], 170,
      "LoadScreen::update TheWindowManager->update");
    assertExact(errors, facts.loadScreenBase, "displayUpdateLine", updateLoop[2], 171,
      "LoadScreen::update TheDisplay->update");
    assertExact(errors, facts.loadScreenBase, "displayDrawLine", updateLoop[3], 173,
      "LoadScreen::update TheDisplay->draw");
    assertExact(errors, facts.loadScreenBase, "setFPModeLine", updateLoop[4], 175,
      "LoadScreen::update setFPMode");
  }

  // ------------------------------------------------------------------
  // 3. SinglePlayerLoadScreen Bink background movie ownership.
  // ------------------------------------------------------------------
  const singleCtorRange = assertFunctionRange(errors, facts.singlePlayer, "ctor", loadScreen,
    /SinglePlayerLoadScreen\s*::\s*SinglePlayerLoadScreen\s*\(\s*void\s*\)/,
    181, "SinglePlayerLoadScreen::SinglePlayerLoadScreen");
  if (singleCtorRange) {
    assertExact(errors, facts.singlePlayer, "streamNullInitLine",
      firstMatchInRange(loadScreen.lines, singleCtorRange.start, singleCtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      192, "SinglePlayerLoadScreen constructor m_videoStream init");
    assertExact(errors, facts.singlePlayer, "bufferNullInitLine",
      firstMatchInRange(loadScreen.lines, singleCtorRange.start, singleCtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      193, "SinglePlayerLoadScreen constructor m_videoBuffer init");
  }

  const singleDtorRange = assertFunctionRange(errors, facts.singlePlayer, "dtor", loadScreen,
    /SinglePlayerLoadScreen\s*::\s*~SinglePlayerLoadScreen\s*\(\s*void\s*\)/,
    200, "SinglePlayerLoadScreen::~SinglePlayerLoadScreen");
  if (singleDtorRange) {
    assertExact(errors, facts.singlePlayer, "deleteBufferLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /delete\s+m_videoBuffer\s*;/),
      208, "SinglePlayerLoadScreen destructor delete m_videoBuffer");
    assertExact(errors, facts.singlePlayer, "clearBufferLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      209, "SinglePlayerLoadScreen destructor clear m_videoBuffer");
    assertExact(errors, facts.singlePlayer, "closeStreamLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /m_videoStream\s*->\s*close\s*\(\s*\)/),
      212, "SinglePlayerLoadScreen destructor close stream");
    assertExact(errors, facts.singlePlayer, "clearStreamLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      213, "SinglePlayerLoadScreen destructor clear stream");
    assertExact(errors, facts.singlePlayer, "removeAmbientLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /TheAudio\s*->\s*removeAudioEvent\s*\(\s*m_ambientLoopHandle\s*\)/),
      215, "SinglePlayerLoadScreen destructor remove ambient loop");
  }

  const singleInitRange = assertFunctionRange(errors, facts.singlePlayer, "init", loadScreen,
    /void\s+SinglePlayerLoadScreen\s*::\s*init\s*\(\s*GameInfo\s*\*\s*game\s*\)/,
    392, "SinglePlayerLoadScreen::init");
  if (singleInitRange) {
    assertExact(errors, facts.singlePlayer, "layoutCreateLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /winCreateFromScript\s*\(\s*AsciiString\s*\(\s*"Menus\/SinglePlayerLoadScreen\.wnd"\s*\)\s*\)/),
      397, "SinglePlayerLoadScreen::init layout create");
    assertExact(errors, facts.singlePlayer, "progressBarLookupLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /SinglePlayerLoadScreen\.wnd:ProgressLoad/),
      403, "SinglePlayerLoadScreen::init progress bar lookup");
    assertExact(errors, facts.singlePlayer, "missionLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /^\s*Mission\s*\*\s*mission\s*=\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)/),
      417, "SinglePlayerLoadScreen::init current mission");
    assertExact(errors, facts.singlePlayer, "ambientEventLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_ambientLoop\s*\.\s*setEventName\s*\(\s*"LoadScreenAmbient"\s*\)/),
      483, "SinglePlayerLoadScreen::init ambient event");
    assertExact(errors, facts.singlePlayer, "videoOpenLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)\s*->\s*m_movieLabel\s*\)/),
      485, "SinglePlayerLoadScreen::init TheVideoPlayer->open mission movie");
    assertExact(errors, facts.singlePlayer, "nullStreamCheckLine",
      firstMatchInRange(loadScreen.lines, 486, singleInitRange.end,
        /if\s*\(\s*m_videoStream\s*==\s*NULL\s*\)/),
      486, "SinglePlayerLoadScreen::init null stream guard");
    assertExact(errors, facts.singlePlayer, "nullStreamReturnLine",
      firstMatchInRange(loadScreen.lines, 486, 491, /^\s*return\s*;/),
      489, "SinglePlayerLoadScreen::init null stream return");
    assertExact(errors, facts.singlePlayer, "createBufferLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/),
      493, "SinglePlayerLoadScreen::init create video buffer");
    assertExact(errors, facts.singlePlayer, "allocateWidthLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoBuffer\s*->\s*allocate\s*\(\s*m_videoStream\s*->\s*width\s*\(\s*\)/),
      495, "SinglePlayerLoadScreen::init allocate width");
    assertExact(errors, facts.singlePlayer, "allocateHeightLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoStream\s*->\s*height\s*\(\s*\)/),
      496, "SinglePlayerLoadScreen::init allocate height");
    assertExact(errors, facts.singlePlayer, "allocateFailureDeleteBufferLine",
      firstMatchInRange(loadScreen.lines, 498, 507, /delete\s+m_videoBuffer\s*;/),
      499, "SinglePlayerLoadScreen::init allocation failure delete buffer");
    assertExact(errors, facts.singlePlayer, "allocateFailureCloseStreamLine",
      firstMatchInRange(loadScreen.lines, 498, 507, /m_videoStream\s*->\s*close\s*\(\s*\)/),
      503, "SinglePlayerLoadScreen::init allocation failure close stream");
    assertExact(errors, facts.singlePlayer, "allocateFailureReturnLine",
      firstMatchInRange(loadScreen.lines, 498, 507, /^\s*return\s*;/),
      506, "SinglePlayerLoadScreen::init allocation failure return");

    const singleLoop = orderedMatchesInRange(loadScreen.lines, 531, 588, [
      /m_videoStream\s*->\s*frameCount\s*\(\s*\)\s*\/\s*FRAME_FUDGE_ADD/,
      /while\s*\(\s*m_videoStream\s*->\s*frameIndex\s*\(\s*\)\s*<\s*m_videoStream\s*->\s*frameCount\s*\(\s*\)\s*-\s*1\s*\)/,
      /TheGameEngine\s*->\s*serviceWindowsOS\s*\(\s*\)/,
      /m_videoStream\s*->\s*isFrameReady\s*\(\s*\)/,
      /Sleep\s*\(\s*1\s*\)/,
      /TheGameEngine\s*->\s*isActive\s*\(\s*\)/,
      /^\s*break\s*;/,
      /^\s*m_videoStream\s*->\s*frameDecompress\s*\(\s*\)\s*;/,
      /^\s*m_videoStream\s*->\s*frameRender\s*\(\s*m_videoBuffer\s*\)\s*;/,
      /^\s*m_videoStream\s*->\s*frameNext\s*\(\s*\)\s*;/,
      /m_loadScreen\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*m_videoBuffer\s*\)/,
      /m_videoStream\s*->\s*frameIndex\s*\(\s*\)\s*%\s*progressUpdateCount\s*==\s*0/,
      /TheWindowManager\s*->\s*update\s*\(\s*\)/,
      /TheDisplay\s*->\s*draw\s*\(\s*\)/,
      /m_videoStream\s*->\s*close\s*\(\s*\)/,
      /m_videoStream\s*=\s*NULL\s*;/,
      /setVideoBuffer\s*\(\s*NULL\s*\)/,
      /TheDisplay\s*->\s*draw\s*\(\s*\)/,
    ]);
    facts.singlePlayer.mainMovieLoopLines = singleLoop;
    assertOrdered(errors, "SinglePlayerLoadScreen::init main movie loop", singleLoop);
    [
      ["progressUpdateCountLine", singleLoop[0], 533, "SinglePlayerLoadScreen::init progress update count"],
      ["movieWhileLine", singleLoop[1], 535, "SinglePlayerLoadScreen::init movie while"],
      ["loopServiceWindowsLine", singleLoop[2], 537, "SinglePlayerLoadScreen::init serviceWindowsOS"],
      ["isFrameReadyLine", singleLoop[3], 539, "SinglePlayerLoadScreen::init isFrameReady"],
      ["sleepLine", singleLoop[4], 541, "SinglePlayerLoadScreen::init Sleep(1)"],
      ["inactiveCheckLine", singleLoop[5], 545, "SinglePlayerLoadScreen::init inactive check"],
      ["inactiveBreakLine", singleLoop[6], 551, "SinglePlayerLoadScreen::init inactive break"],
      ["frameDecompressLine", singleLoop[7], 554, "SinglePlayerLoadScreen::init frameDecompress"],
      ["frameRenderLine", singleLoop[8], 555, "SinglePlayerLoadScreen::init frameRender"],
      ["frameNextLine", singleLoop[9], 560, "SinglePlayerLoadScreen::init frameNext"],
      ["attachVideoBufferLine", singleLoop[10], 563, "SinglePlayerLoadScreen::init attach video buffer"],
      ["progressModuloLine", singleLoop[11], 564, "SinglePlayerLoadScreen::init progress modulo"],
      ["windowUpdateLine", singleLoop[12], 577, "SinglePlayerLoadScreen::init TheWindowManager->update"],
      ["displayDrawInLoopLine", singleLoop[13], 580, "SinglePlayerLoadScreen::init loop draw"],
      ["closeAfterLoopLine", singleLoop[14], 584, "SinglePlayerLoadScreen::init close after loop"],
      ["clearStreamAfterLoopLine", singleLoop[15], 585, "SinglePlayerLoadScreen::init clear stream after loop"],
      ["detachVideoBufferAfterLoopLine", singleLoop[16], 586, "SinglePlayerLoadScreen::init detach video buffer"],
      ["finalDrawAfterLoopLine", singleLoop[17], 587, "SinglePlayerLoadScreen::init final draw"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.singlePlayer, key, actual, expected, label));
    assertExact(errors, facts.singlePlayer, "minSpecNoMovieCommentLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /if\s+we're\s+min\s+spec'ed\s+don't\s+play\s+a\s+movie/),
      591, "SinglePlayerLoadScreen::init min-spec no-movie comment");
    assertExact(errors, facts.singlePlayer, "setFPModeLine",
      firstMatchInRange(loadScreen.lines, 612, singleInitRange.end, /setFPMode\s*\(\s*\)/),
      613, "SinglePlayerLoadScreen::init setFPMode");
    assertExact(errors, facts.singlePlayer, "ambientAddLine",
      firstMatchInRange(loadScreen.lines, 612, singleInitRange.end,
        /m_ambientLoopHandle\s*=\s*TheAudio\s*->\s*addAudioEvent\s*\(\s*&m_ambientLoop\s*\)/),
      615, "SinglePlayerLoadScreen::init ambient add");
  }

  // ------------------------------------------------------------------
  // 4. ChallengeLoadScreen Bink background and WindowVideoManager movies.
  // ------------------------------------------------------------------
  const challengeCtorRange = assertFunctionRange(errors, facts.challenge, "ctor", loadScreen,
    /ChallengeLoadScreen\s*::\s*ChallengeLoadScreen\s*\(\s*void\s*\)/,
    645, "ChallengeLoadScreen::ChallengeLoadScreen");
  if (challengeCtorRange) {
    assertExact(errors, facts.challenge, "streamNullInitLine",
      firstMatchInRange(loadScreen.lines, challengeCtorRange.start, challengeCtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      648, "ChallengeLoadScreen constructor m_videoStream init");
    assertExact(errors, facts.challenge, "bufferNullInitLine",
      firstMatchInRange(loadScreen.lines, challengeCtorRange.start, challengeCtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      649, "ChallengeLoadScreen constructor m_videoBuffer init");
    assertExact(errors, facts.challenge, "windowVideoManagerNullInitLine",
      firstMatchInRange(loadScreen.lines, challengeCtorRange.start, challengeCtorRange.end,
        /m_wndVideoManager\s*=\s*NULL\s*;/),
      682, "ChallengeLoadScreen constructor m_wndVideoManager init");
  }

  const challengeDtorRange = assertFunctionRange(errors, facts.challenge, "dtor", loadScreen,
    /ChallengeLoadScreen\s*::\s*~ChallengeLoadScreen\s*\(\s*void\s*\)/,
    685, "ChallengeLoadScreen::~ChallengeLoadScreen");
  if (challengeDtorRange) {
    assertExact(errors, facts.challenge, "deleteBufferLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /delete\s+m_videoBuffer\s*;/),
      689, "ChallengeLoadScreen destructor delete m_videoBuffer");
    assertExact(errors, facts.challenge, "clearBufferLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      690, "ChallengeLoadScreen destructor clear m_videoBuffer");
    assertExact(errors, facts.challenge, "closeStreamLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_videoStream\s*->\s*close\s*\(\s*\)/),
      692, "ChallengeLoadScreen destructor close stream");
    assertExact(errors, facts.challenge, "clearStreamLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      693, "ChallengeLoadScreen destructor clear stream");
    assertExact(errors, facts.challenge, "deleteWindowVideoManagerLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /delete\s+m_wndVideoManager\s*;/),
      728, "ChallengeLoadScreen destructor delete m_wndVideoManager");
    assertExact(errors, facts.challenge, "clearWindowVideoManagerLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_wndVideoManager\s*=\s*NULL\s*;/),
      729, "ChallengeLoadScreen destructor clear m_wndVideoManager");
    assertExact(errors, facts.challenge, "removeAmbientLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /TheAudio\s*->\s*removeAudioEvent\s*\(\s*m_ambientLoopHandle\s*\)/),
      731, "ChallengeLoadScreen destructor remove ambient loop");
  }

  const activateRange = assertFunctionRange(errors, facts.challenge, "activatePieces", loadScreen,
    /void\s+ChallengeLoadScreen\s*::\s*activatePieces\s*\(\s*Int\s+frame/,
    755, "ChallengeLoadScreen::activatePieces");
  if (activateRange) {
    assertExact(errors, facts.challenge, "portraitLeftMovieLine",
      firstMatchInRange(loadScreen.lines, activateRange.start, activateRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_portraitMovieLeft\s*,\s*generalPlayer\s*->\s*getPortraitMovieLeftName\s*\(\s*\)/),
      822, "ChallengeLoadScreen::activatePieces left portrait movie");
    assertExact(errors, facts.challenge, "portraitRightMovieLine",
      firstMatchInRange(loadScreen.lines, activateRange.start, activateRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_portraitMovieRight\s*,\s*generalOpponent\s*->\s*getPortraitMovieRightName\s*\(\s*\)/),
      823, "ChallengeLoadScreen::activatePieces right portrait movie");
    assertExact(errors, facts.challenge, "overlayVsMovieLine",
      firstMatchInRange(loadScreen.lines, activateRange.start, activateRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_overlayVs\s*,\s*AsciiString\s*\(\s*"VSSmall"\s*\)/),
      856, "ChallengeLoadScreen::activatePieces VS overlay movie");
  }

  const activateMinRange = assertFunctionRange(errors, facts.challenge, "activatePiecesMinSpec", loadScreen,
    /void\s+ChallengeLoadScreen\s*::\s*activatePiecesMinSpec\s*\(/,
    885, "ChallengeLoadScreen::activatePiecesMinSpec");
  if (activateMinRange) {
    assertExact(errors, facts.challenge, "minSpecOverlayVsMovieLine",
      firstMatchInRange(loadScreen.lines, activateMinRange.start, activateMinRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_overlayVs\s*,\s*AsciiString\s*\(\s*"VSSmall"\s*\)/),
      924, "ChallengeLoadScreen::activatePiecesMinSpec VS overlay movie");
  }

  const challengeInitRange = assertFunctionRange(errors, facts.challenge, "init", loadScreen,
    /void\s+ChallengeLoadScreen\s*::\s*init\s*\(\s*GameInfo\s*\*\s*game\s*\)/,
    928, "ChallengeLoadScreen::init");
  if (challengeInitRange) {
    [
      ["campaignLine", /const\s+Campaign\s*\*\s*campaign\s*=\s*TheCampaignManager\s*->\s*getCurrentCampaign\s*\(\s*\)/, 930, "ChallengeLoadScreen::init current campaign"],
      ["missionLine", /const\s+Mission\s*\*\s*mission\s*=\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)/, 931, "ChallengeLoadScreen::init current mission"],
      ["playerGeneralLine", /getPlayerGeneralByCampaignName\s*\(\s*campaign\s*->\s*m_name\s*\)/, 934, "ChallengeLoadScreen::init player general"],
      ["opponentGeneralLine", /getGeneralByGeneralName\s*\(\s*mission\s*->\s*m_generalName\s*\)/, 938, "ChallengeLoadScreen::init opponent general"],
      ["layoutCreateLine", /winCreateFromScript\s*\(\s*AsciiString\s*\(\s*"Menus\/ChallengeLoadScreen\.wnd"\s*\)\s*\)/, 941, "ChallengeLoadScreen::init layout create"],
      ["progressBarLookupLine", /ChallengeLoadScreen\.wnd:ProgressLoad/, 947, "ChallengeLoadScreen::init progress bar lookup"],
      ["ambientEventLine", /m_ambientLoop\s*\.\s*setEventName\s*\(\s*"LoadScreenAmbient"\s*\)/, 951, "ChallengeLoadScreen::init ambient event"],
      ["videoOpenLine", /m_videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)\s*->\s*m_movieLabel\s*\)/, 954, "ChallengeLoadScreen::init TheVideoPlayer->open mission movie"],
      ["createBufferLine", /m_videoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/, 957, "ChallengeLoadScreen::init create video buffer"],
      ["allocateLine", /m_videoBuffer\s*==\s*NULL\s*\|\|\s*!m_videoBuffer\s*->\s*allocate\s*\(\s*m_videoStream\s*->\s*width\s*\(\s*\)\s*,\s*m_videoStream\s*->\s*height\s*\(\s*\)\s*\)/, 958, "ChallengeLoadScreen::init allocate buffer"],
      ["allocateFailureDeleteBufferLine", /delete\s+m_videoBuffer\s*;/, 960, "ChallengeLoadScreen::init allocation failure delete buffer"],
      ["allocateFailureCloseStreamLine", /m_videoStream\s*->\s*close\s*\(\s*\)/, 964, "ChallengeLoadScreen::init allocation failure close stream"],
      ["allocateFailureReturnLine", /^\s*return\s*;/, 967, "ChallengeLoadScreen::init allocation failure return"],
      ["portraitMovieLeftLookupLine", /ChallengeLoadScreen\.wnd:PortraitMovieLeft/, 976, "ChallengeLoadScreen::init PortraitMovieLeft lookup"],
      ["portraitMovieRightLookupLine", /ChallengeLoadScreen\.wnd:PortraitMovieRight/, 978, "ChallengeLoadScreen::init PortraitMovieRight lookup"],
      ["overlayVsLookupLine", /ChallengeLoadScreen\.wnd:OverlayVs/, 995, "ChallengeLoadScreen::init OverlayVs lookup"],
      ["newWindowVideoManagerLine", /m_wndVideoManager\s*=\s*NEW\s+WindowVideoManager\s*;/, 1044, "ChallengeLoadScreen::init new WindowVideoManager"],
      ["windowVideoManagerInitLine", /m_wndVideoManager\s*->\s*init\s*\(\s*\)/, 1045, "ChallengeLoadScreen::init WindowVideoManager::init"],
    ].forEach(([key, pattern, expected, label]) =>
      assertExact(errors, facts.challenge, key,
        firstMatchInRange(loadScreen.lines, challengeInitRange.start, challengeInitRange.end, pattern),
        expected, label));

    const challengeLoopPrefix = orderedMatchesInRange(loadScreen.lines, 1047, 1066, [
      /m_videoStream\s*->\s*frameCount\s*\(\s*\)\s*\/\s*FRAME_FUDGE_ADD/,
      /while\s*\(\s*m_videoStream\s*->\s*frameIndex\s*\(\s*\)\s*<\s*m_videoStream\s*->\s*frameCount\s*\(\s*\)\s*-\s*1\s*\)/,
      /TheGameEngine\s*->\s*serviceWindowsOS\s*\(\s*\)/,
      /m_videoStream\s*->\s*isFrameReady\s*\(\s*\)/,
      /Sleep\s*\(\s*1\s*\)/,
      /TheGameEngine\s*->\s*isActive\s*\(\s*\)/,
      /^\s*m_videoStream\s*->\s*frameNext\s*\(\s*\)\s*;/,
      /^\s*m_videoStream\s*->\s*frameDecompress\s*\(\s*\)\s*;/,
    ]);
    facts.challenge.mainMovieLoopPrefixLines = challengeLoopPrefix;
    assertOrdered(errors, "ChallengeLoadScreen::init movie loop prefix", challengeLoopPrefix);
    [
      ["progressUpdateCountLine", challengeLoopPrefix[0], 1049, "ChallengeLoadScreen::init progress update count"],
      ["movieWhileLine", challengeLoopPrefix[1], 1051, "ChallengeLoadScreen::init movie while"],
      ["loopServiceWindowsLine", challengeLoopPrefix[2], 1053, "ChallengeLoadScreen::init serviceWindowsOS"],
      ["isFrameReadyLine", challengeLoopPrefix[3], 1055, "ChallengeLoadScreen::init isFrameReady"],
      ["sleepLine", challengeLoopPrefix[4], 1057, "ChallengeLoadScreen::init Sleep(1)"],
      ["inactiveCheckLine", challengeLoopPrefix[5], 1061, "ChallengeLoadScreen::init inactive check"],
      ["inactiveFrameNextLine", challengeLoopPrefix[6], 1063, "ChallengeLoadScreen::init inactive frameNext"],
      ["inactiveFrameDecompressLine", challengeLoopPrefix[7], 1064, "ChallengeLoadScreen::init inactive frameDecompress"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.challenge, key, actual, expected, label));

    const challengeActiveLoop = orderedMatchesInRange(loadScreen.lines, 1066, 1096, [
      /^\s*m_videoStream\s*->\s*frameDecompress\s*\(\s*\)\s*;/,
      /^\s*m_videoStream\s*->\s*frameRender\s*\(\s*m_videoBuffer\s*\)\s*;/,
      /^\s*m_videoStream\s*->\s*frameNext\s*\(\s*\)\s*;/,
      /m_loadScreen\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*m_videoBuffer\s*\)/,
      /Int\s+frame\s*=\s*m_videoStream\s*->\s*frameIndex\s*\(\s*\)/,
      /TheWindowManager\s*->\s*update\s*\(\s*\)/,
      /activatePieces\s*\(\s*frame\s*,\s*generalPlayer\s*,\s*generalOpponent\s*\)/,
      /m_wndVideoManager\s*->\s*update\s*\(\s*\)/,
      /TheDisplay\s*->\s*draw\s*\(\s*\)/,
      /TheAudio\s*->\s*update\s*\(\s*\)/,
    ]);
    facts.challenge.mainMovieActiveLoopLines = challengeActiveLoop;
    assertOrdered(errors, "ChallengeLoadScreen::init active movie loop", challengeActiveLoop);
    [
      ["frameDecompressLine", challengeActiveLoop[0], 1068, "ChallengeLoadScreen::init active frameDecompress"],
      ["frameRenderLine", challengeActiveLoop[1], 1069, "ChallengeLoadScreen::init active frameRender"],
      ["frameNextLine", challengeActiveLoop[2], 1070, "ChallengeLoadScreen::init active frameNext"],
      ["attachVideoBufferLine", challengeActiveLoop[3], 1073, "ChallengeLoadScreen::init attach video buffer"],
      ["frameVarLine", challengeActiveLoop[4], 1075, "ChallengeLoadScreen::init frame var"],
      ["windowUpdateLine", challengeActiveLoop[5], 1087, "ChallengeLoadScreen::init TheWindowManager->update"],
      ["activatePiecesLine", challengeActiveLoop[6], 1089, "ChallengeLoadScreen::init activatePieces"],
      ["windowVideoManagerUpdateLine", challengeActiveLoop[7], 1090, "ChallengeLoadScreen::init WindowVideoManager update"],
      ["displayDrawLine", challengeActiveLoop[8], 1093, "ChallengeLoadScreen::init display draw"],
      ["audioUpdateLine", challengeActiveLoop[9], 1095, "ChallengeLoadScreen::init audio update"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.challenge, key, actual, expected, label));

    const challengeMinSpec = orderedMatchesInRange(loadScreen.lines, 1098, 1130, [
      /m_videoStream\s*->\s*frameGoto\s*\(\s*m_videoStream\s*->\s*frameCount\s*\(\s*\)\s*\)/,
      /while\s*\(\s*!m_videoStream\s*->\s*isFrameReady\s*\(\s*\)\s*\)/,
      /^\s*m_videoStream\s*->\s*frameDecompress\s*\(\s*\)\s*;/,
      /^\s*m_videoStream\s*->\s*frameRender\s*\(\s*m_videoBuffer\s*\)\s*;/,
      /m_loadScreen\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*m_videoBuffer\s*\)/,
      /activatePiecesMinSpec\s*\(\s*generalPlayer\s*,\s*generalOpponent\s*\)/,
      /m_wndVideoManager\s*->\s*update\s*\(\s*\)/,
      /TheWindowManager\s*->\s*update\s*\(\s*\)/,
      /TheDisplay\s*->\s*draw\s*\(\s*\)/,
    ]);
    facts.challenge.minSpecLines = challengeMinSpec;
    assertOrdered(errors, "ChallengeLoadScreen::init min-spec frame path", challengeMinSpec);
    [
      ["minSpecFrameGotoLine", challengeMinSpec[0], 1101, "ChallengeLoadScreen::init min-spec frameGoto"],
      ["minSpecWaitReadyLine", challengeMinSpec[1], 1102, "ChallengeLoadScreen::init min-spec wait ready"],
      ["minSpecFrameDecompressLine", challengeMinSpec[2], 1104, "ChallengeLoadScreen::init min-spec frameDecompress"],
      ["minSpecFrameRenderLine", challengeMinSpec[3], 1105, "ChallengeLoadScreen::init min-spec frameRender"],
      ["minSpecAttachBufferLine", challengeMinSpec[4], 1107, "ChallengeLoadScreen::init min-spec attach buffer"],
      ["minSpecActivatePiecesLine", challengeMinSpec[5], 1109, "ChallengeLoadScreen::init min-spec activate pieces"],
      ["minSpecWindowVideoManagerUpdateLine", challengeMinSpec[6], 1126, "ChallengeLoadScreen::init min-spec WindowVideoManager update"],
      ["minSpecWindowUpdateLine", challengeMinSpec[7], 1127, "ChallengeLoadScreen::init min-spec window update"],
      ["minSpecDisplayDrawLine", challengeMinSpec[8], 1128, "ChallengeLoadScreen::init min-spec display draw"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.challenge, key, actual, expected, label));

    assertExact(errors, facts.challenge, "setFPModeLine",
      firstMatchInRange(loadScreen.lines, 1129, challengeInitRange.end, /setFPMode\s*\(\s*\)/),
      1130, "ChallengeLoadScreen::init setFPMode");
    assertExact(errors, facts.challenge, "tauntAudioLine",
      firstMatchInRange(loadScreen.lines, 1129, challengeInitRange.end,
        /TheAudio\s*->\s*addAudioEvent\s*\(\s*&event\s*\)/),
      1134, "ChallengeLoadScreen::init opponent taunt audio");
    assertExact(errors, facts.challenge, "ambientAddLine",
      firstMatchInRange(loadScreen.lines, 1129, challengeInitRange.end,
        /m_ambientLoopHandle\s*=\s*TheAudio\s*->\s*addAudioEvent\s*\(\s*&m_ambientLoop\s*\)/),
      1136, "ChallengeLoadScreen::init ambient add");
  }

  // ------------------------------------------------------------------
  // 5. ScoreScreen blocking final-victory Bink movie path.
  // ------------------------------------------------------------------
  assertExact(errors, facts.scoreScreen, "initSinglePlayerDeclLine",
    lineNumber(scoreScreen.lines, (line) => /void\s+initSinglePlayer\s*\(\s*void\s*\)\s*;/.test(line)),
    155, "ScoreScreen.cpp initSinglePlayer declaration");
  assertExact(errors, facts.scoreScreen, "finishSinglePlayerInitDeclLine",
    lineNumber(scoreScreen.lines, (line) => /void\s+finishSinglePlayerInit\s*\(\s*void\s*\)\s*;/.test(line)),
    156, "ScoreScreen.cpp finishSinglePlayerInit declaration");
  assertExact(errors, facts.scoreScreen, "blankLayoutStaticLine",
    lineNumber(scoreScreen.lines, (line) => /static\s+WindowLayout\s*\*\s*s_blankLayout\s*=\s*NULL\s*;/.test(line)),
    159, "ScoreScreen.cpp s_blankLayout static");

  const scoreUpdateRange = assertFunctionRange(errors, facts.scoreScreen, "scoreUpdate", scoreScreen,
    /void\s+ScoreScreenUpdate\s*\(\s*WindowLayout\s*\*\s*layout\s*,\s*void\s*\*\s*userData\s*\)/,
    415, "ScoreScreenUpdate");
  if (scoreUpdateRange) {
    assertExact(errors, facts.scoreScreen, "finishSinglePlayerInitUpdateCallLine",
      firstMatchInRange(scoreScreen.lines, scoreUpdateRange.start, scoreUpdateRange.end,
        /finishSinglePlayerInit\s*\(\s*\)/),
      426, "ScoreScreenUpdate finishSinglePlayerInit call");
  }

  const playMovieRange = assertFunctionRange(errors, facts.scoreScreen, "playMovieAndBlock", scoreScreen,
    /void\s+PlayMovieAndBlock\s*\(\s*AsciiString\s+movieTitle\s*\)/,
    685, "ScoreScreen PlayMovieAndBlock");
  if (playMovieRange) {
    [
      ["videoOpenLine", /VideoStreamInterface\s*\*\s*videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*movieTitle\s*\)/, 687, "PlayMovieAndBlock TheVideoPlayer->open"],
      ["nullStreamCheckLine", /if\s*\(\s*videoStream\s*==\s*NULL\s*\)/, 688, "PlayMovieAndBlock null stream check"],
      ["nullStreamReturnLine", /^\s*return\s*;/, 690, "PlayMovieAndBlock null stream return"],
      ["createBufferLine", /VideoBuffer\s*\*\s*videoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/, 694, "PlayMovieAndBlock create video buffer"],
      ["allocateWidthLine", /videoBuffer\s*->\s*allocate\s*\(\s*videoStream\s*->\s*width\s*\(\s*\)/, 696, "PlayMovieAndBlock allocate width"],
      ["allocateHeightLine", /videoStream\s*->\s*height\s*\(\s*\)/, 697, "PlayMovieAndBlock allocate height"],
      ["allocateFailureDeleteBufferLine", /delete\s+videoBuffer\s*;/, 700, "PlayMovieAndBlock allocation failure delete buffer"],
      ["allocateFailureCloseStreamLine", /videoStream\s*->\s*close\s*\(\s*\)/, 704, "PlayMovieAndBlock allocation failure close stream"],
      ["movieWindowLine", /GameWindow\s*\*\s*movieWindow\s*=\s*s_blankLayout\s*->\s*getFirstWindow\s*\(\s*\)/, 710, "PlayMovieAndBlock blank layout first window"],
      ["loadScreenRenderTrueLine", /TheWritableGlobalData\s*->\s*m_loadScreenRender\s*=\s*TRUE\s*;/, 711, "PlayMovieAndBlock loadScreenRender true"],
    ].forEach(([key, pattern, expected, label]) =>
      assertExact(errors, facts.scoreScreen, key,
        firstMatchInRange(scoreScreen.lines, playMovieRange.start, playMovieRange.end, pattern),
        expected, label));
    assertExact(errors, facts.scoreScreen, "allocateFailureReturnLine",
      firstMatchInRange(scoreScreen.lines, 699, 708, /^\s*return\s*;/),
      707, "PlayMovieAndBlock allocation failure return");

    const scoreLoopPrefix = orderedMatchesInRange(scoreScreen.lines, 711, 728, [
      /while\s*\(\s*videoStream\s*->\s*frameIndex\s*\(\s*\)\s*<\s*videoStream\s*->\s*frameCount\s*\(\s*\)\s*-\s*1\s*\)/,
      /TheGameEngine\s*->\s*serviceWindowsOS\s*\(\s*\)/,
      /videoStream\s*->\s*isFrameReady\s*\(\s*\)/,
      /Sleep\s*\(\s*1\s*\)/,
      /TheGameEngine\s*->\s*isActive\s*\(\s*\)/,
      /^\s*videoStream\s*->\s*frameNext\s*\(\s*\)\s*;/,
      /^\s*videoStream\s*->\s*frameDecompress\s*\(\s*\)\s*;/,
    ]);
    facts.scoreScreen.movieLoopPrefixLines = scoreLoopPrefix;
    assertOrdered(errors, "PlayMovieAndBlock movie loop prefix", scoreLoopPrefix);
    [
      ["movieWhileLine", scoreLoopPrefix[0], 712, "PlayMovieAndBlock movie while"],
      ["loopServiceWindowsLine", scoreLoopPrefix[1], 714, "PlayMovieAndBlock serviceWindowsOS"],
      ["isFrameReadyLine", scoreLoopPrefix[2], 716, "PlayMovieAndBlock isFrameReady"],
      ["sleepLine", scoreLoopPrefix[3], 718, "PlayMovieAndBlock Sleep(1)"],
      ["inactiveCheckLine", scoreLoopPrefix[4], 722, "PlayMovieAndBlock inactive check"],
      ["inactiveFrameNextLine", scoreLoopPrefix[5], 724, "PlayMovieAndBlock inactive frameNext"],
      ["inactiveFrameDecompressLine", scoreLoopPrefix[6], 725, "PlayMovieAndBlock inactive frameDecompress"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.scoreScreen, key, actual, expected, label));

    const scoreActiveLoop = orderedMatchesInRange(scoreScreen.lines, 728, 739, [
      /^\s*videoStream\s*->\s*frameDecompress\s*\(\s*\)\s*;/,
      /^\s*videoStream\s*->\s*frameRender\s*\(\s*videoBuffer\s*\)\s*;/,
      /^\s*videoStream\s*->\s*frameNext\s*\(\s*\)\s*;/,
      /movieWindow\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*videoBuffer\s*\)/,
      /TheDisplay\s*->\s*draw\s*\(\s*\)/,
    ]);
    facts.scoreScreen.movieActiveLoopLines = scoreActiveLoop;
    assertOrdered(errors, "PlayMovieAndBlock active movie loop", scoreActiveLoop);
    [
      ["frameDecompressLine", scoreActiveLoop[0], 729, "PlayMovieAndBlock active frameDecompress"],
      ["frameRenderLine", scoreActiveLoop[1], 730, "PlayMovieAndBlock active frameRender"],
      ["frameNextLine", scoreActiveLoop[2], 731, "PlayMovieAndBlock active frameNext"],
      ["attachVideoBufferLine", scoreActiveLoop[3], 734, "PlayMovieAndBlock attach video buffer"],
      ["displayDrawLine", scoreActiveLoop[4], 738, "PlayMovieAndBlock display draw"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.scoreScreen, key, actual, expected, label));

    [
      ["loadScreenRenderFalseLine", /TheWritableGlobalData\s*->\s*m_loadScreenRender\s*=\s*FALSE\s*;/, 740, "PlayMovieAndBlock loadScreenRender false"],
      ["detachVideoBufferLine", /movieWindow\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*NULL\s*\)/, 741, "PlayMovieAndBlock detach video buffer"],
      ["deleteBufferLine", /delete\s+videoBuffer\s*;/, 744, "PlayMovieAndBlock delete video buffer"],
      ["closeStreamLine", /videoStream\s*->\s*close\s*\(\s*\)/, 749, "PlayMovieAndBlock close stream"],
      ["setFPModeLine", /setFPMode\s*\(\s*\)/, 753, "PlayMovieAndBlock setFPMode"],
    ].forEach(([key, pattern, expected, label]) =>
      assertExact(errors, facts.scoreScreen, key,
        firstMatchInRange(scoreScreen.lines, 739, playMovieRange.end, pattern),
        expected, label));
  }

  const initSingleRange = assertFunctionRange(errors, facts.scoreScreen, "initSinglePlayer", scoreScreen,
    /void\s+initSinglePlayer\s*\(\s*void\s*\)/,
    756, "ScoreScreen initSinglePlayer");
  if (initSingleRange) {
    [
      ["needFinishLine", /s_needToFinishSinglePlayerInit\s*=\s*TRUE\s*;/, 762, "initSinglePlayer need finish flag"],
      ["blankLayoutCreateLine", /s_blankLayout\s*=\s*TheWindowManager\s*->\s*winCreateLayout\s*\(\s*"Menus\/BlankWindow\.wnd"\s*\)/, 763, "initSinglePlayer blank layout create"],
      ["blankLayoutHideLine", /s_blankLayout\s*->\s*hide\s*\(\s*FALSE\s*\)/, 765, "initSinglePlayer blank layout show"],
      ["blankLayoutBringForwardLine", /s_blankLayout\s*->\s*bringForward\s*\(\s*\)/, 766, "initSinglePlayer blank layout bring forward"],
      ["blankLayoutClearImageLine", /s_blankLayout\s*->\s*getFirstWindow\s*\(\s*\)\s*->\s*winClearStatus\s*\(\s*WIN_STATUS_IMAGE\s*\)/, 767, "initSinglePlayer blank layout first-window clear image"],
    ].forEach(([key, pattern, expected, label]) =>
      assertExact(errors, facts.scoreScreen, key,
        firstMatchInRange(scoreScreen.lines, initSingleRange.start, initSingleRange.end, pattern),
        expected, label));
  }

  const finishRange = assertFunctionRange(errors, facts.scoreScreen, "finishSinglePlayerInit", scoreScreen,
    /void\s+finishSinglePlayerInit\s*\(\s*void\s*\)/,
    786, "ScoreScreen finishSinglePlayerInit");
  if (finishRange) {
    [
      ["victoryCheckLine", /if\s*\(\s*copyProtectOK\s*&&\s*TheCampaignManager\s*->\s*isVictorious\s*\(\s*\)\s*\)/, 792, "finishSinglePlayerInit victory check"],
      ["finalVictoryMovieCheckLine", /campaign\s*->\s*getFinalVictoryMovie\s*\(\s*\)\s*\.\s*isNotEmpty\s*\(\s*\)/, 878, "finishSinglePlayerInit final victory movie check"],
      ["finalVictoryMovieAssignLine", /vidName\s*=\s*campaign\s*->\s*getFinalVictoryMovie\s*\(\s*\)/, 881, "finishSinglePlayerInit final victory movie assign"],
      ["useLowResInitLine", /Bool\s+useLowRes\s*=\s*FALSE\s*;/, 882, "finishSinglePlayerInit useLowRes init"],
      ["memPassLowResLine", /TheGameLODManager\s*->\s*didMemPass\s*\(\s*\)/, 884, "finishSinglePlayerInit didMemPass low-res gate"],
      ["staticFindLowResLine", /findStaticLODLevel\s*\(\s*\)\s*==\s*STATIC_GAME_LOD_LOW/, 887, "finishSinglePlayerInit findStaticLODLevel low-res gate"],
      ["staticGetLowResLine", /getStaticLODLevel\s*\(\s*\)\s*==\s*STATIC_GAME_LOD_LOW/, 890, "finishSinglePlayerInit getStaticLODLevel low-res gate"],
      ["playIfNotLowResLine", /if\s*\(\s*!useLowRes\s*\)/, 894, "finishSinglePlayerInit non-low-res gate"],
      ["playMovieAndBlockCallLine", /PlayMovieAndBlock\s*\(\s*vidName\s*\)/, 895, "finishSinglePlayerInit PlayMovieAndBlock call"],
      ["destroyBlankLayoutLine", /s_blankLayout\s*->\s*destroyWindows\s*\(\s*\)/, 938, "finishSinglePlayerInit destroy blank layout windows"],
      ["deleteBlankLayoutLine", /s_blankLayout\s*->\s*deleteInstance\s*\(\s*\)/, 939, "finishSinglePlayerInit delete blank layout"],
      ["clearBlankLayoutLine", /s_blankLayout\s*=\s*NULL\s*;/, 940, "finishSinglePlayerInit clear blank layout"],
    ].forEach(([key, pattern, expected, label]) =>
      assertExact(errors, facts.scoreScreen, key,
        firstMatchInRange(scoreScreen.lines, finishRange.start, finishRange.end, pattern),
        expected, label));
  }

  // ------------------------------------------------------------------
  // 6. Layout/window interfaces that ScoreScreen depends on.
  // ------------------------------------------------------------------
  assertExact(errors, facts.windowLayout, "winCreateLayoutVirtualLine",
    lineNumber(gameWindowManagerH.lines,
      (line) => /virtual\s+WindowLayout\s*\*\s*winCreateLayout\s*\(\s*AsciiString\s+filename\s*\)/.test(line)),
    207, "GameWindowManager.h virtual winCreateLayout");
  assertExact(errors, facts.windowLayout, "getFirstWindowInlineLine",
    lineNumber(windowLayoutH.lines,
      (line) => /inline\s+GameWindow\s*\*\s*WindowLayout\s*::\s*getFirstWindow\s*\(\s*void\s*\)/.test(line)),
    114, "WindowLayout.h getFirstWindow inline");
  assertExact(errors, facts.windowLayout, "destroyWindowsDefLine",
    findFunctionDef(windowLayout.lines,
      /void\s+WindowLayout\s*::\s*destroyWindows\s*\(\s*void\s*\)/),
    174, "WindowLayout::destroyWindows");
  assertExact(errors, facts.windowLayout, "destroyWindowsLoopLine",
    lineNumber(windowLayout.lines,
      (line) => /while\s*\(\s*\(\s*window\s*=\s*getFirstWindow\s*\(\s*\)\s*\)\s*!=\s*0\s*\)/.test(line)),
    182, "WindowLayout::destroyWindows getFirstWindow loop");

  // ------------------------------------------------------------------
  // 7. Package script registration.
  // ------------------------------------------------------------------
  assertPresent(errors, facts.packageJson, "scriptLine",
    lineNumber(packageJson.lines,
      (line) => /"verify:bink-loadscore-movie-frontier"\s*:\s*"node tools\/verify_bink_loadscore_movie_frontier\.mjs"/.test(line)),
    "WebAssembly/package.json verify:bink-loadscore-movie-frontier script");
  assertPresent(errors, facts.packageJson, "strictScriptLine",
    lineNumber(packageJson.lines,
      (line) => /"verify:bink-loadscore-movie-frontier:strict"\s*:\s*"node tools\/verify_bink_loadscore_movie_frontier\.mjs"/.test(line)),
    "WebAssembly/package.json verify:bink-loadscore-movie-frontier:strict script");

  const ok = errors.length === 0;
  console.log(JSON.stringify({
    ok,
    errors,
    sources: SOURCES,
    facts,
    note: "Source-only LoadScreen/ScoreScreen Bink ownership verifier; full runtime load-screen/score-screen playback remains open until the broader GUI/game singleton path can be harness-driven.",
  }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main();
