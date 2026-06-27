// D3D8 texture stage state / sampler mapping expectations smoke.
//
// This is a focused, non-overlapping M4 slice (plan S2 from
// notes/texture_stage_binding_plan.md) that records the D3D8 texture-stage
// sampler/filter/address contract the engine sets through
// `TextureFilterClass::Apply` and direct `Set_DX8_Texture_Stage_State` calls,
// plus the expected D3D8 -> WebGL2 sampler mapping. This expectations smoke
// does not apply sampler state to the WebGL2 draw bridge; it records the
// contract that the later sampler-translation slice must satisfy.
//
// It mirrors d3d8_render_state_mapping_smoke.cpp and d3d8_texture_upload_
// readiness_smoke.cpp and does four things:
//
//   1. Pins the canonical DX8 numeric values of the D3DTSS_*, D3DTADDRESS_*,
//      and D3DTEXF_* enumerations the engine feeds into Set_DX8_Texture_
//      Stage_State, so the mapping tables reference the correct symbols.
//      These are #define constants in the shim header; this smoke asserts the
//      exact wire values so a future GL-sampler translation can diff against a
//      stable contract.
//
//   2. Replicates TextureFilterClass::_Init_Filters() locally, parameterised
//      by the EXACT D3DCAPS8 the browser D3D8 shim reports (TextureFilterCaps,
//      TextureAddressCaps, MaxAnisotropy), and records the resulting per-stage
//      _Min/_Mag/_Mip filter tables for the three FilterType modes plus
//      FILTER_TYPE_DEFAULT. This proves what sampler state Apply() will emit
//      for every (stage, FilterType) pair given the browser capability
//      contract, without depending on the original WW3D _Init_Filters path
//      being linked into the smoke target.
//
//   3. Records the expected D3D8 -> WebGL2 sampler state mapping for the
//      filter/address values produced above (D3DTEXF_* -> GL min/mag filter,
//      D3DTADDRESS_* -> GL wrap S/T, D3DTSS_MAXANISOTROPY -> sampler
//      MAX_ANISOTROPY) as a machine-readable JSON spec. The future S2 task
//      (Translate TextureFilterClass::Apply -> gl.texParameter* / WebGLSampler
//      cache) must satisfy this contract.
//
//   4. Verifies the shim's reported device caps match the capability
//      assumptions the mapping logic uses (linear min/mag/mip supported, no
//      anisotropic, wrap+clamp+mirror addressing, MaxAnisotropy==1).
//
// Key D3D8 -> WebGL2 sampler mapping subtleties captured here (the failure
// modes a naive sampler translation gets wrong and that this spec pins):
//
//   * MIN/MAG/MIP SPLIT: D3D8 carries three independent filter enums
//     (D3DTSS_MINFILTER, D3DTSS_MAGFILTER, D3DTSS_MIPFILTER). WebGL2 collapses
//     min+mip into a single TEXTURE_MIN_FILTER combining a base filter and a
//     mip filter (e.g. GL_LINEAR_MIPMAP_LINEAR), and MAG_FILTER stays
//     separate. A D3DTEXF_NONE mip filter means "no mip sampling" and maps to
//     a base-only GL min filter (GL_LINEAR / GL_NEAREST), NOT GL_*_MIPMAP_*.
//
//   * ANISOTROPIC CAP: The browser shim reports MaxAnisotropy==1 and no
//     anisotropic filter caps, so _Init_Filters falls back to LINEAR for BEST
//     min/mag even under TEXTURE_FILTER_ANISOTROPIC. The mapping records this
//     fallback explicitly; a future WebGPU/capability bump must re-derive the
//     tables.
//
//   * ADDRESS MODE COLLAPSE: D3D8 has separate ADDRESSU/ADDRESSV (and ADDRESSW
//     for volume textures). TextureFilterClass only exposes U/V through
//     TEXTURE_ADDRESS_REPEAT / TEXTURE_ADDRESS_CLAMP, mapped to D3DTADDRESS_
//     WRAP / CLAMP. WebGL2 has separate TEXTURE_WRAP_S / TEXTURE_WRAP_T; the
//     mapping is 1:1 per axis. D3DTADDRESS_MIRROR is reported as a device cap
//     but never selected by TextureFilterClass::Apply.

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

