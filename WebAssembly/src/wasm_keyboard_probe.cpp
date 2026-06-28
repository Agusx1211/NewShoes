#include "PreRTS.h"

#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "GameClient/Keyboard.h"
#include "GameClient/KeyDefs.h"
#include "wasm_memory_manager_scope.h"
#include "windows.h"

#include <cstdio>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

struct BrowserKeyboardEvent
{
	UINT message = 0;
	WPARAM virtualKey = 0;
	UnsignedByte engineKey = KEY_NONE;
	UnsignedShort state = KEY_STATE_NONE;
	bool mapped = false;
	bool focusLost = false;
};

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

UnsignedByte browser_virtual_key_to_engine_key(WPARAM virtual_key)
{
	switch (static_cast<unsigned int>(virtual_key) & 0xffU) {
		case VK_BACK: return KEY_BACKSPACE;
		case VK_TAB: return KEY_TAB;
		case VK_RETURN: return KEY_ENTER;
		case VK_SHIFT: return KEY_LSHIFT;
		case VK_CONTROL: return KEY_LCTRL;
		case VK_MENU: return KEY_LALT;
		case VK_CAPITAL: return KEY_CAPS;
		case VK_ESCAPE: return KEY_ESC;
		case VK_SPACE: return KEY_SPACE;
		case 0x21: return KEY_PGUP;
		case 0x22: return KEY_PGDN;
		case 0x23: return KEY_END;
		case 0x24: return KEY_HOME;
		case VK_LEFT: return KEY_LEFT;
		case VK_UP: return KEY_UP;
		case VK_RIGHT: return KEY_RIGHT;
		case VK_DOWN: return KEY_DOWN;
		case VK_INSERT: return KEY_INS;
		case VK_DELETE: return KEY_DEL;
		case '0': return KEY_0;
		case '1': return KEY_1;
		case '2': return KEY_2;
		case '3': return KEY_3;
		case '4': return KEY_4;
		case '5': return KEY_5;
		case '6': return KEY_6;
		case '7': return KEY_7;
		case '8': return KEY_8;
		case '9': return KEY_9;
		case 'A': return KEY_A;
		case 'B': return KEY_B;
		case 'C': return KEY_C;
		case 'D': return KEY_D;
		case 'E': return KEY_E;
		case 'F': return KEY_F;
		case 'G': return KEY_G;
		case 'H': return KEY_H;
		case 'I': return KEY_I;
		case 'J': return KEY_J;
		case 'K': return KEY_K;
		case 'L': return KEY_L;
		case 'M': return KEY_M;
		case 'N': return KEY_N;
		case 'O': return KEY_O;
		case 'P': return KEY_P;
		case 'Q': return KEY_Q;
		case 'R': return KEY_R;
		case 'S': return KEY_S;
		case 'T': return KEY_T;
		case 'U': return KEY_U;
		case 'V': return KEY_V;
		case 'W': return KEY_W;
		case 'X': return KEY_X;
		case 'Y': return KEY_Y;
		case 'Z': return KEY_Z;
		case 0x60: return KEY_KP0;
		case 0x61: return KEY_KP1;
		case 0x62: return KEY_KP2;
		case 0x63: return KEY_KP3;
		case 0x64: return KEY_KP4;
		case 0x65: return KEY_KP5;
		case 0x66: return KEY_KP6;
		case 0x67: return KEY_KP7;
		case 0x68: return KEY_KP8;
		case 0x69: return KEY_KP9;
		case 0x6a: return KEY_KPSTAR;
		case 0x6b: return KEY_KPPLUS;
		case 0x6d: return KEY_KPMINUS;
		case 0x6e: return KEY_KPDEL;
		case 0x6f: return KEY_KPSLASH;
		case 0x70: return KEY_F1;
		case 0x71: return KEY_F2;
		case 0x72: return KEY_F3;
		case 0x73: return KEY_F4;
		case VK_F5: return KEY_F5;
		case VK_F6: return KEY_F6;
		case VK_F7: return KEY_F7;
		case VK_F8: return KEY_F8;
		case VK_F9: return KEY_F9;
		case VK_F10: return KEY_F10;
		case VK_F11: return KEY_F11;
		case VK_F12: return KEY_F12;
		case 0xba: return KEY_SEMICOLON;
		case 0xbb: return KEY_EQUAL;
		case 0xbc: return KEY_COMMA;
		case 0xbd: return KEY_MINUS;
		case 0xbe: return KEY_PERIOD;
		case 0xbf: return KEY_SLASH;
		case 0xc0: return KEY_TICK;
		case 0xdb: return KEY_LBRACKET;
		case 0xdc: return KEY_BACKSLASH;
		case 0xdd: return KEY_RBRACKET;
		case 0xde: return KEY_APOSTROPHE;
	}
	return KEY_NONE;
}

