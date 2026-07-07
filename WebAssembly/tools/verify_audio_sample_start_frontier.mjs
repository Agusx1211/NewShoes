#!/usr/bin/env node
// verify_audio_sample_start_frontier.mjs
//
// Source-only verifier that pins the original 2D/3D/stream *sample-start*
// frontier that a Web Audio backend must preserve once
// MilesAudioManager::processRequest routes an AR_Play request into
// playAudioEvent. It reads (never executes) the original Common audio base
// source/header, the concrete Miles device source/header, the AudioEventInfo
// header that defines the branching enum, and the wasm compile-only Mss.H
// shim, and emits a JSON report { ok, errors, sources, facts }.
//
// This is the sample-start companion to:
//   - verify_audio_request_update_frontier.mjs (per-frame request *drain* +
//       AR_Play -> playAudioEvent routing switch; referenced here as the
//       *entry anchor* only, not re-pinned exhaustively)
//   - verify_miles_audio_playback_frontier.mjs (Miles *handle* pool alloc /
//       release / start of playSample/playSample3D/playStream at the AIL_start
//       level; referenced here as the *handle frontier* only)
//   - verify_audio_completion_frontier.mjs (EOS callback / cleanup tail)
// Where those verifiers pin the *drain*, the *handle lifecycle*, and the
// *completion tail*, this verifier pins the slice in between: what happens
// from the moment an AudioEventRTS enters playAudioEvent until each AIL_start_*
// call is reached — the branching into stream/3D/2D, the pool selection, the
// completion-callback registration, the file-load + AIL_set_* payload handoff,
// the volume/pan/3D-position setup, and the AIL_start_* calls.
//
// No playback, asset decoding, or C++ execution is performed. No
// package.json, docs, TODO, DONE, SOURCE_INVENTORY, harness, or shim files are
// touched by this tool (Mss.H is *read* only, never written).
//
// Verified facts (all source-only, bounded line + ordered function-body scans):
//
//   AudioEventInfo branching contract (AudioEventInfo.h):
//     - enum AudioType @ 44 with AT_Music @ 46, AT_Streaming @ 47,
//       AT_SoundEffect @ 48. playAudioEvent switch(info->m_soundType) routes on
//       these three values.
//
//   Entry anchor (MilesAudioManager.cpp processRequest, pinned exhaustively by
//   verify_audio_request_update_frontier.mjs):
//     - The AR_Play case body calls playAudioEvent(req->m_pendingEvent). This
//       verifier pins only that single forward edge as the frontier entry.
//
//   playAudioEvent branching (MilesAudioManager.cpp @ 661):
//     - switch(info->m_soundType) routes AT_Music | AT_Streaming into the
//       *stream* branch, AT_SoundEffect into the *sample* branch.
//     - Stream branch (no getFirstStream helper exists; streams are opened
//       directly via AIL_open_stream): ordered body — AIL_open_stream,
//       AIL_set_stream_volume_pan (volume/pan setup), playStream(...) call,
//       m_playingStreams.push_back.
//     - AT_SoundEffect positional (3D) branch: ordered body —
//       getFirst3DSample(...) selection (with killLowestPrioritySoundImmediately
//       fallback re-select), playSample3D(...) registration (returns m_file),
//       notifyOf3DSampleStart(), m_playing3DSounds.push_back.
//     - AT_SoundEffect non-positional (2D) branch: ordered body —
//       getFirst2DSample(...) selection (with killLowestPrioritySoundImmediately
//       fallback re-select), playSample(...) registration (returns m_file),
//       notifyOf2DSampleStart(), m_playingSounds.push_back.
//     - killLowestPrioritySoundImmediately is the pool-exhaustion fallback for
//       both 2D and 3D selection.
//
//   Pool selection (MilesAudioManager.cpp):
//     - getFirst2DSample @ 1216: draws from m_availableSamples pool.
//     - getFirst3DSample @ 1230: draws from m_available3DSamples pool.
//     - killLowestPrioritySoundImmediately @ 2051: the 3D fallback erases
//       from m_playing3DSounds after releasing the selected 3D sound, while
//       the 2D fallback erases from m_playingSounds after releasing the
//       selected 2D sound.
//     - There is NO getFirstStream; the stream path opens the handle directly
//       via AIL_open_stream inside playAudioEvent (pinned as a positive fact:
//       getFirstStreamDecl = -1, and streamOpenCall is the AIL_open_stream line
//       inside playAudioEvent).
//
//   playSample (MilesAudioManager.cpp @ 2826) — 2D sample start body order:
//     - AIL_init_sample, AIL_register_EOS_callback (completion callback
//       registration -> setSampleCompleted), initFilters, loadFileForRead
//       (file loading), AIL_set_sample_file (payload handoff),
//       AIL_start_sample.
//
//   playSample3D (MilesAudioManager.cpp @ 2848) — 3D sample start body order:
//     - getCurrentPositionFromEvent (3D position source), loadFileForRead
//       (file loading), AIL_set_3D_sample_file (payload handoff),
//       AIL_register_3D_EOS_callback (completion callback registration ->
//       set3DSampleCompleted), AIL_set_3D_sample_distances (3D attenuation
//       setup), AIL_set_3D_position (3D position setup), initFilters3D,
//       AIL_start_3D_sample.
//
//   playStream (MilesAudioManager.cpp @ 2783) — stream start body order:
//     - AIL_set_stream_loop_count (music only), AIL_register_stream_callback
//       (completion callback registration -> setStreamCompleted),
//       AIL_start_stream. (Stream volume/pan setup happens earlier in
//       playAudioEvent via AIL_set_stream_volume_pan.)
//
//   File loading (MilesAudioManager.cpp / AudioFileCache):
//     - loadFileForRead @ 1054 forwards to m_audioCache->openFile(event).
//     - closeFile @ 1060 forwards to m_audioCache->closeFile(fileRead).
//     - AudioFileCache::openFile (MilesAudioManager.cpp @ 3154) and
//       AudioFileCache::closeFile (@ 3245) own the real file-buffer lifecycle
//       (pinned as definition anchors only; their bodies are out of scope).
//
//   Header anchors (MilesAudioManager.h): playAudioEvent @ 256,
//     getCurrentPositionFromEvent @ 236, loadFileForRead @ 260, closeFile @ 261,
//     getFirst2DSample @ 270, getFirst3DSample @ 271, playStream @ 243,
//     playSample @ 245, playSample3D @ 246, initFilters @ 278, initFilters3D
//     @ 279, AudioFileCache::openFile @ 113, AudioFileCache::closeFile @ 114.
//     getFirstStream decl must NOT exist (positive -1 fact).
//
//   Mss.H shim (read-only): inert compile-only declarations present for every
//     AIL call on the sample-start frontier (AIL_open_stream,
//     AIL_set_stream_volume_pan, AIL_set_stream_loop_count,
//     AIL_register_stream_callback, AIL_start_stream, AIL_init_sample,
//     AIL_register_EOS_callback, AIL_set_sample_file, AIL_start_sample,
//     AIL_set_3D_sample_file, AIL_register_3D_EOS_callback,
//     AIL_set_3D_sample_distances, AIL_set_3D_position, AIL_start_3D_sample).
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  audioEventInfoH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioEventInfo.h",
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  milesH:
    "GeneralsMD/Code/GameEngineDevice/Include/MilesAudioDevice/MilesAudioManager.h",
  milesCpp:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  mssShim: "WebAssembly/shims/Mss.H",
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

