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
#include "Common/FunctionLexicon.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/NameKeyGenerator.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/Display.h"
#include "GameClient/GUICallbacks.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/GameWindowTransitions.h"
#include "GameClient/Keyboard.h"
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
extern "C" Int cnc_port_main_menu_dont_allow_transitions(void);
extern "C" Int cnc_port_main_menu_button_pushed(void);
extern "C" Int cnc_port_main_menu_campaign_selected(void);
extern "C" Int cnc_port_main_menu_last_selected_msg(void);
extern "C" Int cnc_port_main_menu_last_selected_control_id(void);
extern "C" Int cnc_port_main_menu_selected_count(void);
extern "C" Int cnc_port_main_menu_last_selected_branch(void);
extern "C" Int cnc_port_main_menu_last_button_pushed(void);
extern "C" Int cnc_port_main_menu_last_dont_allow_transitions(void);
extern "C" Int cnc_port_main_menu_last_campaign_selected(void);
extern "C" Int cnc_port_main_menu_button_single_player_key(void);
extern "C" Int cnc_port_main_menu_button_usa_key(void);
extern "C" Int cnc_port_main_menu_button_easy_key(void);
extern "C" Int cnc_port_main_menu_button_single_player_window_id(void);
extern "C" Int cnc_port_main_menu_button_usa_window_id(void);
extern "C" Int cnc_port_main_menu_button_easy_window_id(void);
extern "C" Int cnc_port_main_menu_init_entry_count(void);
extern "C" Int cnc_port_main_menu_init_complete_count(void);
extern "C" Int cnc_port_main_menu_last_init_main_menu_id(void);
extern "C" Int cnc_port_main_menu_last_init_single_player_id(void);
extern "C" Int cnc_port_main_menu_last_init_usa_id(void);
extern "C" Int cnc_port_main_menu_last_init_easy_id(void);
extern "C" Int cnc_port_main_menu_last_init_parent_window_id(void);
extern "C" Int cnc_port_main_menu_last_init_single_player_window_id(void);
extern "C" Int cnc_port_main_menu_last_init_usa_window_id(void);
extern "C" Int cnc_port_main_menu_last_init_easy_window_id(void);
extern "C" Int cnc_port_window_layout_load_count(void);
extern "C" Int cnc_port_window_layout_last_load_had_init(void);
extern "C" Int cnc_port_window_layout_last_load_had_update(void);
extern "C" Int cnc_port_window_layout_last_load_had_shutdown(void);
extern "C" const char *cnc_port_window_layout_last_load_filename(void);
extern "C" const char *cnc_port_window_layout_last_load_init_name(void);
extern "C" const char *cnc_port_window_layout_last_load_update_name(void);
extern "C" const char *cnc_port_window_layout_last_load_shutdown_name(void);
extern "C" Int cnc_port_window_layout_run_init_count(void);
extern "C" Int cnc_port_window_layout_last_run_init_had_init(void);
extern "C" const char *cnc_port_window_layout_last_run_init_filename(void);
extern "C" Int cnc_port_shell_push_count(void);
extern "C" Int cnc_port_shell_do_push_count(void);
extern "C" Int cnc_port_shell_do_push_run_init_count(void);
extern "C" Int cnc_port_shell_last_do_push_had_init(void);
extern "C" const char *cnc_port_shell_last_push_name(void);
extern "C" const char *cnc_port_shell_last_do_push_name(void);
extern void W3DMainMenuInit(WindowLayout *layout, void *userData);

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

const char *system_func_name(GameWinSystemFunc system)
{
	if (system == NULL) {
		return "null";
	}
	if (system == GameWinDefaultSystem) {
		return "GameWinDefaultSystem";
	}
	if (system == PassSelectedButtonsToParentSystem) {
		return "PassSelectedButtonsToParentSystem";
	}
	if (system == PassMessagesToParentSystem) {
		return "PassMessagesToParentSystem";
	}
	if (system == MainMenuSystem) {
		return "MainMenuSystem";
	}
	return "unknown";
}