class BrowserKeyboard : public Keyboard
{
public:
	void ensureInitialized()
	{
		if (!m_initialized) {
			init();
			m_initialized = true;
		}
	}

	unsigned int loadQueuedKeyMessages()
	{
		ensureInitialized();
		beginLoad();
		unsigned int drained = 0;

		MSG message = {};
		while (PeekMessage(&message, nullptr, WM_KEYDOWN, WM_SYSKEYUP, PM_REMOVE)) {
			++drained;
			appendMessageEvent(message);
		}
		return drained;
	}

	unsigned int loadMirroredKeyMessages()
	{
		ensureInitialized();
		beginLoad();
		unsigned int drained = 0;

		MSG message = {};
		while (WasmWin32Input::ReadQueuedKeyboardMessage(&message, true)) {
			++drained;
			appendMessageEvent(message);
		}
		return drained;
	}

	void queueFocusLost()
	{
		ensureInitialized();
		m_focusLostPending = true;
		++m_focusLostQueuedCount;
	}

	void resetProbeState()
	{
		ensureInitialized();
		resetKeys();
		m_scriptCount = 0;
		m_next = 0;
		m_eventCount = 0;
		m_ignored = 0;
		m_focusLostPending = false;
		m_focusLostDelivered = false;
		m_focusLostQueuedCount = 0;
		m_inputFrame = 0;
	}

	Bool getCapsState() override { return FALSE; }

	unsigned int eventCount() const { return m_eventCount; }
	unsigned int ignoredCount() const { return m_ignored; }
	const BrowserKeyboardEvent &eventAt(unsigned int index) const { return m_events[index]; }
	bool focusLostPending() const { return m_focusLostPending; }
	bool focusLostDelivered() const { return m_focusLostDelivered; }
	unsigned int focusLostQueuedCount() const { return m_focusLostQueuedCount; }
	UnsignedInt inputFrame() const { return m_inputFrame; }
	Bool keyDown(UnsignedByte key) { return getKeyStateBit(key, KEY_STATE_DOWN); }

protected:
	void getKey(KeyboardIO *key) override
	{
		if (m_next < m_scriptCount) {
			*key = m_script[m_next++];
			return;
		}

		key->key = KEY_NONE;
		key->status = KeyboardIO::STATUS_UNUSED;
		key->state = KEY_STATE_NONE;
		key->sequence = 0;
	}

private:
	enum { MAX_SCRIPT_KEYS = 32, MAX_EVENTS = 32 };

	void beginLoad()
	{
		m_scriptCount = 0;
		m_next = 0;
		m_eventCount = 0;
		m_ignored = 0;
		m_focusLostDelivered = false;

		if (m_focusLostPending) {
			BrowserKeyboardEvent event;
			event.engineKey = KEY_LOST;
			event.mapped = true;
			event.focusLost = true;
			appendEvent(event);
			m_focusLostPending = false;
			m_focusLostDelivered = true;
		}
	}

	void appendMessageEvent(const MSG &message)
	{
		BrowserKeyboardEvent event;
		event.message = message.message;
		event.virtualKey = message.wParam;
		event.engineKey = browser_virtual_key_to_engine_key(message.wParam);
		if (message.message == WM_KEYDOWN || message.message == WM_SYSKEYDOWN) {
			event.state = KEY_STATE_DOWN;
		} else if (message.message == WM_KEYUP || message.message == WM_SYSKEYUP) {
			event.state = KEY_STATE_UP;
		}
		event.mapped = event.engineKey != KEY_NONE && event.state != KEY_STATE_NONE;
		appendEvent(event);
	}

