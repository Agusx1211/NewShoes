#include <cstdio>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "dx8wrapper.h"
#include "wasm_d3d8_shim.h"
#include "ww3d.h"

namespace {

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "%s\n", message);
		return false;
	}
	return true;
}

} // namespace

int main()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	if (!expect(DX8Wrapper::Init(nullptr, false), "DX8Wrapper::Init failed")) {
		return 1;
	}

	bool ok = expect(
		WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true) == WW3D_ERROR_OK,
		"WW3D::Set_Render_Device failed");

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	ok = ok &&
		expect(DX8Wrapper::_Get_D3D_Device8() != nullptr, "DX8Wrapper D3D device is null") &&
		expect(state->create_device_calls == 1, "CreateDevice call count mismatch") &&
		expect(state->create_texture_calls >= 1, "MissingTexture did not create a texture") &&
		expect(state->texture_lock_rect_calls >= 1, "MissingTexture did not lock a texture") &&
		expect(state->texture_unlock_rect_calls >= 1, "MissingTexture did not unlock a texture") &&
		expect(state->create_index_buffer_calls >= 1, "WW3D init did not create an index buffer") &&
		expect(state->buffer_lock_calls >= 1, "WW3D init did not lock a fixed buffer") &&
		expect(state->buffer_unlock_calls >= 1, "WW3D init did not unlock a fixed buffer");

	if (ok) {
		DX8Wrapper::Begin_Scene();
		DX8Wrapper::Clear(true, true, Vector3(0.0f, 0.25f, 0.5f), 0.75f, 1.0f, 0);
		DX8Wrapper::End_Scene(true);
	}

	state = wasm_d3d8_get_state();
	ok = ok &&
		expect(state->begin_scene_calls == 1, "BeginScene call count mismatch") &&
		expect(state->clear_calls == 1, "Clear call count mismatch") &&
		expect((state->last_clear_flags & D3DCLEAR_TARGET) != 0, "Clear did not include color target") &&
		expect((state->last_clear_flags & D3DCLEAR_ZBUFFER) != 0, "Clear did not include z buffer") &&
		expect(state->end_scene_calls == 1, "EndScene call count mismatch") &&
		expect(state->present_calls == 1, "Present call count mismatch");

	DX8Wrapper::Shutdown();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-dx8wrapper-render\","
		"\"createDevice\":%u,\"createTexture\":%u,\"createIndexBuffer\":%u,"
		"\"createVertexBuffer\":%u,\"clear\":%u,\"present\":%u}\n",
		state->create_device_calls,
		state->create_texture_calls,
		state->create_index_buffer_calls,
		state->create_vertex_buffer_calls,
		state->clear_calls,
		state->present_calls);
	return 0;
}
