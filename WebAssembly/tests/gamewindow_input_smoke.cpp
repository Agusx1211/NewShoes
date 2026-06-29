#include <iostream>
#include <cstring>

#include <windows.h>

#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/Gadget.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/Keyboard.h"
#include "GameClient/KeyDefs.h"
#include "GameClient/Mouse.h"
#include "GameClient/WindowXlat.h"
#include "Win32Device/GameClient/Win32Mouse.h"

HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
Win32Mouse *TheWin32Mouse = nullptr;

// Keep this input smoke focused on GUI event routing without linking the .wnd
// layout parser and function lexicon callback tables.
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

struct InputCapture
{
	Int leftDownCount = 0;
	Int mousePosCount = 0;
	Int enteringCount = 0;
	GameWindowMessage lastMessage = GWM_NONE;
	ICoord2D lastMouse = { 0, 0 };
	ICoord2D leftDownMouse = { 0, 0 };
};

struct ButtonCapture
{
	Int selectedCount = 0;
	GameWindow *selectedWindow = nullptr;
	GameWindow *targetWindow = nullptr;
	ICoord2D selectedMouse = { 0, 0 };
	Bool targetShownBySelection = FALSE;
};

class SmokeGameWindow : public GameWindow
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(SmokeGameWindow, "SmokeGameWindow", 1, 1)

public:
	SmokeGameWindow() = default;
	void winDrawBorder() override {}
};

EMPTY_DTOR(SmokeGameWindow)

class SmokeGameWindowManager : public GameWindowManager
{
public:
	GameWindow *allocateNewWindow() override { return newInstance(SmokeGameWindow); }

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

class SmokeWin32Mouse : public Win32Mouse
{
public:
	void prepareEngineUpdateProbe(int width, int height)
	{
		std::memset(m_eventBuffer, 0, sizeof(m_eventBuffer));
		m_nextFreeIndex = 0;
		m_nextGetIndex = 0;
		std::memset(m_mouseEvents, 0, sizeof(m_mouseEvents));
		std::memset(&m_currMouse, 0, sizeof(m_currMouse));
		std::memset(&m_prevMouse, 0, sizeof(m_prevMouse));
		m_minX = 0;
		m_minY = 0;
		m_maxX = width > 0 ? width - 1 : 799;
		m_maxY = height > 0 ? height - 1 : 599;
		m_inputFrame = 0;
		m_deadInputFrame = 0;
		m_eventsThisFrame = 0;
		m_inputMovesAbsolute = TRUE;
	}

