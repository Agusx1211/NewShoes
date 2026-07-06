// Focused smoke for browser-backed Keyboard focus-loss/reset and autorepeat
// semantics through the ORIGINAL GameEngine keyboard code
// (GeneralsMD/Code/GameEngine/Source/GameClient/Input/Keyboard.cpp).
//
// This target is a sibling of win32_keyboard_smoke.cpp. Where that smoke
// proves the basic down/up + left-shift modifier-folding stream path, this
// smoke pins the two M5 input contracts the browser keyboard bridge needs
// before it can own normal frame delivery:
//
//   1. Focus-loss reset: when the device reports KEY_LOST (the browser analog
//      of a window/canvas `blur` / focus loss), Keyboard::updateKeys() must
//      invoke Keyboard::resetKeys(), which clears the cached key-status table,
//      the pending device buffer, and any folded modifiers (except caps). The
//      next createStreamMessages() pass must therefore emit nothing, and a key
//      that was logically down before the loss must no longer read as down.
//
//   2. Autorepeat state: a key held down across frames without fresh device
//      events must, once (m_inputFrame - m_keyStatus[key].sequence) exceeds
//      Keyboard::KEY_REPEAT_DELAY, be re-emitted by Keyboard::checkKeyRepeat()
//      as a MSG_RAW_KEY_DOWN whose state carries KEY_STATE_AUTOREPEAT in
//      addition to KEY_STATE_DOWN. Frames below the threshold must not repeat.
//
// As in win32_keyboard_smoke.cpp, the only device-specific (abstract) entry
// point is Keyboard::getKey(); a minimal test subclass feeds scripted
// KeyboardIO events. All reset, status bookkeeping, repeat scheduling, and
// stream-message creation under test belong to the original engine source.
//
// Note on stream scoping: the engine drains MessageStream every frame, but the
// original GameMessageList::reset() is an empty inline, so each asserted frame
// here runs against a fresh stack MessageStream (TheMessageStream is swapped in
// for that frame only). The Keyboard under test is the same object across
// frames, which is what lets the cached m_keyStatus / m_modifiers / repeat
// scheduling persist between frames exactly as in the real per-frame loop.

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
// intentionally left null/empty: the keyboard focus/repeat path only needs
// TheMessageStream and TheKeyboard, which are wired per-frame below.
HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;

namespace {

// Keyboard::KEY_REPEAT_DELAY is a private enum (value 10 in the original
// Keyboard.h). Mirror the literal here so the repeat-threshold probe can drive
// the exact frame count without reaching into private class state.
constexpr int kKeyRepeatDelay = 10;

// Minimal Keyboard subclass: feeds scripted KeyboardIO events through the
// original getKey() contract and reports a fixed caps state. It also exposes
// the protected key-state reader so the focus-loss probe can verify the cached
// status table was cleared.
class SmokeKeyboard : public Keyboard
{
public:
	SmokeKeyboard() : Keyboard(), m_caps(FALSE) {}

	void clearScript()
	{
		m_script.clear();
		m_next = 0;
	}

	// Queue one device event; KEY_NONE terminators are appended automatically by
	// the loop in Keyboard::updateKeys(), so callers only queue real events
	// (including KEY_LOST, which is the device-lost sentinel the browser blur
	// path will feed).
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

	// Public exposure of the protected key-state reader for the focus-loss
	// assertions. The implementation belongs entirely to the original engine.
	Bool queryKeyStateBit(UnsignedByte key, Int bit) { return getKeyStateBit(key, bit); }

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

Int count_messages(GameMessage *first)
{
	Int count = 0;
	for (GameMessage *msg = first; msg != nullptr; msg = msg->next()) {
		++count;
	}
	return count;
}

// RAII holder for TheWritableGlobalData + TheKeyboard across one exercise. The
// keyboard is owned by the caller so its cached state persists across frames.
struct ScopedKeyboardGlobals
{
	GlobalData globalData;
	GlobalData *oldGlobalData;
	Keyboard *oldKeyboard;

	ScopedKeyboardGlobals(Keyboard *keyboard)
	{
		oldGlobalData = TheWritableGlobalData;
		oldKeyboard = TheKeyboard;
		TheWritableGlobalData = &globalData;
		TheKeyboard = keyboard;
	}

