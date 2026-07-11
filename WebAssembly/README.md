# WebAssembly runtime

This directory contains the browser platform for Project New Shoes. It builds
the original Zero Hour C++ engine as `cnc-port` and supplies the browser
implementations for Windows, DirectX 8, Miles, Bink, filesystem, input, and
networking boundaries.

Read the repository [README](../README.md) first. Asset ownership and import
rules are in [ASSETS.md](ASSETS.md).

## Layout

| Path | Purpose |
|---|---|
| `CMakeLists.txt` | Emscripten target graph |
| `shims/` | Win32, DirectX, MSVC, and legacy library compatibility |
| `src/` | wasm entry points and browser platform implementations |
| `harness/bridge.js` | main-realm RPC, audio, input, and lifecycle bridge |
| `harness/d3d8_executor.mjs` | D3D8 and SM1 shader execution on WebGL2 |
| `harness/engine_realm_boot.mjs` | pthread engine-realm startup |
| `harness/play.html` | launcher and human-playable entry point |
| `harness/*.mjs` | browser gates, diagnostics, and replay tools |
| `tools/` | build, extraction, inventory, and verification scripts |

`build/`, `dist*`, `artifacts/`, browser profiles, certificates, and retail
assets are generated locally and ignored.


## Toolchain

The pinned Emscripten version is in
[emscripten-version.txt](emscripten-version.txt), currently 3.1.6.

Prerequisites:

- Emscripten 3.1.6 activated through emsdk;
- Node.js and npm;
- CMake and Ninja; and
- 7-Zip for disc and Cabinet extraction tools.

Install JavaScript dependencies:

```sh
npm install
```

## Build targets

The normal development build compiles only the full runtime:

```sh
npm run build:port
```

Build the threaded release used by the play page:

```sh
npm run build:port:threaded:release
```

Useful variants:

| Command | Output and purpose |
|---|---|
| `npm run build:port` | debug `cnc-port` in `dist/` |
| `npm run build:port:release` | non-threaded release diagnostics |
| `npm run build:port:threaded` | threaded debug runtime |
| `npm run build:port:threaded:release` | threaded shipping runtime |
| `npm run build:startup-vertical` | real startup hot-path aggregate |
| `npm run build:wasm` | full legacy smoke surface; slow and broad |

Do not add new smoke executables. Product progress is measured through the real
`GameEngine::init()` and update lifecycle in `cnc-port`.

## Run the launcher

```sh
npm run serve:harness
```

Open `http://127.0.0.1:8080/harness/play.html`.

Localhost is a trustworthy origin. For LAN access, start the server on a
non-loopback host:

```sh
HOST=0.0.0.0 PORT=8080 HTTPS_PORT=8443 npm run serve:harness
```

The server creates a persistent ignored self-signed certificate in
`harness/.certs/`. Trust it once on each test device. Do not copy certificates
between machines.

The play path is threaded and OPFS-only. There is no single-thread fallback.
Chrome must report a cross-origin-isolated context with
`SharedArrayBuffer` support.

## Supply game data

The human launcher supports:

- selecting an installed Generals and Zero Hour game root; or
- selecting the complete original Generals and Zero Hour disc, ISO, IMG, or
  MODE1/2352 BIN set.

All parsing and installation happen locally. The launcher validates the full
runtime archive set before launch and stores persistent installations in OPFS.

For asset-backed development tests, ignored archive fixtures can be prepared
with:

```sh
npm run extract:runtime-archives
npm run verify:assets
```

The extraction scripts read only local media. Never commit their outputs.

## Verification

Fast startup gate:

```sh
npm run test:startup-vertical
```

Threaded launcher, OPFS, renderer, audio, shutdown, and relaunch gate:

```sh
npm run verify:threaded-play
```

Focused active-skirmish gate:

```sh
npm run test:skirmish-start
```

Broad legacy regression lane:

```sh
npm run test:all
```

Several gates require locally prepared retail archives and a persistent browser
profile. Redirect verbose output to an ignored artifact or temporary file and
inspect concise summaries. A rendering change is not verified until a browser
state assertion or screenshot proves the intended path.

## Host control surface

The play page exposes `window.CnCPort.play.configure(...)` for embedders and
tests. The same settings are available in the Project New Shoes desktop.

```js
await window.CnCPort.play.configure({
  performanceOverlay: { enabled: true, historySeconds: 5, graphMaxMs: 50 },
  display: { mode: "dynamic" },
  diagnostics: "lite",
  shaderTier: "ps11",
});
```

`ps11` is the enhanced default. `ff` selects the classic fixed-function tier.
An explicit URL choice, such as `?shaderTier=ff`, takes precedence over stored
settings.

The real threaded shader-fidelity gate requires a persistent Chrome profile
that already contains a locally installed archive set:

```sh
CNC_PROFILE_DIR=/tmp/cnc-shader-profile \
  CNC_HARNESS_URL=https://127.0.0.1:8443/harness/play.html \
  npm run verify:threaded-shader-fidelity
```

It inventories all 18 programs in the two retail shader archives, boots the
explicit `ps11` tier, and verifies that the `Trees.vso` relative c8-c12 wind
table changes reach WebGL uniform uploads.

The lower-level RPC surface is `window.CnCPort.rpc(command, payload)`. Harnesses
use it to boot, navigate, load maps, issue original commands, read state, record
issues, and capture pixels.

## Real-GPU verification

Headless Chromium often uses SwiftShader. Use
`harness/mac_verify.mjs` or an equivalent Playwright setup on real hardware
before making performance or driver-fidelity claims. The verification script
requires caller-supplied SSH host and remote worktree configuration; it contains
no machine-specific defaults.

Keep the checkout on a case-sensitive filesystem. Some compatibility headers
differ only by filename case.
