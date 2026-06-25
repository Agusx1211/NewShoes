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
