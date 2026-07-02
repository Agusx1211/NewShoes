#include "wasm_function_lexicon_runtime.h"

#include "PreRTS.h"

#include "wasm_startup_singletons_probe.h"

#include "Common/Errors.h"
#include "Common/FunctionLexicon.h"
#include "Common/GameMemory.h"
#include "Common/NameKeyGenerator.h"
#include "GameClient/Gadget.h"
#include "GameClient/GUICallbacks.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "W3DDevice/Common/W3DFunctionLexicon.h"
#include "W3DDevice/GameClient/W3DGadget.h"
#include "W3DDevice/GameClient/W3DGUICallbacks.h"
#include "W3DDevice/GameClient/W3DGameWindow.h"

#include <cstdio>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

extern void PopupReplayShutdown(WindowLayout *layout, void *userData);

namespace {

FunctionLexiconRuntimeProbeResult g_function_lexicon_state;
W3DFunctionLexicon *g_function_lexicon = nullptr;
bool g_function_lexicon_init_ran = false;

const char *json_bool(bool value)
{
	return value ? "true" : "false";
}

std::string json_escape(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size());
	for (char ch : value) {
		switch (ch) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			case '\n':
				escaped += "\\n";
				break;
			case '\r':
				escaped += "\\r";
				break;
			case '\t':
				escaped += "\\t";
				break;
			default:
				escaped += ch;
				break;
		}
	}
	return escaped;
}

NameKeyType key_for(const char *name)
{
	if (TheNameKeyGenerator == nullptr || name == nullptr) {
		return NAMEKEY_INVALID;
	}
	return TheNameKeyGenerator->nameToKey(name);
}

bool table_loaded(FunctionLexicon::TableIndex index)
{
	return TheFunctionLexicon != nullptr &&
		TheFunctionLexicon->getTable(index) != nullptr &&
		TheFunctionLexicon->getTable(index)->key != NAMEKEY_INVALID;
}

void capture_table_state(FunctionLexiconRuntimeProbeResult &result)
{
	result.game_window_system_table_loaded =
		table_loaded(FunctionLexicon::TABLE_GAME_WIN_SYSTEM);
	result.game_window_input_table_loaded =
		table_loaded(FunctionLexicon::TABLE_GAME_WIN_INPUT);
	result.game_window_tooltip_table_loaded =
		table_loaded(FunctionLexicon::TABLE_GAME_WIN_TOOLTIP);
	result.game_window_draw_table_loaded =
		table_loaded(FunctionLexicon::TABLE_GAME_WIN_DRAW);
	result.game_window_device_draw_table_loaded =
		table_loaded(FunctionLexicon::TABLE_GAME_WIN_DEVICEDRAW);
	result.window_layout_init_table_loaded =
		table_loaded(FunctionLexicon::TABLE_WIN_LAYOUT_INIT);
	result.window_layout_device_init_table_loaded =
		table_loaded(FunctionLexicon::TABLE_WIN_LAYOUT_DEVICEINIT);
	result.window_layout_update_table_loaded =
		table_loaded(FunctionLexicon::TABLE_WIN_LAYOUT_UPDATE);
	result.window_layout_shutdown_table_loaded =
		table_loaded(FunctionLexicon::TABLE_WIN_LAYOUT_SHUTDOWN);
}

