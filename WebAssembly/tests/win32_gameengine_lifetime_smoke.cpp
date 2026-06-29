#include <iostream>

#include <mmsystem.h>
#include <windows.h>

#include "Common/GameEngine.h"
#include "Win32Device/Common/Win32GameEngine.h"

class LANAPI;

DWORD TheMessageTime = 0;
HWND ApplicationHWnd = nullptr;
GameLogic *TheGameLogic = nullptr;
AudioManager *TheAudio = nullptr;
LANAPI *TheLAN = nullptr;
GameEngine *TheGameEngine = nullptr;
SubsystemInterfaceList *TheSubsystemList = nullptr;

// Focus this target on the original Win32GameEngine concrete. Full
// GameEngine.cpp startup/destructor singleton ownership is the next boundary.
GameEngine::GameEngine()
{
	timeBeginPeriod(1);
	m_maxFPS = 0;
	m_quitting = FALSE;
	m_isActive = FALSE;
}

GameEngine::~GameEngine()
{
	timeEndPeriod(1);
}

void GameEngine::init() {}
void GameEngine::init(int, char **) {}
void GameEngine::reset() {}
void GameEngine::update() {}
void GameEngine::execute() {}
void GameEngine::setFramesPerSecondLimit(Int fps) { m_maxFPS = fps; }
Int GameEngine::getFramesPerSecondLimit() { return m_maxFPS; }
Bool GameEngine::isMultiplayerSession() { return FALSE; }
FileSystem *GameEngine::createFileSystem() { return nullptr; }
MessageStream *GameEngine::createMessageStream() { return nullptr; }

namespace {

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

} // namespace

int main()
{
	const UINT previous_error_mode = SetErrorMode(0x0040);
	const UINT before_construct = GetErrorMode();

	Win32GameEngine *engine = new Win32GameEngine();
	if (!expect(engine != nullptr, "Win32GameEngine construction should succeed")) {
		return 1;
	}
	if (!expect(before_construct == 0x0040,
			"SetErrorMode should expose the pre-construction error mode")) {
		return 1;
	}
	if (!expect(GetErrorMode() == SEM_FAILCRITICALERRORS,
			"Win32GameEngine constructor should set SEM_FAILCRITICALERRORS")) {
		return 1;
	}
	if (!expect(engine->isActive() == FALSE,
			"GameEngine constructor should initialize inactive focus state")) {
		return 1;
	}
	if (!expect(engine->getQuitting() == FALSE,
			"GameEngine constructor should initialize quitting false")) {
		return 1;
	}
	if (!expect(engine->getFramesPerSecondLimit() == 0,
			"GameEngine constructor should initialize max FPS to zero")) {
		return 1;
	}

	engine->setIsActive(TRUE);
	engine->setQuitting(TRUE);
	engine->setFramesPerSecondLimit(45);
	if (!expect(engine->isActive() == TRUE
			&& engine->getQuitting() == TRUE
			&& engine->getFramesPerSecondLimit() == 45,
			"inherited GameEngine state setters should round-trip on Win32GameEngine")) {
		return 1;
	}

	delete engine;
	const UINT after_destruct = GetErrorMode();
	SetErrorMode(previous_error_mode);

	if (!expect(after_destruct == 0x0040,
			"Win32GameEngine destructor should restore the previous error mode")) {
		return 1;
	}

	std::cout
		<< "{\"ok\":true,"
		<< "\"source\":\"GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp\","
		<< "\"base\":\"focused GameEngine lifetime owner\","
		<< "\"constructed\":true,"
		<< "\"destructed\":true,"
		<< "\"fullOriginalGameEngineCppLinked\":false,"
		<< "\"nextRequired\":\"original GameEngine.cpp singleton ownership before createAudioManager\"}"
		<< "\n";
	return 0;
}
