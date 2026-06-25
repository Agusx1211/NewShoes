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

The current runtime BIG inventory can be extracted from the user's local disc
images with:

```sh
npm run extract:runtime-archives
```

The script extracts these archives into ignored `artifacts/real-assets/` and
checks that every output has a nonempty `BIGF` archive header.
After extraction, `npm run test:runtime-archives-browser` verifies the browser
fetch/MEMFS delivery path by loading each archive through the Playwright harness
and reading it with the original `Win32BIGFileSystem`.

| Archive | Source | Role |
|---|---|---|
| `INIZH.big` | `Data1.cab` | Zero Hour INI/data definitions |
| `W3DZH.big` | `Data1.cab` | Zero Hour W3D models |
| `W3DEnglishZH.big` | `Language.cab` | English-localized W3D/UI assets |
| `TexturesZH.big` | `Data1.cab` | Zero Hour textures |
| `TerrainZH.big` | `Data1.cab` | Terrain assets |
| `WindowZH.big` | `Data1.cab` | Shell/control bar/window assets |
| `ShadersZH.big` | `Data1.cab` | Shader package |
| `MapsZH.big` | `Data1.cab` | Zero Hour maps |
| `AudioZH.big` | `Data1.cab` | Shared Zero Hour audio |
| `AudioEnglishZH.big` | `Language.cab` | English localized audio |
| `SpeechZH.big` | `Data1.cab` | Shared speech data |
| `SpeechEnglishZH.big` | `Language.cab` | English localized speech |
| `MusicZH.big` | `Data1.cab` | Zero Hour music |
| `Music.big` | `Data1.cab` | Base shared music |
| `EnglishZH.big` | `Language.cab` | English text/localization data |
| `GensecZH.big` | Disc 1 / `Data1.cab` | Zero Hour security/archive data |
| `Gensec.big` | Disc 2 | Base security/archive data |

This is the current runtime archive set from the installer media, not yet the
minimum boot set. The exact boot-minimum list must be proven after the original
engine startup and file-system paths are linked into wasm.
