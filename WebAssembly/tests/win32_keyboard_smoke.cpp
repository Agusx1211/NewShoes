// Focused smoke for the original engine Keyboard stream-message path.
//
// This target exercises the ORIGINAL GameEngine keyboard code
// (GeneralsMD/Code/GameEngine/Source/GameClient/Input/Keyboard.cpp):
//   - Keyboard::update() / updateKeys() (device state folding, modifier tracking)
//   - Keyboard::createStreamMessages() (emits MSG_RAW_KEY_DOWN / MSG_RAW_KEY_UP)
//
// Keyboard::getKey() is the only device-specific (abstract) entry point and is
// implemented here by a minimal test subclass that feeds scripted KeyboardIO
// events, mirroring the SmokeKeyboard pattern used by win32_mouse_smoke. All
// stream-message creation, key-status bookkeeping, modifier folding, and
// autorepeat handling under test belong to the original engine source.
//
// This intentionally does NOT touch the DirectInput-backed Win32DIKeyboard
// device implementation; it targets the engine-level Keyboard that the browser
// keyboard bridge will eventually feed.

#include <iostream>
#include <cstring>
#include <vector>

#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "GameClient/Keyboard.h"
#include "GameClient/KeyDefs.h"

// Engine globals that the linked smoke libraries expect to be defined by the
// executable (normally owned by WinMain / the runtime bootstrap). They are
// intentionally left null/empty: the keyboard stream path only needs
// TheMessageStream and TheKeyboard, which are wired per-test below.
HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;

namespace {

// Minimal Keyboard subclass: feeds scripted KeyboardIO events through the
// original getKey() contract and reports a fixed caps state.
class SmokeKeyboard : public Keyboard
{
public:
	SmokeKeyboard() : Keyboard(), m_caps(FALSE) {}

	void setCapsState(Bool caps) { m_caps = caps; }

	void clearScript()
	{
		m_script.clear();
		m_next = 0;
	}

	// Queue one device event; KEY_NONE terminators are appended automatically by
	// the loop in Keyboard::updateKeys(), so callers only queue real events.
	void queueKey(UnsignedByte key, UnsignedShort state)
	{
		KeyboardIO io;
		io.key = key;
		io.status = KeyboardIO::STATUS_UNUSED;
		io.state = state;
		io.sequence = 0;
		m_script.push_back(io);
	}

