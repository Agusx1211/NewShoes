#!/usr/bin/env node
// verify_miles_audio_volume_frontier.mjs
//
// Source-checks the original Miles/audio *volume and mixer* frontier: the
// AudioManager (GameEngine) volume/on-off/focus surface, the per-event
// volume/pitch/loop derivation in AudioEventRTS, and the MilesAudioManager
// (GameEngineDevice) functions that actually push volume, pan, pitch, and 3D
// listener/sample position into Miles. It reads (never executes) the original
// source and emits a JSON report.
//
// This is the volume/mixer companion to:
//   - verify_miles_audio_device_frontier.mjs (device *startup* frontier)
//   - verify_miles_audio_playback_frontier.mjs (playback *handle* frontier)
//
// Verified facts (all source-only, bounded function-body scans):
//   GameAudio.cpp:
//     - addAudioEvent @ 414: contains isOn(...) checks, a getDisallowSpeech()
//       check, generateFilename(), generatePlayInfo(), and a comparison
//       against getAudioSettings()->m_minVolume.
//     - isOn @ 679, setOn @ 694, setVolume @ 714, getVolume @ 758,
//       loseFocus @ 1103, regainFocus @ 1118.
//   GameAudio.h:
//     - public isOn @ 228, setOn @ 229, setVolume @ 232, getVolume @ 233.
//     - volume member fields m_musicVolume @ 339, m_soundVolume @ 340,
//       m_sound3DVolume @ 341, m_speechVolume @ 342; script/system volume
//       fields m_scriptMusicVolume..m_systemSpeechVolume @ 344..352;
//       m_zoomVolume @ 353; m_volumeHasChanged @ 366.
//   MilesAudioManager.cpp:
//     - adjustPlayingVolume @ 1280: AIL_set_sample_volume_pan,
//       AIL_set_3D_sample_volume, AIL_set_stream_volume_pan.
//     - initFilters @ 1326: AIL_set_sample_volume_pan,
//       AIL_set_sample_playback_rate.
//     - initFilters3D @ 1354: AIL_set_3D_sample_volume,
//       AIL_set_3D_sample_playback_rate.
//     - playStream @ 2845, playSample @ 2888, playSample3D @ 2914,
//       processPlayingList @ 2325, setDeviceListenerPosition @ 2713.
//     - Miles volume/pan/pitch/3D-position/orientation calls present:
//       AIL_set_sample_volume_pan, AIL_set_3D_sample_volume,
//       AIL_set_stream_volume_pan, AIL_set_sample_playback_rate,
//       AIL_set_3D_sample_playback_rate, AIL_set_3D_position,
//       AIL_set_3D_orientation.
//   AudioEventRTS.cpp:
//     - generatePlayInfo @ 382; m_pitchShift assigned @ 384, m_volumeShift
//       assigned @ 385, m_loopCount assigned @ 386.
//   AudioEventInfo.h:
//     - m_volume @ 95, m_volumeShift @ 96, m_minVolume @ 97,
//       m_pitchShiftMin @ 98, m_pitchShiftMax @ 99, m_loopCount @ 103,
//       m_priority @ 105.
//   AudioEventRTS.h:
//     - m_eventInfo @ 165, m_priority @ 175, m_volume @ 176, m_pitchShift @ 192,
//       m_volumeShift @ 193, m_loopCount @ 195.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  milesCpp:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  rtsCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/AudioEventRTS.cpp",
  rtsH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioEventRTS.h",
  infoH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioEventInfo.h",
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