// --- FilterType mirror of TextureFilterClass::FilterType -------------------
enum FilterType {
	FILTER_TYPE_NONE = 0,
	FILTER_TYPE_FAST = 1,
	FILTER_TYPE_BEST = 2,
	FILTER_TYPE_DEFAULT = 3,
	FILTER_TYPE_COUNT = 4
};

enum TextureFilterMode {
	TEXTURE_FILTER_BILINEAR = 0,
	TEXTURE_FILTER_TRILINEAR = 1,
	TEXTURE_FILTER_ANISOTROPIC = 2
};

enum TxtAddrMode {
	TEXTURE_ADDRESS_REPEAT = 0,
	TEXTURE_ADDRESS_CLAMP = 1
};

const unsigned STAGE_COUNT = 8; // mirrors MAX_TEXTURE_STAGES in dx8wrapper.h

// Locally-replicated _Min/_Mag/_Mip tables populated by init_filters().
unsigned MinFilters[STAGE_COUNT][FILTER_TYPE_COUNT];
unsigned MagFilters[STAGE_COUNT][FILTER_TYPE_COUNT];
unsigned MipFilters[STAGE_COUNT][FILTER_TYPE_COUNT];

// Replicates TextureFilterClass::_Init_Filters() using the same cap-dependent
// decision logic against the supplied D3DCAPS8 filter/address caps. Returns
// the per-stage MAXANISOTROPY value the original code sets (hard-coded 2).
unsigned init_filters(DWORD texture_filter_caps, TextureFilterMode filter_mode)
{
	// Stage 0 base defaults (non-Xbox path).
	MinFilters[0][FILTER_TYPE_NONE] = D3DTEXF_POINT;
	MagFilters[0][FILTER_TYPE_NONE] = D3DTEXF_POINT;
	MipFilters[0][FILTER_TYPE_NONE] = D3DTEXF_NONE;

	MinFilters[0][FILTER_TYPE_FAST] = D3DTEXF_LINEAR;
	MagFilters[0][FILTER_TYPE_FAST] = D3DTEXF_LINEAR;
	MipFilters[0][FILTER_TYPE_FAST] = D3DTEXF_POINT;

	// Original seeds BEST with POINT/POINT/POINT, then upgrades per caps.
	MagFilters[0][FILTER_TYPE_BEST] = D3DTEXF_POINT;
	MinFilters[0][FILTER_TYPE_BEST] = D3DTEXF_POINT;
	MipFilters[0][FILTER_TYPE_BEST] = D3DTEXF_POINT;

	if (texture_filter_caps & D3DPTFILTERCAPS_MAGFLINEAR) {
		MagFilters[0][FILTER_TYPE_BEST] = D3DTEXF_LINEAR;
	}
	if (texture_filter_caps & D3DPTFILTERCAPS_MINFLINEAR) {
		MinFilters[0][FILTER_TYPE_BEST] = D3DTEXF_LINEAR;
	}

	// Anisotropic only if requested AND cap present.
	if (filter_mode == TEXTURE_FILTER_ANISOTROPIC) {
		if (texture_filter_caps & D3DPTFILTERCAPS_MAGFANISOTROPIC) {
			MagFilters[0][FILTER_TYPE_BEST] = D3DTEXF_ANISOTROPIC;
		}
		if (texture_filter_caps & D3DPTFILTERCAPS_MINFANISOTROPIC) {
			MinFilters[0][FILTER_TYPE_BEST] = D3DTEXF_ANISOTROPIC;
		}
	}

	// Linear mip filter only for trilinear/anisotropic requests with the cap.
	if (filter_mode == TEXTURE_FILTER_ANISOTROPIC || filter_mode == TEXTURE_FILTER_TRILINEAR) {
		if (texture_filter_caps & D3DPTFILTERCAPS_MIPFLINEAR) {
			MipFilters[0][FILTER_TYPE_BEST] = D3DTEXF_LINEAR;
		}
	}

	// Stages 1..7 inherit from the previous stage, except anisotropic BEST is
	// downgraded to LINEAR (multi-stage anisotropic is not universally useful).
	for (unsigned i = 1; i < STAGE_COUNT; ++i) {
		MinFilters[i][FILTER_TYPE_NONE] = MinFilters[i - 1][FILTER_TYPE_NONE];
		MagFilters[i][FILTER_TYPE_NONE] = MagFilters[i - 1][FILTER_TYPE_NONE];
		MipFilters[i][FILTER_TYPE_NONE] = MipFilters[i - 1][FILTER_TYPE_NONE];

		MinFilters[i][FILTER_TYPE_FAST] = MinFilters[i - 1][FILTER_TYPE_FAST];
		MagFilters[i][FILTER_TYPE_FAST] = MagFilters[i - 1][FILTER_TYPE_FAST];
		MipFilters[i][FILTER_TYPE_FAST] = MipFilters[i - 1][FILTER_TYPE_FAST];

		MagFilters[i][FILTER_TYPE_BEST] = (MagFilters[i - 1][FILTER_TYPE_BEST] == D3DTEXF_ANISOTROPIC)
			? D3DTEXF_LINEAR : MagFilters[i - 1][FILTER_TYPE_BEST];
		MinFilters[i][FILTER_TYPE_BEST] = (MinFilters[i - 1][FILTER_TYPE_BEST] == D3DTEXF_ANISOTROPIC)
			? D3DTEXF_LINEAR : MinFilters[i - 1][FILTER_TYPE_BEST];
		MipFilters[i][FILTER_TYPE_BEST] = MipFilters[i - 1][FILTER_TYPE_BEST];
	}

	// DEFAULT == BEST for every stage; record the original MAXANISOTROPY=2.
	for (unsigned i = 0; i < STAGE_COUNT; ++i) {
		MinFilters[i][FILTER_TYPE_DEFAULT] = MinFilters[i][FILTER_TYPE_BEST];
		MagFilters[i][FILTER_TYPE_DEFAULT] = MagFilters[i][FILTER_TYPE_BEST];
		MipFilters[i][FILTER_TYPE_DEFAULT] = MipFilters[i][FILTER_TYPE_BEST];
	}
	return 2;
}