	Int eventsThisFrame() const { return m_eventsThisFrame; }
	UnsignedInt inputFrame() const { return m_inputFrame; }
};

class SmokeKeyboard : public Keyboard
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

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

WindowMsgHandledType capture_input(GameWindow *window,
	UnsignedInt msg,
	WindowMsgData mData1,
	WindowMsgData)
{
	InputCapture *capture = static_cast<InputCapture *>(window->winGetUserData());
	if (capture == nullptr) {
		return MSG_IGNORED;
	}

	capture->lastMessage = static_cast<GameWindowMessage>(msg);
	capture->lastMouse.x = LOLONGTOSHORT(mData1);
	capture->lastMouse.y = HILONGTOSHORT(mData1);

	if (msg == GWM_MOUSE_ENTERING) {
		capture->enteringCount++;
		return MSG_IGNORED;
	}

	if (msg == GWM_MOUSE_POS) {
		capture->mousePosCount++;
		return MSG_HANDLED;
	}

	if (msg == GWM_LEFT_DOWN) {
		capture->leftDownCount++;
		capture->leftDownMouse = capture->lastMouse;
		return MSG_HANDLED;
	}

	return MSG_IGNORED;
}

WindowMsgHandledType capture_button_owner_system(GameWindow *window,
	UnsignedInt msg,
	WindowMsgData mData1,
	WindowMsgData mData2)
{
	ButtonCapture *capture = static_cast<ButtonCapture *>(window->winGetUserData());
	if (capture == nullptr) {
		return MSG_IGNORED;
	}

	if (msg == GBM_SELECTED) {
		capture->selectedCount++;
		capture->selectedWindow = reinterpret_cast<GameWindow *>(mData1);
		capture->selectedMouse.x = LOLONGTOSHORT(mData2);
		capture->selectedMouse.y = HILONGTOSHORT(mData2);
		if (capture->targetWindow != nullptr) {
			capture->targetWindow->winHide(FALSE);
			capture->targetShownBySelection =
				BitTest(capture->targetWindow->winGetStatus(), WIN_STATUS_HIDDEN) == FALSE;
		}
		return MSG_HANDLED;
	}

	return MSG_IGNORED;
}

GameMessage *append_left_down(MessageStream &stream, Int x, Int y, Int modifiers, UnsignedInt timestamp)
{
	GameMessage *message = stream.appendMessage(GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN);
	const ICoord2D pixel = { x, y };
	message->appendPixelArgument(pixel);
	message->appendIntegerArgument(modifiers);
	message->appendTimestampArgument(timestamp);
	return message;
}

GameMessage *append_left_up(MessageStream &stream, Int x, Int y, Int modifiers, UnsignedInt timestamp)
{
	GameMessage *message = stream.appendMessage(GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_UP);
	const ICoord2D pixel = { x, y };
	message->appendPixelArgument(pixel);
	message->appendIntegerArgument(modifiers);
	message->appendTimestampArgument(timestamp);
	return message;
}

LPARAM make_mouse_lparam(int x, int y)
{
	return MAKELPARAM(x, y);
}

bool exercise_window_translator_click()
{
	bool ok = true;

	GlobalData globalData;
	CommandList commandList;
	MessageStream stream;
	SmokeGameWindowManager manager;
	SmokeWin32Mouse mouse;

	GlobalData *oldGlobalData = TheGlobalData;
	CommandList *oldCommandList = TheCommandList;
	MessageStream *oldMessageStream = TheMessageStream;
	GameWindowManager *oldWindowManager = TheWindowManager;
	Mouse *oldMouse = TheMouse;
	Win32Mouse *oldWin32Mouse = TheWin32Mouse;

	TheGlobalData = &globalData;
	TheCommandList = &commandList;
	TheMessageStream = &stream;
	TheWindowManager = &manager;
	TheMouse = &mouse;
	TheWin32Mouse = &mouse;

	SmokeGameWindow *window = static_cast<SmokeGameWindow *>(manager.allocateNewWindow());
	InputCapture capture;
	window->winSetUserData(&capture);
	window->winSetInputFunc(capture_input);
	window->winSetStatus(WIN_STATUS_ENABLED);
	window->winSetPosition(100, 80);
	window->winSetSize(160, 90);
	manager.linkWindow(window);

	stream.attachTranslator(new WindowTranslator, 100);
	append_left_down(stream, 120, 95, KEY_STATE_NONE, 4000);
	stream.propagateMessages();

	ok = expect(capture.leftDownCount == 1,
		"WindowTranslator should deliver raw left-down to the target GameWindow as GWM_LEFT_DOWN") && ok;
	ok = expect(capture.mousePosCount == 0,
		"handcrafted left-down proof should not synthesize an extra mouse-position event") && ok;
	ok = expect(capture.enteringCount == 0,
		"handled left-down should grab the window before mouse-enter bookkeeping runs") && ok;
	ok = expect(capture.lastMessage == GWM_LEFT_DOWN,
		"target window should record GWM_LEFT_DOWN as the final delivered message") && ok;
	ok = expect(capture.leftDownMouse.x == 120 && capture.leftDownMouse.y == 95,
		"GWM_LEFT_DOWN should carry packed original mouse coordinates") && ok;
	ok = expect(manager.winGetGrabWindow() == window,
		"GameWindowManager should grab the window that handled GWM_LEFT_DOWN") && ok;
	ok = expect(stream.getFirstMessage() == nullptr,
		"handled raw mouse message should be destroyed by MessageStream propagation") && ok;
	ok = expect(commandList.getFirstMessage() == nullptr,
		"handled raw mouse message should not reach the command list") && ok;

	manager.winDestroy(window);
	manager.update();

	TheWin32Mouse = oldWin32Mouse;
	TheMouse = oldMouse;
	TheWindowManager = oldWindowManager;
	TheMessageStream = oldMessageStream;
	TheCommandList = oldCommandList;
	TheGlobalData = oldGlobalData;

	return ok;
}

bool exercise_push_button_widget_click()
{
	bool ok = true;

	GlobalData globalData;
	CommandList commandList;
	MessageStream stream;
	SmokeGameWindowManager manager;
	SmokeWin32Mouse mouse;

	GlobalData *oldGlobalData = TheGlobalData;
	CommandList *oldCommandList = TheCommandList;
	MessageStream *oldMessageStream = TheMessageStream;
	GameWindowManager *oldWindowManager = TheWindowManager;
	Mouse *oldMouse = TheMouse;
	Win32Mouse *oldWin32Mouse = TheWin32Mouse;

	TheGlobalData = &globalData;
	TheCommandList = &commandList;
	TheMessageStream = &stream;
	TheWindowManager = &manager;
	TheMouse = &mouse;
	TheWin32Mouse = &mouse;

	SmokeGameWindow *owner = static_cast<SmokeGameWindow *>(manager.allocateNewWindow());
	ButtonCapture capture;
	owner->winSetUserData(&capture);
	owner->winSetSystemFunc(capture_button_owner_system);
	owner->winSetStatus(WIN_STATUS_ENABLED);
	owner->winSetPosition(0, 0);
	owner->winSetSize(220, 160);
	manager.linkWindow(owner);

	GameWindow *target = manager.winCreate(owner,
		WIN_STATUS_ENABLED | WIN_STATUS_HIDDEN,
		130,
		20,
		60,
		40,
		nullptr,
		nullptr);
	capture.targetWindow = target;
	ok = expect(target != nullptr,
		"original GameWindowManager should create a target window for button-selected GUI state changes") && ok;
	if (target != nullptr) {
		ok = expect(BitTest(target->winGetStatus(), WIN_STATUS_HIDDEN),
			"target window should start hidden before the push-button click") && ok;
	}

	WinInstanceData buttonInstData;
	buttonInstData.m_style = GWS_PUSH_BUTTON | GWS_MOUSE_TRACK;
	GameWindow *button = manager.gogoGadgetPushButton(owner,
		WIN_STATUS_ENABLED,
		20,
		20,
		90,
		32,
		&buttonInstData,
		nullptr,
		FALSE);

	ok = expect(button != nullptr,
		"original GameWindowManager should create a GadgetPushButton child window") && ok;
	if (button != nullptr) {
		stream.attachTranslator(new WindowTranslator, 100);
		append_left_down(stream, 42, 36, KEY_STATE_NONE, 6000);
		append_left_up(stream, 42, 36, KEY_STATE_NONE, 6001);
		stream.propagateMessages();

		ok = expect(capture.selectedCount == 1,
			"GadgetPushButtonInput should send exactly one GBM_SELECTED to its owner for a down/up click") && ok;
		ok = expect(capture.selectedWindow == button,
			"GBM_SELECTED should identify the clicked GadgetPushButton as its source window") && ok;
		ok = expect(capture.selectedMouse.x == 42 && capture.selectedMouse.y == 36,
			"GBM_SELECTED should carry the original packed click coordinates from WindowTranslator") && ok;
		ok = expect(capture.targetShownBySelection,
			"owner GBM_SELECTED handler should be able to mutate another GameWindow via winHide(FALSE)") && ok;
		ok = expect(target != nullptr && BitTest(target->winGetStatus(), WIN_STATUS_HIDDEN) == FALSE,
			"push-button-selected GUI state change should leave the target window unhidden") && ok;
		ok = expect(BitTest(button->winGetInstanceData()->m_state, WIN_STATE_SELECTED) == FALSE,
			"GadgetPushButtonInput should clear transient selected state after the left-button release") && ok;
		ok = expect(manager.winGetGrabWindow() == nullptr,
			"GameWindowManager should release the push button grab after GWM_LEFT_UP") && ok;
		ok = expect(stream.getFirstMessage() == nullptr,
			"handled push-button raw mouse messages should be destroyed by MessageStream propagation") && ok;
		ok = expect(commandList.getFirstMessage() == nullptr,
			"handled push-button raw mouse messages should not reach the command list") && ok;
	}

	manager.winDestroy(owner);
	manager.update();

	TheWin32Mouse = oldWin32Mouse;
	TheMouse = oldMouse;
	TheWindowManager = oldWindowManager;
	TheMessageStream = oldMessageStream;
	TheCommandList = oldCommandList;
	TheGlobalData = oldGlobalData;

	return ok;
}

bool exercise_mouse_stream_to_window_translator_click()
{
	bool ok = true;

	GlobalData globalData;
	SmokeKeyboard keyboard;
	CommandList commandList;
	MessageStream stream;
	SmokeGameWindowManager manager;
	SmokeWin32Mouse mouse;

	GlobalData *oldGlobalData = TheGlobalData;
	Keyboard *oldKeyboard = TheKeyboard;
	CommandList *oldCommandList = TheCommandList;
	MessageStream *oldMessageStream = TheMessageStream;
	GameWindowManager *oldWindowManager = TheWindowManager;
	Mouse *oldMouse = TheMouse;
	Win32Mouse *oldWin32Mouse = TheWin32Mouse;

	TheGlobalData = &globalData;
	TheKeyboard = &keyboard;
	TheCommandList = &commandList;
	TheMessageStream = &stream;
	TheWindowManager = &manager;
	TheMouse = &mouse;
	TheWin32Mouse = &mouse;

	SmokeGameWindow *window = static_cast<SmokeGameWindow *>(manager.allocateNewWindow());
	InputCapture capture;
	window->winSetUserData(&capture);
	window->winSetInputFunc(capture_input);
	window->winSetStatus(WIN_STATUS_ENABLED);
	// Mouse::createStreamMessages emits the frame's current position before
	// folding the buffered Win32 event, so cover both that point and the click.
	window->winSetPosition(0, 0);
	window->winSetSize(180, 140);
	manager.linkWindow(window);

	stream.attachTranslator(new WindowTranslator, 100);
	mouse.prepareEngineUpdateProbe(800, 600);
	TheWin32Mouse->addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(120, 95), 5000);
	TheMouse->UPDATE();
	TheMouse->createStreamMessages();

