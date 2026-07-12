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
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include <atlbase.h>
#include <mmsystem.h>
#include <windows.h>

#include "Common/AsciiString.h"
#include "Common/GameEngine.h"
#include "Common/AudioAffect.h"
#include "Common/AudioEventInfo.h"
#include "Common/AudioEventRTS.h"
#include "Common/AudioHandleSpecialValues.h"
#include "Common/AudioSettings.h"
#include "Common/FunctionLexicon.h"
#include "Common/GameAudio.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "Common/NameKeyGenerator.h"
#include "Common/Player.h"
#include "Common/PlayerList.h"
#include "Common/PlayerTemplate.h"
#include "Common/Radar.h"
#include "Common/SubsystemInterface.h"
#include "Common/GameLOD.h"
#include "GameClient/ControlBar.h"
#include "GameClient/ControlBarScheme.h"
#include "GameClient/Gadget.h"
#include "GameClient/GadgetPushButton.h"
#include "GameClient/GadgetTextEntry.h"
#include "WW3D2/assetmgr.h"
#include "WW3D2/texture.h"
#include "WW3D2/ww3d.h"
#include "GameClient/MapUtil.h"
#include "cpudetect.h"
#include "GameClient/Display.h"
#include "GameClient/Drawable.h"
#include "Common/DrawModule.h"
#include "W3DDevice/GameClient/Module/W3DModelDraw.h"
#include "GameClient/FXList.h"
#include "GameClient/GUICallbacks.h"
#include "GameClient/GameClient.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/Image.h"
#include "W3DDevice/GameClient/W3DGUICallbacks.h"
#include "W3DDevice/GameClient/W3DGameWindow.h"
#include "GameClient/GameWindowTransitions.h"
#include "GameClient/InGameUI.h"
#include "GameClient/IMEManager.h"
#include "GameClient/Keyboard.h"
#include "GameClient/Mouse.h"
#include "GameClient/Shell.h"
#include "GameClient/Smudge.h"
#include "GameClient/HeaderTemplate.h"
#include "GameClient/View.h"
#include "GameClient/WinInstanceData.h"
#include "GameClient/WindowLayout.h"
#include "GameNetwork/GameInfo.h"
#include "wasm_browser_mouse.h"
#include "GameLogic/AI.h"
#include "GameLogic/Module/AIUpdate.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/PartitionManager.h"
#include "GameLogic/ScriptEngine.h"
#include "GameLogic/Scripts.h"
#include "GameLogic/SidesList.h"
#include "GameLogic/TerrainLogic.h"
#include "GameLogic/Weapon.h"
#include "GameLogic/Object.h"
#include "GameLogic/Module/BodyModule.h"
#include "GameNetwork/LANAPI.h"
#include "GameNetwork/LANAPICallbacks.h"
#include "GameNetwork/LANGameInfo.h"
#include "GameNetwork/NetworkInterface.h"
#include "wasm_d3d8_shim.h"
#include "Common/ThingTemplate.h"
#include "Common/ThingFactory.h"
#include "GameClient/ParticleSys.h"
#include "GameLogic/Module/LaserUpdate.h"
#include "W3DDevice/GameClient/BaseHeightMap.h"
#include "W3DDevice/GameClient/W3DShroud.h"
#include "wasm_function_lexicon_runtime.h"

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
extern Win32Mouse *TheWin32Mouse;
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
extern "C" void cnc_port_terrain_probe_set_shroud_enabled(bool enabled);
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
extern "C" Int cnc_port_shell_show_shell_count(void);
extern "C" Int cnc_port_shell_show_shell_map_on_count(void);
extern "C" Int cnc_port_shell_show_shell_map_off_count(void);
extern "C" Int cnc_port_shell_hide_shell_count(void);
extern "C" const char *cnc_port_shell_last_push_name(void);
extern "C" const char *cnc_port_shell_last_do_push_name(void);
extern "C" Int cnc_port_start_new_game_shell_branch_count(void);
extern "C" Int cnc_port_start_new_game_shell_push_attempt_count(void);
extern "C" Int cnc_port_start_new_game_shell_reveal_existing_count(void);
extern "C" Int cnc_port_start_new_game_shell_last_mode(void);
extern "C" Int cnc_port_start_new_game_shell_last_screen_count_before(void);
extern "C" Int cnc_port_start_new_game_shell_last_screen_count_after(void);
extern "C" const char *cnc_port_start_new_game_shell_last_action(void);
extern "C" Int cnc_port_start_new_game_count(void);
extern "C" Int cnc_port_start_new_game_last_entry_mode(void);
extern "C" Int cnc_port_start_new_game_last_after_defaults_mode(void);
extern "C" Int cnc_port_start_new_game_last_before_shell_branch_mode(void);
extern "C" Int cnc_port_logic_dispatch_new_game_count(void);
extern "C" Int cnc_port_logic_dispatch_last_new_game_mode(void);
extern "C" Int cnc_port_logic_dispatch_prepare_new_game_count(void);
extern "C" Int cnc_port_logic_dispatch_last_prepare_new_game_mode(void);
extern "C" Int cnc_port_logic_dispatch_last_mode_after_set(void);
extern "C" Int cnc_port_logic_dispatch_prepare_this_is_global(void);
extern "C" Int cnc_port_logic_dispatch_prepare_hide_shell_count(void);
extern "C" Int cnc_port_logic_dispatch_clear_game_data_count(void);
extern "C" Int cnc_port_logic_dispatch_move_command_count(void);
extern "C" Int cnc_port_logic_dispatch_last_move_command_type(void);
extern "C" Int cnc_port_logic_dispatch_last_move_had_group(void);
extern "C" Real cnc_port_logic_dispatch_last_move_x(void);
extern "C" Real cnc_port_logic_dispatch_last_move_y(void);
extern "C" Real cnc_port_logic_dispatch_last_move_z(void);
extern "C" Int cnc_port_logic_dispatch_attack_command_count(void);
extern "C" Int cnc_port_logic_dispatch_last_attack_command_type(void);
extern "C" Int cnc_port_logic_dispatch_last_attack_had_group(void);
extern "C" Int cnc_port_logic_dispatch_last_attack_target_id(void);
extern "C" Real cnc_port_logic_dispatch_last_attack_target_x(void);
extern "C" Real cnc_port_logic_dispatch_last_attack_target_y(void);
extern "C" Real cnc_port_logic_dispatch_last_attack_target_z(void);
extern "C" Int cnc_port_logic_dispatch_dock_command_count(void);
extern "C" Int cnc_port_logic_dispatch_last_dock_command_type(void);
extern "C" Int cnc_port_logic_dispatch_last_dock_had_group(void);
extern "C" Int cnc_port_logic_dispatch_last_dock_target_id(void);
extern "C" Real cnc_port_logic_dispatch_last_dock_target_x(void);
extern "C" Real cnc_port_logic_dispatch_last_dock_target_y(void);
extern "C" Real cnc_port_logic_dispatch_last_dock_target_z(void);
extern "C" Int cnc_port_logic_dispatch_build_command_count(void);
extern "C" Int cnc_port_logic_dispatch_last_build_command_type(void);
extern "C" Int cnc_port_logic_dispatch_last_build_had_group(void);
extern "C" Int cnc_port_logic_dispatch_last_build_arg0(void);
extern "C" Int cnc_port_logic_dispatch_queue_upgrade_count(void);
extern "C" Int cnc_port_logic_dispatch_queue_unit_create_count(void);
extern "C" Int cnc_port_logic_dispatch_dozer_construct_count(void);
extern "C" Int cnc_port_logic_dispatch_purchase_science_count(void);
extern "C" Int cnc_port_purchase_science_show_count(void);
extern "C" Int cnc_port_purchase_science_hide_count(void);
extern "C" Int cnc_port_purchase_science_toggle_count(void);
extern "C" Int cnc_port_purchase_science_last_toggle_before_hidden(void);
extern "C" Int cnc_port_purchase_science_last_toggle_after_hidden(void);
extern "C" Int cnc_port_purchase_science_last_show_before_hidden(void);
extern "C" Int cnc_port_purchase_science_last_show_after_hidden(void);
extern "C" Int cnc_port_purchase_science_last_hide_before_hidden(void);
extern "C" Int cnc_port_purchase_science_last_hide_after_hidden(void);
extern "C" Int cnc_port_purchase_science_show_game_ending_returns(void);
extern "C" Int cnc_port_command_xlat_last_click_type(void);
extern "C" Int cnc_port_command_xlat_last_click_is_point(void);
extern "C" Int cnc_port_command_xlat_last_click_controllable(void);
extern "C" Int cnc_port_command_xlat_last_click_use_alternate_mouse(void);
extern "C" Int cnc_port_command_xlat_last_click_issued_type(void);
extern "C" Int cnc_port_command_xlat_last_click_draw_id(void);
extern "C" Real cnc_port_command_xlat_last_click_x(void);
extern "C" Real cnc_port_command_xlat_last_click_y(void);
extern "C" Real cnc_port_command_xlat_last_click_z(void);
extern "C" Int cnc_port_command_xlat_raw_right_down_count(void);
extern "C" Int cnc_port_command_xlat_raw_right_up_count(void);
extern "C" Int cnc_port_command_xlat_right_click_seen_count(void);
extern "C" Int cnc_port_command_xlat_right_click_is_click(void);
extern "C" Int cnc_port_command_xlat_right_click_down_time(void);
extern "C" Int cnc_port_command_xlat_right_click_up_time(void);
extern "C" Int cnc_port_command_xlat_move_issue_count(void);
extern "C" Int cnc_port_command_xlat_move_append_count(void);
extern "C" Int cnc_port_command_xlat_move_last_msg_type(void);
extern "C" Int cnc_port_command_xlat_move_last_command_type(void);
extern "C" Int cnc_port_command_xlat_move_last_team_exists(void);
extern "C" Real cnc_port_command_xlat_move_last_x(void);
extern "C" Real cnc_port_command_xlat_move_last_y(void);
extern "C" Real cnc_port_command_xlat_move_last_z(void);
extern "C" const char *cnc_port_last_map_preview_map_name(void);
extern "C" const char *cnc_port_last_map_preview_tga_name(void);
extern "C" const char *cnc_port_last_map_preview_portable_name(void);
extern "C" const char *cnc_port_last_map_preview_image_name(void);
extern "C" const char *cnc_port_last_map_preview_dir(void);
extern "C" const char *cnc_port_last_map_preview_output_path(void);
extern "C" Int cnc_port_last_map_preview_file_size(void);
extern "C" Int cnc_port_last_map_preview_found_existing(void);
extern "C" Int cnc_port_last_map_preview_source_open_ok(void);
extern "C" Int cnc_port_last_map_preview_create_dir_ok(void);
extern "C" Int cnc_port_last_map_preview_copy_ok(void);
extern "C" Int cnc_port_last_map_preview_image_created(void);
extern "C" Int cnc_port_last_map_preview_returned_image(void);
extern void W3DMainMenuInit(WindowLayout *layout, void *userData);

static std::string g_last_engine_update_target;
static std::string g_engine_update_breakpoint;
static std::string g_last_game_logic_step;
static std::string g_game_logic_breakpoint;
static std::string g_last_script_phase;
static std::string g_last_script_name;
static int g_last_script_player_index = -1;
static int g_last_script_side_index = -1;
static int g_last_script_condition_type = -1;
static int g_last_script_action_type = -1;
static unsigned int g_frame_texture_apply_count = 0;
static unsigned int g_frame_missing_texture_apply_count = 0;
// ADD-ONLY Stage-1 diagnostic counters, incremented by W3DCommandBarBackgroundDraw.
unsigned long cnc_port_cb_bg_reached_drawbackground = 0;
unsigned long cnc_port_cb_bg_called = 0;
unsigned long cnc_port_cb_bg_man_ok = 0;
unsigned long cnc_port_cb_bg_win_ok = 0;
unsigned long cnc_port_cb_left_hud_draw_called = 0;
static std::string g_frame_first_missing_texture_name;
static std::string g_frame_first_missing_texture_path;
static std::string g_frame_last_missing_texture_name;
static std::string g_frame_last_missing_texture_path;
static std::vector<std::string> g_frame_missing_texture_samples;
struct FrameTextureLabel {
	unsigned int texture_id = 0;
	unsigned int stage = 0;
	std::string name;
	std::string path;
	bool missing = false;
};
static std::vector<FrameTextureLabel> g_frame_texture_labels;

struct EngineFrameProfileBucket {
	std::string name;
	int samples = 0;
	double total_ms = 0.0;
	double max_ms = 0.0;
};

static bool g_engine_frame_profile_enabled = false;
static bool g_player_runtime_diagnostics_enabled = false;
static double g_engine_frame_profile_started_ms = 0.0;
static double g_engine_frame_profile_last_mark_ms = 0.0;
static int g_engine_frame_profile_transitions = 0;
static int g_engine_frame_profile_sorted_draw_submit_depth = 0;
static std::string g_engine_frame_profile_last_label;
static std::string g_engine_frame_profile_sorted_draw_submit_label;
static std::string g_engine_frame_profile_last_producer_label;
static std::vector<EngineFrameProfileBucket> g_engine_frame_profile_buckets;
static unsigned int g_engine_frame_render2d_calls = 0;
static unsigned int g_engine_frame_render2d_draws = 0;
static unsigned int g_engine_frame_render2d_empty_calls = 0;
static unsigned int g_engine_frame_render2d_hidden_calls = 0;
static unsigned int g_engine_frame_render2d_textured_draws = 0;
static unsigned int g_engine_frame_render2d_untextured_draws = 0;
static unsigned int g_engine_frame_render2d_grayscale_draws = 0;
static unsigned int g_engine_frame_render2d_max_vertices = 0;
static unsigned int g_engine_frame_render2d_max_indices = 0;
static unsigned long g_engine_frame_render2d_vertices = 0;
static unsigned long g_engine_frame_render2d_indices = 0;
static unsigned long g_engine_frame_render2d_triangles = 0;

void reset_engine_frame_render2d_profile()
{
	g_engine_frame_render2d_calls = 0;
	g_engine_frame_render2d_draws = 0;
	g_engine_frame_render2d_empty_calls = 0;
	g_engine_frame_render2d_hidden_calls = 0;
	g_engine_frame_render2d_textured_draws = 0;
	g_engine_frame_render2d_untextured_draws = 0;
	g_engine_frame_render2d_grayscale_draws = 0;
	g_engine_frame_render2d_max_vertices = 0;
	g_engine_frame_render2d_max_indices = 0;
	g_engine_frame_render2d_vertices = 0;
	g_engine_frame_render2d_indices = 0;
	g_engine_frame_render2d_triangles = 0;
}

void append_engine_frame_profile_json_string(std::string &json, const std::string &value)
{
	for (char c : value) {
		switch (c) {
		case '"': json += "\\\""; break;
		case '\\': json += "\\\\"; break;
		case '\n': json += "\\n"; break;
		case '\r': json += "\\r"; break;
		case '\t': json += "\\t"; break;
		default:
			if (static_cast<unsigned char>(c) < 0x20) {
				char buf[8];
				std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned char>(c));
				json += buf;
			} else {
				json += c;
			}
			break;
		}
	}
}

void add_engine_frame_profile_sample(const std::string &label, double elapsed_ms)
{
	if (!g_engine_frame_profile_enabled || elapsed_ms < 0.0) {
		return;
	}
	const std::string &safe_label = label.empty() ? g_engine_frame_profile_last_label : label;
	for (std::vector<EngineFrameProfileBucket>::iterator it = g_engine_frame_profile_buckets.begin();
		it != g_engine_frame_profile_buckets.end(); ++it) {
		if (it->name == safe_label) {
			++it->samples;
			it->total_ms += elapsed_ms;
			if (elapsed_ms > it->max_ms) {
				it->max_ms = elapsed_ms;
			}
			return;
		}
	}
	EngineFrameProfileBucket bucket;
	bucket.name = safe_label;
	bucket.samples = 1;
	bucket.total_ms = elapsed_ms;
	bucket.max_ms = elapsed_ms;
	g_engine_frame_profile_buckets.push_back(bucket);
}

bool is_engine_frame_profile_internal_draw_marker(const std::string &label)
{
	return label.rfind("WasmD3D8.", 0) == 0 ||
		label.rfind("DX8Wrapper.", 0) == 0 ||
		label.rfind("frame.", 0) == 0;
}

void reset_engine_frame_profile()
{
	if (!g_engine_frame_profile_enabled) {
		return;
	}
	reset_engine_frame_render2d_profile();
	g_engine_frame_profile_buckets.clear();
	g_engine_frame_profile_started_ms = emscripten_get_now();
	g_engine_frame_profile_last_mark_ms = g_engine_frame_profile_started_ms;
	g_engine_frame_profile_transitions = 0;
	g_engine_frame_profile_sorted_draw_submit_depth = 0;
	g_engine_frame_profile_sorted_draw_submit_label.clear();
	g_engine_frame_profile_last_label = "frame.start";
	g_engine_frame_profile_last_producer_label.clear();
}

void note_engine_frame_profile_marker(const char *name)
{
	if (!g_engine_frame_profile_enabled) {
		return;
	}
	const double now_ms = emscripten_get_now();
	if (!g_engine_frame_profile_last_label.empty()) {
		add_engine_frame_profile_sample(
			g_engine_frame_profile_last_label,
			now_ms - g_engine_frame_profile_last_mark_ms);
	}
	g_engine_frame_profile_last_label = name != nullptr ? name : "(null)";
	if (!is_engine_frame_profile_internal_draw_marker(g_engine_frame_profile_last_label)) {
		g_engine_frame_profile_last_producer_label = g_engine_frame_profile_last_label;
	}
	g_engine_frame_profile_last_mark_ms = now_ms;
	++g_engine_frame_profile_transitions;
}

void finish_engine_frame_profile()
{
	if (!g_engine_frame_profile_enabled || g_engine_frame_profile_last_label.empty()) {
		return;
	}
	const double now_ms = emscripten_get_now();
	add_engine_frame_profile_sample(
		g_engine_frame_profile_last_label,
		now_ms - g_engine_frame_profile_last_mark_ms);
	g_engine_frame_profile_last_mark_ms = now_ms;
	g_engine_frame_profile_last_label = "frame.complete";
}

void append_engine_frame_render2d_json(std::string &json)
{
	json += ",\"render2D\":{";
	json += "\"calls\":" + std::to_string(g_engine_frame_render2d_calls);
	json += ",\"draws\":" + std::to_string(g_engine_frame_render2d_draws);
	json += ",\"emptyCalls\":" + std::to_string(g_engine_frame_render2d_empty_calls);
	json += ",\"hiddenCalls\":" + std::to_string(g_engine_frame_render2d_hidden_calls);
	json += ",\"texturedDraws\":" + std::to_string(g_engine_frame_render2d_textured_draws);
	json += ",\"untexturedDraws\":" + std::to_string(g_engine_frame_render2d_untextured_draws);
	json += ",\"grayscaleDraws\":" + std::to_string(g_engine_frame_render2d_grayscale_draws);
	json += ",\"vertices\":" + std::to_string(g_engine_frame_render2d_vertices);
	json += ",\"indices\":" + std::to_string(g_engine_frame_render2d_indices);
	json += ",\"triangles\":" + std::to_string(g_engine_frame_render2d_triangles);
	json += ",\"maxVertices\":" + std::to_string(g_engine_frame_render2d_max_vertices);
	json += ",\"maxIndices\":" + std::to_string(g_engine_frame_render2d_max_indices);
	json += "}";
}

void append_engine_frame_profile_json(std::string &json)
{
	json += ",\"profile\":{\"enabled\":";
	json += g_engine_frame_profile_enabled ? "true" : "false";
	if (!g_engine_frame_profile_enabled) {
		json += "}";
		return;
	}
	char number[128];
	const double elapsed_ms = g_engine_frame_profile_last_mark_ms - g_engine_frame_profile_started_ms;
	append_engine_frame_render2d_json(json);
	std::snprintf(number, sizeof(number),
		",\"transitionCount\":%d,\"elapsedMs\":%.3f,\"bucketCount\":%zu,\"top\":[",
		g_engine_frame_profile_transitions,
		elapsed_ms,
		g_engine_frame_profile_buckets.size());
	json += number;

	std::vector<int> emitted;
	const int bucket_limit = 32;
	for (int output_index = 0; output_index < bucket_limit; ++output_index) {
		int best_index = -1;
		double best_ms = -1.0;
		for (int i = 0; i < static_cast<int>(g_engine_frame_profile_buckets.size()); ++i) {
			bool already_emitted = false;
			for (std::vector<int>::const_iterator it = emitted.begin(); it != emitted.end(); ++it) {
				if (*it == i) {
					already_emitted = true;
					break;
				}
			}
			if (already_emitted) {
				continue;
			}
			if (g_engine_frame_profile_buckets[i].total_ms > best_ms) {
				best_ms = g_engine_frame_profile_buckets[i].total_ms;
				best_index = i;
			}
		}
		if (best_index < 0 || best_ms <= 0.0) {
			break;
		}
		const EngineFrameProfileBucket &bucket = g_engine_frame_profile_buckets[best_index];
		if (!emitted.empty()) {
			json += ",";
		}
		std::snprintf(number, sizeof(number),
			"{\"samples\":%d,\"totalMs\":%.3f,\"maxMs\":%.3f,\"name\":\"",
			bucket.samples,
			bucket.total_ms,
			bucket.max_ms);
		json += number;
		append_engine_frame_profile_json_string(json, bucket.name);
		json += "\"}";
		emitted.push_back(best_index);
	}
	json += "]}";
}

extern "C" void cnc_port_note_engine_update_target(const char *name)
{
	g_last_engine_update_target = name != nullptr ? name : "";
	note_engine_frame_profile_marker(name);
	if (!g_engine_update_breakpoint.empty()
		&& g_last_engine_update_target == g_engine_update_breakpoint) {
		throw "cnc_port_engine_update_target_breakpoint";
	}
}

extern "C" void cnc_port_note_engine_profile_marker(const char *name)
{
	note_engine_frame_profile_marker(name);
}

extern "C" const char *cnc_port_current_engine_profile_marker()
{
	return g_engine_frame_profile_last_label.empty() ? "" : g_engine_frame_profile_last_label.c_str();
}

extern "C" int cnc_port_is_engine_frame_profile_enabled()
{
	return g_engine_frame_profile_enabled ? 1 : 0;
}

extern "C" void cnc_port_note_render2d_render(
	int vertex_count,
	int index_count,
	int textured,
	int grayscale,
	int hidden)
{
	if (!g_engine_frame_profile_enabled) {
		return;
	}
	++g_engine_frame_render2d_calls;
	const unsigned int vertices = vertex_count > 0 ? static_cast<unsigned int>(vertex_count) : 0u;
	const unsigned int indices = index_count > 0 ? static_cast<unsigned int>(index_count) : 0u;
	if (indices == 0) {
		++g_engine_frame_render2d_empty_calls;
	}
	if (hidden != 0) {
		++g_engine_frame_render2d_hidden_calls;
	}
	if (indices == 0 || hidden != 0) {
		return;
	}

	++g_engine_frame_render2d_draws;
	g_engine_frame_render2d_vertices += vertices;
	g_engine_frame_render2d_indices += indices;
	g_engine_frame_render2d_triangles += indices / 3u;
	if (textured != 0) {
		++g_engine_frame_render2d_textured_draws;
	} else {
		++g_engine_frame_render2d_untextured_draws;
	}
	if (grayscale != 0) {
		++g_engine_frame_render2d_grayscale_draws;
	}
	if (vertices > g_engine_frame_render2d_max_vertices) {
		g_engine_frame_render2d_max_vertices = vertices;
	}
	if (indices > g_engine_frame_render2d_max_indices) {
		g_engine_frame_render2d_max_indices = indices;
	}
}

extern "C" void cnc_port_begin_sorted_draw_submit_profile_scope()
{
	if (g_engine_frame_profile_enabled) {
		if (g_engine_frame_profile_sorted_draw_submit_depth == 0) {
			g_engine_frame_profile_sorted_draw_submit_label =
				g_engine_frame_profile_last_producer_label.empty()
					? g_engine_frame_profile_last_label
					: g_engine_frame_profile_last_producer_label;
		}
		++g_engine_frame_profile_sorted_draw_submit_depth;
	}
}

extern "C" void cnc_port_end_sorted_draw_submit_profile_scope()
{
	if (g_engine_frame_profile_sorted_draw_submit_depth > 0) {
		--g_engine_frame_profile_sorted_draw_submit_depth;
		if (g_engine_frame_profile_sorted_draw_submit_depth == 0) {
			g_engine_frame_profile_sorted_draw_submit_label.clear();
		}
	}
}

extern "C" int cnc_port_is_sorted_draw_submit_profile_scope()
{
	return g_engine_frame_profile_enabled && g_engine_frame_profile_sorted_draw_submit_depth > 0 ? 1 : 0;
}

