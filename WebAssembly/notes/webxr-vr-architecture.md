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
6. Ending the session drains outstanding graphics ownership back through the
   ordinary main-realm executor and leaves the live engine ready for a fresh,
   user-initiated immersive session.

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
- dominant thumbstick: original numpad camera rotate/zoom bindings; rotation can
  continuously hold the key or issue one bounded key hold per neutral-rearmed
  stick deflection; holding stick-click changes the vertical axis to the
  original mouse-wheel path for engine-owned scrolling/zoom, while a neutral
  stick-click recenters;
- dominant A/X and B/Y: original attack-move and cancel hotkeys;
- offhand thumbstick: held original arrow-key camera pan, or a ten-sector
  original digit/control-group radial while stick-click is held;
- offhand trigger, squeeze, and A/X: held original Alt waypoint, Ctrl
  force-fire/group-assign, and Shift preferred-selection/group-add modifiers;
- offhand B/Y: recenter the spatial anchor.

The retail threaded VR smoke drives that path through the original main shell,
Multiplayer and Network menus, LAN lobby and host options, single-player and
skirmish setup, loading transition, in-game quit modal, save/load and
save-description popups, and nested Options menu. It verifies
original button activation and hover state, focuses and types into the stock
save-description field through the XR system keyboard, cancels without writing
a save, then returns through the modal stack and resumes the match with the
tracked controller. This is automated compatibility evidence for the shared
floating surface and real `GameWindowManager` input path; it does not replace
real-headset readability and full-flow usability evidence, and the LAN menu
coverage does not constitute a two-peer multiplayer match.

The same gate then confirms an ephemeral save through that description dialog,
resumes and advances the simulation, selects the saved row through the tracked
ray, and accepts the original in-game load confirmation. The simulation frame
rewinds to the saved range while the existing `XRSession` remains active, both
views and native picking resume over the restored match, and the temporary save
is removed through the stock Delete confirmation before the test exits.
After that reset, tracked hover over the live ControlBar produces the original
popup-description text, and the controller opens and exits the stock Generals
experience surface while retaining the restored HUD and match.

The gate then activates the stock Idle Worker control, confirms that the
original selection contains a locally controlled unit, and follows the live
ControlBar command set rather than assuming a faction. It hovers an available
Attack Move or dozer-construction command until the original popup description
changes, then activates and observes the corresponding engine command mode. A
construction path descends through the real category button, enters a concrete
faction-specific power-plant placement mode, and uses controller squeeze as a
short original right click to clear `pendingPlaceType`; an Attack Move path uses
the mapped cancel key. The assertion also proves cancellation does not open the
pause menu. One Retail run selected `Nuke_ChinaVehicleDozer`, exposed
`Nuke_ChinaPowerPlant` with the localized “Advanced Nuclear Reactor” tooltip,
and recorded `rightClickIsClick == 1` in the original command translator.

After cancelling the command-card mode, the gate selects an idle worker again,
chooses a clear battlefield point, and sends controller squeeze through the
secondary-mouse bridge. The original translator must report an accepted short
right click, dispatch `MSG_DO_MOVETO` with a real selection group,
and then expose motion, pathfinding, or a changed world position for that same
object. One Retail run selected `Chem_GLAInfantryWorker`, dispatched the move,
and observed `aiMoving == true` plus 1.10 world units of movement.

After ending and entering a fresh immersive session over that live match, the
gate uses the mapped cancel control to open the pause menu and the tracked ray
to accept Exit and its original confirmation. It requires the match to clear,
operates the stock skirmish score screen and the preserved shell stack, returns
to the default main menu, and hovers its Single Player control while the same
second `XRSession` continues producing compositor frames. This covers the
single-player end-game surfaces and match-to-shell lifecycle; it does not prove
a network result screen or real-headset readability.