	ok = expect(mouse.inputFrame() == 1 && mouse.eventsThisFrame() == 1,
		"Win32Mouse-backed GUI proof should drive Mouse::update through TheMouse") && ok;

	GameMessage *position = stream.getFirstMessage();
	GameMessage *leftDown = position != nullptr ? position->next() : nullptr;
	ok = expect(position != nullptr,
		"Mouse::createStreamMessages should append a raw position before GUI propagation") && ok;
	ok = expect(leftDown != nullptr,
		"Mouse::createStreamMessages should append a raw left-down before GUI propagation") && ok;
	if (position != nullptr) {
		ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
			"first unpropagated mouse-stream message should be MSG_RAW_MOUSE_POSITION") && ok;
	}
	if (leftDown != nullptr) {
		ok = expect(leftDown->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN,
			"second unpropagated mouse-stream message should be MSG_RAW_MOUSE_LEFT_BUTTON_DOWN") && ok;
	}

	stream.propagateMessages();

	ok = expect(capture.mousePosCount == 1,
		"WindowTranslator should deliver Mouse-created raw position to the target GameWindow") && ok;
	ok = expect(capture.leftDownCount == 1,
		"WindowTranslator should deliver Mouse-created raw left-down to the target GameWindow") && ok;
	ok = expect(capture.enteringCount == 1,
		"Mouse-created raw position should run mouse-enter bookkeeping before the handled left-down grab") && ok;
	ok = expect(capture.lastMessage == GWM_LEFT_DOWN,
		"target window should record Mouse-created GWM_LEFT_DOWN as the final delivered message") && ok;
	ok = expect(capture.leftDownMouse.x == 120 && capture.leftDownMouse.y == 95,
		"Mouse-created GWM_LEFT_DOWN should carry folded Win32 mouse coordinates") && ok;
	ok = expect(manager.winGetGrabWindow() == window,
		"GameWindowManager should grab the window that handled the Mouse-created GWM_LEFT_DOWN") && ok;
	ok = expect(stream.getFirstMessage() == nullptr,
		"handled Mouse-created raw mouse messages should be destroyed by MessageStream propagation") && ok;
	ok = expect(commandList.getFirstMessage() == nullptr,
		"handled Mouse-created raw mouse messages should not reach the command list") && ok;

	manager.winDestroy(window);
	manager.update();

	TheWin32Mouse = oldWin32Mouse;
	TheMouse = oldMouse;
	TheWindowManager = oldWindowManager;
	TheMessageStream = oldMessageStream;
	TheCommandList = oldCommandList;
	TheKeyboard = oldKeyboard;
	TheGlobalData = oldGlobalData;

	return ok;
}

} // namespace

int main()
{
	initMemoryManager();
	const bool ok = exercise_window_translator_click()
		&& exercise_push_button_widget_click()
		&& exercise_mouse_stream_to_window_translator_click();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"GameWindow\",\"covered\":\"Win32Mouse Mouse::createStreamMessages to MessageStream WindowTranslator original GameWindowManager click dispatch, GadgetPushButton GBM_SELECTED, and selected-handler winHide GUI state mutation\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
