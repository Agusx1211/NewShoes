#!/usr/bin/env node
// verify_audio_settings_frontier.mjs
//
// Source-only verifier for the original AudioSettings / AudioManager startup
// *settings readiness* frontier - the static contract that must be parsed and
// loaded before runtime audio path generation (verified by the sibling
// verify_audio_filename_frontier.mjs) can resolve real payloads.
//
// It reads (never executes) the original GameEngine source/headers and emits a
// JSON report: { ok, errors, sources, facts }. Exits 0 only if every pinned
// source fact is present; exits 1 with a JSON `errors` list otherwise.
//
// Scope (the AudioSettings/AudioManager startup frontier):
//   - AudioSettings.h: pin the fields used for path generation and mixer
//     defaults (m_audioRoot, m_soundsFolder, m_musicFolder, m_streamingFolder,
//     m_soundsExtension, the min-volume field actually present, plus the
//     relative/default volume fields).
//   - GameAudio.cpp: pin the audioSettingsFieldParseTable line + INI-key ->
//     AudioSettings-field mappings for the path/folder/extension and
//     min/relative/default volume fields, and pin the AudioManager::init INI
//     load order for AudioSettings.ini and the Default/... + shipped Music /
//     SoundEffects / Speech / Voice / MiscAudio sequences.
//   - AudioEventRTS.cpp: pin generateFilenamePrefix use of the AudioSettings
//     path fields (root + folder selection), tying the settings contract to the
//     path-generation consumer.
//
// Exact line anchors are used where they exist; they fail clearly (reported as
// an error with the actual line found) when the source drifts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  audioSettingsH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioSettings.h",
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  audioEventRTSCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/AudioEventRTS.cpp",
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
function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a definition line, scan the brace-balanced function body that follows.
// Returns { start, end } as 1-based line numbers of the body interior span
// (from the opening-brace line to the closing-brace line), or null.
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
        if (bodyStart === -1) bodyStart = i + 1;
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

// Pin a single header/source declaration at an exact line anchor, recording
// the actual line found and pushing a clear error on drift.
function pinExactLine(lines, errors, key, re, expected, factsTarget) {
  const actual = lineNumber(lines, (candidate) => re.test(candidate));
  factsTarget[key] = { expectedLine: expected, line: actual };
  if (actual !== expected) {
    errors.push(
      `${key} expected at line ${expected} but found at ${actual}`,
    );
  }
  return actual;
}

