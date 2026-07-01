#include <iostream>
#include <string>

#define INSTANTIATE_WELL_KNOWN_KEYS
#include "Common/WellKnownKeys.h"
#undef INSTANTIATE_WELL_KNOWN_KEYS

#include "Common/GameEngine.h"
#include "Common/GameState.h"
#include "Common/GlobalData.h"
#include "Common/MapObject.h"
#include "Common/MessageStream.h"
#include "Common/PlayerList.h"
#include "GameClient/Display.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/Shell.h"
#include "GameClient/Snow.h"
#include "GameClient/Water.h"
#include "GameClient/WindowLayout.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/ScriptEngine.h"

// Storage-only owners for globals referenced by unentered original
// GameLogic/GameState sections. Real linked owners override these weak symbols.
#define WEAK_SINGLETON __attribute__((weak))

class AI;
class ActionManager;
class Anim2DCollection;
class ArchiveFileSystem;
class ArmorStore;
class AudioManager;
class BuildAssistant;
class CDManagerInterface;
class CampaignManager;
class CaveSystem;
class ControlBar;
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
class GameInfo;
class GameLODManager;
class GameSpyInfoInterface;
class GameSpyStagingRoom;
class GameStateMap;
class GameTextInterface;
class GhostObjectManager;
class GlobalLanguage;
class IMEManagerInterface;
class ImageCollection;
class InGameUI;
class LanguageFilter;
class LANAPI;
class LocalFileSystem;
class LocomotorStore;
class MapCache;
class MemoryPoolFactory;
class MetaMap;
class ModuleFactory;
class MultiplayerSettings;
class NameKeyGenerator;
class NetworkInterface;
class ObjectCreationListStore;
class PartitionManager;
class ParticleSystemManager;
class PlayerTemplateStore;
class Radar;
class RankInfoStore;
class RecorderClass;
class ScienceStore;
class ScriptActionsInterface;
class ScriptConditionsInterface;
class SidesList;
class SkirmishGameInfo;
class SpecialPowerStore;
class StatsCollector;
class TeamFactory;
class TerrainLogic;
class TerrainRoadCollection;
class TerrainTypeCollection;
class TerrainVisual;
class ThingFactory;
class UpgradeCenter;
class VictoryConditionsInterface;
class View;
class WeaponStore;

