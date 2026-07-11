# P1 — engine thread live in play.html (design + running state)

Owner directive 2026-07-10: keep working until the engine-thread architecture
is IN play.html. Design context: IDEAS.md "the browser as a 2003 PC"; P0
evidence: DONE.md "Engine-thread architecture P0 spike" + threaded_boot_probe.
This note is the durable coordination doc for the P1 lanes — update it as
gates pass so any future session can resume without re-deriving.

STATUS 2026-07-11: MIGRATION COMPLETE + LEGACY DELETED. Sections below are
the historical record of the lanes as they ran; where they mention
`?threads=0`, `?opfsmount=0`, `?ioworker=0`, SKIP_REFERENCE/OPFS_MOUNT gate
modes, or the io-worker `fetchArchive` whole-buffer transfer, those were all
DELETED by the demolition lane — see the final section "Demolition
(2026-07-11)" for what exists now.

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
- [x] GATE D Mac Metal — RUN 2026-07-10 (final-migration lane): renderer /
      boot / init / audio / skirmish / screenshots ALL GREEN on real Metal;
      the 60/30 pacing bar initially FAILED with what looked like a
      threaded-only GL throughput regression. RESOLVED same day (blocker-fix
      lane): the regression was **Debug-vs-Release wasm** — dist-threaded is
      a Debug build and the A/B compared it against dist-release. With the
      new dist-threaded-release build the pacing bar is MET on Metal
      (logic 30.0 exact, client within ~19% of legacy at the shellmap; full
      numbers in "GATE D root cause + fix" below) and the flip is unblocked.
- [x] Default-readiness gap closure — GREEN 2026-07-10 (gap-closure lane):
      threaded state/issue-dump/mount-guard/shader-tier RPC routing, OPFS
      stream reads (music/speech restored under OPFS mounts), MSS byte-copy
      dedupe (316 starts -> 33 copies in the gate run), audible-path +
      completion-drain + save-round-trip + resolution-flow checks in
      verify:threaded-play (14 -> 30 checks, all green on dev-box
      SwiftShader; boot to title 28.8s). Default dist byte-identical
      (md5-proven). See "Default-readiness gap closure" below.
- [x] P2 OPFS-as-disk mounts in threaded mode — GREEN 2026-07-10 (lane
      P2-integration): 64KB readahead in the fd intercept (TOC walk 2137ms
      -> 1.56ms), `?threads=1` mounts stream fetch->OPFS + stage handles
      pre-spawn, gate 14/14 with title in 17.4s and main-thread JS heap
      12MiB (2.2GB archive set on disk). See "P2 integration results".
- [x] P3 fixed-size heap on the threaded build — GREEN 2026-07-10 (lane P3):
      ALLOW_MEMORY_GROWTH=0 + INITIAL_MEMORY=2GiB (== the growth build's
      MAXIMUM, so the OOM ceiling is unchanged); 239 GROWABLE_HEAP wrappers
      -> 0; full verify:threaded-play 14/14 on the final flags; real
      skirmish match runs OOM-free on the fixed heap (screenshot-proven via
      the new threaded_skirmish_memory_probe); default build byte-identical.
      Measured A/B: no perf delta above SwiftShader box noise — see
      "P3 results".

## Default-readiness gap closure (2026-07-10, gap-closure lane)

Owner directive step (1): close the functional gaps that block making
`?threads=1` the play.html default. Everything below is JS/harness-only
except the realm stub (threaded-build pre-js relink); the DEFAULT build is
untouched (md5-identical rebuild proof). All items are asserted by the
extended `npm run verify:threaded-play` gate.

- **Threaded RPC routing** (bridge.js `threadedRpc`):
  - `state` now merges the wasm `cnc_port_state` JSON (fetched via
    engineCall ON the engine thread, applied main-side with
    applyModuleState). Pre-boot / on failure it falls back to the main-only
    snapshot; `wasmStateSource` in the reply says which path served it.
  - Issue-dump routes: `realEngineAnimReport`, `querySelection`,
    `realEngineFrameSummary` (deep snapshots; optional profile/
    playerDiagnostics flags forwarded as separate engineCalls) and
    `d3d8TextureInventory` — the latter via a worker-realm
    `textureInventory` command because the executor's live-texture map
    exists only in the engine realm.
  - `mountArchive(s)`: post-boot mounts REFUSED with an explicit error
    (registerArchiveSet/probeArchive are main-thread wasm calls, safe only
    pre-boot); pre-boot mounts fall through to the unchanged pipeline.
  - Everything else keeps the explicit "not yet supported in threaded mode"
    default — no silent main-thread wasm calls.
- **Shader tier**: resolved main-side with the executor's exact precedence
  (page URL `?shaderTier=` → localStorage `cncPortShaderTier` → default
  `ps11`) and passed
  through the realm-setup options; engine_realm_boot forces
  `globalThis.__cncD3D8ShaderTier` BEFORE constructing the executor (tier is
  sampled once at device create). Worker status posts include the resolved
  tier. The worker realm has no page URL/localStorage — that was the gap.
