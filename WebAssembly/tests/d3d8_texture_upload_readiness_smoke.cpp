// D3D8 texture upload readiness expectations smoke.
//
// This is a focused, non-overlapping M4 slice that records the D3D8 texture
// surface the engine uses (CreateTexture with the runtime texture formats,
// mipmap level halving, per-format pitch, LockRect/UnlockRect backing-store
// reads/writes, GetSurfaceLevel AddRef) through the *existing* browser D3D8
// shim, WITHOUT touching the WebGL2 draw bridge (WebAssembly/harness/bridge.js)
// or the shim itself (WebAssembly/src/wasm_d3d8_shim.*).
//
// It mirrors d3d8_render_state_mapping_smoke.cpp and does two things:
//
//   1. Proves the shim's CPU-side texture surface round-trips the exact
//      per-format dimensions, pitch, level halving, and LockRect pointer
//      arithmetic the browser texture-upload bridge reads from. Observed
//      through the probe counters and last-value fields in WasmD3D8ShimState.
//      This is the foundation the full DDS/DXT -> GL texture upload must stand
//      on as the bridge expands beyond uncompressed CPU-backed surfaces.
//
//   2. Records the EXPECTED D3D8 texture format -> WebGL2 (OpenGL ES 3.0 /
//      GLSL ES) mapping as a machine-readable JSON spec emitted on success.
//      The future "Texture upload: DDS/DXT decode (or transcode) -> GL
//      textures; mipmaps." M4 task must satisfy this contract. The mapping is
//      computed locally in this test from the canonical D3D8 byte layout;
//      neither the shim nor the draw bridge is changed, so a future change
//      that wires the real GL texture upload can diff its emitted state
//      against this recorded spec.
//
// Key D3D8 -> WebGL2 texture mapping subtleties captured here (these are the
// failure modes a naive upload gets wrong and that the spec is meant to pin):
//
//   * CHANNEL ORDER: D3DCOLOR / D3DFMT_A8R8G8B8 / D3DFMT_X8R8G8B8 store pixels
//     as a little-endian DWORD `0xAARRGGBB`, so the in-memory byte order is
//     B,G,R,A. WebGL2 / OpenGL ES 3.0 do NOT accept GL_BGRA as a texImage2D
//     format, so A8R8G8B8/X8R8G8B8 must be byte-swizzled (B,R swapped) to
//     GL_RGBA / GL_UNSIGNED_BYTE at upload time. X8R8G8B8 must additionally
//     force alpha to 0xFF.
//
//   * 16-BIT PACKED FORMATS: D3D R5G6B5 matches GL_UNSIGNED_SHORT_5_6_5
//     channel-for-channel. D3D A4R4G4B4 and A1R5G5B5 do NOT match GL's
//     UNSIGNED_SHORT_4_4_4_4 / UNSIGNED_SHORT_1_5_5_5 layouts (D3D is
//     ARGB-ordered in the high bits, GL is RGBA/BGRA-ordered), so the reliable
//     WebGL2 path is to expand them to RGBA8 on upload.
//
//   * LUMINANCE / ALPHA: WebGL2 removed GL_ALPHA / GL_LUMINANCE sized formats.
//     D3DFMT_A8 -> GL_R8 (alpha-as-red), D3DFMT_L8 -> GL_R8 (luminance-as-red),
//     D3DFMT_A8L8 -> GL_RG8 (luminance-as-red, alpha-as-green). The shader
//     must reconstruct the original .rgb/.a channels from .r/.g via swizzle.
//
//   * PALETTE: D3DFMT_P8 has no GL equivalent; it must be decoded through the
//     engine's 256-entry ARGB palette to RGBA8 on the CPU before upload.
//
//   * BLOCK COMPRESSED (DDS/DXT): D3DFMT_DXT1/DXT3/DXT5 map to
//     WEBGL_compressed_texture_s3tc extensions. Pitch is block-based, not
//     row-based: bytes = ceil(w/4) * ceil(h/4) * blockSize (8 for DXT1,
//     16 for DXT3/DXT5). The shim's CPU surface now models that block pitch
//     and level size directly so focused synthetic DXT blocks can flow through
//     LockRect/UnlockRect into the browser compressed texture bridge.
//
// The test passes only if every format's CPU surface round-trips the recorded
// dimensions/pitch/pointer arithmetic and the probe counters update as
// expected. The emitted JSON spec is documentation, not an additional gate.

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

