#include <iostream>
#include <cstring>

#include <windows.h>

#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "GameClient/Keyboard.h"
#include "Win32Device/GameClient/Win32Mouse.h"

HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
Win32Mouse *TheWin32Mouse = nullptr;

namespace {

class SmokeWin32Mouse : public Win32Mouse
{
public:
	using Win32Mouse::getMouseEvent;

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

	void processBufferedEvents()
	{
		for (Int index = 0; index < m_eventsThisFrame; ++index) {
			processMouseEvent(index);
		}
	}
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

LPARAM make_mouse_lparam(int x, int y)
{
	return MAKELPARAM(x, y);
}

bool expect_pixel_arg(GameMessage *message, Int index, Int x, Int y, const char *label)
{
	if (!expect(message->getArgumentDataType(index) == ARGUMENTDATATYPE_PIXEL, label)) {
		return false;
	}
	const ICoord2D pixel = message->getArgument(index)->pixel;
	return expect(pixel.x == x && pixel.y == y, label);
}

bool expect_integer_arg(GameMessage *message, Int index, Int value, const char *label)
{
	if (!expect(message->getArgumentDataType(index) == ARGUMENTDATATYPE_INTEGER, label)) {
		return false;
	}
	return expect(message->getArgument(index)->integer == value, label);
}

bool exercise_mouse_stream_messages(SmokeWin32Mouse &mouse)
{
	bool ok = true;
	initMemoryManager();
	{
		GlobalData globalData;
		SmokeKeyboard keyboard;
		MessageStream stream;

		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		MessageStream *oldMessageStream = TheMessageStream;
		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;
		TheMessageStream = &stream;

		mouse.prepareEngineUpdateProbe(800, 600);
		mouse.addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(345, 67), 901);
		mouse.update();
		mouse.createStreamMessages();

		GameMessage *position = stream.getFirstMessage();
		GameMessage *leftDown = position != nullptr ? position->next() : nullptr;
		ok = expect(position != nullptr, "Mouse::createStreamMessages should append a raw position message") && ok;
		ok = expect(leftDown != nullptr, "Mouse::createStreamMessages should append a left-button message") && ok;
		ok = expect(leftDown == nullptr || leftDown->next() == nullptr,
			"Mouse::createStreamMessages should only append position and left-button messages for one left-down event") && ok;

		if (position != nullptr) {
			ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
				"first stream message should be MSG_RAW_MOUSE_POSITION") && ok;
			ok = expect(position->getArgumentCount() == 2,
				"raw position message should carry position and modifiers") && ok;
			ok = expect(position->getPlayerIndex() == -1,
				"early wasm input message should use invalid player index before PlayerList exists") && ok;
			ok = expect_pixel_arg(position, 0, 0, 0,
				"raw position message should use the current mouse position before event folding") && ok;
			ok = expect_integer_arg(position, 1, KEY_STATE_NONE,
				"raw position message should include keyboard modifier flags") && ok;
		}

		if (leftDown != nullptr) {
			ok = expect(leftDown->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN,
				"second stream message should be MSG_RAW_MOUSE_LEFT_BUTTON_DOWN") && ok;
			ok = expect(leftDown->getArgumentCount() == 3,
				"left-button message should carry position, modifiers, and timestamp") && ok;
			ok = expect(leftDown->getPlayerIndex() == -1,
				"left-button message should use invalid player index before PlayerList exists") && ok;
			ok = expect_pixel_arg(leftDown, 0, 345, 67,
				"left-button message should carry folded Win32 mouse coordinates") && ok;
			ok = expect_integer_arg(leftDown, 1, KEY_STATE_NONE,
				"left-button message should include keyboard modifier flags") && ok;
			ok = expect_integer_arg(leftDown, 2, 901,
				"left-button message should carry the Win32 event timestamp") && ok;
		}

		TheMessageStream = oldMessageStream;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
	shutdownMemoryManager();
	return ok;
}

} // namespace

int main()
{
	SmokeWin32Mouse mouse;
	TheWin32Mouse = &mouse;

	MouseIO event = {};
	mouse.addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(123, 45), 777);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"left button event should be available")) {
		return 1;
	}
	if (!expect(event.leftState == MBS_Down
			&& event.leftFrame == 1
			&& event.pos.x == 123
			&& event.pos.y == 45
			&& event.time == 777,
			"left button event should translate Win32 state and coordinates")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_RBUTTONDBLCLK, 0, make_mouse_lparam(321, 54), 778);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"right double-click event should be available")) {
		return 1;
	}
	if (!expect(event.rightState == MBS_DoubleClick
			&& event.rightFrame == 1
			&& event.pos.x == 321
			&& event.pos.y == 54
			&& event.time == 778,
			"right double-click event should translate Win32 state and coordinates")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_MBUTTONUP, 0, make_mouse_lparam(44, 55), 779);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"middle button event should be available")) {
		return 1;
	}
	if (!expect(event.middleState == MBS_Up
			&& event.middleFrame == 1
			&& event.pos.x == 44
			&& event.pos.y == 55
			&& event.time == 779,
			"middle button event should translate Win32 state and coordinates")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_MOUSEMOVE, 0, make_mouse_lparam(640, 480), 780);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"mouse move event should be available")) {
		return 1;
	}
	if (!expect(event.leftState == MBS_Up
			&& event.rightState == MBS_Up
			&& event.middleState == MBS_Up
			&& event.pos.x == 640
			&& event.pos.y == 480
			&& event.time == 780,
			"mouse move event should translate coordinates without button state")) {
		return 1;
	}

	event = {};
	mouse.addWin32Event(WM_MOUSEWHEEL, MAKELPARAM(0, 240), make_mouse_lparam(12, 34), 781);
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_OK,
			"mouse wheel event should be available")) {
		return 1;
	}
	if (!expect(event.wheelPos == 240
			&& event.pos.x == 12
			&& event.pos.y == 34
			&& event.time == 781,
			"mouse wheel event should translate wheel delta and client coordinates")) {
		return 1;
	}

	event = {};
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_NONE,
			"empty Win32Mouse buffer should report no event")) {
		return 1;
	}

	mouse.prepareEngineUpdateProbe(800, 600);
	mouse.addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(234, 56), 900);
	mouse.update();
	if (!expect(mouse.inputFrame() == 1 && mouse.eventsThisFrame() == 1,
			"real Mouse::update should advance the input frame and drain one Win32Mouse event")) {
		return 1;
	}
	event = {};
	if (!expect(mouse.getMouseEvent(&event, FALSE) == MOUSE_NONE,
			"real Mouse::update should consume the Win32Mouse device buffer")) {
		return 1;
	}
	mouse.processBufferedEvents();
	const MouseIO *status = mouse.getMouseStatus();
	if (!expect(status->pos.x == 234
			&& status->pos.y == 56
			&& status->deltaPos.x == 234
			&& status->deltaPos.y == 56
			&& status->time == 900
			&& status->wheelPos == 0
			&& status->leftState == MBS_Down
			&& status->leftEvent != MOUSE_EVENT_NONE
			&& status->leftFrame == 1,
			"real Mouse::processMouseEvent should fold the buffered left-button event into MouseIO status")) {
		return 1;
	}

	if (!exercise_mouse_stream_messages(mouse)) {
		return 1;
	}

	TheWin32Mouse = nullptr;
	std::cout << "{\"ok\":true,\"library\":\"Win32Mouse\",\"covered\":\"Win32Mouse translation plus real Mouse::update/processMouseEvent/createStreamMessages\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
