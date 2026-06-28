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

`WebAssembly/` is the port work area. It currently holds asset-extraction
tooling (pull `INIZH.big` from the disc images in `assets/`) for testing the
port against real data. The real work: compile `GeneralsMD/Code` with Emscripten
and re-target its `GameEngineDevice` / `Libraries` layer onto browser APIs.

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
