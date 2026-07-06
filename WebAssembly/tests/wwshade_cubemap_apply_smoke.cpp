// Smoke: exercise the *original* WWShade DX6 cubemap apply path
// (Shd6CubeMapClass::Apply_Shared in
//  GeneralsMD/Code/Libraries/Source/WWVegas/wwshade/shdcubemap.cpp) under the
// Emscripten/wasm D3D8 shim, with the original WW3D/DX8Wrapper initialized
// just enough that the original DX8Wrapper state writes reach the shim D3D8
// device.
//
// This is deliberately separate from the browser harness and from any future
// GL shader translation: it pins the (texture-stage, render-state, material)
// contract that Shd6CubeMapClass::Apply_Shared emits so a future WebGL2
// fixed-function / shader bridge can diff against the real emission rather
// than a hand-written approximation. We do NOT stub or reimplement
// Apply_Shared; we construct the real ShdCubeMapDefClass / Shd6CubeMapClass
// objects and call the real method.
//
// Verified contracts:
//   * stage 0 D3DTSS_TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR
//   * vertex shader/FVF captured as DX8_FVF_XYZNDCUBEMAP
//   * stage 0 COLORARG1/COLOROP/COLORARG2 + ALPHAOP from Apply_Shared
//   * stage 1 COLOROP/ALPHAOP == D3DTOP_DISABLE
//   * D3DRS_LIGHTING/D3DRS_SPECULARENABLE == TRUE
//   * D3DRS_AMBIENT/DIFFUSE/SPECULAR/EMISSIVE MATERIALSOURCE == D3DMCS_MATERIAL
//   * DX8Wrapper::Set_DX8_Material happened and the material ambient/diffuse/
//     specular/power values came straight from a ShdCubeMapDefClass we
//     configured (Material->Power is hard-coded to 20 inside Apply_Shared's
//     constructor, and Ambient/Diffuse/Specular rgb come from the def).
//
// The constructor of Shd6CubeMapClass calls
// WW3DAssetManager::Get_Instance()->Get_Texture(name, ..., TEX_CUBEMAP). We
// follow the established WW3D smoke pattern (see ww3d2_texture_loader_smoke
// and ww3d2_dx8wrapper_render_smoke): construct a real WW3DAssetManager so
// Get_Instance() resolves, and use a harmless texture name. The texture load
// itself is irrelevant to Apply_Shared (textures are bound by Apply_Instance,
// not Apply_Shared), so we do not assert on texture-load outcome; we only
// need the construction path to complete without aborting the program so we
// can call the real Apply_Shared.

#include <cstdio>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "Vector.H"
#include "assetmgr.h"
#include "camera.h"
#include "dx8fvf.h"
#include "dx8wrapper.h"
#include "rinfo.h"
#include "shdcubemap.h"
#include "shdclassids.h"
#include "vector.h"
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

bool nearf(float actual, float expected, float epsilon = 0.0001f)
{
	float delta = actual - expected;
	if (delta < 0.0f) delta = -delta;
	return delta <= epsilon;
}

bool g_failures = false;

