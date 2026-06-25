# CLAUDE.md

@AGENTS.md

## One-line goal

Port the **actual** C&C Generals / Zero Hour C++ source (in `Generals/Code` and
`GeneralsMD/Code`) to WebAssembly so the **real game** runs in a browser — by
re-targeting its platform/device layer (DirectX/W3D, Miles audio, Bink, Win32,
GameSpy) onto browser APIs (WebGL/WebGPU, Web Audio, WebCodecs, DOM input,
WebSockets/WebRTC). Compile and port the original code; do not write a new or
"inspired" game. See `AGENTS.md` for details.

## Rule of thumb

If code already exists in the original source, **reuse it** (compile/port it).
Only write new machinery when something genuinely cannot work in the browser
without it — i.e. a platform/device dependency that must be re-targeted to a
browser API. Don't re-implement engine or data logic that already exists and is
platform-independent (e.g. the INI parsing in `GameEngine/Source/Common/INI/`).

## Don't work blind

A wasm/browser build is graphical — you can't see it. Always keep a scriptable
harness (headless browser + a command/RPC control surface) that can boot the
build, click UI, select/move units, start and step a match, query state, and
**capture screenshots**. Treat any change as unverified until the harness boots
it and a screenshot or state check proves it works. See `AGENTS.md`.
