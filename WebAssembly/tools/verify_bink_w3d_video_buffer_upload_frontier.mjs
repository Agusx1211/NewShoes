#!/usr/bin/env node
// verify_bink_w3d_video_buffer_upload_frontier.mjs
//
// Source-only verifier (it reads files, never executes the engine or wasm)
// for the next M8 texture-upload frontier after BinkCopyToBuffer: how a
// decoded Bink frame travels from `BinkVideoStream::frameRender(VideoBuffer*)`
// through the abstract `VideoBuffer` contract, the W3D `W3DVideoBuffer`
// `TextureClass`/`SurfaceClass` ownership, and the browser D3D8 shim
// `LockRect`/owned-surface `UnlockRect`/`wasm_d3d8_browser_texture_update`
// path that must carry dirty pixels out to the browser.
//
// It is intentionally narrower than `verify_bink_runtime_callsite_frontier.mjs`
// (which pins the broader Bink runtime callsite surface) and
// `verify_bink_video_device_frontier.mjs` (which pins the Bink device
// header/shim/provider/CMake surface). This verifier pins the *texture-upload*
// contract specifically:
//
//   1. Original `BinkVideoStream::frameRender(VideoBuffer*)`: locks the buffer,
//      maps each `VideoBuffer::Type` to its BINKSURFACE flag, calls
//      `BinkCopyToBuffer(m_handle, mem, buffer->pitch(), buffer->height(),
//      buffer->xPos(), buffer->yPos(), flags)`, then unlocks.
//   2. Original `VideoBuffer` abstract contract in `VideoPlayer.h`:
//      `lock/unlock` are pure-virtual; `pitch/height/xPos/yPos/format` are the
//      concrete accessors that `frameRender` reads.
//   3. Original `W3DVideoBuffer` allocation/lock/unlock/texture ownership:
//      `allocate` creates a `TextureClass`; `lock` calls
//      `m_texture->Get_Surface_Level()` then `m_surface->Lock(&m_pitch)`;
//      `unlock` calls `m_surface->Unlock()` then `m_surface->Release_Ref()`;
//      `free`/dtor call `m_texture->Release_Ref()`; the header owns
//      `TextureClass *m_texture` / `SurfaceClass *m_surface` and a `texture()`
//      accessor.
//   4. Current browser D3D8 shim texture/surface path: surface `LockRect`
//      returns wasm-backed `m_pixels` memory and pitch; owned-surface
//      `UnlockRect` captures dirty pixels and calls `browser_texture_update`;
//      texture `UnlockRect(level)` also calls `browser_texture_update`, which drives the
//      `wasm_d3d8_browser_texture_update` JS hook (`Module.cncPortD3D8TextureUpdate`)
//      to carry dirty pixels to the browser.
//   5. The focused browser runtime smoke wires original `BinkVideoPlayer`
//      through a real `W3DVideoBuffer`, asserts nonzero browser texture
//      updates, and then drives those decoded pixels through original
//      `W3DDisplay::drawVideoBuffer` as a display-owned `Render2DClass` quad.
//   6. The original presentation sink `W3DDisplay::drawVideoBuffer` exists and
//      binds the `W3DVideoBuffer` texture as a 2D quad — the path an original
//      `BinkVideoPlayer`-owned browser presentation flow must ultimately reach.
//
// OPEN (explicitly not claimed complete by this verifier): the focused
// `WindowVideoManager::playMovie/update` path now owns one real window video
// buffer in the browser smoke, but the full original `Display` / load-screen /
// score-screen movie loops and Bink/audio sync remain open. This verifier pins
// the upload contract plus the focused real-`W3DVideoBuffer` runtime smoke that
// future presentation wiring must preserve.
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  binkPlayer:
    "GeneralsMD/Code/GameEngineDevice/Source/VideoDevice/Bink/BinkVideoPlayer.cpp",
  videoPlayerH: "GeneralsMD/Code/GameEngine/Include/GameClient/VideoPlayer.h",
  w3dVideoBufferH:
    "GeneralsMD/Code/GameEngineDevice/Include/W3DDevice/GameClient/W3DVideobuffer.h",
  w3dVideoBuffer:
    "GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DVideoBuffer.cpp",
  w3dDisplay:
    "GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DDisplay.cpp",
  d3d8Shim: "WebAssembly/src/wasm_d3d8_shim.cpp",
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
  return -1;
}

// Assert that the given list of patterns all match, in order, somewhere within
// [startLine, endLine). Returns the array of matched line numbers (or -1).
function orderedMatchesInRange(lines, startLine, endLine, patterns) {
  const result = [];
  let cursor = Math.max(startLine - 1, 0);
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(p);
    let found = -1;
    for (let i = cursor; i < endLine && i < lines.length; i++) {
      if (re.test(lines[i])) {
        found = i + 1;
        cursor = i + 1;
        break;
      }
    }
    result.push(found);
  }
  return result;
}

