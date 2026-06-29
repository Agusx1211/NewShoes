#!/usr/bin/env node
// verify_mss_startup_probe_contract.mjs
//
// Source-only verifier for the Miles/MSS startup probe contract. It reads repo
// source files only, with no assets, browser, or build artifacts, and pins the
// facts that the probe must observe:
//
//   1. WebAssembly/shims/Mss.H declares the MSS startup boundary surface:
//      AIL_startup, AIL_shutdown, AIL_quick_startup, AIL_quick_handles,
//      AIL_set_file_callbacks, AIL_allocate_sample_handle,
//      AIL_allocate_3D_sample_handle, AIL_open_3D_listener,
//      AIL_enumerate_3D_providers, AIL_open_3D_provider.
//
//   2. MilesAudioManager.cpp::openDevice calls, in source order:
//      AIL_set_redist_directory, AIL_startup, AIL_quick_startup,
//      AIL_quick_handles, buildProviderList, selectProvider,
//      refreshCachedVariables, initDelayFilter.
//
//   3. wasm_port_entry.cpp exposes milesAudioDeviceFrontier with source
//      "MilesAudioManager.cpp::init/openDevice + Mss.H" and the current line
//      anchors that the probe will bind to.
//
//   4. WebAssembly/src/wasm_mss_startup_probe.cpp implements the runtime probe,
//      CMake compiles and exports it, and the harness exposes the
//      mssStartupProbe RPC.
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
  milesAudioManagerCpp:
    "GeneralsMD/Code/GameEngineDevice/Source/MilesAudioDevice/MilesAudioManager.cpp",
  wasmPortEntry: "WebAssembly/src/wasm_port_entry.cpp",
  wasmMssStartupProbe: "WebAssembly/src/wasm_mss_startup_probe.cpp",
  cmakeLists: "WebAssembly/CMakeLists.txt",
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

// Locate a C++ function/object definition line by a regex tested against the
// signature token. For Mss.H inline definitions and MilesAudioManager members
// this matches the definition, not a forward declaration.
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
// optionally constrained to a body range { start, end }. Requires call syntax
// `name(` so a name appearing only in a comment does not match, and matches
// whole tokens so e.g. AIL_startup does not match AIL_startup_extras.
function nextCallLine(lines, name, fromLine, bodyRange = null) {
  const token = new RegExp(`\\b${name}\\s*\\(`);
  for (let i = fromLine - 1; i < lines.length; i++) {
    const ln = i + 1;
    if (bodyRange && (ln < bodyRange.start || ln > bodyRange.end)) continue;
    if (token.test(lines[i])) return ln;
  }
  return -1;
}

function requireLine(errors, lines, expectedLine, pattern, label) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  const actual = lineNumber(lines, (line) => re.test(line));
  const fact = { expectedLine, line: actual };
  if (actual === -1) {
    errors.push(`${label} not found`);
  } else if (expectedLine !== null && actual !== expectedLine) {
    errors.push(`${label} expected at line ${expectedLine} but found at ${actual}`);
  }
  return fact;
}

