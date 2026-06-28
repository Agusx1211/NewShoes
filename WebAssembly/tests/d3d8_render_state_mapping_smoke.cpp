// Render-state mapping expectations smoke.
//
// This is a focused, non-overlapping M4 slice that records the D3D8
// fixed-function render-state values the engine sets (D3DRS_CULLMODE,
// D3DRS_ZENABLE, D3DRS_ZWRITEENABLE, and the closely related depth / blend /
// alpha-test / color-write states) through the *existing* browser D3D8 shim,
// WITHOUT touching the WebGL2 draw bridge (WebAssembly/harness/bridge.js) or
// the shim itself (WebAssembly/src/wasm_d3d8_shim.*).
//
// It does two things:
//
//   1. Proves the shim's CPU-side render-state bookkeeping round-trips the
//      exact D3D DWORD values the engine and DX8 contract use, observed
//      through the probe counters and last-value fields in WasmD3D8ShimState.
//      This is the foundation the future GL-state mapping must stand on.
//
//   2. Records the EXPECTED D3D8 -> WebGL2 (GLSL ES) state mapping as a
//      machine-readable JSON spec emitted on success. The future
//      "Render-state mapping (blend, depth, cull, alpha test) -> GL state"
//      M4 task must satisfy this contract. The mapping is computed locally in
//      this test from the recorded D3D values using the canonical D3D8->GL
//      translation table documented below; the shim and draw bridge are not
//      changed, so a future change that wires the real GL mapping can diff its
//      emitted state against this recorded spec.
//
// Key D3D8 -> WebGL2 mapping subtleties captured here (these are the failure
// modes a naive mapping gets wrong and that the spec is meant to pin):
//
//   * CULL: D3D's default front-face winding is CW; OpenGL's is CCW. The
//     canonical translation sets gl.frontFace(GL_CW) globally and then
//     D3DCULL_CW  -> cullFace(GL_BACK)   (cull the CW-wound faces == back)
//         D3DCULL_CCW -> cullFace(GL_FRONT)  (cull the CCW-wound faces == front)
//         D3DCULL_NONE -> gl.disable(CULL_FACE).
//
//   * DEPTH: D3DRS_ZENABLE takes D3DZB_{FALSE,TRUE,USEW}. WebGL2 has no "use W"
//     depth mode, so both D3DZB_TRUE and D3DZB_USEW map to enable(DEPTH_TEST);
//     only D3DZB_FALSE disables it. ZWRITEENABLE maps to depthMask.
//
//   * ALPHA TEST: removed from GLSL ES 3.00 / WebGL2 core. ALPHATESTENABLE
//     must be emulated in the generated fragment shader (uniform compare +
//     discard); ALPHAFUNC/ALPHAREF feed the shader uniform, not a GL enum.
//
// The test passes only if every Set/Get round-trip preserves the exact D3D
// value and the probe counters/last-value fields update as expected. The
// emitted JSON spec is documentation, not an additional pass/fail gate.

#include <cstdio>
#include <cstring>

#include "wasm_d3d8_shim.h"

