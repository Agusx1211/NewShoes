// cnc-port real engine lifecycle entry.
//
// Drives the ORIGINAL boot path in the browser:
//   WinMain.cpp::CreateGameEngine() -> new Win32GameEngine (real factories)
//   -> GameEngine::init(argc, argv)  (GeneralsMD GameEngine.cpp)
// with a command line of "-noshellmap -win", against the real mounted
// archives. The frontier reported here is computed FROM THE RUN:
// SubsystemInterfaceList::initSubsystem() notes every subsystem start/finish
// through cnc_port_note_subsystem_init(), and every marker is also printed to
// stdout so the harness still sees the trace when init dies inside
// RELEASE_CRASH/_exit() where no JSON can be returned.

#include <emscripten/emscripten.h>

#include <unistd.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include <atlbase.h>
#include <mmsystem.h>
#include <windows.h>

#include "Common/GameEngine.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/NameKeyGenerator.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/Display.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/Mouse.h"
#include "GameClient/Shell.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"

// The original app-level globals GameEngine.cpp expects WinMain.cpp to own.
// WinMain.cpp is only partially compiled for the browser (WndProc +
// CreateGameEngine); the ATL module object lives here.
CComModule _Module;

// TheWebBrowser is normally defined by the COM embedding in
// GameNetwork/WOLBrowser/WebBrowser.cpp, which is a true platform boundary
// (IE IDispatch); every browser TU sees the shim WebBrowser class instead.
class WebBrowser;
WebBrowser *TheWebBrowser = NULL;

extern LRESULT CALLBACK WndProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam);
extern HINSTANCE ApplicationHInstance;
extern HWND ApplicationHWnd;
extern Bool ApplicationIsWindowed;

namespace {

constexpr const char REAL_ENGINE_WINDOW_CLASS[] = "CncPortRealEngineWindow";

struct RealEngineInitState {
	bool attempted = false;
	bool init_returned = false;
	bool quitting_after_init = false;
	bool exception_caught = false;
	std::string exception_text;
	std::string run_directory;
	std::vector<std::string> completed;
	std::string in_flight;
	double elapsed_ms = 0.0;
};

RealEngineInitState g_state;
std::string g_state_json;

std::string json_escape(const std::string &value)
{
	std::string out;
	out.reserve(value.size() + 8);
	for (char c : value) {
		switch (c) {
		case '"': out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n"; break;
		case '\r': out += "\\r"; break;
		case '\t': out += "\\t"; break;
		default:
			if (static_cast<unsigned char>(c) < 0x20) {
				char buf[8];
				std::snprintf(buf, sizeof(buf), "\\u%04x", c);
				out += buf;
			} else {
				out += c;
			}
		}
	}
	return out;
}

const char *build_state_json()
{
	std::string json = "{";
	json += "\"attempted\":";
	json += g_state.attempted ? "true" : "false";
	json += ",\"source\":\"GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp::init\"";
	json += ",\"factory\":\"GeneralsMD/Code/Main/WinMain.cpp::CreateGameEngine\"";
	json += ",\"commandLine\":\"-noshellmap -win\"";
	json += ",\"runDirectory\":\"" + json_escape(g_state.run_directory) + "\"";
	json += ",\"initReturned\":";
	json += g_state.init_returned ? "true" : "false";
	json += ",\"quittingAfterInit\":";
	json += g_state.quitting_after_init ? "true" : "false";
	json += ",\"exceptionCaught\":";
	json += g_state.exception_caught ? "true" : "false";
	json += ",\"exception\":\"" + json_escape(g_state.exception_text) + "\"";
	char elapsed[64];
	std::snprintf(elapsed, sizeof(elapsed), ",\"elapsedMs\":%.1f", g_state.elapsed_ms);
	json += elapsed;
	json += ",\"subsystemsCompleted\":[";
	for (size_t i = 0; i < g_state.completed.size(); ++i) {
		if (i != 0) {
			json += ",";
		}
		json += "\"" + json_escape(g_state.completed[i]) + "\"";
	}
	json += "]";
	json += ",\"subsystemCompletedCount\":" + std::to_string(g_state.completed.size());
	if (g_state.in_flight.empty()) {
		json += ",\"inFlightSubsystem\":null";
	} else {
		json += ",\"inFlightSubsystem\":\"" + json_escape(g_state.in_flight) + "\"";
	}
	json += "}";
	g_state_json = json;
	return g_state_json.c_str();
}

} // namespace

