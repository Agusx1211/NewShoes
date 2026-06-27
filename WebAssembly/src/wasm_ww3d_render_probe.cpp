#include <cstddef>
#include <cstdio>
#include <cstring>
#include <string>

#include "PreRTS.h"

#include "Common/GlobalData.h"
#include "Common/GameMemory.h"
#include "GameClient/Image.h"
#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wkeyword-macro"
#endif
#define protected public
#include "W3DDevice/GameClient/W3DDisplay.h"
#undef protected
#if defined(__clang__)
#pragma clang diagnostic pop
#endif
#include "assetmgr.h"
#include "boxrobj.h"
#include "camera.h"
#include "coltype.h"
#include "rect.h"
#include "render2d.h"
#include "render2dsentence.h"
#include "rinfo.h"
#include "texture.h"
#include "wasm_d3d8_shim.h"
#include "ww3d.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_ww3d_aabox_probe_json;
std::string g_ww3d_render2d_probe_json;
std::string g_ww3d_display_drawimage_probe_json;
std::string g_ww3d_render2d_sentence_probe_json;

bool succeeded(int result)
{
	return result == WW3D_ERROR_OK;
}

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

void fill_argb_texture_red(D3DLOCKED_RECT &locked_rect, unsigned int width, unsigned int height)
{
	for (unsigned int y = 0; y < height; ++y) {
		unsigned char *row = static_cast<unsigned char *>(locked_rect.pBits) +
			static_cast<std::size_t>(locked_rect.Pitch) * y;
		for (unsigned int x = 0; x < width; ++x) {
			unsigned char *pixel = row + x * 4;
			pixel[0] = 0x00; // B
			pixel[1] = 0x00; // G
			pixel[2] = 0xff; // R
			pixel[3] = 0xff; // A
		}
	}
}

struct ProbeW3DDisplayStorage
{
	W3DDisplay *prepare_for_image_probe()
	{
		// Keep this as raw storage. Calling the W3DDisplay constructor retains
		// its full vtable/destructor surface and pulls display-string/font
		// singletons into this minimal probe. drawImage is called non-virtually
		// below and reads only the fields initialized in init_for_image_probe.
		std::memset(storage, 0, sizeof(storage));
		prepared = true;
		return as_display();
	}

