// Data-layer control surface for remote agents.
//
// This file deliberately exposes engine-owned primitives only.  Transport,
// sessions, REST resource naming, caching, and higher-level conveniences live
// outside the engine in the browser adapter and Go bridge.

#include <emscripten/emscripten.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <limits>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "Common/BuildAssistant.h"
#include "Common/Energy.h"
#include "Common/MessageStream.h"
#include "Common/Money.h"
#include "Common/Player.h"
#include "Common/PlayerList.h"
#include "Common/SpecialPower.h"
#include "Common/Team.h"
#include "Common/ThingFactory.h"
#include "Common/ThingTemplate.h"
#include "Common/Upgrade.h"
#include "GameClient/ControlBar.h"
#include "GameClient/Drawable.h"
#include "GameClient/InGameUI.h"
#include "GameClient/TerrainVisual.h"
#include "Common/UnicodeString.h"
#include "GameClient/Gadget.h"
#include "GameClient/GadgetComboBox.h"
#include "GameClient/GadgetListBox.h"
#include "GameClient/GadgetTextEntry.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/View.h"
#include "GameClient/WinInstanceData.h"
#include "GameLogic/AI.h"
#include "GameLogic/AIPathfind.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/Object.h"
#include "GameLogic/PartitionManager.h"
#include "GameLogic/TerrainLogic.h"
#include "GameLogic/VictoryConditions.h"
#include "GameLogic/Weapon.h"
#include "GameLogic/Module/AIUpdate.h"
#include "GameLogic/Module/BodyModule.h"
#include "GameLogic/Module/ContainModule.h"
#include "GameLogic/Module/PhysicsUpdate.h"
#include "GameLogic/Module/ProductionUpdate.h"
#include "GameLogic/Module/SpecialPowerModule.h"
#include "GameLogic/Module/StealthUpdate.h"
#include "GameNetwork/GameInfo.h"

namespace {

constexpr const char *kProtocol = "cnc-agent/1";
constexpr Int kMaxWindows = WIN_MAX_WINDOWS;
constexpr Int kMaxSnapshotRowsPerList = 64;
constexpr Int kMaxListColumns = 16;
constexpr Int kMaxListQueryRows = 128;
constexpr std::size_t kMaxTextCodepoints = 1024;
constexpr std::size_t kMaxInputCodepoints = 4096;
constexpr Int kMaxWorldObjects = 4096;
constexpr Int kMaxOrderObjects = 128;
constexpr Int kMaxTerrainSamplesPerAxis = 128;
constexpr Int kMaxTerrainSamples = 16384;

std::uint64_t g_snapshot_id = 0;
std::uint64_t g_world_snapshot_id = 0;
std::uint64_t g_terrain_query_id = 0;
std::unordered_map<ObjectID, std::uint64_t> g_public_object_ids;
std::uint64_t g_next_public_object_id = 1;
UnsignedInt g_last_world_frame = 0;
bool g_have_world_snapshot = false;
bool g_last_world_playable = false;
Player *g_agent_perspective_player = nullptr;

Player *agent_perspective_player()
{
	if (g_agent_perspective_player != nullptr) return g_agent_perspective_player;
	return ThePlayerList != nullptr ? ThePlayerList->getLocalPlayer() : nullptr;
}

bool controlled_by_agent_player(const Object *object)
{
	return object != nullptr && object->getControllingPlayer() == agent_perspective_player();
}

GameMessage *append_agent_message(GameMessage::Type type)
{
	GameMessage *message = TheMessageStream->appendMessage(type);
	Player *player = agent_perspective_player();
	if (message != nullptr && player != nullptr) {
		message->friend_setPlayerIndex(player->getPlayerIndex());
	}
	return message;
}

class ScopedAgentPerspective
{
public:
	explicit ScopedAgentPerspective(Player *player)
		: m_previous(g_agent_perspective_player)
	{
		g_agent_perspective_player = player;
	}

	~ScopedAgentPerspective()
	{
		g_agent_perspective_player = m_previous;
	}

private:
	Player *m_previous;
};

void append_utf8_codepoint(std::string &out, std::uint32_t codepoint)
{
	if (codepoint <= 0x7f) {
		out.push_back(static_cast<char>(codepoint));
	} else if (codepoint <= 0x7ff) {
		out.push_back(static_cast<char>(0xc0 | (codepoint >> 6)));
		out.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
	} else if (codepoint <= 0xffff) {
		out.push_back(static_cast<char>(0xe0 | (codepoint >> 12)));
		out.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
		out.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
	} else {
		out.push_back(static_cast<char>(0xf0 | (codepoint >> 18)));
		out.push_back(static_cast<char>(0x80 | ((codepoint >> 12) & 0x3f)));
		out.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3f)));
		out.push_back(static_cast<char>(0x80 | (codepoint & 0x3f)));
	}
}

std::string unicode_to_utf8(const UnicodeString &value, bool *truncated = nullptr)
{
	std::string out;
	const Int length = value.getLength();
	std::size_t emitted = 0;
	bool did_truncate = false;
	for (Int i = 0; i < length; ++i) {
		if (emitted >= kMaxTextCodepoints) {
			did_truncate = true;
			break;
		}

		std::uint32_t codepoint = static_cast<std::uint32_t>(value.getCharAt(i));
		if (codepoint >= 0xd800 && codepoint <= 0xdbff && i + 1 < length) {
			const std::uint32_t low = static_cast<std::uint32_t>(value.getCharAt(i + 1));
			if (low >= 0xdc00 && low <= 0xdfff) {
				codepoint = 0x10000 + ((codepoint - 0xd800) << 10) + (low - 0xdc00);
				++i;
			}
		}
		if ((codepoint >= 0xd800 && codepoint <= 0xdfff) || codepoint > 0x10ffff) {
			codepoint = 0xfffd;
		}
		append_utf8_codepoint(out, codepoint);
		++emitted;
	}
	if (truncated != nullptr) {
		*truncated = did_truncate;
	}
	return out;
}

void append_json_string(std::string &out, const std::string &value)
{
	static const char hex[] = "0123456789abcdef";
	out.push_back('"');
	for (unsigned char ch : value) {
		switch (ch) {
			case '"': out += "\\\""; break;
			case '\\': out += "\\\\"; break;
			case '\b': out += "\\b"; break;
			case '\f': out += "\\f"; break;
			case '\n': out += "\\n"; break;
			case '\r': out += "\\r"; break;
			case '\t': out += "\\t"; break;
			default:
				if (ch < 0x20) {
					out += "\\u00";
					out.push_back(hex[(ch >> 4) & 0xf]);
					out.push_back(hex[ch & 0xf]);
				} else {
					out.push_back(static_cast<char>(ch));
				}
		}
	}
	out.push_back('"');
}

void append_json_string(std::string &out, const char *value)
{
	append_json_string(out, std::string(value != nullptr ? value : ""));
}

const char *window_name(GameWindow *window)
{
	WinInstanceData *instance = window != nullptr ? window->winGetInstanceData() : nullptr;
	return instance != nullptr && instance->m_decoratedNameString.isNotEmpty()
		? instance->m_decoratedNameString.str() : "";
}

const char *window_kind(UnsignedInt style)
{
	if ((style & GWS_COMBO_BOX) != 0) return "comboBox";
	if ((style & GWS_SCROLL_LISTBOX) != 0) return "listBox";
	if ((style & GWS_ENTRY_FIELD) != 0) return "textEntry";
	if ((style & GWS_RADIO_BUTTON) != 0) return "radioButton";
	if ((style & GWS_CHECK_BOX) != 0) return "checkBox";
	if ((style & GWS_PUSH_BUTTON) != 0) return "button";
	if ((style & GWS_VERT_SLIDER) != 0) return "verticalSlider";
	if ((style & GWS_HORZ_SLIDER) != 0) return "horizontalSlider";
	if ((style & GWS_TAB_CONTROL) != 0) return "tabControl";
	if ((style & GWS_TAB_PANE) != 0) return "tabPane";
	if ((style & GWS_STATIC_TEXT) != 0) return "text";
	if ((style & GWS_PROGRESS_BAR) != 0) return "progress";
	return "window";
}

bool window_is_interactive(GameWindow *window)
{
	if (TheWindowManager == nullptr || window == nullptr) {
		return false;
	}
	const UnsignedInt status = window->winGetStatus();
	return !TheWindowManager->isHidden(window)
		&& TheWindowManager->isEnabled(window)
		&& (status & (WIN_STATUS_NO_INPUT | WIN_STATUS_DESTROYED)) == 0;
}

void append_actions(std::string &json, UnsignedInt style, bool interactive)
{
	json += ",\"actions\":[";
	bool first = true;
	auto add = [&](const char *name) {
		if (!first) json += ",";
		first = false;
		append_json_string(json, name);
	};
	if (interactive) add("activate");
	if (interactive && (style & GWS_ENTRY_FIELD) != 0) add("setText");
	if (interactive && (style & (GWS_SCROLL_LISTBOX | GWS_COMBO_BOX)) != 0) {
		add("selectIndex");
		add("listItems");
	}
	json += "]";
}

void append_list_rows(
	std::string &json,
	GameWindow *list_box,
	Int offset,
	Int limit)
{
	const Int row_count = GadgetListBoxGetNumEntries(list_box);
	const Int column_count = (std::min)(GadgetListBoxGetNumColumns(list_box), kMaxListColumns);
	const Int start = (std::max)(0, (std::min)(offset, row_count));
	const Int end = (std::max)(start,
		(std::min)(row_count, start + (std::max)(0, limit)));
	json += "[";
	for (Int row = start; row < end; ++row) {
		if (row != start) json += ",";
		json += "{\"index\":" + std::to_string(row) + ",\"cells\":[";
		for (Int column = 0; column < column_count; ++column) {
			if (column != 0) json += ",";
			append_json_string(json, unicode_to_utf8(GadgetListBoxGetText(list_box, row, column)));
		}
		json += "]}";
	}
	json += "]";
}

void append_window(std::string &json, GameWindow *window)
{
	WinInstanceData *instance = window->winGetInstanceData();
	const UnsignedInt status = window->winGetStatus();
	const UnsignedInt style = window->winGetStyle();
	const UnsignedInt state = instance != nullptr ? instance->getState() : 0;
	const bool hidden = TheWindowManager->isHidden(window);
	const bool enabled = TheWindowManager->isEnabled(window);
	const bool interactive = window_is_interactive(window);
	Int x = 0;
	Int y = 0;
	Int width = 0;
	Int height = 0;
	window->winGetScreenPosition(&x, &y);
	window->winGetSize(&width, &height);

	json += "{\"id\":" + std::to_string(window->winGetWindowId());
	json += ",\"name\":";
	append_json_string(json, window_name(window));
	json += ",\"parentId\":";
	json += window->winGetParent() != nullptr
		? std::to_string(window->winGetParent()->winGetWindowId()) : "null";
	json += ",\"kind\":";
	append_json_string(json, window_kind(style));
	json += ",\"rect\":{\"x\":" + std::to_string(x)
		+ ",\"y\":" + std::to_string(y)
		+ ",\"width\":" + std::to_string(width)
		+ ",\"height\":" + std::to_string(height) + "}";
	json += ",\"visible\":";
	json += hidden ? "false" : "true";
	json += ",\"enabled\":";
	json += enabled ? "true" : "false";
	json += ",\"interactive\":";
	json += interactive ? "true" : "false";
	json += ",\"selected\":";
	json += (state & WIN_STATE_SELECTED) != 0 ? "true" : "false";
	json += ",\"hilited\":";
	json += (state & WIN_STATE_HILITED) != 0 ? "true" : "false";
	json += ",\"status\":" + std::to_string(status);
	json += ",\"style\":" + std::to_string(style);

	bool text_truncated = false;
	const UnicodeString text = instance != nullptr
		? instance->getText() : UnicodeString::TheEmptyString;
	json += ",\"text\":";
	append_json_string(json, unicode_to_utf8(text, &text_truncated));
	json += ",\"textTruncated\":";
	json += text_truncated ? "true" : "false";
	json += ",\"tooltip\":";
	append_json_string(json, unicode_to_utf8(instance != nullptr
		? instance->getTooltipText() : UnicodeString::TheEmptyString));

	if ((style & GWS_ENTRY_FIELD) != 0) {
		json += ",\"value\":";
		append_json_string(json, unicode_to_utf8(GadgetTextEntryGetText(window)));
	}
	if ((style & GWS_SCROLL_LISTBOX) != 0) {
		const Int row_count = GadgetListBoxGetNumEntries(window);
		const Int column_count = GadgetListBoxGetNumColumns(window);
		Int selected = -1;
		GadgetListBoxGetSelected(window, &selected);
		const Int visible_start = (std::max)(0, GadgetListBoxGetTopVisibleEntry(window));
		const Int visible_end = (std::max)(visible_start,
			(std::min)(row_count, GadgetListBoxGetBottomVisibleEntry(window) + 1));
		const Int visible_count = (std::min)(kMaxSnapshotRowsPerList,
			(std::max)(0, visible_end - visible_start));
		json += ",\"list\":{\"rowCount\":" + std::to_string(row_count);
		json += ",\"columnCount\":" + std::to_string(column_count);
		json += ",\"selectedIndex\":" + std::to_string(selected);
		json += ",\"visibleOffset\":" + std::to_string(visible_start);
		json += ",\"visibleLimit\":" + std::to_string(visible_count);
		json += ",\"rows\":";
		append_list_rows(json, window, visible_start, visible_count);
		json += "}";
	}
	if ((style & GWS_COMBO_BOX) != 0) {
		Int selected = -1;
		GadgetComboBoxGetSelectedPos(window, &selected);
		json += ",\"comboBox\":{\"itemCount\":"
			+ std::to_string(GadgetComboBoxGetLength(window));
		json += ",\"selectedIndex\":" + std::to_string(selected);
		json += ",\"value\":";
		append_json_string(json, unicode_to_utf8(GadgetComboBoxGetText(window)));
		json += "}";
	}
	append_actions(json, style, interactive);
	json += "}";
}

enum class WindowVisibilityPass
{
	VISIBLE,
	HIDDEN,
};

