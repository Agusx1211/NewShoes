// D3D8 texture binding (M4 slice S1) focused smoke.
//
// This is the first "bind an already-uploaded browser texture" slice described
// in WebAssembly/notes/texture_stage_binding_plan.md (item S1). It routes
// IDirect3DDevice8::SetTexture through the browser D3D8 shim to a JS bridge
// callback (Module.cncPortD3D8TextureBind) so an already-uploaded WebGL
// texture can be bound to a sampler stage by its stable browser texture id.
//
// Scope is intentionally narrow:
//   * Bind-only. Resolve IDirect3DBaseTexture8* -> stable browser texture id
//     -> gl.activeTexture(TEXTURE0+stage) + gl.bindTexture(target, handle) on
//     the JS side (see harness/bridge.js bindD3D8Texture).
//   * Mirror DX8Wrapper::Set_DX8_Texture's redundant-state guard so identical
//     stage bindings do not re-issue gl.bindTexture.
//   * Null texture -> bindTexture(target, null) (unbind).
//   * Expose counters/metadata for the harness/probe:
//       set_texture_calls, set_texture_redundant_skips,
//       set_texture_unknown_type_calls, last_set_texture_stage,
//       last_set_texture_id, last_set_texture_was_null, and the per-stage
//       bound_texture_ids[MAX_TEXTURE_STAGES] shadow.
//
// Out of scope (tracked independently in the plan): fixed-function texture
// combiner / color-op translation (ShaderClass::Apply -> S5), sampler-state
// (filter/wrap) translation (TextureFilterClass::Apply -> S2), cube/volume/Z
// texture Apply variants (S6), and the deferred Apply_Render_State_Changes
// flush wiring (S3). SetTextureStageState remains a no-op.

#include <cstdio>

#include "wasm_d3d8_shim.h"

namespace {

int g_failures = 0;

void fail(const char *message)
{
	std::fprintf(stderr, "FAIL: %s\n", message);
	++g_failures;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		fail(message);
		return false;
	}
	return true;
}

} // namespace

