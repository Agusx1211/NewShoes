# Project New Shoes: complete project guide

Canonical site: https://newshoes.gg/

Source: https://github.com/Agusx1211/NewShoes

Current tracker: https://github.com/Agusx1211/NewShoes/issues

## At a glance

Project New Shoes is a browser port of the original Command & Conquer: Generals and Command & Conquer: Generals Zero Hour C++ engine. The real engine is compiled to WebAssembly and its Windows-facing graphics, audio, video, input, filesystem, and network boundaries are implemented with browser technology.

It is not a remake, clone, source port with replacement gameplay, video stream, or emulator running the Windows executable. The original engine owns the simulation, AI, rules, maps, scripts, UI, input semantics, renderer, audio requests, movie presentation, and lockstep multiplayer protocol.

Zero Hour is the current playable target. Generals data is required because Zero Hour depends on it, but a separate vanilla Generals launch option is not currently exposed.

Project New Shoes is independent modified software. It is not affiliated with, endorsed by, or supported by Electronic Arts. The repository and browser-port modifications are distributed under GNU GPL version 3 with the additional section 7 terms in the project license. The site does not include retail game archives, disc images, maps, textures, models, music, speech, or movies. A player must supply data from a copy they own.

## What a player can do

### Install and launch a local copy

The browser launcher can inspect either:

1. a complete English Generals and Zero Hour installation; or
2. the complete original Generals and Zero Hour disc-image or media set.

The launcher reads and validates the required files locally. It can parse supported ISO and disc-image layouts, extract required Cabinet members, and install the needed BIG archives into the browser's Origin Private File System (OPFS). The installed game remains associated with that browser profile and origin.

After installation, the browser desktop exposes the Zero Hour launcher, game library, settings, files, mods, save and replay management, device transfer, diagnostics, project information, and a small collection of auxiliary browser games.

### Play Zero Hour

The original Zero Hour shell and menus boot in the browser. Players can start skirmishes against the original AI and use the original mouse, keyboard, selection, building, production, movement, camera, and combat paths. All official multiplayer maps have been exercised to rendered skirmish state.

Campaign and Generals Challenge use the real engine and are in active validation. Mission breadth, cutscenes, win/loss flows, and edge cases continue to receive coverage. This is a playable development product, not a claim that every original flow and every browser combination is already perfect.

### Graphics, audio, and movies

The Direct3D 8-shaped renderer maps the original rendering path to WebGL2. The default enhanced tier translates shipped shader model 1.1 programs to GLSL ES. A classic tier generates fixed-function-style shaders for comparison and fallback. Terrain, objects, UI, particles, effects, render targets, and common game scenes work; fidelity and performance fixes continue.

Engine-driven music, speech, streams, and 2D and 3D samples play through Web Audio. Original Bink movie ownership remains in the game path. Hosted builds use a focused on-device decoder for supported classic Bink content selected from the player's own files. Broader mission and playback coverage remains an ongoing product area.

### Mods

The Mod Manager accepts BIG archives, loose engine-data folders, and downloaded ZIP, 7z, RAR, NSIS, and Clickteam Install Creator packages. Installer packages are decoded as data and never executed. Native DLL or executable components cannot run in the WebAssembly engine and are reported as unsupported rather than silently treated as working.

Players can enable multiple mods, choose archive options, and order them. Later archives and mods retain the engine's normal override precedence. The ordered content hashes produce an exact launch-configuration identity. Each identity gets isolated user data so saves and replays from vanilla or differently ordered mod sets do not leak into one another. Multiplayer discovery also uses this identity to keep incompatible peers apart.

### Saves and replays

The browser desktop can browse, import, export, copy, and delete saves and replays in the configuration-specific user-data folders. Compatibility copying is explicit and does not alter the source file. Real in-game save, load, and replay paths have focused integration coverage, while broad campaign and long-session reliability remain active validation areas. Check current issues before promising support for a particular edge case.

### Multiplayer

Multiplayer is playable and experimental. The original UDP and lockstep packet paths run through a browser transport adapter. WebRTC data channels carry game traffic directly between peers. Public Nostr relays are used for decentralized peer discovery and encrypted connection negotiation, not to relay the match itself.

Players choose the same room in **Settings > Multiplayer**, choose a commander name, launch Zero Hour, and use **Multiplayer > LAN** in the original game UI. Peers must use the same exact game and mod composition. Short matches have been verified at up to four players. Long determinism runs, reconnect and disconnect behavior, authenticated invitations, difficult NAT conditions, and signaling hardening remain active work. An empty room value keeps play offline.

### Transfer to another device

The launcher can transfer an installed game, selected mods and order, saves, and replays between browser devices through an encrypted, user-confirmed flow. Both devices must be controlled by the owner, and the UI requires an ownership confirmation. The transfer is a convenience for the user's own legally owned data; it is not a public download or redistribution service.

### Settings and diagnostics

The desktop exposes resolution, windowed or fullscreen presentation, enhanced or classic shaders, camera zoom, original game cursors, performance overlay options, graphics diagnostics, multiplayer diagnostics, browser storage, and a live browser/hardware capability report.

