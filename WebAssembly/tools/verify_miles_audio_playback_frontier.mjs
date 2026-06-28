#!/usr/bin/env node
// verify_miles_audio_playback_frontier.mjs
//
// Source-checks the original Miles audio *playback-handle* frontier: the
// MilesAudioManager.cpp functions that own, allocate, release, start, and
// observe 2D/3D sample and stream handles - the surface that must be replaced
// with Web Audio handles. It reads (never executes) the original device source,
// header, and the wasm compile-only Mss.H shim, and emits a JSON report.
//
// This is the playback-handle companion to
// verify_miles_audio_device_frontier.mjs (which pins the device *startup*
// frontier). It verifies source facts that matter for replacing inert Miles
// handles with Web Audio handles.
//
// Verified facts (all source-only, bounded function-body scans):
//   - releaseMilesHandles defined at line 1076; body registers NULL EOS/stream
//     callbacks, stops samples, closes streams, and resets m_type = PAT_INVALID.
//   - freeAllMilesHandles (the handle-release path) calls AIL_release_sample_handle
//     and AIL_release_3D_sample_handle.
//   - getFirst2DSample defined at line 1216 and draws from the m_availableSamples pool.
//   - getFirst3DSample defined at line 1230 and draws from the m_available3DSamples pool.
//   - initSamplePools (the allocation path) calls AIL_allocate_sample_handle and
//     AIL_allocate_3D_sample_handle.
//   - playStream defined at line 2783; body calls AIL_set_stream_loop_count,
//     AIL_register_stream_callback, then AIL_start_stream.
//   - playSample defined at line 2798; body calls AIL_init_sample,
//     AIL_register_EOS_callback, then AIL_start_sample.
//   - playSample3D defined at line 2820; body calls AIL_register_3D_EOS_callback
//     and AIL_start_3D_sample.
//   - notifyOfAudioCompletion defined at line 1531 and calls findPlayingAudioFrom.
//   - findPlayingAudioFrom defined at line 1593.
//   - getHandleForBink defined at line 2963; body calls AIL_get_DirectSound_info.
//   - releaseHandleForBink defined at line 2986; body resets m_binkHandle = NULL.
//   - MilesAudioManager.h declares the playback/Bink/helper methods at the
//     current line anchors.
//   - WebAssembly/shims/Mss.H has inert compile-only declarations for every Miles
//     call above (compileOnly: true).
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
  h: "GeneralsMD/Code/GameEngineDevice/Include/MilesAudioDevice/MilesAudioManager.h",
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

// Locate a top-level MilesAudioManager member function definition by matching
// its signature. Returns the 1-based line of the definition, or -1.
function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Given a definition line, scan the brace-balanced function body that follows.
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

