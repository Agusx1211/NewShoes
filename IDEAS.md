# IDEAS.md - Deferred and experimental ideas

Non-blocking ideas live here so `TODO.md` stays focused on the active open
port checklist. When an idea becomes current work, promote the next concrete
action into `TODO.md`; keep the longer rationale here.

Search `DONE.md` before turning an idea into work, so completed history is not
rediscovered as a new plan.

---

## Future / experimental: "LLM plays CnC" harness

Once a playable skirmish boots (M6+) the engine already has the right seams for
an external/LLM player, so the harness is the real work, not engine surgery.
Key facts from the original source that make this tractable:

- The strategic AI is a pluggable subclass: `Player::setPlayerType()`
  (`Source/Common/RTS/Player.cpp:768`) creates either `AIPlayer` or
  `AISkirmishPlayer` as `Player::m_ai`, and `Player::update()` calls
  `m_ai->update()` each frame. An LLM player is a third subclass of `AIPlayer`
  whose `update()` defers to an out-of-process LLM instead of the hardcoded
  heuristics in `doBaseBuilding`/`doTeamBuilding`/`selectTeamToBuild`.
- The action vocabulary is finite and already a message bus: `MSG_DO_*` /
  `MSG_QUEUE_*` in `Include/Common/MessageStream.h` (MOVE, ATTACK_OBJECT,
  GUARD_POSITION, QUEUE_UNIT_CREATE, QUEUE_UPGRADE, SET_RALLY_POINT,
  DO_SPECIAL_POWER, FORCE_ATTACK_GROUND, SCATTER, STOP, ...). These are the
  same GameMessages human mouse clicks are translated into by
  `GameClient/MessageStream/*Xlat.cpp`. The LLM action layer maps text /
  function-calls onto this enum plus ObjectIDs/locations.
- The observation layer exists: `PartitionManager`
  (`getClosestObject`, `iterateObjectsInRange`) is the spatial "what can I see"
  query; `Player` holds its own unit list; `TheBuildAssistant->buildObjectNow`
  is how buildings get placed.