void append_window_tree_pass(
	std::string &json,
	GameWindow *window,
	WindowVisibilityPass pass,
	Int &visited,
	Int &emitted,
	bool &first,
	bool &truncated)
{
	for (GameWindow *current = window; current != nullptr; current = current->winGetNext()) {
		++visited;
		const bool hidden = TheWindowManager->isHidden(current);
		const bool should_emit = pass == WindowVisibilityPass::VISIBLE ? !hidden : hidden;
		if (should_emit) {
			if (emitted >= kMaxWindows) {
				truncated = true;
				return;
			}
			if (!first) json += ",";
			first = false;
			append_window(json, current);
			++emitted;
		}
		if (current->winGetChild() != nullptr
			&& (pass == WindowVisibilityPass::HIDDEN || !hidden)) {
			append_window_tree_pass(json, current->winGetChild(), pass,
				visited, emitted, first, truncated);
			if (truncated) return;
		}
	}
}

GameWindow *resolve_window(Int window_id, const char *expected_name, std::string &error)
{
	if (TheWindowManager == nullptr) {
		error = "window manager not ready";
		return nullptr;
	}
	GameWindow *window = TheWindowManager->winGetWindowFromId(nullptr, window_id);
	if (window == nullptr) {
		error = "window not found";
		return nullptr;
	}
	if (expected_name != nullptr && expected_name[0] != '\0'
		&& std::string(window_name(window)) != expected_name) {
		error = "window identity changed";
		return nullptr;
	}
	return window;
}

bool decode_utf8(
	const char *input,
	std::vector<WideChar> &output,
	std::string &error)
{
	output.clear();
	const unsigned char *cursor = reinterpret_cast<const unsigned char *>(input != nullptr ? input : "");
	std::size_t codepoints = 0;
	while (*cursor != 0) {
		std::uint32_t codepoint = 0;
		std::size_t continuation = 0;
		const unsigned char lead = *cursor++;
		if (lead <= 0x7f) {
			codepoint = lead;
		} else if (lead >= 0xc2 && lead <= 0xdf) {
			codepoint = lead & 0x1f;
			continuation = 1;
		} else if (lead >= 0xe0 && lead <= 0xef) {
			codepoint = lead & 0x0f;
			continuation = 2;
		} else if (lead >= 0xf0 && lead <= 0xf4) {
			codepoint = lead & 0x07;
			continuation = 3;
		} else {
			error = "text is not valid UTF-8";
			return false;
		}
		for (std::size_t i = 0; i < continuation; ++i) {
			const unsigned char next = *cursor++;
			if ((next & 0xc0) != 0x80) {
				error = "text is not valid UTF-8";
				return false;
			}
			codepoint = (codepoint << 6) | (next & 0x3f);
		}
		if ((continuation == 2 && codepoint < 0x800)
			|| (continuation == 3 && codepoint < 0x10000)
			|| (codepoint >= 0xd800 && codepoint <= 0xdfff)
			|| codepoint > 0x10ffff) {
			error = "text is not valid UTF-8";
			return false;
		}
		if (++codepoints > kMaxInputCodepoints) {
			error = "text exceeds the 4096 codepoint limit";
			return false;
		}
		if (sizeof(WideChar) == 2 && codepoint > 0xffff) {
			codepoint -= 0x10000;
			output.push_back(static_cast<WideChar>(0xd800 + (codepoint >> 10)));
			output.push_back(static_cast<WideChar>(0xdc00 + (codepoint & 0x3ff)));
		} else {
			output.push_back(static_cast<WideChar>(codepoint));
		}
	}
	output.push_back(static_cast<WideChar>(0));
	return true;
}

bool validate_entry_text(
	GameWindow *window,
	const std::vector<WideChar> &value,
	std::string &error)
{
	EntryData *entry = window != nullptr
		? static_cast<EntryData *>(window->winGetUserData()) : nullptr;
	if (entry == nullptr) {
		error = "text entry data is unavailable";
		return false;
	}
	const std::size_t code_units = value.empty() ? 0 : value.size() - 1;
	if ((entry->maxTextLen <= 0 && code_units != 0)
		|| (entry->maxTextLen > 0
			&& code_units >= static_cast<std::size_t>(entry->maxTextLen))) {
		error = "text exceeds the entry field limit";
		return false;
	}
	for (std::size_t i = 0; i < code_units; ++i) {
		const WideChar ch = value[i];
		if (ch < static_cast<WideChar>(0x20) || ch == static_cast<WideChar>(0x7f)) {
			error = "text contains a control character";
			return false;
		}
		if (entry->numericalOnly && TheWindowManager->winIsDigit(ch) == 0) {
			error = "text entry accepts digits only";
			return false;
		}
		if (entry->alphaNumericalOnly && TheWindowManager->winIsAlNum(ch) == 0) {
			error = "text entry accepts letters and digits only";
			return false;
		}
		if (entry->aSCIIOnly && TheWindowManager->winIsAscii(ch) == 0) {
			error = "text entry accepts ASCII only";
			return false;
		}
	}
	return true;
}

void begin_result(std::string &json, bool ok)
{
	json = "{\"ok\":";
	json += ok ? "true" : "false";
	json += ",\"protocol\":";
	append_json_string(json, kProtocol);
}

void append_error(std::string &json, const char *code, const std::string &message)
{
	json += ",\"error\":{\"code\":";
	append_json_string(json, code);
	json += ",\"message\":";
	append_json_string(json, message);
	json += "}";
}

GameWindow *list_box_for(GameWindow *window)
{
	if (window == nullptr) return nullptr;
	const UnsignedInt style = window->winGetStyle();
	if ((style & GWS_SCROLL_LISTBOX) != 0) return window;
	if ((style & GWS_COMBO_BOX) != 0) return GadgetComboBoxGetListBox(window);
	return nullptr;
}

void append_real(std::string &json, Real value)
{
	if (!std::isfinite(value)) {
		json += "null";
		return;
	}
	char buffer[48];
	std::snprintf(buffer, sizeof(buffer), "%.3f", static_cast<double>(value));
	json += buffer;
}

void append_coord(std::string &json, const Coord3D &value)
{
	json += "{\"x\":";
	append_real(json, value.x);
	json += ",\"y\":";
	append_real(json, value.y);
	json += ",\"z\":";
	append_real(json, value.z);
	json += "}";
}

void append_coord_array(std::string &json, const Coord3D &value)
{
	json += "[";
	append_real(json, value.x);
	json += ",";
	append_real(json, value.y);
	json += ",";
	append_real(json, value.z);
	json += "]";
}

const char *game_mode_name(Int mode)
{
	switch (mode) {
		case GAME_SINGLE_PLAYER: return "singlePlayer";
		case GAME_LAN: return "lan";
		case GAME_SKIRMISH: return "skirmish";
		case GAME_REPLAY: return "replay";
		case GAME_SHELL: return "shell";
		case GAME_INTERNET: return "internet";
		case GAME_NONE: return "none";
		default: return "unknown";
	}
}

const char *player_type_name(PlayerType type)
{
	switch (type) {
		case PLAYER_HUMAN: return "human";
		case PLAYER_COMPUTER: return "computer";
		default: return "unknown";
	}
}

const char *relationship_name(Relationship relationship)
{
	switch (relationship) {
		case ALLIES: return "allies";
		case ENEMIES: return "enemies";
		case NEUTRAL: return "neutral";
		default: return "unknown";
	}
}

const char *object_shroud_name(ObjectShroudStatus status)
{
	switch (status) {
		case OBJECTSHROUD_CLEAR: return "clear";
		case OBJECTSHROUD_PARTIAL_CLEAR: return "partial";
		case OBJECTSHROUD_FOGGED: return "fogged";
		case OBJECTSHROUD_SHROUDED: return "shrouded";
		case OBJECTSHROUD_INVALID:
		case OBJECTSHROUD_INVALID_BUT_PREVIOUS_VALID:
		default: return "invalid";
	}
}

bool point_in_camera(const Coord3D &position, ICoord2D *screen = nullptr)
{
	if (TheTacticalView == nullptr) return false;
	ICoord2D projected = {0, 0};
	if (TheTacticalView->worldToScreenTriReturn(&position, &projected)
		!= View::WTS_INSIDE_FRUSTUM) {
		return false;
	}
	Int origin_x = 0;
	Int origin_y = 0;
	TheTacticalView->getOrigin(&origin_x, &origin_y);
	const bool inside = projected.x >= origin_x && projected.y >= origin_y
		&& projected.x < origin_x + TheTacticalView->getWidth()
		&& projected.y < origin_y + TheTacticalView->getHeight();
	if (inside && screen != nullptr) *screen = projected;
	return inside;
}

Relationship relationship_to_local(const Player *player, const Player *local_player)
{
	if (player == nullptr || local_player == nullptr || player->getDefaultTeam() == nullptr) {
		return NEUTRAL;
	}
	return local_player->getRelationship(player->getDefaultTeam());
}

bool is_observable_object(
	Object *object,
	Player *perspective_player,
	ObjectShroudStatus &shroud,
	ICoord2D &screen,
	bool &in_camera)
{
	if (object == nullptr || perspective_player == nullptr || ThePartitionManager == nullptr) return false;
	shroud = object->getShroudedStatus(perspective_player->getPlayerIndex());
	if (shroud != OBJECTSHROUD_CLEAR && shroud != OBJECTSHROUD_PARTIAL_CLEAR) return false;

	Drawable *drawable = object->getDrawable();
	const bool perspective_controlled = object->getControllingPlayer() == perspective_player;
	if (drawable != nullptr) {
		StealthLookType stealth_look = STEALTHLOOK_NONE;
		StealthUpdate *stealth = object->getStealth();
		if (stealth != nullptr) {
			stealth_look = stealth->getStealthLookForPlayer(object, perspective_player);
		} else if (ThePlayerList != nullptr
			&& perspective_player == ThePlayerList->getLocalPlayer()) {
			stealth_look = drawable->getStealthLook();
		}
		if (stealth_look == STEALTHLOOK_INVISIBLE) return false;
		if (drawable->isDrawableExplicitlyHidden() && !perspective_controlled) return false;
		if (ThePlayerList != nullptr
			&& perspective_player == ThePlayerList->getLocalPlayer()
			&& drawable->isDrawableEffectivelyHidden() && !perspective_controlled) {
			return false;
		}
	} else if (!perspective_controlled) {
		// Logic-only enemy objects are not a client-visible observation.
		return false;
	}

	in_camera = point_in_camera(*object->getPosition(), &screen);
	return true;
}

std::uint64_t public_object_id(const Object *object)
{
	if (object == nullptr) return 0;
	const ObjectID engine_id = object->getID();
	auto [entry, inserted] = g_public_object_ids.emplace(engine_id, 0);
	if (inserted) entry->second = g_next_public_object_id++;
	return entry->second;
}

void begin_world_identity_scope(UnsignedInt frame, bool playable)
{
	if (!g_have_world_snapshot || frame < g_last_world_frame
		|| (playable && !g_last_world_playable)) {
		g_public_object_ids.clear();
		g_next_public_object_id = 1;
	}
	g_have_world_snapshot = true;
	g_last_world_frame = frame;
	g_last_world_playable = playable;
}

Object *resolve_public_object(Int public_id)
{
	if (public_id <= 0 || TheGameLogic == nullptr) return nullptr;
	for (const auto &entry : g_public_object_ids) {
		if (entry.second == static_cast<std::uint64_t>(public_id)) {
			return TheGameLogic->findObjectByID(entry.first);
		}
	}
	return nullptr;
}

bool parse_public_object_ids(
	const char *encoded,
	std::vector<Object *> &objects,
	std::string &error)
{
	objects.clear();
	if (encoded == nullptr || encoded[0] == '\0') {
		error = "objectIds must contain at least one observed object ID";
		return false;
	}
	std::unordered_set<Int> seen;
	const char *cursor = encoded;
	while (*cursor != '\0') {
		if (*cursor < '0' || *cursor > '9') {
			error = "objectIds must be a comma-separated list of positive integers";
			return false;
		}
		char *end = nullptr;
		const unsigned long parsed = std::strtoul(cursor, &end, 10);
		if (end == cursor || parsed == 0
			|| parsed > static_cast<unsigned long>((std::numeric_limits<Int>::max)())) {
			error = "objectIds contains an out-of-range object ID";
			return false;
		}
		const Int public_id = static_cast<Int>(parsed);
		if (!seen.insert(public_id).second) {
			error = "objectIds must not contain duplicates";
			return false;
		}
		Object *object = resolve_public_object(public_id);
		if (object == nullptr) {
			error = "an object ID is stale or was not issued by a world snapshot";
			return false;
		}
		if (!controlled_by_agent_player(object) || !object->isSelectable()
			|| object->getDrawable() == nullptr || object->getContainedBy() != nullptr) {
			error = "every ordered object must be a visible, selectable, locally controlled world object";
			return false;
		}
		objects.push_back(object);
		if (static_cast<Int>(objects.size()) > kMaxOrderObjects) {
			error = "objectIds may contain at most 128 objects";
			return false;
		}
		cursor = end;
		if (*cursor == '\0') break;
		if (*cursor != ',' || cursor[1] == '\0') {
			error = "objectIds must be a comma-separated list of positive integers";
			return false;
		}
		++cursor;
	}
	return !objects.empty();
}

bool gameplay_actions_ready(std::string &error)
{
	if (TheGameLogic == nullptr || ThePlayerList == nullptr || TheMessageStream == nullptr
		|| TheInGameUI == nullptr || TheTerrainLogic == nullptr) {
		error = "gameplay command subsystems are not ready";
		return false;
	}
	const Int mode = TheGameLogic->getGameMode();
	if (mode != GAME_SINGLE_PLAYER && mode != GAME_LAN
		&& mode != GAME_SKIRMISH && mode != GAME_INTERNET) {
		error = "gameplay commands require an active playable match";
		return false;
	}
	if (agent_perspective_player() == nullptr) {
		error = "agent player is not ready";
		return false;
	}
	return true;
}

bool world_position(Real x, Real y, Coord3D &position, std::string &error)
{
	if (!std::isfinite(x) || !std::isfinite(y) || TheTerrainLogic == nullptr) {
		error = "position coordinates must be finite";
		return false;
	}
	Region3D extent;
	TheTerrainLogic->getExtent(&extent);
	if (x < extent.lo.x || x > extent.hi.x || y < extent.lo.y || y > extent.hi.y) {
		error = "position must be inside the active map extent";
		return false;
	}
	position.x = x;
	position.y = y;
	position.z = TheTerrainLogic->getGroundHeight(x, y);
	return true;
}

void post_selection(const std::vector<Object *> &objects)
{
	Player *player = agent_perspective_player();
	const bool local_player = ThePlayerList != nullptr
		&& player == ThePlayerList->getLocalPlayer();
	if (local_player) TheInGameUI->deselectAllDrawables(FALSE);
	GameMessage *selection = append_agent_message(
		GameMessage::MSG_CREATE_SELECTED_GROUP_NO_SOUND);
	selection->appendBooleanArgument(TRUE);
	for (Object *object : objects) {
		if (local_player) TheInGameUI->selectDrawable(object->getDrawable());
		selection->appendObjectIDArgument(object->getID());
	}
}

