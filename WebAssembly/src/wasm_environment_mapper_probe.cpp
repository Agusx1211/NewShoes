#include <cmath>
#include <cstdio>
#include <string>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "dx8wrapper.h"
#include "mapper.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"
#include "ww3d.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_environment_mapper_probe_json;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

bool nearly_equal(float lhs, float rhs)
{
	return std::fabs(lhs - rhs) <= 0.0001f;
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_environment_mapper_apply()
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	g_environment_mapper_probe_json.clear();

	constexpr unsigned kStage = 1;
	constexpr D3DTRANSFORMSTATETYPE kTextureTransformState =
		static_cast<D3DTRANSFORMSTATETYPE>(D3DTS_TEXTURE0 + kStage);

	int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	bool mapper_created = false;
	bool apply_called = false;

	if (init_result == WW3D_ERROR_OK) {
		set_device_result = WW3D::Set_Render_Device(0, 320, 240, 32, 1, false, false, true);
	}

	if (set_device_result == WW3D_ERROR_OK) {
		EnvironmentMapperClass *mapper = W3DNEW EnvironmentMapperClass(kStage);
		mapper_created = mapper != nullptr;

		Matrix4x4 expected_transform;
		expected_transform.Make_Identity();
		Matrix4x4 emitted_transform;
		emitted_transform.Make_Identity();
		if (mapper != nullptr) {
			mapper->Calculate_Texture_Matrix(expected_transform);
		}

		DX8Wrapper::Set_DX8_Texture_Stage_State(
			kStage, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0);
		DX8Wrapper::Set_DX8_Texture_Stage_State(
			kStage, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE);

		const WasmD3D8ShimState *before_state = wasm_d3d8_get_state();
		const UINT transform_calls_before =
			before_state != nullptr ? before_state->set_transform_calls : 0;
		const UINT texture_stage_calls_before =
			before_state != nullptr ? before_state->set_texture_stage_state_calls : 0;

		if (mapper != nullptr) {
			mapper->Apply(0);
			apply_called = true;
		}

		const WasmD3D8ShimState *after_state = wasm_d3d8_get_state();
		const UINT transform_calls_after =
			after_state != nullptr ? after_state->set_transform_calls : 0;
		const UINT texture_stage_calls_after =
			after_state != nullptr ? after_state->set_texture_stage_state_calls : 0;

		DX8Wrapper::Get_Transform(kTextureTransformState, emitted_transform);
		IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();

		const DWORD texcoord_index = texture_stage_value(device, kStage, D3DTSS_TEXCOORDINDEX);
		const DWORD transform_flags =
			texture_stage_value(device, kStage, D3DTSS_TEXTURETRANSFORMFLAGS);
		const bool row0_ok = row_nearly_equal(emitted_transform, 0, expected_transform, 0);
		const bool row1_ok = row_nearly_equal(emitted_transform, 1, expected_transform, 1);
		const bool row2_ok = row_nearly_equal(emitted_transform, 2, expected_transform, 2);
		const bool row3_ok = row_nearly_equal(emitted_transform, 3, expected_transform, 3);
		const bool ok =
			after_state != nullptr &&
			device != nullptr &&
			mapper_created &&
			apply_called &&
			after_state->last_set_transform_state == kTextureTransformState &&
			texcoord_index == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR &&
			transform_flags == D3DTTFF_COUNT2 &&
			transform_calls_after == transform_calls_before + 1 &&
			texture_stage_calls_after == texture_stage_calls_before + 2 &&
			row0_ok &&
			row1_ok &&
			row2_ok &&
			row3_ok;

		char buffer[4096];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"environment_mapper_apply_probe\","
			"\"ok\":%s,"
			"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
			"\"stage\":%u,\"mapperCreated\":%s,\"applyCalled\":%s},"
			"\"textureStage\":{\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,"
			"\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu},"
			"\"transform\":{\"state\":%lu,\"expectedState\":%lu,"
			"\"rowsOk\":%s,\"row0Ok\":%s,\"row1Ok\":%s,\"row2Ok\":%s,\"row3Ok\":%s,"
			"\"row0\":[%.5f,%.5f,%.5f,%.5f],"
			"\"row1\":[%.5f,%.5f,%.5f,%.5f],"
			"\"row2\":[%.5f,%.5f,%.5f,%.5f],"
			"\"row3\":[%.5f,%.5f,%.5f,%.5f],"
			"\"expectedRow0\":[%.5f,%.5f,%.5f,%.5f],"
			"\"expectedRow1\":[%.5f,%.5f,%.5f,%.5f],"
			"\"expectedRow2\":[%.5f,%.5f,%.5f,%.5f],"
			"\"expectedRow3\":[%.5f,%.5f,%.5f,%.5f]},"
			"\"callDeltas\":{\"transform\":%u,\"textureStageState\":%u}}",
			bool_json(ok),
			init_result,
			set_device_result,
			kStage,
			bool_json(mapper_created),
			bool_json(apply_called),
			static_cast<unsigned long>(texcoord_index),
			static_cast<unsigned long>(D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR),
			static_cast<unsigned long>(transform_flags),
			static_cast<unsigned long>(D3DTTFF_COUNT2),
			static_cast<unsigned long>(after_state != nullptr ? after_state->last_set_transform_state : 0),
			static_cast<unsigned long>(kTextureTransformState),
			bool_json(row0_ok && row1_ok && row2_ok && row3_ok),
			bool_json(row0_ok),
			bool_json(row1_ok),
			bool_json(row2_ok),
			bool_json(row3_ok),
			static_cast<double>(emitted_transform[0][0]),
			static_cast<double>(emitted_transform[0][1]),
			static_cast<double>(emitted_transform[0][2]),
			static_cast<double>(emitted_transform[0][3]),
			static_cast<double>(emitted_transform[1][0]),
			static_cast<double>(emitted_transform[1][1]),
			static_cast<double>(emitted_transform[1][2]),
			static_cast<double>(emitted_transform[1][3]),
			static_cast<double>(emitted_transform[2][0]),
			static_cast<double>(emitted_transform[2][1]),
			static_cast<double>(emitted_transform[2][2]),
			static_cast<double>(emitted_transform[2][3]),
			static_cast<double>(emitted_transform[3][0]),
			static_cast<double>(emitted_transform[3][1]),
			static_cast<double>(emitted_transform[3][2]),
			static_cast<double>(emitted_transform[3][3]),
			static_cast<double>(expected_transform[0][0]),
			static_cast<double>(expected_transform[0][1]),
			static_cast<double>(expected_transform[0][2]),
			static_cast<double>(expected_transform[0][3]),
			static_cast<double>(expected_transform[1][0]),
			static_cast<double>(expected_transform[1][1]),
			static_cast<double>(expected_transform[1][2]),
			static_cast<double>(expected_transform[1][3]),
			static_cast<double>(expected_transform[2][0]),
			static_cast<double>(expected_transform[2][1]),
			static_cast<double>(expected_transform[2][2]),
			static_cast<double>(expected_transform[2][3]),
			static_cast<double>(expected_transform[3][0]),
			static_cast<double>(expected_transform[3][1]),
			static_cast<double>(expected_transform[3][2]),
			static_cast<double>(expected_transform[3][3]),
			transform_calls_after - transform_calls_before,
			texture_stage_calls_after - texture_stage_calls_before);
		g_environment_mapper_probe_json = buffer;

		REF_PTR_RELEASE(mapper);
	}

	if (init_result == WW3D_ERROR_OK) {
		wasm_shutdown_ww3d_probe();
	}

	if (g_environment_mapper_probe_json.empty()) {
		char buffer[512];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"environment_mapper_apply_probe\",\"ok\":false,"
			"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
			"\"stage\":%u,\"mapperCreated\":%s,\"applyCalled\":%s}}",
			init_result,
			set_device_result,
			kStage,
			bool_json(mapper_created),
			bool_json(apply_called));
		g_environment_mapper_probe_json = buffer;
	}
	return g_environment_mapper_probe_json.c_str();
}

} // extern "C"