- **Threaded OPFS music/speech streams (the big audio-parity hole)**: MSS
  stream starts hunt the stream file by reading archives out of MEMFS —
  which holds only 0-byte markers under OPFS mounts, so threaded mode had
  NO music/speech at all. Fix: new `opfsReadRange` realm command
  (engine_realm_boot) reads staged FileSystemSyncAccessHandle ranges in the
  engine realm and transfers the bytes back; `_startMssStreamAsync` parses
  and caches the BIG directory per archive through ranged reads
  (`mssStreamArchiveDirectoryCache` + the now-async
  readBigDirectoryFromReader), then reads exactly the entry payload per
  start. length 0 = stat (size only). MEMFS branch unchanged.
- **MSS byte-copy dedupe (content-key handshake)**: the worker computes the
  SAME content key as bridge's decoded-sample cache (riffSize + strided FNV
  — identical algorithm, identical bytes) per sample start; bytes ship once
  per key (transferred, not cloned — the realm stub's respond() gained a
  transfer-list arg), key-only after. Main trusts the transport key for
  lookup AND insert (the two sides can never diverge), and notifies
  evictions or failed caches back via `mssCacheDrop` so the worker re-sends
  bytes on the next start. A key-only start that misses (freshly evicted)
  skips that ONE play and self-heals — evictions are LRU, so a
  just-replayed sample is essentially never the victim. Counters:
  worker status `mssForward` {starts, copies, bytesCopied, dedupeSkips};
  main decodedCache summary gains `dedupeMisses`.
- **Saves**: no code change needed — IDBFS mounts on the MAIN runtime
  (preRun) and engine-thread FS writes proxy to main, so persistSaves/
  listSaves are correctly main-side. The gate now PROVES the round trip:
  write marker .sav → persistSaves → fresh page load → listSaves shows it.
- **Bink/movies**: no hooks installed in EITHER realm on the play path
  (bridge.js never installed any; only dedicated smokes do). BinkOpen fails
  on the missing .bik files and the provider cleanly no-ops — the engine's
  GameClient::update intro sequence (playLogoMovie → Sizzle → legal page)
  advances past it, proven by the gate reaching the main-menu shell. When a
  real movie consumer lands main-side, engine_realm_boot needs matching
  forwarders (TODO remainder).
- **Gate additions** (threaded_play_gate.mjs): browser launches with
  `--autoplay-policy=no-user-gesture-required` (models the owner's
  Play-click gesture that resumes audio before any engine sound starts) and
  asserts: menu window present (movie-skip proof), state-RPC wasm fields,
  the four issue-dump routes, placeholder captureStream live, AudioContext
  running, music stream decoded+scheduled from OPFS, samples started, 2D
  completions drained with zero "threaded audio completion failed" logs,
  dedupe engaged (dedupeSkips > 0, dedupeMisses == 0; a second
  clickWindowByName replays the GUI click as a deterministic dedupe
  trigger), shader tier reported, setEngineResolution round trip with size
  follow-up, and the save round trip.

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

## P3 results (lane P3, 2026-07-10): fixed-size heap on the threaded build

The threaded build now links with a FIXED heap: `-sALLOW_MEMORY_GROWTH=0`
`-sINITIAL_MEMORY=2147483648` (CNC_PORT_MEMORY_LINK_OPTIONS in
CMakeLists.txt; threaded branch only). The default build keeps
growth-on/64MiB-initial/2GiB-max and is BYTE-IDENTICAL after the change
(md5 of dist/cnc-port.{js,wasm} unchanged across a rebuild; default
build/wasm/build.ninja flag census identical — no -pthread / pool / pre-js /
GROWTH=0 anywhere).

**Why INITIAL == the old MAXIMUM (2GiB), not measured-usage + margin:** the
OOM ceiling is then IDENTICAL to the growth build — no workload that
survives growth-on can newly abort under the fixed heap, so the fixed heap
introduces zero new OOM risk on big maps. The measured footprints (below)
are LOWER BOUNDS from a short match on the default 2-player map, not a
big-map 8-player peak; sizing to measurement+margin would have created a
new, un-provable abort threshold. Address space is the only up-front cost:
Chromium commits shared wasm memory lazily — renderer RSS peaked at
~880MiB through boot+title (gate run) and ~978MiB through a full
boot+menus+skirmish-match run, never ~2GiB+ (dev-box Chromium; Mac Chrome
re-check belongs to GATE D).

**Sizing measurements** (growth-ON threaded build, OPFS mounts, dev box —
`harness/threaded_skirmish_memory_probe.mjs`, new in P3): wasm memory
229MiB at title (after shellmap drain + menu navigation; the gate logs
0.16GiB right at title), **275.4MiB peak in a live skirmish match**
(default map, 400 logic frames sampled over 120s, screenshot-verified
match: p3-skirmish-threaded-ingame/final.png), main-thread JS heap ~15MiB.
Headroom vs the 2GiB ceiling: ~7.4x at the in-match lower bound.

**The tax removal, verified:** dist-threaded/cnc-port.js drops from 239
`GROWABLE_HEAP_*` call sites to **0**; the em++ `-Wpthreads-mem-growth`
("may run non-wasm code slowly") warning is gone from the link.

**Perf A/B** (2 runs each, back-to-back, same box, headless SwiftShader;
shared box — noise is real, growth-ON random-read run 2 caught a load
spike):

