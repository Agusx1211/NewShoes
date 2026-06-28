// Smoke: exercise the *original* WW3D2 EdgeMapperClass::Apply path
// (GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp) under the
// Emscripten/wasm D3D8 shim, with the original DX8Wrapper initialized just
// enough that the original Set_Transform / Set_DX8_Texture_Stage_State writes
// reach the shim D3D8 device.
//
// This is deliberately separate from the browser harness and from any future
// WebGL2 fixed-function / shader bridge: it pins the (texture-stage transform,
// TEXCOORDINDEX, TEXTURETRANSFORMFLAGS) contract that EdgeMapperClass::Apply
// emits for BOTH original TEXCOORDINDEX branches so a future browser
// camera-space normal / reflection-vector edge-map bridge can diff against the
// real emission rather than a hand-written approximation. We do NOT stub or
// reimplement Apply or Calculate_Texture_Matrix; we construct the real
// EdgeMapperClass and call the real Apply().
//
// Verified contracts (on a nonzero stage):
//   * Mapper_ID() == MAPPER_ID_EDGE
//   * Needs_Normals() == true
//   * Is_Time_Variant() == true
//   * Set_Transform landed on D3DTS_TEXTURE0 + Stage (both branches)
//   * stage D3DTSS_TEXTURETRANSFORMFLAGS == D3DTTFF_COUNT2 (both branches)
//   * default EdgeMapperClass(stage) (UseReflect=false) => stage
//     D3DTSS_TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACENORMAL
//   * INI EdgeMapperClass(ini, "Args", stage) with UseReflect=true =>
//     stage D3DTSS_TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR
//   * the texture transform matrix written to the device equals
//     transpose(Calculate_Texture_Matrix(...)) -- accounting for the
//     DX8Wrapper::Set_Transform transpose behavior (DX8Wrapper transposes a
//     Matrix4x4 before handing it to the D3D8 device for non-WORLD/VIEW
//     transform states such as D3DTS_TEXTURE0+Stage).
//
// Determinism notes:
//   * EdgeMapperClass::Calculate_Texture_Matrix advances VOffset by
//     delta*VSpeed where delta = (now - LastUsedSyncTime) * 0.001, then folds
//     VOffset into [0,1) via VOffset -= WWMath::Floor(VOffset). We construct
//     both mappers with VPerSec == 0 (the INI branch reads "VPerSec=0.0"), so
//     the time-dependent term vanishes and the fold is idempotent; therefore
//     the second Calculate_Texture_Matrix call (the one inside Apply after we
//     already derived the expected matrix) reproduces the matrix Apply wrote.
//   * The INI branch seeds a nonzero VStart already inside [0,1), so the fold
//     is a no-op while still exercising the nonzero VOffset matrix entry.

#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "dx8wrapper.h"
#include "ini.h"
#include "mapper.h"
#include "matrix4.h"
#include "straw.h"
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
// SetTransform call (see dx8wrapper.h, non-WORLD/VIEW default branch). So the
// matrix stored on the device equals transpose(Calculate_Texture_Matrix(...)).
// We compute it here from the real Calculate_Texture_Matrix so this smoke
// stays correct if the original matrix ever changes. With VPerSec == 0 and a
// VOffset already in [0,1), the second Calculate_Texture_Matrix call (inside
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

// Minimal in-memory Straw so we can drive the real WWLib INIClass::Load from a
// fixed INI string without touching the filesystem (mirrors the
// wwlib_file_ini_smoke pattern).
class MemoryStraw : public Straw
{
public:
	MemoryStraw(const char *source, int length) : Source(source), Length(length), Position(0) { }
	int Get(void *dest, int length) override
	{
		if (dest == nullptr || length <= 0) {
			return 0;
		}
		int remaining = Length - Position;
		int to_copy = (length < remaining) ? length : remaining;
		if (to_copy <= 0) {
			return 0;
		}
		std::memcpy(dest, Source + Position, static_cast<size_t>(to_copy));
		Position += to_copy;
		return to_copy;
	}

private:
	const char *Source;
	int Length;
	int Position;
};

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