	void appendEvent(const BrowserKeyboardEvent &event)
	{
		if (m_eventCount < MAX_EVENTS) {
			m_events[m_eventCount++] = event;
		}

		if (!event.mapped || m_scriptCount >= MAX_SCRIPT_KEYS) {
			++m_ignored;
			return;
		}

		KeyboardIO &key = m_script[m_scriptCount++];
		key.key = event.engineKey;
		key.status = KeyboardIO::STATUS_UNUSED;
		key.state = event.state;
		key.sequence = 0;
	}

	bool m_initialized = false;
	KeyboardIO m_script[MAX_SCRIPT_KEYS] = {};
	unsigned int m_scriptCount = 0;
	unsigned int m_next = 0;
	BrowserKeyboardEvent m_events[MAX_EVENTS] = {};
	unsigned int m_eventCount = 0;
	unsigned int m_ignored = 0;
	bool m_focusLostPending = false;
	bool m_focusLostDelivered = false;
	unsigned int m_focusLostQueuedCount = 0;
};

BrowserKeyboard g_browser_keyboard;
std::string g_original_keyboard_json;
GlobalData *g_frame_keyboard_global_data = nullptr;
MessageStream *g_frame_keyboard_message_stream = nullptr;
CommandList *g_frame_keyboard_command_list = nullptr;
std::string g_frame_keyboard_json;
bool g_frame_keyboard_enabled = false;
bool g_frame_keyboard_initialized = false;
bool g_frame_keyboard_last_ran = false;
unsigned int g_frame_keyboard_ticks = 0;
unsigned int g_frame_keyboard_last_primary_remaining_before = 0;
unsigned int g_frame_keyboard_last_primary_remaining_after = 0;
unsigned int g_frame_keyboard_last_mirror_before = 0;
unsigned int g_frame_keyboard_last_mirror_drained = 0;
unsigned int g_frame_keyboard_last_mirror_remaining = 0;
unsigned int g_frame_keyboard_last_ignored = 0;
unsigned int g_frame_keyboard_last_stream_count = 0;
unsigned int g_frame_keyboard_last_command_count = 0;
bool g_frame_keyboard_last_focus_lost_pending_before = false;
bool g_frame_keyboard_last_focus_lost_delivered = false;
std::string g_frame_keyboard_last_events_json = "[]";
std::string g_frame_keyboard_last_stream_json = "[]";

const char *raw_key_message_name(GameMessage::Type type)
{
	switch (type) {
		case GameMessage::MSG_RAW_KEY_DOWN:
			return "MSG_RAW_KEY_DOWN";
		case GameMessage::MSG_RAW_KEY_UP:
			return "MSG_RAW_KEY_UP";
		default:
			return "OTHER";
	}
}

std::string build_browser_keyboard_events_json(const BrowserKeyboard &keyboard)
{
	std::string json = "[";
	for (unsigned int index = 0; index < keyboard.eventCount(); ++index) {
		const BrowserKeyboardEvent &event = keyboard.eventAt(index);
		char buffer[220];
		std::snprintf(buffer, sizeof(buffer),
			"%s{\"message\":%u,\"virtualKey\":%lu,\"engineKey\":%u,"
			"\"state\":%u,\"mapped\":%s,\"focusLost\":%s}",
			index == 0 ? "" : ",",
			event.message,
			static_cast<unsigned long>(event.virtualKey),
			event.engineKey,
			event.state,
			bool_json(event.mapped),
			bool_json(event.focusLost));
		json += buffer;
	}
	json += "]";
	return json;
}

std::string build_original_keyboard_stream_json(GameMessage *first)
{
	std::string json = "[";
	unsigned int count = 0;
	for (GameMessage *message = first; message != nullptr && count < 32; message = message->next()) {
		const int key = message->getArgumentCount() >= 1
			&& message->getArgumentDataType(0) == ARGUMENTDATATYPE_INTEGER
				? message->getArgument(0)->integer
				: -1;
		const int state = message->getArgumentCount() >= 2
			&& message->getArgumentDataType(1) == ARGUMENTDATATYPE_INTEGER
				? message->getArgument(1)->integer
				: 0;
		char buffer[260];
		std::snprintf(buffer, sizeof(buffer),
			"%s{\"type\":%d,\"typeName\":\"%s\",\"key\":%d,\"state\":%d,"
			"\"argumentCount\":%u,\"playerIndex\":%d}",
			count == 0 ? "" : ",",
			static_cast<int>(message->getType()),
			raw_key_message_name(message->getType()),
			key,
			state,
			message->getArgumentCount(),
			message->getPlayerIndex());
		json += buffer;
		++count;
	}
	json += "]";
	return json;
}