// Called by the real SubsystemInterfaceList::initSubsystem()
// (GameEngine/Source/Common/System/SubsystemInterface.cpp) for every
// subsystem GameEngine::init() brings up. phase 0 = starting (about to run
// sys->init() + its INI loads), phase 1 = completed.
extern "C" void cnc_port_note_subsystem_init(const char *name, int phase)
{
	const char *safe_name = name != nullptr ? name : "(unnamed)";
	if (phase == 0) {
		g_state.in_flight = safe_name;
		std::printf("cnc-port: real-init subsystem-start %s\n", safe_name);
	} else {
		g_state.in_flight.clear();
		g_state.completed.push_back(safe_name);
		std::printf("cnc-port: real-init subsystem-done %s\n", safe_name);
	}
	std::fflush(stdout);
}

namespace {

struct RealEngineFrameState {
	int frames_attempted = 0;
	int frames_completed = 0;
	int stale_movie_break_clears = 0;
	bool exception_caught = false;
	std::string exception_text;
	double last_frame_ms = 0.0;
};

RealEngineFrameState g_frame_state;
std::string g_frame_json;

bool real_engine_input_window_ready()
{
	return ApplicationHWnd != NULL && GetWindowLong(ApplicationHWnd, GWL_WNDPROC) != 0;
}

bool ensure_real_engine_input_window()
{
	ApplicationIsWindowed = TRUE;

	if (real_engine_input_window_ready()) {
		return true;
	}

	WNDCLASS window_class = {};
	window_class.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;
	window_class.lpfnWndProc = WndProc;
	window_class.lpszClassName = REAL_ENGINE_WINDOW_CLASS;
	RegisterClass(&window_class);

	ApplicationHWnd = CreateWindow(
		window_class.lpszClassName,
		"cnc-port-real-init",
		0,
		0,
		0,
		800,
		600,
		NULL,
		NULL,
		ApplicationHInstance,
		NULL);

	return real_engine_input_window_ready();
}

int count_layout_windows(WindowLayout *layout)
{
	int count = 0;
	for (GameWindow *window = layout != NULL ? layout->getFirstWindow() : NULL;
		window != NULL;
		window = window->winGetNextInLayout()) {
		++count;
	}
	return count;
}

GameWindow *find_window_by_name(const char *window_name)
{
	if (TheWindowManager == NULL || TheNameKeyGenerator == NULL || window_name == NULL) {
		return NULL;
	}

	const NameKeyType id = TheNameKeyGenerator->nameToKey(window_name);
	return TheWindowManager->winGetWindowFromId(NULL, static_cast<Int>(id));
}

void append_window_json(std::string &json, GameWindow *window, const char *requested_name)
{
	json += "{\"name\":\"";
	json += json_escape(requested_name != NULL ? requested_name : "");
	json += "\"";

	if (window == NULL) {
		json += ",\"found\":false}";
		return;
	}

	WinInstanceData *inst_data = window->winGetInstanceData();
	Int x = 0;
	Int y = 0;
	Int width = 0;
	Int height = 0;
	window->winGetScreenPosition(&x, &y);
	window->winGetSize(&width, &height);
	const UnsignedInt status = window->winGetStatus();
	const UnsignedInt style = window->winGetStyle();
	const Bool hidden = window->winIsHidden();
	const Bool manager_hidden = TheWindowManager->isHidden(window);
	const Bool enabled = TheWindowManager->isEnabled(window);
	const UnsignedInt state = inst_data != NULL ? inst_data->getState() : 0;
	const std::string decorated_name =
		inst_data != NULL ? inst_data->m_decoratedNameString.str() : std::string();

	json += ",\"found\":true";
	json += ",\"id\":" + std::to_string(window->winGetWindowId());
	json += ",\"decoratedName\":\"" + json_escape(decorated_name) + "\"";
	json += ",\"x\":" + std::to_string(x);
	json += ",\"y\":" + std::to_string(y);
	json += ",\"width\":" + std::to_string(width);
	json += ",\"height\":" + std::to_string(height);
	json += ",\"centerX\":" + std::to_string(x + width / 2);
	json += ",\"centerY\":" + std::to_string(y + height / 2);
	json += ",\"status\":" + std::to_string(status);
	json += ",\"style\":" + std::to_string(style);
	json += ",\"state\":" + std::to_string(state);
	json += ",\"selected\":";
	json += (state & WIN_STATE_SELECTED) != 0 ? "true" : "false";
	json += ",\"hilited\":";
	json += (state & WIN_STATE_HILITED) != 0 ? "true" : "false";
	json += ",\"hidden\":";
	json += hidden ? "true" : "false";
	json += ",\"managerHidden\":";
	json += manager_hidden ? "true" : "false";
	json += ",\"enabled\":";
	json += enabled ? "true" : "false";
	json += ",\"clickable\":";
	json += (!manager_hidden && enabled && (status & WIN_STATUS_NO_INPUT) == 0) ? "true" : "false";
	json += "}";
}

void append_window_probe(std::string &json, const char *field_name, const char *window_name)
{
	json += ",\"";
	json += field_name;
	json += "\":";
	append_window_json(json, find_window_by_name(window_name), window_name);
}

void append_window_ref(std::string &json, const char *field_name, GameWindow *window)
{
	json += ",\"";
	json += field_name;
	json += "\":";
	append_window_json(json, window, NULL);
}

void append_window_under_probe_center(std::string &json, const char *field_name, const char *window_name)
{
	json += ",\"";
	json += field_name;
	json += "\":{";

	GameWindow *probe = find_window_by_name(window_name);
	if (TheWindowManager == NULL || probe == NULL) {
		json += "\"point\":null,\"window\":";
		append_window_json(json, NULL, NULL);
		json += "}";
		return;
	}

	Int x = 0;
	Int y = 0;
	Int width = 0;
	Int height = 0;
	probe->winGetScreenPosition(&x, &y);
	probe->winGetSize(&width, &height);
	const Int center_x = x + width / 2;
	const Int center_y = y + height / 2;
	GameWindow *under = TheWindowManager->getWindowUnderCursor(center_x, center_y, FALSE);

	json += "\"point\":{\"x\":" + std::to_string(center_x);
	json += ",\"y\":" + std::to_string(center_y) + "}";
	json += ",\"expectedId\":" + std::to_string(probe->winGetWindowId());
	json += ",\"window\":";
	append_window_json(json, under, NULL);
	json += "}";
}

void append_input_window_state(std::string &json)
{
	json += ",\"input\":{";
	json += "\"ready\":";
	json += TheWindowManager != NULL ? "true" : "false";
	json += ",\"windowReady\":";
	json += real_engine_input_window_ready() ? "true" : "false";
	if (TheWindowManager != NULL) {
		append_window_ref(json, "focusWindow", TheWindowManager->winGetFocus());
		append_window_ref(json, "captureWindow", TheWindowManager->winGetCapture());
		append_window_ref(json, "grabWindow", TheWindowManager->winGetGrabWindow());
	} else {
		json += ",\"focusWindow\":null,\"captureWindow\":null,\"grabWindow\":null";
	}
	json += ",\"mouse\":{";
	json += "\"ready\":";
	json += TheMouse != NULL ? "true" : "false";
	if (TheMouse != NULL) {
		const MouseIO *mouse = TheMouse->getMouseStatus();
		json += ",\"visible\":";
		json += TheMouse->getVisibility() ? "true" : "false";
		json += ",\"cursor\":" + std::to_string(static_cast<int>(TheMouse->getMouseCursor()));
		if (mouse != NULL) {
			json += ",\"x\":" + std::to_string(mouse->pos.x);
			json += ",\"y\":" + std::to_string(mouse->pos.y);
			json += ",\"leftState\":" + std::to_string(static_cast<int>(mouse->leftState));
			json += ",\"leftEvent\":" + std::to_string(mouse->leftEvent);
			json += ",\"leftFrame\":" + std::to_string(mouse->leftFrame);
			json += ",\"middleState\":" + std::to_string(static_cast<int>(mouse->middleState));
			json += ",\"middleEvent\":" + std::to_string(mouse->middleEvent);
			json += ",\"rightState\":" + std::to_string(static_cast<int>(mouse->rightState));
			json += ",\"rightEvent\":" + std::to_string(mouse->rightEvent);
		}
	} else {
		json += ",\"visible\":null,\"cursor\":null,\"x\":null,\"y\":null,"
			"\"leftState\":null,\"leftEvent\":null,\"leftFrame\":null,"
			"\"middleState\":null,\"middleEvent\":null,"
			"\"rightState\":null,\"rightEvent\":null";
	}
	json += "}";
	json += "}";
}

void append_real_engine_client_state(std::string &json)
{
	json += ",\"clientState\":{";
	json += "\"globalDataReady\":";
	json += TheGlobalData != NULL ? "true" : "false";
	json += ",\"displayReady\":";
	json += TheDisplay != NULL ? "true" : "false";
	json += ",\"shellReady\":";
	json += TheShell != NULL ? "true" : "false";
	json += ",\"windowManagerReady\":";
	json += TheWindowManager != NULL ? "true" : "false";

	json += ",\"gates\":{";
	if (TheGlobalData != NULL) {
		json += "\"playIntro\":";
		json += TheGlobalData->m_playIntro ? "true" : "false";
		json += ",\"afterIntro\":";
		json += TheGlobalData->m_afterIntro ? "true" : "false";
		json += ",\"playSizzle\":";
		json += TheGlobalData->m_playSizzle ? "true" : "false";
		json += ",\"allowExitOutOfMovies\":";
		json += TheGlobalData->m_allowExitOutOfMovies ? "true" : "false";
		json += ",\"breakTheMovie\":";
		json += TheGlobalData->m_breakTheMovie ? "true" : "false";
	} else {
		json += "\"playIntro\":null,\"afterIntro\":null,\"playSizzle\":null,"
			"\"allowExitOutOfMovies\":null,\"breakTheMovie\":null";
	}
	json += "}";

	json += ",\"display\":{";
	if (TheDisplay != NULL) {
		json += "\"width\":" + std::to_string(TheDisplay->getWidth());
		json += ",\"height\":" + std::to_string(TheDisplay->getHeight());
		json += ",\"moviePlaying\":";
		json += TheDisplay->isMoviePlaying() ? "true" : "false";
	} else {
		json += "\"width\":null,\"height\":null,\"moviePlaying\":null";
	}
	json += "}";

	json += ",\"shell\":{";
	WindowLayout *top = TheShell != NULL ? TheShell->top() : NULL;
	if (TheShell != NULL) {
		json += "\"active\":";
		json += TheShell->isShellActive() ? "true" : "false";
		json += ",\"screenCount\":" + std::to_string(TheShell->getScreenCount());
	} else {
		json += "\"active\":null,\"screenCount\":null";
	}
	if (top != NULL) {
		const std::string filename = top->getFilename().str();
		json += ",\"topFilename\":\"" + json_escape(filename) + "\"";
		json += ",\"topHidden\":";
		json += top->isHidden() ? "true" : "false";
		json += ",\"topWindowCount\":" + std::to_string(count_layout_windows(top));
		json += ",\"topIsMainMenu\":";
		json += filename.find("MainMenu.wnd") != std::string::npos ? "true" : "false";
	} else {
		json += ",\"topFilename\":null,\"topHidden\":null,\"topWindowCount\":0,\"topIsMainMenu\":false";
	}
	json += "}";

	json += ",\"mainMenu\":{";
	json += "\"queried\":";
	json += (TheShell != NULL && top != NULL) ? "true" : "false";
	append_window_probe(json, "mainMenuParent", "MainMenu.wnd:MainMenuParent");
	append_window_probe(json, "mapBorderSinglePlayer", "MainMenu.wnd:MapBorder");
	append_window_probe(json, "mapBorderMain", "MainMenu.wnd:MapBorder2");
	append_window_probe(json, "mapBorderDifficulty", "MainMenu.wnd:MapBorder4");
	append_window_probe(json, "buttonSinglePlayer", "MainMenu.wnd:ButtonSinglePlayer");
	append_window_probe(json, "buttonSingleBack", "MainMenu.wnd:ButtonSingleBack");
	append_window_probe(json, "buttonUSA", "MainMenu.wnd:ButtonUSA");
	append_window_probe(json, "buttonGLA", "MainMenu.wnd:ButtonGLA");
	append_window_probe(json, "buttonChina", "MainMenu.wnd:ButtonChina");
	append_window_probe(json, "buttonChallenge", "MainMenu.wnd:ButtonChallenge");
	append_window_probe(json, "buttonSkirmish", "MainMenu.wnd:ButtonSkirmish");
	append_window_probe(json, "buttonLoadReplay", "MainMenu.wnd:ButtonLoadReplay");
	append_window_probe(json, "buttonOptions", "MainMenu.wnd:ButtonOptions");
	append_window_probe(json, "buttonCredits", "MainMenu.wnd:ButtonCredits");
	append_window_probe(json, "buttonExit", "MainMenu.wnd:ButtonExit");
	append_window_probe(json, "buttonEasy", "MainMenu.wnd:ButtonEasy");
	append_window_probe(json, "buttonMedium", "MainMenu.wnd:ButtonMedium");
	append_window_probe(json, "buttonHard", "MainMenu.wnd:ButtonHard");
	append_window_probe(json, "buttonDiffBack", "MainMenu.wnd:ButtonDiffBack");
	append_window_under_probe_center(json, "underButtonSinglePlayerCenter", "MainMenu.wnd:ButtonSinglePlayer");
	json += "}";

	append_input_window_state(json);

	json += "}";
}

void clear_stale_movie_break_for_visible_main_menu()
{
	if (TheWritableGlobalData == NULL || TheDisplay == NULL || TheShell == NULL) {
		return;
	}
	if (!TheWritableGlobalData->m_breakTheMovie || TheDisplay->isMoviePlaying()) {
		return;
	}
	WindowLayout *top = TheShell->top();
	if (top == NULL || top->isHidden()) {
		return;
	}
	const std::string filename = top->getFilename().str();
	if (filename.find("MainMenu.wnd") == std::string::npos) {
		return;
	}
	TheWritableGlobalData->m_breakTheMovie = FALSE;
	++g_frame_state.stale_movie_break_clears;
}

} // namespace

