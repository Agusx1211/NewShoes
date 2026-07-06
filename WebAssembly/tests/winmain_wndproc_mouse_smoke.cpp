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
#include "Win32Device/GameClient/Win32Mouse.h"
#include "WinMain.h"

extern LRESULT CALLBACK WndProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam);
extern "C" void cnc_port_win32_service_windows_os_message_pump();

HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
Bool ApplicationIsWindowed = false;
Win32Mouse *TheWin32Mouse = nullptr;
DWORD TheMessageTime = 0;
const Char *g_strFile = "data\\Generals.str";
const Char *g_csfFile = "data\\%s\\Generals.csf";
SubsystemInterfaceList *TheSubsystemList = nullptr;
GameEngine *TheGameEngine = nullptr;
GameLogic *TheGameLogic = nullptr;

namespace {
int g_resetD3DCalls = 0;
bool g_lastResetD3DActive = false;
} // namespace

void Reset_D3D_Device(bool active)
{
	++g_resetD3DCalls;
	g_lastResetD3DActive = active;
}

namespace {
class SmokeWin32Mouse : public Win32Mouse
{
public:
	using Win32Mouse::getMouseEvent;

	bool isLostFocus() const { return m_lostFocus; }
	MouseCursor currentWin32Cursor() const { return m_currentWin32Cursor; }
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

	cnc_port_win32_service_windows_os_message_pump();
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

	if (!expect(mouse.currentWin32Cursor() == Mouse::NONE, "Win32Mouse should start without a Win32 cursor set")) {
		return 1;
	}
	if (!pump_one(ApplicationHWnd, WM_SETCURSOR, reinterpret_cast<WPARAM>(ApplicationHWnd), 0, 6998)) {
		return 1;
	}
	if (!expect(mouse.currentWin32Cursor() == Mouse::ARROW,
			"original WndProc should restore the current Win32 cursor on WM_SETCURSOR")) {
		return 1;
	}

	if (!expect(!mouse.isLostFocus(), "Win32Mouse should start focused")) {
		return 1;
	}
	if (!pump_one(ApplicationHWnd, WM_KILLFOCUS, 0, 0, 6999)) {
		return 1;
	}
	if (!expect(mouse.isLostFocus(), "original WndProc should mark Win32Mouse lost-focus on WM_KILLFOCUS")) {
		return 1;
	}
	if (!pump_one(ApplicationHWnd, WM_SETFOCUS, 0, 0, 7000)) {
		return 1;
	}
	if (!expect(!mouse.isLostFocus(), "original WndProc should clear Win32Mouse lost-focus on WM_SETFOCUS")) {
		return 1;
	}

	if (!pump_one(ApplicationHWnd, WM_ACTIVATEAPP, TRUE, 0, 7000)) {
		return 1;
	}
	if (!expect(g_resetD3DCalls == 1 && g_lastResetD3DActive,
			"original WndProc should notify the D3D reset hook on WM_ACTIVATEAPP activation")) {
		return 1;
	}
	if (!pump_one(ApplicationHWnd, WM_ACTIVATEAPP, FALSE, 0, 7000)) {
		return 1;
	}
	if (!expect(g_resetD3DCalls == 2 && !g_lastResetD3DActive,
			"original WndProc should notify the D3D reset hook on WM_ACTIVATEAPP deactivation")) {
		return 1;
	}

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
