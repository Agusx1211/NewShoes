#include "PreRTS.h"

#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/Keyboard.h"
#include "GameClient/KeyDefs.h"
#include "GameClient/Mouse.h"
#include "GameClient/WindowXlat.h"
#include "Win32Device/GameClient/Win32Mouse.h"
#include "wasm_memory_manager_scope.h"

#include <cstdio>
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
	Int mousePosCount = 0;
	Int enteringCount = 0;
	GameWindowMessage lastMessage = GWM_NONE;
	ICoord2D lastMouse = { 0, 0 };
	ICoord2D leftDownMouse = { 0, 0 };
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
		default:
			return "OTHER";
	}
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

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_original_gui_mouse_stream()
{
	return probe_original_gui_mouse_stream();
}

}