	bool init_for_image_probe(unsigned int width, unsigned int height)
	{
		if (!prepared) {
			return false;
		}

		render = NEW Render2DClass;
		if (render == nullptr) {
			return false;
		}

		W3DDisplay *display = as_display();
		display->m_width = width;
		display->m_height = height;
		display->m_bitDepth = 32;
		display->m_windowed = TRUE;
		display->m_2DRender = render;
		display->m_isClippedEnabled = FALSE;
		display->m_clipRegion.lo.x = 0;
		display->m_clipRegion.lo.y = 0;
		display->m_clipRegion.hi.x = static_cast<Int>(width);
		display->m_clipRegion.hi.y = static_cast<Int>(height);
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f,
			static_cast<float>(width), static_cast<float>(height)));
		render->Set_Coordinate_Range(RectClass(0.0f, 0.0f,
			static_cast<float>(width), static_cast<float>(height)));
		return true;
	}

	void release_probe_renderer()
	{
		if (render != nullptr) {
			render->Reset();
			delete render;
			render = nullptr;
		}
		// The real W3DDisplay destructor tears down global display/device
		// singletons that this focused drawImage probe never initializes.
		as_display()->m_2DRender = nullptr;
	}

	W3DDisplay *as_display()
	{
		return reinterpret_cast<W3DDisplay *>(storage);
	}

	alignas(W3DDisplay) unsigned char storage[sizeof(W3DDisplay)] = {};
	Render2DClass *render = nullptr;
	bool prepared = false;
};

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_aabox()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool allocated = false;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		BoxRenderObjClass::Set_Box_Display_Mask(COLL_TYPE_ALL);
		WW3D::Set_Thumbnail_Enabled(false);

		CameraClass *camera = W3DNEW CameraClass();
		AABoxRenderObjClass *box = NEW_REF(AABoxRenderObjClass, ());
		allocated = camera != nullptr && box != nullptr;

		if (allocated) {
			box->Set_Local_Center_Extent(Vector3(0.0f, 0.0f, 0.0f), Vector3(1.0f, 2.0f, 3.0f));
			box->Set_Color(Vector3(0.1f, 0.85f, 0.3f));
			box->Set_Opacity(1.0f);

			RenderInfoClass render_info(*camera);
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				render_result = WW3D::Render(*box, render_info);
				end_render_result = WW3D::End_Render(false);
			}
		}

		if (box != nullptr) {
			box->Release_Ref();
		}
		if (camera != nullptr) {
			camera->Release_Ref();
		}
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		allocated &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_transform_calls >= 3 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 8 &&
		state->last_draw_primitive_count == 12 &&
		state->last_draw_vertex_buffer_bytes > 0 &&
		state->last_draw_index_buffer_bytes > 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u;

	char buffer[3200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_aabox_render_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"allocated\":%s},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"lastTransformState\":%d,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,\"minVertexIndex\":%u,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"vertexOffset\":%u,\"vertexBytes\":%u,"
		"\"vertexChecksum\":%lu,\"indexBufferId\":%u,\"indexOffset\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"alphaFunc\":%lu,\"alphaRef\":%lu,"
		"\"colorWriteEnable\":%lu}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(allocated),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		static_cast<int>(state != nullptr ? state->last_set_transform_state : D3DTS_FORCE_DWORD),
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_offset : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_offset : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.cull_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_write_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_blend_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.src_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.dest_blend : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.blend_op : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_test_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.alpha_ref : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.color_write_enable : 0));

	g_ww3d_aabox_probe_json = buffer;
	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}
	return g_ww3d_aabox_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_render2d_textured_quad()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int texture_width = 2;
	constexpr unsigned int texture_height = 2;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	bool texture_created = false;
	bool render2d_called = false;
	UINT texture_id = 0;

	TextureClass *texture = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		texture = NEW_REF(TextureClass, (
			texture_width,
			texture_height,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));
		texture_created = texture != nullptr && texture->Peek_D3D_Texture() != nullptr;
		texture_create_result = texture_created ? D3D_OK : E_FAIL;
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (texture_created) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			fill_argb_texture_red(locked_rect, texture_width, texture_height);
		}
		texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);
	}

	if (texture != nullptr) {
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f, 800.0f, 600.0f));

		{
			Render2DClass renderer(texture);
			renderer.Set_Coordinate_Range(RectClass(0.0f, 0.0f, 800.0f, 600.0f));
			renderer.Add_Quad(
				RectClass(300.0f, 220.0f, 500.0f, 380.0f),
				RectClass(0.0f, 0.0f, 1.0f, 1.0f),
				0xffffffffUL);

			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				renderer.Render();
				render2d_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}

		REF_PTR_RELEASE(texture);
	}

	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		SUCCEEDED(texture_create_result) &&
		SUCCEEDED(texture_lock_result) &&
		SUCCEEDED(texture_unlock_result) &&
		texture_created &&
		succeeded(begin_render_result) &&
		render2d_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 2 &&
		state->texture_lock_rect_calls >= 1 &&
		state->texture_unlock_rect_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 2 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 2 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_bytes >= 4 * 44 &&
		state->last_draw_index_buffer_bytes >= 6 * 2 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_render2d_textured_quad_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"textureCreated\":%s,"
		"\"beginRender\":%d,\"render2dCalled\":%s,\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"expectedCenter\":[255,0,0,255],\"lastBindStage\":%u,"
		"\"lastBindId\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,\"minVertexIndex\":%u,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"vertexOffset\":%u,\"vertexBytes\":%u,"
		"\"vertexChecksum\":%lu,\"indexBufferId\":%u,\"indexOffset\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"alphaFunc\":%lu,\"alphaRef\":%lu,"
		"\"colorWriteEnable\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"minFilter\":%lu,\"magFilter\":%lu,\"mipFilter\":%lu,"
		"\"addressU\":%lu,\"addressV\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_created),
		begin_render_result,
		bool_json(render2d_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture_width,
		texture_height,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_offset : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_offset : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->cull_mode) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->z_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->z_write_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->z_func) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_blend_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->src_blend) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->dest_blend) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->blend_op) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_test_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_func) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_ref) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->color_write_enable) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAOP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MINFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MAGFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_MIPFILTER]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ADDRESSU]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ADDRESSV]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_TEXCOORDINDEX]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_TEXCOORDINDEX]) : 0);

	g_ww3d_render2d_probe_json = buffer;
	return g_ww3d_render2d_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_render2d_sentence()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const WCHAR text[] = L"ZEROHOUR";
	const char *font_face = "Arial";
	constexpr int point_size = 28;
	constexpr unsigned long text_color = 0xffffffffUL;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool font_created = false;
	bool sentence_built = false;
	bool sentence_drawn = false;
	bool sentence_rendered = false;
	int refs_after_get = 0;
	int char_height = 0;
	float text_extent_x = 0.0f;
	float text_extent_y = 0.0f;
	float draw_left = 0.0f;
	float draw_top = 0.0f;
	float draw_right = 0.0f;
	float draw_bottom = 0.0f;

	WW3DAssetManager *asset_manager = nullptr;
	FontCharsClass *font = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		Render2DClass::Set_Screen_Resolution(RectClass(0.0f, 0.0f, 800.0f, 600.0f));

		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}
	}

	if (asset_manager != nullptr) {
		font = asset_manager->Get_FontChars(font_face, point_size, false);
		font_created = font != nullptr;
	}

	if (font != nullptr) {
		refs_after_get = font->Num_Refs();
		char_height = font->Get_Char_Height();

		{
			Render2DSentenceClass sentence;
			sentence.Set_Font(font);
			font->Release_Ref();
			font = nullptr;

			sentence.Set_Texture_Size_Hint(128);
			sentence.Set_Location(Vector2(300.0f, 260.0f));
			const Vector2 text_extent = sentence.Get_Text_Extents(text);
			text_extent_x = text_extent.X;
			text_extent_y = text_extent.Y;
			sentence.Build_Sentence(text, nullptr, nullptr);
			sentence_built = true;
			sentence.Draw_Sentence(text_color);
			sentence_drawn = true;

			const RectClass &draw_extents = sentence.Get_Draw_Extents();
			draw_left = draw_extents.Left;
			draw_top = draw_extents.Top;
			draw_right = draw_extents.Right;
			draw_bottom = draw_extents.Bottom;

			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				sentence.Render();
				sentence_rendered = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
	}

	if (font != nullptr) {
		font->Release_Ref();
		font = nullptr;
	}

	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}
	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		(asset_manager_created || used_existing_asset_manager) &&
		font_created &&
		refs_after_get >= 2 &&
		char_height > 0 &&
		text_extent_x > 0.0f &&
		text_extent_y > 0.0f &&
		draw_right > draw_left &&
		draw_bottom > draw_top &&
		sentence_built &&
		sentence_drawn &&
		succeeded(begin_render_result) &&
		sentence_rendered &&
		succeeded(end_render_result) &&
		state->copy_rects_calls >= 1 &&
		state->last_copy_rects_format == D3DFMT_A4R4G4B4 &&
		state->last_copy_rects_uploaded_texture_id != 0 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count >= 4 &&
		state->last_draw_primitive_count >= 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_bytes >= 4 * 44 &&
		state->last_draw_index_buffer_bytes >= 6 * 2 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_render2d_sentence_probe\","
		"\"ok\":%s,"
		"\"text\":\"ZEROHOUR\","
		"\"font\":{\"face\":\"%s\",\"pointSize\":%d,\"created\":%s,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
		"\"refsAfterGet\":%d,\"charHeight\":%d},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"sentenceBuilt\":%s,\"sentenceDrawn\":%s,\"beginRender\":%d,"
		"\"sentenceRendered\":%s,\"endRender\":%d},"
		"\"extents\":{\"text\":{\"x\":%.2f,\"y\":%.2f},"
		"\"draw\":{\"left\":%.2f,\"top\":%.2f,\"right\":%.2f,\"bottom\":%.2f}},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"copyRects\":%u,\"browserTextureCreate\":%u,"
		"\"browserTextureUpdate\":%u,\"browserTextureBind\":%u,"
		"\"browserTextureRelease\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u},"
		"\"copyRects\":{\"rectCount\":%u,\"width\":%u,\"height\":%u,"
		"\"format\":%u,\"uploadedTextureId\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"checksum\":%lu,\"lastBindStage\":%u,\"lastBindId\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"vertexBytes\":%u,\"indexBytes\":%u,"
		"\"indexFormat\":%d,\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu}]}}}",
		bool_json(ok),
		font_face,
		point_size,
		bool_json(font_created),
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		refs_after_get,
		char_height,
		init_result,
		set_device_result,
		bool_json(sentence_built),
		bool_json(sentence_drawn),
		begin_render_result,
		bool_json(sentence_rendered),
		end_render_result,
		static_cast<double>(text_extent_x),
		static_cast<double>(text_extent_y),
		static_cast<double>(draw_left),
		static_cast<double>(draw_top),
		static_cast<double>(draw_right),
		static_cast<double>(draw_bottom),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->copy_rects_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->last_copy_rects_rect_count : 0,
		state != nullptr ? state->last_copy_rects_width : 0,
		state != nullptr ? state->last_copy_rects_height : 0,
		static_cast<unsigned int>(state != nullptr ? state->last_copy_rects_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_copy_rects_uploaded_texture_id : 0,
		state != nullptr ? state->last_copy_rects_uploaded_texture_id : 0,
		static_cast<unsigned int>(D3DFMT_A4R4G4B4),
		state != nullptr ? state->last_browser_texture_width : 0,
		state != nullptr ? state->last_browser_texture_height : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_checksum : 0),
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->alpha_blend_enable) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->src_blend) : 0,
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->dest_blend) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAOP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAARG2]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0);

	g_ww3d_render2d_sentence_probe_json = buffer;
	return g_ww3d_render2d_sentence_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_drawimage()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	constexpr unsigned int texture_width = 2;
	constexpr unsigned int texture_height = 2;
	GlobalData global_data;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = &global_data;
	TheWritableGlobalData = &global_data;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	bool texture_created = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool image_allocated = false;
	bool image_configured = false;
	bool image_raw_texture = false;
	UnsignedInt image_status = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	Int image_width = 0;
	Int image_height = 0;
	bool drawimage_called = false;
	UINT texture_id = 0;

	TextureClass *texture = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		texture = NEW_REF(TextureClass, (
			texture_width,
			texture_height,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));
		texture_created = texture != nullptr && texture->Peek_D3D_Texture() != nullptr;
		texture_create_result = texture_created ? D3D_OK : E_FAIL;
		const WasmD3D8ShimState *state = wasm_d3d8_get_state();
		texture_id = state != nullptr ? state->last_browser_texture_id : 0;
	}

	if (texture_created) {
		D3DLOCKED_RECT locked_rect = {};
		texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
		if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
			fill_argb_texture_red(locked_rect, texture_width, texture_height);
		}
		texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);
	}

	if (texture_created && SUCCEEDED(texture_unlock_result)) {
		display = display_storage.prepare_for_image_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_image_probe(800, 600);

		Image *image = newInstance(Image);
		image_allocated = image != nullptr;
		if (image_allocated) {
			Region2D uv = {};
			uv.lo.x = 0.0f;
			uv.lo.y = 0.0f;
			uv.hi.x = 1.0f;
			uv.hi.y = 1.0f;
			ICoord2D image_size = {};
			image_size.x = 200;
			image_size.y = 160;
			image->setName(AsciiString("wasm-probe-display-drawimage"));
			image->setTextureWidth(texture_width);
			image->setTextureHeight(texture_height);
			image->setImageSize(&image_size);
			image->setUV(&uv);
			image->setRawTextureData(texture);
			image->setStatus(IMAGE_STATUS_RAW_TEXTURE);
			image_status = image->getStatus();
			image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
			const Region2D *image_uv = image->getUV();
			image_uv_lo_x = image_uv->lo.x;
			image_uv_lo_y = image_uv->lo.y;
			image_uv_hi_x = image_uv->hi.x;
			image_uv_hi_y = image_uv->hi.y;
			image_width = image->getImageWidth();
			image_height = image->getImageHeight();
			image_configured =
				image->getRawTextureData() == texture &&
				image_raw_texture &&
				image_uv_lo_x == 0.0f &&
				image_uv_lo_y == 0.0f &&
				image_uv_hi_x == 1.0f &&
				image_uv_hi_y == 1.0f &&
				image_width == 200 &&
				image_height == 160;
		}

		if (display_setup && image_configured) {
			begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				display->W3DDisplay::drawImage(image, 300, 220, 500, 380, 0xffffffffUL,
					Display::DRAW_IMAGE_ALPHA);
				drawimage_called = true;
				end_render_result = WW3D::End_Render(false);
			}
		}
		if (image != nullptr) {
			image->deleteInstance();
		}
	}

	display_storage.release_probe_renderer();
	REF_PTR_RELEASE(texture);

	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}

	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		SUCCEEDED(texture_create_result) &&
		SUCCEEDED(texture_lock_result) &&
		SUCCEEDED(texture_unlock_result) &&
		texture_created &&
		display_allocated &&
		display_setup &&
		image_configured &&
		succeeded(begin_render_result) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 2 &&
		state->texture_lock_rect_calls >= 1 &&
		state->texture_unlock_rect_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 2 &&
		state->browser_texture_release_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 2 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		draw_state->src_blend == D3DBLEND_SRCALPHA &&
		draw_state->dest_blend == D3DBLEND_INVSRCALPHA &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[5600];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_drawimage_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"textureCreate\":%ld,"
		"\"textureLock\":%ld,\"textureUnlock\":%ld,\"textureCreated\":%s,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,\"imageAllocated\":%s,"
		"\"imageConfigured\":%s,\"beginRender\":%d,\"drawImageCalled\":%s,"
		"\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"format\":%u,\"width\":%u,\"height\":%u,"
		"\"expectedCenter\":[255,0,0,255],\"lastBindStage\":%u,"
		"\"lastBindId\":%u},"
		"\"image\":{\"rawTexture\":%s,\"status\":%u,\"uvLoX\":%.3f,"
		"\"uvLoY\":%.3f,\"uvHiX\":%.3f,\"uvHiY\":%.3f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_created),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(image_allocated),
		bool_json(image_configured),
		begin_render_result,
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_texture_stage_state_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		texture_id,
		static_cast<unsigned int>(D3DFMT_A8R8G8B8),
		texture_width,
		texture_height,
		state != nullptr ? state->last_browser_texture_bind_stage : 0,
		state != nullptr ? state->last_browser_texture_bind_id : 0,
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		static_cast<double>(image_uv_lo_x),
		static_cast<double>(image_uv_lo_y),
		static_cast<double>(image_uv_hi_x),
		static_cast<double>(image_uv_hi_y),
		image_width,
		image_height,
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->alpha_blend_enable : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->src_blend : 0),
		static_cast<unsigned long>(draw_state != nullptr ? draw_state->dest_blend : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAOP] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG1] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_ALPHAARG2] : 0),
		static_cast<unsigned long>(stage0 != nullptr ? stage0->values[D3DTSS_TEXCOORDINDEX] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(stage1 != nullptr ? stage1->values[D3DTSS_TEXCOORDINDEX] : 0));

	g_ww3d_display_drawimage_probe_json = buffer;
	return g_ww3d_display_drawimage_probe_json.c_str();
}

}
