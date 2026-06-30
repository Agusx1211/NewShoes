#include <iostream>

#include <atlbase.h>
#include <mmsystem.h>
#include <windows.h>

#include "Common/GameEngine.h"
#include "Common/SubsystemInterface.h"
#include "GameNetwork/GameSpy/GameResultsThread.h"
#include "Win32Device/Common/Win32GameEngine.h"

class AI;
class ActionManager;
class Anim2DCollection;
class ArchiveFileSystem;
class ArmorStore;
class AudioManager;
class BuildAssistant;
class CDManagerInterface;
class CaveSystem;
class CommandList;
class CrateSystem;
class DamageFXStore;
class Display;
class DisplayStringManager;
class DrawGroupInfo;
class FXListStore;
class FileSystem;
class FontLibrary;
class FunctionLexicon;
class GameClient;
class GameState;
class GameStateMap;
class GameTextInterface;
class GlobalData;
class GlobalLanguage;
class ImageCollection;
class InGameUI;
class LanguageFilter;
class LocalFileSystem;
class LocomotorStore;
class MapCache;
class MemoryPoolFactory;
class MessageStream;
class MetaMap;
class ModuleFactory;
class MultiplayerSettings;
class NameKeyGenerator;
class NetworkInterface;
class ObjectCreationListStore;
class ParticleSystemManager;
class PlayerList;
class PlayerTemplateStore;
class Radar;
class RankInfoStore;
class RecorderClass;
class ScienceStore;
class ScriptEngine;
class SidesList;
class SpecialPowerStore;
class TeamFactory;
class TerrainLogic;
class TerrainRoadCollection;
class TerrainTypeCollection;
class ThingFactory;
class UpgradeCenter;
class VictoryConditionsInterface;
class View;
class WeaponStore;
class GameWindowManager;
class LANAPI;
class GameLODManager;

// Storage-only owners for singleton pointers referenced by unentered startup
// methods in full GameEngine.cpp/Drawable.cpp. Real archive definitions override
// these weak symbols; the called constructor/destructor path stays original.
#define WEAK_SINGLETON __attribute__((weak))

HINSTANCE ApplicationHInstance = nullptr;
CComModule _Module;
DWORD TheMessageTime = 0;
HWND ApplicationHWnd = nullptr;
GameLogic *TheGameLogic WEAK_SINGLETON = nullptr;
LANAPI *TheLAN WEAK_SINGLETON = nullptr;
GameLODManager *TheGameLODManager WEAK_SINGLETON = nullptr;
GameResultsInterface *TheGameResultsQueue WEAK_SINGLETON = nullptr;
MapCache *TheMapCache WEAK_SINGLETON = nullptr;
NetworkInterface *TheNetwork WEAK_SINGLETON = nullptr;