// GL symbolic constants. Intentionally plain integers so the test stays
// dependency-free and the recorded spec stays stable; they mirror the
// WebGL2 / OpenGL ES 3.0 enum values.
enum GlEnum : int {
	GL_R8 = 0x8229,
	GL_RG8 = 0x822B,
	GL_RGB8 = 0x8051,
	GL_RGBA8 = 0x8058,
	GL_RGB565 = 0x8D62,
	GL_RGB5_A1 = 0x8057,
	GL_RGBA4 = 0x8056,
	GL_RED = 0x1903,
	GL_RG = 0x8227,
	GL_RGB = 0x1907,
	GL_RGBA = 0x1908,
	GL_UNSIGNED_BYTE = 0x1401,
	GL_UNSIGNED_SHORT_5_6_5 = 0x8363,
	GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0,
	GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2,
	GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3
};

// Expected D3D8 -> WebGL2 mapping for an uncompressed runtime texture format.
// `byteSwizzle` records whether the upload path must swap byte channels (the
// ARGB-vs-RGBA / BGRA cases). `expandToRgba8` records whether the format must
// be expanded to RGBA8 because no matching GL packed type exists.
struct TextureFormatMapping {
	DWORD d3d_format;
	int expected_bpp;       // bytes per pixel; 0 for block-compressed formats
	int gl_internalformat;
	int gl_format;
	int gl_type;
	bool compressed;        // DXT-style block format
	int block_bytes;        // 0 for uncompressed; 8 (DXT1) / 16 (DXT3,DXT5)
	bool byte_swizzle;      // upload must byte-swap channels
	bool expand_to_rgba8;   // upload must expand to RGBA8
	bool alpha_force_opaque;// X-variant: alpha must be forced to 0xFF
	bool palette_decode;    // P8: must decode through engine ARGB palette
	const char *shader_hint; // documentation only
};

const TextureFormatMapping *lookup_mapping(DWORD d3d_format)
{
	static const TextureFormatMapping table[] = {
		{ D3DFMT_A8R8G8B8, 4, GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE,
			false, 0, true, false, false, false,
			"ARGB DWORD little-endian => in-memory B,G,R,A; WebGL2 has no GL_BGRA texImage2D, byte-swizzle B/R on upload" },
		{ D3DFMT_X8R8G8B8, 4, GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE,
			false, 0, true, false, true, false,
			"XRGB DWORD little-endian => B,G,R,A; byte-swizzle B/R and force A=0xFF on upload" },
		{ D3DFMT_R5G6B5, 2, GL_RGB565, GL_RGB, GL_UNSIGNED_SHORT_5_6_5,
			false, 0, false, false, false, false,
			"WORD layout matches GL_UNSIGNED_SHORT_5_6_5 channel-for-channel; no swizzle" },
		{ D3DFMT_A1R5G5B5, 2, GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE,
			false, 0, false, true, false, false,
			"D3D A1R5G5B5 (ARGB-MSB) != GL 1_5_5_5 (RGBA/BGRA) layouts; expand to RGBA8 on upload" },
		{ D3DFMT_A4R4G4B4, 2, GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE,
			false, 0, false, true, false, false,
			"D3D A4R4G4B4 (ARGB-MSB) != GL 4_4_4_4 (RGBA) layout; expand to RGBA8 on upload" },
		{ D3DFMT_A8, 1, GL_R8, GL_RED, GL_UNSIGNED_BYTE,
			false, 0, false, false, false, false,
			"single alpha byte; map to GL_R8 (alpha-as-red), shader swizzle a=r" },
		{ D3DFMT_L8, 1, GL_R8, GL_RED, GL_UNSIGNED_BYTE,
			false, 0, false, false, false, false,
			"single luminance byte; map to GL_R8 (luminance-as-red), shader swizzle rgb=r" },
		{ D3DFMT_A8L8, 2, GL_RG8, GL_RG, GL_UNSIGNED_BYTE,
			false, 0, false, false, false, false,
			"L,A byte pair; map to GL_RG8 (r=L,g=A), shader swizzle rgb=r,a=g" },
		{ D3DFMT_P8, 1, GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE,
			false, 0, false, true, false, true,
			"8-bit palette index; no GL equivalent, decode through engine 256-entry ARGB palette before upload" },
		{ D3DFMT_DXT1, 0, GL_COMPRESSED_RGB_S3TC_DXT1_EXT, 0, 0,
			true, 8, false, false, false, false,
			"block compressed, 8 bytes per 4x4 block; upload via compressedTexImage2D" },
		{ D3DFMT_DXT3, 0, GL_COMPRESSED_RGBA_S3TC_DXT3_EXT, 0, 0,
			true, 16, false, false, false, false,
			"block compressed, 16 bytes per 4x4 block; DXT2 is the premultiplied-alpha twin" },
		{ D3DFMT_DXT5, 0, GL_COMPRESSED_RGBA_S3TC_DXT5_EXT, 0, 0,
			true, 16, false, false, false, false,
			"block compressed, 16 bytes per 4x4 block; DXT4 is the premultiplied-alpha twin" },
	};
	for (const TextureFormatMapping &entry : table) {
		if (entry.d3d_format == d3d_format) {
			return &entry;
		}
	}
	return nullptr;
}

