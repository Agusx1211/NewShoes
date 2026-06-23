# Command & Conquer Generals WebAssembly Port

This directory contains the browser/WebAssembly port work.

The first checked-in targets are small, real game-data modules:

- Electronic Arts RefPack decoding from
  `Generals/Code/Libraries/Source/Compression/EAC/refdecode.cpp`
- BIG archive directory parsing based on the format handling in
  `Generals/Code/GameEngineDevice/Source/Win32Device/Common/Win32BIGFileSystem.cpp`

RefPack and BIG support are needed before browser-side loading of many original
game data formats can work. These targets build with Emscripten when available
and fall back to raw Clang wasm builds for dependency-free smoke testing. Later
targets can add filesystem, browser loop, and SDL/WebGL integration.

## Build

```bash
bash tools/build_refpack_wasm.sh
```

Output:

`dist/generals_refpack.wasm`

`dist/generals_big.wasm`

## Smoke Test

```bash
node tools/test_refpack_module.mjs
```

## Browser Validation

Install the local JavaScript dependencies first:

```bash
npm install
```

Then run:

```bash
node tools/validate_browser.mjs
```

This starts a local static server, opens the harness in Chromium through
Playwright, waits for the wasm decode check to pass, and writes screenshots to:

`artifacts/screenshots/refpack-harness-desktop.png`

`artifacts/screenshots/refpack-harness-mobile.png`
