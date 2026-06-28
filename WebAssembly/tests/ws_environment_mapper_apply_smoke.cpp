// Smoke: exercise the *original* WW3D2 world-space environment mapper
// Apply paths
// (GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp) under the
// Emscripten/wasm D3D8 shim, with the original DX8Wrapper initialized just
// enough that the original Set_Transform / Set_DX8_Texture_Stage_State writes
// reach the shim D3D8 device.
//
// This is deliberately separate from the browser harness and from any future
// WebGL2 fixed-function / shader bridge: it pins the (texture-stage transform,
// TEXCOORDINDEX, TEXTURETRANSFORMFLAGS) contract that BOTH world-space
// environment mapper Apply() implementations emit so a future browser
// camera-space normal / reflection-vector world-space environment-map bridge
// can diff against the real emission rather than a hand-written approximation.
// We do NOT stub or reimplement Apply or Calculate_Texture_Matrix; we
// construct the real mappers on a nonzero stage and call the real Apply().
//
// Covered original classes:
//   * WSClassicEnvironmentMapperClass::Apply => stage D3DTSS_TEXCOORDINDEX ==
//     D3DTSS_TCI_CAMERASPACENORMAL, MAPPER_ID_WS_CLASSIC_ENVIRONMENT, axis X.
//   * WSEnvironmentMapperClass::Apply => stage D3DTSS_TEXCOORDINDEX ==
//     D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR, MAPPER_ID_WS_ENVIRONMENT, axis Y.
//
// Verified contracts (on a nonzero stage, both classes):
//   * Mapper_ID() matches the class-specific WS environment ID.
//   * Needs_Normals() == true.
//   * Get_Stage() == construction stage.
//   * Set_Transform landed on D3DTS_TEXTURE0 + Stage (exactly one call).
//   * stage D3DTSS_TEXTURETRANSFORMFLAGS == D3DTTFF_COUNT2.
//   * Apply issues exactly two Set_DX8_Texture_Stage_State calls.
//   * the texture transform matrix written to the device equals
//     transpose(Calculate_Texture_Matrix(...)) -- accounting for the
//     DX8Wrapper::Set_Transform transpose behavior (DX8Wrapper transposes a
//     Matrix4x4 before handing it to the D3D8 device for non-WORLD/VIEW
//     transform states such as D3DTS_TEXTURE0+Stage).
//
// Inverse-view path coverage:
//   WSEnvMapperClass::Calculate_Texture_Matrix multiplies the canonical
//   environment-map matrix by the inverse of the D3DTS_VIEW transform
//   (mat2 = transpose of the view rotation rows). To prove that path -- and
//   not just the canonical matrix -- we install a deterministic NON-IDENTITY
//   D3DTS_VIEW rotation matrix via DX8Wrapper::Set_Transform before deriving
//   the expected matrix. DX8Wrapper::Set_Transform transposes for D3DTS_VIEW
//   into its cached render_state.view; Get_Transform transposes back, so
//   Calculate_Texture_Matrix observes exactly the view we installed. We then
//   derive the expected device matrix by calling the real
//   Calculate_Texture_Matrix() BEFORE Apply, and finally account for the
//   DX8Wrapper Set_Transform transpose behavior when reading back the device
//   matrix via IDirect3DDevice8::GetTransform.
//
// Determinism notes:
//   WSEnvMapperClass::Calculate_Texture_Matrix is fully static (no time term),
//   so the second Calculate_Texture_Matrix call inside Apply reproduces the
//   matrix Apply wrote, and the expected matrix derived before Apply is a
//   faithful diff target.

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

// Install a deterministic NON-IDENTITY D3DTS_VIEW transform so
// WSEnvMapperClass::Calculate_Texture_Matrix exercises the inverse-view
// multiplication path. We use a 30-degree rotation about the Y axis, which is
// orthonormal, so mat2 (the transpose of the view rotation rows) is the
// inverse rotation -- distinct from the canonical identity-derived matrix.
void install_deterministic_view()
{
	const float c = 0.8660254037844386f; // cos(30deg)
	const float s = 0.5f;                // sin(30deg)
	Matrix4x4 view;
	// RotationY: rows = [c,0,s,0], [0,1,0,0], [-s,0,c,0], [0,0,0,1]
	view.Init(	c,  0.0f, s,   0.0f,
				0.0f, 1.0f, 0.0f, 0.0f,
				-s, 0.0f, c,   0.0f,
				0.0f, 0.0f, 0.0f, 1.0f);
	DX8Wrapper::Set_Transform(D3DTS_VIEW, view);
}

// Compute the D3DMATRIX the device is expected to hold after Apply(). The
// original DX8Wrapper::Set_Transform(D3DTS_TEXTURE0+Stage, Matrix4x4)
// transposes the Westwood-convention Matrix4x4 before issuing the D3D8
// SetTransform call (see dx8wrapper.h, non-WORLD/VIEW default branch). So the
// matrix stored on the device equals transpose(Calculate_Texture_Matrix(...)).
// We compute it here from the real Calculate_Texture_Matrix (which itself folds
// in the deterministic non-identity view installed above) so this smoke stays
// correct if the original matrix ever changes.
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

