#include <iostream>
#include <cstring>

#include <windows.h>

#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/MessageStream.h"
#include "GameClient/GameClient.h"
#include "GameClient/Keyboard.h"
#include "Win32Device/GameClient/Win32Mouse.h"

HINSTANCE ApplicationHInstance = nullptr;
HWND ApplicationHWnd = nullptr;
GlobalData *TheGlobalData = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;
Win32Mouse *TheWin32Mouse = nullptr;
GameClient *TheGameClient = nullptr;

// Keep this focused input smoke from extracting full GameClient.cpp, which owns
// shell/control-bar/GameSpy dependencies that this target does not exercise.
GameClient::GameClient() :
	m_frame(0),
	m_drawableList(nullptr),
	m_nextDrawableID(static_cast<DrawableID>(1)),
	m_numTranslators(0),
	m_commandTranslator(nullptr),
	m_renderedObjectCount(0)
{
	for (Int index = 0; index < MAX_CLIENT_TRANSLATORS; ++index) {
		m_translators[index] = TRANSLATOR_ID_INVALID;
	}
	m_drawableVector.clear();
}

GameClient::~GameClient() = default;

void GameClient::init() {}
void GameClient::update() {}
void GameClient::reset() {}
void GameClient::registerDrawable(Drawable *) {}
void GameClient::addDrawableToLookupTable(Drawable *) {}
void GameClient::removeDrawableFromLookupTable(Drawable *) {}
GameMessage::Type GameClient::evaluateContextCommand(Drawable *,
	const Coord3D *,
	CommandTranslator::CommandEvaluateType)
{
	return GameMessage::MSG_INVALID;
}
void GameClient::removeFromRayEffects(Drawable *) {}
void GameClient::getRayEffectData(Drawable *, RayEffectData *) {}
Bool GameClient::loadMap(AsciiString) { return FALSE; }
void GameClient::unloadMap(AsciiString) {}
void GameClient::iterateDrawablesInRegion(Region3D *, GameClientFuncPtr, void *) {}
void GameClient::destroyDrawable(Drawable *) {}
void GameClient::setTimeOfDay(TimeOfDay) {}
void GameClient::selectDrawablesInGroup(Int) {}
void GameClient::assignSelectedDrawablesToGroup(Int) {}
void GameClient::addTextBearingDrawable(Drawable *) {}
void GameClient::releaseShadows() {}
void GameClient::allocateShadows() {}
void GameClient::preloadAssets(TimeOfDay) {}
void GameClient::crc(Xfer *) {}
void GameClient::xfer(Xfer *) {}
void GameClient::loadPostProcess() {}

namespace {

class SmokeWin32Mouse : public Win32Mouse
{
public:
	using Win32Mouse::getMouseEvent;