A separate two-client Retail gate opts only the host into the native WebXR
render lane while leaving the guest on the ordinary desktop path. Both clients
use the original LAN lobby, `Network`, and playable lockstep simulation over the
shipping WebRTC bridge. Once the shared match is active, the host must continue
rendering two XR views with a test-side 64 mm eye separation and native picking,
select its actual worker/dozer from the stock HUD, and dispatch `MSG_DO_MOVETO`
through a between-frame controller squeeze. The gate then requires both engines
to retain equal object counts, no CRC mismatch, the established threaded
frame-skew bound, and the complete peer mesh. One run retained 223 objects per
peer, moved `GLAInfantryWorker`, and converged to seven frames of skew. This is
real two-peer engine/network evidence with an emulated compositor; real-headset
multiplayer usability remains open.

When only one tracked controller is available, its stick pans normally. Holding
B/Y changes horizontal stick movement to original camera rotation and vertical
movement to the original mouse-wheel path, which lets engine windows scroll and
the battlefield camera zoom according to the original window under the pointer.
Stick-click selects one of all ten control groups, auxiliary holds Ctrl,
stick-click without a radial direction holds Alt, and A/X holds Shift. Tapping
A/X or B/Y still reaches attack-move or cancel; pressing both recenters without
firing either tap action. Holding B/Y while choosing a radial group supplies the
original Alt/view-group modifier. These are controller layers only: no engine
command is synthesized in JavaScript. Configurable dominant hand, button
indices, key bindings, and press/release dead zones are accepted by the controls
module for controller profile and accessibility remapping. XR-standard missing
buttons simply leave their action inactive rather than inventing a success
path. Short optional haptic pulses acknowledge target clicks, orders, and
control-group choices when the active controller exposes a supported actuator.

The runtime supplements per-frame gamepad sampling with the standard WebXR
`selectstart`/`selectend` and `squeezestart`/`squeezeend` events. A bounded event
queue preserves short clicks and ordered offhand modifier chords that begin and
end between compositor frames, then reconciles those edges with the sampled
button state without duplicating actions. Visibility changes clear queued edges,
neutral re-arming suppresses the first resumed batch, and session teardown
removes all four listeners.

The compositor renders one active tracked laser independently in each XR view
after world and panel composition. Magenta plus an endpoint identifies an exact
floating engine-UI intersection; amber identifies a battlefield ray without
inventing an unverified terrain endpoint. A pressed trigger changes the laser
and UI endpoint to a brighter confirmation color. This feedback is presentation
only: the associated click, hover, selection outline, and order marker remain
owned by the original engine input and rendering paths.

VR comfort preferences are normalized and persisted under a dedicated browser
profile key. The launcher exposes dominant hand, continuous or stepped turn
mode, a motion-vignette toggle, stick dead zone, perceived world scale,
floating-interface width/distance, and a seated height offset. They are loaded
only into the explicit VR renderer: world scale changes the
meters-to-engine-unit transform consistently for stereo rendering and picking,
while the height offset is reapplied whenever the viewer recenters. Pan
sensitivity remains owned by Zero Hour's existing Scroll Speed preference
because controller pan uses the same original Arrow-key command path.

Stepped turning does not write camera state from JavaScript. It holds the
original numpad rotate key for a bounded 320 ms interval, releases it, and will
not issue another turn until the stick returns below the release threshold.
The compositor derives active turn, pan, and world-zoom state from those routed
inputs. When enabled, it draws a peripheral black vignette independently into
every XR view after world, floating UI, and pointer composition; scrolling the
floating UI does not activate it. The real-WebGL smoke asserts darker peripheral
pixels in both eyes while preserving the center, and the retail smoke proves a
vignetted stepped interval changes the authoritative engine camera angle, stops
while held, and rearms after neutral. Normal desktop rendering and input do not
consume these values or compile the vignette program.

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

When an immersive session reports `isSystemKeyboardSupported`, releasing the
tracked primary button over an engine-published text-entry rectangle focuses the
existing browser-native text proxy. Browser `beforeinput` and composition events
continue through the existing Win32/IME bridge into the original engine gadget;
the VR path does not maintain a second text value or submit a parallel UI form.
The proxy is available without exposing the touch toolbar, and its Done action
retains the established touch behavior. A user agent that presents its system
keyboard changes the XR session to `visible-blurred`, which is handled by the
input suspension and neutral re-arm boundary below. Sessions that do not report
the capability retain physical-keyboard input without opening the proxy, and
desktop/touch activation remains unchanged. The retail threaded smoke proves
tracked focus and mutation of the original skirmish player-name field with an
emulated supported session; system-keyboard presentation still needs real
headset evidence.

