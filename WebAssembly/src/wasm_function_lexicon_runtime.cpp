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

#include <cstring>
#include <cstdio>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

extern void PopupReplayInit(WindowLayout *layout, void *userData);
extern void PopupReplayShutdown(WindowLayout *layout, void *userData);
extern WindowMsgHandledType PopupReplayInput(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
extern WindowMsgHandledType BeaconWindowInput(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
extern WindowMsgHandledType ControlBarInput(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
extern WindowMsgHandledType ExtendedMessageBoxSystem(GameWindow *window,
	UnsignedInt msg, WindowMsgData mData1, WindowMsgData mData2);
extern WindowMsgHandledType QuitMenuSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);

// Score screen (end-of-match stats) callbacks -- the real owners live in
// GameClient/GUI/GUICallbacks/Menus/ScoreScreen.cpp and are linked into
// cnc-port, but the reduced runtime FunctionLexicon table
// (wasm_ww3d_render_probe.cpp) omits them, so the ScoreScreen.wnd layout can
// neither run its init/update/shutdown (broken layout + no data) nor dispatch
// its system/input callbacks (dead OK/continue button and dead ESC).  Repair
// the tables at runtime the same way the quit-menu owners are repaired.
extern WindowMsgHandledType ScoreScreenSystem(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
extern WindowMsgHandledType ScoreScreenInput(GameWindow *window, UnsignedInt msg,
	WindowMsgData mData1, WindowMsgData mData2);
extern void ScoreScreenInit(WindowLayout *layout, void *userData);
extern void ScoreScreenUpdate(WindowLayout *layout, void *userData);
extern void ScoreScreenShutdown(WindowLayout *layout, void *userData);

#ifdef __EMSCRIPTEN__
__attribute__((used)) static GameWinSystemFunc g_keep_quit_menu_system =
	QuitMenuSystem;
__attribute__((used)) static GameWinSystemFunc g_keep_score_screen_system =
	ScoreScreenSystem;
__attribute__((used)) static GameWinInputFunc g_keep_score_screen_input =
	ScoreScreenInput;
__attribute__((used)) static WindowLayoutInitFunc g_keep_score_screen_init =
	ScoreScreenInit;
__attribute__((used)) static WindowLayoutUpdateFunc g_keep_score_screen_update =
	ScoreScreenUpdate;
__attribute__((used)) static WindowLayoutShutdownFunc g_keep_score_screen_shutdown =
	ScoreScreenShutdown;
__attribute__((used)) static GameWinSystemFunc g_keep_control_bar_system =
	ControlBarSystem;
__attribute__((used)) static GameWinInputFunc g_keep_left_hud_input =
	LeftHUDInput;
__attribute__((used)) static GameWinSystemFunc g_keep_generals_exp_points_system =
	GeneralsExpPointsSystem;
__attribute__((used)) static GameWinInputFunc g_keep_generals_exp_points_input =
	GeneralsExpPointsInput;
#endif

namespace {

FunctionLexiconRuntimeProbeResult g_function_lexicon_state;
W3DFunctionLexicon *g_function_lexicon = nullptr;
bool g_function_lexicon_init_ran = false;

struct RuntimeLexiconEntry
{
	const char *name;
	FunctionLexicon::TableFunction func;
};

bool runtime_entry_name_matches(const char *name,
	const RuntimeLexiconEntry *entries, Int entry_count)
{
	if (name == nullptr) {
		return false;
	}
	for (Int i = 0; i < entry_count; ++i) {
		if (std::strcmp(name, entries[i].name) == 0) {
			return true;
		}
	}
	return false;
}

void load_runtime_table_with_entries(FunctionLexicon::TableIndex index,
	const RuntimeLexiconEntry *entries, Int entry_count)
{
	if (TheFunctionLexicon == nullptr || entries == nullptr || entry_count <= 0) {
		return;
	}

	FunctionLexicon::TableEntry *old_table = TheFunctionLexicon->getTable(index);
	Int old_count = 0;
	if (old_table != nullptr) {
		while (old_table[old_count].name != nullptr) {
			++old_count;
		}
	}

	FunctionLexicon::TableEntry *new_table =
		NEW FunctionLexicon::TableEntry[old_count + entry_count + 1];
	Int out = 0;
	for (Int i = 0; i < entry_count; ++i) {
		new_table[out].key = NAMEKEY_INVALID;
		new_table[out].name = entries[i].name;
		new_table[out].func = entries[i].func;
		++out;
	}
	for (Int i = 0; i < old_count; ++i) {
		if (runtime_entry_name_matches(old_table[i].name, entries, entry_count)) {
			continue;
		}
		new_table[out++] = old_table[i];
	}
	new_table[out].key = NAMEKEY_INVALID;
	new_table[out].name = nullptr;
	new_table[out].func = nullptr;

	TheFunctionLexicon->loadRuntimeTableForPort(new_table, index);
}

void repair_gameplay_callback_owners()
{
	if (TheFunctionLexicon == nullptr ||
		TheNameKeyGenerator == nullptr) {
		return;
	}
	if (TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey("QuitMenuSystem")) == QuitMenuSystem &&
		TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey("ControlBarSystem")) == ControlBarSystem &&
		TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey("GeneralsExpPointsSystem")) ==
			GeneralsExpPointsSystem &&
		TheFunctionLexicon->gameWinSystemFunc(
			TheNameKeyGenerator->nameToKey("ScoreScreenSystem")) == ScoreScreenSystem &&
		TheFunctionLexicon->gameWinInputFunc(
			TheNameKeyGenerator->nameToKey("ScoreScreenInput")) == ScoreScreenInput &&
		TheFunctionLexicon->winLayoutInitFunc(
			TheNameKeyGenerator->nameToKey("ScoreScreenInit"),
			FunctionLexicon::TABLE_WIN_LAYOUT_INIT) == ScoreScreenInit &&
		TheFunctionLexicon->winLayoutUpdateFunc(
			TheNameKeyGenerator->nameToKey("ScoreScreenUpdate")) == ScoreScreenUpdate &&
		TheFunctionLexicon->winLayoutShutdownFunc(
			TheNameKeyGenerator->nameToKey("ScoreScreenShutdown")) ==
			ScoreScreenShutdown &&
		TheFunctionLexicon->gameWinInputFunc(
			TheNameKeyGenerator->nameToKey("LeftHUDInput")) == LeftHUDInput &&
		TheFunctionLexicon->gameWinInputFunc(
			TheNameKeyGenerator->nameToKey("GeneralsExpPointsInput")) ==
			GeneralsExpPointsInput) {
		return;
	}

	const RuntimeLexiconEntry system_entries[] = {
		{ "QuitMenuSystem", FunctionLexicon::TableFunction(QuitMenuSystem) },
		{ "ControlBarSystem", FunctionLexicon::TableFunction(ControlBarSystem) },
		{ "GeneralsExpPointsSystem",
			FunctionLexicon::TableFunction(GeneralsExpPointsSystem) },
		{ "ScoreScreenSystem", FunctionLexicon::TableFunction(ScoreScreenSystem) },
	};
	const RuntimeLexiconEntry input_entries[] = {
		{ "LeftHUDInput", FunctionLexicon::TableFunction(LeftHUDInput) },
		{ "GeneralsExpPointsInput",
			FunctionLexicon::TableFunction(GeneralsExpPointsInput) },
		{ "ScoreScreenInput", FunctionLexicon::TableFunction(ScoreScreenInput) },
	};
	// ScoreScreen's window-layout callbacks (init/update/shutdown) are looked up
	// by the ScoreScreen.wnd load path; without them the layout never populates
	// its stats/data and never sets up its transition group -> broken render.
	const RuntimeLexiconEntry layout_init_entries[] = {
		{ "ScoreScreenInit", FunctionLexicon::TableFunction(ScoreScreenInit) },
	};
	const RuntimeLexiconEntry layout_update_entries[] = {
		{ "ScoreScreenUpdate", FunctionLexicon::TableFunction(ScoreScreenUpdate) },
	};
	const RuntimeLexiconEntry layout_shutdown_entries[] = {
		{ "ScoreScreenShutdown",
			FunctionLexicon::TableFunction(ScoreScreenShutdown) },
	};

	load_runtime_table_with_entries(FunctionLexicon::TABLE_GAME_WIN_SYSTEM,
		system_entries, sizeof(system_entries) / sizeof(system_entries[0]));
	load_runtime_table_with_entries(FunctionLexicon::TABLE_GAME_WIN_INPUT,
		input_entries, sizeof(input_entries) / sizeof(input_entries[0]));
	load_runtime_table_with_entries(FunctionLexicon::TABLE_WIN_LAYOUT_INIT,
		layout_init_entries,
		sizeof(layout_init_entries) / sizeof(layout_init_entries[0]));
	load_runtime_table_with_entries(FunctionLexicon::TABLE_WIN_LAYOUT_UPDATE,
		layout_update_entries,
		sizeof(layout_update_entries) / sizeof(layout_update_entries[0]));
	load_runtime_table_with_entries(FunctionLexicon::TABLE_WIN_LAYOUT_SHUTDOWN,
		layout_shutdown_entries,
		sizeof(layout_shutdown_entries) / sizeof(layout_shutdown_entries[0]));
}

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

bool system_callback_registered(const char *name)
{
	return TheFunctionLexicon != nullptr &&
		TheFunctionLexicon->gameWinSystemFunc(key_for(name)) != nullptr;
}

bool input_callback_registered(const char *name)
{
	return TheFunctionLexicon != nullptr &&
		TheFunctionLexicon->gameWinInputFunc(key_for(name)) != nullptr;
}

bool layout_init_callback_registered(const char *name)
{
	return TheFunctionLexicon != nullptr &&
		TheFunctionLexicon->winLayoutInitFunc(
			key_for(name), FunctionLexicon::TABLE_WIN_LAYOUT_INIT) != nullptr;
}

bool layout_update_callback_registered(const char *name)
{
	return TheFunctionLexicon != nullptr &&
		TheFunctionLexicon->winLayoutUpdateFunc(key_for(name)) != nullptr;
}

bool layout_shutdown_callback_registered(const char *name)
{
	return TheFunctionLexicon != nullptr &&
		TheFunctionLexicon->winLayoutShutdownFunc(key_for(name)) != nullptr;
}

bool all_callbacks_registered(const char *const *names,
	bool (*registered)(const char *))
{
	for (const char *const *name = names; *name != nullptr; ++name) {
		if (!registered(*name)) {
			return false;
		}
	}
	return true;
}

void append_missing_callback_group(FunctionLexiconRuntimeProbeResult &result,
	const char *name, bool ready)
{
	if (ready) {
		return;
	}
	if (result.missing_callback_group_count == 0) {
		result.missing_callback_groups_json = "{";
	} else {
		result.missing_callback_groups_json += ",";
	}
	result.missing_callback_groups_json += "\"";
	result.missing_callback_groups_json += name;
	result.missing_callback_groups_json += "\":true";
	++result.missing_callback_group_count;
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
	result.extended_message_box_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("ExtendedMessageBoxSystem")) == ExtendedMessageBoxSystem;
	result.ime_candidate_window_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("IMECandidateWindowSystem")) == IMECandidateWindowSystem;
	result.motd_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("MOTDSystem")) == MOTDSystem;
	result.main_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("MainMenuSystem")) == MainMenuSystem;
	result.options_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("OptionsMenuSystem")) == OptionsMenuSystem;
	result.credits_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("CreditsMenuSystem")) == CreditsMenuSystem;
	result.skirmish_game_options_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("SkirmishGameOptionsMenuSystem")) ==
				SkirmishGameOptionsMenuSystem;
	result.skirmish_map_select_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("SkirmishMapSelectMenuSystem")) ==
				SkirmishMapSelectMenuSystem;
	result.single_player_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("SinglePlayerMenuSystem")) == SinglePlayerMenuSystem;
	result.quit_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("QuitMenuSystem")) == QuitMenuSystem;
	result.challenge_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("ChallengeMenuSystem")) == ChallengeMenuSystem;
	result.popup_communicator_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("PopupCommunicatorSystem")) == PopupCommunicatorSystem;
	result.map_select_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("MapSelectMenuSystem")) == MapSelectMenuSystem;
	result.replay_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("ReplayMenuSystem")) == ReplayMenuSystem;
	result.difficulty_select_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("DifficultySelectSystem")) == DifficultySelectSystem;
	result.keyboard_options_menu_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("KeyboardOptionsMenuSystem")) == KeyboardOptionsMenuSystem;
	result.in_game_popup_message_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("InGamePopupMessageSystem")) == InGamePopupMessageSystem;
	result.idle_worker_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("IdleWorkerSystem")) == IdleWorkerSystem;
	result.replay_control_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("ReplayControlSystem")) == ReplayControlSystem;
	result.control_bar_observer_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("ControlBarObserverSystem")) == ControlBarObserverSystem;
	result.control_bar_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("ControlBarSystem")) == ControlBarSystem;
	result.generals_exp_points_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GeneralsExpPointsSystem")) == GeneralsExpPointsSystem;
	result.game_info_window_system_lookup =
		TheFunctionLexicon->gameWinSystemFunc(
			key_for("GameInfoWindowSystem")) == GameInfoWindowSystem;
	result.game_window_default_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GameWinDefaultInput")) == GameWinDefaultInput;
	result.game_window_block_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GameWinBlockInput")) == GameWinBlockInput;
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
	result.options_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("OptionsMenuInput")) == OptionsMenuInput;
	result.credits_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("CreditsMenuInput")) == CreditsMenuInput;
	result.skirmish_game_options_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("SkirmishGameOptionsMenuInput")) ==
				SkirmishGameOptionsMenuInput;
	result.skirmish_map_select_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("SkirmishMapSelectMenuInput")) ==
				SkirmishMapSelectMenuInput;
	result.single_player_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("SinglePlayerMenuInput")) == SinglePlayerMenuInput;
	result.challenge_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("ChallengeMenuInput")) == ChallengeMenuInput;
	result.popup_communicator_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("PopupCommunicatorInput")) == PopupCommunicatorInput;
	result.map_select_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("MapSelectMenuInput")) == MapSelectMenuInput;
	result.replay_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("ReplayMenuInput")) == ReplayMenuInput;
	result.popup_replay_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("PopupReplayInput")) == PopupReplayInput;
	result.difficulty_select_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("DifficultySelectInput")) == DifficultySelectInput;
	result.keyboard_options_menu_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("KeyboardOptionsMenuInput")) == KeyboardOptionsMenuInput;
	result.in_game_popup_message_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("InGamePopupMessageInput")) == InGamePopupMessageInput;
	result.control_bar_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("ControlBarInput")) == ControlBarInput;
	result.left_hud_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("LeftHUDInput")) == LeftHUDInput;
	result.generals_exp_points_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("GeneralsExpPointsInput")) == GeneralsExpPointsInput;
	result.beacon_window_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("BeaconWindowInput")) == BeaconWindowInput;
	result.replay_control_input_lookup =
		TheFunctionLexicon->gameWinInputFunc(
			key_for("ReplayControlInput")) == ReplayControlInput;
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
	result.options_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("OptionsMenuInit")) == OptionsMenuInit;
	result.credits_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("CreditsMenuInit")) == CreditsMenuInit;
	result.skirmish_game_options_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("SkirmishGameOptionsMenuInit")) ==
				SkirmishGameOptionsMenuInit;
	result.skirmish_map_select_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("SkirmishMapSelectMenuInit")) ==
				SkirmishMapSelectMenuInit;
	result.single_player_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("SinglePlayerMenuInit")) == SinglePlayerMenuInit;
	result.challenge_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("ChallengeMenuInit")) == ChallengeMenuInit;
	result.popup_communicator_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("PopupCommunicatorInit")) == PopupCommunicatorInit;
	result.map_select_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("MapSelectMenuInit")) == MapSelectMenuInit;
	result.replay_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("ReplayMenuInit")) == ReplayMenuInit;
	result.game_info_window_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("GameInfoWindowInit")) == GameInfoWindowInit;
	result.popup_replay_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("PopupReplayInit")) == PopupReplayInit;
	result.difficulty_select_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("DifficultySelectInit")) == DifficultySelectInit;
	result.keyboard_options_menu_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("KeyboardOptionsMenuInit")) == KeyboardOptionsMenuInit;
	result.in_game_popup_message_init_lookup =
		TheFunctionLexicon->winLayoutInitFunc(
			key_for("InGamePopupMessageInit")) == InGamePopupMessageInit;
	result.main_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("MainMenuUpdate")) == MainMenuUpdate;
	result.options_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("OptionsMenuUpdate")) == OptionsMenuUpdate;
	result.credits_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("CreditsMenuUpdate")) == CreditsMenuUpdate;
	result.skirmish_game_options_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("SkirmishGameOptionsMenuUpdate")) ==
				SkirmishGameOptionsMenuUpdate;
	result.skirmish_map_select_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("SkirmishMapSelectMenuUpdate")) ==
				SkirmishMapSelectMenuUpdate;
	result.single_player_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("SinglePlayerMenuUpdate")) == SinglePlayerMenuUpdate;
	result.challenge_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("ChallengeMenuUpdate")) == ChallengeMenuUpdate;
	result.map_select_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("MapSelectMenuUpdate")) == MapSelectMenuUpdate;
	result.replay_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("ReplayMenuUpdate")) == ReplayMenuUpdate;
	result.keyboard_options_menu_update_lookup =
		TheFunctionLexicon->winLayoutUpdateFunc(
			key_for("KeyboardOptionsMenuUpdate")) == KeyboardOptionsMenuUpdate;
	result.main_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("MainMenuShutdown")) == MainMenuShutdown;
	result.options_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("OptionsMenuShutdown")) == OptionsMenuShutdown;
	result.credits_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("CreditsMenuShutdown")) == CreditsMenuShutdown;
	result.skirmish_game_options_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("SkirmishGameOptionsMenuShutdown")) ==
				SkirmishGameOptionsMenuShutdown;
	result.skirmish_map_select_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("SkirmishMapSelectMenuShutdown")) ==
				SkirmishMapSelectMenuShutdown;
	result.single_player_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("SinglePlayerMenuShutdown")) == SinglePlayerMenuShutdown;
	result.challenge_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("ChallengeMenuShutdown")) == ChallengeMenuShutdown;
	result.popup_communicator_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("PopupCommunicatorShutdown")) == PopupCommunicatorShutdown;
	result.map_select_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("MapSelectMenuShutdown")) == MapSelectMenuShutdown;
	result.replay_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("ReplayMenuShutdown")) == ReplayMenuShutdown;
	result.keyboard_options_menu_shutdown_lookup =
		TheFunctionLexicon->winLayoutShutdownFunc(
			key_for("KeyboardOptionsMenuShutdown")) == KeyboardOptionsMenuShutdown;
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

