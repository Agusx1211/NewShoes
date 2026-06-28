// Smoke: exercise the *original* WW3D2 grid world-space environment mapper
// Apply paths
// (GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp) under the
// Emscripten/wasm D3D8 shim, with the original DX8Wrapper initialized just
// enough that the original Set_Transform / Set_DX8_Texture_Stage_State writes
// reach the shim D3D8 device.
//
// GridWSEnvMapperClass::Calculate_Texture_Matrix combines the grid UV-offset
// math inherited from GridTextureMapperClass with the inverse-view
// multiplication path inherited from the world-space environment mappers. This
// smoke therefore exercises BOTH contracts at once: deterministic grid-cell UV
// offsets (driven by the distinct construction offsets 5 and 10 on a 4x4 grid)
// AND a deterministic non-identity D3DTS_VIEW transform that proves the
// inverse-view multiplication path actually runs.
//
// This is deliberately separate from the browser harness and from any future
// WebGL2 fixed-function / shader bridge: it pins the (texture-stage transform,
// TEXCOORDINDEX, TEXTURETRANSFORMFLAGS) contract that BOTH grid world-space
// environment mapper Apply() implementations emit so a future browser
// camera-space normal / reflection-vector grid world-space environment-map
// bridge can diff against the real emission rather than a hand-written
// approximation. We do NOT stub or reimplement Apply or
// Calculate_Texture_Matrix; we construct the real mappers on a nonzero stage
// and call the real Apply().
//
// Covered original classes:
//   * GridWSClassicEnvironmentMapperClass::Apply => stage D3DTSS_TEXCOORDINDEX
//     == D3DTSS_TCI_CAMERASPACENORMAL, MAPPER_ID_GRID_WS_CLASSIC_ENVIRONMENT,
//     axis X.
//   * GridWSEnvironmentMapperClass::Apply => stage D3DTSS_TEXCOORDINDEX ==
//     D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR, MAPPER_ID_GRID_WS_ENVIRONMENT,
//     axis Y.
//
// Verified contracts (on a nonzero stage, both classes):
//   * Mapper_ID() matches the class-specific grid WS environment ID.
//   * Needs_Normals() == true.
//   * Is_Time_Variant() == true.
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
//   GridWSEnvMapperClass::Calculate_Texture_Matrix multiplies the canonical
//   grid environment-map matrix by the inverse of the D3DTS_VIEW transform
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
//   * GridTextureMapperClass::initialize sets Sign=0 when fps == 0.0f, which
//     makes update_temporal_state's new_frame = CurrentFrame + ... * Sign a
//     no-op regardless of WW3D::Get_Sync_Time, so the second
//     Calculate_Texture_Matrix call (the one inside Apply, after we already
//     derived the expected matrix) reproduces the matrix Apply wrote.
//   * With gridwidth_log2=2 the grid is 4x4 (16 cells), OOGridWidth = 0.25,
//     del = 0.5 * OOGridWidth = 0.125. last_frame == 0 makes
//     GridTextureMapperClass::initialize expand it to grid_width * grid_width
//     (16). Offset 5 maps to grid cell (x=1,y=1), offset 10 maps to grid cell
//     (x=2,y=2); the resulting matrix translations (0.375/0.375 vs
//     0.625/0.625) prove the grid-cell UV offset math rather than a
//     coincidental identity.

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
// GridWSEnvMapperClass::Calculate_Texture_Matrix exercises the inverse-view
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
// We compute it here from the real Calculate_Texture_Matrix (which itself
// folds in the deterministic non-identity view and the grid-cell UV offset
// installed above) so this smoke stays correct if the original matrix ever
// changes. With fps == 0.0f the second Calculate_Texture_Matrix call (inside
// Apply) reproduces the matrix Apply wrote, so this expected matrix is a
// faithful diff target.
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

