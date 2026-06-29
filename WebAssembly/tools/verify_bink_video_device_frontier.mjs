#!/usr/bin/env node
// verify_bink_video_device_frontier.mjs
//
// Source-checks the original Bink video device frontier. It reads (never
// executes) only repo source files: the original Bink video device source and
// header, the wasm browser bink declaration shim/provider, and the wasm CMake
// compile frontier target/source. It emits a JSON { ok, errors, sources, facts }
// report and exits nonzero on missing/moved hard facts.
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
//     handle fields, frame cursor APIs are stateful, and BinkCopyToBuffer still
//     documents that frame decode/copy remains a WebCodecs/decoder task.
//   - WebAssembly/CMakeLists.txt defines the zh_bink_video_device_compile_frontier
//     static library target (line 2468) compiling BinkVideoPlayer.cpp (line 2469)
//     and links it to zh_browser_bink.
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
  cmake: "WebAssembly/CMakeLists.txt",
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
  const facts = { player: {}, stream: {}, header: {}, shim: {}, provider: {}, cmake: {} };

  const cpp = readSourceLines(SOURCES.cpp);
  const h = readSourceLines(SOURCES.h);
  const shim = readSourceLines(SOURCES.shim);
  const provider = readSourceLines(SOURCES.provider);
  const cmake = readSourceLines(SOURCES.cmake);

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
  assertPresent(errors, facts.provider, "parseHeaderLine",
    lineNumber(provider.lines, (line) => /\bparse_bik_header\s*\(/.test(line)),
    "provider parse_bik_header");

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
    errors.push("provider BinkCopyToBuffer must document that frame decode/copy remains pending");
  }
  const decodeReadyBody = functionBodyLineRange(provider.lines, facts.provider.apiDefinitions.WasmBinkProviderCanDecodeFrames);
  facts.provider.canDecodeFramesFalseLine = decodeReadyBody
    ? firstMatchInRange(provider.lines, decodeReadyBody.start, decodeReadyBody.end, /return\s+0\s*;/)
    : -1;
  if (facts.provider.canDecodeFramesFalseLine === -1) {
    errors.push("provider must report decodeReady=false until real frame decode is implemented");
  }
  facts.provider.runtimeDecode = false;

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

  const report = {
    ok: errors.length === 0,
    errors,
    sources: {
      cpp: SOURCES.cpp,
      header: SOURCES.h,
      shim: SOURCES.shim,
      provider: SOURCES.provider,
      cmake: SOURCES.cmake,
    },
    facts,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
