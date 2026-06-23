# Command & Conquer Generals WebAssembly Port

This directory contains the browser/WebAssembly port work.

The first checked-in target is a small, real game-code module around the
Electronic Arts RefPack decoder in:

`Generals/Code/Libraries/Source/Compression/EAC/refdecode.cpp`

RefPack support is needed before browser-side loading of many original game data
formats can work. This target builds with Emscripten when available and falls
back to a raw Clang wasm build for dependency-free smoke testing. Later targets
can add filesystem, browser loop, and SDL/WebGL integration.

## Build

```bash
bash tools/build_refpack_wasm.sh
```

Output:

`dist/generals_refpack.wasm`

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
