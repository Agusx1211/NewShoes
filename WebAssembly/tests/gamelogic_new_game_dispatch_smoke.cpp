#include <iostream>
#include <string>

#include "Common/WellKnownKeys.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/FileSystem.h"
#include "Common/FunctionLexicon.h"
#include "Common/GameEngine.h"
#include "Common/GameState.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/LocalFileSystem.h"
#include "Common/MapObject.h"
#include "Common/MapReaderWriterInfo.h"
#include "Common/MessageStream.h"
#include "Common/MultiplayerSettings.h"
#include "Common/NameKeyGenerator.h"
#include "Common/Player.h"
#include "Common/PlayerList.h"
#include "Common/PlayerTemplate.h"
#include "Common/Radar.h"
#include "Common/Science.h"
#include "Common/Team.h"
#include "Common/TerrainTypes.h"
#include "Common/ThingFactory.h"
#include "Common/ThingTemplate.h"
#include "Common/UserPreferences.h"
#include "GameClient/Display.h"
#include "GameClient/GameClient.h"
#include "GameClient/GameText.h"
#include "GameClient/GameWindow.h"
#include "GameClient/GameWindowManager.h"
#include "GameClient/HeaderTemplate.h"
#include "GameClient/Image.h"
#include "GameClient/MapUtil.h"
#include "GameClient/Shell.h"
#include "GameClient/Snow.h"
#include "GameClient/TerrainRoads.h"
#include "GameClient/TerrainVisual.h"
#include "GameClient/Water.h"
#include "GameClient/WindowLayout.h"
#include "GameLogic/AI.h"
#include "GameLogic/AIPathfind.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/GhostObject.h"
#include "GameLogic/PartitionManager.h"
#include "GameLogic/RankInfo.h"
#include "GameLogic/ScriptEngine.h"
#include "GameLogic/Scripts.h"
#include "GameLogic/SidesList.h"
#include "GameLogic/VictoryConditions.h"
#include "W3DDevice/GameClient/W3DAssetManager.h"
#include "W3DDevice/GameClient/BaseHeightMap.h"
#include "W3DDevice/GameClient/W3DBridgeBuffer.h"
#include "W3DDevice/GameClient/WorldHeightMap.h"
#include "W3DDevice/GameLogic/W3DTerrainLogic.h"
#include "W3DDevice/GameClient/W3DRoadBuffer.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "WW3D2/WW3D.h"
#include "wasm_d3d8_shim.h"

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
class TerrainVisual;
class ThingFactory;
class UpgradeCenter;
class VictoryConditionsInterface;
class View;
class W3DShadowManager;
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
TerrainVisual *TheTerrainVisual WEAK_SINGLETON = nullptr;
ThingFactory *TheThingFactory WEAK_SINGLETON = nullptr;
UpgradeCenter *TheUpgradeCenter WEAK_SINGLETON = nullptr;
VictoryConditionsInterface *TheVictoryConditions WEAK_SINGLETON = nullptr;
View *TheTacticalView WEAK_SINGLETON = nullptr;
W3DShadowManager *TheW3DShadowManager WEAK_SINGLETON = nullptr;
WeaponStore *TheWeaponStore WEAK_SINGLETON = nullptr;
Dict MapObject::TheWorldDict WEAK_SINGLETON;
OVERRIDE<WaterTransparencySetting> TheWaterTransparency WEAK_SINGLETON = nullptr;
OVERRIDE<WeatherSetting> TheWeatherSetting WEAK_SINGLETON = nullptr;

#undef WEAK_SINGLETON

GameEngine *TheGameEngine = nullptr;
GameSpyInfoInterface *TheGameSpyInfo = nullptr;
IMEManagerInterface *TheIMEManager = nullptr;

GameClient::GameClient()
{
	for (Int index = 0; index < MAX_CLIENT_TRANSLATORS; ++index) {
		m_translators[index] = TRANSLATOR_ID_INVALID;
	}
	m_numTranslators = 0;
	m_commandTranslator = nullptr;
	m_frame = 0;
	m_drawableList = nullptr;
	m_drawableVector.clear();
	m_nextDrawableID = static_cast<DrawableID>(1);
	m_renderedObjectCount = 0;
}

GameClient::~GameClient()
{
}

void GameClient::init()
{
}

void GameClient::update()
{
}

void GameClient::reset()
{
}

DrawableID GameClient::allocDrawableID()
{
	DrawableID ret = m_nextDrawableID;
	m_nextDrawableID = static_cast<DrawableID>(static_cast<UnsignedInt>(m_nextDrawableID) + 1);
	return ret;
}

void GameClient::registerDrawable(Drawable *)
{
}

void GameClient::addDrawableToLookupTable(Drawable *)
{
}

void GameClient::removeDrawableFromLookupTable(Drawable *)
{
}

GameMessage::Type GameClient::evaluateContextCommand(
	Drawable *,
	const Coord3D *,
	CommandTranslator::CommandEvaluateType)
{
	return GameMessage::MSG_INVALID;
}

void GameClient::removeFromRayEffects(Drawable *)
{
}

void GameClient::getRayEffectData(Drawable *, RayEffectData *)
{
}

Bool GameClient::loadMap(AsciiString)
{
	return FALSE;
}

void GameClient::unloadMap(AsciiString)
{
}

void GameClient::iterateDrawablesInRegion(Region3D *, GameClientFuncPtr, void *)
{
}

void GameClient::destroyDrawable(Drawable *)
{
}

void GameClient::setTimeOfDay(TimeOfDay)
{
}

void GameClient::selectDrawablesInGroup(Int)
{
}

void GameClient::assignSelectedDrawablesToGroup(Int)
{
}

void GameClient::releaseShadows()
{
}

void GameClient::allocateShadows()
{
}

void GameClient::preloadAssets(TimeOfDay)
{
}

void GameClient::crc(Xfer *)
{
}

void GameClient::xfer(Xfer *)
{
}

void GameClient::loadPostProcess()
{
}

namespace {

int g_blank_layout_creates = 0;
int g_layout_shutdowns = 0;
AsciiString g_last_layout_name;
AsciiString g_blank_layout_archive_path;
AsciiString g_map_archive_path;
AsciiString g_zh_ini_archive_path;
AsciiString g_base_ini_archive_path;
Bool g_blank_window_archive_loaded = FALSE;
Bool g_blank_window_file_exists = FALSE;
Bool g_map_archive_loaded = FALSE;
Bool g_map_file_exists = FALSE;
Bool g_zh_ini_archive_loaded = FALSE;
Bool g_base_ini_archive_loaded = FALSE;
Bool g_player_template_default_ini_file_exists = FALSE;
Bool g_player_template_ini_file_exists = FALSE;
Bool g_game_data_default_ini_file_exists = FALSE;
Bool g_game_data_ini_file_exists = FALSE;
Bool g_multiplayer_default_ini_file_exists = FALSE;
Bool g_multiplayer_ini_file_exists = FALSE;
Bool g_ai_data_default_ini_file_exists = FALSE;
Bool g_ai_data_ini_file_exists = FALSE;
Bool g_seed_blank_window_loaded_from_archive = FALSE;
Bool g_prepare_blank_window_loaded_from_archive = FALSE;
Bool g_seed_blank_window_root_ready = FALSE;
Bool g_prepare_blank_window_root_ready = FALSE;
Int g_radar_window_lookup_count = 0;
Bool g_radar_left_hud_window_installed = FALSE;
Int g_display_clear_shroud_calls = 0;
Int g_display_set_shroud_calls = 0;
Int g_display_shrouded_set_calls = 0;
Int g_display_fogged_set_calls = 0;
Int g_display_clear_set_calls = 0;
Int g_radar_clear_shroud_calls = 0;
Int g_radar_set_shroud_calls = 0;
Int g_radar_shrouded_set_calls = 0;
Int g_radar_fogged_set_calls = 0;
Int g_radar_clear_set_calls = 0;
Int g_victory_cache_player_ptrs_calls = 0;

void recordShroudSet(
	CellShroudStatus status,
	Int &set_calls,
	Int &shrouded_set_calls,
	Int &fogged_set_calls,
	Int &clear_set_calls)
{
	++set_calls;
	if (status == CELLSHROUD_SHROUDED) {
		++shrouded_set_calls;
	} else if (status == CELLSHROUD_FOGGED) {
		++fogged_set_calls;
	} else if (status == CELLSHROUD_CLEAR) {
		++clear_set_calls;
	}
}

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

bool nearlyEqual(Real lhs, Real rhs, Real tolerance)
{
	Real delta = lhs - rhs;
	if (delta < 0.0f) {
		delta = -delta;
	}
	return delta <= tolerance;
}

Int countMapObjects(Bool waypointsOnly)
{
	Int count = 0;
	for (MapObject *map_object = MapObject::getFirstMapObject();
			map_object != nullptr;
			map_object = map_object->getNext()) {
		if (!waypointsOnly || map_object->isWaypoint()) {
			++count;
		}
	}
	return count;
}

Int countMapObjectsWithFlag(Int flag)
{
	Int count = 0;
	for (MapObject *map_object = MapObject::getFirstMapObject();
			map_object != nullptr;
			map_object = map_object->getNext()) {
		if (map_object->getFlag(flag)) {
			++count;
		}
	}
	return count;
}

Int countLogicBridges(const TerrainLogic &terrain_logic)
{
	Int count = 0;
	for (Bridge *bridge = terrain_logic.getFirstBridge();
			bridge != nullptr;
			bridge = bridge->getNext()) {
		++count;
	}
	return count;
}

struct BridgeLikeMapObjectScan
{
	Int scanned = 0;
	Int skippedSpecialTerrainObjects = 0;
	Int withoutThingTemplate = 0;
	Int nonBridgeLikeTemplates = 0;
	Int bridgeTemplates = 0;
	Int walkOnWallTemplates = 0;
	Int bridgeLikeTemplates = 0;
};

BridgeLikeMapObjectScan scanBridgeLikeMapObjectsForStartup()
{
	BridgeLikeMapObjectScan scan;
	for (MapObject *map_object = MapObject::getFirstMapObject();
			map_object != nullptr;
			map_object = map_object->getNext()) {
		++scan.scanned;
		if (map_object->getFlag(FLAG_BRIDGE_FLAGS) || map_object->getFlag(FLAG_ROAD_FLAGS)) {
			++scan.skippedSpecialTerrainObjects;
			continue;
		}

		const ThingTemplate *thing_template = map_object->getThingTemplate();
		if (thing_template == nullptr) {
			++scan.withoutThingTemplate;
			continue;
		}

		Bool is_bridge = thing_template->isBridge();
		Bool is_walk_on_wall = thing_template->isKindOf(KINDOF_WALK_ON_TOP_OF_WALL);
		if (is_bridge) {
			++scan.bridgeTemplates;
		}
		if (is_walk_on_wall) {
			++scan.walkOnWallTemplates;
		}
		if (!is_bridge && !is_walk_on_wall) {
			++scan.nonBridgeLikeTemplates;
			continue;
		}

		++scan.bridgeLikeTemplates;
	}
	return scan;
}

Int countScriptsInList(ScriptList *script_list)
{
	if (script_list == nullptr) {
		return 0;
	}

	Int count = 0;
	for (Script *script = script_list->getScript();
			script != nullptr;
			script = script->getNext()) {
		++count;
	}
	for (ScriptGroup *group = script_list->getScriptGroup();
			group != nullptr;
			group = group->getNext()) {
		for (Script *script = group->getScript();
				script != nullptr;
				script = script->getNext()) {
			++count;
		}
	}
	return count;
}

Int countSideScripts(SidesList &sides)
{
	Int count = 0;
	for (Int index = 0; index < sides.getNumSides(); ++index) {
		count += countScriptsInList(sides.getSideInfo(index)->getScriptList());
	}
	return count;
}

void seedPlayerTemplateAliasNameKeys()
{
	(void)NAMEKEY("FactionCivilian");
	(void)NAMEKEY("FactionAmerica");
	(void)NAMEKEY("FactionAmericaChooseAGeneral");
	(void)NAMEKEY("FactionAmericaTankCommand");
	(void)NAMEKEY("FactionAmericaSpecialForces");
	(void)NAMEKEY("FactionAmericaAirForce");
	(void)NAMEKEY("FactionChina");
	(void)NAMEKEY("FactionChinaChooseAGeneral");
	(void)NAMEKEY("FactionChinaRedArmy");
	(void)NAMEKEY("FactionChinaSpecialWeapons");
	(void)NAMEKEY("FactionChinaSecretPolice");
	(void)NAMEKEY("FactionGLA");
	(void)NAMEKEY("FactionGLAChooseAGeneral");
	(void)NAMEKEY("FactionGLATerrorCell");
	(void)NAMEKEY("FactionGLABiowarCommand");
	(void)NAMEKEY("FactionGLAWarlordCommand");
}

class SmokeGameText : public GameTextInterface
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}

	UnicodeString fetch(const Char *label, Bool *exists = nullptr) override
	{
		if (exists != nullptr) {
			*exists = TRUE;
		}
		UnicodeString text;
		text.translate(label != nullptr ? label : "");
		return text;
	}

	UnicodeString fetch(AsciiString label, Bool *exists = nullptr) override
	{
		return fetch(label.str(), exists);
	}

	AsciiStringVec &getStringsWithLabelPrefix(AsciiString) override { return m_empty; }
	void initMapStringFile(const AsciiString &) override {}

