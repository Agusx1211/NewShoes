// Smoke: exercise the *original* WW3D2 MatrixMapperClass::Apply path
// (GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/matrixmapper.cpp) under the
// Emscripten/wasm D3D8 shim, with the original DX8Wrapper initialized just
// enough that the original Set_Transform / Set_DX8_Texture_Stage_State writes
// reach the shim D3D8 device.
//
// This is deliberately separate from the browser harness and from any future
// WebGL2 fixed-function / shader bridge: it pins the (texture-stage transform,
// TEXCOORDINDEX, TEXTURETRANSFORMFLAGS) contract that
// MatrixMapperClass::Apply emits so a future browser texture-projection bridge
// can diff against the real emission rather than a hand-written approximation.
// We do NOT stub or reimplement Apply; we construct the real
// MatrixMapperClass, configure a deterministic ViewToTexture transform via
// Set_Texture_Transform, and call the real Apply().
//
// Verified contracts (PERSPECTIVE_PROJECTION on a nonzero stage):
//   * D3DTS_TEXTURE0 + Stage transform was written to the device with a
//     PERSPECTIVE-style matrix (rows 0,1 = ViewToPixel[0],[1]; row 2 = row 3).
//   * D3DTSS_TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEPOSITION
//   * D3DTSS_TEXTURETRANSFORMFLAGS == (D3DTTFF_PROJECTED | D3DTTFF_COUNT3)
//
// Additional verified contract (ORTHO_PROJECTION, same instance, easy check):
//   * D3DTSS_TEXTURETRANSFORMFLAGS == D3DTTFF_COUNT2
//
// NOTE on naming: the task brief mentioned "POINT_LINE_PROJECTION"; the
// original GeneralsMD matrixmapper.h MappingType enum is { ORTHO_PROJECTION,
// PERSPECTIVE_PROJECTION, DEPTH_GRADIENT, NORMAL_GRADIENT } -- there is no
// POINT_LINE_PROJECTION type in this source, so the additional check covers
// the ORTHO_PROJECTION COUNT2 path that does exist.

#include <cstdio>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "dx8wrapper.h"
#include "matrix3d.h"
#include "matrixmapper.h"
#include "vector3.h"
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

