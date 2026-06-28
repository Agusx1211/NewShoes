#include <cmath>
#include <cstdio>
#include <string>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "D3DX8Math.h"
#include "dx8wrapper.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"
#include "ww3d.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_projection_state_probe_json;

constexpr float kEpsilon = 0.0001f;
constexpr unsigned kTerrainStage = 0;
constexpr unsigned kWaterStage = 2;
constexpr D3DTRANSFORMSTATETYPE kTerrainTextureTransform = D3DTS_TEXTURE0;
constexpr D3DTRANSFORMSTATETYPE kWaterTextureTransform = D3DTS_TEXTURE2;
// Original definition: Common/MapObject.h MAP_XY_FACTOR == 10.0f.
constexpr float kMapXYFactor = 10.0f;
constexpr float kTerrainStretchFactor =
	1.0f / (63.0f * kMapXYFactor / 2.0f);
constexpr float kWaterNoiseRepeatFactor = 1.0f / 16.0f;
constexpr float kWaterRiverOrigin = 0.375f;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

bool nearly_equal(float lhs, float rhs)
{
	return std::fabs(lhs - rhs) <= kEpsilon;
}

bool row_nearly_equal(const Matrix4x4 &lhs, int lhs_row, const Matrix4x4 &rhs, int rhs_row)
{
	for (int column = 0; column < 4; ++column) {
		if (!nearly_equal(lhs[lhs_row][column], rhs[rhs_row][column])) {
			return false;
		}
	}
	return true;
}

bool matrix_nearly_equal(const Matrix4x4 &lhs, const Matrix4x4 &rhs)
{
	for (int row = 0; row < 4; ++row) {
		if (!row_nearly_equal(lhs, row, rhs, row)) {
			return false;
		}
	}
	return true;
}

DWORD texture_stage_value(IDirect3DDevice8 *device, unsigned stage, D3DTEXTURESTAGESTATETYPE state)
{
	DWORD value = 0xffffffffUL;
	if (device == nullptr) {
		return value;
	}
	if (device->GetTextureStageState(stage, state, &value) != S_OK) {
		return 0xffffffffUL;
	}
	return value;
}

void set_probe_view_transform()
{
	Matrix4x4 view;
	view.Init(	1.00f, 0.00f, 0.00f, 12.0f,
				0.00f, 1.00f, 0.00f, -7.0f,
				0.00f, 0.00f, 1.00f, 5.0f,
				0.00f, 0.00f, 0.00f, 1.0f);
	DX8Wrapper::_Set_DX8_Transform(D3DTS_VIEW, view);
}

Matrix4x4 calculate_terrain_noise2_transform()
{
	// Mirrors the deterministic noise2 branch in
	// GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DShaderManager.cpp:
	// TerrainShader2Stage::set(pass=2) -> updateNoise2().
	Matrix4x4 cur_view;
	DX8Wrapper::_Get_DX8_Transform(D3DTS_VIEW, cur_view);

	D3DXMATRIX inverse_view;
	float determinant = 0.0f;
	D3DXMatrixInverse(&inverse_view, &determinant, reinterpret_cast<D3DXMATRIX *>(&cur_view));

	D3DXMATRIX scale;
	D3DXMatrixScaling(&scale, kTerrainStretchFactor, kTerrainStretchFactor, 1.0f);
	D3DXMATRIX dest_matrix = inverse_view * scale;
	return *reinterpret_cast<Matrix4x4 *>(&dest_matrix);
}

