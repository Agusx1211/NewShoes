# WebXR VR architecture

## Product boundary

VR is a native immersive presentation mode for the original Zero Hour engine.
The battlefield must be rendered from the real scene once for every WebXR view,
with the headset pose and WebXR projection for that view. Original UI behavior
must remain engine-owned while its presentation becomes spatial. Copying the
desktop framebuffer onto a virtual quad is not a VR implementation.

Desktop play remains the default. When VR is not selected, the current pthread,
OffscreenCanvas, D3D8-to-WebGL2 executor, frame pacing, input, and UI paths must
remain unchanged and must not pay for XR imports, probes, command recording, or
cross-realm graphics traffic.

## Browser ownership constraint

The shipping runtime currently creates the WebGL2 context inside the engine
pthread worker on an OffscreenCanvas transferred from the page. The WebXR Device
API exposes XRSystem, XRSession, XRFrame, and XRWebGLLayer to Window, not worker
realms. XRWebGLLayer also needs the exact WebGL context whose commands produce
the compositor images; a WebGL context cannot be transferred between realms.

An OffscreenCanvas can back an XR-compatible context when the context is created
and retained in the Window realm. That does not make an already transferred,
worker-owned context visible to XRWebGLLayer. Worker-side WebXR remains an open
future item in the Immersive Web specification project.

Therefore a VR launch cannot keep the shipping graphics executor in the engine
worker. It also cannot use a copied worker framebuffer, because that would be a
flat virtual monitor and would lose per-view geometry, depth, late headset pose,
and compositor timing.

## Chosen direction

VR launches will keep simulation, original UI logic, synchronous OPFS, and the
blocking engine loop in the pthread worker. Graphics presentation moves across
an explicit boundary:

1. The Window owns the immersive XRSession, XR-compatible WebGL2 context,
   XRWebGLLayer, reference space, XR animation loop, and tracked input sources.
2. The engine worker records the real D3D8-shaped resource and draw stream rather
   than executing WebGL calls locally.
3. A bounded shared command transport delivers complete engine frames and
   resource mutations to a main-realm D3D8 executor. Synchronous D3D return
   semantics and mutable wasm-memory ranges require explicit acknowledgements
   and owned copies; fire-and-forget pointer forwarding is invalid.
4. During each XR animation frame, the main executor replays the world portion
   for every XRView into the compositor framebuffer. The engine camera seam
   supplies world anchoring while the XR view and projection matrices supply the
   tracked eye transforms. WebXR projection matrices are used as provided.
5. Original UI draw ownership is separated at an engine render boundary and
   replayed onto spatial surfaces. Controller rays resolve both UI hits and
   battlefield hits, then route actions through original GameWindowManager,
   input, selection, and deterministic command paths.
6. Ending the session drains or rejects outstanding graphics work, releases the
   main-realm executor, and shuts down or relaunches the one-shot runtime safely.

The current vertical slice implements that boundary behind an explicit `?vr=1`
launch. `harness/webxr-runtime.mjs` owns the real Window XR lifecycle;
`webxr-d3d8-command-stream.mjs` records owned, bounded engine frames with shared
acknowledgement; and `webxr-d3d8-renderer.mjs` replays world geometry once per
XR view. Fixed-function matrices receive the tracked eye transform directly.
Translated D3D8 vertex shaders receive a general engine-clip-to-eye-clip
transform, which keeps real tree, water, and other programmable world draws in
the same stereo camera instead of leaving them at the desktop projection.

Pretransformed engine draws are rendered once into a transparent texture and
composited as a head-anchored floating panel. `webxr-controls.mjs` intersects
tracked controller rays with that panel and sends its actions through the same
ordered Win32/DirectInput bridge as desktop input:

- trigger: engine left click / selection;
- squeeze: engine right click / contextual order;
- left thumbstick: held engine arrow keys for camera pan;
- right thumbstick: engine mouse wheel for zoom;
- A/X: engine Escape press;
- B/Y: recenter the spatial anchor.

Every tracked pointer also carries a ray transformed from the WebXR reference
space through the initial spatial anchor and the latest real engine view into
W3D world coordinates. `W3DView` uses that ray only for input-owned object and
terrain casts. Opaque engine windows still consume their original client-space
input first; transparent panel locations fall through to the original scene
picker, selection translator, and deterministic command translator. Losing the
tracked target or ending the session clears the native override, while camera
constraints and ordinary desktop picking continue to use the camera-generated
screen ray.

The Settings entry is a two-step gesture-safe flow: prepare the opt-in render
lane, check the headset, then request the immersive session synchronously from
“Enter & launch VR” before game startup awaits can consume user activation.
None of these modules, probes, transports, or alternate canvas ownership paths
run during ordinary desktop play.

## Required milestones

- [x] Add an explicit VR pre-launch selection and preserve transient user
  activation for XRSession.requestSession.
- [x] Add D3D frame boundaries and a bounded worker-to-Window graphics command
  protocol, with resource lifetime and backpressure tests.
- [x] Run the existing executor against the main-realm context and reproduce a
  normal real engine frame without worker GL ownership.
- [ ] Prove distinct left/right world rendering on real WebXR hardware.
- [x] Split pretransformed engine UI presentation into a floating spatial
  surface without replacing original UI ownership.
- [x] Map the initial tracked controller scheme to the original input paths.
- Add comfort, accessibility, spatial audio/listener, haptics, lifecycle,
  performance, compatibility, and non-VR regression coverage.

## Evidence required before support claims

Automated mocks may verify lifecycle and serialization contracts, but cannot
prove graphical VR. Native stereo support requires a real secure browser session
on WebXR hardware, headset capture or per-eye pixel evidence, authoritative
runtime state showing distinct XR views and matrices, and input evidence through
the original engine paths. Public project content must not claim VR support
before those gates pass.
