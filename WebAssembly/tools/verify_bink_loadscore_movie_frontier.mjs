#!/usr/bin/env node
// verify_bink_loadscore_movie_frontier.mjs
//
// Source-only verifier for the original LoadScreen and ScoreScreen Bink movie
// ownership frontier. It reads repo files and never executes the engine or wasm.
//
// This complements the focused browser Bink/W3D presentation smoke, which
// already proves decoded sidecar frames can reach a real W3DVideoBuffer and
// W3DDisplay::drawVideoBuffer. The focused browser smoke now drives the
// original ScoreScreen::PlayMovieAndBlock and SinglePlayerLoadScreen::init
// movie loops through test-controlled layout/movie facts; full campaign-owned
// ScoreScreen/Challenge/InGameUI coverage remains open.
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
  runtimeSmoke: "WebAssembly/tests/bink_w3d_video_buffer_upload_smoke.cpp",
  runtimeBrowserHarness: "WebAssembly/harness/bink_w3d_video_buffer_upload_smoke.mjs",
  cmake: "WebAssembly/CMakeLists.txt",
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
    runtimeScoreScreen: {},
    runtimeSinglePlayer: {},
    runtimeBrowserHarness: {},
    cmake: {},
    packageJson: {},
  };

  const loadScreenH = readSourceLines(SOURCES.loadScreenH);
  const loadScreen = readSourceLines(SOURCES.loadScreen);
  const scoreScreen = readSourceLines(SOURCES.scoreScreen);
  const gameWindowManagerH = readSourceLines(SOURCES.gameWindowManagerH);
  const windowLayoutH = readSourceLines(SOURCES.windowLayoutH);
  const windowLayout = readSourceLines(SOURCES.windowLayout);
  const runtimeSmoke = readSourceLines(SOURCES.runtimeSmoke);
  const runtimeBrowserHarness = readSourceLines(SOURCES.runtimeBrowserHarness);
  const cmake = readSourceLines(SOURCES.cmake);
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
    /LoadScreen\s*::\s*LoadScreen\s*\(\s*void\s*\)/, 173, "LoadScreen::LoadScreen");
  if (loadCtorRange) {
    assertExact(errors, facts.loadScreenBase, "loadScreenNullInitLine",
      firstMatchInRange(loadScreen.lines, loadCtorRange.start, loadCtorRange.end,
        /m_loadScreen\s*=\s*NULL\s*;/),
      175, "LoadScreen constructor m_loadScreen init");
  }

  const loadDtorRange = assertFunctionRange(errors, facts.loadScreenBase, "loadDtor", loadScreen,
    /LoadScreen\s*::\s*~LoadScreen\s*\(\s*void\s*\)/, 178, "LoadScreen::~LoadScreen");
  if (loadDtorRange) {
    assertExact(errors, facts.loadScreenBase, "loadScreenDestroyLine",
      firstMatchInRange(loadScreen.lines, loadDtorRange.start, loadDtorRange.end,
        /TheWindowManager\s*->\s*winDestroy\s*\(\s*m_loadScreen\s*\)/),
      183, "LoadScreen destructor TheWindowManager->winDestroy");
  }

  const loadUpdateRange = assertFunctionRange(errors, facts.loadScreenBase, "loadUpdate", loadScreen,
    /void\s+LoadScreen\s*::\s*update\s*\(\s*Int\s+percent\s*\)/, 187, "LoadScreen::update(Int)");
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
    assertExact(errors, facts.loadScreenBase, "serviceWindowsOSLine", updateLoop[0], 189,
      "LoadScreen::update TheGameEngine->serviceWindowsOS");
    assertExact(errors, facts.loadScreenBase, "windowManagerUpdateLine", updateLoop[1], 193,
      "LoadScreen::update TheWindowManager->update");
    assertExact(errors, facts.loadScreenBase, "displayUpdateLine", updateLoop[2], 194,
      "LoadScreen::update TheDisplay->update");
    assertExact(errors, facts.loadScreenBase, "displayDrawLine", updateLoop[3], 196,
      "LoadScreen::update TheDisplay->draw");
    assertExact(errors, facts.loadScreenBase, "setFPModeLine", updateLoop[4], 198,
      "LoadScreen::update setFPMode");
  }

  // ------------------------------------------------------------------
  // 3. SinglePlayerLoadScreen Bink background movie ownership.
  // ------------------------------------------------------------------
  const singleCtorRange = assertFunctionRange(errors, facts.singlePlayer, "ctor", loadScreen,
    /SinglePlayerLoadScreen\s*::\s*SinglePlayerLoadScreen\s*\(\s*void\s*\)/,
    204, "SinglePlayerLoadScreen::SinglePlayerLoadScreen");
  if (singleCtorRange) {
    assertExact(errors, facts.singlePlayer, "streamNullInitLine",
      firstMatchInRange(loadScreen.lines, singleCtorRange.start, singleCtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      215, "SinglePlayerLoadScreen constructor m_videoStream init");
    assertExact(errors, facts.singlePlayer, "bufferNullInitLine",
      firstMatchInRange(loadScreen.lines, singleCtorRange.start, singleCtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      216, "SinglePlayerLoadScreen constructor m_videoBuffer init");
  }

  const singleDtorRange = assertFunctionRange(errors, facts.singlePlayer, "dtor", loadScreen,
    /SinglePlayerLoadScreen\s*::\s*~SinglePlayerLoadScreen\s*\(\s*void\s*\)/,
    223, "SinglePlayerLoadScreen::~SinglePlayerLoadScreen");
  if (singleDtorRange) {
    assertExact(errors, facts.singlePlayer, "deleteBufferLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /delete\s+m_videoBuffer\s*;/),
      231, "SinglePlayerLoadScreen destructor delete m_videoBuffer");
    assertExact(errors, facts.singlePlayer, "clearBufferLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      232, "SinglePlayerLoadScreen destructor clear m_videoBuffer");
    assertExact(errors, facts.singlePlayer, "closeStreamLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /m_videoStream\s*->\s*close\s*\(\s*\)/),
      235, "SinglePlayerLoadScreen destructor close stream");
    assertExact(errors, facts.singlePlayer, "clearStreamLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      236, "SinglePlayerLoadScreen destructor clear stream");
    assertExact(errors, facts.singlePlayer, "removeAmbientLine",
      firstMatchInRange(loadScreen.lines, singleDtorRange.start, singleDtorRange.end,
        /TheAudio\s*->\s*removeAudioEvent\s*\(\s*m_ambientLoopHandle\s*\)/),
      238, "SinglePlayerLoadScreen destructor remove ambient loop");
  }

  const singleInitRange = assertFunctionRange(errors, facts.singlePlayer, "init", loadScreen,
    /void\s+SinglePlayerLoadScreen\s*::\s*init\s*\(\s*GameInfo\s*\*\s*game\s*\)/,
    415, "SinglePlayerLoadScreen::init");
  if (singleInitRange) {
    assertExact(errors, facts.singlePlayer, "movieTestHookGuardLine",
      lineNumber(loadScreen.lines,
        (line) => /defined\s*\(\s*CNC_PORT_LOAD_SCREEN_MOVIE_TEST_HOOKS\s*\)/.test(line)),
      126, "LoadScreen.cpp focused SinglePlayerLoadScreen movie test hook guard");
    assertExact(errors, facts.singlePlayer, "movieTestHookSetLine",
      lineNumber(loadScreen.lines,
        (line) => /CncPortLoadScreenSetSinglePlayerMovieForTest\s*\(\s*const\s+char\s+\*campaignName/.test(line)),
      137, "LoadScreen.cpp focused SinglePlayerLoadScreen movie setter hook");
    assertExact(errors, facts.singlePlayer, "movieTestHookGetLine",
      lineNumber(loadScreen.lines,
        (line) => /CncPortLoadScreenGetSinglePlayerMovieForTest\s*\(\s*\)/.test(line)),
      143, "LoadScreen.cpp focused SinglePlayerLoadScreen movie getter hook");
    assertExact(errors, facts.singlePlayer, "layoutCreateLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /winCreateFromScript\s*\(\s*AsciiString\s*\(\s*"Menus\/SinglePlayerLoadScreen\.wnd"\s*\)\s*\)/),
      420, "SinglePlayerLoadScreen::init layout create");
    assertExact(errors, facts.singlePlayer, "progressBarLookupLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /SinglePlayerLoadScreen\.wnd:ProgressLoad/),
      426, "SinglePlayerLoadScreen::init progress bar lookup");
    assertExact(errors, facts.singlePlayer, "missionLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /^\s*Mission\s*\*\s*mission\s*=\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)/),
      441, "SinglePlayerLoadScreen::init current mission");
    assertExact(errors, facts.singlePlayer, "ambientEventLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_ambientLoop\s*\.\s*setEventName\s*\(\s*"LoadScreenAmbient"\s*\)/),
      521, "SinglePlayerLoadScreen::init ambient event");
    assertExact(errors, facts.singlePlayer, "videoOpenTestHookLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*s_singlePlayerLoadScreenMovieLabel\s*\)/),
      524, "SinglePlayerLoadScreen::init focused test hook movie open");
    assertExact(errors, facts.singlePlayer, "videoOpenLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)\s*->\s*m_movieLabel\s*\)/),
      526, "SinglePlayerLoadScreen::init TheVideoPlayer->open mission movie");
    assertExact(errors, facts.singlePlayer, "nullStreamCheckLine",
      firstMatchInRange(loadScreen.lines, 528, singleInitRange.end,
        /if\s*\(\s*m_videoStream\s*==\s*NULL\s*\)/),
      528, "SinglePlayerLoadScreen::init null stream guard");
    assertExact(errors, facts.singlePlayer, "nullStreamReturnLine",
      firstMatchInRange(loadScreen.lines, 528, 533, /^\s*return\s*;/),
      531, "SinglePlayerLoadScreen::init null stream return");
    assertExact(errors, facts.singlePlayer, "createBufferLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/),
      535, "SinglePlayerLoadScreen::init create video buffer");
    assertExact(errors, facts.singlePlayer, "allocateWidthLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoBuffer\s*->\s*allocate\s*\(\s*m_videoStream\s*->\s*width\s*\(\s*\)/),
      537, "SinglePlayerLoadScreen::init allocate width");
    assertExact(errors, facts.singlePlayer, "allocateHeightLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /m_videoStream\s*->\s*height\s*\(\s*\)/),
      538, "SinglePlayerLoadScreen::init allocate height");
    assertExact(errors, facts.singlePlayer, "allocateFailureDeleteBufferLine",
      firstMatchInRange(loadScreen.lines, 540, 549, /delete\s+m_videoBuffer\s*;/),
      541, "SinglePlayerLoadScreen::init allocation failure delete buffer");
    assertExact(errors, facts.singlePlayer, "allocateFailureCloseStreamLine",
      firstMatchInRange(loadScreen.lines, 540, 549, /m_videoStream\s*->\s*close\s*\(\s*\)/),
      545, "SinglePlayerLoadScreen::init allocation failure close stream");
    assertExact(errors, facts.singlePlayer, "allocateFailureReturnLine",
      firstMatchInRange(loadScreen.lines, 540, 549, /^\s*return\s*;/),
      548, "SinglePlayerLoadScreen::init allocation failure return");

    const singleLoop = orderedMatchesInRange(loadScreen.lines, 577, 638, [
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
      ["progressUpdateCountLine", singleLoop[0], 583, "SinglePlayerLoadScreen::init progress update count"],
      ["movieWhileLine", singleLoop[1], 585, "SinglePlayerLoadScreen::init movie while"],
      ["loopServiceWindowsLine", singleLoop[2], 587, "SinglePlayerLoadScreen::init serviceWindowsOS"],
      ["isFrameReadyLine", singleLoop[3], 589, "SinglePlayerLoadScreen::init isFrameReady"],
      ["sleepLine", singleLoop[4], 591, "SinglePlayerLoadScreen::init Sleep(1)"],
      ["inactiveCheckLine", singleLoop[5], 595, "SinglePlayerLoadScreen::init inactive check"],
      ["inactiveBreakLine", singleLoop[6], 601, "SinglePlayerLoadScreen::init inactive break"],
      ["frameDecompressLine", singleLoop[7], 604, "SinglePlayerLoadScreen::init frameDecompress"],
      ["frameRenderLine", singleLoop[8], 605, "SinglePlayerLoadScreen::init frameRender"],
      ["frameNextLine", singleLoop[9], 610, "SinglePlayerLoadScreen::init frameNext"],
      ["attachVideoBufferLine", singleLoop[10], 613, "SinglePlayerLoadScreen::init attach video buffer"],
      ["progressModuloLine", singleLoop[11], 614, "SinglePlayerLoadScreen::init progress modulo"],
      ["windowUpdateLine", singleLoop[12], 627, "SinglePlayerLoadScreen::init TheWindowManager->update"],
      ["displayDrawInLoopLine", singleLoop[13], 630, "SinglePlayerLoadScreen::init loop draw"],
      ["closeAfterLoopLine", singleLoop[14], 634, "SinglePlayerLoadScreen::init close after loop"],
      ["clearStreamAfterLoopLine", singleLoop[15], 635, "SinglePlayerLoadScreen::init clear stream after loop"],
      ["detachVideoBufferAfterLoopLine", singleLoop[16], 636, "SinglePlayerLoadScreen::init detach video buffer"],
      ["finalDrawAfterLoopLine", singleLoop[17], 637, "SinglePlayerLoadScreen::init final draw"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.singlePlayer, key, actual, expected, label));
    assertExact(errors, facts.singlePlayer, "minSpecNoMovieCommentLine",
      firstMatchInRange(loadScreen.lines, singleInitRange.start, singleInitRange.end,
        /if\s+we're\s+min\s+spec'ed\s+don't\s+play\s+a\s+movie/),
      641, "SinglePlayerLoadScreen::init min-spec no-movie comment");
    assertExact(errors, facts.singlePlayer, "setFPModeLine",
      firstMatchInRange(loadScreen.lines, 666, singleInitRange.end, /setFPMode\s*\(\s*\)/),
      667, "SinglePlayerLoadScreen::init setFPMode");
    assertExact(errors, facts.singlePlayer, "ambientAddLine",
      firstMatchInRange(loadScreen.lines, 666, singleInitRange.end,
        /m_ambientLoopHandle\s*=\s*TheAudio\s*->\s*addAudioEvent\s*\(\s*&m_ambientLoop\s*\)/),
      669, "SinglePlayerLoadScreen::init ambient add");
  }

  // ------------------------------------------------------------------
  // 4. ChallengeLoadScreen Bink background and WindowVideoManager movies.
  // ------------------------------------------------------------------
  const challengeCtorRange = assertFunctionRange(errors, facts.challenge, "ctor", loadScreen,
    /ChallengeLoadScreen\s*::\s*ChallengeLoadScreen\s*\(\s*void\s*\)/,
    699, "ChallengeLoadScreen::ChallengeLoadScreen");
  if (challengeCtorRange) {
    assertExact(errors, facts.challenge, "streamNullInitLine",
      firstMatchInRange(loadScreen.lines, challengeCtorRange.start, challengeCtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      702, "ChallengeLoadScreen constructor m_videoStream init");
    assertExact(errors, facts.challenge, "bufferNullInitLine",
      firstMatchInRange(loadScreen.lines, challengeCtorRange.start, challengeCtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      703, "ChallengeLoadScreen constructor m_videoBuffer init");
    assertExact(errors, facts.challenge, "windowVideoManagerNullInitLine",
      firstMatchInRange(loadScreen.lines, challengeCtorRange.start, challengeCtorRange.end,
        /m_wndVideoManager\s*=\s*NULL\s*;/),
      736, "ChallengeLoadScreen constructor m_wndVideoManager init");
  }

  const challengeDtorRange = assertFunctionRange(errors, facts.challenge, "dtor", loadScreen,
    /ChallengeLoadScreen\s*::\s*~ChallengeLoadScreen\s*\(\s*void\s*\)/,
    739, "ChallengeLoadScreen::~ChallengeLoadScreen");
  if (challengeDtorRange) {
    assertExact(errors, facts.challenge, "deleteBufferLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /delete\s+m_videoBuffer\s*;/),
      743, "ChallengeLoadScreen destructor delete m_videoBuffer");
    assertExact(errors, facts.challenge, "clearBufferLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      744, "ChallengeLoadScreen destructor clear m_videoBuffer");
    assertExact(errors, facts.challenge, "closeStreamLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_videoStream\s*->\s*close\s*\(\s*\)/),
      746, "ChallengeLoadScreen destructor close stream");
    assertExact(errors, facts.challenge, "clearStreamLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      747, "ChallengeLoadScreen destructor clear stream");
    assertExact(errors, facts.challenge, "deleteWindowVideoManagerLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /delete\s+m_wndVideoManager\s*;/),
      782, "ChallengeLoadScreen destructor delete m_wndVideoManager");
    assertExact(errors, facts.challenge, "clearWindowVideoManagerLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /m_wndVideoManager\s*=\s*NULL\s*;/),
      783, "ChallengeLoadScreen destructor clear m_wndVideoManager");
    assertExact(errors, facts.challenge, "removeAmbientLine",
      firstMatchInRange(loadScreen.lines, challengeDtorRange.start, challengeDtorRange.end,
        /TheAudio\s*->\s*removeAudioEvent\s*\(\s*m_ambientLoopHandle\s*\)/),
      785, "ChallengeLoadScreen destructor remove ambient loop");
  }

  const activateRange = assertFunctionRange(errors, facts.challenge, "activatePieces", loadScreen,
    /void\s+ChallengeLoadScreen\s*::\s*activatePieces\s*\(\s*Int\s+frame/,
    809, "ChallengeLoadScreen::activatePieces");
  if (activateRange) {
    assertExact(errors, facts.challenge, "portraitLeftMovieLine",
      firstMatchInRange(loadScreen.lines, activateRange.start, activateRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_portraitMovieLeft\s*,\s*generalPlayer\s*->\s*getPortraitMovieLeftName\s*\(\s*\)/),
      876, "ChallengeLoadScreen::activatePieces left portrait movie");
    assertExact(errors, facts.challenge, "portraitRightMovieLine",
      firstMatchInRange(loadScreen.lines, activateRange.start, activateRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_portraitMovieRight\s*,\s*generalOpponent\s*->\s*getPortraitMovieRightName\s*\(\s*\)/),
      877, "ChallengeLoadScreen::activatePieces right portrait movie");
    assertExact(errors, facts.challenge, "overlayVsMovieLine",
      firstMatchInRange(loadScreen.lines, activateRange.start, activateRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_overlayVs\s*,\s*AsciiString\s*\(\s*"VSSmall"\s*\)/),
      910, "ChallengeLoadScreen::activatePieces VS overlay movie");
  }

  const activateMinRange = assertFunctionRange(errors, facts.challenge, "activatePiecesMinSpec", loadScreen,
    /void\s+ChallengeLoadScreen\s*::\s*activatePiecesMinSpec\s*\(/,
    939, "ChallengeLoadScreen::activatePiecesMinSpec");
  if (activateMinRange) {
    assertExact(errors, facts.challenge, "minSpecOverlayVsMovieLine",
      firstMatchInRange(loadScreen.lines, activateMinRange.start, activateMinRange.end,
        /m_wndVideoManager\s*->\s*playMovie\s*\(\s*m_overlayVs\s*,\s*AsciiString\s*\(\s*"VSSmall"\s*\)/),
      978, "ChallengeLoadScreen::activatePiecesMinSpec VS overlay movie");
  }

  const challengeInitRange = assertFunctionRange(errors, facts.challenge, "init", loadScreen,
    /void\s+ChallengeLoadScreen\s*::\s*init\s*\(\s*GameInfo\s*\*\s*game\s*\)/,
    982, "ChallengeLoadScreen::init");
  if (challengeInitRange) {
    [
      ["campaignLine", /const\s+Campaign\s*\*\s*campaign\s*=\s*TheCampaignManager\s*->\s*getCurrentCampaign\s*\(\s*\)/, 984, "ChallengeLoadScreen::init current campaign"],
      ["missionLine", /const\s+Mission\s*\*\s*mission\s*=\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)/, 985, "ChallengeLoadScreen::init current mission"],
      ["playerGeneralLine", /getPlayerGeneralByCampaignName\s*\(\s*campaign\s*->\s*m_name\s*\)/, 988, "ChallengeLoadScreen::init player general"],
      ["opponentGeneralLine", /getGeneralByGeneralName\s*\(\s*mission\s*->\s*m_generalName\s*\)/, 992, "ChallengeLoadScreen::init opponent general"],
      ["layoutCreateLine", /winCreateFromScript\s*\(\s*AsciiString\s*\(\s*"Menus\/ChallengeLoadScreen\.wnd"\s*\)\s*\)/, 995, "ChallengeLoadScreen::init layout create"],
      ["progressBarLookupLine", /ChallengeLoadScreen\.wnd:ProgressLoad/, 1001, "ChallengeLoadScreen::init progress bar lookup"],
      ["ambientEventLine", /m_ambientLoop\s*\.\s*setEventName\s*\(\s*"LoadScreenAmbient"\s*\)/, 1005, "ChallengeLoadScreen::init ambient event"],
      ["videoOpenLine", /m_videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*TheCampaignManager\s*->\s*getCurrentMission\s*\(\s*\)\s*->\s*m_movieLabel\s*\)/, 1008, "ChallengeLoadScreen::init TheVideoPlayer->open mission movie"],
      ["createBufferLine", /m_videoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/, 1011, "ChallengeLoadScreen::init create video buffer"],
      ["allocateLine", /m_videoBuffer\s*==\s*NULL\s*\|\|\s*!m_videoBuffer\s*->\s*allocate\s*\(\s*m_videoStream\s*->\s*width\s*\(\s*\)\s*,\s*m_videoStream\s*->\s*height\s*\(\s*\)\s*\)/, 1012, "ChallengeLoadScreen::init allocate buffer"],
      ["allocateFailureDeleteBufferLine", /delete\s+m_videoBuffer\s*;/, 1014, "ChallengeLoadScreen::init allocation failure delete buffer"],
      ["allocateFailureCloseStreamLine", /m_videoStream\s*->\s*close\s*\(\s*\)/, 1018, "ChallengeLoadScreen::init allocation failure close stream"],
      ["allocateFailureReturnLine", /^\s*return\s*;/, 1021, "ChallengeLoadScreen::init allocation failure return"],
      ["portraitMovieLeftLookupLine", /ChallengeLoadScreen\.wnd:PortraitMovieLeft/, 1030, "ChallengeLoadScreen::init PortraitMovieLeft lookup"],
      ["portraitMovieRightLookupLine", /ChallengeLoadScreen\.wnd:PortraitMovieRight/, 1032, "ChallengeLoadScreen::init PortraitMovieRight lookup"],
      ["overlayVsLookupLine", /ChallengeLoadScreen\.wnd:OverlayVs/, 1049, "ChallengeLoadScreen::init OverlayVs lookup"],
      ["newWindowVideoManagerLine", /m_wndVideoManager\s*=\s*NEW\s+WindowVideoManager\s*;/, 1098, "ChallengeLoadScreen::init new WindowVideoManager"],
      ["windowVideoManagerInitLine", /m_wndVideoManager\s*->\s*init\s*\(\s*\)/, 1099, "ChallengeLoadScreen::init WindowVideoManager::init"],
    ].forEach(([key, pattern, expected, label]) =>
      assertExact(errors, facts.challenge, key,
        firstMatchInRange(loadScreen.lines, challengeInitRange.start, challengeInitRange.end, pattern),
        expected, label));

    const challengeLoopPrefix = orderedMatchesInRange(loadScreen.lines, 1101, 1120, [
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
      ["progressUpdateCountLine", challengeLoopPrefix[0], 1103, "ChallengeLoadScreen::init progress update count"],
      ["movieWhileLine", challengeLoopPrefix[1], 1105, "ChallengeLoadScreen::init movie while"],
      ["loopServiceWindowsLine", challengeLoopPrefix[2], 1107, "ChallengeLoadScreen::init serviceWindowsOS"],
      ["isFrameReadyLine", challengeLoopPrefix[3], 1109, "ChallengeLoadScreen::init isFrameReady"],
      ["sleepLine", challengeLoopPrefix[4], 1111, "ChallengeLoadScreen::init Sleep(1)"],
      ["inactiveCheckLine", challengeLoopPrefix[5], 1115, "ChallengeLoadScreen::init inactive check"],
      ["inactiveFrameNextLine", challengeLoopPrefix[6], 1117, "ChallengeLoadScreen::init inactive frameNext"],
      ["inactiveFrameDecompressLine", challengeLoopPrefix[7], 1118, "ChallengeLoadScreen::init inactive frameDecompress"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.challenge, key, actual, expected, label));

    const challengeActiveLoop = orderedMatchesInRange(loadScreen.lines, 1120, 1151, [
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
      ["frameDecompressLine", challengeActiveLoop[0], 1122, "ChallengeLoadScreen::init active frameDecompress"],
      ["frameRenderLine", challengeActiveLoop[1], 1123, "ChallengeLoadScreen::init active frameRender"],
      ["frameNextLine", challengeActiveLoop[2], 1124, "ChallengeLoadScreen::init active frameNext"],
      ["attachVideoBufferLine", challengeActiveLoop[3], 1127, "ChallengeLoadScreen::init attach video buffer"],
      ["frameVarLine", challengeActiveLoop[4], 1129, "ChallengeLoadScreen::init frame var"],
      ["windowUpdateLine", challengeActiveLoop[5], 1141, "ChallengeLoadScreen::init TheWindowManager->update"],
      ["activatePiecesLine", challengeActiveLoop[6], 1143, "ChallengeLoadScreen::init activatePieces"],
      ["windowVideoManagerUpdateLine", challengeActiveLoop[7], 1144, "ChallengeLoadScreen::init WindowVideoManager update"],
      ["displayDrawLine", challengeActiveLoop[8], 1147, "ChallengeLoadScreen::init display draw"],
      ["audioUpdateLine", challengeActiveLoop[9], 1149, "ChallengeLoadScreen::init audio update"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.challenge, key, actual, expected, label));

    const challengeMinSpec = orderedMatchesInRange(loadScreen.lines, 1152, 1183, [
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
      ["minSpecFrameGotoLine", challengeMinSpec[0], 1155, "ChallengeLoadScreen::init min-spec frameGoto"],
      ["minSpecWaitReadyLine", challengeMinSpec[1], 1156, "ChallengeLoadScreen::init min-spec wait ready"],
      ["minSpecFrameDecompressLine", challengeMinSpec[2], 1158, "ChallengeLoadScreen::init min-spec frameDecompress"],
      ["minSpecFrameRenderLine", challengeMinSpec[3], 1159, "ChallengeLoadScreen::init min-spec frameRender"],
      ["minSpecAttachBufferLine", challengeMinSpec[4], 1161, "ChallengeLoadScreen::init min-spec attach buffer"],
      ["minSpecActivatePiecesLine", challengeMinSpec[5], 1163, "ChallengeLoadScreen::init min-spec activate pieces"],
      ["minSpecWindowVideoManagerUpdateLine", challengeMinSpec[6], 1180, "ChallengeLoadScreen::init min-spec WindowVideoManager update"],
      ["minSpecWindowUpdateLine", challengeMinSpec[7], 1181, "ChallengeLoadScreen::init min-spec window update"],
      ["minSpecDisplayDrawLine", challengeMinSpec[8], 1182, "ChallengeLoadScreen::init min-spec display draw"],
    ].forEach(([key, actual, expected, label]) =>
      assertExact(errors, facts.challenge, key, actual, expected, label));

    assertExact(errors, facts.challenge, "setFPModeLine",
      firstMatchInRange(loadScreen.lines, 1183, challengeInitRange.end, /setFPMode\s*\(\s*\)/),
      1184, "ChallengeLoadScreen::init setFPMode");
    assertExact(errors, facts.challenge, "tauntAudioLine",
      firstMatchInRange(loadScreen.lines, 1183, challengeInitRange.end,
        /TheAudio\s*->\s*addAudioEvent\s*\(\s*&event\s*\)/),
      1188, "ChallengeLoadScreen::init opponent taunt audio");
    assertExact(errors, facts.challenge, "ambientAddLine",
      firstMatchInRange(loadScreen.lines, 1183, challengeInitRange.end,
        /m_ambientLoopHandle\s*=\s*TheAudio\s*->\s*addAudioEvent\s*\(\s*&m_ambientLoop\s*\)/),
      1190, "ChallengeLoadScreen::init ambient add");
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
	  assertExact(errors, facts.scoreScreen, "movieTestHookGuardLine",
	    lineNumber(scoreScreen.lines, (line) => /defined\s*\(\s*CNC_PORT_SCORE_SCREEN_MOVIE_TEST_HOOKS\s*\)/.test(line)),
	    161, "ScoreScreen.cpp focused movie test hook guard");
	  assertExact(errors, facts.scoreScreen, "movieTestHookSetLine",
	    lineNumber(scoreScreen.lines, (line) => /CncPortScoreScreenSetBlankLayoutForMovie\s*\(\s*WindowLayout\s*\*layout\s*\)/.test(line)),
	    162, "ScoreScreen.cpp focused blank layout setter hook");
	  assertExact(errors, facts.scoreScreen, "movieTestHookGetLine",
	    lineNumber(scoreScreen.lines, (line) => /CncPortScoreScreenGetBlankLayoutForMovie\s*\(\s*\)/.test(line)),
	    167, "ScoreScreen.cpp focused blank layout getter hook");

	  const scoreUpdateRange = assertFunctionRange(errors, facts.scoreScreen, "scoreUpdate", scoreScreen,
	    /void\s+ScoreScreenUpdate\s*\(\s*WindowLayout\s*\*\s*layout\s*,\s*void\s*\*\s*userData\s*\)/,
	    427, "ScoreScreenUpdate");
	  if (scoreUpdateRange) {
	    assertExact(errors, facts.scoreScreen, "finishSinglePlayerInitUpdateCallLine",
	      firstMatchInRange(scoreScreen.lines, scoreUpdateRange.start, scoreUpdateRange.end,
	        /finishSinglePlayerInit\s*\(\s*\)/),
	      438, "ScoreScreenUpdate finishSinglePlayerInit call");
	  }

	  const playMovieRange = assertFunctionRange(errors, facts.scoreScreen, "playMovieAndBlock", scoreScreen,
	    /void\s+PlayMovieAndBlock\s*\(\s*AsciiString\s+movieTitle\s*\)/,
	    697, "ScoreScreen PlayMovieAndBlock");
	  if (playMovieRange) {
	    [
	      ["videoOpenLine", /VideoStreamInterface\s*\*\s*videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*movieTitle\s*\)/, 699, "PlayMovieAndBlock TheVideoPlayer->open"],
	      ["nullStreamCheckLine", /if\s*\(\s*videoStream\s*==\s*NULL\s*\)/, 700, "PlayMovieAndBlock null stream check"],
	      ["nullStreamReturnLine", /^\s*return\s*;/, 702, "PlayMovieAndBlock null stream return"],
	      ["createBufferLine", /VideoBuffer\s*\*\s*videoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/, 706, "PlayMovieAndBlock create video buffer"],
	      ["allocateWidthLine", /videoBuffer\s*->\s*allocate\s*\(\s*videoStream\s*->\s*width\s*\(\s*\)/, 708, "PlayMovieAndBlock allocate width"],
	      ["allocateHeightLine", /videoStream\s*->\s*height\s*\(\s*\)/, 709, "PlayMovieAndBlock allocate height"],
	      ["allocateFailureDeleteBufferLine", /delete\s+videoBuffer\s*;/, 712, "PlayMovieAndBlock allocation failure delete buffer"],
	      ["allocateFailureCloseStreamLine", /videoStream\s*->\s*close\s*\(\s*\)/, 716, "PlayMovieAndBlock allocation failure close stream"],
	      ["movieWindowLine", /GameWindow\s*\*\s*movieWindow\s*=\s*s_blankLayout\s*->\s*getFirstWindow\s*\(\s*\)/, 722, "PlayMovieAndBlock blank layout first window"],
	      ["loadScreenRenderTrueLine", /TheWritableGlobalData\s*->\s*m_loadScreenRender\s*=\s*TRUE\s*;/, 723, "PlayMovieAndBlock loadScreenRender true"],
	    ].forEach(([key, pattern, expected, label]) =>
	      assertExact(errors, facts.scoreScreen, key,
	        firstMatchInRange(scoreScreen.lines, playMovieRange.start, playMovieRange.end, pattern),
	        expected, label));
	    assertExact(errors, facts.scoreScreen, "allocateFailureReturnLine",
	      firstMatchInRange(scoreScreen.lines, 711, 721, /^\s*return\s*;/),
	      719, "PlayMovieAndBlock allocation failure return");

	    const scoreLoopPrefix = orderedMatchesInRange(scoreScreen.lines, 724, 739, [
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
	      ["movieWhileLine", scoreLoopPrefix[0], 724, "PlayMovieAndBlock movie while"],
	      ["loopServiceWindowsLine", scoreLoopPrefix[1], 726, "PlayMovieAndBlock serviceWindowsOS"],
	      ["isFrameReadyLine", scoreLoopPrefix[2], 728, "PlayMovieAndBlock isFrameReady"],
	      ["sleepLine", scoreLoopPrefix[3], 730, "PlayMovieAndBlock Sleep(1)"],
	      ["inactiveCheckLine", scoreLoopPrefix[4], 734, "PlayMovieAndBlock inactive check"],
	      ["inactiveFrameNextLine", scoreLoopPrefix[5], 736, "PlayMovieAndBlock inactive frameNext"],
	      ["inactiveFrameDecompressLine", scoreLoopPrefix[6], 737, "PlayMovieAndBlock inactive frameDecompress"],
	    ].forEach(([key, actual, expected, label]) =>
	      assertExact(errors, facts.scoreScreen, key, actual, expected, label));

	    const scoreActiveLoop = orderedMatchesInRange(scoreScreen.lines, 741, 751, [
	      /^\s*videoStream\s*->\s*frameDecompress\s*\(\s*\)\s*;/,
	      /^\s*videoStream\s*->\s*frameRender\s*\(\s*videoBuffer\s*\)\s*;/,
	      /^\s*videoStream\s*->\s*frameNext\s*\(\s*\)\s*;/,
      /movieWindow\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*videoBuffer\s*\)/,
      /TheDisplay\s*->\s*draw\s*\(\s*\)/,
    ]);
	    facts.scoreScreen.movieActiveLoopLines = scoreActiveLoop;
	    assertOrdered(errors, "PlayMovieAndBlock active movie loop", scoreActiveLoop);
	    [
	      ["frameDecompressLine", scoreActiveLoop[0], 741, "PlayMovieAndBlock active frameDecompress"],
	      ["frameRenderLine", scoreActiveLoop[1], 742, "PlayMovieAndBlock active frameRender"],
	      ["frameNextLine", scoreActiveLoop[2], 743, "PlayMovieAndBlock active frameNext"],
	      ["attachVideoBufferLine", scoreActiveLoop[3], 746, "PlayMovieAndBlock attach video buffer"],
	      ["displayDrawLine", scoreActiveLoop[4], 750, "PlayMovieAndBlock display draw"],
	    ].forEach(([key, actual, expected, label]) =>
	      assertExact(errors, facts.scoreScreen, key, actual, expected, label));

	    [
	      ["loadScreenRenderFalseLine", /TheWritableGlobalData\s*->\s*m_loadScreenRender\s*=\s*FALSE\s*;/, 752, "PlayMovieAndBlock loadScreenRender false"],
	      ["detachVideoBufferLine", /movieWindow\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*NULL\s*\)/, 753, "PlayMovieAndBlock detach video buffer"],
	      ["deleteBufferLine", /delete\s+videoBuffer\s*;/, 756, "PlayMovieAndBlock delete video buffer"],
	      ["closeStreamLine", /videoStream\s*->\s*close\s*\(\s*\)/, 761, "PlayMovieAndBlock close stream"],
	      ["setFPModeLine", /setFPMode\s*\(\s*\)/, 765, "PlayMovieAndBlock setFPMode"],
	    ].forEach(([key, pattern, expected, label]) =>
	      assertExact(errors, facts.scoreScreen, key,
	        firstMatchInRange(scoreScreen.lines, 751, playMovieRange.end, pattern),
	        expected, label));
	  }

	  const initSingleRange = assertFunctionRange(errors, facts.scoreScreen, "initSinglePlayer", scoreScreen,
	    /void\s+initSinglePlayer\s*\(\s*void\s*\)/,
	    768, "ScoreScreen initSinglePlayer");
	  if (initSingleRange) {
	    [
	      ["needFinishLine", /s_needToFinishSinglePlayerInit\s*=\s*TRUE\s*;/, 774, "initSinglePlayer need finish flag"],
	      ["blankLayoutCreateLine", /s_blankLayout\s*=\s*TheWindowManager\s*->\s*winCreateLayout\s*\(\s*"Menus\/BlankWindow\.wnd"\s*\)/, 775, "initSinglePlayer blank layout create"],
	      ["blankLayoutHideLine", /s_blankLayout\s*->\s*hide\s*\(\s*FALSE\s*\)/, 777, "initSinglePlayer blank layout show"],
	      ["blankLayoutBringForwardLine", /s_blankLayout\s*->\s*bringForward\s*\(\s*\)/, 778, "initSinglePlayer blank layout bring forward"],
	      ["blankLayoutClearImageLine", /s_blankLayout\s*->\s*getFirstWindow\s*\(\s*\)\s*->\s*winClearStatus\s*\(\s*WIN_STATUS_IMAGE\s*\)/, 779, "initSinglePlayer blank layout first-window clear image"],
	    ].forEach(([key, pattern, expected, label]) =>
	      assertExact(errors, facts.scoreScreen, key,
	        firstMatchInRange(scoreScreen.lines, initSingleRange.start, initSingleRange.end, pattern),
        expected, label));
  }

	  const finishRange = assertFunctionRange(errors, facts.scoreScreen, "finishSinglePlayerInit", scoreScreen,
	    /void\s+finishSinglePlayerInit\s*\(\s*void\s*\)/,
	    798, "ScoreScreen finishSinglePlayerInit");
	  if (finishRange) {
	    [
	      ["victoryCheckLine", /if\s*\(\s*copyProtectOK\s*&&\s*TheCampaignManager\s*->\s*isVictorious\s*\(\s*\)\s*\)/, 804, "finishSinglePlayerInit victory check"],
	      ["finalVictoryMovieCheckLine", /campaign\s*->\s*getFinalVictoryMovie\s*\(\s*\)\s*\.\s*isNotEmpty\s*\(\s*\)/, 890, "finishSinglePlayerInit final victory movie check"],
	      ["finalVictoryMovieAssignLine", /vidName\s*=\s*campaign\s*->\s*getFinalVictoryMovie\s*\(\s*\)/, 893, "finishSinglePlayerInit final victory movie assign"],
	      ["useLowResInitLine", /Bool\s+useLowRes\s*=\s*FALSE\s*;/, 894, "finishSinglePlayerInit useLowRes init"],
	      ["memPassLowResLine", /TheGameLODManager\s*->\s*didMemPass\s*\(\s*\)/, 896, "finishSinglePlayerInit didMemPass low-res gate"],
	      ["staticFindLowResLine", /findStaticLODLevel\s*\(\s*\)\s*==\s*STATIC_GAME_LOD_LOW/, 899, "finishSinglePlayerInit findStaticLODLevel low-res gate"],
	      ["staticGetLowResLine", /getStaticLODLevel\s*\(\s*\)\s*==\s*STATIC_GAME_LOD_LOW/, 902, "finishSinglePlayerInit getStaticLODLevel low-res gate"],
	      ["playIfNotLowResLine", /if\s*\(\s*!useLowRes\s*\)/, 906, "finishSinglePlayerInit non-low-res gate"],
	      ["playMovieAndBlockCallLine", /PlayMovieAndBlock\s*\(\s*vidName\s*\)/, 907, "finishSinglePlayerInit PlayMovieAndBlock call"],
	      ["destroyBlankLayoutLine", /s_blankLayout\s*->\s*destroyWindows\s*\(\s*\)/, 950, "finishSinglePlayerInit destroy blank layout windows"],
	      ["deleteBlankLayoutLine", /s_blankLayout\s*->\s*deleteInstance\s*\(\s*\)/, 951, "finishSinglePlayerInit delete blank layout"],
	      ["clearBlankLayoutLine", /s_blankLayout\s*=\s*NULL\s*;/, 952, "finishSinglePlayerInit clear blank layout"],
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
	  // 7. Focused runtime proof that now exercises original
	  //    ScoreScreen::PlayMovieAndBlock and SinglePlayerLoadScreen::init
	  //    without pulling in the full finishSinglePlayerInit/campaign
	  //    dependency graph.
	  // ------------------------------------------------------------------
	  assertExact(errors, facts.runtimeScoreScreen, "hookDeclLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortScoreScreenSetBlankLayoutForMovie\s*\(\s*WindowLayout\s*\*layout\s*\)/.test(line)),
	    55, "runtime ScoreScreen blank layout hook declaration");
	  assertExact(errors, facts.runtimeScoreScreen, "drawOverrideLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /void\s+draw\s*\(\s*\)\s+override/.test(line)),
	    290, "runtime Display::draw override used by ScoreScreen");
	  assertExact(errors, facts.runtimeScoreScreen, "drawPresentLine",
	    firstMatchInRange(runtimeSmoke.lines, 309, 324,
	      /present_uploaded_video_buffer\s*\(\s*\*w3d_buffer/),
	    321, "runtime ScoreScreen draw override presents W3DVideoBuffer");
	  assertExact(errors, facts.runtimeScoreScreen, "exerciseDefLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /bool\s+exercise_score_screen_play_movie_and_block\s*\(\s*VideoPlayerInterface\s*&player\s*\)/.test(line)),
	    1166, "runtime ScoreScreen PlayMovieAndBlock exercise");
	  assertExact(errors, facts.runtimeScoreScreen, "winCreateLayoutLine",
	    firstMatchInRange(runtimeSmoke.lines, 1166, 1190,
	      /TheWindowManager\s*->\s*winCreateLayout\s*\(\s*AsciiString\s*\(\s*"Menus\/BlankWindow\.wnd"\s*\)\s*\)/),
	    1179, "runtime ScoreScreen exercise creates BlankWindow layout");
	  assertExact(errors, facts.runtimeScoreScreen, "hookInstallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortScoreScreenSetBlankLayoutForMovie\s*\(\s*layout\s*\)/.test(line)),
	    1197, "runtime ScoreScreen exercise installs blank layout hook");
	  assertExact(errors, facts.runtimeScoreScreen, "hookCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortScoreScreenGetBlankLayoutForMovie\s*\(\s*\)\s*==\s*layout/.test(line)),
	    1198, "runtime ScoreScreen exercise verifies blank layout hook");
	  assertExact(errors, facts.runtimeScoreScreen, "playMovieCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /PlayMovieAndBlock\s*\(\s*AsciiString\s*\(\s*"VS_small"\s*\)\s*\)/.test(line)),
	    1208, "runtime calls original PlayMovieAndBlock");
	  assertExact(errors, facts.runtimeScoreScreen, "serviceWindowsCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen::PlayMovieAndBlock did not service the OS once per presented frame/.test(line)),
	    1212, "runtime ScoreScreen serviceWindowsOS frame count check");
	  assertExact(errors, facts.runtimeScoreScreen, "presentFrameCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen::PlayMovieAndBlock did not present the expected VS_small frames/.test(line)),
	    1216, "runtime ScoreScreen 70-frame presentation count check");
	  assertExact(errors, facts.runtimeScoreScreen, "textureUpdateCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen::PlayMovieAndBlock did not upload the initial texture plus decoded frames/.test(line)),
	    1220, "runtime ScoreScreen texture update count check");
	  assertExact(errors, facts.runtimeScoreScreen, "drawCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen::PlayMovieAndBlock did not draw every decoded frame/.test(line)),
	    1224, "runtime ScoreScreen draw count check");
	  assertExact(errors, facts.runtimeScoreScreen, "detachCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen::PlayMovieAndBlock did not detach the movie VideoBuffer/.test(line)),
	    1226, "runtime ScoreScreen detaches movie VideoBuffer");
	  assertExact(errors, facts.runtimeScoreScreen, "closeStreamCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen::PlayMovieAndBlock did not close the owned Bink stream/.test(line)),
	    1230, "runtime ScoreScreen closes owned Bink stream");
	  assertExact(errors, facts.runtimeScoreScreen, "summaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen PlayMovieAndBlock VS_small Bink W3D presentation ok/.test(line)),
	    1241, "runtime ScoreScreen browser presentation summary");
	  assertExact(errors, facts.runtimeScoreScreen, "clearHookLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortScoreScreenSetBlankLayoutForMovie\s*\(\s*nullptr\s*\)/.test(line)),
	    1252, "runtime ScoreScreen clears blank layout hook");
	  assertExact(errors, facts.runtimeScoreScreen, "exerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_score_screen_play_movie_and_block\s*\(\s*\*player\s*\)/.test(line)),
	    1423, "runtime ScoreScreen exercise call");

	  assertExact(errors, facts.runtimeSinglePlayer, "hookDeclLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortLoadScreenSetSinglePlayerMovieForTest\s*\(\s*const\s+char\s+\*campaignName/.test(line)),
	    57, "runtime SinglePlayerLoadScreen movie hook declaration");
	  assertExact(errors, facts.runtimeSinglePlayer, "drawProbePresentLine",
	    firstMatchInRange(runtimeSmoke.lines, 292, 307,
	      /present_uploaded_video_buffer\s*\(\s*\*w3d_buffer,\s*112,\s*84,\s*208,\s*204/),
	    300, "runtime SinglePlayerLoadScreen draw probe presents W3DVideoBuffer");
	  assertExact(errors, facts.runtimeSinglePlayer, "scriptCreateLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /Menus\/SinglePlayerLoadScreen\.wnd/.test(line)),
	    448, "runtime SinglePlayerLoadScreen script layout gate");
	  assertExact(errors, facts.runtimeSinglePlayer, "exerciseDefLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /bool\s+exercise_single_player_load_screen_init\s*\(\s*VideoPlayerInterface\s*&player\s*\)/.test(line)),
	    1268, "runtime SinglePlayerLoadScreen init exercise");
	  assertExact(errors, facts.runtimeSinglePlayer, "hookSetLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortLoadScreenSetSinglePlayerMovieForTest\s*\(\s*"USA"\s*,\s*"VS_small"\s*\)/.test(line)),
	    1294, "runtime SinglePlayerLoadScreen installs VS_small movie hook");
	  assertExact(errors, facts.runtimeSinglePlayer, "initCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /load_screen\s*\.\s*init\s*\(\s*nullptr\s*\)/.test(line)),
	    1307, "runtime calls original SinglePlayerLoadScreen::init");
	  assertExact(errors, facts.runtimeSinglePlayer, "layoutCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not load SinglePlayerLoadScreen\.wnd/.test(line)),
	    1314, "runtime SinglePlayerLoadScreen layout check");
	  assertExact(errors, facts.runtimeSinglePlayer, "serviceWindowsCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not service the OS once per presented frame/.test(line)),
	    1318, "runtime SinglePlayerLoadScreen serviceWindowsOS frame count check");
	  assertExact(errors, facts.runtimeSinglePlayer, "presentFrameCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not present the expected VS_small frames/.test(line)),
	    1322, "runtime SinglePlayerLoadScreen 70-frame presentation check");
	  assertExact(errors, facts.runtimeSinglePlayer, "textureUpdateCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not upload the initial texture plus decoded frames/.test(line)),
	    1326, "runtime SinglePlayerLoadScreen texture update count check");
	  assertExact(errors, facts.runtimeSinglePlayer, "drawCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not draw every decoded frame/.test(line)),
	    1328, "runtime SinglePlayerLoadScreen draw count check");
	  assertExact(errors, facts.runtimeSinglePlayer, "detachCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not detach the load-screen VideoBuffer/.test(line)),
	    1330, "runtime SinglePlayerLoadScreen detaches load-screen VideoBuffer");
	  assertExact(errors, facts.runtimeSinglePlayer, "closeStreamCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not close the owned Bink stream/.test(line)),
	    1332, "runtime SinglePlayerLoadScreen closes owned Bink stream");
	  assertExact(errors, facts.runtimeSinglePlayer, "summaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen init VS_small Bink W3D presentation ok/.test(line)),
	    1343, "runtime SinglePlayerLoadScreen browser presentation summary");
	  assertExact(errors, facts.runtimeSinglePlayer, "releaseCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen destructor did not release the W3DVideoBuffer texture/.test(line)),
	    1358, "runtime SinglePlayerLoadScreen destructor texture release check");
	  assertExact(errors, facts.runtimeSinglePlayer, "exerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_single_player_load_screen_init\s*\(\s*\*player\s*\)/.test(line)),
	    1424, "runtime SinglePlayerLoadScreen exercise call");

	  assertExact(errors, facts.runtimeBrowserHarness, "copyCountLine",
	    lineNumber(runtimeBrowserHarness.lines,
	      (line) => /Expected one hundred forty-five Bink copy events/.test(line)),
	    402, "browser harness one-hundred-forty-five-copy event count check");
	  assertExact(errors, facts.runtimeBrowserHarness, "lifecycleCountLine",
	    lineNumber(runtimeBrowserHarness.lines,
	      (line) => /openCount\s*!==\s*7\s*\|\|\s*closeCount\s*!==\s*7\s*\|\|\s*copyCompleteCount\s*!==\s*145/.test(line)),
	    463, "browser harness seven open/close lifecycles with one hundred forty-five frame copies");
	  assertExact(errors, facts.runtimeBrowserHarness, "drawEventCountLine",
	    lineNumber(runtimeBrowserHarness.lines,
	      (line) => /Expected one hundred forty-five W3DDisplay::drawVideoBuffer indexed draws/.test(line)),
	    473, "browser harness one-hundred-forty-five W3DDisplay draw count check");

	  assertExact(errors, facts.cmake, "loadScreenRuntimeHookSourcePropertyLine",
	    lineNumber(cmake.lines,
	      (line) => /SOURCE\s+"\$\{GAMEENGINE_GAMECLIENT_DIR\}\/GUI\/LoadScreen\.cpp"/.test(line)),
	    3347, "CMake focused LoadScreen source hook property");
	  assertExact(errors, facts.cmake, "loadScreenRuntimeHookDefineLine",
	    lineNumber(cmake.lines,
	      (line) => /CNC_PORT_LOAD_SCREEN_MOVIE_TEST_HOOKS=1/.test(line)),
	    3348, "CMake focused LoadScreen hook define");

	  assertExact(errors, facts.cmake, "scoreScreenRuntimeTargetLine",
	    lineNumber(cmake.lines,
	      (line) => /add_library\s*\(\s*zh_score_screen_movie_runtime/.test(line)),
	    6520, "CMake ScoreScreen focused runtime target");
	  assertExact(errors, facts.cmake, "scoreScreenRuntimeSourceLine",
	    firstMatchInRange(cmake.lines, facts.cmake.scoreScreenRuntimeTargetLine, facts.cmake.scoreScreenRuntimeTargetLine + 5,
	      /ScoreScreen\.cpp/),
	    6521, "CMake ScoreScreen focused runtime source");
	  assertExact(errors, facts.cmake, "scoreScreenRuntimeHookDefineLine",
	    lineNumber(cmake.lines,
	      (line) => /CNC_PORT_SCORE_SCREEN_MOVIE_TEST_HOOKS=1/.test(line)),
	    6526, "CMake focused ScoreScreen hook define");
	  assertExact(errors, facts.cmake, "scoreScreenRuntimeLinkLine",
	    lineNumber(cmake.lines,
	      (line) => /zh_score_screen_movie_runtime/.test(line) && line.includes("zh_score_screen_movie_runtime")),
	    6520, "CMake ScoreScreen focused runtime target name");
	  assertExact(errors, facts.cmake, "scoreScreenRuntimeLinkedIntoSmokeLine",
	    firstMatchInRange(cmake.lines, 6584, 6588,
	      /zh_score_screen_movie_runtime/),
	    6585, "CMake bink smoke links focused ScoreScreen runtime");
	  assertExact(errors, facts.cmake, "scoreScreenRuntimeGcSectionsLine",
	    firstMatchInRange(cmake.lines, 6647, 6657,
	      /-Wl,--gc-sections/),
	    6655, "CMake bink smoke drops unused ScoreScreen sections");

	  // ------------------------------------------------------------------
	  // 8. Package script registration.
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
	    note: "Source-only LoadScreen/ScoreScreen Bink ownership verifier with focused runtime pins for original ScoreScreen::PlayMovieAndBlock and SinglePlayerLoadScreen::init. Full finishSinglePlayerInit/campaign ownership, ChallengeLoadScreen runtime ownership, InGameUI movies, and Bink/audio sync remain open until the broader GUI/game singleton path can be harness-driven.",
	  }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

main();