AI *TheAI WEAK_SINGLETON = nullptr;
ActionManager *TheActionManager WEAK_SINGLETON = nullptr;
Anim2DCollection *TheAnim2DCollection WEAK_SINGLETON = nullptr;
ArchiveFileSystem *TheArchiveFileSystem WEAK_SINGLETON = nullptr;
ArmorStore *TheArmorStore WEAK_SINGLETON = nullptr;
AudioManager *TheAudio WEAK_SINGLETON = nullptr;
BuildAssistant *TheBuildAssistant WEAK_SINGLETON = nullptr;
CDManagerInterface *TheCDManager WEAK_SINGLETON = nullptr;
CaveSystem *TheCaveSystem WEAK_SINGLETON = nullptr;
CommandList *TheCommandList WEAK_SINGLETON = nullptr;
CrateSystem *TheCrateSystem WEAK_SINGLETON = nullptr;
DamageFXStore *TheDamageFXStore WEAK_SINGLETON = nullptr;
Display *TheDisplay WEAK_SINGLETON = nullptr;
DisplayStringManager *TheDisplayStringManager WEAK_SINGLETON = nullptr;
DrawGroupInfo *TheDrawGroupInfo WEAK_SINGLETON = nullptr;
FXListStore *TheFXListStore WEAK_SINGLETON = nullptr;
FileSystem *TheFileSystem WEAK_SINGLETON = nullptr;
FontLibrary *TheFontLibrary WEAK_SINGLETON = nullptr;
FunctionLexicon *TheFunctionLexicon WEAK_SINGLETON = nullptr;
GameClient *TheGameClient WEAK_SINGLETON = nullptr;
GameState *TheGameState WEAK_SINGLETON = nullptr;
GameStateMap *TheGameStateMap WEAK_SINGLETON = nullptr;
GameTextInterface *TheGameText WEAK_SINGLETON = nullptr;
GlobalLanguage *TheGlobalLanguageData WEAK_SINGLETON = nullptr;
ImageCollection *TheMappedImageCollection WEAK_SINGLETON = nullptr;
InGameUI *TheInGameUI WEAK_SINGLETON = nullptr;
LanguageFilter *TheLanguageFilter WEAK_SINGLETON = nullptr;
LocalFileSystem *TheLocalFileSystem WEAK_SINGLETON = nullptr;
LocomotorStore *TheLocomotorStore WEAK_SINGLETON = nullptr;
MemoryPoolFactory *TheMemoryPoolFactory WEAK_SINGLETON = nullptr;
MessageStream *TheMessageStream WEAK_SINGLETON = nullptr;
MetaMap *TheMetaMap WEAK_SINGLETON = nullptr;
ModuleFactory *TheModuleFactory WEAK_SINGLETON = nullptr;
MultiplayerSettings *TheMultiplayerSettings WEAK_SINGLETON = nullptr;
NameKeyGenerator *TheNameKeyGenerator WEAK_SINGLETON = nullptr;
ObjectCreationListStore *TheObjectCreationListStore WEAK_SINGLETON = nullptr;
ParticleSystemManager *TheParticleSystemManager WEAK_SINGLETON = nullptr;
PlayerList *ThePlayerList WEAK_SINGLETON = nullptr;
PlayerTemplateStore *ThePlayerTemplateStore WEAK_SINGLETON = nullptr;
Radar *TheRadar WEAK_SINGLETON = nullptr;
RankInfoStore *TheRankInfoStore WEAK_SINGLETON = nullptr;
RecorderClass *TheRecorder WEAK_SINGLETON = nullptr;
ScienceStore *TheScienceStore WEAK_SINGLETON = nullptr;
ScriptEngine *TheScriptEngine WEAK_SINGLETON = nullptr;
SidesList *TheSidesList WEAK_SINGLETON = nullptr;
SpecialPowerStore *TheSpecialPowerStore WEAK_SINGLETON = nullptr;
TeamFactory *TheTeamFactory WEAK_SINGLETON = nullptr;
TerrainLogic *TheTerrainLogic WEAK_SINGLETON = nullptr;
TerrainRoadCollection *TheTerrainRoads WEAK_SINGLETON = nullptr;
TerrainTypeCollection *TheTerrainTypes WEAK_SINGLETON = nullptr;
ThingFactory *TheThingFactory WEAK_SINGLETON = nullptr;
UpgradeCenter *TheUpgradeCenter WEAK_SINGLETON = nullptr;
VictoryConditionsInterface *TheVictoryConditions WEAK_SINGLETON = nullptr;
View *TheTacticalView WEAK_SINGLETON = nullptr;
WeaponStore *TheWeaponStore WEAK_SINGLETON = nullptr;
GameWindowManager *TheWindowManager WEAK_SINGLETON = nullptr;
#ifdef TheWritableGlobalData
#undef TheWritableGlobalData
#endif
GlobalData *TheWritableGlobalData WEAK_SINGLETON = nullptr;

#undef WEAK_SINGLETON