unsigned int count_game_messages(GameMessage *first)
{
	unsigned int count = 0;
	for (GameMessage *message = first; message != nullptr; message = message->next()) {
		++count;
	}
	return count;
}

void ensure_frame_keyboard_owner()
{
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}
	if (g_frame_keyboard_global_data == nullptr) {
		g_frame_keyboard_global_data = new GlobalData;
	}
	if (g_frame_keyboard_message_stream == nullptr) {
		g_frame_keyboard_message_stream = new MessageStream;
		g_frame_keyboard_message_stream->init();
	}
	if (g_frame_keyboard_command_list == nullptr) {
		g_frame_keyboard_command_list = new CommandList;
		g_frame_keyboard_command_list->init();
	}
	g_frame_keyboard_initialized = true;
}

void clear_frame_keyboard_messages()
{
	if (!g_frame_keyboard_initialized) {
		return;
	}

	GlobalData *old_global_data = TheWritableGlobalData;
	MessageStream *old_message_stream = TheMessageStream;
	CommandList *old_command_list = TheCommandList;
	if (TheWritableGlobalData == nullptr) {
		TheWritableGlobalData = g_frame_keyboard_global_data;
	}
	TheMessageStream = g_frame_keyboard_message_stream;
	TheCommandList = g_frame_keyboard_command_list;
	if (g_frame_keyboard_message_stream->getFirstMessage() != nullptr) {
		g_frame_keyboard_message_stream->propagateMessages();
	}
	g_frame_keyboard_command_list->reset();
	TheCommandList = old_command_list;
	TheMessageStream = old_message_stream;
	TheWritableGlobalData = old_global_data;
}

const char *write_frame_keyboard_json()
{
	char buffer[16000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_original_keyboard_frame_input\","
		"\"enabled\":%s,\"initialized\":%s,\"lastRan\":%s,"
		"\"ticks\":%u,"
		"\"lifecycle\":{\"messageStream\":\"frame-owned\","
		"\"commandList\":\"frame-owned\","
		"\"memoryManager\":\"persistent\","
		"\"promotedToTickFrame\":true},"
		"\"queue\":{\"primaryRemainingBefore\":%u,"
		"\"primaryRemainingAfter\":%u,"
		"\"mirrorBefore\":%u,\"mirrorDrained\":%u,"
		"\"mirrorRemaining\":%u,\"ignored\":%u,"
		"\"primaryOverflowed\":%s,\"mirrorOverflowed\":%s},"
		"\"focusLost\":{\"pendingBefore\":%s,\"delivered\":%s,"
		"\"queuedCount\":%u},"
		"\"inputFrame\":%u,"
		"\"events\":%s,"
		"\"stream\":{\"count\":%u,\"messages\":%s},"
		"\"commandList\":{\"countAfterPropagate\":%u},"
		"\"modifiers\":%d,"
		"\"keyStatus\":{\"aDown\":%s,\"leftShiftDown\":%s}}",
		bool_json(g_frame_keyboard_enabled),
		bool_json(g_frame_keyboard_initialized),
		bool_json(g_frame_keyboard_last_ran),
		g_frame_keyboard_ticks,
		g_frame_keyboard_last_primary_remaining_before,
		g_frame_keyboard_last_primary_remaining_after,
		g_frame_keyboard_last_mirror_before,
		g_frame_keyboard_last_mirror_drained,
		g_frame_keyboard_last_mirror_remaining,
		g_frame_keyboard_last_ignored,
		bool_json(WasmWin32Input::message_queue_overflowed),
		bool_json(WasmWin32Input::keyboard_message_queue_overflowed),
		bool_json(g_frame_keyboard_last_focus_lost_pending_before),
		bool_json(g_frame_keyboard_last_focus_lost_delivered),
		g_browser_keyboard.focusLostQueuedCount(),
		g_browser_keyboard.inputFrame(),
		g_frame_keyboard_last_events_json.c_str(),
		g_frame_keyboard_last_stream_count,
		g_frame_keyboard_last_stream_json.c_str(),
		g_frame_keyboard_last_command_count,
		g_browser_keyboard.getModifierFlags(),
		bool_json(g_browser_keyboard.keyDown(KEY_A)),
		bool_json(g_browser_keyboard.keyDown(KEY_LSHIFT)));
	g_frame_keyboard_json = buffer;
	return g_frame_keyboard_json.c_str();
}

