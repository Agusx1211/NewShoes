// Smoke: exercise the *original* WW3D2 EnvironmentMapperClass::Apply path
// (GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp) under the
// Emscripten/wasm D3D8 shim, with the original DX8Wrapper initialized just
// enough that the original Set_Transform / Set_DX8_Texture_Stage_State writes
// reach the shim D3D8 device.
//
// This is deliberately separate from the browser harness and from any future
// WebGL2 fixed-function / shader bridge: it pins the (texture-stage transform,
// TEXCOORDINDEX, TEXTURETRANSFORMFLAGS) contract that
// EnvironmentMapperClass::Apply emits so a future browser camera-space
// reflection-vector environment-map bridge can diff against the real emission
// rather than a hand-written approximation. We do NOT stub or reimplement
// Apply or Calculate_Texture_Matrix; we construct the real
// EnvironmentMapperClass on a nonzero stage and call the real Apply().
//
// Verified contracts (on a nonzero stage):
//   * Mapper_ID() == MAPPER_ID_ENVIRONMENT
//   * Needs_Normals() == true
//   * Set_Transform landed on D3DTS_TEXTURE0 + Stage
//   * stage D3DTSS_TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR
//   * stage D3DTSS_TEXTURETRANSFORMFLAGS == D3DTTFF_COUNT2
//   * the texture transform matrix written to the device equals
//     transpose(Calculate_Texture_Matrix(...)) -- accounting for the
//     DX8Wrapper::Set_Transform transpose behavior (DX8Wrapper transposes a
//     Matrix4x4 before handing it to the D3D8 device for non-WORLD/VIEW
//     transform states such as D3DTS_TEXTURE0+Stage).

#include <cstdio>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "dx8wrapper.h"
#include "mapper.h"
#include "matrix4.h"
#include "wasm_d3d8_shim.h"
#include "ww3d.h"

namespace {

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "FAIL: %s\n", message);
		return false;
	}
	return true;
}

bool g_failures = false;

void check(bool condition, const char *message)
{
	if (!expect(condition, message)) {
		g_failures = true;
	}
}

bool nearf(float actual, float expected, float epsilon = 0.0001f)
{
	float delta = actual - expected;
	if (delta < 0.0f) delta = -delta;
	return delta <= epsilon;
}

// Compute the D3DMATRIX the device is expected to hold after Apply(). The
// original DX8Wrapper::Set_Transform(D3DTS_TEXTURE0+Stage, Matrix4x4)
// transposes the Westwood-convention Matrix4x4 before issuing the D3D8
// SetTransform call (see dx8wrapper.h). So the matrix stored on the device
// equals transpose(Calculate_Texture_Matrix(...)). We compute it here from the
// real Calculate_Texture_Matrix so this smoke stays correct if the original
// matrix ever changes.
void expected_device_matrix(TextureMapperClass &mapper, D3DMATRIX &out)
{
	Matrix4x4 tex_matrix;
	mapper.Calculate_Texture_Matrix(tex_matrix);
	// Matrix4x4 [row][col] and D3DMATRIX m[row][col] share the same memory
	// layout; a transpose turns the Westwood-convention matrix into the
	// D3D8 device matrix.
	for (int r = 0; r < 4; ++r) {
		for (int c = 0; c < 4; ++c) {
			out.m[r][c] = tex_matrix[c][r];
		}
	}
}

} // namespace

