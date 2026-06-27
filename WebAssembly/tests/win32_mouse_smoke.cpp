#include <iostream>

#include <windows.h>

#include "Win32Device/GameClient/Win32Mouse.h"

class GlobalData;

HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
Win32Mouse *TheWin32Mouse = nullptr;

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

} // namespace

int main()
{
	SmokeWin32Mouse mouse;
	TheWin32Mouse = &mouse;

	MouseIO event = {};
	mouse.addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(123, 45), 777);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"left button event should be available")) {
		return 1;
	}
	if (!expect(event.leftState == MBS_Down
			&& event.leftFrame == 1
			&& event.pos.x == 123
			&& event.pos.y == 45
			&& event.time == 777,
			"left button event should translate Win32 state and coordinates")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_RBUTTONDBLCLK, 0, make_mouse_lparam(321, 54), 778);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"right double-click event should be available")) {
		return 1;
	}
	if (!expect(event.rightState == MBS_DoubleClick
			&& event.rightFrame == 1
			&& event.pos.x == 321
			&& event.pos.y == 54
			&& event.time == 778,
			"right double-click event should translate Win32 state and coordinates")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_MBUTTONUP, 0, make_mouse_lparam(44, 55), 779);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"middle button event should be available")) {
		return 1;
	}
	if (!expect(event.middleState == MBS_Up
			&& event.middleFrame == 1
			&& event.pos.x == 44
			&& event.pos.y == 55
			&& event.time == 779,
			"middle button event should translate Win32 state and coordinates")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_MOUSEMOVE, 0, make_mouse_lparam(640, 480), 780);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"mouse move event should be available")) {
		return 1;
	}
	if (!expect(event.leftState == MBS_Up
			&& event.rightState == MBS_Up
			&& event.middleState == MBS_Up
			&& event.pos.x == 640
			&& event.pos.y == 480
			&& event.time == 780,
			"mouse move event should translate coordinates without button state")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_MOUSEWHEEL, MAKELPARAM(0, 240), make_mouse_lparam(12, 34), 781);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"mouse wheel event should be available")) {
		return 1;
	}
	if (!expect(event.wheelPos == 240
			&& event.pos.x == 12
			&& event.pos.y == 34
			&& event.time == 781,
			"mouse wheel event should translate wheel delta and client coordinates")) {
		return 1;
	}

	event = {};
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_NONE,
			"empty Win32Mouse buffer should report no event")) {
		return 1;
	}

	TheWin32Mouse = nullptr;
	std::cout << "{\"ok\":true,\"library\":\"Win32Mouse\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