// --- Expected GL symbolic enum values (WebGL2 / OpenGL ES 3.0). ------------
// Plain integers (not GL headers) so the test stays dependency-free and the
// recorded spec stays stable.
enum GlEnum : int {
	GL_NEAREST_ENUM = 0x2600,
	GL_LINEAR_ENUM = 0x2601,
	GL_NEAREST_MIPMAP_NEAREST = 0x2700,
	GL_LINEAR_MIPMAP_NEAREST = 0x2701,
	GL_NEAREST_MIPMAP_LINEAR = 0x2702,
	GL_LINEAR_MIPMAP_LINEAR = 0x2703,
	GL_REPEAT = 0x2901,
	GL_CLAMP_TO_EDGE = 0x812F,
	GL_MIRRORED_REPEAT = 0x8370
};

// D3DTEXF_* -> GL min/mag base filter. ANISOTROPIC is not supported by the
// shim caps so it should never appear in the derived tables, but we map it to
// LINEAR as a safe fallback for completeness.
int map_mag_filter(DWORD d3d_mag)
{
	switch (d3d_mag) {
	case D3DTEXF_POINT: return GL_NEAREST_ENUM;
	case D3DTEXF_LINEAR:
	case D3DTEXF_ANISOTROPIC: return GL_LINEAR_ENUM;
	default: return -1;
	}
}

// Combines a D3D min filter + mip filter into a single GL TEXTURE_MIN_FILTER
// enum. This is the canonical D3D -> GL min/mip collapse.
int map_min_filter(DWORD d3d_min, DWORD d3d_mip)
{
	const int gl_min = (d3d_min == D3DTEXF_LINEAR || d3d_min == D3DTEXF_ANISOTROPIC)
		? GL_LINEAR_ENUM : GL_NEAREST_ENUM;
	switch (d3d_mip) {
	case D3DTEXF_NONE: return gl_min; // base only, no mip sampling
	case D3DTEXF_POINT:
		return (gl_min == GL_LINEAR_ENUM) ? GL_LINEAR_MIPMAP_NEAREST : GL_NEAREST_MIPMAP_NEAREST;
	case D3DTEXF_LINEAR:
		return (gl_min == GL_LINEAR_ENUM) ? GL_LINEAR_MIPMAP_LINEAR : GL_NEAREST_MIPMAP_LINEAR;
	default: return -1;
	}
}

