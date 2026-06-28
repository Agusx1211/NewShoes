# Asset Handling

The browser port uses the original game assets supplied by the user. Game data
is copyrighted third-party content and must not be committed, bundled into
release artifacts, uploaded to CI logs, or redistributed from this repository.

The source code in this repository is the port target. The assets are local
inputs owned by the user who runs the port.

## Local Layout

- `../assets/` holds the user's original Zero Hour disc images, and may also
  hold optional base Command & Conquer: Generals disc images. This path is
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
   The current harness paths are `window.CnCPort.rpc("mountArchive", { url, name })`
   for one BIG and `window.CnCPort.rpc("mountArchives", { path, archives })`
   for the runtime archive set. A verified archive-set mount is registered back
   into the wasm bootstrap as the aggregate archive directory plus `*.big` mask
   before the harness calls `boot`.
4. The Emscripten side mounts or copies those bytes into MEMFS/IDBFS.
5. The wasm bootstrap consumes the registered archive set during `boot` by
   probing the aggregate path with the original `Win32BIGFileSystem`.
6. The bootstrap reports `startupAssets` so the harness can distinguish
   missing runtime archives, registered-but-unprobed archives, and a
   probe-verified runtime archive set before original engine startup.
7. The original engine BIG/file/INI code reads the mounted bytes during startup.

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
If base Generals disc images are present, the same script also extracts
`INI.big` and `English.big`. It auto-detects base `.bin` images in `../assets`
when their names contain `Generals` and `Disc 1`/`Disc 2` but not `Zero Hour`;
set `CNC_GENERALS_DISC1_IMAGE` and `CNC_GENERALS_DISC2_IMAGE` to force explicit
paths.
After extraction, `npm run test:runtime-archives-browser` verifies the browser
fetch/MEMFS delivery path by loading the full archive set through the main
`cnc-port` Playwright harness and reading each archive plus the aggregate
archive tree with the original `Win32BIGFileSystem`. Optional base archives are
mounted under `ZZBase_*.big` names so the aggregate `*.big` load keeps Zero Hour
archive entries ahead of base fallback entries, matching the original expansion
install behavior where the ZH install path is loaded before the base Generals
install path. It also checks the C++
bootstrap `archiveMount` state both before and after `boot`, which is the
preload ordering the later original startup path will consume. The post-boot
state includes `archiveMount.bootProbe`, proving the bootstrap used the
registered aggregate path during boot. The same smoke asserts
`assetProbe.gameText` by loading the real English `Generals.csf` through
original `GameText.cpp` from the fetched archive set and checking known labels.
It also asserts `assetProbe.gameData` by loading real
`Data\INI\GameData.ini` from `INIZH.big` through original
`Common/INI.cpp::load` into original `GlobalData.cpp`, then verifying shipped
values. It also asserts `assetProbe.water` by loading real
`Data\INI\Water.ini` from `INIZH.big` through original
`Common/INI.cpp::load`, `Common/INI/INIWater.cpp`, and
`GameClient/Water.cpp`, then checking shipped water textures, scroll/repeat
values, and transparency settings. It also asserts `assetProbe.weather` by
loading real `Data\INI\Weather.ini` from `INIZH.big` through original
`Common/INI.cpp::load` and `GameClient/Snow.cpp`, then checking shipped snow
settings. It also asserts `assetProbe.mapCache` by loading real
`Maps\MapCache.ini` from `MapsZH.big` through original `Common/INI.cpp::load`
and `Common/INI/INIMapCache.cpp`, then checking shipped map counts and known
map entries. The smoke also checks `startupAssets`:
`pending_boot_probe` before boot and `ready` after the registered archive set
passes the boot-time archive/GameData/Water/Weather/GameText/MapCache probes.
Full all-block original INI loading, default+shipped water/weather startup
loading, water/weather rendering, and live map-cache rebuilding are still
tracked separately from this bootstrap preflight.

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

Optional base startup archives:

| Archive | Source | Role |
|---|---|---|
| `INI.big` | Base Generals `Data1.cab` | Default/startup INI files still referenced by original `GameEngine.cpp`, including `Data\INI\Default\*.ini`, `Data\INI\Rank.ini`, and `Data\INI\CommandMap.ini` |
| `English.big` | Base Generals `Language.cab` | Base English localization fallback data |

### Startup Inventory Classification

`npm run inventory:startup-archives` reports why required startup files are
missing. `optionalBaseArchives` records whether `INI.big` / `English.big` are
present, `missingDetails` annotates each gap with `expectedSource` and
`reason`, and `missingByReason` summarizes the counts.

Reasons are:

- `optionalBaseArchiveAbsent` — the file is expected from optional base
  Generals data that is not mounted locally.
- `missingFromBaseArchive` — the expected base archive is present but still
  lacks the file.
- `missing` — the Zero Hour runtime archive set itself is incomplete.

Pass `--strict` to fail only on `missingFromBaseArchive` or `missing`. The
current Zero Hour-only set stays green under `--strict` because its remaining
default/startup INI gaps are classified as optional base archive absence.

Pass `--require-base-startup` to run the bounded verification mode that proves
the current startup-file blocker when the optional base Generals startup
archives are supplied. It fails nonzero (`ok=false`) when any optional base
startup archive is absent or incomplete. The JSON exposes:

- `baseArchiveReadiness` — per optional base archive (`INI.big`, `English.big`):
  `present`, `expectedStartupFileCount`, `foundStartupFileCount`,
  `missingStartupFiles`, and `complete` (present and supplying every owned
  base startup file).
- `baseArchiveStartupReady` — boolean; true only when every optional base
  startup archive is present and complete.
- `missingBaseFiles` — every startup file missing from its owning optional base
  archive, with `expectedSource`, `reason`, and `sourceAbsent`.
- `requireBaseStartupFailures` — on failure under `--require-base-startup`,
  `{ absent: [...], incomplete: [{ archive, path }] }`.

The current Zero Hour-only assets fail under `--require-base-startup` by
design, because `INI.big` / `English.big` are not mounted; use this mode to
verify a supplied base-Generals asset set instead.

This is the current runtime archive set from the installer media, not yet the
minimum boot set. The exact boot-minimum list must be proven after the original
engine startup and file-system paths are linked into wasm.