	// Full Win32Mouse::init() still owns display-string/font dependencies; this
	// probe resets only the original input fields needed by update/stream output.
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

class SmokeGameClient : public GameClient
{
public:
	void init() override {}
	void postProcessLoad() override {}
	void reset() override {}
	void update() override {}
	void draw() override {}
	void setFrame(UnsignedInt frame) override { m_frame = frame; }
	void registerDrawable(Drawable *) override {}
	Drawable *findDrawableByID(const DrawableID) override { return nullptr; }
	Drawable *firstDrawable() override { return nullptr; }
	GameMessage::Type evaluateContextCommand(Drawable *,
		const Coord3D *,
		CommandTranslator::CommandEvaluateType) override { return GameMessage::MSG_INVALID; }
	void removeFromRayEffects(Drawable *) override {}
	void getRayEffectData(Drawable *, RayEffectData *) override {}
	void createRayEffectByTemplate(const Coord3D *, const Coord3D *, const ThingTemplate *) override {}
	void addScorch(const Coord3D *, Real, Scorches) override {}
	Bool loadMap(AsciiString) override { return FALSE; }
	void unloadMap(AsciiString) override {}
	void iterateDrawablesInRegion(Region3D *, GameClientFuncPtr, void *) override {}
	Drawable *friend_createDrawable(const ThingTemplate *, DrawableStatus = DRAWABLE_STATUS_NONE) override
	{
		return nullptr;
	}
	void destroyDrawable(Drawable *) override {}
	void setTimeOfDay(TimeOfDay) override {}
	void selectDrawablesInGroup(Int) override {}
	void assignSelectedDrawablesToGroup(Int) override {}
	UnsignedInt getFrame() override { return m_frame; }
	void setTeamColor(Int, Int, Int) override {}
	void adjustLOD(Int) override {}
	void releaseShadows() override {}
	void allocateShadows() override {}
	void preloadAssets(TimeOfDay) override {}
	Drawable *getDrawableList() override { return nullptr; }
	void notifyTerrainObjectMoved(Object *) override {}

private:
	Display *createGameDisplay() override { return nullptr; }
	InGameUI *createInGameUI() override { return nullptr; }
	GameWindowManager *createWindowManager() override { return nullptr; }
	FontLibrary *createFontLibrary() override { return nullptr; }
	DisplayStringManager *createDisplayStringManager() override { return nullptr; }
	VideoPlayerInterface *createVideoPlayer() override { return nullptr; }
	TerrainVisual *createTerrainVisual() override { return nullptr; }
	Keyboard *createKeyboard() override { return nullptr; }
	Mouse *createMouse() override { return nullptr; }
	SnowManager *createSnowManager() override { return nullptr; }
	void setFrameRate(Real) override {}

protected:
	void crc(Xfer *) override {}
	void xfer(Xfer *) override {}
	void loadPostProcess() override {}
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
	{
		GlobalData globalData;
		SmokeKeyboard keyboard;

		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		MessageStream *oldMessageStream = TheMessageStream;
		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;

		{
			MessageStream stream;
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
		}

		{
			MessageStream stream;
			TheMessageStream = &stream;

			mouse.prepareEngineUpdateProbe(800, 600);
			mouse.addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(100, 120), 910);
			mouse.addWin32Event(WM_MOUSEMOVE, 0, make_mouse_lparam(130, 150), 911);
			mouse.update();
			mouse.createStreamMessages();

			GameMessage *position = stream.getFirstMessage();
			GameMessage *leftDown = position != nullptr ? position->next() : nullptr;
			GameMessage *leftDrag = leftDown != nullptr ? leftDown->next() : nullptr;
			ok = expect(position != nullptr, "drag stream should include a raw position message") && ok;
			ok = expect(leftDown != nullptr, "drag stream should include a left-down message") && ok;
			ok = expect(leftDrag != nullptr, "drag stream should include a left-drag message") && ok;
			ok = expect(leftDrag == nullptr || leftDrag->next() == nullptr,
				"drag stream should only append position, left-down, and left-drag messages") && ok;

			if (position != nullptr) {
				ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
					"drag stream first message should be MSG_RAW_MOUSE_POSITION") && ok;
				ok = expect(position->getArgumentCount() == 2,
					"drag stream raw position should carry position and modifiers") && ok;
				ok = expect_pixel_arg(position, 0, 0, 0,
					"drag stream raw position should use the current mouse position before event folding") && ok;
				ok = expect_integer_arg(position, 1, KEY_STATE_NONE,
					"drag stream raw position should include keyboard modifier flags") && ok;
			}

			if (leftDown != nullptr) {
				ok = expect(leftDown->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN,
					"drag stream second message should be MSG_RAW_MOUSE_LEFT_BUTTON_DOWN") && ok;
				ok = expect(leftDown->getArgumentCount() == 3,
					"drag stream left-down should carry position, modifiers, and timestamp") && ok;
				ok = expect_pixel_arg(leftDown, 0, 100, 120,
					"drag stream left-down should carry the down coordinates") && ok;
				ok = expect_integer_arg(leftDown, 1, KEY_STATE_NONE,
					"drag stream left-down should include keyboard modifier flags") && ok;
				ok = expect_integer_arg(leftDown, 2, 910,
					"drag stream left-down should carry the Win32 event timestamp") && ok;
			}

