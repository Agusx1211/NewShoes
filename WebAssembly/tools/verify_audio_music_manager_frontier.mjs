#!/usr/bin/env node
// verify_audio_music_manager_frontier.mjs
//
// Source-checks the original *music playback / transition* frontier that a Web
// Audio backend must preserve: the Common/GameMusic + AudioManager + Miles
// device code paths that route a music AudioEventRTS into a streaming handle
// (distinct from SFX/voice sample playback), adjust its volume via the music
// bus, and drive next/previous/ambient/score/track transition + state queries.
//
// It reads (never executes) the original source/headers and emits a JSON
// report. This is the music-streaming companion to the other
// verify_audio_*_frontier.mjs verifiers. It pins source facts that matter for
// reproducing music behavior in a browser backend:
//   - MusicTrack (GameMusic.h) field/parse-table declaration surface and the
//     MusicManager play/stop/add/remove/fade entry points.
//   - GameMusic.cpp MusicTrack INI parse table (Filename/Volume/Ambient) and
//     the MusicManager methods that build AR_Play/AR_Stop AudioRequests for
//     music streams.
//   - AudioManager::addAudioEvent routing: AT_Music -> m_music->addAudioEvent,
//     everything else -> m_sound->addAudioEvent, plus the AT_Music isOn gate.
//   - AudioManager::setVolume AudioAffect_Music branch computing m_musicVolume
//     (the bus a Web Audio music gain node must mirror), distinct from
//     Sound/Sound3D/Speech.
//   - AudioManager next/prev/addTrackName track-list transition helpers and
//     the pure-virtual nextMusicTrack/prevMusicTrack/isMusicPlaying/
//     hasMusicTrackCompleted/getMusicTrackName surface.
//   - MilesAudioManager device side: adjustPlayingVolume ordering that shows
//     how music (PAT_Stream + AT_Music -> m_musicVolume) differs from samples
//     (PAT_Sample -> m_soundVolume), 3D samples (-> m_sound3DVolume) and
//     streaming speech (AT_Streaming -> m_speechVolume); the AT_Music stream
//     open path (AIL_open_stream + AIL_set_stream_volume_pan + playStream);
//     the next/prev/hasMusicTrackCompleted/getMusicTrackName implementations.
//   - The Music.ini parsing route: INI block table "MusicTrack" ->
//     INI::parseMusicTrackDefinition, which allocates an AudioEventInfo, tags
//     m_soundType = AT_Music, registers via addTrackName, and parses with
//     track->getFieldParse(); plus the AudioManager Music.ini loads.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  gameMusicH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameMusic.h",
  gameMusicCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameMusic.cpp",
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  milesAudioManagerCpp:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  iniAudioEventInfoCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/INI/INIAudioEventInfo.cpp",
  iniCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/INI/INI.cpp",
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