namespace {

class LifetimeGameResultsQueue final : public GameResultsInterface
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}

	void startThreads() override { m_threads_running = true; }
	void endThreads() override
	{
		m_threads_running = false;
		++m_end_threads_count;
	}
	Bool areThreadsRunning() override { return m_threads_running ? TRUE : FALSE; }

	void addRequest(const GameResultsRequest &) override {}
	Bool getRequest(GameResultsRequest &) override { return FALSE; }
	void addResponse(const GameResultsResponse &) override {}
	Bool getResponse(GameResultsResponse &) override { return FALSE; }
	Bool areGameResultsBeingSent() override { return FALSE; }

	int endThreadsCount() const { return m_end_threads_count; }

private:
	bool m_threads_running = false;
	int m_end_threads_count = 0;
};

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

	LifetimeGameResultsQueue game_results_queue;
	TheGameResultsQueue = &game_results_queue;
	TheSubsystemList = MSGNEW("GameEngineSubsystem") SubsystemInterfaceList;

	Win32GameEngine *engine = MSGNEW("GameEngine") Win32GameEngine;
	if (!expect(engine != nullptr, "original Win32GameEngine construction should succeed")) {
		return 1;
	}
	TheGameEngine = engine;
	if (!expect(TheGameEngine == engine,
			"constructor smoke should claim owned global TheGameEngine before init")) {
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
			"original GameEngine constructor should initialize inactive focus state")) {
		return 1;
	}
	if (!expect(engine->getQuitting() == FALSE,
			"original GameEngine constructor should initialize quitting false")) {
		return 1;
	}
	if (!expect(engine->getFramesPerSecondLimit() == 0,
			"original GameEngine constructor should initialize max FPS to zero")) {
		return 1;
	}

	engine->setIsActive(TRUE);
	engine->setQuitting(TRUE);
	engine->setFramesPerSecondLimit(45);
	if (!expect(engine->isActive() == TRUE
			&& engine->getQuitting() == TRUE
			&& engine->getFramesPerSecondLimit() == 45,
			"inherited original GameEngine state setters should round-trip")) {
		return 1;
	}

	delete engine;
	TheGameEngine = nullptr;
	const UINT after_destruct = GetErrorMode();
	SetErrorMode(previous_error_mode);

	if (!expect(after_destruct == 0x0040,
			"Win32GameEngine destructor should restore the previous error mode")) {
		return 1;
	}
	if (!expect(game_results_queue.endThreadsCount() == 1,
			"original GameEngine destructor should call TheGameResultsQueue->endThreads")) {
		return 1;
	}
	if (!expect(TheSubsystemList == nullptr,
			"original GameEngine destructor should delete and clear TheSubsystemList")) {
		return 1;
	}
	if (!expect(TheGameEngine == nullptr,
			"constructor smoke should release global TheGameEngine after teardown")) {
		return 1;
	}

	TheGameResultsQueue = nullptr;

	std::cout
		<< "{\"ok\":true,"
		<< "\"source\":\"GeneralsMD/Code/GameEngine/Source/Common/GameEngine.cpp\","
		<< "\"win32Source\":\"GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp\","
		<< "\"supportSources\":["
		<< "\"GeneralsMD/Code/GameEngine/Source/Common/System/SubsystemInterface.cpp\","
		<< "\"GeneralsMD/Code/GameEngine/Source/GameClient/Drawable.cpp\","
		<< "\"GeneralsMD/Code/GameEngine/Source/Common/RTS/Science.cpp\","
		<< "\"GeneralsMD/Code/GameEngine/Source/GameLogic/System/RankInfo.cpp\"],"
		<< "\"path\":\"original-gameengine-lifetime\","
		<< "\"constructed\":true,"
		<< "\"destructed\":true,"
		<< "\"fullOriginalGameEngineCppLinked\":true,"
		<< "\"globalTheGameEngineOwned\":true,"
		<< "\"globalTheGameEngineCleared\":true,"
		<< "\"initAttempted\":false,"
		<< "\"gameResultsEndThreads\":" << game_results_queue.endThreadsCount() << ","
		<< "\"nextRequired\":\"original GameEngine.cpp init ownership before createAudioManager\"}"
		<< "\n";
	return 0;
}