// Per-branch result so main() can emit a combined JSON summary.
struct BranchResult
{
	DWORD tex_coord_index;
	DWORD expected_tex_coord_index;
	DWORD texture_transform_flags;
	bool matrix_match;
	unsigned int set_transform_delta;
	unsigned int set_texture_stage_state_delta;
	D3DMATRIX expected_matrix;
};

// Drive one world-space environment mapper through the full Apply() contract
// and return the observed device state for the branch summary.
template <typename MapperType>
BranchResult run_branch(MapperType *mapper, int stage, DWORD expected_tci,
	int expected_mapper_id)
{
	BranchResult result = {};
	result.expected_tex_coord_index = expected_tci;
	result.texture_transform_flags = 0;
	result.matrix_match = false;
	result.set_transform_delta = 0;
	result.set_texture_stage_state_delta = 0;

	IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();

	// Metadata contracts shared by both classes.
	check(mapper->Mapper_ID() == expected_mapper_id,
		"Mapper_ID must match the class-specific WS environment mapper ID");
	check(mapper->Needs_Normals() == true,
		"world-space environment mapper must request normals");
	check(mapper->Get_Stage() == stage,
		"Get_Stage must report the construction stage");

	// Install the deterministic non-identity view so the inverse-view
	// multiplication path in Calculate_Texture_Matrix produces a non-canonical
	// matrix the smoke can faithfully diff.
	install_deterministic_view();

	// Derive the expected device matrix from the *real*
	// Calculate_Texture_Matrix BEFORE Apply, so we diff Apply's emission
	// against the original matrix derivation (which now folds in the
	// non-identity view) rather than a hand approximation.
	D3DMATRIX expected = {};
	expected_device_matrix(*mapper, expected);
	result.expected_matrix = expected;

	// DX8Wrapper::Set_DX8_Texture_Stage_State caches per-stage state and skips
	// writes whose value is unchanged. The previous branch leaves the stage's
	// TEXTURETRANSFORMFLAGS at D3DTTFF_COUNT2, so a naive re-Apply on the same
	// stage would skip that write and make the call delta non-deterministic.
	// Seed the stage with distinct values (mirroring the edge-mapper smoke) so
	// Apply is forced to re-issue both stage-state writes from baseline.
	DX8Wrapper::Set_DX8_Texture_Stage_State(stage, D3DTSS_TEXCOORDINDEX, D3DTSS_TCI_PASSTHRU | 0);
	DX8Wrapper::Set_DX8_Texture_Stage_State(stage, D3DTSS_TEXTURETRANSFORMFLAGS, D3DTTFF_DISABLE);

	// Record baseline counters AFTER seeding so the seeding writes do not
	// pollute the Apply() delta assertions.
	const unsigned int set_transform_before = wasm_d3d8_get_state()->set_transform_calls;
	const unsigned int set_tss_before = wasm_d3d8_get_state()->set_texture_stage_state_calls;

	// Call the *real* Apply. After it returns, the D3DTS_TEXTURE0+stage
	// transform and the stage TEXCOORDINDEX / TEXTURETRANSFORMFLAGS writes
	// have hit the wasm D3D8 shim device. With the stage seeded to distinct
	// values, the cached-state path lets Apply emit exactly one Set_Transform
	// and two Set_DX8_Texture_Stage_State calls.
	mapper->Apply(0);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();

	// Set_Transform landed on D3DTS_TEXTURE0 + stage.
	check(state->last_set_transform_state == static_cast<D3DTRANSFORMSTATETYPE>(D3DTS_TEXTURE0 + stage),
		"Apply did not target D3DTS_TEXTURE0 + Stage");
	result.set_transform_delta = state->set_transform_calls - set_transform_before;
	check(result.set_transform_delta == 1u,
		"Apply must issue exactly one Set_Transform call");

	// stage TEXCOORDINDEX matches the class's expected TCI.
	DWORD stage_texcoord_index = 0;
	if (device != nullptr) {
		device->GetTextureStageState(stage, D3DTSS_TEXCOORDINDEX, &stage_texcoord_index);
	}
	result.tex_coord_index = stage_texcoord_index;
	check(stage_texcoord_index == expected_tci,
		"stage TEXCOORDINDEX must match the class's expected camera-space source");

	// stage TEXTURETRANSFORMFLAGS == D3DTTFF_COUNT2.
	DWORD stage_transform_flags = 0;
	if (device != nullptr) {
		device->GetTextureStageState(stage, D3DTSS_TEXTURETRANSFORMFLAGS, &stage_transform_flags);
	}
	constexpr DWORD kExpectedFlags = D3DTTFF_COUNT2;
	result.texture_transform_flags = stage_transform_flags;
	check(stage_transform_flags == kExpectedFlags,
		"stage TEXTURETRANSFORMFLAGS must be COUNT2");

	// With the stage seeded, Apply must emit exactly the two stage-state
	// writes (TEXCOORDINDEX + TEXTURETRANSFORMFLAGS).
	result.set_texture_stage_state_delta = state->set_texture_stage_state_calls - set_tss_before;
	check(result.set_texture_stage_state_delta == 2u,
		"Apply must issue exactly two Set_DX8_Texture_Stage_State calls");

	// Texture transform matrix on the device matches
	// transpose(Calculate_Texture_Matrix(...)), accounting for DX8Wrapper
	// Set_Transform transpose behavior for non-WORLD/VIEW transform states.
	D3DMATRIX actual = {};
	if (device != nullptr) {
		device->GetTransform(static_cast<D3DTRANSFORMSTATETYPE>(D3DTS_TEXTURE0 + stage), &actual);
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
	result.matrix_match = matrix_match;
	check(matrix_match, "texture transform matrix must match transpose(Calculate_Texture_Matrix)");

	return result;
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

	constexpr int kStage = 1;

	// -------------------------------------------------------------------------
	// Branch 1: WSClassicEnvironmentMapperClass, axis X.
	//   Apply() => stage TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACENORMAL,
	//   MAPPER_ID_WS_CLASSIC_ENVIRONMENT.
	// -------------------------------------------------------------------------
	WSClassicEnvironmentMapperClass *classic_mapper =
		NEW_REF(WSClassicEnvironmentMapperClass, (WSEnvMapperClass::AXISTYPE_X, kStage));
	check(classic_mapper != nullptr, "WSClassicEnvironmentMapperClass allocation failed");
	BranchResult classic_branch = {};
	if (classic_mapper != nullptr) {
		classic_branch = run_branch(classic_mapper, kStage, D3DTSS_TCI_CAMERASPACENORMAL,
			TextureMapperClass::MAPPER_ID_WS_CLASSIC_ENVIRONMENT);
		classic_mapper->Release_Ref();
	}

	// -------------------------------------------------------------------------
	// Branch 2: WSEnvironmentMapperClass, axis Y.
	//   Apply() => stage TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
	//   MAPPER_ID_WS_ENVIRONMENT.
	// -------------------------------------------------------------------------
	WSEnvironmentMapperClass *env_mapper =
		NEW_REF(WSEnvironmentMapperClass, (WSEnvMapperClass::AXISTYPE_Y, kStage));
	check(env_mapper != nullptr, "WSEnvironmentMapperClass allocation failed");
	BranchResult env_branch = {};
	if (env_mapper != nullptr) {
		env_branch = run_branch(env_mapper, kStage, D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
			TextureMapperClass::MAPPER_ID_WS_ENVIRONMENT);
		env_mapper->Release_Ref();
	}

	WW3D::Shutdown();

	if (g_failures) {
		std::fprintf(stderr, "ws-environment-mapper-apply-smoke: failures reported above\n");
		return 1;
	}

	auto print_matrix = [](const D3DMATRIX &m) {
		std::printf("[[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f]]",
			m.m[0][0], m.m[0][1], m.m[0][2], m.m[0][3],
			m.m[1][0], m.m[1][1], m.m[1][2], m.m[1][3],
			m.m[2][0], m.m[2][1], m.m[2][2], m.m[2][3],
			m.m[3][0], m.m[3][1], m.m[3][2], m.m[3][3]);
	};

	std::printf("{\"ok\":true,\"smoke\":\"ws-environment-mapper-apply\",");
	std::printf("\"source\":\"GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp WSClassicEnvironmentMapperClass::Apply + WSEnvironmentMapperClass::Apply\",");
	std::printf("\"stage\":%d,", kStage);
	std::printf("\"branches\":{");
	std::printf("\"wsClassicAxisX\":{\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,\"matrixMatch\":%s,\"expectedMatrix\":",
		static_cast<unsigned long>(classic_branch.tex_coord_index),
		static_cast<unsigned long>(classic_branch.expected_tex_coord_index),
		static_cast<unsigned long>(classic_branch.texture_transform_flags),
		static_cast<unsigned long>(static_cast<DWORD>(D3DTTFF_COUNT2)),
		classic_branch.matrix_match ? "true" : "false");
	print_matrix(classic_branch.expected_matrix);
	std::printf(",\"setTransform\":%u,\"setTextureStageState\":%u},",
		classic_branch.set_transform_delta,
		classic_branch.set_texture_stage_state_delta);
	std::printf("\"wsEnvironmentAxisY\":{\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,\"matrixMatch\":%s,\"expectedMatrix\":",
		static_cast<unsigned long>(env_branch.tex_coord_index),
		static_cast<unsigned long>(env_branch.expected_tex_coord_index),
		static_cast<unsigned long>(env_branch.texture_transform_flags),
		static_cast<unsigned long>(static_cast<DWORD>(D3DTTFF_COUNT2)),
		env_branch.matrix_match ? "true" : "false");
	print_matrix(env_branch.expected_matrix);
	std::printf(",\"setTransform\":%u,\"setTextureStageState\":%u}",
		env_branch.set_transform_delta,
		env_branch.set_texture_stage_state_delta);
	std::printf("}}\n");
	return 0;
}