function main() {
  const errors = [];
  const facts = {};

  const audioSettings = readSourceLines(SOURCES.audioSettingsH);
  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const audioEventRTS = readSourceLines(SOURCES.audioEventRTSCpp);

  // ========================================================================
  // 1) AudioSettings.h field declarations
  // ------------------------------------------------------------------------
  // Path-generation fields (verified as a contiguous block) + the min-volume
  // and relative/default volume fields. The header declares the actual field
  // names; the min-volume field is `m_minVolume` (no `m_minSampleVolume`
  // member exists - the INI key is "MinSampleVolume", see parse table below),
  // and the default volume members are `m_defaultSoundVolume` /
  // `m_default3DSoundVolume` (the 2D default sound volume) /
  // `m_defaultSpeechVolume`. These are the real names present in the header.
  // ========================================================================
  const headerFields = {
    audioSettingsFields: {},
  };
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_audioRoot",
    /\bAsciiString\s+m_audioRoot\s*;/,
    40,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_soundsFolder",
    /\bAsciiString\s+m_soundsFolder\s*;/,
    41,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_musicFolder",
    /\bAsciiString\s+m_musicFolder\s*;/,
    42,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_streamingFolder",
    /\bAsciiString\s+m_streamingFolder\s*;/,
    43,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_soundsExtension",
    /\bAsciiString\s+m_soundsExtension\s*;/,
    44,
    headerFields.audioSettingsFields,
  );
  // The min-volume field actually present in the header is `m_minVolume`.
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_minVolume",
    /\bReal\s+m_minVolume\s*;/,
    59,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_relative2DVolume",
    /\bReal\s+m_relative2DVolume\s*;/,
    64,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_defaultSoundVolume",
    /\bReal\s+m_defaultSoundVolume\s*;/,
    65,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_default3DSoundVolume",
    /\bReal\s+m_default3DSoundVolume\s*;/,
    66,
    headerFields.audioSettingsFields,
  );
  pinExactLine(
    audioSettings.lines,
    errors,
    "AudioSettings.h:m_defaultSpeechVolume",
    /\bReal\s+m_defaultSpeechVolume\s*;/,
    67,
    headerFields.audioSettingsFields,
  );

  // Sanity: confirm there is no `m_minSampleVolume` member aliased in the
  // header, so the actual min-volume field name is unambiguous.
  const minSampleVolumeMember = lineNumber(
    audioSettings.lines,
    (line) => /\bm_minSampleVolume\b/.test(line),
  );
  headerFields.audioSettingsFields.minSampleVolumeMemberPresent = {
    line: minSampleVolumeMember,
  };
  if (minSampleVolumeMember !== -1) {
    errors.push(
      "AudioSettings.h: a m_minSampleVolume member is now present at line " +
        `${minSampleVolumeMember}; verifier assumed m_minVolume is the sole ` +
        "min-volume field - update the pin.",
    );
  }

  facts.audioSettingsHeader = headerFields;

  // ========================================================================
  // 2) GameAudio.cpp audioSettingsFieldParseTable
  // ------------------------------------------------------------------------
  // Pin the table declaration line and the INI-key -> AudioSettings-field
  // mappings for the path/folder/extension fields and the min/relative/
  // default volume fields. Each mapping is pinned to its exact source line.
  // ========================================================================
  const tableDefLine = lineNumber(gameAudio.lines, (line) =>
    /\baudioSettingsFieldParseTable\s*\[\s*\]/.test(line),
  );
  facts.audioSettingsFieldParseTableDefLine = {
    expectedLine: 95,
    line: tableDefLine,
  };
  if (tableDefLine !== 95) {
    errors.push(
      `GameAudio.cpp audioSettingsFieldParseTable expected at line 95 but found at ${tableDefLine}`,
    );
  }

  const parseMappings = [
    {
      key: "GameAudio.cpp:AudioRoot->m_audioRoot",
      line: 97,
      re: /"\s*AudioRoot\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_audioRoot\s*\)/,
    },
    {
      key: "GameAudio.cpp:SoundsFolder->m_soundsFolder",
      line: 98,
      re: /"\s*SoundsFolder\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_soundsFolder\s*\)/,
    },
    {
      key: "GameAudio.cpp:MusicFolder->m_musicFolder",
      line: 99,
      re: /"\s*MusicFolder\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_musicFolder\s*\)/,
    },
    {
      key: "GameAudio.cpp:StreamingFolder->m_streamingFolder",
      line: 100,
      re: /"\s*StreamingFolder\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_streamingFolder\s*\)/,
    },
    {
      key: "GameAudio.cpp:SoundsExtension->m_soundsExtension",
      line: 101,
      re: /"\s*SoundsExtension\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_soundsExtension\s*\)/,
    },
    {
      key: "GameAudio.cpp:MinSampleVolume->m_minVolume",
      line: 122,
      re: /"\s*MinSampleVolume\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_minVolume\s*\)/,
    },
    {
      key: "GameAudio.cpp:Relative2DVolume->m_relative2DVolume",
      line: 128,
      re: /"\s*Relative2DVolume\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_relative2DVolume\s*\)/,
    },
    {
      key: "GameAudio.cpp:DefaultSoundVolume->m_defaultSoundVolume",
      line: 129,
      re: /"\s*DefaultSoundVolume\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_defaultSoundVolume\s*\)/,
    },
    {
      key: "GameAudio.cpp:Default3DSoundVolume->m_default3DSoundVolume",
      line: 130,
      re: /"\s*Default3DSoundVolume\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_default3DSoundVolume\s*\)/,
    },
    {
      key: "GameAudio.cpp:DefaultSpeechVolume->m_defaultSpeechVolume",
      line: 131,
      re: /"\s*DefaultSpeechVolume\s*".*offsetof\s*\(\s*AudioSettings\s*,\s*m_defaultSpeechVolume\s*\)/,
    },
  ];
  const parseFacts = {};
  let prevParseLine = -1;
  let prevParseKey = null;
  for (const { key, line, re } of parseMappings) {
    const actual = lineNumber(gameAudio.lines, (candidate) =>
      re.test(candidate),
    );
    parseFacts[key] = { expectedLine: line, line: actual };
    if (actual !== line) {
      errors.push(
        `${key} mapping expected at line ${line} but found at ${actual}`,
      );
    } else if (prevParseLine !== -1 && !(prevParseLine < actual)) {
      errors.push(
        `${key} (line ${actual}) must come after ${prevParseKey} (line ${prevParseLine})`,
      );
    }
    prevParseLine = actual;
    prevParseKey = key;
  }
  facts.audioSettingsParseTableMappings = parseFacts;

  // ========================================================================
  // 3) GameAudio.cpp AudioManager::init INI load order
  // ------------------------------------------------------------------------
  // Pin AudioManager::init and the startup INI load sequence in source order:
  // AudioSettings.ini first, then Default/Music.ini + Music.ini,
  // Default/SoundEffects.ini + SoundEffects.ini, Default/Speech.ini +
  // Speech.ini, Default/Voice.ini + Voice.ini, then MiscAudio.ini last.
  // This sequence is what makes parsed AudioSettings folder/extension fields
  // and audio-event metadata "runtime ready".
  // ========================================================================
  const initDefLine = findMemberDef(
    gameAudio.lines,
    /void\s+AudioManager\s*::\s*init\s*\(/,
  );
  facts.audioManagerInitDefLine = { expectedLine: 216, line: initDefLine };
  if (initDefLine !== 216) {
    errors.push(
      `AudioManager::init expected at line 216 but found at ${initDefLine}`,
    );
  }

  const initRange =
    initDefLine > 0
      ? functionBodyLineRange(gameAudio.lines, initDefLine)
      : null;
  if (initDefLine > 0 && !initRange) {
    errors.push("AudioManager::init: function body not found");
  }

  // Each load entry: { iniPath, expectedLine }. We match the literal path
  // segment within an ini.load(...) call. The C++ source encodes each Windows
  // path separator as a doubled backslash ("Data\\INI\\..."), so the raw file
  // text contains two backslash characters per separator; the regexes below
  // match that raw text.
  const loadSequence = [
    { key: "AudioSettings.ini", line: 219, path: /Data\\\\INI\\\\AudioSettings\.ini/ },
    { key: "Default/Music.ini", line: 221, path: /Data\\\\INI\\\\Default\\\\Music\.ini/ },
    { key: "Music.ini", line: 222, path: /Data\\\\INI\\\\Music\.ini/ },
    {
      key: "Default/SoundEffects.ini",
      line: 224,
      path: /Data\\\\INI\\\\Default\\\\SoundEffects\.ini/,
    },
    {
      key: "SoundEffects.ini",
      line: 225,
      path: /Data\\\\INI\\\\SoundEffects\.ini/,
    },
    {
      key: "Default/Speech.ini",
      line: 227,
      path: /Data\\\\INI\\\\Default\\\\Speech\.ini/,
    },
    { key: "Speech.ini", line: 228, path: /Data\\\\INI\\\\Speech\.ini/ },
    {
      key: "Default/Voice.ini",
      line: 230,
      path: /Data\\\\INI\\\\Default\\\\Voice\.ini/,
    },
    { key: "Voice.ini", line: 231, path: /Data\\\\INI\\\\Voice\.ini/ },
    { key: "MiscAudio.ini", line: 234, path: /Data\\\\INI\\\\MiscAudio\.ini/ },
  ];
  const loadFacts = {};
  let prevLoadLine = -1;
  let prevLoadKey = null;
  for (const { key, line, path } of loadSequence) {
    // The path must appear on a line that is part of an ini.load(...) call.
    const actual = lineNumber(gameAudio.lines, (candidate) =>
      /\.load\s*\([^)]*/.test(candidate) && path.test(candidate),
    );
    loadFacts[key] = { expectedLine: line, line: actual };
    if (actual !== line) {
      errors.push(
        `AudioManager::init load ${key} expected at line ${line} but found at ${actual}`,
      );
    } else if (prevLoadLine !== -1 && !(prevLoadLine < actual)) {
      errors.push(
        `AudioManager::init load ${key} (line ${actual}) must come after ${prevLoadKey} (line ${prevLoadLine})`,
      );
    } else if (initRange && !(initRange.start <= actual && actual <= initRange.end)) {
      errors.push(
        `AudioManager::init load ${key} (line ${actual}) is outside init() body [${initRange.start},${initRange.end}]`,
      );
    }
    prevLoadLine = actual;
    prevLoadKey = key;
  }
  facts.audioManagerInitLoadOrder = loadFacts;

  // ========================================================================
  // 4) AudioEventRTS.cpp generateFilenamePrefix consumer
  // ------------------------------------------------------------------------
  // Pin generateFilenamePrefix and its use of the AudioSettings path fields
  // (m_audioRoot first, then folder selection in source order: AT_Music ->
  // m_musicFolder, AT_Streaming -> m_streamingFolder, else -> m_soundsFolder).
  // This ties the parsed settings contract to its path-generation consumer.
  // ========================================================================
  const prefixDefLine = findMemberDef(
    audioEventRTS.lines,
    /AsciiString\s+AudioEventRTS\s*::\s*generateFilenamePrefix\s*\(/,
  );
  facts.generateFilenamePrefixDefLine = {
    expectedLine: 770,
    line: prefixDefLine,
  };
  if (prefixDefLine !== 770) {
    errors.push(
      `AudioEventRTS::generateFilenamePrefix expected at line 770 but found at ${prefixDefLine}`,
    );
  }
  if (prefixDefLine > 0) {
    const range = functionBodyLineRange(audioEventRTS.lines, prefixDefLine);
    if (!range) {
      errors.push(
        "AudioEventRTS::generateFilenamePrefix: function body not found",
      );
    }
    const folderOrder = [
      {
        key: "m_audioRoot",
        re: /getAudioSettings\s*\(\s*\)\s*->\s*m_audioRoot/,
      },
      { key: "AT_Music", re: /AT_Music/ },
      {
        key: "m_musicFolder",
        re: /getAudioSettings\s*\(\s*\)\s*->\s*m_musicFolder/,
      },
      { key: "AT_Streaming", re: /AT_Streaming/ },
      {
        key: "m_streamingFolder",
        re: /getAudioSettings\s*\(\s*\)\s*->\s*m_streamingFolder/,
      },
      {
        key: "m_soundsFolder",
        re: /getAudioSettings\s*\(\s*\)\s*->\s*m_soundsFolder/,
      },
    ];
    const positions = {};
    let prevLine = -1;
    let prevKey = null;
    for (const { key, re } of folderOrder) {
      const ln = range
        ? firstMatchInRange(audioEventRTS.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(
          `AudioEventRTS::generateFilenamePrefix: expected ${key} read not found in body`,
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
