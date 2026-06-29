#!/usr/bin/env node
// verify_mss_sample_lifecycle_contract.mjs
//
// Source-only verifier for the MSS 2D sample lifecycle contract. It reads only
// repository source files -- no browser, build, or asset artifacts -- and pins
// the facts that any 2D sample lifecycle implementation (original Miles or a
// browser Web Audio backend) must preserve:
//
//   1. MilesAudioManager.cpp defines initSamplePools and that its body calls
//      AIL_allocate_sample_handle, AIL_init_sample, AIL_set_sample_user_data
//      for the 2D pool, then AIL_allocate_3D_sample_handle and
//      AIL_set_3D_user_data for the 3D pool, in that order.
//
//   2. MilesAudioManager.cpp defines playSample and that its body calls
//      AIL_init_sample, AIL_register_EOS_callback, initFilters,
//      AIL_set_sample_file, AIL_start_sample, in that order.
//
//   3. releaseMilesHandles and freeAllMilesHandles are defined and reach the
//      release paths: AIL_release_sample_handle (2D) and
//      AIL_release_3D_sample_handle (3D).
//
//   4. WebAssembly/shims/Mss.H declares the 2D sample lifecycle surface:
//      allocate/release/init/user-data/set-file/EOS/start/stop/resume/status/
//      volume-pan/playback-rate/loop-count.
//
//   5. WebAssembly/src/wasm_mss_sample_lifecycle_probe.cpp defines
//      cnc_port_probe_mss_sample_lifecycle and calls the key 2D lifecycle
//      API entries. It is the runtime counterpart to this source-only
//      contract verifier.
//
// Emits JSON { ok, errors, sources, facts } and exits nonzero only when a hard
// fact is missing or out of order.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  milesAudioManagerCpp:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  mssShim: "WebAssembly/shims/Mss.H",
  probe: "WebAssembly/src/wasm_mss_sample_lifecycle_probe.cpp",
};

function readSourceLines(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  const text = readFileSync(abs, "utf8");
  return { abs, text, lines: text.split(/\r?\n/) };
}

function readOptionalSourceLines(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  if (!existsSync(abs)) return null;
  const text = readFileSync(abs, "utf8");
  return { abs, text, lines: text.split(/\r?\n/) };
}

function lineNumber(lines, predicate) {
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i + 1;
  }
  return -1;
}

