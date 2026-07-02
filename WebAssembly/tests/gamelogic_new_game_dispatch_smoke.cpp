#include <iostream>
#include <string>

#define INSTANTIATE_WELL_KNOWN_KEYS
#include "Common/WellKnownKeys.h"
#undef INSTANTIATE_WELL_KNOWN_KEYS

#include "Common/ArchiveFileSystem.h"
#include "Common/FileSystem.h"
#include "Common/FunctionLexicon.h"
#include "Common/GameEngine.h"
#include "Common/GameState.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/MapObject.h"
#include "Common/MessageStream.h"
#include "Common/NameKeyGenerator.h"
#include "Common/PlayerList.h"
#include "GameClient/Display.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/HeaderTemplate.h"
#include "GameClient/Image.h"
#include "GameClient/Shell.h"
#include "GameClient/Snow.h"
#include "GameClient/Water.h"
#include "GameClient/WindowLayout.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/RankInfo.h"
#include "GameLogic/ScriptEngine.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

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

GameEngine *TheGameEngine = nullptr;
GameSpyInfoInterface *TheGameSpyInfo = nullptr;
IMEManagerInterface *TheIMEManager = nullptr;

namespace {

int g_blank_layout_creates = 0;
int g_layout_shutdowns = 0;
AsciiString g_last_layout_name;
AsciiString g_blank_layout_archive_path;
Bool g_blank_window_archive_loaded = FALSE;
Bool g_blank_window_file_exists = FALSE;
Bool g_seed_blank_window_loaded_from_archive = FALSE;
Bool g_prepare_blank_window_loaded_from_archive = FALSE;
Bool g_seed_blank_window_root_ready = FALSE;
Bool g_prepare_blank_window_root_ready = FALSE;

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

const char *jsonBool(Bool value)
{
	return value ? "true" : "false";
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
		WindowLayout *layout = GameWindowManager::winCreateLayout(filename);
		if (filename.compareNoCase("Menus/BlankWindow.wnd") == 0 && layout != nullptr) {
			++g_blank_layout_creates;
			if (g_blank_layout_creates == 1) {
				g_seed_blank_window_loaded_from_archive = TRUE;
				g_seed_blank_window_root_ready =
					layout->getFirstWindow() != nullptr &&
					layout->getFirstWindow()->winGetWindowId() ==
						TheNameKeyGenerator->nameToKey(AsciiString("BlankWindow.wnd:BlankWindow"));
			} else if (g_blank_layout_creates == 2) {
				g_prepare_blank_window_loaded_from_archive = TRUE;
				g_prepare_blank_window_root_ready =
					layout->getFirstWindow() != nullptr &&
					layout->getFirstWindow()->winGetWindowId() ==
						TheNameKeyGenerator->nameToKey(AsciiString("BlankWindow.wnd:BlankWindow"));
			}
		}
		return layout;
	}
};

} // namespace

ImageCollection::ImageCollection()
{
}

ImageCollection::~ImageCollection()
{
}

const Image *ImageCollection::findImageByName(const AsciiString &)
{
	return nullptr;
}

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

void GameSpyCloseAllOverlays()
{
}

