import { createD3D8Executor } from "./d3d8_executor.mjs";
import { createGdiHooks } from "./gdi_executor.mjs";
import setupOpfsRealmFiles from "./opfs_realm_files.mjs";

export default async function setupWorldBuilderRealm({
  canvas,
  Module,
  options,
  respond,
}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new Error("World Builder requires a transferred OffscreenCanvas");
  }
  if (!Module || typeof Module !== "object") {
    throw new Error("World Builder worker did not receive its WebAssembly module");
  }

  Module.canvas = canvas;
  const rendererState = { graphics: {} };
  const captureGraphicsDiagnostics =
    options?.captureGraphicsDiagnostics === true;
  let presentedFrames = 0;
  let skippedFrames = 0;
  let presentationAttempts = 0;
  let presentationError = "";
  const { hooks: d3d8Hooks, diag: d3d8Diag } = createD3D8Executor({
    canvas,
    state: rendererState,
    log(message, detail) {
      console.debug(`[world-builder graphics] ${message}`, detail ?? "");
    },
    getModule: () => Module,
    getHeapU8: () => Module.HEAPU8 ?? null,
    getHeapU16: () => Module.HEAPU16 ?? null,
    getHeapU32: () => Module.HEAPU32 ?? null,
    getHeapF32: () => Module.HEAPF32 ?? null,
    getHeapF64: () => Module.HEAPF64 ?? null,
    preserveDrawingBuffer: true,
  });
  const present = d3d8Hooks.cncPortD3D8Present;
  d3d8Hooks.cncPortD3D8Present = (...args) => {
    const result = present(...args);
    presentationAttempts += 1;
    const permit = Module._BrowserWorldBuilderTakeFramePresentationPermit?.() ===
      1;
    if (typeof respond === "function" && permit) {
      try {
        const bitmap = canvas.transferToImageBitmap();
        const graphics = rendererState.graphics ?? {};
        const diagnostics = captureGraphicsDiagnostics
          ? {
              warnings: graphics.d3d8Warnings ?? [],
              lastDraw: graphics.lastD3D8DrawIndexed ?? null,
              drawHistory: (graphics.d3d8DrawHistory ?? []).slice(-24),
              sceneDrawHistory:
                (graphics.d3d8SceneDrawHistory ?? []).slice(-24),
              texture: graphics.d3d8Texture ?? null,
            }
          : null;
        respond({ cmd: "worldBuilderFrame", bitmap, diagnostics }, [bitmap]);
        presentedFrames += 1;
      } catch (error) {
        Module._BrowserWorldBuilderReleaseFramePresentationPermit?.();
        presentationError = error?.message ?? String(error);
        if (presentationAttempts === 1) {
          console.error(
            "[world-builder graphics] frame presentation failed",
            presentationError,
          );
        }
      }
    } else if (!permit) {
      skippedFrames += 1;
    }
    return result;
  };
  for (const [name, hook] of Object.entries(d3d8Hooks)) {
    Module[name] = hook;
  }
  globalThis.worldBuilderD3D8Diagnostics = {
    state: rendererState,
    sampleCanvasPixel: d3d8Diag.sampleCanvasPixel,
    sampleCanvasRegion: d3d8Diag.sampleCanvasRegion,
    gl: d3d8Diag.gl,
    presentedFrames: () => presentedFrames,
    skippedFrames: () => skippedFrames,
    presentationAttempts: () => presentationAttempts,
    presentationError: () => presentationError,
    respondAvailable: typeof respond === "function",
  };

  const gdiHooks = createGdiHooks();
  Module.cncGdiMeasure = gdiHooks.cncGdiMeasure;
  Module.cncGdiRasterizeGlyph = gdiHooks.cncGdiRasterizeGlyph;

  const staged = await setupOpfsRealmFiles({
    Module,
    map: options?.opfsMap ?? {},
  });

  let renderer = "";
  try {
    const context = typeof d3d8Diag.gl === "function" ? d3d8Diag.gl() : null;
    if (context) {
      const extension = context.getExtension("WEBGL_debug_renderer_info");
      renderer = extension
        ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER);
    }
  } catch {
    renderer = "";
  }

  return {
    hooksInstalled: [
      ...Object.keys(d3d8Hooks),
      "cncGdiMeasure",
      "cncGdiRasterizeGlyph",
      ...staged.hooksInstalled,
    ],
    renderer,
  };
}
