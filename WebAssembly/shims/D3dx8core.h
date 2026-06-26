#pragma once

#include "d3d8.h"
#include "D3DX8Math.h"

#define D3DX_DEFAULT 0xffffffff
#define D3DX_FILTER_NONE 1
#define D3DX_FILTER_POINT 2
#define D3DX_FILTER_LINEAR 3
#define D3DX_FILTER_TRIANGLE 4
#define D3DX_FILTER_BOX 5

static inline HRESULT D3DXGetErrorStringA(HRESULT result, LPSTR buffer, UINT buffer_len)
{
	if (buffer == nullptr || buffer_len == 0) {
		return E_FAIL;
	}

	const int written = std::snprintf(
		buffer,
		static_cast<std::size_t>(buffer_len),
		"D3D HRESULT 0x%08lx",
		static_cast<unsigned long>(result));
	return written > 0 ? D3D_OK : E_FAIL;
}

static inline UINT D3DXGetFVFVertexSize(DWORD fvf)
{
	UINT size = 0;

	if ((fvf & D3DFVF_XYZ) == D3DFVF_XYZ) {
		size += 3 * sizeof(float);
	} else if ((fvf & D3DFVF_XYZB4) == D3DFVF_XYZB4) {
		size += 7 * sizeof(float);
	}
	if ((fvf & D3DFVF_NORMAL) == D3DFVF_NORMAL) {
		size += 3 * sizeof(float);
	}
	if ((fvf & D3DFVF_DIFFUSE) == D3DFVF_DIFFUSE) {
		size += sizeof(DWORD);
	}
	if ((fvf & D3DFVF_SPECULAR) == D3DFVF_SPECULAR) {
		size += sizeof(DWORD);
	}

	const UINT tex_count = (fvf & D3DFVF_TEXCOUNT_MASK) >> D3DFVF_TEXCOUNT_SHIFT;
	for (UINT coord = 0; coord < tex_count; ++coord) {
		const DWORD coord_size = (fvf >> (16 + coord * 2)) & 0x3;
		switch (coord_size) {
			case 0: size += 2 * sizeof(float); break;
			case 1: size += 3 * sizeof(float); break;
			case 2: size += 4 * sizeof(float); break;
			case 3: size += 1 * sizeof(float); break;
		}
	}

	return size;
}

HRESULT D3DXLoadSurfaceFromSurface(
	IDirect3DSurface8 *dest_surface,
	const void *dest_palette,
	const RECT *dest_rect,
	IDirect3DSurface8 *source_surface,
	const void *source_palette,
	const RECT *source_rect,
	DWORD filter,
	D3DCOLOR color_key);

HRESULT D3DXCreateTexture(
	IDirect3DDevice8 *device,
	UINT width,
	UINT height,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DTexture8 **texture);

HRESULT D3DXCreateTextureFromFileExA(
	IDirect3DDevice8 *device,
	LPCSTR src_file,
	UINT width,
	UINT height,
	UINT mip_levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	DWORD filter,
	DWORD mip_filter,
	D3DCOLOR color_key,
	void *src_info,
	void *palette,
	IDirect3DTexture8 **texture);

HRESULT D3DXFilterTexture(
	IDirect3DBaseTexture8 *base_texture,
	const void *palette,
	UINT src_level,
	DWORD filter);

HRESULT D3DXCreateCubeTexture(
	IDirect3DDevice8 *device,
	UINT edge_length,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DCubeTexture8 **texture);

HRESULT D3DXCreateVolumeTexture(
	IDirect3DDevice8 *device,
	UINT width,
	UINT height,
	UINT depth,
	UINT levels,
	DWORD usage,
	D3DFORMAT format,
	D3DPOOL pool,
	IDirect3DVolumeTexture8 **texture);