// Cursor-based ordered scan: each entry must be found strictly after the
// previous match line and >= startLine, all within endLine. Used when several
// branches share one function body and "first match in body" would collide
// across branches. startLine anchors a specific branch region.
function pinOrderedCursor(src, startLine, endLine, key, order, errors, facts) {
  const positions = {};
  let cursor = startLine;
  let prevKey = null;
  for (const { key: k, re } of order) {
    const ln = firstMatchInRange(src.lines, cursor, endLine, re);
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

  const audioEventInfo = readSourceLines(SOURCES.audioEventInfoH);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const milesH = readSourceLines(SOURCES.milesH);
  const miles = readSourceLines(SOURCES.milesCpp);
  const shim = readSourceLines(SOURCES.mssShim);

  // -----------------------------------------------------------------
  // 0. AudioEventInfo.h: AudioType enum (the playAudioEvent switch key)
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      { key: "enum_AudioType", line: 44, re: /^enum\s+AudioType\b/ },
      { key: "AT_Music", line: 46, re: /\bAT_Music\b/ },
      { key: "AT_Streaming", line: 47, re: /\bAT_Streaming\b/ },
      { key: "AT_SoundEffect", line: 48, re: /\bAT_SoundEffect\b/ },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(audioEventInfo.lines, (l) => re.test(l));
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(audioEventInfo.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioTypeEnum = out;
  }

  // -----------------------------------------------------------------
  // 1. Entry anchor: processRequest AR_Play -> playAudioEvent forward edge
  //    (processRequest body is pinned exhaustively by
  //    verify_audio_request_update_frontier.mjs; here we only pin the single
  //    AR_Play -> playAudioEvent edge as the frontier entry point.)
  // -----------------------------------------------------------------
  {
    const defLine = findMemberDef(
      miles.lines,
      /void\s+MilesAudioManager\s*::\s*processRequest\s*\(\s*AudioRequest\s*\*\s*req\s*\)/,
    );
    facts.processRequestDefLine = defLine;
    const body = defLine > 0 ? functionBodyLineRange(miles.lines, defLine) : null;
    const arPlayPlayCall = body
      ? firstMatchInRange(
          miles.lines,
          body.start,
          body.end,
          /\bplayAudioEvent\s*\(\s*req\s*->\s*m_pendingEvent\s*\)/,
        )
      : -1;
    facts.processRequestAR_PlayEdge = { playAudioEventCall: arPlayPlayCall };
    if (defLine <= 0) {
      errors.push(`${ownerTag(miles.abs)}: processRequest definition not found`);
    }
    if (arPlayPlayCall === -1) {
      errors.push(
        `${ownerTag(miles.abs)}: processRequest AR_Play -> playAudioEvent(req->m_pendingEvent) edge not found`,
      );
    }
  }

  // -----------------------------------------------------------------
  // 2. playAudioEvent — the concrete branching start
  // -----------------------------------------------------------------
  const playAudioEventDefLine = pinDef(
    miles,
    "playAudioEventDefLine",
    /void\s+MilesAudioManager\s*::\s*playAudioEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
    661,
    errors,
    facts,
  );

  // 2a. Stream branch (AT_Music | AT_Streaming): open + volume/pan + playStream.
  {
    const range =
      playAudioEventDefLine > 0
        ? functionBodyLineRange(miles.lines, playAudioEventDefLine)
        : null;
    const positions = {};
    const order = [
      { key: "case_AT_Music", re: /\bcase\s+AT_Music\b/ },
      { key: "case_AT_Streaming", re: /\bcase\s+AT_Streaming\b/ },
      {
        key: "AIL_open_stream",
        re: /AIL_open_stream\s*\(\s*m_digitalHandle\s*,\s*fileToPlay\.str\s*\(\s*\)/,
      },
      {
        key: "AIL_set_stream_volume_pan",
        re: /AIL_set_stream_volume_pan\s*\(\s*stream\s*,\s*curVolume/,
      },
      { key: "playStream_call", re: /\bplayStream\s*\(\s*event\s*,\s*stream\s*\)/ },
      {
        key: "m_playingStreams_push_back",
        re: /m_playingStreams\s*\.\s*push_back\s*\(\s*audio\s*\)/,
      },
    ];
    if (!range) {
      for (const { key: k } of order) positions[k] = -1;
      errors.push(
        `${ownerTag(miles.abs)}: playAudioEvent body not found for stream-branch scan`,
      );
    } else {
      let prevLine = -1;
      let prevKey = null;
      for (const { key: k, re } of order) {
        const ln = firstMatchInRange(miles.lines, range.start, range.end, re);
        positions[k] = ln;
        if (ln === -1) {
          errors.push(
            `${ownerTag(miles.abs)}: playAudioEvent stream branch: expected ${k} not found`,
          );
        } else if (prevLine !== -1 && !(prevLine < ln)) {
          errors.push(
            `${ownerTag(miles.abs)}: playAudioEvent stream branch: ${k} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
          );
        }
        prevLine = ln;
        prevKey = k;
      }
    }
    facts.playAudioEventStreamBranch = positions;
  }

  // 2b. AT_SoundEffect positional (3D) branch. The 2D and 3D branches share
  // the same playAudioEvent body, so we scan from a per-branch anchor
  // (isPositionalAudio) with a moving cursor instead of "first match in body".
  {
    const range =
      playAudioEventDefLine > 0
        ? functionBodyLineRange(miles.lines, playAudioEventDefLine)
        : null;
    const start =
      range && range.start > 0
        ? firstMatchInRange(
            miles.lines,
            range.start,
            range.end,
            /\bisPositionalAudio\s*\(\s*\)/,
          )
        : -1;
    if (start === -1) {
      facts.playAudioEvent3DBranch = {
        isPositionalAudio_branch: -1,
        getFirst3DSample_call: -1,
        killLowestPrioritySoundImmediately_3D: -1,
        m_playing3DSounds_push_back: -1,
        playSample3D_call: -1,
        notifyOf3DSampleStart_call: -1,
      };
      errors.push(
        `${ownerTag(miles.abs)}: playAudioEvent 3D branch anchor isPositionalAudio() not found`,
      );
    } else {
      const end = range ? range.end : miles.lines.length;
      pinOrderedCursor(miles, start, end, "playAudioEvent3DBranch", [
        { key: "isPositionalAudio_branch", re: /\bisPositionalAudio\s*\(\s*\)/ },
        {
          key: "getFirst3DSample_call",
          re: /\bgetFirst3DSample\s*\(\s*event\s*\)/,
        },
        {
          key: "killLowestPrioritySoundImmediately_3D",
          re: /\bkillLowestPrioritySoundImmediately\s*\(\s*event\s*\)/,
        },
        {
          key: "m_playing3DSounds_push_back",
          re: /m_playing3DSounds\s*\.\s*push_back\s*\(\s*audio\s*\)/,
        },
        {
          key: "playSample3D_call",
          re: /\bplaySample3D\s*\(\s*event\s*,\s*sample3D\s*\)/,
        },
        {
          key: "notifyOf3DSampleStart_call",
          re: /\bnotifyOf3DSampleStart\s*\(\s*\)/,
        },
      ], errors, facts);
    }
  }

  // 2c. AT_SoundEffect non-positional (2D) branch. The 2D branch follows the
  // 3D branch inside the same body; anchor on getFirst2DSample(event) (which
  // uniquely begins the 2D selection region) and scan forward with a cursor.
  {
    const range =
      playAudioEventDefLine > 0
        ? functionBodyLineRange(miles.lines, playAudioEventDefLine)
        : null;
    const start =
      range && range.start > 0
        ? firstMatchInRange(
            miles.lines,
            range.start,
            range.end,
            /\bgetFirst2DSample\s*\(\s*event\s*\)/,
          )
        : -1;
    const end = range ? range.end : miles.lines.length;
    pinOrderedCursor(miles, start, end, "playAudioEvent2DBranch", [
      {
        key: "getFirst2DSample_call",
        re: /\bgetFirst2DSample\s*\(\s*event\s*\)/,
      },
      {
        key: "killLowestPrioritySoundImmediately_2D",
        re: /\bkillLowestPrioritySoundImmediately\s*\(\s*event\s*\)/,
      },
      {
        key: "m_playingSounds_push_back",
        re: /m_playingSounds\s*\.\s*push_back\s*\(\s*audio\s*\)/,
      },
      {
        key: "playSample_call",
        re: /\bplaySample\s*\(\s*event\s*,\s*sample\s*\)/,
      },
      {
        key: "notifyOf2DSampleStart_call",
        re: /\bnotifyOf2DSampleStart\s*\(\s*\)/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 3. Pool selection — getFirst2DSample / getFirst3DSample (no getFirstStream)
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "getFirst2DSampleDefLine",
      /HSAMPLE\s+MilesAudioManager\s*::\s*getFirst2DSample\s*\(/,
      1216,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "getFirst2DSampleBody", [
      { key: "m_availableSamples_begin", re: /m_availableSamples\s*\.\s*begin\s*\(\s*\)/ },
      { key: "m_availableSamples_erase", re: /m_availableSamples\s*\.\s*erase\s*\(/ },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      miles,
      "getFirst3DSampleDefLine",
      /H3DSAMPLE\s+MilesAudioManager\s*::\s*getFirst3DSample\s*\(/,
      1230,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "getFirst3DSampleBody", [
      {
        key: "m_available3DSamples_begin",
        re: /m_available3DSamples\s*\.\s*begin\s*\(\s*\)/,
      },
      { key: "m_available3DSamples_erase", re: /m_available3DSamples\s*\.\s*erase\s*\(/ },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      miles,
      "killLowestPrioritySoundImmediatelyDefLine",
      /Bool\s+MilesAudioManager\s*::\s*killLowestPrioritySoundImmediately\s*\(/,
      2051,
      errors,
      facts,
    );
    const range = functionBodyLineRange(miles.lines, defLine);
    pinOrderedCursor(
      miles,
      range ? range.start : -1,
      range ? range.end : -1,
      "killLowestPrioritySoundImmediatelyBody",
      [
        {
          key: "positional_branch",
          re: /\bevent\s*->\s*isPositionalAudio\s*\(\s*\)/,
        },
        {
          key: "m_playing3DSounds_iterate",
          re: /m_playing3DSounds\s*\.\s*begin\s*\(\s*\)/,
        },
        {
          key: "release_3d_lowest_priority",
          re: /\breleasePlayingAudio\s*\(\s*playing\s*\)/,
        },
        {
          key: "m_playing3DSounds_erase",
          re: /m_playing3DSounds\s*\.\s*erase\s*\(\s*it\s*\)/,
        },
        {
          key: "non_positional_branch",
          re: /^\s*else\s*$/,
        },
        {
          key: "m_playingSounds_iterate",
          re: /m_playingSounds\s*\.\s*begin\s*\(\s*\)/,
        },
        {
          key: "release_2d_lowest_priority",
          re: /\breleasePlayingAudio\s*\(\s*playing\s*\)/,
        },
        {
          key: "m_playingSounds_erase",
          re: /m_playingSounds\s*\.\s*erase\s*\(\s*it\s*\)/,
        },
      ],
      errors,
      facts,
    );
  }
  // There is intentionally NO getFirstStream helper. Streams are opened
  // directly via AIL_open_stream inside playAudioEvent. Assert that no
  // getFirstStream member exists anywhere in the device source/header, and
  // that the stream-open call is the AIL_open_stream line pinned in 2a.
  {
    const srcDecl = lineNumber(
      milesH.lines,
      (l) => /\bgetFirstStream\s*\(/.test(l),
    );
    const cppDecl = lineNumber(
      miles.lines,
      (l) => /\bMilesAudioManager\s*::\s*getFirstStream\s*\(/.test(l),
    );
    const streamOpenCall =
      playAudioEventDefLine > 0
        ? firstMatchInRange(
            miles.lines,
            (functionBodyLineRange(miles.lines, playAudioEventDefLine) || {
              start: 0,
            }).start,
            miles.lines.length,
            /AIL_open_stream\s*\(/,
          )
        : -1;
    facts.streamSelectionContract = {
      getFirstStreamHeaderDecl: srcDecl,
      getFirstStreamCppDef: cppDecl,
      getFirstStreamAbsent: srcDecl === -1 && cppDecl === -1,
      streamOpenCallInsidePlayAudioEvent: streamOpenCall,
    };
    if (srcDecl !== -1 || cppDecl !== -1) {
      errors.push(
        `${ownerTag(miles.abs)}: expected NO getFirstStream member (streams open via AIL_open_stream) but found header/cpp decl`,
      );
    }
    if (streamOpenCall === -1) {
      errors.push(
        `${ownerTag(miles.abs)}: AIL_open_stream stream-selection call not found in playAudioEvent`,
      );
    }
  }

  // -----------------------------------------------------------------
  // 4. playSample — 2D sample start body
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "playSampleDefLine",
      /void\s*\*\s*MilesAudioManager\s*::\s*playSample\s*\(/,
      2826,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "playSampleBody", [
      { key: "AIL_init_sample", re: /\bAIL_init_sample\s*\(/ },
      {
        key: "AIL_register_EOS_callback_setSampleCompleted",
        re: /AIL_register_EOS_callback\s*\(\s*sample\s*,\s*setSampleCompleted\s*\)/,
      },
      { key: "initFilters_call", re: /\binitFilters\s*\(\s*sample\s*,\s*event\s*\)/ },
      { key: "loadFileForRead_call", re: /\bloadFileForRead\s*\(\s*event\s*\)/ },
      {
        key: "AIL_set_sample_file",
        re: /AIL_set_sample_file\s*\(\s*sample\s*,\s*fileBuffer/,
      },
      { key: "AIL_start_sample", re: /\bAIL_start_sample\s*\(\s*sample\s*\)/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 5. playSample3D — 3D sample start body
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "playSample3DDefLine",
      /void\s*\*\s*MilesAudioManager\s*::\s*playSample3D\s*\(/,
      2848,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "playSample3DBody", [
      {
        key: "getCurrentPositionFromEvent_call",
        re: /\bgetCurrentPositionFromEvent\s*\(\s*event\s*\)/,
      },
      { key: "loadFileForRead_call", re: /\bloadFileForRead\s*\(\s*event\s*\)/ },
      {
        key: "AIL_set_3D_sample_file",
        re: /AIL_set_3D_sample_file\s*\(\s*sample3D\s*,\s*fileBuffer\s*\)/,
      },
      {
        key: "AIL_register_3D_EOS_callback_set3DSampleCompleted",
        re: /AIL_register_3D_EOS_callback\s*\(\s*sample3D\s*,\s*set3DSampleCompleted\s*\)/,
      },
      {
        key: "AIL_set_3D_sample_distances",
        re: /AIL_set_3D_sample_distances\s*\(\s*sample3D\s*,/,
      },
      {
        key: "AIL_set_3D_position",
        re: /AIL_set_3D_position\s*\(\s*sample3D\s*,\s*x\s*,\s*y\s*,\s*z\s*\)/,
      },
      {
        key: "initFilters3D_call",
        re: /\binitFilters3D\s*\(\s*sample3D\s*,\s*event\s*,\s*pos\s*\)/,
      },
      {
        key: "AIL_start_3D_sample",
        re: /\bAIL_start_3D_sample\s*\(\s*sample3D\s*\)/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 6. playStream — stream start body
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "playStreamDefLine",
      /void\s+MilesAudioManager\s*::\s*playStream\s*\(/,
      2783,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "playStreamBody", [
      {
        key: "AIL_set_stream_loop_count",
        re: /AIL_set_stream_loop_count\s*\(\s*stream\s*,\s*INFINITE_LOOP_COUNT\s*\)/,
      },
      {
        key: "AIL_register_stream_callback_setStreamCompleted",
        re: /AIL_register_stream_callback\s*\(\s*stream\s*,\s*setStreamCompleted\s*\)/,
      },
      { key: "AIL_start_stream", re: /\bAIL_start_stream\s*\(\s*stream\s*\)/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 7. File loading — loadFileForRead / closeFile + AudioFileCache anchors
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "loadFileForReadDefLine",
      /void\s*\*\s*MilesAudioManager\s*::\s*loadFileForRead\s*\(/,
      1054,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "loadFileForReadBody", [
      {
        key: "m_audioCache_openFile_call",
        re: /m_audioCache\s*->\s*openFile\s*\(\s*eventToLoadFrom\s*\)/,
      },
    ], errors, facts);
  }
  {
    const defLine = pinDef(
      miles,
      "closeFileDefLine",
      /void\s+MilesAudioManager\s*::\s*closeFile\s*\(\s*void\s*\*\s*fileRead\s*\)/,
      1060,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "closeFileBody", [
      {
        key: "m_audioCache_closeFile_call",
        re: /m_audioCache\s*->\s*closeFile\s*\(\s*fileRead\s*\)/,
      },
    ], errors, facts);
  }
  // AudioFileCache::openFile / closeFile definition anchors (the real
  // file-buffer lifecycle owners). Bodies are out of scope for this frontier.
  pinDef(
    miles,
    "audioFileCacheOpenFileDefLine",
    /void\s*\*\s*AudioFileCache\s*::\s*openFile\s*\(/,
    3154,
    errors,
    facts,
  );
  pinDef(
    miles,
    "audioFileCacheCloseFileDefLine",
    /void\s+AudioFileCache\s*::\s*closeFile\s*\(/,
    3245,
    errors,
    facts,
  );

  // -----------------------------------------------------------------
  // 8. Header declaration anchors for the sample-start frontier
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      { key: "playAudioEvent", line: 256, re: /\bplayAudioEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/ },
      {
        key: "getCurrentPositionFromEvent",
        line: 236,
        re: /\bgetCurrentPositionFromEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      },
      {
        key: "loadFileForRead",
        line: 260,
        re: /\bloadFileForRead\s*\(\s*AudioEventRTS\s*\*\s*eventToLoadFrom\s*\)/,
      },
      {
        key: "closeFile",
        line: 261,
        re: /\bcloseFile\s*\(\s*void\s*\*\s*fileRead\s*\)/,
      },
      {
        key: "getFirst2DSample",
        line: 270,
        re: /\bgetFirst2DSample\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      },
      {
        key: "getFirst3DSample",
        line: 271,
        re: /\bgetFirst3DSample\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      },
      {
        key: "getFirstStream_absent",
        line: -1,
        re: /\bgetFirstStream\s*\(/,
      },
      {
        key: "playStream",
        line: 243,
        re: /\bplayStream\s*\(\s*AudioEventRTS\s*\*\s*event\s*,\s*HSTREAM\s+stream\s*\)/,
      },
      {
        key: "playSample",
        line: 245,
        re: /\bplaySample\s*\(\s*AudioEventRTS\s*\*\s*event\s*,\s*HSAMPLE\s+sample\s*\)/,
      },
      {
        key: "playSample3D",
        line: 246,
        re: /\bplaySample3D\s*\(\s*AudioEventRTS\s*\*\s*event\s*,\s*H3DSAMPLE\s+sample3D\s*\)/,
      },
      {
        key: "initFilters",
        line: 278,
        re: /\binitFilters\s*\(\s*HSAMPLE\s+sample\s*,\s*const\s+AudioEventRTS\s*\*\s*eventInfo\s*\)/,
      },
      {
        key: "initFilters3D",
        line: 279,
        re: /\binitFilters3D\s*\(\s*H3DSAMPLE\s+sample\s*,\s*const\s+AudioEventRTS\s*\*\s*eventInfo\s*,\s*const\s+Coord3D\s*\*\s*pos\s*\)/,
      },
      // AudioFileCache public decls (nested class) in the same header.
      {
        key: "AudioFileCache_openFile",
        line: 113,
        re: /\bopenFile\s*\(\s*AudioEventRTS\s*\*\s*eventToOpenFrom\s*\)/,
      },
      {
        key: "AudioFileCache_closeFile",
        line: 114,
        re: /\bcloseFile\s*\(\s*void\s*\*\s*fileToClose\s*\)/,
      },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(milesH.lines, (l) => re.test(l));
      out[key] = ln;
      if (key === "getFirstStream_absent") {
        if (ln !== -1) {
          errors.push(
            `${ownerTag(milesH.abs)}: ${key} must NOT exist but found at line ${ln}`,
          );
        }
      } else if (ln !== line) {
        errors.push(
          `${ownerTag(milesH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.milesHeaderDecls = out;
  }

  // -----------------------------------------------------------------
  // 9. Mss.H shim: inert compile-only declarations for every frontier AIL call
  // -----------------------------------------------------------------
  const shimFunctions = [
    "AIL_open_stream",
    "AIL_set_stream_volume_pan",
    "AIL_set_stream_loop_count",
    "AIL_register_stream_callback",
    "AIL_start_stream",
    "AIL_init_sample",
    "AIL_register_EOS_callback",
    "AIL_set_sample_file",
    "AIL_start_sample",
    "AIL_set_3D_sample_file",
    "AIL_register_3D_EOS_callback",
    "AIL_set_3D_sample_distances",
    "AIL_set_3D_position",
    "AIL_start_3D_sample",
  ];
  {
    const decls = {};
    for (const fn of shimFunctions) {
      const re = new RegExp(`\\b${fn}\\s*\\(`);
      const ln = lineNumber(shim.lines, (l) => re.test(l));
      decls[fn] = ln;
      if (ln === -1) {
        errors.push(
          `${ownerTag(shim.abs)}: missing inert compile-only declaration ${fn}`,
        );
      }
    }
    const allPresent = Object.values(decls).every((l) => l !== -1);
    facts.mssShim = {
      compileOnly: true,
      declarations: decls,
      allInertDeclarationsPresent: allPresent,
    };
    if (!allPresent) {
      errors.push(
        `${ownerTag(shim.abs)}: not all inert compile-only sample-start declarations are present`,
      );
    }
  }

  // gameAudio.h read anchor (no specific line pinned; kept for source provenance).
  facts.gameAudioHeaderRead = { file: SOURCES.gameAudioH };

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
