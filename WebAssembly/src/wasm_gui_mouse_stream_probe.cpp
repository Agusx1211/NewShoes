#include "PreRTS.h"

#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "GameClient/Gadget.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/Keyboard.h"
#include "GameClient/KeyDefs.h"
#include "GameClient/Mouse.h"
#include "GameClient/WindowXlat.h"
#include "Win32Device/GameClient/Win32Mouse.h"
#include "wasm_memory_manager_scope.h"

#include <cstddef>
#include <cstdio>
#include <new>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

void cnc_port_service_original_wndproc_messages();
void cnc_port_prepare_original_wndproc_mouse_stream(int width, int height);
Bool cnc_port_original_wndproc_mouse_stream_attached();
UnsignedInt cnc_port_original_wndproc_mouse_stream_input_frame();
Int cnc_port_original_wndproc_mouse_stream_events_this_frame();
extern "C" void cnc_port_ensure_original_keyboard_frame_input_owner();
extern "C" GlobalData *cnc_port_original_frame_input_global_data();

extern Win32Mouse *TheWin32Mouse;

class DisplayStringManager;
class InGameUI;
class Shell;

// Storage for original singletons referenced by linked GUI/display code outside
// this focused probe. They stay null here because those subsystems are not booted.
DisplayStringManager *TheDisplayStringManager = nullptr;
InGameUI *TheInGameUI = nullptr;
Shell *TheShell = nullptr;

// Keep this browser GUI input probe focused on event routing without linking
// the .wnd layout parser and function lexicon callback tables.
GameWindow *GameWindowManager::winCreateFromScript(AsciiString, WindowLayoutInfo *)
{
	return nullptr;
}

WindowLayout *GameWindowManager::winCreateLayout(AsciiString)
{
	return nullptr;
}

void GameWindowManager::freeStaticStrings()
{
}

WindowLayoutInfo::WindowLayoutInfo() :
	version(0),
	init(NULL),
	update(NULL),
	shutdown(NULL),
	initNameString(AsciiString::TheEmptyString),
	updateNameString(AsciiString::TheEmptyString),
	shutdownNameString(AsciiString::TheEmptyString)
{
	windows.clear();
}

namespace {

struct GuiInputCapture
{
	Int leftDownCount = 0;
	Int leftUpCount = 0;
	Int leftDragCount = 0;
	Int mousePosCount = 0;
	Int enteringCount = 0;
	Int wheelUpCount = 0;
	Int wheelDownCount = 0;
	Int buttonSelectedCount = 0;
	GameWindowMessage lastMessage = GWM_NONE;
	GameWindow *buttonSelectedWindow = nullptr;
	ICoord2D lastMouse = { 0, 0 };
	ICoord2D leftDownMouse = { 0, 0 };
	ICoord2D leftUpMouse = { 0, 0 };
	ICoord2D leftDragMouse = { 0, 0 };
	ICoord2D wheelMouse = { 0, 0 };
	ICoord2D buttonSelectedMouse = { 0, 0 };
};

class ProbeGameWindow : public GameWindow
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(ProbeGameWindow, "ProbeGameWindow", 1, 1)

public:
	ProbeGameWindow() = default;
	void winDrawBorder() override {}
};

EMPTY_DTOR(ProbeGameWindow)

class ProbeGameWindowManager : public GameWindowManager
{
public:
	GameWindow *allocateNewWindow() override { return newInstance(ProbeGameWindow); }

	GameWinDrawFunc getPushButtonImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getPushButtonDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getCheckBoxImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getCheckBoxDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getRadioButtonImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getRadioButtonDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTabControlImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTabControlDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getListBoxImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getListBoxDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getComboBoxImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getComboBoxDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getHorizontalSliderImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getHorizontalSliderDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getVerticalSliderImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getVerticalSliderDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getProgressBarImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getProgressBarDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getStaticTextImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getStaticTextDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTextEntryImageDrawFunc() override { return getDefaultDraw(); }
	GameWinDrawFunc getTextEntryDrawFunc() override { return getDefaultDraw(); }
	GameFont *winFindFont(AsciiString, Int, Bool) override { return nullptr; }
};

class ProbeKeyboard : public Keyboard
{
public:
	Bool getCapsState() override { return FALSE; }

protected:
	void getKey(KeyboardIO *key) override
	{
		key->key = KEY_NONE;
		key->status = KeyboardIO::STATUS_UNUSED;
		key->state = KEY_STATE_NONE;
		key->sequence = 0;
	}
};

