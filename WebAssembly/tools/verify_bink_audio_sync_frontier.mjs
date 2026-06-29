#!/usr/bin/env node
// verify_bink_audio_sync_frontier.mjs
//
// Source-only verifier (it reads files, never executes the engine or wasm)
// for the original Bink *audio-sync* handoff frontier: the contract between
// the original Bink video player and the Miles Sound System / DirectSound
// audio device that any future browser Bink playback must preserve so that
// Bink video frames stay in lockstep with their audio track.
//
// On the original Win32/DirectSound build, Bink owns audio playback itself:
// `BinkSoundUseDirectSound` hands the running DirectSound object to the Bink
// decoder, Bink mixes its audio track into that DirectSound buffer per frame,
// and `BinkWait` (called from `BinkVideoStream::update`/`isFrameReady`) gates
// frame progression on the audio clock. The engine never schedules Bink audio
// itself; it only (a) hands the DirectSound handle to Bink once, (b) sets the
// per-track sound track count and volume, and (c) releases the handle on
// provider loss / shutdown.
//
// This verifier pins the *source* integration points that establish and tear
// down that handoff, so a future Web Audio / WebCodecs browser Bink path has a
// hard contract to keep satisfying:
//
//   1. BinkVideoPlayer::init() runs VideoPlayer::init() then
//      initializeBinkWithMiles().
//   2. BinkVideoPlayer::deinit() releases the audio Bink handle before
//      VideoPlayer::deinit().
//   3. BinkVideoPlayer::initializeBinkWithMiles() obtains the DirectSound
//      handle via TheAudio->getHandleForBink(), feeds it to
//      BinkSoundUseDirectSound(), and falls back to BinkSetSoundTrack(0,0)
//      when no driver / DirectSound is available (i.e. muted video).
//   4. BinkVideoPlayer::createStream() derives the per-stream volume from
//      TheAudio->getVolume(AudioAffect_Speech) and calls BinkSetVolume() on
//      the new HBINK.
//   5. BinkVideoPlayer::notifyVideoPlayerOfNewProvider() tears the handoff
//      down (releaseHandleForBink + BinkSetSoundTrack(0,0)) on provider loss,
//      and re-establishes it (initializeBinkWithMiles) on provider gain.
//   6. The abstract AudioManager contract (GameAudio.h) declares the pure
//      virtual getHandleForBink()/releaseHandleForBink() boundary, and
//      VideoPlayer.h declares the abstract notifyVideoPlayerOfNewProvider()
//      boundary.
//   7. MilesAudioManager owns the Bink handle: an m_binkHandle PlayingAudio
//      member, a destructor leak-assert + release, a getHandleForBink() that
//      allocates a "BinkHandle" PlayingAudio 2D sample and returns the Miles
//      DirectSound pointer via AIL_get_DirectSound_info, a releaseHandleForBink()
//      that releases + nulls it, and selectProvider()/unselectProvider() that
//      drive notifyVideoPlayerOfNewProvider(TRUE/FALSE).
//
// Open (NOT claimed complete by this verifier):
//   - Real runtime Bink audio playback / Web Audio scheduling.
//   - Per-frame audio-clock-driven frame progression (BinkWait) under a
//     browser audio backend.
//   - The actual DirectSound object that getHandleForBink() returns; the
//     browser must replace it with a Web Audio destination/handoff that
//     BinkSoundUseDirectSound's eventual browser shim can consume.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  binkPlayer:
    "GeneralsMD/Code/GameEngineDevice/Source/VideoDevice/Bink/BinkVideoPlayer.cpp",
  binkPlayerH:
    "GeneralsMD/Code/GameEngineDevice/Include/VideoDevice/Bink/BinkVideoPlayer.h",
  gameAudioH: "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  videoPlayerH: "GeneralsMD/Code/GameEngine/Include/GameClient/VideoPlayer.h",
  milesAudioManagerH:
    "GeneralsMD/Code/GameEngineDevice/Include/MilesAudioDevice/MilesAudioManager.h",
  milesAudioManager:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
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
    init: {},
    deinit: {},
    initializeBinkWithMiles: {},
    createStreamVolume: {},
    notifyProvider: {},
    abstractContract: {},
    milesOwnership: {},
    milesNotify: {},
  };

  const binkPlayer = readSourceLines(SOURCES.binkPlayer);
  const binkPlayerH = readSourceLines(SOURCES.binkPlayerH);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const videoPlayerH = readSourceLines(SOURCES.videoPlayerH);
  const milesAudioManagerH = readSourceLines(SOURCES.milesAudioManagerH);
  const milesAudioManager = readSourceLines(SOURCES.milesAudioManager);

  // ------------------------------------------------------------------
  // 1. BinkVideoPlayer::init() — VideoPlayer::init() then
  //    initializeBinkWithMiles().
  // ------------------------------------------------------------------
  const initDef = findFunctionDef(binkPlayer.lines,
    /void\s+BinkVideoPlayer\s*::\s*init\s*\(\s*void\s*\)/);
  assertExact(errors, facts.init, "defLine", initDef, 128,
    "BinkVideoPlayer::init");
  if (initDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, initDef);
    if (!range) {
      errors.push("BinkVideoPlayer::init: body not found");
    } else {
      const baseInit = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /VideoPlayer\s*::\s*init\s*\(\s*\)/);
      const initBink = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /initializeBinkWithMiles\s*\(\s*\)/);
      assertExact(errors, facts.init, "videoPlayerInitLine", baseInit, 131,
        "BinkVideoPlayer::init VideoPlayer::init()");
      assertExact(errors, facts.init, "initializeBinkWithMilesLine", initBink, 133,
        "BinkVideoPlayer::init initializeBinkWithMiles()");
      if (baseInit !== -1 && initBink !== -1 && !(baseInit < initBink)) {
        errors.push("BinkVideoPlayer::init: VideoPlayer::init() must precede initializeBinkWithMiles()");
      }
    }
  }

  // ------------------------------------------------------------------
  // 2. BinkVideoPlayer::deinit() — release Bink handle before base deinit.
  // ------------------------------------------------------------------
  const deinitDef = findFunctionDef(binkPlayer.lines,
    /void\s+BinkVideoPlayer\s*::\s*deinit\s*\(\s*void\s*\)/);
  assertExact(errors, facts.deinit, "defLine", deinitDef, 140,
    "BinkVideoPlayer::deinit");
  if (deinitDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, deinitDef);
    if (!range) {
      errors.push("BinkVideoPlayer::deinit: body not found");
    } else {
      const release = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /TheAudio\s*->\s*releaseHandleForBink\s*\(\s*\)/);
      const baseDeinit = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /VideoPlayer\s*::\s*deinit\s*\(\s*\)/);
      assertExact(errors, facts.deinit, "releaseHandleLine", release, 142,
        "BinkVideoPlayer::deinit TheAudio->releaseHandleForBink()");
      assertPresent(errors, facts.deinit, "videoPlayerDeinitLine", baseDeinit,
        "BinkVideoPlayer::deinit VideoPlayer::deinit()");
      if (release !== -1 && baseDeinit !== -1 && !(release < baseDeinit)) {
        errors.push("BinkVideoPlayer::deinit: releaseHandleForBink() must precede VideoPlayer::deinit()");
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. BinkVideoPlayer::initializeBinkWithMiles() — getHandleForBink ->
  //    BinkSoundUseDirectSound, with BinkSetSoundTrack(0,0) fallback.
  // ------------------------------------------------------------------
  const initBinkDef = findFunctionDef(binkPlayer.lines,
    /void\s+BinkVideoPlayer\s*::\s*initializeBinkWithMiles\s*\(\s*\)/);
  assertExact(errors, facts.initializeBinkWithMiles, "defLine", initBinkDef, 283,
    "BinkVideoPlayer::initializeBinkWithMiles");
  if (initBinkDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, initBinkDef);
    if (!range) {
      errors.push("BinkVideoPlayer::initializeBinkWithMiles: body not found");
    } else {
      const getHandle = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /TheAudio\s*->\s*getHandleForBink\s*\(\s*\)/);
      const useDS = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /\bBinkSoundUseDirectSound\s*\(/);
      const fallback = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /\bBinkSetSoundTrack\s*\(/);
      assertExact(errors, facts.initializeBinkWithMiles, "getHandleLine", getHandle, 286,
        "BinkVideoPlayer::initializeBinkWithMiles TheAudio->getHandleForBink()");
      assertExact(errors, facts.initializeBinkWithMiles, "binkSoundUseDirectSoundLine", useDS, 290,
        "BinkVideoPlayer::initializeBinkWithMiles BinkSoundUseDirectSound()");
      assertExact(errors, facts.initializeBinkWithMiles, "fallbackBinkSetSoundTrackLine", fallback, 294,
        "BinkVideoPlayer::initializeBinkWithMiles fallback BinkSetSoundTrack()");
      if (getHandle !== -1 && useDS !== -1 && !(getHandle < useDS)) {
        errors.push("BinkVideoPlayer::initializeBinkWithMiles: getHandleForBink() must precede BinkSoundUseDirectSound()");
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. BinkVideoPlayer::createStream() — Speech-volume-derived volume ->
  //    BinkSetVolume. (Re-pins the audio-relevant portion of createStream;
  //    the m_handle/ownership portion is already pinned by the callsite
  //    frontier verifier, so this stays scoped to the audio handoff.)
  // ------------------------------------------------------------------
  const createStreamDef = findFunctionDef(binkPlayer.lines,
    /VideoStreamInterface\s*\*\s*BinkVideoPlayer\s*::\s*createStream\s*\(\s*HBINK\s+handle\s*\)/);
  if (createStreamDef === -1) {
    errors.push("BinkVideoPlayer::createStream: definition not found");
  } else {
    const range = functionBodyLineRange(binkPlayer.lines, createStreamDef);
    if (!range) {
      errors.push("BinkVideoPlayer::createStream: body not found");
    } else {
      const speechVol = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /TheAudio\s*->\s*getVolume\s*\(\s*AudioAffect_Speech\s*\)/);
      const setVolume = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /\bBinkSetVolume\s*\(/);
      assertExact(errors, facts.createStreamVolume, "speechVolumeLine", speechVol, 206,
        "BinkVideoPlayer::createStream TheAudio->getVolume(AudioAffect_Speech)");
      assertExact(errors, facts.createStreamVolume, "binkSetVolumeLine", setVolume, 210,
        "BinkVideoPlayer::createStream BinkSetVolume()");
      if (speechVol !== -1 && setVolume !== -1 && !(speechVol < setVolume)) {
        errors.push("BinkVideoPlayer::createStream: getVolume(AudioAffect_Speech) must precede BinkSetVolume()");
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. BinkVideoPlayer::notifyVideoPlayerOfNewProvider() — tear-down on
  //    loss, re-establish on gain.
  // ------------------------------------------------------------------
  const notifyDef = findFunctionDef(binkPlayer.lines,
    /void\s+BinkVideoPlayer\s*::\s*notifyVideoPlayerOfNewProvider\s*\(\s*Bool\s+nowHasValid\s*\)/);
  assertExact(errors, facts.notifyProvider, "defLine", notifyDef, 271,
    "BinkVideoPlayer::notifyVideoPlayerOfNewProvider");
  if (notifyDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, notifyDef);
    if (!range) {
      errors.push("BinkVideoPlayer::notifyVideoPlayerOfNewProvider: body not found");
    } else {
      const release = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /TheAudio\s*->\s*releaseHandleForBink\s*\(\s*\)/);
      const muteTrack = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /\bBinkSetSoundTrack\s*\(/);
      const reinit = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /initializeBinkWithMiles\s*\(\s*\)/);
      assertExact(errors, facts.notifyProvider, "releaseHandleLine", release, 274,
        "notifyVideoPlayerOfNewProvider releaseHandleForBink()");
      assertExact(errors, facts.notifyProvider, "muteTrackLine", muteTrack, 275,
        "notifyVideoPlayerOfNewProvider BinkSetSoundTrack(0,0)");
      assertExact(errors, facts.notifyProvider, "reinitLine", reinit, 277,
        "notifyVideoPlayerOfNewProvider initializeBinkWithMiles()");
    }
  }

  // ------------------------------------------------------------------
  // 6. Abstract contract: AudioManager declares the pure virtual Bink
  //    handle boundary; VideoPlayer declares notifyVideoPlayerOfNewProvider.
  // ------------------------------------------------------------------
  assertExact(errors, facts.abstractContract, "audioGetHandleDeclLine",
    lineNumber(gameAudioH.lines,
      (line) => /virtual\s+void\s*\*\s*getHandleForBink\s*\(\s*void\s*\)\s*=\s*0/.test(line)), 241,
    "GameAudio.h pure virtual getHandleForBink()");
  assertExact(errors, facts.abstractContract, "audioReleaseHandleDeclLine",
    lineNumber(gameAudioH.lines,
      (line) => /virtual\s+void\s+releaseHandleForBink\s*\(\s*void\s*\)\s*=\s*0/.test(line)), 242,
    "GameAudio.h pure virtual releaseHandleForBink()");
  assertExact(errors, facts.abstractContract, "videoNotifyPureDeclLine",
    lineNumber(videoPlayerH.lines,
      (line) => /virtual\s+void\s+notifyVideoPlayerOfNewProvider\s*\(\s*Bool\s+nowHasValid\s*\)\s*=\s*0/.test(line)), 256,
    "VideoPlayer.h pure virtual notifyVideoPlayerOfNewProvider()");
  // The no-op default in the non-abstract base is the marker that the engine
  // tolerates a video player with no audio handoff (e.g. a stub player).
  assertPresent(errors, facts.abstractContract, "videoNotifyNoopDeclLine",
    lineNumber(videoPlayerH.lines,
      (line) => /virtual\s+void\s+notifyVideoPlayerOfNewProvider\s*\(\s*Bool\s+nowHasValid\s*\)\s*\{\s*\}/.test(line)),
    "VideoPlayer.h no-op notifyVideoPlayerOfNewProvider() default");

  // BinkVideoPlayer.h declares the concrete overrides used above.
  assertPresent(errors, facts.abstractContract, "binkNotifyDeclLine",
    lineNumber(binkPlayerH.lines,
      (line) => /virtual\s+void\s+notifyVideoPlayerOfNewProvider\s*\(\s*Bool\s+nowHasValid\s*\)/.test(line)),
    "BinkVideoPlayer.h notifyVideoPlayerOfNewProvider() declaration");
  assertPresent(errors, facts.abstractContract, "binkInitBinkDeclLine",
    lineNumber(binkPlayerH.lines,
      (line) => /virtual\s+void\s+initializeBinkWithMiles\s*\(\s*void\s*\)/.test(line)),
    "BinkVideoPlayer.h initializeBinkWithMiles() declaration");

  // ------------------------------------------------------------------
  // 7. MilesAudioManager owns the Bink handle.
  // ------------------------------------------------------------------
  // Member declaration.
  assertExact(errors, facts.milesOwnership, "memberDeclLine",
    lineNumber(milesAudioManagerH.lines,
      (line) => /PlayingAudio\s*\*\s*m_binkHandle\s*;/.test(line)), 321,
    "MilesAudioManager.h PlayingAudio m_binkHandle member");
  // Virtual override declarations next to each other.
  assertExact(errors, facts.milesOwnership, "getHandleDeclLine",
    lineNumber(milesAudioManagerH.lines,
      (line) => /virtual\s+void\s*\*\s*getHandleForBink\s*\(\s*void\s*\)/.test(line)), 189,
    "MilesAudioManager.h getHandleForBink() override");
  assertExact(errors, facts.milesOwnership, "releaseHandleDeclLine",
    lineNumber(milesAudioManagerH.lines,
      (line) => /virtual\s+void\s+releaseHandleForBink\s*\(\s*void\s*\)/.test(line)), 190,
    "MilesAudioManager.h releaseHandleForBink() override");

  // Destructor: leak-assert then release.
  assertExact(errors, facts.milesOwnership, "dtorAssertLine",
    lineNumber(milesAudioManager.lines,
      (line) => /DEBUG_ASSERTCRASH\s*\(\s*m_binkHandle\s*==\s*NULL/.test(line)), 107,
    "MilesAudioManager::~MilesAudioManager leak assert");
  assertExact(errors, facts.milesOwnership, "dtorReleaseLine",
    lineNumber(milesAudioManager.lines,
      (line, i) => i > 100 && i < 120 && /releaseHandleForBink\s*\(\s*\)/.test(line)), 108,
    "MilesAudioManager::~MilesAudioManager releaseHandleForBink()");
  // Constructor initializer list initializes m_binkHandle(NULL).
  assertExact(errors, facts.milesOwnership, "ctorInitLine",
    lineNumber(milesAudioManager.lines,
      (line) => /m_binkHandle\s*\(\s*NULL\s*\)/.test(line)), 97,
    "MilesAudioManager ctor m_binkHandle(NULL) initializer");

  // getHandleForBink: allocates a "BinkHandle" PlayingAudio 2D sample and
  // returns the Miles DirectSound pointer via AIL_get_DirectSound_info.
  const getHandleDef = findFunctionDef(milesAudioManager.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*getHandleForBink\s*\(\s*void\s*\)/);
  assertExact(errors, facts.milesOwnership, "getHandleDefLine", getHandleDef, 2963,
    "MilesAudioManager::getHandleForBink");
  if (getHandleDef > 0) {
    const range = functionBodyLineRange(milesAudioManager.lines, getHandleDef);
    if (!range) {
      errors.push("MilesAudioManager::getHandleForBink: body not found");
    } else {
      const alloc = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /allocatePlayingAudio\s*\(\s*\)/);
      const binkEvent = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /NEW\s+AudioEventRTS\s*\(\s*"BinkHandle"\s*\)/);
      const sample2d = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /getFirst2DSample\s*\(/);
      const assign = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /m_binkHandle\s*=\s*aud/);
      const dsInfo = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /\bAIL_get_DirectSound_info\s*\(/);
      assertExact(errors, facts.milesOwnership, "getHandleAllocLine", alloc, 2966,
        "MilesAudioManager::getHandleForBink allocatePlayingAudio()");
      assertExact(errors, facts.milesOwnership, "getHandleBinkEventLine", binkEvent, 2967,
        'MilesAudioManager::getHandleForBink NEW AudioEventRTS("BinkHandle")');
      assertExact(errors, facts.milesOwnership, "getHandleSampleLine", sample2d, 2969,
        "MilesAudioManager::getHandleForBink getFirst2DSample()");
      assertExact(errors, facts.milesOwnership, "getHandleAssignLine", assign, 2977,
        "MilesAudioManager::getHandleForBink m_binkHandle = aud");
      assertExact(errors, facts.milesOwnership, "getHandleDsInfoLine", dsInfo, 2981,
        "MilesAudioManager::getHandleForBink AIL_get_DirectSound_info()");
    }
  }

  // releaseHandleForBink: releases and nulls.
  const releaseDef = findFunctionDef(milesAudioManager.lines,
    /void\s+MilesAudioManager\s*::\s*releaseHandleForBink\s*\(\s*void\s*\)/);
  assertExact(errors, facts.milesOwnership, "releaseDefLine", releaseDef, 2986,
    "MilesAudioManager::releaseHandleForBink");
  if (releaseDef > 0) {
    const range = functionBodyLineRange(milesAudioManager.lines, releaseDef);
    if (!range) {
      errors.push("MilesAudioManager::releaseHandleForBink: body not found");
    } else {
      const rel = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /releasePlayingAudio\s*\(\s*m_binkHandle\s*\)/);
      const nul = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /m_binkHandle\s*=\s*NULL/);
      assertExact(errors, facts.milesOwnership, "releaseCallLine", rel, 2989,
        "MilesAudioManager::releaseHandleForBink releasePlayingAudio(m_binkHandle)");
      assertExact(errors, facts.milesOwnership, "releaseNullLine", nul, 2990,
        "MilesAudioManager::releaseHandleForBink m_binkHandle = NULL");
    }
  }

  // ------------------------------------------------------------------
  // 8. MilesAudioManager drives the handoff lifecycle: selectProvider and
  //    unselectProvider notify the video player of provider gain/loss.
  //    (Robust body searches, not exact line pins, since provider setup is
  //    a larger moving region.)
  // ------------------------------------------------------------------
  const selectDef = findFunctionDef(milesAudioManager.lines,
    /void\s+MilesAudioManager\s*::\s*selectProvider\s*\(\s*UnsignedInt\s+providerNdx\s*\)/);
  if (selectDef === -1) {
    errors.push("MilesAudioManager::selectProvider: definition not found");
  } else {
    const range = functionBodyLineRange(milesAudioManager.lines, selectDef);
    if (!range) {
      errors.push("MilesAudioManager::selectProvider: body not found");
    } else {
      const notify = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /TheVideoPlayer\s*->\s*notifyVideoPlayerOfNewProvider\s*\(\s*TRUE\s*\)/);
      assertExact(errors, facts.milesNotify, "selectNotifyLine", notify, 1756,
        "MilesAudioManager::selectProvider notifyVideoPlayerOfNewProvider(TRUE)");
    }
  }
  const unselectDef = findFunctionDef(milesAudioManager.lines,
    /void\s+MilesAudioManager\s*::\s*unselectProvider\s*\(\s*void\s*\)/);
  if (unselectDef === -1) {
    errors.push("MilesAudioManager::unselectProvider: definition not found");
  } else {
    const range = functionBodyLineRange(milesAudioManager.lines, unselectDef);
    if (!range) {
      errors.push("MilesAudioManager::unselectProvider: body not found");
    } else {
      const notify = firstMatchInRange(milesAudioManager.lines, range.start, range.end,
        /TheVideoPlayer\s*->\s*notifyVideoPlayerOfNewProvider\s*\(\s*FALSE\s*\)/);
      assertExact(errors, facts.milesNotify, "unselectNotifyLine", notify, 1769,
        "MilesAudioManager::unselectProvider notifyVideoPlayerOfNewProvider(FALSE)");
    }
  }

  // ------------------------------------------------------------------
  const report = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
    note:
      "Source-only verifier. Pins the original Bink audio-sync handoff " +
      "frontier (BinkVideoPlayer init/deinit/initializeBinkWithMiles/" +
      "createStream volume/notifyVideoPlayerOfNewProvider, the abstract " +
      "AudioManager + VideoPlayer Bink handle boundary, and MilesAudioManager " +
      "Bink handle ownership + provider-gain/loss lifecycle). It does NOT " +
      "claim runtime Bink audio playback, per-frame audio-clock frame " +
      "progression (BinkWait), or a Web Audio/DirectSound handoff complete; " +
      "those remain open M8 tasks.",
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
