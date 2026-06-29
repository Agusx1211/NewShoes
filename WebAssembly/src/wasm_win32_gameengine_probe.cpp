#include <cstdio>

#include <emscripten/emscripten.h>
#include <windows.h>

extern DWORD TheMessageTime;
extern "C" void cnc_port_win32_service_windows_os_message_pump();

namespace {

constexpr UINT kProbeMessage = WM_USER + 0x42;
constexpr DWORD kProbeMessageTime = 24680;
constexpr UINT kProbeInitialErrorMode = 0x0040;
constexpr UINT kProbeConstructorErrorMode = SEM_FAILCRITICALERRORS;

int g_dispatch_count = 0;
int g_create_messages = 0;
int g_destroy_messages = 0;
int g_user_messages = 0;
UINT g_seen_message = 0;
WPARAM g_seen_wparam = 0;
LPARAM g_seen_lparam = 0;
DWORD g_seen_message_time = 0;

const char *json_bool(bool value)
{
	return value ? "true" : "false";
}

void reset_probe_window_state()
{
	g_dispatch_count = 0;
	g_create_messages = 0;
	g_destroy_messages = 0;
	g_user_messages = 0;
	g_seen_message = 0;
	g_seen_wparam = 0;
	g_seen_lparam = 0;
	g_seen_message_time = 0;
}

LRESULT CALLBACK probe_window_proc(HWND, UINT message, WPARAM wparam, LPARAM lparam)
{
	++g_dispatch_count;
	if (message == WM_CREATE) {
		++g_create_messages;
	} else if (message == WM_DESTROY) {
		++g_destroy_messages;
	} else if (message == kProbeMessage) {
		++g_user_messages;
		g_seen_message = message;
		g_seen_wparam = wparam;
		g_seen_lparam = lparam;
		g_seen_message_time = TheMessageTime;
	}
	return 0;
}

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_win32_gameengine()
{
	static char buffer[4096];

	reset_probe_window_state();
	WasmWin32Input::Reset();

	const UINT previous_error_mode = SetErrorMode(kProbeInitialErrorMode);
	const UINT mode_before_constructor_contract = GetErrorMode();

	WNDCLASS window_class = {};
	window_class.lpfnWndProc = probe_window_proc;
	window_class.lpszClassName = "CncPortWin32GameEngineProbeWindow";
	const bool register_ok = RegisterClass(&window_class) != 0;
	HWND window = register_ok
		? CreateWindow(
			window_class.lpszClassName,
			"win32-gameengine-probe",
			0,
			0,
			0,
			32,
			32,
			nullptr,
			nullptr,
			nullptr,
			nullptr)
		: nullptr;
	const bool window_ok = window != nullptr;

	POINT point = {9, 11};
	const bool queued = window_ok &&
		WasmWin32Input::QueueMessage(
			window,
			kProbeMessage,
			static_cast<WPARAM>(0x1234),
			static_cast<LPARAM>(0x5678),
			kProbeMessageTime,
			&point);
	const unsigned int queue_before_service = WasmWin32Input::message_queue_count;

	const UINT constructor_previous_mode = SetErrorMode(kProbeConstructorErrorMode);
	const UINT mode_after_constructor_contract = GetErrorMode();

	cnc_port_win32_service_windows_os_message_pump();
	const unsigned int queue_after_service = WasmWin32Input::message_queue_count;

	const UINT mode_before_manual_restore = GetErrorMode();
	SetErrorMode(previous_error_mode);
	const UINT mode_after_manual_restore = GetErrorMode();

	const bool destroyed = window_ok && DestroyWindow(window) == TRUE;
	WasmWin32Input::Reset();

	const bool ok =
		register_ok &&
		window_ok &&
		queued &&
		mode_before_constructor_contract == kProbeInitialErrorMode &&
		constructor_previous_mode == kProbeInitialErrorMode &&
		mode_after_constructor_contract == SEM_FAILCRITICALERRORS &&
		mode_before_manual_restore == SEM_FAILCRITICALERRORS &&
		mode_after_manual_restore == previous_error_mode &&
		queue_before_service == 1 &&
		queue_after_service == 0 &&
		g_create_messages == 1 &&
		g_user_messages == 1 &&
		g_seen_message == kProbeMessage &&
		g_seen_wparam == static_cast<WPARAM>(0x1234) &&
		g_seen_lparam == static_cast<LPARAM>(0x5678) &&
		g_seen_message_time == kProbeMessageTime &&
		destroyed &&
		g_destroy_messages == 1;

	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":%s,"
		"\"source\":\"GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp\","
		"\"originalHeader\":\"GeneralsMD/Code/GameEngineDevice/Include/Win32Device/Common/Win32GameEngine.h\","
		"\"service\":\"Win32GameEngine::serviceWindowsOS\","
		"\"serviceHelper\":\"cnc_port_win32_service_windows_os_message_pump\","
		"\"constructorBoundary\":\"Win32GameEngine construction requires linked GameEngine vtable/typeinfo and owned startup singleton lifetime\","
		"\"destructorBoundary\":\"GameEngine::~GameEngine owns full startup singleton lifetime\","
		"\"nextRequired\":\"ownedGameEngineSingletonLifetime\","
		"\"registerWindowClass\":%s,"
		"\"windowCreated\":%s,"
		"\"constructionSkipped\":true,"
		"\"destructorSkipped\":true,"
		"\"errorMode\":{\"previous\":%u,\"beforeConstructorContract\":%u,"
		"\"constructorPrevious\":%u,\"afterConstructorContract\":%u,"
		"\"beforeManualRestore\":%u,\"afterManualRestore\":%u,"
		"\"constructorMode\":%u},"
		"\"messagePump\":{\"queued\":%s,\"queueBeforeService\":%u,"
		"\"queueAfterService\":%u,\"dispatches\":%d,\"createMessages\":%d,"
		"\"userMessages\":%d,\"destroyMessages\":%d,"
		"\"seenMessage\":%u,\"seenWParam\":%lu,\"seenLParam\":%ld,"
		"\"seenMessageTime\":%lu}}",
		json_bool(ok),
		json_bool(register_ok),
		json_bool(window_ok),
		previous_error_mode,
		mode_before_constructor_contract,
		constructor_previous_mode,
		mode_after_constructor_contract,
		mode_before_manual_restore,
		mode_after_manual_restore,
		static_cast<unsigned int>(SEM_FAILCRITICALERRORS),
		json_bool(queued),
		queue_before_service,
		queue_after_service,
		g_dispatch_count,
		g_create_messages,
		g_user_messages,
		g_destroy_messages,
		g_seen_message,
		static_cast<unsigned long>(g_seen_wparam),
		static_cast<long>(g_seen_lparam),
		static_cast<unsigned long>(g_seen_message_time));
	return buffer;
}