Object *resolve_observable_target(Int public_id, Player *local_player, std::string &error)
{
	Object *target = resolve_public_object(public_id);
	ObjectShroudStatus shroud = OBJECTSHROUD_INVALID;
	ICoord2D screen = {0, 0};
	bool in_camera = false;
	if (target == nullptr
		|| !is_observable_object(target, local_player, shroud, screen, in_camera)) {
		error = "targetId is stale or is not currently observable";
		return nullptr;
	}
	return target;
}

void append_kind_tags(std::string &json, const ThingTemplate *thing_template)
{
	json += "[";
	bool first = true;
	auto add = [&](KindOfType kind, const char *name) {
		if (thing_template == nullptr || !thing_template->isKindOf(kind)) return;
		if (!first) json += ",";
		first = false;
		append_json_string(json, name);
	};
	add(KINDOF_STRUCTURE, "structure");
	add(KINDOF_INFANTRY, "infantry");
	add(KINDOF_VEHICLE, "vehicle");
	add(KINDOF_AIRCRAFT, "aircraft");
	add(KINDOF_DOZER, "builder");
	add(KINDOF_HARVESTER, "harvester");
	add(KINDOF_COMMANDCENTER, "commandCenter");
	add(KINDOF_CAN_ATTACK, "combat");
	add(KINDOF_FS_POWER, "power");
	add(KINDOF_FS_FACTORY, "factory");
	add(KINDOF_FS_BARRACKS, "barracks");
	add(KINDOF_FS_WARFACTORY, "warFactory");
	add(KINDOF_FS_AIRFIELD, "airfield");
	add(KINDOF_FS_SUPPLY_CENTER, "supplyCenter");
	add(KINDOF_FS_BASE_DEFENSE, "baseDefense");
	add(KINDOF_FS_TECHNOLOGY, "technology");
	add(KINDOF_FS_ADVANCED_TECH, "advancedTechnology");
	add(KINDOF_FS_SUPERWEAPON, "superweapon");
	add(KINDOF_CASH_GENERATOR, "cashGenerator");
	add(KINDOF_SUPPLY_SOURCE, "supplySource");
	add(KINDOF_PROJECTILE, "projectile");
	add(KINDOF_BRIDGE, "bridge");
	add(KINDOF_MINE, "mine");
	json += "]";
}

const char *command_type_name(GUICommandType type)
{
	switch (type) {
		case GUI_COMMAND_DOZER_CONSTRUCT: return "construct";
		case GUI_COMMAND_DOZER_CONSTRUCT_CANCEL: return "cancelConstruction";
		case GUI_COMMAND_UNIT_BUILD: return "produce";
		case GUI_COMMAND_CANCEL_UNIT_BUILD: return "cancelProduction";
		case GUI_COMMAND_PLAYER_UPGRADE: return "playerUpgrade";
		case GUI_COMMAND_OBJECT_UPGRADE: return "objectUpgrade";
		case GUI_COMMAND_CANCEL_UPGRADE: return "cancelUpgrade";
		case GUI_COMMAND_ATTACK_MOVE: return "attackMove";
		case GUI_COMMAND_GUARD: return "guard";
		case GUI_COMMAND_GUARD_WITHOUT_PURSUIT: return "guardWithoutPursuit";
		case GUI_COMMAND_GUARD_FLYING_UNITS_ONLY: return "guardFlyingOnly";
		case GUI_COMMAND_STOP: return "stop";
		case GUI_COMMAND_WAYPOINTS: return "waypoints";
		case GUI_COMMAND_EXIT_CONTAINER: return "exitContainer";
		case GUI_COMMAND_EVACUATE: return "evacuate";
		case GUI_COMMAND_EXECUTE_RAILED_TRANSPORT: return "executeRailedTransport";
		case GUI_COMMAND_BEACON_DELETE: return "deleteBeacon";
		case GUI_COMMAND_SET_RALLY_POINT: return "setRallyPoint";
		case GUI_COMMAND_SELL: return "sell";
		case GUI_COMMAND_FIRE_WEAPON: return "fireWeapon";
		case GUI_COMMAND_SPECIAL_POWER: return "specialPower";
		case GUI_COMMAND_PURCHASE_SCIENCE: return "purchaseScience";
		case GUI_COMMAND_HACK_INTERNET: return "hackInternet";
		case GUI_COMMAND_TOGGLE_OVERCHARGE: return "toggleOvercharge";
		case GUI_COMMAND_COMBATDROP: return "combatDrop";
		case GUI_COMMAND_SWITCH_WEAPON: return "switchWeapon";
		case GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT: return "shortcutSpecialPower";
		case GUI_COMMAND_SPECIAL_POWER_CONSTRUCT: return "specialPowerConstruct";
		case GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT: return "shortcutSpecialPowerConstruct";
		case GUI_COMMAND_SELECT_ALL_UNITS_OF_TYPE: return "selectAllOfType";
		case GUI_COMMAND_NONE:
		default: return "unsupported";
	}
}

const char *can_make_name(CanMakeType type)
{
	switch (type) {
		case CANMAKE_OK: return "available";
		case CANMAKE_NO_PREREQ: return "missingPrerequisite";
		case CANMAKE_NO_MONEY: return "insufficientFunds";
		case CANMAKE_FACTORY_IS_DISABLED: return "producerDisabled";
		case CANMAKE_QUEUE_FULL: return "queueFull";
		case CANMAKE_PARKING_PLACES_FULL: return "parkingFull";
		case CANMAKE_MAXED_OUT_FOR_PLAYER: return "playerLimit";
		default: return "unavailable";
	}
}

Object *special_power_execution_source(
	const CommandButton *command,
	Object *source,
	Player *local_player)
{
	if (command == nullptr || command->getSpecialPowerTemplate() == nullptr) return nullptr;
	const GUICommandType type = command->getCommandType();
	if (type != GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT
		&& type != GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT) {
		return source;
	}
	return local_player != nullptr
		? local_player->findMostReadyShortcutSpecialPowerOfType(
			command->getSpecialPowerTemplate()->getSpecialPowerType())
		: nullptr;
}

void append_command(std::string &json, const CommandButton *command, Object *source, Int slot)
{
	const GUICommandType type = command->getCommandType();
	const UnsignedInt options = command->getOptions();
	json += "{\"name\":";
	append_json_string(json, command->getName().str());
	json += ",\"slot\":" + std::to_string(slot);
	json += ",\"type\":";
	append_json_string(json, command_type_name(type));
	json += ",\"options\":" + std::to_string(options);
	json += ",\"needsPosition\":";
	json += BitTest(options, NEED_TARGET_POS) ? "true" : "false";
	json += ",\"needsObject\":";
	json += BitTest(options, COMMAND_OPTION_NEED_OBJECT_TARGET) ? "true" : "false";

	const ThingTemplate *product = command->getThingTemplate();
	json += ",\"product\":";
	if (product == nullptr) {
		json += "null";
	} else {
		json += "{\"template\":";
		append_json_string(json, product->getName().str());
		json += ",\"categories\":";
		append_kind_tags(json, product);
		Player *player = source->getControllingPlayer();
		json += ",\"cost\":" + std::to_string(product->calcCostToBuild(player));
		json += ",\"buildFrames\":" + std::to_string(product->calcTimeToBuild(player));
		json += ",\"availability\":";
		append_json_string(json, TheBuildAssistant != nullptr
			? can_make_name(TheBuildAssistant->canMakeUnit(source, product)) : "unavailable");
		json += "}";
	}

	const UpgradeTemplate *upgrade = command->getUpgradeTemplate();
	json += ",\"upgrade\":";
	if (upgrade == nullptr) {
		json += "null";
	} else {
		Player *player = source->getControllingPlayer();
		json += "{\"name\":";
		append_json_string(json, upgrade->getUpgradeName().str());
		json += ",\"cost\":" + std::to_string(upgrade->calcCostToBuild(player));
		json += ",\"buildFrames\":" + std::to_string(upgrade->calcTimeToBuild(player));
		json += ",\"complete\":";
		json += (upgrade->getUpgradeType() == UPGRADE_TYPE_PLAYER
			? player->hasUpgradeComplete(upgrade) : source->hasUpgrade(upgrade)) ? "true" : "false";
		json += "}";
	}

	const SpecialPowerTemplate *special = command->getSpecialPowerTemplate();
	json += ",\"specialPower\":";
	if (special == nullptr) {
		json += "null";
	} else {
		Object *power_source = special_power_execution_source(
			command, source, source->getControllingPlayer());
		SpecialPowerModuleInterface *module = power_source != nullptr
			? power_source->getSpecialPowerModule(special) : nullptr;
		json += "{\"name\":";
		append_json_string(json, special->getName().str());
		json += ",\"sourceId\":";
		json += power_source != nullptr
			? std::to_string(public_object_id(power_source)) : "null";
		json += ",\"ready\":";
		json += module != nullptr && module->isReady() && command->isReady(power_source)
			? "true" : "false";
		json += ",\"percentReady\":";
		if (module != nullptr) append_real(json, module->getPercentReady());
		else json += "null";
		json += ",\"readyFrame\":";
		json += module != nullptr ? std::to_string(module->getReadyFrame()) : "null";
		json += "}";
	}
	json += "}";
}

void append_commands(std::string &json, Object *object)
{
	json += "[";
	if (TheControlBar != nullptr) {
		const CommandSet *set = TheControlBar->findCommandSet(object->getCommandSetString());
		bool first = true;
		if (set != nullptr) {
			for (Int i = 0; i < MAX_COMMANDS_PER_SET; ++i) {
				const CommandButton *command = set->getCommandButton(i);
				if (command == nullptr || BitTest(command->getOptions(), SCRIPT_ONLY)) continue;
				if (!first) json += ",";
				first = false;
				append_command(json, command, object, i + 1);
			}
		}
	}
	json += "]";
}

void append_command_definition(
	std::string &json,
	const CommandButton *command,
	Player *player,
	Int slot)
{
	const GUICommandType type = command->getCommandType();
	const UnsignedInt options = command->getOptions();
	json += "{\"name\":";
	append_json_string(json, command->getName().str());
	json += ",\"slot\":" + std::to_string(slot);
	json += ",\"type\":";
	append_json_string(json, command_type_name(type));
	json += ",\"options\":" + std::to_string(options);
	json += ",\"needsPosition\":";
	json += BitTest(options, NEED_TARGET_POS) ? "true" : "false";
	json += ",\"needsObject\":";
	json += BitTest(options, COMMAND_OPTION_NEED_OBJECT_TARGET) ? "true" : "false";

	const ThingTemplate *product = command->getThingTemplate();
	json += ",\"product\":";
	if (product == nullptr) {
		json += "null";
	} else {
		json += "{\"template\":";
		append_json_string(json, product->getName().str());
		json += ",\"categories\":";
		append_kind_tags(json, product);
		json += ",\"cost\":" + std::to_string(product->calcCostToBuild(player));
		json += ",\"buildFrames\":" + std::to_string(product->calcTimeToBuild(player));
		json += "}";
	}

	const UpgradeTemplate *upgrade = command->getUpgradeTemplate();
	json += ",\"upgrade\":";
	if (upgrade == nullptr) {
		json += "null";
	} else {
		json += "{\"name\":";
		append_json_string(json, upgrade->getUpgradeName().str());
		json += ",\"cost\":" + std::to_string(upgrade->calcCostToBuild(player));
		json += ",\"buildFrames\":" + std::to_string(upgrade->calcTimeToBuild(player));
		json += "}";
	}

	const SpecialPowerTemplate *special = command->getSpecialPowerTemplate();
	json += ",\"specialPower\":";
	if (special == nullptr) json += "null";
	else append_json_string(json, special->getName().str());
	json += "}";
}

void append_command_states(std::string &json, Object *object)
{
	json += "{";
	bool first = true;
	const CommandSet *set = TheControlBar != nullptr
		? TheControlBar->findCommandSet(object->getCommandSetString()) : nullptr;
	if (set != nullptr) {
		for (Int i = 0; i < MAX_COMMANDS_PER_SET; ++i) {
			const CommandButton *command = set->getCommandButton(i);
			if (command == nullptr || BitTest(command->getOptions(), SCRIPT_ONLY)) continue;
			const ThingTemplate *product = command->getThingTemplate();
			const UpgradeTemplate *upgrade = command->getUpgradeTemplate();
			const SpecialPowerTemplate *special = command->getSpecialPowerTemplate();
			if (product == nullptr && upgrade == nullptr && special == nullptr) continue;
			if (!first) json += ",";
			first = false;
			append_json_string(json, command->getName().str());
			json += ":{";
			bool first_state = true;
			if (product != nullptr) {
				json += "\"availability\":";
				append_json_string(json, TheBuildAssistant != nullptr
					? can_make_name(TheBuildAssistant->canMakeUnit(object, product)) : "unavailable");
				first_state = false;
			}
			if (upgrade != nullptr) {
				if (!first_state) json += ",";
				json += "\"complete\":";
				Player *player = object->getControllingPlayer();
				json += (upgrade->getUpgradeType() == UPGRADE_TYPE_PLAYER
					? player->hasUpgradeComplete(upgrade) : object->hasUpgrade(upgrade)) ? "true" : "false";
				first_state = false;
			}
			if (special != nullptr) {
				Object *power_source = special_power_execution_source(
					command, object, object->getControllingPlayer());
				SpecialPowerModuleInterface *module = power_source != nullptr
					? power_source->getSpecialPowerModule(special) : nullptr;
				if (!first_state) json += ",";
				json += "\"sourceId\":";
				json += power_source != nullptr
					? std::to_string(public_object_id(power_source)) : "null";
				json += ",\"ready\":";
				json += module != nullptr && module->isReady() && command->isReady(power_source)
					? "true" : "false";
				json += ",\"percentReady\":";
				if (module != nullptr) append_real(json, module->getPercentReady());
				else json += "null";
				json += ",\"readyFrame\":";
				json += module != nullptr ? std::to_string(module->getReadyFrame()) : "null";
			}
			json += "}";
		}
	}
	json += "}";
}

