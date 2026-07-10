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

## Recon facts for P1c (from the 2026-07-10 bridge map; line numbers pre-P1b)

- Module config choke point: bridge.js ~15778-15836 — ALL hooks (19+1 d3d8,
  13 MSS audio, 2 UDP net, GDI text) are installed via the single object
  passed to createCncPortModule. Dist selection ~82-108 (`?dist=`,
  play.html → dist-release default).
- Frame loop lives in play.mjs: runPacedFrameLoop ~389 (rAF → RPC
  `realEngineFramePaced({runLogic})` per display frame, catchup≤2),
  runCoupledFrameLoop ~512 fallback. In threaded mode this loop must move
  INTO the engine realm (worker rAF calling the export directly); play.mjs
  should only observe.
- Input: DOM listeners bridge.js ~32677-32904 → lite exports
  `setBrowserInputLite` / `postBrowserMessageLite` (numeric args — fits the
  P1a callExport primitive). Full-path `postBrowserMessage` returns JSON.
- Audio: 13 Module.cncPortMss* hooks, bodies ~2733-3480; they read sample
  bytes via heap views and complete back into the engine via cwrap'd
  `cnc_port_mss_complete_*` exports (notifyEngineAudioCompleted ~2712-2731).
  Threaded plan: EM_JS runs engine-realm → forward payload+ptr/size to main
  (main realm's HEAPU8 is a view over the SAME SharedArrayBuffer — zero-copy
  reads); completions route back via the callExport message primitive.
- RPC: single async `rpc(command,payload)` dispatcher ~21415+, ~95% of
  commands call wasm exports (many via cwrap/string returns). Threaded
  routing: an async engine-call facade (`ccall`-shaped message to the engine
  realm: name, returnType, argTypes, args) with per-command opt-in; commands
  not yet routed return an explicit "unsupported in threaded mode" error.
- Mounts/screenshots/dumps are main-side JS and stay unchanged (canvas
  placeholder still screenshots normally when control is transferred).
- EM_JS `Module.__cncPort*` mutable caches live in whichever realm the
  engine runs — harness diagnostics that read them become engine-realm
  queries (degrade gracefully in threaded mode for P1).

## P1a mechanism decision (2026-07-10, settled by probe evidence)

**Shipped: `emscripten_set_main_loop` ON the pthread** (design decision #1 as
written), NOT the JS-driven-ticks fallback. Verified end to end on emsdk
3.1.6 + headless Chromium by `harness/p1_scaffold_probe.mjs` (18/18 checks:
heartbeat advances, main rAF alive, transferred OffscreenCanvas animates a
color-cycling clear presented from the engine thread). Mechanics on 3.1.6,
for P1c:

- No special flags or thread attributes needed. The pthread entry calls
  `emscripten_set_main_loop(tick, /*fps=*/0, /*simulate_infinite_loop=*/1)`;
  fps=0 installs an rAF scheduler (`Browser.mainLoop` is realm-local JS and
  Chromium dedicated workers have `requestAnimationFrame`);
  simulate_infinite_loop throws the JS string `'unwind'`, which
  `cnc-port.worker.js` catches and keeps the worker alive ("completed its
  main entry point with an `unwind`"). The C stack frame of the entry is
  intentionally leaked (documented emscripten behavior). No
  `emscripten_exit_with_live_runtime` needed.
- `emscripten_set_main_loop` is NOT proxied ("Runs natively in pthread" in
  library_browser.js) — ticks run in the worker realm on the pthread's wasm
  stack, so EM_JS bodies called from a tick (e.g. the D3D8 shim's
  `wasm_d3d8_browser_clear_target`) resolve `Module` to the WORKER-realm
  Module: exactly the realm where the executor installs `cncPortD3D8*`.
- **Handshake ordering is load-bearing**: between
  `_cnc_port_engine_thread_boot()` and `_cnc_port_engine_thread_go()` the
  pthread blocks its worker's event loop in an `emscripten_thread_sleep`
  poll, so postMessages to that worker queue un-handled. ALL realm prep
  (connect/setup/canvas transfer) must complete BEFORE boot; after go the
  entry unwinds and the worker's event loop (rAF ticks + realm-stub port
  messages) runs normally. `go` itself is a shared-memory atomic, no message.
- Realm stub message routing (src/threads_realm_stub.pre.js): main→worker
  bootstrap messages ride `{target:'setimmediate', __cncRealm:{...}}` on the
  default channel — 3.1.6's worker.js has a silent no-op branch for
  `target:'setimmediate'` and err()-spams for any other unknown shape; the
  main-side PThread handler echoes such messages back (harmless, stub
  ignores reply-shaped cmds). Real command traffic (setup/callExport) moves
  to a dedicated MessageChannel port transferred with `{cmd:'connect'}`, so
  it never touches emscripten's channels. NOTE for any emsdk upgrade: the
  'setimmediate' silencer is a 3.1.6 internal; re-check both handlers.
- Finding the worker from the main realm (3.1.6 `Module.PThread`):
  `PThread.unusedWorkers` (pool workers not yet running a pthread),
  `PThread.runningWorkers`, `PThread.pthreads` (pthread_t → info). With
  `PTHREAD_POOL_SIZE=1` and PTHREAD_POOL_DELAY_LOAD unset, startup holds a
  run dependency until the pool worker has loaded cnc-port.js — so once the
  factory promise resolves, `PThread.unusedWorkers[0]` is the (stub-armed)
  engine worker. The pre-js guard for "am I the pthread realm" is
  `Module["ENVIRONMENT_IS_PTHREAD"]` (set by worker.js on the Module object
  BEFORE the factory runs; the `var ENVIRONMENT_IS_PTHREAD` declaration
  comes after the pre-js insertion point).
