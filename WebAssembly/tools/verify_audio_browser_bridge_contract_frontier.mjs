#!/usr/bin/env node
// verify_audio_browser_bridge_contract_frontier.mjs
//
// Source-only verifier that pins the *next* browser/Web Audio bridge contract
// the port must honor after the current harness-only live requested-audio
// proof: when the Miles Sound System calls are replaced by Web Audio
// scheduling, the browser backend must preserve the *original source request
// path*. That path flows from AudioManager::addAudioEvent through the Common
// Sound/Music request managers' AR_Play queues, is drained by
// MilesAudioManager::processRequest, and is finally realized inside
// MilesAudioManager::playAudioEvent — which is the actual bridge replacement
// seam (playStream / playSample3D / playSample), not the Common managers.
//
// It reads (never executes) the original Common audio source and the concrete
// Miles device source that owns the real playback seam, and emits a JSON
// report. No C++ execution, no asset reads, no playback.
//
// This is the bridge-contract companion to:
//   - verify_audio_event_request_frontier.mjs      (event/request *enqueue*)
//   - verify_audio_request_update_frontier.mjs      (per-frame request *drain*)
//   - verify_audio_playing_event_state_frontier.mjs (PlayingAudio *record*)
// Where those pin the enqueue/drain/record frontiers individually, this
// verifier stitches them into the single end-to-end contract the next Web
// Audio backend must preserve unchanged:
//     addAudioEvent -> [AT_Music|m_sound] -> AR_Play queue -> processRequest
//     -> playAudioEvent -> {playStream|playSample3D|playSample}
//     -> notifyOfAudioCompletion + processPlayingList drain.
//
// No C++, package.json, docs, TODO, DONE, SOURCE_INVENTORY, harness, or shim
// files are touched by this tool.
//
// Verified facts (all source-only, bounded line + ordered function-body scans):
//
//   1. AudioManager::addAudioEvent @414 (GameAudio.cpp) body order:
//        allocateNewHandle -> generateFilename -> generatePlayInfo ->
//        (type == AT_Music branch) m_music->addAudioEvent / else
//        m_sound->addAudioEvent. AT_Music routes to music; everything else
//        (AT_SoundEffect / AT_Streaming) routes to sound.
//
//   2. SoundManager::addAudioEvent @139 (GameSounds.cpp) body order:
//        canPlayNow gate -> allocateAudioRequest(true) -> m_pendingEvent ->
//        m_request = AR_Play -> appendAudioRequest, with releaseAudioEventRTS
//        on the canPlayNow failure branch.
//
//   3. MusicManager::addAudioEvent @120 (GameMusic.cpp) delegates to
//        playTrack @102, whose body order is allocateAudioRequest(true) ->
//        m_pendingEvent -> m_request = AR_Play -> appendAudioRequest.
//
//   4. MilesAudioManager::processRequest @3039 (MilesAudioManager.cpp) body
//        order: switch(req->m_request) -> case AR_Play ->
//        playAudioEvent(req->m_pendingEvent); case AR_Pause ->
//        pauseAudioEvent(req->m_handleToInteractOn); case AR_Stop ->
//        stopAudioEvent(req->m_handleToInteractOn).
//
//   5. MilesAudioManager::playAudioEvent @694 is the bridge replacement seam:
//        switch(info->m_soundType) branches call playStream @735,
//        playSample3D @802, and playSample @873. The seam function defs are
//        pinned at playStream @2845, playSample @2888, playSample3D @2914.
//        These — not the Common request managers — are what a Web Audio
//        backend must replace/retarget.
//
//   6. MilesAudioManager::notifyOfAudioCompletion @1569 body order:
//        findPlayingAudioFrom -> m_status = PS_Stopped; and
//        MilesAudioManager::processPlayingList @2325 body order:
//        m_playingSounds.begin -> PS_Stopped -> releasePlayingAudio ->
//        erase. This is the completion/drain contract a browser
//        AudioBufferSourceNode.onended callback must trigger by equivalent
//        state.
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
  gameSoundsCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameSounds.cpp",
  gameMusicCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameMusic.cpp",
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