Matrix4x4 calculate_water_noise_transform()
{
	// Mirrors the water-noise projection setup in
	// GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/Water/W3DWater.cpp:
	// WaterRenderObjClass::drawRiverWater() / drawTrapezoidWater().
	Matrix4x4 cur_view;
	DX8Wrapper::_Get_DX8_Transform(D3DTS_VIEW, cur_view);

	D3DXMATRIX inverse_view;
	float determinant = 0.0f;
	D3DXMatrixInverse(&inverse_view, &determinant, reinterpret_cast<D3DXMATRIX *>(&cur_view));

	D3DXMATRIX scale;
	D3DXMatrixScaling(&scale, kWaterNoiseRepeatFactor, kWaterNoiseRepeatFactor, 1.0f);
	D3DXMATRIX dest_matrix = inverse_view * scale;
	D3DXMatrixTranslation(&scale, kWaterRiverOrigin, kWaterRiverOrigin, 0.0f);
	dest_matrix *= scale;
	return *reinterpret_cast<Matrix4x4 *>(&dest_matrix);
}

struct ProjectionCaseResult
{
	const char *name;
	const char *source;
	unsigned stage;
	D3DTRANSFORMSTATETYPE texture_transform;
	UINT transform_call_delta;
	UINT texture_stage_call_delta;
	DWORD texcoord_index;
	DWORD texture_transform_flags;
	DWORD address_u;
	DWORD address_v;
	D3DTRANSFORMSTATETYPE transform_state;
	Matrix4x4 emitted_transform;
	Matrix4x4 expected_transform;
	bool row0_ok;
	bool row1_ok;
	bool row2_ok;
	bool row3_ok;
	bool ok;
};

ProjectionCaseResult run_projection_case(
	const char *name,
	const char *source,
	unsigned stage,
	D3DTRANSFORMSTATETYPE texture_transform,
	const Matrix4x4 &source_transform)
{
	ProjectionCaseResult result = {};
	result.name = name;
	result.source = source;
	result.stage = stage;
	result.texture_transform = texture_transform;
	// The direct original paths feed a D3DX-derived Matrix4x4 through
	// _Set_DX8_Transform; DX8Wrapper::Get_Transform exposes its transpose.
	result.expected_transform = source_transform.Transpose();
	result.emitted_transform.Make_Identity();
	result.texcoord_index = 0xffffffffUL;
	result.texture_transform_flags = 0xffffffffUL;
	result.address_u = 0xffffffffUL;
	result.address_v = 0xffffffffUL;

	const WasmD3D8ShimState *before_state = wasm_d3d8_get_state();
	const UINT transform_calls_before =
		before_state != nullptr ? before_state->set_transform_calls : 0;
	const UINT texture_stage_calls_before =
		before_state != nullptr ? before_state->set_texture_stage_state_calls : 0;

	DX8Wrapper::Set_DX8_Texture_Stage_State(
		stage, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_CAMERASPACEPOSITION);
	DX8Wrapper::Set_DX8_Texture_Stage_State(
		stage, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_COUNT2);
	DX8Wrapper::Set_DX8_Texture_Stage_State(stage, D3DTSS_ADDRESSU, D3DTADDRESS_WRAP);
	DX8Wrapper::Set_DX8_Texture_Stage_State(stage, D3DTSS_ADDRESSV, D3DTADDRESS_WRAP);
	DX8Wrapper::_Set_DX8_Transform(texture_transform, source_transform);

	const WasmD3D8ShimState *after_state = wasm_d3d8_get_state();
	const UINT transform_calls_after =
		after_state != nullptr ? after_state->set_transform_calls : 0;
	const UINT texture_stage_calls_after =
		after_state != nullptr ? after_state->set_texture_stage_state_calls : 0;

	if (after_state != nullptr) {
		result.transform_state = after_state->last_set_transform_state;
	}
	result.transform_call_delta = transform_calls_after - transform_calls_before;
	result.texture_stage_call_delta = texture_stage_calls_after - texture_stage_calls_before;

	DX8Wrapper::Get_Transform(texture_transform, result.emitted_transform);
	IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();
	result.texcoord_index = texture_stage_value(device, stage, D3DTSS_TEXCOORDINDEX);
	result.texture_transform_flags =
		texture_stage_value(device, stage, D3DTSS_TEXTURETRANSFORMFLAGS);
	result.address_u = texture_stage_value(device, stage, D3DTSS_ADDRESSU);
	result.address_v = texture_stage_value(device, stage, D3DTSS_ADDRESSV);

	result.row0_ok = row_nearly_equal(result.emitted_transform, 0, result.expected_transform, 0);
	result.row1_ok = row_nearly_equal(result.emitted_transform, 1, result.expected_transform, 1);
	result.row2_ok = row_nearly_equal(result.emitted_transform, 2, result.expected_transform, 2);
	result.row3_ok = row_nearly_equal(result.emitted_transform, 3, result.expected_transform, 3);
	result.ok =
		after_state != nullptr &&
		device != nullptr &&
		result.transform_state == texture_transform &&
		result.texcoord_index == D3DTSS_TCI_CAMERASPACEPOSITION &&
		result.texture_transform_flags == D3DTTFF_COUNT2 &&
		result.address_u == D3DTADDRESS_WRAP &&
		result.address_v == D3DTADDRESS_WRAP &&
		result.transform_call_delta == 1 &&
		result.texture_stage_call_delta == 4 &&
		matrix_nearly_equal(result.emitted_transform, result.expected_transform);
	return result;
}

