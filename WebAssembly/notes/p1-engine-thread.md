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
- [x] P1a GATE A (subsumed: the real D3D8 device creates in the engine realm
      during the threaded boot; cleared/rendered frames present from the
      worker — proven by the GATE B run below)
- [x] P1b extraction + non-threaded parity proof (see below)
- [x] P1c GATE B (title) + GATE C (shellmap+input+RPC) — GREEN 2026-07-10,
      `node harness/threaded_play_gate.mjs` 13/13 on headless SwiftShader
      (gate-run-9): threaded boot to title in 133s (vs ~13 min wall for the
      non-threaded reference leg on the same box), real init 43/43 ON the
      engine pthread, shellmap load drained by the engine-thread paced loop,
      title screenshot = fully rendered shellmap
      (artifacts/screenshots/p1c-title-threaded.png vs
      p1c-title-nonthreaded.png), forwarded pointermove verified in
      cnc_port_probe_browser_input cursor state, realEngineDumpWindows
      round-trip, no worker GL context loss. SwiftShader rates: client
      ~1.1/s, logic ~2.2/s (catchup bound; sim slows gracefully under
      software-raster overload — exact 60/30 is a Mac Metal measurement).
- [ ] GATE D Mac Metal + owner (deploy dist-threaded + this branch's harness
      to cnc-gpu, verify 60/30 pacing + owner playtest behind ?threads=1)
- [x] P2 OPFS-as-disk mounts in threaded mode — GREEN 2026-07-10 (lane
      P2-integration): 64KB readahead in the fd intercept (TOC walk 2137ms
      -> 1.56ms), `?threads=1` mounts stream fetch->OPFS + stage handles
      pre-spawn, gate 14/14 with title in 17.4s and main-thread JS heap
      12MiB (2.2GB archive set on disk). See "P2 integration results".

## P1c root-cause find: Win32 CRITICAL_SECTION shim vs pthreads (2026-07-10)

The first threaded boot froze the ENGINE THREAD forever inside
`W3DMouse::draw` (marker `W3DDisplay.draw.mouse.before`; heartbeat frozen —
diagnosed with the new main-thread stall introspection
`CnCPort.engineModule()` + `cnc_port_real_engine_last_update_target`).
Root cause: WWLib's `CriticalSectionClass` (mutex.cpp) allocates a raw
`new char[sizeof(CRITICAL_SECTION)]` and calls `InitializeCriticalSection` —
the shim no-opped it, leaving the shim struct's `std::recursive_mutex`
UNCONSTRUCTED. Single-threaded builds never noticed (musl's no-thread pthread
stubs accept garbage); the pthread build parks the thread on the first lock.
Fixed in shims/windows.h: placement-new the recursive_mutex in
`InitializeCriticalSection` (DeleteCriticalSection stays inert — mixed
raw-buffer/by-value callers, musl mutex holds no resources).
Related trap for future shim work: shims/mutex.h and WWLib/mutex.h share the
`MUTEX_H` include guard — WWVegas headers (wwstring.h et al) pull WWLib's
version first from their own directory, so most TUs get WWLib's class + the
Win32 shims, NOT shims/mutex.h's spinlock classes.

## P1c gotchas (probe/page level, all fixed in this branch)

- bridge `locateFile` must map `.js` too: the pthread pool worker script
  (`cnc-port.worker.js`) otherwise resolves against harness/ and 404s — the
  module factory then waits on its worker-pool run dependency FOREVER.
- Gesture-less boots (headless `?autostart=1`): `AudioContext.resume()` stays
  PENDING (not rejected) without a user gesture — never `await` it unraced
  (bridge now races a 3s timeout; the first pointerdown/keydown re-resumes).
