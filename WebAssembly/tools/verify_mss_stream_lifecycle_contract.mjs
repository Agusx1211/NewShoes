#!/usr/bin/env node
// verify_mss_stream_lifecycle_contract.mjs
//
// Source-only verifier for the MSS HSTREAM (long-form stream) lifecycle
// contract implemented in main. It reads ONLY repository source files -- no
// browser, build, dist, or asset artifacts -- and pins the facts that any
// HSTREAM lifecycle implementation (the current `Mss.H` browser shim, an
// original Miles replacement, or a future browser Web Audio stream backend)
// must preserve on the source surface.
//
// This is a SOURCE CONTRACT VERIFIER ONLY. It does not execute any code, does
// not load a browser, and does NOT prove Web Audio playback. The
// `streamLifecycleReady` runtime probe
// (`WebAssembly/src/wasm_mss_stream_lifecycle_probe.cpp`) is the harness
// counterpart that exercises this contract; this verifier only pins the source
// text that the runtime probe, the `Mss.H` shim, and the CMake/bridge export
// surface must contain at the pinned lines.
//
// Hard facts pinned:
//
//   1. WebAssembly/shims/Mss.H declares the stream lifecycle surface:
//      `MSSBrowserStreamState`, `MSSBrowserFindStream`,
//      `MSSBrowserAllocateStream`, and the stream AIL_* functions (open,
//      open-by-sample, start, pause, close, status, pan, volume, loop block,
//      loop count, ms position with both S32 and long overloads, playback
//      rate, volume-pan float pair, callback registration).
//
//   2. WebAssembly/src/wasm_mss_stream_lifecycle_probe.cpp defines the
//      `cnc_port_probe_mss_stream_lifecycle` entry function, calls the key
//      stream lifecycle API entries in order, and emits the JSON strings
//      `streamLifecycleReady`, `playbackReady:false`, and
//      `nextRequired:"webAudioPlaybackBackend"`.
//
//   3. WebAssembly/CMakeLists.txt compiles the probe source and exports
//      `_cnc_port_probe_mss_stream_lifecycle`.
//
//   4. WebAssembly/harness/bridge.js cwraps `cnc_port_probe_mss_stream_lifecycle`
//      as `probeMssStreamLifecycle` and routes the `mssStreamLifecycleProbe`
//      RPC case to it.
//
// Emits JSON { ok, errors, sources, facts } and exits nonzero only when a hard
// fact is missing or out of order.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  mssShim: "WebAssembly/shims/Mss.H",
  probe: "WebAssembly/src/wasm_mss_stream_lifecycle_probe.cpp",
  cmake: "WebAssembly/CMakeLists.txt",
  bridge: "WebAssembly/harness/bridge.js",
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

