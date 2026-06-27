#include <iostream>

#include <windows.h>

#include "Common/GameAudio.h"
#include "Common/GameEngine.h"
#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "GameClient/GameClient.h"
#include "GameClient/IMEManager.h"
#include "GameClient/Mouse.h"
#include "GameLogic/GameLogic.h"
#include "Win32Device/Common/Win32GameEngine.h"
#include "Win32Device/GameClient/Win32Mouse.h"
#include "WinMain.h"

extern LRESULT CALLBACK WndProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam);
extern Bool ApplicationIsWindowed;
extern DWORD TheMessageTime;

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
GameEngine *TheGameEngine = nullptr;
GameLogic *TheGameLogic = nullptr;

void Reset_D3D_Device(bool)
{
}

namespace {
class SmokeWin32Mouse : public Win32Mouse
{
public:
	using Win32Mouse::getMouseEvent;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

LPARAM make_mouse_lparam(int x, int y)
{
	return MAKELPARAM(x, y);
}

bool pump_one(HWND window, UINT message, WPARAM wparam, LPARAM lparam, DWORD time)
{
	POINT point = {static_cast<LONG>(LOWORD(lparam)), static_cast<LONG>(HIWORD(lparam))};
	if (!WasmWin32Input::QueueMessage(window, message, wparam, lparam, time, &point)) {
		std::cerr << "QueueMessage failed\n";
		return false;
	}

	alignas(Win32GameEngine) unsigned char engine_storage[sizeof(Win32GameEngine)] = {};
	auto *engine = reinterpret_cast<Win32GameEngine *>(engine_storage);
	engine->Win32GameEngine::serviceWindowsOS();
	return true;
}
} // namespace

int main()
{
	WasmWin32Input::Reset();
	ApplicationIsWindowed = TRUE;

	WNDCLASS window_class = {};
	window_class.lpfnWndProc = WndProc;
	window_class.lpszClassName = "SmokeOriginalWndProcWindow";
	if (!expect(RegisterClass(&window_class) != 0, "RegisterClass should accept original WndProc")) {
		return 1;
	}

	ApplicationHWnd = CreateWindow(
		window_class.lpszClassName,
		"wndproc-smoke",
		0,
		0,
		0,
		800,
		600,
		nullptr,
		nullptr,
		nullptr,
		nullptr);
	if (!expect(ApplicationHWnd != nullptr, "CreateWindow should return an application window handle")) {
		return 1;
	}

	SmokeWin32Mouse mouse;
	TheWin32Mouse = &mouse;

	if (!pump_one(ApplicationHWnd, WM_LBUTTONDOWN, 0, make_mouse_lparam(123, 45), 7001)) {
		return 1;
	}

	MouseIO event = {};
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"original WndProc should feed left-button messages into Win32Mouse")) {
		return 1;
	}
	if (!expect(event.leftState == MBS_Down
			&& event.leftFrame == 1
			&& event.pos.x == 123
			&& event.pos.y == 45
			&& event.time == 7001,
			"original WndProc should preserve left-button coordinates and TheMessageTime")) {
		return 1;
	}
	if (!expect(TheMessageTime == 0, "message pump should clear TheMessageTime after WndProc dispatch")) {
		return 1;
	}

	if (!pump_one(ApplicationHWnd, WM_MOUSEMOVE, 0, make_mouse_lparam(321, 54), 7002)) {
		return 1;
	}

	event = {};
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"original WndProc should feed mouse-move messages into Win32Mouse")) {
		return 1;
	}
	if (!expect(event.pos.x == 321 && event.pos.y == 54 && event.time == 7002,
			"original WndProc should preserve mouse-move coordinates and TheMessageTime")) {
		return 1;
	}

	if (!pump_one(ApplicationHWnd, WM_MOUSEWHEEL, MAKELPARAM(0, 240), make_mouse_lparam(12, 34), 7003)) {
		return 1;
	}

	event = {};
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"original WndProc should feed mouse-wheel messages into Win32Mouse")) {
		return 1;
	}
	if (!expect(event.wheelPos == 240
			&& event.pos.x == 12
			&& event.pos.y == 34
			&& event.time == 7003,
			"original WndProc should preserve wheel delta, coordinates, and TheMessageTime")) {
		return 1;
	}

	TheWin32Mouse = nullptr;
	HWND window = ApplicationHWnd;
	ApplicationHWnd = nullptr;
	DestroyWindow(window);
	WasmWin32Input::Reset();

	std::cout << "{\"ok\":true,\"library\":\"WinMain WndProc\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