std::string g_original_gui_mouse_stream_json;
GlobalData *g_frame_mouse_global_data = nullptr;
ProbeKeyboard *g_frame_mouse_keyboard = nullptr;
MessageStream *g_frame_mouse_message_stream = nullptr;
CommandList *g_frame_mouse_command_list = nullptr;
ProbeGameWindowManager *g_frame_mouse_window_manager = nullptr;
ProbeGameWindow *g_frame_mouse_window = nullptr;
GameWindow *g_frame_mouse_button = nullptr;
GuiInputCapture g_frame_mouse_capture;
alignas(ProbeGameWindow) unsigned char g_frame_mouse_window_storage[sizeof(ProbeGameWindow)];
alignas(ProbeGameWindow) unsigned char g_frame_mouse_button_storage[sizeof(ProbeGameWindow)];
char g_frame_mouse_json[12000] = "{}";
bool g_frame_mouse_enabled = false;
bool g_frame_mouse_initialized = false;
bool g_frame_mouse_gui_attached = false;
bool g_frame_mouse_last_ran = false;
unsigned int g_frame_mouse_ticks = 0;
unsigned int g_frame_mouse_last_queue_before = 0;
unsigned int g_frame_mouse_last_queue_after = 0;
unsigned int g_frame_mouse_last_stream_count = 0;
unsigned int g_frame_mouse_last_command_count = 0;
UnsignedInt g_frame_mouse_last_input_frame = 0;
Int g_frame_mouse_last_events_this_frame = 0;
bool g_frame_mouse_last_win32_attached = false;
bool g_frame_mouse_last_stream_attached = false;
char g_frame_mouse_last_stream_json[8000] = "[]";

constexpr Int FRAME_MOUSE_BUTTON_X = 32;
constexpr Int FRAME_MOUSE_BUTTON_Y = 32;
constexpr Int FRAME_MOUSE_BUTTON_WIDTH = 96;
constexpr Int FRAME_MOUSE_BUTTON_HEIGHT = 32;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

WindowMsgHandledType capture_gui_input(GameWindow *window,
	UnsignedInt msg,
	WindowMsgData mData1,
	WindowMsgData)
{
	GuiInputCapture *capture = static_cast<GuiInputCapture *>(window->winGetUserData());
	if (capture == nullptr) {
		return MSG_IGNORED;
	}

	capture->lastMessage = static_cast<GameWindowMessage>(msg);
	capture->lastMouse.x = LOLONGTOSHORT(mData1);
	capture->lastMouse.y = HILONGTOSHORT(mData1);

	if (msg == GWM_MOUSE_ENTERING) {
		++capture->enteringCount;
		return MSG_IGNORED;
	}

	if (msg == GWM_MOUSE_POS) {
		++capture->mousePosCount;
		return MSG_HANDLED;
	}

	if (msg == GWM_LEFT_DOWN) {
		++capture->leftDownCount;
		capture->leftDownMouse = capture->lastMouse;
		return MSG_HANDLED;
	}

	if (msg == GWM_LEFT_UP) {
		++capture->leftUpCount;
		capture->leftUpMouse = capture->lastMouse;
		return MSG_HANDLED;
	}

	if (msg == GWM_LEFT_DRAG) {
		++capture->leftDragCount;
		capture->leftDragMouse = capture->lastMouse;
		return MSG_HANDLED;
	}

	if (msg == GWM_WHEEL_UP) {
		++capture->wheelUpCount;
		capture->wheelMouse = capture->lastMouse;
		return MSG_HANDLED;
	}

	if (msg == GWM_WHEEL_DOWN) {
		++capture->wheelDownCount;
		capture->wheelMouse = capture->lastMouse;
		return MSG_HANDLED;
	}

	return MSG_IGNORED;
}

WindowMsgHandledType capture_gui_system(GameWindow *window,
	UnsignedInt msg,
	WindowMsgData mData1,
	WindowMsgData mData2)
{
	GuiInputCapture *capture = static_cast<GuiInputCapture *>(window->winGetUserData());
	if (capture == nullptr) {
		return MSG_IGNORED;
	}

	if (msg == GBM_SELECTED) {
		++capture->buttonSelectedCount;
		capture->buttonSelectedWindow = reinterpret_cast<GameWindow *>(mData1);
		capture->buttonSelectedMouse.x = LOLONGTOSHORT(mData2);
		capture->buttonSelectedMouse.y = HILONGTOSHORT(mData2);
		return MSG_HANDLED;
	}

	return MSG_IGNORED;
}

unsigned int count_game_messages(GameMessage *first)
{
	unsigned int count = 0;
	for (GameMessage *message = first; message != nullptr; message = message->next()) {
		++count;
	}
	return count;
}

