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

#include <cctype>
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
#include "Common/Player.h"
#include "Common/PlayerList.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/ControlBar.h"
#include "GameClient/Display.h"
#include "GameClient/Drawable.h"
#include "GameClient/GUICallbacks.h"
#include "GameClient/GameClient.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/GameWindowTransitions.h"
#include "GameClient/InGameUI.h"
#include "GameClient/Keyboard.h"
#include "GameClient/Mouse.h"
#include "GameClient/Shell.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/ScriptEngine.h"
#include "GameLogic/Scripts.h"
#include "GameLogic/SidesList.h"

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
extern "C" Int cnc_port_main_menu_start_game(void);
extern "C" Int cnc_port_main_menu_is_shutting_down(void);
extern "C" Int cnc_port_main_menu_launch_challenge_menu(void);
extern "C" Int cnc_port_main_menu_show_side(void);
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
extern "C" Int cnc_port_main_menu_check_cd_count(void);
extern "C" Int cnc_port_main_menu_last_cd_present(void);
extern "C" Int cnc_port_main_menu_last_cd_difficulty(void);
extern "C" Int cnc_port_main_menu_prepare_campaign_count(void);
extern "C" Int cnc_port_main_menu_last_prepare_difficulty(void);
extern "C" Int cnc_port_main_menu_setup_game_start_count(void);
extern "C" Int cnc_port_main_menu_last_setup_difficulty(void);
extern "C" const Char *cnc_port_main_menu_last_setup_map(void);
extern "C" const Char *cnc_port_main_menu_last_pending_file(void);
extern "C" Int cnc_port_main_menu_do_game_start_count(void);
extern "C" Int cnc_port_main_menu_last_new_game_mode(void);
extern "C" Int cnc_port_main_menu_last_new_game_difficulty(void);
extern "C" Int cnc_port_main_menu_last_new_game_rank_points(void);
extern "C" Int cnc_port_main_menu_shutdown_complete_count(void);
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

static std::string g_last_engine_update_target;
static std::string g_engine_update_breakpoint;
static std::string g_last_game_logic_step;
static std::string g_game_logic_breakpoint;
static unsigned int g_frame_texture_apply_count = 0;
static unsigned int g_frame_missing_texture_apply_count = 0;
static std::string g_frame_first_missing_texture_name;
static std::string g_frame_first_missing_texture_path;
static std::string g_frame_last_missing_texture_name;
static std::string g_frame_last_missing_texture_path;
static std::vector<std::string> g_frame_missing_texture_samples;