| metric                        | growth ON     | growth OFF (fixed) |
|-------------------------------|---------------|--------------------|
| gate boot->title              | 19.0s / 17.6s | 17.3s / 22.3s      |
| paced client rate (5s window) | 1.5 / 1.6 /s  | 1.3 / 1.2 /s       |
| paced logic rate              | 2.9 / 3.1 /s  | 2.7 / 2.4 /s       |
| p2-opfs TOC walk              | 1.53 / 1.65ms | 1.69 / 1.56ms      |
| p2-opfs random 64KB           | 150 / 50 MB/s | 139 / 127 MB/s     |
| p2-opfs sequential 1MB        | 247 / 163 MB/s| 229 / 287 MB/s     |

**Honest verdict: no measurable end-to-end delta above dev-box noise under
SwiftShader.** Expected in hindsight: the architecture's hot JS heap paths
already dodge the wrappers — the D3D8 executor reads through per-call
fresh-view accessors (P1b env contract), OPFS reads write through
realm-local views (P2), and EM_JS bodies use Module.HEAPxx directly. The
239 wrappers sat in emscripten library JS (FS/syscalls/etc.) that the OPFS
fd-intercept largely bypasses at runtime. The fixed heap is still the right
call: it deletes the stale-view BUG CLASS (bridge.js's fresh-view
workarounds for main-side MSS reads and `Module.wasmMemory` buffer-identity
checks are no longer load-bearing — the buffer can never be replaced), the
wrapper removal is free, and SwiftShader frame costs dwarf any JS-side
delta on this box — a Mac Metal re-measure at 60fps client rides GATE D.

**Fixed-heap risk check (the mission's "engine OOM aborts on big maps"
concern):** the growth-OFF build boots (2GiB shared memory instantiates
fine on 3.1.6 + headless Chromium), full `verify:threaded-play` is green,
and the skirmish probe runs a real match to 486 logic frames with no OOM
abort. Emscripten 3.1.6 accepts INITIAL=2GiB with growth off (MAXIMUM
defaults to INITIAL for the shared memory).

