// Data-layer control surface for remote agents.
//
// This file deliberately exposes engine-owned primitives only.  Transport,
// sessions, REST resource naming, caching, and higher-level conveniences live
// outside the engine in the browser adapter and Go bridge.

#include <emscripten/emscripten.h>

#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

#include "Common/UnicodeString.h"
#include "GameClient/Gadget.h"
#include "GameClient/GadgetComboBox.h"
#include "GameClient/GadgetListBox.h"
#include "GameClient/GadgetTextEntry.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/WinInstanceData.h"

namespace {

constexpr const char *kProtocol = "cnc-agent/1";
constexpr Int kMaxWindows = WIN_MAX_WINDOWS;
constexpr Int kMaxSnapshotRowsPerList = 64;
constexpr Int kMaxListColumns = 16;
constexpr Int kMaxListQueryRows = 128;
constexpr std::size_t kMaxTextCodepoints = 1024;
constexpr std::size_t kMaxInputCodepoints = 4096;

std::uint64_t g_snapshot_id = 0;

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
