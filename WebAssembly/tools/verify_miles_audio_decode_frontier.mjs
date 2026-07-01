#!/usr/bin/env node
// verify_miles_audio_decode_frontier.mjs
//
// Source-only verifier that pins the original source frontier between
// decoded/loaded audio payload bytes and Miles playback. It reads (never
// executes) the original MilesAudioManager device source, its immediate
// header, the Common/file.h abstraction it loads payload bytes through, and
// the wasm Mss.H shim (which now implements the IMA ADPCM decode boundary),
// and emits a JSON report.
//
// This is the decode/load companion to:
//   - verify_miles_audio_device_frontier.mjs      (device *startup* frontier)
//   - verify_miles_audio_playback_frontier.mjs     (playback *handle* frontier)
//   - verify_miles_audio_volume_frontier.mjs       (volume frontier)
// It pins the byte boundary the Web Audio port must replace: where sample
// file bytes are loaded, where the Miles WAV parser / ADPCM decoder runs,
// where the decoded buffer is handed to a Miles sample/3D-sample handle, and
// where stream bytes flow into Miles through the registered file callbacks.
//
// No playback or asset decoding is performed. No C++, package.json, docs,
// TODO, or harness files are touched by this tool.
//
// Verified facts (all source-only, bounded function-body scans):
//
//   Sample payload load + Miles-side decode (AudioFileCache::openFile @ 3126):
//     - TheFileSystem->openFile(strToFind.str())        @ 3156  (raw file open)
//     - file->readEntireAndClose()                      @ 3163  (full payload -> RAM)
//     - AIL_WAV_info(buffer, &soundInfo)                @ 3169  (Miles WAV parse)
//     - WAVE_FORMAT_IMA_ADPCM branch                    @ 3179
//         -> AIL_decompress_ADPCM(&soundInfo, ...)      @ 3182  (Miles ADPCM decode)
//     - WAVE_FORMAT_PCM branch                          @ 3189  (passthrough, no decode)
//
//   Cache entry/exit used by the sample path:
//     - MilesAudioManager::loadFileForRead @ 1054 delegates to
//       m_audioCache->openFile(eventToLoadFrom)         @ 1056  (decode entry)
//     - MilesAudioManager::closeFile       @ 1060 delegates to
//       m_audioCache->closeFile(fileRead)               @ 1062
//     - AudioFileCache::closeFile           @ 3217 (refcount decrement)
//     - AudioFileCache::releaseOpenAudioFile @ 3245 frees the decoded payload:
//         ADPCM-decompressed via AIL_mem_free_lock      @ 3255
//         otherwise delete []                           @ 3258
//
//   Decoded payload -> Miles sample handle (the decode/playback boundary):
//     - playSample   @ 2798, body order:
//         loadFileForRead(event)  ->  AIL_set_sample_file(sample, fileBuffer, 0)
//                                                       @ 2810
//                                  ->  AIL_start_sample @ 2813
//     - playSample3D @ 2820, body order:
//         loadFileForRead(event)  ->  AIL_set_3D_sample_file(sample3D, fileBuffer)
//                                                       @ 2827
//                                  ->  AIL_start_3D_sample @ 2847
//
//   Stream payload -> Miles (Miles decodes via registered file callbacks):
//     - init @ 444 registers callbacks via
//       AIL_set_file_callbacks(streamingFileOpen, streamingFileClose,
//                              streamingFileSeek, streamingFileRead) @ 458
//     - streamingFileOpen  @ 3065 opens via
//       TheFileSystem->openFile(fileName, File::READ | File::STREAMING) @ 3073
//     - streamingFileClose @ 3078, streamingFileSeek @ 3084,
//       streamingFileRead  @ 3090 (feeds raw bytes to Miles for internal decode)
//     - playAudioEvent opens the Miles stream by filename via
//       AIL_open_stream(m_digitalHandle, fileToPlay.str(), 0) @ 720
//     - playStream @ 2783, body order:
//         AIL_register_stream_callback(stream, setStreamCompleted) @ 2790
//         -> AIL_start_stream(stream) @ 2791
//     - friend_forcePlayAudioEventRTS uses the separate filename-only path
//       AIL_quick_load_and_play(fileToPlay.str(), 1, 0) @ 3035 (Miles loads +
//       decodes internally; no cache buffer crosses the boundary).
//
//   Lifecycle transitions that own decoded-payload lifetime:
//     - allocatePlayingAudio sets m_status = PS_Playing   @ 1070
//     - notifyOfAudioCompletion @ 1531 sets m_status = PS_Stopped @ 1589
//       (decoded buffer released on the next processPlayingList sweep via
//        releasePlayingAudio -> closeFile -> releaseOpenAudioFile)
//     - releaseMilesHandles @ 1076 stops samples / closes streams.
//
//   Immediate header/shim/file.h anchors:
//     - MilesAudioManager.h: loadFileForRead @ 260, closeFile @ 261,
//       AudioFileCache::openFile @ 113, AudioFileCache::closeFile @ 114,
//       notifyOfAudioCompletion @ 177, OpenAudioFile::m_compressed @ 97,
//       PlayingAudioType enum @ 31, PlayingAudio struct @ 54 (m_file @ 66,
//       m_status @ 64, m_type @ 63), AudioFileCache *m_audioCache @ 320.
//     - Common/file.h: READ @ 93, STREAMING @ 104, readEntireAndClose @ 174.
//     - WebAssembly/shims/Mss.H: declarations present for every Miles
//       decode/load call referenced above, and the ADPCM decode boundary is
//       now *implemented* (not stubbed): AILSOUNDINFO carries the original
//       Miles field surface (data_ptr/data_len/samples/block_size/
//       initial_ptr), AIL_WAV_info parses fmt/fact/data chunks,
//       AIL_decompress_ADPCM performs the standard IMA ADPCM -> PCM16 WAV
//       decode into a heap buffer, and AIL_mem_free_lock actually frees it.
//
// Exit 0 only if all checks pass; exit 1 with JSON errors otherwise.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  cpp: "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  header:
    "GeneralsMD/Code/GameEngineDevice/Include/MilesAudioDevice/MilesAudioManager.h",
  fileH: "GeneralsMD/Code/GameEngine/Include/Common/file.h",
  shim: "WebAssembly/shims/Mss.H",
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