int main()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	if (!expect(d3d != nullptr, "Direct3DCreate8 returned null")) {
		return 1;
	}

	D3DPRESENT_PARAMETERS parameters = {};
	parameters.BackBufferWidth = 64;
	parameters.BackBufferHeight = 64;
	parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
	parameters.BackBufferCount = 1;
	parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
	parameters.Windowed = TRUE;
	parameters.EnableAutoDepthStencil = TRUE;
	parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

	IDirect3DDevice8 *device = nullptr;
	if (!expect(SUCCEEDED(d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device)),
			"CreateDevice failed") ||
		!expect(device != nullptr, "CreateDevice returned null device")) {
		d3d->Release();
		return 1;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();

	// ------------------------------------------------------------------
	// 1. Create + upload two 2D textures so we have stable browser ids to
	//    bind. The browser upload plumbing already produces a non-zero
	//    browser_texture_id per CreateTexture; we read it back through the
	//    concrete BrowserD3DTexture accessor the shim uses internally.
	// ------------------------------------------------------------------
	IDirect3DTexture8 *texture_a = nullptr;
	IDirect3DTexture8 *texture_b = nullptr;
	if (!expect(SUCCEEDED(device->CreateTexture(8, 8, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture_a)),
			"CreateTexture A failed") ||
		!expect(texture_a != nullptr, "CreateTexture A returned null")) {
		device->Release();
		d3d->Release();
		return 1;
	}
	const UINT id_a = state->last_browser_texture_id;

	if (!expect(SUCCEEDED(device->CreateTexture(4, 4, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture_b)),
			"CreateTexture B failed") ||
		!expect(texture_b != nullptr, "CreateTexture B returned null")) {
		texture_a->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	const UINT id_b = state->last_browser_texture_id;
	if (!expect(id_a != 0 && id_b != 0, "browser texture ids must be non-zero") ||
		!expect(id_a != id_b, "browser texture ids must be unique")) {
		texture_a->Release();
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	// ------------------------------------------------------------------
	// 2. Bind texture A to stage 0.
	// ------------------------------------------------------------------
	const UINT set_calls_before = state->set_texture_calls;
	const UINT skips_before = state->set_texture_redundant_skips;

	expect(SUCCEEDED(device->SetTexture(0, texture_a)), "SetTexture(0, A) failed");
	expect(state->set_texture_calls == set_calls_before + 1, "set_texture_calls should advance on bind");
	expect(state->last_set_texture_stage == 0, "last_set_texture_stage should be 0");
	expect(state->last_set_texture_id == id_a, "last_set_texture_id should be id_a");
	expect(state->last_set_texture_was_null == 0, "last_set_texture_was_null should be 0 for A");
	expect(state->bound_texture_ids[0] == id_a, "shadow stage 0 should hold id_a");
	expect(state->set_texture_redundant_skips == skips_before, "first bind must not be a redundant skip");

	// ------------------------------------------------------------------
	// 3. Bind texture B to stage 1 (independent stage).
	// ------------------------------------------------------------------
	expect(SUCCEEDED(device->SetTexture(1, texture_b)), "SetTexture(1, B) failed");
	expect(state->last_set_texture_stage == 1, "last_set_texture_stage should be 1");
	expect(state->last_set_texture_id == id_b, "last_set_texture_id should be id_b");
	expect(state->bound_texture_ids[0] == id_a, "stage 0 binding must survive stage 1 bind");
	expect(state->bound_texture_ids[1] == id_b, "shadow stage 1 should hold id_b");

	// ------------------------------------------------------------------
	// 4. Redundant bind: re-bind A to stage 0. The mirror of
	//    DX8Wrapper::Set_DX8_Texture's guard must skip the JS dispatch and
	//    increment set_texture_redundant_skips.
	// ------------------------------------------------------------------
	expect(SUCCEEDED(device->SetTexture(0, texture_a)), "SetTexture(0, A) redundant failed");
	expect(state->set_texture_calls == set_calls_before + 3, "set_texture_calls should advance even on redundant");
	expect(state->set_texture_redundant_skips == skips_before + 1, "redundant bind must be skipped");
	expect(state->bound_texture_ids[0] == id_a, "stage 0 binding unchanged after redundant bind");

	// ------------------------------------------------------------------
	// 5. Unbind stage 1 (null texture). Must dispatch bindTexture(null) and
	//    clear the shadow.
	// ------------------------------------------------------------------
	expect(SUCCEEDED(device->SetTexture(1, nullptr)), "SetTexture(1, null) failed");
	expect(state->last_set_texture_was_null == 1, "last_set_texture_was_null should be 1 for null");
	expect(state->last_set_texture_id == 0, "last_set_texture_id should be 0 for null");
	expect(state->bound_texture_ids[1] == 0, "shadow stage 1 should be cleared by null bind");
	expect(state->set_texture_redundant_skips == skips_before + 1, "null after non-null must not be a skip");

	// Re-nulling stage 1 is now redundant (shadow already 0) and must skip.
	expect(SUCCEEDED(device->SetTexture(1, nullptr)), "SetTexture(1, null) redundant failed");
	expect(state->set_texture_redundant_skips == skips_before + 2, "redundant null bind must be skipped");

	// ------------------------------------------------------------------
	// 6. Stage >= MAX_TEXTURE_STAGES bypasses the shadow (matches the
	//    DX8Wrapper Voodoo3 stage-2 hack path that calls DX8CALL directly).
	//    The bind still dispatches; the redundant guard is just not applied.
	// ------------------------------------------------------------------
	const UINT high_stage = WASM_D3D8_MAX_TEXTURE_STAGES; // one past the shadow
	expect(SUCCEEDED(device->SetTexture(high_stage, texture_b)), "SetTexture(high stage) failed");
	expect(state->last_set_texture_stage == high_stage, "last_set_texture_stage should be high stage");
	expect(state->last_set_texture_id == id_b, "high-stage bind should still resolve id_b");

	texture_a->Release();
	texture_b->Release();
	device->Release();
	d3d->Release();

	if (g_failures != 0) {
		std::fprintf(stderr, "d3d8-texture-binding-smoke: %d failure(s)\n", g_failures);
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"d3d8-texture-binding\","
		"\"note\":\"IDirect3DDevice8::SetTexture routes to Module.cncPortD3D8TextureBind by stable browser texture id; redundant guard mirrored; null unbinds.\","
		"\"scope\":\"bind-only; no sampler-state or fixed-function combiner translation\","
		"\"bridgeCallback\":\"cncPortD3D8TextureBind\","
		"\"maxStages\":%d,"
		"\"counters\":{\"setTexture\":%u,\"redundantSkips\":%u,\"unknownType\":%u},"
		"\"boundTextureIds\":[%u,%u,%u,%u,%u,%u,%u,%u]}\n",
		WASM_D3D8_MAX_TEXTURE_STAGES,
		state->set_texture_calls,
		state->set_texture_redundant_skips,
		state->set_texture_unknown_type_calls,
		state->bound_texture_ids[0], state->bound_texture_ids[1],
		state->bound_texture_ids[2], state->bound_texture_ids[3],
		state->bound_texture_ids[4], state->bound_texture_ids[5],
		state->bound_texture_ids[6], state->bound_texture_ids[7]);

	return 0;
}
