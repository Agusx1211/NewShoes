#include <cstddef>
#include <cstdio>
#include <string>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "assetmgr.h"
#include "boxrobj.h"
#include "camera.h"
#include "chunkio.h"
#include "coltype.h"
#include "light.h"
#include "lightenvironment.h"
#include "mesh.h"
#include "meshmdl.h"
#include "ramfile.h"
#include "rect.h"
#include "render2d.h"
#include "rinfo.h"
#include "texture.h"
#include "vertmaterial.h"
#include "w3d_file.h"
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
std::string g_ww3d_textured_mesh_probe_json;

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
			renderer.Add_Quad_Backfaced(
				Vector2(300.0f, 220.0f),
				Vector2(300.0f, 380.0f),
				Vector2(500.0f, 220.0f),
				Vector2(500.0f, 380.0f),
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

namespace {

// Name of the procedural texture the in-memory W3D mesh references.  The mesh
// loader resolves texture names through WW3DAssetManager::Get_Texture, so the
// probe registers a procedural red TextureClass under this (lower-cased) name
// before loading the mesh chunk stream.
constexpr const char *kProbeMeshTextureName = "probe_mesh_red.tga";
constexpr unsigned int kProbeMeshTextureWidth = 2;
constexpr unsigned int kProbeMeshTextureHeight = 2;

// Build a minimal, single-textured W3D mesh (a camera-facing quad of two
// triangles) into a RAM-backed chunk stream using the original ChunkSaveClass.
// The bytes match the on-disk W3D format that MeshClass::Load_W3D parses.
bool write_probe_mesh_w3d(FileClass &file)
{
	file.Open(static_cast<int>(FileClass::WRITE));

	ChunkSaveClass csave(&file);

	csave.Begin_Chunk(W3D_CHUNK_MESH);

	// --- Mesh header (W3D v4.2) ---
	W3dMeshHeader3Struct header;
	std::memset(&header, 0, sizeof(header));
	header.Version = W3D_CURRENT_MESH_VERSION;
	header.Attributes = W3D_MESH_FLAG_TWO_SIDED; // disable backface culling for the probe
	std::strncpy(header.MeshName, "probequad", W3D_NAME_LEN);
	header.NumTris = 2;
	header.NumVertices = 4;
	header.NumMaterials = 1;
	header.NumDamageStages = 0;
	header.SortLevel = SORT_LEVEL_NONE;
	header.VertexChannels =
		W3D_VERTEX_CHANNEL_LOCATION |
		W3D_VERTEX_CHANNEL_NORMAL |
		W3D_VERTEX_CHANNEL_TEXCOORD;
	header.FaceChannels = W3D_FACE_CHANNEL_FACE;
	header.Min = W3dVectorStruct{-1.5f, -1.2f, -5.0f};
	header.Max = W3dVectorStruct{1.5f, 1.2f, -5.0f};
	header.SphCenter = W3dVectorStruct{0.0f, 0.0f, -5.0f};
	header.SphRadius = 2.0f;

	csave.Begin_Chunk(W3D_CHUNK_MESH_HEADER3);
	csave.Write(&header, sizeof(header));
	csave.End_Chunk();

	// --- Vertices (camera at origin looking down -Z, so z = -5 is in front) ---
	const W3dVectorStruct vertices[4] = {
		W3dVectorStruct{-1.5f, -1.2f, -5.0f},
		W3dVectorStruct{1.5f, -1.2f, -5.0f},
		W3dVectorStruct{1.5f, 1.2f, -5.0f},
		W3dVectorStruct{-1.5f, 1.2f, -5.0f},
	};
	csave.Begin_Chunk(W3D_CHUNK_VERTICES);
	csave.Write(vertices, sizeof(vertices));
	csave.End_Chunk();

	// --- Vertex normals (pointing +Z toward the camera) ---
	const W3dVectorStruct normals[4] = {
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
	};
	csave.Begin_Chunk(W3D_CHUNK_VERTEX_NORMALS);
	csave.Write(normals, sizeof(normals));
	csave.End_Chunk();

	// --- Legacy texture coordinates (pass 0, stage 0) ---
	const W3dTexCoordStruct texcoords[4] = {
		W3dTexCoordStruct{0.0f, 1.0f},
		W3dTexCoordStruct{1.0f, 1.0f},
		W3dTexCoordStruct{1.0f, 0.0f},
		W3dTexCoordStruct{0.0f, 0.0f},
	};
	csave.Begin_Chunk(W3D_CHUNK_TEXCOORDS);
	csave.Write(texcoords, sizeof(texcoords));
	csave.End_Chunk();

	// --- Vertex colors (white). Gives the mesh a DCG diffuse-color array so the DX8
	// renderer selects the XYZNDUV1 vertex format (diffuse at offset 24, UV at 28) that
	// the browser draw bridge supports for stage-0 texture sampling. ---
	const W3dRGBStruct vertex_colors[4] = {
		W3dRGBStruct(255, 255, 255),
		W3dRGBStruct(255, 255, 255),
		W3dRGBStruct(255, 255, 255),
		W3dRGBStruct(255, 255, 255),
	};
	csave.Begin_Chunk(W3D_CHUNK_VERTEX_COLORS);
	csave.Write(vertex_colors, sizeof(vertex_colors));
	csave.End_Chunk();

	// --- Triangles (two tris winding the quad) ---
	W3dTriStruct tris[2];
	std::memset(tris, 0, sizeof(tris));
	tris[0].Vindex[0] = 0;
	tris[0].Vindex[1] = 1;
	tris[0].Vindex[2] = 2;
	tris[0].Attributes = 0;
	tris[0].Normal = W3dVectorStruct{0.0f, 0.0f, 1.0f};
	tris[0].Dist = -5.0f;
	tris[1].Vindex[0] = 0;
	tris[1].Vindex[1] = 2;
	tris[1].Vindex[2] = 3;
	tris[1].Attributes = 0;
	tris[1].Normal = W3dVectorStruct{0.0f, 0.0f, 1.0f};
	tris[1].Dist = -5.0f;
	csave.Begin_Chunk(W3D_CHUNK_TRIANGLES);
	csave.Write(tris, sizeof(tris));
	csave.End_Chunk();

	// --- Material info: one pass, one vertex material, one shader, one texture ---
	W3dMaterialInfoStruct matinfo;
	std::memset(&matinfo, 0, sizeof(matinfo));
	matinfo.PassCount = 1;
	matinfo.VertexMaterialCount = 1;
	matinfo.ShaderCount = 1;
	matinfo.TextureCount = 1;
	csave.Begin_Chunk(W3D_CHUNK_MATERIAL_INFO);
	csave.Write(&matinfo, sizeof(matinfo));
	csave.End_Chunk();

	// --- Shader: depth test + write, texturing enabled, modulate primary gradient ---
	W3dShaderStruct shader;
	W3d_Shader_Reset(&shader);
	W3d_Shader_Set_Depth_Compare(&shader, W3DSHADER_DEPTHCOMPARE_PASS_LEQUAL);
	W3d_Shader_Set_Depth_Mask(&shader, W3DSHADER_DEPTHMASK_WRITE_ENABLE);
	W3d_Shader_Set_Texturing(&shader, W3DSHADER_TEXTURING_ENABLE);
	W3d_Shader_Set_Pri_Gradient(&shader, W3DSHADER_PRIGRADIENT_MODULATE);
	csave.Begin_Chunk(W3D_CHUNK_SHADERS);
	csave.Write(&shader, sizeof(shader));
	csave.End_Chunk();

	// --- Vertex material (white diffuse, fully opaque) ---
	csave.Begin_Chunk(W3D_CHUNK_VERTEX_MATERIALS);
	csave.Begin_Chunk(W3D_CHUNK_VERTEX_MATERIAL);
	{
		const char *vmat_name = "probequad_vmat";
		csave.Begin_Chunk(W3D_CHUNK_VERTEX_MATERIAL_NAME);
		csave.Write(vmat_name, static_cast<unsigned int>(std::strlen(vmat_name) + 1));
		csave.End_Chunk();

		W3dVertexMaterialStruct vmat;
		W3d_Vertex_Material_Reset(&vmat);
		csave.Begin_Chunk(W3D_CHUNK_VERTEX_MATERIAL_INFO);
		csave.Write(&vmat, sizeof(vmat));
		csave.End_Chunk();
	}
	csave.End_Chunk(); // VERTEX_MATERIAL
	csave.End_Chunk(); // VERTEX_MATERIALS

	// --- Texture reference: resolves to the procedural red texture via the asset manager ---
	csave.Begin_Chunk(W3D_CHUNK_TEXTURES);
	csave.Begin_Chunk(W3D_CHUNK_TEXTURE);
	{
		csave.Begin_Chunk(W3D_CHUNK_TEXTURE_NAME);
		csave.Write(kProbeMeshTextureName,
			static_cast<unsigned int>(std::strlen(kProbeMeshTextureName) + 1));
		csave.End_Chunk();

		W3dTextureInfoStruct texinfo;
		std::memset(&texinfo, 0, sizeof(texinfo));
		texinfo.Attributes = W3DTEXTURE_NO_LOD | W3DTEXTURE_TYPE_COLORMAP;
		texinfo.FrameCount = 1;
		csave.Begin_Chunk(W3D_CHUNK_TEXTURE_INFO);
		csave.Write(&texinfo, sizeof(texinfo));
		csave.End_Chunk();
	}
	csave.End_Chunk(); // TEXTURE
	csave.End_Chunk(); // TEXTURES

	csave.End_Chunk(); // MESH

	file.Close();
	return true;
}

} // namespace

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_textured_mesh()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool mesh_loaded = false;
	bool texture_registered = false;
	bool mesh_written = false;
	HRESULT texture_create_result = E_FAIL;
	HRESULT texture_lock_result = E_FAIL;
	HRESULT texture_unlock_result = E_FAIL;
	UINT texture_id = 0;
	int load_result = WW3D_ERROR_GENERIC;

	WW3DAssetManager *asset_manager = nullptr;
	TextureClass *texture = nullptr;
	MeshClass *mesh = nullptr;
	CameraClass *camera = nullptr;

	if (succeeded(init_result)) {
		asset_manager = W3DNEW WW3DAssetManager();
	}

	if (asset_manager != nullptr) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);

		// Procedural solid-red texture that the mesh's texture stage will sample.
		texture = NEW_REF(TextureClass, (
			kProbeMeshTextureWidth,
			kProbeMeshTextureHeight,
			WW3D_FORMAT_A8R8G8B8,
			MIP_LEVELS_1));

		if (texture != nullptr && texture->Peek_D3D_Texture() != nullptr) {
			texture->Set_Texture_Name(kProbeMeshTextureName);
			texture_create_result = D3D_OK;

			D3DLOCKED_RECT locked_rect = {};
			texture_lock_result = texture->Peek_D3D_Texture()->LockRect(0, &locked_rect, nullptr, 0);
			if (SUCCEEDED(texture_lock_result) && locked_rect.pBits != nullptr) {
				fill_argb_texture_red(locked_rect, kProbeMeshTextureWidth, kProbeMeshTextureHeight);
			}
			texture_unlock_result = texture->Peek_D3D_Texture()->UnlockRect(0);

			// Register the procedural texture under the name the mesh references so
			// the original WW3DAssetManager::Get_Texture path returns it as-is.
			texture->Add_Ref(); // ref owned by the asset-manager hash table
			asset_manager->Texture_Hash().Insert(kProbeMeshTextureName, texture);
			texture_registered = asset_manager->Texture_Hash().Get(kProbeMeshTextureName) == texture;

			const WasmD3D8ShimState *state = wasm_d3d8_get_state();
			texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		}
	}

	if (texture_registered) {
		// Build the in-memory W3D mesh chunk stream.
		RAMFileClass file(nullptr, 4096);
		mesh_written = write_probe_mesh_w3d(file);

		if (mesh_written) {
			file.Open(static_cast<int>(FileClass::READ));
			ChunkLoadClass cload(&file);

			if (cload.Open_Chunk() && cload.Cur_Chunk_ID() == W3D_CHUNK_MESH) {
				mesh = NEW_REF(MeshClass, ());
				load_result = mesh->Load_W3D(cload);
				mesh_loaded = succeeded(load_result);
				cload.Close_Chunk();
			}
			file.Close();

			// The W3D loader's single-material early-return (NumMaterials == 1) leaves the
			// mesh model's single shader/texture/material uninstalled, so install them
			// through the original public MeshModelClass::Set_Single_* API before render.
			// This binds the procedural texture and a texturing-enabled shader so the
			// browser draw bridge samples stage 0.
			if (mesh_loaded) {
				MeshModelClass *model = mesh->Peek_Model();
				model->Set_Single_Texture(texture, 0, 0);

				ShaderClass shader;
				shader.Set_Cull_Mode(ShaderClass::CULL_MODE_DISABLE);
				shader.Set_Depth_Compare(ShaderClass::PASS_LEQUAL);
				shader.Set_Depth_Mask(ShaderClass::DEPTH_WRITE_ENABLE);
				shader.Set_Texturing(ShaderClass::TEXTURING_ENABLE);
				shader.Set_Primary_Gradient(ShaderClass::GRADIENT_MODULATE);
				model->Set_Single_Shader(shader);

				VertexMaterialClass *vmat = NEW_REF(VertexMaterialClass, ());
				model->Set_Single_Material(vmat, 0);
				vmat->Release_Ref();
			}
		}
	}

	if (mesh_loaded) {
		camera = W3DNEW CameraClass();
		camera->Set_Aspect_Ratio(800.0f / 600.0f);

		// Full-bright lighting so the textured quad is not darkened by the mesh
		// vertex-lighting pass; texture (red) * diffuse (white) == red.
		LightEnvironmentClass light_env;
		light_env.Reset(Vector3(0.0f, 0.0f, -5.0f), Vector3(1.0f, 1.0f, 1.0f));

		LightClass *light = W3DNEW LightClass(LightClass::DIRECTIONAL);
		light->Set_Ambient(Vector3(1.0f, 1.0f, 1.0f));
		light->Set_Diffuse(Vector3(1.0f, 1.0f, 1.0f));
		light_env.Add_Light(*light);
		light_env.Pre_Render_Update(camera->Get_Transform());

		RenderInfoClass render_info(*camera);
		render_info.light_environment = &light_env;

		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(*mesh, render_info);
			end_render_result = WW3D::End_Render(false);
		}

		light->Release_Ref();
	}

	REF_PTR_RELEASE(camera);
	REF_PTR_RELEASE(mesh);

	if (texture != nullptr) {
		// Release the probe's local ref; the asset-manager hash ref follows below.
		texture->Release_Ref();
		texture = nullptr;
	}

	if (asset_manager != nullptr) {
		delete asset_manager; // releases textures held by the hash table
		asset_manager = nullptr;
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
		asset_manager == nullptr && // created and torn down within the probe
		texture_registered &&
		mesh_written &&
		mesh_loaded &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		texture_id != 0 &&
		state->create_device_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->set_texture_calls >= 1 &&
		state->browser_texture_bind_calls >= 1 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->set_transform_calls >= 3 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4800];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_textured_mesh_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"textureCreate\":%ld,\"textureLock\":%ld,\"textureUnlock\":%ld,"
		"\"textureRegistered\":%s,\"meshWritten\":%s,\"meshLoad\":%d,"
		"\"meshLoaded\":%s,\"beginRender\":%d,\"render\":%d,\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"name\":\"%s\","
		"\"width\":%u,\"height\":%u,\"expectedCenter\":[255,0,0,255]},"
		"\"draw\":{\"primitiveType\":%d,\"startVertex\":%u,"
		"\"minVertexIndex\":%u,\"vertexCount\":%u,\"primitiveCount\":%u,"
		"\"vertexStride\":%u,\"vertexBufferId\":%u,\"vertexOffset\":%u,"
		"\"vertexBytes\":%u,\"vertexChecksum\":%lu,"
		"\"indexBufferId\":%u,\"indexOffset\":%u,\"indexBytes\":%u,"
		"\"indexChecksum\":%lu,\"indexFormat\":%d,\"transformMask\":%u},"
		"\"renderState\":{\"cullMode\":%lu,\"zEnable\":%lu,"
		"\"zWriteEnable\":%lu,\"zFunc\":%lu,\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"blendOp\":%lu,"
		"\"alphaTestEnable\":%lu,\"colorWriteEnable\":%lu,"
		"\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}",
		bool_json(ok),
		init_result,
		set_device_result,
		static_cast<long>(texture_create_result),
		static_cast<long>(texture_lock_result),
		static_cast<long>(texture_unlock_result),
		bool_json(texture_registered),
		bool_json(mesh_written),
		load_result,
		bool_json(mesh_loaded),
		begin_render_result,
		render_result,
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
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
		kProbeMeshTextureName,
		kProbeMeshTextureWidth,
		kProbeMeshTextureHeight,
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
		draw_state != nullptr ? static_cast<unsigned long>(draw_state->color_write_enable) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLOROP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG1]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_COLORARG2]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_ALPHAOP]) : 0,
		stage0 != nullptr ? static_cast<unsigned long>(stage0->values[D3DTSS_TEXCOORDINDEX]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_COLOROP]) : 0,
		stage1 != nullptr ? static_cast<unsigned long>(stage1->values[D3DTSS_TEXCOORDINDEX]) : 0);

	g_ww3d_textured_mesh_probe_json = buffer;
	return g_ww3d_textured_mesh_probe_json.c_str();
}

}