AI *TheAI WEAK_SINGLETON = nullptr;
ActionManager *TheActionManager WEAK_SINGLETON = nullptr;
Anim2DCollection *TheAnim2DCollection WEAK_SINGLETON = nullptr;
ArchiveFileSystem *TheArchiveFileSystem WEAK_SINGLETON = nullptr;
ArmorStore *TheArmorStore WEAK_SINGLETON = nullptr;
AudioManager *TheAudio WEAK_SINGLETON = nullptr;
BuildAssistant *TheBuildAssistant WEAK_SINGLETON = nullptr;
CDManagerInterface *TheCDManager WEAK_SINGLETON = nullptr;
CampaignManager *TheCampaignManager WEAK_SINGLETON = nullptr;
CaveSystem *TheCaveSystem WEAK_SINGLETON = nullptr;
ControlBar *TheControlBar WEAK_SINGLETON = nullptr;
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
GameInfo *TheGameInfo WEAK_SINGLETON = nullptr;
GameLODManager *TheGameLODManager WEAK_SINGLETON = nullptr;
GameSpyStagingRoom *TheGameSpyGame WEAK_SINGLETON = nullptr;
GameStateMap *TheGameStateMap WEAK_SINGLETON = nullptr;
GameTextInterface *TheGameText WEAK_SINGLETON = nullptr;
GhostObjectManager *TheGhostObjectManager WEAK_SINGLETON = nullptr;
GlobalLanguage *TheGlobalLanguageData WEAK_SINGLETON = nullptr;
ImageCollection *TheMappedImageCollection WEAK_SINGLETON = nullptr;
InGameUI *TheInGameUI WEAK_SINGLETON = nullptr;
LanguageFilter *TheLanguageFilter WEAK_SINGLETON = nullptr;
LANAPI *TheLAN WEAK_SINGLETON = nullptr;
LocalFileSystem *TheLocalFileSystem WEAK_SINGLETON = nullptr;
LocomotorStore *TheLocomotorStore WEAK_SINGLETON = nullptr;
MapCache *TheMapCache WEAK_SINGLETON = nullptr;
MemoryPoolFactory *TheMemoryPoolFactory WEAK_SINGLETON = nullptr;
MetaMap *TheMetaMap WEAK_SINGLETON = nullptr;
ModuleFactory *TheModuleFactory WEAK_SINGLETON = nullptr;
MultiplayerSettings *TheMultiplayerSettings WEAK_SINGLETON = nullptr;
NameKeyGenerator *TheNameKeyGenerator WEAK_SINGLETON = nullptr;
NetworkInterface *TheNetwork WEAK_SINGLETON = nullptr;
ObjectCreationListStore *TheObjectCreationListStore WEAK_SINGLETON = nullptr;
PartitionManager *ThePartitionManager WEAK_SINGLETON = nullptr;
ParticleSystemManager *TheParticleSystemManager WEAK_SINGLETON = nullptr;
PlayerTemplateStore *ThePlayerTemplateStore WEAK_SINGLETON = nullptr;
Radar *TheRadar WEAK_SINGLETON = nullptr;
RankInfoStore *TheRankInfoStore WEAK_SINGLETON = nullptr;
RecorderClass *TheRecorder WEAK_SINGLETON = nullptr;
ScienceStore *TheScienceStore WEAK_SINGLETON = nullptr;
ScriptActionsInterface *TheScriptActions WEAK_SINGLETON = nullptr;
ScriptConditionsInterface *TheScriptConditions WEAK_SINGLETON = nullptr;
SidesList *TheSidesList WEAK_SINGLETON = nullptr;
SkirmishGameInfo *TheChallengeGameInfo WEAK_SINGLETON = nullptr;
SkirmishGameInfo *TheSkirmishGameInfo WEAK_SINGLETON = nullptr;
SpecialPowerStore *TheSpecialPowerStore WEAK_SINGLETON = nullptr;
StatsCollector *TheStatsCollector WEAK_SINGLETON = nullptr;
TeamFactory *TheTeamFactory WEAK_SINGLETON = nullptr;
TerrainLogic *TheTerrainLogic WEAK_SINGLETON = nullptr;
TerrainRoadCollection *TheTerrainRoads WEAK_SINGLETON = nullptr;
TerrainTypeCollection *TheTerrainTypes WEAK_SINGLETON = nullptr;
TerrainVisual *TheTerrainVisual WEAK_SINGLETON = nullptr;
ThingFactory *TheThingFactory WEAK_SINGLETON = nullptr;
UpgradeCenter *TheUpgradeCenter WEAK_SINGLETON = nullptr;
VictoryConditionsInterface *TheVictoryConditions WEAK_SINGLETON = nullptr;
View *TheTacticalView WEAK_SINGLETON = nullptr;
WeaponStore *TheWeaponStore WEAK_SINGLETON = nullptr;
Dict MapObject::TheWorldDict WEAK_SINGLETON;
OVERRIDE<WaterTransparencySetting> TheWaterTransparency WEAK_SINGLETON = nullptr;
OVERRIDE<WeatherSetting> TheWeatherSetting WEAK_SINGLETON = nullptr;

#undef WEAK_SINGLETON

GlobalData *TheGlobalData = nullptr;
GameEngine *TheGameEngine = nullptr;
ScriptEngine *TheScriptEngine = nullptr;
GameSpyInfoInterface *TheGameSpyInfo = nullptr;
IMEManagerInterface *TheIMEManager = nullptr;

namespace {

int g_last_script_difficulty = -1;
int g_player_lookup_index = -999;
int g_blank_layout_creates = 0;
int g_layout_shutdowns = 0;
AsciiString g_last_layout_name;

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::cerr << message << "\n";
		return false;
	}
	return true;
}

std::string jsonEscape(const char *value)
{
	std::string escaped;
	for (const char *cursor = value; cursor && *cursor; ++cursor) {
		if (*cursor == '\\' || *cursor == '"') {
			escaped.push_back('\\');
		}
		escaped.push_back(*cursor);
	}
	return escaped;
}

