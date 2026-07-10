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
- [ ] P1c GATE B (title), GATE C (shellmap+input+RPC)
- [ ] GATE D Mac Metal + owner