void capture_lookup_state(FunctionLexiconRuntimeProbeResult &result)
{
	if (TheFunctionLexicon == nullptr || TheNameKeyGenerator == nullptr) {
		return;
	}

	result.pass_messages_to_parent_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("PassMessagesToParentSystem")) == PassMessagesToParentSystem;
	result.pass_selected_buttons_to_parent_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("PassSelectedButtonsToParentSystem")) ==
				PassSelectedButtonsToParentSystem;
	result.game_window_default_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GameWinDefaultSystem")) == GameWinDefaultSystem;
	result.gadget_push_button_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetPushButtonSystem")) == GadgetPushButtonSystem;
	result.gadget_check_box_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetCheckBoxSystem")) == GadgetCheckBoxSystem;
	result.gadget_radio_button_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetRadioButtonSystem")) == GadgetRadioButtonSystem;
	result.gadget_tab_control_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetTabControlSystem")) == GadgetTabControlSystem;
	result.gadget_list_box_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetListBoxSystem")) == GadgetListBoxSystem;
	result.gadget_combo_box_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetComboBoxSystem")) == GadgetComboBoxSystem;
	result.gadget_horizontal_slider_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetHorizontalSliderSystem")) ==
				GadgetHorizontalSliderSystem;
	result.gadget_vertical_slider_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetVerticalSliderSystem")) ==
				GadgetVerticalSliderSystem;
	result.gadget_progress_bar_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetProgressBarSystem")) == GadgetProgressBarSystem;
	result.gadget_static_text_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetStaticTextSystem")) == GadgetStaticTextSystem;
	result.gadget_text_entry_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GadgetTextEntrySystem")) == GadgetTextEntrySystem;
	result.message_box_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("MessageBoxSystem")) == MessageBoxSystem;
	result.quit_message_box_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("QuitMessageBoxSystem")) == QuitMessageBoxSystem;
	result.ime_candidate_window_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("IMECandidateWindowSystem")) == IMECandidateWindowSystem;
	result.main_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("MainMenuSystem")) == MainMenuSystem;
	result.credits_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("CreditsMenuSystem")) == CreditsMenuSystem;
	result.skirmish_game_options_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("SkirmishGameOptionsMenuSystem")) ==
				SkirmishGameOptionsMenuSystem;
	result.single_player_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("SinglePlayerMenuSystem")) == SinglePlayerMenuSystem;
	result.game_window_default_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GameWinDefaultInput")) == GameWinDefaultInput;
	result.gadget_push_button_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetPushButtonInput")) == GadgetPushButtonInput;
	result.gadget_check_box_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetCheckBoxInput")) == GadgetCheckBoxInput;
	result.gadget_radio_button_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetRadioButtonInput")) == GadgetRadioButtonInput;
	result.gadget_tab_control_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetTabControlInput")) == GadgetTabControlInput;
	result.gadget_list_box_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetListBoxInput")) == GadgetListBoxInput;
	result.gadget_list_box_multi_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetListBoxMultiInput")) == GadgetListBoxMultiInput;
	result.gadget_combo_box_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetComboBoxInput")) == GadgetComboBoxInput;
	result.gadget_horizontal_slider_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetHorizontalSliderInput")) ==
				GadgetHorizontalSliderInput;
	result.gadget_vertical_slider_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetVerticalSliderInput")) == GadgetVerticalSliderInput;
	result.gadget_static_text_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetStaticTextInput")) == GadgetStaticTextInput;
	result.gadget_text_entry_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GadgetTextEntryInput")) == GadgetTextEntryInput;
	result.ime_candidate_window_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("IMECandidateWindowInput")) == IMECandidateWindowInput;
	result.main_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("MainMenuInput")) == MainMenuInput;
	result.credits_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("CreditsMenuInput")) == CreditsMenuInput;
	result.skirmish_game_options_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("SkirmishGameOptionsMenuInput")) ==
				SkirmishGameOptionsMenuInput;
	result.single_player_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("SinglePlayerMenuInput")) == SinglePlayerMenuInput;
	result.game_window_default_tooltip_lookup =
		TheFunctionLexicon->gameWinTooltipFunc(
			key_for("GameWinDefaultTooltip")) == GameWinDefaultTooltip;
	result.ime_candidate_main_draw_lookup =
		TheFunctionLexicon->gameWinDrawFunc(
			key_for("IMECandidateMainDraw")) == IMECandidateMainDraw;
	result.ime_candidate_text_area_draw_lookup =
		TheFunctionLexicon->gameWinDrawFunc(
			key_for("IMECandidateTextAreaDraw")) == IMECandidateTextAreaDraw;
	result.main_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("MainMenuInit")) == MainMenuInit;
	result.credits_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("CreditsMenuInit")) == CreditsMenuInit;
	result.skirmish_game_options_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("SkirmishGameOptionsMenuInit")) ==
				SkirmishGameOptionsMenuInit;
	result.single_player_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("SinglePlayerMenuInit")) == SinglePlayerMenuInit;
	result.difficulty_select_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("DifficultySelectInit")) == DifficultySelectInit;
	result.main_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("MainMenuUpdate")) == MainMenuUpdate;
	result.credits_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("CreditsMenuUpdate")) == CreditsMenuUpdate;
	result.skirmish_game_options_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("SkirmishGameOptionsMenuUpdate")) ==
				SkirmishGameOptionsMenuUpdate;
	result.single_player_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("SinglePlayerMenuUpdate")) == SinglePlayerMenuUpdate;
	result.keyboard_options_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("KeyboardOptionsMenuUpdate")) == KeyboardOptionsMenuUpdate;
	result.main_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("MainMenuShutdown")) == MainMenuShutdown;
	result.credits_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("CreditsMenuShutdown")) == CreditsMenuShutdown;
	result.skirmish_game_options_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("SkirmishGameOptionsMenuShutdown")) ==
				SkirmishGameOptionsMenuShutdown;
	result.single_player_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("SinglePlayerMenuShutdown")) == SinglePlayerMenuShutdown;
	result.popup_replay_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("PopupReplayShutdown")) == PopupReplayShutdown;
	result.w3d_gadget_push_button_draw_lookup =
		TheFunctionLexicon->gameWinDrawFunc(
			key_for("W3DGadgetPushButtonDraw")) == W3DGadgetPushButtonDraw;
	result.w3d_game_window_default_draw_lookup =
		TheFunctionLexicon->gameWinDrawFunc(
			key_for("W3DGameWinDefaultDraw")) == W3DGameWinDefaultDraw;
	result.w3d_main_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("W3DMainMenuInit")) == W3DMainMenuInit;
}

