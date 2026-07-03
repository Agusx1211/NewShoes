# assets/docs/ — Reference documentation & code index

Local library of reference repos, docs, and format specs for the wasm/browser
port. The library contents are **gitignored** (only this index and
`docsearch.py` are checked in) — never copy code from these into checked-in
files without checking its license; cherry-picks need attribution in the
commit message.

All repos are shallow clones (`--depth 1`); `git -C <dir> pull` refreshes one.
Entries marked *sparse* are partial checkouts (`git -C <dir> sparse-checkout
list` shows what's included; `... set <paths>` changes it).

**When you add anything to this directory, add an entry here.** When looking
for how the original engine/platform layer behaved, search this library before
reverse-engineering from scratch.

## Searching this library

Ranked full-text search (SQLite FTS5, BM25) across all of it:

```
python3 assets/docs/docsearch.py search "zwriteenable clear depth"
python3 assets/docs/docsearch.py search --cat graphics -n 5 lockrect
python3 assets/docs/docsearch.py build   # rebuild after adding/pulling repos
```

The `/docs-search` skill documents query syntax and which corpus answers which
kind of question. For exact strings/regex use `rg` on this directory directly.
The index is `.docsearch.db` here (gitignored); rebuild it after changing the
library.

---

## community-cnc/ — Generals/ZH source forks & engine reimplementations

Ports of the same GPL source we are porting. When our build hits a
compile/link/runtime problem, check how these solved it first — most
platform-layer problems (case sensitivity, VC6-isms, D3D8, Miles, Bink,
GameSpy) have already been solved by at least one of them.

- **GeneralsGameCode/** — [TheSuperHackers/GeneralsGameCode](https://github.com/TheSuperHackers/GeneralsGameCode).
  The main community upstream: original ZH source made buildable with modern
  toolchains (CMake, VC6-free), thousands of bug/UB fixes. **First place to
  look** for fixes to engine bugs, uninitialized memory, and portability
  issues; their fix may be cherry-pickable onto our tree.
- **Fighter19-CnC_Generals_Zero_Hour/** — [Fighter19's fork](https://github.com/Fighter19/CnC_Generals_Zero_Hour).
  Pioneering Linux/SDL port. Reference for replacing Win32 windowing/input
  and for GCC/Clang compilation fixes (closest to our Emscripten constraints).
- **feliwir-CnC_Generals_Zero_Hour/** — [feliwir's fork](https://github.com/feliwir/CnC_Generals_Zero_Hour).
  SDL3 + OpenGL work, local filesystem layer, CI tests. Good reference for
  the device-layer boundary (what they stubbed vs reimplemented).
- **GeneralsX/** — [fbraz3/GeneralsX](https://github.com/fbraz3/GeneralsX).
  Cross-platform (macOS/Linux) port with LAN rework. Another data point for
  platform-layer replacements and networking.
- **Thyme/** — [TheAssemblyArmada/Thyme](https://github.com/TheAssemblyArmada/Thyme).
  Pre-source-release clean-room reimplementation of the ZH engine in portable
  C++. Excellent for understanding *intended behavior* of engine subsystems
  (they documented semantics while reverse-engineering) and for portable
  replacements of Win32-isms.
- **OpenSAGE/** — [OpenSAGE/OpenSAGE](https://github.com/OpenSAGE/OpenSAGE).
  C# reimplementation of the SAGE engine on modern graphics APIs (Veldrid).
  **Best reference for file formats** (BIG, W3D, map, WND, CSF, DDS/TGA, INI
  quirks) and for how W3D rendering maps onto a modern shader pipeline —
  conceptually the same translation we do in the D3D8→WebGL2 shim.

## superhackers/ — TheSuperHackers docs, tools, and SDK stubs

- **GeneralsDocuments/** — [repo](https://github.com/TheSuperHackers/GeneralsDocuments).
  **The documentation trove.** `documents/` has per-format subdirs: `big/`
  (BIG archives), `csf/` (string files), `ini/` (INI field order generated
  from code, fxlist, modulelist, particle systems, map.md), `w3d/` (3dsmax
  pipeline docs), `wnd/` (GUI window format), `dds/`, `audio/`, `loca/`,
  `worldbuilder/`, plus a 2022 source-status writeup.
- **GeneralsWiki/** — [repo](https://github.com/TheSuperHackers/GeneralsWiki).
  Wiki source: `SourceCode/` (build guides, tool docs, dependencies) and
  `Asset/` (art/audio/GUI/map/localization pipelines). Use for "how does the
  game data pipeline work" questions.
- **min-dx8-sdk/** — [repo](https://github.com/TheSuperHackers/min-dx8-sdk).
  Minimal DirectX 8 SDK headers/libs needed to build the game. Cross-check
  against our `WebAssembly/shims/` D3D8 headers when a declaration is
  missing/wrong.
- **miles-sdk-stub/** — [repo](https://github.com/TheSuperHackers/miles-sdk-stub).
  Buildable stub of the Miles Sound System SDK (`mss.h` surface). Reference
  for the exact Miles API surface our Web Audio backend must satisfy.
- **bink-sdk-stub/** — [repo](https://github.com/TheSuperHackers/bink-sdk-stub).
  Same for the Bink SDK (`bink.h`) — the API surface behind our WebCodecs
  video shim.
- **GamespySDK/** — [repo](https://github.com/TheSuperHackers/GamespySDK).
  Standalone (cleaner) copy of the GameSpy SDK the game links. Reference for
  the networking surface to re-target onto WebSockets/WebRTC.
- **GeneralsOnlineServices/** — [repo](https://github.com/TheSuperHackers/GeneralsOnlineServices).
  Modern RESTful replacement for GameSpy's backend services. Reference
  architecture for what a browser-friendly online service could talk to.
- **GeneralsBigCreator/** — [repo](https://github.com/TheSuperHackers/GeneralsBigCreator).
  Small BIG-archive packer — compact reference for the BIG format
  (alongside our own `WebAssembly/tools/` extraction code).
- **GeneralsTools/** — [repo](https://github.com/TheSuperHackers/GeneralsTools).
  Tool collection: WorldBuilder, WNDEdit, ParticleEditor, crunch (DDS),
  modbuilder. Mostly binaries — use when you need to author/edit game data
  (e.g. craft a test map or WND file). Heavy (~675M).
- **GameMath/** — [repo](https://github.com/TheSuperHackers/GameMath).
  Portable replacement for the game's math routines with bit-exact goals.
  Relevant to cross-platform/wasm float determinism (replays, multiplayer
  sync).
- **GeneralsReplays/** — [repo](https://github.com/TheSuperHackers/GeneralsReplays).
  Corpus of real `.rep` game replays. Future test asset: replay playback is
  the standard way to prove sim determinism (a wasm build that plays a
  replay to the same outcome as retail has a correct simulation).

## ea-official/ — other EA GPL source releases

- **CnC_Renegade/** — [repo](https://github.com/electronicarts/CnC_Renegade).
  Renegade source: the other shipped W3D game. `Code/ww3d2/` is a **later
  revision of the same W3D renderer** we port (good second opinion on what a
  W3D API is supposed to do); `Code/WWAudio/` is a full Miles integration
  layer; `Code/BinkMovie/` a Bink integration; plus WWMath, wolapi
  (Westwood Online). Use when Generals' own W3D/Miles/Bink code is unclear.
- **CnC_Modding_Support/** — [repo](https://github.com/electronicarts/CnC_Modding_Support)
  (*sparse: `Generals`, `Zero Hour`, `Renegade` only*).
  Official mod-support drop: for Generals/ZH it has **map source files** and
  **`Shaders/` source** (the D3D8-era shader sources — useful when deciding
  what our WebGL2 shaders must reproduce).

## graphics/ — D3D8 semantics references

Three independent, battle-tested implementations of the exact API our
`WebAssembly/src/wasm_d3d8_shim.*` re-implements. When a D3D8 call's
semantics are in doubt (default states, edge cases, undocumented behavior,
fixed-function details), check how these implement it.

- **d3d8to9/** — [crosire/d3d8to9](https://github.com/crosire/d3d8to9).
  Tiny D3D8→D3D9 proxy. The **quickest map of the whole D3D8 interface
  surface** and its 8-vs-9 differences; easiest of the three to read.
- **dxvk/** — [doitsujin/dxvk](https://github.com/doitsujin/dxvk).
  `src/d3d8/` implements D3D8 on top of its D3D9-on-Vulkan; production
  quality. Good for precise state-block/caps/lock behavior.
- **wine/** — [WineHQ wine](https://gitlab.winehq.org/wine/wine)
  (*sparse: `dlls/d3d8`, `dlls/wined3d`, `dlls/d3dx8`, `include`*).
  `dlls/wined3d` translates D3D→GL — **the closest existing analogue to our
  D3D8→WebGL2 shim**, including fixed-function pipeline emulation on
  shaders. `dlls/d3d8` shows the API-level wrapping (and `dlls/d3d8/tests/`
  documents observed-behavior edge cases), `dlls/d3dx8` the D3DX
  math/texture helpers.
- **dx8-sdk-docs/** — the **official Microsoft DirectX 8.1 SDK C/C++
  documentation**, decompiled from `directx8_c.chm` (also included) into
  browsable HTML at `directx_cpp/` (from the
  [archive.org dx81sdk_full image](https://archive.org/details/dx81sdk_full)).
  `directx_cpp/Graphics/` covers D3D8: every interface/method/state, the
  fixed-function pipeline, texture stage states, caps. This is the *spec*
  the game code was written against — the authoritative answer to "what is
  this D3D8 call supposed to do", with wine/dxvk as the implementation
  reality-check. Grep the `.htm` files; formatting is readable as text.
- **swiftshader/** — [google/swiftshader](https://github.com/google/swiftshader)
  (*sparse: `src`, `docs`, `include`*). Source of the software rasterizer
  behind headless Chromium's WebGL2 on the dev box — i.e. **the renderer our
  CI screenshots actually run on**. Consult when SwiftShader behaves
  differently from the spec or from the Mac's real GPU.
- **angle/** — [google/angle](https://github.com/google/angle).
  Chrome's WebGL2 implementation (GL ES → D3D/Vulkan/Metal). Every WebGL2
  call our shim makes goes through this — reference for validation rules,
  driver workarounds, and the Metal backend the M4 verification Mac uses
  (`src/libANGLE/renderer/metal/`).

## formats/ — file-format references

- **OpenSAGE.BlenderPlugin/** — [repo](https://github.com/OpenSAGE/OpenSAGE.BlenderPlugin).
  W3D/W3X import/export in readable Python — effectively an **executable
  W3D format spec** (chunk IDs, mesh/skeleton/animation layouts,
  compression variants).
- **opensage-blog/** — [OpenSAGE blog source](https://github.com/OpenSAGE/opensage.github.io).
  `posts/` contains deep-dive articles on SAGE internals (W3D rendering,
  map format, APT, water, particles, INI). Read the markdown in `posts/`
  directly.

## networking/ — GameSpy replacement references

- **openspy-core/** — [openspy/openspy-core](https://github.com/openspy/openspy-core).
  Server-side reimplementation of the GameSpy protocols (QR1/QR2 heartbeat,
  peerchat, search/browse, NAT nego). The **protocol documentation in code
  form** for whatever the browser build's WebSocket networking bridge must
  speak or emulate.

## video/ — Bink playback references

- **ffmpeg-bink/** — [FFmpeg](https://github.com/FFmpeg/FFmpeg)
  (*sparse: `libavcodec`, `libavformat`*). The open-source Bink decoders:
  `libavcodec/bink.c` (video), `binkaudio.c`, `binkdsp.c`, and
  `libavformat/bink.c` (container demuxer). Reference if we ever decode
  .bik in-browser instead of pre-transcoding to WebCodecs-friendly formats.

## web-platform/ — browser target API specs & docs

The other side of the port: authoritative references for the browser APIs the
platform layer is re-targeted onto. Use these to answer "what does the browser
actually guarantee" instead of guessing from memory.

- **khronos-webgl/** — [KhronosGroup/WebGL](https://github.com/KhronosGroup/WebGL).
  The official WebGL repo: `specs/latest/2.0/` is the WebGL2 spec (the
  D3D8 shim's target API), and `sdk/tests/conformance*/` is the **WebGL
  conformance suite** — thousands of small self-contained tests that double
  as executable documentation of correct GL behavior (blending, depth,
  texture formats, state edge cases). When SwiftShader and a real driver
  disagree, find the matching conformance test.
- **webgl2-fundamentals/** — [gfxfundamentals/webgl2-fundamentals](https://github.com/gfxfundamentals/webgl2-fundamentals).
  The practical WebGL2 tutorial site (`webgl/lessons/*.md`). Best for
  "how is this normally done in WebGL2" questions (state, textures, FBOs,
  perf patterns) when the spec is too dry.
- **gpuweb/** — [gpuweb/gpuweb](https://github.com/gpuweb/gpuweb).
  The WebGPU + WGSL spec sources. Relevant only for a future WebGPU
  backend; the current shim targets WebGL2.
- **web-audio-api/** — [WebAudio/web-audio-api](https://github.com/WebAudio/web-audio-api).
  Web Audio API spec source (`index.bs`) — the target for the Miles audio
  replacement (graph semantics, AudioWorklet, timing/latency guarantees).
- **webcodecs/** — [w3c/webcodecs](https://github.com/w3c/webcodecs).
  WebCodecs spec — the target for Bink video replacement (decoder
  configuration, frame lifecycle, codec registry in `*_codec_registration`
  files).
- **wasm-spec/** — [WebAssembly/spec](https://github.com/WebAssembly/spec).
  The core WebAssembly spec (+ JS API / Web API documents in `document/`).
  For questions about wasm semantics: traps, memory growth, float
  determinism (NaN bit patterns matter for lockstep sync).
- **mdn-content/** — [mdn/content](https://github.com/mdn/content)
  (*sparse: `files/en-us/web/api`, `files/en-us/webassembly`,
  `files/en-us/games`*). All of MDN's Web API reference as markdown —
  every DOM/WebGL2/WebAudio/WebCodecs/Pointer-events/Gamepad/WebSocket API
  page, plus the WebAssembly guide and MDN's game-porting articles. The
  fastest offline lookup for "what are this API's arguments, quirks, and
  browser support notes".

Emscripten reference is **not** cloned here on purpose: the version-matched
(3.1.6) source and docs are already installed at `/usr/share/emscripten/`
— notably `src/library_*.js` (the JS runtime library: `library_webgl.js`,
`library_html5.js`, …), `docs/`, and `system/include/emscripten/`. Read
those before consulting online Emscripten docs, which describe newer
versions.

## specs/ — standalone format/API specs

- **bink-format.txt** — Mike Melanson's Bink container description.
- **bink-container-multimediawiki.txt** / **bink-video-codec-multimediawiki.txt**
  / **bink-audio-codec-multimediawiki.txt** — MultimediaWiki raw pages on the
  Bink container and codecs.
- **opengl-es-3.0-spec.pdf** — OpenGL ES 3.0 specification: WebGL2 is defined
  as deltas against this, so GL semantics questions usually bottom out here.
- **glsl-es-3.00-spec.pdf** — GLSL ES 3.00 shading-language spec (the language
  the D3D8 fixed-function/shader translation emits).

---

## Not mirrored here (know where they live)

- **DirectX 8 SDK headers/docs** — already vendored in-repo at
  `GeneralsMD/Code/Libraries/DX90SDK` (and see `superhackers/min-dx8-sdk`).
- **GameSpy SDK as the game uses it** — vendored at
  `GeneralsMD/Code/Libraries/Source/GameSpy` (cleaner copy in
  `superhackers/GamespySDK`).
- **EA upstream Generals/ZH source** — this repo *is* that release
  ([electronicarts/CnC_Generals_Zero_Hour](https://github.com/electronicarts/CnC_Generals_Zero_Hour)).
- **Emscripten 3.1.6 source/docs** — installed at `/usr/share/emscripten/`
  (see the note in the web-platform section above).