const char *raw_mouse_message_name(GameMessage::Type type)
{
	switch (type) {
		case GameMessage::MSG_RAW_MOUSE_POSITION:
			return "MSG_RAW_MOUSE_POSITION";
		case GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN:
			return "MSG_RAW_MOUSE_LEFT_BUTTON_DOWN";
		case GameMessage::MSG_RAW_MOUSE_LEFT_DOUBLE_CLICK:
			return "MSG_RAW_MOUSE_LEFT_DOUBLE_CLICK";
		case GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_UP:
			return "MSG_RAW_MOUSE_LEFT_BUTTON_UP";
		case GameMessage::MSG_RAW_MOUSE_LEFT_DRAG:
			return "MSG_RAW_MOUSE_LEFT_DRAG";
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_BUTTON_DOWN:
			return "MSG_RAW_MOUSE_MIDDLE_BUTTON_DOWN";
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_DOUBLE_CLICK:
			return "MSG_RAW_MOUSE_MIDDLE_DOUBLE_CLICK";
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_BUTTON_UP:
			return "MSG_RAW_MOUSE_MIDDLE_BUTTON_UP";
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_DRAG:
			return "MSG_RAW_MOUSE_MIDDLE_DRAG";
		case GameMessage::MSG_RAW_MOUSE_RIGHT_BUTTON_DOWN:
			return "MSG_RAW_MOUSE_RIGHT_BUTTON_DOWN";
		case GameMessage::MSG_RAW_MOUSE_RIGHT_DOUBLE_CLICK:
			return "MSG_RAW_MOUSE_RIGHT_DOUBLE_CLICK";
		case GameMessage::MSG_RAW_MOUSE_RIGHT_BUTTON_UP:
			return "MSG_RAW_MOUSE_RIGHT_BUTTON_UP";
		case GameMessage::MSG_RAW_MOUSE_RIGHT_DRAG:
			return "MSG_RAW_MOUSE_RIGHT_DRAG";
		case GameMessage::MSG_RAW_MOUSE_WHEEL:
			return "MSG_RAW_MOUSE_WHEEL";
		default:
			return "OTHER";
	}
}

int pixel_arg_x(GameMessage *message, Int index)
{
	return message != nullptr
		&& index >= 0
		&& message->getArgumentCount() > index
		&& message->getArgumentDataType(index) == ARGUMENTDATATYPE_PIXEL
			? message->getArgument(index)->pixel.x
			: -1;
}

int pixel_arg_y(GameMessage *message, Int index)
{
	return message != nullptr
		&& index >= 0
		&& message->getArgumentCount() > index
		&& message->getArgumentDataType(index) == ARGUMENTDATATYPE_PIXEL
			? message->getArgument(index)->pixel.y
			: -1;
}

int integer_arg(GameMessage *message, Int index)
{
	return message != nullptr
		&& index >= 0
		&& message->getArgumentCount() > index
		&& message->getArgumentDataType(index) == ARGUMENTDATATYPE_INTEGER
			? message->getArgument(index)->integer
			: 0;
}

bool raw_mouse_has_position(GameMessage::Type type)
{
	switch (type) {
		case GameMessage::MSG_RAW_MOUSE_POSITION:
		case GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN:
		case GameMessage::MSG_RAW_MOUSE_LEFT_DOUBLE_CLICK:
		case GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_UP:
		case GameMessage::MSG_RAW_MOUSE_LEFT_DRAG:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_BUTTON_DOWN:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_DOUBLE_CLICK:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_BUTTON_UP:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_DRAG:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_BUTTON_DOWN:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_DOUBLE_CLICK:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_BUTTON_UP:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_DRAG:
		case GameMessage::MSG_RAW_MOUSE_WHEEL:
			return true;
		default:
			return false;
	}
}

bool raw_mouse_has_modifiers(GameMessage::Type type)
{
	return raw_mouse_has_position(type);
}

bool raw_mouse_has_timestamp(GameMessage::Type type)
{
	switch (type) {
		case GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN:
		case GameMessage::MSG_RAW_MOUSE_LEFT_DOUBLE_CLICK:
		case GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_UP:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_BUTTON_DOWN:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_DOUBLE_CLICK:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_BUTTON_UP:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_BUTTON_DOWN:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_DOUBLE_CLICK:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_BUTTON_UP:
			return true;
		default:
			return false;
	}
}

bool raw_mouse_has_drag_delta(GameMessage::Type type)
{
	switch (type) {
		case GameMessage::MSG_RAW_MOUSE_LEFT_DRAG:
		case GameMessage::MSG_RAW_MOUSE_MIDDLE_DRAG:
		case GameMessage::MSG_RAW_MOUSE_RIGHT_DRAG:
			return true;
		default:
			return false;
	}
}

bool raw_mouse_has_wheel_clicks(GameMessage::Type type)
{
	return type == GameMessage::MSG_RAW_MOUSE_WHEEL;
}

int raw_mouse_modifiers(GameMessage *message)
{
	if (message == nullptr || !raw_mouse_has_modifiers(message->getType())) {
		return -1;
	}

	if (raw_mouse_has_drag_delta(message->getType())
		|| raw_mouse_has_wheel_clicks(message->getType())) {
		return integer_arg(message, 2);
	}

	return integer_arg(message, 1);
}

int raw_mouse_timestamp(GameMessage *message)
{
	return message != nullptr && raw_mouse_has_timestamp(message->getType())
		? integer_arg(message, 2)
		: -1;
}

int raw_mouse_wheel_clicks(GameMessage *message)
{
	return message != nullptr && raw_mouse_has_wheel_clicks(message->getType())
		? integer_arg(message, 1)
		: 0;
}

