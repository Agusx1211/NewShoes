#!/usr/bin/env node
// verify_audio_event_request_frontier.mjs
//
// Source-only verifier for the original audio *event/request lifecycle* that
// sits between parsed audio-event metadata (INI) and the audio manager entry
// points a browser Web Audio backend must preserve. It reads (never executes)
// the original Common source/headers and emits a JSON report.
//
// This is the event/request companion to verify_audio_filename_frontier.mjs
// (which pins the *filename/path* generation frontier) and the
// verify_miles_audio_*_frontier.mjs family (which pin the Miles *device* /
// *playback-handle* / *decode* frontiers). Where the filename verifier anchors
// the leaf/extension strings, this verifier anchors the lifecycle a Web Audio
// backend has to honor: the AudioRequest contract (AR_Play/AR_Pause/AR_Stop +
// pending-event vs. handle union), the AudioManager request/handle-facing
// methods, the SoundManager AR_Play handoff, the per-event playback-state
// fields on AudioEventRTS, the DynamicAudioEventInfo metadata overrides, and
// the INIAudioEventInfo parse table that populates event metadata.
//
// Verified facts (all source-only, bounded line + ordered function-body scans):
//   - AudioRequest.h RequestType enum (AR_Play/AR_Pause/AR_Stop) and the
//     AudioRequest struct fields (m_request, m_pendingEvent union
//     m_handleToInteractOn, m_usePendingEvent, m_requiresCheckForSample) at the
//     pinned line anchors.
//   - AudioEventRTS.h per-event playback-state fields (m_filenameToLoad,
//     m_playingHandle, m_eventName, m_playingAudioIndex, m_portionToPlayNext)
//     at the pinned line anchors.
//   - GameAudio.h AudioManager request/handle-facing virtuals (addAudioEvent,
//     removeAudioEvent(handle), isCurrentlyPlaying, notifyOfAudioCompletion,
//     allocateNewHandle) at the pinned line anchors.
//   - AudioManager::addAudioEvent @414 body order: allocateNewHandle() then
//     generateFilename() then generatePlayInfo(), before delegating to either
//     m_music->addAudioEvent or m_sound->addAudioEvent.
//   - AudioManager::removeAudioEvent(AudioHandle) @581 body order:
//     allocateAudioRequest(false) then m_handleToInteractOn then AR_Stop then
//     appendAudioRequest (the AR_Stop request frontier).
//   - AudioManager::allocateAudioRequest @802 allocates via
//     newInstance(AudioRequest) and sets m_usePendingEvent.
//   - AudioManager::appendAudioRequest @819 pushes onto m_audioRequests.
//   - SoundManager::addAudioEvent @139 (GameSounds.cpp) body order:
//     allocateAudioRequest(true) then m_pendingEvent then AR_Play then
//     appendAudioRequest (the AR_Play request frontier).
//   - DynamicAudioEventInfo.cpp metadata-override methods exist at pinned
//     lines (overrideAudioName, overrideVolume, overridePriority,
//     getOriginalName) — the runtime metadata surface a backend must respect.
//   - INIAudioEventInfo.cpp parse functions assign m_soundType = AT_Music /
//     AT_SoundEffect / AT_Streaming at pinned lines, and the
//     AudioEventInfo::m_audioEventInfo parse table is defined at the pinned
//     line with the "Filename" -> m_filename entry.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  audioRequestH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioRequest.h",
  audioEventRTSH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioEventRTS.h",
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  gameSoundsCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameSounds.cpp",
  dynamicAudioEventInfoCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/DynamicAudioEventInfo.cpp",
  iniAudioEventInfoCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/INI/INIAudioEventInfo.cpp",
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

// Locate a member function definition by signature regex.
function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a 1-based definition line, scan the brace-balanced function body that
// follows. Returns { start, end } as 1-based line numbers spanning the body
// interior (opening-brace line through closing-brace line), or null.
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