private:
	AsciiStringVec m_empty;
};

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
	void clearShroud() override { ++g_display_clear_shroud_calls; }
	void setShroudLevel(Int, Int, CellShroudStatus status) override
	{
		recordShroudSet(
			status,
			g_display_set_shroud_calls,
			g_display_shrouded_set_calls,
			g_display_fogged_set_calls,
			g_display_clear_set_calls);
	}
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

class SmokeGameClient : public GameClient
{
public:
	void init() override {}
	void update() override {}
	void reset() override {}
	void createRayEffectByTemplate(const Coord3D *, const Coord3D *, const ThingTemplate *) override {}
	void addScorch(const Coord3D *, Real, Scorches) override {}
	Drawable *friend_createDrawable(const ThingTemplate *, DrawableStatus) override { return nullptr; }
	void setTimeOfDay(TimeOfDay tod) override
	{
		m_timeOfDayNotified = TRUE;
		m_notifiedTimeOfDay = tod;
	}
	void setTeamColor(Int, Int, Int) override {}
	void adjustLOD(Int) override {}
	void notifyTerrainObjectMoved(Object *) override {}

	Bool timeOfDayNotified() const { return m_timeOfDayNotified; }
	TimeOfDay notifiedTimeOfDay() const { return m_notifiedTimeOfDay; }

protected:
	void crc(Xfer *) override {}
	void xfer(Xfer *) override {}
	void loadPostProcess() override {}

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

	Bool m_timeOfDayNotified = FALSE;
	TimeOfDay m_notifiedTimeOfDay = TIME_OF_DAY_INVALID;
};

class SmokeTerrainVisual : public TerrainVisual
{
public:
	Bool load(AsciiString filename) override
	{
		++m_loadCalls;
		m_lastLoad = filename;
		return TerrainVisual::load(filename);
	}

	void getTerrainColorAt(Real, Real, RGBColor *color) override
	{
		if (color != nullptr) {
			color->red = 0.0f;
			color->green = 0.0f;
			color->blue = 0.0f;
		}
	}
	TerrainType *getTerrainTile(Real, Real) override { return nullptr; }
	void enableWaterGrid(Bool enable) override
	{
		++m_waterGridEnableCalls;
		m_lastWaterGridEnable = enable;
	}
	void setWaterGridHeightClamps(const WaterHandle *, Real, Real) override {}
	void setWaterAttenuationFactors(const WaterHandle *, Real, Real, Real, Real) override {}
	void setWaterTransform(const WaterHandle *, Real, Real, Real, Real) override {}
	void setWaterTransform(const Matrix3D *) override {}
	void getWaterTransform(const WaterHandle *, Matrix3D *) override {}
	void setWaterGridResolution(const WaterHandle *, Real, Real, Real) override {}
	void getWaterGridResolution(const WaterHandle *, Real *gridCellsX, Real *gridCellsY, Real *cellSize) override
	{
		if (gridCellsX != nullptr) {
			*gridCellsX = 0.0f;
		}
		if (gridCellsY != nullptr) {
			*gridCellsY = 0.0f;
		}
		if (cellSize != nullptr) {
			*cellSize = 0.0f;
		}
	}
	void changeWaterHeight(Real, Real, Real) override {}
	void addWaterVelocity(Real, Real, Real, Real) override {}
	Bool getWaterGridHeight(Real, Real, Real *height) override
	{
		if (height != nullptr) {
			*height = 0.0f;
		}
		return FALSE;
	}
	void setTerrainTracksDetail() override {}
	void setShoreLineDetail() override {}
	void addFactionBib(Object *, Bool, Real) override {}
	void removeFactionBib(Object *) override {}
	void addFactionBibDrawable(Drawable *, Bool, Real) override {}
	void removeFactionBibDrawable(Drawable *) override {}
	void removeAllBibs() override {}
	void removeBibHighlighting() override {}
	void removeTreesAndPropsForConstruction(const Coord3D *, const GeometryInfo &, Real) override {}
	void addProp(const ThingTemplate *, const Coord3D *, Real) override {}
	void setRawMapHeight(const ICoord2D *, Int) override {}
	Int getRawMapHeight(const ICoord2D *) override { return 0; }
	void replaceSkyboxTextures(
		const AsciiString *[NumSkyboxTextures],
		const AsciiString *[NumSkyboxTextures]) override {}

	Int loadCalls() const { return m_loadCalls; }
	AsciiString lastLoad() const { return m_lastLoad; }
	Int waterGridEnableCalls() const { return m_waterGridEnableCalls; }
	Bool lastWaterGridEnable() const { return m_lastWaterGridEnable; }

private:
	Int m_loadCalls = 0;
	AsciiString m_lastLoad;
	Int m_waterGridEnableCalls = 0;
	Bool m_lastWaterGridEnable = FALSE;
};

class SmokeW3DRoadBuffer : public W3DRoadBuffer
{
public:
	Bool initialized() const { return m_initialized; }
	Int roadSegments() const { return m_numRoads; }
	Int maxRoadSegments() const { return m_maxRoadSegments; }
	Bool updateBuffers() const { return m_updateBuffers; }
	WorldHeightMap *map() const { return m_map; }
	void capSegmentsForLogicHandoff() { m_maxRoadSegments = 0; }
};

class SmokeW3DBridgeBuffer : public W3DBridgeBuffer
{
public:
	Bool initialized() const { return m_initialized; }
	Int bridgeCount() const { return m_numBridges; }
	Int bridgeVertexCount() const { return m_curNumBridgeVertices; }
	Int bridgeIndexCount() const { return m_curNumBridgeIndices; }
};

class SmokeTerrainRenderObject : public BaseHeightMapRenderObjClass
{
public:
	SmokeTerrainRenderObject()
	{
#ifdef DO_ROADS
		if (m_roadBuffer != nullptr) {
			delete m_roadBuffer;
		}
		m_roadBuffer = new SmokeW3DRoadBuffer;
		static_cast<SmokeW3DRoadBuffer *>(m_roadBuffer)->capSegmentsForLogicHandoff();
#endif
		m_bridgeBuffer = new SmokeW3DBridgeBuffer;
	}

	~SmokeTerrainRenderObject() override
	{
		if (TheTerrainRenderObject == this) {
			TheTerrainRenderObject = nullptr;
		}
	}

	Bool attachMap(WorldHeightMap *map)
	{
		if (map == nullptr) {
			return FALSE;
		}
		redirectToHeightmap(map);
#ifdef DO_ROADS
		if (m_roadBuffer != nullptr) {
			m_roadBuffer->setMap(map);
		}
#endif
		return getMap() == map;
	}

	Bool roadBufferInstalled() const
	{
#ifdef DO_ROADS
		return m_roadBuffer != nullptr;
#else
		return FALSE;
#endif
	}

	Bool roadBufferInitialized() const
	{
#ifdef DO_ROADS
		const SmokeW3DRoadBuffer *road_buffer =
			static_cast<const SmokeW3DRoadBuffer *>(m_roadBuffer);
		return road_buffer != nullptr && road_buffer->initialized();
#else
		return FALSE;
#endif
	}

	Int roadSegments() const
	{
#ifdef DO_ROADS
		const SmokeW3DRoadBuffer *road_buffer =
			static_cast<const SmokeW3DRoadBuffer *>(m_roadBuffer);
		return road_buffer != nullptr ? road_buffer->roadSegments() : 0;
#else
		return 0;
#endif
	}

	Int roadSegmentCapacity() const
	{
#ifdef DO_ROADS
		const SmokeW3DRoadBuffer *road_buffer =
			static_cast<const SmokeW3DRoadBuffer *>(m_roadBuffer);
		return road_buffer != nullptr ? road_buffer->maxRoadSegments() : 0;
#else
		return 0;
#endif
	}

	Bool roadBufferUpdateBuffers() const
	{
#ifdef DO_ROADS
		const SmokeW3DRoadBuffer *road_buffer =
			static_cast<const SmokeW3DRoadBuffer *>(m_roadBuffer);
		return road_buffer != nullptr && road_buffer->updateBuffers();
#else
		return FALSE;
#endif
	}