void append_production_queue(std::string &json, Object *object)
{
	json += "[";
	ProductionUpdateInterface *production = object->getProductionUpdateInterface();
	bool first = true;
	for (const ProductionEntry *entry = production != nullptr ? production->firstProduction() : nullptr;
		entry != nullptr; entry = production->nextProduction(entry)) {
		if (!first) json += ",";
		first = false;
		json += "{\"id\":" + std::to_string(entry->getProductionID());
		json += ",\"progress\":";
		append_real(json, entry->getPercentComplete());
		const ThingTemplate *product = entry->getProductionObject();
		const UpgradeTemplate *upgrade = entry->getProductionUpgrade();
		json += ",\"type\":";
		append_json_string(json, product != nullptr ? "unit" : "upgrade");
		json += ",\"name\":";
		append_json_string(json, product != nullptr ? product->getName().str()
			: (upgrade != nullptr ? upgrade->getUpgradeName().str() : ""));
		json += "}";
	}
	json += "]";
}

const char *weapon_slot_name(WeaponSlotType slot)
{
	switch (slot) {
		case PRIMARY_WEAPON: return "primary";
		case SECONDARY_WEAPON: return "secondary";
		case TERTIARY_WEAPON: return "tertiary";
		default: return "unknown";
	}
}

void append_weapon_targets(std::string &json, Int anti_mask)
{
	json += "[";
	bool first = true;
	auto add = [&](WeaponAntiMaskType flag, const char *name) {
		if ((anti_mask & flag) == 0) return;
		if (!first) json += ",";
		first = false;
		append_json_string(json, name);
	};
	add(WEAPON_ANTI_GROUND, "ground");
	add(WEAPON_ANTI_AIRBORNE_VEHICLE, "airborneVehicle");
	add(WEAPON_ANTI_AIRBORNE_INFANTRY, "airborneInfantry");
	add(WEAPON_ANTI_PROJECTILE, "projectile");
	add(WEAPON_ANTI_SMALL_MISSILE, "smallMissile");
	add(WEAPON_ANTI_BALLISTIC_MISSILE, "ballisticMissile");
	add(WEAPON_ANTI_MINE, "mine");
	add(WEAPON_ANTI_PARACHUTE, "parachute");
	json += "]";
}

void append_weapons(std::string &json, Object *object)
{
	json += "[";
	bool first = true;
	for (Int slot_index = 0; slot_index < WEAPONSLOT_COUNT; ++slot_index) {
		const WeaponSlotType slot = static_cast<WeaponSlotType>(slot_index);
		Weapon *weapon = object->getWeaponInWeaponSlot(slot);
		if (weapon == nullptr || weapon->getTemplate() == nullptr) continue;
		const WeaponTemplate *weapon_template = weapon->getTemplate();
		WeaponBonus base_bonus;
		if (!first) json += ",";
		first = false;
		json += "{\"slot\":";
		append_json_string(json, weapon_slot_name(slot));
		json += ",\"name\":";
		append_json_string(json, weapon->getName().str());
		json += ",\"range\":";
		append_real(json, weapon->getAttackRange(object));
		json += ",\"minimumRange\":";
		append_real(json, weapon_template->getMinimumAttackRange());
		json += ",\"baseDamage\":";
		append_real(json, weapon_template->getPrimaryDamage(base_bonus));
		json += ",\"damageRadius\":";
		append_real(json, weapon_template->getPrimaryDamageRadius(base_bonus));
		json += ",\"damageType\":";
		const char *damage_name = DamageTypeFlags::getNameFromSingleBit(weapon->getDamageType());
		append_json_string(json, damage_name != nullptr ? damage_name : "UNKNOWN");
		json += ",\"targets\":";
		append_weapon_targets(json, weapon->getAntiMask());
		json += ",\"clipSize\":" + std::to_string(weapon->getClipSize());
		json += ",\"ammo\":" + std::to_string(weapon->getRemainingAmmo());
		json += ",\"reloadFrames\":" + std::to_string(weapon->getClipReloadTime(object));
		json += ",\"readyPercent\":";
		append_real(json, weapon->getPercentReadyToFire());
		json += "}";
	}
	json += "]";
}

bool is_orderable(const Object *object)
{
	return controlled_by_agent_player(object) && object->isSelectable()
		&& object->getDrawable() != nullptr && object->getContainedBy() == nullptr;
}

void append_containment(std::string &json, Object *object)
{
	Object *container = object->getContainedBy();
	json += "{\"containedBy\":";
	json += container != nullptr ? std::to_string(public_object_id(container)) : "null";
	json += ",\"canFireWhileContained\":";
	json += container != nullptr && container->getContain() != nullptr
		&& container->getContain()->isPassengerAllowedToFire(object->getID()) ? "true" : "false";
	json += ",\"capacity\":";
	ContainModuleInterface *contain = object->getContain();
	json += contain != nullptr ? std::to_string(contain->getContainMax()) : "null";
	json += ",\"passengers\":[";
	bool first = true;
	const ContainedItemsList *items = contain != nullptr ? contain->getContainedItemsList() : nullptr;
	if (items != nullptr) {
		for (Object *passenger : *items) {
			if (!controlled_by_agent_player(passenger)) continue;
			if (!first) json += ",";
			first = false;
			json += std::to_string(public_object_id(passenger));
		}
	}
	json += "]}";
}

void append_local_capabilities(std::string &json, Object *object)
{
	json += "{\"selectable\":";
	json += object->isSelectable() ? "true" : "false";
	json += ",\"orderable\":";
	json += is_orderable(object) ? "true" : "false";
	json += ",\"mobile\":";
	json += object->isMobile() ? "true" : "false";
	json += ",\"attack\":";
	json += object->isAbleToAttack() ? "true" : "false";
	json += ",\"weaponRange\":";
	append_real(json, object->getLargestWeaponRange());
	json += ",\"visionRange\":";
	append_real(json, object->getVisionRange());
	json += ",\"weapons\":";
	append_weapons(json, object);
	json += ",\"containment\":";
	append_containment(json, object);
	json += ",\"production\":";
	json += object->getProductionUpdateInterface() != nullptr ? "true" : "false";
	json += ",\"commandSet\":";
	append_json_string(json, object->getCommandSetString().str());
	json += ",\"commands\":";
	append_commands(json, object);
	json += ",\"productionQueue\":";
	append_production_queue(json, object);
	json += "}";
}

void append_catalog_local_capabilities(std::string &json, Object *object)
{
	json += "{\"selectable\":";
	json += object->isSelectable() ? "true" : "false";
	json += ",\"orderable\":";
	json += is_orderable(object) ? "true" : "false";
	json += ",\"mobile\":";
	json += object->isMobile() ? "true" : "false";
	json += ",\"attack\":";
	json += object->isAbleToAttack() ? "true" : "false";
	json += ",\"weaponRange\":";
	append_real(json, object->getLargestWeaponRange());
	json += ",\"visionRange\":";
	append_real(json, object->getVisionRange());
	json += ",\"weapons\":";
	append_weapons(json, object);
	json += ",\"containment\":";
	append_containment(json, object);
	json += ",\"production\":";
	json += object->getProductionUpdateInterface() != nullptr ? "true" : "false";
	json += ",\"commandSet\":";
	append_json_string(json, object->getCommandSetString().str());
	json += ",\"commandState\":";
	append_command_states(json, object);
	json += ",\"productionQueue\":";
	append_production_queue(json, object);
	json += "}";
}

void append_catalog_capabilities(std::string &json, Object *object, bool disguised)
{
	if (disguised) {
		json += "null";
		return;
	}
	if (controlled_by_agent_player(object)) {
		append_catalog_local_capabilities(json, object);
		return;
	}
	json += "{\"selectable\":false,\"orderable\":false,\"mobile\":";
	json += object->isMobile() ? "true" : "false";
	json += ",\"attack\":";
	json += object->isAbleToAttack() ? "true" : "false";
	json += ",\"weaponRange\":";
	append_real(json, object->getLargestWeaponRange());
	json += ",\"weapons\":";
	append_weapons(json, object);
	json += "}";
}

const CommandButton *find_source_command(
	Object *source,
	const char *command_name,
	std::string &error)
{
	if (!controlled_by_agent_player(source) || source->getDrawable() == nullptr
		|| source->getContainedBy() != nullptr) {
		error = "sourceId must name a visible, locally controlled world object";
		return nullptr;
	}
	if (command_name == nullptr || command_name[0] == '\0' || TheControlBar == nullptr) {
		error = "command must name a command in the source object's current command set";
		return nullptr;
	}
	const CommandSet *set = TheControlBar->findCommandSet(source->getCommandSetString());
	if (set == nullptr) {
		error = "source object has no active command set";
		return nullptr;
	}
	for (Int i = 0; i < MAX_COMMANDS_PER_SET; ++i) {
		const CommandButton *command = set->getCommandButton(i);
		if (command != nullptr && command->getName() == command_name
			&& !BitTest(command->getOptions(), SCRIPT_ONLY)) {
			return command;
		}
	}
	error = "command is not present in the source object's current command set";
	return nullptr;
}

const char *legal_build_name(LegalBuildCode code)
{
	switch (code) {
		case LBC_OK: return "available";
		case LBC_RESTRICTED_TERRAIN: return "restrictedTerrain";
		case LBC_NOT_FLAT_ENOUGH: return "notFlatEnough";
		case LBC_OBJECTS_IN_THE_WAY: return "objectsInTheWay";
		case LBC_NO_CLEAR_PATH: return "noClearPath";
		case LBC_SHROUD: return "shrouded";
		case LBC_TOO_CLOSE_TO_SUPPLIES: return "tooCloseToSupplies";
		case LBC_GENERIC_FAILURE:
		default: return "illegalLocation";
	}
}

void finish_action_result(
	std::string &json,
	const char *action,
	const std::vector<Object *> &objects)
{
	begin_result(json, true);
	json += ",\"accepted\":true,\"action\":";
	append_json_string(json, action);
	json += ",\"frame\":"
		+ std::to_string(TheGameLogic != nullptr ? TheGameLogic->getFrame() : 0);
	json += ",\"objectIds\":[";
	for (std::size_t i = 0; i < objects.size(); ++i) {
		if (i != 0) json += ",";
		json += std::to_string(public_object_id(objects[i]));
	}
	json += "]}";
}

void append_object_status(std::string &json, const Object *object, bool full_detail)
{
	json += "[";
	bool first = true;
	auto add = [&](ObjectStatusTypes status, const char *name) {
		if (!object->testStatus(status)) return;
		if (!first) json += ",";
		first = false;
		append_json_string(json, name);
	};
	add(OBJECT_STATUS_DESTROYED, "destroyed");
	add(OBJECT_STATUS_UNDER_CONSTRUCTION, "underConstruction");
	add(OBJECT_STATUS_AIRBORNE_TARGET, "airborne");
	add(OBJECT_STATUS_IS_FIRING_WEAPON, "firing");
	add(OBJECT_STATUS_IS_ATTACKING, "attacking");
	add(OBJECT_STATUS_IS_USING_ABILITY, "usingAbility");
	add(OBJECT_STATUS_UNDERGOING_REPAIR, "repairing");
	add(OBJECT_STATUS_SOLD, "sold");
	if (full_detail) {
		add(OBJECT_STATUS_STEALTHED, "stealthed");
		add(OBJECT_STATUS_DETECTED, "detected");
		add(OBJECT_STATUS_IMMOBILE, "immobile");
		add(OBJECT_STATUS_DEPLOYED, "deployed");
		add(OBJECT_STATUS_PARACHUTING, "parachuting");
	}
	json += "]";
}

Player *perceived_owner(
	Object *object,
	Player *perspective_player,
	bool &disguised)
{
	disguised = false;
	Player *owner = object != nullptr ? object->getControllingPlayer() : nullptr;
	if (object == nullptr || perspective_player == nullptr) {
		return owner;
	}
	StealthUpdate *stealth = object->getStealth();
	if (stealth == nullptr
		|| stealth->getStealthLookForPlayer(object, perspective_player)
			!= STEALTHLOOK_DISGUISED_ENEMY
		|| !stealth->isDisguised() || ThePlayerList == nullptr) {
		return owner;
	}
	Player *shown_owner = ThePlayerList->getNthPlayer(stealth->getDisguisedPlayerIndex());
	if (shown_owner != nullptr) {
		disguised = true;
		return shown_owner;
	}
	return owner;
}

const ThingTemplate *perceived_template(Object *object, bool disguised)
{
	if (object == nullptr) return nullptr;
	StealthUpdate *stealth = disguised ? object->getStealth() : nullptr;
	const ThingTemplate *disguise = stealth != nullptr
		? stealth->getDisguisedTemplate() : nullptr;
	return disguise != nullptr ? disguise : object->getTemplate();
}

void append_player(std::string &json, Player *player, Player *local_player)
{
	const bool local = player == local_player;
	const Relationship relationship = local ? ALLIES : relationship_to_local(player, local_player);
	json += "{\"index\":" + std::to_string(player->getPlayerIndex());
	json += ",\"name\":";
	append_json_string(json, unicode_to_utf8(player->getPlayerDisplayName()));
	json += ",\"side\":";
	append_json_string(json, player->getSide().str());
	json += ",\"type\":";
	append_json_string(json, player_type_name(player->getPlayerType()));
	json += ",\"local\":";
	json += local ? "true" : "false";
	json += ",\"relationship\":";
	append_json_string(json, relationship_name(relationship));
	json += ",\"active\":";
	json += player->isPlayerActive() ? "true" : "false";
	json += ",\"observer\":";
	json += player->isPlayerObserver() ? "true" : "false";
	json += ",\"economy\":";
	if (!local) {
		json += "null";
	} else {
		const Energy *energy = player->getEnergy();
		json += "{\"money\":" + std::to_string(player->getMoney()->countMoney());
		json += ",\"powerProduction\":" + std::to_string(energy->getProduction());
		json += ",\"powerConsumption\":" + std::to_string(energy->getConsumption());
		json += ",\"powerSufficient\":";
		json += energy->hasSufficientPower() ? "true" : "false";
		json += ",\"rank\":" + std::to_string(player->getRankLevel());
		json += ",\"skillPoints\":" + std::to_string(player->getSkillPoints());
		json += ",\"sciencePurchasePoints\":"
			+ std::to_string(player->getSciencePurchasePoints()) + "}";
	}
	json += "}";
}