function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a definition line, scan the brace-balanced function body that follows.
// Returns { start, end } as 1-based line numbers of the body span (from the
// opening brace line to the closing brace line), or null.
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

  const gameAudioCpp = readSourceLines(SOURCES.gameAudioCpp);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const milesCpp = readSourceLines(SOURCES.milesCpp);
  const rtsCpp = readSourceLines(SOURCES.rtsCpp);
  const rtsH = readSourceLines(SOURCES.rtsH);
  const infoH = readSourceLines(SOURCES.infoH);

  // -------------------------------------------------------------------
  // GameAudio.cpp
  // -------------------------------------------------------------------

  // addAudioEvent @ 414.
  const addAudioEventLine = findMemberDef(
    gameAudioCpp.lines,
    /AudioHandle\s+AudioManager\s*::\s*addAudioEvent\s*\(/,
  );
  facts.gameAudio = facts.gameAudio || {};
  facts.gameAudio.addAudioEventDefLine = addAudioEventLine;
  if (addAudioEventLine !== 414) {
    errors.push(
      `AudioManager::addAudioEvent expected at line 414 but found at ${addAudioEventLine}`,
    );
  }
  if (addAudioEventLine > 0) {
    const range = functionBodyLineRange(gameAudioCpp.lines, addAudioEventLine);
    if (!range) {
      errors.push("addAudioEvent: function body not found");
    }
    const checks = [
      { key: "isOn_check", re: /!isOn\s*\(/ },
      { key: "getDisallowSpeech", re: /getDisallowSpeech\s*\(/ },
      { key: "generateFilename", re: /generateFilename\s*\(/ },
      { key: "generatePlayInfo", re: /generatePlayInfo\s*\(/ },
      { key: "m_minVolume_compare", re: /m_minVolume/ },
    ];
    const positions = {};
    for (const { key, re } of checks) {
      const ln = range
        ? firstMatchInRange(gameAudioCpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`addAudioEvent: expected ${key} not found in body`);
      }
    }
    facts.gameAudio.addAudioEventBody = positions;
  }

  // isOn @ 679.
  const isOnLine = findMemberDef(
    gameAudioCpp.lines,
    /Bool\s+AudioManager\s*::\s*isOn\s*\(/,
  );
  facts.gameAudio.isOnDefLine = isOnLine;
  if (isOnLine !== 679) {
    errors.push(
      `AudioManager::isOn expected at line 679 but found at ${isOnLine}`,
    );
  }

  // setOn @ 694.
  const setOnLine = findMemberDef(
    gameAudioCpp.lines,
    /void\s+AudioManager\s*::\s*setOn\s*\(/,
  );
  facts.gameAudio.setOnDefLine = setOnLine;
  if (setOnLine !== 694) {
    errors.push(
      `AudioManager::setOn expected at line 694 but found at ${setOnLine}`,
    );
  }

  // setVolume @ 714.
  const setVolumeLine = findMemberDef(
    gameAudioCpp.lines,
    /void\s+AudioManager\s*::\s*setVolume\s*\(/,
  );
  facts.gameAudio.setVolumeDefLine = setVolumeLine;
  if (setVolumeLine !== 714) {
    errors.push(
      `AudioManager::setVolume expected at line 714 but found at ${setVolumeLine}`,
    );
  }
  if (setVolumeLine > 0) {
    const range = functionBodyLineRange(gameAudioCpp.lines, setVolumeLine);
    const volumeHasChanged = range
      ? firstMatchInRange(
          gameAudioCpp.lines,
          range.start,
          range.end,
          /m_volumeHasChanged\s*=\s*true/,
        )
      : -1;
    facts.gameAudio.setVolumeBody = { m_volumeHasChangedSet: volumeHasChanged };
    if (volumeHasChanged === -1) {
      errors.push("setVolume: m_volumeHasChanged = true not found in body");
    }
  }

  // getVolume @ 758.
  const getVolumeLine = findMemberDef(
    gameAudioCpp.lines,
    /Real\s+AudioManager\s*::\s*getVolume\s*\(/,
  );
  facts.gameAudio.getVolumeDefLine = getVolumeLine;
  if (getVolumeLine !== 758) {
    errors.push(
      `AudioManager::getVolume expected at line 758 but found at ${getVolumeLine}`,
    );
  }

  // loseFocus @ 1103.
  const loseFocusLine = findMemberDef(
    gameAudioCpp.lines,
    /void\s+AudioManager\s*::\s*loseFocus\s*\(/,
  );
  facts.gameAudio.loseFocusDefLine = loseFocusLine;
  if (loseFocusLine !== 1103) {
    errors.push(
      `AudioManager::loseFocus expected at line 1103 but found at ${loseFocusLine}`,
    );
  }

  // regainFocus @ 1118.
  const regainFocusLine = findMemberDef(
    gameAudioCpp.lines,
    /void\s+AudioManager\s*::\s*regainFocus\s*\(/,
  );
  facts.gameAudio.regainFocusDefLine = regainFocusLine;
  if (regainFocusLine !== 1118) {
    errors.push(
      `AudioManager::regainFocus expected at line 1118 but found at ${regainFocusLine}`,
    );
  }

  // -------------------------------------------------------------------
  // GameAudio.h
  // -------------------------------------------------------------------
  const gameAudioHDeclarations = [
    { key: "isOn", line: 228, re: /virtual\s+Bool\s+isOn\s*\(/ },
    { key: "setOn", line: 229, re: /virtual\s+void\s+setOn\s*\(/ },
    { key: "setVolume", line: 232, re: /virtual\s+void\s+setVolume\s*\(/ },
    { key: "getVolume", line: 233, re: /virtual\s+Real\s+getVolume\s*\(/ },
    { key: "m_musicVolume", line: 339, re: /\bReal\s+m_musicVolume\s*;/ },
    { key: "m_soundVolume", line: 340, re: /\bReal\s+m_soundVolume\s*;/ },
    { key: "m_sound3DVolume", line: 341, re: /\bReal\s+m_sound3DVolume\s*;/ },
    { key: "m_speechVolume", line: 342, re: /\bReal\s+m_speechVolume\s*;/ },
    {
      key: "m_scriptMusicVolume",
      line: 344,
      re: /\bReal\s+m_scriptMusicVolume\s*;/,
    },
    {
      key: "m_scriptSoundVolume",
      line: 345,
      re: /\bReal\s+m_scriptSoundVolume\s*;/,
    },
    {
      key: "m_scriptSound3DVolume",
      line: 346,
      re: /\bReal\s+m_scriptSound3DVolume\s*;/,
    },
    {
      key: "m_scriptSpeechVolume",
      line: 347,
      re: /\bReal\s+m_scriptSpeechVolume\s*;/,
    },
    {
      key: "m_systemMusicVolume",
      line: 349,
      re: /\bReal\s+m_systemMusicVolume\s*;/,
    },
    {
      key: "m_systemSoundVolume",
      line: 350,
      re: /\bReal\s+m_systemSoundVolume\s*;/,
    },
    {
      key: "m_systemSound3DVolume",
      line: 351,
      re: /\bReal\s+m_systemSound3DVolume\s*;/,
    },
    {
      key: "m_systemSpeechVolume",
      line: 352,
      re: /\bReal\s+m_systemSpeechVolume\s*;/,
    },
    { key: "m_zoomVolume", line: 353, re: /\bReal\s+m_zoomVolume\s*;/ },
    {
      key: "m_volumeHasChanged",
      line: 366,
      re: /\bBool\s+m_volumeHasChanged\b/,
    },
  ];
  const gameAudioHFacts = {};
  for (const { key, line, re } of gameAudioHDeclarations) {
    const ln = lineNumber(gameAudioH.lines, (candidate) => re.test(candidate));
    gameAudioHFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `GameAudio.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.gameAudioHeader = gameAudioHFacts;

  // -------------------------------------------------------------------
  // MilesAudioManager.cpp
  // -------------------------------------------------------------------
  facts.miles = facts.miles || {};

  // adjustPlayingVolume @ 1280: sample/3D/stream volume + pan.
  const adjustPlayingVolumeLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*adjustPlayingVolume\s*\(/,
  );
  facts.miles.adjustPlayingVolumeDefLine = adjustPlayingVolumeLine;
  if (adjustPlayingVolumeLine !== 1280) {
    errors.push(
      `MilesAudioManager::adjustPlayingVolume expected at line 1280 but found at ${adjustPlayingVolumeLine}`,
    );
  }
  if (adjustPlayingVolumeLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, adjustPlayingVolumeLine);
    const checks = [
      { key: "AIL_set_sample_volume_pan", re: /AIL_set_sample_volume_pan\s*\(/ },
      { key: "AIL_set_3D_sample_volume", re: /AIL_set_3D_sample_volume\s*\(/ },
      { key: "AIL_set_stream_volume_pan", re: /AIL_set_stream_volume_pan\s*\(/ },
    ];
    const positions = {};
    for (const { key, re } of checks) {
      const ln = range
        ? firstMatchInRange(milesCpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`adjustPlayingVolume: expected ${key} not found in body`);
      }
    }
    facts.miles.adjustPlayingVolumeBody = positions;
  }

  // initFilters @ 1326: 2D volume + playback rate.
  const initFiltersLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*initFilters\s*\(/,
  );
  facts.miles.initFiltersDefLine = initFiltersLine;
  if (initFiltersLine !== 1326) {
    errors.push(
      `MilesAudioManager::initFilters expected at line 1326 but found at ${initFiltersLine}`,
    );
  }
  if (initFiltersLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, initFiltersLine);
    const checks = [
      { key: "AIL_set_sample_volume_pan", re: /AIL_set_sample_volume_pan\s*\(/ },
      {
        key: "AIL_set_sample_playback_rate",
        re: /AIL_set_sample_playback_rate\s*\(/,
      },
    ];
    const positions = {};
    for (const { key, re } of checks) {
      const ln = range
        ? firstMatchInRange(milesCpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`initFilters: expected ${key} not found in body`);
      }
    }
    facts.miles.initFiltersBody = positions;
  }

  // initFilters3D @ 1354: 3D volume + playback rate.
  const initFilters3DLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*initFilters3D\s*\(/,
  );
  facts.miles.initFilters3DDefLine = initFilters3DLine;
  if (initFilters3DLine !== 1354) {
    errors.push(
      `MilesAudioManager::initFilters3D expected at line 1354 but found at ${initFilters3DLine}`,
    );
  }
  if (initFilters3DLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, initFilters3DLine);
    const checks = [
      { key: "AIL_set_3D_sample_volume", re: /AIL_set_3D_sample_volume\s*\(/ },
      {
        key: "AIL_set_3D_sample_playback_rate",
        re: /AIL_set_3D_sample_playback_rate\s*\(/,
      },
    ];
    const positions = {};
    for (const { key, re } of checks) {
      const ln = range
        ? firstMatchInRange(milesCpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`initFilters3D: expected ${key} not found in body`);
      }
    }
    facts.miles.initFilters3DBody = positions;
  }

  // playStream @ 2845.
  const playStreamLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*playStream\s*\(/,
  );
  facts.miles.playStreamDefLine = playStreamLine;
  if (playStreamLine !== 2845) {
    errors.push(
      `MilesAudioManager::playStream expected at line 2845 but found at ${playStreamLine}`,
    );
  }

  // playSample @ 2888: calls initFilters.
  const playSampleLine = findMemberDef(
    milesCpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample\s*\(/,
  );
  facts.miles.playSampleDefLine = playSampleLine;
  if (playSampleLine !== 2888) {
    errors.push(
      `MilesAudioManager::playSample expected at line 2888 but found at ${playSampleLine}`,
    );
  }
  if (playSampleLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, playSampleLine);
    const initFiltersCall = range
      ? firstMatchInRange(milesCpp.lines, range.start, range.end, /\binitFilters\s*\(/)
      : -1;
    facts.miles.playSampleBody = { initFiltersCall };
    if (initFiltersCall === -1) {
      errors.push("playSample: initFilters(...) call not found in body");
    }
  }

  // playSample3D @ 2914: sets 3D position then calls initFilters3D.
  const playSample3DLine = findMemberDef(
    milesCpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample3D\s*\(/,
  );
  facts.miles.playSample3DDefLine = playSample3DLine;
  if (playSample3DLine !== 2914) {
    errors.push(
      `MilesAudioManager::playSample3D expected at line 2914 but found at ${playSample3DLine}`,
    );
  }
  if (playSample3DLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, playSample3DLine);
    const posCall = range
      ? firstMatchInRange(milesCpp.lines, range.start, range.end, /AIL_set_3D_position\s*\(/)
      : -1;
    const initFilters3DCall = range
      ? firstMatchInRange(
          milesCpp.lines,
          range.start,
          range.end,
          /\binitFilters3D\s*\(/,
        )
      : -1;
    facts.miles.playSample3DBody = {
      AIL_set_3D_position: posCall,
      initFilters3DCall,
    };
    if (posCall === -1) {
      errors.push("playSample3D: AIL_set_3D_position not found in body");
    }
    if (initFilters3DCall === -1) {
      errors.push("playSample3D: initFilters3D(...) call not found in body");
    }
  }

  // processPlayingList @ 2325.
  const processPlayingListLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*processPlayingList\s*\(/,
  );
  facts.miles.processPlayingListDefLine = processPlayingListLine;
  if (processPlayingListLine !== 2325) {
    errors.push(
      `MilesAudioManager::processPlayingList expected at line 2325 but found at ${processPlayingListLine}`,
    );
  }
  if (processPlayingListLine > 0) {
    const range = functionBodyLineRange(milesCpp.lines, processPlayingListLine);
    const volumeFlag = range
      ? firstMatchInRange(milesCpp.lines, range.start, range.end, /\bm_volumeHasChanged\b/)
      : -1;
    const adjustCall = range
      ? firstMatchInRange(
          milesCpp.lines,
          range.start,
          range.end,
          /\badjustPlayingVolume\s*\(/,
        )
      : -1;
    const posCall = range
      ? firstMatchInRange(
          milesCpp.lines,
          range.start,
          range.end,
          /AIL_set_3D_position\s*\(/,
        )
      : -1;
    facts.miles.processPlayingListBody = {
      m_volumeHasChangedRef: volumeFlag,
      adjustPlayingVolumeCall: adjustCall,
      AIL_set_3D_position: posCall,
    };
    if (volumeFlag === -1) {
      errors.push(
        "processPlayingList: m_volumeHasChanged reference not found in body",
      );
    }
    if (adjustCall === -1) {
      errors.push(
        "processPlayingList: adjustPlayingVolume(...) call not found in body",
      );
    }
    if (posCall === -1) {
      errors.push("processPlayingList: AIL_set_3D_position not found in body");
    }
  }

  // setDeviceListenerPosition @ 2713: listener orientation + position.
  const setDeviceListenerPositionLine = findMemberDef(
    milesCpp.lines,
    /void\s+MilesAudioManager\s*::\s*setDeviceListenerPosition\s*\(/,
  );
  facts.miles.setDeviceListenerPositionDefLine = setDeviceListenerPositionLine;
  if (setDeviceListenerPositionLine !== 2713) {
    errors.push(
      `MilesAudioManager::setDeviceListenerPosition expected at line 2713 but found at ${setDeviceListenerPositionLine}`,
    );
  }
  if (setDeviceListenerPositionLine > 0) {
    const range = functionBodyLineRange(
      milesCpp.lines,
      setDeviceListenerPositionLine,
    );
    const orientCall = range
      ? firstMatchInRange(
          milesCpp.lines,
          range.start,
          range.end,
          /AIL_set_3D_orientation\s*\(/,
        )
      : -1;
    const posCall = range
      ? firstMatchInRange(
          milesCpp.lines,
          range.start,
          range.end,
          /AIL_set_3D_position\s*\(/,
        )
      : -1;
    facts.miles.setDeviceListenerPositionBody = {
      AIL_set_3D_orientation: orientCall,
      AIL_set_3D_position: posCall,
    };
    if (orientCall === -1) {
      errors.push(
        "setDeviceListenerPosition: AIL_set_3D_orientation not found in body",
      );
    }
    if (posCall === -1) {
      errors.push(
        "setDeviceListenerPosition: AIL_set_3D_position not found in body",
      );
    }
  }

  // Every Miles volume/pan/pitch/3D-position call must appear somewhere in the
  // device source (the broad mixer-call frontier).
  const milesMixerCalls = [
    "AIL_set_sample_volume_pan",
    "AIL_set_3D_sample_volume",
    "AIL_set_stream_volume_pan",
    "AIL_set_sample_playback_rate",
    "AIL_set_3D_sample_playback_rate",
    "AIL_set_3D_position",
    "AIL_set_3D_orientation",
  ];
  const mixerCallInfo = {};
  for (const fn of milesMixerCalls) {
    const re = new RegExp(`\\b${fn}\\s*\\(`);
    const first = lineNumber(milesCpp.lines, (line) => re.test(line));
    mixerCallInfo[fn] = { firstOccurrenceLine: first };
    if (first === -1) {
      errors.push(`MilesAudioManager.cpp: missing mixer call ${fn}`);
    }
  }
  facts.miles.mixerCalls = mixerCallInfo;

  // -------------------------------------------------------------------
  // AudioEventRTS.cpp - generatePlayInfo
  // -------------------------------------------------------------------
  const generatePlayInfoLine = findMemberDef(
    rtsCpp.lines,
    /void\s+AudioEventRTS\s*::\s*generatePlayInfo\s*\(/,
  );
  facts.audioEventRTS = facts.audioEventRTS || {};
  facts.audioEventRTS.generatePlayInfoDefLine = generatePlayInfoLine;
  if (generatePlayInfoLine !== 382) {
    errors.push(
      `AudioEventRTS::generatePlayInfo expected at line 382 but found at ${generatePlayInfoLine}`,
    );
  }
  if (generatePlayInfoLine > 0) {
    const range = functionBodyLineRange(rtsCpp.lines, generatePlayInfoLine);
    const checks = [
      {
        key: "m_pitchShift_assign",
        re: /m_pitchShift\s*=\s*GameAudioRandomValueReal\s*\(\s*m_eventInfo->m_pitchShiftMin/,
      },
      {
        key: "m_volumeShift_assign",
        re: /m_volumeShift\s*=\s*GameAudioRandomValueReal\s*\(\s*1\.0f\s*\+\s*m_eventInfo->m_volumeShift/,
      },
      {
        key: "m_loopCount_assign",
        re: /m_loopCount\s*=\s*m_eventInfo->m_loopCount/,
      },
    ];
    const positions = {};
    for (const { key, re } of checks) {
      const ln = range
        ? firstMatchInRange(rtsCpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`generatePlayInfo: expected ${key} not found in body`);
      }
    }
    facts.audioEventRTS.generatePlayInfoBody = positions;
  }

  // -------------------------------------------------------------------
  // AudioEventInfo.h
  // -------------------------------------------------------------------
  const infoHFields = [
    { key: "m_volume", line: 95, re: /\bReal\s+m_volume\s*;/ },
    { key: "m_volumeShift", line: 96, re: /\bReal\s+m_volumeShift\s*;/ },
    { key: "m_minVolume", line: 97, re: /\bReal\s+m_minVolume\s*;/ },
    { key: "m_pitchShiftMin", line: 98, re: /\bReal\s+m_pitchShiftMin\s*;/ },
    { key: "m_pitchShiftMax", line: 99, re: /\bReal\s+m_pitchShiftMax\s*;/ },
    { key: "m_loopCount", line: 103, re: /\bInt\s+m_loopCount\s*;/ },
    { key: "m_priority", line: 105, re: /\bAudioPriority\s+m_priority\s*;/ },
  ];
  const infoHFacts = {};
  for (const { key, line, re } of infoHFields) {
    const ln = lineNumber(infoH.lines, (candidate) => re.test(candidate));
    infoHFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `AudioEventInfo.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.audioEventInfoHeader = infoHFacts;

  // -------------------------------------------------------------------
  // AudioEventRTS.h
  // -------------------------------------------------------------------
  const rtsHFields = [
    {
      key: "m_eventInfo",
      line: 165,
      re: /const\s+AudioEventInfo\s*\*\s*m_eventInfo/,
    },
    {
      key: "m_priority",
      line: 175,
      re: /\bAudioPriority\s+m_priority\s*;/,
    },
    { key: "m_volume", line: 176, re: /\bReal\s+m_volume\s*;/ },
    { key: "m_pitchShift", line: 192, re: /\bReal\s+m_pitchShift\s*;/ },
    { key: "m_volumeShift", line: 193, re: /\bReal\s+m_volumeShift\s*;/ },
    { key: "m_loopCount", line: 195, re: /\bInt\s+m_loopCount\s*;/ },
  ];
  const rtsHFacts = {};
  for (const { key, line, re } of rtsHFields) {
    const ln = lineNumber(rtsH.lines, (candidate) => re.test(candidate));
    rtsHFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `AudioEventRTS.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.audioEventRTSHeader = rtsHFacts;

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