// Locate a top-level member function definition by matching its signature.
function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a definition line, scan the brace-balanced body that follows.
// Returns { start, end } as 1-based line numbers of the body interior span
// (from the opening brace line to the closing brace line), or null.
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

// Verify an ordered call sequence inside a function body. Each entry has
// { key, re }. Records positions and asserts strict increasing line order.
function checkOrderedCalls(lines, range, owner, order, errors) {
  const positions = {};
  let prevLine = -1;
  let prevKey = null;
  for (const { key, re } of order) {
    const ln = range
      ? firstMatchInRange(lines, range.start, range.end, re)
      : -1;
    positions[key] = ln;
    if (ln === -1) {
      errors.push(`${owner}: expected call ${key} not found in body`);
    } else if (prevLine !== -1 && !(prevLine < ln)) {
      errors.push(
        `${owner}: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
      );
    }
    prevLine = ln;
    prevKey = key;
  }
  return positions;
}

function assertDefAt(name, found, expected, errors, facts) {
  facts[`${name}DefLine`] = found;
  if (found !== expected) {
    errors.push(
      `${name} expected at line ${expected} but found at ${found}`,
    );
  }
}

function main() {
  const errors = [];
  const facts = {};

  const cpp = readSourceLines(SOURCES.cpp);
  const h = readSourceLines(SOURCES.header);
  const fileH = readSourceLines(SOURCES.fileH);
  const shim = readSourceLines(SOURCES.shim);

  // =====================================================================
  // 1. Sample payload load + Miles-side decode: AudioFileCache::openFile
  // =====================================================================
  const openFileLine = findMemberDef(
    cpp.lines,
    /void\s*\*\s*AudioFileCache\s*::\s*openFile\s*\(/,
  );
  assertDefAt("AudioFileCache::openFile", openFileLine, 3126, errors, facts);
  if (openFileLine > 0) {
    const range = functionBodyLineRange(cpp.lines, openFileLine);
    if (!range) {
      errors.push("AudioFileCache::openFile: function body not found");
    }
    const order = [
      // Raw file open through the Common file abstraction.
      { key: "TheFileSystem_openFile", re: /TheFileSystem->openFile\s*\(/ },
      // Full payload read into a RAM buffer.
      { key: "readEntireAndClose", re: /readEntireAndClose\s*\(/ },
      // Miles parses the WAV header into AILSOUNDINFO.
      { key: "AIL_WAV_info", re: /AIL_WAV_info\s*\(/ },
      // Branch on IMA ADPCM, then Miles decodes ADPCM -> PCM.
      {
        key: "WAVE_FORMAT_IMA_ADPCM_branch",
        re: /WAVE_FORMAT_IMA_ADPCM/,
      },
      { key: "AIL_decompress_ADPCM", re: /AIL_decompress_ADPCM\s*\(/ },
      // PCM passthrough branch (no decode).
      { key: "WAVE_FORMAT_PCM_branch", re: /WAVE_FORMAT_PCM/ },
    ];
    facts.AudioFileCache_openFile_body = checkOrderedCalls(
      cpp.lines,
      range,
      "AudioFileCache::openFile",
      order,
      errors,
    );
  }

  // =====================================================================
  // 2. Cache entry/exit used by the sample path
  // =====================================================================
  const loadFileForReadLine = findMemberDef(
    cpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*loadFileForRead\s*\(/,
  );
  assertDefAt(
    "MilesAudioManager::loadFileForRead",
    loadFileForReadLine,
    1054,
    errors,
    facts,
  );
  if (loadFileForReadLine > 0) {
    const range = functionBodyLineRange(cpp.lines, loadFileForReadLine);
    if (!range) {
      errors.push("loadFileForRead: function body not found");
    }
    const deleg = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /m_audioCache->openFile\s*\(/,
        )
      : -1;
    facts.loadFileForRead_body = { audioCacheOpenFileCall: deleg };
    if (deleg === -1) {
      errors.push(
        "loadFileForRead: m_audioCache->openFile(...) delegation not found in body",
      );
    }
  }

  const closeFileLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*closeFile\s*\(\s*void\s*\*\s*fileRead\s*\)/,
  );
  assertDefAt(
    "MilesAudioManager::closeFile",
    closeFileLine,
    1060,
    errors,
    facts,
  );
  if (closeFileLine > 0) {
    const range = functionBodyLineRange(cpp.lines, closeFileLine);
    if (!range) {
      errors.push("closeFile: function body not found");
    }
    const deleg = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /m_audioCache->closeFile\s*\(/,
        )
      : -1;
    facts.closeFile_body = { audioCacheCloseFileCall: deleg };
    if (deleg === -1) {
      errors.push(
        "closeFile: m_audioCache->closeFile(...) delegation not found in body",
      );
    }
  }

  const cacheCloseFileLine = findMemberDef(
    cpp.lines,
    /void\s+AudioFileCache\s*::\s*closeFile\s*\(/,
  );
  assertDefAt(
    "AudioFileCache::closeFile",
    cacheCloseFileLine,
    3217,
    errors,
    facts,
  );

  // releaseOpenAudioFile frees the decoded payload buffer.
  const releaseOpenAudioFileLine = findMemberDef(
    cpp.lines,
    /void\s+AudioFileCache\s*::\s*releaseOpenAudioFile\s*\(/,
  );
  assertDefAt(
    "AudioFileCache::releaseOpenAudioFile",
    releaseOpenAudioFileLine,
    3245,
    errors,
    facts,
  );
  if (releaseOpenAudioFileLine > 0) {
    const range = functionBodyLineRange(cpp.lines, releaseOpenAudioFileLine);
    if (!range) {
      errors.push("releaseOpenAudioFile: function body not found");
    }
    const memFree = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_mem_free_lock\s*\(/,
        )
      : -1;
    const del = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /delete\s*\[\]\s*fileToRelease->m_file/,
        )
      : -1;
    facts.releaseOpenAudioFile_body = {
      AIL_mem_free_lock: memFree,
      deleteArray: del,
    };
    if (memFree === -1) {
      errors.push(
        "releaseOpenAudioFile: AIL_mem_free_lock(...) not found in body",
      );
    }
    if (del === -1) {
      errors.push(
        "releaseOpenAudioFile: delete [] fileToRelease->m_file not found in body",
      );
    }
  }

  // =====================================================================
  // 3. Decoded payload -> Miles sample handle (decode/playback boundary)
  // =====================================================================
  const playSampleLine = findMemberDef(
    cpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample\s*\(/,
  );
  assertDefAt("MilesAudioManager::playSample", playSampleLine, 2798, errors, facts);
  if (playSampleLine > 0) {
    const range = functionBodyLineRange(cpp.lines, playSampleLine);
    if (!range) {
      errors.push("playSample: function body not found");
    }
    const order = [
      { key: "loadFileForRead", re: /\bloadFileForRead\s*\(/ },
      { key: "AIL_set_sample_file", re: /AIL_set_sample_file\s*\(/ },
      { key: "AIL_start_sample", re: /\bAIL_start_sample\s*\(/ },
    ];
    facts.playSample_body = checkOrderedCalls(
      cpp.lines,
      range,
      "playSample",
      order,
      errors,
    );
  }

  const playSample3DLine = findMemberDef(
    cpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample3D\s*\(/,
  );
  assertDefAt(
    "MilesAudioManager::playSample3D",
    playSample3DLine,
    2820,
    errors,
    facts,
  );
  if (playSample3DLine > 0) {
    const range = functionBodyLineRange(cpp.lines, playSample3DLine);
    if (!range) {
      errors.push("playSample3D: function body not found");
    }
    const order = [
      { key: "loadFileForRead", re: /\bloadFileForRead\s*\(/ },
      { key: "AIL_set_3D_sample_file", re: /AIL_set_3D_sample_file\s*\(/ },
      { key: "AIL_start_3D_sample", re: /\bAIL_start_3D_sample\s*\(/ },
    ];
    facts.playSample3D_body = checkOrderedCalls(
      cpp.lines,
      range,
      "playSample3D",
      order,
      errors,
    );
  }

  // =====================================================================
  // 4. Stream payload -> Miles (Miles decodes via registered file callbacks)
  // =====================================================================
  const initLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*init\s*\(\s*\)/,
  );
  assertDefAt("MilesAudioManager::init", initLine, 444, errors, facts);
  if (initLine > 0) {
    const range = functionBodyLineRange(cpp.lines, initLine);
    if (!range) {
      errors.push("init: function body not found");
    }
    const setCallbacks = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_set_file_callbacks\s*\(/,
        )
      : -1;
    const registersOpen = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /\bstreamingFileOpen\b/,
        )
      : -1;
    const registersRead = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /\bstreamingFileRead\b/,
        )
      : -1;
    facts.init_body = {
      AIL_set_file_callbacks: setCallbacks,
      streamingFileOpenRef: registersOpen,
      streamingFileReadRef: registersRead,
    };
    if (setCallbacks !== 458) {
      errors.push(
        `init: AIL_set_file_callbacks(...) expected at line 458 but found at ${setCallbacks}`,
      );
    }
    if (registersOpen === -1 || registersRead === -1) {
      errors.push(
        "init: AIL_set_file_callbacks does not reference streamingFileOpen/streamingFileRead",
      );
    }
  }

  // streamingFileOpen opens the file in STREAMING mode (no full RAM read).
  // Use the definition (no leading `static`, no trailing `;`); the forward
  // declaration at the top of the file is `static U32 AILCALLBACK ...;`.
  const streamingFileOpenLine = lineNumber(
    cpp.lines,
    (line) => /^U32 AILCALLBACK streamingFileOpen\s*\(/.test(line),
  );
  assertDefAt(
    "streamingFileOpen",
    streamingFileOpenLine,
    3065,
    errors,
    facts,
  );
  if (streamingFileOpenLine > 0) {
    const range = functionBodyLineRange(cpp.lines, streamingFileOpenLine);
    if (!range) {
      errors.push("streamingFileOpen: function body not found");
    }
    const open = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /TheFileSystem->openFile\s*\(/,
        )
      : -1;
    const streaming = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /File::STREAMING/)
      : -1;
    facts.streamingFileOpen_body = {
      TheFileSystem_openFile: open,
      File_STREAMING: streaming,
    };
    if (open !== 3073) {
      errors.push(
        `streamingFileOpen: TheFileSystem->openFile(...) expected at line 3073 but found at ${open}`,
      );
    }
    if (streaming === -1) {
      errors.push(
        "streamingFileOpen: File::STREAMING flag not found in body",
      );
    }
  }

  // The three remaining streaming callbacks feed raw bytes to Miles.
  const streamingFileCloseLine = lineNumber(
    cpp.lines,
    (line) => /^void AILCALLBACK streamingFileClose\s*\(/.test(line),
  );
  const streamingFileSeekLine = lineNumber(
    cpp.lines,
    (line) => /^S32 AILCALLBACK streamingFileSeek\s*\(/.test(line),
  );
  const streamingFileReadLine = lineNumber(
    cpp.lines,
    (line) => /^U32 AILCALLBACK streamingFileRead\s*\(/.test(line),
  );
  facts.streamingFileCloseDefLine = streamingFileCloseLine;
  facts.streamingFileSeekDefLine = streamingFileSeekLine;
  facts.streamingFileReadDefLine = streamingFileReadLine;
  if (streamingFileCloseLine !== 3078) {
    errors.push(
      `streamingFileClose expected at line 3078 but found at ${streamingFileCloseLine}`,
    );
  }
  if (streamingFileSeekLine !== 3084) {
    errors.push(
      `streamingFileSeek expected at line 3084 but found at ${streamingFileSeekLine}`,
    );
  }
  if (streamingFileReadLine !== 3090) {
    errors.push(
      `streamingFileRead expected at line 3090 but found at ${streamingFileReadLine}`,
    );
  }

  // playAudioEvent opens the Miles stream by filename (Miles reads bytes via
  // the callbacks above and decodes internally).
  const playAudioEventLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*playAudioEvent\s*\(/,
  );
  facts.playAudioEventDefLine = playAudioEventLine;
  if (playAudioEventLine > 0) {
    const range = functionBodyLineRange(cpp.lines, playAudioEventLine);
    if (!range) {
      errors.push("playAudioEvent: function body not found");
    }
    const openStream = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_open_stream\s*\(/,
        )
      : -1;
    facts.playAudioEvent_body = { AIL_open_stream: openStream };
    if (openStream !== 720) {
      errors.push(
        `playAudioEvent: AIL_open_stream(...) expected at line 720 but found at ${openStream}`,
      );
    }
  }

  const playStreamLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*playStream\s*\(/,
  );
  assertDefAt("MilesAudioManager::playStream", playStreamLine, 2783, errors, facts);
  if (playStreamLine > 0) {
    const range = functionBodyLineRange(cpp.lines, playStreamLine);
    if (!range) {
      errors.push("playStream: function body not found");
    }
    const order = [
      {
        key: "AIL_register_stream_callback",
        re: /AIL_register_stream_callback\s*\(/,
      },
      { key: "AIL_start_stream", re: /\bAIL_start_stream\s*\(/ },
    ];
    facts.playStream_body = checkOrderedCalls(
      cpp.lines,
      range,
      "playStream",
      order,
      errors,
    );
  }

  // The separate filename-only Miles load+play path (no cache buffer crosses
  // the boundary). Recorded as a fact, not a hard ordering check.
  const quickLoadLine = lineNumber(
    cpp.lines,
    (line) => /AIL_quick_load_and_play\s*\(/.test(line),
  );
  facts.AIL_quick_load_and_play_line = quickLoadLine;
  if (quickLoadLine !== 3035) {
    errors.push(
      `AIL_quick_load_and_play(...) expected at line 3035 but found at ${quickLoadLine}`,
    );
  }

  // =====================================================================
  // 5. Lifecycle transitions that own decoded-payload lifetime
  // =====================================================================
  const allocatePlayingAudioLine = findMemberDef(
    cpp.lines,
    /PlayingAudio\s*\*\s*MilesAudioManager\s*::\s*allocatePlayingAudio\s*\(/,
  );
  facts.allocatePlayingAudioDefLine = allocatePlayingAudioLine;
  if (allocatePlayingAudioLine > 0) {
    const range = functionBodyLineRange(cpp.lines, allocatePlayingAudioLine);
    if (!range) {
      errors.push("allocatePlayingAudio: function body not found");
    }
    const ps = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /m_status\s*=\s*PS_Playing/)
      : -1;
    facts.allocatePlayingAudio_body = { PS_Playing: ps };
    if (ps !== 1070) {
      errors.push(
        `allocatePlayingAudio: m_status = PS_Playing expected at line 1070 but found at ${ps}`,
      );
    }
  }

  const notifyLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*notifyOfAudioCompletion\s*\(/,
  );
  assertDefAt(
    "MilesAudioManager::notifyOfAudioCompletion",
    notifyLine,
    1531,
    errors,
    facts,
  );
  if (notifyLine > 0) {
    const range = functionBodyLineRange(cpp.lines, notifyLine);
    if (!range) {
      errors.push("notifyOfAudioCompletion: function body not found");
    }
    const ps = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /m_status\s*=\s*PS_Stopped/)
      : -1;
    facts.notifyOfAudioCompletion_body = { PS_Stopped: ps };
    if (ps !== 1589) {
      errors.push(
        `notifyOfAudioCompletion: m_status = PS_Stopped expected at line 1589 but found at ${ps}`,
      );
    }
  }

  const releaseMilesHandlesLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*releaseMilesHandles\s*\(/,
  );
  assertDefAt(
    "MilesAudioManager::releaseMilesHandles",
    releaseMilesHandlesLine,
    1076,
    errors,
    facts,
  );

  // =====================================================================
  // 6. Immediate header / file.h anchors
  // =====================================================================
  const headerDeclarations = [
    {
      key: "loadFileForRead",
      line: 260,
      re: /void\s*\*\s*loadFileForRead\s*\(/,
    },
    { key: "closeFile", line: 261, re: /void\s+closeFile\s*\(\s*void\s*\*\s*fileRead\s*\)/ },
    {
      key: "AudioFileCache_openFile",
      line: 113,
      re: /void\s*\*\s*openFile\s*\(\s*AudioEventRTS/,
    },
    {
      key: "AudioFileCache_closeFile",
      line: 114,
      re: /void\s+closeFile\s*\(\s*void\s*\*fileToClose\s*\)/,
    },
    {
      key: "notifyOfAudioCompletion",
      line: 177,
      re: /virtual\s+void\s+notifyOfAudioCompletion\s*\(/,
    },
    { key: "OpenAudioFile_m_compressed", line: 97, re: /Bool\s+m_compressed/ },
    { key: "PlayingAudioType_enum", line: 31, re: /enum\s+PlayingAudioType/ },
    { key: "PlayingAudio_struct", line: 54, re: /struct\s+PlayingAudio/ },
    { key: "PlayingAudio_m_file", line: 66, re: /void\s*\*m_file/ },
    { key: "PlayingAudio_m_status", line: 64, re: /volatile\s+PlayingStatus\s+m_status/ },
    { key: "PlayingAudio_m_type", line: 63, re: /PlayingAudioType\s+m_type/ },
    { key: "m_audioCache_member", line: 320, re: /AudioFileCache\s*\*\s*m_audioCache/ },
  ];
  const headerFacts = {};
  for (const { key, line, re } of headerDeclarations) {
    const ln = lineNumber(h.lines, (candidate) => re.test(candidate));
    headerFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `MilesAudioManager.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.headerDeclarations = headerFacts;

  const fileHDeclarations = [
    { key: "READ", line: 93, re: /READ\s*=\s*0x0*1/ },
    { key: "STREAMING", line: 104, re: /STREAMING\s*=\s*0x0*100/ },
    {
      key: "readEntireAndClose",
      line: 174,
      re: /virtual\s+char\s*\*\s*readEntireAndClose/,
    },
  ];
  const fileHFacts = {};
  for (const { key, line, re } of fileHDeclarations) {
    const ln = lineNumber(fileH.lines, (candidate) => re.test(candidate));
    fileHFacts[key] = { line: ln };
    if (ln !== line) {
      errors.push(
        `Common/file.h ${key} expected at line ${line} but found at ${ln}`,
      );
    }
  }
  facts.fileHDeclarations = fileHFacts;

  // =====================================================================
  // 7. Shim: declarations for every Miles decode/load call, plus the
  //    implemented IMA ADPCM decode boundary (no longer a stub)
  // =====================================================================
  const shimFunctions = [
    "AIL_WAV_info",
    "AIL_decompress_ADPCM",
    "AIL_mem_free_lock",
    "AIL_set_sample_file",
    "AIL_start_sample",
    "AIL_set_3D_sample_file",
    "AIL_start_3D_sample",
    "AIL_set_file_callbacks",
    "AIL_open_stream",
    "AIL_start_stream",
    "AIL_set_stream_loop_count",
    "AIL_register_stream_callback",
    "AIL_quick_load_and_play",
  ];
  const shimInfo = {};
  for (const fn of shimFunctions) {
    const re = new RegExp(`\\b${fn}\\s*\\(`);
    const ln = lineNumber(shim.lines, (line) => re.test(line));
    shimInfo[fn] = { line: ln };
    if (ln === -1) {
      errors.push(`shim Mss.H: missing declaration ${fn}`);
    }
  }
  const shimAllPresent = Object.values(shimInfo).every(
    (info) => info.line !== -1,
  );
  if (!shimAllPresent) {
    errors.push(
      "shim Mss.H: not all decode/load declarations are present",
    );
  }

  // The ADPCM decode boundary must be implemented, not stubbed. These checks
  // fail if the decoder regresses to the old inert stub state.
  const adpcmDefLine = lineNumber(shim.lines, (line) =>
    /S32\s+AIL_decompress_ADPCM\s*\(\s*const\s+AILSOUNDINFO\s*\*/.test(line));
  const adpcmRange = adpcmDefLine > 0
    ? functionBodyLineRange(shim.lines, adpcmDefLine)
    : null;
  const decoderChecks = {
    AILSOUNDINFO_data_ptr: lineNumber(shim.lines, (line) =>
      /const\s+void\s*\*\s*data_ptr/.test(line)),
    AILSOUNDINFO_block_size: lineNumber(shim.lines, (line) =>
      /U32\s+block_size/.test(line)),
    imaNibbleExpansion: lineNumber(shim.lines, (line) =>
      /MSSImaAdpcmDecodeNibble/.test(line)),
    imaStepTable: lineNumber(shim.lines, (line) =>
      /step_table\s*\[\s*89\s*\]/.test(line)),
    decompressAllocates: adpcmRange
      ? firstMatchInRange(shim.lines, adpcmRange.start, adpcmRange.end, /std::malloc\s*\(/)
      : -1,
    decompressDecodesNibbles: adpcmRange
      ? firstMatchInRange(shim.lines, adpcmRange.start, adpcmRange.end, /MSSImaAdpcmDecodeNibble\s*\(/)
      : -1,
    memFreeLockFrees: lineNumber(shim.lines, (line, index) =>
      /std::free\s*\(\s*ptr\s*\)/.test(line)
        && shim.lines.slice(Math.max(0, index - 3), index).some((prev) =>
          /AIL_mem_free_lock/.test(prev))),
    wavInfoFillsDataChunk: lineNumber(shim.lines, (line) =>
      /info->data_ptr\s*=/.test(line)),
    wavInfoFillsFactSamples: lineNumber(shim.lines, (line) =>
      /fact_samples\s*=\s*MSSReadU32LE/.test(line)),
  };
  const decoderImplemented = adpcmDefLine > 0
    && Object.values(decoderChecks).every((line) => line > 0);
  for (const [key, line] of Object.entries(decoderChecks)) {
    if (line <= 0) {
      errors.push(`shim Mss.H: ADPCM decoder implementation marker missing: ${key}`);
    }
  }
  if (adpcmDefLine <= 0) {
    errors.push(
      "shim Mss.H: AIL_decompress_ADPCM(const AILSOUNDINFO *, ...) implementation not found",
    );
  }
  facts.mssShim = {
    compileOnly: false,
    adpcmDecoderImplemented: decoderImplemented,
    adpcmDecoderDefLine: adpcmDefLine,
    decoderChecks,
    declarations: shimInfo,
    allDeclarationsPresent: shimAllPresent,
    runtimeProof:
      "harness/audio_miles_webaudio_vertical_smoke.mjs decodes real mono+stereo IMA ADPCM payloads through AudioFileCache::openFile and compares sample-exactly against independent references",
  };

  const report = {
    ok: errors.length === 0,
    errors,
    sources: {
      cpp: SOURCES.cpp,
      header: SOURCES.header,
      fileH: SOURCES.fileH,
      shim: SOURCES.shim,
    },
    facts,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