void append_case_json(char *buffer, std::size_t buffer_size, const ProjectionCaseResult &result)
{
	const bool rows_ok = result.row0_ok && result.row1_ok && result.row2_ok && result.row3_ok;
	std::snprintf(buffer, buffer_size,
		"\"%s\":{\"ok\":%s,\"source\":\"%s\",\"stage\":%u,"
		"\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,"
		"\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,"
		"\"addressU\":%lu,\"addressV\":%lu,\"expectedAddress\":%lu,"
		"\"transform\":{\"state\":%lu,\"expectedState\":%lu,\"rowsOk\":%s,"
		"\"row0Ok\":%s,\"row1Ok\":%s,\"row2Ok\":%s,\"row3Ok\":%s,"
		"\"row0\":[%.5f,%.5f,%.5f,%.5f],"
		"\"row1\":[%.5f,%.5f,%.5f,%.5f],"
		"\"row2\":[%.5f,%.5f,%.5f,%.5f],"
		"\"row3\":[%.5f,%.5f,%.5f,%.5f],"
		"\"expectedRow0\":[%.5f,%.5f,%.5f,%.5f],"
		"\"expectedRow1\":[%.5f,%.5f,%.5f,%.5f],"
		"\"expectedRow2\":[%.5f,%.5f,%.5f,%.5f],"
		"\"expectedRow3\":[%.5f,%.5f,%.5f,%.5f]},"
		"\"callDeltas\":{\"transform\":%u,\"textureStageState\":%u}}",
		result.name,
		bool_json(result.ok),
		result.source,
		result.stage,
		static_cast<unsigned long>(result.texcoord_index),
		static_cast<unsigned long>(D3DTSS_TCI_CAMERASPACEPOSITION),
		static_cast<unsigned long>(result.texture_transform_flags),
		static_cast<unsigned long>(D3DTTFF_COUNT2),
		static_cast<unsigned long>(result.address_u),
		static_cast<unsigned long>(result.address_v),
		static_cast<unsigned long>(D3DTADDRESS_WRAP),
		static_cast<unsigned long>(result.transform_state),
		static_cast<unsigned long>(result.texture_transform),
		bool_json(rows_ok),
		bool_json(result.row0_ok),
		bool_json(result.row1_ok),
		bool_json(result.row2_ok),
		bool_json(result.row3_ok),
		static_cast<double>(result.emitted_transform[0][0]),
		static_cast<double>(result.emitted_transform[0][1]),
		static_cast<double>(result.emitted_transform[0][2]),
		static_cast<double>(result.emitted_transform[0][3]),
		static_cast<double>(result.emitted_transform[1][0]),
		static_cast<double>(result.emitted_transform[1][1]),
		static_cast<double>(result.emitted_transform[1][2]),
		static_cast<double>(result.emitted_transform[1][3]),
		static_cast<double>(result.emitted_transform[2][0]),
		static_cast<double>(result.emitted_transform[2][1]),
		static_cast<double>(result.emitted_transform[2][2]),
		static_cast<double>(result.emitted_transform[2][3]),
		static_cast<double>(result.emitted_transform[3][0]),
		static_cast<double>(result.emitted_transform[3][1]),
		static_cast<double>(result.emitted_transform[3][2]),
		static_cast<double>(result.emitted_transform[3][3]),
		static_cast<double>(result.expected_transform[0][0]),
		static_cast<double>(result.expected_transform[0][1]),
		static_cast<double>(result.expected_transform[0][2]),
		static_cast<double>(result.expected_transform[0][3]),
		static_cast<double>(result.expected_transform[1][0]),
		static_cast<double>(result.expected_transform[1][1]),
		static_cast<double>(result.expected_transform[1][2]),
		static_cast<double>(result.expected_transform[1][3]),
		static_cast<double>(result.expected_transform[2][0]),
		static_cast<double>(result.expected_transform[2][1]),
		static_cast<double>(result.expected_transform[2][2]),
		static_cast<double>(result.expected_transform[2][3]),
		static_cast<double>(result.expected_transform[3][0]),
		static_cast<double>(result.expected_transform[3][1]),
		static_cast<double>(result.expected_transform[3][2]),
		static_cast<double>(result.expected_transform[3][3]),
		result.transform_call_delta,
		result.texture_stage_call_delta);
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_projection_state_apply()
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	g_projection_state_probe_json.clear();

	int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;

	if (init_result == WW3D_ERROR_OK) {
		set_device_result = WW3D::Set_Render_Device(0, 320, 240, 32, 1, false, false, true);
	}

	bool setup_ok = init_result == WW3D_ERROR_OK && set_device_result == WW3D_ERROR_OK;
	if (setup_ok) {
		set_probe_view_transform();
		const Matrix4x4 terrain_expected = calculate_terrain_noise2_transform();
		const ProjectionCaseResult terrain = run_projection_case(
			"terrain",
			"GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DShaderManager.cpp TerrainShader2Stage::set(pass=2) ST_TERRAIN_BASE_NOISE2",
			kTerrainStage,
			kTerrainTextureTransform,
			terrain_expected);

		set_probe_view_transform();
		const Matrix4x4 water_expected = calculate_water_noise_transform();
		const ProjectionCaseResult water = run_projection_case(
			"water",
			"GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/Water/W3DWater.cpp WaterRenderObjClass::drawRiverWater/drawTrapezoidWater noise projection",
			kWaterStage,
			kWaterTextureTransform,
			water_expected);

		const bool ok = terrain.ok && water.ok;
		char terrain_json[2048];
		char water_json[2048];
		append_case_json(terrain_json, sizeof(terrain_json), terrain);
		append_case_json(water_json, sizeof(water_json), water);

		char buffer[8192];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"projection_state_apply_probe\",\"ok\":%s,"
			"\"results\":{\"init\":%d,\"setRenderDevice\":%d},"
			"\"constants\":{\"terrainStretchFactor\":%.8f,"
			"\"waterNoiseRepeatFactor\":%.8f,\"waterRiverOrigin\":%.5f},"
			"\"cases\":{%s,%s}}",
			bool_json(ok),
			init_result,
			set_device_result,
			static_cast<double>(kTerrainStretchFactor),
			static_cast<double>(kWaterNoiseRepeatFactor),
			static_cast<double>(kWaterRiverOrigin),
			terrain_json,
			water_json);
		g_projection_state_probe_json = buffer;
	}

	if (init_result == WW3D_ERROR_OK) {
		wasm_shutdown_ww3d_probe();
	}

	if (g_projection_state_probe_json.empty()) {
		char buffer[512];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"projection_state_apply_probe\",\"ok\":false,"
			"\"results\":{\"init\":%d,\"setRenderDevice\":%d}}",
			init_result,
			set_device_result);
		g_projection_state_probe_json = buffer;
	}

	return g_projection_state_probe_json.c_str();
}

} // extern "C"