			if (leftDrag != nullptr) {
				ok = expect(leftDrag->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_DRAG,
					"drag stream third message should be MSG_RAW_MOUSE_LEFT_DRAG") && ok;
				ok = expect(leftDrag->getArgumentCount() == 3,
					"left-drag message should carry position, delta, and modifiers") && ok;
				ok = expect_pixel_arg(leftDrag, 0, 130, 150,
					"left-drag message should carry the moved coordinates") && ok;
				ok = expect_pixel_arg(leftDrag, 1, 30, 30,
					"left-drag message should carry the folded mouse delta") && ok;
				ok = expect_integer_arg(leftDrag, 2, KEY_STATE_NONE,
					"left-drag message should include keyboard modifier flags") && ok;
			}
		}

		{
			MessageStream stream;
			TheMessageStream = &stream;

			mouse.prepareEngineUpdateProbe(800, 600);
			mouse.addWin32Event(WM_MOUSEWHEEL, MAKELPARAM(0, 240), make_mouse_lparam(220, 240), 920);
			mouse.update();
			mouse.createStreamMessages();

			GameMessage *position = stream.getFirstMessage();
			GameMessage *wheel = position != nullptr ? position->next() : nullptr;
			ok = expect(position != nullptr, "wheel stream should include a raw position message") && ok;
			ok = expect(wheel != nullptr, "wheel stream should include a wheel message") && ok;
			ok = expect(wheel == nullptr || wheel->next() == nullptr,
				"wheel stream should only append position and wheel messages") && ok;

			if (position != nullptr) {
				ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
					"wheel stream first message should be MSG_RAW_MOUSE_POSITION") && ok;
				ok = expect(position->getArgumentCount() == 2,
					"wheel stream raw position should carry position and modifiers") && ok;
				ok = expect_pixel_arg(position, 0, 0, 0,
					"wheel stream raw position should use the current mouse position before event folding") && ok;
				ok = expect_integer_arg(position, 1, KEY_STATE_NONE,
					"wheel stream raw position should include keyboard modifier flags") && ok;
			}

			if (wheel != nullptr) {
				ok = expect(wheel->getType() == GameMessage::MSG_RAW_MOUSE_WHEEL,
					"wheel stream second message should be MSG_RAW_MOUSE_WHEEL") && ok;
				ok = expect(wheel->getArgumentCount() == 3,
					"wheel message should carry position, wheel clicks, and modifiers") && ok;
				ok = expect_pixel_arg(wheel, 0, 220, 240,
					"wheel message should carry folded Win32 wheel coordinates") && ok;
				ok = expect_integer_arg(wheel, 1, 2,
					"wheel message should carry wheel delta divided by 120") && ok;
				ok = expect_integer_arg(wheel, 2, KEY_STATE_NONE,
					"wheel message should include keyboard modifier flags") && ok;
			}
		}

		TheMessageStream = oldMessageStream;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
	return ok;
}

