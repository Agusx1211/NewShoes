// Water projection generated-coordinate state smoke.
//
// Proves the original Zero Hour water-noise projection *generated-coordinate*
// D3D8 state path emits the exact texture-stage/transform state the browser
// D3D8 shim must map onto WebGL2/WebGPU. The proof intentionally mirrors the
// direct original D3D8 state sequence emitted by the water renderer instead
// of constructing the full WaterRenderObjClass (which drags in D3DX/D3D
// shaders, render targets, reflection, grid, and river-water integration that
// the browser port has not re-targeted yet).
//
// Original source (Zero Hour, primary target):
//   GeneralsMD/Code/GameEngineDevice/Source/W3DDevice/GameClient/Water/
//     W3DWater.cpp
//   - WaterRenderObjClass::drawRiverWater(PolygonTrigger *pTrig)   [~line 2715]
//   - WaterRenderObjClass::drawTrapezoidWater(Vector3 points[4])   [~line 3047]
//
// Both functions run the identical Stage-2 water-noise projection setup. The
// relevant original sequence is:
//
//   DX8Wrapper::Set_DX8_Texture_Stage_State(1, D3DTSS_ADDRESSU, D3DTADDRESS_WRAP);
//   DX8Wrapper::Set_DX8_Texture_Stage_State(1, D3DTSS_ADDRESSV, D3DTADDRESS_WRAP);
//   DX8Wrapper::Set_DX8_Texture_Stage_State(2, D3DTSS_TEXCOORDINDEX,
//                                           D3DTSS_TCI_CAMERASPACEPOSITION);
//   // Two output coordinates are used.
//   DX8Wrapper::Set_DX8_Texture_Stage_State(2, D3DTSS_TEXTURETRANSFORMFLAGS,
//                                           D3DTTFF_COUNT2);
//   DX8Wrapper::Set_DX8_Texture_Stage_State(2, D3DTSS_ADDRESSU, D3DTADDRESS_WRAP);
//   DX8Wrapper::Set_DX8_Texture_Stage_State(2, D3DTSS_ADDRESSV, D3DTADDRESS_WRAP);
//
//   Matrix4x4 curView;
//   DX8Wrapper::_Get_DX8_Transform(D3DTS_VIEW, curView);
//   D3DXMatrixInverse(&inv, &det, (D3DXMATRIX*)&curView);
//   D3DXMatrixScaling(&scale, NOISE_REPEAT_FACTOR, NOISE_REPEAT_FACTOR, 1);
//   D3DXMATRIX destMatrix = inv * scale;
//   D3DXMatrixTranslation(&scale, m_riverVOrigin, m_riverVOrigin, 0);
//   destMatrix = destMatrix * scale;
//   DX8Wrapper::_Set_DX8_Transform(D3DTS_TEXTURE2, *(Matrix4x4*)&destMatrix);
//
// where NOISE_REPEAT_FACTOR = 1.0f / 16.0f (W3DWater.cpp line 193) and
// m_riverVOrigin is the deterministic per-water-object river origin scalar.
//
// This smoke replays that exact D3D8 state sequence against the browser
// d3d8 shim and asserts:
//   1. The emitted shim texture-stage state for stages 1 and 2 matches the
//      original values (TEXCOORDINDEX/TEXTURETRANSFORMFLAGS/ADDRESSU/ADDRESSV).
//   2. The D3DTS_TEXTURE2 transform emitted to the shim equals the matrix
//      produced by the original get-view / invert / scale-by-NOISE_REPEAT_FACTOR
//      / translate-by-river-origin / set-texture2 sequence, computed with a
//      real (non-stub) D3DX-equivalent matrix implementation.
//   3. A draw replays the captured stage-2 state verbatim.

#include <cmath>
#include <cstdio>
#include <cstring>

#include "wasm_d3d8_shim.h"

