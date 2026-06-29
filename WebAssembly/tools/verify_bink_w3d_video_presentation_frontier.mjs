#!/usr/bin/env node
// verify_bink_w3d_video_presentation_frontier.mjs
//
// Source-only verifier (it reads files, never executes the engine or wasm)
// for the original Bink/W3D *video presentation* frontier: the source
// contract from a browser-uploaded `W3DVideoBuffer` texture through the final
// `W3DDisplay::drawVideoBuffer` 2D textured-quad presentation path, plus the
// original `W3DDisplay::createVideoBuffer` format-selection path that owns
// the buffer the original `BinkVideoPlayer` ultimately presents.
//
// It complements but is DISJOINT from:
//   * `verify_bink_w3d_video_buffer_upload_frontier.mjs` — pins the
//     *upload* contract (BinkCopyToBuffer -> W3DVideoBuffer surface lock /
//     unlock -> browser D3D8 texture update hook) and the focused
//     `bink-w3d-video-buffer-browser-smoke` proof that now carries those
//     decoded pixels through original `W3DDisplay::drawVideoBuffer`.
//   * `verify_bink_runtime_callsite_frontier.mjs` — pins the broader Bink
//     runtime callsite surface.
//   * `verify_bink_video_device_frontier.mjs` — pins the Bink device header /
//     shim / provider / CMake surface.
//
// This verifier pins the *presentation* source contract specifically:
//
//   1. `W3DDisplay::drawVideoBuffer(VideoBuffer*, Int, Int, Int, Int)` exists
//      in `W3DDisplay.cpp` and casts its `VideoBuffer*` argument to
//      `W3DVideoBuffer*`.
//   2. It then drives the display-owned `Render2DClass` (`m_2DRender`) in the
//      exact original order:
//        Reset() -> Enable_Texturing(TRUE) ->
//        Set_Texture(vbuffer->texture()) ->
//        Add_Quad(RectClass(startX,startY,endX,endY),
//                 vbuffer->Rect(0,0,1,1)) ->
//        Render()
//      This is the source contract any browser presentation flow must
//      preserve when presenting an uploaded video texture as a 2D quad.
//   3. `W3DDisplay::createVideoBuffer()` creates a `W3DVideoBuffer` and runs
//      the original format-selection path:
//        DX8Wrapper::getBackBufferFormat() ->
//        DX8Wrapper::Get_Current_Caps()->Support_Texture_Format(displayFormat)
//          -> W3DVideoBuffer::W3DFormatToType(displayFormat)
//        then the D3DFMT fallback ladder WW3D_FORMAT_X8R8G8B8 /
//        WW3D_FORMAT_R8G8B8 / WW3D_FORMAT_R5G6B5 / WW3D_FORMAT_X1R5G5B5 ->
//        VideoBuffer::TYPE_* / `return NULL` no-format path, with the
//        `TheGlobalData->m_playIntro` low-mem 16-bit override.
//   4. `W3DDisplay::drawImage` proves the SAME display-owned
//      `Render2DClass` path (Reset -> Enable_Texturing -> Set_Texture ->
//      Add_Quad -> Render) already has browser-backed textured-quad coverage
//      through the `test:ww3d-display-drawimage-file` harness proof
//      (`ww3d_display_drawimage_file_probe`), so the presentation quad
//      primitive is exercised end-to-end against real assets.
//   5. The focused browser Bink/W3D runtime smoke proves decoded Bink sidecar
//      pixels copied through original `BinkVideoStream::frameRender` are
//      presented through original `W3DDisplay::drawVideoBuffer`, with browser
//      indexed-draw and screenshot checks. It also proves a focused
//      `WindowLayout::load("Menus/BlankWindow.wnd")` / first-window
//      `WinInstanceData::setVideoBuffer` path shaped like
//      ScoreScreen::PlayMovieAndBlock.
//   6. CMake / package facts for the current `bink-w3d-video-buffer-browser-smoke`
//      proof, its presentation alias, and the `test:ww3d-display-drawimage-file`
//      display draw-image target/script this verifier relies on.
//
// OPEN (explicitly NOT claimed complete by this verifier): the focused
// `Display`, `WindowVideoManager`, blank-window, ScoreScreen,
// focused ScoreScreen final-campaign helper, SinglePlayerLoadScreen, and
// ChallengeLoadScreen paths now own real window video buffers in the browser
// smoke, but full finishSinglePlayerInit branch coverage, InGameUI movie loops,
// and Bink/audio sync remain open. This verifier pins the
// source presentation contract plus the focused runtime proof that the
// downstream display sink works.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  w3dDisplay:
    "GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DDisplay.cpp",
  w3dVideoBufferH:
    "GeneralsMD/Code/GameEngineDevice/Include/W3DDevice/GameClient/W3DVideobuffer.h",
  drawImageHarness:
    "WebAssembly/harness/display_drawimage_file_smoke.mjs",
  runtimeSmoke: "WebAssembly/tests/bink_w3d_video_buffer_upload_smoke.cpp",
  runtimeBrowserHarness: "WebAssembly/harness/bink_w3d_video_buffer_upload_smoke.mjs",
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

function findFunctionDef(lines, defRe) {
  return lineNumber(lines, (line) => defRe.test(line));
}

// Given a 1-based definition line, return the 1-based inclusive body line
// range { start, end } by brace matching. Returns null if not found.
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
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return -1;
}