// Block pitch for DXT formats: bytes for one full mip level (4x4 block grid).
// The minimum block footprint is a single 4x4 block.
UINT dxt_level_bytes(UINT width, UINT height, int block_bytes)
{
	const UINT blocks_x = (width + 3) / 4;
	const UINT blocks_y = (height + 3) / 4;
	return blocks_x * blocks_y * static_cast<UINT>(block_bytes);
}

// Records the expected per-level (width, height) for a D3D mip chain, which
// halves each dimension down to 1x1 (matching the shim's BrowserD3DTexture
// ctor halving logic).
void expected_level_dims(UINT width, UINT height, UINT level, UINT &out_w, UINT &out_h)
{
	UINT w = width;
	UINT h = height;
	for (UINT i = 0; i < level; ++i) {
		if (w > 1) {
			w /= 2;
		}
		if (h > 1) {
			h /= 2;
		}
	}
	out_w = w;
	out_h = h;
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
	const UINT create_before = state->create_texture_calls;
	const UINT tex_locks_before = state->texture_lock_rect_calls;
	const UINT tex_unlocks_before = state->texture_unlock_rect_calls;

	// ----------------------------------------------------------------------
	// 1. Per-format uncompressed CPU surface: CreateTexture with a 3-level
	//    mip chain, verify GetLevelCount, per-level halving, level-0 desc
	//    format/type, per-format LockRect pitch, pixel write/read round-trip,
	//    sub-rect pointer arithmetic, and GetSurfaceLevel AddRef.
	// ----------------------------------------------------------------------
	struct UncompressedProbe {
		D3DFORMAT d3d_format;
		UINT width;
		UINT height;
	};
	const UncompressedProbe uncompressed[] = {
		{ D3DFMT_A8R8G8B8, 16, 8 },
		{ D3DFMT_X8R8G8B8, 8, 8 },
		{ D3DFMT_R5G6B5, 16, 16 },
		{ D3DFMT_A1R5G5B5, 8, 8 },
		{ D3DFMT_A4R4G4B4, 8, 8 },
		{ D3DFMT_A8, 4, 4 },
		{ D3DFMT_L8, 4, 4 },
		{ D3DFMT_A8L8, 4, 4 },
	};

	UINT uncompressed_format_count = 0;
	for (const UncompressedProbe &probe : uncompressed) {
		const TextureFormatMapping *mapping = lookup_mapping(probe.d3d_format);
		if (!expect(mapping != nullptr, "uncompressed format missing from mapping table")) {
			continue;
		}

		IDirect3DTexture8 *texture = nullptr;
		const UINT levels_requested = 3;
		if (!expect(SUCCEEDED(device->CreateTexture(probe.width, probe.height, levels_requested, 0,
				probe.d3d_format, D3DPOOL_MANAGED, &texture)),
				"CreateTexture failed for uncompressed format") ||
			!expect(texture != nullptr, "CreateTexture returned null texture")) {
			continue;
		}
		++uncompressed_format_count;

		expect(texture->GetLevelCount() == levels_requested,
			"GetLevelCount mismatch for uncompressed format");

		// Per-level dimension halving.
		for (UINT level = 0; level < levels_requested; ++level) {
			UINT expected_w = 0;
			UINT expected_h = 0;
			expected_level_dims(probe.width, probe.height, level, expected_w, expected_h);
			D3DSURFACE_DESC desc = {};
			if (!expect(SUCCEEDED(texture->GetLevelDesc(level, &desc)),
					"GetLevelDesc failed for uncompressed level") ||
				!expect(desc.Width == expected_w, "uncompressed level width mismatch") ||
				!expect(desc.Height == expected_h, "uncompressed level height mismatch") ||
				!expect(desc.Format == probe.d3d_format,
					"uncompressed level format mismatch") ||
				!expect(desc.Type == D3DRTYPE_SURFACE,
					"uncompressed level resource type mismatch")) {
				break;
			}
		}

		// Level-0 LockRect pitch must equal width * bpp, and a pixel write
		// must read back through the same pointer.
		D3DLOCKED_RECT locked_rect = {};
		const UINT expected_pitch = probe.width * static_cast<UINT>(mapping->expected_bpp);
		if (!expect(SUCCEEDED(texture->LockRect(0, &locked_rect, nullptr, 0)),
				"uncompressed LockRect failed") ||
			!expect(locked_rect.pBits != nullptr,
				"uncompressed LockRect returned null pBits") ||
			!expect(static_cast<UINT>(locked_rect.Pitch) == expected_pitch,
				"uncompressed LockRect pitch mismatch")) {
			texture->Release();
			continue;
		}
		BYTE *base_bits = static_cast<BYTE *>(locked_rect.pBits);
		const UINT pixel_offset = (1 * expected_pitch) + (2 * mapping->expected_bpp);
		for (UINT i = 0; i < static_cast<UINT>(mapping->expected_bpp); ++i) {
			base_bits[pixel_offset + i] = static_cast<BYTE>(0xA0 + i);
		}
		if (!expect(SUCCEEDED(texture->UnlockRect(0)),
				"uncompressed UnlockRect failed")) {
			texture->Release();
			continue;
		}

		// Re-lock to prove the write persisted in the CPU backing store the
		// upload bridge will eventually read from.
		D3DLOCKED_RECT reread_rect = {};
		if (expect(SUCCEEDED(texture->LockRect(0, &reread_rect, nullptr, 0)),
				"uncompressed re-LockRect failed")) {
			BYTE *reread_bits = static_cast<BYTE *>(reread_rect.pBits);
			bool pixel_ok = true;
			for (UINT i = 0; i < static_cast<UINT>(mapping->expected_bpp); ++i) {
				if (reread_bits[pixel_offset + i] != static_cast<BYTE>(0xA0 + i)) {
					pixel_ok = false;
					break;
				}
			}
			expect(pixel_ok, "uncompressed pixel round-trip mismatch");
			expect(SUCCEEDED(texture->UnlockRect(0)), "uncompressed re-UnlockRect failed");
		}

		// Sub-rect lock: same pitch, offset pointer = top*pitch + left*bpp.
		D3DLOCKED_RECT sub_rect_locked = {};
		RECT sub_rect = {};
		sub_rect.left = 2;
		sub_rect.top = 1;
		sub_rect.right = 4;
		sub_rect.bottom = 2;
		if (expect(SUCCEEDED(texture->LockRect(0, &sub_rect_locked, &sub_rect, 0)),
				"uncompressed sub-rect LockRect failed")) {
			BYTE *expected_ptr =
				base_bits + (sub_rect.top * expected_pitch) + (sub_rect.left * mapping->expected_bpp);
			expect(static_cast<BYTE *>(sub_rect_locked.pBits) == expected_ptr,
				"uncompressed sub-rect pBits offset mismatch");
			expect(static_cast<UINT>(sub_rect_locked.Pitch) == expected_pitch,
				"uncompressed sub-rect pitch mismatch");
			expect(SUCCEEDED(texture->UnlockRect(0)), "uncompressed sub-rect UnlockRect failed");
		}

		// GetSurfaceLevel must AddRef and return a surface whose desc matches
		// the level-0 texture desc.
		IDirect3DSurface8 *surface = nullptr;
		if (expect(SUCCEEDED(texture->GetSurfaceLevel(0, &surface)),
				"GetSurfaceLevel failed for uncompressed format")) {
			D3DSURFACE_DESC surface_desc = {};
			if (expect(SUCCEEDED(surface->GetDesc(&surface_desc)),
					"surface GetDesc failed for uncompressed format")) {
				expect(surface_desc.Width == probe.width,
					"GetSurfaceLevel width mismatch");
				expect(surface_desc.Height == probe.height,
					"GetSurfaceLevel height mismatch");
				expect(surface_desc.Format == probe.d3d_format,
					"GetSurfaceLevel format mismatch");
			}
			surface->Release();
		}

		texture->Release();
	}

	// ----------------------------------------------------------------------
	// 2. DXT (block-compressed) surface: CreateTexture through the shim
	//    uses block-compressed pitch/size, LockRect exposes exactly the block
	//    payload bytes, and partial rect locks are rejected until the browser
	//    bridge grows safe block-aligned sub-rectangle uploads.
	// ----------------------------------------------------------------------
	struct DxtProbe {
		D3DFORMAT d3d_format;
		int block_bytes;
	};
	const DxtProbe dxt_formats[] = {
		{ D3DFMT_DXT1, 8 },
		{ D3DFMT_DXT3, 16 },
		{ D3DFMT_DXT5, 16 },
	};

	UINT dxt_gap_count = 0;
	for (const DxtProbe &probe : dxt_formats) {
		const TextureFormatMapping *mapping = lookup_mapping(probe.d3d_format);
		if (!expect(mapping != nullptr, "DXT format missing from mapping table")) {
			continue;
		}

		IDirect3DTexture8 *texture = nullptr;
		const UINT dxt_width = 8;
		const UINT dxt_height = 8;
		const UINT dxt_levels = 1;
		if (!expect(SUCCEEDED(device->CreateTexture(dxt_width, dxt_height, dxt_levels, 0,
				probe.d3d_format, D3DPOOL_MANAGED, &texture)),
				"DXT CreateTexture failed (shim should accept block formats)") ||
			!expect(texture != nullptr, "DXT CreateTexture returned null texture")) {
			continue;
		}
		++dxt_gap_count;

		D3DSURFACE_DESC desc = {};
		if (expect(SUCCEEDED(texture->GetLevelDesc(0, &desc)), "DXT GetLevelDesc failed")) {
			expect(desc.Width == dxt_width && desc.Height == dxt_height,
				"DXT level-0 dimensions mismatch");
			expect(desc.Format == probe.d3d_format, "DXT level-0 format mismatch");

			const UINT real_block_size =
				dxt_level_bytes(dxt_width, dxt_height, probe.block_bytes);
			expect(desc.Size == real_block_size,
				"DXT shim surface size must match real block-compressed byte size");
		}

		D3DLOCKED_RECT locked_rect = {};
		if (expect(SUCCEEDED(texture->LockRect(0, &locked_rect, nullptr, 0)),
				"DXT LockRect failed")) {
			const UINT expected_pitch = ((dxt_width + 3) / 4) * static_cast<UINT>(probe.block_bytes);
			expect(static_cast<UINT>(locked_rect.Pitch) == expected_pitch,
				"DXT shim pitch must match block-compressed row byte count");
			std::memset(locked_rect.pBits, 0x5a, dxt_level_bytes(dxt_width, dxt_height, probe.block_bytes));
			expect(SUCCEEDED(texture->UnlockRect(0)), "DXT UnlockRect failed");
		}
		RECT partial_rect = {};
		partial_rect.left = 0;
		partial_rect.top = 0;
		partial_rect.right = 2;
		partial_rect.bottom = 2;
		D3DLOCKED_RECT partial_locked = {};
		expect(FAILED(texture->LockRect(0, &partial_locked, &partial_rect, 0)),
			"DXT partial rect LockRect should be rejected until block-aligned subrect uploads are implemented");

		texture->Release();
	}

	// ----------------------------------------------------------------------
	// 3. Counter / probe bookkeeping: one CreateTexture per probed format
	//    (uncompressed + DXT), and lock/unlock counters advanced by the
	//    uncompressed round-trip and sub-rect paths.
	// ----------------------------------------------------------------------
	const UINT expected_creates = uncompressed_format_count + dxt_gap_count;
	expect(state->create_texture_calls == create_before + expected_creates,
		"create_texture_calls counter mismatch");
	expect(state->texture_lock_rect_calls > tex_locks_before,
		"texture_lock_rect_calls should advance");
	expect(state->texture_unlock_rect_calls > tex_unlocks_before,
		"texture_unlock_rect_calls should advance");

	device->Release();
	d3d->Release();

	if (g_failures != 0) {
		std::fprintf(stderr, "d3d8-texture-upload-readiness-smoke: %d failure(s)\n", g_failures);
		return 1;
	}

	// Emit the recorded D3D8 texture-format surface + expected WebGL2 mapping
	// as a machine-readable spec the future DDS/DXT -> GL texture upload task
	// must satisfy. The exact surface round-trip is already proven above; this
	// JSON is the contract record, not an additional gate.
	std::printf("{\"ok\":true,\"smoke\":\"d3d8-texture-upload-readiness\","
		"\"note\":\"D3D8 texture surface round-trip + expected WebGL2 upload mapping spec; browser callbacks now cover uncompressed CPU textures and synthetic DXT block textures.\","
		"\"bridgeReady\":false,"
		"\"bridgeGap\":["
		"\"Only the harness stage-0 XYZNDUV draw path applies captured sampler state; multi-stage sampling and generalized texture declaration handling are not wired yet\","
		"\"Real DDS/DXT asset payload loading and asset-derived mip-chain upload remain open beyond the synthetic DXT and mip-chain draw probes\","
		"\"A8R8G8B8/X8R8G8B8 require a B/R byte-swizzle on upload because WebGL2 has no GL_BGRA texImage2D\","
		"\"A1R5G5B5/A4R4G4B4/P8 require CPU expansion/decode to RGBA8 before upload\","
		"\"A8/L8/A8L8 require GL_R8/GL_RG8 plus a shader channel-reconstruction swizzle\","
		"\"DXT partial rect updates remain rejected until block-aligned compressed sub-rectangle uploads are implemented\"],"
		"\"formats\":[");

	bool first_format = true;
	const DWORD all_formats[] = {
		D3DFMT_A8R8G8B8, D3DFMT_X8R8G8B8, D3DFMT_R5G6B5, D3DFMT_A1R5G5B5,
		D3DFMT_A4R4G4B4, D3DFMT_A8, D3DFMT_L8, D3DFMT_A8L8, D3DFMT_P8,
		D3DFMT_DXT1, D3DFMT_DXT3, D3DFMT_DXT5,
	};
	for (DWORD fmt : all_formats) {
		const TextureFormatMapping *mapping = lookup_mapping(fmt);
		if (mapping == nullptr) {
			continue;
		}
		if (!first_format) {
			std::printf(",");
		}
		first_format = false;
		std::printf(
			"{\"d3dFormat\":%lu,\"bpp\":%d,\"compressed\":%s,"
			"\"gl\":{\"internalFormat\":%d,\"format\":%d,\"type\":%d},"
			"\"upload\":{\"byteSwizzle\":%s,\"expandToRgba8\":%s,"
			"\"alphaForceOpaque\":%s,\"paletteDecode\":%s},"
			"\"blockBytes\":%d,\"shaderHint\":\"%s\"}",
			static_cast<unsigned long>(mapping->d3d_format),
			mapping->expected_bpp,
			mapping->compressed ? "true" : "false",
			mapping->gl_internalformat, mapping->gl_format, mapping->gl_type,
			mapping->byte_swizzle ? "true" : "false",
			mapping->expand_to_rgba8 ? "true" : "false",
			mapping->alpha_force_opaque ? "true" : "false",
			mapping->palette_decode ? "true" : "false",
			mapping->block_bytes,
			mapping->shader_hint);
	}
	std::printf("],"
		"\"mipChain\":{\"note\":\"D3D/W3D mip chain halves width and height per level down to 1x1; per-level uncompressed bytes = pitch*height, DXT bytes = ceil(w/4)*ceil(h/4)*blockBytes\","
		"\"dxtLevel0Bytes8x8Dxt1\":%u,\"dxtLevel0Bytes8x8Dxt3\":%u},"
		"\"counters\":{\"createTexture\":%u,\"textureLockRect\":%u,\"textureUnlockRect\":%u}}\n",
		dxt_level_bytes(8, 8, 8),
		dxt_level_bytes(8, 8, 16),
		state->create_texture_calls,
		state->texture_lock_rect_calls,
		state->texture_unlock_rect_calls);

	return 0;
}