// Drive one grid world-space environment mapper through the full Apply()
// contract and return the observed device state for the branch summary.
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
		"Mapper_ID must match the class-specific grid WS environment mapper ID");
	check(mapper->Needs_Normals() == true,
		"grid world-space environment mapper must request normals");
	check(mapper->Is_Time_Variant() == true,
		"grid world-space environment mapper must be time variant");
	check(mapper->Get_Stage() == stage,
		"Get_Stage must report the construction stage");

	// Install the deterministic non-identity view so the inverse-view
	// multiplication path in Calculate_Texture_Matrix produces a non-canonical
	// matrix the smoke can faithfully diff.
	install_deterministic_view();

	// Derive the expected device matrix from the *real*
	// Calculate_Texture_Matrix BEFORE Apply, so we diff Apply's emission
	// against the original matrix derivation (which now folds in the
	// non-identity view and the grid-cell UV offset) rather than a hand
	// approximation.
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
	// Deterministic construction parameters shared by both branches. fps == 0
	// zeroes update_temporal_state's frame advance, gridwidth_log2 == 2 yields
	// a 4x4 grid (16 cells, OOGridWidth = 0.25, del = 0.125), and last_frame
	// == 0 makes GridTextureMapperClass::initialize expand it to grid_width *
	// grid_width (16). Distinct offsets (5 and 10) force distinct grid-cell UV
	// offsets so the matrix proves grid-cell UV offset math.
	constexpr float kFps = 0.0f;
	constexpr unsigned int kGridWidthLog2 = 2;
	constexpr unsigned int kLastFrame = 0;

	// -------------------------------------------------------------------------
	// Branch 1: GridWSClassicEnvironmentMapperClass, offset 5, axis X.
	//   Apply() => stage TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACENORMAL,
	//   MAPPER_ID_GRID_WS_CLASSIC_ENVIRONMENT.
	//   Cell: x = 5 & 3 = 1, y = (5 & 0xC) >> 2 = 1 => u=v=0.25.
	// -------------------------------------------------------------------------
	constexpr unsigned int kClassicOffset = 5;
	GridWSClassicEnvironmentMapperClass *classic_mapper =
		NEW_REF(GridWSClassicEnvironmentMapperClass, (kFps, kGridWidthLog2, kLastFrame, kClassicOffset, GridWSEnvMapperClass::AXISTYPE_X, kStage));
	check(classic_mapper != nullptr, "GridWSClassicEnvironmentMapperClass allocation failed");
	BranchResult classic_branch = {};
	if (classic_mapper != nullptr) {
		classic_branch = run_branch(classic_mapper, kStage, D3DTSS_TCI_CAMERASPACENORMAL,
			TextureMapperClass::MAPPER_ID_GRID_WS_CLASSIC_ENVIRONMENT);
		classic_mapper->Release_Ref();
	}

	// -------------------------------------------------------------------------
	// Branch 2: GridWSEnvironmentMapperClass, offset 10, axis Y.
	//   Apply() => stage TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
	//   MAPPER_ID_GRID_WS_ENVIRONMENT.
	//   Cell: x = 10 & 3 = 2, y = (10 & 0xC) >> 2 = 2 => u=v=0.5.
	// -------------------------------------------------------------------------
	constexpr unsigned int kGridOffset = 10;
	GridWSEnvironmentMapperClass *env_mapper =
		NEW_REF(GridWSEnvironmentMapperClass, (kFps, kGridWidthLog2, kLastFrame, kGridOffset, GridWSEnvMapperClass::AXISTYPE_Y, kStage));
	check(env_mapper != nullptr, "GridWSEnvironmentMapperClass allocation failed");
	BranchResult env_branch = {};
	if (env_mapper != nullptr) {
		env_branch = run_branch(env_mapper, kStage, D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
			TextureMapperClass::MAPPER_ID_GRID_WS_ENVIRONMENT);
		env_mapper->Release_Ref();
	}

	WW3D::Shutdown();

	if (g_failures) {
		std::fprintf(stderr, "grid-ws-environment-mapper-apply-smoke: failures reported above\n");
		return 1;
	}

	auto print_matrix = [](const D3DMATRIX &m) {
		std::printf("[[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f]]",
			m.m[0][0], m.m[0][1], m.m[0][2], m.m[0][3],
			m.m[1][0], m.m[1][1], m.m[1][2], m.m[1][3],
			m.m[2][0], m.m[2][1], m.m[2][2], m.m[2][3],
			m.m[3][0], m.m[3][1], m.m[3][2], m.m[3][3]);
	};

	std::printf("{\"ok\":true,\"smoke\":\"grid-ws-environment-mapper-apply\",");
	std::printf("\"source\":\"GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp GridWSClassicEnvironmentMapperClass::Apply + GridWSEnvironmentMapperClass::Apply\",");
	std::printf("\"stage\":%d,\"fps\":%.1f,\"gridWidthLog2\":%u,\"lastFrame\":%u,",
		kStage, kFps, kGridWidthLog2, kLastFrame);
	std::printf("\"gridWidth\":%u,\"ooGridWidth\":%.4f,\"del\":%.4f,",
		1u << kGridWidthLog2, 1.0f / static_cast<float>(1u << kGridWidthLog2),
		0.5f / static_cast<float>(1u << kGridWidthLog2));
	std::printf("\"branches\":{");
	std::printf("\"gridWSClassicAxisX\":{\"offset\":%u,\"cell\":[1,1],\"uvOffset\":[0.25,0.25],",
		kClassicOffset);
	std::printf("\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,\"matrixMatch\":%s,\"expectedMatrix\":",
		static_cast<unsigned long>(classic_branch.tex_coord_index),
		static_cast<unsigned long>(classic_branch.expected_tex_coord_index),
		static_cast<unsigned long>(classic_branch.texture_transform_flags),
		static_cast<unsigned long>(static_cast<DWORD>(D3DTTFF_COUNT2)),
		classic_branch.matrix_match ? "true" : "false");
	print_matrix(classic_branch.expected_matrix);
	std::printf(",\"setTransform\":%u,\"setTextureStageState\":%u},",
		classic_branch.set_transform_delta,
		classic_branch.set_texture_stage_state_delta);
	std::printf("\"gridWSEnvironmentAxisY\":{\"offset\":%u,\"cell\":[2,2],\"uvOffset\":[0.5,0.5],",
		kGridOffset);
	std::printf("\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,\"matrixMatch\":%s,\"expectedMatrix\":",
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
