# Render-to-Texture (RTT) Implementation Map
## CnC Generals Zero Hour Web Port (D3D8 → WebGL2 Browser Shim)

---

## 1. ENGINE-SIDE RTT FLOW (C++ → D3D8)

### 1.1 Render Target Creation Path

```
Engine Code
  ↓
DX8Wrapper::Create_Render_Target(width, height, format)
  ↓
TextureClass(width, height, format, MIP_LEVELS_1, POOL_DEFAULT, true)
  ↓
D3DXCreateTexture(device, width, height, 1, D3DUSAGE_RENDERTARGET, format, pool, &texture)
  ↓
wasm_d3d8_shim.cpp::CreateTexture() [line ~2455]
  ↓
create_surface(width, height, 0, D3DUSAGE_RENDERTARGET, format, D3DPOOL_DEFAULT, &surface)
  ↓
BrowserD3DSurface::create_surface()
  ↓
wasm_d3d8_browser_texture_create() → bridge.js cncPortD3D8TextureCreate
```

**Key files:**
- `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/dx8wrapper.cpp:3181` — `Create_Render_Target()`
- `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/dx8wrapper.cpp:2404` — `TextureClass` constructor
- `WebAssembly/src/wasm_d3d8_shim.cpp:2455-2458` — `CreateTexture()` shim
- `WebAssembly/src/wasm_d3d8_shim.cpp:1199` — `BrowserD3DSurface` struct
- `WebAssembly/src/wasm_d3d8_shim.cpp:525-526` — `wasm_d3d8_browser_texture_create()` EM_JS bridge

### 1.2 Render Target Switching Path

```
Engine Code (3 patterns):

Pattern A — DX8Wrapper::Set_Render_Target_With_Z() [dx8wrapper.cpp:3324]
  Used by: Water reflections, shadow decals
  ↓
  texture->Get_D3D_Surface_Level() → d3d_surf
  ztexture->Get_D3D_Surface_Level() → d3d_zbuf
  ↓
  DX8Wrapper::Set_Render_Target(d3d_surf, d3d_zbuf) [line 3508]
  ↓
  D3D device → SetRenderTarget(render_target, depth_buffer)
  ↓
  wasm_d3d8_shim.cpp::SetRenderTarget(pSurface, pDepth) [line 2522]

Pattern B — DX8Wrapper::Set_Render_Target(surface, use_default_depth) [dx8wrapper.cpp:3383]
  Used by: Swap chain switching, single-surface RTT
  ↓
  SetRenderTarget(render_target, DefaultDepthBuffer)
  ↓
  wasm_d3d8_shim.cpp::SetRenderTarget() [line 2522]

Pattern C — D3D device → SetRenderTarget(old_surface, old_depth)
  Used by: W3DShaderManager for post-process effects
  ↓
  wasm_d3d8_shim.cpp::SetRenderTarget() [line 2522]
```

**Key file:** `WebAssembly/src/wasm_d3d8_shim.cpp:2522-2540`
```cpp
HRESULT SetRenderTarget(IDirect3DSurface8 *pRenderTarget, IDirect3DSurface8 *pNewDepthSurface) override {
    if (g_d3d8_offscreen_rt_active) return S_OK;  // ← SKIPS EVERYTHING WHEN OFFSCREEN RT
    if (pRenderTarget) {
        g_state.offscreen_rt_surface = pRenderTarget;
    }
    if (pNewDepthSurface) {
        g_state.offscreen_depth_surface = pNewDepthSurface;
    }
    return S_OK;
}
```

### 1.3 Render Target Query Path

```
Engine Code
  ↓
DX8Wrapper::_Get_D3D_Device8()->GetRenderTarget(&surface) [dx8wrapper.cpp:259]
  ↓
wasm_d3d8_shim.cpp::GetRenderTarget(IDirect3DSurface8 **ppSurface) [line 2542]
  ↓
*ppSurface = g_state.offscreen_rt_surface;  // Returns stored surface pointer
```

**Key file:** `WebAssembly/src/wasm_d3d8_shim.cpp:2542-2546`

---

## 2. CONSUMERS OF RTT (Engine Code)

