#include <cstdio>
#include <cstring>

#include "wasm_d3d8_shim.h"

namespace {

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

bool near(float actual, float expected)
{
	const float difference = actual > expected ? actual - expected : expected - actual;
	return difference <= 0.0001f;
}

} // namespace

int main()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	if (!expect(d3d != nullptr, "Direct3DCreate8 returned null")) {
		return 1;
	}

	D3DDISPLAYMODE mode = {};
	if (!expect(SUCCEEDED(d3d->GetAdapterDisplayMode(D3DADAPTER_DEFAULT, &mode)), "display mode failed") ||
		!expect(mode.Width == 800 && mode.Height == 600, "display mode size mismatch") ||
		!expect(mode.Format == D3DFMT_A8R8G8B8, "display mode format mismatch")) {
		d3d->Release();
		return 1;
	}

	D3DPRESENT_PARAMETERS parameters = {};
	parameters.BackBufferWidth = 640;
	parameters.BackBufferHeight = 360;
	parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
	parameters.BackBufferCount = 1;
	parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
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

	D3DCAPS8 caps = {};
	if (!expect(SUCCEEDED(device->GetDeviceCaps(&caps)), "GetDeviceCaps failed") ||
		!expect(caps.MaxSimultaneousTextures == 8, "device caps texture count mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	D3DVIEWPORT8 viewport = {};
	if (!expect(SUCCEEDED(device->GetViewport(&viewport)), "GetViewport failed") ||
		!expect(viewport.Width == 640 && viewport.Height == 360, "initial viewport mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	viewport.X = 4;
	viewport.Y = 8;
	viewport.Width = 320;
	viewport.Height = 180;
	viewport.MinZ = 0.25f;
	viewport.MaxZ = 0.75f;
	if (!expect(SUCCEEDED(device->SetViewport(&viewport)), "SetViewport failed")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	IDirect3DSurface8 *depth = nullptr;
	D3DSURFACE_DESC depth_desc = {};
	if (!expect(SUCCEEDED(device->GetDepthStencilSurface(&depth)), "GetDepthStencilSurface failed") ||
		!expect(depth != nullptr, "GetDepthStencilSurface returned null") ||
		!expect(SUCCEEDED(depth->GetDesc(&depth_desc)), "depth surface GetDesc failed") ||
		!expect(depth_desc.Format == D3DFMT_D24S8, "depth surface format mismatch") ||
		!expect(depth_desc.Width == 640 && depth_desc.Height == 360, "depth surface size mismatch")) {
		if (depth != nullptr) {
			depth->Release();
		}
		device->Release();
		d3d->Release();
		return 1;
	}
	depth->Release();

	const D3DCOLOR clear_color = 0xff204080;
	if (!expect(SUCCEEDED(device->BeginScene()), "BeginScene failed") ||
		!expect(SUCCEEDED(device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER | D3DCLEAR_STENCIL,
			clear_color, 0.5f, 7)),
			"Clear failed") ||
		!expect(SUCCEEDED(device->EndScene()), "EndScene failed") ||
		!expect(SUCCEEDED(device->Present(nullptr, nullptr, nullptr, nullptr)), "Present failed")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();

	// ---------------------------------------------------------------------------
	// Fixed-function transform / viewport / render-state coverage. The shim
	// stores the matrices and render states CPU-side so Set/Get round-trip and
	// are observable through the probe counters and last-value fields. No GL
	// state is written yet; this exercises state bookkeeping only.
	// ---------------------------------------------------------------------------

	const UINT set_transform_before = state->set_transform_calls;
	const UINT get_transform_before = state->get_transform_calls;
	const UINT set_render_state_before = state->set_render_state_calls;
	const UINT get_render_state_before = state->get_render_state_calls;

	D3DMATRIX view_matrix = {};
	view_matrix.m[0][0] = 1.0f; view_matrix.m[0][1] = 2.0f; view_matrix.m[0][2] = 3.0f; view_matrix.m[0][3] = 4.0f;
	view_matrix.m[1][0] = 5.0f; view_matrix.m[1][1] = 6.0f; view_matrix.m[1][2] = 7.0f; view_matrix.m[1][3] = 8.0f;
	view_matrix.m[2][0] = 9.0f; view_matrix.m[2][1] = 10.0f; view_matrix.m[2][2] = 11.0f; view_matrix.m[2][3] = 12.0f;
	view_matrix.m[3][0] = 13.0f; view_matrix.m[3][1] = 14.0f; view_matrix.m[3][2] = 15.0f; view_matrix.m[3][3] = 16.0f;

	D3DMATRIX projection_matrix = {};
	projection_matrix.m[0][0] = 0.1f;
	projection_matrix.m[1][1] = 0.2f;
	projection_matrix.m[2][2] = 0.3f;
	projection_matrix.m[3][3] = 0.4f;

	if (!expect(SUCCEEDED(device->SetTransform(D3DTS_VIEW, &view_matrix)), "SetTransform VIEW failed") ||
		!expect(SUCCEEDED(device->SetTransform(D3DTS_PROJECTION, &projection_matrix)),
			"SetTransform PROJECTION failed") ||
		!expect(state->set_transform_calls == set_transform_before + 2,
			"set_transform_calls counter mismatch") ||
		!expect(state->last_set_transform_state == D3DTS_PROJECTION,
			"last_set_transform_state mismatch") ||
		!expect(near(state->last_set_transform_matrix.m[0][0], 0.1f),
			"last_set_transform_matrix mismatch") ||
		!expect(near(state->last_set_transform_matrix.m[3][3], 0.4f),
			"last_set_transform_matrix diagonal mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	D3DMATRIX readback_matrix = {};
	if (!expect(SUCCEEDED(device->GetTransform(D3DTS_VIEW, &readback_matrix)), "GetTransform VIEW failed") ||
		!expect(near(readback_matrix.m[0][0], 1.0f), "GetTransform VIEW element mismatch") ||
		!expect(near(readback_matrix.m[1][2], 7.0f), "GetTransform VIEW element mismatch") ||
		!expect(state->get_transform_calls == get_transform_before + 1,
			"get_transform_calls counter mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// An unset transform state defaults to identity and still reports through
	// the get counter / last-get field.
	D3DMATRIX texture_matrix = {};
	if (!expect(SUCCEEDED(device->GetTransform(D3DTS_TEXTURE0, &texture_matrix)),
			"GetTransform TEXTURE0 failed") ||
		!expect(near(texture_matrix.m[0][0], 1.0f) && near(texture_matrix.m[1][1], 1.0f) &&
			near(texture_matrix.m[2][2], 1.0f) && near(texture_matrix.m[3][3], 1.0f),
			"unset transform should default to identity") ||
		!expect(near(texture_matrix.m[0][1], 0.0f), "identity transform has non-zero off-diagonal") ||
		!expect(state->get_transform_calls == get_transform_before + 2,
			"get_transform_calls counter mismatch after identity read") ||
		!expect(state->last_get_transform_state == D3DTS_TEXTURE0,
			"last_get_transform_state mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// Viewport set/get round-trip observability. The viewport was set above; a
	// fresh GetViewport must echo the stored values and bump the get counter.
	D3DVIEWPORT8 readback_viewport = {};
	if (!expect(SUCCEEDED(device->GetViewport(&readback_viewport)), "GetViewport round-trip failed") ||
		!expect(readback_viewport.X == 4 && readback_viewport.Y == 8 &&
			readback_viewport.Width == 320 && readback_viewport.Height == 180,
			"GetViewport round-trip value mismatch") ||
		!expect(near(readback_viewport.MinZ, 0.25f) && near(readback_viewport.MaxZ, 0.75f),
			"GetViewport round-trip depth range mismatch") ||
		!expect(state->get_viewport_calls == 2, "get_viewport_calls counter mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	if (!expect(SUCCEEDED(device->SetRenderState(D3DRS_ZENABLE, 1)), "SetRenderState ZENABLE failed") ||
		!expect(SUCCEEDED(device->SetRenderState(D3DRS_CULLMODE, 3)), "SetRenderState CULLMODE failed") ||
		!expect(state->set_render_state_calls == set_render_state_before + 2,
			"set_render_state_calls counter mismatch") ||
		!expect(state->last_set_render_state == D3DRS_CULLMODE, "last_set_render_state mismatch") ||
		!expect(state->last_set_render_state_value == 3, "last_set_render_state_value mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	DWORD zenable_value = 0;
	DWORD fog_value = 0;
	if (!expect(SUCCEEDED(device->GetRenderState(D3DRS_ZENABLE, &zenable_value)),
			"GetRenderState ZENABLE failed") ||
		!expect(zenable_value == 1, "GetRenderState ZENABLE value mismatch") ||
		!expect(SUCCEEDED(device->GetRenderState(D3DRS_FOGENABLE, &fog_value)),
			"GetRenderState FOGENABLE failed") ||
		!expect(fog_value == 0, "unset render state should default to 0") ||
		!expect(state->get_render_state_calls == get_render_state_before + 2,
			"get_render_state_calls counter mismatch") ||
		!expect(state->last_get_render_state == D3DRS_FOGENABLE,
			"last_get_render_state mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// ---------------------------------------------------------------------------
	// CPU-backed D3D8 resource coverage (texture / vertex buffer / index buffer).
	// These resources are backed by host-side std::vector buffers in the shim;
	// this exercises Lock/Unlock, descriptor, pitch, and browser callback
	// metadata while the actual WebGL effects are covered by the harness.
	// ---------------------------------------------------------------------------

	const UINT textures_before = state->create_texture_calls;
	const UINT vbufs_before = state->create_vertex_buffer_calls;
	const UINT ibufs_before = state->create_index_buffer_calls;
	const UINT tex_locks_before = state->texture_lock_rect_calls;
	const UINT tex_unlocks_before = state->texture_unlock_rect_calls;
	const UINT texture_binds_before = state->set_texture_calls;
	const UINT browser_texture_binds_before = state->browser_texture_bind_calls;
	const UINT set_texture_stage_state_before = state->set_texture_stage_state_calls;
	const UINT buf_locks_before = state->buffer_lock_calls;
	const UINT buf_unlocks_before = state->buffer_unlock_calls;

	const UINT texture_width = 64;
	const UINT texture_height = 32;
	const UINT texture_levels = 3;
	IDirect3DTexture8 *texture = nullptr;
	UINT texture_browser_id = 0;
	if (!expect(SUCCEEDED(device->CreateTexture(texture_width, texture_height, texture_levels, 0,
				D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture)),
			"CreateTexture failed") ||
		!expect(texture != nullptr, "CreateTexture returned null texture") ||
		!expect(state->create_texture_calls == textures_before + 1,
			"create_texture_calls counter mismatch")) {
		if (texture != nullptr) {
			texture->Release();
		}
		device->Release();
		d3d->Release();
		return 1;
	}
	texture_browser_id = state->last_browser_texture_id;
	if (!expect(texture_browser_id != 0, "CreateTexture did not allocate a browser texture id")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	D3DSURFACE_DESC level0_desc = {};
	if (!expect(SUCCEEDED(texture->GetLevelDesc(0, &level0_desc)), "GetLevelDesc failed") ||
		!expect(level0_desc.Width == texture_width && level0_desc.Height == texture_height,
			"texture level 0 size mismatch") ||
		!expect(level0_desc.Format == D3DFMT_A8R8G8B8, "texture level 0 format mismatch") ||
		!expect(level0_desc.Type == D3DRTYPE_SURFACE, "texture level 0 resource type mismatch") ||
		!expect(texture->GetLevelCount() == texture_levels, "texture level count mismatch")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	D3DLOCKED_RECT locked_rect = {};
	const UINT expected_pitch = texture_width * 4;
	if (!expect(SUCCEEDED(texture->LockRect(0, &locked_rect, nullptr, 0)), "texture LockRect failed") ||
		!expect(locked_rect.pBits != nullptr, "texture LockRect returned null pBits") ||
		!expect(static_cast<UINT>(locked_rect.Pitch) == expected_pitch,
			"texture LockRect pitch mismatch") ||
		!expect(state->texture_lock_rect_calls == tex_locks_before + 1,
			"texture_lock_rect_calls counter mismatch") ||
		!expect(SUCCEEDED(texture->UnlockRect(0)), "texture UnlockRect failed") ||
		!expect(state->texture_unlock_rect_calls == tex_unlocks_before + 1,
			"texture_unlock_rect_calls counter mismatch")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	BYTE *texture_base_bits = static_cast<BYTE *>(locked_rect.pBits);

	// A sub-rect lock returns the same row pitch but an offset pointer into
	// the same backing store, and increments the lock counter a second time.
	D3DLOCKED_RECT sub_rect_locked = {};
	RECT sub_rect = {};
	sub_rect.left = 2;
	sub_rect.top = 1;
	sub_rect.right = 6;
	sub_rect.bottom = 3;
	if (!expect(SUCCEEDED(texture->LockRect(0, &sub_rect_locked, &sub_rect, 0)),
			"texture sub-rect LockRect failed") ||
		!expect(static_cast<BYTE *>(sub_rect_locked.pBits) ==
				texture_base_bits + (sub_rect.top * expected_pitch) + (sub_rect.left * 4),
			"texture sub-rect pBits offset mismatch") ||
		!expect(static_cast<UINT>(sub_rect_locked.Pitch) == expected_pitch,
			"texture sub-rect pitch mismatch")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	if (!expect(SUCCEEDED(texture->UnlockRect(0)), "texture sub-rect UnlockRect failed") ||
		!expect(state->texture_unlock_rect_calls == tex_unlocks_before + 2,
			"texture_unlock_rect_calls counter mismatch after sub-rect unlock")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	// Out-of-range lock level fails before delegating to the surface; the
	// texture-level gate does not increment texture_lock_rect_calls for an
	// invalid level argument.
	if (!expect(FAILED(texture->LockRect(texture_levels, &locked_rect, nullptr, 0)),
			"texture out-of-range LockRect should fail") ||
		!expect(state->texture_lock_rect_calls == tex_locks_before + 2,
			"texture out-of-range LockRect should not increment counter")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	if (!expect(SUCCEEDED(device->SetTexture(0, texture)), "SetTexture stage 0 failed") ||
		!expect(state->set_texture_calls == texture_binds_before + 1,
			"set_texture_calls counter mismatch after texture bind") ||
		!expect(state->browser_texture_bind_calls == browser_texture_binds_before + 1,
			"browser_texture_bind_calls counter mismatch after texture bind") ||
		!expect(state->last_set_texture_stage == 0,
			"last_set_texture_stage mismatch after texture bind") ||
		!expect(state->last_set_texture_id == texture_browser_id,
			"last_set_texture_id mismatch after texture bind") ||
		!expect(state->last_set_texture_type == D3DRTYPE_TEXTURE,
			"last_set_texture_type mismatch after texture bind") ||
		!expect(state->last_browser_texture_bind_stage == 0,
			"last_browser_texture_bind_stage mismatch after texture bind") ||
		!expect(state->last_browser_texture_bind_id == texture_browser_id,
			"last_browser_texture_bind_id mismatch after texture bind")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	if (!expect(SUCCEEDED(device->SetTexture(0, nullptr)), "SetTexture stage 0 null failed") ||
		!expect(state->set_texture_calls == texture_binds_before + 2,
			"set_texture_calls counter mismatch after null texture bind") ||
		!expect(state->browser_texture_bind_calls == browser_texture_binds_before + 2,
			"browser_texture_bind_calls counter mismatch after null texture bind") ||
		!expect(state->last_set_texture_stage == 0,
			"last_set_texture_stage mismatch after null texture bind") ||
		!expect(state->last_set_texture_id == 0,
			"last_set_texture_id mismatch after null texture bind") ||
		!expect(state->last_browser_texture_bind_stage == 0,
			"last_browser_texture_bind_stage mismatch after null texture bind") ||
		!expect(state->last_browser_texture_bind_id == 0,
			"last_browser_texture_bind_id mismatch after null texture bind")) {
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	const UINT vertex_buffer_length = 256;
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	if (!expect(SUCCEEDED(device->CreateVertexBuffer(vertex_buffer_length, D3DUSAGE_WRITEONLY, 0,
				D3DPOOL_DEFAULT, &vertex_buffer)),
			"CreateVertexBuffer failed") ||
		!expect(vertex_buffer != nullptr, "CreateVertexBuffer returned null") ||
		!expect(state->create_vertex_buffer_calls == vbufs_before + 1,
			"create_vertex_buffer_calls counter mismatch") ||
		!expect(state->last_browser_buffer_usage == D3DUSAGE_WRITEONLY,
			"static vertex buffer usage hint mismatch") ||
		!expect(state->last_browser_buffer_lock_flags == 0,
			"static vertex buffer create should not report lock flags")) {
		if (vertex_buffer != nullptr) {
			vertex_buffer->Release();
		}
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	BYTE *vertex_data = nullptr;
	const UINT vertex_offset = 32;
	const UINT vertex_size = 64;
	if (!expect(SUCCEEDED(vertex_buffer->Lock(vertex_offset, vertex_size, &vertex_data, 0)),
			"vertex buffer Lock failed") ||
		!expect(vertex_data != nullptr, "vertex buffer Lock returned null")) {
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	std::memset(vertex_data, 0xab, vertex_size);
	if (!expect(SUCCEEDED(vertex_buffer->Unlock()), "vertex buffer Unlock failed") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 1,
			"buffer_lock_calls counter mismatch after vertex lock") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 1,
			"buffer_unlock_calls counter mismatch after vertex unlock") ||
		!expect(state->last_browser_buffer_kind == 1,
			"vertex dirty update kind mismatch") ||
		!expect(state->last_browser_buffer_offset == vertex_offset,
			"vertex dirty update offset mismatch") ||
		!expect(state->last_browser_buffer_bytes == vertex_size,
			"vertex dirty update byte count mismatch") ||
		!expect(state->last_browser_buffer_usage == D3DUSAGE_WRITEONLY,
			"vertex dirty update usage hint mismatch") ||
		!expect(state->last_browser_buffer_lock_flags == 0,
			"vertex dirty update lock flags mismatch")) {
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	// size == 0 means the whole tail from offset. Verify it succeeds and
	// bumps the lock counter again.
	BYTE *vertex_tail = nullptr;
	if (!expect(SUCCEEDED(vertex_buffer->Lock(vertex_offset, 0, &vertex_tail, 0)),
			"vertex buffer whole-tail Lock failed") ||
		!expect(vertex_tail != nullptr, "vertex buffer whole-tail Lock returned null") ||
		!expect(SUCCEEDED(vertex_buffer->Unlock()), "vertex buffer whole-tail Unlock failed") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 2,
			"buffer_lock_calls counter mismatch after vertex tail lock") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 2,
			"buffer_unlock_calls counter mismatch after vertex tail unlock") ||
		!expect(state->last_browser_buffer_kind == 1,
			"vertex tail dirty update kind mismatch") ||
		!expect(state->last_browser_buffer_offset == vertex_offset,
			"vertex tail dirty update offset mismatch") ||
		!expect(state->last_browser_buffer_bytes == vertex_buffer_length - vertex_offset,
			"vertex tail dirty update byte count mismatch")) {
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	const UINT vertex_updates_after_tail = state->browser_buffer_update_calls;
	if (!expect(FAILED(vertex_buffer->Unlock()), "vertex buffer stray Unlock should fail") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 2,
			"buffer_unlock_calls should not increment on failed vertex unlock") ||
		!expect(state->browser_buffer_update_calls == vertex_updates_after_tail,
			"browser buffer updates should not increment on failed vertex unlock")) {
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	BYTE *vertex_nested = nullptr;
	if (!expect(SUCCEEDED(vertex_buffer->Lock(0, vertex_size, &vertex_nested, 0)),
			"vertex buffer nested-test Lock failed") ||
		!expect(vertex_nested != nullptr, "vertex buffer nested-test Lock returned null")) {
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	if (!expect(FAILED(vertex_buffer->Lock(vertex_offset, vertex_size, &vertex_data, 0)),
			"vertex buffer nested Lock should fail") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 3,
			"buffer_lock_calls should not increment on nested vertex lock")) {
		vertex_buffer->Unlock();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	if (!expect(SUCCEEDED(vertex_buffer->Unlock()), "vertex buffer nested-test Unlock failed") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 3,
			"buffer_unlock_calls counter mismatch after vertex nested-test unlock")) {
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	// Out-of-range vertex lock (offset past end, and oversized size) fails and
	// does NOT bump the buffer_lock_calls counter.
	if (!expect(FAILED(vertex_buffer->Lock(vertex_buffer_length + 8, 0, &vertex_data, 0)),
			"vertex buffer out-of-range offset Lock should fail") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 3,
			"buffer_lock_calls should not increment on failed vertex lock") ||
		!expect(FAILED(vertex_buffer->Lock(vertex_offset, vertex_buffer_length, &vertex_data, 0)),
			"vertex buffer oversized size Lock should fail") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 3,
			"buffer_lock_calls should not increment on oversized vertex lock")) {
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	const UINT index_buffer_length = 96;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	if (!expect(SUCCEEDED(device->CreateIndexBuffer(index_buffer_length, D3DUSAGE_WRITEONLY, D3DFMT_INDEX16,
				D3DPOOL_DEFAULT, &index_buffer)),
			"CreateIndexBuffer failed") ||
		!expect(index_buffer != nullptr, "CreateIndexBuffer returned null") ||
		!expect(state->create_index_buffer_calls == ibufs_before + 1,
			"create_index_buffer_calls counter mismatch")) {
		if (index_buffer != nullptr) {
			index_buffer->Release();
		}
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	BYTE *index_data = nullptr;
	const UINT index_offset = 16;
	const UINT index_size = 48;
	if (!expect(SUCCEEDED(index_buffer->Lock(index_offset, index_size, &index_data, 0)),
			"index buffer Lock failed") ||
		!expect(index_data != nullptr, "index buffer Lock returned null")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	std::memset(index_data, 0xcd, index_size);
	if (!expect(SUCCEEDED(index_buffer->Unlock()), "index buffer Unlock failed") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 4,
			"buffer_lock_calls counter mismatch after index lock") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 4,
			"buffer_unlock_calls counter mismatch after index unlock") ||
		!expect(state->last_browser_buffer_kind == 2,
			"index dirty update kind mismatch") ||
		!expect(state->last_browser_buffer_offset == index_offset,
			"index dirty update offset mismatch") ||
		!expect(state->last_browser_buffer_bytes == index_size,
			"index dirty update byte count mismatch")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	// Index buffer whole-tail (size == 0) lock semantics.
	BYTE *index_tail = nullptr;
	if (!expect(SUCCEEDED(index_buffer->Lock(index_offset, 0, &index_tail, 0)),
			"index buffer whole-tail Lock failed") ||
		!expect(index_tail != nullptr, "index buffer whole-tail Lock returned null") ||
		!expect(SUCCEEDED(index_buffer->Unlock()), "index buffer whole-tail Unlock failed") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 5,
			"buffer_lock_calls counter mismatch after index tail lock") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 5,
			"buffer_unlock_calls counter mismatch after index tail unlock") ||
		!expect(state->last_browser_buffer_kind == 2,
			"index tail dirty update kind mismatch") ||
		!expect(state->last_browser_buffer_offset == index_offset,
			"index tail dirty update offset mismatch") ||
		!expect(state->last_browser_buffer_bytes == index_buffer_length - index_offset,
			"index tail dirty update byte count mismatch")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	const UINT index_updates_after_tail = state->browser_buffer_update_calls;
	if (!expect(FAILED(index_buffer->Unlock()), "index buffer stray Unlock should fail") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 5,
			"buffer_unlock_calls should not increment on failed index unlock") ||
		!expect(state->browser_buffer_update_calls == index_updates_after_tail,
			"browser buffer updates should not increment on failed index unlock")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	BYTE *index_nested = nullptr;
	if (!expect(SUCCEEDED(index_buffer->Lock(0, index_size, &index_nested, 0)),
			"index buffer nested-test Lock failed") ||
		!expect(index_nested != nullptr, "index buffer nested-test Lock returned null")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	if (!expect(FAILED(index_buffer->Lock(index_offset, index_size, &index_data, 0)),
			"index buffer nested Lock should fail") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 6,
			"buffer_lock_calls should not increment on nested index lock")) {
		index_buffer->Unlock();
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	if (!expect(SUCCEEDED(index_buffer->Unlock()), "index buffer nested-test Unlock failed") ||
		!expect(state->buffer_unlock_calls == buf_unlocks_before + 6,
			"buffer_unlock_calls counter mismatch after index nested-test unlock")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	// Index buffer invalid lock ranges match the vertex-buffer rejection
	// contract and must not increment the successful-lock counter.
	if (!expect(FAILED(index_buffer->Lock(index_buffer_length + 8, 0, &index_data, 0)),
			"index buffer out-of-range offset Lock should fail") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 6,
			"buffer_lock_calls should not increment on failed index lock") ||
		!expect(FAILED(index_buffer->Lock(index_offset, index_buffer_length, &index_data, 0)),
			"index buffer oversized size Lock should fail") ||
		!expect(state->buffer_lock_calls == buf_locks_before + 6,
			"buffer_lock_calls should not increment on oversized index lock")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	IDirect3DVertexBuffer8 *dynamic_vertex_buffer = nullptr;
	const DWORD dynamic_usage = D3DUSAGE_WRITEONLY | D3DUSAGE_DYNAMIC;
	if (!expect(SUCCEEDED(device->CreateVertexBuffer(128, dynamic_usage, 0,
				D3DPOOL_DEFAULT, &dynamic_vertex_buffer)),
			"dynamic CreateVertexBuffer failed") ||
		!expect(dynamic_vertex_buffer != nullptr, "dynamic CreateVertexBuffer returned null") ||
		!expect(state->last_browser_buffer_usage == dynamic_usage,
			"dynamic vertex buffer usage hint mismatch") ||
		!expect(state->last_browser_buffer_lock_flags == 0,
			"dynamic vertex buffer create should not report lock flags")) {
		if (dynamic_vertex_buffer != nullptr) {
			dynamic_vertex_buffer->Release();
		}
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	BYTE *dynamic_data = nullptr;
	const DWORD discard_flags = D3DLOCK_DISCARD | D3DLOCK_NOSYSLOCK;
	if (!expect(SUCCEEDED(dynamic_vertex_buffer->Lock(0, 32, &dynamic_data, discard_flags)),
			"dynamic vertex discard Lock failed") ||
		!expect(dynamic_data != nullptr, "dynamic vertex discard Lock returned null")) {
		dynamic_vertex_buffer->Release();
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	std::memset(dynamic_data, 0xee, 32);
	if (!expect(SUCCEEDED(dynamic_vertex_buffer->Unlock()), "dynamic vertex discard Unlock failed") ||
		!expect(state->last_browser_buffer_kind == 1,
			"dynamic vertex discard update kind mismatch") ||
		!expect(state->last_browser_buffer_usage == dynamic_usage,
			"dynamic vertex discard usage hint mismatch") ||
		!expect(state->last_browser_buffer_lock_flags == discard_flags,
			"dynamic vertex discard lock flags mismatch") ||
		!expect(state->last_browser_buffer_offset == 0,
			"dynamic vertex discard offset mismatch") ||
		!expect(state->last_browser_buffer_bytes == 32,
			"dynamic vertex discard byte count mismatch")) {
		dynamic_vertex_buffer->Release();
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	const DWORD no_overwrite_flags = D3DLOCK_NOOVERWRITE | D3DLOCK_NOSYSLOCK;
	if (!expect(SUCCEEDED(dynamic_vertex_buffer->Lock(32, 16, &dynamic_data, no_overwrite_flags)),
			"dynamic vertex no-overwrite Lock failed") ||
		!expect(dynamic_data != nullptr, "dynamic vertex no-overwrite Lock returned null")) {
		dynamic_vertex_buffer->Release();
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	std::memset(dynamic_data, 0xef, 16);
	if (!expect(SUCCEEDED(dynamic_vertex_buffer->Unlock()), "dynamic vertex no-overwrite Unlock failed") ||
		!expect(state->last_browser_buffer_usage == dynamic_usage,
			"dynamic vertex no-overwrite usage hint mismatch") ||
		!expect(state->last_browser_buffer_lock_flags == no_overwrite_flags,
			"dynamic vertex no-overwrite lock flags mismatch") ||
		!expect(state->last_browser_buffer_offset == 32,
			"dynamic vertex no-overwrite offset mismatch") ||
		!expect(state->last_browser_buffer_bytes == 16,
			"dynamic vertex no-overwrite byte count mismatch")) {
		dynamic_vertex_buffer->Release();
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}
	dynamic_vertex_buffer->Release();

	if (!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MODULATE)),
			"SetTextureStageState stage0 COLOROP failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE)),
			"SetTextureStageState stage0 COLORARG1 failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE)),
			"SetTextureStageState stage0 COLORARG2 failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_MINFILTER, D3DTEXF_LINEAR)),
			"SetTextureStageState stage0 MINFILTER failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_MAGFILTER, D3DTEXF_POINT)),
			"SetTextureStageState stage0 MAGFILTER failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_MIPFILTER, D3DTEXF_NONE)),
			"SetTextureStageState stage0 MIPFILTER failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP)),
			"SetTextureStageState stage0 ADDRESSU failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_ADDRESSV, D3DTADDRESS_WRAP)),
			"SetTextureStageState stage0 ADDRESSV failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(0, D3DTSS_TEXCOORDINDEX, 0)),
			"SetTextureStageState stage0 TEXCOORDINDEX failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(1, D3DTSS_COLOROP, D3DTOP_DISABLE)),
			"SetTextureStageState stage1 COLOROP failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(1, D3DTSS_TEXCOORDINDEX, 1)),
			"SetTextureStageState stage1 TEXCOORDINDEX failed") ||
		!expect(state->set_texture_stage_state_calls == set_texture_stage_state_before + 11,
			"set_texture_stage_state_calls counter mismatch") ||
		!expect(state->last_set_texture_stage_state_stage == 1,
			"last_set_texture_stage_state_stage mismatch") ||
		!expect(state->last_set_texture_stage_state == D3DTSS_TEXCOORDINDEX,
			"last_set_texture_stage_state mismatch") ||
		!expect(state->last_set_texture_stage_state_value == 1,
			"last_set_texture_stage_state_value mismatch")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	const UINT draw_stride = 16;
	const UINT draw_base_vertex = 2;
	const UINT draw_min_index = 1;
	if (!expect(SUCCEEDED(device->SetStreamSource(0, vertex_buffer, draw_stride)),
			"SetStreamSource failed") ||
		!expect(SUCCEEDED(device->SetIndices(index_buffer, draw_base_vertex)), "SetIndices failed") ||
		!expect(SUCCEEDED(device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, draw_min_index, 3, 8, 1)),
			"DrawIndexedPrimitive failed") ||
		!expect(state->last_indices_base_vertex_index == draw_base_vertex,
			"last_indices_base_vertex_index mismatch") ||
		!expect(state->last_draw_stream_source_stride == draw_stride,
			"last_draw_stream_source_stride mismatch") ||
		!expect(state->last_draw_vertex_buffer_offset == (draw_base_vertex + draw_min_index) * draw_stride,
			"indexed draw vertex capture should include base vertex index") ||
		!expect(state->last_draw_vertex_buffer_bytes == 3 * draw_stride,
			"indexed draw vertex byte count mismatch") ||
		!expect(state->last_draw_vertex_buffer_id != 0,
			"indexed draw vertex browser buffer id missing") ||
		!expect(state->last_draw_vertex_buffer_checksum != 0,
			"indexed draw vertex checksum should be non-zero") ||
		!expect(state->last_draw_index_buffer_offset == 8 * sizeof(WORD),
			"indexed draw index capture offset mismatch") ||
		!expect(state->last_draw_index_buffer_bytes == 3 * sizeof(WORD),
			"indexed draw index byte count mismatch") ||
		!expect(state->last_draw_index_buffer_id != 0,
			"indexed draw index browser buffer id missing") ||
		!expect(state->last_draw_index_buffer_checksum != 0,
			"indexed draw index checksum should be non-zero") ||
		!expect(state->last_draw_index_format == D3DFMT_INDEX16,
			"indexed draw index format mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] == D3DTOP_MODULATE,
			"draw texture stage0 COLOROP capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG1] == D3DTA_TEXTURE,
			"draw texture stage0 COLORARG1 capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE,
			"draw texture stage0 COLORARG2 capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[0].values[D3DTSS_MINFILTER] == D3DTEXF_LINEAR,
			"draw texture stage0 MINFILTER capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[0].values[D3DTSS_MAGFILTER] == D3DTEXF_POINT,
			"draw texture stage0 MAGFILTER capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[0].values[D3DTSS_ADDRESSU] == D3DTADDRESS_CLAMP,
			"draw texture stage0 ADDRESSU capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[0].values[D3DTSS_ADDRESSV] == D3DTADDRESS_WRAP,
			"draw texture stage0 ADDRESSV capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] == D3DTOP_DISABLE,
			"draw texture stage1 COLOROP capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[1].values[D3DTSS_TEXCOORDINDEX] == 1,
			"draw texture stage1 TEXCOORDINDEX capture mismatch")) {
		index_buffer->Release();
		vertex_buffer->Release();
		texture->Release();
		device->Release();
		d3d->Release();
		return 1;
	}

	index_buffer->Release();
	vertex_buffer->Release();
	texture->Release();

	const bool state_ok =
		expect(state->direct3d_create_calls == 1, "Direct3DCreate8 call count mismatch") &&
		expect(state->load_library_calls == 0, "LoadLibrary call count mismatch") &&
		expect(state->get_proc_address_calls == 0, "GetProcAddress call count mismatch") &&
		expect(state->free_library_calls == 0, "FreeLibrary call count mismatch") &&
		expect(state->create_device_calls == 1, "CreateDevice call count mismatch") &&
		expect(state->begin_scene_calls == 1, "BeginScene call count mismatch") &&
		expect(state->clear_calls == 1, "Clear call count mismatch") &&
		expect(state->end_scene_calls == 1, "EndScene call count mismatch") &&
		expect(state->present_calls == 1, "Present call count mismatch") &&
		expect(state->last_clear_flags == (D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER | D3DCLEAR_STENCIL),
			"clear flags mismatch") &&
		expect(state->last_clear_color == clear_color, "clear color mismatch") &&
		expect(near(state->last_clear_z, 0.5f), "clear z mismatch") &&
		expect(state->last_clear_stencil == 7, "clear stencil mismatch") &&
		expect(state->back_buffer_width == 640 && state->back_buffer_height == 360,
			"back-buffer state mismatch") &&
		expect(state->back_buffer_format == D3DFMT_A8R8G8B8, "back-buffer format mismatch") &&
		expect(state->depth_stencil_format == D3DFMT_D24S8, "depth-stencil state mismatch") &&
		expect(state->viewport.X == 4 && state->viewport.Y == 8 &&
			state->viewport.Width == 320 && state->viewport.Height == 180,
			"viewport state mismatch") &&
		expect(state->set_transform_calls == 2, "set_transform_calls count mismatch") &&
		expect(state->get_transform_calls == 2, "get_transform_calls count mismatch") &&
		expect(state->set_viewport_calls == 1, "set_viewport_calls count mismatch") &&
		expect(state->get_viewport_calls == 2, "get_viewport_calls count mismatch") &&
		expect(state->set_render_state_calls == 2, "set_render_state_calls count mismatch") &&
		expect(state->get_render_state_calls == 2, "get_render_state_calls count mismatch") &&
		expect(state->set_texture_stage_state_calls == 11,
			"set_texture_stage_state_calls count mismatch") &&
		expect(state->browser_buffer_create_calls >= 2, "browser buffer create count mismatch") &&
		expect(state->browser_buffer_update_calls >= 4, "browser buffer update count mismatch");

	device->Release();
	d3d->Release();

	const bool release_ok =
		expect(state->browser_buffer_release_calls >= 2, "browser buffer release count mismatch");

	if (!state_ok || !release_ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"d3d8-shim\",\"clearColor\":%lu}\n",
		static_cast<unsigned long>(clear_color));
	return 0;
}
