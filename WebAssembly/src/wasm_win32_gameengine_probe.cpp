#include <cstdlib>
#include <cstdio>

#include <emscripten/emscripten.h>
#include <mmsystem.h>
#include <windows.h>

#include "Common/GameEngine.h"
#include "Win32Device/Common/Win32GameEngine.h"

extern DWORD TheMessageTime;

// GameEngine constructor/destructor/init/execute are the REAL
// GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp linked into
// cnc-port (zh_gameengine_real_lifecycle_runtime). This probe only keeps the
// Win32GameEngine window message pump regression coverage; the engine
// lifecycle itself is driven by cnc_port_real_engine_init().

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

// The real GameEngine destructor tears down the full subsystem list
// (TheGameResultsQueue->endThreads(), TheSubsystemList->shutdownAll(), ...),
// which is only valid after a completed GameEngine::init(). The probe keeps a
// single leaked engine instead of destroying it; real engine teardown belongs
// to the real lifecycle (GameMain) once init()/execute() complete in-browser.
Win32GameEngine *g_probe_engine = nullptr;
bool g_probe_engine_constructed = false;
bool g_initial_inactive = false;
bool g_initial_not_quitting = false;
bool g_initial_fps_limit_zero = false;
bool g_round_trip_ok = false;
UINT g_mode_before_constructor = 0;
UINT g_mode_after_constructor = 0;

void ensure_probe_engine()
{
	if (g_probe_engine != nullptr) {
		return;
	}

	g_mode_before_constructor = GetErrorMode();
	g_probe_engine = new Win32GameEngine();
	g_probe_engine_constructed = g_probe_engine != nullptr;
	g_mode_after_constructor = GetErrorMode();

	g_initial_inactive = g_probe_engine->isActive() == FALSE;
	g_initial_not_quitting = g_probe_engine->getQuitting() == FALSE;
	g_initial_fps_limit_zero = g_probe_engine->getFramesPerSecondLimit() == 0;

	g_probe_engine->setIsActive(TRUE);
	g_probe_engine->setQuitting(TRUE);
	g_probe_engine->setFramesPerSecondLimit(45);
	g_round_trip_ok =
		g_probe_engine->isActive() == TRUE &&
		g_probe_engine->getQuitting() == TRUE &&
		g_probe_engine->getFramesPerSecondLimit() == 45;

	// restore quiescent state; the probe engine stays alive but unowned.
	g_probe_engine->setIsActive(FALSE);
	g_probe_engine->setQuitting(FALSE);
	g_probe_engine->setFramesPerSecondLimit(0);
}

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_win32_gameengine()
{
	static char buffer[4096];

	reset_probe_window_state();
	WasmWin32Input::Reset();

	const UINT previous_error_mode = SetErrorMode(kProbeInitialErrorMode);
	ensure_probe_engine();
	const bool constructed = g_probe_engine_constructed;
	const bool initial_engine_state =
		g_initial_inactive &&
		g_initial_not_quitting &&
		g_initial_fps_limit_zero;

	GameEngine *previous_global_engine = TheGameEngine;
	TheGameEngine = g_probe_engine;
	const bool global_engine_owned = constructed && TheGameEngine == g_probe_engine;

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

	if (constructed) {
		g_probe_engine->serviceWindowsOS();
	}
	const unsigned int queue_after_service = WasmWin32Input::message_queue_count;

	// hand the global back; the real lifecycle owns TheGameEngine.
	TheGameEngine = previous_global_engine;
	const bool global_engine_released = TheGameEngine == previous_global_engine;

	SetErrorMode(previous_error_mode);
	const UINT mode_after_manual_restore = GetErrorMode();

	const bool destroyed = window_ok && DestroyWindow(window) == TRUE;
	WasmWin32Input::Reset();

	const bool ok =
		constructed &&
		initial_engine_state &&
		global_engine_owned &&
		g_round_trip_ok &&
		register_ok &&
		window_ok &&
		queued &&
		g_mode_after_constructor == kProbeConstructorErrorMode &&
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
		g_destroy_messages == 1 &&
		global_engine_released;

	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":%s,"
		"\"source\":\"GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp\","
		"\"originalHeader\":\"GeneralsMD/Code/GameEngineDevice/Include/Win32Device/Common/Win32GameEngine.h\","
		"\"service\":\"Win32GameEngine::serviceWindowsOS\","
		"\"serviceHelper\":\"cnc_port_win32_service_windows_os_message_pump\","
		"\"constructorBoundary\":\"original Win32GameEngine over real GameEngine.cpp constructor\","
		"\"destructorBoundary\":\"real GameEngine.cpp destructor requires completed init(); probe engine stays alive\","
		"\"nextRequired\":\"realEngineInitFrontier\","
		"\"registerWindowClass\":%s,"
		"\"windowCreated\":%s,"
		"\"constructed\":%s,"
		"\"destructed\":false,"
		"\"constructionSkipped\":false,"
		"\"destructorSkipped\":true,"
		"\"gameEngineLifetimeOwner\":\"original-gameengine-cpp\","
		"\"fullOriginalGameEngineCppLinked\":true,"
		"\"globalTheGameEngineOwned\":%s,"
		"\"globalTheGameEngineCleared\":%s,"
		"\"initialState\":{\"inactive\":%s,\"notQuitting\":%s,\"fpsLimitZero\":%s},"
		"\"roundTripState\":{\"active\":%s,\"quitting\":%s,\"fpsLimit\":45},"
		"\"errorMode\":{\"previous\":%u,"
		"\"beforeConstructor\":%u,\"afterConstructor\":%u,"
		"\"afterManualRestore\":%u,"
		"\"constructorMode\":%u},"
		"\"messagePump\":{\"queued\":%s,\"queueBeforeService\":%u,"
		"\"queueAfterService\":%u,\"dispatches\":%d,\"createMessages\":%d,"
		"\"userMessages\":%d,\"destroyMessages\":%d,"
		"\"seenMessage\":%u,\"seenWParam\":%lu,\"seenLParam\":%ld,"
		"\"seenMessageTime\":%lu}}",
		json_bool(ok),
		json_bool(register_ok),
		json_bool(window_ok),
		json_bool(constructed),
		json_bool(global_engine_owned),
		json_bool(global_engine_released),
		json_bool(g_initial_inactive),
		json_bool(g_initial_not_quitting),
		json_bool(g_initial_fps_limit_zero),
		json_bool(g_round_trip_ok),
		json_bool(g_round_trip_ok),
		previous_error_mode,
		g_mode_before_constructor,
		g_mode_after_constructor,
		mode_after_manual_restore,
		static_cast<unsigned int>(kProbeConstructorErrorMode),
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
