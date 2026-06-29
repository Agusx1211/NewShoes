#!/usr/bin/env node
// verify_audio_options_volume_frontier.mjs
//
// Source-only verifier for the original Zero Hour Options-menu audio *volume
// control frontier* that a browser Web Audio backend must preserve when the
// Options UI eventually drives live mixer state.
//
// It reads (never executes) the original GeneralsMD GameEngine source/headers
// and emits a JSON report: { ok, errors, sources, facts }. Exits 0 only if
// every pinned source fact is present; exits 1 with a JSON `errors` list
// otherwise.
//
// Scope (the Options-menu volume control frontier):
//   - OptionsMenu.cpp: pin the three volume slider control IDs
//     (OptionsMenu.wnd:SliderMusicVolume / SliderSFXVolume /
//     SliderVoiceVolume), the `saveOptions` helper that reads each slider and
//     calls TheAudio->setVolume with the exact AudioAffect split
//     (music | system, sound | system, sound3D | system, speech | system),
//     preserving the relative-2D volume split for SFX, and the option-preference
//     persistence writes for MusicVolume / SFXVolume / SFX3DVolume / VoiceVolume.
//   - GameAudio.cpp / GameAudio.h: pin AudioManager::setOn / setVolume /
//     getVolume declarations and definitions and the script/system volume field
//     split (music / sound / sound3D / speech) that the UI setVolume calls land
//     on, proving the UI targets the engine AudioManager surface.
//
// Exact line anchors are used where they exist; they fail clearly (reported as
// an error with the actual line found) when the source drifts.
//
// NOTE: Only GeneralsMD/Code paths are used. The base Generals/Code OptionsMenu
// flow is intentionally NOT consulted; the Zero Hour (GeneralsMD) source is the
// authoritative frontier for the browser port.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  optionsMenuCpp:
    "GeneralsMD/Code/GameEngine/Source/GameClient/GUI/GUICallbacks/Menus/OptionsMenu.cpp",
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
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

// Locate a member function definition by matching its signature.
function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a definition line, scan the brace-balanced function body that follows.
// Returns { start, end } as 1-based line numbers of the body span (from the
// opening-brace line to the closing-brace line), or null.
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

// Pin a single source line at an exact line anchor, recording the actual line
// found and pushing a clear error on drift.
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

// Pin an ordered sequence of anchors that must appear inside a bounded body in
// source order. Each entry records its actual line; ordering is checked against
// the previous entry.
function pinOrderedInBody(lines, errors, range, entries, factsTarget) {
  let prevLine = -1;
  let prevKey = null;
  for (const { key, re, expected } of entries) {
    const actual = range
      ? firstMatchInRange(lines, range.start, range.end, re)
      : -1;
    factsTarget[key] = { expectedLine: expected, line: actual };
    if (actual === -1) {
      errors.push(`${key}: expected anchor not found in body`);
    } else if (expected !== undefined && actual !== expected) {
      errors.push(
        `${key} expected at line ${expected} but found at ${actual}`,
      );
    } else if (prevLine !== -1 && !(prevLine < actual)) {
      errors.push(
        `${key} (line ${actual}) must come after ${prevKey} (line ${prevLine})`,
      );
    }
    prevLine = actual;
    prevKey = key;
  }
}

