#include "wasm_d3d8_shim.h"

#include "D3dx8core.h"

#include <cstdint>
#include <cstring>
#include <limits>
#include <map>
#include <new>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

#ifdef __EMSCRIPTEN__
EM_JS(void, wasm_d3d8_browser_clear_target, (unsigned int flags, unsigned int color_arg, double z, unsigned int stencil), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8Clear : null;
	if (typeof bridge !== "function") {
		return;
	}
	const color = color_arg >>> 0;
	bridge(
		flags >>> 0,
		(color >>> 16) & 0xff,
		(color >>> 8) & 0xff,
		color & 0xff,
		(color >>> 24) & 0xff,
		z,
		stencil >>> 0,
	);
});
EM_JS(void, wasm_d3d8_browser_buffer_create, (
	unsigned int kind,
	unsigned int buffer_id,
	unsigned int byte_size,
	unsigned int usage
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8BufferCreate : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		kind: kind >>> 0,
		id: buffer_id >>> 0,
		byteSize: byte_size >>> 0,
		usage: usage >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_buffer_update, (
	unsigned int kind,
	unsigned int buffer_id,
	unsigned int data_ptr,
	unsigned int byte_offset,
	unsigned int byte_size,
	unsigned int usage,
	unsigned int lock_flags
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8BufferUpdate : null;
	if (typeof bridge !== "function" || typeof Module === "undefined" || !Module.HEAPU8) {
		return;
	}
	bridge({
		kind: kind >>> 0,
		id: buffer_id >>> 0,
		byteOffset: byte_offset >>> 0,
		byteSize: byte_size >>> 0,
		usage: usage >>> 0,
		lockFlags: lock_flags >>> 0,
		bytes: Module.HEAPU8.slice(data_ptr, data_ptr + byte_size),
	});
});
EM_JS(void, wasm_d3d8_browser_buffer_release, (
	unsigned int kind,
	unsigned int buffer_id
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8BufferRelease : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		kind: kind >>> 0,
		id: buffer_id >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_create, (
	unsigned int texture_id,
	unsigned int width,
	unsigned int height,
	unsigned int levels,
	unsigned int format,
	unsigned int usage,
	unsigned int pool
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureCreate : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		id: texture_id >>> 0,
		width: width >>> 0,
		height: height >>> 0,
		levels: levels >>> 0,
		format: format >>> 0,
		usage: usage >>> 0,
		pool: pool >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_update, (
	unsigned int texture_id,
	unsigned int level,
	unsigned int format,
	unsigned int x,
	unsigned int y,
	unsigned int width,
	unsigned int height,
	unsigned int pitch,
	unsigned int row_bytes,
	unsigned int data_ptr,
	unsigned int usage,
	unsigned int lock_flags
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureUpdate : null;
	if (typeof bridge !== "function" || typeof Module === "undefined" || !Module.HEAPU8) {
		return;
	}
	const update_width = width >>> 0;
	const update_height = height >>> 0;
	const compact_row_bytes = row_bytes >>> 0;
	const source_pitch = pitch >>> 0;
	const compact = new Uint8Array(compact_row_bytes * update_height);
	for (let row = 0; row < update_height; ++row) {
		const source = data_ptr + (row * source_pitch);
		const target = row * compact_row_bytes;
		compact.set(Module.HEAPU8.subarray(source, source + compact_row_bytes), target);
	}
	bridge({
		id: texture_id >>> 0,
		level: level >>> 0,
		format: format >>> 0,
		x: x >>> 0,
		y: y >>> 0,
		width: update_width,
		height: update_height,
		pitch: source_pitch,
		rowBytes: compact_row_bytes,
		usage: usage >>> 0,
		lockFlags: lock_flags >>> 0,
		bytes: compact,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_release, (
	unsigned int texture_id
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureRelease : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		id: texture_id >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_texture_bind, (
	unsigned int stage,
	unsigned int texture_id
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8TextureBind : null;
	if (typeof bridge !== "function") {
		return;
	}
	bridge({
		stage: stage >>> 0,
		id: texture_id >>> 0,
	});
});
EM_JS(void, wasm_d3d8_browser_draw_indexed, (
	int primitive_type,
	unsigned int vertex_buffer_id,
	unsigned int vertex_byte_offset,
	unsigned int vertex_byte_size,
	unsigned int vertex_count,
	unsigned int vertex_stride,
	unsigned int index_buffer_id,
	unsigned int index_byte_offset,
	unsigned int index_byte_size,
	unsigned int index_count,
	unsigned int index_size,
	unsigned int transform_mask,
	unsigned int world_ptr,
	unsigned int view_ptr,
	unsigned int projection_ptr,
	unsigned int render_state_ptr
), {
	const bridge = typeof Module !== "undefined" ? Module.cncPortD3D8DrawIndexed : null;
	if (typeof bridge !== "function" || typeof Module === "undefined") {
		return;
	}
	const copyMatrix = (ptr) => {
		if (!ptr || !Module.HEAPF32) {
			return null;
		}
		const offset = ptr >>> 2;
		return Array.from(Module.HEAPF32.subarray(offset, offset + 16));
	};
	const copyRenderState = (ptr) => {
		if (!ptr || !Module.HEAPU32) {
			return null;
		}
		const offset = ptr >>> 2;
		const renderStateSlots = 12;
		const textureStageCount = 8;
		const textureStageStateSlots = 29;
		const state = Module.HEAPU32.subarray(offset, offset + renderStateSlots);
		const copyTextureStage = (stage) => {
			const stageOffset = offset + renderStateSlots + (stage * textureStageStateSlots);
			const read = (slot) => Module.HEAPU32[stageOffset + slot] >>> 0;
			return {
				stage,
				colorOp: read(1),
				colorArg1: read(2),
				colorArg2: read(3),
				alphaOp: read(4),
				alphaArg1: read(5),
				alphaArg2: read(6),
				bumpEnvMat00: read(7),
				bumpEnvMat01: read(8),
				bumpEnvMat10: read(9),
				bumpEnvMat11: read(10),
				texCoordIndex: read(11),
				addressU: read(13),
				addressV: read(14),
				borderColor: read(15),
				magFilter: read(16),
				minFilter: read(17),
				mipFilter: read(18),
				mipMapLodBias: read(19),
				maxMipLevel: read(20),
				maxAnisotropy: read(21),
				bumpEnvLScale: read(22),
				bumpEnvLOffset: read(23),
				textureTransformFlags: read(24),
				addressW: read(25),
				colorArg0: read(26),
				alphaArg0: read(27),
				resultArg: read(28),
			};
		};
		const textureStages = [];
		for (let stage = 0; stage < textureStageCount; ++stage) {
			textureStages.push(copyTextureStage(stage));
		}
		return {
			cullMode: state[0] >>> 0,
			zEnable: state[1] >>> 0,
			zWriteEnable: state[2] >>> 0,
			zFunc: state[3] >>> 0,
			alphaBlendEnable: state[4] >>> 0,
			srcBlend: state[5] >>> 0,
			destBlend: state[6] >>> 0,
			blendOp: state[7] >>> 0,
			alphaTestEnable: state[8] >>> 0,
			alphaFunc: state[9] >>> 0,
			alphaRef: state[10] >>> 0,
			colorWriteEnable: state[11] >>> 0,
			textureStages,
		};
	};
	bridge({
		primitiveType: primitive_type,
		vertexBufferId: vertex_buffer_id >>> 0,
		vertexByteOffset: vertex_byte_offset >>> 0,
		vertexBytes: vertex_byte_size >>> 0,
		vertexCount: vertex_count >>> 0,
		vertexStride: vertex_stride >>> 0,
		indexBufferId: index_buffer_id >>> 0,
		indexByteOffset: index_byte_offset >>> 0,
		indexBytes: index_byte_size >>> 0,
		indexCount: index_count >>> 0,
		indexSize: index_size >>> 0,
		transformMask: transform_mask >>> 0,
		transforms: {
			world: copyMatrix(world_ptr),
			view: copyMatrix(view_ptr),
			projection: copyMatrix(projection_ptr),
		},
		renderState: copyRenderState(render_state_ptr),
	});
});
#else
void wasm_d3d8_browser_clear_target(unsigned int, unsigned int, double, unsigned int) {}
void wasm_d3d8_browser_buffer_create(unsigned int, unsigned int, unsigned int, unsigned int) {}
void wasm_d3d8_browser_buffer_update(unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int) {}
void wasm_d3d8_browser_buffer_release(unsigned int, unsigned int) {}
void wasm_d3d8_browser_texture_create(unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int) {}
void wasm_d3d8_browser_texture_update(unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int) {}
void wasm_d3d8_browser_texture_release(unsigned int) {}
void wasm_d3d8_browser_texture_bind(unsigned int, unsigned int) {}
void wasm_d3d8_browser_draw_indexed(int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int, unsigned int,
	unsigned int, unsigned int, unsigned int) {}
#endif

namespace {

WasmD3D8ShimState g_state = {};
int g_d3d8_module = 0;
UINT g_next_browser_buffer_id = 1;
UINT g_next_browser_texture_id = 1;

HMODULE d3d8_module_handle()
{
	return &g_d3d8_module;
}

char ascii_lower(char value)
{
	return (value >= 'A' && value <= 'Z') ? static_cast<char>(value - 'A' + 'a') : value;
}

bool ascii_iequals(const char *left, const char *right)
{
	if (left == nullptr || right == nullptr) {
		return false;
	}
	while (*left != '\0' && *right != '\0') {
		if (ascii_lower(*left) != ascii_lower(*right)) {
			return false;
		}
		++left;
		++right;
	}
	return *left == '\0' && *right == '\0';
}

void fill_display_mode(D3DDISPLAYMODE &mode)
{
	mode.Width = 800;
	mode.Height = 600;
	mode.RefreshRate = 60;
	mode.Format = D3DFMT_A8R8G8B8;
}

void fill_caps(D3DCAPS8 &caps)
{
	std::memset(&caps, 0, sizeof(caps));
	caps.AdapterOrdinal = D3DADAPTER_DEFAULT;
	caps.DeviceType = D3DDEVTYPE_HAL;
	caps.PrimitiveMiscCaps = D3DPMISCCAPS_COLORWRITEENABLE;
	caps.RasterCaps = D3DPRASTERCAPS_ZBIAS;
	caps.TextureFilterCaps = D3DPTFILTERCAPS_MINFPOINT | D3DPTFILTERCAPS_MINFLINEAR |
		D3DPTFILTERCAPS_MIPFPOINT | D3DPTFILTERCAPS_MIPFLINEAR |
		D3DPTFILTERCAPS_MAGFPOINT | D3DPTFILTERCAPS_MAGFLINEAR;
	caps.TextureAddressCaps = D3DTADDRESS_WRAP | D3DTADDRESS_CLAMP | D3DTADDRESS_MIRROR;
	caps.MaxTextureWidth = 4096;
	caps.MaxTextureHeight = 4096;
	caps.MaxTextureRepeat = 4096;
	caps.MaxTextureAspectRatio = 4096;
	caps.MaxAnisotropy = 1;
	caps.MaxVertexW = 1.0f;
	caps.MaxTextureBlendStages = 8;
	caps.MaxSimultaneousTextures = 8;
	caps.MaxActiveLights = 8;
	caps.MaxStreams = 8;
	caps.MaxStreamStride = 255;
	caps.MaxPrimitiveCount = 65535;
	caps.MaxVertexIndex = 65535;
	caps.MaxPointSize = 64.0f;
}

UINT bytes_per_pixel(D3DFORMAT format)
{
	switch (format) {
		case D3DFMT_R8G8B8:
			return 3;
		case D3DFMT_R5G6B5:
		case D3DFMT_X1R5G5B5:
		case D3DFMT_A1R5G5B5:
		case D3DFMT_A4R4G4B4:
		case D3DFMT_A8L8:
			return 2;
		case D3DFMT_A8:
		case D3DFMT_P8:
		case D3DFMT_L8:
			return 1;
		default:
			return 4;
	}
}

void identity_matrix(D3DMATRIX &matrix)
{
	std::memset(&matrix, 0, sizeof(matrix));
	matrix.m[0][0] = 1.0f;
	matrix.m[1][1] = 1.0f;
	matrix.m[2][2] = 1.0f;
	matrix.m[3][3] = 1.0f;
}

DWORD checksum_bytes(const BYTE *data, UINT size)
{
	if (data == nullptr || size == 0) {
		return 0;
	}
	DWORD hash = 2166136261u;
	for (UINT index = 0; index < size; ++index) {
		hash ^= data[index];
		hash *= 16777619u;
	}
	return hash;
}

DWORD checksum_texture_region(const BYTE *data, UINT pitch, UINT row_bytes, UINT height)
{
	if (data == nullptr || pitch == 0 || row_bytes == 0 || height == 0) {
		return 0;
	}
	DWORD hash = 2166136261u;
	for (UINT row = 0; row < height; ++row) {
		const BYTE *row_data = data + (row * pitch);
		for (UINT column = 0; column < row_bytes; ++column) {
			hash ^= row_data[column];
			hash *= 16777619u;
		}
	}
	return hash;
}

constexpr UINT DRAW_TRANSFORM_WORLD = 1u << 0;
constexpr UINT DRAW_TRANSFORM_VIEW = 1u << 1;
constexpr UINT DRAW_TRANSFORM_PROJECTION = 1u << 2;
constexpr UINT BROWSER_BUFFER_VERTEX = 1u;
constexpr UINT BROWSER_BUFFER_INDEX = 2u;

struct BrowserD3DTextureDirtyRegion
{
	const BYTE *data = nullptr;
	UINT x = 0;
	UINT y = 0;
	UINT width = 0;
	UINT height = 0;
	UINT pitch = 0;
	UINT row_bytes = 0;
	DWORD lock_flags = 0;
};

UINT checked_range_size(UINT length, UINT offset, UINT requested_size)
{
	if (offset > length) {
		return 0;
	}
	const UINT available = length - offset;
	return requested_size <= available ? requested_size : available;
}

UINT primitive_vertex_count(D3DPRIMITIVETYPE primitive_type, UINT primitive_count)
{
	switch (primitive_type) {
		case D3DPT_POINTLIST:
			return primitive_count;
		case D3DPT_LINELIST:
			return primitive_count * 2;
		case D3DPT_LINESTRIP:
			return primitive_count + 1;
		case D3DPT_TRIANGLELIST:
			return primitive_count * 3;
		case D3DPT_TRIANGLESTRIP:
		case D3DPT_TRIANGLEFAN:
			return primitive_count + 2;
		default:
			return 0;
	}
}

void browser_clear_target(DWORD flags, D3DCOLOR color, float z, DWORD stencil)
{
	wasm_d3d8_browser_clear_target(
		static_cast<unsigned int>(flags),
		static_cast<unsigned int>(color),
		static_cast<double>(z),
		static_cast<unsigned int>(stencil));
}

void browser_buffer_create(UINT kind, UINT buffer_id, UINT byte_size, DWORD usage)
{
	if (buffer_id == 0 || byte_size == 0) {
		return;
	}
	++g_state.browser_buffer_create_calls;
	g_state.last_browser_buffer_kind = kind;
	g_state.last_browser_buffer_id = buffer_id;
	g_state.last_browser_buffer_offset = 0;
	g_state.last_browser_buffer_bytes = byte_size;
	g_state.last_browser_buffer_usage = usage;
	g_state.last_browser_buffer_lock_flags = 0;
	wasm_d3d8_browser_buffer_create(kind, buffer_id, byte_size, usage);
}

void browser_buffer_update(UINT kind, UINT buffer_id, const BYTE *data, UINT byte_offset, UINT byte_size, DWORD usage,
	DWORD lock_flags)
{
	if (buffer_id == 0 || data == nullptr || byte_size == 0) {
		return;
	}
	++g_state.browser_buffer_update_calls;
	g_state.last_browser_buffer_kind = kind;
	g_state.last_browser_buffer_id = buffer_id;
	g_state.last_browser_buffer_offset = byte_offset;
	g_state.last_browser_buffer_bytes = byte_size;
	g_state.last_browser_buffer_usage = usage;
	g_state.last_browser_buffer_lock_flags = lock_flags;
	wasm_d3d8_browser_buffer_update(
		kind,
		buffer_id,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(data)),
		byte_offset,
		byte_size,
		usage,
		lock_flags);
}

void browser_buffer_release(UINT kind, UINT buffer_id)
{
	if (buffer_id == 0) {
		return;
	}
	++g_state.browser_buffer_release_calls;
	g_state.last_browser_buffer_kind = kind;
	g_state.last_browser_buffer_id = buffer_id;
	g_state.last_browser_buffer_offset = 0;
	g_state.last_browser_buffer_bytes = 0;
	g_state.last_browser_buffer_usage = 0;
	g_state.last_browser_buffer_lock_flags = 0;
	wasm_d3d8_browser_buffer_release(kind, buffer_id);
}

void browser_texture_create(UINT texture_id, UINT width, UINT height, UINT levels, D3DFORMAT format, DWORD usage,
	D3DPOOL pool)
{
	if (texture_id == 0 || width == 0 || height == 0 || levels == 0) {
		return;
	}
	++g_state.browser_texture_create_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = 0;
	g_state.last_browser_texture_x = 0;
	g_state.last_browser_texture_y = 0;
	g_state.last_browser_texture_width = width;
	g_state.last_browser_texture_height = height;
	g_state.last_browser_texture_pitch = width * bytes_per_pixel(format);
	g_state.last_browser_texture_row_bytes = g_state.last_browser_texture_pitch;
	g_state.last_browser_texture_bytes = g_state.last_browser_texture_pitch * height;
	g_state.last_browser_texture_levels = levels;
	g_state.last_browser_texture_format = format;
	g_state.last_browser_texture_usage = usage;
	g_state.last_browser_texture_pool = pool;
	g_state.last_browser_texture_lock_flags = 0;
	g_state.last_browser_texture_checksum = 0;
	wasm_d3d8_browser_texture_create(texture_id, width, height, levels, format, usage, pool);
}

void browser_texture_update(UINT texture_id, UINT level, D3DFORMAT format, const BrowserD3DTextureDirtyRegion &dirty,
	DWORD usage)
{
	if (texture_id == 0 || dirty.data == nullptr || dirty.width == 0 || dirty.height == 0 ||
		dirty.pitch == 0 || dirty.row_bytes == 0) {
		return;
	}
	++g_state.browser_texture_update_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = level;
	g_state.last_browser_texture_x = dirty.x;
	g_state.last_browser_texture_y = dirty.y;
	g_state.last_browser_texture_width = dirty.width;
	g_state.last_browser_texture_height = dirty.height;
	g_state.last_browser_texture_pitch = dirty.pitch;
	g_state.last_browser_texture_row_bytes = dirty.row_bytes;
	g_state.last_browser_texture_bytes = dirty.row_bytes * dirty.height;
	g_state.last_browser_texture_levels = 0;
	g_state.last_browser_texture_format = format;
	g_state.last_browser_texture_usage = usage;
	g_state.last_browser_texture_pool = 0;
	g_state.last_browser_texture_lock_flags = dirty.lock_flags;
	g_state.last_browser_texture_checksum =
		checksum_texture_region(dirty.data, dirty.pitch, dirty.row_bytes, dirty.height);
	wasm_d3d8_browser_texture_update(
		texture_id,
		level,
		format,
		dirty.x,
		dirty.y,
		dirty.width,
		dirty.height,
		dirty.pitch,
		dirty.row_bytes,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(dirty.data)),
		usage,
		dirty.lock_flags);
}

void browser_texture_release(UINT texture_id)
{
	if (texture_id == 0) {
		return;
	}
	++g_state.browser_texture_release_calls;
	g_state.last_browser_texture_id = texture_id;
	g_state.last_browser_texture_level = 0;
	g_state.last_browser_texture_x = 0;
	g_state.last_browser_texture_y = 0;
	g_state.last_browser_texture_width = 0;
	g_state.last_browser_texture_height = 0;
	g_state.last_browser_texture_pitch = 0;
	g_state.last_browser_texture_row_bytes = 0;
	g_state.last_browser_texture_bytes = 0;
	g_state.last_browser_texture_levels = 0;
	g_state.last_browser_texture_format = D3DFMT_UNKNOWN;
	g_state.last_browser_texture_usage = 0;
	g_state.last_browser_texture_pool = 0;
	g_state.last_browser_texture_lock_flags = 0;
	g_state.last_browser_texture_checksum = 0;
	wasm_d3d8_browser_texture_release(texture_id);
}

void browser_texture_bind(UINT stage, UINT texture_id)
{
	++g_state.browser_texture_bind_calls;
	g_state.last_browser_texture_bind_stage = stage;
	g_state.last_browser_texture_bind_id = texture_id;
	wasm_d3d8_browser_texture_bind(stage, texture_id);
}

UINT allocate_browser_buffer_id()
{
	UINT id = g_next_browser_buffer_id++;
	if (id == 0) {
		id = g_next_browser_buffer_id++;
	}
	return id;
}

UINT allocate_browser_texture_id()
{
	UINT id = g_next_browser_texture_id++;
	if (id == 0) {
		id = g_next_browser_texture_id++;
	}
	return id;
}

void browser_draw_indexed(D3DPRIMITIVETYPE primitive_type, UINT vertex_buffer_id, UINT vertex_byte_offset,
	UINT vertex_byte_size, UINT vertex_count, UINT vertex_stride, UINT index_buffer_id, UINT index_byte_offset,
	UINT index_byte_size, UINT index_count, UINT index_size, UINT transform_mask, const D3DMATRIX *world_transform,
	const D3DMATRIX *view_transform, const D3DMATRIX *projection_transform,
	const WasmD3D8DrawRenderState *render_state)
{
	if (vertex_buffer_id == 0 || vertex_byte_size == 0 || index_buffer_id == 0 || index_byte_size == 0 ||
		index_count == 0 || vertex_stride == 0) {
		return;
	}
	wasm_d3d8_browser_draw_indexed(
		static_cast<int>(primitive_type),
		vertex_buffer_id,
		vertex_byte_offset,
		vertex_byte_size,
		vertex_count,
		vertex_stride,
		index_buffer_id,
		index_byte_offset,
		index_byte_size,
		index_count,
		index_size,
		transform_mask,
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(world_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(view_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(projection_transform)),
		static_cast<unsigned int>(reinterpret_cast<std::uintptr_t>(render_state)));
}

struct BrowserD3DResource
{
	explicit BrowserD3DResource(IDirect3DDevice8 *device) : m_device(device) {}

	HRESULT GetDevice(IDirect3DDevice8 **device)
	{
		if (device == nullptr) {
			return E_FAIL;
		}
		*device = m_device;
		if (m_device != nullptr) {
			m_device->AddRef();
		}
		return S_OK;
	}

	HRESULT SetPrivateData(const GUID &, const void *, DWORD, DWORD) { return D3DERR_NOTAVAILABLE; }
	HRESULT GetPrivateData(const GUID &, void *, DWORD *) { return D3DERR_NOTAVAILABLE; }
	HRESULT FreePrivateData(const GUID &) { return D3DERR_NOTAVAILABLE; }
	DWORD SetPriority(DWORD priority) { return priority; }
	DWORD GetPriority() { return 0; }
	void PreLoad() {}

protected:
	IDirect3DDevice8 *m_device = nullptr;
};

class BrowserD3DSurface final : public IDirect3DSurface8, private BrowserD3DResource
{
public:
	BrowserD3DSurface(IDirect3DDevice8 *device, UINT width, UINT height, D3DFORMAT format, DWORD usage,
		D3DPOOL pool = D3DPOOL_DEFAULT) :
		BrowserD3DResource(device)
	{
		const UINT pitch = width * bytes_per_pixel(format);
		std::memset(&m_desc, 0, sizeof(m_desc));
		m_desc.Format = format;
		m_desc.Type = D3DRTYPE_SURFACE;
		m_desc.Usage = usage;
		m_desc.Pool = pool;
		m_desc.Width = width;
		m_desc.Height = height;
		m_desc.Size = pitch * height;
		m_desc.MultiSampleType = D3DMULTISAMPLE_NONE;
		m_pitch = static_cast<int>(pitch);
		m_pixels.resize(m_desc.Size);
	}

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_SURFACE; }

	HRESULT GetDesc(D3DSURFACE_DESC *desc) override
	{
		if (desc == nullptr) {
			return E_FAIL;
		}
		*desc = m_desc;
		return S_OK;
	}

	HRESULT LockRect(D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD flags) override
	{
		if (locked_rect == nullptr || m_pixels.empty() || m_locked) {
			return E_FAIL;
		}

		int left = 0;
		int top = 0;
		int right = static_cast<int>(m_desc.Width);
		int bottom = static_cast<int>(m_desc.Height);
		if (rect != nullptr) {
			if (rect->left < 0 || rect->top < 0 || rect->right < rect->left || rect->bottom < rect->top ||
				static_cast<UINT>(rect->right) > m_desc.Width ||
				static_cast<UINT>(rect->bottom) > m_desc.Height) {
				return E_FAIL;
			}
			left = rect->left;
			top = rect->top;
			right = rect->right;
			bottom = rect->bottom;
		}

		locked_rect->Pitch = m_pitch;
		locked_rect->pBits = m_pixels.data() + (top * m_pitch) + (left * bytes_per_pixel(m_desc.Format));
		m_locked = true;
		m_lock_flags = flags;
		m_dirty_x = static_cast<UINT>(left);
		m_dirty_y = static_cast<UINT>(top);
		m_dirty_width = static_cast<UINT>(right - left);
		m_dirty_height = static_cast<UINT>(bottom - top);
		return S_OK;
	}

	HRESULT UnlockRect() override { return unlock_and_capture(nullptr); }

	HRESULT unlock_and_capture(BrowserD3DTextureDirtyRegion *dirty)
	{
		if (!m_locked) {
			return E_FAIL;
		}
		if (dirty != nullptr && (m_lock_flags & (D3DLOCK_READONLY | D3DLOCK_NO_DIRTY_UPDATE)) == 0) {
			dirty->data = m_pixels.data() + (m_dirty_y * m_pitch) +
				(m_dirty_x * bytes_per_pixel(m_desc.Format));
			dirty->x = m_dirty_x;
			dirty->y = m_dirty_y;
			dirty->width = m_dirty_width;
			dirty->height = m_dirty_height;
			dirty->pitch = static_cast<UINT>(m_pitch);
			dirty->row_bytes = m_dirty_width * bytes_per_pixel(m_desc.Format);
			dirty->lock_flags = m_lock_flags;
		}
		m_locked = false;
		m_lock_flags = 0;
		m_dirty_x = 0;
		m_dirty_y = 0;
		m_dirty_width = 0;
		m_dirty_height = 0;
		return S_OK;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	D3DSURFACE_DESC m_desc = {};
	int m_pitch = 0;
	std::vector<unsigned char> m_pixels;
	bool m_locked = false;
	DWORD m_lock_flags = 0;
	UINT m_dirty_x = 0;
	UINT m_dirty_y = 0;
	UINT m_dirty_width = 0;
	UINT m_dirty_height = 0;
};

class BrowserD3DTexture final : public IDirect3DTexture8, private BrowserD3DResource
{
public:
	BrowserD3DTexture(IDirect3DDevice8 *device, UINT width, UINT height, UINT levels, DWORD usage,
		D3DFORMAT format, D3DPOOL pool) :
		BrowserD3DResource(device)
	{
		if (width == 0) {
			width = 1;
		}
		if (height == 0) {
			height = 1;
		}
		if (format == D3DFMT_UNKNOWN) {
			format = D3DFMT_A8R8G8B8;
		}
		if (levels == 0) {
			levels = 1;
		}

		for (UINT level = 0; level < levels; ++level) {
			BrowserD3DSurface *surface = new (std::nothrow) BrowserD3DSurface(
				device, width, height, format, usage, pool);
			if (surface == nullptr) {
				break;
			}
			m_levels.push_back(surface);
			if (width > 1) {
				width /= 2;
			}
			if (height > 1) {
				height /= 2;
			}
		}
		m_usage = usage;
		m_pool = pool;
		m_format = format;
		m_browser_texture_id = allocate_browser_texture_id();
		m_last_lock_flags.resize(m_levels.size());
	}

	~BrowserD3DTexture()
	{
		if (m_browser_texture_created) {
			browser_texture_release(m_browser_texture_id);
		}
		for (BrowserD3DSurface *surface : m_levels) {
			surface->Release();
		}
	}

	bool is_valid() const { return !m_levels.empty(); }

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_TEXTURE; }

	DWORD SetLOD(DWORD lod) override
	{
		const DWORD previous = m_lod;
		m_lod = lod;
		return previous;
	}

	DWORD GetLOD() override { return m_lod; }
	DWORD GetLevelCount() override { return static_cast<DWORD>(m_levels.size()); }

	HRESULT GetLevelDesc(UINT level, D3DSURFACE_DESC *desc) override
	{
		if (level >= m_levels.size() || desc == nullptr) {
			return E_FAIL;
		}
		return m_levels[level]->GetDesc(desc);
	}

	HRESULT GetSurfaceLevel(UINT level, IDirect3DSurface8 **surface) override
	{
		if (level >= m_levels.size() || surface == nullptr) {
			return E_FAIL;
		}
		m_levels[level]->AddRef();
		*surface = m_levels[level];
		return S_OK;
	}

	HRESULT LockRect(UINT level, D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD flags) override
	{
		if (level >= m_levels.size()) {
			return E_FAIL;
		}
		++g_state.texture_lock_rect_calls;
		HRESULT result = m_levels[level]->LockRect(locked_rect, rect, flags);
		if (SUCCEEDED(result) && level < m_last_lock_flags.size()) {
			m_last_lock_flags[level] = flags;
		}
		return result;
	}

	HRESULT UnlockRect(UINT level) override
	{
		if (level >= m_levels.size()) {
			return E_FAIL;
		}
		++g_state.texture_unlock_rect_calls;
		BrowserD3DTextureDirtyRegion dirty = {};
		if (level < m_last_lock_flags.size()) {
			dirty.lock_flags = m_last_lock_flags[level];
		}
		HRESULT result = m_levels[level]->unlock_and_capture(&dirty);
		if (level < m_last_lock_flags.size()) {
			m_last_lock_flags[level] = 0;
		}
		if (SUCCEEDED(result)) {
			browser_texture_update(m_browser_texture_id, level, m_format, dirty, m_usage);
		}
		return result;
	}

	UINT browser_texture_id() const { return m_browser_texture_id; }

	void create_browser_texture()
	{
		if (m_browser_texture_created || m_levels.empty()) {
			return;
		}
		D3DSURFACE_DESC desc = {};
		if (FAILED(m_levels[0]->GetDesc(&desc))) {
			return;
		}
		browser_texture_create(m_browser_texture_id, desc.Width, desc.Height,
			static_cast<UINT>(m_levels.size()), m_format, m_usage, m_pool);
		m_browser_texture_created = true;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	DWORD m_lod = 0;
	std::vector<BrowserD3DSurface *> m_levels;
	std::vector<DWORD> m_last_lock_flags;
	DWORD m_usage = 0;
	D3DPOOL m_pool = D3DPOOL_DEFAULT;
	D3DFORMAT m_format = D3DFMT_A8R8G8B8;
	UINT m_browser_texture_id = 0;
	bool m_browser_texture_created = false;
};

class BrowserD3DVertexBuffer final : public IDirect3DVertexBuffer8, private BrowserD3DResource
{
public:
	BrowserD3DVertexBuffer(IDirect3DDevice8 *device, UINT length, DWORD usage, DWORD, D3DPOOL) :
		BrowserD3DResource(device),
		m_bytes(length),
		m_usage(usage),
		m_browser_buffer_id(allocate_browser_buffer_id())
	{
	}

	bool is_valid() const { return !m_bytes.empty(); }

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_VERTEXBUFFER; }

	HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD flags) override
	{
		if (data == nullptr || m_locked || offset > m_bytes.size()) {
			return E_FAIL;
		}
		if (size == 0) {
			size = static_cast<UINT>(m_bytes.size() - offset);
		}
		if (size > m_bytes.size() - offset) {
			return E_FAIL;
		}
		++g_state.buffer_lock_calls;
		m_locked = true;
		m_dirty_offset = offset;
		m_dirty_size = size;
		m_lock_flags = flags;
		*data = m_bytes.data() + offset;
		return S_OK;
	}

	HRESULT Unlock() override
	{
		if (!m_locked) {
			return E_FAIL;
		}
		++g_state.buffer_unlock_calls;
		browser_buffer_update(BROWSER_BUFFER_VERTEX, m_browser_buffer_id,
			m_bytes.data() + m_dirty_offset, m_dirty_offset, m_dirty_size, m_usage, m_lock_flags);
		m_locked = false;
		m_dirty_offset = 0;
		m_dirty_size = 0;
		m_lock_flags = 0;
		return S_OK;
	}

	UINT length() const { return static_cast<UINT>(m_bytes.size()); }
	const BYTE *data() const { return m_bytes.data(); }
	UINT browser_buffer_id() const { return m_browser_buffer_id; }

	void create_browser_buffer()
	{
		if (!m_browser_buffer_created) {
			browser_buffer_create(BROWSER_BUFFER_VERTEX, m_browser_buffer_id, length(), m_usage);
			m_browser_buffer_created = true;
		}
	}

	DWORD checksum(UINT offset, UINT size) const
	{
		const UINT checked_size = checked_range_size(length(), offset, size);
		if (checked_size == 0) {
			return 0;
		}
		return checksum_bytes(m_bytes.data() + offset, checked_size);
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			if (m_browser_buffer_created) {
				browser_buffer_release(BROWSER_BUFFER_VERTEX, m_browser_buffer_id);
			}
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	std::vector<BYTE> m_bytes;
	DWORD m_usage = 0;
	UINT m_browser_buffer_id = 0;
	bool m_browser_buffer_created = false;
	bool m_locked = false;
	UINT m_dirty_offset = 0;
	UINT m_dirty_size = 0;
	DWORD m_lock_flags = 0;
};

class BrowserD3DIndexBuffer final : public IDirect3DIndexBuffer8, private BrowserD3DResource
{
public:
	BrowserD3DIndexBuffer(IDirect3DDevice8 *device, UINT length, DWORD usage, D3DFORMAT format, D3DPOOL) :
		BrowserD3DResource(device),
		m_bytes(length),
		m_usage(usage),
		m_format(format),
		m_browser_buffer_id(allocate_browser_buffer_id())
	{
	}

	bool is_valid() const { return !m_bytes.empty(); }

	HRESULT GetDevice(IDirect3DDevice8 **device) override { return BrowserD3DResource::GetDevice(device); }
	HRESULT SetPrivateData(const GUID &guid, const void *data, DWORD size, DWORD flags) override
	{
		return BrowserD3DResource::SetPrivateData(guid, data, size, flags);
	}
	HRESULT GetPrivateData(const GUID &guid, void *data, DWORD *size) override
	{
		return BrowserD3DResource::GetPrivateData(guid, data, size);
	}
	HRESULT FreePrivateData(const GUID &guid) override { return BrowserD3DResource::FreePrivateData(guid); }
	DWORD SetPriority(DWORD priority) override { return BrowserD3DResource::SetPriority(priority); }
	DWORD GetPriority() override { return BrowserD3DResource::GetPriority(); }
	void PreLoad() override { BrowserD3DResource::PreLoad(); }
	D3DRESOURCETYPE GetType() override { return D3DRTYPE_INDEXBUFFER; }

	HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD flags) override
	{
		if (data == nullptr || m_locked || offset > m_bytes.size()) {
			return E_FAIL;
		}
		if (size == 0) {
			size = static_cast<UINT>(m_bytes.size() - offset);
		}
		if (size > m_bytes.size() - offset) {
			return E_FAIL;
		}
		++g_state.buffer_lock_calls;
		m_locked = true;
		m_dirty_offset = offset;
		m_dirty_size = size;
		m_lock_flags = flags;
		*data = m_bytes.data() + offset;
		return S_OK;
	}

	HRESULT Unlock() override
	{
		if (!m_locked) {
			return E_FAIL;
		}
		++g_state.buffer_unlock_calls;
		browser_buffer_update(BROWSER_BUFFER_INDEX, m_browser_buffer_id,
			m_bytes.data() + m_dirty_offset, m_dirty_offset, m_dirty_size, m_usage, m_lock_flags);
		m_locked = false;
		m_dirty_offset = 0;
		m_dirty_size = 0;
		m_lock_flags = 0;
		return S_OK;
	}

	UINT length() const { return static_cast<UINT>(m_bytes.size()); }
	const BYTE *data() const { return m_bytes.data(); }
	D3DFORMAT format() const { return m_format; }
	UINT index_size() const { return m_format == D3DFMT_INDEX32 ? 4 : 2; }
	UINT browser_buffer_id() const { return m_browser_buffer_id; }

	void create_browser_buffer()
	{
		if (!m_browser_buffer_created) {
			browser_buffer_create(BROWSER_BUFFER_INDEX, m_browser_buffer_id, length(), m_usage);
			m_browser_buffer_created = true;
		}
	}

	DWORD checksum(UINT offset, UINT size) const
	{
		const UINT checked_size = checked_range_size(length(), offset, size);
		if (checked_size == 0) {
			return 0;
		}
		return checksum_bytes(m_bytes.data() + offset, checked_size);
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			if (m_browser_buffer_created) {
				browser_buffer_release(BROWSER_BUFFER_INDEX, m_browser_buffer_id);
			}
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
	std::vector<BYTE> m_bytes;
	DWORD m_usage = 0;
	D3DFORMAT m_format = D3DFMT_INDEX16;
	UINT m_browser_buffer_id = 0;
	bool m_browser_buffer_created = false;
	bool m_locked = false;
	UINT m_dirty_offset = 0;
	UINT m_dirty_size = 0;
	DWORD m_lock_flags = 0;
};

class BrowserD3DDevice final : public IDirect3DDevice8
{
public:
	explicit BrowserD3DDevice(const D3DPRESENT_PARAMETERS &parameters) : m_parameters(parameters)
	{
		if (m_parameters.BackBufferWidth == 0) {
			m_parameters.BackBufferWidth = 800;
		}
		if (m_parameters.BackBufferHeight == 0) {
			m_parameters.BackBufferHeight = 600;
		}
		if (m_parameters.BackBufferFormat == D3DFMT_UNKNOWN) {
			m_parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
		}
		if (m_parameters.AutoDepthStencilFormat == D3DFMT_UNKNOWN) {
			m_parameters.AutoDepthStencilFormat = D3DFMT_D24S8;
		}

		m_viewport.X = 0;
		m_viewport.Y = 0;
		m_viewport.Width = m_parameters.BackBufferWidth;
		m_viewport.Height = m_parameters.BackBufferHeight;
		m_viewport.MinZ = 0.0f;
		m_viewport.MaxZ = 1.0f;

		m_back_buffer = new (std::nothrow) BrowserD3DSurface(this, m_parameters.BackBufferWidth,
			m_parameters.BackBufferHeight, m_parameters.BackBufferFormat, D3DUSAGE_RENDERTARGET);
		m_depth_stencil = new (std::nothrow) BrowserD3DSurface(this, m_parameters.BackBufferWidth,
			m_parameters.BackBufferHeight, m_parameters.AutoDepthStencilFormat, D3DUSAGE_DEPTHSTENCIL);

		g_state.back_buffer_width = m_parameters.BackBufferWidth;
		g_state.back_buffer_height = m_parameters.BackBufferHeight;
		g_state.back_buffer_format = m_parameters.BackBufferFormat;
		g_state.depth_stencil_format = m_parameters.AutoDepthStencilFormat;
		g_state.viewport = m_viewport;
	}

	~BrowserD3DDevice()
	{
		if (m_stream_source != nullptr) {
			m_stream_source->Release();
			m_stream_source = nullptr;
		}
		if (m_indices != nullptr) {
			m_indices->Release();
			m_indices = nullptr;
		}
		// Release device-held references on all still-bound textures, matching
		// the DX8 device-reset / teardown contract (see
		// DX8Wrapper::Invalidate_Cached_Render_States).
		for (auto &entry : m_bound_textures) {
			if (entry.second != nullptr) {
				entry.second->Release();
			}
		}
		m_bound_textures.clear();
		m_bound_texture_ids.clear();
		if (m_back_buffer != nullptr) {
			m_back_buffer->Release();
			m_back_buffer = nullptr;
		}
		if (m_depth_stencil != nullptr) {
			m_depth_stencil->Release();
			m_depth_stencil = nullptr;
		}
	}

	HRESULT TestCooperativeLevel() override { return S_OK; }

	HRESULT GetDeviceCaps(D3DCAPS8 *caps) override
	{
		if (caps == nullptr) {
			return E_FAIL;
		}
		fill_caps(*caps);
		return S_OK;
	}

	HRESULT GetDisplayMode(D3DDISPLAYMODE *mode) override
	{
		if (mode == nullptr) {
			return E_FAIL;
		}
		fill_display_mode(*mode);
		return S_OK;
	}

	HRESULT SetCursorProperties(UINT, UINT, IDirect3DSurface8 *) override { return S_OK; }
	void SetCursorPosition(int, int, DWORD) override {}
	BOOL ShowCursor(BOOL show) override { return show; }
	HRESULT CreateAdditionalSwapChain(D3DPRESENT_PARAMETERS *, IDirect3DSwapChain8 **) override
	{
		return D3DERR_NOTAVAILABLE;
	}

	HRESULT Reset(D3DPRESENT_PARAMETERS *parameters) override
	{
		if (parameters != nullptr) {
			m_parameters = *parameters;
		}
		return S_OK;
	}

	HRESULT Present(const RECT *, const RECT *, HWND, const void *) override
	{
		++g_state.present_calls;
		return S_OK;
	}

	HRESULT GetBackBuffer(UINT, DWORD, IDirect3DSurface8 **surface) override
	{
		if (surface == nullptr || m_back_buffer == nullptr) {
			return E_FAIL;
		}
		m_back_buffer->AddRef();
		*surface = m_back_buffer;
		return S_OK;
	}

	HRESULT GetRasterStatus(void *) override { return D3DERR_NOTAVAILABLE; }
	void SetGammaRamp(DWORD, const void *) override {}
	void GetGammaRamp(void *) override {}
	HRESULT CreateTexture(UINT width, UINT height, UINT levels, DWORD usage, D3DFORMAT format, D3DPOOL pool,
		IDirect3DTexture8 **texture) override
	{
		if (texture == nullptr) {
			return E_FAIL;
		}
		*texture = new (std::nothrow) BrowserD3DTexture(this, width, height, levels, usage, format, pool);
		if (*texture == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		BrowserD3DTexture *browser_texture = static_cast<BrowserD3DTexture *>(*texture);
		if (!browser_texture->is_valid()) {
			browser_texture->Release();
			*texture = nullptr;
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		browser_texture->create_browser_texture();
		++g_state.create_texture_calls;
		return S_OK;
	}
	HRESULT CreateVolumeTexture(UINT, UINT, UINT, UINT, DWORD, D3DFORMAT, D3DPOOL,
		IDirect3DVolumeTexture8 **) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT CreateCubeTexture(UINT, UINT, DWORD, D3DFORMAT, D3DPOOL, IDirect3DCubeTexture8 **) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT CreateVertexBuffer(UINT length, DWORD usage, DWORD fvf, D3DPOOL pool,
		IDirect3DVertexBuffer8 **buffer) override
	{
		if (buffer == nullptr) {
			return E_FAIL;
		}
		*buffer = new (std::nothrow) BrowserD3DVertexBuffer(this, length, usage, fvf, pool);
		if (*buffer == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		BrowserD3DVertexBuffer *browser_buffer = static_cast<BrowserD3DVertexBuffer *>(*buffer);
		if (!browser_buffer->is_valid()) {
			browser_buffer->Release();
			*buffer = nullptr;
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		browser_buffer->create_browser_buffer();
		++g_state.create_vertex_buffer_calls;
		return S_OK;
	}
	HRESULT CreateIndexBuffer(UINT length, DWORD usage, D3DFORMAT format, D3DPOOL pool,
		IDirect3DIndexBuffer8 **buffer) override
	{
		if (buffer == nullptr) {
			return E_FAIL;
		}
		*buffer = new (std::nothrow) BrowserD3DIndexBuffer(this, length, usage, format, pool);
		if (*buffer == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		BrowserD3DIndexBuffer *browser_buffer = static_cast<BrowserD3DIndexBuffer *>(*buffer);
		if (!browser_buffer->is_valid()) {
			browser_buffer->Release();
			*buffer = nullptr;
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		browser_buffer->create_browser_buffer();
		++g_state.create_index_buffer_calls;
		return S_OK;
	}

	HRESULT CreateImageSurface(UINT width, UINT height, D3DFORMAT format, IDirect3DSurface8 **surface) override
	{
		return create_surface(width, height, format, 0, surface);
	}

	HRESULT CreateRenderTarget(UINT width, UINT height, D3DFORMAT format, UINT, BOOL,
		IDirect3DSurface8 **surface) override
	{
		return create_surface(width, height, format, D3DUSAGE_RENDERTARGET, surface);
	}

	HRESULT CreateDepthStencilSurface(UINT width, UINT height, D3DFORMAT format, UINT,
		IDirect3DSurface8 **surface) override
	{
		return create_surface(width, height, format, D3DUSAGE_DEPTHSTENCIL, surface);
	}

	HRESULT UpdateTexture(IDirect3DBaseTexture8 *, IDirect3DBaseTexture8 *) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT CopyRects(IDirect3DSurface8 *, const RECT *, UINT, IDirect3DSurface8 *, const POINT *) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT ResourceManagerDiscardBytes(DWORD) override { return S_OK; }
	UINT GetAvailableTextureMem() override { return 64 * 1024 * 1024; }
	HRESULT GetFrontBuffer(IDirect3DSurface8 *) override { return D3DERR_NOTAVAILABLE; }

	HRESULT SetRenderTarget(IDirect3DSurface8 *render_target, IDirect3DSurface8 *depth_stencil) override
	{
		if (render_target != nullptr) {
			render_target->AddRef();
		}
		if (depth_stencil != nullptr) {
			depth_stencil->AddRef();
		}
		if (m_back_buffer != nullptr) {
			m_back_buffer->Release();
		}
		if (m_depth_stencil != nullptr) {
			m_depth_stencil->Release();
		}
		m_back_buffer = render_target;
		m_depth_stencil = depth_stencil;
		return S_OK;
	}

	HRESULT GetRenderTarget(IDirect3DSurface8 **render_target) override
	{
		if (render_target == nullptr || m_back_buffer == nullptr) {
			return E_FAIL;
		}
		m_back_buffer->AddRef();
		*render_target = m_back_buffer;
		return S_OK;
	}

	HRESULT GetDepthStencilSurface(IDirect3DSurface8 **depth_stencil) override
	{
		if (depth_stencil == nullptr || m_depth_stencil == nullptr) {
			return E_FAIL;
		}
		m_depth_stencil->AddRef();
		*depth_stencil = m_depth_stencil;
		return S_OK;
	}

	HRESULT BeginScene() override
	{
		++g_state.begin_scene_calls;
		return S_OK;
	}

	HRESULT EndScene() override
	{
		++g_state.end_scene_calls;
		return S_OK;
	}

	HRESULT Clear(DWORD, const void *, DWORD flags, D3DCOLOR color, float z, DWORD stencil) override
	{
		++g_state.clear_calls;
		g_state.last_clear_flags = flags;
		g_state.last_clear_color = color;
		g_state.last_clear_z = z;
		g_state.last_clear_stencil = stencil;
		if ((flags & D3DCLEAR_TARGET) != 0) {
			browser_clear_target(flags, color, z, stencil);
		}
		return S_OK;
	}

	HRESULT SetTransform(D3DTRANSFORMSTATETYPE state, const D3DMATRIX *matrix) override
	{
		if (matrix == nullptr) {
			return E_FAIL;
		}
		m_transforms[state] = *matrix;
		++g_state.set_transform_calls;
		g_state.last_set_transform_state = state;
		g_state.last_set_transform_matrix = *matrix;
		return S_OK;
	}
	HRESULT GetTransform(D3DTRANSFORMSTATETYPE state, D3DMATRIX *matrix) override
	{
		if (matrix == nullptr) {
			return E_FAIL;
		}
		const auto found = m_transforms.find(state);
		if (found != m_transforms.end()) {
			*matrix = found->second;
		} else {
			identity_matrix(*matrix);
		}
		++g_state.get_transform_calls;
		g_state.last_get_transform_state = state;
		return S_OK;
	}
	HRESULT MultiplyTransform(D3DTRANSFORMSTATETYPE, const D3DMATRIX *) override { return S_OK; }

	HRESULT SetViewport(const D3DVIEWPORT8 *viewport) override
	{
		if (viewport == nullptr) {
			return E_FAIL;
		}
		m_viewport = *viewport;
		g_state.viewport = m_viewport;
		++g_state.set_viewport_calls;
		return S_OK;
	}

	HRESULT GetViewport(D3DVIEWPORT8 *viewport) override
	{
		if (viewport == nullptr) {
			return E_FAIL;
		}
		*viewport = m_viewport;
		++g_state.get_viewport_calls;
		return S_OK;
	}

	HRESULT SetMaterial(const D3DMATERIAL8 *) override { return S_OK; }
	HRESULT GetMaterial(D3DMATERIAL8 *) override { return D3DERR_NOTAVAILABLE; }
	HRESULT SetLight(DWORD, const D3DLIGHT8 *) override { return S_OK; }
	HRESULT LightEnable(DWORD, BOOL) override { return S_OK; }
	HRESULT SetClipPlane(DWORD, const float *) override { return S_OK; }
	HRESULT SetRenderState(D3DRENDERSTATETYPE state, DWORD value) override
	{
		m_render_states[state] = value;
		++g_state.set_render_state_calls;
		g_state.last_set_render_state = state;
		g_state.last_set_render_state_value = value;
		return S_OK;
	}
	HRESULT GetRenderState(D3DRENDERSTATETYPE state, DWORD *value) override
	{
		if (value == nullptr) {
			return E_FAIL;
		}
		const auto found = m_render_states.find(state);
		*value = found != m_render_states.end() ? found->second : 0;
		++g_state.get_render_state_calls;
		g_state.last_get_render_state = state;
		return S_OK;
	}
	HRESULT SetTexture(DWORD stage, IDirect3DBaseTexture8 *texture) override
	{
		UINT texture_id = 0;
		D3DRESOURCETYPE texture_type = D3DRTYPE_FORCE_DWORD;
		if (texture != nullptr) {
			texture_type = texture->GetType();
			if (texture_type != D3DRTYPE_TEXTURE) {
				return E_FAIL;
			}
			BrowserD3DTexture *browser_texture =
				static_cast<BrowserD3DTexture *>(static_cast<IDirect3DTexture8 *>(texture));
			texture_id = browser_texture->browser_texture_id();
		}

		++g_state.set_texture_calls;
		g_state.last_set_texture_stage = stage;
		g_state.last_set_texture_id = texture_id;
		g_state.last_set_texture_type = texture_type;

		// DX8 device-held reference contract: IDirect3DDevice8::SetTexture holds
		// its own reference on the currently-bound texture. Binding a new texture
		// Releases the previously-bound one (held by the device) and AddRefs the
		// new one; binding NULL Releases the previously-bound one. This matches
		// the original DX8Wrapper::Set_DX8_Texture shadow and Microsoft's DX8
		// device contract, so a texture that is still bound is not destroyed
		// when the engine releases its own handle, and device teardown unbinds.
		auto previous = m_bound_textures.find(stage);
		if (previous != m_bound_textures.end()) {
			previous->second->Release();
			m_bound_textures.erase(previous);
			m_bound_texture_ids.erase(stage);
		}
		if (texture != nullptr) {
			texture->AddRef();
			m_bound_textures[stage] = texture;
			m_bound_texture_ids[stage] = texture_id;
		}
		browser_texture_bind(stage, texture_id);
		return S_OK;
	}
	HRESULT SetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE state, DWORD value) override
	{
		m_texture_stage_states[stage][state] = value;
		++g_state.set_texture_stage_state_calls;
		g_state.last_set_texture_stage_state_stage = stage;
		g_state.last_set_texture_stage_state = state;
		g_state.last_set_texture_stage_state_value = value;
		return S_OK;
	}
	HRESULT ValidateDevice(DWORD *passes) override
	{
		if (passes != nullptr) {
			*passes = 1;
		}
		return S_OK;
	}
	HRESULT SetCurrentTexturePalette(UINT) override { return S_OK; }
	HRESULT DrawPrimitive(D3DPRIMITIVETYPE primitive_type, UINT start_vertex, UINT primitive_count) override
	{
		++g_state.draw_primitive_calls;
		g_state.last_draw_primitive_type = primitive_type;
		g_state.last_draw_start_vertex = start_vertex;
		g_state.last_draw_primitive_count = primitive_count;
		capture_bound_draw(start_vertex, primitive_vertex_count(primitive_type, primitive_count), 0, 0);
		return S_OK;
	}
	HRESULT DrawIndexedPrimitive(D3DPRIMITIVETYPE primitive_type, UINT min_index, UINT vertex_count,
		UINT start_index, UINT primitive_count) override
	{
		++g_state.draw_indexed_primitive_calls;
		g_state.last_draw_primitive_type = primitive_type;
		g_state.last_draw_min_vertex_index = min_index;
		g_state.last_draw_vertex_count = vertex_count;
		g_state.last_draw_start_index = start_index;
		g_state.last_draw_primitive_count = primitive_count;
		capture_bound_draw(m_indices_base_vertex_index + min_index, vertex_count, start_index,
			primitive_vertex_count(primitive_type, primitive_count));
		draw_bound_indexed_primitive(primitive_type, m_indices_base_vertex_index, min_index, vertex_count,
			start_index, primitive_vertex_count(primitive_type, primitive_count));
		return S_OK;
	}
	HRESULT DrawPrimitiveUP(D3DPRIMITIVETYPE, UINT, const void *, UINT) override { return D3DERR_NOTAVAILABLE; }
	HRESULT DrawIndexedPrimitiveUP(D3DPRIMITIVETYPE, UINT, UINT, UINT, const void *, D3DFORMAT,
		const void *, UINT) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT ProcessVertices(UINT, UINT, UINT, IDirect3DVertexBuffer8 *, DWORD) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT CreateVertexShader(const DWORD *, const DWORD *, DWORD *, DWORD) override
	{
		return D3DERR_NOTAVAILABLE;
	}
	HRESULT SetVertexShader(DWORD) override { return S_OK; }
	HRESULT DeleteVertexShader(DWORD) override { return S_OK; }
	HRESULT SetVertexShaderConstant(DWORD, const void *, DWORD) override { return S_OK; }
	HRESULT CreatePixelShader(const DWORD *, DWORD *) override { return D3DERR_NOTAVAILABLE; }
	HRESULT SetPixelShader(DWORD) override { return S_OK; }
	HRESULT DeletePixelShader(DWORD) override { return S_OK; }
	HRESULT SetPixelShaderConstant(DWORD, const void *, DWORD) override { return S_OK; }
	HRESULT SetStreamSource(UINT stream_number, IDirect3DVertexBuffer8 *stream_data, UINT stride) override
	{
		++g_state.set_stream_source_calls;
		g_state.last_stream_source_stride = stride;
		if (stream_number == 0) {
			if (stream_data != nullptr) {
				stream_data->AddRef();
			}
			if (m_stream_source != nullptr) {
				m_stream_source->Release();
			}
			m_stream_source = stream_data;
			m_stream_source_stride = stride;
		}
		return S_OK;
	}
	HRESULT SetIndices(IDirect3DIndexBuffer8 *index_data, UINT base_vertex_index) override
	{
		++g_state.set_indices_calls;
		g_state.last_indices_base_vertex_index = base_vertex_index;
		if (index_data != nullptr) {
			index_data->AddRef();
		}
		if (m_indices != nullptr) {
			m_indices->Release();
		}
		m_indices = index_data;
		m_indices_base_vertex_index = base_vertex_index;
		return S_OK;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	void capture_bound_draw(UINT first_vertex, UINT vertex_count, UINT first_index, UINT index_count)
	{
		g_state.last_draw_vertex_buffer_length = 0;
		g_state.last_draw_vertex_buffer_offset = 0;
		g_state.last_draw_vertex_buffer_bytes = 0;
		g_state.last_draw_vertex_buffer_checksum = 0;
		g_state.last_draw_stream_source_stride = 0;
		g_state.last_draw_index_buffer_length = 0;
		g_state.last_draw_index_buffer_offset = 0;
		g_state.last_draw_index_buffer_bytes = 0;
		g_state.last_draw_index_buffer_checksum = 0;
		g_state.last_draw_index_format = D3DFMT_UNKNOWN;
		g_state.last_draw_vertex_buffer_id = 0;
		g_state.last_draw_index_buffer_id = 0;
		g_state.last_draw_transform_mask = 0;
		identity_matrix(g_state.last_draw_world_transform);
		identity_matrix(g_state.last_draw_view_transform);
		identity_matrix(g_state.last_draw_projection_transform);
		g_state.last_draw_render_state = {};

		if (m_stream_source != nullptr && m_stream_source_stride != 0) {
			const BrowserD3DVertexBuffer *stream =
				static_cast<const BrowserD3DVertexBuffer *>(m_stream_source);
			const UINT offset = first_vertex * m_stream_source_stride;
			const UINT requested_bytes = vertex_count * m_stream_source_stride;
			const UINT captured_bytes = checked_range_size(stream->length(), offset, requested_bytes);
			g_state.last_draw_stream_source_stride = m_stream_source_stride;
			g_state.last_draw_vertex_buffer_length = stream->length();
			g_state.last_draw_vertex_buffer_offset = offset;
			g_state.last_draw_vertex_buffer_bytes = captured_bytes;
			g_state.last_draw_vertex_buffer_checksum = stream->checksum(offset, captured_bytes);
			g_state.last_draw_vertex_buffer_id = stream->browser_buffer_id();
		}

		if (m_indices != nullptr && index_count != 0) {
			const BrowserD3DIndexBuffer *indices = static_cast<const BrowserD3DIndexBuffer *>(m_indices);
			const UINT index_size = indices->index_size();
			const UINT offset = first_index * index_size;
			const UINT requested_bytes = index_count * index_size;
			const UINT captured_bytes = checked_range_size(indices->length(), offset, requested_bytes);
			g_state.last_draw_index_buffer_length = indices->length();
			g_state.last_draw_index_buffer_offset = offset;
			g_state.last_draw_index_buffer_bytes = captured_bytes;
			g_state.last_draw_index_buffer_checksum = indices->checksum(offset, captured_bytes);
			g_state.last_draw_index_format = indices->format();
			g_state.last_draw_index_buffer_id = indices->browser_buffer_id();
		}
	}

	DWORD render_state_value(D3DRENDERSTATETYPE state, DWORD default_value) const
	{
		const auto found = m_render_states.find(state);
		return found != m_render_states.end() ? found->second : default_value;
	}

	DWORD default_texture_stage_state_value(DWORD stage, UINT state) const
	{
		switch (state) {
			case D3DTSS_COLOROP:
				return stage == 0 ? D3DTOP_MODULATE : D3DTOP_DISABLE;
			case D3DTSS_COLORARG1:
				return D3DTA_TEXTURE;
			case D3DTSS_COLORARG2:
				return D3DTA_CURRENT;
			case D3DTSS_ALPHAOP:
				return stage == 0 ? D3DTOP_SELECTARG1 : D3DTOP_DISABLE;
			case D3DTSS_ALPHAARG1:
				return D3DTA_TEXTURE;
			case D3DTSS_ALPHAARG2:
				return D3DTA_CURRENT;
			case D3DTSS_TEXCOORDINDEX:
				return stage;
			case D3DTSS_ADDRESSU:
			case D3DTSS_ADDRESSV:
			case D3DTSS_ADDRESSW:
				return D3DTADDRESS_WRAP;
			case D3DTSS_MAGFILTER:
			case D3DTSS_MINFILTER:
				return D3DTEXF_POINT;
			case D3DTSS_MIPFILTER:
				return D3DTEXF_NONE;
			case D3DTSS_MAXANISOTROPY:
				return 1;
			case D3DTSS_TEXTURETRANSFORMFLAGS:
				return D3DTTFF_DISABLE;
			case D3DTSS_COLORARG0:
			case D3DTSS_ALPHAARG0:
			case D3DTSS_RESULTARG:
				return D3DTA_CURRENT;
			default:
				return 0;
		}
	}

	DWORD texture_stage_state_value(DWORD stage, UINT state) const
	{
		const auto stage_found = m_texture_stage_states.find(stage);
		if (stage_found != m_texture_stage_states.end()) {
			const auto state_found =
				stage_found->second.find(static_cast<D3DTEXTURESTAGESTATETYPE>(state));
			if (state_found != stage_found->second.end()) {
				return state_found->second;
			}
		}
		return default_texture_stage_state_value(stage, state);
	}

	void capture_draw_texture_stage_states()
	{
		for (UINT stage = 0; stage < WASM_D3D8_TEXTURE_STAGE_COUNT; ++stage) {
			WasmD3D8DrawTextureStageState &texture_stage =
				g_state.last_draw_render_state.texture_stages[stage];
			for (UINT state = 0; state < WASM_D3D8_TEXTURE_STAGE_STATE_SLOTS; ++state) {
				texture_stage.values[state] = texture_stage_state_value(stage, state);
			}
		}
	}

	void capture_draw_render_state()
	{
		WasmD3D8DrawRenderState &state = g_state.last_draw_render_state;
		state.cull_mode = render_state_value(D3DRS_CULLMODE, D3DCULL_CW);
		state.z_enable = render_state_value(D3DRS_ZENABLE, D3DZB_TRUE);
		state.z_write_enable = render_state_value(D3DRS_ZWRITEENABLE, TRUE);
		state.z_func = render_state_value(D3DRS_ZFUNC, D3DCMP_LESSEQUAL);
		state.alpha_blend_enable = render_state_value(D3DRS_ALPHABLENDENABLE, FALSE);
		state.src_blend = render_state_value(D3DRS_SRCBLEND, D3DBLEND_ONE);
		state.dest_blend = render_state_value(D3DRS_DESTBLEND, D3DBLEND_ZERO);
		state.blend_op = render_state_value(D3DRS_BLENDOP, D3DBLENDOP_ADD);
		state.alpha_test_enable = render_state_value(D3DRS_ALPHATESTENABLE, FALSE);
		state.alpha_func = render_state_value(D3DRS_ALPHAFUNC, D3DCMP_LESSEQUAL);
		state.alpha_ref = render_state_value(D3DRS_ALPHAREF, 0);
		state.color_write_enable = render_state_value(D3DRS_COLORWRITEENABLE,
			D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
				D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA);
		capture_draw_texture_stage_states();
	}

	void draw_bound_indexed_primitive(D3DPRIMITIVETYPE primitive_type, UINT base_vertex_index, UINT min_vertex_index,
		UINT vertex_count, UINT first_index, UINT index_count)
	{
		if (m_stream_source == nullptr || m_indices == nullptr || m_stream_source_stride == 0 || index_count == 0) {
			return;
		}

		const BrowserD3DVertexBuffer *stream = static_cast<const BrowserD3DVertexBuffer *>(m_stream_source);
		const BrowserD3DIndexBuffer *indices = static_cast<const BrowserD3DIndexBuffer *>(m_indices);
		if (min_vertex_index > std::numeric_limits<UINT>::max() - vertex_count) {
			return;
		}

		// Keep the D3D index buffer bytes unchanged for this first browser bridge.
		// Upload from BaseVertexIndex and include the MinVertexIndex range so raw
		// D3D indices still address the intended vertices in WebGL.
		const UINT uploaded_vertex_count = min_vertex_index + vertex_count;
		if (base_vertex_index > std::numeric_limits<UINT>::max() / m_stream_source_stride ||
				uploaded_vertex_count > std::numeric_limits<UINT>::max() / m_stream_source_stride) {
			return;
		}
		const UINT vertex_offset = base_vertex_index * m_stream_source_stride;
		const UINT requested_vertex_bytes = uploaded_vertex_count * m_stream_source_stride;
		const UINT vertex_bytes = checked_range_size(stream->length(), vertex_offset, requested_vertex_bytes);
		const UINT index_size = indices->index_size();
		const UINT index_offset = first_index * index_size;
		const UINT requested_index_bytes = index_count * index_size;
		const UINT index_bytes = checked_range_size(indices->length(), index_offset, requested_index_bytes);
		capture_draw_transform(D3DTS_WORLD, DRAW_TRANSFORM_WORLD, g_state.last_draw_world_transform);
		capture_draw_transform(D3DTS_VIEW, DRAW_TRANSFORM_VIEW, g_state.last_draw_view_transform);
		capture_draw_transform(D3DTS_PROJECTION, DRAW_TRANSFORM_PROJECTION, g_state.last_draw_projection_transform);
		capture_draw_render_state();

		if (vertex_bytes == 0 || index_bytes == 0) {
			return;
		}

		browser_draw_indexed(
			primitive_type,
			stream->browser_buffer_id(),
			vertex_offset,
			vertex_bytes,
			uploaded_vertex_count,
			m_stream_source_stride,
			indices->browser_buffer_id(),
			index_offset,
			index_bytes,
			index_count,
			index_size,
			g_state.last_draw_transform_mask,
			&g_state.last_draw_world_transform,
			&g_state.last_draw_view_transform,
			&g_state.last_draw_projection_transform,
			&g_state.last_draw_render_state);
	}

	void capture_draw_transform(D3DTRANSFORMSTATETYPE state, UINT mask_bit, D3DMATRIX &destination) const
	{
		const auto found = m_transforms.find(state);
		if (found != m_transforms.end()) {
			destination = found->second;
			g_state.last_draw_transform_mask |= mask_bit;
		} else {
			identity_matrix(destination);
		}
	}

	HRESULT create_surface(UINT width, UINT height, D3DFORMAT format, DWORD usage, IDirect3DSurface8 **surface)
	{
		if (surface == nullptr) {
			return E_FAIL;
		}
		*surface = new (std::nothrow) BrowserD3DSurface(this, width, height, format, usage);
		return *surface != nullptr ? S_OK : D3DERR_OUTOFVIDEOMEMORY;
	}

	ULONG m_ref_count = 1;
	D3DPRESENT_PARAMETERS m_parameters = {};
	D3DVIEWPORT8 m_viewport = {};
	std::map<D3DTRANSFORMSTATETYPE, D3DMATRIX> m_transforms;
	std::map<D3DRENDERSTATETYPE, DWORD> m_render_states;
	std::map<DWORD, std::map<D3DTEXTURESTAGESTATETYPE, DWORD>> m_texture_stage_states;
	std::map<DWORD, UINT> m_bound_texture_ids;
	std::map<DWORD, IDirect3DBaseTexture8 *> m_bound_textures;
	IDirect3DSurface8 *m_back_buffer = nullptr;
	IDirect3DSurface8 *m_depth_stencil = nullptr;
	IDirect3DVertexBuffer8 *m_stream_source = nullptr;
	IDirect3DIndexBuffer8 *m_indices = nullptr;
	UINT m_stream_source_stride = 0;
	UINT m_indices_base_vertex_index = 0;
};

class BrowserD3D8 final : public IDirect3D8
{
public:
	explicit BrowserD3D8(UINT) {}

	HRESULT RegisterSoftwareDevice(void *) override { return D3DERR_NOTAVAILABLE; }
	UINT GetAdapterCount() override { return 1; }

	HRESULT GetAdapterIdentifier(UINT adapter, DWORD, D3DADAPTER_IDENTIFIER8 *identifier) override
	{
		if (adapter != D3DADAPTER_DEFAULT || identifier == nullptr) {
			return E_FAIL;
		}
		std::memset(identifier, 0, sizeof(*identifier));
		std::strncpy(identifier->Driver, "browser-d3d8", sizeof(identifier->Driver) - 1);
		std::strncpy(identifier->Description, "Browser Direct3D8 compatibility shim",
			sizeof(identifier->Description) - 1);
		std::strncpy(identifier->DeviceName, "webgl2", sizeof(identifier->DeviceName) - 1);
		return S_OK;
	}

	UINT GetAdapterModeCount(UINT adapter) override { return adapter == D3DADAPTER_DEFAULT ? 1 : 0; }

	HRESULT EnumAdapterModes(UINT adapter, UINT mode, D3DDISPLAYMODE *display_mode) override
	{
		if (adapter != D3DADAPTER_DEFAULT || mode != 0 || display_mode == nullptr) {
			return E_FAIL;
		}
		fill_display_mode(*display_mode);
		return S_OK;
	}

	HRESULT GetAdapterDisplayMode(UINT adapter, D3DDISPLAYMODE *display_mode) override
	{
		if (adapter != D3DADAPTER_DEFAULT || display_mode == nullptr) {
			return E_FAIL;
		}
		fill_display_mode(*display_mode);
		return S_OK;
	}

	HRESULT CheckDeviceType(UINT adapter, DWORD, D3DFORMAT, D3DFORMAT, BOOL) override
	{
		return adapter == D3DADAPTER_DEFAULT ? S_OK : D3DERR_NOTAVAILABLE;
	}

	HRESULT CheckDeviceFormat(UINT adapter, DWORD, D3DFORMAT, DWORD, D3DRESOURCETYPE, D3DFORMAT) override
	{
		return adapter == D3DADAPTER_DEFAULT ? S_OK : D3DERR_NOTAVAILABLE;
	}

	HRESULT CheckDepthStencilMatch(UINT adapter, DWORD, D3DFORMAT, D3DFORMAT, D3DFORMAT) override
	{
		return adapter == D3DADAPTER_DEFAULT ? S_OK : D3DERR_NOTAVAILABLE;
	}

	HRESULT GetDeviceCaps(UINT adapter, DWORD, D3DCAPS8 *caps) override
	{
		if (adapter != D3DADAPTER_DEFAULT || caps == nullptr) {
			return E_FAIL;
		}
		fill_caps(*caps);
		return S_OK;
	}

	HRESULT CreateDevice(UINT adapter, DWORD, HWND, DWORD, D3DPRESENT_PARAMETERS *presentation_parameters,
		IDirect3DDevice8 **device) override
	{
		if (adapter != D3DADAPTER_DEFAULT || presentation_parameters == nullptr || device == nullptr) {
			return E_FAIL;
		}
		*device = new (std::nothrow) BrowserD3DDevice(*presentation_parameters);
		if (*device == nullptr) {
			return D3DERR_OUTOFVIDEOMEMORY;
		}
		++g_state.create_device_calls;
		return S_OK;
	}

	ULONG AddRef() override { return ++m_ref_count; }

	ULONG Release() override
	{
		const ULONG ref_count = --m_ref_count;
		if (ref_count == 0) {
			delete this;
		}
		return ref_count;
	}

private:
	ULONG m_ref_count = 1;
};

} // namespace

extern "C" void wasm_d3d8_reset_state()
{
	std::memset(&g_state, 0, sizeof(g_state));
}

extern "C" const WasmD3D8ShimState *wasm_d3d8_get_state()
{
	return &g_state;
}

extern "C" HMODULE wasm_d3d8_load_library_a(LPCSTR library_name)
{
	++g_state.load_library_calls;
	if (ascii_iequals(library_name, "D3D8.DLL") || ascii_iequals(library_name, "D3D8")) {
		return d3d8_module_handle();
	}
	return nullptr;
}

extern "C" BOOL wasm_d3d8_free_library(HMODULE module)
{
	++g_state.free_library_calls;
	return module == nullptr || module == d3d8_module_handle() ? TRUE : FALSE;
}

extern "C" FARPROC wasm_d3d8_get_proc_address(HMODULE module, LPCSTR procedure_name)
{
	++g_state.get_proc_address_calls;
	if (module == d3d8_module_handle() && procedure_name != nullptr &&
		std::strcmp(procedure_name, "Direct3DCreate8") == 0) {
		return reinterpret_cast<FARPROC>(&Direct3DCreate8);
	}
	return nullptr;
}

IDirect3D8 *Direct3DCreate8(UINT sdk_version)
{
	++g_state.direct3d_create_calls;
	if (sdk_version != D3D_SDK_VERSION) {
		return nullptr;
	}
	return new (std::nothrow) BrowserD3D8(sdk_version);
}

HRESULT D3DXLoadSurfaceFromSurface(
	IDirect3DSurface8 *,
	const void *,
	const RECT *,
	IDirect3DSurface8 *,
	const void *,
	const RECT *,
	DWORD,
	D3DCOLOR)
{
	return D3DERR_NOTAVAILABLE;
}

HRESULT D3DXCreateTexture(
	IDirect3DDevice8 *device,
	UINT width,
	UINT height,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DTexture8 **texture)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	*texture = nullptr;
	if (device == nullptr) {
		return E_FAIL;
	}
	return device->CreateTexture(width, height, levels, usage, format, pool, texture);
}

HRESULT D3DXCreateTextureFromFileExA(
	IDirect3DDevice8 *,
	LPCSTR,
	UINT,
	UINT,
	UINT,
	DWORD,
	D3DFORMAT,
	D3DPOOL,
	DWORD,
	DWORD,
	D3DCOLOR,
	void *,
	void *,
	IDirect3DTexture8 **texture)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	*texture = nullptr;
	return D3DERR_NOTAVAILABLE;
}

HRESULT D3DXFilterTexture(IDirect3DBaseTexture8 *, const void *, UINT, DWORD)
{
	return D3DERR_NOTAVAILABLE;
}

HRESULT D3DXCreateCubeTexture(
	IDirect3DDevice8 *device,
	UINT edge_length,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DCubeTexture8 **texture)
{
	if (texture == nullptr) {
		return E_FAIL;
	}
	*texture = nullptr;
	if (device == nullptr) {
		return E_FAIL;
	}
	return device->CreateCubeTexture(edge_length, levels, usage, format, pool, texture);
}
