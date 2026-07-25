# Project New Shoes

<p align="center">
  <img src="WebAssembly/harness/assets/brand/project-new-shoes-mark.webp" alt="Project New Shoes launcher mark" width="220">
</p>

<p align="center"><strong>The original Command & Conquer: Generals Zero Hour engine, ported to WebAssembly.</strong></p>

Project New Shoes compiles the genuine C++ engine source in this repository to
WebAssembly and replaces its Windows device layer with browser implementations.
It is a port of the original game, not a clone or a gameplay reimplementation.

The project is independent, modified software. It is not affiliated with,
endorsed by, or supported by Electronic Arts. Retail game data is not included;
players must provide files from a copy they own.

## Play

**[Play Project New Shoes](https://newshoes.gg/)**

The launcher About window and
[deployed build metadata](https://newshoes.gg/harness/build-info.json) identify
the exact release and commit currently being served.

<p align="center">
  <img src="docs/images/project-new-shoes-zero-hour-menu.webp" alt="Zero Hour faction and skirmish menu rendered by the original engine in the Project New Shoes browser runtime" width="800"><br>
  <img src="docs/images/project-new-shoes-launcher-ready.webp" alt="Project New Shoes launcher showing a locally installed Zero Hour library ready to launch" width="800">
</p>

<p align="center"><em>Retail game data shown in these screenshots was supplied locally for testing. No game archives or reusable extracted assets are bundled with this repository.</em></p>

## Status

Project New Shoes is already the real Zero Hour game running in a browser. It
boots the original engine, runs skirmishes against the original AI, renders the
game through WebGL2, and uses the original UI, input, simulation, and command
paths. The browser desktop now also owns installation, mods, files, settings,
diagnostics, multiplayer setup, and optional agent configuration.

| Area | Status | Current support |
|---|---|---|
| Zero Hour shell and skirmish | ✅ **Supported** | The threaded runtime boots the original shell and runs playable matches against the original AI. All official multiplayer maps have reached a rendered skirmish state. |
| Installation and browser desktop | ✅ **Supported** | The launcher imports owned game data into OPFS and provides game launch, settings, files, diagnostics, and clean shutdown and relaunch. |
| Mouse, keyboard, and touch | 🧪 **Supported / in testing** | Mouse and keyboard use the original input path. Phone and tablet layouts add touch selection, orders, camera gestures, hotkeys, and text entry; physical-device and Safari breadth continue to mature. |
| Rendering, audio, and movies | 🧪 **In testing** | WebGL2 carries terrain, objects, UI, particles, effects, and enhanced or classic D3D8 rendering. Web Audio carries engine sound, and supported classic Bink content uses an on-device decoder. Fidelity and coverage work continue. |
| Campaign and Generals Challenge | 🧪 **In testing** | Both enter through the real engine. Mission breadth, cutscenes, win/loss flows, and edge cases remain active validation areas. |
| Mods | ✅ **Supported** | The Mod Manager handles ordered BIG and loose-data mods plus common archive and installer containers. Native Windows DLLs and executables are explicitly unsupported. |
| Saves and replays | 🧪 **In testing** | The desktop imports, exports, copies, and deletes configuration-isolated files, and focused real save/load and replay round trips pass. Broad long-session and mod coverage continue. |
| Multiplayer | 🧪 **Experimental** | The original lockstep protocol runs over direct WebRTC data channels with decentralized discovery. Short matches have been verified at up to four players; long sessions, difficult NATs, disconnects, and determinism remain active work. |
| Device transfer | 🧪 **Experimental** | A user-confirmed encrypted WebRTC flow can move an owned installation, selected mods, saves, and replays between the owner's devices. |
| Remote and LLM agents | 🧪 **Experimental** | An authenticated Remote Agent bridge and browser-local OpenAI-compatible LLM commanders can use bounded, fog-safe semantic engine interfaces. They are optional and do not bypass game rules. |
| Browser breadth | 🧪 **In testing** | Chrome and Chromium receive the strongest automated and hands-on coverage. Other modern browsers can work when they expose the required platform features. |
| Vanilla Generals | 🗓️ **Planned** | Generals data is used by Zero Hour, but the launcher does not currently expose a separate vanilla Generals runtime. |

The big pieces are in place. Current work is focused on fidelity, performance,
reliability, broader gameplay coverage, and browser validation. See the
[dated project guide](https://newshoes.gg/project.md),
[deployed build metadata](https://newshoes.gg/harness/build-info.json), and
[GitHub Issues](https://github.com/Agusx1211/NewShoes/issues) for current
details.

## What you need

The runtime requires a modern graphical browser on a desktop, phone, or tablet
with WebAssembly threads, WebGL2, `OffscreenCanvas`, Web Audio,
`SharedArrayBuffer`, cross-origin isolation, and Origin Private File System
support. Chrome and Chromium are the primary tested targets; other capable
browsers do not yet receive the same validation. Landscape is recommended on
touch devices because the original UI was designed for a wide screen. Localhost
is sufficient for development. A LAN or hosted deployment must use HTTPS and
send the required COOP/COEP headers; see the
[deployment guide](WebAssembly/DEPLOYMENT.md).

You also need a complete English Generals and Zero Hour copy. The launcher
supports two ownership paths:

1. **Installed digital copy:** choose the game root folder containing the
   Generals and Zero Hour data.
2. **Original media:** choose the complete Generals and Zero Hour disc, ISO,
   IMG, or MODE1/2352 BIN set. Multi-disc releases must be selected together.

The collection is currently sold through the official
[Steam bundle](https://store.steampowered.com/bundle/39394/Command_Conquer_The_Ultimate_Collection/)
and the [EA app](https://www.ea.com/games/command-and-conquer/command-and-conquer-the-ultimate-collection).
Existing original discs are also supported.

Selection and extraction happen locally. The launcher reads ISO 9660 and
MODE1/2352 images, extracts the required Cabinet members, validates the BIG
archives, and stores the installed runtime in OPFS. It does not upload or
redistribute the selected data. Details are in
[WebAssembly/ASSETS.md](WebAssembly/ASSETS.md).

## Architecture

The original source already separates portable game systems from platform
devices. The port keeps that boundary.

```text
GeneralsMD/Code/GameEngine
  simulation, AI, scripts, INI, UI, objects, weapons, netcode
                         |
                         v
GeneralsMD/Code/GameEngineDevice and Libraries
  DirectX 8, Win32, Miles, Bink, GameSpy platform boundaries
                         |
                         v
WebAssembly browser platform
  pthread worker + OffscreenCanvas
  D3D8 and SM1 shaders -> WebGL2
  Miles API -> Web Audio
  Win32 input/time/files -> DOM, Emscripten, OPFS
  UDP/LAN transport -> direct WebRTC data channels
  peer discovery -> encrypted negotiation over Nostr relays
```

The shipping play path runs the engine on an Emscripten pthread. Rendering uses
an `OffscreenCanvas`, so the browser main thread stays responsive while the
original engine performs synchronous work. User-owned archives are streamed to
OPFS. The worker opens synchronous access handles and presents the original
filesystem code with its expected blocking read interface, without copying the
whole game into the JavaScript heap.

The D3D8 bridge has two rendering tiers:

- **Enhanced**, the default, translates the shipped shader model 1.1 vertex and
  pixel shaders to GLSL ES.
- **Classic** emulates the fixed-function D3D8 pipeline with generated shaders.

The launcher and game share a same-origin browser desktop. The main browser
realm owns media selection, installation, settings, diagnostics, Web Audio,
multiplayer discovery, and lifecycle; the worker owns the original engine and
synchronous game state. Optional LLM commanders run in the browser against a
bounded semantic API. The optional `AgentBridge/` service connects a separate
authenticated controller over encrypted WebRTC. Neither path replaces engine
simulation or exposes hidden game information.

The Playwright harness drives the shipping launcher and runtime through
`window.CnCPort.rpc(...)` and verifies observable engine state together with
canvas screenshots.

## Repository layout

```text
Generals/             EA's original Generals source
GeneralsMD/           EA's original Zero Hour source, the primary target
AgentBridge/          optional authenticated remote-agent REST bridge
WebAssembly/
  CMakeLists.txt      Emscripten build graph
  shims/              Win32, DirectX, and compiler compatibility
  src/                browser platform and engine boundary code
  harness/            launcher, play page, RPC bridge, and browser tests
  tools/              build, archive extraction, and verification tools
.claude/skills/       repository workflows used by coding agents
PROJECT.md            architecture and product direction
AGENTS.md              current coding-agent policy
CLAUDE.md              symlink to AGENTS.md
CHANGELOG.md           release inventory linked to merged pull requests
archive/               frozen port-era TODO and completion history
```

Generated builds, browser profiles, screenshots, extracted archives, and retail
media are ignored.

## Build and run

The pinned toolchain is Emscripten 3.1.6. You also need Node.js, npm, CMake, and
Ninja. Asset extraction tools additionally use 7-Zip.

```sh
# Activate emsdk 3.1.6 first.
cd WebAssembly
npm install
npm run build:port:threaded:release
npm run serve:harness
```

Open:

```text
http://127.0.0.1:8080/harness/play.html
```

The local launcher will ask for the original installation folder or complete
media set. The first run can take several minutes while it validates and stores
roughly 2.1 GB of game archives.

Useful verification commands:

```sh
npm run build:port
npm run test:startup-vertical
npm run test:skirmish-start
npm run verify:threaded-play
```

`npm run build:port` is the normal iteration build. `npm run build:wasm`
rebuilds the large legacy smoke surface and is intended for broader regression
runs. Several asset-backed tests require ignored local retail data; a missing
asset fixture is not permission to commit it.

More detail is in [WebAssembly/README.md](WebAssembly/README.md).

## Automation and supervision

This port was developed mostly by coding agents under human direction. Agustin
Aguilar supplies local test media, performs hands-on playtests, chooses product
tradeoffs, and integrates releases. Agents inspect the original source,
implement changes, run browser harnesses, capture GPU evidence, review work, and
maintain the repository history.

Agent commits identify their exact provider and model. GitHub issue and
pull-request prose additionally uses stable commander-style codenames so
concurrent agents running the same model remain distinguishable. The historical
public-readiness snapshot, reproducible attribution method, and alias inventory
remain in [docs/public-readiness-audit.md](docs/public-readiness-audit.md).

## Contributing

Development architecture and build details are in [PROJECT.md](PROJECT.md) and
[WebAssembly/README.md](WebAssembly/README.md). The retired port-era checklists
remain available as frozen history under [`archive/`](archive/). Pull requests
and reproducible bug reports are welcome. Current features, bugs, and follow-ups
are tracked in [the NewShoes GitHub Issues](https://github.com/Agusx1211/NewShoes/issues).

## Source, assets, and license

The `Generals/` and `GeneralsMD/` trees come from Electronic Arts' official
source release. The repository is licensed under GPL v3 with EA's additional
GPL section 7 terms. Read [LICENSE.md](LICENSE.md), especially the trademark,
origin, modified-version, and full no-warranty terms. This modified software is
provided as-is, without warranty, to the fullest extent permitted by law.

The repository does not grant rights to Command & Conquer trademarks or retail
game data. Seven small `RequiredAssets` paths already present in EA's source
tree—four asset-format files and three auxiliary INI/TBL files—are part of that
upstream release and are duplicated between the Generals and Zero Hour trees.
Project launcher artwork is
documented under
[WebAssembly/harness/assets](WebAssembly/harness/assets/README.md). Original
BIG archives, maps, textures, models, music, speech, movies, disc images, and
installed game payloads must remain local and untracked.