function main() {
  const errors = [];
  const facts = {};

  const optionsMenu = readSourceLines(SOURCES.optionsMenuCpp);
  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);

  // ========================================================================
  // 1a) OptionsMenu.cpp static slider ID / window pointer declarations
  // ------------------------------------------------------------------------
  // The file-static NameKeyType + GameWindow* declarations for the three
  // volume sliders. These are the C++ side of the
  // OptionsMenu.wnd:Slider{Music,SFX,Voice}Volume control IDs.
  // ========================================================================
  const sliderDecls = {};
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderMusicVolumeID",
    /\bNameKeyType\s+sliderMusicVolumeID\s*=/,
    140,
    sliderDecls,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderMusicVolume",
    /\bGameWindow\s*\*\s*sliderMusicVolume\b/,
    141,
    sliderDecls,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderSFXVolumeID",
    /\bNameKeyType\s+sliderSFXVolumeID\s*=/,
    143,
    sliderDecls,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderSFXVolume",
    /\bGameWindow\s*\*\s*sliderSFXVolume\b/,
    144,
    sliderDecls,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderVoiceVolumeID",
    /\bNameKeyType\s+sliderVoiceVolumeID\s*=/,
    146,
    sliderDecls,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderVoiceVolume",
    /\bGameWindow\s*\*\s*sliderVoiceVolume\b/,
    147,
    sliderDecls,
  );
  facts.optionsMenuSliderDecls = sliderDecls;

  // ========================================================================
  // 1b) OptionsMenu.cpp slider control-ID resolution
  // ------------------------------------------------------------------------
  // nameToKey( "OptionsMenu.wnd:Slider{Music,SFX,Voice}Volume" ) + the
  // winGetWindowFromId that resolves each slider window. These are the exact
  // control IDs a browser UI must mirror.
  // ========================================================================
  const controlIds = {};
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:SliderMusicVolume nameToKey",
    /nameToKey\s*\(\s*AsciiString\s*\(\s*"OptionsMenu\.wnd:SliderMusicVolume"\s*\)\s*\)/,
    1392,
    controlIds,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderMusicVolume winGetWindowFromId",
    /sliderMusicVolume\s*=\s*TheWindowManager->winGetWindowFromId/,
    1393,
    controlIds,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:SliderSFXVolume nameToKey",
    /nameToKey\s*\(\s*AsciiString\s*\(\s*"OptionsMenu\.wnd:SliderSFXVolume"\s*\)\s*\)/,
    1394,
    controlIds,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderSFXVolume winGetWindowFromId",
    /sliderSFXVolume\s*=\s*TheWindowManager->winGetWindowFromId/,
    1395,
    controlIds,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:SliderVoiceVolume nameToKey",
    /nameToKey\s*\(\s*AsciiString\s*\(\s*"OptionsMenu\.wnd:SliderVoiceVolume"\s*\)\s*\)/,
    1396,
    controlIds,
  );
  pinExactLine(
    optionsMenu.lines,
    errors,
    "OptionsMenu.cpp:sliderVoiceVolume winGetWindowFromId",
    /sliderVoiceVolume\s*=\s*TheWindowManager->winGetWindowFromId/,
    1397,
    controlIds,
  );
  facts.optionsMenuControlIds = controlIds;

  // ========================================================================
  // 1c) OptionsMenu.cpp saveOptions volume flow
  // ------------------------------------------------------------------------
  // Pin the static saveOptions(void) helper and verify, inside its body, the
  // ordered volume-control flow: read slider -> setVolume with the exact
  // AudioAffect split -> persist option preference. Music and Speech map to a
  // single setVolume each; SFX splits into 2D (Sound) and 3D (Sound3D) with
  // the relative-2D-volume calculation preserved.
  // ========================================================================
  const saveOptionsDefLine = findMemberDef(
    optionsMenu.lines,
    /^static\s+void\s+saveOptions\s*\(\s*void\s*\)/,
  );
  facts.saveOptionsDefLine = { expectedLine: 933, line: saveOptionsDefLine };
  if (saveOptionsDefLine !== 933) {
    errors.push(
      `OptionsMenu.cpp saveOptions expected at line 933 but found at ${saveOptionsDefLine}`,
    );
  }
  const saveOptionsRange =
    saveOptionsDefLine > 0
      ? functionBodyLineRange(optionsMenu.lines, saveOptionsDefLine)
      : null;
  if (saveOptionsDefLine > 0 && !saveOptionsRange) {
    errors.push("OptionsMenu.cpp saveOptions: function body not found");
  }
  facts.saveOptionsBody = saveOptionsRange
    ? { start: saveOptionsRange.start, end: saveOptionsRange.end }
    : null;

  // --- Music volume flow (single setVolume, AudioAffect_Music | SystemSetting)
  const musicFlow = {};
  pinOrderedInBody(
    optionsMenu.lines,
    errors,
    saveOptionsRange,
    [
      {
        key: "music: GadgetSliderGetPosition(sliderMusicVolume)",
        re: /val\s*=\s*GadgetSliderGetPosition\s*\(\s*sliderMusicVolume\s*\)/,
        expected: 1205,
      },
      {
        key: "music: m_musicVolumeFactor write",
        re: /TheWritableGlobalData->m_musicVolumeFactor\s*=/,
        expected: 1208,
      },
      {
        key: "music: (*pref)[\"MusicVolume\"]",
        re: /\(\*pref\)\s*\[\s*"MusicVolume"\s*\]/,
        expected: 1211,
      },
      {
        key: "music: TheAudio->setVolume(AudioAffect_Music | AudioAffect_SystemSetting)",
        re: /TheAudio->setVolume\s*\(\s*val\s*\/\s*100\.0f\s*,\s*\(AudioAffect\)\s*\(AudioAffect_Music\s*\|\s*AudioAffect_SystemSetting\s*\)\s*\)/,
        expected: 1212,
      },
    ],
    musicFlow,
  );
  facts.saveOptionsMusicFlow = musicFlow;

  // --- SFX volume flow (relative-2D split, two setVolume calls)
  const sfxFlow = {};
  pinOrderedInBody(
    optionsMenu.lines,
    errors,
    saveOptionsRange,
    [
      {
        key: "sfx: GadgetSliderGetPosition(sliderSFXVolume)",
        re: /val\s*=\s*GadgetSliderGetPosition\s*\(\s*sliderSFXVolume\s*\)/,
        expected: 1217,
      },
      {
        key: "sfx: sound2DVolume init",
        re: /\bReal\s+sound2DVolume\s*=/,
        expected: 1222,
      },
      {
        key: "sfx: sound3DVolume init",
        re: /\bReal\s+sound3DVolume\s*=/,
        expected: 1223,
      },
      {
        key: "sfx: relative2DVolume read",
        re: /Real\s+relative2DVolume\s*=\s*TheAudio->getAudioSettings\(\)->m_relative2DVolume/,
        expected: 1224,
      },
      {
        key: "sfx: relative2DVolume clamp",
        re: /relative2DVolume\s*=\s*MIN\s*\(\s*1\.0f\s*,\s*MAX\s*\(\s*-1\.0\s*,\s*relative2DVolume\s*\)\s*\)/,
        expected: 1225,
      },
      {
        key: "sfx: <0 branch lower 2D",
        re: /sound2DVolume\s*\*=\s*1\.0f\s*\+\s*relative2DVolume/,
        expected: 1229,
      },
      {
        key: "sfx: else branch lower 3D",
        re: /sound3DVolume\s*\*=\s*1\.0f\s*-\s*relative2DVolume/,
        expected: 1234,
      },
      {
        key: "sfx: setVolume(sound2D, AudioAffect_Sound | AudioAffect_SystemSetting)",
        re: /TheAudio->setVolume\s*\(\s*sound2DVolume\s*,\s*\(AudioAffect\)\s*\(AudioAffect_Sound\s*\|\s*AudioAffect_SystemSetting\s*\)\s*\)/,
        expected: 1238,
      },
      {
        key: "sfx: setVolume(sound3D, AudioAffect_Sound3D | AudioAffect_SystemSetting)",
        re: /TheAudio->setVolume\s*\(\s*sound3DVolume\s*,\s*\(AudioAffect\)\s*\(AudioAffect_Sound3D\s*\|\s*AudioAffect_SystemSetting\s*\)\s*\)/,
        expected: 1239,
      },
      {
        key: "sfx: m_SFXVolumeFactor write",
        re: /TheWritableGlobalData->m_SFXVolumeFactor\s*=/,
        expected: 1242,
      },
      {
        key: "sfx: (*pref)[\"SFXVolume\"]",
        re: /\(\*pref\)\s*\[\s*"SFXVolume"\s*\]/,
        expected: 1245,
      },
      {
        key: "sfx: (*pref)[\"SFX3DVolume\"]",
        re: /\(\*pref\)\s*\[\s*"SFX3DVolume"\s*\]/,
        expected: 1247,
      },
    ],
    sfxFlow,
  );
  facts.saveOptionsSfxFlow = sfxFlow;

  // --- Speech/voice volume flow (single setVolume, AudioAffect_Speech | SystemSetting)
  const speechFlow = {};
  pinOrderedInBody(
    optionsMenu.lines,
    errors,
    saveOptionsRange,
    [
      {
        key: "speech: GadgetSliderGetPosition(sliderVoiceVolume)",
        re: /val\s*=\s*GadgetSliderGetPosition\s*\(\s*sliderVoiceVolume\s*\)/,
        expected: 1252,
      },
      {
        key: "speech: m_voiceVolumeFactor write",
        re: /TheWritableGlobalData->m_voiceVolumeFactor\s*=/,
        expected: 1255,
      },
      {
        key: "speech: (*pref)[\"VoiceVolume\"]",
        re: /\(\*pref\)\s*\[\s*"VoiceVolume"\s*\]/,
        expected: 1258,
      },
      {
        key: "speech: TheAudio->setVolume(AudioAffect_Speech | AudioAffect_SystemSetting)",
        re: /TheAudio->setVolume\s*\(\s*val\s*\/\s*100\.0f\s*,\s*\(AudioAffect\)\s*\(AudioAffect_Speech\s*\|\s*AudioAffect_SystemSetting\s*\)\s*\)/,
        expected: 1259,
      },
    ],
    speechFlow,
  );
  facts.saveOptionsSpeechFlow = speechFlow;

  // ========================================================================
  // 2a) GameAudio.h AudioManager volume surface declarations
  // ------------------------------------------------------------------------
  // The virtual setOn / setVolume / getVolume declarations the UI calls land
  // on. (isOn is the on/off companion, pinned for completeness since setOn is
  // the toggle half of the same control surface.)
  // ========================================================================
  const headerSurface = {};
  pinExactLine(
    gameAudioH.lines,
    errors,
    "GameAudio.h:AudioManager::setOn declaration",
    /virtual\s+void\s+setOn\s*\(\s*Bool\s+turnOn\s*,\s*AudioAffect\s+whichToAffect\s*\)/,
    229,
    headerSurface,
  );
  pinExactLine(
    gameAudioH.lines,
    errors,
    "GameAudio.h:AudioManager::setVolume declaration",
    /virtual\s+void\s+setVolume\s*\(\s*Real\s+volume\s*,\s*AudioAffect\s+whichToAffect\s*\)/,
    232,
    headerSurface,
  );
  pinExactLine(
    gameAudioH.lines,
    errors,
    "GameAudio.h:AudioManager::getVolume declaration",
    /virtual\s+Real\s+getVolume\s*\(\s*AudioAffect\s+whichToGet\s*\)/,
    233,
    headerSurface,
  );
  facts.gameAudioHeaderSurface = headerSurface;

  // ========================================================================
  // 2b) GameAudio.h script/system volume field split
  // ------------------------------------------------------------------------
  // The AudioManager members that setVolume writes. Music / Sound / Sound3D /
  // Speech each have a system, script, and combined field; AudioAffect_SystemSetting
  // selects the m_system* field, otherwise the m_script* field, and the combined
  // m_* field is their product.
  // ========================================================================
  const headerFields = {};
  const fieldPins = [
    ["m_musicVolume", 339, /\bReal\s+m_musicVolume\s*;/],
    ["m_soundVolume", 340, /\bReal\s+m_soundVolume\s*;/],
    ["m_sound3DVolume", 341, /\bReal\s+m_sound3DVolume\s*;/],
    ["m_speechVolume", 342, /\bReal\s+m_speechVolume\s*;/],
    ["m_scriptMusicVolume", 344, /\bReal\s+m_scriptMusicVolume\s*;/],
    ["m_scriptSoundVolume", 345, /\bReal\s+m_scriptSoundVolume\s*;/],
    ["m_scriptSound3DVolume", 346, /\bReal\s+m_scriptSound3DVolume\s*;/],
    ["m_scriptSpeechVolume", 347, /\bReal\s+m_scriptSpeechVolume\s*;/],
    ["m_systemMusicVolume", 349, /\bReal\s+m_systemMusicVolume\s*;/],
    ["m_systemSoundVolume", 350, /\bReal\s+m_systemSoundVolume\s*;/],
    ["m_systemSound3DVolume", 351, /\bReal\s+m_systemSound3DVolume\s*;/],
    ["m_systemSpeechVolume", 352, /\bReal\s+m_systemSpeechVolume\s*;/],
  ];
  for (const [name, expected, re] of fieldPins) {
    pinExactLine(
      gameAudioH.lines,
      errors,
      `GameAudio.h:${name}`,
      re,
      expected,
      headerFields,
    );
  }
  facts.gameAudioHeaderVolumeFields = headerFields;

  // ========================================================================
  // 2c) GameAudio.cpp AudioManager::setOn / setVolume / getVolume definitions
  // ------------------------------------------------------------------------
  // Pin the definitions and verify, inside setVolume, that each AudioAffect
  // branch writes the m_system* (under AudioAffect_SystemSetting) or m_script*
  // member and recomputes the combined m_* field. This is the field split the
  // Options UI setVolume(... | AudioAffect_SystemSetting) calls target.
  // ========================================================================
  const setOnDefLine = findMemberDef(
    gameAudio.lines,
    /void\s+AudioManager\s*::\s*setOn\s*\(\s*Bool\s+turnOn\s*,\s*AudioAffect\s+whichToAffect\s*\)/,
  );
  const setVolumeDefLine = findMemberDef(
    gameAudio.lines,
    /void\s+AudioManager\s*::\s*setVolume\s*\(\s*Real\s+volume\s*,\s*AudioAffect\s+whichToAffect\s*\)/,
  );
  const getVolumeDefLine = findMemberDef(
    gameAudio.lines,
    /Real\s+AudioManager\s*::\s*getVolume\s*\(\s*AudioAffect\s+whichToGet\s*\)/,
  );
  facts.gameAudioSetOnDefLine = { expectedLine: 694, line: setOnDefLine };
  facts.gameAudioSetVolumeDefLine = {
    expectedLine: 714,
    line: setVolumeDefLine,
  };
  facts.gameAudioGetVolumeDefLine = {
    expectedLine: 758,
    line: getVolumeDefLine,
  };
  for (const [key, expected, actual] of [
    ["AudioManager::setOn definition", 694, setOnDefLine],
    ["AudioManager::setVolume definition", 714, setVolumeDefLine],
    ["AudioManager::getVolume definition", 758, getVolumeDefLine],
  ]) {
    if (actual !== expected) {
      errors.push(
        `${key} expected at line ${expected} but found at ${actual}`,
      );
    }
  }

  const setVolumeRange =
    setVolumeDefLine > 0
      ? functionBodyLineRange(gameAudio.lines, setVolumeDefLine)
      : null;
  if (setVolumeDefLine > 0 && !setVolumeRange) {
    errors.push("AudioManager::setVolume: function body not found");
  }
  facts.gameAudioSetVolumeBody = setVolumeRange
    ? { start: setVolumeRange.start, end: setVolumeRange.end }
    : null;

  // Verify the four AudioAffect branches inside setVolume, in source order.
  const setVolumeBranches = {};
  pinOrderedInBody(
    gameAudio.lines,
    errors,
    setVolumeRange,
    [
      {
        key: "setVolume: AudioAffect_Music branch",
        re: /\bif\s*\(\s*whichToAffect\s*&\s*AudioAffect_Music\s*\)/,
      },
      {
        key: "setVolume: music m_systemMusicVolume write",
        re: /m_systemMusicVolume\s*=\s*volume/,
      },
      {
        key: "setVolume: music m_musicVolume recompute",
        re: /m_musicVolume\s*=\s*m_scriptMusicVolume\s*\*\s*m_systemMusicVolume/,
      },
      {
        key: "setVolume: AudioAffect_Sound branch",
        re: /\bif\s*\(\s*whichToAffect\s*&\s*AudioAffect_Sound\s*\)/,
      },
      {
        key: "setVolume: sound m_systemSoundVolume write",
        re: /m_systemSoundVolume\s*=\s*volume/,
      },
      {
        key: "setVolume: sound m_soundVolume recompute",
        re: /m_soundVolume\s*=\s*m_scriptSoundVolume\s*\*\s*m_systemSoundVolume/,
      },
      {
        key: "setVolume: AudioAffect_Sound3D branch",
        re: /\bif\s*\(\s*whichToAffect\s*&\s*AudioAffect_Sound3D\s*\)/,
      },
      {
        key: "setVolume: sound3D m_systemSound3DVolume write",
        re: /m_systemSound3DVolume\s*=\s*volume/,
      },
      {
        key: "setVolume: sound3D m_sound3DVolume recompute",
        re: /m_sound3DVolume\s*=\s*m_scriptSound3DVolume\s*\*\s*m_systemSound3DVolume/,
      },
      {
        key: "setVolume: AudioAffect_Speech branch",
        re: /\bif\s*\(\s*whichToAffect\s*&\s*AudioAffect_Speech\s*\)/,
      },
      {
        key: "setVolume: speech m_systemSpeechVolume write",
        re: /m_systemSpeechVolume\s*=\s*volume/,
      },
      {
        key: "setVolume: speech m_speechVolume recompute",
        re: /m_speechVolume\s*=\s*m_scriptSpeechVolume\s*\*\s*m_systemSpeechVolume/,
      },
    ],
    setVolumeBranches,
  );
  facts.gameAudioSetVolumeBranches = setVolumeBranches;

  // Verify getVolume returns the four combined fields (music/sound/sound3D/
  // speech) in that order.
  const getVolumeRange =
    getVolumeDefLine > 0
      ? functionBodyLineRange(gameAudio.lines, getVolumeDefLine)
      : null;
  const getVolumeBranches = {};
  pinOrderedInBody(
    gameAudio.lines,
    errors,
    getVolumeRange,
    [
      { key: "getVolume: return m_musicVolume", re: /return\s+m_musicVolume/ },
      {
        key: "getVolume: return m_soundVolume",
        re: /return\s+m_soundVolume/,
      },
      {
        key: "getVolume: return m_sound3DVolume",
        re: /return\s+m_sound3DVolume/,
      },
      {
        key: "getVolume: return m_speechVolume",
        re: /return\s+m_speechVolume/,
      },
    ],
    getVolumeBranches,
  );
  facts.gameAudioGetVolumeBranches = getVolumeBranches;

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