	Bool roadBufferMapAttached() const
	{
#ifdef DO_ROADS
		const SmokeW3DRoadBuffer *road_buffer =
			static_cast<const SmokeW3DRoadBuffer *>(m_roadBuffer);
		return road_buffer != nullptr && road_buffer->map() == m_map;
#else
		return FALSE;
#endif
	}

	Bool bridgeBufferInstalled() const { return m_bridgeBuffer != nullptr; }

	Bool bridgeBufferInitialized() const
	{
		const SmokeW3DBridgeBuffer *bridge_buffer =
			static_cast<const SmokeW3DBridgeBuffer *>(m_bridgeBuffer);
		return bridge_buffer != nullptr && bridge_buffer->initialized();
	}

	Int bridgeCount() const
	{
		const SmokeW3DBridgeBuffer *bridge_buffer =
			static_cast<const SmokeW3DBridgeBuffer *>(m_bridgeBuffer);
		return bridge_buffer != nullptr ? bridge_buffer->bridgeCount() : 0;
	}

	Int bridgeVertexCount() const
	{
		const SmokeW3DBridgeBuffer *bridge_buffer =
			static_cast<const SmokeW3DBridgeBuffer *>(m_bridgeBuffer);
		return bridge_buffer != nullptr ? bridge_buffer->bridgeVertexCount() : 0;
	}

	Int bridgeIndexCount() const
	{
		const SmokeW3DBridgeBuffer *bridge_buffer =
			static_cast<const SmokeW3DBridgeBuffer *>(m_bridgeBuffer);
		return bridge_buffer != nullptr ? bridge_buffer->bridgeIndexCount() : 0;
	}

	void Render(RenderInfoClass &) override {}
	void doPartialUpdate(const IRegion2D &, WorldHeightMap *, RefRenderObjListIterator *) override {}
	Int updateBlock(Int, Int, Int, Int, WorldHeightMap *, RefRenderObjListIterator *) override { return 0; }
};

class SmokeRadar : public Radar
{
public:
	void draw(Int, Int, Int, Int) override {}
	void clearShroud() override { ++g_radar_clear_shroud_calls; }
	void setShroudLevel(Int, Int, CellShroudStatus status) override
	{
		recordShroudSet(
			status,
			g_radar_set_shroud_calls,
			g_radar_shrouded_set_calls,
			g_radar_fogged_set_calls,
			g_radar_clear_set_calls);
	}
	void refreshTerrain(TerrainLogic *terrain) override
	{
		++m_refreshTerrainCalls;
		m_lastRefreshTerrain = terrain;
		Radar::refreshTerrain(terrain);
	}

	Bool hasRadarWindow(GameWindow *window) { return isRadarWindow(window); }
	Region3D mapExtent() const { return m_mapExtent; }
	Real xSample() const { return m_xSample; }
	Real ySample() const { return m_ySample; }
	Real terrainAverageZ() const { return m_terrainAverageZ; }
	Real waterAverageZ() const { return m_waterAverageZ; }
	Int refreshTerrainCalls() const { return m_refreshTerrainCalls; }
	TerrainLogic *lastRefreshTerrain() const { return m_lastRefreshTerrain; }

private:
	Int m_refreshTerrainCalls = 0;
	TerrainLogic *m_lastRefreshTerrain = nullptr;
};

class SmokeVictoryConditions : public VictoryConditionsInterface
{
public:
	void init() override { reset(); }
	void reset() override { m_victoryConditions = VICTORY_NOBUILDINGS | VICTORY_NOUNITS; }
	void update() override {}
	Bool hasAchievedVictory(Player *) override { return FALSE; }
	Bool hasBeenDefeated(Player *) override { return FALSE; }
	Bool hasSinglePlayerBeenDefeated(Player *) override { return FALSE; }
	void cachePlayerPtrs() override { ++g_victory_cache_player_ptrs_calls; }
	Bool isLocalAlliedVictory() override { return FALSE; }
	Bool isLocalAlliedDefeat() override { return FALSE; }
	Bool isLocalDefeat() override { return FALSE; }
	Bool amIObserver() override { return FALSE; }
	UnsignedInt getEndFrame() override { return 0; }
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

	void installRadarWindow()
	{
		if (m_radarWindow != nullptr) {
			return;
		}
		m_radarWindow = allocateNewWindow();
		m_radarWindow->winSetWindowId(NAMEKEY("ControlBar.wnd:LeftHUD"));
		m_radarWindow->winSetPosition(0, 0);
		m_radarWindow->winSetSize(RADAR_CELL_WIDTH, RADAR_CELL_HEIGHT);
		g_radar_left_hud_window_installed = TRUE;
	}

	GameWindow *radarWindow() const { return m_radarWindow; }

	GameWindow *winGetWindowFromId(GameWindow *window, Int id) override
	{
		if (m_radarWindow != nullptr && id == m_radarWindow->winGetWindowId()) {
			++g_radar_window_lookup_count;
			return m_radarWindow;
		}
		return GameWindowManager::winGetWindowFromId(window, id);
	}

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

private:
	GameWindow *m_radarWindow = nullptr;
};

} // namespace

// GlobalData parsing applies saved user preferences after reading GameData.ini.
// Keep this smoke at the non-network preference boundary instead of linking the
// Options menu/IP-enumeration owner.
OptionPreferences::OptionPreferences()
{
}

OptionPreferences::~OptionPreferences()
{
}

Bool OptionPreferences::getAlternateMouseModeEnabled()
{
	return TheGlobalData->m_useAlternateMouse;
}

Bool OptionPreferences::getRetaliationModeEnabled()
{
	return TheGlobalData->m_clientRetaliationModeEnabled;
}

Bool OptionPreferences::getDoubleClickAttackMoveEnabled()
{
	return TheGlobalData->m_doubleClickAttackMove;
}

Real OptionPreferences::getScrollFactor()
{
	return TheGlobalData->m_keyboardDefaultScrollFactor;
}

UnsignedInt OptionPreferences::getLANIPAddress()
{
	return TheGlobalData->m_defaultIP;
}

Bool OptionPreferences::getSendDelay()
{
	return TheGlobalData->m_firewallSendDelay;
}

Int OptionPreferences::getFirewallBehavior()
{
	return TheGlobalData->m_firewallBehavior;
}

Short OptionPreferences::getFirewallPortAllocationDelta()
{
	return TheGlobalData->m_firewallPortAllocationDelta;
}

UnsignedShort OptionPreferences::getFirewallPortOverride()
{
	return TheGlobalData->m_firewallPortOverride;
}

Bool OptionPreferences::saveCameraInReplays()
{
	return TheGlobalData->m_saveCameraInReplay;
}

Bool OptionPreferences::useCameraInReplays()
{
	return TheGlobalData->m_useCameraInReplay;
}

Real OptionPreferences::getGammaValue()
{
	return 50.0f;
}

void OptionPreferences::getResolution(Int *xres, Int *yres)
{
	if (xres != nullptr) {
		*xres = TheGlobalData->m_xResolution;
	}
	if (yres != nullptr) {
		*yres = TheGlobalData->m_yResolution;
	}
}

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

extern "C" bool cnc_port_terrain_probe_shroud_enabled(void)
{
	return false;
}

extern "C" bool cnc_port_w3d_bridge_buffer_defer_gpu_buffers(void)
{
	return true;
}

