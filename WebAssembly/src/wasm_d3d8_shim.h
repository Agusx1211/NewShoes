#pragma once

#include "d3d8.h"

struct WasmD3D8ShimState
{
	UINT direct3d_create_calls;
	UINT load_library_calls;
	UINT get_proc_address_calls;
	UINT free_library_calls;
	UINT create_device_calls;
	UINT create_texture_calls;
	UINT texture_lock_rect_calls;
	UINT texture_unlock_rect_calls;
	UINT create_vertex_buffer_calls;
	UINT create_index_buffer_calls;
	UINT buffer_lock_calls;
	UINT buffer_unlock_calls;
	UINT set_stream_source_calls;
	UINT set_indices_calls;
	UINT draw_primitive_calls;
	UINT draw_indexed_primitive_calls;
	D3DPRIMITIVETYPE last_draw_primitive_type;
	UINT last_draw_start_vertex;
	UINT last_draw_min_vertex_index;
	UINT last_draw_vertex_count;
	UINT last_draw_start_index;
	UINT last_draw_primitive_count;
	UINT last_stream_source_stride;
	UINT last_draw_stream_source_stride;
	UINT last_indices_base_vertex_index;
	UINT last_draw_vertex_buffer_length;
	UINT last_draw_vertex_buffer_offset;
	UINT last_draw_vertex_buffer_bytes;
	DWORD last_draw_vertex_buffer_checksum;
	UINT last_draw_index_buffer_length;
	UINT last_draw_index_buffer_offset;
	UINT last_draw_index_buffer_bytes;
	DWORD last_draw_index_buffer_checksum;
	D3DFORMAT last_draw_index_format;
	UINT last_draw_transform_mask;
	D3DMATRIX last_draw_world_transform;
	D3DMATRIX last_draw_view_transform;
	D3DMATRIX last_draw_projection_transform;
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
	UINT set_transform_calls;
	UINT get_transform_calls;
	UINT set_viewport_calls;
	UINT get_viewport_calls;
	UINT set_render_state_calls;
	UINT get_render_state_calls;
	D3DTRANSFORMSTATETYPE last_set_transform_state;
	D3DTRANSFORMSTATETYPE last_get_transform_state;
	D3DMATRIX last_set_transform_matrix;
	D3DRENDERSTATETYPE last_set_render_state;
	D3DRENDERSTATETYPE last_get_render_state;
	DWORD last_set_render_state_value;
};

extern "C" void wasm_d3d8_reset_state();
extern "C" const WasmD3D8ShimState *wasm_d3d8_get_state();