// Drive one EdgeMapperClass instance through the full Apply() contract and
// return the observed device state for the branch summary.
BranchResult run_branch(EdgeMapperClass *mapper, int stage, DWORD expected_tci)
{
	BranchResult result = {};
	result.expected_tex_coord_index = expected_tci;
	result.texture_transform_flags = 0;
	result.matrix_match = false;
	result.set_transform_delta = 0;
	result.set_texture_stage_state_delta = 0;

	IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();

	// Metadata contracts shared by both branches.
	check(mapper->Mapper_ID() == TextureMapperClass::MAPPER_ID_EDGE,
		"Mapper_ID must be MAPPER_ID_EDGE");
	check(mapper->Needs_Normals() == true, "EdgeMapperClass must request normals");
	check(mapper->Is_Time_Variant() == true, "EdgeMapperClass must be time variant");
	check(mapper->Get_Stage() == stage,
		"Get_Stage must report the construction stage");

	// Derive the expected device matrix from the *real*
	// Calculate_Texture_Matrix BEFORE Apply, so we diff Apply's emission
	// against the original matrix derivation rather than a hand approximation.
	D3DMATRIX expected = {};
	expected_device_matrix(*mapper, expected);
	result.expected_matrix = expected;

	// DX8Wrapper::Set_DX8_Texture_Stage_State caches per-stage state and skips
	// writes whose value is unchanged. The previous branch leaves the stage's
	// TEXTURETRANSFORMFLAGS at D3DTTFF_COUNT2, so a naive re-Apply on the same
	// stage would skip that write and make the call delta non-deterministic.
	// Seed the stage with distinct values (mirroring the browser mapper probes)
	// so Apply is forced to re-issue both stage-state writes from baseline.
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

	// stage TEXCOORDINDEX matches the branch's expected TCI.
	DWORD stage_texcoord_index = 0;
	if (device != nullptr) {
		device->GetTextureStageState(stage, D3DTSS_TEXCOORDINDEX, &stage_texcoord_index);
	}
	result.tex_coord_index = stage_texcoord_index;
	check(stage_texcoord_index == expected_tci,
		"stage TEXCOORDINDEX must match the branch's expected camera-space source");

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
	// Branch 1: default EdgeMapperClass(stage).
	//   UseReflect defaults to false => D3DTSS_TCI_CAMERASPACENORMAL.
	// -------------------------------------------------------------------------
	EdgeMapperClass *default_mapper = NEW_REF(EdgeMapperClass, (kStage));
	check(default_mapper != nullptr, "EdgeMapperClass default allocation failed");
	BranchResult normal_branch = {};
	if (default_mapper != nullptr) {
		normal_branch = run_branch(default_mapper, kStage, D3DTSS_TCI_CAMERASPACENORMAL);
		default_mapper->Release_Ref();
	}

	// -------------------------------------------------------------------------
	// Branch 2: INI EdgeMapperClass(ini, "Args", stage) with
	//   UseReflect=true, VPerSec=0, VStart nonzero.
	//   UseReflect=true => D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR.
	// -------------------------------------------------------------------------
	const char ini_text[] =
		"[Args]\n"
		"VPerSec=0.0\n"
		"VStart=0.25\n"
		"UseReflect=yes\n";
	MemoryStraw ini_source(ini_text, static_cast<int>(sizeof(ini_text) - 1));
	INIClass ini;
	if (!expect(ini.Load(ini_source) != 0, "INIClass Load(Straw) failed for edge-mapper branch 2")) {
		WW3D::Shutdown();
		return 1;
	}

	EdgeMapperClass *ini_mapper = NEW_REF(EdgeMapperClass, (ini, "Args", kStage));
	check(ini_mapper != nullptr, "EdgeMapperClass INI allocation failed");
	BranchResult reflect_branch = {};
	if (ini_mapper != nullptr) {
		reflect_branch = run_branch(ini_mapper, kStage, D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR);
		ini_mapper->Release_Ref();
	}

	WW3D::Shutdown();

	if (g_failures) {
		std::fprintf(stderr, "edge-mapper-apply-smoke: failures reported above\n");
		return 1;
	}

	auto print_matrix = [](const D3DMATRIX &m) {
		std::printf("[[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f],[%.4f,%.4f,%.4f,%.4f]]",
			m.m[0][0], m.m[0][1], m.m[0][2], m.m[0][3],
			m.m[1][0], m.m[1][1], m.m[1][2], m.m[1][3],
			m.m[2][0], m.m[2][1], m.m[2][2], m.m[2][3],
			m.m[3][0], m.m[3][1], m.m[3][2], m.m[3][3]);
	};

	std::printf("{\"ok\":true,\"smoke\":\"edge-mapper-apply\",");
	std::printf("\"source\":\"GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/mapper.cpp EdgeMapperClass::Apply\",");
	std::printf("\"stage\":%d,", kStage);
	std::printf("\"branches\":{");
	std::printf("\"normal\":{\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,\"matrixMatch\":%s,\"expectedMatrix\":",
		static_cast<unsigned long>(normal_branch.tex_coord_index),
		static_cast<unsigned long>(normal_branch.expected_tex_coord_index),
		static_cast<unsigned long>(normal_branch.texture_transform_flags),
		static_cast<unsigned long>(static_cast<DWORD>(D3DTTFF_COUNT2)),
		normal_branch.matrix_match ? "true" : "false");
	print_matrix(normal_branch.expected_matrix);
	std::printf(",\"setTransform\":%u,\"setTextureStageState\":%u},",
		normal_branch.set_transform_delta,
		normal_branch.set_texture_stage_state_delta);
	std::printf("\"reflect\":{\"texCoordIndex\":%lu,\"expectedTexCoordIndex\":%lu,\"textureTransformFlags\":%lu,\"expectedTextureTransformFlags\":%lu,\"matrixMatch\":%s,\"expectedMatrix\":",
		static_cast<unsigned long>(reflect_branch.tex_coord_index),
		static_cast<unsigned long>(reflect_branch.expected_tex_coord_index),
		static_cast<unsigned long>(reflect_branch.texture_transform_flags),
		static_cast<unsigned long>(static_cast<DWORD>(D3DTTFF_COUNT2)),
		reflect_branch.matrix_match ? "true" : "false");
	print_matrix(reflect_branch.expected_matrix);
	std::printf(",\"setTransform\":%u,\"setTextureStageState\":%u}",
		reflect_branch.set_transform_delta,
		reflect_branch.set_texture_stage_state_delta);
	std::printf("}}\n");
	return 0;
}