void append_json_fragment(char *json, std::size_t json_size, std::size_t &used, const char *fragment)
{
	if (used >= json_size) {
		return;
	}

	const int written = std::snprintf(json + used, json_size - used, "%s", fragment);
	if (written <= 0) {
		return;
	}

	const std::size_t remaining = json_size - used;
	used += static_cast<std::size_t>(written) < remaining
		? static_cast<std::size_t>(written)
		: remaining - 1;
}

void build_original_mouse_stream_json(GameMessage *first, char *json, std::size_t json_size)
{
	if (json_size == 0) {
		return;
	}

	std::size_t used = 0;
	append_json_fragment(json, json_size, used, "[");
	unsigned int count = 0;
	for (GameMessage *message = first; message != nullptr && count < 16; message = message->next()) {
		const GameMessage::Type type = message->getType();
		const bool has_position = raw_mouse_has_position(type);
		const bool has_modifiers = raw_mouse_has_modifiers(type);
		const bool has_timestamp = raw_mouse_has_timestamp(type);
		const bool has_drag_delta = raw_mouse_has_drag_delta(type);
		const bool has_wheel_clicks = raw_mouse_has_wheel_clicks(type);
		char buffer[900];
		std::snprintf(buffer, sizeof(buffer),
			"%s{\"type\":%d,\"typeName\":\"%s\",\"argumentCount\":%u,"
			"\"playerIndex\":%d,\"x\":%d,\"y\":%d,\"deltaX\":%d,\"deltaY\":%d,"
			"\"integer1\":%d,\"integer2\":%d,"
			"\"hasPosition\":%s,\"positionX\":%d,\"positionY\":%d,"
			"\"hasModifiers\":%s,\"modifiers\":%d,"
			"\"hasTimestamp\":%s,\"timestamp\":%d,"
			"\"hasDragDelta\":%s,\"dragDeltaX\":%d,\"dragDeltaY\":%d,"
			"\"hasWheelClicks\":%s,\"wheelClicks\":%d}",
			count == 0 ? "" : ",",
			static_cast<int>(type),
			raw_mouse_message_name(type),
			message->getArgumentCount(),
			message->getPlayerIndex(),
			pixel_arg_x(message, 0),
			pixel_arg_y(message, 0),
			pixel_arg_x(message, 1),
			pixel_arg_y(message, 1),
			integer_arg(message, 1),
			integer_arg(message, 2),
			bool_json(has_position),
			has_position ? pixel_arg_x(message, 0) : -1,
			has_position ? pixel_arg_y(message, 0) : -1,
			bool_json(has_modifiers),
			raw_mouse_modifiers(message),
			bool_json(has_timestamp),
			raw_mouse_timestamp(message),
			bool_json(has_drag_delta),
			has_drag_delta ? pixel_arg_x(message, 1) : 0,
			has_drag_delta ? pixel_arg_y(message, 1) : 0,
			bool_json(has_wheel_clicks),
			raw_mouse_wheel_clicks(message));
		append_json_fragment(json, json_size, used, buffer);
		++count;
	}
	append_json_fragment(json, json_size, used, "]");
}

