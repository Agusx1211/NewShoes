#pragma once

#include "d3d8.h"

struct WasmD3D8ShimState
{
	UINT direct3d_create_calls;
	UINT load_library_calls;
	UINT get_proc_address_calls;
	UINT free_library_calls;
	UINT create_device_calls;
	UINT begin_scene_calls;
	UINT end_scene_calls;
	UINT clear_calls;
	UINT present_calls;
	DWORD last_clear_flags;
	D3DCOLOR last_clear_color;
	float last_clear_z;
	DWORD last_clear_stencil;
	UINT back_buffer_width;
	UINT back_buffer_height;
	D3DFORMAT back_buffer_format;
	D3DFORMAT depth_stencil_format;
	D3DVIEWPORT8 viewport;
};

extern "C" void wasm_d3d8_reset_state();
extern "C" const WasmD3D8ShimState *wasm_d3d8_get_state();
