#!/usr/bin/env node
// verify_bink_video_device_frontier.mjs
//
// Source-checks the original Bink video device frontier. It reads (never
// executes) only repo source files: the original Bink video device source and
// header, the wasm browser bink declaration shim/provider, the wasm CMake
// compile/smoke targets, and the focused sidecar smoke harnesses. It emits a
// JSON { ok, errors, sources, facts } report and exits nonzero on missing/moved
// hard facts.
//
// Verified facts (line numbers measured against the current original source):
//   - BinkVideoPlayer::init (line 128) calls VideoPlayer::init() (line 131)
//     then initializeBinkWithMiles() (line 133).
//   - BinkVideoPlayer::deinit (line 140) calls TheAudio->releaseHandleForBink()
//     (line 142) then VideoPlayer::deinit() (line 143).
//   - BinkVideoPlayer::open (line 221) uses BinkOpen on the mod path (line 233),
//     localized path (line 243), and fallback path (line 249), then createStream
//     (line 237 mod return; line 254 final).
//   - BinkVideoPlayer::createStream (line 187) sets stream->m_handle (line 200)
//     and calls BinkSetVolume (line 210).
//   - BinkVideoPlayer::initializeBinkWithMiles (line 283) calls
//     TheAudio->getHandleForBink() (line 286), then BinkSoundUseDirectSound
//     (line 290), and BinkSetSoundTrack (line 294) on the no-driver fallback.
//   - BinkVideoStream destructor (line 312) calls BinkClose (line 316).
//   - update/isFrameReady map to BinkWait (327/336); frameDecompress to
//     BinkDoFrame (345); frameRender to BinkCopyToBuffer (385); frameNext to
//     BinkNextFrame (399); frameGoto to BinkGoto (426); height/width/frameIndex/
//     frameCount read handle fields (Height/Width/FrameNum/Frames).
//   - Header (BinkVideoPlayer.h) includes "bink.h" (line 53), declares
//     class BinkVideoStream (line 69) with HBINK m_handle (line 75), declares
//     class BinkVideoPlayer (line 106) with createStream (111), init (116),
//     deinit (120), open (130), initializeBinkWithMiles (134).
//   - WebAssembly/shims/bink.h declares the BINK struct (Width/Height/Frames/
//     FrameNum), HBINK, BINKPRELOADALL/BINKSURFACE* constants, and the Bink API
//     declarations (BinkOpen/BinkClose/BinkWait/BinkDoFrame/BinkNextFrame/
//     BinkGoto/BinkCopyToBuffer/BinkSetVolume/BinkSoundUseDirectSound/
//     BinkSetSoundTrack).
//   - WebAssembly/src/wasm_bink_provider.cpp defines the current browser Bink
//     provider: BinkOpen reads real classic BIK headers and fills the original
//     handle fields, frame cursor APIs are stateful, sidecar metadata is read
//     from bink-browser-video-manifest.json, and BinkCopyToBuffer delegates
//     decoded sidecar pixel copies to a hook-gated browser bridge.
//   - WebAssembly/CMakeLists.txt defines the zh_bink_video_device_compile_frontier
//     static library target (line 2468) compiling BinkVideoPlayer.cpp (line 2469)
//     and links it to zh_browser_bink. It also defines focused node/browser
//     provider smoke targets for the sidecar manifest contract, a node
//     BinkVideoPlayer runtime smoke target, and a browser BinkVideoPlayer
//     sidecar-copy smoke target.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  cpp: "GeneralsMD/Code/GameEngineDevice/Source/VideoDevice/Bink/BinkVideoPlayer.cpp",
  h: "GeneralsMD/Code/GameEngineDevice/Include/VideoDevice/Bink/BinkVideoPlayer.h",
  shim: "WebAssembly/shims/bink.h",
  provider: "WebAssembly/src/wasm_bink_provider.cpp",
  smoke: "WebAssembly/tests/bink_video_provider_smoke.cpp",
  runtimeSmoke: "WebAssembly/tests/bink_videoplayer_runtime_smoke.cpp",
  sidecarRunner: "WebAssembly/tools/run_bink_video_sidecar_provider_smoke.mjs",
  browserHarness: "WebAssembly/harness/bink_provider_sidecar_browser_smoke.mjs",
  runtimeBrowserHarness: "WebAssembly/harness/bink_videoplayer_sidecar_browser_smoke.mjs",
  cmake: "WebAssembly/CMakeLists.txt",
  packageJson: "WebAssembly/package.json",
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
    for (const ch of lines[i]) {
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

// Assert that a given line number exactly matches the expected value.
function assertExact(errors, facts, key, actual, expected, label) {
  facts[key] = actual;
  if (actual !== expected) {
    errors.push(
      `${label}: expected line ${expected} but found ${actual}`,
    );
  }
}

function assertPresent(errors, facts, key, actual, label) {
  facts[key] = actual;
  if (actual === -1) {
    errors.push(`${label}: not found`);
  }
}

function assertOrder(errors, a, b, label) {
  if (a !== -1 && b !== -1 && !(a < b)) {
    errors.push(`${label}: line ${a} must come before line ${b}`);
  }
}

function main() {
  const errors = [];
  const facts = {
    player: {},
    stream: {},
    header: {},
    shim: {},
    provider: {},
    smoke: {},
    runtimeSmoke: {},
    sidecarRunner: {},
    browserHarness: {},
    runtimeBrowserHarness: {},
    cmake: {},
    packageJson: {},
  };

  const cpp = readSourceLines(SOURCES.cpp);
  const h = readSourceLines(SOURCES.h);
  const shim = readSourceLines(SOURCES.shim);
  const provider = readSourceLines(SOURCES.provider);
  const smoke = readSourceLines(SOURCES.smoke);
  const runtimeSmoke = readSourceLines(SOURCES.runtimeSmoke);
  const sidecarRunner = readSourceLines(SOURCES.sidecarRunner);
  const browserHarness = readSourceLines(SOURCES.browserHarness);
  const runtimeBrowserHarness = readSourceLines(SOURCES.runtimeBrowserHarness);
  const cmake = readSourceLines(SOURCES.cmake);
  const packageJson = readSourceLines(SOURCES.packageJson);

  // --- BinkVideoPlayer::init / deinit ---
  const initDef = lineNumber(
    cpp.lines,
    (line) => /void\s+BinkVideoPlayer\s*::\s*init\s*\(\s*void\s*\)/.test(line),
  );
  assertExact(errors, facts, "player.initDefLine", initDef, 128,
    "BinkVideoPlayer::init");
  if (initDef > 0) {
    const range = functionBodyLineRange(cpp.lines, initDef);
    if (!range) {
      errors.push("BinkVideoPlayer::init: function body not found");
    }
    const videoInit = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /\bVideoPlayer\s*::\s*init\s*\(\s*\)/)
      : -1;
    const initMiles = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /\binitializeBinkWithMiles\s*\(\s*\)/)
      : -1;
    facts.player.initVideoPlayerInitLine = videoInit;
    facts.player.initMilesLine = initMiles;
    if (videoInit === -1) {
      errors.push("BinkVideoPlayer::init: VideoPlayer::init() call not found");
    }
    if (initMiles === -1) {
      errors.push("BinkVideoPlayer::init: initializeBinkWithMiles() call not found");
    }
    if (videoInit !== 131) {
      errors.push(`BinkVideoPlayer::init: VideoPlayer::init() expected at line 131 but found ${videoInit}`);
    }
    if (initMiles !== 133) {
      errors.push(`BinkVideoPlayer::init: initializeBinkWithMiles() expected at line 133 but found ${initMiles}`);
    }
    assertOrder(errors, videoInit, initMiles,
      "BinkVideoPlayer::init: VideoPlayer::init() before initializeBinkWithMiles()");
  }

  const deinitDef = lineNumber(
    cpp.lines,
    (line) => /void\s+BinkVideoPlayer\s*::\s*deinit\s*\(\s*void\s*\)/.test(line),
  );
  assertExact(errors, facts, "player.deinitDefLine", deinitDef, 140,
    "BinkVideoPlayer::deinit");
  if (deinitDef > 0) {
    const range = functionBodyLineRange(cpp.lines, deinitDef);
    const release = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /TheAudio\s*->\s*releaseHandleForBink\s*\(\s*\)/)
      : -1;
    const vpDeinit = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /\bVideoPlayer\s*::\s*deinit\s*\(\s*\)/)
      : -1;
    facts.player.deinitReleaseHandleLine = release;
    facts.player.deinitVideoPlayerDeinitLine = vpDeinit;
    if (release !== 142) {
      errors.push(`BinkVideoPlayer::deinit: releaseHandleForBink() expected at line 142 but found ${release}`);
    }
    if (vpDeinit !== 143) {
      errors.push(`BinkVideoPlayer::deinit: VideoPlayer::deinit() expected at line 143 but found ${vpDeinit}`);
    }
    assertOrder(errors, release, vpDeinit,
      "BinkVideoPlayer::deinit: releaseHandleForBink() before VideoPlayer::deinit()");
  }

  // --- BinkVideoPlayer::open / createStream / initializeBinkWithMiles ---
  const openDef = lineNumber(
    cpp.lines,
    (line) => /VideoStreamInterface\s*\*\s*BinkVideoPlayer\s*::\s*open\s*\(\s*AsciiString\s+movieTitle\s*\)/.test(line),
  );
  assertExact(errors, facts, "player.openDefLine", openDef, 221,
    "BinkVideoPlayer::open");
  if (openDef > 0) {
    const range = functionBodyLineRange(cpp.lines, openDef);
    const binkOpens = range
      ? Array.from(
          (function* () {
            for (let i = range.start - 1; i < range.end && i < cpp.lines.length; i++) {
              if (/BinkOpen\s*\(/.test(cpp.lines[i])) yield i + 1;
            }
          })(),
        )
      : [];
    facts.player.openBinkOpenLines = binkOpens;
    if (!binkOpens.includes(233)) {
      errors.push(`BinkVideoPlayer::open: mod-path BinkOpen expected at line 233 but open calls were ${JSON.stringify(binkOpens)}`);
    }
    if (!binkOpens.includes(243)) {
      errors.push(`BinkVideoPlayer::open: localized-path BinkOpen expected at line 243 but open calls were ${JSON.stringify(binkOpens)}`);
    }
    if (!binkOpens.includes(249)) {
      errors.push(`BinkVideoPlayer::open: fallback-path BinkOpen expected at line 249 but open calls were ${JSON.stringify(binkOpens)}`);
    }
    const createStreamCalls = range
      ? Array.from(
          (function* () {
            for (let i = range.start - 1; i < range.end && i < cpp.lines.length; i++) {
              if (/\bcreateStream\s*\(/.test(cpp.lines[i])) yield i + 1;
            }
          })(),
        )
      : [];
    facts.player.openCreateStreamLines = createStreamCalls;
    if (createStreamCalls.length === 0) {
      errors.push("BinkVideoPlayer::open: createStream() call not found in body");
    }
  }

  const createStreamDef = lineNumber(
    cpp.lines,
    (line) => /VideoStreamInterface\s*\*\s*BinkVideoPlayer\s*::\s*createStream\s*\(\s*HBINK\s+handle\s*\)/.test(line),
  );
  assertExact(errors, facts, "player.createStreamDefLine", createStreamDef, 187,
    "BinkVideoPlayer::createStream");
  if (createStreamDef > 0) {
    const range = functionBodyLineRange(cpp.lines, createStreamDef);
    const handleSet = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /stream\s*->\s*m_handle\s*=/)
      : -1;
    const setVolume = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /\bBinkSetVolume\s*\(/)
      : -1;
    facts.player.createStreamHandleSetLine = handleSet;
    facts.player.createStreamBinkSetVolumeLine = setVolume;
    if (handleSet !== 200) {
      errors.push(`BinkVideoPlayer::createStream: stream->m_handle assignment expected at line 200 but found ${handleSet}`);
    }
    if (setVolume !== 210) {
      errors.push(`BinkVideoPlayer::createStream: BinkSetVolume() expected at line 210 but found ${setVolume}`);
    }
    assertOrder(errors, handleSet, setVolume,
      "BinkVideoPlayer::createStream: m_handle assignment before BinkSetVolume()");
  }

  const initMilesDef = lineNumber(
    cpp.lines,
    (line) => /void\s+BinkVideoPlayer\s*::\s*initializeBinkWithMiles\s*\(\s*\)/.test(line),
  );
  assertExact(errors, facts, "player.initializeBinkWithMilesDefLine", initMilesDef, 283,
    "BinkVideoPlayer::initializeBinkWithMiles");
  if (initMilesDef > 0) {
    const range = functionBodyLineRange(cpp.lines, initMilesDef);
    const getHandle = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /TheAudio\s*->\s*getHandleForBink\s*\(\s*\)/)
      : -1;
    const useDS = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /\bBinkSoundUseDirectSound\s*\(/)
      : -1;
    const setTrack = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /\bBinkSetSoundTrack\s*\(/)
      : -1;
    facts.player.initMilesGetHandleLine = getHandle;
    facts.player.initMilesBinkSoundUseDirectSoundLine = useDS;
    facts.player.initMilesBinkSetSoundTrackLine = setTrack;
    if (getHandle !== 286) {
      errors.push(`BinkVideoPlayer::initializeBinkWithMiles: getHandleForBink() expected at line 286 but found ${getHandle}`);
    }
    if (useDS !== 290) {
      errors.push(`BinkVideoPlayer::initializeBinkWithMiles: BinkSoundUseDirectSound() expected at line 290 but found ${useDS}`);
    }
    if (setTrack !== 294) {
      errors.push(`BinkVideoPlayer::initializeBinkWithMiles: BinkSetSoundTrack() expected at line 294 but found ${setTrack}`);
    }
    assertOrder(errors, getHandle, useDS,
      "BinkVideoPlayer::initializeBinkWithMiles: getHandleForBink() before BinkSoundUseDirectSound()");
  }

  // --- BinkVideoStream methods / handle field reads ---
  const dtorDef = lineNumber(
    cpp.lines,
    (line) => /BinkVideoStream\s*::~BinkVideoStream\s*\(\s*\)/.test(line),
  );
  assertExact(errors, facts, "stream.dtorDefLine", dtorDef, 312,
    "BinkVideoStream::~BinkVideoStream");
  if (dtorDef > 0) {
    const range = functionBodyLineRange(cpp.lines, dtorDef);
    const close = range
      ? firstMatchInRange(cpp.lines, range.start, range.end, /\bBinkClose\s*\(/)
      : -1;
    facts.stream.dtorBinkCloseLine = close;
    if (close !== 316) {
      errors.push(`BinkVideoStream::~BinkVideoStream: BinkClose() expected at line 316 but found ${close}`);
    }
  }

  const streamMap = [
    { key: "update", defRe: /void\s+BinkVideoStream\s*::\s*update\s*\(\s*void\s*\)/,
      defLine: 325, callRe: /\bBinkWait\s*\(/, callLine: 327, callKey: "BinkWait" },
    { key: "isFrameReady", defRe: /Bool\s+BinkVideoStream\s*::\s*isFrameReady\s*\(\s*void\s*\)/,
      defLine: 334, callRe: /\bBinkWait\s*\(/, callLine: 336, callKey: "BinkWait" },
    { key: "frameDecompress", defRe: /void\s+BinkVideoStream\s*::\s*frameDecompress\s*\(\s*void\s*\)/,
      defLine: 343, callRe: /\bBinkDoFrame\s*\(/, callLine: 345, callKey: "BinkDoFrame" },
    { key: "frameRender", defRe: /void\s+BinkVideoStream\s*::\s*frameRender\s*\(\s*VideoBuffer\s*\*\s*buffer\s*\)/,
      defLine: 352, callRe: /\bBinkCopyToBuffer\s*\(/, callLine: 385, callKey: "BinkCopyToBuffer" },
    { key: "frameNext", defRe: /void\s+BinkVideoStream\s*::\s*frameNext\s*\(\s*void\s*\)/,
      defLine: 397, callRe: /\bBinkNextFrame\s*\(/, callLine: 399, callKey: "BinkNextFrame" },
    { key: "frameGoto", defRe: /void\s+BinkVideoStream\s*::\s*frameGoto\s*\(\s*Int\s+index\s*\)/,
      defLine: 424, callRe: /\bBinkGoto\s*\(/, callLine: 426, callKey: "BinkGoto" },
    { key: "height", defRe: /Int\s+BinkVideoStream\s*::\s*height\s*\(\s*void\s*\)/,
      defLine: 433, callRe: /m_handle\s*->\s*Height/, callLine: 435, callKey: "Height" },
    { key: "width", defRe: /Int\s+BinkVideoStream\s*::\s*width\s*\(\s*void\s*\)/,
      defLine: 442, callRe: /m_handle\s*->\s*Width/, callLine: 444, callKey: "Width" },
    { key: "frameIndex", defRe: /Int\s+BinkVideoStream\s*::\s*frameIndex\s*\(\s*void\s*\)/,
      defLine: 406, callRe: /m_handle\s*->\s*FrameNum/, callLine: 408, callKey: "FrameNum" },
    { key: "frameCount", defRe: /Int\s+BinkVideoStream\s*::\s*frameCount\s*\(\s*void\s*\)/,
      defLine: 415, callRe: /m_handle\s*->\s*Frames/, callLine: 417, callKey: "Frames" },
  ];
  facts.stream = facts.stream || {};
  for (const m of streamMap) {
    const def = lineNumber(cpp.lines, (line) => m.defRe.test(line));
    facts.stream[m.key] = { defLine: def, callKey: m.callKey };
    if (def !== m.defLine) {
      errors.push(`BinkVideoStream::${m.key}: definition expected at line ${m.defLine} but found ${def}`);
    }
    if (def > 0) {
      const range = functionBodyLineRange(cpp.lines, def);
      const call = range
        ? firstMatchInRange(cpp.lines, range.start, range.end, m.callRe)
        : -1;
      facts.stream[m.key].callLine = call;
      if (call !== m.callLine) {
        errors.push(`BinkVideoStream::${m.key}: ${m.callKey} expected at line ${m.callLine} but found ${call}`);
      }
    }
  }

  // --- Header facts ---
  facts.header = {};
  assertExact(errors, facts.header, "includeBinkLine",
    lineNumber(h.lines, (line) => /#include\s+"bink\.h"/.test(line)), 53,
    'BinkVideoPlayer.h #include "bink.h"');
  assertExact(errors, facts.header, "classBinkVideoStreamLine",
    lineNumber(h.lines, (line) => /\bclass\s+BinkVideoStream\s*:\s*public\s+VideoStream\b/.test(line)), 69,
    "class BinkVideoStream");
  assertExact(errors, facts.header, "mHandleDeclLine",
    lineNumber(h.lines, (line) => /\bHBINK\b/.test(line)), 75,
    "BinkVideoPlayer.h HBINK m_handle declaration");
  assertExact(errors, facts.header, "classBinkVideoPlayerLine",
    lineNumber(h.lines, (line) => /\bclass\s+BinkVideoPlayer\s*:\s*public\s+VideoPlayer\b/.test(line)), 106,
    "class BinkVideoPlayer");
  assertExact(errors, facts.header, "createStreamDeclLine",
    lineNumber(h.lines, (line) => /VideoStreamInterface\s*\*\s*createStream\s*\(\s*HBINK\s+handle\s*\)/.test(line)), 111,
    "BinkVideoPlayer.h createStream declaration");
  assertExact(errors, facts.header, "initDeclLine",
    lineNumber(h.lines, (line) => /virtual\s+void\s+init\s*\(\s*void\s*\)/.test(line)), 116,
    "BinkVideoPlayer.h init declaration");
  assertExact(errors, facts.header, "deinitDeclLine",
    lineNumber(h.lines, (line) => /virtual\s+void\s+deinit\s*\(\s*void\s*\)/.test(line)), 120,
    "BinkVideoPlayer.h deinit declaration");
  assertExact(errors, facts.header, "openDeclLine",
    lineNumber(h.lines, (line) => /virtual\s+VideoStreamInterface\s*\*\s*open\s*\(\s*AsciiString\s+movieTitle\s*\)/.test(line)), 130,
    "BinkVideoPlayer.h open declaration");
  assertExact(errors, facts.header, "initializeBinkWithMilesDeclLine",
    lineNumber(h.lines, (line) => /virtual\s+void\s+initializeBinkWithMiles\s*\(\s*void\s*\)/.test(line)), 134,
    "BinkVideoPlayer.h initializeBinkWithMiles declaration");

  // --- Shim header facts ---
  facts.shim = {};
  assertExact(errors, facts.shim, "structBinkLine",
    lineNumber(shim.lines, (line) => /\bstruct\s+BINK\b/.test(line)), 7,
    "shim bink.h struct BINK");
  const shimFieldMap = { Width: 9, Height: 10, Frames: 11, FrameNum: 12 };
  facts.shim.structFields = {};
  for (const [field, expectedLine] of Object.entries(shimFieldMap)) {
    const ln = lineNumber(shim.lines, (line) => new RegExp(`\\bu32\\s+${field}\\s*;`).test(line));
    facts.shim.structFields[field] = ln;
    if (ln !== expectedLine) {
      errors.push(`shim bink.h: BINK field ${field} expected at line ${expectedLine} but found ${ln}`);
    }
  }
  assertExact(errors, facts.shim, "hbinkLine",
    lineNumber(shim.lines, (line) => /using\s+HBINK\s*=\s*BINK\s*\*/.test(line)), 15,
    "shim bink.h using HBINK");
  const constMap = { BINKPRELOADALL: 17, BINKSURFACE24: 18, BINKSURFACE32: 19, BINKSURFACE555: 20, BINKSURFACE565: 21 };
  facts.shim.constants = {};
  for (const [name, expectedLine] of Object.entries(constMap)) {
    const ln = lineNumber(shim.lines, (line) => new RegExp(`\\bconstexpr\\s+u32\\s+${name}\\s*=`).test(line));
    facts.shim.constants[name] = ln;
    if (ln !== expectedLine) {
      errors.push(`shim bink.h: constant ${name} expected at line ${expectedLine} but found ${ln}`);
    }
  }
  const shimApi = [
    { name: "BinkOpen", line: 24 },
    { name: "BinkClose", line: 25 },
    { name: "BinkWait", line: 26 },
    { name: "BinkDoFrame", line: 27 },
    { name: "BinkNextFrame", line: 28 },
    { name: "BinkGoto", line: 29 },
    { name: "BinkCopyToBuffer", line: 30 },
    { name: "BinkSetVolume", line: 31 },
    { name: "BinkSoundUseDirectSound", line: 32 },
    { name: "BinkSetSoundTrack", line: 33 },
  ];
  facts.shim.apiDeclarations = {};
  for (const { name, line: expectedLine } of shimApi) {
    const ln = lineNumber(shim.lines, (line) => new RegExp(`\\b${name}\\s*\\(`).test(line));
    facts.shim.apiDeclarations[name] = ln;
    if (ln !== expectedLine) {
      errors.push(`shim bink.h: ${name} declaration expected at line ${expectedLine} but found ${ln}`);
    }
  }
  const shimExtensionApi = [
    { name: "WasmBinkProviderCanDecodeFrames", line: 34 },
    { name: "WasmBinkProviderHasBrowserVideo", line: 35 },
    { name: "WasmBinkProviderGetBrowserVideoPath", line: 36 },
    { name: "WasmBinkProviderGetBrowserVideoCodec", line: 37 },
    { name: "WasmBinkProviderGetBrowserAudioCodec", line: 38 },
    { name: "WasmBinkProviderGetBrowserVideoFrameCount", line: 39 },
    { name: "WasmBinkProviderGetBrowserVideoDurationSeconds", line: 40 },
  ];
  facts.shim.providerExtensionDeclarations = {};
  for (const { name, line: expectedLine } of shimExtensionApi) {
    const ln = lineNumber(shim.lines, (line) => new RegExp(`\\b${name}\\s*\\(`).test(line));
    facts.shim.providerExtensionDeclarations[name] = ln;
    if (ln !== expectedLine) {
      errors.push(`shim bink.h: ${name} provider extension expected at line ${expectedLine} but found ${ln}`);
    }
  }
  // The shim header provides API declarations; definitions live in the browser
  // provider source below. The struct BINK definition is a type, not a function
  // body, and is expected.
  let apiBodyViolation = false;
  for (const { name, line: expectedLine } of shimApi) {
    const line = shim.lines[expectedLine - 1];
    if (line && !/;\s*$/.test(line.trim())) {
      apiBodyViolation = true;
      errors.push(`shim bink.h: ${name} at line ${expectedLine} is not a declaration (no trailing ';')`);
    }
  }
  for (const { name, line: expectedLine } of shimExtensionApi) {
    const line = shim.lines[expectedLine - 1];
    if (line && !/;\s*$/.test(line.trim())) {
      apiBodyViolation = true;
      errors.push(`shim bink.h: ${name} at line ${expectedLine} is not a declaration (no trailing ';')`);
    }
  }
  facts.shim.headerDeclarationsOnly = !apiBodyViolation;

  // --- Browser Bink provider facts ---
  assertPresent(errors, facts.provider, "handleStructLine",
    lineNumber(provider.lines, (line) => /\bstruct\s+BrowserBinkHandle\b/.test(line)),
    "provider BrowserBinkHandle struct");
  assertPresent(errors, facts.provider, "publicHandleFieldLine",
    lineNumber(provider.lines, (line) => /\bBINK\s+public_handle\s*=/.test(line)),
    "provider public BINK handle field");
  assertPresent(errors, facts.provider, "headerBytesLine",
    lineNumber(provider.lines, (line) => /kBikHeaderBytes\s*=\s*44/.test(line)),
    "provider BIK header byte count");
  assertPresent(errors, facts.provider, "manifestNameLine",
    lineNumber(provider.lines, (line) => /kBrowserVideoManifestName\s*=\s*"bink-browser-video-manifest\.json"/.test(line)),
    "provider browser video manifest filename");
  assertPresent(errors, facts.provider, "manifestDirLine",
    lineNumber(provider.lines, (line) => /kBrowserVideoManifestDir\s*=\s*"artifacts\/browser-video\/bink"/.test(line)),
    "provider browser video manifest directory");
  const sidecarFieldMap = [
    "browser_video_path",
    "browser_video_codec",
    "browser_audio_codec",
    "browser_video_frame_count",
    "browser_video_duration_seconds",
    "browser_video_available",
  ];
  facts.provider.sidecarFields = {};
  for (const field of sidecarFieldMap) {
    const ln = lineNumber(provider.lines, (line) => new RegExp(`\\b${field}\\b`).test(line));
    facts.provider.sidecarFields[field] = ln;
    if (ln === -1) {
      errors.push(`provider sidecar field ${field} not found`);
    }
  }
  assertPresent(errors, facts.provider, "parseHeaderLine",
    lineNumber(provider.lines, (line) => /\bparse_bik_header\s*\(/.test(line)),
    "provider parse_bik_header");
  assertPresent(errors, facts.provider, "manifestCandidatePathsLine",
    lineNumber(provider.lines, (line) => /\bmanifest_candidate_paths\s*\(/.test(line)),
    "provider manifest_candidate_paths");
  assertPresent(errors, facts.provider, "parseManifestPayloadLine",
    lineNumber(provider.lines, (line) => /\bparse_manifest_payload\s*\(/.test(line)),
    "provider parse_manifest_payload");
  assertPresent(errors, facts.provider, "attachBrowserVideoMetadataLine",
    lineNumber(provider.lines, (line) => /\battach_browser_video_metadata\s*\(/.test(line)),
    "provider attach_browser_video_metadata");
  const browserBridgeFacts = {
    openHookLine: lineNumber(provider.lines, (line) => /cncPortBinkVideoOpen/.test(line)),
    eventHookLine: lineNumber(provider.lines, (line) => /cncPortBinkVideoEvent/.test(line)),
    closeHookLine: lineNumber(provider.lines, (line) => /cncPortBinkVideoClose/.test(line)),
    notifyOpenLine: lineNumber(provider.lines, (line) => /\bnotify_browser_video_open\s*\(/.test(line)),
    notifyEventLine: lineNumber(provider.lines, (line) => /\bnotify_browser_video_event\s*\(/.test(line)),
    notifyCloseLine: lineNumber(provider.lines, (line) => /\bnotify_browser_video_close\s*\(/.test(line)),
  };
  facts.provider.browserBridge = browserBridgeFacts;
  for (const [key, line] of Object.entries(browserBridgeFacts)) {
    if (line === -1) {
      errors.push(`provider browser bridge missing ${key}`);
    }
  }

  const parseHeaderLine = facts.provider.parseHeaderLine;
  const parseHeaderBody = functionBodyLineRange(provider.lines, parseHeaderLine);
  if (!parseHeaderBody) {
    errors.push("provider parse_bik_header body not found");
  } else {
    const sizeFieldLine = firstMatchInRange(provider.lines, parseHeaderBody.start, parseHeaderBody.end, /size_field\s*=\s*read_le32\(&header\[4\]\)/);
    const framesLine = firstMatchInRange(provider.lines, parseHeaderBody.start, parseHeaderBody.end, /Frames\s*=\s*read_le32\(&header\[8\]\)/);
    const widthLine = firstMatchInRange(provider.lines, parseHeaderBody.start, parseHeaderBody.end, /Width\s*=\s*read_le32\(&header\[20\]\)/);
    const heightLine = firstMatchInRange(provider.lines, parseHeaderBody.start, parseHeaderBody.end, /Height\s*=\s*read_le32\(&header\[24\]\)/);
    const fpsNumLine = firstMatchInRange(provider.lines, parseHeaderBody.start, parseHeaderBody.end, /fps_numerator\s*=\s*read_le32\(&header\[28\]\)/);
    const fpsDenLine = firstMatchInRange(provider.lines, parseHeaderBody.start, parseHeaderBody.end, /fps_denominator\s*=\s*read_le32\(&header\[32\]\)/);
    const sizeCheckLine = firstMatchInRange(provider.lines, parseHeaderBody.start, parseHeaderBody.end, /size_field\s*==\s*handle\.file_size\s*-\s*8/);
    facts.provider.headerOffsets = {
      sizeFieldLine,
      framesLine,
      widthLine,
      heightLine,
      fpsNumLine,
      fpsDenLine,
      sizeCheckLine,
    };
    for (const [key, line] of Object.entries(facts.provider.headerOffsets)) {
      if (line === -1) {
        errors.push(`provider parse_bik_header missing ${key}`);
      }
    }
  }

  const providerApi = [
    "BinkOpen",
    "BinkClose",
    "BinkWait",
    "BinkDoFrame",
    "BinkNextFrame",
    "BinkGoto",
    "BinkCopyToBuffer",
    "BinkSetVolume",
    "BinkSoundUseDirectSound",
    "BinkSetSoundTrack",
    "WasmBinkProviderCanDecodeFrames",
    "WasmBinkProviderHasBrowserVideo",
    "WasmBinkProviderGetBrowserVideoPath",
    "WasmBinkProviderGetBrowserVideoCodec",
    "WasmBinkProviderGetBrowserAudioCodec",
    "WasmBinkProviderGetBrowserVideoFrameCount",
    "WasmBinkProviderGetBrowserVideoDurationSeconds",
  ];
  facts.provider.apiDefinitions = {};
  for (const name of providerApi) {
    const ln = lineNumber(provider.lines, (line) => new RegExp(`\\b${name}\\s*\\(`).test(line) && !/;/.test(line));
    facts.provider.apiDefinitions[name] = ln;
    if (ln === -1) {
      errors.push(`provider ${name} definition not found`);
    }
  }

  const copyBody = functionBodyLineRange(provider.lines, facts.provider.apiDefinitions.BinkCopyToBuffer);
  facts.provider.copyToBufferDecodePendingLine = copyBody
    ? firstMatchInRange(provider.lines, copyBody.start, copyBody.end, /Frame decode\/copy remains/)
    : -1;
  if (facts.provider.copyToBufferDecodePendingLine === -1) {
    errors.push("provider BinkCopyToBuffer must document that direct frame decode/copy remains hook-gated");
  }
  facts.provider.copyToBufferBrowserHookLine = copyBody
    ? firstMatchInRange(provider.lines, copyBody.start, copyBody.end, /copy_browser_video_frame_to_buffer\(\*handle/)
    : -1;
  if (facts.provider.copyToBufferBrowserHookLine === -1) {
    errors.push("provider BinkCopyToBuffer must delegate browser sidecar pixel copies through the copy bridge");
  }
  const decodeReadyBody = functionBodyLineRange(provider.lines, facts.provider.apiDefinitions.WasmBinkProviderCanDecodeFrames);
  facts.provider.canDecodeFramesHookGateLine = decodeReadyBody
    ? firstMatchInRange(provider.lines, decodeReadyBody.start, decodeReadyBody.end, /wasm_bink_browser_can_copy_frames\s*\(\s*\)/)
    : -1;
  if (facts.provider.canDecodeFramesHookGateLine === -1) {
    errors.push("provider decode readiness must be gated on the browser sidecar copy hook");
  }
  const parseManifestBody = functionBodyLineRange(provider.lines, facts.provider.parseManifestPayloadLine);
  if (!parseManifestBody) {
    errors.push("provider parse_manifest_payload body not found");
  } else {
    const sidecarChecks = {
      sourceFileMatchLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_string_value\(section,\s*"sourceFile"\)\s*!=\s*source_file/),
      framesLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_u32_value\(section,\s*"frames"/),
      outputFramesLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_u32_value\(section,\s*"outputFrameCount"/),
      widthLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_u32_value\(section,\s*"width"/),
      heightLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_u32_value\(section,\s*"height"/),
      durationLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_double_value\(section,\s*"outputDurationSeconds"/),
      outputFileLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_string_value\(section,\s*"outputFile"\)/),
      outputVideoCodecLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_string_value\(section,\s*"outputVideoCodec"\)/),
      outputAudioCodecLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /json_first_array_string\(section,\s*"outputAudioCodecs"\)/),
      handleFieldValidationLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /frames\s*!=\s*handle\.public_handle\.Frames/),
      browserVideoAvailableLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /browser_video_available\s*=\s*true/),
      relativeSidecarPathLine: firstMatchInRange(provider.lines, parseManifestBody.start, parseManifestBody.end, /kBrowserVideoManifestDir\)\s*\+\s*"\/"\s*\+\s*output_file/),
    };
    facts.provider.sidecarManifestParsing = sidecarChecks;
    for (const [key, line] of Object.entries(sidecarChecks)) {
      if (line === -1) {
        errors.push(`provider parse_manifest_payload missing ${key}`);
      }
    }
  }
  const binkOpenBody = functionBodyLineRange(provider.lines, facts.provider.apiDefinitions.BinkOpen);
  facts.provider.binkOpenAttachSidecarLine = binkOpenBody
    ? firstMatchInRange(provider.lines, binkOpenBody.start, binkOpenBody.end, /attach_browser_video_metadata\(path,\s*\*handle\)/)
    : -1;
  if (facts.provider.binkOpenAttachSidecarLine === -1) {
    errors.push("provider BinkOpen must attach browser sidecar metadata after header parse");
  }
  facts.provider.binkOpenNotifyBrowserLine = binkOpenBody
    ? firstMatchInRange(provider.lines, binkOpenBody.start, binkOpenBody.end, /notify_browser_video_open\(\*handle\)/)
    : -1;
  if (facts.provider.binkOpenNotifyBrowserLine === -1) {
    errors.push("provider BinkOpen must notify the browser sidecar bridge after metadata attach");
  }
  const lifecycleNotifications = {
    close: { api: "BinkClose", pattern: /notify_browser_video_close\(\*handle\)/ },
    doFrame: { api: "BinkDoFrame", pattern: /notify_browser_video_event\(\*handle,\s*"doFrame"\)/ },
    nextFrame: { api: "BinkNextFrame", pattern: /notify_browser_video_event\(\*handle,\s*"nextFrame"\)/ },
    gotoFrame: { api: "BinkGoto", pattern: /notify_browser_video_event\(\*handle,\s*"gotoFrame"/ },
    copyPending: { api: "BinkCopyToBuffer", pattern: /notify_browser_video_event\(\*handle,\s*"copyPending"/ },
    copyComplete: { api: "BinkCopyToBuffer", pattern: /notify_browser_video_event\(\*handle,\s*"copyComplete"/ },
  };
  facts.provider.lifecycleNotifications = {};
  for (const [name, check] of Object.entries(lifecycleNotifications)) {
    const body = functionBodyLineRange(provider.lines, facts.provider.apiDefinitions[check.api]);
    const line = body ? firstMatchInRange(provider.lines, body.start, body.end, check.pattern) : -1;
    facts.provider.lifecycleNotifications[name] = line;
    if (line === -1) {
      errors.push(`provider ${check.api} must notify browser sidecar lifecycle event ${name}`);
    }
  }
  facts.provider.runtimeDecode = false;

  // --- Focused sidecar smoke facts ---
  assertPresent(errors, facts.smoke, "sidecarSmokeExportLine",
    lineNumber(smoke.lines, (line) => /\brun_bink_video_sidecar_provider_smoke\s*\(/.test(line)),
    "C++ sidecar provider smoke export");
  assertPresent(errors, facts.smoke, "sidecarCopyBridgeSmokeExportLine",
    lineNumber(smoke.lines, (line) => /\brun_bink_video_sidecar_copy_bridge_smoke\s*\(/.test(line)),
    "C++ sidecar provider copy bridge smoke export");
  assertPresent(errors, facts.smoke, "originalPathResolutionLine",
    lineNumber(smoke.lines, (line) => /Data\\\\English\\\\Movies\\\\VS_small\.bik/.test(line)),
    "C++ sidecar provider smoke original-style path resolution");
  assertPresent(errors, facts.smoke, "gcSidecarLine",
    lineNumber(smoke.lines, (line) => /artifacts\/browser-video\/bink\/GC_Background\.webm/.test(line)),
    "C++ sidecar provider smoke GC sidecar expectation");
  assertPresent(errors, facts.smoke, "vsSidecarLine",
    lineNumber(smoke.lines, (line) => /artifacts\/browser-video\/bink\/VS_small\.webm/.test(line)),
    "C++ sidecar provider smoke VS sidecar expectation");
  assertPresent(errors, facts.smoke, "decodeReadyFalseLine",
    lineNumber(smoke.lines, (line) => /WasmBinkProviderCanDecodeFrames\(\)\s*==\s*0/.test(line)),
    "C++ sidecar provider smoke keeps decodeReady false");
  assertPresent(errors, facts.smoke, "copyBridgeDecodeReadyLine",
    lineNumber(smoke.lines, (line) => /WasmBinkProviderCanDecodeFrames\(\)\s*==\s*1/.test(line)),
    "C++ sidecar copy bridge smoke requires hook-gated decodeReady true");
  assertPresent(errors, facts.smoke, "copyBridgeBufferChangedLine",
    lineNumber(smoke.lines, (line) => /any_nonzero/.test(line)),
    "C++ sidecar copy bridge smoke verifies destination memory changed");
  const sidecarLifecycleSmoke = {
    doFrameLine: lineNumber(smoke.lines, (line) => /\bBinkDoFrame\s*\(\s*bink\s*\)/.test(line)),
    copyPendingLine: lineNumber(smoke.lines, (line) => /\bBinkCopyToBuffer\s*\(\s*bink\s*,/.test(line)),
    nextFrameLine: lineNumber(smoke.lines, (line) => /\bBinkNextFrame\s*\(\s*bink\s*\)/.test(line)),
    gotoFrameLine: lineNumber(smoke.lines, (line) => /\bBinkGoto\s*\(\s*bink\s*,\s*expected_frames/.test(line)),
  };
  facts.smoke.sidecarLifecycle = sidecarLifecycleSmoke;
  for (const [key, line] of Object.entries(sidecarLifecycleSmoke)) {
    if (line === -1) {
      errors.push(`C++ sidecar provider smoke missing lifecycle call ${key}`);
    }
  }

  // --- Original BinkVideoPlayer runtime smoke facts ---
  const runtimeSmokeFacts = {
    binkHeaderLine: lineNumber(runtimeSmoke.lines, (line) => /VideoDevice\/Bink\/BinkVideoPlayer\.h/.test(line)),
    writableGlobalDataLine: lineNumber(runtimeSmoke.lines, (line) => /GlobalData\s+\*TheWritableGlobalData\s*=/.test(line)),
    smokeAudioManagerLine: lineNumber(runtimeSmoke.lines, (line) => /class\s+SmokeAudioManager\s+final\s*:\s*public\s+AudioManager/.test(line)),
    smokeVideoBufferLine: lineNumber(runtimeSmoke.lines, (line) => /class\s+SmokeVideoBuffer\s+final\s*:\s*public\s+VideoBuffer/.test(line)),
    playerInitLine: lineNumber(runtimeSmoke.lines, (line) => /player->init\(\)/.test(line)),
    gcRegistrationLine: lineNumber(runtimeSmoke.lines, (line) => /add_video\(\*player,\s*"GC_Background",\s*"GC_Background"\)/.test(line)),
    vsRegistrationLine: lineNumber(runtimeSmoke.lines, (line) => /add_video\(\*player,\s*"VS_small",\s*"VS_small"\)/.test(line)),
    decodeReadyHookGateLine: lineNumber(runtimeSmoke.lines, (line) => /WasmBinkProviderCanDecodeFrames\(\)\s*==\s*\(expect_decode_ready\s*\?\s*1\s*:\s*0\)/.test(line)),
    copiedPixelsCheckLine: lineNumber(runtimeSmoke.lines, (line) => /buffer\.hasCopiedPixels\(\)/.test(line)),
    sidecarCopyExportLine: lineNumber(runtimeSmoke.lines, (line) => /run_bink_videoplayer_sidecar_copy_bridge_smoke/.test(line)),
    browserCopyImplLine: lineNumber(runtimeSmoke.lines, (line) => /run_runtime_smoke\(true,\s*true\)/.test(line)),
    nodeNoHookMainLine: lineNumber(runtimeSmoke.lines, (line) => /run_runtime_smoke\(false,\s*false\)/.test(line)),
    noMainGuardLine: lineNumber(runtimeSmoke.lines, (line) => /BINK_VIDEOPLAYER_RUNTIME_SMOKE_NO_MAIN/.test(line)),
    openGcLine: lineNumber(runtimeSmoke.lines, (line) => /player->open\(AsciiString\("GC_Background"\)\)/.test(line)),
    loadVsLine: lineNumber(runtimeSmoke.lines, (line) => /player->load\(AsciiString\("VS_small"\)\)/.test(line)),
    frameDecompressLine: lineNumber(runtimeSmoke.lines, (line) => /stream->frameDecompress\(\)/.test(line)),
    frameRenderLine: lineNumber(runtimeSmoke.lines, (line) => /stream->frameRender\(&buffer\)/.test(line)),
    frameNextLine: lineNumber(runtimeSmoke.lines, (line) => /stream->frameNext\(\)/.test(line)),
    frameGotoLastLine: lineNumber(runtimeSmoke.lines, (line) => /stream->frameGoto\(expected_frames\)/.test(line)),
    streamCloseLine: lineNumber(runtimeSmoke.lines, (line) => /stream->close\(\)/.test(line)),
  };
  facts.runtimeSmoke = runtimeSmokeFacts;
  for (const [key, line] of Object.entries(runtimeSmokeFacts)) {
    if (line === -1) {
      errors.push(`BinkVideoPlayer runtime smoke missing ${key}`);
    }
  }
  assertOrder(errors, runtimeSmokeFacts.playerInitLine, runtimeSmokeFacts.gcRegistrationLine,
    "BinkVideoPlayer runtime smoke should initialize before manual video registration");
  assertOrder(errors, runtimeSmokeFacts.openGcLine, runtimeSmokeFacts.loadVsLine,
    "BinkVideoPlayer runtime smoke should exercise open before load");
  assertOrder(errors, runtimeSmokeFacts.frameDecompressLine, runtimeSmokeFacts.frameRenderLine,
    "BinkVideoPlayer runtime smoke should decompress before render");
  assertOrder(errors, runtimeSmokeFacts.frameRenderLine, runtimeSmokeFacts.frameNextLine,
    "BinkVideoPlayer runtime smoke should render before advancing");
  assertOrder(errors, runtimeSmokeFacts.frameNextLine, runtimeSmokeFacts.frameGotoLastLine,
    "BinkVideoPlayer runtime smoke should advance before seeking");

  assertPresent(errors, facts.sidecarRunner, "manifestPreflightLine",
    lineNumber(sidecarRunner.lines, (line) => /bink-browser-video-manifest\.json/.test(line)),
    "Node sidecar provider runner manifest preflight");
  assertPresent(errors, facts.sidecarRunner, "ccallLine",
    lineNumber(sidecarRunner.lines, (line) => /run_bink_video_sidecar_provider_smoke/.test(line)),
    "Node sidecar provider runner ccall");

  assertPresent(errors, facts.browserHarness, "browserSmokeModuleLine",
    lineNumber(browserHarness.lines, (line) => /createBinkVideoProviderBrowserSmokeModule/.test(line)),
    "browser sidecar harness loads provider smoke module");
  assertPresent(errors, facts.browserHarness, "manifestMountLine",
    lineNumber(browserHarness.lines, (line) => /bink-browser-video-manifest\.json/.test(line)),
    "browser sidecar harness mounts manifest into MEMFS");
  assertPresent(errors, facts.browserHarness, "providerCcallLine",
    lineNumber(browserHarness.lines, (line) => /run_bink_video_sidecar_provider_smoke/.test(line)),
    "browser sidecar harness runs provider smoke");
  assertPresent(errors, facts.browserHarness, "copyBridgeCcallLine",
    lineNumber(browserHarness.lines, (line) => /run_bink_video_sidecar_copy_bridge_smoke/.test(line)),
    "browser sidecar harness runs copy bridge smoke");
  assertPresent(errors, facts.browserHarness, "binkOpenHookLine",
    lineNumber(browserHarness.lines, (line) => /cncPortBinkVideoOpen/.test(line)),
    "browser sidecar harness installs Bink open hook");
  assertPresent(errors, facts.browserHarness, "binkEventHookLine",
    lineNumber(browserHarness.lines, (line) => /cncPortBinkVideoEvent/.test(line)),
    "browser sidecar harness installs Bink lifecycle hook");
  assertPresent(errors, facts.browserHarness, "binkCloseHookLine",
    lineNumber(browserHarness.lines, (line) => /cncPortBinkVideoClose/.test(line)),
    "browser sidecar harness installs Bink close hook");
  assertPresent(errors, facts.browserHarness, "binkCopyHookLine",
    lineNumber(browserHarness.lines, (line) => /cncPortBinkCopyToBuffer/.test(line)),
    "browser sidecar harness installs Bink copy hook");
  assertPresent(errors, facts.browserHarness, "binkOpenCountLine",
    lineNumber(browserHarness.lines, (line) => /openEvents\.length\s*!==\s*3/.test(line)),
    "browser sidecar harness validates Bink open count");
  assertPresent(errors, facts.browserHarness, "binkLifecycleCountLine",
    lineNumber(browserHarness.lines, (line) => /Expected three Bink browser \$\{type\} events/.test(line)),
    "browser sidecar harness validates Bink lifecycle event counts");
  assertPresent(errors, facts.browserHarness, "binkCopyCompleteCountLine",
    lineNumber(browserHarness.lines, (line) => /copyCompleteEvents\.length\s*!==\s*3/.test(line)),
    "browser sidecar harness validates Bink copyComplete event counts");
  assertPresent(errors, facts.browserHarness, "canvasReadbackLine",
    lineNumber(browserHarness.lines, (line) => /nonTransparentSamples/.test(line)),
    "browser sidecar harness validates canvas samples");
  assertPresent(errors, facts.browserHarness, "screenshotLine",
    lineNumber(browserHarness.lines, (line) => /harness-smoke-bink-provider-sidecar-video\.png/.test(line)),
    "browser sidecar harness screenshot output");

  const runtimeBrowserHarnessFacts = {
    moduleLine: lineNumber(runtimeBrowserHarness.lines, (line) => /createBinkVideoPlayerBrowserRuntimeSmokeModule/.test(line)),
    manifestMountLine: lineNumber(runtimeBrowserHarness.lines, (line) => /bink-browser-video-manifest\.json/.test(line)),
    copyHookLine: lineNumber(runtimeBrowserHarness.lines, (line) => /cncPortBinkCopyToBuffer/.test(line)),
    runtimeCcallLine: lineNumber(runtimeBrowserHarness.lines, (line) => /run_bink_videoplayer_sidecar_copy_bridge_smoke/.test(line)),
    openCountLine: lineNumber(runtimeBrowserHarness.lines, (line) => /openEvents\.length\s*!==\s*2/.test(line)),
    copyEventCountLine: lineNumber(runtimeBrowserHarness.lines, (line) => /copyEvents\.length\s*!==\s*2/.test(line)),
    copyCompleteCountLine: lineNumber(runtimeBrowserHarness.lines, (line) => /Expected two BinkVideoPlayer browser \$\{type\} events/.test(line)),
    nextFrameCountLine: lineNumber(runtimeBrowserHarness.lines, (line) => /nextFrameCount\s*!==\s*2/.test(line)),
    gotoFrameCountLine: lineNumber(runtimeBrowserHarness.lines, (line) => /gotoFrameCount\s*!==\s*4/.test(line)),
    screenshotLine: lineNumber(runtimeBrowserHarness.lines, (line) => /harness-smoke-bink-videoplayer-sidecar-copy\.png/.test(line)),
  };
  facts.runtimeBrowserHarness = runtimeBrowserHarnessFacts;
  for (const [key, line] of Object.entries(runtimeBrowserHarnessFacts)) {
    if (line === -1) {
      errors.push(`BinkVideoPlayer browser sidecar harness missing ${key}`);
    }
  }

  // --- CMake compile frontier target/source ---
  facts.cmake = {};
  assertExact(errors, facts.cmake, "targetDefLine",
    lineNumber(cmake.lines, (line) => /add_library\s*\(\s*zh_bink_video_device_compile_frontier\b/.test(line)), 2468,
    "CMake zh_bink_video_device_compile_frontier target");
  assertExact(errors, facts.cmake, "targetSourceLine",
    lineNumber(cmake.lines, (line) => /BinkVideoPlayer\.cpp/.test(line)), 2469,
    "CMake BinkVideoPlayer.cpp source");
  assertPresent(errors, facts.cmake, "providerTargetLine",
    lineNumber(cmake.lines, (line) => /add_library\s*\(\s*zh_browser_bink\b/.test(line)),
    "CMake zh_browser_bink target");
  assertPresent(errors, facts.cmake, "providerSourceLine",
    lineNumber(cmake.lines, (line) => /src\/wasm_bink_provider\.cpp/.test(line)),
    "CMake wasm_bink_provider source");
  assertPresent(errors, facts.cmake, "providerLinkLine",
    lineNumber(cmake.lines, (line) => /target_link_libraries\s*\(\s*zh_bink_video_device_compile_frontier\s+PUBLIC/.test(line)),
    "CMake Bink frontier links zh_browser_bink");
  const nodeProviderSmokeTargetLine = lineNumber(cmake.lines, (line) => /add_executable\s*\(\s*bink-video-provider-smoke\b/.test(line));
  assertPresent(errors, facts.cmake, "nodeProviderSmokeTargetLine",
    nodeProviderSmokeTargetLine,
    "CMake node provider smoke target");
  const browserProviderSmokeTargetLine = lineNumber(cmake.lines, (line) => /add_executable\s*\(\s*bink-video-provider-browser-smoke\b/.test(line));
  assertPresent(errors, facts.cmake, "providerSmokeExportLine",
    nodeProviderSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(
          cmake.lines,
          nodeProviderSmokeTargetLine,
          nodeProviderSmokeTargetLine + 40,
          /_run_bink_video_provider_smoke.*_run_bink_video_sidecar_provider_smoke.*_run_bink_video_sidecar_copy_bridge_smoke/,
        ),
    "CMake node provider smoke exports sidecar and copy bridge entrypoints");
  assertPresent(errors, facts.cmake, "browserProviderSmokeTargetLine",
    browserProviderSmokeTargetLine,
    "CMake browser provider sidecar smoke target");
  assertPresent(errors, facts.cmake, "browserProviderSmokeExportNameLine",
    browserProviderSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(
          cmake.lines,
          browserProviderSmokeTargetLine,
          browserProviderSmokeTargetLine + 40,
          /createBinkVideoProviderBrowserSmokeModule/,
        ),
    "CMake browser provider sidecar smoke export name");
  assertPresent(errors, facts.cmake, "browserProviderSmokeExportLine",
    browserProviderSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(
          cmake.lines,
          browserProviderSmokeTargetLine,
          browserProviderSmokeTargetLine + 40,
          /_run_bink_video_provider_smoke.*_run_bink_video_sidecar_provider_smoke.*_run_bink_video_sidecar_copy_bridge_smoke/,
        ),
    "CMake browser provider smoke exports sidecar and copy bridge entrypoints");
  assertPresent(errors, facts.cmake, "browserProviderSmokeRuntimeMethodsLine",
    browserProviderSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(
          cmake.lines,
          browserProviderSmokeTargetLine,
          browserProviderSmokeTargetLine + 40,
          /EXPORTED_RUNTIME_METHODS=\['ccall','FS'\]/,
        ),
    "CMake browser provider sidecar smoke exports ccall and FS");
  const runtimeSmokeTargetLine = lineNumber(cmake.lines, (line) => /add_executable\s*\(\s*bink-videoplayer-runtime-smoke\b/.test(line));
  assertPresent(errors, facts.cmake, "runtimeSmokeTargetLine",
    runtimeSmokeTargetLine,
    "CMake BinkVideoPlayer runtime smoke target");
  assertPresent(errors, facts.cmake, "runtimeSmokeSourceLine",
    runtimeSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeSmokeTargetLine, runtimeSmokeTargetLine + 10, /tests\/bink_videoplayer_runtime_smoke\.cpp/),
    "CMake BinkVideoPlayer runtime smoke source");
  assertPresent(errors, facts.cmake, "runtimeSmokeBinkFrontierLinkLine",
    runtimeSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeSmokeTargetLine, runtimeSmokeTargetLine + 35, /zh_bink_video_device_compile_frontier/),
    "CMake BinkVideoPlayer runtime smoke links Bink frontier");
  assertPresent(errors, facts.cmake, "runtimeSmokeGameclientLinkLine",
    runtimeSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeSmokeTargetLine, runtimeSmokeTargetLine + 35, /zh_gameclient_utility/),
    "CMake BinkVideoPlayer runtime smoke links GameClient utility");
  assertPresent(errors, facts.cmake, "runtimeSmokeNodeRawFsLine",
    runtimeSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeSmokeTargetLine, runtimeSmokeTargetLine + 55, /NODERAWFS=1/),
    "CMake BinkVideoPlayer runtime smoke enables node raw FS");
  const runtimeBrowserSmokeTargetLine = lineNumber(cmake.lines, (line) => /add_executable\s*\(\s*bink-videoplayer-browser-runtime-smoke\b/.test(line));
  assertPresent(errors, facts.cmake, "runtimeBrowserSmokeTargetLine",
    runtimeBrowserSmokeTargetLine,
    "CMake BinkVideoPlayer browser runtime smoke target");
  assertPresent(errors, facts.cmake, "runtimeBrowserSmokeNoMainLine",
    runtimeBrowserSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeBrowserSmokeTargetLine, runtimeBrowserSmokeTargetLine + 35, /BINK_VIDEOPLAYER_RUNTIME_SMOKE_NO_MAIN/),
    "CMake BinkVideoPlayer browser runtime smoke disables main");
  assertPresent(errors, facts.cmake, "runtimeBrowserSmokeExportNameLine",
    runtimeBrowserSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeBrowserSmokeTargetLine, runtimeBrowserSmokeTargetLine + 60, /createBinkVideoPlayerBrowserRuntimeSmokeModule/),
    "CMake BinkVideoPlayer browser runtime smoke export name");
  assertPresent(errors, facts.cmake, "runtimeBrowserSmokeExportLine",
    runtimeBrowserSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeBrowserSmokeTargetLine, runtimeBrowserSmokeTargetLine + 70, /_run_bink_videoplayer_sidecar_copy_bridge_smoke/),
    "CMake BinkVideoPlayer browser runtime smoke exports copy bridge entrypoint");
  assertPresent(errors, facts.cmake, "runtimeBrowserSmokeRuntimeMethodsLine",
    runtimeBrowserSmokeTargetLine === -1
      ? -1
      : firstMatchInRange(cmake.lines, runtimeBrowserSmokeTargetLine, runtimeBrowserSmokeTargetLine + 70, /EXPORTED_RUNTIME_METHODS=\['ccall','FS'\]/),
    "CMake BinkVideoPlayer browser runtime smoke exports ccall and FS");

  // --- package script facts ---
  facts.packageJson.scripts = {};
  const packageScripts = {
    "test:bink-video-sidecar-provider": /"test:bink-video-sidecar-provider":\s*"npm run build:wasm && npm run transcode:bink-video && node tools\/run_bink_video_sidecar_provider_smoke\.mjs/,
    "test:bink-videoplayer-runtime": /"test:bink-videoplayer-runtime":\s*"npm run build:wasm && npm run transcode:bink-video && node dist\/bink-videoplayer-runtime-smoke\.cjs/,
    "test:bink-provider-sidecar-browser": /"test:bink-provider-sidecar-browser":\s*"npm run build:wasm && npm run transcode:bink-video && node harness\/bink_provider_sidecar_browser_smoke\.mjs/,
    "test:bink-videoplayer-sidecar-browser": /"test:bink-videoplayer-sidecar-browser":\s*"npm run build:wasm && npm run transcode:bink-video && node harness\/bink_videoplayer_sidecar_browser_smoke\.mjs/,
  };
  for (const [name, re] of Object.entries(packageScripts)) {
    const ln = lineNumber(packageJson.lines, (line) => re.test(line));
    facts.packageJson.scripts[name] = ln;
    if (ln === -1) {
      errors.push(`package.json script ${name} not found`);
    }
  }

  const report = {
    ok: errors.length === 0,
    errors,
    sources: {
      cpp: SOURCES.cpp,
      header: SOURCES.h,
      shim: SOURCES.shim,
      provider: SOURCES.provider,
      smoke: SOURCES.smoke,
      runtimeSmoke: SOURCES.runtimeSmoke,
      sidecarRunner: SOURCES.sidecarRunner,
      browserHarness: SOURCES.browserHarness,
      runtimeBrowserHarness: SOURCES.runtimeBrowserHarness,
      cmake: SOURCES.cmake,
      packageJson: SOURCES.packageJson,
    },
    facts,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
