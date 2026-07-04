# HANDOFF — DELETE AFTER READING

> **LATE UPDATE (end of session):** `feat/commanding-fix` was **merged into `main`**,
> rebuilt (fresh wasm ~now), and synced to the Mac — so §2's "commanding is unmerged"
> is now stale: it IS on `main` and on the Mac. The merge was clean (auto-merged
> bridge.js + startup_vertical_smoke.mjs). It compiles + boots (Goliath reached LF2100),
> but **select→move is still UNVERIFIED** — run a long-deadline Mac `PROVE_INTERACT` to
> confirm units select+move (both prior runs died in the intro before player control).
> The Mac now has: full integration (perf/zorder/DXT/audio/music) + commanding query fix.
> Everything else below stands, especially §0 (the render fixes are SwiftShader-targeted /
> invisible on Metal — the owner's real Metal bugs are undiagnosed).

Orchestrator handoff for the C&C Generals/Zero Hour → WebAssembly port. Written at
the end of a long autonomous orchestration session. This captures **everything in my
head**: current state, what's real vs unverified, the branches, the traps, and the
honest assessment. Read it all before touching anything.

---

## 0. THE #1 HONEST TAKEAWAY (read this twice)

**Most of what I "fixed and verified" this session is invisible on the Mac's real
GPU, and I over-reported dev-box "green" as if it were user-visible progress.**

The dev box renders with **SwiftShader (software WebGL2)**; the owner plays on a
**Mac M4 with ANGLE/Metal (hardware WebGL2)**. Same WebGL API, but two real
differences bit me:

- **Extensions:** SwiftShader lacks `WEBGL_compressed_texture_s3tc`; Metal has it. The
  DXT CPU-decode fix only runs when s3tc is absent → on the Mac `dxtDecodes: 0`, the
  fix never executes. Textures were already loading fine on Metal.
- **FBO completeness:** SwiftShader hit incomplete-FBOs (triggering the Z-order/RTT
  bug); Metal reported `browserFboIncompleteCount: 0`, so the Z-order RTT fix's code
  path **never runs on the Mac** either.

**Implication:** the Z-order / missing-texture / shadow problems the owner *actually
sees on Metal* are almost certainly **different bugs** than the SwiftShader ones I
fixed. They are **not yet diagnosed.** DO NOT assume the merged fixes address them.
**Diagnose rendering issues on Metal, from what the owner sees on `play.html`**, not
on the dev box. Verified-on-SwiftShader ≠ fixed-for-the-user.

The one merged change that IS a real, confirmed user-visible win: **music** (below).

---

## 1. CURRENT STATE OF `main`

`main` = commit **`ee3e712`** (I just recovered it — see §5 the git incident).
It is the integrated build, verified to **boot green to campaign start on the dev box**
(EXIT_CODE=0, zero regressions: 0 lineIndices/TypeError/FBO-failures) and confirmed
byte-identical on the Mac earlier this session. Merged into it:

- `feat/perf-drawstate` (364c0f6) — skip re-applying unchanged D3D8 render state.
  Had TWO review-caught correctness bugs (geometry + texture binds were being skipped);
  both fixed (geometry + texture setup always run; only redundant render-state skipped).
- `feat/zorder-fix` (5ca33d7) — RTT: on an incomplete FBO it was falling back to the
  DEFAULT framebuffer and polluting main depth (objects behind terrain **on SwiftShader**);
  now restores the previous FBO + rechecks completeness + forces `depthMask(true)` around
  clears. **Invisible on Metal (see §0).**
- `feat/dxt-cpu-fallback` (ee65b1a, +scope-fix ee3e712) — CPU DXT1/3/5→RGBA decode when
  s3tc is missing. Decode math is **correctness-verified** with exact-value unit tests.
  **Invisible on Metal (s3tc present).**
- `feat/audio-ini-fix` (0c33fa8, 07ab1e5) — added non-`Default\` audio INI paths so the
  audio subsystem actually initializes (was `missing_runtime_archives`, `initRan:false`).

**MUSIC (real, confirmed win):** the mounted `base-generals/Music.big` was a **786KB
copy-protection stub** (only `generalsa.sec`) extracted from the wrong (ZH) `Data1.cab`.
The **real 152MB** base-Generals `Music.big` (with `Data\Audio\Tracks\*.mp3` matching
`Music.ini`) lives in `assets/Generals-CD1/Data1.cab`. I extracted it to
`WebAssembly/artifacts/real-assets/base-generals/Music.big` (gitignored — **must be
rsync'd explicitly**, which I just did). On the Mac this now loads: `musicAlreadyLoaded:
true`, 69 tracks, **27s of real audio rendered on Metal**. The extract-script fix
(`tools/extract_zh_runtime_archives.sh`, commit 78eb925) is merged so it's reproducible.

**The Mac** (`/Volumes/CnCWork/CnC_Generals_Zero_Hour`) has just been synced to this
`main` (dist + harness + the 152MB Music.big). Harness server on `:8123`,
play URL `http://192.168.106.45:8123/harness/play.html`. Reach it via `ssh cnc-gpu`.

---

## 2. PENDING BRANCHES (committed, NOT merged — the next agent's queue)

- **`feat/commanding-fix` (23c29a9) — HIGHEST VALUE.** The "units don't respond"
  root cause was a **stray `}` in `cnc_port_query_drawables`** (`WebAssembly/src/
  wasm_real_engine_init.cpp`) → malformed JSON → `JSON.parse` abort → `ready:undefined`,
  0 drawables. Fixed. Query now **proven working** (`ok:true`, ~21–27 on-screen local
  units, picked an AmericaTankPaladin). Also fixed harness click-timing (`selectAndMoveUnit`
  stepped too few frames between mouse-down/up, so clicks never reached SelectionTranslator).
  Touches C++ → **needs a rebuild after merge.** SELECT→MOVE STILL UNVERIFIED: both Mac
  attempts ran out of time in the cinematic intro (reached logicFrame ~2100; player control
  is ~2560). Needs a **longer-deadline Mac run** with `STARTUP_VERTICAL_PROVE_INTERACT=1`.
  NOTE: real-mouse commanding in `play.html` may **already work** — the real engine
  click→select→move path (Win32Mouse→SelectionXlat→CommandXlat→`MSG_DO_MOVETO`) is linked;
  the query RPC is only the harness's *verification* tool, not the gameplay path.
- **`feat/perf-bindcache` (f5c815e)** — perf: cache the per-draw temporary index buffer
  (was create+delete every draw) + cache `lastProgram`/`lastArrayBuffer` to skip redundant
  `useProgram`/`bindBuffer`, with a context-loss reset. `bridge.js`-only. **UNVERIFIED render.**
  Render-verify (symlink-dist trick, §4) then merge. FPS win, invisible otherwise.
- **`feat/skirmish-load` — INCOMPLETE.** Diagnosis is solid: skirmish never loads because
  `getDefaultOfficialMap()` (`MapUtil.cpp`) returns empty (MapCache has no
  `m_isMultiplayer && m_isOfficial` map) → `loadMap("")` → `DEBUG_ASSERTCRASH` in
  `populateRandomStartPosition` (`GameLogic.cpp:~868`). FIX: mount the shipped
  multiplayer-map archive (grep `MapsZH.big`/`Maps` in `tools/extract_zh_runtime_archives.sh`
  + the harness mount lists) and ensure the MapCache is populated — analogous to the
  Music.big fix. Two coders stalled on this (one hit an infra 1-hour hang; branch may be at
  base 7d9c0c9 with no real commits — check). Verify on the **Mac** (dev box OOMs).
- **`fix/build-age-label` — EMPTY (worker never committed).** The owner is (rightly)
  annoyed that `play.html` shows "build is Nh old". `play.mjs refreshBuildAge()` reads only
  the **wasm** `Last-Modified`, but the wasm rarely rebuilds (only on C++ change) while
  `bridge.js` changes constantly → misleading. FIX: display `max(wasm, bridge.js)`
  Last-Modified. Small, do it — the owner has hit this 3×.

Already-merged branches (do NOT re-merge): perf-drawstate, zorder-fix, dxt-cpu-fallback,
audio-ini-fix. `docs/session-done` (57c78dc) has DONE.md updates; `feat/audio-ini-fix`'s
extra TODO/script commits are already in `main`.

---

## 3. SCOPED-BUT-NOT-IMPLEMENTED (plans exist)

- **Shadows** (owner: "shadows are missing"): ZH units default to **SHADOW_VOLUME**
  (stencil, `W3DVolumetricShadowManager`); terrain/trees use **SHADOW_DECAL**
  (`W3DProjectedShadowManager`). `W3DScene` does a two-pass render. Both managers are
  weak-stubbed. **Good news:** the WebGL context already requests `stencil: true` and the
  D3D8 shim forwards stencil state, so the infra is ready. Phase 1 = cheapest visible
  (blob/decal shadows) or volume (stencil ready). Reference ports in `assets/docs/`:
  Thyme, Fighter19's `W3DVolumetricShadow.cpp`.
- **Control-bar HUD** (owner: "UI elements missing") — plan at `/tmp/controlbar-hud-plan.md`.
  Top missing-UI item; `ControlBarSystem`/`LeftHUDInput` in `missingCallbackGroups`.
- **Score screen** — plan at `/tmp/scorescreen-plan.md`.
- **Perf wins** — full spec at `/tmp/perf-wins-spec.md` (index-buffer cache + bind cache =
  the perf-bindcache branch; plus the 10-driver profiler list: per-draw VBO churn,
  redundant binds, uniform allocs, no batching, no VAO, matrix copies).
- `/tmp/*.md` and `/tmp/*-wt` worktrees are ephemeral — copy anything you want to keep.

---

## 4. VERIFICATION RECIPES (these work — use them)

- **Dev-box render-verify of a JS-only `bridge.js` fix WITHOUT the Mac:** a fresh worktree
  has no built wasm (runs js-stub). Symlink it to main's built dist:
  `ln -s <repo>/WebAssembly/dist <worktree>/WebAssembly/dist`, then
  `node WebAssembly/harness/startup_vertical_smoke.mjs` (~4 min, renders the REAL engine,
  writes ~1.4MB screenshots). C++ changes need a real `npm run build:port` in the worktree.
- **Mac (Metal, real GPU) — this is where you diagnose what the owner sees:**
  `ssh cnc-gpu`; repo at `/Volumes/CnCWork/CnC_Generals_Zero_Hour` (case-sensitive APFS —
  load-bearing, never copy it through a case-insensitive path); `node` at `/opt/homebrew/bin/node`;
  no `timeout(1)` (use `& sleep N; kill`). Run:
  `STARTUP_VERTICAL_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
  `STARTUP_VERTICAL_BROWSER_ARGS="--enable-gpu --use-angle=metal"` then the harness. Confirm
  renderer = `ANGLE Metal Renderer: Apple M4`. Reaches player control ~logicFrame 2560
  (give a **generous deadline** — my commanding runs died at ~2100). `STARTUP_VERTICAL_
  POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1` to reach control; `STARTUP_VERTICAL_PROVE_INTERACT=1`
  for select→move. MD_USA01 opens with a long camera/timer cinematic — `introDone` flips
  only near LF2560; a short run legitimately looks "stuck", it isn't.
- **The dev box OOMs** on the long MD_USA01 boot when the harness does heavy per-frame RPC/
  state export (SwiftShader memory + ReadPixels runaway). Keep gameplay-state verification on
  the Mac; keep dev-box runs light.
- `npm run build:port` builds just `cnc-port` (fast-ish); `build:wasm` builds the whole
  ~90-target smoke surface (slow — avoid in the inner loop).

---

## 5. THE GIT INCIDENT (important — guard against it)

A worker ran **`git reset --hard origin/main`** in the main checkout (reflog:
`0a05454 HEAD@{0}: reset: moving to origin/main`), which threw `main` from the integrated
`ee3e712` back to the **pristine initial commit** and left all of `WebAssembly/` showing as
untracked. I recovered with `git reset --hard ee3e712` (the integration commits survived,
reachable via `docs/session-done`/`feat/perf-bindcache`). **Lesson for the next agent:**
never let workers run `git reset --hard`/`origin/main` operations in the shared main
checkout; give them isolated worktrees; sanity-check `git log --oneline -1 main` before
syncing/committing. If `main` ever looks pristine again, the work is in the reflog.

Also: ~18 stale prior-session worktrees were janitored; the remaining worktrees are listed
by `git worktree list`. The `/tmp/*-wt` ones are this session's branches.

---

## 6. TEAM / ORCHESTRATION NOTES (pi-as-mcp)

- Roster (see `.claude/skills/orchestrator/TEAM.md`, but it's partly stale):
  **Falcon** `llmbench-llamacpp/qwen3.6-27b@iq2_m` (58K ctx, fast, micro-tasks only) ·
  **Atlas** `macstudio/qwen3.6-27b-mtp` (best local, slow) ·
  **Ranger** `macstudio/qwen3.6-35b-a3b-mtp@q8_k_xl` (TEAM.md's `.../qwen/qwen3.6-35b-a3b`
  alias is DEAD — use the `-mtp@q8_k_xl` one; macstudio is ONE lane, Atlas XOR Ranger) ·
  **Sherpa** `vscode11/qwen3.6-35b-a3b-mtp` · **Mercury** `mistral/mistral-medium-3.5`
  (metered, ≤1) · **Goliath** `opencode-go/glm-5.2` (strongest, metered) ·
  **Comet** `opencode-go/deepseek-v4-pro` (2nd, metered, ~4× cheaper). Goliath+Comet share
  one metered opencode-Go pool.
- **The owner is firm: NEVER idle the LOCAL lanes** (Falcon/Atlas/Ranger/Sherpa) — free
  compute, keep them fed. Deliberate-spend only the metered ones (Mercury/Comet/Goliath).
- **Infra was flaky near the end:** `agent_reply`/`agent_stop` intermittently returned
  daemon timeouts / `None is not of type boolean` validation errors (the action often still
  happened). `piw <id> -a N` monitor numbers drift — **always use the exact `monitor_command`
  the tool returns**, and even then some workers (esp. Falcon) returned stale/duplicate reads.
- **Workers are witnesses, not oracles:** verify claims. This session, a "DXT works" report
  was a false positive (test didn't check color correctness — a review caught an inverted
  `c0>c1`), and two perf-skip correctness bugs were review-caught. Always cross-check with a
  real run/screenshot, not the worker's prose.

---

## 7. WHAT I'D DO NEXT (priority order)

1. **Diagnose the owner's ACTUAL Metal-visible bugs** (Z-order/textures/shadows) from
   `play.html` on the Mac — this is the real gap (§0). Get a Mac gameplay screenshot at
   player control (long deadline) and root-cause on Metal, not SwiftShader.
2. **Merge + verify `feat/commanding-fix`** (rebuild; long-deadline Mac `PROVE_INTERACT`
   run; also just try real mouse clicks in `play.html` — it may already work).
3. **Finish `feat/skirmish-load`** (mount multiplayer maps; verify on Mac).
4. **Fix `play.mjs` build-age label** (`fix/build-age-label` is empty — trivial, owner cares).
5. **Render-verify + merge `feat/perf-bindcache`** (FPS).
6. **Shadows** Phase 1 (stencil infra is ready).
7. Fold the perf-caching and profiler wins.

The game **boots, renders the MD_USA01 scene, and now has working music**. The frontier is
making the *visible-on-Metal* gameplay + rendering correct — commanding, skirmish, and the
real (not-SwiftShader) render bugs.

Good luck. — outgoing orchestrator
