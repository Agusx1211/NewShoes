#!/usr/bin/env node
// verify_audio_playing_event_state_frontier.mjs
//
// Source-only verifier that pins the original Zero Hour *playing event-state*
// frontier that a browser Web Audio runtime must preserve once a requested
// audio payload has been started and once it has completed. It pins the
// PlayingAudio record that ties a playing handle to its AudioEventRTS, the
// exact points where playAudioEvent inserts a started event into the three
// playing lists, the single PS_Stopped marker that notifyOfAudioCompletion
// writes on completion, the per-frame processPlayingList observation that
// reaps a stopped entry via releasePlayingAudio + erase, and the
// AudioEventRTS-owned event-name / playing-handle identity that a browser
// harness log should report.
//
// This is the playing-event-state companion to:
//   - verify_audio_sample_start_frontier.mjs  (start-helper *bodies*:
//       playSample / playSample3D / playStream AIL_start_* sequence)
//   - verify_audio_completion_frontier.mjs    (EOS callback + exhaustive
//       notifyOfAudioCompletion loop/restart state machine + cleanup tail)
// Where those verifiers pin the *internals* of the start helpers and the
// *exhaustive* completion state machine, this verifier pins the surrounding
// playing-record contract: the struct fields, the list insertions around the
// start helpers, the completion -> PS_Stopped marker, the per-frame reap, and
// the event identity accessor. The loop/restart branch inside
// notifyOfAudioCompletion is acknowledged here only by its startNextLoop
// early-return edge; its exhaustive state-machine pinning belongs to the
// completion verifier and is intentionally not duplicated.
//
// No playback, asset decoding, or C++ execution is performed. No
// package.json, docs, TODO, DONE, SOURCE_INVENTORY, harness, or shim files
// are touched by this tool.
//
// Pinned facts (all source-only, bounded line + ordered function-body scans):
//
//   1. PlayingAudio record contract (MilesAudioManager.h):
//        - enum PlayingAudioType @ 31: PAT_Sample @ 33, PAT_3DSample @ 34,
//          PAT_Stream @ 35, PAT_INVALID @ 36.
//        - enum PlayingStatus @ 39: PS_Playing @ 41, PS_Stopped @ 42,
//          PS_Paused @ 43.
//        - struct PlayingAudio @ 54 with handle union fields m_sample @ 58,
//          m_3DSample @ 59, m_stream @ 60; type tag m_type @ 63; status
//          m_status @ 64 (volatile PlayingStatus); owner pointer
//          m_audioEventRTS @ 65; payload handle m_file @ 66.
//
//   2. playAudioEvent list insertions (MilesAudioManager.cpp @ 661). Each
//      branch assigns the PlayingAudio owner/type/handle fields and then
//      inserts into its list. The source ordering of the insertion relative
//      to the start helper differs per branch and is pinned factually:
//        - Stream branch (AT_Music | AT_Streaming): ordered —
//          audio->m_audioEventRTS = event, audio->m_stream = stream,
//          audio->m_type = PAT_Stream, playStream(event, stream) [start
//          helper], m_playingStreams.push_back(audio). Here the push IS after
//          the start helper returns.
//        - 3D branch (AT_SoundEffect positional): ordered —
//          audio->m_audioEventRTS = event, audio->m_3DSample = sample3D,
//          audio->m_type = PAT_3DSample, m_playing3DSounds.push_back(audio),
//          then playSample3D(event, sample3D) [start helper, returns m_file].
//          Here the push PRECEDES the start helper in source order.
//        - 2D branch (AT_SoundEffect non-positional): ordered —
//          audio->m_audioEventRTS = event, audio->m_sample = sample,
//          audio->m_type = PAT_Sample, m_playingSounds.push_back(audio),
//          then playSample(event, sample) [start helper, returns m_file].
//          Here the push PRECEDES the start helper in source order.
//
//   3. notifyOfAudioCompletion (MilesAudioManager.cpp @ 1531) — the single
//      completion marker. The body looks up the PlayingAudio via
//      findPlayingAudioFrom, may early-return through the loop/restart branch
//      (startNextLoop(playing) -> return; acknowledged, not exhaustively
//      pinned here), and otherwise ends by writing:
//          playing->m_status = PS_Stopped;
//      That assignment is the only line that mutates a found PlayingAudio to
//      PS_Stopped; it is the marker the per-frame drain reaps next frame.
//
//   4. processPlayingList (MilesAudioManager.cpp @ 2266) — per-frame reap.
//      For each of m_playingSounds, m_playing3DSounds, m_playingStreams the
//      body observes playing->m_status == PS_Stopped, calls
//      releasePlayingAudio(playing), and erases the entry via the matching
//      list's erase(...) in the same branch. (The 3D loop has additional
//      position/volume-based release+erase side branches; this verifier pins
//      only the PS_Stopped-driven release+erase edge in each of the three
//      lists, which is the completion-driven reap contract.)
//
//   5. Event identity / name (AudioEventRTS.h / .cpp) — the event info/name
//      a browser harness log should report is owned by AudioEventRTS, not by
//      PlayingAudio:
//        - AudioEventRTS::getEventName (inline, AudioEventRTS.h @ 78) returns
//          m_eventName (AudioEventRTS.h @ 171). setEventName decl @ 77, impl
//          @ 307 (assigns m_eventName).
//        - AudioEventRTS::getPlayingHandle decl @ 108, impl @ 547 (returns
//          m_playingHandle, declared @ 166). This is the handle id a harness
//          correlates against a PlayingAudio handle union.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  milesH:
    "GeneralsMD/Code/GameEngineDevice/Include/MilesAudioDevice/MilesAudioManager.h",
  milesCpp:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  audioEventRTSH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioEventRTS.h",
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

