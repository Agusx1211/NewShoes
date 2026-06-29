#!/usr/bin/env node
// verify_mss_3d_sample_lifecycle_contract.mjs
//
// Source-only verifier for the MSS 3D provider/listener/sample lifecycle
// contract. It reads only repository source files -- no browser, build,
// dist, or asset artifacts -- and pins the facts that any 3D audio lifecycle
// implementation (original Miles or a browser Web Audio backend) must
// preserve:
//
//   1. MilesAudioManager.cpp initSamplePools allocates the 3D pool with
//      AIL_allocate_3D_sample_handle then AIL_set_3D_user_data, in order.
//
//   2. MilesAudioManager.cpp playSample3D calls AIL_set_3D_sample_file,
//      AIL_register_3D_EOS_callback, AIL_set_3D_sample_distances,
//      AIL_set_3D_position, AIL_start_3D_sample, in that order.
//
//   3. releaseMilesHandles and freeAllMilesHandles reach the 3D stop/callback
//      and release paths (AIL_register_3D_EOS_callback/AIL_stop_3D_sample and
//      AIL_release_3D_sample_handle).
//
//   4. setDeviceListenerPosition reaches AIL_set_3D_orientation then
//      AIL_set_3D_position; createListener reaches AIL_open_3D_listener;
//      selectProvider/unselectProvider reach AIL_open_3D_provider/
//      AIL_close_3D_provider; setSpeakerType reaches AIL_set_3D_speaker_type.
//
//   5. WebAssembly/shims/Mss.H declares the stateful 3D surface: provider
//      open/close/speaker/enumerate, listener open/close, and the 3D sample
//      allocate/release/file/user-data/callback/distances/position/
//      orientation/velocity/volume/loop/offset/rate/occlusion/effects/
//      start/stop/resume/end/status functions.
//
//   6. WebAssembly/src/wasm_mss_3d_sample_lifecycle_probe.cpp defines
//      cnc_port_probe_mss_3d_sample_lifecycle, calls representative 3D APIs,
//      and emits the expected not-yet-playback JSON contract
//      (sample3DLifecycleReady / playbackReady:false / nextRequired).
//
//   7. WebAssembly/CMakeLists.txt compiles and exports the probe, and
//      WebAssembly/harness/bridge.js cwraps the export and exposes the
//      mss3DSampleLifecycleProbe RPC.
//
// Emits JSON { ok, errors, sources, facts } and exits nonzero on hard failure.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  milesAudioManagerCpp:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  mssShim: "WebAssembly/shims/Mss.H",
  probe: "WebAssembly/src/wasm_mss_3d_sample_lifecycle_probe.cpp",
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

function findLine(lines, regex) {
  return lineNumber(lines, (line) => regex.test(line));
}

// Pin an ordered call sequence inside a function body. Each entry must appear
// at its expected line and strictly after the previous one.
function pinOrderedCalls(errors, lines, fnDefLine, sequence, factsLabel, errorsPrefix) {
  const bodyRange = fnDefLine > 0 ? functionBodyLineRange(lines, fnDefLine) : null;
  if (fnDefLine > 0 && !bodyRange) {
    errors.push(`${errorsPrefix} function body not found`);
  }
  const facts = {};
  let prevActual = -1;
  let prevName = null;
  for (const { name, line } of sequence) {
    const startFrom = prevActual > 0 ? prevActual : fnDefLine;
    const actual = nextCallLine(lines, name, startFrom, bodyRange);
    facts[name] = { expectedLine: line, line: actual };
    if (actual === -1) {
      errors.push(`${errorsPrefix} missing call/use: ${name}`);
    } else if (actual !== line) {
      errors.push(
        `${errorsPrefix} ${name} expected at line ${line} but found at ${actual}`,
      );
    } else if (prevActual !== -1 && !(prevActual < actual)) {
      errors.push(
        `${errorsPrefix} ${name} (line ${actual}) must come after ${prevName} (line ${prevActual})`,
      );
    }
    prevActual = actual > 0 ? actual : prevActual;
    prevName = name;
  }
  return facts;
}

