#!/usr/bin/env node
// verify_audio_sound_manager_counters_frontier.mjs
//
// Source-only verifier that pins the original *SoundManager* 2D/3D sample
// counter and play-limit frontier that a Web Audio backend must preserve.
// SoundManager (GameEngine/Common/Audio/GameSounds) is the engine-side gate
// that sits in front of the device-side MilesAudioManager: it decides whether
// an AudioEventRTS is allowed to become an AR_Play AudioRequest at all, and it
// owns the m_numPlaying2D/3D sample counters that the device layer bumps on
// every sample start/completion. A Web Audio backend must keep this exact
// request-creation/canPlayNow/counter contract so the play-limit behavior and
// request frontier are preserved.
//
// It reads (never executes) the original SoundManager source/header and the
// AudioManager base header that exposes the limit/availability accessors
// SoundManager depends on, and emits a JSON report { ok, errors, sources,
// facts }.
//
// This is the engine-side counter/request-gate companion to:
//   - verify_audio_event_request_frontier.mjs (AudioRequest *object/lifecycle*)
//   - verify_audio_request_update_frontier.mjs (per-frame request *drain* +
//       AR_Play -> playAudioEvent routing in MilesAudioManager)
//   - verify_audio_sample_start_frontier.mjs (Miles *sample-start* frontier:
//       getFirst2DSample/getFirst3DSample/playSample/playSample3D, which is
//       where the device layer calls *back* into the notifyOf*SampleStart
//       helpers pinned here)
//   - verify_audio_completion_frontier.mjs (Miles *completion/cleanup* tail,
//       which is where the device layer calls back into the
//       notifyOf*SampleCompletion helpers pinned here)
// Where those verifiers pin the request object lifecycle, the device drain,
// the device sample-start, and the device completion tail, this verifier pins
// the slice *above and across* them: the SoundManager request-creation gate
// (addAudioEvent), the canPlayNow play-limit decision (which reads the
// m_numPlaying2D/3D counters and the audio settings limits), the counter
// mutations on start/completion, and the reset cleanup. The notifyOf* helpers
// are referenced as anchors here only (their *call sites* in the Miles device
// layer are pinned by the sample-start and completion verifiers above); this
// verifier pins their *definition bodies* and counter mutations, which the
// device verifiers do not own.
//
// No playback, asset decoding, or C++ execution is performed. No
// package.json, docs, TODO, DONE, SOURCE_INVENTORY, harness, or shim files are
// touched by this tool.
//
// Verified facts (all source-only, bounded line + ordered function-body scans):
//
//   SoundManager declaration contract (GameSounds.h):
//     - class SoundManager : public SubsystemInterface @ 53.
//     - virtual void init @ 59, virtual void reset @ 62.
//     - virtual void addAudioEvent @ 72.
//     - virtual void notifyOf2DSampleStart @ 74, notifyOf3DSampleStart @ 75.
//     - virtual void notifyOf2DSampleCompletion @ 77, notifyOf3DSampleCompletion
//       @ 78.
//     - virtual Int getAvailableSamples @ 80, getAvailable3DSamples @ 81.
//     - virtual Bool canPlayNow @ 87.
//     - protected virtual Bool violatesVoice @ 90, isInterrupting @ 91.
//     - counter fields m_num2DSamples @ 95, m_num3DSamples @ 96,
//       m_numPlaying2DSamples @ 98, m_numPlaying3DSamples @ 99.
//
//   SoundManager::reset @ 96 — cleanup body zeroes the *playing* counters
//     (NOT the configured limits): m_numPlaying2DSamples = 0,
//     m_numPlaying3DSamples = 0. The m_num2DSamples / m_num3DSamples configured
//     limits are deliberately left alone by reset.
//
//   SoundManager::addAudioEvent @ 139 — request-creation gate body order:
//     - lazy limit-load: if (m_num2DSamples == 0 && m_num3DSamples == 0) then
//       m_num2DSamples = TheAudio->getNum2DSamples(); m_num3DSamples =
//       TheAudio->getNum3DSamples();  (pulls the configured limits from the
//       AudioManager audio settings exactly once)
//     - canPlayNow(eventToAdd) gate;
//     - on pass: TheAudio->allocateAudioRequest(true) -> m_pendingEvent =
//       eventToAdd -> m_request = AR_Play -> TheAudio->appendAudioRequest(...);
//     - on fail: TheAudio->releaseAudioEventRTS(eventToAdd).
//
//   SoundManager::notifyOf2DSampleStart @ 160 — body: ++m_numPlaying2DSamples.
//   SoundManager::notifyOf3DSampleStart @ 166 — body: ++m_numPlaying3DSamples.
//   SoundManager::notifyOf2DSampleCompletion @ 172 — body: guarded decrement
//     if (m_numPlaying2DSamples > 0) --m_numPlaying2DSamples.
//   SoundManager::notifyOf3DSampleCompletion @ 180 — body: guarded decrement
//     if (m_numPlaying3DSamples > 0) --m_numPlaying3DSamples.
//
//   SoundManager::getAvailableSamples @ 188 — returns
//     (m_num2DSamples - m_numPlaying2DSamples).
//   SoundManager::getAvailable3DSamples @ 194 — returns
//     (m_num3DSamples - m_numPlaying3DSamples).
//
//   SoundManager::canPlayNow @ 206 — the play-limit decision. The 2D/3D
//     counter frontier is the positional-vs-2D channel-availability branch:
//     - positional (3D) branch: m_numPlaying3DSamples < m_num3DSamples -> true.
//     - non-positional (2D) branch: m_numPlaying2DSamples < m_num2DSamples ->
//       true.
//     Surrounding gates (distance cull, shroud cull, violatesVoice/
//     isInterrupting, TheAudio->doesViolateLimit, isInterrupting,
//     TheAudio->isPlayingLowerPriority, TheAudio->isPlayingAlready) are pinned
//     as ordered anchors so the relative position of the counter check is
//     fixed, but their full semantics are owned by other verifiers/headers.
//
//   SoundManager::violatesVoice @ 321, isInterrupting @ 330 — helper
//     definitions referenced by canPlayNow/addAudioEvent.
//
//   AudioManager base accessors used by SoundManager (GameAudio.h) — the
//     audio-settings limit/availability surface a Web Audio backend must
//     expose so SoundManager's gate is unchanged:
//     - getNum2DSamples @ 213, getNum3DSamples @ 214 (configured limits source).
//     - doesViolateLimit @ 218, isPlayingLowerPriority @ 219,
//       isPlayingAlready @ 220 (canPlayNow collaborators).
//     - allocateAudioRequest @ 252, appendAudioRequest @ 254,
//       releaseAudioEventRTS @ 265 (request-creation/release surface).
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  gameSoundsH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameSounds.h",
  gameSoundsCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameSounds.cpp",
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