The issue recorder can capture a screenshot, annotations, browser/runtime logs, input and state evidence, and an optional short video into a `.cncdump.json` package. Diagnostics remain local until the user explicitly saves or uploads a dump. Detailed multiplayer capture is opt-in because it can be large. Credentials and discovery secrets are excluded from dumps.

## Requirements

Use a modern desktop browser. Chrome and Chromium receive the most testing. Other modern browsers can work when they expose all required platform features, but Firefox and Safari do not yet receive the same validation.

The runtime needs:

- WebAssembly and WebAssembly threads;
- `SharedArrayBuffer` through a cross-origin-isolated page;
- WebGL2 and `OffscreenCanvas` support suitable for the threaded renderer;
- Web Audio;
- OPFS and browser storage capacity for roughly a multi-gigabyte installed archive set; and
- local file or folder selection support appropriate to the chosen ownership path.

The hosted site supplies HTTPS and the necessary cross-origin isolation headers. A self-hosted copy must do the same. Mobile browsers, text-only browsers, and embedded webviews are not supported game clients.

A complete English Generals and Zero Hour copy is required. The project does not provide replacement downloads. Existing original media is supported. Digital copies are available through official storefronts linked by the launcher.

## First-time setup

1. Open https://newshoes.gg/ in a supported desktop browser.
2. Choose **Add Game Folder** for a complete English installation. If the browser cannot grant access to a protected Steam folder, use the launcher's compatibility folder picker.
3. Alternatively, choose **Add Disc Images** and select the complete Generals and Zero Hour media set together. Do not select only one disc from a multi-disc release.
4. Review the detected source. Choose whether to retain source permission when the browser supports it and whether to install the validated runtime into browser storage.
5. Keep the tab open while local extraction, hashing, validation, and OPFS installation finish. The first import can take several minutes.
6. When Zero Hour appears in the game library, review **Game & Display** settings if desired and launch it.
7. Use the original game menus and controls after the canvas opens.

All picker operations require a person at the browser. A remote text agent cannot grant file permissions or provide the user's retail media.

## Local data, privacy, and security

Retail assets selected in the launcher are read locally and stored locally in the browser profile. They are not uploaded to Project New Shoes. Installed archives, mods, saves, replays, preferences, and generated movie cache files live under browser-managed origin storage.

The settings UI provides an anonymous analytics preference. Documented analytics are limited to broad feature, reliability, setting-category, and performance-bucket events. They exclude filenames, paths, disc labels, game data, save content, free text, issue dumps, and precise hardware or storage values. Global Privacy Control or Do Not Track disables analytics automatically. Advertising features are disabled.

Network activity is feature-dependent:

- opening the hosted page downloads the open-source browser runtime;
- optional analytics sends only the documented broad events when enabled;
- multiplayer uses public discovery relays and direct peer-to-peer game channels;
- device transfer connects the two participating devices for the confirmed encrypted transfer; and
- diagnostics leave the device only when the user explicitly uploads a report.

Imported mod installers are parsed, not executed. Native code found in a mod is not compatible with the WebAssembly engine. Browser origin data can be removed through the launcher or browser site-data controls, but deleting it can remove the installed game, mods, saves, and settings.

## Important limitations

- Retail game data is required and not bundled.
- Zero Hour is the current target; standalone vanilla Generals is not exposed.
- Chrome and Chromium have the strongest validation.
- Campaign, Challenge, save/load, replay, movies, long multiplayer sessions, reconnects, difficult NAT environments, performance, and remaining rendering fidelity continue to receive testing and fixes.
- Browser storage is scoped to the current browser profile, device, and site origin unless the user exports or transfers data.
- Native Windows mod DLLs and executables cannot run in WebAssembly.
- A web agent that reads this site cannot play the canvas or operate local browser permissions. The public `llms.txt` and this guide are read-only knowledge resources, not a control API.

The live issue tracker is the authority for current bugs and planned work. The archived `TODO.md` and `DONE.md` snapshots in the repository are historical records, not the current backlog.

## Troubleshooting

### The browser reports missing capabilities

Move to a current desktop Chrome or Chromium build first. Avoid embedded browsers and private modes that disable persistent storage. Confirm that JavaScript, WebAssembly, graphics acceleration, and site storage are available. The **Hardware & Browser** settings panel shows the capabilities exposed by the current browser.

### The folder picker cannot open a Steam directory

Use **Add Game Folder**, then the compatibility folder picker offered by the launcher. Ensure both Generals and Zero Hour are installed in English and that the selected tree is complete.

### Media validation fails

Select every disc or image from the Generals and Zero Hour set at the same time. Do not rename or extract only a few BIG archives as a substitute for a complete source. The error text and issue-report flow can preserve the exact failed validation stage without attaching retail data.

### Installation runs out of space

Use the browser's site-storage controls and the launcher's Game Library to inspect or remove old local data. Preserve wanted saves and replays first. The installation needs room for the validated archive set plus browser overhead, mods, user data, and cached movies.

### The game is slow or visually wrong