bool table_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.game_window_system_table_loaded &&
		result.game_window_input_table_loaded &&
		result.game_window_tooltip_table_loaded &&
		result.game_window_draw_table_loaded &&
		result.game_window_device_draw_table_loaded &&
		result.window_layout_init_table_loaded &&
		result.window_layout_device_init_table_loaded &&
		result.window_layout_update_table_loaded &&
		result.window_layout_shutdown_table_loaded;
}

bool device_table_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.game_window_device_draw_table_loaded &&
		result.window_layout_device_init_table_loaded;
}

bool base_table_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.game_window_system_table_loaded &&
		result.game_window_input_table_loaded &&
		result.game_window_tooltip_table_loaded &&
		result.game_window_draw_table_loaded &&
		result.window_layout_init_table_loaded &&
		result.window_layout_update_table_loaded &&
		result.window_layout_shutdown_table_loaded;
}

bool base_layout_table_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.window_layout_init_table_loaded &&
		result.window_layout_update_table_loaded &&
		result.window_layout_shutdown_table_loaded;
}

bool device_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.w3d_gadget_push_button_draw_lookup &&
		result.w3d_game_window_default_draw_lookup &&
		result.w3d_main_menu_init_lookup;
}

bool base_core_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.pass_messages_to_parent_lookup &&
		result.pass_selected_buttons_to_parent_lookup &&
		result.game_window_default_system_lookup &&
		result.gadget_push_button_system_lookup &&
		result.message_box_system_lookup &&
		result.quit_message_box_system_lookup &&
		result.game_window_default_input_lookup &&
		result.gadget_push_button_input_lookup &&
		result.gadget_static_text_input_lookup &&
		result.game_window_default_tooltip_lookup;
}