void append_object(std::string &json, Object *object, Player *local_player,
	ObjectShroudStatus shroud, const ICoord2D &screen, bool in_camera)
{
	Drawable *drawable = object->getDrawable();
	bool disguised = false;
	Player *owner = perceived_owner(object, local_player, disguised);
	const Relationship relationship = relationship_to_local(owner, local_player);
	const bool locally_controlled = object->getControllingPlayer() == local_player;
	const ThingTemplate *thing_template = perceived_template(object, disguised);
	const Coord3D *position = object->getPosition();

	json += "{\"id\":" + std::to_string(public_object_id(object));
	json += ",\"template\":";
	append_json_string(json, thing_template != nullptr ? thing_template->getName().str() : "");
	json += ",\"owner\":";
	json += owner != nullptr ? std::to_string(owner->getPlayerIndex()) : "null";
	json += ",\"relationship\":";
	append_json_string(json, relationship_name(relationship));
	json += ",\"position\":";
	append_coord(json, *position);
	json += ",\"orientation\":";
	append_real(json, object->getOrientation());
	json += ",\"screen\":";
	if (in_camera) {
		json += "{\"x\":" + std::to_string(screen.x)
			+ ",\"y\":" + std::to_string(screen.y) + "}";
	} else {
		json += "null";
	}
	json += ",\"shroud\":";
	append_json_string(json, object_shroud_name(shroud));
	json += ",\"selected\":";
	json += drawable != nullptr && ThePlayerList != nullptr
		&& local_player == ThePlayerList->getLocalPlayer() && drawable->isSelected()
		? "true" : "false";
	json += ",\"categories\":";
	append_kind_tags(json, thing_template);
	json += ",\"status\":";
	append_object_status(json, object, locally_controlled && !disguised);

	BodyModuleInterface *body = object->getBodyModule();
	json += ",\"health\":";
	if (body == nullptr) {
		json += "null";
	} else {
		json += "{\"current\":";
		append_real(json, body->getHealth());
		json += ",\"max\":";
		append_real(json, body->getMaxHealth());
		json += "}";
	}
	json += ",\"construction\":";
	append_real(json, object->getConstructionPercent());
	json += ",\"geometry\":{\"radius\":";
	append_real(json, object->getGeometryInfo().getBoundingCircleRadius());
	json += ",\"height\":";
	append_real(json, object->getGeometryInfo().getMaxHeightAbovePosition());
	json += "}";

	json += ",\"capabilities\":";
	if (!locally_controlled || disguised) {
		json += "null";
	} else {
		append_local_capabilities(json, object);
	}

	json += ",\"motion\":";
	PhysicsBehavior *physics = object->getPhysics();
	if (!locally_controlled || physics == nullptr) {
		json += "null";
	} else {
		json += "{\"velocity\":";
		append_coord(json, *physics->getVelocity());
		AIUpdateInterface *ai = object->getAIUpdateInterface();
		json += ",\"ai\":";
		if (ai == nullptr) {
			json += "null";
		} else {
			json += "{\"state\":";
			append_json_string(json, ai->getCurrentStateName().str());
			Object *goal_object = ai->getGoalObject();
			ObjectShroudStatus goal_shroud = OBJECTSHROUD_INVALID;
			ICoord2D goal_screen = {0, 0};
			bool goal_in_camera = false;
			const bool goal_observable = is_observable_object(
				goal_object, local_player, goal_shroud, goal_screen, goal_in_camera);
			json += ",\"goalObjectId\":";
			json += goal_observable ? std::to_string(public_object_id(goal_object)) : "null";
			json += ",\"goalPosition\":";
			const Coord3D *goal_position = ai->getGoalPosition();
			if (goal_position != nullptr) append_coord(json, *goal_position);
			else json += "null";
			json += "}";
		}
		json += "}";
	}

	json += ",\"containedById\":";
	const Object *container = locally_controlled ? object->getContainedBy() : nullptr;
	json += container != nullptr ? std::to_string(public_object_id(container)) : "null";
	json += "}";
}

void append_tactical_object(std::string &json, Object *object, Player *local_player)
{
	bool disguised = false;
	Player *owner = perceived_owner(object, local_player, disguised);
	const ThingTemplate *thing_template = perceived_template(object, disguised);
	json += "{\"id\":" + std::to_string(public_object_id(object));
	json += ",\"template\":";
	append_json_string(json, thing_template != nullptr ? thing_template->getName().str() : "");
	json += ",\"owner\":";
	json += owner != nullptr ? std::to_string(owner->getPlayerIndex()) : "null";
	json += ",\"relationship\":";
	append_json_string(json, relationship_name(relationship_to_local(owner, local_player)));
	json += ",\"position\":";
	append_coord_array(json, *object->getPosition());
	json += ",\"health\":";
	BodyModuleInterface *body = object->getBodyModule();
	if (body == nullptr) {
		json += "null";
	} else {
		json += "[";
		append_real(json, body->getHealth());
		json += ",";
		append_real(json, body->getMaxHealth());
		json += "]";
	}
	json += ",\"construction\":";
	append_real(json, object->getConstructionPercent());
	json += ",\"status\":";
	append_object_status(json, object,
		object->getControllingPlayer() == local_player && !disguised);
	json += "}";
}

void append_template_catalog(std::string &json, const std::vector<Object *> &objects)
{
	json += "{";
	std::unordered_set<std::string> emitted;
	bool first = true;
	for (Object *object : objects) {
		bool disguised = false;
		perceived_owner(object, agent_perspective_player(), disguised);
		const ThingTemplate *thing_template = perceived_template(object, disguised);
		if (thing_template == nullptr) continue;
		const std::string name = thing_template->getName().str();
		if (!emitted.insert(name).second) continue;
		if (!first) json += ",";
		first = false;
		append_json_string(json, name);
		json += ":{\"categories\":";
		append_kind_tags(json, thing_template);
		json += ",\"geometry\":{\"radius\":";
		append_real(json, thing_template->getTemplateGeometryInfo().getBoundingCircleRadius());
		json += ",\"height\":";
		append_real(json, thing_template->getTemplateGeometryInfo().getMaxHeightAbovePosition());
		json += "}}";
	}
	json += "}";
}

void append_command_set_catalog(std::string &json, const std::vector<Object *> &objects)
{
	json += "{";
	std::unordered_set<std::string> emitted;
	bool first_set = true;
	for (Object *object : objects) {
		if (!controlled_by_agent_player(object) || TheControlBar == nullptr) continue;
		const std::string name = object->getCommandSetString().str();
		if (!emitted.insert(name).second) continue;
		const CommandSet *set = TheControlBar->findCommandSet(object->getCommandSetString());
		if (set == nullptr) continue;
		if (!first_set) json += ",";
		first_set = false;
		append_json_string(json, name);
		json += ":[";
		bool first_command = true;
		for (Int i = 0; i < MAX_COMMANDS_PER_SET; ++i) {
			const CommandButton *command = set->getCommandButton(i);
			if (command == nullptr || BitTest(command->getOptions(), SCRIPT_ONLY)) continue;
			if (!first_command) json += ",";
			first_command = false;
			append_command_definition(
				json, command, object->getControllingPlayer(), i + 1);
		}
		json += "]";
	}
	json += "}";
}

void append_capability_catalog(std::string &json, const std::vector<Object *> &objects)
{
	json += "{";
	bool first = true;
	for (Object *object : objects) {
		bool disguised = false;
		perceived_owner(object, agent_perspective_player(), disguised);
		if (!first) json += ",";
		first = false;
		append_json_string(json, std::to_string(public_object_id(object)));
		json += ":";
		append_catalog_capabilities(json, object, disguised);
	}
	json += "}";
}

void collect_classic_ai_catalog(
	Player *player,
	std::vector<std::string> &building_templates,
	std::vector<std::string> &upgrades)
{
	std::unordered_set<std::string> seen_buildings;
	std::unordered_set<std::string> seen_upgrades;
	if (player != nullptr && TheGameLogic != nullptr && TheControlBar != nullptr) {
		for (Object *object = TheGameLogic->getFirstObject();
			object != nullptr; object = object->getNextObject()) {
			if (object->getControllingPlayer() != player) continue;
			const CommandSet *set = TheControlBar->findCommandSet(object->getCommandSetString());
			if (set == nullptr) continue;
			for (Int i = 0; i < MAX_COMMANDS_PER_SET; ++i) {
				const CommandButton *command = set->getCommandButton(i);
				if (command == nullptr || BitTest(command->getOptions(), SCRIPT_ONLY)) continue;
				const ThingTemplate *product = command->getThingTemplate();
				if (command->getCommandType() == GUI_COMMAND_DOZER_CONSTRUCT
					&& product != nullptr && product->isBuildableItem()
					&& player->allowedToBuild(product)
					&& seen_buildings.insert(product->getName().str()).second) {
					building_templates.push_back(product->getName().str());
				}
				const UpgradeTemplate *upgrade = command->getUpgradeTemplate();
				if (upgrade != nullptr && upgrade->getUpgradeType() != UPGRADE_TYPE_OBJECT
					&& seen_upgrades.insert(upgrade->getUpgradeName().str()).second) {
					upgrades.push_back(upgrade->getUpgradeName().str());
				}
			}
		}
	}
	std::sort(building_templates.begin(), building_templates.end());
	std::sort(upgrades.begin(), upgrades.end());
}

void append_classic_ai_catalog(std::string &json, Player *player)
{
	std::vector<std::string> building_templates;
	std::vector<std::string> upgrades;
	collect_classic_ai_catalog(player, building_templates, upgrades);

	json += "{\"directMutationsAvailable\":";
	json += TheGameLogic != nullptr && TheGameLogic->getGameMode() == GAME_SKIRMISH
		? "true" : "false";
	json += ",\"directives\":[\"buildBuilding\",\"buildUpgrade\","
		"\"buildBaseDefense\",\"buildBaseDefenseStructure\",\"buildTeam\","
		"\"recruitTeam\",\"buildBySupplies\",\"hunt\",\"teamDelay\"]";
	json += ",\"availableBuildingTemplates\":[";
	for (std::size_t i = 0; i < building_templates.size(); ++i) {
		if (i != 0) json += ",";
		append_json_string(json, building_templates[i]);
	}
	json += "],\"availableBaseDefenseTemplates\":[";
	bool first_defense = true;
	for (const std::string &name : building_templates) {
		const ThingTemplate *thing = TheThingFactory != nullptr
			? TheThingFactory->findTemplate(AsciiString(name.c_str()), FALSE) : nullptr;
		if (thing == nullptr || !thing->isKindOf(KINDOF_FS_BASE_DEFENSE)) continue;
		if (!first_defense) json += ",";
		first_defense = false;
		append_json_string(json, name);
	}
	json += "],\"availableUpgrades\":[";
	for (std::size_t i = 0; i < upgrades.size(); ++i) {
		if (i != 0) json += ",";
		append_json_string(json, upgrades[i]);
	}
	json += "]";
	json += ",\"teamPrototypes\":[";
	bool first = true;
	const Player::PlayerTeamList *teams = player != nullptr ? player->getPlayerTeams() : nullptr;
	if (teams != nullptr) {
		for (TeamPrototype *team : *teams) {
			if (team == nullptr) continue;
			if (!first) json += ",";
			first = false;
			append_json_string(json, team->getName().str());
		}
	}
	json += "]}";
}

