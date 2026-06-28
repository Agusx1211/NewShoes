#include <iostream>

#include <windows.h>

#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "Common/SubsystemInterface.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/KeyDefs.h"
#include "GameClient/Mouse.h"
#include "GameClient/WindowXlat.h"

HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;

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
	Int enteringCount = 0;
	GameWindowMessage lastMessage = GWM_NONE;
	ICoord2D lastMouse = { 0, 0 };
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
};

class SmokeMouse : public Mouse
{
public:
	void initCursorResources() override {}
	void setCursor(MouseCursor cursor) override { m_currentCursor = cursor; }
	void capture() override {}
	void releaseCapture() override {}

protected:
	UnsignedByte getMouseEvent(MouseIO *result, Bool) override
	{
		if (result != nullptr) {
			*result = {};
		}
		return MOUSE_NONE;
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

	if (msg == GWM_LEFT_DOWN) {
		capture->leftDownCount++;
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

bool exercise_window_translator_click()
{
	bool ok = true;

	GlobalData globalData;
	CommandList commandList;
	MessageStream stream;
	SmokeGameWindowManager manager;
	SmokeMouse mouse;

	GlobalData *oldGlobalData = TheGlobalData;
	CommandList *oldCommandList = TheCommandList;
	MessageStream *oldMessageStream = TheMessageStream;
	GameWindowManager *oldWindowManager = TheWindowManager;
	Mouse *oldMouse = TheMouse;

	TheGlobalData = &globalData;
	TheCommandList = &commandList;
	TheMessageStream = &stream;
	TheWindowManager = &manager;
	TheMouse = &mouse;

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
	ok = expect(capture.enteringCount == 0,
		"handled left-down should grab the window before mouse-enter bookkeeping runs") && ok;
	ok = expect(capture.lastMessage == GWM_LEFT_DOWN,
		"target window should record GWM_LEFT_DOWN as the final delivered message") && ok;
	ok = expect(capture.lastMouse.x == 120 && capture.lastMouse.y == 95,
		"GWM_LEFT_DOWN should carry packed original mouse coordinates") && ok;
	ok = expect(manager.winGetGrabWindow() == window,
		"GameWindowManager should grab the window that handled GWM_LEFT_DOWN") && ok;
	ok = expect(stream.getFirstMessage() == nullptr,
		"handled raw mouse message should be destroyed by MessageStream propagation") && ok;
	ok = expect(commandList.getFirstMessage() == nullptr,
		"handled raw mouse message should not reach the command list") && ok;

	manager.winDestroy(window);
	manager.update();

	TheMouse = oldMouse;
	TheWindowManager = oldWindowManager;
	TheMessageStream = oldMessageStream;
	TheCommandList = oldCommandList;
	TheGlobalData = oldGlobalData;

	return ok;
}

} // namespace

int main()
{
	initMemoryManager();
	const bool ok = exercise_window_translator_click();
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"GameWindow\",\"covered\":\"MessageStream WindowTranslator to original GameWindowManager click dispatch and grab handling\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