void ensure_frame_mouse_owner()
{
	cnc_port_ensure_original_keyboard_frame_input_owner();
	if (!isMemoryManagerOfficiallyInited()) {
		initMemoryManager();
	}
	if (g_frame_mouse_global_data == nullptr) {
		g_frame_mouse_global_data = cnc_port_original_frame_input_global_data();
	}
	if (g_frame_mouse_keyboard == nullptr) {
		g_frame_mouse_keyboard = new ProbeKeyboard;
	}
	if (g_frame_mouse_message_stream == nullptr) {
		g_frame_mouse_message_stream = new MessageStream;
		g_frame_mouse_message_stream->init();
	}
	if (g_frame_mouse_command_list == nullptr) {
		g_frame_mouse_command_list = new CommandList;
		g_frame_mouse_command_list->init();
	}
	if (g_frame_mouse_window_manager == nullptr) {
		g_frame_mouse_window_manager = new ProbeGameWindowManager;
	}
	if (g_frame_mouse_window == nullptr) {
		GameWindowManager *old_window_manager = TheWindowManager;
		TheWindowManager = g_frame_mouse_window_manager;
		// GameWindow construction reads TheWindowManager defaults; keep this
		// persistent frame window outside the pooled transient window path.
		g_frame_mouse_window = ::new (static_cast<void *>(&g_frame_mouse_window_storage[0])) ProbeGameWindow;
		g_frame_mouse_window->winSetUserData(&g_frame_mouse_capture);
		g_frame_mouse_window->winSetInputFunc(capture_gui_input);
		g_frame_mouse_window->winSetSystemFunc(capture_gui_system);
		g_frame_mouse_window->winSetStatus(WIN_STATUS_ENABLED);
		g_frame_mouse_window->winSetPosition(0, 0);
		g_frame_mouse_window->winSetSize(4096, 4096);
		g_frame_mouse_window_manager->linkWindow(g_frame_mouse_window);
		TheWindowManager = old_window_manager;
	}
	if (g_frame_mouse_button == nullptr && g_frame_mouse_window != nullptr) {
		GameWindowManager *old_window_manager = TheWindowManager;
		TheWindowManager = g_frame_mouse_window_manager;
		// Match the root probe window's lifetime: the frame-owned harness reuses
		// this child across resets and only clears capture/grab state.
		g_frame_mouse_button = ::new (static_cast<void *>(&g_frame_mouse_button_storage[0])) ProbeGameWindow;
		g_frame_mouse_button->winSetStatus(WIN_STATUS_ENABLED);
		g_frame_mouse_button->winSetPosition(FRAME_MOUSE_BUTTON_X, FRAME_MOUSE_BUTTON_Y);
		g_frame_mouse_button->winSetSize(FRAME_MOUSE_BUTTON_WIDTH, FRAME_MOUSE_BUTTON_HEIGHT);
		g_frame_mouse_button->winGetInstanceData()->m_style = GWS_PUSH_BUTTON | GWS_MOUSE_TRACK;
		g_frame_mouse_button->winSetOwner(g_frame_mouse_window);
		g_frame_mouse_button->winSetSystemFunc(GadgetPushButtonSystem);
		g_frame_mouse_button->winSetInputFunc(GadgetPushButtonInput);
		g_frame_mouse_button->winSetDrawFunc(g_frame_mouse_window_manager->getDefaultDraw());
		g_frame_mouse_window_manager->addWindowToParent(g_frame_mouse_button, g_frame_mouse_window);
		g_frame_mouse_window_manager->winSendSystemMsg(g_frame_mouse_button, GWM_CREATE, 0, 0);
		TheWindowManager = old_window_manager;
	}
	if (!g_frame_mouse_gui_attached) {
		g_frame_mouse_message_stream->attachTranslator(new WindowTranslator, 100);
		g_frame_mouse_gui_attached = true;
	}
	if (!g_frame_mouse_initialized) {
		cnc_port_prepare_original_wndproc_mouse_stream(4096, 4096);
	}
	g_frame_mouse_initialized = true;
}

void reset_frame_mouse_gui_state()
{
	g_frame_mouse_capture = GuiInputCapture();
	if (g_frame_mouse_window_manager != nullptr) {
		if (g_frame_mouse_window != nullptr) {
			g_frame_mouse_window_manager->winRelease(g_frame_mouse_window);
		}
		if (g_frame_mouse_button != nullptr) {
			g_frame_mouse_window_manager->winRelease(g_frame_mouse_button);
			g_frame_mouse_button->winGetInstanceData()->m_state = 0;
		}
		g_frame_mouse_window_manager->winSetGrabWindow(nullptr);
	}
}

void clear_frame_mouse_messages()
{
	if (!g_frame_mouse_initialized) {
		return;
	}

	GlobalData *old_global_data = TheWritableGlobalData;
	Keyboard *old_keyboard = TheKeyboard;
	MessageStream *old_message_stream = TheMessageStream;
	CommandList *old_command_list = TheCommandList;
	GameWindowManager *old_window_manager = TheWindowManager;
	Mouse *old_mouse = TheMouse;
	if (TheWritableGlobalData == nullptr) {
		TheWritableGlobalData = g_frame_mouse_global_data;
	}
	TheKeyboard = g_frame_mouse_keyboard;
	TheMessageStream = g_frame_mouse_message_stream;
	TheCommandList = g_frame_mouse_command_list;
	TheWindowManager = g_frame_mouse_window_manager;
	TheMouse = TheWin32Mouse;
	if (g_frame_mouse_message_stream->getFirstMessage() != nullptr) {
		g_frame_mouse_message_stream->propagateMessages();
	}
	g_frame_mouse_command_list->reset();
	TheMouse = old_mouse;
	TheWindowManager = old_window_manager;
	TheCommandList = old_command_list;
	TheMessageStream = old_message_stream;
	TheKeyboard = old_keyboard;
	TheWritableGlobalData = old_global_data;
	reset_frame_mouse_gui_state();
}

