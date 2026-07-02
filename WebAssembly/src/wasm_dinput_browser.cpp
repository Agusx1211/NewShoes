// Browser DirectInput boundary for the original Win32DIKeyboard.cpp.
//
// The real DirectInputKeyboard (GameEngineDevice/Source/Win32Device/GameClient/
// Win32DIKeyboard.cpp) runs unmodified: DirectInput8Create() hands out a
// browser-backed device whose GetDeviceData() drains a DIK scan-code queue.
// The harness/JS bridge feeds DOM keyboard events into the queue through
// cnc_port_dinput_queue_key() (DOM code -> DIK translation happens on the
// browser side, mirroring how the DOM already feeds WasmWin32Input).

#include <cstdio>

#include <windows.h>
#include <dinput.h>

#include <emscripten/emscripten.h>

namespace {

struct QueuedKey {
	unsigned int dik_code;
	int key_down;
	unsigned int timestamp;
};

constexpr unsigned int kMaxQueuedKeys = 256;
QueuedKey g_key_queue[kMaxQueuedKeys];
unsigned int g_key_queue_head = 0;
unsigned int g_key_queue_count = 0;
unsigned int g_key_sequence = 0;
bool g_device_acquired = false;

IDirectInput8 g_direct_input;
IDirectInputDevice8 g_keyboard_device;

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE int cnc_port_dinput_queue_key(
	unsigned int dik_code,
	int key_down,
	unsigned int timestamp)
{
	if (g_key_queue_count >= kMaxQueuedKeys) {
		return 0;
	}
	const unsigned int slot = (g_key_queue_head + g_key_queue_count) % kMaxQueuedKeys;
	g_key_queue[slot].dik_code = dik_code;
	g_key_queue[slot].key_down = key_down;
	g_key_queue[slot].timestamp = timestamp;
	++g_key_queue_count;
	return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE unsigned int cnc_port_dinput_queued_key_count(void)
{
	return g_key_queue_count;
}

HRESULT IDirectInputDevice8::SetDataFormat(const DIDATAFORMAT *const *)
{
	return DI_OK;
}

HRESULT IDirectInputDevice8::SetCooperativeLevel(HWND, DWORD)
{
	return DI_OK;
}

HRESULT IDirectInputDevice8::SetProperty(const GUID &, const DIPROPHEADER *)
{
	return DI_OK;
}

HRESULT IDirectInputDevice8::Acquire()
{
	g_device_acquired = true;
	return DI_OK;
}

HRESULT IDirectInputDevice8::Unacquire()
{
	g_device_acquired = false;
	return DI_OK;
}

HRESULT IDirectInputDevice8::GetDeviceData(
	DWORD element_size,
	DIDEVICEOBJECTDATA *data,
	DWORD *count,
	DWORD flags)
{
	(void)element_size;
	(void)flags;
	if (count == nullptr) {
		return DIERR_INVALIDPARAM;
	}

	DWORD requested = *count;
	DWORD produced = 0;
	while (produced < requested && g_key_queue_count > 0) {
		const QueuedKey &key = g_key_queue[g_key_queue_head];
		if (data != nullptr) {
			DIDEVICEOBJECTDATA &out = data[produced];
			out.dwOfs = key.dik_code;
			out.dwData = key.key_down ? 0x80 : 0x00;
			out.dwTimeStamp = key.timestamp;
			out.dwSequence = ++g_key_sequence;
			out.uAppData = 0;
		}
		g_key_queue_head = (g_key_queue_head + 1) % kMaxQueuedKeys;
		--g_key_queue_count;
		++produced;
	}
	*count = produced;
	return DI_OK;
}

ULONG IDirectInputDevice8::Release()
{
	g_device_acquired = false;
	return 0;
}

HRESULT IDirectInput8::CreateDevice(const GUID &, IDirectInputDevice8 **device, void *)
{
	if (device == nullptr) {
		return DIERR_INVALIDPARAM;
	}
	*device = &g_keyboard_device;
	return DI_OK;
}

ULONG IDirectInput8::Release()
{
	return 0;
}

HRESULT DirectInput8Create(HINSTANCE, DWORD, const GUID &, void **out, void *)
{
	if (out == nullptr) {
		return DIERR_INVALIDPARAM;
	}
	*out = &g_direct_input;
	std::printf("cnc-port: DirectInput8Create -> browser DIK-queue keyboard device\n");
	return DI_OK;
}
