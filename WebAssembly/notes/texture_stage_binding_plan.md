# Texture Stage Binding Plan (WW3D / DX8 → WebGL2)

> Implementation note for the GLM coworker. Scope: what the original engine
> does *after* a `TextureClass` is created/updated/released, i.e. how a texture
> gets *bound* to a sampler and what stage/sampler/color-op state rides with it.
> This is the contract the browser shim (currently implementing
> create/update/release upload plumbing in `WebAssembly/src/wasm_d3d8_shim.*`
> and `WebAssembly/harness/bridge.js`, owned by the main agent) must surface.
>
> No code is changed here. References are to the **Zero Hour** tree
> `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/` unless noted.

## 1. The two-level binding model

WW3D does **not** call `IDirect3DDevice8::SetTexture` from the engine. All
binding goes through a deferred, redundant-state-tracked wrapper layer:

1. **Engine side (deferred).** `DX8Wrapper::Set_Texture(stage, TextureBaseClass*)`
   just stores the texture pointer into `render_state.Textures[stage]` and sets a
   dirty bit (`TEXTURE0_CHANGED << stage`). Nothing reaches DX8 yet.
   - `dx8wrapper.h:1189` `WWINLINE void DX8Wrapper::Set_Texture(...)`
   - `RenderStateStruct` (holds the dirty-tracked texture array):
     `dx8wrapper.h:180`, member `TextureBaseClass* Textures[MAX_TEXTURE_STAGES]`
     (`MAX_TEXTURE_STAGES = 8`, `dx8wrapper.h:76`).
   - Dirty mask enum: `dx8wrapper.h:210` `ChangedStates`
     (`TEXTURE0_CHANGED=1<<6 ... TEXTURE3_CHANGED=1<<9`, plus
     `TEXTURES_CHANGED`, `MATERIAL_CHANGED=1<<14`, `SHADER_CHANGED=1<<15`).

2. **Flush.** `DX8Wrapper::Apply_Render_State_Changes()`
   (`dx8wrapper.cpp:2237`, called automatically by `Draw*`) walks the dirty
   texture bits and calls either:
   - `render_state.Textures[i]->Apply(i)` — **the binding entry point**, or
   - `TextureBaseClass::Apply_Null(i)` (`texture.cpp:400`) → just
     `Set_DX8_Texture(stage, NULL)`.

Everything below is reached *only* through `TextureBaseClass::Apply` /
`ShaderClass::Apply`, which is why those are the natural seam for the
WebGL2 port.

## 2. `TextureClass::Apply(stage)` — what "bind a texture" really does

`texture.cpp:932`. Three responsibilities:

1. Lazy `Init()` (upload/lock-on-first-use) and `LastAccessed` bookkeeping.
2. **Bind the object:**
   ```cpp
   DX8Wrapper::Set_DX8_Texture(stage, Peek_D3D_Base_Texture());
   // or NULL when WW3D::Is_Texturing_Enabled() is false
   ```
3. **Sampler state:** `Filter.Apply(stage)` — see §3.

Notes:
- `TextureBaseClass` is the abstract base (`texture.h:59` forward-declares
  `IDirect3DBaseTexture8`; `texture.h:240` holds the `D3DTexture` pointer).
  `TextureClass` (`texture.h:310`), `CubeTextureClass` (`texture.h:422`),
  `VolumeTextureClass` (`texture.h:468`), and `ZTextureClass`
  (`texture.cpp:1266`) each override `Apply()`. The cube/volume variants are
  structurally identical (bind + `Filter.Apply`); `ZTextureClass` has its own
  depth-stencil-style path.
- The D3D base texture pointer is what the browser upload plumbing decorates
  with a stable browser texture ID; the browser D3D8 device shim must own the
  **bind** step reached through `Set_DX8_Texture(stage, tex)`, resolving that
  texture ID into "bind this uploaded WebGL texture to `gl.TEXTURE0 + stage`".

### 2a. `Set_DX8_Texture` — the actual device seam
`dx8wrapper.h:924` (`WWINLINE`, body inline):
- Redundant-state guard: `if (Textures[stage]==texture) return;`
- Shadow table: `static IDirect3DBaseTexture8* Textures[MAX_TEXTURE_STAGES];`
  (`dx8wrapper.h:671`).
