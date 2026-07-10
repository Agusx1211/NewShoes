# AGENTS.md

## What this project is

Port the **actual original Command & Conquer: Generals / Zero Hour source code**
to run in the browser via WebAssembly.

This is a **port of the real game**, compiled from the genuine C++ source that is
already in this repo. It is **not** a copy, **not** a reimplementation, **not** an
"inspired by" clone, and **not** a simplified mini-game. The end goal is the real
game running in a browser: the original simulation, AI, 3D rendering, sound,
video, input, and networking — everything.

## Where the real source is

- `Generals/Code/` — original Generals source.
- `GeneralsMD/Code/` — original Zero Hour source (the primary target).
  - `GameEngine/` — **platform-independent game logic** (simulation, AI, INI
    loading, object/weapon/locomotor behavior, …). This compiles to wasm
    largely as-is.
  - `GameEngineDevice/` — **platform-specific implementations** behind the
    engine's device interfaces:
    - `W3DDevice/` → 3D rendering on DirectX 8 / the WW3D (W3D) engine.
    - `MilesAudioDevice/` → audio via Miles Sound System.
    - `VideoDevice/` → video (Bink).
    - `Win32Device/` → OS layer: window, files, input, timing.
  - `Libraries/Source/` — vendored deps: `DX90SDK`, `WWVegas` (W3D), `GameSpy`
    (networking), `Compression`, `STLport`, etc.

## Reference documentation & code library

Documentation resources for the port — reference repos (community source
ports, engine reimplementations, D3D8 implementations, format tooling), format
specs, modding docs, and browser-target API references (WebGL2 spec +
conformance tests, WebGPU, Web Audio, WebCodecs, WebAssembly, MDN) — are
available locally in **`./assets/docs/`**. Search it with
`python3 assets/docs/docsearch.py search "<terms>"` (ranked full-text;
see the `/docs-search` skill), or `rg` for exact strings.
**`./assets/docs/INDEX.md`** lists everything in there, how to access each
resource, and what to use it for. Before reverse-engineering a format, a D3D8
behavior, or a platform-layer question from scratch, check the index — someone
has usually already solved or documented it. When you add a resource to
`assets/docs/`, add an entry to `INDEX.md`. The directory is gitignored
(local-only): treat it as read-only reference material and never copy code
from it into checked-in files without checking its license.

## The port strategy

The game logic is already separated from the platform. **Keep the original game
code; replace the platform layer.** Re-implement the device interfaces in
`GameEngineDevice` and the `Libraries` deps against browser APIs:

| Original dependency | Browser target |
|---|---|
| DirectX 8 / W3D rendering | WebGL2 / WebGPU |
| Miles Sound System | Web Audio API |
| Bink video | WebCodecs / `<video>` |
| Win32 (window, files, input, time) | Emscripten + DOM / Canvas / Pointer + Keyboard events |
| GameSpy networking | WebSockets / WebRTC |
| File/BIG archive I/O | fetch + in-memory FS |

Toolchain: **Emscripten** (`emcc`/`em++`) targeting `STANDALONE_WASM`/browser.

## How the port advances: the real `init()` strategy

The port advances by running the **real engine lifecycle**, not by proving
subsystems in isolation. The era of adding probe/smoke slices is over; the
existing smokes stay only as regression tests.

- **The driving loop is the real boot path**: `main()` →
  `GameEngine::init()` → `GameEngine::execute()` linked into the single
  `cnc-port` runtime. Boot it in the harness, hit the first crash / abort /
  missing dependency, fix that, boot again. **"How far does real `init()` /
  `execute()` get in the browser" is THE progress metric** — not probe counts.
- **Compile and link everything.** All of `GameEngine`, `GameEngineDevice`,
  and the required `Libraries` link into the one runtime target. Stub only at
  the true platform boundary (Direct3D8 device, Miles, Bink, WinSock, Win32
  window/input/CD). Do **not** shadow engine logic with weak symbols,
  probe-local singletons, or "focused frontier" compile-only libraries.
- **Every fix lands in the linked runtime.** Never build a fix into an
  isolated probe that later needs "promotion to real ownership" — that is
  double work and the backlog proves it. When the real path covers what a
  probe proved, retire the probe and its TODO debt.
- **Do not add new `-smoke` executables or probe targets.** New verification
  goes through the harness driving the real `cnc-port` binary (boot, RPC
  queries, screenshots). Reductions in the probe/stub/weak-symbol surface are
  progress and should be committed as such.
- **Fix the crash the real boot reports — nothing else.** The frontier is
  whatever the last real `init()`/`execute()` run actually died on (subsystem
  name + failure message from the run itself, never a hand-authored claim).
  Work on that specific crash. Do **not** build ownership slices, preflights,
  or "readiness" proofs for subsystems the real boot has not reached yet —
  that is the probe-accretion loop this strategy retired.