int map_address(DWORD d3d_addr)
{
	switch (d3d_addr) {
	case D3DTADDRESS_WRAP: return GL_REPEAT;
	case D3DTADDRESS_CLAMP: return GL_CLAMP_TO_EDGE;
	case D3DTADDRESS_MIRROR: return GL_MIRRORED_REPEAT;
	default: return -1;
	}
}

} // namespace

int main()
{
	wasm_d3d8_reset_state();

	// -------------------------------------------------------------------------
	// 1. Pin the canonical DX8 numeric values of the D3DTSS_*/D3DTADDRESS_*/
	//    D3DTEXF_* enumerations. These are the wire values the engine feeds
	//    Set_DX8_Texture_Stage_State and that the future GL sampler mapping
	//    must consume.
	// -------------------------------------------------------------------------
	expect(D3DTSS_MINFILTER == 17, "D3DTSS_MINFILTER value mismatch");
	expect(D3DTSS_MAGFILTER == 16, "D3DTSS_MAGFILTER value mismatch");
	expect(D3DTSS_MIPFILTER == 18, "D3DTSS_MIPFILTER value mismatch");
	expect(D3DTSS_ADDRESSU == 13, "D3DTSS_ADDRESSU value mismatch");
	expect(D3DTSS_ADDRESSV == 14, "D3DTSS_ADDRESSV value mismatch");
	expect(D3DTSS_ADDRESSW == 25, "D3DTSS_ADDRESSW value mismatch");
	expect(D3DTSS_MAXANISOTROPY == 21, "D3DTSS_MAXANISOTROPY value mismatch");
	expect(D3DTSS_TEXCOORDINDEX == 11, "D3DTSS_TEXCOORDINDEX value mismatch");
	expect(D3DTSS_TEXTURETRANSFORMFLAGS == 24, "D3DTSS_TEXTURETRANSFORMFLAGS value mismatch");

	expect(D3DTEXF_NONE == 0, "D3DTEXF_NONE value mismatch");
	expect(D3DTEXF_POINT == 1, "D3DTEXF_POINT value mismatch");
	expect(D3DTEXF_LINEAR == 2, "D3DTEXF_LINEAR value mismatch");
	expect(D3DTEXF_ANISOTROPIC == 3, "D3DTEXF_ANISOTROPIC value mismatch");

	expect(D3DTADDRESS_WRAP == 1, "D3DTADDRESS_WRAP value mismatch");
	expect(D3DTADDRESS_MIRROR == 2, "D3DTADDRESS_MIRROR value mismatch");
	expect(D3DTADDRESS_CLAMP == 3, "D3DTADDRESS_CLAMP value mismatch");
	expect(D3DTADDRESS_BORDER == 4, "D3DTADDRESS_BORDER value mismatch");
	expect(D3DTADDRESS_MIRRORONCE == 5, "D3DTADDRESS_MIRRORONCE value mismatch");

	// TxtAddrMode (TextureFilterClass) maps 1:1 to the D3D address enums.
	expect(static_cast<DWORD>(TEXTURE_ADDRESS_REPEAT) == 0
		&& D3DTADDRESS_WRAP == 1, "TxtAddrMode REPEAT is an index, not the D3D enum");
	expect(static_cast<DWORD>(TEXTURE_ADDRESS_CLAMP) == 1, "TxtAddrMode CLAMP index mismatch");

	// -------------------------------------------------------------------------
	// 2. Bring up the shim device purely to read its reported caps. We do NOT
	//    exercise SetTextureStageState here; d3d8-shim-smoke covers draw-time
	//    capture, while this smoke records the caps contract the local
	//    _Init_Filters replication keys off.
	// -------------------------------------------------------------------------
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

	D3DCAPS8 caps = {};
	if (!expect(SUCCEEDED(device->GetDeviceCaps(&caps)), "GetDeviceCaps failed")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	// Capability assumptions the mapping logic depends on. These pin the
	// browser D3D8 shim's sampler capability contract.
	expect((caps.TextureFilterCaps & D3DPTFILTERCAPS_MINFLINEAR) != 0,
		"shim caps must advertise MINFLINEAR for BEST min filter");
	expect((caps.TextureFilterCaps & D3DPTFILTERCAPS_MAGFLINEAR) != 0,
		"shim caps must advertise MAGFLINEAR for BEST mag filter");
	expect((caps.TextureFilterCaps & D3DPTFILTERCAPS_MIPFLINEAR) != 0,
		"shim caps must advertise MIPFLINEAR (used by trilinear/anisotropic path)");
	expect((caps.TextureFilterCaps & D3DPTFILTERCAPS_MINFANISOTROPIC) == 0,
		"shim caps must NOT advertise anisotropic (MaxAnisotropy==1)");
	expect((caps.TextureFilterCaps & D3DPTFILTERCAPS_MAGFANISOTROPIC) == 0,
		"shim caps must NOT advertise mag anisotropic");
	expect(caps.MaxAnisotropy == 1, "shim caps MaxAnisotropy must be 1");
	expect((caps.TextureAddressCaps & D3DTADDRESS_WRAP) != 0, "address caps must include WRAP");
	expect((caps.TextureAddressCaps & D3DTADDRESS_CLAMP) != 0, "address caps must include CLAMP");
	expect((caps.TextureAddressCaps & D3DTADDRESS_MIRROR) != 0, "address caps must include MIRROR");

	// -------------------------------------------------------------------------
	// 3. Replicate _Init_Filters for each TextureFilterMode the engine
	//    selects, and verify the derived tables match the expected cap-driven
	//    outcome. BILINEAR is the runtime default.
	// -------------------------------------------------------------------------
	const DWORD filter_caps = caps.TextureFilterCaps;
	const unsigned expected_max_aniso = init_filters(filter_caps, TEXTURE_FILTER_BILINEAR);
	expect(expected_max_aniso == 2, "_Init_Filters should set MAXANISOTROPY=2");

	// Stage 0 BILINEAR (no anisotropic, no trilinear): BEST min/mag upgraded
	// to LINEAR by caps; mip stays POINT (only trilinear/anisotropic upgrades
	// mip to LINEAR). DEFAULT == BEST.
	expect(MinFilters[0][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
		"stage0 BEST min filter should be LINEAR under bilinear mode");
	expect(MagFilters[0][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
		"stage0 BEST mag filter should be LINEAR under bilinear mode");
	expect(MipFilters[0][FILTER_TYPE_BEST] == D3DTEXF_POINT,
		"stage0 BEST mip filter should stay POINT under bilinear mode");
	expect(MinFilters[0][FILTER_TYPE_DEFAULT] == MinFilters[0][FILTER_TYPE_BEST],
		"DEFAULT min must mirror BEST");
	expect(MipFilters[0][FILTER_TYPE_DEFAULT] == MipFilters[0][FILTER_TYPE_BEST],
		"DEFAULT mip must mirror BEST");

	// NONE / FAST are cap-independent.
	expect(MinFilters[0][FILTER_TYPE_NONE] == D3DTEXF_POINT
		&& MagFilters[0][FILTER_TYPE_NONE] == D3DTEXF_POINT
		&& MipFilters[0][FILTER_TYPE_NONE] == D3DTEXF_NONE,
		"stage0 NONE filter row mismatch");
	expect(MinFilters[0][FILTER_TYPE_FAST] == D3DTEXF_LINEAR
		&& MagFilters[0][FILTER_TYPE_FAST] == D3DTEXF_LINEAR
		&& MipFilters[0][FILTER_TYPE_FAST] == D3DTEXF_POINT,
		"stage0 FAST filter row mismatch");

	// Stages 1..7 inherit from stage 0 under bilinear (no anisotropic to
	// downgrade).
	for (unsigned i = 1; i < STAGE_COUNT; ++i) {
		expect(MinFilters[i][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
			"stage>0 BEST min should inherit LINEAR under bilinear");
		expect(MipFilters[i][FILTER_TYPE_BEST] == D3DTEXF_POINT,
			"stage>0 BEST mip should inherit POINT under bilinear");
	}

	// Trilinear mode upgrades mip to LINEAR (MIPFLINEAR cap present).
	init_filters(filter_caps, TEXTURE_FILTER_TRILINEAR);
	expect(MipFilters[0][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
		"trilinear mode should upgrade stage0 BEST mip to LINEAR");
	expect(MinFilters[0][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
		"trilinear mode keeps stage0 BEST min LINEAR");

	// Anisotropic mode: caps lack anisotropic, so BEST min/mag fall back to
	// LINEAR (not ANISOTROPIC) and mip upgrades to LINEAR.
	init_filters(filter_caps, TEXTURE_FILTER_ANISOTROPIC);
	expect(MinFilters[0][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
		"anisotropic mode without cap must fall back to LINEAR min");
	expect(MagFilters[0][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
		"anisotropic mode without cap must fall back to LINEAR mag");
	expect(MipFilters[0][FILTER_TYPE_BEST] == D3DTEXF_LINEAR,
		"anisotropic mode upgrades mip to LINEAR (MIPFLINEAR present)");

	// Reset to BILINEAR (the runtime default) for the emitted spec.
	init_filters(filter_caps, TEXTURE_FILTER_BILINEAR);

	// -------------------------------------------------------------------------
	// 4. TextureFilterClass::Apply() address translation: the engine only
	//    exposes REPEAT/CLAMP, mapped to D3DTADDRESS_WRAP/CLAMP. Mirror and
	//    Border addressing are reachable only via direct Set_DX8_Texture_
	//    Stage_State calls (e.g. some water/terrain paths use WRAP directly).
	// -------------------------------------------------------------------------
	expect(map_address(D3DTADDRESS_WRAP) == GL_REPEAT, "WRAP must map to GL_REPEAT");
	expect(map_address(D3DTADDRESS_CLAMP) == GL_CLAMP_TO_EDGE, "CLAMP must map to GL_CLAMP_TO_EDGE");
	expect(map_address(D3DTADDRESS_MIRROR) == GL_MIRRORED_REPEAT,
		"MIRROR must map to GL_MIRRORED_REPEAT");
	// D3DTADDRESS_BORDER (4) and MIRRORONCE (5) have no direct WebGL2 core
	// equivalent without extensions; record them as unsupported here.
	expect(map_address(D3DTADDRESS_BORDER) == -1, "BORDER has no WebGL2 core mapping");
	expect(map_address(D3DTADDRESS_MIRRORONCE) == -1, "MIRRORONCE has no WebGL2 core mapping");

	// -------------------------------------------------------------------------
	// 5. Filter -> GL min/mag collapse. Verify the canonical D3D min+mip
	//    combinations map to the expected single GL TEXTURE_MIN_FILTER enum.
	// -------------------------------------------------------------------------
	expect(map_mag_filter(D3DTEXF_POINT) == GL_NEAREST_ENUM, "POINT mag -> GL_NEAREST");
	expect(map_mag_filter(D3DTEXF_LINEAR) == GL_LINEAR_ENUM, "LINEAR mag -> GL_LINEAR");

	// min=POINT, mip=NONE  -> GL_NEAREST (base only)
	expect(map_min_filter(D3DTEXF_POINT, D3DTEXF_NONE) == GL_NEAREST_ENUM,
		"POINT/NONE min -> GL_NEAREST");
	// min=LINEAR, mip=NONE -> GL_LINEAR (base only)
	expect(map_min_filter(D3DTEXF_LINEAR, D3DTEXF_NONE) == GL_LINEAR_ENUM,
		"LINEAR/NONE min -> GL_LINEAR");
	// min=LINEAR, mip=POINT -> GL_LINEAR_MIPMAP_NEAREST
	expect(map_min_filter(D3DTEXF_LINEAR, D3DTEXF_POINT) == GL_LINEAR_MIPMAP_NEAREST,
		"LINEAR/POINT min -> GL_LINEAR_MIPMAP_NEAREST");
	// min=LINEAR, mip=LINEAR -> GL_LINEAR_MIPMAP_LINEAR (trilinear)
	expect(map_min_filter(D3DTEXF_LINEAR, D3DTEXF_LINEAR) == GL_LINEAR_MIPMAP_LINEAR,
		"LINEAR/LINEAR min -> GL_LINEAR_MIPMAP_LINEAR");
	// min=POINT, mip=LINEAR -> GL_NEAREST_MIPMAP_LINEAR
	expect(map_min_filter(D3DTEXF_POINT, D3DTEXF_LINEAR) == GL_NEAREST_MIPMAP_LINEAR,
		"POINT/LINEAR min -> GL_NEAREST_MIPMAP_LINEAR");

	device->Release();
	d3d->Release();

	if (g_failures != 0) {
		std::fprintf(stderr, "d3d8-texture-stage-state-mapping-smoke: %d failure(s)\n", g_failures);
		return 1;
	}

	// -------------------------------------------------------------------------
	// Emit the recorded D3D stage-state contract + expected WebGL2 sampler
	// mapping as a machine-readable JSON spec the future S2 sampler task must
	// satisfy. Stage 0 DEFAULT under BILINEAR is the dominant runtime case.
	// -------------------------------------------------------------------------
	const unsigned s0_min = MinFilters[0][FILTER_TYPE_DEFAULT];
	const unsigned s0_mag = MagFilters[0][FILTER_TYPE_DEFAULT];
	const unsigned s0_mip = MipFilters[0][FILTER_TYPE_DEFAULT];
	const int s0_gl_min = map_min_filter(s0_min, s0_mip);
	const int s0_gl_mag = map_mag_filter(s0_mag);

	std::printf(
		"{\"ok\":true,\"smoke\":\"d3d8-texture-stage-state-mapping\","
		"\"note\":\"D3D8 TextureFilterClass::Apply / Set_DX8_Texture_Stage_State sampler contract + expected WebGL2 sampler mapping; sampler application remains open beyond the harness stage-0 draw path.\","
		"\"caps\":{\"textureFilterCaps\":%lu,\"textureAddressCaps\":%lu,\"maxAnisotropy\":%lu,"
		"\"linearMin\":%s,\"linearMag\":%s,\"linearMip\":%s,\"anisotropicMin\":%s,\"anisotropicMag\":%s},"
		"\"stage0Default\":{\"d3dMinFilter\":%u,\"d3dMagFilter\":%u,\"d3dMipFilter\":%u,"
		"\"glMinFilter\":%d,\"glMagFilter\":%d,\"glMaxAnisotropy\":%u},"
		"\"stage0Rows\":["
		"{\"type\":\"none\",\"min\":%u,\"mag\":%u,\"mip\":%u},"
		"{\"type\":\"fast\",\"min\":%u,\"mag\":%u,\"mip\":%u},"
		"{\"type\":\"best\",\"min\":%u,\"mag\":%u,\"mip\":%u},"
		"{\"type\":\"default\",\"min\":%u,\"mag\":%u,\"mip\":%u}],"
		"\"addressMapping\":["
		"{\"d3d\":\"D3DTADDRESS_WRAP\",\"d3dValue\":%d,\"gl\":\"GL_REPEAT\",\"glValue\":%d},"
		"{\"d3d\":\"D3DTADDRESS_CLAMP\",\"d3dValue\":%d,\"gl\":\"GL_CLAMP_TO_EDGE\",\"glValue\":%d},"
		"{\"d3d\":\"D3DTADDRESS_MIRROR\",\"d3dValue\":%d,\"gl\":\"GL_MIRRORED_REPEAT\",\"glValue\":%d},"
		"{\"d3d\":\"D3DTADDRESS_BORDER\",\"d3dValue\":%d,\"gl\":\"(unsupported)\",\"glValue\":-1},"
		"{\"d3d\":\"D3DTADDRESS_MIRRORONCE\",\"d3dValue\":%d,\"gl\":\"(unsupported)\",\"glValue\":-1}],"
		"\"minMipCollapse\":["
		"{\"d3dMin\":\"POINT\",\"d3dMip\":\"NONE\",\"gl\":\"GL_NEAREST\",\"glValue\":%d},"
		"{\"d3dMin\":\"LINEAR\",\"d3dMip\":\"NONE\",\"gl\":\"GL_LINEAR\",\"glValue\":%d},"
		"{\"d3dMin\":\"LINEAR\",\"d3dMip\":\"POINT\",\"gl\":\"GL_LINEAR_MIPMAP_NEAREST\",\"glValue\":%d},"
		"{\"d3dMin\":\"LINEAR\",\"d3dMip\":\"LINEAR\",\"gl\":\"GL_LINEAR_MIPMAP_LINEAR\",\"glValue\":%d},"
		"{\"d3dMin\":\"POINT\",\"d3dMip\":\"LINEAR\",\"gl\":\"GL_NEAREST_MIPMAP_LINEAR\",\"glValue\":%d}],"
		"\"applyEmits\":["
		"{\"d3dTss\":\"D3DTSS_MINFILTER\",\"d3dTssValue\":%d},"
		"{\"d3dTss\":\"D3DTSS_MAGFILTER\",\"d3dTssValue\":%d},"
		"{\"d3dTss\":\"D3DTSS_MIPFILTER\",\"d3dTssValue\":%d},"
		"{\"d3dTss\":\"D3DTSS_ADDRESSU\",\"d3dTssValue\":\"UAddrMode==REPEAT?WRAP:CLAMP\"},"
		"{\"d3dTss\":\"D3DTSS_ADDRESSV\",\"d3dTssValue\":\"VAddrMode==REPEAT?WRAP:CLAMP\"}]}\n",
		// caps
		static_cast<unsigned long>(caps.TextureFilterCaps),
		static_cast<unsigned long>(caps.TextureAddressCaps),
		static_cast<unsigned long>(caps.MaxAnisotropy),
		(filter_caps & D3DPTFILTERCAPS_MINFLINEAR) ? "true" : "false",
		(filter_caps & D3DPTFILTERCAPS_MAGFLINEAR) ? "true" : "false",
		(filter_caps & D3DPTFILTERCAPS_MIPFLINEAR) ? "true" : "false",
		(filter_caps & D3DPTFILTERCAPS_MINFANISOTROPIC) ? "true" : "false",
		(filter_caps & D3DPTFILTERCAPS_MAGFANISOTROPIC) ? "true" : "false",
		// stage0 default
		s0_min, s0_mag, s0_mip, s0_gl_min, s0_gl_mag, expected_max_aniso,
		// stage0 rows
		MinFilters[0][FILTER_TYPE_NONE], MagFilters[0][FILTER_TYPE_NONE], MipFilters[0][FILTER_TYPE_NONE],
		MinFilters[0][FILTER_TYPE_FAST], MagFilters[0][FILTER_TYPE_FAST], MipFilters[0][FILTER_TYPE_FAST],
		MinFilters[0][FILTER_TYPE_BEST], MagFilters[0][FILTER_TYPE_BEST], MipFilters[0][FILTER_TYPE_BEST],
		MinFilters[0][FILTER_TYPE_DEFAULT], MagFilters[0][FILTER_TYPE_DEFAULT], MipFilters[0][FILTER_TYPE_DEFAULT],
		// address mapping
		D3DTADDRESS_WRAP, GL_REPEAT,
		D3DTADDRESS_CLAMP, GL_CLAMP_TO_EDGE,
		D3DTADDRESS_MIRROR, GL_MIRRORED_REPEAT,
		D3DTADDRESS_BORDER,
		D3DTADDRESS_MIRRORONCE,
		// min/mip collapse
		GL_NEAREST_ENUM,
		GL_LINEAR_ENUM,
		GL_LINEAR_MIPMAP_NEAREST,
		GL_LINEAR_MIPMAP_LINEAR,
		GL_NEAREST_MIPMAP_LINEAR,
		// apply emits
		D3DTSS_MINFILTER, D3DTSS_MAGFILTER, D3DTSS_MIPFILTER);

	return 0;
}