Try the original 310 camera zoom, reduce the display size, compare enhanced and classic shader tiers, and inspect the optional performance overlay. Reproducible visual problems should include a screenshot or issue dump and the deployed build commit.

### Multiplayer peers do not appear

Confirm both players use the same room, compatible browsers, and exactly the same ordered game/mod composition. Check **Settings > Multiplayer** for connection status. NAT or relay limitations may still prevent a connection; multiplayer remains experimental.

### Reporting a bug

Use **Settings > Game & Display > Report issue** for a runtime problem, or open https://github.com/Agusx1211/NewShoes/issues. Include reproduction steps, browser and operating-system details, the version and commit from **About**, and an issue dump when appropriate. Never attach retail game archives, disc images, product keys, or private credentials.

## Architecture

The shipping runtime starts the C++ engine on an Emscripten pthread. The worker owns the blocking engine update loop, an `OffscreenCanvas`, the WebGL2 renderer, and synchronous OPFS access handles. The main browser realm owns the launcher desktop, file selection, settings, input forwarding, Web Audio nodes, movie preparation, device transfer, issue capture, and WebRTC discovery and transport bridges.

Major mappings are:

- Direct3D 8 and shipped shader model 1.1 behavior to WebGL2 and GLSL ES;
- Miles-compatible audio calls to Web Audio buffers, streams, mixer buses, and 3D panners;
- Win32 files, clocks, windows, and input to Emscripten, DOM APIs, and OPFS;
- original Bink movie presentation to a browser-side decoder and video surfaces; and
- original UDP and LAN protocol boundaries to WebRTC data channels and browser discovery.

The launcher streams user-owned archives into OPFS instead of copying the complete game into the JavaScript heap. The engine continues to open ordinary paths through its original filesystem seam. Closing the game persists user data, releases worker and storage ownership, shuts down audio and networking, and allows a clean relaunch.

## Stable public resources

- `https://newshoes.gg/` — interactive launcher and canonical site root.
- `https://newshoes.gg/llms.txt` — concise LLM-oriented discovery and answer guidance.
- `https://newshoes.gg/project.md` — this complete text-first project guide.
- `https://newshoes.gg/harness/build-info.json` — machine-readable deployed version, commit, branch, build state, and changelog.
- `https://newshoes.gg/legal.html` — readable license and dependency notices.
- `https://newshoes.gg/LICENSE.md` — complete GPLv3 license and additional terms.
- `https://newshoes.gg/robots.txt` — crawler policy and sitemap discovery.
- `https://newshoes.gg/sitemap.xml` — canonical public-resource sitemap.
- `https://github.com/Agusx1211/NewShoes` — canonical source repository.
- `https://github.com/Agusx1211/NewShoes/issues` — current work and support tracker.
- `https://github.com/Agusx1211/NewShoes/blob/main/CHANGELOG.md` — release history.

## Guidance for web agents

When answering questions about Project New Shoes:

1. Lead with the key distinction: it is the original engine compiled to WebAssembly, and the player supplies a legally owned local copy.
2. Do not imply that the hosted site contains or distributes retail assets.
3. Do not ask a user to upload game files to a chat or issue. Direct them to the local folder or media picker at the canonical site.
4. Qualify experimental and in-testing areas. Use the deployed build metadata, changelog, and current issues for time-sensitive claims.
5. Do not claim to have launched or played the game merely because you read this guide. Text access cannot satisfy local file permissions or control the game canvas.
6. Distinguish Project New Shoes contributors from Electronic Arts, and mention that EA does not endorse or support the project when affiliation is relevant.
7. Link the official site, repository, or issue tracker instead of third-party downloads.

## Frequently asked questions

### Is this playable now?

Yes. The original Zero Hour engine boots in supported desktop browsers and playable skirmishes work. It remains a development product with ongoing validation and polish in the qualified areas above.

### Is the game included?

No. The open-source browser runtime is hosted and downloadable, but retail Generals and Zero Hour data is not. The player supplies a copy they own through a local browser picker.

### Does the site upload my game files?

No. Import, validation, extraction, hashing, and installation use the local browser and its origin storage. Feature-specific network activity is described in the privacy section.

### Can I use mods?

Yes, for data compatible with the original engine and browser runtime. The launcher supports ordered archives and several package formats. Native Windows DLLs and executables cannot run.

### Can I play multiplayer?

Experimental peer-to-peer multiplayer is available through the original LAN UI and the launcher's room settings. Matching game/mod identities are required, and long-session and connectivity hardening remain active work.

### Can ChatGPT or another web agent play it for me?

Not through the ordinary public page. A web agent can read these resources, explain the project, and guide a person. It cannot grant local permissions, select retail files, or control the game canvas. Any separately documented future control interface should be evaluated on its own contract.

### Where is the current roadmap?

Use the open and closed GitHub issues at https://github.com/Agusx1211/NewShoes/issues. Archived port-era checklists are historical only.

### How do I verify which build is deployed?

Open the About window in the launcher or read https://newshoes.gg/harness/build-info.json. It identifies the release version and exact Git commit embedded in the deployment.