std::string encode_base64(const std::vector<std::uint8_t> &bytes)
{
	static const char alphabet[] =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	std::string encoded;
	encoded.reserve(((bytes.size() + 2) / 3) * 4);
	for (std::size_t i = 0; i < bytes.size(); i += 3) {
		const std::uint32_t a = bytes[i];
		const std::uint32_t b = i + 1 < bytes.size() ? bytes[i + 1] : 0;
		const std::uint32_t c = i + 2 < bytes.size() ? bytes[i + 2] : 0;
		const std::uint32_t value = (a << 16) | (b << 8) | c;
		encoded.push_back(alphabet[(value >> 18) & 0x3f]);
		encoded.push_back(alphabet[(value >> 12) & 0x3f]);
		encoded.push_back(i + 1 < bytes.size() ? alphabet[(value >> 6) & 0x3f] : '=');
		encoded.push_back(i + 2 < bytes.size() ? alphabet[value & 0x3f] : '=');
	}
	return encoded;
}

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_ui_snapshot(Int include_hidden)
{
	static std::string json;
	if (TheWindowManager == nullptr) {
		begin_result(json, false);
		append_error(json, "not_ready", "window manager not ready");
		json += "}";
		return json.c_str();
	}

	begin_result(json, true);
	json += ",\"snapshotId\":" + std::to_string(++g_snapshot_id);
	GameWindow *focus = TheWindowManager->winGetFocus();
	json += ",\"focus\":";
	if (focus == nullptr) {
		json += "null";
	} else {
		json += "{\"id\":" + std::to_string(focus->winGetWindowId()) + ",\"name\":";
		append_json_string(json, window_name(focus));
		json += "}";
	}
	json += ",\"windows\":[";
	Int visited = 0;
	Int emitted = 0;
	bool first = true;
	bool truncated = false;
	append_window_tree_pass(json, TheWindowManager->winGetWindowList(),
		WindowVisibilityPass::VISIBLE, visited, emitted, first, truncated);
	if (include_hidden != 0 && !truncated) {
		// Hidden layouts can contain hundreds of inactive controls. Emit the
		// effective-visible UI first so the bounded response never loses it.
		visited = 0;
		append_window_tree_pass(json, TheWindowManager->winGetWindowList(),
			WindowVisibilityPass::HIDDEN, visited, emitted, first, truncated);
	}
	json += "]";
	json += ",\"windowCount\":" + std::to_string(emitted);
	json += ",\"visitedCount\":" + std::to_string(visited);
	json += ",\"truncated\":";
	json += truncated ? "true" : "false";
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_ui_activate(
	Int window_id,
	const char *expected_name)
{
	static std::string json;
	std::string error;
	GameWindow *window = resolve_window(window_id, expected_name, error);
	if (window == nullptr) {
		begin_result(json, false);
		append_error(json, error == "window identity changed" ? "stale_window" : "not_found", error);
		json += "}";
		return json.c_str();
	}
	if (!window_is_interactive(window)) {
		begin_result(json, false);
		append_error(json, "not_interactive", "window is hidden, disabled, destroyed, or does not accept input");
		json += "}";
		return json.c_str();
	}

	Int x = 0;
	Int y = 0;
	Int width = 0;
	Int height = 0;
	window->winGetScreenPosition(&x, &y);
	window->winGetSize(&width, &height);
	const UnsignedInt point = SHORTTOLONG(x + width / 2, y + height / 2);
	const WindowMsgHandledType down = TheWindowManager->winSendInputMsg(
		window, GWM_LEFT_DOWN, point, 0);
	const WindowMsgHandledType up = TheWindowManager->winSendInputMsg(
		window, GWM_LEFT_UP, point, 0);

	begin_result(json, true);
	json += ",\"windowId\":" + std::to_string(window_id) + ",\"name\":";
	append_json_string(json, window_name(window));
	json += ",\"handled\":{\"down\":" + std::to_string(static_cast<Int>(down));
	json += ",\"up\":" + std::to_string(static_cast<Int>(up)) + "}}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_ui_set_text(
	Int window_id,
	const char *expected_name,
	const char *utf8_text)
{
	static std::string json;
	std::string error;
	GameWindow *window = resolve_window(window_id, expected_name, error);
	if (window == nullptr) {
		begin_result(json, false);
		append_error(json, error == "window identity changed" ? "stale_window" : "not_found", error);
		json += "}";
		return json.c_str();
	}
	if (!window_is_interactive(window) || (window->winGetStyle() & GWS_ENTRY_FIELD) == 0) {
		begin_result(json, false);
		append_error(json, "not_text_entry", "window is not an interactive text entry");
		json += "}";
		return json.c_str();
	}

	std::vector<WideChar> decoded;
	if (!decode_utf8(utf8_text, decoded, error)) {
		begin_result(json, false);
		append_error(json, "invalid_text", error);
		json += "}";
		return json.c_str();
	}
	if (!validate_entry_text(window, decoded, error)) {
		begin_result(json, false);
		append_error(json, "invalid_text", error);
		json += "}";
		return json.c_str();
	}
	UnicodeString value(decoded.data());
	GadgetTextEntrySetText(window, value);
	TheWindowManager->winSetFocus(window);
	if (window->winGetOwner() != nullptr) {
		TheWindowManager->winSendSystemMsg(window->winGetOwner(), GEM_UPDATE_TEXT,
			reinterpret_cast<WindowMsgData>(window), 0);
	}

	begin_result(json, true);
	json += ",\"windowId\":" + std::to_string(window_id) + ",\"name\":";
	append_json_string(json, window_name(window));
	json += ",\"value\":";
	append_json_string(json, unicode_to_utf8(GadgetTextEntryGetText(window)));
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_ui_select_index(
	Int window_id,
	const char *expected_name,
	Int index)
{
	static std::string json;
	std::string error;
	GameWindow *window = resolve_window(window_id, expected_name, error);
	if (window == nullptr) {
		begin_result(json, false);
		append_error(json, error == "window identity changed" ? "stale_window" : "not_found", error);
		json += "}";
		return json.c_str();
	}
	if (!window_is_interactive(window)) {
		begin_result(json, false);
		append_error(json, "not_interactive", "window is hidden or disabled");
		json += "}";
		return json.c_str();
	}

	const UnsignedInt style = window->winGetStyle();
	Int item_count = 0;
	if ((style & GWS_SCROLL_LISTBOX) != 0) {
		item_count = GadgetListBoxGetNumEntries(window);
	} else if ((style & GWS_COMBO_BOX) != 0) {
		item_count = GadgetComboBoxGetLength(window);
	} else {
		begin_result(json, false);
		append_error(json, "not_selectable", "window is not a list or combo box");
		json += "}";
		return json.c_str();
	}
	if (index < 0 || index >= item_count) {
		begin_result(json, false);
		append_error(json, "index_out_of_range", "selection index is outside the available items");
		json += "}";
		return json.c_str();
	}

	WindowMsgHandledType notification = MSG_IGNORED;
	if ((style & GWS_SCROLL_LISTBOX) != 0) {
		GadgetListBoxSetSelected(window, index);
		if (window->winGetOwner() != nullptr) {
			notification = TheWindowManager->winSendSystemMsg(
				window->winGetOwner(), GLM_SELECTED,
				reinterpret_cast<WindowMsgData>(window), 0);
		}
	} else {
		GadgetComboBoxSetSelectedPos(window, index, FALSE);
		if (window->winGetOwner() != nullptr) {
			notification = TheWindowManager->winSendSystemMsg(
				window->winGetOwner(), GCM_SELECTED,
				reinterpret_cast<WindowMsgData>(window), 0);
		}
	}

	begin_result(json, true);
	json += ",\"windowId\":" + std::to_string(window_id) + ",\"name\":";
	append_json_string(json, window_name(window));
	json += ",\"selectedIndex\":" + std::to_string(index);
	json += ",\"notificationHandled\":"
		+ std::to_string(static_cast<Int>(notification)) + "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_ui_list_items(
	Int window_id,
	const char *expected_name,
	Int offset,
	Int limit)
{
	static std::string json;
	std::string error;
	GameWindow *window = resolve_window(window_id, expected_name, error);
	GameWindow *list_box = list_box_for(window);
	if (window == nullptr || list_box == nullptr) {
		begin_result(json, false);
		append_error(json, window == nullptr
			? (error == "window identity changed" ? "stale_window" : "not_found")
			: "not_list", window == nullptr ? error : "window is not a list or combo box");
		json += "}";
		return json.c_str();
	}

	const Int row_count = GadgetListBoxGetNumEntries(list_box);
	const Int bounded_offset = (std::max)(0, offset);
	const Int bounded_limit = (std::max)(0, (std::min)(limit, kMaxListQueryRows));
	begin_result(json, true);
	json += ",\"windowId\":" + std::to_string(window_id);
	json += ",\"rowCount\":" + std::to_string(row_count);
	json += ",\"columnCount\":" + std::to_string(GadgetListBoxGetNumColumns(list_box));
	json += ",\"offset\":" + std::to_string((std::min)(bounded_offset, row_count));
	json += ",\"limit\":" + std::to_string(bounded_limit);
	json += ",\"rows\":";
	append_list_rows(json, list_box, bounded_offset, bounded_limit);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_game_select(
	const char *object_ids)
{
	static std::string json;
	std::string error;
	if (!gameplay_actions_ready(error)) {
		begin_result(json, false);
		append_error(json, "not_ready", error);
		json += "}";
		return json.c_str();
	}
	std::vector<Object *> objects;
	if (!parse_public_object_ids(object_ids, objects, error)) {
		begin_result(json, false);
		append_error(json, "invalid_objects", error);
		json += "}";
		return json.c_str();
	}
	post_selection(objects);
	finish_action_result(json, "select", objects);
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_game_order(
	const char *action,
	const char *object_ids,
	Int target_id,
	Real x,
	Real y)
{
	static std::string json;
	std::string error;
	if (!gameplay_actions_ready(error)) {
		begin_result(json, false);
		append_error(json, "not_ready", error);
		json += "}";
		return json.c_str();
	}
	std::vector<Object *> objects;
	if (!parse_public_object_ids(object_ids, objects, error)) {
		begin_result(json, false);
		append_error(json, "invalid_objects", error);
		json += "}";
		return json.c_str();
	}
	const std::string requested = action != nullptr ? action : "";
	const bool needs_position = requested == "move" || requested == "attackMove"
		|| requested == "guardPosition";
	const bool needs_target = requested == "attack" || requested == "guardObject";
	if (!needs_position && !needs_target && requested != "stop" && requested != "scatter") {
		begin_result(json, false);
		append_error(json, "unsupported_order",
			"order must be move, attackMove, attack, guardPosition, guardObject, stop, or scatter");
		json += "}";
		return json.c_str();
	}

	Coord3D position = {0.0f, 0.0f, 0.0f};
	if (needs_position && !world_position(x, y, position, error)) {
		begin_result(json, false);
		append_error(json, "invalid_position", error);
		json += "}";
		return json.c_str();
	}
	Player *local_player = agent_perspective_player();
	Object *target = nullptr;
	if (needs_target) {
		target = resolve_observable_target(target_id, local_player, error);
		if (target == nullptr) {
			begin_result(json, false);
			append_error(json, "invalid_target", error);
			json += "}";
			return json.c_str();
		}
		if (requested == "attack"
			&& local_player->getRelationship(target->getTeam()) != ENEMIES) {
			begin_result(json, false);
			append_error(json, "invalid_target", "attack target must currently be an observable enemy");
			json += "}";
			return json.c_str();
		}
	}

	post_selection(objects);
	if (requested == "move") {
		GameMessage *message = append_agent_message(GameMessage::MSG_DO_MOVETO);
		message->appendLocationArgument(position);
	} else if (requested == "attackMove") {
		GameMessage *message = append_agent_message(GameMessage::MSG_DO_ATTACKMOVETO);
		message->appendLocationArgument(position);
	} else if (requested == "attack") {
		GameMessage *message = append_agent_message(GameMessage::MSG_DO_ATTACK_OBJECT);
		message->appendObjectIDArgument(target->getID());
	} else if (requested == "guardPosition") {
		GameMessage *message = append_agent_message(GameMessage::MSG_DO_GUARD_POSITION);
		message->appendLocationArgument(position);
		message->appendIntegerArgument(GUARDMODE_NORMAL);
	} else if (requested == "guardObject") {
		GameMessage *message = append_agent_message(GameMessage::MSG_DO_GUARD_OBJECT);
		message->appendObjectIDArgument(target->getID());
		message->appendIntegerArgument(GUARDMODE_NORMAL);
	} else if (requested == "stop") {
		append_agent_message(GameMessage::MSG_DO_STOP);
	} else {
		append_agent_message(GameMessage::MSG_DO_SCATTER);
	}
	finish_action_result(json, requested.c_str(), objects);
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_game_command(
	Int source_id,
	const char *command_name,
	Int target_id,
	Real x,
	Real y,
	Real angle,
	Int has_position)
{
	static std::string json;
	std::string error;
	if (!gameplay_actions_ready(error)) {
		begin_result(json, false);
		append_error(json, "not_ready", error);
		json += "}";
		return json.c_str();
	}
	if (has_position != 0 && has_position != 1) {
		begin_result(json, false);
		append_error(json, "invalid_arguments", "has_position must be 0 or 1");
		json += "}";
		return json.c_str();
	}
	Object *source = resolve_public_object(source_id);
	const CommandButton *command = find_source_command(source, command_name, error);
	if (command == nullptr) {
		begin_result(json, false);
		append_error(json, "invalid_command", error);
		json += "}";
		return json.c_str();
	}
	Coord3D position = {0.0f, 0.0f, 0.0f};
	if (has_position != 0 && !world_position(x, y, position, error)) {
		begin_result(json, false);
		append_error(json, "invalid_position", error);
		json += "}";
		return json.c_str();
	}
	if (!std::isfinite(angle)) {
		begin_result(json, false);
		append_error(json, "invalid_arguments", "angle must be finite");
		json += "}";
		return json.c_str();
	}
	Player *local_player = agent_perspective_player();
	Object *target = nullptr;
	if (target_id != 0) {
		target = resolve_observable_target(target_id, local_player, error);
		if (target == nullptr) {
			begin_result(json, false);
			append_error(json, "invalid_target", error);
			json += "}";
			return json.c_str();
		}
	}

	const GUICommandType type = command->getCommandType();
	const UnsignedInt options = command->getOptions();
	const bool needs_position = BitTest(options, NEED_TARGET_POS);
	const bool needs_target = BitTest(options, COMMAND_OPTION_NEED_OBJECT_TARGET);
	if (needs_position && has_position == 0) {
		begin_result(json, false);
		append_error(json, "invalid_position", "command requires a target position");
		json += "}";
		return json.c_str();
	}
	if (needs_target && target == nullptr) {
		begin_result(json, false);
		append_error(json, "invalid_target", "command requires an observable target object");
		json += "}";
		return json.c_str();
	}

	std::vector<Object *> selection = {source};
	const ThingTemplate *product = command->getThingTemplate();
	if (type == GUI_COMMAND_UNIT_BUILD || type == GUI_COMMAND_DOZER_CONSTRUCT) {
		if (product == nullptr || TheBuildAssistant == nullptr) {
			begin_result(json, false);
			append_error(json, "invalid_command", "build command has no product template");
			json += "}";
			return json.c_str();
		}
		const CanMakeType can_make = TheBuildAssistant->canMakeUnit(source, product);
		if (can_make != CANMAKE_OK) {
			begin_result(json, false);
			append_error(json, "command_unavailable", can_make_name(can_make));
			json += "}";
			return json.c_str();
		}
	}

	if (type == GUI_COMMAND_UNIT_BUILD) {
		ProductionUpdateInterface *production = source->getProductionUpdateInterface();
		if (production == nullptr) {
			begin_result(json, false);
			append_error(json, "invalid_command", "source has no production interface");
			json += "}";
			return json.c_str();
		}
		post_selection(selection);
		GameMessage *message = append_agent_message(GameMessage::MSG_QUEUE_UNIT_CREATE);
		message->appendIntegerArgument(product->getTemplateID());
		message->appendIntegerArgument(production->requestUniqueUnitID());
	} else if (type == GUI_COMMAND_DOZER_CONSTRUCT) {
		if (has_position == 0) {
			begin_result(json, false);
			append_error(json, "invalid_position", "construction requires a target position");
			json += "}";
			return json.c_str();
		}
		const UnsignedInt build_options = BuildAssistant::USE_QUICK_PATHFIND
			| BuildAssistant::TERRAIN_RESTRICTIONS | BuildAssistant::CLEAR_PATH
			| BuildAssistant::NO_OBJECT_OVERLAP | BuildAssistant::SHROUD_REVEALED
			| BuildAssistant::IGNORE_STEALTHED
			| BuildAssistant::FAIL_STEALTHED_WITHOUT_FEEDBACK;
		const LegalBuildCode legal = TheBuildAssistant->isLocationLegalToBuild(
			&position, product, angle, build_options, source, nullptr);
		if (TheTerrainVisual != nullptr) TheTerrainVisual->removeAllBibs();
		if (legal != LBC_OK) {
			begin_result(json, false);
			append_error(json, "illegal_build_location", legal_build_name(legal));
			json += "}";
			return json.c_str();
		}
		post_selection(selection);
		GameMessage *message = append_agent_message(GameMessage::MSG_DOZER_CONSTRUCT);
		message->appendIntegerArgument(product->getTemplateID());
		message->appendLocationArgument(position);
		message->appendRealArgument(angle);
	} else if (type == GUI_COMMAND_PLAYER_UPGRADE || type == GUI_COMMAND_OBJECT_UPGRADE) {
		const UpgradeTemplate *upgrade = command->getUpgradeTemplate();
		ProductionUpdateInterface *production = source->getProductionUpdateInterface();
		if (upgrade == nullptr || TheUpgradeCenter == nullptr
			|| !TheUpgradeCenter->canAffordUpgrade(local_player, upgrade, TRUE)
			|| (production != nullptr && production->canQueueUpgrade(upgrade) != CANMAKE_OK)
			|| (type == GUI_COMMAND_PLAYER_UPGRADE && local_player->hasUpgradeComplete(upgrade))
			|| (type == GUI_COMMAND_OBJECT_UPGRADE
				&& (source->hasUpgrade(upgrade) || !source->affectedByUpgrade(upgrade)))) {
			begin_result(json, false);
			append_error(json, "command_unavailable", "upgrade is not currently available");
			json += "}";
			return json.c_str();
		}
		post_selection(selection);
		GameMessage *message = append_agent_message(GameMessage::MSG_QUEUE_UPGRADE);
		message->appendObjectIDArgument(source->getID());
		message->appendIntegerArgument(upgrade->getUpgradeNameKey());
	} else if (type == GUI_COMMAND_SELL || type == GUI_COMMAND_STOP
		|| type == GUI_COMMAND_HACK_INTERNET || type == GUI_COMMAND_TOGGLE_OVERCHARGE
		|| type == GUI_COMMAND_EVACUATE || type == GUI_COMMAND_SWITCH_WEAPON
		|| type == GUI_COMMAND_FIRE_WEAPON) {
		post_selection(selection);
		if (type == GUI_COMMAND_SELL) {
			append_agent_message(GameMessage::MSG_SELL);
		} else if (type == GUI_COMMAND_STOP) {
			append_agent_message(GameMessage::MSG_DO_STOP);
		} else if (type == GUI_COMMAND_HACK_INTERNET) {
			append_agent_message(GameMessage::MSG_INTERNET_HACK);
		} else if (type == GUI_COMMAND_TOGGLE_OVERCHARGE) {
			append_agent_message(GameMessage::MSG_TOGGLE_OVERCHARGE);
		} else if (type == GUI_COMMAND_EVACUATE) {
			GameMessage *message = append_agent_message(GameMessage::MSG_EVACUATE);
			if (has_position != 0) message->appendLocationArgument(position);
		} else if (type == GUI_COMMAND_SWITCH_WEAPON) {
			GameMessage *message = append_agent_message(GameMessage::MSG_SWITCH_WEAPONS);
			message->appendIntegerArgument(command->getWeaponSlot());
		} else {
			GameMessage *message = append_agent_message(GameMessage::MSG_DO_WEAPON);
			message->appendIntegerArgument(command->getWeaponSlot());
			message->appendIntegerArgument(command->getMaxShotsToFire());
		}
	} else if (type == GUI_COMMAND_SET_RALLY_POINT) {
		if (has_position == 0) {
			begin_result(json, false);
			append_error(json, "invalid_position", "rally point requires a target position");
			json += "}";
			return json.c_str();
		}
		post_selection(selection);
		GameMessage *message = append_agent_message(GameMessage::MSG_SET_RALLY_POINT);
		message->appendObjectIDArgument(source->getID());
		message->appendLocationArgument(position);
	} else if (type == GUI_COMMAND_SPECIAL_POWER
		|| type == GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT) {
		const SpecialPowerTemplate *special = command->getSpecialPowerTemplate();
		Object *power_source = special_power_execution_source(command, source, local_player);
		SpecialPowerModuleInterface *module = special != nullptr && power_source != nullptr
			? power_source->getSpecialPowerModule(special) : nullptr;
		if (special == nullptr || power_source == nullptr || module == nullptr
			|| !module->isReady() || !command->isReady(power_source)
		|| !command->isValidToUseOn(power_source, target,
				needs_position ? &position : nullptr, CMD_FROM_PLAYER)) {
			begin_result(json, false);
			append_error(json, "command_unavailable", "special power is not ready or target is invalid");
			json += "}";
			return json.c_str();
		}
		const bool shortcut = type == GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT;
		if (!shortcut) post_selection(selection);
		const ObjectID specific_source = shortcut ? power_source->getID() : INVALID_ID;
		if (needs_target) {
			GameMessage *message = append_agent_message(
				GameMessage::MSG_DO_SPECIAL_POWER_AT_OBJECT);
			message->appendIntegerArgument(special->getID());
			message->appendObjectIDArgument(target->getID());
			message->appendIntegerArgument(options);
			message->appendObjectIDArgument(specific_source);
		} else if (needs_position) {
			GameMessage *message = append_agent_message(
				GameMessage::MSG_DO_SPECIAL_POWER_AT_LOCATION);
			message->appendIntegerArgument(special->getID());
			message->appendLocationArgument(position);
			message->appendRealArgument(angle);
			message->appendObjectIDArgument(target != nullptr ? target->getID() : INVALID_ID);
			message->appendIntegerArgument(options);
			message->appendObjectIDArgument(specific_source);
		} else {
			GameMessage *message = append_agent_message(GameMessage::MSG_DO_SPECIAL_POWER);
			message->appendIntegerArgument(special->getID());
			message->appendIntegerArgument(options);
			message->appendObjectIDArgument(specific_source);
		}
		if (shortcut) selection = {power_source};
	} else {
		begin_result(json, false);
		append_error(json, "unsupported_command",
			"this command type is exposed for observation but does not yet have a semantic executor");
		json += "}";
		return json.c_str();
	}

	finish_action_result(json, command->getName().str(), selection);
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_camera_look_at(Real x, Real y)
{
	static std::string json;
	std::string error;
	if (!gameplay_actions_ready(error) || TheTacticalView == nullptr) {
		begin_result(json, false);
		append_error(json, "not_ready", error.empty() ? "tactical view is not ready" : error);
		json += "}";
		return json.c_str();
	}
	Coord3D position;
	if (!world_position(x, y, position, error)) {
		begin_result(json, false);
		append_error(json, "invalid_position", error);
		json += "}";
		return json.c_str();
	}
	TheTacticalView->lookAt(&position);
	begin_result(json, true);
	json += ",\"lookAt\":";
	append_coord(json, position);
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_world_snapshot(
	Int camera_bound,
	Int tactical_detail,
	Int include_capabilities)
{
	static std::string json;
	if (camera_bound != 0 && camera_bound != 1) {
		begin_result(json, false);
		append_error(json, "invalid_arguments", "camera_bound must be 0 or 1");
		json += "}";
		return json.c_str();
	}
	if ((tactical_detail != 0 && tactical_detail != 1)
		|| (include_capabilities != 0 && include_capabilities != 1)) {
		begin_result(json, false);
		append_error(json, "invalid_arguments",
			"tactical_detail and include_capabilities must be 0 or 1");
		json += "}";
		return json.c_str();
	}
	if (TheGameLogic == nullptr || ThePlayerList == nullptr
		|| ThePartitionManager == nullptr || TheTerrainLogic == nullptr
		|| TheTacticalView == nullptr) {
		begin_result(json, false);
		append_error(json, "not_ready", "gameplay observation subsystems are not ready");
		json += "}";
		return json.c_str();
	}

	Player *local_player = agent_perspective_player();
	if (local_player == nullptr) {
		begin_result(json, false);
		append_error(json, "not_ready", "local player is not ready");
		json += "}";
		return json.c_str();
	}

	const bool bounded_to_camera = camera_bound != 0;
	const Int game_mode = TheGameLogic->getGameMode();
	const bool playable = game_mode == GAME_SINGLE_PLAYER || game_mode == GAME_LAN
		|| game_mode == GAME_SKIRMISH || game_mode == GAME_INTERNET;
	const UnsignedInt frame = TheGameLogic->getFrame();
	begin_world_identity_scope(frame, playable);
	const UnsignedInt end_frame = TheVictoryConditions != nullptr
		? TheVictoryConditions->getEndFrame() : 0;

	begin_result(json, true);
	json += ",\"snapshotId\":" + std::to_string(++g_world_snapshot_id);
	json += ",\"frame\":" + std::to_string(frame);
	json += ",\"observationMode\":";
	append_json_string(json, bounded_to_camera ? "camera" : "unrestricted");
	json += ",\"observationDetail\":";
	append_json_string(json, tactical_detail != 0 ? "tactical" : "full");
	json += ",\"game\":{\"mode\":";
	append_json_string(json, game_mode_name(game_mode));
	json += ",\"playable\":";
	json += playable ? "true" : "false";
	json += ",\"endFrame\":" + std::to_string(end_frame);
	json += ",\"outcome\":";
	if (!playable || end_frame == 0 || TheVictoryConditions == nullptr) {
		json += "null";
	} else if (TheVictoryConditions->hasAchievedVictory(local_player)) {
		append_json_string(json, "victory");
	} else if (TheVictoryConditions->hasBeenDefeated(local_player)) {
		append_json_string(json, "defeat");
	} else {
		append_json_string(json, "ended");
	}
	json += "}";

	Coord3D look_at;
	TheTacticalView->getPosition(&look_at);
	const Coord3D camera_position = TheTacticalView->get3DCameraPosition();
	Int origin_x = 0;
	Int origin_y = 0;
	TheTacticalView->getOrigin(&origin_x, &origin_y);
	json += ",\"camera\":{\"lookAt\":";
	append_coord(json, look_at);
	json += ",\"position\":";
	append_coord(json, camera_position);
	json += ",\"angle\":";
	append_real(json, TheTacticalView->getAngle());
	json += ",\"pitch\":";
	append_real(json, TheTacticalView->getPitch());
	json += ",\"zoom\":";
	append_real(json, TheTacticalView->getZoom());
	json += ",\"fieldOfView\":";
	append_real(json, TheTacticalView->getFieldOfView());
	json += ",\"viewport\":{\"x\":" + std::to_string(origin_x)
		+ ",\"y\":" + std::to_string(origin_y)
		+ ",\"width\":" + std::to_string(TheTacticalView->getWidth())
		+ ",\"height\":" + std::to_string(TheTacticalView->getHeight()) + "}}";

	Region3D extent;
	TheTerrainLogic->getExtent(&extent);
	json += ",\"terrain\":{\"extent\":{\"lo\":";
	append_coord(json, extent.lo);
	json += ",\"hi\":";
	append_coord(json, extent.hi);
	json += "},\"partitionCellSize\":";
	append_real(json, ThePartitionManager->getCellSize());
	json += ",\"pathfindCellSize\":";
	append_real(json, PATHFIND_CELL_SIZE);
	json += "}";

	json += ",\"localPlayerIndex\":" + std::to_string(local_player->getPlayerIndex());
	json += ",\"players\":[";
	bool first_player = true;
	for (Int i = 0; i < ThePlayerList->getPlayerCount(); ++i) {
		Player *player = ThePlayerList->getNthPlayer(i);
		if (player == nullptr) continue;
		if (!first_player) json += ",";
		first_player = false;
		append_player(json, player, local_player);
	}
	json += "]";

	std::vector<Object *> objects;
	for (Object *object = TheGameLogic->getFirstObject();
		object != nullptr; object = object->getNextObject()) {
		objects.push_back(object);
	}
	std::sort(objects.begin(), objects.end(), [](const Object *left, const Object *right) {
		return left->getID() < right->getID();
	});

	std::vector<Object *> observed_objects;
	observed_objects.reserve(std::min(static_cast<std::size_t>(kMaxWorldObjects), objects.size()));
	bool truncated = false;
	for (Object *object : objects) {
		ObjectShroudStatus shroud = OBJECTSHROUD_INVALID;
		ICoord2D screen = {0, 0};
		bool in_camera = false;
		if (!is_observable_object(object, local_player, shroud, screen, in_camera)) {
			continue;
		}
		if (bounded_to_camera && !in_camera) {
			continue;
		}
		if (static_cast<Int>(observed_objects.size()) >= kMaxWorldObjects) {
			truncated = true;
			break;
		}
		observed_objects.push_back(object);
	}

	json += ",\"objects\":[";
	bool first_object = true;
	for (Object *object : observed_objects) {
		ObjectShroudStatus shroud = OBJECTSHROUD_INVALID;
		ICoord2D screen = {0, 0};
		bool in_camera = false;
		is_observable_object(object, local_player, shroud, screen, in_camera);
		if (!first_object) json += ",";
		first_object = false;
		if (tactical_detail != 0) append_tactical_object(json, object, local_player);
		else append_object(json, object, local_player, shroud, screen, in_camera);
	}
	json += "]";
	json += ",\"objectCount\":" + std::to_string(observed_objects.size());
	json += ",\"truncated\":";
	json += truncated ? "true" : "false";
	if (include_capabilities != 0) {
		json += ",\"templates\":";
		append_template_catalog(json, observed_objects);
		json += ",\"commandSets\":";
		append_command_set_catalog(json, observed_objects);
		json += ",\"objectCapabilities\":";
		append_capability_catalog(json, observed_objects);
		json += ",\"classicAi\":";
		append_classic_ai_catalog(json, local_player);
	}
	json += "}";
	return json.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_terrain_query(
	Int camera_bound,
	Real min_x,
	Real min_y,
	Real max_x,
	Real max_y,
	Int columns,
	Int rows)
{
	static std::string json;
	if ((camera_bound != 0 && camera_bound != 1)
		|| !std::isfinite(min_x) || !std::isfinite(min_y)
		|| !std::isfinite(max_x) || !std::isfinite(max_y)
		|| min_x >= max_x || min_y >= max_y
		|| columns < 1 || columns > kMaxTerrainSamplesPerAxis
		|| rows < 1 || rows > kMaxTerrainSamplesPerAxis
		|| columns * rows > kMaxTerrainSamples) {
		begin_result(json, false);
		append_error(json, "invalid_arguments",
			"terrain bounds must be finite and ordered; rows and columns must be 1 through 128 with at most 16384 samples");
		json += "}";
		return json.c_str();
	}
	if (TheTerrainLogic == nullptr || ThePartitionManager == nullptr
		|| ThePlayerList == nullptr || TheTacticalView == nullptr) {
		begin_result(json, false);
		append_error(json, "not_ready", "terrain observation subsystems are not ready");
		json += "}";
		return json.c_str();
	}
	Player *local_player = agent_perspective_player();
	if (local_player == nullptr) {
		begin_result(json, false);
		append_error(json, "not_ready", "local player is not ready");
		json += "}";
		return json.c_str();
	}

	Region3D extent;
	TheTerrainLogic->getExtent(&extent);
	if (min_x < extent.lo.x || min_y < extent.lo.y
		|| max_x > extent.hi.x || max_y > extent.hi.y) {
		begin_result(json, false);
		append_error(json, "bounds_out_of_range", "terrain query must stay inside the active map extent");
		json += "}";
		return json.c_str();
	}

	const Int sample_count = columns * rows;
	std::vector<Real> heights(static_cast<std::size_t>(sample_count), 0.0f);
	std::vector<bool> known(static_cast<std::size_t>(sample_count), false);
	std::vector<std::uint8_t> flags(static_cast<std::size_t>(sample_count), 0);
	Real known_min = (std::numeric_limits<Real>::max)();
	Real known_max = (std::numeric_limits<Real>::lowest)();
	Int known_count = 0;
	Int visible_count = 0;
	Int in_camera_count = 0;
	const Real step_x = (max_x - min_x) / static_cast<Real>(columns);
	const Real step_y = (max_y - min_y) / static_cast<Real>(rows);
	Pathfinder *pathfinder = TheAI != nullptr ? TheAI->pathfinder() : nullptr;

	for (Int row = 0; row < rows; ++row) {
		for (Int column = 0; column < columns; ++column) {
			const Int index = row * columns + column;
			Coord3D position;
			position.x = min_x + (static_cast<Real>(column) + 0.5f) * step_x;
			position.y = min_y + (static_cast<Real>(row) + 0.5f) * step_y;
			position.z = TheTerrainLogic->getGroundHeight(position.x, position.y);
			const bool in_camera = point_in_camera(position);
			if (in_camera) {
				flags[index] |= 0x80;
				++in_camera_count;
			}
			if (camera_bound != 0 && !in_camera) continue;

			const CellShroudStatus shroud = ThePartitionManager->getShroudStatusForPlayer(
				local_player->getPlayerIndex(), &position);
			if (shroud == CELLSHROUD_SHROUDED) continue;
			const bool visible = shroud == CELLSHROUD_CLEAR;
			flags[index] |= visible ? 0x02 : 0x01;
			known[index] = true;
			heights[index] = position.z;
			known_min = (std::min)(known_min, position.z);
			known_max = (std::max)(known_max, position.z);
			++known_count;
			if (TheTerrainLogic->isCliffCell(position.x, position.y)) flags[index] |= 0x04;
			if (!visible) continue;
			++visible_count;
			if (TheTerrainLogic->isUnderwater(position.x, position.y)) flags[index] |= 0x08;
			PathfindCell *cell = pathfinder != nullptr
				? pathfinder->getCell(LAYER_GROUND, &position) : nullptr;
			if (cell != nullptr) {
				flags[index] |= static_cast<std::uint8_t>((static_cast<Int>(cell->getType()) + 1) << 4);
			}
		}
	}

	if (known_count == 0) {
		known_min = 0.0f;
		known_max = 0.0f;
	}
	const Real height_scale = known_max > known_min
		? (known_max - known_min) / 65534.0f : 1.0f;
	std::vector<std::uint8_t> height_bytes(static_cast<std::size_t>(sample_count) * 2, 0);
	for (Int index = 0; index < sample_count; ++index) {
		if (!known[index]) continue;
		const Real normalized = height_scale > 0.0f
			? (heights[index] - known_min) / height_scale : 0.0f;
		const std::uint32_t rounded = static_cast<std::uint32_t>(normalized + 0.5f);
		const std::uint16_t encoded = static_cast<std::uint16_t>(
			1u + (std::min)(rounded, static_cast<std::uint32_t>(65534)));
		height_bytes[static_cast<std::size_t>(index) * 2] = encoded & 0xff;
		height_bytes[static_cast<std::size_t>(index) * 2 + 1] = encoded >> 8;
	}

	begin_result(json, true);
	json += ",\"queryId\":" + std::to_string(++g_terrain_query_id);
	json += ",\"frame\":" + std::to_string(TheGameLogic != nullptr ? TheGameLogic->getFrame() : 0);
	json += ",\"observationMode\":";
	append_json_string(json, camera_bound != 0 ? "camera" : "unrestricted");
	json += ",\"bounds\":{\"minX\":";
	append_real(json, min_x);
	json += ",\"minY\":";
	append_real(json, min_y);
	json += ",\"maxX\":";
	append_real(json, max_x);
	json += ",\"maxY\":";
	append_real(json, max_y);
	json += "},\"columns\":" + std::to_string(columns)
		+ ",\"rows\":" + std::to_string(rows);
	json += ",\"sampleOrigin\":\"cellCenter\"";
	json += ",\"height\":{\"encoding\":\"uint16le-base64\",\"unknown\":0,\"offset\":";
	append_real(json, known_min);
	json += ",\"scale\":";
	append_real(json, height_scale);
	json += ",\"data\":";
	append_json_string(json, encode_base64(height_bytes));
	json += "}";
	json += ",\"flags\":{\"encoding\":\"uint8-base64\",\"layout\":";
	append_json_string(json,
		"bits0-1 knowledge(0 unknown,1 explored,2 visible); bit2 cliff; bit3 water; bits4-6 visible path type plus one; bit7 in camera");
	json += ",\"pathTypes\":[\"clear\",\"water\",\"cliff\",\"rubble\",\"obstacle\",\"bridgeImpassable\",\"impassable\"],\"data\":";
	append_json_string(json, encode_base64(flags));
	json += "}";
	json += ",\"knownCount\":" + std::to_string(known_count);
	json += ",\"visibleCount\":" + std::to_string(visible_count);
	json += ",\"inCameraCount\":" + std::to_string(in_camera_count);
	json += "}";
	return json.c_str();
}

namespace {

bool is_assigned_llm_ai_player(Player *player)
{
	if (player == nullptr || TheGameLogic == nullptr) return false;
	const Int game_mode = TheGameLogic->getGameMode();
	const GameInfo *game = TheGameInfo;
	if (game == nullptr && game_mode == GAME_SKIRMISH) game = TheSkirmishGameInfo;
	if (game == nullptr) return false;
	for (Int slot_num = 0; slot_num < MAX_SLOTS; ++slot_num) {
		const GameSlot *slot = game->getConstSlot(slot_num);
		if (slot == nullptr || !slot->isLlmAi()) continue;
		AsciiString player_name;
		player_name.format("player%d", slot_num);
		Player *slot_player = ThePlayerList != nullptr && TheNameKeyGenerator != nullptr
			? ThePlayerList->findPlayerWithNameKey(
				TheNameKeyGenerator->nameToKey(player_name)) : nullptr;
		if (slot_player == player) return true;
	}
	return false;
}

Player *resolve_llm_ai_player(Int player_index, std::string &error)
{
	if (ThePlayerList == nullptr || TheGameLogic == nullptr) {
		error = "player and game subsystems are not ready";
		return nullptr;
	}
	for (Int i = 0; i < ThePlayerList->getPlayerCount(); ++i) {
		Player *player = ThePlayerList->getNthPlayer(i);
		if (player == nullptr || player->getPlayerIndex() != player_index) continue;
		if (!player->isPlayerActive() || player->getPlayerType() != PLAYER_COMPUTER
			|| !player->isSkirmishAIPlayer() || !is_assigned_llm_ai_player(player)) {
			error = "playerIndex must identify an active computer player assigned to an LLM slot";
			return nullptr;
		}
		return player;
	}
	error = "playerIndex does not identify a current player";
	return nullptr;
}

const char *finish_llm_error(
	std::string &json,
	const char *code,
	const std::string &message)
{
	begin_result(json, false);
	append_error(json, code, message);
	json += "}";
	return json.c_str();
}

bool owns_team_prototype(Player *player, TeamPrototype *team)
{
	if (player == nullptr || team == nullptr) return false;
	const Player::PlayerTeamList *teams = player->getPlayerTeams();
	return teams != nullptr
		&& std::find(teams->begin(), teams->end(), team) != teams->end();
}

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_llm_ai_world_snapshot(
	Int player_index,
	Int camera_bound,
	Int tactical_detail,
	Int include_capabilities)
{
	static std::string json;
	std::string error;
	Player *player = resolve_llm_ai_player(player_index, error);
	if (player == nullptr) return finish_llm_error(json, "invalid_player", error);
	ScopedAgentPerspective perspective(player);
	return cnc_port_agent_world_snapshot(
		camera_bound, tactical_detail, include_capabilities);
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_llm_ai_terrain_query(
	Int player_index,
	Int camera_bound,
	Real min_x,
	Real min_y,
	Real max_x,
	Real max_y,
	Int columns,
	Int rows)
{
	static std::string json;
	std::string error;
	Player *player = resolve_llm_ai_player(player_index, error);
	if (player == nullptr) return finish_llm_error(json, "invalid_player", error);
	ScopedAgentPerspective perspective(player);
	return cnc_port_agent_terrain_query(
		camera_bound, min_x, min_y, max_x, max_y, columns, rows);
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_llm_ai_game_order(
	Int player_index,
	const char *action,
	const char *object_ids,
	Int target_id,
	Real x,
	Real y)
{
	static std::string json;
	std::string error;
	Player *player = resolve_llm_ai_player(player_index, error);
	if (player == nullptr) return finish_llm_error(json, "invalid_player", error);
	ScopedAgentPerspective perspective(player);
	return cnc_port_agent_game_order(action, object_ids, target_id, x, y);
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_llm_ai_game_command(
	Int player_index,
	Int source_id,
	const char *command_name,
	Int target_id,
	Real x,
	Real y,
	Real angle,
	Int has_position)
{
	static std::string json;
	std::string error;
	Player *player = resolve_llm_ai_player(player_index, error);
	if (player == nullptr) return finish_llm_error(json, "invalid_player", error);
	ScopedAgentPerspective perspective(player);
	return cnc_port_agent_game_command(
		source_id, command_name, target_id, x, y, angle, has_position);
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_llm_ai_classic_directive(
	Int player_index,
	const char *action,
	const char *name,
	Real value)
{
	static std::string json;
	std::string error;
	Player *player = resolve_llm_ai_player(player_index, error);
	if (player == nullptr) return finish_llm_error(json, "invalid_player", error);
	if (TheGameLogic->getGameMode() != GAME_SKIRMISH) {
		return finish_llm_error(json, "unsupported_in_multiplayer",
			"classic AI directives are available only in skirmish because they mutate deterministic AI state directly");
	}
	if (!std::isfinite(value)) {
		return finish_llm_error(json, "invalid_value", "value must be finite");
	}

	const std::string requested = action != nullptr ? action : "";
	const AsciiString requested_name(name != nullptr ? name : "");
	const std::string requested_name_string = requested_name.str();
	std::vector<std::string> available_buildings;
	std::vector<std::string> available_upgrades;
	collect_classic_ai_catalog(player, available_buildings, available_upgrades);
	if (requested == "buildBuilding" || requested == "buildBaseDefenseStructure") {
		const ThingTemplate *thing = TheThingFactory != nullptr
			? TheThingFactory->findTemplate(requested_name, FALSE) : nullptr;
		if (thing == nullptr || !thing->isBuildableItem() || !player->allowedToBuild(thing)
			|| std::find(available_buildings.begin(), available_buildings.end(),
				requested_name_string) == available_buildings.end()
			|| (requested == "buildBaseDefenseStructure"
				&& !thing->isKindOf(KINDOF_FS_BASE_DEFENSE))) {
			return finish_llm_error(json, "invalid_template",
				requested == "buildBaseDefenseStructure"
					? "name must identify an available faction base-defense structure"
					: "name must be listed in this player's currently available building templates");
		}
		if (requested == "buildBuilding") player->buildSpecificBuilding(requested_name);
		else {
			if (value != 0.0f && value != 1.0f) {
				return finish_llm_error(json, "invalid_value", "flank value must be 0 or 1");
			}
			player->buildBaseDefenseStructure(requested_name, value != 0.0f);
		}
	} else if (requested == "buildUpgrade") {
		const UpgradeTemplate *upgrade = TheUpgradeCenter != nullptr
			? TheUpgradeCenter->findUpgrade(requested_name) : nullptr;
		if (upgrade == nullptr
			|| std::find(available_upgrades.begin(), available_upgrades.end(),
				requested_name_string) == available_upgrades.end()) {
			return finish_llm_error(json, "invalid_upgrade",
				"name must be listed in this player's currently available upgrades");
		}
		player->buildUpgrade(requested_name);
	} else if (requested == "buildBaseDefense") {
		if (value != 0.0f && value != 1.0f) {
			return finish_llm_error(json, "invalid_value", "flank value must be 0 or 1");
		}
		player->buildBaseDefense(value != 0.0f);
	} else if (requested == "buildTeam" || requested == "recruitTeam") {
		TeamPrototype *team = TheTeamFactory != nullptr
			? TheTeamFactory->findTeamPrototype(requested_name) : nullptr;
		if (!owns_team_prototype(player, team)) {
			return finish_llm_error(json, "invalid_team",
				"name must identify a team prototype owned by this AI player");
		}
		if (requested == "buildTeam") player->buildSpecificTeam(team);
		else {
			if (value < 0.0f) {
				return finish_llm_error(json, "invalid_value",
					"recruitTeam radius must be zero or positive");
			}
			player->recruitSpecificTeam(team, value);
		}
	} else if (requested == "buildBySupplies") {
		const ThingTemplate *thing = TheThingFactory != nullptr
			? TheThingFactory->findTemplate(requested_name, FALSE) : nullptr;
		if (thing == nullptr || !thing->isBuildableItem() || !player->allowedToBuild(thing)
			|| std::find(available_buildings.begin(), available_buildings.end(),
				requested_name_string) == available_buildings.end()
			|| value < 0.0f || value > static_cast<Real>((std::numeric_limits<Int>::max)())
			|| std::floor(value) != value) {
			return finish_llm_error(json, "invalid_directive",
				"buildBySupplies requires a buildable template and a non-negative cash threshold");
		}
		player->buildBySupplies(static_cast<Int>(value), requested_name);
	} else if (requested == "hunt") {
		if (value != 0.0f && value != 1.0f) {
			return finish_llm_error(json, "invalid_value", "hunt value must be 0 or 1");
		}
		player->setUnitsShouldHunt(value != 0.0f, CMD_FROM_AI);
	} else if (requested == "teamDelay") {
		if (value < 0.0f || value > 3600.0f || std::floor(value) != value) {
			return finish_llm_error(json, "invalid_value",
				"teamDelay value must be a whole number from 0 through 3600 seconds");
		}
		player->setTeamDelaySeconds(static_cast<Int>(value));
	} else {
		return finish_llm_error(json, "unsupported_directive",
			"action must be buildBuilding, buildUpgrade, buildBaseDefense, buildBaseDefenseStructure, buildTeam, recruitTeam, buildBySupplies, hunt, or teamDelay");
	}

	begin_result(json, true);
	json += ",\"action\":";
	append_json_string(json, requested);
	json += ",\"playerIndex\":" + std::to_string(player_index);
	json += ",\"frame\":" + std::to_string(TheGameLogic->getFrame()) + "}";
	return json.c_str();
}