namespace {

int g_failures = 0;

void fail(const char *message)
{
	std::fprintf(stderr, "FAIL: %s\n", message);
	++g_failures;
}

bool expect(bool condition, const char *message)
{
	if (!condition) {
		fail(message);
		return false;
	}
	return true;
}

// Expected GL symbolic mapping. These are intentionally plain integers (not GL
// headers) so the test stays dependency-free and the recorded spec stays
// stable; they mirror the WebGL2 / OpenGL ES 3.0 symbolic enum values.
enum GlEnum : int {
	GL_NONE_ENUM = 0,
	GL_FRONT = 0x0404,
	GL_BACK = 0x0405,
	GL_CW = 0x0900,
	GL_CCW = 0x0901,
	GL_CULL_FACE = 0x0B44,
	GL_DEPTH_TEST = 0x0B71,
	GL_BLEND = 0x0BE2,
	GL_NEVER = 0x0200,
	GL_LESS = 0x0201,
	GL_EQUAL = 0x0202,
	GL_LEQUAL = 0x0203,
	GL_GREATER = 0x0204,
	GL_NOTEQUAL = 0x0205,
	GL_GEQUAL = 0x0206,
	GL_ALWAYS = 0x0207,
	GL_ZERO = 0,
	GL_ONE = 1,
	GL_SRC_COLOR = 0x0300,
	GL_ONE_MINUS_SRC_COLOR = 0x0301,
	GL_SRC_ALPHA = 0x0302,
	GL_ONE_MINUS_SRC_ALPHA = 0x0303,
	GL_DST_ALPHA = 0x0304,
	GL_ONE_MINUS_DST_ALPHA = 0x0305,
	GL_DST_COLOR = 0x0306,
	GL_ONE_MINUS_DST_COLOR = 0x0307,
	GL_SRC_ALPHA_SATURATE = 0x0308,
	GL_FUNC_ADD = 0x8006,
	GL_FUNC_SUBTRACT = 0x800A,
	GL_FUNC_REVERSE_SUBTRACT = 0x800B,
	GL_MIN_EXT = 0x8007,
	GL_MAX_EXT = 0x8008
};

// D3DCMP_* -> GL depth/alpha func enum. The D3D and GL enumerations share the
// same ordering (NEVER=1 .. ALWAYS=8), so this is an offset table.
int map_cmp_func(DWORD d3d_func)
{
	switch (d3d_func) {
	case D3DCMP_NEVER: return GL_NEVER;
	case D3DCMP_LESS: return GL_LESS;
	case D3DCMP_EQUAL: return GL_EQUAL;
	case D3DCMP_LESSEQUAL: return GL_LEQUAL;
	case D3DCMP_GREATER: return GL_GREATER;
	case D3DCMP_NOTEQUAL: return GL_NOTEQUAL;
	case D3DCMP_GREATEREQUAL: return GL_GEQUAL;
	case D3DCMP_ALWAYS: return GL_ALWAYS;
	default: return GL_NONE_ENUM;
	}
}

int map_blend_factor(DWORD d3d_blend)
{
	switch (d3d_blend) {
	case D3DBLEND_ZERO: return GL_ZERO;
	case D3DBLEND_ONE: return GL_ONE;
	case D3DBLEND_SRCCOLOR: return GL_SRC_COLOR;
	case D3DBLEND_INVSRCCOLOR: return GL_ONE_MINUS_SRC_COLOR;
	case D3DBLEND_SRCALPHA: return GL_SRC_ALPHA;
	case D3DBLEND_INVSRCALPHA: return GL_ONE_MINUS_SRC_ALPHA;
	case D3DBLEND_DESTALPHA: return GL_DST_ALPHA;
	case D3DBLEND_INVDESTALPHA: return GL_ONE_MINUS_DST_ALPHA;
	case D3DBLEND_DESTCOLOR: return GL_DST_COLOR;
	case D3DBLEND_INVDESTCOLOR: return GL_ONE_MINUS_DST_COLOR;
	case D3DBLEND_SRCALPHASAT: return GL_SRC_ALPHA_SATURATE;
	// D3DBLEND_BOTHSRCALPHA / BOTHINVSRCALPHA collapse to src=SRC_ALPHA,
	// dst=ONE_MINUS_SRC_ALPHA in GL; the spec records this as a hint.
	case D3DBLEND_BOTHSRCALPHA: return GL_SRC_ALPHA;
	case D3DBLEND_BOTHINVSRCALPHA: return GL_ONE_MINUS_SRC_ALPHA;
	default: return GL_NONE_ENUM;
	}
}

int map_blend_op(DWORD d3d_op)
{
	switch (d3d_op) {
	case D3DBLENDOP_ADD: return GL_FUNC_ADD;
	case D3DBLENDOP_SUBTRACT: return GL_FUNC_SUBTRACT;
	case D3DBLENDOP_REVSUBTRACT: return GL_FUNC_REVERSE_SUBTRACT;
	case D3DBLENDOP_MIN: return GL_MIN_EXT;
	case D3DBLENDOP_MAX: return GL_MAX_EXT;
	default: return GL_NONE_ENUM;
	}
}

// Records the expected CULL_FACE GL state for a given D3DRS_CULLMODE value,
// assuming gl.frontFace(GL_CW) is set globally to match D3D's default winding.
struct CullGlState {
	int enabled;
	int cull_face;
	int front_face;
};

CullGlState map_cull(DWORD d3d_cull)
{
	switch (d3d_cull) {
	case D3DCULL_NONE: return { 0, GL_BACK, GL_CW };
	case D3DCULL_CW:   return { 1, GL_BACK,  GL_CW };
	case D3DCULL_CCW:  return { 1, GL_FRONT, GL_CW };
	default:           return { 0, GL_NONE_ENUM, GL_NONE_ENUM };
	}
}

// Records the expected DEPTH_TEST + depthMask GL state for the ZENABLE /
// ZWRITEENABLE pair.
struct DepthGlState {
	int test_enabled;
	int depth_mask_true;
	int depth_func;
};

DepthGlState map_depth(DWORD zenable, DWORD zwrite, DWORD zfunc)
{
	DepthGlState out;
	out.test_enabled = (zenable == D3DZB_TRUE || zenable == D3DZB_USEW) ? 1 : 0;
	out.depth_mask_true = (zwrite != 0) ? 1 : 0;
	out.depth_func = map_cmp_func(zfunc);
	return out;
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
	const UINT set_before = state->set_render_state_calls;
	const UINT get_before = state->get_render_state_calls;

	// Helper lambdas to keep the per-state checks compact.
	auto set_state = [&](D3DRENDERSTATETYPE rs, DWORD value, const char *label) {
		if (!SUCCEEDED(device->SetRenderState(rs, value))) {
			fail(label);
			return;
		}
		DWORD readback = 0xFFFFFFFFu;
		if (!SUCCEEDED(device->GetRenderState(rs, &readback))) {
			fail("GetRenderState failed");
			return;
		}
		expect(readback == value, "render-state round-trip value mismatch");
	};
	auto expect_last = [&](D3DRENDERSTATETYPE rs, DWORD value) {
		expect(state->last_set_render_state == rs, "last_set_render_state mismatch");
		expect(state->last_set_render_state_value == value, "last_set_render_state_value mismatch");
	};

	// ----------------------------------------------------------------------
	// 1. CULLMODE across all three D3D values.
	// ----------------------------------------------------------------------
	set_state(D3DRS_CULLMODE, D3DCULL_NONE, "SetRenderState CULLMODE NONE failed");
	expect_last(D3DRS_CULLMODE, D3DCULL_NONE);
	const CullGlState cull_none = map_cull(D3DCULL_NONE);

	set_state(D3DRS_CULLMODE, D3DCULL_CW, "SetRenderState CULLMODE CW failed");
	expect_last(D3DRS_CULLMODE, D3DCULL_CW);
	const CullGlState cull_cw = map_cull(D3DCULL_CW);

	set_state(D3DRS_CULLMODE, D3DCULL_CCW, "SetRenderState CULLMODE CCW failed");
	expect_last(D3DRS_CULLMODE, D3DCULL_CCW);
	const CullGlState cull_ccw = map_cull(D3DCULL_CCW);

	// ----------------------------------------------------------------------
	// 2. ZENABLE across FALSE / TRUE / USEW and ZWRITEENABLE TRUE/FALSE.
	// ----------------------------------------------------------------------
	set_state(D3DRS_ZENABLE, D3DZB_FALSE, "SetRenderState ZENABLE FALSE failed");
	const DepthGlState depth_off = map_depth(D3DZB_FALSE, D3DZB_TRUE, D3DCMP_LESSEQUAL);

	set_state(D3DRS_ZENABLE, D3DZB_TRUE, "SetRenderState ZENABLE TRUE failed");
	const DepthGlState depth_on = map_depth(D3DZB_TRUE, D3DZB_TRUE, D3DCMP_LESSEQUAL);

	set_state(D3DRS_ZENABLE, D3DZB_USEW, "SetRenderState ZENABLE USEW failed");
	const DepthGlState depth_w = map_depth(D3DZB_USEW, D3DZB_TRUE, D3DCMP_LESSEQUAL);

	set_state(D3DRS_ZWRITEENABLE, TRUE, "SetRenderState ZWRITEENABLE TRUE failed");
	DWORD zw_true = 0;
	expect(SUCCEEDED(device->GetRenderState(D3DRS_ZWRITEENABLE, &zw_true)) && zw_true == TRUE,
		"ZWRITEENABLE TRUE round-trip");

	set_state(D3DRS_ZWRITEENABLE, FALSE, "SetRenderState ZWRITEENABLE FALSE failed");
	DWORD zw_false = 1;
	expect(SUCCEEDED(device->GetRenderState(D3DRS_ZWRITEENABLE, &zw_false)) && zw_false == FALSE,
		"ZWRITEENABLE FALSE round-trip");

	// ZFUNC across the comparison set; record one representative mapping.
	set_state(D3DRS_ZFUNC, D3DCMP_LESSEQUAL, "SetRenderState ZFUNC LESSEQUAL failed");
	expect(map_cmp_func(D3DCMP_LESSEQUAL) == GL_LEQUAL, "LESSEQUAL maps to GL_LEQUAL");
	set_state(D3DRS_ZFUNC, D3DCMP_ALWAYS, "SetRenderState ZFUNC ALWAYS failed");
	expect(map_cmp_func(D3DCMP_ALWAYS) == GL_ALWAYS, "ALWAYS maps to GL_ALWAYS");

	// ----------------------------------------------------------------------
	// 3. Blend: ALPHABLENDENABLE, SRCBLEND, DESTBLEND, BLENDOP.
	// ----------------------------------------------------------------------
	set_state(D3DRS_ALPHABLENDENABLE, TRUE, "SetRenderState ALPHABLENDENABLE TRUE failed");
	set_state(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA, "SetRenderState SRCBLEND SRCALPHA failed");
	set_state(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA, "SetRenderState DESTBLEND INVSRCALPHA failed");
	set_state(D3DRS_BLENDOP, D3DBLENDOP_ADD, "SetRenderState BLENDOP ADD failed");
	const int src_gl = map_blend_factor(D3DBLEND_SRCALPHA);
	const int dst_gl = map_blend_factor(D3DBLEND_INVSRCALPHA);
	const int op_gl = map_blend_op(D3DBLENDOP_ADD);
	expect(src_gl == GL_SRC_ALPHA && dst_gl == GL_ONE_MINUS_SRC_ALPHA && op_gl == GL_FUNC_ADD,
		"canonical alpha blend maps to GL_SRC_ALPHA / GL_ONE_MINUS_SRC_ALPHA / GL_FUNC_ADD");

	set_state(D3DRS_BLENDOP, D3DBLENDOP_REVSUBTRACT, "SetRenderState BLENDOP REVSUBTRACT failed");
	expect(map_blend_op(D3DBLENDOP_REVSUBTRACT) == GL_FUNC_REVERSE_SUBTRACT,
		"REVSUBTRACT maps to GL_FUNC_REVERSE_SUBTRACT");

	set_state(D3DRS_ALPHABLENDENABLE, FALSE, "SetRenderState ALPHABLENDENABLE FALSE failed");

	// ----------------------------------------------------------------------
	// 4. Alpha test: enabled flag + func/ref. WebGL2 has no fixed alpha test,
	//    so the spec records a shader-emulation hint instead of a GL enum.
	// ----------------------------------------------------------------------
	set_state(D3DRS_ALPHATESTENABLE, TRUE, "SetRenderState ALPHATESTENABLE TRUE failed");
	set_state(D3DRS_ALPHAFUNC, D3DCMP_GREATER, "SetRenderState ALPHAFUNC GREATER failed");
	set_state(D3DRS_ALPHAREF, 128, "SetRenderState ALPHAREF 128 failed");
	DWORD aref = 0;
	expect(SUCCEEDED(device->GetRenderState(D3DRS_ALPHAREF, &aref)) && aref == 128,
		"ALPHAREF round-trip");
	const int alphafunc_gl = map_cmp_func(D3DCMP_GREATER);
	expect(alphafunc_gl == GL_GREATER, "ALPHAFUNC GREATER maps to GL_GREATER");
	set_state(D3DRS_ALPHATESTENABLE, FALSE, "SetRenderState ALPHATESTENABLE FALSE failed");

	// ----------------------------------------------------------------------
	// 5. Color write mask round-trip.
	// ----------------------------------------------------------------------
	const DWORD color_write_all =
		D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
		D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA;
	set_state(D3DRS_COLORWRITEENABLE, color_write_all, "SetRenderState COLORWRITEENABLE all failed");
	DWORD cw = 0;
	expect(SUCCEEDED(device->GetRenderState(D3DRS_COLORWRITEENABLE, &cw)) && cw == color_write_all,
		"COLORWRITEENABLE all round-trip");

	// ----------------------------------------------------------------------
	// 6. SHADEMODE across the fixed-function D3D values.
	// ----------------------------------------------------------------------
	set_state(D3DRS_SHADEMODE, D3DSHADE_FLAT, "SetRenderState SHADEMODE FLAT failed");
	expect_last(D3DRS_SHADEMODE, D3DSHADE_FLAT);
	set_state(D3DRS_SHADEMODE, D3DSHADE_GOURAUD, "SetRenderState SHADEMODE GOURAUD failed");
	expect_last(D3DRS_SHADEMODE, D3DSHADE_GOURAUD);
	set_state(D3DRS_SHADEMODE, D3DSHADE_PHONG, "SetRenderState SHADEMODE PHONG failed");
	expect_last(D3DRS_SHADEMODE, D3DSHADE_PHONG);

	DWORD shade = 0;
	expect(SUCCEEDED(device->GetRenderState(D3DRS_SHADEMODE, &shade)) && shade == D3DSHADE_PHONG,
		"SHADEMODE PHONG round-trip");

	// ----------------------------------------------------------------------
	// 7. LIGHTING flag and packed AMBIENT color.
	// ----------------------------------------------------------------------
	set_state(D3DRS_LIGHTING, FALSE, "SetRenderState LIGHTING FALSE failed");
	expect_last(D3DRS_LIGHTING, FALSE);
	set_state(D3DRS_LIGHTING, TRUE, "SetRenderState LIGHTING TRUE failed");
	expect_last(D3DRS_LIGHTING, TRUE);
	const DWORD ambient_color = 0xff405060UL;
	set_state(D3DRS_AMBIENT, ambient_color, "SetRenderState AMBIENT failed");
	expect_last(D3DRS_AMBIENT, ambient_color);

	DWORD ambient = 0;
	expect(SUCCEEDED(device->GetRenderState(D3DRS_AMBIENT, &ambient)) && ambient == ambient_color,
		"AMBIENT round-trip");

	// ----------------------------------------------------------------------
	// Counter / probe bookkeeping checks.
	// ----------------------------------------------------------------------
	const UINT sets_emitted = 3 + 3 + 2 + 2 + 4 + 2 + 3 + 1 + 1 + 3 + 3; // cull,zenable,zwrite,zfunc,blend(4),blendop2,alpha(3),colorwrite,shade,lighting/ambient
	expect(state->set_render_state_calls == set_before + sets_emitted,
		"set_render_state_calls counter mismatch");
	expect(state->last_set_render_state == D3DRS_AMBIENT,
		"last_set_render_state mismatch after ambient");
	expect(state->last_set_render_state_value == ambient_color,
		"last_set_render_state_value mismatch after ambient");
	expect(state->get_render_state_calls > get_before,
		"get_render_state_calls should advance");

	// An unset render state still defaults to 0 through the get path and is
	// observable through the last-get field, matching the existing shim smoke.
	DWORD fog_value = 0xDEAD;
	expect(SUCCEEDED(device->GetRenderState(D3DRS_FOGENABLE, &fog_value)),
		"GetRenderState FOGENABLE failed");
	expect(fog_value == 0, "unset render state should default to 0");
	expect(state->last_get_render_state == D3DRS_FOGENABLE,
		"last_get_render_state mismatch");

	device->Release();
	d3d->Release();

	if (g_failures != 0) {
		std::fprintf(stderr, "d3d8-render-state-mapping-smoke: %d failure(s)\n", g_failures);
		return 1;
	}

	// Emit the recorded D3D state + expected GL mapping as a machine-readable
	// spec the future WebGL2 render-state mapping task must satisfy. The exact
	// set/get round-trip is already proven above; this JSON is the contract
	// record, not an additional gate.
	std::printf(
		"{\"ok\":true,\"smoke\":\"d3d8-render-state-mapping\","
		"\"note\":\"D3D8 fixed-function render-state round-trip + expected WebGL2 mapping spec.\","
		"\"cull\":["
		"{\"d3dCullMode\":%d,\"gl\":{\"frontFace\":%d,\"cullFace\":%d,\"enabled\":%d}},"
		"{\"d3dCullMode\":%d,\"gl\":{\"frontFace\":%d,\"cullFace\":%d,\"enabled\":%d}},"
		"{\"d3dCullMode\":%d,\"gl\":{\"frontFace\":%d,\"cullFace\":%d,\"enabled\":%d}}],"
		"\"depth\":["
		"{\"d3dZEnable\":%d,\"d3dZWriteEnable\":%d,\"d3dZFunc\":%d,"
		"\"gl\":{\"depthTest\":%d,\"depthMaskTrue\":%d,\"depthFunc\":%d}},"
		"{\"d3dZEnable\":%d,\"d3dZWriteEnable\":%d,\"d3dZFunc\":%d,"
		"\"gl\":{\"depthTest\":%d,\"depthMaskTrue\":%d,\"depthFunc\":%d}},"
		"{\"d3dZEnable\":%d,\"d3dZWriteEnable\":%d,\"d3dZFunc\":%d,"
		"\"gl\":{\"depthTest\":%d,\"depthMaskTrue\":%d,\"depthFunc\":%d}}],"
		"\"alphaTest\":{\"note\":\"WebGL2 has no fixed alpha test; emulate via shader discard\",\"d3dAlphaTestEnable\":1,"
		"\"d3dAlphaFunc\":%d,\"glAlphaFunc\":%d,\"d3dAlphaRef\":128},"
		"\"blend\":{\"d3dAlphaBlendEnable\":1,\"d3dSrcBlend\":%d,\"glSrcBlend\":%d,"
		"\"d3dDestBlend\":%d,\"glDestBlend\":%d,\"d3dBlendOp\":%d,\"glBlendEquation\":%d},"
		"\"shadeMode\":["
		"{\"d3dShadeMode\":%d,\"name\":\"flat\",\"webgl\":{\"useFlatVarying\":true,\"firstVertexConvention\":true}},"
		"{\"d3dShadeMode\":%d,\"name\":\"gouraud\",\"webgl\":{\"useFlatVarying\":false}},"
		"{\"d3dShadeMode\":%d,\"name\":\"phong\",\"webgl\":{\"useFlatVarying\":false,\"note\":\"not used by current original sources\"}}],"
		"\"lighting\":{\"d3dLightingEnable\":1,\"browserDescriptor\":{\"enabled\":true}},"
		"\"ambient\":{\"d3dAmbient\":%lu,\"rgba\":[%0.6f,%0.6f,%0.6f,%0.6f]},"
		"\"colorWrite\":{\"d3dColorWriteEnable\":%lu,"
		"\"glColorMask\":{\"r\":%s,\"g\":%s,\"b\":%s,\"a\":%s}},"
		"\"counters\":{\"setRenderState\":%u,\"getRenderState\":%u}}\n",
		// cull spec entries
		D3DCULL_NONE, cull_none.front_face, cull_none.cull_face, cull_none.enabled,
		D3DCULL_CW,   cull_cw.front_face,   cull_cw.cull_face,   cull_cw.enabled,
		D3DCULL_CCW,  cull_ccw.front_face,  cull_ccw.cull_face,  cull_ccw.enabled,
		// depth spec entries
		D3DZB_FALSE, D3DZB_TRUE, D3DCMP_LESSEQUAL,
		depth_off.test_enabled, depth_off.depth_mask_true, depth_off.depth_func,
		D3DZB_TRUE,  D3DZB_TRUE, D3DCMP_LESSEQUAL,
		depth_on.test_enabled,  depth_on.depth_mask_true,  depth_on.depth_func,
		D3DZB_USEW,  D3DZB_TRUE, D3DCMP_LESSEQUAL,
		depth_w.test_enabled,   depth_w.depth_mask_true,   depth_w.depth_func,
		// alpha test spec
		D3DCMP_GREATER, alphafunc_gl,
		// blend spec
		D3DBLEND_SRCALPHA, src_gl,
		D3DBLEND_INVSRCALPHA, dst_gl,
		D3DBLENDOP_ADD, op_gl,
		D3DSHADE_FLAT,
		D3DSHADE_GOURAUD,
		D3DSHADE_PHONG,
		static_cast<unsigned long>(ambient_color),
		static_cast<double>((ambient_color >> 16) & 0xff) / 255.0,
		static_cast<double>((ambient_color >> 8) & 0xff) / 255.0,
		static_cast<double>(ambient_color & 0xff) / 255.0,
		static_cast<double>((ambient_color >> 24) & 0xff) / 255.0,
		// color write spec
		static_cast<unsigned long>(color_write_all),
		(color_write_all & D3DCOLORWRITEENABLE_RED) ? "true" : "false",
		(color_write_all & D3DCOLORWRITEENABLE_GREEN) ? "true" : "false",
		(color_write_all & D3DCOLORWRITEENABLE_BLUE) ? "true" : "false",
		(color_write_all & D3DCOLORWRITEENABLE_ALPHA) ? "true" : "false",
		// counters
		state->set_render_state_calls,
		state->get_render_state_calls);

	return 0;
}
