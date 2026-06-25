# Asset Handling

The browser port uses the original game assets supplied by the user. Game data
is copyrighted third-party content and must not be committed, bundled into
release artifacts, uploaded to CI logs, or redistributed from this repository.

The source code in this repository is the port target. The assets are local
inputs owned by the user who runs the port.

## Local Layout

- `../assets/` holds the user's original Zero Hour disc images. This path is
  ignored by git.
- `artifacts/real-assets/` holds extracted local test archives such as
  `INIZH.big`. This path is ignored by git.
- `dist/` and `build/` hold generated wasm build outputs. These paths are
  ignored by git.

## Browser Delivery

The initial development path is same-origin fetch from ignored local artifacts:

1. The user extracts archives into `WebAssembly/artifacts/real-assets/`.
2. The local harness server exposes that ignored directory only on the user's
   machine.
3. The JS bridge preloads required archive bytes before engine startup.
4. The Emscripten side mounts or copies those bytes into MEMFS/IDBFS.
5. The original engine BIG/file/INI code reads the mounted bytes.

This keeps the browser-specific boundary at file delivery. BIG parsing, INI
parsing, object templates, UI data, audio events, maps, and gameplay behavior
must continue to come from the original source and real archives.

For a user-facing browser build, add a file picker or drag/drop flow that accepts
the user's local BIG archives and stores them in IDBFS. Do not upload assets to a
server. Do not ship default replacement data.

## Required Archives

The current verified sample is `INIZH.big`, extracted from the user's local disc
image by `npm run verify:assets`.

Before the port can boot the real game, inventory and extract the full Zero Hour
runtime archive set from the user's discs. Expected groups include INI/data,
language/text, W3D models, textures, maps, audio, speech, and video. Keep the
exact required archive list in this file as it is proven by the original engine
startup path.
