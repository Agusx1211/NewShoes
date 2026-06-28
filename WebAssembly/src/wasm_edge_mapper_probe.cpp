#include <cmath>
#include <cstdio>
#include <string>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "dx8wrapper.h"
#include "ini.h"
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

std::string g_edge_mapper_probe_json;

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

struct EdgeMapperCaseResult
{
	const char *name;
	unsigned stage;
	DWORD expected_texcoord;
	bool mapper_created;
	bool mapper_id_ok;
	bool needs_normals_ok;
	bool time_variant_ok;
	bool apply_called;
	DWORD texcoord_index;
	DWORD transform_flags;
	D3DTRANSFORMSTATETYPE transform_state;
	D3DTRANSFORMSTATETYPE expected_transform_state;
	UINT transform_call_delta;
	UINT texture_stage_call_delta;
	bool row0_ok;
	bool row1_ok;
	bool row2_ok;
	bool row3_ok;
	Matrix4x4 emitted_transform;
	Matrix4x4 expected_transform;
};

EdgeMapperClass *make_edge_mapper(bool use_reflect, unsigned stage)
{
	if (!use_reflect) {
		return W3DNEW EdgeMapperClass(stage);
	}

	INIClass ini;
	ini.Put_Float("Args", "VPerSec", 0.0f);
	ini.Put_Float("Args", "VStart", 0.375f);
	ini.Put_Bool("Args", "UseReflect", true);
	return W3DNEW EdgeMapperClass(ini, "Args", stage);
}

EdgeMapperCaseResult run_edge_mapper_case(const char *name, bool use_reflect, unsigned stage)
{
	EdgeMapperCaseResult result = {};
	result.name = name;
	result.stage = stage;
	result.expected_texcoord = use_reflect ?
		D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR :
		D3DTSS_TCI_CAMERASPACENORMAL;
	result.expected_transform_state =
		static_cast<D3DTRANSFORMSTATETYPE>(D3DTS_TEXTURE0 + stage);
	result.transform_state = static_cast<D3DTRANSFORMSTATETYPE>(0);
	result.texcoord_index = 0xffffffffUL;
	result.transform_flags = 0xffffffffUL;
	result.emitted_transform.Make_Identity();
	result.expected_transform.Make_Identity();

	EdgeMapperClass *mapper = make_edge_mapper(use_reflect, stage);
	result.mapper_created = mapper != nullptr;
	result.mapper_id_ok = mapper != nullptr &&
		mapper->Mapper_ID() == TextureMapperClass::MAPPER_ID_EDGE;
	result.needs_normals_ok = mapper != nullptr && mapper->Needs_Normals();
	result.time_variant_ok = mapper != nullptr && mapper->Is_Time_Variant();
	if (mapper != nullptr) {
		mapper->Calculate_Texture_Matrix(result.expected_transform);
	}

	DX8Wrapper::Set_DX8_Texture_Stage_State(
		stage, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0);
	DX8Wrapper::Set_DX8_Texture_Stage_State(
		stage, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE);

	const WasmD3D8ShimState *before_state = wasm_d3d8_get_state();
	const UINT transform_calls_before =
		before_state != nullptr ? before_state->set_transform_calls : 0;
	const UINT texture_stage_calls_before =
		before_state != nullptr ? before_state->set_texture_stage_state_calls : 0;

	if (mapper != nullptr) {
		mapper->Apply(0);
		result.apply_called = true;
	}

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

	DX8Wrapper::Get_Transform(result.expected_transform_state, result.emitted_transform);
	IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();
	result.texcoord_index = texture_stage_value(device, stage, D3DTSS_TEXCOORDINDEX);
	result.transform_flags = texture_stage_value(device, stage, D3DTSS_TEXTURETRANSFORMFLAGS);
	result.row0_ok = row_nearly_equal(result.emitted_transform, 0, result.expected_transform, 0);
	result.row1_ok = row_nearly_equal(result.emitted_transform, 1, result.expected_transform, 1);
	result.row2_ok = row_nearly_equal(result.emitted_transform, 2, result.expected_transform, 2);
	result.row3_ok = row_nearly_equal(result.emitted_transform, 3, result.expected_transform, 3);

	REF_PTR_RELEASE(mapper);
	return result;
}