- For stages `>= MAX_TEXTURE_STAGES` it bypasses the shadow and calls
  `DX8CALL(SetTexture(...))` directly (this is how `ShaderClass`'s Voodoo3
  "stage 2 diffuse" trick drives a 3rd stage, see §4).
- `DX8CALL(x)` (`dx8wrapper.h:133`) expands to
  `DX8Wrapper::_Get_D3D_Device8()->x` → `IDirect3DDevice8::SetTexture`.

**Contract for WebGL2:** the shim needs a per-stage "current bound texture"
shadow (already mirrored here) and a `SetTexture(stage, d3dTex)` route that
resolves `d3dTex` → WebGL texture handle → `gl.activeTexture(GL_TEXTURE0+stage)`
+ `gl.bindTexture(target, handle)`. Stage ≥ `MAX_TEXTURE_STAGES` paths can stay
un-shadowed since the engine only uses them for the legacy diffuse hack.

## 3. Sampler state via `TextureFilterClass::Apply(stage)`

`texturefilter.cpp:70`. Each `TextureClass` owns a `TextureFilterClass Filter`
member; `Apply(stage)` emits **six** stage states per bind:

| DX8 TSS state            | Source                          | WebGL2 equivalent                       |
|--------------------------|---------------------------------|-----------------------------------------|
| `D3DTSS_MINFILTER`       | `TextureMinFilter`              | `gl.texParameterf(TEXTURE_MIN_FILTER)`  |
| `D3DTSS_MAGFILTER`       | `TextureMagFilter`              | `gl.texParameterf(TEXTURE_MAG_FILTER)`  |
| `D3DTSS_MIPFILTER`       | `MipMapFilter`                  | combined into MIN_FILTER (mipmap modes) |
| `D3DTSS_ADDRESSU`        | `UAddressMode` (REPEAT/CLAMP)   | `gl.texParameterf(TEXTURE_WRAP_S)`      |
| `D3DTSS_ADDRESSV`        | `VAddressMode`                  | `gl.texParameterf(TEXTURE_WRAP_T)`      |

Enum mapping (`texturefilter.h:73`):
- `FilterType { NONE, FAST, BEST, DEFAULT }` → `D3DTEXF_{POINT,LINEAR,...}`
  via the static lookup tables `_MinTextureFilters / _MagTextureFilters /
  _MipMapFilters` populated in `_Init_Filters()` (`texturefilter.cpp:117`),
  which are themselves gated by `D3DCAPS8` (`TextureFilterCaps`).
- `TxtAddrMode { TEXTURE_ADDRESS_REPEAT, TEXTURE_ADDRESS_CLAMP }` →
  `D3DTADDRESS_{WRAP,CLAMP}`.

**Port note:** in WebGL2 these are sampler-object (`WebGLSampler`) or
per-texture-object parameters. Because DX8 stage states are *per-stage*, not
per-texture, a sampler-object-per-stage model (keyed on the 6-tuple) is the
cleanest match and avoids re-issuing `texParameter*` on every bind. The filter
value→GL enum translation is the responsibility of this seam; the engine never
sees GL enums.

`WW3D::Set_Texture_Filter()` (`ww3d.cpp:770`) globally re-inits these tables,
so the shim's translation tables must respect whatever `_Init_Filters` produces.

## 4. Texture stage state (color/alpha ops) via `ShaderClass::Apply()`

`shader.cpp` `ShaderClass::Apply()` (the `SHADER_CHANGED` flush branch of
`Apply_Render_State_Changes`, `dx8wrapper.cpp:2242`). The `ShaderClass` bitmask
(`shader.h:87`) encodes texturing on/off, primary/secondary gradient blend
modes, etc. On flush it emits the **fixed-function texture-stage color/alpha
operation** states:

- Stage 0 (`MASK_PRIGRADIENT`, `shader.h:240`):
  `D3DTSS_{COLOROP,COLORARG1,COLORARG2,ALPHAOP,ALPHAARG1,ALPHAARG2}`
- Stage 1 (`MASK_SECGRADIENT`, `shader.h:241`): same six states.
- Stage 2 (Voodoo3-only "diffuse in stage 2" hack, `shader.cpp:954`): bypasses
  the wrapper shadow via raw `DX8CALL(SetTextureStageState(2,...))` and
  `DX8CALL(SetTexture(2,0))`. Marks `ShaderDirty=true` to re-flush next draw.
