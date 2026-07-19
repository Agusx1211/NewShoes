#!/usr/bin/env node
// verify_audio_3d_zoom_volume_frontier.mjs
//
// Source-only verifier that pins the original *3D zoom / volume-adjustment*
// frontier that a Web Audio backend must preserve. It reads (never executes)
// the original Zero Hour C++ source and asserts the 3D-volume surface in
// AudioManager (GameAudio), the zoom-driven set3DVolumeAdjustment recompute,
// and the MilesAudioManager path that pushes the recomputed 3D volume into
// already-playing 3D samples, emitting a JSON report { ok, errors, sources, facts }.
//
// This is the 3D-zoom/volume-adjustment companion to:
//   - verify_miles_audio_volume_frontier.mjs (the broad *volume / mixer*
//       frontier: AudioManager volume/on-off/focus surface, AudioEventRTS
//       volume/pitch derivation, and the Miles push-volume/pan/pitch calls).
//       That verifier pins the field decls (m_sound3DVolume, m_zoomVolume,
//       m_volumeHasChanged, script/system volume fields) and the
//       adjustPlayingVolume call sites as anchors, but does NOT walk the
//       set3DVolumeAdjustment recompute body, the setVolume Sound3D branch,
//       or the per-loop m_volumeHasChanged->adjustPlayingVolume application
//       path. This verifier pins ONLY that 3D-zoom / volume-adjustment slice:
//       the setVolume Sound3D system-vs-script recompute, the full
//       set3DVolumeAdjustment body, the (absent) get3DVolumeAdjustment, the
//       inline getZoomVolume, and the processPlayingList volume-application
//       loops. The broad volume/mixer facts are intentionally NOT re-pinned
//       here.
//   - verify_audio_3d_position_frontier.mjs (the 3D *position* frontier;
//       pins adjustPlayingVolume's PAT_3DSample branch + AIL_set_3D_sample_volume
//       as a position-adjacent anchor). This verifier re-walks the
//       adjustPlayingVolume 3D branch only to pin the exact
//       `m_sound3DVolume * desiredVolume` expression that the zoom recompute
//       ultimately feeds; the position frontier owns the broader positional
//       semantics.
//
// No playback, asset decoding, or C++ execution is performed. No
// package.json, docs, TODO, DONE, SOURCE_INVENTORY, harness, or shim files
// are touched by this tool.
//
// Verified facts (all source-only, bounded line + ordered function-body scans):
//
//   GameAudio.h (AudioManager 3D-zoom/volume-adjustment declaration surface):
//     - set3DVolumeAdjustment decl @ 237.
//     - getZoomVolume inline @ 302 (returns m_zoomVolume). This is the only
//       zoom-volume getter on AudioManager.
//     - get3DVolumeAdjustment is ABSENT on AudioManager (reported as a
//       positive -1 fact, not an error): the engine exposes zoom volume via
//       getZoomVolume(), not a get3DVolumeAdjustment() accessor.
//     - m_sound3DVolume field @ 341, m_scriptSound3DVolume field @ 346,
//       m_systemSound3DVolume field @ 351, m_zoomVolume field @ 353.
//
//   GameAudio.cpp:
//     - setVolume @ 714 — AudioAffect_Sound3D branch (ordered): the
//       AudioAffect_Sound3D guard, the AudioAffect_SystemSetting ->
//       m_systemSound3DVolume = volume assignment, the else ->
//       m_scriptSound3DVolume = volume assignment, the
//       m_sound3DVolume = m_scriptSound3DVolume * m_systemSound3DVolume
//       recompute. The function tail sets m_volumeHasChanged = true @ 754
//       (so a plain setVolume marks the device to re-push volumes).
//     - set3DVolumeAdjustment @ 773 — body (ordered):
//         m_sound3DVolume = volumeAdjustment * m_scriptSound3DVolume *
//                           m_systemSound3DVolume,
//         clamp-below guard (m_sound3DVolume < 0.0f -> 0.0f),
//         clamp-above guard (m_sound3DVolume > 1.0f -> 1.0f),
//         has3DSensitiveStreamsPlaying() guard -> m_volumeHasChanged = TRUE.
//       IMPORTANT FACT: set3DVolumeAdjustment does NOT store m_zoomVolume.
//       m_zoomVolume is computed in AudioManager::update() (@ 313) from
//       camera/microphone distance + m_zoomSoundVolumePercentageAmount and
//       is then passed into set3DVolumeAdjustment(m_zoomVolume) @ 394. So
//       the zoom factor is the *argument*, not a field written here. This is
//       reported as a fact (m_zoomVolume absent from the body), not an error.
//
//   MilesAudioManager.cpp:
//     - adjustPlayingVolume @ 1280 — PAT_3DSample branch: computes
//       desiredVolume = getVolume() * getVolumeShift(), then
//       AIL_set_3D_sample_volume(audio->m_3DSample, m_sound3DVolume *
//       desiredVolume). This is the single point where the recomputed 3D
//       volume (set by set3DVolumeAdjustment) reaches already-playing 3D
//       samples.
//     - processPlayingList @ 2325 — the per-frame volume-application path
//       that fires on m_volumeHasChanged: each of the m_playingSounds /
//       m_playing3DSounds / m_playingStreams loops guards
//       adjustPlayingVolume(playing) on m_volumeHasChanged, and the function
//       tail resets m_volumeHasChanged = false. So a zoom change flips
//       m_volumeHasChanged via set3DVolumeAdjustment, and the next
//       processPlayingList re-pushes every playing sample's volume.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
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

