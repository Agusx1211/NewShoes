#!/usr/bin/env node
// verify_audio_options_volume_readback_frontier.mjs
//
// Source-only verifier for the original Zero Hour Options-menu audio volume
// *READBACK / UI-initialization* path — the complement of
// `verify_audio_options_volume_frontier.mjs`, which pins the write path
// (slider -> TheAudio->setVolume + OptionPreferences persistence writes).
//
// This verifier pins the opposite direction: how the Options menu initializes
// its volume sliders from persisted/user OptionPreferences values when the
// menu is brought up, plus the OptionPreferences getter definitions that
// read/persist the MusicVolume / SFXVolume / SFX3DVolume / VoiceVolume
// preference keys.
//
// It reads (never executes) the original GeneralsMD GameEngine source and
// emits a JSON report: { ok, errors, sources, facts }. Exits 0 only if every
// pinned source fact is present; exits 1 with a JSON `errors` list otherwise.
//
// Scope (the Options-menu volume readback frontier):
//   - OptionsMenu.cpp: pin `OptionsMenuInit` and, inside its body, the exact
//     `GadgetSliderSetPosition` calls that set `sliderMusicVolume`,
//     `sliderSFXVolume`, and `sliderVoiceVolume` from the OptionPreferences
//     getters (`pref->getMusicVolume()`,
//     `MAX(pref->getSoundVolume(), pref->get3DSoundVolume())`, and
//     `pref->getSpeechVolume()`). This is the UI-initialization readback that
//     a browser Options UI must mirror when it loads persisted audio volumes.
//   - OptionsMenu.cpp: pin the OptionPreferences getter definitions that read
//     the preference keys — `getMusicVolume` (MusicVolume), `getSoundVolume`
//     (SFXVolume), `get3DSoundVolume` (SFX3DVolume), and `getSpeechVolume`
//     (VoiceVolume) — including the `find("<key>")` lookup and the persisted
//     value parse in each body.
//
// NOTE on naming: the preference *key* is "VoiceVolume", but the OptionPreferences
// *getter* that reads it is named `getSpeechVolume` in the original source. This
// verifier pins the real source names; it does not invent a `getVoiceVolume`.
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