- When texturing disabled: `D3DTOP_DISABLE` for both color and alpha op
  (`shader.cpp:938`).
- `D3DTSS_TEXCOORDINDEX` is set to `D3DTSS_TCI_PASSTHRU` / passthrough index
  for the hack stages.

All of these go through `DX8Wrapper::Set_DX8_Texture_Stage_State`
(`dx8wrapper.h:899`, `WWINLINE`):
- Shadow table `static unsigned TextureStageStates[MAX_TEXTURE_STAGES][32];`
  (`dx8wrapper.h:670`) — redundant guard.
- Stage ≥ `MAX_TEXTURE_STAGES` bypasses shadow → direct
  `DX8CALL(SetTextureStageState(...))`.

**Port note:** this is the **fixed-function texture combiner** path. WebGL2
has no `D3DTSS_COLOROP` equivalent — these must be translated into shader
uniforms/UBOs (a blend-mode enum + two arg-selectors per stage) consumed by the
emulated FF/GLSL shader. The `ShaderClass` bitfield is the canonical source of
truth; a `ShaderClass → combiner uniforms` translator is a *separate* code
slice from the texture-upload/bind plumbing and should be tracked independently.
The arg selectors are `D3DTA_{TEXTURE,DIFFUSE,CURRENT,TFACTOR,TEMP}`.

## 5. Where stage state is initialized / reset

- Device reset / init defaults: `dx8wrapper.cpp:3805` — sets per-stage defaults
  (`COLOROP=DISABLE`, args, `TEXCOORDINDEX=i`, `ADDRESSU/V=WRAP`,
  `TEXTURETRANSFORMFLAGS=DISABLE`).
- Bumpenv matrix defaults: `dx8wrapper.cpp:405` (`D3DTSS_BUMPENV*`).
- Post-Draw null-out: `dx8wrapper.cpp:443` (`SetTexture(a,NULL)` on all stages
  at flush), and `dx8wrapper.cpp:679` / `1745` / `3838` clear all stages.

The reset path (`Invalidate_Cached_RenderStates`-style: the
`TextureStageStates[a][b]=0x12345678;` poison-fill at `dx8wrapper.cpp:438`)
matters for the shadow tables: the shim must invalidate its WebGL-side sampler /
binding cache on device reset.

## 6. Source-file / function contract summary

| Concern                         | File                                  | Key symbol                                  |
|---------------------------------|---------------------------------------|---------------------------------------------|
| Deferred texture slot set       | `dx8wrapper.{h,cpp}`                  | `DX8Wrapper::Set_Texture` (inline)          |
| Dirty-state flush               | `dx8wrapper.cpp`                      | `DX8Wrapper::Apply_Render_State_Changes`    |
| Per-texture bind + sampler emit | `texture.cpp`                         | `TextureClass::Apply`, `CubeTextureClass::Apply`, `ZTextureClass::Apply` |
| Null-texture bind               | `texture.cpp`                         | `TextureBaseClass::Apply_Null`              |
| Sampler/wrap/filter emit        | `texturefilter.cpp`                   | `TextureFilterClass::Apply` / `_Init_Filters` |
| DX8 `SetTexture` seam + shadow  | `dx8wrapper.h`                        | `DX8Wrapper::Set_DX8_Texture` (inline)      |
| DX8 TSS seam + shadow           | `dx8wrapper.h`                        | `DX8Wrapper::Set_DX8_Texture_Stage_State` (inline) |
| Color/alpha-op stage config     | `shader.cpp`                          | `ShaderClass::Apply`                        |
| Shader texturing bit            | `shader.h`                            | `ShaderClass::MASK_PRIGRADIENT/SECGRADIENT`, `TEXTURING_{ENABLE,DISABLE}` |
| Stage init/reset defaults       | `dx8wrapper.cpp`                      | device-reset block ~3805, poison-fill ~438  |
| Max stages                      | `dx8wrapper.h:76`                     | `MAX_TEXTURE_STAGES = 8`                    |
| `DX8CALL` macro                 | `dx8wrapper.h:133`                    | `_Get_D3D_Device8()->x`                     |

The `W3DDevice/` GameEngineDevice layer (`GameEngineDevice/Source/W3DDevice/`)
calls into WW3D2; it does **not** redefine the binding seam. The contract above
is the single chokepoint the browser shim needs to satisfy.

## 7. Prioritized checklist (future code slices, not in this commit)