bool base_widget_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return base_core_lookup_state_ready(result) &&
		result.gadget_check_box_system_lookup &&
		result.gadget_radio_button_system_lookup &&
		result.gadget_tab_control_system_lookup &&
		result.gadget_list_box_system_lookup &&
		result.gadget_combo_box_system_lookup &&
		result.gadget_horizontal_slider_system_lookup &&
		result.gadget_vertical_slider_system_lookup &&
		result.gadget_progress_bar_system_lookup &&
		result.gadget_static_text_system_lookup &&
		result.gadget_text_entry_system_lookup &&
		result.ime_candidate_window_system_lookup &&
		result.gadget_check_box_input_lookup &&
		result.gadget_radio_button_input_lookup &&
		result.gadget_tab_control_input_lookup &&
		result.gadget_list_box_input_lookup &&
		result.gadget_list_box_multi_input_lookup &&
		result.gadget_combo_box_input_lookup &&
		result.gadget_horizontal_slider_input_lookup &&
		result.gadget_vertical_slider_input_lookup &&
		result.gadget_text_entry_input_lookup &&
		result.ime_candidate_window_input_lookup &&
		result.ime_candidate_main_draw_lookup &&
		result.ime_candidate_text_area_draw_lookup;
}

bool base_layout_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.difficulty_select_init_lookup &&
		result.keyboard_options_menu_update_lookup &&
		result.popup_replay_shutdown_lookup;
}

bool shell_menu_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.main_menu_system_lookup &&
		result.credits_menu_system_lookup &&
		result.skirmish_game_options_menu_system_lookup &&
		result.single_player_menu_system_lookup &&
		result.main_menu_input_lookup &&
		result.credits_menu_input_lookup &&
		result.skirmish_game_options_menu_input_lookup &&
		result.single_player_menu_input_lookup &&
		result.main_menu_init_lookup &&
		result.credits_menu_init_lookup &&
		result.skirmish_game_options_menu_init_lookup &&
		result.single_player_menu_init_lookup &&
		result.main_menu_update_lookup &&
		result.credits_menu_update_lookup &&
		result.skirmish_game_options_menu_update_lookup &&
		result.single_player_menu_update_lookup &&
		result.main_menu_shutdown_lookup &&
		result.credits_menu_shutdown_lookup &&
		result.skirmish_game_options_menu_shutdown_lookup &&
		result.single_player_menu_shutdown_lookup;
}

bool base_layout_callback_graph_ready(const FunctionLexiconRuntimeProbeResult &)
{
	// The linked runtime currently proves a shell-menu subset. Full ownership
	// requires the remaining non-network shell layout callback graph.
	return false;
}

bool lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return base_widget_lookup_state_ready(result) &&
		base_layout_lookup_state_ready(result) &&
		shell_menu_lookup_state_ready(result) &&
		device_lookup_state_ready(result);
}

bool base_core_table_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.game_window_system_table_loaded &&
		result.game_window_input_table_loaded &&
		result.game_window_tooltip_table_loaded;
}

bool base_widget_table_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return base_core_table_state_ready(result) &&
		result.game_window_draw_table_loaded;
}

