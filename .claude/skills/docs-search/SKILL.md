---
name: docs-search
description: Search the local reference-doc library in assets/docs (community ports, D3D8/W3D/format specs, browser API docs). Use when a question is about original-engine behavior, D3D8 semantics, file formats (BIG/W3D/WND/CSF/INI), Miles/Bink/GameSpy APIs, or WebGL2/Web Audio/WebCodecs/wasm guarantees — before reverse-engineering from scratch or searching the web.
---

# Searching the reference-doc library

`assets/docs/` holds ~25 reference repos and specs for the port (gitignored,
local-only). `assets/docs/INDEX.md` describes every resource — read the
relevant section of it first to pick the right corpus.

## Ranked search (BM25, whole library)

```
python3 assets/docs/docsearch.py search "<terms>"            # top 10
python3 assets/docs/docsearch.py search --cat graphics -n 5 "<terms>"
python3 assets/docs/docsearch.py search '"exact phrase"'
```

- Categories for `--cat`: `community-cnc`, `superhackers`, `ea-official`,
  `graphics`, `formats`, `networking`, `video`, `web-platform`, `specs`.
- Identifiers are split on `_`: searching `zwriteenable` matches
  `D3DRS_ZWRITEENABLE`. FTS5 syntax works: `AND`, `OR`, `NOT`, `NEAR(a b, 5)`.
- If the index is missing or stale (new repos added / pulled), rebuild:
  `python3 assets/docs/docsearch.py build` (a few minutes).

## When to use what

- **What is this D3D8 call supposed to do?** → `--cat graphics`; the official
  SDK docs are `graphics/dx8-sdk-docs/directx_cpp/` (HTML), implementations
  to cross-check are `wine/dlls/wined3d`, `dxvk/src/d3d8`, `d3d8to9`.
- **Why does CI (SwiftShader) render differently than spec/Mac?** →
  `graphics/swiftshader/src`, `graphics/angle/src`, and the WebGL conformance
  tests `web-platform/khronos-webgl/sdk/tests/`.
- **How did other ports fix this engine/compile problem?** →
  `--cat community-cnc` (GeneralsGameCode first, then Fighter19/feliwir/
  GeneralsX for platform-layer, Thyme for intended semantics).
- **File formats (BIG/W3D/WND/CSF/INI/map)?** →
  `superhackers/GeneralsDocuments/documents/`, `formats/` (BlenderPlugin =
  executable W3D spec), OpenSAGE loaders in `community-cnc/OpenSAGE`.
- **Miles / Bink / GameSpy API surface?** → `superhackers/*-sdk-stub`,
  `ea-official/CnC_Renegade/Code/{WWAudio,BinkMovie}`, `networking/openspy-core`,
  `video/ffmpeg-bink`, `specs/bink-*.txt`.
- **Browser API guarantees (WebGL2/Web Audio/WebCodecs/wasm)?** →
  `--cat web-platform`; MDN pages are `web-platform/mdn-content/files/en-us/`.
- **Emscripten behavior** → not in the library; version-matched source/docs
  are at `/usr/share/emscripten/` (notably `src/library_webgl.js`).

## Fallbacks

- Exact strings / regex / case-sensitive: `rg` directly on `assets/docs/`
  (add `-g '!*.git'`; HTML docs grep fine as text).
- The two PDF specs (`specs/*.pdf`, GL ES 3.0 + GLSL ES 3.00) are not in the
  index; Read them directly by page.
- Never copy code from the library into checked-in files without checking
  its license; cherry-picks need attribution in the commit message.