int main()
{
	const char *window_archive_path = "artifacts/real-assets/Window.big";
	AsciiString archive_directory("artifacts/real-assets/");
	AsciiString archive_mask("Window.big");

	GlobalData global_data;
	global_data.m_framesPerSecondLimit = 30;
	global_data.m_mapName = "Maps\\Smoke\\Before.map";
	global_data.m_pendingFile = "Maps\\Smoke\\Skirmish.map";
	TheWritableGlobalData = &global_data;
	if (!expect(TheGlobalData == &global_data,
			"original GlobalData macro should read from TheWritableGlobalData")) {
		return 1;
	}

	SmokeGameEngine game_engine;
	TheGameEngine = &game_engine;

	SmokeDisplay display;
	TheDisplay = &display;
	display.setWidth(800);
	display.setHeight(600);

	NameKeyGenerator name_key_generator;
	TheNameKeyGenerator = &name_key_generator;
	name_key_generator.init();

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;
	g_blank_layout_archive_path = window_archive_path;
	g_blank_window_archive_loaded =
		archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
	if (!expect(g_blank_window_archive_loaded,
			"Win32BIGFileSystem should load base Window.big for BlankWindow.wnd")) {
		return 1;
	}
	g_blank_window_file_exists =
		file_system.doesFileExist("Window\\Menus\\BlankWindow.wnd");
	if (!expect(g_blank_window_file_exists,
			"base Window.big should expose Window\\Menus\\BlankWindow.wnd")) {
		return 1;
	}

	FunctionLexicon function_lexicon;
	TheFunctionLexicon = &function_lexicon;

	ImageCollection image_collection;
	TheMappedImageCollection = &image_collection;

	HeaderTemplateManager header_template_manager;
	TheHeaderTemplateManager = &header_template_manager;

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

	ScriptEngine *script_engine = new ScriptEngine;
	TheScriptEngine = script_engine;
	if (!expect(script_engine->getGlobalDifficulty() == DIFFICULTY_NORMAL,
			"original ScriptEngine constructor should initialize normal difficulty")) {
		return 1;
	}

	Shell *shell = new Shell;
	TheShell = shell;
	shell->push("Menus/BlankWindow.wnd");
	WindowLayout *seed_layout = shell->top();
	GameWindow *seed_root = seed_layout != nullptr ? seed_layout->getFirstWindow() : nullptr;
	if (!expect(shell->isShellActive(),
			"original Shell should start active before MSG_NEW_GAME hides it")) {
		return 1;
	}
	if (!expect(shell->getScreenCount() == 1,
			"original Shell::push should own the seeded BlankWindow layout")) {
		return 1;
	}
	if (!expect(seed_layout != nullptr
			&& seed_layout->getFilename().compareNoCase("Menus/BlankWindow.wnd") == 0
			&& seed_root != nullptr
			&& g_seed_blank_window_loaded_from_archive
			&& g_seed_blank_window_root_ready,
			"original Shell::push should load BlankWindow.wnd from base Window.big")) {
		return 1;
	}
	Int seed_x = -1;
	Int seed_y = -1;
	Int seed_width = -1;
	Int seed_height = -1;
	seed_root->winGetScreenPosition(&seed_x, &seed_y);
	seed_root->winGetSize(&seed_width, &seed_height);
	if (!expect(seed_x == 0 && seed_y == 0 && seed_width == 800 && seed_height == 600,
			"archive-backed BlankWindow root should preserve base layout geometry")) {
		return 1;
	}

	RankInfoStore rank_info_store;
	TheRankInfoStore = &rank_info_store;

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

	PlayerList player_list;
	ThePlayerList = &player_list;

	logic->processCommandList(TheCommandList);

	bool ok = true;
	ok = expect(player_list.getNthPlayer(0) != nullptr
			&& player_list.getNthPlayer(0) == player_list.getNeutralPlayer()
			&& player_list.getPlayerCount() == 1,
		"original PlayerList should own the neutral player used by MSG_NEW_GAME") && ok;
	ok = expect(script_engine->getGlobalDifficulty() == DIFFICULTY_HARD,
		"prepareNewGame should forward MSG_NEW_GAME difficulty to original ScriptEngine") && ok;
	ok = expect(g_blank_layout_creates == 2
			&& g_last_layout_name.compareNoCase("Menus/BlankWindow.wnd") == 0,
		"prepareNewGame should request the BlankWindow background after the Shell seed layout") && ok;
	ok = expect(g_prepare_blank_window_loaded_from_archive &&
			g_prepare_blank_window_root_ready,
		"prepareNewGame should load the BlankWindow background from base Window.big") && ok;
	ok = expect(logic->isInSkirmishGame(),
		"prepareNewGame should switch GameLogic to GAME_SKIRMISH") && ok;
	ok = expect(global_data.m_mapName == "Maps\\Smoke\\Skirmish.map"
			&& global_data.m_pendingFile.isEmpty(),
		"prepareNewGame should promote pending map into GlobalData mapName") && ok;
	ok = expect(shell->isShellActive() == FALSE
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
		<< "\"source\":\"GeneralsMD original GlobalData.cpp/FunctionLexicon.cpp/PlayerList.cpp/Player.cpp/GameLogic.cpp/GameLogicDispatch.cpp/GameState.cpp/ScriptEngine.cpp/Scripts.cpp/Shell.cpp/GameWindowManagerScript.cpp/HeaderTemplate.cpp\","
		<< "\"message\":\"MSG_NEW_GAME\","
		<< "\"playerLookupIndex\":0,"
		<< "\"playerCount\":" << player_list.getPlayerCount() << ","
		<< "\"neutralPlayerOwned\":true,"
		<< "\"difficulty\":" << script_engine->getGlobalDifficulty() << ","
		<< "\"blankLayoutCreates\":" << g_blank_layout_creates << ","
		<< "\"blankLayoutArchive\":\"" << jsonEscape(g_blank_layout_archive_path.str()) << "\","
		<< "\"blankWindowArchiveLoaded\":" << jsonBool(g_blank_window_archive_loaded) << ","
		<< "\"blankWindowFileExists\":" << jsonBool(g_blank_window_file_exists) << ","
		<< "\"seedBlankWindowArchiveLayout\":" << jsonBool(g_seed_blank_window_loaded_from_archive) << ","
		<< "\"prepareBlankWindowArchiveLayout\":" << jsonBool(g_prepare_blank_window_loaded_from_archive) << ","
		<< "\"blankWindowRoot\":\"BlankWindow.wnd:BlankWindow\","
		<< "\"blankWindowRootGeometry\":{\"x\":" << seed_x
		<< ",\"y\":" << seed_y
		<< ",\"width\":" << seed_width
		<< ",\"height\":" << seed_height << "},"
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
		<< "\"deferred terrain/player/script load after archive-backed BlankWindow\"],"
		<< "\"originalOwners\":[\"GlobalData TheWritableGlobalData\",\"PlayerList::getNthPlayer neutral player\",\"ScriptEngine::setGlobalDifficulty\",\"HeaderTemplateManager empty template lookup\",\"Shell::push seeded BlankWindow\",\"GameWindowManager::winCreateLayout BlankWindow archive parse\",\"Shell::hideShell\"],"
		<< "\"nextRequired\":\"continue deferred startNewGame into terrain/player/script load\"}"
		<< "\n";

	return 0;
}