// One iteration of the original GameEngine::execute() loop: calls the real
// (virtual) TheGameEngine->update(), i.e. Win32GameEngine::update ->
// GameEngine::update (radar/audio/client/messages/logic) + serviceWindowsOS.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frame(int frame_count)
{
	if (frame_count < 1) {
		frame_count = 1;
	}
	if (g_state.attempted && g_state.init_returned && TheGameEngine != NULL) {
		for (int frame = 0; frame < frame_count; ++frame) {
			++g_frame_state.frames_attempted;
			const double frame_started_at = emscripten_get_now();
			try {
				clear_stale_movie_break_for_visible_main_menu();
				TheGameEngine->update();
				clear_stale_movie_break_for_visible_main_menu();
				++g_frame_state.frames_completed;
			} catch (const char *message) {
				g_frame_state.exception_caught = true;
				g_frame_state.exception_text = message != nullptr ? message : "(const char* exception)";
				break;
			} catch (...) {
				g_frame_state.exception_caught = true;
				g_frame_state.exception_text = "unhandled C++ exception escaping GameEngine::update";
				break;
			}
			g_frame_state.last_frame_ms = emscripten_get_now() - frame_started_at;
		}
	}

	std::string json = "{";
	json += "\"initReturned\":";
	json += (g_state.attempted && g_state.init_returned) ? "true" : "false";
	json += ",\"source\":\"GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp::update via Win32GameEngine::update\"";
	json += ",\"framesAttempted\":" + std::to_string(g_frame_state.frames_attempted);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	json += ",\"staleMovieBreakClears\":" + std::to_string(g_frame_state.stale_movie_break_clears);
	json += ",\"quitting\":";
	json += (TheGameEngine != NULL && TheGameEngine->getQuitting() != FALSE) ? "true" : "false";
	json += ",\"exceptionCaught\":";
	json += g_frame_state.exception_caught ? "true" : "false";
	json += ",\"exception\":\"" + json_escape(g_frame_state.exception_text) + "\"";
	char elapsed[64];
	std::snprintf(elapsed, sizeof(elapsed), ",\"lastFrameMs\":%.1f", g_frame_state.last_frame_ms);
	json += elapsed;
	append_real_engine_client_state(json);
	json += "}";
	g_frame_json = json;
	std::printf("cnc-port: real-frame attempted=%d completed=%d exception=%s\n",
		g_frame_state.frames_attempted,
		g_frame_state.frames_completed,
		g_frame_state.exception_caught ? g_frame_state.exception_text.c_str() : "(none)");
	std::fflush(stdout);
	return g_frame_json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frontier()
{
	return build_state_json();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_init(const char *run_directory)
{
	if (g_state.attempted) {
		return build_state_json();
	}
	g_state.attempted = true;

	if (run_directory != nullptr && run_directory[0] != '\0') {
		if (chdir(run_directory) == 0) {
			g_state.run_directory = run_directory;
		} else {
			g_state.run_directory = std::string("chdir-failed:") + run_directory;
		}
	}

	// WinMain.cpp order: memory manager first, then GameMain -> CreateGameEngine.
	if (TheMemoryPoolFactory == NULL) {
		initMemoryManager();
	}
	ensure_real_engine_input_window();

	static const char *argv_storage[] = {"CnCGeneralsZH", "-noshellmap", "-win"};
	const int argc = 3;
	char **argv = const_cast<char **>(argv_storage);

	std::printf("cnc-port: real-init begin dir=%s argv=-noshellmap -win\n",
		g_state.run_directory.c_str());
	std::fflush(stdout);

	const double started_at = emscripten_get_now();
	try {
		TheGameEngine = CreateGameEngine();
		// browser tab has focus; WinMain mirrors focus state into the engine.
		TheGameEngine->setIsActive(TRUE);
		TheGameEngine->init(argc, argv);
		g_state.init_returned = true;
		g_state.quitting_after_init = TheGameEngine->getQuitting() != FALSE;
	} catch (const char *message) {
		g_state.exception_caught = true;
		g_state.exception_text = message != nullptr ? message : "(const char* exception)";
	} catch (...) {
		g_state.exception_caught = true;
		g_state.exception_text = "unhandled C++ exception escaping GameEngine::init";
	}
	g_state.elapsed_ms = emscripten_get_now() - started_at;

	std::printf("cnc-port: real-init end returned=%d quitting=%d completed=%zu inflight=%s\n",
		g_state.init_returned ? 1 : 0,
		g_state.quitting_after_init ? 1 : 0,
		g_state.completed.size(),
		g_state.in_flight.empty() ? "(none)" : g_state.in_flight.c_str());
	std::fflush(stdout);

	return build_state_json();
}