	Bool getCapsState() override { return m_caps; }

protected:
	void getKey(KeyboardIO *key) override
	{
		if (m_next < m_script.size()) {
			*key = m_script[m_next++];
		} else {
			// Original loop expects a KEY_NONE sentinel to stop draining.
			key->key = KEY_NONE;
			key->status = KeyboardIO::STATUS_UNUSED;
			key->state = KEY_STATE_NONE;
			key->sequence = 0;
		}
	}

private:
	std::vector<KeyboardIO> m_script;
	size_t m_next = 0;
	Bool m_caps;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

bool expect_integer_arg(GameMessage *message, Int index, Int value, const char *label)
{
	if (!expect(message->getArgumentDataType(index) == ARGUMENTDATATYPE_INTEGER, label)) {
		return false;
	}
	return expect(message->getArgument(index)->integer == value, label);
}

// Walk the message list starting at first and return the nth message (0-based),
// or nullptr if the list is shorter than requested.
GameMessage *nth_message(GameMessage *first, Int index)
{
	GameMessage *msg = first;
	while (msg != nullptr && index > 0) {
		msg = msg->next();
		--index;
	}
	return msg;
}

Int count_messages(GameMessage *first)
{
	Int count = 0;
	for (GameMessage *msg = first; msg != nullptr; msg = msg->next()) {
		++count;
	}
	return count;
}

// One scripted update() + createStreamMessages() pass against a fresh stream.
bool run_stream_probe(SmokeKeyboard &keyboard, MessageStream &stream)
{
	keyboard.update();
	keyboard.createStreamMessages();
	return true;
}

bool exercise_basic_key_down(SmokeKeyboard &keyboard)
{
	bool ok = true;
	{
		GlobalData globalData;
		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;

		MessageStream stream;
		MessageStream *oldMessageStream = TheMessageStream;
		TheMessageStream = &stream;

		keyboard.clearScript();
		keyboard.queueKey(KEY_A, KEY_STATE_DOWN);
		ok = run_stream_probe(keyboard, stream) && ok;

		GameMessage *first = stream.getFirstMessage();
		ok = expect(first != nullptr, "Keyboard::createStreamMessages should append a key-down message") && ok;
		ok = expect(count_messages(first) == 1,
			"a single key-down event should produce exactly one stream message") && ok;

		if (first != nullptr) {
			ok = expect(first->getType() == GameMessage::MSG_RAW_KEY_DOWN,
				"key-down stream message should be MSG_RAW_KEY_DOWN") && ok;
			ok = expect(first->getArgumentCount() == 2,
				"key-down message should carry key and state arguments") && ok;
			ok = expect(first->getPlayerIndex() == -1,
				"early wasm input message should use invalid player index before PlayerList exists") && ok;
			ok = expect_integer_arg(first, 0, KEY_A,
				"key-down message should carry the pressed key code") && ok;
			ok = expect_integer_arg(first, 1, KEY_STATE_DOWN,
				"key-down message should carry the down state") && ok;
		}

		TheMessageStream = oldMessageStream;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
	return ok;
}

bool exercise_key_down_then_up(SmokeKeyboard &keyboard)
{
	bool ok = true;
	{
		GlobalData globalData;
		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;

		MessageStream stream;
		MessageStream *oldMessageStream = TheMessageStream;
		TheMessageStream = &stream;

		keyboard.clearScript();
		keyboard.queueKey(KEY_A, KEY_STATE_DOWN);
		keyboard.queueKey(KEY_A, KEY_STATE_UP);
		ok = run_stream_probe(keyboard, stream) && ok;

		GameMessage *first = stream.getFirstMessage();
		GameMessage *up = nth_message(first, 1);
		ok = expect(first != nullptr, "down/up stream should include a key-down message") && ok;
		ok = expect(up != nullptr, "down/up stream should include a key-up message") && ok;
		ok = expect(up == nullptr || up->next() == nullptr,
			"down/up stream should only append key-down and key-up messages") && ok;

		if (first != nullptr) {
			ok = expect(first->getType() == GameMessage::MSG_RAW_KEY_DOWN,
				"down/up first message should be MSG_RAW_KEY_DOWN") && ok;
			ok = expect_integer_arg(first, 0, KEY_A,
				"down/up key-down message should carry the key code") && ok;
			ok = expect_integer_arg(first, 1, KEY_STATE_DOWN,
				"down/up key-down message should carry the down state") && ok;
		}

		if (up != nullptr) {
			ok = expect(up->getType() == GameMessage::MSG_RAW_KEY_UP,
				"down/up second message should be MSG_RAW_KEY_UP") && ok;
			ok = expect(up->getArgumentCount() == 2,
				"key-up message should carry key and state arguments") && ok;
			ok = expect_integer_arg(up, 0, KEY_A,
				"key-up message should carry the released key code") && ok;
			ok = expect_integer_arg(up, 1, KEY_STATE_UP,
				"key-up message should carry the up state") && ok;
		}

		TheMessageStream = oldMessageStream;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
	return ok;
}

// Verifies the original updateKeys() modifier-folding contract: a left-shift
// down event followed by a normal key down should fold the LSHIFT modifier
// flag into every emitted key state for that frame.
bool exercise_shift_modifier_folding(SmokeKeyboard &keyboard)
{
	bool ok = true;
	{
		GlobalData globalData;
		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;

		MessageStream stream;
		MessageStream *oldMessageStream = TheMessageStream;
		TheMessageStream = &stream;

		keyboard.clearScript();
		keyboard.queueKey(KEY_LSHIFT, KEY_STATE_DOWN);
		keyboard.queueKey(KEY_A, KEY_STATE_DOWN);
		ok = run_stream_probe(keyboard, stream) && ok;

		GameMessage *first = stream.getFirstMessage();
		GameMessage *aDown = nth_message(first, 1);
		ok = expect(first != nullptr, "shift stream should include a shift-down message") && ok;
		ok = expect(aDown != nullptr, "shift stream should include an A-down message") && ok;
		ok = expect(aDown == nullptr || aDown->next() == nullptr,
			"shift stream should only append shift-down and A-down messages") && ok;

		// Keyboard::getModifierFlags() should reflect the folded LSHIFT state.
		ok = expect(BitTest(keyboard.getModifierFlags(), KEY_STATE_LSHIFT),
			"Keyboard should fold left-shift into its modifier flags") && ok;

		if (first != nullptr) {
			ok = expect(first->getType() == GameMessage::MSG_RAW_KEY_DOWN,
				"shift stream first message should be MSG_RAW_KEY_DOWN") && ok;
			ok = expect_integer_arg(first, 0, KEY_LSHIFT,
				"shift stream first message should carry KEY_LSHIFT") && ok;
			ok = expect(BitTest(first->getArgument(1)->integer, KEY_STATE_DOWN),
				"shift-down message state should include KEY_STATE_DOWN") && ok;
			ok = expect(BitTest(first->getArgument(1)->integer, KEY_STATE_LSHIFT),
				"shift-down message state should include the folded LSHIFT modifier") && ok;
		}

		if (aDown != nullptr) {
			ok = expect(aDown->getType() == GameMessage::MSG_RAW_KEY_DOWN,
				"shift stream A message should be MSG_RAW_KEY_DOWN") && ok;
			ok = expect_integer_arg(aDown, 0, KEY_A,
				"shift stream A message should carry KEY_A") && ok;
			ok = expect(BitTest(aDown->getArgument(1)->integer, KEY_STATE_DOWN),
				"A-down message state should include KEY_STATE_DOWN") && ok;
			ok = expect(BitTest(aDown->getArgument(1)->integer, KEY_STATE_LSHIFT),
				"A-down message state should include the folded LSHIFT modifier") && ok;
		}

		TheMessageStream = oldMessageStream;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
	return ok;
}

bool exercise_empty_frame(SmokeKeyboard &keyboard)
{
	bool ok = true;
	{
		GlobalData globalData;
		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;

		MessageStream stream;
		MessageStream *oldMessageStream = TheMessageStream;
		TheMessageStream = &stream;

		keyboard.clearScript();
		ok = run_stream_probe(keyboard, stream) && ok;

		GameMessage *first = stream.getFirstMessage();
		ok = expect(first == nullptr,
			"an empty device frame should produce no stream messages") && ok;

		TheMessageStream = oldMessageStream;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
	return ok;
}

} // namespace

int main()
{
	bool ok = true;

	initMemoryManager();
	{
		SmokeKeyboard keyboard;
		ok = exercise_basic_key_down(keyboard) && ok;
	}
	{
		SmokeKeyboard keyboard;
		ok = exercise_key_down_then_up(keyboard) && ok;
	}
	{
		SmokeKeyboard keyboard;
		ok = exercise_shift_modifier_folding(keyboard) && ok;
	}
	{
		SmokeKeyboard keyboard;
		ok = exercise_empty_frame(keyboard) && ok;
	}
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"Keyboard\",\"covered\":\"Keyboard::update/updateKeys/createStreamMessages MSG_RAW_KEY_DOWN/UP plus left-shift modifier folding\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
