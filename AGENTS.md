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
| File/BIG archive I/O | streamed fetch → OPFS + engine-thread sync reads |

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

## Real-GPU verification

SwiftShader is the deterministic headless baseline, but it is a software
renderer. Rendering and performance changes also need a run in Chrome on real
GPU hardware. Use `WebAssembly/harness/mac_verify.mjs` when a remote macOS GPU
host is available; the SSH host and worktree are caller-supplied arguments or
environment variables. Keep each machine's ignored `harness/.certs` directory
local because replacing its certificate invalidates the browser trust decision.

The repository must live on a case-sensitive filesystem. The shim strategy has
same-name headers that differ only by case, including `windows.h`, `Windows.h`,
and `Windows.H`; copying through a case-insensitive filesystem can collapse
them silently.

## Status

`WebAssembly/` is the port work area: the Emscripten build (`CMakeLists.txt`),
Win32/D3D8 header shims (`shims/`), the browser D3D8 to WebGL2 layer
(`src/wasm_d3d8_shim.*`), the threaded worker runtime, launcher, asset import,
and the browser harness. The real engine boots through all initialization
stages, renders the shell and playable skirmishes, and remains under active
fidelity, content, compatibility, and cleanup work.

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
