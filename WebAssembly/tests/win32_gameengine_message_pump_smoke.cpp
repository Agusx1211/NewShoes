#include <iostream>

#include <windows.h>

#include "Common/GameAudio.h"
#include "GameLogic/GameLogic.h"
#include "GameNetwork/LANAPICallbacks.h"
#include "Win32Device/Common/Win32GameEngine.h"

DWORD TheMessageTime = 0;
GameLogic *TheGameLogic = nullptr;
AudioManager *TheAudio = nullptr;
LANAPI *TheLAN = nullptr;

namespace {
int g_dispatch_count = 0;
HWND g_seen_window = nullptr;
UINT g_seen_message = 0;
WPARAM g_seen_wparam = 0;
LPARAM g_seen_lparam = 0;
DWORD g_seen_message_time = 0;

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

LRESULT CALLBACK SmokeWindowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam)
{
	++g_dispatch_count;
	g_seen_window = window;
	g_seen_message = message;
	g_seen_wparam = wparam;
	g_seen_lparam = lparam;
	g_seen_message_time = TheMessageTime;
	return 0x1234;
}
} // namespace

int main()
{
	WasmWin32Input::Reset();

	WNDCLASS window_class = {};
	window_class.lpfnWndProc = SmokeWindowProc;
	window_class.lpszClassName = "SmokeWin32GameEngineWindow";
	if (!expect(RegisterClass(&window_class) != 0, "RegisterClass should accept a window procedure")) {
		return 1;
	}

	HWND window = CreateWindow(
		window_class.lpszClassName,
		"smoke",
		0,
		0,
		0,
		1,
		1,
		nullptr,
		nullptr,
		nullptr,
		nullptr);
	if (!expect(window != nullptr, "CreateWindow should return a shim window handle")) {
		return 1;
	}
	if (!expect(g_dispatch_count == 1
			&& g_seen_window == window
			&& g_seen_message == WM_CREATE
			&& g_seen_wparam == 0
			&& g_seen_lparam == 0,
			"CreateWindow should synchronously dispatch WM_CREATE to the registered WndProc")) {
		return 1;
	}
	g_dispatch_count = 0;
	g_seen_message = 0;
	g_seen_message_time = 0;

	POINT point = {17, 29};
	if (!expect(WasmWin32Input::QueueMessage(window, WM_USER + 7, 0x55, 0x66, 12345, &point),
			"QueueMessage should enqueue smoke input")) {
		return 1;
	}

	// Keep this smoke focused on the message pump without retaining init/update.
	alignas(Win32GameEngine) unsigned char engine_storage[sizeof(Win32GameEngine)] = {};
	auto *engine = reinterpret_cast<Win32GameEngine *>(engine_storage);
	engine->Win32GameEngine::serviceWindowsOS();

	if (!expect(g_dispatch_count == 1, "serviceWindowsOS should dispatch exactly one queued message")) {
		return 1;
	}
	if (!expect(g_seen_window == window
			&& g_seen_message == WM_USER + 7
			&& g_seen_wparam == 0x55
			&& g_seen_lparam == 0x66,
			"serviceWindowsOS should dispatch the queued Win32 message fields")) {
		return 1;
	}
	if (!expect(g_seen_message_time == 12345,
			"serviceWindowsOS should expose MSG::time through TheMessageTime while dispatching")) {
		return 1;
	}
	if (!expect(TheMessageTime == 0, "serviceWindowsOS should clear TheMessageTime after dispatch")) {
		return 1;
	}

	MSG message = {};
	if (!expect(PeekMessage(&message, nullptr, 0, 0, PM_NOREMOVE) == FALSE,
			"serviceWindowsOS should drain the browser-backed Win32 queue")) {
		return 1;
	}

	g_dispatch_count = 0;
	g_seen_message = 0;
	if (!expect(DestroyWindow(window) == TRUE, "DestroyWindow should remove the shim window handle")) {
		return 1;
	}
	if (!expect(g_dispatch_count == 1
			&& g_seen_window == window
			&& g_seen_message == WM_DESTROY
			&& g_seen_wparam == 0
			&& g_seen_lparam == 0,
			"DestroyWindow should synchronously dispatch WM_DESTROY to the registered WndProc")) {
		return 1;
	}
	WasmWin32Input::Reset();

	std::cout << "{\"ok\":true,\"library\":\"Win32GameEngine\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