// Find the first line matching a regex (used for declarations / string
// fragments / RPC cases / cwrap entries).
function findDefLine(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

function main() {
  const errors = [];
  const facts = {};

  const mss = readSourceLines(SOURCES.mssShim);
  const probe = readSourceLines(SOURCES.probe);
  const cmake = readSourceLines(SOURCES.cmake);
  const bridge = readSourceLines(SOURCES.bridge);

  // ========================================================================
  // FACT 1 - Mss.H declares the stream lifecycle surface.
  // ------------------------------------------------------------------------
  // Each expected declaration/definition lives in Mss.H at the pinned line;
  // a missing or moved declaration is a hard error. The two
  // `AIL_stream_ms_position` overloads are distinguished by parameter type
  // (S32* vs long*).
  // ========================================================================
  // Each entry: { name, line, regex }.
  const mssSurface = [
    { name: "MSSBrowserStreamState", line: 202, regex: /\bstruct\s+MSSBrowserStreamState\b/ },
    { name: "MSSBrowserFindStream", line: 292, regex: /\bMSSBrowserStreamState\s*\*\s*MSSBrowserFindStream\s*\(/ },
    { name: "MSSBrowserAllocateStream", line: 307, regex: /\bMSSBrowserStreamState\s*\*\s*MSSBrowserAllocateStream\s*\(/ },
    { name: "AIL_open_stream", line: 683, regex: /\bHSTREAM\s+AIL_open_stream\s*\(/ },
    { name: "AIL_open_stream_by_sample", line: 699, regex: /\bHSTREAM\s+AIL_open_stream_by_sample\s*\(/ },
    { name: "AIL_start_stream", line: 712, regex: /\bvoid\s+AIL_start_stream\s*\(/ },
    { name: "AIL_pause_stream", line: 722, regex: /\bvoid\s+AIL_pause_stream\s*\(/ },
    { name: "AIL_close_stream", line: 738, regex: /\bvoid\s+AIL_close_stream\s*\(/ },
    { name: "AIL_stream_status", line: 748, regex: /\bS32\s+AIL_stream_status\s*\(/ },
    { name: "AIL_set_stream_pan", line: 753, regex: /\bvoid\s+AIL_set_stream_pan\s*\(/ },
    { name: "AIL_stream_pan", line: 760, regex: /\bS32\s+AIL_stream_pan\s*\(/ },
    { name: "AIL_set_stream_volume", line: 765, regex: /\bvoid\s+AIL_set_stream_volume\s*\(/ },
    { name: "AIL_stream_volume", line: 772, regex: /\bS32\s+AIL_stream_volume\s*\(/ },
    { name: "AIL_set_stream_loop_block", line: 777, regex: /\bvoid\s+AIL_set_stream_loop_block\s*\(/ },
    { name: "AIL_set_stream_loop_count", line: 785, regex: /\bvoid\s+AIL_set_stream_loop_count\s*\(/ },
    { name: "AIL_stream_loop_count", line: 792, regex: /\bS32\s+AIL_stream_loop_count\s*\(/ },
    { name: "AIL_set_stream_ms_position", line: 797, regex: /\bvoid\s+AIL_set_stream_ms_position\s*\(\s*HSTREAM[^*]*,\s*S32\s+position/ },
    { name: "AIL_stream_ms_position[S32 overload]", line: 804, regex: /\bvoid\s+AIL_stream_ms_position\s*\(\s*HSTREAM[^*]*,\s*S32\s*\*\s*len/ },
    { name: "AIL_stream_ms_position[long overload]", line: 814, regex: /\bvoid\s+AIL_stream_ms_position\s*\(\s*HSTREAM[^*]*,\s*long\s*\*\s*len/ },
    { name: "AIL_stream_playback_rate", line: 826, regex: /\bS32\s+AIL_stream_playback_rate\s*\(/ },
    { name: "AIL_set_stream_playback_rate", line: 831, regex: /\bvoid\s+AIL_set_stream_playback_rate\s*\(/ },
    { name: "AIL_stream_volume_pan", line: 838, regex: /\bvoid\s+AIL_stream_volume_pan\s*\(/ },
    { name: "AIL_set_stream_volume_pan", line: 848, regex: /\bvoid\s+AIL_set_stream_volume_pan\s*\(/ },
    { name: "AIL_register_stream_callback", line: 856, regex: /\bAIL_stream_callback\s+AIL_register_stream_callback\s*\(/ },
  ];
  const mssFacts = {};
  for (const { name, line, regex } of mssSurface) {
    const actual = findDefLine(mss.lines, regex);
    const entry = { expectedLine: line, line: actual, present: actual !== -1 };
    if (actual === -1) {
      errors.push(`Mss.H missing stream lifecycle declaration: ${name}`);
    } else if (actual !== line) {
      errors.push(
        `Mss.H ${name} declaration expected at line ${line} but found at ${actual}`,
      );
    }
    mssFacts[name] = entry;
  }
  facts.mssShimStreamSurface = mssFacts;

  // ========================================================================
  // FACT 2 - runtime probe entry function, representative calls, and JSON
  // strings.
  // ------------------------------------------------------------------------
  // cnc_port_probe_mss_stream_lifecycle is defined at line 31 of the probe
  // source; its body calls the key stream lifecycle API entries in order, and
  // emits the JSON strings streamLifecycleReady, playbackReady:false, and
  // nextRequired:"webAudioPlaybackBackend".
  // ========================================================================
  const fnLine = findDefLine(
    probe.lines,
    /\bcnc_port_probe_mss_stream_lifecycle\s*\(/,
  );
  facts.probeEntryFunction = { expectedLine: 31, line: fnLine };
  if (fnLine === -1) {
    errors.push(
      "wasm_mss_stream_lifecycle_probe missing cnc_port_probe_mss_stream_lifecycle definition",
    );
  } else if (fnLine !== 31) {
    errors.push(
      `wasm_mss_stream_lifecycle_probe cnc_port_probe_mss_stream_lifecycle expected at line 31 but found at ${fnLine}`,
    );
  }

  // Representative stream lifecycle calls in source order. We only require
  // presence and forward ordering relative to the previous pinned call, not
  // exact line numbers, so that incidental whitespace edits do not turn this
  // verifier into churn.
  const probeCalls = [
    "AIL_open_stream",
    "AIL_register_stream_callback",
    "AIL_set_stream_volume",
    "AIL_set_stream_pan",
    "AIL_set_stream_volume_pan",
    "AIL_set_stream_playback_rate",
    "AIL_set_stream_loop_block",
    "AIL_set_stream_loop_count",
    "AIL_set_stream_ms_position",
    "AIL_stream_volume_pan",
    "AIL_stream_ms_position",
    "AIL_stream_volume",
    "AIL_stream_pan",
    "AIL_stream_playback_rate",
    "AIL_stream_loop_count",
    "AIL_start_stream",
    "AIL_stream_status",
    "AIL_pause_stream",
    "AIL_open_stream_by_sample",
    "AIL_close_stream",
  ];
  const probeCallFacts = {};
  let prevActual = fnLine > 0 ? fnLine : 1;
  let prevName = null;
  for (const name of probeCalls) {
    const token = new RegExp(`\\b${name}\\s*\\(`);
    let actual = -1;
    for (let i = prevActual - 1; i < probe.lines.length; i++) {
      if (token.test(probe.lines[i])) {
        actual = i + 1;
        break;
      }
    }
    probeCallFacts[name] = { line: actual, present: actual !== -1 };
    if (actual === -1) {
      errors.push(
        `wasm_mss_stream_lifecycle_probe missing call/use: ${name}`,
      );
    } else if (prevName !== null && !(prevActual < actual)) {
      errors.push(
        `wasm_mss_stream_lifecycle_probe ${name} (line ${actual}) must come after ${prevName} (line ${prevActual})`,
      );
    } else {
      prevActual = actual;
    }
    prevName = name;
  }
  facts.probeRepresentativeCalls = probeCallFacts;

  // JSON strings the probe must emit.
  // The probe emits JSON via snprintf with escaped quotes (e.g.
  // `"\"playbackReady\":false,"`), so match each fragment by a regex that
  // tolerates the leading backslash-escaped quote.
  const probeStrings = [
    { key: "streamLifecycleReady", line: 140, regex: /streamLifecycleReady/ },
    { key: "playbackReady:false", line: 141, regex: /playbackReady\\":false/ },
    {
      key: 'nextRequired:"webAudioPlaybackBackend"',
      line: 142,
      regex: /nextRequired\\":\\"webAudioPlaybackBackend/,
    },
  ];
  const probeStringFacts = {};
  for (const { key, line, regex } of probeStrings) {
    const ln = lineNumber(probe.lines, (l) => regex.test(l));
    const entry = { expectedLine: line, line: ln, present: ln !== -1 };
    if (ln === -1) {
      errors.push(
        `wasm_mss_stream_lifecycle_probe missing JSON string fragment: ${key}`,
      );
    } else if (ln !== line) {
      errors.push(
        `wasm_mss_stream_lifecycle_probe JSON string ${key} expected at line ${line} but found at ${ln}`,
      );
    }
    probeStringFacts[key] = entry;
  }
  facts.probeJsonStrings = probeStringFacts;

  // ========================================================================
  // FACT 3 - CMakeLists compiles the probe source and exports the probe.
  // ========================================================================
  const cmakeSourceIdx = cmake.lines.findIndex((l) =>
    /src\/wasm_mss_stream_lifecycle_probe\.cpp/.test(l),
  );
  const cmakeSourceLine = cmakeSourceIdx + 1;
  facts.cmakeProbeSource = {
    expectedLine: 3693,
    line: cmakeSourceLine,
    present: cmakeSourceLine >= 1,
  };
  if (cmakeSourceLine < 1) {
    errors.push("CMakeLists.txt missing src/wasm_mss_stream_lifecycle_probe.cpp compile entry");
  } else if (cmakeSourceLine !== 3693) {
    errors.push(
      `CMakeLists.txt probe source expected at line 3693 but found at ${cmakeSourceLine}`,
    );
  }

  const cmakeExportIdx = cmake.lines.findIndex((l) =>
    /_cnc_port_probe_mss_stream_lifecycle\b/.test(l),
  );
  const cmakeExportLine = cmakeExportIdx + 1;
  facts.cmakeProbeExport = {
    expectedLine: 3817,
    line: cmakeExportLine,
    present: cmakeExportLine >= 1,
  };
  if (cmakeExportLine < 1) {
    errors.push(
      "CMakeLists.txt EXPORTED_FUNCTIONS missing _cnc_port_probe_mss_stream_lifecycle",
    );
  } else if (cmakeExportLine !== 3817) {
    errors.push(
      `CMakeLists.txt probe export expected at line 3817 but found at ${cmakeExportLine}`,
    );
  }

  // ========================================================================
  // FACT 4 - harness bridge cwrap + RPC case for the probe.
  // ========================================================================
  const bridgeCwrapIdx = bridge.lines.findIndex((l) =>
    /probeMssStreamLifecycle:\s*module\.cwrap\(\s*"cnc_port_probe_mss_stream_lifecycle"/.test(l),
  );
  const bridgeCwrapLine = bridgeCwrapIdx + 1;
  facts.bridgeCwrap = {
    expectedLine: 5734,
    line: bridgeCwrapLine,
    present: bridgeCwrapLine >= 1,
  };
  if (bridgeCwrapLine < 1) {
    errors.push(
      "harness/bridge.js missing probeMssStreamLifecycle cwrap for cnc_port_probe_mss_stream_lifecycle",
    );
  } else if (bridgeCwrapLine !== 5734) {
    errors.push(
      `harness/bridge.js probe cwrap expected at line 5734 but found at ${bridgeCwrapLine}`,
    );
  }

  const bridgeRpcIdx = bridge.lines.findIndex((l) =>
    /case\s+"mssStreamLifecycleProbe"/.test(l),
  );
  const bridgeRpcLine = bridgeRpcIdx + 1;
  facts.bridgeRpcCase = {
    expectedLine: 15593,
    line: bridgeRpcLine,
    present: bridgeRpcLine >= 1,
  };
  if (bridgeRpcLine < 1) {
    errors.push(
      'harness/bridge.js missing RPC case "mssStreamLifecycleProbe"',
    );
  } else if (bridgeRpcLine !== 15593) {
    errors.push(
      `harness/bridge.js RPC case expected at line 15593 but found at ${bridgeRpcLine}`,
    );
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
