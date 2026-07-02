#ifndef WASM_FUNCTION_LEXICON_RUNTIME_H
#define WASM_FUNCTION_LEXICON_RUNTIME_H

#include <string>

// Boot-time runtime ownership for GameEngine.cpp line 446:
//   initSubsystem(TheFunctionLexicon, "TheFunctionLexicon",
//     createFunctionLexicon(), NULL)
//
// This constructs the original W3DFunctionLexicon in the linked cnc-port
// runtime, assigns TheFunctionLexicon, runs W3DFunctionLexicon::init(), and
// captures representative callback-name lookups from the base and W3D device
// tables. Full ownership remains false until the base FunctionLexicon callback
// graph is owned by cnc-port instead of the render probe.
struct FunctionLexiconRuntimeProbeResult
{
	bool attempted = false;
	bool ok = false;
	const char *source =
		"GameEngine.cpp line 446 createFunctionLexicon -> W3DFunctionLexicon::init";
	const char *status = "not_attempted";
	const char *next_required = "runtimeArchiveSet";

	// preconditions observed at boot
	bool runtime_archive_registered = false;
	bool startup_singletons_ready = false;
	bool audio_manager_ready = false;
	bool memory_manager_ready = false;
	bool name_key_generator_ready = false;
	bool the_function_lexicon_was_null = false;
	bool the_function_lexicon_was_owned = false;

	// createFunctionLexicon() ownership
	bool constructed = false;
	bool the_function_lexicon_owned = false;
	bool init_ran = false;
	bool init_threw = false;
	std::string init_error;

	// W3DFunctionLexicon::init() table residency
	bool game_window_system_table_loaded = false;
	bool game_window_input_table_loaded = false;
	bool game_window_tooltip_table_loaded = false;
	bool game_window_draw_table_loaded = false;
	bool game_window_device_draw_table_loaded = false;
	bool window_layout_init_table_loaded = false;
	bool window_layout_device_init_table_loaded = false;
	bool window_layout_update_table_loaded = false;
	bool window_layout_shutdown_table_loaded = false;

	// Representative callback-name lookups from the original tables.
	bool pass_messages_to_parent_lookup = false;
	bool pass_selected_buttons_to_parent_lookup = false;
	bool game_window_default_system_lookup = false;
	bool gadget_push_button_system_lookup = false;
	bool gadget_check_box_system_lookup = false;
	bool gadget_radio_button_system_lookup = false;
	bool gadget_tab_control_system_lookup = false;
	bool gadget_list_box_system_lookup = false;
	bool gadget_combo_box_system_lookup = false;
	bool gadget_horizontal_slider_system_lookup = false;
	bool gadget_vertical_slider_system_lookup = false;
	bool gadget_progress_bar_system_lookup = false;
	bool gadget_static_text_system_lookup = false;
	bool gadget_text_entry_system_lookup = false;
	bool message_box_system_lookup = false;
	bool quit_message_box_system_lookup = false;
	bool extended_message_box_system_lookup = false;
	bool ime_candidate_window_system_lookup = false;
	bool main_menu_system_lookup = false;
	bool options_menu_system_lookup = false;
	bool credits_menu_system_lookup = false;
	bool skirmish_game_options_menu_system_lookup = false;
	bool single_player_menu_system_lookup = false;
	bool challenge_menu_system_lookup = false;
	bool popup_communicator_system_lookup = false;
	bool map_select_menu_system_lookup = false;
	bool replay_menu_system_lookup = false;
	bool difficulty_select_system_lookup = false;
	bool keyboard_options_menu_system_lookup = false;
	bool in_game_popup_message_system_lookup = false;
	bool idle_worker_system_lookup = false;
	bool replay_control_system_lookup = false;
	bool game_info_window_system_lookup = false;
	bool game_window_default_input_lookup = false;
	bool gadget_push_button_input_lookup = false;
	bool gadget_check_box_input_lookup = false;
	bool gadget_radio_button_input_lookup = false;
	bool gadget_tab_control_input_lookup = false;
	bool gadget_list_box_input_lookup = false;
	bool gadget_list_box_multi_input_lookup = false;
	bool gadget_combo_box_input_lookup = false;
	bool gadget_horizontal_slider_input_lookup = false;
	bool gadget_vertical_slider_input_lookup = false;
	bool gadget_static_text_input_lookup = false;
	bool gadget_text_entry_input_lookup = false;
	bool ime_candidate_window_input_lookup = false;
	bool main_menu_input_lookup = false;
	bool options_menu_input_lookup = false;
	bool credits_menu_input_lookup = false;
	bool skirmish_game_options_menu_input_lookup = false;
	bool single_player_menu_input_lookup = false;
	bool challenge_menu_input_lookup = false;
	bool popup_communicator_input_lookup = false;
	bool map_select_menu_input_lookup = false;
	bool replay_menu_input_lookup = false;
	bool popup_replay_input_lookup = false;
	bool difficulty_select_input_lookup = false;
	bool keyboard_options_menu_input_lookup = false;
	bool in_game_popup_message_input_lookup = false;
	bool control_bar_input_lookup = false;
	bool beacon_window_input_lookup = false;
	bool replay_control_input_lookup = false;
	bool game_window_default_tooltip_lookup = false;
	bool ime_candidate_main_draw_lookup = false;
	bool ime_candidate_text_area_draw_lookup = false;
	bool main_menu_init_lookup = false;
	bool options_menu_init_lookup = false;
	bool credits_menu_init_lookup = false;
	bool skirmish_game_options_menu_init_lookup = false;
	bool single_player_menu_init_lookup = false;
	bool challenge_menu_init_lookup = false;
	bool popup_communicator_init_lookup = false;
	bool map_select_menu_init_lookup = false;
	bool replay_menu_init_lookup = false;
	bool popup_replay_init_lookup = false;
	bool difficulty_select_init_lookup = false;
	bool keyboard_options_menu_init_lookup = false;
	bool in_game_popup_message_init_lookup = false;
	bool main_menu_update_lookup = false;
	bool options_menu_update_lookup = false;
	bool credits_menu_update_lookup = false;
	bool skirmish_game_options_menu_update_lookup = false;
	bool single_player_menu_update_lookup = false;
	bool challenge_menu_update_lookup = false;
	bool map_select_menu_update_lookup = false;
	bool replay_menu_update_lookup = false;
	bool keyboard_options_menu_update_lookup = false;
	bool main_menu_shutdown_lookup = false;
	bool options_menu_shutdown_lookup = false;
	bool credits_menu_shutdown_lookup = false;
	bool skirmish_game_options_menu_shutdown_lookup = false;
	bool single_player_menu_shutdown_lookup = false;
	bool challenge_menu_shutdown_lookup = false;
	bool popup_communicator_shutdown_lookup = false;
	bool map_select_menu_shutdown_lookup = false;
	bool replay_menu_shutdown_lookup = false;
	bool keyboard_options_menu_shutdown_lookup = false;
	bool popup_replay_shutdown_lookup = false;
	bool w3d_gadget_push_button_draw_lookup = false;
	bool w3d_game_window_default_draw_lookup = false;
	bool w3d_main_menu_init_lookup = false;
};

const FunctionLexiconRuntimeProbeResult &wasm_function_lexicon_runtime_install(
	bool runtime_archive_registered,
	bool audio_manager_ready);
const FunctionLexiconRuntimeProbeResult &wasm_function_lexicon_runtime_state();
const char *wasm_function_lexicon_runtime_state_json();

#endif // WASM_FUNCTION_LEXICON_RUNTIME_H