void finish_status(FunctionLexiconRuntimeProbeResult &result)
{
	if (!result.runtime_archive_registered) {
		result.status = "missing_runtime_archives";
		result.next_required = "runtimeArchiveSet";
		return;
	}
	if (!result.startup_singletons_ready) {
		result.status = "startup_singletons_not_ready";
		result.next_required = "startupSingletonOwnership";
		return;
	}
	if (!result.audio_manager_ready) {
		result.status = "audio_manager_not_ready";
		result.next_required = "createAudioManager";
		return;
	}
	if (!result.memory_manager_ready || !result.name_key_generator_ready) {
		result.status = "startup_singletons_incomplete";
		result.next_required = "startupSingletonOwnership";
		return;
	}
	if (!result.the_function_lexicon_was_null &&
		!result.the_function_lexicon_was_owned) {
		result.status = "foreign_function_lexicon_already_installed";
		result.next_required = "createFunctionLexicon";
		return;
	}
	if (result.init_threw) {
		result.status = "original_function_lexicon_init_threw";
		result.next_required = "createFunctionLexicon";
		return;
	}
	if (!result.constructed ||
		!result.the_function_lexicon_owned ||
		!result.init_ran) {
		result.status = "original_function_lexicon_init_incomplete";
		result.next_required = "createFunctionLexicon";
		return;
	}
	if (!device_table_state_ready(result) || !device_lookup_state_ready(result)) {
		result.status = "w3d_function_lexicon_device_tables_missing";
		result.next_required = "createFunctionLexicon";
		return;
	}
	if (!base_core_table_state_ready(result) ||
		!base_core_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_probe_owned";
		result.next_required = "originalFunctionLexiconCallbacks";
		return;
	}
	if (!base_widget_table_state_ready(result) ||
		!base_widget_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_partial_runtime_owned";
		result.next_required = "originalFunctionLexiconWidgetAndDrawCallbacks";
		return;
	}
	if (!base_layout_table_state_ready(result)) {
		result.status = "base_function_lexicon_widget_draw_runtime_owned";
		result.next_required = "originalFunctionLexiconLayoutCallbacks";
		return;
	}
	if (!base_layout_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_layout_tables_runtime_owned";
		result.next_required = "originalFunctionLexiconRepresentativeLayoutCallbacks";
		return;
	}
	if (!shell_menu_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_layout_partial_runtime_owned";
		result.next_required = "originalFunctionLexiconShellMenuCallbacks";
		return;
	}
	if (!base_layout_callback_graph_ready(result)) {
		result.status = "base_function_lexicon_single_player_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingShellCallbacks";
		return;
	}
	if (!base_table_state_ready(result)) {
		result.status = "base_function_lexicon_tables_missing";
		result.next_required = "createFunctionLexicon";
		return;
	}
	if (!table_state_ready(result)) {
		result.status = "function_lexicon_tables_missing";
		result.next_required = "createFunctionLexicon";
		return;
	}
	if (!lookup_state_ready(result)) {
		result.status = "function_lexicon_lookup_mismatch";
		result.next_required = "createFunctionLexicon";
		return;
	}

	result.ok = true;
	result.status = "ready";
	result.next_required = "createModuleFactory";
}

} // namespace

const FunctionLexiconRuntimeProbeResult &wasm_function_lexicon_runtime_install(
	bool runtime_archive_registered,
	bool audio_manager_ready)
{
	FunctionLexiconRuntimeProbeResult result;
	result.attempted = true;
	result.runtime_archive_registered = runtime_archive_registered;
	result.startup_singletons_ready = wasm_startup_singletons_state().ok;
	result.audio_manager_ready = audio_manager_ready;
	result.memory_manager_ready = isMemoryManagerOfficiallyInited();
	result.name_key_generator_ready = TheNameKeyGenerator != nullptr;
	result.the_function_lexicon_was_null = TheFunctionLexicon == nullptr;
	result.the_function_lexicon_was_owned =
		g_function_lexicon != nullptr && TheFunctionLexicon == g_function_lexicon;

	const bool preconditions_ready =
		result.runtime_archive_registered &&
		result.startup_singletons_ready &&
		result.audio_manager_ready &&
		result.memory_manager_ready &&
		result.name_key_generator_ready &&
		(result.the_function_lexicon_was_null ||
			result.the_function_lexicon_was_owned);

	if (!preconditions_ready) {
		finish_status(result);
		g_function_lexicon_state = result;
		return g_function_lexicon_state;
	}

	try {
		if (g_function_lexicon == nullptr) {
			// GameEngine.cpp line 446:
			// Win32GameEngine::createFunctionLexicon() returns NEW
			// W3DFunctionLexicon.
			g_function_lexicon = NEW W3DFunctionLexicon;
			result.constructed = true;
			TheFunctionLexicon = g_function_lexicon;
			result.the_function_lexicon_owned =
				TheFunctionLexicon == g_function_lexicon;

			// SubsystemInterfaceList::initSubsystem() ->
			// W3DFunctionLexicon::init(). The current linked runtime proves
			// the W3D device draw/layout tables plus a non-network base
			// callback subset; the remaining shell graph stays partial.
			g_function_lexicon->init();
			g_function_lexicon_init_ran = true;
		} else {
			TheFunctionLexicon = g_function_lexicon;
			result.constructed = true;
			result.the_function_lexicon_owned = true;
		}
		result.init_ran = g_function_lexicon_init_ran;
		capture_table_state(result);
		capture_lookup_state(result);
	} catch (ErrorCode code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "ErrorCode 0x%08x",
			static_cast<unsigned>(code));
		result.init_error = buffer;
	} catch (int code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "int %d", code);
		result.init_error = buffer;
	} catch (unsigned code) {
		result.init_threw = true;
		char buffer[64];
		std::snprintf(buffer, sizeof(buffer), "unsigned %u", code);
		result.init_error = buffer;
	} catch (const char *msg) {
		result.init_threw = true;
		result.init_error = std::string("cstr ") + msg;
	} catch (...) {
		result.init_threw = true;
		result.init_error = "W3DFunctionLexicon init raised an exception";
	}

	if (result.init_threw && g_function_lexicon != nullptr) {
		if (TheFunctionLexicon == g_function_lexicon) {
			TheFunctionLexicon = nullptr;
		}
		delete g_function_lexicon;
		g_function_lexicon = nullptr;
		g_function_lexicon_init_ran = false;
		result.the_function_lexicon_owned = false;
	}

	finish_status(result);
	g_function_lexicon_state = result;
	return g_function_lexicon_state;
}