// Locate a C++ member function definition line by a regex tested against the
// signature token (matches the definition, not a forward declaration).
function findDefLine(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Returns { start, end } (1-based, inclusive) of the brace-balanced function
// body following the given definition line, or null.
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

// First occurrence of an identifier-bound call after `fromLine` (1-based),
// optionally constrained to a body range. Requires call syntax `name(` so a
// name in a comment does not match, and matches whole tokens.
function nextCallLine(lines, name, fromLine, bodyRange = null) {
  const token = new RegExp(`\\b${name}\\s*\\(`);
  for (let i = fromLine - 1; i < lines.length; i++) {
    const ln = i + 1;
    if (bodyRange && (ln < bodyRange.start || ln > bodyRange.end)) continue;
    if (token.test(lines[i])) return ln;
  }
  return -1;
}

function main() {
  const errors = [];
  const facts = {};

  const miles = readSourceLines(SOURCES.milesAudioManagerCpp);
  const mss = readSourceLines(SOURCES.mssShim);
  const probe = readOptionalSourceLines(SOURCES.probe);

  // ========================================================================
  // FACT 1 - initSamplePools definition and ordered 2D then 3D allocation.
  // ------------------------------------------------------------------------
  // initSamplePools is defined at 2907; its body allocates the 2D pool with
  // AIL_allocate_sample_handle / AIL_init_sample / AIL_set_sample_user_data,
  // then the 3D pool with AIL_allocate_3D_sample_handle /
  // AIL_set_3D_user_data, in that order.
  // ========================================================================
  const initSamplePoolsDefLine = findDefLine(
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*initSamplePools\s*\(/,
  );
  facts.initSamplePoolsDef = {
    expectedLine: 2907,
    line: initSamplePoolsDefLine,
  };
  if (initSamplePoolsDefLine !== 2907) {
    errors.push(
      `MilesAudioManager::initSamplePools definition expected at line 2907 but found at ${initSamplePoolsDefLine}`,
    );
  }
  const initSamplePoolsRange = initSamplePoolsDefLine > 0
    ? functionBodyLineRange(miles.lines, initSamplePoolsDefLine)
    : null;
  if (initSamplePoolsDefLine > 0 && !initSamplePoolsRange) {
    errors.push("MilesAudioManager::initSamplePools function body not found");
  }

  const initSamplePoolsSequence = [
    { name: "AIL_allocate_sample_handle", line: 2915 },
    { name: "AIL_init_sample", line: 2918 },
    { name: "AIL_set_sample_user_data", line: 2919 },
    { name: "AIL_allocate_3D_sample_handle", line: 2926 },
    { name: "AIL_set_3D_user_data", line: 2929 },
  ];
  const initSamplePoolsFacts = {};
  let prevActual = -1;
  let prevName = null;
  for (const { name, line } of initSamplePoolsSequence) {
    const startFrom = prevActual > 0 ? prevActual : initSamplePoolsDefLine;
    const actual = nextCallLine(miles.lines, name, startFrom, initSamplePoolsRange);
    initSamplePoolsFacts[name] = { expectedLine: line, line: actual };
    if (actual === -1) {
      errors.push(`MilesAudioManager::initSamplePools missing call/use: ${name}`);
    } else if (actual !== line) {
      errors.push(
        `MilesAudioManager::initSamplePools ${name} expected at line ${line} but found at ${actual}`,
      );
    } else if (prevActual !== -1 && !(prevActual < actual)) {
      errors.push(
        `MilesAudioManager::initSamplePools ${name} (line ${actual}) must come after ${prevName} (line ${prevActual})`,
      );
    }
    prevActual = actual > 0 ? actual : prevActual;
    prevName = name;
  }
  facts.initSamplePoolsCallSequence = initSamplePoolsFacts;

  // ========================================================================
  // FACT 2 - playSample definition and ordered 2D playback tail.
  // ------------------------------------------------------------------------
  // playSample is defined at 2798; its body calls AIL_init_sample,
  // AIL_register_EOS_callback, initFilters, AIL_set_sample_file,
  // AIL_start_sample, in that order.
  // ========================================================================
  const playSampleDefLine = findDefLine(
    miles.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample\s*\(/,
  );
  facts.playSampleDef = { expectedLine: 2798, line: playSampleDefLine };
  if (playSampleDefLine !== 2798) {
    errors.push(
      `MilesAudioManager::playSample definition expected at line 2798 but found at ${playSampleDefLine}`,
    );
  }
  const playSampleRange = playSampleDefLine > 0
    ? functionBodyLineRange(miles.lines, playSampleDefLine)
    : null;
  if (playSampleDefLine > 0 && !playSampleRange) {
    errors.push("MilesAudioManager::playSample function body not found");
  }

  const playSampleSequence = [
    { name: "AIL_init_sample", line: 2800 },
    { name: "AIL_register_EOS_callback", line: 2803 },
    { name: "initFilters", line: 2804 },
    { name: "AIL_set_sample_file", line: 2810 },
    { name: "AIL_start_sample", line: 2813 },
  ];
  const playSampleFacts = {};
  prevActual = -1;
  prevName = null;
  for (const { name, line } of playSampleSequence) {
    const startFrom = prevActual > 0 ? prevActual : playSampleDefLine;
    const actual = nextCallLine(miles.lines, name, startFrom, playSampleRange);
    playSampleFacts[name] = { expectedLine: line, line: actual };
    if (actual === -1) {
      errors.push(`MilesAudioManager::playSample missing call/use: ${name}`);
    } else if (actual !== line) {
      errors.push(
        `MilesAudioManager::playSample ${name} expected at line ${line} but found at ${actual}`,
      );
    } else if (prevActual !== -1 && !(prevActual < actual)) {
      errors.push(
        `MilesAudioManager::playSample ${name} (line ${actual}) must come after ${prevName} (line ${prevActual})`,
      );
    }
    prevActual = actual > 0 ? actual : prevActual;
    prevName = name;
  }
  facts.playSampleCallSequence = playSampleFacts;

  // ========================================================================
  // FACT 3 - release paths reach AIL_release_sample_handle and
  // AIL_release_3D_sample_handle.
  // ------------------------------------------------------------------------
  // releaseMilesHandles is defined at 1076; freeAllMilesHandles is defined at
  // 1190 and its body calls AIL_release_sample_handle (2D) and
  // AIL_release_3D_sample_handle (3D).
  // ========================================================================
  const releaseMilesHandlesDefLine = findDefLine(
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*releaseMilesHandles\s*\(/,
  );
  facts.releaseMilesHandlesDef = {
    expectedLine: 1076,
    line: releaseMilesHandlesDefLine,
  };
  if (releaseMilesHandlesDefLine !== 1076) {
    errors.push(
      `MilesAudioManager::releaseMilesHandles definition expected at line 1076 but found at ${releaseMilesHandlesDefLine}`,
    );
  }

  const freeAllMilesHandlesDefLine = findDefLine(
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*freeAllMilesHandles\s*\(/,
  );
  facts.freeAllMilesHandlesDef = {
    expectedLine: 1190,
    line: freeAllMilesHandlesDefLine,
  };
  if (freeAllMilesHandlesDefLine !== 1190) {
    errors.push(
      `MilesAudioManager::freeAllMilesHandles definition expected at line 1190 but found at ${freeAllMilesHandlesDefLine}`,
    );
  }
  const freeAllRange = freeAllMilesHandlesDefLine > 0
    ? functionBodyLineRange(miles.lines, freeAllMilesHandlesDefLine)
    : null;
  if (freeAllMilesHandlesDefLine > 0 && !freeAllRange) {
    errors.push("MilesAudioManager::freeAllMilesHandles function body not found");
  }

  const releaseSequence = [
    { name: "AIL_release_sample_handle", line: 1200 },
    { name: "AIL_release_3D_sample_handle", line: 1208 },
  ];
  const releaseFacts = {};
  for (const { name, line } of releaseSequence) {
    const actual = nextCallLine(miles.lines, name, freeAllMilesHandlesDefLine, freeAllRange);
    releaseFacts[name] = { expectedLine: line, line: actual };
    if (actual === -1) {
      errors.push(`MilesAudioManager::freeAllMilesHandles missing call/use: ${name}`);
    } else if (actual !== line) {
      errors.push(
        `MilesAudioManager::freeAllMilesHandles ${name} expected at line ${line} but found at ${actual}`,
      );
    }
  }
  facts.freeAllMilesHandlesReleaseCalls = releaseFacts;

  // ========================================================================
  // FACT 4 - Mss.H declares the 2D sample lifecycle surface.
  // ------------------------------------------------------------------------
  // Each expected function is defined (static inline) in Mss.H; missing or
  // misplaced definitions are hard errors.
  // ========================================================================
  const mssLifecycle = [
    { name: "AIL_allocate_sample_handle", line: 397 },
    { name: "AIL_release_sample_handle", line: 408 },
    { name: "AIL_init_sample", line: 418 },
    { name: "AIL_set_sample_user_data", line: 543 },
    { name: "AIL_sample_user_data", line: 550 },
    { name: "AIL_set_sample_file", line: 433 },
    { name: "AIL_register_EOS_callback", line: 587 },
    { name: "AIL_start_sample", line: 448 },
    { name: "AIL_stop_sample", line: 458 },
    { name: "AIL_resume_sample", line: 466 },
    { name: "AIL_sample_status", line: 528 },
    { name: "AIL_set_sample_volume_pan", line: 565 },
    { name: "AIL_set_sample_playback_rate", line: 578 },
    { name: "AIL_set_sample_loop_count", line: 509 },
  ];
  const mssFacts = {};
  for (const { name, line } of mssLifecycle) {
    const defRegex = new RegExp(
      `\\b(?:static\\s+inline\\s+)?\\w[\\w\\s\\*&]*\\b${name}\\s*\\(`,
    );
    const actual = findDefLine(mss.lines, defRegex);
    const entry = { expectedLine: line, line: actual, present: actual !== -1 };
    if (actual === -1) {
      errors.push(`Mss.H missing 2D lifecycle function definition: ${name}`);
    } else if (actual !== line) {
      errors.push(
        `Mss.H ${name} definition expected at line ${line} but found at ${actual}`,
      );
    }
    mssFacts[name] = entry;
  }
  facts.mssShimLifecycleFunctions = mssFacts;

  // ========================================================================
  // FACT 5 - runtime probe (hard).
  // ------------------------------------------------------------------------
  // WebAssembly/src/wasm_mss_sample_lifecycle_probe.cpp must define
  // cnc_port_probe_mss_sample_lifecycle and call the key 2D lifecycle API
  // entries. The probe source is the runtime counterpart to this source-only
  // contract verifier.
  // ========================================================================
  if (!probe) {
    errors.push(
      `runtime probe source not found: ${SOURCES.probe}`,
    );
    facts.probe = {
      present: false,
      sourceFile: SOURCES.probe,
    };
  } else {
    const probeFacts = { present: true, sourceFile: SOURCES.probe };

    const fnLine = findDefLine(
      probe.lines,
      /\bcnc_port_probe_mss_sample_lifecycle\s*\(/,
    );
    probeFacts.entryFunction = { expectedLine: 31, line: fnLine };
    if (fnLine === -1) {
      errors.push(
        "wasm_mss_sample_lifecycle_probe missing cnc_port_probe_mss_sample_lifecycle definition",
      );
    } else if (fnLine !== 31) {
      errors.push(
        `wasm_mss_sample_lifecycle_probe cnc_port_probe_mss_sample_lifecycle expected at line 31 but found at ${fnLine}`,
      );
    }

    const probeRange = fnLine > 0
      ? functionBodyLineRange(probe.lines, fnLine)
      : null;
    const probeCalls = [
      { name: "AIL_allocate_sample_handle", line: 43 },
      { name: "AIL_init_sample", line: 46 },
      { name: "AIL_set_sample_user_data", line: 47 },
      { name: "AIL_set_sample_file", line: 50 },
      { name: "AIL_register_EOS_callback", line: 51 },
      { name: "AIL_start_sample", line: 73 },
      { name: "AIL_stop_sample", line: 76 },
      { name: "AIL_release_sample_handle", line: 96 },
    ];
    const probeCallFacts = {};
    prevActual = -1;
    prevName = null;
    for (const { name, line } of probeCalls) {
      const startFrom = prevActual > 0 ? prevActual : (fnLine > 0 ? fnLine : 1);
      const actual = nextCallLine(probe.lines, name, startFrom, probeRange);
      probeCallFacts[name] = { expectedLine: line, line: actual };
      if (actual === -1) {
        errors.push(
          `wasm_mss_sample_lifecycle_probe missing call/use: ${name}`,
        );
      } else if (actual !== line) {
        errors.push(
          `wasm_mss_sample_lifecycle_probe ${name} expected at line ${line} but found at ${actual}`,
        );
      } else if (prevActual !== -1 && !(prevActual < actual)) {
        errors.push(
          `wasm_mss_sample_lifecycle_probe ${name} (line ${actual}) must come after ${prevName} (line ${prevActual})`,
        );
      }
      prevActual = actual > 0 ? actual : prevActual;
      prevName = name;
    }
    probeFacts.calls = probeCallFacts;
    facts.probe = probeFacts;
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