class SmokeGameEngine : public GameEngine
{
public:
	void init() override {}
	void init(int, char *[]) override {}
	void reset() override {}
	void update() override {}
	void execute() override {}
	void setFramesPerSecondLimit(Int fps) override { m_maxFPS = fps; }
	Int getFramesPerSecondLimit() override { return m_maxFPS; }
	void setQuitting(Bool quitting) override { m_quitting = quitting; }
	Bool getQuitting() override { return m_quitting; }
	Bool isMultiplayerSession() override { return FALSE; }
	void serviceWindowsOS() override {}
	Bool isActive() override { return m_isActive; }
	void setIsActive(Bool isActive) override { m_isActive = isActive; }

protected:
	LocalFileSystem *createLocalFileSystem() override { return nullptr; }
	ArchiveFileSystem *createArchiveFileSystem() override { return nullptr; }
	GameLogic *createGameLogic() override { return nullptr; }
	GameClient *createGameClient() override { return nullptr; }
	ModuleFactory *createModuleFactory() override { return nullptr; }
	ThingFactory *createThingFactory() override { return nullptr; }
	FunctionLexicon *createFunctionLexicon() override { return nullptr; }
	Radar *createRadar() override { return nullptr; }
	WebBrowser *createWebBrowser() override { return nullptr; }
	ParticleSystemManager *createParticleSystemManager() override { return nullptr; }
	AudioManager *createAudioManager() override { return nullptr; }
};

class SmokeDisplay : public Display
{
public:
	void doSmartAssetPurgeAndPreload(const char *) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpAssetUsage(const char *) override {}
#endif
	VideoBuffer *createVideoBuffer() override { return nullptr; }
	void setClipRegion(IRegion2D *) override {}
	Bool isClippingEnabled() override { return FALSE; }
	void enableClipping(Bool) override {}
	void setTimeOfDay(TimeOfDay) override {}
	void createLightPulse(const Coord3D *, const RGBColor *, Real, Real, UnsignedInt, UnsignedInt) override {}
	void drawLine(Int, Int, Int, Int, Real, UnsignedInt) override {}
	void drawLine(Int, Int, Int, Int, Real, UnsignedInt, UnsignedInt) override {}
	void drawOpenRect(Int, Int, Int, Int, Real, UnsignedInt) override {}
	void drawFillRect(Int, Int, Int, Int, UnsignedInt) override {}
	void drawRectClock(Int, Int, Int, Int, Int, UnsignedInt) override {}
	void drawRemainingRectClock(Int, Int, Int, Int, Int, UnsignedInt) override {}
	void drawImage(const Image *, Int, Int, Int, Int, Color, DrawImageMode) override {}
	void drawVideoBuffer(VideoBuffer *, Int, Int, Int, Int) override {}
	void clearShroud() override {}
	void setShroudLevel(Int, Int, CellShroudStatus) override {}
	void setBorderShroudLevel(UnsignedByte) override {}
#if defined(_DEBUG) || defined(_INTERNAL)
	void dumpModelAssets(const char *) override {}
#endif
	void preloadModelAssets(AsciiString) override {}
	void preloadTextureAssets(AsciiString) override {}
	void takeScreenShot() override {}
	void toggleMovieCapture() override {}
	void toggleLetterBox() override {}
	void enableLetterBox(Bool enable) override { m_letterBoxEnabled = enable; }
	Real getAverageFPS() override { return 0.0f; }
	Int getLastFrameDrawCalls() override { return 0; }
};

class SmokeGameWindow : public GameWindow
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(SmokeGameWindow, "SmokeGameWindow", 1, 1)

public:
	SmokeGameWindow() = default;
	void winDrawBorder() override {}
};

EMPTY_DTOR(SmokeGameWindow)

void SmokeNoDraw(GameWindow *, WinInstanceData *)
{
}

void SmokeLayoutShutdown(WindowLayout *, void *);

class SmokeGameWindowManager : public GameWindowManager
{
public:
	GameWindow *allocateNewWindow() override { return newInstance(SmokeGameWindow); }
	GameWinDrawFunc getPushButtonImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getPushButtonDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getCheckBoxImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getCheckBoxDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getRadioButtonImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getRadioButtonDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTabControlImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTabControlDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getListBoxImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getListBoxDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getComboBoxImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getComboBoxDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getHorizontalSliderImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getHorizontalSliderDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getVerticalSliderImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getVerticalSliderDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getProgressBarImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getProgressBarDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getStaticTextImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getStaticTextDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTextEntryImageDrawFunc() override { return SmokeNoDraw; }
	GameWinDrawFunc getTextEntryDrawFunc() override { return SmokeNoDraw; }
	GameFont *winFindFont(AsciiString, Int, Bool) override { return nullptr; }

