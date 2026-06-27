#include <cstdio>

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

bool near(float actual, float expected)
{
	const float difference = actual > expected ? actual - expected : expected - actual;
	return difference <= 0.0001f;
}

} // namespace

int main()
{
	wasm_d3d8_reset_state();

	IDirect3D8 *d3d = Direct3DCreate8(D3D_SDK_VERSION);
	if (!expect(d3d != nullptr, "Direct3DCreate8 returned null")) {
		return 1;
	}

	D3DDISPLAYMODE mode = {};
	if (!expect(SUCCEEDED(d3d->GetAdapterDisplayMode(D3DADAPTER_DEFAULT, &mode)), "display mode failed") ||
		!expect(mode.Width == 800 && mode.Height == 600, "display mode size mismatch") ||
		!expect(mode.Format == D3DFMT_A8R8G8B8, "display mode format mismatch")) {
		d3d->Release();
		return 1;
	}

	D3DPRESENT_PARAMETERS parameters = {};
	parameters.BackBufferWidth = 640;
	parameters.BackBufferHeight = 360;
	parameters.BackBufferFormat = D3DFMT_A8R8G8B8;
	parameters.BackBufferCount = 1;
	parameters.MultiSampleType = D3DMULTISAMPLE_NONE;
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
	if (!expect(SUCCEEDED(device->GetDeviceCaps(&caps)), "GetDeviceCaps failed") ||
		!expect(caps.MaxSimultaneousTextures == 8, "device caps texture count mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	D3DVIEWPORT8 viewport = {};
	if (!expect(SUCCEEDED(device->GetViewport(&viewport)), "GetViewport failed") ||
		!expect(viewport.Width == 640 && viewport.Height == 360, "initial viewport mismatch")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	viewport.X = 4;
	viewport.Y = 8;
	viewport.Width = 320;
	viewport.Height = 180;
	viewport.MinZ = 0.25f;
	viewport.MaxZ = 0.75f;
	if (!expect(SUCCEEDED(device->SetViewport(&viewport)), "SetViewport failed")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	IDirect3DSurface8 *depth = nullptr;
	D3DSURFACE_DESC depth_desc = {};
	if (!expect(SUCCEEDED(device->GetDepthStencilSurface(&depth)), "GetDepthStencilSurface failed") ||
		!expect(depth != nullptr, "GetDepthStencilSurface returned null") ||
		!expect(SUCCEEDED(depth->GetDesc(&depth_desc)), "depth surface GetDesc failed") ||
		!expect(depth_desc.Format == D3DFMT_D24S8, "depth surface format mismatch") ||
		!expect(depth_desc.Width == 640 && depth_desc.Height == 360, "depth surface size mismatch")) {
		if (depth != nullptr) {
			depth->Release();
		}
		device->Release();
		d3d->Release();
		return 1;
	}
	depth->Release();

	const D3DCOLOR clear_color = 0xff204080;
	if (!expect(SUCCEEDED(device->BeginScene()), "BeginScene failed") ||
		!expect(SUCCEEDED(device->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER | D3DCLEAR_STENCIL,
			clear_color, 0.5f, 7)),
			"Clear failed") ||
		!expect(SUCCEEDED(device->EndScene()), "EndScene failed") ||
		!expect(SUCCEEDED(device->Present(nullptr, nullptr, nullptr, nullptr)), "Present failed")) {
		device->Release();
		d3d->Release();
		return 1;
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool state_ok =
		expect(state->direct3d_create_calls == 1, "Direct3DCreate8 call count mismatch") &&
		expect(state->load_library_calls == 0, "LoadLibrary call count mismatch") &&
		expect(state->get_proc_address_calls == 0, "GetProcAddress call count mismatch") &&
		expect(state->free_library_calls == 0, "FreeLibrary call count mismatch") &&
		expect(state->create_device_calls == 1, "CreateDevice call count mismatch") &&
		expect(state->begin_scene_calls == 1, "BeginScene call count mismatch") &&
		expect(state->clear_calls == 1, "Clear call count mismatch") &&
		expect(state->end_scene_calls == 1, "EndScene call count mismatch") &&
		expect(state->present_calls == 1, "Present call count mismatch") &&
		expect(state->last_clear_flags == (D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER | D3DCLEAR_STENCIL),
			"clear flags mismatch") &&
		expect(state->last_clear_color == clear_color, "clear color mismatch") &&
		expect(near(state->last_clear_z, 0.5f), "clear z mismatch") &&
		expect(state->last_clear_stencil == 7, "clear stencil mismatch") &&
		expect(state->back_buffer_width == 640 && state->back_buffer_height == 360,
			"back-buffer state mismatch") &&
		expect(state->back_buffer_format == D3DFMT_A8R8G8B8, "back-buffer format mismatch") &&
		expect(state->depth_stencil_format == D3DFMT_D24S8, "depth-stencil state mismatch") &&
		expect(state->viewport.X == 4 && state->viewport.Y == 8 &&
			state->viewport.Width == 320 && state->viewport.Height == 180,
			"viewport state mismatch");

	device->Release();
	d3d->Release();

	if (!state_ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"d3d8-shim\",\"clearColor\":%lu}\n",
		static_cast<unsigned long>(clear_color));
	return 0;
}