// Locate a member function definition by signature regex.
function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a 1-based definition line, scan the brace-balanced function body that
// follows. Returns { start, end } as 1-based line numbers spanning the body
// interior (opening-brace line through closing-brace line), or null.
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

function ownerTag(abs) {
  return abs.split("/").slice(-2).join("/");
}

// Pin a member definition at an exact line; record under facts[factsKey].
function pinDef(src, sigRe, expected, errors, facts, factsKey) {
  const defLine = findMemberDef(src.lines, sigRe);
  facts[factsKey] = defLine;
  if (defLine !== expected) {
    errors.push(
      `${ownerTag(src.abs)}: ${factsKey} expected at line ${expected} but found at ${defLine}`,
    );
  }
  return defLine;
}

// Pin a set of { key, line, re } anchors at exact lines within a single file.
function pinExactLines(src, entries, errors, facts, factsKey) {
  const out = {};
  for (const { key, line, re } of entries) {
    const ln = lineNumber(src.lines, (candidate) => re.test(candidate));
    out[key] = ln;
    if (ln !== line) {
      errors.push(
        `${ownerTag(src.abs)}: ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts[factsKey] = out;
}

// Pin an ordered sequence of body matches that must appear in source order.
function pinOrderedBody(src, defLine, order, errors, facts, factsKey) {
  const positions = {};
  let prevLine = -1;
  let prevKey = null;
  if (defLine <= 0) {
    for (const { key } of order) positions[key] = -1;
    facts[factsKey] = positions;
    return;
  }
  const range = functionBodyLineRange(src.lines, defLine);
  if (!range) {
    errors.push(
      `${ownerTag(src.abs)}: function body not found for definition at line ${defLine}`,
    );
    for (const { key } of order) positions[key] = -1;
    facts[factsKey] = positions;
    return;
  }
  for (const { key, re } of order) {
    const ln = firstMatchInRange(src.lines, range.start, range.end, re);
    positions[key] = ln;
    if (ln === -1) {
      errors.push(
        `${ownerTag(src.abs)}: expected ${key} not found in body of definition at line ${defLine}`,
      );
    } else if (prevLine !== -1 && !(prevLine < ln)) {
      errors.push(
        `${ownerTag(src.abs)}: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
      );
    }
    prevLine = ln;
    prevKey = key;
  }
  facts[factsKey] = positions;
}