const FunctionLexiconRuntimeProbeResult &wasm_function_lexicon_runtime_state()
{
	return g_function_lexicon_state;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_function_lexicon_runtime()
{
	return wasm_function_lexicon_runtime_state_json();
}

const char *wasm_function_lexicon_runtime_state_json()
{
	const FunctionLexiconRuntimeProbeResult &state = g_function_lexicon_state;
	const std::string source_json = json_escape(state.source);
	const std::string status_json = json_escape(state.status);
	const std::string next_required_json = json_escape(state.next_required);
	const std::string init_error_json = json_escape(state.init_error);

	static char json[18000];
	std::snprintf(json, sizeof(json),
		"{\"attempted\":%s,\"ok\":%s,\"source\":\"%s\","
		"\"status\":\"%s\",\"nextRequired\":\"%s\","
		"\"gameEngineInit\":{\"factory\":\"createFunctionLexicon\","
		"\"line\":446,\"originalConcrete\":\"W3DFunctionLexicon\"},"
		"\"runtimeArchiveRegistered\":%s,"
		"\"startupSingletonsReady\":%s,"
		"\"audioManagerReady\":%s,"
		"\"memoryManagerReady\":%s,"
		"\"nameKeyGeneratorReady\":%s,"
		"\"theFunctionLexiconWasNull\":%s,"
		"\"theFunctionLexiconWasOwned\":%s,"
		"\"constructed\":%s,\"theFunctionLexiconOwned\":%s,"
		"\"initRan\":%s,\"initThrew\":%s,\"initError\":\"%s\","
		"\"tables\":{\"gameWindowSystem\":%s,"
		"\"gameWindowInput\":%s,\"gameWindowTooltip\":%s,"
		"\"gameWindowDraw\":%s,\"gameWindowDeviceDraw\":%s,"
		"\"windowLayoutInit\":%s,\"windowLayoutDeviceInit\":%s,"
		"\"windowLayoutUpdate\":%s,\"windowLayoutShutdown\":%s},"
		"\"lookups\":{\"passMessagesToParentSystem\":%s,"
		"\"passSelectedButtonsToParentSystem\":%s,"
		"\"gameWindowDefaultSystem\":%s,"
		"\"gadgetPushButtonSystem\":%s,"
		"\"gadgetCheckBoxSystem\":%s,"
		"\"gadgetRadioButtonSystem\":%s,"
		"\"gadgetTabControlSystem\":%s,"
		"\"gadgetListBoxSystem\":%s,"
		"\"gadgetComboBoxSystem\":%s,"
		"\"gadgetHorizontalSliderSystem\":%s,"
		"\"gadgetVerticalSliderSystem\":%s,"
		"\"gadgetProgressBarSystem\":%s,"
		"\"gadgetStaticTextSystem\":%s,"
		"\"gadgetTextEntrySystem\":%s,"
		"\"messageBoxSystem\":%s,"
		"\"quitMessageBoxSystem\":%s,"
		"\"imeCandidateWindowSystem\":%s,"
		"\"mainMenuSystem\":%s,"
		"\"creditsMenuSystem\":%s,"
		"\"skirmishGameOptionsMenuSystem\":%s,"
		"\"singlePlayerMenuSystem\":%s,"
		"\"gameWindowDefaultInput\":%s,"
		"\"gadgetPushButtonInput\":%s,"
		"\"gadgetCheckBoxInput\":%s,"
		"\"gadgetRadioButtonInput\":%s,"
		"\"gadgetTabControlInput\":%s,"
		"\"gadgetListBoxInput\":%s,"
		"\"gadgetListBoxMultiInput\":%s,"
		"\"gadgetComboBoxInput\":%s,"
		"\"gadgetHorizontalSliderInput\":%s,"
		"\"gadgetVerticalSliderInput\":%s,"
		"\"gadgetStaticTextInput\":%s,"
		"\"gadgetTextEntryInput\":%s,"
		"\"imeCandidateWindowInput\":%s,"
		"\"mainMenuInput\":%s,"
		"\"creditsMenuInput\":%s,"
		"\"skirmishGameOptionsMenuInput\":%s,"
		"\"singlePlayerMenuInput\":%s,"
		"\"gameWindowDefaultTooltip\":%s,"
		"\"imeCandidateMainDraw\":%s,"
		"\"imeCandidateTextAreaDraw\":%s,"
		"\"mainMenuInit\":%s,"
		"\"creditsMenuInit\":%s,"
		"\"skirmishGameOptionsMenuInit\":%s,"
		"\"singlePlayerMenuInit\":%s,"
		"\"difficultySelectInit\":%s,"
		"\"mainMenuUpdate\":%s,"
		"\"creditsMenuUpdate\":%s,"
		"\"skirmishGameOptionsMenuUpdate\":%s,"
		"\"singlePlayerMenuUpdate\":%s,"
		"\"keyboardOptionsMenuUpdate\":%s,"
		"\"mainMenuShutdown\":%s,"
		"\"creditsMenuShutdown\":%s,"
		"\"skirmishGameOptionsMenuShutdown\":%s,"
		"\"singlePlayerMenuShutdown\":%s,"
		"\"popupReplayShutdown\":%s,"
		"\"w3dGadgetPushButtonDraw\":%s,"
		"\"w3dGameWindowDefaultDraw\":%s,"
		"\"w3dMainMenuInit\":%s}}",
		json_bool(state.attempted),
		json_bool(state.ok),
		source_json.c_str(),
		status_json.c_str(),
		next_required_json.c_str(),
		json_bool(state.runtime_archive_registered),
		json_bool(state.startup_singletons_ready),
		json_bool(state.audio_manager_ready),
		json_bool(state.memory_manager_ready),
		json_bool(state.name_key_generator_ready),
		json_bool(state.the_function_lexicon_was_null),
		json_bool(state.the_function_lexicon_was_owned),
		json_bool(state.constructed),
		json_bool(state.the_function_lexicon_owned),
		json_bool(state.init_ran),
		json_bool(state.init_threw),
		init_error_json.c_str(),
		json_bool(state.game_window_system_table_loaded),
		json_bool(state.game_window_input_table_loaded),
		json_bool(state.game_window_tooltip_table_loaded),
		json_bool(state.game_window_draw_table_loaded),
		json_bool(state.game_window_device_draw_table_loaded),
		json_bool(state.window_layout_init_table_loaded),
		json_bool(state.window_layout_device_init_table_loaded),
		json_bool(state.window_layout_update_table_loaded),
		json_bool(state.window_layout_shutdown_table_loaded),
		json_bool(state.pass_messages_to_parent_lookup),
		json_bool(state.pass_selected_buttons_to_parent_lookup),
		json_bool(state.game_window_default_system_lookup),
		json_bool(state.gadget_push_button_system_lookup),
		json_bool(state.gadget_check_box_system_lookup),
		json_bool(state.gadget_radio_button_system_lookup),
		json_bool(state.gadget_tab_control_system_lookup),
		json_bool(state.gadget_list_box_system_lookup),
		json_bool(state.gadget_combo_box_system_lookup),
		json_bool(state.gadget_horizontal_slider_system_lookup),
		json_bool(state.gadget_vertical_slider_system_lookup),
		json_bool(state.gadget_progress_bar_system_lookup),
		json_bool(state.gadget_static_text_system_lookup),
		json_bool(state.gadget_text_entry_system_lookup),
		json_bool(state.message_box_system_lookup),
		json_bool(state.quit_message_box_system_lookup),
		json_bool(state.ime_candidate_window_system_lookup),
		json_bool(state.main_menu_system_lookup),
		json_bool(state.credits_menu_system_lookup),
		json_bool(state.skirmish_game_options_menu_system_lookup),
		json_bool(state.single_player_menu_system_lookup),
		json_bool(state.game_window_default_input_lookup),
		json_bool(state.gadget_push_button_input_lookup),
		json_bool(state.gadget_check_box_input_lookup),
		json_bool(state.gadget_radio_button_input_lookup),
		json_bool(state.gadget_tab_control_input_lookup),
		json_bool(state.gadget_list_box_input_lookup),
		json_bool(state.gadget_list_box_multi_input_lookup),
		json_bool(state.gadget_combo_box_input_lookup),
		json_bool(state.gadget_horizontal_slider_input_lookup),
		json_bool(state.gadget_vertical_slider_input_lookup),
		json_bool(state.gadget_static_text_input_lookup),
		json_bool(state.gadget_text_entry_input_lookup),
		json_bool(state.ime_candidate_window_input_lookup),
		json_bool(state.main_menu_input_lookup),
		json_bool(state.credits_menu_input_lookup),
		json_bool(state.skirmish_game_options_menu_input_lookup),
		json_bool(state.single_player_menu_input_lookup),
		json_bool(state.game_window_default_tooltip_lookup),
		json_bool(state.ime_candidate_main_draw_lookup),
		json_bool(state.ime_candidate_text_area_draw_lookup),
		json_bool(state.main_menu_init_lookup),
		json_bool(state.credits_menu_init_lookup),
		json_bool(state.skirmish_game_options_menu_init_lookup),
		json_bool(state.single_player_menu_init_lookup),
		json_bool(state.difficulty_select_init_lookup),
		json_bool(state.main_menu_update_lookup),
		json_bool(state.credits_menu_update_lookup),
		json_bool(state.skirmish_game_options_menu_update_lookup),
		json_bool(state.single_player_menu_update_lookup),
		json_bool(state.keyboard_options_menu_update_lookup),
		json_bool(state.main_menu_shutdown_lookup),
		json_bool(state.credits_menu_shutdown_lookup),
		json_bool(state.skirmish_game_options_menu_shutdown_lookup),
		json_bool(state.single_player_menu_shutdown_lookup),
		json_bool(state.popup_replay_shutdown_lookup),
		json_bool(state.w3d_gadget_push_button_draw_lookup),
		json_bool(state.w3d_game_window_default_draw_lookup),
		json_bool(state.w3d_main_menu_init_lookup));
	return json;
}