	WindowLayout *winCreateLayout(AsciiString filename) override
	{
		g_last_layout_name = filename;
		if (filename.compareNoCase("Menus/BlankWindow.wnd") != 0) {
			return nullptr;
		}

		WindowLayout *layout = newInstance(WindowLayout);
		GameWindow *window = allocateNewWindow();
		if (layout == nullptr || window == nullptr) {
			return nullptr;
		}

		layout->addWindow(window);
		layout->setShutdown(SmokeLayoutShutdown);
		++g_blank_layout_creates;
		return layout;
	}
};

void SmokeLayoutShutdown(WindowLayout *, void *)
{
	++g_layout_shutdowns;
}

} // namespace

GameEngine::GameEngine() :
	m_maxFPS(DEFAULT_MAX_FPS),
	m_quitting(FALSE),
	m_isActive(TRUE)
{
}

GameEngine::~GameEngine()
{
}

void GameEngine::init()
{
}

void GameEngine::init(int, char *[])
{
}

void GameEngine::reset()
{
}

void GameEngine::update()
{
}

void GameEngine::execute()
{
}

void GameEngine::setFramesPerSecondLimit(Int fps)
{
	m_maxFPS = fps;
}

Int GameEngine::getFramesPerSecondLimit()
{
	return m_maxFPS;
}

Bool GameEngine::isMultiplayerSession()
{
	return FALSE;
}

FileSystem *GameEngine::createFileSystem()
{
	return nullptr;
}

MessageStream *GameEngine::createMessageStream()
{
	return nullptr;
}

extern "C" Player *__wrap__ZN10PlayerList12getNthPlayerEi(PlayerList *, Int i)
{
	g_player_lookup_index = i;
	return i == 0 ? reinterpret_cast<Player *>(1) : nullptr;
}

void ScriptEngine::setGlobalDifficulty(GameDifficulty difficulty)
{
	g_last_script_difficulty = difficulty;
}

void GameSpyCloseAllOverlays()
{
}