void update_original_keyboard_frame_input()
{
	if (!g_frame_keyboard_enabled) {
		g_frame_keyboard_last_ran = false;
		write_frame_keyboard_json();
		return;
	}

	ensure_frame_keyboard_owner();
	g_frame_keyboard_last_ran = true;
	++g_frame_keyboard_ticks;
	g_frame_keyboard_last_primary_remaining_before = WasmWin32Input::message_queue_count;
	g_frame_keyboard_last_mirror_before = WasmWin32Input::keyboard_message_queue_count;
	g_frame_keyboard_last_focus_lost_pending_before = g_browser_keyboard.focusLostPending();

	GlobalData *old_global_data = TheWritableGlobalData;
	MessageStream *old_message_stream = TheMessageStream;
	CommandList *old_command_list = TheCommandList;
	Keyboard *old_keyboard = TheKeyboard;
	if (TheWritableGlobalData == nullptr) {
		TheWritableGlobalData = g_frame_keyboard_global_data;
	}
	TheMessageStream = g_frame_keyboard_message_stream;
	TheCommandList = g_frame_keyboard_command_list;
	TheKeyboard = &g_browser_keyboard;

	g_frame_keyboard_last_mirror_drained = g_browser_keyboard.loadMirroredKeyMessages();
	g_browser_keyboard.update();
	g_browser_keyboard.createStreamMessages();

	GameMessage *first = g_frame_keyboard_message_stream->getFirstMessage();
	g_frame_keyboard_last_stream_count = count_game_messages(first);
	g_frame_keyboard_last_events_json = build_browser_keyboard_events_json(g_browser_keyboard);
	g_frame_keyboard_last_stream_json = build_original_keyboard_stream_json(first);
	g_frame_keyboard_last_ignored = g_browser_keyboard.ignoredCount();
	g_frame_keyboard_last_mirror_remaining = WasmWin32Input::keyboard_message_queue_count;
	g_frame_keyboard_last_primary_remaining_after = WasmWin32Input::message_queue_count;
	g_frame_keyboard_last_focus_lost_delivered = g_browser_keyboard.focusLostDelivered();

	g_frame_keyboard_message_stream->propagateMessages();
	g_frame_keyboard_last_command_count =
		count_game_messages(g_frame_keyboard_command_list->getFirstMessage());
	g_frame_keyboard_command_list->reset();

	TheKeyboard = old_keyboard;
	TheCommandList = old_command_list;
	TheMessageStream = old_message_stream;
	TheWritableGlobalData = old_global_data;
	write_frame_keyboard_json();
}

const char *set_original_keyboard_frame_input_enabled(bool enabled)
{
	g_frame_keyboard_enabled = enabled;
	if (enabled) {
		ensure_frame_keyboard_owner();
	}
	write_frame_keyboard_json();
	return g_frame_keyboard_json.c_str();
}

const char *reset_original_keyboard_frame_input()
{
	ensure_frame_keyboard_owner();
	clear_frame_keyboard_messages();
	g_browser_keyboard.resetProbeState();
	WasmWin32Input::keyboard_message_queue_count = 0;
	WasmWin32Input::keyboard_message_queue_overflowed = false;
	for (unsigned int index = 0; index < WasmWin32Input::KeyboardMessageQueueCapacity(); ++index) {
		WasmWin32Input::keyboard_message_queue[index] = {};
	}
	g_frame_keyboard_last_ran = false;
	g_frame_keyboard_ticks = 0;
	g_frame_keyboard_last_primary_remaining_before = 0;
	g_frame_keyboard_last_primary_remaining_after = 0;
	g_frame_keyboard_last_mirror_before = 0;
	g_frame_keyboard_last_mirror_drained = 0;
	g_frame_keyboard_last_mirror_remaining = 0;
	g_frame_keyboard_last_ignored = 0;
	g_frame_keyboard_last_stream_count = 0;
	g_frame_keyboard_last_command_count = 0;
	g_frame_keyboard_last_focus_lost_pending_before = false;
	g_frame_keyboard_last_focus_lost_delivered = false;
	g_frame_keyboard_last_events_json = "[]";
	g_frame_keyboard_last_stream_json = "[]";
	write_frame_keyboard_json();
	return g_frame_keyboard_json.c_str();
}

