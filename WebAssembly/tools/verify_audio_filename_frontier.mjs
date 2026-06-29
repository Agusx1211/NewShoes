#!/usr/bin/env node
// verify_audio_filename_frontier.mjs
//
// Source-checks the original audio *filename/path generation* frontier: the
// Common/Audio code paths that turn an AudioEventRTS into a concrete on-disk
// path (root + folder + leaf + extension) *before* any backend (Miles or a
// future Web Audio backend) can request an actual payload. It reads (never
// executes) the original Common source/headers and emits a JSON report.
//
// This is the filename/path companion to verify_miles_audio_*_frontier.mjs
// (which pin the Miles *device* and *playback-handle* frontiers). It verifies
// source facts that matter for routing original audio path generation into a
// browser-fetched asset namespace.
//
// Verified facts (all source-only, bounded function-body / table scans):
//   - AudioEventRTS::generateFilename is defined at the pinned line; its body
//     calls generateFilenamePrefix then generateFilenameExtension, concatenating
//     the music/streaming leaf (m_filename) or the sound-clip leaf in between.
//   - AudioEventRTS::generateFilenamePrefix is defined at the pinned line; its
//     body reads TheAudio->getAudioSettings()->m_audioRoot, then selects
//     m_musicFolder for AT_Music, m_streamingFolder for AT_Streaming, otherwise
//     m_soundsFolder, in that source order.
//   - AudioEventRTS::generateFilenameExtension is defined at the pinned line;
//     its body reads TheAudio->getAudioSettings()->m_soundsExtension for
//     non-music audio.
//   - SoundManager::getFilenameForPlayFromAudioEvent is defined around line 200
//     and returns an AsciiString (the base SoundManager returns the empty
//     string; the real generateFilename() call path lives in GameAudio.cpp).
//   - GameMusic.cpp MusicTrack parse table has the "Filename" entry at the
//     pinned line, and MusicManager::addAudioEvent is defined at the pinned line
//     and stores/plays the supplied AudioEventRTS.
//   - AudioSettings.h declares m_audioRoot, m_soundsFolder, m_musicFolder,
//     m_streamingFolder, and m_soundsExtension at the pinned line anchors.
//   - GameAudio.cpp audioSettingsFieldParseTable maps AudioRoot, SoundsFolder,
//     MusicFolder, StreamingFolder, and SoundsExtension to those fields at the
//     pinned line anchors.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  audioEventRTSCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/AudioEventRTS.cpp",
  gameSoundsCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameSounds.cpp",
  gameMusicCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameMusic.cpp",
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  audioSettingsH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioSettings.h",
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