	~ScopedKeyboardGlobals()
	{
		TheKeyboard = oldKeyboard;
		TheWritableGlobalData = oldGlobalData;
	}
};

// RAII holder for a fresh per-frame MessageStream. The original GameMessageList
// reset() is a no-op, so each asserted frame gets its own empty stream.
struct FrameStream
{
	MessageStream stream;
	MessageStream *oldMessageStream;

	FrameStream()
	{
		oldMessageStream = TheMessageStream;
		TheMessageStream = &stream;
	}

	~FrameStream() { TheMessageStream = oldMessageStream; }

	GameMessage *first() { return stream.getFirstMessage(); }
};

// Focus-loss / resetKeys proof.
//
// Frame 1 establishes a known non-empty device + status state: left-shift down
// (folds KEY_STATE_LSHIFT into m_modifiers via the original translateKey path)
// and KEY_A down (recorded in the cached status table). Frame 2 feeds KEY_LOST,
// which the original updateKeys() loop must turn into a resetKeys() call. After
// the reset the cached key state, pending device buffer, and modifiers must be
// cleared, so createStreamMessages() emits nothing and the previously-down key
// no longer reads as down. A follow-on empty frame must stay quiet too.
bool exercise_focus_loss_reset(SmokeKeyboard &keyboard)
{
	bool ok = true;
	ScopedKeyboardGlobals globals(&keyboard);

	// Frame 1: press left-shift, then A. Verify the frame looked non-empty
	// before the loss so the reset is actually observable.
	keyboard.clearScript();
	keyboard.queueKey(KEY_LSHIFT, KEY_STATE_DOWN);
	keyboard.queueKey(KEY_A, KEY_STATE_DOWN);
	{
		FrameStream fs;
		keyboard.update();
		keyboard.createStreamMessages();

		ok = expect(count_messages(fs.first()) == 2,
			"frame 1 should emit shift-down and A-down stream messages before focus loss") && ok;
	}
	ok = expect(BitTest(keyboard.getModifierFlags(), KEY_STATE_LSHIFT),
		"frame 1 should fold left-shift into the modifier flags before focus loss") && ok;
	ok = expect(keyboard.queryKeyStateBit(KEY_A, KEY_STATE_DOWN),
		"frame 1 should record KEY_A as down in the cached status table before focus loss") && ok;

	// Frame 2: the device reports focus lost (browser canvas blur analog).
	// resetKeys() clears m_keys, m_keyStatus, and m_modifiers (caps re-applied
	// only if caps is on, which it is not here), so no stream messages should
	// be produced for the focus-loss frame.
	keyboard.clearScript();
	keyboard.queueKey(KEY_LOST, KEY_STATE_NONE);
	{
		FrameStream fs;
		keyboard.update();
		keyboard.createStreamMessages();

		ok = expect(fs.first() == nullptr,
			"focus-loss frame should produce no stream messages after resetKeys") && ok;
	}
	ok = expect(!BitTest(keyboard.getModifierFlags(), KEY_STATE_LSHIFT),
		"resetKeys should clear the folded left-shift modifier") && ok;
	ok = expect(!keyboard.queryKeyStateBit(KEY_A, KEY_STATE_DOWN),
		"resetKeys should clear the cached KEY_A down state") && ok;

	// A follow-on empty frame must stay quiet: no phantom repeats, no leftover
	// state from before the focus loss.
	keyboard.clearScript();
	{
		FrameStream fs;
		keyboard.update();
		keyboard.createStreamMessages();

		ok = expect(fs.first() == nullptr,
			"the first empty frame after focus loss should still produce no stream messages") && ok;
	}
	ok = expect(!keyboard.queryKeyStateBit(KEY_A, KEY_STATE_DOWN),
		"KEY_A should remain cleared after an empty frame following focus loss") && ok;

	return ok;
}

// Autorepeat-state proof.
//
// Frame 1 presses KEY_A. With no further device events, the original
// Keyboard::checkKeyRepeat() schedules a synthetic repeat once
// (m_inputFrame - m_keyStatus[KEY_A].sequence) exceeds KEY_REPEAT_DELAY. Frames
// below the threshold must not repeat; the first frame past the threshold must
// emit exactly one MSG_RAW_KEY_DOWN whose state carries both KEY_STATE_DOWN and
// KEY_STATE_AUTOREPEAT.
bool exercise_autorepeat_state(SmokeKeyboard &keyboard)
{
	bool ok = true;
	ScopedKeyboardGlobals globals(&keyboard);

	// Frame 1: press KEY_A. The initial down is emitted into the stream; its
	// sequence number is recorded as m_inputFrame == 1. The initial press must
	// not carry the autorepeat flag.
	keyboard.clearScript();
	keyboard.queueKey(KEY_A, KEY_STATE_DOWN);
	{
		FrameStream fs;
		keyboard.update();
		keyboard.createStreamMessages();

		GameMessage *initialDown = fs.first();
		ok = expect(initialDown != nullptr, "autorepeat probe frame 1 should emit an initial key-down") && ok;
		ok = expect(initialDown == nullptr || initialDown->getType() == GameMessage::MSG_RAW_KEY_DOWN,
			"autorepeat probe frame 1 message should be MSG_RAW_KEY_DOWN") && ok;
		if (initialDown != nullptr) {
			ok = expect_integer_arg(initialDown, 0, KEY_A,
				"the initial press message should carry KEY_A") && ok;
			ok = expect(!BitTest(initialDown->getArgument(1)->integer, KEY_STATE_AUTOREPEAT),
				"the initial press should not carry KEY_STATE_AUTOREPEAT") && ok;
		}
	}

	// Advance frames with no fresh device input until just before the repeat
	// threshold. (m_inputFrame - sequence) == kKeyRepeatDelay is NOT greater
	// than the delay, so no repeat may fire here: every below-threshold frame
	// must produce an empty stream.
	for (int frame = 0; frame < kKeyRepeatDelay; ++frame) {
		keyboard.clearScript();
		FrameStream fs;
		keyboard.update();
		keyboard.createStreamMessages();

		ok = expect(fs.first() == nullptr,
			"no autorepeat message should be emitted before the KEY_REPEAT_DELAY threshold") && ok;
	}

	// The next empty frame crosses the threshold: m_inputFrame - sequence >
	// KEY_REPEAT_DELAY. The original checkKeyRepeat() must append exactly one
	// synthetic KEY_A entry carrying DOWN|AUTOREPEAT, and createStreamMessages()
	// must emit it as a single MSG_RAW_KEY_DOWN.
	keyboard.clearScript();
	{
		FrameStream fs;
		keyboard.update();
		keyboard.createStreamMessages();

		GameMessage *repeatDown = fs.first();
		ok = expect(repeatDown != nullptr,
			"a repeat message should be appended once the KEY_REPEAT_DELAY threshold is crossed") && ok;
		ok = expect(repeatDown == nullptr || count_messages(fs.first()) == 1,
			"the crossing frame should emit exactly one repeat message") && ok;
		ok = expect(repeatDown == nullptr || repeatDown->getType() == GameMessage::MSG_RAW_KEY_DOWN,
			"the repeat message should be MSG_RAW_KEY_DOWN") && ok;
		ok = expect(repeatDown == nullptr || repeatDown->getArgumentCount() == 2,
			"the repeat message should carry key and state arguments") && ok;

		if (repeatDown != nullptr) {
			ok = expect_integer_arg(repeatDown, 0, KEY_A,
				"the repeat message should carry the repeating KEY_A code") && ok;
			Int state = repeatDown->getArgument(1)->integer;
			ok = expect(BitTest(state, KEY_STATE_DOWN),
				"the repeat message state should include KEY_STATE_DOWN") && ok;
			ok = expect(BitTest(state, KEY_STATE_AUTOREPEAT),
				"the repeat message state should include KEY_STATE_AUTOREPEAT") && ok;
		}
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
		ok = exercise_focus_loss_reset(keyboard) && ok;
	}
	{
		SmokeKeyboard keyboard;
		ok = exercise_autorepeat_state(keyboard) && ok;
	}
	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::cout << "{\"ok\":true,\"library\":\"Keyboard\",\"covered\":\"Keyboard::updateKeys/resetKeys/checkKeyRepeat KEY_LOST focus-loss reset plus KEY_STATE_AUTOREPEAT scheduling through original GameClient/Input/Keyboard.cpp\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