extern "C" const char *cnc_port_current_sorted_draw_submit_profile_marker()
{
	return g_engine_frame_profile_sorted_draw_submit_label.empty()
		? ""
		: g_engine_frame_profile_sorted_draw_submit_label.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE void cnc_port_real_engine_set_frame_profile(int enabled)
{
	g_engine_frame_profile_enabled = enabled != 0;
	if (!g_engine_frame_profile_enabled) {
		g_engine_frame_profile_buckets.clear();
		g_engine_frame_profile_last_label.clear();
		g_engine_frame_profile_sorted_draw_submit_label.clear();
		g_engine_frame_profile_last_producer_label.clear();
		g_engine_frame_profile_started_ms = 0.0;
		g_engine_frame_profile_last_mark_ms = 0.0;
		g_engine_frame_profile_transitions = 0;
		g_engine_frame_profile_sorted_draw_submit_depth = 0;
		reset_engine_frame_render2d_profile();
	}
}

extern "C" EMSCRIPTEN_KEEPALIVE void cnc_port_real_engine_set_player_diagnostics(int enabled)
{
	g_player_runtime_diagnostics_enabled = enabled != 0;
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
	if (g_last_game_logic_step.rfind("GameEngine.init.", 0) == 0
		|| g_last_game_logic_step.rfind("GameLogic.reset.", 0) == 0
		|| g_last_game_logic_step.rfind("W3DTerrainLogic.reset.", 0) == 0
		|| g_last_game_logic_step.rfind("TerrainLogic.reset.", 0) == 0
		|| g_last_game_logic_step.rfind("SidesList.", 0) == 0
		|| g_last_game_logic_step.rfind("SidesInfo.", 0) == 0) {
		std::printf("cnc-port: real-init step %s\n", g_last_game_logic_step.c_str());
		std::fflush(stdout);
	}
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

extern "C" void cnc_port_note_script_step(
	const char *phase,
	const char *script_name,
	int player_index,
	int side_index,
	int condition_type,
	int action_type)
{
	g_last_script_phase = phase != nullptr ? phase : "";
	g_last_script_name = script_name != nullptr ? script_name : "";
	g_last_script_player_index = player_index;
	g_last_script_side_index = side_index;
	g_last_script_condition_type = condition_type;
	g_last_script_action_type = action_type;
}

extern "C" void cnc_port_note_texture_apply(
	unsigned int stage,
	unsigned int texture_id,
	const char *name,
	const char *full_path,
	int missing)
{
	++g_frame_texture_apply_count;
	const char *texture_name_c = name != nullptr ? name : "";
	const char *texture_path_c = full_path != nullptr ? full_path : "";
	if (texture_id != 0) {
		bool updated = false;
		for (FrameTextureLabel &label : g_frame_texture_labels) {
			if (label.texture_id == texture_id) {
				label.stage = stage;
				label.missing = missing != 0;
				updated = true;
				break;
			}
		}
		if (!updated && g_frame_texture_labels.size() < 512) {
			FrameTextureLabel label;
			label.texture_id = texture_id;
			label.stage = stage;
			label.name = texture_name_c;
			label.path = texture_path_c;
			label.missing = missing != 0;
			g_frame_texture_labels.push_back(label);
		}
	}
	if (!missing) {
		return;
	}

	++g_frame_missing_texture_apply_count;
	const std::string texture_name = texture_name_c;
	const std::string texture_path = texture_path_c;
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
// Opt-in only: default boots stay -noshellmap so harness expectations hold;
// the human play page can request the original ShellMapMD menu background.
static bool g_use_shell_map = false;

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

std::string unicode_to_debug_ascii(const UnicodeString &value)
{
	AsciiString ascii;
	ascii.translate(value);
	return ascii.str() != NULL ? ascii.str() : "";
}

void append_military_subtitle_json(std::string &json)
{
	json += ",\"militarySubtitle\":{";
	if (TheInGameUI == NULL || !TheInGameUI->debugMilitarySubtitleActive()) {
		json += "\"active\":false,\"fullLength\":0,\"index\":0,\"finished\":false,"
			"\"lifetime\":0,\"incrementOnFrame\":0,\"lineCount\":0,"
			"\"fullText\":\"\",\"lines\":[]}";
		return;
	}

	const UnsignedInt full_length = TheInGameUI->debugMilitarySubtitleLength();
	const UnsignedInt index = TheInGameUI->debugMilitarySubtitleIndex();
	const UnsignedInt line_count = TheInGameUI->debugMilitarySubtitleCurrentLineCount();
	json += "\"active\":true";
	json += ",\"fullLength\":" + std::to_string(full_length);
	json += ",\"index\":" + std::to_string(index);
	json += ",\"finished\":";
	json += index >= full_length ? "true" : "false";
	json += ",\"lifetime\":" + std::to_string(TheInGameUI->debugMilitarySubtitleLifetime());
	json += ",\"incrementOnFrame\":" +
		std::to_string(TheInGameUI->debugMilitarySubtitleIncrementOnFrame());
	json += ",\"lineCount\":" + std::to_string(line_count);
	json += ",\"fullText\":\"" +
		json_escape(unicode_to_debug_ascii(TheInGameUI->debugMilitarySubtitleText())) + "\"";
	json += ",\"lines\":[";
	for (UnsignedInt line = 0; line < line_count; ++line) {
		if (line != 0) {
			json += ",";
		}
		const std::string text =
			unicode_to_debug_ascii(TheInGameUI->debugMilitarySubtitleLine(static_cast<Int>(line)));
		json += "{\"index\":" + std::to_string(line);
		json += ",\"length\":" + std::to_string(text.size());
		json += ",\"text\":\"" + json_escape(text) + "\"}";
	}
	json += "]}";
}

std::string script_diag_action_name(int action_type);
std::string script_diag_condition_name(int condition_type);

void append_last_script_step_json(std::string &json)
{
	json += ",\"lastScriptStep\":{";
	json += "\"phase\":\"" + json_escape(g_last_script_phase) + "\"";
	json += ",\"script\":\"" + json_escape(g_last_script_name) + "\"";
	json += ",\"playerIndex\":" + std::to_string(g_last_script_player_index);
	json += ",\"sideIndex\":" + std::to_string(g_last_script_side_index);
	json += ",\"conditionType\":" + std::to_string(g_last_script_condition_type);
	json += ",\"conditionName\":\"" + json_escape(script_diag_condition_name(g_last_script_condition_type)) + "\"";
	json += ",\"actionType\":" + std::to_string(g_last_script_action_type);
	json += ",\"actionName\":\"" + json_escape(script_diag_action_name(g_last_script_action_type)) + "\"";
	json += "}";
}

const char *build_state_json()
{
	std::string json = "{";
	json += "\"attempted\":";
	json += g_state.attempted ? "true" : "false";
	json += ",\"source\":\"GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp::init\"";
	json += ",\"factory\":\"GeneralsMD/Code/Main/WinMain.cpp::CreateGameEngine\"";
	json += ",\"commandLine\":\"";
	json += g_use_shell_map ? "-win" : "-noshellmap -win";
	json += "\"";
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
	json += ",\"lastGameLogicStep\":\"" + json_escape(g_last_game_logic_step) + "\"";
	json += "}";
	g_state_json = json;
	return g_state_json.c_str();
}

} // namespace

// Called by the real SubsystemInterfaceList::initSubsystem()
// (GameEngine/Source/Common/System/SubsystemInterface.cpp) for every
// subsystem GameEngine::init() brings up. phase 0 = starting (about to run
// sys->init() + its INI loads), phase 1 = completed, phase 2/3 = vector append.
extern "C" void cnc_port_note_subsystem_init(const char *name, int phase)
{
	const char *safe_name = name != nullptr ? name : "(unnamed)";
	if (phase == 0) {
		g_state.in_flight = safe_name;
		std::printf("cnc-port: real-init subsystem-start %s\n", safe_name);
	} else if (phase == 1) {
		g_state.in_flight.clear();
		g_state.completed.push_back(safe_name);
		if (std::strcmp(safe_name, "TheFunctionLexicon") == 0) {
			wasm_function_lexicon_repair_gameplay_callback_owners();
		}
		std::printf("cnc-port: real-init subsystem-done %s\n", safe_name);
	} else if (phase == 2) {
		g_last_game_logic_step = std::string("SubsystemInterfaceList.initSubsystem.push.before:") + safe_name;
		std::printf("cnc-port: real-init subsystem-push-before %s\n", safe_name);
	} else if (phase == 3) {
		g_last_game_logic_step = std::string("SubsystemInterfaceList.initSubsystem.push.after:") + safe_name;
		std::printf("cnc-port: real-init subsystem-push-after %s\n", safe_name);
	} else if (phase == 4) {
		g_last_game_logic_step = std::string("SubsystemInterfaceList.initSubsystem.ini.after:") + safe_name;
		std::printf("cnc-port: real-init subsystem-ini-after %s\n", safe_name);
	} else if (phase == 5) {
		g_last_game_logic_step = std::string("SubsystemInterfaceList.reset.before:") + safe_name;
		std::printf("cnc-port: real-init subsystem-reset-before %s\n", safe_name);
	} else if (phase == 6) {
		g_last_game_logic_step = std::string("SubsystemInterfaceList.reset.after:") + safe_name;
		std::printf("cnc-port: real-init subsystem-reset-after %s\n", safe_name);
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
DrawableID g_probe_laser_drawable_id = INVALID_DRAWABLE_ID;

void reset_frame_texture_diagnostics()
{
	g_frame_texture_apply_count = 0;
	g_frame_missing_texture_apply_count = 0;
	g_frame_first_missing_texture_name.clear();
	g_frame_first_missing_texture_path.clear();
	g_frame_last_missing_texture_name.clear();
	g_frame_last_missing_texture_path.clear();
	g_frame_missing_texture_samples.clear();
	g_frame_texture_labels.clear();
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
	json += "],\"labels\":[";
	for (std::size_t i = 0; i < g_frame_texture_labels.size(); ++i) {
		if (i != 0) {
			json += ",";
		}
		const FrameTextureLabel &label = g_frame_texture_labels[i];
		json += "{";
		json += "\"id\":" + std::to_string(label.texture_id);
		json += ",\"stage\":" + std::to_string(label.stage);
		json += ",\"name\":\"" + json_escape(label.name) + "\"";
		json += ",\"path\":\"" + json_escape(label.path) + "\"";
		json += ",\"missing\":";
		json += label.missing ? "true" : "false";
		json += "}";
	}
	json += "]}";
}

void append_d3d8_draw_cache_json(std::string &json)
{
	const WasmD3D8ShimState *d3d8_state = wasm_d3d8_get_state();
	json += ",\"d3d8DrawCache\":{";
	json += "\"derivedStateHits\":" +
		std::to_string(d3d8_state != NULL ? d3d8_state->draw_derived_state_cache_hits : 0);
	json += ",\"derivedStateMisses\":" +
		std::to_string(d3d8_state != NULL ? d3d8_state->draw_derived_state_cache_misses : 0);
	json += ",\"bufferChecksumHits\":" +
		std::to_string(d3d8_state != NULL ? d3d8_state->draw_buffer_checksum_cache_hits : 0);
	json += ",\"bufferChecksumMisses\":" +
		std::to_string(d3d8_state != NULL ? d3d8_state->draw_buffer_checksum_cache_misses : 0);
	json += "}";
}

void append_coord3d_fields(
	std::string &json,
	const char *field_name,
	const Coord3D &coord)
{
	char buffer[160];
	std::snprintf(
		buffer,
		sizeof(buffer),
		",\"%s\":{\"x\":%.6f,\"y\":%.6f,\"z\":%.6f}",
		field_name,
		coord.x,
		coord.y,
		coord.z);
	json += buffer;
}

void append_real_view_state(std::string &json)
{
	json += ",\"view\":{";
	json += "\"ready\":";
	json += TheTacticalView != NULL ? "true" : "false";
	if (TheTacticalView == NULL) {
		json += ",\"origin\":null,\"size\":null,\"position\":null,"
			"\"cameraPosition\":null,\"zoom\":null,\"pitch\":null,"
			"\"angle\":null,\"fieldOfView\":null,"
			"\"terrainHeightUnderCamera\":null,"
			"\"currentHeightAboveGround\":null,"
			"\"heightAboveGround\":null,\"cameraMovementFinished\":null,"
			"\"timeFrozen\":null,\"timeMultiplier\":null,"
			"\"cameraLock\":null,\"zoomLimited\":null}";
		return;
	}

	Int origin_x = 0;
	Int origin_y = 0;
	TheTacticalView->getOrigin(&origin_x, &origin_y);
	Coord3D position = { 0.0f, 0.0f, 0.0f };
	TheTacticalView->getPosition(&position);
	const Coord3D &camera_position = TheTacticalView->get3DCameraPosition();
	char buffer[512];
	std::snprintf(
		buffer,
		sizeof(buffer),
		",\"origin\":{\"x\":%d,\"y\":%d}"
		",\"size\":{\"width\":%d,\"height\":%d}"
		",\"zoom\":%.6f,\"pitch\":%.6f,\"angle\":%.6f"
		",\"fieldOfView\":%.6f"
		",\"terrainHeightUnderCamera\":%.6f"
		",\"currentHeightAboveGround\":%.6f"
		",\"heightAboveGround\":%.6f",
		origin_x,
		origin_y,
		TheTacticalView->getWidth(),
		TheTacticalView->getHeight(),
		TheTacticalView->getZoom(),
		TheTacticalView->getPitch(),
		TheTacticalView->getAngle(),
		TheTacticalView->getFieldOfView(),
		TheTacticalView->getTerrainHeightUnderCamera(),
		TheTacticalView->getCurrentHeightAboveGround(),
		TheTacticalView->getHeightAboveGround());
	json += buffer;
	append_coord3d_fields(json, "position", position);
	append_coord3d_fields(json, "cameraPosition", camera_position);
	json += ",\"cameraMovementFinished\":";
	json += TheTacticalView->isCameraMovementFinished() ? "true" : "false";
	json += ",\"timeFrozen\":";
	json += TheTacticalView->isTimeFrozen() ? "true" : "false";
	json += ",\"timeMultiplier\":" +
		std::to_string(TheTacticalView->getTimeMultiplier());
	json += ",\"cameraLock\":" +
		std::to_string(static_cast<Int>(TheTacticalView->getCameraLock()));
	json += ",\"zoomLimited\":";
	json += TheTacticalView->isZoomLimited() ? "true" : "false";
	json += "}";
}

void append_real_particle_state(std::string &json)
{
	json += ",\"particles\":{";
	json += "\"managerReady\":";
	json += TheParticleSystemManager != NULL ? "true" : "false";
	if (TheParticleSystemManager == NULL) {
		json += ",\"systemCount\":0,\"particleCount\":0,\"fieldParticleCount\":0,"
			"\"onScreenParticleCount\":0,\"samples\":[]}";
		return;
	}

	json += ",\"systemCount\":" +
		std::to_string(TheParticleSystemManager->getParticleSystemCount());
	json += ",\"particleCount\":" +
		std::to_string(TheParticleSystemManager->getParticleCount());
	json += ",\"fieldParticleCount\":" +
		std::to_string(TheParticleSystemManager->getFieldParticleCount());
	json += ",\"onScreenParticleCount\":" +
		std::to_string(TheParticleSystemManager->getOnScreenParticleCount());
	json += ",\"heatEffectsEnabled\":";
	json += (TheGlobalData != NULL && TheGlobalData->m_useHeatEffects) ? "true" : "false";
	json += ",\"smudgeManagerReady\":";
	json += TheSmudgeManager != NULL ? "true" : "false";
	json += ",\"smudgeCountLastFrame\":" +
		std::to_string(TheSmudgeManager != NULL ?
			TheSmudgeManager->getSmudgeCountLastFrame() : 0);
	json += ",\"samples\":[";
	ParticleSystemManager::ParticleSystemList &systems =
		TheParticleSystemManager->getAllParticleSystems();
	std::size_t emitted = 0;
	for (ParticleSystemManager::ParticleSystemListIt it = systems.begin();
		it != systems.end() && emitted < 8; ++it) {
		ParticleSystem *system = *it;
		if (system == NULL) {
			continue;
		}
		if (emitted != 0) {
			json += ",";
		}
		const ParticleSystemTemplate *templ = system->getTemplate();
		Coord3D pos = { 0.0f, 0.0f, 0.0f };
		system->getPosition(&pos);
		json += "{";
		json += "\"id\":" + std::to_string(static_cast<Int>(system->getSystemID()));
		json += ",\"template\":\"" +
			json_escape(templ != NULL ? templ->getName().str() : "") + "\"";
		json += ",\"particleType\":\"" +
			json_escape(system->getParticleTypeName().str()) + "\"";
		json += ",\"particleCount\":" +
			std::to_string(system->getParticleCount());
		json += ",\"startFrame\":" +
			std::to_string(static_cast<unsigned long long>(system->getStartFrame()));
		json += ",\"destroyed\":";
		json += system->isDestroyed() ? "true" : "false";
		json += ",\"usingDrawables\":";
		json += system->isUsingDrawables() ? "true" : "false";
		json += ",\"usingStreak\":";
		json += system->isUsingStreak() ? "true" : "false";
		append_coord3d_fields(json, "position", pos);
		json += "}";
		++emitted;
	}
	json += "]}";
}

const char *cell_shroud_status_name(CellShroudStatus status)
{
	switch (status) {
		case CELLSHROUD_CLEAR:
			return "clear";
		case CELLSHROUD_FOGGED:
			return "fogged";
		case CELLSHROUD_SHROUDED:
			return "shrouded";
		default:
			return "unknown";
	}
}

Int expected_shroud_visual_level(CellShroudStatus status)
{
	if (TheGlobalData == NULL) {
		return -1;
	}

	Int level = TheGlobalData->m_clearAlpha;
	if (status == CELLSHROUD_SHROUDED) {
		level = TheGlobalData->m_shroudAlpha;
	} else if (status == CELLSHROUD_FOGGED) {
		level = TheGlobalData->m_fogAlpha;
	}
	if (level < TheGlobalData->m_shroudAlpha) {
		level = TheGlobalData->m_shroudAlpha;
	}
	return level;
}

Bool shroud_level_matches(Int visual_level, Int expected_level)
{
	if (visual_level < 0 || expected_level < 0) {
		return FALSE;
	}
	Int delta = visual_level - expected_level;
	if (delta < 0) {
		delta = -delta;
	}
	return delta <= 4;
}

void append_shroud_cell_sample(
	std::string &json,
	const char *name,
	Int cell_x,
	Int cell_y,
	Int local_player_index,
	Int partition_cells_x,
	Int partition_cells_y,
	W3DShroud *visual_shroud,
	Bool &first)
{
	if (!first) {
		json += ",";
	}
	first = FALSE;

	const Bool in_partition =
		ThePartitionManager != NULL &&
		cell_x >= 0 &&
		cell_y >= 0 &&
		cell_x < partition_cells_x &&
		cell_y < partition_cells_y;
	const Bool in_visual =
		visual_shroud != NULL &&
		cell_x >= 0 &&
		cell_y >= 0 &&
		cell_x < visual_shroud->getNumShroudCellsX() &&
		cell_y < visual_shroud->getNumShroudCellsY();

	json += "{";
	json += "\"name\":\"" + json_escape(name != NULL ? name : "") + "\"";
	json += ",\"cell\":{\"x\":" + std::to_string(cell_x);
	json += ",\"y\":" + std::to_string(cell_y) + "}";
	json += ",\"inPartition\":";
	json += in_partition ? "true" : "false";
	json += ",\"inVisual\":";
	json += in_visual ? "true" : "false";

	if (in_partition) {
		Real world_x = 0.0f;
		Real world_y = 0.0f;
		ThePartitionManager->getCellCenterPos(cell_x, cell_y, world_x, world_y);
		char buffer[192];
		std::snprintf(
			buffer,
			sizeof(buffer),
			",\"world\":{\"x\":%.6f,\"y\":%.6f}",
			world_x,
			world_y);
		json += buffer;

		const CellShroudStatus status =
			ThePartitionManager->getShroudStatusForPlayer(
				local_player_index,
				cell_x,
				cell_y);
		const Int expected_level = expected_shroud_visual_level(status);
		json += ",\"logicStatus\":" + std::to_string(static_cast<Int>(status));
		json += ",\"logicStatusName\":\"" +
			json_escape(cell_shroud_status_name(status)) + "\"";
		json += ",\"expectedLevel\":" + std::to_string(expected_level);

		if (in_visual) {
			const Int visual_level = visual_shroud->getShroudLevel(cell_x, cell_y);
			json += ",\"visualLevel\":" + std::to_string(visual_level);
			json += ",\"visualMatchesExpected\":";
			json += shroud_level_matches(visual_level, expected_level) ? "true" : "false";
		} else {
			json += ",\"visualLevel\":null,\"visualMatchesExpected\":null";
		}
	} else {
		json += ",\"world\":null,\"logicStatus\":null,"
			"\"logicStatusName\":null,\"expectedLevel\":null,"
			"\"visualLevel\":null,\"visualMatchesExpected\":null";
	}

	json += "}";
}

void append_shroud_state(std::string &json)
{
	const Bool gameplay_ready =
		TheGameLogic != NULL &&
		TheGameLogic->isInGame() &&
		!TheGameLogic->isLoadingMap();
	Player *local_player = ThePlayerList != NULL ? ThePlayerList->getLocalPlayer() : NULL;
	const Int local_player_index =
		local_player != NULL ? local_player->getPlayerIndex() : -1;
	BaseHeightMapRenderObjClass *terrain = TheTerrainRenderObject;
	W3DShroud *visual_shroud =
		terrain != NULL ? terrain->getShroud() : NULL;
	TextureClass *shroud_texture =
		visual_shroud != NULL ? visual_shroud->getShroudTexture() : NULL;

	json += ",\"shroud\":{";
	json += "\"gameplayReady\":";
	json += gameplay_ready ? "true" : "false";
	json += ",\"globalDataReady\":";
	json += TheGlobalData != NULL ? "true" : "false";
	if (TheGlobalData != NULL) {
		json += ",\"shroudOn\":";
#if defined(_DEBUG) || defined(_INTERNAL)
		json += TheGlobalData->m_shroudOn ? "true" : "false";
#else
		json += "null";
#endif
		json += ",\"fogOfWarOn\":";
#if defined(_DEBUG) || defined(_INTERNAL)
		json += TheGlobalData->m_fogOfWarOn ? "true" : "false";
#else
		json += "null";
#endif
		json += ",\"clearAlpha\":" + std::to_string(static_cast<Int>(TheGlobalData->m_clearAlpha));
		json += ",\"fogAlpha\":" + std::to_string(static_cast<Int>(TheGlobalData->m_fogAlpha));
		json += ",\"shroudAlpha\":" + std::to_string(static_cast<Int>(TheGlobalData->m_shroudAlpha));
		json += ",\"partitionCellSize\":" + std::to_string(TheGlobalData->m_partitionCellSize);
		json += ",\"shroudColor\":" +
			std::to_string(static_cast<unsigned long long>(TheGlobalData->m_shroudColor.getAsInt()));
	} else {
		json += ",\"shroudOn\":null,\"fogOfWarOn\":null,"
			"\"clearAlpha\":null,\"fogAlpha\":null,\"shroudAlpha\":null,"
			"\"partitionCellSize\":null,\"shroudColor\":null";
	}

	const Bool partition_ready = gameplay_ready && ThePartitionManager != NULL;
	Int partition_cells_x = 0;
	Int partition_cells_y = 0;
	Real partition_cell_size = 0.0f;
	if (partition_ready) {
		partition_cells_x = ThePartitionManager->getCellCountX();
		partition_cells_y = ThePartitionManager->getCellCountY();
		partition_cell_size = ThePartitionManager->getCellSize();
	}

	json += ",\"partition\":{\"ready\":";
	json += partition_ready ? "true" : "false";
	json += ",\"localPlayerIndex\":" + std::to_string(local_player_index);
	json += ",\"cellsX\":" + std::to_string(partition_cells_x);
	json += ",\"cellsY\":" + std::to_string(partition_cells_y);
	json += ",\"cellSize\":" + std::to_string(partition_cell_size);
	json += "}";

	json += ",\"visual\":{\"terrainReady\":";
	json += terrain != NULL ? "true" : "false";
	json += ",\"mapReady\":";
	json += (terrain != NULL && terrain->getMap() != NULL) ? "true" : "false";
	json += ",\"shroudReady\":";
	json += visual_shroud != NULL ? "true" : "false";
	if (visual_shroud != NULL) {
		json += ",\"cellsX\":" + std::to_string(visual_shroud->getNumShroudCellsX());
		json += ",\"cellsY\":" + std::to_string(visual_shroud->getNumShroudCellsY());
		json += ",\"cellWidth\":" + std::to_string(visual_shroud->getCellWidth());
		json += ",\"cellHeight\":" + std::to_string(visual_shroud->getCellHeight());
		json += ",\"textureWidth\":" + std::to_string(visual_shroud->getTextureWidth());
		json += ",\"textureHeight\":" + std::to_string(visual_shroud->getTextureHeight());
		json += ",\"drawOriginX\":" + std::to_string(visual_shroud->getDrawOriginX());
		json += ",\"drawOriginY\":" + std::to_string(visual_shroud->getDrawOriginY());
		json += ",\"textureReady\":";
		json += shroud_texture != NULL ? "true" : "false";
		if (shroud_texture != NULL) {
			json += ",\"textureId\":" +
				std::to_string(static_cast<unsigned long long>(shroud_texture->Get_ID()));
			json += ",\"textureClassWidth\":" + std::to_string(shroud_texture->Get_Width());
			json += ",\"textureClassHeight\":" + std::to_string(shroud_texture->Get_Height());
			json += ",\"textureInitialized\":";
			json += shroud_texture->Is_Initialized() ? "true" : "false";
		} else {
			json += ",\"textureId\":null,\"textureClassWidth\":null,"
				"\"textureClassHeight\":null,\"textureInitialized\":null";
		}
	} else {
		json += ",\"cellsX\":0,\"cellsY\":0,\"cellWidth\":0,"
			"\"cellHeight\":0,\"textureWidth\":0,\"textureHeight\":0,"
			"\"drawOriginX\":0,\"drawOriginY\":0,\"textureReady\":false,"
			"\"textureId\":null,\"textureClassWidth\":null,"
			"\"textureClassHeight\":null,\"textureInitialized\":null";
	}
	json += "}";

	Int grid_sampled = 0;
	Int grid_clear = 0;
	Int grid_fogged = 0;
	Int grid_shrouded = 0;
	Int grid_visual_matches = 0;
	Int grid_visual_mismatches = 0;
	if (partition_ready && partition_cells_x > 0 && partition_cells_y > 0) {
		for (Int gy = 0; gy < 5; ++gy) {
			const Int y = (partition_cells_y - 1) * gy / 4;
			for (Int gx = 0; gx < 5; ++gx) {
				const Int x = (partition_cells_x - 1) * gx / 4;
				const CellShroudStatus status =
					ThePartitionManager->getShroudStatusForPlayer(
						local_player_index,
						x,
						y);
				++grid_sampled;
				if (status == CELLSHROUD_CLEAR) {
					++grid_clear;
				} else if (status == CELLSHROUD_FOGGED) {
					++grid_fogged;
				} else if (status == CELLSHROUD_SHROUDED) {
					++grid_shrouded;
				}
				if (visual_shroud != NULL &&
					x < visual_shroud->getNumShroudCellsX() &&
					y < visual_shroud->getNumShroudCellsY()) {
					const Int visual_level = visual_shroud->getShroudLevel(x, y);
					if (shroud_level_matches(
						visual_level,
						expected_shroud_visual_level(status))) {
						++grid_visual_matches;
					} else {
						++grid_visual_mismatches;
					}
				}
			}
		}
	}
	json += ",\"gridSummary\":{";
	json += "\"sampled\":" + std::to_string(grid_sampled);
	json += ",\"clear\":" + std::to_string(grid_clear);
	json += ",\"fogged\":" + std::to_string(grid_fogged);
	json += ",\"shrouded\":" + std::to_string(grid_shrouded);
	json += ",\"visualMatchesExpected\":" + std::to_string(grid_visual_matches);
	json += ",\"visualMismatches\":" + std::to_string(grid_visual_mismatches);
	json += "}";

	json += ",\"samples\":[";
	Bool first_sample = TRUE;
	if (partition_ready && partition_cells_x > 0 && partition_cells_y > 0) {
		append_shroud_cell_sample(
			json,
			"upperLeft",
			0,
			0,
			local_player_index,
			partition_cells_x,
			partition_cells_y,
			visual_shroud,
			first_sample);
		append_shroud_cell_sample(
			json,
			"center",
			partition_cells_x / 2,
			partition_cells_y / 2,
			local_player_index,
			partition_cells_x,
			partition_cells_y,
			visual_shroud,
			first_sample);
		append_shroud_cell_sample(
			json,
			"lowerRight",
			partition_cells_x - 1,
			partition_cells_y - 1,
			local_player_index,
			partition_cells_x,
			partition_cells_y,
			visual_shroud,
			first_sample);
		if (TheTacticalView != NULL) {
			Coord3D view_position = { 0.0f, 0.0f, 0.0f };
			Int view_cell_x = 0;
			Int view_cell_y = 0;
			TheTacticalView->getPosition(&view_position);
			ThePartitionManager->worldToCell(
				view_position.x,
				view_position.y,
				&view_cell_x,
				&view_cell_y);
			append_shroud_cell_sample(
				json,
				"tacticalView",
				view_cell_x,
				view_cell_y,
				local_player_index,
				partition_cells_x,
				partition_cells_y,
				visual_shroud,
				first_sample);
		}
	}
	json += "]";

	json += ",\"localObjectSamples\":[";
	Bool first_object = TRUE;
	if (partition_ready && local_player != NULL && TheGameLogic != NULL) {
		Int emitted = 0;
		for (Object *obj = TheGameLogic->getFirstObject();
			obj != NULL && emitted < 6;
			obj = obj->getNextObject()) {
			if (obj->getControllingPlayer() != local_player) {
				continue;
			}
			const Coord3D *pos = obj->getPosition();
			if (pos == NULL) {
				continue;
			}
			Int cell_x = 0;
			Int cell_y = 0;
			ThePartitionManager->worldToCell(pos->x, pos->y, &cell_x, &cell_y);
			if (!first_object) {
				json += ",";
			}
			first_object = FALSE;
			json += "{";
			json += "\"id\":" +
				std::to_string(static_cast<unsigned long long>(obj->getID()));
			const ThingTemplate *templ = obj->getTemplate();
			json += ",\"template\":\"" +
				json_escape(templ != NULL ? templ->getName().str() : "") + "\"";
			append_coord3d_fields(json, "position", *pos);
			json += ",\"cell\":{\"x\":" + std::to_string(cell_x);
			json += ",\"y\":" + std::to_string(cell_y) + "}";
			const Bool in_partition =
				cell_x >= 0 &&
				cell_y >= 0 &&
				cell_x < partition_cells_x &&
				cell_y < partition_cells_y;
			if (in_partition) {
				const CellShroudStatus status =
					ThePartitionManager->getShroudStatusForPlayer(
						local_player_index,
						cell_x,
						cell_y);
				json += ",\"logicStatus\":" + std::to_string(static_cast<Int>(status));
				json += ",\"logicStatusName\":\"" +
					json_escape(cell_shroud_status_name(status)) + "\"";
				if (visual_shroud != NULL &&
					cell_x < visual_shroud->getNumShroudCellsX() &&
					cell_y < visual_shroud->getNumShroudCellsY()) {
					json += ",\"visualLevel\":" +
						std::to_string(static_cast<Int>(
							visual_shroud->getShroudLevel(cell_x, cell_y)));
				} else {
					json += ",\"visualLevel\":null";
				}
			} else {
				json += ",\"logicStatus\":null,\"logicStatusName\":null,"
					"\"visualLevel\":null";
			}
			json += "}";
			++emitted;
		}
	}
	json += "]";
	json += "}";
}

const char *audio_type_name(AudioType type)
{
	switch (type) {
		case AT_Music:
			return "AT_Music";
		case AT_Streaming:
			return "AT_Streaming";
		case AT_SoundEffect:
			return "AT_SoundEffect";
	}
	return "AT_Unknown";
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
		Script *script = sequential->m_scriptToExecuteSequentially;
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

GameWindow *find_window_by_name(const char *window_name);

const char *const k_campaign_intro_counter_watches[] = {
	"CINE_MoveTo06Delay",
	"CINE_CameraCutTo04",
	"CINE_LaunchPadMoveDelay",
	"CINE_Pt2CameraLocation01Delay",
	"CINE_Pt2MoveTransportsDelay",
	"CINE_ScudSoundDelay",
	"CINE_BasePullOut01Delay",
	"CINE_BackToRocket01Delay",
	"CINE_BackToBaseDelay",
	"CINE_ZoomInMoreOnBaseDelay",
	"CINE_RocketAirShot01Delay",
	"CINE_BackToBaseYetAgainDelay",
	"CINE_ZoomInMoreOnBaseDelayAgain",
	"CINE_RocketAirShot02Delay",
	"CINE_LastBaseShotDelay",
	"CINE_BlowUp",
	"CINE_FlashWhiteDelay",
	"CINE_ReturnToPlayerStartDelay",
	"CINE_ReturnToPlayerStartDelay_2",
	"Give it back",
};

const char *const k_campaign_intro_flag_watches[] = {
	"INTRO_DONE",
	"Inside Base",
	"Mission_Phase_Three",
};

const char *const k_campaign_intro_script_watches[] = {
	"CINE_CameraMoveTo06",
	"CINE_CameraCutTo04",
	"CINE_LaunchPad & BuggiesMove",
	"CINE_BasePos01",
	"CINE_MoveTransports",
	"CINE_BasePanTo01",
	"CINE_BackToUSBase",
	"CINE_ZoomInMoreOnBase",
	"CINE_BackToBaseYetAgain & DeleteRocketAir01",
	"CINE_ZoomInMoreOnBaseAgain",
	"CINE_LastBaseShot",
	"CINE_FlashWhite",
	"CINE_ReturnToPlayerLocation",
	"CINE_ReturnToPlayerLocation C",
	"Start_Mission_Intro",
	"Start_Mission_Intro SS1",
	"Give Player The Game",
	"ReturnToPlayerControl",
};

const TCounter *find_script_counter(const char *name)
{
	if (TheScriptEngine == NULL || name == NULL) {
		return NULL;
	}
	const Int counter_count = TheScriptEngine->debugGetCounterCount();
	for (Int index = 1; index < counter_count; ++index) {
		const TCounter *counter = TheScriptEngine->debugGetCounterByIndex(index);
		if (counter != NULL && !counter->name.isEmpty() &&
			std::strcmp(counter->name.str(), name) == 0) {
			return counter;
		}
	}
	return NULL;
}

const TFlag *find_script_flag(const char *name)
{
	if (TheScriptEngine == NULL || name == NULL) {
		return NULL;
	}
	const Int flag_count = TheScriptEngine->debugGetFlagCount();
	for (Int index = 1; index < flag_count; ++index) {
		const TFlag *flag = TheScriptEngine->debugGetFlagByIndex(index);
		if (flag != NULL && !flag->name.isEmpty() &&
			std::strcmp(flag->name.str(), name) == 0) {
			return flag;
		}
	}
	return NULL;
}

Script *find_script_in_chain(Script *script, const char *name)
{
	for (Script *current = script; current != NULL; current = current->getNext()) {
		if (std::strcmp(current->getName().str(), name) == 0) {
			return current;
		}
	}
	return NULL;
}

Script *find_loaded_script(const char *name)
{
	if (TheSidesList == NULL || name == NULL) {
		return NULL;
	}
	const Int side_count = TheSidesList->getNumSides();
	for (Int side_index = 0; side_index < side_count; ++side_index) {
		SidesInfo *side = TheSidesList->getSideInfo(side_index);
		ScriptList *script_list = side != NULL ? side->getScriptList() : NULL;
		if (script_list == NULL) {
			continue;
		}
		if (Script *script = find_script_in_chain(script_list->getScript(), name)) {
			return script;
		}
		for (ScriptGroup *group = script_list->getScriptGroup();
			group != NULL;
			group = group->getNext()) {
			if (Script *script = find_script_in_chain(group->getScript(), name)) {
				return script;
			}
		}
	}
	return NULL;
}

bool is_campaign_intro_script_watch(const char *name)
{
	if (name == NULL) {
		return false;
	}
	for (std::size_t index = 0;
		index < sizeof(k_campaign_intro_script_watches) / sizeof(k_campaign_intro_script_watches[0]);
		++index) {
		if (std::strcmp(name, k_campaign_intro_script_watches[index]) == 0) {
			return true;
		}
	}
	return false;
}

bool is_campaign_intro_counter_watch(const char *name)
{
	if (name == NULL) {
		return false;
	}
	for (std::size_t index = 0;
		index < sizeof(k_campaign_intro_counter_watches) / sizeof(k_campaign_intro_counter_watches[0]);
		++index) {
		if (std::strcmp(name, k_campaign_intro_counter_watches[index]) == 0) {
			return true;
		}
	}
	return false;
}

struct ScriptDiagContext {
	std::string script;
	std::string branch;
};

struct ScriptDiagEvent {
	int sequence = 0;
	int frame = -1;
	std::string kind;
	std::string source_script;
	std::string branch;
	int action_type = -1;
	std::string target;
	int parameter_int = 0;
	double parameter_real = 0.0;
	int before_value = 0;
	bool before_countdown = false;
	int after_value = 0;
	bool after_countdown = false;
	bool found_group = false;
	bool group_active = false;
	bool found_script = false;
	bool script_active = false;
};

std::vector<ScriptDiagContext> g_script_diag_context_stack;
std::vector<ScriptDiagEvent> g_script_diag_events;
std::vector<std::string> g_script_diag_dynamic_counters;
int g_script_diag_event_count = 0;
int g_script_diag_dropped_count = 0;

int current_logic_frame_for_script_diag()
{
	return TheGameLogic != NULL ? TheGameLogic->getFrame() : -1;
}

bool is_script_diag_dynamic_counter_watch(const char *name)
{
	if (name == NULL) {
		return false;
	}
	for (const std::string& counter : g_script_diag_dynamic_counters) {
		if (counter == name) {
			return true;
		}
	}
	return false;
}

void add_script_diag_dynamic_counter(const std::string& name)
{
	if (name.empty() || is_campaign_intro_counter_watch(name.c_str()) ||
		is_script_diag_dynamic_counter_watch(name.c_str())) {
		return;
	}
	g_script_diag_dynamic_counters.push_back(name);
}

bool parameter_references_script_diag_dynamic_counter(const Parameter *parameter)
{
	return parameter != NULL &&
		is_script_diag_dynamic_counter_watch(parameter->getString().str());
}

bool script_actions_reference_script_diag_dynamic_counter(ScriptAction *action_head)
{
	for (ScriptAction *action = action_head; action != NULL; action = action->getNext()) {
		const Int parameter_count = action->getNumParameters();
		for (Int parameter_index = 0; parameter_index < parameter_count; ++parameter_index) {
			if (parameter_references_script_diag_dynamic_counter(action->getParameter(parameter_index))) {
				return true;
			}
		}
	}
	return false;
}

bool script_conditions_reference_script_diag_dynamic_counter(Script *script)
{
	for (OrCondition *or_condition = script != NULL ? script->getOrCondition() : NULL;
		or_condition != NULL;
		or_condition = or_condition->getNextOrCondition()) {
		for (Condition *condition = or_condition->getFirstAndCondition();
			condition != NULL;
			condition = condition->getNext()) {
			const Int parameter_count = condition->getNumParameters();
			for (Int parameter_index = 0; parameter_index < parameter_count; ++parameter_index) {
				if (parameter_references_script_diag_dynamic_counter(condition->getParameter(parameter_index))) {
					return true;
				}
			}
		}
	}
	return false;
}

bool script_references_script_diag_dynamic_counter(const char *script_name)
{
	Script *script = find_loaded_script(script_name);
	return script != NULL &&
		(script_conditions_reference_script_diag_dynamic_counter(script) ||
		 script_actions_reference_script_diag_dynamic_counter(script->getAction()) ||
		 script_actions_reference_script_diag_dynamic_counter(script->getFalseAction()));
}

bool script_diag_context_is_watched()
{
	return !g_script_diag_context_stack.empty() &&
		(is_campaign_intro_script_watch(g_script_diag_context_stack.back().script.c_str()) ||
		 script_references_script_diag_dynamic_counter(g_script_diag_context_stack.back().script.c_str()));
}

std::string script_diag_action_name(int action_type)
{
	if (TheScriptEngine != NULL && action_type >= 0 && action_type < ScriptAction::NUM_ITEMS) {
		const ActionTemplate *action_template = TheScriptEngine->getActionTemplate(action_type);
		if (action_template != NULL) {
			return action_template->m_internalName.str();
		}
	}
	return "";
}

std::string script_diag_condition_name(int condition_type)
{
	if (TheScriptEngine != NULL && condition_type >= 0 && condition_type < Condition::NUM_ITEMS) {
		const ConditionTemplate *condition_template =
			TheScriptEngine->getConditionTemplate(condition_type);
		if (condition_template != NULL) {
			return condition_template->m_internalName.str();
		}
	}
	return "";
}

void reset_script_diag_trace()
{
	g_script_diag_context_stack.clear();
	g_script_diag_events.clear();
	g_script_diag_dynamic_counters.clear();
	g_script_diag_event_count = 0;
	g_script_diag_dropped_count = 0;
}

void append_script_diag_event(const ScriptDiagEvent& event)
{
	const int include_limit = 512;
	++g_script_diag_event_count;
	if (static_cast<int>(g_script_diag_events.size()) >= include_limit) {
		++g_script_diag_dropped_count;
		return;
	}
	g_script_diag_events.push_back(event);
}

void note_script_diag_context_push(const char *script_name, const char *branch)
{
	const std::string safe_script = script_name != NULL ? script_name : "";
	const std::string safe_branch = branch != NULL ? branch : "";
	g_script_diag_context_stack.push_back({safe_script, safe_branch});
	if (!script_diag_context_is_watched()) {
		return;
	}
	ScriptDiagEvent event;
	event.sequence = g_script_diag_event_count + 1;
	event.frame = current_logic_frame_for_script_diag();
	event.kind = "scriptActions";
	event.source_script = safe_script;
	event.branch = safe_branch;
	append_script_diag_event(event);
}

void note_script_diag_context_pop()
{
	if (!g_script_diag_context_stack.empty()) {
		g_script_diag_context_stack.pop_back();
	}
}

void note_script_diag_timer_action(
	int action_type,
	const char *counter_name,
	int parameter_int,
	double parameter_real,
	int before_value,
	bool before_countdown,
	int after_value,
	bool after_countdown)
{
	const std::string safe_counter = counter_name != NULL ? counter_name : "";
	if (!is_campaign_intro_counter_watch(safe_counter.c_str()) &&
		!is_script_diag_dynamic_counter_watch(safe_counter.c_str()) &&
		!script_diag_context_is_watched()) {
		return;
	}
	add_script_diag_dynamic_counter(safe_counter);
	ScriptDiagEvent event;
	event.sequence = g_script_diag_event_count + 1;
	event.frame = current_logic_frame_for_script_diag();
	event.kind = "timerAction";
	if (!g_script_diag_context_stack.empty()) {
		event.source_script = g_script_diag_context_stack.back().script;
		event.branch = g_script_diag_context_stack.back().branch;
	}
	event.action_type = action_type;
	event.target = safe_counter;
	event.parameter_int = parameter_int;
	event.parameter_real = parameter_real;
	event.before_value = before_value;
	event.before_countdown = before_countdown;
	event.after_value = after_value;
	event.after_countdown = after_countdown;
	append_script_diag_event(event);
}

void note_script_diag_script_activation(
	int action_type,
	const char *target_name,
	bool found_group,
	bool group_active,
	bool found_script,
	bool script_active)
{
	const std::string safe_target = target_name != NULL ? target_name : "";
	if (!is_campaign_intro_script_watch(safe_target.c_str()) && !script_diag_context_is_watched()) {
		return;
	}
	ScriptDiagEvent event;
	event.sequence = g_script_diag_event_count + 1;
	event.frame = current_logic_frame_for_script_diag();
	event.kind = "scriptActivation";
	if (!g_script_diag_context_stack.empty()) {
		event.source_script = g_script_diag_context_stack.back().script;
		event.branch = g_script_diag_context_stack.back().branch;
	}
	event.action_type = action_type;
	event.target = safe_target;
	event.found_group = found_group;
	event.group_active = group_active;
	event.found_script = found_script;
	event.script_active = script_active;
	append_script_diag_event(event);
}

void append_campaign_intro_script_event_log(std::string &json)
{
	json += ",\"scriptEventLog\":{";
	json += "\"eventCount\":" + std::to_string(g_script_diag_event_count);
	json += ",\"includedCount\":" + std::to_string(g_script_diag_events.size());
	json += ",\"droppedCount\":" + std::to_string(g_script_diag_dropped_count);
	json += ",\"truncated\":";
	json += g_script_diag_dropped_count > 0 ? "true" : "false";
	json += ",\"contextDepth\":" + std::to_string(g_script_diag_context_stack.size());
	json += ",\"events\":[";
	bool first_event = true;
	for (const ScriptDiagEvent& event : g_script_diag_events) {
		if (!first_event) {
			json += ",";
		}
		first_event = false;
		json += "{\"sequence\":" + std::to_string(event.sequence);
		json += ",\"frame\":" + std::to_string(event.frame);
		json += ",\"kind\":\"" + json_escape(event.kind) + "\"";
		json += ",\"sourceScript\":\"" + json_escape(event.source_script) + "\"";
		json += ",\"branch\":\"" + json_escape(event.branch) + "\"";
		json += ",\"actionType\":" + std::to_string(event.action_type);
		json += ",\"actionName\":\"" + json_escape(script_diag_action_name(event.action_type)) + "\"";
		json += ",\"target\":\"" + json_escape(event.target) + "\"";
		json += ",\"parameterInt\":" + std::to_string(event.parameter_int);
		char parameter_real[64];
		std::snprintf(parameter_real, sizeof(parameter_real), "%.3f", event.parameter_real);
		json += ",\"parameterReal\":";
		json += parameter_real;
		json += ",\"before\":{\"value\":" + std::to_string(event.before_value);
		json += ",\"countdownTimer\":";
		json += event.before_countdown ? "true" : "false";
		json += "},\"after\":{\"value\":" + std::to_string(event.after_value);
		json += ",\"countdownTimer\":";
		json += event.after_countdown ? "true" : "false";
		json += "},\"activation\":{\"foundGroup\":";
		json += event.found_group ? "true" : "false";
		json += ",\"groupActive\":";
		json += event.group_active ? "true" : "false";
		json += ",\"foundScript\":";
		json += event.found_script ? "true" : "false";
		json += ",\"scriptActive\":";
		json += event.script_active ? "true" : "false";
		json += "}}";
	}
	json += "]}";
}

const char *script_for_intro_counter(const char *counter_name)
{
	if (std::strcmp(counter_name, "CINE_MoveTo06Delay") == 0) {
		return "CINE_CameraMoveTo06";
	}
	if (std::strcmp(counter_name, "CINE_CameraCutTo04") == 0) {
		return "CINE_CameraCutTo04";
	}
	if (std::strcmp(counter_name, "CINE_LaunchPadMoveDelay") == 0) {
		return "CINE_LaunchPad & BuggiesMove";
	}
	if (std::strcmp(counter_name, "CINE_Pt2CameraLocation01Delay") == 0) {
		return "CINE_BasePos01";
	}
	if (std::strcmp(counter_name, "CINE_Pt2MoveTransportsDelay") == 0) {
		return "CINE_MoveTransports";
	}
	if (std::strcmp(counter_name, "CINE_BasePullOut01Delay") == 0) {
		return "CINE_BasePanTo01";
	}
	if (std::strcmp(counter_name, "CINE_BackToRocket01Delay") == 0) {
		return "CINE_BackToUSBase";
	}
	if (std::strcmp(counter_name, "CINE_BackToBaseDelay") == 0 ||
		std::strcmp(counter_name, "CINE_ZoomInMoreOnBaseDelay") == 0) {
		return "CINE_ZoomInMoreOnBase";
	}
	if (std::strcmp(counter_name, "CINE_RocketAirShot01Delay") == 0 ||
		std::strcmp(counter_name, "CINE_BackToBaseYetAgainDelay") == 0) {
		return "CINE_BackToBaseYetAgain & DeleteRocketAir01";
	}
	if (std::strcmp(counter_name, "CINE_ZoomInMoreOnBaseDelayAgain") == 0 ||
		std::strcmp(counter_name, "CINE_RocketAirShot02Delay") == 0) {
		return "CINE_ZoomInMoreOnBaseAgain";
	}
	if (std::strcmp(counter_name, "CINE_LastBaseShotDelay") == 0) {
		return "CINE_LastBaseShot";
	}
	if (std::strcmp(counter_name, "CINE_BlowUp") == 0 ||
		std::strcmp(counter_name, "CINE_FlashWhiteDelay") == 0) {
		return "CINE_FlashWhite";
	}
	if (std::strcmp(counter_name, "CINE_ReturnToPlayerStartDelay") == 0) {
		return "CINE_ReturnToPlayerLocation";
	}
	if (std::strcmp(counter_name, "CINE_ReturnToPlayerStartDelay_2") == 0) {
		return "CINE_ReturnToPlayerLocation C";
	}
	if (std::strcmp(counter_name, "Give it back") == 0) {
		return "Give Player The Game";
	}
	return "";
}

void append_watched_counter(std::string &json, const char *name)
{
	const TCounter *counter = find_script_counter(name);
	json += "{\"name\":\"" + json_escape(name) + "\"";
	json += ",\"found\":";
	json += counter != NULL ? "true" : "false";
	if (counter != NULL) {
		json += ",\"value\":" + std::to_string(counter->value);
		json += ",\"countdownTimer\":";
		json += counter->isCountdownTimer ? "true" : "false";
	} else {
		json += ",\"value\":null,\"countdownTimer\":null";
	}
	json += "}";
}

void append_watched_flag(std::string &json, const char *name)
{
	const TFlag *flag = find_script_flag(name);
	json += "{\"name\":\"" + json_escape(name) + "\"";
	json += ",\"found\":";
	json += flag != NULL ? "true" : "false";
	json += ",\"value\":";
	if (flag != NULL) {
		json += flag->value ? "true" : "false";
	} else {
		json += "null";
	}
	json += "}";
}

void append_watched_script(std::string &json, const char *name)
{
	Script *script = find_loaded_script(name);
	json += "{\"name\":\"" + json_escape(name) + "\"";
	json += ",\"found\":";
	json += script != NULL ? "true" : "false";
	if (script != NULL) {
		json += ",\"active\":";
		json += script->isActive() ? "true" : "false";
		json += ",\"oneShot\":";
		json += script->isOneShot() ? "true" : "false";
		json += ",\"frameToEvaluate\":" + std::to_string(script->getFrameToEvaluate());
		json += ",\"details\":";
		append_script_catalog_entry_json(json, script, -1, "", 2);
	} else {
		json += ",\"active\":null,\"oneShot\":null,\"frameToEvaluate\":null,"
			"\"details\":null";
	}
	json += "}";
}

void append_campaign_intro_sequential_scripts(std::string &json)
{
	const Int sequential_count =
		TheScriptEngine != NULL ? TheScriptEngine->debugGetSequentialScriptCount() : 0;
	const Int sequential_limit = sequential_count < 24 ? sequential_count : 24;
	json += ",\"sequentialScriptCount\":" + std::to_string(sequential_count);
	json += ",\"sequentialScriptsTruncated\":";
	json += sequential_count > sequential_limit ? "true" : "false";
	json += ",\"sequentialScripts\":[";
	bool first_entry = true;
	for (Int index = 0; index < sequential_limit; ++index) {
		const SequentialScript *sequential =
			TheScriptEngine != NULL ? TheScriptEngine->debugGetSequentialScriptByIndex(index) : NULL;
		if (sequential == NULL) {
			continue;
		}
		if (!first_entry) {
			json += ",";
		}
		first_entry = false;
		Script *script = sequential->m_scriptToExecuteSequentially;
		const std::string script_name = script != NULL ? script->getName().str() : "";
		json += "{\"index\":" + std::to_string(index);
		json += ",\"scriptReady\":";
		json += script != NULL ? "true" : "false";
		json += ",\"scriptName\":\"" + json_escape(script_name) + "\"";
		json += ",\"watched\":";
		json += is_campaign_intro_script_watch(script_name.c_str()) ? "true" : "false";
		json += ",\"active\":";
		json += script != NULL ? (script->isActive() ? "true" : "false") : "null";
		json += ",\"frameToEvaluate\":";
		json += script != NULL ? std::to_string(script->getFrameToEvaluate()) : "null";
		json += ",\"objectId\":" +
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
}

bool append_counter_reference_if_needed(
	std::string &references_json,
	bool &first_entry,
	int &total_count,
	int &included_count,
	int include_limit,
	Script *script,
	Int side_index,
	const char *group_name,
	const char *source,
	const char *item_internal_name,
	int item_index,
	int or_index,
	int and_index,
	const Parameter *parameter,
	int parameter_index)
{
	if (parameter == NULL ||
		(!is_campaign_intro_counter_watch(parameter->getString().str()) &&
		 !is_script_diag_dynamic_counter_watch(parameter->getString().str()))) {
		return false;
	}
	++total_count;
	if (included_count >= include_limit) {
		return true;
	}
	if (!first_entry) {
		references_json += ",";
	}
	first_entry = false;
	++included_count;
	references_json += "{\"sideIndex\":" + std::to_string(side_index);
	references_json += ",\"groupName\":\"";
	references_json += group_name != NULL ? json_escape(group_name) : "";
	references_json += "\"";
	references_json += ",\"scriptName\":\"" +
		json_escape(script != NULL ? script->getName().str() : "") + "\"";
	references_json += ",\"scriptActive\":";
	references_json += script != NULL ? (script->isActive() ? "true" : "false") : "null";
	references_json += ",\"oneShot\":";
	references_json += script != NULL ? (script->isOneShot() ? "true" : "false") : "null";
	references_json += ",\"frameToEvaluate\":";
	references_json += script != NULL ? std::to_string(script->getFrameToEvaluate()) : "null";
	references_json += ",\"source\":\"" + json_escape(source != NULL ? source : "") + "\"";
	references_json += ",\"itemInternalName\":\"" +
		json_escape(item_internal_name != NULL ? item_internal_name : "") + "\"";
	references_json += ",\"itemIndex\":" + std::to_string(item_index);
	references_json += ",\"orIndex\":" + std::to_string(or_index);
	references_json += ",\"andIndex\":" + std::to_string(and_index);
	references_json += ",\"parameterIndex\":" + std::to_string(parameter_index);
	references_json += ",\"counter\":\"" +
		json_escape(parameter->getString().str()) + "\"";
	references_json += ",\"parameterInt\":" + std::to_string(parameter->getInt());
	references_json += "}";
	return true;
}

void append_campaign_intro_counter_action_references(
	std::string &references_json,
	bool &first_entry,
	int &total_count,
	int &included_count,
	int include_limit,
	Script *script,
	Int side_index,
	const char *group_name,
	const char *source,
	ScriptAction *first_action)
{
	int action_index = 0;
	for (ScriptAction *action = first_action; action != NULL; action = action->getNext(), ++action_index) {
		const ScriptAction::ScriptActionType type = action->getActionType();
		const ActionTemplate *action_template =
			TheScriptEngine != NULL ? TheScriptEngine->getActionTemplate(type) : NULL;
		const std::string internal_name =
			action_template != NULL ? action_template->m_internalName.str() : "";
		const Int parameter_count = action->getNumParameters();
		for (Int parameter_index = 0; parameter_index < parameter_count; ++parameter_index) {
			append_counter_reference_if_needed(
				references_json,
				first_entry,
				total_count,
				included_count,
				include_limit,
				script,
				side_index,
				group_name,
				source,
				internal_name.c_str(),
				action_index,
				-1,
				-1,
				action->getParameter(parameter_index),
				parameter_index);
		}
	}
}

void append_campaign_intro_counter_condition_references(
	std::string &references_json,
	bool &first_entry,
	int &total_count,
	int &included_count,
	int include_limit,
	Script *script,
	Int side_index,
	const char *group_name)
{
	int or_index = 0;
	for (OrCondition *or_condition = script != NULL ? script->getOrCondition() : NULL;
		or_condition != NULL;
		or_condition = or_condition->getNextOrCondition(), ++or_index) {
		int and_index = 0;
		for (Condition *condition = or_condition->getFirstAndCondition();
			condition != NULL;
			condition = condition->getNext(), ++and_index) {
			const Condition::ConditionType type = condition->getConditionType();
			const ConditionTemplate *condition_template =
				TheScriptEngine != NULL ? TheScriptEngine->getConditionTemplate(type) : NULL;
			const std::string internal_name =
				condition_template != NULL ? condition_template->m_internalName.str() : "";
			const Int parameter_count = condition->getNumParameters();
			for (Int parameter_index = 0; parameter_index < parameter_count; ++parameter_index) {
				append_counter_reference_if_needed(
					references_json,
					first_entry,
					total_count,
					included_count,
					include_limit,
					script,
					side_index,
					group_name,
					"conditions",
					internal_name.c_str(),
					-1,
					or_index,
					and_index,
					condition->getParameter(parameter_index),
					parameter_index);
			}
		}
	}
}

void append_campaign_intro_counter_references_for_script(
	std::string &references_json,
	bool &first_entry,
	int &total_count,
	int &included_count,
	int include_limit,
	Script *script,
	Int side_index,
	const char *group_name)
{
	for (Script *current = script; current != NULL; current = current->getNext()) {
		append_campaign_intro_counter_condition_references(
			references_json,
			first_entry,
			total_count,
			included_count,
			include_limit,
			current,
			side_index,
			group_name);
		append_campaign_intro_counter_action_references(
			references_json,
			first_entry,
			total_count,
			included_count,
			include_limit,
			current,
			side_index,
			group_name,
			"actions",
			current->getAction());
		append_campaign_intro_counter_action_references(
			references_json,
			first_entry,
			total_count,
			included_count,
			include_limit,
			current,
			side_index,
			group_name,
			"falseActions",
			current->getFalseAction());
	}
}

void append_campaign_intro_counter_references(std::string &json)
{
	const int include_limit = 128;
	int total_count = 0;
	int included_count = 0;
	bool first_entry = true;
	std::string references_json;

	if (TheSidesList != NULL) {
		const Int side_count = TheSidesList->getNumSides();
		for (Int side_index = 0; side_index < side_count; ++side_index) {
			SidesInfo *side = TheSidesList->getSideInfo(side_index);
			ScriptList *script_list = side != NULL ? side->getScriptList() : NULL;
			if (script_list == NULL) {
				continue;
			}
			append_campaign_intro_counter_references_for_script(
				references_json,
				first_entry,
				total_count,
				included_count,
				include_limit,
				script_list->getScript(),
				side_index,
				NULL);
			for (ScriptGroup *group = script_list->getScriptGroup();
				group != NULL;
				group = group->getNext()) {
				const std::string group_name = group->getName().str();
				append_campaign_intro_counter_references_for_script(
					references_json,
					first_entry,
					total_count,
					included_count,
					include_limit,
					group->getScript(),
					side_index,
					group_name.c_str());
			}
		}
	}

	json += ",\"counterReferenceCount\":" + std::to_string(total_count);
	json += ",\"counterReferencesTruncated\":";
	json += total_count > included_count ? "true" : "false";
	json += ",\"counterReferences\":[";
	json += references_json;
	json += "]";
}

void append_campaign_intro_dynamic_counters(std::string &json)
{
	json += ",\"dynamicCounters\":[";
	bool first_entry = true;
	for (const std::string& name : g_script_diag_dynamic_counters) {
		if (!first_entry) {
			json += ",";
		}
		first_entry = false;
		append_watched_counter(json, name.c_str());
	}
	json += "]";
}

bool script_references_any_script_diag_dynamic_counter(Script *script)
{
	return script != NULL &&
		(script_conditions_reference_script_diag_dynamic_counter(script) ||
		 script_actions_reference_script_diag_dynamic_counter(script->getAction()) ||
		 script_actions_reference_script_diag_dynamic_counter(script->getFalseAction()));
}

void append_campaign_intro_dynamic_script_if_needed(
	std::string &scripts_json,
	bool &first_entry,
	int &total_count,
	int &included_count,
	int include_limit,
	Script *script,
	Int side_index,
	const char *group_name)
{
	if (script == NULL ||
		is_campaign_intro_script_watch(script->getName().str()) ||
		!script_references_any_script_diag_dynamic_counter(script)) {
		return;
	}
	++total_count;
	if (included_count >= include_limit) {
		return;
	}
	if (!first_entry) {
		scripts_json += ",";
	}
	first_entry = false;
	++included_count;
	append_script_catalog_entry_json(scripts_json, script, side_index, group_name, 2);
}

void append_campaign_intro_dynamic_script_chain(
	std::string &scripts_json,
	bool &first_entry,
	int &total_count,
	int &included_count,
	int include_limit,
	Script *first_script,
	Int side_index,
	const char *group_name)
{
	for (Script *script = first_script; script != NULL; script = script->getNext()) {
		append_campaign_intro_dynamic_script_if_needed(
			scripts_json,
			first_entry,
			total_count,
			included_count,
			include_limit,
			script,
			side_index,
			group_name);
	}
}

void append_campaign_intro_dynamic_scripts(std::string &json)
{
	const int include_limit = 32;
	int total_count = 0;
	int included_count = 0;
	bool first_entry = true;
	std::string scripts_json;

	if (TheSidesList != NULL) {
		const Int side_count = TheSidesList->getNumSides();
		for (Int side_index = 0; side_index < side_count; ++side_index) {
			SidesInfo *side = TheSidesList->getSideInfo(side_index);
			ScriptList *script_list = side != NULL ? side->getScriptList() : NULL;
			if (script_list == NULL) {
				continue;
			}
			append_campaign_intro_dynamic_script_chain(
				scripts_json,
				first_entry,
				total_count,
				included_count,
				include_limit,
				script_list->getScript(),
				side_index,
				"");
			for (ScriptGroup *group = script_list->getScriptGroup();
				group != NULL;
				group = group->getNext()) {
				const std::string group_name = group->getName().str();
				append_campaign_intro_dynamic_script_chain(
					scripts_json,
					first_entry,
					total_count,
					included_count,
					include_limit,
					group->getScript(),
					side_index,
					group_name.c_str());
			}
		}
	}

	json += ",\"dynamicScriptCount\":" + std::to_string(total_count);
	json += ",\"dynamicScriptsTruncated\":";
	json += total_count > included_count ? "true" : "false";
	json += ",\"dynamicScripts\":[";
	json += scripts_json;
	json += "]";
}

void append_minimal_control_bar_state(std::string &json)
{
	GameWindow *window = find_window_by_name("ControlBar.wnd:ControlBarParent");
	json += ",\"controlBar\":{";
	if (TheWindowManager == NULL || window == NULL) {
		json += "\"found\":false,\"hidden\":null,\"managerHidden\":null,"
			"\"enabled\":null,\"clickable\":false,\"scheme\":null}";
		return;
	}
	const UnsignedInt status = window->winGetStatus();
	const Bool manager_hidden = TheWindowManager->isHidden(window);
	const Bool enabled = TheWindowManager->isEnabled(window);
	json += "\"found\":true";
	json += ",\"hidden\":";
	json += window->winIsHidden() ? "true" : "false";
	json += ",\"managerHidden\":";
	json += manager_hidden ? "true" : "false";
	json += ",\"enabled\":";
	json += enabled ? "true" : "false";
	json += ",\"clickable\":";
	json += (!manager_hidden && enabled && (status & WIN_STATUS_NO_INPUT) == 0) ? "true" : "false";

	// ADD-ONLY Stage-0 probe of the command-bar scheme manager (read-only).
	// Reports the resolved scheme name/side, the number of schemes parsed from
	// ControlBarScheme.ini, and per image layer (3..5 are BACKGROUND layers,
	// 0..2 foreground) how many scheme images exist and how many actually
	// resolved to a loaded Image*. NULL images => the command-bar background
	// frame draws nothing (cause c'-image-not-loaded).
	json += ",\"scheme\":";
	if (TheControlBar == NULL) {
		json += "null";
	} else {
		ControlBarSchemeManager *man = TheControlBar->getControlBarSchemeManager();
		json += "{\"managerReady\":";
		json += man != NULL ? "true" : "false";
		if (man != NULL) {
			json += ",\"schemeListSize\":";
			json += std::to_string(man->diagGetSchemeListSize());
			json += ",\"bgDrawReachedDrawbackground\":" + std::to_string(cnc_port_cb_bg_reached_drawbackground);
			json += ",\"bgDrawCalled\":" + std::to_string(cnc_port_cb_bg_called);
			json += ",\"bgDrawManOk\":" + std::to_string(cnc_port_cb_bg_man_ok);
			json += ",\"bgDrawWinOk\":" + std::to_string(cnc_port_cb_bg_win_ok);
			json += ",\"leftHudDrawCalled\":" + std::to_string(cnc_port_cb_left_hud_draw_called);
			ControlBarScheme *scheme = man->diagGetCurrentScheme();
			json += ",\"currentScheme\":";
			if (scheme == NULL) {
				json += "null";
			} else {
				json += "{\"name\":\"";
				json += json_escape(scheme->m_name.str());
				json += "\",\"side\":\"";
				json += json_escape(scheme->m_side.str());
				json += "\",\"screenCreationRes\":{\"x\":";
				json += std::to_string(scheme->m_ScreenCreationRes.x);
				json += ",\"y\":";
				json += std::to_string(scheme->m_ScreenCreationRes.y);
				json += "},\"layers\":{";
				for (Int li = 0; li < MAX_CONTROL_BAR_SCHEME_IMAGE_LAYERS; ++li) {
					if (li != 0) {
						json += ",";
					}
					json += "\"";
					json += std::to_string(li);
					json += "\":{";
					std::size_t total = 0;
					std::size_t loaded = 0;
					json += "\"images\":[";
					bool first_image = true;
					for (ControlBarScheme::ControlBarSchemeImageList::iterator it = scheme->m_layer[li].begin();
						it != scheme->m_layer[li].end(); ++it) {
						++total;
						if (*it != NULL && (*it)->m_image != NULL) {
							++loaded;
							if (!first_image) json += ",";
							first_image = false;
							json += "{\"name\":\"";
							json += json_escape((*it)->m_name.str());
							json += "\",\"file\":\"";
							json += json_escape((*it)->m_image->getFilename().str());
							json += "\",\"status\":";
							json += std::to_string((*it)->m_image->getStatus());
							// ADD-ONLY Stage-1: probe the TextureClass that Render2DClass
							// would resolve for this image's filename. If Initialized is
							// false or Peek_D3D_Base_Texture is NULL, the 2D drawImage
							// binds no texture -> black quad (the command-bar background
							// failure mode). Read-only (Get_Texture caches in TextureHash).
							json += ",\"tex\":";
							try {
								const char *tex_name = (*it)->m_image->getFilename().str();
								TextureClass *tc = (WW3DAssetManager::Get_Instance() != NULL)
									? WW3DAssetManager::Get_Instance()->Get_Texture(tex_name, MIP_LEVELS_1) : NULL;
								if (tc == NULL) {
									json += "{\"found\":false}";
								} else {
									json += "{\"found\":true,\"initialized\":";
									json += tc->Is_Initialized() ? "true" : "false";
									json += ",\"width\":" + std::to_string(tc->Get_Width());
									json += ",\"height\":" + std::to_string(tc->Get_Height());
									json += ",\"hasD3dTex\":";
									json += (tc->Peek_D3D_Base_Texture() != NULL) ? "true" : "false";
									json += "}";
									tc->Release_Ref();
								}
							} catch (...) {
								json += "{\"found\":\"threw\"}";
							}
							json += "}";  // close the per-image object
						}
					}
					json += "],\"total\":";
					json += std::to_string(total);
					json += ",\"loaded\":";
					json += std::to_string(loaded);
					json += "}";
				}
				json += "}}";
			}
		}
		json += "}";
	}
	json += "}";
}

void append_campaign_intro_gate_summary(std::string &json)
{
	json += ",\"campaignIntroGates\":{";
	json += "\"counters\":[";
	for (std::size_t index = 0;
		index < sizeof(k_campaign_intro_counter_watches) / sizeof(k_campaign_intro_counter_watches[0]);
		++index) {
		if (index != 0) {
			json += ",";
		}
		append_watched_counter(json, k_campaign_intro_counter_watches[index]);
	}
	json += "],\"flags\":[";
	for (std::size_t index = 0;
		index < sizeof(k_campaign_intro_flag_watches) / sizeof(k_campaign_intro_flag_watches[0]);
		++index) {
		if (index != 0) {
			json += ",";
		}
		append_watched_flag(json, k_campaign_intro_flag_watches[index]);
	}
	json += "],\"scripts\":[";
	for (std::size_t index = 0;
		index < sizeof(k_campaign_intro_script_watches) / sizeof(k_campaign_intro_script_watches[0]);
		++index) {
		if (index != 0) {
			json += ",";
		}
		append_watched_script(json, k_campaign_intro_script_watches[index]);
	}
	json += "]";
	append_campaign_intro_sequential_scripts(json);
	append_campaign_intro_dynamic_counters(json);
	append_campaign_intro_dynamic_scripts(json);
	append_campaign_intro_counter_references(json);
	append_campaign_intro_script_event_log(json);
	json += ",\"releaseChain\":{\"includedCount\":0,\"truncated\":false,"
		"\"activeTimerWaits\":[";
	bool first_wait = true;
	for (std::size_t index = 0;
		index < sizeof(k_campaign_intro_counter_watches) / sizeof(k_campaign_intro_counter_watches[0]);
		++index) {
		const char *name = k_campaign_intro_counter_watches[index];
		const TCounter *counter = find_script_counter(name);
		if (counter == NULL || !counter->isCountdownTimer || counter->value <= 0) {
			continue;
		}
		if (!first_wait) {
			json += ",";
		}
		first_wait = false;
		json += "{\"script\":\"" + json_escape(script_for_intro_counter(name)) + "\"";
		json += ",\"active\":true,\"counter\":\"" + json_escape(name) + "\"";
		json += ",\"current\":{\"found\":true,\"name\":\"" + json_escape(name) + "\"";
		json += ",\"value\":" + std::to_string(counter->value);
		json += ",\"countdownTimer\":true}}";
	}
	for (const std::string& dynamic_name : g_script_diag_dynamic_counters) {
		const char *name = dynamic_name.c_str();
		const TCounter *counter = find_script_counter(name);
		if (counter == NULL || !counter->isCountdownTimer || counter->value <= 0) {
			continue;
		}
		if (!first_wait) {
			json += ",";
		}
		first_wait = false;
		json += "{\"script\":\"\"";
		json += ",\"active\":true,\"counter\":\"" + json_escape(name) + "\"";
		json += ",\"current\":{\"found\":true,\"name\":\"" + json_escape(name) + "\"";
		json += ",\"value\":" + std::to_string(counter->value);
		json += ",\"countdownTimer\":true,\"dynamic\":true}}";
	}
	json += "]}}";
}

void append_map_metadata_json(std::string &json, const char *field_name, const MapMetaData *metadata)
{
	json += ",\"";
	json += field_name != NULL ? field_name : "map";
	json += "\":{";
	json += "\"found\":";
	json += metadata != NULL ? "true" : "false";
	if (metadata != NULL) {
		json += ",\"fileName\":\"" + json_escape(metadata->m_fileName.str()) + "\"";
		json += ",\"isOfficial\":";
		json += metadata->m_isOfficial ? "true" : "false";
		json += ",\"isMultiplayer\":";
		json += metadata->m_isMultiplayer ? "true" : "false";
		json += ",\"numPlayers\":" + std::to_string(static_cast<long long>(metadata->m_numPlayers));
		json += ",\"fileSize\":" + std::to_string(static_cast<unsigned long long>(metadata->m_filesize));
		json += ",\"crc\":" + std::to_string(static_cast<unsigned long long>(metadata->m_CRC));
		json += ",\"extentMin\":{\"x\":" + std::to_string(metadata->m_extent.lo.x);
		json += ",\"y\":" + std::to_string(metadata->m_extent.lo.y);
		json += ",\"z\":" + std::to_string(metadata->m_extent.lo.z) + "}";
		json += ",\"extentMax\":{\"x\":" + std::to_string(metadata->m_extent.hi.x);
		json += ",\"y\":" + std::to_string(metadata->m_extent.hi.y);
		json += ",\"z\":" + std::to_string(metadata->m_extent.hi.z) + "}";
	}
	json += "}";
}

const PlayerTemplate *find_player_template_by_name(const char *template_name, Int *out_index)
{
	if (out_index != NULL) {
		*out_index = -1;
	}
	if (ThePlayerTemplateStore == NULL || template_name == NULL || template_name[0] == '\0') {
		return NULL;
	}
	AsciiString requested(template_name);
	const Int template_count = ThePlayerTemplateStore->getPlayerTemplateCount();
	for (Int i = 0; i < template_count; ++i) {
		const PlayerTemplate *player_template = ThePlayerTemplateStore->getNthPlayerTemplate(i);
		if (player_template == NULL) {
			continue;
		}
		if (player_template->getName().compareNoCase(requested.str()) == 0) {
			if (out_index != NULL) {
				*out_index = i;
			}
			return player_template;
		}
	}
	return NULL;
}

void append_player_template_json(std::string &json, const char *field_name, Int template_index)
{
	json += ",\"";
	json += field_name != NULL ? field_name : "playerTemplate";
	json += "\":{";
	json += "\"index\":" + std::to_string(static_cast<long long>(template_index));
	const PlayerTemplate *player_template =
		(ThePlayerTemplateStore != NULL && template_index >= 0)
			? ThePlayerTemplateStore->getNthPlayerTemplate(template_index)
			: NULL;
	json += ",\"present\":";
	json += player_template != NULL ? "true" : "false";
	if (player_template != NULL) {
		json += ",\"name\":\"" + json_escape(player_template->getName().str()) + "\"";
		json += ",\"side\":\"" + json_escape(player_template->getSide().str()) + "\"";
		json += ",\"baseSide\":\"" + json_escape(player_template->getBaseSide().str()) + "\"";
		json += ",\"playable\":";
		json += player_template->isPlayableSide() ? "true" : "false";
		json += ",\"startingBuilding\":\"" + json_escape(player_template->getStartingBuilding().str()) + "\"";
		json += ",\"startingUnits\":[";
		for (Int i = 0; i < MAX_MP_STARTING_UNITS; ++i) {
			if (i > 0) {
				json += ",";
			}
			json += "\"" + json_escape(player_template->getStartingUnit(i).str()) + "\"";
		}
		json += "]";
	}
	json += "}";
}

void append_game_slot_json(std::string &json, const char *field_name, const GameInfo *game, Int slot_num)
{
	json += ",\"";
	json += field_name != NULL ? field_name : "slot";
	json += "\":{";
	json += "\"slot\":" + std::to_string(static_cast<long long>(slot_num));
	const GameSlot *slot = game != NULL ? game->getConstSlot(slot_num) : NULL;
	json += ",\"present\":";
	json += slot != NULL ? "true" : "false";
	if (slot != NULL) {
		json += ",\"state\":" + std::to_string(static_cast<long long>(slot->getState()));
		json += ",\"accepted\":";
		json += slot->isAccepted() ? "true" : "false";
		json += ",\"hasMap\":";
		json += slot->hasMap() ? "true" : "false";
		json += ",\"human\":";
		json += slot->isHuman() ? "true" : "false";
		json += ",\"ai\":";
		json += slot->isAI() ? "true" : "false";
		json += ",\"occupied\":";
		json += slot->isOccupied() ? "true" : "false";
		json += ",\"color\":" + std::to_string(static_cast<long long>(slot->getColor()));
		json += ",\"startPos\":" + std::to_string(static_cast<long long>(slot->getStartPos()));
		json += ",\"teamNumber\":" + std::to_string(static_cast<long long>(slot->getTeamNumber()));
		append_player_template_json(json, "playerTemplate", slot->getPlayerTemplate());
		append_player_template_json(json, "originalPlayerTemplate", slot->getOriginalPlayerTemplate());
	}
	json += "}";
}

void append_game_info_json(std::string &json, const char *field_name, const GameInfo *game)
{
	json += ",\"";
	json += field_name != NULL ? field_name : "gameInfo";
	json += "\":{";
	json += "\"present\":";
	json += game != NULL ? "true" : "false";
	if (game != NULL) {
		AsciiString map = game->getMap();
		const MapMetaData *metadata = TheMapCache != NULL ? TheMapCache->findMap(map) : NULL;
		json += ",\"map\":\"" + json_escape(map.str()) + "\"";
		json += ",\"inGame\":";
		json += game->isInGame() ? "true" : "false";
		json += ",\"gameInProgress\":";
		json += game->isGameInProgress() ? "true" : "false";
		json += ",\"gameId\":" + std::to_string(static_cast<long long>(game->getGameID()));
		const Int local_slot = game->isInGame() ? game->getLocalSlotNum() : -1;
		json += ",\"localSlot\":" + std::to_string(static_cast<long long>(local_slot));
		json += ",\"numPlayers\":" + std::to_string(static_cast<long long>(game->getNumPlayers()));
		json += ",\"mapCRC\":" + std::to_string(static_cast<unsigned long long>(game->getMapCRC()));
		json += ",\"mapSize\":" + std::to_string(static_cast<unsigned long long>(game->getMapSize()));
		json += ",\"mapContentsMask\":" + std::to_string(static_cast<long long>(game->getMapContentsMask()));
		json += ",\"seed\":" + std::to_string(static_cast<long long>(game->getSeed()));
		append_map_metadata_json(json, "metadata", metadata);
		json += ",\"slots\":[";
		bool first_slot = true;
		for (Int slot_num = 0; slot_num < MAX_SLOTS; ++slot_num) {
			const GameSlot *slot = game->getConstSlot(slot_num);
			if (slot == NULL || !slot->isOccupied()) {
				continue;
			}
			if (!first_slot) {
				json += ",";
			}
			first_slot = false;
			json += "{";
			json += "\"slot\":" + std::to_string(static_cast<long long>(slot_num));
			json += ",\"state\":" + std::to_string(static_cast<long long>(slot->getState()));
			json += ",\"accepted\":";
			json += slot->isAccepted() ? "true" : "false";
			json += ",\"hasMap\":";
			json += slot->hasMap() ? "true" : "false";
			json += ",\"human\":";
			json += slot->isHuman() ? "true" : "false";
			json += ",\"ai\":";
			json += slot->isAI() ? "true" : "false";
			json += ",\"color\":" + std::to_string(static_cast<long long>(slot->getColor()));
			json += ",\"startPos\":" + std::to_string(static_cast<long long>(slot->getStartPos()));
			json += ",\"teamNumber\":" + std::to_string(static_cast<long long>(slot->getTeamNumber()));
			json += ",\"ip\":" + std::to_string(static_cast<unsigned long long>(slot->getIP()));
			json += ",\"port\":" + std::to_string(static_cast<unsigned long long>(slot->getPort()));
			json += ",\"name\":\"" + json_escape(unicode_to_debug_ascii(slot->getName())) + "\"";
			append_player_template_json(json, "playerTemplate", slot->getPlayerTemplate());
			append_player_template_json(json, "originalPlayerTemplate", slot->getOriginalPlayerTemplate());
			json += "}";
		}
		json += "]";
		append_game_slot_json(json, "slot0", game, 0);
		if (local_slot >= 0 && local_slot != 0) {
			append_game_slot_json(json, "localSlotInfo", game, local_slot);
		}
	}
	json += "}";
}

const char *player_type_name(PlayerType type)
{
	switch (type) {
	case PLAYER_HUMAN:
		return "human";
	case PLAYER_COMPUTER:
		return "computer";
	default:
		return "unknown";
	}
}

const char *difficulty_name(GameDifficulty difficulty)
{
	switch (difficulty) {
	case DIFFICULTY_EASY:
		return "easy";
	case DIFFICULTY_NORMAL:
		return "normal";
	case DIFFICULTY_HARD:
		return "hard";
	default:
		return "unknown";
	}
}

const char *relationship_name(Relationship relationship)
{
	switch (relationship) {
	case ENEMIES:
		return "enemy";
	case NEUTRAL:
		return "neutral";
	case ALLIES:
		return "ally";
	default:
		return "unknown";
	}
}

struct PlayerObjectDiagnostics
{
	PlayerObjectDiagnostics()
		: objects(0),
			structures(0),
			infantry(0),
			vehicles(0),
			commandCenters(0),
			productionObjects(0),
			dozers(0),
			harvesters(0),
			supplySources(0),
			sampleCount(0)
	{
	}

	Int objects;
	Int structures;
	Int infantry;
	Int vehicles;
	Int commandCenters;
	Int productionObjects;
	Int dozers;
	Int harvesters;
	Int supplySources;
	Int sampleCount;
	std::string samples;
};

void append_player_object_sample(
	PlayerObjectDiagnostics &diagnostics,
	Object *obj,
	const ThingTemplate *thing_template)
{
	if (diagnostics.sampleCount >= 8 || obj == NULL) {
		return;
	}
	if (!diagnostics.samples.empty()) {
		diagnostics.samples += ",";
	}
	diagnostics.samples += "{";
	diagnostics.samples += "\"id\":" + std::to_string(static_cast<long long>(obj->getID()));
	diagnostics.samples += ",\"template\":\"";
	diagnostics.samples += json_escape(
		thing_template != NULL && thing_template->getName().str() != NULL
			? thing_template->getName().str()
			: "");
	diagnostics.samples += "\"";
	const Coord3D *position = obj->getPosition();
	if (position != NULL &&
			std::isfinite(position->x) &&
			std::isfinite(position->y) &&
			std::isfinite(position->z)) {
		append_coord3d_fields(diagnostics.samples, "position", *position);
	} else {
		diagnostics.samples += ",\"position\":null";
	}
	diagnostics.samples += "}";
	++diagnostics.sampleCount;
}

void append_player_runtime_diagnostics(std::string &json)
{
	json += ",\"playerDiagnostics\":{";
	json += "\"playerListReady\":";
	json += ThePlayerList != NULL ? "true" : "false";
	json += ",\"gameLogicReady\":";
	json += TheGameLogic != NULL ? "true" : "false";
	if (ThePlayerList == NULL) {
		json += ",\"playerCount\":0,\"localPlayerIndex\":null,"
			"\"unownedObjects\":0,\"invalidOwnerObjects\":0,\"players\":[]}";
		return;
	}

	PlayerObjectDiagnostics object_diagnostics[MAX_PLAYER_COUNT];
	Int unowned_objects = 0;
	Int invalid_owner_objects = 0;
	if (TheGameLogic != NULL) {
		for (Object *obj = TheGameLogic->getFirstObject();
				obj != NULL;
				obj = obj->getNextObject()) {
			Player *owner = NULL;
			try {
				owner = obj->getControllingPlayer();
			} catch (...) {
				owner = NULL;
			}
			if (owner == NULL) {
				++unowned_objects;
				continue;
			}
			const Int owner_index = owner->getPlayerIndex();
			if (owner_index < 0 || owner_index >= MAX_PLAYER_COUNT) {
				++invalid_owner_objects;
				continue;
			}

			PlayerObjectDiagnostics &diagnostics = object_diagnostics[owner_index];
			++diagnostics.objects;
			const ThingTemplate *thing_template = NULL;
			try {
				thing_template = obj->getTemplate();
			} catch (...) {
				thing_template = NULL;
			}
			if (obj->isKindOf(KINDOF_STRUCTURE)) {
				++diagnostics.structures;
			}
			if (obj->isKindOf(KINDOF_INFANTRY)) {
				++diagnostics.infantry;
			}
			if (obj->isKindOf(KINDOF_VEHICLE)) {
				++diagnostics.vehicles;
			}
			if (obj->isKindOf(KINDOF_COMMANDCENTER)) {
				++diagnostics.commandCenters;
			}
			if (obj->getProductionUpdateInterface() != NULL) {
				++diagnostics.productionObjects;
			}
			if (thing_template != NULL && thing_template->isKindOf(KINDOF_DOZER)) {
				++diagnostics.dozers;
			}
			if (thing_template != NULL && thing_template->isKindOf(KINDOF_HARVESTER)) {
				++diagnostics.harvesters;
			}
			if (thing_template != NULL && thing_template->isKindOf(KINDOF_SUPPLY_SOURCE)) {
				++diagnostics.supplySources;
			}
			append_player_object_sample(diagnostics, obj, thing_template);
		}
	}

	Player *local_player = ThePlayerList->getLocalPlayer();
	json += ",\"playerCount\":" + std::to_string(ThePlayerList->getPlayerCount());
	json += ",\"localPlayerIndex\":";
	json += local_player != NULL
		? std::to_string(static_cast<long long>(local_player->getPlayerIndex()))
		: "null";
	json += ",\"unownedObjects\":" + std::to_string(unowned_objects);
	json += ",\"invalidOwnerObjects\":" + std::to_string(invalid_owner_objects);
	json += ",\"players\":[";
	bool first_player = true;
	for (Int i = 0; i < ThePlayerList->getPlayerCount(); ++i) {
		Player *player = ThePlayerList->getNthPlayer(i);
		if (player == NULL) {
			continue;
		}
		if (!first_player) {
			json += ",";
		}
		first_player = false;

		const PlayerObjectDiagnostics &diagnostics =
			object_diagnostics[player->getPlayerIndex() >= 0 &&
					player->getPlayerIndex() < MAX_PLAYER_COUNT
				? player->getPlayerIndex()
				: 0];
		const PlayerTemplate *player_template = player->getPlayerTemplate();
		const PlayerType player_type = player->getPlayerType();
		const GameDifficulty difficulty = player->getPlayerDifficulty();
		Int build_list_entries = 0;
		Int initially_built_entries = 0;
		for (BuildListInfo *info = player->getBuildList();
				info != NULL;
				info = info->getNext()) {
			++build_list_entries;
			if (info->isInitiallyBuilt()) {
				++initially_built_entries;
			}
		}

		json += "{";
		json += "\"index\":" + std::to_string(player->getPlayerIndex());
		json += ",\"local\":";
		json += player == local_player ? "true" : "false";
		json += ",\"name\":\"";
		json += json_escape(TheNameKeyGenerator != NULL
			? TheNameKeyGenerator->keyToName(player->getPlayerNameKey()).str()
			: "");
		json += "\"";
		json += ",\"displayName\":\"" + json_escape(unicode_to_debug_ascii(player->getPlayerDisplayName())) + "\"";
		json += ",\"side\":\"" + json_escape(player->getSide().str()) + "\"";
		json += ",\"baseSide\":\"" + json_escape(player->getBaseSide().str()) + "\"";
		json += ",\"playerType\":" + std::to_string(static_cast<Int>(player_type));
		json += ",\"playerTypeName\":\"" + std::string(player_type_name(player_type)) + "\"";
		json += ",\"skirmishAI\":";
		json += player->isSkirmishAIPlayer() ? "true" : "false";
		json += ",\"difficulty\":" + std::to_string(static_cast<Int>(difficulty));
		json += ",\"difficultyName\":\"" + std::string(difficulty_name(difficulty)) + "\"";
		json += ",\"active\":";
		json += player->isPlayerActive() ? "true" : "false";
		json += ",\"dead\":";
		json += player->isPlayerDead() ? "true" : "false";
		json += ",\"playableSide\":";
		json += player->isPlayableSide() ? "true" : "false";
		json += ",\"canBuildBase\":";
		json += player->getCanBuildBase() ? "true" : "false";
		json += ",\"canBuildUnits\":";
		json += player->getCanBuildUnits() ? "true" : "false";
		json += ",\"hasAnyObjects\":";
		json += player->hasAnyObjects() ? "true" : "false";
		json += ",\"hasAnyUnits\":";
		json += player->hasAnyUnits() ? "true" : "false";
		json += ",\"hasAnyBuildFacility\":";
		json += player->hasAnyBuildFacility() ? "true" : "false";
		json += ",\"money\":" + std::to_string(static_cast<long long>(player->getMoney()->countMoney()));
		json += ",\"color\":" +
			std::to_string(static_cast<unsigned long long>(static_cast<UnsignedInt>(player->getPlayerColor())));
		json += ",\"nightColor\":" +
			std::to_string(static_cast<unsigned long long>(static_cast<UnsignedInt>(player->getPlayerNightColor())));
		json += ",\"relationshipToLocal\":";
		if (local_player != NULL && local_player->getDefaultTeam() != NULL) {
			json += "\"" + std::string(relationship_name(player->getRelationship(local_player->getDefaultTeam()))) + "\"";
		} else {
			json += "null";
		}
		json += ",\"template\":{";
		json += "\"present\":";
		json += player_template != NULL ? "true" : "false";
		if (player_template != NULL) {
			json += ",\"name\":\"" + json_escape(player_template->getName().str()) + "\"";
			json += ",\"side\":\"" + json_escape(player_template->getSide().str()) + "\"";
			json += ",\"baseSide\":\"" + json_escape(player_template->getBaseSide().str()) + "\"";
			json += ",\"startingBuilding\":\"" + json_escape(player_template->getStartingBuilding().str()) + "\"";
		}
		json += "}";
		json += ",\"buildList\":{\"entries\":" + std::to_string(build_list_entries);
		json += ",\"initiallyBuilt\":" + std::to_string(initially_built_entries) + "}";
		json += ",\"objects\":{";
		json += "\"total\":" + std::to_string(diagnostics.objects);
		json += ",\"structures\":" + std::to_string(diagnostics.structures);
		json += ",\"infantry\":" + std::to_string(diagnostics.infantry);
		json += ",\"vehicles\":" + std::to_string(diagnostics.vehicles);
		json += ",\"commandCenters\":" + std::to_string(diagnostics.commandCenters);
		json += ",\"productionObjects\":" + std::to_string(diagnostics.productionObjects);
		json += ",\"dozers\":" + std::to_string(diagnostics.dozers);
		json += ",\"harvesters\":" + std::to_string(diagnostics.harvesters);
		json += ",\"supplySources\":" + std::to_string(diagnostics.supplySources);
		json += ",\"samples\":[";
		json += diagnostics.samples;
		json += "]}";
		json += "}";
	}
	json += "]}";
}

void append_ai_runtime_state(std::string &json)
{
	json += ",\"ai\":{";
	json += "\"ready\":";
	json += TheAI != NULL ? "true" : "false";
	if (TheAI != NULL) {
		const TAiData *ai_data = TheAI->getAiData();
		int side_info_count = 0;
		for (const AISideInfo *info = ai_data != NULL ? ai_data->m_sideInfo : NULL;
				info != NULL;
				info = info->m_next) {
			++side_info_count;
		}
		int build_list_count = 0;
		for (const AISideBuildList *build = ai_data != NULL ? ai_data->m_sideBuildLists : NULL;
				build != NULL;
				build = build->m_next) {
			++build_list_count;
		}
		json += ",\"pathfinderReady\":";
		json += TheAI->pathfinder() != NULL ? "true" : "false";
		json += ",\"aiDataReady\":";
		json += ai_data != NULL ? "true" : "false";
		json += ",\"sideInfoCount\":" + std::to_string(side_info_count);
		json += ",\"buildListCount\":" + std::to_string(build_list_count);
		json += ",\"forceSkirmishAI\":";
		json += ai_data != NULL && ai_data->m_forceSkirmishAI ? "true" : "false";
	} else {
		json += ",\"pathfinderReady\":false,\"aiDataReady\":false,"
			"\"sideInfoCount\":0,\"buildListCount\":0,\"forceSkirmishAI\":false";
	}
	json += "}";
}

void append_real_engine_frame_summary_state(std::string &json)
{
	json += ",\"inputSettings\":{\"useAlternateMouse\":";
	if (TheGlobalData != NULL) {
		json += TheGlobalData->m_useAlternateMouse ? "true" : "false";
	} else {
		json += "null";
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
	append_real_view_state(json);
	append_real_particle_state(json);
	append_shroud_state(json);
	json += ",\"gameplay\":{";
	if (TheGameLogic != NULL) {
		json += "\"gameLogicReady\":true";
		json += ",\"inGame\":";
		json += TheGameLogic->isInGame() ? "true" : "false";
		json += ",\"gameMode\":" + std::to_string(TheGameLogic->getGameMode());
		json += ",\"logicFrame\":" + std::to_string(TheGameLogic->getFrame());
		json += ",\"objectCount\":" + std::to_string(TheGameLogic->getObjectCount());
		json += ",\"loadingMap\":";
		json += TheGameLogic->isLoadingMap() ? "true" : "false";
	} else {
		json += "\"gameLogicReady\":false,\"inGame\":null,\"gameMode\":null,"
			"\"logicFrame\":null,\"objectCount\":0,\"loadingMap\":null";
	}
	if (TheGameClient != NULL) {
		json += ",\"gameClientReady\":true";
		json += ",\"clientFrame\":" + std::to_string(TheGameClient->getFrame());
		json += ",\"drawableCount\":" + std::to_string(count_game_client_drawables());
		json += ",\"renderedObjectCount\":" + std::to_string(TheGameClient->getRenderedObjectCount());
	} else {
		json += ",\"gameClientReady\":false,\"clientFrame\":null,"
			"\"drawableCount\":0,\"renderedObjectCount\":0";
	}
	Player *local_player = ThePlayerList != NULL ? ThePlayerList->getLocalPlayer() : NULL;
	json += ",\"localPlayer\":{\"ready\":";
	json += local_player != NULL ? "true" : "false";
	if (local_player != NULL) {
		json += ",\"active\":";
		json += local_player->isPlayerActive() ? "true" : "false";
		json += ",\"side\":\"" + json_escape(local_player->getSide().str()) + "\"";
	} else {
		json += ",\"active\":null,\"side\":\"\"";
	}
	json += "}";
	if (g_player_runtime_diagnostics_enabled) {
		append_player_runtime_diagnostics(json);
	}
	append_ai_runtime_state(json);
	if (TheInGameUI != NULL) {
		json += ",\"inGameUIReady\":true";
		json += ",\"inputEnabled\":";
		json += TheInGameUI->getInputEnabled() ? "true" : "false";
		json += ",\"selectCount\":" + std::to_string(TheInGameUI->getSelectCount());
		json += ",\"selectedControllable\":";
		json += TheInGameUI->areSelectedObjectsControllable() ? "true" : "false";
	} else {
		json += ",\"inGameUIReady\":false,\"inputEnabled\":null,"
			"\"selectCount\":0,\"selectedControllable\":null";
	}
	append_military_subtitle_json(json);
	if (TheScriptEngine != NULL) {
		char fade_value[64];
		std::snprintf(fade_value, sizeof(fade_value), "%.3f", TheScriptEngine->getFadeValue());
		json += ",\"scriptEngineReady\":true";
		json += ",\"fade\":" + std::to_string(static_cast<Int>(TheScriptEngine->getFade()));
		json += ",\"fadeValue\":";
		json += fade_value;
	} else {
		json += ",\"scriptEngineReady\":false,\"fade\":null,\"fadeValue\":null";
	}
	append_campaign_intro_gate_summary(json);
	json += "}";
	append_minimal_control_bar_state(json);
	const TFlag *intro_done = find_script_flag("INTRO_DONE");
	Script *return_to_player_control = find_loaded_script("ReturnToPlayerControl");
	GameWindow *control_bar = find_window_by_name("ControlBar.wnd:ControlBarParent");
	const Bool control_bar_found = TheWindowManager != NULL && control_bar != NULL;
	const Bool control_bar_hidden = control_bar_found ? control_bar->winIsHidden() : true;
	const Bool control_bar_manager_hidden =
		control_bar_found ? TheWindowManager->isHidden(control_bar) : true;
	const Bool control_bar_enabled =
		control_bar_found ? TheWindowManager->isEnabled(control_bar) : false;
	const UnsignedInt control_bar_status =
		control_bar_found ? control_bar->winGetStatus() : WIN_STATUS_NO_INPUT;
	const Bool control_bar_clickable =
		control_bar_found &&
		!control_bar_manager_hidden &&
		control_bar_enabled &&
		(control_bar_status & WIN_STATUS_NO_INPUT) == 0;
	json += ",\"playerControl\":{";
	json += "\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	json += ",\"logicFrame\":";
	json += TheGameLogic != NULL ? std::to_string(TheGameLogic->getFrame()) : "null";
	json += ",\"inGame\":";
	json += (TheGameLogic != NULL && TheGameLogic->isInGame()) ? "true" : "false";
	json += ",\"inputEnabled\":";
	json += (TheInGameUI != NULL && TheInGameUI->getInputEnabled()) ? "true" : "false";
	json += ",\"introDone\":";
	if (intro_done != NULL) {
		json += intro_done->value ? "true" : "false";
	} else {
		json += "null";
	}
	json += ",\"letterBoxed\":";
	json += (TheDisplay != NULL && TheDisplay->isLetterBoxed()) ? "true" : "false";
	json += ",\"letterBoxFading\":";
	json += (TheDisplay != NULL && TheDisplay->isLetterBoxFading()) ? "true" : "false";
	json += ",\"controlBarFound\":";
	json += control_bar_found ? "true" : "false";
	json += ",\"controlBarHidden\":";
	json += control_bar_hidden ? "true" : "false";
	json += ",\"controlBarManagerHidden\":";
	json += control_bar_manager_hidden ? "true" : "false";
	json += ",\"controlBarClickable\":";
	json += control_bar_clickable ? "true" : "false";
	json += ",\"selectCount\":";
	json += TheInGameUI != NULL ? std::to_string(TheInGameUI->getSelectCount()) : "0";
	json += ",\"selectedControllable\":";
	json += (TheInGameUI != NULL && TheInGameUI->areSelectedObjectsControllable()) ? "true" : "false";
	json += ",\"returnToPlayerControlActive\":";
	if (return_to_player_control != NULL) {
		json += return_to_player_control->isActive() ? "true" : "false";
	} else {
		json += "null";
	}
	json += ",\"returnToPlayerControlFrameToEvaluate\":";
	json += return_to_player_control != NULL ?
		std::to_string(return_to_player_control->getFrameToEvaluate()) : "null";
	json += "}";
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

	// Wire TheWin32Mouse so WndProc mouse cases don't silently drop events.
	TheWin32Mouse = &browser_mouse();

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
	if (system == GadgetPushButtonSystem) {
		return "GadgetPushButtonSystem";
	}
	if (system == MainMenuSystem) {
		return "MainMenuSystem";
	}
	if (system == ControlBarSystem) {
		return "ControlBarSystem";
	}
	if (system == ControlBarObserverSystem) {
		return "ControlBarObserverSystem";
	}
	if (system == GeneralsExpPointsSystem) {
		return "GeneralsExpPointsSystem";
	}
	if (system == QuitMenuSystem) {
		return "QuitMenuSystem";
	}
	return "unknown";
}

const char *input_func_name(GameWinInputFunc input)
{
	if (input == NULL) {
		return "null";
	}
	if (input == GameWinDefaultInput) {
		return "GameWinDefaultInput";
	}
	if (input == GameWinBlockInput) {
		return "GameWinBlockInput";
	}
	if (input == GadgetPushButtonInput) {
		return "GadgetPushButtonInput";
	}
	if (input == ControlBarInput) {
		return "ControlBarInput";
	}
	if (input == LeftHUDInput) {
		return "LeftHUDInput";
	}
	if (input == GeneralsExpPointsInput) {
		return "GeneralsExpPointsInput";
	}
	return "unknown";
}

const char *gui_command_type_name(GUICommandType command)
{
	switch (command) {
		case GUI_COMMAND_NONE:
			return "GUI_COMMAND_NONE";
		case GUI_COMMAND_DOZER_CONSTRUCT:
			return "GUI_COMMAND_DOZER_CONSTRUCT";
		case GUI_COMMAND_DOZER_CONSTRUCT_CANCEL:
			return "GUI_COMMAND_DOZER_CONSTRUCT_CANCEL";
		case GUI_COMMAND_UNIT_BUILD:
			return "GUI_COMMAND_UNIT_BUILD";
		case GUI_COMMAND_CANCEL_UNIT_BUILD:
			return "GUI_COMMAND_CANCEL_UNIT_BUILD";
		case GUI_COMMAND_PLAYER_UPGRADE:
			return "GUI_COMMAND_PLAYER_UPGRADE";
		case GUI_COMMAND_OBJECT_UPGRADE:
			return "GUI_COMMAND_OBJECT_UPGRADE";
		case GUI_COMMAND_CANCEL_UPGRADE:
			return "GUI_COMMAND_CANCEL_UPGRADE";
		case GUI_COMMAND_ATTACK_MOVE:
			return "GUI_COMMAND_ATTACK_MOVE";
		case GUI_COMMAND_GUARD:
			return "GUI_COMMAND_GUARD";
		case GUI_COMMAND_STOP:
			return "GUI_COMMAND_STOP";
		case GUI_COMMAND_SET_RALLY_POINT:
			return "GUI_COMMAND_SET_RALLY_POINT";
		case GUI_COMMAND_SELL:
			return "GUI_COMMAND_SELL";
		case GUI_COMMAND_SPECIAL_POWER:
			return "GUI_COMMAND_SPECIAL_POWER";
		case GUI_COMMAND_PURCHASE_SCIENCE:
			return "GUI_COMMAND_PURCHASE_SCIENCE";
		case GUI_COMMAND_SPECIAL_POWER_CONSTRUCT:
			return "GUI_COMMAND_SPECIAL_POWER_CONSTRUCT";
		default:
			return "GUI_COMMAND_OTHER";
	}
}

const char *game_message_type_name(Int message_type)
{
	switch (static_cast<GameMessage::Type>(message_type)) {
		case GameMessage::MSG_INVALID:
			return "MSG_INVALID";
		case GameMessage::MSG_META_TOGGLE_ATTACKMOVE:
			return "MSG_META_TOGGLE_ATTACKMOVE";
		case GameMessage::MSG_DO_ATTACK_OBJECT:
			return "MSG_DO_ATTACK_OBJECT";
		case GameMessage::MSG_DO_FORCE_ATTACK_OBJECT:
			return "MSG_DO_FORCE_ATTACK_OBJECT";
		case GameMessage::MSG_DO_FORCE_ATTACK_GROUND:
			return "MSG_DO_FORCE_ATTACK_GROUND";
		case GameMessage::MSG_DOCK:
			return "MSG_DOCK";
		case GameMessage::MSG_DO_MOVETO:
			return "MSG_DO_MOVETO";
		case GameMessage::MSG_DO_ATTACKMOVETO:
			return "MSG_DO_ATTACKMOVETO";
		case GameMessage::MSG_DO_FORCEMOVETO:
			return "MSG_DO_FORCEMOVETO";
		case GameMessage::MSG_ADD_WAYPOINT:
			return "MSG_ADD_WAYPOINT";
		case GameMessage::MSG_DO_GUARD_POSITION:
			return "MSG_DO_GUARD_POSITION";
		case GameMessage::MSG_DO_STOP:
			return "MSG_DO_STOP";
		default:
			return "MSG_OTHER";
	}
}

// ADD-ONLY Stage-0b diagnostic: resolve a window's draw callback to a symbolic
// name by direct pointer comparison against the linked W3D draw functions.
// NULL or GameWinDefaultDraw here would indicate cause (c'-draw missing); a
// real W3D*Draw confirms the HUD paint path is wired (paints-or-overdraw).
const char *draw_func_name(GameWinDrawFunc draw)
{
	if (draw == NULL) {
		return "null";
	}
	if (draw == GameWinDefaultDraw) {
		return "GameWinDefaultDraw";
	}
	if (draw == W3DGameWinDefaultDraw) {
		return "W3DGameWinDefaultDraw";
	}
	if (draw == W3DLeftHUDDraw) {
		return "W3DLeftHUDDraw";
	}
	if (draw == W3DRightHUDDraw) {
		return "W3DRightHUDDraw";
	}
	if (draw == W3DPowerDraw) {
		return "W3DPowerDraw";
	}
	if (draw == W3DCommandBarBackgroundDraw) {
		return "W3DCommandBarBackgroundDraw";
	}
	if (draw == W3DCommandBarTopDraw) {
		return "W3DCommandBarTopDraw";
	}
	if (draw == W3DCommandBarGridDraw) {
		return "W3DCommandBarGridDraw";
	}
	if (draw == W3DCommandBarForegroundDraw) {
		return "W3DCommandBarForegroundDraw";
	}
	if (draw == W3DCommandBarGenExpDraw) {
		return "W3DCommandBarGenExpDraw";
	}
	if (draw == W3DCommandBarHelpPopupDraw) {
		return "W3DCommandBarHelpPopupDraw";
	}
	if (draw == W3DNoDraw) {
		return "W3DNoDraw";
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
	json += ",\"inputFunc\":\"";
	json += input_func_name(window->winGetInputFunc());
	json += "\"";
	json += ",\"drawFunc\":\"";
	json += draw_func_name(window->winGetDrawFunc());
	json += "\"";
	json += ",\"hidden\":";
	json += window->winIsHidden() ? "true" : "false";
	json += "}";
}

void append_command_button_json(std::string &json, const CommandButton *command)
{
	if (command == NULL) {
		json += "null";
		return;
	}

	const ThingTemplate *build_template = command->getThingTemplate();
	json += "{\"name\":\"" + json_escape(command->getName().str()) + "\"";
	json += ",\"type\":" + std::to_string(static_cast<int>(command->getCommandType()));
	json += ",\"typeName\":\"";
	json += gui_command_type_name(command->getCommandType());
	json += "\"";
	json += ",\"options\":" + std::to_string(command->getOptions());
	json += ",\"contextCommand\":";
	json += command->isContextCommand() ? "true" : "false";
	json += ",\"buildTemplate\":";
	if (build_template != NULL) {
		json += "\"" + json_escape(build_template->getName().str()) + "\"";
	} else {
		json += "null";
	}
	json += "}";
}

void append_image_ref_json(std::string &json, const char *field_name, const Image *image)
{
	json += ",\"";
	json += field_name != NULL ? field_name : "image";
	json += "\":{";
	json += "\"present\":";
	json += image != NULL ? "true" : "false";
	if (image != NULL) {
		json += ",\"name\":\"" + json_escape(image->getName().str()) + "\"";
		json += ",\"filename\":\"" + json_escape(image->getFilename().str()) + "\"";
		json += ",\"width\":" + std::to_string(static_cast<long long>(image->getImageWidth()));
		json += ",\"height\":" + std::to_string(static_cast<long long>(image->getImageHeight()));
		const ICoord2D *texture_size = image->getTextureSize();
		json += ",\"textureWidth\":";
		json += texture_size != NULL ? std::to_string(static_cast<long long>(texture_size->x)) : "null";
		json += ",\"textureHeight\":";
		json += texture_size != NULL ? std::to_string(static_cast<long long>(texture_size->y)) : "null";
		json += ",\"status\":" + std::to_string(static_cast<unsigned long long>(image->getStatus()));
	}
	json += "}";
}

void append_map_preview_diagnostic_json(std::string &json, const char *field_name)
{
	json += ",\"";
	json += field_name != NULL ? field_name : "mapPreviewDiagnostic";
	json += "\":{";
	json += "\"mapName\":\"";
	json += json_escape(cnc_port_last_map_preview_map_name() != NULL
		? cnc_port_last_map_preview_map_name() : "");
	json += "\"";
	json += ",\"tgaName\":\"";
	json += json_escape(cnc_port_last_map_preview_tga_name() != NULL
		? cnc_port_last_map_preview_tga_name() : "");
	json += "\"";
	json += ",\"portableName\":\"";
	json += json_escape(cnc_port_last_map_preview_portable_name() != NULL
		? cnc_port_last_map_preview_portable_name() : "");
	json += "\"";
	json += ",\"imageName\":\"";
	json += json_escape(cnc_port_last_map_preview_image_name() != NULL
		? cnc_port_last_map_preview_image_name() : "");
	json += "\"";
	json += ",\"directory\":\"";
	json += json_escape(cnc_port_last_map_preview_dir() != NULL
		? cnc_port_last_map_preview_dir() : "");
	json += "\"";
	json += ",\"outputPath\":\"";
	json += json_escape(cnc_port_last_map_preview_output_path() != NULL
		? cnc_port_last_map_preview_output_path() : "");
	json += "\"";
	json += ",\"fileSize\":";
	json += std::to_string(static_cast<long long>(cnc_port_last_map_preview_file_size()));
	json += ",\"foundExisting\":";
	json += cnc_port_last_map_preview_found_existing() ? "true" : "false";
	json += ",\"sourceOpenOk\":";
	json += cnc_port_last_map_preview_source_open_ok() ? "true" : "false";
	json += ",\"createDirOk\":";
	json += cnc_port_last_map_preview_create_dir_ok() ? "true" : "false";
	json += ",\"copyOk\":";
	json += cnc_port_last_map_preview_copy_ok() ? "true" : "false";
	json += ",\"imageCreated\":";
	json += cnc_port_last_map_preview_image_created() ? "true" : "false";
	json += ",\"returnedImage\":";
	json += cnc_port_last_map_preview_returned_image() ? "true" : "false";
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
	json += ",\"inputFunc\":\"";
	json += input_func_name(window->winGetInputFunc());
	json += "\"";
	json += ",\"drawFunc\":\"";
	json += draw_func_name(window->winGetDrawFunc());
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
	if (inst_data != NULL) {
		UnicodeString text = inst_data->getText();
		json += ",\"text\":\"" + json_escape(unicode_to_debug_ascii(text)) + "\"";
		json += ",\"textLength\":" + std::to_string(static_cast<long long>(text.getLength()));
		json += ",\"textLabel\":\"" + json_escape(inst_data->m_textLabelString.str()) + "\"";
		append_image_ref_json(json, "enabledImage0", window->winGetEnabledImage(0));
	}
	json += ",\"owner\":";
	append_window_identity_json(json, inst_data != NULL ? inst_data->getOwner() : NULL);
	const char *command_button_prefix = "ControlBar.wnd:ButtonCommand";
	const char *science_button_prefix = "GeneralsExpPoints.wnd:ButtonRank";
	const char *general_button_name = "ControlBar.wnd:ButtonGeneral";
	if (requested_name != NULL
		&& ((std::strncmp(requested_name,
			command_button_prefix, std::strlen(command_button_prefix)) == 0)
			|| (std::strncmp(requested_name,
				science_button_prefix, std::strlen(science_button_prefix)) == 0)
			|| std::strcmp(requested_name, general_button_name) == 0)) {
		const CommandButton *command =
			static_cast<const CommandButton *>(GadgetButtonGetData(window));
		json += ",\"command\":";
		append_command_button_json(json, command);
	}
	json += "}";
}

void append_window_probe(std::string &json, const char *field_name, const char *window_name)
{
	json += ",\"";
	json += field_name;
	json += "\":";
	append_window_json(json, find_window_by_name(window_name), window_name);
}

void append_generals_exp_rank_window_probes(
	std::string &json, const char *field_prefix, const char *window_prefix, int count)
{
	for (int i = 0; i < count; ++i) {
		char field_name[64];
		char window_name[96];
		std::snprintf(field_name, sizeof(field_name), "%s%d", field_prefix, i);
		std::snprintf(window_name, sizeof(window_name), "%s%d", window_prefix, i);
		append_window_probe(json, field_name, window_name);
	}
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
		Int tooltip_width = 0;
		Int tooltip_height = 0;
		TheMouse->getCursorTooltipSizeForDebug(&tooltip_width, &tooltip_height);
		const UnicodeString tooltip_text = TheMouse->getCursorTooltipTextForDebug();
		json += ",\"tooltip\":{";
		json += "\"displayed\":";
		json += TheMouse->isCursorTooltipDisplayedForDebug() ? "true" : "false";
		json += ",\"empty\":";
		json += TheMouse->isCursorTooltipEmptyForDebug() ? "true" : "false";
		json += ",\"text\":\"" + json_escape(unicode_to_debug_ascii(tooltip_text)) + "\"";
		json += ",\"textLength\":" + std::to_string(static_cast<long long>(tooltip_text.getLength()));
		json += ",\"displayStringLength\":"
			+ std::to_string(TheMouse->getCursorTooltipTextLengthForDebug());
		json += ",\"width\":" + std::to_string(tooltip_width);
		json += ",\"height\":" + std::to_string(tooltip_height);
		json += ",\"highlightPos\":"
			+ std::to_string(TheMouse->getCursorTooltipHighlightPosForDebug());
		json += ",\"fillTime\":"
			+ std::to_string(TheMouse->getCursorTooltipFillTimeForDebug());
		json += ",\"delayTime\":"
			+ std::to_string(TheMouse->getCursorTooltipDelayTimeForDebug());
		json += ",\"delayOverride\":"
			+ std::to_string(TheMouse->getCursorTooltipDelayOverrideForDebug());
		json += ",\"stillTime\":"
			+ std::to_string(TheMouse->getCursorTooltipStillTimeForDebug());
		json += "}";
		Int cursor_text_width = 0;
		Int cursor_text_height = 0;
		TheMouse->getCursorTextSizeForDebug(&cursor_text_width, &cursor_text_height);
		const UnicodeString cursor_text = TheMouse->getCursorTextForDebug();
		json += ",\"cursorText\":{";
		json += "\"text\":\"" + json_escape(unicode_to_debug_ascii(cursor_text)) + "\"";
		json += ",\"textLength\":" + std::to_string(static_cast<long long>(cursor_text.getLength()));
		json += ",\"displayStringLength\":"
			+ std::to_string(TheMouse->getCursorTextLengthForDebug());
		json += ",\"width\":" + std::to_string(cursor_text_width);
		json += ",\"height\":" + std::to_string(cursor_text_height);
		json += "}";
	} else {
		json += ",\"visible\":null,\"cursor\":null,\"x\":null,\"y\":null,"
			"\"leftState\":null,\"leftEvent\":null,\"leftFrame\":null,"
			"\"middleState\":null,\"middleEvent\":null,"
			"\"rightState\":null,\"rightEvent\":null,"
			"\"tooltip\":null,\"cursorText\":null";
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

void append_radar_state(std::string &json)
{
	json += ",\"radar\":{";
	json += "\"ready\":";
	json += TheRadar != NULL ? "true" : "false";

	Player *local_player = ThePlayerList != NULL ? ThePlayerList->getLocalPlayer() : NULL;
	json += ",\"localPlayerReady\":";
	json += local_player != NULL ? "true" : "false";

	if (TheRadar == NULL) {
		json += ",\"hidden\":null,\"forced\":null,"
			"\"localPlayerHasRadar\":null,\"usable\":false}";
		return;
	}

	const Bool hidden = TheRadar->isRadarHidden();
	const Bool forced = TheRadar->isRadarForced();
	const Bool local_player_has_radar =
		local_player != NULL ? local_player->hasRadar() : FALSE;
	json += ",\"hidden\":";
	json += hidden ? "true" : "false";
	json += ",\"forced\":";
	json += forced ? "true" : "false";
	json += ",\"localPlayerHasRadar\":";
	json += local_player_has_radar ? "true" : "false";
	json += ",\"usable\":";
	json += (forced || (!hidden && local_player_has_radar)) ? "true" : "false";
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
	json += ",\"inputSettings\":{\"useAlternateMouse\":";
	if (TheGlobalData != NULL) {
		json += TheGlobalData->m_useAlternateMouse ? "true" : "false";
	} else {
		json += "null";
	}
	json += "}";

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

	append_real_view_state(json);
	append_real_particle_state(json);
	append_shroud_state(json);
	append_radar_state(json);

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
	json += ",\"lifecycleDebug\":{";
	json += "\"newGameCount\":" + std::to_string(cnc_port_logic_dispatch_new_game_count());
	json += ",\"lastNewGameMode\":" + std::to_string(cnc_port_logic_dispatch_last_new_game_mode());
	json += ",\"prepareNewGameCount\":" + std::to_string(cnc_port_logic_dispatch_prepare_new_game_count());
	json += ",\"lastPrepareNewGameMode\":" + std::to_string(cnc_port_logic_dispatch_last_prepare_new_game_mode());
	json += ",\"lastModeAfterSet\":" + std::to_string(cnc_port_logic_dispatch_last_mode_after_set());
	json += ",\"prepareThisIsGlobal\":";
	json += cnc_port_logic_dispatch_prepare_this_is_global() != 0 ? "true" : "false";
	json += ",\"prepareHideShellCount\":" + std::to_string(cnc_port_logic_dispatch_prepare_hide_shell_count());
	json += ",\"clearGameDataCount\":" + std::to_string(cnc_port_logic_dispatch_clear_game_data_count());
	json += "}";

	append_ai_runtime_state(json);

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
	if (g_player_runtime_diagnostics_enabled) {
		append_player_runtime_diagnostics(json);
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
	append_military_subtitle_json(json);

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
	json += ",\"showShellCount\":" + std::to_string(cnc_port_shell_show_shell_count());
	json += ",\"showShellMapOnCount\":" + std::to_string(cnc_port_shell_show_shell_map_on_count());
	json += ",\"showShellMapOffCount\":" + std::to_string(cnc_port_shell_show_shell_map_off_count());
	json += ",\"hideShellCount\":" + std::to_string(cnc_port_shell_hide_shell_count());
	json += ",\"lastDoPushHadInit\":";
	json += cnc_port_shell_last_do_push_had_init() != 0 ? "true" : "false";
	json += ",\"lastPushName\":\"";
	json += json_escape(cnc_port_shell_last_push_name() != NULL ?
		cnc_port_shell_last_push_name() : "");
	json += "\",\"lastDoPushName\":\"";
	json += json_escape(cnc_port_shell_last_do_push_name() != NULL ?
		cnc_port_shell_last_do_push_name() : "");
	json += "\",\"startNewGameShell\":{";
	json += "\"startNewGameCount\":" + std::to_string(cnc_port_start_new_game_count());
	json += ",\"lastEntryMode\":" + std::to_string(cnc_port_start_new_game_last_entry_mode());
	json += ",\"lastAfterDefaultsMode\":" + std::to_string(cnc_port_start_new_game_last_after_defaults_mode());
	json += ",\"lastBeforeShellBranchMode\":" + std::to_string(cnc_port_start_new_game_last_before_shell_branch_mode());
	json += ",\"branchCount\":" + std::to_string(cnc_port_start_new_game_shell_branch_count());
	json += ",\"pushAttemptCount\":" + std::to_string(cnc_port_start_new_game_shell_push_attempt_count());
	json += ",\"revealExistingCount\":" + std::to_string(cnc_port_start_new_game_shell_reveal_existing_count());
	json += ",\"lastMode\":" + std::to_string(cnc_port_start_new_game_shell_last_mode());
	json += ",\"lastScreenCountBefore\":" + std::to_string(cnc_port_start_new_game_shell_last_screen_count_before());
	json += ",\"lastScreenCountAfter\":" + std::to_string(cnc_port_start_new_game_shell_last_screen_count_after());
	json += ",\"lastAction\":\"";
	json += json_escape(cnc_port_start_new_game_shell_last_action() != NULL ?
		cnc_port_start_new_game_shell_last_action() : "");
	json += "\"}}}";

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
	append_window_probe(json, "buttonMultiplayer", "MainMenu.wnd:ButtonMultiplayer");
	append_window_probe(json, "buttonNetwork", "MainMenu.wnd:ButtonNetwork");
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
	append_window_under_probe_center(json, "underButtonMultiplayerCenter", "MainMenu.wnd:ButtonMultiplayer");
	append_window_under_probe_center(json, "underButtonNetworkCenter", "MainMenu.wnd:ButtonNetwork");
	append_window_under_probe_center(json, "underButtonUSACenter", "MainMenu.wnd:ButtonUSA");
	append_window_under_probe_center(json, "underButtonEasyCenter", "MainMenu.wnd:ButtonEasy");
	json += "}";

	json += ",\"lanLobby\":{\"queried\":true";
	append_window_probe(json, "parent", "LanLobbyMenu.wnd:LanLobbyMenuParent");
	append_window_probe(json, "buttonHost", "LanLobbyMenu.wnd:ButtonHost");
	append_window_probe(json, "buttonJoin", "LanLobbyMenu.wnd:ButtonJoin");
	append_window_probe(json, "buttonBack", "LanLobbyMenu.wnd:ButtonBack");
	append_window_probe(json, "games", "LanLobbyMenu.wnd:ListboxGames");
	json += "}";

	json += ",\"lanGameOptions\":{\"queried\":true";
	append_window_probe(json, "parent", "LanGameOptionsMenu.wnd:LanGameOptionsMenuParent");
	append_window_probe(json, "buttonStart", "LanGameOptionsMenu.wnd:ButtonStart");
	append_window_probe(json, "buttonAccept", "LanGameOptionsMenu.wnd:ButtonAccept");
	append_window_probe(json, "buttonBack", "LanGameOptionsMenu.wnd:ButtonBack");
	append_window_probe(json, "mapWindow", "LanGameOptionsMenu.wnd:MapWindow");
	json += "}";

	json += ",\"skirmishMenu\":{\"queried\":true";
	append_window_probe(json, "parent", "SkirmishGameOptionsMenu.wnd:SkirmishGameOptionsMenuParent");
	append_window_probe(json, "buttonStart", "SkirmishGameOptionsMenu.wnd:ButtonStart");
	append_window_probe(json, "buttonBack", "SkirmishGameOptionsMenu.wnd:ButtonBack");
	append_window_probe(json, "mapWindow", "SkirmishGameOptionsMenu.wnd:MapWindow");
	append_window_probe(json, "sliderGameSpeed", "SkirmishGameOptionsMenu.wnd:SliderGameSpeed");
	GameWindow *skirmish_player_name =
		find_window_by_name("SkirmishGameOptionsMenu.wnd:TextEntryPlayerName");
	json += ",\"textEntryPlayerName\":";
	append_window_json(json, skirmish_player_name,
		"SkirmishGameOptionsMenu.wnd:TextEntryPlayerName");
	json += ",\"playerNameText\":";
	if (skirmish_player_name != NULL) {
		json += "\"" + json_escape(unicode_to_debug_ascii(
			GadgetTextEntryGetText(skirmish_player_name))) + "\"";
	} else {
		json += "null";
	}
	json += ",\"imeAttached\":";
	json += TheIMEManager != NULL &&
		TheIMEManager->isAttachedTo(skirmish_player_name) ? "true" : "false";
	json += ",\"imeComposing\":";
	json += TheIMEManager != NULL && TheIMEManager->isComposing() ? "true" : "false";
	append_window_under_probe_center(json, "underButtonStartCenter", "SkirmishGameOptionsMenu.wnd:ButtonStart");
	json += "}";

	// General's Challenge menu (Zero Hour): lets the harness drive the challenge
	// start path (select a general position, then click "Play Game").
	json += ",\"challengeMenu\":{\"queried\":true";
	append_window_probe(json, "parent", "ChallengeMenu.wnd:ParentChallengeMenu");
	append_window_probe(json, "buttonPlay", "ChallengeMenu.wnd:ButtonPlay");
	append_window_probe(json, "buttonBack", "ChallengeMenu.wnd:ButtonBack");
	append_window_probe(json, "generalPosition0", "ChallengeMenu.wnd:GeneralPosition0");
	append_window_probe(json, "generalPosition1", "ChallengeMenu.wnd:GeneralPosition1");
	append_window_probe(json, "generalPosition2", "ChallengeMenu.wnd:GeneralPosition2");
	append_window_probe(json, "generalPosition3", "ChallengeMenu.wnd:GeneralPosition3");
	append_window_under_probe_center(json, "underButtonPlayCenter", "ChallengeMenu.wnd:ButtonPlay");
	append_window_under_probe_center(json, "underGeneralPosition0Center", "ChallengeMenu.wnd:GeneralPosition0");
	append_window_under_probe_center(json, "underGeneralPosition1Center", "ChallengeMenu.wnd:GeneralPosition1");
	append_window_under_probe_center(json, "underGeneralPosition2Center", "ChallengeMenu.wnd:GeneralPosition2");
	append_window_under_probe_center(json, "underGeneralPosition3Center", "ChallengeMenu.wnd:GeneralPosition3");
	json += "}";

	json += ",\"loadScreen\":{\"queried\":true,\"multiplayer\":{\"queried\":true";
	append_window_probe(json, "mapPreview", "MultiplayerLoadScreen.wnd:WinMapPreview");
	append_window_probe(json, "localGeneralPortrait", "MultiplayerLoadScreen.wnd:LocalGeneralPortrait");
	append_window_probe(json, "localGeneralName", "MultiplayerLoadScreen.wnd:LocalGeneralName");
	append_window_probe(json, "progressLocal", "MultiplayerLoadScreen.wnd:ProgressLoad0");
	append_window_probe(json, "playerNameLocal", "MultiplayerLoadScreen.wnd:StaticTextPlayer0");
	append_window_probe(json, "playerSideLocal", "MultiplayerLoadScreen.wnd:StaticTextSide0");
	json += "}}";

	json += ",\"quitMenu\":{\"queried\":true";
	json += ",\"visible\":";
	json += (TheInGameUI != NULL && TheInGameUI->isQuitMenuVisible()) ? "true" : "false";
	json += ",\"quitMenuSystemLookup\":";
	json += (TheFunctionLexicon != NULL && TheNameKeyGenerator != NULL &&
		TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey("QuitMenuSystem")) == QuitMenuSystem) ?
		"true" : "false";
	append_window_probe(json, "fullParent", "QuitMenu.wnd:QuitMenuParent");
	append_window_probe(json, "noSaveParent", "QuitNoSave.wnd:QuitMenuParent");
	append_window_probe(json, "buttonReturnFull", "QuitMenu.wnd:ButtonReturn");
	append_window_probe(json, "buttonReturnNoSave", "QuitNoSave.wnd:ButtonReturn");
	append_window_probe(json, "buttonExitFull", "QuitMenu.wnd:ButtonExit");
	append_window_probe(json, "buttonExitNoSave", "QuitNoSave.wnd:ButtonExit");
	append_window_probe(json, "buttonOptionsFull", "QuitMenu.wnd:ButtonOptions");
	append_window_probe(json, "buttonOptionsNoSave", "QuitNoSave.wnd:ButtonOptions");
	append_window_probe(json, "buttonRestartFull", "QuitMenu.wnd:ButtonRestart");
	append_window_probe(json, "buttonRestartNoSave", "QuitNoSave.wnd:ButtonRestart");
	append_window_under_probe_center(
		json, "underButtonReturnFullCenter", "QuitMenu.wnd:ButtonReturn");
	append_window_under_probe_center(
		json, "underButtonReturnNoSaveCenter", "QuitNoSave.wnd:ButtonReturn");
	json += "}";

	json += ",\"controlBarWindows\":{\"queried\":true";
	append_window_probe(json, "parent", "ControlBar.wnd:ControlBarParent");
	append_window_probe(json, "leftHud", "ControlBar.wnd:LeftHUD");
	append_window_probe(json, "rightHud", "ControlBar.wnd:RightHUD");
	append_window_probe(json, "moneyDisplay", "ControlBar.wnd:MoneyDisplay");
	append_window_probe(json, "powerWindow", "ControlBar.wnd:PowerWindow");
	append_window_probe(json, "buttonGeneral", "ControlBar.wnd:ButtonGeneral");
	append_window_probe(json, "buttonIdleWorker", "ControlBar.wnd:ButtonIdleWorker");
	// ADD-ONLY Stage-0b: the command-bar background/foreground/top frame windows.
	// BackgroundMarker drives the metallic background frame art (W3DCommandBarBackgroundDraw).
	append_window_probe(json, "backgroundMarker", "ControlBar.wnd:BackgroundMarker");
	append_window_probe(json, "foregroundMarker", "ControlBar.wnd:ForegroundMarker");
	append_window_probe(json, "generalsExp", "ControlBar.wnd:GeneralsExp");
	append_window_probe(json, "winUnitSelected", "ControlBar.wnd:WinUnitSelected");
	append_window_probe(json, "commandWindow", "ControlBar.wnd:CommandWindow");
	append_window_probe(json, "buttonCommand01", "ControlBar.wnd:ButtonCommand01");
	append_window_probe(json, "buttonCommand02", "ControlBar.wnd:ButtonCommand02");
	append_window_probe(json, "buttonCommand03", "ControlBar.wnd:ButtonCommand03");
	append_window_probe(json, "buttonCommand04", "ControlBar.wnd:ButtonCommand04");
	append_window_probe(json, "buttonCommand05", "ControlBar.wnd:ButtonCommand05");
	append_window_probe(json, "buttonCommand06", "ControlBar.wnd:ButtonCommand06");
	append_window_probe(json, "buttonCommand07", "ControlBar.wnd:ButtonCommand07");
	append_window_probe(json, "buttonCommand08", "ControlBar.wnd:ButtonCommand08");
	append_window_probe(json, "buttonCommand09", "ControlBar.wnd:ButtonCommand09");
	append_window_probe(json, "buttonCommand10", "ControlBar.wnd:ButtonCommand10");
	append_window_probe(json, "buttonCommand11", "ControlBar.wnd:ButtonCommand11");
	append_window_probe(json, "buttonCommand12", "ControlBar.wnd:ButtonCommand12");
	append_window_under_probe_center(
		json, "underButtonGeneralCenter", "ControlBar.wnd:ButtonGeneral");
	append_window_under_probe_center(
		json, "underButtonCommand01Center", "ControlBar.wnd:ButtonCommand01");
	append_window_probe(json, "onTopDraw", "ControlBar.wnd:OnTopDraw");
	json += "}";

	json += ",\"generalsExpWindows\":{\"queried\":true";
	append_window_probe(json, "parent", "GeneralsExpPoints.wnd:GenExpParent");
	append_window_probe(json, "buttonExit", "GeneralsExpPoints.wnd:ButtonExit");
	append_window_under_probe_center(
		json, "underButtonExitCenter", "GeneralsExpPoints.wnd:ButtonExit");
	append_window_probe(
		json, "staticTextRankPointsAvailable", "GeneralsExpPoints.wnd:StaticTextRankPointsAvailable");
	append_window_probe(json, "staticTextLevel", "GeneralsExpPoints.wnd:StaticTextLevel");
	append_window_probe(json, "progressBarExperience", "GeneralsExpPoints.wnd:ProgressBarExperience");
	append_window_probe(json, "staticTextTitle", "GeneralsExpPoints.wnd:StaticTextTitle");
	append_generals_exp_rank_window_probes(
		json, "buttonRank1Number", "GeneralsExpPoints.wnd:ButtonRank1Number", 4);
	append_generals_exp_rank_window_probes(
		json, "buttonRank3Number", "GeneralsExpPoints.wnd:ButtonRank3Number", 15);
	append_generals_exp_rank_window_probes(
		json, "buttonRank8Number", "GeneralsExpPoints.wnd:ButtonRank8Number", 4);
	json += "}";

	json += ",\"purchaseScience\":{\"queried\":true";
	json += ",\"showCount\":" + std::to_string(cnc_port_purchase_science_show_count());
	json += ",\"hideCount\":" + std::to_string(cnc_port_purchase_science_hide_count());
	json += ",\"toggleCount\":" + std::to_string(cnc_port_purchase_science_toggle_count());
	json += ",\"lastToggleBeforeHidden\":"
		+ std::to_string(cnc_port_purchase_science_last_toggle_before_hidden());
	json += ",\"lastToggleAfterHidden\":"
		+ std::to_string(cnc_port_purchase_science_last_toggle_after_hidden());
	json += ",\"lastShowBeforeHidden\":"
		+ std::to_string(cnc_port_purchase_science_last_show_before_hidden());
	json += ",\"lastShowAfterHidden\":"
		+ std::to_string(cnc_port_purchase_science_last_show_after_hidden());
	json += ",\"lastHideBeforeHidden\":"
		+ std::to_string(cnc_port_purchase_science_last_hide_before_hidden());
	json += ",\"lastHideAfterHidden\":"
		+ std::to_string(cnc_port_purchase_science_last_hide_after_hidden());
	json += ",\"showGameEndingReturns\":"
		+ std::to_string(cnc_port_purchase_science_show_game_ending_returns());
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

void run_real_engine_frames(int frame_count)
{
	if (frame_count < 1) {
		frame_count = 1;
	}
	reset_frame_texture_diagnostics();
	if (g_state.attempted && g_state.init_returned && TheGameEngine != NULL) {
		for (int frame = 0; frame < frame_count; ++frame) {
			++g_frame_state.frames_attempted;
			const double frame_started_at = emscripten_get_now();
			reset_engine_frame_profile();
			try {
				wasm_function_lexicon_repair_gameplay_callback_owners();
				clear_stale_movie_break_for_visible_main_menu();
				TheGameEngine->update();
				clear_stale_movie_break_for_visible_main_menu();
				++g_frame_state.frames_completed;
			} catch (const char *message) {
				g_frame_state.exception_caught = true;
				g_frame_state.exception_text = message != nullptr ? message : "(const char* exception)";
				finish_engine_frame_profile();
				break;
			} catch (...) {
				g_frame_state.exception_caught = true;
				g_frame_state.exception_text = "unhandled C++ exception escaping GameEngine::update";
				finish_engine_frame_profile();
				break;
			}
			g_frame_state.last_frame_ms = emscripten_get_now() - frame_started_at;
			finish_engine_frame_profile();
		}
	}
}

} // namespace

extern "C" void cnc_port_script_diag_push_context(const char *script_name, const char *branch)
{
	note_script_diag_context_push(script_name, branch);
}

extern "C" void cnc_port_script_diag_pop_context(void)
{
	note_script_diag_context_pop();
}

extern "C" void cnc_port_script_diag_note_timer_action(
	int action_type,
	const char *counter_name,
	int parameter_int,
	double parameter_real,
	int before_value,
	int before_countdown,
	int after_value,
	int after_countdown)
{
	note_script_diag_timer_action(
		action_type,
		counter_name,
		parameter_int,
		parameter_real,
		before_value,
		before_countdown != 0,
		after_value,
		after_countdown != 0);
}

extern "C" void cnc_port_script_diag_note_script_activation(
	int action_type,
	const char *target_name,
	int found_group,
	int group_active,
	int found_script,
	int script_active)
{
	note_script_diag_script_activation(
		action_type,
		target_name,
		found_group != 0,
		group_active != 0,
		found_script != 0,
		script_active != 0);
}

// One iteration of the original GameEngine::execute() loop: calls the real
// (virtual) TheGameEngine->update(), i.e. Win32GameEngine::update ->
// GameEngine::update (radar/audio/client/messages/logic) + serviceWindowsOS.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frame(int frame_count)
{
	run_real_engine_frames(frame_count);

	std::string json = "{";
	json += "\"initReturned\":";
	json += (g_state.attempted && g_state.init_returned) ? "true" : "false";
	json += ",\"source\":\"GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp::update via Win32GameEngine::update\"";
	json += ",\"framesAttempted\":" + std::to_string(g_frame_state.frames_attempted);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	json += ",\"staleMovieBreakClears\":" + std::to_string(g_frame_state.stale_movie_break_clears);
	json += ",\"lastUpdateTarget\":\"" + json_escape(g_last_engine_update_target) + "\"";
	json += ",\"lastGameLogicStep\":\"" + json_escape(g_last_game_logic_step) + "\"";
	json += ",\"loadSessionActive\":";
	json += (TheGameLogic != NULL && TheGameLogic->isLoadSessionActive()) ? "true" : "false";
	json += ",\"loadProgress\":" + std::to_string(
		TheGameLogic != NULL ? (long long)TheGameLogic->getLoadSessionProgress() : -1);
	append_last_script_step_json(json);
	append_frame_texture_diagnostics(json);
	append_engine_frame_profile_json(json);
	append_d3d8_draw_cache_json(json);
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

// Same real frame stepping as cnc_port_real_engine_frame(), but only exports
// the state needed by long gameplay/rendering gates. The verbose endpoint above
// remains the owner for full script catalogs, window probes, and detailed
// assertions.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frame_summary(int frame_count)
{
	run_real_engine_frames(frame_count);

	std::string json = "{";
	json += "\"summary\":true";
	json += ",\"initReturned\":";
	json += (g_state.attempted && g_state.init_returned) ? "true" : "false";
	json += ",\"source\":\"GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp::update via Win32GameEngine::update\"";
	json += ",\"framesAttempted\":" + std::to_string(g_frame_state.frames_attempted);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	json += ",\"staleMovieBreakClears\":" + std::to_string(g_frame_state.stale_movie_break_clears);
	json += ",\"lastUpdateTarget\":\"" + json_escape(g_last_engine_update_target) + "\"";
	json += ",\"lastGameLogicStep\":\"" + json_escape(g_last_game_logic_step) + "\"";
	json += ",\"loadSessionActive\":";
	json += (TheGameLogic != NULL && TheGameLogic->isLoadSessionActive()) ? "true" : "false";
	json += ",\"loadProgress\":" + std::to_string(
		TheGameLogic != NULL ? (long long)TheGameLogic->getLoadSessionProgress() : -1);
	append_last_script_step_json(json);
	append_frame_texture_diagnostics(json);
	append_engine_frame_profile_json(json);
	append_d3d8_draw_cache_json(json);
	json += ",\"quitting\":";
	json += (TheGameEngine != NULL && TheGameEngine->getQuitting() != FALSE) ? "true" : "false";
	json += ",\"exceptionCaught\":";
	json += g_frame_state.exception_caught ? "true" : "false";
	json += ",\"exception\":\"" + json_escape(g_frame_state.exception_text) + "\"";
	char elapsed[64];
	std::snprintf(elapsed, sizeof(elapsed), ",\"lastFrameMs\":%.1f", g_frame_state.last_frame_ms);
	json += elapsed;
	append_real_engine_frame_summary_state(json);
	json += "}";
	g_frame_json = json;
	std::printf("cnc-port: real-frame-summary attempted=%d completed=%d exception=%s\n",
		g_frame_state.frames_attempted,
		g_frame_state.frames_completed,
		g_frame_state.exception_caught ? g_frame_state.exception_text.c_str() : "(none)");
	std::fflush(stdout);
	return g_frame_json.c_str();
}

// Runtime display-resolution change driven from the browser page (resolution
// selector / fullscreen). This replays the SAME real path the in-game options
// screen uses when the user picks a new resolution
// (GameEngine/Source/GameClient/GUI/GUICallbacks/Menus/OptionsMenu.cpp:1080-1123):
//   TheDisplay->setDisplayMode()   -> W3DDisplay::setDisplayMode -> WW3D::Set_Device_Resolution
//                                     (backbuffer/present size) + Render2DClass::Set_Screen_Resolution
//                                     (2D projection) + Display::setDisplayMode (client width/height globals)
//   TheWritableGlobalData->m_x/yResolution = new size
//   TheHeaderTemplateManager->headerNotifyResolutionChange()  (font/header reflow)
//   TheMouse->mouseNotifyResolutionChange()                   (cursor scaling)
// The GUI reflow then branches on game state so the resize is non-destructive
// mid-match:
//   * SHELL / menus (no live match): full OptionsMenu.cpp path -- recreate
//     TheShell + TheInGameUI->recreateControlBar() + re-push MainMenu.wnd so
//     every menu WND re-lays-out at the new size (harmless from the menus).
//   * LIVE MATCH (isInGame && !isInShellGame): light in-place reflow --
//     recreateControlBar() + resize TheTacticalView, WITHOUT tearing down
//     TheShell or the running game, so the match keeps running (units stay
//     selected, camera stays put) and only the render target + HUD change.
// Returns a small JSON blob describing the applied size and which reflow ran.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_set_resolution(int xres, int yres)
{
	static std::string result_json;
	const char *reflow_mode = "none";
	auto emit = [&](bool ok, int applied_x, int applied_y, const char *error) {
		std::string json = "{";
		json += "\"ok\":";
		json += ok ? "true" : "false";
		json += ",\"requestedWidth\":" + std::to_string(xres);
		json += ",\"requestedHeight\":" + std::to_string(yres);
		json += ",\"width\":" + std::to_string(applied_x);
		json += ",\"height\":" + std::to_string(applied_y);
		json += ",\"reflow\":\"" + std::string(reflow_mode) + "\"";
		json += ",\"error\":";
		if (error != NULL) {
			json += "\"" + json_escape(error) + "\"";
		} else {
			json += "null";
		}
		json += "}";
		result_json = json;
		std::printf("cnc-port: set-resolution requested=%dx%d applied=%dx%d reflow=%s ok=%d%s%s\n",
			xres, yres, applied_x, applied_y, reflow_mode, ok ? 1 : 0,
			error != NULL ? " error=" : "", error != NULL ? error : "");
		std::fflush(stdout);
		return result_json.c_str();
	};

	if (!g_state.attempted || !g_state.init_returned) {
		return emit(false, 0, 0, "engine not initialized");
	}
	if (TheDisplay == NULL || TheWritableGlobalData == NULL) {
		return emit(false, 0, 0, "display/global data not ready");
	}
	// A resolution change mid-load would resize the device under a half-built
	// world (shell recreate while layouts stream in, tactical view resize while
	// the map builds). Refuse with a distinguishable error; the page retries
	// once the load session drains.
	if (TheGameLogic != NULL
			&& (TheGameLogic->isLoadingMap() || TheGameLogic->isLoadSessionActive())) {
		return emit(false, (int)TheDisplay->getWidth(), (int)TheDisplay->getHeight(), "busy-loading");
	}
	// Clamp to the engine's supported minimum (menus are authored for >=800x600;
	// smaller than 640x480 breaks the shell layout math). Upper bound guards
	// against a runaway drawing-buffer allocation from a bad DPR/size report.
	if (xres < 640) xres = 640;
	if (yres < 480) yres = 480;
	if (xres > 7680) xres = 7680;
	if (yres > 4320) yres = 4320;

	const UnsignedInt current_x = TheDisplay->getWidth();
	const UnsignedInt current_y = TheDisplay->getHeight();
	if ((UnsignedInt)xres == current_x && (UnsignedInt)yres == current_y) {
		return emit(true, (int)current_x, (int)current_y, NULL);
	}

	const Int bit_depth = TheDisplay->getBitDepth();
	const Bool windowed = TheDisplay->getWindowed();

	// A real match is running (not the shell/menu background and not mid-load):
	// the resize must be NON-DESTRUCTIVE. The stock OptionsMenu resolution path
	// (which we replay in the shell branch) recreates TheShell and re-pushes the
	// main menu -- that is only safe/harmless from the menus, where the options
	// screen is reachable. During a live game it would tear the match down and
	// dump the player to the menu, so we take a light in-place reflow instead.
	const Bool in_live_match =
		TheGameLogic != NULL &&
		TheGameLogic->isInGame() &&
		!TheGameLogic->isInShellGame() &&
		!TheGameLogic->isLoadingMap();

	Bool changed = FALSE;
	try {
		if (TheDisplay->setDisplayMode((UnsignedInt)xres, (UnsignedInt)yres, (UnsignedInt)bit_depth, windowed)) {
			changed = TRUE;
			TheWritableGlobalData->m_xResolution = xres;
			TheWritableGlobalData->m_yResolution = yres;

			// Common to both paths: fonts/headers and cursor scale track the new
			// resolution (same notifies the options screen fires).
			if (TheHeaderTemplateManager != NULL) {
				TheHeaderTemplateManager->headerNotifyResolutionChange();
			}
			if (TheMouse != NULL) {
				TheMouse->mouseNotifyResolutionChange();
			}

			if (in_live_match) {
				// LIGHT in-place resize: keep the running game, units, and camera.
				// Only the render target + HUD layout change.
				reflow_mode = "in-place";
				// Rebuild the command bar / control bar at the new resolution
				// (deletes + recreates the ControlBar.wnd and TheControlBar in
				// place; does NOT touch TheShell or the game state).
				if (TheInGameUI != NULL) {
					TheInGameUI->recreateControlBar();
					// recreateControlBar() leaves a FRESH TheControlBar with no
					// match state: no faction scheme (the bar background art +
					// per-resolution layout) and no shortcut bar, so the HUD
					// renders as loose pieces at stale coordinates. Replay the
					// same post-load setup GameLogic::startNewGame runs after
					// the bar exists (setControlBarSchemeByPlayer +
					// initSpecialPowershortcutBar for the local player).
					if (TheControlBar != NULL && ThePlayerList != NULL
							&& ThePlayerList->getLocalPlayer() != NULL) {
						TheControlBar->setControlBarSchemeByPlayer(ThePlayerList->getLocalPlayer());
						TheControlBar->initSpecialPowershortcutBar(ThePlayerList->getLocalPlayer());
					}
				}
				// Re-size the tactical view to the new screen, mirroring how
				// InGameUI::init() sizes it (full width, 0.77 height so the 3D
				// view does not draw under the command bar). This is the
				// tactical-view / viewport recompute so the world view and
				// screen<->world mapping match the new resolution.
				if (TheTacticalView != NULL) {
					TheTacticalView->setWidth(TheDisplay->getWidth());
					TheTacticalView->setHeight((Int)(TheDisplay->getHeight() * 0.77f));
				}
			} else {
				// SHELL / menus: full reflow exactly like OptionsMenu.cpp --
				// destroy + re-init TheShell (so every menu WND re-lays-out at
				// the new screen size) and recreate the control bar. Unlike the
				// stock options screen (which always dumps to the main menu),
				// re-push the SAME screen stack that was up, bottom to top, so a
				// dynamic resize (window drag / fullscreen) does not throw the
				// player out of the menu they were in. shutdownImmediate makes
				// each interim push complete synchronously.
				reflow_mode = "shell";
				std::vector<AsciiString> shellStack;
				if (TheShell != NULL) {
					for (Int i = 0; i < TheShell->getScreenCount(); ++i) {
						WindowLayout *screen = TheShell->getScreenAt(i);
						if (screen != NULL && screen->getFilename().isNotEmpty()) {
							shellStack.push_back(screen->getFilename());
						}
					}
					delete TheShell;
					TheShell = NULL;
				}
				TheShell = MSGNEW("GameClientSubsystem") Shell;
				if (TheShell != NULL) {
					TheShell->init();
				}
				if (TheInGameUI != NULL) {
					TheInGameUI->recreateControlBar();
				}
				if (TheShell != NULL) {
					if (shellStack.empty()) {
						shellStack.push_back(AsciiString("Menus/MainMenu.wnd"));
					}
					for (size_t i = 0; i < shellStack.size(); ++i) {
						TheShell->push(shellStack[i], TRUE);
					}
				}
			}
		}
	} catch (...) {
		return emit(false, (int)TheDisplay->getWidth(), (int)TheDisplay->getHeight(), "exception during resolution change");
	}

	if (!changed) {
		return emit(false, (int)TheDisplay->getWidth(), (int)TheDisplay->getHeight(), "device rejected resolution");
	}
	return emit(true, (int)TheDisplay->getWidth(), (int)TheDisplay->getHeight(), NULL);
}

// Diagnostic: dump every top-level GameWindow (name, rect, hidden) so the
// harness can attribute stray on-screen UI to its owning window — e.g. the
// ghost-control-bar hunt after in-place resolution reflows.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_dump_windows(void)
{
	static std::string json;
	json = "{\"ok\":";
	if (TheWindowManager == NULL) {
		json += "false,\"error\":\"window manager not ready\"}";
		return json.c_str();
	}
	json += "true,\"windows\":[";
	bool first = true;
	for (GameWindow *window = TheWindowManager->winGetWindowList();
			window != NULL; window = window->winGetNext()) {
		Int x = 0, y = 0, width = 0, height = 0;
		window->winGetPosition(&x, &y);
		window->winGetSize(&width, &height);
		const WinInstanceData *instance = window->winGetInstanceData();
		const char *name = (instance != NULL && instance->m_decoratedNameString.isNotEmpty())
			? instance->m_decoratedNameString.str() : "";
		if (!first) {
			json += ",";
		}
		first = false;
		json += "{\"name\":\"" + json_escape(name) + "\"";
		json += ",\"x\":" + std::to_string((long long)x);
		json += ",\"y\":" + std::to_string((long long)y);
		json += ",\"w\":" + std::to_string((long long)width);
		json += ",\"h\":" + std::to_string((long long)height);
		json += ",\"hidden\":";
		json += window->winIsHidden() ? "true" : "false";
		json += "}";
	}
	json += "]}";
	return json.c_str();
}

// Minimal frame stepping for the human/play loop. The richer frame endpoints
// remain the verification surface; this one intentionally avoids client-state
// JSON and stdout chatter on every animation frame.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frame_tick(int frame_count)
{
	run_real_engine_frames(frame_count);

	std::string json = "{";
	json += "\"tick\":true";
	json += ",\"initReturned\":";
	json += (g_state.attempted && g_state.init_returned) ? "true" : "false";
	json += ",\"framesAttempted\":" + std::to_string(g_frame_state.frames_attempted);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	json += ",\"quitting\":";
	json += (TheGameEngine != NULL && TheGameEngine->getQuitting() != FALSE) ? "true" : "false";
	json += ",\"exceptionCaught\":";
	json += g_frame_state.exception_caught ? "true" : "false";
	json += ",\"exception\":\"" + json_escape(g_frame_state.exception_text) + "\"";
	char elapsed[64];
	std::snprintf(elapsed, sizeof(elapsed), ",\"lastFrameMs\":%.1f", g_frame_state.last_frame_ms);
	json += elapsed;
	append_engine_frame_profile_json(json);
	append_d3d8_draw_cache_json(json);
	json += "}";
	g_frame_json = json;
	return g_frame_json.c_str();
}

// ---------------------------------------------------------------------------
// Client/logic frame-rate decoupling ("paced mode").
//
// The original GameEngine::update() couples TheGameClient (render/input/UI)
// and TheGameLogic (sim) 1:1 at LOGICFRAMES_PER_SECOND (30Hz). EA left the
// decoupling as a @todo above GameEngine::update. The page enables it with
// cnc_port_real_engine_set_client_pacing(clientFps, logicFps) and then drives
// cnc_port_real_engine_frame_paced(runLogic) once per display frame: every
// call runs the full client (smooth camera/input/UI/W3D animation), while
// TheGameLogic only advances when runLogic != 0 — keeping the sim at its
// authentic 30Hz. Three weak hooks in engine code consume this state:
//   - GameEngine::update    -> cnc_port_allow_logic_frame (skip logic frame)
//   - LookAtXlat FRAME_TICK -> cnc_port_client_frame_time_scale (scroll speed)
//   - W3DDisplay::draw      -> cnc_port_client_paced_mode (anim time advance)
// ---------------------------------------------------------------------------
static int g_paced_allow_logic_frame = 1;
static int g_paced_mode_active = 0;
static float g_paced_frame_time_scale = 1.0f;

// W3D client frame length global (W3DView.cpp); W3DGameClient::setFrameRate
// is private on the GameClient base, and this is all it assigns.
extern Int TheW3DFrameLengthInMsec;

extern "C" int cnc_port_allow_logic_frame(void)
{
	if (!g_paced_allow_logic_frame) {
		return 0;
	}
	// "Freeze time during camera movement" cinematics: the original engine
	// implements them by spinning W3DDisplay::draw's do/while for the whole
	// move inside ONE GameEngine::update call (logic can't advance because
	// update() never returns). Paced mode exits that loop after one render
	// (see W3DDisplay.cpp) so the move plays across successive 60Hz client
	// frames; the time-freeze semantic is preserved here instead by holding
	// TheGameLogic while the frozen move is active.
	if (g_paced_mode_active
		&& TheTacticalView != NULL
		&& TheTacticalView->isTimeFrozen()
		&& !TheTacticalView->isCameraMovementFinished()) {
		return 0;
	}
	return 1;
}

extern "C" int cnc_port_client_paced_mode(void)
{
	return g_paced_mode_active;
}

// Measured client-frame duration for the paced W3D animation-clock advance.
// A fixed 16ms step assumes the client sustains the full display rate; when a
// frame takes longer (retina canvas, heavy battles) animation time falls
// behind wall time — at 30fps everything animates at HALF speed while logic
// keeps moving units at full speed ("units move but don't animate", muzzle
// flashes linger, camera pans crawl). Advancing by the measured duration
// keeps animation wall-speed at 1.0 exactly like the original 30fps cap did
// natively (33ms steps ≈ wall time at the design rate). Clamped so pauses,
// tab switches and load-session slices can't inject animation jumps; the
// fractional remainder carries so long-run speed is exact.
static double g_paced_prev_tick_at_ms = 0.0;
static double g_paced_elapsed_carry_ms = 0.0;
static int g_paced_elapsed_whole_ms = 0;

static void cnc_port_note_paced_tick_time(void)
{
	const double now_ms = emscripten_get_now();
	if (g_paced_prev_tick_at_ms > 0.0) {
		double elapsed = now_ms - g_paced_prev_tick_at_ms;
		if (elapsed < 4.0) {
			elapsed = 4.0;
		}
		if (elapsed > 66.0) {
			elapsed = 66.0; // two logic frames — same cap as stock catch-up feel
		}
		elapsed += g_paced_elapsed_carry_ms;
		g_paced_elapsed_whole_ms = (int)elapsed;
		g_paced_elapsed_carry_ms = elapsed - (double)g_paced_elapsed_whole_ms;
	}
	g_paced_prev_tick_at_ms = now_ms;
}

extern "C" int cnc_port_client_frame_elapsed_ms(void)
{
	if (!g_paced_mode_active) {
		return 0; // consumer falls back to TheW3DFrameLengthInMsec
	}
	return g_paced_elapsed_whole_ms;
}

// W3DDisplay::draw exit-branch counters (strong defs in W3DDisplay.cpp,
// __EMSCRIPTEN__ block). Reported in cnc_port_real_engine_frame_paced JSON.
extern "C" int cnc_port_w3d_draw_entries;
extern "C" int cnc_port_w3d_draw_exit_iconic;
extern "C" int cnc_port_w3d_draw_exit_timefast;
extern "C" int cnc_port_w3d_draw_exit_multiplier;
extern "C" int cnc_port_w3d_draw_scene_renders;
extern "C" int cnc_port_w3d_draw_view_draws;
// Per-drawable client draw pass (strong defs in W3DModelDraw.cpp) and
// animation stepping (strong defs in animobj.cpp).
extern "C" int cnc_port_w3d_model_draw_calls;
extern "C" int cnc_port_w3d_recoil_calls;
extern "C" int cnc_port_w3d_recoil_barrel_updates;
extern "C" int cnc_port_w3d_anim_progress_calls;
extern "C" int cnc_port_w3d_anim_frame_advances;

// ---------------------------------------------------------------------------
// Stepped map load ("async loading").
//
// GameLogic::startNewGame's body runs as an ordered step sequence (see
// GameLogic.cpp runNextLoadStep). In the browser the steps are spread across
// GameEngine::update calls so every slice returns to the event loop: the real
// LoadScreen presents (progress moves, typewriter/video animate), the tab
// never blocks for the whole load, and iPad Safari's blocked-main-thread
// watchdog has nothing to kill. Weak-hook consumers in engine code:
//   - GameLogic::startNewGame       -> cnc_port_load_stepping_active (enable)
//   - GameLogic::advanceLoadSession -> cnc_port_load_step_slice_begin +
//     cnc_port_load_step_should_yield (per-slice time budget)
//   - map-object loop               -> cnc_port_load_step_should_yield
// ---------------------------------------------------------------------------
static int g_load_stepping_enabled = 1;
static double g_load_step_budget_ms = 50.0;
static double g_load_step_slice_started_at = 0.0;

extern "C" int cnc_port_load_stepping_active(void)
{
	return g_load_stepping_enabled;
}

extern "C" void cnc_port_load_step_slice_begin(void)
{
	g_load_step_slice_started_at = emscripten_get_now();
}

extern "C" int cnc_port_load_step_should_yield(void)
{
	if (!g_load_stepping_enabled) {
		return 0;
	}
	return (emscripten_get_now() - g_load_step_slice_started_at) >= g_load_step_budget_ms ? 1 : 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_set_load_stepping(
	int enabled,
	double budget_ms)
{
	static std::string json;
	g_load_stepping_enabled = enabled != 0 ? 1 : 0;
	if (budget_ms > 0.0) {
		g_load_step_budget_ms = budget_ms;
	}
	json = "{\"ok\":true";
	json += ",\"loadStepping\":" + std::to_string(g_load_stepping_enabled);
	char budget[48];
	std::snprintf(budget, sizeof(budget), ",\"budgetMs\":%.1f", g_load_step_budget_ms);
	json += budget;
	json += "}";
	return json.c_str();
}

// ---------------------------------------------------------------------------
// Boot render resolution.
//
// The page calls cnc_port_real_engine_set_boot_resolution BEFORE realEngineInit
// (dynamic mode: canvas CSS box x devicePixelRatio; fixed mode: the persisted
// user setting). GameEngine's INIT_STEP_GLOBAL_DATA consumes it through the
// weak hook below — after GameData.ini / options.ini / command-line parsing,
// before W3DDisplay creates the device from m_x/yResolution — so the engine
// boots directly at the target size instead of 800x600-then-resize.
// ---------------------------------------------------------------------------
static int g_boot_resolution_width = 0;
static int g_boot_resolution_height = 0;

extern "C" EMSCRIPTEN_KEEPALIVE void cnc_port_real_engine_set_boot_resolution(int width, int height)
{
	g_boot_resolution_width = width;
	g_boot_resolution_height = height;
	std::printf("cnc-port: boot-resolution requested=%dx%d\n", width, height);
	std::fflush(stdout);
}

extern "C" int cnc_port_boot_display_resolution(int *xres, int *yres)
{
	int width = g_boot_resolution_width;
	int height = g_boot_resolution_height;
	if (width < 640 || height < 480) {
		return 0;
	}
	if (width > 7680) width = 7680;
	if (height > 4320) height = 4320;
	if (xres != NULL) *xres = width;
	if (yres != NULL) *yres = height;
	return 1;
}

extern "C" float cnc_port_client_frame_time_scale(void)
{
	return g_paced_frame_time_scale;
}

// Frozen-animation debugging: per-drawable HAnim + muzzle-flash/recoil truth.
// Pass 0 reports drawables with barrel/flash data (the muzzle-flash suspects),
// pass 1 fills remaining slots with other animated models. flashHidden is the
// muzzle-flash subobject's ACTUAL Is_Hidden flag, so a dump distinguishes
// "hide never called" from "hide called but not taking effect in rendering".
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_anim_report(int max_entries)
{
	static std::string json;
	json = "{\"ok\":true";
	json += ",\"logicFrame\":" + std::to_string(
		TheGameLogic != NULL ? (long long)TheGameLogic->getFrame() : -1);
	json += ",\"drawables\":[";
	int emitted = 0;
	if (max_entries <= 0) {
		max_entries = 48;
	}
	if (TheGameClient != NULL) {
		// Pass 0: on-screen (vis=1) drawables with anims or barrels — these are
		// the pixels the player is looking at and must never be crowded out of
		// the cap by offscreen entries. Pass 1: offscreen barrel carriers.
		// Pass 2: other offscreen animated drawables.
		for (int pass = 0; pass < 3 && emitted < max_entries; ++pass) {
			for (Drawable *d = TheGameClient->firstDrawable();
					d != NULL && emitted < max_entries;
					d = d->getNextDrawable()) {
				const W3DModelDraw *w3d = NULL;
				for (DrawModule **dm = d->getDrawModules(); *dm; ++dm) {
					const ObjectDrawInterface *di = (*dm)->getObjectDrawInterface();
					if (di != NULL) {
						w3d = (const W3DModelDraw *)di;
						break;
					}
				}
				if (w3d == NULL) {
					continue;
				}
				std::string frag;
				w3d->cncPortAppendAnimReport(frag);
				const bool has_barrels = frag.find("\"barrels\"") != std::string::npos;
				const bool has_anim = frag.find("\"anim\"") != std::string::npos;
				const bool on_screen = frag.find("\"vis\":1") != std::string::npos;
				bool take = false;
				if (pass == 0) {
					take = on_screen && (has_anim || has_barrels);
				} else if (pass == 1) {
					take = !on_screen && has_barrels;
				} else {
					take = !on_screen && !has_barrels && has_anim;
				}
				if (take) {
					if (emitted) {
						json += ",";
					}
					json += frag;
					++emitted;
				}
			}
		}
	}
	json += "],\"count\":" + std::to_string(emitted) + "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_set_client_pacing(
	int client_fps,
	int logic_fps)
{
	static std::string json;
	if (client_fps > 0 && logic_fps > 0 && client_fps >= logic_fps) {
		g_paced_mode_active = client_fps != logic_fps ? 1 : 0;
		g_paced_frame_time_scale = (float)logic_fps / (float)client_fps;
		TheW3DFrameLengthInMsec = (Int)(1000.0f / (float)client_fps);
	} else {
		g_paced_mode_active = 0;
		g_paced_frame_time_scale = 1.0f;
		TheW3DFrameLengthInMsec = (Int)MSEC_PER_LOGICFRAME_REAL;
	}
	json = "{\"ok\":true";
	json += ",\"pacedMode\":" + std::to_string(g_paced_mode_active);
	json += ",\"clientFps\":" + std::to_string(client_fps);
	json += ",\"logicFps\":" + std::to_string(logic_fps);
	char scale[48];
	std::snprintf(scale, sizeof(scale), ",\"frameTimeScale\":%.4f", g_paced_frame_time_scale);
	json += scale;
	json += ",\"gameClientLive\":";
	json += TheGameClient != NULL ? "true" : "false";
	json += "}";
	return json.c_str();
}

// One client frame at display rate; TheGameLogic only advances when
// run_logic != 0 (see cnc_port_allow_logic_frame gate in GameEngine::update).
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frame_paced(int run_logic)
{
	// Measure the real inter-tick duration first: W3DDisplay::draw advances
	// the W3D animation clock by this amount (see
	// cnc_port_client_frame_elapsed_ms) so animation wall-speed stays 1.0
	// even when the client cannot sustain the target display rate.
	cnc_port_note_paced_tick_time();
	g_paced_allow_logic_frame = run_logic != 0 ? 1 : 0;
	run_real_engine_frames(1);
	g_paced_allow_logic_frame = 1;

	std::string json = "{";
	json += "\"tick\":true";
	json += ",\"paced\":true";
	json += ",\"ranLogicRequested\":";
	json += run_logic != 0 ? "true" : "false";
	json += ",\"initReturned\":";
	json += (g_state.attempted && g_state.init_returned) ? "true" : "false";
	json += ",\"framesAttempted\":" + std::to_string(g_frame_state.frames_attempted);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	json += ",\"logicFrame\":" + std::to_string(
		TheGameLogic != NULL ? (long long)TheGameLogic->getFrame() : -1);
	json += ",\"clientFrame\":" + std::to_string(
		TheGameClient != NULL ? (long long)TheGameClient->getFrame() : -1);
	json += ",\"loadSessionActive\":";
	json += (TheGameLogic != NULL && TheGameLogic->isLoadSessionActive()) ? "true" : "false";
	json += ",\"loadProgress\":" + std::to_string(
		TheGameLogic != NULL ? (long long)TheGameLogic->getLoadSessionProgress() : -1);
	// W3D animation clock (drives every HAnim/particle/muzzle-flash timeline).
	// If w3dSyncTimeMs stops advancing while clientFrame does, animations are
	// frozen — the exact owner-reported symptom class (units move, nothing
	// animates) — and w3dFrameTimeMs shows the per-frame increment applied.
	json += ",\"w3dSyncTimeMs\":" + std::to_string((unsigned long long)WW3D::Get_Sync_Time());
	json += ",\"w3dFrameTimeMs\":" + std::to_string((unsigned long long)WW3D::Get_Frame_Time());
	json += ",\"timeMultiplier\":" + std::to_string(
		TheTacticalView != NULL ? (long long)TheTacticalView->getTimeMultiplier() : 1);
	// W3DDisplay::draw exit-branch counters (defined in W3DDisplay.cpp): with
	// 60 entries/s, whichever exit accounts for the missing scene renders
	// names the frame-eating branch. viewDraws is the actual drawViews()+
	// present; sceneRenders is updateViews() (pre-render world update).
	json += ",\"w3dDrawEntries\":" + std::to_string(cnc_port_w3d_draw_entries);
	json += ",\"w3dDrawExitIconic\":" + std::to_string(cnc_port_w3d_draw_exit_iconic);
	json += ",\"w3dDrawExitTimeFast\":" + std::to_string(cnc_port_w3d_draw_exit_timefast);
	json += ",\"w3dDrawExitMultiplier\":" + std::to_string(cnc_port_w3d_draw_exit_multiplier);
	json += ",\"w3dDrawSceneRenders\":" + std::to_string(cnc_port_w3d_draw_scene_renders);
	json += ",\"w3dDrawViewDraws\":" + std::to_string(cnc_port_w3d_draw_view_draws);
	json += ",\"w3dModelDrawCalls\":" + std::to_string(cnc_port_w3d_model_draw_calls);
	json += ",\"w3dRecoilCalls\":" + std::to_string(cnc_port_w3d_recoil_calls);
	json += ",\"w3dRecoilBarrelUpdates\":" + std::to_string(cnc_port_w3d_recoil_barrel_updates);
	json += ",\"w3dAnimProgressCalls\":" + std::to_string(cnc_port_w3d_anim_progress_calls);
	json += ",\"w3dAnimFrameAdvances\":" + std::to_string(cnc_port_w3d_anim_frame_advances);
	json += ",\"quitting\":";
	json += (TheGameEngine != NULL && TheGameEngine->getQuitting() != FALSE) ? "true" : "false";
	json += ",\"exceptionCaught\":";
	json += g_frame_state.exception_caught ? "true" : "false";
	json += ",\"exception\":\"" + json_escape(g_frame_state.exception_text) + "\"";
	char elapsed[64];
	std::snprintf(elapsed, sizeof(elapsed), ",\"lastFrameMs\":%.1f", g_frame_state.last_frame_ms);
	json += elapsed;
	json += "}";
	g_frame_json = json;
	return g_frame_json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_spawn_laser(
	const char *template_name,
	float x,
	float y,
	float z,
	int use_view_position,
	int clamp_to_terrain,
	float length,
	float height)
{
	static std::string json;
	const char *requested_name = (template_name != NULL && template_name[0] != '\0')
		? template_name : "LaserBeam";
	json = "{\"ok\":false,\"source\":\"real-engine-laser-draw\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	if (TheThingFactory == NULL) {
		json += ",\"guard\":\"TheThingFactory\"}";
		return json.c_str();
	}
	if (TheGameClient == NULL) {
		json += ",\"guard\":\"TheGameClient\"}";
		return json.c_str();
	}
	if (TheParticleSystemManager == NULL) {
		json += ",\"guard\":\"TheParticleSystemManager\"}";
		return json.c_str();
	}

	Drawable *previous = TheGameClient->findDrawableByID(g_probe_laser_drawable_id);
	if (previous != NULL) {
		TheGameClient->destroyDrawable(previous);
	}
	g_probe_laser_drawable_id = INVALID_DRAWABLE_ID;

	const ThingTemplate *tmpl = TheThingFactory->findTemplate(AsciiString(requested_name));
	if (tmpl == NULL) {
		json += ",\"guard\":\"missingTemplate\"}";
		return json.c_str();
	}

	Coord3D center = { x, y, z };
	if (use_view_position != 0) {
		if (TheTacticalView == NULL) {
			json += ",\"guard\":\"TheTacticalView\"}";
			return json.c_str();
		}
		TheTacticalView->getPosition(&center);
	} else if (!std::isfinite(center.x) || !std::isfinite(center.y) || !std::isfinite(center.z)) {
		json += ",\"guard\":\"invalidPosition\"}";
		return json.c_str();
	}
	if (clamp_to_terrain != 0 && TheTerrainLogic != NULL) {
		center.z = TheTerrainLogic->getGroundHeight(center.x, center.y);
	}

	const Real safe_length = std::isfinite(length) && length > 0.0f ? length : 120.0f;
	const Real safe_height = std::isfinite(height) ? height : 35.0f;
	Coord3D start = center;
	Coord3D end = center;
	start.x -= safe_length * 0.5f;
	end.x += safe_length * 0.5f;
	start.z += safe_height;
	end.z += safe_height;

	Drawable *draw = TheThingFactory->newDrawable(tmpl);
	if (draw == NULL) {
		json += ",\"guard\":\"newDrawable\"}";
		return json.c_str();
	}
	draw->setPosition(&center);
	g_probe_laser_drawable_id = draw->getID();

	static NameKeyType key_laser_update = NAMEKEY("LaserUpdate");
	LaserUpdate *update = NULL;
	for (ClientUpdateModule **client_modules = draw->getClientUpdateModules();
		client_modules != NULL && *client_modules != NULL; ++client_modules) {
		if ((*client_modules)->getModuleNameKey() == key_laser_update) {
			update = static_cast<LaserUpdate *>(*client_modules);
			break;
		}
	}
	if (update == NULL) {
		const DrawableID failed_drawable_id = draw->getID();
		TheGameClient->destroyDrawable(draw);
		g_probe_laser_drawable_id = INVALID_DRAWABLE_ID;
		json += ",\"guard\":\"LaserUpdate\"";
		json += ",\"drawableId\":" + std::to_string(static_cast<Int>(failed_drawable_id));
		json += "}";
		return json.c_str();
	}

	const UnsignedInt systems_before = TheParticleSystemManager->getParticleSystemCount();
	const UnsignedInt particles_before = TheParticleSystemManager->getParticleCount();
	update->initLaser(NULL, NULL, &start, &end, AsciiString(""));
	const UnsignedInt systems_after = TheParticleSystemManager->getParticleSystemCount();
	const UnsignedInt particles_after = TheParticleSystemManager->getParticleCount();

	json = "{\"ok\":true,\"source\":\"real-engine-laser-draw\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	json += ",\"drawableId\":" + std::to_string(static_cast<Int>(g_probe_laser_drawable_id));
	json += ",\"systemsBefore\":" + std::to_string(systems_before);
	json += ",\"systemsAfter\":" + std::to_string(systems_after);
	json += ",\"particlesBefore\":" + std::to_string(particles_before);
	json += ",\"particlesAfter\":" + std::to_string(particles_after);
	append_coord3d_fields(json, "center", center);
	append_coord3d_fields(json, "start", start);
	append_coord3d_fields(json, "end", end);
	json += ",\"length\":" + std::to_string(safe_length);
	json += ",\"height\":" + std::to_string(safe_height);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_tactical_view_look_at(
	float x,
	float y,
	float z)
{
	static std::string json;
	json = "{\"ok\":false,\"source\":\"tactical-view-look-at\"";
	if (TheTacticalView == NULL) {
		json += ",\"guard\":\"TheTacticalView\"}";
		return json.c_str();
	}
	Coord3D pos = { x, y, z };
	if (!std::isfinite(pos.x) || !std::isfinite(pos.y) || !std::isfinite(pos.z)) {
		json += ",\"guard\":\"invalidPosition\"}";
		return json.c_str();
	}

	Coord3D before = { 0.0f, 0.0f, 0.0f };
	TheTacticalView->getPosition(&before);
	TheTacticalView->lookAt(&pos);
	Coord3D after = { 0.0f, 0.0f, 0.0f };
	TheTacticalView->getPosition(&after);

	json = "{\"ok\":true,\"source\":\"tactical-view-look-at\"";
	append_coord3d_fields(json, "requested", pos);
	append_coord3d_fields(json, "before", before);
	append_coord3d_fields(json, "after", after);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_set_view_filter(
	int filter_value,
	int mode_value,
	int fade_frames,
	int fade_direction)
{
	static std::string json;
	json = "{\"ok\":false,\"source\":\"real-engine-view-filter\"";
	if (TheTacticalView == NULL) {
		json += ",\"guard\":\"TheTacticalView\"}";
		return json.c_str();
	}
	if (filter_value < FT_NULL_FILTER || filter_value >= FT_MAX ||
		mode_value < FM_NULL_MODE || mode_value > FM_VIEW_MB_PAN_ALPHA) {
		json += ",\"guard\":\"invalidFilterOrMode\"}";
		return json.c_str();
	}

	const FilterTypes filter = static_cast<FilterTypes>(filter_value);
	const FilterModes mode = static_cast<FilterModes>(mode_value);
	Bool filter_ok = FALSE;
	Bool mode_ok = FALSE;
	if (filter == FT_VIEW_BW_FILTER || filter == FT_VIEW_CROSSFADE) {
		// Preserve ScriptActions::doBlackWhiteMode and CommandXlat's crossfade
		// ordering: select the mode, install the filter, then arm its fade.
		mode_ok = TheTacticalView->setViewFilterMode(mode);
		filter_ok = TheTacticalView->setViewFilter(filter);
		TheTacticalView->setFadeParameters(fade_frames, fade_direction);
	} else {
		// Preserve ScriptActions::doCameraMotionBlur ordering.
		filter_ok = TheTacticalView->setViewFilter(filter);
		mode_ok = TheTacticalView->setViewFilterMode(mode);
	}

	json = "{\"ok\":";
	json += filter_ok && mode_ok ? "true" : "false";
	json += ",\"source\":\"real-engine-view-filter\"";
	json += ",\"filter\":" + std::to_string(static_cast<Int>(TheTacticalView->getViewFilterType()));
	json += ",\"mode\":" + std::to_string(static_cast<Int>(TheTacticalView->getViewFilterMode()));
	json += ",\"filterSet\":";
	json += filter_ok ? "true" : "false";
	json += ",\"modeSet\":";
	json += mode_ok ? "true" : "false";
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_reveal_local_map(int permanent)
{
	static std::string json;
	json = "{\"ok\":false,\"source\":\"reveal-local-map\"";
	if (ThePartitionManager == NULL) {
		json += ",\"guard\":\"ThePartitionManager\"}";
		return json.c_str();
	}
	if (ThePlayerList == NULL || ThePlayerList->getLocalPlayer() == NULL) {
		json += ",\"guard\":\"ThePlayerList.localPlayer\"}";
		return json.c_str();
	}

	const Int player_index = ThePlayerList->getLocalPlayer()->getPlayerIndex();
	if (permanent != 0) {
		ThePartitionManager->revealMapForPlayerPermanently(player_index);
	} else {
		ThePartitionManager->revealMapForPlayer(player_index);
	}

	json = "{\"ok\":true,\"source\":\"reveal-local-map\"";
	json += ",\"playerIndex\":" + std::to_string(player_index);
	json += ",\"permanent\":";
	json += permanent != 0 ? "true" : "false";
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_do_fx(
	const char *fx_name,
	float x,
	float y,
	float z,
	int use_view_position,
	int clamp_to_terrain)
{
	static std::string json;
	const char *requested_name = (fx_name != NULL && fx_name[0] != '\0')
		? fx_name : "WeaponFX_MOAB_Blast";
	json = "{\"ok\":false,\"source\":\"real-engine-fx-list\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	if (TheFXListStore == NULL) {
		json += ",\"guard\":\"TheFXListStore\"}";
		return json.c_str();
	}
	if (TheParticleSystemManager == NULL) {
		json += ",\"guard\":\"TheParticleSystemManager\"}";
		return json.c_str();
	}
	if (ThePartitionManager == NULL) {
		json += ",\"guard\":\"ThePartitionManager\"}";
		return json.c_str();
	}
	if (ThePlayerList == NULL || ThePlayerList->getLocalPlayer() == NULL) {
		json += ",\"guard\":\"ThePlayerList.localPlayer\"}";
		return json.c_str();
	}

	const FXList *fx = TheFXListStore->findFXList(requested_name);
	if (fx == NULL) {
		json += ",\"guard\":\"missingFXList\"}";
		return json.c_str();
	}

	Coord3D pos = { x, y, z };
	if (use_view_position != 0) {
		if (TheTacticalView == NULL) {
			json += ",\"guard\":\"TheTacticalView\"}";
			return json.c_str();
		}
		TheTacticalView->getPosition(&pos);
	} else if (!std::isfinite(pos.x) || !std::isfinite(pos.y) || !std::isfinite(pos.z)) {
		json += ",\"guard\":\"invalidPosition\"}";
		return json.c_str();
	}
	if (clamp_to_terrain != 0 && TheTerrainLogic != NULL) {
		pos.z = TheTerrainLogic->getGroundHeight(pos.x, pos.y);
	}

	const Player *local_player = ThePlayerList->getLocalPlayer();
	const Int player_index = local_player != NULL ? local_player->getPlayerIndex() : -1;
	const CellShroudStatus shroud =
		ThePartitionManager->getShroudStatusForPlayer(player_index, &pos);
	if (shroud != CELLSHROUD_CLEAR) {
		json += ",\"guard\":\"shrouded\"";
		json += ",\"shroud\":" + std::to_string(static_cast<Int>(shroud));
		append_coord3d_fields(json, "position", pos);
		json += "}";
		return json.c_str();
	}

	const UnsignedInt systems_before = TheParticleSystemManager->getParticleSystemCount();
	const UnsignedInt particles_before = TheParticleSystemManager->getParticleCount();
	FXList::doFXPos(fx, &pos, NULL, 0.0f, NULL, 0.0f);
	const UnsignedInt systems_after = TheParticleSystemManager->getParticleSystemCount();
	const UnsignedInt particles_after = TheParticleSystemManager->getParticleCount();

	json = "{\"ok\":true,\"source\":\"real-engine-fx-list\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	json += ",\"shroud\":" + std::to_string(static_cast<Int>(shroud));
	append_coord3d_fields(json, "position", pos);
	json += ",\"systemsBefore\":" + std::to_string(systems_before);
	json += ",\"systemsAfter\":" + std::to_string(systems_after);
	json += ",\"particlesBefore\":" + std::to_string(particles_before);
	json += ",\"particlesAfter\":" + std::to_string(particles_after);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_spawn_particle_system(
	const char *template_name,
	float x,
	float y,
	float z,
	int use_view_position,
	int clamp_to_terrain)
{
	static std::string json;
	const char *requested_name = (template_name != NULL && template_name[0] != '\0')
		? template_name : "MicrowaveEmitter";
	json = "{\"ok\":false,\"source\":\"real-engine-particle-system\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	if (TheParticleSystemManager == NULL) {
		json += ",\"guard\":\"TheParticleSystemManager\"}";
		return json.c_str();
	}

	Coord3D pos = { x, y, z };
	if (use_view_position != 0) {
		if (TheTacticalView == NULL) {
			json += ",\"guard\":\"TheTacticalView\"}";
			return json.c_str();
		}
		TheTacticalView->getPosition(&pos);
	} else if (!std::isfinite(pos.x) || !std::isfinite(pos.y) || !std::isfinite(pos.z)) {
		json += ",\"guard\":\"invalidPosition\"}";
		return json.c_str();
	}
	if (clamp_to_terrain != 0 && TheTerrainLogic != NULL) {
		pos.z = TheTerrainLogic->getGroundHeight(pos.x, pos.y);
	}

	const ParticleSystemTemplate *particle_template =
		TheParticleSystemManager->findTemplate(AsciiString(requested_name));
	if (particle_template == NULL) {
		json += ",\"guard\":\"missingParticleSystemTemplate\"}";
		return json.c_str();
	}
	const UnsignedInt systems_before = TheParticleSystemManager->getParticleSystemCount();
	const UnsignedInt particles_before = TheParticleSystemManager->getParticleCount();
	ParticleSystem *system = TheParticleSystemManager->createParticleSystem(particle_template);
	if (system != NULL) {
		system->setPosition(&pos);
	}
	const UnsignedInt systems_after = TheParticleSystemManager->getParticleSystemCount();
	const UnsignedInt particles_after = TheParticleSystemManager->getParticleCount();

	json = "{\"ok\":";
	json += system != NULL ? "true" : "false";
	json += ",\"source\":\"real-engine-particle-system\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	append_coord3d_fields(json, "position", pos);
	json += ",\"systemsBefore\":" + std::to_string(systems_before);
	json += ",\"systemsAfter\":" + std::to_string(systems_after);
	json += ",\"particlesBefore\":" + std::to_string(particles_before);
	json += ",\"particlesAfter\":" + std::to_string(particles_after);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_detonate_weapon(
	const char *weapon_name,
	int source_object_id,
	float x,
	float y,
	float z,
	int use_source_position,
	int clamp_to_terrain,
	int inflict_damage,
	int pump_frames)
{
	static std::string json;
	const char *requested_name = (weapon_name != NULL && weapon_name[0] != '\0')
		? weapon_name : "auto";
	const AsciiString requested_ascii(requested_name);
	const Bool auto_select_weapon = requested_ascii.compareNoCase("auto") == 0 ||
		requested_ascii.compareNoCase("*") == 0;
	json = "{\"ok\":false,\"source\":\"real-engine-weapon-detonation\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	if (TheWeaponStore == NULL) {
		json += ",\"guard\":\"TheWeaponStore\"}";
		return json.c_str();
	}
	if (TheGameLogic == NULL) {
		json += ",\"guard\":\"TheGameLogic\"}";
		return json.c_str();
	}
	if (TheParticleSystemManager == NULL) {
		json += ",\"guard\":\"TheParticleSystemManager\"}";
		return json.c_str();
	}

	Object *source = TheGameLogic->findObjectByID(static_cast<ObjectID>(source_object_id));
	if (source == NULL && source_object_id <= 0 && TheGameClient != NULL && TheTacticalView != NULL) {
		Object *fallback = NULL;
		Object *clear_fallback = NULL;
		const Player *local_player = ThePlayerList != NULL ? ThePlayerList->getLocalPlayer() : NULL;
		const Int local_player_index = local_player != NULL ? local_player->getPlayerIndex() : -1;
		for (Drawable *drawable = TheGameClient->firstDrawable(); drawable != NULL; drawable = drawable->getNextDrawable()) {
			Object *candidate = drawable->getObject();
			const Coord3D *candidate_pos = candidate != NULL ? candidate->getPosition() : NULL;
			if (candidate == NULL || candidate_pos == NULL || candidate->getDrawable() == NULL) {
				continue;
			}
			if (!std::isfinite(candidate_pos->x) ||
				!std::isfinite(candidate_pos->y) ||
				!std::isfinite(candidate_pos->z)) {
				continue;
			}
			if (fallback == NULL) {
				fallback = candidate;
			}
			const Bool shroud_clear = ThePartitionManager == NULL || local_player_index < 0 ||
				ThePartitionManager->getShroudStatusForPlayer(local_player_index, candidate_pos) == CELLSHROUD_CLEAR;
			if (shroud_clear && clear_fallback == NULL) {
				clear_fallback = candidate;
			}
			ICoord2D screen_pos = { 0, 0 };
			try {
				if (TheTacticalView->worldToScreenTriReturn(candidate_pos, &screen_pos) == View::WTS_INSIDE_FRUSTUM) {
					fallback = candidate;
					if (shroud_clear) {
						clear_fallback = candidate;
						break;
					}
				}
			} catch (...) {
			}
		}
		source = clear_fallback != NULL ? clear_fallback : fallback;
		if (source != NULL) {
			source_object_id = static_cast<int>(source->getID());
		}
	}
	if (source == NULL) {
		json += ",\"guard\":\"sourceObject\"";
		json += ",\"sourceObjectId\":" + std::to_string(source_object_id) + "}";
		return json.c_str();
	}
	if (source->getDrawable() == NULL) {
		json += ",\"guard\":\"sourceDrawable\"";
		json += ",\"sourceObjectId\":" + std::to_string(source_object_id) + "}";
		return json.c_str();
	}

	Coord3D pos = { x, y, z };
	if (use_source_position != 0) {
		const Coord3D *source_pos = source->getPosition();
		if (source_pos == NULL) {
			json += ",\"guard\":\"sourcePosition\"";
			json += ",\"sourceObjectId\":" + std::to_string(source_object_id) + "}";
			return json.c_str();
		}
		pos = *source_pos;
	} else if (!std::isfinite(pos.x) || !std::isfinite(pos.y) || !std::isfinite(pos.z)) {
		json += ",\"guard\":\"invalidPosition\"";
		json += ",\"sourceObjectId\":" + std::to_string(source_object_id) + "}";
		return json.c_str();
	}
	if (clamp_to_terrain != 0 && TheTerrainLogic != NULL) {
		pos.z = TheTerrainLogic->getGroundHeight(pos.x, pos.y);
	}
	Int position_shroud = -1;
	if (ThePartitionManager != NULL && ThePlayerList != NULL && ThePlayerList->getLocalPlayer() != NULL) {
		position_shroud = static_cast<Int>(
			ThePartitionManager->getShroudStatusForPlayer(
				ThePlayerList->getLocalPlayer()->getPlayerIndex(),
				&pos));
		if (position_shroud != static_cast<Int>(CELLSHROUD_CLEAR)) {
			json += ",\"guard\":\"shroudedPosition\"";
			json += ",\"sourceObjectId\":" + std::to_string(source_object_id);
			json += ",\"shroud\":" + std::to_string(position_shroud);
			append_coord3d_fields(json, "position", pos);
			json += "}";
			return json.c_str();
		}
	}

	const WeaponTemplate *weapon = NULL;
	const FXList *detonation_fx = NULL;
	UnsignedInt systems_before = TheParticleSystemManager->getParticleSystemCount();
	UnsignedInt particles_before = TheParticleSystemManager->getParticleCount();
	UnsignedInt systems_after = systems_before;
	UnsignedInt particles_after = particles_before;
	Int weapon_template_count = TheWeaponStore->wasmGetTemplateCount();
	Int inspected_weapons = 0;
	Int skipped_no_fx = 0;
	Int skipped_no_particle_fx = 0;
	Int skipped_suspended = 0;
	Int attempted_weapons = 0;
	Int selected_particle_nuggets = 0;
	std::vector<std::string> attempted_weapon_names;
	if (auto_select_weapon) {
		for (Int i = 0; i < weapon_template_count; ++i) {
			const WeaponTemplate *candidate = TheWeaponStore->wasmGetTemplateByIndex(i);
			++inspected_weapons;
			if (candidate == NULL) {
				++skipped_no_fx;
				continue;
			}
			const FXList *candidate_fx = candidate->getProjectileDetonateFX(LEVEL_REGULAR);
			if (candidate_fx == NULL || candidate_fx->wasmGetNuggetCount() <= 0) {
				++skipped_no_fx;
				continue;
			}
			const Int candidate_particle_nuggets = candidate_fx->wasmGetParticleNuggetCount();
			if (candidate_particle_nuggets <= 0) {
				++skipped_no_particle_fx;
				continue;
			}
			if (candidate->getSuspendFXDelay() > 0) {
				++skipped_suspended;
				continue;
			}
			const UnsignedInt candidate_systems_before = TheParticleSystemManager->getParticleSystemCount();
			const UnsignedInt candidate_particles_before = TheParticleSystemManager->getParticleCount();
			TheWeaponStore->handleProjectileDetonation(
				candidate,
				source,
				&pos,
				static_cast<WeaponBonusConditionFlags>(0),
				inflict_damage != 0);
			const UnsignedInt candidate_systems_after = TheParticleSystemManager->getParticleSystemCount();
			const UnsignedInt candidate_particles_after = TheParticleSystemManager->getParticleCount();
			++attempted_weapons;
			if (attempted_weapon_names.size() < 12) {
				attempted_weapon_names.push_back(candidate->getName().str());
			}
			if (candidate_systems_after > candidate_systems_before ||
				candidate_particles_after > candidate_particles_before) {
				weapon = candidate;
				detonation_fx = candidate_fx;
				selected_particle_nuggets = candidate_particle_nuggets;
				systems_before = candidate_systems_before;
				particles_before = candidate_particles_before;
				systems_after = candidate_systems_after;
				particles_after = candidate_particles_after;
				break;
			}
		}
		if (weapon == NULL) {
			json += ",\"guard\":\"noEffectiveProjectileDetonationWeapon\"";
			json += ",\"weaponTemplateCount\":" + std::to_string(weapon_template_count);
			json += ",\"inspectedWeapons\":" + std::to_string(inspected_weapons);
			json += ",\"skippedNoProjectileDetonationFX\":" + std::to_string(skipped_no_fx);
			json += ",\"skippedNoParticleProjectileDetonationFX\":" + std::to_string(skipped_no_particle_fx);
			json += ",\"skippedSuspendedFX\":" + std::to_string(skipped_suspended);
			json += ",\"attemptedWeapons\":" + std::to_string(attempted_weapons);
			json += ",\"attemptedWeaponNames\":[";
			for (std::size_t i = 0; i < attempted_weapon_names.size(); ++i) {
				if (i > 0) {
					json += ",";
				}
				json += "\"" + json_escape(attempted_weapon_names[i]) + "\"";
			}
			json += "]";
			json += ",\"sourceObjectId\":" + std::to_string(source_object_id);
			append_coord3d_fields(json, "position", pos);
			json += "}";
			return json.c_str();
		}
	} else {
		weapon = TheWeaponStore->findWeaponTemplate(AsciiString(requested_name));
		if (weapon == NULL) {
			json += ",\"guard\":\"missingWeaponTemplate\"}";
			return json.c_str();
		}
		detonation_fx = weapon->getProjectileDetonateFX(LEVEL_REGULAR);
		if (detonation_fx == NULL) {
			json += ",\"guard\":\"missingProjectileDetonationFX\"}";
			return json.c_str();
		}
		selected_particle_nuggets = detonation_fx->wasmGetParticleNuggetCount();
		TheWeaponStore->handleProjectileDetonation(
			weapon,
			source,
			&pos,
			static_cast<WeaponBonusConditionFlags>(0),
			inflict_damage != 0);
		systems_after = TheParticleSystemManager->getParticleSystemCount();
		particles_after = TheParticleSystemManager->getParticleCount();
		++attempted_weapons;
	}
	if (pump_frames > 0) {
		run_real_engine_frames(pump_frames);
		systems_after = TheParticleSystemManager->getParticleSystemCount();
		particles_after = TheParticleSystemManager->getParticleCount();
	}

	json = "{\"ok\":";
	json += (systems_after > systems_before || particles_after > particles_before) ? "true" : "false";
	json += ",\"source\":\"real-engine-weapon-detonation\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	json += ",\"selectedWeapon\":\"" + json_escape(weapon != NULL ? weapon->getName().str() : "") + "\"";
	json += ",\"autoSelected\":";
	json += auto_select_weapon ? "true" : "false";
	json += ",\"weaponTemplateCount\":" + std::to_string(weapon_template_count);
	json += ",\"inspectedWeapons\":" + std::to_string(inspected_weapons);
	json += ",\"skippedNoProjectileDetonationFX\":" + std::to_string(skipped_no_fx);
	json += ",\"skippedNoParticleProjectileDetonationFX\":" + std::to_string(skipped_no_particle_fx);
	json += ",\"skippedSuspendedFX\":" + std::to_string(skipped_suspended);
	json += ",\"attemptedWeapons\":" + std::to_string(attempted_weapons);
	json += ",\"sourceObjectId\":" + std::to_string(source_object_id);
	json += ",\"sourceTemplate\":\"";
	const ThingTemplate *source_template = source->getTemplate();
	json += json_escape(source_template != NULL ? source_template->getName().str() : "");
	json += "\"";
	json += ",\"shroud\":" + std::to_string(position_shroud);
	json += ",\"projectileDetonationFX\":true";
	json += ",\"detonationNuggets\":" + std::to_string(detonation_fx->wasmGetNuggetCount());
	json += ",\"detonationParticleNuggets\":" + std::to_string(selected_particle_nuggets);
	json += ",\"weaponSuspendFXDelay\":" + std::to_string(weapon != NULL ? weapon->getSuspendFXDelay() : 0);
	json += ",\"inflictDamage\":";
	json += inflict_damage != 0 ? "true" : "false";
	json += ",\"systemsBefore\":" + std::to_string(systems_before);
	json += ",\"systemsAfter\":" + std::to_string(systems_after);
	json += ",\"particlesBefore\":" + std::to_string(particles_before);
	json += ",\"particlesAfter\":" + std::to_string(particles_after);
	json += ",\"pumpFrames\":" + std::to_string(pump_frames > 0 ? pump_frames : 0);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	append_coord3d_fields(json, "position", pos);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_play_audio_event(
	const char *event_name,
	float x,
	float y,
	float z,
	int use_view_position,
	int positional,
	int force_on,
	int pump_frames)
{
	static std::string json;
	const char *requested_name = (event_name != NULL && event_name[0] != '\0')
		? event_name : "ArtilleryBarrageIncomingWhistle";
	json = "{\"ok\":false,\"source\":\"real-engine-audio-event\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	if (TheAudio == NULL) {
		json += ",\"guard\":\"TheAudio\"}";
		return json.c_str();
	}
	if (ThePlayerList == NULL || ThePlayerList->getLocalPlayer() == NULL) {
		json += ",\"guard\":\"ThePlayerList.localPlayer\"}";
		return json.c_str();
	}

	Coord3D pos = { x, y, z };
	if (use_view_position != 0) {
		if (TheTacticalView == NULL) {
			json += ",\"guard\":\"TheTacticalView\"}";
			return json.c_str();
		}
		TheTacticalView->getPosition(&pos);
	} else if (!std::isfinite(pos.x) || !std::isfinite(pos.y) || !std::isfinite(pos.z)) {
		json += ",\"guard\":\"invalidPosition\"}";
		return json.c_str();
	}
	if (TheTerrainLogic != NULL) {
		pos.z = TheTerrainLogic->getGroundHeight(pos.x, pos.y);
	}

	AsciiString name(requested_name);
	AudioEventRTS event = positional != 0
		? AudioEventRTS(name, &pos)
		: AudioEventRTS(name);
	event.setPlayerIndex(ThePlayerList->getLocalPlayer()->getPlayerIndex());
	TheAudio->getInfoForAudioEvent(&event);
	const AudioEventInfo *info = event.getAudioEventInfo();
	if (info == NULL) {
		json += ",\"guard\":\"missingAudioEventInfo\"";
		append_coord3d_fields(json, "position", pos);
		json += "}";
		return json.c_str();
	}

	AudioEventRTS filename_event(event);
	filename_event.generateFilename();
	const AsciiString filename = filename_event.getFilename();

	if (force_on != 0) {
		TheAudio->setOn(TRUE, AudioAffect_All);
	}
	const AudioHandle handle = TheAudio->addAudioEvent(&event);
	if (pump_frames > 0) {
		run_real_engine_frames(pump_frames);
	}

	json = "{\"ok\":";
	json += handle >= AHSV_FirstHandle ? "true" : "false";
	json += ",\"source\":\"real-engine-audio-event\"";
	json += ",\"requested\":\"" + json_escape(requested_name) + "\"";
	json += ",\"handle\":" + std::to_string(static_cast<unsigned long long>(handle));
	json += ",\"handleAccepted\":";
	json += handle >= AHSV_FirstHandle ? "true" : "false";
	json += ",\"audioType\":\"" + json_escape(audio_type_name(info->m_soundType)) + "\"";
	json += ",\"soundTypeBits\":" + std::to_string(static_cast<unsigned long long>(info->m_type));
	json += ",\"controlBits\":" + std::to_string(static_cast<unsigned long long>(info->m_control));
	json += ",\"eventVolume\":" + std::to_string(event.getVolume());
	json += ",\"eventInfoVolume\":" + std::to_string(info->m_volume);
	json += ",\"eventInfoVolumeShift\":" + std::to_string(info->m_volumeShift);
	json += ",\"audioMixer\":{";
	json += "\"music\":" + std::to_string(TheAudio->getVolume(AudioAffect_Music));
	json += ",\"sound\":" + std::to_string(TheAudio->getVolume(AudioAffect_Sound));
	json += ",\"sound3D\":" + std::to_string(TheAudio->getVolume(AudioAffect_Sound3D));
	json += ",\"speech\":" + std::to_string(TheAudio->getVolume(AudioAffect_Speech));
	json += ",\"musicOn\":";
	json += TheAudio->isOn(AudioAffect_Music) ? "true" : "false";
	json += ",\"soundOn\":";
	json += TheAudio->isOn(AudioAffect_Sound) ? "true" : "false";
	json += ",\"sound3DOn\":";
	json += TheAudio->isOn(AudioAffect_Sound3D) ? "true" : "false";
	json += ",\"speechOn\":";
	json += TheAudio->isOn(AudioAffect_Speech) ? "true" : "false";
	json += "}";
	const AudioSettings *audio_settings = TheAudio->getAudioSettings();
	if (audio_settings != NULL) {
		json += ",\"audioSettings\":{";
		json += "\"defaultSound\":" + std::to_string(audio_settings->m_defaultSoundVolume);
		json += ",\"defaultSound3D\":" + std::to_string(audio_settings->m_default3DSoundVolume);
		json += ",\"defaultSpeech\":" + std::to_string(audio_settings->m_defaultSpeechVolume);
		json += ",\"defaultMusic\":" + std::to_string(audio_settings->m_defaultMusicVolume);
		json += ",\"preferredSound\":" + std::to_string(audio_settings->m_preferredSoundVolume);
		json += ",\"preferredSound3D\":" + std::to_string(audio_settings->m_preferred3DSoundVolume);
		json += ",\"preferredSpeech\":" + std::to_string(audio_settings->m_preferredSpeechVolume);
		json += ",\"preferredMusic\":" + std::to_string(audio_settings->m_preferredMusicVolume);
		json += "}";
	}
	json += ",\"positional\":";
	json += event.isPositionalAudio() ? "true" : "false";
	json += ",\"filename\":\"" + json_escape(filename.str()) + "\"";
	json += ",\"pumpFrames\":" + std::to_string(pump_frames > 0 ? pump_frames : 0);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	append_coord3d_fields(json, "position", pos);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_stop_audio_event(
	unsigned int audio_handle,
	int pump_frames)
{
	static std::string json;
	json = "{\"ok\":false,\"source\":\"real-engine-audio-stop\"";
	json += ",\"handle\":" + std::to_string(static_cast<unsigned long long>(audio_handle));
	if (TheAudio == NULL) {
		json += ",\"guard\":\"TheAudio\"}";
		return json.c_str();
	}

	const AudioHandle handle = static_cast<AudioHandle>(audio_handle);
	TheAudio->removeAudioEvent(handle);
	if (pump_frames > 0) {
		run_real_engine_frames(pump_frames);
	}

	json = "{\"ok\":true,\"source\":\"real-engine-audio-stop\"";
	json += ",\"handle\":" + std::to_string(static_cast<unsigned long long>(handle));
	json += ",\"pumpFrames\":" + std::to_string(pump_frames > 0 ? pump_frames : 0);
	json += ",\"framesCompleted\":" + std::to_string(g_frame_state.frames_completed);
	json += "}";
	return json.c_str();
}

// ---------------------------------------------------------------------------
// Audio-device state diagnostic.
//
// Reports the real MilesAudioManager device state so the harness can confirm,
// in a live skirmish, whether the sample pools were actually allocated and a
// provider is open.  If the pools are 0/0 (provider never selected ->
// initSamplePools() never ran) every 2D/3D SFX and unit voice is silently
// dropped in SoundManager::canPlayNow() before it can reach AIL_start_sample(),
// which is exactly the "music plays but SFX/voices don't" symptom.
//
// The per-outcome counters come from g_milesAudioDeviceDiagnostics, which is
// defined in MilesAudioManager.cpp and instruments the real play path.  We
// mirror its layout here and pull it through the accessor declared alongside it.
struct MilesAudioDeviceDiagnostics
{
	unsigned long long addAudioEventRequested;
	unsigned long long playSampleRequested;
	unsigned long long playSampleStarted;
	unsigned long long playSampleDroppedFileNotFound;
	unsigned long long playSample3DRequested;
	unsigned long long playSample3DStarted;
	unsigned long long playSample3DDroppedFileNotFound;
	unsigned long long playSample3DDroppedNoPosition;
};
const MilesAudioDeviceDiagnostics *MilesAudioManagerPeekDeviceDiagnostics( void );

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_audio_device_state( void )
{
	static std::string json;
	json = "{\"ok\":false,\"source\":\"audio-device-state\"";
	if (TheAudio == NULL) {
		json += ",\"guard\":\"TheAudio\"}";
		return json.c_str();
	}

	const UnsignedInt selectedProvider = TheAudio->getSelectedProvider();
	const UnsignedInt providerCount = TheAudio->getProviderCount();
	// PROVIDER_ERROR is 0xFFFFFFFF; a selection >= providerCount means no
	// provider is bound and initSamplePools() has not run.
	const bool providerOpen = (selectedProvider < providerCount);

	json = "{\"ok\":true,\"source\":\"audio-device-state\"";
	json += ",\"selectedProvider\":" + std::to_string(static_cast<unsigned long long>(selectedProvider));
	json += ",\"providerOpen\":";
	json += providerOpen ? "true" : "false";
	json += ",\"providerCount\":" + std::to_string(static_cast<unsigned long long>(providerCount));
	json += ",\"selectedProviderName\":\"";
	if (providerOpen) {
		json += json_escape(TheAudio->getProviderName(selectedProvider).str());
	}
	json += "\"";

	// Enumerate the provider list so we can see whether the fast-2D failsafe
	// name the port relies on is actually present.
	json += ",\"providers\":[";
	for (UnsignedInt i = 0; i < providerCount; ++i) {
		if (i != 0) {
			json += ",";
		}
		json += "\"" + json_escape(TheAudio->getProviderName(i).str()) + "\"";
	}
	json += "]";

	// Pool sizes: these are 0/0 until initSamplePools() runs.  A non-zero
	// num2D/num3D is the load-bearing "pools were allocated" signal.
	const UnsignedInt num2D = TheAudio->getNum2DSamples();
	const UnsignedInt num3D = TheAudio->getNum3DSamples();
	json += ",\"num2DSamples\":" + std::to_string(static_cast<unsigned long long>(num2D));
	json += ",\"num3DSamples\":" + std::to_string(static_cast<unsigned long long>(num3D));
	json += ",\"poolsAllocated\":";
	json += (num2D > 0 || num3D > 0) ? "true" : "false";

	// Preferred/failsafe provider name resolution: this is what selectProvider()
	// tried to open, and why the pools may not have been allocated.
	const AudioSettings *settings = TheAudio->getAudioSettings();
	if (settings != NULL) {
		const AsciiString fast2D("Miles Fast 2D Positional Audio");
		json += ",\"fast2DProviderIndex\":" +
			std::to_string(static_cast<unsigned long long>(TheAudio->getProviderIndex(fast2D)));
	}

	// Per-outcome play-path counters from the real MilesAudioManager.
	const MilesAudioDeviceDiagnostics *diag = MilesAudioManagerPeekDeviceDiagnostics();
	if (diag != NULL) {
		json += ",\"playPath\":{";
		json += "\"addAudioEventRequested\":" + std::to_string(diag->addAudioEventRequested);
		json += ",\"playSampleRequested\":" + std::to_string(diag->playSampleRequested);
		json += ",\"playSampleStarted\":" + std::to_string(diag->playSampleStarted);
		json += ",\"playSampleDroppedFileNotFound\":" + std::to_string(diag->playSampleDroppedFileNotFound);
		json += ",\"playSample3DRequested\":" + std::to_string(diag->playSample3DRequested);
		json += ",\"playSample3DStarted\":" + std::to_string(diag->playSample3DStarted);
		json += ",\"playSample3DDroppedFileNotFound\":" + std::to_string(diag->playSample3DDroppedFileNotFound);
		json += ",\"playSample3DDroppedNoPosition\":" + std::to_string(diag->playSample3DDroppedNoPosition);
		json += "}";
	}

	json += ",\"soundOn\":";
	json += TheAudio->isOn(AudioAffect_Sound) ? "true" : "false";
	json += ",\"sound3DOn\":";
	json += TheAudio->isOn(AudioAffect_Sound3D) ? "true" : "false";
	json += ",\"speechOn\":";
	json += TheAudio->isOn(AudioAffect_Speech) ? "true" : "false";
	json += "}";
	return json.c_str();
}

// Query all drawables in the game client, returning position, ownership, and
// screen-space info. Safe to call before init — returns {"ready":false}.
//
// Diagnostic protocol (stdout phase markers survive a hard wasm trap, which
// Emscripten try/catch does NOT catch):
//   "cnc-port: query_drawables START ..." is printed just before the loop
//   "cnc-port: query_drawables DONE ..."  is printed after the loop returns
// If START prints and DONE does not, the iteration TRAPPED (hard abort) and
// the resulting null/aborted JSON seen on the JS side is therefore a trap.
// When the JSON parses, the WTS breakdown in `stats` distinguishes a null
// TheTacticalView camera (WTS_INVALID), an off-frustum unit (WTS_OUTSIDE),
// or a genuinely on-screen unit (WTS_INSIDE).
static void append_drawable_body_json(std::string &json, Object *obj)
{
	json += ",\"body\":{";
	BodyModuleInterface *body = NULL;
	try {
		body = obj != NULL ? obj->getBodyModule() : NULL;
	} catch (...) {
		body = NULL;
	}
	if (body == NULL) {
		json += "\"ready\":false,\"health\":null,\"maxHealth\":null,"
			"\"damageState\":null,\"lastDamageTimestamp\":null}";
		json += "}";
		return;
	}

	Real health = 0.0f;
	Real max_health = 0.0f;
	Int damage_state = -1;
	UnsignedInt last_damage_timestamp = 0;
	try {
		health = body->getHealth();
		max_health = body->getMaxHealth();
		damage_state = static_cast<Int>(body->getDamageState());
		last_damage_timestamp = body->getLastDamageTimestamp();
	} catch (...) {
		json += "\"ready\":false,\"health\":null,\"maxHealth\":null,"
			"\"damageState\":null,\"lastDamageTimestamp\":null}";
		json += "}";
		return;
	}

	json += "\"ready\":true";
	json += ",\"health\":" + std::to_string(health);
	json += ",\"maxHealth\":" + std::to_string(max_health);
	json += ",\"damageState\":" + std::to_string(damage_state);
	json += ",\"lastDamageTimestamp\":" + std::to_string(last_damage_timestamp);
	json += "}";
}

static void append_drawable_probe_entry_json(
	std::string &json,
	const Drawable *drawable,
	Object *obj,
	const ThingTemplate *tpl,
	Player *owner,
	const Player *local_player,
	bool is_structure,
	bool is_hidden,
	const Coord3D *pos,
	bool on_screen,
	const ICoord2D &screen_pos)
{
	json += "{";

	long long drawable_id = 0;
	try {
		drawable_id = drawable != NULL ? static_cast<long long>(drawable->getID()) : -1;
	} catch (...) {
		drawable_id = -1;
	}
	json += "\"drawableId\":" + std::to_string(drawable_id);

	long long obj_id = 0;
	try {
		obj_id = obj != NULL ? static_cast<long long>(obj->getID()) : -1;
	} catch (...) {
		obj_id = -1;
	}
	json += ",\"id\":" + std::to_string(obj_id);
	json += ",\"objectId\":" + std::to_string(obj_id);
	json += ",\"name\":\"" + json_escape(tpl ? tpl->getName().str() : "unknown") + "\"";
	const UnicodeString display_name = tpl != NULL
		? tpl->getDisplayName()
		: UnicodeString::TheEmptyString;
	json += ",\"displayName\":\"" + json_escape(unicode_to_debug_ascii(display_name)) + "\"";
	json += ",\"displayNameLength\":" +
		std::to_string(static_cast<long long>(display_name.getLength()));

	if (owner != NULL) {
		json += ",\"playerIndex\":" + std::to_string(owner->getPlayerIndex());
		json += ",\"localOwned\":";
		json += (owner == local_player) ? "true" : "false";
	} else {
		json += ",\"playerIndex\":-1,\"localOwned\":false";
	}

	Int relationship_to_local = -1;
	try {
		if (obj != NULL && local_player != NULL && obj->getTeam() != NULL) {
			relationship_to_local = static_cast<Int>(local_player->getRelationship(obj->getTeam()));
		}
	} catch (...) {
		relationship_to_local = -1;
	}
	json += ",\"relationshipToLocal\":" + std::to_string(relationship_to_local);
	json += ",\"hostileToLocal\":";
	json += relationship_to_local == ENEMIES ? "true" : "false";
	if (relationship_to_local >= ENEMIES && relationship_to_local <= ALLIES) {
		json += ",\"relationshipToLocalName\":\"";
		json += TheRelationshipNames[relationship_to_local];
		json += "\"";
	} else {
		json += ",\"relationshipToLocalName\":\"UNKNOWN\"";
	}

	json += ",\"structure\":";
	json += is_structure ? "true" : "false";
	json += ",\"kindOf\":{";
	json += "\"selectable\":";
	json += obj != NULL && obj->isKindOf(KINDOF_SELECTABLE) ? "true" : "false";
	json += ",\"supplySource\":";
	json += obj != NULL && obj->isKindOf(KINDOF_SUPPLY_SOURCE) ? "true" : "false";
	json += ",\"alwaysSelectable\":";
	json += obj != NULL && obj->isKindOf(KINDOF_ALWAYS_SELECTABLE) ? "true" : "false";
	json += ",\"clickThrough\":";
	json += obj != NULL && obj->isKindOf(KINDOF_CLICK_THROUGH) ? "true" : "false";
	json += ",\"dozer\":";
	json += obj != NULL && obj->isKindOf(KINDOF_DOZER) ? "true" : "false";
	json += ",\"harvester\":";
	json += obj != NULL && obj->isKindOf(KINDOF_HARVESTER) ? "true" : "false";
	json += "}";
	Int shroud_status = -1;
	try {
		shroud_status = obj != NULL && local_player != NULL
			? static_cast<Int>(obj->getShroudedStatus(local_player->getPlayerIndex()))
			: -1;
	} catch (...) {
		shroud_status = -1;
	}
	json += ",\"shroudStatus\":" + std::to_string(shroud_status);
	json += ",\"hidden\":";
	json += is_hidden ? "true" : "false";
	json += ",\"effectivelyDead\":";
	try {
		json += obj != NULL && obj->isEffectivelyDead() ? "true" : "false";
	} catch (...) {
		json += "false";
	}

	if (pos != NULL) {
		json += ",\"worldPos\":{\"x\":" + std::to_string(pos->x);
		json += ",\"y\":" + std::to_string(pos->y);
		json += ",\"z\":" + std::to_string(pos->z) + "}";
	} else {
		json += ",\"worldPos\":null";
	}

	json += ",\"onScreen\":";
	json += on_screen ? "true" : "false";
	json += ",\"screenPos\":{\"x\":" + std::to_string(screen_pos.x);
	json += ",\"y\":" + std::to_string(screen_pos.y) + "}";
	append_drawable_body_json(json, obj);
	json += "}";
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_query_drawables()
{
	static std::string json;
	if (TheGameClient == nullptr) {
		std::printf("cnc-port: query_drawables GUARD TheGameClient\n"); std::fflush(stdout);
		json = "{\"ready\":false,\"guard\":\"TheGameClient\",\"started\":false}";
		return json.c_str();
	}
	if (ThePlayerList == nullptr) {
		std::printf("cnc-port: query_drawables GUARD ThePlayerList\n"); std::fflush(stdout);
		json = "{\"ready\":false,\"guard\":\"ThePlayerList\",\"started\":false}";
		return json.c_str();
	}
	if (TheTacticalView == nullptr) {
		std::printf("cnc-port: query_drawables GUARD TheTacticalView\n"); std::fflush(stdout);
		json = "{\"ready\":false,\"guard\":\"TheTacticalView\",\"started\":false}";
		return json.c_str();
	}

	const Player *localPlayer = ThePlayerList->getLocalPlayer();
	const int localIdx = localPlayer ? localPlayer->getPlayerIndex() : -1;

	// Filter counters for diagnostics
	int totalDrawables = 0;
	int noObject = 0;
	int notOwned = 0;
	int offScreen = 0;
	int hidden = 0;
	int kept = 0;
	// Detailed ownership (computed BEFORE the offScreen filter so we know
	// whether the query is being killed by ownership or by worldToScreen)
	int ownedNull = 0;     // owner == nullptr (unowned / hazard object)
	int ownedLocal = 0;    // owner == localPlayer
	int ownedNotLocal = 0; // owner != nullptr && owner != localPlayer
	int enemyKept = 0;
	// worldToScreen tri-return breakdowns (View::WorldToScreenReturn enums).
	int wtsInside = 0;
	int wtsOutside = 0;
	int wtsInvalid = 0;

	std::printf("cnc-port: query_drawables START localIdx=%d gC=1 gP=1 gV=1\n", localIdx);
	std::fflush(stdout);

	json = "{\"ready\":true,\"started\":true,\"guard\":\"none\",\"localPlayerIndex\":" + std::to_string(localIdx) + ",\"drawables\":[";
	bool first = true;
	std::string enemy_json;
	bool enemy_first = true;
	std::string all_json;
	bool all_first = true;
	int allKept = 0;

	for (Drawable *d = TheGameClient->firstDrawable(); d; d = d->getNextDrawable()) {
		totalDrawables++;
		if (d == nullptr) {
			continue;
		}
		Object *obj = d->getObject();
		if (obj == nullptr) {
			noObject++;
			continue;
		}

		// Defensive: guard against corrupted objects mid-game (destroyed/invalidating)
		const ThingTemplate *tpl = obj->getTemplate();
		const Coord3D *pos = obj->getPosition();
		if (!pos) {
			continue;
		}

		// Guard: isfinite check on all position components
		if (!std::isfinite(pos->x) || !std::isfinite(pos->y) || !std::isfinite(pos->z)) {
			continue;
		}

		// Diagnose worldToScreen via the tri-return virtual so we can distinguish
		// WTS_INVALID (most likely m_3DCamera==NULL on the WASM WW3D device, a
		// trap-safe condition) from WTS_OUTSIDE_FRUSTUM (off-screen but valid
		// transform) from WTS_INSIDE_FRUSTUM (genuinely on-screen). On the WASM
		// build this path is deref-safe: View::worldToScreenTriReturn nulls w/s
		// and W3DView::worldToScreenTriReturn nulls m_3DCamera in WTS_INVALID.
		ICoord2D screenPos = { 0, 0 };
		int wtsStatus = -1; // -1 = could not query (try threw)
		try {
			wtsStatus = (int)TheTacticalView->worldToScreenTriReturn(pos, &screenPos);
		} catch (...) {
			wtsStatus = -1;
		}
		bool onScreen;
		if (wtsStatus == (int)View::WTS_INSIDE_FRUSTUM) {
			wtsInside++;
			onScreen = true;
		} else if (wtsStatus == (int)View::WTS_OUTSIDE_FRUSTUM) {
			wtsOutside++;
			onScreen = false;
		} else {
			// WTS_INVALID or try/no-virtual failure -> treat as off-screen.
			wtsInvalid++;
			onScreen = false;
		}

		// Filter: not local-owned. obj->getControllingPlayer() is deref-safe
		// (Object.cpp) and returns NULL when there is no team; we never deref
		// the returned pointer before this NULL check, so a corrupt owner
		// pointer cannot trap the RPC.
		Player *owner = nullptr;
		try {
			owner = obj->getControllingPlayer();
		} catch (...) {
			owner = nullptr;
		}

		bool isStructure = false;
		try {
			isStructure = obj->isKindOf(KINDOF_STRUCTURE);
		} catch (...) {
			isStructure = false;
		}

		bool isHidden = false;
		try {
			isHidden = d->isDrawableEffectivelyHidden();
		} catch (...) {
			isHidden = false;
		}

		if (!all_first) {
			all_json += ",";
		}
		all_first = false;
		++allKept;
		append_drawable_probe_entry_json(
			all_json,
			d,
			obj,
			tpl,
			owner,
			localPlayer,
			isStructure,
			isHidden,
			pos,
			onScreen,
			screenPos);

		if (owner == nullptr) {
			ownedNull++;
		} else if (owner == localPlayer) {
			ownedLocal++;
		} else {
			ownedNotLocal++;
			notOwned++;
			if (onScreen && !isHidden) {
				if (!enemy_first) {
					enemy_json += ",";
				}
				enemy_first = false;
				++enemyKept;
				append_drawable_probe_entry_json(
					enemy_json,
					d,
					obj,
					tpl,
					owner,
					localPlayer,
					isStructure,
					isHidden,
					pos,
					onScreen,
					screenPos);
			}
			continue;
		}
		// NOTE: ownedNull units (e.g. terrain blobs, ambient effects) survive
		// the ownership filter but are usually off-screen or hidden, so they
		// naturally funnel into offScreen/hidden counters below. We keep this
		// loose in diagnostics so the JSON reports them in `stats` rather
		// than silently dropping — the harness's `localOwned === true`==kept
		// predicate then naturally filters them out at the JS layer.

		// Filter: off-screen (or WTS_INVALID — see breakdown above)
		if (!onScreen) {
			offScreen++;
			continue;
		}

		if (isHidden) {
			hidden++;
			continue;
		}

		kept++;

		if (!first) {
			json += ",";
		}
		first = false;

		append_drawable_probe_entry_json(
			json,
			d,
			obj,
			tpl,
			owner,
			localPlayer,
			isStructure,
			isHidden,
			pos,
			onScreen,
			screenPos);
	}

	json += "]";
	json += ",\"enemyDrawables\":[";
	json += enemy_json;
	json += "]";
	json += ",\"allDrawables\":[";
	json += all_json;
	json += "]";
	json += ",\"stats\":{\"total\":" + std::to_string(totalDrawables);
	json += ",\"noObject\":" + std::to_string(noObject);
	json += ",\"allKept\":" + std::to_string(allKept);
	json += ",\"notOwned\":" + std::to_string(notOwned);
	json += ",\"ownedNull\":" + std::to_string(ownedNull);
	json += ",\"ownedLocal\":" + std::to_string(ownedLocal);
	json += ",\"ownedNotLocal\":" + std::to_string(ownedNotLocal);
	json += ",\"enemyKept\":" + std::to_string(enemyKept);
	json += ",\"offScreen\":" + std::to_string(offScreen);
	json += ",\"hidden\":" + std::to_string(hidden);
	json += ",\"kept\":" + std::to_string(kept);
	json += ",\"wtsInside\":" + std::to_string(wtsInside);
	json += ",\"wtsOutside\":" + std::to_string(wtsOutside);
	json += ",\"wtsInvalid\":" + std::to_string(wtsInvalid);
	// Close `stats` and the root object in a single `}}`. NOTE: a previous
	// instrumentation revision emitted `}}` then a stray `}` here, producing
	// a trailing brace after a complete JSON value (`Unexpected non-whitespace
	// character after JSON at position N`) so JSON.parse failed, the bridge
	// caught it as `aborted:true`, and `cnc_port_query_drawables` was therefore
	// returning `{ ok:false, ready:undefined, drawables:0 }` to the harness
	// even though the wasm call had fully succeeded — see scout Mac trace and
	// /tmp/runs/interact-probe1.log `[interact] queryDrawables ok: false aborted:
	// true abortMessage: Unexpected non-whitespace character after JSON …`.
	json += "}}";
	std::printf("cnc-port: query_drawables DONE total=%d noObject=%d notOwned=%d ownedNull=%d ownedLocal=%d ownedNotLocal=%d offScreen=%d hidden=%d kept=%d wtsI=%d wtsO=%d wtsInv=%d\n",
		totalDrawables, noObject, notOwned, ownedNull, ownedLocal, ownedNotLocal, offScreen, hidden, kept, wtsInside, wtsOutside, wtsInvalid);
	std::fflush(stdout);
	return json.c_str();
}

// Query the current selection state from InGameUI.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_query_selection()
{
	static std::string json;
	if (TheInGameUI == nullptr) {
		std::printf("cnc-port: query_selection GUARD TheInGameUI\n"); std::fflush(stdout);
		json = "{\"ready\":false,\"started\":false,\"guard\":\"TheInGameUI\"}";
		return json.c_str();
	}

	Int selectCount = 0;
	try {
		selectCount = TheInGameUI->getSelectCount();
	} catch (...) {
		selectCount = 0;
	}
	const DrawableList *sel = nullptr;
	try {
		sel = TheInGameUI->getAllSelectedDrawables();
	} catch (...) {
		sel = nullptr;
	}

	json = "{\"ready\":true,\"selectCount\":" + std::to_string(selectCount);
	json += ",\"selectedControllable\":";
	try {
		json += TheInGameUI->areSelectedObjectsControllable() ? "true" : "false";
	} catch (...) {
		json += "false";
	}
	json += ",\"inputSettings\":{\"useAlternateMouse\":";
	if (TheGlobalData != nullptr) {
		json += TheGlobalData->m_useAlternateMouse ? "true" : "false";
	} else {
		json += "null";
	}
	json += "}";
	json += ",\"modes\":{";
	json += "\"waypoint\":";
	json += TheInGameUI->isInWaypointMode() ? "true" : "false";
	json += ",\"attackMoveTo\":";
	json += TheInGameUI->isInAttackMoveToMode() ? "true" : "false";
	json += ",\"forceMoveTo\":";
	json += TheInGameUI->isInForceMoveToMode() ? "true" : "false";
	json += ",\"forceAttack\":";
	json += TheInGameUI->isInForceAttackMode() ? "true" : "false";
	json += ",\"preferSelection\":";
	json += TheInGameUI->isInPreferSelectionMode() ? "true" : "false";
	json += ",\"placementAnchored\":";
	json += TheInGameUI->isPlacementAnchored() ? "true" : "false";
	json += ",\"pendingPlaceType\":";
	const ThingTemplate *pending_place_type = TheInGameUI->getPendingPlaceType();
	if (pending_place_type != NULL) {
		json += "\"" + json_escape(pending_place_type->getName().str()) + "\"";
	} else {
		json += "null";
	}
	json += ",\"pendingPlaceSourceObjectId\":" +
		std::to_string(static_cast<long long>(
			TheInGameUI->getPendingPlaceSourceObjectID()));
	json += "}";
	json += ",\"guiCommand\":";
	append_command_button_json(json, TheInGameUI->getGUICommand());
	json += ",\"commandPath\":{";
	json += "\"lastClickType\":" + std::to_string(cnc_port_command_xlat_last_click_type());
	json += ",\"lastClickIsPoint\":" + std::to_string(cnc_port_command_xlat_last_click_is_point());
	json += ",\"lastClickControllable\":" + std::to_string(cnc_port_command_xlat_last_click_controllable());
	json += ",\"lastClickUseAlternateMouse\":" + std::to_string(cnc_port_command_xlat_last_click_use_alternate_mouse());
	json += ",\"lastClickIssuedType\":" + std::to_string(cnc_port_command_xlat_last_click_issued_type());
	json += ",\"lastClickIssuedTypeName\":\"";
	json += game_message_type_name(cnc_port_command_xlat_last_click_issued_type());
	json += "\"";
	json += ",\"lastClickDrawId\":" + std::to_string(cnc_port_command_xlat_last_click_draw_id());
	json += ",\"lastClickWorldPos\":{\"x\":" + std::to_string(cnc_port_command_xlat_last_click_x());
	json += ",\"y\":" + std::to_string(cnc_port_command_xlat_last_click_y());
	json += ",\"z\":" + std::to_string(cnc_port_command_xlat_last_click_z()) + "}";
	json += ",\"rawRightDownCount\":" + std::to_string(cnc_port_command_xlat_raw_right_down_count());
	json += ",\"rawRightUpCount\":" + std::to_string(cnc_port_command_xlat_raw_right_up_count());
	json += ",\"rightClickSeenCount\":" + std::to_string(cnc_port_command_xlat_right_click_seen_count());
	json += ",\"rightClickIsClick\":" + std::to_string(cnc_port_command_xlat_right_click_is_click());
	json += ",\"rightClickDownTime\":" + std::to_string(cnc_port_command_xlat_right_click_down_time());
	json += ",\"rightClickUpTime\":" + std::to_string(cnc_port_command_xlat_right_click_up_time());
	json += ",\"moveIssueCount\":" + std::to_string(cnc_port_command_xlat_move_issue_count());
	json += ",\"moveAppendCount\":" + std::to_string(cnc_port_command_xlat_move_append_count());
	json += ",\"moveLastMsgType\":" + std::to_string(cnc_port_command_xlat_move_last_msg_type());
	json += ",\"moveLastMsgTypeName\":\"";
	json += game_message_type_name(cnc_port_command_xlat_move_last_msg_type());
	json += "\"";
	json += ",\"moveLastCommandType\":" + std::to_string(cnc_port_command_xlat_move_last_command_type());
	json += ",\"moveLastTeamExists\":" + std::to_string(cnc_port_command_xlat_move_last_team_exists());
	json += ",\"moveLastWorldPos\":{\"x\":" + std::to_string(cnc_port_command_xlat_move_last_x());
	json += ",\"y\":" + std::to_string(cnc_port_command_xlat_move_last_y());
	json += ",\"z\":" + std::to_string(cnc_port_command_xlat_move_last_z()) + "}";
	json += ",\"dispatchMoveCommandCount\":" + std::to_string(cnc_port_logic_dispatch_move_command_count());
	json += ",\"dispatchLastMoveCommandType\":" + std::to_string(cnc_port_logic_dispatch_last_move_command_type());
	json += ",\"dispatchLastMoveCommandTypeName\":\"";
	json += game_message_type_name(cnc_port_logic_dispatch_last_move_command_type());
	json += "\"";
	json += ",\"dispatchLastMoveHadGroup\":" + std::to_string(cnc_port_logic_dispatch_last_move_had_group());
	json += ",\"dispatchLastMoveWorldPos\":{\"x\":" + std::to_string(cnc_port_logic_dispatch_last_move_x());
	json += ",\"y\":" + std::to_string(cnc_port_logic_dispatch_last_move_y());
	json += ",\"z\":" + std::to_string(cnc_port_logic_dispatch_last_move_z()) + "}";
	json += ",\"dispatchAttackCommandCount\":" + std::to_string(cnc_port_logic_dispatch_attack_command_count());
	json += ",\"dispatchLastAttackCommandType\":" + std::to_string(cnc_port_logic_dispatch_last_attack_command_type());
	json += ",\"dispatchLastAttackCommandTypeName\":\"";
	json += game_message_type_name(cnc_port_logic_dispatch_last_attack_command_type());
	json += "\"";
	json += ",\"dispatchLastAttackHadGroup\":" + std::to_string(cnc_port_logic_dispatch_last_attack_had_group());
	json += ",\"dispatchLastAttackTargetId\":" + std::to_string(cnc_port_logic_dispatch_last_attack_target_id());
	json += ",\"dispatchLastAttackTargetWorldPos\":{\"x\":" + std::to_string(cnc_port_logic_dispatch_last_attack_target_x());
	json += ",\"y\":" + std::to_string(cnc_port_logic_dispatch_last_attack_target_y());
	json += ",\"z\":" + std::to_string(cnc_port_logic_dispatch_last_attack_target_z()) + "}";
	json += ",\"dispatchDockCommandCount\":" + std::to_string(cnc_port_logic_dispatch_dock_command_count());
	json += ",\"dispatchLastDockCommandType\":" + std::to_string(cnc_port_logic_dispatch_last_dock_command_type());
	json += ",\"dispatchLastDockCommandTypeName\":\"";
	json += game_message_type_name(cnc_port_logic_dispatch_last_dock_command_type());
	json += "\"";
	json += ",\"dispatchLastDockHadGroup\":" + std::to_string(cnc_port_logic_dispatch_last_dock_had_group());
	json += ",\"dispatchLastDockTargetId\":" + std::to_string(cnc_port_logic_dispatch_last_dock_target_id());
	json += ",\"dispatchLastDockTargetWorldPos\":{\"x\":" + std::to_string(cnc_port_logic_dispatch_last_dock_target_x());
	json += ",\"y\":" + std::to_string(cnc_port_logic_dispatch_last_dock_target_y());
	json += ",\"z\":" + std::to_string(cnc_port_logic_dispatch_last_dock_target_z()) + "}";
	json += ",\"dispatchBuildCommandCount\":" + std::to_string(cnc_port_logic_dispatch_build_command_count());
	json += ",\"dispatchLastBuildCommandType\":" + std::to_string(cnc_port_logic_dispatch_last_build_command_type());
	json += ",\"dispatchLastBuildHadGroup\":" + std::to_string(cnc_port_logic_dispatch_last_build_had_group());
	json += ",\"dispatchLastBuildArg0\":" + std::to_string(cnc_port_logic_dispatch_last_build_arg0());
	json += ",\"dispatchQueueUpgradeCount\":" + std::to_string(cnc_port_logic_dispatch_queue_upgrade_count());
	json += ",\"dispatchQueueUnitCreateCount\":" + std::to_string(cnc_port_logic_dispatch_queue_unit_create_count());
	json += ",\"dispatchDozerConstructCount\":" + std::to_string(cnc_port_logic_dispatch_dozer_construct_count());
	json += ",\"dispatchPurchaseScienceCount\":" + std::to_string(cnc_port_logic_dispatch_purchase_science_count());
	json += "}";
	json += ",\"selected\":[";
	bool first = true;
	if (sel != nullptr) {
		for (Drawable *d : *sel) {
			if (d == nullptr) {
				continue;
			}
			Object *obj = nullptr;
			try {
				obj = d->getObject();
			} catch (...) {
				obj = nullptr;
			}
			if (obj == nullptr) {
				continue;
			}

			const Coord3D *pos = obj->getPosition();
			if (!pos) {
				continue;
			}
			// Guard: isfinite check on all position components
			if (!std::isfinite(pos->x) || !std::isfinite(pos->y) || !std::isfinite(pos->z)) {
				continue;
			}

			if (!first) {
				json += ",";
			}
			first = false;

			json += "{";
			// Guard: getID() can crash if obj vtable is corrupted
			long long objId = 0;
			try {
				objId = static_cast<long long>(obj->getID());
			} catch (...) {
				objId = -1;
			}
			json += "\"id\":" + std::to_string(objId);
			const ThingTemplate *selected_template = NULL;
			try {
				selected_template = obj->getTemplate();
			} catch (...) {
				selected_template = NULL;
			}
			json += ",\"templateName\":";
			if (selected_template != NULL) {
				json += "\"" + json_escape(selected_template->getName().str()) + "\"";
			} else {
				json += "null";
			}
			json += ",\"kindOf\":{\"dozer\":";
			json += selected_template != NULL && selected_template->isKindOf(KINDOF_DOZER)
				? "true" : "false";
			json += ",\"structure\":";
			json += selected_template != NULL &&
				selected_template->isKindOf(KINDOF_STRUCTURE) ? "true" : "false";
			json += "}";
			Player *owner = nullptr;
			try {
				owner = obj->getControllingPlayer();
			} catch (...) {
				owner = nullptr;
			}
			json += ",\"playerIndex\":";
			json += owner != nullptr ? std::to_string(owner->getPlayerIndex()) : "-1";
			json += ",\"locallyControlled\":";
			try {
				json += obj->isLocallyControlled() ? "true" : "false";
			} catch (...) {
				json += "false";
			}
			json += ",\"ai\":";
			AIUpdateInterface *ai = NULL;
			try {
				ai = obj->getAIUpdateInterface();
			} catch (...) {
				ai = NULL;
			}
			if (ai != NULL) {
				json += "{\"ready\":true";
				json += ",\"stateId\":";
				try {
					json += std::to_string(static_cast<Int>(ai->getCurrentStateID()));
				} catch (...) {
					json += "-1";
				}
				json += ",\"stateName\":\"";
				try {
					json += json_escape(ai->getCurrentStateName().str());
				} catch (...) {
					json += "";
				}
				json += "\"";
				json += ",\"idle\":";
				try {
					json += ai->isIdle() ? "true" : "false";
				} catch (...) {
					json += "false";
				}
				json += ",\"moving\":";
				try {
					json += ai->isMoving() ? "true" : "false";
				} catch (...) {
					json += "false";
				}
				json += ",\"waitingForPath\":";
				try {
					json += ai->isWaitingForPath() ? "true" : "false";
				} catch (...) {
					json += "false";
				}
				Object *goal = NULL;
				try {
					goal = ai->getGoalObject();
				} catch (...) {
					goal = NULL;
				}
				json += ",\"goalObjectId\":";
				json += goal != NULL ? std::to_string(static_cast<Int>(goal->getID())) : "-1";
				json += ",\"goalTemplateName\":";
				const ThingTemplate *goal_template = NULL;
				if (goal != NULL) {
					try {
						goal_template = goal->getTemplate();
					} catch (...) {
						goal_template = NULL;
					}
				}
				if (goal_template != NULL) {
					json += "\"" + json_escape(goal_template->getName().str()) + "\"";
				} else {
					json += "null";
				}
				json += "}";
			} else {
				json += "{\"ready\":false}";
			}
			json += ",\"worldPos\":{\"x\":" + std::to_string(pos->x);
			json += ",\"y\":" + std::to_string(pos->y);
			json += ",\"z\":" + std::to_string(pos->z) + "}";
			json += "}";
		}
	}
	json += "]";
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE int cnc_port_set_mouse_cursor_for_harness(int cursor)
{
	if (TheMouse == NULL || cursor < Mouse::FIRST_CURSOR || cursor >= Mouse::NUM_MOUSE_CURSORS) {
		return 0;
	}

	TheMouse->setVisibility(TRUE);
	TheMouse->setCursor(static_cast<Mouse::MouseCursor>(cursor));
	return TheMouse->getMouseCursor() == cursor ? 1 : 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_click_window_by_name(const char *window_name)
{
	static std::string json;
	json = "{";
	json += "\"ready\":";
	json += TheWindowManager != NULL ? "true" : "false";
	json += ",\"requestedName\":\"";
	json += json_escape(window_name != NULL ? window_name : "");
	json += "\"";

	if (TheWindowManager == NULL) {
		json += ",\"clicked\":false,\"guard\":\"TheWindowManager\"}";
		return json.c_str();
	}
	if (window_name == NULL || window_name[0] == '\0') {
		json += ",\"clicked\":false,\"guard\":\"windowName\"}";
		return json.c_str();
	}

	GameWindow *window = find_window_by_name(window_name);
	if (window == NULL) {
		json += ",\"clicked\":false,\"guard\":\"window\"}";
		return json.c_str();
	}

	Int x = 0;
	Int y = 0;
	Int width = 0;
	Int height = 0;
	window->winGetScreenPosition(&x, &y);
	window->winGetSize(&width, &height);
	const Int center_x = x + width / 2;
	const Int center_y = y + height / 2;
	const UnsignedInt packed_mouse_coords = SHORTTOLONG(center_x, center_y);
	const WindowMsgHandledType down_result =
		TheWindowManager->winSendInputMsg(window, GWM_LEFT_DOWN, packed_mouse_coords, 0);
	const WindowMsgHandledType up_result =
		TheWindowManager->winSendInputMsg(window, GWM_LEFT_UP, packed_mouse_coords, 0);

	json += ",\"clicked\":true";
	json += ",\"point\":{\"x\":" + std::to_string(center_x);
	json += ",\"y\":" + std::to_string(center_y) + "}";
	json += ",\"downResult\":" + std::to_string(static_cast<int>(down_result));
	json += ",\"upResult\":" + std::to_string(static_cast<int>(up_result));
	json += ",\"window\":";
	append_window_json(json, window, window_name);
	json += "}";
	return json.c_str();
}

// Diagnostic for the shell-map path: GameEngine::init silently clears
// m_shellMapOn when the shell map misses TheMapCache, so expose the cache
// size, the lookup result, and a few shell-ish keys.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_map_cache_probe()
{
	static std::string json;
	json = "{";
	json += "\"mapCacheReady\":";
	json += TheMapCache != NULL ? "true" : "false";
	if (TheMapCache != NULL) {
		json += ",\"mapCount\":" + std::to_string(static_cast<long long>(TheMapCache->size()));
		AsciiString lowerName = TheGlobalData != NULL ? TheGlobalData->m_shellMapName : AsciiString::TheEmptyString;
		lowerName.toLower();
		json += ",\"shellMapName\":\"" + json_escape(lowerName.str()) + "\"";
		json += ",\"shellMapFound\":";
		json += TheMapCache->find(lowerName) != TheMapCache->end() ? "true" : "false";
		json += ",\"shellMapOn\":";
		json += (TheGlobalData != NULL && TheGlobalData->m_shellMapOn) ? "true" : "false";
		json += ",\"globalMapName\":\"";
		json += TheGlobalData != NULL ? json_escape(TheGlobalData->m_mapName.str()) : "";
		json += "\"";
		int official_count = 0;
		int multiplayer_count = 0;
		int official_multiplayer_count = 0;
		AsciiString first_official_multiplayer = AsciiString::TheEmptyString;
		const MapMetaData *first_official_multiplayer_metadata = NULL;
		for (MapCache::const_iterator it = TheMapCache->begin(); it != TheMapCache->end(); ++it) {
			if (it->second.m_isOfficial) {
				++official_count;
			}
			if (it->second.m_isMultiplayer) {
				++multiplayer_count;
			}
			if (it->second.m_isOfficial && it->second.m_isMultiplayer) {
				++official_multiplayer_count;
				if (first_official_multiplayer.isEmpty()) {
					first_official_multiplayer = it->first;
					first_official_multiplayer_metadata = &it->second;
				}
			}
		}
		json += ",\"officialCount\":" + std::to_string(static_cast<long long>(official_count));
		json += ",\"multiplayerCount\":" + std::to_string(static_cast<long long>(multiplayer_count));
		json += ",\"officialMultiplayerCount\":"
			+ std::to_string(static_cast<long long>(official_multiplayer_count));
		json += ",\"firstOfficialMultiplayerMap\":\"" + json_escape(first_official_multiplayer.str()) + "\"";
		append_map_metadata_json(json, "firstOfficialMultiplayerMetadata", first_official_multiplayer_metadata);
		json += ",\"officialMultiplayerMaps\":[";
		int emitted = 0;
		for (MapCache::const_iterator it = TheMapCache->begin(); it != TheMapCache->end(); ++it) {
			if (!(it->second.m_isOfficial && it->second.m_isMultiplayer)) {
				continue;
			}
			if (emitted > 0) {
				json += ",";
			}
			json += "{\"key\":\"" + json_escape(it->first.str()) + "\"";
			json += ",\"players\":" + std::to_string(static_cast<long long>(it->second.m_numPlayers));
			json += ",\"fileSize\":" + std::to_string(static_cast<unsigned long long>(it->second.m_filesize));
			json += ",\"crc\":" + std::to_string(static_cast<unsigned long long>(it->second.m_CRC));
			json += "}";
			++emitted;
		}
		json += "]";
		append_game_info_json(json, "skirmishGameInfo", TheSkirmishGameInfo);
		append_game_info_json(json, "gameInfo", TheGameInfo);
		append_map_preview_diagnostic_json(json, "mapPreviewDiagnostic");
		json += ",\"cpuDetectSpeedMHz\":" + std::to_string(static_cast<long long>(CPUDetectClass::Get_Processor_Speed()));
		json += ",\"cpuDetectRamBytes\":"
			+ std::to_string(static_cast<unsigned long long>(CPUDetectClass::Get_Total_Physical_Memory()));
		if (TheGameLODManager != NULL) {
			json += ",\"lodMemPassed\":";
			json += TheGameLODManager->didMemPass() ? "true" : "false";
			json += ",\"lodReallyLowMHz\":";
			json += TheGameLODManager->isReallyLowMHz() ? "true" : "false";
			json += ",\"staticLODLevel\":"
				+ std::to_string(static_cast<long long>(TheGameLODManager->getStaticLODLevel()));
		}
		json += ",\"sampleKeys\":[";
		emitted = 0;
		for (MapCache::const_iterator it = TheMapCache->begin();
				it != TheMapCache->end() && emitted < 8; ++it, ++emitted) {
			if (emitted > 0) {
				json += ",";
			}
			json += "\"" + json_escape(it->first.str()) + "\"";
		}
		json += "]";
		json += ",\"sampleMaps\":[";
		emitted = 0;
		for (MapCache::const_iterator it = TheMapCache->begin();
				it != TheMapCache->end() && emitted < 8; ++it, ++emitted) {
			if (emitted > 0) {
				json += ",";
			}
			json += "{\"key\":\"" + json_escape(it->first.str()) + "\"";
			json += ",\"official\":";
			json += it->second.m_isOfficial ? "true" : "false";
			json += ",\"multiplayer\":";
			json += it->second.m_isMultiplayer ? "true" : "false";
			json += ",\"players\":" + std::to_string(static_cast<long long>(it->second.m_numPlayers));
			json += "}";
		}
		json += "]";
	}
	json += "}";
	return json.c_str();
}

namespace {

void append_lan_runtime_json(std::string &json)
{
	json += "\"lanReady\":";
	json += TheLAN != NULL ? "true" : "false";
	if (TheLAN != NULL) {
		json += ",\"localIp\":"
			+ std::to_string(static_cast<unsigned long long>(TheLAN->GetLocalIP()));
		json += ",\"localName\":\""
			+ json_escape(unicode_to_debug_ascii(TheLAN->GetMyName())) + "\"";
		json += ",\"host\":";
		json += TheLAN->AmIHost() ? "true" : "false";
		int discovered_games = 0;
		while (discovered_games < 64
			&& TheLAN->LookupGameByListOffset(discovered_games) != NULL) {
			++discovered_games;
		}
		json += ",\"discoveredGames\":" + std::to_string(discovered_games);
		LANGameInfo *game = TheLAN->GetMyGame();
		if (game != NULL) {
			json += ",\"gameName\":\""
				+ json_escape(unicode_to_debug_ascii(game->getName())) + "\"";
		}
		append_game_info_json(json, "game", game);
	} else {
		json += ",\"localIp\":0,\"localName\":\"\",\"host\":false,\"discoveredGames\":0";
		append_game_info_json(json, "game", NULL);
	}
	json += ",\"network\":{";
	json += "\"ready\":";
	json += TheNetwork != NULL ? "true" : "false";
	if (TheNetwork != NULL) {
		json += ",\"localPlayerId\":"
			+ std::to_string(static_cast<unsigned long long>(TheNetwork->getLocalPlayerID()));
		json += ",\"numPlayers\":" + std::to_string(TheNetwork->getNumPlayers());
		json += ",\"executionFrame\":" + std::to_string(TheNetwork->getExecutionFrame());
		json += ",\"frameDataReady\":";
		json += TheNetwork->isFrameDataReady() ? "true" : "false";
		json += ",\"runAhead\":"
			+ std::to_string(static_cast<unsigned long long>(TheNetwork->getRunAhead()));
		json += ",\"frameRate\":"
			+ std::to_string(static_cast<unsigned long long>(TheNetwork->getFrameRate()));
		json += ",\"logicFrame\":"
			+ std::to_string(TheGameLogic != NULL ? TheGameLogic->getFrame() : -1);
		json += ",\"crcMismatch\":";
		json += TheNetwork->sawCRCMismatch() ? "true" : "false";
		json += ",\"packetRouter\":";
		json += TheNetwork->isPacketRouter() ? "true" : "false";
		json += ",\"averageFps\":" + std::to_string(TheNetwork->getAverageFPS());
		json += ",\"averageLatencySeconds\":"
			+ std::to_string(TheNetwork->getBrowserDiagnosticAverageLatency());
		json += ",\"minimumCushion\":"
			+ std::to_string(TheNetwork->getBrowserDiagnosticMinimumCushion());
		json += ",\"incomingBytesPerSecond\":"
			+ std::to_string(TheNetwork->getIncomingBytesPerSecond());
		json += ",\"incomingPacketsPerSecond\":"
			+ std::to_string(TheNetwork->getIncomingPacketsPerSecond());
		json += ",\"outgoingBytesPerSecond\":"
			+ std::to_string(TheNetwork->getOutgoingBytesPerSecond());
		json += ",\"outgoingPacketsPerSecond\":"
			+ std::to_string(TheNetwork->getOutgoingPacketsPerSecond());
		json += ",\"queues\":{";
		json += "\"pendingCommands\":"
			+ std::to_string(TheNetwork->getBrowserDiagnosticPendingCommands());
		json += ",\"relayedCommands\":"
			+ std::to_string(TheNetwork->getBrowserDiagnosticRelayedCommands());
		json += ",\"transportIncoming\":"
			+ std::to_string(TheNetwork->getBrowserDiagnosticTransportIncoming());
		json += ",\"transportOutgoing\":"
			+ std::to_string(TheNetwork->getBrowserDiagnosticTransportOutgoing());
		json += "}";
		json += ",\"slots\":[";
		for (Int slot = 0; slot < MAX_SLOTS; ++slot) {
			if (slot > 0) {
				json += ",";
			}
			json += "{\"slot\":" + std::to_string(slot);
			json += ",\"frameGroupingMs\":"
				+ std::to_string(TheNetwork->getBrowserDiagnosticFrameGrouping(slot));
			json += ",\"connectionQueue\":"
				+ std::to_string(TheNetwork->getBrowserDiagnosticConnectionQueue(slot));
			json += ",\"frameCommands\":"
				+ std::to_string(TheNetwork->getBrowserDiagnosticFrameCommands(
					slot, static_cast<UnsignedInt>(TheNetwork->getExecutionFrame())));
			json += ",\"expectedFrameCommands\":"
				+ std::to_string(TheNetwork->getBrowserDiagnosticExpectedFrameCommands(
					slot, static_cast<UnsignedInt>(TheNetwork->getExecutionFrame())));
			json += "}";
		}
		json += "]";
	}
	json += "}";
}

}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_lan_state()
{
	static std::string json;
	json = "{";
	append_lan_runtime_json(json);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_set_network_timeouts(
	unsigned int disconnect_ms,
	unsigned int player_timeout_ms)
{
	static std::string json;
	if (TheWritableGlobalData == NULL) {
		return "{\"ok\":false,\"error\":\"globalDataNotReady\"}";
	}
	TheWritableGlobalData->m_networkDisconnectTime = disconnect_ms;
	TheWritableGlobalData->m_networkPlayerTimeoutTime = player_timeout_ms;
	json = "{\"ok\":true,\"disconnectMs\":" + std::to_string(disconnect_ms);
	json += ",\"playerTimeoutMs\":" + std::to_string(player_timeout_ms) + "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_lan_command(
	const char *command,
	const char *value)
{
	static std::string json;
	const std::string requested = command != NULL ? command : "";
	const char *argument = value != NULL ? value : "";
	bool applied = false;
	std::string error;

	if (TheLAN == NULL) {
		error = "lanNotReady";
	} else if (requested == "update") {
		TheLAN->update();
		applied = true;
	} else if (requested == "setName") {
		UnicodeString name;
		name.translate(AsciiString(argument));
		TheLAN->RequestSetName(name);
		applied = true;
	} else if (requested == "host") {
		UnicodeString game_name;
		game_name.translate(AsciiString(argument));
		TheLAN->RequestGameCreate(game_name, FALSE);
		applied = TheLAN->GetMyGame() != NULL && TheLAN->AmIHost();
	} else if (requested == "joinFirst") {
		LANGameInfo *game = TheLAN->LookupGameByListOffset(0);
		if (game == NULL) {
			error = "noDiscoveredGame";
		} else {
			TheLAN->RequestGameJoin(game);
			applied = true;
		}
	} else if (requested == "setMap") {
		LANGameInfo *game = TheLAN->GetMyGame();
		AsciiString lookup(argument);
		lookup.toLower();
		const MapMetaData *metadata = TheMapCache != NULL ? TheMapCache->findMap(lookup) : NULL;
		if (game == NULL || !TheLAN->AmIHost()) {
			error = "hostGameNotReady";
		} else if (metadata == NULL || !metadata->m_isMultiplayer) {
			error = "multiplayerMapNotFound";
		} else {
			game->setMap(lookup);
			game->setMapCRC(metadata->m_CRC);
			game->setMapSize(metadata->m_filesize);
			game->adjustSlotsForMap();
			TheLAN->RequestGameOptions(GenerateGameOptionsString(), TRUE);
			TheLAN->RequestHasMap();
			TheLAN->RequestGameAnnounce();
			applied = true;
		}
	} else if (requested == "ready") {
		TheLAN->RequestAccept();
		applied = TheLAN->GetMyGame() != NULL;
	} else if (requested == "start") {
		TheLAN->RequestGameStart();
		applied = TheNetwork != NULL;
	} else {
		error = "unknownCommand";
	}

	json = "{\"ok\":";
	json += applied ? "true" : "false";
	json += ",\"command\":\"" + json_escape(requested) + "\"";
	json += ",\"value\":\"" + json_escape(argument) + "\"";
	if (!error.empty()) {
		json += ",\"error\":\"" + json_escape(error) + "\"";
	}
	json += ",\"state\":{";
	append_lan_runtime_json(json);
	json += "}}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_set_skirmish_map(const char *map_name)
{
	static std::string json;
	const char *raw_map_name = map_name != NULL ? map_name : "";
	AsciiString requested(raw_map_name);
	AsciiString lookup = requested;
	lookup.toLower();

	json = "{";
	json += "\"ok\":false";
	json += ",\"requested\":\"" + json_escape(requested.str()) + "\"";

	if (TheMapCache == NULL) {
		json += ",\"error\":\"mapCacheNotReady\"";
		json += "}";
		return json.c_str();
	}
	if (TheSkirmishGameInfo == NULL) {
		json += ",\"error\":\"skirmishGameInfoNotReady\"";
		json += "}";
		return json.c_str();
	}

	MapCache::const_iterator it = TheMapCache->find(lookup);
	if (it == TheMapCache->end()) {
		json += ",\"error\":\"mapNotFound\"";
		json += ",\"lookup\":\"" + json_escape(lookup.str()) + "\"";
		json += "}";
		return json.c_str();
	}
	if (!it->second.m_isMultiplayer) {
		json += ",\"error\":\"mapIsNotMultiplayer\"";
		json += ",\"lookup\":\"" + json_escape(it->first.str()) + "\"";
		append_map_metadata_json(json, "metadata", &it->second);
		json += "}";
		return json.c_str();
	}

	TheSkirmishGameInfo->setMap(it->first);
	TheSkirmishGameInfo->setMapCRC(it->second.m_CRC);
	TheSkirmishGameInfo->setMapSize(it->second.m_filesize);

	json = "{";
	json += "\"ok\":true";
	json += ",\"requested\":\"" + json_escape(requested.str()) + "\"";
	json += ",\"applied\":\"" + json_escape(it->first.str()) + "\"";
	append_map_metadata_json(json, "metadata", &it->second);
	append_game_info_json(json, "skirmishGameInfo", TheSkirmishGameInfo);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_set_skirmish_local_template(const char *template_name)
{
	static std::string json;
	const char *raw_template_name = template_name != NULL ? template_name : "";
	AsciiString requested(raw_template_name);

	json = "{";
	json += "\"ok\":false";
	json += ",\"requested\":\"" + json_escape(requested.str()) + "\"";

	if (TheSkirmishGameInfo == NULL) {
		json += ",\"error\":\"skirmishGameInfoNotReady\"";
		json += "}";
		return json.c_str();
	}
	if (ThePlayerTemplateStore == NULL) {
		json += ",\"error\":\"playerTemplateStoreNotReady\"";
		json += "}";
		return json.c_str();
	}

	Int template_index = -1;
	const PlayerTemplate *player_template = find_player_template_by_name(raw_template_name, &template_index);
	if (player_template == NULL) {
		json += ",\"error\":\"templateNotFound\"";
		json += ",\"availableTemplates\":[";
		const Int template_count = ThePlayerTemplateStore->getPlayerTemplateCount();
		const Int emit_count = template_count < 32 ? template_count : 32;
		for (Int i = 0; i < emit_count; ++i) {
			if (i > 0) {
				json += ",";
			}
			const PlayerTemplate *candidate = ThePlayerTemplateStore->getNthPlayerTemplate(i);
			json += candidate != NULL
				? "\"" + json_escape(candidate->getName().str()) + "\""
				: "\"\"";
		}
		json += "]";
		json += ",\"availableTemplateCount\":" + std::to_string(static_cast<long long>(template_count));
		json += "}";
		return json.c_str();
	}

	const Int local_slot = TheSkirmishGameInfo->isInGame() ? TheSkirmishGameInfo->getLocalSlotNum() : -1;
	const Int target_slot = local_slot >= 0 ? local_slot : 0;
	GameSlot *slot = TheSkirmishGameInfo->getSlot(target_slot);
	if (slot == NULL) {
		json += ",\"error\":\"localSlotNotFound\"";
		json += ",\"localSlot\":" + std::to_string(static_cast<long long>(local_slot));
		json += ",\"targetSlot\":" + std::to_string(static_cast<long long>(target_slot));
		json += "}";
		return json.c_str();
	}

	slot->setPlayerTemplate(template_index);
	slot->setAccept();

	json = "{";
	json += "\"ok\":true";
	json += ",\"requested\":\"" + json_escape(requested.str()) + "\"";
	json += ",\"applied\":\"" + json_escape(player_template->getName().str()) + "\"";
	json += ",\"localSlot\":" + std::to_string(static_cast<long long>(local_slot));
	json += ",\"targetSlot\":" + std::to_string(static_cast<long long>(target_slot));
	append_player_template_json(json, "appliedTemplate", template_index);
	append_game_slot_json(json, "slot", TheSkirmishGameInfo, target_slot);
	append_game_info_json(json, "skirmishGameInfo", TheSkirmishGameInfo);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_frontier()
{
	return build_state_json();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_init(const char *run_directory, int use_shell_map)
{
	if (g_state.attempted) {
		return build_state_json();
	}
	g_state.attempted = true;
	g_use_shell_map = use_shell_map != 0;
	reset_script_diag_trace();

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
	cnc_port_terrain_probe_set_shroud_enabled(true);

	static const char *argv_storage[] = {"CnCGeneralsZH", "-noshellmap", "-win"};
	static const char *argv_shellmap_storage[] = {"CnCGeneralsZH", "-win"};
	const int argc = g_use_shell_map ? 2 : 3;
	char **argv = const_cast<char **>(g_use_shell_map ? argv_shellmap_storage : argv_storage);

	std::printf("cnc-port: real-init begin dir=%s argv=%s\n",
		g_state.run_directory.c_str(),
		g_use_shell_map ? "-win" : "-noshellmap -win");
	std::fflush(stdout);

	const double started_at = emscripten_get_now();
	try {
		TheGameEngine = CreateGameEngine();
		// browser tab has focus; WinMain mirrors focus state into the engine.
		TheGameEngine->setIsActive(TRUE);
		TheGameEngine->init(argc, argv);
		wasm_function_lexicon_repair_gameplay_callback_owners();
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

// ---------------------------------------------------------------------------
// Stepped GameEngine::init: the same preamble as cnc_port_real_engine_init,
// but the init body (now an ordered step sequence inside the engine — see
// GameEngine.cpp runNextInitStep) is driven by cnc_port_real_engine_init_step
// calls from the page. Each step call returns to the browser event loop so
// boot progress can paint and the main thread never blocks for the whole
// 10-30s init. The monolithic cnc_port_real_engine_init stays for existing
// harness callers (GameEngine::init drains the same steps in one call).
// ---------------------------------------------------------------------------
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_init_begin(const char *run_directory, int use_shell_map)
{
	if (g_state.attempted) {
		return build_state_json();
	}
	g_state.attempted = true;
	g_use_shell_map = use_shell_map != 0;
	reset_script_diag_trace();

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
	cnc_port_terrain_probe_set_shroud_enabled(true);

	static const char *argv_storage[] = {"CnCGeneralsZH", "-noshellmap", "-win"};
	static const char *argv_shellmap_storage[] = {"CnCGeneralsZH", "-win"};
	const int argc = g_use_shell_map ? 2 : 3;
	char **argv = const_cast<char **>(g_use_shell_map ? argv_shellmap_storage : argv_storage);

	std::printf("cnc-port: real-init-begin (stepped) dir=%s argv=%s\n",
		g_state.run_directory.c_str(),
		g_use_shell_map ? "-win" : "-noshellmap -win");
	std::fflush(stdout);

	static std::string json;
	try {
		TheGameEngine = CreateGameEngine();
		// browser tab has focus; WinMain mirrors focus state into the engine.
		TheGameEngine->setIsActive(TRUE);
		TheGameEngine->beginInitSession(argc, argv);
	} catch (const char *message) {
		g_state.exception_caught = true;
		g_state.exception_text = message != nullptr ? message : "(const char* exception)";
	} catch (...) {
		g_state.exception_caught = true;
		g_state.exception_text = "unhandled C++ exception escaping beginInitSession";
	}

	json = "{\"ok\":";
	json += (!g_state.exception_caught && TheGameEngine != NULL) ? "true" : "false";
	json += ",\"stepped\":true";
	json += ",\"stepCount\":" + std::to_string(
		TheGameEngine != NULL ? (long long)TheGameEngine->getInitStepCount() : -1);
	json += ",\"exception\":\"" + json_escape(g_state.exception_text) + "\"";
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_init_step(double budget_ms)
{
	static std::string json;
	if (TheGameEngine == NULL || !g_state.attempted) {
		json = "{\"ok\":false,\"error\":\"init_begin has not run\"}";
		return json.c_str();
	}

	bool more = TheGameEngine->isInitSessionActive();
	const double started_at = emscripten_get_now();
	try {
		while (more) {
			more = TheGameEngine->runNextInitStep() != FALSE;
			if (more && budget_ms > 0.0
				&& (emscripten_get_now() - started_at) >= budget_ms) {
				break;
			}
		}
	} catch (const char *message) {
		g_state.exception_caught = true;
		g_state.exception_text = message != nullptr ? message : "(const char* exception)";
		more = false;
	} catch (...) {
		g_state.exception_caught = true;
		g_state.exception_text = "unhandled C++ exception escaping runNextInitStep";
		more = false;
	}
	g_state.elapsed_ms += emscripten_get_now() - started_at;

	if (!more && !g_state.init_returned && !g_state.exception_caught) {
		// same completion bookkeeping as the monolithic cnc_port_real_engine_init
		wasm_function_lexicon_repair_gameplay_callback_owners();
		g_state.init_returned = true;
		g_state.quitting_after_init = TheGameEngine->getQuitting() != FALSE;
		std::printf("cnc-port: real-init end (stepped) quitting=%d completed=%zu\n",
			g_state.quitting_after_init ? 1 : 0,
			g_state.completed.size());
		std::fflush(stdout);
	}

	json = "{\"ok\":";
	json += g_state.exception_caught ? "false" : "true";
	json += ",\"done\":";
	json += more ? "false" : "true";
	json += ",\"stepIndex\":" + std::to_string((long long)TheGameEngine->getInitStepIndex());
	json += ",\"stepCount\":" + std::to_string((long long)TheGameEngine->getInitStepCount());
	json += ",\"subsystemsCompleted\":" + std::to_string((long long)g_state.completed.size());
	json += ",\"inFlight\":\"" + json_escape(g_state.in_flight) + "\"";
	json += ",\"quitting\":";
	json += (TheGameEngine->getQuitting() != FALSE) ? "true" : "false";
	json += ",\"exception\":\"" + json_escape(g_state.exception_text) + "\"";
	char elapsed[64];
	std::snprintf(elapsed, sizeof(elapsed), ",\"elapsedMs\":%.1f", g_state.elapsed_ms);
	json += elapsed;
	json += "}";
	return json.c_str();
}

// Mirror GameMain's normal exit ownership. The browser frame scheduler stops
// before calling this export, so no update can race subsystem destruction.
// The surrounding wasm document is intentionally not reusable after this:
// OffscreenCanvas and the pthread worker are one-shot browser resources.
extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_real_engine_shutdown()
{
	static std::string json;
	if (TheGameEngine == NULL) {
		json = "{\"ok\":true,\"alreadyStopped\":true}";
		return json.c_str();
	}

	try {
		TheGameEngine->setQuitting(TRUE);
		delete TheGameEngine;
		TheGameEngine = NULL;
		json = "{\"ok\":true,\"alreadyStopped\":false}";
	} catch (const char *message) {
		json = "{\"ok\":false,\"error\":\"";
		json += json_escape(message != NULL ? message : "shutdown failed");
		json += "\"}";
	} catch (...) {
		json = "{\"ok\":false,\"error\":\"unhandled C++ exception during GameEngine shutdown\"}";
	}
	return json.c_str();
}