### 2.0 Object Preview (Tools only)

**File:** `GeneralsMD/Code/Tools/WorldBuilder/src/ObjectPreview.cpp`
```cpp
TextureClass *objectTexture = DX8Wrapper::Create_Render_Target(PREVIEW_WIDTH, PREVIEW_HEIGHT);
DX8Wrapper::Set_Render_Target_With_Z(objectTexture);
// ... render object ...
DX8Wrapper::Set_Render_Target((IDirect3DSurface8 *)NULL);
```

### 2.1 TexProjectClass (Shadow Projector)

**File:** `GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/texproject.cpp`
```cpp
void TexProjectClass::renderProjector(void)
{
    // Switch to render target
    DX8Wrapper::Set_Render_Target_With_Z(rtarget, ztarget);
    // ... render projected shadow ...
    // Restore default target
    DX8Wrapper::Set_Render_Target((IDirect3DSurface8 *)NULL);
}
```

### 2.2 Water Reflections (SEA_REFLECTION_SIZE × SEA_REFLECTION_SIZE)

**File:** `GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/Water/W3DWater.cpp`

```cpp
// Creation (line 919):
m_pReflectionTexture = DX8Wrapper::Create_Render_Target(SEA_REFLECTION_SIZE, SEA_REFLECTION_SIZE);

// Usage (line 1484):
DX8Wrapper::Set_Render_Target_With_Z((TextureClass*)m_pReflectionTexture);
  → WW3D::Begin_Render(false, true, Vector3(0,0,0));  // Clear Z only
  → cam->Set_Transform(reflectedTransform);           // Reflected camera
  → cam->Set_Viewport(0,0 → 1,1);                     // Full texture viewport
  → ShaderClass::Invert_Backface_Culling(true);       // Backface culling flip
  → renderSky();
  → WW3D::Render(m_parentScene, cam);                 // Render scene into RT
  → ShaderClass::Invert_Backface_Culling(false);
  → WW3D::End_Render(false);

// Restore (line 1501):
DX8Wrapper::Set_Render_Target((IDirect3DSurface8 *)NULL);  // Back to backbuffer

// Later use as texture (line 1952):
m_pDev->SetTexture(1, m_pReflectionTexture->Peek_D3D_Texture());
```

### 2.2 Shadow Decals (DEFAULT_RENDER_TARGET_WIDTH × DEFAULT_RENDER_TARGET_HEIGHT)

**File:** `GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/Shadow/W3DProjectedShadow.cpp`

```cpp
// Creation (lines 273-279):
m_dynamicRenderTarget = DX8Wrapper::Create_Render_Target(
    DEFAULT_RENDER_TARGET_WIDTH, DEFAULT_RENDER_TARGET_HEIGHT, WW3D_FORMAT_A8R8G8B8);
// Falls back to non-alpha format if A8R8G8B8 fails

// Usage pattern:
// - Shadow volumes are rendered into the render target texture
// - The texture is then used as a decal projected onto terrain/objects
// - flushDecals() renders the shadow texture multiplicative onto scene geometry
```

**Key constants:**
- `DEFAULT_RENDER_TARGET_WIDTH` / `DEFAULT_RENDER_TARGET_HEIGHT` — shadow RT size
- `SEA_REFLECTION_SIZE` — water reflection RT size

### 2.3 W3DShaderManager Post-Process Effects

**File:** `GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DShaderManager.cpp`

**Effects using RTT:**
- Soft water edges (alpha blending)
- Motion blur (FT_VIEW_MOTION_BLUR_FILTER)
- Crossfade (FT_VIEW_CROSSFADE)
- Black & white filter (ScreenBWFilter)
- Black & white DOT3 filter (ScreenBWFilterDOT3)
- Fade transitions