function main() {
  const errors = [];
  const facts = {};

  const mss = readSourceLines(SOURCES.mssShim);
  const miles = readSourceLines(SOURCES.milesAudioManagerCpp);
  const entry = readSourceLines(SOURCES.wasmPortEntry);
  const probe = readSourceLines(SOURCES.wasmMssStartupProbe);
  const cmake = readSourceLines(SOURCES.cmakeLists);
  const bridge = readSourceLines(SOURCES.bridge);

  // ========================================================================
  // FACT 1 - Mss.H declares the MSS startup boundary surface.
  // ------------------------------------------------------------------------
  // Each expected function is defined (static inline) in Mss.H at the pinned
  // line. Definitions, not references, must exist.
  // ========================================================================
  const mssBoundary = [
    { name: "AIL_startup", line: 275 },
    { name: "AIL_shutdown", line: 282 },
    { name: "AIL_allocate_sample_handle", line: 331 },
    { name: "AIL_allocate_3D_sample_handle", line: 531 },
    { name: "AIL_open_3D_listener", line: 587 },
    { name: "AIL_enumerate_3D_providers", line: 589 },
    { name: "AIL_open_3D_provider", line: 610 },
    { name: "AIL_set_file_callbacks", line: 671 },
    { name: "AIL_quick_startup", line: 685 },
    { name: "AIL_quick_handles", line: 711 },
  ];
  const mssFacts = {};
  for (const { name, line } of mssBoundary) {
    // Match a definition signature: return type + name + ( ... ).
    const defRegex = new RegExp(
      `\\b(?:static\\s+inline\\s+)?\\w[\\w\\s\\*&]*\\b${name}\\s*\\(`,
    );
    const actual = findDefLine(mss.lines, defRegex);
    mssFacts[name] = { expectedLine: line, line: actual };
    if (actual === -1) {
      errors.push(`Mss.H missing boundary function definition: ${name}`);
    } else if (actual !== line) {
      errors.push(
        `Mss.H ${name} definition expected at line ${line} but found at ${actual}`,
      );
    }
  }
  facts.mssShimBoundaryFunctions = mssFacts;

  // ========================================================================
  // FACT 2 - MilesAudioManager.cpp::openDevice ordered call sequence.
  // ------------------------------------------------------------------------
  // openDevice is defined at 1444; the eight calls below occur in its body in
  // the listed order and at the pinned lines.
  // ========================================================================
  const openDeviceDefLine = findDefLine(
    miles.lines,
    /void\s+MilesAudioManager\s*::\s*openDevice\s*\(/,
  );
  facts.milesOpenDeviceDefLine = { expectedLine: 1444, line: openDeviceDefLine };
  if (openDeviceDefLine !== 1444) {
    errors.push(
      `MilesAudioManager::openDevice definition expected at line 1444 but found at ${openDeviceDefLine}`,
    );
  }
  const openDeviceRange = openDeviceDefLine > 0
    ? functionBodyLineRange(miles.lines, openDeviceDefLine)
    : null;
  if (openDeviceDefLine > 0 && !openDeviceRange) {
    errors.push("MilesAudioManager::openDevice function body not found");
  }

  const openDeviceSequence = [
    { name: "AIL_set_redist_directory", line: 1450 },
    { name: "AIL_startup", line: 1451 },
    { name: "AIL_quick_startup", line: 1458 },
    { name: "AIL_quick_handles", line: 1461 },
    { name: "buildProviderList", line: 1464 },
    { name: "selectProvider", line: 1470 },
    { name: "refreshCachedVariables", line: 1473 },
    { name: "initDelayFilter", line: 1479 },
  ];
  const sequenceFacts = {};
  let prevActual = -1;
  let prevName = null;
  for (const { name, line } of openDeviceSequence) {
    const startFrom = prevActual > 0 ? prevActual : openDeviceDefLine;
    const actual = nextCallLine(miles.lines, name, startFrom, openDeviceRange);
    sequenceFacts[name] = { expectedLine: line, line: actual };
    if (actual === -1) {
      errors.push(
        `MilesAudioManager::openDevice missing call/use: ${name}`,
      );
    } else if (actual !== line) {
      errors.push(
        `MilesAudioManager::openDevice ${name} expected at line ${line} but found at ${actual}`,
      );
    } else if (prevActual !== -1 && !(prevActual < actual)) {
      errors.push(
        `MilesAudioManager::openDevice ${name} (line ${actual}) must come after ${prevName} (line ${prevActual})`,
      );
    }
    prevActual = actual > 0 ? actual : prevActual;
    prevName = name;
  }
  facts.milesOpenDeviceCallSequence = sequenceFacts;

  // ========================================================================
  // FACT 3 - wasm_port_entry.cpp exposes milesAudioDeviceFrontier with the
  // pinned source string and line anchors.
  //
  // The frontier JSON is emitted as a C++ string literal, so quotes are
  // escaped (backslash-quote) in the raw source. We tolerate an optional
  // backslash before each quote so the verifier stays robust to a future
  // plain-JSON reformat.
  // ========================================================================
  const frontierFacts = {};

  const frontierSourceLine = lineNumber(entry.lines, (line) =>
    /milesAudioDeviceFrontier/.test(line) &&
    /MilesAudioManager\.cpp::init\/openDevice \+ Mss\.H/.test(line),
  );
  frontierFacts.sourceString = {
    expected: "MilesAudioManager.cpp::init/openDevice + Mss.H",
    line: frontierSourceLine,
    expectedLine: 1469,
  };
  if (frontierSourceLine !== 1469) {
    errors.push(
      `wasm_port_entry milesAudioDeviceFrontier source string expected at line 1469 but found at ${frontierSourceLine}`,
    );
  }

  // Line anchors embedded in the frontier JSON literal. Each is a (escaped)
  // "key":value literal on its own snippet line. The optional-backslash form
  // (\\?") matches both the current escaped source and a plain JSON form.
  const frontierAnchors = [
    { key: "initLine", value: 444, expectedLine: 1478 },
    { key: "audioManagerInitLine", value: 446, expectedLine: 1479 },
    { key: "openDeviceCallLine", value: 454, expectedLine: 1480 },
    { key: "fileCallbacksLine", value: 458, expectedLine: 1481 },
    { key: "openDeviceLine", value: 1444, expectedLine: 1482 },
  ];
  const anchorFacts = {};
  for (const { key, value, expectedLine } of frontierAnchors) {
    // Build via a string pattern so the optional-backslash escaping is explicit.
    const re = new RegExp("\\\\?\"" + key + "\\\\?\":" + value + "\\b");
    const actual = lineNumber(entry.lines, (line) => re.test(line));
    anchorFacts[key] = { value, expectedLine, line: actual };
    if (actual !== expectedLine) {
      errors.push(
        `wasm_port_entry ${key}:${value} anchor expected at line ${expectedLine} but found at ${actual}`,
      );
    }
  }
  frontierFacts.lineAnchors = anchorFacts;

  // openDeviceCalls array entries: order, line, and call name must all match
  // the openDevice sequence pinned in FACT 2. Each entry is one snippet line.
  const frontierCalls = openDeviceSequence.map(({ name, line }, idx) => ({
    order: idx + 1,
    call: name,
    line,
  }));
  const frontierCallsFacts = [];
  const callsArrayStart = lineNumber(entry.lines, (line) =>
    /openDeviceCalls\\?"?\s*:\s*\[/.test(line),
  );
  frontierFacts.openDeviceCallsArrayStart = { line: callsArrayStart };
  if (callsArrayStart === -1) {
    errors.push(
      "wasm_port_entry milesAudioDeviceFrontier openDeviceCalls array not found",
    );
  }
  for (const { order, call, line } of frontierCalls) {
    // Each \" in the C++ literal is an optional backslash + quote here so
    // both escaped and plain-JSON forms match.
    const re = new RegExp(
      "\\\\?\\{\\\\?\"order\\\\?\":" + order +
        ",\\\\?\"line\\\\?\":" + line +
        ",\\\\?\"call\\\\?\":\\\\?\"" + call + "\\\\?\"",
    );
    const actual = lineNumber(entry.lines, (l) => re.test(l));
    frontierCallsFacts.push({ order, call, expectedLine: line, line: actual });
    if (actual === -1) {
      errors.push(
        `wasm_port_entry openDeviceCalls missing {order:${order},line:${line},call:"${call}"}`,
      );
    }
  }
  frontierFacts.openDeviceCalls = frontierCallsFacts;
  facts.milesAudioDeviceFrontier = frontierFacts;

  // ========================================================================
  // FACT 4 - probe source, CMake export, and harness RPC surface.
  // ========================================================================
  const probeFacts = {
    sourceFile: SOURCES.wasmMssStartupProbe,
    function: requireLine(
      errors,
      probe.lines,
      44,
      /\bcnc_port_probe_mss_startup\s*\(/,
      "wasm_mss_startup_probe cnc_port_probe_mss_startup",
    ),
    reset: requireLine(errors, probe.lines, 46, /\bMSSBrowserRuntimeReset\s*\(/, "probe MSSBrowserRuntimeReset"),
    redist: requireLine(errors, probe.lines, 48, /\bAIL_set_redist_directory\s*\(/, "probe AIL_set_redist_directory"),
    startup: requireLine(errors, probe.lines, 49, /\bAIL_startup\s*\(/, "probe AIL_startup"),
    quickStartup: requireLine(errors, probe.lines, 50, /\bAIL_quick_startup\s*\(/, "probe AIL_quick_startup"),
    quickHandles: requireLine(errors, probe.lines, 53, /\bAIL_quick_handles\s*\(/, "probe AIL_quick_handles"),
    enumerateProviders: requireLine(errors, probe.lines, 61, /\bAIL_enumerate_3D_providers\s*\(/, "probe AIL_enumerate_3D_providers"),
    openProvider: requireLine(errors, probe.lines, 69, /\bAIL_open_3D_provider\s*\(/, "probe AIL_open_3D_provider"),
    openListener: requireLine(errors, probe.lines, 70, /\bAIL_open_3D_listener\s*\(/, "probe AIL_open_3D_listener"),
    allocateSample2D: requireLine(errors, probe.lines, 71, /\bAIL_allocate_sample_handle\s*\(/, "probe AIL_allocate_sample_handle"),
    allocateSample3D: requireLine(errors, probe.lines, 72, /\bAIL_allocate_3D_sample_handle\s*\(/, "probe AIL_allocate_3D_sample_handle"),
    fileCallbacks: requireLine(errors, probe.lines, 73, /\bAIL_set_file_callbacks\s*\(/, "probe AIL_set_file_callbacks"),
    shutdown: requireLine(errors, probe.lines, 76, /\bAIL_shutdown\s*\(/, "probe AIL_shutdown"),
    startupReadyJson: requireLine(errors, probe.lines, 106, /startupBoundaryReady/, "probe startupBoundaryReady JSON"),
    playbackNotReadyJson: requireLine(errors, probe.lines, 107, /playbackReady/, "probe playbackReady false JSON"),
    nextRequiredJson: requireLine(errors, probe.lines, 108, /nextRequired.*webAudioPlaybackBackend/, "probe nextRequired JSON"),
    cmakeSource: requireLine(errors, cmake.lines, 3691, /src\/wasm_mss_startup_probe\.cpp/, "CMake wasm_mss_startup_probe source"),
    cmakeExport: requireLine(errors, cmake.lines, 3816, /_cnc_port_probe_mss_startup/, "CMake cnc_port_probe_mss_startup export"),
    bridgeCwrap: requireLine(
      errors,
      bridge.lines,
      5732,
      /probeMssStartup:\s*module\.cwrap\("cnc_port_probe_mss_startup",\s*"string",\s*\[\]\)/,
      "bridge probeMssStartup cwrap",
    ),
    bridgeRpc: requireLine(errors, bridge.lines, 15556, /case "mssStartupProbe":/, "bridge mssStartupProbe RPC"),
    bridgePlaybackGuard: requireLine(errors, bridge.lines, 15567, /probe\.playbackReady === false/, "bridge playbackReady false guard"),
    bridgeNextRequiredGuard: requireLine(
      errors,
      bridge.lines,
      15568,
      /probe\.nextRequired === "webAudioPlaybackBackend"/,
      "bridge nextRequired guard",
    ),
  };
  facts.mssStartupProbeSurface = probeFacts;

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