void capture_missing_callback_groups(FunctionLexiconRuntimeProbeResult &result)
{
	result.missing_callback_group_count = 0;
	result.missing_callback_groups_json = "{}";
	if (TheFunctionLexicon == nullptr || TheNameKeyGenerator == nullptr) {
		return;
	}

	const char *save_load_system[] = { "SaveLoadMenuSystem", nullptr };
	const char *save_load_input[] = { "SaveLoadMenuInput", nullptr };
	const char *save_load_init[] = {
		"SaveLoadMenuInit", "SaveLoadMenuFullScreenInit", nullptr };
	const char *save_load_update[] = { "SaveLoadMenuUpdate", nullptr };
	const char *save_load_shutdown[] = { "SaveLoadMenuShutdown", nullptr };
	append_missing_callback_group(result, "saveLoadMenu",
		all_callbacks_registered(save_load_system, system_callback_registered) &&
			all_callbacks_registered(save_load_input, input_callback_registered) &&
			all_callbacks_registered(save_load_init, layout_init_callback_registered) &&
			all_callbacks_registered(save_load_update, layout_update_callback_registered) &&
			all_callbacks_registered(save_load_shutdown, layout_shutdown_callback_registered));

	append_missing_callback_group(result, "quitMenu",
		system_callback_registered("QuitMenuSystem"));

	const char *popup_replay_score_system[] = { "PopupReplaySystem", nullptr };
	const char *popup_replay_score_update[] = { "PopupReplayUpdate", nullptr };
	append_missing_callback_group(result, "popupReplayScoreState",
		all_callbacks_registered(popup_replay_score_system, system_callback_registered) &&
			all_callbacks_registered(
				popup_replay_score_update, layout_update_callback_registered));

	const char *score_screen_system[] = { "ScoreScreenSystem", nullptr };
	const char *score_screen_input[] = { "ScoreScreenInput", nullptr };
	const char *score_screen_init[] = { "ScoreScreenInit", nullptr };
	const char *score_screen_update[] = { "ScoreScreenUpdate", nullptr };
	const char *score_screen_shutdown[] = { "ScoreScreenShutdown", nullptr };
	append_missing_callback_group(result, "scoreScreen",
		all_callbacks_registered(score_screen_system, system_callback_registered) &&
			all_callbacks_registered(score_screen_input, input_callback_registered) &&
			all_callbacks_registered(score_screen_init, layout_init_callback_registered) &&
			all_callbacks_registered(score_screen_update, layout_update_callback_registered) &&
			all_callbacks_registered(
				score_screen_shutdown, layout_shutdown_callback_registered));

	const char *control_bar_command_system[] = { "ControlBarSystem", nullptr };
	const char *control_bar_command_input[] = { "LeftHUDInput", nullptr };
	append_missing_callback_group(result, "controlBarCommandHud",
		all_callbacks_registered(
			control_bar_command_system, system_callback_registered) &&
			all_callbacks_registered(
				control_bar_command_input, input_callback_registered));

	const char *generals_exp_system[] = { "GeneralsExpPointsSystem", nullptr };
	const char *generals_exp_input[] = { "GeneralsExpPointsInput", nullptr };
	append_missing_callback_group(result, "generalsExpPoints",
		all_callbacks_registered(generals_exp_system, system_callback_registered) &&
			all_callbacks_registered(generals_exp_input, input_callback_registered));

	const char *lan_system[] = {
		"LanLobbyMenuSystem", "LanGameOptionsMenuSystem",
		"LanMapSelectMenuSystem", nullptr };
	const char *lan_input[] = {
		"LanLobbyMenuInput", "LanGameOptionsMenuInput",
		"LanMapSelectMenuInput", nullptr };
	const char *lan_init[] = {
		"LanLobbyMenuInit", "LanGameOptionsMenuInit",
		"LanMapSelectMenuInit", nullptr };
	const char *lan_update[] = {
		"LanLobbyMenuUpdate", "LanGameOptionsMenuUpdate",
		"LanMapSelectMenuUpdate", nullptr };
	const char *lan_shutdown[] = {
		"LanLobbyMenuShutdown", "LanGameOptionsMenuShutdown",
		"LanMapSelectMenuShutdown", nullptr };
	append_missing_callback_group(result, "lanMenus",
		all_callbacks_registered(lan_system, system_callback_registered) &&
			all_callbacks_registered(lan_input, input_callback_registered) &&
			all_callbacks_registered(lan_init, layout_init_callback_registered) &&
			all_callbacks_registered(lan_update, layout_update_callback_registered) &&
			all_callbacks_registered(lan_shutdown, layout_shutdown_callback_registered));

	const char *ingame_network_system[] = {
		"InGameChatSystem", "DisconnectControlSystem", "DiplomacySystem",
		"EstablishConnectionsControlSystem", nullptr };
	const char *ingame_network_input[] = {
		"InGameChatInput", "DisconnectControlInput", "DiplomacyInput",
		"EstablishConnectionsControlInput", nullptr };
	append_missing_callback_group(result, "inGameNetworkMenus",
		all_callbacks_registered(
			ingame_network_system, system_callback_registered) &&
			all_callbacks_registered(
				ingame_network_input, input_callback_registered));

	const char *network_popup_system[] = {
		"PopupHostGameSystem", "PopupJoinGameSystem",
		"PopupLadderSelectSystem", nullptr };
	const char *network_popup_input[] = {
		"PopupHostGameInput", "PopupJoinGameInput",
		"PopupLadderSelectInput", nullptr };
	const char *network_popup_init[] = {
		"PopupHostGameInit", "PopupJoinGameInit",
		"PopupLadderSelectInit", nullptr };
	const char *network_popup_update[] = { "PopupHostGameUpdate", nullptr };
	append_missing_callback_group(result, "hostJoinNetworkPopups",
		all_callbacks_registered(network_popup_system, system_callback_registered) &&
			all_callbacks_registered(network_popup_input, input_callback_registered) &&
			all_callbacks_registered(
				network_popup_init, layout_init_callback_registered) &&
			all_callbacks_registered(
				network_popup_update, layout_update_callback_registered));

	const char *online_overlay_system[] = {
		"PopupBuddyNotificationSystem", "WOLBuddyOverlayRCMenuSystem",
		"RCGameDetailsMenuSystem", "GameSpyPlayerInfoOverlaySystem", nullptr };
	const char *online_overlay_input[] = {
		"GameSpyPlayerInfoOverlayInput", nullptr };
	const char *online_overlay_init[] = {
		"WOLBuddyOverlayRCMenuInit", "RCGameDetailsMenuInit",
		"GameSpyPlayerInfoOverlayInit", nullptr };
	const char *online_overlay_update[] = {
		"GameSpyPlayerInfoOverlayUpdate", nullptr };
	const char *online_overlay_shutdown[] = {
		"GameSpyPlayerInfoOverlayShutdown", nullptr };
	append_missing_callback_group(result, "onlineOverlayAndBattleHonors",
		all_callbacks_registered(online_overlay_system, system_callback_registered) &&
			all_callbacks_registered(online_overlay_input, input_callback_registered) &&
			all_callbacks_registered(
				online_overlay_init, layout_init_callback_registered) &&
			all_callbacks_registered(
				online_overlay_update, layout_update_callback_registered) &&
			all_callbacks_registered(
				online_overlay_shutdown, layout_shutdown_callback_registered));

	const char *wol_system[] = {
		"WOLLadderScreenSystem", "WOLLoginMenuSystem", "WOLLocaleSelectSystem",
		"WOLLobbyMenuSystem", "WOLGameSetupMenuSystem",
		"WOLMapSelectMenuSystem", "WOLBuddyOverlaySystem",
		"WOLMessageWindowSystem", "WOLQuickMatchMenuSystem",
		"WOLWelcomeMenuSystem", "WOLStatusMenuSystem",
		"WOLQMScoreScreenSystem", "WOLCustomScoreScreenSystem", nullptr };
	const char *wol_input[] = {
		"WOLLadderScreenInput", "WOLLoginMenuInput", "WOLLocaleSelectInput",
		"WOLLobbyMenuInput", "WOLGameSetupMenuInput",
		"WOLMapSelectMenuInput", "WOLBuddyOverlayInput",
		"WOLMessageWindowInput", "WOLQuickMatchMenuInput",
		"WOLWelcomeMenuInput", "WOLStatusMenuInput",
		"WOLQMScoreScreenInput", "WOLCustomScoreScreenInput", nullptr };
	const char *wol_init[] = {
		"WOLLadderScreenInit", "WOLLoginMenuInit", "WOLLocaleSelectInit",
		"WOLLobbyMenuInit", "WOLGameSetupMenuInit",
		"WOLMapSelectMenuInit", "WOLBuddyOverlayInit",
		"WOLMessageWindowInit", "WOLQuickMatchMenuInit",
		"WOLWelcomeMenuInit", "WOLStatusMenuInit",
		"WOLQMScoreScreenInit", "WOLCustomScoreScreenInit", nullptr };
	const char *wol_update[] = {
		"WOLLadderScreenUpdate", "WOLLoginMenuUpdate", "WOLLocaleSelectUpdate",
		"WOLLobbyMenuUpdate", "WOLGameSetupMenuUpdate",
		"WOLMapSelectMenuUpdate", "WOLBuddyOverlayUpdate",
		"WOLMessageWindowUpdate", "WOLQuickMatchMenuUpdate",
		"WOLWelcomeMenuUpdate", "WOLStatusMenuUpdate",
		"WOLQMScoreScreenUpdate", "WOLCustomScoreScreenUpdate", nullptr };
	const char *wol_shutdown[] = {
		"WOLLadderScreenShutdown", "WOLLoginMenuShutdown",
		"WOLLocaleSelectShutdown", "WOLLobbyMenuShutdown",
		"WOLGameSetupMenuShutdown", "WOLMapSelectMenuShutdown",
		"WOLBuddyOverlayShutdown", "WOLMessageWindowShutdown",
		"WOLQuickMatchMenuShutdown", "WOLWelcomeMenuShutdown",
		"WOLStatusMenuShutdown", "WOLQMScoreScreenShutdown",
		"WOLCustomScoreScreenShutdown", nullptr };
	append_missing_callback_group(result, "wolShellMenus",
		all_callbacks_registered(wol_system, system_callback_registered) &&
			all_callbacks_registered(wol_input, input_callback_registered) &&
			all_callbacks_registered(wol_init, layout_init_callback_registered) &&
			all_callbacks_registered(wol_update, layout_update_callback_registered) &&
			all_callbacks_registered(wol_shutdown, layout_shutdown_callback_registered));

	const char *network_direct_system[] = {
		"NetworkDirectConnectSystem", nullptr };
	const char *network_direct_input[] = {
		"NetworkDirectConnectInput", nullptr };
	const char *network_direct_init[] = {
		"NetworkDirectConnectInit", nullptr };
	const char *network_direct_update[] = {
		"NetworkDirectConnectUpdate", nullptr };
	const char *network_direct_shutdown[] = {
		"NetworkDirectConnectShutdown", nullptr };
	append_missing_callback_group(result, "networkDirectConnect",
		all_callbacks_registered(
			network_direct_system, system_callback_registered) &&
			all_callbacks_registered(
				network_direct_input, input_callback_registered) &&
			all_callbacks_registered(
				network_direct_init, layout_init_callback_registered) &&
			all_callbacks_registered(
				network_direct_update, layout_update_callback_registered) &&
			all_callbacks_registered(
				network_direct_shutdown, layout_shutdown_callback_registered));

	const char *download_system[] = { "DownloadMenuSystem", nullptr };
	const char *download_input[] = { "DownloadMenuInput", nullptr };
	const char *download_init[] = { "DownloadMenuInit", nullptr };
	const char *download_update[] = { "DownloadMenuUpdate", nullptr };
	const char *download_shutdown[] = { "DownloadMenuShutdown", nullptr };
	append_missing_callback_group(result, "downloadMenu",
		all_callbacks_registered(download_system, system_callback_registered) &&
			all_callbacks_registered(download_input, input_callback_registered) &&
			all_callbacks_registered(download_init, layout_init_callback_registered) &&
			all_callbacks_registered(
				download_update, layout_update_callback_registered) &&
			all_callbacks_registered(
				download_shutdown, layout_shutdown_callback_registered));

	if (result.missing_callback_group_count != 0) {
		result.missing_callback_groups_json += "}";
	}
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
		result.extended_message_box_system_lookup &&
		result.game_window_default_input_lookup &&
		result.gadget_push_button_input_lookup &&
		result.gadget_static_text_input_lookup &&
		result.game_window_default_tooltip_lookup;
}