**Pattern:**
```cpp
// Init (line 2594-2660):
GetRenderTarget(&m_oldRenderSurface);
GetDepthStencilSurface(&m_oldDepthSurface);
CreateTexture(width, height, 1, D3DUSAGE_RENDERTARGET, format, POOL_DEFAULT, &m_renderTexture);
m_renderTexture->GetSurfaceLevel(0, &m_newRenderSurface);

// Pre-render (line 2840-2870):
void startRenderToTexture() {
    SetRenderTarget(m_newRenderSurface, m_oldDepthSurface);  // Switch to offscreen RT
    m_renderingToTexture = true;
    // Clear RT (alpha or full clear depending on filter)
}

// Scene render:
//   All scene geometry drawn into offscreen RT

// Post-render (line 2877-2896):
IDirect3DTexture8 *endRenderToTexture() {
    SetRenderTarget(m_oldRenderSurface, m_oldDepthSurface);  // Switch back to backbuffer
    m_renderingToTexture = false;
    return m_renderTexture;  // Return texture for post-process shader
}
```

**Filter lifecycle:**
```cpp
preRender() {
    W3DShaderManager::startRenderToTexture();  // Switch to RT
    return true;
}
// ... scene renders into RT ...
postRender() {
    IDirect3DTexture8 *tex = W3DShaderManager::endRenderToTexture();  // Switch back
    // Apply post-process shader using tex as input
}
```

---

## 3. SHIM-SIDE IMPLEMENTATION (wasm_d3d8_shim.cpp)

### 3.1 State Tracking

**Key state variables:**
```cpp
// Global state (wasm_d3d8_shim.cpp):
namespace g_state {
    IDirect3DSurface8 *offscreen_rt_surface = nullptr;  // Current RT
    IDirect3DSurface8 *offscreen_depth_surface = nullptr; // Current depth
}

// Draw state:
struct WasmD3D8DrawRenderState {
    // ... includes z_func, texture stages, etc.
};
```

### 3.2 Offscreen RT Flag

**Critical flag:** `g_d3d8_offscreen_rt_active` (line 2229)

**How it's set (SetRenderTarget, line 2538-2539):**
```cpp
m_back_buffer = render_target;
m_depth_stencil = depth_stencil;
g_d3d8_offscreen_rt_active =
    (render_target != nullptr && render_target != m_default_render_target);
```

**Usage in DrawIndexedPrimitive (line 2850-2853):**
```cpp
if (!g_d3d8_offscreen_rt_active) {
    draw_bound_indexed_primitive(...);  // Only draws when NOT offscreen
}
```

**Usage in Clear (line 2587-2590):**
```cpp
if ((flags & (D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER | D3DCLEAR_STENCIL)) != 0 &&
    !g_d3d8_offscreen_rt_active) {
    browser_clear_target(flags, color, z, stencil);
}
```

**Current behavior:**
- `g_d3d8_offscreen_rt_active` is `true` when render target ≠ default backbuffer
- When true, ALL draw calls and clears are skipped to the browser layer
- This prevents offscreen RT draws from polluting the main canvas
- But it also means RTT never actually renders — shadows/reflections are missing

**Key insight:** The flag is a deliberate workaround. Without FBO support, offscreen draws would corrupt the main canvas depth buffer, causing black terrain. The flag trades "no shadows/reflections" for "main scene renders correctly".

### 3.3 Surface/Texture Bridge

**BrowserD3DSurface struct (line 1199):**
```cpp
struct BrowserD3DSurface {
    BrowserD3DTexture &m_owner_texture;
    UINT m_owner_texture_level;
    D3DFORMAT m_format;
    D3DPOOL m_pool;
    UINT m_width, m_height;
    D3DUSAGE m_usage;  // D3DUSAGE_RENDERTARGET flag
};
```

**BrowserD3DTexture:**
```cpp
struct BrowserD3DTexture {
    unsigned int m_owner_texture_id;  // WebGL texture ID
    UINT m_owner_texture_level;
    D3DFORMAT m_format;
    D3DPOOL m_pool;
    UINT m_width, m_height;
    D3DUSAGE m_usage;
};
```

### 3.4 Create Texture/Surface Path

```
CreateTexture() → create_surface() → BrowserD3DSurface::create_surface()
  ↓
wasm_d3d8_browser_texture_create(width, height, levels, format, usage, pool, &id)
  ↓
bridge.js: cncPortD3D8TextureCreate → createD3D8Texture()
  ↓
gl.createTexture() → gl.bindTexture() → gl.texParameter() → gl.texImage2D()
```

