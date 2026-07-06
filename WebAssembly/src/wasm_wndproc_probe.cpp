#include "PreRTS.h"

#include "Common/GameEngine.h"
#include "Common/GameMemory.h"
#include "GameClient/GameClient.h"
#include "GameClient/IMEManager.h"
#include "GameClient/Mouse.h"
#include "GameLogic/GameLogic.h"
#include "GameNetwork/LANAPICallbacks.h"
#include "Win32Device/GameClient/Win32Mouse.h"
#include "WinMain.h"
#include "wasm_browser_mouse.h"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

extern LRESULT CALLBACK WndProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam);
extern "C" void cnc_port_win32_service_windows_os_message_pump();
extern HWND ApplicationHWnd;
HINSTANCE ApplicationHInstance = NULL;
Bool ApplicationIsWindowed = TRUE;
extern Keyboard *TheKeyboard;
extern IMEManagerInterface *TheIMEManager;
extern Mouse *TheMouse;
#ifndef CNC_PORT_LINKS_REAL_WNDPROC_SINGLETONS
IMEManagerInterface *TheIMEManager __attribute__((weak)) = NULL;
Mouse *TheMouse __attribute__((weak)) = NULL;
#endif
Win32Mouse *TheWin32Mouse = NULL;
DWORD TheMessageTime = 0;

extern GameEngine *TheGameEngine;
#ifndef CNC_PORT_LINKS_REAL_WNDPROC_SINGLETONS
GameEngine *TheGameEngine __attribute__((weak)) = nullptr;
#endif

// Constructed lazily: Mouse::Mouse() assigns AsciiString members, which
// allocate through TheDynamicMemoryAllocator. A namespace-scope static would
// run before initMemoryManager() and write through the null allocator,
// corrupting arbitrary heap addresses.
BrowserWin32Mouse &browser_mouse()
{
	static BrowserWin32Mouse *instance = nullptr;
	if (instance == nullptr) {
		if (!isMemoryManagerOfficiallyInited()) {
			initMemoryManager();
		}
		instance = new BrowserWin32Mouse;
	}
	return *instance;
}