const char *write_frame_mouse_json()
{
	const bool ok = !g_frame_mouse_enabled
		|| !g_frame_mouse_last_ran
		|| (g_frame_mouse_last_win32_attached && g_frame_mouse_last_stream_attached);
	std::snprintf(g_frame_mouse_json, sizeof(g_frame_mouse_json),
		"{\"source\":\"browser_original_mouse_frame_input\","
		"\"ok\":%s,\"enabled\":%s,\"initialized\":%s,\"lastRan\":%s,"
		"\"ticks\":%u,"
		"\"lifecycle\":{\"messageStream\":\"frame-owned\","
		"\"commandList\":\"frame-owned\","
		"\"memoryManager\":\"persistent\","
		"\"promotedToTickFrame\":true},"
		"\"queue\":{\"primaryRemainingBefore\":%u,"
		"\"primaryRemainingAfter\":%u,\"primaryOverflowed\":%s},"
		"\"mouse\":{\"win32Attached\":%s,\"streamAttached\":%s,"
		"\"inputFrame\":%u,\"eventsThisFrame\":%d},"
		"\"stream\":{\"count\":%u,\"messages\":%s},"
		"\"commandList\":{\"countAfterPropagate\":%u},"
		"\"modifiers\":%d,"
		"\"gui\":{\"attached\":%s,\"windowReady\":%s,"
		"\"buttonReady\":%s,"
		"\"buttonName\":\"frameMouseProbeButton\","
		"\"buttonX\":%d,\"buttonY\":%d,"
		"\"buttonWidth\":%d,\"buttonHeight\":%d,"
		"\"mousePos\":%d,\"leftDown\":%d,\"leftUp\":%d,"
		"\"leftDrag\":%d,\"entering\":%d,\"wheelUp\":%d,"
		"\"wheelDown\":%d,\"wheel\":%d,\"lastMessage\":%d,"
		"\"lastX\":%d,\"lastY\":%d,\"leftDownX\":%d,\"leftDownY\":%d,"
		"\"leftUpX\":%d,\"leftUpY\":%d,\"leftDragX\":%d,\"leftDragY\":%d,"
		"\"wheelX\":%d,\"wheelY\":%d,"
		"\"buttonSelected\":%d,\"buttonSelectedX\":%d,\"buttonSelectedY\":%d,"
		"\"buttonSelectedSourceMatches\":%s,"
		"\"grabbed\":%s,\"buttonGrabbed\":%s}}",
		bool_json(ok),
		bool_json(g_frame_mouse_enabled),
		bool_json(g_frame_mouse_initialized),
		bool_json(g_frame_mouse_last_ran),
		g_frame_mouse_ticks,
		g_frame_mouse_last_queue_before,
		g_frame_mouse_last_queue_after,
		bool_json(WasmWin32Input::message_queue_overflowed),
		bool_json(g_frame_mouse_last_win32_attached),
		bool_json(g_frame_mouse_last_stream_attached),
		g_frame_mouse_last_input_frame,
		g_frame_mouse_last_events_this_frame,
		g_frame_mouse_last_stream_count,
		g_frame_mouse_last_stream_json,
		g_frame_mouse_last_command_count,
		g_frame_mouse_keyboard != nullptr ? g_frame_mouse_keyboard->getModifierFlags() : 0,
		bool_json(g_frame_mouse_gui_attached),
		bool_json(g_frame_mouse_window_manager != nullptr && g_frame_mouse_window != nullptr),
		bool_json(g_frame_mouse_button != nullptr),
		FRAME_MOUSE_BUTTON_X,
		FRAME_MOUSE_BUTTON_Y,
		FRAME_MOUSE_BUTTON_WIDTH,
		FRAME_MOUSE_BUTTON_HEIGHT,
		g_frame_mouse_capture.mousePosCount,
		g_frame_mouse_capture.leftDownCount,
		g_frame_mouse_capture.leftUpCount,
		g_frame_mouse_capture.leftDragCount,
		g_frame_mouse_capture.enteringCount,
		g_frame_mouse_capture.wheelUpCount,
		g_frame_mouse_capture.wheelDownCount,
		g_frame_mouse_capture.wheelUpCount + g_frame_mouse_capture.wheelDownCount,
		static_cast<int>(g_frame_mouse_capture.lastMessage),
		g_frame_mouse_capture.lastMouse.x,
		g_frame_mouse_capture.lastMouse.y,
		g_frame_mouse_capture.leftDownMouse.x,
		g_frame_mouse_capture.leftDownMouse.y,
		g_frame_mouse_capture.leftUpMouse.x,
		g_frame_mouse_capture.leftUpMouse.y,
		g_frame_mouse_capture.leftDragMouse.x,
		g_frame_mouse_capture.leftDragMouse.y,
		g_frame_mouse_capture.wheelMouse.x,
		g_frame_mouse_capture.wheelMouse.y,
		g_frame_mouse_capture.buttonSelectedCount,
		g_frame_mouse_capture.buttonSelectedMouse.x,
		g_frame_mouse_capture.buttonSelectedMouse.y,
		bool_json(
			g_frame_mouse_button != nullptr &&
			g_frame_mouse_capture.buttonSelectedWindow == g_frame_mouse_button),
		bool_json(
			g_frame_mouse_window_manager != nullptr &&
			g_frame_mouse_window_manager->winGetGrabWindow() == g_frame_mouse_window),
		bool_json(
			g_frame_mouse_window_manager != nullptr &&
			g_frame_mouse_button != nullptr &&
			g_frame_mouse_window_manager->winGetGrabWindow() == g_frame_mouse_button));
	return g_frame_mouse_json;
}