bool exercise_engine_global_mouse_stream_messages(SmokeWin32Mouse &mouse)
{
	bool ok = true;
	{
		GlobalData globalData;
		SmokeKeyboard keyboard;

		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		MessageStream *oldMessageStream = TheMessageStream;
		Mouse *oldMouse = TheMouse;
		Win32Mouse *oldWin32Mouse = TheWin32Mouse;

		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;
		TheMouse = &mouse;
		TheWin32Mouse = &mouse;

		ok = expect(TheMouse == static_cast<Mouse *>(TheWin32Mouse),
			"engine-global mouse probe should wire TheMouse and TheWin32Mouse to the same Win32Mouse") && ok;

		{
			MessageStream stream;
			TheMessageStream = &stream;

			mouse.prepareEngineUpdateProbe(800, 600);
			TheWin32Mouse->addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(345, 67), 1001);
			TheMouse->UPDATE();
			TheMouse->createStreamMessages();

			ok = expect(mouse.inputFrame() == 1 && mouse.eventsThisFrame() == 1,
				"engine-global left-down probe should drive Mouse::update through TheMouse") && ok;

			GameMessage *position = stream.getFirstMessage();
			GameMessage *leftDown = position != nullptr ? position->next() : nullptr;
			ok = expect(position != nullptr, "engine-global left-down probe should include a raw position message") && ok;
			ok = expect(leftDown != nullptr, "engine-global left-down probe should include a left-down message") && ok;
			ok = expect(leftDown == nullptr || leftDown->next() == nullptr,
				"engine-global left-down probe should only append position and left-down messages") && ok;

			if (position != nullptr) {
				ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
					"engine-global left-down first message should be MSG_RAW_MOUSE_POSITION") && ok;
				ok = expect(position->getArgumentCount() == 2,
					"engine-global left-down position message should carry position and modifiers") && ok;
				ok = expect(position->getPlayerIndex() == -1,
					"engine-global early input message should use invalid player index before PlayerList exists") && ok;
				ok = expect_pixel_arg(position, 0, 0, 0,
					"engine-global left-down position message should use pre-fold position") && ok;
				ok = expect_integer_arg(position, 1, KEY_STATE_NONE,
					"engine-global left-down position message should include keyboard modifier flags") && ok;
			}

			if (leftDown != nullptr) {
				ok = expect(leftDown->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN,
					"engine-global left-down second message should be MSG_RAW_MOUSE_LEFT_BUTTON_DOWN") && ok;
				ok = expect(leftDown->getArgumentCount() == 3,
					"engine-global left-down message should carry position, modifiers, and timestamp") && ok;
				ok = expect(leftDown->getPlayerIndex() == -1,
					"engine-global left-down message should use invalid player index before PlayerList exists") && ok;
				ok = expect_pixel_arg(leftDown, 0, 345, 67,
					"engine-global left-down message should carry folded Win32 coordinates") && ok;
				ok = expect_integer_arg(leftDown, 1, KEY_STATE_NONE,
					"engine-global left-down message should include keyboard modifier flags") && ok;
				ok = expect_integer_arg(leftDown, 2, 1001,
					"engine-global left-down message should carry the Win32 timestamp") && ok;
			}
		}

		{
			MessageStream stream;
			TheMessageStream = &stream;

			mouse.prepareEngineUpdateProbe(800, 600);
			TheWin32Mouse->addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(120, 140), 1010);
			TheWin32Mouse->addWin32Event(WM_MOUSEMOVE, 0, make_mouse_lparam(150, 175), 1011);
			TheMouse->UPDATE();
			TheMouse->createStreamMessages();

			ok = expect(mouse.inputFrame() == 1 && mouse.eventsThisFrame() == 2,
				"engine-global drag probe should drive Mouse::update through TheMouse") && ok;

			GameMessage *position = stream.getFirstMessage();
			GameMessage *leftDown = position != nullptr ? position->next() : nullptr;
			GameMessage *leftDrag = leftDown != nullptr ? leftDown->next() : nullptr;
			ok = expect(position != nullptr, "engine-global drag probe should include a raw position message") && ok;
			ok = expect(leftDown != nullptr, "engine-global drag probe should include a left-down message") && ok;
			ok = expect(leftDrag != nullptr, "engine-global drag probe should include a left-drag message") && ok;
			ok = expect(leftDrag == nullptr || leftDrag->next() == nullptr,
				"engine-global drag probe should only append position, left-down, and drag messages") && ok;

			if (position != nullptr) {
				ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
					"engine-global drag first message should be MSG_RAW_MOUSE_POSITION") && ok;
				ok = expect(position->getArgumentCount() == 2,
					"engine-global drag position message should carry position and modifiers") && ok;
				ok = expect_pixel_arg(position, 0, 0, 0,
					"engine-global drag position message should use pre-fold position") && ok;
				ok = expect_integer_arg(position, 1, KEY_STATE_NONE,
					"engine-global drag position message should include keyboard modifier flags") && ok;
			}

			if (leftDown != nullptr) {
				ok = expect(leftDown->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN,
					"engine-global drag second message should be MSG_RAW_MOUSE_LEFT_BUTTON_DOWN") && ok;
				ok = expect(leftDown->getArgumentCount() == 3,
					"engine-global drag left-down message should carry position, modifiers, and timestamp") && ok;
				ok = expect_pixel_arg(leftDown, 0, 120, 140,
					"engine-global drag left-down message should carry the down coordinates") && ok;
				ok = expect_integer_arg(leftDown, 1, KEY_STATE_NONE,
					"engine-global drag left-down message should include keyboard modifier flags") && ok;
				ok = expect_integer_arg(leftDown, 2, 1010,
					"engine-global drag left-down message should carry the Win32 timestamp") && ok;
			}

			if (leftDrag != nullptr) {
				ok = expect(leftDrag->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_DRAG,
					"engine-global drag third message should be MSG_RAW_MOUSE_LEFT_DRAG") && ok;
				ok = expect(leftDrag->getArgumentCount() == 3,
					"engine-global left-drag message should carry position, delta, and modifiers") && ok;
				ok = expect_pixel_arg(leftDrag, 0, 150, 175,
					"engine-global left-drag message should carry the moved coordinates") && ok;
				ok = expect_pixel_arg(leftDrag, 1, 30, 35,
					"engine-global left-drag message should carry the folded mouse delta") && ok;
				ok = expect_integer_arg(leftDrag, 2, KEY_STATE_NONE,
					"engine-global left-drag message should include keyboard modifier flags") && ok;
			}
		}

		{
			MessageStream stream;
			TheMessageStream = &stream;

			mouse.prepareEngineUpdateProbe(800, 600);
			TheWin32Mouse->addWin32Event(WM_MOUSEWHEEL, MAKELPARAM(0, 240), make_mouse_lparam(220, 240), 1020);
			TheMouse->UPDATE();
			TheMouse->createStreamMessages();

			ok = expect(mouse.inputFrame() == 1 && mouse.eventsThisFrame() == 1,
				"engine-global wheel probe should drive Mouse::update through TheMouse") && ok;

			GameMessage *position = stream.getFirstMessage();
			GameMessage *wheel = position != nullptr ? position->next() : nullptr;
			ok = expect(position != nullptr, "engine-global wheel probe should include a raw position message") && ok;
			ok = expect(wheel != nullptr, "engine-global wheel probe should include a wheel message") && ok;
			ok = expect(wheel == nullptr || wheel->next() == nullptr,
				"engine-global wheel probe should only append position and wheel messages") && ok;

			if (position != nullptr) {
				ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
					"engine-global wheel first message should be MSG_RAW_MOUSE_POSITION") && ok;
				ok = expect(position->getArgumentCount() == 2,
					"engine-global wheel position message should carry position and modifiers") && ok;
				ok = expect_pixel_arg(position, 0, 0, 0,
					"engine-global wheel position message should use pre-fold position") && ok;
				ok = expect_integer_arg(position, 1, KEY_STATE_NONE,
					"engine-global wheel position message should include keyboard modifier flags") && ok;
			}

			if (wheel != nullptr) {
				ok = expect(wheel->getType() == GameMessage::MSG_RAW_MOUSE_WHEEL,
					"engine-global wheel second message should be MSG_RAW_MOUSE_WHEEL") && ok;
				ok = expect(wheel->getArgumentCount() == 3,
					"engine-global wheel message should carry position, wheel clicks, and modifiers") && ok;
				ok = expect_pixel_arg(wheel, 0, 220, 240,
					"engine-global wheel message should carry folded Win32 wheel coordinates") && ok;
				ok = expect_integer_arg(wheel, 1, 2,
					"engine-global wheel message should carry wheel delta divided by 120") && ok;
				ok = expect_integer_arg(wheel, 2, KEY_STATE_NONE,
					"engine-global wheel message should include keyboard modifier flags") && ok;
			}
		}

		TheMessageStream = oldMessageStream;
		TheWin32Mouse = oldWin32Mouse;
		TheMouse = oldMouse;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
	return ok;
}