// Locate a member/free function definition by matching its signature line.
function findDef(lines, signatureRegex) {
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
// the previous entry. An entry without `expected` only requires presence +
// ordering (used where exact line anchors are less stable).
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

  // ========================================================================
  // 1) OptionsMenu.cpp OptionsMenuInit volume-slider readback
  // ------------------------------------------------------------------------
  // `OptionsMenuInit` is the UI-initialization callback that runs when the
  // Options menu is brought up. Inside its body it reads the persisted
  // OptionPreferences volume values and pushes them into the three volume
  // sliders via GadgetSliderSetPosition:
  //   - sliderMusicVolume <- pref->getMusicVolume()
  //   - sliderSFXVolume   <- MAX(pref->getSoundVolume(), pref->get3DSoundVolume())
  //   - sliderVoiceVolume <- pref->getSpeechVolume()
  // This is the readback half of the volume control frontier; the write half
  // (slider -> TheAudio->setVolume + pref write) is pinned by the existing
  // verify_audio_options_volume_frontier.mjs and is intentionally not
  // duplicated here.
  // ========================================================================
  const initDefLine = findDef(
    optionsMenu.lines,
    /^void\s+OptionsMenuInit\s*\(\s*WindowLayout\s*\*\s*layout\s*,\s*void\s*\*\s*userData\s*\)/,
  );
  facts.optionsMenuInitDefLine = { expectedLine: 1336, line: initDefLine };
  if (initDefLine !== 1336) {
    errors.push(
      `OptionsMenu.cpp OptionsMenuInit expected at line 1336 but found at ${initDefLine}`,
    );
  }
  const initRange =
    initDefLine > 0
      ? functionBodyLineRange(optionsMenu.lines, initDefLine)
      : null;
  if (initDefLine > 0 && !initRange) {
    errors.push("OptionsMenu.cpp OptionsMenuInit: function body not found");
  }
  facts.optionsMenuInitBody = initRange
    ? { start: initRange.start, end: initRange.end }
    : null;

  const readback = {};
  pinOrderedInBody(
    optionsMenu.lines,
    errors,
    initRange,
    [
      {
        key: "readback: GadgetSliderSetPosition(sliderMusicVolume, pref->getMusicVolume())",
        re: /GadgetSliderSetPosition\s*\(\s*sliderMusicVolume\s*,\s*REAL_TO_INT\s*\(\s*pref->getMusicVolume\s*\(\s*\)\s*\)\s*\)/,
        expected: 1779,
      },
      {
        key: "readback: MAX(pref->getSoundVolume(), pref->get3DSoundVolume())",
        re: /Real\s+maxVolume\s*=\s*MAX\s*\(\s*pref->getSoundVolume\s*\(\s*\)\s*,\s*pref->get3DSoundVolume\s*\(\s*\)\s*\)/,
        expected: 1782,
      },
      {
        key: "readback: GadgetSliderSetPosition(sliderSFXVolume, maxVolume)",
        re: /GadgetSliderSetPosition\s*\(\s*sliderSFXVolume\s*,\s*REAL_TO_INT\s*\(\s*maxVolume\s*\)\s*\)/,
        expected: 1783,
      },
      {
        key: "readback: GadgetSliderSetPosition(sliderVoiceVolume, pref->getSpeechVolume())",
        re: /GadgetSliderSetPosition\s*\(\s*sliderVoiceVolume\s*,\s*REAL_TO_INT\s*\(\s*pref->getSpeechVolume\s*\(\s*\)\s*\)\s*\)/,
        expected: 1786,
      },
    ],
    readback,
  );
  facts.optionsMenuInitVolumeReadback = readback;

  // ========================================================================
  // 2) OptionPreferences volume getter definitions
  // ------------------------------------------------------------------------
  // The four OptionPreferences getters the readback path calls. Each performs
  // a `find("<preference key>")` lookup and, when the key is present, parses
  // the persisted string value via atof (clamped to >= 0). When the key is
  // absent they fall back to TheAudio->getAudioSettings()->m_default*Volume.
  //
  // Preference-key -> getter mapping in the original source:
  //   "MusicVolume"  -> OptionPreferences::getMusicVolume
  //   "SFXVolume"    -> OptionPreferences::getSoundVolume
  //   "SFX3DVolume"  -> OptionPreferences::get3DSoundVolume
  //   "VoiceVolume"  -> OptionPreferences::getSpeechVolume
  // ========================================================================
  const getters = {};
  const getterSpecs = [
    {
      name: "getMusicVolume",
      defExpected: 750,
      defRe: /^Real\s+OptionPreferences\s*::\s*getMusicVolume\s*\(\s*void\s*\)/,
      key: "MusicVolume",
      findExpected: 752,
      findRe: /find\s*\(\s*"MusicVolume"\s*\)/,
    },
    {
      name: "getSoundVolume",
      defExpected: 508,
      defRe: /^Real\s+OptionPreferences\s*::\s*getSoundVolume\s*\(\s*void\s*\)/,
      key: "SFXVolume",
      findExpected: 510,
      findRe: /find\s*\(\s*"SFXVolume"\s*\)/,
    },
    {
      name: "get3DSoundVolume",
      defExpected: 530,
      defRe: /^Real\s+OptionPreferences\s*::\s*get3DSoundVolume\s*\(\s*void\s*\)/,
      key: "SFX3DVolume",
      findExpected: 532,
      findRe: /find\s*\(\s*"SFX3DVolume"\s*\)/,
    },
    {
      name: "getSpeechVolume",
      defExpected: 552,
      defRe: /^Real\s+OptionPreferences\s*::\s*getSpeechVolume\s*\(\s*void\s*\)/,
      key: "VoiceVolume",
      findExpected: 554,
      findRe: /find\s*\(\s*"VoiceVolume"\s*\)/,
    },
  ];

  for (const spec of getterSpecs) {
    const entry = { preferenceKey: spec.key };
    // Pin the definition signature line.
    const defLine = pinExactLine(
      optionsMenu.lines,
      errors,
      `OptionPreferences::${spec.name} definition`,
      spec.defRe,
      spec.defExpected,
      entry,
    );
    // Pin the find("<key>") lookup line.
    pinExactLine(
      optionsMenu.lines,
      errors,
      `OptionPreferences::${spec.name} find("${spec.key}")`,
      spec.findRe,
      spec.findExpected,
      entry,
    );
    // Verify the persisted-value parse exists inside the getter body (proves
    // the getter reads/parses the persisted preference key, not just the
    // default fallback). No exact line anchor — presence + ordering only.
    const bodyRange =
      defLine > 0 ? functionBodyLineRange(optionsMenu.lines, defLine) : null;
    if (defLine > 0 && !bodyRange) {
      errors.push(
        `OptionPreferences::${spec.name}: function body not found`,
      );
    }
    const atofLine = bodyRange
      ? firstMatchInRange(
          optionsMenu.lines,
          bodyRange.start,
          bodyRange.end,
          /Real\s+volume\s*=\s*\(\s*Real\s*\)\s*atof\s*\(\s*it->second\.str\s*\(\s*\)\s*\)/,
        )
      : -1;
    entry.atofParseLine = atofLine;
    entry.body = bodyRange
      ? { start: bodyRange.start, end: bodyRange.end }
      : null;
    if (bodyRange && atofLine === -1) {
      errors.push(
        `OptionPreferences::${spec.name}: persisted-value atof parse not found in body`,
      );
    }
    getters[spec.name] = entry;
  }
  facts.optionPreferencesGetters = getters;

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
