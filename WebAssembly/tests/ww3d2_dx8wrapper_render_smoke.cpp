#include <cstdio>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "boxrobj.h"
#include "camera.h"
#include "coltype.h"
#include "dx8wrapper.h"
#include "rinfo.h"
#include "wasm_d3d8_shim.h"
#include "ww3d.h"

namespace {

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

} // namespace

int main()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	if (!expect(WW3D::Init(nullptr, nullptr, false) == WW3D_ERROR_OK, "WW3D::Init failed")) {
		return 1;
	}

	bool ok = expect(
		WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true) == WW3D_ERROR_OK,
		"WW3D::Set_Render_Device failed");

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		expect(DX8Wrapper::_Get_D3D_Device8() != nullptr, "DX8Wrapper D3D device is null") &&
		expect(state->create_device_calls == 1, "CreateDevice call count mismatch") &&
		expect(state->create_texture_calls >= 1, "MissingTexture did not create a texture") &&
		expect(state->texture_lock_rect_calls >= 1, "MissingTexture did not lock a texture") &&
		expect(state->texture_unlock_rect_calls >= 1, "MissingTexture did not unlock a texture") &&
		expect(state->create_index_buffer_calls >= 1, "WW3D init did not create an index buffer") &&
		expect(state->buffer_lock_calls >= 1, "WW3D init did not lock a fixed buffer") &&
		expect(state->buffer_unlock_calls >= 1, "WW3D init did not unlock a fixed buffer");

	if (ok) {
		DX8Wrapper::Begin_Scene();
		DX8Wrapper::Clear(true, true, Vector3(0.0f, 0.25f, 0.5f), 0.75f, 1.0f, 0);
		DX8Wrapper::End_Scene(true);
	}

	state = wasm_d3d8_get_state();
	ok = ok &&
		expect(state->begin_scene_calls == 1, "BeginScene call count mismatch") &&
		expect(state->clear_calls == 1, "Clear call count mismatch") &&
		expect((state->last_clear_flags & D3DCLEAR_TARGET) != 0, "Clear did not include color target") &&
		expect((state->last_clear_flags & D3DCLEAR_ZBUFFER) != 0, "Clear did not include z buffer") &&
		expect(state->end_scene_calls == 1, "EndScene call count mismatch") &&
		expect(state->present_calls == 1, "Present call count mismatch");

	const UINT vertex_buffers_before = state->create_vertex_buffer_calls;
	const UINT index_buffers_before = state->create_index_buffer_calls;
	const UINT stream_sources_before = state->set_stream_source_calls;
	const UINT indices_before = state->set_indices_calls;
	const UINT indexed_draws_before = state->draw_indexed_primitive_calls;

	if (ok) {
		BoxRenderObjClass::Set_Box_Display_Mask(COLL_TYPE_ALL);

		CameraClass *camera = W3DNEW CameraClass();
		AABoxRenderObjClass *box = NEW_REF(AABoxRenderObjClass, ());
		ok = ok &&
			expect(camera != nullptr, "CameraClass allocation failed") &&
			expect(box != nullptr, "AABoxRenderObjClass allocation failed");

		if (ok) {
			WW3D::Set_Thumbnail_Enabled(false);
			box->Set_Local_Center_Extent(Vector3(0.0f, 0.0f, 0.0f), Vector3(1.0f, 2.0f, 3.0f));
			RenderInfoClass render_info(*camera);
			const bool begin_ok = expect(
				WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f)) == WW3D_ERROR_OK,
				"WW3D::Begin_Render failed");
			ok = ok && begin_ok;
			if (begin_ok) {
				const bool render_ok = expect(
					WW3D::Render(*box, render_info) == WW3D_ERROR_OK, "WW3D::Render AABox failed");
				const bool end_ok = expect(
					WW3D::End_Render(false) == WW3D_ERROR_OK, "WW3D::End_Render failed");
				ok = ok && render_ok && end_ok;
			}
		}

		if (box != nullptr) {
			box->Release_Ref();
		}
		if (camera != nullptr) {
			camera->Release_Ref();
		}
	}

	state = wasm_d3d8_get_state();
	ok = ok &&
		expect(state->begin_scene_calls == 2, "AABox render did not begin a second scene") &&
		expect(state->end_scene_calls == 2, "AABox render did not end a second scene") &&
		expect(state->present_calls == 1, "AABox render unexpectedly presented") &&
		expect(state->create_vertex_buffer_calls > vertex_buffers_before,
			"AABox render did not create a dynamic vertex buffer") &&
		expect(state->create_index_buffer_calls > index_buffers_before,
			"AABox render did not create a dynamic index buffer") &&
		expect(state->set_stream_source_calls > stream_sources_before,
			"AABox render did not bind a vertex stream") &&
		expect(state->set_indices_calls > indices_before,
			"AABox render did not bind an index buffer") &&
		expect(state->draw_indexed_primitive_calls > indexed_draws_before,
			"AABox render did not issue an indexed draw") &&
		expect(state->last_draw_primitive_type == D3DPT_TRIANGLELIST,
			"AABox render primitive type mismatch") &&
		expect(state->last_draw_vertex_count == 8, "AABox render vertex count mismatch") &&
		expect(state->last_draw_primitive_count == 12, "AABox render triangle count mismatch") &&
		expect(state->last_draw_stream_source_stride > 0, "AABox render stream stride was not captured") &&
		expect(state->last_draw_vertex_buffer_length > 0, "AABox render vertex buffer length missing") &&
		expect(state->last_draw_vertex_buffer_bytes ==
				state->last_draw_vertex_count * state->last_draw_stream_source_stride,
			"AABox render vertex byte range mismatch") &&
		expect(state->last_draw_vertex_buffer_id != 0,
			"AABox render vertex browser buffer id missing") &&
		expect(state->last_draw_vertex_buffer_checksum != 0,
			"AABox render vertex byte checksum missing") &&
		expect(state->last_draw_index_format == D3DFMT_INDEX16,
			"AABox render index format mismatch") &&
		expect(state->last_draw_index_buffer_length > 0, "AABox render index buffer length missing") &&
		expect(state->last_draw_index_buffer_bytes == state->last_draw_primitive_count * 3 * sizeof(WORD),
			"AABox render index byte range mismatch") &&
		expect(state->last_draw_index_buffer_id != 0,
			"AABox render index browser buffer id missing") &&
		expect(state->last_draw_index_buffer_checksum != 0,
			"AABox render index byte checksum missing") &&
		expect(state->browser_buffer_create_calls >= 2,
			"AABox render did not create browser buffers") &&
		expect(state->browser_buffer_update_calls >= 2,
			"AABox render did not update browser buffers") &&
		expect((state->last_draw_transform_mask & 7u) == 7u,
			"AABox render did not capture world/view/projection transforms") &&
		expect(state->last_draw_render_state.cull_mode == D3DCULL_CW,
			"AABox render did not capture the DX8Wrapper cull mode") &&
		expect(state->last_draw_render_state.z_enable == D3DZB_TRUE,
			"AABox render did not capture ZENABLE") &&
		expect(state->last_draw_render_state.z_write_enable == FALSE,
			"AABox render did not capture ZWRITEENABLE") &&
		expect(state->last_draw_render_state.z_func == D3DCMP_LESSEQUAL,
			"AABox render did not capture ZFUNC") &&
		expect(state->last_draw_render_state.alpha_blend_enable == TRUE,
			"AABox render did not capture ALPHABLENDENABLE") &&
		expect(state->last_draw_render_state.src_blend == D3DBLEND_SRCALPHA,
			"AABox render did not capture SRCBLEND") &&
		expect(state->last_draw_render_state.dest_blend == D3DBLEND_INVSRCALPHA,
			"AABox render did not capture DESTBLEND") &&
		expect(state->last_draw_render_state.blend_op == D3DBLENDOP_ADD,
			"AABox render did not capture BLENDOP") &&
		expect(state->last_draw_render_state.alpha_test_enable == FALSE,
			"AABox render did not capture ALPHATESTENABLE") &&
		expect(state->last_draw_render_state.alpha_func == D3DCMP_LESSEQUAL,
			"AABox render did not capture ALPHAFUNC") &&
		expect(state->last_draw_render_state.color_write_enable ==
				(D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
					D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA),
			"AABox render did not capture COLORWRITEENABLE");

	WW3D::Shutdown();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-dx8wrapper-render\","
		"\"createDevice\":%u,\"createTexture\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"drawIndexed\":%u,\"vertexBytes\":%u,"
		"\"indexBytes\":%u,\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"transformMask\":%u,\"clear\":%u,\"present\":%u}\n",
		state->create_device_calls,
		state->create_texture_calls,
		state->create_index_buffer_calls,
		state->create_vertex_buffer_calls,
		state->draw_indexed_primitive_calls,
		state->last_draw_vertex_buffer_bytes,
		state->last_draw_index_buffer_bytes,
		state->last_draw_vertex_buffer_id,
		state->last_draw_index_buffer_id,
		state->browser_buffer_create_calls,
		state->browser_buffer_update_calls,
		state->last_draw_transform_mask,
		state->clear_calls,
		state->present_calls);
	return 0;
}