// Cursor-based ordered scan: each entry must be found strictly at/after the
// previous match line. Used for branches inside one shared function body
// where "first match in body" would collide across branches.
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

function main() {
  const errors = [];
  const facts = {};

  const milesH = readSourceLines(SOURCES.milesH);
  const miles = readSourceLines(SOURCES.milesCpp);
  const rtsH = readSourceLines(SOURCES.audioEventRTSH);
  const rts = readSourceLines(SOURCES.audioEventRTSCpp);

  // -----------------------------------------------------------------
  // 1. PlayingAudio record contract (enums + struct fields)
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      { key: "enum_PlayingAudioType", line: 31, re: /^enum\s+PlayingAudioType\b/ },
      { key: "PAT_Sample", line: 33, re: /\bPAT_Sample\b/ },
      { key: "PAT_3DSample", line: 34, re: /\bPAT_3DSample\b/ },
      { key: "PAT_Stream", line: 35, re: /\bPAT_Stream\b/ },
      { key: "PAT_INVALID", line: 36, re: /\bPAT_INVALID\b/ },
      { key: "enum_PlayingStatus", line: 39, re: /^enum\s+PlayingStatus\b/ },
      { key: "PS_Playing", line: 41, re: /\bPS_Playing\b/ },
      { key: "PS_Stopped", line: 42, re: /\bPS_Stopped\b/ },
      { key: "PS_Paused", line: 43, re: /\bPS_Paused\b/ },
      { key: "struct_PlayingAudio", line: 54, re: /^struct\s+PlayingAudio\b/ },
      { key: "field_m_sample", line: 58, re: /\bHSAMPLE\s+m_sample\s*;/ },
      { key: "field_m_3DSample", line: 59, re: /\bH3DSAMPLE\s+m_3DSample\s*;/ },
      { key: "field_m_stream", line: 60, re: /\bHSTREAM\s+m_stream\s*;/ },
      {
        key: "field_m_type",
        line: 63,
        re: /PlayingAudioType\s+m_type\s*;/,
      },
      {
        key: "field_m_status",
        line: 64,
        re: /volatile\s+PlayingStatus\s+m_status\s*;/,
      },
      {
        key: "field_m_audioEventRTS",
        line: 65,
        re: /AudioEventRTS\s*\*\s*m_audioEventRTS\s*;/,
      },
      { key: "field_m_file", line: 66, re: /\bvoid\s*\*\s*m_file\s*;/ },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(milesH.lines, (l) => re.test(l));
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(milesH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.playingAudioContract = out;
  }

  // -----------------------------------------------------------------
  // 2. playAudioEvent list insertions (per-branch field + push order)
  // -----------------------------------------------------------------
  const playAudioEventDefLine = pinDef(
    miles,
    "playAudioEventDefLine",
    /void\s+MilesAudioManager\s*::\s*playAudioEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
    661,
    errors,
    facts,
  );
  const playAudioEventBody =
    playAudioEventDefLine > 0
      ? functionBodyLineRange(miles.lines, playAudioEventDefLine)
      : null;
  const playAudioEventStart = playAudioEventBody ? playAudioEventBody.start : -1;
  const playAudioEventEnd = playAudioEventBody
    ? playAudioEventBody.end
    : miles.lines.length;

  // Each branch is anchored at a branch-unique marker that PRECEDES its
  // field-assignment block (the type assignment alone is insufficient because
  // `audio->m_audioEventRTS = event;` is written BEFORE the type/handle fields
  // in every branch). The forward cursor then grabs each branch's own field
  // block, not an earlier branch's.
  //
  // 2a. Stream branch (AT_Music | AT_Streaming): fields, then start helper,
  //     then push. Here the push IS after the start helper returns.
  {
    const anchor = firstMatchInRange(
      miles.lines,
      playAudioEventStart,
      playAudioEventEnd,
      /\bcase\s+AT_Streaming\b/,
    );
    pinOrderedCursor(miles, anchor > 0 ? anchor : playAudioEventStart, playAudioEventEnd, "playAudioEventStreamBranch", [
      {
        key: "audio_m_audioEventRTS_assign",
        re: /audio\s*->\s*m_audioEventRTS\s*=\s*event\s*;/,
      },
      {
        key: "audio_m_stream_assign",
        re: /audio\s*->\s*m_stream\s*=\s*stream\s*;/,
      },
      {
        key: "audio_m_type_PAT_Stream",
        re: /audio\s*->\s*m_type\s*=\s*PAT_Stream\s*;/,
      },
      {
        key: "playStream_start_helper",
        re: /\bplayStream\s*\(\s*event\s*,\s*stream\s*\)/,
      },
      {
        key: "m_playingStreams_push_back",
        re: /m_playingStreams\s*\.\s*push_back\s*\(\s*audio\s*\)/,
      },
    ], errors, facts);
  }

  // 2b. 3D branch (AT_SoundEffect positional): fields, then push, then start
  //     helper. Here the push PRECEDES the start helper in source order.
  {
    const anchor = firstMatchInRange(
      miles.lines,
      playAudioEventStart,
      playAudioEventEnd,
      /\bisPositionalAudio\s*\(\s*\)/,
    );
    pinOrderedCursor(miles, anchor > 0 ? anchor : playAudioEventStart, playAudioEventEnd, "playAudioEvent3DBranch", [
      {
        key: "audio_m_audioEventRTS_assign",
        re: /audio\s*->\s*m_audioEventRTS\s*=\s*event\s*;/,
      },
      {
        key: "audio_m_3DSample_assign",
        re: /audio\s*->\s*m_3DSample\s*=\s*sample3D\s*;/,
      },
      {
        key: "audio_m_type_PAT_3DSample",
        re: /audio\s*->\s*m_type\s*=\s*PAT_3DSample\s*;/,
      },
      {
        key: "m_playing3DSounds_push_back",
        re: /m_playing3DSounds\s*\.\s*push_back\s*\(\s*audio\s*\)/,
      },
      {
        key: "playSample3D_start_helper",
        re: /\bplaySample3D\s*\(\s*event\s*,\s*sample3D\s*\)/,
      },
    ], errors, facts);
  }

  // 2c. 2D branch (AT_SoundEffect non-positional): fields, then push, then
  //     start helper. Here the push PRECEDES the start helper in source order.
  {
    const anchor = firstMatchInRange(
      miles.lines,
      playAudioEventStart,
      playAudioEventEnd,
      /\bgetFirst2DSample\s*\(\s*event\s*\)/,
    );
    pinOrderedCursor(miles, anchor > 0 ? anchor : playAudioEventStart, playAudioEventEnd, "playAudioEvent2DBranch", [
      {
        key: "audio_m_audioEventRTS_assign",
        re: /audio\s*->\s*m_audioEventRTS\s*=\s*event\s*;/,
      },
      {
        key: "audio_m_sample_assign",
        re: /audio\s*->\s*m_sample\s*=\s*sample\s*;/,
      },
      {
        key: "audio_m_type_PAT_Sample",
        re: /audio\s*->\s*m_type\s*=\s*PAT_Sample\s*;/,
      },
      {
        key: "m_playingSounds_push_back",
        re: /m_playingSounds\s*\.\s*push_back\s*\(\s*audio\s*\)/,
      },
      {
        key: "playSample_start_helper",
        re: /\bplaySample\s*\(\s*event\s*,\s*sample\s*\)/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 3. notifyOfAudioCompletion — single PS_Stopped completion marker
  //    (loop/restart early-return acknowledged; not exhaustively pinned here)
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "notifyOfAudioCompletionDefLine",
      /void\s+MilesAudioManager\s*::\s*notifyOfAudioCompletion\s*\(/,
      1531,
      errors,
      facts,
    );
    const range = defLine > 0 ? functionBodyLineRange(miles.lines, defLine) : null;
    const start = range ? range.start : -1;
    const end = range ? range.end : miles.lines.length;
    // Loop/restart branch edge: startNextLoop(playing) early-return. Presence
    // only; exhaustive state machine belongs to verify_audio_completion_frontier.
    const startNextLoopReturn = firstMatchInRange(
      miles.lines,
      start,
      end,
      /\bstartNextLoop\s*\(\s*playing\s*\)/,
    );
    // The single completion marker.
    const statusStoppedAssign = firstMatchInRange(
      miles.lines,
      start,
      end,
      /m_status\s*=\s*PS_Stopped/,
    );
    // Count of m_status = PS_Stopped writes in this body (must be exactly 1).
    let stoppedWrites = 0;
    if (range) {
      for (let i = range.start - 1; i < range.end && i < miles.lines.length; i++) {
        if (/m_status\s*=\s*PS_Stopped/.test(miles.lines[i])) stoppedWrites++;
      }
    }
    facts.notifyOfAudioCompletionBody = {
      startNextLoop_return_edge: startNextLoopReturn,
      m_status_PS_Stopped_marker: statusStoppedAssign,
      m_status_PS_Stopped_write_count: stoppedWrites,
    };
    if (startNextLoopReturn === -1) {
      errors.push(
        `${ownerTag(miles.abs)}: notifyOfAudioCompletion: startNextLoop(playing) loop/restart edge not found in body`,
      );
    }
    if (statusStoppedAssign === -1) {
      errors.push(
        `${ownerTag(miles.abs)}: notifyOfAudioCompletion: playing->m_status = PS_Stopped completion marker not found in body`,
      );
    }
    if (stoppedWrites !== 1) {
      errors.push(
        `${ownerTag(miles.abs)}: notifyOfAudioCompletion: expected exactly 1 'm_status = PS_Stopped' write in body but found ${stoppedWrites}`,
      );
    }
  }

  // -----------------------------------------------------------------
  // 4. processPlayingList — per-frame PS_Stopped -> release + erase reap
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "processPlayingListDefLine",
      /void\s+MilesAudioManager\s*::\s*processPlayingList\s*\(\s*void\s*\)/,
      2266,
      errors,
      facts,
    );
    const range = defLine > 0 ? functionBodyLineRange(miles.lines, defLine) : null;
    const start = range ? range.start : -1;
    const end = range ? range.end : miles.lines.length;

    // 4a. m_playingSounds PS_Stopped branch.
    {
      const branchStart = firstMatchInRange(
        miles.lines,
        start,
        end,
        /m_playingSounds\s*\.\s*begin\s*\(\s*\)/,
      );
      const obs = firstMatchInRange(
        miles.lines,
        branchStart > 0 ? branchStart : start,
        end,
        /m_status\s*==\s*PS_Stopped/,
      );
      const release = firstMatchInRange(
        miles.lines,
        obs > 0 ? obs : start,
        end,
        /\breleasePlayingAudio\s*\(\s*playing\s*\)/,
      );
      const erase = firstMatchInRange(
        miles.lines,
        release > 0 ? release : start,
        end,
        /m_playingSounds\s*\.\s*erase\s*\(\s*it\s*\)/,
      );
      facts.processPlayingList_m_playingSounds = {
        PS_Stopped_observation: obs,
        releasePlayingAudio_call: release,
        m_playingSounds_erase: erase,
      };
      for (const [k, ln] of Object.entries(facts.processPlayingList_m_playingSounds)) {
        if (ln === -1) {
          errors.push(
            `${ownerTag(miles.abs)}: processPlayingList m_playingSounds: ${k} not found`,
          );
        }
      }
    }
    // 4b. m_playing3DSounds PS_Stopped branch.
    {
      const branchStart = firstMatchInRange(
        miles.lines,
        start,
        end,
        /m_playing3DSounds\s*\.\s*begin\s*\(\s*\)/,
      );
      const obs = firstMatchInRange(
        miles.lines,
        branchStart > 0 ? branchStart : start,
        end,
        /m_status\s*==\s*PS_Stopped/,
      );
      const release = firstMatchInRange(
        miles.lines,
        obs > 0 ? obs : start,
        end,
        /\breleasePlayingAudio\s*\(\s*playing\s*\)/,
      );
      const erase = firstMatchInRange(
        miles.lines,
        release > 0 ? release : start,
        end,
        /m_playing3DSounds\s*\.\s*erase\s*\(\s*it\s*\)/,
      );
      facts.processPlayingList_m_playing3DSounds = {
        PS_Stopped_observation: obs,
        releasePlayingAudio_call: release,
        m_playing3DSounds_erase: erase,
      };
      for (const [k, ln] of Object.entries(facts.processPlayingList_m_playing3DSounds)) {
        if (ln === -1) {
          errors.push(
            `${ownerTag(miles.abs)}: processPlayingList m_playing3DSounds: ${k} not found`,
          );
        }
      }
    }
    // 4c. m_playingStreams PS_Stopped branch.
    {
      const branchStart = firstMatchInRange(
        miles.lines,
        start,
        end,
        /m_playingStreams\s*\.\s*begin\s*\(\s*\)/,
      );
      const obs = firstMatchInRange(
        miles.lines,
        branchStart > 0 ? branchStart : start,
        end,
        /m_status\s*==\s*PS_Stopped/,
      );
      const release = firstMatchInRange(
        miles.lines,
        obs > 0 ? obs : start,
        end,
        /\breleasePlayingAudio\s*\(\s*playing\s*\)/,
      );
      const erase = firstMatchInRange(
        miles.lines,
        release > 0 ? release : start,
        end,
        /m_playingStreams\s*\.\s*erase\s*\(\s*it\s*\)/,
      );
      facts.processPlayingList_m_playingStreams = {
        PS_Stopped_observation: obs,
        releasePlayingAudio_call: release,
        m_playingStreams_erase: erase,
      };
      for (const [k, ln] of Object.entries(facts.processPlayingList_m_playingStreams)) {
        if (ln === -1) {
          errors.push(
            `${ownerTag(miles.abs)}: processPlayingList m_playingStreams: ${k} not found`,
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------
  // 5. Event identity / name — owned by AudioEventRTS
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      { key: "setEventName_decl", line: 77, re: /\bsetEventName\s*\(\s*AsciiString\s+name\s*\)/ },
      {
        key: "getEventName_inline",
        line: 78,
        re: /const\s+AsciiString&\s+getEventName\s*\(\s*void\s*\)\s*const\s*\{\s*return\s+m_eventName\s*;\s*\}/,
      },
      { key: "getPlayingHandle_decl", line: 108, re: /\bgetPlayingHandle\s*\(\s*void\s*\)/ },
      { key: "m_playingHandle_field", line: 166, re: /\bAudioHandle\s+m_playingHandle\s*;/ },
      { key: "m_eventName_field", line: 171, re: /\bAsciiString\s+m_eventName\s*;/ },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(rtsH.lines, (l) => re.test(l));
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(rtsH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioEventRTSIdentityHeader = out;
  }
  {
    const out = {};
    const entries = [
      {
        key: "setEventName_def",
        line: 307,
        re: /void\s+AudioEventRTS\s*::\s*setEventName\s*\(\s*AsciiString\s+name\s*\)/,
      },
      {
        key: "getPlayingHandle_def",
        line: 547,
        re: /AudioHandle\s+AudioEventRTS\s*::\s*getPlayingHandle\s*\(\s*void\s*\)/,
      },
    ];
    for (const { key, line, re } of entries) {
      const ln = findMemberDef(rts.lines, re);
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(rts.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioEventRTSIdentityImpl = out;
    // setEventName body assigns m_eventName.
    {
      const defLine = out.setEventName_def;
      const range = defLine > 0 ? functionBodyLineRange(rts.lines, defLine) : null;
      const assign = range
        ? firstMatchInRange(rts.lines, range.start, range.end, /m_eventName\s*=\s*name\s*;/)
        : -1;
      facts.audioEventRTSIdentityImpl.setEventName_m_eventName_assign = assign;
      if (assign === -1) {
        errors.push(
          `${ownerTag(rts.abs)}: setEventName: m_eventName = name assignment not found in body`,
        );
      }
    }
    // getPlayingHandle body returns m_playingHandle.
    {
      const defLine = out.getPlayingHandle_def;
      const range = defLine > 0 ? functionBodyLineRange(rts.lines, defLine) : null;
      const ret = range
        ? firstMatchInRange(rts.lines, range.start, range.end, /\breturn\s+m_playingHandle\s*;/)
        : -1;
      facts.audioEventRTSIdentityImpl.getPlayingHandle_return = ret;
      if (ret === -1) {
        errors.push(
          `${ownerTag(rts.abs)}: getPlayingHandle: return m_playingHandle not found in body`,
        );
      }
    }
  }

  // -----------------------------------------------------------------
  // 6. Header declaration anchors for the playing-event-state frontier
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      {
        key: "notifyOfAudioCompletion",
        line: 177,
        re: /virtual\s+void\s+notifyOfAudioCompletion\s*\(/,
      },
      {
        key: "processPlayingList",
        line: 211,
        re: /virtual\s+void\s+processPlayingList\s*\(\s*void\s*\)/,
      },
      {
        key: "playAudioEvent",
        line: 256,
        re: /\bplayAudioEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(milesH.lines, (l) => re.test(l));
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(milesH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.milesHeaderDecls = out;
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
