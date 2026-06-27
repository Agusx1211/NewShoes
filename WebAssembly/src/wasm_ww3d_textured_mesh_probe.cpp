#include <algorithm>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "assetmgr.h"
#include "camera.h"
#include "chunkio.h"
#include "ddsfile.h"
#include "ffactory.h"
#include "formconv.h"
#include "light.h"
#include "lightenvironment.h"
#include "mesh.h"
#include "meshmdl.h"
#include "ramfile.h"
#include "rinfo.h"
#include "texture.h"
#include "vertmaterial.h"
#include "w3d_file.h"
#include "wasm_d3d8_shim.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "W3DDevice/GameClient/W3DFileSystem.h"
#include "ww3d.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_ww3d_textured_mesh_probe_json;
std::string g_ww3d_shipped_mesh_probe_json;

constexpr const char *kProbeMeshTextureName = "probe_mesh_red.tga";
constexpr unsigned int kProbeMeshTextureWidth = 2;
constexpr unsigned int kProbeMeshTextureHeight = 2;
constexpr const char *kShippedMeshPath = "art\\w3d\\cine_moon.w3d";
constexpr const char *kShippedMeshName = "CINE_MOON";
constexpr const char *kShippedMeshTextureName = "cine_moon.tga";
constexpr const char *kShippedMeshTextureArchiveEntry = "art\\textures\\cine_moon.dds";

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

std::string json_escape(const std::string &value)
{
	std::string escaped;
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

void split_archive_path(const char *archive_path, AsciiString &directory, AsciiString &file_mask)
{
	std::string normalized = archive_path != nullptr ? archive_path : "";
	std::replace(normalized.begin(), normalized.end(), '\\', '/');

	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory = "";
		file_mask = normalized.c_str();
		return;
	}

	directory = normalized.substr(0, slash + 1).c_str();
	file_mask = normalized.substr(slash + 1).c_str();
}