int main()
{
	GlobalData global_data;
	global_data.m_framesPerSecondLimit = 30;
	global_data.m_mapName = "Maps\\Smoke\\Before.map";
	global_data.m_pendingFile = "Maps\\Smoke\\Skirmish.map";
	global_data.setPath_UserData(AsciiString("UserData\\"));
	TheGlobalData = &global_data;

	SmokeGameEngine game_engine;
	TheGameEngine = &game_engine;

	SmokeDisplay display;
	TheDisplay = &display;
	display.setWidth(800);
	display.setHeight(600);

	GameState game_state;
	TheGameState = &game_state;

	SmokeGameWindowManager *window_manager = new SmokeGameWindowManager;
	TheWindowManager = window_manager;

	MessageStream message_stream;
	CommandList command_list;
	TheMessageStream = &message_stream;
	TheCommandList = &command_list;

	GameLogic *logic = new GameLogic;
	TheGameLogic = logic;

	Shell *shell = new Shell;
	TheShell = shell;
	shell->push("Menus/BlankWindow.wnd");
	if (!expect(shell->isShellActive(),
			"original Shell should start active before MSG_NEW_GAME hides it")) {
		return 1;
	}
	if (!expect(shell->getScreenCount() == 1,
			"original Shell::push should own the seeded BlankWindow layout")) {
		return 1;
	}

	GameMessage *message = TheMessageStream->appendMessage(GameMessage::MSG_NEW_GAME);
	if (!expect(message != nullptr, "MessageStream should allocate MSG_NEW_GAME")) {
		return 1;
	}
	message->friend_setPlayerIndex(0);
	message->appendIntegerArgument(GAME_SKIRMISH);
	message->appendIntegerArgument(DIFFICULTY_HARD);
	message->appendIntegerArgument(7);
	message->appendIntegerArgument(55);

	TheMessageStream->propagateMessages();
	if (!expect(TheMessageStream->getFirstMessage() == nullptr,
			"MessageStream should drain into CommandList")) {
		return 1;
	}
	if (!expect(TheCommandList->getFirstMessage() == message,
			"CommandList should own the propagated MSG_NEW_GAME")) {
		return 1;
	}

	TheScriptEngine = reinterpret_cast<ScriptEngine *>(1);
	ThePlayerList = reinterpret_cast<PlayerList *>(1);

	logic->processCommandList(TheCommandList);

	bool ok = true;
	ok = expect(g_player_lookup_index == 0,
		"logicMessageDispatcher should ask PlayerList for the message player") && ok;
	ok = expect(g_last_script_difficulty == DIFFICULTY_HARD,
		"prepareNewGame should forward MSG_NEW_GAME difficulty to ScriptEngine") && ok;
	ok = expect(g_blank_layout_creates == 2
			&& g_last_layout_name.compareNoCase("Menus/BlankWindow.wnd") == 0,
		"prepareNewGame should request the BlankWindow background after the Shell seed layout") && ok;
	ok = expect(logic->isInSkirmishGame(),
		"prepareNewGame should switch GameLogic to GAME_SKIRMISH") && ok;
	ok = expect(global_data.m_mapName == "Maps\\Smoke\\Skirmish.map"
			&& global_data.m_pendingFile.isEmpty(),
		"prepareNewGame should promote pending map into GlobalData mapName") && ok;
	ok = expect(shell->isShellActive() == FALSE && g_layout_shutdowns == 1
			&& shell->getScreenCount() == 1,
		"prepareNewGame should drive original Shell::hideShell on the active shell layout") && ok;
	ok = expect(game_engine.getFramesPerSecondLimit() == 55 && global_data.m_useFpsLimit == TRUE,
		"MSG_NEW_GAME should apply the game-speed FPS limit") && ok;
	ok = expect(game_state.getPristineMapName() == "Maps\\Smoke\\Skirmish.map",
		"startNewGame(FALSE) should record the pristine map name") && ok;
	ok = expect(logic->isLoadingMap(),
		"first startNewGame(FALSE) call should enter loading-map state") && ok;
	ok = expect(logic->getRankPointsToAddAtGameStart() == 7,
		"prepareNewGame should preserve rank points for game start") && ok;

	TheCommandList->reset();

	if (!ok) {
		return 1;
	}

	std::cout
		<< "{\"ok\":true,"
		<< "\"path\":\"gamelogic-new-game-dispatch-runtime\","
		<< "\"source\":\"GeneralsMD original GameLogic.cpp/GameLogicDispatch.cpp\","
		<< "\"message\":\"MSG_NEW_GAME\","
		<< "\"playerLookupIndex\":" << g_player_lookup_index << ","
		<< "\"difficulty\":" << g_last_script_difficulty << ","
		<< "\"blankLayoutCreates\":" << g_blank_layout_creates << ","
		<< "\"shellActive\":false,"
		<< "\"shellScreenCount\":" << shell->getScreenCount() << ","
		<< "\"shellLayoutShutdowns\":" << g_layout_shutdowns << ","
		<< "\"fpsLimit\":" << game_engine.getFramesPerSecondLimit() << ","
		<< "\"useFpsLimit\":true,"
		<< "\"gameMode\":\"GAME_SKIRMISH\","
		<< "\"loadingMap\":true,"
		<< "\"rankPoints\":7,"
		<< "\"mapName\":\"" << jsonEscape(global_data.m_mapName.str()) << "\","
		<< "\"pristineMapName\":\"" << jsonEscape(game_state.getPristineMapName().str()) << "\","
		<< "\"runtimeBoundaries\":["
		<< "\"focused ScriptEngine::setGlobalDifficulty\","
		<< "\"focused linker wrap for PlayerList::getNthPlayer before MSG_NEW_GAME switch\","
		<< "\"shim GlobalData bridge\"],"
		<< "\"originalOwners\":[\"Shell::push seeded BlankWindow\",\"Shell::hideShell\"],"
		<< "\"nextRequired\":\"replace focused PlayerList/ScriptEngine and shim GlobalData before deferred terrain load\"}"
		<< "\n";

	return 0;
}
