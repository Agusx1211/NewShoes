#!/usr/bin/env node
// verify_audio_completion_frontier.mjs
//
// Source-only verifier that pins the original audio *completion / cleanup*
// frontier that a Web Audio backend must preserve after a sample/stream
// finishes. It reads (never executes) the original Common audio base
// source/header, the concrete Miles device source/header that owns the real
// completion callback + drain path, and the AudioEventRTS completion-state
// header/source, and emits a JSON report { ok, errors, sources, facts }.
//
// This is the completion/cleanup companion to:
//   - verify_miles_audio_playback_frontier.mjs  (Miles *playback-handle* start)
//   - verify_audio_request_update_frontier.mjs  (per-frame request *drain*)
// Where those verifiers pin how audio is *started* and how per-frame requests
// are *drained/routed*, this verifier pins the matching tail end of the
// lifecycle: what happens after Miles signals end-of-sample, what state the
// engine mutates on the AudioEventRTS, and which per-frame list processing
// turns a finished sample into a release/cleanup.
//
// The pinned frontier (all source-only, bounded line + ordered body scans):
//
//   1. Miles completion callbacks (MilesAudioManager.cpp):
//        - static forward decls setSampleCompleted @ 77, set3DSampleCompleted
//          @ 78, setStreamCompleted @ 79.
//        - definitions setSampleCompleted @ 3047, set3DSampleCompleted @ 3053,
//          setStreamCompleted @ 3059; each body calls
//          TheAudio->notifyOfAudioCompletion(handle, PAT_Sample/PAT_3DSample/
//          PAT_Stream). These are the only entry points from the Miles runtime
//          into the engine completion path.
//
//   2. MilesAudioManager::notifyOfAudioCompletion @ 1531 — the concrete device
//      override that turns a completed handle into AudioEventRTS state changes:
//        ordered body: findPlayingAudioFrom -> [loop branch]
//        setNextPlayPortion/decreaseLoopCount -> startNextLoop early-return ->
//        advanceNextPlayPortion -> getNextPlayPortion(!= PP_Done restart) ->
//        ... -> playing->m_status = PS_Stopped. The PS_Stopped assignment is
//        the completion marker the per-frame drain reaps next frame.
//        (Base AudioManager::notifyOfAudioCompletion is pure virtual in
//        GameAudio.h @ 197, so the Miles override is the only implementation.)
//
//   3. MilesAudioManager::findPlayingAudioFrom @ 1593 — maps a (handle, flags)
//      pair back to the owning PlayingAudio by scanning m_playingSounds /
//      m_playing3DSounds / m_playingStreams. Header decl @ 178.
//
//   4. MilesAudioManager::startNextLoop @ 2743 — the loop-restart helper the
//      completion path can early-return into instead of marking stopped.
//      Header decl @ 241.
//
//   5. AudioEventRTS completion-state methods driven by (2):
//        - PortionToPlay enum (AudioEventRTS.h) @ 50: PP_Attack @ 52,
//          PP_Sound @ 53, PP_Decay @ 54, PP_Done @ 55.
//        - header decls getNextPlayPortion @ 97, advanceNextPlayPortion @ 98,
//          setNextPlayPortion @ 99, decreaseLoopCount @ 101.
//        - impls (AudioEventRTS.cpp): getNextPlayPortion @ 463,
//          advanceNextPlayPortion @ 469 (ordered switch PP_Attack->PP_Sound,
//          PP_Sound->PP_Decay/PP_Done, PP_Decay->PP_Done), setNextPlayPortion
//          @ 499, decreaseLoopCount @ 505 (m_loopCount drain).
//
//   6. Completion marker contract (MilesAudioManager.h):
//        - PlayingStatus enum @ 39: PS_Playing @ 41, PS_Stopped @ 42.
//        - PlayingAudioType enum @ 31: PAT_Sample @ 33, PAT_3DSample @ 34,
//          PAT_Stream @ 35, PAT_INVALID @ 36.
//
//   7. Cleanup / release path that reaps a completed sample:
//        - MilesAudioManager::processPlayingList @ 2266 — per-frame scan that
//          finds m_status == PS_Stopped and calls releasePlayingAudio +
//          erase. Header decl @ 211.
//        - MilesAudioManager::processStoppedList @ 2485 — drains the
//          m_stoppedAudio list via releasePlayingAudio + erase. Header decl
//          @ 213.
//        - MilesAudioManager::releasePlayingAudio @ 1111 — body calls
//          notifyOf2DSampleCompletion/notifyOf3DSampleCompletion (SFX only),
//          releaseMilesHandles, closeFile, releaseAudioEventRTS, delete.
//          Header decl @ 265.
//        - MilesAudioManager::releaseMilesHandles @ 1076 (already pinned by
//          the playback frontier; referenced here as the handle-release step).
//          Header decl @ 264.
//        - AudioManager::releaseAudioEventRTS @ 1093 (GameAudio.cpp) — body
//          deletes the AudioEventRTS. Header decl @ 265 (GameAudio.h).
//
// No playback, asset decoding, or C++ execution is performed. No
// package.json, docs, TODO, DONE, SOURCE_INVENTORY, harness, or shim files are
// touched by this tool.
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
  audioEventRTSH:
    "GeneralsMD/Code/GameEngine/Include/Common/AudioEventRTS.h",
  audioEventRTSCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/AudioEventRTS.cpp",
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

  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const rtsH = readSourceLines(SOURCES.audioEventRTSH);
  const rts = readSourceLines(SOURCES.audioEventRTSCpp);
  const milesH = readSourceLines(SOURCES.milesH);
  const miles = readSourceLines(SOURCES.milesCpp);

  // -----------------------------------------------------------------
  // 1. Miles completion callbacks (entry from Miles runtime -> engine)
  // -----------------------------------------------------------------
  {
    const decls = {};
    const declEntries = [
      { key: "setSampleCompleted_fwd", line: 77, re: /static\s+void\s+AILCALLBACK\s+setSampleCompleted\s*\(/ },
      { key: "set3DSampleCompleted_fwd", line: 78, re: /static\s+void\s+AILCALLBACK\s+set3DSampleCompleted\s*\(/ },
      { key: "setStreamCompleted_fwd", line: 79, re: /static\s+void\s+AILCALLBACK\s+setStreamCompleted\s*\(/ },
    ];
    for (const { key, line, re } of declEntries) {
      const ln = lineNumber(miles.lines, (l) => re.test(l));
      decls[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(miles.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.milesCallbackForwardDecls = decls;
  }

  {
    const cbs = [
      // Anchor to ^void (no leading 'static') so we match the definition, not
      // the file-static forward declarations at lines 77-79.
      {
        key: "setSampleCompleted",
        defLine: 3047,
        defRe: /^void\s+AILCALLBACK\s+setSampleCompleted\s*\(\s*HSAMPLE\s/,
        body: [
          {
            key: "notifyOfAudioCompletion_PAT_Sample",
            re: /notifyOfAudioCompletion\s*\(\s*\(UnsignedInt\)\s*sampleCompleted\s*,\s*PAT_Sample\s*\)/,
          },
        ],
      },
      {
        key: "set3DSampleCompleted",
        defLine: 3053,
        defRe: /^void\s+AILCALLBACK\s+set3DSampleCompleted\s*\(\s*H3DSAMPLE\s/,
        body: [
          {
            key: "notifyOfAudioCompletion_PAT_3DSample",
            re: /notifyOfAudioCompletion\s*\(\s*\(UnsignedInt\)\s*sample3DCompleted\s*,\s*PAT_3DSample\s*\)/,
          },
        ],
      },
      {
        key: "setStreamCompleted",
        defLine: 3059,
        defRe: /^void\s+AILCALLBACK\s+setStreamCompleted\s*\(\s*HSTREAM\s/,
        body: [
          {
            key: "notifyOfAudioCompletion_PAT_Stream",
            re: /notifyOfAudioCompletion\s*\(\s*\(UnsignedInt\)\s*streamCompleted\s*,\s*PAT_Stream\s*\)/,
          },
        ],
      },
    ];
    const out = {};
    for (const cb of cbs) {
      const defLine = findMemberDef(miles.lines, cb.defRe);
      const bodyFacts = {};
      if (defLine !== cb.defLine) {
        errors.push(
          `${ownerTag(miles.abs)}: ${cb.key} expected at line ${cb.defLine} but found at ${defLine}`,
        );
      }
      if (defLine > 0) {
        const range = functionBodyLineRange(miles.lines, defLine);
        for (const { key, re } of cb.body) {
          const ln = range
            ? firstMatchInRange(miles.lines, range.start, range.end, re)
            : -1;
          bodyFacts[key] = ln;
          if (ln === -1) {
            errors.push(
              `${ownerTag(miles.abs)}: ${cb.key}: expected ${key} call not found in body`,
            );
          }
        }
      } else {
        for (const { key } of cb.body) bodyFacts[key] = -1;
      }
      out[cb.key] = { defLine, body: bodyFacts };
    }
    facts.milesCompletionCallbacks = out;
  }

  // -----------------------------------------------------------------
  // 2. MilesAudioManager::notifyOfAudioCompletion — the concrete override
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
    pinOrderedBody(miles, defLine, "notifyOfAudioCompletionBody", [
      { key: "findPlayingAudioFrom_call", re: /\bfindPlayingAudioFrom\s*\(/ },
      {
        key: "setNextPlayPortion_PP_Sound",
        re: /setNextPlayPortion\s*\(\s*PP_Sound\s*\)/,
      },
      { key: "decreaseLoopCount_call", re: /\bdecreaseLoopCount\s*\(/ },
      {
        key: "startNextLoop_call",
        re: /\bstartNextLoop\s*\(\s*playing\s*\)/,
      },
      {
        key: "advanceNextPlayPortion_call",
        re: /\badvanceNextPlayPortion\s*\(/,
      },
      {
        key: "getNextPlayPortion_PP_Done_check",
        re: /getNextPlayPortion\s*\(\s*\)\s*!=\s*PP_Done/,
      },
      {
        key: "m_status_PS_Stopped",
        re: /m_status\s*=\s*PS_Stopped/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 3. findPlayingAudioFrom — maps (handle, flags) -> PlayingAudio
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "findPlayingAudioFromDefLine",
      /PlayingAudio\s*\*\s*MilesAudioManager\s*::\s*findPlayingAudioFrom\s*\(/,
      1593,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "findPlayingAudioFromBody", [
      { key: "m_playingSounds", re: /\bm_playingSounds\b/ },
      { key: "m_playing3DSounds", re: /\bm_playing3DSounds\b/ },
      { key: "m_playingStreams", re: /\bm_playingStreams\b/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 4. startNextLoop — loop-restart helper (early-return alt path)
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      "startNextLoopDefLine",
      /Bool\s+MilesAudioManager\s*::\s*startNextLoop\s*\(/,
      2743,
      errors,
      facts,
    );
    if (defLine > 0) {
      const range = functionBodyLineRange(miles.lines, defLine);
      const sample = range
        ? firstMatchInRange(
            miles.lines,
            range.start,
            range.end,
            /\bplaySample\s*\(/,
          )
        : -1;
      facts.startNextLoopBody = { playSampleCall: sample };
      if (sample === -1) {
        errors.push(
          `${ownerTag(miles.abs)}: startNextLoop: playSample(...) call not found in body`,
        );
      }
    } else {
      facts.startNextLoopBody = { playSampleCall: -1 };
    }
  }

  // -----------------------------------------------------------------
  // 5. AudioEventRTS completion-state methods driven by (2)
  // -----------------------------------------------------------------
  {
    const enumOut = {};
    const enumEntries = [
      { key: "enum_PortionToPlay", line: 50, re: /^enum\s+PortionToPlay\b/ },
      { key: "PP_Attack", line: 52, re: /\bPP_Attack\b/ },
      { key: "PP_Sound", line: 53, re: /\bPP_Sound\b/ },
      { key: "PP_Decay", line: 54, re: /\bPP_Decay\b/ },
      { key: "PP_Done", line: 55, re: /\bPP_Done\b/ },
    ];
    for (const { key, line, re } of enumEntries) {
      const ln = lineNumber(rtsH.lines, (l) => re.test(l));
      enumOut[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(rtsH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioEventRTSPortionToPlayEnum = enumOut;
  }

  {
    const declOut = {};
    const declEntries = [
      { key: "getNextPlayPortion_decl", line: 97, re: /PortionToPlay\s+getNextPlayPortion\s*\(/ },
      { key: "advanceNextPlayPortion_decl", line: 98, re: /\badvanceNextPlayPortion\s*\(/ },
      { key: "setNextPlayPortion_decl", line: 99, re: /\bsetNextPlayPortion\s*\(/ },
      { key: "decreaseLoopCount_decl", line: 101, re: /\bdecreaseLoopCount\s*\(/ },
    ];
    for (const { key, line, re } of declEntries) {
      const ln = lineNumber(rtsH.lines, (l) => re.test(l));
      declOut[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(rtsH.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioEventRTSHeaderDecls = declOut;
  }

  {
    const defOut = {};
    const defEntries = [
      {
        key: "getNextPlayPortion_def",
        line: 463,
        re: /PortionToPlay\s+AudioEventRTS\s*::\s*getNextPlayPortion\s*\(/,
      },
      {
        key: "advanceNextPlayPortion_def",
        line: 469,
        re: /void\s+AudioEventRTS\s*::\s*advanceNextPlayPortion\s*\(/,
      },
      {
        key: "setNextPlayPortion_def",
        line: 499,
        re: /void\s+AudioEventRTS\s*::\s*setNextPlayPortion\s*\(/,
      },
      {
        key: "decreaseLoopCount_def",
        line: 505,
        re: /void\s+AudioEventRTS\s*::\s*decreaseLoopCount\s*\(/,
      },
    ];
    for (const { key, line, re } of defEntries) {
      const ln = findMemberDef(rts.lines, re);
      defOut[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(rts.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioEventRTSImplDefs = defOut;
  }

  // advanceNextPlayPortion body: ordered state-machine transitions. The
  // PP_Sound case assigns PP_Done (no decay name) before the PP_Decay case
  // label, so the PP_Done assignment and case_PP_Decay are checked for
  // presence only, not strict order.
  {
    const defLine = facts.audioEventRTSImplDefs.advanceNextPlayPortion_def;
    pinOrderedBody(rts, defLine, "advanceNextPlayPortionBody", [
      { key: "switch_m_portionToPlayNext", re: /\bswitch\s*\(\s*m_portionToPlayNext\s*\)/ },
      { key: "case_PP_Attack", re: /\bcase\s+PP_Attack\b/ },
      {
        key: "PP_Attack_assign_PP_Sound",
        re: /m_portionToPlayNext\s*=\s*PP_Sound/,
      },
      { key: "case_PP_Sound", re: /\bcase\s+PP_Sound\b/ },
    ], errors, facts);
    if (defLine > 0) {
      const range = functionBodyLineRange(rts.lines, defLine);
      const caseDecay = range
        ? firstMatchInRange(rts.lines, range.start, range.end, /\bcase\s+PP_Decay\b/)
        : -1;
      const assignDone = range
        ? firstMatchInRange(
            rts.lines,
            range.start,
            range.end,
            /m_portionToPlayNext\s*=\s*PP_Done/,
          )
        : -1;
      facts.advanceNextPlayPortionBody.case_PP_Decay = caseDecay;
      facts.advanceNextPlayPortionBody.PP_Done_assign = assignDone;
      if (caseDecay === -1) {
        errors.push(
          `${ownerTag(rts.abs)}: advanceNextPlayPortion: case PP_Decay not found in body`,
        );
      }
      if (assignDone === -1) {
        errors.push(
          `${ownerTag(rts.abs)}: advanceNextPlayPortion: m_portionToPlayNext = PP_Done assignment not found in body`,
        );
      }
    } else {
      facts.advanceNextPlayPortionBody.case_PP_Decay = -1;
      facts.advanceNextPlayPortionBody.PP_Done_assign = -1;
    }
  }

  // decreaseLoopCount body: m_loopCount drain.
  {
    const defLine = facts.audioEventRTSImplDefs.decreaseLoopCount_def;
    pinOrderedBody(rts, defLine, "decreaseLoopCountBody", [
      { key: "m_loopCount_eq_1_check", re: /m_loopCount\s*==\s*1/ },
      { key: "m_loopCount_set_neg1", re: /m_loopCount\s*=\s*-1/ },
      {
        key: "m_loopCount_gt_1_dec",
        re: /m_loopCount\s*>\s*1|--m_loopCount|\bm_loopCount\s*--/,
      },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // 6. Completion marker contract (MilesAudioManager.h enums/struct)
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
      { key: "struct_PlayingAudio", line: 54, re: /^struct\s+PlayingAudio\b/ },
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
    facts.completionMarkerContract = out;
  }

  // -----------------------------------------------------------------
  // 7. Cleanup / release path that reaps a completed sample
  // -----------------------------------------------------------------
  // processPlayingList — finds PS_Stopped -> releasePlayingAudio + erase.
  // The loop also has an earlier null-playing erase branch, so the
  // releasePlayingAudio call is checked in order against the PS_Stopped branch,
  // and a post-release erase is verified by scanning after the call.
  {
    const defLine = pinDef(
      miles,
      "processPlayingListDefLine",
      /void\s+MilesAudioManager\s*::\s*processPlayingList\s*\(\s*void\s*\)/,
      2266,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "processPlayingListBody", [
      { key: "m_playingSounds_begin", re: /m_playingSounds\s*\.\s*begin\s*\(\s*\)/ },
      {
        key: "PS_Stopped_branch",
        re: /m_status\s*==\s*PS_Stopped/,
      },
      {
        key: "releasePlayingAudio_call",
        re: /\breleasePlayingAudio\s*\(\s*playing\s*\)/,
      },
    ], errors, facts);
    const callLine = facts.processPlayingListBody.releasePlayingAudio_call;
    const range = defLine > 0 ? functionBodyLineRange(miles.lines, defLine) : null;
    const eraseAfter =
      callLine > 0 && range
        ? firstMatchInRange(
            miles.lines,
            callLine + 1,
            range.end,
            /m_playingSounds\s*\.\s*erase\s*\(/,
          )
        : -1;
    facts.processPlayingListBody.m_playingSounds_erase_after_release = eraseAfter;
    if (eraseAfter === -1) {
      errors.push(
        `${ownerTag(miles.abs)}: processPlayingList: m_playingSounds.erase after releasePlayingAudio not found`,
      );
    }
  }

  // processStoppedList — drains m_stoppedAudio via releasePlayingAudio + erase.
  {
    const defLine = pinDef(
      miles,
      "processStoppedListDefLine",
      /void\s+MilesAudioManager\s*::\s*processStoppedList\s*\(\s*void\s*\)/,
      2485,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "processStoppedListBody", [
      { key: "m_stoppedAudio_begin", re: /m_stoppedAudio\s*\.\s*begin\s*\(\s*\)/ },
      {
        key: "releasePlayingAudio_call",
        re: /\breleasePlayingAudio\s*\(\s*playing\s*\)/,
      },
      {
        key: "m_stoppedAudio_erase",
        re: /m_stoppedAudio\s*\.\s*erase\s*\(/,
      },
    ], errors, facts);
  }

  // releasePlayingAudio — release/cleanup body order.
  {
    const defLine = pinDef(
      miles,
      "releasePlayingAudioDefLine",
      /void\s+MilesAudioManager\s*::\s*releasePlayingAudio\s*\(\s*PlayingAudio\s*\*\s*release\s*\)/,
      1111,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "releasePlayingAudioBody", [
      {
        key: "notifyOf2DSampleCompletion",
        re: /\bnotifyOf2DSampleCompletion\s*\(/,
      },
      {
        key: "notifyOf3DSampleCompletion",
        re: /\bnotifyOf3DSampleCompletion\s*\(/,
      },
      {
        key: "releaseMilesHandles_call",
        re: /\breleaseMilesHandles\s*\(\s*release\s*\)/,
      },
      { key: "closeFile_call", re: /\bcloseFile\s*\(\s*release\s*->\s*m_file\s*\)/ },
      {
        key: "releaseAudioEventRTS_call",
        re: /\breleaseAudioEventRTS\s*\(\s*release\s*->\s*m_audioEventRTS\s*\)/,
      },
      { key: "delete_release", re: /\bdelete\s+release\b/ },
    ], errors, facts);
  }

  // releaseMilesHandles — the handle-release step (frontier reference).
  {
    const defLine = pinDef(
      miles,
      "releaseMilesHandlesDefLine",
      /void\s+MilesAudioManager\s*::\s*releaseMilesHandles\s*\(\s*PlayingAudio\s*\*\s*release\s*\)/,
      1076,
      errors,
      facts,
    );
    if (defLine > 0) {
      const range = functionBodyLineRange(miles.lines, defLine);
      const typeReset = range
        ? firstMatchInRange(
            miles.lines,
            range.start,
            range.end,
            /m_type\s*=\s*PAT_INVALID/,
          )
        : -1;
      facts.releaseMilesHandlesBody = { m_type_PAT_INVALID: typeReset };
      if (typeReset === -1) {
        errors.push(
          `${ownerTag(miles.abs)}: releaseMilesHandles: m_type = PAT_INVALID reset not found in body`,
        );
      }
    } else {
      facts.releaseMilesHandlesBody = { m_type_PAT_INVALID: -1 };
    }
  }

  // AudioManager::releaseAudioEventRTS — deletes the AudioEventRTS.
  {
    const defLine = pinDef(
      gameAudio,
      "releaseAudioEventRTSDefLine",
      /void\s+AudioManager\s*::\s*releaseAudioEventRTS\s*\(/,
      1093,
      errors,
      facts,
    );
    pinOrderedBody(gameAudio, defLine, "releaseAudioEventRTSBody", [
      { key: "delete_eventToRelease", re: /\bdelete\s+eventToRelease\b/ },
    ], errors, facts);
  }

  // -----------------------------------------------------------------
  // Header declaration anchors for the completion/cleanup frontier
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
        key: "findPlayingAudioFrom",
        line: 178,
        re: /virtual\s+PlayingAudio\s*\*\s*findPlayingAudioFrom\s*\(/,
      },
      { key: "startNextLoop", line: 241, re: /Bool\s+startNextLoop\s*\(/ },
      {
        key: "processPlayingList",
        line: 211,
        re: /virtual\s+void\s+processPlayingList\s*\(\s*void\s*\)/,
      },
      {
        key: "processStoppedList",
        line: 213,
        re: /virtual\s+void\s+processStoppedList\s*\(\s*void\s*\)/,
      },
      {
        key: "releaseMilesHandles",
        line: 264,
        re: /void\s+releaseMilesHandles\s*\(\s*PlayingAudio\s*\*/,
      },
      {
        key: "releasePlayingAudio",
        line: 265,
        re: /void\s+releasePlayingAudio\s*\(\s*PlayingAudio\s*\*/,
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

  {
    const out = {};
    const entries = [
      {
        key: "notifyOfAudioCompletion_pure_virtual",
        line: 197,
        re: /virtual\s+void\s+notifyOfAudioCompletion\s*\(.*\)\s*=\s*0/,
      },
      {
        key: "releaseAudioEventRTS",
        line: 265,
        re: /virtual\s+void\s+releaseAudioEventRTS\s*\(/,
      },
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
    facts.gameAudioHeader = out;
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