// Locate a top-level member function definition by matching its signature.
// Returns the 1-based line of the definition, or -1.
function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a definition line, scan the brace-balanced function body that follows.
// Returns { start, end } as 1-based line numbers of the body interior span
// (from the opening brace line to the closing brace line), or null.
function functionBodyLineRange(lines, definitionLine) {
  if (definitionLine <= 0) {
    return null;
  }

  let bodyStart = -1;
  let depth = 0;
  for (let i = definitionLine - 1; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
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
  for (
    let i = Math.max(startLine - 1, 0);
    i < endLine && i < lines.length;
    i++
  ) {
    if (re.test(lines[i])) return i + 1;
  }
  return -1;
}

// Verify a sequence of source-order anchors within a body, recording positions
// and emitting an error if any is missing or out of order relative to the
// previous anchor.
function checkOrderedAnchors(lines, range, anchors, errors, facts, factsKey) {
  const positions = {};
  let prevLine = -1;
  let prevKey = null;
  for (const { key, re } of anchors) {
    const ln = range
      ? firstMatchInRange(lines, range.start, range.end, re)
      : -1;
    positions[key] = ln;
    if (ln === -1) {
      errors.push(`${factsKey}: expected anchor ${key} not found in body`);
    } else if (prevLine !== -1 && !(prevLine < ln)) {
      errors.push(
        `${factsKey}: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
      );
    }
    prevLine = ln;
    prevKey = key;
  }
  facts[factsKey] = positions;
}

function main() {
  const errors = [];
  const facts = {};

  const gameMusicH = readSourceLines(SOURCES.gameMusicH);
  const gameMusicCpp = readSourceLines(SOURCES.gameMusicCpp);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const gameAudioCpp = readSourceLines(SOURCES.gameAudioCpp);
  const milesCpp = readSourceLines(SOURCES.milesAudioManagerCpp);
  const iniAudioEventInfoCpp = readSourceLines(SOURCES.iniAudioEventInfoCpp);
  const iniCpp = readSourceLines(SOURCES.iniCpp);

  // =====================================================================
  // GameMusic.h: MusicTrack declaration surface
  // =====================================================================
  const musicTrackFields = [
    { key: "index", line: 90, re: /\bInt\s+index\s*;/ },
    { key: "name", line: 91, re: /\bAsciiString\s+name\s*;/ },
    { key: "filename", line: 92, re: /\bAsciiString\s+filename\s*;/ },
    { key: "volume", line: 93, re: /\bReal\s+volume\s*;/ },
    { key: "ambient", line: 94, re: /\bBool\s+ambient\s*;/ },
    { key: "next", line: 96, re: /\bMusicTrack\s*\*\s*next\s*;/ },
    { key: "prev", line: 97, re: /\bMusicTrack\s*\*\s*prev\s*;/ },
    {
      key: "m_musicTrackFieldParseTable",
      line: 99,
      re: /\bm_musicTrackFieldParseTable\s*\[\s*\]/,
    },
  ];
  const trackFieldFacts = {};
  for (const { key, line, re } of musicTrackFields) {
    const ln = lineNumber(gameMusicH.lines, (candidate) => re.test(candidate));
    trackFieldFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `GameMusic.h MusicTrack ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.musicTrackFields = trackFieldFacts;

  // GameMusic.h: MusicManager method declaration surface
  const musicManagerMethods = [
    {
      key: "MusicManagerCtor",
      line: 106,
      re: /\bMusicManager\s*\(\s*\)/,
    },
    {
      key: "playTrack",
      line: 109,
      re: /\bvoid\s+playTrack\s*\(\s*AudioEventRTS\s*\*/,
    },
    {
      key: "stopTrack",
      line: 110,
      re: /\bvoid\s+stopTrack\s*\(\s*AudioHandle\b/,
    },
    {
      key: "addAudioEvent",
      line: 112,
      re: /\bvoid\s+addAudioEvent\s*\(\s*AudioEventRTS\s*\*/,
    },
    {
      key: "removeAudioEvent",
      line: 113,
      re: /\bvoid\s+removeAudioEvent\s*\(\s*AudioHandle\b/,
    },
    {
      key: "setVolume",
      line: 115,
      re: /\bvoid\s+setVolume\s*\(\s*Real\b/,
    },
  ];
  const managerMethodFacts = {};
  for (const { key, line, re } of musicManagerMethods) {
    const ln = lineNumber(gameMusicH.lines, (candidate) => re.test(candidate));
    managerMethodFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `GameMusic.h MusicManager ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.musicManagerDeclarations = managerMethodFacts;

  // =====================================================================
  // GameMusic.cpp: MUSIC_PATH define
  // =====================================================================
  const musicPathLine = lineNumber(gameMusicCpp.lines, (line) =>
    /#define\s+MUSIC_PATH\s+"/.test(line),
  );
  facts.musicPathDefineLine = musicPathLine;
  if (musicPathLine !== 69) {
    errors.push(
      `GameMusic.cpp MUSIC_PATH define expected at line 69 but found at ${musicPathLine}`,
    );
  }

  // =====================================================================
  // GameMusic.cpp: MusicTrack parse table (Filename/Volume/Ambient, in order)
  // =====================================================================
  const musicTrackTableLine = lineNumber(gameMusicCpp.lines, (line) =>
    /MusicTrack\s*::\s*m_musicTrackFieldParseTable\s*\[\s*\]/.test(line),
  );
  facts.musicTrackFieldParseTableDefLine = musicTrackTableLine;
  if (musicTrackTableLine !== 79) {
    errors.push(
      `GameMusic.cpp MusicTrack::m_musicTrackFieldParseTable expected at line 79 but found at ${musicTrackTableLine}`,
    );
  }

  const parseEntries = [
    {
      key: "Filename",
      line: 82,
      re: /"\s*Filename\s*"\s*,\s*INI::parseAsciiString.*offsetof\s*\(\s*MusicTrack\s*,\s*filename\s*\)/,
    },
    {
      key: "Volume",
      line: 83,
      re: /"\s*Volume\s*"\s*,\s*INI::parsePercentToReal.*offsetof\s*\(\s*MusicTrack\s*,\s*volume\s*\)/,
    },
    {
      key: "Ambient",
      line: 84,
      re: /"\s*Ambient\s*"\s*,\s*INI::parseBool.*offsetof\s*\(\s*MusicTrack\s*,\s*ambient\s*\)/,
    },
  ];
  const parseFacts = {};
  let prevParseLine = -1;
  let prevParseKey = null;
  for (const { key, line, re } of parseEntries) {
    const ln = lineNumber(gameMusicCpp.lines, (candidate) => re.test(candidate));
    parseFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `GameMusic.cpp MusicTrack "${key}" entry expected at line ${line} but found at ${ln}`,
      );
    } else if (prevParseLine !== -1 && !(prevParseLine < ln)) {
      errors.push(
        `GameMusic.cpp MusicTrack "${key}" (line ${ln}) must come after "${prevParseKey}" (line ${prevParseLine})`,
      );
    }
    prevParseLine = ln;
    prevParseKey = key;
  }
  facts.musicTrackParseEntries = parseFacts;

  // =====================================================================
  // GameMusic.cpp: MusicManager method definitions + bodies
  // =====================================================================

  // playTrack: builds AR_Play request and appends it.
  const playTrackLine = findMemberDef(
    gameMusicCpp.lines,
    /void\s+MusicManager\s*::\s*playTrack\s*\(/,
  );
  facts.musicManagerPlayTrackDefLine = playTrackLine;
  if (playTrackLine !== 102) {
    errors.push(
      `MusicManager::playTrack expected at line 102 but found at ${playTrackLine}`,
    );
  }
  if (playTrackLine > 0) {
    const range = functionBodyLineRange(gameMusicCpp.lines, playTrackLine);
    if (!range) {
      errors.push("MusicManager::playTrack: function body not found");
    }
    checkOrderedAnchors(
      gameMusicCpp.lines,
      range,
      [
        { key: "allocateAudioRequest_true", re: /allocateAudioRequest\s*\(\s*true\s*\)/ },
        { key: "m_pendingEvent_assign", re: /\bm_pendingEvent\s*=/ },
        { key: "AR_Play", re: /\bm_request\s*=\s*AR_Play\b/ },
        { key: "appendAudioRequest", re: /\bappendAudioRequest\s*\(/ },
      ],
      errors,
      facts,
      "MusicManager::playTrack",
    );
  }

  // stopTrack: builds AR_Stop request for a handle.
  const stopTrackLine = findMemberDef(
    gameMusicCpp.lines,
    /void\s+MusicManager\s*::\s*stopTrack\s*\(/,
  );
  facts.musicManagerStopTrackDefLine = stopTrackLine;
  if (stopTrackLine !== 111) {
    errors.push(
      `MusicManager::stopTrack expected at line 111 but found at ${stopTrackLine}`,
    );
  }
  if (stopTrackLine > 0) {
    const range = functionBodyLineRange(gameMusicCpp.lines, stopTrackLine);
    if (!range) {
      errors.push("MusicManager::stopTrack: function body not found");
    }
    checkOrderedAnchors(
      gameMusicCpp.lines,
      range,
      [
        { key: "allocateAudioRequest_false", re: /allocateAudioRequest\s*\(\s*false\s*\)/ },
        { key: "m_handleToInteractOn_assign", re: /\bm_handleToInteractOn\s*=/ },
        { key: "AR_Stop", re: /\bm_request\s*=\s*AR_Stop\b/ },
        { key: "appendAudioRequest", re: /\bappendAudioRequest\s*\(/ },
      ],
      errors,
      facts,
      "MusicManager::stopTrack",
    );
  }

  // addAudioEvent: delegates to playTrack.
  const addAudioEventLine = findMemberDef(
    gameMusicCpp.lines,
    /void\s+MusicManager\s*::\s*addAudioEvent\s*\(/,
  );
  facts.musicManagerAddAudioEventDefLine = addAudioEventLine;
  if (addAudioEventLine !== 120) {
    errors.push(
      `MusicManager::addAudioEvent expected at line 120 but found at ${addAudioEventLine}`,
    );
  }
  if (addAudioEventLine > 0) {
    const range = functionBodyLineRange(gameMusicCpp.lines, addAudioEventLine);
    if (!range) {
      errors.push("MusicManager::addAudioEvent: function body not found");
    }
    const playTrackCall = range
      ? firstMatchInRange(gameMusicCpp.lines, range.start, range.end, /\bplayTrack\s*\(/)
      : -1;
    facts["MusicManager::addAudioEvent"] = { playTrackCall };
    if (playTrackCall === -1) {
      errors.push(
        "MusicManager::addAudioEvent: playTrack(...) delegation not found in body",
      );
    }
  }

  // removeAudioEvent: delegates to stopTrack.
  const removeAudioEventLine = findMemberDef(
    gameMusicCpp.lines,
    /void\s+MusicManager\s*::\s*removeAudioEvent\s*\(/,
  );
  facts.musicManagerRemoveAudioEventDefLine = removeAudioEventLine;
  if (removeAudioEventLine !== 126) {
    errors.push(
      `MusicManager::removeAudioEvent expected at line 126 but found at ${removeAudioEventLine}`,
    );
  }
  if (removeAudioEventLine > 0) {
    const range = functionBodyLineRange(
      gameMusicCpp.lines,
      removeAudioEventLine,
    );
    if (!range) {
      errors.push("MusicManager::removeAudioEvent: function body not found");
    }
    const stopTrackCall = range
      ? firstMatchInRange(gameMusicCpp.lines, range.start, range.end, /\bstopTrack\s*\(/)
      : -1;
    facts["MusicManager::removeAudioEvent"] = { stopTrackCall };
    if (stopTrackCall === -1) {
      errors.push(
        "MusicManager::removeAudioEvent: stopTrack(...) delegation not found in body",
      );
    }
  }

  // =====================================================================
  // GameAudio.cpp: AudioManager::addAudioEvent routing (AT_Music -> m_music)
  // =====================================================================
  const addAudioEventCppLine = findMemberDef(
    gameAudioCpp.lines,
    /AudioHandle\s+AudioManager\s*::\s*addAudioEvent\s*\(/,
  );
  facts.audioManagerAddAudioEventDefLine = addAudioEventCppLine;
  if (addAudioEventCppLine !== 414) {
    errors.push(
      `AudioManager::addAudioEvent expected at line 414 but found at ${addAudioEventCppLine}`,
    );
  }
  if (addAudioEventCppLine > 0) {
    const range = functionBodyLineRange(gameAudioCpp.lines, addAudioEventCppLine);
    if (!range) {
      errors.push("AudioManager::addAudioEvent: function body not found");
    }
    // The AT_Music case gate inside the isOn switch must precede the routing
    // branch that sends music to m_music and everything else to m_sound.
    checkOrderedAnchors(
      gameAudioCpp.lines,
      range,
      [
        { key: "case_AT_Music", re: /\bcase\s+AT_Music\s*:/ },
        { key: "isOn_AudioAffect_Music", re: /isOn\s*\(\s*AudioAffect_Music\s*\)/ },
        { key: "AT_Music_routing_test", re: /\btype\s*==\s*AT_Music\b/ },
        { key: "m_music_addAudioEvent", re: /\bm_music\s*->\s*addAudioEvent\s*\(/ },
        { key: "m_sound_addAudioEvent", re: /\bm_sound\s*->\s*addAudioEvent\s*\(/ },
      ],
      errors,
      facts,
      "AudioManager::addAudioEvent",
    );
  }

  // =====================================================================
  // GameAudio.cpp: AudioManager::setVolume (music bus = m_musicVolume)
  // =====================================================================
  const setVolumeLine = findMemberDef(
    gameAudioCpp.lines,
    /void\s+AudioManager\s*::\s*setVolume\s*\(\s*Real\s+volume,\s*AudioAffect/,
  );
  facts.audioManagerSetVolumeDefLine = setVolumeLine;
  if (setVolumeLine !== 714) {
    errors.push(
      `AudioManager::setVolume expected at line 714 but found at ${setVolumeLine}`,
    );
  }
  if (setVolumeLine > 0) {
    const range = functionBodyLineRange(gameAudioCpp.lines, setVolumeLine);
    if (!range) {
      errors.push("AudioManager::setVolume: function body not found");
    }
    // Music bus is computed first and distinct from Sound/Sound3D/Speech.
    checkOrderedAnchors(
      gameAudioCpp.lines,
      range,
      [
        { key: "AudioAffect_Music", re: /AudioAffect_Music/ },
        { key: "m_musicVolume_assign", re: /\bm_musicVolume\s*=\s*m_scriptMusicVolume\s*\*\s*m_systemMusicVolume/ },
        { key: "AudioAffect_Sound", re: /AudioAffect_Sound\b/ },
        { key: "m_soundVolume_assign", re: /\bm_soundVolume\s*=\s*m_scriptSoundVolume\s*\*\s*m_systemSoundVolume/ },
        { key: "AudioAffect_Speech", re: /AudioAffect_Speech\b/ },
        { key: "m_speechVolume_assign", re: /\bm_speechVolume\s*=\s*m_scriptSpeechVolume\s*\*\s*m_systemSpeechVolume/ },
      ],
      errors,
      facts,
      "AudioManager::setVolume",
    );
  }

  // =====================================================================
  // GameAudio.cpp: track-list helpers + Music.ini loads
  // =====================================================================
  const addTrackNameLine = findMemberDef(
    gameAudioCpp.lines,
    /void\s+AudioManager\s*::\s*addTrackName\s*\(/,
  );
  facts.audioManagerAddTrackNameDefLine = addTrackNameLine;
  if (addTrackNameLine !== 527) {
    errors.push(
      `AudioManager::addTrackName expected at line 527 but found at ${addTrackNameLine}`,
    );
  }
  const nextTrackNameLine = findMemberDef(
    gameAudioCpp.lines,
    /AsciiString\s+AudioManager\s*::\s*nextTrackName\s*\(/,
  );
  facts.audioManagerNextTrackNameDefLine = nextTrackNameLine;
  if (nextTrackNameLine !== 533) {
    errors.push(
      `AudioManager::nextTrackName expected at line 533 but found at ${nextTrackNameLine}`,
    );
  }
  const prevTrackNameLine = findMemberDef(
    gameAudioCpp.lines,
    /AsciiString\s+AudioManager\s*::\s*prevTrackName\s*\(/,
  );
  facts.audioManagerPrevTrackNameDefLine = prevTrackNameLine;
  if (prevTrackNameLine !== 557) {
    errors.push(
      `AudioManager::prevTrackName expected at line 557 but found at ${prevTrackNameLine}`,
    );
  }

  // The C++ string literals contain double-backslash path separators, so the
  // regex must match two literal backslashes per separator.
  const musicIniDefaultLine = lineNumber(gameAudioCpp.lines, (line) =>
    /Data\\\\INI\\\\Default\\\\Music\.ini/.test(line),
  );
  const musicIniLine = lineNumber(gameAudioCpp.lines, (line) =>
    /Data\\\\INI\\\\Music\.ini/.test(line),
  );
  facts.musicIniLoadLines = {
    defaultMusicIni: musicIniDefaultLine,
    musicIni: musicIniLine,
  };
  if (musicIniDefaultLine !== 221) {
    errors.push(
      `GameAudio.cpp Default/Music.ini load expected at line 221 but found at ${musicIniDefaultLine}`,
    );
  }
  if (musicIniLine !== 222) {
    errors.push(
      `GameAudio.cpp Music.ini load expected at line 222 but found at ${musicIniLine}`,
    );
  }

  // =====================================================================
  // GameAudio.h: music surface declarations
  // =====================================================================
  const gameAudioHMusicDecl = [
    { key: "addTrackName", line: 168, re: /\bvoid\s+addTrackName\s*\(\s*const\s+AsciiString/ },
    { key: "nextTrackName", line: 169, re: /\bAsciiString\s+nextTrackName\s*\(/ },
    { key: "prevTrackName", line: 170, re: /\bAsciiString\s+prevTrackName\s*\(/ },
    { key: "nextMusicTrack", line: 173, re: /\bvoid\s+nextMusicTrack\s*\(\s*void\s*\)\s*=\s*0/ },
    { key: "prevMusicTrack", line: 174, re: /\bvoid\s+prevMusicTrack\s*\(\s*void\s*\)\s*=\s*0/ },
    { key: "isMusicPlaying", line: 175, re: /\bBool\s+isMusicPlaying\s*\(\s*void\s*\)\s*const\s*=\s*0/ },
    {
      key: "hasMusicTrackCompleted",
      line: 176,
      re: /\bBool\s+hasMusicTrackCompleted\s*\(\s*const\s+AsciiString&\s+trackName,\s*Int\s+numberOfTimes\s*\)/,
    },
    {
      key: "getMusicTrackName",
      line: 177,
      re: /\bAsciiString\s+getMusicTrackName\s*\(\s*void\s*\)\s*const\s*=\s*0/,
    },
  ];
  const gameAudioHFacts = {};
  for (const { key, line, re } of gameAudioHMusicDecl) {
    const ln = lineNumber(gameAudioH.lines, (candidate) => re.test(candidate));
    gameAudioHFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `GameAudio.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.gameAudioHMusicSurface = gameAudioHFacts;

  const gameAudioHFields = [
    { key: "m_music", line: 328, re: /\bMusicManager\s*\*\s*m_music\s*;/ },
    { key: "m_musicTracks", line: 333, re: /\bm_musicTracks\s*;/ },
    { key: "m_musicVolume", line: 339, re: /\bReal\s+m_musicVolume\s*;/ },
  ];
  const gameAudioHFieldFacts = {};
  for (const { key, line, re } of gameAudioHFields) {
    const ln = lineNumber(gameAudioH.lines, (candidate) => re.test(candidate));
    gameAudioHFieldFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `GameAudio.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.gameAudioHFields = gameAudioHFieldFacts;

  // =====================================================================
  // MilesAudioManager.cpp: adjustPlayingVolume shows music vs SFX vs voice
  // =====================================================================
  const adjustPlayingVolumeLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*adjustPlayingVolume\s*\(/,
  );
  facts.milesAdjustPlayingVolumeDefLine = adjustPlayingVolumeLine;
  if (adjustPlayingVolumeLine !== 1243) {
    errors.push(
      `MilesAudioManager::adjustPlayingVolume expected at line 1243 but found at ${adjustPlayingVolumeLine}`,
    );
  }
  if (adjustPlayingVolumeLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, adjustPlayingVolumeLine);
    if (!range) {
      errors.push("MilesAudioManager::adjustPlayingVolume: function body not found");
    }
    // Source order proves how music differs from SFX sample / 3D sample /
    // streaming speech: PAT_Sample -> m_soundVolume, PAT_3DSample ->
    // m_sound3DVolume, then PAT_Stream branches AT_Music -> m_musicVolume and
    // else (AT_Streaming) -> m_speechVolume.
    checkOrderedAnchors(
      milesCpp.lines,
      range,
      [
        { key: "PAT_Sample", re: /\baudio\s*->\s*m_type\s*==\s*PAT_Sample\b/ },
        { key: "m_soundVolume", re: /AIL_set_sample_volume_pan\s*\(\s*audio\s*->\s*m_sample\s*,\s*m_soundVolume\s*\*\s*desiredVolume/ },
        { key: "PAT_3DSample", re: /\baudio\s*->\s*m_type\s*==\s*PAT_3DSample\b/ },
        { key: "m_sound3DVolume", re: /AIL_set_3D_sample_volume\s*\(\s*audio\s*->\s*m_3DSample\s*,\s*m_sound3DVolume\s*\*\s*desiredVolume/ },
        { key: "PAT_Stream", re: /\baudio\s*->\s*m_type\s*==\s*PAT_Stream\b/ },
        { key: "AT_Music_guard", re: /\bAT_Music\b/ },
        { key: "m_musicVolume_stream", re: /AIL_set_stream_volume_pan\s*\(\s*audio\s*->\s*m_stream\s*,\s*m_musicVolume\s*\*\s*desiredVolume/ },
        { key: "m_speechVolume_stream", re: /AIL_set_stream_volume_pan\s*\(\s*audio\s*->\s*m_stream\s*,\s*m_speechVolume\s*\*\s*desiredVolume/ },
      ],
      errors,
      facts,
      "MilesAudioManager::adjustPlayingVolume",
    );
  }

  // =====================================================================
  // MilesAudioManager.cpp: AT_Music stream open path
  // =====================================================================
  // The play-from-event switch opens a Miles stream for AT_Music (and
  // AT_Streaming), seeds its volume with m_musicVolume for music, then calls
  // playStream. Find the switch's AT_Music case and the stream-open tail.
  const openStreamLine = lineNumber(milesCpp.lines, (line) =>
    /\bAIL_open_stream\s*\(\s*m_digitalHandle\s*,\s*fileToPlay\.str\s*\(\s*\)/.test(line),
  );
  const setStreamVolumePanLine = lineNumber(milesCpp.lines, (line) =>
    /\bAIL_set_stream_volume_pan\s*\(\s*stream\s*,\s*curVolume,\s*0\.5f\s*\)/.test(line),
  );
  const playStreamCallLine = lineNumber(milesCpp.lines, (line) =>
    /\bplayStream\s*\(\s*event\s*,\s*stream\s*\)/.test(line),
  );
  facts.milesMusicStreamOpen = {
    ailOpenStream: openStreamLine,
    ailSetStreamVolumePan: setStreamVolumePanLine,
    playStreamCall: playStreamCallLine,
  };
  if (openStreamLine !== 720) {
    errors.push(
      `MilesAudioManager.cpp AIL_open_stream(m_digitalHandle, fileToPlay.str()) expected at line 720 but found at ${openStreamLine}`,
    );
  }
  if (setStreamVolumePanLine !== 734) {
    errors.push(
      `MilesAudioManager.cpp AIL_set_stream_volume_pan(stream, curVolume, 0.5f) expected at line 734 but found at ${setStreamVolumePanLine}`,
    );
  }
  if (playStreamCallLine !== 735) {
    errors.push(
      `MilesAudioManager.cpp playStream(event, stream) expected at line 735 but found at ${playStreamCallLine}`,
    );
  }
  // curVolume = m_musicVolume for music is seeded just before the stream is
  // opened (the AT_Music/AT_Streaming case body). Search a bounded window
  // ending at the stream-open line.
  const curVolumeMusicLine =
    openStreamLine > 0
      ? firstMatchInRange(
          milesCpp.lines,
          Math.max(openStreamLine - 80, 1),
          openStreamLine,
          /\bcurVolume\s*=\s*m_musicVolume/,
        )
      : -1;
  facts.milesMusicStreamOpen.curVolumeMusicLine = curVolumeMusicLine;
  if (curVolumeMusicLine === -1) {
    errors.push(
      "MilesAudioManager.cpp: curVolume = m_musicVolume music branch not found before stream-open path",
    );
  }

  const playStreamDefLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*playStream\s*\(/,
  );
  facts.milesPlayStreamDefLine = playStreamDefLine;
  if (playStreamDefLine !== 2783) {
    errors.push(
      `MilesAudioManager::playStream expected at line 2783 but found at ${playStreamDefLine}`,
    );
  }
  if (playStreamDefLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, playStreamDefLine);
    if (!range) {
      errors.push("MilesAudioManager::playStream: function body not found");
    } else {
      checkOrderedAnchors(
        milesCpp.lines,
        range,
        [
          {
            key: "AIL_set_stream_loop_count",
            re: /AIL_set_stream_loop_count\s*\(\s*stream\s*,\s*INFINITE_LOOP_COUNT\s*\)/,
          },
          {
            key: "AIL_register_stream_callback",
            re: /AIL_register_stream_callback\s*\(\s*stream\s*,\s*setStreamCompleted\s*\)/,
          },
          { key: "AIL_start_stream", re: /AIL_start_stream\s*\(\s*stream\s*\)/ },
          {
            key: "fadeOldMusic",
            re: /fadeOldMusic\s*=\s*event->getShouldFade\(\)\s*&&\s*getAudioSettings\(\)->m_fadeAudioFrames\s*>\s*0/,
          },
          {
            key: "playingStreamsLoop",
            re: /m_playingStreams\s*\.\s*begin\s*\(\s*\)/,
          },
          {
            key: "oldMusicGuard",
            re: /m_soundType\s*!=\s*AT_Music/,
          },
          {
            key: "fadeOldPlayingMusic",
            re: /m_fadingAudio\s*\.\s*push_back\s*\(\s*playing\s*\)/,
          },
          {
            key: "releaseOldPlayingMusic",
            re: /releasePlayingAudio\s*\(\s*playing\s*\)/,
          },
          {
            key: "eraseOldPlayingMusic",
            re: /m_playingStreams\s*\.\s*erase\s*\(\s*it\s*\)/,
          },
          {
            key: "releaseOldFadingMusic",
            re: /m_fadingAudio\s*\.\s*erase\s*\(\s*it\s*\)/,
          },
        ],
        errors,
        facts,
        "MilesAudioManager::playStream",
      );
    }
  }

  // =====================================================================
  // MilesAudioManager.cpp: next/prev/state music implementations
  // =====================================================================
  const milesMusicImpls = [
    {
      key: "nextMusicTrack",
      line: 1337,
      re: /void\s+MilesAudioManager\s*::\s*nextMusicTrack\s*\(\s*void\s*\)/,
    },
    {
      key: "prevMusicTrack",
      line: 1358,
      re: /void\s+MilesAudioManager\s*::\s*prevMusicTrack\s*\(\s*void\s*\)/,
    },
    {
      key: "hasMusicTrackCompleted",
      line: 1394,
      re: /Bool\s+MilesAudioManager\s*::\s*hasMusicTrackCompleted\s*\(/,
    },
    {
      key: "getMusicTrackName",
      line: 1413,
      re: /AsciiString\s+MilesAudioManager\s*::\s*getMusicTrackName\s*\(\s*void\s*\)\s*const/,
    },
  ];
  const milesImplFacts = {};
  for (const { key, line, re } of milesMusicImpls) {
    const ln = lineNumber(milesCpp.lines, (candidate) => re.test(candidate));
    milesImplFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `MilesAudioManager::${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.milesMusicImpls = milesImplFacts;

  // next/prev stop the current track via AHSV_StopTheMusic then start the new
  // one through nextTrackName/prevTrackName + addAudioEvent.
  if (milesImplFacts.nextMusicTrack.line > 0) {
    const range = functionBodyLineRange(
      milesCpp.lines,
      milesImplFacts.nextMusicTrack.line,
    );
    checkOrderedAnchors(
      milesCpp.lines,
      range,
      [
        { key: "AHSV_StopTheMusic", re: /AHSV_StopTheMusic/ },
        { key: "nextTrackName", re: /\bnextTrackName\s*\(/ },
        { key: "addAudioEvent", re: /\baddAudioEvent\s*\(/ },
      ],
      errors,
      facts,
      "MilesAudioManager::nextMusicTrack",
    );
  }
  if (milesImplFacts.prevMusicTrack.line > 0) {
    const range = functionBodyLineRange(
      milesCpp.lines,
      milesImplFacts.prevMusicTrack.line,
    );
    checkOrderedAnchors(
      milesCpp.lines,
      range,
      [
        { key: "AHSV_StopTheMusic", re: /AHSV_StopTheMusic/ },
        { key: "prevTrackName", re: /\bprevTrackName\s*\(/ },
        { key: "addAudioEvent", re: /\baddAudioEvent\s*\(/ },
      ],
      errors,
      facts,
      "MilesAudioManager::prevMusicTrack",
    );
  }
  // hasMusicTrackCompleted uses AIL_stream_loop_count against the music stream.
  if (milesImplFacts.hasMusicTrackCompleted.line > 0) {
    const range = functionBodyLineRange(
      milesCpp.lines,
      milesImplFacts.hasMusicTrackCompleted.line,
    );
    const loopCount = range
      ? firstMatchInRange(milesCpp.lines, range.start, range.end, /AIL_stream_loop_count/)
      : -1;
    facts["MilesAudioManager::hasMusicTrackCompleted"] = {
      ailStreamLoopCount: loopCount,
    };
    if (loopCount === -1) {
      errors.push(
        "MilesAudioManager::hasMusicTrackCompleted: AIL_stream_loop_count not found in body",
      );
    }
  }

  // =====================================================================
  // Music.ini parse route: INI block table + parseMusicTrackDefinition
  // =====================================================================
  const iniBlockEntryLine = lineNumber(iniCpp.lines, (line) =>
    /"\s*MusicTrack\s*"\s*,\s*INI::parseMusicTrackDefinition/.test(line),
  );
  facts.iniMusicTrackBlockEntryLine = iniBlockEntryLine;
  if (iniBlockEntryLine !== 121) {
    errors.push(
      `INI.cpp "MusicTrack" -> parseMusicTrackDefinition entry expected at line 121 but found at ${iniBlockEntryLine}`,
    );
  }

  const parseMusicTrackDefLine = findMemberDef(
    iniAudioEventInfoCpp.lines,
    /void\s+INI\s*::\s*parseMusicTrackDefinition\s*\(\s*INI\s*\*/,
  );
  facts.parseMusicTrackDefinitionDefLine = parseMusicTrackDefLine;
  if (parseMusicTrackDefLine !== 43) {
    errors.push(
      `INI::parseMusicTrackDefinition expected at line 43 but found at ${parseMusicTrackDefLine}`,
    );
  }
  if (parseMusicTrackDefLine > 0) {
    const range = functionBodyLineRange(
      iniAudioEventInfoCpp.lines,
      parseMusicTrackDefLine,
    );
    if (!range) {
      errors.push("INI::parseMusicTrackDefinition: function body not found");
    }
    checkOrderedAnchors(
      iniAudioEventInfoCpp.lines,
      range,
      [
        { key: "newAudioEventInfo", re: /\bnewAudioEventInfo\s*\(/ },
        { key: "addTrackName", re: /\baddTrackName\s*\(/ },
        { key: "m_soundType_AT_Music", re: /\bm_soundType\s*=\s*AT_Music\b/ },
        { key: "initFromINI_getFieldParse", re: /initFromINI\s*\(\s*track\s*,\s*track\s*->\s*getFieldParse\s*\(\s*\)\s*\)/ },
      ],
      errors,
      facts,
      "INI::parseMusicTrackDefinition",
    );
  }

  const report = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
