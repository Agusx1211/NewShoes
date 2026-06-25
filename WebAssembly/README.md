# WebAssembly Port

Working area for the browser/WebAssembly port. See the repo-root `AGENTS.md`
for the goal and strategy.

**The port compiles the original source**, not reimplementations. The goal is to
build `GeneralsMD/Code` with Emscripten and re-target its platform/device layer
(`GameEngineDevice`, `Libraries`) onto browser APIs. The original engine already
contains the data layer (INI parsing in `GameEngine/Source/Common/INI/`,
compression and BIG-archive I/O in `Libraries` / `GameEngineDevice`); reuse it
rather than re-writing it.

## What's here

Asset tooling for obtaining real game data to test the port against:

- `tools/mode1_2352_to_iso.mjs` — convert raw MODE1/2352 disc images to ISO.
- `tools/extract_zh_big_sample.sh` — extract `INIZH.big` from the disc images in
  `../assets` (`npm run extract:real-big`). Needs `7z`.

Extracted archives land under ignored `artifacts/real-assets/`.
