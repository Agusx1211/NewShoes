#!/usr/bin/env node
// verify_bink_w3d_video_buffer_upload_frontier.mjs
//
// Source-only verifier (it reads files, never executes the engine or wasm)
// for the next M8 texture-upload frontier after BinkCopyToBuffer: how a
// decoded Bink frame travels from `BinkVideoStream::frameRender(VideoBuffer*)`
// through the abstract `VideoBuffer` contract, the W3D `W3DVideoBuffer`
// `TextureClass`/`SurfaceClass` ownership, and the browser D3D8 shim
// `LockRect`/`UnlockRect`/`wasm_d3d8_browser_texture_update` path that must
// carry dirty pixels out to the browser.
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
//      returns wasm-backed `m_pixels` memory and pitch; surface `UnlockRect`
//      delegates to `unlock_and_capture`; texture `UnlockRect(level)` calls
//      `browser_texture_update`, which drives the
//      `wasm_d3d8_browser_texture_update` JS hook (`Module.cncPortD3D8TextureUpdate`)
//      to carry dirty pixels to the browser.
//   5. The original presentation sink `W3DDisplay::drawVideoBuffer` exists and
//      binds the `W3DVideoBuffer` texture as a 2D quad — the path an original
//      `BinkVideoPlayer`-owned browser presentation flow must ultimately reach.
//
// OPEN (explicitly not claimed complete by this verifier): the original
// `BinkVideoPlayer` browser presentation through a real `W3DVideoBuffer` and
// `W3DDisplay::drawVideoBuffer`, verified by a harness screenshot, is NOT
// complete. This verifier only pins the source contract that such runtime
// presentation/upload wiring must preserve.
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
  };

  const binkPlayer = readSourceLines(SOURCES.binkPlayer);
  const videoPlayerH = readSourceLines(SOURCES.videoPlayerH);
  const w3dVideoBufferH = readSourceLines(SOURCES.w3dVideoBufferH);
  const w3dVideoBuffer = readSourceLines(SOURCES.w3dVideoBuffer);
  const w3dDisplay = readSourceLines(SOURCES.w3dDisplay);
  const d3d8Shim = readSourceLines(SOURCES.d3d8Shim);

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
  // Surface UnlockRect delegates to unlock_and_capture(nullptr).
  assertExact(errors, facts.d3d8Shim, "surfaceUnlockRectLine",
    lineNumber(d3d8Shim.lines,
      (line) => /HRESULT\s+UnlockRect\s*\(\s*\)\s*override\s*\{\s*return\s+unlock_and_capture\s*\(\s*nullptr\s*\)/.test(line)), 1282,
    "BrowserD3DSurface UnlockRect -> unlock_and_capture(nullptr)");

  // Texture LockRect(level) delegates to surface level LockRect.
  const textureLockRectDef = lineNumber(d3d8Shim.lines,
    (line) => /HRESULT\s+LockRect\s*\(\s*UINT\s+level,\s*D3DLOCKED_RECT\s*\*\s*locked_rect,\s*const\s+RECT\s*\*rect,\s*DWORD\s+flags\s*\)\s*override/.test(line));
  assertExact(errors, facts.d3d8Shim, "textureLockRectDefLine", textureLockRectDef, 1720,
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
  assertExact(errors, facts.d3d8Shim, "textureUnlockRectDefLine", textureUnlockRectDef, 1733,
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
  const report = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
    open:
      "Original BinkVideoPlayer browser presentation through a real " +
      "W3DVideoBuffer and W3DDisplay::drawVideoBuffer is NOT complete. " +
      "This verifier pins only the source contract (frameRender lock/copy/" +
      "unlock, VideoBuffer accessors, W3DVideoBuffer texture/surface " +
      "ownership, and the browser D3D8 shim LockRect/UnlockRect/" +
      "wasm_d3d8_browser_texture_update pixel-update path) that such " +
      "runtime presentation/upload wiring must preserve. A harness " +
      "screenshot of an original BinkVideoPlayer-owned flow rendered " +
      "through W3DDisplay::drawVideoBuffer remains an open M8 task.",
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
