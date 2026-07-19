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

- dominant trigger/squeeze: engine left/right click for selection, drag, menu
  activation, and contextual orders;
- dominant thumbstick: held original numpad camera rotate/zoom bindings;
- dominant A/X and B/Y: original attack-move and cancel hotkeys; dominant
  stick-click recenters the spatial anchor;
- offhand thumbstick: held original arrow-key camera pan, or a ten-sector
  original digit/control-group radial while stick-click is held;
- offhand trigger, squeeze, and A/X: held original Alt waypoint, Ctrl
  force-fire/group-assign, and Shift preferred-selection/group-add modifiers;
- offhand B/Y: recenter the spatial anchor.

The retail threaded VR smoke drives that path through the original main shell,
single-player and skirmish setup, loading transition, in-game quit modal, and
nested Options menu. It verifies original button activation and hover state,
then returns through the modal stack and resumes the match with the tracked
controller. This is automated compatibility evidence for the shared floating
surface and real `GameWindowManager` input path; it does not replace the
remaining real-headset readability, text-entry, scrolling, and full-flow
usability evidence.

When only one tracked controller is available, its stick pans normally. Holding
B/Y changes the stick to original camera rotate/zoom, stick-click selects one of
all ten control groups, auxiliary holds Ctrl, stick-click without a radial
direction holds Alt, and A/X holds Shift. Tapping A/X or B/Y still reaches
attack-move or cancel; pressing both recenters without firing either tap action.
Holding B/Y while choosing a radial group supplies the original Alt/view-group
modifier. These are controller layers only: no engine command is synthesized in
JavaScript. Configurable dominant hand, button indices, key bindings, and
press/release dead zones are accepted by the controls module for controller
profile and accessibility remapping. XR-standard missing buttons simply leave
their action inactive rather than inventing a success path. Short optional
haptic pulses acknowledge target clicks, orders, and control-group choices when
the active controller exposes a supported actuator.

The compositor renders one active tracked laser independently in each XR view
after world and panel composition. Magenta plus an endpoint identifies an exact
floating engine-UI intersection; amber identifies a battlefield ray without
inventing an unverified terrain endpoint. A pressed trigger changes the laser
and UI endpoint to a brighter confirmation color. This feedback is presentation
only: the associated click, hover, selection outline, and order marker remain
owned by the original engine input and rendering paths.

VR comfort preferences are normalized and persisted under a dedicated browser
profile key. The launcher exposes dominant hand, stick dead zone, perceived
world scale, floating-interface width/distance, and a seated height offset.
They are loaded only into the explicit VR renderer: world scale changes the
meters-to-engine-unit transform consistently for stereo rendering and picking,
while the height offset is reapplied whenever the viewer recenters. Normal
desktop renderer, camera, input, and display settings do not consume these
values.

The original `AudioManager` and Miles device continue to own the battlefield
microphone and positional-sound coordinates. Once the renderer has a real
engine view, each XR frame derives the viewer's head-relative offset and
orientation through the same spatial anchor, camera inverse, handedness change,
and perceived-world scale used by stereo rendering and picking. The Window
audio bridge composes that offset over the latest engine listener before
updating the existing Web Audio `AudioListener`; it does not move sound sources
or create a parallel mixer. Session entry clears stale XR listener state, and
session exit immediately reapplies the unmodified engine listener. The callback
is installed only on the explicit VR renderer path, so desktop audio continues
to consume the original Miles listener unchanged.

XR visibility is an input-ownership boundary. `visible-blurred` and `hidden`
immediately release every held controller button, modifier, camera key, pointer,
and native W3D ray. Returning to `visible` does not re-arm input until all
tracked buttons and sticks have first returned to neutral, so a trigger held
through a system overlay cannot become a surprise selection or order. Rendering
may continue at the cadence supplied by the XR runtime, and the session anchor
is preserved across this suspension.

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
- [x] Drive the retail main shell, skirmish setup, quit modal, nested Options
  surface, hover state, and match resume through a tracked controller ray.
- [x] Map the initial tracked controller scheme to the original input paths.
- [x] Apply head-tracked position/orientation to the engine-owned browser 3D
  audio listener with the same world scale and explicit session cleanup.
- Add remaining comfort, accessibility, spatial-audio device validation,
  lifecycle, performance, compatibility, and non-VR regression coverage.

## Evidence required before support claims

Automated mocks may verify lifecycle and serialization contracts, but cannot
prove graphical VR. Native stereo support requires a real secure browser session
on WebXR hardware, headset capture or per-eye pixel evidence, authoritative
runtime state showing distinct XR views and matrices, and input evidence through
the original engine paths. Public project content must not claim VR support
before those gates pass.
