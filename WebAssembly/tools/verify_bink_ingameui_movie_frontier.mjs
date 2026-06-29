#!/usr/bin/env node
// verify_bink_ingameui_movie_frontier.mjs
//
// Source-only verifier for the original InGameUI Bink movie ownership frontier.
// It reads repo files and never executes the engine or wasm.
//
// This is deliberately narrower than the existing runtime Bink/W3D browser smoke:
// the runtime smoke already proves decoded Bink sidecar pixels can flow through
// original BinkVideoStream::frameRender, W3DVideoBuffer upload, and
// W3DDisplay::drawVideoBuffer presentation for focused Display and
// WindowVideoManager ownership paths. Pulling InGameUI.cpp into that focused
// target currently brings in the broad ControlBar/GameLogic/ScriptEngine surface,
// so this verifier pins the original source contract until the real UI runtime
// dependencies are linkable.
//
// Pinned contract:
//   1. InGameUI.h declares the movie/cameo methods and stores the owning
//      VideoBuffer/VideoStreamInterface fields.
//   2. InGameUI::update keeps the original movie frame loop order:
//      isFrameReady -> frameDecompress -> frameRender(buffer) -> frameNext,
//      and stops the main movie when the frame index wraps to zero. The cameo
//      path uses the same frame operations but does not stop on wrap.
//   3. InGameUI::playMovie / stopMovie / videoBuffer own the main movie stream
//      and buffer through TheVideoPlayer and TheDisplay.
//   4. InGameUI::playCameoMovie / stopCameoMovie / cameoVideoBuffer own the
//      cameo stream and attach/detach its buffer to ControlBar.wnd:RightHUD.
//   5. Original callsites still route radar/objective movie playback through
//      TheInGameUI->playMovie and demo sound toggling through stopMovie.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  inGameUIH: "GeneralsMD/Code/GameEngine/Include/GameClient/InGameUI.h",
  inGameUI: "GeneralsMD/Code/GameEngine/Source/GameClient/InGameUI.cpp",
  commandXlat:
    "GeneralsMD/Code/GameEngine/Source/GameClient/MessageStream/CommandXlat.cpp",
  scriptActions:
    "GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp",
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
  return lineNumber(lines, (line) => defRe.test(line));
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
    constructor: {},
    update: {},
    playMovie: {},
    stopMovie: {},
    playCameoMovie: {},
    stopCameoMovie: {},
    callsites: {},
    packageJson: {},
  };

  const inGameUIH = readSourceLines(SOURCES.inGameUIH);
  const inGameUI = readSourceLines(SOURCES.inGameUI);
  const commandXlat = readSourceLines(SOURCES.commandXlat);
  const scriptActions = readSourceLines(SOURCES.scriptActions);
  const packageJson = readSourceLines(SOURCES.packageJson);

  assertExact(errors, facts.header, "playMovieDeclLine",
    lineNumber(inGameUIH.lines,
      (line) => /virtual\s+void\s+playMovie\s*\(\s*const\s+AsciiString&\s+movieName\s*\)\s*;/.test(line)),
    471, "InGameUI.h playMovie declaration");
  assertExact(errors, facts.header, "stopMovieDeclLine",
    lineNumber(inGameUIH.lines,
      (line) => /virtual\s+void\s+stopMovie\s*\(\s*void\s*\)\s*;/.test(line)),
    472, "InGameUI.h stopMovie declaration");
  assertExact(errors, facts.header, "videoBufferDeclLine",
    lineNumber(inGameUIH.lines,
      (line) => /virtual\s+VideoBuffer\s*\*\s*videoBuffer\s*\(\s*void\s*\)\s*;/.test(line)),
    473, "InGameUI.h videoBuffer declaration");
  assertExact(errors, facts.header, "playCameoMovieDeclLine",
    lineNumber(inGameUIH.lines,
      (line) => /virtual\s+void\s+playCameoMovie\s*\(\s*const\s+AsciiString&\s+movieName\s*\)\s*;/.test(line)),
    476, "InGameUI.h playCameoMovie declaration");
  assertExact(errors, facts.header, "stopCameoMovieDeclLine",
    lineNumber(inGameUIH.lines,
      (line) => /virtual\s+void\s+stopCameoMovie\s*\(\s*void\s*\)\s*;/.test(line)),
    477, "InGameUI.h stopCameoMovie declaration");
  assertExact(errors, facts.header, "cameoVideoBufferDeclLine",
    lineNumber(inGameUIH.lines,
      (line) => /virtual\s+VideoBuffer\s*\*\s*cameoVideoBuffer\s*\(\s*void\s*\)\s*;/.test(line)),
    478, "InGameUI.h cameoVideoBuffer declaration");
  assertExact(errors, facts.header, "movieBufferFieldLine",
    lineNumber(inGameUIH.lines,
      (line) => /VideoBuffer\s*\*\s*m_videoBuffer\s*;/.test(line)),
    737, "InGameUI.h m_videoBuffer field");
  assertExact(errors, facts.header, "movieStreamFieldLine",
    lineNumber(inGameUIH.lines,
      (line) => /VideoStreamInterface\s*\*\s*m_videoStream\s*;/.test(line)),
    738, "InGameUI.h m_videoStream field");
  assertExact(errors, facts.header, "cameoBufferFieldLine",
    lineNumber(inGameUIH.lines,
      (line) => /VideoBuffer\s*\*\s*m_cameoVideoBuffer\s*;/.test(line)),
    741, "InGameUI.h m_cameoVideoBuffer field");
  assertExact(errors, facts.header, "cameoStreamFieldLine",
    lineNumber(inGameUIH.lines,
      (line) => /VideoStreamInterface\s*\*\s*m_cameoVideoStream\s*;/.test(line)),
    742, "InGameUI.h m_cameoVideoStream field");

  const ctorRange = assertFunctionRange(errors, facts.constructor, "ctor", inGameUI,
    /InGameUI\s*::\s*InGameUI\s*\(\s*\)/, 896, "InGameUI::InGameUI");
  if (ctorRange) {
    assertExact(errors, facts.constructor, "movieStreamInitLine",
      firstMatchInRange(inGameUI.lines, ctorRange.start, ctorRange.end,
        /m_videoStream\s*=\s*NULL\s*;/),
      985, "InGameUI constructor m_videoStream init");
    assertExact(errors, facts.constructor, "movieBufferInitLine",
      firstMatchInRange(inGameUI.lines, ctorRange.start, ctorRange.end,
        /m_videoBuffer\s*=\s*NULL\s*;/),
      986, "InGameUI constructor m_videoBuffer init");
    assertExact(errors, facts.constructor, "cameoStreamInitLine",
      firstMatchInRange(inGameUI.lines, ctorRange.start, ctorRange.end,
        /m_cameoVideoStream\s*=\s*NULL\s*;/),
      987, "InGameUI constructor m_cameoVideoStream init");
    assertExact(errors, facts.constructor, "cameoBufferInitLine",
      firstMatchInRange(inGameUI.lines, ctorRange.start, ctorRange.end,
        /m_cameoVideoBuffer\s*=\s*NULL\s*;/),
      988, "InGameUI constructor m_cameoVideoBuffer init");
  }

  const updateRange = assertFunctionRange(errors, facts.update, "update", inGameUI,
    /void\s+InGameUI\s*::\s*update\s*\(\s*void\s*\)/, 1616, "InGameUI::update");
  if (updateRange) {
    const mainMovieLoop = orderedMatchesInRange(inGameUI.lines, updateRange.start, updateRange.end, [
      /if\s*\(\s*m_videoStream\s*&&\s*m_videoBuffer\s*\)/,
      /m_videoStream\s*->\s*isFrameReady\s*\(\s*\)/,
      /m_videoStream\s*->\s*frameDecompress\s*\(\s*\)/,
      /m_videoStream\s*->\s*frameRender\s*\(\s*m_videoBuffer\s*\)/,
      /m_videoStream\s*->\s*frameNext\s*\(\s*\)/,
      /m_videoStream\s*->\s*frameIndex\s*\(\s*\)\s*==\s*0/,
      /stopMovie\s*\(\s*\)/,
    ]);
    facts.update.mainMovieLoopLines = mainMovieLoop;
    assertOrdered(errors, "InGameUI::update main movie frame loop", mainMovieLoop);
    assertExact(errors, facts.update, "mainMovieGuardLine", mainMovieLoop[0], 1622,
      "InGameUI::update main movie guard");
    assertExact(errors, facts.update, "mainFrameReadyLine", mainMovieLoop[1], 1624,
      "InGameUI::update main movie isFrameReady");
    assertExact(errors, facts.update, "mainFrameDecompressLine", mainMovieLoop[2], 1626,
      "InGameUI::update main movie frameDecompress");
    assertExact(errors, facts.update, "mainFrameRenderLine", mainMovieLoop[3], 1627,
      "InGameUI::update main movie frameRender");
    assertExact(errors, facts.update, "mainFrameNextLine", mainMovieLoop[4], 1628,
      "InGameUI::update main movie frameNext");
    assertExact(errors, facts.update, "mainWrapCheckLine", mainMovieLoop[5], 1629,
      "InGameUI::update main movie wrap check");
    assertExact(errors, facts.update, "mainStopMovieLine", mainMovieLoop[6], 1631,
      "InGameUI::update main movie stopMovie on wrap");

    const cameoMovieLoop = orderedMatchesInRange(inGameUI.lines, updateRange.start, updateRange.end, [
      /if\s*\(\s*m_cameoVideoStream\s*&&\s*m_cameoVideoBuffer\s*\)/,
      /m_cameoVideoStream\s*->\s*isFrameReady\s*\(\s*\)/,
      /m_cameoVideoStream\s*->\s*frameDecompress\s*\(\s*\)/,
      /m_cameoVideoStream\s*->\s*frameRender\s*\(\s*m_cameoVideoBuffer\s*\)/,
      /m_cameoVideoStream\s*->\s*frameNext\s*\(\s*\)/,
    ]);
    facts.update.cameoMovieLoopLines = cameoMovieLoop;
    assertOrdered(errors, "InGameUI::update cameo movie frame loop", cameoMovieLoop);
    assertExact(errors, facts.update, "cameoGuardLine", cameoMovieLoop[0], 1636,
      "InGameUI::update cameo movie guard");
    assertExact(errors, facts.update, "cameoFrameReadyLine", cameoMovieLoop[1], 1638,
      "InGameUI::update cameo movie isFrameReady");
    assertExact(errors, facts.update, "cameoFrameDecompressLine", cameoMovieLoop[2], 1640,
      "InGameUI::update cameo movie frameDecompress");
    assertExact(errors, facts.update, "cameoFrameRenderLine", cameoMovieLoop[3], 1641,
      "InGameUI::update cameo movie frameRender");
    assertExact(errors, facts.update, "cameoFrameNextLine", cameoMovieLoop[4], 1642,
      "InGameUI::update cameo movie frameNext");
    assertExact(errors, facts.update, "cameoStopCommentLine",
      firstMatchInRange(inGameUI.lines, updateRange.start, updateRange.end,
        /\/\/\s*stopMovie\s*\(\s*\)\s*;/),
      1645, "InGameUI::update cameo stopMovie remains commented");
  }

  const playMovieRange = assertFunctionRange(errors, facts.playMovie, "playMovie", inGameUI,
    /void\s+InGameUI\s*::\s*playMovie\s*\(\s*const\s+AsciiString&\s+movieName\s*\)/,
    3898, "InGameUI::playMovie");
  if (playMovieRange) {
    const ordered = orderedMatchesInRange(inGameUI.lines, playMovieRange.start, playMovieRange.end, [
      /stopMovie\s*\(\s*\)/,
      /m_videoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*movieName\s*\)/,
      /m_currentlyPlayingMovie\s*=\s*movieName\s*;/,
      /m_videoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/,
      /m_videoBuffer\s*->\s*allocate\s*\(\s*m_videoStream\s*->\s*width\s*\(\s*\)/,
      /m_videoStream\s*->\s*height\s*\(\s*\)/,
      /stopMovie\s*\(\s*\)/,
    ]);
    facts.playMovie.orderedLines = ordered;
    assertOrdered(errors, "InGameUI::playMovie ownership path", ordered);
    assertExact(errors, facts.playMovie, "initialStopLine", ordered[0], 3901,
      "InGameUI::playMovie initial stopMovie");
    assertExact(errors, facts.playMovie, "openLine", ordered[1], 3903,
      "InGameUI::playMovie TheVideoPlayer open");
    assertExact(errors, facts.playMovie, "currentMovieLine", ordered[2], 3910,
      "InGameUI::playMovie current movie assignment");
    assertExact(errors, facts.playMovie, "createBufferLine", ordered[3], 3911,
      "InGameUI::playMovie TheDisplay createVideoBuffer");
    assertExact(errors, facts.playMovie, "allocateWidthLine", ordered[4], 3914,
      "InGameUI::playMovie VideoBuffer allocate width");
    assertExact(errors, facts.playMovie, "allocateHeightLine", ordered[5], 3915,
      "InGameUI::playMovie VideoBuffer allocate height");
    assertExact(errors, facts.playMovie, "failureStopLine", ordered[6], 3918,
      "InGameUI::playMovie stopMovie on allocation failure");
  }

  const stopMovieRange = assertFunctionRange(errors, facts.stopMovie, "stopMovie", inGameUI,
    /void\s+InGameUI\s*::\s*stopMovie\s*\(\s*void\s*\)/,
    3925, "InGameUI::stopMovie");
  if (stopMovieRange) {
    const ordered = orderedMatchesInRange(inGameUI.lines, stopMovieRange.start, stopMovieRange.end, [
      /delete\s+m_videoBuffer\s*;/,
      /m_videoBuffer\s*=\s*NULL\s*;/,
      /if\s*\(\s*m_videoStream\s*\)/,
      /m_videoStream\s*->\s*close\s*\(\s*\)/,
      /m_videoStream\s*=\s*NULL\s*;/,
      /m_currentlyPlayingMovie\s*=\s*AsciiString::TheEmptyString\s*;/,
    ]);
    facts.stopMovie.orderedLines = ordered;
    assertOrdered(errors, "InGameUI::stopMovie release path", ordered);
    assertExact(errors, facts.stopMovie, "deleteBufferLine", ordered[0], 3927,
      "InGameUI::stopMovie delete m_videoBuffer");
    assertExact(errors, facts.stopMovie, "clearBufferLine", ordered[1], 3928,
      "InGameUI::stopMovie clear m_videoBuffer");
    assertExact(errors, facts.stopMovie, "streamGuardLine", ordered[2], 3930,
      "InGameUI::stopMovie stream guard");
    assertExact(errors, facts.stopMovie, "streamCloseLine", ordered[3], 3932,
      "InGameUI::stopMovie stream close");
    assertExact(errors, facts.stopMovie, "clearStreamLine", ordered[4], 3933,
      "InGameUI::stopMovie clear stream");
    assertExact(errors, facts.stopMovie, "clearCurrentMovieLine", ordered[5], 3938,
      "InGameUI::stopMovie clear current movie");
  }
  const videoBufferRange = assertFunctionRange(errors, facts.stopMovie, "videoBuffer", inGameUI,
    /VideoBuffer\s*\*\s*InGameUI\s*::\s*videoBuffer\s*\(\s*void\s*\)/,
    3945, "InGameUI::videoBuffer");
  if (videoBufferRange) {
    assertExact(errors, facts.stopMovie, "videoBufferReturnLine",
      firstMatchInRange(inGameUI.lines, videoBufferRange.start, videoBufferRange.end,
        /return\s+m_videoBuffer\s*;/),
      3947, "InGameUI::videoBuffer returns m_videoBuffer");
  }

  const playCameoRange = assertFunctionRange(errors, facts.playCameoMovie, "playCameoMovie", inGameUI,
    /void\s+InGameUI\s*::\s*playCameoMovie\s*\(\s*const\s+AsciiString&\s+movieName\s*\)/,
    3953, "InGameUI::playCameoMovie");
  if (playCameoRange) {
    const ordered = orderedMatchesInRange(inGameUI.lines, playCameoRange.start, playCameoRange.end, [
      /stopCameoMovie\s*\(\s*\)/,
      /m_cameoVideoStream\s*=\s*TheVideoPlayer\s*->\s*open\s*\(\s*movieName\s*\)/,
      /m_cameoVideoBuffer\s*=\s*TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/,
      /m_cameoVideoBuffer\s*->\s*allocate\s*\(\s*m_cameoVideoStream\s*->\s*width\s*\(\s*\)/,
      /m_cameoVideoStream\s*->\s*height\s*\(\s*\)/,
      /TheWindowManager\s*->\s*winGetWindowFromId\s*\(\s*NULL\s*,\s*TheNameKeyGenerator\s*->\s*nameToKey\s*\(/,
      /winData\s*->\s*setVideoBuffer\s*\(\s*m_cameoVideoBuffer\s*\)/,
    ]);
    facts.playCameoMovie.orderedLines = ordered;
    assertOrdered(errors, "InGameUI::playCameoMovie ownership path", ordered);
    assertExact(errors, facts.playCameoMovie, "initialStopLine", ordered[0], 3956,
      "InGameUI::playCameoMovie initial stopCameoMovie");
    assertExact(errors, facts.playCameoMovie, "openLine", ordered[1], 3958,
      "InGameUI::playCameoMovie TheVideoPlayer open");
    assertExact(errors, facts.playCameoMovie, "createBufferLine", ordered[2], 3965,
      "InGameUI::playCameoMovie TheDisplay createVideoBuffer");
    assertExact(errors, facts.playCameoMovie, "allocateWidthLine", ordered[3], 3968,
      "InGameUI::playCameoMovie VideoBuffer allocate width");
    assertExact(errors, facts.playCameoMovie, "allocateHeightLine", ordered[4], 3969,
      "InGameUI::playCameoMovie VideoBuffer allocate height");
    assertExact(errors, facts.playCameoMovie, "rightHudLookupLine", ordered[5], 3975,
      "InGameUI::playCameoMovie RightHUD lookup");
    assertExact(errors, facts.playCameoMovie, "rightHudNameLine",
      firstMatchInRange(inGameUI.lines, playCameoRange.start, playCameoRange.end,
        /ControlBar\.wnd:RightHUD/),
      3975,
      "InGameUI::playCameoMovie RightHUD name");
    assertExact(errors, facts.playCameoMovie, "setVideoBufferLine", ordered[6], 3977,
      "InGameUI::playCameoMovie RightHUD setVideoBuffer");
  }

  const stopCameoRange = assertFunctionRange(errors, facts.stopCameoMovie, "stopCameoMovie", inGameUI,
    /void\s+InGameUI\s*::\s*stopCameoMovie\s*\(\s*void\s*\)/,
    3983, "InGameUI::stopCameoMovie");
  if (stopCameoRange) {
    const ordered = orderedMatchesInRange(inGameUI.lines, stopCameoRange.start, stopCameoRange.end, [
      /ControlBar\.wnd:RightHUD/,
      /winData\s*->\s*setVideoBuffer\s*\(\s*NULL\s*\)/,
      /delete\s+m_cameoVideoBuffer\s*;/,
      /m_cameoVideoBuffer\s*=\s*NULL\s*;/,
      /if\s*\(\s*m_cameoVideoStream\s*\)/,
      /m_cameoVideoStream\s*->\s*close\s*\(\s*\)/,
      /m_cameoVideoStream\s*=\s*NULL\s*;/,
    ]);
    facts.stopCameoMovie.orderedLines = ordered;
    assertOrdered(errors, "InGameUI::stopCameoMovie release path", ordered);
    assertExact(errors, facts.stopCameoMovie, "rightHudLookupLine", ordered[0], 3987,
      "InGameUI::stopCameoMovie RightHUD lookup");
    assertExact(errors, facts.stopCameoMovie, "clearWindowBufferLine", ordered[1], 3990,
      "InGameUI::stopCameoMovie RightHUD clear VideoBuffer");
    assertExact(errors, facts.stopCameoMovie, "deleteBufferLine", ordered[2], 3992,
      "InGameUI::stopCameoMovie delete buffer");
    assertExact(errors, facts.stopCameoMovie, "clearBufferLine", ordered[3], 3993,
      "InGameUI::stopCameoMovie clear buffer");
    assertExact(errors, facts.stopCameoMovie, "streamGuardLine", ordered[4], 3995,
      "InGameUI::stopCameoMovie stream guard");
    assertExact(errors, facts.stopCameoMovie, "streamCloseLine", ordered[5], 3997,
      "InGameUI::stopCameoMovie stream close");
    assertExact(errors, facts.stopCameoMovie, "clearStreamLine", ordered[6], 3998,
      "InGameUI::stopCameoMovie clear stream");
  }
  const cameoVideoBufferRange = assertFunctionRange(errors, facts.stopCameoMovie, "cameoVideoBuffer", inGameUI,
    /VideoBuffer\s*\*\s*InGameUI\s*::\s*cameoVideoBuffer\s*\(\s*void\s*\)/,
    4006, "InGameUI::cameoVideoBuffer");
  if (cameoVideoBufferRange) {
    assertExact(errors, facts.stopCameoMovie, "cameoVideoBufferReturnLine",
      firstMatchInRange(inGameUI.lines, cameoVideoBufferRange.start, cameoVideoBufferRange.end,
        /return\s+m_cameoVideoBuffer\s*;/),
      4008, "InGameUI::cameoVideoBuffer returns m_cameoVideoBuffer");
  }

  assertExact(errors, facts.callsites, "commandXlatDisplayStopLine",
    lineNumber(commandXlat.lines, (line) => /TheDisplay\s*->\s*stopMovie\s*\(\s*\)/.test(line)),
    4388, "CommandXlat demo sound toggle stops Display movie");
  assertExact(errors, facts.callsites, "commandXlatInGameUIStopLine",
    lineNumber(commandXlat.lines, (line) => /TheInGameUI\s*->\s*stopMovie\s*\(\s*\)/.test(line)),
    4389, "CommandXlat demo sound toggle stops InGameUI movie");
  assertExact(errors, facts.callsites, "commandXlatObjectiveMovieNameLine",
    lineNumber(commandXlat.lines, (line) => /name\.format\s*\(\s*"DemoObjective%02d"\s*,\s*m_objective\s*\)/.test(line)),
    4561, "CommandXlat objective movie name");
  assertExact(errors, facts.callsites, "commandXlatObjectiveMoviePlayLine",
    lineNumber(commandXlat.lines, (line) => /TheInGameUI\s*->\s*playMovie\s*\(\s*name\s*\)/.test(line)),
    4562, "CommandXlat objective movie InGameUI playMovie");
  assertExact(errors, facts.callsites, "scriptActionsFullScreenLine",
    lineNumber(scriptActions.lines, (line) => /TheDisplay\s*->\s*playMovie\s*\(\s*movieName\s*\)/.test(line)),
    2733, "ScriptActions full-screen movie uses Display::playMovie");
  assertExact(errors, facts.callsites, "scriptActionsRadarLine",
    lineNumber(scriptActions.lines, (line) => /TheInGameUI\s*->\s*playMovie\s*\(\s*movieName\s*\)/.test(line)),
    2741, "ScriptActions radar movie uses InGameUI::playMovie");

  assertPresent(errors, facts.packageJson, "scriptLine",
    lineNumber(packageJson.lines,
      (line) => /"verify:bink-ingameui-movie-frontier"\s*:/.test(line)),
    "package.json verify:bink-ingameui-movie-frontier script");

  const result = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
    note:
      "Source-only InGameUI movie ownership contract. Runtime InGameUI playback remains open until ControlBar/GameLogic/UI dependencies link in the focused browser smoke.",
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
