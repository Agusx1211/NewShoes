# CLAUDE.md

@AGENTS.md

## One-line goal

Port the **actual** C&C Generals / Zero Hour C++ source (in `Generals/Code` and
`GeneralsMD/Code`) to WebAssembly so the **real game** runs in a browser — by
re-targeting its platform/device layer (DirectX/W3D, Miles audio, Bink, Win32,
GameSpy) onto browser APIs (WebGL/WebGPU, Web Audio, WebCodecs, DOM input,
WebSockets/WebRTC). Compile and port the original code; do not write a new or
"inspired" game. See `AGENTS.md` for details.
