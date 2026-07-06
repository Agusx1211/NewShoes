// Focused smoke for the original Win32Mouse cursor-rendering contract.
//
// This target exercises the ORIGINAL Win32Device cursor surface
// (GeneralsMD/Code/GameEngineDevice/Source/Win32Device/GameClient/Win32Mouse.cpp)
// together with the ORIGINAL GameClient Mouse base class
// (GeneralsMD/Code/GameEngine/Source/GameClient/Input/Mouse.cpp) to pin the
// browser-port cursor-rendering decision (engine-drawn vs OS/CSS cursor):
//
//   - Mouse() constructor selects RM_W3D (engine-drawn) when
//     TheGlobalData->m_winCursors is false and RM_WINDOWS (OS cursor) when it
//     is true.  This is the engine-drawn-vs-CSS-cursor decision point.
//   - Win32Mouse::setCursor(NONE) routes to SetCursor(NULL), clearing the
//     browser-backed WasmWin32Input::current_cursor handle that the JS bridge
//     already exports as `cursorSet`.
//   - Win32Mouse::setVisibility(false) re-applies the current cursor through
//     Win32Mouse::setCursor(getMouseCursor()); because m_visible is now false,
//     the OS cursor handle is cleared.  setVisibility(true) restores it.  This
//     is the seam the browser uses to apply `cursor: none` (engine-drawn) vs a
//     real CSS cursor.
//   - The browser Win32 shim preserves SetCapture/GetCapture/ReleaseCapture
//     bookkeeping for future engine paths that ask the OS layer to keep mouse
//     input routed to the game window while dragging.
//   - Win32Mouse::initCursorResources() populates the directional cursor
//     resource table from LoadCursorFromFile() (browser shim returns the path
//     as a non-null HCURSOR), so a subsequent setCursor(ARROW) routes a
//     non-null handle to the browser Win32 cursor shim.
//   - Win32Mouse lost-focus short-circuit: when m_lostFocus is true,
//     setCursor() returns before touching the OS cursor handle, preserving
//     whatever the browser last observed.
//
// This smoke links the same original Win32Mouse translation unit
// (zh_win32_mouse_browser_real) used by the browser WndProc harness; it does NOT touch the
// browser keyboard bridge or win32_keyboard_smoke (owned by another worktree).

#include <iostream>
#include <cstring>
#include <cstdint>

#include <windows.h>

#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "GameClient/Mouse.h"
#include "Win32Device/GameClient/Win32Mouse.h"

HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
class DisplayStringManager;
DisplayStringManager *TheDisplayStringManager = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
Win32Mouse *TheWin32Mouse = nullptr;

// The cursor-resource table is a file-scope global in the original
// Win32Mouse.cpp translation unit; declare it so the smoke can confirm
// initCursorResources() actually populated the ARROW entry the browser shim
// LoadCursorFromFile() returns a non-null handle for.
extern HCURSOR cursorResources[Mouse::NUM_MOUSE_CURSORS][MAX_2D_CURSOR_DIRECTIONS];

namespace {

class SmokeWin32Mouse : public Win32Mouse
{
public:
	using Win32Mouse::Win32Mouse;

	// Expose the protected lost-focus setter path so the smoke can drive the
	// same transition the original WndProc WM_KILLFOCUS branch uses without
	// routing a window message.
	void setLostFocusForProbe(Bool state) { lostFocus(state); }
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << "FAIL: " << message << "\n";
		return false;
	}
	return true;
}

bool exercise_redraw_mode_decision()
{
	bool ok = true;

	{
		GlobalData globalData;
		globalData.m_winCursors = TRUE;
		GlobalData *oldGlobalData = TheWritableGlobalData;
		TheWritableGlobalData = &globalData;

		SmokeWin32Mouse mouse;
		ok = expect(mouse.getRedrawMode() == Mouse::RM_WINDOWS,
			"Mouse() should select RM_WINDOWS (OS cursor) when "
			"TheGlobalData->m_winCursors is true") && ok;
		ok = expect(mouse.getVisibility() == FALSE,
			"Mouse should start invisible until the engine explicitly "
			"shows it") && ok;
		ok = expect(mouse.getMouseCursor() == Mouse::ARROW,
			"Mouse should default to ARROW cursor") && ok;

		TheWritableGlobalData = oldGlobalData;
	}

	{
		GlobalData globalData;
		globalData.m_winCursors = FALSE;
		GlobalData *oldGlobalData = TheWritableGlobalData;
		TheWritableGlobalData = &globalData;

		SmokeWin32Mouse mouse;
		ok = expect(mouse.getRedrawMode() == Mouse::RM_W3D,
			"Mouse() should select RM_W3D (engine-drawn cursor) when "
			"TheGlobalData->m_winCursors is false — the browser-port "
			"engine-drawn cursor contract") && ok;

		TheWritableGlobalData = oldGlobalData;
	}

	return ok;
}