bool case_ok(const EdgeMapperCaseResult &result)
{
	return result.mapper_created &&
		result.mapper_id_ok &&
		result.needs_normals_ok &&
		result.time_variant_ok &&
		result.apply_called &&
		result.transform_state == result.expected_transform_state &&
		result.texcoord_index == result.expected_texcoord &&
		result.transform_flags == D3DTTFF_COUNT2 &&
		result.transform_call_delta == 1 &&
		result.texture_stage_call_delta == 2 &&
		result.row0_ok &&
		result.row1_ok &&
		result.row2_ok &&
		result.row3_ok;
}

void append_case_json(char *buffer, std::size_t buffer_size, const EdgeMapperCaseResult &result)
{
	const bool rows_ok = result.row0_ok && result.row1_ok && result.row2_ok && result.row3_ok;
	std::snprintf(buffer, buffer_size,
		"\"%s\":{\"ok\":%s,"
		"\"stage\":%u,\"mapperCreated\":%s,\"mapperIdOk\":%s,"
		"\"needsNormalsOk\":%s,\"timeVariantOk\":%s,\"applyCalled\":%s,"
		"\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,"
		"\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,"
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
		result.name,
		bool_json(case_ok(result)),
		result.stage,
		bool_json(result.mapper_created),
		bool_json(result.mapper_id_ok),
		bool_json(result.needs_normals_ok),
		bool_json(result.time_variant_ok),
		bool_json(result.apply_called),
		static_cast<unsigned long>(result.texcoord_index),
		static_cast<unsigned long>(result.expected_texcoord),
		static_cast<unsigned long>(result.transform_flags),
		static_cast<unsigned long>(D3DTTFF_COUNT2),
		static_cast<unsigned long>(result.transform_state),
		static_cast<unsigned long>(result.expected_transform_state),
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_edge_mapper_apply()
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	g_edge_mapper_probe_json.clear();

	int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;

	if (init_result == WW3D_ERROR_OK) {
		set_device_result = WW3D::Set_Render_Device(0, 320, 240, 32, 1, false, false, true);
	}

	if (set_device_result == WW3D_ERROR_OK) {
		EdgeMapperCaseResult normal = run_edge_mapper_case("normal", false, 1);
		EdgeMapperCaseResult reflect = run_edge_mapper_case("reflect", true, 1);
		const bool ok = case_ok(normal) && case_ok(reflect);

		char normal_json[4096];
		char reflect_json[4096];
		append_case_json(normal_json, sizeof(normal_json), normal);
		append_case_json(reflect_json, sizeof(reflect_json), reflect);

		char buffer[9216];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"edge_mapper_apply_probe\","
			"\"ok\":%s,"
			"\"results\":{\"init\":%d,\"setRenderDevice\":%d},"
			"\"cases\":{%s,%s}}",
			bool_json(ok),
			init_result,
			set_device_result,
			normal_json,
			reflect_json);
		g_edge_mapper_probe_json = buffer;
	}

	if (init_result == WW3D_ERROR_OK) {
		wasm_shutdown_ww3d_probe();
	}

	if (g_edge_mapper_probe_json.empty()) {
		char buffer[256];
		std::snprintf(buffer, sizeof(buffer),
			"{\"source\":\"edge_mapper_apply_probe\",\"ok\":false,"
			"\"results\":{\"init\":%d,\"setRenderDevice\":%d}}",
			init_result,
			set_device_result);
		g_edge_mapper_probe_json = buffer;
	}
	return g_edge_mapper_probe_json.c_str();
}

} // extern "C"
