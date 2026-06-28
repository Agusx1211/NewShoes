#include <cmath>
#include <cstdio>
#include <string>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "assetmgr.h"
#include "camera.h"
#include "dx8fvf.h"
#include "dx8wrapper.h"
#include "rinfo.h"
#include "shdcubemap.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"
#include "ww3d.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_wwshade_cubemap_probe_json;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

bool nearly_equal(float lhs, float rhs)
{
	return std::fabs(lhs - rhs) <= 0.0001f;
}

DWORD texture_stage_value(IDirect3DDevice8 *device, unsigned stage, D3DTEXTURESTAGESTATETYPE state)
{
	DWORD value = 0xffffffffUL;
	if (device == nullptr) {
		return 0xffffffffUL;
	}
	if (device->GetTextureStageState(stage, state, &value) != S_OK) {
		return 0xffffffffUL;
	}
	return value;
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_wwshade_cubemap_apply()
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	g_wwshade_cubemap_probe_json.clear();

	const Vector3 expected_ambient(0.2f, 0.3f, 0.4f);
	const Vector3 expected_diffuse(0.5f, 0.6f, 0.7f);
	const Vector3 expected_specular(0.8f, 0.9f, 1.0f);

	int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	bool camera_created = false;
	bool shader_created = false;
	bool apply_called = false;
	bool used_existing_asset_manager = false;
	bool asset_manager_created = false;

	WW3DAssetManager *asset_manager = nullptr;
	CameraClass *camera = nullptr;
	Shd6CubeMapClass *shader = nullptr;
	ShdCubeMapDefClass *definition = nullptr;

	if (init_result == WW3D_ERROR_OK) {
		set_device_result = WW3D::Set_Render_Device(0, 320, 240, 32, 1, false, false, true);
	}

	if (set_device_result == WW3D_ERROR_OK) {
		asset_manager = WW3DAssetManager::Get_Instance();
		used_existing_asset_manager = asset_manager != nullptr;
		if (asset_manager == nullptr) {
			asset_manager = W3DNEW WW3DAssetManager();
			asset_manager_created = asset_manager != nullptr;
		}

		definition = W3DNEW ShdCubeMapDefClass();
		if (definition != nullptr) {
			definition->Set_Texture_Name(StringClass("missing_cubemap_probe.dds"));
			definition->Set_Ambient(expected_ambient);
			definition->Set_Diffuse(expected_diffuse);
			definition->Set_Specular(expected_specular);
		}

		camera = W3DNEW CameraClass();
		if (definition != nullptr && asset_manager != nullptr) {
			shader = W3DNEW Shd6CubeMapClass(definition);
		}
		REF_PTR_RELEASE(definition);
		camera_created = camera != nullptr;
		shader_created = shader != nullptr;

		if (camera_created && shader_created) {
			DX8Wrapper::Set_DX8_Texture_Stage_State(
				0, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0);
			DX8Wrapper::Set_DX8_Texture_Stage_State(0, D3DTSS_COLORARG1, D3DTA_DIFFUSE);
			DX8Wrapper::Set_DX8_Texture_Stage_State(0, D3DTSS_COLOROP, D3DTOP_SELECTARG1);
			DX8Wrapper::Set_DX8_Texture_Stage_State(0, D3DTSS_COLORARG2, D3DTA_CURRENT);
			DX8Wrapper::Set_DX8_Texture_Stage_State(0, D3DTSS_ALPHAOP, D3DTOP_DISABLE);
			DX8Wrapper::Set_DX8_Texture_Stage_State(1, D3DTSS_COLOROP, D3DTOP_SELECTARG1);
			DX8Wrapper::Set_DX8_Texture_Stage_State(1, D3DTSS_ALPHAOP, D3DTOP_SELECTARG1);

			DX8Wrapper::Set_Vertex_Shader(0);
			DX8Wrapper::Set_DX8_Render_State(D3DRS_LIGHTING, FALSE);
			DX8Wrapper::Set_DX8_Render_State(D3DRS_SPECULARENABLE, FALSE);
			DX8Wrapper::Set_DX8_Render_State(D3DRS_AMBIENTMATERIALSOURCE, D3DMCS_COLOR1);
			DX8Wrapper::Set_DX8_Render_State(D3DRS_DIFFUSEMATERIALSOURCE, D3DMCS_COLOR1);
			DX8Wrapper::Set_DX8_Render_State(D3DRS_SPECULARMATERIALSOURCE, D3DMCS_COLOR1);
			DX8Wrapper::Set_DX8_Render_State(D3DRS_EMISSIVEMATERIALSOURCE, D3DMCS_COLOR1);

			const WasmD3D8ShimState *before_state = wasm_d3d8_get_state();
			const UINT texture_stage_calls_before =
				before_state != nullptr ? before_state->set_texture_stage_state_calls : 0;
			const UINT render_state_calls_before =
				before_state != nullptr ? before_state->set_render_state_calls : 0;
			const UINT vertex_shader_calls_before =
				before_state != nullptr ? before_state->set_vertex_shader_calls : 0;
			const UINT material_calls_before =
				before_state != nullptr ? before_state->set_material_calls : 0;

			RenderInfoClass render_info(*camera);
			shader->Apply_Shared(0, render_info);
			apply_called = true;

			const WasmD3D8ShimState *after_state = wasm_d3d8_get_state();
			const UINT texture_stage_calls_after =
				after_state != nullptr ? after_state->set_texture_stage_state_calls : 0;
			const UINT render_state_calls_after =
				after_state != nullptr ? after_state->set_render_state_calls : 0;
			const UINT vertex_shader_calls_after =
				after_state != nullptr ? after_state->set_vertex_shader_calls : 0;
			const UINT material_calls_after =
				after_state != nullptr ? after_state->set_material_calls : 0;
			IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();

			const DWORD stage0_texcoord = texture_stage_value(device, 0, D3DTSS_TEXCOORDINDEX);
			const DWORD stage0_color_arg1 = texture_stage_value(device, 0, D3DTSS_COLORARG1);
			const DWORD stage0_color_op = texture_stage_value(device, 0, D3DTSS_COLOROP);
			const DWORD stage0_color_arg2 = texture_stage_value(device, 0, D3DTSS_COLORARG2);
			const DWORD stage0_alpha_op = texture_stage_value(device, 0, D3DTSS_ALPHAOP);
			const DWORD stage1_color_op = texture_stage_value(device, 1, D3DTSS_COLOROP);
			const DWORD stage1_alpha_op = texture_stage_value(device, 1, D3DTSS_ALPHAOP);
			const DWORD lighting = DX8Wrapper::Get_DX8_Render_State(D3DRS_LIGHTING);
			const DWORD specular_enable = DX8Wrapper::Get_DX8_Render_State(D3DRS_SPECULARENABLE);
			const DWORD ambient_source = DX8Wrapper::Get_DX8_Render_State(D3DRS_AMBIENTMATERIALSOURCE);
			const DWORD diffuse_source = DX8Wrapper::Get_DX8_Render_State(D3DRS_DIFFUSEMATERIALSOURCE);
			const DWORD specular_source = DX8Wrapper::Get_DX8_Render_State(D3DRS_SPECULARMATERIALSOURCE);
			const DWORD emissive_source = DX8Wrapper::Get_DX8_Render_State(D3DRS_EMISSIVEMATERIALSOURCE);
			const WasmD3D8DrawMaterial material =
				after_state != nullptr ? after_state->last_set_material : WasmD3D8DrawMaterial{};

			const bool material_ok =
				nearly_equal(material.ambient.r, expected_ambient.X) &&
				nearly_equal(material.ambient.g, expected_ambient.Y) &&
				nearly_equal(material.ambient.b, expected_ambient.Z) &&
				nearly_equal(material.diffuse.r, expected_diffuse.X) &&
				nearly_equal(material.diffuse.g, expected_diffuse.Y) &&
				nearly_equal(material.diffuse.b, expected_diffuse.Z) &&
				nearly_equal(material.specular.r, expected_specular.X) &&
				nearly_equal(material.specular.g, expected_specular.Y) &&
				nearly_equal(material.specular.b, expected_specular.Z) &&
				nearly_equal(material.power, 20.0f);
			const bool ok =
				after_state != nullptr &&
				device != nullptr &&
				asset_manager != nullptr &&
				stage0_texcoord == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR &&
				stage0_color_arg1 == D3DTA_TEXTURE &&
				stage0_color_op == D3DTOP_MODULATE &&
				stage0_color_arg2 == D3DTA_DIFFUSE &&
				stage0_alpha_op == D3DTOP_MODULATE &&
				stage1_color_op == D3DTOP_DISABLE &&
				stage1_alpha_op == D3DTOP_DISABLE &&
				lighting == TRUE &&
				specular_enable == TRUE &&
				ambient_source == D3DMCS_MATERIAL &&
				diffuse_source == D3DMCS_MATERIAL &&
				specular_source == D3DMCS_MATERIAL &&
				emissive_source == D3DMCS_MATERIAL &&
				after_state->last_set_vertex_shader == DX8_FVF_XYZNDCUBEMAP &&
				texture_stage_calls_after >= texture_stage_calls_before + 7 &&
				render_state_calls_after >= render_state_calls_before + 6 &&
				vertex_shader_calls_after == vertex_shader_calls_before + 1 &&
				material_calls_after == material_calls_before + 1 &&
				material_ok;

			char buffer[4096];
			std::snprintf(buffer, sizeof(buffer),
				"{\"source\":\"wwshade_cubemap_apply_probe\","
				"\"ok\":%s,"
				"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
				"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
				"\"cameraCreated\":%s,\"shaderCreated\":%s,\"applyCalled\":%s},"
				"\"textureStages\":{\"stage0\":{\"texCoordIndex\":%lu,"
				"\"colorArg1\":%lu,\"colorOp\":%lu,\"colorArg2\":%lu,"
				"\"alphaOp\":%lu},\"stage1\":{\"colorOp\":%lu,\"alphaOp\":%lu}},"
				"\"renderState\":{\"lighting\":%lu,\"specularEnable\":%lu,"
				"\"ambientMaterialSource\":%lu,\"diffuseMaterialSource\":%lu,"
				"\"specularMaterialSource\":%lu,\"emissiveMaterialSource\":%lu},"
				"\"vertexShader\":{\"fvf\":%lu,\"expected\":%lu},"
				"\"material\":{\"ok\":%s,\"ambient\":[%.3f,%.3f,%.3f],"
				"\"diffuse\":[%.3f,%.3f,%.3f],\"specular\":[%.3f,%.3f,%.3f],"
				"\"power\":%.3f},"
				"\"callDeltas\":{\"textureStageState\":%u,\"renderState\":%u,"
				"\"vertexShader\":%u,\"material\":%u}}",
				bool_json(ok),
				init_result,
				set_device_result,
				bool_json(asset_manager_created),
				bool_json(used_existing_asset_manager),
				bool_json(camera_created),
				bool_json(shader_created),
				bool_json(apply_called),
				static_cast<unsigned long>(stage0_texcoord),
				static_cast<unsigned long>(stage0_color_arg1),
				static_cast<unsigned long>(stage0_color_op),
				static_cast<unsigned long>(stage0_color_arg2),
				static_cast<unsigned long>(stage0_alpha_op),
				static_cast<unsigned long>(stage1_color_op),
				static_cast<unsigned long>(stage1_alpha_op),
				static_cast<unsigned long>(lighting),
				static_cast<unsigned long>(specular_enable),
				static_cast<unsigned long>(ambient_source),
				static_cast<unsigned long>(diffuse_source),
				static_cast<unsigned long>(specular_source),
				static_cast<unsigned long>(emissive_source),
				static_cast<unsigned long>(after_state != nullptr ? after_state->last_set_vertex_shader : 0),
				static_cast<unsigned long>(DX8_FVF_XYZNDCUBEMAP),
				bool_json(material_ok),
				static_cast<double>(material.ambient.r),
				static_cast<double>(material.ambient.g),
				static_cast<double>(material.ambient.b),
				static_cast<double>(material.diffuse.r),
				static_cast<double>(material.diffuse.g),
				static_cast<double>(material.diffuse.b),
				static_cast<double>(material.specular.r),
				static_cast<double>(material.specular.g),
				static_cast<double>(material.specular.b),
				static_cast<double>(material.power),
				texture_stage_calls_after - texture_stage_calls_before,
				render_state_calls_after - render_state_calls_before,
				vertex_shader_calls_after - vertex_shader_calls_before,
				material_calls_after - material_calls_before);
			g_wwshade_cubemap_probe_json = buffer;
		}
	}

	REF_PTR_RELEASE(shader);
	REF_PTR_RELEASE(definition);
	REF_PTR_RELEASE(camera);
	if (init_result == WW3D_ERROR_OK) {
		wasm_shutdown_ww3d_probe();
	}
	if (asset_manager_created && asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (g_wwshade_cubemap_probe_json.empty()) {
		char buffer[512];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"wwshade_cubemap_apply_probe\",\"ok\":false,"
			"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
			"\"assetManagerCreated\":%s,\"usedExistingAssetManager\":%s,"
			"\"cameraCreated\":%s,\"shaderCreated\":%s,\"applyCalled\":%s}}",
			init_result,
			set_device_result,
			bool_json(asset_manager_created),
			bool_json(used_existing_asset_manager),
			bool_json(camera_created),
			bool_json(shader_created),
			bool_json(apply_called));
		g_wwshade_cubemap_probe_json = buffer;
	}
	return g_wwshade_cubemap_probe_json.c_str();
}

} // extern "C"