bool exercise_win32_capture_bookkeeping()
{
	bool ok = true;
	WasmWin32Input::Reset();

	HWND first_window = reinterpret_cast<HWND>(static_cast<std::uintptr_t>(0x10000));
	HWND second_window = reinterpret_cast<HWND>(static_cast<std::uintptr_t>(0x10001));

	ok = expect(GetCapture() == nullptr,
		"browser Win32 capture shim should start with no captured window") && ok;
	ok = expect(SetCapture(first_window) == nullptr,
		"SetCapture should return the previous null capture window") && ok;
	ok = expect(GetCapture() == first_window,
		"GetCapture should report the first captured window") && ok;
	ok = expect(SetCapture(second_window) == first_window,
		"SetCapture should return the previous captured window") && ok;
	ok = expect(GetCapture() == second_window,
		"GetCapture should report the replacement captured window") && ok;
	ok = expect(ReleaseCapture() == TRUE,
		"ReleaseCapture should succeed in the browser Win32 shim") && ok;
	ok = expect(GetCapture() == nullptr,
		"ReleaseCapture should clear the captured window") && ok;

	WasmWin32Input::Reset();
	return ok;
}

bool exercise_cursor_handle_lifecycle()
{
	bool ok = true;

	WasmWin32Input::Reset();

	GlobalData globalData;
	globalData.m_winCursors = TRUE;
	GlobalData *oldGlobalData = TheWritableGlobalData;
	TheWritableGlobalData = &globalData;

	SmokeWin32Mouse mouse;

	// Populate the ARROW cursor resource the same way the original engine does
	// at startup: a non-empty texture name plus the default single direction.
	mouse.m_cursorInfo[Mouse::ARROW].textureName = "arrow";
	mouse.m_cursorInfo[Mouse::ARROW].numDirections = 1;

	ok = expect(WasmWin32Input::current_cursor == nullptr,
		"browser Win32 cursor shim should start with no cursor set") && ok;

	mouse.initCursorResources();
	ok = expect(cursorResources[Mouse::ARROW][0] != nullptr,
		"Win32Mouse::initCursorResources should populate the ARROW "
		"resource via LoadCursorFromFile") && ok;

	// setVisibility(true) routes through Win32Mouse::setCursor(getMouseCursor())
	// and, with m_visible now true and cursorResources[ARROW][0] populated,
	// hands a non-null handle to the browser Win32 cursor shim.
	mouse.setVisibility(TRUE);
	ok = expect(WasmWin32Input::current_cursor != nullptr,
		"Win32Mouse::setVisibility(true) should route the loaded ARROW "
		"resource to the browser Win32 cursor shim") && ok;
	ok = expect(mouse.getVisibility() == TRUE,
		"setVisibility(true) should mark the mouse visible") && ok;

	// setCursor(NONE) must clear the OS cursor handle — the engine-drawn /
	// CSS-cursor hiding seam.
	mouse.setCursor(Mouse::NONE);
	ok = expect(WasmWin32Input::current_cursor == nullptr,
		"Win32Mouse::setCursor(NONE) should clear the browser Win32 "
		"cursor handle (cursor: none)") && ok;

	// Restoring ARROW should re-arm the OS cursor handle.
	mouse.setCursor(Mouse::ARROW);
	ok = expect(WasmWin32Input::current_cursor != nullptr,
		"Win32Mouse::setCursor(ARROW) should re-arm the browser Win32 "
		"cursor handle after NONE") && ok;

	// Hiding the mouse should clear the OS cursor handle even though the
	// logical cursor is still ARROW.
	mouse.setVisibility(FALSE);
	ok = expect(WasmWin32Input::current_cursor == nullptr,
		"Win32Mouse::setVisibility(false) should clear the browser Win32 "
		"cursor handle while the logical cursor remains ARROW") && ok;
	ok = expect(mouse.getMouseCursor() == Mouse::ARROW,
		"hiding the mouse should not change the logical cursor") && ok;

	// Showing the mouse again should restore the OS cursor handle.
	mouse.setVisibility(TRUE);
	ok = expect(WasmWin32Input::current_cursor != nullptr,
		"Win32Mouse::setVisibility(true) should restore the browser Win32 "
		"cursor handle") && ok;

	// Lost-focus short-circuit: the original WndProc WM_KILLFOCUS branch sets
	// m_lostFocus, after which setCursor must not touch the OS cursor handle.
	mouse.setLostFocusForProbe(TRUE);
	mouse.setCursor(Mouse::NONE);
	ok = expect(WasmWin32Input::current_cursor != nullptr,
		"Win32Mouse::setCursor should leave the browser Win32 cursor "
		"handle untouched while m_lostFocus is true") && ok;

	// Recovering focus should let setCursor clear the handle again.
	mouse.setLostFocusForProbe(FALSE);
	mouse.setCursor(Mouse::NONE);
	ok = expect(WasmWin32Input::current_cursor == nullptr,
		"Win32Mouse::setCursor(NONE) should clear the browser Win32 "
		"cursor handle once focus is restored") && ok;

	TheWritableGlobalData = oldGlobalData;
	WasmWin32Input::Reset();
	return ok;
}

}  // namespace

int main()
{
	initMemoryManager();
	bool ok = true;
	ok = exercise_redraw_mode_decision() && ok;
	ok = exercise_win32_capture_bookkeeping() && ok;
	ok = exercise_cursor_handle_lifecycle() && ok;
	shutdownMemoryManager();

	if (!ok) {
		std::cerr << "win32-mouse-cursor-smoke: FAILED\n";
		return 1;
	}
	std::cout << "win32-mouse-cursor-smoke: OK\n";
	return 0;
}