function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Scan the brace-balanced body following a 1-based definition line.
// Returns { start, end } 1-based body span, or null.
function functionBodyLineRange(lines, definitionLine) {
  if (definitionLine <= 0) return null;
  let bodyStart = -1;
  let depth = 0;
  for (let i = definitionLine - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
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

function ownerTag(abs) {
  return abs.split("/").slice(-2).join("/");
}

// Pin a single definition/decl line and record it, erroring on drift.
function pinDef(src, key, sigRe, expected, errors, facts) {
  const defLine = findMemberDef(src.lines, sigRe);
  facts[key] = defLine;
  if (defLine !== expected) {
    errors.push(
      `${ownerTag(src.abs)}: ${key} expected at line ${expected} but found at ${defLine}`,
    );
  }
  return defLine;
}

// Cursor-based ordered scan within a fixed body range: each entry must be
// found strictly after the previous match line. Used when the same token can
// recur several times in one body (e.g. multiple isInterrupting() calls), so
// "first match in body" would otherwise collide.
function pinOrderedCursor(src, defLine, key, order, errors, facts) {
  const positions = {};
  if (defLine <= 0) {
    for (const { key: k } of order) positions[k] = -1;
    facts[key] = positions;
    return;
  }
  const range = functionBodyLineRange(src.lines, defLine);
  if (!range) {
    errors.push(
      `${ownerTag(src.abs)}: body not found for definition at line ${defLine}`,
    );
    for (const { key: k } of order) positions[k] = -1;
    facts[key] = positions;
    return;
  }
  let cursor = range.start;
  let prevKey = null;
  for (const { key: k, re } of order) {
    const ln = firstMatchInRange(src.lines, cursor, range.end, re);
    positions[k] = ln;
    if (ln === -1) {
      errors.push(
        `${ownerTag(src.abs)}: ${key}: expected ${k} not found at/after line ${cursor}`,
      );
    } else if (ln < cursor) {
      errors.push(
        `${ownerTag(src.abs)}: ${key}: ${k} (line ${ln}) must be at/after ${prevKey} cursor ${cursor}`,
      );
    }
    cursor = ln > 0 ? ln + 1 : cursor;
    prevKey = k;
  }
  facts[key] = positions;
}

// Pin an ordered sequence of body matches (strict increasing line order).
function pinOrderedBody(src, defLine, key, order, errors, facts) {
  const positions = {};
  let prevLine = -1;
  let prevKey = null;
  if (defLine <= 0) {
    for (const { key: k } of order) positions[k] = -1;
    facts[key] = positions;
    return;
  }
  const range = functionBodyLineRange(src.lines, defLine);
  if (!range) {
    errors.push(
      `${ownerTag(src.abs)}: body not found for definition at line ${defLine}`,
    );
    for (const { key: k } of order) positions[k] = -1;
    facts[key] = positions;
    return;
  }
  for (const { key: k, re } of order) {
    const ln = firstMatchInRange(src.lines, range.start, range.end, re);
    positions[k] = ln;
    if (ln === -1) {
      errors.push(
        `${ownerTag(src.abs)}: expected ${k} not found in body of definition at line ${defLine}`,
      );
    } else if (prevLine !== -1 && !(prevLine < ln)) {
      errors.push(
        `${ownerTag(src.abs)}: ${k} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
      );
    }
    prevLine = ln;
    prevKey = k;
  }
  facts[key] = positions;
}

function main() {
  const errors = [];
  const facts = {};

  const soundsH = readSourceLines(SOURCES.gameSoundsH);
  const sounds = readSourceLines(SOURCES.gameSoundsCpp);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);

  // -----------------------------------------------------------------
  // 1. SoundManager declaration contract (GameSounds.h)
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      { key: "class_SoundManager", line: 53, re: /^class\s+SoundManager\s*:\s*public\s+SubsystemInterface\b/ },
      { key: "init_decl", line: 59, re: /virtual\s+void\s+init\s*\(\s*void\s*\)/ },
      { key: "reset_decl", line: 62, re: /virtual\s+void\s+reset\s*\(\s*void\s*\)/ },
      { key: "addAudioEvent_decl", line: 72, re: /virtual\s+void\s+addAudioEvent\s*\(\s*AudioEventRTS\s*\*\s*eventToAdd\s*\)/ },
      { key: "notifyOf2DSampleStart_decl", line: 74, re: /virtual\s+void\s+notifyOf2DSampleStart\s*\(\s*void\s*\)/ },
      { key: "notifyOf3DSampleStart_decl", line: 75, re: /virtual\s+void\s+notifyOf3DSampleStart\s*\(\s*void\s*\)/ },
      { key: "notifyOf2DSampleCompletion_decl", line: 77, re: /virtual\s+void\s+notifyOf2DSampleCompletion\s*\(\s*void\s*\)/ },
      { key: "notifyOf3DSampleCompletion_decl", line: 78, re: /virtual\s+void\s+notifyOf3DSampleCompletion\s*\(\s*void\s*\)/ },
      { key: "getAvailableSamples_decl", line: 80, re: /virtual\s+Int\s+getAvailableSamples\s*\(\s*void\s*\)/ },
      { key: "getAvailable3DSamples_decl", line: 81, re: /virtual\s+Int\s+getAvailable3DSamples\s*\(\s*void\s*\)/ },
      { key: "canPlayNow_decl", line: 87, re: /virtual\s+Bool\s+canPlayNow\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/ },
      { key: "violatesVoice_decl", line: 90, re: /virtual\s+Bool\s+violatesVoice\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/ },
      { key: "isInterrupting_decl", line: 91, re: /virtual\s+Bool\s+isInterrupting\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/ },
      { key: "m_num2DSamples_field", line: 95, re: /UnsignedInt\s+m_num2DSamples\s*;/ },
      { key: "m_num3DSamples_field", line: 96, re: /UnsignedInt\s+m_num3DSamples\s*;/ },
      { key: "m_numPlaying2DSamples_field", line: 98, re: /UnsignedInt\s+m_numPlaying2DSamples\s*;/ },
      { key: "m_numPlaying3DSamples_field", line: 99, re: /UnsignedInt\s+m_numPlaying3DSamples\s*;/ },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(soundsH.lines, (l) => re.test(l));
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(soundsH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.soundManagerDeclaration = out;
  }

  // -----------------------------------------------------------------
  // 2. SoundManager::reset — cleanup zeroes the *playing* counters only
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      sounds,
      "resetDefLine",
      /void\s+SoundManager\s*::\s*reset\s*\(\s*void\s*\)/,
      96,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "resetBody", [
      { key: "m_numPlaying2DSamples_zero", re: /m_numPlaying2DSamples\s*=\s*0/ },
      { key: "m_numPlaying3DSamples_zero", re: /m_numPlaying3DSamples\s*=\s*0/ },
    ], errors, facts);
    // Positive contract: reset must NOT touch the configured limits.
    if (defLine > 0) {
      const range = functionBodyLineRange(sounds.lines, defLine);
      const limitTouched = range
        ? firstMatchInRange(
            sounds.lines,
            range.start,
            range.end,
            /m_num2DSamples\s*=\s*0|m_num3DSamples\s*=\s*0/,
          )
        : -1;
      facts.resetBody.limits_must_not_be_zeroed = limitTouched;
      if (limitTouched !== -1) {
        errors.push(
          `${ownerTag(sounds.abs)}: reset must not zero m_num2DSamples/m_num3DSamples but found assignment at line ${limitTouched}`,
        );
      }
    } else {
      facts.resetBody.limits_must_not_be_zeroed = -1;
    }
  }

  // -----------------------------------------------------------------
  // 3. SoundManager::addAudioEvent — request-creation gate
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      sounds,
      "addAudioEventDefLine",
      /void\s+SoundManager\s*::\s*addAudioEvent\s*\(\s*AudioEventRTS\s*\*\s*eventToAdd\s*\)/,
      139,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "addAudioEventBody", [
      {
        key: "lazy_load_guard",
        re: /m_num2DSamples\s*==\s*0\s*&&\s*m_num3DSamples\s*==\s*0/,
      },
      {
        key: "m_num2DSamples_from_audio",
        re: /m_num2DSamples\s*=\s*TheAudio\s*->\s*getNum2DSamples\s*\(\s*\)/,
      },
      {
        key: "m_num3DSamples_from_audio",
        re: /m_num3DSamples\s*=\s*TheAudio\s*->\s*getNum3DSamples\s*\(\s*\)/,
      },
      { key: "canPlayNow_gate", re: /\bcanPlayNow\s*\(\s*eventToAdd\s*\)/ },
      {
        key: "allocateAudioRequest",
        re: /TheAudio\s*->\s*allocateAudioRequest\s*\(\s*true\s*\)/,
      },
      {
        key: "m_pendingEvent_assign",
        re: /m_pendingEvent\s*=\s*eventToAdd/,
      },
      { key: "AR_Play_assign", re: /m_request\s*=\s*AR_Play/ },
      {
        key: "appendAudioRequest",
        re: /TheAudio\s*->\s*appendAudioRequest\s*\(\s*audioRequest\s*\)/,
      },
      {
        key: "releaseAudioEventRTS_on_fail",
        re: /TheAudio\s*->\s*releaseAudioEventRTS\s*\(\s*eventToAdd\s*\)/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 4. notifyOf*SampleStart — counter increments
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      sounds,
      "notifyOf2DSampleStartDefLine",
      /void\s+SoundManager\s*::\s*notifyOf2DSampleStart\s*\(\s*void\s*\)/,
      160,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "notifyOf2DSampleStartBody", [
      { key: "increment", re: /\+\+\s*m_numPlaying2DSamples/ },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      sounds,
      "notifyOf3DSampleStartDefLine",
      /void\s+SoundManager\s*::\s*notifyOf3DSampleStart\s*\(\s*void\s*\)/,
      166,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "notifyOf3DSampleStartBody", [
      { key: "increment", re: /\+\+\s*m_numPlaying3DSamples/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 5. notifyOf*SampleCompletion — guarded counter decrements
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      sounds,
      "notifyOf2DSampleCompletionDefLine",
      /void\s+SoundManager\s*::\s*notifyOf2DSampleCompletion\s*\(\s*void\s*\)/,
      172,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "notifyOf2DSampleCompletionBody", [
      { key: "guard_gt_0", re: /m_numPlaying2DSamples\s*>\s*0/ },
      { key: "decrement", re: /--\s*m_numPlaying2DSamples/ },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      sounds,
      "notifyOf3DSampleCompletionDefLine",
      /void\s+SoundManager\s*::\s*notifyOf3DSampleCompletion\s*\(\s*void\s*\)/,
      180,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "notifyOf3DSampleCompletionBody", [
      { key: "guard_gt_0", re: /m_numPlaying3DSamples\s*>\s*0/ },
      { key: "decrement", re: /--\s*m_numPlaying3DSamples/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 6. getAvailableSamples / getAvailable3DSamples — availability arithmetic
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      sounds,
      "getAvailableSamplesDefLine",
      /Int\s+SoundManager\s*::\s*getAvailableSamples\s*\(\s*void\s*\)/,
      188,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "getAvailableSamplesBody", [
      {
        key: "return_difference",
        re: /return\s*\(\s*m_num2DSamples\s*-\s*m_numPlaying2DSamples\s*\)/,
      },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      sounds,
      "getAvailable3DSamplesDefLine",
      /Int\s+SoundManager\s*::\s*getAvailable3DSamples\s*\(\s*void\s*\)/,
      194,
      errors,
      facts,
    );
    pinOrderedBody(sounds, defLine, "getAvailable3DSamplesBody", [
      {
        key: "return_difference",
        re: /return\s*\(\s*m_num3DSamples\s*-\s*m_numPlaying3DSamples\s*\)/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 7. canPlayNow — the play-limit decision (counter frontier)
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      sounds,
      "canPlayNowDefLine",
      /Bool\s+SoundManager\s*::\s*canPlayNow\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      206,
      errors,
      facts,
    );
    // The 2D/3D counter check is the heart of this frontier. Surrounding
    // gates are pinned for relative position; their semantics are owned by
    // other headers/verifiers. isPositionalAudio()/isInterrupting() recur
    // several times in this body, so use cursor-based scanning rather than
    // "first match in body".
    pinOrderedCursor(sounds, defLine, "canPlayNowBody", [
      {
        key: "positional_branch_entry",
        re: /event\s*->\s*isPositionalAudio\s*\(\s*\)/,
      },
      { key: "violatesVoice_call", re: /\bviolatesVoice\s*\(\s*event\s*\)/ },
      { key: "isInterrupting_after_voice", re: /\bisInterrupting\s*\(\s*event\s*\)/ },
      { key: "doesViolateLimit", re: /TheAudio\s*->\s*doesViolateLimit\s*\(\s*event\s*\)/ },
      { key: "isInterrupting_after_limit", re: /\bisInterrupting\s*\(\s*event\s*\)/ },
      // The counter check itself, with the positional (3D) branch first.
      {
        key: "positional_3D_branch",
        re: /\bevent\s*->\s*isPositionalAudio\s*\(\s*\)/,
      },
      {
        key: "m_numPlaying3DSamples_lt_m_num3DSamples",
        re: /m_numPlaying3DSamples\s*<\s*m_num3DSamples/,
      },
      {
        key: "m_numPlaying2DSamples_lt_m_num2DSamples",
        re: /m_numPlaying2DSamples\s*<\s*m_num2DSamples/,
      },
      { key: "isPlayingLowerPriority", re: /TheAudio\s*->\s*isPlayingLowerPriority\s*\(\s*event\s*\)/ },
      { key: "isInterrupting_final", re: /\bisInterrupting\s*\(\s*event\s*\)/ },
      { key: "isPlayingAlready", re: /TheAudio\s*->\s*isPlayingAlready\s*\(\s*event\s*\)/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 8. violatesVoice / isInterrupting — canPlayNow collaborators
  // -----------------------------------------------------------------
  pinDef(
    sounds,
    "violatesVoiceDefLine",
    /Bool\s+SoundManager\s*::\s*violatesVoice\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
    321,
    errors,
    facts,
  );
  pinDef(
    sounds,
    "isInterruptingDefLine",
    /Bool\s+SoundManager\s*::\s*isInterrupting\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
    330,
    errors,
    facts,
  );

  // -----------------------------------------------------------------
  // 9. AudioManager base accessors used by SoundManager (GameAudio.h)
  //    These are the audio-settings limit/availability surface a Web Audio
  //    backend must expose so SoundManager's gate is unchanged.
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      { key: "getNum2DSamples_decl", line: 213, re: /virtual\s+UnsignedInt\s+getNum2DSamples\s*\(\s*void\s*\)\s*const\s*=\s*0/ },
      { key: "getNum3DSamples_decl", line: 214, re: /virtual\s+UnsignedInt\s+getNum3DSamples\s*\(\s*void\s*\)\s*const\s*=\s*0/ },
      { key: "doesViolateLimit_decl", line: 218, re: /virtual\s+Bool\s+doesViolateLimit\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)\s*const\s*=\s*0/ },
      { key: "isPlayingLowerPriority_decl", line: 219, re: /virtual\s+Bool\s+isPlayingLowerPriority\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)\s*const\s*=\s*0/ },
      { key: "isPlayingAlready_decl", line: 220, re: /virtual\s+Bool\s+isPlayingAlready\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)\s*const\s*=\s*0/ },
      { key: "allocateAudioRequest_decl", line: 252, re: /virtual\s+AudioRequest\s*\*\s*allocateAudioRequest\s*\(\s*Bool\s+useAudioEvent\s*\)/ },
      { key: "appendAudioRequest_decl", line: 254, re: /virtual\s+void\s+appendAudioRequest\s*\(\s*AudioRequest\s*\*\s*m_request\s*\)/ },
      { key: "releaseAudioEventRTS_decl", line: 265, re: /virtual\s+void\s+releaseAudioEventRTS\s*\(\s*AudioEventRTS\s*\*\s*eventToRelease\s*\)/ },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(gameAudioH.lines, (l) => re.test(l));
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(gameAudioH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioManagerBaseAccessors = out;
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