namespace {

// Must match the original W3DWater.cpp line 193 definition.
constexpr float kNoiseRepeatFactor = 1.0f / 16.0f;

// Deterministic river origin scalar chosen for this proof (stands in for the
// per-water-object m_riverVOrigin member read by drawRiverWater /
// drawTrapezoidWater). The original code translates by (m_riverVOrigin,
// m_riverVOrigin, 0).
constexpr float kRiverVOrigin = 0.25f;

const float kMatrixTolerance = 0.0001f;

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

bool near(float actual, float expected, float tolerance = kMatrixTolerance)
{
	const float difference = actual > expected ? actual - expected : expected - actual;
	return difference <= tolerance;
}

// --- D3DX-equivalent 4x4 matrix math (real implementation, not stubs). -----
// D3DMATRIX is row-major: m[row][col]. D3DX uses row-vector convention, so the
// product A*B applies B first then A. These helpers mirror D3DXMatrixScaling,
// D3DXMatrixTranslation, D3DXMatrixMultiply, and D3DXMatrixInverse exactly.

void scaling_matrix(D3DMATRIX &out, float sx, float sy, float sz)
{
	std::memset(&out, 0, sizeof(out));
	out.m[0][0] = sx;
	out.m[1][1] = sy;
	out.m[2][2] = sz;
	out.m[3][3] = 1.0f;
}

void translation_matrix(D3DMATRIX &out, float tx, float ty, float tz)
{
	std::memset(&out, 0, sizeof(out));
	out.m[0][0] = 1.0f;
	out.m[1][1] = 1.0f;
	out.m[2][2] = 1.0f;
	out.m[3][3] = 1.0f;
	out.m[3][0] = tx;
	out.m[3][1] = ty;
	out.m[3][2] = tz;
}

void multiply_matrix(D3DMATRIX &out, const D3DMATRIX &a, const D3DMATRIX &b)
{
	D3DMATRIX result = {};
	for (int row = 0; row < 4; ++row) {
		for (int col = 0; col < 4; ++col) {
			float sum = 0.0f;
			for (int k = 0; k < 4; ++k) {
				sum += a.m[row][k] * b.m[k][col];
			}
			result.m[row][col] = sum;
		}
	}
	out = result;
}

// General 4x4 inverse via Gauss-Jordan elimination with partial pivoting.
// Mirrors D3DXMatrixInverse's contract (returns det through *determinant).
bool invert_matrix(D3DMATRIX &out, float &determinant, const D3DMATRIX &in)
{
	float aug[4][8] = {};
	for (int row = 0; row < 4; ++row) {
		for (int col = 0; col < 4; ++col) {
			aug[row][col] = in.m[row][col];
		}
		aug[row][4 + row] = 1.0f;
	}

	for (int col = 0; col < 4; ++col) {
		int pivot = col;
		float best = std::fabs(aug[col][col]);
		for (int row = col + 1; row < 4; ++row) {
			const float candidate = std::fabs(aug[row][col]);
			if (candidate > best) {
				best = candidate;
				pivot = row;
			}
		}
		if (best == 0.0f) {
			determinant = 0.0f;
			return false;
		}
		if (pivot != col) {
			for (int k = 0; k < 8; ++k) {
				const float tmp = aug[pivot][k];
				aug[pivot][k] = aug[col][k];
				aug[col][k] = tmp;
			}
		}
		const float pivot_value = aug[col][col];
		for (int k = 0; k < 8; ++k) {
			aug[col][k] /= pivot_value;
		}
		for (int row = 0; row < 4; ++row) {
			if (row == col) {
				continue;
			}
			const float factor = aug[row][col];
			if (factor == 0.0f) {
				continue;
			}
			for (int k = 0; k < 8; ++k) {
				aug[row][k] -= factor * aug[col][k];
			}
		}
	}

	D3DMATRIX result = {};
	for (int row = 0; row < 4; ++row) {
		for (int col = 0; col < 4; ++col) {
			result.m[row][col] = aug[row][4 + col];
		}
	}
	out = result;
	// Determinant is the product of the pivots encountered (we normalized each
	// pivot row, so the original-matrix determinant is the product of the
	// pivot values used). Recompute directly from the input for exactness.
	determinant = in.m[0][0] * (in.m[1][1] * (in.m[2][2] * in.m[3][3] - in.m[3][2] * in.m[2][3]) -
								in.m[1][2] * (in.m[2][1] * in.m[3][3] - in.m[3][1] * in.m[2][3]) +
								in.m[1][3] * (in.m[2][1] * in.m[3][2] - in.m[3][1] * in.m[2][2])) -
				  in.m[0][1] * (in.m[1][0] * (in.m[2][2] * in.m[3][3] - in.m[3][2] * in.m[2][3]) -
								in.m[1][2] * (in.m[2][0] * in.m[3][3] - in.m[3][0] * in.m[2][3]) +
								in.m[1][3] * (in.m[2][0] * in.m[3][2] - in.m[3][0] * in.m[2][2])) +
				  in.m[0][2] * (in.m[1][0] * (in.m[2][1] * in.m[3][3] - in.m[3][1] * in.m[2][3]) -
								in.m[1][1] * (in.m[2][0] * in.m[3][3] - in.m[3][0] * in.m[2][3]) +
								in.m[1][3] * (in.m[2][0] * in.m[3][1] - in.m[3][0] * in.m[2][1])) -
				  in.m[0][3] * (in.m[1][0] * (in.m[2][1] * in.m[3][2] - in.m[3][1] * in.m[2][2]) -
								in.m[1][1] * (in.m[2][0] * in.m[3][2] - in.m[3][0] * in.m[2][2]) +
								in.m[1][2] * (in.m[2][0] * in.m[3][1] - in.m[3][0] * in.m[2][1]));
	return true;
}

} // namespace