**Key observation:** The texture is created with `D3DUSAGE_RENDERTARGET` but the WebGL side creates a regular WebGL2 texture, not an FBO render target.

### 3.5 SetRenderTarget Bridge

**Current implementation (line 2522-2540):**
```cpp
HRESULT SetRenderTarget(IDirect3DSurface8 *render_target, IDirect3DSurface8 *depth_stencil) override {
    if (render_target != nullptr) {
        render_target->AddRef();
    }
    if (depth_stencil != nullptr) {
        depth_stencil->AddRef();
    }
    if (m_back_buffer != nullptr) {
        m_back_buffer->Release();
    }
    if (m_depth_stencil != nullptr) {
        m_depth_stencil->Release();
    }
    m_back_buffer = render_target;
    m_depth_stencil = depth_stencil;
    g_d3d8_offscreen_rt_active =
        (render_target != nullptr && render_target != m_default_render_target);
    return S_OK;
}
```

**What it does:**
- Stores the render target surface pointer in `m_back_buffer`
- Stores the depth stencil surface pointer in `m_depth_stencil`
- Sets `g_d3d8_offscreen_rt_active` based on whether target ≠ default backbuffer
- Returns S_OK (success) — engine thinks RTT is working

**What it doesn't do:**
- No FBO creation
- No FBO binding (`gl.bindFramebuffer`)
- No viewport resize for RT dimensions
- No bridge.js call to notify the browser layer
- The browser layer has no knowledge of the render target switch

### 3.6 Draw Path

```
DrawIndexedPrimitive() [line 2830-2854]
  ↓
  if (g_d3d8_offscreen_rt_active) → SKIP (no render)
  ↓
  draw_bound_indexed_primitive() [line 3192]
    ↓
    wasm_d3d8_browser_draw_indexed()
      ↓
      bridge.js: cncPortD3D8DrawIndexed → paintD3D8DrawIndexed()
        ↓
        gl.drawArrays() / gl.drawElements() → Renders to current FBO (always default)
```

**Key issue:** `paintD3D8DrawIndexed` always renders to the default framebuffer (canvas), never to an FBO.

### 3.7 Clear Path

```
Clear() [wasm_d3d8_shim.cpp]
  ↓
  if (g_d3d8_offscreen_rt_active) → SKIP (no clear)
  ↓
  wasm_d3d8_browser_clear()
    ↓
    bridge.js: cncPortD3D8Clear → paintD3D8Clear()
      ↓
      gl.clear() → Clears default framebuffer
```

---

## 4. BRIDGE.JS IMPLEMENTATION

### 4.1 Texture Creation

**Function:** `createD3D8Texture()` (in bridge.js)
```javascript
function createD3D8Texture(width, height, levels, format, usage, pool) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // ... upload pixel data if provided
    return texture.id;
}
```

**Issue:** Creates a regular `gl.TEXTURE_2D`, not an FBO render target.

### 4.2 Texture Binding

**Function:** `bindD3D8Texture()` (in bridge.js)
```javascript
function bindD3D8Texture(stage, id) {
    gl.activeTexture(gl.TEXTURE0 + stage);
    gl.bindTexture(gl.TEXTURE_2D, d3d8Textures.get(id));
}
```

**Works correctly for sampling** — the texture can be used as a shader input.

### 4.3 Draw Function

**Function:** `paintD3D8DrawIndexed()` (line 6144)
```javascript
function paintD3D8DrawIndexed(payload) {
    // ... setup VBO/IBO, shaders, uniforms ...
    // ... apply viewport from d3d8ViewportState ...
    gl.drawArrays(baseGlPrimitive, 0, vertexCount);
    // Always draws to default framebuffer
}
```

**Issue:** No FBO binding before draw. Always renders to canvas.

### 4.4 Clear Function

**Function:** `paintD3D8Clear()` (line 3959)
```javascript
function paintD3d8Clear(flags, red, green, blue, alpha, z, stencil) {
    // ... setup clear colors ...
    gl.clear(clearBits);
    // Always clears default framebuffer
}
```

**Issue:** No FBO binding before clear. Always clears canvas.

