#!/usr/bin/env node
// verify_mss_stream_lifecycle_contract.mjs
//
// Source-only verifier for the MSS HSTREAM lifecycle contract. It reads repo
// source files only, with no browser, build, dist, or asset artifacts.
//
// Verified facts:
//   1. WebAssembly/shims/Mss.H declares the stateful stream handle storage,
//      normalized browser volume payload, and AIL stream lifecycle surface.
//   2. WebAssembly/src/wasm_mss_stream_lifecycle_probe.cpp exposes
//      cnc_port_probe_mss_stream_lifecycle, calls representative stream APIs
//      in source order, and emits the expected not-yet-playback JSON contract.
//   3. WebAssembly/CMakeLists.txt compiles and exports the probe.
//   4. WebAssembly/harness/bridge.js cwraps the export and exposes the
//      mssStreamLifecycleProbe RPC.
//   5. Pending asynchronous stream starts use identity-aware cancellation so
//      stop, reset, shutdown, and handle reuse cannot schedule abandoned audio.
//
// Emits JSON { ok, errors, sources, facts } and exits nonzero on hard failure.
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

function findLine(lines, regex) {
  return lineNumber(lines, (line) => regex.test(line));
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

function requireActualPinnedLine(errors, actual, expectedLine, label) {
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

  const mss = readSourceLines(SOURCES.mssShim);
  const probe = readSourceLines(SOURCES.probe);
  const cmake = readSourceLines(SOURCES.cmake);
  const bridge = readSourceLines(SOURCES.bridge);

  const mssSurface = [
    { name: "MSSBrowserStreamState", line: 258, regex: /\bstruct\s+MSSBrowserStreamState\b/ },
    { name: "MSSBrowserNotifyStreamStart", line: 688, regex: /\bS32\s+MSSBrowserNotifyStreamStart\s*\(/ },
    { name: "MSSBrowserNotifyStreamVolumePan", line: 743, regex: /\bS32\s+MSSBrowserNotifyStreamVolumePan\s*\(/ },
    { name: "MSSBrowserFindStream", line: 788, regex: /\bMSSBrowserStreamState\s*\*\s*MSSBrowserFindStream\s*\(/ },
    { name: "MSSBrowserAllocateStream", line: 803, regex: /\bMSSBrowserStreamState\s*\*\s*MSSBrowserAllocateStream\s*\(/ },
    { name: "AIL_open_stream", line: 1792, regex: /\bHSTREAM\s+AIL_open_stream\s*\(/ },
    { name: "AIL_open_stream_by_sample", line: 1808, regex: /\bHSTREAM\s+AIL_open_stream_by_sample\s*\(/ },
    { name: "AIL_start_stream", line: 1821, regex: /\bvoid\s+AIL_start_stream\s*\(/ },
    { name: "AIL_pause_stream", line: 1832, regex: /\bvoid\s+AIL_pause_stream\s*\(/ },
    { name: "AIL_close_stream", line: 1848, regex: /\bvoid\s+AIL_close_stream\s*\(/ },
    { name: "AIL_stream_status", line: 1859, regex: /\bS32\s+AIL_stream_status\s*\(/ },
    { name: "AIL_set_stream_pan", line: 1864, regex: /\bvoid\s+AIL_set_stream_pan\s*\(/ },
    { name: "AIL_stream_pan", line: 1871, regex: /\bS32\s+AIL_stream_pan\s*\(/ },
    { name: "AIL_set_stream_volume", line: 1876, regex: /\bvoid\s+AIL_set_stream_volume\s*\(/ },
    { name: "AIL_stream_volume", line: 1884, regex: /\bS32\s+AIL_stream_volume\s*\(/ },
    { name: "AIL_set_stream_loop_block", line: 1889, regex: /\bvoid\s+AIL_set_stream_loop_block\s*\(/ },
    { name: "AIL_set_stream_loop_count", line: 1897, regex: /\bvoid\s+AIL_set_stream_loop_count\s*\(/ },
    { name: "AIL_stream_loop_count", line: 1904, regex: /\bS32\s+AIL_stream_loop_count\s*\(/ },
    { name: "AIL_set_stream_ms_position", line: 1909, regex: /\bvoid\s+AIL_set_stream_ms_position\s*\(\s*HSTREAM[^,]*,\s*S32\s+position/ },
    { name: "AIL_stream_ms_position[S32 overload]", line: 1916, regex: /\bvoid\s+AIL_stream_ms_position\s*\(\s*HSTREAM[^,]*,\s*S32\s*\*\s*len/ },
    { name: "AIL_stream_ms_position[long overload]", line: 1926, regex: /\bvoid\s+AIL_stream_ms_position\s*\(\s*HSTREAM[^,]*,\s*long\s*\*\s*len/ },
    { name: "AIL_stream_playback_rate", line: 1938, regex: /\bS32\s+AIL_stream_playback_rate\s*\(/ },
    { name: "AIL_set_stream_playback_rate", line: 1943, regex: /\bvoid\s+AIL_set_stream_playback_rate\s*\(/ },
    { name: "AIL_stream_volume_pan", line: 1950, regex: /\bvoid\s+AIL_stream_volume_pan\s*\(/ },
    { name: "AIL_set_stream_volume_pan", line: 1960, regex: /\bvoid\s+AIL_set_stream_volume_pan\s*\(/ },
    { name: "AIL_register_stream_callback", line: 1970, regex: /\bAIL_stream_callback\s+AIL_register_stream_callback\s*\(/ },
  ];

  const mssFacts = {};
  for (const { name, line, regex } of mssSurface) {
    mssFacts[name] = requirePinnedLine(
      errors,
      mss.lines,
      line,
      regex,
      `Mss.H ${name}`,
    );
  }
  facts.mssShimStreamSurface = mssFacts;
  const streamNotifyStart = mssFacts.MSSBrowserNotifyStreamStart.line;
  const streamNotifyVolumePan = mssFacts.MSSBrowserNotifyStreamVolumePan.line;
  const streamSetVolume = mssFacts.AIL_set_stream_volume.line;
  const streamSetVolumePan = mssFacts.AIL_set_stream_volume_pan.line;
  const streamRegisterCallback = mssFacts.AIL_register_stream_callback.line;
  const streamVolumeFloatPayloadLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamNotifyStart
      && index + 1 < mssFacts.MSSBrowserFindStream.line
      && /volumeFloat:\s*Number\(\$3\)/.test(line),
  );
  const streamVolumeFloatArgumentLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamNotifyStart
      && index + 1 < mssFacts.MSSBrowserFindStream.line
      && /static_cast<double>\(stream\.volume_float\)/.test(line),
  );
  const integerSetterMirrorLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamSetVolume
      && index + 1 < mssFacts.AIL_stream_volume.line
      && /state->volume_float\s*=\s*MSSBrowserNormalizeVolume\(static_cast<F32>\(volume\)\)/.test(line),
  );
  const volumePanSetterNormalizedLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamSetVolumePan
      && index + 1 < streamRegisterCallback
      && /state->volume_float\s*=\s*MSSBrowserNormalizeVolume\(volume\)/.test(line),
  );
  const streamVolumePanNotifyPayloadLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamNotifyVolumePan
      && index + 1 < mssFacts.MSSBrowserFindStream.line
      && /volumeFloat:\s*Number\(\$2\)/.test(line),
  );
  const streamVolumePanNotifyArgumentLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamNotifyVolumePan
      && index + 1 < mssFacts.MSSBrowserFindStream.line
      && /static_cast<double>\(stream\.volume_float\)/.test(line),
  );
  const volumePanSetterIntegerMirrorLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamSetVolumePan
      && index + 1 < streamRegisterCallback
      && /state->volume\s*=\s*MSSBrowserVolumeToMilesInteger\(volume\)/.test(line),
  );
  const volumePanSetterNotifyLine = lineNumber(
    mss.lines,
    (line, index) =>
      index + 1 > streamSetVolumePan
      && index + 1 < streamRegisterCallback
      && /MSSBrowserNotifyStreamVolumePan\(\*state\)/.test(line),
  );
  facts.mssShimStreamVolumeFloat = {
    notifyPayload: {
      expectedLine: 701,
      line: streamVolumeFloatPayloadLine,
      present: streamVolumeFloatPayloadLine !== -1,
    },
    notifyArgument: {
      expectedLine: 713,
      line: streamVolumeFloatArgumentLine,
      present: streamVolumeFloatArgumentLine !== -1,
    },
    integerSetterMirror: {
      expectedLine: 1881,
      line: integerSetterMirrorLine,
      present: integerSetterMirrorLine !== -1,
    },
    volumePanNotifyPayload: {
      expectedLine: 755,
      line: streamVolumePanNotifyPayloadLine,
      present: streamVolumePanNotifyPayloadLine !== -1,
    },
    volumePanNotifyArgument: {
      expectedLine: 765,
      line: streamVolumePanNotifyArgumentLine,
      present: streamVolumePanNotifyArgumentLine !== -1,
    },
    volumePanSetterNormalized: {
      expectedLine: 1964,
      line: volumePanSetterNormalizedLine,
      present: volumePanSetterNormalizedLine !== -1,
    },
    volumePanSetterIntegerMirror: {
      expectedLine: 1965,
      line: volumePanSetterIntegerMirrorLine,
      present: volumePanSetterIntegerMirrorLine !== -1,
    },
    volumePanSetterNotify: {
      expectedLine: 1967,
      line: volumePanSetterNotifyLine,
      present: volumePanSetterNotifyLine !== -1,
    },
  };
  if (streamVolumeFloatPayloadLine !== 701) {
    errors.push(`Mss.H stream start volumeFloat payload expected at line 701 but found at ${streamVolumeFloatPayloadLine}`);
  }
  if (streamVolumeFloatArgumentLine !== 713) {
    errors.push(`Mss.H stream start volumeFloat argument expected at line 713 but found at ${streamVolumeFloatArgumentLine}`);
  }
  if (integerSetterMirrorLine !== 1881) {
    errors.push(`Mss.H AIL_set_stream_volume volume_float mirror expected at line 1881 but found at ${integerSetterMirrorLine}`);
  }
  if (streamVolumePanNotifyPayloadLine !== 755) {
    errors.push(`Mss.H stream volume/pan volumeFloat payload expected at line 755 but found at ${streamVolumePanNotifyPayloadLine}`);
  }
  if (streamVolumePanNotifyArgumentLine !== 765) {
    errors.push(`Mss.H stream volume/pan volumeFloat argument expected at line 765 but found at ${streamVolumePanNotifyArgumentLine}`);
  }
  if (volumePanSetterNormalizedLine !== 1964) {
    errors.push(`Mss.H AIL_set_stream_volume_pan normalized volume_float expected at line 1964 but found at ${volumePanSetterNormalizedLine}`);
  }
  if (volumePanSetterIntegerMirrorLine !== 1965) {
    errors.push(`Mss.H AIL_set_stream_volume_pan integer volume mirror expected at line 1965 but found at ${volumePanSetterIntegerMirrorLine}`);
  }
  if (volumePanSetterNotifyLine !== 1967) {
    errors.push(`Mss.H AIL_set_stream_volume_pan browser notify expected at line 1967 but found at ${volumePanSetterNotifyLine}`);
  }

  const probeEntryLine = findLine(
    probe.lines,
    /\bcnc_port_probe_mss_stream_lifecycle\s*\(/,
  );
  facts.probeEntryFunction = {
    expectedLine: 31,
    line: probeEntryLine,
    present: probeEntryLine !== -1,
  };
  if (probeEntryLine === -1) {
    errors.push("stream lifecycle probe entry function not found");
  } else if (probeEntryLine !== 31) {
    errors.push(
      `stream lifecycle probe entry expected at line 31 but found at ${probeEntryLine}`,
    );
  }

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
      errors.push(`stream lifecycle probe missing ordered call/use: ${name}`);
    } else {
      previousLine = actual;
      previousName = name;
    }
  }
  facts.probeRepresentativeCalls = probeCallFacts;
  facts.probeRepresentativeCallOrderEndsWith = previousName;

  facts.probeJsonStrings = {
    streamLifecycleReady: requirePinnedLine(
      errors,
      probe.lines,
      140,
      /streamLifecycleReady/,
      "probe streamLifecycleReady JSON",
    ),
    playbackReadyFalse: requirePinnedLine(
      errors,
      probe.lines,
      141,
      /playbackReady.*false/,
      "probe playbackReady false JSON",
    ),
    nextRequired: requirePinnedLine(
      errors,
      probe.lines,
      142,
      /nextRequired.*webAudioPlaybackBackend/,
      "probe nextRequired JSON",
    ),
  };

  facts.cmake = {
    source: requirePinnedLine(
      errors,
      cmake.lines,
      4970,
      /src\/wasm_mss_stream_lifecycle_probe\.cpp/,
      "CMake stream lifecycle probe source",
    ),
    export: requirePinnedLine(
      errors,
      cmake.lines,
      5232,
      /_cnc_port_probe_mss_stream_lifecycle/,
      "CMake stream lifecycle probe export",
    ),
  };

  facts.bridge = {
    cwrap: requirePinnedLine(
      errors,
      bridge.lines,
      7031,
      /probeMssStreamLifecycle:\s*module\.cwrap\("cnc_port_probe_mss_stream_lifecycle",\s*"string",\s*\[\]\)/,
      "bridge stream lifecycle cwrap",
    ),
    rpc: requirePinnedLine(
      errors,
      bridge.lines,
      24697,
      /case "mssStreamLifecycleProbe":/,
      "bridge mssStreamLifecycleProbe RPC",
    ),
    streamVolumePanFunction: requirePinnedLine(
      errors,
      bridge.lines,
      5012,
      /\bfunction\s+cncPortMssStreamVolumePan\s*\(/,
      "bridge stream volume/pan callback",
    ),
    streamVolumePanGain: requirePinnedLine(
      errors,
      bridge.lines,
      5022,
      /active\.gain\.gain\.value\s*=\s*volume/,
      "bridge stream volume/pan active gain update",
    ),
    streamVolumePanModuleCallback: requirePinnedLine(
      errors,
      bridge.lines,
      1075,
      /^\s+cncPortMssStreamVolumePan,\s*$/,
      "bridge stream volume/pan module callback",
    ),
  };

  const streamStartFunctionLine = findLine(
    bridge.lines,
    /\basync\s+function\s+_startMssStreamAsync\s*\(/,
  );
  const stopFunctionLine = findLine(
    bridge.lines,
    /\bfunction\s+cncPortMssStreamStop\s*\(/,
  );
  const shutdownFunctionLine = findLine(
    bridge.lines,
    /\basync\s+function\s+shutdownBrowserAudioRuntime\s*\(/,
  );
  const shutdownPendingCancelLine = lineNumber(
    bridge.lines,
    (line, index) =>
      index + 1 > shutdownFunctionLine
      && /^\s+cancelBrowserMssStreamPendingStarts\(\);\s*$/.test(line),
  );
  const stopActiveLookupLine = lineNumber(
    bridge.lines,
    (line, index) =>
      index + 1 > stopFunctionLine
      && /activeSources\.get\(handle\)/.test(line),
  );
  const pendingCurrentGuardLines = bridge.lines.flatMap((line, index) => {
    const actual = index + 1;
    if (
      actual > streamStartFunctionLine
      && actual < stopFunctionLine
      && /!isBrowserMssStreamPendingStartCurrent\(handle,\s*pendingStart\)/.test(line)
    ) {
      return [actual];
    }
    return [];
  });
  const pendingAfterDecodeLookupLine = lineNumber(
    bridge.lines,
    (line, index) =>
      index + 1 > streamStartFunctionLine
      && index + 1 < stopFunctionLine
      && /pendingAfterDecode\s*=\s*browserMssStreamPlaybackRuntime\.pendingStarts\.get\(handle\)/.test(line),
  );
  const pendingAfterDecodeGuardLine = lineNumber(
    bridge.lines,
    (line, index) =>
      index + 1 > pendingAfterDecodeLookupLine
      && index + 1 < stopFunctionLine
      && /pendingAfterDecode\s*!==\s*pendingStart\s*\|\|\s*pendingStart\.cancelled\s*===\s*true/.test(line),
  );
  const pendingAfterDecodeCancelDeleteLine = lineNumber(
    bridge.lines,
    (line, index) =>
      index + 1 > pendingAfterDecodeGuardLine
      && index + 1 < stopFunctionLine
      && /releaseBrowserMssStreamPendingStart\(handle,\s*pendingStart\)/.test(line),
  );
  const pendingAfterDecodeCleanupLine = lineNumber(
    bridge.lines,
    (line, index) =>
      index + 1 > pendingAfterDecodeCancelDeleteLine
      && index + 1 < stopFunctionLine
      && /releaseBrowserMssStreamPendingStart\(handle,\s*pendingStart\)/.test(line),
  );
  const stopPrematureDeleteLine = lineNumber(
    bridge.lines,
    (line, index) =>
      index + 1 > stopFunctionLine
      && index + 1 < stopActiveLookupLine
      && (
        /pendingStarts(?:\?\.)?delete\s*\(\s*handle\s*\)/.test(line)
        || /releaseBrowserMssStreamPendingStart\s*\(\s*handle\s*,/.test(line)
      ),
  );
  facts.bridgePendingStreamRaceGuard = {
    cancelAllFunction: requirePinnedLine(
      errors,
      bridge.lines,
      4959,
      /\bfunction\s+cancelBrowserMssStreamPendingStarts\s*\(/,
      "bridge cancel-all pending stream starts function",
    ),
    cancelAllMarksTokens: requirePinnedLine(
      errors,
      bridge.lines,
      4961,
      /pending\.cancelled\s*=\s*true/,
      "bridge cancel-all marks pending stream tokens cancelled",
    ),
    cancelAllClearsMap: requirePinnedLine(
      errors,
      bridge.lines,
      4963,
      /pendingStarts\.clear\(\)/,
      "bridge cancel-all clears pending stream map",
    ),
    currentTokenFunction: requirePinnedLine(
      errors,
      bridge.lines,
      4966,
      /\bfunction\s+isBrowserMssStreamPendingStartCurrent\s*\(/,
      "bridge pending stream current-token function",
    ),
    currentTokenIdentity: requirePinnedLine(
      errors,
      bridge.lines,
      4967,
      /pendingStarts\.get\(handle\)\s*===\s*pendingStart/,
      "bridge pending stream current-token identity comparison",
    ),
    releaseTokenFunction: requirePinnedLine(
      errors,
      bridge.lines,
      4971,
      /\bfunction\s+releaseBrowserMssStreamPendingStart\s*\(/,
      "bridge pending stream conditional-release function",
    ),
    releaseTokenIdentity: requirePinnedLine(
      errors,
      bridge.lines,
      4972,
      /pendingStarts\.get\(handle\)\s*!==\s*pendingStart/,
      "bridge pending stream conditional-release identity comparison",
    ),
    releaseTokenDelete: requirePinnedLine(
      errors,
      bridge.lines,
      4975,
      /pendingStarts\.delete\(handle\)/,
      "bridge pending stream identity-safe delete",
    ),
    resetCancelsPendingStarts: requirePinnedLine(
      errors,
      bridge.lines,
      4990,
      /^\s+cancelBrowserMssStreamPendingStarts\(\);\s*$/,
      "bridge stream reset cancels pending starts",
    ),
    streamStartFunction: requireActualPinnedLine(
      errors,
      streamStartFunctionLine,
      5076,
      "bridge async stream start function",
    ),
    pendingStartToken: requirePinnedLine(
      errors,
      bridge.lines,
      5100,
      /pendingStart\s*=\s*\{\s*cancelled:\s*false\s*\}/,
      "bridge pending stream identity token",
    ),
    pendingStartSet: requirePinnedLine(
      errors,
      bridge.lines,
      5101,
      /pendingStarts\.set\(handle,\s*pendingStart\)/,
      "bridge pending stream start registration",
    ),
    postWasmCurrentTokenCheck: requireActualPinnedLine(
      errors,
      pendingCurrentGuardLines[0] ?? -1,
      5118,
      "bridge pending stream post-WASM current-token check",
    ),
    postArchiveCurrentTokenCheck: requireActualPinnedLine(
      errors,
      pendingCurrentGuardLines[1] ?? -1,
      5181,
      "bridge pending stream post-archive current-token check",
    ),
    decodeFailureCurrentTokenCheck: requireActualPinnedLine(
      errors,
      pendingCurrentGuardLines[2] ?? -1,
      5199,
      "bridge pending stream decode-failure current-token check",
    ),
    pendingAfterDecodeCheck: requireActualPinnedLine(
      errors,
      pendingAfterDecodeLookupLine,
      5210,
      "bridge pending stream post-decode lookup",
    ),
    pendingAfterDecodeCancel: requireActualPinnedLine(
      errors,
      pendingAfterDecodeGuardLine,
      5211,
      "bridge pending stream post-decode identity/cancel guard",
    ),
    pendingAfterDecodeCancelDelete: {
      expectedLine: 5212,
      line: pendingAfterDecodeCancelDeleteLine,
      present: pendingAfterDecodeCancelDeleteLine !== -1,
    },
    pendingCleanupBeforeSchedule: {
      expectedLine: 5215,
      line: pendingAfterDecodeCleanupLine,
      present: pendingAfterDecodeCleanupLine !== -1,
    },
    activeSourceSchedule: requirePinnedLine(
      errors,
      bridge.lines,
      5273,
      /activeSources\.set\(handle,\s*streamEntry\)/,
      "bridge stream active source schedule",
    ),
    stopFunction: requireActualPinnedLine(
      errors,
      stopFunctionLine,
      5304,
      "bridge stream stop callback",
    ),
    stopMarksPendingCancelled: requirePinnedLine(
      errors,
      bridge.lines,
      5311,
      /pendingStart\.cancelled\s*=\s*true/,
      "bridge stream stop marks pending start cancelled",
    ),
    shutdownCancelsPendingStarts: requireActualPinnedLine(
      errors,
      shutdownPendingCancelLine,
      5346,
      "bridge audio shutdown cancels pending stream starts",
    ),
    stopPrematurePendingDelete: {
      line: stopPrematureDeleteLine,
      present: stopPrematureDeleteLine !== -1,
    },
  };
  if (stopPrematureDeleteLine !== -1) {
    errors.push(
      `bridge stream stop must not delete pendingStarts before async decode observes cancellation (line ${stopPrematureDeleteLine})`,
    );
  }
  if (pendingCurrentGuardLines.length !== 3) {
    errors.push(
      `bridge async stream start expected 3 current-token checks but found ${pendingCurrentGuardLines.length}`,
    );
  }
  if (pendingAfterDecodeCancelDeleteLine !== 5212) {
    errors.push(
      `bridge pending stream cancelled cleanup expected at line 5212 but found at ${pendingAfterDecodeCancelDeleteLine}`,
    );
  }
  if (pendingAfterDecodeCleanupLine !== 5215) {
    errors.push(
      `bridge pending stream cleanup before schedule expected at line 5215 but found at ${pendingAfterDecodeCleanupLine}`,
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
