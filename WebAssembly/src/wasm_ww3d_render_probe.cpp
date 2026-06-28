#include <cstddef>
#include <cstdio>
#include <cctype>
#include <cstring>
#include <string>

#include "PreRTS.h"

#include "Common/GlobalData.h"
#include "Common/GameMemory.h"
#include "Common/UnicodeString.h"
#include "GameClient/GameFont.h"
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
#include "W3DDevice/GameClient/W3DDisplayString.h"
#include "W3DDevice/GameClient/W3DGameFont.h"
#include "assetmgr.h"
#include "boxrobj.h"
#include "camera.h"
#include "coltype.h"
#include "ddsfile.h"
#include "rect.h"
#include "render2d.h"
#include "render2dsentence.h"
#include "rinfo.h"
#include "scene.h"
#include "texture.h"
#include "wasm_browser_runtime_assets.h"
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
std::string g_ww3d_scene_camera_probe_json;
std::string g_ww3d_display_drawimage_probe_json;
std::string g_ww3d_display_drawimage_file_probe_json;
std::string g_ww3d_display_mapped_image_probe_json;
std::string g_ww3d_display_mapped_image_clip_probe_json;
std::string g_ww3d_display_mapped_image_unrotated_probe_json;
std::string g_ww3d_display_fillrect_probe_json;
std::string g_ww3d_display_openrect_probe_json;
std::string g_ww3d_render2d_sentence_probe_json;
std::string g_ww3d_display_string_probe_json;

constexpr const char *kDisplayDrawImageFileTextureName = "cine_moon.tga";
constexpr const char *kDisplayDrawImageFileTextureArchiveEntry = "art\\textures\\cine_moon.dds";
constexpr const char *kMappedImageProbeName = "WatermarkChina";
constexpr const char *kMappedImageProbeTextureName = "SCShellUserInterface512_001.tga";
constexpr const char *kMappedImageProbeTextureArchiveEntry =
	"Data\\English\\Art\\Textures\\SCShellUserInterface512_001.tga";
constexpr const char *kMappedImageProbeSampleIni =
	"Data\\INI\\MappedImages\\TextureSize_512\\SCShellUserInterface512.INI";
constexpr const char *kUnrotatedMappedImageProbeName = "SAChinook_L";
constexpr const char *kUnrotatedMappedImageProbeTextureName = "SAUserInterface512_001.tga";
constexpr const char *kUnrotatedMappedImageProbeTextureArchiveEntry =
	"Data\\English\\Art\\Textures\\SAUserInterface512_001.tga";
constexpr const char *kUnrotatedMappedImageProbeSampleIni =
	"Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI";
constexpr const char *kMappedImageTextureSource =
	"ImageCollection::load mapped-image filename path via W3DDisplay::drawImage, WW3DAssetManager, TextureClass::Init, and runtime W3DFileSystem BIG archives";
constexpr const char *kUnrotatedMappedImageTextureSource =
	"ImageCollection::load non-rotated mapped-image filename path via W3DDisplay::drawImage, WW3DAssetManager, TextureClass::Init, and runtime W3DFileSystem BIG archives";

struct MappedImageDrawProbeSpec
{
	const char *source_name;
	const char *image_name;
	const char *texture_name;
	const char *texture_archive_entry;
	const char *sample_ini;
	const char *texture_source;
	UnsignedInt expected_status;
	bool expected_rotated;
	Int expected_width;
	Int expected_height;
	UINT expected_vertex_count;
	Int draw_left;
	Int draw_top;
	Int draw_right;
	Int draw_bottom;
};

constexpr MappedImageDrawProbeSpec kMappedImageProbeSpec = {
	"ww3d_display_mapped_image_probe",
	kMappedImageProbeName,
	kMappedImageProbeTextureName,
	kMappedImageProbeTextureArchiveEntry,
	kMappedImageProbeSampleIni,
	kMappedImageTextureSource,
	IMAGE_STATUS_ROTATED_90_CLOCKWISE,
	true,
	160,
	96,
	6,
	320,
	252,
	480,
	348,
};

constexpr MappedImageDrawProbeSpec kUnrotatedMappedImageProbeSpec = {
	"ww3d_display_mapped_image_unrotated_probe",
	kUnrotatedMappedImageProbeName,
	kUnrotatedMappedImageProbeTextureName,
	kUnrotatedMappedImageProbeTextureArchiveEntry,
	kUnrotatedMappedImageProbeSampleIni,
	kUnrotatedMappedImageTextureSource,
	IMAGE_STATUS_NONE,
	false,
	120,
	96,
	4,
	340,
	252,
	460,
	348,
};

bool succeeded(int result)
{
	return result == WW3D_ERROR_OK;
}

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

std::string json_escape(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size());
	for (char ch : value) {
		switch (ch) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			case '\n':
				escaped += "\\n";
				break;
			case '\r':
				escaped += "\\r";
				break;
			case '\t':
				escaped += "\\t";
				break;
			default:
				escaped += ch;
				break;
		}
	}
	return escaped;
}

bool equals_ignore_ascii_case(const std::string &lhs, const std::string &rhs)
{
	if (lhs.size() != rhs.size()) {
		return false;
	}
	for (std::size_t index = 0; index < lhs.size(); ++index) {
		const unsigned char left = static_cast<unsigned char>(lhs[index]);
		const unsigned char right = static_cast<unsigned char>(rhs[index]);
		if (std::tolower(left) != std::tolower(right)) {
			return false;
		}
	}
	return true;
}