int main()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	if (!expect(d3d != nullptr, "Direct3DCreate8 returned null")) {
		return 1;
	}

	D3DPRESENT_PARAMETERS parameters = {};
	parameters.BackBufferWidth = 64;
	parameters.BackBufferHeight = 64;
	parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
	parameters.BackBufferCount = 1;
	parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
	parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
	parameters.Windowed = TRUE;
	parameters.EnableAutoDepthStencil = TRUE;
	parameters.AutoDepthStencilFormat = D3DFMT_D24S8;

	IDirect3DDevice8 *device = nullptr;
	if (!expect(SUCCEEDED(d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, nullptr,
			D3DCREATE_SOFTWARE_VERTEXPROCESSING, &parameters, &device)),
			"CreateDevice failed") ||
		!expect(device != nullptr, "CreateDevice returned null device")) {
		d3d->Release();
		return 1;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const UINT stage_state_before = state->set_texture_stage_state_calls;

	// ---------------------------------------------------------------------------
	// Establish a deterministic view transform mirroring the camera placement the
	// original water renderer reads via _Get_DX8_Transform(D3DTS_VIEW, curView).
	// A pure translation view is invertible and produces closed-form expected
	// texture2 matrix values, which lets the assertion tolerate no ambiguity.
	// ---------------------------------------------------------------------------
	D3DMATRIX view_matrix = {};
	translation_matrix(view_matrix, 2.0f, -3.0f, 5.0f);
	if (!expect(SUCCEEDED(device->SetTransform(D3DTS_VIEW, &view_matrix)), "SetTransform VIEW failed")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// ---------------------------------------------------------------------------
	// Replay the exact original Stage-1 / Stage-2 water-noise projection state
	// sequence from W3DWater.cpp drawRiverWater / drawTrapezoidWater.
	// ---------------------------------------------------------------------------
	const DWORD expected_texcoord_index = D3DTSS_TCI_CAMERASPACEPOSITION;
	const DWORD expected_transform_flags = D3DTTFF_COUNT2;
	const DWORD expected_address = D3DTADDRESS_WRAP;

	if (!expect(SUCCEEDED(device->SetTextureStageState(1, D3DTSS_ADDRESSU, expected_address)),
			"stage1 ADDRESSU WRAP failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(1, D3DTSS_ADDRESSV, expected_address)),
			"stage1 ADDRESSV WRAP failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(2, D3DTSS_TEXCOORDINDEX, expected_texcoord_index)),
			"stage2 TEXCOORDINDEX CAMERASPACEPOSITION failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(2, D3DTSS_TEXTURETRANSFORMFLAGS, expected_transform_flags)),
			"stage2 TEXTURETRANSFORMFLAGS COUNT2 failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(2, D3DTSS_ADDRESSU, expected_address)),
			"stage2 ADDRESSU WRAP failed") ||
		!expect(SUCCEEDED(device->SetTextureStageState(2, D3DTSS_ADDRESSV, expected_address)),
			"stage2 ADDRESSV WRAP failed") ||
		!expect(state->set_texture_stage_state_calls == stage_state_before + 6,
			"set_texture_stage_state_calls counter mismatch after projection setup") ||
		// The probe last-value fields capture the most-recent SetTextureStageState
		// emission; verify it is the final stage2 ADDRESSV WRAP from the sequence.
		!expect(state->last_set_texture_stage_state_stage == 2,
			"last_set_texture_stage_state_stage mismatch") ||
		!expect(state->last_set_texture_stage_state == D3DTSS_ADDRESSV,
			"last_set_texture_stage_state mismatch") ||
		!expect(state->last_set_texture_stage_state_value == expected_address,
			"last_set_texture_stage_state_value mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// ---------------------------------------------------------------------------
	// Compute the deterministic D3DTS_TEXTURE2 matrix using the exact original
	// operations: inv(view) * scale(NOISE_REPEAT_FACTOR) * translation(river).
	// ---------------------------------------------------------------------------
	D3DMATRIX cur_view = {};
	D3DMATRIX inv_view = {};
	float det = 0.0f;
	if (!expect(SUCCEEDED(device->GetTransform(D3DTS_VIEW, &cur_view)),
			"GetTransform VIEW failed for projection setup") ||
		!expect(invert_matrix(inv_view, det, cur_view), "view matrix is singular") ||
		!expect(near(det, 1.0f), "deterministic view determinant mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	D3DMATRIX noise_scale = {};
	scaling_matrix(noise_scale, kNoiseRepeatFactor, kNoiseRepeatFactor, 1.0f);
	D3DMATRIX river_translation = {};
	translation_matrix(river_translation, kRiverVOrigin, kRiverVOrigin, 0.0f);

	D3DMATRIX inv_times_scale = {};
	multiply_matrix(inv_times_scale, inv_view, noise_scale);
	D3DMATRIX dest_matrix = {};
	multiply_matrix(dest_matrix, inv_times_scale, river_translation);

	// Closed-form expected texture2 matrix for view = Translation(2,-3,5),
	// s = NOISE_REPEAT_FACTOR = 1/16, river = (0.25, 0.25, 0). Derived by hand
	// from the original inv * scale * translation product (row-vector D3DX
	// convention). Any drift in the get-view / invert / scale / translate /
	// set-texture2 path will break these values.
	D3DMATRIX expected_dest = {};
	expected_dest.m[0][0] = kNoiseRepeatFactor;
	expected_dest.m[1][1] = kNoiseRepeatFactor;
	expected_dest.m[2][2] = 1.0f;
	expected_dest.m[3][0] = kRiverVOrigin - 2.0f * kNoiseRepeatFactor; // 0.125
	expected_dest.m[3][1] = kRiverVOrigin + 3.0f * kNoiseRepeatFactor; // 0.4375
	expected_dest.m[3][2] = -5.0f;
	expected_dest.m[3][3] = 1.0f;

	for (int row = 0; row < 4; ++row) {
		for (int col = 0; col < 4; ++col) {
			if (!expect(near(dest_matrix.m[row][col], expected_dest.m[row][col]),
				"computed texture2 matrix element mismatch")) {
				device->Release();
				d3d->Release();
				return 1;
			}
		}
	}

	// Emit the texture2 transform exactly as the original
	// _Set_DX8_Transform(D3DTS_TEXTURE2, destMatrix) call does.
	const UINT set_transform_before = state->set_transform_calls;
	if (!expect(SUCCEEDED(device->SetTransform(D3DTS_TEXTURE2, &dest_matrix)),
			"SetTransform TEXTURE2 failed") ||
		!expect(state->set_transform_calls == set_transform_before + 1,
			"set_transform_calls counter mismatch after TEXTURE2") ||
		!expect(state->last_set_transform_state == D3DTS_TEXTURE2,
			"last_set_transform_state mismatch after TEXTURE2") ||
		!expect(near(state->last_set_transform_matrix.m[0][0], kNoiseRepeatFactor),
			"last_set_transform_matrix scale-x mismatch") ||
		!expect(near(state->last_set_transform_matrix.m[1][1], kNoiseRepeatFactor),
			"last_set_transform_matrix scale-y mismatch") ||
		!expect(near(state->last_set_transform_matrix.m[3][0], kRiverVOrigin - 2.0f * kNoiseRepeatFactor),
			"last_set_transform_matrix translate-x mismatch") ||
		!expect(near(state->last_set_transform_matrix.m[3][1], kRiverVOrigin + 3.0f * kNoiseRepeatFactor),
			"last_set_transform_matrix translate-y mismatch") ||
		!expect(near(state->last_set_transform_matrix.m[3][2], -5.0f),
			"last_set_transform_matrix translate-z mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// The texture2 transform must round-trip through the shim's transform store
	// for later browser-side WebGL2/WebGPU texture-matrix emission.
	D3DMATRIX readback_texture2 = {};
	if (!expect(SUCCEEDED(device->GetTransform(D3DTS_TEXTURE2, &readback_texture2)),
			"GetTransform TEXTURE2 failed") ||
		!expect(near(readback_texture2.m[0][0], kNoiseRepeatFactor),
			"GetTransform TEXTURE2 scale-x mismatch") ||
		!expect(near(readback_texture2.m[1][1], kNoiseRepeatFactor),
			"GetTransform TEXTURE2 scale-y mismatch") ||
		!expect(near(readback_texture2.m[3][0], kRiverVOrigin - 2.0f * kNoiseRepeatFactor),
			"GetTransform TEXTURE2 translate-x mismatch") ||
		!expect(near(readback_texture2.m[3][1], kRiverVOrigin + 3.0f * kNoiseRepeatFactor),
			"GetTransform TEXTURE2 translate-y mismatch") ||
		!expect(near(readback_texture2.m[3][2], -5.0f),
			"GetTransform TEXTURE2 translate-z mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// ---------------------------------------------------------------------------
	// Draw capture: an indexed draw must replay the emitted Stage-2 texture-stage
	// state verbatim so the browser renderer sees the original generated-
	// coordinate projection setup. The shim only draw-captures texture-stage
	// state (and texture0/texture1 transforms) from the indexed draw path, so
	// the texture2 transform is verified via the SetTransform / GetTransform
	// probe above and this draw only needs to exercise the stage-state capture.
	// ---------------------------------------------------------------------------
	IDirect3DVertexBuffer8 *vertex_buffer = nullptr;
	IDirect3DIndexBuffer8 *index_buffer = nullptr;
	if (!expect(SUCCEEDED(device->CreateVertexBuffer(64, D3DUSAGE_WRITEONLY, 0,
				D3DPOOL_DEFAULT, &vertex_buffer)),
			"CreateVertexBuffer failed") ||
		!expect(SUCCEEDED(device->CreateIndexBuffer(32, D3DUSAGE_WRITEONLY, D3DFMT_INDEX16,
				D3DPOOL_DEFAULT, &index_buffer)),
			"CreateIndexBuffer failed") ||
		!expect(SUCCEEDED(device->SetStreamSource(0, vertex_buffer, 16)),
			"SetStreamSource failed") ||
		!expect(SUCCEEDED(device->SetIndices(index_buffer, 0)), "SetIndices failed") ||
		!expect(SUCCEEDED(device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST, 0, 3, 0, 1)),
			"DrawIndexedPrimitive failed") ||
		!expect(state->last_draw_render_state.texture_stages[1].values[D3DTSS_ADDRESSU] == expected_address,
			"draw stage1 ADDRESSU capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[1].values[D3DTSS_ADDRESSV] == expected_address,
			"draw stage1 ADDRESSV capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[2].values[D3DTSS_TEXCOORDINDEX] == expected_texcoord_index,
			"draw stage2 TEXCOORDINDEX CAMERASPACEPOSITION capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[2].values[D3DTSS_TEXTURETRANSFORMFLAGS] == expected_transform_flags,
			"draw stage2 TEXTURETRANSFORMFLAGS COUNT2 capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[2].values[D3DTSS_ADDRESSU] == expected_address,
			"draw stage2 ADDRESSU WRAP capture mismatch") ||
		!expect(state->last_draw_render_state.texture_stages[2].values[D3DTSS_ADDRESSV] == expected_address,
			"draw stage2 ADDRESSV WRAP capture mismatch")) {
		if (index_buffer != nullptr) {
			index_buffer->Release();
		}
		if (vertex_buffer != nullptr) {
			vertex_buffer->Release();
		}
		device->Release();
		d3d->Release();
		return 1;
	}
	index_buffer->Release();
	vertex_buffer->Release();

	device->Release();
	d3d->Release();

	std::printf("{\"ok\":true,\"smoke\":\"water-projection-state\","
				"\"noiseRepeatFactor\":%.6f,\"riverVOrigin\":%.6f}\n",
		static_cast<double>(kNoiseRepeatFactor), static_cast<double>(kRiverVOrigin));
	return 0;
}
