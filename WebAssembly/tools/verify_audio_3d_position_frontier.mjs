#!/usr/bin/env node
// verify_audio_3d_position_frontier.mjs
//
// Source-only verifier that pins the original *3D / positional audio* frontier
// that a Web Audio backend must preserve. It reads (never executes) the
// original Zero Hour source and asserts the position/positional state on
// AudioEventRTS, the positional gating inside SoundManager::canPlayNow, and
// the Miles 3D sample / listener application path, emitting a JSON report
// { ok, errors, sources, facts }.
//
// This is the 3D-position companion to:
//   - verify_audio_sound_manager_counters_frontier.mjs (SoundManager *counter*
//       / request-gate; owns the full canPlayNow counter/limit/interrupt tail
//       and the addAudioEvent request-creation gate). This verifier pins ONLY
//       the positional slice of canPlayNow: the early distance/shroud cull and
//       the positional-vs-2D channel-availability branch. The counter/limit/
//       interrupt tail is intentionally NOT re-pinned here.
//   - verify_audio_sample_start_frontier.mjs (Miles *sample-start* frontier;
//       owns the full playAudioEvent 2D/3D/stream branching, getFirst3DSample
//       pool selection, and the complete playSample3D start body). This
//       verifier pins ONLY the 3D-position-relevant call sites: the one-shot
//       3D position/distances application inside playSample3D, the per-frame
//       3D sample position update loop in processPlayingList, the listener
//       position/orientation application, and the 3D volume application. The
//       full playSample3D / playAudioEvent 3D-branch bodies are intentionally
//       NOT re-pinned here.
// Where those verifiers pin the counter gate and the full sample-start body,
// this verifier pins the cross-cut that is specific to *where 3D positions
// come from and how they are applied each frame*: AudioEventRTS positional
// state, the canPlayNow distance/shroud cull, getCurrentPositionFromEvent,
// the per-frame 3D sample position update, and the listener position/
// orientation path.
//
// No playback, asset decoding, or C++ execution is performed. No
// package.json, docs, TODO, DONE, SOURCE_INVENTORY, harness, or shim files
// are touched by this tool.
//
// Verified facts (all source-only, bounded line + ordered function-body scans):
//
//   AudioEventRTS position/positional declaration surface (AudioEventRTS.h):
//     - setPosition @ 110, getPosition @ 111, isPositionalAudio @ 134,
//       getCurrentPosition @ 154, m_positionOfAudio field @ 179.
//
//   AudioEventRTS::setPosition @ 553 — body: null pos guard, ownerType guard
//     (OT_Positional | OT_INVALID), m_positionOfAudio = *pos,
//     m_ownerType = OT_Positional.
//   AudioEventRTS::getPosition @ 568 — body: if ownerType != OT_INVALID return
//     &m_positionOfAudio else NULL.
//   AudioEventRTS::isPositionalAudio @ 670 — body: m_eventInfo guard, ST_WORLD
//     BitTest (return FALSE if not world), ownerType != OT_INVALID with
//     drawable/object/positional -> TRUE.
//   AudioEventRTS::getCurrentPosition @ 729 — body: ownerType switch over
//     OT_Positional / OT_Object (findObjectByID) / OT_Drawable
//     (findDrawableByID) / OT_Dead, else NULL.
//
//   SoundManager::canPlayNow positional gating (GameSounds.cpp @ 206):
//     - Early distance/shroud cull (ordered): the
//       isPositionalAudio() && !ST_GLOBAL && priority != AP_CRITICAL guard,
//       getListenerPosition, event->getCurrentPosition(), distance.sub(pos),
//       distance.length() >= m_maxDistance, ST_SHROUDED +
//       getShroudStatusForPlayer + CELLSHROUD_CLEAR.
//     - Positional-vs-2D channel-availability branch (ordered):
//       event->isPositionalAudio() -> m_numPlaying3DSamples < m_num3DSamples
//       (return true), else m_numPlaying2DSamples < m_num2DSamples. (The
//       surrounding counter/limit/interrupt tail is owned by
//       verify_audio_sound_manager_counters_frontier.mjs.)
//
//   Miles 3D sample / listener path (MilesAudioManager.cpp / .h):
//     - getCurrentPositionFromEvent @ 2664 (decl @ 236) — the 3D position
//       source helper: isPositionalAudio() guard -> event->getCurrentPosition()
//       (shared by playSample3D one-shot and processPlayingList per-frame).
//     - update() @ 484 — per-frame ordering: AudioManager::update(),
//       setDeviceListenerPosition(), processRequestList(), processPlayingList()
//       (listener position applied before the 3D sample position update).
//     - setDeviceListenerPosition @ 2651 (decl @ 235) — listener application:
//       m_listener guard, AIL_set_3D_orientation(m_listener, ...),
//       AIL_set_3D_position(m_listener, x, y, z).
//     - createListener @ 2871 (decl @ 250) — AIL_open_3D_listener (guarded by
//       isOn(AudioAffect_Sound3D) && isValidProvider()).
//     - processPlayingList @ 2266 — per-frame 3D sample position update loop:
//       m_playing3DSounds iteration, getCurrentPositionFromEvent(playing->...),
//       isDead() check, AIL_set_3D_position(playing->m_3DSample, x, y, z).
//     - playSample3D @ 2820 — one-shot 3D position/distances application
//       (3D-position subset only; full body owned by sample-start frontier):
//       getCurrentPositionFromEvent(event), AIL_set_3D_sample_distances
//       (ST_GLOBAL branch), AIL_set_3D_position(sample3D, x, y, z).
//     - adjustPlayingVolume @ 1243 — 3D volume application: PAT_3DSample
//       branch -> AIL_set_3D_sample_volume(audio->m_3DSample,
//       m_sound3DVolume * desiredVolume). (3D samples use position, not pan;
//       AIL_set_3D_sample_pan is intentionally absent — pinned as a positive
//       -1 fact.)
//
//   Listener-state surface (GameAudio.h): setListenerPosition @ 249,
//     getListenerPosition @ 250, m_listenerPosition @ 330,
//     m_listenerOrientation @ 331.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  audioEventRTSH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioEventRTS.h",
  audioEventRTSCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/AudioEventRTS.cpp",
  gameSoundsCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameSounds.cpp",
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  milesH:
    "GeneralsMD/Code/GameEngineDevice/Include/MilesAudioDevice/MilesAudioManager.h",
  milesCpp:
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