XR visibility is an input-ownership boundary. `visible-blurred` and `hidden`
immediately release every held controller button, modifier, camera key, pointer,
and native W3D ray. Returning to `visible` does not re-arm input until all
tracked buttons and sticks have first returned to neutral, so a trigger held
through a system overlay cannot become a surprise selection or order. Rendering
may continue at the cadence supplied by the XR runtime, and the session anchor
is preserved across this suspension.

An XR session ending is also a graphics-ownership boundary. If the engine has a
complete D3D8 packet waiting for the compositor, the renderer restores the
ordinary Window framebuffer, replays that owned packet through the normal
executor, and acknowledges it as part of becoming inactive. The acknowledgement
remains bounded at 30 seconds so a slow browser GPU/framebuffer transition does
not turn an otherwise successful drain into the recorder's sticky failure state.
Frames submitted while no immersive session is active continue through the same
Window executor. A later user gesture can therefore acquire a fresh `XRSession`
against the existing engine and resources; session start resets the spatial
anchor, controller state, native ray, and XR listener overlay before new stereo
frames resume. The retail threaded smoke proves two distinct emulated sessions,
continued native picking and spatial audio, preservation of the running match,
and clean ownership restoration after both exits. Unexpected real-device session
loss and re-entry still require headset evidence.

WebGL context loss is intentionally fatal because the shared D3D8 executor
cannot reconstruct all original resources in place. The executor's existing
`webglcontextlost` handler records the failure and presents a reload-required
banner. While immersive mode is active, the WebXR runtime also listens on that
exact Window-owned canvas: loss marks the session failed, ends it, releases
controller/native-ray/audio ownership, and removes the session's canvas
listener. A compositor packet pending at loss is rejected rather than falsely
acknowledged or replayed against a no-op context. The lost context is rejected
before any later `requestSession` call, so recovery requires the same explicit
page reload as desktop mode. The retail smoke triggers `WEBGL_lose_context`
after a successful fresh-session re-entry and verifies the failed phase, reload
banner, input/audio cleanup, and rejection before a third XRSession request.

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
- [x] Drive the retail main shell, LAN lobby/host options, skirmish setup, quit,
  score screen, save/load, save-description, and Options surfaces through a
  tracked controller ray, including hover/text state, an ephemeral
  create/load/delete round trip, and a match-to-shell round trip that preserve
  the active XRSession.
- [x] Produce a stock ControlBar tooltip from tracked hover and operate the
  Generals experience HUD surface after an in-session engine load reset.
- [x] Select an idle worker from the stock HUD, activate and cancel a live
  ControlBar mode, then dispatch a contextual move through the original command
  translator and observe the selected unit react.
- [x] Keep a native WebXR host and desktop guest in a real two-peer LAN match,
  dispatch a tracked contextual order, and retain CRC-clean lockstep afterward.
- [x] Map the initial tracked controller scheme to the original input paths.
- [x] Focus an original engine text field from a tracked ray and route native
  browser text events through the existing Win32/IME bridge.
- [x] Exit and enter a fresh immersive session without rebooting the live match,
  while restoring native input/audio ownership after each exit.
- [x] Fail an active session explicitly on non-restorable WebGL context loss,
  reject any pending compositor packet, and require reload before re-entry.
- [x] Apply head-tracked position/orientation to the engine-owned browser 3D
  audio listener with the same world scale and explicit session cleanup.
- [x] Persist continuous/stepped original-key turning and an optional per-eye
  motion vignette, with engine-angle, neutral-rearm, and pixel evidence.
- Add remaining comfort, accessibility, spatial-audio device validation,
  lifecycle, performance, compatibility, and non-VR regression coverage.

## Evidence required before support claims

Automated mocks may verify lifecycle and serialization contracts, but cannot
prove graphical VR. Native stereo support requires a real secure browser session
on WebXR hardware, headset capture or per-eye pixel evidence, authoritative
runtime state showing distinct XR views and matrices, and input evidence through
the original engine paths. Public project content must not claim VR support
before those gates pass.