// Pin a single definition's expected line.
function pinDefLine(errors, lines, signatureRegex, expectedLine, label) {
  const actual = findDefLine(lines, signatureRegex);
  const fact = { expectedLine, line: actual };
  if (actual !== expectedLine) {
    errors.push(
      `${label} definition expected at line ${expectedLine} but found at ${actual}`,
    );
  }
  return { actual, fact };
}

// Pin an Mss.H function or struct definition at its expected line. Structs
// are matched via `struct NAME`; functions are matched by their signature
// token terminated by an opening parenthesis.
function pinMssLine(errors, lines, name, expectedLine) {
  const defRegex = new RegExp(
    `\\bstruct\\s+${name}\\b|\\b(?:static\\s+inline\\s+)?\\w[\\w\\s\\*&]*\\b${name}\\s*\\(`,
  );
  const actual = findDefLine(lines, defRegex);
  const entry = { expectedLine, line: actual, present: actual !== -1 };
  if (actual === -1) {
    errors.push(`Mss.H missing 3D surface function/struct definition: ${name}`);
  } else if (actual !== expectedLine) {
    errors.push(
      `Mss.H ${name} definition expected at line ${expectedLine} but found at ${actual}`,
    );
  }
  return entry;
}

function requirePinnedLine(errors, lines, expectedLine, regex, label) {
  const actual = findLine(lines, regex);
  const fact = { expectedLine, line: actual, present: actual !== -1 };
  if (actual === -1) {
    errors.push(`${label} not found`);
  } else if (actual !== expectedLine) {
    errors.push(`${label} expected at line ${expectedLine} but found at ${actual}`);
  }
  return fact;
}