function main() {
  const errors = [];
  const facts = {};

  const audioEventRTS = readSourceLines(SOURCES.audioEventRTSCpp);
  const gameSounds = readSourceLines(SOURCES.gameSoundsCpp);
  const gameMusic = readSourceLines(SOURCES.gameMusicCpp);
  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const audioSettings = readSourceLines(SOURCES.audioSettingsH);

  // ---- AudioEventRTS::generateFilename (path-assembly entry point) ----
  const generateFilenameLine = findMemberDef(
    audioEventRTS.lines,
    /void\s+AudioEventRTS\s*::\s*generateFilename\s*\(/,
  );
  facts.generateFilenameDefLine = generateFilenameLine;
  if (generateFilenameLine !== 318) {
    errors.push(
      `AudioEventRTS::generateFilename expected at line 318 but found at ${generateFilenameLine}`,
    );
  }
  if (generateFilenameLine > 0) {
    const range = functionBodyLineRange(audioEventRTS.lines, generateFilenameLine);
    if (!range) {
      errors.push("AudioEventRTS::generateFilename: function body not found");
    }
    // The path is assembled by calling generateFilenamePrefix, concatenating a
    // leaf, then calling generateFilenameExtension - in that source order.
    const order = [
      { key: "generateFilenamePrefix", re: /\bgenerateFilenamePrefix\s*\(/ },
      { key: "generateFilenameExtension", re: /\bgenerateFilenameExtension\s*\(/ },
    ];
    const positions = {};
    let prevLine = -1;
    let prevKey = null;
    for (const { key, re } of order) {
      const ln = range
        ? firstMatchInRange(audioEventRTS.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(
          `AudioEventRTS::generateFilename: expected call ${key} not found in body`,
        );
      } else if (prevLine !== -1 && !(prevLine < ln)) {
        errors.push(
          `AudioEventRTS::generateFilename: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
        );
      }
      prevLine = ln;
      prevKey = key;
    }
    // The music/streaming branch concatenates m_filename directly; the sound
    // branch concatenates a clip from m_sounds. Both branches feed
    // m_filenameToLoad, which is what getFilename() returns.
    const filenameLeaf = range
      ? firstMatchInRange(
          audioEventRTS.lines,
          range.start,
          range.end,
          /\bm_eventInfo\s*->\s*m_filename\b/,
        )
      : -1;
    const soundsLeaf = range
      ? firstMatchInRange(
          audioEventRTS.lines,
          range.start,
          range.end,
          /\bm_eventInfo\s*->\s*m_sounds\b/,
        )
      : -1;
    const adjust = range
      ? firstMatchInRange(
          audioEventRTS.lines,
          range.start,
          range.end,
          /\badjustForLocalization\s*\(/,
        )
      : -1;
    positions.m_filenameLeaf = filenameLeaf;
    positions.m_soundsLeaf = soundsLeaf;
    positions.adjustForLocalization = adjust;
    facts.generateFilenameBody = positions;
    if (filenameLeaf === -1) {
      errors.push(
        "AudioEventRTS::generateFilename: m_eventInfo->m_filename leaf not found in body",
      );
    }
    if (soundsLeaf === -1) {
      errors.push(
        "AudioEventRTS::generateFilename: m_eventInfo->m_sounds leaf not found in body",
      );
    }
  }

  // ---- AudioEventRTS::generateFilenamePrefix (root + folder selection) ----
  const generateFilenamePrefixLine = findMemberDef(
    audioEventRTS.lines,
    /AsciiString\s+AudioEventRTS\s*::\s*generateFilenamePrefix\s*\(/,
  );
  facts.generateFilenamePrefixDefLine = generateFilenamePrefixLine;
  if (generateFilenamePrefixLine !== 770) {
    errors.push(
      `AudioEventRTS::generateFilenamePrefix expected at line 770 but found at ${generateFilenamePrefixLine}`,
    );
  }
  if (generateFilenamePrefixLine > 0) {
    const range = functionBodyLineRange(
      audioEventRTS.lines,
      generateFilenamePrefixLine,
    );
    if (!range) {
      errors.push(
        "AudioEventRTS::generateFilenamePrefix: function body not found",
      );
    }
    // Root source first.
    const rootRead = range
      ? firstMatchInRange(
          audioEventRTS.lines,
          range.start,
          range.end,
          /getAudioSettings\s*\(\s*\)\s*->\s*m_audioRoot/,
        )
      : -1;
    if (rootRead === -1) {
      errors.push(
        "AudioEventRTS::generateFilenamePrefix: getAudioSettings()->m_audioRoot read not found in body",
      );
    }
    // Folder selection must appear in source order: AT_Music -> m_musicFolder,
    // AT_Streaming -> m_streamingFolder, else -> m_soundsFolder.
    const order = [
      {
        key: "AT_Music_m_musicFolder",
        re: /AT_Music/,
      },
      {
        key: "m_musicFolder",
        re: /getAudioSettings\s*\(\s*\)\s*->\s*m_musicFolder/,
      },
      {
        key: "AT_Streaming_m_streamingFolder",
        re: /AT_Streaming/,
      },
      {
        key: "m_streamingFolder",
        re: /getAudioSettings\s*\(\s*\)\s*->\s*m_streamingFolder/,
      },
      {
        key: "m_soundsFolder",
        re: /getAudioSettings\s*\(\s*\)\s*->\s*m_soundsFolder/,
      },
    ];
    const positions = { audioRoot: rootRead };
    let prevLine = rootRead;
    let prevKey = "audioRoot";
    for (const { key, re } of order) {
      const ln = range
        ? firstMatchInRange(audioEventRTS.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(
          `AudioEventRTS::generateFilenamePrefix: expected ${key} not found in body`,
        );
      } else if (prevLine !== -1 && !(prevLine < ln)) {
        errors.push(
          `AudioEventRTS::generateFilenamePrefix: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
        );
      }
      prevLine = ln;
      prevKey = key;
    }
    facts.generateFilenamePrefixBody = positions;
  }

  // ---- AudioEventRTS::generateFilenameExtension (extension selection) ----
  const generateFilenameExtensionLine = findMemberDef(
    audioEventRTS.lines,
    /AsciiString\s+AudioEventRTS\s*::\s*generateFilenameExtension\s*\(/,
  );
  facts.generateFilenameExtensionDefLine = generateFilenameExtensionLine;
  if (generateFilenameExtensionLine !== 793) {
    errors.push(
      `AudioEventRTS::generateFilenameExtension expected at line 793 but found at ${generateFilenameExtensionLine}`,
    );
  }
  if (generateFilenameExtensionLine > 0) {
    const range = functionBodyLineRange(
      audioEventRTS.lines,
      generateFilenameExtensionLine,
    );
    if (!range) {
      errors.push(
        "AudioEventRTS::generateFilenameExtension: function body not found",
      );
    }
    const extRead = range
      ? firstMatchInRange(
          audioEventRTS.lines,
          range.start,
          range.end,
          /getAudioSettings\s*\(\s*\)\s*->\s*m_soundsExtension/,
        )
      : -1;
    const atMusicGuard = range
      ? firstMatchInRange(
          audioEventRTS.lines,
          range.start,
          range.end,
          /AT_Music/,
        )
      : -1;
    facts.generateFilenameExtensionBody = {
      m_soundsExtension: extRead,
      atMusicGuard,
    };
    if (extRead === -1) {
      errors.push(
        "AudioEventRTS::generateFilenameExtension: getAudioSettings()->m_soundsExtension read not found in body",
      );
    }
  }

  // ---- SoundManager::getFilenameForPlayFromAudioEvent @ ~200 ----
  // The base SoundManager returns the empty AsciiString; the real
  // generateFilename() call path lives in GameAudio.cpp (verified below).
  const getFilenameForPlayLine = findMemberDef(
    gameSounds.lines,
    /AsciiString\s+SoundManager\s*::\s*getFilenameForPlayFromAudioEvent\s*\(/,
  );
  facts.getFilenameForPlayFromAudioEventDefLine = getFilenameForPlayLine;
  if (getFilenameForPlayLine <= 0) {
    errors.push(
      "SoundManager::getFilenameForPlayFromAudioEvent definition not found",
    );
  }
  if (getFilenameForPlayLine !== 200) {
    errors.push(
      `SoundManager::getFilenameForPlayFromAudioEvent expected around line 200 but found at ${getFilenameForPlayLine}`,
    );
  }
  if (getFilenameForPlayLine > 0) {
    const range = functionBodyLineRange(gameSounds.lines, getFilenameForPlayLine);
    if (!range) {
      errors.push(
        "SoundManager::getFilenameForPlayFromAudioEvent: function body not found",
      );
    }
    const ret = range
      ? firstMatchInRange(gameSounds.lines, range.start, range.end, /\breturn\b/)
      : -1;
    const emptyReturn = range
      ? firstMatchInRange(
          gameSounds.lines,
          range.start,
          range.end,
          /AsciiString::TheEmptyString/,
        )
      : -1;
    facts.getFilenameForPlayFromAudioEventBody = {
      returnLine: ret,
      returnsEmptyString: emptyReturn,
    };
    if (ret === -1) {
      errors.push(
        "SoundManager::getFilenameForPlayFromAudioEvent: return statement not found in body",
      );
    }
  }

  // Real generateFilename() call frontier: GameAudio.cpp drives audio event
  // path generation before any backend request. Recorded as a bonus fact so
  // the filename-generation frontier stays anchored end to end.
  const gameAudioGenerateCall = lineNumber(gameAudio.lines, (line) =>
    /\.generateFilename\s*\(\s*\)\s*;/.test(line),
  );
  facts.gameAudioGenerateFilenameCallLine = gameAudioGenerateCall;
  if (gameAudioGenerateCall === -1) {
    errors.push(
      "GameAudio.cpp: audioEvent->generateFilename() call not found (real path-generation frontier)",
    );
  }

  // ---- GameMusic.cpp: MusicTrack parse table + MusicManager::addAudioEvent ----
  const musicTrackTableLine = lineNumber(gameMusic.lines, (line) =>
    /MusicTrack\s*::\s*m_musicTrackFieldParseTable\s*\[\s*\]/.test(line),
  );
  facts.musicTrackFieldParseTableDefLine = musicTrackTableLine;
  if (musicTrackTableLine === -1) {
    errors.push(
      "GameMusic.cpp: MusicTrack::m_musicTrackFieldParseTable definition not found",
    );
  }

  const filenameEntryLine = lineNumber(gameMusic.lines, (line) =>
    /"\s*Filename\s*"\s*,\s*INI::parseAsciiString/.test(line),
  );
  facts.musicTrackFilenameEntryLine = filenameEntryLine;
  if (filenameEntryLine !== 82) {
    errors.push(
      `GameMusic.cpp MusicTrack "Filename" entry expected at line 82 but found at ${filenameEntryLine}`,
    );
  }

  const addAudioEventLine = findMemberDef(
    gameMusic.lines,
    /void\s+MusicManager\s*::\s*addAudioEvent\s*\(/,
  );
  facts.musicManagerAddAudioEventDefLine = addAudioEventLine;
  if (addAudioEventLine !== 120) {
    errors.push(
      `MusicManager::addAudioEvent expected at line 120 but found at ${addAudioEventLine}`,
    );
  }
  if (addAudioEventLine > 0) {
    const range = functionBodyLineRange(gameMusic.lines, addAudioEventLine);
    if (!range) {
      errors.push("MusicManager::addAudioEvent: function body not found");
    }
    // addAudioEvent stores/plays the supplied event (delegates to playTrack).
    const playTrackCall = range
      ? firstMatchInRange(gameMusic.lines, range.start, range.end, /\bplayTrack\s*\(/)
      : -1;
    facts.musicManagerAddAudioEventBody = { playTrackCall };
    if (playTrackCall === -1) {
      errors.push(
        "MusicManager::addAudioEvent: playTrack(...) delegation not found in body",
      );
    }
  }

  // ---- AudioSettings.h field declarations ----
  const headerFields = [
    { key: "m_audioRoot", line: 40, re: /\bAsciiString\s+m_audioRoot\s*;/ },
    { key: "m_soundsFolder", line: 41, re: /\bAsciiString\s+m_soundsFolder\s*;/ },
    { key: "m_musicFolder", line: 42, re: /\bAsciiString\s+m_musicFolder\s*;/ },
    {
      key: "m_streamingFolder",
      line: 43,
      re: /\bAsciiString\s+m_streamingFolder\s*;/,
    },
    {
      key: "m_soundsExtension",
      line: 44,
      re: /\bAsciiString\s+m_soundsExtension\s*;/,
    },
  ];
  const headerFacts = {};
  for (const { key, line, re } of headerFields) {
    const ln = lineNumber(audioSettings.lines, (candidate) => re.test(candidate));
    headerFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `AudioSettings.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.audioSettingsFields = headerFacts;

  // ---- GameAudio.cpp audioSettingsFieldParseTable mappings ----
  const tableLine = lineNumber(gameAudio.lines, (line) =>
    /\baudioSettingsFieldParseTable\s*\[\s*\]/.test(line),
  );
  facts.audioSettingsFieldParseTableDefLine = tableLine;
  if (tableLine === -1) {
    errors.push(
      "GameAudio.cpp: audioSettingsFieldParseTable definition not found",
    );
  }

  const parseMappings = [
    {
      key: "AudioRoot_m_audioRoot",
      line: 97,
      re: /"\s*AudioRoot\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_audioRoot\s*\)/,
    },
    {
      key: "SoundsFolder_m_soundsFolder",
      line: 98,
      re: /"\s*SoundsFolder\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_soundsFolder\s*\)/,
    },
    {
      key: "MusicFolder_m_musicFolder",
      line: 99,
      re: /"\s*MusicFolder\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_musicFolder\s*\)/,
    },
    {
      key: "StreamingFolder_m_streamingFolder",
      line: 100,
      re: /"\s*StreamingFolder\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_streamingFolder\s*\)/,
    },
    {
      key: "SoundsExtension_m_soundsExtension",
      line: 101,
      re: /"\s*SoundsExtension\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_soundsExtension\s*\)/,
    },
  ];
  const parseFacts = {};
  let prevParseLine = -1;
  let prevParseKey = null;
  for (const { key, line, re } of parseMappings) {
    const ln = lineNumber(gameAudio.lines, (candidate) => re.test(candidate));
    parseFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `GameAudio.cpp ${key} mapping expected at line ${line} but found at ${ln}`,
      );
    } else if (prevParseLine !== -1 && !(prevParseLine < ln)) {
      errors.push(
        `GameAudio.cpp ${key} (line ${ln}) must come after ${prevParseKey} (line ${prevParseLine})`,
      );
    }
    prevParseLine = ln;
    prevParseKey = key;
  }
  facts.audioSettingsParseTableMappings = parseFacts;

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