std::size_t count_mapped_images(ImageCollection &images)
{
	std::size_t count = 0;
	while (images.Enum(static_cast<unsigned>(count)) != nullptr) {
		++count;
	}
	return count;
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
	W3DDisplay *prepare_for_2d_probe()
	{
		// Keep this as raw storage. Calling the W3DDisplay constructor retains
		// its full vtable/destructor surface and pulls display-string/font
		// singletons into these minimal probes. 2D draw methods are called
		// non-virtually below and read only the fields initialized here.
		std::memset(storage, 0, sizeof(storage));
		prepared = true;
		return as_display();
	}

	bool init_for_2d_probe(unsigned int width, unsigned int height)
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_scene_camera()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool camera_created = false;
	bool scene_created = false;
	bool render_object_created = false;
	bool object_added = false;

	CameraClass *camera = nullptr;
	SimpleSceneClass *scene = nullptr;
	AABoxRenderObjClass *box = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		BoxRenderObjClass::Set_Box_Display_Mask(COLL_TYPE_ALL);

		camera = W3DNEW CameraClass();
		scene = NEW_REF(SimpleSceneClass, ());
		box = NEW_REF(AABoxRenderObjClass, ());
		camera_created = camera != nullptr;
		scene_created = scene != nullptr;
		render_object_created = box != nullptr;
	}

	if (camera_created && scene_created && render_object_created) {
		box->Set_Local_Center_Extent(Vector3(0.0f, 0.0f, 0.0f), Vector3(1.0f, 2.0f, 3.0f));
		box->Set_Color(Vector3(0.1f, 0.85f, 0.3f));
		box->Set_Opacity(1.0f);
		box->Set_Force_Visible(true);
		scene->Add_Render_Object(box);
		object_added = box->Peek_Scene() == scene;

		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(scene, camera);
			end_render_result = WW3D::End_Render(false);
		}
	}

	if (scene != nullptr && box != nullptr && object_added) {
		scene->Remove_Render_Object(box);
	}
	REF_PTR_RELEASE(box);
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(camera);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		camera_created &&
		scene_created &&
		render_object_created &&
		object_added &&
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
		(state->last_draw_transform_mask & 7u) == 7u;

	char buffer[3400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_scene_camera_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"cameraCreated\":%s,"
		"\"sceneCreated\":%s,\"renderObjectCreated\":%s,\"objectAdded\":%s},"
		"\"calls\":{\"createDevice\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"lastTransformState\":%d,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"clear\":%u,\"present\":%u},"
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
		bool_json(camera_created),
		bool_json(scene_created),
		bool_json(render_object_created),
		bool_json(object_added),
		state != nullptr ? state->create_device_calls : 0,
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

	g_ww3d_scene_camera_probe_json = buffer;
	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}
	return g_ww3d_scene_camera_probe_json.c_str();
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_string()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const char *text = "DISPLAY";
	const char *font_face = "Arial";
	constexpr int point_size = 28;
	constexpr int draw_x = 300;
	constexpr int draw_y = 260;
	constexpr int drop_x = 2;
	constexpr int drop_y = 2;
	const Color text_color = GameMakeColor(255, 255, 255, 255);
	const Color drop_color = GameMakeColor(48, 48, 48, 255);

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool used_existing_font_library = false;
	bool font_library_created = false;
	bool normal_font_loaded = false;
	bool bold_font_loaded = false;
	bool display_string_allocated = false;
	bool text_set = false;
	bool font_set = false;
	bool size_computed = false;
	bool draw_called = false;
	int text_length = 0;
	int normal_font_height = 0;
	int bold_font_height = 0;
	int display_width = 0;
	int display_height = 0;
	int display_width_via_chars = 0;

	WW3DAssetManager *asset_manager = nullptr;
	FontLibrary *old_font_library = TheFontLibrary;
	GameFont *normal_font = nullptr;
	GameFont *bold_font = nullptr;
	DisplayString *display_string = nullptr;

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

		used_existing_font_library = TheFontLibrary != nullptr;
		if (TheFontLibrary == nullptr) {
			TheFontLibrary = NEW W3DFontLibrary;
			font_library_created = TheFontLibrary != nullptr;
			if (TheFontLibrary != nullptr) {
				TheFontLibrary->init();
			}
		}
	}

	if (asset_manager != nullptr && TheFontLibrary != nullptr) {
		normal_font = TheFontLibrary->getFont(AsciiString(font_face), point_size, FALSE);
		bold_font = TheFontLibrary->getFont(AsciiString(font_face), point_size, TRUE);
		normal_font_loaded = normal_font != nullptr && normal_font->fontData != nullptr;
		bold_font_loaded = bold_font != nullptr && bold_font->fontData != nullptr;
		normal_font_height = normal_font_loaded ? normal_font->height : 0;
		bold_font_height = bold_font_loaded ? bold_font->height : 0;
	}

	if (normal_font_loaded && bold_font_loaded) {
		display_string = newInstance(W3DDisplayString);
		display_string_allocated = display_string != nullptr;
	}

	if (display_string != nullptr) {
		display_string->setFont(normal_font);
		font_set = display_string->getFont() == normal_font;

		UnicodeString display_text;
		display_text.translate(AsciiString(text));
		display_string->setText(display_text);
		text_set = display_string->getText().compare(display_text) == 0;
		text_length = display_string->getTextLength();
		display_string->getSize(&display_width, &display_height);
		display_width_via_chars = display_string->getWidth();
		size_computed = display_width > 0 && display_height > 0 && display_width_via_chars > 0;

		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display_string->draw(draw_x, draw_y, text_color, drop_color, drop_x, drop_y);
			draw_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	if (display_string != nullptr) {
		display_string->deleteInstance();
		display_string = nullptr;
	}

	if (font_library_created && TheFontLibrary != nullptr) {
		TheFontLibrary->reset();
		delete TheFontLibrary;
		TheFontLibrary = old_font_library;
	} else {
		TheFontLibrary = old_font_library;
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
		(font_library_created || used_existing_font_library) &&
		normal_font_loaded &&
		bold_font_loaded &&
		display_string_allocated &&
		font_set &&
		text_set &&
		text_length == 7 &&
		size_computed &&
		succeeded(begin_render_result) &&
		draw_called &&
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
		state->last_draw_vertex_count >= 8 &&
		state->last_draw_primitive_count >= 4 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_bytes >= 8 * 44 &&
		state->last_draw_index_buffer_bytes >= 12 * 2 &&
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

	char buffer[6200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_string_probe\","
		"\"ok\":%s,"
		"\"text\":\"%s\","
		"\"font\":{\"face\":\"%s\",\"pointSize\":%d,"
		"\"normalLoaded\":%s,\"boldLoaded\":%s,"
		"\"normalHeight\":%d,\"boldHeight\":%d,"
		"\"fontLibraryCreated\":%s,\"usedExistingFontLibrary\":%s,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayStringAllocated\":%s,\"fontSet\":%s,\"textSet\":%s,"
		"\"sizeComputed\":%s,\"beginRender\":%d,\"drawCalled\":%s,"
		"\"endRender\":%d},"
		"\"textMetrics\":{\"length\":%d,\"width\":%d,\"height\":%d,"
		"\"widthViaChars\":%d},"
		"\"drawRegion\":{\"left\":%d,\"top\":%d,\"right\":%d,\"bottom\":%d},"
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
		text,
		font_face,
		point_size,
		bool_json(normal_font_loaded),
		bool_json(bold_font_loaded),
		normal_font_height,
		bold_font_height,
		bool_json(font_library_created),
		bool_json(used_existing_font_library),
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		init_result,
		set_device_result,
		bool_json(display_string_allocated),
		bool_json(font_set),
		bool_json(text_set),
		bool_json(size_computed),
		begin_render_result,
		bool_json(draw_called),
		end_render_result,
		text_length,
		display_width,
		display_height,
		display_width_via_chars,
		draw_x,
		draw_y,
		draw_x + display_width + drop_x,
		draw_y + display_height + drop_y,
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

	g_ww3d_display_string_probe_json = buffer;
	return g_ww3d_display_string_probe_json.c_str();
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
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);

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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_drawimage_file(
	const char *texture_archive_path)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	GlobalData *probe_global_data = nullptr;
	GlobalData *old_global_data = nullptr;
	GlobalData *old_writable_global_data = nullptr;
	bool global_data_installed = false;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool texture_archive_loaded = false;
	bool texture_file_exists = false;
	bool texture_file_factory_installed = false;
	bool texture_dds_available = false;
	bool texture_preloaded = false;
	bool texture_registered = false;
	bool texture_resolved = false;
	bool texture_dds_loaded = false;
	bool texture_has_d3d_surface = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool image_allocated = false;
	bool image_configured = false;
	bool image_raw_texture = false;
	bool drawimage_called = false;
	UnsignedInt image_status = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	Int image_width = 0;
	Int image_height = 0;
	HRESULT texture_level_desc_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_width = 0;
	UINT texture_height = 0;
	UINT texture_levels = 0;
	UINT texture_uploaded_levels = 0;
	DWORD texture_format = D3DFMT_UNKNOWN;
	DWORD texture_upload_format = D3DFMT_UNKNOWN;
	UINT texture_upload_width = 0;
	UINT texture_upload_height = 0;
	UINT texture_upload_bytes = 0;
	DWORD texture_upload_checksum = 0;
	std::string image_filename;
	std::string loaded_texture_name;

	WW3DAssetManager *asset_manager = nullptr;
	Image *image = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}
	}

	if (asset_manager != nullptr) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_paths(texture_archive_path, nullptr);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kDisplayDrawImageFileTextureArchiveEntry);
		texture_archive_loaded = texture_file_exists;
		if (texture_file_exists) {
			DDSFileClass dds_file(kDisplayDrawImageFileTextureName, 0);
			texture_dds_available = dds_file.Is_Available();
		}
	}

	if (asset_manager != nullptr && texture_dds_available) {
		TextureClass *preloaded_texture =
			asset_manager->Get_Texture(kDisplayDrawImageFileTextureName, MIP_LEVELS_1);
		if (preloaded_texture != nullptr) {
			texture_registered =
				asset_manager->Texture_Hash().Get(kDisplayDrawImageFileTextureName) == preloaded_texture;
			preloaded_texture->Init();
			texture_preloaded = preloaded_texture->Is_Initialized();
			preloaded_texture->Release_Ref();
		}
	}

	if (asset_manager != nullptr && texture_dds_available) {
		probe_global_data = new GlobalData;
		old_global_data = TheGlobalData;
		old_writable_global_data = TheWritableGlobalData;
		TheGlobalData = probe_global_data;
		TheWritableGlobalData = probe_global_data;
		global_data_installed = true;
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);

		image = newInstance(Image);
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
			image->setName(AsciiString("wasm-probe-display-drawimage-file"));
			image->setFilename(AsciiString(kDisplayDrawImageFileTextureName));
			image->setTextureWidth(64);
			image->setTextureHeight(64);
			image->setImageSize(&image_size);
			image->setUV(&uv);
			image_status = image->getStatus();
			image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
			image_filename = image->getFilename().str() != nullptr ? image->getFilename().str() : "";
			const Region2D *image_uv = image->getUV();
			image_uv_lo_x = image_uv->lo.x;
			image_uv_lo_y = image_uv->lo.y;
			image_uv_hi_x = image_uv->hi.x;
			image_uv_hi_y = image_uv->hi.y;
			image_width = image->getImageWidth();
			image_height = image->getImageHeight();
			image_configured =
				image->getRawTextureData() == nullptr &&
				!image_raw_texture &&
				image_filename == kDisplayDrawImageFileTextureName &&
				image_uv_lo_x == 0.0f &&
				image_uv_lo_y == 0.0f &&
				image_uv_hi_x == 1.0f &&
				image_uv_hi_y == 1.0f &&
				image_width == 200 &&
				image_height == 160;
		}
	}

	if (display_setup && image_configured) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawImage(image, 300, 220, 500, 380, 0xffffffffUL,
				Display::DRAW_IMAGE_ALPHA);
			drawimage_called = true;
			const WasmD3D8ShimState *render_state = wasm_d3d8_get_state();
			texture_id = render_state != nullptr ? render_state->last_set_texture_id : 0;
			end_render_result = WW3D::End_Render(false);
		}
	}

	TextureClass *loaded_texture =
		display_storage.render != nullptr ? display_storage.render->Peek_Texture() : nullptr;
	if (loaded_texture != nullptr) {
		texture_resolved = true;
		if (loaded_texture->Get_Texture_Name() != nullptr) {
			loaded_texture_name = loaded_texture->Get_Texture_Name();
		}
		texture_registered =
			asset_manager != nullptr &&
			asset_manager->Texture_Hash().Get(kDisplayDrawImageFileTextureName) == loaded_texture;
		texture_dds_loaded = loaded_texture->Is_Initialized();
		IDirect3DTexture8 *d3d_texture = loaded_texture->Peek_D3D_Texture();
		texture_has_d3d_surface = d3d_texture != nullptr;
		if (d3d_texture != nullptr) {
			texture_uploaded_levels = d3d_texture->GetLevelCount();
			texture_levels = texture_uploaded_levels;
			D3DSURFACE_DESC texture_desc = {};
			texture_level_desc_result = d3d_texture->GetLevelDesc(0, &texture_desc);
			if (SUCCEEDED(texture_level_desc_result)) {
				texture_width = texture_desc.Width;
				texture_height = texture_desc.Height;
				texture_format = texture_desc.Format;
				texture_upload_format = texture_desc.Format;
				texture_upload_width = texture_desc.Width;
				texture_upload_height = texture_desc.Height;
			}
		}
	}

	if (image != nullptr) {
		image->deleteInstance();
		image = nullptr;
	}

	display_storage.release_probe_renderer();

	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}

	if (global_data_installed) {
		TheWritableGlobalData = old_writable_global_data;
		TheGlobalData = old_global_data;
	}
	delete probe_global_data;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	if (state != nullptr) {
		if (texture_id == 0) {
			texture_id = state->last_set_texture_id;
		}
		texture_upload_bytes = state->last_browser_texture_bytes;
		texture_upload_checksum = state->last_browser_texture_checksum;
	}
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
		runtime_asset_system_installed &&
		texture_archive_loaded &&
		texture_file_exists &&
		texture_file_factory_installed &&
		texture_dds_available &&
		texture_preloaded &&
		texture_registered &&
		texture_resolved &&
		texture_dds_loaded &&
		texture_has_d3d_surface &&
		display_allocated &&
		display_setup &&
		image_configured &&
		!image_raw_texture &&
		image_status == IMAGE_STATUS_NONE &&
		succeeded(begin_render_result) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		loaded_texture_name == kDisplayDrawImageFileTextureName &&
		texture_id != 0 &&
		(texture_format == D3DFMT_DXT1 ||
			texture_format == D3DFMT_DXT3 ||
			texture_format == D3DFMT_DXT5) &&
		texture_width > 0 &&
		texture_height > 0 &&
		texture_levels > 0 &&
		texture_uploaded_levels == texture_levels &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= texture_levels &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
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

	const std::string archive_json = json_escape(texture_archive_path != nullptr ? texture_archive_path : "");
	const std::string image_filename_json = json_escape(image_filename);
	const std::string texture_name_json = json_escape(loaded_texture_name);
	const std::string texture_entry_json = json_escape(kDisplayDrawImageFileTextureArchiveEntry);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();

	char buffer[10000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_drawimage_file_probe\","
		"\"ok\":%s,"
		"\"archives\":{\"texture\":\"%s\"},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureArchiveLoaded\":%s,\"textureFileExists\":%s,"
		"\"textureFileFactoryInstalled\":%s,\"textureDDSAvailable\":%s,"
		"\"texturePreloaded\":%s,"
		"\"textureRegistered\":%s,\"textureResolved\":%s,"
		"\"textureDDSLoaded\":%s,\"textureHasD3DSurface\":%s,"
		"\"textureLevelDesc\":%ld,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,\"imageAllocated\":%s,"
		"\"imageConfigured\":%s,\"beginRender\":%d,\"drawImageCalled\":%s,"
		"\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"name\":\"%s\","
		"\"archiveEntry\":\"%s\",\"width\":%u,\"height\":%u,"
		"\"levels\":%u,\"uploadedLevels\":%u,\"format\":%lu,\"uploadFormat\":%lu,"
		"\"lastUpload\":{\"width\":%u,\"height\":%u,\"bytes\":%u,"
		"\"checksum\":%lu},"
		"\"source\":\"W3DDisplay::drawImage filename path via Render2DClass::Set_Texture, WW3DAssetManager, TextureClass::Apply, and runtime W3DFileSystem BIG archive\"},"
		"\"runtimeAssets\":%s,"
		"\"image\":{\"filename\":\"%s\",\"rawTexture\":%s,\"status\":%u,"
		"\"uvLoX\":%.3f,\"uvLoY\":%.3f,\"uvHiX\":%.3f,\"uvHiY\":%.3f,"
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
		archive_json.c_str(),
		init_result,
		set_device_result,
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		bool_json(runtime_asset_system_installed),
		bool_json(texture_archive_loaded),
		bool_json(texture_file_exists),
		bool_json(texture_file_factory_installed),
		bool_json(texture_dds_available),
		bool_json(texture_preloaded),
		bool_json(texture_registered),
		bool_json(texture_resolved),
		bool_json(texture_dds_loaded),
		bool_json(texture_has_d3d_surface),
		static_cast<long>(texture_level_desc_result),
		bool_json(display_allocated),
		bool_json(display_setup),
		bool_json(image_allocated),
		bool_json(image_configured),
		begin_render_result,
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
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
		texture_name_json.c_str(),
		texture_entry_json.c_str(),
		texture_width,
		texture_height,
		texture_levels,
		texture_uploaded_levels,
		static_cast<unsigned long>(texture_format),
		static_cast<unsigned long>(texture_upload_format),
		texture_upload_width,
		texture_upload_height,
		texture_upload_bytes,
		static_cast<unsigned long>(texture_upload_checksum),
		runtime_assets_json.c_str(),
		image_filename_json.c_str(),
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

	g_ww3d_display_drawimage_file_probe_json = buffer;
	return g_ww3d_display_drawimage_file_probe_json.c_str();
}