const char *probe_original_keyboard_stream()
{
	ScopedOriginalMemoryManager memory_scope;
	GlobalData global_data;
	MessageStream stream;

	GlobalData *old_global_data = TheWritableGlobalData;
	MessageStream *old_message_stream = TheMessageStream;
	Keyboard *old_keyboard = TheKeyboard;
	TheWritableGlobalData = &global_data;
	TheMessageStream = &stream;
	TheKeyboard = &g_browser_keyboard;

	const unsigned int before_count = WasmWin32Input::message_queue_count;
	const bool focus_lost_pending_before = g_browser_keyboard.focusLostPending();
	const unsigned int drained = g_browser_keyboard.loadQueuedKeyMessages();
	g_browser_keyboard.update();
	g_browser_keyboard.createStreamMessages();
	GameMessage *first = stream.getFirstMessage();
	const unsigned int stream_count = count_game_messages(first);
	const std::string events_json = build_browser_keyboard_events_json(g_browser_keyboard);
	const std::string stream_json = build_original_keyboard_stream_json(first);
	const bool ok = !WasmWin32Input::message_queue_overflowed;

	char buffer[12000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_original_keyboard_stream\","
		"\"ok\":%s,\"keyboardAttached\":%s,"
		"\"queue\":{\"before\":%u,\"drained\":%u,\"ignored\":%u,\"remaining\":%u,"
		"\"overflowed\":%s},"
		"\"focusLost\":{\"pendingBefore\":%s,\"delivered\":%s,\"queuedCount\":%u},"
		"\"inputFrame\":%u,"
		"\"events\":%s,"
		"\"stream\":{\"count\":%u,\"messages\":%s},"
		"\"modifiers\":%d,"
		"\"keyStatus\":{\"aDown\":%s,\"leftShiftDown\":%s}}",
		bool_json(ok),
		bool_json(TheKeyboard == &g_browser_keyboard),
		before_count,
		drained,
		g_browser_keyboard.ignoredCount(),
		WasmWin32Input::message_queue_count,
		bool_json(WasmWin32Input::message_queue_overflowed),
		bool_json(focus_lost_pending_before),
		bool_json(g_browser_keyboard.focusLostDelivered()),
		g_browser_keyboard.focusLostQueuedCount(),
		g_browser_keyboard.inputFrame(),
		events_json.c_str(),
		stream_count,
		stream_json.c_str(),
		g_browser_keyboard.getModifierFlags(),
		bool_json(g_browser_keyboard.keyDown(KEY_A)),
		bool_json(g_browser_keyboard.keyDown(KEY_LSHIFT)));
	g_original_keyboard_json = buffer;

	TheKeyboard = old_keyboard;
	TheMessageStream = old_message_stream;
	TheWritableGlobalData = old_global_data;
	return g_original_keyboard_json.c_str();
}