- The tactical micro is free: per-unit `AIUpdate` modules (`JetAIUpdate`,
  `DozerAIUpdate`, `TurretAI`, pathfinding in `AIPathfind.cpp`) run for every
  unit regardless of who owns them, so the LLM only needs to do strategy
  (economy, build order, army comp, where/when to attack, generals' powers),
  not per-unit micro.

Tasks to promote when M6+ makes this actionable:

- Add an `LLMPlayer : AIPlayer` subclass whose `update()` pauses/steps the sim
  and asks an out-of-process model for the next orders. Keep this single-player
  only; it breaks multiplayer lockstep.
- Add sim pause/step control so a multi-second LLM round-trip does not stall or
  desync the deterministic sim. This should reuse the harness stepping needed
  for M6.
- Build an observation serializer that turns fog-of-war-filtered game state
  into a token-budgeted model prompt: spatial summary, threats near base, own
  units, enemy contacts, build queues, money, power, and tech tier.
- Add an action parser with a constrained-output schema (function calling /
  JSON) that grounds LLM output onto real `MSG_DO_*` / `MSG_QUEUE_*` messages,
  valid ObjectIDs, and world coordinates.
- Expose the flow through the harness RPC control surface: boot, set LLM as a
  side's player, start match, step, read back state, and capture screenshot.
- Establish an evaluation baseline: can an LLM beat the built-in skirmish AI on
  easy?
- Decide per-frame vs per-decision cadence and batch orders to bound call rate.

## Deferred: audio decode on a Web Worker ("audio on its own thread")

Context (2026-07-09 perf review): Web Audio *playback* already runs on the
browser's dedicated real-time audio thread — nothing to move there. What sat
on the main thread was the per-play JS work in `bridge.js`: WAV/IMA-ADPCM
decode, int16→float conversion, and diagnostics. The decoded-AudioBuffer
cache (see DONE 2026-07-09) removed the *repeated* cost; what remains on the
main thread is the one-time first-play decode per unique sample (~1-3ms for
typical SFX, more for long speech).

If first-play decode still shows up in Metal traces:
- Move `decodeAudioWavPayload` to a plain module Worker (same pattern as the
  existing IO worker, `harness/io_worker.mjs` — no pthreads/SAB needed).
  Post the WAV bytes (transferable), decode + convert to `Float32Array`
  channel buffers off-thread, transfer them back, then `AudioBuffer` +
  `copyToChannel` on main (fast memcpy).
- The tradeoff: sample start becomes async (first play of a sample lands a
  frame or two late). Miles semantics tolerate this — the shim already
  routes completion callbacks asynchronously.
- Do NOT move the engine's MilesAudioManager itself onto a pthread: its
  per-frame work is tiny, and the pthreads + ALLOW_MEMORY_GROWTH constraint
  on emsdk 3.1.6 (see the IO-worker analysis in TODO.md) makes that
  high-risk for no measured win.

## Design: "the browser as a 2003 PC" — engine thread + OPFS disk (owner-directed, 2026-07-10)

Owner goals: the game uses its OWN loading screens, the main thread is never
locked, and archive memory is not duplicated at all. Owner explicitly allows
touching the engine (AGENTS.md 2026-07 policy already permits scheduling/I-O
restructuring). Conclusion of the 2026-07-10 I/O audit: the architecture that
meets all three goals touches the engine LESS than today's strategy — the
stepped-load surgery exists only because the engine currently shares the
browser's main thread. Give the engine its own thread and its original
blocking model becomes correct again.

Target shape — map the browser onto what the engine was written for:

- **Engine thread = the game process.** `-pthread` + `-sPROXY_TO_PTHREAD`:
  `main()` and the whole engine run on a pthread (a dedicated worker).
  Blocking reads, `Sleep()`, monolithic loads are all fine there — they block
  the game, never the tab. COOP/COEP already served by the harness; SAB works.
- **OPFS = the disk.** Stream downloads chunk-by-chunk in the IO worker
  straight into OPFS (whole archive is never resident). Engine reads go
  through the existing `shims/io.h` seam: fd's under `/assets/` map to OPFS
  `createSyncAccessHandle` handles (async to open — pre-open all ~30 at boot —
  then genuinely synchronous `read(buf, {at})`, worker-thread-only, which the
  engine thread is). `Win32BIGFile`/`RAMFile` then work UNMODIFIED: RAMFile's
  whole-inner-file copy becomes the only RAM copy, freed on close. MEMFS
  mounts, `FS.writeFile` memcpys, and the 2GB residency all disappear.
- **OffscreenCanvas = the swapchain.** `-sOFFSCREENCANVAS_SUPPORT`: the
  WebGL2 context is created on the engine thread from the transferred canvas.
  The D3D8 shim's EM_JS bodies already execute in the calling thread's realm,
  so the GL half of bridge.js moves realms, not structure.
- **Main thread = the OS.** DOM input (emscripten proxies events to pthreads
  natively), Web Audio output (NOT available in workers — Miles shim calls
  become a command proxy engine→main; the shim already routes completions
  asynchronously), RPC frontend (`CnCPort.rpc` becomes async postMessage —
  harness callers already await), screenshots (the placeholder canvas still
  displays the OffscreenCanvas output; Playwright captures it as today).

Presentation nuance (load screens): OffscreenCanvas frames present only when
the worker task yields to its event loop — a hard-blocked engine thread shows
a frozen (not broken) load screen. So the stepped-init/load sessions are NOT
deleted: they stay as yield points so the real LoadScreen animates, but they
stop being correctness-critical. An over-budget step becomes a cosmetic load
bar stutter instead of a frozen tab; the 50ms-budget sub-splitting burden
(loadMap, preloadAssets, PartitionManager) evaporates.

Memory outcome: OPFS holds ~2GB on disk; wasm heap holds only the engine
working set (original-game scale, likely well under 1GB) and can go back to a
FIXED size with `ALLOW_MEMORY_GROWTH=0` — which also removes the known
pthreads+growth JS-side heap-view perf caveat. Tab RAM drops from ~4GB to
~1.5GB; iPad Safari becomes plausible.

The real bill (port layer, not engine):
1. bridge.js realm split: GL/heap-facing code loads in the pthread worker;
   DOM/audio/RPC/dump code stays on the page; a message channel between.
   Biggest single item (~33k-line file, entangled globals).
2. Audio command proxy main←engine (bounded; latency tolerated by Miles
   semantics, but verify EVA/UI click latency on real GPU).
3. Harness: every probe that assumes sync RPC-on-main gets async plumbing.
4. emsdk 3.1.6 is Feb-2022-old for pthread+OffscreenCanvas; an emsdk upgrade
   (separate, prerequisite-ish project — shims/ODR surface, wasm-EH release,
   STLport hashes) de-risks this a lot and unlocks WASMFS-OPFS/JSPI options.
5. Unknowns to spike FIRST: headless SwiftShader + OffscreenCanvas-in-worker
   (CI baseline must survive), Safari/iPad OffscreenCanvas WebGL2, pthread
   build vs the shim/ODR surface.

Phasing (each lands in the real cnc-port runtime, no probe accretion):
- P0 spike: CMake option builds cnc-port with pthread+PROXY_TO_PTHREAD+
  OffscreenCanvas; boot to title on SwiftShader + Metal. Flushes build/ODR/
  driver risk for ~zero design commitment. Keep the main-thread build green
  in parallel (dual-mode) until parity.
- P1: bridge realm split + input/audio/RPC proxies; still MEMFS-mounted.
- P2: OPFS read layer behind shims/io.h; downloads stream to OPFS; delete
  MEMFS archive mounts + mount pipeline + audio-inventory re-reads.
- P3: fixed-size heap (growth off); relax step budgets to presentation-only;
  retire the mount-freeze mitigations (chunked writes etc.) that P2 obsoleted.

Cheaper partial alternative if the thread migration is deferred: keep the
main-thread engine but store each archive ONCE in the wasm heap (raise
MAXIMUM_MEMORY toward 4GB) and serve `ArchiveFile` opens as zero-copy views
into the blob (borrowing RAMFile variant that skips the delete[]). Kills
duplication and MEMFS double-copies without threads — but residency stays
~2GB, load freezes remain bounded only by stepping, and it needs the 4GB
wasm32 pointer regime; it is subsumed by P2 later. Only worth it if P0/P1
stall.
