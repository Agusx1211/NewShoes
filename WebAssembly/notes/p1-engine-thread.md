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

## Running state (update me)

- [x] P0 spike merged (build green, pthread runs real init, FS proxy works).
- [ ] Recon map of bridge.js delivered (agent, in flight).
- [ ] P1a GATE A
- [ ] P1b extraction + non-threaded parity proof
- [ ] P1c GATE B (title), GATE C (shellmap+input+RPC)
- [ ] GATE D Mac Metal + owner
