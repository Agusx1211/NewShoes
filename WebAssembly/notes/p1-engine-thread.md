# P1 — engine thread live in play.html (design + running state)

Owner directive 2026-07-10: keep working until the engine-thread architecture
is IN play.html. Design context: IDEAS.md "the browser as a 2003 PC"; P0
evidence: DONE.md "Engine-thread architecture P0 spike" + threaded_boot_probe.
This note is the durable coordination doc for the P1 lanes — update it as
gates pass so any future session can resume without re-deriving.

## Scope (P1)

play.html boots the REAL engine on a pthread behind `?threads=1`
(dist-threaded build; DEFAULT non-threaded path must stay behavior-identical
— the owner plays on it). Gate ladder, each verified by harness screenshot or
state check before the next starts:

- GATE A: threaded play boot reaches D3D8 device creation; GL executor runs
  in the ENGINE realm on a transferred OffscreenCanvas; cleared frame visible.
- GATE B: full real init to TITLE SCREEN; screenshot parity vs non-threaded.
- GATE C: shellmap renders; paced frame loop on the engine thread (client
  60Hz / logic 30Hz preserved); menu clickable via input dispatch; RPC state
  queries work.
- GATE D: Mac Metal verification + owner test. Only then discuss default-on.

Out of P1 scope (P2+): OPFS-as-disk reads (P1 keeps MEMFS mounts, engine-side
reads go through emscripten's pthread→main FS proxy), full audio parity
(P1 may ship engine-realm audio stubs that forward to main or mute cleanly —
crash-free and obvious-TODO), MP, save/load verification on the threaded path.

## Settled design decisions (do not re-litigate in lanes)

1. NO `-sPROXY_TO_PTHREAD` (hard emcc error with `--no-entry`). The engine
   pthread is spawned explicitly. After a setup handshake it calls
   `emscripten_set_main_loop` ON the pthread (the PROXY_TO_PTHREAD rendering
   pattern) so the worker returns to its event loop between frames: worker
   rAF drives frames, postMessage channels stay live, GL presents (P0 proved
   rAF + presentation work in workers).
2. `-sPTHREAD_POOL_SIZE=1` in the threaded build: the single pool worker is
   deterministic, so main-realm JS can prepare THAT worker's realm (import
   executor module, receive OffscreenCanvas via postMessage transfer, install
   Module.cncPortD3D8* hooks on the worker-realm Module) while it idles,
   BEFORE the engine pthread is spawned onto it. Engine creates no threads of
   its own (original threading already stubbed for wasm).