### 4.5 Viewport Handling

**Function:** `setD3D8Viewport()` / `applyD3D8Viewport()` (line 1933)
```javascript
function setD3D8Viewport(payload) {
    d3d8ViewportState = {
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
        targetWidth: payload.targetWidth,
        targetHeight: payload.height,
    };
    return applyD3D8Viewport("set");
}
```

**Current behavior:** Viewport is applied to the canvas GL context, not scaled to RT dimensions.

---

## 5. WHAT'S MISSING FOR REAL FBO-BACKED RTT

### 5.1 FBO Creation & Management

**Required:** When `CreateTexture()` is called with `D3DUSAGE_RENDERTARGET`:
1. Create a WebGL2 FBO: `gl.createFramebuffer()`
2. Create a renderbuffer for depth: `gl.createRenderbuffer()`
3. Attach the texture to the FBO: `gl.framebufferTexture()`
4. Attach the depth renderbuffer: `gl.framebufferRenderbuffer()`
5. Validate: `gl.checkFramebufferStatus()`

### 5.2 FBO Binding on SetRenderTarget

**Required:** When `SetRenderTarget()` is called with an offscreen surface:
1. Look up the FBO associated with the surface's texture
2. `gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo)`
3. Resize viewport to RT dimensions: `gl.viewport(0, 0, rt_width, rt_height)`
4. Store the FBO ID for later unbinding

### 5.3 FBO Unbinding on SetRenderTarget(NULL)

**Required:** When `SetRenderTarget(NULL, NULL)` is called:
1. `gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)` — restore default FBO
2. Restore original viewport

### 5.4 Depth Buffer for RTT

**Required:** Each RTT FBO needs its own depth renderbuffer:
```javascript
const depthRb = gl.createRenderbuffer();
gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
```

### 5.5 Texture Readback

**Required:** When the RTT texture is sampled as a shader input:
- The texture is already bound as `gl.TEXTURE_2D`, so sampling works automatically
- No extra readback needed — FBO texture attachment is read-write

### 5.6 Multisampling (Optional)

**Required:** If MSAA is needed for RTT:
- Use `gl.framebufferTexture()` with the multisampled texture
- Resolve to non-multisampled texture for sampling

---

## 6. IMPLEMENTATION CHECKLIST

### Phase 1: FBO Creation
- [ ] Modify `createD3D8Texture()` to create FBO when `D3DUSAGE_RENDERTARGET` is set
- [ ] Create depth renderbuffer for the FBO
- [ ] Store FBO ID and depth RB ID in the texture resource metadata
- [ ] Validate FBO completeness

### Phase 2: FBO Binding
- [ ] Modify `SetRenderTarget()` shim to track FBO binding state
- [ ] Add `wasm_d3d8_browser_set_render_target()` bridge call
- [ ] Implement `setD3D8RenderTarget()` in bridge.js to bind FBO
- [ ] Resize viewport to RT dimensions on bind
- [ ] Handle `SetRenderTarget(NULL, NULL)` to unbind FBO

### Phase 3: Draw/Clear Integration
- [ ] Remove `g_d3d8_offscreen_rt_active` skip logic (or repurpose it)
- [ ] Ensure `paintD3D8DrawIndexed()` renders to current FBO
- [ ] Ensure `paintD3D8Clear()` clears current FBO
- [ ] Handle viewport changes during RTT (water reflection uses full RT viewport)

### Phase 4: Texture Readback
- [ ] Verify RTT texture sampling works (should be automatic with FBO texture attachment)
- [ ] Test water reflection rendering
- [ ] Test shadow decal rendering
- [ ] Test post-process effects (motion blur, crossfade, etc.)

### Phase 5: Edge Cases
- [ ] Handle multiple simultaneous RTT targets (shader manager + water + shadows)
- [ ] Handle device reset (FBO cleanup/recreation)
- [ ] Handle RTT texture format conversion (D3D format → WebGL internal format)
- [ ] Handle power-of-2 texture size constraints (engine forces POT)

---

## 7. KEY CONSTANTS