int main()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	if (!expect(WW3D::Init(nullptr, nullptr, false) == WW3D_ERROR_OK, "WW3D::Init failed")) {
		return 1;
	}
	if (!expect(
			WW3D::Set_Render_Device(0, 64, 64, 32, 1, false, false, true) == WW3D_ERROR_OK,
			"WW3D::Set_Render_Device failed")) {
		WW3D::Shutdown();
		return 1;
	}

	IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();
	check(device != nullptr, "DX8Wrapper D3D8 device is null after Set_Render_Device");

	// Construct the real EnvironmentMapperClass on a NONZERO stage (stage 1),
	// as the original environment-mapped mesh material users do. NEW_REF goes
	// through the original RefCountClass allocator; we release it at the end.
	constexpr int kStage = 1;
	EnvironmentMapperClass *mapper = NEW_REF(EnvironmentMapperClass, (kStage));
	check(mapper != nullptr, "EnvironmentMapperClass allocation failed");
	if (mapper != nullptr) {
		check(mapper->Mapper_ID() == TextureMapperClass::MAPPER_ID_ENVIRONMENT,
			"Mapper_ID must be MAPPER_ID_ENVIRONMENT");
		check(mapper->Needs_Normals() == true,
			"EnvironmentMapperClass must request normals");
		check(mapper->Get_Stage() == kStage, "Get_Stage must report the construction stage");
	}

	const unsigned int set_transform_before = wasm_d3d8_get_state()->set_transform_calls;
	const unsigned int set_tss_before = wasm_d3d8_get_state()->set_texture_stage_state_calls;

	// Call the *real* Apply. After it returns, the D3DTS_TEXTURE0+kStage
	// transform and the stage TEXCOORDINDEX / TEXTURETRANSFORMFLAGS writes
	// have hit the wasm D3D8 shim device.
	if (mapper != nullptr) {
		mapper->Apply(0);
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();

	// ---------------------------------------------------------------------------
	// 1. Set_Transform landed on D3DTS_TEXTURE0 + kStage
	// ---------------------------------------------------------------------------
	check(state->last_set_transform_state == static_cast<D3DTRANSFORMSTATETYPE>(D3DTS_TEXTURE0 + kStage),
		"Apply did not target D3DTS_TEXTURE0 + Stage");
	check(state->set_transform_calls > set_transform_before,
		"Apply did not issue a Set_Transform call");

	// ---------------------------------------------------------------------------
	// 2. stage TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR
	// ---------------------------------------------------------------------------
	DWORD stage_texcoord_index = 0;
	if (device != nullptr) {
		device->GetTextureStageState(kStage, D3DTSS_TEXCOORDINDEX, &stage_texcoord_index);
	}
	check(stage_texcoord_index == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
		"stage TEXCOORDINDEX must be CAMERASPACEREFLECTIONVECTOR");

	// ---------------------------------------------------------------------------
	// 3. stage TEXTURETRANSFORMFLAGS == D3DTTFF_COUNT2
	// ---------------------------------------------------------------------------
	DWORD stage_transform_flags = 0;
	if (device != nullptr) {
		device->GetTextureStageState(kStage, D3DTSS_TEXTURETRANSFORMFLAGS, &stage_transform_flags);
	}
	constexpr DWORD kExpectedFlags = D3DTTFF_COUNT2;
	check(stage_transform_flags == kExpectedFlags,
		"stage TEXTURETRANSFORMFLAGS must be COUNT2");

	// Sanity: Apply actually exercised the stage-state path.
	check(state->set_texture_stage_state_calls >= set_tss_before + 2,
		"Apply did not issue the expected Set_DX8_Texture_Stage_State calls");

	// ---------------------------------------------------------------------------
	// 4. Texture transform matrix on the device matches
	//    transpose(Calculate_Texture_Matrix(...)), accounting for DX8Wrapper
	//    Set_Transform transpose behavior for non-WORLD/VIEW transform states.
	// ---------------------------------------------------------------------------
	D3DMATRIX expected = {};
	if (mapper != nullptr) {
		expected_device_matrix(*mapper, expected);
	}
	D3DMATRIX actual = {};
	if (device != nullptr) {
		device->GetTransform(static_cast<D3DTRANSFORMSTATETYPE>(D3DTS_TEXTURE0 + kStage), &actual);
	}
	bool matrix_match = true;
	for (int r = 0; r < 4 && matrix_match; ++r) {
		for (int c = 0; c < 4; ++c) {
			if (!nearf(actual.m[r][c], expected.m[r][c])) {
				matrix_match = false;
				break;
			}
		}
	}
	check(matrix_match, "texture transform matrix must match transpose(Calculate_Texture_Matrix)");

	if (mapper != nullptr) {
		mapper->Release_Ref();
	}

	WW3D::Shutdown();

	if (g_failures) {
		std::fprintf(stderr, "environment-mapper-apply-smoke: failures reported above\n");
		return 1;
	}

	std::printf(
		"{\"ok\":true,\"smoke\":\"environment-mapper-apply\","
		"\"source\":\"GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp EnvironmentMapperClass::Apply\","
		"\"stage\":%d,"
		"\"transformState\":%lu,"
		"\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,"
		"\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,"
		"\"matrixMatch\":%s,"
		"\"expectedMatrix\":[[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f]],"
		"\"setTransform\":%u,\"setTextureStageState\":%u}\n",
		kStage,
		static_cast<unsigned long>(state->last_set_transform_state),
		static_cast<unsigned long>(stage_texcoord_index),
		static_cast<unsigned long>(static_cast<DWORD>(D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR)),
		static_cast<unsigned long>(stage_transform_flags),
		static_cast<unsigned long>(kExpectedFlags),
		matrix_match ? "true" : "false",
		expected.m[0][0], expected.m[0][1], expected.m[0][2], expected.m[0][3],
		expected.m[1][0], expected.m[1][1], expected.m[1][2], expected.m[1][3],
		expected.m[2][0], expected.m[2][1], expected.m[2][2], expected.m[2][3],
		expected.m[3][0], expected.m[3][1], expected.m[3][2], expected.m[3][3],
		state->set_transform_calls,
		state->set_texture_stage_state_calls);
	return 0;
}
