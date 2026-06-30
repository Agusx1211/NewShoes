#include <cstdlib>
#include <cstdio>

#include <emscripten/emscripten.h>
#include <mmsystem.h>
#include <windows.h>

#include "Common/GameEngine.h"
#include "Win32Device/Common/Win32GameEngine.h"

class LANAPI;

extern DWORD TheMessageTime;
LANAPI *TheLAN __attribute__((weak)) = nullptr;

namespace {

[[noreturn]] void abort_unentered_game_engine_method()
{
	std::abort();
}

} // namespace

// Browser construction is now real Win32GameEngine.cpp over a focused
// GameEngine lifetime. Full original GameEngine.cpp ownership remains gated by
// the original-lifetime smoke until init/destructor singleton ownership is
// ready in cnc-port.
GameEngine::GameEngine()
{
	timeBeginPeriod(1);
	m_maxFPS = 0;
	m_quitting = FALSE;
	m_isActive = FALSE;
}

GameEngine::~GameEngine()
{
	timeEndPeriod(1);
}

void GameEngine::init() { abort_unentered_game_engine_method(); }
void GameEngine::init(int, char **) { abort_unentered_game_engine_method(); }
void GameEngine::reset() { abort_unentered_game_engine_method(); }
void GameEngine::update() { abort_unentered_game_engine_method(); }
void GameEngine::execute() { abort_unentered_game_engine_method(); }
void GameEngine::setFramesPerSecondLimit(Int fps) { m_maxFPS = fps; }
Int GameEngine::getFramesPerSecondLimit() { return m_maxFPS; }
Bool GameEngine::isMultiplayerSession() { abort_unentered_game_engine_method(); }
FileSystem *GameEngine::createFileSystem() { abort_unentered_game_engine_method(); }
MessageStream *GameEngine::createMessageStream() { abort_unentered_game_engine_method(); }

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

	Win32GameEngine *engine = new Win32GameEngine();
	const bool constructed = engine != nullptr;
	const UINT mode_after_constructor_contract = GetErrorMode();
	const bool initial_inactive = constructed && engine->isActive() == FALSE;
	const bool initial_not_quitting = constructed && engine->getQuitting() == FALSE;
	const bool initial_fps_limit_zero = constructed && engine->getFramesPerSecondLimit() == 0;
	const bool initial_engine_state =
		initial_inactive &&
		initial_not_quitting &&
		initial_fps_limit_zero;
	if (constructed) {
		TheGameEngine = engine;
		engine->setIsActive(TRUE);
		engine->setQuitting(TRUE);
		engine->setFramesPerSecondLimit(45);
	}
	const bool global_engine_owned = constructed && TheGameEngine == engine;
	const bool inherited_state_round_tripped =
		constructed &&
		engine->isActive() == TRUE &&
		engine->getQuitting() == TRUE &&
		engine->getFramesPerSecondLimit() == 45;

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
		engine->serviceWindowsOS();
	}
	const unsigned int queue_after_service = WasmWin32Input::message_queue_count;

	const UINT mode_before_destructor = GetErrorMode();
	delete engine;
	TheGameEngine = nullptr;
	const UINT mode_after_destructor = GetErrorMode();
	const bool global_engine_cleared = TheGameEngine == nullptr;

	SetErrorMode(previous_error_mode);
	const UINT mode_after_manual_restore = GetErrorMode();

	const bool destroyed = window_ok && DestroyWindow(window) == TRUE;
	WasmWin32Input::Reset();

	const bool ok =
		constructed &&
		initial_engine_state &&
		global_engine_owned &&
		inherited_state_round_tripped &&
		register_ok &&
		window_ok &&
		queued &&
		mode_before_constructor_contract == kProbeInitialErrorMode &&
		mode_after_constructor_contract == kProbeConstructorErrorMode &&
		mode_before_destructor == kProbeConstructorErrorMode &&
		mode_after_destructor == kProbeInitialErrorMode &&
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
		global_engine_cleared;

	std::snprintf(buffer, sizeof(buffer),
		"{\"ok\":%s,"
		"\"source\":\"GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp\","
		"\"originalHeader\":\"GeneralsMD/Code/GameEngineDevice/Include/Win32Device/Common/Win32GameEngine.h\","
		"\"service\":\"Win32GameEngine::serviceWindowsOS\","
		"\"serviceHelper\":\"cnc_port_win32_service_windows_os_message_pump\","
		"\"constructorBoundary\":\"browser-owned focused GameEngine lifetime constructs original Win32GameEngine\","
		"\"destructorBoundary\":\"focused browser GameEngine lifetime; full original GameEngine.cpp destructor remains gated by win32-gameengine-original-lifetime-smoke\","
		"\"nextRequired\":\"originalGameEngineInitBeforeCreateAudioManager\","
		"\"registerWindowClass\":%s,"
		"\"windowCreated\":%s,"
		"\"constructed\":%s,"
		"\"destructed\":%s,"
		"\"constructionSkipped\":false,"
		"\"destructorSkipped\":false,"
		"\"gameEngineLifetimeOwner\":\"focused-browser-owner\","
		"\"fullOriginalGameEngineCppLinked\":false,"
		"\"globalTheGameEngineOwned\":%s,"
		"\"globalTheGameEngineCleared\":%s,"
		"\"initialState\":{\"inactive\":%s,\"notQuitting\":%s,\"fpsLimitZero\":%s},"
		"\"roundTripState\":{\"active\":%s,\"quitting\":%s,\"fpsLimit\":45},"
		"\"errorMode\":{\"previous\":%u,\"beforeConstructorContract\":%u,"
		"\"constructorPrevious\":%u,\"afterConstructorContract\":%u,"
		"\"beforeDestructor\":%u,\"afterDestructor\":%u,"
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
		json_bool(mode_after_destructor == kProbeInitialErrorMode),
		json_bool(global_engine_owned),
		json_bool(global_engine_cleared),
		json_bool(initial_inactive),
		json_bool(initial_not_quitting),
		json_bool(initial_fps_limit_zero),
		json_bool(inherited_state_round_tripped),
		json_bool(inherited_state_round_tripped),
		previous_error_mode,
		mode_before_constructor_contract,
		mode_before_constructor_contract,
		mode_after_constructor_contract,
		mode_before_destructor,
		mode_after_destructor,
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