function main() {
  const errors = [];
  const facts = {};

  const miles = readSourceLines(SOURCES.milesAudioManagerCpp);
  const mss = readSourceLines(SOURCES.mssShim);
  const probe = readSourceLines(SOURCES.probe);
  const cmake = readSourceLines(SOURCES.cmake);
  const bridge = readSourceLines(SOURCES.bridge);

  // ========================================================================
  // FACT 1 - initSamplePools 3D allocation and user-data.
  // ========================================================================
  const initSamplePools = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*initSamplePools\s*\(/,
    2907,
    "MilesAudioManager::initSamplePools",
  );
  facts.initSamplePoolsDef = initSamplePools.fact;
  facts.initSamplePools3DCalls = pinOrderedCalls(
    errors,
    miles.lines,
    initSamplePools.actual,
    [
      { name: "AIL_allocate_3D_sample_handle", line: 2926 },
      { name: "AIL_set_3D_user_data", line: 2929 },
    ],
    "initSamplePools3DCalls",
    "MilesAudioManager::initSamplePools",
  );

  // ========================================================================
  // FACT 2 - playSample3D ordered playback tail.
  // ========================================================================
  const playSample3D = pinDefLine(
    errors,
    miles.lines,
    /void\s*\*\s*MilesAudioManager\s*::\s*playSample3D\s*\(/,
    2820,
    "MilesAudioManager::playSample3D",
  );
  facts.playSample3DDef = playSample3D.fact;
  facts.playSample3DCallSequence = pinOrderedCalls(
    errors,
    miles.lines,
    playSample3D.actual,
    [
      { name: "AIL_set_3D_sample_file", line: 2827 },
      { name: "AIL_register_3D_EOS_callback", line: 2830 },
      { name: "AIL_set_3D_sample_distances", line: 2834 },
      { name: "AIL_set_3D_position", line: 2843 },
      { name: "AIL_start_3D_sample", line: 2847 },
    ],
    "playSample3DCallSequence",
    "MilesAudioManager::playSample3D",
  );

  // ========================================================================
  // FACT 3 - releaseMilesHandles 3D stop/callback path and freeAllMilesHandles
  // 3D release path.
  // ========================================================================
  const releaseMilesHandles = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*releaseMilesHandles\s*\(/,
    1076,
    "MilesAudioManager::releaseMilesHandles",
  );
  facts.releaseMilesHandlesDef = releaseMilesHandles.fact;
  facts.releaseMilesHandles3DCalls = pinOrderedCalls(
    errors,
    miles.lines,
    releaseMilesHandles.actual,
    [
      { name: "AIL_register_3D_EOS_callback", line: 1092 },
      { name: "AIL_stop_3D_sample", line: 1093 },
    ],
    "releaseMilesHandles3DCalls",
    "MilesAudioManager::releaseMilesHandles",
  );

  const freeAllMilesHandles = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*freeAllMilesHandles\s*\(/,
    1190,
    "MilesAudioManager::freeAllMilesHandles",
  );
  facts.freeAllMilesHandlesDef = freeAllMilesHandles.fact;
  facts.freeAllMilesHandles3DCalls = pinOrderedCalls(
    errors,
    miles.lines,
    freeAllMilesHandles.actual,
    [
      { name: "AIL_release_3D_sample_handle", line: 1208 },
    ],
    "freeAllMilesHandles3DCalls",
    "MilesAudioManager::freeAllMilesHandles",
  );

  // ========================================================================
  // FACT 4 - listener position, createListener, provider select/unselect, and
  // speaker-type paths.
  // ========================================================================
  const setDeviceListenerPosition = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*setDeviceListenerPosition\s*\(/,
    2651,
    "MilesAudioManager::setDeviceListenerPosition",
  );
  facts.setDeviceListenerPositionDef = setDeviceListenerPosition.fact;
  facts.setDeviceListenerPositionCalls = pinOrderedCalls(
    errors,
    miles.lines,
    setDeviceListenerPosition.actual,
    [
      { name: "AIL_set_3D_orientation", line: 2654 },
      { name: "AIL_set_3D_position", line: 2659 },
    ],
    "setDeviceListenerPositionCalls",
    "MilesAudioManager::setDeviceListenerPosition",
  );

  const createListener = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*createListener\s*\(/,
    2871,
    "MilesAudioManager::createListener",
  );
  facts.createListenerDef = createListener.fact;
  facts.createListenerCalls = pinOrderedCalls(
    errors,
    miles.lines,
    createListener.actual,
    [{ name: "AIL_open_3D_listener", line: 2877 }],
    "createListenerCalls",
    "MilesAudioManager::createListener",
  );

  const selectProvider = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*selectProvider\s*\(/,
    1661,
    "MilesAudioManager::selectProvider",
  );
  facts.selectProviderDef = selectProvider.fact;
  facts.selectProviderCalls = pinOrderedCalls(
    errors,
    miles.lines,
    selectProvider.actual,
    [{ name: "AIL_open_3D_provider", line: 1729 }],
    "selectProviderCalls",
    "MilesAudioManager::selectProvider",
  );

  const unselectProvider = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*unselectProvider\s*\(/,
    1762,
    "MilesAudioManager::unselectProvider",
  );
  facts.unselectProviderDef = unselectProvider.fact;
  facts.unselectProviderCalls = pinOrderedCalls(
    errors,
    miles.lines,
    unselectProvider.actual,
    [
      { name: "AIL_close_3D_listener", line: 1771 },
      { name: "AIL_close_3D_provider", line: 1774 },
    ],
    "unselectProviderCalls",
    "MilesAudioManager::unselectProvider",
  );

  const setSpeakerType = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*setSpeakerType\s*\(/,
    1787,
    "MilesAudioManager::setSpeakerType",
  );
  facts.setSpeakerTypeDef = setSpeakerType.fact;
  facts.setSpeakerTypeCalls = pinOrderedCalls(
    errors,
    miles.lines,
    setSpeakerType.actual,
    [{ name: "AIL_set_3D_speaker_type", line: 1793 }],
    "setSpeakerTypeCalls",
    "MilesAudioManager::setSpeakerType",
  );

  // ========================================================================
  // FACT 5 - Mss.H stateful 3D surface.
  // ========================================================================
  const mssSurface = [
    // Provider: enumerate/open/close/speaker.
    { name: "AIL_enumerate_3D_providers", line: 998 },
    { name: "AIL_open_3D_provider", line: 1019 },
    { name: "AIL_close_3D_provider", line: 1027 },
    { name: "AIL_set_3D_speaker_type", line: 1033 },
    // Listener: open (and alias) / close.
    { name: "AIL_3D_open_listener", line: 975 },
    { name: "AIL_open_3D_listener", line: 989 },
    { name: "AIL_close_3D_listener", line: 990 },
    // 3D sample allocate/release/file/user-data/callback/distances/position/
    // orientation/velocity/volume/loop/offset/rate/occlusion/effects/
    // start/stop/resume/end/status.
    { name: "AIL_allocate_3D_sample_handle", line: 731 },
    { name: "AIL_release_3D_sample_handle", line: 745 },
    { name: "AIL_set_3D_sample_file", line: 755 },
    { name: "AIL_set_3D_object_user_data", line: 855 },
    { name: "AIL_3D_object_user_data", line: 870 },
    { name: "AIL_set_3D_user_data", line: 882 },
    { name: "AIL_3D_user_data", line: 886 },
    { name: "AIL_register_3D_EOS_callback", line: 963 },
    { name: "AIL_set_3D_sample_distances", line: 948 },
    { name: "AIL_set_3D_position", line: 909 },
    { name: "AIL_set_3D_orientation", line: 921 },
    { name: "AIL_set_3D_velocity_vector", line: 936 },
    { name: "AIL_set_3D_sample_volume", line: 809 },
    { name: "AIL_3D_sample_volume", line: 816 },
    { name: "AIL_set_3D_sample_loop_count", line: 821 },
    { name: "AIL_3D_sample_loop_count", line: 828 },
    { name: "AIL_set_3D_sample_offset", line: 833 },
    { name: "AIL_3D_sample_offset", line: 840 },
    { name: "AIL_3D_sample_length", line: 845 },
    { name: "AIL_set_3D_sample_playback_rate", line: 895 },
    { name: "AIL_3D_sample_playback_rate", line: 890 },
    { name: "AIL_set_3D_sample_occlusion", line: 902 },
    { name: "AIL_set_3D_sample_effects_level", line: 956 },
    { name: "AIL_start_3D_sample", line: 770 },
    { name: "AIL_stop_3D_sample", line: 781 },
    { name: "AIL_resume_3D_sample", line: 789 },
    { name: "AIL_end_3D_sample", line: 798 },
    { name: "AIL_3D_sample_status", line: 850 },
    // Stateful storage structs and find/allocate helpers.
    { name: "MSSBrowser3DVector", line: 242 },
    { name: "MSSBrowser3DSampleState", line: 249 },
    { name: "MSSBrowser3DListenerState", line: 277 },
    { name: "MSSBrowserFind3DSample", line: 394 },
    { name: "MSSBrowserAllocate3DSample", line: 409 },
    { name: "MSSBrowserFind3DListener", line: 427 },
    { name: "MSSBrowserAllocate3DListener", line: 442 },
  ];
  const mssFacts = {};
  for (const { name, line } of mssSurface) {
    mssFacts[name] = pinMssLine(errors, mss.lines, name, line);
  }
  facts.mssShim3DSurface = mssFacts;

  // ========================================================================
  // FACT 6 - runtime probe entry, representative calls, and JSON contract.
  // ========================================================================
  const probeEntryLine = findDefLine(
    probe.lines,
    /\bcnc_port_probe_mss_3d_sample_lifecycle\s*\(/,
  );
  facts.probeEntryFunction = {
    expectedLine: 31,
    line: probeEntryLine,
    present: probeEntryLine !== -1,
  };
  if (probeEntryLine === -1) {
    errors.push("3D sample lifecycle probe entry function not found");
  } else if (probeEntryLine !== 31) {
    errors.push(
      `3D sample lifecycle probe entry expected at line 31 but found at ${probeEntryLine}`,
    );
  }

  const probeCalls = [
    "AIL_enumerate_3D_providers",
    "AIL_open_3D_provider",
    "AIL_set_3D_speaker_type",
    "AIL_open_3D_listener",
    "AIL_set_3D_orientation",
    "AIL_set_3D_position",
    "AIL_set_3D_velocity_vector",
    "AIL_allocate_3D_sample_handle",
    "AIL_set_3D_user_data",
    "AIL_set_3D_object_user_data",
    "AIL_set_3D_sample_file",
    "AIL_register_3D_EOS_callback",
    "AIL_set_3D_sample_distances",
    "AIL_set_3D_sample_volume",
    "AIL_set_3D_sample_loop_count",
    "AIL_set_3D_sample_offset",
    "AIL_set_3D_sample_playback_rate",
    "AIL_set_3D_sample_occlusion",
    "AIL_set_3D_sample_effects_level",
    "AIL_start_3D_sample",
    "AIL_stop_3D_sample",
    "AIL_resume_3D_sample",
    "AIL_end_3D_sample",
    "AIL_release_3D_sample_handle",
    "AIL_close_3D_listener",
    "AIL_close_3D_provider",
  ];
  const probeCallFacts = {};
  let previousLine = probeEntryLine > 0 ? probeEntryLine : 1;
  let previousName = null;
  for (const name of probeCalls) {
    const token = new RegExp(`\\b${name}\\s*\\(`);
    const actual = lineNumber(
      probe.lines,
      (line, index) => index + 1 > previousLine && token.test(line),
    );
    probeCallFacts[name] = { line: actual, present: actual !== -1 };
    if (actual === -1) {
      errors.push(`3D sample lifecycle probe missing ordered call/use: ${name}`);
    } else {
      previousLine = actual;
      previousName = name;
    }
  }
  facts.probeRepresentativeCalls = probeCallFacts;
  facts.probeRepresentativeCallOrderEndsWith = previousName;

  facts.probeJsonStrings = {
    sample3DLifecycleReady: requirePinnedLine(
      errors,
      probe.lines,
      172,
      /sample3DLifecycleReady/,
      "probe sample3DLifecycleReady JSON",
    ),
    playbackReadyFalse: requirePinnedLine(
      errors,
      probe.lines,
      173,
      /playbackReady.*false/,
      "probe playbackReady false JSON",
    ),
    nextRequired: requirePinnedLine(
      errors,
      probe.lines,
      174,
      /nextRequired.*webAudioPlaybackBackend/,
      "probe nextRequired JSON",
    ),
  };

  // ========================================================================
  // FACT 7 - CMake source/export and bridge cwrap/RPC.
  // ========================================================================
  facts.cmake = {
    source: requirePinnedLine(
      errors,
      cmake.lines,
      3694,
      /src\/wasm_mss_3d_sample_lifecycle_probe\.cpp/,
      "CMake 3D sample lifecycle probe source",
    ),
    export: requirePinnedLine(
      errors,
      cmake.lines,
      3818,
      /_cnc_port_probe_mss_3d_sample_lifecycle/,
      "CMake 3D sample lifecycle probe export",
    ),
  };

  facts.bridge = {
    cwrap: requirePinnedLine(
      errors,
      bridge.lines,
      5757,
      /probeMss3DSampleLifecycle:\s*module\.cwrap\("cnc_port_probe_mss_3d_sample_lifecycle",\s*"string",\s*\[\]\)/,
      "bridge 3D sample lifecycle cwrap",
    ),
    rpc: requirePinnedLine(
      errors,
      bridge.lines,
      15634,
      /case "mss3DSampleLifecycleProbe":/,
      "bridge mss3DSampleLifecycleProbe RPC",
    ),
  };

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