extern "C" void cnc_port_note_engine_update_target(const char *name)
{
	g_last_engine_update_target = name != nullptr ? name : "";
	if (!g_engine_update_breakpoint.empty()
		&& g_last_engine_update_target == g_engine_update_breakpoint) {
		throw "cnc_port_engine_update_target_breakpoint";
	}
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_last_update_target()
{
	return g_last_engine_update_target.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE void cnc_port_real_engine_set_engine_update_breakpoint(
	const char *name)
{
	g_engine_update_breakpoint = name != nullptr ? name : "";
}

extern "C" void cnc_port_note_game_logic_step(const char *name)
{
	g_last_game_logic_step = name != nullptr ? name : "";
	if (!g_game_logic_breakpoint.empty()
		&& g_last_game_logic_step == g_game_logic_breakpoint) {
		throw "cnc_port_game_logic_step_breakpoint";
	}
}

extern "C" EMSCRIPTEN_KEEPALIVE void cnc_port_real_engine_set_game_logic_breakpoint(
	const char *name)
{
	g_game_logic_breakpoint = name != nullptr ? name : "";
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_last_game_logic_step()
{
	return g_last_game_logic_step.c_str();
}

extern "C" void cnc_port_note_texture_apply(
	unsigned int,
	const char *name,
	const char *full_path,
	int missing)
{
	++g_frame_texture_apply_count;
	if (!missing) {
		return;
	}

	++g_frame_missing_texture_apply_count;
	const std::string texture_name = name != nullptr ? name : "";
	const std::string texture_path = full_path != nullptr ? full_path : "";
	if (g_frame_first_missing_texture_name.empty() &&
		g_frame_first_missing_texture_path.empty()) {
		g_frame_first_missing_texture_name = texture_name;
		g_frame_first_missing_texture_path = texture_path;
	}
	g_frame_last_missing_texture_name = texture_name;
	g_frame_last_missing_texture_path = texture_path;
	const std::string sample = texture_path.empty() ? texture_name : texture_path;
	if (!sample.empty() && g_frame_missing_texture_samples.size() < 16) {
		bool already_recorded = false;
		for (std::vector<std::string>::const_iterator it =
				g_frame_missing_texture_samples.begin();
			it != g_frame_missing_texture_samples.end();
			++it) {
			if (*it == sample) {
				already_recorded = true;
				break;
			}
		}
		if (!already_recorded) {
			g_frame_missing_texture_samples.push_back(sample);
		}
	}
}

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

void reset_frame_texture_diagnostics()
{
	g_frame_texture_apply_count = 0;
	g_frame_missing_texture_apply_count = 0;
	g_frame_first_missing_texture_name.clear();
	g_frame_first_missing_texture_path.clear();
	g_frame_last_missing_texture_name.clear();
	g_frame_last_missing_texture_path.clear();
	g_frame_missing_texture_samples.clear();
}

void append_frame_texture_diagnostics(std::string &json)
{
	json += ",\"textureDiagnostics\":{";
	json += "\"applies\":" + std::to_string(g_frame_texture_apply_count);
	json += ",\"missingApplies\":" + std::to_string(g_frame_missing_texture_apply_count);
	json += ",\"firstMissingName\":\"" + json_escape(g_frame_first_missing_texture_name) + "\"";
	json += ",\"firstMissingPath\":\"" + json_escape(g_frame_first_missing_texture_path) + "\"";
	json += ",\"lastMissingName\":\"" + json_escape(g_frame_last_missing_texture_name) + "\"";
	json += ",\"lastMissingPath\":\"" + json_escape(g_frame_last_missing_texture_path) + "\"";
	json += ",\"samples\":[";
	for (std::size_t i = 0; i < g_frame_missing_texture_samples.size(); ++i) {
		if (i != 0) {
			json += ",";
		}
		json += "\"" + json_escape(g_frame_missing_texture_samples[i]) + "\"";
	}
	json += "]}";
}

std::string uppercase_ascii(std::string value)
{
	for (std::string::iterator it = value.begin(); it != value.end(); ++it) {
		*it = static_cast<char>(
			std::toupper(static_cast<unsigned char>(*it)));
	}
	return value;
}

bool contains_any_upper_token(
	const std::string &value,
	const char *const tokens[])
{
	const std::string upper = uppercase_ascii(value);
	for (const char *const *token = tokens; *token != NULL; ++token) {
		if (upper.find(*token) != std::string::npos) {
			return true;
		}
	}
	return false;
}

bool contains_script_catalog_token(const std::string &value)
{
	static const char *const tokens[] = {
		"CINE",
		"INTRO",
		"LAUNCHPAD",
		"PT2",
		"TRANSPORT",
		"LETTERBOX",
		"INPUT",
		"CAMERA",
		"FADE",
		"BLACK",
		"DONE",
		NULL
	};

	return contains_any_upper_token(value, tokens);
}

bool contains_script_priority_token(const std::string &value)
{
	static const char *const tokens[] = {
		"INTRO_DONE",
		"RETURN",
		"INSIDE BASE",
		"LAUNCHPAD",
		"PT2",
		"LETTERBOX",
		NULL
	};

	return contains_any_upper_token(value, tokens);
}

const char *script_parameter_type_name(Parameter::ParameterType type)
{
	switch (type) {
	case Parameter::INT: return "INT";
	case Parameter::REAL: return "REAL";
	case Parameter::SCRIPT: return "SCRIPT";
	case Parameter::TEAM: return "TEAM";
	case Parameter::COUNTER: return "COUNTER";
	case Parameter::FLAG: return "FLAG";
	case Parameter::COMPARISON: return "COMPARISON";
	case Parameter::WAYPOINT: return "WAYPOINT";
	case Parameter::BOOLEAN: return "BOOLEAN";
	case Parameter::TRIGGER_AREA: return "TRIGGER_AREA";
	case Parameter::TEXT_STRING: return "TEXT_STRING";
	case Parameter::SIDE: return "SIDE";
	case Parameter::SOUND: return "SOUND";
	case Parameter::SCRIPT_SUBROUTINE: return "SCRIPT_SUBROUTINE";
	case Parameter::UNIT: return "UNIT";
	case Parameter::OBJECT_TYPE: return "OBJECT_TYPE";
	case Parameter::COORD3D: return "COORD3D";
	case Parameter::ANGLE: return "ANGLE";
	case Parameter::TEAM_STATE: return "TEAM_STATE";
	case Parameter::RELATION: return "RELATION";
	case Parameter::AI_MOOD: return "AI_MOOD";
	case Parameter::DIALOG: return "DIALOG";
	case Parameter::MUSIC: return "MUSIC";
	case Parameter::MOVIE: return "MOVIE";
	case Parameter::WAYPOINT_PATH: return "WAYPOINT_PATH";
	case Parameter::LOCALIZED_TEXT: return "LOCALIZED_TEXT";
	case Parameter::BRIDGE: return "BRIDGE";
	case Parameter::KIND_OF_PARAM: return "KIND_OF_PARAM";
	case Parameter::ATTACK_PRIORITY_SET: return "ATTACK_PRIORITY_SET";
	case Parameter::RADAR_EVENT_TYPE: return "RADAR_EVENT_TYPE";
	case Parameter::SPECIAL_POWER: return "SPECIAL_POWER";
	case Parameter::SCIENCE: return "SCIENCE";
	case Parameter::UPGRADE: return "UPGRADE";
	case Parameter::COMMANDBUTTON_ABILITY: return "COMMANDBUTTON_ABILITY";
	case Parameter::BOUNDARY: return "BOUNDARY";
	case Parameter::BUILDABLE: return "BUILDABLE";
	case Parameter::SURFACES_ALLOWED: return "SURFACES_ALLOWED";
	case Parameter::SHAKE_INTENSITY: return "SHAKE_INTENSITY";
	case Parameter::COMMAND_BUTTON: return "COMMAND_BUTTON";
	case Parameter::FONT_NAME: return "FONT_NAME";
	case Parameter::OBJECT_STATUS: return "OBJECT_STATUS";
	case Parameter::COMMANDBUTTON_ALL_ABILITIES: return "COMMANDBUTTON_ALL_ABILITIES";
	case Parameter::SKIRMISH_WAYPOINT_PATH: return "SKIRMISH_WAYPOINT_PATH";
	case Parameter::COLOR: return "COLOR";
	case Parameter::EMOTICON: return "EMOTICON";
	case Parameter::OBJECT_PANEL_FLAG: return "OBJECT_PANEL_FLAG";
	case Parameter::FACTION_NAME: return "FACTION_NAME";
	case Parameter::OBJECT_TYPE_LIST: return "OBJECT_TYPE_LIST";
	case Parameter::REVEALNAME: return "REVEALNAME";
	case Parameter::SCIENCE_AVAILABILITY: return "SCIENCE_AVAILABILITY";
	case Parameter::LEFT_OR_RIGHT: return "LEFT_OR_RIGHT";
	case Parameter::PERCENT: return "PERCENT";
	case Parameter::NUM_ITEMS: return "NUM_ITEMS";
	default: return "UNKNOWN";
	}
}

bool parameter_has_script_catalog_token(const Parameter *parameter)
{
	return parameter != NULL
		&& contains_script_catalog_token(parameter->getString().str());
}

bool parameter_has_script_priority_token(const Parameter *parameter)
{
	return parameter != NULL
		&& contains_script_priority_token(parameter->getString().str());
}

bool cinematic_action_type(ScriptAction::ScriptActionType type)
{
	switch (type) {
	case ScriptAction::MOVE_CAMERA_TO:
	case ScriptAction::ZOOM_CAMERA:
	case ScriptAction::CAMERA_FADE_ADD:
	case ScriptAction::CAMERA_FADE_SUBTRACT:
	case ScriptAction::CAMERA_FADE_MULTIPLY:
	case ScriptAction::CAMERA_FADE_SATURATE:
	case ScriptAction::PITCH_CAMERA:
	case ScriptAction::CAMERA_FOLLOW_NAMED:
	case ScriptAction::CAMERA_STOP_FOLLOW:
	case ScriptAction::SETUP_CAMERA:
	case ScriptAction::CAMERA_LETTERBOX_BEGIN:
	case ScriptAction::CAMERA_LETTERBOX_END:
	case ScriptAction::CAMERA_BW_MODE_BEGIN:
	case ScriptAction::CAMERA_BW_MODE_END:
	case ScriptAction::CAMERA_MOTION_BLUR:
	case ScriptAction::CAMERA_MOTION_BLUR_JUMP:
	case ScriptAction::CAMERA_MOTION_BLUR_FOLLOW:
	case ScriptAction::CAMERA_MOTION_BLUR_END_FOLLOW:
	case ScriptAction::CAMERA_SET_AUDIBLE_DISTANCE:
	case ScriptAction::CAMERA_TETHER_NAMED:
	case ScriptAction::CAMERA_STOP_TETHER_NAMED:
	case ScriptAction::CAMERA_SET_DEFAULT:
	case ScriptAction::CAMERA_LOOK_TOWARD_OBJECT:
	case ScriptAction::CAMERA_LOOK_TOWARD_WAYPOINT:
	case ScriptAction::CAMERA_ENABLE_SLAVE_MODE:
	case ScriptAction::CAMERA_DISABLE_SLAVE_MODE:
	case ScriptAction::DISABLE_INPUT:
	case ScriptAction::ENABLE_INPUT:
	case ScriptAction::FREEZE_TIME:
	case ScriptAction::UNFREEZE_TIME:
	case ScriptAction::MOVIE_PLAY_FULLSCREEN:
	case ScriptAction::MOVIE_PLAY_RADAR:
	case ScriptAction::SPEECH_PLAY:
	case ScriptAction::SHOW_MILITARY_CAPTION:
	case ScriptAction::DISPLAY_CINEMATIC_TEXT:
		return true;
	default:
		return false;
	}
}

bool condition_type_needs_script_catalog_context(Condition::ConditionType type)
{
	switch (type) {
	case Condition::FLAG:
	case Condition::TIMER_EXPIRED:
	case Condition::HAS_FINISHED_VIDEO:
	case Condition::HAS_FINISHED_SPEECH:
	case Condition::HAS_FINISHED_AUDIO:
	case Condition::MUSIC_TRACK_HAS_COMPLETED:
		return true;
	default:
		return false;
	}
}

bool action_has_script_catalog_priority(ScriptAction *action)
{
	if (action == NULL) {
		return false;
	}

	switch (action->getActionType()) {
	case ScriptAction::CAMERA_LETTERBOX_END:
	case ScriptAction::ENABLE_INPUT:
		return true;
	default:
		break;
	}

	for (Int index = 0; index < action->getNumParameters(); ++index) {
		if (parameter_has_script_priority_token(action->getParameter(index))) {
			return true;
		}
	}
	return false;
}

bool action_has_script_catalog_interest(ScriptAction *action)
{
	if (action == NULL) {
		return false;
	}

	if (cinematic_action_type(action->getActionType())) {
		return true;
	}

	for (Int index = 0; index < action->getNumParameters(); ++index) {
		if (parameter_has_script_catalog_token(action->getParameter(index))) {
			return true;
		}
	}
	return false;
}

bool condition_has_script_catalog_priority(Condition *condition)
{
	if (condition == NULL) {
		return false;
	}

	for (Int index = 0; index < condition->getNumParameters(); ++index) {
		if (parameter_has_script_priority_token(condition->getParameter(index))) {
			return true;
		}
	}
	return false;
}

bool condition_has_script_catalog_interest(Condition *condition)
{
	if (condition == NULL) {
		return false;
	}

	if (condition->getConditionType() == Condition::CAMERA_MOVEMENT_FINISHED) {
		return true;
	}

	if (!condition_type_needs_script_catalog_context(condition->getConditionType())) {
		return false;
	}

	for (Int index = 0; index < condition->getNumParameters(); ++index) {
		if (parameter_has_script_catalog_token(condition->getParameter(index))) {
			return true;
		}
	}
	return false;
}

bool action_list_has_script_catalog_priority(ScriptAction *action)
{
	for (ScriptAction *current = action; current != NULL; current = current->getNext()) {
		if (action_has_script_catalog_priority(current)) {
			return true;
		}
	}
	return false;
}

bool action_list_has_script_catalog_interest(ScriptAction *action)
{
	for (ScriptAction *current = action; current != NULL; current = current->getNext()) {
		if (action_has_script_catalog_interest(current)) {
			return true;
		}
	}
	return false;
}

bool conditions_have_script_catalog_priority(OrCondition *condition)
{
	for (OrCondition *or_condition = condition;
		or_condition != NULL;
		or_condition = or_condition->getNextOrCondition()) {
		for (Condition *and_condition = or_condition->getFirstAndCondition();
			and_condition != NULL;
			and_condition = and_condition->getNext()) {
			if (condition_has_script_catalog_priority(and_condition)) {
				return true;
			}
		}
	}
	return false;
}

bool conditions_have_script_catalog_interest(OrCondition *condition)
{
	for (OrCondition *or_condition = condition;
		or_condition != NULL;
		or_condition = or_condition->getNextOrCondition()) {
		for (Condition *and_condition = or_condition->getFirstAndCondition();
			and_condition != NULL;
			and_condition = and_condition->getNext()) {
			if (condition_has_script_catalog_interest(and_condition)) {
				return true;
			}
		}
	}
	return false;
}

bool script_has_catalog_interest(Script *script, const char *group_name)
{
	if (script == NULL) {
		return false;
	}

	return contains_script_catalog_token(script->getName().str())
		|| contains_script_catalog_token(script->getComment().str())
		|| contains_script_catalog_token(script->getConditionComment().str())
		|| contains_script_catalog_token(script->getActionComment().str())
		|| (group_name != NULL && contains_script_catalog_token(group_name))
		|| conditions_have_script_catalog_interest(script->getOrCondition())
		|| action_list_has_script_catalog_interest(script->getAction())
		|| action_list_has_script_catalog_interest(script->getFalseAction());
}

int script_catalog_priority(Script *script, const char *group_name)
{
	if (script == NULL) {
		return 0;
	}

	if (contains_script_priority_token(script->getName().str())
		|| contains_script_priority_token(script->getComment().str())
		|| contains_script_priority_token(script->getConditionComment().str())
		|| contains_script_priority_token(script->getActionComment().str())
		|| (group_name != NULL && contains_script_priority_token(group_name))
		|| conditions_have_script_catalog_priority(script->getOrCondition())
		|| action_list_has_script_catalog_priority(script->getAction())
		|| action_list_has_script_catalog_priority(script->getFalseAction())) {
		return 2;
	}

	return script->isActive() ? 1 : 0;
}

void append_parameter_json(std::string &json, const Parameter *parameter, Int index)
{
	json += "{\"index\":" + std::to_string(index);
	if (parameter == NULL) {
		json += ",\"ready\":false}";
		return;
	}

	const Parameter::ParameterType type = parameter->getParameterType();
	json += ",\"ready\":true";
	json += ",\"type\":" + std::to_string(static_cast<Int>(type));
	json += ",\"typeName\":\"";
	json += script_parameter_type_name(type);
	json += "\"";
	json += ",\"string\":\"" + json_escape(parameter->getString().str()) + "\"";
	json += ",\"int\":" + std::to_string(parameter->getInt());
	char number[64];
	std::snprintf(number, sizeof(number), "%.6f", parameter->getReal());
	json += ",\"real\":";
	json += number;
	if (type == Parameter::COORD3D) {
		Coord3D coord = { 0.0f, 0.0f, 0.0f };
		parameter->getCoord3D(&coord);
		char coord_buf[128];
		std::snprintf(
			coord_buf,
			sizeof(coord_buf),
			",\"coord\":{\"x\":%.6f,\"y\":%.6f,\"z\":%.6f}",
			coord.x,
			coord.y,
			coord.z);
		json += coord_buf;
	}
	json += "}";
}

void append_action_parameters_json(std::string &json, ScriptAction *action)
{
	json += ",\"parameters\":[";
	const Int count = action != NULL ? action->getNumParameters() : 0;
	for (Int index = 0; index < count; ++index) {
		if (index != 0) {
			json += ",";
		}
		append_parameter_json(json, action->getParameter(index), index);
	}
	json += "]";
}

void append_condition_parameters_json(std::string &json, Condition *condition)
{
	json += ",\"parameters\":[";
	const Int count = condition != NULL ? condition->getNumParameters() : 0;
	for (Int index = 0; index < count; ++index) {
		if (index != 0) {
			json += ",";
		}
		append_parameter_json(json, condition->getParameter(index), index);
	}
	json += "]";
}

void append_script_action_list_json(
	std::string &json,
	const char *field_name,
	ScriptAction *first_action)
{
	const int action_limit = 16;
	int total_count = 0;
	int included_count = 0;

	json += ",\"";
	json += field_name;
	json += "\":[";
	for (ScriptAction *action = first_action; action != NULL; action = action->getNext()) {
		++total_count;
		if (included_count >= action_limit) {
			continue;
		}
		if (included_count != 0) {
			json += ",";
		}
		++included_count;
		const ScriptAction::ScriptActionType type = action->getActionType();
		const ActionTemplate *action_template =
			TheScriptEngine != NULL ? TheScriptEngine->getActionTemplate(type) : NULL;
		json += "{\"index\":" + std::to_string(total_count - 1);
		json += ",\"type\":" + std::to_string(static_cast<Int>(type));
		json += ",\"internalName\":\"";
		json += action_template != NULL ?
			json_escape(action_template->m_internalName.str()) : "";
		json += "\",\"uiName\":\"";
		json += action_template != NULL ?
			json_escape(action_template->getName().str()) : "";
		json += "\"";
		append_action_parameters_json(json, action);
		json += "}";
	}
	json += "]";
	json += ",\"";
	json += field_name;
	json += "Count\":" + std::to_string(total_count);
	json += ",\"";
	json += field_name;
	json += "Truncated\":";
	json += total_count > included_count ? "true" : "false";
}

void append_script_conditions_json(std::string &json, OrCondition *first_condition)
{
	const int condition_limit = 16;
	int total_count = 0;
	int included_count = 0;
	int or_index = 0;

	json += ",\"conditions\":[";
	for (OrCondition *or_condition = first_condition;
		or_condition != NULL;
		or_condition = or_condition->getNextOrCondition(), ++or_index) {
		int and_index = 0;
		for (Condition *condition = or_condition->getFirstAndCondition();
			condition != NULL;
			condition = condition->getNext(), ++and_index) {
			++total_count;
			if (included_count >= condition_limit) {
				continue;
			}
			if (included_count != 0) {
				json += ",";
			}
			++included_count;
			const Condition::ConditionType type = condition->getConditionType();
			const ConditionTemplate *condition_template =
				TheScriptEngine != NULL ? TheScriptEngine->getConditionTemplate(type) : NULL;
			json += "{\"orIndex\":" + std::to_string(or_index);
			json += ",\"andIndex\":" + std::to_string(and_index);
			json += ",\"type\":" + std::to_string(static_cast<Int>(type));
			json += ",\"internalName\":\"";
			json += condition_template != NULL ?
				json_escape(condition_template->m_internalName.str()) : "";
			json += "\",\"uiName\":\"";
			json += condition_template != NULL ?
				json_escape(condition_template->getName().str()) : "";
			json += "\"";
			append_condition_parameters_json(json, condition);
			json += "}";
		}
	}
	json += "]";
	json += ",\"conditionCount\":" + std::to_string(total_count);
	json += ",\"conditionsTruncated\":";
	json += total_count > included_count ? "true" : "false";
}

void append_script_catalog_entry_json(
	std::string &json,
	Script *script,
	Int side_index,
	const char *group_name,
	int priority)
{
	json += "{\"sideIndex\":" + std::to_string(side_index);
	json += ",\"priority\":" + std::to_string(priority);
	json += ",\"groupName\":\"";
	json += group_name != NULL ? json_escape(group_name) : "";
	json += "\"";
	json += ",\"name\":\"" + json_escape(script->getName().str()) + "\"";
	json += ",\"comment\":\"" + json_escape(script->getComment().str()) + "\"";
	json += ",\"conditionComment\":\"" +
		json_escape(script->getConditionComment().str()) + "\"";
	json += ",\"actionComment\":\"" +
		json_escape(script->getActionComment().str()) + "\"";
	json += ",\"active\":";
	json += script->isActive() ? "true" : "false";
	json += ",\"oneShot\":";
	json += script->isOneShot() ? "true" : "false";
	json += ",\"subroutine\":";
	json += script->isSubroutine() ? "true" : "false";
	json += ",\"easy\":";
	json += script->isEasy() ? "true" : "false";
	json += ",\"normal\":";
	json += script->isNormal() ? "true" : "false";
	json += ",\"hard\":";
	json += script->isHard() ? "true" : "false";
	json += ",\"delayEvalSeconds\":" +
		std::to_string(script->getDelayEvalSeconds());
	json += ",\"frameToEvaluate\":" +
		std::to_string(script->getFrameToEvaluate());
	json += ",\"conditionEvaluations\":" +
		std::to_string(script->getConditionCount());
	char time_buf[128];
	std::snprintf(
		time_buf,
		sizeof(time_buf),
		",\"conditionTime\":%.6f,\"curTime\":%.6f",
		script->getConditionTime(),
		script->getCurTime());
	json += time_buf;
	append_script_conditions_json(json, script->getOrCondition());
	append_script_action_list_json(json, "actions", script->getAction());
	append_script_action_list_json(json, "falseActions", script->getFalseAction());
	json += "}";
}

struct ScriptCatalogCandidate {
	Script *script = NULL;
	Int side_index = 0;
	std::string group_name;
	int priority = 0;
};

void note_script_for_catalog(
	std::vector<ScriptCatalogCandidate> &candidates,
	Script *script,
	Int side_index,
	const char *group_name,
	int &script_count,
	int &interesting_count)
{
	for (Script *current = script; current != NULL; current = current->getNext()) {
		++script_count;
		if (!script_has_catalog_interest(current, group_name)) {
			continue;
		}
		++interesting_count;
		ScriptCatalogCandidate candidate;
		candidate.script = current;
		candidate.side_index = side_index;
		candidate.group_name = group_name != NULL ? group_name : "";
		candidate.priority = script_catalog_priority(current, group_name);
		candidates.push_back(candidate);
	}
}

void append_loaded_script_catalog(std::string &json)
{
	json += ",\"catalog\":{";
	if (TheSidesList == NULL) {
		json += "\"ready\":false,\"sideCount\":0,\"groupCount\":0,"
			"\"scriptCount\":0,\"interestingScriptCount\":0,"
			"\"includedCount\":0,\"includedTruncated\":false,\"scripts\":[]}";
		return;
	}

	const Int side_count = TheSidesList->getNumSides();
	int group_count = 0;
	int script_count = 0;
	int interesting_count = 0;
	int included_count = 0;
	std::string scripts_json;
	std::vector<ScriptCatalogCandidate> candidates;

	for (Int side_index = 0; side_index < side_count; ++side_index) {
		SidesInfo *side = TheSidesList->getSideInfo(side_index);
		ScriptList *script_list = side != NULL ? side->getScriptList() : NULL;
		if (script_list == NULL) {
			continue;
		}

		note_script_for_catalog(
			candidates,
			script_list->getScript(),
			side_index,
			NULL,
			script_count,
			interesting_count);

		for (ScriptGroup *group = script_list->getScriptGroup();
			group != NULL;
			group = group->getNext()) {
			++group_count;
			const std::string group_name = group->getName().str();
			note_script_for_catalog(
				candidates,
				group->getScript(),
				side_index,
				group_name.c_str(),
				script_count,
				interesting_count);
		}
	}

	const int include_limit = 96;
	for (int priority = 2; priority >= 0; --priority) {
		for (std::vector<ScriptCatalogCandidate>::const_iterator it = candidates.begin();
			it != candidates.end() && included_count < include_limit;
			++it) {
			if (it->priority != priority) {
				continue;
			}
			if (included_count != 0) {
				scripts_json += ",";
			}
			++included_count;
			append_script_catalog_entry_json(
				scripts_json,
				it->script,
				it->side_index,
				it->group_name.c_str(),
				it->priority);
		}
	}

	json += "\"ready\":true";
	json += ",\"sideCount\":" + std::to_string(side_count);
	json += ",\"groupCount\":" + std::to_string(group_count);
	json += ",\"scriptCount\":" + std::to_string(script_count);
	json += ",\"interestingScriptCount\":" + std::to_string(interesting_count);
	json += ",\"includedCount\":" + std::to_string(included_count);
	json += ",\"includedTruncated\":";
	json += interesting_count > included_count ? "true" : "false";
	json += ",\"scripts\":[";
	json += scripts_json;
	json += "]}";
}

void append_script_engine_debug_state(std::string &json)
{
	json += ",\"scriptDebug\":{";
	if (TheScriptEngine == NULL) {
		json += "\"counterCount\":0,\"countersTruncated\":false,\"counters\":[],"
			"\"flagCount\":0,\"flagsTruncated\":false,\"flags\":[],"
			"\"sequentialScriptCount\":0,\"sequentialScriptsTruncated\":false,"
			"\"sequentialScripts\":[],"
			"\"catalog\":{\"ready\":false,\"sideCount\":0,\"groupCount\":0,"
			"\"scriptCount\":0,\"interestingScriptCount\":0,"
			"\"includedCount\":0,\"includedTruncated\":false,\"scripts\":[]}}";
		return;
	}

	const Int counter_count = TheScriptEngine->debugGetCounterCount();
	json += "\"counterCount\":" + std::to_string(counter_count);
	json += ",\"countersTruncated\":false";
	json += ",\"counters\":[";
	bool first_entry = true;
	for (Int index = 1; index < counter_count; ++index) {
		const TCounter *counter = TheScriptEngine->debugGetCounterByIndex(index);
		if (counter == NULL || counter->name.isEmpty()) {
			continue;
		}
		if (!first_entry) {
			json += ",";
		}
		first_entry = false;
		json += "{\"index\":" + std::to_string(index);
		json += ",\"name\":\"" + json_escape(counter->name.str()) + "\"";
		json += ",\"value\":" + std::to_string(counter->value);
		json += ",\"countdownTimer\":";
		json += counter->isCountdownTimer ? "true" : "false";
		json += "}";
	}
	json += "]";

	const Int flag_count = TheScriptEngine->debugGetFlagCount();
	json += ",\"flagCount\":" + std::to_string(flag_count);
	json += ",\"flagsTruncated\":false";
	json += ",\"flags\":[";
	first_entry = true;
	for (Int index = 1; index < flag_count; ++index) {
		const TFlag *flag = TheScriptEngine->debugGetFlagByIndex(index);
		if (flag == NULL || flag->name.isEmpty()) {
			continue;
		}
		if (!first_entry) {
			json += ",";
		}
		first_entry = false;
		json += "{\"index\":" + std::to_string(index);
		json += ",\"name\":\"" + json_escape(flag->name.str()) + "\"";
		json += ",\"value\":";
		json += flag->value ? "true" : "false";
		json += "}";
	}
	json += "]";

	const Int sequential_count = TheScriptEngine->debugGetSequentialScriptCount();
	const Int sequential_limit = sequential_count < 16 ? sequential_count : 16;
	json += ",\"sequentialScriptCount\":" + std::to_string(sequential_count);
	json += ",\"sequentialScriptsTruncated\":";
	json += sequential_count > sequential_limit ? "true" : "false";
	json += ",\"sequentialScripts\":[";
	first_entry = true;
	for (Int index = 0; index < sequential_limit; ++index) {
		const SequentialScript *sequential =
			TheScriptEngine->debugGetSequentialScriptByIndex(index);
		if (sequential == NULL) {
			continue;
		}
		if (!first_entry) {
			json += ",";
		}
		first_entry = false;
		const Script *script = sequential->m_scriptToExecuteSequentially;
		json += "{\"index\":" + std::to_string(index);
		json += ",\"scriptReady\":";
		json += script != NULL ? "true" : "false";
		json += ",\"scriptName\":\"";
		json += script != NULL ? json_escape(script->getName().str()) : "";
		json += "\",\"objectId\":" +
			std::to_string(static_cast<Int>(sequential->m_objectID));
		json += ",\"hasTeam\":";
		json += sequential->m_teamToExecOn != NULL ? "true" : "false";
		json += ",\"currentInstruction\":" +
			std::to_string(sequential->m_currentInstruction);
		json += ",\"timesToLoop\":" + std::to_string(sequential->m_timesToLoop);
		json += ",\"framesToWait\":" + std::to_string(sequential->m_framesToWait);
		json += ",\"dontAdvanceInstruction\":";
		json += sequential->m_dontAdvanceInstruction ? "true" : "false";
		json += "}";
	}
	json += "]";
	append_loaded_script_catalog(json);
	json += "}";
}

int count_game_client_drawables()
{
	if (TheGameClient == NULL) {
		return 0;
	}

	int count = 0;
	for (Drawable *draw = TheGameClient->firstDrawable();
		draw != NULL && count < 10000;
		draw = draw->getNextDrawable()) {
		++count;
	}
	return count;
}

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
		json += ",\"letterBoxed\":";
		json += TheDisplay->isLetterBoxed() ? "true" : "false";
		json += ",\"letterBoxFading\":";
		json += TheDisplay->isLetterBoxFading() ? "true" : "false";
	} else {
		json += "\"width\":null,\"height\":null,\"moviePlaying\":null,"
			"\"letterBoxed\":null,\"letterBoxFading\":null";
	}
	json += "}";

	json += ",\"gameplay\":{";
	json += "\"gameLogicReady\":";
	json += TheGameLogic != NULL ? "true" : "false";
	if (TheGameLogic != NULL) {
		json += ",\"inGame\":";
		json += TheGameLogic->isInGame() ? "true" : "false";
		json += ",\"gameMode\":" + std::to_string(TheGameLogic->getGameMode());
		json += ",\"loadingMap\":";
		json += TheGameLogic->isLoadingMap() ? "true" : "false";
		json += ",\"loadingSave\":";
		json += TheGameLogic->isLoadingSave() ? "true" : "false";
		json += ",\"clearingGameData\":";
		json += TheGameLogic->isClearingGameData() ? "true" : "false";
		json += ",\"gamePaused\":";
		json += TheGameLogic->isGamePaused() ? "true" : "false";
		json += ",\"logicFrame\":" + std::to_string(TheGameLogic->getFrame());
		json += ",\"objectCount\":" + std::to_string(TheGameLogic->getObjectCount());
		json += ",\"progressComplete\":";
		json += TheGameLogic->isProgressComplete() ? "true" : "false";
	} else {
		json += ",\"inGame\":null,\"gameMode\":null,\"loadingMap\":null,"
			"\"loadingSave\":null,\"clearingGameData\":null,\"gamePaused\":null,"
			"\"logicFrame\":null,\"objectCount\":0,\"progressComplete\":null";
	}

	json += ",\"gameClientReady\":";
	json += TheGameClient != NULL ? "true" : "false";
	if (TheGameClient != NULL) {
		json += ",\"clientFrame\":" + std::to_string(TheGameClient->getFrame());
		json += ",\"drawableCount\":" + std::to_string(count_game_client_drawables());
		json += ",\"renderedObjectCount\":" + std::to_string(TheGameClient->getRenderedObjectCount());
	} else {
		json += ",\"clientFrame\":null,\"drawableCount\":0,\"renderedObjectCount\":0";
	}

	json += ",\"playerListReady\":";
	json += ThePlayerList != NULL ? "true" : "false";
	if (ThePlayerList != NULL) {
		Player *local_player = ThePlayerList->getLocalPlayer();
		json += ",\"playerCount\":" + std::to_string(ThePlayerList->getPlayerCount());
		json += ",\"localPlayer\":{";
		json += "\"ready\":";
		json += local_player != NULL ? "true" : "false";
		if (local_player != NULL) {
			json += ",\"index\":" + std::to_string(local_player->getPlayerIndex());
			json += ",\"active\":";
			json += local_player->isPlayerActive() ? "true" : "false";
			json += ",\"side\":\"" + json_escape(local_player->getSide().str()) + "\"";
		} else {
			json += ",\"index\":null,\"active\":null,\"side\":\"\"";
		}
		json += "}";
	} else {
		json += ",\"playerCount\":0,\"localPlayer\":{\"ready\":false,"
			"\"index\":null,\"active\":null,\"side\":\"\"}";
	}

	json += ",\"inGameUIReady\":";
	json += TheInGameUI != NULL ? "true" : "false";
	if (TheInGameUI != NULL) {
		json += ",\"inputEnabled\":";
		json += TheInGameUI->getInputEnabled() ? "true" : "false";
		json += ",\"selectCount\":" + std::to_string(TheInGameUI->getSelectCount());
		json += ",\"selectedControllable\":";
		json += TheInGameUI->areSelectedObjectsControllable() ? "true" : "false";
		json += ",\"clientQuiet\":";
		json += TheInGameUI->isClientQuiet() ? "true" : "false";
		json += ",\"scrolling\":";
		json += TheInGameUI->isScrolling() ? "true" : "false";
		json += ",\"placementAnchored\":";
		json += TheInGameUI->isPlacementAnchored() ? "true" : "false";
		json += ",\"mouseOverDrawableId\":" +
			std::to_string(static_cast<Int>(TheInGameUI->getMousedOverDrawableID()));
		json += ",\"videoBufferReady\":";
		json += TheInGameUI->videoBuffer() != NULL ? "true" : "false";
		json += ",\"cameoVideoBufferReady\":";
		json += TheInGameUI->cameoVideoBuffer() != NULL ? "true" : "false";
	} else {
		json += ",\"inputEnabled\":null,\"selectCount\":0,\"selectedControllable\":null,"
			"\"clientQuiet\":null,\"scrolling\":null,\"placementAnchored\":null,"
			"\"mouseOverDrawableId\":null,\"videoBufferReady\":null,"
			"\"cameoVideoBufferReady\":null";
	}

	json += ",\"controlBarReady\":";
	json += TheControlBar != NULL ? "true" : "false";
	if (TheControlBar != NULL) {
		json += ",\"observerControlBarOn\":";
		json += TheControlBar->isObserverControlBarOn() ? "true" : "false";
	} else {
		json += ",\"observerControlBarOn\":null";
	}

	json += ",\"scriptEngineReady\":";
	json += TheScriptEngine != NULL ? "true" : "false";
	if (TheScriptEngine != NULL) {
		char fade_value[64];
		std::snprintf(fade_value, sizeof(fade_value), "%.3f", TheScriptEngine->getFadeValue());
		json += ",\"fade\":" + std::to_string(static_cast<Int>(TheScriptEngine->getFade()));
		json += ",\"fadeValue\":";
		json += fade_value;
		json += ",\"timeFrozenScript\":";
		json += TheScriptEngine->isTimeFrozenScript() ? "true" : "false";
		json += ",\"timeFrozenDebug\":";
		json += TheScriptEngine->isTimeFrozenDebug() ? "true" : "false";
		json += ",\"gameEnding\":";
		json += TheScriptEngine->isGameEnding() ? "true" : "false";
	} else {
		json += ",\"fade\":null,\"fadeValue\":null,\"timeFrozenScript\":null,"
			"\"timeFrozenDebug\":null,\"gameEnding\":null";
	}
	append_script_engine_debug_state(json);
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
		json += ",\"animFinished\":";
		json += TheShell->isAnimFinished() ? "true" : "false";
		json += ",\"animReversed\":";
		json += TheShell->isAnimReversed() ? "true" : "false";
	} else {
		json += "\"active\":null,\"screenCount\":null,\"animFinished\":null,\"animReversed\":null";
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
	json += ",\"startGame\":" + std::to_string(cnc_port_main_menu_start_game());
	json += ",\"isShuttingDown\":" + std::to_string(cnc_port_main_menu_is_shutting_down());
	json += ",\"launchChallengeMenu\":" + std::to_string(cnc_port_main_menu_launch_challenge_menu());
	json += ",\"showSide\":" + std::to_string(cnc_port_main_menu_show_side());
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
	json += ",\"checkCDCount\":" + std::to_string(cnc_port_main_menu_check_cd_count());
	json += ",\"lastCDPresent\":" + std::to_string(cnc_port_main_menu_last_cd_present());
	json += ",\"lastCDDifficulty\":" + std::to_string(cnc_port_main_menu_last_cd_difficulty());
	json += ",\"prepareCampaignCount\":" + std::to_string(cnc_port_main_menu_prepare_campaign_count());
	json += ",\"lastPrepareDifficulty\":" + std::to_string(cnc_port_main_menu_last_prepare_difficulty());
	json += ",\"setupGameStartCount\":" + std::to_string(cnc_port_main_menu_setup_game_start_count());
	json += ",\"lastSetupDifficulty\":" + std::to_string(cnc_port_main_menu_last_setup_difficulty());
	json += ",\"lastSetupMap\":\"";
	json += json_escape(cnc_port_main_menu_last_setup_map() != NULL ?
		cnc_port_main_menu_last_setup_map() : "");
	json += "\",\"lastPendingFile\":\"";
	json += json_escape(cnc_port_main_menu_last_pending_file() != NULL ?
		cnc_port_main_menu_last_pending_file() : "");
	json += "\",\"doGameStartCount\":" + std::to_string(cnc_port_main_menu_do_game_start_count());
	json += ",\"lastNewGameMode\":" + std::to_string(cnc_port_main_menu_last_new_game_mode());
	json += ",\"lastNewGameDifficulty\":" + std::to_string(cnc_port_main_menu_last_new_game_difficulty());
	json += ",\"lastNewGameRankPoints\":" + std::to_string(cnc_port_main_menu_last_new_game_rank_points());
	json += ",\"shutdownCompleteCount\":" + std::to_string(cnc_port_main_menu_shutdown_complete_count());
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

	json += ",\"controlBarWindows\":{\"queried\":true";
	append_window_probe(json, "parent", "ControlBar.wnd:ControlBarParent");
	append_window_probe(json, "rightHud", "ControlBar.wnd:RightHUD");
	append_window_probe(json, "moneyDisplay", "ControlBar.wnd:MoneyDisplay");
	append_window_probe(json, "powerWindow", "ControlBar.wnd:PowerWindow");
	append_window_probe(json, "buttonGeneral", "ControlBar.wnd:ButtonGeneral");
	append_window_probe(json, "buttonIdleWorker", "ControlBar.wnd:ButtonIdleWorker");
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
	reset_frame_texture_diagnostics();
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
	json += ",\"lastUpdateTarget\":\"" + json_escape(g_last_engine_update_target) + "\"";
	json += ",\"lastGameLogicStep\":\"" + json_escape(g_last_game_logic_step) + "\"";
	append_frame_texture_diagnostics(json);
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