Ordered so each slice is independently testable via the harness screenshot path.

- [x] **S1 — `SetTexture` bind route reached from `Set_DX8_Texture`
      (bind-only).** In the browser D3D8 device shim, implement
      `IDirect3DDevice8::SetTexture(stage, d3dBaseTex)`: resolve `d3dBaseTex`
      → stable browser texture ID → WebGL texture handle →
      `activeTexture(TEXTURE0+stage)` + `bindTexture(target, handle)`. Mirror
      the `Textures[MAX_TEXTURE_STAGES]` redundant guard on the WebGL side.
      Null → `bindTexture(target, null)`. Verify with a single-textured 2D blit
      screenshot.
      *Implemented on `main` (commit 686259d): `BrowserD3DDevice::SetTexture`
      resolves the 2D `BrowserD3DTexture` browser id and dispatches
      `wasm_d3d8_browser_texture_bind(stage,id)` → `Module.cncPortD3D8TextureBind`
      → `bindD3D8Texture` (`activeTexture`+`bindTexture`, null unbinds), with
      JS-side bound-stage tracking, release-time unbind cleanup, preserved
      WebGL active-texture state around uploads, and a `d3d8TextureBind` RPC
      covered by the Playwright harness. The `d3d8-shim-smoke` covers the native
      stage/id counters and null bind.)*
- [ ] **S2 — `TextureFilterClass::Apply` → sampler params.** Translate the six
      DX8 stage states to `gl.texParameter*` (or, preferably, a
      `WebGLSampler`-per-stage cache keyed on the 6-tuple). Honor
      `_Init_Filters` value tables. Verify wrap/filter visually on a tiled 2D
      sprite.
      *Expectations coverage added (GLM-5.2): `d3d8-texture-stage-state-mapping-smoke`
      pins the DX8 enum wire values, replicates `_Init_Filters` against the
      shim's reported caps (linear min/mag/mip, no anisotropic,
      `MaxAnisotropy==1`), records the per-stage `_Min/_Mag/_Mip` tables for
      NONE/FAST/BEST/DEFAULT under bilinear/trilinear/anisotropic modes, and
      emits the canonical D3D8→WebGL2 sampler mapping spec (min/mip collapse,
      address enum map, `MAXANISOTROPY` contract). The translation itself is
      still open.)*
- [ ] **S3 — `Apply_Render_State_Changes` texture flush wiring.** Ensure the
      deferred `render_state_changed` dirty bits actually drive S1/S2 on Draw,
      matching `dx8wrapper.cpp:2247` loop bounds
      (`CurrentCaps->Get_Max_Textures_Per_Pass()`).
- [ ] **S4 — Stage-state shadow + reset.** Implement
      `Set_DX8_Texture_Stage_State` shadow (`TextureStageStates[8][32]`),
      poison-fill on device reset, and `Apply_Null` for all stages. Needed
      before S5 because S5 reads stage state.
- [ ] **S5 — `ShaderClass::Apply` color/alpha-op → FF combiner uniforms.**
      Translate `D3DTSS_COLOROP/ARG1/ARG2/ALPHAOP/ARG1/ARG2` for stages 0–1
      (and the Voodoo3 stage-2 hack) into shader uniforms consumed by the
      emulated fixed-function fragment shader. Largest item; defer until S1–S4
      render solid-textured primitives correctly.
- [ ] **S6 — Cube/Volume/Z `Apply` variants.** Wire `CubeTextureClass::Apply`
      (`texture.cpp:~1596`), `VolumeTextureClass::Apply` (`texture.cpp:~1884`),
      `ZTextureClass::Apply` (`texture.cpp:1266`) once their upload paths land.
- [ ] **S7 — Snapshot/observability.** Route `SNAPSHOT_SAY` bind logs through
      the harness so binding order is diffable against the original renderer.

## 8. Out of scope for this note

- Texture **creation/upload** (the main agent's current work in
  `wasm_d3d8_shim.*` / `bridge.js`) — assumed as the upstream producer of the
  WebGL texture handles S1 binds.
- Vertex streams, lighting, transform flush — sibling dirty bits in
  `Apply_Render_State_Changes`, not texture binding.
- `WW3D::Set_Texture_Reduction` / thumbnail/background-loading path —
  orthogonal to the bind contract.

---

Authored by Z.ai GLM-5.2 coworker. Read-only exploration; no source modified.
