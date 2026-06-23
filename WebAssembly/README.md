# Command & Conquer Generals WebAssembly Port

This directory contains the browser/WebAssembly port work.

The first checked-in targets are small, real game-data modules:

- Electronic Arts RefPack decoding from
  `Generals/Code/Libraries/Source/Compression/EAC/refdecode.cpp`
- BIG archive directory parsing based on the format handling in
  `Generals/Code/GameEngineDevice/Source/Win32Device/Common/Win32BIGFileSystem.cpp`
- INI block/property indexing based on the block style and type table in
  `Generals/Code/GameEngine/Source/Common/INI/INI.cpp`

RefPack, BIG, and INI support are needed before browser-side loading of original
game configuration can work. These targets build with Emscripten when available
and fall back to raw Clang wasm builds for dependency-free smoke testing where
possible. Later targets can add typed gameplay object factories, filesystem,
browser loop, and SDL/WebGL integration.

## Build

```bash
bash tools/build_refpack_wasm.sh
```

Output:

`dist/generals_refpack.wasm`

`dist/generals_big.wasm`

`dist/generals_ini.wasm`

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

## Real Asset Probe

If the Zero Hour Disc BIN images exist under `../assets`, convert the raw
MODE1/2352 tracks to ignored ISO images, extract `INIZH.big`, and parse it with
the wasm module:

```bash
npm run extract:real-big
npm run test:real-big
npm run test:real-ini
```

The extracted archive stays under ignored `artifacts/real-assets/`.