function main() {
  const errors = [];
  const facts = {};

  const cpp = readSourceLines(SOURCES.cpp);
  const h = readSourceLines(SOURCES.h);
  const shim = readSourceLines(SOURCES.shim);

  // ---- Function anchor + body-call checks -----------------------------

  // releaseMilesHandles @ 1076.
  const releaseMilesHandlesLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*releaseMilesHandles\s*\(/,
  );
  facts.releaseMilesHandlesDefLine = releaseMilesHandlesLine;
  if (releaseMilesHandlesLine !== 1076) {
    errors.push(
      `MilesAudioManager::releaseMilesHandles expected at line 1076 but found at ${releaseMilesHandlesLine}`,
    );
  }
  if (releaseMilesHandlesLine > 0) {
    const range = functionBodyLineRange(cpp.lines, releaseMilesHandlesLine);
    if (!range) {
      errors.push("releaseMilesHandles: function body not found");
    }
    const checks = [
      { key: "AIL_register_EOS_callback", re: /AIL_register_EOS_callback\s*\(/ },
      {
        key: "AIL_register_3D_EOS_callback",
        re: /AIL_register_3D_EOS_callback\s*\(/,
      },
      {
        key: "AIL_register_stream_callback",
        re: /AIL_register_stream_callback\s*\(/,
      },
      { key: "AIL_stop_sample", re: /\bAIL_stop_sample\s*\(/ },
      { key: "AIL_stop_3D_sample", re: /\bAIL_stop_3D_sample\s*\(/ },
      { key: "AIL_close_stream", re: /\bAIL_close_stream\s*\(/ },
      { key: "reset_m_type_PAT_INVALID", re: /m_type\s*=\s*PAT_INVALID/ },
    ];
    const positions = {};
    for (const { key, re } of checks) {
      const ln = range
        ? firstMatchInRange(cpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`releaseMilesHandles: expected ${key} not found in body`);
      }
    }
    facts.releaseMilesHandlesBody = positions;
  }

  // freeAllMilesHandles: the AIL_release_sample_handle / AIL_release_3D_sample_handle
  // release path. (The handle-release frontier referenced by releaseMilesHandles.)
  const freeAllMilesHandlesLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*freeAllMilesHandles\s*\(/,
  );
  facts.freeAllMilesHandlesDefLine = freeAllMilesHandlesLine;
  if (freeAllMilesHandlesLine <= 0) {
    errors.push("MilesAudioManager::freeAllMilesHandles definition not found");
  }
  if (freeAllMilesHandlesLine > 0) {
    const range = functionBodyLineRange(cpp.lines, freeAllMilesHandlesLine);
    if (!range) {
      errors.push("freeAllMilesHandles: function body not found");
    }
    const releaseSample = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_release_sample_handle\s*\(/,
        )
      : -1;
    const release3DSample = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_release_3D_sample_handle\s*\(/,
        )
      : -1;
    facts.freeAllMilesHandlesBody = {
      AIL_release_sample_handle: releaseSample,
      AIL_release_3D_sample_handle: release3DSample,
    };
    if (releaseSample === -1) {
      errors.push(
        "freeAllMilesHandles: AIL_release_sample_handle not found in body",
      );
    }
    if (release3DSample === -1) {
      errors.push(
        "freeAllMilesHandles: AIL_release_3D_sample_handle not found in body",
      );
    }
  }

  // getFirst2DSample @ 1216 - pulls from the 2D sample pool.
  const getFirst2DSampleLine = findMemberDef(
    cpp.lines,
    /HSAMPLE\s+MilesAudioManager\s*::\s*getFirst2DSample\s*\(/,
  );
  facts.getFirst2DSampleDefLine = getFirst2DSampleLine;
  if (getFirst2DSampleLine !== 1216) {
    errors.push(
      `MilesAudioManager::getFirst2DSample expected at line 1216 but found at ${getFirst2DSampleLine}`,
    );
  }
  if (getFirst2DSampleLine > 0) {
    const range = functionBodyLineRange(cpp.lines, getFirst2DSampleLine);
    if (!range) {
      errors.push("getFirst2DSample: function body not found");
    }
    const pool = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /\bm_availableSamples\b/,
        )
      : -1;
    facts.getFirst2DSampleBody = { poolRef: pool };
    if (pool === -1) {
      errors.push(
        "getFirst2DSample: m_availableSamples pool reference not found in body",
      );
    }
  }

  // getFirst3DSample @ 1230 - pulls from the 3D sample pool.
  const getFirst3DSampleLine = findMemberDef(
    cpp.lines,
    /H3DSAMPLE\s+MilesAudioManager\s*::\s*getFirst3DSample\s*\(/,
  );
  facts.getFirst3DSampleDefLine = getFirst3DSampleLine;
  if (getFirst3DSampleLine !== 1230) {
    errors.push(
      `MilesAudioManager::getFirst3DSample expected at line 1230 but found at ${getFirst3DSampleLine}`,
    );
  }
  if (getFirst3DSampleLine > 0) {
    const range = functionBodyLineRange(cpp.lines, getFirst3DSampleLine);
    if (!range) {
      errors.push("getFirst3DSample: function body not found");
    }
    const pool = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /\bm_available3DSamples\b/,
        )
      : -1;
    facts.getFirst3DSampleBody = { poolRef: pool };
    if (pool === -1) {
      errors.push(
        "getFirst3DSample: m_available3DSamples pool reference not found in body",
      );
    }
  }

  // initSamplePools: the AIL_allocate_sample_handle / AIL_allocate_3D_sample_handle
  // allocation path. (The handle-allocation frontier behind the pools above.)
  const initSamplePoolsLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*initSamplePools\s*\(/,
  );
  facts.initSamplePoolsDefLine = initSamplePoolsLine;
  if (initSamplePoolsLine <= 0) {
    errors.push("MilesAudioManager::initSamplePools definition not found");
  }
  if (initSamplePoolsLine > 0) {
    const range = functionBodyLineRange(cpp.lines, initSamplePoolsLine);
    if (!range) {
      errors.push("initSamplePools: function body not found");
    }
    const alloc2D = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_allocate_sample_handle\s*\(/,
        )
      : -1;
    const alloc3D = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_allocate_3D_sample_handle\s*\(/,
        )
      : -1;
    facts.initSamplePoolsBody = {
      AIL_allocate_sample_handle: alloc2D,
      AIL_allocate_3D_sample_handle: alloc3D,
    };
    if (alloc2D === -1) {
      errors.push(
        "initSamplePools: AIL_allocate_sample_handle not found in body",
      );
    }
    if (alloc3D === -1) {
      errors.push(
        "initSamplePools: AIL_allocate_3D_sample_handle not found in body",
      );
    }
  }

  // playStream @ 2783 - AIL_set_stream_loop_count, AIL_register_stream_callback,
  // then AIL_start_stream.
  const playStreamLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*playStream\s*\(/,
  );
  facts.playStreamDefLine = playStreamLine;
  if (playStreamLine !== 2783) {
    errors.push(
      `MilesAudioManager::playStream expected at line 2783 but found at ${playStreamLine}`,
    );
  }
  if (playStreamLine > 0) {
    const range = functionBodyLineRange(cpp.lines, playStreamLine);
    if (!range) {
      errors.push("playStream: function body not found");
    }
    const order = [
      { key: "AIL_set_stream_loop_count", re: /AIL_set_stream_loop_count\s*\(/ },
      {
        key: "AIL_register_stream_callback",
        re: /AIL_register_stream_callback\s*\(/,
      },
      { key: "AIL_start_stream", re: /\bAIL_start_stream\s*\(/ },
    ];
    const positions = {};
    let prevLine = -1;
    let prevKey = null;
    for (const { key, re } of order) {
      const ln = range
        ? firstMatchInRange(cpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`playStream: expected call ${key} not found in body`);
      } else if (prevLine !== -1 && !(prevLine < ln)) {
        errors.push(
          `playStream: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
        );
      }
      prevLine = ln;
      prevKey = key;
    }
    facts.playStreamBody = positions;
  }

  // playSample @ 2798 - AIL_init_sample, AIL_register_EOS_callback, AIL_start_sample.
  const playSampleLine = findMemberDef(
    cpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample\s*\(/,
  );
  facts.playSampleDefLine = playSampleLine;
  if (playSampleLine !== 2798) {
    errors.push(
      `MilesAudioManager::playSample expected at line 2798 but found at ${playSampleLine}`,
    );
  }
  if (playSampleLine > 0) {
    const range = functionBodyLineRange(cpp.lines, playSampleLine);
    if (!range) {
      errors.push("playSample: function body not found");
    }
    const order = [
      { key: "AIL_init_sample", re: /\bAIL_init_sample\s*\(/ },
      { key: "AIL_register_EOS_callback", re: /AIL_register_EOS_callback\s*\(/ },
      { key: "AIL_start_sample", re: /\bAIL_start_sample\s*\(/ },
    ];
    const positions = {};
    let prevLine = -1;
    let prevKey = null;
    for (const { key, re } of order) {
      const ln = range
        ? firstMatchInRange(cpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`playSample: expected call ${key} not found in body`);
      } else if (prevLine !== -1 && !(prevLine < ln)) {
        errors.push(
          `playSample: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
        );
      }
      prevLine = ln;
      prevKey = key;
    }
    facts.playSampleBody = positions;
  }

  // playSample3D @ 2820 - AIL_register_3D_EOS_callback then AIL_start_3D_sample.
  const playSample3DLine = findMemberDef(
    cpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample3D\s*\(/,
  );
  facts.playSample3DDefLine = playSample3DLine;
  if (playSample3DLine !== 2820) {
    errors.push(
      `MilesAudioManager::playSample3D expected at line 2820 but found at ${playSample3DLine}`,
    );
  }
  if (playSample3DLine > 0) {
    const range = functionBodyLineRange(cpp.lines, playSample3DLine);
    if (!range) {
      errors.push("playSample3D: function body not found");
    }
    const order = [
      {
        key: "AIL_register_3D_EOS_callback",
        re: /AIL_register_3D_EOS_callback\s*\(/,
      },
      { key: "AIL_start_3D_sample", re: /\bAIL_start_3D_sample\s*\(/ },
    ];
    const positions = {};
    let prevLine = -1;
    let prevKey = null;
    for (const { key, re } of order) {
      const ln = range
        ? firstMatchInRange(cpp.lines, range.start, range.end, re)
        : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`playSample3D: expected call ${key} not found in body`);
      } else if (prevLine !== -1 && !(prevLine < ln)) {
        errors.push(
          `playSample3D: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
        );
      }
      prevLine = ln;
      prevKey = key;
    }
    facts.playSample3DBody = positions;
  }

  // notifyOfAudioCompletion @ 1531 - calls findPlayingAudioFrom.
  const notifyLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*notifyOfAudioCompletion\s*\(/,
  );
  facts.notifyOfAudioCompletionDefLine = notifyLine;
  if (notifyLine !== 1531) {
    errors.push(
      `MilesAudioManager::notifyOfAudioCompletion expected at line 1531 but found at ${notifyLine}`,
    );
  }
  if (notifyLine > 0) {
    const range = functionBodyLineRange(cpp.lines, notifyLine);
    if (!range) {
      errors.push("notifyOfAudioCompletion: function body not found");
    }
    const findCall = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /\bfindPlayingAudioFrom\s*\(/,
        )
      : -1;
    facts.notifyOfAudioCompletionBody = { findPlayingAudioFromCall: findCall };
    if (findCall === -1) {
      errors.push(
        "notifyOfAudioCompletion: findPlayingAudioFrom(...) call not found in body",
      );
    }
  }

  // findPlayingAudioFrom @ 1593.
  const findPlayingLine = findMemberDef(
    cpp.lines,
    /PlayingAudio\s*\*\s*MilesAudioManager\s*::\s*findPlayingAudioFrom\s*\(/,
  );
  facts.findPlayingAudioFromDefLine = findPlayingLine;
  if (findPlayingLine !== 1593) {
    errors.push(
      `MilesAudioManager::findPlayingAudioFrom expected at line 1593 but found at ${findPlayingLine}`,
    );
  }

  // getHandleForBink @ 2963 - calls AIL_get_DirectSound_info.
  const getHandleForBinkLine = findMemberDef(
    cpp.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*getHandleForBink\s*\(/,
  );
  facts.getHandleForBinkDefLine = getHandleForBinkLine;
  if (getHandleForBinkLine !== 2963) {
    errors.push(
      `MilesAudioManager::getHandleForBink expected at line 2963 but found at ${getHandleForBinkLine}`,
    );
  }
  if (getHandleForBinkLine > 0) {
    const range = functionBodyLineRange(cpp.lines, getHandleForBinkLine);
    if (!range) {
      errors.push("getHandleForBink: function body not found");
    }
    const dsInfo = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /AIL_get_DirectSound_info\s*\(/,
        )
      : -1;
    facts.getHandleForBinkBody = { AIL_get_DirectSound_info: dsInfo };
    if (dsInfo === -1) {
      errors.push(
        "getHandleForBink: AIL_get_DirectSound_info(...) call not found in body",
      );
    }
  }

  // releaseHandleForBink @ 2986 - resets m_binkHandle = NULL.
  const releaseHandleForBinkLine = findMemberDef(
    cpp.lines,
    /void\s+MilesAudioManager\s*::\s*releaseHandleForBink\s*\(/,
  );
  facts.releaseHandleForBinkDefLine = releaseHandleForBinkLine;
  if (releaseHandleForBinkLine !== 2986) {
    errors.push(
      `MilesAudioManager::releaseHandleForBink expected at line 2986 but found at ${releaseHandleForBinkLine}`,
    );
  }
  if (releaseHandleForBinkLine > 0) {
    const range = functionBodyLineRange(cpp.lines, releaseHandleForBinkLine);
    if (!range) {
      errors.push("releaseHandleForBink: function body not found");
    }
    const reset = range
      ? firstMatchInRange(
          cpp.lines,
          range.start,
          range.end,
          /m_binkHandle\s*=\s*NULL/,
        )
      : -1;
    facts.releaseHandleForBinkBody = { binkHandleNullReset: reset };
    if (reset === -1) {
      errors.push(
        "releaseHandleForBink: m_binkHandle = NULL reset not found in body",
      );
    }
  }

  // Header declarations for the playback/Bink/helper frontier.
  const headerDeclarations = [
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
    {
      key: "getHandleForBink",
      line: 189,
      re: /virtual\s+void\s*\*\s*getHandleForBink\s*\(/,
    },
    {
      key: "releaseHandleForBink",
      line: 190,
      re: /virtual\s+void\s+releaseHandleForBink\s*\(/,
    },
    {
      key: "playStream",
      line: 243,
      re: /void\s+playStream\s*\(/,
    },
    {
      key: "playSample",
      line: 245,
      re: /void\s*\*\s*playSample\s*\(/,
    },
    {
      key: "playSample3D",
      line: 246,
      re: /void\s*\*\s*playSample3D\s*\(/,
    },
    {
      key: "initSamplePools",
      line: 253,
      re: /void\s+initSamplePools\s*\(/,
    },
    {
      key: "releaseMilesHandles",
      line: 264,
      re: /void\s+releaseMilesHandles\s*\(/,
    },
    {
      key: "freeAllMilesHandles",
      line: 268,
      re: /void\s+freeAllMilesHandles\s*\(/,
    },
    {
      key: "getFirst2DSample",
      line: 270,
      re: /HSAMPLE\s+getFirst2DSample\s*\(/,
    },
    {
      key: "getFirst3DSample",
      line: 271,
      re: /H3DSAMPLE\s+getFirst3DSample\s*\(/,
    },
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

  // ---- Shim facts: inert compile-only declarations ---------------------
  // Every Miles call referenced by the playback-handle frontier above must
  // have an inert compile-only declaration in Mss.H.
  const shimFunctions = [
    "AIL_release_sample_handle",
    "AIL_release_3D_sample_handle",
    "AIL_close_stream",
    "AIL_allocate_sample_handle",
    "AIL_allocate_3D_sample_handle",
    "AIL_set_stream_loop_count",
    "AIL_register_stream_callback",
    "AIL_start_stream",
    "AIL_init_sample",
    "AIL_register_EOS_callback",
    "AIL_start_sample",
    "AIL_register_3D_EOS_callback",
    "AIL_start_3D_sample",
    "AIL_stop_sample",
    "AIL_stop_3D_sample",
    "AIL_get_DirectSound_info",
  ];
  const shimInfo = {};
  for (const fn of shimFunctions) {
    const re = new RegExp(`\\b${fn}\\s*\\(`);
    const ln = lineNumber(shim.lines, (line) => re.test(line));
    shimInfo[fn] = { line: ln };
    if (ln === -1) {
      errors.push(`shim Mss.H: missing inert declaration ${fn}`);
    }
  }
  const shimAllPresent = Object.values(shimInfo).every(
    (info) => info.line !== -1,
  );
  facts.mssShim = {
    compileOnly: true,
    declarations: shimInfo,
    allInertDeclarationsPresent: shimAllPresent,
  };
  if (!shimAllPresent) {
    errors.push(
      "shim Mss.H: not all inert compile-only playback declarations are present",
    );
  }

  const report = {
    ok: errors.length === 0,
    errors,
    sources: {
      cpp: SOURCES.cpp,
      header: SOURCES.h,
      shim: SOURCES.shim,
    },
    facts,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