void update_original_mouse_frame_input()
{
	if (!g_frame_mouse_enabled) {
		g_frame_mouse_last_ran = false;
		write_frame_mouse_json();
		return;
	}

	ensure_frame_mouse_owner();
	g_frame_mouse_last_ran = true;
	++g_frame_mouse_ticks;
	g_frame_mouse_last_queue_before = WasmWin32Input::message_queue_count;

	GlobalData *old_global_data = TheWritableGlobalData;
	Keyboard *old_keyboard = TheKeyboard;
	CommandList *old_command_list = TheCommandList;
	MessageStream *old_message_stream = TheMessageStream;
	GameWindowManager *old_window_manager = TheWindowManager;
	Mouse *old_mouse = TheMouse;
	if (TheWritableGlobalData == nullptr) {
		TheWritableGlobalData = g_frame_mouse_global_data;
	}
	TheKeyboard = g_frame_mouse_keyboard;
	TheCommandList = g_frame_mouse_command_list;
	TheMessageStream = g_frame_mouse_message_stream;
	TheWindowManager = g_frame_mouse_window_manager;
	TheMouse = TheWin32Mouse;

	if (TheMouse != nullptr) {
		TheMouse->UPDATE();
		TheMouse->createStreamMessages();
	}

	GameMessage *first = g_frame_mouse_message_stream->getFirstMessage();
	g_frame_mouse_last_stream_count = count_game_messages(first);
	build_original_mouse_stream_json(
		first,
		g_frame_mouse_last_stream_json,
		sizeof(g_frame_mouse_last_stream_json));
	g_frame_mouse_last_queue_after = WasmWin32Input::message_queue_count;
	g_frame_mouse_last_win32_attached = cnc_port_original_wndproc_mouse_stream_attached();
	g_frame_mouse_last_stream_attached = TheMouse == static_cast<Mouse *>(TheWin32Mouse);
	g_frame_mouse_last_input_frame = cnc_port_original_wndproc_mouse_stream_input_frame();
	g_frame_mouse_last_events_this_frame = cnc_port_original_wndproc_mouse_stream_events_this_frame();

	g_frame_mouse_message_stream->propagateMessages();
	g_frame_mouse_last_command_count =
		count_game_messages(g_frame_mouse_command_list->getFirstMessage());
	g_frame_mouse_command_list->reset();

	TheMouse = old_mouse;
	TheWindowManager = old_window_manager;
	TheMessageStream = old_message_stream;
	TheCommandList = old_command_list;
	TheKeyboard = old_keyboard;
	TheWritableGlobalData = old_global_data;
	write_frame_mouse_json();
}

const char *set_original_mouse_frame_input_enabled(bool enabled)
{
	g_frame_mouse_enabled = enabled;
	if (enabled) {
		ensure_frame_mouse_owner();
	}
	write_frame_mouse_json();
	return g_frame_mouse_json;
}

const char *reset_original_mouse_frame_input()
{
	const bool had_frame_owner = g_frame_mouse_initialized;
	ensure_frame_mouse_owner();
	if (had_frame_owner) {
		clear_frame_mouse_messages();
	} else {
		reset_frame_mouse_gui_state();
	}
	cnc_port_prepare_original_wndproc_mouse_stream(4096, 4096);
	g_frame_mouse_last_ran = false;
	g_frame_mouse_ticks = 0;
	g_frame_mouse_last_queue_before = 0;
	g_frame_mouse_last_queue_after = 0;
	g_frame_mouse_last_stream_count = 0;
	g_frame_mouse_last_command_count = 0;
	g_frame_mouse_last_input_frame = cnc_port_original_wndproc_mouse_stream_input_frame();
	g_frame_mouse_last_events_this_frame = cnc_port_original_wndproc_mouse_stream_events_this_frame();
	g_frame_mouse_last_win32_attached = cnc_port_original_wndproc_mouse_stream_attached();
	g_frame_mouse_last_stream_attached = false;
	reset_frame_mouse_gui_state();
	std::snprintf(g_frame_mouse_last_stream_json, sizeof(g_frame_mouse_last_stream_json), "[]");
	write_frame_mouse_json();
	return g_frame_mouse_json;
}