3. Realm stub injection: a small `--pre-js` (or js-library) baked into
   cnc-port.js runs in every realm; when `ENVIRONMENT_IS_PTHREAD` it installs
   a namespaced `self.addEventListener("message")` listener (coexists with
   emscripten's `onmessage`) handling `{__cncRealm:...}` messages: import the
   executor module, adopt the transferred canvas, report ready. Main finds
   the worker via `Module.PThread` (unused/running workers) and talks to it
   directly.
4. GL executor split: the 19 `Module.cncPortD3D8*` hooks (enumerated from
   wasm_d3d8_shim.cpp) + their closure state move to a realm-agnostic ES
   module consumed by BOTH the classic main-thread path (non-threaded build,
   unchanged behavior) and the engine realm. Direct HEAP view access inside
   the executor must go through a "current views" accessor (SAB + growth
   invalidates cached views).
5. All engine-touching calls execute ON the engine thread. Main-realm bridge
   forwards RPC commands and input events over the worker message channel
   (or emscripten_dispatch_to_thread) — main NEVER calls engine exports
   directly in threaded mode. Pure-JS RPC commands (mounts, screenshots,
   logs) stay main-side; route at the rpc dispatcher choke point.
6. Mounts stay EXACTLY as today (main-thread MEMFS writes); engine-thread
   file reads use emscripten's synchronous pthread→main FS proxying. Accept
   the proxy cost for P1 (RAMFile = one big read per inner file; TOC parse =
   ~60k small reads ≈ seconds at boot); OPFS-in-engine-realm is P2.
7. Audio for P1: engine-realm MSS/audio hook stubs forward via postMessage to
   the main-realm Web Audio implementation, reading sample bytes from the
   SHARED heap views main-side (zero extra copies); if a specific hook is
   synchronous-return and unproxyable, stub it mute + log once + TODO.

## Lane structure

- P1a scaffold (task #5): C entry `cnc_port_engine_thread_boot` (spawn,
  handshake flag in shared memory, set_main_loop-on-pthread calling the real
  frame path), threaded-build flags (POOL_SIZE=1), pre-js realm stub +
  message protocol, canvas transfer, minimal "cleared frame" proof = GATE A
  prerequisite.
- P1b executor extraction (task #6): mechanical but large; non-threaded
  regression bar: play.html boot screenshot parity + existing render smokes
  green before/after on the DEFAULT build.
- P1c integration (task #7): play.mjs `?threads=1` path, RPC/input
  forwarding, paced loop on engine thread, gates B/C, Mac deploy (GATE D).

## Running state (update me)

- [x] P0 spike merged (build green, pthread runs real init, FS proxy works).
- [x] Recon map of bridge.js delivered.
- [ ] P1a GATE A
- [x] P1b extraction + non-threaded parity proof (see below)
- [ ] P1c GATE B (title), GATE C (shellmap+input+RPC)
- [ ] GATE D Mac Metal + owner

## P1b result: executor extracted to harness/d3d8_executor.mjs

The full D3D8->WebGL2 executor (605 top-level decls, ~12.3k lines: the 20
`cncPortD3D8*` hooks, all GL state/caches, SM1 shader tier, DXT decode,
canvas sizing/context-loss handling, the `globalThis.__cnc*` debug helpers,
and the canvas paint/sample utilities) now lives in
`harness/d3d8_executor.mjs` as `createD3D8Executor(env) -> { hooks, diag }`.
bridge.js constructs it exactly once right after `harnessState` and spreads
`hooks` into the Module config (`loadWasmModule`) and
`window.CnCPort.d3d8BridgeCallbacks()`.

env contract (what P1c must provide in the worker realm — full docs at the
top of d3d8_executor.mjs):

- `canvas` (required; OffscreenCanvas in the worker) — `gl`/`s3tc`/
  `fallbackContext` optional: main passes its page-lifetime objects for exact
  identity; when `gl` is omitted the executor creates the WebGL2 context
  itself (worker path; `preserveDrawingBuffer` overridable via env).
- `log` (bridge `recordLog` on main; realm-local sink in the worker),
  `state` (bridge `harnessState`; the executor writes `.canvas`, `.graphics`,
  `.engineDisplaySize` into it).
- `getHeapU8/U16/U32/F32/F64` fresh-view accessors + `getModule`. Heap-read
  audit result: `copyD3DMatrixFromHeap` via `getHeapF32()` is the ONLY direct
  heap read in the executor (per-call fresh, SAB/growth safe); every other
  payload is a JS object built per-call by the EM_JS side
  (wasm_d3d8_shim.cpp), which also owns the `Module.__cncPortD3D8*` payload
  caches — those live on the ENGINE realm's Module and never cross into
  bridge.js.
- DOM access inside the executor is `typeof window/document`-guarded
  (banner, resize/fullscreen/dpr listeners, getBoundingClientRect fallback),
  so the module is loadable in a worker realm as-is; `env.dom` is reserved.

diag is the only bridge->executor surface: the ~26 functions +
`d3d8Textures` + ~57 D3D constants bridge still references (destructured
once, stable bindings), plus getters for mutable state
(`d3d8DiagLevelValue`, `webglContextLost/At`, `gl`, `s3tc`) and
`setBoundDrawDiagnosticsSetter(fn)`, which `loadWasmModule` wires to the
`cnc_port_d3d8_set_bound_draw_diagnostics` cwrap.

Non-threaded parity proof (dev box, SwiftShader, dist built from main
da47ce04, 2026-07-10):

- `shellmap_real_init_gate.mjs` (real init -> shellmap render + canvas
  screenshot): PASS before and after; the two 1280x720 canvas PNGs are
  PIXEL-IDENTICAL (PIL diff bbox None).
- `test:io-worker-offthread`: PASS before/after.
- d3d8 node smokes against the existing dist (d3d8-shim,
  render-state-mapping, texture-upload-readiness, texture-stage-state-
  mapping, texture-lifetime): all PASS.
- Pre-existing reds on the CURRENT stale dist (fail identically on pristine
  main and on the extraction; normalized logs diff to zero hunks):
  `harness/smoke.mjs` (D3D8 buffer hint probe: wasm-side hint counters all
  0), `startup_vertical_smoke.mjs` (`assertFunctionLexiconRuntimeFrontier`),
  `issue_recorder_ui_smoke.mjs` (record-button click timeout). These smokes
  normally run after `npm run build:port`; re-check after a fresh build.