**New instrument + threaded RPC surface (P3):**
`harness/threaded_skirmish_memory_probe.mjs` boots `?threads=1`, drives
MainMenu -> Single Player -> Skirmish -> Start through `clickWindowByName`
(the engine's own winSendInputMsg path) and samples memory in-match.
Gotchas it hit (now baked into the probe): menu TRANSITIONS animate per
CLIENT frame (~1.3/s under SwiftShader), so one-shot clicks get swallowed —
click in rounds and poll an engine-state readiness signal between rounds
(TheSkirmishGameInfo via realEngineSetSkirmishMap's error field for the
skirmish menu; frame.loadSessionActive===true for Start). Routing added to
bridge threadedRpc: `realEngineSetSkirmishMap`,
`realEngineSetSkirmishLocalTemplate`; `clickWindowByName` threaded route
now honors `payload.name` (the non-threaded contract — it previously read
only window/windowName) and derives ok from the export's `clicked` flag
(its JSON has no `ok` field, so the route previously always returned
ok:false).

**Range-backed mount retirement (P3 audit):** NOT deleted. The shipping
paths never touch it, but `mountRangeBackedArchiveSet` /
`extractBigEntriesFromUrl` / `buildBigArchive` are load-bearing for ~18
package.json-wired legacy smokes (incl. startup_vertical_smoke's phase-2
audio boot) whose subset-BIG mounts exist precisely to keep those suites
fast. Mass-converting them to full-archive mounts would multiply suite
runtime for zero coverage gain. Retirement is therefore scheduled WITH the
legacy-smoke burn-down (TODO entry "Retire the range-backed subset-mount
machinery together with the legacy smoke surface"). The P2-obsoleted
mount-freeze mitigations named by IDEAS P3 (chunked MEMFS writes) also
stay: the non-threaded DEFAULT path still mounts via MEMFS until threaded
becomes the default.

## GATE D results (2026-07-10, final-migration lane, Mac M4 Metal)

Build af478736 (dev-box dists rsync'd + md5-verified on GPU verification host; a stale
`dist/cnc-port.wasm` with identical size+mtime was caught ONLY by
`rsync --checksum` — always checksum-verify dist syncs). All probes:
headless Chrome 150, `--enable-gpu --use-angle=metal`, playwright-core from
`~/cnc-verify` on the Mac (`gate_d_boot_probe.mjs`, `gate_d_ab_pacing_probe.mjs`,
`gate_d_perf_compare.mjs`, `gate_d_threaded_diag.mjs`,
`gate_d_skirmish_probe.mjs` live there, uncommitted like the other Mac
instruments). Screenshots + boot summary copied to
`WebAssembly/artifacts/screenshots/gate-d-*.png` / `gate-d-boot-summary.json`.

**GREEN on real Metal (`?threads=1`):**

- Renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, ...)` in the main
  realm, in a probe worker, AND in the ENGINE worker's own executor context
  (now provable: the worker status feed posts
  `threadedEngine.graphics.renderer` + live `d3d8Perf` counters — added this
  lane, engine_realm_boot.mjs).
- Boot: overlay hidden 19.2s, title (shellmap load drained) 25.2s
  (other runs 21-40s; 2.2GB OPFS mount from-empty each time). Real init
  43/43 subsystems ON the engine pthread. Fixed 2GiB heap instantiates fine;
  main-thread JS heap ~33MB.
- Title screenshot: fully rendered shellmap battle behind the menu
  (gate-d-title-threaded-metal.png, 2.4MB, mean lum 223).
- Audio (headless counters): music/speech streams decoded+scheduled from
  OPFS (2), samples 9 2D + 445 3D started, 2D completions drained 9/9 with
  zero completion-failure logs, dedupe engaged (332 key-only skips, 0
  misses), AudioContext running, `wasmStateSource: engine-thread`.
- Skirmish through the engine's own click path (SinglePlayer -> Skirmish ->
  Start): reaches PLAYER CONTROL in a real match (command center + dozer,
  control bar, $10000 — gate-d-skirmish-ingame-metal.png), match load ~5s,
  **in-match logic 29.98/s EXACT, client 43.9/s** over 30s, no loop error,
  no context loss.

**RED — the flip bar (client ~60 / logic ~30 at the shellmap) FAILS:**

| leg (same box, flags, scene) | logic /s (120s window) | client /s |
|---|---|---|
| legacy `play.html?autostart=1`  | **30.0 exact all buckets** | 34-58 |
| threaded `?threads=1`          | 26 -> 14 (2x client, catchup-pinned) | 17-28 -> **7** |

Mechanism (measured, not guessed):

- The shellmap battle escalates: 496 draws/frame early -> 1245-1645
  draws/frame late (engine frame profile via
  `realEngineFrameSummary {profile:true}`, threaded-routed).
- Per-draw executor behavior is IDENTICAL in both realms: 0.77 uniform GL
  calls/draw, ~730 indices/draw, same cache hit ratios (perf-compare of the
  new worker `d3d8Perf` status vs legacy `state.graphics.d3d8Perf`).
- But sustained GL throughput differs ~2.5x: legacy pushes 1,223,321
  draws/30s (~40.8k draws/s at 52fps) vs threaded 493,479/30s
  (~16.4k draws/s). Same ANGLE Metal device, same code — the deficit is
  specific to the OffscreenCanvas-in-worker context.
- Eliminated: worker rAF throttling (synthetic worker rAF + GL clears hold
  60.0fps for 45s in every flag combo), SwiftShader fallback in the engine
  worker (renderer string above), `--disable-gpu-compositing` (A/B'd:
  same collapse with GPU compositing on), uniform/VAO/state cache
  regressions (ratios identical), profile-marker overhead (collapse
  reproduces with profiling off), audio forwarding volume (starts ~22/s;
  completions drain; dedupe active).
- Consistent with the dev-box SwiftShader gate always running at the
  catchup bound: the threaded tick is intrinsically more expensive per GL
  call; SwiftShader's raster cost masked it, Metal exposes it.

Open lead for the fix lane: worker-context GL command submission behavior
(flush cadence for OffscreenCanvas commits, SAB-view upload paths in the
bindings, command-buffer scheduling for dedicated workers). Also re-check
headful Chrome (probes were headless; do not assume it differs without
measuring — the owner plays headful).

## GATE D root cause + fix (2026-07-10, blocker-fix lane): it was Debug-vs-Release wasm, not the worker

**The "worker GL throughput regression" above was a build-flavor artifact.**
The GATE D A/B compared `play.html?autostart=1` (= **dist-release**: Release,
-O2, ASSERTIONS=0, native wasm-EH, 7.7MB wasm) against `?threads=1`
(= **dist-threaded**: `build:port:threaded` has no BUILD_TYPE, and
tools/build_wasm.sh defaults to **Debug** — -O0, ASSERTIONS=1, WWDEBUG,
DEBUG_LOGGING, emscripten JS-EH, 99.7MB wasm). The engine simply produced
draws ~2.5x slower; the GL side consumed them identically in both realms.
That is why the per-draw GL call mix and cache ratios were identical while
"throughput" differed — draws/s was measuring the WASM ENGINE, not the GL
context.

Isolation evidence (Mac M4, Chrome 150 headless, ANGLE Metal, same day/box):

1. **Synthetic worker-vs-main GL benchmark** (no wasm; executor-shaped mix:
   ~0.77 uniform calls/draw, 732 indices/draw, VAO/texture churn, fence
   completion tracking): main-1600 **69,952 draws/s @ 43.7fps** vs
   worker-transferred-1600 **70,002 draws/s @ 43.8fps** vs worker-own
   69,951 draws/s — worker GL parity to 0.1%, at 4x the real engine's draw
   rate. Pure-CPU JS in worker == main (730 Mops/s both; no E-core/QoS
   penalty). Files: cnc-verify glbench/ on the Mac (gl_bench_core.mjs,
   run_gl_bench.mjs; not committed — synthetic scaffolding).
2. **debug-legacy reproduction** (`?dist=dist` on the LEGACY main-thread
   path, no worker anywhere): client 3.8-13.4/s, logic 7.6-25.3/s,
   **14.5-19.8k draws/s** — the GATE D "threaded" collapse numbers, on the
   main thread. (flavor_ab_probe.mjs, same 120s/10s-bucket methodology.)
3. Eliminated by 1+2 in one stroke: worker rAF, OffscreenCanvas
   transfer/commit path, context-attribute diffs, SAB-view upload paths
   (debug-legacy has a non-shared heap and still collapses), captureStream,
   Chrome flags (none used beyond the standard probe set).
4. Synthetic attribute/capture sweeps (same benchmark, worker-transferred,
   1600 draws/frame): preserveDrawingBuffer true/false = no delta (70.0k
   draws/s both); captureStream(5) on the placeholder costs ~9% in the
   worker leg only (70.0k -> 64.1k draws/s; nothing on main) — real but far
   too small to matter; **`desynchronized: true` on a transferred
   OffscreenCanvas context kills the page in Chrome 150** (target closed —
   never ship that attribute on the threaded path).

**Fix: `npm run build:port:threaded:release`** -> dist-threaded-release
(Release, -O2, wasm-EH, CNC_PORT_THREADS=1, fixed 2GiB heap,
PTHREAD_POOL_SIZE=1 — first Release+pthread+wasm-EH build; links and runs
fine on emsdk 3.1.6). play.html in threaded mode now defaults to
dist-threaded-release (bridge.js defaultCncPortDistDir + play.mjs, mirroring
the legacy dist/dist-release convention); harness pages keep the Debug
dist-threaded; issue-recorder dump metadata + replay_issue_dump threads/dist
pins follow; threaded_play_gate gained THREADED_PLAY_DIST and
verify:threaded-play now builds both threaded dists.

**Re-run of the lane-D pacing A/B (same methodology/box/day, 120s window,
10s buckets, Mac Metal headless):**

| leg | logic /s | client /s | draws/s |
|---|---|---|---|
| release-legacy (`?autostart=1`) | 30.0 exact all settled buckets | 35.4-58.8 (mean 48.3) | 40-58k |
| debug-legacy (`?dist=dist`) | 7.6-25.3 | 3.8-13.4 | 14.5-19.8k |
| **threaded-release** (`?threads=1&dist=dist-threaded-release`) | **30.0 exact all settled buckets** | **32.7-43.4 (mean 39.1)** | up to 51.5k |

Threaded client is within ~19% of legacy on the window mean and within ~8%
at the matched escalated bucket (~1600 draws/frame: 32.7/s vs 35.4/s), with
logic 30.0 exact throughout — **the flip bar (shellmap client within ~20% of
legacy, 60/30 pacing intact) is MET**. Boot to title 26s (OPFS mounts
from-empty). The residual ~20% in light buckets is the pthread build's
remaining costs (atomics/locked malloc + worker-realm forwarding), not a GL
ceiling — legacy peaks 58.8/s where threaded holds ~43/s; both are far above
the 30/s logic gate and the felt-60Hz bar is a display-rate concern only at
peaks, not the crush the blocker described.

**HEADFUL spot-check (the owner-realistic config: real window, GPU
compositing ON, no --disable-gpu-compositing), threaded-release, 90s:**
client **52.6-60/s** through the escalated shellmap (55.2/s at 1514
draws/frame; 83k draws/s peak), logic 30.0 exact in every settled bucket,
maxGap 19-33ms (single 2.2s gap = a shellmap load slice). Headless numbers
above are the CONSERVATIVE bound — headless BeginFrame throttling caps the
client ~44/s; headful hits the actual 60Hz bar. The GATE D-era headful
question is closed: no Chrome flags are needed.

**Flip decision: UNBLOCKED** — the prepared flip diff from
`threaded-default-flip` (f002675d) is cherry-picked on this lane's branch
with the dist default resolved to dist-threaded-release on the play page.

**Mac hygiene this lane:** the data volume hit 100% full twice — (1)
Chrome `code_sign_clone` leak (51GB logical / ~1.4GB physical across 38
orphaned clones from past probe Chromes) cleaned; (2) probe Chrome
profiles with 2.3GB OPFS each — every OPFS-mount probe MUST
`rmSync(profile)` in its finally (a leaked profile starved the next run's
OPFS writes into silent mount stalls: FileSystemSyncAccessHandle.write
returns 2^32-8 and boot hangs at the overlay). `~/.Trash` was emptied
(1.8GB). Free space steady-state is only ~3.2GiB — one OPFS probe profile
at a time. Playwright `browser.close()` reproducibly wedges after these
runs (Chrome already gone) — kill the node by PID afterwards and never
rely on post-close code (write summaries BEFORE close).

## Owner mount-failure regression (2026-07-10, mount-failure lane)

Symptom: owner's real headful Chrome at
http://<gpu-host>:8123/harness/play.html (threaded now the play default)
shows "FAILED: archive mount failed"; every headless gate green on the same
build.

**Root cause (reproduced on GPU verification host with plain Chrome + fresh profile): the
LAN-IP origin is untrustworthy.** Chrome ignores COOP/COEP on plain
`http://192.168.x.x` ("The Cross-Origin-Opener-Policy header has been
ignored, because the URL's origin was untrustworthy... use https or
localhost"), so `crossOriginIsolated` is false, `SharedArrayBuffer` does not
exist, and OPFS/Web Locks are absent too. The pthread build then dies at
module scope (`ReferenceError: SharedArrayBuffer is not defined`),
loadWasmModule returns null, and play.mjs surfaced the generic mount failure.
localhost IS a trustworthy origin — which is why the gates (all localhost)
never saw it. The GATE D probes and the headful spot-check also ran
localhost; the owner was the first threaded LAN-IP client.

**Fix (JS-only, no wasm rebuild):**

- bridge.js `cncPortThreadedRuntimeSupport()` + play.mjs mirror: threaded
  mode engages only when `SharedArrayBuffer` + `crossOriginIsolated` are
  present. Otherwise both originally fell back to the legacy single-threaded
  path/dist-release with a visible on-page note and
  `state.threadedFallbackReason`. **SUPERSEDED same day by owner directive
  ("no legacy path or fallback — just add HTTPS to the server"): the
  fallback is replaced by an HTTPS redirect / hard block — see the "HTTPS
  listener" section below.** The OPFS namespacing/lock hardening and
  error-detail surfacing from this lane remain in force.
- Error surfacing: loadWasmModule failures are captured
  (`cncPortModuleLoadError`) and folded into mount errors; play.mjs `fail()`
  now renders the failure detail on the page; io_worker errors keep the
  DOMException name.

**Second real bug fixed in the same lane — the deferred TODO (c) OPFS
sync-handle collision, reproduced on a SECURE origin** (localhost, reused
persistent profile): a second tab's mount failed with
NoModificationAllowedError ("Access Handles cannot be created if there is
another open Access Handle or Writable stream associated with the same
file") because the engine realm's staged handles hold exclusive per-file
locks for the page lifetime and the mount rewrote fixed OPFS paths.
Single-tab reload and reload-mid-mount did NOT collide on this box (Chrome
reaped the old worker fast enough), but that timing is not guaranteed.

Hardening shipped (bridge.js mountArchivesToOpfs, io_worker.mjs,
opfs_realm_files.mjs, engine_realm_boot.mjs):

- **Per-mount namespaces**: archives stream to
  `cnc-archives/ns-<bootId>-<seq>/<memfsPath>`; fresh names can never be
  lock-held, so a wedged stale holder can NEVER block a new boot. The page
  holds a `cnc-port-opfs-ns:<bootId>` Web Lock (auto-released on page death
  — unlike OPFS handles) acquired BEFORE GC so a concurrent tab's GC never
  deletes files a mid-boot tab is writing.
- **Namespace GC** (io_worker `opfsCollectNamespaces`): before downloading,
  remove every child of `cnc-archives` except the current namespace and
  namespaces whose owner lock is still held (`navigator.locks.query()` in
  the worker). Lock-held removeEntry failures are per-entry and non-fatal.
  Legacy fixed-layout dirs (`cnc-archives/assets/...`) collect on the first
  post-fix boot. Two live tabs each keep their namespace: disk = one archive
  set per LIVE tab (second-tab support costs ~2.2GB while both live).
- **Release protocol**: pagehide fires `releaseOpfsHandles` into the engine
  realm (opfs_realm_files.mjs `registry.closeAll()`) and `releaseHandles`
  to the IO worker (tracked open-handle set) — locks drop early in the
  common case; the namespace scheme is the hard guarantee when teardown
  delivery loses the race.
- **createSyncAccessHandleRobust** (io_worker): on
  NoModificationAllowedError/InvalidStateError retry ~1.5s, then
  delete-and-recreate the file, then throw an error naming the opfsPath and
  the underlying exception ("another tab or a not-yet-reaped worker likely
  holds this file's exclusive OPFS lock").

**Mac verification matrix** (fixed harness served standalone on :8151 with
symlinks to the deployed md5-verified dists; reused persistent profile;
headless Chrome 150 + ANGLE Metal): LAN-IP origin → legacy fallback boots to
title with the visible note; localhost threaded → title on a namespaced OPFS
mount; SECOND TAB same profile → boots (was: raw mount failure);
reload-after-boot / reload-mid-mount / third sequential reload → all boot;
OPFS root holds only the live namespaces afterwards. Dev-box: full
`verify:threaded-play` (reference + threaded) and `shellmap_real_init_gate`
green on the fixed harness. The probe instruments live in `~/cnc-verify/`
on the Mac (secctx_probe / owner_flow_probe / lock_collision_probe /
fix_matrix_probe, uncommitted like the other Mac instruments).

Mac-session hygiene notes for future lanes: `context.close()` after
OPFS-heavy persistent-context runs still wedges (write summaries BEFORE
close, exit hard, then clean Chrome by PID + `rm -rf` the probe profile —
one leaked 2.9GB profile was cleaned this lane); a stray playwright-flagged
Chrome (start 00:47) not owned by this lane was left untouched.

## HTTPS listener + no-fallback redirect (2026-07-10, https lane)

OWNER DIRECTIVE (firm): "no legacy path or fallback — just add HTTPS to the
server." This replaces the untrusted-origin threaded→legacy auto-fallback
from the mount-failure lane above (the OPFS namespacing/lock hardening and
error surfacing from that lane stay).

**Server (harness/static-server.mjs + serve.mjs):**

- `startStaticServer` gained opt-in `httpsPort`/`certDir` options: the SAME
  request handler (COOP/COEP and all endpoints included) is also served via
  `node:https`. Opt-in means every gate's self-spawned ephemeral localhost
  server is byte-for-byte unaffected. The HTTPS listener starts BEFORE the
  HTTP one so `/__cnc_https_info` (announces `{httpsEnabled, httpsPort}`)
  can never race a request.
- serve.mjs: `HTTPS_PORT=<port>` forces, `HTTPS_PORT=0` disables, unset
  defaults to 8443 when HOST is non-localhost OR a cert already exists.
- Cert: generated ONCE by `ensureSelfSignedCert` into gitignored
  `WebAssembly/harness/.certs/` (cert.pem/key.pem/san.cnf) and REUSED on
  every later start — the browser trust decision is per-cert, so
  regeneration would re-prompt the owner. openssl via a `-config` file
  (portable across dev-box OpenSSL 3.x and Mac LibreSSL 3.3, which disagree
  on `-addext`). rsa:2048/sha256, 10 years, CN=cnc-harness, SANs: localhost,
  hostname (+short, +.local), 127.0.0.1, ::1, every non-internal interface
  address, and the owner IP <gpu-host> baked. **Deploy rsyncs must
  exclude `WebAssembly/harness/.certs/`** — each box keeps its own cert or
  the owner's trust decision breaks.

**Page (bridge.js + play.mjs):** when threaded is requested (play default)
but SAB/COI are missing, there is NO legacy boot:

- insecure non-localhost origin → bridge fetches `/__cnc_https_info` (baked
  default 8443 if the endpoint is missing) and `location.replace`s to
  `https://<same-host>:<port><same path+query+hash>`;
- already-https-but-no-SAB (cert rejected) or localhost-without-COOP/COEP →
  BLOCKED: on-page instructions (trust/proceed the cert, or restart serve
  with HTTPS_PORT for the no-listener case), console.error;
- `state.threadedUnsupported = { reason, action: "redirect"|"blocked",
  target }` replaces `threadedFallbackReason`; a `cnc-threaded-unsupported`
  window event fires when the action resolves; bridge `rpc()` refuses
  boot/mountArchive(s)/realEngineInit while unsupported so nothing can
  silently degrade;
- localhost origins never redirect (trustworthy; all gates keep working);
  explicit `?threads=0` remains the only — deliberate — legacy entry.
- Path-aware boot banner (owner-flagged): play.html's default copy now
  describes the OPFS mount (archives → browser disk, memory flat); the
  MEMFS "~2 GB into browser memory / phones" warning renders only on the
  explicit `?threads=0` path (play.mjs swaps it in).

**Dev-box verification:** 14/14 redirect-probe checks (LAN http → redirect
in 633ms, COI+SAB true after; localhost untouched; HTTPS_PORT=0 server →
blocked note + mountArchives boot-refusal + loud Start failure; banner per
path), io-worker-offthread 15/15, shellmap_real_init_gate + full
threaded_play_gate green, four cnc-port builds no-op incremental. Dev-box
probe quirk: the sandbox `HTTPS_PROXY` env MITMs Chromium's NON-localhost
https and rejects the self-signed upstream (alert 42 → ERR_EMPTY_RESPONSE)
— strip proxy env vars from the Chromium launch env for LAN-https probes;
curl needs `--noproxy '*'`.

**Mac verification (2026-07-10, real Metal GPU):** deployed (fresh no-op
builds, md5-verified dists + harness overlay), :8123 server restarted as
`HOST=0.0.0.0 PORT=8123 HTTPS_PORT=8443 node harness/serve.mjs` (single pid
serves both listeners; :8124 untouched); the interim `~/cnc-tls` stopgap
TLS proxy another lane had put on :8443 ("TEMPORARY ... until serve.mjs
ships HTTPS") was retired. Cert generated on the Mac with SANs
localhost/m4/m4.local/127.0.0.1/::1/<gpu-host>. Headless-Chrome probe
10/10: LAN http play URL redirects to https :8443 (query preserved),
COI+SAB true, ANGLE Metal (Apple M4), THREADED wasm instantiates (heap is a
SharedArrayBuffer), 30/30 archives OPFS-mounted, real init → engine loop →
shellmap title screenshot. Probe Chrome cleaned by PID, profile removed.

**Owner flow:** open http://<gpu-host>:8123/harness/play.html → auto
redirect to https://<gpu-host>:8443/harness/play.html → one-time
"Advanced → Proceed" on the cert interstitial (or trust
`WebAssembly/harness/.certs/cert.pem` in Keychain) → threaded engine, COI
true. The :8123 server on the Mac must be started with `HTTPS_PORT=8443`
(or just HOST=0.0.0.0, which now defaults it).

## Demolition (2026-07-11, demolition lane): legacy play path deleted

Owner confirmed the HTTPS threaded experience ("excellent, finally!") →
OWNER DIRECTIVE step (5) executed. What was deleted, what deliberately
survives, and why:

**Deleted:**

- **play-page legacy mode**: `?threads=0` (play.mjs/bridge.js/play.html),
  the play-page legacy dist selection (dist-release fallback), the
  MEMFS-era boot banner variant, the page-driven paced/coupled frame loops
  in play.mjs (runPacedFrameLoop/runCoupledFrameLoop — the engine-realm
  loop is the only play loop), the boot-time reveal-pump frames, and the
  `?ioworker=0` / `?opfsmount=0` opt-outs. play.html is threaded/OPFS-only:
  bridge's `cncPortThreadedMode` is unconditionally true on /play.html
  (`?threads=1` still opts harness/index.html pages in). Threaded mounts
  are ALWAYS OPFS; a missing IO worker fails the mount loudly instead of
  silently degrading to a MEMFS mount the engine thread could not read.
- **io_worker `fetchArchive`** (whole-buffer transfer) + bridge's
  `fetchArchiveBytesOffThread` + the mountArchives bounded fetch-ahead
  prefetch pipeline. io_worker keeps fetchToOpfs / fetchRange /
  opfsCollectNamespaces / releaseHandles / ping / busy.
  test:io-worker-offthread reworked: heartbeat-during-fetchToOpfs +
  byte-exactness + an explicit pin that `fetchArchive` is refused (15/15).
- **range-backed subset-mount machinery** (bridge.js ~540 lines):
  fetchByteRange, extractBigEntryFromUrl, extractBigEntriesFromUrl,
  indexBigArchiveUrl, buildBigArchive, writeBigUInt32BE,
  mountRangeBackedArchiveSet, mountBigArchiveEntry, mountShippedMeshAsset
  (+ RPC dispatcher cases).
- **21 legacy smokes** that only existed on that machinery (coverage owned
  by the real boot: threaded_play_gate + shellmap_real_init_gate +
  skirmish/startup-vertical real-init runs render terrain/trees/roads/
  props/bridges/meshes/shell UI/text/mapped images through real init):
  terrain_{visual,map_patch,tree_buffer,road_buffer,prop_buffer,
  bridge_buffer}_scene + terrain_prop_buffer_render, shipped_mesh_render,
  display_{shell_composite,mapped_image,mapped_image_clip,
  mapped_image_unrotated,main_menu_ruler,game_text,drawimage_file},
  main_menu_layout_image_repaint, object_ini, range_backed_archives,
  startup_range_backed_archives smokes + plumbing_check.mjs /
  input_fix_verification.mjs debug scripts. package.json dropped 19
  scripts; run_vertical_integrations dropped the 11 steps that ran them.
  The wasm-side `cnc_port_probe_ww3d_*` exports they drove are now
  JS-orphaned (burn down with the probe surface; noted in TODO).
- **startup_vertical_smoke.mjs phases 1-2** (archiveless boot + range-backed
  "audio ownership" frontier boot + STARTUP_VERTICAL_REAL_INIT_ONLY flag):
  probe-era hand-authored frontier contracts, already red on main
  (assertFunctionLexiconRuntimeFrontier); the browser smoke is the
  real-init vertical only now — that documented pre-existing red is gone.
- **threaded_play_gate reference leg** (`?threads=0&dist=dist`) + the
  OPFS_MOUNT=0 MEMFS A/B mode + SKIP_REFERENCE env: the gate boots ONE
  threaded page; the non-threaded real-init reference is
  shellmap_real_init_gate.mjs on harness/index.html.
- **replay_issue_dump threads=0 pinning**: threaded dumps replay on their
  recorded dist; dumps recorded on the retired legacy play path replay on
  the threaded default with a loud fidelity warning.
- **stepped_load_turret_validation_check** converted to the threaded play
  page (persistent context for OPFS quota; profile rm'd in finally) — it
  now guards advanceLoadSession's m_isInUpdate latch on the SHIPPING path.

**Deliberately KEPT (and why):**

- **The MEMFS mount pipeline** (mountArchive, mountArchives' non-threaded
  branch, writeArchiveToMemfs — now inline sequential fetch, no worker):
  it is THE mount path for the harness/index.html legacy-boot surface —
  ~40 non-threaded gates/smokes (shellmap_real_init_gate, skirmish/fx/
  laser/audio/network/bink/runtime-archives smokes, runtime_frame_profile)
  and A/B-debug boots of the non-threaded dists. A main-thread engine
  cannot read OPFS synchronously (sync access handles are worker-only), so
  deleting MEMFS mounts would have killed the whole non-play verification
  surface, not just the play-page legacy path. The play page can no longer
  reach it.
- **The non-threaded dist/dist-release builds** (owner caution: engine devs
  need them for A/B debugging).
- **io_worker `fetchRange`** (kept per directive; currently unused by
  bridge).
- **The audio-inventory MEMFS scan**
  (buildAudioPayloadInventoryFromMountedArchives): still consumed by the
  kept non-threaded runtime_archives_smoke + state snapshots; threaded OPFS
  mounts keep marking it `{ok:false, skipped:true}`.
- **Stepped-load engine machinery**: re-documented as the
  PRESENTATION-YIELD mechanism (real load screen paints; frames flow on
  the engine thread), not freeze protection.

**Whole-suite honesty:** the tools/verify_* battery has 26 reds — byte-for-
byte the SAME 26 on pristine main (pre-existing frontier-contract drift);
worktree-only diffs were missing gitignored build/assets dirs. The bink
presentation verifier's display_drawimage_file line pins were removed with
the smoke (ok:true again). Post-demolition gates: verify:threaded-play,
probe:p2-opfs, p1_scaffold_probe, test:io-worker-offthread,
shellmap_real_init_gate (the kept index.html legacy-boot surface), fresh
build:port + build:port:threaded:release — results in DONE.md "Legacy
play-path demolition".