bool exercise_engine_global_mouse_with_gameclient_frame_source(SmokeWin32Mouse &mouse)
{
	bool ok = true;
	{
		GlobalData globalData;
		SmokeKeyboard keyboard;
		SmokeGameClient gameClient;

		GlobalData *oldGlobalData = TheGlobalData;
		Keyboard *oldKeyboard = TheKeyboard;
		MessageStream *oldMessageStream = TheMessageStream;
		Mouse *oldMouse = TheMouse;
		Win32Mouse *oldWin32Mouse = TheWin32Mouse;
		GameClient *oldGameClient = TheGameClient;

		TheGlobalData = &globalData;
		TheKeyboard = &keyboard;
		TheMouse = &mouse;
		TheWin32Mouse = &mouse;
		TheGameClient = &gameClient;
		TheGameClient->setFrame(4321);

		ok = expect(TheGameClient->getFrame() == 4321,
			"non-null GameClient frame source should be available through TheGameClient") && ok;

		{
			MessageStream stream;
			TheMessageStream = &stream;

			mouse.prepareEngineUpdateProbe(800, 600);
			TheWin32Mouse->addWin32Event(WM_LBUTTONDOWN, 0, make_mouse_lparam(210, 65), 1030);
			TheMouse->UPDATE();
			TheMouse->createStreamMessages();

			ok = expect(TheGameClient != nullptr && TheGameClient->getFrame() == 4321,
				"mouse stream creation should preserve the non-null GameClient frame source") && ok;
			ok = expect(mouse.inputFrame() == 1 && mouse.eventsThisFrame() == 1,
				"non-null GameClient mouse probe should still drive Mouse::update through TheMouse") && ok;

			GameMessage *position = stream.getFirstMessage();
			GameMessage *leftDown = position != nullptr ? position->next() : nullptr;
			ok = expect(position != nullptr,
				"non-null GameClient mouse probe should include a raw position message") && ok;
			ok = expect(leftDown != nullptr,
				"non-null GameClient mouse probe should include a left-down message") && ok;
			ok = expect(leftDown == nullptr || leftDown->next() == nullptr,
				"non-null GameClient mouse probe should only append position and left-down messages") && ok;

			if (position != nullptr) {
				ok = expect(position->getType() == GameMessage::MSG_RAW_MOUSE_POSITION,
					"non-null GameClient mouse first message should be MSG_RAW_MOUSE_POSITION") && ok;
				ok = expect(position->getPlayerIndex() == -1,
					"non-null GameClient early input message should use invalid player index before PlayerList exists") && ok;
				ok = expect_pixel_arg(position, 0, 0, 0,
					"non-null GameClient position message should use pre-fold position") && ok;
				ok = expect_integer_arg(position, 1, KEY_STATE_NONE,
					"non-null GameClient position message should include keyboard modifier flags") && ok;
			}

			if (leftDown != nullptr) {
				ok = expect(leftDown->getType() == GameMessage::MSG_RAW_MOUSE_LEFT_BUTTON_DOWN,
					"non-null GameClient mouse second message should be MSG_RAW_MOUSE_LEFT_BUTTON_DOWN") && ok;
				ok = expect(leftDown->getPlayerIndex() == -1,
					"non-null GameClient left-down message should use invalid player index before PlayerList exists") && ok;
				ok = expect_pixel_arg(leftDown, 0, 210, 65,
					"non-null GameClient left-down message should carry folded Win32 coordinates") && ok;
				ok = expect_integer_arg(leftDown, 1, KEY_STATE_NONE,
					"non-null GameClient left-down message should include keyboard modifier flags") && ok;
				ok = expect_integer_arg(leftDown, 2, 1030,
					"non-null GameClient left-down message should carry the Win32 timestamp") && ok;
			}
		}

		TheGameClient = oldGameClient;
		TheMessageStream = oldMessageStream;
		TheWin32Mouse = oldWin32Mouse;
		TheMouse = oldMouse;
		TheKeyboard = oldKeyboard;
		TheGlobalData = oldGlobalData;
	}
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

	initMemoryManager();
	bool streamMessagesOk = exercise_mouse_stream_messages(mouse);
	if (streamMessagesOk) {
		streamMessagesOk = exercise_engine_global_mouse_stream_messages(mouse);
	}
	if (streamMessagesOk) {
		streamMessagesOk = exercise_engine_global_mouse_with_gameclient_frame_source(mouse);
	}
	shutdownMemoryManager();
	if (!streamMessagesOk) {
		return 1;
	}

	TheWin32Mouse = nullptr;
	std::cout << "{\"ok\":true,\"library\":\"Win32Mouse\",\"covered\":\"Win32Mouse translation plus real Mouse::update/processMouseEvent/createStreamMessages, engine-global mouse singleton delivery, and non-null GameClient frame-source coexistence\",\"source\":\"GeneralsMD original\"}\n";
	return 0;
}