int main()
{
	const char *window_archive_path = "artifacts/real-assets/Window.big";
	const char *maps_archive_path = "artifacts/real-assets/MapsZH.big";
	const char *zh_ini_archive_path = "artifacts/real-assets/INIZH.big";
	const char *base_ini_archive_path = "artifacts/real-assets/INI.big";
	const char *gameplay_map_path = "Maps\\MD_GLA03\\MD_GLA03.map";
	AsciiString archive_directory("artifacts/real-assets/");
	AsciiString archive_mask("Window.big");
	AsciiString maps_archive_mask("MapsZH.big");
	AsciiString zh_ini_archive_mask("INIZH.big");
	AsciiString base_ini_archive_mask("INI.big");

	GlobalData global_data;
	global_data.m_framesPerSecondLimit = 30;
	global_data.m_mapName = "Maps\\Smoke\\Before.map";
	global_data.m_pendingFile = gameplay_map_path;
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
	g_map_archive_path = maps_archive_path;
	g_map_archive_loaded =
		archive_file_system.loadBigFilesFromDirectory(archive_directory, maps_archive_mask);
	if (!expect(g_map_archive_loaded,
			"Win32BIGFileSystem should load MapsZH.big for the promoted gameplay map")) {
		return 1;
	}
	g_map_file_exists = file_system.doesFileExist(gameplay_map_path);
	if (!expect(g_map_file_exists,
			"MapsZH.big should expose Maps\\MD_GLA03\\MD_GLA03.map")) {
		return 1;
	}
	g_zh_ini_archive_path = zh_ini_archive_path;
	g_zh_ini_archive_loaded =
		archive_file_system.loadBigFilesFromDirectory(archive_directory, zh_ini_archive_mask);
	if (!expect(g_zh_ini_archive_loaded,
			"Win32BIGFileSystem should load INIZH.big for gameplay startup INI data")) {
		return 1;
	}
	g_base_ini_archive_path = base_ini_archive_path;
	g_base_ini_archive_loaded =
		archive_file_system.loadBigFilesFromDirectory(archive_directory, base_ini_archive_mask);
	if (!expect(g_base_ini_archive_loaded,
			"Win32BIGFileSystem should load base INI.big for default gameplay startup INI data")) {
		return 1;
	}
	g_player_template_default_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\Default\\PlayerTemplate.ini");
	g_player_template_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\PlayerTemplate.ini");
	g_game_data_default_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\Default\\GameData.ini");
	g_game_data_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\GameData.ini");
	g_multiplayer_default_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\Default\\Multiplayer.ini");
	g_multiplayer_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\Multiplayer.ini");
	g_ai_data_default_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\Default\\AIData.ini");
	g_ai_data_ini_file_exists =
		file_system.doesFileExist("Data\\INI\\AIData.ini");
	if (!expect(g_player_template_default_ini_file_exists && g_player_template_ini_file_exists,
			"mounted INI archives should expose default and Zero Hour PlayerTemplate.ini")) {
		return 1;
	}
	if (!expect(g_game_data_default_ini_file_exists && g_game_data_ini_file_exists,
			"mounted INI archives should expose default and Zero Hour GameData.ini")) {
		return 1;
	}
	if (!expect(g_multiplayer_default_ini_file_exists && g_multiplayer_ini_file_exists,
			"mounted INI archives should expose default and Zero Hour Multiplayer.ini")) {
		return 1;
	}
	if (!expect(g_ai_data_default_ini_file_exists,
			"mounted INI archives should expose default AIData.ini")) {
		return 1;
	}
	if (!expect(g_ai_data_ini_file_exists,
			"mounted INI archives should expose Zero Hour AIData.ini")) {
		return 1;
	}

	FunctionLexicon function_lexicon;
	TheFunctionLexicon = &function_lexicon;

	SmokeGameText game_text;
	TheGameText = &game_text;

	MultiplayerSettings multiplayer_settings;
	TheMultiplayerSettings = &multiplayer_settings;
	ScienceStore science_store;
	TheScienceStore = &science_store;
	science_store.init();
	AI ai;
	TheAI = &ai;
	ai.init();
	PlayerTemplateStore player_template_store;
	ThePlayerTemplateStore = &player_template_store;
	player_template_store.init();
	INI startup_ini;
	startup_ini.load("Data\\INI\\Default\\GameData.ini", INI_LOAD_OVERWRITE, nullptr);
	startup_ini.load("Data\\INI\\GameData.ini", INI_LOAD_OVERWRITE, nullptr);
	startup_ini.load("Data\\INI\\Default\\Multiplayer.ini", INI_LOAD_OVERWRITE, nullptr);
	startup_ini.load("Data\\INI\\Multiplayer.ini", INI_LOAD_OVERWRITE, nullptr);
	startup_ini.load("Data\\INI\\Science.ini", INI_LOAD_OVERWRITE, nullptr);
	startup_ini.load("Data\\INI\\Default\\AIData.ini", INI_LOAD_OVERWRITE, nullptr);
	if (g_ai_data_ini_file_exists) {
		startup_ini.load("Data\\INI\\AIData.ini", INI_LOAD_CREATE_OVERRIDES, nullptr);
	}
	seedPlayerTemplateAliasNameKeys();
	startup_ini.load("Data\\INI\\Default\\PlayerTemplate.ini", INI_LOAD_OVERWRITE, nullptr);
	startup_ini.load("Data\\INI\\PlayerTemplate.ini", INI_LOAD_OVERWRITE, nullptr);
	const Real startup_partition_cell_size = global_data.m_partitionCellSize;

	ImageCollection image_collection;
	TheMappedImageCollection = &image_collection;

	HeaderTemplateManager header_template_manager;
	TheHeaderTemplateManager = &header_template_manager;

	GameState game_state;
	TheGameState = &game_state;

	SmokeGameWindowManager *window_manager = new SmokeGameWindowManager;
	TheWindowManager = window_manager;
	window_manager->installRadarWindow();

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

	// Keep the original PlayerList alive through process teardown; its
	// production owner also outlives the game-start path this smoke exercises.
	PlayerList *player_list = new PlayerList;
	ThePlayerList = player_list;

	logic->processCommandList(TheCommandList);

	bool ok = true;
	ok = expect(player_list->getNthPlayer(0) != nullptr
			&& player_list->getNthPlayer(0) == player_list->getNeutralPlayer()
			&& player_list->getPlayerCount() == 1,
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
	ok = expect(global_data.m_mapName == gameplay_map_path
			&& global_data.m_pendingFile.isEmpty(),
		"prepareNewGame should promote pending map into GlobalData mapName") && ok;
	ok = expect(shell->isShellActive() == FALSE
			&& shell->getScreenCount() == 1,
		"prepareNewGame should drive original Shell::hideShell on the active shell layout") && ok;
	ok = expect(game_engine.getFramesPerSecondLimit() == 55 && global_data.m_useFpsLimit == TRUE,
		"MSG_NEW_GAME should apply the game-speed FPS limit") && ok;
	ok = expect(game_state.getPristineMapName() == gameplay_map_path,
		"startNewGame(FALSE) should record the shipped gameplay map as pristine") && ok;
	ok = expect(logic->isLoadingMap(),
		"first startNewGame(FALSE) call should enter loading-map state") && ok;
	ok = expect(logic->getRankPointsToAddAtGameStart() == 7,
		"prepareNewGame should preserve rank points for game start") && ok;

	TheCommandList->reset();

	if (!ok) {
		return 1;
	}

	MapCache map_cache;
	ThingFactory thing_factory;
	SidesList sides_list;
	// Match PlayerList lifetime for team/player cross-links created by newGame.
	TeamFactory *team_factory = new TeamFactory;
	SmokeGameClient game_client;
	SmokeTerrainVisual terrain_visual;
	W3DTerrainLogic terrain_logic;
	TheMapCache = &map_cache;
	TheThingFactory = &thing_factory;
	TheSidesList = &sides_list;
	TheTeamFactory = team_factory;
	TheGameClient = &game_client;
	TheTerrainVisual = &terrain_visual;
	TheTerrainLogic = &terrain_logic;

	WorldHeightMap::freeListOfMapObjects();
	terrain_logic.init();
	Bool terrain_load_returned = terrain_logic.loadMap(global_data.m_mapName, FALSE);
	Region3D terrain_extent = {};
	terrain_logic.getExtent(&terrain_extent);
	const Int terrain_map_objects = countMapObjects(FALSE);
	const Int terrain_waypoints = countMapObjects(TRUE);
	const Int terrain_extent_hi_x = REAL_TO_INT_FLOOR(terrain_extent.hi.x + 0.5f);
	const Int terrain_extent_hi_y = REAL_TO_INT_FLOOR(terrain_extent.hi.y + 0.5f);
	const Int terrain_sides = sides_list.getNumSides();
	const Int terrain_teams = sides_list.getNumTeams();
	const Int terrain_side_scripts_before_new_map = countSideScripts(sides_list);
	const Int terrain_road_point1_objects = countMapObjectsWithFlag(FLAG_ROAD_POINT1);
	const Int terrain_road_point2_objects = countMapObjectsWithFlag(FLAG_ROAD_POINT2);
	const Int terrain_bridge_point1_objects = countMapObjectsWithFlag(FLAG_BRIDGE_POINT1);
	const Int terrain_bridge_point2_objects = countMapObjectsWithFlag(FLAG_BRIDGE_POINT2);

	ok = expect(terrain_load_returned,
		"original W3DTerrainLogic::loadMap(false) should load the promoted shipped map") && ok;
	ok = expect(terrain_logic.getSourceFilename() == gameplay_map_path,
		"original TerrainLogic should retain the promoted map source filename") && ok;
	ok = expect(terrain_visual.loadCalls() == 1
			&& terrain_visual.lastLoad() == gameplay_map_path,
		"original TerrainLogic::loadMap(false) should hand the shipped map to TerrainVisual::load") && ok;
	ok = expect(terrain_map_objects > 0,
		"original WorldHeightMap logical parse should populate map objects from the shipped map") && ok;
	ok = expect(terrain_waypoints > 0,
		"original TerrainLogic::loadMap should keep shipped map waypoint objects") && ok;
	ok = expect(terrain_sides > 0,
		"original SidesList parser should populate map sides during terrain load") && ok;
	ok = expect(terrain_teams > 0,
		"original SidesList parser should populate map teams during terrain load") && ok;
	ok = expect(game_client.timeOfDayNotified(),
		"original W3DTerrainLogic::loadMap should notify GameClient of the map time of day") && ok;
	ok = expect(terrain_extent_hi_x == 3800 && terrain_extent_hi_y == 3800,
		"original W3DTerrainLogic should report the MD_GLA03 3800x3800 terrain extent") && ok;

	Bool sides_modified = sides_list.validateSides();
	const Int validated_sides = sides_list.getNumSides();
	const Int validated_teams = sides_list.getNumTeams();
	const Int startup_player_template_count = player_template_store.getPlayerTemplateCount();
	const Int startup_multiplayer_color_count = multiplayer_settings.getNumColors();

	team_factory->reset();
	player_list->newGame();
	const Int populated_player_count = player_list->getPlayerCount();
	Player *local_player = player_list->getLocalPlayer();
	Player *neutral_player = player_list->getNeutralPlayer();
	Team *local_default_team = local_player ? local_player->getDefaultTeam() : nullptr;
	Team *neutral_default_team = neutral_player ? neutral_player->getDefaultTeam() : nullptr;
	const Int side_scripts_before_script_new_map = countSideScripts(sides_list);
	script_engine->newMap();
	const Int side_scripts_after_script_new_map = countSideScripts(sides_list);
	SmokeRadar *radar = new SmokeRadar;
	TheRadar = radar;
	TheRadar->newMap(TheTerrainLogic);
	const Region3D radar_extent = radar->mapExtent();
	const Int radar_extent_hi_x = REAL_TO_INT_FLOOR(radar_extent.hi.x + 0.5f);
	const Int radar_extent_hi_y = REAL_TO_INT_FLOOR(radar_extent.hi.y + 0.5f);
	const Real expected_radar_x_sample = radar_extent.width() / RADAR_CELL_WIDTH;
	const Real expected_radar_y_sample = radar_extent.height() / RADAR_CELL_HEIGHT;
	const ICoord2D radar_center = { RADAR_CELL_WIDTH / 2, RADAR_CELL_HEIGHT / 2 };
	Coord3D radar_center_world = {};
	const Bool radar_to_world_center_ok = radar->radarToWorld2D(&radar_center, &radar_center_world);
	Coord3D terrain_center_world = {};
	terrain_center_world.x = radar_extent.width() / 2.0f;
	terrain_center_world.y = radar_extent.height() / 2.0f;
	ICoord2D terrain_center_radar = {};
	const Bool world_to_radar_center_ok = radar->worldToRadar(&terrain_center_world, &terrain_center_radar);
	SmokeVictoryConditions victory_conditions;
	TheVictoryConditions = &victory_conditions;
	victory_conditions.init();
	TheVictoryConditions->cachePlayerPtrs();
	TheVictoryConditions->setVictoryConditions(VICTORY_NOBUILDINGS);
	const Int victory_conditions_value = TheVictoryConditions->getVictoryConditions();
	const Real game_logic_width_before_partition = logic->getWidth();
	const Real game_logic_height_before_partition = logic->getHeight();
	TheGameLogic->setWidth(terrain_extent.hi.x - terrain_extent.lo.x);
	TheGameLogic->setHeight(terrain_extent.hi.y - terrain_extent.lo.y);
	const Real partition_cell_size_for_expected =
		startup_partition_cell_size > 0.0f ? startup_partition_cell_size : 1.0f;
	const Int expected_partition_cell_count_x =
		REAL_TO_INT_CEIL(terrain_extent.width() / partition_cell_size_for_expected);
	const Int expected_partition_cell_count_y =
		REAL_TO_INT_CEIL(terrain_extent.height() / partition_cell_size_for_expected);
	PartitionManager *partition_manager = new PartitionManager;
	ThePartitionManager = partition_manager;
	partition_manager->init();
	const Int partition_cell_count_x = partition_manager->getCellCountX();
	const Int partition_cell_count_y = partition_manager->getCellCountY();
	const Int partition_total_cells = partition_cell_count_x * partition_cell_count_y;
	partition_manager->refreshShroudForLocalPlayer();
	GhostObjectManager *ghost_object_manager = new GhostObjectManager;
	TheGhostObjectManager = ghost_object_manager;
	const Int ghost_local_player_index_before = ghost_object_manager->getLocalPlayerIndex();
	const Int local_player_index_for_ghosts =
		local_player != nullptr ? local_player->getPlayerIndex() : -1;
	TheGhostObjectManager->setLocalPlayerIndex(local_player_index_for_ghosts);
	const Int ghost_local_player_index_after_set = ghost_object_manager->getLocalPlayerIndex();
	TheGhostObjectManager->reset();
	const Bool ghost_object_manager_reset_called = TRUE;
	TerrainTypeCollection terrain_types;
	TheTerrainTypes = &terrain_types;
	TerrainRoadCollection terrain_roads;
	TheTerrainRoads = &terrain_roads;
	wasm_d3d8_reset_state();
	const Bool dx8_wrapper_initialized =
		WW3D::Init(nullptr, nullptr, false) == WW3D_ERROR_OK;
	const Bool dx8_render_device_initialized = dx8_wrapper_initialized
		&& WW3D::Set_Render_Device(0, 800, 600, 32, 1, false, false, true)
			== WW3D_ERROR_OK;
	if (!expect(dx8_render_device_initialized,
			"browser DX8 device should initialize before the real terrain render object")) {
		return 1;
	}
	W3DAssetManager asset_manager;
	const WasmD3D8ShimState *d3d8_state = wasm_d3d8_get_state();
	const UINT terrain_vertex_buffers_before = d3d8_state->create_vertex_buffer_calls;
	const UINT terrain_index_buffers_before = d3d8_state->create_index_buffer_calls;
	CachedFileInputStream terrain_render_map_stream;
	const Bool terrain_render_map_opened = terrain_render_map_stream.open(global_data.m_mapName);
	WorldHeightMap *terrain_render_map = nullptr;
	Bool terrain_render_map_loaded = FALSE;
	if (terrain_render_map_opened) {
		try {
			terrain_render_map = NEW WorldHeightMap(&terrain_render_map_stream, FALSE);
			terrain_render_map_loaded = terrain_render_map != nullptr
				&& terrain_render_map->getDataPtr() != nullptr
				&& terrain_render_map->getXExtent() > 0
				&& terrain_render_map->getYExtent() > 0;
		} catch (...) {
			terrain_render_map = nullptr;
			terrain_render_map_loaded = FALSE;
		}
	}
	SmokeTerrainRenderObject *terrain_render_object =
		NEW_REF(SmokeTerrainRenderObject, ());
	d3d8_state = wasm_d3d8_get_state();
	const UINT terrain_vertex_buffers_after = d3d8_state->create_vertex_buffer_calls;
	const UINT terrain_index_buffers_after = d3d8_state->create_index_buffer_calls;
	const Bool terrain_gpu_buffers_created =
		terrain_vertex_buffers_after > terrain_vertex_buffers_before
		&& terrain_index_buffers_after > terrain_index_buffers_before;
	if (!expect(terrain_gpu_buffers_created,
			"real terrain render object should create vertex and index buffers through the browser DX8 device")) {
		return 1;
	}
	const Bool terrain_road_collection_owned = TheTerrainRoads == &terrain_roads;
	const Bool terrain_type_collection_owned = TheTerrainTypes == &terrain_types;
	const Bool terrain_render_object_owned = TheTerrainRenderObject == terrain_render_object;
	const Bool terrain_render_map_attached =
		terrain_render_map_loaded && terrain_render_object->attachMap(terrain_render_map);
	const Int terrain_render_map_width =
		terrain_render_map_attached ? terrain_render_object->getMap()->getXExtent() : 0;
	const Int terrain_render_map_height =
		terrain_render_map_attached ? terrain_render_object->getMap()->getYExtent() : 0;
	const Bool terrain_road_buffer_installed = terrain_render_object->roadBufferInstalled();
	const Bool terrain_road_buffer_initialized = terrain_render_object->roadBufferInitialized();
	const Bool terrain_road_buffer_map_attached = terrain_render_object->roadBufferMapAttached();
	const Int terrain_road_segment_capacity = terrain_render_object->roadSegmentCapacity();
	const Bool terrain_bridge_buffer_installed = terrain_render_object->bridgeBufferInstalled();
	const Bool terrain_bridge_buffer_initialized = terrain_render_object->bridgeBufferInitialized();
	const Int terrain_road_segments_before_new_map = terrain_render_object->roadSegments();
	const Int terrain_bridge_buffer_bridges_before_new_map = terrain_render_object->bridgeCount();
	const Int terrain_logic_bridges_before_new_map = countLogicBridges(terrain_logic);
	const Bool terrain_bridge_damage_states_changed_before_new_map =
		terrain_logic.anyBridgesDamageStatesChanged();
	const Int terrain_water_grid_calls_before_new_map = terrain_visual.waterGridEnableCalls();
	Waypoint *first_waypoint_before_new_map = terrain_logic.getFirstWaypoint();
	Coord3D first_waypoint_location_before_new_map = {};
	if (first_waypoint_before_new_map != nullptr) {
		first_waypoint_location_before_new_map = *first_waypoint_before_new_map->getLocation();
	}
	const Bool terrain_waveguide_waypoint_present =
		terrain_logic.getWaypointByName("WaveGuide1") != nullptr;
	Bool terrain_new_map_called = FALSE;
	if (terrain_render_map_attached) {
		terrain_logic.newMap(FALSE);
		terrain_new_map_called = TRUE;
	}
	Waypoint *first_waypoint_after_new_map = terrain_logic.getFirstWaypoint();
	Coord3D first_waypoint_location_after_new_map = {};
	if (first_waypoint_after_new_map != nullptr) {
		first_waypoint_location_after_new_map = *first_waypoint_after_new_map->getLocation();
	}
	const Real first_waypoint_ground_height_after_new_map =
		first_waypoint_after_new_map != nullptr
			? terrain_logic.getGroundHeight(
				first_waypoint_location_after_new_map.x,
				first_waypoint_location_after_new_map.y)
			: 0.0f;
	const Int terrain_road_segments_after_new_map = terrain_render_object->roadSegments();
	const Bool terrain_road_buffer_update_buffers = terrain_render_object->roadBufferUpdateBuffers();
	const Int terrain_bridge_buffer_bridges_after_new_map = terrain_render_object->bridgeCount();
	const Int terrain_bridge_buffer_vertices_after_new_map =
		terrain_render_object->bridgeVertexCount();
	const Int terrain_bridge_buffer_indices_after_new_map =
		terrain_render_object->bridgeIndexCount();
	const Int terrain_logic_bridges_after_new_map = countLogicBridges(terrain_logic);
	const Bool terrain_bridge_damage_states_changed_after_new_map =
		terrain_logic.anyBridgesDamageStatesChanged();
	const Int terrain_water_grid_calls_after_new_map = terrain_visual.waterGridEnableCalls();
	const Bool terrain_water_grid_last_enable = terrain_visual.lastWaterGridEnable();
	const Bool bridge_like_map_object_default_template_available =
		thing_factory.findTemplate(AsciiString("DefaultThingTemplate"), FALSE) != nullptr;
	const Int radar_refresh_terrain_calls_before_bridge_scan = radar->refreshTerrainCalls();
	BridgeLikeMapObjectScan bridge_like_map_object_scan = {};
	Bool bridge_like_map_object_scan_called = FALSE;
	if (terrain_new_map_called) {
		bridge_like_map_object_scan = scanBridgeLikeMapObjectsForStartup();
		bridge_like_map_object_scan_called = TRUE;
		TheRadar->refreshTerrain(TheTerrainLogic);
	}
	const Int radar_refresh_terrain_calls_after_bridge_scan = radar->refreshTerrainCalls();
	const Bool radar_refresh_terrain_after_bridge_scan =
		radar_refresh_terrain_calls_after_bridge_scan ==
			radar_refresh_terrain_calls_before_bridge_scan + 1
		&& radar->lastRefreshTerrain() == &terrain_logic;
	const Int bridge_like_map_object_scan_accounted =
		bridge_like_map_object_scan.skippedSpecialTerrainObjects
		+ bridge_like_map_object_scan.withoutThingTemplate
		+ bridge_like_map_object_scan.nonBridgeLikeTemplates
		+ bridge_like_map_object_scan.bridgeLikeTemplates;
	const Int bridge_like_map_object_special_flag_expected =
		terrain_road_point1_objects + terrain_road_point2_objects
		+ terrain_bridge_point1_objects + terrain_bridge_point2_objects;
	Region3D pathfinder_expected_extent_region = {};
	terrain_logic.getMaximumPathfindExtent(&pathfinder_expected_extent_region);
	const Int pathfinder_expected_extent_x =
		REAL_TO_INT_FLOOR(pathfinder_expected_extent_region.hi.x / PATHFIND_CELL_SIZE_F) - 1;
	const Int pathfinder_expected_extent_y =
		REAL_TO_INT_FLOOR(pathfinder_expected_extent_region.hi.y / PATHFIND_CELL_SIZE_F) - 1;
	Pathfinder *pathfinder = TheAI != nullptr ? TheAI->pathfinder() : nullptr;
	Bool pathfinder_new_map_called = FALSE;
	if (bridge_like_map_object_scan_called
			&& radar_refresh_terrain_after_bridge_scan
			&& pathfinder != nullptr) {
		pathfinder->newMap();
		pathfinder_new_map_called = TRUE;
	}
	const Bool pathfinder_new_map_ordered_after_bridge_scan =
		bridge_like_map_object_scan_called
		&& radar_refresh_terrain_after_bridge_scan
		&& pathfinder_new_map_called;
	const ICoord2D *pathfinder_extent_after_new_map =
		pathfinder != nullptr ? pathfinder->getExtent() : nullptr;
	const Int pathfinder_extent_x_after_new_map =
		pathfinder_extent_after_new_map != nullptr ? pathfinder_extent_after_new_map->x : -1;
	const Int pathfinder_extent_y_after_new_map =
		pathfinder_extent_after_new_map != nullptr ? pathfinder_extent_after_new_map->y : -1;
	const Int pathfinder_center_cell_x = pathfinder_expected_extent_x / 2;
	const Int pathfinder_center_cell_y = pathfinder_expected_extent_y / 2;
	PathfindCell *pathfinder_center_ground_cell =
		pathfinder_new_map_called
			? pathfinder->getCell(
				LAYER_GROUND,
				pathfinder_center_cell_x,
				pathfinder_center_cell_y)
			: nullptr;
	const Bool pathfinder_center_ground_cell_ready =
		pathfinder_center_ground_cell != nullptr;
	PathfindCell line_cache_cell;
	Bool north_result = TRUE;
	Bool west_result = FALSE;
	line_cache_cell.cacheLinePassability(17, 10, 9, 10, 10, FALSE);
	const Bool north_cache_hit = line_cache_cell.getCachedLinePassability(
		17, 10, 9, 10, 10, north_result);
	const Bool west_cache_miss = !line_cache_cell.getCachedLinePassability(
		17, 9, 10, 10, 10, west_result);
	line_cache_cell.cacheLinePassability(17, 9, 10, 10, 10, TRUE);
	const Bool west_cache_hit = line_cache_cell.getCachedLinePassability(
		17, 9, 10, 10, 10, west_result);
	const Bool north_cache_replaced = !line_cache_cell.getCachedLinePassability(
		17, 10, 9, 10, 10, north_result);
	if (TheTerrainRenderObject == terrain_render_object) {
		TheTerrainRenderObject = nullptr;
	}
	// Full WW3D terrain teardown is outside this GameLogic startup smoke.
	REF_PTR_RELEASE(terrain_render_map);

	ok = expect(startup_player_template_count > 0,
		"original PlayerTemplateStore should parse shipped player templates before player population") && ok;
	ok = expect(north_cache_hit && !north_result
			&& west_cache_miss && west_cache_hit && west_result
			&& north_cache_replaced,
		"line passability cache must not reuse a result across different incoming directions") && ok;
	ok = expect(startup_multiplayer_color_count > 0,
		"original MultiplayerSettings should parse shipped multiplayer colors before player population") && ok;
	ok = expect(nearlyEqual(startup_partition_cell_size, 40.0f, 0.001f),
		"original GameData.ini parser should load the production partition cell size") && ok;
	ok = expect(validated_sides >= terrain_sides && validated_teams >= terrain_teams,
		"original SidesList::validateSides should preserve or repair loaded shipped map sides and teams") && ok;
	ok = expect(populated_player_count == validated_sides,
		"original PlayerList::newGame should create one player for each validated shipped map side") && ok;
	ok = expect(local_player != nullptr
			&& local_player != neutral_player
			&& local_player->getPlayerTemplate() != nullptr,
		"original PlayerList::newGame should select a non-neutral local player with a real PlayerTemplate") && ok;
	ok = expect(local_default_team != nullptr
			&& TheTeamFactory->findTeam(local_default_team->getName()) == local_default_team,
		"original TeamFactory::initFromSides should create the local player's default team") && ok;
	ok = expect(neutral_default_team != nullptr
			&& TheTeamFactory->findTeam(neutral_default_team->getName()) == neutral_default_team,
		"original TeamFactory::initFromSides should create the neutral default team") && ok;
	ok = expect(side_scripts_before_script_new_map == side_scripts_after_script_new_map,
		"original ScriptEngine::newMap should scan loaded side scripts without discarding them") && ok;
	ok = expect(g_radar_left_hud_window_installed
			&& g_radar_window_lookup_count == 1
			&& radar->hasRadarWindow(window_manager->radarWindow()),
		"original Radar::newMap should resolve the ControlBar LeftHUD radar window") && ok;
	ok = expect(radar_extent_hi_x == terrain_extent_hi_x
			&& radar_extent_hi_y == terrain_extent_hi_y
			&& nearlyEqual(radar->xSample(), expected_radar_x_sample, 0.001f)
			&& nearlyEqual(radar->ySample(), expected_radar_y_sample, 0.001f),
		"original Radar::newMap should derive radar extent and sample size from TerrainLogic") && ok;
	ok = expect(radar_to_world_center_ok
			&& world_to_radar_center_ok
			&& nearlyEqual(radar_center_world.x, terrain_center_world.x, 0.001f)
			&& nearlyEqual(radar_center_world.y, terrain_center_world.y, 0.001f)
			&& terrain_center_radar.x == radar_center.x
			&& terrain_center_radar.y == radar_center.y,
		"original Radar::newMap should enable radar/world coordinate translation for the loaded map") && ok;
	ok = expect(g_victory_cache_player_ptrs_calls == 1
			&& victory_conditions_value == VICTORY_NOBUILDINGS,
		"post-radar startup should set the victory-condition boundary before partition init") && ok;
	ok = expect(nearlyEqual(game_logic_width_before_partition, 0.0f, 0.001f)
			&& nearlyEqual(game_logic_height_before_partition, 0.0f, 0.001f)
			&& nearlyEqual(logic->getWidth(), terrain_extent.width(), 0.001f)
			&& nearlyEqual(logic->getHeight(), terrain_extent.height(), 0.001f),
		"post-radar startup should copy the terrain extent into original GameLogic width/height") && ok;
	ok = expect(partition_cell_count_x == expected_partition_cell_count_x
			&& partition_cell_count_y == expected_partition_cell_count_y
			&& partition_total_cells > 0
			&& ThePartitionManager == partition_manager,
		"original PartitionManager::init should allocate the loaded map partition grid") && ok;
	ok = expect(g_display_clear_shroud_calls == 1
			&& g_radar_clear_shroud_calls == 1
			&& g_display_set_shroud_calls == partition_total_cells
			&& g_radar_set_shroud_calls == partition_total_cells
			&& g_display_shrouded_set_calls == partition_total_cells
			&& g_radar_shrouded_set_calls == partition_total_cells
			&& g_display_fogged_set_calls == 0
			&& g_radar_fogged_set_calls == 0
			&& g_display_clear_set_calls == 0
			&& g_radar_clear_set_calls == 0,
		"original PartitionManager::refreshShroudForLocalPlayer should refresh every initial shrouded cell") && ok;
	ok = expect(TheGhostObjectManager == ghost_object_manager
			&& ghost_local_player_index_before == 0
			&& local_player_index_for_ghosts >= 0
			&& ghost_local_player_index_after_set == local_player_index_for_ghosts
			&& ghost_object_manager_reset_called,
		"original GhostObjectManager should take the local player index and reset after partition shroud refresh") && ok;
	ok = expect(terrain_road_collection_owned
			&& terrain_type_collection_owned
			&& terrain_render_map_opened
			&& terrain_render_map_loaded
			&& terrain_render_object_owned
			&& terrain_render_map_attached
			&& terrain_render_map_width > 0
			&& terrain_render_map_height > 0
			&& terrain_road_buffer_installed
			&& terrain_road_buffer_initialized
			&& terrain_road_buffer_map_attached
			&& terrain_road_segment_capacity == 0
			&& terrain_bridge_buffer_installed
			&& terrain_bridge_buffer_initialized
			&& terrain_new_map_called
			&& terrain_road_segments_after_new_map >= terrain_road_segments_before_new_map
			&& terrain_road_buffer_update_buffers
			&& terrain_bridge_buffer_bridges_before_new_map == 0
			&& terrain_logic_bridges_before_new_map == 0
			&& !terrain_bridge_damage_states_changed_before_new_map
			&& terrain_bridge_point1_objects == 0
			&& terrain_bridge_point1_objects == terrain_bridge_point2_objects
			&& terrain_bridge_buffer_bridges_after_new_map == terrain_bridge_point1_objects
			&& terrain_bridge_buffer_vertices_after_new_map == 0
			&& terrain_bridge_buffer_indices_after_new_map == 0
			&& terrain_logic_bridges_after_new_map == terrain_bridge_point1_objects
			&& terrain_bridge_damage_states_changed_after_new_map
			&& terrain_water_grid_calls_after_new_map == terrain_water_grid_calls_before_new_map + 1
			&& terrain_water_grid_last_enable == terrain_waveguide_waypoint_present
			&& first_waypoint_after_new_map != nullptr
			&& nearlyEqual(
				first_waypoint_location_after_new_map.z,
				first_waypoint_ground_height_after_new_map,
				0.001f),
		"original W3DTerrainLogic::newMap should hand the loaded map to BaseHeightMap road/bridge loaders and run TerrainLogic waypoint/water setup") && ok;
	ok = expect(bridge_like_map_object_scan_called
			&& bridge_like_map_object_scan.scanned == terrain_map_objects
			&& bridge_like_map_object_scan.skippedSpecialTerrainObjects ==
				bridge_like_map_object_special_flag_expected
			&& bridge_like_map_object_scan_accounted == bridge_like_map_object_scan.scanned
			&& bridge_like_map_object_scan.bridgeLikeTemplates == 0
			&& bridge_like_map_object_scan.bridgeTemplates == 0
			&& bridge_like_map_object_scan.walkOnWallTemplates == 0
			&& radar_refresh_terrain_after_bridge_scan,
		"original post-terrain bridge-like map-object scan should run before Radar::refreshTerrain and find no startup-owned bridge-like object candidates on MD_GLA03") && ok;
	ok = expect(pathfinder != nullptr
			&& pathfinder_expected_extent_x > 0
			&& pathfinder_expected_extent_y > 0
			&& pathfinder_new_map_ordered_after_bridge_scan
			&& pathfinder_extent_x_after_new_map == pathfinder_expected_extent_x
			&& pathfinder_extent_y_after_new_map == pathfinder_expected_extent_y
			&& pathfinder_center_ground_cell_ready,
		"original Pathfinder::newMap should allocate and classify the loaded terrain grid after the bridge-like scan and radar terrain refresh") && ok;
	WorldHeightMap::freeListOfMapObjects();

	if (!ok) {
		return 1;
	}

	std::cout
		<< "{\"ok\":true,"
		<< "\"path\":\"gamelogic-new-game-dispatch-runtime\","
		<< "\"source\":\"GeneralsMD original GlobalData.cpp/INI.cpp/INIGameData.cpp/INIAiData.cpp/INIMultiplayer.cpp/UserPreferences.cpp/MultiplayerSettings.cpp/Science.cpp/PlayerTemplate.cpp/FunctionLexicon.cpp/PlayerList.cpp/Player.cpp/AI.cpp/AIPathfind.cpp/AIPlayer.cpp/GhostObject.cpp/Weapon.cpp/GameLogic.cpp/GameLogicDispatch.cpp/GameState.cpp/TerrainTypes.cpp/Radar.cpp/PartitionManager.cpp/ScriptEngine.cpp/Scripts.cpp/Shell.cpp/GameWindowManagerScript.cpp/HeaderTemplate.cpp/TerrainRoads.cpp/TerrainLogic.cpp/W3DTerrainLogic.cpp/WorldHeightMap.cpp/TerrainVisual.cpp/SidesList.cpp/ThingFactory.cpp/WW3D.cpp/DX8Wrapper.cpp/DX8VertexBuffer.cpp/DX8IndexBuffer.cpp\","
		<< "\"message\":\"MSG_NEW_GAME\","
		<< "\"playerLookupIndex\":0,"
		<< "\"playerCount\":" << player_list->getPlayerCount() << ","
		<< "\"neutralPlayerOwned\":true,"
		<< "\"difficulty\":" << script_engine->getGlobalDifficulty() << ","
		<< "\"blankLayoutCreates\":" << g_blank_layout_creates << ","
		<< "\"blankLayoutArchive\":\"" << jsonEscape(g_blank_layout_archive_path.str()) << "\","
		<< "\"blankWindowArchiveLoaded\":" << jsonBool(g_blank_window_archive_loaded) << ","
		<< "\"blankWindowFileExists\":" << jsonBool(g_blank_window_file_exists) << ","
		<< "\"mapArchive\":\"" << jsonEscape(g_map_archive_path.str()) << "\","
		<< "\"mapArchiveLoaded\":" << jsonBool(g_map_archive_loaded) << ","
		<< "\"mapFileExists\":" << jsonBool(g_map_file_exists) << ","
		<< "\"zhIniArchive\":\"" << jsonEscape(g_zh_ini_archive_path.str()) << "\","
		<< "\"zhIniArchiveLoaded\":" << jsonBool(g_zh_ini_archive_loaded) << ","
		<< "\"baseIniArchive\":\"" << jsonEscape(g_base_ini_archive_path.str()) << "\","
		<< "\"baseIniArchiveLoaded\":" << jsonBool(g_base_ini_archive_loaded) << ","
		<< "\"playerTemplateDefaultIniFileExists\":" << jsonBool(g_player_template_default_ini_file_exists) << ","
		<< "\"playerTemplateIniFileExists\":" << jsonBool(g_player_template_ini_file_exists) << ","
		<< "\"gameDataDefaultIniFileExists\":" << jsonBool(g_game_data_default_ini_file_exists) << ","
		<< "\"gameDataIniFileExists\":" << jsonBool(g_game_data_ini_file_exists) << ","
		<< "\"multiplayerDefaultIniFileExists\":" << jsonBool(g_multiplayer_default_ini_file_exists) << ","
		<< "\"multiplayerIniFileExists\":" << jsonBool(g_multiplayer_ini_file_exists) << ","
		<< "\"aiDataDefaultIniFileExists\":" << jsonBool(g_ai_data_default_ini_file_exists) << ","
		<< "\"aiDataIniFileExists\":" << jsonBool(g_ai_data_ini_file_exists) << ","
		<< "\"startupPlayerTemplateCount\":" << startup_player_template_count << ","
		<< "\"startupMultiplayerColorCount\":" << startup_multiplayer_color_count << ","
		<< "\"startupPartitionCellSize\":" << startup_partition_cell_size << ","
		<< "\"startupAiTeamSeconds\":" << ai.getAiData()->m_teamSeconds << ","
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
		<< "\"terrainLoadMap\":\"" << jsonEscape(global_data.m_mapName.str()) << "\","
		<< "\"terrainLoadReturned\":" << jsonBool(terrain_load_returned) << ","
		<< "\"terrainSourceFilename\":\"" << jsonEscape(terrain_logic.getSourceFilename().str()) << "\","
		<< "\"terrainVisualLoadCalled\":" << jsonBool(terrain_visual.loadCalls() == 1) << ","
		<< "\"terrainVisualLoadCalls\":" << terrain_visual.loadCalls() << ","
		<< "\"terrainVisualLoadPath\":\"" << jsonEscape(terrain_visual.lastLoad().str()) << "\","
		<< "\"terrainMapObjects\":" << terrain_map_objects << ","
		<< "\"terrainWaypoints\":" << terrain_waypoints << ","
		<< "\"terrainRoadPoint1Objects\":" << terrain_road_point1_objects << ","
		<< "\"terrainRoadPoint2Objects\":" << terrain_road_point2_objects << ","
		<< "\"terrainBridgePoint1Objects\":" << terrain_bridge_point1_objects << ","
		<< "\"terrainBridgePoint2Objects\":" << terrain_bridge_point2_objects << ","
		<< "\"terrainSides\":" << terrain_sides << ","
		<< "\"terrainTeams\":" << terrain_teams << ","
		<< "\"terrainSideScriptsBeforeNewMap\":" << terrain_side_scripts_before_new_map << ","
		<< "\"terrainTimeOfDayNotified\":" << jsonBool(game_client.timeOfDayNotified()) << ","
		<< "\"terrainTimeOfDay\":" << game_client.notifiedTimeOfDay() << ","
		<< "\"terrainExtent\":{\"loX\":" << terrain_extent.lo.x
		<< ",\"loY\":" << terrain_extent.lo.y
		<< ",\"loZ\":" << terrain_extent.lo.z
		<< ",\"hiX\":" << terrain_extent.hi.x
		<< ",\"hiY\":" << terrain_extent.hi.y
		<< ",\"hiZ\":" << terrain_extent.hi.z << "},"
		<< "\"sidesValidateModified\":" << jsonBool(sides_modified) << ","
		<< "\"validatedSides\":" << validated_sides << ","
		<< "\"validatedTeams\":" << validated_teams << ","
		<< "\"populatedPlayerCount\":" << populated_player_count << ","
		<< "\"localPlayerIndex\":" << (local_player ? local_player->getPlayerIndex() : -1) << ","
		<< "\"localPlayerSide\":\"" << jsonEscape(local_player && local_player->getPlayerTemplate()
			? local_player->getPlayerTemplate()->getSide().str() : "") << "\","
		<< "\"localDefaultTeam\":\"" << jsonEscape(local_default_team ? local_default_team->getName().str() : "") << "\","
		<< "\"neutralDefaultTeam\":\"" << jsonEscape(neutral_default_team ? neutral_default_team->getName().str() : "") << "\","
		<< "\"sideScriptsBeforeScriptNewMap\":" << side_scripts_before_script_new_map << ","
		<< "\"sideScriptsAfterScriptNewMap\":" << side_scripts_after_script_new_map << ","
		<< "\"radarLeftHudWindowInstalled\":" << jsonBool(g_radar_left_hud_window_installed) << ","
		<< "\"radarWindowLookupCount\":" << g_radar_window_lookup_count << ","
		<< "\"radarWindowOwned\":" << jsonBool(radar->hasRadarWindow(window_manager->radarWindow())) << ","
		<< "\"radarExtent\":{\"loX\":" << radar_extent.lo.x
		<< ",\"loY\":" << radar_extent.lo.y
		<< ",\"loZ\":" << radar_extent.lo.z
		<< ",\"hiX\":" << radar_extent.hi.x
		<< ",\"hiY\":" << radar_extent.hi.y
		<< ",\"hiZ\":" << radar_extent.hi.z << "},"
		<< "\"radarXSample\":" << radar->xSample() << ","
		<< "\"radarYSample\":" << radar->ySample() << ","
		<< "\"radarTerrainAverageZ\":" << radar->terrainAverageZ() << ","
		<< "\"radarWaterAverageZ\":" << radar->waterAverageZ() << ","
		<< "\"radarToWorldCenterOk\":" << jsonBool(radar_to_world_center_ok) << ","
		<< "\"radarCenterWorld\":{\"x\":" << radar_center_world.x
		<< ",\"y\":" << radar_center_world.y
		<< ",\"z\":" << radar_center_world.z << "},"
		<< "\"worldToRadarCenterOk\":" << jsonBool(world_to_radar_center_ok) << ","
		<< "\"terrainCenterRadar\":{\"x\":" << terrain_center_radar.x
		<< ",\"y\":" << terrain_center_radar.y << "},"
		<< "\"victoryCachePlayerPtrsCalls\":" << g_victory_cache_player_ptrs_calls << ","
		<< "\"victoryConditions\":" << victory_conditions_value << ","
		<< "\"gameLogicWidthBeforePartition\":" << game_logic_width_before_partition << ","
		<< "\"gameLogicHeightBeforePartition\":" << game_logic_height_before_partition << ","
		<< "\"gameLogicWidthAfterPartition\":" << logic->getWidth() << ","
		<< "\"gameLogicHeightAfterPartition\":" << logic->getHeight() << ","
		<< "\"partitionCellSize\":" << startup_partition_cell_size << ","
		<< "\"expectedPartitionCellCountX\":" << expected_partition_cell_count_x << ","
		<< "\"expectedPartitionCellCountY\":" << expected_partition_cell_count_y << ","
		<< "\"partitionCellCountX\":" << partition_cell_count_x << ","
		<< "\"partitionCellCountY\":" << partition_cell_count_y << ","
		<< "\"partitionTotalCells\":" << partition_total_cells << ","
		<< "\"displayClearShroudCalls\":" << g_display_clear_shroud_calls << ","
		<< "\"displaySetShroudCalls\":" << g_display_set_shroud_calls << ","
		<< "\"displayShroudedSetCalls\":" << g_display_shrouded_set_calls << ","
		<< "\"displayFoggedSetCalls\":" << g_display_fogged_set_calls << ","
		<< "\"displayClearSetCalls\":" << g_display_clear_set_calls << ","
		<< "\"radarClearShroudCalls\":" << g_radar_clear_shroud_calls << ","
		<< "\"radarSetShroudCalls\":" << g_radar_set_shroud_calls << ","
		<< "\"radarShroudedSetCalls\":" << g_radar_shrouded_set_calls << ","
		<< "\"radarFoggedSetCalls\":" << g_radar_fogged_set_calls << ","
		<< "\"radarClearSetCalls\":" << g_radar_clear_set_calls << ","
		<< "\"ghostObjectManagerOwned\":" << jsonBool(TheGhostObjectManager == ghost_object_manager) << ","
		<< "\"ghostLocalPlayerIndexBefore\":" << ghost_local_player_index_before << ","
		<< "\"ghostLocalPlayerIndexAfterSet\":" << ghost_local_player_index_after_set << ","
		<< "\"ghostResetCalled\":" << jsonBool(ghost_object_manager_reset_called) << ","
		<< "\"terrainRoadCollectionOwned\":" << jsonBool(terrain_road_collection_owned) << ","
		<< "\"terrainTypeCollectionOwned\":" << jsonBool(terrain_type_collection_owned) << ","
		<< "\"terrainRenderMapOpened\":" << jsonBool(terrain_render_map_opened) << ","
		<< "\"terrainRenderMapLoaded\":" << jsonBool(terrain_render_map_loaded) << ","
		<< "\"terrainRenderObjectOwned\":" << jsonBool(terrain_render_object_owned) << ","
		<< "\"dx8WrapperInitialized\":" << jsonBool(dx8_wrapper_initialized) << ","
		<< "\"dx8RenderDeviceInitialized\":" << jsonBool(dx8_render_device_initialized) << ","
		<< "\"terrainVertexBuffersBefore\":" << terrain_vertex_buffers_before << ","
		<< "\"terrainVertexBuffersAfter\":" << terrain_vertex_buffers_after << ","
		<< "\"terrainIndexBuffersBefore\":" << terrain_index_buffers_before << ","
		<< "\"terrainIndexBuffersAfter\":" << terrain_index_buffers_after << ","
		<< "\"terrainGpuBuffersCreated\":" << jsonBool(terrain_gpu_buffers_created) << ","
		<< "\"terrainRenderMapAttached\":" << jsonBool(terrain_render_map_attached) << ","
		<< "\"terrainRenderMapWidth\":" << terrain_render_map_width << ","
		<< "\"terrainRenderMapHeight\":" << terrain_render_map_height << ","
		<< "\"terrainRoadBufferInstalled\":" << jsonBool(terrain_road_buffer_installed) << ","
		<< "\"terrainRoadBufferInitialized\":" << jsonBool(terrain_road_buffer_initialized) << ","
		<< "\"terrainRoadBufferMapAttached\":" << jsonBool(terrain_road_buffer_map_attached) << ","
		<< "\"terrainRoadSegmentCapacity\":" << terrain_road_segment_capacity << ","
		<< "\"terrainRoadSegmentsBeforeNewMap\":" << terrain_road_segments_before_new_map << ","
		<< "\"terrainRoadSegmentsAfterNewMap\":" << terrain_road_segments_after_new_map << ","
		<< "\"terrainRoadBufferUpdateBuffers\":" << jsonBool(terrain_road_buffer_update_buffers) << ","
		<< "\"terrainBridgeBufferInstalled\":" << jsonBool(terrain_bridge_buffer_installed) << ","
		<< "\"terrainBridgeBufferInitialized\":" << jsonBool(terrain_bridge_buffer_initialized) << ","
		<< "\"terrainBridgeBufferBridgesBeforeNewMap\":" << terrain_bridge_buffer_bridges_before_new_map << ","
		<< "\"terrainBridgeBufferBridgesAfterNewMap\":" << terrain_bridge_buffer_bridges_after_new_map << ","
		<< "\"terrainBridgeBufferVerticesAfterNewMap\":" << terrain_bridge_buffer_vertices_after_new_map << ","
		<< "\"terrainBridgeBufferIndicesAfterNewMap\":" << terrain_bridge_buffer_indices_after_new_map << ","
		<< "\"terrainLogicBridgesBeforeNewMap\":" << terrain_logic_bridges_before_new_map << ","
		<< "\"terrainLogicBridgesAfterNewMap\":" << terrain_logic_bridges_after_new_map << ","
		<< "\"terrainBridgeDamageStatesChangedBeforeNewMap\":" << jsonBool(terrain_bridge_damage_states_changed_before_new_map) << ","
		<< "\"terrainBridgeDamageStatesChangedAfterNewMap\":" << jsonBool(terrain_bridge_damage_states_changed_after_new_map) << ","
		<< "\"terrainNewMapCalled\":" << jsonBool(terrain_new_map_called) << ","
		<< "\"terrainWaveGuideWaypointPresent\":" << jsonBool(terrain_waveguide_waypoint_present) << ","
		<< "\"terrainWaterGridCallsBeforeNewMap\":" << terrain_water_grid_calls_before_new_map << ","
		<< "\"terrainWaterGridCallsAfterNewMap\":" << terrain_water_grid_calls_after_new_map << ","
		<< "\"terrainWaterGridLastEnable\":" << jsonBool(terrain_water_grid_last_enable) << ","
		<< "\"terrainFirstWaypointZBeforeNewMap\":" << first_waypoint_location_before_new_map.z << ","
		<< "\"terrainFirstWaypointZAfterNewMap\":" << first_waypoint_location_after_new_map.z << ","
		<< "\"terrainFirstWaypointGroundHeightAfterNewMap\":" << first_waypoint_ground_height_after_new_map << ","
		<< "\"bridgeLikeMapObjectDefaultTemplateAvailable\":" << jsonBool(bridge_like_map_object_default_template_available) << ","
		<< "\"bridgeLikeMapObjectScanCalled\":" << jsonBool(bridge_like_map_object_scan_called) << ","
		<< "\"bridgeLikeMapObjectsScanned\":" << bridge_like_map_object_scan.scanned << ","
		<< "\"bridgeLikeMapObjectsSkippedSpecialTerrainObjects\":" << bridge_like_map_object_scan.skippedSpecialTerrainObjects << ","
		<< "\"bridgeLikeMapObjectsSpecialFlagExpected\":" << bridge_like_map_object_special_flag_expected << ","
		<< "\"bridgeLikeMapObjectsWithoutThingTemplate\":" << bridge_like_map_object_scan.withoutThingTemplate << ","
		<< "\"bridgeLikeMapObjectsNonBridgeLikeTemplates\":" << bridge_like_map_object_scan.nonBridgeLikeTemplates << ","
		<< "\"bridgeLikeMapObjectBridgeTemplates\":" << bridge_like_map_object_scan.bridgeTemplates << ","
		<< "\"bridgeLikeMapObjectWalkOnWallTemplates\":" << bridge_like_map_object_scan.walkOnWallTemplates << ","
		<< "\"bridgeLikeMapObjectCandidates\":" << bridge_like_map_object_scan.bridgeLikeTemplates << ","
		<< "\"bridgeLikeMapObjectScanAccounted\":" << bridge_like_map_object_scan_accounted << ","
		<< "\"bridgeLikeMapObjectCreationDeferred\":" << jsonBool(bridge_like_map_object_scan.bridgeLikeTemplates == 0) << ","
		<< "\"radarRefreshTerrainCallsBeforeBridgeScan\":" << radar_refresh_terrain_calls_before_bridge_scan << ","
		<< "\"radarRefreshTerrainCallsAfterBridgeScan\":" << radar_refresh_terrain_calls_after_bridge_scan << ","
		<< "\"radarRefreshTerrainAfterBridgeScan\":" << jsonBool(radar_refresh_terrain_after_bridge_scan) << ","
		<< "\"pathfinderOwned\":" << jsonBool(pathfinder != nullptr) << ","
		<< "\"pathfinderNewMapCalled\":" << jsonBool(pathfinder_new_map_called) << ","
		<< "\"pathfinderNewMapOrderedAfterBridgeScan\":" << jsonBool(pathfinder_new_map_ordered_after_bridge_scan) << ","
		<< "\"pathfinderExpectedExtentX\":" << pathfinder_expected_extent_x << ","
		<< "\"pathfinderExpectedExtentY\":" << pathfinder_expected_extent_y << ","
		<< "\"pathfinderExtentXAfterNewMap\":" << pathfinder_extent_x_after_new_map << ","
		<< "\"pathfinderExtentYAfterNewMap\":" << pathfinder_extent_y_after_new_map << ","
		<< "\"pathfinderCenterCellX\":" << pathfinder_center_cell_x << ","
		<< "\"pathfinderCenterCellY\":" << pathfinder_center_cell_y << ","
		<< "\"pathfinderCenterGroundCellReady\":" << jsonBool(pathfinder_center_ground_cell_ready) << ","
		<< "\"pathfinderLineDirectionCache\":{"
		<< "\"northHit\":" << jsonBool(north_cache_hit) << ","
		<< "\"northPassable\":" << jsonBool(north_result) << ","
		<< "\"westMiss\":" << jsonBool(west_cache_miss) << ","
		<< "\"westHit\":" << jsonBool(west_cache_hit) << ","
		<< "\"westPassable\":" << jsonBool(west_result) << ","
		<< "\"northReplaced\":" << jsonBool(north_cache_replaced) << "},"
		<< "\"runtimeBoundaries\":["
		<< "\"InGameUI client-quiet remains focused UI boundary\","
		<< "\"OptionPreferences user preference getters remain focused non-network browser preference boundary\","
		<< "\"bridge-like map-object creation remains focused ThingFactory/Object ownership boundary after ordered no-candidate startup scan\"],"
		<< "\"originalOwners\":[\"GlobalData TheWritableGlobalData\",\"PlayerList::getNthPlayer neutral player\",\"ScriptEngine::setGlobalDifficulty\",\"HeaderTemplateManager empty template lookup\",\"Shell::push seeded BlankWindow\",\"GameWindowManager::winCreateLayout BlankWindow archive parse\",\"Shell::hideShell\",\"Win32BIGFileSystem MapsZH.big map archive\",\"Win32BIGFileSystem INIZH.big and INI.big startup data archives\",\"INI::load Default/GameData.ini, GameData.ini, Multiplayer.ini, Science.ini, AIData.ini, and PlayerTemplate.ini\",\"GlobalData::parseGameDataDefinition production partition cell size\",\"WeaponBonusSet::parseWeaponBonusSetPtr GameData parser\",\"MultiplayerSettings shipped color table\",\"ScienceStore shipped science table\",\"AI shipped AIData table\",\"PlayerTemplateStore shipped player templates\",\"W3DTerrainLogic::loadMap(false) MD_GLA03 map parse\",\"TerrainLogic::loadMap TerrainVisual::load handoff\",\"WorldHeightMap logical map-object list\",\"SidesList::ParseSidesDataChunk\",\"SidesList::validateSides\",\"AIPlayer construction for non-human sides\",\"TeamFactory::reset/initFromSides\",\"PlayerList::newGame side population\",\"ScriptEngine::newMap side script scan\",\"Radar::newMap terrain extent and LeftHUD ownership\",\"GameLogic width/height from terrain extent\",\"PartitionManager::init loaded-map cell grid\",\"PartitionManager::refreshShroudForLocalPlayer display/radar shroud refresh\",\"GhostObjectManager local-player index and reset\",\"TerrainTypeCollection empty texture-class lookup for render heightmap parsing\",\"TerrainRoadCollection empty road table for W3DTerrainLogic::newMap road-buffer handoff\",\"WW3D browser D3D8 device and terrain-adjacent vertex/index buffers\",\"W3DTerrainLogic::newMap road-buffer handoff and TerrainLogic waypoint/water setup\",\"W3DBridgeBuffer::loadBridges empty MD_GLA03 bridge scan\",\"GameLogic bridge-like map-object scan ordered after terrain newMap\",\"Radar::refreshTerrain after bridge-like map-object scan\",\"Pathfinder::newMap terrain grid allocation/classification ordered after bridge-like scan\"],"
		<< "\"nextRequired\":\"load real object templates into gamelogic-new-game-dispatch-smoke and promote the bridge-like map-object creation branch when a map supplies bridge or walk-on-wall templates, then continue the original ordered startNewGame sequence beyond Pathfinder::newMap\"}"
		<< "\n";

	return 0;
}
