#include <cstdio>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "dx8wrapper.h"
#include "wasm_d3d8_shim.h"

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

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	bool init_ok =
		expect(DX8Wrapper::Is_Initted(), "DX8Wrapper did not report initialized") &&
		expect(DX8Wrapper::_Get_D3D8() != nullptr, "DX8Wrapper D3D8 interface is null") &&
		expect(DX8Wrapper::_Get_D3D_Device8() == nullptr, "DX8Wrapper created a device during Init") &&
		expect(state->load_library_calls == 1, "D3D8 LoadLibrary call count mismatch") &&
		expect(state->get_proc_address_calls == 1, "D3D8 GetProcAddress call count mismatch") &&
		expect(state->direct3d_create_calls == 1, "Direct3DCreate8 call count mismatch") &&
		expect(state->create_device_calls == 0, "CreateDevice should not run during DX8Wrapper::Init");

	DX8Wrapper::Shutdown();

	state = wasm_d3d8_get_state();
	init_ok = init_ok &&
		expect(!DX8Wrapper::Is_Initted(), "DX8Wrapper did not shut down") &&
		expect(DX8Wrapper::_Get_D3D8() == nullptr, "DX8Wrapper D3D8 interface survived shutdown") &&
		expect(state->free_library_calls == 1, "D3D8 FreeLibrary call count mismatch");

	if (!init_ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-dx8wrapper-loader\","
		"\"loadLibrary\":%u,\"getProcAddress\":%u,\"direct3DCreate\":%u}\n",
		state->load_library_calls,
		state->get_proc_address_calls,
		state->direct3d_create_calls);
	return 0;
}
