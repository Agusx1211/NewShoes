# TODO.md — Open port checklist

Open, living checklist for porting C&C Generals: Zero Hour to WebAssembly.
Grouped by milestone (see `PROJECT.md`). `[ ]` = not started or still in
progress. Completed checklist history lives in `DONE.md` so agents can load the
active plan cheaply and search the completed history only when needed.
Deferred experiments and longer design notes live in `IDEAS.md`; promote only
the next concrete action here when they become current work.

Keep it honest: nothing rendering-related is "done" until the **harness boots
the build and a screenshot or state check proves it** (see `AGENTS.md` "Don't
work blind").

Primary target is `GeneralsMD/Code` (Zero Hour). `Generals/Code` (base game)
shares structure and follows behind.

---

## Current integration status (autonomous session)

MERGED to `main` (verified, clean, green build): perf-drawstate (state-skip perf + geometry/texture correctness fixes), zorder-fix (RTT null-FBO depth-pollution fix — 0 FBO failures), audio-ini-fix (non-Default audio INI entries → audio subsystem inits plus base-Generals `Music.big` extraction), live-skirmish-start, mounted MSS stream playback, DXT CPU fallback and DXT1/2/3/4/5 browser draw coverage, draw-order-fix (D3DRS_ZBIAS 24-bit depth-bias scale in bridge.js — commit 33641ab).

RECENT: the live skirmish menu/options/start transition now loads all 47 official multiplayer maps into active match state and the harness now requires `renderedObjectCount > 0` plus visible non-black canvas variance. Remaining skirmish work is AI behavior tuning and map-specific script fixes.

PERF latest: runtime profiling separates real-engine frame time from tracked
browser D3D8 draw/upload/readback/FBO costs on Mac Chrome/Metal. The draw-state
cache and the first conservative adjacent draw-batching pass are measured on
the Mac. A synchronous WebGL `DEPTH_WRITEMASK` query in the D3D8 clear bridge
was the post-release shell-map stall; the shim now tracks the depth-write mask
and the Mac tick profile dropped from ~69.6 ms/frame to ~48.8 ms/frame, with
`DX8Wrapper.Clear.deviceClear` falling to ~0.015 ms in the opt-in engine
profile. Release `cnc-port` now strips runtime `DEBUG_LOGGING` and `WWDEBUG`
compile paths while preserving Debug diagnostics; Mac Chrome/Metal verified
the optimized release build still boots and renders the shell map at ~47.1
ms/frame over a 60-frame summary profile. Release native-wasm-EH vs JS-EH
A/B is also complete on Mac Chrome/Metal: native-EH measured 47.99 ms/frame
wall over 120 tick frames and JS-EH measured 48.35 ms/frame, both with zero
measured readPixels and only ~1.3-1.4 ms/frame in tracked browser D3D8 work.
The first original-WW3D hot-bucket pass split `SortingRenderer::Flush` and
proved z-sort itself is cheap (~0.01 ms); the expensive part is replaying
sorted draw state. Sorted translucent replay now skips exact duplicate
shader/material/texture/light/world/view state applications while preserving
per-triangle sort order. Mac Chrome/Metal no-profile release shell-map runs
improved from the prior 47.99 ms/frame native-EH baseline to 44.88 ms/frame
and then 40.41 ms/frame over repeated 120-frame tick profiles, with zero
measured readPixels and visible shell-map screenshots. Remaining measured
bottlenecks are the still-expensive sorted draw replay and terrain render. The
next profile split added `HeightMapRenderObjClass::Render` phase markers and
removed one redundant eager `DX8Wrapper::Apply_Render_State_Changes()` in
`SortingRenderer::Flush_Sorting_Pool`; the final Mac Chrome/Metal release
profile measured 48.50 ms/frame wall over 60 tick frames. The sampled C++
frame still has `SortingRenderer.pool.draw.before` at 25.8 ms and
`HeightMap.render.tilePasses.before` at 17.1 ms; shoreline is ~1.2 ms and
roads/scorches/extra-blend/terrain-tracks are all sub-millisecond. A
same-state sorted draw-run merge is verified in the real shell-map runtime;
it preserved rendering but did not materially drain the sampled bucket:
47.56 ms/frame wall, `SortingRenderer.pool.draw.before` 25.365 ms,
`W3DWater.render.waterTracks.before` 10.9 ms, and
`HeightMap.render.tilePasses.before` 7.375 ms. A follow-up profile-only split
inside the sorted replay loop proves the remaining sorted cost is draw
submission, not state replay: `SortingRenderer.pool.draw.submit.before`
24.525 ms across 132 submits, `SortingRenderer.pool.draw.state.before`
0.085 ms, and `SortingRenderer.pool.draw.submit.after` 0.070 ms on the sampled
frame. Further broad D3D8 shim work should wait for a DevTools trace if async
ANGLE/GPU stall detail is needed beyond the live harness counters. A deeper
profile-gated submit split now scopes sorted draw submissions through
`DX8Wrapper::Draw`, the wasm D3D8 shim, `browser_draw_indexed`, and the JS
`paintD3D8DrawIndexed` bridge. Mac Chrome/Metal measured 47.58 ms/frame wall,
with the sampled frame still led by `WasmD3D8.browserDrawIndexed.before`
20.23 ms and `HeightMap.render.tilePasses.before` 7.22 ms; the JS phase
counters show sorted bridge work at 13.825 ms/frame, dominated by
`sortedDrawUniformMs` 11.924 ms/frame, while geometry setup is 0.950 ms/frame
and actual draw/batch handling is only 0.022 ms/frame. The first uniform-cache
optimization now skips repeated transform matrix uploads with exact matrix
checks, caches point-sprite uniforms, and splits render/material/light uniforms
from texture-availability uniforms. Final Mac Chrome/Metal profile measured
46.70 ms/frame wall; sorted bridge work is 11.914 ms/frame, with
`sortedDrawUniformMs` down to 8.811 ms/frame and actual draw/batch handling
still only 0.022 ms/frame. A follow-up sorted subphase split and vertex
attribute layout cache measured 45.66 ms/frame wall on Mac Chrome/Metal;
sorted bridge work is now 9.129 ms/frame, with sorted vertex-attribute setup
reduced to 0.067 ms/frame and sorted geometry setup reduced to
0.165 ms/frame. The remaining sorted bridge cost is uniform setup:
`sortedDrawUniformMs` 7.671 ms/frame, led by render/material/light uniforms
at 5.163 ms/frame and texture/layout uniforms at 1.784 ms/frame. A deeper
profile-only render-uniform split measured 45.85 ms/frame wall on Mac
Chrome/Metal; sorted uniform setup is now broken down into apply-render-state
0.199 ms/frame, render-uniform build 0.023, base uniforms 0.417, material
0.934, fixed-function light uniforms 1.596, stage combiner uniforms 0.679,
alpha/fog 0.401, transform 0.973, and texture-layout uniforms 1.737. A
targeted fixed-function light uniform cache dropped that bucket to
0.045 ms/frame on Mac Chrome/Metal, with ~68.8 light-cache hits/frame and
~4.5 misses/frame. The latest measured sorted bridge work is 8.650 ms/frame,
with sorted uniform setup at 6.708 ms/frame; the next repeated upload targets
are base/material/alpha-fog/stage render uniforms, transform uniforms, and
texture-layout uniforms. A follow-up subgroup cache for base/material/stage and
alpha-fog uniforms reduced sorted bridge work to 7.521 ms/frame and sorted
uniform setup to 5.295 ms/frame on Mac Chrome/Metal. The remaining measured
uniform costs are transform uploads 1.701 ms/frame, texture-layout uniforms
1.557 ms/frame, render-state application 0.950 ms/frame, and material uniforms
0.632 ms/frame. A narrower texture-layout key then dropped texture-layout
uniforms to 0.015 ms/frame and sorted bridge work to 5.130 ms/frame. The
remaining measured sorted-uniform costs are transform uploads 1.371 ms/frame,
render-state application 0.551 ms/frame, and material uniforms
0.479 ms/frame. An exact-matrix transform uniform cache then dropped transform
uploads to 0.852 ms/frame and sorted bridge work to 3.848 ms/frame by removing
unrelated render/material/light state from the transform cache key and resetting
on shader program changes. Remaining measured sorted-uniform costs are material
uniforms 0.513 ms/frame, render-state application 0.282 ms/frame, and residual
transform uploads 0.852 ms/frame. Replacing the material uniform string key
with an exact cached material snapshot then reduced material uniforms to
0.214 ms/frame and sorted bridge work to 2.996 ms/frame on the latest Mac
Chrome/Metal profile. The remaining measured bridge targets are viewport
application 0.798 ms/frame, render-state application 0.647 ms/frame, and
residual transform uploads 0.342 ms/frame. A draw-path viewport cache then
dropped viewport setup to 0.076 ms/frame and sorted bridge work to
2.255 ms/frame with ~484 viewport-cache hits/frame. Remaining measured sorted
uniform costs are residual transform uploads 0.553 ms/frame, render-state
application 0.280 ms/frame, and material uniforms 0.190 ms/frame. Splitting
world/view/projection transform uploads then reduced transform uploads to
0.172 ms/frame and sorted bridge work to 2.065 ms/frame by keeping mostly
constant view/projection uniforms current across per-object world changes. The
remaining measured sorted-uniform costs are render-state application
0.512 ms/frame, residual transform uploads 0.172 ms/frame, and material
uniforms 0.131 ms/frame. Caching redundant WebGL render-state setter calls then
reduced render-state application to 0.179 ms/frame and sorted bridge work to
2.073 ms/frame in the second stability run, with ~840 skipped state setters per
frame vs ~121 applied changes. The remaining measured sorted-uniform costs are
residual transform uploads 0.212 ms/frame, render-state application
0.179 ms/frame, material uniforms 0.157 ms/frame, and texture-layout uniforms
0.015 ms/frame; no single sorted-uniform bucket is the current frontier. The
runtime frame profile now mirrors the human play page's synthetic mouse moves
after init, so the real main-menu widgets appear before profiling. That menu
profile measured 94.43 ms/frame wall / 92.57 ms average engine `lastFrameMs` on
Mac Chrome/Metal, with `W3DDisplay.draw.inGameUI.before` at 61.355 ms on the
sampled frame and exactly 97 `Render2DClass::Render()` flushes every sampled
frame. Scoped W3DDisplay 2D primitive batching now reduces the visible menu to
16 Render2D draws/frame while preserving the same 488 vertices / 244 triangles
and visible main-menu ordering. The latest Mac Chrome/Metal profile measured
54.68 ms/frame wall / 53.21 ms average engine `lastFrameMs`, with
`W3DDisplay.draw.inGameUI.before` down to 10.005 ms. Splitting the water-track
bucket proved 190 active water-track objects, with the old cost dominated by
per-object draw submission (`W3DWaterTracks.obj.draw.before` 19.93 ms), not
geometry/update work. Water tracks now batch contiguous same-texture quads into
one triangle-list draw; the latest Mac Chrome/Metal profile measured 39.06
ms/frame wall / 37.66 ms average engine `lastFrameMs`, with
`W3DWaterTracks.flush.batchDraw.before` at 0.055 ms and visible shell-map
water/wake rendering. The shadow pass then split projected decals, volumetric
stencil volume draws, and raw D3D8 draw submission, proving static volumetric
shadow submission was the expensive subpath while projected decal and dynamic
geometry work were small. A WebGL2 VAO cache for persistent indexed D3D8 draws
now reuses repeated vertex attribute layouts across frames without touching
temporary-index fallback draws. The latest Mac Chrome/Metal profile measured
38.06 ms/frame wall / 36.60 ms average engine `lastFrameMs`, with scoped shadow
submit bridge work at 4.140 ms/frame and vertex-attribute setup down to
0.406 ms/frame; the final sampled frame had `WasmD3D8.browserDrawIndexed.before`
at 2.23 ms and `W3DProjectedShadow.renderShadows.meshFlush.before` at
1.26 ms. A follow-up terrain tile submit split added profile-gated markers
around `HeightMapRenderObjClass` tile shader/buffer/draw work and an explicit
`PERF_PROFILE_D3D8_BOUND_DIAG` A/B switch for D3D8 bound-buffer checksums. Mac
Chrome/Metal proved the checksum bypass is a regression despite removing the
`WasmD3D8.DrawIndexedPrimitive.captureBound.before` CPU bucket: forced-on
measured 38.32 ms/frame while forced-off measured 46.34 ms/frame and shifted
stalls into shoreline/extra-blend/terrain-track buckets. The conservative
default keeps bound diagnostics enabled; the latest default terrain profile
measured 38.34 ms/frame wall / 36.92 ms average engine `lastFrameMs`, with
`captureBound` still ~7.55 ms/frame, `browserDrawIndexed` ~4.78 ms/frame, and
visible shell-map water/terrain. The runtime profile now also decomposes D3D8
buffer-upload traffic by buffer kind and lock/update mode. The latest Mac
Chrome/Metal release profile measured 36.34 ms/frame wall / 24.27 ms average
engine `lastFrameMs`; tracked browser D3D8 work is 20.53 ms/frame and is
dominated by buffer uploads (`bufferSubDataMs` 19.83 ms/frame across 386.3
updates/frame, 1.69 MiB/frame). The upload mix is mostly vertex and dynamic
ring writes: 289.0 vertex updates/frame (1.54 MiB), 372.3 dynamic
updates/frame (1.12 MiB), 362.7 `NOOVERWRITE` updates/frame (1.02 MiB), only
8.7 `DISCARD`/orphan updates/frame, and zero resizes. The measured render
frontier remains heightmap/terrain/dynamic upload bursts. A C++ water-track
lock-batching pass cut update calls to 196.2/frame on Mac M4 Metal while
leaving upload bytes in the same range. The sorted shoreline renderer now
keeps stable shoreline quad vertices in a persistent D3D8 vertex buffer and
only uploads the visible dynamic index ranges each frame; the latest Mac M4
Metal profile measured 37.50 ms/frame wall, 9.83 ms average engine frame time,
186.6 buffer updates/frame, 0.91 MB/frame uploaded, 0.38 MB/frame dynamic
uploads, and `bufferSubDataMs` 0.088 ms/frame. A follow-up browser D3D8
draw-submit cleanup removed duplicate render-state normalization and skips
diagnostic-rich fill/shade objects on `diag=lite` solid non-flat draws; the
latest Mac M4 Metal profile measured 37.22 ms/frame wall and reduced scoped
sorted draw-submit work to 2.70 ms/frame, with render-state apply at
0.054 ms/frame. D3D8 buffer upload producer attribution is now available behind
`PERF_PROFILE_D3D8_BUFFER_PRODUCERS=1`, and the Mac M4/Metal one-frame sanity
profile `runtime-frame-profile-buffer-producers-mac.json` measured 137 buffer
updates, 326 KB uploaded, 253 KB `NOOVERWRITE`, 72.6 KB `DISCARD`, and
0.060 ms `bufferSubDataMs`; the leading byte producers were
`W3DWater.render.renderWater.before` (140.5 KB),
`HeightMap.render.extraBlend.before` (48.1 KB),
`W3DVolumetricShadow.renderDynamicVolume.vbUnlock.before` (46.6 KB),
`HeightMap.render.shoreLines.before` (44.8 KB), and
`W3DVolumetricShadow.renderDynamicVolume.ibUnlock.before` (23.3 KB). Exact
dynamic ranges for flat/trapezoid water now trim unused uploaded vertices and
indices: `runtime-frame-profile-water-exact-ranges-mac.json` measured 137
buffer updates, 267.6 KB uploaded, 0.075 ms `bufferSubDataMs`, and
`W3DWater.render.renderWater.before` down to 82.0 KB. Exact dynamic ranges for
terrain extra-blend then dropped
`HeightMap.render.extraBlend.before` from 48.1 KB to 2.4 KB and total measured
one-frame upload traffic to 222.3 KB in
`runtime-frame-profile-extra-blend-exact-ranges-mac.json`. Dynamic volumetric
shadow rendering now replays the first stencil-pass dynamic VB/IB ranges during
the decrement pass when no dynamic-ring discard has invalidated them; the Mac
M4/Metal profile `runtime-frame-profile-dynamic-shadow-replay-mac.json`
measured 79 buffer updates, 186.6 KB uploaded, 0.035 ms `bufferSubDataMs`, and
volumetric shadow VB/IB uploads down to 29+29 updates / 23.3 KB + 11.7 KB.
Flat-water grid indices now use a cached static DX8 index buffer instead of a
per-frame dynamic index upload; `runtime-frame-profile-flat-water-static-ib-mac.json`
measured 78 buffer updates, 170.7 KB uploaded, 0.045 ms `bufferSubDataMs`, and
`W3DWater.render.renderWater.before` down to one vertex-only 65.1 KB update.
Shoreline indices now use a cached static DX8 index buffer rebuilt with the
shoreline tiles; `runtime-frame-profile-shoreline-static-ib-mac.json` measured
70 buffer updates, 125.4 KB uploaded, 0.020 ms `bufferSubDataMs`, and no
`HeightMap.render.shoreLines.before` dynamic upload producer. Flat-water
vertices now use a narrower dynamic `XYZDUV2` buffer because the flat-water
path uses prelit diffuse and constant normals; `runtime-frame-profile-flat-water-xyzduv2-mac.json`
measured 70 buffer updates, 107.6 KB uploaded, 0.025 ms `bufferSubDataMs`, and
`W3DWater.render.renderWater.before` down to 47.4 KB. Dynamic volumetric
shadow first-pass geometry now batches all visible dynamic shadow volumes into
one VB upload and one IB upload when they fit the existing dynamic ring;
`runtime-frame-profile-dynamic-shadow-batch-mac.json` measured 14 buffer
updates, 107.8 KB uploaded, 0.010 ms `bufferSubDataMs`, and dynamic shadow
VB/IB producers down to 1+1 updates / 23.3 KB + 11.7 KB. A follow-up upload
byte-reduction pass moved flat-water's constant tint/alpha out of the
vertex payload: `runtime-frame-profile-flat-water-xyzuv2-tfactor-mac.json`
measured 14 buffer updates, 102.1 KB uploaded, 0.010 ms `bufferSubDataMs`, and
`W3DWater.render.renderWater.before` down to 41.4 KB. A current release
reprofile showed the real wall-time frontier had moved from upload bytes to
draw submission and shoreline range fragmentation; the sorted shoreline
renderer now keeps static vertex data but switches fragmented visible batches
back to the dynamic-index path when they would exceed four static draw ranges.
`runtime-frame-profile-shoreline-threshold4-final-mac.json` measured 9.05
ms/frame wall vs 9.41 ms/frame in the same-session baseline, with
`HeightMap.render.shoreLines.before` down from 1.405 ms to 0.200 ms and draw
calls down from 403.6/frame to 319.4/frame. The next PERF pass should start
from the remaining draw-side leaders (`WasmD3D8.browserDrawIndexed.before` and
`W3DProjectedShadow.renderShadows.meshFlush.before`). A first scoped
projected-shadow receiver pass now skips per-polygon material-pass culling
when the projector cull volume fully contains a receiver mesh; Mac M4 repeats
stayed in the same wall-time band, so the remaining work is still broad draw
submission and the noisy projected-shadow mesh flush before returning to the
remaining byte-tail producers (exact dynamic shadow bytes and
`W3DWaterTracks.flush.batchUnlock.before`). The user-reported live-skirmish
shadow absence/flicker symptoms are fixed in the multi-frame Mac release path:
stencil volume passes and the `XYZRHW` shadow composite are now captured as
visible active-gameplay draws. A follow-up bridge cache pass now keeps
world/view/projection uniforms hot across non-transformed `XYZRHW` draws
instead of forcing the next world-space draw to re-upload them; the Mac M4/Metal
release profile `runtime-frame-profile-transform-cache-mac.json` reduced sorted
draw profiled bridge work from 11.45 to 8.79 ms/frame and transform-uniform
subtime from 2.70 to 1.80 ms/frame while preserving shell-map and active
skirmish screenshots. The runtime profile can now optionally attach compact
per-sample browser D3D8 deltas (`PERF_PROFILE_SAMPLE_BROWSER=1`) to the slowest
frame summaries, which split current slow frames into uniform, draw-call,
buffer-upload, and vertex-attribute stall patterns. Using that diagnostic, the
bridge now skips the unused `uClipPlanes` array upload when the effective clip
mask is zero; `runtime-frame-profile-clipplane-skip-mac.json` reduced sorted
uniform setup from 4.96 to 3.34 ms/frame and base-uniform setup from 1.09 to
0.41 ms/frame in the Mac M4/Metal release profile. Scalar color uniforms now
use `uniform3f`/`uniform4f` instead of allocating temporary typed arrays for
material, texture-factor, and fog color uploads; the follow-up
`runtime-frame-profile-scalar-uniforms-mac.json` reduced sorted uniform setup
again to 2.76 ms/frame and material uniforms from 0.65 to 0.22 ms/frame, with
wall time still noise-flat. `runtime-frame-profile-ui-split-mac.json` then
split `W3DInGameUI::draw()` and showed the visible main-menu UI spikes are
inside `TheWindowManager->winRepaint()`, not preDraw, hints, or postDraw; the
follow-up `runtime-frame-profile-window-repaint-split-mac.json` split the
window repaint path and showed the recurring UI spike is six
`W3DDisplayString.draw.render.before` calls, not window traversal, draw
callbacks, borders, or primitive wrappers. A wasm-only warmed `Render2DClass`
static VB/IB cache for unchanged geometry then moved stable text/window quads
off the dynamic ring after their first render:
`runtime-frame-profile-render2d-static-cache-mac.json` dropped buffer updates
from 58.3 to 48.9/frame and `bufferSubDataMs` from 0.731 to
0.223 ms/frame, with the shell-map/menu screenshot still correct and same-session
wall/engine averages improving from 20.34/18.86 to 17.20/15.75 ms/frame. A
draw-side bridge pass then skips material/source uniform uploads when
fixed-function shader lighting is disabled; compared with
`runtime-frame-profile-draw-submit-attribution-mac.json`,
`runtime-frame-profile-material-skip-mac.json` dropped material uniforms from
0.096 to 0.013 ms/frame, sorted uniform setup from 1.77 to 1.57 ms/frame, and
wall/engine averages from 17.32/16.03 to 16.26/14.97 ms/frame, with the
shell-map/menu screenshot still correct. The draw bridge now also lets
`WEBGL_provoking_vertex` first-vertex flat-shaded draws use the persistent VAO
cache instead of rebuilding vertex-attribute pointers every draw:
`runtime-frame-profile-firstvertex-vao-mac.json` reduced vertex-attribute
misses from 117.6 to 8.3/frame, raised VAO hits from 104.7 to 213.8/frame,
dropped sorted geometry setup from 1.53 to 0.67 ms/frame, and improved
wall/engine averages from 16.26/14.97 to 14.67/13.34 ms/frame. Remaining spike
frames then showed a fixed-light uniform spike on draws where shader lighting
is disabled; the bridge now skips that unused key/upload path alongside the
existing unlit material skip. Two Mac M4/Metal repeats kept the shell-map/menu
screenshot correct and reduced fixed-light uniform misses from 15.8 to
2.0/frame, but wall time stayed noise-bound (15.22/13.93 and 16.36/15.05
wall/engine averages vs the 14.67/13.34 VAO baseline), so this retires the
fixed-light upload waste without changing the primary frontier. Remaining spike
frames still rotate between `WasmD3D8.browserDrawIndexed.before`
transform/draw-submit stalls, sorting-reset/terrain shader-reset, shoreline and
water-track unlocks, projected/volumetric shadow buckets, shroud/window repaint,
and occasional text draw submission, so the next PERF pass should attack
transform or residual draw-submit spikes rather than material, light,
text-geometry, or first-vertex VAO setup. A follow-up transform split now
exports compare/world/view/projection timing inside `sortedDrawTransformUniformMs`;
`runtime-frame-profile-transform-split-mac.json` showed matrix comparison is
only 0.065 ms/frame while world-matrix uniform upload dominates at
0.805 ms/frame. Reusing persistent transform-cache snapshots removes per-miss
`Float32Array` allocations, but `runtime-frame-profile-transform-snapshot-mac.json`
kept world upload in the same band (0.859 ms/frame), so the transform frontier
is driver-side world `uniformMatrix4fv` frequency/stalls or reducing the number
of world-space submissions, not JS matrix comparison/allocation. A follow-up
draw-hot-path pass removed stale per-draw canvas/perf-summary bookkeeping from
lite D3D8 draws; `runtime-frame-profile-draw-hotpath-light-sync-mac.json`
reduced the viewport/bookkeeping bucket from 0.657 to 0.238 ms/frame, but
overall averages stayed dominated by intermittent display-string/world-uniform,
draw-call, road, and water driver stalls. Opt-in D3D8 draw producer attribution
now replaces the old internal `WasmD3D8.browserDrawIndexed.before` bucket with
owning renderer labels for both sorted and non-sorted draws:
`runtime-frame-profile-all-draw-producers-mac.json` measured 4.062 ms/frame of
draw bridge work on Mac M4/Metal, led by
`SortingRenderer.pool.draw.submit.before` (1.236 ms/frame, 73.2 calls),
`HeightMap.tilePasses.tileDraw.before` (0.629 ms/frame, 48 calls),
`W3DVolumetricShadow.renderDynamicVolume.draw.before` (0.634 ms/frame, 64.2
calls), `W3DVolumetricShadow.renderMeshVolume.draw.before` (0.466 ms/frame,
47.8 calls), and the non-sorted
`W3DProjectedShadow.renderShadows.meshFlush.before` (0.385 ms/frame, 48.4
calls). Smaller non-sorted tails now visible in the same profile include
shoreline, display-string, roads, extra-blend, water, water-track, and window
draws. The D3D8 bridge now compares the derived draw-cache key as numeric
fields instead of allocating a concatenated key string every draw; the first
Mac M4/Metal producer run `runtime-frame-profile-draw-cache-key-mac.json`
kept the screenshot correct and moved attributed draw bridge work from 4.062 to
4.024 ms/frame, with `SortingRenderer.pool.draw.submit.before`
`sortedDrawDerivedMs` moving from 0.421 to 0.408 ms/frame. Sampler-state cache
hits now use exact numeric field comparison instead of building another string
key per sampled draw; `runtime-frame-profile-sampler-key-mac.json` moved
`sortedDrawTextureBindMs` from 0.1515 to 0.1369 ms/frame, and the 120-frame
repeat moved it from 0.1829 to 0.1470 ms/frame. Adjacent draw-batch candidates
and the render-uniform cache now also avoid hot comma-string keys; the final
Mac M4/Metal profile `runtime-frame-profile-numeric-hotkeys-final-mac.json`
kept the screenshot correct and measured 3.993 ms/frame of attributed D3D8
draw bridge work with `sortedDrawPreBatchMs` at 0.161 ms/frame. A follow-up
PERF pass extended browser derived-object reuse beyond the previous-draw fast
path;
`runtime-frame-profile-derived-lru-release-mac.json` dropped derived-cache
misses from 122.8 to 62.4/frame and `sortedDrawDerivedMs` from 0.547 to
0.221 ms/frame, led by `SortingRenderer.pool.draw.submit.before` moving from
0.426 to 0.091 ms/frame. Another follow-up replaced per-draw vertex-attrib /
VAO key strings with primitive-field cache lookup;
`runtime-frame-profile-vao-key-release-mac.json` reduced
`sortedDrawVertexAttribMs` from 0.266 to 0.202 ms/frame and
`sortedDrawGeometryMs` from 0.733 to 0.672 ms/frame. The later dynamic/static
volumetric shadow world-batch replay profiles were invalidated by live-skirmish
shadow correctness: those commits were shell-map-only verified, broke visible
gameplay shadows, and have been reverted back to per-volume `RenderVolume`
stencil replay while preserving the earlier dynamic upload batching. A follow-up
mesh-flush split, captured before that rollback, showed the old
`W3DProjectedShadow.renderShadows.meshFlush.before` producer is
ordinary `DX8MeshRenderer.flush.rigid.before` submission during the renderer
flush: `runtime-frame-profile-projected-meshflush-split-mac.json` measured 48.37
calls/frame, 13.8K indices/frame, and 0.373 ms/frame there, while delayed
material-pass / projected receiver clipping markers did not show as hot rows.
The post-rollback producer recapture is done:
`runtime-frame-profile-post-shadow-revert-producers-mac.json` measured
`SortingRenderer.pool.draw.submit.before`, heightmap tile draws, volumetric
shadow replay, and `DX8MeshRenderer.flush.rigid.before` as the remaining
leaders. A follow-up browser bridge pass now routes color-write-disabled,
alpha-discard-free solid triangle draws through a minimal depth/stencil-only
WebGL program. The Mac M4/Metal profile
`runtime-frame-profile-depth-stencil-program-mac.json` used that path for
6,718 draws over 60 frames (~112/frame), kept shell-map rendering correct, and
moved wall/engine averages from 42.27/12.81 to 42.09/12.55 ms/frame with
sorted draw-profiled work from 2.640 to 2.584 ms/frame. A real multi-frame
Tournament Desert skirmish check also kept active-gameplay shadows visible and
recorded the expected 14 increment + 14 decrement color-masked stencil draws.
The producer profiler now carries generic per-producer `draw*Ms` phase buckets
for all indexed draws, not just sorted submits, and sorts producer deltas by
total `drawProfiledMs`. The Mac M4/Metal profile
`runtime-frame-profile-producer-phases-final-mac.json` measured
335.3 D3D8 draws/frame, 249.1 sorted-profiled draws/frame, and 2.914 ms/frame
of sorted-profiled bridge work; the all-draw producer leaders were
`SortingRenderer.pool.draw.submit.before` (0.935 ms/frame),
`HeightMap.tilePasses.tileDraw.before` (0.721),
`W3DVolumetricShadow.renderDynamicVolume.draw.before` (0.682),
`DX8MeshRenderer.flush.rigid.before` (0.673, non-sorted), and
`W3DVolumetricShadow.renderMeshVolume.draw.before` (0.483). The largest phase
buckets are still spread across geometry setup, render/transform uniforms, and
terrain texture binding rather than one retired key/string/cache path.
A follow-up depth/stencil-only fast-derived pass avoids texture, combiner,
light, and implicit-alpha-cutout probes when render-state facts alone prove
the minimal depth/stencil program is valid. The Mac M4/Metal profile
`runtime-frame-profile-depth-fast-derived-mac.json` showed the fast path
covering all current depth/stencil-only program draws
(`drawDepthStencilOnlyProgramDraws` and
`drawDepthStencilOnlyFastDerivedDraws` were both 111.97/frame) and kept the
shell-map screenshot correct. A real skirmish
artifact `skirmish-depth-fast-derived.json` reached active gameplay with
visible shadows and recorded 40 color-write-disabled stencil volume draws plus
2 pretransformed blended stencil composite draws in the captured frame.
A follow-up viewport hot-path pass now reuses the normalized D3D8 viewport
object between explicit viewport sets / canvas resizes and compares the
applied WebGL viewport key as numeric fields instead of building a comma-string
key every draw. Mac M4/Metal release repeats
`runtime-frame-profile-viewport-cache-mac.json` and
`runtime-frame-profile-viewport-cache-repeat-mac.json` kept the shell-map
screenshot correct and moved `sortedDrawViewportMs` from 0.271 ms/frame to
0.235 and 0.244 ms/frame. A focused Mac `d3d8Viewport` RPC also kept the
sub-rect viewport, scissor box, and `[0.25, 0.75]` depth range exact.
A follow-up sampler raw-hit pass keeps a raw D3D sampler-state key plus cached
mip-chain completeness on texture resources, so repeated sampled draws that
already have the right texture bound skip GL sampler-parameter resolution before
confirming the sampler cache hit. The Mac M4/Metal release profile
`runtime-frame-profile-sampler-raw-final-mac.json` kept the shell-map screenshot
correct and moved `sortedDrawTextureBindMs` from 0.1874 to 0.1682 ms/frame;
the top texture-bind rows also moved down (`HeightMap.tilePasses.tileDraw.before`
0.1087 -> 0.0990, `SortingRenderer.pool.draw.submit.before` 0.0364 -> 0.0290,
and `DX8MeshRenderer.flush.rigid.before` 0.0225 -> 0.0166 ms/frame). Focused
Mac `d3d8TexturedQuad` / `d3d8TwoTextureQuad` RPCs preserved the exact sampler
states and expected red / blue center pixels. This is a narrow JS draw-scaffold
cleanup, not a frontier shift.
The `DX8Wrapper::Apply_Render_State_Changes()` draw-submit profile now splits
shader, texture, material, light, transform, and VB/IB apply phases. The first
Mac M4/Metal split (`runtime-frame-profile-dx8-apply-split-mac.json`) showed
the slow-frame apply spike is texture apply, not identity bookkeeping:
`DX8Wrapper.Apply.texture.before` was 5.90 ms across 136 texture applies in the
slowest sampled frame. The texture-label diagnostics hook now avoids rebuilding
name/path `std::string`s for repeated non-missing texture IDs in the same frame
while preserving first-seen labels and missing-texture details. The follow-up
split profile `runtime-frame-profile-texture-label-lite-mac.json` kept the
shell-map screenshot correct and moved that slowest texture-apply sample from
5.90 to 5.32 ms (max 0.085 -> 0.055) with p99 engine frame time 24.3 -> 22.7
inside the instrumented profile. The follow-up JS texture-bind cleanup moved the
final clean Mac profile `DX8Wrapper.Apply.texture.before` bucket to 0.13 ms
across 127 texture applies by making D3D8 `SetTexture` notifications update
browser D3D state instead of immediately rebinding WebGL textures in `diag=lite`.
Do not re-open texture apply unless a new profile shows it regressed.
A follow-up current-VAO fast path in the JS draw bridge now tests the already
bound VAO before searching the VAO cache bucket and avoids a duplicate
vertex-attribute field compare when the current VAO key matches. Mac M4/Metal
release repeats kept shell-map screenshots correct; the final two-run average
moved `sortedDrawVertexAttribMs` from 0.2173 to 0.2008 ms/frame,
`sortedDrawGeometryMs` from 0.7643 to 0.7479 ms/frame, and
`sortedDrawProfiledMs` from 2.9185 to 2.8993 ms/frame. This is a narrow
draw-scaffold cleanup, not a frontier shift.
The remaining draw-side leaders are `WasmD3D8.browserDrawIndexed.before`,
`HeightMap.tilePasses.tileDraw.before`, `DX8MeshRenderer.flush.rigid.before`,
volumetric shadow draws, and the structural per-frame draw command buffer. Do
not revisit material, light, text-geometry, first-vertex VAO setup, transform
comparison/allocation, draw-time harness bookkeeping, draw-cache key strings,
sampler-key strings, adjacent/render-uniform key strings, browser derived-object
cache misses, vertex-attrib/VAO key strings, current-VAO lookup/comparison, the
reverted shadow world-batch replay, projected-shadow receiver per-polygon
clipping, or depth/stencil-only texture-probe setup unless a new profile makes
it hot and the fix passes a real multi-frame skirmish shadow screenshot/state
check. Do not revisit viewport normalization/key construction or raw
sampler-state/mip-completeness checks unless a new profile shows them
regressed. Broader shadow fidelity remains in the queued phased plan.

PLAY latest: `harness/play.html` now targets the optimized `dist-release`
runtime by default and boots the real ShellMapMD path unless `?shellmap=0`
is supplied. The Release shell-map path now reaches live `GAME_SHELL`
state on Mac Chrome/Metal and survives long real-frame runs past the former
frame-344 abort. The play harness now cache-busts the selected `cnc-port`
runtime JS/wasm by file metadata and the Mac harness server no-stores live
harness/runtime assets, so a reload cannot silently keep an older frame-344
build while preserving browser caching for the 1.3 GB archive payloads.

QUEUED other: shadows phased plan (blob→stencil→shaders fidelity polish), remaining control-bar player-list/purchase-science behavior after command-button, radar, and Generals Experience open/close proofs, compressed/DXT volume textures.

Dev-box render-verify: symlink worktree `dist/` → main's built `dist/` renders JS-only fixes without the Mac (~4min boot).

## User-reported play bugs (2026-07-06 session)

Observed by the project owner playing real skirmish + intro on the Mac GPU
build. All are user-facing regressions/gaps against the original game;
reproduce in the harness and verify each fix with a screenshot / state check.

- [ ] **Audio dropped across the board** — many sounds never play: intro
      music does not play, and skirmish effect/ambient/unit sounds do not
      play. Sounds get dropped rather than mixed. Audit the Miles→Web Audio
      path (voice allocation, stream vs sample routing, drop policy) against
      the real `AudioManager` request flow. 2026-07-06: the human `play.html`
      Start-button path now resumes Web Audio, creates default mixer buses, and
      verified natural main-menu music streams; keep open for natural skirmish
      SFX/ambient/unit-sound verification and any remaining drop policy bugs.
      2026-07-07 (owner): music playback is noticeably better (more tracks
      play), but **sound effects and speech/dialog (EVA announcements, unit
      responses/acknowledgements) still do not play most of the time**.
      Narrow the remaining work to SFX + speech routing specifically: sample
      (non-stream) voice allocation, the 2D/3D SFX bus, and the speech/dialog
      mixer path — music streaming is no longer the blocker.
      2026-07-07: fixed a concrete 2D SFX/voice pool-exhaustion bug in
      `MilesAudioManager::killLowestPrioritySoundImmediately()` where the 2D
      fallback released a 2D sound but erased the 3D playing list. Keep this
      open for natural gameplay SFX/EVA/unit-speech verification and a
      pool-pressure harness that proves preempted 2D handles are reused.
      2026-07-07: fixed the direct-event MSS volume ABI path where normalized
      3D sample volumes were truncated to integer zero before Web Audio; the
      direct real-audio gate now proves audible 3D SFX, 2D SFX, speech, and
      music in debug and release. Keep this open for naturally triggered
      skirmish/EVA/unit audio and sustained completion-drain verification.
      Related: [[frontier-2026-07-05-skirmish-sweep]] audio bug.
- [ ] **Text renders truncated** — some strings show only one letter or a few
      letters instead of the full text. Investigate the text/font glyph
      layout + string draw path (partial render, not missing text). 2026-07-07:
      the visible campaign-intro `Somewhere in South...` case is confirmed to
      be the original military subtitle typewriter reveal, not a stuck render
      truncation: the runtime now exports `gameplay.militarySubtitle` with the
      full source string, current index, and displayed lines. 2026-07-08: the
      hover-tooltip first-letter case was fixed in the MSVC wide-format shim;
      keep this open for any unrelated non-tooltip repro.
- [ ] **Loading-screen progress is static during map load** — the real
      multiplayer load screen now presents before the skirmish map load starts,
      but the synchronous map load still blocks intermediate browser frame
      turns. Split or yield the long load path if live progress animation is
      required during the load itself.
- [ ] **Lightning/lighting effects flat** — special/lightning effects look
      flat vs the original; the game's richer effect set is missing or
      degraded. Pin down which effect systems (particle/lightning/FX) are
      under-rendering. (Ambiguous "lightning" vs "lighting" — confirm which on
      repro.)
## User-reported play bugs (2026-07-07 session)

Reported by the project owner on the Mac GPU build. Reproduce in the harness and
verify each fix with a real, **multi-frame** screenshot / state check where the
symptom is temporal — NOT a single still.

- [ ] **Decals flip-flop / render at wrong depth (z-order)** — some decals
      (scorch marks, shadow/terrain decals) intermittently render onto the
      background / at the wrong depth and flicker between correct and wrong across
      frames. Looks like depth/z handling for the decal pass is unstable —
      inconsistent ZWRITE/ZFUNC/depth-bias or draw-order between the decal pass
      and terrain/world. Trace the projected/terrain decal render order and depth
      state; compare against the earlier z-order work (`feat/zorder-fix`). Verify
      over MULTIPLE frames (the flicker is temporal) that decals stay on the
      ground at correct depth.
- [ ] **Wrong ground tiles — small squares render the wrong texture** — sometimes
      individual terrain tiles show clearly wrong content (little squares
      rendering the wrong thing). SUSPECT: this may be a **stale texture-bind
      cache** regression — Codex is currently fast-pathing/caching D3D8 texture
      binds (`Cache D3D8 draw texture binds`, `Fast-path repeated D3D8 sampler
      hits`, and the in-flight "skip per-apply SetTexture JS hop" work). If a
      cached bind serves the previous tile's texture ID when the stage should
      rebind, a tile draws with the wrong texture. Check that the texture-bind /
      sampler fast-path correctly invalidates when the bound texture or stage
      changes, and diff behavior with the bind cache disabled. Also consider a
      terrain tile-texture atlas/UV/index bug independent of the cache. Verify no
      wrong tiles appear across a panned multi-frame terrain view.

- [ ] **Rally-point line does not render** — when a production building's rally
      point (the "go to here after created" point) is set, the white rally line
      from the building to the rally point does not draw. The rally point itself /
      unit routing may work, but the visual line is missing. Trace the rally-line
      draw path (W3D in-world line/decal rendering for `RallyPoint` / the
      drawable's rally feedback) and confirm it submits through the browser D3D8
      layer; likely an unrendered line-primitive / XYZRHW or in-world line draw,
      similar in kind to other missing overlay primitives. Verify with a
      multi-frame screenshot showing the line after setting a rally point.
- [ ] **Ground toxin/radiation fields do not render** — toxins on the ground
      (anthrax, radiation, and similar persistent ground effects) are not drawn.
      The field is likely still active in simulation (damage over area) but the
      ground decal/overlay is invisible. Trace the toxin/radiation ground-effect
      render path (terrain decal / scorch-style projected overlay or particle
      ground splat) and confirm its draw reaches the browser D3D8 layer; check
      whether it depends on a projected-decal / blend / texture path that is
      currently stubbed or mis-blended. Verify with a screenshot of an active
      anthrax/radiation field on the ground.
- [ ] **Post-match stats/score screen is broken and cannot be closed** — after a
      match ends, the end-of-game stats/score screen renders broken (garbled /
      wrong layout) and has no working way to dismiss it (buttons don't respond /
      no close), trapping the player. Reproduce by finishing a skirmish match.
      Investigate both (a) the score-screen window/layout rendering (the
      `ScoreScreen` / end-game window GUI draw + its data population) and (b) its
      button callbacks / input wiring (same class of dead-button issue seen with
      the Esc menu and skirmish quit menu — check the window's callbacks are
      registered and reachable through the browser input path). Verify the screen
      renders correctly AND a close/continue button returns to the menu.
- [ ] **Physical iPad Safari canvas-drag confirmation** — after the browser-side
      canvas selection/callout suppression, run the real playable page on an
      iPad in Safari and confirm an in-game touch drag no longer highlights the
      page/canvas and still reaches the expected drag-select/order path. The
      touch-enabled Chromium harness guard/pointer checks are done; this is the
      remaining real-device WebKit confirmation.
- [ ] **Add a native-resolution option + fullscreen button (render at tab res)** —
      today the canvas renders at one fixed default resolution. Add a resolution
      selector with two entries: (1) the current default, and (2) an
      auto-generated entry matching the browser tab's actual size — CSS pixels ×
      `window.devicePixelRatio` — so we can render at the display's native
      resolution. Switching must resize BOTH the WebGL canvas backing store and
      tell the engine/D3D8 layer the new backbuffer size (viewport + projection +
      GUI layout reflow) — not just CSS-scale the existing buffer. Also add a
      **fullscreen button** using the Fullscreen API (`requestFullscreen()` on the
      canvas container, handle the resize + exit). Handle tab resize / DPR change
      so the native-res entry tracks the current window. Verify on desktop and
      iPad that native-res is sharper and fullscreen fills the screen without
      distorting aspect.
- [ ] **Broaden right-click context-target order coverage beyond docking** —
      right-click ground move and GLA worker right-click supply docking now work
      in the browser alternate-mouse path (see DONE). Keep extending the
      harness through the original context-command resolver for object
      attack/enter/repair and any other target-specific right-click commands,
      with dispatch counters plus unit AI/order state checks rather than only
      raw click-event checks.
- [ ] **Frame time is unstable (jumps around; no steady 30fps) (REOPEN/perf)** —
      the average is good (~9 ms release shell-map profile) but frame time
      varies wildly in play and never holds a consistent 30fps. Frame-time
      STABILITY is currently untracked: every perf item optimizes *average*
      ms/frame or a named bucket, and TODO/DONE already record optimizations
      that *added* upload/unlock spikes. Add a stability workstream: report
      p95/p99 and max frame time (not just avg/median), identify the spike
      frames, and attack the likely causes — (1) GC pauses from per-draw D3D8
      bridge payload/state object churn (the old matrix-copy slice is retired,
      but the per-frame command-buffer TODO still addresses both average and
      jitter), (2) uneven per-frame work (buffer uploads / shadow-volume regen /
      water-shoreline rebuild firing on some frames only), (3) unpaced rAF logic
      stepping (fixed-timestep pacing). Optimize for consistency, not the mean.
      2026-07-07: `runtime_frame_profile.mjs` now reports p99 and compact
      `slowestEngineSamples` / `slowestRpcSamples` with top engine markers, so
      spike frames are visible without full sample dumps. The first M4/Metal
      sampled profile (`runtime-frame-profile-stability-fields-mac.json`) had
      engine `lastFrameMs` avg 7.78, p95 9.6, p99 9.9, max 11.2 over 30
      single-frame samples; the worst frame was game-logic heavy, while the
      recurring render marker remained `WasmD3D8.browserDrawIndexed.before`.
      Next work is to use those slowest-sample markers to attack the real spike
      causes, not to add more broad averages.
      2026-07-07: cached D3D8 texture transforms now stay as owned
      `Float32Array`s in the draw-state LRU instead of owned JS arrays, so the
      bridge no longer recopies both texture matrices to new typed arrays on
      every draw. A debug/profile Mac M4/Metal sanity run
      (`runtime-frame-profile-mac-texture-transform-typed.json`) remained
      render-correct over 60 frames; the slowest samples were still led by
      `WasmD3D8.drawBound.capture.before`,
      `WasmD3D8.browserDrawIndexed.before`, projected-shadow flush,
      shoreline, and water-track markers. Keep attacking those real spike
      buckets and the structural command-buffer work; this does not close the
      stability item.
      2026-07-07: window repaint profiling isolated the visible menu UI spike
      to six `W3DDisplayString.draw.render.before` calls. A wasm-only warmed
      `Render2DClass` static VB/IB cache removed the stable text/window
      geometry from the dynamic upload path after first render and reduced
      `bufferSubDataMs` from 0.731 to 0.223 ms/frame in same-session Mac
      profiles, but slowest samples still rotate through
      `WasmD3D8.browserDrawIndexed.before`, projected/volumetric shadows,
      roads/shoreline, and occasional text draw-submit stalls. Keep this item
      open for command-buffer/draw-side stability work.
      2026-07-08: draw-payload world/view/projection matrices now stay as wasm
      pointers through EM_JS and are copied directly from the wasm heap into
      three reusable scratch `Float32Array(16)` buffers in the JS draw bridge;
      cached texture transform `Float32Array`s keep their previous no-copy
      path. Mac M4/Metal release profile
      `runtime-frame-profile-matrix-scratch-mac.json` reported 1651.8 matrix
      normalizations/frame, 991.1 heap-to-scratch copies/frame, zero allocated
      matrix copies, and engine `lastFrameMs` avg 4.72 / p95 6.9 / p99 7.2 /
      max 7.3 ms over 60 measured shell-map/menu frames.
      2026-07-08: the native EM_JS indexed-draw bridge now reuses one outer
      draw payload object plus one nested transform shell for synchronous
      `cncPortD3D8DrawIndexed` calls. A local SwiftShader shell-map profile
      (`runtime-frame-profile-reused-payload-local.json`) rendered the real
      shell map and reported `drawPayloadCalls` and `drawPayloadReused` both at
      236.375/frame with zero allocated matrix copies. Keep this item open:
      derived-state misses, material/light/clip arrays, uneven producer work,
      and the structural command-buffer path remain.
- [ ] **Performance still needs love (general)** — beyond stability, the loaded
      (non-shell-map) skirmish frame cost with hundreds of units is the real
      target and is not yet profiled/held to triple-digit fps. Keep pushing the
      draw-side frontier (browserDrawIndexed per-draw scaffolding, projected
      shadow flush, shoreline) and land the structural per-frame draw command
      buffer rather than only per-uniform/per-subsystem caching. 2026-07-07:
      `runtime_frame_profile.mjs` can now drive the real UI into an active
      skirmish via `PERF_PROFILE_SCENE=skirmish`, and the first Mac M4/Metal
      release profile reached 224 objects/drawables with p95 6.5 ms, p99
      6.8 ms, and max 9.3 ms over 60 measured frames. This is a useful
      active-base baseline; now that live skirmish AI/pathfinder is enabled,
      the next performance target is a later, populated AI/pathfinding fight
      rather than the first visible 224-object base.
      2026-07-07: the profiler now records compact player diagnostics around
      active-skirmish setup/post-active settling, and the Mac M4/Metal
      `runtime-frame-profile-skirmish-ai-1200-occlusion-split-mac.json`
      profile measured a real AI-advanced scene: 1200 post-active frames,
      enemy `activityDetected=true`, enemy objects 3 to 4, enemy money 11400
      to 9400, final logic frame 1300, 225 objects/drawables, and engine
      `lastFrameMs` avg 6.26 / p95 6.7 / p99 6.8 / max 8.6 over 60 frames.
      The first occluded-stencil split showed the old combined marker is not
      the primary remaining draw leader: occluder flush is ~0.080 ms/frame and
      occludee flush ~0.048 ms/frame. The next measured late-skirmish draw
      frontier is heightmap tile draws (~0.578 ms/frame), volumetric dynamic
      and mesh shadows (~0.187 and ~0.184), window draw callbacks (~0.144),
      roads (~0.131), and then smaller occlusion phases.
      2026-07-07: draw-time WebGL texture unit/2D-binding/sampler caching now
      skips redundant `activeTexture` / `bindTexture` / sampler application in
      the D3D8 bridge. The Mac M4/Metal late-skirmish profile
      `runtime-frame-profile-texture-sampler-cache-skirmish-ai-1200-mac.json`
      reduced active texture changes to ~5/frame, 2D bind misses to zero, and
      sampler misses to ~5/frame while preserving a visible active-skirmish
      screenshot, but `sortedDrawTextureBindMs` stayed noise-flat (~0.080
      ms/frame vs ~0.073 baseline) and wall time did not materially move.
      Do not spend another pass on draw-time texture binding unless a trace
      shows a real stall there; the current frontier remains terrain tile draw
      submission, volumetric shadows, UI/roads, and the structural draw command
      buffer.
- [ ] **Purchased special powers can't be activated** — generals' special
      abilities/powers can be *purchased* (science/rank spend works) but
      clicking the ability button to *use* it does nothing: no targeting
      cursor, no activation, no effect. This is the special-power **activation/
      targeting** path, distinct from purchase (see the purchasable-science
      dispatch item above). Trace the command-button → `SpecialPower` activation
      (`MSG_DO_SPECIAL_POWER` / target-select mode) → `GameLogic`
      `SpecialPowerModule` firing + recharge. Verify by purchasing then firing a
      power in the harness and reading back the special-power module state.

## Visual fidelity — missing/degraded graphic effects (2026-07-07 Claude audit)

Owner reports the game "used to feel more vivid." Audit of the D3D8→WebGL shim
found several effects the original shipped that the port silently drops (shaders
+ gamma are stubbed). Each is an individual item; verify with before/after
screenshots on the release build.

- [ ] **Terrain noise/detail shaders are dead (flat ground)** — the shim stubs
      the programmable pipeline (`wasm_d3d8_shim.cpp:3399-3402`:
      `CreatePixelShader → D3DERR_NOTAVAILABLE`, `SetPixelShader/SetVertexShader`
      no-ops), so the shipped terrain shaders (`Shaders/terrainnoise*.nvp`,
      `fterrainnoise*.nvp`, `roadnoise2.nvp`) never run. `HeightMap.cpp:2064-2092`
      selects `W3DShaderManager::ST_TERRAIN_BASE_NOISE1/2/12` plus a "macro
      noise/lightmap texture (pass 3)"; with shaders unavailable W3D falls back
      to plain fixed-function terrain, losing the fine noise + lightmap detail
      layer that gave the ground texture/depth. Fix: reimplement the terrain
      base+noise multi-texture blend as a WebGL2 shader in the bridge (the
      fixed-function fallback drops the noise/lightmap pass). Verify vs original
      terrain screenshots.
- [ ] **Heat-haze / screen smudges not rendering (flat explosions/fire)** — the
      original distorts the background behind heat particles ("screen smudges
      which are particles that distort the background behind them",
      `W3DParticleSys.cpp:381`) — the shimmer around fire, explosions, and jet
      exhaust. This needs a grab-framebuffer + refraction pass, exactly the kind
      of render-to-texture the fixed-function WebGL bridge tends to drop
      (related to the known "invisible explosions" report). Fix: implement the
      smudge/distortion pass (sample the current color target and offset by the
      smudge geometry) in the bridge. Verify with an explosion capture.
- [ ] **Monochrome / motion-blur screen shaders missing (special-FX tints)** —
      also casualties of the stubbed pixel-shader path: `Shaders/monochrome.nvp`
      / `invmonochrome.nvp` (screen monochrome/tint used by some special
      powers/EMP/superweapon flashes) and `MotionBlur.nvv`/`motionblur.nvp`
      (motion blur). Lower priority than the above but part of the same
      dead-shader gap. Fix: implement these as WebGL2 post passes when their
      shader is selected. Verify by triggering the relevant effect.

## Strategy pivot — real `init()` whole-program link (current focus)

See `AGENTS.md` "How the port advances". Probe/smoke accretion is over; these
items supersede the per-subsystem "promote focused shim to real ownership"
flow below.

**The real lifecycle now runs**: `cnc_port_real_engine_init()` constructs the
original `Win32GameEngine` via original `WinMain.cpp::CreateGameEngine()` and
runs real `GameEngine::init(argc, argv)` (`-noshellmap -win`) to completion —
all 43 `initSubsystem` stages — in headless Chromium against mounted real
archives, then `cnc_port_real_engine_frame(n)` runs real
`GameEngine::update()` frames (455 proven) rendering the actual Zero Hour
title screen through `W3DGameClient`/`W3DDisplay` (see DONE.md M2). The
frontier is computed from the run (a `SubsystemInterfaceList::initSubsystem`
hook + stdout markers), never hand-authored. Open items below are the
residue and the next frontier.

- [ ] **Advance the real boot from the title screen to the interactive main
      menu**: drive the shell past the title through real
      `GameClient::update()` (Shell push of `MainMenu.wnd`), route browser
      mouse/keyboard through the real message stream, and harness-click a
      real menu button through the real boot with screenshot + state proof.
      The superseded focused menu repaint/layout npm and vertical-integration
      gates are now retired; keep future menu verification on the real startup
      path unless it is explicitly ad-hoc diagnostic coverage.
      Current state: startup vertical now proves real frames reach
      Shell-owned `Menus/MainMenu.wnd`, clears the stale movie-break render
      gate once the real display has no active movie, and visibly repaints the
      real MainMenu WND/logo/button stack instead of the stale title screen.
      It now posts Win32 mouse move/down/up through the original
      `WndProc`/`Win32Mouse`/`WindowXlat`/`GameWindowManager`/
      `GadgetPushButton` path, proves the first-run reveal with canvas pixel
      samples + screenshots, queues browser DOM `A` down/up into the browser
      DirectInput scan-code device, proves original `DirectInputKeyboard` sees
      `KEY_A` down/up during real `GameClient::update()`, links the real
      W3D main-menu draw/init owner instead of the legacy weak probe body,
      waits for the real default, Single Player, and USA difficulty
      transitions to finish, state/screenshot-proves `ButtonSinglePlayer`
      -> `ButtonUSA` -> visible difficulty controls with engine hit-testing
      aligned to the rendered menu, then clicks real `ButtonEasy`, routes the
      original CD check to browser-mounted `GensecZH.big`, runs original
      `prepareCampaignGame` / `setupGameStart`, sets pending
      `Maps\MD_USA01\MD_USA01.map`, reaches `doGameStart()`, and queues
      `MSG_NEW_GAME` single-player/easy through the real startup lifecycle,
      dispatches `MSG_NEW_GAME`, runs `prepareNewGame`, completes deferred
      `startNewGame(FALSE)` for `Maps\MD_USA01\MD_USA01.map`, mounts base
      `W3D.big` for the original `new_skybox.W3D` water/skybox render asset,
      mounts base `Textures.big` as `ZZBase_Textures.big`, reports
      `TextureClass::Apply` missing-texture diagnostics from the real frame
      loop, exports loaded-map gameplay/UI/script state (`GameLogic`,
      `GameClient` drawables, local player, `InGameUI`, control bar windows,
      letterbox/fade gates, plus full `ScriptEngine` counter/flag snapshots
      and sequential-script queue size, plus a prioritized read-only catalog
      of the loaded original `ScriptList` graph, real `TheTacticalView`
      camera/view state, and compact watched MD_USA01 intro gates spanning the
      camera-cut, phase-two base/rocket, flash, return-location, and final
      player-control timers/scripts), and chunk-proves 720 post-campaign
      loaded-map logic frames through frame 897 with zero WW3D missing-texture
      applies. The original MD_USA01 intro script is still legitimately
      mid-cinematic rather than texture-blocked or frame-stuck:
      a refreshed 180-frame run reaches logic frame 180 with zero missing
      texture applies, 1,374 objects/drawables, visible captioned cinematic
      rendering (`startup-vertical-real-init-post-campaign.png`, center
      pixel `[152,164,189,255]`), `INTRO_DONE=false`,
      letterbox/input/control-bar still disabled, and active timers including
      `CINE_CameraCutTo04=512`. A 120-frame gate/view run now reaches logic
      frame 120 with zero missing texture applies, `fade=4`,
      `fadeValue=0.984`, black center/terrain pixels, `TheTacticalView`
      ready at camera position approximately `(3504.10,642.88,67)`, and the
      watched `CINE_CameraCutTo04` timer counting down from 632 to 572 across
      two 60-frame chunks; the same chunk summaries now include 20 watched
      counters and 15 watched scripts through `CINE_FlashWhite`,
      `CINE_ReturnToPlayerLocation`, `Give Player The Game`, and
      `ReturnToPlayerControl`. The script catalog reports 16 sides, 35 groups,
      291 scripts, 168 interesting scripts, and priority-includes the real
      future gates: `CINE_CameraMoveTo06` sets
      `CINE_LaunchPadMoveDelay`, `CINE_Pt2CameraLocation01Delay`, and
      `CINE_Pt2MoveTransportsDelay`; `Give Player The Game` sets
      `INTRO_DONE`; `ReturnToPlayerControl` runs
      `CAMERA_LETTERBOX_END`/`ENABLE_INPUT`. The 720-frame run still reaches
      logic frame 720 with zero missing texture applies, object/drawable count
      advanced to 1,284, and a black screenshot while that later script phase
      is active. For faster deeper intro/rendering iteration,
      `STARTUP_VERTICAL_REAL_INIT_ONLY=1` now skips only the phase1
      archiveless and phase2 audio/frontier preflights while preserving the
      default full startup vertical gate. It can now also run post-campaign
      chunks until original player-control gates are met
      (`STARTUP_VERTICAL_POST_CAMPAIGN_UNTIL_PLAYER_CONTROL=1`) and optionally
      fail if control is not reached
      (`STARTUP_VERTICAL_POST_CAMPAIGN_EXPECT_PLAYER_CONTROL=1`). The first
      120-frame player-control run correctly reports the scene is still
      mid-intro (`INTRO_DONE=false`, input disabled, letterboxed, control bar
      hidden) with zero missing texture applies. The player-control chunk JSON
      now also emits a compact `releaseChain` built from the original loaded
      scripts, showing the active countdown blocker and the future
      `INTRO_DONE`/`ReturnToPlayerControl` release actions without parsing map
      files out-of-band; deep player-control runs also summarize
      `phaseChanges` so the final JSON reports real intro gate transitions
      without requiring every chunk to be inspected manually; and
      `STARTUP_VERTICAL_POST_CAMPAIGN_COMPACT_CHUNKS=1` keeps deep-run chunk
      arrays/logs small while preserving the full final frame state. A
      900-frame compact player-control run now passes `CINE_CameraCutTo04`;
      logic frame 900 still has zero missing texture applies, 1,284
      objects/drawables, 55 rendered objects, letterbox/input/control-bar
      gates still disabled as intended by the intro, and active phase-two
      blockers `CINE_LaunchPadMoveDelay=154`,
      `CINE_Pt2CameraLocation01Delay=274`, and
      `CINE_Pt2MoveTransportsDelay=94`. A lightweight
      `realEngineFrameSummary` RPC now drives the same real update loop while
      exporting only the state needed by long player-control gates; a 120-frame
      lightweight browser run matches the early intro countdown with zero
      missing texture applies and keeps compact JSON output. A Mac Chrome/Metal
      2,400-frame lightweight run now reaches logic frame 2,286 with no
      exception and zero missing texture applies, then stalls at the final
      player-control gate: `Give Player The Game` remains active on
      `TIMER_EXPIRED("Give it back")`, while the `Give it back` counter is
      allocated at value `0` with `isCountdownTimer=false`, so the original
      `evaluateTimer()` path must return false. Runtime counter references show
      the only loaded producer is unsuffixed `Start_Mission_Intro`
      (`SET_MILLISECOND_TIMER("Give it back")`), while the late chain enabled
      `Start_Mission_Intro SS1`, whose actions do not set that timer.
      Remaining: keep long rendered chunks observable with smaller chunks or
      RPC timeouts/progress, and continue from the scripted intro toward a
      visibly correct, interactable in-game scene.
- [ ] Add remaining D3D8 depth/stencil texture formats if runtime evidence
      needs them. The WebGL2 bridge now supports texture-owned D16,
      D16_LOCKABLE, D24X8, and D24S8 depth attachments; D15S1, D24X4S4, and
      D32 currently fail explicitly instead of binding an incorrect FBO.
- [ ] Keep `EXPECT_WASM=1 node WebAssembly/harness/smoke.mjs` in the regular
      merge routine now that the aggregate lane is green again (2026-07-05).
      If it fails, fix or quarantine the specific probe immediately instead of
      letting the suite become "known red" again.
- [ ] Restore the real cursor-hide behavior in bridge.js syncBrowserCursor and
      the smoke.mjs cursor-hidden probe assertion once W3DMouse cursor rendering
      (the game's own cursor) is ported — currently hardcoded css="default" to
      avoid a cursorless UI (see e97628f).
- [ ] Migrate the legacy `ensure_booted()` probe boot and its harness gates
      onto the real lifecycle path, deleting probe-local implementations as
      real init covers them. The 2026-07-05 aggregate-smoke
      `edgeMapperApply` dlmalloc OOB is fixed (see DONE.md): edge-mapper was
      only the first allocation to trip after earlier probe heap corruption,
      and the live corruptors were mixed real/shim headers in the W3D
      draw-image and original GUI mouse stream probes. Keep retiring the
      remaining probe-local implementations instead of adding new smokes.
      RULE: menu/GUI/engine sources added to `cnc-port`-linked libs must go
      in a REAL-header runtime (`zh_gameengine_real_lifecycle_runtime` /
      `zh_gameengine_real_ini_runtime`), never the shim-flavored
      `zh_window_layout_script_runtime`; `harness/phase3_isolate.mjs` remains
      the archive-mount crash reproducer/bisection driver for that separate
      class.
- [ ] **Keep the retired mixed-ABI shim-header system dead — PROVEN LIVE in the current
      `cnc-port` link** (Fable audit 2026-07-05, verified via
      `ninja -t deps` in `build/wasm`, not inferred). Originally seven shim
      headers shadowed real engine headers at identical include paths:
      `shims/Common/{GlobalData,INI,STLTypedefs,GameAudio,Xfer}.h`,
      `shims/GameLogic/GameLogic.h`, and
      `shims/GameNetwork/WOLBrowser/WebBrowser.h`. The stale WOL WebBrowser
      shadow is now deleted after the browser-owned
      `wasm_webbrowser_boundary.h` replacement left it with zero build-dep
      users. All seven audited shadow headers are now deleted after reaching
      zero build-dep users, and the real-header verifier treats the retired
      paths as stale-dependency failures.
      Original Fable audit evidence: `TheGlobalData` was constructed real-layout
      (338 fields, `SubsystemInterface` base → vptr) by
      `zh_gameengine_globaldata_runtime`, while ~30 cnc-port TUs — including
      real engine sources `GameNetwork/Network.cpp`,
      `GameClient/Input/Keyboard.cpp`, `Win32CDManager.cpp` (compiled
      directly into `cnc-port`, which lacked the define) — used the SHIM layout
      (125 fields, no base, no vptr; every offset differs). `Network.cpp`
      also got the shim `GameLogic` (0 virtuals, inline `getFrame()` at a
      fake `m_frame` offset) and made 10 `TheGlobalData->m_network*` member
      reads at wrong offsets — latent garbage that will detonate as fake
      "network bugs" the moment M9 work starts. The shim GlobalData also
      silently drops 213/338 fields (BuildSpeed, RefundPercent, regen,
      camera, the `m_autoFire/Smoke/AflameParticle*` family).
      Partial fixes: the red 2026-07-05 aggregate smoke was caused by this
      hazard class, and `wasm_ww3d_scene_probe.cpp`,
      `wasm_ww3d_render_probe.cpp`, `wasm_edge_mapper_probe.cpp`, and
      `wasm_gui_mouse_stream_probe.cpp` now force-include
      `wasm_prerts_real.h` with real engine include dirs; `ninja -t deps`
      verifies the affected render/GUI/edge objects use real `Common/INI.h`,
      real `Common/GlobalData.h`, and real `PreRTS.h`. `Network.cpp`,
      `GameClient/Input/Keyboard.cpp`, and `Win32CDManager.cpp` have now been
      moved out of the `cnc-port` executable object list and into
      `zh_gameengine_real_lifecycle_runtime`; after `ninja -t cleandead`, the
      old direct `CMakeFiles/cnc-port.dir/...` objects are gone, and deps verify
      those lifecycle objects use real `Common/GlobalData.h` (plus real
      `GameLogic/GameLogic.h`, `Xfer.h`, and `GameAudio.h` for `Network.cpp`).
      Current direct-runtime gate: `cnc-port` now forces the real PreRTS /
      GlobalData / GameLogic prelude for direct executable objects, removes the
      fake probe-local `TheGlobalData` provider, adapts the network probe to the
      original `GameLogic` layout, uses a non-shadow browser `WebBrowser`
      boundary, and adds `npm --prefix WebAssembly run
      verify:cnc-port-real-headers`. That audit currently checks 44 direct
      `cnc-port` objects with 0 direct shadow-header offenders, so new direct
      regressions fail immediately. Follow-up burn-down moved the lifecycle
      runtime off the shadow WOL `WebBrowser.h`, migrated `zh_gameclient_text`
      and `zh_win32_mouse_browser_real` to the real PreRTS/header prelude, and
      then migrated `zh_w3d_device_utility` plus its focused smoke to the real
      `GlobalData` owner/path. The next burn-down moved the INI science
      compatibility provider out of `shims/`, migrated
      `zh_winmain_wndproc_browser` to a real-header prelude while preserving
      its intentional narrow Win32/WndProc shims, and migrated
      `zh_window_layout_script_runtime` to the real PreRTS/header prelude. That
      drops the linked archive count to 7 offenders. The next burn-down moved
      `zh_w3d_terrain_probe_runtime` to the real PreRTS/GameLogic prelude, so
      the actual `cnc-port` link now has 0 direct and 0 linked shadow-header
      offenders; `verify:cnc-port-real-headers` now runs with
      `--fail-on-linked` by default. The next burn-down moved the non-linked
      `ZH_GAMELOGIC_PRERTS_FRONTIER_SOURCES` and
      `ZH_LEGACY_GAMESPY_PRERTS_FRONTIER_SOURCES` source-file properties from
      shim `PreRTS.h` to `wasm_prerts_real.h`, and moved
      `gamelogic-new-game-dispatch-smoke` off its explicit shim `PreRTS.h`
      include. The real compile frontier and dispatch smoke now use real
      `Common/INI.h`, `Common/STLTypedefs.h`, `Common/GlobalData.h`, and
      `GameLogic/GameLogic.h` for representative GameLogic/GameSpy objects.
      The next burn-down deleted the duplicate
      `zh_gameclient_gui_input_shim_runtime` archive and migrated
      `w3d-window-layout-script-smoke` to the real PreRTS/header prelude, the
      existing real GUI-input archive, original GlobalData/debug owners, and
      narrow real-layout INI/GameLogic support. After `ninja -t cleandead`,
      the focused audit for `w3d-window-layout-script-smoke`,
      `zh_gameclient_gui_input_runtime`, and the removed shim runtime reports
      0 audited shadow-header offender objects. The next burn-down migrated
      `win32-mouse-smoke`,
      `win32-mouse-cursor-smoke`, and `gamewindow-input-smoke` off shim
      `PreRTS.h` and onto the real-header `zh_win32_mouse_browser_real` path,
      sharing the already-real `zh_gameclient_utility` closure plus original
      GlobalData/debug owners. The next burn-down migrated
      `win32-keyboard-smoke` and `win32-keyboard-focus-repeat-smoke` off shim
      `PreRTS.h` and onto the same real-header `zh_gameclient_utility` closure
      plus original GlobalData/debug owners and focused real-layout INI support.
      The next burn-down deleted the obsolete shim-only
      `zh_win32_mouse`, `zh_win32_mouse_browser`, and `zh_winmain_wndproc`
      targets, migrated `zh_win32_gameengine_message_pump` to the real
      PreRTS/GameLogic/GlobalData prelude, and moved
      `win32-gameengine-message-pump-smoke`,
      `win32-gameengine-lifetime-smoke`,
      `win32-gameengine-original-lifetime-smoke`, and
      `winmain-wndproc-mouse-smoke` off explicit shim `PreRTS.h`. The next
      burn-down removed the final explicit CMake shim `PreRTS.h` source-file
      overrides from the hot runtime set: `Win32CDManager.cpp`,
      `wasm_win32_gameengine_probe.cpp`,
      `wasm_function_lexicon_runtime.cpp`,
      `wasm_module_factory_runtime.cpp`, and
      `wasm_particle_system_runtime.cpp`. Those objects now inherit the
      real-header target preludes, and a focused `ninja -t deps` audit reports
      zero hits on the seven Fable-audited shadow headers for the migrated
      direct/lifecycle objects. No explicit CMake `shims/PreRTS.h`
      force-include users remain in `WebAssembly/CMakeLists.txt`. The next
      burn-down migrated `gameengine-header-case-smoke` to the same real
      PreRTS/GameLogic/GlobalData prelude while keeping its deliberate
      case-redirect checks; it now depends on real `Common/Xfer.h`, real
      `Common/GameAudio.h`, and real `GameLogic/GameLogic.h` instead of the
      Fable-audited shadow headers. A fresh full deps count leaves
      `GlobalData.h` / `INI.h` / `STLTypedefs.h` at 23 object users,
      `GameAudio.h` at 4, and `Xfer.h` plus `GameLogic/GameLogic.h` at only
      `gameengine-common-core-smoke`. The next burn-down migrated
      `gameengine-common-core-smoke` to the real PreRTS/GameLogic/GlobalData
      prelude, original `TheWritableGlobalData` owner/path, and real INI
      runtime link order. A fresh deps audit leaves
      `GlobalData.h` / `INI.h` / `STLTypedefs.h` at 22 object users,
      `GameAudio.h` at 3, and `Common/Xfer.h` plus
      `GameLogic/GameLogic.h` at 0 active build-dep users. The next burn-down
      deleted the zero-user `Common/Xfer.h` and `GameLogic/GameLogic.h`
      shadows, redirected the odd-case GameLogic wrappers through
      `include_next`, migrated `gamenetwork-core-smoke` onto the real
      PreRTS/GameLogic/GlobalData/debug owners, and isolated the legacy
      GameClient/Bink smoke INI support into a real-header support archive so
      full `build:wasm` no longer resurrects the retired Xfer shadow. A fresh
      deps audit leaves `GlobalData.h` / `INI.h` / `STLTypedefs.h` at 21
      object users, `GameAudio.h` at 3, and no active `Common/Xfer.h` or
      `GameLogic/GameLogic.h` shadow users. The next burn-down migrated the
      three Bink runtime/browser smoke objects to the real PreRTS/header
      prelude, original `TheWritableGlobalData` owner, and original
      GlobalData/debug runtime owners, then deleted the now-zero-user
      `Common/GameAudio.h` shadow and made the verifier treat it as another
      retired stale-dependency failure. A fresh deps audit leaves
      `GlobalData.h` / `INI.h` / `STLTypedefs.h` at 18 object users and no
      active `Common/GameAudio.h`, `Common/Xfer.h`, or
      `GameLogic/GameLogic.h` shadow users. The next burn-down migrated the
      WW3D2 / WWShade mapper, texture, light, DX8Wrapper, ShatterPlanes, and
      shipped-mesh smoke batch to the real PreRTS/header prelude. A fresh deps
      audit leaves only 3 object users for each remaining shadow:
      `gameengine-real-big-smoke`, `gameengine-real-big-browser-smoke`, and
      `gamenetwork-download-manager-smoke`. The final burn-down migrated those
      three targets, deleted `shims/Common/{GlobalData,INI,STLTypedefs}.h`,
      and left a fresh deps audit with zero users of the seven retired shadow
      headers. Ongoing guard: keep `verify:cnc-port-real-headers` in the gate
      and do not add new engine-path shadow headers. This is the same
      hazard class as the confirmed d6d3b79
      ChallengeGenerals stack corruption and the fixed edgeMapperApply
      aggregate-smoke incident above — fix it once at the root instead of
      per-incident.
- [ ] Real-lifecycle residue: browser `ReleaseCrash`/`_exit` does not
      terminate the wasm runtime (teardown semantics differ from Windows);
      `TheVersion` is left null; `GameEngine::execute()` is stepped by
      per-frame RPC — move to `emscripten_set_main_loop` for continuous
      execution once the shell menu is interactive.
      The Fable game-speed correctness issue in `play.mjs` is fixed for the
      current RPC-driven human page: it now accumulates wall time and steps
      `realEngineFrameTick` on the original 30 Hz logic cadence with a bounded
      catch-up cap. Remaining here is the eventual ownership move to
      `emscripten_set_main_loop`.
- [ ] Burn down the remaining weak-symbol stubs and probe-local singletons in
      `WebAssembly/src/` as real subsystems link in — current count linked
      into cnc-port (Fable audit): 30 `__attribute__((weak))` in
      `wasm_ww3d_render_probe.cpp`, 15 in `wasm_ww3d_scene_probe.cpp`, 11 in
      `wasm_ww3d_terrain_probe.cpp`; each compiled weak body is a potential
      "real .o never pulled" trap of the 18a9ea4 class — enumerate which
      weak bodies actually won at link and gate/retire them; retire `-smoke` targets
      (and their open "promote to real ownership" TODO debt) once the real
      boot path covers what they proved. Current audit command:
      `npm --prefix WebAssembly run verify:cnc-port-weak-stubs` reports the
      explicit weak declarations compiled into the real `cnc-port` link and
      the linked strong providers with the same mangled names without claiming
      exact final body provenance (Emscripten filters wasm-ld maps and final
      wasm symbols are not enough). As of 2026-07-06 it tracks 285 explicit
      weak declarations across the direct GameNetwork/WndProc/startup probe
      files, the W3D render/scene/terrain probe files,
      `wasm_ww3d_terrain_probe_stubs.cpp`, and the archive-owned INI
      compatibility members (`wasm_real_ini_probe.cpp`,
      `wasm_real_ini_compat.cpp`, and `wasm_ini_mapped_image_compat.cpp`):
      zero compiled weak definitions, 285 gated-out declarations, zero active
      weak boundaries, zero strong-provider overlaps, and zero no-final-visible
      helpers. The GameNetwork, WndProc, startup, W3D render/scene/terrain,
      terrain-stub, and INI compatibility groups are all gated out of
      `cnc-port` by the relevant `CNC_PORT_LINKS_*` macros. The former
      `RunBenchmark` weak fallback is now replaced by the explicit
      browser-owned `wasm_benchmark_shim.cpp`; a follow-up cleanup also deleted
      six unreferenced `cnc_port_w3d_smudge_*` no-op helper bodies from
      `wasm_ww3d_terrain_probe_stubs.cpp`, and the real smudge implementation
      is linked through original `Smudge.cpp` / `W3DSmudge.cpp`. Remaining
      cleanup: keep adding any newly discovered weak-bearing linked archive
      members to the verifier, then delete obsolete probe-only weak bodies from
      sources/targets as their probe-only consumers retire.
      (Real-init already deleted the probe GameClient/Object/GameLogic/
      Display/LoadScreen/OptionPreferences reimplementations and all 26 weak
      `UNUSED_INI_BLOCK_PARSER` stubs.)
- [ ] Mount the base Generals archives (`INI.big`, `English.big`,
      `Window.big`, `Terrain.big`) when supplied, resolving the known missing
      startup set (`Data\INI\Default\*.ini`, `Rank.ini`, `CommandMap.ini`,
      `BlankWindow.wnd`). `createAudioManager` at `GameEngine.cpp:434` is now
      browser-owned: the boot constructs the original `MilesAudioManager` as
      `TheAudio`, runs real `AudioManager::init()` INI loads and
      `isMusicAlreadyLoaded()` over mounted archives plus base-Generals
      `Music.big`, and `openDevice()` through the browser MSS shim, so the
      archive-mounted frontier is now `createFunctionLexicon` at line 446
      (the linked runtime constructs `W3DFunctionLexicon`, proves its W3D
      device draw/layout tables, loads the non-network base GUI
      system/input/tooltip/widget plus IME draw callback table, registers
      representative original base layout callbacks, and now owns the original
      `ControlBarObserverSystem` callback-name lookup with original
      `ControlBarObserver.cpp` observer UI code linked, original
      `GameWinBlockInput` callback-name lookup with original
      `SelectionXlat.cpp` linked for `TheSelectionTranslator`, original
      `ExtendedMessageBoxSystem`, original W3D `MOTDSystem`, original
      `DifficultySelect` system/input/init callbacks, original
      `KeyboardOptionsMenu` system/input/init/update/shutdown callbacks with
      original `MetaEvent` global ownership, original `OptionsMenu`
      system/input/init/update/shutdown callbacks with original
      `OptionPreferences` ownership, original `SkirmishMapSelectMenu`
      system/input/init/update/shutdown callbacks, original `InGamePopupMessage`
      system/input/init callbacks with original `InGameUI` global ownership,
      original `IdleWorkerSystem`, original `BeaconWindowInput`, original
      `ControlBarInput`, original `ReplayControl` system/input callbacks,
      plus `MainMenu`/`CreditsMenu`/`SkirmishGameOptionsMenu`/
      `SinglePlayerMenu` shell callback names, and original `ChallengeMenu`
      system/input/init/update/shutdown callbacks with original
      `ChallengeGenerals` and `WindowVideoManager` ownership, plus original
      `PopupCommunicator` system/input/init/shutdown callbacks and original
      `MapSelectMenu` system/input/init/update/shutdown callbacks, original
      `ReplayMenu` system/input/init/update/shutdown callbacks, original
      `PopupReplay` input/init/shutdown modal callbacks, plus the passive
      original `GameInfoWindowSystem`/`GameInfoWindowInit` callback-name
      lookups without owning LAN game-info population, plus original
      `ControlBarSystem`/`LeftHUDInput` and
      `GeneralsExpPointsSystem`/`GeneralsExpPointsInput` callback-name lookups
      after the live skirmish command bar proved real dozer construction
      dispatch; the remaining
      `FunctionLexicon` boundary is now
      reported by startup JSON as explicit missing callback owner groups:
      save/load, score-screen/replay-save, LAN/game-network menus,
      WOL/GameSpy overlays,
      direct-connect/download menus, and in-game network menus). The same archive-backed
      boot now constructs original `W3DModuleFactory`, runs
      `W3DModuleFactory::init()`, and proves public `ModuleFactory` lookups for
      representative base gameplay, client-update, and W3D draw modules. It
      also constructs original `W3DParticleSystemManager`, links the required
      original `W3DParticleSys.cpp` / `W3DSnow.cpp` device sources, runs
      inherited `ParticleSystemManager::init()` over
      `Data\INI\ParticleSystem.ini`, and proves representative shipped
      particle-template lookups. The startup vertical now also mounts all 43
      shipped `Data\INI\Object\*.ini` definitions and runs the existing
      original `W3DThingFactory` / `ThingFactory` object-template parse runtime
      against that archive-backed set, proving 2,099 shipped templates plus
      representative Humvee/Rebel/Raptor/Overlord lookups; true
      `GameEngine.cpp:482` ownership still waits for `FunctionLexicon` to be
      fully owned;
      archiveless or music-less boots honestly stay at line 434.
- [ ] Own `createFunctionLexicon` (`W3DFunctionLexicon`, `GameEngine.cpp:446`)
      and then advance past the now-proven `createModuleFactory` (line 447) and
      `createParticleSystemManager` (line 453) toward the post-particle
      data-store stretch before `createThingFactory` (line 482) in the browser
      boot. The current
      linked runtime constructs original `W3DFunctionLexicon` and verifies the
      W3D device draw/layout callback tables plus the non-network base GUI
      system/input/tooltip/widget, IME draw, original `ControlBarObserverSystem`
      lookup, original `GameWinBlockInput`
      lookup with original `SelectionXlat.cpp` symbol ownership, original `PopupReplay`
      input/init/shutdown modal lookups, original `ExtendedMessageBoxSystem`,
      original W3D `MOTDSystem` lookup,
      original `DifficultySelect` system/input/init lookups, original
      `KeyboardOptionsMenu` system/input/init/update/shutdown lookups,
      original `OptionsMenu` system/input/init/update/shutdown lookups with
      the old `wasm_real_ini_compat.cpp` `OptionPreferences` fallback retired,
      original `SkirmishMapSelectMenu` system/input/init/update/shutdown
      lookups,
      original `InGamePopupMessage` system/input/init lookups,
      original `IdleWorkerSystem`, `BeaconWindowInput`, `ControlBarInput`,
      `ControlBarSystem`, `LeftHUDInput`,
      `GeneralsExpPointsSystem`, `GeneralsExpPointsInput`, and
      `ReplayControl` system/input lookups, original `QuitMenuSystem`, and
      original `MainMenu`/`CreditsMenu`/
      `SkirmishGameOptionsMenu`/`SinglePlayerMenu`
      system/input/init/update/shutdown lookups plus original `ChallengeMenu`
      system/input/init/update/shutdown lookups and original
      `PopupCommunicator` system/input/init/shutdown lookups plus original
      `MapSelectMenu` system/input/init/update/shutdown lookups plus original
      `ReplayMenu` system/input/init/update/shutdown lookups plus the passive
      original `GameInfoWindowSystem`/`GameInfoWindowInit` callback-name
      lookups, but full ownership
      still needs the remaining original base `FunctionLexicon.cpp` callback
      owner groups without pulling LAN/WOL/GameSpy/download/embedded-web menu
      behavior into `cnc-port`. The runtime frontier now reports those missing
      groups as structured startup state (`missingCallbackGroups`) instead of a
      hand-curated "remaining shell" label. Next promote non-network groups
      only when their real owners are linked, while leaving online/download/
      embedded-web menus at explicit browser boundaries.
      The real `W3DModuleFactory` + all 224 module registrations now reuse the
      `zh_gameengine_real_object_ini_runtime` link surface in the browser
      startup: `moduleFactoryRuntime` constructs the original module factory,
      runs `W3DModuleFactory::init()`, and verifies representative
      `findModuleInterfaceMask()` lookups. `particleSystemRuntime` constructs
      original `W3DParticleSystemManager`, runs the real
      `ParticleSystemManager::init()` INI load, and verifies 1084 shipped
      particle templates through public lookups. The startup vertical now also
      runs the archive-backed `W3DThingFactory` object-template parser over the
      full shipped object INI set and verifies representative unit templates,
      but keeps the first unowned init factory at `createFunctionLexicon` until
      the callback graph is complete; after that the next startup owner is true
      `createThingFactory` residency rather than the current focused
      object-template probe.
- [ ] Promote `PopupReplaySystem` and `PopupReplayUpdate` only after the
      ScoreScreen replay-save state is split or runtime-owned without pulling
      LAN/WOL/GameSpy into `cnc-port`. Directly registering those callbacks
      retains `LastReplayFileName` and `ScoreScreenEnableControls()` from
      original `ScoreScreen.cpp`; do not replace that with fake weak stubs.
- [ ] Promote the `ScoreScreen*` FunctionLexicon callbacks only after the
      original score-screen owner can run with real `GameState`, `InGameUI`,
      campaign/LOD, video/audio, `SkirmishBattleHonors`, and message-resource
      behavior in the linked runtime instead of the current focused movie/score
      hooks.
- [ ] Exercise the remaining broader `ControlBarSystem`/`LeftHUDInput` HUD
      behavior after the command-button and radar-click path proofs:
      player-list HUD affordances and any non-radar left-HUD mouse routing
      should run through the real in-game harness and expose state queries or
      screenshots, not isolated probes. The Generals Experience open/close
      affordance is now browser-proven in the startup vertical; purchasable
      science dispatch remains a separate item below.
- [ ] Retire the Emscripten-only runtime `FunctionLexicon` table injection
      once the command-bar/HUD callback owner TUs are naturally retained by
      the linked `cnc-port` graph; the current injected tables are
      process-lifetime storage and should stay a bounded bridge, not a second
      permanent registration path.
- [ ] Replace `WebAssembly/src/wasm_game_state_time_helper.cpp` with the
      original `Common/System/SaveGame/GameState.cpp` owner once the linked
      runtime no longer needs the focused GameLogic header boundary. The helper
      currently owns only the Win32-style `SYSTEMTIME` date/time formatting
      symbols needed by original `ReplayMenu.cpp`; full save/load and
      `GameState` snapshot behavior remain unowned.
- [ ] Promote the `SaveLoadMenu*` callbacks from original
      `GUI/GUICallbacks/Menus/PopupSaveLoad.cpp` only after the save/load,
      `GameState`, `CampaignManager`, and persistence surfaces can be
      runtime-owned without weak stubs. The callback group appears non-network,
      but it should not become a FunctionLexicon frontier claim until those
      owners are real.
- [ ] Replace the weak `LANPreferences::usesSystemMapDir()` fresh-install
      browser boundary used by `SkirmishMapSelectMenu` with a split original
      LAN preferences owner or final browser preferences storage once that can
      be done without linking the LAN lobby/GameSpy flow into `cnc-port`.
- [ ] Promote production-match object/drawable creation from the
      `WASM_REAL_INI_THING_FACTORY_METADATA_ONLY` runtime slice once the
      running `TheGameLogic`/`TheGameClient`/`TheInGameUI` match subsystems
      link. The bridge-buffer scene now browser-proves direct original
      `ThingFactory::newObject(GenericBridge)` and
      `ThingFactory::newDrawable(GenericBridge)` lifecycles under focused
      `TheGameLogic`/`ThePartitionManager`/`TheGameClient` ownership, but the
      object-INI slice still needs the full production owner instead of the
      focused bridge-scene owner.
- [ ] Exercise the original `GameWinBlockInput` left-button-release path after
      the real `GameClient` init attaches original `SelectionTranslator` to the
      message stream; the callback name now resolves in `FunctionLexicon`, but
      behavioral coverage belongs with real input/game-client ownership.
- [ ] Exercise purchasable-science dispatch from
      `GeneralsExpPointsSystem`/`GeneralsExpPointsInput` once a player state
      with an enabled science choice is reachable. The panel open/close,
      `GenExpFade`, and Done-button visibility state are now browser-proven;
      remaining coverage should verify enabled science button state,
      `MSG_PURCHASE_SCIENCE` dispatch, and player science/rank-point updates.
- [ ] Replace the weak browser boundaries for `BattleHonorTooltip`,
      `InsertBattleHonor`, `ResetBattleHonorInsertion`,
      `playerTemplateComboBoxTooltip`, and `playerTemplateListBoxTooltip`
      once the online-heavy `PopupPlayerInfo`/WOL menu owner can be split or
      linked without pulling the ignored GameSpy surface into `cnc-port`.
- [ ] Align the `bridge.js` JS-side simulation IMA ADPCM decoder with the wasm
      `Mss.H` decoder (full-precision `((2*delta+1)*step)>>3` variant proven
      bit-exact vs ffmpeg) and re-pin the `runtime_archives_smoke.mjs` decoded
      stats that currently assume the shift-add variant.

---

## M0 — Build skeleton & asset pipeline

### Asset pipeline
- [ ] Make `extract_zh_runtime_archives.sh` safe for parallel smoke-test
      invocations, or serialize the npm scripts that call it. Concurrent
      terrain smokes can race while extracting the shared loose `Data1.cab`
      payload and fail with `errno=17` even when the renderer path itself is
      healthy.
- [ ] Make `tools/build_wasm.sh` safe for parallel smoke-test invocations, or
      serialize npm scripts that share `WebAssembly/build/wasm`. Concurrent
      `build:wasm` runs can race during CMake/Ninja regeneration and fail with
      `ninja: error: failed recompaction` before the harness code runs.
- [ ] Investigate the browser-stage hang in `test:runtime-archives-browser`.
      On 2026-07-02, `timeout --kill-after=15s 300s npm --prefix WebAssembly
      run test:runtime-archives-browser` reached
      `harness/runtime_archives_smoke.mjs` and exited 124 with
      `page.evaluate: Target crashed`; the focused startup vertical still
      proves the W3D particle-system startup runtime. A later 2026-07-02
      `test:vertical-integrations` attempt also reached
      `harness/runtime_archives_smoke.mjs` after startup vertical passed and
      stayed silent until manually interrupted.

---

## M1 — Compile the platform-independent core

### Compatibility shims
- [ ] DirectX 8 / DX90SDK header shim so engine code that includes it compiles.
- [ ] Win32 type/macro shim (`HWND`, `DWORD`, `__cdecl`, `LARGE_INTEGER`, etc.).
- [ ] STLport → libc++ migration pass (apply/replace `stlport.diff` as needed).
- [ ] Replace/neutralize MSVC-specific pragmas, `__forceinline`, SEH, inline asm.
- [ ] Replace the current browser `FastCriticalSectionClass` spin lock with a
      pthread-aware yield/wait path before enabling shared-memory wasm threads.
- [ ] Continue the legacy enum-forward audit for the remaining original
      GameLogic/Object/Team/Thing headers, using fixed underlying types or
      real definition includes where the original enum contract is known.
- [ ] Audit 32-bit assumptions: struct packing, `int`/`long` sizes, alignment.
- [ ] Define and verify the browser-port `WCHAR`/UTF-16 compatibility contract
      before compiling wide-string serialization and save/load paths. The
      original chunky-map `UnicodeString` path now reads/writes explicit
      16-bit little-endian code units for wasm, but the broader contract still
      needs coverage for every save/load and network structure that embeds wide
      strings. The
      focused LANAPI join/options and game-start verticals currently use an
      Emscripten active-message-prefix send path because 4-byte wasm
      `WideChar` makes `sizeof(LANMessage)` exceed the original 476-byte UDP
      packet cap.
- [ ] Endianness audit for serialization paths (save game, net, CRC).

### Libraries (compile as-is where possible)
- [ ] Full `Compression` manager (RefPack/zlib/LZH/etc.) compiles and is
      unit-checked against real BIG data.
- [ ] Restore or port the missing bundled `Compression/ZLib` and
      `Compression/LZHCompress/CompLibSource` bodies so the existing
      `CompressionManager` zlib and Nox LZH branches can be enabled under wasm.
- [ ] Decide whether `CPUDetectClass` should expose browser
      `hardwareConcurrency`/device-memory hints later, or keep reporting only
      the conservative wasm capability contract.
- [ ] Retire the target-local `WebAssembly/shims/mutex.h` class definitions
      once the broad focused targets link `zh_wwlib_mutex` wherever they use
      original `MutexClass` / `CriticalSectionClass` out-of-line methods.
- [ ] Re-target original WWLib `ThreadClass::Execute`/`Stop` to the final
      browser pthread/Web Worker contract before enabling GameSpy, audio, or
      file worker threads; the current `_UNIX` wasm build intentionally keeps
      native thread start idle.
- [ ] Retire the browser-only narrow `Win32Mouse`/`Mouse` shim used by the
      `cnc-port` WndProc harness once the main executable can link the full
      original GameClient mouse/control-bar surface without duplicate command
      button runtime symbols.
- [ ] Decide whether original WWLib mono debug output should remain dormant in
      browser builds or route through the harness/browser console before
      relying on it for runtime diagnostics.
- [ ] Port the full optimizing original LCW back-reference compressor if
      compressed-output size parity becomes required; the current non-MSVC
      fallback emits valid LCW literal packets accepted by the original
      decompressor.
- [ ] Replace the current browser no-resource/no-registry WWLib fallbacks with
      a real resource lookup and persistence contract before relying on
      `ResourceFileClass` or `RegistryClass` for runtime settings/data.
- [ ] Drive original URL-launching UI flows through the browser
      `LaunchWebBrowser` bridge once the relevant shell/WOL/embedded-browser
      menu callbacks are runtime-owned; current coverage proves the direct
      WWLib call crosses to `window.open`.
- [ ] Compile remaining original WWLib DirectDraw-backed 2D conversion helpers
      (`convert.cpp`, `dsurface.cpp`) after the browser `DSurface`/pixel-format
      abstraction is defined, instead of stubbing draw behavior.
- [ ] Add a render-backed `WWFontClass::Print` smoke once the original
      `ConvertClass`/`DSurface` pixel conversion path is available under wasm.
- [ ] Full `WWVegas/WWLib` (containers, string, ini, file abstractions)
      compiles.
- [ ] Full `WWVegas/WWDebug` (`wwmemlog.cpp`, `wwprofile.cpp`) compiles and
      routes asserts/logs to the browser console/harness.
- [ ] Retire or narrow the current generic `wwprofile.h` no-op macro shim once
      all profile consumers link the original profiling manager target.

### GameEngine — Common
- [ ] Link and smoke-test original `Common/Xfer` and save-game behavior after
      `GameState`, `GameStateMap`, real `GlobalData`, browser persistence, and
      the full snapshot subsystem can link into the runtime.
- [ ] Link and smoke-test the remaining real-header memory/archive/system
      leaves after the browser audio and persistence singleton contracts replace
      the current target-local smoke globals.
- [ ] Finish replacing temporary probe-local `FileSystem` consumers with the
      browser-owned archive/audio singleton contracts. The browser runtime now
      harness-proves persistent `TheFileSystem`/`TheLocalFileSystem`/
      `TheArchiveFileSystem`/`TheNameKeyGenerator` ownership over registered
      fetched archives; music archive load/unload, persistence, and full
      original engine startup consumption remain open.
- [ ] Extend the browser MEMFS real-asset smoke from `INIZH.big` to the exact
      minimum boot archive set once engine startup uses fetched archives.
- [ ] Re-run original `DataChunkOutput` write/temp-file coverage after the real
      `GlobalData` user-data directory and browser persistence layer replace
      the remaining focused local smoke globals.
- [ ] Link and smoke-test original release-crash reporting and function-lexicon
      callback lookup after browser assert/dialog routing, `GameWindowManager`,
      and the real GUI callback runtime are linked without compile-only
      prompt/window shims.
- [ ] Link and smoke-test `DynamicAudioEventInfo` after original
      `INIAudioEventInfo`/`AudioEventInfo` metadata, the original INI parse
      surface, and the real audio manager path are available without
      target-local stubs.
- [ ] Link and smoke-test `MusicTrack` / `MusicManager` behavior after the
      missing original `MusicTrack` constructor path is resolved and the real
      audio manager request path is available.
- [ ] Link and smoke-test the original `GameAudio` / `GameSounds` manager
      paths after the real audio manager, object lookup, INI reader, Xfer, and
      GameLogic singleton surfaces replace the current target-local shims.
- [ ] Link and smoke-test the original audio INI parser routes after the real
      `Common/INI.cpp` reader, audio manager, and full runtime singleton
      surface are available without target-local parser stubs.
- [ ] Replace the focused browser INI runtime's weak fail-fast unused INI block
      parser definitions with the real parser destinations as each owning
      singleton comes online; they exist only to keep the focused `Armor`,
      `GameData`, `Science`, `SpecialPower`, `Multiplayer`, `Water`, `Weather`,
      `Video`, `Upgrade`, and shipped map-cache preflights on original
      `INI.cpp::load`
      without pulling unrelated UI/terrain/object managers into `cnc-port`.
- [ ] Replace the focused shipped special-power runtime's weak `TheAudio`
      compatibility singleton and Emscripten-only null audio-info guard with the
      real browser audio manager once audio event metadata and playback are
      linked; the current preflight preserves event names but does not populate
      `AudioEventInfo`.
- [ ] Replace the focused shipped special-power runtime's weak `TheControlBar`
      compatibility singleton with original ControlBar/UI ownership once the
      control-bar runtime can link without compile-only UI dependencies.
- [ ] Replace the focused shipped map-cache runtime's local `TheMapCache` and
      `TheKey_InitialCameraPosition` compatibility definitions with the original
      `MapUtil.cpp` / `WorldHeightMap.cpp` ownership once those runtime surfaces
      can link without compile-only UI/map-loader dependencies.
- [ ] Replace the focused shipped water runtime's weak `TheTerrainVisual`
      compatibility definition with original `TerrainVisual.cpp` ownership once
      terrain visual/map-loading runtime surfaces can link without renderer
      dependencies.
- [ ] Replace the focused shipped player-template runtime's weak
      `TheMappedImageCollection` compatibility definition with original mapped
      image collection ownership once mapped image/UI asset loading is linked;
      the current preflight verifies public template metadata but does not
      resolve private image IDs to `Image` instances.
- [ ] Wire DamageFX preflight lookup against the loaded startup `FXListStore`
      and replace the weak `Object::getVeterancyLevel` bridge with original
      object / experience ownership once FX playback and object runtime can
      link without renderer/audio/gameplay stubs.
- [ ] Link and smoke-test the original map-data INI parse route
      after the real `Common/INI.cpp` reader and its destination
      manager/singleton are available without target-local parser stubs.
- [ ] Link and smoke-test the original command-button INI parser route after
      the real `Common/INI.cpp` reader, ControlBar, and SpecialPowerStore
      singleton surfaces are available without target-local parser stubs.
- [ ] Expand command-button parser preflight from the focused shipped
      upgrade/special-power subset to full `CommandButton.ini` coverage after
      real `ThingFactory` / `ThingTemplate` object-template resolution is
      available; the current coverage intentionally avoids `Object =` command
      buttons until that dependency is real.
- [ ] Expand command-set parser preflight from focused
      `AmericaInfantryRangerCommandSet` coverage to full `CommandSet.ini`
      coverage after full command-button and object-template resolution is
      available.
- [ ] Expand crate parser preflight from the focused shipped `CrateData`
      subset to full `Crate.ini` after real `ThingFactory` / `ThingTemplate`
      object-template parsing can consume the file's `Object` blocks without
      target-local parser stubs.
- [ ] Decide the browser replacement contract for original Windows Media
      playback before compiling `Common/Audio/simpleplayer.cpp`; the shell URL
      helper now compiles and browser-smokes through `window.open`, but
      `simpleplayer.cpp` still requires `wmsdk.h`, wave-output types, and
      browser-safe media playback behavior.
- [ ] Compile original `Common/Audio/GameSpeech.cpp` after the WPAudio
      attribute header/backend dependency is replaced with the browser audio
      contract.
- [ ] Restore or locate the original WPAudio public headers and dependent WSys
      / ASIMP3 decoder headers referenced by the checked-in WPAudio project and
      sources (`wpaudio/*.h`, `wsys/File.h`, `asimp3/mss.h`,
      `asimp3/mp3dec.h`) before compiling original WPAudio or the
      WPAudio-backed `GameSpeech` path; do not synthesize replacement structs
      solely for compile coverage.
- [ ] Link and smoke-test original energy and production-prerequisite runtime
      behavior after real `Player`, `ThingFactory`, `ThingTemplate`, object,
      and science ownership paths link without target-local shims.
- [ ] Link and smoke-test `Money` deposit/withdraw runtime side effects after
      the deeper audio, `Player`/`Thing`, academy stats, and
      `StealthUpdate` economy paths can link without target-local GameLogic
      singleton shims.
- [ ] Link and smoke-test original `PlayerList` behavior after real `Player`,
      `Team`, `TunnelTracker`, control-bar, and GameLogic player ownership
      dependencies replace the current compile-only surface.
- [ ] Link and smoke-test original RTS action/team/score/academy behavior after
      the full `Player`, `Thing`, object, `GameLogic`, control-bar, and UI
      surfaces replace the current compile-only frontier.
- [ ] Link and smoke-test original `Common/StateMachine.cpp` save/load behavior
      after `ObjectID` / `Coord3D` xfer routes are verified in the linked
      runtime.
- [ ] Link and smoke-test original message-stream behavior after the real
      `Thing`, player/list, recorder, InGameUI, GameLogic, and network command
      dependencies replace the current compile-only surface.
- [ ] Replace the focused command-line runtime's local
      `DX8Wrapper_PreserveFPU` compatibility definition with the original W3D
      DX8 wrapper state once the W3D runtime links into `cnc-port`.
- [ ] Replace the Emscripten no-op `UserPreferences::load()`/`write()`
      boundary in original `Common/UserPreferences.cpp` with real browser
      settings storage. The old main-runtime `OptionPreferences` compatibility
      fallback has been retired in favor of the original `OptionsMenu.cpp`
      owner.
- [ ] Replace the Emscripten no-op local `IPEnumeration` boundary with the
      final browser networking/local-address contract once LAN/GameSpy
      networking is in scope. The current browser path returns no native local
      addresses so startup preference reads do not enter WinSock/DNS code.
- [ ] Enable and route `MiniLog.cpp`'s `DEBUG_LOGGING` body to the browser log
      or harness once the real `GameLogic` frame counter is available.
- [ ] Re-enable and compile the active `INCLUDE_GRANNY_IN_BUILD` code path in
      original `W3DGranny.cpp` after the Granny SDK surface, WW3D render-object
      dependencies, and browser asset/texture bindings have a real port
      contract.
- [ ] Replace the compile-only `W3DDisplay.cpp` display construction, display
      mode, gamma, window-state, front-buffer screenshot/movie-capture, and
      Direct3D render paths with browser canvas/WebGL2/WebGPU behavior, then
      verify the original display loop through harness screenshots.
- [ ] Replace the remaining browser no-op cursor-file loading and cursor
      presentation policy (`LoadCursorFromFile`, CSS cursor vs engine cursor)
      before relying on original `W3DMouse.cpp` runtime cursor artwork.
- [ ] Replace the compile-only `Water/W3DWater.cpp` D3DX/Direct3D shader,
      render-target, reflection, grid, river-water, and water-track integration
      paths with real WebGL2/WebGPU-backed behavior, then verify the original
      water renderer through harness screenshots.
- [ ] Replace the compile-only WW3D2 `BrowserEngine.h`/`dx8webbrowser.cpp`
      declaration surface with a browser DOM/iframe, external-link, or
      texture-backed embedded-web contract before enabling original embedded
      browser panes at runtime. Runtime browser ports are also still needed
      for the compiled Direct3D wrapper, WWAudio/Miles playback, GDI text
      rasterization, Video-for-Windows frame grabbing, Surrender
      renderer/object behavior, and `ww3d.cpp`
      screen-capture/render-device paths instead of substituting renderer
      behavior.
- [ ] Replace the compile-only `Mss.H` Miles surface, dummy Win32 event
      handles, and `_beginthread` delayed-release-thread trap used by
      `WWVegas/WWAudio` with browser Web Audio scheduling/decoding and a real
      wasm-safe release/timer contract before linking WWAudio into runtime
      audio paths.
- [ ] Map original `WWVegas/wwshade` D3DX shader assembly, Direct3D shader
      creation, shader constants, and material/render-state application to the
      browser renderer pipeline, using the generated headers from original
      shader text without inventing shader data.
- [ ] Replace `Win32OSDisplay.cpp`'s current browser stderr/no-op message-box
      compatibility with a real browser/harness OS-display dialog/error
      reporting contract before relying on runtime warning prompts.
- [ ] Remaining `Common/RTS`, `Thing`, and `Audio` interfaces compile without
      target-local parser/Xfer/GameLogic shims.

### GameEngine — GameClient / GameLogic / GameNetwork (headers + logic)
- [ ] `GameLogic` (AI, Object, ScriptEngine, Map, System) compiles.
- [ ] Replace the declarative wasm GameSpy GP / Peer / gpersist compile-surface
      headers with real browser networking bindings when enabling runtime
      GameSpy matchmaking, chat, presence, and persistent stats.
- [ ] `GameClient` (Display, Drawable, GUI, Input, InGameUI, Terrain) compiles.
- [ ] Verify `GlobalLanguage::init`, the CSF/string-file path, and local-font
      loading against real fetched assets after original `Common/INI` and
      browser `FontFace`/fetch loading replace the current compatibility
      no-ops.
- [ ] Replace the focused MainMenu/GameText `g_csfFile` lowercase path override
      once browser archive/file lookup fully preserves the original Windows
      case-insensitive CSF path contract (`data\%s\Generals.csf` versus the
      indexed `data\english\generals.csf` entry).
- [ ] Link and smoke-test original campaign progression/save-load behavior
      after the real campaign INI reader, `Xfer::xferSnapshot`, and full
      GameClient singleton surface are available without target-local stubs.
- [ ] Link and smoke-test original radius-decal behavior after the deeper
      Player/Team/Module/Object/GameLogic contracts are available through
      original headers and rendering can be harness-driven.
- [ ] Link and smoke-test original hint/ray-effect behavior after the real
      InGameUI, GameClient, drawable/display, object, and browser render/input
      paths are available and harness-driven.
- [ ] Link and smoke-test the original GameClient message translators,
      selection info, EVA/FX list, control-bar scheme/core/commands/leaves,
      in-game chat, `GameClient`/`InGameUI`/mouse/IME entry points,
      load/shell/keyboard/skirmish/LAN/game-info/map/quit/popup/replay/WOL
      menu behavior, particle/terrain/drawable/update/smudge behavior, audio
      debug display behavior, and GameClient dispatch after real `GameLogic`,
      `MessageStream`, input, FX/display, GameInfo/LAN, and original
      INI/GlobalData/Xfer runtime paths replace the current target-local
      compile bridges.
- [ ] Replace the current compile-only WOL browser boundary
      (`wasm_webbrowser_boundary.h`, force-included before the original
      `GameNetwork/WOLBrowser/WebBrowser.h`) with a browser DOM/iframe or
      external-link contract before running the original WOL ladder/login/
      welcome browser panes or URL definitions at runtime.
- [ ] Replace the compile-only `_spawnl` no-spawn process fallback with an
      explicit browser policy for the Main Menu WorldBuilder button before
      driving that menu at runtime.
- [ ] Replace the current keyboard `GetKeyboardLayout` fallback and static
      layout table assumptions with a browser `KeyboardEvent.code` /
      locale-aware translation surface before considering keyboard behavior
      runtime-complete.
- [ ] Replace the current compile-only Win32 IMM/replay file-copy shims with
      browser DOM composition events and browser save/export flows before
      considering IME or replay export behavior runtime-complete.
- [ ] Link and smoke-test original window animation behavior through real or
      shimmed `GameWindow` instances once the browser input/render path can
      drive and observe them; current coverage is compile-only for the window,
      manager, transition, and processor sources.
- [ ] Exercise/link original `GameClient/Display.cpp` display methods against
      the browser display device layer; the current utility target has compile
      coverage only and no rendering is considered complete without harness
      screenshots/state checks.
- [ ] Link and smoke-test original `GameNetwork/FrameMetrics.cpp` FPS sampling
      and latency response after the browser display/FPS surface and real
      `GlobalData` singleton are available.
- [ ] Link and smoke-test original `GameNetwork/Connection.cpp` receive
      behavior after browser transport receive dependencies are available.
- [ ] Link and smoke-test original `GameNetwork/FileTransfer.cpp` transfer flow
      after `GameInfo`, `Shell`, `LoadScreen`, and the browser
      network/file-transfer path are available.
- [ ] Replace original WWDownload raw FTP/WinSock transport with a browser
      fetch/proxy/update-download contract before patch/download runtime flows
      are considered functional.
- [ ] Harness-test original `GameNetwork/DownloadManager.cpp` through the
      browser download transport and update UI callback surfaces once the
      fetch/proxy/update-download contract exists.
- [ ] Link and smoke-test the broader GameNetwork command-message and
      connection-manager slice after the real player/message game-command
      reconstruction, ack packet paths, game-start progress, and browser
      transport dependencies are available beyond the currently smoke-tested
      control packet surface.
- [ ] Link and smoke-test original GameNetwork setup/LAN/config behavior after
      the real `GlobalData`, `MapCache`, `MultiplayerSettings`,
      `PlayerTemplateStore`, `GameText`, `LANAPI`, `NetworkInterface`,
      disconnect UI, and GameLogic frame state surfaces replace the current
      compile-only singleton surface.
- [ ] Link and smoke-test original `GameNetwork/LANAPICallbacks.cpp` after the
      real `GameLogic::isInGame`, LAN UI, game setup, and transport callback
      surfaces are available; current coverage is compile-only.
- [ ] Replace the declarative legacy `GameNetwork/GameSpy.h` /
      `TheGameSpyChat` compile bridge with the real browser GameSpy chat/GP
      runtime binding before running the original legacy chat callbacks or GP
      error/status callbacks.
- [ ] Audit original `GameNetwork/GameSpyGameInfo.cpp` before runtime GameSpy
      integration; it is explicitly obsolete in the current source tree and
      conflicts with the newer `GameSpy/StagingRoomGameInfo` path.
- [ ] Link and smoke-test original GameSpy thread queue behavior after browser
      Worker/pthread scheduling, GP/Peer/QR2/Stats runtime bindings,
      ICMP/socket fallbacks, and harness state probes are available; current
      coverage is compile-only.
- [ ] Replace the temporary no-op GameSpy `ghttp` compile shim with a browser
      fetch/proxy/update-check contract before running original Main Menu or
      Options Menu online/update flows.
- [ ] Resolve link order; produce a wasm archive of the core (no devices yet).

---

## M2 — Boot to a black window

- [ ] Replace the skeleton wasm boot module with original engine Emscripten
      initialization.
- [ ] Promote the `CreateGameEngine` frontier from probe-only to real browser
      startup ownership: link original `Win32GameEngine` construction with
      owned original `GameEngine.cpp` singleton/destructor lifetime, then
      advance `GameEngine::init()` only as far as the first real browser-owned
      device factory (`createAudioManager` / `TheAudio`) instead of adding more
      source-only Win32 probes. The focused lifetime smoke still proves original
      `Win32GameEngine` construction/destruction over a minimal browser-owned
      `GameEngine` surface, and `win32-gameengine-original-lifetime-smoke` now
      links full original `GameEngine.cpp`, original `Win32GameEngine.cpp`,
      original `SubsystemInterface.cpp`, and original
      `Drawable::killStaticImages()` (plus original `Science.cpp` /
      `RankInfo.cpp` vtable owners) to prove constructor/destructor teardown
      calls `TheGameResultsQueue->endThreads()` without entering `init()`.
      The browser `win32GameEngineProbe` now constructs the original
      `Win32GameEngine` in Chromium over the focused browser `GameEngine`
      lifetime, assigns the instance to `TheGameEngine`, dispatches
      `Win32GameEngine::serviceWindowsOS`, deletes it, and clears the singleton;
      the startup frontier marks `CreateGameEngine` ready while still requiring
      full original `GameEngine.cpp` init consumption and startup singleton
      teardown contracts before `createAudioManager`. `test:startup-vertical`
      now also boots the wasm
      harness in Chromium and asserts the browser-visible original
      `GameEngine.cpp` startup frontier still stops at
      `createAudioManager` line 434 with no runtime archives mounted, so the
      focused C++ smokes cannot drift away from the actual browser boot state.
      The original lifetime smoke now assigns the constructed original
      `Win32GameEngine` to the global `TheGameEngine`, proves the owned pointer
      before `init()`, tears down through the original destructor, and clears the
      singleton afterward; `test:startup-vertical` gates that ownership/release
      contract. The browser-visible `deviceFactoryFrontier` now also exposes
      the original pre-audio ownership sequence for `GameEngine.cpp` lines 314,
      327, 338, and 381 through `preAudioInitOwnership`, so
      `TheNameKeyGenerator`, `TheCommandList`, `XferCRC("lightCRC")`, and
      `parseCommandLine` readiness are checked before the still-unowned
      `createAudioManager` call. `test:vertical-integrations` now runs that
      startup vertical as an aggregate gate before the archive, audio,
      networking, rendering, and video verticals, so original
      `GameEngine.cpp`/`Win32GameEngine` lifetime drift is visible in the
      default cross-subsystem run.
- [ ] Advance beyond `createAudioManager` through a real W3D GUI/display
      ownership slice before marking `createFunctionLexicon` or
      `createModuleFactory` runtime-ready. The current focused
      `w3d-gamewindow-manager-smoke` owns `GlobalData`,
      `SubsystemInterfaceList`, a focused `Display`, `FontLibrary`, and the
      original `W3DGameWindowManager`, then proves original `winCreate` allocates
      `W3DGameWindow` and original `gogoGadgetPushButton` installs the W3D draw
      callback. `test:startup-vertical` now gates the focused
      `Win32GameEngine` lifetime, full original `GameEngine.cpp`
      constructor/destructor lifetime, original `MilesAudioManager::openDevice`,
      and W3D game-window ownership smokes together so cross-subsystem startup
      drift is visible. The focused `w3d-window-layout-script-smoke` now runs
      original `WindowLayout::load("Menus/BlankWindow.wnd")`, original
      `GameWindowManager::winCreateFromScript`, original `.wnd` layout-block /
      window parsing, and original `W3DFunctionLexicon::init()` lookup for
      `W3DMainMenuInit`; it also mounts real `WindowZH.big` with original
      `Win32BIGFileSystem`, loads `Menus/MessageBox.wnd` and
      `Menus/QuitMessageBox.wnd`, links original `MessageBox.cpp`, and proves
      parsed `MessageBoxSystem`, `QuitMessageBoxSystem`, and
      `PassMessagesToParentSystem` ownership through original window callback
      pointers. It now also constructs original `Shell`, drives
      `Shell::showShell -> Shell::push`, loads real `Menus/MainMenu.wnd` from
      `WindowZH.big`, verifies `MainMenu.wnd:MainMenuParent` creation and
      `MainMenuSystem` binding, runs the W3D layout-init callback name, and
      pops the shell stack cleanly through original `Shell::popImmediate`.
      It now links original `W3DMainMenu.cpp`, original `MainMenu.cpp`, and
      original `Mouse.cpp`, then proves the original `W3DMainMenuInit` layout
      callback executes original `MainMenuInit` first-run state mutation
      (`m_breakTheMovie`, mouse visibility, `FadeWholeScreen`, focus, and
      dropdown hides), original `MainMenuSystem(GWM_INPUT_FOCUS)`, and the
      first original `MainMenuUpdate` idle frame under focused shell
      `GameLogic` state while counting the message-box/HTTP/GameSpy tick
      boundaries and avoiding download, transition, and game-start branches. It
      still uses focused display/font/text shims and no-op branch boundaries for
      undriven campaign/GameSpy/download/options paths, so full production
      `W3DDisplay` construction still needs original public-API runtime proof.
      The linked `cnc-port`
      startup now constructs original `W3DFunctionLexicon` and verifies its W3D
      device callback-name lookups, but the base `FunctionLexicon` callback
      tables remain the honest `createFunctionLexicon` blocker.
      `verify:w3d-module-factory-frontier`
      now pins the original
      `Win32GameEngine::createModuleFactory -> W3DModuleFactory` mapping,
      `GameEngine.cpp` call site, and all 19 original W3D draw-module
      registrations through the public `ModuleFactory` lookup internals; the
      startup vertical now performs the corresponding browser runtime proof by
      running original `W3DModuleFactory::init()` and checking public
      `findModuleInterfaceMask()` results for base gameplay, client-update, and
      W3D draw modules. Advance the next vertical slice outside the
      already-proven shell menu path unless a new menu flow is driven through
      real original input/navigation and asset loading.
      `test:vertical-integrations` now gates runtime archive preload/startup
      asset consumption, range-backed startup archive delivery, WindowZH-backed
      MainMenu dropdown/back and CreditsMenu layout callbacks, mapped-image
      W3DDisplay rendering, composed W3DDisplay scene + real shell UI art + GameText
      rendering, and shipped W3D mesh rendering together so cross-subsystem
      regressions are visible; the browser-pixel repaint path now also includes
      archive-loaded shell `WindowLayout` coverage via
      `test:ww3d-window-layout-repaint`, so the next rendering slice should move
      to terrain first pixels or fuller main-menu composition instead of another
      focused shell-layout smoke. The
      focused `w3d-window-layout-script-smoke` now also sends a real
      `ButtonSinglePlayer` `GWM_LEFT_DOWN`/`GWM_LEFT_UP` pair through original
      `GameWindowManager::winSendInputMsg` and `GadgetPushButton`, then proves
      original `MainMenuSystem(GBM_SELECTED)` unhides the single-player
      dropdown and stops at the transition boundary without pushing campaign or
      skirmish screens. It then runs one original `MainMenuUpdate` to clear the
      transition lock and drives `ButtonSingleBack` through the same input path
      to prove return navigation to the main dropdown. It now also drives
      `ButtonLoadReplay` and `ButtonLoadReplayBack` through the same original
      input path, proving the load-replay dropdown transition and return stay
      inside the `MainMenu.wnd` shell layout. It now also drives `ButtonUSA`
      into the original `MainMenuDifficultyMenuUS` transition and drives
      `ButtonDiffBack` through `MainMenuSinglePlayerUSAMenuFromDiff` while
      recording the local `CampaignManager` boundary. It now also mounts real
      `INIZH.big`, loads `Menus/CreditsMenu.wnd` and `Data\INI\Credits.ini`,
      drives `ButtonCredits` through the original input path, lets
      `MainMenuUpdate` complete the pending `Shell::push`, and verifies
      original `CreditsMenuInit`, `CreditsMenuUpdate`, CreditsManager
      creation/loading, the local `AudioManager` device boundary, and clean
      `CreditsMenuShutdown` teardown.
- [ ] Advance the startup singleton frontier from browser-owned residency to
      original startup consumption: after the base `GameLODPresets.ini` source
      is mounted, load `GameLODManager` through the durable startup owner and
      only then exercise the original `SubsystemInterfaceList::initSubsystem`
      mutation path and verify the next blocker is `createAudioManager`. Keep
      `Maps\MapCache.ini` loading deferred to its original post-audio
      `GameEngine.cpp` point (`MapCache::updateCache` at line 607).
      `test:vertical-integrations` now asserts the runtime and range-backed
      startup archive paths keep `SubsystemInterfaceList` ready, make
      `GameLODManager` readiness depend on mounted base `INI.big`
      (`GameLODPresets.ini`), keep `MapCache` deferred, and preserve
      `createAudioManager` as the first unowned factory. The same mounted
      archive gates now require durable `TheCommandList` ownership and an
      original `XferCRC("lightCRC")` open with initial CRC zero before marking
      startup singleton residency ready.
- [ ] Prove the startup singleton shutdown/destructor path through the original
      `GameEngine.cpp` allocator/free lifetime after archive preflight is safe.
      A direct `MSGNEW`/`delete` probe for durable `GlobalData`,
      `SubsystemInterfaceList`, `GameLODManager`, and `MapCache` currently
      corrupts the wasm memory pool after the mounted-archive boot logs the
      singleton state, so the bootstrap keeps heap-backed residency, defers
      subsystem-list shutdown proof until base startup files exist, and does not
      yet free those owner blocks.
- [ ] Emscripten entry point replacing `Main/WinMain.cpp` (`main()` + main loop).
- [ ] `emscripten_set_main_loop` driving the engine tick at fixed timestep.
- [ ] Canvas + GL context creation (no draw yet); resize handling.
- [ ] Engine `init()` runs to completion without crashing.
- [ ] Graceful handling of missing assets (clear error, not a hang).
- [ ] Harness: boot → confirm engine reached init → screenshot (black is fine).

---

## M3 — File / data subsystem (real data)

### File system device (Win32Device/Common → browser)
- [ ] Re-target `Win32LocalFileSystem`/`Win32LocalFile` onto MEMFS/IDBFS.
- [ ] Re-target `Win32BIGFileSystem`/`Win32BIGFile` to read fetched BIG archives.
- [ ] Thread the now-inventory-clean base startup archive set through real
      `GameEngine.cpp` startup ownership instead of focused preflight/RPC
      assertions. With base `INI.big`/`English.big`/`Window.big` mounted,
      `Rank.ini`, `Data\INI\CommandMap.ini`, the default startup INIs, audio
      startup INIs, and `Window\Menus\BlankWindow.wnd` are present; remaining
      work is real owner consumption and removal of focused adapters.
- [ ] Async asset loading (fetch BIGs) without blocking the main loop (Asyncify
      or preload into FS before boot).
- [ ] Stub/neutralize `Win32CDManager` (no CD in browser; satisfy CD check).
- [ ] Persistence: user prefs / saves to IDBFS.

### Data load with original code
- [ ] Load real `INIZH.big`; original INI parser reads it (objects, weapons,
      locomotors, armor, FX, command sets/buttons, control bars, science, etc.).
- [ ] Replace the wasm OCL metadata-only creation guards with full runtime object
      creation once `ThingFactory`, `GameLogic`, `PartitionManager`, terrain,
      Drawable/FX/audio ownership, and object template loading are linked through
      the real startup path.
- [ ] Load the original default + shipped special-power sequence
      (`Data\INI\Default\SpecialPower.ini` then
      `Data\INI\SpecialPower.ini`) through `SpecialPowerStore::init` / full
      `GameEngine.cpp` startup now that the base archive source is available.
- [ ] Load the original default + shipped player-template sequence
      (`Data\INI\Default\PlayerTemplate.ini` then
      `Data\INI\PlayerTemplate.ini`) through `PlayerTemplateStore::init` /
      full `GameEngine.cpp` startup now that the base archive source is
      available.
- [ ] `GameText`/string tables load (CSF/GameText) for the chosen language.
- [ ] Load the original default + shipped water sequence
      (`Data\INI\Default\Water.ini` then `Data\INI\Water.ini`) through the full
      `GameEngine.cpp` startup path with xfer CRC once engine init consumes the
      mounted archive set.
- [ ] Load the original default + shipped weather sequence
      (`Data\INI\Default\Weather.ini` then `Data\INI\Weather.ini`) through the
      full `GameEngine.cpp` startup path with xfer CRC once engine init consumes
      the mounted archive set.
- [ ] Load the original default + shipped video sequence
      (`Data\INI\Default\Video.ini` then `Data\INI\Video.ini`) through
      `VideoPlayer::init` / full `GameEngine.cpp` startup now that the base
      archive source is available.
- [ ] Map cache rebuilds/scans live system and user map directories through
      original `MapCache::updateCache`, including `.map` parsing, CRC/file-info
      checks, user-data persistence, and browser MEMFS/IDBFS behavior.

---

## M4 — First pixels (W3D → WebGL2)

### WW3D2 device bring-up
- [ ] Map W3D render device init onto the WebGL2 context.
- [ ] Texture upload: DDS/DXT decode (or transcode) → GL textures; mipmaps.
- [ ] Extend browser D3D8 volume texture support to compressed DDS volume
      uploads and shader sampling if original W3D assets exercise
      `VolumeTextureClass` beyond the verified uncompressed
      `D3DXCreateVolumeTexture` / `LockBox` / `SetTexture` path.
- [ ] Remaining D3D8 render-state mapping beyond the current
      cull/depth/blend/alpha-test/color-write/texture-factor/stencil/fog/
      fill-mode/z-bias/shade-mode, lighting/ambient capture, and
      `D3DMATERIAL8` material capture/material-source descriptor coverage,
      including fixed-function lighting beyond enabled directional
      diffuse+ambient lights (broader spot-light variants beyond the verified
      hard-cone and quadratic mid-penumbra falloff proofs, broader original
      W3D point-light attenuation variants beyond the verified linear and
      pure quadratic point-light proofs plus the verified finite-range clip
      and mixed coefficient proofs, lit material-source variants beyond the
      verified diffuse/ambient `COLOR1` path, the specular-source D3D8
      parity proof, and the original-runtime WW3D emissive/`COLOR2` proof,
      and other fixed-function lighting/render-state variants) and other W3D
      draw states → GL/shader state.
- [x] Audit D3D8 `ZBIAS` enum/range fidelity against the official DX8 docs
      and d3d8to9/dxvk references: resolved by the draw-order fix (commit
      33641ab) — `d3d8DepthBiasInfo` now uses the D3D8 integer range `0..16`
      (clamp to 16) and the d3d8to9 24-bit `CalcDepthBias` denominator
      `(1<<20)-1` in `bridge.js`.
- [ ] Fixed-function pipeline emulation via generated GLSL ES shaders.
- [ ] Port/translate `wwshade` shaders + `W3DShaderManager` to GLSL ES.
      Fixed-function `W3DShaderManager::init()` now reaches
      `canRenderToTexture=true` on the browser D3D8 shim without claiming pixel
      shader support; remaining work is real screen-filter
      `filterPreRender`/`filterPostRender` screenshot coverage and actual
      programmable shader translation.
- [ ] Matrix/transform stack and viewport/camera setup.

### Increasing fidelity (each step verified by screenshot)
- [ ] **Texture stages 2+ are silently dropped by the browser D3D8 bridge**
      (Fable graphics audit 2026-07-05): the uber-shader implements only
      `uStage0*`/`uStage1*` (bridge.js:5939-5955) while the shim caps claim
      `MaxTextureBlendStages=8` (`wasm_d3d8_shim.cpp:655`). `W3DWater.cpp`
      sets stage-2 state unconditionally (lines 277-278, 1885-1886) — water
      renders with a missing layer by construction. Either implement stages
      2-3 in the shader or report honest 2-stage caps and verify W3D's
      multi-pass fallback. Current coverage: active stages 2-7 now emit a
      one-time `d3d8Warnings`/console diagnostic so this class is visible.
- [ ] **Remaining unsupported combiner ops must not silently degrade**:
      the browser bridge now implements and screenshot-smoke-proves
      `BLENDTEXTUREALPHAPM` plus the four `MODULATE*_ADD*` color ops from the
      Fable audit, and unsupported combiners/args now emit one-time
      `d3d8Warnings` diagnostics. Remaining: decide whether `PREMODULATE` and
      `BUMPENVMAP`/`BUMPENVMAPLUMINANCE` should be implemented in the current
      fixed-function shader, lowered to an original W3D fallback by caps, or
      handled by a later generated-shader path.
- [ ] **Implicit alpha-cutout heuristic diverges from original D3D8**
      (f01d587, `d3d8ImplicitAlphaCutoutThreshold`): real D3D8 never
      discards zero-alpha texels on unblended z-writing draws — the
      original battleship/chinook draws that motivated the hack cannot
      have reached the real device with alphaTest AND blend both off, so
      some state is being lost between the engine and the captured
      render-state (prime suspect: DX8Wrapper's redundant-set filtering
      desyncing from the shim's snapshot). Find the lost state, then
      retire the heuristic — it will punch holes in any opaque texture
      whose unused alpha channel is zero.
- [ ] **Per-map cool-blue scene tint** (seen in
      `artifacts/screenshots/sweep-tournament-city.png`; mountain-guns
      renders warm/correct): whole 3D scene is blue-shifted with a
      brighter radius near the base, while the UI map thumbnail shows
      correct warm colors — so texture decode and vertex-color swizzle
      (aDiffuseBgra, verified) are fine and the tint enters via per-map
      lighting/shroud state (night-ish time-of-day lighting or shroud
      modulate). Next diagnostic: dump `m_timeOfDay` + terrain lighting
      values and the shroud state for tournament-city vs mountain-guns in
      the sweep, and rerun with fog/shroud disabled to bisect.
- [ ] Generalize the browser range-backed BIG archive reader into the
      original file/archive registration path so normal engine startup
      can stream user-supplied runtime archives without focused harness
      mounts or whole-archive MEMFS copies. Current coverage:
      `npm run test:startup-range-backed-archives-browser` range-fetches
      a startup-shaped `INIZH.big`/`EnglishZH.big`/`MapsZH.big` subset,
      registers synthesized BIG archives before boot, proves the startup
      asset/data preflight is ready, and confirms the next frontier is the
      absent base Generals startup INI files. The same smoke now also mounts
      optional base Generals startup/audio entries from `INI.big`/`English.big`
      when present and expects the post-`CreateGameEngine` original
      `GameEngine.cpp` init-ownership frontier. The remaining work is the normal
      on-demand full-archive streamer without a curated entry list.
- [ ] Hand runtime `W3DFileSystem` ownership over to the real
      `W3DDisplay` / browser display startup path once full display
      construction owns WW3D lifetime. The current smoke proves the
      shared browser runtime archive owner can expose W3D and texture
      assets through the normal file/archive system, but final startup
      still needs display-owned WW3D file-factory lifetime and the open
      range-backed archive streaming path above.
- [ ] Expand the archive-backed `WindowLayout` repaint path from the current
      real `WindowZH.big` `Menus/Defeat.wnd` and `Menus/MainMenu.wnd`
      `MapBorder4` rectangle repaint smokes into production shell/menu
      composition: cover text and image children that are hidden/pruned for the
      focused repaint proofs, and normal display-owned font/image lifetime. The
      current direct display slices prove `MainMenu.wnd:Logo` and the
      `MainMenuRuler` HandCreated mapped image / `TexturesZH.big`
      `MainMenuRuleruserinterface.tga` texture path, and the WND image repaint
      smoke now carries the full-screen ruler, logo overlay, and the visible
      main button stack (`ButtonSinglePlayer`, `ButtonMultiplayer`,
      `ButtonLoadReplay`, `ButtonOptions`, `ButtonCredits`, and `ButtonExit`)
      through enabled three-piece button images plus real CSF labels through
      `GameText::fetch` and `W3DDisplayString::draw`; its static-text-focused
      mode also unhides the shipped
      `MainMenu.wnd:StaticTextSelectDifficulty` child and renders
      `GUI:SelectDifficulty` through original `W3DGadgetStaticTextDraw` /
      `GadgetStaticTextSystem` / `W3DDisplayString`, and its Load Replay
      focused mode unhides the shipped `MainMenu.wnd:MapBorder3`,
      `ButtonLoadGame`, `ButtonReplay`, and `ButtonLoadReplayBack` controls
      with real button images and CSF labels. Its Single Player focused mode
      now also unhides `MainMenu.wnd:MapBorder`, `EarthMap`, `ButtonUSA`,
      `ButtonGLA`, `ButtonChina`, `ButtonChallenge`, `ButtonSkirmish`, and
      `ButtonSingleBack`, including real button images, CSF labels, and
      browser pixel proofs. Its Difficulty focused mode now also unhides
      `MainMenu.wnd:MapBorder4`, `EarthMap4`, `StaticTextSelectDifficulty`,
      `ButtonEasy`, `ButtonMedium`, `ButtonHard`, and `ButtonDiffBack`,
      including real button images, CSF labels, title text, and browser pixel
      proofs. Its faction-logo focused mode now also mounts the shipped
      `INIZH.big` `SCLogosUserInterface512.INI` mapped images and
      `TexturesZH.big` `sclogosuserinterface512_001.tga`, unhides
      `WinFactionUS`, `WinFactionGLA`, `WinFactionChina`,
      `WinFactionTraining`, and `WinFactionSkirmish`, and proves their
      `W3DGameWinDefaultDraw` browser pixels in
      `harness-smoke-ww3d-main-menu-layout-faction-logo-repaint-canvas.png`.
      Current archive inspection
      shows `MainMenuBackdrop` is parent `ENABLEDDRAWDATA` behind a shipped
      `W3DNoDraw` callback, and the `MainMenuBackdropuserinterface.tga` /
      `MainMenuBackdrop.tga` texture is absent from the current ZH-only runtime
      archive set, so backdrop proof needs the real source archive/path instead
      of a forced synthetic parent draw.
      Remaining work is broader unpruned shell composition (for example
      `MainMenuBackdrop`, image states beyond the currently proved disabled,
      hilite, and pushed `ButtonSinglePlayer` triplets, and text under normal
      display-owned font/archive lifetime) instead of curated target
      visibility.
- [ ] Locate a real shipped shell layout or state that exercises
      `W3DMainMenuRandomTextDraw` / `StaticTextRandom1` / `StaticTextRandom2`
      before claiming random-text coverage. The current Zero Hour
      `Menus/MainMenu.wnd` asset does not contain those windows, and
      `W3DMainMenuInit` leaves the random-text setup commented out, so the next
      proof must be asset-backed rather than synthesized solely for completion.
- [ ] Terrain heightmap (`BaseHeightMap`/`HeightMap`/`FlatHeightMap`) renders.
      Current focused coverage includes the synthetic terrain tile proof plus
      `test:ww3d-terrain-tile-archive`, which mounts real `TerrainZH.big`,
      decodes `Art\Terrain\PTBlossom01.tga` through original
      `WorldHeightMap::countTiles` / `readTiles`, and verifies the original
      `W3DTerrainBackground` stage-1 texture bind/sample reaches WebGL pixels.
      `test:vertical-integrations` now gates that real archive-backed tile
      render beside the other rendering verticals; it also gates the same real
      tile data through `RTS3DScene::Customized_Render` `CLASSID_TILEMAP`
      dispatch. `test:ww3d-terrain-map-patch-scene` now mounts `INIZH.big`,
      `MapsZH.big`, and `TerrainZH.big`, parses real
      `Data\INI\Terrain.ini` through original `INI::load` /
      `INITerrain.cpp`, parses `Maps\MD_GLA03\MD_GLA03.map` through original
      `WorldHeightMap`, selects a patch with loaded shipped terrain source
      tiles, initializes the original `HeightMapRenderObjClass`, and verifies
      its two-pass `DX8Wrapper::Draw_Triangles` submission produces
      WebGL-visible terrain pixels. `test:ww3d-terrain-visual-scene` now links
      original `TerrainVisual.cpp` / `W3DTerrainVisual.cpp`, calls
      `W3DTerrainVisual::load` against the same real map/archive set, proves the
      visual-owned `HeightMapRenderObjClass` is attached by
      `W3DDisplay::m_3DScene`, captures browser WebGL2 terrain pixels, and now
      also renders the original 129x129 `W3DTerrainVisual::load` draw window
      without post-load patch `initHeightData` reinitialization. It also runs a
      camera-pan render mode over the same visual-owned source-backed 32x32
      patch: the probe moves a real `CameraClass` target/eye, renders two
      `WW3D::Render(W3DDisplay::m_3DScene, camera)` frames, gates two
      base/blend terrain pass pairs, and captures
      `harness-smoke-ww3d-terrain-visual-camera-pan-scene-canvas.png`.
      It also now runs a visual-owned shroud render mode: the probe installs a
      shroud-capable `HeightMapRenderObjClass` through `W3DTerrainVisual::load`,
      initializes/fills/renders the original `W3DShroud`, verifies the
      `W3DShroudMaterialPassClass` terrain pass after base/blend terrain, and
      captures
      `harness-smoke-ww3d-terrain-visual-shroud-scene-canvas.png`.
      A second visual-owned shroud update mode now routes a 25x25 cell update
      through original `W3DDisplay::setShroudLevel(CELLSHROUD_CLEAR)`, verifies
      the sample reaches `GlobalData::m_clearAlpha`, re-renders
      `W3DShroud` so the browser texture updates, renders a second
      `W3DDisplay::m_3DScene` frame, gates the second ordered shroud pass, and
      captures
      `harness-smoke-ww3d-terrain-visual-shroud-update-scene-canvas.png`.
      The same update mode now also links original
      `GameLogic/Object/PartitionManager.cpp`, builds a bounded
      `PartitionManager` cell grid, routes `revealMapForPlayer` and
      `refreshShroudForLocalPlayer` through forwarding display/radar adapters,
      verifies a fogged sample updates the visual-owned `W3DShroud`, and gates a
      third ordered shroud render frame.
      The same visual-scene smoke now also proves original
      `W3DTerrainLogic::loadMap(query=true)` against the same shipped map,
      including logic-only `WorldHeightMap` parser sections, map-object
      presence, extents, height range, source filename, and time-of-day
      notification agreement with the visual load.
      The selected 32x32 patch remains source-backed. The terrain visual
      harness now mounts base Generals `Terrain.big` alongside `TerrainZH.big`
      through the same `Terrain*.big` archive mask and gates the original
      129x129 `W3DTerrainVisual::load` window on all 16,384 cells being
      source-backed.
      `test:vertical-integrations` now includes that visual-owned terrain scene
      plus the visual-owned shroud pass/update payloads, no-reinit load-window
      proof, and camera-pan proof beside the lower-level tile, scene-dispatch,
      and map-patch terrain proofs.
      `test:ww3d-terrain-road-buffer-scene` now also proves a focused original
      `W3DRoadBuffer::drawRoads` pass over the original heightmap render object
      on a real source-backed `Maps\MD_CHI01\MD_CHI01.map` patch, with
      `Roads.ini` parsed by original `INI::load` / terrain-road parsers, the
      road buffer fed from the full original logical map-object list created by
      `W3DTerrainLogic::loadMap(query=true)`, and a real road texture sampled
      in the browser. `test:ww3d-terrain-bridge-buffer-scene` now does the same
      full logical map-object handoff for `W3DBridgeBuffer::loadBridges` while
      retaining the current in-list bridge-template substitution needed by the
      ZH-only archive set; the same bridge scene now also keeps original
      `W3DRoadBuffer::drawRoads` and `W3DTreeBuffer::drawTrees` sidecars live
      through the browser frame. The remaining terrain vertical work is
      production/full-map display ownership beyond the now source-backed load
      window, then broadening water, gameplay-owned shroud/partition updates,
      objects, and continuous gameplay-owned camera flow on top of the same
      original heightmap path.
- [ ] Replace the probe-only
      `CNC_PORT_TERRAIN_PROBE_MINIMAL_HEIGHTMAP_SYSTEMS` guard and
      `wasm_ww3d_terrain_probe_stubs.cpp` weak adjacent-system symbols with
      the real tree, prop, bib, bridge, waypoint, shroud, water, and road
      runtime systems as those subsystems become browser-ready. The original
      `W3DBibBuffer` constructor/add/remove/clear/free lifecycle is now
      browser-harness verified through browser-backed D3D8 buffers/textures,
      and the original `W3DPropBuffer` add/update/doFullUpdate/cull/remove/clear
      path is now browser-harness verified for a range-backed shipped
      `CINE_MOON` model/texture via the prop buffer's cloned `MeshClass`
      rendered through `WW3D::Render` and WebGL2. The production-shaped
      `HeightMapRenderObjClass::Render` -> `W3DPropBuffer::drawProps` ->
      `RTS3DScene::Flush` -> `TheDX8MeshRenderer.Flush` path is now
      browser-harness verified against the same shipped prop model/texture on a
      real source-backed map patch. The original `W3DTreeBuffer::drawTrees`
      path is now browser-harness verified through
      `HeightMapRenderObjClass::Render` -> `RTS3DScene::Flush` -> `DoTrees`
      using shipped `PTDogwod01_S` W3D and terrain/tree textures on the same
      real source-backed map patch. The original `W3DRoadBuffer::drawRoads`
      path is now browser-harness verified through
      `HeightMapRenderObjClass::Render` on a real MD_CHI01 source-backed patch:
      the probe calls original `W3DTerrainLogic::loadMap(query=true)`, keeps
      the resulting full `MapObject` list live, collects road candidate pairs
      from that list, feeds the list to original `W3DRoadBuffer::loadRoads`,
      samples the shipped `TRThickLine` road texture from `TexturesZH.big`, and
      proves the road draw follows the terrain base/blend passes. The original
      `W3DBridgeBuffer::loadBridges` / `updateCenter` plus
      `W3DBridge::renderBridge` geometry path is now browser-harness verified
      from the same full logical map-object list on a real
      `Maps\MD_CHI01\MD_CHI01.map` bridge pair; the current ZH-only asset set
      still substitutes an available bridge template in-place on the selected
      logical list entries. The bridge scene now also proves the original road
      and tree sidecar draw paths in the same browser frame, using the full
      logical road list and shipped `PTDogwod01_S` tree assets. Production
      map/object tree placement, production `query=false` /
      `W3DTerrainLogic::newMap` ownership through the normal `DO_ROADS` terrain
      path, TerrainLogic-owned bridge damage states through real AI/pathfinder
      ownership, and shroud-aware tree behavior remain open. A direct broad
      removal of the
      minimal heightmap/road bypass still times out and crashes Chromium after
      archive mounting, so full adjacent heightmap ownership remains open. The
      `W3DTerrainVisual::load` smoke currently also keeps cold
      water/tracks/shadow/smudge methods weakly stubbed because the focused
      proof keeps water null and does not call full `W3DTerrainVisual::init`.
      Its logical terrain load proof also uses probe-local `GameClient`,
      `ThingFactory`, and `ScriptEngine` ownership plus weak adjacent-script
      symbols only to reach query-mode map load; replace those with full
      original runtime ownership before treating the path as gameplay-owned.
- [ ] Retire the residual terrain-probe shroud enable gate from the production
      `cnc-port` terrain build. Real skirmish boot now enables the original
      heightmap-owned `W3DShroud` before `CreateGameEngine()` and verifies
      production `PartitionManager::refreshShroudForLocalPlayer` ->
      `W3DDisplay::setShroudLevel` -> terrain shroud texture ownership on
      Tournament Desert, with a live 64x128 shroud texture and zero sampled
      visual mismatches. The remaining cleanup is to remove the
      `CNC_PORT_TERRAIN_PROBE_MINIMAL_HEIGHTMAP_SYSTEMS` shroud-disabled
      default / setter once the adjacent heightmap probe compile guard is no
      longer needed by focused terrain smokes, and keep the skirmish harness
      asserting that real boot creates a shroud object and texture.
- [ ] Finish bridge-buffer logic ownership by replacing the focused
      bridge-layer pathfinder, GameLogic/Object, and module-factory runtime
      surfaces with full original AIPathfind/Object/ThingFactory ownership.
      The focused browser scene now keeps `TheTerrainLogic` live, passes the live
      `W3DTerrainLogic` into
      `W3DBridgeBuffer::loadBridges(&W3DTerrainLogic, FALSE)`, and verifies
      `TerrainLogic::addBridgeToLogic` inserts the retained logical `Bridge`
      through `AI::pathfinder()->addBridge()` before
      `W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)` enables the
      visual bridge. The bridge scene now runs original
      `AIPathfind::newMap()` / `classifyMap()` for the retained bridge layer
      under an origin-based focused terrain extent, routes cliff checks through
      the loaded `W3D` terrain render object, and keeps water flat until
      `TheTerrainVisual`/water-grid ownership is runtime-owned, then
      browser-proves `Pathfinder::changeBridgeState(broken/repaired)` flips the
      sampled bridge-layer cells from clear/connected to impassable and back.
      Full water-aware pathfinder-map classification and production
      terrain/map ownership still belong in the real runtime owner rather than
      this focused bridge visual envelope. The same focused render now primes
      only the cached `W3DBridge` visual damage enum to `BODY_RUBBLE` and
      browser-proves original `W3DBridgeBuffer::drawBridges` synchronizes it
      back to the retained logical `BridgeInfo.curDamageState`, so the visual
      buffer follows terrain logic but no real non-pristine gameplay state is
      faked. It now loads the shipped `GenericBridge` template
      through original `ThingFactory` /
      `ThingTemplate` parsing and requires
      `bridgeLogicGenericBridgeObjectMissing === false`. Remaining work is to
      replace the bridge-only pathfinder and focused object creation/runtime
      surface with the full original runtime, then find and harness-drive the
      real gameplay/script path that drives non-pristine bridge states. The
      shipped `GenericBridge` lookup/body path is now browser-verified through
      `GameLogic::findObjectByID` resolving the retained bridge ID through the
      standard object lookup table, through
      `Object::attemptDamage`, `Object::kill`, and
      `Object::attemptHealingFromSoleBenefactor` to report/route real damage,
      kill, and non-stacking healer requests, and through
      `Object::setDisabledUntil` / `Object::checkDisabledStatus` to set and
      expire timed disabled flags, and through `Object::goInvulnerable` to set
      and clear the undetected-defector invulnerability state, and through
      `GameLogic::destroyObject` / the original destroy-list processing path
      to queue and process bridge-object removal from the object list and
      lookup table, while the bridge construction path now uses the real
      virtual `Thing::setPosition` / `Thing::setOrientation` →
      `Object::reactToTransformChange` dispatch instead of the deleted
      Emscripten-only transform helpers. The remaining focused probe still
      clips health/state back to `BODY_PRISTINE` because the
      real object uses `ImmortalBody` with `MaxHealth = 1`, so damaged/repaired
      bridge-state sync must not be faked through direct body health changes,
      kill/delete side effects, or direct body-state writes. The original bridge
      tower creation block in `TerrainLogic.cpp` is currently compiled out by
      `#define no_BRIDGE_TOWERS`, so tower damage should not be treated as the
      shipped broken/repaired-state driver unless that original switch is
      deliberately revisited under full runtime ownership.
- [ ] Broaden the browser-verified terrain full-scene water/smudge/shroud
      refresh path from `test:vertical-integrations` and probe-mounted
      map/assets to real gameplay map-load, partition, and terrain logic
      ownership.
- [ ] Scene/camera (`W3DScene`, `W3DDisplay`) renders the shell/menu background.
      Current coverage: `test:ww3d-display-shell-composite` layers a focused
      `W3DDisplay::m_3DScene` render, real `WatermarkChina` mapped shell UI art,
      and `GameText`-backed `W3DDisplayString` text in one browser screenshot.
      A follow-up `test:ww3d-window-repaint` now proves a synthetic original
      `W3DGameWindowManager` push-button repaints through
      `GameWindowManager::winRepaint` and real `W3DDisplay`/WebGL2 pixels, and
      `test:ww3d-window-layout-repaint` now proves an archive-loaded
      `WindowZH.big` `WindowLayout` can repaint through the same browser W3D
      path. The now-retired focused MainMenu layout repaint diagnostic proved
      the same browser W3D path against `Menus/MainMenu.wnd` `MapBorder4`;
      keep the next scene/camera work focused on either fuller shell
      composition or terrain first pixels.
- [ ] Add a vtable-safe original `W3DDisplay::setWidth` / `setHeight`
      or `setDisplayMode()` proof. Raw storage is not enough because the
      original setters call virtual `getWidth()` / `getHeight()`;
      placement-new construction currently retains the full `W3DDisplay`
      vtable/link surface (`TheDisplayStringManager`, `TheInGameUI`,
      `TheNetwork`, etc.). `setDisplayMode()` also needs a real
      `TheTacticalView` resize path. Keep this as a focused probe once
      those dependencies are owned, not weak-faked.
- [ ] Replace the focused terrain/water projection generated-coordinate state
      mirrors with direct `W3DShaderManager::setShader` and
      `WaterRenderObjClass` call-path probes once those renderer surfaces are
      linked into the browser runtime without broad compile-frontier-only
      dependencies.
- [ ] Particle rendering (`W3DParticleSys::doParticles` against the real W3D
      scene/display/terrain/texture path), shadows, water, shroud, decals
      (later). Startup ownership is already proven by `particleSystemRuntime`,
      including original W3D particle/snow device-source linkage and
      `ParticleSystem.ini` template loading.
- [ ] Replace the focused particle-template metadata path's weak Object/Drawable
      compatibility bridges with the full original `ParticleSystem` /
      `ParticleSystemManager` runtime once object, drawable, game-client, and
      renderer ownership are linked; verify weapon projectile-exhaust particles
      through harness screenshots/state.
- [ ] Snow/weather rendering through original `SnowManager` / W3D weather
      paths, including map weather overrides, verified by harness screenshots.
      The generic D3D8 bridge support for bound-buffer `DrawPrimitive` and
      fixed-function point sprites is now proven; the remaining work is a real
      SnowManager/weather scene driven through original W3D ownership.
- [ ] Reach the **main menu rendering** end-to-end; screenshot it.

---

## M5 — Input & UI

- [ ] Render the real in-game cursor: the game calls `SetCursor(NULL)` and
      draws its own `W3DMouse` cursor (Mouse.ini cursor set), which the
      browser build does not render yet. Until it does, bridge.js keeps the
      native CSS cursor visible as a stand-in (see fable/browser-mouse);
      when W3DMouse renders, restore honoring the engine's cursor
      visibility, or map the engine's DX8 hardware-cursor path to CSS
      `cursor: url(...)` custom cursors at the platform boundary.
- [ ] Mouse: Pointer events → engine `Mouse`/`W3DMouse` (move, buttons, wheel).
- [ ] Promote the browser-backed frame-owned `Mouse` path from
      disabled-by-default harness opt-in to the final default gameplay
      input owner once the real engine `MessageStream` / `CommandList`
      lifecycle is no longer probe-owned.
- [ ] Keyboard: DOM keyboard events → engine `Keyboard` (mapping, repeat, focus).
- [ ] Promote the browser-backed frame-owned `Keyboard` path from
      disabled-by-default harness opt-in to the final default
      gameplay input owner once the real engine `MessageStream` /
      `CommandList` lifecycle is no longer probe-owned.
- [ ] Pointer lock / capture behavior where needed.
- [ ] Cursor rendering (engine-drawn cursor vs CSS cursor).
- [ ] Extend cursor rendering verification for future engine-drawn
      `RM_W3D` cursor pixels once W3D cursor textures are rendered by the
      normal display path.
- [ ] `GameClient/GUI` widgets receive events and are clickable.
- [ ] Navigate shell menus (Single Player, Skirmish, Options) via harness.
      Current original-input coverage includes Single Player dropdown/back,
      USA faction selection into Difficulty/back, Load Replay dropdown/back,
      MainMenu-to-CreditsMenu, and `ButtonSkirmish` through original
      `MainMenuSystem` into real `SkirmishGameOptionsMenuInit` /
      `SkirmishGameOptionsMenuShutdown` ownership, including focused
      `SkirmishGameInfo`, `MultiplayerSettings`, `PlayerTemplateStore`, and
      `MapCache` dependencies for option gadget population. The real
      `ButtonBack` path is now driven through
      `SkirmishGameOptionsMenuSystem`, including Skirmish preferences write,
      `Shell::pop`, `TheSkirmishGameInfo` deletion, and
      `SkirmishGameOptionsMenuUpdate` completing the pending pop. The real
      `ButtonStart` path is now driven through `SkirmishGameOptionsMenuSystem`,
      `CheckForCDAtGameStart`, `SkirmishGameInfo::startGame`, selected-map
      `GlobalData` write, and `MessageStream` `MSG_NEW_GAME` argument
      queueing, followed by original `MessageStream::propagateMessages`
      handoff to `TheCommandList` and `CommandList::reset` cleanup. The
      `verify:gamelogic-new-game-dispatch-frontier` gate now pins that original
      source path, and `gamelogic-new-game-dispatch-smoke` links original
      `GameLogic.cpp`, `GameLogicDispatch.cpp`, `GameState.cpp`,
      `PlayerList.cpp`, `Player.cpp`, `ScriptEngine.cpp`, and `Scripts.cpp`
      to drive
      `GameLogic::processCommandList` on a real `MSG_NEW_GAME` through
      original `GlobalData.cpp` / `TheWritableGlobalData`, original
      `PlayerList::getNthPlayer` neutral-player ownership, original
      `ScriptEngine::setGlobalDifficulty`, original `Shell::hideShell`, and
      the first-call `startNewGame(FALSE)` deferral before terrain load. That
      runtime now mounts base `Window.big` and drives both the seeded shell
      layout and `prepareNewGame` background through original
      `GameWindowManager::winCreateLayout` / `WindowLayout::load` parsing for
      `Window\Menus\BlankWindow.wnd`. It now also mounts `MapsZH.big`,
      promotes shipped `Maps\MD_GLA03\MD_GLA03.map`, and proves original
      `W3DTerrainLogic::loadMap(false)` / `WorldHeightMap` /
      `TerrainLogic::loadMap` / `TerrainVisual::load` ownership over the same
      map, including object, waypoint, side/team, time-of-day, and 3800x3800
      extent checks. The same runtime now mounts `INIZH.big` / base `INI.big`,
      loads original startup `Multiplayer`, `Science`, `AIData`, and
      `PlayerTemplate` INI data, validates the parsed 11 sides and 97 teams,
      constructs original `AIPlayer` state, resets `TeamFactory`, populates 11
      players through `PlayerList::newGame`, and preserves 465 side scripts
      through `ScriptEngine::newMap`. It now also calls original
      `Radar::newMap` with the loaded terrain and a focused LeftHUD window
      owner, proving the radar extent/sample/coordinate translation state for
      `MD_GLA03`. It now continues through original GameData-backed
      `PartitionManager::init` and `refreshShroudForLocalPlayer`, proving the
      loaded-map partition grid and initial display/radar shroud refresh. It
      now also owns original `GhostObjectManager` local-player index assignment
      and reset. It now drives original `W3DTerrainLogic::newMap(FALSE)`
      against a real `BaseHeightMapRenderObjClass` owner with original
      `TerrainTypes.cpp`, `TerrainRoads.cpp`, `DX8Wrapper.cpp`, `rendobj.cpp`,
      and save/load support linked, proving the road-buffer handoff plus base
      `TerrainLogic::newMap` waypoint Z and water-grid setup. It now also
      installs the original `W3DBridgeBuffer` in the startup runtime with
      startup-only deferred GPU buffer allocation, proves the empty
      `MD_GLA03` `W3DBridgeBuffer::loadBridges` scan and bridge damage-state
      update, runs the original ordered post-terrain bridge-like map-object
      scan over `WorldHeightMap`'s map-object list, proves `MD_GLA03` has no
      startup-owned bridge or walk-on-wall object candidates yet, calls
      original `Radar::refreshTerrain`, then calls original
      `Pathfinder::newMap` to prove the loaded terrain grid
      allocation/classification. Next load real object templates into
      `gamelogic-new-game-dispatch-smoke` and promote the bridge-like
      map-object creation branch when a map supplies bridge or walk-on-wall
      templates, then continue the original ordered `startNewGame` sequence
      beyond `Pathfinder::newMap`.
- [ ] Retire the startup-only `W3DBridgeBuffer` GPU-buffer deferral hook once
      `gamelogic-new-game-dispatch-smoke` either runs with a browser/WebGL-backed
      D3D8 device or promotes bridge rendering/buffer allocation into the same
      runtime instead of proving only the no-bridge map scan in Node.
- [ ] Retire the handoff-only road segment cap in
      `gamelogic-new-game-dispatch-smoke` once this startup runtime can own
      full road/bridge map-object spawning or render-owned road geometry
      without using the separate terrain road-buffer scene as the geometry
      proof.
- [ ] Touch input mapping (stretch, for mobile).

---

## M6 — Playable skirmish (no audio/video)

- [ ] Players/factions/generals set up from INI.
- [ ] Selection (single, box, double-click) works.
- [ ] Movement orders + pathfinding (`AI`, locomotors) execute. A live
      skirmish e2e now proves one selected local dozer receives
      `MSG_DO_MOVETO` through the original input/command path and changes world
      position; keep this open for broader locomotor/pathfinding cases.
- [ ] Combat: weapons, damage, armor, FX resolve correctly.
- [ ] Replace the focused `Weapon.cpp` metadata-only browser build with the
      full original `Weapon` / `WeaponStore` fire, delayed-damage, projectile,
      laser, FX, and OCL runtime linked through real `Object`,
      `PartitionManager`, `ThingFactory`, `ObjectCreationList`, `Drawable`,
      `Player`, `WeaponSet`, and update-module ownership; harness-test real
      attack orders and resulting damage/state changes.
- [ ] Production: build structures/units, resources (supplies) flow. A live
      skirmish e2e now proves selected builder units can place real command-bar
      barracks commands through `MSG_DOZER_CONSTRUCT`, create new local
      structure objects, advance construction health, complete the structure,
      queue a barracks infantry unit through `MSG_QUEUE_UNIT_CREATE`, and
      observe the produced local unit object; keep this open for supply
      spending/income, production UI/cancel/rally behavior, and broader
      faction/build cases.
- [ ] `ScriptEngine` runs map scripts.
- [ ] Fixed-timestep simulation is **deterministic** (same seed → same result).
- [ ] AI opponent plays a skirmish. The live release skirmish smoke now proves
      the first enemy AI production/economy step over 1200 post-active frames
      with full `AI::update()`, `Pathfinder`, and AIData enabled; keep this open
      for attack waves, base expansion/resource harvesting, faction/difficulty
      coverage, and full win/lose progression.
- [ ] Win/lose conditions trigger.
- [ ] Harness: from the skirmish-start smoke's active match state, issue
      attack orders through the original input/command path and assert object
      state changes. The live skirmish e2e now covers map-ground movement
      (`AmericaVehicleDozer` selection -> `MSG_DO_MOVETO` dispatch -> measured
      world-position delta) and, after real barracks unit production, proves
      produced-infantry attack-move through the original control-bar/input path
      (`GUI_COMMAND_ATTACK_MOVE` -> `MSG_DO_ATTACKMOVETO` -> measured unit
      world-position delta). Keep this open for real hostile object attack and
      target damage; the current default live skirmish scan finds no hostile
      live targets, and neutral force-attack candidates have not produced an
      object attack dispatch.
- [ ] Replay/recorder (`Recorder.cpp`) records and plays back deterministically.

---

## M7 — Audio (Miles → Web Audio)

- [ ] Thread parsed `Data\INI\AudioSettings.ini` from mounted base `INI.big`
      through the real `AudioManager::init` / browser audio backend path before
      treating audio payload path resolution as runtime-ready.
- [ ] Re-target `MilesAudioManager` (and `WWVegas/Miles6`/`WPAudio`) to Web Audio.
      The `Mss.H` startup/provider/listener/filter/sample/stream-handle
      boundaries are now stateful and harness-probed by the MSS lifecycle RPCs,
      and `node WebAssembly/dist/miles-audio-open-device-smoke.cjs` now
      instantiates the original `MilesAudioManager` and drives its real
      `openDevice()` path through shared browser MSS runtime state. Full
      `AudioManager::init` INI-driven startup now also runs inside the
      `cnc-port` browser boot: `wasm_audio_manager_probe.cpp` constructs the
      original manager as `TheAudio`, real `AudioManager::init()` parses 69
      music tracks / ~1,400 sound events / ~2,570 streaming events through the
      real INI runtime from mounted archives, the real
      `isMusicAlreadyLoaded()` archive check passes against base-Generals
      `Music.big`, `openDevice()` selects/opens the browser MSS provider with
      2D/3D pools + listener + delay filter, and teardown runs the original
      destructor (`test:startup-vertical` gates this plus the
      frontier advance to `createFunctionLexicon`@446). Web Audio playback
      owned by the original manager now reaches real engine-driven 2D and 3D
      sample events plus one ZH `MusicTrack` stream start/stop in
      `test:real-audio-event`; broader music transitions, additional
      speech/voice coverage, and Bink-sharing handles remain open.
- [ ] Replace remaining `Mss.H`/`dsound.h` compatibility paths used by
      `MilesAudioManager.cpp` with a browser-backed audio device that owns real
      sample data, streams, provider/listener state, mixer state, and
      Bink-sharing handles. The startup boundary is no longer compile-only, but
      playback scheduling, decoded stream data, and DirectSound speaker/device
      replacement remain open. The 2D sample handle lifecycle is now stateful and
      harness-probed by `mssSampleLifecycleProbe`, covering sample init, file
      assignment, callbacks, volume/pan/rate/loop settings, start/stop/resume,
      status, and release. The focused `mssSamplePlaybackProbe` now drives a
      valid in-memory PCM WAV from `AIL_start_sample` into the browser
      `AudioBufferSourceNode -> GainNode -> StereoPannerNode -> soundGainNode`
      graph after the Web Audio gesture, then asserts Web Audio completion,
      MSS end, EOS callback, and release; folding that backend into the real
      `MilesAudioManager::playAudioEvent` 2D `playSample` request path now has
      a focused original-manager smoke that drives
      `processRequest -> playAudioEvent -> playSample` through
      `AudioFileCache`, `AIL_WAV_info`, `AIL_set_sample_file`,
      `AIL_start_sample`, MSS completion callback, and sample release in the
      manager-owned 2D pool. The HSTREAM
      lifecycle is now stateful and harness-probed by
      `mssStreamLifecycleProbe`, covering open/open-by-sample, callback
      registration, volume/pan/rate/loop/position state, start/pause/resume,
      status, and close, and real engine-driven music stream scheduling/stop now
      reaches `cncPortMssStreamStart` / `cncPortMssStreamStop` through
      `test:real-audio-event`; the same gate now proves one real speech stream
      routes through the speech mixer bus. The 3D sample/listener/provider
      lifecycle is now
      stateful and
      harness-probed by `mss3DSampleLifecycleProbe`, covering provider open and
      speaker type, listener position/orientation/velocity, 3D sample
      allocation/user data/file/callback/distance/position/volume/rate/loop/
      offset/occlusion/effects state, start/stop/resume/end callback, and
      release, and real engine-driven 3D sample scheduling now routes through
      `PannerNode -> sound3DGainNode` in `test:real-audio-event`.
      The startup probe now also resolves the original `initDelayFilter`
      `AIL_enumerate_filters` lookup to a browser-owned `Mono Delay Filter`
      handle, and the focused original-manager `openDevice()` smoke verifies
      the same provider/listener/sample/filter state from `MilesAudioManager`
      itself, without implementing the filter DSP path.
- [ ] Broaden engine-driven `MilesAudioManager` sample playback coverage beyond
      the two-event harness gate. `test:real-audio-event` now proves
      `TheAudio->addAudioEvent -> SoundManager::addAudioEvent ->
      MilesAudioManager::processRequest -> playSample/playSample3D ->
      AIL_start_sample/AIL_start_3D_sample -> Web Audio` for
      `CIAAgentVoiceAttack` and `ArtilleryBarrageIncomingWhistle`; remaining
      work is completion/EOS drainage under sustained gameplay, more unit voice
      families, and regression coverage in the broader vertical suite.
- [ ] Decode original audio formats (MP3, PCM WAV, and the current 2,572
      IMA ADPCM WAV payloads) before Web Audio playback; the current
      `verify:audio-format-frontier` / harness `payloadFormats` checks prove
      the ADPCM majority must be decoded or transcoded before
      `decodeAudioData`, and `audioPayloadInventory.decodeProofs` /
      `webAudioBufferProofs` currently cover only representative PCM and IMA
      ADPCM WAV payloads. `requestedPayloadCachePlan` is metadata-only, and
      `requestedPayloadDecodeCacheProof` now creates representative decoded
      MP3/WAV Web Audio buffer cache entries, an OfflineAudioContext preview
      schedule render, a browser lifecycle proof, and a Web Audio mixer-bus
      proof for requested music/SFX/3D SFX/voice/speech keys. The harness also
      retains that representative decoded cache for one live requested
      `AudioBufferSourceNode` lifecycle proof through the runtime mixer, and
      the MSS sample playback probe now schedules a valid synthetic PCM WAV
      through the browser mixer from `AIL_start_sample`. The IMA ADPCM
      majority is now decoded at the original Miles boundary: the `Mss.H`
      shim implements real `AIL_WAV_info` fmt/fact/data chunk parsing plus an
      `AIL_decompress_ADPCM` IMA decoder (mono+stereo, per-block headers,
      fact-clamped final block) proven bit-exact (0 diffs) against ffmpeg and
      an independent reference decoder on real `AudioZH.big` payloads, and the
      original engine branch `AudioFileCache::openFile ->
      AIL_decompress_ADPCM` now plays decoded real ADPCM through browser Web
      Audio inside `cnc-port`
      (`test:browser-audio-miles-webaudio-vertical`), and one real
      engine-driven MP3 `MusicTrack` stream plus one real speech WAV stream now
      decode through browser audio in `test:real-audio-event`. Remaining:
      full resolved requested-payload decode/cache storage with broad real
      engine-driven Web Audio scheduling/lifecycle coverage.
- [ ] Complete dynamic 3D audio behavior after the engine-driven positional
      sample start path. `test:real-audio-event` proves one real world SFX
      reaches `PannerNode -> sound3DGainNode`, and the browser MSS bridge now
      applies real Miles listener position/orientation updates plus active
      sample `AIL_set_3D_position` updates to Web Audio; remaining work is
      attenuation/zoom-volume recompute for already-playing samples and
      camera/world movement validation during active gameplay.
- [ ] Music playback + transitions; `verify:audio-music-manager-frontier` now
      pins the source-only `MusicTrack` / `MusicManager` / Miles stream route,
      volume bus, Music.ini parse path, and next/previous/completion state
      contracts that the Web Audio stream backend must satisfy. Engine-driven
      playback for `Game_USA_10` now reaches the browser MSS stream backend and
      stops through the original remove-audio-event path; live stream
      volume/pan updates now drive active Web Audio gain, and starting a new
      `AT_Music` stream retires older music streams with fade coverage in
      `test:real-audio-event`. The real menu-to-skirmish path now also gates
      that pre-skirmish menu music handles close before gameplay music remains
      active (`test:skirmish-music-transition`). Broader next/previous and
      completion transitions remain open.
- [ ] EVA voice / unit voices.
- [ ] Volume/mixer controls wired to options UI; `verify:audio-options-volume-frontier`
      now pins the original Zero Hour OptionsMenu slider-to-`TheAudio->setVolume`
      write path, `verify:audio-options-volume-readback-frontier` pins the
      persisted-preference slider initialization path, and the representative
      `requestedPayloadDecodeCacheProof.browserAudioMixerBusProof` proves
      source-default music/sound/3D/speech Web Audio `GainNode` buses against
      real requested payloads; `browserAudioMixerRuntime` also proves live
      runtime `GainNode` bus updates from source-shaped script/system volume
      values, but the engine/options UI still does not drive that browser
      mixer.
- [ ] Harness: add sustained gameplay audio assertions beyond direct event
      triggering. `test:real-audio-event` proves direct engine-driven 2D/3D
      sample events and one music stream, and the human/skirmish real-init
      archive lists now mount all required audio payload BIGs including
      `AudioEnglishZH.big` and `SpeechEnglishZH.big`; remaining harness work is
      to observe naturally triggered unit/weapon/UI/music audio during
      skirmish/campaign input and assert completion drainage over multiple
      frames.

---

## M8 — Video (Bink → WebCodecs)

- [ ] Re-target `VideoDevice/Bink` (`BinkVideoPlayer`/`VideoStream`) to WebCodecs
      or `<video>`.
- [ ] Extend the current browser Bink provider from real-file open/header parsing
      and frame-cursor lifecycle to actual decoded frame copy/upload through
      WebCodecs or a deliberate decoder path; `test:bink-video-provider` now
      proves `BinkOpen` can resolve the shipped loose payloads and fill the
      original `HBINK` fields, and `test:bink-provider-sidecar-browser` now
      proves a browser hook can synchronously copy decoded WebM sidecar pixels
      into `BinkCopyToBuffer`'s wasm destination buffer. The browser
      `test:bink-videoplayer-sidecar-browser` smoke now proves an original
      `BinkVideoPlayer` / `BinkVideoStream::frameRender` flow can own that
      sidecar copy into a `VideoBuffer`, and
      `test:bink-w3d-video-buffer-browser` now proves that same original-player
      flow can copy decoded sidecar pixels into a real `W3DVideoBuffer` and
      emit browser D3D8 texture updates. `test:ww3d-display-video-buffer` now
      proves a synthetic real `W3DVideoBuffer` can be presented by original
      `W3DDisplay::drawVideoBuffer` through display-owned `Render2DClass` to
      the browser D3D8/WebGL2 canvas with a screenshot and pixel checks.
      `test:bink-w3d-video-presentation-browser` now joins those paths for the
      shipped sidecars: original `BinkVideoPlayer` streams copy decoded WebM
      sidecar pixels into real `W3DVideoBuffer` textures and present them
      through original `W3DDisplay::drawVideoBuffer` with browser draw/pixel
      checks, and `test:vertical-integrations` now includes that Bink/W3D
      presentation path as an independent video vertical gate. That smoke now
      also exercises a focused original
      `Display::playMovie/update/stopMovie` path and a focused original
      `WindowVideoManager::playMovie/update` path that attaches a real
      `W3DVideoBuffer` to a `GameWindow`, plus a focused blank-window
      `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`. It now also links original
      `ScoreScreen.cpp` in a focused runtime target and drives original
      `PlayMovieAndBlock("VS_small")` for 70 decoded frames through
      `TheDisplay->draw()`, using a gated blank-layout hook only for harness
      setup. It now also drives the extracted original ScoreScreen
      final-campaign movie helper through a real `CampaignManager` /
      `Campaign` / final-`Mission` transition and verifies another 70
      `VS_small` decoded frame presentations plus blank-layout cleanup. It now
      also hook-counts the final-campaign stats/LOD gates: the high-detail `USA`
      path records normal difficulty and `BATTLE_HONOR_CAMPAIGN_USA` while
      playing 70 frames, and the low-res `CHALLENGE_3` path records hard
      difficulty, `BATTLE_HONOR_CHALLENGE_MODE`, challenge index 3, executes all
      three LOD checks, opens no Bink stream, and leaves texture/draw counts
      unchanged. It now also drives the full `finishSinglePlayerInit` non-final
      victorious branch through a real `CampaignManager` / two-mission campaign
      in the focused ScoreScreen hook build, verifying `SaveAndContinue`,
      next-map selection,
      saved-text visibility, and hook-counted mission-save, message-resource
      cleanup, and `ScoreScreenShow` transition edges without adding Bink
      frames. It now also drives the non-challenge defeat/retry branch through
      the same focused hook build, verifying `Retry`, no mission advancement,
      no mission save, hidden saved-text, message-resource cleanup, and
      `ScoreScreenShow` transition edges without adding Bink frames. It now
      also drives the challenge win/loss branches through the same focused
      hook build, verifying challenge persona text, portrait, backdrop
      visibility, transition suppression, mission save/retry behavior, and
      win/loss audio events without adding Bink frames. It now
      also drives original `SinglePlayerLoadScreen::init`
      through a gated harness-only movie/campaign hook and a synthetic
      `Menus/SinglePlayerLoadScreen.wnd` hierarchy for 70 `VS_small`
      frame presentations. It now also drives original
      `ChallengeLoadScreen::init` through a focused real `CampaignManager` /
      `ChallengeGenerals` setup: the selected challenge campaign supplies the
      player persona, the selected mission supplies the opponent persona and
      `GC_Background` movie label, the synthetic static-text layout verifies
      teletype-rendered bio text, and the smoke verifies player/opponent
      name/taunt plus ambient audio events while still presenting
      `GC_Background` plus `VS_small`/`VSSmall` child-window portrait and
      VS-overlay movies. This item remains open until the final
      decoder/format policy is locked down and the full original InGameUI,
      campaign-owned load-screen setup, full production Challenge persona setup
      from the normal shell/INI path, full non-test `finishSinglePlayerInit`
      subsystem coverage
      (including original `GameState::missionSave`,
      `InGameUI::freeMessageResources`, transition-handler calls, production
      `SkirmishBattleHonors` persistence, and real `GameLODManager` singleton
      ownership), and Bink/audio sync drive the same video surface.
- [ ] Promote the provider-owned WebM sidecar manifest metadata into the
      original `BinkVideoPlayer` runtime path: connect a browser video
      presentation handle to `BinkVideoStream` open/play/seek/frame progression
      and harness-test an original `BinkVideoPlayer`-owned flow. The provider
      now attaches `bink-browser-video-manifest.json` metadata to `HBINK`
      handles and the browser smoke proves the sidecars are playable through
      `<video>`. The provider also emits browser-observable sidecar lifecycle
      hooks for open/decompress/pending-copy/copy-complete/advance/seek/close,
      and its browser-only copy hook can fill wasm memory from decoded WebM
      sidecar pixels. The browser `BinkVideoPlayer` sidecar smoke now mounts
      the real BIK payloads and sidecar manifest, installs the copy hook, and
      verifies original player-owned open/decompress/render/advance/seek/close
      copies decoded sidecar pixels into `SmokeVideoBuffer` memory. The browser
      `Bink W3DVideoBuffer` upload smoke now initializes WW3D, renders those
      original streams into real `W3DVideoBuffer` textures, and verifies
      nonzero browser texture updates for the validated power-of-two texture
      sizes. The `W3DDisplay` video-buffer smoke now verifies synthetic
      `TYPE_X8R8G8B8` `W3DVideoBuffer` presentation through original
      `W3DDisplay::drawVideoBuffer` and browser canvas readback.
      `test:bink-w3d-video-presentation-browser` now verifies original-player
      Bink sidecar frames through real `W3DVideoBuffer` upload and original
      `W3DDisplay::drawVideoBuffer` presentation with a harness screenshot.
      The same smoke now also proves focused original
      `Display::playMovie/update/stopMovie` ownership and focused original
      `WindowVideoManager::playMovie/update` ownership of a window-attached
      real `W3DVideoBuffer`, plus a focused blank-window
      `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`. It now also proves focused original
      `ScoreScreen::PlayMovieAndBlock("VS_small")` ownership end-to-end
      through 70 Bink sidecar frame copies, real `W3DVideoBuffer` uploads,
      original `TheDisplay->draw()` calls, and harness screenshot/pixel
      checks. It now also proves focused original
      `SinglePlayerLoadScreen::init("VS_small")` ownership end-to-end
      through 70 decoded frame presentations and destructor cleanup. It now
      also proves focused original `ChallengeLoadScreen::init` ownership
      end-to-end through a real `CampaignManager` / `ChallengeGenerals`
      campaign/persona lookup for `GC_Background` plus `VS_small`/`VSSmall`
      child-window movies, including teletype bio text, persona audio events,
      179 background frames, 372 managed child-window copies, and 551
      Challenge presentations. It now also proves the extracted
      ScoreScreen final-campaign movie helper through a real
      `CampaignManager` / `Campaign` / final-`Mission` transition, including
      the original `PlayMovieAndBlock("VS_small")` call, 70 decoded frame
      presentations, finish-campaign button state, and blank-layout cleanup.
      It now also hook-counts the final-campaign stats/LOD gates for the
      high-detail `USA` movie path and the low-res `CHALLENGE_3` skip path,
      verifying difficulty/honor/challenge-index recording, all three LOD
      checks, no Bink stream open on skip, and unchanged texture/draw counts.
      It now also drives the full non-final victorious `finishSinglePlayerInit`
      branch in the focused ScoreScreen hook build, verifying mission
      advancement, `SaveAndContinue`, saved-text visibility, and hook-counted
      mission-save/message-cleanup/transition edges without adding Bink frames.
      It now also drives the non-challenge defeat/retry branch in the focused
      hook build, verifying `Retry`, no mission advancement, no mission save,
      hidden saved-text, message-cleanup, and transition edges without adding
      Bink frames. It now also drives the challenge win/loss branches in the
      focused hook build, verifying challenge UI text/portrait/backdrop
      updates, mission save/retry behavior, transition suppression, and
      win/loss audio events without adding Bink frames.
      Full original InGameUI, campaign-owned load-screen setup,
      full production Challenge persona setup from the normal shell/INI path,
      full non-test
      `finishSinglePlayerInit` subsystem edges, production
      `SkirmishBattleHonors` persistence / real `GameLODManager` singleton
      ownership, and Bink/audio sync remain open.
      `test:bink-videoplayer-runtime` now
      proves an original `BinkVideoPlayer`-owned wasm flow can `init`, register
      the shipped videos, open/load `BinkVideoStream`s, and exercise
      ready/decompress/render/advance/seek/close against the real BIK payloads
      with the sidecar manifest present while keeping decode readiness false
      in the no-browser-hook node path.
      `verify:bink-runtime-callsite-frontier` now pins the source-only
      original Bink runtime *callsite* frontier that this runtime-wiring work
      must preserve (the `W3DGameClient::createVideoPlayer` `NEW BinkVideoPlayer`
      factory, `GameClient::init` `TheVideoPlayer` ownership path,
      `BinkVideoPlayer::open/createStream/load` `m_handle`/`BinkSetVolume`
      contract, the representative `Display`/`InGameUI`/`WindowVideoManager`/
      `LoadScreen`/`ScoreScreen` frame loops, the `LoadScreen` min-spec
      `frameGoto(frameCount())` skip path, the `VideoBuffer`/`W3DVideoBuffer`
      lock/unlock/format/pitch contract, and the existing CMake compile
      frontier target); it keeps runtime playback and open-frame upload open
      and does not claim them complete.
      `verify:bink-ingameui-movie-frontier` now pins the source-only
      InGameUI movie ownership contract specifically: the header method/field
      surface, constructor initialization, `InGameUI::update` main and cameo
      frame-loop order, `playMovie`/`stopMovie` buffer and stream ownership,
      `playCameoMovie`/`stopCameoMovie` `RightHUD` buffer attachment, and the
      original CommandXlat / ScriptActions entry points. It is source-only:
      a focused runtime `InGameUI` instantiation currently pulls the broad
      ControlBar/GameLogic/ScriptEngine link surface, so runtime InGameUI
      movie playback remains open.
      `verify:bink-loadscore-movie-frontier` now pins the source-only original
      load-screen and score-screen movie ownership contract: `LoadScreen.h`
      video buffer/stream fields, `SinglePlayerLoadScreen::init` and
      `ChallengeLoadScreen::init` mission-movie open/buffer/frame/draw loops,
      challenge portrait/VS overlay `WindowVideoManager` movie calls, and the
      `ScoreScreen` final-victory `PlayMovieAndBlock` blank-window playback
      path. It now also pins the focused runtime proof that installs the gated
      ScoreScreen blank-layout hook, links `zh_score_screen_movie_runtime`,
      calls original `PlayMovieAndBlock("VS_small")`, drives the extracted
      ScoreScreen final-campaign movie helper through a real
      `CampaignManager` / `Campaign` / final-`Mission` transition, calls original
      `finishSinglePlayerInit` through a focused non-final victorious
      two-mission campaign with hook-counted mission-save/message-cleanup/
      transition edges, calls original `finishSinglePlayerInit` through a
      focused non-challenge defeat/retry campaign with hook-counted no-save/
      message-cleanup/transition edges, calls original `finishSinglePlayerInit`
      through focused challenge win/loss branches with challenge UI/audio and
      transition-suppression assertions, calls original
      `SinglePlayerLoadScreen::init` through a gated movie/campaign hook, and
      calls original `ChallengeLoadScreen::init` through a focused
      `CampaignManager` / `ChallengeGenerals` campaign/persona setup. The
      browser harness now expects 12 open/close lifecycles, 766 total copies,
      766 draw-buffer indexed draws, 13 texture creates, 779 texture updates,
      and 12 texture releases. It
      does not claim runtime InGameUI, full campaign-owned load-screen setup,
      full production Challenge persona setup from the normal shell/INI path,
      full non-test
      `finishSinglePlayerInit` subsystem edges, production
      `SkirmishBattleHonors` persistence / real `GameLODManager` singleton
      ownership, or Bink/audio sync complete; the
      broader CampaignManager/GameInfo/GameWindow layout/LOD/shell/GUI
      singleton path still needs to link and be harness-driven.
      `verify:bink-browser-sidecar-contract` also pins the sidecar manifest
      schema/path, BIK source-to-WebM metadata association, original-style path
      aliases (`Data\Movies\<name>.bik` and
      `Data/<lang>/Movies/<name>.bik` resolving to `<name>.webm`), and the
      invariant that `WasmBinkProviderCanDecodeFrames` is false without the
      browser copy hook and hook-gated when `BinkCopyToBuffer` delegates a
      decoded sidecar pixel copy into wasm memory.
      `verify:bink-w3d-video-buffer-upload-frontier` now pins the next
      source-only upload/presentation frontier from original
      `BinkVideoStream::frameRender` through the abstract `VideoBuffer`
      contract, original `W3DVideoBuffer` surface/texture ownership, and the
      browser D3D8 texture update hook. It also pins the new
      `test:bink-w3d-video-buffer-browser` runtime proof; the same smoke now
      has the `test:bink-w3d-video-presentation-browser` alias for the joined
      display presentation proof and pins the focused original
      `Display::playMovie/update/stopMovie` path plus the focused original
      `WindowVideoManager::playMovie/update/reset` path that owns a
      `GameWindow` video buffer, and now also pins the focused
      blank-window `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`, plus the original
      `ScoreScreen::PlayMovieAndBlock("VS_small")` runtime loop, focused
      original `SinglePlayerLoadScreen::init("VS_small")` runtime loop, and
      focused original `ChallengeLoadScreen::init` runtime loop through a real
      `CampaignManager` / `ChallengeGenerals` campaign/persona lookup for
      `GC_Background` plus `VS_small`/`VSSmall` child movies, plus the
      extracted ScoreScreen final-campaign movie helper with hook-counted
      stats/LOD gates and low-res skip, plus the hook-counted non-final
      victorious and defeat/retry `finishSinglePlayerInit` branches.
      Full original
      InGameUI, campaign-owned load-screen setup, full production Challenge
      persona setup from the normal shell/INI path, full non-test
      `finishSinglePlayerInit` subsystem edges, and Bink/audio sync ownership
      remain open.
      `verify:bink-w3d-video-presentation-frontier` now pins the source-only
      *presentation* contract from the original Bink/W3D video-buffer upload
      to final `W3DDisplay::drawVideoBuffer` presentation: it asserts
      `drawVideoBuffer` casts to `W3DVideoBuffer*` and drives the
      display-owned `Render2DClass`
      (`Reset` -> `Enable_Texturing(TRUE)` -> `Set_Texture(vbuffer->texture())`
      -> `Add_Quad(RectClass(startX,startY,endX,endY), Rect(0,0,1,1))` ->
      `Render`) in order, and that `createVideoBuffer` creates the
      `W3DVideoBuffer` through the original
      `DX8Wrapper::Get_Current_Caps()` / `D3DFMT` format-selection path. It
      is honest that the same `Render2DClass` textured-quad primitive has
      browser-backed coverage via `test:ww3d-display-drawimage-file`, and
      `test:bink-w3d-video-presentation-browser` now provides the runtime
      decoded-Bink-frame screenshot proof for this focused path, including
      focused original `Display::playMovie/update/stopMovie` ownership and
      focused original `WindowVideoManager::playMovie/update` ownership of
      the attached `GameWindow` video buffer, plus a focused blank-window
      `WindowLayout::load("Menus/BlankWindow.wnd")` /
      first-window `WinInstanceData::setVideoBuffer` path shaped like
      `ScoreScreen::PlayMovieAndBlock`, and now the focused original
      `ScoreScreen::PlayMovieAndBlock("VS_small")` loop itself, plus focused
      final-campaign stats/LOD and low-res skip coverage, plus focused
      original `SinglePlayerLoadScreen::init("VS_small")` and
      `ChallengeLoadScreen::init` runtime loops, with the Challenge path now
      covering focused campaign/persona lookup, plus the extracted
      ScoreScreen final-campaign movie helper, plus the hook-counted non-final
      victorious, defeat/retry, and challenge win/loss `finishSinglePlayerInit`
      branches. The full
      original InGameUI,
      campaign-owned load-screen setup, full production Challenge persona setup
      from the normal shell/INI path, full non-test `finishSinglePlayerInit`
      subsystem edges, and Bink/audio sync flows still need runtime ownership of that path, though the
      load/score source contract and focused ScoreScreen/SinglePlayer/Challenge
      runtime proofs are pinned by `verify:bink-loadscore-movie-frontier`.
      `verify:bink-audio-sync-frontier` now pins the source-only Bink
      *audio-sync* handoff frontier that future browser Bink playback must
      preserve: `BinkVideoPlayer::init` calling `VideoPlayer::init()` then
      `initializeBinkWithMiles()`, `deinit` releasing the Bink handle before
      the base deinit, `initializeBinkWithMiles` feeding `TheAudio->
      getHandleForBink()` to `BinkSoundUseDirectSound()` with a
      `BinkSetSoundTrack(0,0)` muted-video fallback, `createStream` deriving
      the per-stream volume from `TheAudio->getVolume(AudioAffect_Speech)` and
      calling `BinkSetVolume`, `notifyVideoPlayerOfNewProvider` tearing the
      handoff down on provider loss and re-establishing it on provider gain,
      the abstract `AudioManager` / `VideoPlayer` Bink handle boundary, and
      `MilesAudioManager` ownership of the `m_binkHandle` `PlayingAudio`
      member (destructor leak-assert + release, `getHandleForBink` 2D-sample
      + `AIL_get_DirectSound_info` handoff, `releaseHandleForBink` release,
      and `selectProvider`/`unselectProvider` driving the gain/loss notify).
      It is source-only and does NOT complete runtime Bink audio playback,
      per-frame audio-clock frame progression (`BinkWait`), or a Web Audio /
      DirectSound handoff; those remain open.
- [ ] Logo / intro movie plays.
- [ ] Mission briefing / cutscene playback with audio sync.
- [ ] In-engine video surfaces (e.g. comms video) render to a texture.
- [ ] Skippable; integrates with game flow/state machine.

---

## M9 — Networking (GameSpy / LAN → WS/WebRTC)

- [ ] Re-target UDP transport (`udp.cpp`, `Transport`) onto WebRTC DataChannel
      or a WebSocket relay. The browser harness now has a first relay-shaped
      byte-path proof: `browserNetworkRelayProbe` asks wasm to serialize a
      real original `NetPacket` frame-info command with `NetPacket::addCommand`,
      carries the packet hex between two logical browser clients through a
      harness relay queue, then asks wasm to parse it with
      `NetPacket::ConstructNetCommandMsgFromRawData`. This proves the original
      packet codec can cross the wasm/browser boundary. `browserNetworkTransportRelayProbe`
      now carries a two-command original packet through the same relay queue,
      injects a frame-info packet into `Transport::m_inBuffer`, runs
      `ConnectionManager::doRelay` to seed the original frame command count,
      then parses the delivered two-command packet and feeds its synchronized
      `NETCOMMANDTYPE_RUNAHEAD` through `FrameDataManager::addNetCommandMsg` /
      `allCommandsReady`. `network_two_contexts_smoke.mjs` now boots two
      isolated Playwright browser contexts / wasm instances, relays only the
      packet hex through Node, and proves the destination context reaches the
      same original `Transport` / `ConnectionManager` / `FrameDataManager`
      readiness path. `network_websocket_transport_smoke.mjs` now initializes
      original `Transport`, calls `Transport::queueSend` and
      `Transport::doSend` so the wasm browser UDP adapter captures one
      encrypted `TransportMessageHeader` + payload datagram, carries that
      datagram as a browser-native `WebSocket` binary frame through the relay,
      pushes it into the destination adapter, calls original
      `Transport::doRecv`, and hands that populated transport to
      `ConnectionManager::doRelay` / `FrameDataManager::allCommandsReady`.
      `npm run verify:websocket-transport-frontier` now pins the wasm UDP
      adapter behind the original concrete non-virtual `UDP` API. The live
      endpoint follow-on now uses `EM_JS` hooks in `UDP::Write` / `UDP::Read`
      (`Module.cncPortBrowserUdpSend` / `Module.cncPortBrowserUdpRecv`) plus
      a JS-owned WebSocket endpoint queue in `bridge.js`; the new
      `network_websocket_live_transport_smoke.mjs` proves two isolated browser
      contexts can move the encrypted original Transport datagram through that
      live endpoint into destination `Transport::doRecv`,
      `ConnectionManager::doRelay`, and `FrameDataManager::allCommandsReady`.
      The LANAPI follow-on now uses the same live endpoint for original
      `LANAPI::RequestGameStart`: `lanapi_live_game_start_smoke.mjs` boots two
      isolated browser contexts, lets the host's original LANAPI transport send
      a broadcast `MSG_GAME_START` datagram through
      `Module.cncPortBrowserUdpSend`, lets the joiner receive it through
      `Module.cncPortBrowserUdpRecv` during `LANAPI::update`, and verifies
      `handleGameStart` / `OnGameStart` create the original
      `Network::initTransport` / `parseUserList` state. The remaining
      production step is to extend this live endpoint into the
      `Network::update` frame-sync loop and validate a two-client match-sync
      harness.
- [ ] Lockstep frame sync (`FrameData`/`FrameDataManager`/`ConnectionManager`)
      works across browser clients. The LAN game-start vertical now reaches
      original `NetworkInterface::createNetwork`, `Network::init`,
      `Network::initTransport`, and `ConnectionManager::parseUserList` for
      both host and joiner, and the single-context follow-on now drives
      `Network::update` through `GetCommandsFromCommandList`,
      `processCommand`, `ConnectionManager::allCommandsReady`,
      `FrameDataManager::allCommandsReady`, `timeForNewFrame`, and
      `RelayCommandsToCommandList` far enough to prove the first
      `frameDataReady` transition. The multi-frame follow-on now drives three
      `Network::update` calls after LAN game-start, resets `TheCommandList`
      between calls to model command consumption, hard-asserts the first-frame
      readiness transition, observes later calls preserving the in-game
      connection state, and also proves the original
      `FrameData::allCommandsReady` not-ready/resend states used at the desync
      frontier. The live endpoint now carries LANAPI game-start into
      `OnGameStart` and original network setup across two browser contexts.
      Deferred next networking slice: route `Network::update` frame commands
      over the live shared WebSocket/WebRTC endpoint and extend coverage from
      single-context frame readiness to a two-client match-sync harness after
      the rendering/input/gameplay verticals are further along.
      The current WebSocket binary vertical now proves the production encrypted
      `Transport::queueSend` / `Transport::doSend` and
      `Transport::doRecv` path over browser binary frames through the wasm UDP
      adapter and live JS endpoint.
- [ ] LAN API (`LANAPI`) over a browser-discoverable transport / relay. The
      first announce/discovery slice now reaches `LANAPI::update`,
      `handleGameAnnounce`, `ParseGameOptionsString`, and `OnGameList`; the
      join/options slice now drives `RequestGameJoin`, `handleRequestJoin`,
      `handleJoinAccept`, and `handleGameOptions` across two isolated browser
      contexts via queued `Transport` bytes; the game-start slice now drives
      `RequestGameStart`, `handleGameStart`, and `OnGameStart` into original
      `NetworkInterface` setup plus `MSG_NEW_GAME`/seed/map side effects; the
      update slice now advances that setup through original `Network::update`
      into first-frame readiness. The WebSocket binary transport smoke removes
      the Node-mediated packet-hex handoff for the GameNetwork packet vertical,
      and `lanapi_websocket_flow_smoke.mjs` now carries LAN announce,
      join/options, and game-start messages through browser `WebSocket` binary
      frames before handing them to the original LANAPI accept paths. The live
      endpoint follow-on now wires original LANAPI game-start send/receive
      through `Transport::update` and `LANAPI::update`; LANAPI still needs that
      live endpoint carried forward into the running `Network::update`
      frame-sync loop.
- [ ] GameSpy matchmaking/chat (`GameSpy*`) → modern relay or stub gracefully.
- [ ] NAT/firewall helpers replaced by WebRTC ICE.
- [ ] Cross-client **determinism** validated (no desync) over many frames.
      The current multi-frame update/desync smoke is still single-context: it
      proves original `Network::update` progression, first-frame readiness,
      and `FrameData` not-ready/resend states, not two browser clients using
      the live endpoint to stay synchronized in a running match.
- [ ] File transfer / map transfer path.
- [ ] Harness: drive a 2-client match in two headless contexts; assert in sync.
      The current browser network relay proofs now include two isolated
      Playwright contexts, a live WebSocket-backed UDP endpoint for original
      `Transport::doSend`/`doRecv`, live LANAPI game-start into
      `Network::initTransport` / `parseUserList`, and original
      `ConnectionManager` frame-info relay plus `FrameDataManager` readiness,
      but they are still setup/packet/frame readiness proofs rather than a
      match-sync test.

---

## M10 — Hardening, content, polish

### Performance & memory

**DEFERRED — correctness first.** None of the items below are current work.
The active frontier is correctness through the real boot (map load, shell/
campaign rendering, units, input, playable skirmish — see the strategy
section at the top). Slow frames are expected and acceptable for now: the
whole surface is a Debug (-O0) build behind an unoptimized D3D8→WebGL2 layer,
so today's fps numbers say nothing we need to act on yet. Pick these up only
when a correctness milestone (playable skirmish) makes speed the frontier —
and then start with the PROFILE, not with any individual fix.

- [x] **Low-hanging perf: gate per-draw harness diagnostics behind a
      graphics-diagnostics level** (Fable's audit). The hot path
      (`bridge.js` `paintD3D8DrawIndexed`) was paying, on EVERY indexed draw,
      for two `gl.readPixels` GPU-sync flushes (`preDrawCenterPixel` +
      `centerPixel`), a ~40-field probe with per-draw texture sampling, and a
      spread-copied `d3d8DrawHistory` array — plus a post-clear readPixels and
      viewport self-verification. Added a `d3d8DiagLevel` (`full` default | `lite`),
      settable via `?diag=` URL param and `globalThis.__cncSetDiagLevel(...)`.
      **Default stays `full`** so every startup-vertical gate / regression smoke
      is untouched; `lite` skips the readPixels, probe, texture sampling,
      draw-history, post-clear sample, and viewport self-check while still doing
      the real draw. `play.mjs` (the human page) opts into `lite` (add
      `?diag=full` to restore) and now uses the minimal
      `realEngineFrameTick` RPC for its per-rAF loop. **Measured
      (SwiftShader shell map, 100 frames): full 1536.7 ms/frame (0.65 fps) →
      lite 156.3 ms/frame (6.4 fps), a ~10× speedup** — the per-draw diagnostics
      (two readPixels syncs + probe + draw-history) were ~90% of frame time, not
      the actual rendering. Metal should gain even more from the readPixels
      GPU-sync removal (measure there when convenient). (Deeper shim work —
      batching, Release build — stays below.)
- [x] Add a GPU-accelerated runtime frame profile harness.
      `harness/runtime_frame_profile.mjs` boots the real shell-map lifecycle,
      forces the requested graphics diagnostics level, runs warmup/settle
      frames until the scene is drawing, then emits renderer, wall-time,
      engine `lastFrameMs`, draw/scene counters when using the summary RPC,
      and a screenshot. It can run on SwiftShader or Mac Chrome/Metal via
      `PERF_PROFILE_BROWSER_EXECUTABLE` / `PERF_PROFILE_BROWSER_ARGS`, and
      `profile:runtime-frames` gates the build + profile command.
- [x] Lightweight `realEngineFrame` mode for interactive loops.
      `cnc_port_real_engine_frame_tick` / `realEngineFrameTick` run the same
      real `GameEngine::update()` frame path but return only the minimal
      frame/exception timing JSON and skip stdout frame logging,
      `snapshotState()`, and expanded client-state summary serialization.
      `play.html` now uses that RPC for the human rAF loop while the verbose
      `realEngineFrame` and `realEngineFrameSummary` endpoints remain the
      verification surface. Mac M4 Chrome/Metal shell-map profile:
      summary single-frame mode measured 99.5 ms/frame wall with 76.6 ms
      engine `lastFrameMs`; tick mode measured 77.4 ms/frame wall with
      76.5 ms engine `lastFrameMs`.
- [ ] **Deep profile before D3D8 shim surgery**: a Chrome DevTools performance
      capture on the Mac (real GPU) of a live shell-map/skirmish session,
      splitting each ~frame into (a) engine wasm CPU, (b) GL/ANGLE wait
      (sync stalls), (c) harness/RPC overhead (`lastFrameMs` vs wall time
      separates this today). The runtime frame profile now also reports
      cumulative browser D3D8 draw/upload/readback/FBO call deltas and proved
      `diag=lite` has no warmup readbacks; DevTools is still needed before
      changing buffer/shader/draw submission internals that might be dominated
      by asynchronous ANGLE/GPU stalls.
- [ ] **Try a per-frame draw command buffer to collapse per-draw wasm↔JS
      crossings (structural complement to the per-draw uniform caching above).**
      Profiles prove the sorted cost is *submission* (`sortedDrawUniformMs`
      ~7.7 ms, `browserDrawIndexed`), not the sort (~0.01 ms) or the GL draw
      (~0.02 ms): it is the per-draw EM_JS boundary crossing (27-arg call, ~5
      matrix copies + state block, ~500/frame). The W3D `SortingRenderer` is
      designed around D3D8's "thousands of tiny state-changing draws are free"
      (transparent polys are depth-sorted → can't batch by material → ~1
      draw/particle); D3D8 ate that, the wasm↔JS boundary does not, so cost
      scales linearly with particle count — the root of the shell-map particle
      FPS death-spiral (goal is to *handle* the particles, NOT cull via
      dynamic-LOD `m_dynamicParticleSkipMask`). Idea: have
      `DX8Wrapper::Draw`/`browser_draw_indexed` *append* each draw (indices into
      the shared dynamic VB + a state/uniform token) into a wasm-heap command
      list, then cross to JS **once per frame** and replay into WebGL. WebGL
      still issues N `drawElements` (cheap), but you kill N boundary crossings +
      ~N×5 matrix allocations. Attacks the *number* of crossings; the uniform
      cache attacks *cost per* crossing — they compose, and the same shape may
      help remaining ordered Render2D/text draws after the W3DDisplay GUI batch.
      Verify against shell-map goldens; re-measure
      `sortedDrawUniformMs`/`browserDrawIndexed` + particle-count-vs-FPS. (by Claude)
- [ ] **Profile a LOADED skirmish (hundreds of units) — the real perf target,
      never yet measured.** All perf work to date optimizes the ~9 ms shell-map
      background; the scene that actually matters (an active battle with
      hundreds of units, AI, pathfinding, projectiles, particles) has never
      been profiled, so we do not know where its frame time goes — render vs
      sim (`TheGameLogic->update`) vs AI/pathfind vs partition manager. This is
      the PREREQUISITE that tells us whether large perf wins remain and where;
      until it exists, shell-map micro-caching is tuning a scene that is already
      fast (110 fps). Action: drive the harness to a populated mid-battle state
      on the release build, capture the C++ phase breakdown (`TheGameLogic->
      update` vs `TheDisplay->DRAW` vs the W3D render buckets) AND p95/p99 + max
      frame time (not just average), and record the top buckets. Only then pick
      the next structural target. 2026-07-07: the prerequisite harness path is
      now in place via `PERF_PROFILE_SCENE=skirmish`; it drives Main Menu ->
      Single Player -> Skirmish -> Start and then runs the existing runtime
      profiler in active gameplay. The first Mac M4/Metal release producer run
      (`runtime-frame-profile-skirmish-mac.json`) measured an initial base
      scene, not a loaded battle: 224 objects/drawables, 4 rendered objects,
      164 draws/frame, engine `lastFrameMs` avg 6.10, p95 6.5, p99 6.8, max
      9.3, with draw producers led by heightmap tile draws and volumetric
      shadow draws. Keep this TODO open until the harness can create/load a
      populated mid-battle scene with AI/pathfinding/projectiles/particles.
      (by Claude)
- [ ] **WebGL2 instanced rendering for repeated meshes (draw-count collapse on
      loaded scenes).** A real battle draws dozens/hundreds of identical
      unit/structure models, each currently a separate draw. Use
      `drawElementsInstanced` (WebGL2 core) to render all instances of one mesh
      in a single call, feeding per-instance world matrix (+ house-color/team
      tint) through an instanced vertex-attribute buffer instead of per-draw
      uniforms. Requires the generated fixed-function shaders to read an
      instance-matrix attribute rather than a uniform world/view/proj — real
      shader surgery. Biggest expected win on LOADED skirmish scenes (many
      repeated models), not the shell map. Composes with the per-frame command
      buffer above: the buffer collects instances, then issues one instanced
      draw per mesh. Verify on a loaded battle: draw count + wall time
      before/after. (Promoted from the buried draw-side future note; by Claude)
- [ ] **Eliminate per-draw JS allocation churn (GC-pause jitter).** The D3D8
      draw bridge still creates short-lived JS payload/state objects per draw.
      The old matrix-copy path has been reduced in slices (cached texture
      transforms, then raw world/view/projection pointers), but per-draw
      payload objects, derived state objects on cache misses, material/light/
      clip arrays, and bridge scaffolding can still drive V8 GC pauses — a
      prime suspect for the "frame time jumps around / no steady 30 fps" jitter
      (see the frame-stability item). Fix: keep chipping away at materialized
      arrays/objects on the hot path, reuse scratch storage where values must
      cross into JS, and skip rebuilding state objects on cache hits. Largely
      subsumed by the per-frame command buffer (one crossing, no per-draw
      payload object) but worth doing directly if the command buffer slips.
      2026-07-08: world/view/projection now pass as raw wasm
      pointers instead of new `HEAPF32.subarray()` view objects and are copied
      into reusable draw-scratch matrices; cached texture transform
      `Float32Array`s retain their no-copy path. The profile counters show zero
      allocated matrix copies on local SwiftShader and Mac M4/Metal real-GPU
      runs. 2026-07-08: wasm-driven indexed draws now also reuse the outer
      EM_JS payload object and its nested transform shell; the local
      `runtime-frame-profile-reused-payload-local.json` shell-map profile
      reports 236.375 payload calls/frame and 236.375 reused payloads/frame.
      This removes the per-draw matrix-view/allocation slice and the outer
      payload object allocation, but the TODO stays open for remaining derived
      state objects, material/light/clip arrays, broader zero-copy / command
      buffering, and DevTools memory proof of reduced GC frequency.
      Verify future work with p95/p99 frame time + a DevTools memory timeline.
      (by Claude)
- [ ] **Optimize the real `HeightMap.render.tilePasses` bucket, not terrain
      sidecars**: recent Mac profiles prove base terrain tile passes remain a
      recurring real render bucket (`HeightMap.render.tilePasses.before`
      sampled at 17.1 ms before sorted-run merging, 7.375 ms after sorted-run
      merging, 7.495 ms after water-track batching, and 7.115 ms on the final
      shadow-VAO sampled frame). The final shadow-VAO sample also showed
      `HeightMap.render.shoreLines.before` at 12.16 ms and
      `HeightMap.render.terrainTracks.before` at 4.255 ms, so reprofile and
      split heightmap tile/shore/track submission before assuming which terrain
      subpath is recurrent versus sample variance. The profile-only tile split
      and D3D8 bound-checksum A/B proved raw `capture_bound_draw()` checksum
      removal is a measured regression on M4/Metal: it drops the CPU
      `captureBound` bucket but increases wall time by shifting stalls into
      later terrain/GL buckets. Keep bound diagnostics enabled by default.
      2026-07-06 terrain-track pass: final static-index/identity-transform
      profile measured 38.26 ms/frame wall / 36.82 ms average engine
      `lastFrameMs` on Mac M4 Metal, with `W3DTerrainTracks.flush.unlock.before`
      visible at 3.05 ms/frame and `WasmD3D8.browserDrawIndexed.before` at
      5.10 ms/frame. A dynamic per-frame terrain-track index batching attempt
      reduced browser draw-submit cost but added a larger buffer-unlock spike,
      so it was not kept. Next pass should continue with base tile/shoreline
      bursts or a separate padded/static terrain-track batching experiment,
      not per-frame index uploads. 2026-07-07 native derived draw-state
      caching reduced targeted D3D8 bridge buckets in a same-machine Mac M4
      Chrome/Metal A/B against `d3290787`: `drawBound.capture.before` dropped
      from 0.52 ms to 0.18 ms on the last profiled frame, while
      `browserDrawIndexed.before` stayed effectively flat (3.16 ms -> 3.18 ms)
      and total wall time was neutral/slightly better (40.43 -> 40.32 ms/frame;
      engine average 39.03 -> 38.89 ms/frame). Treat this as bridge cleanup,
      not a terrain-frontier fix: the next performance pass should still
      split/optimize base terrain tile/shoreline bursts or static
      terrain-track batching. A follow-up partial-lock pass for terrain-track
      vertices now locks only the packed visible prefix instead of the whole
      dynamic track pool; Mac M4 Chrome/Metal profiles reduced buffer
      upload traffic from 2.29 MB/frame to ~1.81 MB/frame and tracked browser
      D3D8 work from 13.82 ms/frame to 8.64 ms/frame in the final run, with
      wall time 40.32 -> 39.41 ms/frame. The next pass should reprofile the
      remaining terrain tile/shoreline buckets before attempting broader
      draw-command buffering. A same-day exact shoreline batch pass made the
      sorted shoreline renderer lock/upload only the visible tiles collected
      for each batch and fixed its zero-count / end-of-array sort guards. The
      direct Mac M4 Chrome/Metal no-sample profile reduced buffer upload
      traffic from 1.814 MB/frame to 1.771 MB/frame, buffer update time from
      8.27 to 7.15 ms/frame, and tracked browser D3D8 work from 8.64 to
      7.91 ms/frame; sampled profiles also reduced `browserDrawIndexed.before`
      from 7.21 to 5.15/5.82 ms/frame. Total wall time is still noisy/neutral,
      so keep this item open and continue from current profiles rather than
      claiming the whole heightmap frontier is drained. A follow-up native
      bound-draw checksum cache preserved diagnostics while making repeated
      static buffer ranges revision-keyed cache hits. Mac M4 Chrome/Metal
      release repeats reduced `WasmD3D8.DrawIndexedPrimitive.captureBound.before`
      from ~9.6 ms/frame to 0.27 ms/frame, tracked browser D3D8 work from
      7.69-7.91 ms/frame to 0.66-2.93 ms/frame, and buffer update time from
      ~7.1 ms/frame to 0.52-2.77 ms/frame; total wall time was still noisy
      (41.78-45.31 ms/frame), so continue profiling the next wall-time stall
      instead of disabling diagnostics wholesale. 2026-07-07 buffer-upload
      census: the runtime profile now breaks upload traffic down by
      vertex/index, dynamic, `DISCARD`, `NOOVERWRITE`, orphan, and resize
      counters. The current Mac M4 Chrome/Metal shell-map profile measures
      386.3 updates/frame and 1.69 MiB/frame uploaded, dominated by dynamic
      vertex-buffer ring writes (289.0 vertex updates/frame, 1.54 MiB/frame;
      362.7 `NOOVERWRITE` updates/frame, 1.02 MiB/frame). Only 8.7
      `DISCARD`/orphan updates happen per frame and there are zero resizes, so
      the next pass should reduce/coalesce real dynamic `NOOVERWRITE` upload
      bursts instead of toggling orphan behavior or disabling bound
      diagnostics. A same-day shoreline static-VB pass moved stable shoreline
      vertices out of the per-frame dynamic ring and left only visible dynamic
      indices; the final Mac M4 Chrome/Metal profile measured 186.6
      updates/frame, 0.91 MB/frame uploaded, 0.38 MB/frame dynamic uploads,
      0.31 MB/frame `NOOVERWRITE` uploads, and 0.088 ms/frame in
      `bufferSubDataMs`. A same-day producer-attribution pass now labels D3D8
      buffer uploads from the current engine profile marker. The Mac M4/Metal
      sanity profile with `PERF_PROFILE_D3D8_BUFFER_PRODUCERS=1` measured the
      remaining one-frame upload mix at 326 KB/frame, led by water surface
      vertices (140.5 KB), terrain extra-blend (48.1 KB), volumetric shadow
      VB/IB uploads (46.6 KB + 23.3 KB), shoreline indices/verts (44.8 KB), and
      water-track batch unlock (18.2 KB). Next pass: reduce or static-cache
      those concrete water/terrain/shadow producer byte ranges before touching
      generic JS-side orphaning or checksum policy. A follow-up exact-range
      pass fixed `drawTrapezoidWater()` over-allocation: the helper now uploads
      only the `(uCells + 1) * (vCells + 1)` vertices it writes and only the
      `rectangleCount * 6` indices it fills. The Mac M4/Metal sanity profile
      `runtime-frame-profile-water-exact-ranges-mac.json` dropped total
      measured one-frame upload traffic from 326.3 KB to 267.6 KB and
      `W3DWater.render.renderWater.before` from 140.5 KB to 82.0 KB at the same
      137 update calls. A follow-up exact-range pass fixed
      `renderExtraBlendTiles()` over-allocation: the helper now pre-counts the
      visible third-blend tiles and locks only those vertex/index ranges. The
      Mac M4/Metal sanity profile
      `runtime-frame-profile-extra-blend-exact-ranges-mac.json` dropped total
      measured one-frame upload traffic to 222.3 KB and
      `HeightMap.render.extraBlend.before` from 48.1 KB to 2.4 KB. Next
      dynamic shadow replay removed the redundant second-pass shadow geometry
      uploads: `runtime-frame-profile-dynamic-shadow-replay-mac.json` measured
      79 buffer updates, 186.6 KB/frame uploaded, and dynamic shadow VB/IB
      unlocks down to 29+29 updates / 23.3 KB + 11.7 KB. A follow-up cached
      flat-water index-buffer pass removed the per-frame flat-water dynamic
      index upload: `runtime-frame-profile-flat-water-static-ib-mac.json`
      measured 78 buffer updates, 170.7 KB/frame uploaded, and
      `W3DWater.render.renderWater.before` down to one vertex-only 65.1 KB
      update. Shoreline index ranges are now static-cached too:
      `runtime-frame-profile-shoreline-static-ib-mac.json` measured 70 buffer
      updates, 125.4 KB/frame uploaded, and no shoreline dynamic upload
      producer. Next concrete frontier: animated water surface vertices,
      dynamic volumetric shadow VB/IB uploads, and water-track batch unlock. A
      follow-up flat-water vertex-format pass moved the animated water surface
      to a narrower dynamic `XYZDUV2` buffer:
      `runtime-frame-profile-flat-water-xyzduv2-mac.json` measured 70 buffer
      updates, 107.6 KB/frame uploaded, and
      `W3DWater.render.renderWater.before` down to 47.4 KB. Next concrete
      dynamic-shadow pass coalesced the first-pass dynamic shadow geometry into
      chunk-level uploads:
      `runtime-frame-profile-dynamic-shadow-batch-mac.json` measured 14 buffer
      updates, 107.8 KB/frame uploaded, and dynamic shadow VB/IB producers down
      to 1+1 updates / 23.3 KB + 11.7 KB. Next concrete byte frontier:
      exact dynamic shadow bytes and water-track batch unlock. A follow-up
      flat-water texture-factor pass moved constant flat-water tint/alpha out
      of the vertex payload and narrowed the dynamic surface to `XYZUV2`:
      `runtime-frame-profile-flat-water-xyzuv2-tfactor-mac.json` measured 14
      buffer updates, 102.1 KB/frame uploaded, and
      `W3DWater.render.renderWater.before` down to 41.4 KB. Further flat-water
      byte reductions would need shader/generated-UV work or a custom packed
      vertex format. A current release reprofile then showed shoreline draw
      fragmentation, not upload time, as the next local wall-time target; the
      thresholded shoreline visible-index path uses dynamic indices only for
      batches that would exceed four static draw ranges.
      `runtime-frame-profile-shoreline-threshold4-final-mac.json` measured
      9.05 ms/frame wall vs 9.41 ms/frame in the same-session baseline,
      `HeightMap.render.shoreLines.before` 1.405 ms -> 0.200 ms, and draw
      calls 403.6/frame -> 319.4/frame. Next concrete PERF frontier:
      `WasmD3D8.browserDrawIndexed.before` and
      `W3DProjectedShadow.renderShadows.meshFlush.before`. A first
      projected-shadow receiver fast path skips clipped dynamic-index
      generation for meshes fully inside the projector cull volume, but the
      repeated Mac M4 profiles stayed within the same wall-time band; byte-tail
      work remains exact dynamic shadow bytes and water-track batch unlock. A
      road-upload A/B showed road bytes are not the next wall-time target:
      static-road and wider-cull experiments reduced or removed the road upload
      producer but regressed Mac M4 wall time, so leave the original
      per-visible-road upload path unless a future trace shows a road-specific
      stall.
- [ ] **Audit raw Direct3D stream/index binds before adding DX8Wrapper buffer
      identity caches**: water, snow, and shadow code call
      `SetStreamSource`/`SetIndices` directly on the D3D8 device, bypassing
      `DX8Wrapper`'s cached render state. Any future buffer-bind dedupe in
      `DX8Wrapper::Set_Vertex_Buffer` / `Set_Index_Buffer` must first mark
      these raw bind sites dirty or route them through the wrapper; otherwise
      the wrapper can skip a restore after a bypassed bind.
- [ ] D3D8→WebGL2 shim "less naive" playbook (ordered by typical payoff,
      all confined to the DX8Wrapper chokepoint; verify each against the
      screenshot goldens):
      - draw-state marshaling (Fable audit of `wasm_d3d8_shim.cpp:319-565`):
        the first passes split per-object world/view/projection transforms out
        of the native draw-state cache key while preserving the full hash for
        GL state/uniform correctness, promoted the EM_JS state-only payload
        cache to a small LRU, passes world/view/projection as transient HEAPF32
        views, uses `HEAPU8.subarray()` for buffer-update uploads, and avoids
        lite-mode vertex-buffer CPU mirrors while keeping index mirrors for
        fallback draw paths. Remaining work: remove/collapse the remaining
        copied texture-transform, clip, material, and light payloads and keep
        buffer profiling active while replacing dynamic uploads with real
        ring-buffer semantics.
      - never-sync audit: remove per-call glGetError/validation from the hot
        path; ensure no Lock/Present path reads back or waits on the GPU;
      - dynamic vertex/index buffer Lock(DISCARD/NOOVERWRITE) → orphaning /
        ring-buffer semantics (particles, UI, water live here);
      - shadow-state dedupe for SetRenderState/SetTextureStageState spam +
        generated-shader program cache keyed on the ShaderClass descriptor;
      - draw-call collapsing follow-up: the first `diag=lite` pass now merges
        conservative adjacent solid/Gouraud `D3DPT_TRIANGLELIST` draws with the
        same full state hash, buffers/layout, texture bindings, and contiguous
        index ranges. Remaining work is to make dynamic Lock(DISCARD/
        NOOVERWRITE) data share larger ring-buffer ranges, then broaden the
        same ordered-adjacent strategy where topology permits it. Never reorder
        across state changes.
      - `WEBGL_multi_draw` for same-state draws that are not contiguous in
        the buffer: N (offset,count) ranges in one boundary crossing — cuts
        submission chatter with no merging logic;
      - batch remaining wasm→JS GL chatter last (it is the 2x, not the 10x).
      NOT on the playbook (insanity tier, needs profiler proof of a
      submission-bound army scene first): general CPU pre-transform
      batching to defeat per-mesh world matrices (touches every vertex
      every frame), and WebGL2 instancing for repeated meshes (needs
      per-instance matrices in the generated shaders — real surgery).
- [ ] Frame-time budget; profile hotspots (sim vs render).
- [ ] Polish `harness/play.html` (human-driveable LAN page): per-archive mount
      progress, touch-input verification on a real phone, and a smaller
      mobile-friendly archive set if feasible.
- [ ] wasm memory tuning; detect/fix leaks; texture/audio memory caps.
- [ ] Consider threads (pthreads + SharedArrayBuffer, COOP/COEP) where it helps.
- [ ] Consider WebGPU backend as a successor to WebGL2.
- [ ] Asset streaming / caching strategy for large BIGs.

### Content completeness (Zero Hour)
- [ ] All factions + all generals' powers/upgrades/units load and play.
- [ ] Prove gameplay-fired laser weapons through the original object/weapon
      path. The runtime can now spawn and render shipped `W3DLaserDraw` +
      `LaserUpdate` beam drawables directly; a later gate should drive
      `Weapon::createLaser` / point-defense laser behavior from real objects
      and assert the same beam texture draws through normal gameplay.
- [ ] All skirmish maps load. The harness can now select a specific official
      multiplayer map with `SKIRMISH_START_MAP`; all 47 official maps boot to
      skirmish with `loadingMap=false`, `inputEnabled=true`, `objects > 0`,
      `renderedObjectCount > 0`, visible non-black canvas variance, and no
      traps. Remaining: AI behavior tuning and map-specific script fixes.
- [ ] Single-player campaign(s) playable (scripts, objectives, cinematics).
- [ ] Challenge mode (Zero Hour generals challenge).
- [ ] Save / load a game (serialization round-trips correctly).
- [ ] Options persist (graphics, audio, controls) via IDBFS.

### Robustness & compatibility
- [ ] Cross-browser: Chrome, Firefox, Safari (note WebCodecs/threads gaps).
- [ ] Mobile / touch viability (stretch).
- [ ] Error reporting + crash recovery; surfaced through harness.
- [ ] Handle context loss (WebGL context lost/restored).

### Base game
- [ ] Repeat the device re-targeting for `Generals/Code` (base game) once Zero
      Hour is stable (shares most device code).

---

## Cross-cutting: harness & verification (ongoing, never "done")

- [ ] Keep the RPC command surface growing with each subsystem (boot, menu nav,
      unit select/move/order, match start/step, state + log readback).
- [ ] Screenshot-diff regression suite for menus and in-game scenes.
      Extend the pixel gating that skirmish-start already has
      (`renderedObjectCount > 0` + non-black variance) to the per-map sweep
      artifacts (`artifacts/skirmish/sweep-*.json` currently record
      `renderedObjectCount` without asserting it), then add per-map
      SwiftShader screenshot goldens with a tolerance diff. First golden to
      add: a z-bias scene (bridges/overlays) so the 33641ab draw-order fix
      can't silently regress.
- [ ] Verify sustained gameplay 3D audio camera/source movement in active
      skirmish. The browser MSS bridge now applies real Miles listener
      position/orientation updates to `AudioContext.listener` and active sample
      `AIL_set_3D_position` updates to live `PannerNode`s, and
      `real_audio_event_smoke.mjs` proves an engine-driven 3D event receives
      listener + sample spatial updates on debug/release builds. Remaining:
      drive active skirmish camera movement with naturally triggered or
      long-lived positional sounds and assert panner/listener updates over
      gameplay frames.
- [ ] Deterministic-replay regression (record once, assert identical playback).
- [ ] Promote issue-dump replay from browser input/frame reproduction to an
      original-engine checkpoint once `Recorder.cpp`/save-load ownership is
      browser-safe: embed a real replay/savegame snapshot in `.cncdump.json`
      so agents can reproduce late-game reports even after long nondeterministic
      play sessions.
- [ ] Net-sync regression (two clients, assert no desync).
- [ ] Add per-step and page-RPC timeouts to long browser integration smokes.
      A 2026-07-02 `test:vertical-integrations` run reached
      `browser-lanapi-game-start-two-contexts` after the startup/archive/audio
      checks passed, then hung inside the Playwright RPC until manually
      interrupted. The 2026-07-02 `test:object-ini` silent hang is now fixed
      by per-step timeouts plus range-backed archive mounting; extend that
      same fail-with-browser-context pattern to the remaining long vertical
      smokes instead of leaving silent Playwright RPCs. A 2026-07-03
      lightweight post-campaign run showed the same observability problem for
      a large synchronous 300-frame rendered RPC: the browser stayed CPU-active,
      but the harness emitted no checkpoint until the call returned, so deep
      runs should keep small chunks or add timeout/progress instrumentation.
- [ ] CI runs build + harness smoke + screenshot diffs on every change.
- [ ] Document how to run the harness and interpret failures.

## Cross-cutting: project hygiene

- [ ] Keep `PROJECT.md`, `TODO.md`, and `DONE.md` updated as milestones move.
- [ ] `WebAssembly/shims/` contains a file literally named
      `GameLogic\Weaponset.h` (backslash IN the filename, matching a
      Windows-style `#include "GameLogic\WeaponSet.h"`). It works on
      byte-sensitive filesystems but is a tooling/rsync/case-volume
      landmine — verify intent, document it in shims/README, or replace
      with `-include`/path normalization.
- [ ] Track which original files are compiled, shimmed, or re-targeted (avoid
      accidental rewrites of platform-independent logic — see the hard rules).
- [ ] Record every browser-API bridge so the original-vs-port boundary stays clear.
