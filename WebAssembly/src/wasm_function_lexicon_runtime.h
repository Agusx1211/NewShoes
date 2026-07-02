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
	bool game_window_default_system_lookup = false;
	bool gadget_push_button_system_lookup = false;
	bool message_box_system_lookup = false;
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