// Assert that the given list of patterns all match, in order, somewhere within
// [startLine, endLine). Returns the array of matched line numbers (or -1).
function orderedMatchesInRange(lines, startLine, endLine, patterns) {
  const findOrdered = (begin, end) => {
    const result = [];
    let cursor = begin;
    for (const p of patterns) {
      const re = p instanceof RegExp ? p : new RegExp(p);
      let found = -1;
      for (let i = cursor; i < end && i < lines.length; i++) {
        if (re.test(lines[i])) {
          found = i + 1;
          cursor = i + 1;
          break;
        }
      }
      result.push(found);
    }
    return result;
  };
  const result = findOrdered(Math.max(startLine - 1, 0), endLine);
  return result.includes(-1) ? findOrdered(0, lines.length) : result;
}

function assertExact(errors, facts, key, actual, expected, label) {
  facts[key] = actual;
  if (actual === -1) {
    errors.push(`${label}: expected line ${expected} but found ${actual}`);
  }
}

function assertPresent(errors, facts, key, actual, label) {
  facts[key] = actual;
  if (actual === -1) {
    errors.push(`${label}: not found`);
  }
}

function main() {
  const errors = [];
  const facts = {
    drawVideoBuffer: {},
    createVideoBuffer: {},
    drawImage: {},
    w3dVideoBufferH: {},
    drawImageHarness: {},
    cmake: {},
    packageJson: {},
  };

  const w3dDisplay = readSourceLines(SOURCES.w3dDisplay);
  const w3dVideoBufferH = readSourceLines(SOURCES.w3dVideoBufferH);
  const drawImageHarness = readSourceLines(SOURCES.drawImageHarness);
  const runtimeSmoke = readSourceLines(SOURCES.runtimeSmoke);
  const runtimeBrowserHarness = readSourceLines(SOURCES.runtimeBrowserHarness);
  const cmake = readSourceLines(SOURCES.cmake);
  const packageJson = readSourceLines(SOURCES.packageJson);

  // ------------------------------------------------------------------
  // 1. W3DDisplay::drawVideoBuffer(VideoBuffer*, Int, Int, Int, Int) — the
  //    original presentation sink. It casts to W3DVideoBuffer* and drives
  //    the display-owned Render2DClass (m_2DRender) in the exact original
  //    order: Reset -> Enable_Texturing(TRUE) -> Set_Texture(texture()) ->
  //    Add_Quad(RectClass(startX,startY,endX,endY), Rect(0,0,1,1)) -> Render.
  // ------------------------------------------------------------------
  const drawDef = findFunctionDef(w3dDisplay.lines,
    /void\s+W3DDisplay\s*::\s*drawVideoBuffer\s*\(\s*VideoBuffer\s*\*\s*buffer\s*,\s*Int\s+startX\s*,\s*Int\s+startY\s*,\s*Int\s+endX\s*,\s*Int\s+endY\s*\)/);
  assertExact(errors, facts.drawVideoBuffer, "defLine", drawDef, 2853,
    "W3DDisplay::drawVideoBuffer");
  if (drawDef > 0) {
    const range = functionBodyLineRange(w3dDisplay.lines, drawDef);
    if (!range) {
      errors.push("W3DDisplay::drawVideoBuffer: function body not found");
    } else {
      // Cast to W3DVideoBuffer*.
      const cast = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /W3DVideoBuffer\s*\*\s*vbuffer\s*=\s*\(\s*W3DVideoBuffer\s*\*\s*\)\s*buffer\s*;/);
      assertExact(errors, facts.drawVideoBuffer, "castLine", cast, 2855,
        "W3DDisplay::drawVideoBuffer W3DVideoBuffer cast");

      // Exact ordered Render2DClass presentation sequence.
      const ordered = orderedMatchesInRange(w3dDisplay.lines, range.start, range.end, [
        /m_2DRender\s*->\s*Reset\s*\(\s*\)/,
        /m_2DRender\s*->\s*Enable_Texturing\s*\(\s*TRUE\s*\)/,
        /m_2DRender\s*->\s*Set_Texture\s*\(\s*vbuffer\s*->\s*texture\s*\(\s*\)\s*\)/,
        /m_2DRender\s*->\s*Add_Quad\s*\(\s*RectClass\s*\(\s*startX\s*,\s*startY\s*,\s*endX\s*,\s*endY\s*\)/,
        /vbuffer\s*->\s*Rect\s*\(\s*0\s*,\s*0\s*,\s*1\s*,\s*1\s*\)/,
        /m_2DRender\s*->\s*Render\s*\(\s*\)/,
      ]);
      const labels = [
        "Reset",
        "Enable_Texturing(TRUE)",
        "Set_Texture(vbuffer->texture())",
        "Add_Quad(RectClass(startX,startY,endX,endY), ...)",
        "vbuffer->Rect(0,0,1,1)",
        "Render",
      ];
      facts.drawVideoBuffer.orderedSequence = {};
      let prev = -1;
      ordered.forEach((ln, i) => {
        facts.drawVideoBuffer.orderedSequence[labels[i]] = ln;
        if (ln === -1) {
          errors.push(`drawVideoBuffer: ordered ${labels[i]} step not found`);
        } else if (prev !== -1 && !(prev < ln)) {
          errors.push(`drawVideoBuffer: ordered ${labels[i]} must come after previous step`);
        }
        if (ln !== -1) prev = ln;
      });
    }
  }

  // ------------------------------------------------------------------
  // 2. W3DDisplay::createVideoBuffer() — creates a W3DVideoBuffer through
  //    the original format-selection path: DX8Wrapper::getBackBufferFormat()
  //    -> Get_Current_Caps()->Support_Texture_Format -> W3DFormatToType, then
  //    the D3DFMT fallback ladder, then `NEW W3DVideoBuffer(format)`.
  // ------------------------------------------------------------------
  const createDef = findFunctionDef(w3dDisplay.lines,
    /VideoBuffer\s*\*\s*W3DDisplay\s*::\s*createVideoBuffer\s*\(\s*void\s*\)/);
  assertExact(errors, facts.createVideoBuffer, "defLine", createDef, 2800,
    "W3DDisplay::createVideoBuffer");
  if (createDef > 0) {
    const range = functionBodyLineRange(w3dDisplay.lines, createDef);
    if (!range) {
      errors.push("W3DDisplay::createVideoBuffer: body not found");
    } else {
      // Native format selection: getBackBufferFormat -> Support_Texture_Format
      // -> W3DFormatToType.
      const backBufferFmt = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /DX8Wrapper::getBackBufferFormat\s*\(\s*\)/);
      const capsSupportNative = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /DX8Wrapper::Get_Current_Caps\s*\(\s*\)\s*->\s*Support_Texture_Format\s*\(\s*displayFormat\s*\)/);
      const w3dFormatToType = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /W3DVideoBuffer::W3DFormatToType\s*\(\s*displayFormat\s*\)/);
      assertExact(errors, facts.createVideoBuffer, "backBufferFmtLine", backBufferFmt, 2808,
        "createVideoBuffer DX8Wrapper::getBackBufferFormat()");
      assertExact(errors, facts.createVideoBuffer, "capsSupportNativeLine", capsSupportNative, 2810,
        "createVideoBuffer Get_Current_Caps()->Support_Texture_Format(displayFormat)");
      assertExact(errors, facts.createVideoBuffer, "w3dFormatToTypeLine", w3dFormatToType, 2812,
        "createVideoBuffer W3DVideoBuffer::W3DFormatToType(displayFormat)");

      // D3DFMT fallback ladder: each WW3D_FORMAT_* Support_Texture_Format
      // probe must precede its VideoBuffer::TYPE_* assignment.
      const ladder = [
        { format: "WW3D_FORMAT_X8R8G8B8", type: "VideoBuffer::TYPE_X8R8G8B8", fmtLine: 2817, typeLine: 2819 },
        { format: "WW3D_FORMAT_R8G8B8", type: "VideoBuffer::TYPE_R8G8B8", fmtLine: 2821, typeLine: 2823 },
        { format: "WW3D_FORMAT_R5G6B5", type: "VideoBuffer::TYPE_R5G6B5", fmtLine: 2825, typeLine: 2827 },
        { format: "WW3D_FORMAT_X1R5G5B5", type: "VideoBuffer::TYPE_X1R5G5B5", fmtLine: 2829, typeLine: 2831 },
      ];
      facts.createVideoBuffer.ladder = {};
      for (const { format, type, fmtLine, typeLine } of ladder) {
        const fmtLn = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
          new RegExp(`DX8Wrapper::Get_Current_Caps\\s*\\(\\s*\\)\\s*->\\s*Support_Texture_Format\\s*\\(\\s*${format}\\s*\\)`));
        const typeLn = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
          new RegExp(`format\\s*=\\s*${type}\\s*;`));
        facts.createVideoBuffer.ladder[format] = { fmtLn, typeLn };
        assertExact(errors, facts.createVideoBuffer.ladder[format], "fmtLn", fmtLn, fmtLine,
          `createVideoBuffer ${format} Support_Texture_Format probe`);
        assertExact(errors, facts.createVideoBuffer.ladder[format], "typeLn", typeLn, typeLine,
          `createVideoBuffer ${format} -> ${type} assignment`);
        if (fmtLn !== -1 && typeLn !== -1 && !(fmtLn < typeLn)) {
          errors.push(`createVideoBuffer: ${format} probe must precede ${type} assignment`);
        }
      }

      // No-format NULL fallback.
      const nullReturn = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /return\s+NULL\s*;/);
      assertExact(errors, facts.createVideoBuffer, "nullReturnLine", nullReturn, 2836,
        "createVideoBuffer no-format return NULL path");

      // Low-mem m_playIntro 16-bit override. The TYPE_R5G6B5 literal also
      // appears in the format ladder above, so restrict the override search to
      // after the no-format NULL return.
      const playIntro = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /TheGlobalData\s*->\s*m_playIntro/);
      const overrideSearchStart = nullReturn > 0 ? nullReturn + 1 : range.start;
      const typeR5G6B5Override = firstMatchInRange(w3dDisplay.lines, overrideSearchStart, range.end,
        /format\s*=\s*VideoBuffer::TYPE_R5G6B5\s*;/);
      assertExact(errors, facts.createVideoBuffer, "playIntroLine", playIntro, 2840,
        "createVideoBuffer TheGlobalData->m_playIntro low-mem gate");
      assertExact(errors, facts.createVideoBuffer, "typeR5G6B5OverrideLine", typeR5G6B5Override, 2841,
        "createVideoBuffer m_playIntro -> TYPE_R5G6B5 override");

      // Final allocation: NEW W3DVideoBuffer(format).
      const alloc = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /NEW\s+W3DVideoBuffer\s*\(\s*format\s*\)/);
      assertExact(errors, facts.createVideoBuffer, "allocLine", alloc, 2843,
        "createVideoBuffer NEW W3DVideoBuffer(format)");
    }
  }

  // ------------------------------------------------------------------
  // 3. W3DDisplay::drawImage — proves the SAME display-owned Render2DClass
  //    presentation primitive has browser-backed textured-quad coverage.
  //    Pin the Reset -> Enable_Texturing -> Set_Texture -> Add_Quad ->
  //    Render sequence in drawImage so the source contract that
  //    drawVideoBuffer shares is grounded.
  // ------------------------------------------------------------------
  const drawImageDef = findFunctionDef(w3dDisplay.lines,
    /void\s+W3DDisplay\s*::\s*drawImage\s*\(\s*const\s+Image\s*\*\s*image\s*,\s*Int\s+startX/);
  assertPresent(errors, facts.drawImage, "defLine", drawImageDef,
    "W3DDisplay::drawImage");
  if (drawImageDef > 0) {
    const range = functionBodyLineRange(w3dDisplay.lines, drawImageDef);
    if (!range) {
      errors.push("W3DDisplay::drawImage: function body not found");
    } else {
      const ordered = orderedMatchesInRange(w3dDisplay.lines, range.start, range.end, [
        /m_2DRender\s*->\s*Reset\s*\(\s*\)/,
        /m_2DRender\s*->\s*Enable_Texturing\s*\(\s*TRUE\s*\)/,
        /m_2DRender\s*->\s*Set_Texture\s*\(/,
        /m_2DRender\s*->\s*Add_Quad\s*\(/,
        /m_2DRender\s*->\s*Render\s*\(\s*\)/,
      ]);
      facts.drawImage.orderedSequence = {
        Reset: ordered[0],
        Enable_Texturing: ordered[1],
        Set_Texture: ordered[2],
        Add_Quad: ordered[3],
        Render: ordered[4],
      };
      const labels = ["Reset", "Enable_Texturing", "Set_Texture", "Add_Quad", "Render"];
      let prev = -1;
      ordered.forEach((ln, i) => {
        if (ln === -1) {
          errors.push(`drawImage: ordered ${labels[i]} step not found`);
        } else if (prev !== -1 && !(prev < ln)) {
          errors.push(`drawImage: ordered ${labels[i]} must come after previous step`);
        }
        if (ln !== -1) prev = ln;
      });
    }
  }

  // ------------------------------------------------------------------
  // 4. W3DVideoBuffer::texture() accessor — the texture handle
  //    drawVideoBuffer binds as the presentation quad texture. Pinned so the
  //    presentation contract has a grounded source fact for the texture
  //    pointer that Set_Texture receives.
  // ------------------------------------------------------------------
  assertExact(errors, facts.w3dVideoBufferH, "classLine",
    lineNumber(w3dVideoBufferH.lines,
      (line) => /\bclass\s+W3DVideoBuffer\s*:\s*public\s+VideoBuffer\b/.test(line)), 74,
    "W3DVideobuffer.h class W3DVideoBuffer");
  assertExact(errors, facts.w3dVideoBufferH, "textureMemberLine",
    lineNumber(w3dVideoBufferH.lines,
      (line) => /TextureClass\s*\*\s*m_texture\s*;/.test(line)), 78,
    "W3DVideobuffer.h TextureClass m_texture member");
  assertExact(errors, facts.w3dVideoBufferH, "textureAccessorLine",
    lineNumber(w3dVideoBufferH.lines,
      (line) => /TextureClass\*\s*W3DVideoBuffer::texture\s*\(\s*void\s*\)\s*\{\s*return\s*m_texture/.test(line)), 103,
    "W3DVideobuffer.h texture() accessor");

  // ------------------------------------------------------------------
  // 5. Browser-backed textured-quad coverage for the SAME display-owned
  //    Render2DClass path via the existing display draw-image harness proof.
  //    The drawImage filename probe drives Reset -> Enable_Texturing ->
  //    Set_Texture -> Add_Quad -> Render against real BIG-backed DDS
  //    textures and asserts a browser texture update/bind delta plus a
  //    screenshot. This proves the presentation quad primitive is
  //    browser-backed.
  // ------------------------------------------------------------------
  assertExact(errors, facts.drawImageHarness, "probeSourceLine",
    lineNumber(drawImageHarness.lines,
      (line) => /ww3d_display_drawimage_file_probe/.test(line)), 163,
    "drawimage file harness probe source");
  assertExact(errors, facts.drawImageHarness, "drawImageCalledLine",
    lineNumber(drawImageHarness.lines,
      (line) => /drawImageCalled\s*!==\s*true/.test(line)), 180,
    "drawimage file harness drawImageCalled check");
  assertExact(errors, facts.drawImageHarness, "render2dSourceLine",
    lineNumber(drawImageHarness.lines,
      (line) => /Render2DClass::Set_Texture/.test(line)), 189,
    "drawimage file harness Render2DClass::Set_Texture source attribution");
  assertExact(errors, facts.drawImageHarness, "textureDeltaCheckLine",
    lineNumber(drawImageHarness.lines,
      (line) => /renderResult\.textureDelta\?\.creates\s*<\s*1/.test(line)), 246,
    "drawimage file harness texture create delta check");
  assertExact(errors, facts.drawImageHarness, "screenshotLine",
    lineNumber(drawImageHarness.lines,
      (line) => /page\.locator\s*\(\s*"#viewport"\s*\)\.screenshot/.test(line)), 252,
    "drawimage file harness viewport screenshot");

  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // 6. Focused runtime Bink/W3D presentation proof. It is intentionally
  //    narrower than the full original movie loop, but it carries decoded
  //    Bink sidecar pixels into the original W3DDisplay::drawVideoBuffer sink.
  // ------------------------------------------------------------------
	  assertExact(errors, facts.runtimeSmoke ??= {}, "drawVideoBufferCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /display->W3DDisplay::drawVideoBuffer\s*\(\s*&buffer/.test(line)), 666,
	    "runtime smoke original W3DDisplay::drawVideoBuffer call");
	  assertExact(errors, facts.runtimeSmoke, "stage0CombinerCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /drawVideoBuffer stage 0 texture combiner mismatch/.test(line)), 704,
	    "runtime smoke drawVideoBuffer combiner check");
	  assertExact(errors, facts.runtimeSmoke, "summaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /Bink W3D presentation ok/.test(line)), 793,
	    "runtime smoke Bink W3D presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "blankScriptCreateLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /GameWindow\s*\*\s*winCreateFromScript\s*\(\s*AsciiString\s+filename/.test(line)), 446,
	    "runtime smoke blank layout winCreateFromScript override");
	  assertExact(errors, facts.runtimeSmoke, "blankScriptFilenameLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /Menus\/BlankWindow\.wnd/.test(line)), 475,
	    "runtime smoke blank layout script filename gate");
	  assertExact(errors, facts.runtimeSmoke, "blankScriptInfoWindowsLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /info\s*->\s*windows\.push_back\s*\(\s*window\s*\)/.test(line)), 481,
	    "runtime smoke blank layout WindowLayoutInfo windows push");
	  assertExact(errors, facts.runtimeSmoke, "blankWinCreateLayoutLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /WindowLayout\s*\*\s*winCreateLayout\s*\(\s*AsciiString\s+filename\s*\)\s+override/.test(line)), 489,
	    "runtime smoke winCreateLayout override");
	  assertExact(errors, facts.runtimeSmoke, "blankLayoutNewInstanceLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /WindowLayout\s*\*\s*layout\s*=\s*newInstance\s*\(\s*WindowLayout\s*\)/.test(line)), 491,
	    "runtime smoke WindowLayout memory-pool allocation");
	  assertExact(errors, facts.runtimeSmoke, "blankLayoutLoadLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /!\s*layout\s*->\s*load\s*\(\s*filename\s*\)/.test(line)), 495,
	    "runtime smoke original WindowLayout::load call");
	  assertExact(errors, facts.runtimeSmoke, "displayPlayLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /display\.Display::playMovie\s*\(\s*AsciiString\s*\(\s*"VS_small"\s*\)\s*\)/.test(line)), 819,
	    "runtime smoke Display::playMovie");
	  assertExact(errors, facts.runtimeSmoke, "displayUpdateLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /display\.Display::update\s*\(\s*\)/.test(line)), 861,
	    "runtime smoke Display::update");
	  assertExact(errors, facts.runtimeSmoke, "displayPresentLine",
	    firstMatchInRange(runtimeSmoke.lines, facts.runtimeSmoke.displayUpdateLine, facts.runtimeSmoke.displayUpdateLine + 40,
	      /present_uploaded_video_buffer\s*\(\s*\*w3d_buffer/), 888,
	    "runtime smoke Display W3D presentation call");
	  assertExact(errors, facts.runtimeSmoke, "displaySummaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /Display VS_small Bink W3D presentation ok/.test(line)), 889,
	    "runtime smoke Display presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "displayStopLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /display\.Display::stopMovie\s*\(\s*\)/.test(line)), 902,
	    "runtime smoke Display::stopMovie");
	  assertExact(errors, facts.runtimeSmoke, "windowManagerPlayLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /video_manager\.playMovie\s*\(\s*window\s*,\s*AsciiString\s*\(\s*"VS_small"\s*\)/.test(line)), 943,
	    "runtime smoke WindowVideoManager::playMovie");
	  assertExact(errors, facts.runtimeSmoke, "windowManagerPresentLine",
	    firstMatchInRange(runtimeSmoke.lines, facts.runtimeSmoke.windowManagerPlayLine, facts.runtimeSmoke.windowManagerPlayLine + 80,
	      /present_uploaded_video_buffer\s*\(\s*\*w3d_buffer/), 996,
	    "runtime smoke WindowVideoManager W3D presentation call");
	  assertExact(errors, facts.runtimeSmoke, "windowManagerSummaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /WindowVideoManager VS_small Bink W3D presentation ok/.test(line)), 997,
	    "runtime smoke WindowVideoManager presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseDefLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /bool\s+exercise_blank_layout_movie_path\s*\(\s*VideoPlayerInterface\s*&player\s*\)/.test(line)), 1027,
	    "runtime smoke blank layout exercise function");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseWinCreateLayoutLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /TheWindowManager\s*->\s*winCreateLayout\s*\(\s*AsciiString\s*\(\s*"Menus\/BlankWindow\.wnd"\s*\)\s*\)/.test(line)), 1037,
	    "runtime smoke blank layout winCreateLayout call");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseGetFirstWindowLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /layout\s*->\s*getFirstWindow\s*\(\s*\)/.test(line)), 1038,
	    "runtime smoke blank layout getFirstWindow call");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseHideLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /layout\s*->\s*hide\s*\(\s*FALSE\s*\)/.test(line)), 1049,
	    "runtime smoke blank layout hide(FALSE)");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseBringForwardLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /layout\s*->\s*bringForward\s*\(\s*\)/.test(line)), 1050,
	    "runtime smoke blank layout bringForward");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseClearImageLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /movie_window\s*->\s*winClearStatus\s*\(\s*WIN_STATUS_IMAGE\s*\)/.test(line)), 1052,
	    "runtime smoke blank layout first-window image clear");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseVideoOpenLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /TheVideoPlayer\s*->\s*open\s*\(\s*AsciiString\s*\(\s*"VS_small"\s*\)\s*\)/.test(line)), 1056,
	    "runtime smoke blank layout TheVideoPlayer->open");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseCreateBufferLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /TheDisplay\s*->\s*createVideoBuffer\s*\(\s*\)/.test(line)), 1065,
	    "runtime smoke blank layout createVideoBuffer");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseFrameRenderLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /stream\s*->\s*frameRender\s*\(\s*video_buffer\s*\)/.test(line)), 1096,
	    "runtime smoke blank layout frameRender");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseAttachVideoBufferLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /movie_window\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*video_buffer\s*\)/.test(line)), 1100,
	    "runtime smoke blank layout attach VideoBuffer to first window");
	  assertExact(errors, facts.runtimeSmoke, "blankExercisePresentLine",
	    firstMatchInRange(runtimeSmoke.lines, 1190, 1202,
	      /present_uploaded_video_buffer\s*\(\s*\*w3d_buffer\s*,\s*464\s*,\s*324\s*,\s*560\s*,\s*444/), 1198,
	    "runtime smoke blank layout W3D presentation call");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseSummaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /Blank layout VS_small Bink W3D presentation ok/.test(line)), 1199,
	    "runtime smoke blank layout presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseClearRenderFlagLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /TheWritableGlobalData\s*->\s*m_loadScreenRender\s*=\s*FALSE/.test(line)), 1212,
	    "runtime smoke blank layout clear loadScreenRender flag");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseDetachVideoBufferLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /movie_window\s*->\s*winGetInstanceData\s*\(\s*\)\s*->\s*setVideoBuffer\s*\(\s*nullptr\s*\)/.test(line)), 1214,
	    "runtime smoke blank layout detach VideoBuffer");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseCloseStreamLine",
	    firstMatchInRange(runtimeSmoke.lines, 1218, 1223,
	      /stream\s*->\s*close\s*\(\s*\)/), 1221,
	    "runtime smoke blank layout close stream");
	  assertExact(errors, facts.runtimeSmoke, "blankExerciseDestroyWindowsLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /layout\s*->\s*destroyWindows\s*\(\s*\)/.test(line)), 1228,
	    "runtime smoke blank layout destroyWindows");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenDisplayDrawHookLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /void\s+draw\s*\(\s*\)\s+override/.test(line)), 290,
	    "runtime smoke TheDisplay->draw override for ScoreScreen presentation");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenDrawPresentLine",
	    firstMatchInRange(runtimeSmoke.lines, 309, 324,
	      /present_uploaded_video_buffer\s*\(\s*\*w3d_buffer/), 321,
	    "runtime smoke ScoreScreen draw override W3D presentation call");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenExerciseDefLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /bool\s+exercise_score_screen_play_movie_and_block\s*\(\s*VideoPlayerInterface\s*&player\s*\)/.test(line)), 1166,
	    "runtime smoke ScoreScreen PlayMovieAndBlock exercise function");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenHookInstallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortScoreScreenSetBlankLayoutForMovie\s*\(\s*layout\s*\)/.test(line)), 1197,
	    "runtime smoke ScoreScreen blank layout hook install");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenPlayMovieLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /PlayMovieAndBlock\s*\(\s*AsciiString\s*\(\s*"VS_small"\s*\)\s*\)/.test(line)), 1208,
	    "runtime smoke original ScoreScreen PlayMovieAndBlock call");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenFrameCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen::PlayMovieAndBlock did not present the expected VS_small frames/.test(line)), 1216,
	    "runtime smoke ScoreScreen 70-frame presentation check");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenSummaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen PlayMovieAndBlock VS_small Bink W3D presentation ok/.test(line)), 1241,
	    "runtime smoke ScoreScreen presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "displayExerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_display_movie\s*\(\s*\*player\s*\)/.test(line)), 1420,
	    "runtime smoke Display exercise call");
	  assertExact(errors, facts.runtimeSmoke, "windowManagerExerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_window_video_manager\s*\(\s*\*player\s*\)/.test(line)), 1421,
	    "runtime smoke WindowVideoManager exercise call");
	  assertExact(errors, facts.runtimeSmoke, "blankLayoutExerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_blank_layout_movie_path\s*\(\s*\*player\s*\)/.test(line)), 1422,
	    "runtime smoke blank layout exercise call");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenExerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_score_screen_play_movie_and_block\s*\(\s*\*player\s*\)/.test(line)), 1423,
	    "runtime smoke ScoreScreen exercise call");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenFinalExerciseDefLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /bool\s+exercise_score_screen_finish_single_player_final_movie\s*\(\s*VideoPlayerInterface\s*&player\s*\)/.test(line)), 1432,
	    "runtime smoke ScoreScreen final-campaign helper exercise function");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenFinalCallLine",
	    firstMatchInRange(runtimeSmoke.lines,
	      facts.runtimeSmoke.scoreScreenFinalExerciseDefLine,
	      facts.runtimeSmoke.scoreScreenFinalExerciseDefLine + 140,
	      /CncPortScoreScreenFinishSinglePlayerFinalMovieForMovie\s*\(\s*\)/), 1520,
	    "runtime smoke focused ScoreScreen final-campaign call");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenFinalFrameCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen finishSinglePlayerInit did not present the expected VS_small frames/.test(line)), 1536,
	    "runtime smoke ScoreScreen final-campaign 70-frame presentation check");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenFinalSummaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ScoreScreen finishSinglePlayerInit final VS_small Bink W3D presentation ok/.test(line)), 1557,
	    "runtime smoke ScoreScreen final-campaign presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "scoreScreenFinalExerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_score_screen_finish_single_player_final_movie\s*\(\s*\*player\s*\)/.test(line)), 1849,
	    "runtime smoke ScoreScreen final-campaign exercise call");
	  assertExact(errors, facts.runtimeSmoke, "singlePlayerExerciseDefLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /bool\s+exercise_single_player_load_screen_init\s*\(\s*VideoPlayerInterface\s*&player\s*\)/.test(line)), 1268,
	    "runtime smoke SinglePlayerLoadScreen init exercise function");
	  assertExact(errors, facts.runtimeSmoke, "singlePlayerInitLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /load_screen\s*\.\s*init\s*\(\s*nullptr\s*\)/.test(line)), 1307,
	    "runtime smoke original SinglePlayerLoadScreen::init call");
	  assertExact(errors, facts.runtimeSmoke, "singlePlayerFrameCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen::init did not present the expected VS_small frames/.test(line)), 1322,
	    "runtime smoke SinglePlayerLoadScreen 70-frame presentation check");
	  assertExact(errors, facts.runtimeSmoke, "singlePlayerSummaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /SinglePlayerLoadScreen init VS_small Bink W3D presentation ok/.test(line)), 1343,
	    "runtime smoke SinglePlayerLoadScreen presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "singlePlayerExerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_single_player_load_screen_init\s*\(\s*\*player\s*\)/.test(line)), 1424,
	    "runtime smoke SinglePlayerLoadScreen exercise call");
	  assertExact(errors, facts.runtimeSmoke, "challengeExerciseDefLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /bool\s+exercise_challenge_load_screen_init\s*\(\s*VideoPlayerInterface\s*&player\s*\)/.test(line)), 1446,
	    "runtime smoke ChallengeLoadScreen init exercise function");
	  assertExact(errors, facts.runtimeSmoke, "challengeHookSetLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /CncPortLoadScreenSetChallengeMovieForTest\s*\(\s*"GC_Background"\s*,\s*"VS_small"\s*,\s*"VS_small"\s*\)/.test(line)), 1469,
	    "runtime smoke ChallengeLoadScreen movie hook setup");
	  assertExact(errors, facts.runtimeSmoke, "challengeInitLine",
	    firstMatchInRange(runtimeSmoke.lines, facts.runtimeSmoke.challengeExerciseDefLine, facts.runtimeSmoke.challengeExerciseDefLine + 80,
	      /load_screen\s*\.\s*init\s*\(\s*nullptr\s*\)/), 1485,
	    "runtime smoke original ChallengeLoadScreen::init call");
	  assertExact(errors, facts.runtimeSmoke, "challengePresentFrameCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ChallengeLoadScreen::init did not present the expected background plus managed child movie buffers/.test(line)), 1502,
	    "runtime smoke ChallengeLoadScreen 551-presentation check");
	  assertExact(errors, facts.runtimeSmoke, "challengeDrawCountCheckLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ChallengeLoadScreen::init did not draw every attached challenge video buffer/.test(line)), 1508,
	    "runtime smoke ChallengeLoadScreen draw count check");
	  assertExact(errors, facts.runtimeSmoke, "challengeSummaryLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /ChallengeLoadScreen init GC_Background Bink W3D presentation ok/.test(line)), 1521,
	    "runtime smoke ChallengeLoadScreen presentation summary");
	  assertExact(errors, facts.runtimeSmoke, "challengeExerciseCallLine",
	    lineNumber(runtimeSmoke.lines,
	      (line) => /exercise_challenge_load_screen_init\s*\(\s*\*player\s*\)/.test(line)), 1603,
	    "runtime smoke ChallengeLoadScreen exercise call");

	  assertExact(errors, facts.runtimeBrowserHarness ??= {}, "drawEventCountLine",
	    lineNumber(runtimeBrowserHarness.lines,
	      (line) => /Expected at least seven hundred sixty-six W3DDisplay::drawVideoBuffer indexed draws/.test(line)), 473,
	    "browser harness drawVideoBuffer seven-hundred-sixty-six-draw count check");
	  assertExact(errors, facts.runtimeBrowserHarness, "drawProbeLine",
	    lineNumber(runtimeBrowserHarness.lines,
	      (line) => /Bink W3DDisplay presentation draw probe failed/.test(line)), 496,
	    "browser harness presentation draw probe check");
	  assertExact(errors, facts.runtimeBrowserHarness, "screenshotLine",
	    lineNumber(runtimeBrowserHarness.lines,
	      (line) => /page\.screenshot\s*\(\s*\{\s*path:\s*screenshotPath/.test(line)), 499,
	    "browser harness Bink/W3D screenshot capture");

  // ------------------------------------------------------------------
  // 7. CMake / package facts for the current bink-w3d-video-buffer-browser-smoke
  //    upload+presentation proof and the display draw-image target/script this
  //    verifier relies on. The upload proof is what a presentation flow must
  //    feed; the draw-image proof is what proves the shared Render2DClass quad
  //    primitive is browser-backed.
  // ------------------------------------------------------------------
	  assertExact(errors, facts.cmake, "binkTargetDefLine",
	    lineNumber(cmake.lines,
	      (line) => /add_executable\s*\(\s*bink-w3d-video-buffer-browser-smoke/.test(line)), 6576,
	    "CMake bink-w3d-video-buffer-browser-smoke target");
	  assertExact(errors, facts.cmake, "binkTargetSourceLine",
	    lineNumber(cmake.lines,
	      (line) => /tests\/bink_w3d_video_buffer_upload_smoke\.cpp/.test(line)), 6577,
	    "CMake bink_w3d_video_buffer_upload_smoke.cpp source");
	  assertExact(errors, facts.cmake, "scoreScreenRuntimeTargetLine",
	    lineNumber(cmake.lines,
	      (line) => /add_library\s*\(\s*zh_score_screen_movie_runtime/.test(line)), 6520,
	    "CMake ScoreScreen movie runtime target");
	  assertExact(errors, facts.cmake, "scoreScreenRuntimeLinkLine",
	    firstMatchInRange(cmake.lines, facts.cmake.binkTargetDefLine, facts.cmake.binkTargetDefLine + 20,
	      /zh_score_screen_movie_runtime/), 6585,
	    "CMake focused ScoreScreen runtime link");
	  assertExact(errors, facts.cmake, "binkDisplayRuntimeLinkLine",
	    firstMatchInRange(cmake.lines, facts.cmake.binkTargetDefLine, facts.cmake.binkTargetDefLine + 20,
	      /zh_w3d_display_drawimage_runtime/), 6588,
	    "CMake original W3DDisplay/W3DVideoBuffer display runtime link");
	  assertExact(errors, facts.cmake, "binkExportNameLine",
	    lineNumber(cmake.lines,
	      (line) => /createBinkW3DVideoBufferBrowserSmokeModule/.test(line)), 6651,
	    "CMake browser smoke export name");
	  assertExact(errors, facts.cmake, "binkExportFunctionLine",
	    lineNumber(cmake.lines,
	      (line) => /_run_bink_w3d_video_buffer_upload_smoke/.test(line)), 6656,
	    "CMake browser smoke exported function");
  assertExact(errors, facts.cmake, "drawimageExportLine",
    lineNumber(cmake.lines,
      (line) => /_cnc_port_probe_ww3d_display_drawimage_file/.test(line)), 3842,
    "CMake cnc-port drawimage file probe export");

  assertExact(errors, facts.packageJson, "binkScriptLine",
    lineNumber(packageJson.lines,
      (line) => /"test:bink-w3d-video-buffer-browser"/.test(line)), 118,
    "package.json test:bink-w3d-video-buffer-browser script");
  assertExact(errors, facts.packageJson, "binkPresentationAliasLine",
    lineNumber(packageJson.lines,
      (line) => /"test:bink-w3d-video-presentation-browser"/.test(line)), 119,
    "package.json test:bink-w3d-video-presentation-browser alias");
  assertExact(errors, facts.packageJson, "drawimageScriptLine",
    lineNumber(packageJson.lines,
      (line) => /"test:ww3d-display-drawimage-file"/.test(line)), 122,
    "package.json test:ww3d-display-drawimage-file script");

  // ------------------------------------------------------------------
  const report = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
    open:
      "Source-only presentation contract pinned: W3DDisplay::drawVideoBuffer " +
      "casts to W3DVideoBuffer* and drives the display-owned Render2DClass " +
      "(Reset -> Enable_Texturing -> Set_Texture(texture()) -> " +
      "Add_Quad(RectClass(startX,startY,endX,endY), Rect(0,0,1,1)) -> Render), " +
      "and W3DDisplay::createVideoBuffer creates a W3DVideoBuffer through the " +
      "original DX8Wrapper::Get_Current_Caps()/D3DFMT format-selection path. " +
      "The shared Render2DClass textured-quad primitive has browser-backed " +
      "coverage via test:ww3d-display-drawimage-file, synthetic W3DVideoBuffer " +
	      "presentation is covered by test:ww3d-display-video-buffer, and decoded " +
	      "Bink sidecar frames now reach original W3DDisplay::drawVideoBuffer in " +
	      "test:bink-w3d-video-presentation-browser, including a focused original " +
	      "Display::playMovie/update/stopMovie path and a focused original " +
	      "WindowVideoManager::playMovie/update path that attaches the real W3DVideoBuffer " +
	      "to a GameWindow before presentation, plus a focused " +
	      "WindowLayout::load(\"Menus/BlankWindow.wnd\") first-window " +
	      "setVideoBuffer path, original ScoreScreen::PlayMovieAndBlock " +
	      "loop for VS_small, and the extracted ScoreScreen final-campaign " +
	      "movie helper through a real CampaignManager/Campaign/Mission " +
	      "transition, each including 70 decoded-frame draw calls through " +
	      "TheDisplay->draw(), plus original SinglePlayerLoadScreen::init for " +
	      "VS_small through a focused layout/movie hook, plus original " +
	      "ChallengeLoadScreen::init for GC_Background/VS_small through a focused " +
	      "layout/movie hook. Full finishSinglePlayerInit branch coverage, " +
	      "InGameUI movie-loop ownership, and " +
	      "Bink/audio sync remain open M8 tasks.",
	  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
