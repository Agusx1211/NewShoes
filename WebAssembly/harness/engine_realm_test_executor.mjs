// engine_realm_test_executor.mjs — minimal TEST executor for the P1a
// scaffold probe (harness/p1_scaffold_probe.{html,mjs}).
//
// Imported dynamically INTO THE PTHREAD WORKER REALM by the realm stub
// (src/threads_realm_stub.pre.js, `setup` command). It is the stand-in for
// P1b's real realm-agnostic GL executor: it adopts the transferred
// OffscreenCanvas, creates a webgl2 context in the worker realm, and installs
// the one bridge hook the scaffold's tick path needs —
// Module.cncPortD3D8Clear, the hook the D3D8 shim's EM_JS
// wasm_d3d8_browser_clear_target looks up on the CALLING realm's Module.
//
// Bridge signature (from wasm_d3d8_shim.cpp): (flags, r, g, b, a, z, stencil)
// with r/g/b/a already split out of the D3DCOLOR. Alpha is forced opaque
// here so screenshots of the placeholder canvas never read as transparent
// black regardless of the D3DCOLOR's alpha bits.
//
// Presentation: an OffscreenCanvas obtained via transferControlToOffscreen
// auto-presents to its placeholder canvas when the worker task that drew to
// it completes — the scaffold draws inside worker-rAF callbacks
// (emscripten_set_main_loop fps=0 on the pthread), so no explicit commit is
// needed.

export default async function setupEngineRealmTestExecutor({ canvas, Module, realm }) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new Error("engine_realm_test_executor: no OffscreenCanvas transferred");
  }
  if (!Module || typeof Module !== "object") {
    throw new Error("engine_realm_test_executor: no worker-realm Module provided");
  }
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    throw new Error("engine_realm_test_executor: webgl2 context unavailable in worker realm");
  }

  let clearCalls = 0;
  Module.cncPortD3D8Clear = (flags, r, g, b, _a, _z, _stencil) => {
    clearCalls += 1;
    if (flags & 0x1 /* D3DCLEAR_TARGET */) {
      gl.clearColor(r / 255, g / 255, b / 255, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };
  // Introspection helper for the probe (via the stub's callExport-free
  // channel this stays worker-realm-local; exposed on Module for debugging).
  Module.cncPortTestExecutorClearCalls = () => clearCalls;

  return {
    hooksInstalled: ["cncPortD3D8Clear"],
    realm,
    contextOk: true,
  };
}