const char *probe_original_gui_mouse_stream()
{
	ScopedOriginalMemoryManager memory_scope;
	GlobalData global_data;
	ProbeKeyboard keyboard;
	CommandList command_list;
	MessageStream stream;
	ProbeGameWindowManager manager;
	GuiInputCapture capture;

	GlobalData *old_global_data = TheWritableGlobalData;
	Keyboard *old_keyboard = TheKeyboard;
	CommandList *old_command_list = TheCommandList;
	MessageStream *old_message_stream = TheMessageStream;
	GameWindowManager *old_window_manager = TheWindowManager;
	Mouse *old_mouse = TheMouse;

	const unsigned int queue_before = WasmWin32Input::message_queue_count;
	const bool overflowed_before = WasmWin32Input::message_queue_overflowed;

	TheWritableGlobalData = &global_data;
	TheKeyboard = &keyboard;
	TheCommandList = &command_list;
	TheMessageStream = &stream;
	TheWindowManager = &manager;
	TheMouse = TheWin32Mouse;

	cnc_port_prepare_original_wndproc_mouse_stream(4096, 4096);

	ProbeGameWindow *window = static_cast<ProbeGameWindow *>(manager.allocateNewWindow());
	window->winSetUserData(&capture);
	window->winSetInputFunc(capture_gui_input);
	window->winSetStatus(WIN_STATUS_ENABLED);
	window->winSetPosition(0, 0);
	window->winSetSize(4096, 4096);
	manager.linkWindow(window);

	stream.attachTranslator(new WindowTranslator, 100);
	cnc_port_service_original_wndproc_messages();

	if (TheMouse != nullptr) {
		TheMouse->UPDATE();
		TheMouse->createStreamMessages();
	}

	GameMessage *position = stream.getFirstMessage();
	GameMessage *left_down = position != nullptr ? position->next() : nullptr;
	const unsigned int stream_count_before = count_game_messages(position);
	const bool raw_position =
		position != nullptr && position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION;
	const bool raw_left_down =
		left_down != nullptr && left_down->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN;
	const int first_type = position != nullptr ? static_cast<int>(position->getType()) : -1;
	const int second_type = left_down != nullptr ? static_cast<int>(left_down->getType()) : -1;
	const char *first_type_name = position != nullptr ? raw_mouse_message_name(position->getType()) : "null";
	const char *second_type_name = left_down != nullptr ? raw_mouse_message_name(left_down->getType()) : "null";

	stream.propagateMessages();

	const bool grabbed = manager.winGetGrabWindow() == window;
	const unsigned int stream_remaining = count_game_messages(stream.getFirstMessage());
	const unsigned int command_list_remaining = count_game_messages(command_list.getFirstMessage());
	const bool attached = cnc_port_original_wndproc_mouse_stream_attached();
	const bool ok =
		attached &&
		TheMouse == static_cast<Mouse *>(TheWin32Mouse) &&
		raw_position &&
		raw_left_down &&
		capture.mousePosCount == 1 &&
		capture.leftDownCount == 1 &&
		grabbed &&
		stream_remaining == 0 &&
		command_list_remaining == 0;

	char buffer[6000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"browser_original_gui_mouse_stream\","
		"\"ok\":%s,"
		"\"queue\":{\"before\":%u,\"afterPump\":%u,\"pumped\":%u,"
		"\"overflowedBefore\":%s,\"overflowedAfter\":%s},"
		"\"mouse\":{\"win32Attached\":%s,\"streamAttached\":%s,"
		"\"inputFrame\":%u,\"eventsThisFrame\":%d},"
		"\"streamBefore\":{\"count\":%u,\"rawPosition\":%s,\"rawLeftDown\":%s,"
		"\"firstType\":%d,\"firstTypeName\":\"%s\","
		"\"secondType\":%d,\"secondTypeName\":\"%s\"},"
		"\"window\":{\"mousePos\":%d,\"leftDown\":%d,\"entering\":%d,"
		"\"lastMessage\":%d,\"leftDownX\":%d,\"leftDownY\":%d,\"grabbed\":%s},"
		"\"streamRemaining\":%u,\"commandListRemaining\":%u}",
		bool_json(ok),
		queue_before,
		WasmWin32Input::message_queue_count,
		queue_before >= WasmWin32Input::message_queue_count
			? queue_before - WasmWin32Input::message_queue_count
			: 0,
		bool_json(overflowed_before),
		bool_json(WasmWin32Input::message_queue_overflowed),
		bool_json(attached),
		bool_json(TheMouse == static_cast<Mouse *>(TheWin32Mouse)),
		cnc_port_original_wndproc_mouse_stream_input_frame(),
		cnc_port_original_wndproc_mouse_stream_events_this_frame(),
		stream_count_before,
		bool_json(raw_position),
		bool_json(raw_left_down),
		first_type,
		first_type_name,
		second_type,
		second_type_name,
		capture.mousePosCount,
		capture.leftDownCount,
		capture.enteringCount,
		static_cast<int>(capture.lastMessage),
		capture.leftDownMouse.x,
		capture.leftDownMouse.y,
		bool_json(grabbed),
		stream_remaining,
		command_list_remaining);
	g_original_gui_mouse_stream_json = buffer;

	manager.winDestroy(window);
	manager.update();

	TheMouse = old_mouse;
	TheWindowManager = old_window_manager;
	TheMessageStream = old_message_stream;
	TheCommandList = old_command_list;
	TheKeyboard = old_keyboard;
	TheWritableGlobalData = old_global_data;

	return g_original_gui_mouse_stream_json.c_str();
}

} // namespace

extern "C" {

void cnc_port_update_original_mouse_frame_input()
{
	update_original_mouse_frame_input();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_set_original_mouse_frame_input_enabled(int enabled)
{
	return set_original_mouse_frame_input_enabled(enabled != 0);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_reset_original_mouse_frame_input()
{
	return reset_original_mouse_frame_input();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_mouse_frame_input()
{
	return write_frame_mouse_json();
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_gui_mouse_stream()
{
	return probe_original_gui_mouse_stream();
}

}
