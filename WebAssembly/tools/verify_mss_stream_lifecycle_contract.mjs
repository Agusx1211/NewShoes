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

function main() {
  const errors = [];
  const facts = {};

  const mss = readSourceLines(SOURCES.mssShim);
  const probe = readSourceLines(SOURCES.probe);
  const cmake = readSourceLines(SOURCES.cmake);
  const bridge = readSourceLines(SOURCES.bridge);

  const mssSurface = [
    { name: "MSSBrowserStreamState", line: 258, regex: /\bstruct\s+MSSBrowserStreamState\b/ },
    { name: "MSSBrowserNotifyStreamStart", line: 610, regex: /\bS32\s+MSSBrowserNotifyStreamStart\s*\(/ },
    { name: "MSSBrowserNotifyStreamVolumePan", line: 665, regex: /\bS32\s+MSSBrowserNotifyStreamVolumePan\s*\(/ },
    { name: "MSSBrowserFindStream", line: 710, regex: /\bMSSBrowserStreamState\s*\*\s*MSSBrowserFindStream\s*\(/ },
    { name: "MSSBrowserAllocateStream", line: 725, regex: /\bMSSBrowserStreamState\s*\*\s*MSSBrowserAllocateStream\s*\(/ },
    { name: "AIL_open_stream", line: 1708, regex: /\bHSTREAM\s+AIL_open_stream\s*\(/ },
    { name: "AIL_open_stream_by_sample", line: 1724, regex: /\bHSTREAM\s+AIL_open_stream_by_sample\s*\(/ },
    { name: "AIL_start_stream", line: 1737, regex: /\bvoid\s+AIL_start_stream\s*\(/ },
    { name: "AIL_pause_stream", line: 1748, regex: /\bvoid\s+AIL_pause_stream\s*\(/ },
    { name: "AIL_close_stream", line: 1764, regex: /\bvoid\s+AIL_close_stream\s*\(/ },
    { name: "AIL_stream_status", line: 1775, regex: /\bS32\s+AIL_stream_status\s*\(/ },
    { name: "AIL_set_stream_pan", line: 1780, regex: /\bvoid\s+AIL_set_stream_pan\s*\(/ },
    { name: "AIL_stream_pan", line: 1787, regex: /\bS32\s+AIL_stream_pan\s*\(/ },
    { name: "AIL_set_stream_volume", line: 1792, regex: /\bvoid\s+AIL_set_stream_volume\s*\(/ },
    { name: "AIL_stream_volume", line: 1800, regex: /\bS32\s+AIL_stream_volume\s*\(/ },
    { name: "AIL_set_stream_loop_block", line: 1805, regex: /\bvoid\s+AIL_set_stream_loop_block\s*\(/ },
    { name: "AIL_set_stream_loop_count", line: 1813, regex: /\bvoid\s+AIL_set_stream_loop_count\s*\(/ },
    { name: "AIL_stream_loop_count", line: 1820, regex: /\bS32\s+AIL_stream_loop_count\s*\(/ },
    { name: "AIL_set_stream_ms_position", line: 1825, regex: /\bvoid\s+AIL_set_stream_ms_position\s*\(\s*HSTREAM[^,]*,\s*S32\s+position/ },
    { name: "AIL_stream_ms_position[S32 overload]", line: 1832, regex: /\bvoid\s+AIL_stream_ms_position\s*\(\s*HSTREAM[^,]*,\s*S32\s*\*\s*len/ },
    { name: "AIL_stream_ms_position[long overload]", line: 1842, regex: /\bvoid\s+AIL_stream_ms_position\s*\(\s*HSTREAM[^,]*,\s*long\s*\*\s*len/ },
    { name: "AIL_stream_playback_rate", line: 1854, regex: /\bS32\s+AIL_stream_playback_rate\s*\(/ },
    { name: "AIL_set_stream_playback_rate", line: 1859, regex: /\bvoid\s+AIL_set_stream_playback_rate\s*\(/ },
    { name: "AIL_stream_volume_pan", line: 1866, regex: /\bvoid\s+AIL_stream_volume_pan\s*\(/ },
    { name: "AIL_set_stream_volume_pan", line: 1876, regex: /\bvoid\s+AIL_set_stream_volume_pan\s*\(/ },
    { name: "AIL_register_stream_callback", line: 1886, regex: /\bAIL_stream_callback\s+AIL_register_stream_callback\s*\(/ },
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
      expectedLine: 623,
      line: streamVolumeFloatPayloadLine,
      present: streamVolumeFloatPayloadLine !== -1,
    },
    notifyArgument: {
      expectedLine: 635,
      line: streamVolumeFloatArgumentLine,
      present: streamVolumeFloatArgumentLine !== -1,
    },
    integerSetterMirror: {
      expectedLine: 1797,
      line: integerSetterMirrorLine,
      present: integerSetterMirrorLine !== -1,
    },
    volumePanNotifyPayload: {
      expectedLine: 677,
      line: streamVolumePanNotifyPayloadLine,
      present: streamVolumePanNotifyPayloadLine !== -1,
    },
    volumePanNotifyArgument: {
      expectedLine: 687,
      line: streamVolumePanNotifyArgumentLine,
      present: streamVolumePanNotifyArgumentLine !== -1,
    },
    volumePanSetterNormalized: {
      expectedLine: 1880,
      line: volumePanSetterNormalizedLine,
      present: volumePanSetterNormalizedLine !== -1,
    },
    volumePanSetterIntegerMirror: {
      expectedLine: 1881,
      line: volumePanSetterIntegerMirrorLine,
      present: volumePanSetterIntegerMirrorLine !== -1,
    },
    volumePanSetterNotify: {
      expectedLine: 1883,
      line: volumePanSetterNotifyLine,
      present: volumePanSetterNotifyLine !== -1,
    },
  };
  if (streamVolumeFloatPayloadLine !== 623) {
    errors.push(`Mss.H stream start volumeFloat payload expected at line 623 but found at ${streamVolumeFloatPayloadLine}`);
  }
  if (streamVolumeFloatArgumentLine !== 635) {
    errors.push(`Mss.H stream start volumeFloat argument expected at line 635 but found at ${streamVolumeFloatArgumentLine}`);
  }
  if (integerSetterMirrorLine !== 1797) {
    errors.push(`Mss.H AIL_set_stream_volume volume_float mirror expected at line 1797 but found at ${integerSetterMirrorLine}`);
  }
  if (streamVolumePanNotifyPayloadLine !== 677) {
    errors.push(`Mss.H stream volume/pan volumeFloat payload expected at line 677 but found at ${streamVolumePanNotifyPayloadLine}`);
  }
  if (streamVolumePanNotifyArgumentLine !== 687) {
    errors.push(`Mss.H stream volume/pan volumeFloat argument expected at line 687 but found at ${streamVolumePanNotifyArgumentLine}`);
  }
  if (volumePanSetterNormalizedLine !== 1880) {
    errors.push(`Mss.H AIL_set_stream_volume_pan normalized volume_float expected at line 1880 but found at ${volumePanSetterNormalizedLine}`);
  }
  if (volumePanSetterIntegerMirrorLine !== 1881) {
    errors.push(`Mss.H AIL_set_stream_volume_pan integer volume mirror expected at line 1881 but found at ${volumePanSetterIntegerMirrorLine}`);
  }
  if (volumePanSetterNotifyLine !== 1883) {
    errors.push(`Mss.H AIL_set_stream_volume_pan browser notify expected at line 1883 but found at ${volumePanSetterNotifyLine}`);
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
      4896,
      /src\/wasm_mss_stream_lifecycle_probe\.cpp/,
      "CMake stream lifecycle probe source",
    ),
    export: requirePinnedLine(
      errors,
      cmake.lines,
      5121,
      /_cnc_port_probe_mss_stream_lifecycle/,
      "CMake stream lifecycle probe export",
    ),
  };

  facts.bridge = {
    cwrap: requirePinnedLine(
      errors,
      bridge.lines,
      11586,
      /probeMssStreamLifecycle:\s*module\.cwrap\("cnc_port_probe_mss_stream_lifecycle",\s*"string",\s*\[\]\)/,
      "bridge stream lifecycle cwrap",
    ),
    rpc: requirePinnedLine(
      errors,
      bridge.lines,
      27057,
      /case "mssStreamLifecycleProbe":/,
      "bridge mssStreamLifecycleProbe RPC",
    ),
    streamVolumePanFunction: requirePinnedLine(
      errors,
      bridge.lines,
      2346,
      /\bfunction\s+cncPortMssStreamVolumePan\s*\(/,
      "bridge stream volume/pan callback",
    ),
    streamVolumePanGain: requirePinnedLine(
      errors,
      bridge.lines,
      2356,
      /active\.gain\.gain\.value\s*=\s*volume/,
      "bridge stream volume/pan active gain update",
    ),
    streamVolumePanModuleCallback: requirePinnedLine(
      errors,
      bridge.lines,
      11336,
      /^\s+cncPortMssStreamVolumePan,\s*$/,
      "bridge stream volume/pan module callback",
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