// Pin a single declaration line by regex and record it, erroring on drift.
function pinDecl(src, key, re, expected, errors, facts, sectionKey) {
  const ln = lineNumber(src.lines, (l) => re.test(l));
  facts[sectionKey][key] = ln;
  if (ln !== expected) {
    errors.push(
      `${ownerTag(src.abs)}: ${key} expected at line ${expected} but found at ${ln}`,
    );
  }
  return ln;
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

// Cursor-based ordered scan within a fixed body range: each entry must be
// found strictly at/after the previous match line. Used when the same token
// recurs several times in one body (e.g. isPositionalAudio() in canPlayNow).
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

function main() {
  const errors = [];
  const facts = {};

  const rtsH = readSourceLines(SOURCES.audioEventRTSH);
  const rts = readSourceLines(SOURCES.audioEventRTSCpp);
  const sounds = readSourceLines(SOURCES.gameSoundsCpp);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const milesH = readSourceLines(SOURCES.milesH);
  const miles = readSourceLines(SOURCES.milesCpp);

  // -----------------------------------------------------------------
  // 1. AudioEventRTS.h position/positional declaration surface
  // -----------------------------------------------------------------
  {
    facts.audioEventRTSDecls = {};
    const decls = [
      { key: "setPosition_decl", line: 110, re: /void\s+setPosition\s*\(\s*const\s+Coord3D\s*\*\s*pos\s*\)/ },
      { key: "getPosition_decl", line: 111, re: /const\s+Coord3D\s*\*\s*getPosition\s*\(\s*void\s*\)/ },
      { key: "isPositionalAudio_decl", line: 134, re: /Bool\s+isPositionalAudio\s*\(\s*void\s*\)\s*const/ },
      { key: "getCurrentPosition_decl", line: 154, re: /const\s+Coord3D\s*\*\s*getCurrentPosition\s*\(\s*void\s*\)/ },
      { key: "m_positionOfAudio_field", line: 179, re: /Coord3D\s+m_positionOfAudio\s*;/ },
    ];
    for (const { key, line, re } of decls) {
      pinDecl(rtsH, key, re, line, errors, facts, "audioEventRTSDecls");
    }
  }

  // -----------------------------------------------------------------
  // 2. AudioEventRTS.cpp position/positional definitions
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      rts,
      "setPositionDefLine",
      /void\s+AudioEventRTS\s*::\s*setPosition\s*\(\s*const\s+Coord3D\s*\*\s*pos\s*\)/,
      553,
      errors,
      facts,
    );
    pinOrderedBody(rts, defLine, "setPositionBody", [
      { key: "null_pos_guard", re: /if\s*\(\s*!pos\s*\)/ },
      {
        key: "ownerType_guard",
        re: /m_ownerType\s*==\s*OT_Positional\s*\|\|\s*m_ownerType\s*==\s*OT_INVALID/,
      },
      { key: "m_positionOfAudio_assign", re: /m_positionOfAudio\s*=\s*\*pos/ },
      { key: "m_ownerType_assign", re: /m_ownerType\s*=\s*OT_Positional/ },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      rts,
      "getPositionDefLine",
      /const\s+Coord3D\s*\*\s*AudioEventRTS\s*::\s*getPosition\s*\(\s*void\s*\)/,
      568,
      errors,
      facts,
    );
    pinOrderedBody(rts, defLine, "getPositionBody", [
      { key: "ownerType_guard", re: /m_ownerType\s*!=\s*OT_INVALID/ },
      { key: "return_position", re: /return\s+&m_positionOfAudio/ },
      { key: "return_null", re: /return\s+NULL/ },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      rts,
      "isPositionalAudioDefLine",
      /Bool\s+AudioEventRTS\s*::\s*isPositionalAudio\s*\(\s*void\s*\)\s*const/,
      670,
      errors,
      facts,
    );
    pinOrderedBody(rts, defLine, "isPositionalAudioBody", [
      { key: "m_eventInfo_guard", re: /if\s*\(\s*m_eventInfo\s*\)/ },
      {
        key: "ST_WORLD_BitTest",
        re: /BitTest\s*\(\s*m_eventInfo\s*->\s*m_type\s*,\s*ST_WORLD\s*\)/,
      },
      { key: "return_FALSE", re: /return\s+FALSE/ },
      { key: "ownerType_invalid_guard", re: /m_ownerType\s*!=\s*OT_INVALID/ },
      {
        key: "drawable_object_positional_test",
        re: /m_drawableID\s*!=\s*INVALID_DRAWABLE_ID\s*\|\|\s*m_objectID\s*!=\s*INVALID_ID\s*\|\|\s*m_ownerType\s*==\s*OT_Positional/,
      },
      { key: "return_TRUE", re: /return\s+TRUE/ },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      rts,
      "getCurrentPositionDefLine",
      /const\s+Coord3D\s*\*AudioEventRTS\s*::\s*getCurrentPosition\s*\(\s*void\s*\)/,
      729,
      errors,
      facts,
    );
    pinOrderedBody(rts, defLine, "getCurrentPositionBody", [
      { key: "OT_Positional", re: /m_ownerType\s*==\s*OT_Positional/ },
      { key: "OT_Object", re: /m_ownerType\s*==\s*OT_Object/ },
      {
        key: "findObjectByID",
        re: /TheGameLogic\s*->\s*findObjectByID\s*\(\s*m_objectID\s*\)/,
      },
      { key: "OT_Drawable", re: /m_ownerType\s*==\s*OT_Drawable/ },
      {
        key: "findDrawableByID",
        re: /TheGameClient\s*->\s*findDrawableByID\s*\(\s*m_drawableID\s*\)/,
      },
      { key: "OT_Dead", re: /m_ownerType\s*==\s*OT_Dead/ },
      { key: "return_null", re: /return\s+NULL/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 3. SoundManager::canPlayNow — positional gating slice ONLY
  //    (early distance/shroud cull + 3D-vs-2D channel branch). The
  //    counter/limit/interrupt tail is owned by
  //    verify_audio_sound_manager_counters_frontier.mjs.
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
    // isPositionalAudio() recurs in this body, so cursor-scan the positional
    // slice in source order.
    pinOrderedCursor(sounds, defLine, "canPlayNowPositionalSlice", [
      // The full early-cull guard lives on one source line, so match it as a
      // single combined anchor (positional + !ST_GLOBAL + priority != critical).
      {
        key: "early_cull_guard",
        re: /isPositionalAudio\s*\(\s*\)\s*&&\s*!BitTest.*ST_GLOBAL.*m_priority\s*!=\s*AP_CRITICAL/,
      },
      {
        key: "getListenerPosition",
        re: /TheAudio\s*->\s*getListenerPosition\s*\(\s*\)/,
      },
      {
        key: "event_getCurrentPosition",
        re: /event\s*->\s*getCurrentPosition\s*\(\s*\)/,
      },
      { key: "distance_sub", re: /distance\s*\.\s*sub\s*\(\s*pos\s*\)/ },
      {
        key: "maxDistance_cull",
        re: /distance\s*\.\s*length\s*\(\s*\)\s*>=\s*event\s*->\s*getAudioEventInfo\s*\(\s*\)\s*->\s*m_maxDistance/,
      },
      { key: "ST_SHROUDED", re: /\bST_SHROUDED\b/ },
      // getShroudStatusForPlayer and the CELLSHROUD_CLEAR comparison share one
      // source line, so match them as a single combined anchor.
      {
        key: "shroud_status_check",
        re: /getShroudStatusForPlayer\s*\(\s*localPlayerNdx\s*,\s*pos\s*\)\s*!=\s*CELLSHROUD_CLEAR/,
      },
      // Positional-vs-2D channel-availability branch (the counter verifier
      // owns the surrounding limit/interrupt logic).
      {
        key: "positional_branch_isPositionalAudio",
        re: /event\s*->\s*isPositionalAudio\s*\(\s*\)/,
      },
      {
        key: "m_numPlaying3DSamples_lt_m_num3DSamples",
        re: /m_numPlaying3DSamples\s*<\s*m_num3DSamples/,
      },
      {
        key: "m_numPlaying2DSamples_lt_m_num2DSamples",
        re: /m_numPlaying2DSamples\s*<\s*m_num2DSamples/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 4. Miles 3D sample / listener path
  // -----------------------------------------------------------------

  // 4a. getCurrentPositionFromEvent — the 3D position source helper.
  {
    const defLine = pinDef(
      miles,
      "getCurrentPositionFromEventDefLine",
      /const\s+Coord3D\s*\*MilesAudioManager\s*::\s*getCurrentPositionFromEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      2664,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "getCurrentPositionFromEventBody", [
      { key: "isPositionalAudio_guard", re: /event\s*->\s*isPositionalAudio\s*\(\s*\)/ },
      { key: "return_null", re: /return\s+NULL/ },
      {
        key: "event_getCurrentPosition",
        re: /event\s*->\s*getCurrentPosition\s*\(\s*\)/,
      },
    ], errors, facts);
  }

  // 4b. update() — per-frame listener-then-3D-update ordering.
  {
    const defLine = pinDef(
      miles,
      "updateDefLine",
      /void\s+MilesAudioManager\s*::\s*update\s*\(\s*\)/,
      484,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "updateBody", [
      { key: "AudioManager_update", re: /AudioManager\s*::\s*update\s*\(\s*\)/ },
      {
        key: "setDeviceListenerPosition_call",
        re: /\bsetDeviceListenerPosition\s*\(\s*\)/,
      },
      { key: "processRequestList_call", re: /\bprocessRequestList\s*\(\s*\)/ },
      { key: "processPlayingList_call", re: /\bprocessPlayingList\s*\(\s*\)/ },
    ], errors, facts);
  }

  // 4c. setDeviceListenerPosition — listener position/orientation application.
  {
    const defLine = pinDef(
      miles,
      "setDeviceListenerPositionDefLine",
      /void\s+MilesAudioManager\s*::\s*setDeviceListenerPosition\s*\(\s*void\s*\)/,
      2651,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "setDeviceListenerPositionBody", [
      { key: "m_listener_guard", re: /if\s*\(\s*m_listener\s*\)/ },
      {
        key: "AIL_set_3D_orientation",
        re: /AIL_set_3D_orientation\s*\(\s*m_listener\s*,/,
      },
      {
        key: "AIL_set_3D_position_listener",
        re: /AIL_set_3D_position\s*\(\s*m_listener\s*,\s*x\s*,\s*y\s*,\s*z\s*\)/,
      },
    ], errors, facts);
  }

  // 4d. createListener — AIL_open_3D_listener.
  {
    const defLine = pinDef(
      miles,
      "createListenerDefLine",
      /void\s+MilesAudioManager\s*::\s*createListener\s*\(\s*void\s*\)/,
      2871,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "createListenerBody", [
      {
        key: "isOn_Sound3D_guard",
        re: /isOn\s*\(\s*AudioAffect_Sound3D\s*\)\s*&&\s*isValidProvider\s*\(\s*\)/,
      },
      {
        key: "AIL_open_3D_listener",
        re: /AIL_open_3D_listener\s*\(\s*m_provider3D\s*\[\s*m_selectedProvider\s*\]\s*\.\s*id\s*\)/,
      },
    ], errors, facts);
  }

  // 4e. processPlayingList — per-frame 3D sample position update loop.
  {
    const defLine = pinDef(
      miles,
      "processPlayingListDefLine",
      /void\s+MilesAudioManager\s*::\s*processPlayingList\s*\(\s*void\s*\)/,
      2266,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "processPlayingList3DLoop", [
      {
        key: "m_playing3DSounds_begin",
        re: /m_playing3DSounds\s*\.\s*begin\s*\(\s*\)/,
      },
      {
        key: "getCurrentPositionFromEvent_playing",
        re: /getCurrentPositionFromEvent\s*\(\s*playing\s*->\s*m_audioEventRTS\s*\)/,
      },
      {
        key: "isDead_check",
        re: /playing\s*->\s*m_audioEventRTS\s*->\s*isDead\s*\(\s*\)/,
      },
      {
        key: "AIL_set_3D_position_playing",
        re: /AIL_set_3D_position\s*\(\s*playing\s*->\s*m_3DSample\s*,\s*x\s*,\s*y\s*,\s*z\s*\)/,
      },
    ], errors, facts);
  }

  // 4f. playSample3D — one-shot 3D position/distances application. ONLY the
  //     3D-position subset is pinned here; the full start body (file load,
  //     EOS callback registration, AIL_set_3D_sample_file, initFilters3D,
  //     AIL_start_3D_sample) is owned by verify_audio_sample_start_frontier.mjs.
  {
    const defLine = pinDef(
      miles,
      "playSample3DDefLine",
      /void\s*\*\s*MilesAudioManager\s*::\s*playSample3D\s*\(\s*AudioEventRTS\s*\*\s*event\s*,\s*H3DSAMPLE\s+sample3D\s*\)/,
      2820,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "playSample3DPositionSubset", [
      {
        key: "getCurrentPositionFromEvent_event",
        re: /getCurrentPositionFromEvent\s*\(\s*event\s*\)/,
      },
      {
        key: "AIL_set_3D_sample_distances",
        re: /AIL_set_3D_sample_distances\s*\(\s*sample3D\s*,/,
      },
      {
        key: "AIL_set_3D_position_sample3D",
        re: /AIL_set_3D_position\s*\(\s*sample3D\s*,\s*x\s*,\s*y\s*,\s*z\s*\)/,
      },
    ], errors, facts);
  }

  // 4g. adjustPlayingVolume — 3D volume application (PAT_3DSample branch).
  //     3D samples use position, not pan; AIL_set_3D_sample_pan is intentionally
  //     absent (asserted as a positive -1 fact below).
  {
    const defLine = pinDef(
      miles,
      "adjustPlayingVolumeDefLine",
      /void\s+MilesAudioManager\s*::\s*adjustPlayingVolume\s*\(\s*PlayingAudio\s*\*\s*audio\s*\)/,
      1243,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "adjustPlayingVolume3DBranch", [
      { key: "PAT_3DSample_branch", re: /audio\s*->\s*m_type\s*==\s*PAT_3DSample/ },
      {
        key: "AIL_set_3D_sample_volume",
        re: /AIL_set_3D_sample_volume\s*\(\s*audio\s*->\s*m_3DSample\s*,\s*m_sound3DVolume\s*\*\s*desiredVolume\s*\)/,
      },
    ], errors, facts);
    // Positive contract: 3D samples must NOT use a pan call.
    const panCall = lineNumber(
      miles.lines,
      (l) => /AIL_set_3D_sample_pan\s*\(/.test(l),
    );
    facts.adjustPlayingVolume3DBranch.AIL_set_3D_sample_pan_absent = panCall;
    if (panCall !== -1) {
      errors.push(
        `${ownerTag(miles.abs)}: expected NO AIL_set_3D_sample_pan (3D uses position, not pan) but found at line ${panCall}`,
      );
    }
  }

  // -----------------------------------------------------------------
  // 5. Miles header + GameAudio listener-state declaration anchors
  // -----------------------------------------------------------------
  {
    facts.milesHeader3DDecls = {};
    const decls = [
      {
        key: "setDeviceListenerPosition_decl",
        line: 235,
        re: /virtual\s+void\s+setDeviceListenerPosition\s*\(\s*void\s*\)/,
      },
      {
        key: "getCurrentPositionFromEvent_decl",
        line: 236,
        re: /const\s+Coord3D\s*\*getCurrentPositionFromEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      },
      {
        key: "createListener_decl",
        line: 250,
        re: /void\s+createListener\s*\(\s*void\s*\)/,
      },
      { key: "m_listener_field", line: 292, re: /H3DPOBJECT\s+m_listener\s*;/ },
    ];
    for (const { key, line, re } of decls) {
      pinDecl(milesH, key, re, line, errors, facts, "milesHeader3DDecls");
    }
  }
  {
    facts.listenerStateSurface = {};
    const decls = [
      {
        key: "setListenerPosition_decl",
        line: 249,
        re: /virtual\s+void\s+setListenerPosition\s*\(\s*const\s+Coord3D\s*\*\s*newListenerPos\s*,\s*const\s+Coord3D\s*\*\s*newListenerOrientation\s*\)/,
      },
      {
        key: "getListenerPosition_decl",
        line: 250,
        re: /virtual\s+const\s+Coord3D\s*\*\s*getListenerPosition\s*\(\s*void\s*\)\s*const/,
      },
      {
        key: "m_listenerPosition_field",
        line: 330,
        re: /Coord3D\s+m_listenerPosition\s*;/,
      },
      {
        key: "m_listenerOrientation_field",
        line: 331,
        re: /Coord3D\s+m_listenerOrientation\s*;/,
      },
    ];
    for (const { key, line, re } of decls) {
      pinDecl(gameAudioH, key, re, line, errors, facts, "listenerStateSurface");
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