void check(bool condition, const char *message)
{
	if (!expect(condition, message)) {
		g_failures = true;
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

	// Construct the real WW3DAssetManager so the original Shd6CubeMapClass
	// constructor's WW3DAssetManager::Get_Instance()->Get_Texture(...) call
	// resolves. The texture name is intentionally harmless -- Apply_Shared
	// does not depend on the loaded texture (Apply_Instance binds it).
	WW3DAssetManager *asset_manager = W3DNEW WW3DAssetManager();
	check(asset_manager != nullptr, "WW3DAssetManager allocation failed");

	// Configure a real ShdCubeMapDefClass with distinctive ambient/diffuse/
	// specular values so we can later prove the material that Apply_Shared
	// pushes through DX8Wrapper::Set_DX8_Material came from this def.
	const Vector3 kAmbient(0.10f, 0.20f, 0.30f);
	const Vector3 kDiffuse(0.40f, 0.50f, 0.60f);
	const Vector3 kSpecular(0.70f, 0.80f, 0.90f);
	constexpr float kExpectedPower = 20.0f; // hard-coded in Shd6CubeMapClass ctor

	ShdCubeMapDefClass *def = W3DNEW ShdCubeMapDefClass();
	check(def != nullptr, "ShdCubeMapDefClass allocation failed");

	Shd6CubeMapClass *shader = nullptr;
	CameraClass *camera = nullptr;

	if (def != nullptr) {
		def->Set_Texture_Name("cubemap_apply_smoke.dds");
		def->Set_Ambient(kAmbient);
		def->Set_Diffuse(kDiffuse);
		def->Set_Specular(kSpecular);

		// Create() returns `new Shd6CubeMapClass(this)`. We static_cast because
		// the Shd6CubeMapClass type is what owns the real Apply_Shared.
		ShdInterfaceClass *interface_ptr = def->Create();
		check(interface_ptr != nullptr, "ShdCubeMapDefClass::Create returned null");
		if (interface_ptr != nullptr) {
			shader = static_cast<Shd6CubeMapClass *>(interface_ptr);
		}
	}

	const unsigned int set_material_before = wasm_d3d8_get_state()->set_material_calls;
	const unsigned int set_render_state_before = wasm_d3d8_get_state()->set_render_state_calls;
	const unsigned int set_tss_before = wasm_d3d8_get_state()->set_texture_stage_state_calls;
	const unsigned int set_vertex_shader_before = wasm_d3d8_get_state()->set_vertex_shader_calls;

	if (shader != nullptr) {
		camera = W3DNEW CameraClass();
		check(camera != nullptr, "CameraClass allocation failed");
		if (camera != nullptr) {
			// Call the *real* Apply_Shared (pass 0). This is the only method
			// under test. After it returns, every Set_DX8_Texture_Stage_State,
			// Set_Vertex_Shader, Set_DX8_Render_State and Set_DX8_Material
			// call inside it has already hit the wasm D3D8 shim device.
			RenderInfoClass render_info(*camera);
			shader->Apply_Shared(0, render_info);
		}
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();
	check(device != nullptr, "DX8Wrapper D3D8 device is null after Apply_Shared");

	// ---------------------------------------------------------------------------
	// 1. stage 0 D3DTSS_TEXCOORDINDEX == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR
	// ---------------------------------------------------------------------------
	DWORD stage0_texcoord_index = 0;
	if (device != nullptr) {
		device->GetTextureStageState(0, D3DTSS_TEXCOORDINDEX, &stage0_texcoord_index);
	}
	check(stage0_texcoord_index == D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
		"stage0 TEXCOORDINDEX must be CAMERASPACEREFLECTIONVECTOR");

	// ---------------------------------------------------------------------------
	// 2. Vertex shader/FVF captured as DX8_FVF_XYZNDCUBEMAP
	// ---------------------------------------------------------------------------
	check(state->last_set_vertex_shader == static_cast<DWORD>(DX8_FVF_XYZNDCUBEMAP),
		"Apply_Shared did not set DX8_FVF_XYZNDCUBEMAP vertex shader");
	check(state->set_vertex_shader_calls > set_vertex_shader_before,
		"Apply_Shared did not issue a SetVertexShader call");

	// ---------------------------------------------------------------------------
	// 3. stage 0 COLORARG1/COLOROP/COLORARG2 + ALPHAOP from Apply_Shared
	// ---------------------------------------------------------------------------
	DWORD s0_colorarg1 = 0;
	DWORD s0_colorop = 0;
	DWORD s0_colorarg2 = 0;
	DWORD s0_alphaop = 0;
	if (device != nullptr) {
		device->GetTextureStageState(0, D3DTSS_COLORARG1, &s0_colorarg1);
		device->GetTextureStageState(0, D3DTSS_COLOROP, &s0_colorop);
		device->GetTextureStageState(0, D3DTSS_COLORARG2, &s0_colorarg2);
		device->GetTextureStageState(0, D3DTSS_ALPHAOP, &s0_alphaop);
	}
	check(s0_colorarg1 == D3DTA_TEXTURE, "stage0 COLORARG1 must be TEXTURE");
	check(s0_colorop == D3DTOP_MODULATE, "stage0 COLOROP must be MODULATE");
	check(s0_colorarg2 == D3DTA_DIFFUSE, "stage0 COLORARG2 must be DIFFUSE");
	check(s0_alphaop == D3DTOP_MODULATE, "stage0 ALPHAOP must be MODULATE");

	// ---------------------------------------------------------------------------
	// 4. stage 1 COLOROP/ALPHAOP == D3DTOP_DISABLE
	// ---------------------------------------------------------------------------
	DWORD s1_colorop = 0;
	DWORD s1_alphaop = 0;
	if (device != nullptr) {
		device->GetTextureStageState(1, D3DTSS_COLOROP, &s1_colorop);
		device->GetTextureStageState(1, D3DTSS_ALPHAOP, &s1_alphaop);
	}
	check(s1_colorop == D3DTOP_DISABLE, "stage1 COLOROP must be DISABLE");
	check(s1_alphaop == D3DTOP_DISABLE, "stage1 ALPHAOP must be DISABLE");

	// ---------------------------------------------------------------------------
	// 5. D3DRS_LIGHTING / D3DRS_SPECULARENABLE == TRUE
	// ---------------------------------------------------------------------------
	DWORD rs_lighting = 0;
	DWORD rs_specular_enable = 0;
	if (device != nullptr) {
		device->GetRenderState(D3DRS_LIGHTING, &rs_lighting);
		device->GetRenderState(D3DRS_SPECULARENABLE, &rs_specular_enable);
	}
	check(rs_lighting == TRUE, "D3DRS_LIGHTING must be TRUE after Apply_Shared");
	check(rs_specular_enable == TRUE, "D3DRS_SPECULARENABLE must be TRUE after Apply_Shared");

	// ---------------------------------------------------------------------------
	// 6. Material source render states from Apply_Shared
	//    AMBIENT/DIFFUSE/SPECULAR/EMISSIVE -> D3DMCS_MATERIAL
	// ---------------------------------------------------------------------------
	DWORD rs_ambient_mat = 0;
	DWORD rs_diffuse_mat = 0;
	DWORD rs_specular_mat = 0;
	DWORD rs_emissive_mat = 0;
	if (device != nullptr) {
		device->GetRenderState(D3DRS_AMBIENTMATERIALSOURCE, &rs_ambient_mat);
		device->GetRenderState(D3DRS_DIFFUSEMATERIALSOURCE, &rs_diffuse_mat);
		device->GetRenderState(D3DRS_SPECULARMATERIALSOURCE, &rs_specular_mat);
		device->GetRenderState(D3DRS_EMISSIVEMATERIALSOURCE, &rs_emissive_mat);
	}
	check(rs_ambient_mat == D3DMCS_MATERIAL, "AMBIENTMATERIALSOURCE must be MATERIAL");
	check(rs_diffuse_mat == D3DMCS_MATERIAL, "DIFFUSEMATERIALSOURCE must be MATERIAL");
	check(rs_specular_mat == D3DMCS_MATERIAL, "SPECULARMATERIALSOURCE must be MATERIAL");
	check(rs_emissive_mat == D3DMCS_MATERIAL, "EMISSIVEMATERIALSOURCE must be MATERIAL");

	// ---------------------------------------------------------------------------
	// 7. Set_DX8_Material happened and the material ambient/diffuse/specular/
	//    power values came straight from the ShdCubeMapDefClass we configured.
	// ---------------------------------------------------------------------------
	check(state->set_material_calls > set_material_before,
		"Apply_Shared did not issue a SetMaterial call");

	const WasmD3D8DrawMaterial &mat = state->last_set_material;
	check(nearf(mat.ambient.r, kAmbient.X) && nearf(mat.ambient.g, kAmbient.Y)
			&& nearf(mat.ambient.b, kAmbient.Z),
		"material ambient did not come from the configured ShdCubeMapDefClass");
	check(nearf(mat.diffuse.r, kDiffuse.X) && nearf(mat.diffuse.g, kDiffuse.Y)
			&& nearf(mat.diffuse.b, kDiffuse.Z),
		"material diffuse did not come from the configured ShdCubeMapDefClass");
	check(nearf(mat.specular.r, kSpecular.X) && nearf(mat.specular.g, kSpecular.Y)
			&& nearf(mat.specular.b, kSpecular.Z),
		"material specular did not come from the configured ShdCubeMapDefClass");
	check(nearf(mat.power, kExpectedPower),
		"material power must be the constructor's hard-coded 20.0");

	// Sanity: Apply_Shared actually exercised the stage-state and render-state
	// paths (so a future regression where Apply_Shared is bypassed can't pass).
	check(state->set_texture_stage_state_calls > set_tss_before,
		"Apply_Shared did not issue any SetTextureStageState calls");
	check(state->set_render_state_calls > set_render_state_before,
		"Apply_Shared did not issue any SetRenderState calls");

	// Cleanup. Shd6CubeMapClass's destructor releases its Texture ref and the
	// ShdCubeMapDefClass is reference-counted via RefCountClass.
	if (shader != nullptr) {
		shader->Release_Ref();
	}
	if (def != nullptr) {
		def->Release_Ref();
	}
	if (camera != nullptr) {
		camera->Release_Ref();
	}
	if (asset_manager != nullptr) {
		delete asset_manager;
	}

	WW3D::Shutdown();

	if (g_failures) {
		std::fprintf(stderr, "wwshade-cubemap-apply-smoke: failures reported above\n");
		return 1;
	}

	std::printf(
		"{\"ok\":true,\"smoke\":\"wwshade-cubemap-apply\","
		"\"source\":\"GeneralsMD/Code/Libraries/Source/WWVegas/wwshade/shdcubemap.cpp Shd6CubeMapClass::Apply_Shared\","
		"\"stage0\":{\"texCoordIndex\":%lu,\"colorArg1\":%lu,\"colorOp\":%lu,\"colorArg2\":%lu,\"alphaOp\":%lu},"
		"\"stage1\":{\"colorOp\":%lu,\"alphaOp\":%lu},"
		"\"renderState\":{\"lighting\":%lu,\"specularEnable\":%lu,"
		"\"ambientMatSource\":%lu,\"diffuseMatSource\":%lu,"
		"\"specularMatSource\":%lu,\"emissiveMatSource\":%lu},"
		"\"vertexShader\":%lu,\"fvfXyzndCubeMap\":%lu,"
		"\"material\":{\"ambient\":[%.4f,%.4f,%.4f],\"diffuse\":[%.4f,%.4f,%.4f],"
		"\"specular\":[%.4f,%.4f,%.4f],\"power\":%.4f},"
		"\"setMaterial\":%u,\"setRenderState\":%u,\"setTextureStageState\":%u,\"setVertexShader\":%u}\n",
		static_cast<unsigned long>(stage0_texcoord_index),
		static_cast<unsigned long>(s0_colorarg1),
		static_cast<unsigned long>(s0_colorop),
		static_cast<unsigned long>(s0_colorarg2),
		static_cast<unsigned long>(s0_alphaop),
		static_cast<unsigned long>(s1_colorop),
		static_cast<unsigned long>(s1_alphaop),
		static_cast<unsigned long>(rs_lighting),
		static_cast<unsigned long>(rs_specular_enable),
		static_cast<unsigned long>(rs_ambient_mat),
		static_cast<unsigned long>(rs_diffuse_mat),
		static_cast<unsigned long>(rs_specular_mat),
		static_cast<unsigned long>(rs_emissive_mat),
		static_cast<unsigned long>(state->last_set_vertex_shader),
		static_cast<unsigned long>(DX8_FVF_XYZNDCUBEMAP),
		mat.ambient.r, mat.ambient.g, mat.ambient.b,
		mat.diffuse.r, mat.diffuse.g, mat.diffuse.b,
		mat.specular.r, mat.specular.g, mat.specular.b,
		mat.power,
		state->set_material_calls,
		state->set_render_state_calls,
		state->set_texture_stage_state_calls,
		state->set_vertex_shader_calls);
	return 0;
}