```cpp
// Shadow render target size
#define DEFAULT_RENDER_TARGET_WIDTH  512
#define DEFAULT_RENDER_TARGET_HEIGHT 512

// Water reflection size
#define SEA_REFLECTION_SIZE  256

// Shader manager RT size (matches backbuffer)
D3DSURFACE_DESC desc;
GetRenderTarget(&surface);
surface->GetDesc(&desc);
CreateTexture(desc.Width, desc.Height, 1, D3DUSAGE_RENDERTARGET, desc.Format, ...);
```

---

## 8. FORMAT MAPPING

**D3D → WebGL2 internal format for FBO:**
```
D3DFMT_A8R8G8B8 → GL_RGBA / GL_RGBA
D3DFMT_X8R8G8B8 → GL_RGB / GL_RGB
D3DFMT_A8 → GL_ALPHA / GL_ALPHA
D3DFMT_L8 → GL_LUMINANCE / GL_LUMINANCE
D3DFMT_A8L8 → GL_LUMINANCE_ALPHA / GL_LUMINANCE_ALPHA
```

**Depth format:**
```
D3DFMT_D16 → GL_DEPTH_COMPONENT16
D3DFMT_D24FS → GL_DEPTH_COMPONENT24
D3DFMT_D32 → GL_DEPTH_COMPONENT32
```

---

## 9. CALL GRAPH SUMMARY

```
Engine RTT Operation:
  CreateRenderTarget → DX8Wrapper::Create_Render_Target()
                       → TextureClass(D3DUSAGE_RENDERTARGET)
                       → D3DXCreateTexture()
                       → wasm_d3d8_shim::CreateTexture()
                       → create_surface()
                       → BrowserD3DSurface::create_surface()
                       → wasm_d3d8_browser_texture_create()
                       → bridge.js: createD3D8Texture()
                       → [MISSING] FBO creation

  SetRenderTarget → DX8Wrapper::Set_Render_Target_With_Z()
                   → D3D device::SetRenderTarget()
                   → wasm_d3d8_shim::SetRenderTarget()
                   → [MISSING] FBO binding

  Draw into RT → DrawIndexedPrimitive()
                → draw_bound_indexed_primitive()
                → wasm_d3d8_browser_draw_indexed()
                → bridge.js: paintD3D8DrawIndexed()
                → [ISSUE] Always draws to default FBO

  Clear RT → Clear()
            → wasm_d3d8_browser_clear()
            → bridge.js: paintD3D8Clear()
            → [ISSUE] Always clears default FBO

  SetRenderTarget(NULL) → DX8Wrapper::Set_Render_Target()
                         → D3D device::SetRenderTarget()
                         → wasm_d3d8_shim::SetRenderTarget()
                         → [MISSING] FBO unbinding

  Sample RT as texture → SetTexture(stage, texture)
                        → wasm_d3d8_shim::SetTexture()
                        → wasm_d3d8_browser_texture_bind()
                        → bridge.js: bindD3D8Texture()
                        → [OK] Binds texture for sampling
```

---

## 10. FILES TO MODIFY

1. **WebAssembly/src/wasm_d3d8_shim.cpp**
   - `SetRenderTarget()` — Add FBO binding bridge call
   - `CreateTexture()` — Pass D3DUSAGE_RENDERTARGET flag to bridge
   - `DrawIndexedPrimitive()` — Remove offscreen RT skip (or repurpose)
   - `Clear()` — Remove offscreen RT skip
   - Add `wasm_d3d8_browser_set_render_target()` EM_JS function

2. **WebAssembly/harness/bridge.js**
   - `createD3D8Texture()` — Create FBO when D3DUSAGE_RENDERTARGET is set
   - Add `setD3D8RenderTarget()` — Bind/unbind FBO
   - `paintD3D8DrawIndexed()` — No change needed (renders to current FBO)
   - `paintD3D8Clear()` — No change needed (clears current FBO)
   - `applyD3D8Viewport()` — Scale viewport to FBO dimensions when FBO is bound

3. **WebAssembly/harness/bridge.js** (state management)
   - Add FBO tracking: `d3d8FBOs` Map<textureId, {fbo, depthRb}>
   - Add current FBO state: `d3d8CurrentFBO` (null = default framebuffer)