void append_window_identity_json(std::string &json, GameWindow *window)
{
	if (window == NULL) {
		json += "{\"found\":false}";
		return;
	}

	WinInstanceData *inst_data = window->winGetInstanceData();
	const std::string decorated_name =
		inst_data != NULL ? inst_data->m_decoratedNameString.str() : std::string();
	json += "{\"found\":true";
	json += ",\"id\":" + std::to_string(window->winGetWindowId());
	json += ",\"decoratedName\":\"" + json_escape(decorated_name) + "\"";
	json += ",\"systemFunc\":\"";
	json += system_func_name(window->winGetSystemFunc());
	json += "\"";
	json += ",\"hidden\":";
	json += window->winIsHidden() ? "true" : "false";
	json += "}";
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
	json += ",\"systemFunc\":\"";
	json += system_func_name(window->winGetSystemFunc());
	json += "\"";
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
	json += ",\"owner\":";
	append_window_identity_json(json, inst_data != NULL ? inst_data->getOwner() : NULL);
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
	json += ",\"keyboard\":{";
	json += "\"ready\":";
	json += TheKeyboard != NULL ? "true" : "false";
	json += ",\"pendingDInputKeys\":";
	json += std::to_string(cnc_port_dinput_queued_key_count());
	if (TheKeyboard != NULL) {
		KeyboardIO *first_key = TheKeyboard->getFirstKey();
		int event_count = 0;
		while (first_key != NULL && event_count < 256 && first_key[event_count].key != KEY_NONE) {
			++event_count;
		}
		json += ",\"eventCount\":" + std::to_string(event_count);
		json += ",\"modifiers\":" + std::to_string(TheKeyboard->getModifierFlags());
		if (event_count > 0) {
			json += ",\"firstKey\":" + std::to_string(static_cast<int>(first_key[0].key));
			json += ",\"firstState\":" + std::to_string(static_cast<int>(first_key[0].state));
			json += ",\"firstSequence\":" + std::to_string(first_key[0].sequence);
		} else {
			json += ",\"firstKey\":null,\"firstState\":null,\"firstSequence\":null";
		}
	} else {
		json += ",\"eventCount\":0,\"modifiers\":null,"
			"\"firstKey\":null,\"firstState\":null,\"firstSequence\":null";
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

	json += ",\"transition\":{";
	json += "\"ready\":";
	json += TheTransitionHandler != NULL ? "true" : "false";
	json += ",\"finished\":";
	json += (TheTransitionHandler == NULL || TheTransitionHandler->isFinished()) ? "true" : "false";
	if (TheTransitionHandler != NULL) {
		json += ",\"currentGroup\":\"";
		json += json_escape(TheTransitionHandler->getCurrentGroupName().str());
		json += "\",\"pendingGroup\":\"";
		json += json_escape(TheTransitionHandler->getPendingGroupName().str());
		json += "\",\"drawGroup\":\"";
		json += json_escape(TheTransitionHandler->getDrawGroupName().str());
		json += "\",\"secondaryDrawGroup\":\"";
		json += json_escape(TheTransitionHandler->getSecondaryDrawGroupName().str());
		json += "\"";
	}
	json += "}";

	NameKeyType w3d_main_menu_init_key = NAMEKEY_INVALID;
	WindowLayoutInitFunc w3d_main_menu_init_any = NULL;
	WindowLayoutInitFunc w3d_main_menu_init_device = NULL;
	if (TheFunctionLexicon != NULL && TheNameKeyGenerator != NULL) {
		w3d_main_menu_init_key =
			TheNameKeyGenerator->nameToKey(AsciiString("W3DMainMenuInit"));
		w3d_main_menu_init_any =
			TheFunctionLexicon->winLayoutInitFunc(w3d_main_menu_init_key);
		w3d_main_menu_init_device =
			TheFunctionLexicon->winLayoutInitFunc(
				w3d_main_menu_init_key,
				FunctionLexicon::TABLE_WIN_LAYOUT_DEVICEINIT);
	}
	json += ",\"functionLexicon\":{";
	json += "\"ready\":";
	json += TheFunctionLexicon != NULL ? "true" : "false";
	json += ",\"w3dMainMenuInitKey\":" + std::to_string(static_cast<Int>(w3d_main_menu_init_key));
	json += ",\"w3dMainMenuInitAny\":";
	json += w3d_main_menu_init_any != NULL ? "true" : "false";
	json += ",\"w3dMainMenuInitDevice\":";
	json += w3d_main_menu_init_device != NULL ? "true" : "false";
	json += ",\"w3dMainMenuInitAnyIsReal\":";
	json += w3d_main_menu_init_any == W3DMainMenuInit ? "true" : "false";
	json += ",\"w3dMainMenuInitDeviceIsReal\":";
	json += w3d_main_menu_init_device == W3DMainMenuInit ? "true" : "false";
	json += "}";

	json += ",\"layoutDebug\":{";
	json += "\"loadCount\":" + std::to_string(cnc_port_window_layout_load_count());
	json += ",\"lastLoad\":{";
	json += "\"filename\":\"";
	json += json_escape(cnc_port_window_layout_last_load_filename() != NULL ?
		cnc_port_window_layout_last_load_filename() : "");
	json += "\",\"initName\":\"";
	json += json_escape(cnc_port_window_layout_last_load_init_name() != NULL ?
		cnc_port_window_layout_last_load_init_name() : "");
	json += "\",\"updateName\":\"";
	json += json_escape(cnc_port_window_layout_last_load_update_name() != NULL ?
		cnc_port_window_layout_last_load_update_name() : "");
	json += "\",\"shutdownName\":\"";
	json += json_escape(cnc_port_window_layout_last_load_shutdown_name() != NULL ?
		cnc_port_window_layout_last_load_shutdown_name() : "");
	json += "\",\"hadInit\":";
	json += cnc_port_window_layout_last_load_had_init() != 0 ? "true" : "false";
	json += ",\"hadUpdate\":";
	json += cnc_port_window_layout_last_load_had_update() != 0 ? "true" : "false";
	json += ",\"hadShutdown\":";
	json += cnc_port_window_layout_last_load_had_shutdown() != 0 ? "true" : "false";
	json += "},\"runInit\":{";
	json += "\"count\":" + std::to_string(cnc_port_window_layout_run_init_count());
	json += ",\"lastFilename\":\"";
	json += json_escape(cnc_port_window_layout_last_run_init_filename() != NULL ?
		cnc_port_window_layout_last_run_init_filename() : "");
	json += "\",\"lastHadInit\":";
	json += cnc_port_window_layout_last_run_init_had_init() != 0 ? "true" : "false";
	json += "},\"shell\":{";
	json += "\"pushCount\":" + std::to_string(cnc_port_shell_push_count());
	json += ",\"doPushCount\":" + std::to_string(cnc_port_shell_do_push_count());
	json += ",\"doPushRunInitCount\":" + std::to_string(cnc_port_shell_do_push_run_init_count());
	json += ",\"lastDoPushHadInit\":";
	json += cnc_port_shell_last_do_push_had_init() != 0 ? "true" : "false";
	json += ",\"lastPushName\":\"";
	json += json_escape(cnc_port_shell_last_push_name() != NULL ?
		cnc_port_shell_last_push_name() : "");
	json += "\",\"lastDoPushName\":\"";
	json += json_escape(cnc_port_shell_last_do_push_name() != NULL ?
		cnc_port_shell_last_do_push_name() : "");
	json += "\"}}";

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
		json += ",\"topHasInit\":";
		json += top->getInitFunc() != NULL ? "true" : "false";
		json += ",\"topInitIsW3DMainMenuInit\":";
		json += top->getInitFunc() == W3DMainMenuInit ? "true" : "false";
		json += ",\"topHasUpdate\":";
		json += top->getUpdateFunc() != NULL ? "true" : "false";
		json += ",\"topHasShutdown\":";
		json += top->getShutdownFunc() != NULL ? "true" : "false";
	} else {
		json += ",\"topFilename\":null,\"topHidden\":null,\"topWindowCount\":0,\"topIsMainMenu\":false,"
			"\"topHasInit\":false,\"topInitIsW3DMainMenuInit\":false,"
			"\"topHasUpdate\":false,\"topHasShutdown\":false";
	}
	json += "}";

	json += ",\"mainMenu\":{";
	json += "\"queried\":";
	json += (TheShell != NULL && top != NULL) ? "true" : "false";
	json += ",\"debug\":{";
	json += "\"dontAllowTransitions\":" + std::to_string(cnc_port_main_menu_dont_allow_transitions());
	json += ",\"buttonPushed\":" + std::to_string(cnc_port_main_menu_button_pushed());
	json += ",\"campaignSelected\":" + std::to_string(cnc_port_main_menu_campaign_selected());
	json += ",\"selectedCount\":" + std::to_string(cnc_port_main_menu_selected_count());
	json += ",\"lastSelectedMsg\":" + std::to_string(cnc_port_main_menu_last_selected_msg());
	json += ",\"lastSelectedControlId\":" + std::to_string(cnc_port_main_menu_last_selected_control_id());
	json += ",\"lastSelectedBranch\":" + std::to_string(cnc_port_main_menu_last_selected_branch());
	json += ",\"lastButtonPushed\":" + std::to_string(cnc_port_main_menu_last_button_pushed());
	json += ",\"lastDontAllowTransitions\":" + std::to_string(cnc_port_main_menu_last_dont_allow_transitions());
	json += ",\"lastCampaignSelected\":" + std::to_string(cnc_port_main_menu_last_campaign_selected());
	json += ",\"buttonSinglePlayerKey\":" + std::to_string(cnc_port_main_menu_button_single_player_key());
	json += ",\"buttonUSAKey\":" + std::to_string(cnc_port_main_menu_button_usa_key());
	json += ",\"buttonEasyKey\":" + std::to_string(cnc_port_main_menu_button_easy_key());
	json += ",\"buttonSinglePlayerWindowId\":" + std::to_string(cnc_port_main_menu_button_single_player_window_id());
	json += ",\"buttonUSAWindowId\":" + std::to_string(cnc_port_main_menu_button_usa_window_id());
	json += ",\"buttonEasyWindowId\":" + std::to_string(cnc_port_main_menu_button_easy_window_id());
	json += ",\"initEntryCount\":" + std::to_string(cnc_port_main_menu_init_entry_count());
	json += ",\"initCompleteCount\":" + std::to_string(cnc_port_main_menu_init_complete_count());
	json += ",\"lastInitMainMenuId\":" + std::to_string(cnc_port_main_menu_last_init_main_menu_id());
	json += ",\"lastInitSinglePlayerId\":" + std::to_string(cnc_port_main_menu_last_init_single_player_id());
	json += ",\"lastInitUSAId\":" + std::to_string(cnc_port_main_menu_last_init_usa_id());
	json += ",\"lastInitEasyId\":" + std::to_string(cnc_port_main_menu_last_init_easy_id());
	json += ",\"lastInitParentWindowId\":" + std::to_string(cnc_port_main_menu_last_init_parent_window_id());
	json += ",\"lastInitSinglePlayerWindowId\":" + std::to_string(cnc_port_main_menu_last_init_single_player_window_id());
	json += ",\"lastInitUSAWindowId\":" + std::to_string(cnc_port_main_menu_last_init_usa_window_id());
	json += ",\"lastInitEasyWindowId\":" + std::to_string(cnc_port_main_menu_last_init_easy_window_id());
	json += "}";
	append_window_probe(json, "mainMenuParent", "MainMenu.wnd:MainMenuParent");
	append_window_probe(json, "mapBorderSinglePlayer", "MainMenu.wnd:MapBorder");
	append_window_probe(json, "earthMapSinglePlayer", "MainMenu.wnd:EarthMap");
	append_window_probe(json, "mapBorderMain", "MainMenu.wnd:MapBorder2");
	append_window_probe(json, "mapBorderDifficulty", "MainMenu.wnd:MapBorder4");
	append_window_probe(json, "earthMapDifficulty", "MainMenu.wnd:EarthMap4");
	append_window_probe(json, "staticTextSelectDifficulty", "MainMenu.wnd:StaticTextSelectDifficulty");
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
	append_window_under_probe_center(json, "underButtonUSACenter", "MainMenu.wnd:ButtonUSA");
	append_window_under_probe_center(json, "underButtonEasyCenter", "MainMenu.wnd:ButtonEasy");
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
