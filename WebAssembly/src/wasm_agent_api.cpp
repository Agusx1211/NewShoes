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
#include <limits>
#include <string>
#include <unordered_map>
#include <vector>

#include "Common/Energy.h"
#include "Common/Money.h"
#include "Common/Player.h"
#include "Common/PlayerList.h"
#include "Common/Team.h"
#include "Common/ThingTemplate.h"
#include "GameClient/Drawable.h"
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
#include "GameLogic/Module/AIUpdate.h"
#include "GameLogic/Module/BodyModule.h"
#include "GameLogic/Module/PhysicsUpdate.h"
#include "GameLogic/Module/StealthUpdate.h"

namespace {

constexpr const char *kProtocol = "cnc-agent/1";
constexpr Int kMaxWindows = WIN_MAX_WINDOWS;
constexpr Int kMaxSnapshotRowsPerList = 64;
constexpr Int kMaxListColumns = 16;
constexpr Int kMaxListQueryRows = 128;
constexpr std::size_t kMaxTextCodepoints = 1024;
constexpr std::size_t kMaxInputCodepoints = 4096;
constexpr Int kMaxWorldObjects = 4096;
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
	Player *local_player,
	ObjectShroudStatus &shroud,
	ICoord2D &screen,
	bool &in_camera)
{
	if (object == nullptr || local_player == nullptr || ThePartitionManager == nullptr) return false;
	shroud = object->getShroudedStatus(local_player->getPlayerIndex());
	if (shroud != OBJECTSHROUD_CLEAR && shroud != OBJECTSHROUD_PARTIAL_CLEAR) return false;

	Drawable *drawable = object->getDrawable();
	const bool locally_controlled = object->isLocallyControlled();
	if (drawable != nullptr) {
		if (drawable->getStealthLook() == STEALTHLOOK_INVISIBLE) return false;
		if (drawable->isDrawableEffectivelyHidden() && !locally_controlled) return false;
	} else if (!locally_controlled) {
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
	add(KINDOF_SUPPLY_SOURCE, "supplySource");
	add(KINDOF_PROJECTILE, "projectile");
	add(KINDOF_BRIDGE, "bridge");
	add(KINDOF_MINE, "mine");
	json += "]";
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

Player *perceived_owner(Object *object, Drawable *drawable, bool &disguised)
{
	disguised = false;
	Player *owner = object != nullptr ? object->getControllingPlayer() : nullptr;
	if (object == nullptr || drawable == nullptr
		|| drawable->getStealthLook() != STEALTHLOOK_DISGUISED_ENEMY) {
		return owner;
	}
	StealthUpdate *stealth = object->getStealth();
	if (stealth == nullptr || !stealth->isDisguised() || ThePlayerList == nullptr) return owner;
	Player *shown_owner = ThePlayerList->getNthPlayer(stealth->getDisguisedPlayerIndex());
	if (shown_owner != nullptr) {
		disguised = true;
		return shown_owner;
	}
	return owner;
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
	Player *owner = perceived_owner(object, drawable, disguised);
	const Relationship relationship = relationship_to_local(owner, local_player);
	const bool locally_controlled = object->isLocallyControlled();
	const ThingTemplate *thing_template = disguised && drawable != nullptr
		? drawable->getTemplate() : object->getTemplate();
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
	json += drawable != nullptr && drawable->isSelected() ? "true" : "false";
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
		json += "{\"selectable\":";
		json += object->isSelectable() ? "true" : "false";
		json += ",\"mobile\":";
		json += object->isMobile() ? "true" : "false";
		json += ",\"attack\":";
		json += object->isAbleToAttack() ? "true" : "false";
		json += ",\"weaponRange\":";
		append_real(json, object->getLargestWeaponRange());
		json += ",\"visionRange\":";
		append_real(json, object->getVisionRange());
		json += ",\"production\":";
		json += object->getProductionUpdateInterface() != nullptr ? "true" : "false";
		json += ",\"commandSet\":";
		append_json_string(json, object->getCommandSetString().str());
		json += "}";
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

	if ((style & GWS_SCROLL_LISTBOX) != 0) {
		GadgetListBoxSetSelected(window, index);
	} else {
		GadgetComboBoxSetSelectedPos(window, index, FALSE);
	}

	begin_result(json, true);
	json += ",\"windowId\":" + std::to_string(window_id) + ",\"name\":";
	append_json_string(json, window_name(window));
	json += ",\"selectedIndex\":" + std::to_string(index) + "}";
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

extern "C" EMSCRIPTEN_KEEPALIVE const char *cnc_port_agent_world_snapshot(Int camera_bound)
{
	static std::string json;
	if (camera_bound != 0 && camera_bound != 1) {
		begin_result(json, false);
		append_error(json, "invalid_arguments", "camera_bound must be 0 or 1");
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

	Player *local_player = ThePlayerList->getLocalPlayer();
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
	json += ",\"game\":{\"mode\":";
	append_json_string(json, game_mode_name(game_mode));
	json += ",\"playable\":";
	json += playable ? "true" : "false";
	json += ",\"endFrame\":" + std::to_string(end_frame);
	json += ",\"outcome\":";
	if (!playable || end_frame == 0 || TheVictoryConditions == nullptr) {
		json += "null";
	} else if (TheVictoryConditions->isLocalAlliedVictory()) {
		append_json_string(json, "victory");
	} else if (TheVictoryConditions->isLocalAlliedDefeat()) {
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

	json += ",\"objects\":[";
	Int observed = 0;
	bool first_object = true;
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
		if (observed >= kMaxWorldObjects) {
			truncated = true;
			break;
		}
		if (!first_object) json += ",";
		first_object = false;
		append_object(json, object, local_player, shroud, screen, in_camera);
		++observed;
	}
	json += "]";
	json += ",\"objectCount\":" + std::to_string(observed);
	json += ",\"truncated\":";
	json += truncated ? "true" : "false";
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
	Player *local_player = ThePlayerList->getLocalPlayer();
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