// Pin a set of { key, line, re } anchors at exact lines within a single file.
function pinExactLines(src, entries, errors, facts, factsKey) {
  const out = {};
  for (const { key, line, re } of entries) {
    const ln = lineNumber(src.lines, (candidate) => re.test(candidate));
    out[key] = ln;
    if (ln !== line) {
      errors.push(
        `${src.abs.split("/").slice(-2).join("/")}: ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts[factsKey] = out;
}

// Pin an ordered sequence of body matches that must appear in source order.
function pinOrderedBody(src, defLine, order, errors, facts, factsKey) {
  const positions = {};
  let prevLine = -1;
  let prevKey = null;
  if (defLine <= 0) {
    for (const { key } of order) positions[key] = -1;
    facts[factsKey] = positions;
    return;
  }
  const range = functionBodyLineRange(src.lines, defLine);
  if (!range) {
    errors.push(
      `${src.abs.split("/").slice(-2).join("/")}: function body not found for definition at line ${defLine}`,
    );
    for (const { key } of order) positions[key] = -1;
    facts[factsKey] = positions;
    return;
  }
  for (const { key, re } of order) {
    const ln = firstMatchInRange(src.lines, range.start, range.end, re);
    positions[key] = ln;
    if (ln === -1) {
      errors.push(
        `${src.abs.split("/").slice(-2).join("/")}: expected ${key} not found in body of definition at line ${defLine}`,
      );
    } else if (prevLine !== -1 && !(prevLine < ln)) {
      errors.push(
        `${src.abs.split("/").slice(-2).join("/")}: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
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

  const audioRequest = readSourceLines(SOURCES.audioRequestH);
  const audioEventRTS = readSourceLines(SOURCES.audioEventRTSH);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const gameSounds = readSourceLines(SOURCES.gameSoundsCpp);
  const dynamicInfo = readSourceLines(SOURCES.dynamicAudioEventInfoCpp);
  const iniAudio = readSourceLines(SOURCES.iniAudioEventInfoCpp);

  // ---- AudioRequest.h: RequestType enum + struct fields ----
  pinExactLines(
    audioRequest,
    [
      { key: "RequestType_enum", line: 39, re: /^enum\s+RequestType\b/ },
      { key: "AR_Play", line: 41, re: /\bAR_Play\b/ },
      { key: "AR_Pause", line: 42, re: /\bAR_Pause\b/ },
      { key: "AR_Stop", line: 43, re: /\bAR_Stop\b/ },
      {
        key: "struct_AudioRequest",
        line: 46,
        re: /^struct\s+AudioRequest\b/,
      },
      { key: "m_request", line: 51, re: /\bRequestType\s+m_request\s*;/ },
      {
        key: "m_pendingEvent",
        line: 54,
        re: /\bAudioEventRTS\s*\*\s*m_pendingEvent\s*;/,
      },
      {
        key: "m_handleToInteractOn",
        line: 55,
        re: /\bAudioHandle\s+m_handleToInteractOn\s*;/,
      },
      {
        key: "m_usePendingEvent",
        line: 57,
        re: /\bBool\s+m_usePendingEvent\s*;/,
      },
      {
        key: "m_requiresCheckForSample",
        line: 58,
        re: /\bBool\s+m_requiresCheckForSample\s*;/,
      },
    ],
    errors,
    facts,
    "audioRequestContract",
  );

  // ---- AudioEventRTS.h: per-event playback-state fields ----
  pinExactLines(
    audioEventRTS,
    [
      {
        key: "m_filenameToLoad",
        line: 164,
        re: /\bAsciiString\s+m_filenameToLoad\s*;/,
      },
      {
        key: "m_playingHandle",
        line: 166,
        re: /\bAudioHandle\s+m_playingHandle\s*;/,
      },
      { key: "m_eventName", line: 171, re: /\bAsciiString\s+m_eventName\s*;/ },
      {
        key: "m_playingAudioIndex",
        line: 196,
        re: /\bInt\s+m_playingAudioIndex\s*;/,
      },
      {
        key: "m_portionToPlayNext",
        line: 201,
        re: /\bPortionToPlay\s+m_portionToPlayNext\b/,
      },
    ],
    errors,
    facts,
    "audioEventRTSStateFields",
  );

  // ---- GameAudio.h: AudioManager request/handle-facing virtuals ----
  pinExactLines(
    gameAudioH,
    [
      {
        key: "addAudioEvent",
        line: 160,
        re: /virtual\s+AudioHandle\s+addAudioEvent\s*\(\s*const\s+AudioEventRTS/,
      },
      {
        key: "removeAudioEvent_handle",
        line: 161,
        re: /virtual\s+void\s+removeAudioEvent\s*\(\s*AudioHandle\s+audioEvent\s*\)/,
      },
      {
        key: "isCurrentlyPlaying",
        line: 189,
        re: /virtual\s+Bool\s+isCurrentlyPlaying\s*\(\s*AudioHandle\s+handle\s*\)/,
      },
      {
        key: "notifyOfAudioCompletion",
        line: 197,
        re: /virtual\s+void\s+notifyOfAudioCompletion\s*\(\s*UnsignedInt\s+audioCompleted/,
      },
      {
        key: "allocateNewHandle",
        line: 318,
        re: /virtual\s+AudioHandle\s+allocateNewHandle\s*\(\s*void\s*\)/,
      },
    ],
    errors,
    facts,
    "audioManagerInterface",
  );

  // ---- AudioManager::addAudioEvent body order (GameAudio.cpp) ----
  {
    const defLine = findMemberDef(
      gameAudio.lines,
      /AudioHandle\s+AudioManager\s*::\s*addAudioEvent\s*\(/,
    );
    facts.gameAudioAddAudioEventDefLine = defLine;
    if (defLine !== 414) {
      errors.push(
        `GameAudio.cpp: AudioManager::addAudioEvent expected at line 414 but found at ${defLine}`,
      );
    }
    pinOrderedBody(
      gameAudio,
      defLine,
      [
        {
          key: "allocateNewHandle",
          re: /\ballocateNewHandle\s*\(\s*\)/,
        },
        {
          key: "generateFilename",
          re: /(->|\.)generateFilename\s*\(\s*\)/,
        },
        {
          key: "generatePlayInfo",
          re: /(->|\.)generatePlayInfo\s*\(\s*\)/,
        },
        {
          key: "m_music_addAudioEvent",
          re: /m_music\s*->\s*addAudioEvent\s*\(/,
        },
        {
          key: "m_sound_addAudioEvent",
          re: /m_sound\s*->\s*addAudioEvent\s*\(/,
        },
      ],
      errors,
      facts,
      "gameAudioAddAudioEventBody",
    );
  }

  // ---- AudioManager::removeAudioEvent(AudioHandle) body order (AR_Stop) ----
  {
    const defLine = findMemberDef(
      gameAudio.lines,
      /void\s+AudioManager\s*::\s*removeAudioEvent\s*\(\s*AudioHandle\s+audioEvent\s*\)/,
    );
    facts.gameAudioRemoveAudioEventDefLine = defLine;
    if (defLine !== 581) {
      errors.push(
        `GameAudio.cpp: AudioManager::removeAudioEvent(AudioHandle) expected at line 581 but found at ${defLine}`,
      );
    }
    pinOrderedBody(
      gameAudio,
      defLine,
      [
        {
          key: "allocateAudioRequest_false",
          re: /\ballocateAudioRequest\s*\(\s*false\s*\)/,
        },
        {
          key: "m_handleToInteractOn",
          re: /m_handleToInteractOn\s*=/,
        },
        {
          key: "AR_Stop",
          re: /\bm_request\s*=\s*AR_Stop\b/,
        },
        {
          key: "appendAudioRequest",
          re: /\bappendAudioRequest\s*\(/,
        },
      ],
      errors,
      facts,
      "gameAudioRemoveAudioEventBody",
    );
  }

  // ---- AudioManager::allocateAudioRequest + appendAudioRequest bodies ----
  {
    const defLine = findMemberDef(
      gameAudio.lines,
      /AudioRequest\s*\*\s*AudioManager\s*::\s*allocateAudioRequest\s*\(/,
    );
    facts.gameAudioAllocateAudioRequestDefLine = defLine;
    if (defLine !== 802) {
      errors.push(
        `GameAudio.cpp: AudioManager::allocateAudioRequest expected at line 802 but found at ${defLine}`,
      );
    }
    pinOrderedBody(
      gameAudio,
      defLine,
      [
        {
          key: "newInstance_AudioRequest",
          re: /\bnewInstance\s*\(\s*AudioRequest\s*\)/,
        },
        {
          key: "m_usePendingEvent_assign",
          re: /m_usePendingEvent\s*=\s*useAudioEvent/,
        },
      ],
      errors,
      facts,
      "gameAudioAllocateAudioRequestBody",
    );
  }
  {
    const defLine = findMemberDef(
      gameAudio.lines,
      /void\s+AudioManager\s*::\s*appendAudioRequest\s*\(/,
    );
    facts.gameAudioAppendAudioRequestDefLine = defLine;
    if (defLine !== 819) {
      errors.push(
        `GameAudio.cpp: AudioManager::appendAudioRequest expected at line 819 but found at ${defLine}`,
      );
    }
    pinOrderedBody(
      gameAudio,
      defLine,
      [
        {
          key: "m_audioRequests_push_back",
          re: /m_audioRequests\s*\.\s*push_back\s*\(/,
        },
      ],
      errors,
      facts,
      "gameAudioAppendAudioRequestBody",
    );
  }

  // ---- SoundManager::addAudioEvent body order (AR_Play) - GameSounds.cpp ----
  {
    const defLine = findMemberDef(
      gameSounds.lines,
      /void\s+SoundManager\s*::\s*addAudioEvent\s*\(\s*AudioEventRTS\s*\*/s,
    );
    facts.gameSoundsAddAudioEventDefLine = defLine;
    if (defLine !== 139) {
      errors.push(
        `GameSounds.cpp: SoundManager::addAudioEvent expected at line 139 but found at ${defLine}`,
      );
    }
    pinOrderedBody(
      gameSounds,
      defLine,
      [
        {
          key: "allocateAudioRequest_true",
          re: /\ballocateAudioRequest\s*\(\s*true\s*\)/,
        },
        {
          key: "m_pendingEvent",
          re: /m_pendingEvent\s*=\s*eventToAdd/,
        },
        {
          key: "AR_Play",
          re: /\bm_request\s*=\s*AR_Play\b/,
        },
        {
          key: "appendAudioRequest",
          re: /\bappendAudioRequest\s*\(/,
        },
      ],
      errors,
      facts,
      "gameSoundsAddAudioEventBody",
    );
  }

  // ---- DynamicAudioEventInfo.cpp metadata-override methods ----
  pinExactLines(
    dynamicInfo,
    [
      {
        key: "overrideAudioName",
        line: 69,
        re: /void\s+DynamicAudioEventInfo\s*::\s*overrideAudioName\s*\(/,
      },
      {
        key: "overrideVolume",
        line: 99,
        re: /void\s+DynamicAudioEventInfo\s*::\s*overrideVolume\s*\(/,
      },
      {
        key: "overridePriority",
        line: 131,
        re: /void\s+DynamicAudioEventInfo\s*::\s*overridePriority\s*\(/,
      },
      {
        key: "getOriginalName",
        line: 139,
        re: /const\s+AsciiString\s*&\s*DynamicAudioEventInfo\s*::\s*getOriginalName\s*\(/,
      },
    ],
    errors,
    facts,
    "dynamicAudioEventInfoOverrides",
  );

  // ---- INIAudioEventInfo.cpp parse functions + parse table ----
  {
    const parseFns = [
      {
        key: "parseMusicTrackDefinition",
        defLine: 43,
        defRe: /void\s+INI\s*::\s*parseMusicTrackDefinition\s*\(/,
        soundTypeLine: 64,
        soundTypeRe: /track->m_soundType\s*=\s*AT_Music\s*;/,
      },
      {
        key: "parseAudioEventDefinition",
        defLine: 71,
        defRe: /void\s+INI\s*::\s*parseAudioEventDefinition\s*\(/,
        soundTypeLine: 91,
        soundTypeRe: /track->m_soundType\s*=\s*AT_SoundEffect\s*;/,
      },
      {
        key: "parseDialogDefinition",
        defLine: 98,
        defRe: /void\s+INI\s*::\s*parseDialogDefinition\s*\(/,
        soundTypeLine: 118,
        soundTypeRe: /track->m_soundType\s*=\s*AT_Streaming\s*;/,
      },
    ];
    const out = {};
    for (const { key, defLine, defRe, soundTypeLine, soundTypeRe } of parseFns) {
      const def = findMemberDef(iniAudio.lines, defRe);
      const st = lineNumber(iniAudio.lines, (l) => soundTypeRe.test(l));
      out[key] = { defLine: def, soundTypeLine: st };
      if (def !== defLine) {
        errors.push(
          `INIAudioEventInfo.cpp: ${key} expected at line ${defLine} but found at ${def}`,
        );
      }
      if (st !== soundTypeLine) {
        errors.push(
          `INIAudioEventInfo.cpp: ${key} m_soundType assignment expected at line ${soundTypeLine} but found at ${st}`,
        );
      }
    }
    facts.iniAudioEventInfoParseFns = out;
  }
  {
    const tableLine = lineNumber(iniAudio.lines, (line) =>
      /const\s+FieldParse\s+AudioEventInfo\s*::\s*m_audioEventInfo\s*\[\s*\]/.test(
        line,
      ),
    );
    const filenameEntry = lineNumber(iniAudio.lines, (line) =>
      /"\s*Filename\s*".*offsetof\s*\(\s*AudioEventInfo\s*,\s*m_filename\s*\)/.test(
        line,
      ),
    );
    facts.iniAudioEventInfoParseTable = {
      defLine: tableLine,
      filenameEntryLine: filenameEntry,
    };
    if (tableLine !== 130) {
      errors.push(
        `INIAudioEventInfo.cpp: AudioEventInfo::m_audioEventInfo table expected at line 130 but found at ${tableLine}`,
      );
    }
    if (filenameEntry !== 132) {
      errors.push(
        `INIAudioEventInfo.cpp: "Filename" -> m_filename entry expected at line 132 but found at ${filenameEntry}`,
      );
    }
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