bool matrix_is_identity(const D3DMATRIX &m)
{
	for (int r = 0; r < 4; ++r) {
		for (int c = 0; c < 4; ++c) {
			float want = (r == c) ? 1.0f : 0.0f;
			if (m.m[r][c] != want) {
				return false;
			}
		}
	}
	return true;
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

	// Construct the real MatrixMapperClass on a NONZERO stage (stage 1), as the
	// original TexProjectClass / ProjectorClass users do. NEW_REF goes through
	// the original RefCountClass allocator; we release it at the end.
	constexpr int kStage = 1;
	MatrixMapperClass *mapper = NEW_REF(MatrixMapperClass, (kStage));
	check(mapper != nullptr, "MatrixMapperClass allocation failed");

	if (mapper != nullptr) {
		// Configure a deterministic, non-identity ViewToTexture transform. We
		// use the Matrix3D overload of Set_Texture_Transform (which constructs
		// a Matrix4x4 internally) and a representative power-of-two texsize so
		// the Update_View_To_Pixel_Transform scaling factor K is well defined.
		Matrix3D view_to_texture(true); // identity
		view_to_texture.Translate(0.10f, 0.20f, 0.30f); // deterministic offset
		constexpr float kTexSize = 256.0f;
		mapper->Set_Texture_Transform(view_to_texture, kTexSize);
		mapper->Set_Type(MatrixMapperClass::PERSPECTIVE_PROJECTION);
	}

	const unsigned int set_transform_before = wasm_d3d8_get_state()->set_transform_calls;
	const unsigned int set_tss_before = wasm_d3d8_get_state()->set_texture_stage_state_calls;

	// Call the *real* Apply (PERSPECTIVE_PROJECTION). After it returns, the
	// D3DTS_TEXTURE0+kStage transform and the stage TEXCOORDINDEX /
	// TEXTURETRANSFORMFLAGS writes have hit the wasm D3D8 shim device.
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

	// The texture matrix emitted by PERSPECTIVE_PROJECTION is non-identity
	// (rows 0/1/2 are derived from the configured ViewToPixel).
	D3DMATRIX texture_matrix = {};
	if (device != nullptr) {
		device->GetTransform(static_cast<D3DTRANSFORMSTATETYPE>(D3DTS_TEXTURE0 + kStage), &texture_matrix);
	}
	check(!matrix_is_identity(texture_matrix),
		"PERSPECTIVE_PROJECTION texture matrix must be non-identity");

	// ---------------------------------------------------------------------------
	// 2. stage TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEPOSITION
	// ---------------------------------------------------------------------------
	DWORD stage_texcoord_index = 0;
	if (device != nullptr) {
		device->GetTextureStageState(kStage, D3DTSS_TEXCOORDINDEX, &stage_texcoord_index);
	}
	check(stage_texcoord_index == D3DTSS_TCI_CAMERASPACEPOSITION,
		"stage TEXCOORDINDEX must be CAMERASPACEPOSITION");

	// ---------------------------------------------------------------------------
	// 3. stage TEXTURETRANSFORMFLAGS == (D3DTTFF_PROJECTED | D3DTTFF_COUNT3)
	// ---------------------------------------------------------------------------
	DWORD stage_transform_flags = 0;
	if (device != nullptr) {
		device->GetTextureStageState(kStage, D3DTSS_TEXTURETRANSFORMFLAGS, &stage_transform_flags);
	}
	constexpr DWORD kExpectedPerspectiveFlags = D3DTTFF_PROJECTED | D3DTTFF_COUNT3;
	check(stage_transform_flags == kExpectedPerspectiveFlags,
		"PERSPECTIVE_PROJECTION TEXTURETRANSFORMFLAGS must be PROJECTED|COUNT3");

	// Sanity: Apply actually exercised the stage-state path.
	check(state->set_texture_stage_state_calls > set_tss_before,
		"Apply did not issue any Set_DX8_Texture_Stage_State calls");

	// ---------------------------------------------------------------------------
	// Additional easy check: switch to ORTHO_PROJECTION and re-Apply, then
	// verify TEXTURETRANSFORMFLAGS collapses to D3DTTFF_COUNT2.
	// ---------------------------------------------------------------------------
	DWORD ortho_transform_flags = 0;
	if (mapper != nullptr) {
		mapper->Set_Type(MatrixMapperClass::ORTHO_PROJECTION);
		mapper->Apply(0);
		if (device != nullptr) {
			device->GetTextureStageState(kStage, D3DTSS_TEXTURETRANSFORMFLAGS, &ortho_transform_flags);
		}
	}
	check(ortho_transform_flags == D3DTTFF_COUNT2,
		"ORTHO_PROJECTION TEXTURETRANSFORMFLAGS must be COUNT2");

	if (mapper != nullptr) {
		mapper->Release_Ref();
	}

	WW3D::Shutdown();

	if (g_failures) {
		std::fprintf(stderr, "matrixmapper-apply-smoke: failures reported above\n");
		return 1;
	}

	std::printf(
		"{\"ok\":true,\"smoke\":\"matrixmapper-apply\","
		"\"source\":\"GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/matrixmapper.cpp MatrixMapperClass::Apply\","
		"\"stage\":%d,"
		"\"perspective\":{\"transformState\":%lu,\"texCoordIndex\":%lu,\"textureTransformFlags\":%lu,\"expectedFlags\":%lu,\"matrixNonIdentity\":%s},"
		"\"ortho\":{\"textureTransformFlags\":%lu,\"expectedFlags\":%lu},"
		"\"setTransform\":%u,\"setTextureStageState\":%u}\n",
		kStage,
		static_cast<unsigned long>(state->last_set_transform_state),
		static_cast<unsigned long>(stage_texcoord_index),
		static_cast<unsigned long>(stage_transform_flags),
		static_cast<unsigned long>(kExpectedPerspectiveFlags),
		matrix_is_identity(texture_matrix) ? "false" : "true",
		static_cast<unsigned long>(ortho_transform_flags),
		static_cast<unsigned long>(static_cast<DWORD>(D3DTTFF_COUNT2)),
		state->set_transform_calls,
		state->set_texture_stage_state_calls);
	return 0;
}