bool base_widget_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return base_core_lookup_state_ready(result) &&
		result.game_window_block_input_lookup &&
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
		result.keyboard_options_menu_system_lookup &&
		result.keyboard_options_menu_input_lookup &&
		result.keyboard_options_menu_init_lookup &&
		result.keyboard_options_menu_update_lookup &&
		result.keyboard_options_menu_shutdown_lookup &&
		result.popup_replay_shutdown_lookup;
}

bool motd_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.motd_system_lookup;
}

bool shell_menu_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.main_menu_system_lookup &&
		result.credits_menu_system_lookup &&
		result.skirmish_game_options_menu_system_lookup &&
		result.single_player_menu_system_lookup &&
		result.difficulty_select_system_lookup &&
		result.main_menu_input_lookup &&
		result.credits_menu_input_lookup &&
		result.skirmish_game_options_menu_input_lookup &&
		result.single_player_menu_input_lookup &&
		result.difficulty_select_input_lookup &&
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

bool options_menu_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.options_menu_system_lookup &&
		result.options_menu_input_lookup &&
		result.options_menu_init_lookup &&
		result.options_menu_update_lookup &&
		result.options_menu_shutdown_lookup;
}

bool skirmish_map_select_menu_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.skirmish_map_select_menu_system_lookup &&
		result.skirmish_map_select_menu_input_lookup &&
		result.skirmish_map_select_menu_init_lookup &&
		result.skirmish_map_select_menu_update_lookup &&
		result.skirmish_map_select_menu_shutdown_lookup;
}