function main() {
  const errors = [];
  const facts = {};

  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const gameSounds = readSourceLines(SOURCES.gameSoundsCpp);
  const gameMusic = readSourceLines(SOURCES.gameMusicCpp);
  const miles = readSourceLines(SOURCES.milesCpp);

  // -----------------------------------------------------------------
  // 1. AudioManager::addAudioEvent (GameAudio.cpp) — request routing
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      gameAudio,
      /AudioHandle\s+AudioManager\s*::\s*addAudioEvent\s*\(/,
      414,
      errors,
      facts,
      "gameAudioAddAudioEventDefLine",
    );
    pinOrderedBody(
      gameAudio,
      defLine,
      [
        { key: "allocateNewHandle", re: /\ballocateNewHandle\s*\(\s*\)/ },
        {
          key: "generateFilename",
          re: /(->|\.)generateFilename\s*\(\s*\)/,
        },
        {
          key: "generatePlayInfo",
          re: /(->|\.)generatePlayInfo\s*\(\s*\)/,
        },
        { key: "type_AT_Music", re: /\btype\s*==\s*AT_Music\b/ },
        {
          key: "m_music_addAudioEvent",
          re: /m_music\s*->\s*addAudioEvent\s*\(/,
        },
        {
          key: "m_sound_addAudioEvent",
          re: /m_sound\s*->\s*addAudioEvent\s*\(/,
        },
      ],
      errors,
      facts,
      "gameAudioAddAudioEventBody",
    );
  }

  // -----------------------------------------------------------------
  // 2. SoundManager::addAudioEvent (GameSounds.cpp) — AR_Play queue
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      gameSounds,
      /void\s+SoundManager\s*::\s*addAudioEvent\s*\(\s*AudioEventRTS\s*\*/s,
      139,
      errors,
      facts,
      "gameSoundsAddAudioEventDefLine",
    );
    pinOrderedBody(
      gameSounds,
      defLine,
      [
        { key: "canPlayNow", re: /\bcanPlayNow\s*\(/ },
        {
          key: "allocateAudioRequest_true",
          re: /\ballocateAudioRequest\s*\(\s*true\s*\)/,
        },
        { key: "m_pendingEvent", re: /m_pendingEvent\s*=\s*eventToAdd/ },
        { key: "AR_Play", re: /\bm_request\s*=\s*AR_Play\b/ },
        { key: "appendAudioRequest", re: /\bappendAudioRequest\s*\(/ },
        {
          key: "releaseAudioEventRTS_onFailure",
          re: /\breleaseAudioEventRTS\s*\(/,
        },
      ],
      errors,
      facts,
      "gameSoundsAddAudioEventBody",
    );
  }

  // -----------------------------------------------------------------
  // 3. MusicManager::addAudioEvent (GameMusic.cpp) -> playTrack AR_Play
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      gameMusic,
      /void\s+MusicManager\s*::\s*addAudioEvent\s*\(\s*AudioEventRTS\s*\*/s,
      120,
      errors,
      facts,
      "gameMusicAddAudioEventDefLine",
    );
    pinOrderedBody(
      gameMusic,
      defLine,
      [{ key: "playTrack_call", re: /\bplayTrack\s*\(/ }],
      errors,
      facts,
      "gameMusicAddAudioEventBody",
    );

    const playTrackDefLine = pinDef(
      gameMusic,
      /void\s+MusicManager\s*::\s*playTrack\s*\(\s*AudioEventRTS\s*\*/s,
      102,
      errors,
      facts,
      "gameMusicPlayTrackDefLine",
    );
    pinOrderedBody(
      gameMusic,
      playTrackDefLine,
      [
        {
          key: "allocateAudioRequest_true",
          re: /\ballocateAudioRequest\s*\(\s*true\s*\)/,
        },
        { key: "m_pendingEvent", re: /m_pendingEvent\s*=\s*eventToUse/ },
        { key: "AR_Play", re: /\bm_request\s*=\s*AR_Play\b/ },
        { key: "appendAudioRequest", re: /\bappendAudioRequest\s*\(/ },
      ],
      errors,
      facts,
      "gameMusicPlayTrackBody",
    );
  }

  // -----------------------------------------------------------------
  // 4. MilesAudioManager::processRequest — AR_Play/Pause/Stop routing
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      /void\s+MilesAudioManager\s*::\s*processRequest\s*\(\s*AudioRequest\s*\*\s*req\s*\)/,
      3039,
      errors,
      facts,
      "milesProcessRequestDefLine",
    );
    pinOrderedBody(
      miles,
      defLine,
      [
        { key: "switch_m_request", re: /\bswitch\s*\(\s*req\s*->\s*m_request\s*\)/ },
        { key: "case_AR_Play", re: /\bcase\s+AR_Play\b/ },
        {
          key: "playAudioEvent",
          re: /\bplayAudioEvent\s*\(\s*req\s*->\s*m_pendingEvent\s*\)/,
        },
        { key: "case_AR_Pause", re: /\bcase\s+AR_Pause\b/ },
        {
          key: "pauseAudioEvent",
          re: /\bpauseAudioEvent\s*\(\s*req\s*->\s*m_handleToInteractOn\s*\)/,
        },
        { key: "case_AR_Stop", re: /\bcase\s+AR_Stop\b/ },
        {
          key: "stopAudioEvent",
          re: /\bstopAudioEvent\s*\(\s*req\s*->\s*m_handleToInteractOn\s*\)/,
        },
      ],
      errors,
      facts,
      "milesProcessRequestBody",
    );
  }

  // -----------------------------------------------------------------
  // 5. MilesAudioManager::playAudioEvent — the bridge replacement seam
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      /void\s+MilesAudioManager\s*::\s*playAudioEvent\s*\(\s*AudioEventRTS\s*\*\s*event\s*\)/,
      694,
      errors,
      facts,
      "milesPlayAudioEventDefLine",
    );
    pinOrderedBody(
      miles,
      defLine,
      [
        {
          key: "switch_m_soundType",
          re: /\bswitch\s*\(\s*info\s*->\s*m_soundType\s*\)/,
        },
        {
          key: "playStream_call",
          re: /\bplayStream\s*\(\s*event\s*,\s*stream\s*\)/,
        },
        {
          key: "playSample3D_call",
          re: /\bplaySample3D\s*\(\s*event\s*,\s*sample3D\s*\)/,
        },
        {
          key: "playSample_call",
          re: /\bplaySample\s*\(\s*event\s*,\s*sample\s*\)/,
        },
      ],
      errors,
      facts,
      "milesPlayAudioEventBody",
    );

    // Seam function definition anchors (the Web Audio retarget surface).
    pinExactLines(
      miles,
      [
        {
          key: "playStream_def",
          line: 2845,
          re: /void\s+MilesAudioManager\s*::\s*playStream\s*\(/,
        },
        {
          key: "playSample_def",
          line: 2888,
          re: /void\s*\*\s*MilesAudioManager\s*::\s*playSample\s*\(/,
        },
        {
          key: "playSample3D_def",
          line: 2914,
          re: /void\s*\*\s*MilesAudioManager\s*::\s*playSample3D\s*\(/,
        },
      ],
      errors,
      facts,
      "milesPlaySeamDefs",
    );
  }

  // -----------------------------------------------------------------
  // 6. notifyOfAudioCompletion + processPlayingList — completion/drain
  // -----------------------------------------------------------------
  {
    const defLine = pinDef(
      miles,
      /void\s+MilesAudioManager\s*::\s*notifyOfAudioCompletion\s*\(\s*UnsignedInt\s+audioCompleted/,
      1569,
      errors,
      facts,
      "milesNotifyOfAudioCompletionDefLine",
    );
    pinOrderedBody(
      miles,
      defLine,
      [
        {
          key: "findPlayingAudioFrom",
          re: /\bfindPlayingAudioFrom\s*\(\s*audioCompleted/,
        },
        {
          key: "m_status_PS_Stopped",
          re: /m_status\s*=\s*PS_Stopped\b/,
        },
      ],
      errors,
      facts,
      "milesNotifyOfAudioCompletionBody",
    );

    const processDefLine = pinDef(
      miles,
      /void\s+MilesAudioManager\s*::\s*processPlayingList\s*\(\s*void\s*\)/,
      2325,
      errors,
      facts,
      "milesProcessPlayingListDefLine",
    );
    pinOrderedBody(
      miles,
      processDefLine,
      [
        {
          key: "m_playingSounds_begin",
          re: /m_playingSounds\s*\.\s*begin\s*\(\s*\)/,
        },
        { key: "PS_Stopped_check", re: /m_status\s*==\s*PS_Stopped\b/ },
        { key: "releasePlayingAudio", re: /\breleasePlayingAudio\s*\(/ },
      ],
      errors,
      facts,
      "milesProcessPlayingListBody",
    );
    // The drain pairs releasePlayingAudio with a following erase of the same
    // list. The body also has an earlier null-check erase, so pin the erase
    // that follows the release call rather than enforcing strict order across
    // all erases.
    {
      const range = functionBodyLineRange(miles.lines, processDefLine);
      const releaseLn =
        facts.milesProcessPlayingListBody.releasePlayingAudio;
      const drainErase =
        range && releaseLn > 0
          ? firstMatchInRange(
              miles.lines,
              releaseLn,
              range.end,
              /m_playingSounds\s*\.\s*erase\s*\(/,
            )
          : -1;
      facts.milesProcessPlayingListBody.drainErase = drainErase;
      if (drainErase === -1) {
        errors.push(
          `${ownerTag(miles.abs)}: processPlayingList drain erase not found after releasePlayingAudio (line ${releaseLn})`,
        );
      }
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
