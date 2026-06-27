// D3D8 SetTexture bound-resource lifetime / reference-semantics smoke.
//
// Focused, non-overlapping M4 slice covering the open TODO:
//   "Audit and match D3D8 SetTexture bound-resource lifetime/reference
//    semantics before relying on textures that remain bound across Release
//    or device reset; the current browser bridge tracks texture IDs and
//    release cleanup only."
//
// This smoke verifies the IDirect3DDevice8::SetTexture device-held reference
// contract that the browser D3D8 shim must match so a texture that is still
// bound is not destroyed when the engine releases its own handle, and so
// device teardown unbinds. It exercises the C++ shim only; it does NOT touch
// harness/bridge.js (the JS-side release-cleanup of the WebGL texture handle
// is covered separately by the d3d8TextureBind harness RPC).
//
// DX8 contract being pinned (Microsoft IDirect3DDevice8::SetTexture):
//   * Binding a non-NULL texture AddRefs it on behalf of the device.
//   * Binding a different texture (or NULL) on the same stage Releases the
//     previously-bound texture the device was holding.
//   * Therefore a texture that is still bound survives the engine calling
//     Release on its own handle (the device's reference keeps it alive).
//   * Device teardown / reset Releases every still-bound texture.
//
// This mirrors the WW3D layer's own shadow in DX8Wrapper::Set_DX8_Texture
// (Release previous / AddRef new), but at the raw device seam the engine
// also relies on for direct SetTexture calls (e.g. device-reset paths).

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

	// Create two textures to exercise rebind Release semantics. CreateTexture
	// returns the texture with refcount == 1 (the engine's own handle).
	IDirect3DTexture8 *texture_a = nullptr;
	IDirect3DTexture8 *texture_b = nullptr;
	if (!expect(SUCCEEDED(device->CreateTexture(16, 16, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED,
			&texture_a)),
			"CreateTexture A failed") ||
		!expect(SUCCEEDED(device->CreateTexture(16, 16, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED,
			&texture_b)),
			"CreateTexture B failed")) {
		if (texture_a != nullptr) {
			texture_a->Release();
		}
		if (texture_b != nullptr) {
			texture_b->Release();
		}
		device->Release();
		d3d->Release();
		return 1;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT binds_before = state->set_texture_calls;

	// -------------------------------------------------------------------------
	// 1. Binding a non-NULL texture AddRefs it on behalf of the device.
	//    Engine handle refcount 1 -> 2 after SetTexture.
	// -------------------------------------------------------------------------
	const ULONG a_ref_after_create = texture_a->AddRef() - 1; // read without net change
	texture_a->Release(); // balance the read
	expect(a_ref_after_create == 1, "texture A should start at refcount 1");

	if (!expect(SUCCEEDED(device->SetTexture(0, texture_a)), "SetTexture(stage0, A) failed")) {
		texture_a->Release();
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	const ULONG a_ref_after_bind = texture_a->AddRef() - 1;
	texture_a->Release();
	expect(a_ref_after_bind == 2,
		"SetTexture must AddRef the bound texture on behalf of the device (1->2)");
	expect(state->set_texture_calls == binds_before + 1, "set_texture_calls counter mismatch");

	// -------------------------------------------------------------------------
	// 2. Re-binding a DIFFERENT texture on the same stage Releases the
	//    previously-bound texture the device was holding. A: 2 -> 1, B: 1 -> 2.
	// -------------------------------------------------------------------------
	if (!expect(SUCCEEDED(device->SetTexture(0, texture_b)), "SetTexture(stage0, B) failed")) {
		texture_a->Release();
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	const ULONG a_ref_after_rebind = texture_a->AddRef() - 1;
	texture_a->Release();
	const ULONG b_ref_after_rebind = texture_b->AddRef() - 1;
	texture_b->Release();
	expect(a_ref_after_rebind == 1,
		"rebinding stage 0 must Release the previously-bound texture A (2->1)");
	expect(b_ref_after_rebind == 2,
		"rebinding stage 0 must AddRef the newly-bound texture B (1->2)");

	// -------------------------------------------------------------------------
	// 3. Unbinding with NULL Releases the currently-bound texture. B: 2 -> 1.
	// -------------------------------------------------------------------------
	if (!expect(SUCCEEDED(device->SetTexture(0, nullptr)), "SetTexture(stage0, NULL) failed")) {
		texture_a->Release();
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	const ULONG b_ref_after_unbind = texture_b->AddRef() - 1;
	texture_b->Release();
	expect(b_ref_after_unbind == 1,
		"SetTexture(stage0, NULL) must Release the previously-bound texture B (2->1)");
	expect(state->last_set_texture_id == 0, "last_set_texture_id should be 0 after null bind");

	// -------------------------------------------------------------------------
	// 4. CORE LIFETIME GUARANTEE: a texture that is still bound survives the
	//    engine releasing its own handle. Bind A, drop the engine handle, the
	//    texture object must still be alive (device-held reference). Then unbind
	//    via NULL to let it be destroyed cleanly.
	// -------------------------------------------------------------------------
	if (!expect(SUCCEEDED(device->SetTexture(0, texture_a)), "SetTexture(stage0, A) for lifetime failed")) {
		texture_a->Release();
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	// Engine releases its own handle. The device still holds A, so the object
	// must survive (refcount 2 -> 1, NOT destroyed).
	texture_a->Release(); // engine handle dropped; texture_a ptr is now stale
	texture_a = nullptr;

	// Re-acquire a fresh engine handle is not possible without re-creation, so
	// observe survival indirectly: the device-held reference is still tracked
	// and unbinding now must succeed and drop the last reference (destroying A
	// internally without use-after-free). If the device had NOT held a
	// reference, the SetTexture(NULL) below would touch freed memory.
	if (!expect(SUCCEEDED(device->SetTexture(0, nullptr)),
			"SetTexture(stage0, NULL) after engine handle release must succeed without UAF")) {
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	// -------------------------------------------------------------------------
	// 5. Same-pointer rebind is a no-op (mirrors DX8Wrapper::Set_DX8_Texture
	//    `if (Textures[stage]==texture) return;` and D3D8 device semantics).
	//    Repeated SetTexture(stage, samePtr) must NOT change the refcount and
	//    must NOT re-record a bind. This also covers the critical UAF edge:
	//    when the device-held reference is the ONLY remaining reference, the
	//    unconditional Release-then-AddRef path would drop the last reference
	//    mid-call (destroying the object) and then AddRef freed memory. The
	//    early-return must keep the object alive across the rebind.
	// -------------------------------------------------------------------------
	IDirect3DTexture8 *texture_c = nullptr;
	if (!expect(SUCCEEDED(device->CreateTexture(16, 16, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED,
			&texture_c)),
			"CreateTexture C failed")) {
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	const UINT rebind_binds_before = state->set_texture_calls;
	const UINT rebind_browser_binds_before = state->browser_texture_bind_calls;

	// Bind C on stage 0: engine handle (1) + device (1) = 2.
	if (!expect(SUCCEEDED(device->SetTexture(0, texture_c)), "SetTexture(stage0, C) failed")) {
		texture_c->Release();
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	const ULONG c_ref_after_bind = texture_c->AddRef() - 1;
	texture_c->Release();
	expect(c_ref_after_bind == 2, "texture C must be at refcount 2 after first bind (1->2)");

	// Re-bind the SAME pointer several times. Must be a true no-op: refcount
	// unchanged, no extra set_texture_calls, no extra browser_texture_bind.
	for (int i = 0; i < 3; ++i) {
		if (!expect(SUCCEEDED(device->SetTexture(0, texture_c)),
				"same-pointer SetTexture(stage0, C) must succeed")) {
			texture_c->Release();
			texture_b->Release();
			device->Release();
			d3d->Release();
			return 1;
		}
	}
	const ULONG c_ref_after_rebind = texture_c->AddRef() - 1;
	texture_c->Release();
	expect(c_ref_after_rebind == 2,
			"same-pointer rebind must be a no-op and leave refcount unchanged (2)");
	expect(state->set_texture_calls == rebind_binds_before + 1,
			"same-pointer rebind must not increment set_texture_calls (early-return)");
	expect(state->browser_texture_bind_calls == rebind_browser_binds_before + 1,
			"same-pointer rebind must not re-issue browser_texture_bind (early-return)");

	// CRITICAL UAF EDGE: drop the engine handle while C is still bound. The
	// device-held reference is now the ONLY reference (refcount 2 -> 1), but
	// the pointer variable still resolves to valid memory because the device
	// keeps the object alive. Re-binding that same pointer must NOT Release
	// the device-held reference mid-call (which would destroy C and then
	// AddRef freed memory). The early-return must keep C alive.
	texture_c->Release(); // engine handle dropped; device still holds C (refcount 1)
	const ULONG c_ref_device_only = texture_c->AddRef() - 1; // valid: device keeps C alive
	texture_c->Release();
	expect(c_ref_device_only == 1,
			"after engine handle release, device-held reference must keep C alive (2->1)");

	if (!expect(SUCCEEDED(device->SetTexture(0, texture_c)),
			"same-pointer rebind with only device-held reference must succeed without UAF")) {
		// Clean up the still-bound device-held reference before aborting.
		device->SetTexture(0, nullptr);
		device->Release();
		d3d->Release();
		return 1;
	}
	// C must STILL be alive at refcount 1 (the rebind was a no-op). If the
	// old Release-then-AddRef path had run, C would have been destroyed and
	// this dereference would be a use-after-free.
	const ULONG c_ref_after_device_only_rebind = texture_c->AddRef() - 1;
	texture_c->Release();
	expect(c_ref_after_device_only_rebind == 1,
			"same-pointer rebind must not drop the device-held reference (C still alive at 1)");

	// Clean up C: unbind via NULL Releases the device-held reference (1 -> 0,
	// clean destroy). texture_c pointer is now stale; do not touch it after.
	if (!expect(SUCCEEDED(device->SetTexture(0, nullptr)),
			"SetTexture(stage0, NULL) to release device-held C failed")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// -------------------------------------------------------------------------
	// 6. Device teardown Releases every still-bound texture. Bind B on two
	//    stages, then destroy the device; B must end at refcount 1 (only the
	//    engine handle remains) with no leak and no UAF.
	// -------------------------------------------------------------------------
	if (!expect(SUCCEEDED(device->SetTexture(0, texture_b)), "SetTexture(stage0, B) for teardown failed") ||
		!expect(SUCCEEDED(device->SetTexture(1, texture_b)), "SetTexture(stage1, B) for teardown failed")) {
		texture_b->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	// B is now bound on two stages: engine handle (1) + stage0 (1) + stage1 (1) = 3.
	const ULONG b_ref_two_stages = texture_b->AddRef() - 1;
	texture_b->Release();
	expect(b_ref_two_stages == 3,
		"texture bound on two stages must be AddRef'd once per stage (1->3)");

	// Destroy the device: must Release both stage-held references.
	device->Release();
	device = nullptr;

	const ULONG b_ref_after_device_teardown = texture_b->AddRef() - 1;
	texture_b->Release();
	expect(b_ref_after_device_teardown == 1,
		"device teardown must Release all stage-held texture references (3->1)");

	// Final cleanup of the engine handle.
	texture_b->Release();
	d3d->Release();

	if (g_failures != 0) {
		std::fprintf(stderr, "d3d8-texture-lifetime-smoke: %d failure(s)\n", g_failures);
		return 1;
	}

	std::printf(
		"{\"ok\":true,\"smoke\":\"d3d8-texture-lifetime\","
		"\"note\":\"IDirect3DDevice8::SetTexture device-held reference contract: "
		"bind AddRefs, rebind/null Releases previous, bound texture survives "
		"engine Release, device teardown unbinds all stages.\","
		"\"contract\":{"
		"\"bindAddRefs\":true,\"rebindReleasesPrevious\":true,"
		"\"nullUnbindReleases\":true,\"boundSurvivesEngineRelease\":true,"
		"\"samePointerRebindIsNoOp\":true,"
		"\"deviceTeardownReleasesAllStages\":true},"
		"\"counters\":{\"setTextureCalls\":%u}}\n",
		state->set_texture_calls - binds_before);

	return 0;
}