bool challenge_menu_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.challenge_menu_system_lookup &&
		result.challenge_menu_input_lookup &&
		result.challenge_menu_init_lookup &&
		result.challenge_menu_update_lookup &&
		result.challenge_menu_shutdown_lookup;
}

bool popup_communicator_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.popup_communicator_system_lookup &&
		result.popup_communicator_input_lookup &&
		result.popup_communicator_init_lookup &&
		result.popup_communicator_shutdown_lookup;
}

bool map_select_menu_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.map_select_menu_system_lookup &&
		result.map_select_menu_input_lookup &&
		result.map_select_menu_init_lookup &&
		result.map_select_menu_update_lookup &&
		result.map_select_menu_shutdown_lookup;
}

bool replay_menu_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.replay_menu_system_lookup &&
		result.replay_menu_input_lookup &&
		result.replay_menu_init_lookup &&
		result.replay_menu_update_lookup &&
		result.replay_menu_shutdown_lookup;
}

bool popup_replay_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.popup_replay_input_lookup &&
		result.popup_replay_init_lookup &&
		result.popup_replay_shutdown_lookup;
}

bool in_game_popup_message_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.in_game_popup_message_system_lookup &&
		result.in_game_popup_message_input_lookup &&
		result.in_game_popup_message_init_lookup;
}