- Playwright element screenshots starve on the busy NON-threaded page (action
  pipeline can't get stability callbacks) — capture through the bridge's own
  `screenshot` RPC instead. Same for `waitForSelector("#overlay.hidden")`:
  needs `state:"attached"` (hidden = display:none never becomes "visible").
- In threaded mode the shellmap load runs inside the engine-loop's first
  frames (play.mjs skips the boot reveal-pump frames) — probes must wait for
  `state.threadedEngine.frame.loadSessionActive === false` (push-fed status,
  no port round trip) before judging pixels; port round-trips can lag tens of
  seconds behind long load frames.

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

## P2-prep results (lane P2-prep, 2026-07-10): OPFS-as-disk read layer proven

The isolated OPFS read layer (P2 core) is built and green end to end on the
threaded build: `npm run probe:p2-opfs` (harness/p2_opfs_probe.{html,mjs},
disposable) passes 24/24 on dev-box headless Chromium. What exists now:

- **io_worker `fetchToOpfs`** ({kind:"fetchToOpfs", url, opfsPath}): streamed
  fetch -> FileSystemSyncAccessHandle.write chunk-by-chunk (never whole-file
  resident), fetchArchive-shaped progress messages, responds {bytesWritten}.
  Byte-exactness covered by `test:io-worker-offthread` (extended, 15/15).
- **C-level fd intercept at the shims/io.h seam**: weak
  `cnc_port_opfs_intercept_{open,is_fd,read,lseek,close,size}` decls in io.h,
  consulted by new `WasmIo{Open,Read,Write,Lseek,Close}` wrappers BEFORE
  POSIX; strong defs in src/wasm_opfs_files.cpp (cnc-port only, both builds).
  Virtual read-only fds (base 0x0fd00000) for paths under prefixes registered
  via `cnc_port_opfs_register_prefix`; reads go through EM_JS to REALM-LOCAL
  `globalThis.__cncOpfs{Open,Size,Read,Close}` — i.e. the engine pthread's
  worker realm, bypassing the pthread->main FS proxy entirely. Inert-by-
  default proof: targets that don't link wasm_opfs_files.cpp resolve the weak
  decls to null (the ~90 legacy smokes); cnc-port with no registration always
  falls through to POSIX. Default `build:port` green, d3d8-shim-smoke PASS.
- **Realm staging module** harness/opfs_realm_files.mjs: imported into the
  pool-worker realm via the P1a stub's `setup` command; pre-opens sync access
  handles for a {enginePath -> opfsPath} map (carried in the module URL's
  `?map=` query — setup only forwards canvas/Module/realm), installs the
  __cncOpfs* functions + a diag responder on the same __cncRealm envelope
  (the stub ignores unknown cmds silently).
- **Probe**: own pthread entry (src/wasm_opfs_probe.cpp, does NOT touch
  wasm_engine_thread_boot.cpp) opens /assets/INIZH.big through the io.h seam
  and mirrors the engine's real patterns — BIG "BIGF" magic + header, full
  TOC walk with BYTE-WISE name reads (Win32BIGFileSystem::openArchiveFile's
  exact loop), 512 random 64KB lseek+reads, sequential full read, largest-
  entry (RAMFile-style) read — then repeats everything on a MEMFS copy via
  plain POSIX (= the pthread->main FS proxy). 5 sampled ranges + the largest
  entry FNV-verified against HTTP Range fetches: byte-exact.

**The throughput number (dev box, headless Chromium, shared/busy box; same-day
baselines):**

| pattern                    | OPFS via seam | FS proxy (MEMFS) | raw JS OPFS (P0 smoke) |
|---------------------------|---------------|------------------|------------------------|
| TOC walk (3462 tiny reads)| 1.9-2.0s      | 0.37-0.39s       | —                      |
| per-call overhead          | ~0.58ms       | ~0.11ms          | ~0.87ms (64KB random)  |
| random 64KB preads         | 96-105 MB/s   | 285-325 MB/s     | 72 MB/s                |
| sequential 1MB reads       | 160-217 MB/s  | 338-339 MB/s     | 402 MB/s               |
| 1.6MB whole-entry read     | 4.9-7.7ms     | 1.1ms            | —                      |

Reading of the numbers (decides P2 shape, honestly):

- The seam adds ~nothing: OPFS-through-C matches raw JS-worker OPFS on the
  same box/day. The ~0.6ms/call floor is Chromium's synchronous storage-IPC
  per `read()`, size-independent; streaming lands 160-400 MB/s.
- The FS proxy is FASTER per call — but that comparison is RAM vs disk: the
  MEMFS copy is resident in the wasm heap, which is exactly the ~2GB
  residency P2 exists to eliminate. OPFS trades ~0.5ms/call + disk streaming
  for near-zero memory. P2 viability is therefore about the BOOT PATTERN,
  not raw speed:
  - RAMFile whole-inner-file reads: fine as-is (1 call per file).
  - Byte-wise TOC walks are the hazard: ~60k tiny reads across the ~30
    archives would cost ~35s at 0.58ms/call (vs ~6s proxied). P2 integration
    MUST add small-read coalescing — either a C-side readahead buffer in the
    intercept layer (serve sequential small reads from a 64KB buffer = 1 OPFS
    call per 64KB, TOC cost collapses to proxy-level) or batch the TOC read
    at the engine seam. The readahead-in-intercept variant needs no engine
    edits.
- Expect materially better per-call numbers on the Mac M4 (real SSD, idle);
  dev-box numbers are the conservative bound.

**Contracts + gotchas for P2 integration (verified, not speculation):**

- The BIG open path is `_open` in shims/io.h — confirmed: Win32BIGFileSystem
  ::openArchiveFile -> TheLocalFileSystem->openFile -> LocalFile::open ->
  `_open` (LocalFile.cpp:270), reads/seeks/closes via `_read/_lseek/_close`,
  size via File::size() = lseek(END). USE_BUFFERED_IO (the fopen branch in
  LocalFile.cpp) is NOT defined in the wasm build. CreateFile/fopen in
  shims/windows.h are NOT on the BIG path — no windows.h changes needed.
- **Directory-enumeration contract**: Win32BIGFileSystem lists `*.big` via
  FindFirstFile -> shims/windows.h readdir+stat on MEMFS. OPFS-backed
  archives therefore need 0-byte MEMFS MARKER files at the engine paths;
  open() then intercepts to OPFS (probe proves marker stat size 0 + virtual
  fd size = real 18.7MB coexist). CAVEAT: anything reading sizes/mtimes from
  stat/FindFirstFile data (Win32LocalFileSystem::getFileInfo — used e.g. for
  the archive timestamp in Win32BIGFile::getFileInfo) sees the marker's
  zeros, not real values. Cover stat/access in the intercept (or write real
  sizes into markers) when something is proven to care.
- Registration is process-global shared state (wasm globals): register the
  prefix once from any realm; but `__cncOpfs*` staging is REALM-LOCAL. An
  open on a registered path in a realm WITHOUT staged handles falls through
  to POSIX (main-realm MEMFS mounts under the same prefix keep working).
- Chromium ACCEPTS SharedArrayBuffer-backed views in
  FileSystemSyncAccessHandle.read() (readMode "shared-view" in the probe
  diag; the WebIDL AllowSharedBufferSource widening is live). The
  scratch+copy fallback exists in opfs_realm_files.mjs but was not needed.
- createSyncAccessHandle holds an EXCLUSIVE lock per OPFS file: one handle
  per file, shared by all virtual opens (reads are stateless {at}); a page
  cannot removeEntry while the worker holds the handle
  (NoModificationAllowedError) — release handles or recycle the worker
  before deleting archives. Handle opening is async: stage BEFORE spawning
  the engine/probe pthread (same ordering rule as the P1a handshake).
- The probe spawns its pthread from the main realm with no go-flag dance:
  prep-then-spawn is sufficient because the thread's EM_JS calls are
  synchronous against already-staged realm state; the blocked worker event
  loop only matters for ASYNC realm work (P1a note still applies there).

## P2 integration results (lane P2-integration, 2026-07-10)

Threaded mode (`?threads=1`) now mounts archives ON OPFS, not MEMFS: the
bytes stream fetch->disk on the IO worker and the engine reads them through
the fd-intercept seam on the engine thread. The default (non-threaded) path
is byte-identical (`opfsArchiveMountEnabled()` is false without ?threads=1);
`?opfsmount=0` forces the MEMFS mount even in threaded mode (A/B runs).

**1. 64KB C-side readahead in src/wasm_opfs_files.cpp** (the small-read
coalescing P2-prep demanded): each virtual fd keeps a per-fd 64KB window;
reads < 64KB serve from it (one OPFS call per window fill), reads >= 64KB
bypass it unchanged. Lock held across the buffered path (single-reader
reality: only the engine thread reads); window freed on close; files are
immutable while staged so the window never goes stale. Diag exports
`cnc_port_opfs_js_read_calls/_bytes` + `_intercept_read_calls`; the probe
reports per-phase `tocOpfsCalls`/`phaseOpfsCalls`.

probe:p2-opfs before/after (same box, same day, INIZH.big, 3462-read TOC,
24/24 PASS both runs — byte-exactness re-proven by the FNV Range checks):

| pattern                | before      | after                             |
|------------------------|-------------|-----------------------------------|
| TOC walk (3462 reads)  | 2137ms      | **1.56ms** (tocOpfsCalls = 0 — the header read's window fill already covers the 44KB TOC region); beats the FS proxy's 319ms |
| random 64KB preads     | 128 MB/s    | 131 MB/s (bypass, unchanged)      |
| sequential 1MB reads   | 232 MB/s    | 219 MB/s (bypass, noise)          |
| largest-entry read     | 3.79ms      | 2.87ms                            |

The projected ~35s TOC hazard across the ~30-archive boot is gone: TOC cost
is now ~1 OPFS call per 64KB of directory (phaseOpfsCalls 537 for the whole
probe phase = 512 random reads + ~19 sequential 1MB + fills).

**2. Threaded mount path** (bridge.js `mountArchivesToOpfs`, branch at the
top of `mountArchives`): per archive, io_worker `fetchToOpfs` streams the
bytes to `cnc-archives<memfsPath>` (bounded parallelism =
archiveFetchParallelism(), progress events preserved for the play UI: fetch
phase from the worker's streamed progress + a final done event); a 0-byte
MEMFS marker is written at the engine path (enumeration contract); the
intercept prefix `<baseDirectory>/` is registered (pre-boot: main-side cwrap
call — main still owns the wasm exactly like the MEMFS mount's FS writes;
post-boot it would route through engineCall); then a `stageOpfsFiles` realm
command (new in engine_realm_boot.mjs handleCommand) imports
opfs_realm_files.mjs with the {enginePath->opfsPath} map and pre-opens the
sync access handles IN the engine pthread's realm. Awaiting that round trip
inside mountArchives IS the stage-before-spawn ordering guarantee: play.mjs
only calls realEngineInit (boot+go) after the mount resolves.
opfs_realm_files.mjs now keeps a realm-global registry
(globalThis.__cncOpfsRegistry): multiple imports (distinct ?map= URLs) merge
cumulatively, hooks/diag/listener install once, and closed virtual-open ids
recycle through a free-list (the engine re-opens the archive per inner-file
read — the id table must not grow with session length). No re-download
skipping (owner rule: no cache layers): every boot truncates + rewrites the
same OPFS paths, so disk usage stays bounded at one archive set.

**What is intentionally skipped on the OPFS mount path** (documented in the
code): per-archive/aggregate `probeArchive` and `registerArchiveSet`'s probe
gating — the probes open archives through the engine's C++ path on the MAIN
thread, whose realm has no staged handles (they would read the 0-byte
markers). Verification = streamed byte counts vs manifest + the engine's own
init opening every archive on the engine thread. The main-side audio payload
INVENTORY scan is skipped with an explicit
`{ok:false, skipped:true, source:"threaded OPFS mounts"}` marker (it reads
archive bytes from MEMFS; it is a diagnostics surface — the real audio path
reads payloads on the engine thread). `registerArchiveSet` itself still runs
(the engine needs the run-directory install).

**3. Gate result (dev box, SwiftShader, 2026-07-10):**
Full `npm run verify:threaded-play` (reference non-threaded leg + threaded
OPFS leg) GREEN 14/14, exit 0. Flake note: a first full run failed ONLY
"client frames advancing" at 0.9/s vs the >1 threshold — at SwiftShader's
~1 rendered frame/s a 5s sample window counts ~5 frames, so ±1 frame of
shared-box noise is ±20%; consider a longer sampling window if it recurs.
The SKIP_REFERENCE run was also 14/14 PASS with
OPFS-backed mounts — includes the new hard check "threaded mount is
OPFS-backed (no MEMFS archive bytes)". Threaded boot to TITLE in **17.4s**
(vs 133s for the MEMFS-threaded P1c gate-run-9 on the same box: the 2.2GB
of JS-side MEMFS writes into a pthread+growable heap are gone), shellmap
fully rendered (artifacts/screenshots/p1c-title-threaded.png), input +
windows-dump RPC round-trip, no context loss. Post-boot memory: **wasm
0.16 GiB, main-thread JS heap 12 MiB** with the 2,229,636,268-byte
(30-archive) set on OPFS. NOTE: MEMFS archive bytes live in the PAGE JS
heap (MEMFS stores Uint8Arrays outside wasm memory), so the OPFS-vs-MEMFS
delta shows in `performance.memory.usedJSHeapSize`, not wasmMemoryBytes —
the gate records both in its summary.

A/B comparison run (`OPFS_MOUNT=0 SKIP_REFERENCE=1`, same box, back to
back): MEMFS-threaded boots to title in 115.9s with **JS heap 2222 MiB**;
OPFS-threaded 17.4s with 12 MiB. That is the P2 payoff measured: −2.21 GiB
main-thread residency and a 6.7x faster boot (the MEMFS leg's extra wall
time is the 2.2GB of JS-side FS.writeFile copies against a
pthread+growable heap).

**Real-boot fix required along the way (found by the gate, not the probe):**
the engine chdir()s into the run directory and opens archives with RELATIVE
paths (`loadBigFilesFromDirectory("", "*.big")` -> `"INIZH.big"`), so the
absolute registered prefix never matched: every archive open fell through
to the 0-byte marker, no archives indexed, and TheWritableGlobalData
aborted with the P0 "no assets" signature. `cnc_port_opfs_intercept_open`
now absolutizes non-absolute paths against getcwd() for matching (misses
still fall through to POSIX with the original path). Related finding: a
RELEASE_CRASH inside an engine-thread init step tears down the worker main
loop (ExitStatus) before the init pump's catch can report it — the page
only learns via the 600s engineInit timeout (TODO (h): surface engine-
thread crashes fast).

**Gotchas found (real, reproduced):**

- **Ephemeral Playwright contexts cap OPFS at ~1.25GiB** on the dev box:
  `chromium.launch()` contexts are incognito-like; their OPFS backend is
  in-memory and `FileSystemSyncAccessHandle.write()` fails at ~1.34GB
  cumulative with return value 2^32-8 (base::File FILE_ERROR_NO_SPACE
  leaking as unsigned — this old Chromium does not throw QuotaExceededError
  on that path). The 18.7MB probe payload never hit it; the ~1.5GB play
  archive set does. threaded_play_gate.mjs therefore uses
  `launchPersistentContext` (disk-backed quota, fresh profile deleted per
  run = still a from-empty OPFS). Real Chrome on a normal profile (the
  owner's Mac) is disk-backed and unaffected. io_worker's short-write check
  turns this into a loud mount error, never silent corruption.
- The pthread 'unwind' completion surfaces as a benign `ExitStatus`
  pageerror in Playwright on the threaded boot; it was always logged as a
  console error ("completed its main entry point with an `unwind`") — not
  new, just now visible in pageerror monitors too.

**Remaining for retiring MEMFS mounts once threaded becomes default:**

- stat/getFileInfo coverage: markers expose size 0 / mtime 0 (unchanged
  P2-prep caveat; nothing has been proven to care through a full boot).
- Handle lifecycle: staged sync-access handles hold exclusive locks for the
  page lifetime — a SECOND tab (or a re-mount of the same paths in one
  session) collides: tab 2's fetchToOpfs cannot truncate what tab 1 has
  staged (NoModificationAllowedError). Needs per-session namespacing +
  orphan cleanup, or a release-handles protocol, before multi-tab play.
- Non-threaded mode still needs MEMFS (sync access handles are worker-only;
  the main-thread engine cannot read OPFS synchronously) — the MEMFS mount
  pipeline stays until threaded is the default, then it can shrink to the
  ?opfsmount=0 escape hatch and eventually delete.
- OPFS-backed audio payload inventory (or engine-realm scan) if that
  diagnostics surface is wanted in threaded mode.
- Mac M4 measurement of the readahead probe + OPFS-threaded boot (dev-box
  numbers are the conservative bound).
