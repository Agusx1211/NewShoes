#include "wasm_d3d8_shim.h"

#include "D3dx8core.h"

#include <cstring>
#include <new>
#include <vector>

namespace {

WasmD3D8ShimState g_state = {};
int g_d3d8_module = 0;

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

	HRESULT LockRect(D3DLOCKED_RECT *locked_rect, const RECT *rect, DWORD) override
	{
		if (locked_rect == nullptr || m_pixels.empty()) {
			return E_FAIL;
		}

		int left = 0;
		int top = 0;
		if (rect != nullptr) {
			if (rect->left < 0 || rect->top < 0 || rect->right < rect->left || rect->bottom < rect->top ||
				static_cast<UINT>(rect->right) > m_desc.Width ||
				static_cast<UINT>(rect->bottom) > m_desc.Height) {
				return E_FAIL;
			}
			left = rect->left;
			top = rect->top;
		}

		locked_rect->Pitch = m_pitch;
		locked_rect->pBits = m_pixels.data() + (top * m_pitch) + (left * bytes_per_pixel(m_desc.Format));
		return S_OK;
	}

	HRESULT UnlockRect() override { return S_OK; }

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
	}

	~BrowserD3DTexture()
	{
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
		return m_levels[level]->LockRect(locked_rect, rect, flags);
	}

	HRESULT UnlockRect(UINT level) override
	{
		if (level >= m_levels.size()) {
			return E_FAIL;
		}
		++g_state.texture_unlock_rect_calls;
		return m_levels[level]->UnlockRect();
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
};

class BrowserD3DVertexBuffer final : public IDirect3DVertexBuffer8, private BrowserD3DResource
{
public:
	BrowserD3DVertexBuffer(IDirect3DDevice8 *device, UINT length, DWORD, DWORD, D3DPOOL) :
		BrowserD3DResource(device),
		m_bytes(length)
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

	HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD) override
	{
		if (data == nullptr || offset > m_bytes.size()) {
			return E_FAIL;
		}
		if (size == 0) {
			size = static_cast<UINT>(m_bytes.size() - offset);
		}
		if (size > m_bytes.size() - offset) {
			return E_FAIL;
		}
		++g_state.buffer_lock_calls;
		*data = m_bytes.data() + offset;
		return S_OK;
	}

	HRESULT Unlock() override
	{
		++g_state.buffer_unlock_calls;
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
	std::vector<BYTE> m_bytes;
};

class BrowserD3DIndexBuffer final : public IDirect3DIndexBuffer8, private BrowserD3DResource
{
public:
	BrowserD3DIndexBuffer(IDirect3DDevice8 *device, UINT length, DWORD, D3DFORMAT, D3DPOOL) :
		BrowserD3DResource(device),
		m_bytes(length)
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

	HRESULT Lock(UINT offset, UINT size, BYTE **data, DWORD) override
	{
		if (data == nullptr || offset > m_bytes.size()) {
			return E_FAIL;
		}
		if (size == 0) {
			size = static_cast<UINT>(m_bytes.size() - offset);
		}
		if (size > m_bytes.size() - offset) {
			return E_FAIL;
		}
		++g_state.buffer_lock_calls;
		*data = m_bytes.data() + offset;
		return S_OK;
	}

	HRESULT Unlock() override
	{
		++g_state.buffer_unlock_calls;
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
	std::vector<BYTE> m_bytes;
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
		return S_OK;
	}

	HRESULT SetTransform(D3DTRANSFORMSTATETYPE, const D3DMATRIX *) override { return S_OK; }
	HRESULT GetTransform(D3DTRANSFORMSTATETYPE, D3DMATRIX *) override { return D3DERR_NOTAVAILABLE; }
	HRESULT MultiplyTransform(D3DTRANSFORMSTATETYPE, const D3DMATRIX *) override { return S_OK; }

	HRESULT SetViewport(const D3DVIEWPORT8 *viewport) override
	{
		if (viewport == nullptr) {
			return E_FAIL;
		}
		m_viewport = *viewport;
		g_state.viewport = m_viewport;
		return S_OK;
	}

	HRESULT GetViewport(D3DVIEWPORT8 *viewport) override
	{
		if (viewport == nullptr) {
			return E_FAIL;
		}
		*viewport = m_viewport;
		return S_OK;
	}

	HRESULT SetMaterial(const D3DMATERIAL8 *) override { return S_OK; }
	HRESULT GetMaterial(D3DMATERIAL8 *) override { return D3DERR_NOTAVAILABLE; }
	HRESULT SetLight(DWORD, const D3DLIGHT8 *) override { return S_OK; }
	HRESULT LightEnable(DWORD, BOOL) override { return S_OK; }
	HRESULT SetClipPlane(DWORD, const float *) override { return S_OK; }
	HRESULT SetRenderState(D3DRENDERSTATETYPE, DWORD) override { return S_OK; }
	HRESULT GetRenderState(D3DRENDERSTATETYPE, DWORD *) override { return D3DERR_NOTAVAILABLE; }
	HRESULT SetTexture(DWORD, IDirect3DBaseTexture8 *) override { return S_OK; }
	HRESULT SetTextureStageState(DWORD, D3DTEXTURESTAGESTATETYPE, DWORD) override { return S_OK; }
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
	HRESULT SetStreamSource(UINT, IDirect3DVertexBuffer8 *, UINT stride) override
	{
		++g_state.set_stream_source_calls;
		g_state.last_stream_source_stride = stride;
		return S_OK;
	}
	HRESULT SetIndices(IDirect3DIndexBuffer8 *, UINT base_vertex_index) override
	{
		++g_state.set_indices_calls;
		g_state.last_indices_base_vertex_index = base_vertex_index;
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
	IDirect3DSurface8 *m_back_buffer = nullptr;
	IDirect3DSurface8 *m_depth_stencil = nullptr;
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