bool control_bar_input_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.control_bar_input_lookup;
}

bool beacon_window_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.beacon_window_input_lookup;
}

bool replay_control_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.replay_control_system_lookup &&
		result.replay_control_input_lookup;
}

bool control_bar_observer_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.control_bar_observer_system_lookup;
}

bool game_info_window_lookup_state_ready(
	const FunctionLexiconRuntimeProbeResult &result)
{
	return result.game_info_window_system_lookup &&
		result.game_info_window_init_lookup;
}

bool idle_worker_lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return result.idle_worker_system_lookup;
}

bool base_layout_callback_graph_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	// The linked runtime currently proves a shell-menu subset plus the
	// game-window block input, MOTD, options-menu, skirmish-map-select, quit-menu,
	// challenge-menu, popup-communicator, in-game popup-message, idle-worker, control-bar
	// input/command/HUD, generals-experience points, beacon-window,
	// replay-control, control-bar observer, map-select, replay-menu,
	// popup-replay modal callbacks, and game-info-window callback owners.
	// Full ownership requires the remaining callback owner groups reported in
	// missingCallbackGroups.
	return result.missing_callback_group_count == 0;
}

bool lookup_state_ready(const FunctionLexiconRuntimeProbeResult &result)
{
	return base_widget_lookup_state_ready(result) &&
		base_layout_lookup_state_ready(result) &&
		motd_lookup_state_ready(result) &&
		shell_menu_lookup_state_ready(result) &&
		options_menu_lookup_state_ready(result) &&
		skirmish_map_select_menu_lookup_state_ready(result) &&
		challenge_menu_lookup_state_ready(result) &&
		popup_communicator_lookup_state_ready(result) &&
		map_select_menu_lookup_state_ready(result) &&
		replay_menu_lookup_state_ready(result) &&
		popup_replay_lookup_state_ready(result) &&
		in_game_popup_message_lookup_state_ready(result) &&
		control_bar_input_lookup_state_ready(result) &&
		beacon_window_lookup_state_ready(result) &&
		replay_control_lookup_state_ready(result) &&
		control_bar_observer_lookup_state_ready(result) &&
		game_info_window_lookup_state_ready(result) &&
		idle_worker_lookup_state_ready(result) &&
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
	if (!motd_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_layout_representative_runtime_owned";
		result.next_required = "originalFunctionLexiconShellMenuCallbacks";
		return;
	}
	if (!shell_menu_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_layout_partial_runtime_owned";
		result.next_required = "originalFunctionLexiconShellMenuCallbacks";
		return;
	}
	if (!options_menu_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_shell_menu_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!skirmish_map_select_menu_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_options_menu_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!in_game_popup_message_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_extended_message_box_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!idle_worker_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_ingame_popup_message_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!beacon_window_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_idle_worker_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!replay_control_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_beacon_window_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!control_bar_observer_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_replay_control_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!challenge_menu_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_control_bar_observer_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!popup_communicator_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_challenge_menu_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!map_select_menu_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_popup_communicator_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!game_info_window_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_map_select_menu_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!replay_menu_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_game_info_window_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!popup_replay_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_replay_menu_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!control_bar_input_lookup_state_ready(result)) {
		result.status = "base_function_lexicon_popup_replay_modal_runtime_owned";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
		return;
	}
	if (!base_layout_callback_graph_ready(result)) {
		result.status =
			"base_function_lexicon_remaining_callback_groups_deferred";
		result.next_required = "originalFunctionLexiconRemainingCallbackOwners";
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
			// callback subset; the remaining owner groups stay partial.
			g_function_lexicon->init();
			g_function_lexicon_init_ran = true;
		} else {
			TheFunctionLexicon = g_function_lexicon;
			result.constructed = true;
			result.the_function_lexicon_owned = true;
		}
		repair_gameplay_callback_owners();
		result.init_ran = g_function_lexicon_init_ran;
		capture_table_state(result);
		capture_lookup_state(result);
		capture_missing_callback_groups(result);
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

void wasm_function_lexicon_repair_gameplay_callback_owners()
{
	repair_gameplay_callback_owners();
}

extern "C" void cnc_port_function_lexicon_after_reset()
{
	repair_gameplay_callback_owners();
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

	static char json[24000];
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
		"\"missingCallbackGroupCount\":%u,"
		"\"missingCallbackGroups\":%s,"
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
		"\"extendedMessageBoxSystem\":%s,"
		"\"imeCandidateWindowSystem\":%s,"
		"\"motdSystem\":%s,"
		"\"mainMenuSystem\":%s,"
		"\"optionsMenuSystem\":%s,"
		"\"creditsMenuSystem\":%s,"
		"\"skirmishGameOptionsMenuSystem\":%s,"
		"\"skirmishMapSelectMenuSystem\":%s,"
		"\"singlePlayerMenuSystem\":%s,"
		"\"quitMenuSystem\":%s,"
		"\"challengeMenuSystem\":%s,"
		"\"popupCommunicatorSystem\":%s,"
		"\"mapSelectMenuSystem\":%s,"
		"\"replayMenuSystem\":%s,"
		"\"difficultySelectSystem\":%s,"
		"\"keyboardOptionsMenuSystem\":%s,"
		"\"inGamePopupMessageSystem\":%s,"
		"\"idleWorkerSystem\":%s,"
		"\"replayControlSystem\":%s,"
		"\"controlBarObserverSystem\":%s,"
		"\"controlBarSystem\":%s,"
		"\"generalsExpPointsSystem\":%s,"
		"\"gameInfoWindowSystem\":%s,"
		"\"gameWindowDefaultInput\":%s,"
		"\"gameWinBlockInput\":%s,"
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
		"\"optionsMenuInput\":%s,"
		"\"creditsMenuInput\":%s,"
		"\"skirmishGameOptionsMenuInput\":%s,"
		"\"skirmishMapSelectMenuInput\":%s,"
		"\"singlePlayerMenuInput\":%s,"
		"\"challengeMenuInput\":%s,"
		"\"popupCommunicatorInput\":%s,"
		"\"mapSelectMenuInput\":%s,"
		"\"replayMenuInput\":%s,"
		"\"popupReplayInput\":%s,"
		"\"difficultySelectInput\":%s,"
		"\"keyboardOptionsMenuInput\":%s,"
		"\"inGamePopupMessageInput\":%s,"
		"\"controlBarInput\":%s,"
		"\"leftHUDInput\":%s,"
		"\"generalsExpPointsInput\":%s,"
		"\"beaconWindowInput\":%s,"
		"\"replayControlInput\":%s,"
		"\"gameWindowDefaultTooltip\":%s,"
		"\"imeCandidateMainDraw\":%s,"
		"\"imeCandidateTextAreaDraw\":%s,"
		"\"mainMenuInit\":%s,"
		"\"optionsMenuInit\":%s,"
		"\"creditsMenuInit\":%s,"
		"\"skirmishGameOptionsMenuInit\":%s,"
		"\"skirmishMapSelectMenuInit\":%s,"
		"\"singlePlayerMenuInit\":%s,"
		"\"challengeMenuInit\":%s,"
		"\"popupCommunicatorInit\":%s,"
		"\"mapSelectMenuInit\":%s,"
		"\"replayMenuInit\":%s,"
		"\"gameInfoWindowInit\":%s,"
		"\"popupReplayInit\":%s,"
		"\"difficultySelectInit\":%s,"
		"\"keyboardOptionsMenuInit\":%s,"
		"\"inGamePopupMessageInit\":%s,"
		"\"mainMenuUpdate\":%s,"
		"\"optionsMenuUpdate\":%s,"
		"\"creditsMenuUpdate\":%s,"
		"\"skirmishGameOptionsMenuUpdate\":%s,"
		"\"skirmishMapSelectMenuUpdate\":%s,"
		"\"singlePlayerMenuUpdate\":%s,"
		"\"challengeMenuUpdate\":%s,"
		"\"mapSelectMenuUpdate\":%s,"
		"\"replayMenuUpdate\":%s,"
		"\"keyboardOptionsMenuUpdate\":%s,"
		"\"mainMenuShutdown\":%s,"
		"\"optionsMenuShutdown\":%s,"
		"\"creditsMenuShutdown\":%s,"
		"\"skirmishGameOptionsMenuShutdown\":%s,"
		"\"skirmishMapSelectMenuShutdown\":%s,"
		"\"singlePlayerMenuShutdown\":%s,"
		"\"challengeMenuShutdown\":%s,"
		"\"popupCommunicatorShutdown\":%s,"
		"\"mapSelectMenuShutdown\":%s,"
		"\"replayMenuShutdown\":%s,"
		"\"keyboardOptionsMenuShutdown\":%s,"
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
		state.missing_callback_group_count,
		state.missing_callback_groups_json.c_str(),
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
		json_bool(state.extended_message_box_system_lookup),
		json_bool(state.ime_candidate_window_system_lookup),
		json_bool(state.motd_system_lookup),
		json_bool(state.main_menu_system_lookup),
		json_bool(state.options_menu_system_lookup),
		json_bool(state.credits_menu_system_lookup),
		json_bool(state.skirmish_game_options_menu_system_lookup),
		json_bool(state.skirmish_map_select_menu_system_lookup),
		json_bool(state.single_player_menu_system_lookup),
		json_bool(state.quit_menu_system_lookup),
		json_bool(state.challenge_menu_system_lookup),
		json_bool(state.popup_communicator_system_lookup),
		json_bool(state.map_select_menu_system_lookup),
		json_bool(state.replay_menu_system_lookup),
		json_bool(state.difficulty_select_system_lookup),
		json_bool(state.keyboard_options_menu_system_lookup),
		json_bool(state.in_game_popup_message_system_lookup),
		json_bool(state.idle_worker_system_lookup),
		json_bool(state.replay_control_system_lookup),
		json_bool(state.control_bar_observer_system_lookup),
		json_bool(state.control_bar_system_lookup),
		json_bool(state.generals_exp_points_system_lookup),
		json_bool(state.game_info_window_system_lookup),
		json_bool(state.game_window_default_input_lookup),
		json_bool(state.game_window_block_input_lookup),
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
		json_bool(state.options_menu_input_lookup),
		json_bool(state.credits_menu_input_lookup),
		json_bool(state.skirmish_game_options_menu_input_lookup),
		json_bool(state.skirmish_map_select_menu_input_lookup),
		json_bool(state.single_player_menu_input_lookup),
		json_bool(state.challenge_menu_input_lookup),
		json_bool(state.popup_communicator_input_lookup),
		json_bool(state.map_select_menu_input_lookup),
		json_bool(state.replay_menu_input_lookup),
		json_bool(state.popup_replay_input_lookup),
		json_bool(state.difficulty_select_input_lookup),
		json_bool(state.keyboard_options_menu_input_lookup),
		json_bool(state.in_game_popup_message_input_lookup),
		json_bool(state.control_bar_input_lookup),
		json_bool(state.left_hud_input_lookup),
		json_bool(state.generals_exp_points_input_lookup),
		json_bool(state.beacon_window_input_lookup),
		json_bool(state.replay_control_input_lookup),
		json_bool(state.game_window_default_tooltip_lookup),
		json_bool(state.ime_candidate_main_draw_lookup),
		json_bool(state.ime_candidate_text_area_draw_lookup),
		json_bool(state.main_menu_init_lookup),
		json_bool(state.options_menu_init_lookup),
		json_bool(state.credits_menu_init_lookup),
		json_bool(state.skirmish_game_options_menu_init_lookup),
		json_bool(state.skirmish_map_select_menu_init_lookup),
		json_bool(state.single_player_menu_init_lookup),
		json_bool(state.challenge_menu_init_lookup),
		json_bool(state.popup_communicator_init_lookup),
		json_bool(state.map_select_menu_init_lookup),
		json_bool(state.replay_menu_init_lookup),
		json_bool(state.game_info_window_init_lookup),
		json_bool(state.popup_replay_init_lookup),
		json_bool(state.difficulty_select_init_lookup),
		json_bool(state.keyboard_options_menu_init_lookup),
		json_bool(state.in_game_popup_message_init_lookup),
		json_bool(state.main_menu_update_lookup),
		json_bool(state.options_menu_update_lookup),
		json_bool(state.credits_menu_update_lookup),
		json_bool(state.skirmish_game_options_menu_update_lookup),
		json_bool(state.skirmish_map_select_menu_update_lookup),
		json_bool(state.single_player_menu_update_lookup),
		json_bool(state.challenge_menu_update_lookup),
		json_bool(state.map_select_menu_update_lookup),
		json_bool(state.replay_menu_update_lookup),
		json_bool(state.keyboard_options_menu_update_lookup),
		json_bool(state.main_menu_shutdown_lookup),
		json_bool(state.options_menu_shutdown_lookup),
		json_bool(state.credits_menu_shutdown_lookup),
		json_bool(state.skirmish_game_options_menu_shutdown_lookup),
		json_bool(state.skirmish_map_select_menu_shutdown_lookup),
		json_bool(state.single_player_menu_shutdown_lookup),
		json_bool(state.challenge_menu_shutdown_lookup),
		json_bool(state.popup_communicator_shutdown_lookup),
		json_bool(state.map_select_menu_shutdown_lookup),
		json_bool(state.replay_menu_shutdown_lookup),
		json_bool(state.keyboard_options_menu_shutdown_lookup),
		json_bool(state.popup_replay_shutdown_lookup),
		json_bool(state.w3d_gadget_push_button_draw_lookup),
		json_bool(state.w3d_game_window_default_draw_lookup),
		json_bool(state.w3d_main_menu_init_lookup));
	return json;
}
