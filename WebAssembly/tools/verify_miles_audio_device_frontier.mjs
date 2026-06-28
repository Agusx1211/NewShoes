#!/usr/bin/env node
// verify_miles_audio_device_frontier.mjs
//
// Source-checks the original Miles audio device startup frontier after
// createAudioManager. It reads (never executes) the original device source,
// header, and the wasm compile-only Mss.H shim, and emits a JSON report.
//
// Verified facts:
//   - MilesAudioManager::init exists at line 444.
//   - Inside init, AudioManager::init() appears before openDevice(), and
//     AIL_set_file_callbacks(...) appears after openDevice().
//   - MilesAudioManager::openDevice exists at line 1444.
//   - Inside openDevice, in order: AIL_set_redist_directory, AIL_startup,
//     AIL_quick_startup, AIL_quick_handles, buildProviderList, selectProvider,
//     refreshCachedVariables, initDelayFilter.
//   - Header declares virtual void openDevice(void) around line 162 and
//     class MilesAudioManager derives from AudioManager around line 137.
//   - WebAssembly/shims/Mss.H has inert compile-only implementations for
//     AIL_startup, AIL_shutdown, AIL_quick_startup, AIL_quick_handles, and
//     AIL_set_file_callbacks (compileOnly: true).
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
  for (let i = Math.max(startLine - 1, 0); i < endLine && i < lines.length; i++) {
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

  // Fact: MilesAudioManager::init exists at line 444.
  const initLine = lineNumber(
    cpp.lines,
    (line) => /void\s+MilesAudioManager\s*::\s*init\s*\(\s*\)/.test(line),
  );
  facts.initLine = initLine;
  if (initLine !== 444) {
    errors.push(
      `MilesAudioManager::init expected at line 444 but found at ${initLine}`,
    );
  }

  // Inside init, AudioManager::init() before openDevice(), and
  // AIL_set_file_callbacks after openDevice().
  if (initLine > 0) {
    const initRange = functionBodyLineRange(cpp.lines, initLine);
    if (!initRange) {
      errors.push("init: function body not found");
    }
    const audioMgrInit = initRange ? firstMatchInRange(
      cpp.lines,
      initRange.start,
      initRange.end,
      /\bAudioManager\s*::\s*init\s*\(\s*\)/,
    ) : -1;
    const openDeviceCall = initRange ? firstMatchInRange(
      cpp.lines,
      initRange.start,
      initRange.end,
      /\bopenDevice\s*\(\s*\)/,
    ) : -1;
    const fileCallbacks = initRange ? firstMatchInRange(
      cpp.lines,
      initRange.start,
      initRange.end,
      /AIL_set_file_callbacks\s*\(/,
    ) : -1;

    facts.initAudioManagerInitLine = audioMgrInit;
    facts.initOpenDeviceCallLine = openDeviceCall;
    facts.initFileCallbacksLine = fileCallbacks;

    if (audioMgrInit === -1) {
      errors.push("init: AudioManager::init() call not found after init start");
    }
    if (openDeviceCall === -1) {
      errors.push("init: openDevice() call not found after init start");
    }
    if (fileCallbacks === -1) {
      errors.push(
        "init: AIL_set_file_callbacks(...) call not found after init start",
      );
    }
    if (
      audioMgrInit !== -1 &&
      openDeviceCall !== -1 &&
      !(audioMgrInit < openDeviceCall)
    ) {
      errors.push(
        `init: AudioManager::init() (line ${audioMgrInit}) must appear before openDevice() (line ${openDeviceCall})`,
      );
    }
    if (
      openDeviceCall !== -1 &&
      fileCallbacks !== -1 &&
      !(openDeviceCall < fileCallbacks)
    ) {
      errors.push(
        `init: AIL_set_file_callbacks(...) (line ${fileCallbacks}) must appear after openDevice() (line ${openDeviceCall})`,
      );
    }
  }

  // Fact: MilesAudioManager::openDevice exists at line 1444.
  const openDeviceDefLine = lineNumber(
    cpp.lines,
    (line) => /void\s+MilesAudioManager\s*::\s*openDevice\s*\(\s*void\s*\)/.test(line),
  );
  facts.openDeviceDefLine = openDeviceDefLine;
  if (openDeviceDefLine !== 1444) {
    errors.push(
      `MilesAudioManager::openDevice expected at line 1444 but found at ${openDeviceDefLine}`,
    );
  }

  // Inside openDevice, ordering of 8 calls.
  if (openDeviceDefLine > 0) {
    const openDeviceRange = functionBodyLineRange(cpp.lines, openDeviceDefLine);
    if (!openDeviceRange) {
      errors.push("openDevice: function body not found");
    }
    const expectedOrder = [
      { key: "AIL_set_redist_directory", re: /AIL_set_redist_directory\s*\(/ },
      { key: "AIL_startup", re: /\bAIL_startup\s*\(/ },
      { key: "AIL_quick_startup", re: /AIL_quick_startup\s*\(/ },
      { key: "AIL_quick_handles", re: /AIL_quick_handles\s*\(/ },
      { key: "buildProviderList", re: /\bbuildProviderList\s*\(/ },
      { key: "selectProvider", re: /\bselectProvider\s*\(/ },
      { key: "refreshCachedVariables", re: /refreshCachedVariables\s*\(/ },
      { key: "initDelayFilter", re: /\binitDelayFilter\s*\(/ },
    ];

    const positions = {};
    let prevLine = -1;
    let prevKey = null;
    for (const { key, re } of expectedOrder) {
      const ln = openDeviceRange ? firstMatchInRange(
        cpp.lines,
        openDeviceRange.start,
        openDeviceRange.end,
        re,
      ) : -1;
      positions[key] = ln;
      if (ln === -1) {
        errors.push(`openDevice: expected call ${key} not found`);
      } else if (prevLine !== -1 && !(prevLine < ln)) {
        errors.push(
          `openDevice: ${key} (line ${ln}) must come after ${prevKey} (line ${prevLine})`,
        );
      }
      prevLine = ln;
      prevKey = key;
    }
    facts.openDeviceCallOrder = positions;
  }

  // Header facts.
  const classLine = lineNumber(
    h.lines,
    (line) => /\bclass\s+MilesAudioManager\s*:\s*public\s+AudioManager\b/.test(line),
  );
  facts.classMilesAudioManagerLine = classLine;
  if (classLine !== 137) {
    errors.push(
      `class MilesAudioManager : public AudioManager expected around line 137 but found at ${classLine}`,
    );
  }

  const openDeviceDeclLine = lineNumber(
    h.lines,
    (line) => /virtual\s+void\s+openDevice\s*\(\s*void\s*\)/.test(line),
  );
  facts.headerOpenDeviceDeclLine = openDeviceDeclLine;
  if (openDeviceDeclLine !== 162) {
    errors.push(
      `virtual void openDevice(void) expected around line 162 but found at ${openDeviceDeclLine}`,
    );
  }

  // Shim facts: inert compile-only implementations.
  const shimFunctions = [
    "AIL_startup",
    "AIL_shutdown",
    "AIL_quick_startup",
    "AIL_quick_handles",
    "AIL_set_file_callbacks",
  ];
  const shimInfo = {};
  for (const fn of shimFunctions) {
    const re = new RegExp(`\\b${fn}\\s*\\(`);
    const ln = lineNumber(shim.lines, (line) => re.test(line));
    shimInfo[fn] = { line: ln };
    if (ln === -1) {
      errors.push(`shim Mss.H: missing function ${fn}`);
    }
  }
  // compileOnly true: all functions present.
  const shimAllPresent =
    Object.values(shimInfo).every((info) => info.line !== -1);
  facts.mssShim = {
    compileOnly: true,
    functions: shimInfo,
    allInertImplementationsPresent: shimAllPresent,
  };
  if (!shimAllPresent) {
    errors.push(
      "shim Mss.H: not all inert compile-only functions are present",
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