- `pthread_create` beyond the pool (observed re-running the P0 probe on the
  POOL_SIZE=1 build): warns "thread pool is exhausted", allocates + loads a
  new worker on demand, rc still 0, thread starts asynchronously. The engine
  itself creates no threads, so P1 stays within the single deterministic
  pool worker; the P0 probe's second (init) thread simply lands on an
  on-demand worker and its no-assets init finding is now recorded as
  still-running-at-30s instead of the abort (not asserted either way).

## Running state (update me)

- [x] P0 spike merged (build green, pthread runs real init, FS proxy works).
- [ ] Recon map of bridge.js delivered (agent, in flight).
- [x] P1a runtime scaffold (GATE A prerequisite) — 2026-07-10:
      PTHREAD_POOL_SIZE=1 + `--pre-js` realm stub
      (src/threads_realm_stub.pre.js) + boot/go/heartbeat scaffold
      (src/wasm_engine_thread_boot.cpp);
      `node harness/p1_scaffold_probe.mjs` green 18/18 (animated engine-
      thread clear on a transferred OffscreenCanvas, callExport round trip);
      P0 probe still green; default build verified untouched (no -pthread /
      pool / pre-js flags in build/wasm/build.ninja). Mechanism decision
      above. GATE A itself (real D3D8 device creation in the engine realm)
      is P1b/P1c work on this scaffold.
- [ ] P1b extraction + non-threaded parity proof

- [x] Recon map of bridge.js delivered.
- [ ] P1a GATE A
- [x] P1b extraction + non-threaded parity proof (see below)
- [ ] P1c GATE B (title), GATE C (shellmap+input+RPC) — implementation landed
      (see "P1c implementation" below); gates in verification
- [ ] GATE D Mac Metal + owner

## P1c implementation (2026-07-10, lane P1c)

`play.html?threads=1` boots the REAL engine on the pthread. All threaded
logic branches on the flag; the default path is untouched JS-wise except the
GDI-hook extraction (verbatim move to gdi_executor.mjs).

Pieces (all under WebAssembly/):

- `src/wasm_engine_thread_boot.cpp`: the pthread main-loop tick now calls
  `Module.cncPortEngineThreadTick` (EM_JS, worker-realm Module) when
  installed; falls back to the P1a color clear (p1_scaffold_probe unchanged).
- `src/threads_realm_stub.pre.js`: `setup` passes `options` through to the
  module; a module-returned `handleCommand(msg, respond)` receives every
  unknown command (the whole P1c protocol lives in the re-loadable boot
  module, NOT the baked-in stub). NOTE: default-channel echoes also reach
  that handler — it must ignore unknown cmds (engine_realm_boot does).
- `harness/engine_realm_boot.mjs` (imported into the worker realm via setup):
  constructs the P1b d3d8 executor against the transferred OffscreenCanvas
  (executor creates its own GL context; diag level via setup options since
  the worker URL has no page params), installs GDI hooks (OffscreenCanvas 2D
  measureText/fillText works in workers), MSS forwarders (13 hooks; sample
  starts COPY the RIFF bytes worker-side — the Miles shim mallocs fresh PCM
  per start so the pointer must not be read async main-side; the copy is
  4-byte padded + dataPtr=4 so bridge's `!dataPtr` guard and dataPtr-relative
  reads work against the small buffer), UDP stubs (send->0/recv->null =
  bridge's disabled-endpoint behavior), the stepped-init pump (one init_step
  per tick), the paced loop (port of play.mjs runPacedFrameLoop: absolute
  logic schedule, catchup<=2, half-tick hysteresis) and the engineCall/input
  sinks. HARD RULE baked in: no wasm call in the worker realm before the
  first tick (an idle pool worker has wasm instantiated but no thread
  stack/TLS — everything queues until "live").
- `harness/bridge.js`: `cncPortThreadedMode` (?threads=1) — dist default
  dist-threaded; #viewport stays context-free (transferControlToOffscreen
  requires it) and the MAIN executor gets an invisible scratch canvas so the
  whole diag surface stays alive; threaded controller (prep: ping →
  MessagePort connect → canvas transfer → setup → attachMainPort; boot/go
  only inside realEngineInit); `threadedRpc` gate at the top of `rpc()`
  (routed commands run on the engine thread via engineCall; main-side-safe
  commands fall through; everything else returns an explicit "not yet
  supported in threaded mode" error — never a main-thread wasm call, never a
  hang); input forwarding (lite entries over the port, trailing-pointermove
  coalescing per microtask flush); audio completions redirected through
  engineCall; MSS bodies executed main-side with a fresh-view heap accessor
  (Module.wasmMemory buffer identity — main's cached HEAPU8 goes stale when
  the engine thread grows memory); worker status posts (500ms) drive
  harnessState.engineDisplaySize + `cncport:resolutionchange` /
  `cncport:threadedstatus` events; canvasInputPointFromEvent uses
  engineDisplaySize for the buffer aspect (the placeholder's width/height
  attributes freeze at transfer time).
- `harness/play.mjs`: threads=1 → dist-threaded default;
  runThreadedFrameLoop = rpc("threadedStartLoop") + status-event HUD (the
  page never drives frames in threaded mode). TDZ gotcha: the threadedMode
  const must be declared before the selectedCncPortDistDir() call near the
  top of the file.
- `harness/threaded_play_gate.mjs` (npm run verify:threaded-play): boots the
  real play page non-threaded (reference, ?dist=dist) and threaded, asserts
  GATE B (title, init on engine thread, non-black canvas screenshot) and
  GATE C (paced loop counters, forwarded pointermove visible in
  cnc_port_probe_browser_input cursor state, windows-dump state RPC).
  VERBOSE=1 streams page console; SKIP_REFERENCE=1 skips the reference boot.

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
