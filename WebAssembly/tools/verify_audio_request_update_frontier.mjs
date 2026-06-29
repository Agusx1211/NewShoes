#!/usr/bin/env node
// verify_audio_request_update_frontier.mjs
//
// Source-only verifier that pins the original *drain/update* frontier for the
// queued audio request list (m_audioRequests): how the engine, once per frame,
// drains the pending AR_Play / AR_Pause / AR_Stop requests and routes them to
// the Miles-facing playback path. It reads (never executes) the original
// Common audio base source/header and the concrete Miles device source/header
// that owns the real drain, plus the AudioRequest contract header, and emits a
// JSON report.
//
// This is the drain/update companion to:
//   - verify_audio_event_request_frontier.mjs  (request *enqueue/lifecycle*)
//   - verify_miles_audio_*_frontier.mjs        (device/playback/volume/decode)
// Where the event-request verifier pins the enqueue frontier
// (addAudioEvent -> allocateAudioRequest -> appendAudioRequest), this verifier
// pins the matching drain frontier: the per-frame update() -> processRequestList()
// loop that pops each AudioRequest, the shouldProcessRequestThisFrame /
// adjustRequest / checkForSample gating, and processRequest()'s switch that
// routes AR_Play -> playAudioEvent(m_pendingEvent), AR_Pause ->
// pauseAudioEvent(m_handleToInteractOn), AR_Stop ->
// stopAudioEvent(m_handleToInteractOn).
//
// No playback or asset decoding is performed. No C++, package.json, docs,
// TODO, DONE, SOURCE_INVENTORY, harness, or shim files are touched by this tool.
//
// Verified facts (all source-only, bounded line + ordered function-body scans):
//
//   AudioRequest contract (AudioRequest.h):
//     - RequestType enum @ 39 with AR_Play @ 41, AR_Pause @ 42, AR_Stop @ 43.
//
//   Base AudioManager (GameAudio.cpp) — the *no-op* base drain:
//     - AudioManager::update @ 313 exists (it positions the listener only; the
//       base class does NOT drain m_audioRequests).
//     - AudioManager::processRequestList @ 837 is the empty {} stub — the real
//       drain lives in the Miles subclass.
//     - AudioManager::releaseAudioRequest @ 811 (deleteInstance) and
//       AudioManager::removeAllAudioRequests @ 826 (loop + clear) own the
//       shutdown drain of m_audioRequests.
//   Base header (GameAudio.h): update @ 147, processRequestList @ 255,
//     removeAllAudioRequests @ 323.
//
//   Miles drain (MilesAudioManager.cpp) — the concrete per-frame drain:
//     - MilesAudioManager::update @ 484, ordered body:
//         AudioManager::update() -> setDeviceListenerPosition ->
//         processRequestList -> processPlayingList -> processFadingList ->
//         processStoppedList.
//     - MilesAudioManager::processRequestList @ 2242, ordered body:
//         for(m_audioRequests.begin) ->
//         shouldProcessRequestThisFrame gate (adjustRequest, ++it, continue) ->
//         (checkForSample gate) processRequest(req) ->
//         deleteInstance -> erase.
//     - MilesAudioManager::processRequest @ 2940, ordered body:
//         switch(req->m_request) ->
//           case AR_Play  -> playAudioEvent(req->m_pendingEvent)
//           case AR_Pause -> pauseAudioEvent(req->m_handleToInteractOn)
//           case AR_Stop  -> stopAudioEvent(req->m_handleToInteractOn)
//     - Drain helpers: shouldProcessRequestThisFrame @ 2501, adjustRequest @ 2515,
//       checkForSample @ 2526.
//   Miles header (MilesAudioManager.h): update @ 150, processRequestList @ 210.
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
  gameAudioH:
    "GeneralsMD/Code/GameEngine/Include/Common/GameAudio.h",
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
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

  const audioRequest = readSourceLines(SOURCES.audioRequestH);
  const gameAudioH = readSourceLines(SOURCES.gameAudioH);
  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const milesH = readSourceLines(SOURCES.milesH);
  const miles = readSourceLines(SOURCES.milesCpp);

  // -----------------------------------------------------------------
  // 1. AudioRequest.h: RequestType enum (AR_Play / AR_Pause / AR_Stop)
  // -----------------------------------------------------------------
  {
    const out = {};
    const entries = [
      { key: "enum", line: 39, re: /^enum\s+RequestType\b/ },
      { key: "AR_Play", line: 41, re: /\bAR_Play\b/ },
      { key: "AR_Pause", line: 42, re: /\bAR_Pause\b/ },
      { key: "AR_Stop", line: 43, re: /\bAR_Stop\b/ },
    ];
    for (const { key, line, re } of entries) {
      const ln = lineNumber(audioRequest.lines, (l) => re.test(l));
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(audioRequest.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.audioRequestEnum = out;
  }

  // -----------------------------------------------------------------
  // 2. Base AudioManager (GameAudio.cpp) — no-op base drain frontier
  // -----------------------------------------------------------------
  pinDef(
    gameAudio,
    "gameAudioUpdateDefLine",
    /void\s+AudioManager\s*::\s*update\s*\(\s*\)/,
    313,
    errors,
    facts,
  );

  // The base processRequestList is an empty {} stub: assert the stub body has
  // no calls (no processRequest / playAudioEvent references).
  {
    const defLine = pinDef(
      gameAudio,
      "gameAudioProcessRequestListDefLine",
      /void\s+AudioManager\s*::\s*processRequestList\s*\(\s*void\s*\)/,
      837,
      errors,
      facts,
    );
    if (defLine > 0) {
      const range = functionBodyLineRange(gameAudio.lines, defLine);
      const leak = range
        ? firstMatchInRange(gameAudio.lines, range.start, range.end, /processRequest|playAudioEvent|pauseAudioEvent|stopAudioEvent|m_audioRequests/)
        : -1;
      facts.gameAudioProcessRequestListStub = {
        emptyStub: leak === -1,
        strayCall: leak,
      };
      if (leak !== -1) {
        errors.push(
          `${ownerTag(gameAudio.abs)}: base processRequestList expected to be an empty stub but references drain/routing at line ${leak}`,
        );
      }
    }
  }

  pinDef(
    gameAudio,
    "gameAudioReleaseAudioRequestDefLine",
    /void\s+AudioManager\s*::\s*releaseAudioRequest\s*\(/,
    811,
    errors,
    facts,
  );
  pinDef(
    gameAudio,
    "gameAudioRemoveAllAudioRequestsDefLine",
    /void\s+AudioManager\s*::\s*removeAllAudioRequests\s*\(\s*void\s*\)/,
    826,
    errors,
    facts,
  );

  // removeAllAudioRequests body order: loop begin->end, releaseAudioRequest, clear.
  {
    const range = functionBodyLineRange(
      gameAudio.lines,
      facts.gameAudioRemoveAllAudioRequestsDefLine,
    );
    pinOrderedBody(
      gameAudio,
      facts.gameAudioRemoveAllAudioRequestsDefLine,
      "gameAudioRemoveAllAudioRequestsBody",
      [
        { key: "loop_begin", re: /m_audioRequests\s*\.\s*begin\s*\(\s*\)/ },
        { key: "releaseAudioRequest_call", re: /\breleaseAudioRequest\s*\(/ },
        { key: "clear", re: /m_audioRequests\s*\.\s*clear\s*\(\s*\)/ },
      ],
      errors,
      facts,
    );
    if (!range) {
      /* error already recorded by pinOrderedBody */
    }
  }

  // Base header anchors (GameAudio.h).
  {
    const out = {};
    const entries = [
      { key: "update", line: 147, re: /virtual\s+void\s+update\s*\(\s*\)/ },
      {
        key: "processRequestList",
        line: 255,
        re: /virtual\s+void\s+processRequestList\s*\(\s*void\s*\)/,
      },
      {
        key: "removeAllAudioRequests",
        line: 323,
        re: /\bremoveAllAudioRequests\s*\(\s*void\s*\)/,
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

  // -----------------------------------------------------------------
  // 3. Miles drain (MilesAudioManager.cpp) — concrete per-frame drain
  // -----------------------------------------------------------------
  // MilesAudioManager::update body order.
  {
    const defLine = pinDef(
      miles,
      "milesUpdateDefLine",
      /void\s+MilesAudioManager\s*::\s*update\s*\(\s*\)/,
      484,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "milesUpdateBody", [
      { key: "AudioManager_update", re: /\bAudioManager\s*::\s*update\s*\(\s*\)/ },
      { key: "setDeviceListenerPosition", re: /\bsetDeviceListenerPosition\s*\(\s*\)/ },
      { key: "processRequestList", re: /\bprocessRequestList\s*\(\s*\)/ },
      { key: "processPlayingList", re: /\bprocessPlayingList\s*\(\s*\)/ },
      { key: "processFadingList", re: /\bprocessFadingList\s*\(\s*\)/ },
      { key: "processStoppedList", re: /\bprocessStoppedList\s*\(\s*\)/ },
    ], errors, facts);
  }

  // MilesAudioManager::processRequestList drain body order.
  {
    const defLine = pinDef(
      miles,
      "milesProcessRequestListDefLine",
      /void\s+MilesAudioManager\s*::\s*processRequestList\s*\(\s*void\s*\)/,
      2242,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "milesProcessRequestListBody", [
      { key: "for_begin", re: /m_audioRequests\s*\.\s*begin\s*\(\s*\)/ },
      {
        key: "shouldProcessRequestThisFrame",
        re: /\bshouldProcessRequestThisFrame\s*\(/,
      },
      {
        key: "adjustRequest",
        re: /\badjustRequest\s*\(/,
      },
      {
        key: "checkForSample",
        re: /\bcheckForSample\s*\(/,
      },
      {
        key: "processRequest_call",
        re: /\bprocessRequest\s*\(\s*req\s*\)/,
      },
      {
        key: "deleteInstance",
        re: /->\s*deleteInstance\s*\(/,
      },
      {
        key: "erase",
        re: /m_audioRequests\s*\.\s*erase\s*\(/,
      },
    ], errors, facts);
  }

  // MilesAudioManager::processRequest routing switch body order.
  {
    const defLine = pinDef(
      miles,
      "milesProcessRequestDefLine",
      /void\s+MilesAudioManager\s*::\s*processRequest\s*\(\s*AudioRequest\s*\*\s*req\s*\)/,
      2940,
      errors,
      facts,
    );
    pinOrderedBody(miles, defLine, "milesProcessRequestBody", [
      {
        key: "switch_m_request",
        re: /\bswitch\s*\(\s*req\s*->\s*m_request\s*\)/,
      },
      {
        key: "case_AR_Play",
        re: /\bcase\s+AR_Play\b/,
      },
      {
        key: "playAudioEvent",
        re: /\bplayAudioEvent\s*\(\s*req\s*->\s*m_pendingEvent\s*\)/,
      },
      {
        key: "case_AR_Pause",
        re: /\bcase\s+AR_Pause\b/,
      },
      {
        key: "pauseAudioEvent",
        re: /\bpauseAudioEvent\s*\(\s*req\s*->\s*m_handleToInteractOn\s*\)/,
      },
      {
        key: "case_AR_Stop",
        re: /\bcase\s+AR_Stop\b/,
      },
      {
        key: "stopAudioEvent",
        re: /\bstopAudioEvent\s*\(\s*req\s*->\s*m_handleToInteractOn\s*\)/,
      },
    ], errors, facts);
  }

  // Drain helper anchors.
  {
    const out = {};
    const entries = [
      {
        key: "shouldProcessRequestThisFrame",
        line: 2501,
        re: /Bool\s+MilesAudioManager\s*::\s*shouldProcessRequestThisFrame\s*\(/,
      },
      {
        key: "adjustRequest",
        line: 2515,
        re: /void\s+MilesAudioManager\s*::\s*adjustRequest\s*\(/,
      },
      {
        key: "checkForSample",
        line: 2526,
        re: /Bool\s+MilesAudioManager\s*::\s*checkForSample\s*\(/,
      },
    ];
    for (const { key, line, re } of entries) {
      const ln = findMemberDef(miles.lines, re);
      out[key] = ln;
      if (ln !== line) {
        errors.push(
          `${ownerTag(miles.abs)}: ${key} expected at line ${line} but found at ${ln}`,
        );
      }
    }
    facts.milesDrainHelpers = out;
  }

  // Miles header anchors.
  {
    const out = {};
    const entries = [
      { key: "update", line: 150, re: /virtual\s+void\s+update\s*\(\s*\)/ },
      {
        key: "processRequestList",
        line: 210,
        re: /virtual\s+void\s+processRequestList\s*\(\s*void\s*\)/,
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
    facts.milesHeader = out;
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