function assertExact(errors, facts, key, actual, expected, label) {
  facts[key] = actual;
  if (actual !== expected) {
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
    frameRender: {},
    videoBuffer: {},
    w3dVideoBuffer: {},
    drawVideoBuffer: {},
    d3d8Shim: {},
    runtimeSmoke: {},
    runtimeBrowserHarness: {},
    cmake: {},
    packageJson: {},
  };

  const binkPlayer = readSourceLines(SOURCES.binkPlayer);
  const videoPlayerH = readSourceLines(SOURCES.videoPlayerH);
  const w3dVideoBufferH = readSourceLines(SOURCES.w3dVideoBufferH);
  const w3dVideoBuffer = readSourceLines(SOURCES.w3dVideoBuffer);
  const w3dDisplay = readSourceLines(SOURCES.w3dDisplay);
  const d3d8Shim = readSourceLines(SOURCES.d3d8Shim);
  const runtimeSmoke = readSourceLines(SOURCES.runtimeSmoke);
  const runtimeBrowserHarness = readSourceLines(SOURCES.runtimeBrowserHarness);
  const cmake = readSourceLines(SOURCES.cmake);
  const packageJson = readSourceLines(SOURCES.packageJson);

  // ------------------------------------------------------------------
  // 1. BinkVideoStream::frameRender(VideoBuffer*) — lock, format→flag map,
  //    BinkCopyToBuffer(handle, mem, pitch, height, xPos, yPos, flags),
  //    unlock.
  // ------------------------------------------------------------------
  const frameRenderDef = findFunctionDef(binkPlayer.lines,
    /void\s+BinkVideoStream\s*::\s*frameRender\s*\(\s*VideoBuffer\s*\*\s*buffer\s*\)/);
  assertExact(errors, facts.frameRender, "defLine", frameRenderDef, 352,
    "BinkVideoStream::frameRender");
  if (frameRenderDef > 0) {
    const range = functionBodyLineRange(binkPlayer.lines, frameRenderDef);
    if (!range) {
      errors.push("BinkVideoStream::frameRender: function body not found");
    } else {
      const lockCall = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /buffer\s*->\s*lock\s*\(\s*\)/);
      assertPresent(errors, facts.frameRender, "lockLine", lockCall,
        "frameRender buffer->lock()");

      // Format -> BINKSURFACE flag mapping (each case + its flag assignment).
      const formatMap = [
        { type: "TYPE_X8R8G8B8", flag: "BINKSURFACE32" },
        { type: "TYPE_R8G8B8", flag: "BINKSURFACE24" },
        { type: "TYPE_R5G6B5", flag: "BINKSURFACE565" },
        { type: "TYPE_X1R5G5B5", flag: "BINKSURFACE555" },
      ];
      facts.frameRender.formatMap = {};
      for (const { type, flag } of formatMap) {
        const typeLine = firstMatchInRange(binkPlayer.lines, range.start, range.end,
          new RegExp(`VideoBuffer::${type}\\b`));
        const flagLine = firstMatchInRange(binkPlayer.lines, range.start, range.end,
          new RegExp(`flags\\s*=\\s*${flag}\\s*;`));
        facts.frameRender.formatMap[type] = { typeLine, flagLine };
        if (typeLine === -1) {
          errors.push(`frameRender: VideoBuffer::${type} case not found`);
        }
        if (flagLine === -1) {
          errors.push(`frameRender: ${flag} flag assignment not found`);
        }
        if (typeLine !== -1 && flagLine !== -1 && !(typeLine < flagLine)) {
          errors.push(`frameRender: ${type} case must precede ${flag} assignment`);
        }
      }

      // BinkCopyToBuffer call with the exact argument order
      // (m_handle, mem, buffer->pitch(), buffer->height(),
      //  buffer->xPos(), buffer->yPos(), flags).
      const copyCall = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /BinkCopyToBuffer\s*\(\s*m_handle\s*,\s*mem\s*,\s*buffer\s*->\s*pitch\s*\(\s*\)\s*,\s*buffer\s*->\s*height\s*\(\s*\)/);
      const copyXPos = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /buffer\s*->\s*xPos\s*\(\s*\)/);
      const copyYPos = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /buffer\s*->\s*yPos\s*\(\s*\)/);
      const copyFlags = firstMatchInRange(binkPlayer.lines, range.start, range.end,
        /,\s*flags\s*\)\s*;/);
      assertPresent(errors, facts.frameRender, "copyCallLine", copyCall,
        "frameRender BinkCopyToBuffer(m_handle, mem, buffer->pitch(), buffer->height(), ...)");
      facts.frameRender.copyXPosLine = copyXPos;
      facts.frameRender.copyYPosLine = copyYPos;
      facts.frameRender.copyFlagsLine = copyFlags;
      if (copyXPos === -1) errors.push("frameRender: BinkCopyToBuffer buffer->xPos() arg not found");
      if (copyYPos === -1) errors.push("frameRender: BinkCopyToBuffer buffer->yPos() arg not found");
      if (copyFlags === -1) errors.push("frameRender: BinkCopyToBuffer flags arg not found");

      // Ordered: lock -> (format mapping already verified) -> BinkCopyToBuffer
      //          -> buffer->unlock().
      const ordered = orderedMatchesInRange(binkPlayer.lines, range.start, range.end, [
        /buffer\s*->\s*lock\s*\(\s*\)/,
        /BinkCopyToBuffer\s*\(/,
        /buffer\s*->\s*unlock\s*\(\s*\)/,
      ]);
      facts.frameRender.orderedLockCopyUnlock = {
        lock: ordered[0], copy: ordered[1], unlock: ordered[2],
      };
      const labels = ["lock", "BinkCopyToBuffer", "unlock"];
      let prev = -1;
      ordered.forEach((ln, i) => {
        if (ln === -1) {
          errors.push(`frameRender: ordered ${labels[i]} step not found`);
        } else if (prev !== -1 && !(prev < ln)) {
          errors.push(`frameRender: ordered ${labels[i]} must come after previous step`);
        }
        if (ln !== -1) prev = ln;
      });
    }
  }

  // ------------------------------------------------------------------
  // 2. VideoBuffer abstract contract (VideoPlayer.h).
  // ------------------------------------------------------------------
  assertExact(errors, facts.videoBuffer, "classLine",
    lineNumber(videoPlayerH.lines, (line) => /\bclass\s+VideoBuffer\b/.test(line)), 91,
    "VideoPlayer.h class VideoBuffer");
  assertExact(errors, facts.videoBuffer, "lockDeclLine",
    lineNumber(videoPlayerH.lines,
      (line) => /virtual\s+void\s*\*\s*lock\s*\(\s*void\s*\)\s*=\s*0/.test(line)), 126,
    "VideoBuffer abstract lock()");
  assertExact(errors, facts.videoBuffer, "unlockDeclLine",
    lineNumber(videoPlayerH.lines,
      (line) => /virtual\s+void\s+unlock\s*\(\s*void\s*\)\s*=\s*0/.test(line)), 127,
    "VideoBuffer abstract unlock()");
  assertExact(errors, facts.videoBuffer, "xPosLine",
    lineNumber(videoPlayerH.lines,
      (line) => /UnsignedInt\s+xPos\s*\(\s*void\s*\)\s*\{\s*return\s+m_xPos/.test(line)), 130,
    "VideoBuffer xPos()");
  assertExact(errors, facts.videoBuffer, "yPosLine",
    lineNumber(videoPlayerH.lines,
      (line) => /UnsignedInt\s+yPos\s*\(\s*void\s*\)\s*\{\s*return\s+m_yPos/.test(line)), 131,
    "VideoBuffer yPos()");
  assertExact(errors, facts.videoBuffer, "heightLine",
    lineNumber(videoPlayerH.lines,
      (line) => /UnsignedInt\s+height\s*\(\s*void\s*\)\s*\{\s*return\s+m_height/.test(line)), 134,
    "VideoBuffer height()");
  assertExact(errors, facts.videoBuffer, "pitchLine",
    lineNumber(videoPlayerH.lines,
      (line) => /UnsignedInt\s+pitch\s*\(\s*void\s*\)\s*\{\s*return\s+m_pitch/.test(line)), 137,
    "VideoBuffer pitch()");
  assertExact(errors, facts.videoBuffer, "formatLine",
    lineNumber(videoPlayerH.lines,
      (line) => /Type\s+format\s*\(\s*void\s*\)\s*\{\s*return\s+m_format/.test(line)), 138,
    "VideoBuffer format()");

  // ------------------------------------------------------------------
  // 3. W3DVideoBuffer allocation/lock/unlock/texture ownership.
  // ------------------------------------------------------------------
  // Header members + accessor.
  assertExact(errors, facts.w3dVideoBuffer, "classLine",
    lineNumber(w3dVideoBufferH.lines,
      (line) => /\bclass\s+W3DVideoBuffer\s*:\s*public\s+VideoBuffer\b/.test(line)), 74,
    "W3DVideobuffer.h class W3DVideoBuffer");
  assertExact(errors, facts.w3dVideoBuffer, "textureMemberLine",
    lineNumber(w3dVideoBufferH.lines,
      (line) => /TextureClass\s*\*\s*m_texture\s*;/.test(line)), 78,
    "W3DVideobuffer.h TextureClass m_texture member");
  assertExact(errors, facts.w3dVideoBuffer, "surfaceMemberLine",
    lineNumber(w3dVideoBufferH.lines,
      (line) => /SurfaceClass\s*\*\s*m_surface\s*;/.test(line)), 79,
    "W3DVideobuffer.h SurfaceClass m_surface member");
  assertExact(errors, facts.w3dVideoBuffer, "textureAccessorLine",
    lineNumber(w3dVideoBufferH.lines,
      (line) => /TextureClass\*\s*W3DVideoBuffer::texture\s*\(\s*void\s*\)\s*\{\s*return\s*m_texture/.test(line)), 103,
    "W3DVideobuffer.h texture() accessor");

  // allocate(): creates TextureClass via MSGNEW.
  const allocateDef = findFunctionDef(w3dVideoBuffer.lines,
    /Bool\s+W3DVideoBuffer\s*::\s*allocate\s*\(\s*UnsignedInt\s+width\s*,\s*UnsignedInt\s+height\s*\)/);
  assertExact(errors, facts.w3dVideoBuffer, "allocateDefLine", allocateDef, 117,
    "W3DVideoBuffer::allocate");
  if (allocateDef > 0) {
    const range = functionBodyLineRange(w3dVideoBuffer.lines, allocateDef);
    if (!range) {
      errors.push("W3DVideoBuffer::allocate: body not found");
    } else {
      const textureNew = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /MSGNEW\s*\(\s*"TextureClass"\s*\)\s*TextureClass\s*\(/);
      assertExact(errors, facts.w3dVideoBuffer, "allocateTextureNewLine", textureNew, 135,
        "W3DVideoBuffer::allocate MSGNEW TextureClass");
      // allocate locks then unlocks to validate the surface before returning.
      const lockCall = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /\block\s*\(\s*\)/);
      const unlockCall = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /\bunlock\s*\(\s*\)/);
      facts.w3dVideoBuffer.allocateLockLine = lockCall;
      facts.w3dVideoBuffer.allocateUnlockLine = unlockCall;
      if (lockCall === -1) errors.push("W3DVideoBuffer::allocate: lock() validation not found");
      if (unlockCall === -1) errors.push("W3DVideoBuffer::allocate: unlock() validation not found");
    }
  }

  // lock(): Get_Surface_Level + m_surface->Lock(&m_pitch).
  const lockDef = findFunctionDef(w3dVideoBuffer.lines,
    /void\s*\*\s*W3DVideoBuffer\s*::\s*lock\s*\(\s*void\s*\)/);
  assertExact(errors, facts.w3dVideoBuffer, "lockDefLine", lockDef, 167,
    "W3DVideoBuffer::lock");
  if (lockDef > 0) {
    const range = functionBodyLineRange(w3dVideoBuffer.lines, lockDef);
    if (!range) {
      errors.push("W3DVideoBuffer::lock: body not found");
    } else {
      const surfaceLevel = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_texture\s*->\s*Get_Surface_Level\s*\(\s*\)/);
      const surfaceLock = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_surface\s*->\s*Lock\s*\(\s*\(\s*Int\s*\*\s*\)\s*&m_pitch\s*\)/);
      assertExact(errors, facts.w3dVideoBuffer, "lockSurfaceLevelLine", surfaceLevel, 176,
        "W3DVideoBuffer::lock m_texture->Get_Surface_Level()");
      assertExact(errors, facts.w3dVideoBuffer, "lockSurfaceLockLine", surfaceLock, 180,
        "W3DVideoBuffer::lock m_surface->Lock(&m_pitch)");
      if (surfaceLevel !== -1 && surfaceLock !== -1 && !(surfaceLevel < surfaceLock)) {
        errors.push("W3DVideoBuffer::lock: Get_Surface_Level must precede m_surface->Lock");
      }
    }
  }

  // unlock(): m_surface->Unlock + m_surface->Release_Ref.
  const unlockDef = findFunctionDef(w3dVideoBuffer.lines,
    /void\s+W3DVideoBuffer\s*::\s*unlock\s*\(\s*void\s*\)/);
  assertExact(errors, facts.w3dVideoBuffer, "unlockDefLine", unlockDef, 190,
    "W3DVideoBuffer::unlock");
  if (unlockDef > 0) {
    const range = functionBodyLineRange(w3dVideoBuffer.lines, unlockDef);
    if (!range) {
      errors.push("W3DVideoBuffer::unlock: body not found");
    } else {
      const surfaceUnlock = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_surface\s*->\s*Unlock\s*\(\s*\)/);
      const releaseRef = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_surface\s*->\s*Release_Ref\s*\(\s*\)/);
      assertExact(errors, facts.w3dVideoBuffer, "unlockSurfaceUnlockLine", surfaceUnlock, 194,
        "W3DVideoBuffer::unlock m_surface->Unlock()");
      assertExact(errors, facts.w3dVideoBuffer, "unlockReleaseRefLine", releaseRef, 195,
        "W3DVideoBuffer::unlock m_surface->Release_Ref()");
    }
  }

  // free(): releases the owned texture.
  const freeDef = findFunctionDef(w3dVideoBuffer.lines,
    /void\s+W3DVideoBuffer\s*::\s*free\s*\(\s*void\s*\)/);
  assertExact(errors, facts.w3dVideoBuffer, "freeDefLine", freeDef, 213,
    "W3DVideoBuffer::free");
  if (freeDef > 0) {
    const range = functionBodyLineRange(w3dVideoBuffer.lines, freeDef);
    if (!range) {
      errors.push("W3DVideoBuffer::free: body not found");
    } else {
      const textureRelease = firstMatchInRange(w3dVideoBuffer.lines, range.start, range.end,
        /m_texture\s*->\s*Release_Ref\s*\(\s*\)/);
      assertExact(errors, facts.w3dVideoBuffer, "freeTextureReleaseLine", textureRelease, 220,
        "W3DVideoBuffer::free m_texture->Release_Ref()");
    }
  }

  // ------------------------------------------------------------------
  // 4. W3DDisplay::drawVideoBuffer — the original presentation sink that
  //    binds the W3DVideoBuffer texture as a 2D quad. Pinned as the path
  //    the open runtime presentation work must reach (NOT marked complete).
  // ------------------------------------------------------------------
  const drawDef = findFunctionDef(w3dDisplay.lines,
    /void\s+W3DDisplay\s*::\s*drawVideoBuffer\s*\(\s*VideoBuffer\s*\*\s*buffer\s*,\s*Int\s+startX/);
  assertExact(errors, facts.drawVideoBuffer, "defLine", drawDef, 2853,
    "W3DDisplay::drawVideoBuffer");
  if (drawDef > 0) {
    const range = functionBodyLineRange(w3dDisplay.lines, drawDef);
    if (!range) {
      errors.push("W3DDisplay::drawVideoBuffer: body not found");
    } else {
      const cast = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /W3DVideoBuffer\s*\*\s*vbuffer\s*=\s*\(\s*W3DVideoBuffer\s*\*\s*\)\s*buffer/);
      const setTexture = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /m_2DRender\s*->\s*Set_Texture\s*\(\s*vbuffer\s*->\s*texture\s*\(\s*\)\s*\)/);
      const addQuad = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /m_2DRender\s*->\s*Add_Quad\s*\(/);
      const render = firstMatchInRange(w3dDisplay.lines, range.start, range.end,
        /m_2DRender\s*->\s*Render\s*\(\s*\)/);
      facts.drawVideoBuffer.castLine = cast;
      facts.drawVideoBuffer.setTextureLine = setTexture;
      facts.drawVideoBuffer.addQuadLine = addQuad;
      facts.drawVideoBuffer.renderLine = render;
      if (cast === -1) errors.push("W3DDisplay::drawVideoBuffer: W3DVideoBuffer cast not found");
      if (setTexture === -1) errors.push("W3DDisplay::drawVideoBuffer: Set_Texture(vbuffer->texture()) not found");
      if (addQuad === -1) errors.push("W3DDisplay::drawVideoBuffer: Add_Quad not found");
      if (render === -1) errors.push("W3DDisplay::drawVideoBuffer: Render() not found");
    }
  }

  // ------------------------------------------------------------------
  // 5. Browser D3D8 shim texture/surface path.
  //    Surface LockRect returns wasm-backed m_pixels + pitch; surface
  //    UnlockRect delegates to unlock_and_capture; texture UnlockRect(level)
  //    calls browser_texture_update -> wasm_d3d8_browser_texture_update
  //    (Module.cncPortD3D8TextureUpdate), the JS hook carrying dirty pixels.
  // ------------------------------------------------------------------
  // JS hook declaration via EM_JS and its bridge symbol.
  assertExact(errors, facts.d3d8Shim, "updateEmJsLine",
    lineNumber(d3d8Shim.lines,
      (line) => /EM_JS\s*\(\s*void,\s*wasm_d3d8_browser_texture_update\b/.test(line)), 134,
    "wasm_d3d8_browser_texture_update EM_JS");
  assertExact(errors, facts.d3d8Shim, "updateBridgeSymbolLine",
    lineNumber(d3d8Shim.lines,
      (line) => /Module\.cncPortD3D8TextureUpdate/.test(line)), 148,
    "wasm_d3d8_browser_texture_update Module.cncPortD3D8TextureUpdate bridge");

  // Surface LockRect returns wasm memory (m_pixels.data()) + pitch.
  const surfaceLockRectDef = lineNumber(d3d8Shim.lines,
    (line) => /HRESULT\s+LockRect\s*\(\s*D3DLOCKED_RECT\s*\*\s*locked_rect,\s*const\s+RECT\s*\*rect,\s*DWORD\s+flags\s*\)\s*override/.test(line));
  assertExact(errors, facts.d3d8Shim, "surfaceLockRectDefLine", surfaceLockRectDef, 1244,
    "BrowserD3DSurface LockRect");
  if (surfaceLockRectDef > 0) {
    const range = functionBodyLineRange(d3d8Shim.lines, surfaceLockRectDef);
    if (!range) {
      errors.push("BrowserD3DSurface LockRect: body not found");
    } else {
      const pitchSet = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /locked_rect\s*->\s*Pitch\s*=\s*m_pitch/);
      const pBitsSet = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /locked_rect\s*->\s*pBits\s*=\s*m_pixels\.data\(\)/);
      facts.d3d8Shim.surfaceLockRectPitchLine = pitchSet;
      facts.d3d8Shim.surfaceLockRectPBitsLine = pBitsSet;
      if (pitchSet === -1) errors.push("BrowserD3DSurface LockRect: locked_rect->Pitch = m_pitch not found");
      if (pBitsSet === -1) errors.push("BrowserD3DSurface LockRect: locked_rect->pBits = m_pixels.data() not found");
    }
  }
  // Owned texture surfaces can be locked/unlocked directly through
  // GetSurfaceLevel, which is the original W3DVideoBuffer path. Surface
  // UnlockRect must capture dirty pixels and upload them through the owning
  // browser texture id.
  const surfaceUnlockRectDef = lineNumber(d3d8Shim.lines,
    (line) => /HRESULT\s+UnlockRect\s*\(\s*\)\s*override/.test(line));
  assertExact(errors, facts.d3d8Shim, "surfaceUnlockRectDefLine", surfaceUnlockRectDef, 1282,
    "BrowserD3DSurface UnlockRect");
  if (surfaceUnlockRectDef > 0) {
    const range = functionBodyLineRange(d3d8Shim.lines, surfaceUnlockRectDef);
    if (!range) {
      errors.push("BrowserD3DSurface UnlockRect: body not found");
    } else {
      const capture = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /unlock_and_capture\s*\(\s*&dirty\s*\)/);
      const update = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /browser_texture_update\s*\(\s*m_owner_texture_id\s*,\s*m_owner_texture_level/);
      facts.d3d8Shim.surfaceUnlockRectCaptureLine = capture;
      facts.d3d8Shim.surfaceUnlockRectUpdateLine = update;
      if (capture === -1) {
        errors.push("BrowserD3DSurface UnlockRect: unlock_and_capture(&dirty) not found");
      }
      if (update === -1) {
        errors.push("BrowserD3DSurface UnlockRect: browser_texture_update(m_owner_texture_id, ...) not found");
      } else if (capture !== -1 && !(capture < update)) {
        errors.push("BrowserD3DSurface UnlockRect: unlock_and_capture must precede browser_texture_update");
      }
    }
  }

  // Texture LockRect(level) delegates to surface level LockRect.
  const textureLockRectDef = lineNumber(d3d8Shim.lines,
    (line) => /HRESULT\s+LockRect\s*\(\s*UINT\s+level,\s*D3DLOCKED_RECT\s*\*\s*locked_rect,\s*const\s+RECT\s*\*rect,\s*DWORD\s+flags\s*\)\s*override/.test(line));
  assertExact(errors, facts.d3d8Shim, "textureLockRectDefLine", textureLockRectDef, 1729,
    "BrowserD3DTexture LockRect(level)");
  if (textureLockRectDef > 0) {
    const range = functionBodyLineRange(d3d8Shim.lines, textureLockRectDef);
    if (!range) {
      errors.push("BrowserD3DTexture LockRect: body not found");
    } else {
      const delegate = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /m_levels\s*\[\s*level\s*\]\s*->\s*LockRect\s*\(\s*locked_rect\s*,\s*rect\s*,\s*flags\s*\)/);
      assertPresent(errors, facts.d3d8Shim, "textureLockRectDelegateLine", delegate,
        "BrowserD3DTexture LockRect delegates to m_levels[level]->LockRect");
    }
  }
  // Texture UnlockRect(level) calls browser_texture_update on success.
  const textureUnlockRectDef = lineNumber(d3d8Shim.lines,
    (line) => /HRESULT\s+UnlockRect\s*\(\s*UINT\s+level\s*\)\s*override/.test(line));
  assertExact(errors, facts.d3d8Shim, "textureUnlockRectDefLine", textureUnlockRectDef, 1742,
    "BrowserD3DTexture UnlockRect(level)");
  if (textureUnlockRectDef > 0) {
    const range = functionBodyLineRange(d3d8Shim.lines, textureUnlockRectDef);
    if (!range) {
      errors.push("BrowserD3DTexture UnlockRect: body not found");
    } else {
      const capture = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /unlock_and_capture\s*\(\s*&dirty\s*\)/);
      const update = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /browser_texture_update\s*\(\s*m_browser_texture_id\s*,\s*level/);
      facts.d3d8Shim.textureUnlockRectCaptureLine = capture;
      facts.d3d8Shim.textureUnlockRectUpdateLine = update;
      if (capture === -1) errors.push("BrowserD3DTexture UnlockRect: unlock_and_capture(&dirty) not found");
      if (update === -1) {
        errors.push("BrowserD3DTexture UnlockRect: browser_texture_update(m_browser_texture_id, level, ...) not found");
      } else if (capture !== -1 && !(capture < update)) {
        errors.push("BrowserD3DTexture UnlockRect: unlock_and_capture must precede browser_texture_update");
      }
    }
  }
  // browser_texture_update() drives the JS hook wasm_d3d8_browser_texture_update.
  const browserTextureUpdateDef = lineNumber(d3d8Shim.lines,
    (line) => /\bvoid\s+browser_texture_update\s*\(\s*UINT\s+texture_id/.test(line));
  if (browserTextureUpdateDef === -1) {
    errors.push("browser_texture_update(UINT texture_id, ...) definition not found");
  } else {
    const range = functionBodyLineRange(d3d8Shim.lines, browserTextureUpdateDef);
    if (!range) {
      errors.push("browser_texture_update: body not found");
    } else {
      const hook = firstMatchInRange(d3d8Shim.lines, range.start, range.end,
        /wasm_d3d8_browser_texture_update\s*\(/);
      assertPresent(errors, facts.d3d8Shim, "browserTextureUpdateHookLine", hook,
        "browser_texture_update calls wasm_d3d8_browser_texture_update");
    }
  }

  // ------------------------------------------------------------------
  // 6. Focused runtime proof: original BinkVideoPlayer + real
  //    W3DVideoBuffer reaches the browser texture-upload boundary and the
  //    original W3DDisplay::drawVideoBuffer presentation sink.
  // ------------------------------------------------------------------
  assertExact(errors, facts.runtimeSmoke, "w3dBufferLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /W3DVideoBuffer\s+buffer\s*\(\s*VideoBuffer::TYPE_X8R8G8B8\s*\)/.test(line)), 447,
    "runtime smoke W3DVideoBuffer allocation object");
  assertExact(errors, facts.runtimeSmoke, "w3dAllocateLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /buffer\.allocate\s*\(\s*stream\s*->\s*width\s*\(\s*\)\s*,\s*stream\s*->\s*height\s*\(\s*\)\s*\)/.test(line)), 448,
    "runtime smoke W3DVideoBuffer allocate(stream dimensions)");
  assertExact(errors, facts.runtimeSmoke, "textureWidthLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /buffer\.textureWidth\s*\(\s*\)\s*==\s*expected_texture_width/.test(line)), 458,
    "runtime smoke W3DVideoBuffer textureWidth check");
  assertExact(errors, facts.runtimeSmoke, "textureHeightLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /buffer\.textureHeight\s*\(\s*\)\s*==\s*expected_texture_height/.test(line)), 460,
    "runtime smoke W3DVideoBuffer textureHeight check");
  assertExact(errors, facts.runtimeSmoke, "pitchLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /buffer\.pitch\s*\(\s*\)\s*==\s*expected_texture_width\s*\*\s*4/.test(line)), 462,
    "runtime smoke W3DVideoBuffer pitch check");
  assertExact(errors, facts.runtimeSmoke, "allocateUploadLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /surface unlock did not upload the initial texture/.test(line)), 469,
    "runtime smoke allocation surface unlock upload check");
  assertExact(errors, facts.runtimeSmoke, "frameDecompressLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /stream\s*->\s*frameDecompress\s*\(\s*\)/.test(line)), 472,
    "runtime smoke BinkVideoStream::frameDecompress");
  assertExact(errors, facts.runtimeSmoke, "frameRenderLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /stream\s*->\s*frameRender\s*\(\s*&buffer\s*\)/.test(line)), 473,
    "runtime smoke BinkVideoStream::frameRender(&W3DVideoBuffer)");
  assertExact(errors, facts.runtimeSmoke, "renderUploadLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /frameRender through W3DVideoBuffer did not upload the texture/.test(line)), 477,
    "runtime smoke frameRender upload check");
  assertExact(errors, facts.runtimeSmoke, "nonzeroChecksumLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /uploaded an all-zero W3DVideoBuffer texture/.test(line)), 489,
    "runtime smoke nonzero texture checksum check");
  assertExact(errors, facts.runtimeSmoke, "drawVideoBufferCallLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /display->W3DDisplay::drawVideoBuffer\s*\(\s*&buffer/.test(line)), 377,
    "runtime smoke original W3DDisplay::drawVideoBuffer call");
  assertExact(errors, facts.runtimeSmoke, "drawIndexedCheckLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /drawVideoBuffer did not issue one indexed draw/.test(line)), 392,
    "runtime smoke drawVideoBuffer indexed draw check");
  assertExact(errors, facts.runtimeSmoke, "exportLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /extern\s+"C"\s+int\s+run_bink_w3d_video_buffer_upload_smoke\s*\(\s*\)/.test(line)), 631,
    "runtime smoke exported function");
  assertExact(errors, facts.runtimeSmoke, "ww3dInitLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /WW3D::Init\s*\(\s*nullptr\s*,\s*nullptr\s*,\s*false\s*\)/.test(line)), 643,
    "runtime smoke WW3D::Init");
  assertExact(errors, facts.runtimeSmoke, "setRenderDeviceLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /WW3D::Set_Render_Device\s*\(\s*0\s*,\s*1024\s*,\s*768/.test(line)), 647,
    "runtime smoke WW3D::Set_Render_Device");
  assertExact(errors, facts.runtimeSmoke, "decodeReadyLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /WasmBinkProviderCanDecodeFrames\s*\(\s*\)\s*==\s*1/.test(line)), 671,
    "runtime smoke browser decode-ready hook gate");
  assertExact(errors, facts.runtimeSmoke, "openGcLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /player\s*->\s*open\s*\(\s*AsciiString\s*\(\s*"GC_Background"\s*\)\s*\)/.test(line)), 673,
    "runtime smoke GC_Background open");
  assertExact(errors, facts.runtimeSmoke, "loadVsLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /player\s*->\s*load\s*\(\s*AsciiString\s*\(\s*"VS_small"\s*\)\s*\)/.test(line)), 675,
    "runtime smoke VS_small load");
  assertExact(errors, facts.runtimeSmoke, "windowManagerPlayLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /video_manager\.playMovie\s*\(\s*window\s*,\s*AsciiString\s*\(\s*"VS_small"\s*\)/.test(line)), 545,
    "runtime smoke WindowVideoManager::playMovie");
  assertExact(errors, facts.runtimeSmoke, "windowManagerAttachCheckLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /playMovie did not attach a VideoBuffer/.test(line)), 554,
    "runtime smoke WindowVideoManager attached VideoBuffer check");
  assertExact(errors, facts.runtimeSmoke, "windowManagerUpdateLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /video_manager\.update\s*\(\s*\)/.test(line)), 577,
    "runtime smoke WindowVideoManager::update");
  assertExact(errors, facts.runtimeSmoke, "windowManagerUpdateUploadLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /WindowVideoManager::update did not upload decoded Bink pixels/.test(line)), 585,
    "runtime smoke WindowVideoManager update upload check");
  assertExact(errors, facts.runtimeSmoke, "windowManagerPresentLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /present_uploaded_video_buffer\s*\(\s*\*w3d_buffer/.test(line)), 598,
    "runtime smoke WindowVideoManager W3D presentation call");
  assertExact(errors, facts.runtimeSmoke, "windowManagerResetLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /video_manager\.reset\s*\(\s*\)/.test(line)), 612,
    "runtime smoke WindowVideoManager::reset");
  assertExact(errors, facts.runtimeSmoke, "windowManagerExerciseCallLine",
    lineNumber(runtimeSmoke.lines,
      (line) => /exercise_window_video_manager\s*\(\s*\*player\s*\)/.test(line)), 677,
    "runtime smoke WindowVideoManager exercise call");

  assertExact(errors, facts.runtimeBrowserHarness, "moduleLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /createBinkW3DVideoBufferBrowserSmokeModule/.test(line)), 204,
    "browser harness ES module export");
  assertExact(errors, facts.runtimeBrowserHarness, "textureCreateHookLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /cncPortD3D8TextureCreate/.test(line)), 237,
    "browser harness D3D texture create hook");
  assertExact(errors, facts.runtimeBrowserHarness, "textureUpdateHookLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /cncPortD3D8TextureUpdate/.test(line)), 242,
    "browser harness D3D texture update hook");
  assertExact(errors, facts.runtimeBrowserHarness, "textureReleaseHookLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /cncPortD3D8TextureRelease/.test(line)), 257,
    "browser harness D3D texture release hook");
  assertExact(errors, facts.runtimeBrowserHarness, "drawIndexedHookLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /cncPortD3D8DrawIndexed:\s*\(event\)\s*=>/.test(line)), 262,
    "browser harness D3D draw indexed hook");
  assertExact(errors, facts.runtimeBrowserHarness, "copyHookLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /module\.cncPortBinkCopyToBuffer\s*=/.test(line)), 290,
    "browser harness Bink copy hook");
  assertExact(errors, facts.runtimeBrowserHarness, "runtimeCcallLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /run_bink_w3d_video_buffer_upload_smoke/.test(line)), 344,
    "browser harness runtime ccall");
  assertExact(errors, facts.runtimeBrowserHarness, "copyCountLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /Expected three Bink copy events/.test(line)), 391,
    "browser harness copy event count check");
  assertExact(errors, facts.runtimeBrowserHarness, "textureCreateCheckLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /Missing W3DVideoBuffer texture create/.test(line)), 432,
    "browser harness W3DVideoBuffer texture create check");
  assertExact(errors, facts.runtimeBrowserHarness, "textureUploadCheckLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /Missing nonzero W3DVideoBuffer texture upload/.test(line)), 445,
    "browser harness nonzero texture upload check");
  assertExact(errors, facts.runtimeBrowserHarness, "drawEventCountLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /Expected three W3DDisplay::drawVideoBuffer indexed draws/.test(line)), 462,
    "browser harness drawVideoBuffer draw count check");
  assertExact(errors, facts.runtimeBrowserHarness, "drawProbeLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /Bink W3DDisplay presentation draw probe failed/.test(line)), 485,
    "browser harness presentation draw probe check");
  assertExact(errors, facts.runtimeBrowserHarness, "screenshotLine",
    lineNumber(runtimeBrowserHarness.lines,
      (line) => /page\.screenshot\s*\(\s*\{\s*path:\s*screenshotPath/.test(line)), 488,
    "browser harness screenshot capture");

  assertExact(errors, facts.cmake, "targetDefLine",
    lineNumber(cmake.lines,
      (line) => /add_executable\s*\(\s*bink-w3d-video-buffer-browser-smoke/.test(line)), 6516,
    "CMake bink-w3d-video-buffer-browser-smoke target");
  assertExact(errors, facts.cmake, "targetSourceLine",
    lineNumber(cmake.lines,
      (line) => /tests\/bink_w3d_video_buffer_upload_smoke\.cpp/.test(line)), 6517,
    "CMake bink_w3d_video_buffer_upload_smoke.cpp source");
  assertExact(errors, facts.cmake, "displayRuntimeLinkLine",
    firstMatchInRange(cmake.lines, facts.cmake.targetDefLine, facts.cmake.targetDefLine + 20,
      /zh_w3d_display_drawimage_runtime/), 6527,
    "CMake original W3DDisplay/W3DVideoBuffer display runtime link");
  assertExact(errors, facts.cmake, "exportNameLine",
    lineNumber(cmake.lines,
      (line) => /createBinkW3DVideoBufferBrowserSmokeModule/.test(line)), 6590,
    "CMake browser smoke export name");
  assertExact(errors, facts.cmake, "exportFunctionLine",
    lineNumber(cmake.lines,
      (line) => /_run_bink_w3d_video_buffer_upload_smoke/.test(line)), 6594,
    "CMake browser smoke exported function");
  assertExact(errors, facts.packageJson, "scriptLine",
    lineNumber(packageJson.lines,
      (line) => /"test:bink-w3d-video-buffer-browser"/.test(line)), 116,
    "package.json test:bink-w3d-video-buffer-browser script");
  assertExact(errors, facts.packageJson, "presentationAliasLine",
    lineNumber(packageJson.lines,
      (line) => /"test:bink-w3d-video-presentation-browser"/.test(line)), 117,
    "package.json test:bink-w3d-video-presentation-browser alias");

  // ------------------------------------------------------------------
  const report = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
    open:
      "Original BinkVideoPlayer browser upload through a real W3DVideoBuffer " +
      "is now covered by test:bink-w3d-video-buffer-browser, including decoded " +
      "sidecar pixels copied by BinkVideoStream::frameRender into the original " +
      "W3DVideoBuffer surface, emitted through the browser D3D8 texture update " +
      "hook, presented by original W3DDisplay::drawVideoBuffer, and now " +
      "also exercised through a focused original WindowVideoManager::playMovie/update " +
      "path that attaches the real W3DVideoBuffer to a GameWindow. Full original " +
      "Display / load-screen / score-screen movie-loop ownership and Bink/audio " +
      "sync remain open M8 tasks.",
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