bool read_game_file(const char *path, std::vector<unsigned char> &data)
{
	if (TheFileSystem == nullptr) {
		return false;
	}

	File *file = TheFileSystem->openFile(path, File::READ | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	const int size = file->size();
	if (size <= 0) {
		file->close();
		return false;
	}

	data.assign(static_cast<std::size_t>(size), 0);
	const int bytes_read = file->read(data.data(), size);
	file->close();

	if (bytes_read != size) {
		data.clear();
		return false;
	}

	return true;
}

bool load_first_mesh_chunk(const std::vector<unsigned char> &data, MeshClass *mesh, int &load_result)
{
	RAMFileClass file(
		const_cast<unsigned char *>(data.data()),
		static_cast<int>(data.size()));
	if (!file.Open(static_cast<int>(FileClass::READ))) {
		return false;
	}

	bool found_mesh_chunk = false;
	ChunkLoadClass cload(&file);
	while (cload.Open_Chunk()) {
		if (cload.Cur_Chunk_ID() == W3D_CHUNK_MESH) {
			found_mesh_chunk = true;
			load_result = mesh->Load_W3D(cload);
			cload.Close_Chunk();
			break;
		}
		cload.Close_Chunk();
	}

	file.Close();
	return found_mesh_chunk;
}

float max3(float x, float y, float z)
{
	return std::max(x, std::max(y, z));
}

void frame_mesh_in_front_of_camera(MeshClass &mesh, const AABoxClass &object_box)
{
	const float max_extent = max3(object_box.Extent.X, object_box.Extent.Y, object_box.Extent.Z);
	const float scale = max_extent > 0.0001f ? 1.2f / max_extent : 1.0f;
	Matrix3D transform(true);
	transform[0][0] = scale;
	transform[1][1] = scale;
	transform[2][2] = scale;
	transform.Set_Translation(Vector3(
		-object_box.Center.X * scale,
		-object_box.Center.Y * scale,
		-5.0f - object_box.Center.Z * scale));
	mesh.Set_Transform(transform);
}

bool write_probe_mesh_w3d(FileClass &file)
{
	file.Open(static_cast<int>(FileClass::WRITE));

	ChunkSaveClass csave(&file);

	csave.Begin_Chunk(W3D_CHUNK_MESH);

	W3dMeshHeader3Struct header;
	std::memset(&header, 0, sizeof(header));
	header.Version = W3D_CURRENT_MESH_VERSION;
	header.Attributes = W3D_MESH_FLAG_TWO_SIDED;
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

	const W3dVectorStruct vertices[4] = {
		W3dVectorStruct{-1.5f, -1.2f, -5.0f},
		W3dVectorStruct{1.5f, -1.2f, -5.0f},
		W3dVectorStruct{1.5f, 1.2f, -5.0f},
		W3dVectorStruct{-1.5f, 1.2f, -5.0f},
	};
	csave.Begin_Chunk(W3D_CHUNK_VERTICES);
	csave.Write(vertices, sizeof(vertices));
	csave.End_Chunk();

	const W3dVectorStruct normals[4] = {
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
		W3dVectorStruct{0.0f, 0.0f, 1.0f},
	};
	csave.Begin_Chunk(W3D_CHUNK_VERTEX_NORMALS);
	csave.Write(normals, sizeof(normals));
	csave.End_Chunk();

	const W3dTexCoordStruct texcoords[4] = {
		W3dTexCoordStruct{0.0f, 1.0f},
		W3dTexCoordStruct{1.0f, 1.0f},
		W3dTexCoordStruct{1.0f, 0.0f},
		W3dTexCoordStruct{0.0f, 0.0f},
	};
	csave.Begin_Chunk(W3D_CHUNK_TEXCOORDS);
	csave.Write(texcoords, sizeof(texcoords));
	csave.End_Chunk();

	// Force the mesh renderer onto the XYZNDUV1 vertex layout the browser
	// bridge currently samples: diffuse at byte 24, UV at byte 28.
	const W3dRGBStruct vertex_colors[4] = {
		W3dRGBStruct(255, 255, 255),
		W3dRGBStruct(255, 255, 255),
		W3dRGBStruct(255, 255, 255),
		W3dRGBStruct(255, 255, 255),
	};
	csave.Begin_Chunk(W3D_CHUNK_VERTEX_COLORS);
	csave.Write(vertex_colors, sizeof(vertex_colors));
	csave.End_Chunk();

	W3dTriStruct tris[2];
	std::memset(tris, 0, sizeof(tris));
	tris[0].Vindex[0] = 0;
	tris[0].Vindex[1] = 1;
	tris[0].Vindex[2] = 2;
	tris[0].Normal = W3dVectorStruct{0.0f, 0.0f, 1.0f};
	tris[0].Dist = -5.0f;
	tris[1].Vindex[0] = 0;
	tris[1].Vindex[1] = 2;
	tris[1].Vindex[2] = 3;
	tris[1].Normal = W3dVectorStruct{0.0f, 0.0f, 1.0f};
	tris[1].Dist = -5.0f;
	csave.Begin_Chunk(W3D_CHUNK_TRIANGLES);
	csave.Write(tris, sizeof(tris));
	csave.End_Chunk();

	W3dMaterialInfoStruct matinfo;
	std::memset(&matinfo, 0, sizeof(matinfo));
	matinfo.PassCount = 1;
	matinfo.VertexMaterialCount = 1;
	matinfo.ShaderCount = 1;
	matinfo.TextureCount = 1;
	csave.Begin_Chunk(W3D_CHUNK_MATERIAL_INFO);
	csave.Write(&matinfo, sizeof(matinfo));
	csave.End_Chunk();

	W3dShaderStruct shader;
	W3d_Shader_Reset(&shader);
	W3d_Shader_Set_Depth_Compare(&shader, W3DSHADER_DEPTHCOMPARE_PASS_LEQUAL);
	W3d_Shader_Set_Depth_Mask(&shader, W3DSHADER_DEPTHMASK_WRITE_ENABLE);
	W3d_Shader_Set_Texturing(&shader, W3DSHADER_TEXTURING_ENABLE);
	W3d_Shader_Set_Pri_Gradient(&shader, W3DSHADER_PRIGRADIENT_MODULATE);
	csave.Begin_Chunk(W3D_CHUNK_SHADERS);
	csave.Write(&shader, sizeof(shader));
	csave.End_Chunk();

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
	csave.End_Chunk();
	csave.End_Chunk();

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
	csave.End_Chunk();
	csave.End_Chunk();

	csave.End_Chunk();

	file.Close();
	return true;
}

} // namespace