const char *probe_original_keyboard_frame_tick()
{
	ScopedOriginalMemoryManager memory_scope;
	GlobalData global_data;
	MessageStream stream;

	GlobalData *old_global_data = TheWritableGlobalData;
	MessageStream *old_message_stream = TheMessageStream;
	Keyboard *old_keyboard = TheKeyboard;
	TheWritableGlobalData = &global_data;
	TheMessageStream = &stream;
	TheKeyboard = &g_browser_keyboard;

	const unsigned int before_count = WasmWin32Input::message_queue_count;
	const bool focus_lost_pending_before = g_browser_keyboard.focusLostPending();
	const unsigned int drained = g_browser_keyboard.loadQueuedKeyMessages();
	g_browser_keyboard.update();
	g_browser_keyboard.createStreamMessages();
	GameMessage *first = stream.getFirstMessage();
	const unsigned int stream_count = count_game_messages(first);
	const std::string events_json = build_browser_keyboard_events_json(g_browser_keyboard);
	const std::string stream_json = build_original_keyboard_stream_json(first);
	const bool ok = !WasmWin32Input::message_queue_overflowed;

	char buffer[12000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_original_keyboard_frame_tick\","
		"\"ok\":%s,\"keyboardAttached\":%s,"
		"\"frameTick\":{\"probe\":true,\"messageStream\":\"probe-local\","
		"\"promotedToTickFrame\":false},"
		"\"queue\":{\"before\":%u,\"drained\":%u,\"ignored\":%u,\"remaining\":%u,"
		"\"overflowed\":%s},"
		"\"focusLost\":{\"pendingBefore\":%s,\"delivered\":%s,\"queuedCount\":%u},"
		"\"inputFrame\":%u,"
		"\"events\":%s,"
		"\"stream\":{\"count\":%u,\"messages\":%s},"
		"\"modifiers\":%d,"
		"\"keyStatus\":{\"aDown\":%s,\"leftShiftDown\":%s}}",
		bool_json(ok),
		bool_json(TheKeyboard == &g_browser_keyboard),
		before_count,
		drained,
		g_browser_keyboard.ignoredCount(),
		WasmWin32Input::message_queue_count,
		bool_json(WasmWin32Input::message_queue_overflowed),
		bool_json(focus_lost_pending_before),
		bool_json(g_browser_keyboard.focusLostDelivered()),
		g_browser_keyboard.focusLostQueuedCount(),
		g_browser_keyboard.inputFrame(),
		events_json.c_str(),
		stream_count,
		stream_json.c_str(),
		g_browser_keyboard.getModifierFlags(),
		bool_json(g_browser_keyboard.keyDown(KEY_A)),
		bool_json(g_browser_keyboard.keyDown(KEY_LSHIFT)));
	g_original_keyboard_json = buffer;

	TheKeyboard = old_keyboard;
	TheMessageStream = old_message_stream;
	TheWritableGlobalData = old_global_data;
	return g_original_keyboard_json.c_str();
}

const char *reset_original_keyboard_stream()
{
	g_browser_keyboard.resetProbeState();

	char buffer[500];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_original_keyboard_reset\","
		"\"ok\":true,\"inputFrame\":%u,\"modifiers\":%d,"
		"\"focusLost\":{\"pending\":%s,\"queuedCount\":%u},"
		"\"keyStatus\":{\"aDown\":%s,\"leftShiftDown\":%s}}",
		g_browser_keyboard.inputFrame(),
		g_browser_keyboard.getModifierFlags(),
		bool_json(g_browser_keyboard.focusLostPending()),
		g_browser_keyboard.focusLostQueuedCount(),
		bool_json(g_browser_keyboard.keyDown(KEY_A)),
		bool_json(g_browser_keyboard.keyDown(KEY_LSHIFT)));
	g_original_keyboard_json = buffer;
	return g_original_keyboard_json.c_str();
}

const char *queue_original_keyboard_focus_lost()
{
	g_browser_keyboard.queueFocusLost();

	char buffer[400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_original_keyboard_focus_lost\","
		"\"ok\":true,\"pending\":%s,\"queuedCount\":%u}",
		bool_json(g_browser_keyboard.focusLostPending()),
		g_browser_keyboard.focusLostQueuedCount());
	g_original_keyboard_json = buffer;
	return g_original_keyboard_json.c_str();
}

} // namespace

extern "C" {

void cnc_port_update_original_keyboard_frame_input()
{
	update_original_keyboard_frame_input();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_set_original_keyboard_frame_input_enabled(int enabled)
{
	return set_original_keyboard_frame_input_enabled(enabled != 0);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_reset_original_keyboard_frame_input()
{
	return reset_original_keyboard_frame_input();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_keyboard_frame_input()
{
	return write_frame_keyboard_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_keyboard_input()
{
	return probe_original_keyboard_stream();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_keyboard_frame_tick()
{
	return probe_original_keyboard_frame_tick();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_reset_original_keyboard_input()
{
	return reset_original_keyboard_stream();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_queue_original_keyboard_focus_lost()
{
	return queue_original_keyboard_focus_lost();
}

}
