// Win32 GDI font/surface browser hooks for the C&C Generals Zero Hour wasm
// port, extracted VERBATIM from harness/bridge.js (P1c of the engine-thread
// work, see notes/p1-engine-thread.md) so the SAME rasterizer can run in two
// realms:
//   - main thread (today's default path: bridge.js constructs it once; glyphs
//     rasterize through a document.createElement("canvas") 2D context —
//     behavior-identical to the pre-split bridge.js),
//   - the engine pthread's worker realm (threaded mode), where the 2D scratch
//     surface is an OffscreenCanvas (Chromium supports measureText/fillText/
//     getImageData on OffscreenCanvas 2D contexts in workers).
//
// The C++ side (src/wasm_win32_gdi_browser.cpp) calls these SYNCHRONOUS hooks
// via EM_ASM on whatever thread runs the engine; the hooks are looked up on
// the CALLING realm's Module, which is why the engine realm needs its own
// installation in threaded mode (harness/engine_realm_boot.mjs).
//
// Hook contract (from wasm_win32_gdi_browser.cpp):
//   cncGdiMeasure(face, logicalHeight, weight, italic, str)
//       -> {width,height,ascent,overhang} | null
//   cncGdiRasterizeGlyph(face, logicalHeight, weight, italic, code, x, y,
//                        bitsPtr, bmpW, bmpH, stride, textColorRgb,
//                        bkColorRgb, opaque, heapu8) -> boolean
//       writes 24bpp BGR, DWORD-padded stride, top-down into the wasm heap
//       at bitsPtr through the CALLER-PROVIDED heapu8 view (the EM_ASM body
//       passes its realm's HEAPU8, fresh in the realm that grows memory).

export function createGdiHooks() {
  let gdiCanvas = null;
  let gdiCtx = null;

  function gdiCreateScratchCanvas() {
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      return document.createElement("canvas");
    }
    if (typeof OffscreenCanvas === "function") {
      return new OffscreenCanvas(1, 1);
    }
    return null;
  }

  function gdiEnsureContext() {
    if (gdiCtx) {
      return gdiCtx;
    }
    gdiCanvas = gdiCreateScratchCanvas();
    gdiCtx = gdiCanvas ? gdiCanvas.getContext("2d", { willReadFrequently: true }) : null;
    return gdiCtx;
  }

  function gdiFontCss(face, logicalHeight, weight, italic) {
    const px = Math.max(1, Math.abs((logicalHeight | 0) || 16));
    const wght = weight || 400;
    const ital = italic ? "italic " : "";
    const family = face && face.length ? JSON.stringify(String(face)) : "Arial";
    return `${ital}${wght} ${px}px ${family}`;
  }

  function gdiCssColor(rgb) {
    const v = rgb >>> 0;
    const r = v & 0xff;
    const g = (v >> 8) & 0xff;
    const b = (v >> 16) & 0xff;
    return `rgb(${r},${g},${b})`;
  }

  // Measure: synchronous canvas.measureText + fontBoundingBox metrics.  Returns
  // {width,height,ascent,overhang} in device pixels.  overhang is left at 0
  // because canvas TextMetrics exposes no direct equivalent; the original
  // FontCharsClass zeroes overhang for the Generals/Arial path regardless.
  function cncGdiMeasure(face, logicalHeight, weight, italic, str) {
    const ctx = gdiEnsureContext();
    if (!ctx || typeof str !== "string" || str.length === 0) {
      return null;
    }
    ctx.font = gdiFontCss(face, logicalHeight, weight, italic);
    const m = ctx.measureText(str);
    const px = Math.max(1, Math.abs((logicalHeight | 0) || 16));
    const ascent = Math.ceil(m.fontBoundingBoxAscent || (px * 0.8));
    const descent = Math.ceil(m.fontBoundingBoxDescent || (px * 0.2));
    const width = Math.ceil(m.width);
    return { width, height: ascent + descent, ascent, overhang: 0 };
  }

  // Rasterize one UTF-16 code unit at (x,y) honoring ETO_OPAQUE.  Writes 24bpp
  // BGR, DWORD-padded stride, top-down into the wasm heap at bitsPtr.
  function cncGdiRasterizeGlyph(
    face,
    logicalHeight,
    weight,
    italic,
    code,
    x,
    y,
    bitsPtr,
    bmpW,
    bmpH,
    stride,
    textColorRgb,
    bkColorRgb,
    opaque,
    heapu8,
  ) {
    const ctx = gdiEnsureContext();
    if (!ctx || bmpW <= 0 || bmpH <= 0 || stride < bmpW * 3) {
      return false;
    }
    if (!(heapu8 instanceof Uint8Array)) {
      return false;
    }
    if (gdiCanvas.width !== bmpW) {
      gdiCanvas.width = bmpW;
    }
    if (gdiCanvas.height !== bmpH) {
      gdiCanvas.height = bmpH;
    }
    ctx.font = gdiFontCss(face, logicalHeight, weight, italic);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    if (opaque) {
      ctx.fillStyle = gdiCssColor(bkColorRgb);
      ctx.fillRect(0, 0, bmpW, bmpH);
    }
    ctx.fillStyle = gdiCssColor(textColorRgb);
    ctx.fillText(String.fromCharCode(code), x, y);
    const img = ctx.getImageData(0, 0, bmpW, bmpH).data;
    for (let row = 0; row < bmpH; row++) {
      let dst = (bitsPtr | 0) + row * stride;
      const srcRow = row * bmpW * 4;
      for (let col = 0; col < bmpW; col++) {
        const s = srcRow + col * 4;
        heapu8[dst++] = img[s + 2]; // B
        heapu8[dst++] = img[s + 1]; // G
        heapu8[dst++] = img[s + 0]; // R
      }
    }
    return true;
  }

  return { cncGdiMeasure, cncGdiRasterizeGlyph };
}