extern "C" {

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

			texture->Add_Ref();
			asset_manager->Texture_Hash().Insert(kProbeMeshTextureName, texture);
			texture_registered = asset_manager->Texture_Hash().Get(kProbeMeshTextureName) == texture;

			const WasmD3D8ShimState *state = wasm_d3d8_get_state();
			texture_id = state != nullptr ? state->last_browser_texture_id : 0;
		}
	}

	if (texture_registered) {
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
			const WasmD3D8ShimState *render_state = wasm_d3d8_get_state();
			texture_id = render_state != nullptr ? render_state->last_set_texture_id : 0;
			end_render_result = WW3D::End_Render(false);
		}

		light->Release_Ref();
	}

	REF_PTR_RELEASE(camera);
	REF_PTR_RELEASE(mesh);

	if (texture != nullptr) {
		texture->Release_Ref();
		texture = nullptr;
	}

	if (asset_manager != nullptr) {
		delete asset_manager;
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
		asset_manager == nullptr &&
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_shipped_mesh(
	const char *archive_path,
	const char *texture_archive_path)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	int load_result = WW3D_ERROR_GENERIC;
	bool mesh_archive_loaded = false;
	bool texture_archive_loaded = false;
	bool file_read = false;
	bool texture_file_exists = false;
	bool texture_registered = false;
	bool texture_dds_available = false;
	bool texture_dds_loaded = false;
	bool texture_resolved = false;
	bool texture_has_d3d_surface = false;
	bool texture_file_factory_installed = false;
	bool texture_simple_factory_path_set = false;
	bool mesh_chunk_found = false;
	bool mesh_loaded = false;
	HRESULT texture_level_desc_result = E_FAIL;
	UINT texture_id = 0;
	UINT texture_width = 0;
	UINT texture_height = 0;
	UINT texture_levels = 0;
	DWORD texture_format = D3DFMT_UNKNOWN;
	DWORD texture_upload_format = D3DFMT_UNKNOWN;
	UINT texture_upload_width = 0;
	UINT texture_upload_height = 0;
	UINT texture_upload_bytes = 0;
	DWORD texture_upload_checksum = 0;
	UINT texture_uploaded_levels = 0;
	std::vector<unsigned char> mesh_data;
	std::string mesh_name;
	std::string loaded_texture_name;
	AsciiString mesh_archive_directory;
	AsciiString mesh_archive_mask;
	AsciiString texture_archive_directory;
	AsciiString texture_archive_mask;
	int vertices = 0;
	int polygons = 0;
	AABoxClass object_box(Vector3(0.0f, 0.0f, 0.0f), Vector3(0.0f, 0.0f, 0.0f));

	WW3DAssetManager *asset_manager = nullptr;
	MeshClass *mesh = nullptr;
	CameraClass *camera = nullptr;
	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	FileFactoryClass *old_file_factory = _TheFileFactory;
	W3DFileSystem *old_w3d_file_system = TheW3DFileSystem;
	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	NameKeyGenerator name_key_generator;
	W3DFileSystem *w3d_file_system = nullptr;

	split_archive_path(archive_path, mesh_archive_directory, mesh_archive_mask);
	split_archive_path(texture_archive_path, texture_archive_directory, texture_archive_mask);

	if (succeeded(init_result)) {
		asset_manager = W3DNEW WW3DAssetManager();
	}

	if (asset_manager != nullptr) {
		set_device_result = WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;
		TheNameKeyGenerator = &name_key_generator;
		name_key_generator.init();
		file_system.init();
		if (mesh_archive_mask.isNotEmpty()) {
			mesh_archive_loaded =
				archive_file_system.loadBigFilesFromDirectory(mesh_archive_directory, mesh_archive_mask);
		}
		if (texture_archive_mask.isNotEmpty()) {
			texture_archive_loaded =
				archive_file_system.loadBigFilesFromDirectory(texture_archive_directory, texture_archive_mask);
		}
		texture_file_exists =
			texture_archive_loaded &&
			file_system.doesFileExist(kShippedMeshTextureArchiveEntry);
		TheW3DFileSystem = new W3DFileSystem;
		w3d_file_system = TheW3DFileSystem;
		texture_file_factory_installed =
			w3d_file_system != nullptr &&
			_TheFileFactory == w3d_file_system;
		if (texture_file_exists) {
			DDSFileClass dds_file(kShippedMeshTextureName, 0);
			texture_dds_available = dds_file.Is_Available();
		}
		if (mesh_archive_loaded) {
			file_read = read_game_file(kShippedMeshPath, mesh_data);
		}
	}

	if (file_read) {
		mesh = NEW_REF(MeshClass, ());
		if (mesh != nullptr) {
			mesh_chunk_found = load_first_mesh_chunk(mesh_data, mesh, load_result);
			mesh_loaded = mesh_chunk_found && succeeded(load_result);
		}
	}

	if (mesh_loaded && mesh->Peek_Model() != nullptr) {
		MeshModelClass *model = mesh->Peek_Model();
		mesh_name = mesh->Get_Name() != nullptr ? mesh->Get_Name() : "";
		vertices = static_cast<int>(model->Get_Vertex_Count());
		polygons = static_cast<int>(model->Get_Polygon_Count());
		TextureClass *loaded_texture = model->Peek_Single_Texture(0, 0);
		texture_resolved = loaded_texture != nullptr;
		if (texture_resolved) {
			if (loaded_texture->Get_Texture_Name() != nullptr) {
				loaded_texture_name = loaded_texture->Get_Texture_Name();
			}
			texture_registered =
				asset_manager != nullptr &&
				asset_manager->Texture_Hash().Get(kShippedMeshTextureName) == loaded_texture;
			texture_dds_loaded = loaded_texture->Is_Initialized();
			texture_has_d3d_surface = loaded_texture->Peek_D3D_Texture() != nullptr;
			if (texture_has_d3d_surface) {
				texture_uploaded_levels = loaded_texture->Peek_D3D_Texture()->GetLevelCount();
				texture_levels = texture_uploaded_levels;
				D3DSURFACE_DESC texture_desc = {};
				texture_level_desc_result =
					loaded_texture->Peek_D3D_Texture()->GetLevelDesc(0, &texture_desc);
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

		mesh->Get_Obj_Space_Bounding_Box(object_box);
		frame_mesh_in_front_of_camera(*mesh, object_box);

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

	if (mesh_loaded) {
		camera = W3DNEW CameraClass();
		camera->Set_Aspect_Ratio(800.0f / 600.0f);

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
			const WasmD3D8ShimState *render_state = wasm_d3d8_get_state();
			texture_id = render_state != nullptr ? render_state->last_set_texture_id : 0;
			end_render_result = WW3D::End_Render(false);
		}

		light->Release_Ref();
	}

	REF_PTR_RELEASE(camera);
	REF_PTR_RELEASE(mesh);

	if (asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		WW3D::Shutdown();
	}

	if (w3d_file_system != nullptr) {
		delete w3d_file_system;
		w3d_file_system = nullptr;
	}
	TheW3DFileSystem = old_w3d_file_system;
	_TheFileFactory = old_file_factory;
	name_key_generator.reset();
	TheNameKeyGenerator = old_name_key_generator;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const WasmD3D8DrawTextureStageState *stage1 =
		draw_state != nullptr ? &draw_state->texture_stages[1] : nullptr;
	if (state != nullptr) {
		if (texture_id == 0) {
			texture_id = state->last_set_texture_id;
		}
		if (texture_upload_bytes == 0) {
			texture_upload_bytes = state->last_browser_texture_bytes;
			texture_upload_checksum = state->last_browser_texture_checksum;
		}
	}

	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		asset_manager == nullptr &&
		mesh_archive_loaded &&
		texture_archive_loaded &&
		file_read &&
		texture_file_exists &&
		texture_file_factory_installed &&
		!texture_simple_factory_path_set &&
		texture_registered &&
		texture_dds_available &&
		texture_dds_loaded &&
		texture_resolved &&
		texture_has_d3d_surface &&
		mesh_chunk_found &&
		mesh_loaded &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		mesh_data.size() == 594 &&
		mesh_name == kShippedMeshName &&
		loaded_texture_name == kShippedMeshTextureName &&
		vertices == 4 &&
		polygons == 2 &&
		texture_id != 0 &&
		(texture_format == D3DFMT_DXT1 ||
			texture_format == D3DFMT_DXT3 ||
			texture_format == D3DFMT_DXT5) &&
		texture_width > 0 &&
		texture_height > 0 &&
		texture_levels > 0 &&
		texture_uploaded_levels == texture_levels &&
		state->create_device_calls >= 1 &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= texture_levels &&
		state->set_texture_calls >= 1 &&
		state->browser_texture_bind_calls >= 1 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->set_transform_calls >= 3 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count == 4 &&
		state->last_draw_primitive_count == 2 &&
		state->last_draw_vertex_buffer_id != 0 &&
		state->last_draw_index_buffer_id != 0 &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] == D3DTOP_MODULATE &&
		stage0->values[D3DTSS_COLORARG1] == D3DTA_TEXTURE &&
		stage1 != nullptr &&
		stage1->values[D3DTSS_COLOROP] == D3DTOP_DISABLE;

	const std::string archive_json = json_escape(archive_path != nullptr ? archive_path : "");
	const std::string texture_archive_json =
		json_escape(texture_archive_path != nullptr ? texture_archive_path : "");
	const std::string mesh_path_json = json_escape(kShippedMeshPath);
	const std::string mesh_name_json = json_escape(mesh_name);
	const std::string texture_name_json = json_escape(loaded_texture_name);
	const std::string texture_entry_json = json_escape(kShippedMeshTextureArchiveEntry);

	char buffer[9000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_shipped_mesh_probe\","
		"\"ok\":%s,"
		"\"archives\":{\"mesh\":\"%s\",\"texture\":\"%s\"},"
		"\"mesh\":{\"path\":\"%s\",\"name\":\"%s\",\"bytes\":%u,"
		"\"vertices\":%d,\"polygons\":%d,"
		"\"objectBox\":{\"center\":[%.4f,%.4f,%.4f],"
		"\"extent\":[%.4f,%.4f,%.4f]}},"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"meshArchiveLoaded\":%s,\"textureArchiveLoaded\":%s,"
		"\"fileRead\":%s,\"textureFileExists\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"textureSimpleFactoryPathSet\":%s,\"textureRegistered\":%s,"
		"\"textureDDSAvailable\":%s,"
		"\"textureDDSLoaded\":%s,\"textureResolved\":%s,"
		"\"textureHasD3DSurface\":%s,\"textureLevelDesc\":%ld,"
		"\"meshChunkFound\":%s,\"meshLoad\":%d,"
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
		"\"archiveEntry\":\"%s\",\"width\":%u,\"height\":%u,"
		"\"levels\":%u,\"uploadedLevels\":%u,\"format\":%lu,\"uploadFormat\":%lu,"
		"\"lastUpload\":{\"width\":%u,\"height\":%u,\"bytes\":%u,"
		"\"checksum\":%lu},"
		"\"source\":\"original W3DFileSystem + Win32BIGFileSystem + TextureClass::Init / TextureLoader foreground DDS path from registered BIG archives\"},"
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
		archive_json.c_str(),
		texture_archive_json.c_str(),
		mesh_path_json.c_str(),
		mesh_name_json.c_str(),
		static_cast<unsigned int>(mesh_data.size()),
		vertices,
		polygons,
		object_box.Center.X,
		object_box.Center.Y,
		object_box.Center.Z,
		object_box.Extent.X,
		object_box.Extent.Y,
		object_box.Extent.Z,
		init_result,
		set_device_result,
		bool_json(mesh_archive_loaded),
		bool_json(texture_archive_loaded),
		bool_json(file_read),
		bool_json(texture_file_exists),
		bool_json(texture_file_factory_installed),
		bool_json(texture_simple_factory_path_set),
		bool_json(texture_registered),
		bool_json(texture_dds_available),
		bool_json(texture_dds_loaded),
		bool_json(texture_resolved),
		bool_json(texture_has_d3d_surface),
		static_cast<long>(texture_level_desc_result),
		bool_json(mesh_chunk_found),
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

	g_ww3d_shipped_mesh_probe_json = buffer;
	return g_ww3d_shipped_mesh_probe_json.c_str();
}

}