- **Use the hot-path build in the boot loop.** `npm run build:wasm` compiles
  the full ~90-executable legacy smoke surface and pays a mass rebuild on
  every touched engine header. The iterate loop should use
  `npm run build:port` (just `cnc-port`) or `npm run build:startup-vertical`
  (the `zh_startup_vertical_hotpath` aggregate — everything
  `test:startup-vertical` runs). Full `build:wasm` is for the regression
  suite (`test:all`, `test:vertical-integrations`), not for every iteration.
  The legacy smokes remain canaries: they earn their keep when the regression
  suite runs them, not by being recompiled in the inner loop.

## Hard rules

- **Reuse the original source.** Big rule of thumb: if code already exists in
  the original source, **use it** — compile and port it. Only write new
  machinery when something genuinely cannot work in the browser without it
  (i.e. a platform/device dependency that must be re-targeted to a browser API).
  Don't re-write engine/data logic that already exists and is platform-independent.
- **Do not write a new game.** Do not reimplement gameplay, rendering, or AI
  "from scratch" or as an approximation. Compile and port the real code.
- **Do not invent data or behavior.** Behavior must come from the original
  source and the real game assets, not from made-up values.
- When something doesn't compile to wasm, the fix is to **port/shim its
  dependency**, not to stub out or fake the feature.