const char *cnc_port_probe_ww3d_display_mapped_image_internal(
	const char *ini_archive_path,
	const char *texture_archive_path,
	const MappedImageDrawProbeSpec &spec,
	bool use_clip)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	ImageCollection *old_mapped_image_collection = TheMappedImageCollection;
	GlobalData *old_global_data = TheGlobalData;
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheGlobalData = nullptr;
	TheWritableGlobalData = nullptr;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool mapped_ini_exists = false;
	bool texture_archive_loaded = false;
	bool texture_file_exists = false;
	bool texture_file_factory_installed = false;
	bool mapped_collection_allocated = false;
	bool mapped_collection_loaded = false;
	bool mapped_image_found = false;
	bool mapped_image_rotated = false;
	bool image_raw_texture = false;
	bool texture_preloaded = false;
	bool texture_registered = false;
	bool texture_resolved = false;
	bool texture_loaded = false;
	bool texture_has_d3d_surface = false;
	bool display_allocated = false;
	bool display_setup = false;
	bool clip_region_set = false;
	bool clip_enabled_before_draw = false;
	bool clip_disabled_after_draw = false;
	bool drawimage_called = false;
	std::size_t mapped_image_count = 0;
	UnsignedInt image_status = 0;
	Int image_width = 0;
	Int image_height = 0;
	Int image_texture_width = 0;
	Int image_texture_height = 0;
	float image_uv_lo_x = 0.0f;
	float image_uv_lo_y = 0.0f;
	float image_uv_hi_x = 0.0f;
	float image_uv_hi_y = 0.0f;
	HRESULT texture_level_desc_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_width = 0;
	UINT texture_height = 0;
	UINT texture_levels = 0;
	UINT texture_uploaded_levels = 0;
	DWORD texture_format = D3DFMT_UNKNOWN;
	DWORD texture_upload_format = D3DFMT_UNKNOWN;
	UINT texture_upload_width = 0;
	UINT texture_upload_height = 0;
	UINT texture_upload_bytes = 0;
	DWORD texture_upload_checksum = 0;
	std::string image_filename;
	std::string loaded_texture_name;

	const Int draw_left = spec.draw_left;
	const Int draw_top = spec.draw_top;
	const Int draw_right = spec.draw_right;
	const Int draw_bottom = spec.draw_bottom;
	const Int clip_left = 360;
	const Int clip_top = 276;
	const Int clip_right = 440;
	const Int clip_bottom = 324;
	float expected_clipped_uv_left = 0.0f;
	float expected_clipped_uv_top = 0.0f;
	float expected_clipped_uv_right = 0.0f;
	float expected_clipped_uv_bottom = 0.0f;

	WW3DAssetManager *asset_manager = nullptr;
	ImageCollection *mapped_image_collection = nullptr;
	const Image *image = nullptr;
	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}
	}

	if (asset_manager != nullptr) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_paths(ini_archive_path, texture_archive_path);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		mapped_ini_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(spec.sample_ini);
		texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(spec.texture_archive_entry);
		texture_archive_loaded = texture_file_exists;
	}

	if (mapped_ini_exists && texture_file_exists) {
		mapped_image_collection = NEW ImageCollection;
		mapped_collection_allocated = mapped_image_collection != nullptr;
		if (mapped_collection_allocated) {
			TheMappedImageCollection = mapped_image_collection;
			mapped_image_collection->load(512);
			mapped_collection_loaded = true;
			mapped_image_count = count_mapped_images(*mapped_image_collection);
			image = mapped_image_collection->findImageByName(AsciiString(spec.image_name));
			mapped_image_found = image != nullptr;
			if (mapped_image_found) {
				image_status = image->getStatus();
				mapped_image_rotated = BitTest(image_status, IMAGE_STATUS_ROTATED_90_CLOCKWISE);
				image_raw_texture = BitTest(image_status, IMAGE_STATUS_RAW_TEXTURE);
				image_filename = image->getFilename().str() != nullptr ? image->getFilename().str() : "";
				const ICoord2D *texture_size = image->getTextureSize();
				image_texture_width = texture_size->x;
				image_texture_height = texture_size->y;
				const Region2D *image_uv = image->getUV();
				image_uv_lo_x = image_uv->lo.x;
				image_uv_lo_y = image_uv->lo.y;
				image_uv_hi_x = image_uv->hi.x;
				image_uv_hi_y = image_uv->hi.y;
				image_width = image->getImageWidth();
				image_height = image->getImageHeight();
				const float draw_width = static_cast<float>(draw_right - draw_left);
				const float draw_height = static_cast<float>(draw_bottom - draw_top);
				if (draw_width > 0.0f && draw_height > 0.0f) {
					const float uv_width = image_uv_hi_x - image_uv_lo_x;
					const float uv_height = image_uv_hi_y - image_uv_lo_y;
					const float clipped_left_percent =
						static_cast<float>(clip_left - draw_left) / draw_width;
					const float clipped_right_percent =
						static_cast<float>(clip_right - draw_left) / draw_width;
					const float clipped_top_percent =
						static_cast<float>(clip_top - draw_top) / draw_height;
					const float clipped_bottom_percent =
						static_cast<float>(clip_bottom - draw_top) / draw_height;
					expected_clipped_uv_top =
						image_uv_lo_y + (uv_height * clipped_left_percent);
					expected_clipped_uv_bottom =
						image_uv_lo_y + (uv_height * clipped_right_percent);
					expected_clipped_uv_right =
						image_uv_hi_x - (uv_width * clipped_top_percent);
					expected_clipped_uv_left =
						image_uv_hi_x - (uv_width * clipped_bottom_percent);
				}
			}
		}
	}

	if (asset_manager != nullptr && mapped_image_found && !image_filename.empty()) {
		TextureClass *preloaded_texture =
			asset_manager->Get_Texture(image_filename.c_str(), MIP_LEVELS_1);
		if (preloaded_texture != nullptr) {
			const char *registered_name = preloaded_texture->Get_Texture_Name();
			texture_registered =
				asset_manager->Texture_Hash().Get(image_filename.c_str()) == preloaded_texture ||
				(registered_name != nullptr &&
					asset_manager->Texture_Hash().Get(registered_name) == preloaded_texture);
			preloaded_texture->Init();
			texture_preloaded = preloaded_texture->Is_Initialized();
			preloaded_texture->Release_Ref();
		}
	}

	if (asset_manager != nullptr && texture_preloaded) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup && mapped_image_found) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			if (use_clip) {
				IRegion2D clip_region = {};
				clip_region.lo.x = clip_left;
				clip_region.lo.y = clip_top;
				clip_region.hi.x = clip_right;
				clip_region.hi.y = clip_bottom;
				display->W3DDisplay::setClipRegion(&clip_region);
				clip_region_set = true;
				clip_enabled_before_draw = display->W3DDisplay::isClippingEnabled();
			}
			display->W3DDisplay::drawImage(image, draw_left, draw_top, draw_right, draw_bottom, 0xffffffffUL,
				Display::DRAW_IMAGE_ALPHA);
			drawimage_called = true;
			if (use_clip) {
				display->W3DDisplay::enableClipping(FALSE);
				clip_disabled_after_draw = !display->W3DDisplay::isClippingEnabled();
			}
			const WasmD3D8ShimState *render_state = wasm_d3d8_get_state();
			texture_id = render_state != nullptr ? render_state->last_set_texture_id : 0;
			end_render_result = WW3D::End_Render(false);
		}
	}

	TextureClass *loaded_texture =
		display_storage.render != nullptr ? display_storage.render->Peek_Texture() : nullptr;
	if (loaded_texture != nullptr) {
		texture_resolved = true;
		if (loaded_texture->Get_Texture_Name() != nullptr) {
			loaded_texture_name = loaded_texture->Get_Texture_Name();
		}
		texture_registered =
			asset_manager != nullptr &&
			(asset_manager->Texture_Hash().Get(image_filename.c_str()) == loaded_texture ||
				asset_manager->Texture_Hash().Get(loaded_texture_name.c_str()) == loaded_texture);
		texture_loaded = loaded_texture->Is_Initialized();
		IDirect3DTexture8 *d3d_texture = loaded_texture->Peek_D3D_Texture();
		texture_has_d3d_surface = d3d_texture != nullptr;
		if (d3d_texture != nullptr) {
			texture_uploaded_levels = d3d_texture->GetLevelCount();
			texture_levels = texture_uploaded_levels;
			D3DSURFACE_DESC texture_desc = {};
			texture_level_desc_result = d3d_texture->GetLevelDesc(0, &texture_desc);
			if (SUCCEEDED(texture_level_desc_result)) {
				texture_width = texture_desc.Width;
				texture_height = texture_desc.Height;
				texture_format = texture_desc.Format;
				texture_upload_format = texture_desc.Format;
				texture_upload_width = texture_desc.Width;
				texture_upload_height = texture_desc.Height;
			}
		}
	}

	display_storage.release_probe_renderer();

	if (mapped_image_collection != nullptr) {
		delete mapped_image_collection;
		mapped_image_collection = nullptr;
	}
	TheMappedImageCollection = old_mapped_image_collection;
	TheWritableGlobalData = old_writable_global_data;
	TheGlobalData = old_global_data;

	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	if (state != nullptr) {
		if (texture_id == 0) {
			texture_id = state->last_set_texture_id;
		}
		texture_upload_bytes = state->last_browser_texture_bytes;
		texture_upload_checksum = state->last_browser_texture_checksum;
	}
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
		runtime_asset_system_installed &&
		mapped_ini_exists &&
		texture_archive_loaded &&
		texture_file_exists &&
		texture_file_factory_installed &&
		mapped_collection_allocated &&
		mapped_collection_loaded &&
		mapped_image_count == 1186 &&
		mapped_image_found &&
		mapped_image_rotated == spec.expected_rotated &&
		!image_raw_texture &&
		image_status == spec.expected_status &&
		image_filename == spec.texture_name &&
		image_texture_width == 512 &&
		image_texture_height == 512 &&
		image_width == spec.expected_width &&
		image_height == spec.expected_height &&
		texture_preloaded &&
		texture_registered &&
		texture_resolved &&
		texture_loaded &&
		texture_has_d3d_surface &&
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		(!use_clip || (clip_region_set && clip_enabled_before_draw && clip_disabled_after_draw)) &&
		drawimage_called &&
		succeeded(end_render_result) &&
		equals_ignore_ascii_case(loaded_texture_name, image_filename) &&
		texture_id != 0 &&
		texture_width == 512 &&
		texture_height == 512 &&
		texture_levels > 0 &&
		texture_uploaded_levels == texture_levels &&
		state->create_device_calls >= 1 &&
		state->create_texture_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= texture_levels &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == spec.expected_vertex_count &&
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

	const std::string ini_archive_json = json_escape(ini_archive_path != nullptr ? ini_archive_path : "");
	const std::string texture_archive_json =
		json_escape(texture_archive_path != nullptr ? texture_archive_path : "");
	const std::string image_filename_json = json_escape(image_filename);
	const std::string texture_name_json = json_escape(loaded_texture_name);
	const std::string texture_entry_json = json_escape(spec.texture_archive_entry);
	const std::string image_name_json = json_escape(spec.image_name);
	const std::string texture_source_json = json_escape(spec.texture_source);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();
	const char *source_name = use_clip ?
		"ww3d_display_mapped_image_clip_probe" :
		spec.source_name;

	char buffer[14000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\","
		"\"ok\":%s,"
		"\"archives\":{\"ini\":\"%s\",\"texture\":\"%s\"},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
		"\"runtimeAssetSystemInstalled\":%s,\"mappedIniExists\":%s,"
		"\"textureArchiveLoaded\":%s,\"textureFileExists\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"mappedCollectionAllocated\":%s,\"mappedCollectionLoaded\":%s,"
		"\"mappedImages\":%zu,\"mappedImageFound\":%s,"
		"\"mappedImageRotated\":%s,\"texturePreloaded\":%s,"
		"\"textureRegistered\":%s,\"textureResolved\":%s,"
		"\"textureLoaded\":%s,\"textureHasD3DSurface\":%s,"
		"\"textureLevelDesc\":%ld,\"displayAllocated\":%s,"
		"\"displaySetup\":%s,\"beginRender\":%d,"
		"\"clipRegionSet\":%s,\"clipEnabledBeforeDraw\":%s,"
		"\"clipDisabledAfterDraw\":%s,"
		"\"drawImageCalled\":%s,\"endRender\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setTextureStageState\":%u,\"setStreamSource\":%u,"
		"\"setIndices\":%u,\"drawIndexed\":%u,\"setTransform\":%u,"
		"\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"name\":\"%s\","
		"\"archiveEntry\":\"%s\",\"width\":%u,\"height\":%u,"
		"\"levels\":%u,\"uploadedLevels\":%u,\"format\":%lu,\"uploadFormat\":%lu,"
		"\"lastUpload\":{\"width\":%u,\"height\":%u,\"bytes\":%u,"
		"\"checksum\":%lu},"
		"\"source\":\"%s\"},"
		"\"runtimeAssets\":%s,"
		"\"image\":{\"name\":\"%s\",\"filename\":\"%s\",\"rawTexture\":%s,"
		"\"status\":%u,\"rotated\":%s,\"textureWidth\":%d,\"textureHeight\":%d,"
		"\"uvLoX\":%.6f,\"uvLoY\":%.6f,\"uvHiX\":%.6f,\"uvHiY\":%.6f,"
		"\"width\":%d,\"height\":%d},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"screenRect\":{\"left\":%d,\"top\":%d,\"right\":%d,\"bottom\":%d},"
		"\"clip\":{\"enabled\":%s,\"set\":%s,\"enabledBeforeDraw\":%s,"
		"\"disabledAfterDraw\":%s,"
		"\"rect\":{\"left\":%d,\"top\":%d,\"right\":%d,\"bottom\":%d},"
		"\"width\":%d,\"height\":%d,"
		"\"expectedRotatedUV\":{\"left\":%.6f,\"top\":%.6f,"
		"\"right\":%.6f,\"bottom\":%.6f}},"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,\"colorArg2\":%lu,"
		"\"alphaOp\":%lu,\"alphaArg1\":%lu,\"alphaArg2\":%lu,"
		"\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		source_name,
		bool_json(ok),
		ini_archive_json.c_str(),
		texture_archive_json.c_str(),
		init_result,
		set_device_result,
		bool_json(asset_manager_created),
		bool_json(used_existing_asset_manager),
		bool_json(runtime_asset_system_installed),
		bool_json(mapped_ini_exists),
		bool_json(texture_archive_loaded),
		bool_json(texture_file_exists),
		bool_json(texture_file_factory_installed),
		bool_json(mapped_collection_allocated),
		bool_json(mapped_collection_loaded),
		mapped_image_count,
		bool_json(mapped_image_found),
		bool_json(mapped_image_rotated),
		bool_json(texture_preloaded),
		bool_json(texture_registered),
		bool_json(texture_resolved),
		bool_json(texture_loaded),
		bool_json(texture_has_d3d_surface),
		static_cast<long>(texture_level_desc_result),
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(clip_region_set),
		bool_json(clip_enabled_before_draw),
		bool_json(clip_disabled_after_draw),
		bool_json(drawimage_called),
		end_render_result,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
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
		texture_name_json.c_str(),
		texture_entry_json.c_str(),
		texture_width,
		texture_height,
		texture_levels,
		texture_uploaded_levels,
		static_cast<unsigned long>(texture_format),
		static_cast<unsigned long>(texture_upload_format),
		texture_upload_width,
		texture_upload_height,
		texture_upload_bytes,
		static_cast<unsigned long>(texture_upload_checksum),
		texture_source_json.c_str(),
		runtime_assets_json.c_str(),
		image_name_json.c_str(),
		image_filename_json.c_str(),
		bool_json(image_raw_texture),
		static_cast<unsigned int>(image_status),
		bool_json(mapped_image_rotated),
		image_texture_width,
		image_texture_height,
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
		draw_left,
		draw_top,
		draw_right,
		draw_bottom,
		bool_json(use_clip),
		bool_json(clip_region_set),
		bool_json(clip_enabled_before_draw),
		bool_json(clip_disabled_after_draw),
		clip_left,
		clip_top,
		clip_right,
		clip_bottom,
		clip_right - clip_left,
		clip_bottom - clip_top,
		static_cast<double>(expected_clipped_uv_left),
		static_cast<double>(expected_clipped_uv_top),
		static_cast<double>(expected_clipped_uv_right),
		static_cast<double>(expected_clipped_uv_bottom),
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

	std::string *probe_json = &g_ww3d_display_mapped_image_probe_json;
	if (use_clip) {
		probe_json = &g_ww3d_display_mapped_image_clip_probe_json;
	} else if (&spec == &kUnrotatedMappedImageProbeSpec) {
		probe_json = &g_ww3d_display_mapped_image_unrotated_probe_json;
	}
	*probe_json = buffer;
	return probe_json->c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_mapped_image(
	const char *ini_archive_path,
	const char *texture_archive_path)
{
	return cnc_port_probe_ww3d_display_mapped_image_internal(
		ini_archive_path,
		texture_archive_path,
		kMappedImageProbeSpec,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_mapped_image_clip(
	const char *ini_archive_path,
	const char *texture_archive_path)
{
	return cnc_port_probe_ww3d_display_mapped_image_internal(
		ini_archive_path,
		texture_archive_path,
		kMappedImageProbeSpec,
		true);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_mapped_image_unrotated(
	const char *ini_archive_path,
	const char *texture_archive_path)
{
	return cnc_port_probe_ww3d_display_mapped_image_internal(
		ini_archive_path,
		texture_archive_path,
		kUnrotatedMappedImageProbeSpec,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_fillrect()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_fill_rect_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawFillRect(300, 220, 200, 160, 0xff00ff00UL);
			draw_fill_rect_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

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
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_fill_rect_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_fillrect_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawFillRectCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawFillRect\"},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedCenter\":[0,255,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_fill_rect_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
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

	g_ww3d_display_fillrect_probe_json = buffer;
	return g_ww3d_display_fillrect_probe_json.c_str();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_display_openrect()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool display_allocated = false;
	bool display_setup = false;
	bool draw_open_rect_called = false;

	ProbeW3DDisplayStorage display_storage;
	W3DDisplay *display = nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		display = display_storage.prepare_for_2d_probe();
		display_allocated = display != nullptr;
		display_setup = display_allocated && display_storage.init_for_2d_probe(800, 600);
	}

	if (display_setup) {
		begin_render_result = WW3D::Begin_Render(false, false, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			display->W3DDisplay::drawOpenRect(300, 220, 200, 160, 8.0f, 0xffffff00UL);
			draw_open_rect_called = true;
			end_render_result = WW3D::End_Render(false);
		}
	}

	display_storage.release_probe_renderer();

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
		display_allocated &&
		display_setup &&
		succeeded(begin_render_result) &&
		draw_open_rect_called &&
		succeeded(end_render_result) &&
		state->create_device_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 16 &&
		state->last_draw_primitive_count == 8 &&
		state->last_draw_stream_source_stride == 44 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		state->last_draw_index_format == D3DFMT_INDEX16 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		draw_state != nullptr &&
		draw_state->alpha_blend_enable == TRUE &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_SELECTARG2 &&
		stage0->values[D3DTSS_COLORARG2] == D3DTA_DIFFUSE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	char buffer[4700];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_display_openrect_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"displayAllocated\":%s,\"displaySetup\":%s,"
		"\"beginRender\":%d,\"drawOpenRectCalled\":%s,"
		"\"endRender\":%d},"
		"\"display\":{\"width\":%u,\"height\":%u,\"bitDepth\":%u,"
		"\"windowed\":%s,\"path\":\"W3DDisplay::drawOpenRect\","
		"\"rect\":{\"x\":300,\"y\":220,\"width\":200,\"height\":160},"
		"\"lineWidth\":8},"
		"\"calls\":{\"createDevice\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"browserBufferRelease\":%u,"
		"\"setTexture\":%u,\"setTextureStageState\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%d,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"indexFormat\":%d,\"transformMask\":%u,"
		"\"expectedBorder\":[255,255,0,255],"
		"\"expectedCenter\":[0,0,0,255],"
		"\"renderState\":{\"alphaBlendEnable\":%lu,"
		"\"srcBlend\":%lu,\"destBlend\":%lu,\"textureStages\":["
		"{\"stage\":0,\"colorOp\":%lu,\"colorArg1\":%lu,"
		"\"colorArg2\":%lu,\"alphaOp\":%lu,\"alphaArg1\":%lu,"
		"\"alphaArg2\":%lu,\"texCoordIndex\":%lu},"
		"{\"stage\":1,\"colorOp\":%lu,\"texCoordIndex\":%lu}]}}}",
		bool_json(ok),
		init_result,
		set_device_result,
		bool_json(display_allocated),
		bool_json(display_setup),
		begin_render_result,
		bool_json(draw_open_rect_called),
		end_render_result,
		display != nullptr ? display->m_width : 0,
		display != nullptr ? display->m_height : 0,
		display != nullptr ? display->m_bitDepth : 0,
		bool_json(display != nullptr && display->m_windowed == TRUE),
		state != nullptr ? state->create_device_calls : 0,
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

	g_ww3d_display_openrect_probe_json = buffer;
	return g_ww3d_display_openrect_probe_json.c_str();
}

}