// Pin a single definition line and record it, erroring on drift.
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
// recurs several times in one body (e.g. m_volumeHasChanged in
// processPlayingList).
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

  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const miles = readSourceLines(SOURCES.milesCpp);

  // -----------------------------------------------------------------
  // 1. GameAudio.h — AudioManager 3D-zoom/volume-adjustment decl surface
  // -----------------------------------------------------------------
  {
    facts.gameAudioHDecls = {};
    const decls = [
      {
        key: "set3DVolumeAdjustment_decl",
        line: 237,
        re: /virtual\s+void\s+set3DVolumeAdjustment\s*\(\s*Real\s+volumeAdjustment\s*\)/,
      },
      {
        key: "getZoomVolume_inline",
        line: 302,
        re: /Real\s+getZoomVolume\s*\(\s*\)\s*const\s*\{\s*return\s+m_zoomVolume\s*;\s*\}/,
      },
      { key: "m_sound3DVolume_field", line: 341, re: /Real\s+m_sound3DVolume\s*;/ },
      {
        key: "m_scriptSound3DVolume_field",
        line: 346,
        re: /Real\s+m_scriptSound3DVolume\s*;/,
      },
      {
        key: "m_systemSound3DVolume_field",
        line: 351,
        re: /Real\s+m_systemSound3DVolume\s*;/,
      },
      { key: "m_zoomVolume_field", line: 353, re: /Real\s+m_zoomVolume\s*;/ },
    ];
    for (const { key, line, re } of decls) {
      pinDecl(gameAudioH, key, re, line, errors, facts, "gameAudioHDecls");
    }

    // Positive contract: get3DVolumeAdjustment must NOT exist on AudioManager.
    // The engine exposes zoom volume via getZoomVolume(), not a getter named
    // get3DVolumeAdjustment(). Recorded as a fact, asserted as absence.
    const get3DLine = lineNumber(
      gameAudioH.lines,
      (l) => /get3DVolumeAdjustment\s*\(/.test(l),
    );
    facts.gameAudioHDecls.get3DVolumeAdjustment_absent = get3DLine;
    if (get3DLine !== -1) {
      errors.push(
        `${ownerTag(gameAudioH.abs)}: expected NO get3DVolumeAdjustment (zoom volume is exposed via getZoomVolume) but found at line ${get3DLine}`,
      );
    }
  }

  // -----------------------------------------------------------------
  // 2. GameAudio.cpp — setVolume AudioAffect_Sound3D branch + tail
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      gameAudio,
      "setVolumeDefLine",
      /void\s+AudioManager\s*::\s*setVolume\s*\(\s*Real\s+volume\s*,\s*AudioAffect\s+whichToAffect\s*\)/,
      714,
      errors,
      facts,
    );
    // Cursor-scan: AudioAffect_SystemSetting recurs in every volume branch
    // (Music/Sound/Sound3D/Speech), so each anchor must land at/after the
    // previous one to stay inside the Sound3D block.
    pinOrderedCursor(gameAudio, defLine, "setVolumeSound3DBranch", [
      {
        key: "AudioAffect_Sound3D_guard",
        re: /whichToAffect\s*&\s*AudioAffect_Sound3D/,
      },
      {
        key: "system_assignment",
        re: /whichToAffect\s*&\s*AudioAffect_SystemSetting\s*\)/,
      },
      {
        key: "m_systemSound3DVolume_assign",
        re: /m_systemSound3DVolume\s*=\s*volume/,
      },
      {
        key: "m_scriptSound3DVolume_assign",
        re: /m_scriptSound3DVolume\s*=\s*volume/,
      },
      {
        key: "m_sound3DVolume_recompute",
        re: /m_sound3DVolume\s*=\s*m_scriptSound3DVolume\s*\*\s*m_systemSound3DVolume/,
      },
      // Function tail: any setVolume call marks the device to re-push volumes.
      { key: "m_volumeHasChanged_true", re: /m_volumeHasChanged\s*=\s*true/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 3. GameAudio.cpp — set3DVolumeAdjustment full body
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      gameAudio,
      "set3DVolumeAdjustmentDefLine",
      /void\s+AudioManager\s*::\s*set3DVolumeAdjustment\s*\(\s*Real\s+volumeAdjustment\s*\)/,
      773,
      errors,
      facts,
    );
    pinOrderedBody(gameAudio, defLine, "set3DVolumeAdjustmentBody", [
      {
        key: "m_sound3DVolume_multiply",
        re: /m_sound3DVolume\s*=\s*volumeAdjustment\s*\*\s*m_scriptSound3DVolume\s*\*\s*m_systemSound3DVolume/,
      },
      {
        key: "clamp_below_guard",
        re: /if\s*\(\s*m_sound3DVolume\s*<\s*0\.0f\s*\)/,
      },
      {
        key: "clamp_below_zero",
        re: /m_sound3DVolume\s*=\s*0\.0f/,
      },
      {
        key: "clamp_above_guard",
        re: /if\s*\(\s*m_sound3DVolume\s*>\s*1\.0f\s*\)/,
      },
      {
        key: "clamp_above_one",
        re: /m_sound3DVolume\s*=\s*1\.0f/,
      },
      {
        key: "has3DSensitiveStreamsPlaying_guard",
        re: /has3DSensitiveStreamsPlaying\s*\(\s*\)/,
      },
      { key: "m_volumeHasChanged_TRUE", re: /m_volumeHasChanged\s*=\s*TRUE/ },
    ], errors, facts);

    // FACT (not an error): set3DVolumeAdjustment does NOT store m_zoomVolume.
    // The zoom factor is the *argument*; m_zoomVolume is computed in
    // AudioManager::update() (@ 313) from camera/microphone distance and
    // passed in as set3DVolumeAdjustment(m_zoomVolume) @ 394. Assert this
    // absence positively so a future drift that adds a write here is caught
    // and reviewed.
    const range = functionBodyLineRange(gameAudio.lines, defLine);
    const zoomWrite =
      range === null
        ? -1
        : firstMatchInRange(
            gameAudio.lines,
            range.start,
            range.end,
            /m_zoomVolume\s*=/,
          );
    facts.set3DVolumeAdjustmentBody.m_zoomVolume_write_absent = zoomWrite;
    if (zoomWrite !== -1) {
      errors.push(
        `${ownerTag(gameAudio.abs)}: set3DVolumeAdjustment was expected NOT to write m_zoomVolume (zoom factor is the argument, computed in update()) but a write was found at line ${zoomWrite}`,
      );
    }

    // Anchor the caller that supplies the zoom argument, so the
    // "m_zoomVolume is the argument" claim is source-grounded.
    facts.set3DVolumeAdjustmentBody.updateDefLine = findMemberDef(
      gameAudio.lines,
      /void\s+AudioManager\s*::\s*update\s*\(\s*\)/,
    );
    facts.set3DVolumeAdjustmentBody.call_set3DVolumeAdjustment_m_zoomVolume =
      lineNumber(
        gameAudio.lines,
        (l) => /set3DVolumeAdjustment\s*\(\s*m_zoomVolume\s*\)/.test(l),
      );
  }

  // -----------------------------------------------------------------
  // 4. MilesAudioManager.cpp — adjustPlayingVolume 3D sample branch
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "adjustPlayingVolumeDefLine",
      /void\s+MilesAudioManager\s*::\s*adjustPlayingVolume\s*\(\s*PlayingAudio\s*\*\s*audio\s*\)/,
      1280,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "adjustPlayingVolume3DBranch", [
      {
        key: "desiredVolume",
        re: /Real\s+desiredVolume\s*=\s*audio\s*->\s*m_audioEventRTS\s*->\s*getVolume\s*\(\s*\)\s*\*\s*audio\s*->\s*m_audioEventRTS\s*->\s*getVolumeShift\s*\(\s*\)/,
      },
      { key: "PAT_3DSample_branch", re: /audio\s*->\s*m_type\s*==\s*PAT_3DSample/ },
      {
        key: "AIL_set_3D_sample_volume",
        re: /AIL_set_3D_sample_volume\s*\(\s*audio\s*->\s*m_3DSample\s*,\s*m_sound3DVolume\s*\*\s*desiredVolume\s*\)/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 5. MilesAudioManager.cpp — processPlayingList volume-application path.
  //    A zoom change flips m_volumeHasChanged via set3DVolumeAdjustment; the
  //    next processPlayingList re-pushes every playing sample's volume via
  //    adjustPlayingVolume, then clears the flag.
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "processPlayingListDefLine",
      /void\s+MilesAudioManager\s*::\s*processPlayingList\s*\(\s*void\s*\)/,
      2325,
      errors,
      facts,
    );
    // The m_volumeHasChanged/adjustPlayingVolume tokens recur across the three
    // loops, so cursor-scan them in source order.
    pinOrderedCursor(miles, defLine, "processPlayingListVolumePath", [
      {
        key: "m_playingSounds_volumeHasChanged",
        re: /if\s*\(\s*m_volumeHasChanged\s*\)/,
      },
      { key: "m_playingSounds_adjustPlayingVolume", re: /adjustPlayingVolume\s*\(\s*playing\s*\)/ },
      {
        key: "m_playing3DSounds_volumeHasChanged",
        re: /if\s*\(\s*m_volumeHasChanged\s*\)/,
      },
      { key: "m_playing3DSounds_adjustPlayingVolume", re: /adjustPlayingVolume\s*\(\s*playing\s*\)/ },
      {
        key: "m_playingStreams_volumeHasChanged",
        re: /if\s*\(\s*m_volumeHasChanged\s*\)/,
      },
      { key: "m_playingStreams_adjustPlayingVolume", re: /adjustPlayingVolume\s*\(\s*playing\s*\)/ },
      { key: "m_volumeHasChanged_reset_false", re: /m_volumeHasChanged\s*=\s*false/ },
    ], errors, facts);
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