- Map missing platform APIs to browser equivalents; preserve original logic.
- **Modifying original engine code is allowed when the browser requires it**
  (policy updated 2026-07 — the port is mature enough that "never touch engine
  source" is retired). When a genuine browser constraint — the single-threaded
  event loop (nothing paints until control returns), async-only I/O, memory
  limits — cannot be met at the platform seam alone, change the original C++:
  add yield points, restructure a blocking loop, split a monolithic load
  function. Constraints on such changes:
  - Change **how** the code runs (scheduling, I/O, pumping), never **what**
    the game does — same data, same simulation outcomes, same UI flow.
  - Keep edits minimal and reviewable; prefer `#ifdef __EMSCRIPTEN__` gating
    or the established weak-hook pattern (`cnc_port_*` weak decls in engine
    files, strong defs in `wasm_real_engine_init.cpp`) so native builds keep
    the original behavior byte-for-byte.
  - A rewrite of a subsystem is still forbidden; surgical restructuring of a
    function the browser physically cannot run as-is is fine.

## Don't work blind: keep a driveable harness

A browser/wasm build is graphical and interactive, so an agent can't "see" it.
**Always build and maintain a scriptable harness** that lets an agent (and CI)
drive and observe the running build with no human in the loop:

- Run the build in a **headless browser** (e.g. Playwright/Puppeteer): boot it,
  load to a known state, and **capture canvas screenshots** to confirm what
  actually rendered. An agent cannot verify rendering any other way — screenshot
  liberally.
- Expose a **command / RPC control surface** (from the JS bridge or the engine
  itself) so the harness can issue real inputs and queries: boot, load or skip
  to a menu/map, click named UI buttons, select and move units, issue orders,
  start and step a match, and read back game state and logs.
- Prefer driving through the engine's **own input/command path** over blind
  pixel-clicking, then verify the result with a screenshot and/or a state query.
- Treat any change as **unverified until the harness boots the build and a
  screenshot or state check proves it works**.

Grow this harness with the port: every new subsystem (rendering, input, audio,
AI, match flow) should be reachable and checkable through it.

## Real-GPU verification machine (Mac M4)

A dedicated Apple M4 Mac mini (10 cores, 16GB, macOS, Chrome with Metal-backed
WebGL2) is available for **real-GPU verification and performance measurement**.
The dev box's headless Chromium renders via SwiftShader (software); every pixel
proven there is CPU-rasterized. Measured on the same build: a fully loaded
1,310-object map runs ~38fps on the Mac's real GPU vs ~1-2fps under SwiftShader
on the (shared, busy) dev box. Use the Mac to (a) decompose "slow frames" into
sim cost vs software-rasterization cost, (b) catch real-driver WebGL2 behavior
SwiftShader hides, and (c) verify quickly — full boot incl. the 1.3GB archive
mount takes ~20s there. Keep SwiftShader as the deterministic CI baseline;
GPU runs are for perf and driver realism, not pixel-exact regression goldens.

How to use it:

- **SSH**: `ssh cnc-gpu` (alias in `~/.ssh/config` on the dev box →
  `aa@192.168.106.45`, key `~/.ssh/id_ed25519_main2`).
- **Repo copy**: `/Volumes/CnCWork/CnC_Generals_Zero_Hour`
  (`~/workspaces/CnC_Generals_Zero_Hour` symlinks to it). This is a
  **case-sensitive APFS volume (sparse image `~/cnc-work.sparseimage`) and
  that is load-bearing**: the `WebAssembly/shims/` strategy ships same-name
  headers differing only in case (`windows.h`/`Windows.h`/`Windows.H`) and
  relies on engine includes NOT matching shim headers of different case.
  Never place or build this repo on a case-insensitive path, and never copy
  it through one (files collapse silently in transit).
- **Sync** (dev box → Mac; the dev box stays the build machine):
  `rsync -az --exclude WebAssembly/build --exclude WebAssembly/node_modules \
    --exclude WebAssembly/harness/.certs \
    ~/personal/CnC_Generals_Zero_Hour/ cnc-gpu:/Volumes/CnCWork/CnC_Generals_Zero_Hour/`
  Syncing `WebAssembly/dist/` this way ships fresh builds for verification.
  `harness/.certs` (each box's persistent self-signed HTTPS cert) must NEVER
  be rsynced between boxes — replacing the Mac's cert breaks the owner's
  one-time browser trust decision.
- **Harness server**: `HOST=0.0.0.0 PORT=8123 HTTPS_PORT=8443 node
  harness/serve.mjs` from `WebAssembly/` on the Mac (usually already
  running; HOST=0.0.0.0 defaults HTTPS_PORT to 8443 anyway). The
  human-playable page is `http://192.168.106.45:8123/harness/play.html` —
  the project owner plays from this URL; keep it working. The plain LAN-IP
  origin is untrustworthy (no SharedArrayBuffer for the threaded default),
  so that page auto-redirects to
  `https://192.168.106.45:8443/harness/play.html` (self-signed cert, trusted
  once per device); there is NO legacy single-thread fallback (owner
  directive 2026-07-10).
- **Headless GPU probes**: `~/cnc-verify/` on the Mac has `playwright-core`
  installed; launch with
  `executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
  and `args: ["--enable-gpu", "--use-angle=metal"]`, then drive
  `window.CnCPort.rpc(...)` exactly like the dev-box harness. Confirm the
  renderer string reports "ANGLE Metal Renderer: Apple M4", not SwiftShader.
- **Toolchain**: emsdk 3.1.6 (matching the dev box) is at `~/emsdk`
  (`source ~/emsdk/emsdk_env.sh`); brew cmake/ninja/node are installed. The
  native Mac build of `cnc-port` is currently red on a remaining
  case-sensitivity issue (shim `STLTypedefs.h` TU) — fixing it is welcome but
  optional; the build-on-Linux + verify-on-Mac loop works today.
- **macOS quirks**: no `timeout(1)` (use node-side deadlines or `& sleep;
  kill`), BSD `sed -i ''`, default shell is zsh, brew lives in
  `/opt/homebrew/bin` (not on PATH in non-interactive ssh).

## Status

`WebAssembly/` is the port work area: the Emscripten build (`CMakeLists.txt`),
Win32/D3D8 header shims (`shims/`), the browser D3D8→WebGL2 layer
(`src/wasm_d3d8_shim.*`), the headless-browser harness (`harness/`), asset
extraction (`tools/`), and a large legacy set of probe/smoke targets from the
earlier incremental strategy. Under the real-`init()` strategy above, current
work is: link the full engine into `cnc-port`, drive real
`GameEngine::init()`/`execute()` forward in the harness, and burn down the
probe/stub surface as the real path takes over.

## Plan & checklist

- `PROJECT.md` — broad outline of the whole port: architecture, the
  device-layer mapping, milestones, and known hard problems.
- `TODO.md` — open checklist of everything still to be done, tested, and
  validated, grouped by milestone.
- `DONE.md` — completed checklist history, grouped by the same milestones.
  Search it when you need to verify that related work was already handled.
- `IDEAS.md` — deferred experiments and longer design notes that should not
  bloat the active checklist until they become current work.

**Every agent must, every time:**

- **Read `PROJECT.md` and `TODO.md` first** so you build from the current open
  plan instead of guessing.
- **Search `DONE.md` for related completed work before implementing in an
  area**, so you build on existing progress instead of redoing it. Do not load
  all of `DONE.md` by default unless broad history is genuinely needed.
- **Always add any future TODO you encounter to `TODO.md`** if it isn't already
  listed — new tasks, tests, edge cases, risks, follow-ups.
- Put speculative future designs and non-current idea dumps in `IDEAS.md`,
  then promote only the next concrete action into `TODO.md` when it becomes
  active work.
- As you complete work, move the item from `TODO.md` to `DONE.md` as `[x]`
  instead of leaving completed entries in `TODO.md`. Remember: nothing
  rendering-related is done until the harness proves it (see above).
- Commit your work using short but descriptive commits. Sign it with your provider + model (granular, include subversion) name as author.

<!-- BEGIN orchestrator-skill (managed) -->
## Orchestrator mode (pi-as-mcp sub-agents)

When asked to orchestrate, or to build / implement / fix work by delegating,
act as a **hands-off orchestrator**: do not code, review, scout, test, or merge
by hand — delegate every hands-on task to pi-as-mcp sub-agents and keep your own
context clean. Full instructions and the available team:

- `.claude/skills/orchestrator/SKILL.md` — how to orchestrate.
- `.claude/skills/orchestrator/TEAM.md` — who is on the team.

Read both before acting as the orchestrator.
<!-- END orchestrator-skill (managed) -->
