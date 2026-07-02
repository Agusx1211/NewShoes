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