namespace {
constexpr const char ORIGINAL_WNDPROC_WINDOW_CLASS[] = "CncPortOriginalWndProcWindow";

bool g_original_wndproc_ready = false;
bool g_original_wndproc_register_ok = false;
bool g_original_wndproc_window_ok = false;
unsigned int g_original_wndproc_pump_calls = 0;
unsigned int g_original_wndproc_messages_pumped = 0;
unsigned int g_original_wndproc_last_pumped = 0;
unsigned int g_original_wndproc_mouse_events = 0;
unsigned int g_original_wndproc_last_probe_drained = 0;
int g_reset_d3d_calls = 0;
bool g_last_reset_d3d_active = false;
MouseIO g_last_mouse_event = {};
bool g_last_mouse_event_available = false;
std::string g_original_wndproc_json;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

const char *mouse_button_state_name(MouseButtonState state)
{
	switch (state) {
		case MBS_Up:
			return "up";
		case MBS_Down:
			return "down";
		case MBS_DoubleClick:
			return "doubleClick";
	}
	return "unknown";
}

bool ensure_original_wndproc_input_window(int width, int height)
{
	if (g_original_wndproc_ready) {
		TheWin32Mouse = &browser_mouse();
		return true;
	}

	ApplicationIsWindowed = TRUE;

	WNDCLASS window_class = {};
	window_class.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;
	window_class.lpfnWndProc = WndProc;
	window_class.lpszClassName = ORIGINAL_WNDPROC_WINDOW_CLASS;
	g_original_wndproc_register_ok = RegisterClass(&window_class) != 0;

	if (g_original_wndproc_register_ok) {
		const int window_width = width > 0 ? width : 800;
		const int window_height = height > 0 ? height : 600;
		ApplicationHWnd = CreateWindow(
			window_class.lpszClassName,
			"cnc-port",
			0,
			0,
			0,
			window_width,
			window_height,
			nullptr,
			nullptr,
			ApplicationHInstance,
			nullptr);
	}

	g_original_wndproc_window_ok = ApplicationHWnd != nullptr;
	g_original_wndproc_ready = g_original_wndproc_register_ok && g_original_wndproc_window_ok;
	if (g_original_wndproc_ready) {
		TheWin32Mouse = &browser_mouse();
	}
	return g_original_wndproc_ready;
}

void service_original_wndproc_messages()
{
	if (!g_original_wndproc_ready) {
		return;
	}

	const unsigned int before_count = WasmWin32Input::message_queue_count;
	cnc_port_win32_service_windows_os_message_pump();
	const unsigned int after_count = WasmWin32Input::message_queue_count;
	g_original_wndproc_last_pumped = before_count >= after_count ? before_count - after_count : 0;
	g_original_wndproc_messages_pumped += g_original_wndproc_last_pumped;
	++g_original_wndproc_pump_calls;
}

void drain_mouse_events()
{
	g_original_wndproc_last_probe_drained = 0;

	MouseIO event = {};
	while (browser_mouse().getMouseEvent(&event, FALSE) == MOUSE_OK) {
		g_last_mouse_event = event;
		g_last_mouse_event_available = true;
		++g_original_wndproc_last_probe_drained;
		++g_original_wndproc_mouse_events;
	}
}

std::string build_mouse_event_json()
{
	if (!g_last_mouse_event_available) {
		return "null";
	}

	char buffer[700];
	std::snprintf(buffer, sizeof(buffer),
		"{\"pos\":{\"x\":%d,\"y\":%d},\"time\":%u,\"wheelPos\":%d,"
		"\"left\":{\"state\":\"%s\",\"frame\":%d},"
		"\"middle\":{\"state\":\"%s\",\"frame\":%d},"
		"\"right\":{\"state\":\"%s\",\"frame\":%d}}",
		g_last_mouse_event.pos.x,
		g_last_mouse_event.pos.y,
		g_last_mouse_event.time,
		g_last_mouse_event.wheelPos,
		mouse_button_state_name(g_last_mouse_event.leftState),
		g_last_mouse_event.leftFrame,
		mouse_button_state_name(g_last_mouse_event.middleState),
		g_last_mouse_event.middleFrame,
		mouse_button_state_name(g_last_mouse_event.rightState),
		g_last_mouse_event.rightFrame);
	return buffer;
}

const char *write_original_wndproc_json()
{
	const std::string mouse_event_json = build_mouse_event_json();
	char buffer[2200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"GeneralsMD/Code/Main/WinMain.cpp::WndProc\","
		"\"ready\":%s,\"registered\":%s,\"windowCreated\":%s,"
		"\"window\":%lu,\"messageQueue\":{\"count\":%u,\"overflowed\":%s},"
		"\"pump\":{\"calls\":%u,\"lastPumped\":%u,\"messagesPumped\":%u},"
		"\"mouse\":{\"attached\":%s,\"lostFocus\":%s,\"visible\":%s,"
		"\"currentCursor\":%d,\"browserCursorSet\":%s,"
		"\"events\":%u,\"lastProbeDrained\":%u,\"lastEvent\":%s},"
		"\"keyboard\":{\"quitPosts\":%u,\"lastQuitExitCode\":%d},"
		"\"resetD3D\":{\"calls\":%d,\"lastActive\":%s}}",
		bool_json(g_original_wndproc_ready),
		bool_json(g_original_wndproc_register_ok),
		bool_json(g_original_wndproc_window_ok),
		static_cast<unsigned long>(reinterpret_cast<std::uintptr_t>(ApplicationHWnd)),
		WasmWin32Input::message_queue_count,
		bool_json(WasmWin32Input::message_queue_overflowed),
		g_original_wndproc_pump_calls,
		g_original_wndproc_last_pumped,
		g_original_wndproc_messages_pumped,
		bool_json(TheWin32Mouse == &browser_mouse()),
		bool_json(browser_mouse().isLostFocus()),
		bool_json(browser_mouse().isVisibleForProbe()),
		static_cast<int>(browser_mouse().currentWin32Cursor()),
		bool_json(WasmWin32Input::current_cursor != nullptr),
		g_original_wndproc_mouse_events,
		g_original_wndproc_last_probe_drained,
		mouse_event_json.c_str(),
		WasmWin32Input::quit_message_posts,
		WasmWin32Input::last_quit_exit_code,
		g_reset_d3d_calls,
		bool_json(g_last_reset_d3d_active));
	g_original_wndproc_json = buffer;
	return g_original_wndproc_json.c_str();
}
} // namespace

void Reset_D3D_Device(bool active)
{
	++g_reset_d3d_calls;
	g_last_reset_d3d_active = active;
}

void cnc_port_service_original_wndproc_messages()
{
	service_original_wndproc_messages();
}

void cnc_port_prepare_original_wndproc_mouse_stream(int width, int height)
{
	if (!g_original_wndproc_ready) {
		ensure_original_wndproc_input_window(width, height);
	}
	if (g_original_wndproc_ready && TheWin32Mouse == &browser_mouse()) {
		browser_mouse().prepareStreamProbe(width, height);
	}
}

Bool cnc_port_original_wndproc_mouse_stream_attached()
{
	return TheWin32Mouse == &browser_mouse();
}

UnsignedInt cnc_port_original_wndproc_mouse_stream_input_frame()
{
	return browser_mouse().inputFrameForProbe();
}

Int cnc_port_original_wndproc_mouse_stream_events_this_frame()
{
	return browser_mouse().eventsThisFrameForProbe();
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_init_original_wndproc_input(int width, int height)
{
	ensure_original_wndproc_input_window(width, height);
	return write_original_wndproc_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_pump_original_wndproc_input()
{
	service_original_wndproc_messages();
	return write_original_wndproc_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_wndproc_input()
{
	drain_mouse_events();
	return write_original_wndproc_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_cursor_visibility(int visible)
{
	ensure_original_wndproc_input_window(0, 0);
	if (g_original_wndproc_ready) {
		browser_mouse().ensureArrowCursorResource();
		browser_mouse().setVisibility(visible ? TRUE : FALSE);
		browser_mouse().setCursor(Mouse::ARROW);
	}
	return write_original_wndproc_json();
}
}
