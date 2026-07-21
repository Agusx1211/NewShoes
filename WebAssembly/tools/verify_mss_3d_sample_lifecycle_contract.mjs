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
    3006,
    "MilesAudioManager::initSamplePools",
  );
  facts.initSamplePoolsDef = initSamplePools.fact;
  facts.initSamplePools3DCalls = pinOrderedCalls(
    errors,
    miles.lines,
    initSamplePools.actual,
    [
      { name: "AIL_allocate_3D_sample_handle", line: 3025 },
      { name: "AIL_set_3D_user_data", line: 3028 },
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
    2914,
    "MilesAudioManager::playSample3D",
  );
  facts.playSample3DDef = playSample3D.fact;
  facts.playSample3DCallSequence = pinOrderedCalls(
    errors,
    miles.lines,
    playSample3D.actual,
    [
      { name: "AIL_set_3D_sample_file", line: 2922 },
      { name: "AIL_register_3D_EOS_callback", line: 2925 },
      { name: "AIL_set_3D_sample_distances", line: 2929 },
      { name: "AIL_set_3D_position", line: 2938 },
      { name: "AIL_start_3D_sample", line: 2942 },
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
    1109,
    "MilesAudioManager::releaseMilesHandles",
  );
  facts.releaseMilesHandlesDef = releaseMilesHandles.fact;
  facts.releaseMilesHandles3DCalls = pinOrderedCalls(
    errors,
    miles.lines,
    releaseMilesHandles.actual,
    [
      { name: "AIL_register_3D_EOS_callback", line: 1125 },
      { name: "AIL_stop_3D_sample", line: 1126 },
    ],
    "releaseMilesHandles3DCalls",
    "MilesAudioManager::releaseMilesHandles",
  );

  const freeAllMilesHandles = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*freeAllMilesHandles\s*\(/,
    1227,
    "MilesAudioManager::freeAllMilesHandles",
  );
  facts.freeAllMilesHandlesDef = freeAllMilesHandles.fact;
  facts.freeAllMilesHandles3DCalls = pinOrderedCalls(
    errors,
    miles.lines,
    freeAllMilesHandles.actual,
    [
      { name: "AIL_release_3D_sample_handle", line: 1245 },
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
    2713,
    "MilesAudioManager::setDeviceListenerPosition",
  );
  facts.setDeviceListenerPositionDef = setDeviceListenerPosition.fact;
  facts.setDeviceListenerPositionCalls = pinOrderedCalls(
    errors,
    miles.lines,
    setDeviceListenerPosition.actual,
    [
      { name: "AIL_set_3D_orientation", line: 2716 },
      { name: "AIL_set_3D_position", line: 2721 },
    ],
    "setDeviceListenerPositionCalls",
    "MilesAudioManager::setDeviceListenerPosition",
  );

  const createListener = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*createListener\s*\(/,
    2970,
    "MilesAudioManager::createListener",
  );
  facts.createListenerDef = createListener.fact;
  facts.createListenerCalls = pinOrderedCalls(
    errors,
    miles.lines,
    createListener.actual,
    [{ name: "AIL_open_3D_listener", line: 2976 }],
    "createListenerCalls",
    "MilesAudioManager::createListener",
  );

  const selectProvider = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*selectProvider\s*\(/,
    1699,
    "MilesAudioManager::selectProvider",
  );
  facts.selectProviderDef = selectProvider.fact;
  facts.selectProviderCalls = pinOrderedCalls(
    errors,
    miles.lines,
    selectProvider.actual,
    [{ name: "AIL_open_3D_provider", line: 1784 }],
    "selectProviderCalls",
    "MilesAudioManager::selectProvider",
  );

  const unselectProvider = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*unselectProvider\s*\(/,
    1821,
    "MilesAudioManager::unselectProvider",
  );
  facts.unselectProviderDef = unselectProvider.fact;
  facts.unselectProviderCalls = pinOrderedCalls(
    errors,
    miles.lines,
    unselectProvider.actual,
    [
      { name: "AIL_close_3D_listener", line: 1830 },
      { name: "AIL_close_3D_provider", line: 1833 },
    ],
    "unselectProviderCalls",
    "MilesAudioManager::unselectProvider",
  );

  const setSpeakerType = pinDefLine(
    errors,
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*setSpeakerType\s*\(/,
    1846,
    "MilesAudioManager::setSpeakerType",
  );
  facts.setSpeakerTypeDef = setSpeakerType.fact;
  facts.setSpeakerTypeCalls = pinOrderedCalls(
    errors,
    miles.lines,
    setSpeakerType.actual,
    [{ name: "AIL_set_3D_speaker_type", line: 1852 }],
    "setSpeakerTypeCalls",
    "MilesAudioManager::setSpeakerType",
  );

  // ========================================================================
  // FACT 5 - Mss.H stateful 3D surface.
  // ========================================================================
  const mssSurface = [
    { name: "MSSBrowserNormalizeVolume", line: 209 },
    { name: "MSSBrowserVolumeToMilesInteger", line: 223 },
    // Provider: enumerate/open/close/speaker.
    { name: "AIL_enumerate_3D_providers", line: 1730 },
    { name: "AIL_open_3D_provider", line: 1751 },
    { name: "AIL_close_3D_provider", line: 1759 },
    { name: "AIL_set_3D_speaker_type", line: 1765 },
    // Listener: open (and alias) / close.
    { name: "AIL_3D_open_listener", line: 1707 },
    { name: "AIL_open_3D_listener", line: 1721 },
    { name: "AIL_close_3D_listener", line: 1722 },
    // 3D sample allocate/release/file/user-data/callback/distances/position/
    // orientation/velocity/volume/loop/offset/rate/occlusion/effects/
    // start/stop/resume/end/status.
    { name: "AIL_allocate_3D_sample_handle", line: 1452 },
    { name: "AIL_release_3D_sample_handle", line: 1466 },
    { name: "AIL_set_3D_sample_file", line: 1477 },
    { name: "AIL_set_3D_object_user_data", line: 1581 },
    { name: "AIL_3D_object_user_data", line: 1596 },
    { name: "AIL_set_3D_user_data", line: 1608 },
    { name: "AIL_3D_user_data", line: 1612 },
    { name: "AIL_register_3D_EOS_callback", line: 1695 },
    { name: "AIL_set_3D_sample_distances", line: 1680 },
    { name: "AIL_set_3D_position", line: 1635 },
    { name: "AIL_set_3D_orientation", line: 1651 },
    { name: "AIL_set_3D_velocity_vector", line: 1667 },
    { name: "AIL_set_3D_sample_volume", line: 1534 },
    { name: "AIL_3D_sample_volume", line: 1542 },
    { name: "AIL_set_3D_sample_loop_count", line: 1547 },
    { name: "AIL_3D_sample_loop_count", line: 1554 },
    { name: "AIL_set_3D_sample_offset", line: 1559 },
    { name: "AIL_3D_sample_offset", line: 1566 },
    { name: "AIL_3D_sample_length", line: 1571 },
    { name: "AIL_set_3D_sample_playback_rate", line: 1621 },
    { name: "AIL_3D_sample_playback_rate", line: 1616 },
    { name: "AIL_set_3D_sample_occlusion", line: 1628 },
    { name: "AIL_set_3D_sample_effects_level", line: 1688 },
    { name: "AIL_start_3D_sample", line: 1492 },
    { name: "AIL_stop_3D_sample", line: 1504 },
    { name: "AIL_resume_3D_sample", line: 1513 },
    { name: "AIL_end_3D_sample", line: 1522 },
    { name: "AIL_3D_sample_status", line: 1576 },
    // Stateful storage structs and find/allocate helpers.
    { name: "MSSBrowser3DVector", line: 288 },
    { name: "MSSBrowser3DSampleState", line: 295 },
    { name: "MSSBrowser3DListenerState", line: 328 },
    { name: "MSSBrowserFind3DSample", line: 825 },
    { name: "MSSBrowserAllocate3DSample", line: 840 },
    { name: "MSSBrowserFind3DListener", line: 858 },
    { name: "MSSBrowserAllocate3DListener", line: 873 },
  ];
  const mssFacts = {};
  for (const { name, line } of mssSurface) {
    mssFacts[name] = pinMssLine(errors, mss.lines, name, line);
  }
  facts.mssShim3DSurface = mssFacts;
  {
    const volumeFloatLine = lineNumber(
      mss.lines,
      (line, index) =>
        index + 1 > mssFacts.MSSBrowser3DSampleState.line
        && index + 1 < mssFacts.MSSBrowser3DListenerState.line
        && /\bF32\s+volume_float\s*=\s*1\.0f\s*;/.test(line),
    );
    facts.mssShim3DVolumeFloat = {
      expectedLine: 314,
      line: volumeFloatLine,
      present: volumeFloatLine !== -1,
    };
    if (volumeFloatLine !== 314) {
      errors.push(
        `Mss.H MSSBrowser3DSampleState volume_float expected at line 314 but found at ${volumeFloatLine}`,
      );
    }
  }

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
  facts.probe3DVolumeFloat = {
    legacyIntegerCall: requirePinnedLine(
      errors,
      probe.lines,
      68,
      /AIL_set_3D_sample_volume\s*\(\s*sample\s*,\s*66\s*\)/,
      "probe legacy integer 3D sample volume call",
    ),
    normalizedFloatCall: requirePinnedLine(
      errors,
      probe.lines,
      70,
      /AIL_set_3D_sample_volume\s*\(\s*sample\s*,\s*0\.42f\s*\)/,
      "probe normalized float 3D sample volume call",
    ),
    normalizedIntegerCheck: requirePinnedLine(
      errors,
      probe.lines,
      155,
      /normalized_volume\s*==\s*53/,
      "probe normalized 3D sample volume integer readback",
    ),
    floatStateCheck: requirePinnedLine(
      errors,
      probe.lines,
      112,
      /sample_before_release->volume_float\s*>\s*0\.419f/,
      "probe normalized 3D sample volume float state lower bound",
    ),
  };

  facts.probeJsonStrings = {
    sample3DLifecycleReady: requirePinnedLine(
      errors,
      probe.lines,
      178,
      /sample3DLifecycleReady/,
      "probe sample3DLifecycleReady JSON",
    ),
    playbackReadyFalse: requirePinnedLine(
      errors,
      probe.lines,
      179,
      /playbackReady.*false/,
      "probe playbackReady false JSON",
    ),
    nextRequired: requirePinnedLine(
      errors,
      probe.lines,
      180,
      /nextRequired.*webAudioPlaybackBackend/,
      "probe nextRequired JSON",
    ),
    volumeFloat: requirePinnedLine(
      errors,
      probe.lines,
      192,
      /AIL_set_3D_sample_volume_float/,
      "probe normalized 3D sample volume JSON",
    ),
  };

  // ========================================================================
  // FACT 7 - CMake source/export and bridge cwrap/RPC.
  // ========================================================================
  facts.cmake = {
    source: requirePinnedLine(
      errors,
      cmake.lines,
      4971,
      /src\/wasm_mss_3d_sample_lifecycle_probe\.cpp/,
      "CMake 3D sample lifecycle probe source",
    ),
    export: requirePinnedLine(
      errors,
      cmake.lines,
      5232,
      /_cnc_port_probe_mss_3d_sample_lifecycle/,
      "CMake 3D sample lifecycle probe export",
    ),
  };

  facts.bridge = {
    cwrap: requirePinnedLine(
      errors,
      bridge.lines,
      7032,
      /probeMss3DSampleLifecycle:\s*module\.cwrap\("cnc_port_probe_mss_3d_sample_lifecycle",\s*"string",\s*\[\]\)/,
      "bridge 3D sample lifecycle cwrap",
    ),
    rpc: requirePinnedLine(
      errors,
      bridge.lines,
      24802,
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
