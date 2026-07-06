#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <string>
#include <vector>

#ifndef __PRERTS_H__
#define __PRERTS_H__
#endif

#include "windows.h"
#include "mmsystem.h"
#include "wwvegas_port.h"
#include "Common/ArchiveFileSystem.h"
#include "Common/AudioHandleSpecialValues.h"
#include "Common/DataChunk.h"
#include "Common/Errors.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameAudio.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/DrawModule.h"
#include "Common/INI.h"
#include "Common/INIException.h"
#include "Common/LocalFileSystem.h"
#include "Common/MapReaderWriterInfo.h"
#include "Common/ModuleFactory.h"
#include "Common/NameKeyGenerator.h"
#include "Common/Player.h"
#include "Common/PlayerList.h"
#include "Common/Radar.h"
#include "Common/ThingFactory.h"
#include "Common/ThingTemplate.h"
#include "Common/TerrainTypes.h"
#include "Common/DamageFX.h"
#include "GameLogic/AI.h"
#include "GameLogic/AIPathfind.h"
#include "GameLogic/Armor.h"
#include "GameLogic/Damage.h"
#include "GameLogic/GameLogic.h"
#include "GameLogic/Module/ActiveBody.h"
#include "GameLogic/Module/BridgeBehavior.h"
#include "GameLogic/Module/BridgeScaffoldBehavior.h"
#include "GameLogic/Module/BridgeTowerBehavior.h"
#include "GameLogic/Module/ImmortalBody.h"
#include "GameLogic/GhostObject.h"
#include "GameLogic/PartitionManager.h"
#include "GameLogic/ScriptEngine.h"
#include "GameLogic/PolygonTrigger.h"
#include "GameLogic/SidesList.h"
#include "GameLogic/Scripts.h"
#include "GameLogic/TerrainLogic.h"
#include "GameClient/DisplayStringManager.h"
#include "GameClient/Drawable.h"
#include "GameClient/FXList.h"
#include "GameClient/GameClient.h"
#include "GameClient/GameFont.h"
#include "GameClient/GlobalLanguage.h"
#include "GameClient/MapUtil.h"
#include "GameClient/TerrainRoads.h"
#include "GameClient/View.h"
#include "GameClient/Water.h"
#include "W3DDevice/GameClient/BaseHeightMap.h"
#include "W3DDevice/GameClient/HeightMap.h"
#include "W3DDevice/GameClient/W3DAssetManager.h"
#include "W3DDevice/GameClient/W3DPropBuffer.h"
#include "W3DDevice/GameClient/W3DBibBuffer.h"
#include "W3DDevice/GameClient/W3DBridgeBuffer.h"
#include "W3DDevice/GameClient/W3DDisplay.h"
#include "W3DDevice/GameClient/W3DRoadBuffer.h"
#include "W3DDevice/GameClient/W3DScene.h"
#include "W3DDevice/GameClient/W3DShaderManager.h"
#include "W3DDevice/GameClient/W3DShroud.h"
#include "W3DDevice/GameClient/TileData.h"
#include "W3DDevice/GameClient/W3DTreeBuffer.h"
#include "W3DDevice/GameClient/Module/W3DTreeDraw.h"
#include "W3DDevice/GameClient/W3DTerrainBackground.h"
#include "W3DDevice/GameClient/W3DTerrainVisual.h"
#include "W3DDevice/GameLogic/W3DTerrainLogic.h"
#include "W3DDevice/GameClient/WorldHeightMap.h"
#include "assetmgr.h"
#include "camera.h"
#include "coltype.h"
#include "dx8fvf.h"
#include "dx8wrapper.h"
#include "mesh.h"
#include "meshmdl.h"
#include "rinfo.h"
#include "shader.h"
#include "vertmaterial.h"
#include "wasm_browser_runtime_assets.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "WWLIB/ffactory.h"
#include "ww3d.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

extern "C" std::size_t cnc_port_real_ini_runtime_sizeof_ini();
extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps();
extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps_percent();
extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps_colon();
extern "C" std::size_t cnc_port_real_ini_runtime_offset_m_seps_quote();
extern "C" const char *cnc_port_real_ini_runtime_seps();
extern "C" const char *cnc_port_real_ini_runtime_seps_percent();
extern "C" const char *cnc_port_real_ini_runtime_seps_colon();
extern "C" const char *cnc_port_real_ini_runtime_seps_quote();

static bool g_ww3d_terrain_probe_shroud_enabled = false;

extern "C" bool cnc_port_terrain_probe_shroud_enabled(void)
{
	return g_ww3d_terrain_probe_shroud_enabled;
}

// Radar base-class implementations now come from the real
// GameEngine/Source/Common/System/Radar.cpp linked through
// zh_gameengine_real_object_ini_runtime.

// GameClient base-class implementations now come from the real
// GameEngine/Source/GameClient/GameClient.cpp linked through
// zh_gameengine_real_lifecycle_runtime.

// ThingFactory implementations now come from the real
// GameEngine/Source/Common/Thing/ThingFactory.cpp linked through
// zh_gameengine_real_object_ini_runtime.

namespace {

std::string g_ww3d_terrain_tile_probe_json;
std::string g_ww3d_terrain_tile_archive_probe_json;
std::string g_ww3d_terrain_tile_archive_scene_probe_json;
std::string g_ww3d_terrain_map_patch_scene_probe_json;
std::string g_ww3d_terrain_shroud_scene_probe_json;
std::string g_ww3d_terrain_visual_scene_probe_json;
std::string g_ww3d_terrain_visual_shroud_scene_probe_json;
std::string g_ww3d_terrain_visual_shroud_update_scene_probe_json;
std::string g_ww3d_terrain_full_scene_probe_json;
std::string g_ww3d_terrain_full_scene_shroud_update_probe_json;
std::string g_ww3d_terrain_visual_load_window_scene_probe_json;
std::string g_ww3d_terrain_visual_camera_pan_scene_probe_json;
std::string g_ww3d_terrain_bib_buffer_lifecycle_probe_json;
std::string g_ww3d_terrain_prop_buffer_render_probe_json;
std::string g_ww3d_terrain_prop_buffer_scene_probe_json;
std::string g_ww3d_terrain_tree_buffer_scene_probe_json;
std::string g_ww3d_terrain_road_buffer_scene_probe_json;
std::string g_ww3d_terrain_bridge_buffer_scene_probe_json;
std::string g_ww3d_shader_manager_probe_json;

constexpr int kMapCells = 16;
constexpr int kMapVertices = kMapCells + 1;
constexpr int kMapPatchCells = 32;
constexpr int kMapPatchVertices = kMapPatchCells + 1;
constexpr int kProbeDrawableHashSize = 8192;
constexpr int kViewportWidth = 800;
constexpr int kViewportHeight = 600;
constexpr unsigned int kExpectedFlatTextureSize = kMapCells * 8;
constexpr unsigned int kMapPatchExpectedFlatTextureSize = kMapPatchCells * 8;
constexpr const char *kArchiveTerrainTileEntry = "Art\\Terrain\\PTBlossom01.tga";
constexpr const char *kArchiveTerrainMapEntry = "Maps\\MD_GLA03\\MD_GLA03.map";
constexpr const char *kArchiveRoadTerrainMapEntry = "Maps\\MD_CHI01\\MD_CHI01.map";
constexpr const char *kArchiveBridgeTerrainMapEntry = "Maps\\MD_CHI01\\MD_CHI01.map";
constexpr const char *kArchiveDefaultTerrainIniEntry = "Data\\INI\\Default\\Terrain.ini";
constexpr const char *kArchiveTerrainIniEntry = "Data\\INI\\Terrain.ini";
constexpr const char *kArchiveWaterIniEntry = "Data\\INI\\Water.ini";
constexpr const char *kArchiveDefaultRoadsIniEntry = "Data\\INI\\Default\\Roads.ini";
constexpr const char *kArchiveRoadsIniEntry = "Data\\INI\\Roads.ini";
constexpr const char *kArchiveArmorIniEntry = "Data\\INI\\Armor.ini";
constexpr const char *kArchiveDamageFXIniEntry = "Data\\INI\\DamageFX.ini";
constexpr const char *kArchiveObjectIniDirectory = "Data\\INI\\Object\\";
constexpr const char *kProbeGenericBridgeIniEntry = "__wasm_generic_bridge_probe.ini";
constexpr const char *kPropModelName = "CINE_MOON";
constexpr const char *kPropMeshArchiveEntry = "art\\w3d\\cine_moon.w3d";
constexpr const char *kPropTextureArchiveEntry = "art\\textures\\cine_moon.dds";
constexpr Int kPropProbeId = 77;
constexpr const char *kTreeModelName = "PTDogwod01_S";
constexpr const char *kTreeTextureName = "PTDogwod01_S.tga";
constexpr const char *kTreeModelsArchiveEntry = "Art\\W3D\\Models.txt";
constexpr const char *kTreeMeshArchiveEntry = "Art\\W3D\\PTDogwod01_S.W3D";
constexpr const char *kTreeTextureArchiveEntry = "Art\\Terrain\\PTDogwod01_S.tga";
constexpr const char *kTreeMaterialTextureArchiveEntry = "Art\\Textures\\ptdogwod01_s.dds";
constexpr const char *kTreeVertexShaderArchiveEntry = "Shaders\\Trees.vso";
constexpr const char *kTreePixelShaderArchiveEntry = "Shaders\\Trees.pso";
constexpr DrawableID kTreeProbeId = static_cast<DrawableID>(91);
constexpr int kTextureClassDiagnosticsLimit = 6;

bool succeeded(int result)
{
	return result == WW3D_ERROR_OK;
}

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

class ProbeTerrainDrawableFontLibrary final : public FontLibrary
{
protected:
	Bool loadFontData(GameFont *font) override
	{
		if (font == nullptr) {
			return FALSE;
		}
		font->height = font->pointSize;
		font->fontData = nullptr;
		return TRUE;
	}
};

class ProbeTerrainDrawableDisplayString final : public DisplayString
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(
		ProbeTerrainDrawableDisplayString,
		"ProbeTerrainDrawableDisplayString",
		1,
		1)

public:
	void setWordWrap(Int wordWrap) override { m_wordWrap = wordWrap; }
	void setWordWrapCentered(Bool isCentered) override { m_wordWrapCentered = isCentered; }
	void draw(Int, Int, Color, Color) override {}
	void draw(Int, Int, Color, Color, Int, Int) override {}
	void getSize(Int *width, Int *height) override
	{
		if (width != nullptr) {
			*width = getWidth();
		}
		if (height != nullptr) {
			*height = m_font != nullptr ? m_font->height : 0;
		}
	}
	Int getWidth(Int charPos = -1) override
	{
		const Int text_length = m_textString.getLength();
		const Int chars = charPos >= 0 && charPos < text_length ? charPos : text_length;
		return chars * 8;
	}
	void setUseHotkey(Bool, Color) override {}

private:
	Int m_wordWrap = 0;
	Bool m_wordWrapCentered = FALSE;
};

EMPTY_DTOR(ProbeTerrainDrawableDisplayString)

class ProbeTerrainDrawableDisplayStringManager final : public DisplayStringManager
{
public:
	DisplayString *newDisplayString() override
	{
		DisplayString *string = newInstance(ProbeTerrainDrawableDisplayString);
		link(string);
		return string;
	}

	void freeDisplayString(DisplayString *string) override
	{
		if (string == nullptr) {
			return;
		}
		unLink(string);
		string->deleteInstance();
	}

	DisplayString *getGroupNumeralString(Int) override { return newDisplayString(); }
	DisplayString *getFormationLetterString() override { return newDisplayString(); }
};

class ProbeTerrainLogicGameClient final : public GameClient
{
public:
	void resetProbeState()
	{
		m_drawableList = nullptr;
		m_drawableVector.clear();
		m_drawableVector.resize(kProbeDrawableHashSize, nullptr);
		m_nextDrawableID = static_cast<DrawableID>(1);
		m_frame = 0;
		m_timeOfDayNotified = false;
		m_timeOfDay = TIME_OF_DAY_INVALID;
	}

	void init() override {}
	void update() override {}
	void reset() override {}
	void setFrame(UnsignedInt frame) override { m_frame = frame; }
	void registerDrawable(Drawable *draw) override { GameClient::registerDrawable(draw); }
	Drawable *findDrawableByID(const DrawableID id) override { return GameClient::findDrawableByID(id); }
	Drawable *firstDrawable() override { return GameClient::firstDrawable(); }
	GameMessage::Type evaluateContextCommand(
		Drawable *,
		const Coord3D *,
		CommandTranslator::CommandEvaluateType) override
	{
		return GameMessage::MSG_INVALID;
	}
	void removeFromRayEffects(Drawable *) override {}
	void getRayEffectData(Drawable *, RayEffectData *) override {}
	void createRayEffectByTemplate(const Coord3D *, const Coord3D *, const ThingTemplate *) override {}
	void addScorch(const Coord3D *, Real, Scorches) override {}
	Bool loadMap(AsciiString) override { return FALSE; }
	void unloadMap(AsciiString) override {}
	void iterateDrawablesInRegion(Region3D *, GameClientFuncPtr, void *) override {}
	Drawable *friend_createDrawable(const ThingTemplate *thing, DrawableStatus statusBits) override
	{
		if (thing == nullptr) {
			return nullptr;
		}
		return newInstance(Drawable)(thing, statusBits);
	}
	void destroyDrawable(Drawable *draw) override
	{
		if (draw == nullptr) {
			return;
		}
		draw->removeFromList(&m_drawableList);
		Object *object = draw->getObject();
		if (object != nullptr && object->getDrawable() == draw) {
			object->friend_bindToDrawable(nullptr);
		}
		removeDrawableFromLookupTable(draw);
		draw->deleteInstance();
	}
	void setTimeOfDay(TimeOfDay tod) override
	{
		m_timeOfDayNotified = true;
		m_timeOfDay = tod;
	}
	void selectDrawablesInGroup(Int) override {}
	void assignSelectedDrawablesToGroup(Int) override {}
	UnsignedInt getFrame() override { return m_frame; }
	void setTeamColor(Int, Int, Int) override {}
	void adjustLOD(Int) override {}
	void releaseShadows() override {}
	void allocateShadows() override {}
	void preloadAssets(TimeOfDay) override {}
	Drawable *getDrawableList() override { return GameClient::getDrawableList(); }
	void notifyTerrainObjectMoved(Object *) override {}

	bool timeOfDayNotified() const { return m_timeOfDayNotified; }
	TimeOfDay notifiedTimeOfDay() const { return m_timeOfDay; }
	UnsignedInt drawableCountForProbe() const
	{
		UnsignedInt count = 0;
		for (Drawable *draw = m_drawableList; draw != nullptr; draw = draw->getNextDrawable()) {
			++count;
		}
		return count;
	}

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

	bool m_timeOfDayNotified = false;
	TimeOfDay m_timeOfDay = TIME_OF_DAY_INVALID;
};

ProbeTerrainLogicGameClient &shared_probe_terrain_logic_game_client()
{
	alignas(ProbeTerrainLogicGameClient) static unsigned char storage[sizeof(ProbeTerrainLogicGameClient)];
	static ProbeTerrainLogicGameClient *game_client =
		new (storage) ProbeTerrainLogicGameClient();
	return *game_client;
}

struct ProbeLogicalTerrainLoadMetrics
{
	bool attempted = false;
	bool mapCacheInstalled = false;
	bool terrainLogicInstalled = false;
	bool gameClientInstalled = false;
	bool thingFactoryInstalled = false;
	bool scriptEngineInstalled = false;
	bool logicalHeightMapPreflightAttempted = false;
	bool logicalHeightMapPreflightStreamOpen = false;
	bool logicalHeightMapPreflightReturned = false;
	bool logicalHeightMapPreflightException = false;
	bool logicalHeightMapParsedHeightMap = false;
	bool logicalHeightMapParsedWorldInfo = false;
	bool logicalHeightMapParsedObjects = false;
	bool logicalHeightMapParsedPolygonTriggers = false;
	bool logicalHeightMapParsedSides = false;
	bool loadReturned = false;
	bool loadException = false;
	bool sourceFilenameMatches = false;
	bool extentMatchesVisual = false;
	bool heightRangeMatchesVisual = false;
	bool timeOfDayNotified = false;
	bool mapObjectsPresentAfterLoad = false;
	bool firstWaypointPresent = false;
	Int mapDx = 0;
	Int mapDy = 0;
	float extentHiX = 0.0f;
	float extentHiY = 0.0f;
	float extentLoZ = 0.0f;
	float extentHiZ = 0.0f;
	float expectedExtentHiX = 0.0f;
	float expectedExtentHiY = 0.0f;
	float expectedMinZ = 0.0f;
	float expectedMaxZ = 0.0f;
	TimeOfDay mapTimeOfDay = TIME_OF_DAY_INVALID;
	TimeOfDay notifiedTimeOfDay = TIME_OF_DAY_INVALID;
	Int mapObjectCount = 0;
	Int waypointCount = 0;
	Int logicalHeightMapPreflightError = 0;
	Int loadError = 0;
	std::string sourceFilename;
	std::string failurePhase;
	std::string logicalHeightMapFailedParser;
};

struct ProbePartitionShroudRefreshMetrics
{
	bool requested = false;
	bool terrainLogicInstalled = false;
	bool partitionCreated = false;
	bool partitionInstalled = false;
	bool partitionInitInvoked = false;
	bool partitionCellsReady = false;
	bool displayInstalled = false;
	bool radarInstalled = false;
	bool playerListInstalled = false;
	bool revealInvoked = false;
	bool refreshInvoked = false;
	bool samplePrepared = false;
	bool sampleChanged = false;
	bool displaySampleTouched = false;
	bool radarSampleTouched = false;
	bool renderInvoked = false;
	bool logicalTerrainExtentSourceApplied = false;
	Int cellCountX = 0;
	Int cellCountY = 0;
	Int totalCells = 0;
	Int expectedCellCountX = 0;
	Int expectedCellCountY = 0;
	Int fullCellCountX = 0;
	Int fullCellCountY = 0;
	Int sampleX = -1;
	Int sampleY = -1;
	Int status = CELLSHROUD_SHROUDED;
	Int expectedLevel = -1;
	Int sampleBefore = -1;
	Int sampleAfter = -1;
	Int revealDisplaySetCalls = 0;
	Int revealRadarSetCalls = 0;
	Int displayClearCalls = 0;
	Int radarClearCalls = 0;
	Int displaySetCalls = 0;
	Int radarSetCalls = 0;
	Int displayShroudedSetCalls = 0;
	Int displayFoggedSetCalls = 0;
	Int displayClearSetCalls = 0;
	Int radarShroudedSetCalls = 0;
	Int radarFoggedSetCalls = 0;
	Int radarClearSetCalls = 0;
	Int beginRender = WW3D_ERROR_GENERIC;
	Int render = WW3D_ERROR_GENERIC;
	Int endRender = WW3D_ERROR_GENERIC;
	Real partitionCellSize = 0.0f;
	Real sourcePartitionCellSize = 0.0f;
	Real terrainExtentHiX = 0.0f;
	Real terrainExtentHiY = 0.0f;
	Real fullTerrainExtentHiX = 0.0f;
	Real fullTerrainExtentHiY = 0.0f;
	UnsignedInt drawIndexed = 0;
	UnsignedInt clear = 0;
	UnsignedInt textureUpdate = 0;
};

class ProbeINILayoutView final : public INI
{
public:
	static std::size_t offsetOfSeps()
	{
		ProbeINILayoutView ini;
		return memberOffset(ini, ini.m_seps);
	}

	static std::size_t offsetOfSepsPercent()
	{
		ProbeINILayoutView ini;
		return memberOffset(ini, ini.m_sepsPercent);
	}

	static std::size_t offsetOfSepsColon()
	{
		ProbeINILayoutView ini;
		return memberOffset(ini, ini.m_sepsColon);
	}

	static std::size_t offsetOfSepsQuote()
	{
		ProbeINILayoutView ini;
		return memberOffset(ini, ini.m_sepsQuote);
	}

	static const char *seps()
	{
		static ProbeINILayoutView ini;
		return ini.getSeps();
	}

	static const char *sepsPercent()
	{
		static ProbeINILayoutView ini;
		return ini.getSepsPercent();
	}

	static const char *sepsColon()
	{
		static ProbeINILayoutView ini;
		return ini.getSepsColon();
	}

	static const char *sepsQuote()
	{
		static ProbeINILayoutView ini;
		return ini.getSepsQuote();
	}

private:
	static std::size_t memberOffset(const ProbeINILayoutView &ini, const char *const &member)
	{
		const auto *base = reinterpret_cast<const unsigned char *>(static_cast<const INI *>(&ini));
		const auto *field = reinterpret_cast<const unsigned char *>(&member);
		return static_cast<std::size_t>(field - base);
	}
};

struct IniLayoutComparison
{
	std::size_t probeSize = 0;
	std::size_t runtimeSize = 0;
	std::size_t probeSepsOffset = 0;
	std::size_t runtimeSepsOffset = 0;
	std::size_t probeSepsPercentOffset = 0;
	std::size_t runtimeSepsPercentOffset = 0;
	std::size_t probeSepsColonOffset = 0;
	std::size_t runtimeSepsColonOffset = 0;
	std::size_t probeSepsQuoteOffset = 0;
	std::size_t runtimeSepsQuoteOffset = 0;
	const char *probeSeps = nullptr;
	const char *runtimeSeps = nullptr;
	const char *probeSepsPercent = nullptr;
	const char *runtimeSepsPercent = nullptr;
	const char *probeSepsColon = nullptr;
	const char *runtimeSepsColon = nullptr;
	const char *probeSepsQuote = nullptr;
	const char *runtimeSepsQuote = nullptr;
	bool matches = false;
};

IniLayoutComparison compare_ini_layout()
{
	IniLayoutComparison layout;
	layout.probeSize = sizeof(INI);
	layout.runtimeSize = cnc_port_real_ini_runtime_sizeof_ini();
	layout.probeSepsOffset = ProbeINILayoutView::offsetOfSeps();
	layout.runtimeSepsOffset = cnc_port_real_ini_runtime_offset_m_seps();
	layout.probeSepsPercentOffset = ProbeINILayoutView::offsetOfSepsPercent();
	layout.runtimeSepsPercentOffset = cnc_port_real_ini_runtime_offset_m_seps_percent();
	layout.probeSepsColonOffset = ProbeINILayoutView::offsetOfSepsColon();
	layout.runtimeSepsColonOffset = cnc_port_real_ini_runtime_offset_m_seps_colon();
	layout.probeSepsQuoteOffset = ProbeINILayoutView::offsetOfSepsQuote();
	layout.runtimeSepsQuoteOffset = cnc_port_real_ini_runtime_offset_m_seps_quote();
	layout.probeSeps = ProbeINILayoutView::seps();
	layout.runtimeSeps = cnc_port_real_ini_runtime_seps();
	layout.probeSepsPercent = ProbeINILayoutView::sepsPercent();
	layout.runtimeSepsPercent = cnc_port_real_ini_runtime_seps_percent();
	layout.probeSepsColon = ProbeINILayoutView::sepsColon();
	layout.runtimeSepsColon = cnc_port_real_ini_runtime_seps_colon();
	layout.probeSepsQuote = ProbeINILayoutView::sepsQuote();
	layout.runtimeSepsQuote = cnc_port_real_ini_runtime_seps_quote();
	layout.matches =
		layout.probeSize == layout.runtimeSize &&
		layout.probeSepsOffset == layout.runtimeSepsOffset &&
		layout.probeSepsPercentOffset == layout.runtimeSepsPercentOffset &&
		layout.probeSepsColonOffset == layout.runtimeSepsColonOffset &&
		layout.probeSepsQuoteOffset == layout.runtimeSepsQuoteOffset &&
		std::strcmp(layout.probeSeps, layout.runtimeSeps) == 0 &&
		std::strcmp(layout.probeSepsPercent, layout.runtimeSepsPercent) == 0 &&
		std::strcmp(layout.probeSepsColon, layout.runtimeSepsColon) == 0 &&
		std::strcmp(layout.probeSepsQuote, layout.runtimeSepsQuote) == 0;
	return layout;
}

std::string json_string(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size() + 2);
	escaped.push_back('"');
	for (char ch : value) {
		switch (ch) {
			case '\\':
				escaped += "\\\\";
				break;
			case '"':
				escaped += "\\\"";
				break;
			case '\n':
				escaped += "\\n";
				break;
			case '\r':
				escaped += "\\r";
				break;
			case '\t':
				escaped += "\\t";
				break;
			default:
				escaped.push_back(ch);
				break;
		}
	}
	escaped.push_back('"');
	return escaped;
}

std::string ini_layout_json(const IniLayoutComparison &layout)
{
	char buffer[2048];
	const std::string probe_seps_json = json_string(layout.probeSeps != nullptr ? layout.probeSeps : "");
	const std::string runtime_seps_json = json_string(layout.runtimeSeps != nullptr ? layout.runtimeSeps : "");
	const std::string probe_seps_percent_json =
		json_string(layout.probeSepsPercent != nullptr ? layout.probeSepsPercent : "");
	const std::string runtime_seps_percent_json =
		json_string(layout.runtimeSepsPercent != nullptr ? layout.runtimeSepsPercent : "");
	const std::string probe_seps_colon_json =
		json_string(layout.probeSepsColon != nullptr ? layout.probeSepsColon : "");
	const std::string runtime_seps_colon_json =
		json_string(layout.runtimeSepsColon != nullptr ? layout.runtimeSepsColon : "");
	const std::string probe_seps_quote_json =
		json_string(layout.probeSepsQuote != nullptr ? layout.probeSepsQuote : "");
	const std::string runtime_seps_quote_json =
		json_string(layout.runtimeSepsQuote != nullptr ? layout.runtimeSepsQuote : "");
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"terrain-probe-tu-vs-real-ini-runtime\","
		"\"matches\":%s,"
		"\"probe\":{\"sizeofINI\":%lu,"
		"\"offsets\":{\"m_seps\":%lu,\"m_sepsPercent\":%lu,"
		"\"m_sepsColon\":%lu,\"m_sepsQuote\":%lu},"
		"\"separators\":{\"seps\":%s,\"sepsPercent\":%s,"
		"\"sepsColon\":%s,\"sepsQuote\":%s}},"
		"\"runtime\":{\"sizeofINI\":%lu,"
		"\"offsets\":{\"m_seps\":%lu,\"m_sepsPercent\":%lu,"
		"\"m_sepsColon\":%lu,\"m_sepsQuote\":%lu},"
		"\"separators\":{\"seps\":%s,\"sepsPercent\":%s,"
		"\"sepsColon\":%s,\"sepsQuote\":%s}}}",
		bool_json(layout.matches),
		static_cast<unsigned long>(layout.probeSize),
		static_cast<unsigned long>(layout.probeSepsOffset),
		static_cast<unsigned long>(layout.probeSepsPercentOffset),
		static_cast<unsigned long>(layout.probeSepsColonOffset),
		static_cast<unsigned long>(layout.probeSepsQuoteOffset),
		probe_seps_json.c_str(),
		probe_seps_percent_json.c_str(),
		probe_seps_colon_json.c_str(),
		probe_seps_quote_json.c_str(),
		static_cast<unsigned long>(layout.runtimeSize),
		static_cast<unsigned long>(layout.runtimeSepsOffset),
		static_cast<unsigned long>(layout.runtimeSepsPercentOffset),
		static_cast<unsigned long>(layout.runtimeSepsColonOffset),
		static_cast<unsigned long>(layout.runtimeSepsQuoteOffset),
		runtime_seps_json.c_str(),
		runtime_seps_percent_json.c_str(),
		runtime_seps_colon_json.c_str(),
		runtime_seps_quote_json.c_str());
	return buffer;
}

void split_archive_path_for_probe(
	const std::string &archive_path,
	std::string &directory,
	std::string &file_mask)
{
	std::string normalized = archive_path;
	std::replace(normalized.begin(), normalized.end(), '\\', '/');

	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory.clear();
		file_mask = normalized;
		return;
	}

	directory = normalized.substr(0, slash + 1);
	file_mask = normalized.substr(slash + 1);
}

unsigned long checksum_bytes(const UnsignedByte *bytes, std::size_t size)
{
	unsigned long checksum = 2166136261UL;
	for (std::size_t index = 0; index < size; ++index) {
		checksum ^= bytes[index];
		checksum *= 16777619UL;
	}
	return checksum;
}

class ProbeFileInputStream : public InputStream
{
public:
	explicit ProbeFileInputStream(File *file) : m_file(file) {}

	Int read(void *data, Int num_bytes) override
	{
		return m_file != nullptr ? m_file->read(data, num_bytes) : 0;
	}

private:
	File *m_file;
};

struct ProbeTerrainArchiveTileLoad
{
	bool attempted = false;
	bool argumentSupplied = false;
	bool archiveLoaded = false;
	bool entryExists = false;
	bool entryOpenable = false;
	bool countTilesOk = false;
	bool readTilesOk = false;
	Int countedTiles = 0;
	Int readRows = 1;
	std::string archivePath;
	std::string archiveDirectory;
	std::string archiveMask;
	UnsignedByte firstPixelB = 0;
	UnsignedByte firstPixelG = 0;
	UnsignedByte firstPixelR = 0;
	UnsignedByte firstPixelA = 0;
	unsigned long tileChecksum = 0;
	TileData *tile = nullptr;
};

struct ProbeTerrainMapPatchLoad
{
	bool attempted = false;
	bool iniArgumentSupplied = false;
	bool mapsArgumentSupplied = false;
	bool terrainArgumentSupplied = false;
	bool iniArchiveLoaded = false;
	bool mapsArchiveLoaded = false;
	bool terrainArchiveLoaded = false;
	bool defaultTerrainIniExists = false;
	bool defaultTerrainIniParsed = false;
	bool terrainIniExists = false;
	bool terrainIniParsed = false;
	bool defaultRoadsIniExists = false;
	bool defaultRoadsIniParsed = false;
	bool roadsIniExists = false;
	bool roadsIniParsed = false;
	bool nameKeysReady = false;
	bool sidesListReady = false;
	bool mapEntryExists = false;
	bool mapEntryOpenable = false;
	bool mapStreamOpen = false;
	bool mapParsed = false;
	bool mapParseException = false;
	std::string iniArchivePath;
	std::string iniArchiveDirectory;
	std::string iniArchiveMask;
	std::string mapsArchivePath;
	std::string mapsArchiveDirectory;
	std::string mapsArchiveMask;
	std::string terrainArchivePath;
	std::string terrainArchiveDirectory;
	std::string terrainArchiveMask;
	std::size_t terrainTypeCount = 0;
	std::size_t terrainRoadCount = 0;
	std::size_t terrainBridgeCount = 0;
	Int mapBytes = 0;
	Int width = 0;
	Int height = 0;
	Int border = 0;
	Int drawWidth = 0;
	Int drawHeight = 0;
	Int patchOriginX = 0;
	Int patchOriginY = 0;
	Int patchCells = kMapPatchCells;
	UnsignedByte firstHeight = 0;
	UnsignedByte patchCenterHeight = 0;
	unsigned long heightChecksum = 0;
	unsigned long patchHeightChecksum = 0;
	Int bitmapTileCount = 0;
	Int textureClassCount = 0;
	Int sourceTilesLoaded = 0;
	Int sourceTilesPositioned = 0;
	Int patchTileCells = 0;
	Int patchTilesWithSource = 0;
	Int patchTilesMissingSource = 0;
	Int firstPatchTileIndex = -1;
	Int firstPatchBaseTileIndex = -1;
	Int firstPatchTextureClass = -1;
	Int firstPatchTileTextureX = 0;
	Int firstPatchTileTextureY = 0;
	bool firstPatchSourceTileLoaded = false;
	std::string firstPatchTextureClassName;
	std::string textureClassesJson = "[]";
	WorldHeightMap *map = nullptr;
};

TileData *load_archive_terrain_tile(const char *terrain_archive_path, ProbeTerrainArchiveTileLoad &load)
{
	load.attempted = true;
	load.argumentSupplied = terrain_archive_path != nullptr && terrain_archive_path[0] != '\0';
	if (!load.argumentSupplied) {
		return nullptr;
	}

	load.archivePath = terrain_archive_path;
	split_archive_path_for_probe(load.archivePath, load.archiveDirectory, load.archiveMask);
	if (load.archiveMask.empty()) {
		return nullptr;
	}

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	FileSystem *old_file_system = TheFileSystem;

	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;
	local_file_system.init();
	archive_file_system.init();
	file_system.init();

	load.archiveLoaded = archive_file_system.loadBigFilesFromDirectory(
		AsciiString(load.archiveDirectory.c_str()),
		AsciiString(load.archiveMask.c_str()),
		TRUE);
	load.entryExists =
		load.archiveLoaded &&
		TheFileSystem != nullptr &&
		TheFileSystem->doesFileExist(kArchiveTerrainTileEntry);

	if (load.entryExists) {
		File *file = TheFileSystem->openFile(kArchiveTerrainTileEntry, File::READ | File::BINARY);
		load.entryOpenable = file != nullptr;
		if (file != nullptr) {
			ProbeFileInputStream stream(file);
			load.countedTiles = WorldHeightMap::countTiles(&stream);
			load.countTilesOk = load.countedTiles >= 1;
			file->seek(0, File::START);
			TileData *tiles[1] = { nullptr };
			load.readTilesOk = WorldHeightMap::readTiles(&stream, tiles, load.readRows);
			load.tile = tiles[0];
			if (load.readTilesOk && load.tile != nullptr) {
				const UnsignedByte *pixel = load.tile->getDataPtr();
				load.firstPixelB = pixel[0];
				load.firstPixelG = pixel[1];
				load.firstPixelR = pixel[2];
				load.firstPixelA = pixel[3];
				load.tileChecksum = checksum_bytes(
					load.tile->getDataPtr(),
					TILE_PIXEL_EXTENT * TILE_PIXEL_EXTENT * TILE_BYTES_PER_PIXEL);
			}
			file->close();
		}
	}

	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;
	return load.tile;
}

Bool load_big_archive_path(Win32BIGFileSystem &archive_file_system, const std::string &archive_path, std::string &directory, std::string &mask)
{
	split_archive_path_for_probe(archive_path, directory, mask);
	if (mask.empty()) {
		return FALSE;
	}
	return archive_file_system.loadBigFilesFromDirectory(
		AsciiString(directory.c_str()),
		AsciiString(mask.c_str()),
		TRUE);
}

std::size_t probe_line_content_end(const std::string &text, std::size_t line_start, std::size_t line_end)
{
	while (line_end > line_start &&
			(text[line_end - 1] == '\n' || text[line_end - 1] == '\r')) {
		--line_end;
	}
	return line_end;
}

std::size_t probe_next_line_start(const std::string &text, std::size_t line_start)
{
	const std::size_t newline = text.find('\n', line_start);
	return newline == std::string::npos ? text.size() : newline + 1;
}

bool probe_read_archive_text(FileSystem *file_system, const char *path, std::string &text)
{
	if (file_system == nullptr || path == nullptr || path[0] == '\0') {
		return false;
	}

	FileInfo file_info = {};
	if (!file_system->getFileInfo(AsciiString(path), &file_info) ||
			file_info.sizeHigh != 0 ||
			file_info.sizeLow <= 0) {
		return false;
	}

	File *file = file_system->openFile(path, File::READ | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	std::vector<char> bytes(static_cast<std::size_t>(file_info.sizeLow));
	const Int bytes_read = file->read(bytes.data(), file_info.sizeLow);
	file->close();
	if (bytes_read != file_info.sizeLow) {
		return false;
	}

	text.assign(bytes.begin(), bytes.end());
	return true;
}

bool probe_write_ini_file(const char *path, const std::string &text)
{
	if (TheFileSystem == nullptr || path == nullptr || path[0] == '\0') {
		return false;
	}

	File *file = TheFileSystem->openFile(
		path,
		File::WRITE | File::CREATE | File::TRUNCATE | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	const Int bytes_written = file->write(text.data(), static_cast<Int>(text.size()));
	file->close();
	return bytes_written == static_cast<Int>(text.size());
}

__attribute__((noinline, used))
void probe_keep_original_ini_object_parsers_linked(
	INIBlockParse parse_object,
	INIBlockParse parse_object_reskin)
{
	if (parse_object == nullptr || parse_object_reskin == nullptr) {
		std::abort();
	}
}

bool probe_line_matches_top_level_header(
	const std::string &text,
	std::size_t line_start,
	std::size_t line_end,
	const char *header)
{
	if (line_start >= line_end || text[line_start] == ' ' || text[line_start] == '\t') {
		return false;
	}

	const std::size_t header_len = std::strlen(header);
	if (line_end - line_start < header_len ||
			text.compare(line_start, header_len, header) != 0) {
		return false;
	}

	if (line_end - line_start == header_len) {
		return true;
	}

	const char next = text[line_start + header_len];
	return next == ' ' || next == '\t' || next == ';';
}

bool probe_append_top_level_object_block(
	const std::string &source,
	const char *object_name,
	std::string &destination)
{
	const std::string header = std::string("Object ") + object_name;

	for (std::size_t line_start = 0; line_start < source.size();
			line_start = probe_next_line_start(source, line_start)) {
		const std::size_t line_end = probe_next_line_start(source, line_start);
		const std::size_t content_end = probe_line_content_end(source, line_start, line_end);
		if (!probe_line_matches_top_level_header(source, line_start, content_end, header.c_str())) {
			continue;
		}

		std::size_t block_end = line_end;
		for (std::size_t block_line_start = line_end; block_line_start < source.size();
				block_line_start = probe_next_line_start(source, block_line_start)) {
			const std::size_t block_line_end = probe_next_line_start(source, block_line_start);
			const std::size_t block_content_end =
				probe_line_content_end(source, block_line_start, block_line_end);
			if (probe_line_matches_top_level_header(source, block_line_start, block_content_end, "Object") ||
					probe_line_matches_top_level_header(source, block_line_start, block_content_end, "ObjectReskin")) {
				break;
			}
			block_end = block_line_end;
		}

		destination.append(source, line_start, block_end - line_start);
		if (destination.empty() || destination.back() != '\n') {
			destination.push_back('\n');
		}
		return true;
	}

	return false;
}

bool probe_load_generic_bridge_template_from_archives(
	FileSystem *file_system,
	Int *ini_error_code = nullptr,
	std::string *ini_error_message = nullptr)
{
	if (file_system == nullptr || TheArchiveFileSystem == nullptr) {
		if (ini_error_code != nullptr) {
			*ini_error_code = -10;
		}
		if (ini_error_message != nullptr) {
			*ini_error_message = "archive file system is not active";
		}
		return false;
	}

	FilenameList object_ini_files;
	TheFileSystem->getFileListInDirectory(
		AsciiString(kArchiveObjectIniDirectory),
		"*.ini",
		object_ini_files,
		TRUE);

	std::string generic_bridge_ini;
	for (FilenameList::const_iterator it = object_ini_files.begin();
			it != object_ini_files.end() && generic_bridge_ini.empty();
			++it) {
		std::string text;
		if (probe_read_archive_text(file_system, it->str(), text)) {
			probe_append_top_level_object_block(text, "GenericBridge", generic_bridge_ini);
		}
	}

	if (generic_bridge_ini.empty()) {
		if (ini_error_code != nullptr) {
			*ini_error_code = -11;
		}
		if (ini_error_message != nullptr) {
			*ini_error_message = "GenericBridge object block was not found";
		}
		return false;
	}

	if (!probe_write_ini_file(kProbeGenericBridgeIniEntry, generic_bridge_ini)) {
		if (ini_error_code != nullptr) {
			*ini_error_code = -12;
		}
		if (ini_error_message != nullptr) {
			*ini_error_message = "failed to write extracted GenericBridge INI";
		}
		return false;
	}

	INI ini;
	try {
		ini.load(AsciiString(kProbeGenericBridgeIniEntry), INI_LOAD_OVERWRITE, nullptr);
	} catch (const INIException &exception) {
		if (ini_error_code != nullptr) {
			*ini_error_code = -2;
		}
		if (ini_error_message != nullptr && exception.mFailureMessage != nullptr) {
			*ini_error_message = exception.mFailureMessage;
		}
		return false;
	} catch (int error_code) {
		if (ini_error_code != nullptr) {
			*ini_error_code = error_code;
		}
		return false;
	} catch (...) {
		if (ini_error_code != nullptr) {
			*ini_error_code = -1;
		}
		return false;
	}
	if (TheThingFactory == nullptr || TheThingFactory->findTemplate("GenericBridge") == nullptr) {
		if (ini_error_code != nullptr) {
			*ini_error_code = -13;
		}
		if (ini_error_message != nullptr) {
			const ThingTemplate *first_template =
				TheThingFactory != nullptr ? TheThingFactory->firstTemplate() : nullptr;
			*ini_error_message = "GenericBridge template was not registered after INI load; first template=";
			*ini_error_message +=
				first_template != nullptr ? first_template->getName().str() : "<none>";
		}
		return false;
	}
	return true;
}

std::size_t count_terrain_types(TerrainTypeCollection *terrain_types)
{
	if (terrain_types == nullptr) {
		return 0;
	}

	std::size_t count = 0;
	for (TerrainType *terrain = terrain_types->firstTerrain(); terrain != nullptr;
			terrain = terrain_types->nextTerrain(terrain)) {
		++count;
	}
	return count;
}

std::size_t count_terrain_roads(TerrainRoadCollection *terrain_roads)
{
	if (terrain_roads == nullptr) {
		return 0;
	}

	std::size_t count = 0;
	for (TerrainRoadType *road = terrain_roads->firstRoad(); road != nullptr;
			road = terrain_roads->nextRoad(road)) {
		++count;
	}
	return count;
}

std::size_t count_terrain_bridges(TerrainRoadCollection *terrain_roads)
{
	if (terrain_roads == nullptr) {
		return 0;
	}

	std::size_t count = 0;
	for (TerrainRoadType *bridge = terrain_roads->firstBridge(); bridge != nullptr;
			bridge = terrain_roads->nextBridge(bridge)) {
		++count;
	}
	return count;
}

struct ProbeRoadObjectSnapshot
{
	Coord3D location = { 0.0f, 0.0f, 0.0f };
	Real angle = 0.0f;
	Int flags = 0;
	AsciiString name;
	Dict properties;
};

struct ProbeRoadPairCandidate
{
	ProbeRoadObjectSnapshot first;
	ProbeRoadObjectSnapshot second;
	MapObject *firstMapObject = nullptr;
	MapObject *secondMapObject = nullptr;
	Int patchOriginX = 0;
	Int patchOriginY = 0;
	Int loadedSourceCells = 0;
	Int textureVisibilityWeight = 0;
	bool textureAvailable = false;
};

struct ProbeBridgePairCandidate
{
	ProbeRoadObjectSnapshot first;
	ProbeRoadObjectSnapshot second;
	MapObject *firstMapObject = nullptr;
	MapObject *secondMapObject = nullptr;
	Int patchOriginX = 0;
	Int patchOriginY = 0;
	Int loadedSourceCells = 0;
	bool modelAvailable = false;
	bool textureAvailable = false;
};

struct ProbeBridgeAssetDiagnostics
{
	bool modelArchiveExists = false;
	bool textureArchiveExists = false;
	bool bareModelFileAvailable = false;
	bool bareTextureFileAvailable = false;
	bool loadBareModel = false;
	bool createModel = false;
	bool modelHasLeft = false;
	bool modelHasSpan = false;
	bool modelHasRight = false;
	bool createLeft = false;
	bool createSpan = false;
	bool createRight = false;
	bool createTexture = false;
	Int modelClassId = RenderObjClass::CLASSID_UNKNOWN;
	Int leftClassId = RenderObjClass::CLASSID_UNKNOWN;
	Int spanClassId = RenderObjClass::CLASSID_UNKNOWN;
	Int rightClassId = RenderObjClass::CLASSID_UNKNOWN;
	Int modelSubObjects = 0;
	Int leftVertices = 0;
	Int spanVertices = 0;
	Int rightVertices = 0;
	Int leftPolygons = 0;
	Int spanPolygons = 0;
	Int rightPolygons = 0;
};

ProbeRoadObjectSnapshot probe_snapshot_map_object(MapObject *object)
{
	ProbeRoadObjectSnapshot snapshot;
	if (object == nullptr) {
		return snapshot;
	}

	if (object->getLocation() != nullptr) {
		snapshot.location = *object->getLocation();
	}
	snapshot.angle = object->getAngle();
	snapshot.flags = object->getFlags();
	snapshot.name = object->getName();
	if (object->getProperties() != nullptr) {
		snapshot.properties = *object->getProperties();
	}
	return snapshot;
}

void collect_probe_road_pairs_from_map_objects(
	TerrainRoadCollection *terrain_roads,
	std::vector<ProbeRoadPairCandidate> &candidates)
{
	candidates.clear();
	MapObject *pending_point1 = nullptr;
	for (MapObject *object = MapObject::getFirstMapObject(); object != nullptr;
			object = object->getNext()) {
		if (object->getFlag(FLAG_ROAD_POINT1)) {
			if (terrain_roads != nullptr && terrain_roads->findRoad(object->getName()) == nullptr) {
				pending_point1 = nullptr;
				continue;
			}
			pending_point1 = object;
			continue;
		}

		if (object->getFlag(FLAG_ROAD_POINT2) && pending_point1 != nullptr) {
			ProbeRoadPairCandidate candidate;
			candidate.first = probe_snapshot_map_object(pending_point1);
			candidate.second = probe_snapshot_map_object(object);
			candidate.firstMapObject = pending_point1;
			candidate.secondMapObject = object;
			candidates.push_back(candidate);
			pending_point1 = nullptr;
			continue;
		}

		pending_point1 = nullptr;
	}
}

void collect_probe_bridge_pairs_from_map_objects(
	TerrainRoadCollection *terrain_roads,
	std::vector<ProbeBridgePairCandidate> &candidates)
{
	candidates.clear();
	MapObject *pending_point1 = nullptr;
	for (MapObject *object = MapObject::getFirstMapObject(); object != nullptr;
			object = object->getNext()) {
		if (object->getFlag(FLAG_BRIDGE_POINT1)) {
			if (terrain_roads != nullptr && terrain_roads->findBridge(object->getName()) == nullptr) {
				pending_point1 = nullptr;
				continue;
			}
			pending_point1 = object;
			continue;
		}

		if (object->getFlag(FLAG_BRIDGE_POINT2) && pending_point1 != nullptr) {
			ProbeBridgePairCandidate candidate;
			candidate.first = probe_snapshot_map_object(pending_point1);
			candidate.second = probe_snapshot_map_object(object);
			candidate.firstMapObject = pending_point1;
			candidate.secondMapObject = object;
			candidates.push_back(candidate);
			pending_point1 = nullptr;
			continue;
		}

		pending_point1 = nullptr;
	}
}

bool probe_file_exists(FileSystem *file_system, const std::string &path)
{
	if (file_system == nullptr || path.empty()) {
		return false;
	}

	FileInfo info = {};
	return file_system->getFileInfo(AsciiString(path.c_str()), &info) &&
		info.sizeHigh == 0 &&
		info.sizeLow > 0;
}

bool probe_road_texture_available(
	TerrainRoadCollection *terrain_roads,
	FileSystem *file_system,
	AsciiString road_name)
{
	if (terrain_roads == nullptr || file_system == nullptr) {
		return false;
	}

	TerrainRoadType *road = terrain_roads->findRoad(road_name);
	if (road == nullptr) {
		return false;
	}

	const std::string texture = road->getTexture().str();
	if (texture.empty()) {
		return false;
	}

	const std::string texture_path = std::string("Art\\Textures\\") + texture;
	if (probe_file_exists(file_system, texture_path)) {
		return true;
	}

	std::string dds_path = texture_path;
	const std::size_t dot = dds_path.find_last_of('.');
	if (dot != std::string::npos) {
		dds_path.replace(dot, std::string::npos, ".dds");
	} else {
		dds_path += ".dds";
	}
	return probe_file_exists(file_system, dds_path);
}

std::string probe_road_texture_name(
	TerrainRoadCollection *terrain_roads,
	AsciiString road_name)
{
	if (terrain_roads == nullptr) {
		return "";
	}

	TerrainRoadType *road = terrain_roads->findRoad(road_name);
	return road != nullptr ? road->getTexture().str() : "";
}

std::string probe_bridge_texture_name(
	TerrainRoadCollection *terrain_roads,
	AsciiString bridge_name)
{
	if (terrain_roads == nullptr) {
		return "";
	}

	TerrainRoadType *bridge = terrain_roads->findBridge(bridge_name);
	return bridge != nullptr ? bridge->getTexture().str() : "";
}

std::string probe_bridge_model_name(
	TerrainRoadCollection *terrain_roads,
	AsciiString bridge_name)
{
	if (terrain_roads == nullptr) {
		return "";
	}

	TerrainRoadType *bridge = terrain_roads->findBridge(bridge_name);
	return bridge != nullptr ? bridge->getBridgeModel().str() : "";
}

bool probe_bridge_texture_available(
	TerrainRoadCollection *terrain_roads,
	FileSystem *file_system,
	AsciiString bridge_name)
{
	if (terrain_roads == nullptr || file_system == nullptr) {
		return false;
	}

	const std::string texture = probe_bridge_texture_name(terrain_roads, bridge_name);
	if (texture.empty()) {
		return false;
	}

	const std::string texture_path = std::string("Art\\Textures\\") + texture;
	if (probe_file_exists(file_system, texture_path)) {
		return true;
	}

	std::string dds_path = texture_path;
	const std::size_t dot = dds_path.find_last_of('.');
	if (dot != std::string::npos) {
		dds_path.replace(dot, std::string::npos, ".dds");
	} else {
		dds_path += ".dds";
	}
	return probe_file_exists(file_system, dds_path);
}

bool probe_bridge_model_available(
	TerrainRoadCollection *terrain_roads,
	FileSystem *file_system,
	AsciiString bridge_name)
{
	if (terrain_roads == nullptr || file_system == nullptr) {
		return false;
	}

	const std::string model = probe_bridge_model_name(terrain_roads, bridge_name);
	if (model.empty()) {
		return false;
	}

	return probe_file_exists(file_system, std::string("Art\\W3D\\") + model + ".w3d");
}

bool probe_file_factory_file_available(const std::string &filename)
{
	if (_TheFileFactory == nullptr || filename.empty()) {
		return false;
	}

	FileClass *file = _TheFileFactory->Get_File(filename.c_str());
	const bool available = file != nullptr && file->Is_Available();
	if (file != nullptr) {
		_TheFileFactory->Return_File(file);
	}
	return available;
}

void probe_bridge_mesh_metrics(
	RenderObjClass *render_object,
	Int &class_id,
	Int &vertices,
	Int &polygons)
{
	class_id = render_object != nullptr ?
		render_object->Class_ID() :
		RenderObjClass::CLASSID_UNKNOWN;
	vertices = 0;
	polygons = 0;
	if (render_object == nullptr || class_id != RenderObjClass::CLASSID_MESH) {
		return;
	}

	MeshClass *mesh = static_cast<MeshClass *>(render_object);
	MeshModelClass *model = mesh->Peek_Model();
	if (model == nullptr) {
		return;
	}
	vertices = model->Get_Vertex_Count();
	polygons = model->Get_Polygon_Count();
}

ProbeBridgeAssetDiagnostics probe_bridge_asset_runtime_diagnostics(
	WW3DAssetManager *asset_manager,
	TerrainRoadCollection *terrain_roads,
	FileSystem *file_system,
	const std::string &bridge_name)
{
	ProbeBridgeAssetDiagnostics diagnostics;
	if (asset_manager == nullptr || terrain_roads == nullptr || bridge_name.empty()) {
		return diagnostics;
	}

	const AsciiString bridge_ascii(bridge_name.c_str());
	const std::string model = probe_bridge_model_name(terrain_roads, bridge_ascii);
	const std::string texture = probe_bridge_texture_name(terrain_roads, bridge_ascii);
	if (model.empty()) {
		return diagnostics;
	}

	const std::string model_file = model + ".w3d";
	const std::string left_name = model + ".BRIDGE_LEFT";
	const std::string span_name = model + ".BRIDGE_SPAN";
	const std::string right_name = model + ".BRIDGE_RIGHT";
	diagnostics.modelArchiveExists =
		probe_file_exists(file_system, std::string("Art\\W3D\\") + model_file);
	diagnostics.textureArchiveExists =
		probe_bridge_texture_available(terrain_roads, file_system, bridge_ascii);
	diagnostics.bareModelFileAvailable = probe_file_factory_file_available(model_file);
	diagnostics.bareTextureFileAvailable =
		!texture.empty() && probe_file_factory_file_available(texture);
	diagnostics.loadBareModel = asset_manager->Load_3D_Assets(model_file.c_str());

	RenderObjClass *model_object = asset_manager->Create_Render_Obj(model.c_str());
	diagnostics.createModel = model_object != nullptr;
	if (model_object != nullptr) {
		diagnostics.modelClassId = model_object->Class_ID();
		diagnostics.modelSubObjects = model_object->Get_Num_Sub_Objects();
		for (Int index = 0; index < diagnostics.modelSubObjects; ++index) {
			RenderObjClass *sub_object = model_object->Get_Sub_Object(index);
			if (sub_object != nullptr && sub_object->Get_Name() != nullptr) {
				const char *sub_name = sub_object->Get_Name();
				diagnostics.modelHasLeft =
					diagnostics.modelHasLeft ||
					strnicmp(left_name.c_str(), sub_name, left_name.size()) == 0;
				diagnostics.modelHasSpan =
					diagnostics.modelHasSpan ||
					strnicmp(span_name.c_str(), sub_name, span_name.size()) == 0;
				diagnostics.modelHasRight =
					diagnostics.modelHasRight ||
					strnicmp(right_name.c_str(), sub_name, right_name.size()) == 0;
			}
			REF_PTR_RELEASE(sub_object);
		}
	}
	REF_PTR_RELEASE(model_object);

	RenderObjClass *left_object = asset_manager->Create_Render_Obj(left_name.c_str());
	diagnostics.createLeft = left_object != nullptr;
	probe_bridge_mesh_metrics(
		left_object,
		diagnostics.leftClassId,
		diagnostics.leftVertices,
		diagnostics.leftPolygons);
	REF_PTR_RELEASE(left_object);

	RenderObjClass *span_object = asset_manager->Create_Render_Obj(span_name.c_str());
	diagnostics.createSpan = span_object != nullptr;
	probe_bridge_mesh_metrics(
		span_object,
		diagnostics.spanClassId,
		diagnostics.spanVertices,
		diagnostics.spanPolygons);
	REF_PTR_RELEASE(span_object);

	RenderObjClass *right_object = asset_manager->Create_Render_Obj(right_name.c_str());
	diagnostics.createRight = right_object != nullptr;
	probe_bridge_mesh_metrics(
		right_object,
		diagnostics.rightClassId,
		diagnostics.rightVertices,
		diagnostics.rightPolygons);
	REF_PTR_RELEASE(right_object);

	if (!texture.empty()) {
		TextureClass *bridge_texture = asset_manager->Get_Texture(texture.c_str(), MIP_LEVELS_3);
		diagnostics.createTexture = bridge_texture != nullptr;
		REF_PTR_RELEASE(bridge_texture);
	}

	return diagnostics;
}

AsciiString probe_first_loadable_bridge_name(
	TerrainRoadCollection *terrain_roads,
	FileSystem *file_system)
{
	if (terrain_roads == nullptr || file_system == nullptr) {
		return AsciiString::TheEmptyString;
	}

	const char *preferred_bridges[] = {
		"ConcreteTwoLane",
		"ConcreteOneLane",
		"ConcreteWide",
		"WoodenSectional",
		"EuropeanBridgeWRailing",
		"EuropeanBridgeAsphalt"
	};
	for (const char *name : preferred_bridges) {
		AsciiString bridge_name(name);
		if (terrain_roads->findBridge(bridge_name) != nullptr &&
				probe_bridge_model_available(terrain_roads, file_system, bridge_name) &&
				probe_bridge_texture_available(terrain_roads, file_system, bridge_name)) {
			return bridge_name;
		}
	}

	for (TerrainRoadType *bridge = terrain_roads->firstBridge(); bridge != nullptr;
			bridge = terrain_roads->nextBridge(bridge)) {
		AsciiString bridge_name = bridge->getName();
		if (probe_bridge_model_available(terrain_roads, file_system, bridge_name) &&
				probe_bridge_texture_available(terrain_roads, file_system, bridge_name)) {
			return bridge_name;
		}
	}
	return AsciiString::TheEmptyString;
}

void probe_bridge_phase_log(const char *phase)
{
	std::fprintf(stderr, "cnc-port bridge probe phase=%s\n", phase != nullptr ? phase : "");
	std::fflush(stderr);
}

void probe_bridge_metric_log(
	const char *label,
	const std::string &original_name,
	const std::string &installed_name,
	float length,
	Int vertices,
	Int indices)
{
	std::fprintf(
		stderr,
		"cnc-port bridge probe %s original=%s installed=%s length=%.4f vertices=%d indices=%d\n",
		label != nullptr ? label : "",
		original_name.c_str(),
		installed_name.c_str(),
		length,
		vertices,
		indices);
	std::fflush(stderr);
}

std::string probe_ascii_lower(std::string value)
{
	for (char &ch : value) {
		if (ch >= 'A' && ch <= 'Z') {
			ch = static_cast<char>(ch - 'A' + 'a');
		}
	}
	return value;
}

Int probe_road_texture_visibility_weight(
	const std::string &road_name,
	const std::string &texture_name)
{
	// Proof-only tie breaker: pick a real, source-backed road texture that is
	// visually obvious in screenshots without changing game road behavior.
	const std::string combined =
		probe_ascii_lower(road_name + " " + texture_name);
	if (combined.find("thick") != std::string::npos) {
		return 40;
	}
	if (combined.find("crosswalk") != std::string::npos ||
			combined.find("caution") != std::string::npos ||
			combined.find("arrow") != std::string::npos ||
			combined.find("cobble") != std::string::npos) {
		return 30;
	}
	if (combined.find("single") != std::string::npos) {
		return 10;
	}
	if (combined.find("line") != std::string::npos) {
		return 20;
	}
	return 15;
}

std::string probe_road_pair_candidate_summary_json(
	const std::vector<ProbeRoadPairCandidate> &candidates,
	TerrainRoadCollection *terrain_roads,
	Int selected_candidate_index)
{
	std::vector<std::size_t> candidate_indices;
	for (std::size_t index = 0; index < candidates.size(); ++index) {
		const ProbeRoadPairCandidate &candidate = candidates[index];
		if (candidate.textureAvailable && candidate.loadedSourceCells > 0) {
			candidate_indices.push_back(index);
		}
	}
	std::sort(candidate_indices.begin(), candidate_indices.end(),
		[&candidates](std::size_t left, std::size_t right) {
			const ProbeRoadPairCandidate &left_candidate = candidates[left];
			const ProbeRoadPairCandidate &right_candidate = candidates[right];
			if (left_candidate.loadedSourceCells != right_candidate.loadedSourceCells) {
				return left_candidate.loadedSourceCells > right_candidate.loadedSourceCells;
			}
			return left < right;
		});

	std::string json = "[";
	const std::size_t limit = std::min<std::size_t>(candidate_indices.size(), 12);
	for (std::size_t rank = 0; rank < limit; ++rank) {
		const std::size_t index = candidate_indices[rank];
		const ProbeRoadPairCandidate &candidate = candidates[index];
		const std::string name = candidate.first.name.str();
		const std::string texture = probe_road_texture_name(terrain_roads, candidate.first.name);
		char buffer[768];
		std::snprintf(
			buffer,
			sizeof(buffer),
			"%s{\"index\":%lu,\"name\":%s,\"texture\":%s,"
			"\"sourceCells\":%d,\"patchOrigin\":[%d,%d],"
			"\"visibilityWeight\":%d,"
			"\"first\":[%.4f,%.4f],\"second\":[%.4f,%.4f],"
			"\"selected\":%s}",
			rank == 0 ? "" : ",",
			static_cast<unsigned long>(index),
			json_string(name).c_str(),
			json_string(texture).c_str(),
			candidate.loadedSourceCells,
			candidate.patchOriginX,
			candidate.patchOriginY,
			candidate.textureVisibilityWeight,
			candidate.first.location.x,
			candidate.first.location.y,
			candidate.second.location.x,
			candidate.second.location.y,
			bool_json(static_cast<Int>(index) == selected_candidate_index));
		json += buffer;
	}
	json += "]";
	return json;
}

std::string probe_bridge_pair_candidate_summary_json(
	const std::vector<ProbeBridgePairCandidate> &candidates,
	TerrainRoadCollection *terrain_roads,
	Int selected_candidate_index)
{
	std::vector<std::size_t> candidate_indices;
	for (std::size_t index = 0; index < candidates.size(); ++index) {
		const ProbeBridgePairCandidate &candidate = candidates[index];
		if (candidate.modelAvailable && candidate.textureAvailable && candidate.loadedSourceCells > 0) {
			candidate_indices.push_back(index);
		}
	}
	if (candidate_indices.empty()) {
		for (std::size_t index = 0; index < candidates.size(); ++index) {
			const ProbeBridgePairCandidate &candidate = candidates[index];
			if (candidate.loadedSourceCells > 0) {
				candidate_indices.push_back(index);
			}
		}
	}
	std::sort(candidate_indices.begin(), candidate_indices.end(),
		[&candidates](std::size_t left, std::size_t right) {
			const ProbeBridgePairCandidate &left_candidate = candidates[left];
			const ProbeBridgePairCandidate &right_candidate = candidates[right];
			const bool left_assets =
				left_candidate.modelAvailable && left_candidate.textureAvailable;
			const bool right_assets =
				right_candidate.modelAvailable && right_candidate.textureAvailable;
			if (left_assets != right_assets) {
				return left_assets;
			}
			if (left_candidate.loadedSourceCells != right_candidate.loadedSourceCells) {
				return left_candidate.loadedSourceCells > right_candidate.loadedSourceCells;
			}
			return left < right;
		});

	std::string json = "[";
	const std::size_t limit = std::min<std::size_t>(candidate_indices.size(), 12);
	for (std::size_t rank = 0; rank < limit; ++rank) {
		const std::size_t index = candidate_indices[rank];
		const ProbeBridgePairCandidate &candidate = candidates[index];
		const std::string name = candidate.first.name.str();
		const std::string texture =
			probe_bridge_texture_name(terrain_roads, candidate.first.name);
		const std::string model =
			probe_bridge_model_name(terrain_roads, candidate.first.name);
		char buffer[900];
		std::snprintf(
			buffer,
			sizeof(buffer),
			"%s{\"index\":%lu,\"name\":%s,\"model\":%s,"
			"\"texture\":%s,\"modelAvailable\":%s,"
			"\"textureAvailable\":%s,\"sourceCells\":%d,"
			"\"patchOrigin\":[%d,%d],"
			"\"first\":[%.4f,%.4f],\"second\":[%.4f,%.4f],"
			"\"selected\":%s}",
			rank == 0 ? "" : ",",
			static_cast<unsigned long>(index),
			json_string(name).c_str(),
			json_string(model).c_str(),
			json_string(texture).c_str(),
			bool_json(candidate.modelAvailable),
			bool_json(candidate.textureAvailable),
			candidate.loadedSourceCells,
			candidate.patchOriginX,
			candidate.patchOriginY,
			candidate.first.location.x,
			candidate.first.location.y,
			candidate.second.location.x,
			candidate.second.location.y,
			bool_json(static_cast<Int>(index) == selected_candidate_index));
		json += buffer;
	}
	json += "]";
	return json;
}

struct ProbeMapRoadObjectMetrics
{
	Int mapObjects = 0;
	Int roadPoint1 = 0;
	Int roadPoint2 = 0;
	Int roadPairs = 0;
	Int roadPairsWithRoadType = 0;
	Int firstRoadFlags = 0;
	float firstRoadX = 0.0f;
	float firstRoadY = 0.0f;
	float secondRoadX = 0.0f;
	float secondRoadY = 0.0f;
	std::string firstRoadName;
};

struct ProbeMapBridgeObjectMetrics
{
	Int mapObjects = 0;
	Int bridgePoint1 = 0;
	Int bridgePoint2 = 0;
	Int bridgePairs = 0;
	Int bridgePairsWithBridgeType = 0;
	Int firstBridgeFlags = 0;
	float firstBridgeX = 0.0f;
	float firstBridgeY = 0.0f;
	float secondBridgeX = 0.0f;
	float secondBridgeY = 0.0f;
	std::string firstBridgeName;
};

ProbeMapRoadObjectMetrics inspect_map_road_objects(TerrainRoadCollection *terrain_roads)
{
	ProbeMapRoadObjectMetrics metrics;
	bool recorded_first_pair = false;
	for (MapObject *object = MapObject::getFirstMapObject(); object != nullptr; object = object->getNext()) {
		++metrics.mapObjects;
		if (object->getFlag(FLAG_ROAD_POINT1)) {
			++metrics.roadPoint1;
			MapObject *next = object->getNext();
			if (next != nullptr && next->getFlag(FLAG_ROAD_POINT2)) {
				++metrics.roadPairs;
				TerrainRoadType *road = terrain_roads != nullptr ?
					terrain_roads->findRoad(object->getName()) :
					nullptr;
				if (road != nullptr) {
					++metrics.roadPairsWithRoadType;
				}
				if (!recorded_first_pair) {
					const Coord3D *first_location = object->getLocation();
					const Coord3D *second_location = next->getLocation();
					metrics.firstRoadName = object->getName().str();
					metrics.firstRoadFlags = object->getFlags();
					if (first_location != nullptr) {
						metrics.firstRoadX = first_location->x;
						metrics.firstRoadY = first_location->y;
					}
					if (second_location != nullptr) {
						metrics.secondRoadX = second_location->x;
						metrics.secondRoadY = second_location->y;
					}
					recorded_first_pair = true;
				}
			}
		}
		if (object->getFlag(FLAG_ROAD_POINT2)) {
			++metrics.roadPoint2;
		}
	}
	return metrics;
}

ProbeMapBridgeObjectMetrics inspect_map_bridge_objects(TerrainRoadCollection *terrain_roads)
{
	ProbeMapBridgeObjectMetrics metrics;
	bool recorded_first_pair = false;
	for (MapObject *object = MapObject::getFirstMapObject(); object != nullptr; object = object->getNext()) {
		++metrics.mapObjects;
		if (object->getFlag(FLAG_BRIDGE_POINT1)) {
			++metrics.bridgePoint1;
			MapObject *next = object->getNext();
			if (next != nullptr && next->getFlag(FLAG_BRIDGE_POINT2)) {
				++metrics.bridgePairs;
				TerrainRoadType *bridge = terrain_roads != nullptr ?
					terrain_roads->findBridge(object->getName()) :
					nullptr;
				if (bridge != nullptr) {
					++metrics.bridgePairsWithBridgeType;
				}
				if (!recorded_first_pair) {
					const Coord3D *first_location = object->getLocation();
					const Coord3D *second_location = next->getLocation();
					metrics.firstBridgeName = object->getName().str();
					metrics.firstBridgeFlags = object->getFlags();
					if (first_location != nullptr) {
						metrics.firstBridgeX = first_location->x;
						metrics.firstBridgeY = first_location->y;
					}
					if (second_location != nullptr) {
						metrics.secondBridgeX = second_location->x;
						metrics.secondBridgeY = second_location->y;
					}
					recorded_first_pair = true;
				}
			}
		}
		if (object->getFlag(FLAG_BRIDGE_POINT2)) {
			++metrics.bridgePoint2;
		}
	}
	return metrics;
}

void record_patch_height_metrics(ProbeTerrainMapPatchLoad &load);

class ProbeWorldHeightMapInspector : public WorldHeightMap
{
public:
	static void recordTextureClassLoadMetrics(
		WorldHeightMap *map,
		TerrainTypeCollection *terrain_types,
		FileSystem *file_system,
		ProbeTerrainMapPatchLoad &load)
	{
		if (map == nullptr) {
			return;
		}

		ProbeWorldHeightMapInspector *probe =
			reinterpret_cast<ProbeWorldHeightMapInspector *>(map);
		load.bitmapTileCount = probe->m_numBitmapTiles;
		load.textureClassCount = probe->m_numTextureClasses;
		load.sourceTilesLoaded = 0;
		for (Int index = 0; index < probe->m_numBitmapTiles && index < NUM_SOURCE_TILES; ++index) {
			if (probe->m_sourceTiles[index] != nullptr) {
				++load.sourceTilesLoaded;
			}
		}

		std::string classes_json = "[";
		const Int sample_count = std::min(probe->m_numTextureClasses, kTextureClassDiagnosticsLimit);
		for (Int class_index = 0; class_index < sample_count; ++class_index) {
			TXTextureClass &texture_class = probe->m_textureClasses[class_index];
			TerrainType *terrain = terrain_types != nullptr
				? terrain_types->findTerrain(texture_class.name)
				: nullptr;
			std::string texture_name = terrain != nullptr ? terrain->getTexture().str() : "";
			std::string texture_path = texture_name.empty()
				? ""
				: std::string(TERRAIN_TGA_DIR_PATH) + texture_name;
			bool path_exists = false;
			bool path_openable = false;
			Int path_bytes = 0;
			if (!texture_path.empty() && file_system != nullptr) {
				FileInfo texture_info = {};
				path_exists =
					file_system->getFileInfo(AsciiString(texture_path.c_str()), &texture_info) &&
					texture_info.sizeHigh == 0 &&
					texture_info.sizeLow > 0;
				path_bytes = path_exists ? texture_info.sizeLow : 0;
				File *texture_file = file_system->openFile(texture_path.c_str(), File::READ | File::BINARY);
				path_openable = texture_file != nullptr;
				if (texture_file != nullptr) {
					texture_file->close();
				}
			}

			Int loaded_tiles = 0;
			const Int first_tile = texture_class.firstTile;
			const Int last_tile = first_tile + texture_class.numTiles;
			for (Int tile_index = std::max(0, first_tile);
					tile_index < last_tile && tile_index < NUM_SOURCE_TILES;
					++tile_index) {
				if (probe->m_sourceTiles[tile_index] != nullptr) {
					++loaded_tiles;
				}
			}

			char class_buffer[1200];
			std::snprintf(
				class_buffer,
				sizeof(class_buffer),
				"%s{\"index\":%d,\"name\":%s,\"firstTile\":%d,"
				"\"numTiles\":%d,\"width\":%d,\"terrainFound\":%s,"
				"\"texture\":%s,\"path\":%s,\"pathExists\":%s,"
				"\"pathOpenable\":%s,\"pathBytes\":%d,\"loadedTiles\":%d}",
				class_index > 0 ? "," : "",
				class_index,
				json_string(texture_class.name.str()).c_str(),
				texture_class.firstTile,
				texture_class.numTiles,
				texture_class.width,
				bool_json(terrain != nullptr),
				json_string(texture_name).c_str(),
				json_string(texture_path).c_str(),
				bool_json(path_exists),
				bool_json(path_openable),
				path_bytes,
				loaded_tiles);
			classes_json += class_buffer;
		}
		classes_json += "]";
		load.textureClassesJson = classes_json;
	}

	static void selectLoadedPatchOrigin(WorldHeightMap *map, ProbeTerrainMapPatchLoad &load)
	{
		if (map == nullptr || load.width <= 0 || load.height <= 0) {
			return;
		}

		ProbeWorldHeightMapInspector *probe =
			reinterpret_cast<ProbeWorldHeightMapInspector *>(map);
		if (probe->m_tileNdxes == nullptr) {
			return;
		}

		const Int width = probe->m_width;
		const Int height = probe->m_height;
		if (width <= 0 || height <= 0) {
			return;
		}

		std::vector<Int> prefix(static_cast<std::size_t>((width + 1) * (height + 1)), 0);
		auto prefix_at = [width, &prefix](Int x, Int y) -> Int& {
			return prefix[static_cast<std::size_t>(y * (width + 1) + x)];
		};

		for (Int y = 0; y < height; ++y) {
			Int row_count = 0;
			for (Int x = 0; x < width; ++x) {
				const Short tile_index = probe->m_tileNdxes[y * width + x];
				const Short base_index = tile_index >> 2;
				const bool source_loaded =
					base_index >= 0 &&
					base_index < NUM_SOURCE_TILES &&
					probe->m_sourceTiles[base_index] != nullptr;
				if (source_loaded) {
					++row_count;
				}
				prefix_at(x + 1, y + 1) = prefix_at(x + 1, y) + row_count;
			}
		}

		auto loaded_count = [&prefix_at](Int x0, Int y0, Int x1, Int y1) -> Int {
			return prefix_at(x1, y1) - prefix_at(x0, y1) - prefix_at(x1, y0) + prefix_at(x0, y0);
		};

		const Int max_origin_x = std::max(0, width - load.patchCells);
		const Int max_origin_y = std::max(0, height - load.patchCells);
		Int best_origin_x = load.patchOriginX;
		Int best_origin_y = load.patchOriginY;
		Int best_score = -1;
		Int best_loaded = -1;

		for (Int origin_y = 0; origin_y <= max_origin_y; ++origin_y) {
			for (Int origin_x = 0; origin_x <= max_origin_x; ++origin_x) {
				const Int x1 = std::min(origin_x + load.patchCells, width);
				const Int y1 = std::min(origin_y + load.patchCells, height);
				const Int cells_loaded = loaded_count(origin_x, origin_y, x1, y1);
				if (cells_loaded <= 0) {
					continue;
				}

				const Int center_x = std::min(origin_x + (load.patchCells / 2), width - 1);
				const Int center_y = std::min(origin_y + (load.patchCells / 2), height - 1);
				const Int center_loaded = loaded_count(center_x, center_y, center_x + 1, center_y + 1);
				const Int score = cells_loaded + center_loaded * load.patchCells * load.patchCells;
				if (score > best_score ||
						(score == best_score && cells_loaded > best_loaded)) {
					best_score = score;
					best_loaded = cells_loaded;
					best_origin_x = origin_x;
					best_origin_y = origin_y;
				}
			}
		}

		if (best_score >= 0) {
			load.patchOriginX = best_origin_x;
			load.patchOriginY = best_origin_y;
			record_patch_height_metrics(load);
		}
	}

	static Int countLoadedSourceCells(
		WorldHeightMap *map,
		Int origin_x,
		Int origin_y,
		Int patch_cells)
	{
		if (map == nullptr || patch_cells <= 0) {
			return 0;
		}

		ProbeWorldHeightMapInspector *probe =
			reinterpret_cast<ProbeWorldHeightMapInspector *>(map);
		if (probe->m_tileNdxes == nullptr || probe->m_width <= 0 || probe->m_height <= 0) {
			return 0;
		}

		Int loaded = 0;
		for (Int y = 0; y < patch_cells && origin_y + y < probe->m_height; ++y) {
			for (Int x = 0; x < patch_cells && origin_x + x < probe->m_width; ++x) {
				if (origin_x + x < 0 || origin_y + y < 0) {
					continue;
				}
				const Short tile_index = probe->m_tileNdxes[(origin_y + y) * probe->m_width + origin_x + x];
				const Short base_index = tile_index >> 2;
				if (base_index >= 0 &&
						base_index < NUM_SOURCE_TILES &&
						probe->m_sourceTiles[base_index] != nullptr) {
					++loaded;
				}
			}
		}
		return loaded;
	}

	static void recordRenderedTileMetrics(WorldHeightMap *map, ProbeTerrainMapPatchLoad &load)
	{
		if (map == nullptr) {
			return;
		}

		ProbeWorldHeightMapInspector *probe =
			reinterpret_cast<ProbeWorldHeightMapInspector *>(map);
		load.sourceTilesPositioned = 0;
		for (Int index = 0; index < probe->m_numBitmapTiles && index < NUM_SOURCE_TILES; ++index) {
			TileData *tile = probe->m_sourceTiles[index];
			if (tile != nullptr &&
					(tile->m_tileLocationInTexture.x != 0 ||
					 tile->m_tileLocationInTexture.y != 0)) {
				++load.sourceTilesPositioned;
			}
		}

		load.patchTileCells = 0;
		load.patchTilesWithSource = 0;
		load.patchTilesMissingSource = 0;
		load.firstPatchTileIndex = -1;
		load.firstPatchBaseTileIndex = -1;
		load.firstPatchTextureClass = -1;
		load.firstPatchTileTextureX = 0;
		load.firstPatchTileTextureY = 0;
		load.firstPatchSourceTileLoaded = false;
		load.firstPatchTextureClassName.clear();

		if (probe->m_tileNdxes == nullptr || probe->m_width <= 0 || probe->m_height <= 0) {
			return;
		}

		for (Int y = 0; y < load.patchCells && load.patchOriginY + y < probe->m_height; ++y) {
			for (Int x = 0; x < load.patchCells && load.patchOriginX + x < probe->m_width; ++x) {
				const Int map_index = (load.patchOriginY + y) * probe->m_width + load.patchOriginX + x;
				const Short tile_index = probe->m_tileNdxes[map_index];
				const Short base_index = tile_index >> 2;
				const bool source_loaded =
					base_index >= 0 &&
					base_index < NUM_SOURCE_TILES &&
					probe->m_sourceTiles[base_index] != nullptr;
				++load.patchTileCells;
				if (source_loaded) {
					++load.patchTilesWithSource;
				} else {
					++load.patchTilesMissingSource;
				}

				if (load.firstPatchTileIndex < 0) {
					load.firstPatchTileIndex = tile_index;
					load.firstPatchBaseTileIndex = base_index;
					load.firstPatchSourceTileLoaded = source_loaded;
					if (source_loaded) {
						load.firstPatchTileTextureX =
							probe->m_sourceTiles[base_index]->m_tileLocationInTexture.x;
						load.firstPatchTileTextureY =
							probe->m_sourceTiles[base_index]->m_tileLocationInTexture.y;
					}
					for (Int class_index = 0; class_index < probe->m_numTextureClasses; ++class_index) {
						TXTextureClass &texture_class = probe->m_textureClasses[class_index];
						if (base_index >= texture_class.firstTile &&
								base_index < texture_class.firstTile + texture_class.numTiles) {
							load.firstPatchTextureClass = class_index;
							load.firstPatchTextureClassName = texture_class.name.str();
							break;
						}
					}
				}
			}
		}
	}
};

void record_patch_height_metrics(ProbeTerrainMapPatchLoad &load)
{
	if (load.map == nullptr || load.map->getDataPtr() == nullptr || load.width <= 0 || load.height <= 0) {
		return;
	}

	const Int center_x = std::min(load.patchOriginX + (load.patchCells / 2), load.width - 1);
	const Int center_y = std::min(load.patchOriginY + (load.patchCells / 2), load.height - 1);
	load.patchCenterHeight = load.map->getHeight(center_x, center_y);

	unsigned long checksum = 2166136261UL;
	for (Int y = 0; y <= load.patchCells && load.patchOriginY + y < load.height; ++y) {
		for (Int x = 0; x <= load.patchCells && load.patchOriginX + x < load.width; ++x) {
			checksum ^= load.map->getHeight(load.patchOriginX + x, load.patchOriginY + y);
			checksum *= 16777619UL;
		}
	}
	load.patchHeightChecksum = checksum;
}

bool select_probe_road_pair_for_loaded_patch(
	WorldHeightMap *map,
	ProbeTerrainMapPatchLoad &load,
	std::vector<ProbeRoadPairCandidate> &candidates,
	TerrainRoadCollection *terrain_roads,
	FileSystem *file_system,
	Int &selected_candidate_index,
	Int &selected_candidate_source_cells)
{
	selected_candidate_index = -1;
	selected_candidate_source_cells = 0;
	if (map == nullptr || candidates.empty() || load.width <= 0 || load.height <= 0) {
		return false;
	}

	const Int max_origin_x = std::max(0, load.width - (load.patchCells + 1));
	const Int max_origin_y = std::max(0, load.height - (load.patchCells + 1));
	Int best_loaded = -1;
	Int best_index = -1;
	bool best_has_available_texture = false;
	Int best_visibility_weight = -1;

	for (std::size_t index = 0; index < candidates.size(); ++index) {
		ProbeRoadPairCandidate &candidate = candidates[index];
		const float road_center_x =
			(candidate.first.location.x + candidate.second.location.x) * 0.5f;
		const float road_center_y =
			(candidate.first.location.y + candidate.second.location.y) * 0.5f;
		const Int road_cell_x =
			static_cast<Int>(road_center_x / MAP_XY_FACTOR) + load.border;
		const Int road_cell_y =
			static_cast<Int>(road_center_y / MAP_XY_FACTOR) + load.border;
		candidate.patchOriginX =
			std::min(std::max(road_cell_x - load.patchCells / 2, load.border), max_origin_x);
		candidate.patchOriginY =
			std::min(std::max(road_cell_y - load.patchCells / 2, load.border), max_origin_y);
		candidate.loadedSourceCells =
			ProbeWorldHeightMapInspector::countLoadedSourceCells(
				map,
				candidate.patchOriginX,
				candidate.patchOriginY,
				load.patchCells);
		candidate.textureAvailable =
			probe_road_texture_available(
				terrain_roads,
				file_system,
				candidate.first.name);
		const std::string texture_name =
			probe_road_texture_name(terrain_roads, candidate.first.name);
		candidate.textureVisibilityWeight =
			candidate.textureAvailable ?
				probe_road_texture_visibility_weight(
					candidate.first.name.str(),
					texture_name) :
				0;
		const bool has_available_texture_and_source =
			candidate.textureAvailable && candidate.loadedSourceCells > 0;
		const bool better_candidate =
			best_index < 0 ||
			(has_available_texture_and_source && !best_has_available_texture) ||
			(has_available_texture_and_source && best_has_available_texture &&
				candidate.textureVisibilityWeight > best_visibility_weight) ||
			(has_available_texture_and_source == best_has_available_texture &&
				candidate.textureVisibilityWeight == best_visibility_weight &&
				candidate.loadedSourceCells > best_loaded) ||
			(!has_available_texture_and_source &&
				!best_has_available_texture &&
				candidate.loadedSourceCells > best_loaded);
		if (better_candidate) {
			best_loaded = candidate.loadedSourceCells;
			best_index = static_cast<Int>(index);
			best_has_available_texture = has_available_texture_and_source;
			best_visibility_weight = candidate.textureVisibilityWeight;
		}
	}

	if (best_index < 0) {
		return false;
	}

	selected_candidate_index = best_index;
	selected_candidate_source_cells = best_loaded;
	ProbeRoadPairCandidate &selected =
		candidates[static_cast<std::size_t>(best_index)];
	load.patchOriginX = selected.patchOriginX;
	load.patchOriginY = selected.patchOriginY;
	record_patch_height_metrics(load);
	return true;
}

bool select_probe_bridge_pair_for_loaded_patch(
	WorldHeightMap *map,
	ProbeTerrainMapPatchLoad &load,
	std::vector<ProbeBridgePairCandidate> &candidates,
	TerrainRoadCollection *terrain_roads,
	FileSystem *file_system,
	Int &selected_candidate_index,
	Int &selected_candidate_source_cells)
{
	selected_candidate_index = -1;
	selected_candidate_source_cells = 0;
	if (map == nullptr || candidates.empty() || load.width <= 0 || load.height <= 0) {
		return false;
	}

	const Int max_origin_x = std::max(0, load.width - (load.patchCells + 1));
	const Int max_origin_y = std::max(0, load.height - (load.patchCells + 1));
	Int best_loaded = -1;
	Int best_index = -1;
	bool best_has_available_assets = false;

	for (std::size_t index = 0; index < candidates.size(); ++index) {
		ProbeBridgePairCandidate &candidate = candidates[index];
		const float bridge_center_x =
			(candidate.first.location.x + candidate.second.location.x) * 0.5f;
		const float bridge_center_y =
			(candidate.first.location.y + candidate.second.location.y) * 0.5f;
		const Int bridge_cell_x =
			static_cast<Int>(bridge_center_x / MAP_XY_FACTOR) + load.border;
		const Int bridge_cell_y =
			static_cast<Int>(bridge_center_y / MAP_XY_FACTOR) + load.border;
		candidate.patchOriginX =
			std::min(std::max(bridge_cell_x - load.patchCells / 2, load.border), max_origin_x);
		candidate.patchOriginY =
			std::min(std::max(bridge_cell_y - load.patchCells / 2, load.border), max_origin_y);
		candidate.loadedSourceCells =
			ProbeWorldHeightMapInspector::countLoadedSourceCells(
				map,
				candidate.patchOriginX,
				candidate.patchOriginY,
				load.patchCells);
		candidate.modelAvailable =
			probe_bridge_model_available(
				terrain_roads,
				file_system,
				candidate.first.name);
		candidate.textureAvailable =
			probe_bridge_texture_available(
				terrain_roads,
				file_system,
				candidate.first.name);
		const bool has_available_assets_and_source =
			candidate.modelAvailable && candidate.textureAvailable && candidate.loadedSourceCells > 0;
		const bool better_candidate =
			best_index < 0 ||
			(has_available_assets_and_source && !best_has_available_assets) ||
			(has_available_assets_and_source == best_has_available_assets &&
				candidate.loadedSourceCells > best_loaded);
		if (better_candidate) {
			best_loaded = candidate.loadedSourceCells;
			best_index = static_cast<Int>(index);
			best_has_available_assets = has_available_assets_and_source;
		}
	}

	if (best_index < 0) {
		return false;
	}

	selected_candidate_index = best_index;
	selected_candidate_source_cells = best_loaded;
	ProbeBridgePairCandidate &selected =
		candidates[static_cast<std::size_t>(best_index)];
	load.patchOriginX = selected.patchOriginX;
	load.patchOriginY = selected.patchOriginY;
	record_patch_height_metrics(load);
	return true;
}

struct ProbeTerrainCameraView
{
	float eyeX = 0.0f;
	float eyeY = 0.0f;
	float eyeZ = 0.0f;
	float targetX = 0.0f;
	float targetY = 0.0f;
	float targetZ = 0.0f;
	float renderSpan = 0.0f;
	float lift = 0.0f;
};

void configure_terrain_visual_camera(
	CameraClass *camera,
	const ProbeTerrainMapPatchLoad &load,
	bool use_load_window,
	Int render_window_cells,
	float target_offset_x,
	float target_offset_y,
	ProbeTerrainCameraView &view)
{
	if (camera == nullptr) {
		return;
	}

	camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
	const float camera_far_clip = use_load_window ? 6000.0f : 1000.0f;
	camera->Set_Clip_Planes(1.0f, camera_far_clip);
	const float terrain_center_z = static_cast<float>(load.patchCenterHeight) * MAP_HEIGHT_SCALE;
	const float render_span = static_cast<float>(std::max(1, render_window_cells)) * MAP_XY_FACTOR;
	const float camera_lift = use_load_window ? std::max(360.0f, render_span * 0.7f) : 240.0f;
	const float base_target_x = use_load_window ?
		(static_cast<float>(load.patchOriginX) +
		 static_cast<float>(render_window_cells) * 0.5f -
		 static_cast<float>(load.border)) * MAP_XY_FACTOR :
		0.0f;
	const float base_target_y = use_load_window ?
		(static_cast<float>(load.patchOriginY) +
		 static_cast<float>(render_window_cells) * 0.5f -
		 static_cast<float>(load.border)) * MAP_XY_FACTOR :
		0.0f;
	view.targetX = base_target_x + target_offset_x;
	view.targetY = base_target_y + target_offset_y;
	view.targetZ = use_load_window ? terrain_center_z : terrain_center_z - 180.0f;
	view.eyeX = view.targetX;
	view.eyeY = view.targetY + render_span * 1.5f;
	view.eyeZ = view.targetZ + camera_lift;
	view.renderSpan = render_span;
	view.lift = camera_lift;

	Matrix3D camera_transform(true);
	camera_transform.Look_At(
		Vector3(view.eyeX, view.eyeY, view.eyeZ),
		Vector3(view.targetX, view.targetY, view.targetZ),
		0.0f);
	camera->Set_Transform(camera_transform);
}

void record_parsed_map_metrics(ProbeTerrainMapPatchLoad &load)
{
	if (load.map == nullptr || load.map->getDataPtr() == nullptr) {
		return;
	}

	load.width = load.map->getXExtent();
	load.height = load.map->getYExtent();
	load.border = load.map->getBorderSizeInline();
	load.drawWidth = load.map->getDrawWidth();
	load.drawHeight = load.map->getDrawHeight();
	const Int data_size = load.width * load.height;
	load.firstHeight = data_size > 0 ? load.map->getDataPtr()[0] : 0;
	load.heightChecksum = checksum_bytes(load.map->getDataPtr(), static_cast<std::size_t>(data_size));

	const Int max_origin_x = std::max(0, load.width - (load.patchCells + 1));
	const Int max_origin_y = std::max(0, load.height - (load.patchCells + 1));
	load.patchOriginX = std::min(std::max(load.border, 0), max_origin_x);
	load.patchOriginY = std::min(std::max(load.border, 0), max_origin_y);
	record_patch_height_metrics(load);
}

class ProbeLogicalScriptEngineScope
{
public:
	ProbeLogicalScriptEngineScope() :
		m_oldScriptEngine(TheScriptEngine),
		m_scriptEngine(sharedScriptEngine())
	{
		TheScriptEngine = m_scriptEngine;
	}

	~ProbeLogicalScriptEngineScope()
	{
		TheScriptEngine = m_oldScriptEngine;
	}

	bool installed() const
	{
		return m_scriptEngine != nullptr && TheScriptEngine == m_scriptEngine;
	}

private:
	static ScriptEngine *sharedScriptEngine()
	{
		alignas(ScriptEngine) static unsigned char storage[sizeof(ScriptEngine)];
		static ScriptEngine *script_engine = nullptr;
		static bool initialized = false;
		if (!initialized) {
			script_engine = new (storage) ScriptEngine();
			if (TheWritableGlobalData != nullptr) {
				script_engine->init();
			}
			initialized = true;
		}
		return script_engine;
	}

	ScriptEngine *m_oldScriptEngine = nullptr;
	ScriptEngine *m_scriptEngine = nullptr;
};

class ProbeNoopScriptEngine final : public ScriptEngine
{
public:
	void init() override {}
	void reset() override {}
	void update() override {}
	void newMap() override {}
	void notifyOfObjectDestruction(Object *) override {}
};

class ProbeNoopScriptEngineScope
{
public:
	ProbeNoopScriptEngineScope() :
		m_oldScriptEngine(TheScriptEngine),
		m_scriptEngine(sharedScriptEngine())
	{
		TheScriptEngine = m_scriptEngine;
	}

	~ProbeNoopScriptEngineScope()
	{
		TheScriptEngine = m_oldScriptEngine;
	}

	bool installed() const
	{
		return m_scriptEngine != nullptr && TheScriptEngine == m_scriptEngine;
	}

private:
	static ScriptEngine *sharedScriptEngine()
	{
		alignas(ProbeNoopScriptEngine) static unsigned char storage[sizeof(ProbeNoopScriptEngine)];
		static ScriptEngine *script_engine =
			new (storage) ProbeNoopScriptEngine();
		return script_engine;
	}

	ScriptEngine *m_oldScriptEngine = nullptr;
	ScriptEngine *m_scriptEngine = nullptr;
};

class ProbeLogicalTerrainGlobalScope
{
public:
	ProbeLogicalTerrainGlobalScope(
		MapCache *mapCache,
		GameClient *gameClient,
		ThingFactory *thingFactory,
		TerrainLogic *terrainLogic,
		AI *ai = nullptr) :
		m_oldTerrainLogic(TheTerrainLogic),
		m_oldMapCache(TheMapCache),
		m_oldGameClient(TheGameClient),
		m_oldThingFactory(TheThingFactory),
		m_oldAI(TheAI)
	{
		TheMapCache = mapCache;
		TheGameClient = gameClient;
		TheThingFactory = thingFactory;
		TheTerrainLogic = terrainLogic;
		if (ai != nullptr) {
			TheAI = ai;
		}
	}

	~ProbeLogicalTerrainGlobalScope()
	{
		TheAI = m_oldAI;
		TheTerrainLogic = m_oldTerrainLogic;
		TheThingFactory = m_oldThingFactory;
		TheGameClient = m_oldGameClient;
		TheMapCache = m_oldMapCache;
	}

private:
	TerrainLogic *m_oldTerrainLogic = nullptr;
	MapCache *m_oldMapCache = nullptr;
	GameClient *m_oldGameClient = nullptr;
	ThingFactory *m_oldThingFactory = nullptr;
	AI *m_oldAI = nullptr;
};

class W3DDefaultDraw : public DrawModule
{
	MEMORY_POOL_GLUE_WITH_EXPLICIT_CREATE(W3DDefaultDraw, "ProbeW3DDefaultDraw", 4, 4)
	MAKE_STANDARD_MODULE_MACRO(W3DDefaultDraw)

public:
	W3DDefaultDraw(Thing *thing, const ModuleData *moduleData) :
		DrawModule(thing, moduleData)
	{
	}

	static ModuleType getModuleType() { return MODULETYPE_DRAW; }
	static Int getInterfaceMask() { return MODULEINTERFACE_DRAW; }

	virtual void doDrawModule(const Matrix3D *) override {}
	virtual void setShadowsEnabled(Bool) override {}
	virtual void releaseShadows() override {}
	virtual void allocateShadows() override {}
	virtual void setFullyObscuredByShroud(Bool) override {}
	virtual void reactToTransformChange(const Matrix3D *, const Coord3D *, Real) override {}
	virtual void reactToGeometryChange() override {}
};

W3DDefaultDraw::~W3DDefaultDraw()
{
}

void W3DDefaultDraw::crc(Xfer *)
{
}

void W3DDefaultDraw::xfer(Xfer *)
{
}

void W3DDefaultDraw::loadPostProcess()
{
}

class ProbeBridgeModuleFactory final : public ModuleFactory
{
public:
	void init() override
	{
		addModule(BridgeBehavior);
		addModule(BridgeScaffoldBehavior);
		addModule(BridgeTowerBehavior);
		addModule(ActiveBody);
		addModule(ImmortalBody);
		addModule(W3DDefaultDraw);
	}
};

class ProbeTerrainLogicForBridgeDraw final : public W3DTerrainLogic
{
public:
	ProbeTerrainLogicForBridgeDraw()
	{
		clearProbeExtent();
		clearPathfinderProbeExtent();
		clearPathfinderTerrainQueryMetrics();
	}

	void addBridgeToLogic(
		BridgeInfo *info,
		Dict *props,
		AsciiString bridgeTemplateName) override
	{
		extendProbeExtent(info);
		Bridge *bridge = newInstance(Bridge)(*info, props, bridgeTemplateName);
		bridge->setNext(m_bridgeListHead);
		m_bridgeListHead = bridge;
		PathfindLayerEnum layer = TheAI->pathfinder()->addBridge(bridge);
		bridge->setLayer(layer);
	}

	void updateBridgeDamageStates(void) override
	{
		W3DTerrainLogic::updateBridgeDamageStates();
	}

	Real getGroundHeight(Real, Real, Coord3D *normal = NULL) const override
	{
		if (normal != NULL) {
			normal->x = 0.0f;
			normal->y = 0.0f;
			normal->z = 1.0f;
		}
		return 0.0f;
	}

	Real getLayerHeight(Real x, Real y, PathfindLayerEnum, Coord3D *normal = NULL, Bool = true) const override
	{
		return getGroundHeight(x, y, normal);
	}

	Bool isCliffCell(Real x, Real y) const override
	{
		Bool cliff = FALSE;
		if (TheTerrainRenderObject != nullptr) {
			cliff = W3DTerrainLogic::isCliffCell(x, y);
		}
		if (m_recordPathfinderTerrainQueries) {
			++m_pathfinderTerrainCliffQueries;
			if (TheTerrainRenderObject != nullptr) {
				++m_pathfinderTerrainCliffRenderObjectQueries;
			}
			if (cliff) {
				++m_pathfinderTerrainCliffTrueCells;
			}
		}
		return cliff;
	}

	Bool isUnderwater(Real, Real, Real *waterZ = NULL, Real *terrainZ = NULL) override
	{
		if (m_recordPathfinderTerrainQueries) {
			++m_pathfinderTerrainFlatWaterQueries;
		}
		if (waterZ != NULL) {
			*waterZ = 0.0f;
		}
		if (terrainZ != NULL) {
			*terrainZ = 0.0f;
		}
		return FALSE;
	}

	void getExtent(Region3D *extent) const override
	{
		if (extent == NULL) {
			return;
		}
		if (m_usePathfinderProbeExtent) {
			*extent = m_pathfinderProbeExtent;
			return;
		}
		if (!m_hasProbeExtent) {
			extent->lo.x = 0.0f;
			extent->lo.y = 0.0f;
			extent->lo.z = 0.0f;
			extent->hi.x = MAP_XY_FACTOR;
			extent->hi.y = MAP_XY_FACTOR;
			extent->hi.z = MAP_XY_FACTOR;
			return;
		}

		*extent = m_probeExtent;
		const Real margin = MAP_XY_FACTOR;
		extent->lo.x -= margin;
		extent->lo.y -= margin;
		extent->hi.x += margin;
		extent->hi.y += margin;
	}

	void getExtentIncludingBorder(Region3D *extent) const override { getExtent(extent); }
	void getMaximumPathfindExtent(Region3D *extent) const override { getExtent(extent); }

	struct BridgeDamageAttemptForProbe
	{
		BodyDamageType state = BODY_PRISTINE;
		Real health = -1.0f;
		Real maxHealth = -1.0f;
		Real actualDamageDealt = -1.0f;
		Real actualDamageClipped = -1.0f;
		Bool noEffect = FALSE;
		Bool objectStillPresent = FALSE;
		Bool destroyedStatus = FALSE;
	};

	struct BridgeDisabledTimerForProbe
	{
		Bool clearInactiveReturned = TRUE;
		Bool initiallyDisabled = TRUE;
		UnsignedInt initialDisabledUntilAny = 0;
		UnsignedInt frameBeforeSet = 0;
		UnsignedInt expirationFrame = 0;
		Bool disabledAfterSet = FALSE;
		Bool disabledByEmpAfterSet = FALSE;
		UnsignedInt disabledUntilEmpAfterSet = 0;
		UnsignedInt disabledUntilAnyAfterSet = 0;
		Bool disabledAfterEarlyCheck = FALSE;
		Bool disabledByEmpAfterEarlyCheck = FALSE;
		UnsignedInt disabledUntilEmpAfterEarlyCheck = 0;
		UnsignedInt disabledUntilAnyAfterEarlyCheck = 0;
		UnsignedInt frameAfterExpiryCheck = 0;
		Bool disabledAfterExpiryCheck = TRUE;
		Bool disabledByEmpAfterExpiryCheck = TRUE;
		UnsignedInt disabledUntilEmpAfterExpiryCheck = 0;
		UnsignedInt disabledUntilAnyAfterExpiryCheck = 0;
	};

	struct BridgeInvulnerableStateForProbe
	{
		Bool initiallyUndetectedDefector = TRUE;
		Bool undetectedDefectorAfterPositive = FALSE;
		Bool undetectedDefectorAfterZero = TRUE;
	};

	struct BridgeObjectLookupForProbe
	{
		ObjectID bridgeObjectID = INVALID_ID;
		ObjectID foundObjectID = INVALID_ID;
		Bool foundBridgeObject = FALSE;
		Bool foundMatchesBridgeID = FALSE;
		Bool invalidIDLookupNull = FALSE;
		Bool highIDLookupNull = FALSE;
	};

	struct BridgePathfinderCellSampleForProbe
	{
		Int extentMaxX = -1;
		Int extentMaxY = -1;
		Int bridgeLayerCells = 0;
		Int bridgeLayerClearCells = 0;
		Int bridgeLayerBridgeImpassableCells = 0;
		Int bridgeLayerGroundConnections = 0;
		Int groundCells = 0;
		Int groundBridgeConnections = 0;
		Int centerCellType = -1;
		Int centerConnectLayer = -1;
		Bool centerCellOnBridgeLayer = FALSE;
	};

	struct BridgePathfinderMapForProbe
	{
		PathfindLayerEnum layer = LAYER_GROUND;
		Int preflightMinX = 0;
		Int preflightMinY = 0;
		Int preflightMaxX = 0;
		Int preflightMaxY = 0;
		UnsignedInt preflightEstimatedMapCells = 0;
		Bool newMapSkippedForBrowserSafety = FALSE;
		Bool newMapInvoked = FALSE;
		Bool newMapException = FALSE;
		Int terrainCliffQueries = 0;
		Int terrainCliffRenderObjectQueries = 0;
		Int terrainCliffTrueCells = 0;
		Int terrainFlatWaterQueries = 0;
		Bool changeToBrokenInvoked = FALSE;
		Bool changeToRepairedInvoked = FALSE;
		BridgePathfinderCellSampleForProbe afterNewMap;
		BridgePathfinderCellSampleForProbe afterBroken;
		BridgePathfinderCellSampleForProbe afterRepaired;
	};

	struct BridgeDestroyListForProbe
	{
		ObjectID bridgeObjectID = INVALID_ID;
		UnsignedInt objectCountBeforeDestroy = 0;
		UnsignedInt objectCountAfterDestroyObject = 0;
		UnsignedInt objectCountAfterProcess = 0;
		Bool lookupBeforeDestroy = FALSE;
		Bool destroyedBeforeDestroy = TRUE;
		Bool destroyedAfterDestroyObject = FALSE;
		Bool lookupAfterDestroyObject = FALSE;
		Bool lookupAfterProcessNull = FALSE;
	};

	Int bridgeCountForProbe() const
	{
		Int count = 0;
		for (Bridge *bridge = m_bridgeListHead; bridge != nullptr; bridge = bridge->getNext()) {
			++count;
		}
		return count;
	}

	bool firstBridgeForProbe(BridgeInfo &info, PathfindLayerEnum &layer) const
	{
		if (m_bridgeListHead == nullptr) {
			return false;
		}
		m_bridgeListHead->getBridgeInfo(&info);
		layer = m_bridgeListHead->getLayer();
		return true;
	}

	Object *firstBridgeObjectForProbe() const
	{
		if (m_bridgeListHead == nullptr || TheGameLogic == nullptr) {
			return nullptr;
		}
		const BridgeInfo *info = m_bridgeListHead->peekBridgeInfo();
		if (info == nullptr || info->bridgeObjectID == INVALID_ID) {
			return nullptr;
		}
		return TheGameLogic->findObjectByID(info->bridgeObjectID);
	}

	bool verifyFirstBridgeObjectLookupForProbe(
		BridgeObjectLookupForProbe &lookup) const
	{
		if (m_bridgeListHead == nullptr || TheGameLogic == nullptr) {
			return false;
		}
		const BridgeInfo *info = m_bridgeListHead->peekBridgeInfo();
		if (info == nullptr || info->bridgeObjectID == INVALID_ID) {
			return false;
		}

		const ObjectID kHighUnusedObjectID = static_cast<ObjectID>(1000000);
		lookup.bridgeObjectID = info->bridgeObjectID;
		Object *bridge_object = TheGameLogic->findObjectByID(info->bridgeObjectID);
		lookup.foundBridgeObject = bridge_object != nullptr;
		if (bridge_object != nullptr) {
			lookup.foundObjectID = bridge_object->getID();
			lookup.foundMatchesBridgeID =
				lookup.foundObjectID == lookup.bridgeObjectID;
		}
		lookup.invalidIDLookupNull =
			TheGameLogic->findObjectByID(INVALID_ID) == nullptr;
		lookup.highIDLookupNull =
			TheGameLogic->findObjectByID(kHighUnusedObjectID) == nullptr;
		return true;
	}

	bool exerciseFirstBridgeDestroyListForProbe(
		GameLogic &logic,
		BridgeDestroyListForProbe &state) const
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		if (bridge_object == nullptr || TheGameLogic == nullptr) {
			return false;
		}

		state.bridgeObjectID = bridge_object->getID();
		state.objectCountBeforeDestroy = logic.getObjectCount();
		state.lookupBeforeDestroy =
			TheGameLogic->findObjectByID(state.bridgeObjectID) == bridge_object;
		state.destroyedBeforeDestroy = bridge_object->isDestroyed();

		logic.destroyObject(bridge_object);
		state.objectCountAfterDestroyObject = logic.getObjectCount();
		state.destroyedAfterDestroyObject = bridge_object->isDestroyed();
		state.lookupAfterDestroyObject =
			TheGameLogic->findObjectByID(state.bridgeObjectID) == bridge_object;

		logic.cncPortProcessDestroyListForProbe();
		state.objectCountAfterProcess = logic.getObjectCount();
		state.lookupAfterProcessNull =
			TheGameLogic->findObjectByID(state.bridgeObjectID) == nullptr;
		return true;
	}

	bool firstBridgeBodyDamageStateForProbe(
		BodyDamageType &state,
		Real &health,
		Real &max_health) const
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		if (bridge_object == nullptr || bridge_object->getBodyModule() == nullptr) {
			return false;
		}
		BodyModuleInterface *body = bridge_object->getBodyModule();
		state = body->getDamageState();
		health = body->getHealth();
		max_health = body->getMaxHealth();
		return true;
	}

	bool attemptFirstBridgeDamageForProbe(
		Real amount,
		BridgeDamageAttemptForProbe &attempt)
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		if (bridge_object == nullptr || bridge_object->getBodyModule() == nullptr) {
			return false;
		}
		DamageInfo damage_info;
		damage_info.in.m_damageType = DAMAGE_UNRESISTABLE;
		damage_info.in.m_deathType = DEATH_NORMAL;
		damage_info.in.m_sourceID = INVALID_ID;
		damage_info.in.m_amount = amount;
		bridge_object->attemptDamage(&damage_info);
		BodyModuleInterface *body = bridge_object->getBodyModule();
		attempt.state = body->getDamageState();
		attempt.health = body->getHealth();
		attempt.maxHealth = body->getMaxHealth();
		attempt.actualDamageDealt = damage_info.out.m_actualDamageDealt;
		attempt.actualDamageClipped = damage_info.out.m_actualDamageClipped;
		attempt.noEffect = damage_info.out.m_noEffect;
		attempt.objectStillPresent = TRUE;
		attempt.destroyedStatus =
			bridge_object->testStatus(OBJECT_STATUS_DESTROYED);
		return true;
	}

	bool killFirstBridgeForProbe(BridgeDamageAttemptForProbe &attempt)
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		if (bridge_object == nullptr || bridge_object->getBodyModule() == nullptr) {
			return false;
		}
		bridge_object->kill(DAMAGE_UNRESISTABLE, DEATH_NORMAL);
		Object *bridge_object_after_kill = firstBridgeObjectForProbe();
		if (bridge_object_after_kill == nullptr ||
				bridge_object_after_kill->getBodyModule() == nullptr) {
			attempt.objectStillPresent = FALSE;
			return true;
		}
		BodyModuleInterface *body = bridge_object_after_kill->getBodyModule();
		attempt.state = body->getDamageState();
		attempt.health = body->getHealth();
		attempt.maxHealth = body->getMaxHealth();
		attempt.objectStillPresent = TRUE;
		attempt.destroyedStatus =
			bridge_object_after_kill->testStatus(OBJECT_STATUS_DESTROYED);
		return true;
	}

	bool attemptFirstBridgeSoleHealingForProbe(
		Real amount,
		UnsignedInt duration,
		Bool &null_source_accepted,
		Bool &first_accepted,
		Bool &repeat_accepted,
		Bool &benefactor_matches_bridge,
		BridgeDamageAttemptForProbe &attempt)
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		if (bridge_object == nullptr || bridge_object->getBodyModule() == nullptr) {
			return false;
		}
		null_source_accepted =
			bridge_object->attemptHealingFromSoleBenefactor(amount, nullptr, duration);
		first_accepted =
			bridge_object->attemptHealingFromSoleBenefactor(amount, bridge_object, duration);
		repeat_accepted =
			bridge_object->attemptHealingFromSoleBenefactor(amount, bridge_object, duration);
		benefactor_matches_bridge =
			bridge_object->getSoleHealingBenefactor() == bridge_object->getID();

		BodyModuleInterface *body = bridge_object->getBodyModule();
		attempt.state = body->getDamageState();
		attempt.health = body->getHealth();
		attempt.maxHealth = body->getMaxHealth();
		attempt.objectStillPresent = TRUE;
		attempt.destroyedStatus =
			bridge_object->testStatus(OBJECT_STATUS_DESTROYED);
		return true;
	}

	bool exerciseFirstBridgeDisabledTimerForProbe(
		GameLogic &logic,
		UnsignedInt duration,
		BridgeDisabledTimerForProbe &timer)
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		if (bridge_object == nullptr) {
			return false;
		}

		timer.initiallyDisabled = bridge_object->isDisabled();
		timer.initialDisabledUntilAny =
			bridge_object->getDisabledUntil(DISABLED_ANY);
		timer.clearInactiveReturned = bridge_object->clearDisabled(DISABLED_EMP);
		timer.frameBeforeSet = logic.getFrame();
		timer.expirationFrame = timer.frameBeforeSet + duration;

		bridge_object->setDisabledUntil(DISABLED_EMP, timer.expirationFrame);
		timer.disabledAfterSet = bridge_object->isDisabled();
		timer.disabledByEmpAfterSet =
			bridge_object->isDisabledByType(DISABLED_EMP);
		timer.disabledUntilEmpAfterSet =
			bridge_object->getDisabledUntil(DISABLED_EMP);
		timer.disabledUntilAnyAfterSet =
			bridge_object->getDisabledUntil(DISABLED_ANY);

		bridge_object->checkDisabledStatus();
		timer.disabledAfterEarlyCheck = bridge_object->isDisabled();
		timer.disabledByEmpAfterEarlyCheck =
			bridge_object->isDisabledByType(DISABLED_EMP);
		timer.disabledUntilEmpAfterEarlyCheck =
			bridge_object->getDisabledUntil(DISABLED_EMP);
		timer.disabledUntilAnyAfterEarlyCheck =
			bridge_object->getDisabledUntil(DISABLED_ANY);

		while (logic.getFrame() < timer.expirationFrame) {
			logic.cncPortAdvanceFrameForProbe();
		}
		bridge_object->checkDisabledStatus();
		timer.frameAfterExpiryCheck = logic.getFrame();
		timer.disabledAfterExpiryCheck = bridge_object->isDisabled();
		timer.disabledByEmpAfterExpiryCheck =
			bridge_object->isDisabledByType(DISABLED_EMP);
		timer.disabledUntilEmpAfterExpiryCheck =
			bridge_object->getDisabledUntil(DISABLED_EMP);
		timer.disabledUntilAnyAfterExpiryCheck =
			bridge_object->getDisabledUntil(DISABLED_ANY);
		return true;
	}

	bool exerciseFirstBridgeInvulnerableStateForProbe(
		BridgeInvulnerableStateForProbe &state)
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		if (bridge_object == nullptr) {
			return false;
		}

		state.initiallyUndetectedDefector =
			bridge_object->getIsUndetectedDefector();
		bridge_object->goInvulnerable(4);
		state.undetectedDefectorAfterPositive =
			bridge_object->getIsUndetectedDefector();
		bridge_object->goInvulnerable(0);
		state.undetectedDefectorAfterZero =
			bridge_object->getIsUndetectedDefector();
		return true;
	}

	bool updateFirstBridgeDamageStateForProbe(
		BridgeInfo &info,
		PathfindLayerEnum &layer,
		bool &broken,
		bool &repaired)
	{
		Object *bridge_object = firstBridgeObjectForProbe();
		updateBridgeDamageStates();
		broken = isBridgeBroken(bridge_object);
		repaired = isBridgeRepaired(bridge_object);
		return firstBridgeForProbe(info, layer);
	}

	bool exerciseFirstBridgePathfinderMapForProbe(
		BridgePathfinderMapForProbe &state)
	{
		if (m_bridgeListHead == nullptr ||
				TheAI == nullptr ||
				TheAI->pathfinder() == nullptr) {
			return false;
		}

		state.layer = m_bridgeListHead->getLayer();
		enableOriginPathfinderProbeExtent();
		probe_bridge_phase_log("pathfinder-preflight");
		recordFirstBridgePathfinderPreflightForProbe(state);
		if (state.newMapSkippedForBrowserSafety) {
			clearPathfinderProbeExtent();
			probe_bridge_phase_log("pathfinder-new-map-skipped");
			probe_bridge_phase_log("pathfinder-change-broken");
			TheAI->pathfinder()->changeBridgeState(state.layer, FALSE);
			state.changeToBrokenInvoked = TRUE;
			probe_bridge_phase_log("pathfinder-change-repaired");
			TheAI->pathfinder()->changeBridgeState(state.layer, TRUE);
			state.changeToRepairedInvoked = TRUE;
			probe_bridge_phase_log("pathfinder-change-done");
			return true;
		}

		probe_bridge_phase_log("pathfinder-new-map");
		state.newMapInvoked = TRUE;
		beginPathfinderTerrainQueryMetrics();
		try {
			TheAI->pathfinder()->newMap();
		} catch (...) {
			endPathfinderTerrainQueryMetrics(state);
			clearPathfinderProbeExtent();
			state.newMapException = TRUE;
			return true;
		}
		endPathfinderTerrainQueryMetrics(state);
		clearPathfinderProbeExtent();

		sampleFirstBridgePathfinderCellsForProbe(state.afterNewMap);
		probe_bridge_phase_log("pathfinder-change-broken");
		TheAI->pathfinder()->changeBridgeState(state.layer, FALSE);
		state.changeToBrokenInvoked = TRUE;
		sampleFirstBridgePathfinderCellsForProbe(state.afterBroken);
		probe_bridge_phase_log("pathfinder-change-repaired");
		TheAI->pathfinder()->changeBridgeState(state.layer, TRUE);
		state.changeToRepairedInvoked = TRUE;
		sampleFirstBridgePathfinderCellsForProbe(state.afterRepaired);
		probe_bridge_phase_log("pathfinder-change-done");
		return true;
	}

private:
	void recordFirstBridgePathfinderPreflightForProbe(
		BridgePathfinderMapForProbe &state) const
	{
		Region3D terrain_extent;
		getMaximumPathfindExtent(&terrain_extent);
		state.preflightMinX =
			REAL_TO_INT_FLOOR(terrain_extent.lo.x / PATHFIND_CELL_SIZE_F);
		state.preflightMaxX =
			REAL_TO_INT_FLOOR(terrain_extent.hi.x / PATHFIND_CELL_SIZE_F) - 1;
		state.preflightMinY =
			REAL_TO_INT_FLOOR(terrain_extent.lo.y / PATHFIND_CELL_SIZE_F);
		state.preflightMaxY =
			REAL_TO_INT_FLOOR(terrain_extent.hi.y / PATHFIND_CELL_SIZE_F) - 1;

		const UnsignedInt estimated_columns =
			state.preflightMaxX >= 0 ?
				static_cast<UnsignedInt>(state.preflightMaxX + 1) :
				0;
		const UnsignedInt estimated_rows =
			state.preflightMaxY >= 0 ?
				static_cast<UnsignedInt>(state.preflightMaxY + 1) :
				0;
		state.preflightEstimatedMapCells = estimated_columns * estimated_rows;
		const UnsignedInt kBrowserSafePathfinderNewMapCells = 65536;
		state.newMapSkippedForBrowserSafety =
			state.preflightMinX < 0 ||
			state.preflightMinY < 0 ||
			state.preflightEstimatedMapCells >
				kBrowserSafePathfinderNewMapCells;
	}

	void clearProbeExtent()
	{
		m_hasProbeExtent = FALSE;
		m_probeExtent.lo.x = 0.0f;
		m_probeExtent.lo.y = 0.0f;
		m_probeExtent.lo.z = 0.0f;
		m_probeExtent.hi.x = 0.0f;
		m_probeExtent.hi.y = 0.0f;
		m_probeExtent.hi.z = 0.0f;
	}

	void clearPathfinderProbeExtent()
	{
		m_usePathfinderProbeExtent = FALSE;
		m_pathfinderProbeExtent.lo.x = 0.0f;
		m_pathfinderProbeExtent.lo.y = 0.0f;
		m_pathfinderProbeExtent.lo.z = 0.0f;
		m_pathfinderProbeExtent.hi.x = 0.0f;
		m_pathfinderProbeExtent.hi.y = 0.0f;
		m_pathfinderProbeExtent.hi.z = 0.0f;
	}

	void clearPathfinderTerrainQueryMetrics()
	{
		m_recordPathfinderTerrainQueries = FALSE;
		m_pathfinderTerrainCliffQueries = 0;
		m_pathfinderTerrainCliffRenderObjectQueries = 0;
		m_pathfinderTerrainCliffTrueCells = 0;
		m_pathfinderTerrainFlatWaterQueries = 0;
	}

	void beginPathfinderTerrainQueryMetrics()
	{
		clearPathfinderTerrainQueryMetrics();
		m_recordPathfinderTerrainQueries = TRUE;
	}

	void endPathfinderTerrainQueryMetrics(BridgePathfinderMapForProbe &state)
	{
		m_recordPathfinderTerrainQueries = FALSE;
		state.terrainCliffQueries = m_pathfinderTerrainCliffQueries;
		state.terrainCliffRenderObjectQueries =
			m_pathfinderTerrainCliffRenderObjectQueries;
		state.terrainCliffTrueCells = m_pathfinderTerrainCliffTrueCells;
		state.terrainFlatWaterQueries = m_pathfinderTerrainFlatWaterQueries;
	}

	void enableOriginPathfinderProbeExtent()
	{
		Region3D extent;
		getExtent(&extent);
		m_pathfinderProbeExtent = extent;
		m_pathfinderProbeExtent.lo.x = 0.0f;
		m_pathfinderProbeExtent.lo.y = 0.0f;
		m_usePathfinderProbeExtent = TRUE;
	}

	void extendProbeExtent(const BridgeInfo *info)
	{
		if (info == NULL) {
			return;
		}
		includeProbeExtentPoint(info->fromLeft);
		includeProbeExtentPoint(info->fromRight);
		includeProbeExtentPoint(info->toLeft);
		includeProbeExtentPoint(info->toRight);
	}

	void includeProbeExtentPoint(const Coord3D &point)
	{
		if (!m_hasProbeExtent) {
			m_probeExtent.lo = point;
			m_probeExtent.hi = point;
			m_hasProbeExtent = TRUE;
			return;
		}

		m_probeExtent.lo.x = std::min(m_probeExtent.lo.x, point.x);
		m_probeExtent.lo.y = std::min(m_probeExtent.lo.y, point.y);
		m_probeExtent.lo.z = std::min(m_probeExtent.lo.z, point.z);
		m_probeExtent.hi.x = std::max(m_probeExtent.hi.x, point.x);
		m_probeExtent.hi.y = std::max(m_probeExtent.hi.y, point.y);
		m_probeExtent.hi.z = std::max(m_probeExtent.hi.z, point.z);
	}

	void sampleFirstBridgePathfinderCellsForProbe(
		BridgePathfinderCellSampleForProbe &sample) const
	{
		if (m_bridgeListHead == nullptr ||
				TheAI == nullptr ||
				TheAI->pathfinder() == nullptr) {
			return;
		}

		Pathfinder *pathfinder = TheAI->pathfinder();
		const ICoord2D *extent = pathfinder->getExtent();
		if (extent != nullptr) {
			sample.extentMaxX = extent->x;
			sample.extentMaxY = extent->y;
		}

		Bridge *bridge = m_bridgeListHead;
		const Region2D *bounds = bridge->getBounds();
		if (bounds == nullptr) {
			return;
		}

		const Int scan_min_x = std::max<Int>(
			0,
			REAL_TO_INT_FLOOR(
				(bounds->lo.x - PATHFIND_CELL_SIZE_F) /
				PATHFIND_CELL_SIZE_F));
		const Int scan_min_y = std::max<Int>(
			0,
			REAL_TO_INT_FLOOR(
				(bounds->lo.y - PATHFIND_CELL_SIZE_F) /
				PATHFIND_CELL_SIZE_F));
		Int scan_max_x = REAL_TO_INT_CEIL(
			(bounds->hi.x + PATHFIND_CELL_SIZE_F) /
			PATHFIND_CELL_SIZE_F);
		Int scan_max_y = REAL_TO_INT_CEIL(
			(bounds->hi.y + PATHFIND_CELL_SIZE_F) /
			PATHFIND_CELL_SIZE_F);
		if (extent != nullptr) {
			scan_max_x = std::min<Int>(scan_max_x, extent->x);
			scan_max_y = std::min<Int>(scan_max_y, extent->y);
		}

		const PathfindLayerEnum layer = bridge->getLayer();
		for (Int x = scan_min_x; x <= scan_max_x; ++x) {
			for (Int y = scan_min_y; y <= scan_max_y; ++y) {
				PathfindCell *bridge_cell = pathfinder->getCell(layer, x, y);
				if (bridge_cell != nullptr && bridge_cell->getLayer() == layer) {
					++sample.bridgeLayerCells;
					if (bridge_cell->getType() == PathfindCell::CELL_CLEAR) {
						++sample.bridgeLayerClearCells;
					}
					if (bridge_cell->getType() ==
							PathfindCell::CELL_BRIDGE_IMPASSABLE) {
						++sample.bridgeLayerBridgeImpassableCells;
					}
					if (bridge_cell->getConnectLayer() == LAYER_GROUND) {
						++sample.bridgeLayerGroundConnections;
					}
				}

				PathfindCell *ground_cell =
					pathfinder->getCell(LAYER_GROUND, x, y);
				if (ground_cell != nullptr) {
					++sample.groundCells;
					if (ground_cell->getConnectLayer() == layer) {
						++sample.groundBridgeConnections;
					}
				}
			}
		}

		BridgeInfo info;
		bridge->getBridgeInfo(&info);
		Coord3D center = info.from;
		center.x = (info.from.x + info.to.x) * 0.5f;
		center.y = (info.from.y + info.to.y) * 0.5f;
		center.z = (info.from.z + info.to.z) * 0.5f;
		PathfindCell *center_cell = pathfinder->getCell(layer, &center);
		if (center_cell != nullptr) {
			sample.centerCellType = center_cell->getType();
			sample.centerConnectLayer = center_cell->getConnectLayer();
			sample.centerCellOnBridgeLayer =
				center_cell->getLayer() == layer;
		}
	}

	Region3D m_probeExtent;
	Region3D m_pathfinderProbeExtent;
	Bool m_hasProbeExtent;
	Bool m_usePathfinderProbeExtent;
	mutable Bool m_recordPathfinderTerrainQueries;
	mutable Int m_pathfinderTerrainCliffQueries;
	mutable Int m_pathfinderTerrainCliffRenderObjectQueries;
	mutable Int m_pathfinderTerrainCliffTrueCells;
	mutable Int m_pathfinderTerrainFlatWaterQueries;
};

struct ProbeLogicalHeightMapParseTrace
{
	ProbeLogicalTerrainLoadMetrics *metrics = nullptr;
	const char *activeParser = nullptr;
};

ProbeLogicalHeightMapParseTrace *g_logical_height_map_parse_trace = nullptr;

class ProbeLogicalWorldHeightMapReader : public WorldHeightMap
{
public:
	ProbeLogicalWorldHeightMapReader() :
		WorldHeightMap()
	{
	}

	static Bool parseHeightMap(DataChunkInput &file, DataChunkInfo *info, void *userData)
	{
		recordParser("HeightMapData");
		Bool result = WorldHeightMap::ParseSizeOnlyInChunk(file, info, userData);
		if (g_logical_height_map_parse_trace != nullptr &&
				g_logical_height_map_parse_trace->metrics != nullptr &&
				result) {
			g_logical_height_map_parse_trace->metrics->logicalHeightMapParsedHeightMap = true;
		}
		return result;
	}

	static Bool parseWorldInfo(DataChunkInput &file, DataChunkInfo *info, void *userData)
	{
		recordParser("WorldInfo");
		Bool result = WorldHeightMap::ParseWorldDictDataChunk(file, info, userData);
		if (g_logical_height_map_parse_trace != nullptr &&
				g_logical_height_map_parse_trace->metrics != nullptr &&
				result) {
			g_logical_height_map_parse_trace->metrics->logicalHeightMapParsedWorldInfo = true;
		}
		return result;
	}

	static Bool parseObjects(DataChunkInput &file, DataChunkInfo *info, void *userData)
	{
		recordParser("ObjectsList");
		Bool result = WorldHeightMap::ParseObjectsDataChunk(file, info, userData);
		if (g_logical_height_map_parse_trace != nullptr &&
				g_logical_height_map_parse_trace->metrics != nullptr &&
				result) {
			g_logical_height_map_parse_trace->metrics->logicalHeightMapParsedObjects = true;
		}
		return result;
	}

	static Bool parsePolygonTriggers(DataChunkInput &file, DataChunkInfo *info, void *userData)
	{
		recordParser("PolygonTriggers");
		Bool result = PolygonTrigger::ParsePolygonTriggersDataChunk(file, info, userData);
		if (g_logical_height_map_parse_trace != nullptr &&
				g_logical_height_map_parse_trace->metrics != nullptr &&
				result) {
			g_logical_height_map_parse_trace->metrics->logicalHeightMapParsedPolygonTriggers = true;
		}
		return result;
	}

	static Bool parseSides(DataChunkInput &file, DataChunkInfo *info, void *userData)
	{
		recordParser("SidesList");
		Bool result = SidesList::ParseSidesDataChunk(file, info, userData);
		if (g_logical_height_map_parse_trace != nullptr &&
				g_logical_height_map_parse_trace->metrics != nullptr &&
				result) {
			g_logical_height_map_parse_trace->metrics->logicalHeightMapParsedSides = true;
		}
		return result;
	}

private:
	static void recordParser(const char *name)
	{
		if (g_logical_height_map_parse_trace != nullptr) {
			g_logical_height_map_parse_trace->activeParser = name;
		}
	}
};

ProbeLogicalTerrainLoadMetrics run_logical_terrain_load_probe(
	WorldHeightMap *visual_map,
	const char *map_entry)
{
	ProbeLogicalTerrainLoadMetrics metrics;
	metrics.attempted = true;
	if (visual_map == nullptr ||
			visual_map->getDataPtr() == nullptr ||
			TheWritableGlobalData == nullptr ||
			map_entry == nullptr ||
			map_entry[0] == '\0') {
		return metrics;
	}

	const VecICoord2D &boundaries = visual_map->getAllBoundaries();
	if (!boundaries.empty()) {
		metrics.expectedExtentHiX =
			static_cast<float>(boundaries[0].x) * MAP_XY_FACTOR;
		metrics.expectedExtentHiY =
			static_cast<float>(boundaries[0].y) * MAP_XY_FACTOR;
	}

	UnsignedByte min_height = visual_map->getMaxHeightValue();
	UnsignedByte max_height = 0;
	const Int visual_width = visual_map->getXExtent();
	const Int visual_height = visual_map->getYExtent();
	for (Int y = 0; y < visual_height; ++y) {
		for (Int x = 0; x < visual_width; ++x) {
			const UnsignedByte height = visual_map->getHeight(x, y);
			min_height = std::min(min_height, height);
			max_height = std::max(max_height, height);
		}
	}
	metrics.expectedMinZ = static_cast<float>(min_height) * MAP_HEIGHT_SCALE;
	metrics.expectedMaxZ = static_cast<float>(max_height) * MAP_HEIGHT_SCALE;

	MapCache map_cache;
	ProbeTerrainLogicGameClient &game_client =
		shared_probe_terrain_logic_game_client();
	game_client.resetProbeState();
	ThingFactory thing_factory;
	ProbeLogicalScriptEngineScope script_engine_scope;
	W3DTerrainLogic terrain_logic;
	ProbeLogicalTerrainGlobalScope global_scope(
		&map_cache,
		&game_client,
		&thing_factory,
		&terrain_logic);

	metrics.mapCacheInstalled = TheMapCache == &map_cache;
	metrics.gameClientInstalled = TheGameClient == &game_client;
	metrics.thingFactoryInstalled = TheThingFactory == &thing_factory;
	metrics.terrainLogicInstalled = TheTerrainLogic == &terrain_logic;
	metrics.scriptEngineInstalled = script_engine_scope.installed();

	WorldHeightMap::freeListOfMapObjects();
	metrics.failurePhase = "W3DTerrainLogic::init";
	terrain_logic.init();
	metrics.logicalHeightMapPreflightAttempted = true;
	metrics.failurePhase = "WorldHeightMap(logic-only-preflight)";
	CachedFileInputStream preflight_stream;
	metrics.logicalHeightMapPreflightStreamOpen =
		preflight_stream.open(AsciiString(map_entry)) == TRUE;
	if (metrics.logicalHeightMapPreflightStreamOpen) {
		ProbeLogicalWorldHeightMapReader *preflight_map =
			NEW_REF(ProbeLogicalWorldHeightMapReader, ());
		DataChunkInput preflight_file(&preflight_stream);
		preflight_file.registerParser(
			AsciiString("HeightMapData"),
			AsciiString::TheEmptyString,
			ProbeLogicalWorldHeightMapReader::parseHeightMap);
		preflight_file.registerParser(
			AsciiString("WorldInfo"),
			AsciiString::TheEmptyString,
			ProbeLogicalWorldHeightMapReader::parseWorldInfo);
		preflight_file.registerParser(
			AsciiString("ObjectsList"),
			AsciiString::TheEmptyString,
			ProbeLogicalWorldHeightMapReader::parseObjects);
		preflight_file.registerParser(
			AsciiString("PolygonTriggers"),
			AsciiString::TheEmptyString,
			ProbeLogicalWorldHeightMapReader::parsePolygonTriggers);
		preflight_file.registerParser(
			AsciiString("SidesList"),
			AsciiString::TheEmptyString,
			ProbeLogicalWorldHeightMapReader::parseSides);
		ProbeLogicalHeightMapParseTrace parse_trace;
		parse_trace.metrics = &metrics;
		g_logical_height_map_parse_trace = &parse_trace;
		try {
			WorldHeightMap::freeListOfMapObjects();
			PolygonTrigger::deleteTriggers();
			if (TheSidesList != nullptr) {
				TheSidesList->emptySides();
			}
			metrics.logicalHeightMapPreflightReturned =
				preflight_file.parse(preflight_map) == TRUE;
			metrics.failurePhase.clear();
		} catch (ErrorCode error) {
			metrics.logicalHeightMapPreflightException = true;
			metrics.logicalHeightMapPreflightError = static_cast<Int>(error);
			metrics.logicalHeightMapFailedParser =
				parse_trace.activeParser != nullptr ? parse_trace.activeParser : "";
		} catch (...) {
			metrics.logicalHeightMapPreflightException = true;
			metrics.logicalHeightMapFailedParser =
				parse_trace.activeParser != nullptr ? parse_trace.activeParser : "";
		}
		if (!metrics.logicalHeightMapPreflightReturned &&
				metrics.logicalHeightMapFailedParser.empty() &&
				parse_trace.activeParser != nullptr) {
			metrics.logicalHeightMapFailedParser = parse_trace.activeParser;
		}
		g_logical_height_map_parse_trace = nullptr;
		REF_PTR_RELEASE(preflight_map);
	}
	preflight_stream.close();
	WorldHeightMap::freeListOfMapObjects();
	metrics.failurePhase = "W3DTerrainLogic::loadMap";
	try {
		metrics.loadReturned =
			terrain_logic.loadMap(AsciiString(map_entry), TRUE) == TRUE;
		metrics.failurePhase.clear();
	} catch (ErrorCode error) {
		metrics.loadException = true;
		metrics.loadReturned = false;
		metrics.loadError = static_cast<Int>(error);
	} catch (...) {
		metrics.loadException = true;
		metrics.loadReturned = false;
	}

	if (metrics.loadReturned) {
		Region3D extent;
		terrain_logic.getExtent(&extent);
		metrics.extentHiX = extent.hi.x;
		metrics.extentHiY = extent.hi.y;
		metrics.extentLoZ = extent.lo.z;
		metrics.extentHiZ = extent.hi.z;
		metrics.sourceFilename = terrain_logic.getSourceFilename().str();
		metrics.sourceFilenameMatches =
			terrain_logic.getSourceFilename().compareNoCase(map_entry) == 0;
		metrics.extentMatchesVisual =
			std::fabs(metrics.extentHiX - metrics.expectedExtentHiX) < 0.001f &&
			std::fabs(metrics.extentHiY - metrics.expectedExtentHiY) < 0.001f;
		metrics.heightRangeMatchesVisual =
			std::fabs(metrics.extentLoZ - metrics.expectedMinZ) < 0.001f &&
			std::fabs(metrics.extentHiZ - metrics.expectedMaxZ) < 0.001f;
		metrics.mapTimeOfDay = TheGlobalData->m_timeOfDay;
		metrics.timeOfDayNotified = game_client.timeOfDayNotified();
		metrics.notifiedTimeOfDay = game_client.notifiedTimeOfDay();
		metrics.firstWaypointPresent = terrain_logic.getFirstWaypoint() != nullptr;
		for (Waypoint *waypoint = terrain_logic.getFirstWaypoint(); waypoint != nullptr;
				waypoint = waypoint->getNext()) {
			++metrics.waypointCount;
		}
	}

	for (MapObject *object = MapObject::getFirstMapObject(); object != nullptr;
			object = object->getNext()) {
		++metrics.mapObjectCount;
	}
	metrics.mapObjectsPresentAfterLoad = metrics.mapObjectCount > 0;
	WorldHeightMap::freeListOfMapObjects();
	return metrics;
}

WorldHeightMap *load_archive_terrain_map_patch(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	ProbeTerrainMapPatchLoad &load)
{
	load.attempted = true;
	load.iniArgumentSupplied = ini_archive_path != nullptr && ini_archive_path[0] != '\0';
	load.mapsArgumentSupplied = maps_archive_path != nullptr && maps_archive_path[0] != '\0';
	load.terrainArgumentSupplied = terrain_archive_path != nullptr && terrain_archive_path[0] != '\0';
	if (!load.iniArgumentSupplied || !load.mapsArgumentSupplied || !load.terrainArgumentSupplied) {
		return nullptr;
	}

	load.iniArchivePath = ini_archive_path;
	load.mapsArchivePath = maps_archive_path;
	load.terrainArchivePath = terrain_archive_path;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	TerrainTypeCollection *terrain_types = nullptr;
	SidesList *sides_list = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	FileSystem *old_file_system = TheFileSystem;
	TerrainTypeCollection *old_terrain_types = TheTerrainTypes;
	SidesList *old_sides_list = TheSidesList;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;

	TheLocalFileSystem = &local_file_system;
	TheArchiveFileSystem = &archive_file_system;
	TheFileSystem = &file_system;

	load.iniArchiveLoaded = load_big_archive_path(
		archive_file_system,
		load.iniArchivePath,
		load.iniArchiveDirectory,
		load.iniArchiveMask);

	if (load.iniArchiveLoaded && TheFileSystem != nullptr) {
		FileInfo default_terrain_ini_info = {};
		load.defaultTerrainIniExists =
			archive_file_system.getFileInfo(AsciiString(kArchiveDefaultTerrainIniEntry), &default_terrain_ini_info) &&
			default_terrain_ini_info.sizeHigh == 0 &&
			default_terrain_ini_info.sizeLow > 0;

		FileInfo terrain_ini_info = {};
		load.terrainIniExists =
			archive_file_system.getFileInfo(AsciiString(kArchiveTerrainIniEntry), &terrain_ini_info) &&
			terrain_ini_info.sizeHigh == 0 &&
			terrain_ini_info.sizeLow > 0;
		if (load.terrainIniExists) {
			terrain_types = NEW TerrainTypeCollection;
			if (terrain_types != nullptr) {
				TheTerrainTypes = terrain_types;
				INI *ini = nullptr;
				try {
					ini = NEW INI;
					AsciiString terrain_ini_entry(kArchiveTerrainIniEntry);
					if (ini != nullptr) {
						if (load.defaultTerrainIniExists) {
							AsciiString default_terrain_ini_entry(kArchiveDefaultTerrainIniEntry);
							ini->load(default_terrain_ini_entry, INI_LOAD_OVERWRITE, nullptr);
							load.defaultTerrainIniParsed = true;
						}
						ini->load(terrain_ini_entry, INI_LOAD_OVERWRITE, nullptr);
					}
					load.terrainTypeCount = count_terrain_types(terrain_types);
					load.terrainIniParsed = load.terrainTypeCount > 0;
				} catch (...) {
					load.terrainIniParsed = false;
				}
				delete ini;
			}
		}
	}

	name_key_generator = NEW NameKeyGenerator;
	if (name_key_generator != nullptr) {
		name_key_generator->init();
		TheNameKeyGenerator = name_key_generator;
		load.nameKeysReady = true;
	}

	sides_list = NEW SidesList;
	if (sides_list != nullptr) {
		TheSidesList = sides_list;
		load.sidesListReady = true;
	}

	load.mapsArchiveLoaded = load_big_archive_path(
		archive_file_system,
		load.mapsArchivePath,
		load.mapsArchiveDirectory,
		load.mapsArchiveMask);
	load.terrainArchiveLoaded = load_big_archive_path(
		archive_file_system,
		load.terrainArchivePath,
		load.terrainArchiveDirectory,
		load.terrainArchiveMask);

	FileInfo map_file_info = {};
	load.mapEntryExists =
		load.terrainIniParsed &&
		load.mapsArchiveLoaded &&
		load.terrainArchiveLoaded &&
		archive_file_system.getFileInfo(AsciiString(kArchiveTerrainMapEntry), &map_file_info) &&
		map_file_info.sizeHigh == 0 &&
		map_file_info.sizeLow > 0;

	if (load.mapEntryExists) {
		File *map_file = TheFileSystem->openFile(kArchiveTerrainMapEntry, File::READ | File::BINARY);
		load.mapEntryOpenable = map_file != nullptr;
		if (map_file != nullptr) {
			load.mapBytes = map_file->size();
			map_file->close();
		}

		CachedFileInputStream stream;
		load.mapStreamOpen = stream.open(AsciiString(kArchiveTerrainMapEntry));
		if (load.mapStreamOpen) {
			try {
				load.map = NEW WorldHeightMap(&stream);
				load.mapParsed = load.map != nullptr;
				record_parsed_map_metrics(load);
				ProbeWorldHeightMapInspector::recordTextureClassLoadMetrics(
					load.map,
					terrain_types,
					TheFileSystem,
					load);
				ProbeWorldHeightMapInspector::selectLoadedPatchOrigin(load.map, load);
			} catch (...) {
				load.mapParseException = true;
				REF_PTR_RELEASE(load.map);
			}
			stream.close();
		}
	}

	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;
	TheTerrainTypes = old_terrain_types;
	TheSidesList = old_sides_list;
	TheNameKeyGenerator = old_name_key_generator;

	delete sides_list;
	delete terrain_types;
	delete name_key_generator;
	return load.map;
}

class ProbeTerrainArchiveContext
{
public:
	ProbeTerrainArchiveContext() :
		m_oldLocalFileSystem(TheLocalFileSystem),
		m_oldArchiveFileSystem(TheArchiveFileSystem),
		m_oldFileSystem(TheFileSystem),
		m_oldTerrainTypes(TheTerrainTypes),
		m_oldTerrainRoads(TheTerrainRoads),
		m_oldSidesList(TheSidesList),
		m_oldNameKeyGenerator(TheNameKeyGenerator)
	{
	}

	~ProbeTerrainArchiveContext()
	{
		TheFileSystem = m_oldFileSystem;
		TheArchiveFileSystem = m_oldArchiveFileSystem;
		TheLocalFileSystem = m_oldLocalFileSystem;
		TheTerrainTypes = m_oldTerrainTypes;
		TheTerrainRoads = m_oldTerrainRoads;
		TheSidesList = m_oldSidesList;
		TheNameKeyGenerator = m_oldNameKeyGenerator;

		delete m_sidesList;
		delete m_terrainRoads;
		delete m_terrainTypes;
		delete m_nameKeyGenerator;
	}

	bool prepare(
		const char *ini_archive_path,
		const char *maps_archive_path,
		const char *terrain_archive_path,
		ProbeTerrainMapPatchLoad &load,
		const char *map_entry = kArchiveTerrainMapEntry)
	{
		load.attempted = true;
		load.iniArgumentSupplied = ini_archive_path != nullptr && ini_archive_path[0] != '\0';
		load.mapsArgumentSupplied = maps_archive_path != nullptr && maps_archive_path[0] != '\0';
		load.terrainArgumentSupplied = terrain_archive_path != nullptr && terrain_archive_path[0] != '\0';
		if (!load.iniArgumentSupplied || !load.mapsArgumentSupplied || !load.terrainArgumentSupplied) {
			return false;
		}

		load.iniArchivePath = ini_archive_path;
		load.mapsArchivePath = maps_archive_path;
		load.terrainArchivePath = terrain_archive_path;

		TheLocalFileSystem = &m_localFileSystem;
		TheArchiveFileSystem = &m_archiveFileSystem;
		TheFileSystem = &m_fileSystem;

		load.iniArchiveLoaded = load_big_archive_path(
			m_archiveFileSystem,
			load.iniArchivePath,
			load.iniArchiveDirectory,
			load.iniArchiveMask);

		if (load.iniArchiveLoaded && TheFileSystem != nullptr) {
			FileInfo default_terrain_ini_info = {};
			load.defaultTerrainIniExists =
				m_archiveFileSystem.getFileInfo(AsciiString(kArchiveDefaultTerrainIniEntry), &default_terrain_ini_info) &&
				default_terrain_ini_info.sizeHigh == 0 &&
				default_terrain_ini_info.sizeLow > 0;

			FileInfo terrain_ini_info = {};
			load.terrainIniExists =
				m_archiveFileSystem.getFileInfo(AsciiString(kArchiveTerrainIniEntry), &terrain_ini_info) &&
				terrain_ini_info.sizeHigh == 0 &&
				terrain_ini_info.sizeLow > 0;
			if (load.terrainIniExists) {
				m_terrainTypes = NEW TerrainTypeCollection;
				if (m_terrainTypes != nullptr) {
					TheTerrainTypes = m_terrainTypes;
					INI *ini = nullptr;
					try {
						ini = NEW INI;
						AsciiString terrain_ini_entry(kArchiveTerrainIniEntry);
						if (ini != nullptr) {
							if (load.defaultTerrainIniExists) {
								AsciiString default_terrain_ini_entry(kArchiveDefaultTerrainIniEntry);
								ini->load(default_terrain_ini_entry, INI_LOAD_OVERWRITE, nullptr);
								load.defaultTerrainIniParsed = true;
							}
							ini->load(terrain_ini_entry, INI_LOAD_OVERWRITE, nullptr);
						}
						load.terrainTypeCount = count_terrain_types(m_terrainTypes);
						load.terrainIniParsed = load.terrainTypeCount > 0;
					} catch (...) {
						load.terrainIniParsed = false;
					}
					delete ini;
				}
			}

			FileInfo default_roads_ini_info = {};
			load.defaultRoadsIniExists =
				m_archiveFileSystem.getFileInfo(AsciiString(kArchiveDefaultRoadsIniEntry), &default_roads_ini_info) &&
				default_roads_ini_info.sizeHigh == 0 &&
				default_roads_ini_info.sizeLow > 0;

			FileInfo roads_ini_info = {};
			load.roadsIniExists =
				m_archiveFileSystem.getFileInfo(AsciiString(kArchiveRoadsIniEntry), &roads_ini_info) &&
				roads_ini_info.sizeHigh == 0 &&
				roads_ini_info.sizeLow > 0;
			if (load.roadsIniExists) {
				m_terrainRoads = NEW TerrainRoadCollection;
				if (m_terrainRoads != nullptr) {
					TheTerrainRoads = m_terrainRoads;
					INI *ini = nullptr;
					try {
						ini = NEW INI;
						if (ini != nullptr) {
							if (load.defaultRoadsIniExists) {
								AsciiString default_roads_ini_entry(kArchiveDefaultRoadsIniEntry);
								ini->load(default_roads_ini_entry, INI_LOAD_OVERWRITE, nullptr);
								load.defaultRoadsIniParsed = true;
							}
							AsciiString roads_ini_entry(kArchiveRoadsIniEntry);
							ini->load(roads_ini_entry, INI_LOAD_OVERWRITE, nullptr);
						}
						load.terrainRoadCount = count_terrain_roads(m_terrainRoads);
						load.terrainBridgeCount = count_terrain_bridges(m_terrainRoads);
						load.roadsIniParsed = load.terrainRoadCount > 0;
					} catch (...) {
						load.roadsIniParsed = false;
					}
					delete ini;
				}
			}
		}

		m_nameKeyGenerator = NEW NameKeyGenerator;
		if (m_nameKeyGenerator != nullptr) {
			m_nameKeyGenerator->init();
			TheNameKeyGenerator = m_nameKeyGenerator;
			load.nameKeysReady = true;
		}

		m_sidesList = NEW SidesList;
		if (m_sidesList != nullptr) {
			TheSidesList = m_sidesList;
			load.sidesListReady = true;
		}

		load.mapsArchiveLoaded = load_big_archive_path(
			m_archiveFileSystem,
			load.mapsArchivePath,
			load.mapsArchiveDirectory,
			load.mapsArchiveMask);
		load.terrainArchiveLoaded = load_big_archive_path(
			m_archiveFileSystem,
			load.terrainArchivePath,
			load.terrainArchiveDirectory,
			load.terrainArchiveMask);

		FileInfo map_file_info = {};
		load.mapEntryExists =
			load.terrainIniParsed &&
			load.mapsArchiveLoaded &&
			load.terrainArchiveLoaded &&
			m_archiveFileSystem.getFileInfo(AsciiString(map_entry), &map_file_info) &&
			map_file_info.sizeHigh == 0 &&
			map_file_info.sizeLow > 0;

		if (load.mapEntryExists) {
			File *map_file = TheFileSystem->openFile(map_entry, File::READ | File::BINARY);
			load.mapEntryOpenable = map_file != nullptr;
			if (map_file != nullptr) {
				load.mapBytes = map_file->size();
				map_file->close();
			}
		}

		return load.iniArchiveLoaded &&
			load.terrainIniParsed &&
			load.mapsArchiveLoaded &&
			load.terrainArchiveLoaded &&
			load.mapEntryExists &&
			load.mapEntryOpenable;
	}

	TerrainTypeCollection *terrainTypes() const
	{
		return m_terrainTypes;
	}

	TerrainRoadCollection *terrainRoads() const
	{
		return m_terrainRoads;
	}

	FileSystem *fileSystem()
	{
		return &m_fileSystem;
	}

	bool loadRuntimeArchiveSet(const char *runtime_archive_directory, const char *runtime_archive_mask)
	{
		if (runtime_archive_directory == nullptr || runtime_archive_directory[0] == '\0' ||
				runtime_archive_mask == nullptr || runtime_archive_mask[0] == '\0') {
			return false;
		}
		return m_archiveFileSystem.loadBigFilesFromDirectory(
			AsciiString(runtime_archive_directory),
			AsciiString(runtime_archive_mask),
			TRUE);
	}

	void activateGlobals()
	{
		TheLocalFileSystem = &m_localFileSystem;
		TheArchiveFileSystem = &m_archiveFileSystem;
		TheFileSystem = &m_fileSystem;
		TheTerrainTypes = m_terrainTypes;
		TheTerrainRoads = m_terrainRoads;
		TheSidesList = m_sidesList;
		TheNameKeyGenerator = m_nameKeyGenerator;
	}

private:
	Win32LocalFileSystem m_localFileSystem;
	Win32BIGFileSystem m_archiveFileSystem;
	FileSystem m_fileSystem;
	TerrainTypeCollection *m_terrainTypes = nullptr;
	TerrainRoadCollection *m_terrainRoads = nullptr;
	SidesList *m_sidesList = nullptr;
	NameKeyGenerator *m_nameKeyGenerator = nullptr;
	LocalFileSystem *m_oldLocalFileSystem = nullptr;
	ArchiveFileSystem *m_oldArchiveFileSystem = nullptr;
	FileSystem *m_oldFileSystem = nullptr;
	TerrainTypeCollection *m_oldTerrainTypes = nullptr;
	TerrainRoadCollection *m_oldTerrainRoads = nullptr;
	SidesList *m_oldSidesList = nullptr;
	NameKeyGenerator *m_oldNameKeyGenerator = nullptr;
};

struct ProbeWorldHeightMapBuffers
{
	std::vector<UnsignedByte> heightData;
	std::vector<UnsignedByte> flipState;
	std::vector<UnsignedByte> cliffState;
	std::vector<Short> tileIndices;
	std::vector<Short> blendTileIndices;
	std::vector<Short> extraBlendTileIndices;
	std::vector<Short> cliffInfoIndices;
	TileData *sourceTile = nullptr;
};

class ProbeWorldHeightMap : public WorldHeightMap
{
public:
	static ProbeWorldHeightMap *create(ProbeWorldHeightMapBuffers &buffers, TileData *source_tile = nullptr)
	{
		// The real constructor validates map-side editor data. This probe only
		// needs the plain fields read by getFlatTexture and doTesselatedUpdate.
		buffers.heightData.assign(kMapVertices * kMapVertices, 0);
		buffers.flipState.assign(((kMapVertices + 7) / 8) * kMapVertices, 0);
		buffers.cliffState.assign(((kMapVertices + 7) / 8) * kMapVertices, 0);
		buffers.tileIndices.assign(kMapVertices * kMapVertices, 0);
		buffers.blendTileIndices.assign(kMapVertices * kMapVertices, 0);
		buffers.extraBlendTileIndices.assign(kMapVertices * kMapVertices, 0);
		buffers.cliffInfoIndices.assign(kMapVertices * kMapVertices, 0);

		void *storage = std::calloc(1, sizeof(ProbeWorldHeightMap));
		ProbeWorldHeightMap *map = reinterpret_cast<ProbeWorldHeightMap *>(storage);
		if (map == nullptr) {
			return nullptr;
		}

		map->m_width = kMapVertices;
		map->m_height = kMapVertices;
		map->m_borderSize = 0;
		map->m_dataSize = static_cast<Int>(buffers.heightData.size());
		map->m_data = buffers.heightData.data();
		map->m_flipStateWidth = (kMapVertices + 7) / 8;
		map->m_cellFlipState = buffers.flipState.data();
		map->m_cellCliffState = buffers.cliffState.data();
		map->m_tileNdxes = buffers.tileIndices.data();
		map->m_blendTileNdxes = buffers.blendTileIndices.data();
		map->m_extraBlendTileNdxes = buffers.extraBlendTileIndices.data();
		map->m_cliffInfoNdxes = buffers.cliffInfoIndices.data();
		map->m_drawWidthX = kMapVertices;
		map->m_drawHeightY = kMapVertices;
		map->m_terrainTexHeight = 1;
		map->m_alphaTexHeight = 1;
		map->m_numBitmapTiles = 4;
		map->m_numTextureClasses = 0;
		map->m_numEdgeTextureClasses = 0;
		map->m_numBlendedTiles = 1;
		map->m_numCliffInfo = 1;

		for (int y = 0; y < kMapVertices; ++y) {
			for (int x = 0; x < kMapVertices; ++x) {
				const int ridge = ((x * 11 + y * 7 + ((x ^ y) * 3)) & 31);
				buffers.heightData[static_cast<std::size_t>(y) * kMapVertices + x] =
					static_cast<UnsignedByte>(12 + ridge);
			}
		}

		if (source_tile != nullptr) {
			buffers.sourceTile = source_tile;
		} else {
			buffers.sourceTile = new TileData;
			if (buffers.sourceTile == nullptr) {
				std::free(map);
				return nullptr;
			}
			fillProbeTile(*buffers.sourceTile);
		}
		map->m_sourceTiles[0] = buffers.sourceTile;

		return map;
	}

	static void destroy(ProbeWorldHeightMap *map, ProbeWorldHeightMapBuffers &buffers)
	{
		if (map != nullptr) {
			map->m_sourceTiles[0] = nullptr;
			std::free(map);
		}
		REF_PTR_RELEASE(buffers.sourceTile);
	}

private:
	static void fillProbeTile(TileData &tile)
	{
		UnsignedByte *pixels = tile.getDataPtr();
		for (int y = 0; y < TILE_PIXEL_EXTENT; ++y) {
			for (int x = 0; x < TILE_PIXEL_EXTENT; ++x) {
				const int index = (y * TILE_PIXEL_EXTENT + x) * TILE_BYTES_PER_PIXEL;
				pixels[index + 0] = static_cast<UnsignedByte>(32 + (y * 2)); // B
				pixels[index + 1] = static_cast<UnsignedByte>(96 + ((x + y) & 63)); // G
				pixels[index + 2] = static_cast<UnsignedByte>(144 + (x * 2)); // R
				pixels[index + 3] = 255;
			}
		}
		tile.updateMips();
	}

};

class ProbeTerrainBackground : public W3DTerrainBackground
{
public:
	void detachMapForProbe()
	{
		// The raw synthetic map is owned by ProbeWorldHeightMapBuffers.
		m_map = nullptr;
	}
};

class ProbeTerrainDiffuseOwner : public BaseHeightMapRenderObjClass
{
public:
	static ProbeTerrainDiffuseOwner *create(WorldHeightMap *map)
	{
		void *storage = std::calloc(1, sizeof(ProbeTerrainDiffuseOwner));
		ProbeTerrainDiffuseOwner *owner =
			reinterpret_cast<ProbeTerrainDiffuseOwner *>(storage);
		if (owner == nullptr) {
			return nullptr;
		}
		owner->m_map = map;
		return owner;
	}

	static void destroy(ProbeTerrainDiffuseOwner *owner)
	{
		std::free(owner);
	}
};

class ProbeW3DTerrainVisual : public W3DTerrainVisual
{
public:
	bool installTerrainRenderObject(BaseHeightMapRenderObjClass *render_object)
	{
		if (render_object == nullptr) {
			return false;
		}

		m_terrainRenderObject = render_object;
		m_terrainRenderObject->Set_Collision_Type(PICK_TYPE_TERRAIN);
		TheTerrainRenderObject = m_terrainRenderObject;
		return true;
	}

	BaseHeightMapRenderObjClass *terrainRenderObject() const
	{
		return m_terrainRenderObject;
	}

	bool hasWaterRenderObject() const
	{
		return m_waterRenderObject != nullptr;
	}

	WaterRenderObjClass *waterRenderObject() const
	{
		return m_waterRenderObject;
	}
};

struct ProbePolygonTriggerMetrics
{
	Int total = 0;
	Int water = 0;
	Int river = 0;
	Int firstWaterPoints = 0;
	Int firstWaterZ = 0;
};

ProbePolygonTriggerMetrics collect_polygon_trigger_metrics()
{
	ProbePolygonTriggerMetrics metrics;
	for (PolygonTrigger *trigger = PolygonTrigger::getFirstPolygonTrigger();
			trigger != nullptr;
			trigger = trigger->getNext()) {
		++metrics.total;
		if (trigger->isWaterArea()) {
			++metrics.water;
			if (metrics.firstWaterPoints == 0) {
				metrics.firstWaterPoints = trigger->getNumPoints();
				metrics.firstWaterZ = trigger->getPoint(0)->z;
			}
			if (trigger->isRiver()) {
				++metrics.river;
			}
		}
	}
	return metrics;
}

void copy_water_settings(WaterSetting *destination)
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		destination[index] = WaterSettings[index];
	}
}

void reset_water_settings()
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		WaterSettings[index] = WaterSetting();
	}
}

Int count_loaded_water_settings()
{
	Int count = 0;
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		if (!WaterSettings[index].m_waterTextureFile.isEmpty()) {
			++count;
		}
	}
	return count;
}

Int expected_loaded_water_settings()
{
	return TIME_OF_DAY_COUNT - TIME_OF_DAY_FIRST;
}

struct ProbeWaterAssetMetrics
{
	Int requiredTextures = 0;
	Int availableTextures = 0;
	Int missingTextures = 0;
	std::string firstMissingTexture;
};

bool probe_texture_asset_available(FileSystem *file_system, const AsciiString &texture)
{
	if (file_system == nullptr || texture.isEmpty()) {
		return false;
	}

	const std::string texture_path = std::string("Art\\Textures\\") + texture.str();
	if (probe_file_exists(file_system, texture_path)) {
		return true;
	}

	std::string dds_path = texture_path;
	const std::size_t dot = dds_path.find_last_of('.');
	if (dot != std::string::npos) {
		dds_path.replace(dot, std::string::npos, ".dds");
	} else {
		dds_path += ".dds";
	}
	return probe_file_exists(file_system, dds_path);
}

void record_water_texture_asset(
	ProbeWaterAssetMetrics &metrics,
	FileSystem *file_system,
	const AsciiString &texture)
{
	if (texture.isEmpty()) {
		return;
	}

	++metrics.requiredTextures;
	if (probe_texture_asset_available(file_system, texture)) {
		++metrics.availableTextures;
		return;
	}

	++metrics.missingTextures;
	if (metrics.firstMissingTexture.empty()) {
		metrics.firstMissingTexture = texture.str();
	}
}

ProbeWaterAssetMetrics collect_water_asset_metrics(FileSystem *file_system)
{
	ProbeWaterAssetMetrics metrics;
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		record_water_texture_asset(metrics, file_system, WaterSettings[index].m_skyTextureFile);
		record_water_texture_asset(metrics, file_system, WaterSettings[index].m_waterTextureFile);
	}

	const WaterTransparencySetting *water_transparency = TheWaterTransparency.getNonOverloadedPointer();
	if (water_transparency != nullptr) {
		record_water_texture_asset(metrics, file_system, water_transparency->m_standingWaterTexture);
	}

	record_water_texture_asset(metrics, file_system, AsciiString("TSMoonLarg.tga"));
	record_water_texture_asset(metrics, file_system, AsciiString("Noise0000.tga"));
	record_water_texture_asset(metrics, file_system, AsciiString("TWAlphaEdge.tga"));
	record_water_texture_asset(metrics, file_system, AsciiString("WaterSurfaceBubbles.tga"));
	record_water_texture_asset(metrics, file_system, AsciiString("wave256.tga"));
	return metrics;
}

class ProbeTerrainTileRenderObj : public RenderObjClass
{
public:
	ProbeTerrainTileRenderObj(W3DTerrainBackground *tile, Bool disable_textures) :
		m_tile(tile),
		m_disableTextures(disable_textures)
	{
	}

	RenderObjClass *Clone() const override
	{
		return nullptr;
	}

	int Class_ID() const override
	{
		return RenderObjClass::CLASSID_TILEMAP;
	}

	void Notify_Added(SceneClass *scene) override
	{
		RenderObjClass::Notify_Added(scene);
		if (scene != nullptr) {
			scene->Register(this, SceneClass::ON_FRAME_UPDATE);
		}
	}

	void Notify_Removed(SceneClass *scene) override
	{
		if (scene != nullptr) {
			scene->Unregister(this, SceneClass::ON_FRAME_UPDATE);
		}
		RenderObjClass::Notify_Removed(scene);
	}

	void Render(RenderInfoClass &rinfo) override
	{
		Matrix3D terrain_transform(true);
		terrain_transform.Set_Translation(Vector3(
			-static_cast<float>(kMapCells) * MAP_XY_FACTOR * 0.5f,
			-static_cast<float>(kMapCells) * MAP_XY_FACTOR * 0.5f,
			-180.0f));
		DX8Wrapper::Set_Transform(D3DTS_WORLD, terrain_transform);

		VertexMaterialClass *material =
			VertexMaterialClass::Get_Preset(VertexMaterialClass::PRELIT_DIFFUSE);
		DX8Wrapper::Set_Material(material);
		REF_PTR_RELEASE(material);

		ShaderClass shader = ShaderClass::_PresetOpaqueSolidShader;
		shader.Set_Cull_Mode(ShaderClass::CULL_MODE_DISABLE);
		DX8Wrapper::Set_Shader(shader);
		DX8Wrapper::Set_Texture(0, nullptr);
		DX8Wrapper::Set_Texture(1, nullptr);

		if (m_tile != nullptr) {
			m_tile->drawVisiblePolys(rinfo, m_disableTextures);
		}
	}

private:
	W3DTerrainBackground *m_tile;
	Bool m_disableTextures;
};

class ProbeW3DBibBuffer : public W3DBibBuffer
{
public:
	bool initialized() const { return m_initialized; }
	bool hasVertexBuffer() const { return m_vertexBib != nullptr; }
	bool hasIndexBuffer() const { return m_indexBib != nullptr; }
	bool hasNormalTexture() const { return m_bibTexture != nullptr; }
	bool hasHighlightTexture() const { return m_highlightBibTexture != nullptr; }
	Int numBibs() const { return m_numBibs; }
	Bool anythingChanged() const { return m_anythingChanged; }

	void freeBuffersForProbe()
	{
		freeBibBuffers();
	}
};

class ProbeW3DPropBuffer final : public W3DPropBuffer
{
public:
	bool initialized() const { return m_initialized; }
	Int numProps() const { return m_numProps; }
	Int numPropTypes() const { return m_numPropTypes; }
	bool hasPropRenderObject(Int index) const
	{
		return index >= 0 && index < m_numProps && m_props[index].m_robj != nullptr;
	}
	bool hasPropTypeRenderObject(Int index) const
	{
		return index >= 0 && index < m_numPropTypes && m_propTypes[index].m_robj != nullptr;
	}
	bool propVisible(Int index) const
	{
		return index >= 0 && index < m_numProps && m_props[index].visible;
	}
	void cullForProbe(CameraClass *camera)
	{
		cull(camera);
	}
	RenderObjClass *propRenderObject(Int index) const
	{
		return index >= 0 && index < m_numProps ? m_props[index].m_robj : nullptr;
	}
	bool anythingChanged() const { return m_anythingChanged; }
	SphereClass propBounds(Int index) const
	{
		if (index >= 0 && index < m_numProps) {
			return m_props[index].bounds;
		}
		return SphereClass(Vector3(0.0f, 0.0f, 0.0f), 1.0f);
	}
};

class ProbeW3DRoadBuffer final : public W3DRoadBuffer
{
public:
	bool initialized() const { return m_initialized; }
	Int numRoads() const { return m_numRoads; }
	Int maxRoadTypes() const { return m_maxRoadTypes; }
	Int maxRoadSegments() const { return m_maxRoadSegments; }
	Int maxRoadVertex() const { return m_maxRoadVertex; }
	Int maxRoadIndex() const { return m_maxRoadIndex; }
	Bool updateBuffers() const { return m_updateBuffers; }

	Int roadSegmentsWithVertices() const
	{
		Int count = 0;
		if (m_roads == nullptr) {
			return count;
		}
		for (Int index = 0; index < m_numRoads; ++index) {
			if (m_roads[index].GetNumVertex() > 0 && m_roads[index].GetNumIndex() > 0) {
				++count;
			}
		}
		return count;
	}

	Int roadTypesWithTextures() const
	{
		Int count = 0;
		if (m_roadTypes == nullptr) {
			return count;
		}
		for (Int index = 0; index < m_maxRoadTypes; ++index) {
			if (m_roadTypes[index].getVB() != nullptr && m_roadTypes[index].getIB() != nullptr) {
				++count;
			}
		}
		return count;
	}

	Int roadTypesWithDrawData() const
	{
		Int count = 0;
		if (m_roadTypes == nullptr) {
			return count;
		}
		for (Int index = 0; index < m_maxRoadTypes; ++index) {
			if (m_roadTypes[index].getNumVertices() > 0 && m_roadTypes[index].getNumIndices() > 0) {
				++count;
			}
		}
		return count;
	}

	Int totalRoadTypeVertices() const
	{
		Int count = 0;
		if (m_roadTypes == nullptr) {
			return count;
		}
		for (Int index = 0; index < m_maxRoadTypes; ++index) {
			count += m_roadTypes[index].getNumVertices();
		}
		return count;
	}

	Int totalRoadTypeIndices() const
	{
		Int count = 0;
		if (m_roadTypes == nullptr) {
			return count;
		}
		for (Int index = 0; index < m_maxRoadTypes; ++index) {
			count += m_roadTypes[index].getNumIndices();
		}
		return count;
	}
};

class ProbeW3DBridgeBuffer final : public W3DBridgeBuffer
{
public:
	struct BridgeDamageSyncProbe {
		Bool primed = FALSE;
		Bool observedDuringDraw = FALSE;
		Bool forcedMismatch = FALSE;
		Bool matchedTerrainAfterDraw = FALSE;
		Int bridgeIndex = -1;
		Int terrainDamageState = -1;
		Int visualStateBeforePrime = -1;
		Int visualStateBeforeDraw = -1;
		Int visualStateAfterDraw = -1;
		Int verticesBeforeDraw = -1;
		Int indicesBeforeDraw = -1;
		Int verticesAfterDraw = -1;
		Int indicesAfterDraw = -1;
	};

	bool initialized() const { return m_initialized; }
	Int numBridges() const { return m_numBridges; }
	Int curNumBridgeVertices() const { return m_curNumBridgeVertices; }
	Int curNumBridgeIndices() const { return m_curNumBridgeIndices; }
	bool hasVertexBuffer() const { return m_vertexBridge != nullptr; }
	bool hasIndexBuffer() const { return m_indexBridge != nullptr; }

	bool primeFirstBridgeDamageSyncForProbe(BodyDamageType visualState)
	{
		m_bridgeDamageSync = BridgeDamageSyncProbe();
		if (TheTerrainLogic == nullptr || m_numBridges <= 0) {
			return false;
		}
		for (Bridge *bridge = TheTerrainLogic->getFirstBridge();
				bridge != nullptr;
				bridge = bridge->getNext()) {
			BridgeInfo info;
			bridge->getBridgeInfo(&info);
			if (info.bridgeIndex < 0 || info.bridgeIndex >= m_numBridges) {
				continue;
			}
			m_bridgeDamageSync.primed = TRUE;
			m_bridgeDamageSync.bridgeIndex = info.bridgeIndex;
			m_bridgeDamageSync.terrainDamageState =
				static_cast<Int>(info.curDamageState);
			m_bridgeDamageSync.visualStateBeforePrime =
				static_cast<Int>(m_bridges[info.bridgeIndex].getDamageState());
			m_bridgeDamageSync.verticesBeforeDraw = m_curNumBridgeVertices;
			m_bridgeDamageSync.indicesBeforeDraw = m_curNumBridgeIndices;
			m_bridges[info.bridgeIndex].setDamageState(visualState);
			m_bridgeDamageSync.visualStateBeforeDraw =
				static_cast<Int>(m_bridges[info.bridgeIndex].getDamageState());
			m_bridgeDamageSync.forcedMismatch =
				m_bridgeDamageSync.visualStateBeforeDraw !=
				m_bridgeDamageSync.terrainDamageState;
			return true;
		}
		return false;
	}

	void drawBridgesWithProbe(CameraClass *camera, Bool wireframe, TextureClass *cloudTexture)
	{
		probe_bridge_phase_log("bridge-wrapper-enter");
		m_lastDrawTerrainLogicPresent = TheTerrainLogic != nullptr;
		m_lastDrawTerrainLogicBridgeCount = 0;
		if (TheTerrainLogic != nullptr) {
			for (Bridge *bridge = TheTerrainLogic->getFirstBridge();
					bridge != nullptr;
					bridge = bridge->getNext()) {
				++m_lastDrawTerrainLogicBridgeCount;
			}
		}
		W3DBridgeBuffer::drawBridges(camera, wireframe, cloudTexture);
		if (m_bridgeDamageSync.primed &&
				m_bridgeDamageSync.bridgeIndex >= 0 &&
				m_bridgeDamageSync.bridgeIndex < m_numBridges) {
			m_bridgeDamageSync.observedDuringDraw = TRUE;
			m_bridgeDamageSync.visualStateAfterDraw =
				static_cast<Int>(
					m_bridges[m_bridgeDamageSync.bridgeIndex].getDamageState());
			m_bridgeDamageSync.verticesAfterDraw = m_curNumBridgeVertices;
			m_bridgeDamageSync.indicesAfterDraw = m_curNumBridgeIndices;
			m_bridgeDamageSync.matchedTerrainAfterDraw =
				m_bridgeDamageSync.visualStateAfterDraw ==
				m_bridgeDamageSync.terrainDamageState;
		}
		m_lastDrawEnabledBridgeCount = 0;
		for (Int index = 0; index < m_numBridges; ++index) {
			if (m_bridges[index].isEnabled()) {
				++m_lastDrawEnabledBridgeCount;
			}
		}
		probe_bridge_phase_log("bridge-wrapper-exit");
	}

	bool firstBridgeInfo(BridgeInfo &info)
	{
		if (m_numBridges <= 0) {
			return false;
		}
		m_bridges[0].getBridgeInfo(&info);
		return true;
	}

	AsciiString firstBridgeTemplateName()
	{
		return m_numBridges > 0 ? m_bridges[0].getTemplateName() : AsciiString::TheEmptyString;
	}

	Int firstBridgeDamageState()
	{
		return m_numBridges > 0 ? m_bridges[0].getDamageState() : -1;
	}

	bool lastDrawTerrainLogicPresent() const { return m_lastDrawTerrainLogicPresent; }
	Int lastDrawTerrainLogicBridgeCount() const { return m_lastDrawTerrainLogicBridgeCount; }
	Int lastDrawEnabledBridgeCount() const { return m_lastDrawEnabledBridgeCount; }
	BridgeDamageSyncProbe bridgeDamageSyncProbe() const { return m_bridgeDamageSync; }

	bool firstBridgeManualGeometry(Int &vertices, Int &indices, bool &exception)
	{
		vertices = 0;
		indices = 0;
		exception = false;
		if (m_numBridges <= 0) {
			return false;
		}

		std::vector<VertexFormatXYZNDUV1> vb(MAX_BRIDGE_VERTEX + 4);
		std::vector<UnsignedShort> ib(MAX_BRIDGE_INDEX + 4);
		try {
			m_bridges[0].getIndicesNVertices(
				ib.data(),
				vb.data(),
				&indices,
				&vertices,
				nullptr);
		} catch (...) {
			exception = true;
			vertices = 0;
			indices = 0;
			return false;
		}
		return vertices > 0 && indices > 0;
	}

private:
	bool m_lastDrawTerrainLogicPresent = false;
	Int m_lastDrawTerrainLogicBridgeCount = 0;
	Int m_lastDrawEnabledBridgeCount = 0;
	BridgeDamageSyncProbe m_bridgeDamageSync;
};

class ProbeHeightMapRenderObjWithPropBuffer final : public HeightMapRenderObjClass
{
public:
	ProbeW3DPropBuffer *installProbePropBuffer()
	{
		if (m_propBuffer != nullptr) {
			delete m_propBuffer;
		}
		m_propBuffer = NEW ProbeW3DPropBuffer;
		return static_cast<ProbeW3DPropBuffer *>(m_propBuffer);
	}
};

class ProbeHeightMapRenderObjWithTreeBuffer final : public HeightMapRenderObjClass
{
public:
	W3DTreeBuffer *installProbeTreeBuffer()
	{
		if (m_treeBuffer != nullptr) {
			delete m_treeBuffer;
		}
		m_treeBuffer = NEW W3DTreeBuffer;
		return m_treeBuffer;
	}
};

class ProbeHeightMapRenderObjWithRoadBuffer final : public HeightMapRenderObjClass
{
public:
	ProbeHeightMapRenderObjWithRoadBuffer()
	{
		m_roadBuffer = nullptr;
	}

	~ProbeHeightMapRenderObjWithRoadBuffer() override
	{
		if (m_roadBuffer != nullptr) {
			delete m_roadBuffer;
			m_roadBuffer = nullptr;
		}
	}

	ProbeW3DRoadBuffer *installProbeRoadBuffer(WorldHeightMap *map)
	{
		if (m_roadBuffer != nullptr) {
			delete m_roadBuffer;
		}
		m_roadBuffer = NEW ProbeW3DRoadBuffer;
		if (m_roadBuffer != nullptr) {
			m_roadBuffer->setMap(map);
		}
		return static_cast<ProbeW3DRoadBuffer *>(m_roadBuffer);
	}

	void Render(RenderInfoClass &rinfo) override
	{
		HeightMapRenderObjClass::Render(rinfo);
		m_probeRoadDrawInvoked = false;
		if (m_roadBuffer == nullptr || m_map == nullptr || ShaderClass::Is_Backface_Culling_Inverted()) {
			return;
		}

		DX8Wrapper::Set_Texture(0, nullptr);
		DX8Wrapper::Set_Texture(1, nullptr);
		DX8Wrapper::Set_Transform(D3DTS_WORLD, Get_Transform());
		ShaderClass::Invalidate();

		const Int min_x = m_map->getDrawOrgX() - m_map->getBorderSizeInline();
		const Int min_y = m_map->getDrawOrgY() - m_map->getBorderSizeInline();
		const Int max_x = min_x + std::max(0, m_map->getDrawWidth() - 1);
		const Int max_y = min_y + std::max(0, m_map->getDrawHeight() - 1);
		m_probeRoadDrawInvoked = true;
		m_probeRoadDrawMinX = min_x;
		m_probeRoadDrawMaxX = max_x;
		m_probeRoadDrawMinY = min_y;
		m_probeRoadDrawMaxY = max_y;
		m_roadBuffer->drawRoads(
			&rinfo.Camera,
			nullptr,
			nullptr,
			m_disableTextures,
			min_x,
			max_x,
			min_y,
			max_y,
			nullptr);
	}

	bool probeRoadDrawInvoked() const { return m_probeRoadDrawInvoked; }
	Int probeRoadDrawMinX() const { return m_probeRoadDrawMinX; }
	Int probeRoadDrawMaxX() const { return m_probeRoadDrawMaxX; }
	Int probeRoadDrawMinY() const { return m_probeRoadDrawMinY; }
	Int probeRoadDrawMaxY() const { return m_probeRoadDrawMaxY; }

private:
	bool m_probeRoadDrawInvoked = false;
	Int m_probeRoadDrawMinX = 0;
	Int m_probeRoadDrawMaxX = 0;
	Int m_probeRoadDrawMinY = 0;
	Int m_probeRoadDrawMaxY = 0;
};

class ProbeHeightMapRenderObjWithShroud final : public HeightMapRenderObjClass
{
public:
	bool installProbeShroud()
	{
		if (m_shroud == nullptr) {
			m_shroud = NEW W3DShroud;
		}
		return m_shroud != nullptr;
	}

	W3DShroud *probeShroud() const
	{
		return m_shroud;
	}

	void Render(RenderInfoClass &rinfo) override
	{
		m_probeRenderInvoked = true;
		m_probeRenderSawShroud = m_shroud != nullptr;
		m_probeAdditionalPassCount = rinfo.Additional_Pass_Count();
		const WasmD3D8ShimState *before_state = wasm_d3d8_get_state();
		const UINT draw_calls_before =
			before_state != nullptr ? before_state->draw_indexed_primitive_calls : 0;
		const UINT shroud_draw_calls_before =
			before_state != nullptr ?
				before_state->draw_indexed_depth_equal_camera_space_tex0_count2_calls :
				0;
		const UINT zfunc_equal_calls_before =
			before_state != nullptr ? before_state->set_render_state_zfunc_equal_calls : 0;
		const UINT camera_space_calls_before =
			before_state != nullptr ?
				before_state->set_texture_stage_state_camera_space_texcoord_calls :
				0;
		const UINT count2_calls_before =
			before_state != nullptr ?
				before_state->set_texture_stage_state_texture_transform_count2_calls :
				0;
		m_probeDrawCallsBefore = draw_calls_before;
		HeightMapRenderObjClass::Render(rinfo);
		m_probeRenderSawShroudAfter = m_shroud != nullptr;
		m_probeAdditionalPassCountAfter = rinfo.Additional_Pass_Count();
		const WasmD3D8ShimState *after_state = wasm_d3d8_get_state();
		m_probeDrawCallsAfter =
			after_state != nullptr ? after_state->draw_indexed_primitive_calls : draw_calls_before;
		m_probeDrawCallsAfterBase = m_probeDrawCallsAfter;
		const UINT shroud_draw_calls_after =
			after_state != nullptr ?
				after_state->draw_indexed_depth_equal_camera_space_tex0_count2_calls :
				shroud_draw_calls_before;
		m_probeOriginalInstallZFuncEqualSeen =
			after_state != nullptr &&
			after_state->set_render_state_zfunc_equal_calls > zfunc_equal_calls_before;
		m_probeOriginalInstallCameraSpaceSeen =
			after_state != nullptr &&
			after_state->set_texture_stage_state_camera_space_texcoord_calls > camera_space_calls_before;
		m_probeOriginalInstallCount2Seen =
			after_state != nullptr &&
			after_state->set_texture_stage_state_texture_transform_count2_calls > count2_calls_before;
		m_probeOriginalShroudDrawSeen = shroud_draw_calls_after > shroud_draw_calls_before;
		m_probeFinalShroudDrawSeen = m_probeOriginalShroudDrawSeen;
	}

	bool probeRenderInvoked() const { return m_probeRenderInvoked; }
	bool probeRenderSawShroud() const { return m_probeRenderSawShroud; }
	bool probeRenderSawShroudAfter() const { return m_probeRenderSawShroudAfter; }
	Int probeAdditionalPassCount() const { return m_probeAdditionalPassCount; }
	Int probeAdditionalPassCountAfter() const { return m_probeAdditionalPassCountAfter; }
	bool probeOriginalShroudDrawSeen() const { return m_probeOriginalShroudDrawSeen; }
	bool probeOriginalInstallZFuncEqualSeen() const { return m_probeOriginalInstallZFuncEqualSeen; }
	bool probeOriginalInstallCameraSpaceSeen() const { return m_probeOriginalInstallCameraSpaceSeen; }
	bool probeOriginalInstallCount2Seen() const { return m_probeOriginalInstallCount2Seen; }
	bool probeFinalShroudDrawSeen() const { return m_probeFinalShroudDrawSeen; }
	bool probeFallbackInvoked() const { return m_probeFallbackInvoked; }
	UINT probeDrawCallsBefore() const { return m_probeDrawCallsBefore; }
	UINT probeDrawCallsAfter() const { return m_probeDrawCallsAfter; }
	UINT probeDrawCallsAfterBase() const { return m_probeDrawCallsAfterBase; }

private:
	bool m_probeRenderInvoked = false;
	bool m_probeRenderSawShroud = false;
	bool m_probeRenderSawShroudAfter = false;
	bool m_probeOriginalShroudDrawSeen = false;
	bool m_probeOriginalInstallZFuncEqualSeen = false;
	bool m_probeOriginalInstallCameraSpaceSeen = false;
	bool m_probeOriginalInstallCount2Seen = false;
	bool m_probeFinalShroudDrawSeen = false;
	bool m_probeFallbackInvoked = false;
	Int m_probeAdditionalPassCount = -1;
	Int m_probeAdditionalPassCountAfter = -1;
	UINT m_probeDrawCallsBefore = 0;
	UINT m_probeDrawCallsAfter = 0;
	UINT m_probeDrawCallsAfterBase = 0;
};

class ProbeShroudForwardingDisplay final : public Display
{
public:
	void configureSample(Int x, Int y)
	{
		m_sampleX = x;
		m_sampleY = y;
	}

	void resetCounters()
	{
		m_clearCalls = 0;
		m_setCalls = 0;
		m_shroudedSetCalls = 0;
		m_foggedSetCalls = 0;
		m_clearSetCalls = 0;
		m_sampleTouched = false;
		m_sampleStatus = CELLSHROUD_SHROUDED;
	}

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
	void clearShroud() override
	{
		++m_clearCalls;
		m_w3dDisplay->W3DDisplay::clearShroud();
	}
	void setShroudLevel(Int x, Int y, CellShroudStatus setting) override
	{
		++m_setCalls;
		if (setting == CELLSHROUD_SHROUDED) {
			++m_shroudedSetCalls;
		} else if (setting == CELLSHROUD_FOGGED) {
			++m_foggedSetCalls;
		} else {
			++m_clearSetCalls;
		}
		if (x == m_sampleX && y == m_sampleY) {
			m_sampleTouched = true;
			m_sampleStatus = setting;
		}
		m_w3dDisplay->W3DDisplay::setShroudLevel(x, y, setting);
	}
	void setBorderShroudLevel(UnsignedByte level) override
	{
		m_w3dDisplay->W3DDisplay::setBorderShroudLevel(level);
	}
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

	Int clearCalls() const { return m_clearCalls; }
	Int setCalls() const { return m_setCalls; }
	Int shroudedSetCalls() const { return m_shroudedSetCalls; }
	Int foggedSetCalls() const { return m_foggedSetCalls; }
	Int clearSetCalls() const { return m_clearSetCalls; }
	bool sampleTouched() const { return m_sampleTouched; }
	CellShroudStatus sampleStatus() const { return m_sampleStatus; }

private:
	alignas(W3DDisplay) unsigned char m_displayStorage[sizeof(W3DDisplay)] = {};
	W3DDisplay *m_w3dDisplay = reinterpret_cast<W3DDisplay *>(m_displayStorage);
	Int m_clearCalls = 0;
	Int m_setCalls = 0;
	Int m_shroudedSetCalls = 0;
	Int m_foggedSetCalls = 0;
	Int m_clearSetCalls = 0;
	Int m_sampleX = -1;
	Int m_sampleY = -1;
	bool m_sampleTouched = false;
	CellShroudStatus m_sampleStatus = CELLSHROUD_SHROUDED;
};

class ProbeShroudCountingRadar final : public Radar
{
public:
	void configureSample(Int x, Int y)
	{
		m_sampleX = x;
		m_sampleY = y;
	}

	void resetCounters()
	{
		m_clearCalls = 0;
		m_setCalls = 0;
		m_shroudedSetCalls = 0;
		m_foggedSetCalls = 0;
		m_clearSetCalls = 0;
		m_sampleTouched = false;
		m_sampleStatus = CELLSHROUD_SHROUDED;
	}

	void init() override {}
	void reset() override {}
	void update() override {}
	void refreshTerrain(TerrainLogic *) override {}
	void queueTerrainRefresh() override {}
	void newMap(TerrainLogic *) override {}
	void draw(Int, Int, Int, Int) override {}
	void clearShroud() override { ++m_clearCalls; }
	void setShroudLevel(Int x, Int y, CellShroudStatus setting) override
	{
		++m_setCalls;
		if (setting == CELLSHROUD_SHROUDED) {
			++m_shroudedSetCalls;
		} else if (setting == CELLSHROUD_FOGGED) {
			++m_foggedSetCalls;
		} else {
			++m_clearSetCalls;
		}
		if (x == m_sampleX && y == m_sampleY) {
			m_sampleTouched = true;
			m_sampleStatus = setting;
		}
	}

	Int clearCalls() const { return m_clearCalls; }
	Int setCalls() const { return m_setCalls; }
	Int shroudedSetCalls() const { return m_shroudedSetCalls; }
	Int foggedSetCalls() const { return m_foggedSetCalls; }
	Int clearSetCalls() const { return m_clearSetCalls; }
	bool sampleTouched() const { return m_sampleTouched; }
	CellShroudStatus sampleStatus() const { return m_sampleStatus; }

protected:
	void crc(Xfer *) override {}
	void xfer(Xfer *) override {}
	void loadPostProcess() override {}

private:
	Int m_clearCalls = 0;
	Int m_setCalls = 0;
	Int m_shroudedSetCalls = 0;
	Int m_foggedSetCalls = 0;
	Int m_clearSetCalls = 0;
	Int m_sampleX = -1;
	Int m_sampleY = -1;
	bool m_sampleTouched = false;
	CellShroudStatus m_sampleStatus = CELLSHROUD_SHROUDED;
};

class ProbeNoopAudioManager final : public AudioManager
{
public:
#if defined(_DEBUG) || defined(_INTERNAL)
	void audioDebugDisplay(DebugDisplayInterface *, void *, FILE * = nullptr) override {}
#endif
	void stopAudio(AudioAffect) override {}
	void pauseAudio(AudioAffect) override {}
	void resumeAudio(AudioAffect) override {}
	void pauseAmbient(Bool) override {}
	AudioHandle addAudioEvent(const AudioEventRTS *) override { return AHSV_NoSound; }
	void removeAudioEvent(AudioHandle) override {}
	void killAudioEventImmediately(AudioHandle) override {}
	void nextMusicTrack() override {}
	void prevMusicTrack() override {}
	Bool isMusicPlaying() const override { return FALSE; }
	Bool hasMusicTrackCompleted(const AsciiString &, Int) const override { return FALSE; }
	AsciiString getMusicTrackName() const override { return AsciiString::TheEmptyString; }
	void openDevice() override {}
	void closeDevice() override {}
	void *getDevice() override { return nullptr; }
	void notifyOfAudioCompletion(UnsignedInt, UnsignedInt) override {}
	UnsignedInt getProviderCount() const override { return 0; }
	AsciiString getProviderName(UnsignedInt) const override { return AsciiString::TheEmptyString; }
	UnsignedInt getProviderIndex(AsciiString) const override { return 0; }
	void selectProvider(UnsignedInt) override {}
	void unselectProvider() override {}
	UnsignedInt getSelectedProvider() const override { return 0; }
	void setSpeakerType(UnsignedInt) override {}
	UnsignedInt getSpeakerType() override { return 0; }
	UnsignedInt getNum2DSamples() const override { return 0; }
	UnsignedInt getNum3DSamples() const override { return 0; }
	UnsignedInt getNumStreams() const override { return 0; }
	Bool doesViolateLimit(AudioEventRTS *) const override { return FALSE; }
	Bool isPlayingLowerPriority(AudioEventRTS *) const override { return FALSE; }
	Bool isPlayingAlready(AudioEventRTS *) const override { return FALSE; }
	Bool isObjectPlayingVoice(UnsignedInt) const override { return FALSE; }
	void adjustVolumeOfPlayingAudio(AsciiString, Real) override {}
	void removePlayingAudio(AsciiString) override {}
	void removeAllDisabledAudio() override {}
	Bool has3DSensitiveStreamsPlaying() const override { return FALSE; }
	void *getHandleForBink() override { return nullptr; }
	void releaseHandleForBink() override {}
	void friend_forcePlayAudioEventRTS(const AudioEventRTS *) override {}
	void setPreferredProvider(AsciiString) override {}
	void setPreferredSpeaker(AsciiString) override {}
	Real getFileLengthMS(AsciiString) const override { return 0.0f; }
	void closeAnySamplesUsingFile(const void *) override {}

protected:
	void setDeviceListenerPosition() override {}
};

class ProbePartitionTerrainLogic final : public TerrainLogic
{
public:
	ProbePartitionTerrainLogic(Real extent_hi_x, Real extent_hi_y, Real extent_hi_z)
	{
		m_extent.lo.x = 0.0f;
		m_extent.lo.y = 0.0f;
		m_extent.lo.z = 0.0f;
		m_extent.hi.x = std::max<Real>(1.0f, extent_hi_x);
		m_extent.hi.y = std::max<Real>(1.0f, extent_hi_y);
		m_extent.hi.z = extent_hi_z;
	}

	void init() override {}
	void reset() override {}
	void update() override {}
	Bool loadMap(AsciiString, Bool) override { return TRUE; }
	Real getGroundHeight(Real, Real, Coord3D *normal = nullptr) const override
	{
		if (normal != nullptr) {
			normal->x = 0.0f;
			normal->y = 0.0f;
			normal->z = 1.0f;
		}
		return 0.0f;
	}
	Real getLayerHeight(Real x, Real y, PathfindLayerEnum, Coord3D *normal = nullptr, Bool = true) const override
	{
		return getGroundHeight(x, y, normal);
	}
	void getExtent(Region3D *extent) const override
	{
		if (extent != nullptr) {
			*extent = m_extent;
		}
	}
	void getExtentIncludingBorder(Region3D *extent) const override { getExtent(extent); }
	void getMaximumPathfindExtent(Region3D *extent) const override { getExtent(extent); }

protected:
	void crc(Xfer *) override {}
	void xfer(Xfer *) override {}
	void loadPostProcess() override {}

private:
	Region3D m_extent;
};

Int expected_shroud_level_for_status(CellShroudStatus status)
{
	if (TheGlobalData == nullptr) {
		return -1;
	}
	Int level = TheGlobalData->m_clearAlpha;
	if (status == CELLSHROUD_SHROUDED) {
		level = TheGlobalData->m_shroudAlpha;
	} else if (status == CELLSHROUD_FOGGED) {
		level = TheGlobalData->m_fogAlpha;
	}
	if (level == 255) {
		return 255;
	}
	const UnsignedInt color = TheGlobalData->m_shroudColor.getAsInt();
	const UnsignedInt blue =
		static_cast<UnsignedInt>(static_cast<Real>(level) * static_cast<Real>(color & 0xff) / 255.0f);
	const UnsignedInt green =
		static_cast<UnsignedInt>(static_cast<Real>(level) * static_cast<Real>((color & 0xff00) >> 8) / 255.0f);
	const UnsignedInt red =
		static_cast<UnsignedInt>(static_cast<Real>(level) * static_cast<Real>((color & 0xff0000) >> 16) / 255.0f);
	const UnsignedShort pixel =
		static_cast<UnsignedShort>(((blue & 0xf8) >> 3) | ((green & 0xfc) << 3) | ((red & 0xf8) << 8));
	return static_cast<Int>(static_cast<Real>((pixel >> 5) & 0x3f) / 63.0f * 255.0f);
}

ProbePartitionShroudRefreshMetrics run_partition_shroud_refresh_probe(
	const char *map_entry,
	W3DShroud *shroud,
	CameraClass *camera,
	Int sample_x,
	Int sample_y,
	const ProbeLogicalTerrainLoadMetrics *logical_terrain_load)
{
	ProbePartitionShroudRefreshMetrics metrics;
	metrics.requested = true;
	metrics.sampleX = sample_x;
	metrics.sampleY = sample_y;
	if (map_entry == nullptr ||
			map_entry[0] == '\0' ||
			shroud == nullptr ||
			camera == nullptr ||
			W3DDisplay::m_3DScene == nullptr ||
			TheWritableGlobalData == nullptr ||
			sample_x < 0 ||
			sample_y < 0) {
		return metrics;
	}

	Display *old_display = TheDisplay;
	Radar *old_radar = TheRadar;
	PlayerList *old_player_list = ThePlayerList;
	PartitionManager *old_partition_manager = ThePartitionManager;
	TerrainLogic *old_terrain_logic = TheTerrainLogic;

	ProbeShroudForwardingDisplay display_adapter;
	ProbeShroudCountingRadar radar_adapter;
	PlayerList player_list;
	Player *local_player = player_list.getLocalPlayer();
	const Int local_player_index =
		local_player != nullptr ? local_player->getPlayerIndex() : PLAYER_INDEX_INVALID;

	TheDisplay = &display_adapter;
	TheRadar = &radar_adapter;
	ThePlayerList = &player_list;
	metrics.displayInstalled = TheDisplay == &display_adapter;
	metrics.radarInstalled = TheRadar == &radar_adapter;
	metrics.playerListInstalled =
		ThePlayerList == &player_list &&
		local_player != nullptr &&
		local_player_index == 0;

	const Real old_partition_cell_size = TheWritableGlobalData->m_partitionCellSize;
	const RGBColor old_shroud_color = TheWritableGlobalData->m_shroudColor;
	const UnsignedByte old_shroud_alpha = TheWritableGlobalData->m_shroudAlpha;
	const UnsignedByte old_fog_alpha = TheWritableGlobalData->m_fogAlpha;
	const UnsignedByte old_clear_alpha = TheWritableGlobalData->m_clearAlpha;
	const bool logical_extent_ready =
		logical_terrain_load != nullptr &&
		logical_terrain_load->loadReturned &&
		logical_terrain_load->extentMatchesVisual &&
		logical_terrain_load->extentHiX > 0.0f &&
		logical_terrain_load->extentHiY > 0.0f;
	const Int probe_partition_cell_window = 48;
	const Real source_partition_cell_size =
		logical_extent_ready ? static_cast<Real>(MAP_XY_FACTOR) : 1.0f;
	const Real probe_partition_cell_size = source_partition_cell_size;
	// REAL_TO_INT_CEIL bumps exact integers, so high=(N-1)*cellSize yields N cells.
	const Real full_extent_hi_x =
		logical_extent_ready ?
			static_cast<Real>(logical_terrain_load->extentHiX) :
			static_cast<Real>(probe_partition_cell_window - 1) *
				source_partition_cell_size;
	const Real full_extent_hi_y =
		logical_extent_ready ?
			static_cast<Real>(logical_terrain_load->extentHiY) :
			static_cast<Real>(probe_partition_cell_window - 1) *
				source_partition_cell_size;
	const Int full_cell_count_x =
		std::max<Int>(
			1,
			REAL_TO_INT_CEIL(full_extent_hi_x / source_partition_cell_size));
	const Int full_cell_count_y =
		std::max<Int>(
			1,
			REAL_TO_INT_CEIL(full_extent_hi_y / source_partition_cell_size));
	const Int bounded_cell_count_x =
		std::min<Int>(probe_partition_cell_window, full_cell_count_x);
	const Int bounded_cell_count_y =
		std::min<Int>(probe_partition_cell_window, full_cell_count_y);
	const Real partition_extent_hi_x =
		static_cast<Real>(std::max<Int>(1, bounded_cell_count_x - 1)) *
			probe_partition_cell_size;
	const Real partition_extent_hi_y =
		static_cast<Real>(std::max<Int>(1, bounded_cell_count_y - 1)) *
			probe_partition_cell_size;
	const Real partition_extent_hi_z =
		logical_extent_ready ?
			static_cast<Real>(logical_terrain_load->extentHiZ) :
			0.0f;
	metrics.logicalTerrainExtentSourceApplied = logical_extent_ready;
	metrics.partitionCellSize = probe_partition_cell_size;
	metrics.sourcePartitionCellSize = source_partition_cell_size;
	metrics.terrainExtentHiX = partition_extent_hi_x;
	metrics.terrainExtentHiY = partition_extent_hi_y;
	metrics.fullTerrainExtentHiX = full_extent_hi_x;
	metrics.fullTerrainExtentHiY = full_extent_hi_y;
	metrics.expectedCellCountX = bounded_cell_count_x;
	metrics.expectedCellCountY = bounded_cell_count_y;
	metrics.fullCellCountX = full_cell_count_x;
	metrics.fullCellCountY = full_cell_count_y;
	TheWritableGlobalData->m_partitionCellSize = probe_partition_cell_size;
	TheWritableGlobalData->m_shroudColor.red = 1.0f;
	TheWritableGlobalData->m_shroudColor.green = 1.0f;
	TheWritableGlobalData->m_shroudColor.blue = 1.0f;
	TheWritableGlobalData->m_shroudAlpha = 0;
	TheWritableGlobalData->m_fogAlpha = 127;
	TheWritableGlobalData->m_clearAlpha = 255;
	ProbePartitionTerrainLogic terrain_logic(
		partition_extent_hi_x,
		partition_extent_hi_y,
		partition_extent_hi_z);
	TheTerrainLogic = &terrain_logic;
	metrics.terrainLogicInstalled = TheTerrainLogic == &terrain_logic;
	{
		PartitionManager partition_manager;
		metrics.partitionCreated = true;
		ThePartitionManager = &partition_manager;
		metrics.partitionInstalled = ThePartitionManager == &partition_manager;
		partition_manager.init();
		metrics.partitionInitInvoked = true;
		metrics.cellCountX = partition_manager.getCellCountX();
		metrics.cellCountY = partition_manager.getCellCountY();
		metrics.totalCells = metrics.cellCountX * metrics.cellCountY;
		metrics.sampleX = std::max(
			0,
			std::min(
				std::min(sample_x, metrics.cellCountX - 1),
				shroud->getNumShroudCellsX() - 1));
		metrics.sampleY = std::max(
			0,
			std::min(
				std::min(sample_y, metrics.cellCountY - 1),
				shroud->getNumShroudCellsY() - 1));
		display_adapter.configureSample(metrics.sampleX, metrics.sampleY);
		radar_adapter.configureSample(metrics.sampleX, metrics.sampleY);
		metrics.partitionCellsReady =
			metrics.cellCountX > 0 &&
			metrics.cellCountY > 0 &&
			partition_manager.getCellAt(metrics.sampleX, metrics.sampleY) != nullptr;
		if (metrics.partitionCellsReady) {
			partition_manager.revealMapForPlayer(local_player_index);
			metrics.revealInvoked = true;
			metrics.revealDisplaySetCalls = display_adapter.setCalls();
			metrics.revealRadarSetCalls = radar_adapter.setCalls();
			metrics.status =
				partition_manager.getShroudStatusForPlayer(
					local_player_index,
					metrics.sampleX,
					metrics.sampleY);
			metrics.expectedLevel =
				expected_shroud_level_for_status(static_cast<CellShroudStatus>(metrics.status));
			shroud->setShroudLevel(
				metrics.sampleX,
				metrics.sampleY,
				static_cast<W3DShroudLevel>(TheGlobalData->m_shroudAlpha));
			metrics.sampleBefore = shroud->getShroudLevel(metrics.sampleX, metrics.sampleY);
			metrics.samplePrepared = true;
			display_adapter.resetCounters();
			radar_adapter.resetCounters();
			partition_manager.refreshShroudForLocalPlayer();
			metrics.refreshInvoked = true;
			metrics.displayClearCalls = display_adapter.clearCalls();
			metrics.radarClearCalls = radar_adapter.clearCalls();
			metrics.displaySetCalls = display_adapter.setCalls();
			metrics.radarSetCalls = radar_adapter.setCalls();
			metrics.displayShroudedSetCalls = display_adapter.shroudedSetCalls();
			metrics.displayFoggedSetCalls = display_adapter.foggedSetCalls();
			metrics.displayClearSetCalls = display_adapter.clearSetCalls();
			metrics.radarShroudedSetCalls = radar_adapter.shroudedSetCalls();
			metrics.radarFoggedSetCalls = radar_adapter.foggedSetCalls();
			metrics.radarClearSetCalls = radar_adapter.clearSetCalls();
			metrics.displaySampleTouched = display_adapter.sampleTouched();
			metrics.radarSampleTouched = radar_adapter.sampleTouched();
			metrics.sampleAfter = shroud->getShroudLevel(metrics.sampleX, metrics.sampleY);
			metrics.sampleChanged =
				metrics.sampleAfter > metrics.sampleBefore &&
				metrics.sampleAfter == metrics.expectedLevel;
			shroud->render(camera);
			metrics.renderInvoked = true;
			metrics.beginRender =
				WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(metrics.beginRender)) {
				metrics.render = WW3D::Render(W3DDisplay::m_3DScene, camera);
				metrics.endRender = WW3D::End_Render(false);
				const WasmD3D8ShimState *state_after_partition_refresh = wasm_d3d8_get_state();
				if (state_after_partition_refresh != nullptr) {
					metrics.drawIndexed =
						state_after_partition_refresh->draw_indexed_primitive_calls;
					metrics.clear = state_after_partition_refresh->clear_calls;
					metrics.textureUpdate =
						state_after_partition_refresh->browser_texture_update_calls;
				}
			}
		}
	}
	TheWritableGlobalData->m_partitionCellSize = old_partition_cell_size;
	TheWritableGlobalData->m_shroudColor = old_shroud_color;
	TheWritableGlobalData->m_shroudAlpha = old_shroud_alpha;
	TheWritableGlobalData->m_fogAlpha = old_fog_alpha;
	TheWritableGlobalData->m_clearAlpha = old_clear_alpha;

	TheTerrainLogic = old_terrain_logic;
	ThePartitionManager = old_partition_manager;
	ThePlayerList = old_player_list;
	TheRadar = old_radar;
	TheDisplay = old_display;
	return metrics;
}

class ProbeHeightMapRenderObjWithBridgeBuffer final : public HeightMapRenderObjClass
{
public:
	ProbeHeightMapRenderObjWithBridgeBuffer()
	{
		m_bridgeBuffer = nullptr;
	}

	~ProbeHeightMapRenderObjWithBridgeBuffer() override
	{
#ifdef DO_ROADS
		if (m_roadBuffer != nullptr) {
			delete m_roadBuffer;
			m_roadBuffer = nullptr;
		}
#endif
		if (m_bridgeBuffer != nullptr) {
			delete m_bridgeBuffer;
			m_bridgeBuffer = nullptr;
		}
	}

	W3DTreeBuffer *installProbeTreeBuffer()
	{
		if (m_treeBuffer != nullptr) {
			delete m_treeBuffer;
		}
		m_treeBuffer = NEW W3DTreeBuffer;
		return m_treeBuffer;
	}

#ifdef DO_ROADS
	ProbeW3DRoadBuffer *installProbeRoadBuffer(WorldHeightMap *map)
	{
		if (m_roadBuffer != nullptr) {
			delete m_roadBuffer;
		}
		m_roadBuffer = NEW ProbeW3DRoadBuffer;
		if (m_roadBuffer != nullptr) {
			m_roadBuffer->setMap(map);
		}
		return static_cast<ProbeW3DRoadBuffer *>(m_roadBuffer);
	}
#endif

	ProbeW3DBridgeBuffer *installProbeBridgeBuffer()
	{
		if (m_bridgeBuffer != nullptr) {
			delete m_bridgeBuffer;
		}
		m_bridgeBuffer = NEW ProbeW3DBridgeBuffer;
		return static_cast<ProbeW3DBridgeBuffer *>(m_bridgeBuffer);
	}

	void Render(RenderInfoClass &rinfo) override
	{
		W3DBridgeBuffer *bridge_buffer = m_bridgeBuffer;
		m_probeBridgeDrawInvoked = false;
		m_probeBridgeDrawWrapperInvoked = false;
		m_probeBridgeDrawWrapperWireframe = false;
		m_probeBridgeShroudOverlaySuppressed = false;
		m_probeBridgeTerrainRenderObjectPinned = false;
		m_probeBridgeDrawCallsBefore = 0;
		m_probeBridgeDrawCallsAfter = 0;
		m_probeBridgeShroudDrawCallsBefore = 0;
		m_probeBridgeShroudDrawCallsAfter = 0;
		m_probeBridgeShroudDrawSeen = false;
		m_probeBridgeShroudTextureReady = false;
		m_probeRoadDrawInvoked = false;
		m_probeRoadDrawCallsBefore = 0;
		m_probeRoadDrawCallsAfter = 0;
		m_probeRoadDrawMinX = 0;
		m_probeRoadDrawMaxX = 0;
		m_probeRoadDrawMinY = 0;
		m_probeRoadDrawMaxY = 0;
		m_probeTreeDrawInvoked = false;
		m_probeTreeDrawCallsBefore = 0;
		m_probeTreeDrawCallsAfter = 0;
		m_bridgeBuffer = nullptr;
		probe_bridge_phase_log("render-object-terrain");
		HeightMapRenderObjClass::Render(rinfo);
#ifdef DO_ROADS
		probe_bridge_phase_log("render-object-road");
		if (m_roadBuffer != nullptr && m_map != nullptr && !ShaderClass::Is_Backface_Culling_Inverted()) {
			DX8Wrapper::Set_Texture(0, nullptr);
			DX8Wrapper::Set_Texture(1, nullptr);
			DX8Wrapper::Set_Transform(D3DTS_WORLD, Get_Transform());
			ShaderClass::Invalidate();

			const Int min_x = -m_map->getBorderSizeInline();
			const Int min_y = -m_map->getBorderSizeInline();
			const Int max_x = std::max(min_x, m_map->getXExtent() - 1 - m_map->getBorderSizeInline());
			const Int max_y = std::max(min_y, m_map->getYExtent() - 1 - m_map->getBorderSizeInline());
			const WasmD3D8ShimState *before_road_state = wasm_d3d8_get_state();
			m_probeRoadDrawCallsBefore =
				before_road_state != nullptr ? before_road_state->draw_indexed_primitive_calls : 0;
			m_probeRoadDrawInvoked = true;
			m_probeRoadDrawMinX = min_x;
			m_probeRoadDrawMaxX = max_x;
			m_probeRoadDrawMinY = min_y;
			m_probeRoadDrawMaxY = max_y;
			m_roadBuffer->drawRoads(
				&rinfo.Camera,
				nullptr,
				nullptr,
				m_disableTextures,
				min_x,
				max_x,
				min_y,
				max_y,
				nullptr);
			const WasmD3D8ShimState *after_road_state = wasm_d3d8_get_state();
			m_probeRoadDrawCallsAfter =
				after_road_state != nullptr ?
					after_road_state->draw_indexed_primitive_calls :
					m_probeRoadDrawCallsBefore;
		}
#endif
		probe_bridge_phase_log("render-object-tree");
		if (m_treeBuffer != nullptr && m_treeBuffer->needToDraw() && !ShaderClass::Is_Backface_Culling_Inverted()) {
			const WasmD3D8ShimState *before_tree_state = wasm_d3d8_get_state();
			m_probeTreeDrawCallsBefore =
				before_tree_state != nullptr ? before_tree_state->draw_indexed_primitive_calls : 0;
			m_probeTreeDrawInvoked = true;
			renderTrees(&rinfo.Camera);
			const WasmD3D8ShimState *after_tree_state = wasm_d3d8_get_state();
			m_probeTreeDrawCallsAfter =
				after_tree_state != nullptr ?
					after_tree_state->draw_indexed_primitive_calls :
					m_probeTreeDrawCallsBefore;
		}
		probe_bridge_phase_log("render-object-bridge");
		m_bridgeBuffer = bridge_buffer;
		if (m_bridgeBuffer == nullptr || ShaderClass::Is_Backface_Culling_Inverted()) {
			return;
		}

		probe_bridge_phase_log("render-object-bridge-state-reset");
		DX8Wrapper::Set_Texture(0, nullptr);
		DX8Wrapper::Set_Texture(1, nullptr);
		ShaderClass::Invalidate();
		DX8Wrapper::Apply_Render_State_Changes();
		probe_bridge_phase_log("render-object-bridge-state-ready");
		m_probeBridgeDrawInvoked = true;
		m_probeBridgeDrawWrapperInvoked = true;
		const WasmD3D8ShimState *before_state = wasm_d3d8_get_state();
		m_probeBridgeDrawCallsBefore =
			before_state != nullptr ? before_state->draw_indexed_primitive_calls : 0;
		m_probeBridgeShroudDrawCallsBefore =
			before_state != nullptr ?
				before_state->draw_indexed_depth_equal_camera_space_tex0_count2_calls :
				0;
		probe_bridge_phase_log("render-object-bridge-wrapper-call");
		BaseHeightMapRenderObjClass *saved_terrain_render_object = TheTerrainRenderObject;
		TheTerrainRenderObject = this;
		m_probeBridgeTerrainRenderObjectPinned = TheTerrainRenderObject == this;
		m_probeBridgeShroudTextureReady =
			m_shroud != nullptr && m_shroud->getShroudTexture() != nullptr;
		m_probeBridgeDrawWrapperWireframe = false;
		static_cast<ProbeW3DBridgeBuffer *>(m_bridgeBuffer)->drawBridgesWithProbe(
			&rinfo.Camera,
			FALSE,
			nullptr);
		TheTerrainRenderObject = saved_terrain_render_object;
		const WasmD3D8ShimState *after_state = wasm_d3d8_get_state();
		m_probeBridgeDrawCallsAfter =
			after_state != nullptr ?
				after_state->draw_indexed_primitive_calls :
				m_probeBridgeDrawCallsBefore;
		m_probeBridgeShroudDrawCallsAfter =
			after_state != nullptr ?
				after_state->draw_indexed_depth_equal_camera_space_tex0_count2_calls :
				m_probeBridgeShroudDrawCallsBefore;
		m_probeBridgeShroudDrawSeen =
			m_probeBridgeShroudDrawCallsAfter > m_probeBridgeShroudDrawCallsBefore;
		probe_bridge_phase_log("render-object-bridge-done");
	}

	bool probeBridgeDrawInvoked() const { return m_probeBridgeDrawInvoked; }
	bool probeBridgeDrawWrapperInvoked() const { return m_probeBridgeDrawWrapperInvoked; }
	bool probeBridgeDrawWrapperWireframe() const { return m_probeBridgeDrawWrapperWireframe; }
	bool probeBridgeShroudOverlaySuppressed() const { return m_probeBridgeShroudOverlaySuppressed; }
	bool probeBridgeShroudTextureReady() const { return m_probeBridgeShroudTextureReady; }
	bool probeBridgeShroudDrawSeen() const { return m_probeBridgeShroudDrawSeen; }
	bool probeBridgeTerrainRenderObjectPinned() const { return m_probeBridgeTerrainRenderObjectPinned; }
	UINT probeBridgeDrawCallsBefore() const { return m_probeBridgeDrawCallsBefore; }
	UINT probeBridgeDrawCallsAfter() const { return m_probeBridgeDrawCallsAfter; }
	UINT probeBridgeDrawCallDelta() const
	{
		return m_probeBridgeDrawCallsAfter >= m_probeBridgeDrawCallsBefore ?
			m_probeBridgeDrawCallsAfter - m_probeBridgeDrawCallsBefore :
			0;
	}
	UINT probeBridgeShroudDrawCallsBefore() const { return m_probeBridgeShroudDrawCallsBefore; }
	UINT probeBridgeShroudDrawCallsAfter() const { return m_probeBridgeShroudDrawCallsAfter; }
	bool probeRoadDrawInvoked() const { return m_probeRoadDrawInvoked; }
	UINT probeRoadDrawCallsBefore() const { return m_probeRoadDrawCallsBefore; }
	UINT probeRoadDrawCallsAfter() const { return m_probeRoadDrawCallsAfter; }
	UINT probeRoadDrawCallDelta() const
	{
		return m_probeRoadDrawCallsAfter >= m_probeRoadDrawCallsBefore ?
			m_probeRoadDrawCallsAfter - m_probeRoadDrawCallsBefore :
			0;
	}
	Int probeRoadDrawMinX() const { return m_probeRoadDrawMinX; }
	Int probeRoadDrawMaxX() const { return m_probeRoadDrawMaxX; }
	Int probeRoadDrawMinY() const { return m_probeRoadDrawMinY; }
	Int probeRoadDrawMaxY() const { return m_probeRoadDrawMaxY; }
	bool probeTreeDrawInvoked() const { return m_probeTreeDrawInvoked; }
	UINT probeTreeDrawCallsBefore() const { return m_probeTreeDrawCallsBefore; }
	UINT probeTreeDrawCallsAfter() const { return m_probeTreeDrawCallsAfter; }
	UINT probeTreeDrawCallDelta() const
	{
		return m_probeTreeDrawCallsAfter >= m_probeTreeDrawCallsBefore ?
			m_probeTreeDrawCallsAfter - m_probeTreeDrawCallsBefore :
			0;
	}

private:
	bool m_probeBridgeDrawInvoked = false;
	bool m_probeBridgeDrawWrapperInvoked = false;
	bool m_probeBridgeDrawWrapperWireframe = false;
	bool m_probeBridgeShroudOverlaySuppressed = false;
	bool m_probeBridgeShroudTextureReady = false;
	bool m_probeBridgeShroudDrawSeen = false;
	bool m_probeBridgeTerrainRenderObjectPinned = false;
	UINT m_probeBridgeDrawCallsBefore = 0;
	UINT m_probeBridgeDrawCallsAfter = 0;
	UINT m_probeBridgeShroudDrawCallsBefore = 0;
	UINT m_probeBridgeShroudDrawCallsAfter = 0;
	bool m_probeRoadDrawInvoked = false;
	UINT m_probeRoadDrawCallsBefore = 0;
	UINT m_probeRoadDrawCallsAfter = 0;
	Int m_probeRoadDrawMinX = 0;
	Int m_probeRoadDrawMaxX = 0;
	Int m_probeRoadDrawMinY = 0;
	Int m_probeRoadDrawMaxY = 0;
	bool m_probeTreeDrawInvoked = false;
	UINT m_probeTreeDrawCallsBefore = 0;
	UINT m_probeTreeDrawCallsAfter = 0;
};

class ProbeScriptEngineView : public ScriptEngine
{
public:
	static void configureBreeze(ScriptEngine *engine)
	{
		ProbeScriptEngineView *view = reinterpret_cast<ProbeScriptEngineView *>(engine);
		view->m_breezeInfo.m_direction = 0.0f;
		view->m_breezeInfo.m_directionVec.x = 0.0f;
		view->m_breezeInfo.m_directionVec.y = 1.0f;
		view->m_breezeInfo.m_intensity = 0.0f;
		view->m_breezeInfo.m_lean = 0.0f;
		view->m_breezeInfo.m_randomness = 0.0f;
		view->m_breezeInfo.m_breezePeriod = 1;
		view->m_breezeInfo.m_breezeVersion = 0;
	}
};

class ProbeScriptEngineScope
{
public:
	ProbeScriptEngineScope() :
		m_oldScriptEngine(TheScriptEngine)
	{
		std::memset(m_storage, 0, sizeof(m_storage));
		m_scriptEngine = reinterpret_cast<ScriptEngine *>(m_storage);
		ProbeScriptEngineView::configureBreeze(m_scriptEngine);
		TheScriptEngine = m_scriptEngine;
	}

	~ProbeScriptEngineScope()
	{
		TheScriptEngine = m_oldScriptEngine;
	}

	ScriptEngine *scriptEngine() const
	{
		return m_scriptEngine;
	}

private:
	alignas(ScriptEngine) unsigned char m_storage[sizeof(ScriptEngine)] = {};
	ScriptEngine *m_oldScriptEngine = nullptr;
	ScriptEngine *m_scriptEngine = nullptr;
};

class ProbeTreeDrawModuleDataScope
{
public:
	ProbeTreeDrawModuleDataScope()
	{
		std::memset(m_storage, 0, sizeof(m_storage));
		W3DTreeDrawModuleData *tree_data = data();
		new (&tree_data->m_modelName) AsciiString(kTreeModelName);
		new (&tree_data->m_textureName) AsciiString(kTreeTextureName);
		new (&tree_data->m_stumpName) AsciiString();
		tree_data->m_framesToMoveInward = 1;
		tree_data->m_framesToMoveOutward = 1;
		tree_data->m_darkening = 0.0f;
		tree_data->m_maxOutwardMovement = 1.0f;
		tree_data->m_toppleFX = nullptr;
		tree_data->m_bounceFX = nullptr;
		tree_data->m_killWhenToppled = TRUE;
		tree_data->m_doTopple = FALSE;
		tree_data->m_doShadow = FALSE;
		tree_data->m_initialVelocityPercent = 0.2f;
		tree_data->m_initialAccelPercent = 0.01f;
		tree_data->m_bounceVelocityPercent = 0.3f;
		tree_data->m_minimumToppleSpeed = 0.5f;
		tree_data->m_sinkFrames = 300;
		tree_data->m_sinkDistance = 20.0f;
	}

	~ProbeTreeDrawModuleDataScope()
	{
		W3DTreeDrawModuleData *tree_data = data();
		tree_data->m_stumpName.~AsciiString();
		tree_data->m_textureName.~AsciiString();
		tree_data->m_modelName.~AsciiString();
	}

	W3DTreeDrawModuleData *data()
	{
		return reinterpret_cast<W3DTreeDrawModuleData *>(m_storage);
	}

	const W3DTreeDrawModuleData *data() const
	{
		return reinterpret_cast<const W3DTreeDrawModuleData *>(m_storage);
	}

private:
	alignas(W3DTreeDrawModuleData) unsigned char m_storage[sizeof(W3DTreeDrawModuleData)] = {};
};

bool normalize_probe_prop_mesh(RenderObjClass *prop_render_object, int &class_id)
{
	class_id = RenderObjClass::CLASSID_UNKNOWN;
	if (prop_render_object == nullptr) {
		return false;
	}

	class_id = prop_render_object->Class_ID();
	if (class_id != RenderObjClass::CLASSID_MESH) {
		return false;
	}

	MeshClass *mesh = static_cast<MeshClass *>(prop_render_object);
	MeshModelClass *model = mesh->Peek_Model();
	if (model == nullptr) {
		return false;
	}

	ShaderClass shader;
	shader.Set_Cull_Mode(ShaderClass::CULL_MODE_DISABLE);
	shader.Set_Depth_Compare(ShaderClass::PASS_LEQUAL);
	shader.Set_Depth_Mask(ShaderClass::DEPTH_WRITE_ENABLE);
	shader.Set_Texturing(ShaderClass::TEXTURING_ENABLE);
	shader.Set_Primary_Gradient(ShaderClass::GRADIENT_MODULATE);
	model->Set_Single_Shader(shader);

	VertexMaterialClass *vmat = NEW_REF(VertexMaterialClass, ());
	model->Set_Single_Material(vmat, 0);
	vmat->Release_Ref();
	return true;
}

void configure_global_data(GlobalData &global_data, bool enable_shroud = false)
{
	global_data.m_textureReductionFactor = 0;
	global_data.m_useCloudMap = FALSE;
	global_data.m_useLightMap = FALSE;
	global_data.m_useWaterPlane = TRUE;
	global_data.m_useCloudPlane = FALSE;
	global_data.m_showSoftWaterEdge = FALSE;
	global_data.m_windowed = FALSE;
	global_data.m_scriptDebug = FALSE;
	global_data.m_particleEdit = FALSE;
	global_data.m_use3WayTerrainBlends = FALSE;
	global_data.m_drawEntireTerrain = FALSE;
	global_data.m_stretchTerrain = FALSE;
	if (enable_shroud) {
		global_data.m_partitionCellSize = MAP_XY_FACTOR;
		global_data.m_shroudColor.red = 0.0f;
		global_data.m_shroudColor.green = 0.0f;
		global_data.m_shroudColor.blue = 0.0f;
		global_data.m_shroudAlpha = 0;
	}
	global_data.m_timeOfDay = TIME_OF_DAY_AFTERNOON;
	global_data.m_numGlobalLights = 1;
	global_data.m_terrainAmbient[0].red = 0.28f;
	global_data.m_terrainAmbient[0].green = 0.32f;
	global_data.m_terrainAmbient[0].blue = 0.28f;
	global_data.m_terrainDiffuse[0].red = 0.85f;
	global_data.m_terrainDiffuse[0].green = 0.90f;
	global_data.m_terrainDiffuse[0].blue = 0.80f;
	global_data.m_terrainLightPos[0].x = -0.35f;
	global_data.m_terrainLightPos[0].y = 0.25f;
	global_data.m_terrainLightPos[0].z = -1.0f;
	global_data.m_waterPositionX = 0.0f;
	global_data.m_waterPositionY = 0.0f;
	global_data.m_waterPositionZ = 0.0f;
	global_data.m_waterExtentX = 64.0f * MAP_XY_FACTOR;
	global_data.m_waterExtentY = 64.0f * MAP_XY_FACTOR;
	global_data.m_waterType = 0;
	global_data.m_maxTerrainTracks = 16;
	global_data.m_maxTankTrackEdges = 32;
	global_data.m_maxTankTrackOpaqueEdges = 16;
	global_data.m_maxTankTrackFadeDelay = 300000;
	for (int water_setting = 0; water_setting < GlobalData::MAX_WATER_GRID_SETTINGS; ++water_setting) {
		global_data.m_vertexWaterHeightClampLow[water_setting] = 0.0f;
		global_data.m_vertexWaterHeightClampHi[water_setting] = 0.0f;
		global_data.m_vertexWaterAngle[water_setting] = 0.0f;
		global_data.m_vertexWaterXPosition[water_setting] = 0.0f;
		global_data.m_vertexWaterYPosition[water_setting] = 0.0f;
		global_data.m_vertexWaterZPosition[water_setting] = 0.0f;
		global_data.m_vertexWaterXGridCells[water_setting] = 0;
		global_data.m_vertexWaterYGridCells[water_setting] = 0;
		global_data.m_vertexWaterGridSize[water_setting] = 0.0f;
		global_data.m_vertexWaterAttenuationA[water_setting] = 0.0f;
		global_data.m_vertexWaterAttenuationB[water_setting] = 0.0f;
		global_data.m_vertexWaterAttenuationC[water_setting] = 0.0f;
		global_data.m_vertexWaterAttenuationRange[water_setting] = 0.0f;
	}
	for (int time_of_day = 0; time_of_day < TIME_OF_DAY_COUNT; ++time_of_day) {
		for (int light_index = 0; light_index < MAX_GLOBAL_LIGHTS; ++light_index) {
			global_data.m_terrainObjectsLighting[time_of_day][light_index].ambient.red = 0.35f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].ambient.green = 0.35f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].ambient.blue = 0.35f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].diffuse.red = light_index == 0 ? 0.85f : 0.0f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].diffuse.green = light_index == 0 ? 0.90f : 0.0f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].diffuse.blue = light_index == 0 ? 0.80f : 0.0f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].lightPos.x = -0.35f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].lightPos.y = 0.25f;
			global_data.m_terrainObjectsLighting[time_of_day][light_index].lightPos.z = -1.0f;
		}
	}
}

struct ProbeLogicalMapObjectLoadMetrics
{
	bool attempted = false;
	bool localGlobalDataInstalled = false;
	bool mapCacheInstalled = false;
	bool terrainLogicInstalled = false;
	bool gameClientInstalled = false;
	bool thingFactoryInstalled = false;
	bool scriptEngineInstalled = false;
	bool loadReturned = false;
	bool loadException = false;
	bool sourceFilenameMatches = false;
	bool mapObjectsPresentAfterLoad = false;
	bool timeOfDayNotified = false;
	Int loadError = 0;
	Int mapObjectCount = 0;
	Int roadPoint1 = 0;
	Int roadPoint2 = 0;
	Int roadPairs = 0;
	Int roadPairsWithRoadType = 0;
	Int bridgePoint1 = 0;
	Int bridgePoint2 = 0;
	Int bridgePairs = 0;
	Int bridgePairsWithBridgeType = 0;
	TimeOfDay mapTimeOfDay = TIME_OF_DAY_INVALID;
	TimeOfDay notifiedTimeOfDay = TIME_OF_DAY_INVALID;
	std::string failurePhase;
	std::string sourceFilename;
};

class ProbeWritableGlobalDataScope
{
public:
	ProbeWritableGlobalDataScope() :
		m_oldWritableGlobalData(TheWritableGlobalData)
	{
		if (TheWritableGlobalData == nullptr) {
			configure_global_data(m_localGlobalData, false);
			TheWritableGlobalData = &m_localGlobalData;
			m_installedLocalGlobalData = true;
		}
	}

	~ProbeWritableGlobalDataScope()
	{
		if (m_installedLocalGlobalData) {
			TheWritableGlobalData = m_oldWritableGlobalData;
		}
	}

	bool installedLocalGlobalData() const
	{
		return m_installedLocalGlobalData && TheWritableGlobalData == &m_localGlobalData;
	}

private:
	GlobalData *m_oldWritableGlobalData = nullptr;
	GlobalData m_localGlobalData;
	bool m_installedLocalGlobalData = false;
};

void record_logical_map_object_counts(
	ProbeLogicalMapObjectLoadMetrics &metrics,
	TerrainRoadCollection *terrain_roads)
{
	for (MapObject *object = MapObject::getFirstMapObject(); object != nullptr;
			object = object->getNext()) {
		++metrics.mapObjectCount;
		if (object->getFlag(FLAG_ROAD_POINT1)) {
			++metrics.roadPoint1;
			MapObject *next = object->getNext();
			if (next != nullptr && next->getFlag(FLAG_ROAD_POINT2)) {
				++metrics.roadPairs;
				if (terrain_roads != nullptr && terrain_roads->findRoad(object->getName()) != nullptr) {
					++metrics.roadPairsWithRoadType;
				}
			}
		}
		if (object->getFlag(FLAG_ROAD_POINT2)) {
			++metrics.roadPoint2;
		}
		if (object->getFlag(FLAG_BRIDGE_POINT1)) {
			++metrics.bridgePoint1;
			MapObject *next = object->getNext();
			if (next != nullptr && next->getFlag(FLAG_BRIDGE_POINT2)) {
				++metrics.bridgePairs;
				if (terrain_roads != nullptr && terrain_roads->findBridge(object->getName()) != nullptr) {
					++metrics.bridgePairsWithBridgeType;
				}
			}
		}
		if (object->getFlag(FLAG_BRIDGE_POINT2)) {
			++metrics.bridgePoint2;
		}
	}
	metrics.mapObjectsPresentAfterLoad = metrics.mapObjectCount > 0;
}

ProbeLogicalMapObjectLoadMetrics load_probe_logical_terrain_map_objects(
	const char *map_entry,
	TerrainRoadCollection *terrain_roads)
{
	ProbeLogicalMapObjectLoadMetrics metrics;
	metrics.attempted = true;
	if (map_entry == nullptr || map_entry[0] == '\0') {
		return metrics;
	}

	ProbeWritableGlobalDataScope global_data_scope;
	MapCache map_cache;
	ProbeTerrainLogicGameClient &game_client =
		shared_probe_terrain_logic_game_client();
	game_client.resetProbeState();
	ThingFactory thing_factory;
	ProbeLogicalScriptEngineScope script_engine_scope;
	W3DTerrainLogic terrain_logic;
	ProbeLogicalTerrainGlobalScope global_scope(
		&map_cache,
		&game_client,
		&thing_factory,
		&terrain_logic);

	metrics.localGlobalDataInstalled = global_data_scope.installedLocalGlobalData();
	metrics.mapCacheInstalled = TheMapCache == &map_cache;
	metrics.gameClientInstalled = TheGameClient == &game_client;
	metrics.thingFactoryInstalled = TheThingFactory == &thing_factory;
	metrics.terrainLogicInstalled = TheTerrainLogic == &terrain_logic;
	metrics.scriptEngineInstalled = script_engine_scope.installed();

	WorldHeightMap::freeListOfMapObjects();
	metrics.failurePhase = "W3DTerrainLogic::init";
	terrain_logic.init();
	metrics.failurePhase = "W3DTerrainLogic::loadMap(query=true)";
	try {
		metrics.loadReturned =
			terrain_logic.loadMap(AsciiString(map_entry), TRUE) == TRUE;
		metrics.failurePhase.clear();
	} catch (ErrorCode error) {
		metrics.loadException = true;
		metrics.loadReturned = false;
		metrics.loadError = static_cast<Int>(error);
	} catch (...) {
		metrics.loadException = true;
		metrics.loadReturned = false;
	}

	if (metrics.loadReturned) {
		metrics.sourceFilename = terrain_logic.getSourceFilename().str();
		metrics.sourceFilenameMatches =
			terrain_logic.getSourceFilename().compareNoCase(map_entry) == 0;
		metrics.mapTimeOfDay = TheGlobalData->m_timeOfDay;
		metrics.timeOfDayNotified = game_client.timeOfDayNotified();
		metrics.notifiedTimeOfDay = game_client.notifiedTimeOfDay();
	}

	record_logical_map_object_counts(metrics, terrain_roads);
	return metrics;
}

} // namespace

class WaterRenderObjClass;
class TerrainTracksRenderObjClassSystem;
class W3DSmudgeManager;
class W3DProjectedShadowManager;

extern View *TheTacticalView;
extern WaterRenderObjClass *TheWaterRenderObj;
extern TerrainTracksRenderObjClassSystem *TheTerrainTracksRenderObjClassSystem;
extern W3DSmudgeManager *TheSmudgeManager;
extern W3DProjectedShadowManager *TheW3DProjectedShadowManager;

#ifndef CNC_PORT_LINKS_REAL_W3D_TERRAIN_OWNERS
View *TheTacticalView __attribute__((weak)) = nullptr;
WaterRenderObjClass *TheWaterRenderObj __attribute__((weak)) = nullptr;
TerrainTracksRenderObjClassSystem *TheTerrainTracksRenderObjClassSystem __attribute__((weak)) = nullptr;
W3DSmudgeManager *TheSmudgeManager __attribute__((weak)) = nullptr;
W3DProjectedShadowManager *TheW3DProjectedShadowManager __attribute__((weak)) = nullptr;

RefRenderObjListIterator *__attribute__((weak)) RTS3DScene::createLightsIterator()
{
	return nullptr;
}

void __attribute__((weak)) RTS3DScene::destroyLightsIterator(RefRenderObjListIterator *)
{
}

Bool __attribute__((weak)) ScriptList::ParseScriptsDataChunk(DataChunkInput &, DataChunkInfo *, void *)
{
	return FALSE;
}

Int __attribute__((weak)) ScriptList::getReadScripts(ScriptList *scriptLists[MAX_PLAYER_COUNT])
{
	for (Int index = 0; index < MAX_PLAYER_COUNT; ++index) {
		scriptLists[index] = nullptr;
	}
	return 0;
}

Bool __attribute__((weak)) PolygonTrigger::ParsePolygonTriggersDataChunk(DataChunkInput &, DataChunkInfo *, void *)
{
	return FALSE;
}

void __attribute__((weak)) PolygonTrigger::deleteTriggers(void)
{
}
#endif

const char *run_ww3d_terrain_tile_probe(
	std::string &target_json,
	const char *source_name,
	ProbeTerrainArchiveTileLoad *archive_tile_load,
	bool render_via_scene = false)
{
	initMemoryManager();
	probe_keep_original_ini_object_parsers_linked(
		&INI::parseObjectDefinition,
		&INI::parseObjectReskinDefinition);
	wasm_d3d8_reset_state();

	GlobalData global_data;
	configure_global_data(global_data);
	GlobalData *old_global_data = TheWritableGlobalData;
	TheWritableGlobalData = &global_data;

	const int init_result = WW3D::Init(nullptr, nullptr, false);
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool map_created = false;
	bool tile_created = false;
	bool owner_created = false;
	bool render_object_created = false;
	bool scene_created = false;
	bool scene_object_added = false;

	ProbeWorldHeightMapBuffers map_buffers;
	ProbeWorldHeightMap *map = nullptr;
	ProbeTerrainBackground *tile = nullptr;
	ProbeTerrainDiffuseOwner *diffuse_owner = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	ProbeTerrainTileRenderObj *render_object = nullptr;
	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;
	TileData *archive_tile = archive_tile_load != nullptr
		? load_archive_terrain_tile(archive_tile_load->archivePath.c_str(), *archive_tile_load)
		: nullptr;
	const bool archive_tile_ready =
		archive_tile_load != nullptr &&
		archive_tile_load->readTilesOk &&
		archive_tile != nullptr;

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);

		map = ProbeWorldHeightMap::create(map_buffers, archive_tile);
		map_created = map != nullptr;

		if (map_created) {
			diffuse_owner = ProbeTerrainDiffuseOwner::create(map);
			owner_created = diffuse_owner != nullptr;
			TheTerrainRenderObject = diffuse_owner;
		}
	}

	if (owner_created) {
		tile = W3DNEW ProbeTerrainBackground();
		tile_created = tile != nullptr;
	}

	if (tile_created) {
		IRegion2D full_range = {};
		full_range.lo.x = 0;
		full_range.lo.y = 0;
		full_range.hi.x = kMapVertices;
		full_range.hi.y = kMapVertices;
		tile->allocateTerrainBuffers(map, 0, 0, kMapCells);
		tile->setFlip(map);
		tile->doPartialUpdate(full_range, map, TRUE);

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, 1000.0f);
		}

		render_object = W3DNEW ProbeTerrainTileRenderObj(tile, archive_tile_load == nullptr);
		render_object_created = render_object != nullptr && camera != nullptr;
	}

	if (render_object_created && render_via_scene) {
		scene = NEW_REF(RTS3DScene, ());
		scene_created = scene != nullptr;
		if (scene_created) {
			scene->Add_Render_Object(render_object);
			scene_object_added = render_object->Peek_Scene() == scene;
		}
	}

	if (render_object_created) {
		RenderInfoClass render_info(*camera);
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			if (render_via_scene && scene_object_added) {
				render_result = WW3D::Render(scene, camera);
			} else if (!render_via_scene) {
				render_result = WW3D::Render(*render_object, render_info);
			}
			end_render_result = WW3D::End_Render(false);
		}
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		(archive_tile_load == nullptr || archive_tile_ready) &&
		map_created &&
		tile_created &&
		owner_created &&
		render_object_created &&
		(!render_via_scene || (scene_created && scene_object_added)) &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count > 0 &&
		state->last_draw_primitive_count > 0 &&
		state->last_draw_stream_source_stride == sizeof(VertexFormatXYZDUV2) &&
		state->last_draw_vertex_shader == DX8_FVF_XYZDUV2 &&
		(state->last_draw_transform_mask & 7u) == 7u;

	const char *tile_source = archive_tile_load != nullptr ? "archive-tga" : "synthetic-gradient";
	const char *archive_path = archive_tile_load != nullptr ? archive_tile_load->archivePath.c_str() : "";
	const char *archive_directory = archive_tile_load != nullptr ? archive_tile_load->archiveDirectory.c_str() : "";
	const char *archive_mask = archive_tile_load != nullptr ? archive_tile_load->archiveMask.c_str() : "";
	char buffer[6400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"mapCreated\":%s,\"tileCreated\":%s,"
		"\"ownerCreated\":%s,\"renderObjectCreated\":%s},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"expectedFlatTextureSize\":%u,\"tileSource\":\"%s\"},"
		"\"scene\":{\"renderPath\":\"%s\",\"created\":%s,\"objectAdded\":%s,"
		"\"terrainClassId\":%d},"
		"\"archive\":{\"attempted\":%s,\"argumentSupplied\":%s,"
		"\"path\":\"%s\",\"directory\":\"%s\",\"mask\":\"%s\","
		"\"entry\":\"Art\\\\Terrain\\\\PTBlossom01.tga\",\"loaded\":%s,\"entryExists\":%s,"
		"\"entryOpenable\":%s,\"countedTiles\":%d,\"countTilesOk\":%s,"
		"\"readRows\":%d,\"readTilesOk\":%s,"
		"\"firstPixelRgba\":[%u,%u,%u,%u],\"tileChecksum\":%lu},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"setVertexShader\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"width\":%u,\"height\":%u,\"format\":%lu,"
		"\"bytes\":%u,\"checksum\":%lu},"
		"\"draw\":{\"primitiveType\":%d,\"vertexShaderFvf\":%lu,"
		"\"startVertex\":%u,\"minVertexIndex\":%u,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"vertexBytes\":%u,\"vertexChecksum\":%lu,\"indexBufferId\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,\"renderState\":{\"cullMode\":%lu,"
		"\"zEnable\":%lu,\"zWriteEnable\":%lu,\"zFunc\":%lu,"
		"\"textureStage0ColorOp\":%lu,\"textureStage1ColorOp\":%lu}}}",
		source_name,
		bool_json(ok),
		init_result,
		set_device_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(map_created),
		bool_json(tile_created),
		bool_json(owner_created),
		bool_json(render_object_created),
		kMapVertices,
		kMapCells,
		kExpectedFlatTextureSize,
		tile_source,
		render_via_scene
			? "WW3D::Render(RTS3DScene,CameraClass) -> RTS3DScene::Customized_Render -> CLASSID_TILEMAP Render"
			: "WW3D::Render(RenderObjClass,RenderInfoClass) -> ProbeTerrainTileRenderObj::Render",
		bool_json(scene_created),
		bool_json(scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
		bool_json(archive_tile_load != nullptr && archive_tile_load->attempted),
		bool_json(archive_tile_load != nullptr && archive_tile_load->argumentSupplied),
		archive_path,
		archive_directory,
		archive_mask,
		bool_json(archive_tile_load != nullptr && archive_tile_load->archiveLoaded),
		bool_json(archive_tile_load != nullptr && archive_tile_load->entryExists),
		bool_json(archive_tile_load != nullptr && archive_tile_load->entryOpenable),
		archive_tile_load != nullptr ? archive_tile_load->countedTiles : 0,
		bool_json(archive_tile_load != nullptr && archive_tile_load->countTilesOk),
		archive_tile_load != nullptr ? archive_tile_load->readRows : 0,
		bool_json(archive_tile_load != nullptr && archive_tile_load->readTilesOk),
		archive_tile_load != nullptr ? archive_tile_load->firstPixelR : 0,
		archive_tile_load != nullptr ? archive_tile_load->firstPixelG : 0,
		archive_tile_load != nullptr ? archive_tile_load->firstPixelB : 0,
		archive_tile_load != nullptr ? archive_tile_load->firstPixelA : 0,
		static_cast<unsigned long>(archive_tile_load != nullptr ? archive_tile_load->tileChecksum : 0),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->set_vertex_shader_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		state != nullptr ? state->last_browser_texture_id : 0,
		state != nullptr ? state->last_browser_texture_width : 0,
		state != nullptr ? state->last_browser_texture_height : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_format : 0),
		state != nullptr ? state->last_browser_texture_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_shader : 0),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.cull_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_write_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] : 0));

	target_json = buffer;

	if (scene != nullptr && render_object != nullptr && scene_object_added) {
		scene->Remove_Render_Object(render_object);
	}
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(render_object);
	REF_PTR_RELEASE(camera);
	if (tile != nullptr) {
		tile->detachMapForProbe();
	}
	delete tile;
	ProbeWorldHeightMap::destroy(map, map_buffers);
	ProbeTerrainDiffuseOwner::destroy(diffuse_owner);
	TheTerrainRenderObject = old_terrain_render_object;

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_global_data;

	return target_json.c_str();
}

const char *run_ww3d_terrain_map_patch_scene_probe(
	std::string &target_json,
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	bool enable_shroud = false)
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	const bool old_shroud_enabled = g_ww3d_terrain_probe_shroud_enabled;
	g_ww3d_terrain_probe_shroud_enabled = enable_shroud;

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = nullptr;

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	int init_height_data_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool map_created = false;
	bool water_transparency_ready = false;
	bool render_object_created = false;
	bool render_object_initialized = false;
	bool scene_created = false;
	bool scene_object_added = false;
	bool shroud_installed = false;
	bool shroud_initialized = false;
	bool shroud_fill_invoked = false;
	bool shroud_render_invoked = false;
	bool shroud_texture_ready = false;
	bool shroud_terrain_render_invoked = false;
	bool shroud_terrain_render_saw_shroud = false;
	bool shroud_terrain_render_saw_shroud_after = false;
	bool shroud_terrain_original_draw_seen = false;
	bool shroud_terrain_original_install_zfunc_equal_seen = false;
	bool shroud_terrain_original_install_camera_space_seen = false;
	bool shroud_terrain_original_install_count2_seen = false;
	bool shroud_terrain_final_draw_seen = false;
	bool shroud_terrain_fallback_invoked = false;
	Int shroud_terrain_additional_pass_count = -1;
	Int shroud_terrain_additional_pass_count_after = -1;
	UINT shroud_terrain_draw_calls_before = 0;
	UINT shroud_terrain_draw_calls_after = 0;
	UINT shroud_terrain_draw_calls_after_base = 0;
	Int shroud_cells_x = 0;
	Int shroud_cells_y = 0;
	Int shroud_texture_width = 0;
	Int shroud_texture_height = 0;
	Int shroud_sample_level = -1;
	float shroud_draw_origin_x = 0.0f;
	float shroud_draw_origin_y = 0.0f;

	ProbeTerrainMapPatchLoad map_load;
	WorldHeightMap *map = load_archive_terrain_map_patch(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load);
	map_created = map_load.mapParsed && map != nullptr;

	if (map_created) {
		global_data = NEW GlobalData;
		if (global_data != nullptr) {
			configure_global_data(*global_data, enable_shroud);
			TheWritableGlobalData = global_data;
		}
	}

	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	HeightMapRenderObjClass *render_object = nullptr;
	ProbeHeightMapRenderObjWithShroud *shroud_render_object = nullptr;
	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;
	bool shader_manager_initialized = false;

	if (map_created && global_data != nullptr) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result) && map_created) {
		WW3D::Set_Thumbnail_Enabled(false);
		W3DShaderManager::init();
		shader_manager_initialized = true;

		WaterTransparencySetting *current_water_transparency =
			const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
		if (current_water_transparency != nullptr) {
			water_transparency_ready = true;
		} else {
			probe_water_transparency = newInstance(WaterTransparencySetting);
			TheWaterTransparency = probe_water_transparency;
			water_transparency_ready = probe_water_transparency != nullptr;
		}

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, 1000.0f);
			const float terrain_center_z =
				static_cast<float>(map_load.patchCenterHeight) * MAP_HEIGHT_SCALE - 180.0f;
			Matrix3D camera_transform(true);
			camera_transform.Look_At(
				Vector3(0.0f, static_cast<float>(kMapPatchCells) * MAP_XY_FACTOR * 1.5f, terrain_center_z + 240.0f),
				Vector3(0.0f, 0.0f, terrain_center_z),
				0.0f);
			camera->Set_Transform(camera_transform);
		}

		if (water_transparency_ready && camera != nullptr) {
			map->setDrawWidth(kMapPatchVertices);
			map->setDrawHeight(kMapPatchVertices);
			map->setDrawOrg(map_load.patchOriginX, map_load.patchOriginY);

			if (enable_shroud) {
				shroud_render_object = NEW_REF(ProbeHeightMapRenderObjWithShroud, ());
				render_object = shroud_render_object;
			} else {
				render_object = NEW_REF(HeightMapRenderObjClass, ());
			}
			render_object_created = render_object != nullptr;
			if (render_object_created) {
				Matrix3D terrain_transform(true);
				const float patch_center_x =
					(static_cast<float>(map_load.patchOriginX) +
					 static_cast<float>(kMapPatchCells) * 0.5f -
					 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
				const float patch_center_y =
					(static_cast<float>(map_load.patchOriginY) +
					 static_cast<float>(kMapPatchCells) * 0.5f -
					 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
				terrain_transform.Set_Translation(Vector3(
					-patch_center_x,
					-patch_center_y,
					-180.0f));
				render_object->Set_Transform(terrain_transform);
				TheTerrainRenderObject = render_object;
				init_height_data_result = render_object->initHeightData(
					map->getDrawWidth(),
					map->getDrawHeight(),
					map,
					nullptr,
					TRUE);
				render_object_initialized = init_height_data_result == 0;
				if (enable_shroud && render_object_initialized && shroud_render_object != nullptr) {
					shroud_installed = shroud_render_object->installProbeShroud();
					W3DShroud *shroud = shroud_render_object->probeShroud();
					if (shroud_installed && shroud != nullptr) {
						shroud->init(
							map,
							TheGlobalData->m_partitionCellSize,
							TheGlobalData->m_partitionCellSize);
					}
					shroud_initialized =
						shroud_installed &&
						shroud != nullptr &&
						shroud->getNumShroudCellsX() > 0 &&
						shroud->getNumShroudCellsY() > 0 &&
						shroud->getShroudTexture() != nullptr;
					if (shroud_initialized) {
						shroud->fillShroudData(96);
						shroud_fill_invoked = true;
						shroud->setShroudFilter(FALSE);
						shroud_cells_x = shroud->getNumShroudCellsX();
						shroud_cells_y = shroud->getNumShroudCellsY();
						shroud_texture_width = shroud->getTextureWidth();
						shroud_texture_height = shroud->getTextureHeight();
						shroud_sample_level = shroud->getShroudLevel(0, 0);
					}
				}
			}
		}
	}

	if (render_object_initialized) {
		scene = NEW_REF(RTS3DScene, ());
		scene_created = scene != nullptr;
		if (scene_created) {
			scene->Add_Render_Object(render_object);
			scene_object_added = render_object->Peek_Scene() == scene;
		}
	}

	if (render_object_created && scene_object_added) {
		if (enable_shroud && shroud_initialized && shroud_render_object != nullptr) {
			W3DShroud *shroud = shroud_render_object->probeShroud();
			if (shroud != nullptr) {
				shroud->render(camera);
				shroud_render_invoked = true;
				shroud_texture_ready = shroud->getShroudTexture() != nullptr;
				shroud_draw_origin_x = shroud->getDrawOriginX();
				shroud_draw_origin_y = shroud->getDrawOriginY();
			}
		}
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(scene, camera);
			end_render_result = WW3D::End_Render(false);
		}
	}

	if (enable_shroud && shroud_render_object != nullptr) {
		shroud_terrain_render_invoked = shroud_render_object->probeRenderInvoked();
		shroud_terrain_render_saw_shroud = shroud_render_object->probeRenderSawShroud();
		shroud_terrain_render_saw_shroud_after = shroud_render_object->probeRenderSawShroudAfter();
		shroud_terrain_original_draw_seen = shroud_render_object->probeOriginalShroudDrawSeen();
		shroud_terrain_original_install_zfunc_equal_seen =
			shroud_render_object->probeOriginalInstallZFuncEqualSeen();
		shroud_terrain_original_install_camera_space_seen =
			shroud_render_object->probeOriginalInstallCameraSpaceSeen();
		shroud_terrain_original_install_count2_seen =
			shroud_render_object->probeOriginalInstallCount2Seen();
		shroud_terrain_final_draw_seen = shroud_render_object->probeFinalShroudDrawSeen();
		shroud_terrain_fallback_invoked = shroud_render_object->probeFallbackInvoked();
		shroud_terrain_additional_pass_count = shroud_render_object->probeAdditionalPassCount();
		shroud_terrain_additional_pass_count_after =
			shroud_render_object->probeAdditionalPassCountAfter();
		shroud_terrain_draw_calls_before = shroud_render_object->probeDrawCallsBefore();
		shroud_terrain_draw_calls_after = shroud_render_object->probeDrawCallsAfter();
		shroud_terrain_draw_calls_after_base = shroud_render_object->probeDrawCallsAfterBase();
	}

	ProbeWorldHeightMapInspector::recordRenderedTileMetrics(map, map_load);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const IniLayoutComparison ini_layout = compare_ini_layout();
	const bool ok =
		state != nullptr &&
		ini_layout.matches &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		map_load.iniArchiveLoaded &&
		map_load.mapsArchiveLoaded &&
		map_load.terrainArchiveLoaded &&
		map_load.terrainIniParsed &&
		map_load.terrainTypeCount > 0 &&
		map_load.mapEntryExists &&
		map_load.mapEntryOpenable &&
		map_load.mapStreamOpen &&
		map_created &&
		map_load.mapBytes > 0 &&
		map_load.width > kMapPatchCells &&
		map_load.height > kMapPatchCells &&
		map_load.heightChecksum > 0 &&
		map_load.patchHeightChecksum > 0 &&
		water_transparency_ready &&
		render_object_created &&
		render_object_initialized &&
		scene_created &&
		scene_object_added &&
		(!enable_shroud ||
			(shroud_installed &&
				shroud_initialized &&
				shroud_fill_invoked &&
				shroud_render_invoked &&
				shroud_texture_ready &&
				shroud_terrain_render_invoked &&
				shroud_terrain_render_saw_shroud &&
				shroud_terrain_additional_pass_count > 0 &&
				shroud_terrain_original_draw_seen &&
				shroud_terrain_final_draw_seen &&
				!shroud_terrain_fallback_invoked)) &&
		init_height_data_result == 0 &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		(!enable_shroud || state->draw_indexed_primitive_calls >= 3) &&
		state->last_draw_primitive_type == D3DPT_TRIANGLELIST &&
		state->last_draw_vertex_count > 0 &&
		state->last_draw_primitive_count > 0 &&
		state->last_draw_stream_source_stride == sizeof(VertexFormatXYZDUV2) &&
		state->last_draw_vertex_shader == DX8_FVF_XYZDUV2 &&
		(state->last_draw_transform_mask & 7u) == 7u;

	const std::string first_patch_texture_class_json =
		json_string(map_load.firstPatchTextureClassName);
	const std::string terrain_map_entry_json = json_string(kArchiveTerrainMapEntry);
	const std::string ini_layout_report_json = ini_layout_json(ini_layout);
	const char *probe_source =
		enable_shroud ?
			"ww3d_terrain_shroud_scene_probe" :
			"ww3d_terrain_map_patch_scene_probe";
	const char *render_object_name =
		enable_shroud ?
			"ProbeHeightMapRenderObjWithShroud" :
			"HeightMapRenderObjClass";
	const char *render_path =
		enable_shroud ?
			"RTS3DScene::Customized_Render -> W3DShroudMaterialPassClass -> HeightMapRenderObjClass::renderTerrainPass" :
			"RTS3DScene::Customized_Render -> CLASSID_TILEMAP Render -> HeightMapRenderObjClass::Render";

	char buffer[24000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,"
		"\"initHeightData\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"mapCreated\":%s,"
		"\"waterTransparencyReady\":%s,\"shaderManagerInitialized\":%s,"
		"\"renderObjectCreated\":%s,\"renderObjectInitialized\":%s},"
		"\"ini\":{\"attempted\":%s,\"argumentSupplied\":%s,"
		"\"path\":\"%s\",\"directory\":\"%s\",\"mask\":\"%s\","
		"\"defaultEntry\":\"Data\\\\INI\\\\Default\\\\Terrain.ini\","
		"\"defaultEntryExists\":%s,\"defaultEntryParsed\":%s,"
		"\"entry\":\"Data\\\\INI\\\\Terrain.ini\",\"loaded\":%s,"
		"\"entryExists\":%s,\"parsed\":%s,"
		"\"parser\":\"GameEngine/Common/INI.cpp::load + INITerrain.cpp\","
		"\"originalIniParser\":true,\"terrainTypeCount\":%lu,"
		"\"nameKeysReady\":%s,\"sidesListReady\":%s},"
		"\"iniLayout\":%s,"
		"\"archives\":{\"maps\":{\"argumentSupplied\":%s,\"path\":\"%s\","
		"\"directory\":\"%s\",\"mask\":\"%s\",\"loaded\":%s},"
		"\"terrain\":{\"argumentSupplied\":%s,\"path\":\"%s\","
		"\"directory\":\"%s\",\"mask\":\"%s\",\"loaded\":%s}},"
		"\"map\":{\"entry\":%s,"
		"\"entryExists\":%s,\"entryOpenable\":%s,\"streamOpen\":%s,"
		"\"parsed\":%s,\"parseException\":%s,\"bytes\":%d,"
		"\"width\":%d,\"height\":%d,\"border\":%d,\"drawWidth\":%d,"
		"\"drawHeight\":%d,\"firstHeight\":%u,\"heightChecksum\":%lu},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"expectedFlatTextureSize\":%u,\"tileSource\":\"shipped-map-heightmap\","
		"\"renderObject\":\"%s\","
		"\"renderWindowWidth\":%d,\"renderWindowHeight\":%d,"
		"\"renderOriginX\":%d,\"renderOriginY\":%d,"
		"\"patchOriginX\":%d,\"patchOriginY\":%d,\"patchCenterHeight\":%u,"
		"\"patchHeightChecksum\":%lu,"
		"\"tileDiagnostics\":{\"bitmapTiles\":%d,\"textureClasses\":%d,"
		"\"sourceTilesLoaded\":%d,\"sourceTilesPositioned\":%d,"
		"\"patchCells\":%d,\"patchCellsWithSource\":%d,"
		"\"patchCellsMissingSource\":%d,"
		"\"firstPatchTile\":{\"tileIndex\":%d,\"baseTileIndex\":%d,"
		"\"sourceTileLoaded\":%s,\"textureClass\":%d,"
		"\"textureClassName\":%s,\"texturePositionX\":%d,"
		"\"texturePositionY\":%d},"
		"\"sampleTextureClasses\":%s}},"
		"\"scene\":{\"renderPath\":\"WW3D::Render(RTS3DScene,CameraClass) -> "
		"%s\","
		"\"created\":%s,\"objectAdded\":%s,\"terrainClassId\":%d},"
		"\"shroud\":{\"requested\":%s,\"installed\":%s,"
		"\"initialized\":%s,\"fillInvoked\":%s,\"renderInvoked\":%s,"
		"\"textureReady\":%s,\"terrainRenderInvoked\":%s,"
		"\"terrainRenderSawShroud\":%s,\"terrainRenderSawShroudAfter\":%s,"
		"\"terrainAdditionalPassCount\":%d,"
		"\"terrainAdditionalPassCountAfter\":%d,"
		"\"terrainOriginalInstallZFuncEqualSeen\":%s,"
		"\"terrainOriginalInstallCameraSpaceSeen\":%s,"
		"\"terrainOriginalInstallCount2Seen\":%s,"
		"\"terrainOriginalDrawSeen\":%s,\"terrainFinalDrawSeen\":%s,"
		"\"terrainFallbackInvoked\":%s,"
		"\"terrainDrawCallsBefore\":%u,\"terrainDrawCallsAfter\":%u,"
		"\"terrainDrawCallsAfterBase\":%u,"
		"\"cellsX\":%d,\"cellsY\":%d,"
		"\"textureWidth\":%d,\"textureHeight\":%d,\"sampleLevel\":%d,"
		"\"drawOriginX\":%.4f,\"drawOriginY\":%.4f},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"setVertexShader\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"width\":%u,\"height\":%u,\"format\":%lu,"
		"\"bytes\":%u,\"checksum\":%lu},"
		"\"draw\":{\"primitiveType\":%d,\"vertexShaderFvf\":%lu,"
		"\"startVertex\":%u,\"minVertexIndex\":%u,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"vertexBytes\":%u,\"vertexChecksum\":%lu,\"indexBufferId\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,\"renderState\":{\"cullMode\":%lu,"
		"\"zEnable\":%lu,\"zWriteEnable\":%lu,\"zFunc\":%lu,"
		"\"textureStage0ColorOp\":%lu,\"textureStage1ColorOp\":%lu}}}",
		probe_source,
		bool_json(ok),
		init_result,
		set_device_result,
		init_height_data_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(map_created),
		bool_json(water_transparency_ready),
		bool_json(shader_manager_initialized),
		bool_json(render_object_created),
		bool_json(render_object_initialized),
		bool_json(map_load.attempted),
		bool_json(map_load.iniArgumentSupplied),
		map_load.iniArchivePath.c_str(),
		map_load.iniArchiveDirectory.c_str(),
		map_load.iniArchiveMask.c_str(),
		bool_json(map_load.defaultTerrainIniExists),
		bool_json(map_load.defaultTerrainIniParsed),
		bool_json(map_load.iniArchiveLoaded),
		bool_json(map_load.terrainIniExists),
		bool_json(map_load.terrainIniParsed),
		static_cast<unsigned long>(map_load.terrainTypeCount),
		bool_json(map_load.nameKeysReady),
		bool_json(map_load.sidesListReady),
		ini_layout_report_json.c_str(),
		bool_json(map_load.mapsArgumentSupplied),
		map_load.mapsArchivePath.c_str(),
		map_load.mapsArchiveDirectory.c_str(),
		map_load.mapsArchiveMask.c_str(),
		bool_json(map_load.mapsArchiveLoaded),
		bool_json(map_load.terrainArgumentSupplied),
		map_load.terrainArchivePath.c_str(),
		map_load.terrainArchiveDirectory.c_str(),
		map_load.terrainArchiveMask.c_str(),
		bool_json(map_load.terrainArchiveLoaded),
		terrain_map_entry_json.c_str(),
		bool_json(map_load.mapEntryExists),
		bool_json(map_load.mapEntryOpenable),
		bool_json(map_load.mapStreamOpen),
		bool_json(map_load.mapParsed),
		bool_json(map_load.mapParseException),
		map_load.mapBytes,
		map_load.width,
		map_load.height,
		map_load.border,
		map_load.drawWidth,
		map_load.drawHeight,
		map_load.firstHeight,
		static_cast<unsigned long>(map_load.heightChecksum),
		kMapPatchVertices,
		kMapPatchCells,
		kMapPatchExpectedFlatTextureSize,
		render_object_name,
		map != nullptr ? map->getDrawWidth() : 0,
		map != nullptr ? map->getDrawHeight() : 0,
		map != nullptr ? map->getDrawOrgX() : 0,
		map != nullptr ? map->getDrawOrgY() : 0,
		map_load.patchOriginX,
		map_load.patchOriginY,
		map_load.patchCenterHeight,
		static_cast<unsigned long>(map_load.patchHeightChecksum),
		map_load.bitmapTileCount,
		map_load.textureClassCount,
		map_load.sourceTilesLoaded,
		map_load.sourceTilesPositioned,
		map_load.patchTileCells,
		map_load.patchTilesWithSource,
		map_load.patchTilesMissingSource,
		map_load.firstPatchTileIndex,
		map_load.firstPatchBaseTileIndex,
		bool_json(map_load.firstPatchSourceTileLoaded),
		map_load.firstPatchTextureClass,
		first_patch_texture_class_json.c_str(),
		map_load.firstPatchTileTextureX,
		map_load.firstPatchTileTextureY,
		map_load.textureClassesJson.c_str(),
		render_path,
		bool_json(scene_created),
		bool_json(scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
		bool_json(enable_shroud),
		bool_json(shroud_installed),
		bool_json(shroud_initialized),
		bool_json(shroud_fill_invoked),
		bool_json(shroud_render_invoked),
		bool_json(shroud_texture_ready),
		bool_json(shroud_terrain_render_invoked),
		bool_json(shroud_terrain_render_saw_shroud),
		bool_json(shroud_terrain_render_saw_shroud_after),
		shroud_terrain_additional_pass_count,
		shroud_terrain_additional_pass_count_after,
		bool_json(shroud_terrain_original_install_zfunc_equal_seen),
		bool_json(shroud_terrain_original_install_camera_space_seen),
		bool_json(shroud_terrain_original_install_count2_seen),
		bool_json(shroud_terrain_original_draw_seen),
		bool_json(shroud_terrain_final_draw_seen),
		bool_json(shroud_terrain_fallback_invoked),
		shroud_terrain_draw_calls_before,
		shroud_terrain_draw_calls_after,
		shroud_terrain_draw_calls_after_base,
		shroud_cells_x,
		shroud_cells_y,
		shroud_texture_width,
		shroud_texture_height,
		shroud_sample_level,
		shroud_draw_origin_x,
		shroud_draw_origin_y,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->set_vertex_shader_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		state != nullptr ? state->last_browser_texture_id : 0,
		state != nullptr ? state->last_browser_texture_width : 0,
		state != nullptr ? state->last_browser_texture_height : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_format : 0),
		state != nullptr ? state->last_browser_texture_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_shader : 0),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.cull_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_write_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] : 0));

	target_json = buffer;

	if (scene != nullptr && render_object != nullptr && scene_object_added) {
		scene->Remove_Render_Object(render_object);
	}
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(render_object);
	REF_PTR_RELEASE(camera);
	TheTerrainRenderObject = old_terrain_render_object;
	TheWaterTransparency = old_water_transparency;
	if (probe_water_transparency != nullptr &&
			probe_water_transparency != old_water_transparency) {
		probe_water_transparency->deleteInstance();
	}
	REF_PTR_RELEASE(map_load.map);
	map = nullptr;

	if (succeeded(init_result)) {
		if (shader_manager_initialized)
			W3DShaderManager::shutdown();
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	delete global_data;
	g_ww3d_terrain_probe_shroud_enabled = old_shroud_enabled;

	return target_json.c_str();
}

const char *run_ww3d_terrain_visual_scene_probe(
	std::string &target_json,
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	bool use_full_init,
	bool use_load_window,
	bool use_camera_pan,
	bool use_visual_shroud,
	bool use_shroud_update)
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	const bool visual_shroud_mode =
		(use_visual_shroud || use_shroud_update) &&
		!use_full_init &&
		!use_load_window &&
		!use_camera_pan;
	const bool full_init_shroud_update_mode =
		use_full_init &&
		use_shroud_update &&
		!use_load_window &&
		!use_camera_pan;
	const bool shroud_scene_mode = visual_shroud_mode || full_init_shroud_update_mode;
	const bool shroud_update_mode = visual_shroud_mode && use_shroud_update;
	const bool full_init_shroud_update_requested = full_init_shroud_update_mode && use_shroud_update;
	const bool shroud_update_requested = shroud_update_mode || full_init_shroud_update_requested;
	const bool partition_refresh_mode = shroud_update_requested;
	const bool old_shroud_enabled = g_ww3d_terrain_probe_shroud_enabled;
	g_ww3d_terrain_probe_shroud_enabled = shroud_scene_mode;

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = nullptr;
	TerrainVisual *old_terrain_visual = TheTerrainVisual;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	RTS3DScene *old_3d_scene = W3DDisplay::m_3DScene;
	W3DDisplay::m_3DScene = nullptr;

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	int patch_init_height_data_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	int camera_pan_begin_render_result = WW3D_ERROR_GENERIC;
	int camera_pan_render_result = WW3D_ERROR_GENERIC;
	int camera_pan_end_render_result = WW3D_ERROR_GENERIC;
	int shroud_update_begin_render_result = WW3D_ERROR_GENERIC;
	int shroud_update_render_result = WW3D_ERROR_GENERIC;
	int shroud_update_end_render_result = WW3D_ERROR_GENERIC;
	bool archive_context_ready = false;
	bool map_created = false;
	bool water_transparency_ready = false;
	bool visual_created = false;
	bool visual_init_completed = false;
	bool visual_init_exception = false;
	bool render_object_created = false;
	bool render_object_installed = false;
	bool visual_load_returned = false;
	bool visual_load_exception = false;
	bool visual_load_initialized_render_object = false;
	bool scene_created = false;
	bool visual_scene_object_added = false;
	bool water_ini_loaded = false;
	bool water_ini_exception = false;
	bool water_ini_entry_exists = false;
	UnsignedInt water_ini_bytes = 0;
	std::string water_ini_error;
	Int water_setting_count = 0;
	ProbeWaterAssetMetrics water_asset_metrics;
	bool water_assets_ready = false;
	bool full_init_attempted = false;
	bool full_init_blocked_by_missing_water_assets = false;
	bool water_render_object_created = false;
	bool water_render_object_global_match = false;
	bool water_render_object_scene_added = false;
	bool load_window_render_selected = false;
	bool patch_reinitialized = false;
	bool camera_configured = false;
	bool camera_pan_requested = false;
	bool camera_pan_moved = false;
	bool shader_manager_initialized = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool texture_file_factory_installed = false;
	bool shroud_installed = false;
	bool shroud_initialized = false;
	bool shroud_fill_invoked = false;
	bool shroud_render_invoked = false;
	bool shroud_texture_ready = false;
	bool shroud_terrain_render_invoked = false;
	bool shroud_terrain_render_saw_shroud = false;
	bool shroud_terrain_render_saw_shroud_after = false;
	bool shroud_terrain_original_draw_seen = false;
	bool shroud_terrain_original_install_zfunc_equal_seen = false;
	bool shroud_terrain_original_install_camera_space_seen = false;
	bool shroud_terrain_original_install_count2_seen = false;
	bool shroud_terrain_final_draw_seen = false;
	bool shroud_terrain_fallback_invoked = false;
	Int shroud_terrain_additional_pass_count = -1;
	Int shroud_terrain_additional_pass_count_after = -1;
	UINT shroud_terrain_draw_calls_before = 0;
	UINT shroud_terrain_draw_calls_after = 0;
	UINT shroud_terrain_draw_calls_after_base = 0;
	Int shroud_cells_x = 0;
	Int shroud_cells_y = 0;
	Int shroud_texture_width = 0;
	Int shroud_texture_height = 0;
	Int shroud_sample_level = -1;
	float shroud_draw_origin_x = 0.0f;
	float shroud_draw_origin_y = 0.0f;
	Int visual_load_draw_width = 0;
	Int visual_load_draw_height = 0;
	Int visual_load_draw_origin_x = 0;
	Int visual_load_draw_origin_y = 0;
	Int render_window_width = 0;
	Int render_window_height = 0;
	Int render_window_cells = 0;
	UnsignedInt render_expected_flat_texture_size = 0;
	UnsignedInt draw_indexed_after_first_render = 0;
	UnsignedInt draw_indexed_after_camera_pan = 0;
	UnsignedInt draw_indexed_after_shroud_update = 0;
	UnsignedInt clear_after_first_render = 0;
	UnsignedInt clear_after_camera_pan = 0;
	UnsignedInt clear_after_shroud_update = 0;
	UnsignedInt texture_update_after_first_render = 0;
	UnsignedInt texture_update_after_shroud_update = 0;
	bool shroud_update_set_invoked = false;
	bool shroud_update_display_invoked = false;
	bool shroud_update_notify_invoked = false;
	bool shroud_update_render_invoked = false;
	bool shroud_update_sample_changed = false;
	Int shroud_update_status = CELLSHROUD_CLEAR;
	Int shroud_update_expected_level = -1;
	Int shroud_update_sample_x = -1;
	Int shroud_update_sample_y = -1;
	Int shroud_update_sample_before = -1;
	Int shroud_update_sample_after = -1;
	Int shroud_update_cells_changed = 0;
	ProbePartitionShroudRefreshMetrics partition_shroud_refresh;
	ProbeTerrainCameraView primary_camera_view;
	ProbeTerrainCameraView camera_pan_view;
	ProbePolygonTriggerMetrics polygon_metrics;
	ProbeLogicalTerrainLoadMetrics logical_terrain_load;

	ProbeTerrainMapPatchLoad map_load;
	ProbeTerrainArchiveContext archive_context;
	probe_bridge_phase_log("prepare");
	archive_context_ready = archive_context.prepare(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load);

	if (archive_context_ready) {
		global_data = NEW GlobalData;
		if (global_data != nullptr) {
			configure_global_data(*global_data, shroud_scene_mode);
			TheWritableGlobalData = global_data;
		}
	}

	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	WaterSetting old_water_settings[TIME_OF_DAY_COUNT];
	copy_water_settings(old_water_settings);
	ProbeW3DTerrainVisual *visual = nullptr;
	HeightMapRenderObjClass *render_object = nullptr;
	ProbeHeightMapRenderObjWithShroud *shroud_render_object = nullptr;
	CameraClass *camera = nullptr;
	WorldHeightMap *map = nullptr;
	WW3DAssetManager *asset_manager = nullptr;

	if (use_full_init && archive_context_ready) {
		try {
			probe_bridge_phase_log("full-scene-water-ini");
			TheWaterTransparency = nullptr;
			reset_water_settings();
			FileInfo water_ini_info = {};
			water_ini_entry_exists =
				archive_context.fileSystem() != nullptr &&
				TheArchiveFileSystem != nullptr &&
				TheArchiveFileSystem->getFileInfo(AsciiString(kArchiveWaterIniEntry), &water_ini_info) &&
				water_ini_info.sizeHigh == 0 &&
				water_ini_info.sizeLow > 0;
			water_ini_bytes = water_ini_entry_exists ? water_ini_info.sizeLow : 0U;
			INI water_ini;
			water_ini.load(AsciiString(kArchiveWaterIniEntry), INI_LOAD_OVERWRITE, nullptr);
			water_ini_loaded = true;
			water_setting_count = count_loaded_water_settings();
			water_asset_metrics = collect_water_asset_metrics(archive_context.fileSystem());
			water_assets_ready =
				water_setting_count == expected_loaded_water_settings() &&
				water_asset_metrics.requiredTextures > 0 &&
				water_asset_metrics.missingTextures == 0;
			probe_bridge_phase_log("full-scene-water-ini-done");
		} catch (const INIException &exception) {
			water_ini_exception = true;
			water_ini_loaded = false;
			water_ini_error =
				exception.mFailureMessage != nullptr
					? exception.mFailureMessage
					: "INIException";
		} catch (...) {
			water_ini_exception = true;
			water_ini_loaded = false;
			water_ini_error = "unknown";
		}
	}

	if (archive_context_ready && global_data != nullptr) {
		if (use_full_init) {
			probe_bridge_phase_log("full-scene-ww3d-init");
		}
		init_result = WW3D::Init(nullptr, nullptr, false);
	}

	if (succeeded(init_result)) {
		asset_manager = W3DNEW W3DAssetManager();
		asset_manager_created = asset_manager != nullptr;
	}

	if (asset_manager != nullptr) {
		asset_manager->Set_WW3D_Load_On_Demand(true);
	}

	if (asset_manager_created) {
		if (use_full_init) {
			probe_bridge_phase_log("full-scene-set-render-device");
		}
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		W3DShaderManager::init();
		shader_manager_initialized = true;
		if (use_full_init) {
			probe_bridge_phase_log("full-scene-install-runtime-assets");
		}
		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_set(
				map_load.terrainArchiveDirectory.c_str(),
				map_load.terrainArchiveMask.c_str());
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		archive_context.activateGlobals();

		if (TheWaterTransparency.getNonOverloadedPointer() != nullptr) {
			water_transparency_ready = true;
		} else {
			probe_water_transparency = newInstance(WaterTransparencySetting);
			TheWaterTransparency = probe_water_transparency;
			water_transparency_ready = probe_water_transparency != nullptr;
		}

		W3DDisplay::m_3DScene = NEW_REF(RTS3DScene, ());
		scene_created = W3DDisplay::m_3DScene != nullptr;
	}

	if (water_transparency_ready && scene_created) {
		visual = NEW ProbeW3DTerrainVisual;
		visual_created = visual != nullptr;
		if (visual_created) {
			TheTerrainVisual = visual;
			if (use_full_init && water_assets_ready) {
				full_init_attempted = true;
				probe_bridge_phase_log("full-scene-visual-init");
				try {
					visual->W3DTerrainVisual::init();
					visual_init_completed = true;
				} catch (...) {
					visual_init_exception = true;
					visual_init_completed = false;
				}
				render_object = static_cast<HeightMapRenderObjClass *>(visual->terrainRenderObject());
				render_object_created = render_object != nullptr;
				render_object_installed =
					render_object_created &&
					TheTerrainRenderObject == render_object;
				WaterRenderObjClass *water_render_object = visual->waterRenderObject();
				water_render_object_created = water_render_object != nullptr;
				water_render_object_global_match =
					water_render_object_created &&
					TheWaterRenderObj == water_render_object;
				water_render_object_scene_added =
					water_render_object_created &&
					water_render_object->Peek_Scene() == W3DDisplay::m_3DScene;
				probe_bridge_phase_log("full-scene-visual-init-done");
			} else {
				full_init_blocked_by_missing_water_assets =
					use_full_init &&
					water_ini_loaded &&
					!water_ini_exception &&
					!water_assets_ready;
				if (visual_shroud_mode) {
					shroud_render_object = NEW_REF(ProbeHeightMapRenderObjWithShroud, ());
					render_object = shroud_render_object;
				} else {
					render_object = NEW_REF(HeightMapRenderObjClass, ());
				}
				render_object_created = render_object != nullptr;
				render_object_installed = visual->installTerrainRenderObject(render_object);
				if (!render_object_installed) {
					REF_PTR_RELEASE(render_object);
					shroud_render_object = nullptr;
				}
			}
		}
	}

	if (render_object_installed) {
		if (use_full_init) {
			probe_bridge_phase_log("full-scene-visual-load");
		}
		try {
			visual_load_returned = visual->W3DTerrainVisual::load(AsciiString(kArchiveTerrainMapEntry));
		} catch (...) {
			visual_load_exception = true;
			visual_load_returned = false;
		}
		if (use_full_init) {
			probe_bridge_phase_log("full-scene-visual-load-done");
		}
	}

	if (visual_load_returned && visual != nullptr) {
		map = visual->getLogicHeightMap();
		map_created = map != nullptr;
		map_load.map = map;
		map_load.mapStreamOpen = map_created;
		map_load.mapParsed = map_created;
		if (map_created) {
			polygon_metrics = collect_polygon_trigger_metrics();
			record_parsed_map_metrics(map_load);
			ProbeWorldHeightMapInspector::recordTextureClassLoadMetrics(
				map,
				archive_context.terrainTypes(),
				archive_context.fileSystem(),
				map_load);
			visual_load_draw_width = map_load.drawWidth;
			visual_load_draw_height = map_load.drawHeight;
			visual_load_draw_origin_x = map->getDrawOrgX();
			visual_load_draw_origin_y = map->getDrawOrgY();
			if (use_load_window) {
				map_load.patchCells = std::max(1, std::min(map_load.drawWidth, map_load.drawHeight) - 1);
				map_load.patchOriginX = visual_load_draw_origin_x;
				map_load.patchOriginY = visual_load_draw_origin_y;
				record_patch_height_metrics(map_load);
			} else {
				map_load.patchCells = kMapPatchCells;
				ProbeWorldHeightMapInspector::selectLoadedPatchOrigin(map, map_load);
			}
			visual_load_initialized_render_object =
				visual->terrainRenderObject() == render_object &&
				render_object->getMap() == map;
			visual_scene_object_added =
				render_object->Peek_Scene() == W3DDisplay::m_3DScene;
			if (use_full_init) {
				WaterRenderObjClass *water_render_object = visual->waterRenderObject();
				water_render_object_created = water_render_object != nullptr;
				water_render_object_global_match =
					water_render_object_created &&
					TheWaterRenderObj == water_render_object;
				water_render_object_scene_added =
					water_render_object_created &&
					water_render_object->Peek_Scene() == W3DDisplay::m_3DScene;
			}
		}
	}

	if (map_created && visual_load_initialized_render_object && visual_scene_object_added) {
		if (use_load_window) {
			load_window_render_selected = true;
		} else {
			map->setDrawWidth(kMapPatchVertices);
			map->setDrawHeight(kMapPatchVertices);
			map->setDrawOrg(map_load.patchOriginX, map_load.patchOriginY);

			Matrix3D terrain_transform(true);
			const float patch_center_x =
				(static_cast<float>(map_load.patchOriginX) +
				 static_cast<float>(kMapPatchCells) * 0.5f -
				 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
			const float patch_center_y =
				(static_cast<float>(map_load.patchOriginY) +
				 static_cast<float>(kMapPatchCells) * 0.5f -
				 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
			terrain_transform.Set_Translation(Vector3(
				-patch_center_x,
				-patch_center_y,
				-180.0f));
			render_object->Set_Transform(terrain_transform);

			patch_init_height_data_result = render_object->initHeightData(
				map->getDrawWidth(),
				map->getDrawHeight(),
				map,
				nullptr,
				TRUE);
			patch_reinitialized = patch_init_height_data_result == 0;
		}
	}

	if (map != nullptr) {
		render_window_width = map->getDrawWidth();
		render_window_height = map->getDrawHeight();
		render_window_cells = std::max(0, std::min(render_window_width, render_window_height) - 1);
		render_expected_flat_texture_size =
			static_cast<UnsignedInt>(std::max(0, render_window_cells) * 8);
	}

	if ((use_load_window && load_window_render_selected) || (!use_load_window && patch_reinitialized)) {
		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			configure_terrain_visual_camera(
				camera,
				map_load,
				use_load_window,
				render_window_cells,
				0.0f,
				0.0f,
				primary_camera_view);
			camera_configured = true;
		}
	}

	if (shroud_scene_mode &&
			patch_reinitialized &&
			camera_configured &&
			render_object != nullptr) {
		W3DShroud *shroud = nullptr;
		if (shroud_render_object != nullptr) {
			shroud_installed = shroud_render_object->installProbeShroud();
			shroud = shroud_render_object->probeShroud();
		} else {
			// Full-init mode expects W3DTerrainVisual::init to own shroud initialization.
			shroud = render_object->getShroud();
			shroud_installed = shroud != nullptr;
		}
		if (visual_shroud_mode && shroud_installed && shroud != nullptr) {
			shroud->init(
				map,
				TheGlobalData->m_partitionCellSize,
				TheGlobalData->m_partitionCellSize);
		}
		shroud_initialized =
			shroud_installed &&
			shroud != nullptr &&
			shroud->getNumShroudCellsX() > 0 &&
			shroud->getNumShroudCellsY() > 0 &&
			shroud->getShroudTexture() != nullptr;
		if (shroud_initialized) {
			shroud->fillShroudData(96);
			shroud_fill_invoked = true;
			shroud->setShroudFilter(FALSE);
			shroud_cells_x = shroud->getNumShroudCellsX();
			shroud_cells_y = shroud->getNumShroudCellsY();
			shroud_texture_width = shroud->getTextureWidth();
			shroud_texture_height = shroud->getTextureHeight();
			shroud_sample_level = shroud->getShroudLevel(0, 0);
			shroud->render(camera);
			shroud_render_invoked = true;
			shroud_texture_ready = shroud->getShroudTexture() != nullptr;
			shroud_draw_origin_x = shroud->getDrawOriginX();
			shroud_draw_origin_y = shroud->getDrawOriginY();
		}
	}

	if (camera != nullptr && W3DDisplay::m_3DScene != nullptr) {
		if (use_full_init) {
			probe_bridge_phase_log("full-scene-render");
		}
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(W3DDisplay::m_3DScene, camera);
			end_render_result = WW3D::End_Render(false);
			const WasmD3D8ShimState *state_after_first_render = wasm_d3d8_get_state();
			if (state_after_first_render != nullptr) {
				draw_indexed_after_first_render = state_after_first_render->draw_indexed_primitive_calls;
				clear_after_first_render = state_after_first_render->clear_calls;
				texture_update_after_first_render = state_after_first_render->browser_texture_update_calls;
			}
		}
		if (use_full_init) {
			probe_bridge_phase_log("full-scene-render-done");
		}
	}

	if (shroud_update_requested &&
			shroud_initialized &&
			camera != nullptr &&
			W3DDisplay::m_3DScene != nullptr &&
			succeeded(end_render_result) &&
			render_object != nullptr) {
		W3DShroud *shroud =
			shroud_render_object != nullptr ?
				shroud_render_object->probeShroud() :
				render_object->getShroud();
		if (shroud != nullptr) {
			alignas(W3DDisplay) unsigned char display_storage[sizeof(W3DDisplay)] = {};
			W3DDisplay *display = reinterpret_cast<W3DDisplay *>(display_storage);
			shroud_update_expected_level =
				TheGlobalData != nullptr ? TheGlobalData->m_clearAlpha : -1;
			shroud_update_sample_x = std::max(
				0,
				std::min(
					shroud->getNumShroudCellsX() - 1,
					map_load.patchOriginX - map_load.border + kMapPatchCells / 2));
			shroud_update_sample_y = std::max(
				0,
				std::min(
					shroud->getNumShroudCellsY() - 1,
					map_load.patchOriginY - map_load.border + kMapPatchCells / 2));
			shroud_update_sample_before =
				shroud->getShroudLevel(shroud_update_sample_x, shroud_update_sample_y);
			const Int update_radius = 12;
			for (Int y = std::max(0, shroud_update_sample_y - update_radius);
					y <= std::min(shroud->getNumShroudCellsY() - 1, shroud_update_sample_y + update_radius);
					++y) {
				for (Int x = std::max(0, shroud_update_sample_x - update_radius);
						x <= std::min(shroud->getNumShroudCellsX() - 1, shroud_update_sample_x + update_radius);
						++x) {
					display->W3DDisplay::setShroudLevel(
						x,
						y,
						static_cast<CellShroudStatus>(shroud_update_status));
					++shroud_update_cells_changed;
				}
			}
			shroud_update_set_invoked = shroud_update_cells_changed > 0;
			shroud_update_display_invoked = shroud_update_set_invoked;
			shroud_update_notify_invoked = shroud_update_set_invoked;
			shroud_update_sample_after =
				shroud->getShroudLevel(shroud_update_sample_x, shroud_update_sample_y);
			shroud_update_sample_changed =
				shroud_update_sample_after > shroud_update_sample_before;
			shroud->render(camera);
			shroud_update_render_invoked = true;
			const WasmD3D8ShimState *state_after_update_upload = wasm_d3d8_get_state();
			if (state_after_update_upload != nullptr) {
				texture_update_after_shroud_update =
					state_after_update_upload->browser_texture_update_calls;
			}
			shroud_update_begin_render_result =
				WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(shroud_update_begin_render_result)) {
				shroud_update_render_result = WW3D::Render(W3DDisplay::m_3DScene, camera);
				shroud_update_end_render_result = WW3D::End_Render(false);
				const WasmD3D8ShimState *state_after_update_render = wasm_d3d8_get_state();
				if (state_after_update_render != nullptr) {
					draw_indexed_after_shroud_update =
						state_after_update_render->draw_indexed_primitive_calls;
					clear_after_shroud_update = state_after_update_render->clear_calls;
					texture_update_after_shroud_update =
						state_after_update_render->browser_texture_update_calls;
				}
			}
		}
	}

	if (partition_refresh_mode &&
			map_created &&
			!logical_terrain_load.attempted) {
		logical_terrain_load =
			run_logical_terrain_load_probe(map, kArchiveTerrainMapEntry);
	}

	if (partition_refresh_mode &&
			shroud_update_render_invoked &&
			render_object != nullptr &&
			camera != nullptr &&
			W3DDisplay::m_3DScene != nullptr &&
			succeeded(shroud_update_end_render_result)) {
		W3DShroud *shroud =
			shroud_render_object != nullptr ?
				shroud_render_object->probeShroud() :
				render_object->getShroud();
		if (shroud != nullptr) {
			partition_shroud_refresh = run_partition_shroud_refresh_probe(
				kArchiveTerrainMapEntry,
				shroud,
				camera,
				shroud_update_sample_x,
				shroud_update_sample_y,
				&logical_terrain_load);
		}
	}

	if (visual_shroud_mode && shroud_render_object != nullptr) {
		shroud_terrain_render_invoked = shroud_render_object->probeRenderInvoked();
		shroud_terrain_render_saw_shroud = shroud_render_object->probeRenderSawShroud();
		shroud_terrain_render_saw_shroud_after = shroud_render_object->probeRenderSawShroudAfter();
		shroud_terrain_original_draw_seen = shroud_render_object->probeOriginalShroudDrawSeen();
		shroud_terrain_original_install_zfunc_equal_seen =
			shroud_render_object->probeOriginalInstallZFuncEqualSeen();
		shroud_terrain_original_install_camera_space_seen =
			shroud_render_object->probeOriginalInstallCameraSpaceSeen();
		shroud_terrain_original_install_count2_seen =
			shroud_render_object->probeOriginalInstallCount2Seen();
		shroud_terrain_final_draw_seen = shroud_render_object->probeFinalShroudDrawSeen();
		shroud_terrain_fallback_invoked = shroud_render_object->probeFallbackInvoked();
		shroud_terrain_additional_pass_count = shroud_render_object->probeAdditionalPassCount();
		shroud_terrain_additional_pass_count_after =
			shroud_render_object->probeAdditionalPassCountAfter();
		shroud_terrain_draw_calls_before = shroud_render_object->probeDrawCallsBefore();
		shroud_terrain_draw_calls_after = shroud_render_object->probeDrawCallsAfter();
		shroud_terrain_draw_calls_after_base = shroud_render_object->probeDrawCallsAfterBase();
	}

	camera_pan_requested = use_camera_pan && !use_load_window;
	if (camera_pan_requested &&
			camera != nullptr &&
			W3DDisplay::m_3DScene != nullptr &&
			succeeded(end_render_result)) {
		const float pan_offset_x = primary_camera_view.renderSpan * 0.10f;
		const float pan_offset_y = primary_camera_view.renderSpan * -0.04f;
		configure_terrain_visual_camera(
			camera,
			map_load,
			false,
			render_window_cells,
			pan_offset_x,
			pan_offset_y,
			camera_pan_view);
		camera_pan_moved =
			camera_pan_view.targetX > primary_camera_view.targetX + 0.1f &&
			camera_pan_view.targetY < primary_camera_view.targetY - 0.1f &&
			camera_pan_view.eyeX > primary_camera_view.eyeX + 0.1f &&
			camera_pan_view.eyeY < primary_camera_view.eyeY;
		camera_pan_begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(camera_pan_begin_render_result)) {
			camera_pan_render_result = WW3D::Render(W3DDisplay::m_3DScene, camera);
			camera_pan_end_render_result = WW3D::End_Render(false);
			const WasmD3D8ShimState *state_after_camera_pan = wasm_d3d8_get_state();
			if (state_after_camera_pan != nullptr) {
				draw_indexed_after_camera_pan = state_after_camera_pan->draw_indexed_primitive_calls;
				clear_after_camera_pan = state_after_camera_pan->clear_calls;
			}
		}
	}

	if (map_created && !logical_terrain_load.attempted) {
		logical_terrain_load =
			run_logical_terrain_load_probe(map, kArchiveTerrainMapEntry);
	}

	ProbeWorldHeightMapInspector::recordRenderedTileMetrics(map, map_load);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const IniLayoutComparison ini_layout = compare_ini_layout();
	const bool ok =
		state != nullptr &&
		ini_layout.matches &&
		archive_context_ready &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		map_load.iniArchiveLoaded &&
		map_load.mapsArchiveLoaded &&
		map_load.terrainArchiveLoaded &&
		map_load.terrainIniParsed &&
		map_load.terrainTypeCount > 0 &&
		(!use_full_init ||
			(water_ini_loaded &&
			 !water_ini_exception &&
			 water_setting_count == expected_loaded_water_settings())) &&
		map_load.mapEntryExists &&
		map_load.mapEntryOpenable &&
		visual_created &&
		(!use_full_init ||
			(full_init_blocked_by_missing_water_assets ||
			 (visual_init_completed &&
			  !visual_init_exception &&
			  water_render_object_created &&
			  water_render_object_global_match &&
			  water_render_object_scene_added))) &&
		render_object_created &&
		render_object_installed &&
		visual_load_returned &&
		!visual_load_exception &&
		map_created &&
		logical_terrain_load.attempted &&
		logical_terrain_load.mapCacheInstalled &&
		logical_terrain_load.terrainLogicInstalled &&
		logical_terrain_load.gameClientInstalled &&
		logical_terrain_load.thingFactoryInstalled &&
		logical_terrain_load.scriptEngineInstalled &&
		logical_terrain_load.loadReturned &&
		!logical_terrain_load.loadException &&
		logical_terrain_load.sourceFilenameMatches &&
		logical_terrain_load.extentMatchesVisual &&
		logical_terrain_load.heightRangeMatchesVisual &&
		logical_terrain_load.timeOfDayNotified &&
		logical_terrain_load.notifiedTimeOfDay == logical_terrain_load.mapTimeOfDay &&
		logical_terrain_load.mapObjectsPresentAfterLoad &&
		visual_load_initialized_render_object &&
		scene_created &&
		visual_scene_object_added &&
		((use_load_window && load_window_render_selected && !patch_reinitialized) ||
			(!use_load_window && patch_reinitialized && patch_init_height_data_result == 0)) &&
		(!(use_visual_shroud || use_shroud_update) || shroud_scene_mode) &&
		(!shroud_scene_mode ||
			(shroud_installed &&
				shroud_initialized &&
				shroud_fill_invoked &&
				shroud_render_invoked &&
				shroud_texture_ready &&
				(!visual_shroud_mode ||
					(shroud_terrain_render_invoked &&
						shroud_terrain_render_saw_shroud &&
						shroud_terrain_render_saw_shroud_after &&
						shroud_terrain_additional_pass_count > 0 &&
						shroud_terrain_original_install_zfunc_equal_seen &&
						shroud_terrain_original_install_camera_space_seen &&
						shroud_terrain_original_install_count2_seen &&
						shroud_terrain_original_draw_seen &&
						shroud_terrain_final_draw_seen &&
						!shroud_terrain_fallback_invoked)))) &&
		water_transparency_ready &&
		(use_full_init ?
			(full_init_blocked_by_missing_water_assets ?
				!visual->hasWaterRenderObject() :
				visual->hasWaterRenderObject()) :
			!visual->hasWaterRenderObject()) &&
		camera_configured &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		(!camera_pan_requested ||
			(camera_pan_moved &&
			 succeeded(camera_pan_begin_render_result) &&
			 succeeded(camera_pan_render_result) &&
			 succeeded(camera_pan_end_render_result))) &&
		(!shroud_update_requested ||
			(shroud_update_set_invoked &&
			 shroud_update_display_invoked &&
			 shroud_update_notify_invoked &&
			 shroud_update_render_invoked &&
			 shroud_update_sample_changed &&
			 shroud_update_sample_after == shroud_update_expected_level &&
			 shroud_update_cells_changed > 0 &&
			 succeeded(shroud_update_begin_render_result) &&
			 succeeded(shroud_update_render_result) &&
			 succeeded(shroud_update_end_render_result) &&
			 texture_update_after_shroud_update > texture_update_after_first_render &&
			 draw_indexed_after_first_render >= 3 &&
			 draw_indexed_after_shroud_update >= 6 &&
			 clear_after_first_render >= 1 &&
			 clear_after_shroud_update >= 2)) &&
			(!partition_refresh_mode ||
				(partition_shroud_refresh.requested &&
				 partition_shroud_refresh.terrainLogicInstalled &&
				 partition_shroud_refresh.partitionCreated &&
			 partition_shroud_refresh.partitionInstalled &&
			 partition_shroud_refresh.partitionInitInvoked &&
			 partition_shroud_refresh.partitionCellsReady &&
			 partition_shroud_refresh.displayInstalled &&
			 partition_shroud_refresh.radarInstalled &&
			 partition_shroud_refresh.playerListInstalled &&
			 partition_shroud_refresh.revealInvoked &&
			 partition_shroud_refresh.refreshInvoked &&
			 partition_shroud_refresh.samplePrepared &&
			 partition_shroud_refresh.sampleChanged &&
			 partition_shroud_refresh.displaySampleTouched &&
			 partition_shroud_refresh.radarSampleTouched &&
			 partition_shroud_refresh.renderInvoked &&
			 partition_shroud_refresh.status == CELLSHROUD_FOGGED &&
			 partition_shroud_refresh.expectedLevel == partition_shroud_refresh.sampleAfter &&
			 partition_shroud_refresh.sampleAfter > partition_shroud_refresh.sampleBefore &&
			 partition_shroud_refresh.totalCells > 0 &&
			 partition_shroud_refresh.displaySetCalls >= partition_shroud_refresh.totalCells &&
			 partition_shroud_refresh.radarSetCalls >= partition_shroud_refresh.totalCells &&
			 partition_shroud_refresh.displayFoggedSetCalls > 0 &&
			 partition_shroud_refresh.radarFoggedSetCalls > 0 &&
			 partition_shroud_refresh.displayClearCalls == 1 &&
			 partition_shroud_refresh.radarClearCalls == 1 &&
			 succeeded(partition_shroud_refresh.beginRender) &&
			 succeeded(partition_shroud_refresh.render) &&
			 succeeded(partition_shroud_refresh.endRender) &&
			 partition_shroud_refresh.textureUpdate > texture_update_after_shroud_update &&
			 partition_shroud_refresh.drawIndexed >= 9 &&
			 partition_shroud_refresh.clear >= 3)) &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		(!shroud_scene_mode ||
			state->draw_indexed_primitive_calls >=
				(partition_refresh_mode ? 9u : (shroud_update_requested ? 6u : 3u))) &&
		(use_full_init || state->last_draw_primitive_type == D3DPT_TRIANGLELIST) &&
		state->last_draw_vertex_count > 0 &&
		state->last_draw_primitive_count > 0 &&
		(use_full_init || state->last_draw_stream_source_stride == sizeof(VertexFormatXYZDUV2)) &&
		(use_full_init || state->last_draw_vertex_shader == DX8_FVF_XYZDUV2) &&
		(state->last_draw_transform_mask & 7u) == 7u &&
		(!camera_pan_requested ||
			(state->draw_indexed_primitive_calls >= 4 &&
			 state->clear_calls >= 2 &&
			 draw_indexed_after_first_render >= 2 &&
			 draw_indexed_after_camera_pan >= 4 &&
			 clear_after_first_render >= 1 &&
			 clear_after_camera_pan >= 2));

	const std::string first_patch_texture_class_json =
		json_string(map_load.firstPatchTextureClassName);
	const std::string first_missing_water_texture_json =
		json_string(water_asset_metrics.firstMissingTexture);
	const std::string logical_source_filename_json =
		json_string(logical_terrain_load.sourceFilename);
	const std::string logical_failure_phase_json =
		json_string(logical_terrain_load.failurePhase);
	const std::string logical_failed_parser_json =
		json_string(logical_terrain_load.logicalHeightMapFailedParser);
	const std::string terrain_map_entry_json = json_string(kArchiveTerrainMapEntry);
	const std::string ini_layout_report_json = ini_layout_json(ini_layout);
	const char *source_name = use_full_init ?
		(full_init_shroud_update_mode ?
			"ww3d_terrain_full_scene_shroud_update_probe" :
			"ww3d_terrain_full_scene_probe") :
		(use_load_window ?
		"ww3d_terrain_visual_load_window_scene_probe" :
		(camera_pan_requested ?
			"ww3d_terrain_visual_camera_pan_scene_probe" :
			(visual_shroud_mode ?
				(shroud_update_mode ?
					"ww3d_terrain_visual_shroud_update_scene_probe" :
					"ww3d_terrain_visual_shroud_scene_probe") :
				"ww3d_terrain_visual_scene_probe")));
	const char *render_mode = use_full_init ?
		(full_init_shroud_update_mode ?
			"full-init-shroud-display-and-partition-refresh-source-patch" :
			(full_init_blocked_by_missing_water_assets ?
			"full-init-missing-water-assets-frontier" :
			"full-init-source-patch")) :
		(use_load_window ?
		"visual-load-window" :
		(camera_pan_requested ?
			"selected-source-patch-camera-pan" :
			(visual_shroud_mode ?
				(shroud_update_mode ?
					"visual-owned-shroud-display-and-partition-refresh-source-patch" :
					"visual-owned-shroud-source-patch") :
				"selected-source-patch")));
	const char *render_object_name = visual_shroud_mode ?
		"ProbeHeightMapRenderObjWithShroud" :
		"HeightMapRenderObjClass";
	const char *scene_render_path = shroud_scene_mode ?
		"WW3D::Render(W3DDisplay::m_3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> W3DShroudMaterialPassClass -> "
		"HeightMapRenderObjClass::renderTerrainPass -> HeightMapRenderObjClass::Render" :
		"WW3D::Render(W3DDisplay::m_3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> CLASSID_TILEMAP Render -> "
		"HeightMapRenderObjClass::Render";
	const UnsignedInt render_frame_count =
		(succeeded(end_render_result) ? 1u : 0u) +
		(shroud_update_requested && succeeded(shroud_update_end_render_result) ? 1u : 0u) +
		(partition_refresh_mode && succeeded(partition_shroud_refresh.endRender) ? 1u : 0u) +
		(camera_pan_requested && succeeded(camera_pan_end_render_result) ? 1u : 0u);

	char buffer[54000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\","
		"\"ok\":%s,"
		"\"renderMode\":\"%s\","
		"\"results\":{\"archiveContextReady\":%s,\"init\":%d,"
		"\"setRenderDevice\":%d,\"visualLoadReturned\":%s,"
		"\"visualLoadException\":%s,\"patchInitHeightData\":%d,"
		"\"beginRender\":%d,\"render\":%d,\"endRender\":%d,"
		"\"mapCreated\":%s,\"waterTransparencyReady\":%s,"
		"\"shaderManagerInitialized\":%s,\"visualCreated\":%s,"
		"\"assetManagerCreated\":%s,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"visualInitCompleted\":%s,\"visualInitException\":%s,"
		"\"fullInitAttempted\":%s,"
		"\"fullInitBlockedByMissingWaterAssets\":%s,"
		"\"renderObjectCreated\":%s,\"renderObjectInstalled\":%s,"
		"\"visualLoadInitializedRenderObject\":%s,"
		"\"loadWindowRenderSelected\":%s,\"patchReinitialized\":%s,"
		"\"cameraConfigured\":%s,\"cameraPanRequested\":%s,"
		"\"cameraPanMoved\":%s,\"cameraPanBeginRender\":%d,"
		"\"cameraPanRender\":%d,\"cameraPanEndRender\":%d,"
		"\"visualShroudRequested\":%s,\"shroudUpdateRequested\":%s,"
		"\"partitionRefreshRequested\":%s},"
		"\"renderFrames\":{\"count\":%u,\"firstDrawIndexed\":%u,"
		"\"secondDrawIndexed\":%u,\"firstClear\":%u,\"secondClear\":%u,"
		"\"shroudUpdateDrawIndexed\":%u,\"shroudUpdateClear\":%u,"
		"\"firstTextureUpdate\":%u,\"shroudUpdateTextureUpdate\":%u,"
		"\"partitionRefreshDrawIndexed\":%u,"
		"\"partitionRefreshClear\":%u,"
		"\"partitionRefreshTextureUpdate\":%u},"
		"\"camera\":{\"primary\":{\"eyeX\":%.3f,\"eyeY\":%.3f,\"eyeZ\":%.3f,"
		"\"targetX\":%.3f,\"targetY\":%.3f,\"targetZ\":%.3f,"
		"\"renderSpan\":%.3f,\"lift\":%.3f},"
		"\"pan\":{\"eyeX\":%.3f,\"eyeY\":%.3f,\"eyeZ\":%.3f,"
		"\"targetX\":%.3f,\"targetY\":%.3f,\"targetZ\":%.3f,"
		"\"renderSpan\":%.3f,\"lift\":%.3f}},"
		"\"visual\":{\"class\":\"W3DTerrainVisual\","
		"\"loadPath\":\"W3DTerrainVisual::load -> TerrainVisual::load -> "
		"CachedFileInputStream -> WorldHeightMap -> HeightMapRenderObjClass::initHeightData -> "
		"W3DDisplay::m_3DScene::Add_Render_Object\","
		"\"fullInit\":%s,\"ownedTerrainRenderObject\":%s,"
		"\"waterRenderObjectNull\":%s,\"shroudRenderObject\":%s,"
		"\"loadDrawWidth\":%d,\"loadDrawHeight\":%d,"
		"\"loadDrawOriginX\":%d,\"loadDrawOriginY\":%d},"
		"\"logicalTerrain\":{\"path\":\"W3DTerrainLogic::loadMap(query=true) -> "
		"CachedFileInputStream -> WorldHeightMap(logic-only) -> TerrainLogic::loadMap\","
		"\"attempted\":%s,\"mapCacheInstalled\":%s,"
		"\"terrainLogicInstalled\":%s,\"gameClientInstalled\":%s,"
		"\"thingFactoryInstalled\":%s,\"scriptEngineInstalled\":%s,"
		"\"logicalHeightMapPreflightAttempted\":%s,"
		"\"logicalHeightMapPreflightStreamOpen\":%s,"
		"\"logicalHeightMapPreflightReturned\":%s,"
		"\"logicalHeightMapPreflightException\":%s,"
		"\"logicalHeightMapPreflightError\":%d,"
		"\"logicalHeightMapFailedParser\":%s,"
		"\"logicalHeightMapParsedHeightMap\":%s,"
		"\"logicalHeightMapParsedWorldInfo\":%s,"
		"\"logicalHeightMapParsedObjects\":%s,"
		"\"logicalHeightMapParsedPolygonTriggers\":%s,"
		"\"logicalHeightMapParsedSides\":%s,"
		"\"loadReturned\":%s,\"loadException\":%s,\"loadError\":%d,"
		"\"failurePhase\":%s,"
		"\"sourceFilename\":%s,\"sourceFilenameMatches\":%s,"
		"\"extentMatchesVisual\":%s,\"heightRangeMatchesVisual\":%s,"
		"\"mapObjectsPresentAfterLoad\":%s,\"mapObjectCount\":%d,"
		"\"firstWaypointPresent\":%s,\"waypointCount\":%d,"
		"\"timeOfDayNotified\":%s,\"mapTimeOfDay\":%d,"
		"\"notifiedTimeOfDay\":%d,"
		"\"expectedExtentHiX\":%.3f,\"expectedExtentHiY\":%.3f,"
		"\"extentHiX\":%.3f,\"extentHiY\":%.3f,"
		"\"expectedMinZ\":%.3f,\"expectedMaxZ\":%.3f,"
		"\"extentLoZ\":%.3f,\"extentHiZ\":%.3f},"
		"\"water\":{\"iniEntry\":\"Data\\\\INI\\\\Water.ini\","
		"\"iniEntryExists\":%s,\"iniBytes\":%u,"
		"\"iniLoaded\":%s,\"iniException\":%s,\"iniError\":%s,"
		"\"waterSettingCount\":%d,"
		"\"assetsReady\":%s,\"requiredTextureCount\":%d,"
		"\"availableTextureCount\":%d,\"missingTextureCount\":%d,"
		"\"firstMissingTexture\":%s,"
		"\"renderObjectCreated\":%s,\"globalPointerMatches\":%s,"
		"\"sceneObjectAdded\":%s,\"polygonTriggerCount\":%d,"
		"\"waterPolygonCount\":%d,\"riverPolygonCount\":%d,"
		"\"firstWaterPoints\":%d,\"firstWaterZ\":%d},"
		"\"ini\":{\"attempted\":%s,\"argumentSupplied\":%s,"
		"\"path\":\"%s\",\"directory\":\"%s\",\"mask\":\"%s\","
		"\"defaultEntry\":\"Data\\\\INI\\\\Default\\\\Terrain.ini\","
		"\"defaultEntryExists\":%s,\"defaultEntryParsed\":%s,"
		"\"entry\":\"Data\\\\INI\\\\Terrain.ini\",\"loaded\":%s,"
		"\"entryExists\":%s,\"parsed\":%s,"
		"\"parser\":\"GameEngine/Common/INI.cpp::load + INITerrain.cpp\","
		"\"originalIniParser\":true,\"terrainTypeCount\":%lu,"
		"\"nameKeysReady\":%s,\"sidesListReady\":%s},"
		"\"iniLayout\":%s,"
		"\"archives\":{\"maps\":{\"argumentSupplied\":%s,\"path\":\"%s\","
		"\"directory\":\"%s\",\"mask\":\"%s\",\"loaded\":%s},"
		"\"terrain\":{\"argumentSupplied\":%s,\"path\":\"%s\","
		"\"directory\":\"%s\",\"mask\":\"%s\",\"loaded\":%s}},"
		"\"map\":{\"entry\":%s,"
		"\"entryExists\":%s,\"entryOpenable\":%s,\"streamOpen\":%s,"
		"\"parsed\":%s,\"parseException\":%s,\"bytes\":%d,"
		"\"width\":%d,\"height\":%d,\"border\":%d,\"drawWidth\":%d,"
		"\"drawHeight\":%d,\"firstHeight\":%u,\"heightChecksum\":%lu},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"expectedFlatTextureSize\":%u,\"tileSource\":\"shipped-map-heightmap\","
		"\"renderObject\":\"%s\","
		"\"renderWindowWidth\":%d,\"renderWindowHeight\":%d,"
		"\"renderOriginX\":%d,\"renderOriginY\":%d,"
		"\"patchOriginX\":%d,\"patchOriginY\":%d,\"patchCenterHeight\":%u,"
		"\"patchHeightChecksum\":%lu,"
		"\"tileDiagnostics\":{\"bitmapTiles\":%d,\"textureClasses\":%d,"
		"\"sourceTilesLoaded\":%d,\"sourceTilesPositioned\":%d,"
		"\"patchCells\":%d,\"patchCellsWithSource\":%d,"
		"\"patchCellsMissingSource\":%d,"
		"\"firstPatchTile\":{\"tileIndex\":%d,\"baseTileIndex\":%d,"
		"\"sourceTileLoaded\":%s,\"textureClass\":%d,"
		"\"textureClassName\":%s,\"texturePositionX\":%d,"
		"\"texturePositionY\":%d},"
		"\"sampleTextureClasses\":%s}},"
		"\"scene\":{\"renderPath\":\"%s\","
		"\"created\":%s,\"objectAddedByVisualLoad\":%s,"
		"\"path\":\"W3DDisplay::m_3DScene\",\"terrainClassId\":%d},"
		"\"shroud\":{\"requested\":%s,\"installed\":%s,"
		"\"initialized\":%s,\"fillInvoked\":%s,\"renderInvoked\":%s,"
		"\"textureReady\":%s,\"terrainRenderInvoked\":%s,"
		"\"terrainRenderSawShroud\":%s,\"terrainRenderSawShroudAfter\":%s,"
		"\"terrainAdditionalPassCount\":%d,"
		"\"terrainAdditionalPassCountAfter\":%d,"
		"\"terrainOriginalInstallZFuncEqualSeen\":%s,"
		"\"terrainOriginalInstallCameraSpaceSeen\":%s,"
		"\"terrainOriginalInstallCount2Seen\":%s,"
		"\"terrainOriginalDrawSeen\":%s,\"terrainFinalDrawSeen\":%s,"
		"\"terrainFallbackInvoked\":%s,"
		"\"terrainDrawCallsBefore\":%u,\"terrainDrawCallsAfter\":%u,"
		"\"terrainDrawCallsAfterBase\":%u,"
		"\"cellsX\":%d,\"cellsY\":%d,"
		"\"textureWidth\":%d,\"textureHeight\":%d,\"sampleLevel\":%d,"
		"\"drawOriginX\":%.4f,\"drawOriginY\":%.4f,"
		"\"owner\":\"W3DTerrainVisual::m_terrainRenderObject\"},"
		"\"shroudUpdate\":{\"requested\":%s,\"setInvoked\":%s,"
		"\"displayInvoked\":%s,\"notifyInvoked\":%s,\"renderInvoked\":%s,"
			"\"sampleChanged\":%s,\"status\":%d,\"expectedLevel\":%d,"
			"\"sampleX\":%d,\"sampleY\":%d,\"sampleBefore\":%d,\"sampleAfter\":%d,"
			"\"cellsChanged\":%d,\"beginRender\":%d,\"render\":%d,"
			"\"endRender\":%d},"
			"\"partitionRefresh\":{\"requested\":%s,"
			"\"terrainLogicInstalled\":%s,"
			"\"partitionCreated\":%s,\"partitionInstalled\":%s,"
		"\"partitionInitInvoked\":%s,\"partitionCellsReady\":%s,"
		"\"displayInstalled\":%s,\"radarInstalled\":%s,"
		"\"playerListInstalled\":%s,\"revealInvoked\":%s,"
		"\"refreshInvoked\":%s,\"samplePrepared\":%s,"
		"\"sampleChanged\":%s,\"displaySampleTouched\":%s,"
		"\"radarSampleTouched\":%s,\"renderInvoked\":%s,"
		"\"cellCountX\":%d,\"cellCountY\":%d,\"totalCells\":%d,"
		"\"logicalTerrainExtentSourceApplied\":%s,"
		"\"expectedCellCountX\":%d,\"expectedCellCountY\":%d,"
		"\"fullCellCountX\":%d,\"fullCellCountY\":%d,"
		"\"partitionCellSize\":%.3f,\"sourcePartitionCellSize\":%.3f,"
		"\"terrainExtentHiX\":%.3f,\"terrainExtentHiY\":%.3f,"
		"\"fullTerrainExtentHiX\":%.3f,\"fullTerrainExtentHiY\":%.3f,"
		"\"sampleX\":%d,\"sampleY\":%d,\"status\":%d,"
		"\"expectedLevel\":%d,\"sampleBefore\":%d,\"sampleAfter\":%d,"
		"\"revealDisplaySetCalls\":%d,\"revealRadarSetCalls\":%d,"
		"\"displayClearCalls\":%d,\"radarClearCalls\":%d,"
		"\"displaySetCalls\":%d,\"radarSetCalls\":%d,"
		"\"displayShroudedSetCalls\":%d,"
		"\"displayFoggedSetCalls\":%d,"
		"\"displayClearSetCalls\":%d,"
		"\"radarShroudedSetCalls\":%d,"
		"\"radarFoggedSetCalls\":%d,"
		"\"radarClearSetCalls\":%d,"
		"\"beginRender\":%d,\"render\":%d,\"endRender\":%d,"
		"\"drawIndexed\":%u,\"clear\":%u,\"textureUpdate\":%u},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"createVertexBuffer\":%u,"
		"\"createIndexBuffer\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,\"setVertexShader\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"texture\":{\"id\":%u,\"width\":%u,\"height\":%u,\"format\":%lu,"
		"\"bytes\":%u,\"checksum\":%lu},"
		"\"draw\":{\"primitiveType\":%d,\"vertexShaderFvf\":%lu,"
		"\"startVertex\":%u,\"minVertexIndex\":%u,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"vertexBytes\":%u,\"vertexChecksum\":%lu,\"indexBufferId\":%u,"
		"\"indexBytes\":%u,\"indexChecksum\":%lu,\"indexFormat\":%d,"
		"\"transformMask\":%u,\"renderState\":{\"cullMode\":%lu,"
		"\"zEnable\":%lu,\"zWriteEnable\":%lu,\"zFunc\":%lu,"
		"\"textureStage0ColorOp\":%lu,\"textureStage1ColorOp\":%lu}}}",
		source_name,
		bool_json(ok),
		render_mode,
		bool_json(archive_context_ready),
		init_result,
		set_device_result,
		bool_json(visual_load_returned),
		bool_json(visual_load_exception),
		patch_init_height_data_result,
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(map_created),
		bool_json(water_transparency_ready),
		bool_json(shader_manager_initialized),
		bool_json(visual_created),
		bool_json(asset_manager_created),
		bool_json(runtime_asset_system_installed),
		bool_json(texture_file_factory_installed),
		bool_json(visual_init_completed),
		bool_json(visual_init_exception),
		bool_json(full_init_attempted),
		bool_json(full_init_blocked_by_missing_water_assets),
		bool_json(render_object_created),
		bool_json(render_object_installed),
		bool_json(visual_load_initialized_render_object),
		bool_json(load_window_render_selected),
		bool_json(patch_reinitialized),
		bool_json(camera_configured),
		bool_json(camera_pan_requested),
		bool_json(camera_pan_moved),
		camera_pan_begin_render_result,
		camera_pan_render_result,
		camera_pan_end_render_result,
		bool_json(shroud_scene_mode),
		bool_json(shroud_update_requested),
		bool_json(partition_refresh_mode),
		render_frame_count,
		draw_indexed_after_first_render,
		draw_indexed_after_camera_pan,
		clear_after_first_render,
		clear_after_camera_pan,
		draw_indexed_after_shroud_update,
		clear_after_shroud_update,
		texture_update_after_first_render,
		texture_update_after_shroud_update,
		partition_shroud_refresh.drawIndexed,
		partition_shroud_refresh.clear,
		partition_shroud_refresh.textureUpdate,
		static_cast<double>(primary_camera_view.eyeX),
		static_cast<double>(primary_camera_view.eyeY),
		static_cast<double>(primary_camera_view.eyeZ),
		static_cast<double>(primary_camera_view.targetX),
		static_cast<double>(primary_camera_view.targetY),
		static_cast<double>(primary_camera_view.targetZ),
		static_cast<double>(primary_camera_view.renderSpan),
		static_cast<double>(primary_camera_view.lift),
		static_cast<double>(camera_pan_view.eyeX),
		static_cast<double>(camera_pan_view.eyeY),
		static_cast<double>(camera_pan_view.eyeZ),
		static_cast<double>(camera_pan_view.targetX),
		static_cast<double>(camera_pan_view.targetY),
		static_cast<double>(camera_pan_view.targetZ),
		static_cast<double>(camera_pan_view.renderSpan),
		static_cast<double>(camera_pan_view.lift),
		bool_json(use_full_init),
		bool_json(visual_load_initialized_render_object),
		bool_json(visual != nullptr && !visual->hasWaterRenderObject()),
		bool_json(shroud_installed),
		visual_load_draw_width,
		visual_load_draw_height,
		visual_load_draw_origin_x,
		visual_load_draw_origin_y,
		bool_json(logical_terrain_load.attempted),
		bool_json(logical_terrain_load.mapCacheInstalled),
		bool_json(logical_terrain_load.terrainLogicInstalled),
		bool_json(logical_terrain_load.gameClientInstalled),
		bool_json(logical_terrain_load.thingFactoryInstalled),
		bool_json(logical_terrain_load.scriptEngineInstalled),
		bool_json(logical_terrain_load.logicalHeightMapPreflightAttempted),
		bool_json(logical_terrain_load.logicalHeightMapPreflightStreamOpen),
		bool_json(logical_terrain_load.logicalHeightMapPreflightReturned),
		bool_json(logical_terrain_load.logicalHeightMapPreflightException),
		logical_terrain_load.logicalHeightMapPreflightError,
		logical_failed_parser_json.c_str(),
		bool_json(logical_terrain_load.logicalHeightMapParsedHeightMap),
		bool_json(logical_terrain_load.logicalHeightMapParsedWorldInfo),
		bool_json(logical_terrain_load.logicalHeightMapParsedObjects),
		bool_json(logical_terrain_load.logicalHeightMapParsedPolygonTriggers),
		bool_json(logical_terrain_load.logicalHeightMapParsedSides),
		bool_json(logical_terrain_load.loadReturned),
		bool_json(logical_terrain_load.loadException),
		logical_terrain_load.loadError,
		logical_failure_phase_json.c_str(),
		logical_source_filename_json.c_str(),
		bool_json(logical_terrain_load.sourceFilenameMatches),
		bool_json(logical_terrain_load.extentMatchesVisual),
		bool_json(logical_terrain_load.heightRangeMatchesVisual),
		bool_json(logical_terrain_load.mapObjectsPresentAfterLoad),
		logical_terrain_load.mapObjectCount,
		bool_json(logical_terrain_load.firstWaypointPresent),
		logical_terrain_load.waypointCount,
		bool_json(logical_terrain_load.timeOfDayNotified),
		static_cast<int>(logical_terrain_load.mapTimeOfDay),
		static_cast<int>(logical_terrain_load.notifiedTimeOfDay),
		static_cast<double>(logical_terrain_load.expectedExtentHiX),
		static_cast<double>(logical_terrain_load.expectedExtentHiY),
		static_cast<double>(logical_terrain_load.extentHiX),
		static_cast<double>(logical_terrain_load.extentHiY),
		static_cast<double>(logical_terrain_load.expectedMinZ),
		static_cast<double>(logical_terrain_load.expectedMaxZ),
		static_cast<double>(logical_terrain_load.extentLoZ),
		static_cast<double>(logical_terrain_load.extentHiZ),
		bool_json(water_ini_entry_exists),
		water_ini_bytes,
		bool_json(water_ini_loaded),
		bool_json(water_ini_exception),
		json_string(water_ini_error).c_str(),
		water_setting_count,
		bool_json(water_assets_ready),
		water_asset_metrics.requiredTextures,
		water_asset_metrics.availableTextures,
		water_asset_metrics.missingTextures,
		first_missing_water_texture_json.c_str(),
		bool_json(water_render_object_created),
		bool_json(water_render_object_global_match),
		bool_json(water_render_object_scene_added),
		polygon_metrics.total,
		polygon_metrics.water,
		polygon_metrics.river,
		polygon_metrics.firstWaterPoints,
		polygon_metrics.firstWaterZ,
		bool_json(map_load.attempted),
		bool_json(map_load.iniArgumentSupplied),
		map_load.iniArchivePath.c_str(),
		map_load.iniArchiveDirectory.c_str(),
		map_load.iniArchiveMask.c_str(),
		bool_json(map_load.defaultTerrainIniExists),
		bool_json(map_load.defaultTerrainIniParsed),
		bool_json(map_load.iniArchiveLoaded),
		bool_json(map_load.terrainIniExists),
		bool_json(map_load.terrainIniParsed),
		static_cast<unsigned long>(map_load.terrainTypeCount),
		bool_json(map_load.nameKeysReady),
		bool_json(map_load.sidesListReady),
		ini_layout_report_json.c_str(),
		bool_json(map_load.mapsArgumentSupplied),
		map_load.mapsArchivePath.c_str(),
		map_load.mapsArchiveDirectory.c_str(),
		map_load.mapsArchiveMask.c_str(),
		bool_json(map_load.mapsArchiveLoaded),
		bool_json(map_load.terrainArgumentSupplied),
		map_load.terrainArchivePath.c_str(),
		map_load.terrainArchiveDirectory.c_str(),
		map_load.terrainArchiveMask.c_str(),
		bool_json(map_load.terrainArchiveLoaded),
		terrain_map_entry_json.c_str(),
		bool_json(map_load.mapEntryExists),
		bool_json(map_load.mapEntryOpenable),
		bool_json(map_load.mapStreamOpen),
		bool_json(map_load.mapParsed),
		bool_json(map_load.mapParseException),
		map_load.mapBytes,
		map_load.width,
		map_load.height,
		map_load.border,
		map_load.drawWidth,
		map_load.drawHeight,
		map_load.firstHeight,
		static_cast<unsigned long>(map_load.heightChecksum),
		render_window_width,
		render_window_cells,
		render_expected_flat_texture_size,
		render_object_name,
		map != nullptr ? map->getDrawWidth() : 0,
		map != nullptr ? map->getDrawHeight() : 0,
		map != nullptr ? map->getDrawOrgX() : 0,
		map != nullptr ? map->getDrawOrgY() : 0,
		map_load.patchOriginX,
		map_load.patchOriginY,
		map_load.patchCenterHeight,
		static_cast<unsigned long>(map_load.patchHeightChecksum),
		map_load.bitmapTileCount,
		map_load.textureClassCount,
		map_load.sourceTilesLoaded,
		map_load.sourceTilesPositioned,
		map_load.patchTileCells,
		map_load.patchTilesWithSource,
		map_load.patchTilesMissingSource,
		map_load.firstPatchTileIndex,
		map_load.firstPatchBaseTileIndex,
		bool_json(map_load.firstPatchSourceTileLoaded),
		map_load.firstPatchTextureClass,
		first_patch_texture_class_json.c_str(),
		map_load.firstPatchTileTextureX,
		map_load.firstPatchTileTextureY,
		map_load.textureClassesJson.c_str(),
		scene_render_path,
		bool_json(scene_created),
		bool_json(visual_scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
		bool_json(shroud_scene_mode),
		bool_json(shroud_installed),
		bool_json(shroud_initialized),
		bool_json(shroud_fill_invoked),
		bool_json(shroud_render_invoked),
		bool_json(shroud_texture_ready),
		bool_json(shroud_terrain_render_invoked),
		bool_json(shroud_terrain_render_saw_shroud),
		bool_json(shroud_terrain_render_saw_shroud_after),
		shroud_terrain_additional_pass_count,
		shroud_terrain_additional_pass_count_after,
		bool_json(shroud_terrain_original_install_zfunc_equal_seen),
		bool_json(shroud_terrain_original_install_camera_space_seen),
		bool_json(shroud_terrain_original_install_count2_seen),
		bool_json(shroud_terrain_original_draw_seen),
		bool_json(shroud_terrain_final_draw_seen),
		bool_json(shroud_terrain_fallback_invoked),
		shroud_terrain_draw_calls_before,
		shroud_terrain_draw_calls_after,
		shroud_terrain_draw_calls_after_base,
		shroud_cells_x,
		shroud_cells_y,
		shroud_texture_width,
		shroud_texture_height,
		shroud_sample_level,
		shroud_draw_origin_x,
		shroud_draw_origin_y,
		bool_json(shroud_update_requested),
		bool_json(shroud_update_set_invoked),
		bool_json(shroud_update_display_invoked),
		bool_json(shroud_update_notify_invoked),
		bool_json(shroud_update_render_invoked),
		bool_json(shroud_update_sample_changed),
		shroud_update_status,
		shroud_update_expected_level,
		shroud_update_sample_x,
		shroud_update_sample_y,
		shroud_update_sample_before,
		shroud_update_sample_after,
			shroud_update_cells_changed,
			shroud_update_begin_render_result,
			shroud_update_render_result,
			shroud_update_end_render_result,
			bool_json(partition_shroud_refresh.requested),
			bool_json(partition_shroud_refresh.terrainLogicInstalled),
			bool_json(partition_shroud_refresh.partitionCreated),
		bool_json(partition_shroud_refresh.partitionInstalled),
		bool_json(partition_shroud_refresh.partitionInitInvoked),
		bool_json(partition_shroud_refresh.partitionCellsReady),
		bool_json(partition_shroud_refresh.displayInstalled),
		bool_json(partition_shroud_refresh.radarInstalled),
		bool_json(partition_shroud_refresh.playerListInstalled),
		bool_json(partition_shroud_refresh.revealInvoked),
		bool_json(partition_shroud_refresh.refreshInvoked),
		bool_json(partition_shroud_refresh.samplePrepared),
		bool_json(partition_shroud_refresh.sampleChanged),
		bool_json(partition_shroud_refresh.displaySampleTouched),
		bool_json(partition_shroud_refresh.radarSampleTouched),
		bool_json(partition_shroud_refresh.renderInvoked),
		partition_shroud_refresh.cellCountX,
		partition_shroud_refresh.cellCountY,
		partition_shroud_refresh.totalCells,
		bool_json(partition_shroud_refresh.logicalTerrainExtentSourceApplied),
		partition_shroud_refresh.expectedCellCountX,
		partition_shroud_refresh.expectedCellCountY,
		partition_shroud_refresh.fullCellCountX,
		partition_shroud_refresh.fullCellCountY,
		static_cast<double>(partition_shroud_refresh.partitionCellSize),
		static_cast<double>(partition_shroud_refresh.sourcePartitionCellSize),
		static_cast<double>(partition_shroud_refresh.terrainExtentHiX),
		static_cast<double>(partition_shroud_refresh.terrainExtentHiY),
		static_cast<double>(partition_shroud_refresh.fullTerrainExtentHiX),
		static_cast<double>(partition_shroud_refresh.fullTerrainExtentHiY),
		partition_shroud_refresh.sampleX,
		partition_shroud_refresh.sampleY,
		partition_shroud_refresh.status,
		partition_shroud_refresh.expectedLevel,
		partition_shroud_refresh.sampleBefore,
		partition_shroud_refresh.sampleAfter,
		partition_shroud_refresh.revealDisplaySetCalls,
		partition_shroud_refresh.revealRadarSetCalls,
		partition_shroud_refresh.displayClearCalls,
		partition_shroud_refresh.radarClearCalls,
		partition_shroud_refresh.displaySetCalls,
		partition_shroud_refresh.radarSetCalls,
		partition_shroud_refresh.displayShroudedSetCalls,
		partition_shroud_refresh.displayFoggedSetCalls,
		partition_shroud_refresh.displayClearSetCalls,
		partition_shroud_refresh.radarShroudedSetCalls,
		partition_shroud_refresh.radarFoggedSetCalls,
		partition_shroud_refresh.radarClearSetCalls,
		partition_shroud_refresh.beginRender,
		partition_shroud_refresh.render,
		partition_shroud_refresh.endRender,
		partition_shroud_refresh.drawIndexed,
		partition_shroud_refresh.clear,
		partition_shroud_refresh.textureUpdate,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->texture_lock_rect_calls : 0,
		state != nullptr ? state->texture_unlock_rect_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->set_vertex_shader_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		state != nullptr ? state->last_browser_texture_id : 0,
		state != nullptr ? state->last_browser_texture_width : 0,
		state != nullptr ? state->last_browser_texture_height : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_format : 0),
		state != nullptr ? state->last_browser_texture_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_browser_texture_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_primitive_type : D3DPT_FORCE_DWORD),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_shader : 0),
		state != nullptr ? state->last_draw_start_vertex : 0,
		state != nullptr ? state->last_draw_min_vertex_index : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_vertex_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_vertex_buffer_checksum : 0),
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_bytes : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_index_buffer_checksum : 0),
		static_cast<int>(state != nullptr ? state->last_draw_index_format : D3DFMT_UNKNOWN),
		state != nullptr ? state->last_draw_transform_mask : 0,
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.cull_mode : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_write_enable : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.z_func : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.texture_stages[0].values[D3DTSS_COLOROP] : 0),
		static_cast<unsigned long>(state != nullptr ? state->last_draw_render_state.texture_stages[1].values[D3DTSS_COLOROP] : 0));

	target_json = buffer;

	if (W3DDisplay::m_3DScene != nullptr && render_object != nullptr && visual_scene_object_added) {
		W3DDisplay::m_3DScene->Remove_Render_Object(render_object);
	}
	REF_PTR_RELEASE(camera);
	if (visual != nullptr) {
		delete visual;
		visual = nullptr;
	}
	if (asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}
	RTS3DScene *owned_3d_scene = W3DDisplay::m_3DScene;
	W3DDisplay::m_3DScene = old_3d_scene;
	REF_PTR_RELEASE(owned_3d_scene);
	TheTerrainRenderObject = old_terrain_render_object;
	TheTerrainVisual = old_terrain_visual;
	WaterTransparencySetting *current_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	TheWaterTransparency = old_water_transparency;
	if (!use_full_init &&
			probe_water_transparency != nullptr &&
			probe_water_transparency != old_water_transparency) {
		probe_water_transparency->deleteInstance();
	}
	if (use_full_init &&
			current_water_transparency != nullptr &&
			current_water_transparency != old_water_transparency) {
		current_water_transparency->deleteInstance();
	}

	if (succeeded(init_result)) {
		if (shader_manager_initialized)
			W3DShaderManager::shutdown();
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		WaterSettings[index] = old_water_settings[index];
	}
	delete global_data;
	g_ww3d_terrain_probe_shroud_enabled = old_shroud_enabled;

	return target_json.c_str();
}

const char *run_ww3d_terrain_bib_buffer_lifecycle_probe(std::string &target_json)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = NEW GlobalData;
	bool global_data_ready = global_data != nullptr;
	if (global_data_ready) {
		configure_global_data(*global_data);
		TheWritableGlobalData = global_data;
	}

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	bool buffer_created = false;
	bool initialized = false;
	bool vertex_buffer_allocated = false;
	bool index_buffer_allocated = false;
	bool normal_texture_created = false;
	bool highlight_texture_created = false;
	bool add_bib_invoked = false;
	bool remove_highlighting_invoked = false;
	bool remove_bib_invoked = false;
	bool clear_bibs_invoked = false;
	bool free_buffers_invoked = false;
	bool vertex_buffer_released = false;
	bool index_buffer_released = false;
	Int bibs_after_add = -1;
	Int bibs_after_remove = -1;
	Int bibs_after_clear = -1;
	Bool changed_after_add = FALSE;

	if (global_data_ready) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}
	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	ProbeW3DBibBuffer *bib_buffer = nullptr;
	if (succeeded(set_device_result)) {
		bib_buffer = NEW ProbeW3DBibBuffer;
		buffer_created = bib_buffer != nullptr;
	}

	if (buffer_created) {
		initialized = bib_buffer->initialized();
		vertex_buffer_allocated = bib_buffer->hasVertexBuffer();
		index_buffer_allocated = bib_buffer->hasIndexBuffer();
		normal_texture_created = bib_buffer->hasNormalTexture();
		highlight_texture_created = bib_buffer->hasHighlightTexture();

		Vector3 corners[4];
		corners[0].Set(0.0f, 0.0f, 4.0f);
		corners[1].Set(96.0f, 0.0f, 4.0f);
		corners[2].Set(96.0f, 96.0f, 4.0f);
		corners[3].Set(0.0f, 96.0f, 4.0f);
		const DrawableID probe_drawable_id = static_cast<DrawableID>(0x102);
		bib_buffer->addBibDrawable(corners, probe_drawable_id, TRUE);
		add_bib_invoked = true;
		bibs_after_add = bib_buffer->numBibs();
		changed_after_add = bib_buffer->anythingChanged();

		bib_buffer->removeHighlighting();
		remove_highlighting_invoked = true;
		bib_buffer->removeBibDrawable(probe_drawable_id);
		remove_bib_invoked = true;
		bibs_after_remove = bib_buffer->numBibs();

		bib_buffer->clearAllBibs();
		clear_bibs_invoked = true;
		bibs_after_clear = bib_buffer->numBibs();

		bib_buffer->freeBuffersForProbe();
		free_buffers_invoked = true;
		vertex_buffer_released = !bib_buffer->hasVertexBuffer();
		index_buffer_released = !bib_buffer->hasIndexBuffer();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		global_data_ready &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		buffer_created &&
		initialized &&
		vertex_buffer_allocated &&
		index_buffer_allocated &&
		normal_texture_created &&
		highlight_texture_created &&
		add_bib_invoked &&
		bibs_after_add == 1 &&
		changed_after_add &&
		remove_highlighting_invoked &&
		remove_bib_invoked &&
		bibs_after_remove == 1 &&
		clear_bibs_invoked &&
		bibs_after_clear == 0 &&
		free_buffers_invoked &&
		vertex_buffer_released &&
		index_buffer_released &&
		state != nullptr &&
		state->create_vertex_buffer_calls >= 1 &&
		state->create_index_buffer_calls >= 1;

	char buffer[5000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_bib_buffer_lifecycle_probe\","
		"\"ok\":%s,"
		"\"path\":\"original W3DBibBuffer constructor -> addBibDrawable -> "
		"removeHighlighting -> removeBibDrawable -> clearAllBibs -> freeBibBuffers\","
		"\"results\":{\"globalDataReady\":%s,\"init\":%d,"
		"\"setRenderDevice\":%d,\"bufferCreated\":%s,"
		"\"initialized\":%s,\"vertexBufferAllocated\":%s,"
		"\"indexBufferAllocated\":%s,\"normalTextureCreated\":%s,"
		"\"highlightTextureCreated\":%s,\"addBibInvoked\":%s,"
		"\"removeHighlightingInvoked\":%s,\"removeBibInvoked\":%s,"
		"\"clearBibsInvoked\":%s,\"freeBuffersInvoked\":%s,"
		"\"vertexBufferReleased\":%s,\"indexBufferReleased\":%s},"
		"\"bibs\":{\"afterAdd\":%d,\"afterRemove\":%d,"
		"\"afterClear\":%d,\"changedAfterAdd\":%s},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"drawIndexed\":%u}}",
		bool_json(ok),
		bool_json(global_data_ready),
		init_result,
		set_device_result,
		bool_json(buffer_created),
		bool_json(initialized),
		bool_json(vertex_buffer_allocated),
		bool_json(index_buffer_allocated),
		bool_json(normal_texture_created),
		bool_json(highlight_texture_created),
		bool_json(add_bib_invoked),
		bool_json(remove_highlighting_invoked),
		bool_json(remove_bib_invoked),
		bool_json(clear_bibs_invoked),
		bool_json(free_buffers_invoked),
		bool_json(vertex_buffer_released),
		bool_json(index_buffer_released),
		bibs_after_add,
		bibs_after_remove,
		bibs_after_clear,
		bool_json(changed_after_add),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0);

	target_json = buffer;

	delete bib_buffer;
	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	delete global_data;

	return target_json.c_str();
}

const char *run_ww3d_terrain_prop_buffer_scene_probe(
	std::string &target_json,
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *archive_path,
	const char *texture_archive_path)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = nullptr;

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	int init_height_data_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool map_created = false;
	bool global_data_ready = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool texture_file_factory_installed = false;
	bool mesh_file_exists = false;
	bool texture_file_exists = false;
	bool water_transparency_ready = false;
	bool shader_manager_initialized = false;
	bool render_object_created = false;
	bool render_object_initialized = false;
	bool prop_buffer_installed = false;
	bool prop_buffer_initialized = false;
	bool add_prop_invoked = false;
	bool update_prop_invoked = false;
	bool update_center_invoked = false;
	bool prop_type_created = false;
	bool prop_render_object_created = false;
	bool prop_mesh_normalized = false;
	bool scene_created = false;
	bool scene_object_added = false;
	bool prop_visible_after_scene = false;
	bool remove_prop_invoked = false;
	bool clear_props_invoked = false;
	bool prop_removed = false;
	Int prop_types_after_add = -1;
	Int props_after_add = -1;
	Int props_after_update = -1;
	Int props_after_remove = -1;
	Int props_after_clear = -1;
	int prop_render_object_class_id = RenderObjClass::CLASSID_UNKNOWN;
	float prop_location_z = 0.0f;
	float prop_bounds_center_x = 0.0f;
	float prop_bounds_center_y = 0.0f;
	float prop_bounds_center_z = 0.0f;
	float prop_bounds_radius = 0.0f;

	ProbeTerrainMapPatchLoad map_load;
	WorldHeightMap *map = load_archive_terrain_map_patch(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load);
	map_created = map_load.mapParsed && map != nullptr;

	if (map_created) {
		global_data = NEW GlobalData;
		if (global_data != nullptr) {
			configure_global_data(*global_data);
			TheWritableGlobalData = global_data;
			global_data_ready = true;
		}
	}

	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	ProbeHeightMapRenderObjWithPropBuffer *render_object = nullptr;
	ProbeW3DPropBuffer *prop_buffer = nullptr;
	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;
	WW3DAssetManager *asset_manager = nullptr;

	if (global_data_ready) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}
	if (succeeded(init_result)) {
		asset_manager = W3DNEW W3DAssetManager();
		asset_manager_created = asset_manager != nullptr;
	}
	if (asset_manager != nullptr) {
		asset_manager->Set_WW3D_Load_On_Demand(true);
	}
	if (asset_manager_created) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		W3DShaderManager::init();
		shader_manager_initialized = true;

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_paths(archive_path, texture_archive_path);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		mesh_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kPropMeshArchiveEntry);
		texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kPropTextureArchiveEntry);
	}

	if (succeeded(set_device_result) && map_created && mesh_file_exists && texture_file_exists) {
		if (old_water_transparency != nullptr) {
			water_transparency_ready = true;
		} else {
			probe_water_transparency = newInstance(WaterTransparencySetting);
			TheWaterTransparency = probe_water_transparency;
			water_transparency_ready = probe_water_transparency != nullptr;
		}

		map->setDrawWidth(kMapPatchVertices);
		map->setDrawHeight(kMapPatchVertices);
		map->setDrawOrg(map_load.patchOriginX, map_load.patchOriginY);

		render_object = NEW_REF(ProbeHeightMapRenderObjWithPropBuffer, ());
		render_object_created = render_object != nullptr;
		if (render_object_created) {
			Matrix3D terrain_transform(true);
			const float patch_center_x =
				(static_cast<float>(map_load.patchOriginX) +
				 static_cast<float>(kMapPatchCells) * 0.5f -
				 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
			const float patch_center_y =
				(static_cast<float>(map_load.patchOriginY) +
				 static_cast<float>(kMapPatchCells) * 0.5f -
				 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
			terrain_transform.Set_Translation(Vector3(
				-patch_center_x,
				-patch_center_y,
				-180.0f));
			render_object->Set_Transform(terrain_transform);
			TheTerrainRenderObject = render_object;
			init_height_data_result = render_object->initHeightData(
				map->getDrawWidth(),
				map->getDrawHeight(),
				map,
				nullptr,
				TRUE);
			render_object_initialized = init_height_data_result == 0;
		}
	}

	if (water_transparency_ready && render_object_initialized) {
		prop_buffer = render_object->installProbePropBuffer();
		prop_buffer_installed = prop_buffer != nullptr;
		prop_buffer_initialized = prop_buffer_installed && prop_buffer->initialized();
	}

	if (prop_buffer_initialized) {
		const float terrain_center_z =
			static_cast<float>(map_load.patchCenterHeight) * MAP_HEIGHT_SCALE - 180.0f;
		prop_location_z = terrain_center_z + 8.0f;
		Coord3D location;
		location.set(0.0f, 0.0f, prop_location_z);
		render_object->addProp(kPropProbeId, location, 0.0f, 1.0f, AsciiString(kPropModelName));
		add_prop_invoked = true;
		props_after_add = prop_buffer->numProps();
		prop_types_after_add = prop_buffer->numPropTypes();
		prop_type_created = prop_buffer->hasPropTypeRenderObject(0);
		prop_render_object_created = prop_buffer->hasPropRenderObject(0);
		prop_mesh_normalized =
			normalize_probe_prop_mesh(prop_buffer->propRenderObject(0), prop_render_object_class_id);

		update_prop_invoked =
			prop_buffer->updatePropPosition(kPropProbeId, location, 0.0f, 1.0f);
		props_after_update = prop_buffer->numProps();

		const SphereClass bounds = prop_buffer->propBounds(0);
		prop_bounds_center_x = bounds.Center.X;
		prop_bounds_center_y = bounds.Center.Y;
		prop_bounds_center_z = bounds.Center.Z;
		prop_bounds_radius = bounds.Radius > 0.001f ? bounds.Radius : 1.0f;

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, std::max(1000.0f, prop_bounds_radius * 8.0f));
			Matrix3D camera_transform(true);
			const Vector3 target(prop_bounds_center_x, prop_bounds_center_y, prop_bounds_center_z);
			const Vector3 eye(
				prop_bounds_center_x,
				prop_bounds_center_y - prop_bounds_radius * 0.25f,
				prop_bounds_center_z + prop_bounds_radius * 3.0f);
			camera_transform.Look_At(eye, target, 0.0f);
			camera->Set_Transform(camera_transform);
		}
	}

	if (camera != nullptr && prop_render_object_created) {
		render_object->updateCenter(camera, nullptr);
		update_center_invoked = true;
	}

	if (camera != nullptr && update_center_invoked) {
		scene = NEW_REF(RTS3DScene, ());
		scene_created = scene != nullptr;
		if (scene_created) {
			scene->Add_Render_Object(render_object);
			scene_object_added = render_object->Peek_Scene() == scene;
		}
	}

	if (scene_object_added) {
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(scene, camera);
			end_render_result = WW3D::End_Render(false);
		}
		prop_visible_after_scene = prop_buffer != nullptr && prop_buffer->propVisible(0);
	}

	if (prop_buffer_installed) {
		render_object->removeProp(kPropProbeId);
		remove_prop_invoked = true;
		props_after_remove = prop_buffer->numProps();
		prop_removed = !prop_buffer->hasPropRenderObject(0);
		render_object->removeAllProps();
		clear_props_invoked = true;
		props_after_clear = prop_buffer->numProps();
	}

	ProbeWorldHeightMapInspector::recordRenderedTileMetrics(map, map_load);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const IniLayoutComparison ini_layout = compare_ini_layout();
	const bool prop_scene_draw_flushed =
		state != nullptr &&
		state->draw_indexed_primitive_calls >= 3 &&
		state->last_draw_stream_source_stride == sizeof(VertexFormatXYZNDUV2) &&
		state->last_draw_vertex_shader == DX8_FVF_XYZNDUV2 &&
		state->last_draw_vertex_count > 0 &&
		state->last_draw_primitive_count > 0 &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] != D3DTOP_DISABLE;
	const bool ok =
		state != nullptr &&
		ini_layout.matches &&
		global_data_ready &&
		succeeded(init_result) &&
		asset_manager_created &&
		succeeded(set_device_result) &&
		runtime_asset_system_installed &&
		texture_file_factory_installed &&
		mesh_file_exists &&
		texture_file_exists &&
		map_load.iniArchiveLoaded &&
		map_load.mapsArchiveLoaded &&
		map_load.terrainArchiveLoaded &&
		map_load.terrainIniParsed &&
		map_load.terrainTypeCount > 0 &&
		map_load.mapEntryExists &&
		map_load.mapEntryOpenable &&
		map_load.mapStreamOpen &&
		map_created &&
		map_load.mapBytes > 0 &&
		map_load.width > kMapPatchCells &&
		map_load.height > kMapPatchCells &&
		map_load.heightChecksum > 0 &&
		map_load.patchHeightChecksum > 0 &&
		water_transparency_ready &&
		render_object_created &&
		render_object_initialized &&
		prop_buffer_installed &&
		prop_buffer_initialized &&
		add_prop_invoked &&
		props_after_add == 1 &&
		prop_types_after_add == 1 &&
		prop_type_created &&
		prop_render_object_created &&
		prop_render_object_class_id == RenderObjClass::CLASSID_MESH &&
		prop_mesh_normalized &&
		update_prop_invoked &&
		props_after_update == 1 &&
		update_center_invoked &&
		scene_created &&
		scene_object_added &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		prop_visible_after_scene &&
		prop_scene_draw_flushed &&
		remove_prop_invoked &&
		props_after_remove == 1 &&
		prop_removed &&
		clear_props_invoked &&
		props_after_clear == 0 &&
		state->browser_texture_create_calls >= 2 &&
		state->browser_texture_update_calls >= 2 &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_buffer_create_calls >= 4 &&
		state->browser_buffer_update_calls >= 4 &&
		state->set_stream_source_calls >= 2 &&
		state->set_indices_calls >= 2 &&
		state->set_texture_calls >= 1;

	const std::string archive_json = json_string(archive_path != nullptr ? archive_path : "");
	const std::string texture_archive_json =
		json_string(texture_archive_path != nullptr ? texture_archive_path : "");
	const std::string prop_model_json = json_string(kPropModelName);
	const std::string prop_mesh_entry_json = json_string(kPropMeshArchiveEntry);
	const std::string prop_texture_entry_json = json_string(kPropTextureArchiveEntry);
	const std::string terrain_map_entry_json = json_string(kArchiveTerrainMapEntry);
	const std::string first_patch_texture_class_json =
		json_string(map_load.firstPatchTextureClassName);
	const std::string ini_layout_report_json = ini_layout_json(ini_layout);

	char buffer[18000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_prop_buffer_scene_probe\","
		"\"ok\":%s,"
		"\"path\":\"original WorldHeightMap + HeightMapRenderObjClass::Render -> "
		"W3DPropBuffer::drawProps -> RTS3DScene::Flush -> TheDX8MeshRenderer.Flush\","
		"\"archives\":{\"ini\":\"%s\",\"maps\":\"%s\",\"terrain\":\"%s\","
		"\"mesh\":%s,\"texture\":%s},"
		"\"asset\":{\"model\":%s,\"meshEntry\":%s,"
		"\"textureEntry\":%s},"
		"\"results\":{\"globalDataReady\":%s,\"init\":%d,"
		"\"assetManagerCreated\":%s,\"setRenderDevice\":%d,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"meshFileExists\":%s,\"textureFileExists\":%s,"
		"\"waterTransparencyReady\":%s,\"shaderManagerInitialized\":%s,"
		"\"renderObjectCreated\":%s,\"renderObjectInitialized\":%s,"
		"\"initHeightData\":%d,\"propBufferInstalled\":%s,"
		"\"propBufferInitialized\":%s,\"addPropInvoked\":%s,"
		"\"updatePropInvoked\":%s,\"updateCenterInvoked\":%s,"
		"\"propTypeCreated\":%s,\"propRenderObjectCreated\":%s,"
		"\"propRenderObjectClassId\":%d,\"propMeshNormalized\":%s,"
		"\"sceneCreated\":%s,\"sceneObjectAdded\":%s,"
		"\"beginRender\":%d,\"render\":%d,\"endRender\":%d,"
		"\"propVisibleAfterScene\":%s,\"propSceneDrawFlushed\":%s,"
		"\"removePropInvoked\":%s,\"propRemoved\":%s,"
		"\"clearPropsInvoked\":%s},"
		"\"ini\":{\"entry\":\"Data\\\\INI\\\\Terrain.ini\","
		"\"loaded\":%s,\"entryExists\":%s,\"parsed\":%s,"
		"\"parser\":\"GameEngine/Common/INI.cpp::load + INITerrain.cpp\","
		"\"originalIniParser\":true,\"terrainTypeCount\":%lu},"
		"\"iniLayout\":%s,"
		"\"map\":{\"entry\":%s,\"entryExists\":%s,\"entryOpenable\":%s,"
		"\"streamOpen\":%s,\"parsed\":%s,\"bytes\":%d,"
		"\"width\":%d,\"height\":%d,\"border\":%d,"
		"\"heightChecksum\":%lu},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"tileSource\":\"shipped-map-heightmap\","
		"\"renderObject\":\"ProbeHeightMapRenderObjWithPropBuffer\","
		"\"renderWindowWidth\":%d,\"renderWindowHeight\":%d,"
		"\"renderOriginX\":%d,\"renderOriginY\":%d,"
		"\"patchOriginX\":%d,\"patchOriginY\":%d,"
		"\"patchCenterHeight\":%u,\"patchHeightChecksum\":%lu,"
		"\"tileDiagnostics\":{\"bitmapTiles\":%d,\"textureClasses\":%d,"
		"\"sourceTilesLoaded\":%d,\"sourceTilesPositioned\":%d,"
		"\"patchCells\":%d,\"patchCellsWithSource\":%d,"
		"\"patchCellsMissingSource\":%d,"
		"\"firstPatchTile\":{\"tileIndex\":%d,\"baseTileIndex\":%d,"
		"\"sourceTileLoaded\":%s,\"textureClass\":%d,"
		"\"textureClassName\":%s,\"texturePositionX\":%d,"
		"\"texturePositionY\":%d}}},"
		"\"scene\":{\"renderPath\":\"WW3D::Render(RTS3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> HeightMapRenderObjClass::Render -> "
		"W3DPropBuffer::drawProps -> RTS3DScene::Flush\","
		"\"created\":%s,\"objectAdded\":%s,\"terrainClassId\":%d},"
		"\"props\":{\"afterAdd\":%d,\"typesAfterAdd\":%d,"
		"\"afterUpdate\":%d,\"afterRemove\":%d,\"afterClear\":%d,"
		"\"locationZ\":%.4f,\"bounds\":{\"center\":[%.4f,%.4f,%.4f],"
		"\"radius\":%.4f}},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"setVertexShader\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%u,\"vertexShaderFvf\":%lu,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,"
		"\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"texture0ColorOp\":%lu,"
		"\"texture0ColorArg1\":%lu,\"texture0ColorArg2\":%lu}}",
		bool_json(ok),
		ini_archive_path != nullptr ? ini_archive_path : "",
		maps_archive_path != nullptr ? maps_archive_path : "",
		terrain_archive_path != nullptr ? terrain_archive_path : "",
		archive_json.c_str(),
		texture_archive_json.c_str(),
		prop_model_json.c_str(),
		prop_mesh_entry_json.c_str(),
		prop_texture_entry_json.c_str(),
		bool_json(global_data_ready),
		init_result,
		bool_json(asset_manager_created),
		set_device_result,
		bool_json(runtime_asset_system_installed),
		bool_json(texture_file_factory_installed),
		bool_json(mesh_file_exists),
		bool_json(texture_file_exists),
		bool_json(water_transparency_ready),
		bool_json(shader_manager_initialized),
		bool_json(render_object_created),
		bool_json(render_object_initialized),
		init_height_data_result,
		bool_json(prop_buffer_installed),
		bool_json(prop_buffer_initialized),
		bool_json(add_prop_invoked),
		bool_json(update_prop_invoked),
		bool_json(update_center_invoked),
		bool_json(prop_type_created),
		bool_json(prop_render_object_created),
		prop_render_object_class_id,
		bool_json(prop_mesh_normalized),
		bool_json(scene_created),
		bool_json(scene_object_added),
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(prop_visible_after_scene),
		bool_json(prop_scene_draw_flushed),
		bool_json(remove_prop_invoked),
		bool_json(prop_removed),
		bool_json(clear_props_invoked),
		bool_json(map_load.iniArchiveLoaded),
		bool_json(map_load.terrainIniExists),
		bool_json(map_load.terrainIniParsed),
		static_cast<unsigned long>(map_load.terrainTypeCount),
		ini_layout_report_json.c_str(),
		terrain_map_entry_json.c_str(),
		bool_json(map_load.mapEntryExists),
		bool_json(map_load.mapEntryOpenable),
		bool_json(map_load.mapStreamOpen),
		bool_json(map_load.mapParsed),
		map_load.mapBytes,
		map_load.width,
		map_load.height,
		map_load.border,
		static_cast<unsigned long>(map_load.heightChecksum),
		kMapPatchVertices,
		kMapPatchCells,
		map != nullptr ? map->getDrawWidth() : 0,
		map != nullptr ? map->getDrawHeight() : 0,
		map != nullptr ? map->getDrawOrgX() : 0,
		map != nullptr ? map->getDrawOrgY() : 0,
		map_load.patchOriginX,
		map_load.patchOriginY,
		map_load.patchCenterHeight,
		static_cast<unsigned long>(map_load.patchHeightChecksum),
		map_load.bitmapTileCount,
		map_load.textureClassCount,
		map_load.sourceTilesLoaded,
		map_load.sourceTilesPositioned,
		map_load.patchTileCells,
		map_load.patchTilesWithSource,
		map_load.patchTilesMissingSource,
		map_load.firstPatchTileIndex,
		map_load.firstPatchBaseTileIndex,
		bool_json(map_load.firstPatchSourceTileLoaded),
		map_load.firstPatchTextureClass,
		first_patch_texture_class_json.c_str(),
		map_load.firstPatchTileTextureX,
		map_load.firstPatchTileTextureY,
		bool_json(scene_created),
		bool_json(scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
		props_after_add,
		prop_types_after_add,
		props_after_update,
		props_after_remove,
		props_after_clear,
		prop_location_z,
		prop_bounds_center_x,
		prop_bounds_center_y,
		prop_bounds_center_z,
		prop_bounds_radius,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->set_vertex_shader_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		state != nullptr ? state->last_draw_primitive_type : 0,
		state != nullptr ? state->last_draw_vertex_shader : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0);

	target_json = buffer;

	if (scene != nullptr && render_object != nullptr && scene_object_added) {
		scene->Remove_Render_Object(render_object);
	}
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(render_object);
	REF_PTR_RELEASE(camera);
	TheTerrainRenderObject = old_terrain_render_object;
	TheWaterTransparency = old_water_transparency;
	if (probe_water_transparency != nullptr &&
			probe_water_transparency != old_water_transparency) {
		probe_water_transparency->deleteInstance();
	}
	REF_PTR_RELEASE(map_load.map);
	map = nullptr;
	if (asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		if (shader_manager_initialized)
			W3DShaderManager::shutdown();
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	delete global_data;

	return target_json.c_str();
}

const char *run_ww3d_terrain_tree_buffer_scene_probe(
	std::string &target_json,
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *runtime_archive_directory,
	const char *runtime_archive_mask)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = nullptr;

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	int init_height_data_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool map_created = false;
	bool global_data_ready = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool texture_file_factory_installed = false;
	bool models_file_exists = false;
	bool mesh_file_exists = false;
	bool tree_texture_file_exists = false;
	bool material_texture_file_exists = false;
	bool tree_vertex_shader_file_exists = false;
	bool tree_pixel_shader_file_exists = false;
	bool water_transparency_ready = false;
	bool shader_manager_initialized = false;
	bool render_object_created = false;
	bool render_object_initialized = false;
	bool tree_buffer_installed = false;
	bool tree_data_configured = false;
	bool add_tree_invoked = false;
	bool update_tree_invoked = false;
	bool update_center_invoked = false;
	bool script_engine_ready = false;
	bool scene_created = false;
	bool scene_object_added = false;
	bool tree_scene_draw_flushed = false;
	bool remove_tree_invoked = false;
	bool clear_trees_invoked = false;
	bool tree_need_to_draw_after_center = false;
	bool tree_need_to_draw_after_scene = false;
	Int tree_tiles_after_scene = -1;
	float tree_location_x = 0.0f;
	float tree_location_y = 0.0f;
	float tree_location_z = 0.0f;
	float camera_eye_x = 0.0f;
	float camera_eye_y = 0.0f;
	float camera_eye_z = 0.0f;
	float camera_target_x = 0.0f;
	float camera_target_y = 0.0f;
	float camera_target_z = 0.0f;

	ProbeTerrainMapPatchLoad map_load;
	WorldHeightMap *map = load_archive_terrain_map_patch(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load);
	map_created = map_load.mapParsed && map != nullptr;

	if (map_created) {
		global_data = NEW GlobalData;
		if (global_data != nullptr) {
			configure_global_data(*global_data);
			TheWritableGlobalData = global_data;
			global_data_ready = true;
		}
	}

	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	ProbeHeightMapRenderObjWithTreeBuffer *render_object = nullptr;
	W3DTreeBuffer *tree_buffer = nullptr;
	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;
	WW3DAssetManager *asset_manager = nullptr;

	if (global_data_ready) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}
	if (succeeded(init_result)) {
		asset_manager = W3DNEW W3DAssetManager();
		asset_manager_created = asset_manager != nullptr;
	}
	if (asset_manager != nullptr) {
		asset_manager->Set_WW3D_Load_On_Demand(true);
	}
	if (asset_manager_created) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		W3DShaderManager::init();
		shader_manager_initialized = true;

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_set(runtime_archive_directory, runtime_archive_mask);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		models_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeModelsArchiveEntry);
		mesh_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeMeshArchiveEntry);
		tree_texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeTextureArchiveEntry);
		material_texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeMaterialTextureArchiveEntry);
		tree_vertex_shader_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeVertexShaderArchiveEntry);
		tree_pixel_shader_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreePixelShaderArchiveEntry);
	}

	if (succeeded(set_device_result) && map_created && mesh_file_exists && tree_texture_file_exists) {
		if (old_water_transparency != nullptr) {
			water_transparency_ready = true;
		} else {
			probe_water_transparency = newInstance(WaterTransparencySetting);
			TheWaterTransparency = probe_water_transparency;
			water_transparency_ready = probe_water_transparency != nullptr;
		}

		map->setDrawWidth(kMapPatchVertices);
		map->setDrawHeight(kMapPatchVertices);
		map->setDrawOrg(map_load.patchOriginX, map_load.patchOriginY);

		render_object = NEW_REF(ProbeHeightMapRenderObjWithTreeBuffer, ());
		render_object_created = render_object != nullptr;
		if (render_object_created) {
			Matrix3D terrain_transform(true);
			render_object->Set_Transform(terrain_transform);
			TheTerrainRenderObject = render_object;
			tree_buffer = render_object->installProbeTreeBuffer();
			tree_buffer_installed = tree_buffer != nullptr;
			init_height_data_result = render_object->initHeightData(
				map->getDrawWidth(),
				map->getDrawHeight(),
				map,
				nullptr,
				TRUE);
			render_object_initialized = init_height_data_result == 0;
		}
	}

	ProbeTreeDrawModuleDataScope tree_data_scope;
	W3DTreeDrawModuleData *tree_data = tree_data_scope.data();
	if (tree_buffer_installed && render_object_initialized) {
		tree_data_configured = tree_data != nullptr;

		tree_location_x =
			(static_cast<float>(map_load.patchOriginX) +
			 static_cast<float>(kMapPatchCells) * 0.5f -
			 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
		tree_location_y =
			(static_cast<float>(map_load.patchOriginY) +
			 static_cast<float>(kMapPatchCells) * 0.5f -
			 static_cast<float>(map_load.border)) * MAP_XY_FACTOR;
		tree_location_z = static_cast<float>(map_load.patchCenterHeight) * MAP_HEIGHT_SCALE + 2.0f;

		Coord3D location;
		location.set(tree_location_x, tree_location_y, tree_location_z);
		render_object->addTree(kTreeProbeId, location, 1.0f, 0.0f, 0.0f, tree_data);
		add_tree_invoked = true;
		update_tree_invoked = render_object->updateTreePosition(kTreeProbeId, location, 0.0f);

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera_target_x = tree_location_x;
			camera_target_y = tree_location_y;
			camera_target_z = tree_location_z + 35.0f;
			camera_eye_x = tree_location_x;
			camera_eye_y = tree_location_y - 140.0f;
			camera_eye_z = tree_location_z + 95.0f;
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, 2000.0f);
			Matrix3D camera_transform(true);
			camera_transform.Look_At(
				Vector3(camera_eye_x, camera_eye_y, camera_eye_z),
				Vector3(camera_target_x, camera_target_y, camera_target_z),
				0.0f);
			camera->Set_Transform(camera_transform);
		}
	}

	if (camera != nullptr && update_tree_invoked) {
		render_object->updateCenter(camera, nullptr);
		update_center_invoked = true;
		tree_need_to_draw_after_center = tree_buffer != nullptr && tree_buffer->needToDraw();
	}

	if (camera != nullptr && update_center_invoked) {
		scene = NEW_REF(RTS3DScene, ());
		scene_created = scene != nullptr;
		if (scene_created) {
			scene->Add_Render_Object(render_object);
			scene_object_added = render_object->Peek_Scene() == scene;
		}
	}

	{
		ProbeScriptEngineScope script_engine_scope;
		script_engine_ready = script_engine_scope.scriptEngine() != nullptr;
		if (scene_object_added && script_engine_ready) {
			begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				render_result = WW3D::Render(scene, camera);
				end_render_result = WW3D::End_Render(false);
			}
			tree_need_to_draw_after_scene = tree_buffer != nullptr && tree_buffer->needToDraw();
			tree_tiles_after_scene = tree_buffer != nullptr ? tree_buffer->getNumTiles() : -1;
		}
	}

	if (tree_buffer_installed) {
		render_object->removeTree(kTreeProbeId);
		remove_tree_invoked = true;
		render_object->removeAllTrees();
		clear_trees_invoked = true;
	}

	ProbeWorldHeightMapInspector::recordRenderedTileMetrics(map, map_load);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	tree_scene_draw_flushed =
		state != nullptr &&
		state->draw_indexed_primitive_calls >= 3 &&
		state->last_draw_stream_source_stride == sizeof(VertexFormatXYZNDUV1) &&
		state->last_draw_vertex_shader == DX8_FVF_XYZNDUV1 &&
		state->last_draw_vertex_count > 0 &&
		state->last_draw_primitive_count > 0 &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] != D3DTOP_DISABLE;
	const IniLayoutComparison ini_layout = compare_ini_layout();
	const bool ok =
		state != nullptr &&
		ini_layout.matches &&
		global_data_ready &&
		succeeded(init_result) &&
		asset_manager_created &&
		succeeded(set_device_result) &&
		runtime_asset_system_installed &&
		texture_file_factory_installed &&
		models_file_exists &&
		mesh_file_exists &&
		tree_texture_file_exists &&
		material_texture_file_exists &&
		map_load.iniArchiveLoaded &&
		map_load.mapsArchiveLoaded &&
		map_load.terrainArchiveLoaded &&
		map_load.terrainIniParsed &&
		map_load.terrainTypeCount > 0 &&
		map_load.mapEntryExists &&
		map_load.mapEntryOpenable &&
		map_load.mapStreamOpen &&
		map_created &&
		map_load.mapBytes > 0 &&
		map_load.width > kMapPatchCells &&
		map_load.height > kMapPatchCells &&
		map_load.heightChecksum > 0 &&
		map_load.patchHeightChecksum > 0 &&
		water_transparency_ready &&
		shader_manager_initialized &&
		render_object_created &&
		render_object_initialized &&
		tree_buffer_installed &&
		tree_data_configured &&
		add_tree_invoked &&
		update_tree_invoked &&
		update_center_invoked &&
		scene_created &&
		scene_object_added &&
		script_engine_ready &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		!tree_need_to_draw_after_scene &&
		tree_tiles_after_scene > 0 &&
		tree_scene_draw_flushed &&
		remove_tree_invoked &&
		clear_trees_invoked &&
		state->browser_texture_create_calls >= 2 &&
		state->browser_texture_update_calls >= 2 &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_buffer_create_calls >= 4 &&
		state->browser_buffer_update_calls >= 4 &&
		state->set_stream_source_calls >= 2 &&
		state->set_indices_calls >= 2 &&
		state->set_texture_calls >= 1;

	const std::string runtime_archive_directory_json =
		json_string(runtime_archive_directory != nullptr ? runtime_archive_directory : "");
	const std::string runtime_archive_mask_json =
		json_string(runtime_archive_mask != nullptr ? runtime_archive_mask : "");
	const std::string tree_model_json = json_string(kTreeModelName);
	const std::string tree_texture_json = json_string(kTreeTextureName);
	const std::string tree_models_entry_json = json_string(kTreeModelsArchiveEntry);
	const std::string tree_mesh_entry_json = json_string(kTreeMeshArchiveEntry);
	const std::string tree_texture_entry_json = json_string(kTreeTextureArchiveEntry);
	const std::string tree_material_texture_entry_json = json_string(kTreeMaterialTextureArchiveEntry);
	const std::string tree_vertex_shader_entry_json = json_string(kTreeVertexShaderArchiveEntry);
	const std::string tree_pixel_shader_entry_json = json_string(kTreePixelShaderArchiveEntry);
	const std::string terrain_map_entry_json = json_string(kArchiveTerrainMapEntry);
	const std::string first_patch_texture_class_json =
		json_string(map_load.firstPatchTextureClassName);
	const std::string ini_layout_report_json = ini_layout_json(ini_layout);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();

	char buffer[19000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_tree_buffer_scene_probe\","
		"\"ok\":%s,"
		"\"path\":\"original WorldHeightMap + HeightMapRenderObjClass::Render -> "
		"RTS3DScene::Flush -> DoTrees -> BaseHeightMapRenderObjClass::renderTrees -> "
		"W3DTreeBuffer::drawTrees\","
		"\"archives\":{\"ini\":\"%s\",\"maps\":\"%s\",\"terrain\":\"%s\","
		"\"runtimeDirectory\":%s,\"runtimeMask\":%s},"
		"\"asset\":{\"model\":%s,\"texture\":%s,\"modelsEntry\":%s,"
		"\"meshEntry\":%s,\"textureEntry\":%s,"
		"\"materialTextureEntry\":%s,\"vertexShaderEntry\":%s,"
		"\"pixelShaderEntry\":%s},"
		"\"results\":{\"globalDataReady\":%s,\"init\":%d,"
		"\"assetManagerCreated\":%s,\"setRenderDevice\":%d,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"modelsFileExists\":%s,\"meshFileExists\":%s,"
		"\"treeTextureFileExists\":%s,\"materialTextureFileExists\":%s,"
		"\"treeVertexShaderFileExists\":%s,\"treePixelShaderFileExists\":%s,"
		"\"waterTransparencyReady\":%s,\"shaderManagerInitialized\":%s,"
		"\"renderObjectCreated\":%s,\"renderObjectInitialized\":%s,"
		"\"initHeightData\":%d,\"treeBufferInstalled\":%s,"
		"\"treeDataConfigured\":%s,\"addTreeInvoked\":%s,"
		"\"updateTreeInvoked\":%s,\"updateCenterInvoked\":%s,"
		"\"treeNeedToDrawAfterCenter\":%s,"
		"\"treeNeedToDrawAfterScene\":%s,"
		"\"scriptEngineReady\":%s,"
		"\"sceneCreated\":%s,\"sceneObjectAdded\":%s,"
		"\"beginRender\":%d,\"render\":%d,\"endRender\":%d,"
		"\"treeSceneDrawFlushed\":%s,\"removeTreeInvoked\":%s,"
		"\"clearTreesInvoked\":%s},"
		"\"ini\":{\"entry\":\"Data\\\\INI\\\\Terrain.ini\","
		"\"loaded\":%s,\"entryExists\":%s,\"parsed\":%s,"
		"\"parser\":\"GameEngine/Common/INI.cpp::load + INITerrain.cpp\","
		"\"originalIniParser\":true,\"terrainTypeCount\":%lu},"
		"\"iniLayout\":%s,"
		"\"map\":{\"entry\":%s,\"entryExists\":%s,\"entryOpenable\":%s,"
		"\"streamOpen\":%s,\"parsed\":%s,\"bytes\":%d,"
		"\"width\":%d,\"height\":%d,\"border\":%d,"
		"\"heightChecksum\":%lu},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"tileSource\":\"shipped-map-heightmap\","
		"\"renderObject\":\"ProbeHeightMapRenderObjWithTreeBuffer\","
		"\"transform\":\"identity\","
		"\"renderWindowWidth\":%d,\"renderWindowHeight\":%d,"
		"\"renderOriginX\":%d,\"renderOriginY\":%d,"
		"\"patchOriginX\":%d,\"patchOriginY\":%d,"
		"\"patchCenterHeight\":%u,\"patchHeightChecksum\":%lu,"
		"\"tileDiagnostics\":{\"bitmapTiles\":%d,\"textureClasses\":%d,"
		"\"sourceTilesLoaded\":%d,\"sourceTilesPositioned\":%d,"
		"\"patchCells\":%d,\"patchCellsWithSource\":%d,"
		"\"patchCellsMissingSource\":%d,"
		"\"firstPatchTile\":{\"tileIndex\":%d,\"baseTileIndex\":%d,"
		"\"sourceTileLoaded\":%s,\"textureClass\":%d,"
		"\"textureClassName\":%s,\"texturePositionX\":%d,"
		"\"texturePositionY\":%d}}},"
		"\"scene\":{\"renderPath\":\"WW3D::Render(RTS3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> HeightMapRenderObjClass::Render -> "
		"RTS3DScene::Flush -> DoTrees -> W3DTreeBuffer::drawTrees\","
		"\"created\":%s,\"objectAdded\":%s,\"terrainClassId\":%d},"
		"\"tree\":{\"afterAdd\":%s,\"afterUpdate\":%s,"
		"\"tilesAfterScene\":%d,"
		"\"location\":[%.4f,%.4f,%.4f]},"
		"\"camera\":{\"eye\":[%.4f,%.4f,%.4f],"
		"\"target\":[%.4f,%.4f,%.4f]},"
		"\"runtimeAssets\":%s,"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"setVertexShader\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%u,\"vertexShaderFvf\":%lu,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,"
		"\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"texture0ColorOp\":%lu,"
		"\"texture0ColorArg1\":%lu,\"texture0ColorArg2\":%lu}}",
		bool_json(ok),
		ini_archive_path != nullptr ? ini_archive_path : "",
		maps_archive_path != nullptr ? maps_archive_path : "",
		terrain_archive_path != nullptr ? terrain_archive_path : "",
		runtime_archive_directory_json.c_str(),
		runtime_archive_mask_json.c_str(),
		tree_model_json.c_str(),
		tree_texture_json.c_str(),
		tree_models_entry_json.c_str(),
		tree_mesh_entry_json.c_str(),
		tree_texture_entry_json.c_str(),
		tree_material_texture_entry_json.c_str(),
		tree_vertex_shader_entry_json.c_str(),
		tree_pixel_shader_entry_json.c_str(),
		bool_json(global_data_ready),
		init_result,
		bool_json(asset_manager_created),
		set_device_result,
		bool_json(runtime_asset_system_installed),
		bool_json(texture_file_factory_installed),
		bool_json(models_file_exists),
		bool_json(mesh_file_exists),
		bool_json(tree_texture_file_exists),
		bool_json(material_texture_file_exists),
		bool_json(tree_vertex_shader_file_exists),
		bool_json(tree_pixel_shader_file_exists),
		bool_json(water_transparency_ready),
		bool_json(shader_manager_initialized),
		bool_json(render_object_created),
		bool_json(render_object_initialized),
		init_height_data_result,
		bool_json(tree_buffer_installed),
		bool_json(tree_data_configured),
		bool_json(add_tree_invoked),
		bool_json(update_tree_invoked),
		bool_json(update_center_invoked),
		bool_json(tree_need_to_draw_after_center),
		bool_json(tree_need_to_draw_after_scene),
		bool_json(script_engine_ready),
		bool_json(scene_created),
		bool_json(scene_object_added),
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(tree_scene_draw_flushed),
		bool_json(remove_tree_invoked),
		bool_json(clear_trees_invoked),
		bool_json(map_load.iniArchiveLoaded),
		bool_json(map_load.terrainIniExists),
		bool_json(map_load.terrainIniParsed),
		static_cast<unsigned long>(map_load.terrainTypeCount),
		ini_layout_report_json.c_str(),
		terrain_map_entry_json.c_str(),
		bool_json(map_load.mapEntryExists),
		bool_json(map_load.mapEntryOpenable),
		bool_json(map_load.mapStreamOpen),
		bool_json(map_load.mapParsed),
		map_load.mapBytes,
		map_load.width,
		map_load.height,
		map_load.border,
		static_cast<unsigned long>(map_load.heightChecksum),
		kMapPatchVertices,
		kMapPatchCells,
		map != nullptr ? map->getDrawWidth() : 0,
		map != nullptr ? map->getDrawHeight() : 0,
		map != nullptr ? map->getDrawOrgX() : 0,
		map != nullptr ? map->getDrawOrgY() : 0,
		map_load.patchOriginX,
		map_load.patchOriginY,
		map_load.patchCenterHeight,
		static_cast<unsigned long>(map_load.patchHeightChecksum),
		map_load.bitmapTileCount,
		map_load.textureClassCount,
		map_load.sourceTilesLoaded,
		map_load.sourceTilesPositioned,
		map_load.patchTileCells,
		map_load.patchTilesWithSource,
		map_load.patchTilesMissingSource,
		map_load.firstPatchTileIndex,
		map_load.firstPatchBaseTileIndex,
		bool_json(map_load.firstPatchSourceTileLoaded),
		map_load.firstPatchTextureClass,
		first_patch_texture_class_json.c_str(),
		map_load.firstPatchTileTextureX,
		map_load.firstPatchTileTextureY,
		bool_json(scene_created),
		bool_json(scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
		bool_json(add_tree_invoked),
		bool_json(update_tree_invoked),
		tree_tiles_after_scene,
		tree_location_x,
		tree_location_y,
		tree_location_z,
		camera_eye_x,
		camera_eye_y,
		camera_eye_z,
		camera_target_x,
		camera_target_y,
		camera_target_z,
		runtime_assets_json.c_str(),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->set_vertex_shader_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		state != nullptr ? state->last_draw_primitive_type : 0,
		state != nullptr ? state->last_draw_vertex_shader : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0);

	target_json = buffer;

	if (scene != nullptr && render_object != nullptr && scene_object_added) {
		scene->Remove_Render_Object(render_object);
	}
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(render_object);
	REF_PTR_RELEASE(camera);
	TheTerrainRenderObject = old_terrain_render_object;
	TheWaterTransparency = old_water_transparency;
	if (probe_water_transparency != nullptr &&
			probe_water_transparency != old_water_transparency) {
		probe_water_transparency->deleteInstance();
	}
	REF_PTR_RELEASE(map_load.map);
	map = nullptr;
	if (asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		if (shader_manager_initialized)
			W3DShaderManager::shutdown();
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	delete global_data;
	return target_json.c_str();
}

const char *run_ww3d_terrain_road_buffer_scene_probe(
	std::string &target_json,
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *runtime_archive_directory,
	const char *runtime_archive_mask,
	const char *map_entry)
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	const char *road_map_entry =
		map_entry != nullptr && map_entry[0] != '\0' ?
			map_entry :
			kArchiveRoadTerrainMapEntry;

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = nullptr;

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	int init_height_data_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool archive_context_ready = false;
	bool runtime_archive_set_loaded_for_selection = false;
	bool map_created = false;
	bool global_data_ready = false;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool texture_file_factory_installed = false;
	bool water_transparency_ready = false;
	bool shader_manager_initialized = false;
	bool render_object_created = false;
	bool render_object_initialized = false;
	bool road_buffer_installed = false;
	bool road_buffer_initialized = false;
	bool load_roads_invoked = false;
	bool update_center_invoked = false;
	bool scene_created = false;
	bool scene_object_added = false;
	bool road_scene_draw_flushed = false;
	Int roads_after_load = -1;
	Int road_segments_with_vertices = -1;
	Int road_types_with_textures = -1;
	Int road_types_with_draw_data = -1;
	Int total_road_type_vertices = -1;
	Int total_road_type_indices = -1;
	float road_center_x = 0.0f;
	float road_center_y = 0.0f;
	float road_center_z = 0.0f;
	float camera_eye_x = 0.0f;
	float camera_eye_y = 0.0f;
	float camera_eye_z = 0.0f;
	float camera_target_x = 0.0f;
	float camera_target_y = 0.0f;
	float camera_target_z = 0.0f;
	bool logical_map_stream_open = false;
	bool logical_map_parsed = false;
	bool logical_map_parse_exception = false;
	bool road_pair_candidate_selected = false;
	bool road_pair_map_objects_installed = false;
	bool logical_map_objects_used = false;
	Int road_pair_candidate_count = 0;
	Int selected_road_pair_candidate = -1;
	Int selected_road_pair_source_cells = 0;
	Int road_pair_candidates_with_source = 0;
	Int road_pair_candidates_with_texture = 0;
	Int road_pair_candidates_with_texture_and_source = 0;
	Int best_textured_source_cells = 0;
	bool selected_road_pair_texture_available = false;
	std::string road_pair_candidate_summaries_json = "[]";
	std::vector<ProbeRoadPairCandidate> road_pair_candidates;
	ProbeLogicalMapObjectLoadMetrics logical_terrain_map_objects;

	ProbeTerrainMapPatchLoad map_load;
	ProbeTerrainArchiveContext archive_context;
	archive_context_ready = archive_context.prepare(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load,
		road_map_entry);
	if (archive_context_ready) {
		probe_bridge_phase_log("load-runtime-archive-set");
		runtime_archive_set_loaded_for_selection =
			archive_context.loadRuntimeArchiveSet(
				runtime_archive_directory,
				runtime_archive_mask);
	}

	WorldHeightMap *map = nullptr;
	if (archive_context_ready && map_load.roadsIniParsed) {
		probe_bridge_phase_log("parse-world-height-map");
		WorldHeightMap::freeListOfMapObjects();
		CachedFileInputStream stream;
		map_load.mapStreamOpen = stream.open(AsciiString(road_map_entry));
		if (map_load.mapStreamOpen) {
			try {
				map_load.map = NEW WorldHeightMap(&stream);
				map = map_load.map;
				map_created = map != nullptr;
				map_load.mapParsed = map_created;
				if (map_created) {
					record_parsed_map_metrics(map_load);
				}
			} catch (...) {
				map_load.mapParseException = true;
				REF_PTR_RELEASE(map_load.map);
				map = nullptr;
			}
			stream.close();
		}
	}
	if (map_created) {
		logical_terrain_map_objects =
			load_probe_logical_terrain_map_objects(
				road_map_entry,
				archive_context.terrainRoads());
		logical_map_stream_open = logical_terrain_map_objects.loadReturned;
		logical_map_parse_exception = logical_terrain_map_objects.loadException;
		if (logical_terrain_map_objects.loadReturned) {
			collect_probe_road_pairs_from_map_objects(
				archive_context.terrainRoads(),
				road_pair_candidates);
			logical_map_parsed = !road_pair_candidates.empty();
			logical_map_objects_used =
				logical_terrain_map_objects.mapObjectsPresentAfterLoad;
		}
	}
	road_pair_candidate_count =
		static_cast<Int>(std::min<std::size_t>(
			road_pair_candidates.size(),
			static_cast<std::size_t>(2147483647)));

	if (map_created) {
		ProbeWorldHeightMapInspector::recordTextureClassLoadMetrics(
			map,
			archive_context.terrainTypes(),
			archive_context.fileSystem(),
			map_load);
	}

	if (map_created && logical_map_parsed) {
		road_pair_candidate_selected =
			select_probe_road_pair_for_loaded_patch(
				map,
				map_load,
				road_pair_candidates,
				archive_context.terrainRoads(),
				archive_context.fileSystem(),
				selected_road_pair_candidate,
				selected_road_pair_source_cells);
		if (road_pair_candidate_selected) {
			for (const ProbeRoadPairCandidate &candidate : road_pair_candidates) {
				if (candidate.loadedSourceCells > 0) {
					++road_pair_candidates_with_source;
				}
				if (candidate.textureAvailable) {
					++road_pair_candidates_with_texture;
				}
				if (candidate.textureAvailable && candidate.loadedSourceCells > 0) {
					++road_pair_candidates_with_texture_and_source;
					best_textured_source_cells =
						std::max(best_textured_source_cells, candidate.loadedSourceCells);
				}
			}
			selected_road_pair_texture_available =
				road_pair_candidates[
					static_cast<std::size_t>(selected_road_pair_candidate)].textureAvailable;
			road_pair_candidate_summaries_json =
				probe_road_pair_candidate_summary_json(
					road_pair_candidates,
					archive_context.terrainRoads(),
					selected_road_pair_candidate);
		}
	}

	ProbeMapRoadObjectMetrics road_object_metrics =
		inspect_map_road_objects(archive_context.terrainRoads());
	if (map_created && road_object_metrics.roadPairs > 0) {
		if (road_pair_candidate_selected && selected_road_pair_candidate >= 0) {
			const ProbeRoadPairCandidate &selected =
				road_pair_candidates[static_cast<std::size_t>(selected_road_pair_candidate)];
			road_center_x = (selected.first.location.x + selected.second.location.x) * 0.5f;
			road_center_y = (selected.first.location.y + selected.second.location.y) * 0.5f;
		} else {
			road_center_x = (road_object_metrics.firstRoadX + road_object_metrics.secondRoadX) * 0.5f;
			road_center_y = (road_object_metrics.firstRoadY + road_object_metrics.secondRoadY) * 0.5f;
		}
		record_patch_height_metrics(map_load);
	}

	if (map_created) {
		global_data = NEW GlobalData;
		if (global_data != nullptr) {
			configure_global_data(*global_data);
			global_data->m_maxRoadSegments = 4000;
			global_data->m_maxRoadVertex = 3000;
			global_data->m_maxRoadIndex = 5000;
			global_data->m_maxRoadTypes = 100;
			TheWritableGlobalData = global_data;
			global_data_ready = true;
		}
	}

	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	ProbeHeightMapRenderObjWithRoadBuffer *render_object = nullptr;
	ProbeW3DRoadBuffer *road_buffer = nullptr;
	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;
	WW3DAssetManager *asset_manager = nullptr;

	if (global_data_ready) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}
	if (succeeded(init_result)) {
		asset_manager = W3DNEW W3DAssetManager();
		asset_manager_created = asset_manager != nullptr;
	}
	if (asset_manager != nullptr) {
		asset_manager->Set_WW3D_Load_On_Demand(true);
	}
	if (asset_manager_created) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		W3DShaderManager::init();
		shader_manager_initialized = true;

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_set(runtime_archive_directory, runtime_archive_mask);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
	}

	if (succeeded(set_device_result) && map_created && road_object_metrics.roadPairs > 0) {
		if (old_water_transparency != nullptr) {
			water_transparency_ready = true;
		} else {
			probe_water_transparency = newInstance(WaterTransparencySetting);
			TheWaterTransparency = probe_water_transparency;
			water_transparency_ready = probe_water_transparency != nullptr;
		}

		map->setDrawWidth(kMapPatchVertices);
		map->setDrawHeight(kMapPatchVertices);
		map->setDrawOrg(map_load.patchOriginX, map_load.patchOriginY);

		render_object = NEW_REF(ProbeHeightMapRenderObjWithRoadBuffer, ());
		render_object_created = render_object != nullptr;
		if (render_object_created) {
			Matrix3D terrain_transform(true);
			render_object->Set_Transform(terrain_transform);
			TheTerrainRenderObject = render_object;
			init_height_data_result = render_object->initHeightData(
				map->getDrawWidth(),
				map->getDrawHeight(),
				map,
				nullptr,
				TRUE);
			render_object_initialized = init_height_data_result == 0;
		}
	}

	if (water_transparency_ready && render_object_initialized) {
		road_buffer = render_object->installProbeRoadBuffer(map);
		road_buffer_installed = road_buffer != nullptr;
		road_buffer_initialized = road_buffer_installed && road_buffer->initialized();
	}

	if (road_buffer_initialized) {
		road_buffer->loadRoads();
		load_roads_invoked = true;
		roads_after_load = road_buffer->numRoads();
		road_segments_with_vertices = road_buffer->roadSegmentsWithVertices();
		road_types_with_textures = road_buffer->roadTypesWithTextures();

		road_center_z = static_cast<float>(map_load.patchCenterHeight) * MAP_HEIGHT_SCALE + 18.0f;
		camera_target_x = road_center_x;
		camera_target_y = road_center_y;
		camera_target_z = road_center_z;
		camera_eye_x = road_center_x;
		camera_eye_y = road_center_y - 330.0f;
		camera_eye_z = road_center_z + 260.0f;

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, 5000.0f);
			Matrix3D camera_transform(true);
			camera_transform.Look_At(
				Vector3(camera_eye_x, camera_eye_y, camera_eye_z),
				Vector3(camera_target_x, camera_target_y, camera_target_z),
				0.0f);
			camera->Set_Transform(camera_transform);
		}
	}

	if (camera != nullptr && load_roads_invoked) {
		render_object->updateCenter(camera, nullptr);
		road_buffer->updateCenter();
		update_center_invoked = true;
	}

	if (camera != nullptr && update_center_invoked) {
		scene = NEW_REF(RTS3DScene, ());
		scene_created = scene != nullptr;
		if (scene_created) {
			scene->Add_Render_Object(render_object);
			scene_object_added = render_object->Peek_Scene() == scene;
		}
	}

	if (scene_object_added) {
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(scene, camera);
			end_render_result = WW3D::End_Render(false);
		}
		road_types_with_draw_data =
			road_buffer != nullptr ? road_buffer->roadTypesWithDrawData() : -1;
		total_road_type_vertices =
			road_buffer != nullptr ? road_buffer->totalRoadTypeVertices() : -1;
		total_road_type_indices =
			road_buffer != nullptr ? road_buffer->totalRoadTypeIndices() : -1;
	}

	ProbeWorldHeightMapInspector::recordRenderedTileMetrics(map, map_load);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	road_scene_draw_flushed =
		state != nullptr &&
		state->draw_indexed_primitive_calls >= 3 &&
		state->last_draw_stream_source_stride == sizeof(VertexFormatXYZDUV1) &&
		state->last_draw_vertex_shader == DX8_FVF_XYZDUV1 &&
		state->last_draw_vertex_count > 0 &&
		state->last_draw_primitive_count > 0 &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] != D3DTOP_DISABLE;
	const IniLayoutComparison ini_layout = compare_ini_layout();
	const bool ok =
		state != nullptr &&
		ini_layout.matches &&
		archive_context_ready &&
		runtime_archive_set_loaded_for_selection &&
		global_data_ready &&
		succeeded(init_result) &&
		asset_manager_created &&
		succeeded(set_device_result) &&
		runtime_asset_system_installed &&
		texture_file_factory_installed &&
		map_load.iniArchiveLoaded &&
		map_load.mapsArchiveLoaded &&
		map_load.terrainArchiveLoaded &&
		map_load.terrainIniParsed &&
		map_load.terrainTypeCount > 0 &&
		map_load.roadsIniExists &&
		map_load.roadsIniParsed &&
		map_load.terrainRoadCount > 0 &&
		map_load.mapEntryExists &&
		map_load.mapEntryOpenable &&
		map_load.mapStreamOpen &&
		map_created &&
		logical_map_stream_open &&
		logical_map_parsed &&
		!logical_map_parse_exception &&
		logical_terrain_map_objects.attempted &&
		logical_terrain_map_objects.mapCacheInstalled &&
		logical_terrain_map_objects.terrainLogicInstalled &&
		logical_terrain_map_objects.gameClientInstalled &&
		logical_terrain_map_objects.thingFactoryInstalled &&
		logical_terrain_map_objects.scriptEngineInstalled &&
		logical_terrain_map_objects.loadReturned &&
		!logical_terrain_map_objects.loadException &&
		logical_terrain_map_objects.sourceFilenameMatches &&
		logical_terrain_map_objects.mapObjectsPresentAfterLoad &&
		logical_terrain_map_objects.roadPairsWithRoadType > 0 &&
		logical_terrain_map_objects.timeOfDayNotified &&
		logical_terrain_map_objects.notifiedTimeOfDay == logical_terrain_map_objects.mapTimeOfDay &&
		logical_map_objects_used &&
		road_pair_candidate_count > 0 &&
		road_pair_candidate_selected &&
		!road_pair_map_objects_installed &&
		selected_road_pair_candidate >= 0 &&
		selected_road_pair_source_cells > 0 &&
		selected_road_pair_texture_available &&
		map_load.mapBytes > 0 &&
		map_load.width > kMapPatchCells &&
		map_load.height > kMapPatchCells &&
		map_load.heightChecksum > 0 &&
		map_load.patchHeightChecksum > 0 &&
		road_object_metrics.mapObjects > 0 &&
		road_object_metrics.roadPairs > 0 &&
		road_object_metrics.roadPairsWithRoadType > 0 &&
		water_transparency_ready &&
		shader_manager_initialized &&
		render_object_created &&
		render_object_initialized &&
		road_buffer_installed &&
		road_buffer_initialized &&
		load_roads_invoked &&
		roads_after_load > 0 &&
		road_segments_with_vertices > 0 &&
		road_types_with_textures > 0 &&
		update_center_invoked &&
		scene_created &&
		scene_object_added &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		render_object != nullptr &&
		render_object->probeRoadDrawInvoked() &&
		road_scene_draw_flushed &&
		road_types_with_draw_data > 0 &&
		total_road_type_vertices > 0 &&
		total_road_type_indices > 0 &&
		state->browser_buffer_create_calls >= 4 &&
		state->browser_buffer_update_calls >= 4 &&
		state->set_stream_source_calls >= 2 &&
		state->set_indices_calls >= 2 &&
		state->set_texture_calls >= 1;

	const std::string runtime_archive_directory_json =
		json_string(runtime_archive_directory != nullptr ? runtime_archive_directory : "");
	const std::string runtime_archive_mask_json =
		json_string(runtime_archive_mask != nullptr ? runtime_archive_mask : "");
	const std::string terrain_map_entry_json = json_string(road_map_entry);
	const std::string first_patch_texture_class_json =
		json_string(map_load.firstPatchTextureClassName);
	const std::string ini_layout_report_json = ini_layout_json(ini_layout);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();
	const std::string first_road_name_json = json_string(road_object_metrics.firstRoadName);
	const std::string logical_terrain_source_filename_json =
		json_string(logical_terrain_map_objects.sourceFilename);
	const std::string logical_terrain_failure_phase_json =
		json_string(logical_terrain_map_objects.failurePhase);

	char buffer[30000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_road_buffer_scene_probe\","
		"\"ok\":%s,"
		"\"path\":\"original WorldHeightMap + HeightMapRenderObjClass::Render -> "
		"ProbeHeightMapRenderObjWithRoadBuffer::Render -> W3DRoadBuffer::drawRoads\","
		"\"archives\":{\"ini\":\"%s\",\"maps\":\"%s\",\"terrain\":\"%s\","
		"\"runtimeDirectory\":%s,\"runtimeMask\":%s},"
		"\"results\":{\"archiveContextReady\":%s,\"globalDataReady\":%s,"
		"\"runtimeArchiveSetLoadedForSelection\":%s,"
		"\"init\":%d,\"assetManagerCreated\":%s,\"setRenderDevice\":%d,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"logicalMapStreamOpen\":%s,\"logicalMapParsed\":%s,"
		"\"logicalMapParseException\":%s,"
		"\"roadPairCandidateSelected\":%s,"
		"\"roadPairMapObjectsInstalled\":%s,"
		"\"waterTransparencyReady\":%s,\"shaderManagerInitialized\":%s,"
		"\"renderObjectCreated\":%s,\"renderObjectInitialized\":%s,"
		"\"initHeightData\":%d,\"roadBufferInstalled\":%s,"
		"\"roadBufferInitialized\":%s,\"loadRoadsInvoked\":%s,"
		"\"updateCenterInvoked\":%s,\"sceneCreated\":%s,"
		"\"sceneObjectAdded\":%s,\"beginRender\":%d,\"render\":%d,"
		"\"endRender\":%d,\"roadDrawInvoked\":%s,"
		"\"roadSceneDrawFlushed\":%s},"
		"\"logicalTerrain\":{\"path\":\"W3DTerrainLogic::loadMap(query=true) -> "
		"MapObject list -> W3DRoadBuffer::loadRoads\","
		"\"attempted\":%s,\"localGlobalDataInstalled\":%s,"
		"\"mapCacheInstalled\":%s,\"terrainLogicInstalled\":%s,"
		"\"gameClientInstalled\":%s,\"thingFactoryInstalled\":%s,"
		"\"scriptEngineInstalled\":%s,\"loadReturned\":%s,"
		"\"loadException\":%s,\"loadError\":%d,"
		"\"failurePhase\":%s,\"sourceFilename\":%s,"
		"\"sourceFilenameMatches\":%s,"
		"\"mapObjectsPresentAfterLoad\":%s,\"mapObjectsUsed\":%s,"
		"\"mapObjectCount\":%d,\"roadPoint1\":%d,\"roadPoint2\":%d,"
		"\"roadPairs\":%d,\"roadPairsWithRoadType\":%d,"
		"\"bridgePoint1\":%d,\"bridgePoint2\":%d,"
		"\"bridgePairs\":%d,\"bridgePairsWithBridgeType\":%d,"
		"\"timeOfDayNotified\":%s,\"mapTimeOfDay\":%d,"
		"\"notifiedTimeOfDay\":%d},"
		"\"ini\":{\"terrainEntry\":\"Data\\\\INI\\\\Terrain.ini\","
		"\"terrainLoaded\":%s,\"terrainEntryExists\":%s,"
		"\"terrainParsed\":%s,"
		"\"roadsEntry\":\"Data\\\\INI\\\\Roads.ini\","
		"\"defaultRoadsEntry\":\"Data\\\\INI\\\\Default\\\\Roads.ini\","
		"\"defaultRoadsEntryExists\":%s,\"defaultRoadsParsed\":%s,"
		"\"roadsEntryExists\":%s,\"roadsParsed\":%s,"
		"\"parser\":\"GameEngine/Common/INI.cpp::load + INITerrain.cpp + "
		"INITerrainRoad.cpp + INITerrainBridge.cpp + TerrainRoads.cpp\","
		"\"originalIniParser\":true,\"terrainTypeCount\":%lu,"
		"\"roadCount\":%lu,\"bridgeCount\":%lu},"
		"\"iniLayout\":%s,"
		"\"map\":{\"entry\":%s,\"entryExists\":%s,\"entryOpenable\":%s,"
		"\"streamOpen\":%s,\"parsed\":%s,\"bytes\":%d,"
		"\"width\":%d,\"height\":%d,\"border\":%d,"
		"\"heightChecksum\":%lu},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"tileSource\":\"shipped-map-heightmap\","
		"\"renderObject\":\"ProbeHeightMapRenderObjWithRoadBuffer\","
		"\"transform\":\"identity\","
		"\"renderWindowWidth\":%d,\"renderWindowHeight\":%d,"
		"\"renderOriginX\":%d,\"renderOriginY\":%d,"
		"\"patchOriginX\":%d,\"patchOriginY\":%d,"
		"\"patchCenterHeight\":%u,\"patchHeightChecksum\":%lu,"
		"\"tileDiagnostics\":{\"bitmapTiles\":%d,\"textureClasses\":%d,"
		"\"sourceTilesLoaded\":%d,\"sourceTilesPositioned\":%d,"
		"\"patchCells\":%d,\"patchCellsWithSource\":%d,"
		"\"patchCellsMissingSource\":%d,"
		"\"firstPatchTile\":{\"tileIndex\":%d,\"baseTileIndex\":%d,"
		"\"sourceTileLoaded\":%s,\"textureClass\":%d,"
		"\"textureClassName\":%s,\"texturePositionX\":%d,"
		"\"texturePositionY\":%d}}},"
		"\"scene\":{\"renderPath\":\"WW3D::Render(RTS3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> ProbeHeightMapRenderObjWithRoadBuffer::Render -> "
		"HeightMapRenderObjClass::Render -> W3DRoadBuffer::drawRoads\","
		"\"created\":%s,\"objectAdded\":%s,\"terrainClassId\":%d},"
		"\"roadObjects\":{\"mapObjects\":%d,\"point1\":%d,\"point2\":%d,"
		"\"candidatePairs\":%d,\"selectedCandidate\":%d,"
		"\"candidatesWithSource\":%d,"
		"\"candidatesWithTexture\":%d,"
		"\"candidatesWithTextureAndSource\":%d,"
		"\"bestTexturedSourceCells\":%d,"
		"\"selectedPatchSourceCells\":%d,"
		"\"selectedTextureAvailable\":%s,"
		"\"topTexturedSourceCandidates\":%s,"
		"\"pairs\":%d,\"pairsWithRoadType\":%d,\"firstName\":%s,"
		"\"firstFlags\":%d,\"first\":[%.4f,%.4f],\"second\":[%.4f,%.4f],"
		"\"center\":[%.4f,%.4f,%.4f]},"
		"\"roads\":{\"afterLoad\":%d,\"segmentsWithVertices\":%d,"
		"\"typesWithTextures\":%d,\"typesWithDrawData\":%d,"
		"\"totalTypeVertices\":%d,\"totalTypeIndices\":%d,"
		"\"maxSegments\":%d,\"maxVertex\":%d,\"maxIndex\":%d,"
		"\"maxTypes\":%d,\"updateBuffersAfterScene\":%s,"
		"\"drawBounds\":{\"minX\":%d,\"maxX\":%d,\"minY\":%d,\"maxY\":%d}},"
		"\"camera\":{\"eye\":[%.4f,%.4f,%.4f],"
		"\"target\":[%.4f,%.4f,%.4f]},"
		"\"runtimeAssets\":%s,"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"setVertexShader\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%u,\"vertexShaderFvf\":%lu,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,"
		"\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"texture0ColorOp\":%lu,"
		"\"texture0ColorArg1\":%lu,\"texture0ColorArg2\":%lu}}",
		bool_json(ok),
		ini_archive_path != nullptr ? ini_archive_path : "",
		maps_archive_path != nullptr ? maps_archive_path : "",
		terrain_archive_path != nullptr ? terrain_archive_path : "",
		runtime_archive_directory_json.c_str(),
		runtime_archive_mask_json.c_str(),
		bool_json(archive_context_ready),
		bool_json(global_data_ready),
		bool_json(runtime_archive_set_loaded_for_selection),
		init_result,
		bool_json(asset_manager_created),
		set_device_result,
		bool_json(runtime_asset_system_installed),
		bool_json(texture_file_factory_installed),
		bool_json(logical_map_stream_open),
		bool_json(logical_map_parsed),
		bool_json(logical_map_parse_exception),
		bool_json(road_pair_candidate_selected),
		bool_json(road_pair_map_objects_installed),
		bool_json(water_transparency_ready),
		bool_json(shader_manager_initialized),
		bool_json(render_object_created),
		bool_json(render_object_initialized),
		init_height_data_result,
		bool_json(road_buffer_installed),
		bool_json(road_buffer_initialized),
		bool_json(load_roads_invoked),
		bool_json(update_center_invoked),
		bool_json(scene_created),
		bool_json(scene_object_added),
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(render_object != nullptr && render_object->probeRoadDrawInvoked()),
		bool_json(road_scene_draw_flushed),
		bool_json(logical_terrain_map_objects.attempted),
		bool_json(logical_terrain_map_objects.localGlobalDataInstalled),
		bool_json(logical_terrain_map_objects.mapCacheInstalled),
		bool_json(logical_terrain_map_objects.terrainLogicInstalled),
		bool_json(logical_terrain_map_objects.gameClientInstalled),
		bool_json(logical_terrain_map_objects.thingFactoryInstalled),
		bool_json(logical_terrain_map_objects.scriptEngineInstalled),
		bool_json(logical_terrain_map_objects.loadReturned),
		bool_json(logical_terrain_map_objects.loadException),
		logical_terrain_map_objects.loadError,
		logical_terrain_failure_phase_json.c_str(),
		logical_terrain_source_filename_json.c_str(),
		bool_json(logical_terrain_map_objects.sourceFilenameMatches),
		bool_json(logical_terrain_map_objects.mapObjectsPresentAfterLoad),
		bool_json(logical_map_objects_used),
		logical_terrain_map_objects.mapObjectCount,
		logical_terrain_map_objects.roadPoint1,
		logical_terrain_map_objects.roadPoint2,
		logical_terrain_map_objects.roadPairs,
		logical_terrain_map_objects.roadPairsWithRoadType,
		logical_terrain_map_objects.bridgePoint1,
		logical_terrain_map_objects.bridgePoint2,
		logical_terrain_map_objects.bridgePairs,
		logical_terrain_map_objects.bridgePairsWithBridgeType,
		bool_json(logical_terrain_map_objects.timeOfDayNotified),
		static_cast<int>(logical_terrain_map_objects.mapTimeOfDay),
		static_cast<int>(logical_terrain_map_objects.notifiedTimeOfDay),
		bool_json(map_load.iniArchiveLoaded),
		bool_json(map_load.terrainIniExists),
		bool_json(map_load.terrainIniParsed),
		bool_json(map_load.defaultRoadsIniExists),
		bool_json(map_load.defaultRoadsIniParsed),
		bool_json(map_load.roadsIniExists),
		bool_json(map_load.roadsIniParsed),
		static_cast<unsigned long>(map_load.terrainTypeCount),
		static_cast<unsigned long>(map_load.terrainRoadCount),
		static_cast<unsigned long>(map_load.terrainBridgeCount),
		ini_layout_report_json.c_str(),
		terrain_map_entry_json.c_str(),
		bool_json(map_load.mapEntryExists),
		bool_json(map_load.mapEntryOpenable),
		bool_json(map_load.mapStreamOpen),
		bool_json(map_load.mapParsed),
		map_load.mapBytes,
		map_load.width,
		map_load.height,
		map_load.border,
		static_cast<unsigned long>(map_load.heightChecksum),
		kMapPatchVertices,
		kMapPatchCells,
		map != nullptr ? map->getDrawWidth() : 0,
		map != nullptr ? map->getDrawHeight() : 0,
		map != nullptr ? map->getDrawOrgX() : 0,
		map != nullptr ? map->getDrawOrgY() : 0,
		map_load.patchOriginX,
		map_load.patchOriginY,
		map_load.patchCenterHeight,
		static_cast<unsigned long>(map_load.patchHeightChecksum),
		map_load.bitmapTileCount,
		map_load.textureClassCount,
		map_load.sourceTilesLoaded,
		map_load.sourceTilesPositioned,
		map_load.patchTileCells,
		map_load.patchTilesWithSource,
		map_load.patchTilesMissingSource,
		map_load.firstPatchTileIndex,
		map_load.firstPatchBaseTileIndex,
		bool_json(map_load.firstPatchSourceTileLoaded),
		map_load.firstPatchTextureClass,
		first_patch_texture_class_json.c_str(),
		map_load.firstPatchTileTextureX,
		map_load.firstPatchTileTextureY,
		bool_json(scene_created),
		bool_json(scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
		road_object_metrics.mapObjects,
		road_object_metrics.roadPoint1,
		road_object_metrics.roadPoint2,
		road_pair_candidate_count,
		selected_road_pair_candidate,
		road_pair_candidates_with_source,
		road_pair_candidates_with_texture,
		road_pair_candidates_with_texture_and_source,
		best_textured_source_cells,
		selected_road_pair_source_cells,
		bool_json(selected_road_pair_texture_available),
		road_pair_candidate_summaries_json.c_str(),
		road_object_metrics.roadPairs,
		road_object_metrics.roadPairsWithRoadType,
		first_road_name_json.c_str(),
		road_object_metrics.firstRoadFlags,
		road_object_metrics.firstRoadX,
		road_object_metrics.firstRoadY,
		road_object_metrics.secondRoadX,
		road_object_metrics.secondRoadY,
		road_center_x,
		road_center_y,
		road_center_z,
		roads_after_load,
		road_segments_with_vertices,
		road_types_with_textures,
		road_types_with_draw_data,
		total_road_type_vertices,
		total_road_type_indices,
		road_buffer != nullptr ? road_buffer->maxRoadSegments() : 0,
		road_buffer != nullptr ? road_buffer->maxRoadVertex() : 0,
		road_buffer != nullptr ? road_buffer->maxRoadIndex() : 0,
		road_buffer != nullptr ? road_buffer->maxRoadTypes() : 0,
		bool_json(road_buffer != nullptr && road_buffer->updateBuffers()),
		render_object != nullptr ? render_object->probeRoadDrawMinX() : 0,
		render_object != nullptr ? render_object->probeRoadDrawMaxX() : 0,
		render_object != nullptr ? render_object->probeRoadDrawMinY() : 0,
		render_object != nullptr ? render_object->probeRoadDrawMaxY() : 0,
		camera_eye_x,
		camera_eye_y,
		camera_eye_z,
		camera_target_x,
		camera_target_y,
		camera_target_z,
		runtime_assets_json.c_str(),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->set_vertex_shader_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		state != nullptr ? state->last_draw_primitive_type : 0,
		state != nullptr ? state->last_draw_vertex_shader : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0);

	target_json = buffer;

	if (scene != nullptr && render_object != nullptr && scene_object_added) {
		scene->Remove_Render_Object(render_object);
	}
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(render_object);
	REF_PTR_RELEASE(camera);
	TheTerrainRenderObject = old_terrain_render_object;
	TheWaterTransparency = old_water_transparency;
	if (probe_water_transparency != nullptr &&
			probe_water_transparency != old_water_transparency) {
		probe_water_transparency->deleteInstance();
	}
	REF_PTR_RELEASE(map_load.map);
	map = nullptr;
	WorldHeightMap::freeListOfMapObjects();
	if (asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		if (shader_manager_initialized)
			W3DShaderManager::shutdown();
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	delete global_data;
	return target_json.c_str();
}

const char *run_ww3d_terrain_bridge_buffer_scene_probe(
	std::string &target_json,
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *runtime_archive_directory,
	const char *runtime_archive_mask,
	const char *map_entry)
{
	initMemoryManager();
	wasm_d3d8_reset_state();
	const bool old_shroud_enabled = g_ww3d_terrain_probe_shroud_enabled;
	g_ww3d_terrain_probe_shroud_enabled = true;
	const char *bridge_map_entry =
		map_entry != nullptr && map_entry[0] != '\0' ?
			map_entry :
			kArchiveBridgeTerrainMapEntry;

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = nullptr;
	TerrainLogic *old_terrain_logic = TheTerrainLogic;
	GameLogic *old_game_logic = TheGameLogic;
	ModuleFactory *old_module_factory = TheModuleFactory;
	AudioManager *old_audio = TheAudio;
	PlayerList *old_player_list = ThePlayerList;
	Radar *old_radar = TheRadar;
	GhostObjectManager *old_ghost_object_manager = TheGhostObjectManager;
	PartitionManager *old_partition_manager = ThePartitionManager;
	FXListStore *old_fx_list_store = TheFXListStore;
	DamageFXStore *old_damage_fx_store = TheDamageFXStore;
	ArmorStore *old_armor_store = TheArmorStore;
	FontLibrary *old_font_library = TheFontLibrary;
	DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
	GlobalLanguage *old_global_language = TheGlobalLanguageData;
	MapCache bridge_draw_map_cache;
	ProbeTerrainLogicGameClient &bridge_draw_game_client =
		shared_probe_terrain_logic_game_client();
	bridge_draw_game_client.resetProbeState();
	ProbeTerrainDrawableFontLibrary bridge_drawable_font_library;
	ProbeTerrainDrawableDisplayStringManager bridge_drawable_display_string_manager;
	GlobalLanguage bridge_drawable_global_language;
	ThingFactory bridge_draw_thing_factory;
	ProbeBridgeModuleFactory bridge_draw_module_factory;
	GameLogic bridge_draw_game_logic;
	ProbeNoopAudioManager bridge_draw_audio;
	PlayerList bridge_draw_player_list;
	ProbeShroudCountingRadar bridge_draw_radar;
	GhostObjectManager bridge_draw_ghost_object_manager;
	PartitionManager bridge_draw_partition_manager;
	FXListStore bridge_draw_fx_list_store;
	DamageFXStore bridge_draw_damage_fx_store;
	ArmorStore bridge_draw_armor_store;
	ProbeTerrainLogicForBridgeDraw bridge_draw_terrain_logic;
	AI bridge_draw_ai;
	bridge_draw_ai.init();
	ProbeLogicalTerrainGlobalScope bridge_draw_global_scope(
		&bridge_draw_map_cache,
		&bridge_draw_game_client,
		&bridge_draw_thing_factory,
		&bridge_draw_terrain_logic,
		&bridge_draw_ai);

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	int init_height_data_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool archive_context_ready = false;
	bool runtime_archive_set_loaded_for_selection = false;
	bool map_created = false;
	bool global_data_ready = false;
	bool bridge_module_factory_ready = false;
	bool bridge_game_logic_ready = false;
	bool bridge_player_list_ready = false;
	bool bridge_radar_ready = false;
	bool bridge_damage_fx_ready = false;
	bool bridge_armor_ready = false;
	bool bridge_generic_bridge_template_loaded = false;
	bool bridge_damage_fx_entry_available = false;
	bool bridge_damage_fx_load_exception = false;
	bool bridge_armor_entry_available = false;
	bool bridge_armor_load_exception = false;
	bool bridge_generic_bridge_template_load_exception = false;
	Int bridge_generic_bridge_template_error_code = 0;
	bool bridge_drawable_globals_installed = false;
	bool bridge_partition_ready = false;
	bool bridge_object_script_engine_ready = false;
	bool bridge_thing_factory_new_object_template_found = false;
	bool bridge_thing_factory_new_object_invoked = false;
	bool bridge_thing_factory_new_object_exception = false;
	bool bridge_thing_factory_new_object_returned = false;
	bool bridge_thing_factory_new_object_lookup_found = false;
	bool bridge_thing_factory_new_object_lookup_matches = false;
	bool bridge_thing_factory_new_object_body_ready = false;
	bool bridge_thing_factory_new_object_destroyed_before_process = false;
	bool bridge_thing_factory_new_object_lookup_after_destroy_null = false;
	ObjectID bridge_thing_factory_new_object_id = INVALID_ID;
	UnsignedInt bridge_thing_factory_new_object_count_before = 0;
	UnsignedInt bridge_thing_factory_new_object_count_after_create = 0;
	UnsignedInt bridge_thing_factory_new_object_count_after_destroy = 0;
	bool bridge_thing_factory_new_drawable_scope_ready = false;
	bool bridge_thing_factory_new_drawable_template_found = false;
	bool bridge_thing_factory_new_drawable_invoked = false;
	bool bridge_thing_factory_new_drawable_exception = false;
	Int bridge_thing_factory_new_drawable_exception_code = 0;
	bool bridge_thing_factory_new_drawable_returned = false;
	bool bridge_thing_factory_new_drawable_lookup_found = false;
	bool bridge_thing_factory_new_drawable_lookup_matches = false;
	bool bridge_thing_factory_new_drawable_first_matches = false;
	bool bridge_thing_factory_new_drawable_draw_module_ready = false;
	bool bridge_thing_factory_new_drawable_destroy_invoked = false;
	bool bridge_thing_factory_new_drawable_lookup_after_destroy_null = false;
	DrawableID bridge_thing_factory_new_drawable_id = INVALID_DRAWABLE_ID;
	UnsignedInt bridge_thing_factory_new_drawable_count_before = 0;
	UnsignedInt bridge_thing_factory_new_drawable_count_after_create = 0;
	UnsignedInt bridge_thing_factory_new_drawable_count_after_destroy = 0;
	bool asset_manager_created = false;
	bool runtime_asset_system_installed = false;
	bool texture_file_factory_installed = false;
	bool models_file_exists = false;
	bool mesh_file_exists = false;
	bool tree_texture_file_exists = false;
	bool material_texture_file_exists = false;
	bool water_transparency_ready = false;
	bool shader_manager_initialized = false;
	bool render_object_created = false;
	bool render_object_initialized = false;
	bool road_buffer_installed = false;
	bool road_buffer_initialized = false;
	bool load_roads_invoked = false;
	bool road_scene_draw_flushed = false;
	bool tree_buffer_installed = false;
	bool tree_data_configured = false;
	bool add_tree_invoked = false;
	bool update_tree_invoked = false;
	bool tree_scene_draw_flushed = false;
	bool tree_need_to_draw_after_center = false;
	bool tree_need_to_draw_after_scene = false;
	bool script_engine_ready = false;
	bool bridge_buffer_installed = false;
	bool bridge_buffer_initialized = false;
	bool load_bridges_invoked = false;
	bool update_center_invoked = false;
	bool terrain_logic_installed_for_draw = TheTerrainLogic == &bridge_draw_terrain_logic;
	bool terrain_logic_retained_for_draw = false;
	bool bridge_logic_seeded_for_draw = false;
	bool bridge_logic_generic_bridge_object_missing = false;
	bool bridge_logic_seed_info_available = false;
	bool bridge_logic_ai_pathfinder_available = TheAI != nullptr && TheAI->pathfinder() != nullptr;
	bool scene_created = false;
	bool scene_object_added = false;
	bool bridge_scene_draw_flushed = false;
	Int bridges_after_load = -1;
	Int bridge_logic_count_after_seed = 0;
	Int bridge_logic_first_index_after_seed = -1;
	Int bridge_logic_first_damage_state_after_seed = -1;
	bool bridge_logic_object_lookup_invoked = false;
	ProbeTerrainLogicForBridgeDraw::BridgeObjectLookupForProbe
		bridge_logic_object_lookup;
	Int bridge_logic_first_body_damage_state_after_seed = -1;
	float bridge_logic_first_body_health_after_seed = -1.0f;
	float bridge_logic_first_body_max_health_after_seed = -1.0f;
	bool bridge_logic_attempt_damage_invoked = false;
	bool bridge_logic_attempt_damage_changed_state = false;
	float bridge_logic_attempt_damage_actual_dealt = -1.0f;
	float bridge_logic_attempt_damage_actual_clipped = -1.0f;
	bool bridge_logic_attempt_damage_no_effect = false;
	Int bridge_logic_body_damage_state_after_attempt_damage = -1;
	float bridge_logic_body_health_after_attempt_damage = -1.0f;
	float bridge_logic_body_max_health_after_attempt_damage = -1.0f;
	Int bridge_logic_damage_state_after_attempt_update = -1;
	bool bridge_logic_damage_state_changed_after_attempt_update = false;
	bool bridge_logic_broken_after_attempt_update = false;
	bool bridge_logic_repaired_after_attempt_update = false;
	bool bridge_logic_kill_invoked = false;
	bool bridge_logic_kill_object_still_present = false;
	bool bridge_logic_kill_destroyed_status = false;
	Int bridge_logic_body_damage_state_after_kill = -1;
	float bridge_logic_body_health_after_kill = -1.0f;
	float bridge_logic_body_max_health_after_kill = -1.0f;
	Int bridge_logic_damage_state_after_kill_update = -1;
	bool bridge_logic_damage_state_changed_after_kill_update = false;
	bool bridge_logic_broken_after_kill_update = false;
	bool bridge_logic_repaired_after_kill_update = false;
	bool bridge_logic_sole_healing_invoked = false;
	bool bridge_logic_sole_healing_null_source_accepted = false;
	bool bridge_logic_sole_healing_first_accepted = false;
	bool bridge_logic_sole_healing_repeat_accepted = false;
	bool bridge_logic_sole_healing_benefactor_matches_bridge = false;
	bool bridge_logic_sole_healing_object_still_present = false;
	bool bridge_logic_sole_healing_destroyed_status = false;
	Int bridge_logic_body_damage_state_after_sole_healing = -1;
	float bridge_logic_body_health_after_sole_healing = -1.0f;
	float bridge_logic_body_max_health_after_sole_healing = -1.0f;
	Int bridge_logic_damage_state_after_sole_healing_update = -1;
	bool bridge_logic_damage_state_changed_after_sole_healing_update = false;
	bool bridge_logic_broken_after_sole_healing_update = false;
	bool bridge_logic_repaired_after_sole_healing_update = false;
	bool bridge_logic_disabled_timer_invoked = false;
	ProbeTerrainLogicForBridgeDraw::BridgeDisabledTimerForProbe
		bridge_logic_disabled_timer;
	bool bridge_logic_invulnerable_state_invoked = false;
	ProbeTerrainLogicForBridgeDraw::BridgeInvulnerableStateForProbe
		bridge_logic_invulnerable_state;
	Int bridge_draw_first_damage_state_after_invulnerable_state_scene = -1;
	ProbeW3DBridgeBuffer::BridgeDamageSyncProbe bridge_draw_damage_sync;
	bool bridge_logic_destroy_list_invoked = false;
	ProbeTerrainLogicForBridgeDraw::BridgeDestroyListForProbe
		bridge_logic_destroy_list;
	Int bridge_logic_first_layer_after_seed = -1;
	bool bridge_logic_pathfinder_map_invoked = false;
	ProbeTerrainLogicForBridgeDraw::BridgePathfinderMapForProbe
		bridge_logic_pathfinder_map;
	Int bridge_draw_terrain_logic_bridge_count = 0;
	Int bridge_draw_enabled_bridge_count = 0;
	Int bridge_object_ini_file_count = -1;
	Int roads_after_load = -1;
	Int road_segments_with_vertices = -1;
	Int road_types_with_textures = -1;
	Int road_types_with_draw_data = -1;
	Int total_road_type_vertices = -1;
	Int total_road_type_indices = -1;
	Int tree_tiles_after_scene = -1;
	Int bridge_vertices_after_update = -1;
	Int bridge_indices_after_update = -1;
	Int bridge_manual_vertices_after_load = -1;
	Int bridge_manual_indices_after_load = -1;
	bool bridge_manual_geometry_after_load = false;
	bool bridge_manual_geometry_exception = false;
	float bridge_center_x = 0.0f;
	float bridge_center_y = 0.0f;
	float bridge_center_z = 0.0f;
	float bridge_length_xy = 0.0f;
	float tree_location_x = 0.0f;
	float tree_location_y = 0.0f;
	float tree_location_z = 0.0f;
	float camera_eye_x = 0.0f;
	float camera_eye_y = 0.0f;
	float camera_eye_z = 0.0f;
	float camera_target_x = 0.0f;
	float camera_target_y = 0.0f;
	float camera_target_z = 0.0f;
	bool logical_map_stream_open = false;
	bool logical_map_parsed = false;
	bool logical_map_parse_exception = false;
	bool bridge_pair_candidate_selected = false;
	bool bridge_pair_map_objects_installed = false;
	bool logical_map_objects_used = false;
	bool bridge_pair_template_substituted_in_logical_list = false;
	Int bridge_pair_candidate_count = 0;
	Int selected_bridge_pair_candidate = -1;
	Int selected_bridge_pair_source_cells = 0;
	Int bridge_pair_candidates_with_source = 0;
	Int bridge_pair_candidates_with_model = 0;
	Int bridge_pair_candidates_with_texture = 0;
	Int bridge_pair_candidates_with_assets = 0;
	Int bridge_pair_candidates_with_assets_and_source = 0;
	bool selected_bridge_pair_model_available = false;
	bool selected_bridge_pair_texture_available = false;
	bool bridge_template_substituted = false;
	std::string selected_bridge_original_name;
	std::string selected_bridge_installed_name;
	std::string bridge_generic_bridge_template_error_message;
	std::string bridge_pair_candidate_summaries_json = "[]";
	std::vector<ProbeBridgePairCandidate> bridge_pair_candidates;
	ProbeLogicalMapObjectLoadMetrics logical_terrain_map_objects;
	ProbeBridgeAssetDiagnostics bridge_asset_diagnostics;

	ProbeTerrainMapPatchLoad map_load;
	ProbeTerrainArchiveContext archive_context;
	archive_context_ready = archive_context.prepare(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load,
		bridge_map_entry);
	if (archive_context_ready) {
		runtime_archive_set_loaded_for_selection =
			archive_context.loadRuntimeArchiveSet(
				runtime_archive_directory,
				runtime_archive_mask);
	}
	WorldHeightMap *map = nullptr;
	if (archive_context_ready && map_load.roadsIniParsed) {
		WorldHeightMap::freeListOfMapObjects();
		CachedFileInputStream stream;
		map_load.mapStreamOpen = stream.open(AsciiString(bridge_map_entry));
		if (map_load.mapStreamOpen) {
			try {
				map_load.map = NEW WorldHeightMap(&stream);
				map = map_load.map;
				map_created = map != nullptr;
				map_load.mapParsed = map_created;
				if (map_created) {
					record_parsed_map_metrics(map_load);
				}
			} catch (...) {
				map_load.mapParseException = true;
				REF_PTR_RELEASE(map_load.map);
				map = nullptr;
			}
			stream.close();
		}
	}
	if (map_created) {
		probe_bridge_phase_log("load-logical-bridge-map-objects");
		logical_terrain_map_objects =
			load_probe_logical_terrain_map_objects(
				bridge_map_entry,
				archive_context.terrainRoads());
		logical_map_stream_open = logical_terrain_map_objects.loadReturned;
		logical_map_parse_exception = logical_terrain_map_objects.loadException;
		if (logical_terrain_map_objects.loadReturned) {
			collect_probe_bridge_pairs_from_map_objects(
				archive_context.terrainRoads(),
				bridge_pair_candidates);
			logical_map_parsed = !bridge_pair_candidates.empty();
			logical_map_objects_used =
				logical_terrain_map_objects.mapObjectsPresentAfterLoad;
		}
	}
	bridge_pair_candidate_count =
		static_cast<Int>(std::min<std::size_t>(
			bridge_pair_candidates.size(),
			static_cast<std::size_t>(2147483647)));

	if (map_created) {
		ProbeWorldHeightMapInspector::recordTextureClassLoadMetrics(
			map,
			archive_context.terrainTypes(),
			archive_context.fileSystem(),
			map_load);
	}

	if (map_created && logical_map_parsed) {
		probe_bridge_phase_log("select-bridge-pair");
		bridge_pair_candidate_selected =
			select_probe_bridge_pair_for_loaded_patch(
				map,
				map_load,
				bridge_pair_candidates,
				archive_context.terrainRoads(),
				archive_context.fileSystem(),
				selected_bridge_pair_candidate,
				selected_bridge_pair_source_cells);
		if (bridge_pair_candidate_selected) {
			for (const ProbeBridgePairCandidate &candidate : bridge_pair_candidates) {
				if (candidate.loadedSourceCells > 0) {
					++bridge_pair_candidates_with_source;
				}
				if (candidate.modelAvailable) {
					++bridge_pair_candidates_with_model;
				}
				if (candidate.textureAvailable) {
					++bridge_pair_candidates_with_texture;
				}
				if (candidate.modelAvailable && candidate.textureAvailable) {
					++bridge_pair_candidates_with_assets;
				}
				if (candidate.modelAvailable &&
						candidate.textureAvailable &&
						candidate.loadedSourceCells > 0) {
					++bridge_pair_candidates_with_assets_and_source;
				}
			}
			const ProbeBridgePairCandidate &selected =
				bridge_pair_candidates[
					static_cast<std::size_t>(selected_bridge_pair_candidate)];
			selected_bridge_pair_model_available = selected.modelAvailable;
			selected_bridge_pair_texture_available = selected.textureAvailable;
			bridge_pair_candidate_summaries_json =
				probe_bridge_pair_candidate_summary_json(
					bridge_pair_candidates,
					archive_context.terrainRoads(),
					selected_bridge_pair_candidate);
			selected_bridge_original_name = selected.first.name.str();
			ProbeBridgePairCandidate installed = selected;
			if (!selected_bridge_pair_model_available ||
					!selected_bridge_pair_texture_available) {
				probe_bridge_phase_log("select-loadable-bridge-fallback");
				AsciiString fallback_bridge_name =
					probe_first_loadable_bridge_name(
						archive_context.terrainRoads(),
						archive_context.fileSystem());
				if (!fallback_bridge_name.isEmpty()) {
					installed.first.name = fallback_bridge_name;
					installed.second.name = fallback_bridge_name;
					selected_bridge_installed_name = fallback_bridge_name.str();
					selected_bridge_pair_model_available =
						probe_bridge_model_available(
							archive_context.terrainRoads(),
							archive_context.fileSystem(),
							fallback_bridge_name);
					selected_bridge_pair_texture_available =
						probe_bridge_texture_available(
							archive_context.terrainRoads(),
							archive_context.fileSystem(),
							fallback_bridge_name);
					bridge_template_substituted =
						selected_bridge_installed_name != selected_bridge_original_name;
				}
			} else {
				selected_bridge_installed_name = selected_bridge_original_name;
			}
			if (bridge_template_substituted &&
					installed.firstMapObject != nullptr &&
					installed.secondMapObject != nullptr) {
				probe_bridge_phase_log("substitute-logical-bridge-template");
				installed.firstMapObject->setName(installed.first.name);
				installed.secondMapObject->setName(installed.second.name);
				bridge_pair_template_substituted_in_logical_list = true;
			}
			bridge_center_x = (selected.first.location.x + selected.second.location.x) * 0.5f;
			bridge_center_y = (selected.first.location.y + selected.second.location.y) * 0.5f;
			const float bridge_delta_x = selected.second.location.x - selected.first.location.x;
			const float bridge_delta_y = selected.second.location.y - selected.first.location.y;
			bridge_length_xy = std::sqrt(bridge_delta_x * bridge_delta_x + bridge_delta_y * bridge_delta_y);
			probe_bridge_metric_log(
				"selected",
				selected_bridge_original_name,
				selected_bridge_installed_name,
				bridge_length_xy,
				0,
				0);
		}
	}

	ProbeMapBridgeObjectMetrics bridge_object_metrics =
		inspect_map_bridge_objects(archive_context.terrainRoads());
	if (map_created && bridge_object_metrics.bridgePairs > 0) {
		if (!bridge_pair_candidate_selected) {
			bridge_center_x =
				(bridge_object_metrics.firstBridgeX + bridge_object_metrics.secondBridgeX) * 0.5f;
			bridge_center_y =
				(bridge_object_metrics.firstBridgeY + bridge_object_metrics.secondBridgeY) * 0.5f;
		}
		record_patch_height_metrics(map_load);
	}

	if (map_created) {
		global_data = NEW GlobalData;
		if (global_data != nullptr) {
			configure_global_data(*global_data, true);
			global_data->m_maxRoadSegments = 4000;
			global_data->m_maxRoadVertex = 3000;
			global_data->m_maxRoadIndex = 5000;
			global_data->m_maxRoadTypes = 100;
			TheWritableGlobalData = global_data;
			global_data_ready = true;
		}
	}
	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	ProbeHeightMapRenderObjWithBridgeBuffer *render_object = nullptr;
	ProbeW3DRoadBuffer *road_buffer = nullptr;
	W3DTreeBuffer *tree_buffer = nullptr;
	ProbeW3DBridgeBuffer *bridge_buffer = nullptr;
	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;
	WW3DAssetManager *asset_manager = nullptr;
	ProbeTreeDrawModuleDataScope tree_data_scope;
	W3DTreeDrawModuleData *tree_data = tree_data_scope.data();

	if (global_data_ready) {
		probe_bridge_phase_log("ww3d-init");
		init_result = WW3D::Init(nullptr, nullptr, false);
	}
	if (succeeded(init_result)) {
		probe_bridge_phase_log("asset-manager");
		asset_manager = W3DNEW W3DAssetManager();
		asset_manager_created = asset_manager != nullptr;
	}
	if (asset_manager != nullptr) {
		asset_manager->Set_WW3D_Load_On_Demand(true);
	}
	if (asset_manager_created) {
		probe_bridge_phase_log("set-render-device");
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		probe_bridge_phase_log("install-runtime-assets");
		WW3D::Set_Thumbnail_Enabled(false);
		W3DShaderManager::init();
		shader_manager_initialized = true;

		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_set(runtime_archive_directory, runtime_archive_mask);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		models_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeModelsArchiveEntry);
		mesh_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeMeshArchiveEntry);
		tree_texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeTextureArchiveEntry);
		material_texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kTreeMaterialTextureArchiveEntry);
	}

	if (runtime_asset_system_installed && texture_file_factory_installed) {
		probe_bridge_phase_log("asset-manager-bridge-diagnostics");
		const std::string diagnostics_bridge_name =
			!selected_bridge_installed_name.empty() ?
				selected_bridge_installed_name :
				selected_bridge_original_name;
		bridge_asset_diagnostics =
			probe_bridge_asset_runtime_diagnostics(
				asset_manager,
				archive_context.terrainRoads(),
				archive_context.fileSystem(),
				diagnostics_bridge_name);
	}

	if (succeeded(set_device_result) &&
			map_created &&
			logical_map_objects_used &&
			bridge_object_metrics.bridgePairs > 0) {
		probe_bridge_phase_log("init-height-data");
		if (old_water_transparency != nullptr) {
			water_transparency_ready = true;
		} else {
			probe_water_transparency = newInstance(WaterTransparencySetting);
			TheWaterTransparency = probe_water_transparency;
			water_transparency_ready = probe_water_transparency != nullptr;
		}

		map->setDrawWidth(kMapPatchVertices);
		map->setDrawHeight(kMapPatchVertices);
		map->setDrawOrg(map_load.patchOriginX, map_load.patchOriginY);

		render_object = NEW_REF(ProbeHeightMapRenderObjWithBridgeBuffer, ());
		render_object_created = render_object != nullptr;
		if (render_object_created) {
			Matrix3D terrain_transform(true);
			render_object->Set_Transform(terrain_transform);
			TheTerrainRenderObject = render_object;
			init_height_data_result = render_object->initHeightData(
				map->getDrawWidth(),
				map->getDrawHeight(),
				map,
				nullptr,
				TRUE);
			render_object_initialized = init_height_data_result == 0;
			if (render_object_initialized && render_object->getShroud() != nullptr) {
				render_object->getShroud()->fillShroudData(96);
				render_object->getShroud()->setShroudFilter(FALSE);
			}
		}
	}

	if (water_transparency_ready && render_object_initialized) {
		probe_bridge_phase_log("install-road-buffer");
		road_buffer = render_object->installProbeRoadBuffer(map);
		road_buffer_installed = road_buffer != nullptr;
		road_buffer_initialized = road_buffer_installed && road_buffer->initialized();
		probe_bridge_phase_log("install-tree-buffer");
		tree_buffer = render_object->installProbeTreeBuffer();
		tree_buffer_installed = tree_buffer != nullptr;
		probe_bridge_phase_log("install-bridge-buffer");
		bridge_buffer = render_object->installProbeBridgeBuffer();
		bridge_buffer_installed = bridge_buffer != nullptr;
		bridge_buffer_initialized = bridge_buffer_installed && bridge_buffer->initialized();
	}

	if (road_buffer_initialized) {
		probe_bridge_phase_log("load-roads");
		road_buffer->loadRoads();
		load_roads_invoked = true;
		roads_after_load = road_buffer->numRoads();
		road_segments_with_vertices = road_buffer->roadSegmentsWithVertices();
		road_types_with_textures = road_buffer->roadTypesWithTextures();
		probe_bridge_phase_log("load-roads-done");
	}

	if (tree_buffer_installed && mesh_file_exists && tree_texture_file_exists) {
		probe_bridge_phase_log("tree-buffer-add-tree");
		tree_data_configured = tree_data != nullptr;
		tree_location_x = bridge_center_x + 64.0f;
		tree_location_y = bridge_center_y + 64.0f;
		tree_location_z = static_cast<float>(map_load.patchCenterHeight) * MAP_HEIGHT_SCALE + 2.0f;

		Coord3D location;
		location.set(tree_location_x, tree_location_y, tree_location_z);
		render_object->addTree(kTreeProbeId, location, 1.0f, 0.0f, 0.0f, tree_data);
		probe_bridge_phase_log("tree-buffer-add-tree-done");
		add_tree_invoked = true;
		probe_bridge_phase_log("tree-buffer-update-tree");
		update_tree_invoked = render_object->updateTreePosition(kTreeProbeId, location, 0.0f);
		probe_bridge_phase_log("tree-buffer-update-tree-done");
	}

	if (bridge_buffer_initialized && TheNameKeyGenerator != nullptr) {
		probe_bridge_phase_log("object-runtime-setup");
		TheFontLibrary = &bridge_drawable_font_library;
		TheDisplayStringManager = &bridge_drawable_display_string_manager;
		TheGlobalLanguageData = &bridge_drawable_global_language;
		bridge_drawable_globals_installed = true;

		TheModuleFactory = &bridge_draw_module_factory;
		TheAudio = &bridge_draw_audio;

		TheGameLogic = &bridge_draw_game_logic;
		bridge_draw_game_logic.setObjectIDCounter(static_cast<ObjectID>(1));
		bridge_game_logic_ready = TheGameLogic == &bridge_draw_game_logic;

		ThePlayerList = &bridge_draw_player_list;
		bridge_player_list_ready =
			ThePlayerList == &bridge_draw_player_list &&
			bridge_draw_player_list.getNeutralPlayer() != nullptr;

		TheRadar = &bridge_draw_radar;
		bridge_radar_ready = TheRadar == &bridge_draw_radar;

		TheGhostObjectManager = &bridge_draw_ghost_object_manager;

		ThePartitionManager = &bridge_draw_partition_manager;
		bridge_draw_partition_manager.init();
		bridge_partition_ready = ThePartitionManager == &bridge_draw_partition_manager;

		TheFXListStore = &bridge_draw_fx_list_store;
		bridge_draw_fx_list_store.init();
		TheDamageFXStore = &bridge_draw_damage_fx_store;
		bridge_draw_damage_fx_store.init();
		TheArmorStore = &bridge_draw_armor_store;
		bridge_draw_armor_store.init();

		LocalFileSystem *runtime_local_file_system = TheLocalFileSystem;
		ArchiveFileSystem *runtime_archive_file_system = TheArchiveFileSystem;
		FileSystem *runtime_file_system = TheFileSystem;
		archive_context.activateGlobals();
		bridge_draw_module_factory.init();
		bridge_module_factory_ready = TheModuleFactory == &bridge_draw_module_factory;

		FileInfo damage_fx_info = {};
		bridge_damage_fx_entry_available =
			TheFileSystem != nullptr &&
			TheFileSystem->getFileInfo(AsciiString(kArchiveDamageFXIniEntry), &damage_fx_info) &&
			damage_fx_info.sizeHigh == 0 &&
			damage_fx_info.sizeLow > 0;
		FileInfo armor_info = {};
		bridge_armor_entry_available =
			TheFileSystem != nullptr &&
			TheFileSystem->getFileInfo(AsciiString(kArchiveArmorIniEntry), &armor_info) &&
			armor_info.sizeHigh == 0 &&
			armor_info.sizeLow > 0;
		FilenameList object_ini_files;
		if (TheFileSystem != nullptr) {
			TheFileSystem->getFileListInDirectory(
				AsciiString(kArchiveObjectIniDirectory),
				"*.ini",
				object_ini_files,
				TRUE);
			bridge_object_ini_file_count =
				static_cast<Int>(std::min<std::size_t>(
					object_ini_files.size(),
					static_cast<std::size_t>(2147483647)));
		}

		try {
			initDamageTypeFlags();
			INI damage_fx_ini;
			damage_fx_ini.load(AsciiString(kArchiveDamageFXIniEntry), INI_LOAD_OVERWRITE, nullptr);
			bridge_damage_fx_ready =
				TheDamageFXStore->findDamageFX(AsciiString("StructureDamageFX")) != nullptr;
		} catch (...) {
			bridge_damage_fx_load_exception = true;
			bridge_damage_fx_ready = false;
		}

		try {
			INI armor_ini;
			armor_ini.load(AsciiString(kArchiveArmorIniEntry), INI_LOAD_OVERWRITE, nullptr);
			bridge_armor_ready =
				TheArmorStore->findArmorTemplate(AsciiString("StructureArmor")) != nullptr;
		} catch (...) {
			bridge_armor_load_exception = true;
			bridge_armor_ready = false;
		}

		try {
			bridge_draw_thing_factory.init();
			bridge_generic_bridge_template_loaded =
				probe_load_generic_bridge_template_from_archives(
					archive_context.fileSystem(),
					&bridge_generic_bridge_template_error_code,
					&bridge_generic_bridge_template_error_message);
		} catch (...) {
			bridge_generic_bridge_template_load_exception = true;
			bridge_generic_bridge_template_loaded = false;
		}

		TheLocalFileSystem = runtime_local_file_system;
		TheArchiveFileSystem = runtime_archive_file_system;
		TheFileSystem = runtime_file_system;
	}

	if (bridge_buffer_initialized &&
			bridge_module_factory_ready &&
			bridge_game_logic_ready &&
			bridge_player_list_ready &&
			bridge_radar_ready &&
			bridge_damage_fx_ready &&
			bridge_armor_ready &&
			bridge_generic_bridge_template_loaded &&
			bridge_partition_ready) {
		ProbeNoopScriptEngineScope bridge_object_script_engine_scope;
		bridge_object_script_engine_ready = bridge_object_script_engine_scope.installed();
		const ThingTemplate *direct_generic_bridge_template = nullptr;
		if (bridge_object_script_engine_ready) {
			direct_generic_bridge_template =
				bridge_draw_thing_factory.findTemplate(
					AsciiString("GenericBridge"),
					FALSE);
			bridge_thing_factory_new_object_template_found =
				direct_generic_bridge_template != nullptr;
		}
		if (direct_generic_bridge_template != nullptr) {
			probe_bridge_phase_log("new-object");
			bridge_thing_factory_new_object_invoked = true;
			bridge_thing_factory_new_object_count_before =
				bridge_draw_game_logic.getObjectCount();
			Object *direct_bridge_object = nullptr;
			try {
				direct_bridge_object =
					bridge_draw_thing_factory.newObject(
						direct_generic_bridge_template,
						nullptr);
			} catch (...) {
				bridge_thing_factory_new_object_exception = true;
			}
			probe_bridge_phase_log("new-object-done");
			bridge_thing_factory_new_object_returned =
				direct_bridge_object != nullptr;
			if (direct_bridge_object != nullptr) {
				bridge_thing_factory_new_object_id =
					direct_bridge_object->getID();
				Object *direct_bridge_lookup =
					TheGameLogic != nullptr ?
						TheGameLogic->findObjectByID(
							bridge_thing_factory_new_object_id) :
						nullptr;
				bridge_thing_factory_new_object_lookup_found =
					direct_bridge_lookup != nullptr;
				bridge_thing_factory_new_object_lookup_matches =
					direct_bridge_lookup == direct_bridge_object;
				bridge_thing_factory_new_object_body_ready =
					direct_bridge_object->getBodyModule() != nullptr;
				bridge_thing_factory_new_object_count_after_create =
					bridge_draw_game_logic.getObjectCount();
				probe_bridge_phase_log("destroy-temp-object");
				bridge_draw_game_logic.destroyObject(direct_bridge_object);
				bridge_thing_factory_new_object_destroyed_before_process =
					direct_bridge_object->isDestroyed();
				bridge_draw_game_logic.cncPortProcessDestroyListForProbe();
				probe_bridge_phase_log("destroy-temp-object-done");
				bridge_thing_factory_new_object_count_after_destroy =
					bridge_draw_game_logic.getObjectCount();
				bridge_thing_factory_new_object_lookup_after_destroy_null =
					TheGameLogic != nullptr &&
					TheGameLogic->findObjectByID(
						bridge_thing_factory_new_object_id) == nullptr;
			}
		}
		if (direct_generic_bridge_template != nullptr) {
			bridge_thing_factory_new_drawable_template_found = true;
			FontLibrary *old_font_library = TheFontLibrary;
			DisplayStringManager *old_display_string_manager = TheDisplayStringManager;
			GlobalLanguage *old_global_language = TheGlobalLanguageData;
			{
				ProbeTerrainDrawableFontLibrary drawable_font_library;
				ProbeTerrainDrawableDisplayStringManager drawable_display_string_manager;
				GlobalLanguage drawable_global_language;
				TheFontLibrary = &drawable_font_library;
				TheDisplayStringManager = &drawable_display_string_manager;
				TheGlobalLanguageData = &drawable_global_language;
				bridge_thing_factory_new_drawable_scope_ready =
					TheGameClient == &bridge_draw_game_client &&
					TheFontLibrary == &drawable_font_library &&
					TheDisplayStringManager == &drawable_display_string_manager &&
					TheGlobalLanguageData == &drawable_global_language;

				Drawable *direct_bridge_drawable = nullptr;
				bridge_thing_factory_new_drawable_invoked = true;
				bridge_thing_factory_new_drawable_count_before =
					bridge_draw_game_client.drawableCountForProbe();
				probe_bridge_phase_log("new-drawable");
				try {
					direct_bridge_drawable =
						bridge_draw_thing_factory.newDrawable(
							direct_generic_bridge_template,
							DRAWABLE_STATUS_NONE);
				} catch (ErrorCode error) {
					bridge_thing_factory_new_drawable_exception = true;
					bridge_thing_factory_new_drawable_exception_code =
						static_cast<Int>(error);
				} catch (int error) {
					bridge_thing_factory_new_drawable_exception = true;
					bridge_thing_factory_new_drawable_exception_code =
						static_cast<Int>(error);
				} catch (...) {
					bridge_thing_factory_new_drawable_exception = true;
					bridge_thing_factory_new_drawable_exception_code = -1;
				}
				probe_bridge_phase_log("new-drawable-done");
				bridge_thing_factory_new_drawable_returned =
					direct_bridge_drawable != nullptr;
				if (direct_bridge_drawable != nullptr) {
					bridge_thing_factory_new_drawable_id =
						direct_bridge_drawable->getID();
					Drawable *direct_drawable_lookup =
						bridge_draw_game_client.findDrawableByID(
							bridge_thing_factory_new_drawable_id);
					bridge_thing_factory_new_drawable_lookup_found =
						direct_drawable_lookup != nullptr;
					bridge_thing_factory_new_drawable_lookup_matches =
						direct_drawable_lookup == direct_bridge_drawable;
					bridge_thing_factory_new_drawable_first_matches =
						bridge_draw_game_client.firstDrawable() ==
						direct_bridge_drawable;
					DrawModule **draw_modules =
						direct_bridge_drawable->getDrawModulesNonDirty();
					bridge_thing_factory_new_drawable_draw_module_ready =
						draw_modules != nullptr && draw_modules[0] != nullptr;
					bridge_thing_factory_new_drawable_count_after_create =
						bridge_draw_game_client.drawableCountForProbe();
					probe_bridge_phase_log("destroy-temp-drawable");
					bridge_draw_game_client.destroyDrawable(direct_bridge_drawable);
					bridge_thing_factory_new_drawable_destroy_invoked = true;
					bridge_thing_factory_new_drawable_count_after_destroy =
						bridge_draw_game_client.drawableCountForProbe();
					bridge_thing_factory_new_drawable_lookup_after_destroy_null =
						bridge_draw_game_client.findDrawableByID(
							bridge_thing_factory_new_drawable_id) == nullptr;
					probe_bridge_phase_log("destroy-temp-drawable-done");
				}
			}
			TheGlobalLanguageData = old_global_language;
			TheDisplayStringManager = old_display_string_manager;
			TheFontLibrary = old_font_library;
		}
		probe_bridge_phase_log("load-bridges");
		bridge_buffer->loadBridges(&bridge_draw_terrain_logic, FALSE);
		probe_bridge_phase_log("load-bridges-done");
		load_bridges_invoked = true;
		bridges_after_load = bridge_buffer->numBridges();
		BridgeInfo bridge_info_for_logic;
		bridge_logic_seed_info_available = bridge_buffer->firstBridgeInfo(bridge_info_for_logic);
		bridge_logic_count_after_seed =
			bridge_draw_terrain_logic.bridgeCountForProbe();
		bridge_logic_seeded_for_draw = bridge_logic_count_after_seed > 0;
		BridgeInfo loaded_bridge_info;
		PathfindLayerEnum loaded_bridge_layer = LAYER_GROUND;
		if (bridge_draw_terrain_logic.firstBridgeForProbe(
				loaded_bridge_info,
				loaded_bridge_layer)) {
			bridge_logic_first_index_after_seed = loaded_bridge_info.bridgeIndex;
			bridge_logic_first_damage_state_after_seed = loaded_bridge_info.curDamageState;
			bridge_logic_first_layer_after_seed = loaded_bridge_layer;
			bridge_logic_generic_bridge_object_missing =
				loaded_bridge_info.bridgeObjectID == INVALID_ID;
		}
		bridge_logic_pathfinder_map_invoked =
			bridge_draw_terrain_logic.exerciseFirstBridgePathfinderMapForProbe(
				bridge_logic_pathfinder_map);
		probe_bridge_phase_log("bridge-object-lookup");
		bridge_logic_object_lookup_invoked =
			bridge_draw_terrain_logic.verifyFirstBridgeObjectLookupForProbe(
				bridge_logic_object_lookup);
		probe_bridge_phase_log("bridge-object-lookup-done");
		BodyDamageType first_body_state = BODY_PRISTINE;
		Real first_body_health = -1.0f;
		Real first_body_max_health = -1.0f;
		probe_bridge_phase_log("bridge-body-state");
		if (bridge_draw_terrain_logic.firstBridgeBodyDamageStateForProbe(
				first_body_state,
				first_body_health,
				first_body_max_health)) {
			bridge_logic_first_body_damage_state_after_seed = first_body_state;
			bridge_logic_first_body_health_after_seed = first_body_health;
			bridge_logic_first_body_max_health_after_seed = first_body_max_health;
		}
		probe_bridge_phase_log("bridge-body-state-done");
		ProbeTerrainLogicForBridgeDraw::BridgeDamageAttemptForProbe damaged_body_attempt;
		probe_bridge_phase_log("bridge-attempt-damage");
		if (bridge_draw_terrain_logic.attemptFirstBridgeDamageForProbe(
				1.0f,
				damaged_body_attempt)) {
			bridge_logic_attempt_damage_invoked = true;
			bridge_logic_body_damage_state_after_attempt_damage =
				damaged_body_attempt.state;
			bridge_logic_body_health_after_attempt_damage =
				damaged_body_attempt.health;
			bridge_logic_body_max_health_after_attempt_damage =
				damaged_body_attempt.maxHealth;
			bridge_logic_attempt_damage_actual_dealt =
				damaged_body_attempt.actualDamageDealt;
			bridge_logic_attempt_damage_actual_clipped =
				damaged_body_attempt.actualDamageClipped;
			bridge_logic_attempt_damage_no_effect =
				damaged_body_attempt.noEffect;
			bridge_logic_attempt_damage_changed_state =
				damaged_body_attempt.state != BODY_PRISTINE;
		}
		probe_bridge_phase_log("bridge-attempt-damage-done");
		BridgeInfo damaged_bridge_info;
		PathfindLayerEnum damaged_bridge_layer = LAYER_GROUND;
		bool damaged_bridge_broken = false;
		bool damaged_bridge_repaired = false;
		probe_bridge_phase_log("bridge-damage-update");
		if (bridge_draw_terrain_logic.updateFirstBridgeDamageStateForProbe(
				damaged_bridge_info,
				damaged_bridge_layer,
				damaged_bridge_broken,
				damaged_bridge_repaired)) {
			bridge_logic_damage_state_after_attempt_update =
				damaged_bridge_info.curDamageState;
			bridge_logic_damage_state_changed_after_attempt_update =
				damaged_bridge_info.damageStateChanged;
			bridge_logic_broken_after_attempt_update = damaged_bridge_broken;
			bridge_logic_repaired_after_attempt_update = damaged_bridge_repaired;
		}
		probe_bridge_phase_log("bridge-damage-update-done");
		ProbeTerrainLogicForBridgeDraw::BridgeDamageAttemptForProbe killed_body_attempt;
		probe_bridge_phase_log("bridge-kill");
		if (bridge_draw_terrain_logic.killFirstBridgeForProbe(killed_body_attempt)) {
			bridge_logic_kill_invoked = true;
			bridge_logic_kill_object_still_present =
				killed_body_attempt.objectStillPresent;
			bridge_logic_kill_destroyed_status =
				killed_body_attempt.destroyedStatus;
			bridge_logic_body_damage_state_after_kill =
				killed_body_attempt.state;
			bridge_logic_body_health_after_kill =
				killed_body_attempt.health;
			bridge_logic_body_max_health_after_kill =
				killed_body_attempt.maxHealth;
		}
		probe_bridge_phase_log("bridge-kill-done");
		BridgeInfo killed_bridge_info;
		PathfindLayerEnum killed_bridge_layer = LAYER_GROUND;
		bool killed_bridge_broken = false;
		bool killed_bridge_repaired = false;
		probe_bridge_phase_log("bridge-kill-update");
		if (bridge_draw_terrain_logic.updateFirstBridgeDamageStateForProbe(
				killed_bridge_info,
				killed_bridge_layer,
				killed_bridge_broken,
				killed_bridge_repaired)) {
			bridge_logic_damage_state_after_kill_update =
				killed_bridge_info.curDamageState;
			bridge_logic_damage_state_changed_after_kill_update =
				killed_bridge_info.damageStateChanged;
			bridge_logic_broken_after_kill_update = killed_bridge_broken;
			bridge_logic_repaired_after_kill_update = killed_bridge_repaired;
		}
		probe_bridge_phase_log("bridge-kill-update-done");
		ProbeTerrainLogicForBridgeDraw::BridgeDamageAttemptForProbe healed_body_attempt;
		Bool null_source_healing_accepted = FALSE;
		Bool first_healing_accepted = FALSE;
		Bool repeat_healing_accepted = FALSE;
		Bool healing_benefactor_matches_bridge = FALSE;
		probe_bridge_phase_log("bridge-pre-healing-destroy-list");
		bridge_draw_game_logic.cncPortProcessDestroyListForProbe();
		probe_bridge_phase_log("bridge-pre-healing-destroy-list-done");
		bridge_draw_game_logic.cncPortAdvanceFrameForProbe();
		probe_bridge_phase_log("bridge-sole-healing");
		if (bridge_draw_terrain_logic.attemptFirstBridgeSoleHealingForProbe(
				1.0f,
				5,
				null_source_healing_accepted,
				first_healing_accepted,
				repeat_healing_accepted,
				healing_benefactor_matches_bridge,
				healed_body_attempt)) {
			bridge_logic_sole_healing_invoked = true;
			bridge_logic_sole_healing_null_source_accepted =
				null_source_healing_accepted;
			bridge_logic_sole_healing_first_accepted =
				first_healing_accepted;
			bridge_logic_sole_healing_repeat_accepted =
				repeat_healing_accepted;
			bridge_logic_sole_healing_benefactor_matches_bridge =
				healing_benefactor_matches_bridge;
			bridge_logic_sole_healing_object_still_present =
				healed_body_attempt.objectStillPresent;
			bridge_logic_sole_healing_destroyed_status =
				healed_body_attempt.destroyedStatus;
			bridge_logic_body_damage_state_after_sole_healing =
				healed_body_attempt.state;
			bridge_logic_body_health_after_sole_healing =
				healed_body_attempt.health;
			bridge_logic_body_max_health_after_sole_healing =
				healed_body_attempt.maxHealth;
		}
		probe_bridge_phase_log("bridge-sole-healing-done");
		BridgeInfo healed_bridge_info;
		PathfindLayerEnum healed_bridge_layer = LAYER_GROUND;
		bool healed_bridge_broken = false;
		bool healed_bridge_repaired = false;
		probe_bridge_phase_log("bridge-healing-update");
		if (bridge_draw_terrain_logic.updateFirstBridgeDamageStateForProbe(
				healed_bridge_info,
				healed_bridge_layer,
				healed_bridge_broken,
				healed_bridge_repaired)) {
			bridge_logic_damage_state_after_sole_healing_update =
				healed_bridge_info.curDamageState;
			bridge_logic_damage_state_changed_after_sole_healing_update =
				healed_bridge_info.damageStateChanged;
			bridge_logic_broken_after_sole_healing_update = healed_bridge_broken;
			bridge_logic_repaired_after_sole_healing_update = healed_bridge_repaired;
		}
		probe_bridge_phase_log("bridge-healing-update-done");
		probe_bridge_phase_log("bridge-disabled-timer");
		bridge_logic_disabled_timer_invoked =
			bridge_draw_terrain_logic.exerciseFirstBridgeDisabledTimerForProbe(
				bridge_draw_game_logic,
				2,
				bridge_logic_disabled_timer);
		probe_bridge_phase_log("bridge-disabled-timer-done");
		probe_bridge_phase_log("bridge-invulnerable");
		bridge_logic_invulnerable_state_invoked =
			bridge_draw_terrain_logic.exerciseFirstBridgeInvulnerableStateForProbe(
				bridge_logic_invulnerable_state);
		probe_bridge_phase_log("bridge-invulnerable-done");
		probe_bridge_phase_log("bridge-manual-geometry");
		bridge_manual_geometry_after_load =
			bridge_buffer->firstBridgeManualGeometry(
				bridge_manual_vertices_after_load,
				bridge_manual_indices_after_load,
				bridge_manual_geometry_exception);
		probe_bridge_phase_log("bridge-manual-geometry-done");
		probe_bridge_metric_log(
			"after-load",
			selected_bridge_original_name,
			selected_bridge_installed_name,
			bridge_length_xy,
			bridges_after_load,
			bridge_manual_vertices_after_load);

		bridge_center_z = static_cast<float>(map_load.patchCenterHeight) * MAP_HEIGHT_SCALE + 60.0f;
		camera_target_x = bridge_center_x;
		camera_target_y = bridge_center_y;
		camera_target_z = bridge_center_z;
		camera_eye_x = bridge_center_x;
		camera_eye_y = bridge_center_y - 360.0f;
		camera_eye_z = bridge_center_z + 300.0f;

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, 5000.0f);
			Matrix3D camera_transform(true);
			camera_transform.Look_At(
				Vector3(camera_eye_x, camera_eye_y, camera_eye_z),
				Vector3(camera_target_x, camera_target_y, camera_target_z),
				0.0f);
			camera->Set_Transform(camera_transform);
		}
	}

	if (camera != nullptr && load_bridges_invoked) {
		probe_bridge_phase_log("update-center");
		if (bridge_buffer != nullptr) {
			bridge_buffer->doFullUpdate();
		}
		render_object->updateCenter(camera, nullptr);
		if (road_buffer != nullptr) {
			road_buffer->updateCenter();
		}
		if (bridge_buffer != nullptr) {
			bridge_buffer->updateCenter(camera, nullptr);
		}
		tree_need_to_draw_after_center = tree_buffer != nullptr && tree_buffer->needToDraw();
		probe_bridge_phase_log("update-center-done");
		update_center_invoked = true;
		bridge_vertices_after_update =
			bridge_buffer != nullptr ? bridge_buffer->curNumBridgeVertices() : -1;
		bridge_indices_after_update =
			bridge_buffer != nullptr ? bridge_buffer->curNumBridgeIndices() : -1;
		probe_bridge_metric_log(
			"after-update",
			selected_bridge_original_name,
			selected_bridge_installed_name,
			bridge_length_xy,
			bridge_vertices_after_update,
			bridge_indices_after_update);
	}

	if (camera != nullptr &&
			update_center_invoked &&
			bridge_vertices_after_update > 0 &&
			bridge_indices_after_update > 0) {
		scene = NEW_REF(RTS3DScene, ());
		scene_created = scene != nullptr;
		if (scene_created) {
			scene->Add_Render_Object(render_object);
			scene_object_added = render_object->Peek_Scene() == scene;
		}
	}

	{
		ProbeScriptEngineScope script_engine_scope;
		script_engine_ready = script_engine_scope.scriptEngine() != nullptr;
		if (scene_object_added && script_engine_ready) {
			probe_bridge_phase_log("render-scene");
			if (camera != nullptr && render_object != nullptr && render_object->getShroud() != nullptr) {
				BaseHeightMapRenderObjClass *saved_terrain_render_object = TheTerrainRenderObject;
				TheTerrainRenderObject = render_object;
				render_object->getShroud()->render(camera);
				TheTerrainRenderObject = saved_terrain_render_object;
			}
			if (bridge_buffer != nullptr) {
				probe_bridge_phase_log("bridge-damage-sync-prime");
				bridge_buffer->primeFirstBridgeDamageSyncForProbe(BODY_RUBBLE);
			}
			begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
			if (succeeded(begin_render_result)) {
				render_result = WW3D::Render(scene, camera);
				end_render_result = WW3D::End_Render(false);
			}
			if (succeeded(begin_render_result) &&
					succeeded(render_result) &&
					succeeded(end_render_result) &&
					bridge_buffer != nullptr) {
				bridge_draw_first_damage_state_after_invulnerable_state_scene =
					bridge_buffer->firstBridgeDamageState();
				bridge_draw_damage_sync =
					bridge_buffer->bridgeDamageSyncProbe();
			}
			tree_need_to_draw_after_scene = tree_buffer != nullptr && tree_buffer->needToDraw();
			tree_tiles_after_scene = tree_buffer != nullptr ? tree_buffer->getNumTiles() : -1;
			road_types_with_draw_data =
				road_buffer != nullptr ? road_buffer->roadTypesWithDrawData() : -1;
			total_road_type_vertices =
				road_buffer != nullptr ? road_buffer->totalRoadTypeVertices() : -1;
			total_road_type_indices =
				road_buffer != nullptr ? road_buffer->totalRoadTypeIndices() : -1;
			probe_bridge_phase_log("render-scene-done");
		}
	}
	if (bridge_buffer != nullptr) {
		terrain_logic_retained_for_draw =
			bridge_buffer->lastDrawTerrainLogicPresent();
		bridge_draw_terrain_logic_bridge_count =
			bridge_buffer->lastDrawTerrainLogicBridgeCount();
		bridge_draw_enabled_bridge_count =
			bridge_buffer->lastDrawEnabledBridgeCount();
	}
	if (bridge_draw_first_damage_state_after_invulnerable_state_scene == BODY_PRISTINE) {
		ProbeNoopScriptEngineScope destroy_list_script_engine_scope;
		bridge_logic_destroy_list_invoked =
			destroy_list_script_engine_scope.installed() &&
			bridge_draw_terrain_logic.exerciseFirstBridgeDestroyListForProbe(
					bridge_draw_game_logic,
					bridge_logic_destroy_list);
	}

	ProbeWorldHeightMapInspector::recordRenderedTileMetrics(map, map_load);

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	bridge_scene_draw_flushed =
		state != nullptr &&
		state->draw_indexed_primitive_calls >= 3 &&
		state->last_draw_stream_source_stride == sizeof(VertexFormatXYZNDUV1) &&
		state->last_draw_vertex_shader == DX8_FVF_XYZNDUV1 &&
		state->last_draw_vertex_count > 0 &&
		state->last_draw_primitive_count > 0 &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] != D3DTOP_DISABLE;
	road_scene_draw_flushed =
		render_object != nullptr &&
		render_object->probeRoadDrawInvoked() &&
		render_object->probeRoadDrawCallDelta() > 0 &&
		road_types_with_draw_data > 0 &&
		total_road_type_vertices > 0 &&
		total_road_type_indices > 0;
	tree_scene_draw_flushed =
		render_object != nullptr &&
		render_object->probeTreeDrawInvoked() &&
		render_object->probeTreeDrawCallDelta() > 0 &&
		tree_tiles_after_scene > 0;
	const bool bridge_pathfinder_new_map_succeeded =
		bridge_logic_pathfinder_map.newMapInvoked &&
		!bridge_logic_pathfinder_map.newMapException &&
		!bridge_logic_pathfinder_map.newMapSkippedForBrowserSafety &&
		bridge_logic_pathfinder_map.terrainCliffQueries > 0 &&
		bridge_logic_pathfinder_map.terrainCliffRenderObjectQueries ==
			bridge_logic_pathfinder_map.terrainCliffQueries &&
		bridge_logic_pathfinder_map.terrainFlatWaterQueries > 0 &&
		bridge_logic_pathfinder_map.afterNewMap.extentMaxX > 0 &&
		bridge_logic_pathfinder_map.afterNewMap.extentMaxY > 0 &&
		bridge_logic_pathfinder_map.afterNewMap.bridgeLayerCells > 0 &&
		bridge_logic_pathfinder_map.afterNewMap.bridgeLayerClearCells > 0 &&
		bridge_logic_pathfinder_map.afterNewMap.groundCells > 0 &&
		bridge_logic_pathfinder_map.changeToBrokenInvoked &&
		bridge_logic_pathfinder_map.afterBroken.bridgeLayerCells > 0 &&
		bridge_logic_pathfinder_map.afterBroken.bridgeLayerClearCells == 0 &&
		bridge_logic_pathfinder_map.afterBroken.bridgeLayerBridgeImpassableCells > 0 &&
		bridge_logic_pathfinder_map.changeToRepairedInvoked &&
		bridge_logic_pathfinder_map.afterRepaired.bridgeLayerCells > 0 &&
		bridge_logic_pathfinder_map.afterRepaired.bridgeLayerClearCells > 0 &&
		bridge_logic_pathfinder_map.afterRepaired.groundCells > 0;
	const bool bridge_draw_damage_sync_succeeded =
		bridge_draw_damage_sync.primed &&
		bridge_draw_damage_sync.observedDuringDraw &&
		bridge_draw_damage_sync.forcedMismatch &&
		bridge_draw_damage_sync.bridgeIndex >= 0 &&
		bridge_draw_damage_sync.terrainDamageState == BODY_PRISTINE &&
		bridge_draw_damage_sync.visualStateBeforePrime == BODY_PRISTINE &&
		bridge_draw_damage_sync.visualStateBeforeDraw == BODY_RUBBLE &&
		bridge_draw_damage_sync.visualStateAfterDraw ==
			bridge_draw_damage_sync.terrainDamageState &&
		bridge_draw_damage_sync.matchedTerrainAfterDraw &&
		bridge_draw_damage_sync.verticesBeforeDraw > 0 &&
		bridge_draw_damage_sync.indicesBeforeDraw > 0 &&
		bridge_draw_damage_sync.verticesAfterDraw > 0 &&
		bridge_draw_damage_sync.indicesAfterDraw > 0;
	const IniLayoutComparison ini_layout = compare_ini_layout();
	const bool ok =
		state != nullptr &&
		ini_layout.matches &&
		archive_context_ready &&
		runtime_archive_set_loaded_for_selection &&
		global_data_ready &&
		succeeded(init_result) &&
		asset_manager_created &&
		succeeded(set_device_result) &&
		runtime_asset_system_installed &&
		texture_file_factory_installed &&
		map_load.iniArchiveLoaded &&
		map_load.mapsArchiveLoaded &&
		map_load.terrainArchiveLoaded &&
		map_load.terrainIniParsed &&
		map_load.terrainTypeCount > 0 &&
		map_load.roadsIniExists &&
		map_load.roadsIniParsed &&
		map_load.terrainBridgeCount > 0 &&
		map_load.mapEntryExists &&
		map_load.mapEntryOpenable &&
		map_load.mapStreamOpen &&
		map_created &&
		logical_map_stream_open &&
		logical_map_parsed &&
		!logical_map_parse_exception &&
		logical_terrain_map_objects.attempted &&
		logical_terrain_map_objects.mapCacheInstalled &&
		logical_terrain_map_objects.terrainLogicInstalled &&
		logical_terrain_map_objects.gameClientInstalled &&
		logical_terrain_map_objects.thingFactoryInstalled &&
		logical_terrain_map_objects.scriptEngineInstalled &&
		logical_terrain_map_objects.loadReturned &&
		!logical_terrain_map_objects.loadException &&
		logical_terrain_map_objects.sourceFilenameMatches &&
		logical_terrain_map_objects.mapObjectsPresentAfterLoad &&
		logical_terrain_map_objects.roadPairsWithRoadType > 0 &&
		logical_terrain_map_objects.bridgePairsWithBridgeType > 0 &&
		logical_terrain_map_objects.timeOfDayNotified &&
		logical_terrain_map_objects.notifiedTimeOfDay == logical_terrain_map_objects.mapTimeOfDay &&
		logical_map_objects_used &&
		bridge_pair_candidate_count > 0 &&
		bridge_pair_candidate_selected &&
		!bridge_pair_map_objects_installed &&
		terrain_logic_installed_for_draw &&
		bridge_logic_seed_info_available &&
		bridge_logic_seeded_for_draw &&
		bridge_logic_count_after_seed > 0 &&
		bridge_logic_first_index_after_seed == 0 &&
		bridge_logic_first_damage_state_after_seed == BODY_PRISTINE &&
		bridge_logic_object_lookup_invoked &&
		bridge_logic_object_lookup.bridgeObjectID != INVALID_ID &&
		bridge_logic_object_lookup.foundBridgeObject &&
		bridge_logic_object_lookup.foundObjectID ==
			bridge_logic_object_lookup.bridgeObjectID &&
		bridge_logic_object_lookup.foundMatchesBridgeID &&
		bridge_logic_object_lookup.invalidIDLookupNull &&
		bridge_logic_object_lookup.highIDLookupNull &&
		bridge_logic_first_body_damage_state_after_seed == BODY_PRISTINE &&
		bridge_logic_first_body_health_after_seed == 1.0f &&
		bridge_logic_first_body_max_health_after_seed == 1.0f &&
		bridge_logic_attempt_damage_invoked &&
		!bridge_logic_attempt_damage_changed_state &&
		bridge_logic_attempt_damage_actual_dealt > 0.0f &&
		bridge_logic_attempt_damage_actual_clipped == 0.0f &&
		!bridge_logic_attempt_damage_no_effect &&
		bridge_logic_body_damage_state_after_attempt_damage == BODY_PRISTINE &&
		bridge_logic_body_health_after_attempt_damage == 1.0f &&
		bridge_logic_body_max_health_after_attempt_damage == 1.0f &&
		bridge_logic_damage_state_after_attempt_update == BODY_PRISTINE &&
		!bridge_logic_damage_state_changed_after_attempt_update &&
		!bridge_logic_broken_after_attempt_update &&
		!bridge_logic_repaired_after_attempt_update &&
		bridge_logic_kill_invoked &&
		bridge_logic_kill_object_still_present &&
		!bridge_logic_kill_destroyed_status &&
		bridge_logic_body_damage_state_after_kill == BODY_PRISTINE &&
		bridge_logic_body_health_after_kill == 1.0f &&
		bridge_logic_body_max_health_after_kill == 1.0f &&
		bridge_logic_damage_state_after_kill_update == BODY_PRISTINE &&
		!bridge_logic_damage_state_changed_after_kill_update &&
		!bridge_logic_broken_after_kill_update &&
		!bridge_logic_repaired_after_kill_update &&
		bridge_logic_sole_healing_invoked &&
		!bridge_logic_sole_healing_null_source_accepted &&
		bridge_logic_sole_healing_first_accepted &&
		bridge_logic_sole_healing_repeat_accepted &&
		bridge_logic_sole_healing_benefactor_matches_bridge &&
		bridge_logic_sole_healing_object_still_present &&
		!bridge_logic_sole_healing_destroyed_status &&
		bridge_logic_body_damage_state_after_sole_healing == BODY_PRISTINE &&
		bridge_logic_body_health_after_sole_healing == 1.0f &&
		bridge_logic_body_max_health_after_sole_healing == 1.0f &&
		bridge_logic_damage_state_after_sole_healing_update == BODY_PRISTINE &&
		!bridge_logic_damage_state_changed_after_sole_healing_update &&
		!bridge_logic_broken_after_sole_healing_update &&
		!bridge_logic_repaired_after_sole_healing_update &&
		bridge_logic_disabled_timer_invoked &&
		!bridge_logic_disabled_timer.clearInactiveReturned &&
		!bridge_logic_disabled_timer.initiallyDisabled &&
		bridge_logic_disabled_timer.initialDisabledUntilAny == 0 &&
		bridge_logic_disabled_timer.expirationFrame ==
			bridge_logic_disabled_timer.frameBeforeSet + 2 &&
		bridge_logic_disabled_timer.disabledAfterSet &&
		bridge_logic_disabled_timer.disabledByEmpAfterSet &&
		bridge_logic_disabled_timer.disabledUntilEmpAfterSet ==
			bridge_logic_disabled_timer.expirationFrame &&
		bridge_logic_disabled_timer.disabledUntilAnyAfterSet ==
			bridge_logic_disabled_timer.expirationFrame &&
		bridge_logic_disabled_timer.disabledAfterEarlyCheck &&
		bridge_logic_disabled_timer.disabledByEmpAfterEarlyCheck &&
		bridge_logic_disabled_timer.disabledUntilEmpAfterEarlyCheck ==
			bridge_logic_disabled_timer.expirationFrame &&
		bridge_logic_disabled_timer.disabledUntilAnyAfterEarlyCheck ==
			bridge_logic_disabled_timer.expirationFrame &&
		bridge_logic_disabled_timer.frameAfterExpiryCheck ==
			bridge_logic_disabled_timer.expirationFrame &&
		!bridge_logic_disabled_timer.disabledAfterExpiryCheck &&
		!bridge_logic_disabled_timer.disabledByEmpAfterExpiryCheck &&
		bridge_logic_disabled_timer.disabledUntilEmpAfterExpiryCheck == 0 &&
		bridge_logic_disabled_timer.disabledUntilAnyAfterExpiryCheck == 0 &&
		bridge_logic_invulnerable_state_invoked &&
		!bridge_logic_invulnerable_state.initiallyUndetectedDefector &&
		bridge_logic_invulnerable_state.undetectedDefectorAfterPositive &&
		!bridge_logic_invulnerable_state.undetectedDefectorAfterZero &&
		bridge_draw_first_damage_state_after_invulnerable_state_scene == BODY_PRISTINE &&
		bridge_logic_destroy_list_invoked &&
		bridge_logic_destroy_list.bridgeObjectID != INVALID_ID &&
		bridge_logic_destroy_list.objectCountBeforeDestroy > 0 &&
		bridge_logic_destroy_list.objectCountAfterDestroyObject ==
			bridge_logic_destroy_list.objectCountBeforeDestroy &&
		bridge_logic_destroy_list.objectCountAfterProcess + 1 ==
			bridge_logic_destroy_list.objectCountBeforeDestroy &&
		bridge_logic_destroy_list.lookupBeforeDestroy &&
		!bridge_logic_destroy_list.destroyedBeforeDestroy &&
		bridge_logic_destroy_list.destroyedAfterDestroyObject &&
		bridge_logic_destroy_list.lookupAfterDestroyObject &&
		bridge_logic_destroy_list.lookupAfterProcessNull &&
		bridge_logic_pathfinder_map_invoked &&
		bridge_logic_pathfinder_map.layer == bridge_logic_first_layer_after_seed &&
		bridge_pathfinder_new_map_succeeded &&
		bridge_draw_damage_sync_succeeded &&
		terrain_logic_retained_for_draw &&
		bridge_draw_terrain_logic_bridge_count > 0 &&
		bridge_draw_enabled_bridge_count > 0 &&
		(!bridge_template_substituted ||
			bridge_pair_template_substituted_in_logical_list) &&
		selected_bridge_pair_candidate >= 0 &&
		selected_bridge_pair_model_available &&
		selected_bridge_pair_texture_available &&
		map_load.mapBytes > 0 &&
		map_load.width > kMapPatchCells &&
		map_load.height > kMapPatchCells &&
		map_load.heightChecksum > 0 &&
		map_load.patchHeightChecksum > 0 &&
		bridge_object_metrics.mapObjects > 0 &&
		bridge_object_metrics.bridgePairs > 0 &&
		bridge_object_metrics.bridgePairsWithBridgeType > 0 &&
		water_transparency_ready &&
		shader_manager_initialized &&
		render_object_created &&
		render_object_initialized &&
		road_buffer_installed &&
		road_buffer_initialized &&
		load_roads_invoked &&
		roads_after_load > 0 &&
		road_segments_with_vertices > 0 &&
		road_types_with_textures > 0 &&
		road_types_with_draw_data > 0 &&
		total_road_type_vertices > 0 &&
		total_road_type_indices > 0 &&
		road_scene_draw_flushed &&
		tree_buffer_installed &&
		tree_data_configured &&
		add_tree_invoked &&
		update_tree_invoked &&
		!tree_need_to_draw_after_scene &&
		tree_tiles_after_scene > 0 &&
		tree_scene_draw_flushed &&
		script_engine_ready &&
		bridge_buffer_installed &&
		bridge_buffer_initialized &&
		load_bridges_invoked &&
		bridges_after_load > 0 &&
		bridge_object_script_engine_ready &&
		bridge_generic_bridge_template_loaded &&
		bridge_thing_factory_new_object_template_found &&
		bridge_thing_factory_new_object_invoked &&
		!bridge_thing_factory_new_object_exception &&
		bridge_thing_factory_new_object_returned &&
		bridge_thing_factory_new_object_id != INVALID_ID &&
		bridge_thing_factory_new_object_lookup_found &&
		bridge_thing_factory_new_object_lookup_matches &&
		bridge_thing_factory_new_object_body_ready &&
		bridge_thing_factory_new_object_count_after_create ==
			bridge_thing_factory_new_object_count_before + 1 &&
		bridge_thing_factory_new_object_destroyed_before_process &&
		bridge_thing_factory_new_object_count_after_destroy ==
			bridge_thing_factory_new_object_count_before &&
		bridge_thing_factory_new_object_lookup_after_destroy_null &&
		bridge_thing_factory_new_drawable_scope_ready &&
		bridge_thing_factory_new_drawable_template_found &&
		bridge_thing_factory_new_drawable_invoked &&
		!bridge_thing_factory_new_drawable_exception &&
		bridge_thing_factory_new_drawable_returned &&
		bridge_thing_factory_new_drawable_id != INVALID_DRAWABLE_ID &&
		bridge_thing_factory_new_drawable_lookup_found &&
		bridge_thing_factory_new_drawable_lookup_matches &&
		bridge_thing_factory_new_drawable_first_matches &&
		bridge_thing_factory_new_drawable_draw_module_ready &&
		bridge_thing_factory_new_drawable_count_after_create ==
			bridge_thing_factory_new_drawable_count_before + 1 &&
		bridge_thing_factory_new_drawable_destroy_invoked &&
		bridge_thing_factory_new_drawable_count_after_destroy ==
			bridge_thing_factory_new_drawable_count_before &&
		bridge_thing_factory_new_drawable_lookup_after_destroy_null &&
		!bridge_logic_generic_bridge_object_missing &&
		update_center_invoked &&
		bridge_vertices_after_update > 0 &&
		bridge_indices_after_update > 0 &&
		scene_created &&
		scene_object_added &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		render_object != nullptr &&
		render_object->probeBridgeDrawInvoked() &&
		render_object->probeBridgeDrawWrapperInvoked() &&
		!render_object->probeBridgeDrawWrapperWireframe() &&
		render_object->probeBridgeTerrainRenderObjectPinned() &&
		!render_object->probeBridgeShroudOverlaySuppressed() &&
		render_object->probeBridgeShroudTextureReady() &&
		render_object->probeBridgeShroudDrawSeen() &&
		render_object->probeBridgeDrawCallDelta() >= 2 &&
		bridge_scene_draw_flushed &&
		state->browser_buffer_create_calls >= 4 &&
		state->browser_buffer_update_calls >= 4 &&
		state->set_stream_source_calls >= 2 &&
		state->set_indices_calls >= 2 &&
		state->set_texture_calls >= 1;

	const std::string runtime_archive_directory_json =
		json_string(runtime_archive_directory != nullptr ? runtime_archive_directory : "");
	const std::string runtime_archive_mask_json =
		json_string(runtime_archive_mask != nullptr ? runtime_archive_mask : "");
	const std::string terrain_map_entry_json = json_string(bridge_map_entry);
	const std::string first_patch_texture_class_json =
		json_string(map_load.firstPatchTextureClassName);
	const std::string ini_layout_report_json = ini_layout_json(ini_layout);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();
	const std::string first_bridge_name_json = json_string(bridge_object_metrics.firstBridgeName);
	const std::string selected_bridge_original_name_json =
		json_string(selected_bridge_original_name);
	const std::string selected_bridge_installed_name_json =
		json_string(selected_bridge_installed_name);
	const AsciiString selected_bridge_installed_ascii(
		selected_bridge_installed_name.empty() ?
			selected_bridge_original_name.c_str() :
			selected_bridge_installed_name.c_str());
	const std::string selected_bridge_model_json =
		json_string(selected_bridge_pair_candidate >= 0 ?
			probe_bridge_model_name(
				archive_context.terrainRoads(),
				selected_bridge_installed_ascii) :
			"");
	const std::string selected_bridge_texture_json =
		json_string(selected_bridge_pair_candidate >= 0 ?
			probe_bridge_texture_name(
				archive_context.terrainRoads(),
				selected_bridge_installed_ascii) :
			"");
	const std::string logical_terrain_source_filename_json =
		json_string(logical_terrain_map_objects.sourceFilename);
	const std::string logical_terrain_failure_phase_json =
		json_string(logical_terrain_map_objects.failurePhase);
	const std::string bridge_generic_bridge_template_error_json =
		json_string(bridge_generic_bridge_template_error_message);
	const std::string tree_model_json = json_string(kTreeModelName);
	const std::string tree_texture_json = json_string(kTreeTextureName);

	char buffer[56000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_bridge_buffer_scene_probe\","
		"\"ok\":%s,"
		"\"path\":\"original WorldHeightMap + HeightMapRenderObjClass::Render -> "
		"W3DRoadBuffer::drawRoads + BaseHeightMapRenderObjClass::renderTrees -> "
		"ThingFactory::newObject(GenericBridge) -> "
		"GameLogic::destroyObject/update-processDestroyList(temp GenericBridge) -> "
		"ThingFactory::newDrawable(GenericBridge) -> "
		"GameClient::destroyDrawable(temp GenericBridge) -> "
		"W3DBridgeBuffer::loadBridges(&W3DTerrainLogic,FALSE) -> "
		"TerrainLogic::addBridgeToLogic -> "
		"AIPathfind::newMap/classifyMap -> "
		"Pathfinder::changeBridgeState(broken/repaired) -> "
		"GameLogic::findObjectByID(GenericBridge) -> "
		"Object::attemptDamage(GenericBridge) -> "
		"TerrainLogic::updateBridgeDamageStates -> Object::kill(GenericBridge) -> "
		"TerrainLogic::updateBridgeDamageStates -> "
		"Object::attemptHealingFromSoleBenefactor(GenericBridge) -> "
		"TerrainLogic::updateBridgeDamageStates -> "
		"Object::setDisabledUntil/checkDisabledStatus(GenericBridge) -> "
		"Object::goInvulnerable(GenericBridge) -> "
		"TerrainLogic::updateCenter -> "
		"TerrainLogic-retained W3DBridgeBuffer::drawBridges(FALSE) -> "
		"W3DBridge::renderBridge + bridge shroud overlay -> "
		"GameLogic::destroyObject/update-processDestroyList(GenericBridge)\","
		"\"archives\":{\"ini\":\"%s\",\"maps\":\"%s\",\"terrain\":\"%s\","
		"\"runtimeDirectory\":%s,\"runtimeMask\":%s},"
		"\"results\":{\"archiveContextReady\":%s,\"globalDataReady\":%s,"
		"\"objectRuntime\":{\"moduleFactoryReady\":%s,"
		"\"gameLogicReady\":%s,\"playerListReady\":%s,"
		"\"radarReady\":%s,\"damageFXReady\":%s,"
		"\"armorReady\":%s,\"genericBridgeTemplateLoaded\":%s,"
		"\"partitionReady\":%s,"
		"\"objectScriptEngineReady\":%s,"
		"\"damageFXEntryAvailable\":%s,"
		"\"damageFXLoadException\":%s,"
		"\"armorEntryAvailable\":%s,"
		"\"armorLoadException\":%s,"
		"\"objectIniFileCount\":%d,"
		"\"genericBridgeTemplateLoadException\":%s,"
		"\"genericBridgeTemplateErrorCode\":%d,"
		"\"genericBridgeTemplateError\":%s,"
		"\"newObjectTemplateFound\":%s,"
		"\"newObjectInvoked\":%s,"
		"\"newObjectException\":%s,"
		"\"newObjectReturned\":%s,"
		"\"newObjectID\":%d,"
		"\"newObjectLookupFound\":%s,"
		"\"newObjectLookupMatches\":%s,"
		"\"newObjectBodyReady\":%s,"
		"\"newObjectCountBefore\":%u,"
		"\"newObjectCountAfterCreate\":%u,"
		"\"newObjectCountAfterDestroy\":%u,"
		"\"newObjectDestroyedBeforeProcess\":%s,"
		"\"newObjectLookupAfterDestroyNull\":%s,"
		"\"newDrawableScopeReady\":%s,"
		"\"newDrawableTemplateFound\":%s,"
		"\"newDrawableInvoked\":%s,"
		"\"newDrawableException\":%s,"
		"\"newDrawableExceptionCode\":%d,"
		"\"newDrawableReturned\":%s,"
		"\"newDrawableID\":%d,"
		"\"newDrawableLookupFound\":%s,"
		"\"newDrawableLookupMatches\":%s,"
		"\"newDrawableFirstMatches\":%s,"
		"\"newDrawableDrawModuleReady\":%s,"
		"\"newDrawableCountBefore\":%u,"
		"\"newDrawableCountAfterCreate\":%u,"
		"\"newDrawableCountAfterDestroy\":%u,"
		"\"newDrawableDestroyInvoked\":%s,"
		"\"newDrawableLookupAfterDestroyNull\":%s},"
		"\"runtimeArchiveSetLoadedForSelection\":%s,"
		"\"init\":%d,\"assetManagerCreated\":%s,\"setRenderDevice\":%d,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"modelsFileExists\":%s,\"meshFileExists\":%s,"
		"\"treeTextureFileExists\":%s,\"materialTextureFileExists\":%s,"
		"\"logicalMapStreamOpen\":%s,\"logicalMapParsed\":%s,"
		"\"logicalMapParseException\":%s,"
		"\"bridgePairCandidateSelected\":%s,"
		"\"bridgePairMapObjectsInstalled\":%s,"
		"\"waterTransparencyReady\":%s,\"shaderManagerInitialized\":%s,"
		"\"renderObjectCreated\":%s,\"renderObjectInitialized\":%s,"
		"\"initHeightData\":%d,"
		"\"roadBufferInstalled\":%s,\"roadBufferInitialized\":%s,"
		"\"loadRoadsInvoked\":%s,\"roadDrawInvoked\":%s,"
		"\"roadDrawCallDelta\":%u,\"roadSceneDrawFlushed\":%s,"
		"\"treeBufferInstalled\":%s,\"treeDataConfigured\":%s,"
		"\"addTreeInvoked\":%s,\"updateTreeInvoked\":%s,"
		"\"treeNeedToDrawAfterCenter\":%s,"
		"\"treeNeedToDrawAfterScene\":%s,"
		"\"treeDrawInvoked\":%s,\"treeDrawCallDelta\":%u,"
		"\"treeSceneDrawFlushed\":%s,\"scriptEngineReady\":%s,"
		"\"bridgeBufferInstalled\":%s,"
		"\"bridgeBufferInitialized\":%s,\"loadBridgesInvoked\":%s,"
		"\"updateCenterInvoked\":%s,"
		"\"terrainLogicInstalledForDraw\":%s,"
		"\"terrainLogicRetainedForDraw\":%s,"
		"\"bridgeLogicSeedInfoAvailable\":%s,"
		"\"bridgeLogicSeededForDraw\":%s,"
		"\"bridgeLogicGenericBridgeObjectMissing\":%s,"
		"\"bridgeLogicAiPathfinderAvailable\":%s,"
		"\"bridgeLogicCountAfterSeed\":%d,"
		"\"bridgeLogicFirstIndexAfterSeed\":%d,"
		"\"bridgeLogicFirstDamageStateAfterSeed\":%d,"
		"\"bridgeLogicObjectLookupInvoked\":%s,"
		"\"bridgeLogicObjectLookupBridgeID\":%d,"
		"\"bridgeLogicObjectLookupFoundID\":%d,"
		"\"bridgeLogicObjectLookupFoundBridgeObject\":%s,"
		"\"bridgeLogicObjectLookupMatchesBridgeID\":%s,"
		"\"bridgeLogicObjectLookupInvalidIDNull\":%s,"
		"\"bridgeLogicObjectLookupHighIDNull\":%s,"
		"\"bridgeLogicFirstBodyDamageStateAfterSeed\":%d,"
		"\"bridgeLogicFirstBodyHealthAfterSeed\":%.4f,"
		"\"bridgeLogicFirstBodyMaxHealthAfterSeed\":%.4f,"
		"\"bridgeLogicAttemptDamageInvoked\":%s,"
		"\"bridgeLogicAttemptDamageChangedState\":%s,"
		"\"bridgeLogicAttemptDamageActualDealt\":%.4f,"
		"\"bridgeLogicAttemptDamageActualClipped\":%.4f,"
		"\"bridgeLogicAttemptDamageNoEffect\":%s,"
		"\"bridgeLogicBodyDamageStateAfterAttemptDamage\":%d,"
		"\"bridgeLogicBodyHealthAfterAttemptDamage\":%.4f,"
		"\"bridgeLogicBodyMaxHealthAfterAttemptDamage\":%.4f,"
		"\"bridgeLogicDamageStateAfterAttemptUpdate\":%d,"
		"\"bridgeLogicDamageStateChangedAfterAttemptUpdate\":%s,"
		"\"bridgeLogicBrokenAfterAttemptUpdate\":%s,"
		"\"bridgeLogicRepairedAfterAttemptUpdate\":%s,"
		"\"bridgeLogicKillInvoked\":%s,"
		"\"bridgeLogicKillObjectStillPresent\":%s,"
		"\"bridgeLogicKillDestroyedStatus\":%s,"
		"\"bridgeLogicBodyDamageStateAfterKill\":%d,"
		"\"bridgeLogicBodyHealthAfterKill\":%.4f,"
		"\"bridgeLogicBodyMaxHealthAfterKill\":%.4f,"
		"\"bridgeLogicDamageStateAfterKillUpdate\":%d,"
		"\"bridgeLogicDamageStateChangedAfterKillUpdate\":%s,"
		"\"bridgeLogicBrokenAfterKillUpdate\":%s,"
		"\"bridgeLogicRepairedAfterKillUpdate\":%s,"
		"\"bridgeLogicSoleHealingInvoked\":%s,"
		"\"bridgeLogicSoleHealingNullSourceAccepted\":%s,"
		"\"bridgeLogicSoleHealingFirstAccepted\":%s,"
		"\"bridgeLogicSoleHealingRepeatAccepted\":%s,"
		"\"bridgeLogicSoleHealingBenefactorMatchesBridge\":%s,"
		"\"bridgeLogicSoleHealingObjectStillPresent\":%s,"
		"\"bridgeLogicSoleHealingDestroyedStatus\":%s,"
		"\"bridgeLogicBodyDamageStateAfterSoleHealing\":%d,"
		"\"bridgeLogicBodyHealthAfterSoleHealing\":%.4f,"
		"\"bridgeLogicBodyMaxHealthAfterSoleHealing\":%.4f,"
		"\"bridgeLogicDamageStateAfterSoleHealingUpdate\":%d,"
		"\"bridgeLogicDamageStateChangedAfterSoleHealingUpdate\":%s,"
		"\"bridgeLogicBrokenAfterSoleHealingUpdate\":%s,"
		"\"bridgeLogicRepairedAfterSoleHealingUpdate\":%s,"
		"\"bridgeLogicDisabledTimerInvoked\":%s,"
		"\"bridgeLogicDisabledTimerClearInactiveReturned\":%s,"
		"\"bridgeLogicDisabledTimerInitiallyDisabled\":%s,"
		"\"bridgeLogicDisabledTimerInitialUntilAny\":%u,"
		"\"bridgeLogicDisabledTimerFrameBeforeSet\":%u,"
		"\"bridgeLogicDisabledTimerExpirationFrame\":%u,"
		"\"bridgeLogicDisabledTimerDisabledAfterSet\":%s,"
		"\"bridgeLogicDisabledTimerDisabledByEmpAfterSet\":%s,"
		"\"bridgeLogicDisabledTimerUntilEmpAfterSet\":%u,"
		"\"bridgeLogicDisabledTimerUntilAnyAfterSet\":%u,"
		"\"bridgeLogicDisabledTimerDisabledAfterEarlyCheck\":%s,"
		"\"bridgeLogicDisabledTimerDisabledByEmpAfterEarlyCheck\":%s,"
		"\"bridgeLogicDisabledTimerUntilEmpAfterEarlyCheck\":%u,"
		"\"bridgeLogicDisabledTimerUntilAnyAfterEarlyCheck\":%u,"
		"\"bridgeLogicDisabledTimerFrameAfterExpiryCheck\":%u,"
		"\"bridgeLogicDisabledTimerDisabledAfterExpiryCheck\":%s,"
		"\"bridgeLogicDisabledTimerDisabledByEmpAfterExpiryCheck\":%s,"
		"\"bridgeLogicDisabledTimerUntilEmpAfterExpiryCheck\":%u,"
		"\"bridgeLogicDisabledTimerUntilAnyAfterExpiryCheck\":%u,"
		"\"bridgeLogicInvulnerableStateInvoked\":%s,"
		"\"bridgeLogicInvulnerableInitiallyUndetectedDefector\":%s,"
		"\"bridgeLogicInvulnerableUndetectedDefectorAfterPositive\":%s,"
		"\"bridgeLogicInvulnerableUndetectedDefectorAfterZero\":%s,"
		"\"bridgeDrawFirstDamageStateAfterInvulnerableStateScene\":%d,"
		"\"bridgeDrawDamageSyncPrimed\":%s,"
		"\"bridgeDrawDamageSyncObservedDuringDraw\":%s,"
		"\"bridgeDrawDamageSyncForcedMismatch\":%s,"
		"\"bridgeDrawDamageSyncMatchedTerrainAfterDraw\":%s,"
		"\"bridgeDrawDamageSyncBridgeIndex\":%d,"
		"\"bridgeDrawDamageSyncTerrainState\":%d,"
		"\"bridgeDrawDamageSyncVisualStateBeforePrime\":%d,"
		"\"bridgeDrawDamageSyncVisualStateBeforeDraw\":%d,"
		"\"bridgeDrawDamageSyncVisualStateAfterDraw\":%d,"
		"\"bridgeDrawDamageSyncVerticesBeforeDraw\":%d,"
		"\"bridgeDrawDamageSyncIndicesBeforeDraw\":%d,"
		"\"bridgeDrawDamageSyncVerticesAfterDraw\":%d,"
		"\"bridgeDrawDamageSyncIndicesAfterDraw\":%d,"
		"\"bridgeLogicDestroyListInvoked\":%s,"
		"\"bridgeLogicDestroyListBridgeID\":%d,"
		"\"bridgeLogicDestroyListObjectCountBeforeDestroy\":%u,"
		"\"bridgeLogicDestroyListObjectCountAfterDestroyObject\":%u,"
		"\"bridgeLogicDestroyListObjectCountAfterProcess\":%u,"
		"\"bridgeLogicDestroyListLookupBeforeDestroy\":%s,"
		"\"bridgeLogicDestroyListDestroyedBeforeDestroy\":%s,"
		"\"bridgeLogicDestroyListDestroyedAfterDestroyObject\":%s,"
		"\"bridgeLogicDestroyListLookupAfterDestroyObject\":%s,"
		"\"bridgeLogicDestroyListLookupAfterProcessNull\":%s,"
		"\"bridgeLogicFirstLayerAfterSeed\":%d,"
		"\"bridgeLogicPathfinderMapInvoked\":%s,"
		"\"bridgeLogicPathfinderNewMapInvoked\":%s,"
		"\"bridgeLogicPathfinderNewMapException\":%s,"
		"\"bridgeLogicPathfinderLayer\":%d,"
		"\"bridgeLogicPathfinderPreflightMinX\":%d,"
		"\"bridgeLogicPathfinderPreflightMinY\":%d,"
		"\"bridgeLogicPathfinderPreflightMaxX\":%d,"
		"\"bridgeLogicPathfinderPreflightMaxY\":%d,"
		"\"bridgeLogicPathfinderPreflightEstimatedMapCells\":%u,"
		"\"bridgeLogicPathfinderNewMapSkippedForBrowserSafety\":%s,"
		"\"bridgeLogicPathfinderTerrainCliffQueries\":%d,"
		"\"bridgeLogicPathfinderTerrainCliffRenderObjectQueries\":%d,"
		"\"bridgeLogicPathfinderTerrainCliffTrueCells\":%d,"
		"\"bridgeLogicPathfinderTerrainFlatWaterQueries\":%d,"
		"\"bridgeLogicPathfinderExtentMaxX\":%d,"
		"\"bridgeLogicPathfinderExtentMaxY\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapBridgeLayerCells\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapClearCells\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapBridgeImpassableCells\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapGroundConnections\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapGroundCells\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapGroundBridgeConnections\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapCenterCellType\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapCenterConnectLayer\":%d,"
		"\"bridgeLogicPathfinderAfterNewMapCenterOnBridgeLayer\":%s,"
		"\"bridgeLogicPathfinderChangeToBrokenInvoked\":%s,"
		"\"bridgeLogicPathfinderAfterBrokenBridgeLayerCells\":%d,"
		"\"bridgeLogicPathfinderAfterBrokenClearCells\":%d,"
		"\"bridgeLogicPathfinderAfterBrokenBridgeImpassableCells\":%d,"
		"\"bridgeLogicPathfinderAfterBrokenGroundConnections\":%d,"
		"\"bridgeLogicPathfinderAfterBrokenGroundBridgeConnections\":%d,"
		"\"bridgeLogicPathfinderChangeToRepairedInvoked\":%s,"
		"\"bridgeLogicPathfinderAfterRepairedBridgeLayerCells\":%d,"
		"\"bridgeLogicPathfinderAfterRepairedClearCells\":%d,"
		"\"bridgeLogicPathfinderAfterRepairedBridgeImpassableCells\":%d,"
		"\"bridgeLogicPathfinderAfterRepairedGroundConnections\":%d,"
		"\"bridgeLogicPathfinderAfterRepairedGroundBridgeConnections\":%d,"
		"\"bridgeLogicPathfinderAfterRepairedCenterCellType\":%d,"
		"\"bridgeLogicPathfinderAfterRepairedCenterConnectLayer\":%d,"
		"\"bridgeLogicPathfinderAfterRepairedCenterOnBridgeLayer\":%s,"
		"\"bridgeDrawTerrainLogicBridgeCount\":%d,"
		"\"bridgeDrawEnabledBridgeCount\":%d,"
		"\"sceneCreated\":%s,"
		"\"sceneObjectAdded\":%s,\"beginRender\":%d,\"render\":%d,"
			"\"endRender\":%d,\"bridgeDrawInvoked\":%s,"
			"\"bridgeDrawWrapperInvoked\":%s,"
			"\"bridgeDrawWrapperWireframe\":%s,"
			"\"bridgeTerrainRenderObjectPinned\":%s,"
			"\"bridgeShroudOverlaySuppressed\":%s,"
			"\"bridgeShroudTextureReady\":%s,"
			"\"bridgeShroudDrawSeen\":%s,"
			"\"bridgeDrawCallsBefore\":%u,\"bridgeDrawCallsAfter\":%u,"
			"\"bridgeDrawCallDelta\":%u,"
			"\"bridgeShroudDrawCallsBefore\":%u,"
			"\"bridgeShroudDrawCallsAfter\":%u,"
		"\"bridgeSceneDrawFlushed\":%s},"
		"\"logicalTerrain\":{\"path\":\"W3DTerrainLogic::loadMap(query=true) -> "
		"MapObject list -> W3DBridgeBuffer::loadBridges + retained "
		"TerrainLogic bridge draw list\","
		"\"attempted\":%s,\"localGlobalDataInstalled\":%s,"
		"\"mapCacheInstalled\":%s,\"terrainLogicInstalled\":%s,"
		"\"gameClientInstalled\":%s,\"thingFactoryInstalled\":%s,"
		"\"scriptEngineInstalled\":%s,\"loadReturned\":%s,"
		"\"loadException\":%s,\"loadError\":%d,"
		"\"failurePhase\":%s,\"sourceFilename\":%s,"
		"\"sourceFilenameMatches\":%s,"
		"\"mapObjectsPresentAfterLoad\":%s,\"mapObjectsUsed\":%s,"
		"\"mapObjectCount\":%d,\"roadPoint1\":%d,\"roadPoint2\":%d,"
		"\"roadPairs\":%d,\"roadPairsWithRoadType\":%d,"
		"\"bridgePoint1\":%d,\"bridgePoint2\":%d,"
		"\"bridgePairs\":%d,\"bridgePairsWithBridgeType\":%d,"
		"\"timeOfDayNotified\":%s,\"mapTimeOfDay\":%d,"
		"\"notifiedTimeOfDay\":%d,"
		"\"selectedTemplateSubstitutedInLogicalList\":%s},"
		"\"ini\":{\"terrainEntry\":\"Data\\\\INI\\\\Terrain.ini\","
		"\"terrainLoaded\":%s,\"terrainEntryExists\":%s,"
		"\"terrainParsed\":%s,"
		"\"roadsEntry\":\"Data\\\\INI\\\\Roads.ini\","
		"\"defaultRoadsEntry\":\"Data\\\\INI\\\\Default\\\\Roads.ini\","
		"\"defaultRoadsEntryExists\":%s,\"defaultRoadsParsed\":%s,"
		"\"roadsEntryExists\":%s,\"roadsParsed\":%s,"
		"\"parser\":\"GameEngine/Common/INI.cpp::load + INITerrain.cpp + "
		"INITerrainRoad.cpp + INITerrainBridge.cpp + TerrainRoads.cpp\","
		"\"originalIniParser\":true,\"terrainTypeCount\":%lu,"
		"\"roadCount\":%lu,\"bridgeCount\":%lu},"
		"\"iniLayout\":%s,"
		"\"map\":{\"entry\":%s,\"entryExists\":%s,\"entryOpenable\":%s,"
		"\"streamOpen\":%s,\"parsed\":%s,\"bytes\":%d,"
		"\"width\":%d,\"height\":%d,\"border\":%d,"
		"\"heightChecksum\":%lu},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"tileSource\":\"shipped-map-heightmap\","
		"\"renderObject\":\"ProbeHeightMapRenderObjWithBridgeBuffer\","
		"\"transform\":\"identity\","
		"\"renderWindowWidth\":%d,\"renderWindowHeight\":%d,"
		"\"renderOriginX\":%d,\"renderOriginY\":%d,"
		"\"patchOriginX\":%d,\"patchOriginY\":%d,"
		"\"patchCenterHeight\":%u,\"patchHeightChecksum\":%lu,"
		"\"tileDiagnostics\":{\"bitmapTiles\":%d,\"textureClasses\":%d,"
		"\"sourceTilesLoaded\":%d,\"sourceTilesPositioned\":%d,"
		"\"patchCells\":%d,\"patchCellsWithSource\":%d,"
		"\"patchCellsMissingSource\":%d,"
		"\"firstPatchTile\":{\"tileIndex\":%d,\"baseTileIndex\":%d,"
		"\"sourceTileLoaded\":%s,\"textureClass\":%d,"
		"\"textureClassName\":%s,\"texturePositionX\":%d,"
		"\"texturePositionY\":%d}}},"
		"\"scene\":{\"renderPath\":\"WW3D::Render(RTS3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> ProbeHeightMapRenderObjWithBridgeBuffer::Render -> "
		"HeightMapRenderObjClass::Render -> "
		"W3DRoadBuffer::drawRoads -> BaseHeightMapRenderObjClass::renderTrees -> "
		"W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic) -> "
		"W3DBridge::renderBridge + bridge shroud overlay\","
		"\"created\":%s,\"objectAdded\":%s,\"terrainClassId\":%d},"
		"\"bridgeObjects\":{\"mapObjects\":%d,\"point1\":%d,\"point2\":%d,"
		"\"candidatePairs\":%d,\"selectedCandidate\":%d,"
		"\"candidatesWithSource\":%d,"
		"\"candidatesWithModel\":%d,\"candidatesWithTexture\":%d,"
		"\"candidatesWithAssets\":%d,"
		"\"candidatesWithAssetsAndSource\":%d,"
			"\"selectedPatchSourceCells\":%d,"
			"\"selectedModelAvailable\":%s,"
			"\"selectedTextureAvailable\":%s,"
			"\"templateSubstitutedForAvailableAssets\":%s,"
			"\"selectedTemplateSubstitutedInLogicalList\":%s,"
			"\"selectedOriginalName\":%s,\"selectedInstalledName\":%s,"
			"\"selectedModel\":%s,\"selectedTexture\":%s,"
			"\"assetManager\":{\"modelArchiveExists\":%s,"
			"\"textureArchiveExists\":%s,"
			"\"bareModelFileAvailable\":%s,"
			"\"bareTextureFileAvailable\":%s,"
			"\"loadBareModel\":%s,\"createModel\":%s,"
			"\"modelClassId\":%d,\"modelSubObjects\":%d,"
			"\"modelHasLeft\":%s,\"modelHasSpan\":%s,"
			"\"modelHasRight\":%s,\"createLeft\":%s,"
			"\"createSpan\":%s,\"createRight\":%s,"
			"\"leftClassId\":%d,\"spanClassId\":%d,"
			"\"rightClassId\":%d,\"leftVertices\":%d,"
			"\"spanVertices\":%d,\"rightVertices\":%d,"
			"\"leftPolygons\":%d,\"spanPolygons\":%d,"
			"\"rightPolygons\":%d,\"createTexture\":%s},"
			"\"topAssetSourceCandidates\":%s,"
			"\"pairs\":%d,\"pairsWithBridgeType\":%d,\"firstName\":%s,"
		"\"firstFlags\":%d,\"first\":[%.4f,%.4f],\"second\":[%.4f,%.4f],"
		"\"center\":[%.4f,%.4f,%.4f]},"
			"\"bridges\":{\"afterLoad\":%d,\"manualGeometryAfterLoad\":%s,"
			"\"manualGeometryException\":%s,"
			"\"manualVerticesAfterLoad\":%d,"
			"\"manualIndicesAfterLoad\":%d,"
			"\"verticesAfterUpdate\":%d,"
			"\"indicesAfterUpdate\":%d,\"hasVertexBuffer\":%s,"
			"\"hasIndexBuffer\":%s},"
		"\"roads\":{\"afterLoad\":%d,\"segmentsWithVertices\":%d,"
		"\"typesWithTextures\":%d,\"typesWithDrawData\":%d,"
		"\"totalTypeVertices\":%d,\"totalTypeIndices\":%d,"
		"\"drawBounds\":{\"minX\":%d,\"maxX\":%d,"
		"\"minY\":%d,\"maxY\":%d}},"
		"\"tree\":{\"model\":%s,\"texture\":%s,"
		"\"tilesAfterScene\":%d,"
		"\"location\":[%.4f,%.4f,%.4f]},"
		"\"camera\":{\"eye\":[%.4f,%.4f,%.4f],"
		"\"target\":[%.4f,%.4f,%.4f]},"
		"\"runtimeAssets\":%s,"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserBufferCreate\":%u,"
		"\"browserBufferUpdate\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"setVertexShader\":%u,\"drawIndexed\":%u,"
		"\"setTransform\":%u,\"clear\":%u,\"present\":%u},"
		"\"draw\":{\"primitiveType\":%u,\"vertexShaderFvf\":%lu,"
		"\"vertexCount\":%u,\"primitiveCount\":%u,"
		"\"vertexStride\":%u,\"vertexBufferId\":%u,"
		"\"indexBufferId\":%u,\"texture0ColorOp\":%lu,"
		"\"texture0ColorArg1\":%lu,\"texture0ColorArg2\":%lu}}",
		bool_json(ok),
		ini_archive_path != nullptr ? ini_archive_path : "",
		maps_archive_path != nullptr ? maps_archive_path : "",
		terrain_archive_path != nullptr ? terrain_archive_path : "",
		runtime_archive_directory_json.c_str(),
		runtime_archive_mask_json.c_str(),
		bool_json(archive_context_ready),
		bool_json(global_data_ready),
		bool_json(bridge_module_factory_ready),
		bool_json(bridge_game_logic_ready),
		bool_json(bridge_player_list_ready),
		bool_json(bridge_radar_ready),
		bool_json(bridge_damage_fx_ready),
		bool_json(bridge_armor_ready),
		bool_json(bridge_generic_bridge_template_loaded),
		bool_json(bridge_partition_ready),
		bool_json(bridge_object_script_engine_ready),
		bool_json(bridge_damage_fx_entry_available),
		bool_json(bridge_damage_fx_load_exception),
		bool_json(bridge_armor_entry_available),
		bool_json(bridge_armor_load_exception),
		bridge_object_ini_file_count,
		bool_json(bridge_generic_bridge_template_load_exception),
		bridge_generic_bridge_template_error_code,
		bridge_generic_bridge_template_error_json.c_str(),
		bool_json(bridge_thing_factory_new_object_template_found),
		bool_json(bridge_thing_factory_new_object_invoked),
		bool_json(bridge_thing_factory_new_object_exception),
		bool_json(bridge_thing_factory_new_object_returned),
		bridge_thing_factory_new_object_id,
		bool_json(bridge_thing_factory_new_object_lookup_found),
		bool_json(bridge_thing_factory_new_object_lookup_matches),
		bool_json(bridge_thing_factory_new_object_body_ready),
		bridge_thing_factory_new_object_count_before,
		bridge_thing_factory_new_object_count_after_create,
		bridge_thing_factory_new_object_count_after_destroy,
		bool_json(bridge_thing_factory_new_object_destroyed_before_process),
		bool_json(bridge_thing_factory_new_object_lookup_after_destroy_null),
		bool_json(bridge_thing_factory_new_drawable_scope_ready),
		bool_json(bridge_thing_factory_new_drawable_template_found),
		bool_json(bridge_thing_factory_new_drawable_invoked),
		bool_json(bridge_thing_factory_new_drawable_exception),
		bridge_thing_factory_new_drawable_exception_code,
		bool_json(bridge_thing_factory_new_drawable_returned),
		bridge_thing_factory_new_drawable_id,
		bool_json(bridge_thing_factory_new_drawable_lookup_found),
		bool_json(bridge_thing_factory_new_drawable_lookup_matches),
		bool_json(bridge_thing_factory_new_drawable_first_matches),
		bool_json(bridge_thing_factory_new_drawable_draw_module_ready),
		bridge_thing_factory_new_drawable_count_before,
		bridge_thing_factory_new_drawable_count_after_create,
		bridge_thing_factory_new_drawable_count_after_destroy,
		bool_json(bridge_thing_factory_new_drawable_destroy_invoked),
		bool_json(bridge_thing_factory_new_drawable_lookup_after_destroy_null),
		bool_json(runtime_archive_set_loaded_for_selection),
		init_result,
		bool_json(asset_manager_created),
		set_device_result,
		bool_json(runtime_asset_system_installed),
		bool_json(texture_file_factory_installed),
		bool_json(models_file_exists),
		bool_json(mesh_file_exists),
		bool_json(tree_texture_file_exists),
		bool_json(material_texture_file_exists),
		bool_json(logical_map_stream_open),
		bool_json(logical_map_parsed),
		bool_json(logical_map_parse_exception),
		bool_json(bridge_pair_candidate_selected),
		bool_json(bridge_pair_map_objects_installed),
		bool_json(water_transparency_ready),
		bool_json(shader_manager_initialized),
		bool_json(render_object_created),
		bool_json(render_object_initialized),
		init_height_data_result,
		bool_json(road_buffer_installed),
		bool_json(road_buffer_initialized),
		bool_json(load_roads_invoked),
		bool_json(render_object != nullptr && render_object->probeRoadDrawInvoked()),
		render_object != nullptr ? render_object->probeRoadDrawCallDelta() : 0,
		bool_json(road_scene_draw_flushed),
		bool_json(tree_buffer_installed),
		bool_json(tree_data_configured),
		bool_json(add_tree_invoked),
		bool_json(update_tree_invoked),
		bool_json(tree_need_to_draw_after_center),
		bool_json(tree_need_to_draw_after_scene),
		bool_json(render_object != nullptr && render_object->probeTreeDrawInvoked()),
		render_object != nullptr ? render_object->probeTreeDrawCallDelta() : 0,
		bool_json(tree_scene_draw_flushed),
		bool_json(script_engine_ready),
		bool_json(bridge_buffer_installed),
		bool_json(bridge_buffer_initialized),
		bool_json(load_bridges_invoked),
		bool_json(update_center_invoked),
		bool_json(terrain_logic_installed_for_draw),
		bool_json(terrain_logic_retained_for_draw),
		bool_json(bridge_logic_seed_info_available),
		bool_json(bridge_logic_seeded_for_draw),
		bool_json(bridge_logic_generic_bridge_object_missing),
		bool_json(bridge_logic_ai_pathfinder_available),
		bridge_logic_count_after_seed,
		bridge_logic_first_index_after_seed,
		bridge_logic_first_damage_state_after_seed,
		bool_json(bridge_logic_object_lookup_invoked),
		bridge_logic_object_lookup.bridgeObjectID,
		bridge_logic_object_lookup.foundObjectID,
		bool_json(bridge_logic_object_lookup.foundBridgeObject),
		bool_json(bridge_logic_object_lookup.foundMatchesBridgeID),
		bool_json(bridge_logic_object_lookup.invalidIDLookupNull),
		bool_json(bridge_logic_object_lookup.highIDLookupNull),
		bridge_logic_first_body_damage_state_after_seed,
		bridge_logic_first_body_health_after_seed,
		bridge_logic_first_body_max_health_after_seed,
		bool_json(bridge_logic_attempt_damage_invoked),
		bool_json(bridge_logic_attempt_damage_changed_state),
		bridge_logic_attempt_damage_actual_dealt,
		bridge_logic_attempt_damage_actual_clipped,
		bool_json(bridge_logic_attempt_damage_no_effect),
		bridge_logic_body_damage_state_after_attempt_damage,
		bridge_logic_body_health_after_attempt_damage,
		bridge_logic_body_max_health_after_attempt_damage,
		bridge_logic_damage_state_after_attempt_update,
		bool_json(bridge_logic_damage_state_changed_after_attempt_update),
		bool_json(bridge_logic_broken_after_attempt_update),
		bool_json(bridge_logic_repaired_after_attempt_update),
		bool_json(bridge_logic_kill_invoked),
		bool_json(bridge_logic_kill_object_still_present),
		bool_json(bridge_logic_kill_destroyed_status),
		bridge_logic_body_damage_state_after_kill,
		bridge_logic_body_health_after_kill,
		bridge_logic_body_max_health_after_kill,
		bridge_logic_damage_state_after_kill_update,
		bool_json(bridge_logic_damage_state_changed_after_kill_update),
		bool_json(bridge_logic_broken_after_kill_update),
		bool_json(bridge_logic_repaired_after_kill_update),
		bool_json(bridge_logic_sole_healing_invoked),
		bool_json(bridge_logic_sole_healing_null_source_accepted),
		bool_json(bridge_logic_sole_healing_first_accepted),
		bool_json(bridge_logic_sole_healing_repeat_accepted),
		bool_json(bridge_logic_sole_healing_benefactor_matches_bridge),
		bool_json(bridge_logic_sole_healing_object_still_present),
		bool_json(bridge_logic_sole_healing_destroyed_status),
		bridge_logic_body_damage_state_after_sole_healing,
		bridge_logic_body_health_after_sole_healing,
		bridge_logic_body_max_health_after_sole_healing,
		bridge_logic_damage_state_after_sole_healing_update,
		bool_json(bridge_logic_damage_state_changed_after_sole_healing_update),
		bool_json(bridge_logic_broken_after_sole_healing_update),
		bool_json(bridge_logic_repaired_after_sole_healing_update),
		bool_json(bridge_logic_disabled_timer_invoked),
		bool_json(bridge_logic_disabled_timer.clearInactiveReturned),
		bool_json(bridge_logic_disabled_timer.initiallyDisabled),
		bridge_logic_disabled_timer.initialDisabledUntilAny,
		bridge_logic_disabled_timer.frameBeforeSet,
		bridge_logic_disabled_timer.expirationFrame,
		bool_json(bridge_logic_disabled_timer.disabledAfterSet),
		bool_json(bridge_logic_disabled_timer.disabledByEmpAfterSet),
		bridge_logic_disabled_timer.disabledUntilEmpAfterSet,
		bridge_logic_disabled_timer.disabledUntilAnyAfterSet,
		bool_json(bridge_logic_disabled_timer.disabledAfterEarlyCheck),
		bool_json(bridge_logic_disabled_timer.disabledByEmpAfterEarlyCheck),
		bridge_logic_disabled_timer.disabledUntilEmpAfterEarlyCheck,
		bridge_logic_disabled_timer.disabledUntilAnyAfterEarlyCheck,
		bridge_logic_disabled_timer.frameAfterExpiryCheck,
		bool_json(bridge_logic_disabled_timer.disabledAfterExpiryCheck),
		bool_json(bridge_logic_disabled_timer.disabledByEmpAfterExpiryCheck),
		bridge_logic_disabled_timer.disabledUntilEmpAfterExpiryCheck,
		bridge_logic_disabled_timer.disabledUntilAnyAfterExpiryCheck,
		bool_json(bridge_logic_invulnerable_state_invoked),
		bool_json(bridge_logic_invulnerable_state.initiallyUndetectedDefector),
		bool_json(bridge_logic_invulnerable_state.undetectedDefectorAfterPositive),
		bool_json(bridge_logic_invulnerable_state.undetectedDefectorAfterZero),
		bridge_draw_first_damage_state_after_invulnerable_state_scene,
		bool_json(bridge_draw_damage_sync.primed),
		bool_json(bridge_draw_damage_sync.observedDuringDraw),
		bool_json(bridge_draw_damage_sync.forcedMismatch),
		bool_json(bridge_draw_damage_sync.matchedTerrainAfterDraw),
		bridge_draw_damage_sync.bridgeIndex,
		bridge_draw_damage_sync.terrainDamageState,
		bridge_draw_damage_sync.visualStateBeforePrime,
		bridge_draw_damage_sync.visualStateBeforeDraw,
		bridge_draw_damage_sync.visualStateAfterDraw,
		bridge_draw_damage_sync.verticesBeforeDraw,
		bridge_draw_damage_sync.indicesBeforeDraw,
		bridge_draw_damage_sync.verticesAfterDraw,
		bridge_draw_damage_sync.indicesAfterDraw,
		bool_json(bridge_logic_destroy_list_invoked),
		bridge_logic_destroy_list.bridgeObjectID,
		bridge_logic_destroy_list.objectCountBeforeDestroy,
		bridge_logic_destroy_list.objectCountAfterDestroyObject,
		bridge_logic_destroy_list.objectCountAfterProcess,
		bool_json(bridge_logic_destroy_list.lookupBeforeDestroy),
		bool_json(bridge_logic_destroy_list.destroyedBeforeDestroy),
		bool_json(bridge_logic_destroy_list.destroyedAfterDestroyObject),
		bool_json(bridge_logic_destroy_list.lookupAfterDestroyObject),
		bool_json(bridge_logic_destroy_list.lookupAfterProcessNull),
		bridge_logic_first_layer_after_seed,
		bool_json(bridge_logic_pathfinder_map_invoked),
		bool_json(bridge_logic_pathfinder_map.newMapInvoked),
		bool_json(bridge_logic_pathfinder_map.newMapException),
		static_cast<int>(bridge_logic_pathfinder_map.layer),
		bridge_logic_pathfinder_map.preflightMinX,
		bridge_logic_pathfinder_map.preflightMinY,
		bridge_logic_pathfinder_map.preflightMaxX,
		bridge_logic_pathfinder_map.preflightMaxY,
		bridge_logic_pathfinder_map.preflightEstimatedMapCells,
		bool_json(bridge_logic_pathfinder_map.newMapSkippedForBrowserSafety),
		bridge_logic_pathfinder_map.terrainCliffQueries,
		bridge_logic_pathfinder_map.terrainCliffRenderObjectQueries,
		bridge_logic_pathfinder_map.terrainCliffTrueCells,
		bridge_logic_pathfinder_map.terrainFlatWaterQueries,
		bridge_logic_pathfinder_map.afterNewMap.extentMaxX,
		bridge_logic_pathfinder_map.afterNewMap.extentMaxY,
		bridge_logic_pathfinder_map.afterNewMap.bridgeLayerCells,
		bridge_logic_pathfinder_map.afterNewMap.bridgeLayerClearCells,
		bridge_logic_pathfinder_map.afterNewMap.bridgeLayerBridgeImpassableCells,
		bridge_logic_pathfinder_map.afterNewMap.bridgeLayerGroundConnections,
		bridge_logic_pathfinder_map.afterNewMap.groundCells,
		bridge_logic_pathfinder_map.afterNewMap.groundBridgeConnections,
		bridge_logic_pathfinder_map.afterNewMap.centerCellType,
		bridge_logic_pathfinder_map.afterNewMap.centerConnectLayer,
		bool_json(bridge_logic_pathfinder_map.afterNewMap.centerCellOnBridgeLayer),
		bool_json(bridge_logic_pathfinder_map.changeToBrokenInvoked),
		bridge_logic_pathfinder_map.afterBroken.bridgeLayerCells,
		bridge_logic_pathfinder_map.afterBroken.bridgeLayerClearCells,
		bridge_logic_pathfinder_map.afterBroken.bridgeLayerBridgeImpassableCells,
		bridge_logic_pathfinder_map.afterBroken.bridgeLayerGroundConnections,
		bridge_logic_pathfinder_map.afterBroken.groundBridgeConnections,
		bool_json(bridge_logic_pathfinder_map.changeToRepairedInvoked),
		bridge_logic_pathfinder_map.afterRepaired.bridgeLayerCells,
		bridge_logic_pathfinder_map.afterRepaired.bridgeLayerClearCells,
		bridge_logic_pathfinder_map.afterRepaired.bridgeLayerBridgeImpassableCells,
		bridge_logic_pathfinder_map.afterRepaired.bridgeLayerGroundConnections,
		bridge_logic_pathfinder_map.afterRepaired.groundBridgeConnections,
		bridge_logic_pathfinder_map.afterRepaired.centerCellType,
		bridge_logic_pathfinder_map.afterRepaired.centerConnectLayer,
		bool_json(bridge_logic_pathfinder_map.afterRepaired.centerCellOnBridgeLayer),
		bridge_draw_terrain_logic_bridge_count,
		bridge_draw_enabled_bridge_count,
		bool_json(scene_created),
		bool_json(scene_object_added),
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(render_object != nullptr && render_object->probeBridgeDrawInvoked()),
		bool_json(render_object != nullptr && render_object->probeBridgeDrawWrapperInvoked()),
		bool_json(render_object != nullptr &&
			render_object->probeBridgeDrawWrapperWireframe()),
		bool_json(render_object != nullptr &&
			render_object->probeBridgeTerrainRenderObjectPinned()),
		bool_json(render_object != nullptr &&
			render_object->probeBridgeShroudOverlaySuppressed()),
		bool_json(render_object != nullptr &&
			render_object->probeBridgeShroudTextureReady()),
		bool_json(render_object != nullptr &&
			render_object->probeBridgeShroudDrawSeen()),
		render_object != nullptr ? render_object->probeBridgeDrawCallsBefore() : 0,
		render_object != nullptr ? render_object->probeBridgeDrawCallsAfter() : 0,
		render_object != nullptr ? render_object->probeBridgeDrawCallDelta() : 0,
		render_object != nullptr ? render_object->probeBridgeShroudDrawCallsBefore() : 0,
		render_object != nullptr ? render_object->probeBridgeShroudDrawCallsAfter() : 0,
		bool_json(bridge_scene_draw_flushed),
		bool_json(logical_terrain_map_objects.attempted),
		bool_json(logical_terrain_map_objects.localGlobalDataInstalled),
		bool_json(logical_terrain_map_objects.mapCacheInstalled),
		bool_json(logical_terrain_map_objects.terrainLogicInstalled),
		bool_json(logical_terrain_map_objects.gameClientInstalled),
		bool_json(logical_terrain_map_objects.thingFactoryInstalled),
		bool_json(logical_terrain_map_objects.scriptEngineInstalled),
		bool_json(logical_terrain_map_objects.loadReturned),
		bool_json(logical_terrain_map_objects.loadException),
		logical_terrain_map_objects.loadError,
		logical_terrain_failure_phase_json.c_str(),
		logical_terrain_source_filename_json.c_str(),
		bool_json(logical_terrain_map_objects.sourceFilenameMatches),
		bool_json(logical_terrain_map_objects.mapObjectsPresentAfterLoad),
		bool_json(logical_map_objects_used),
		logical_terrain_map_objects.mapObjectCount,
		logical_terrain_map_objects.roadPoint1,
		logical_terrain_map_objects.roadPoint2,
		logical_terrain_map_objects.roadPairs,
		logical_terrain_map_objects.roadPairsWithRoadType,
		logical_terrain_map_objects.bridgePoint1,
		logical_terrain_map_objects.bridgePoint2,
		logical_terrain_map_objects.bridgePairs,
		logical_terrain_map_objects.bridgePairsWithBridgeType,
		bool_json(logical_terrain_map_objects.timeOfDayNotified),
		static_cast<int>(logical_terrain_map_objects.mapTimeOfDay),
		static_cast<int>(logical_terrain_map_objects.notifiedTimeOfDay),
		bool_json(bridge_pair_template_substituted_in_logical_list),
		bool_json(map_load.iniArchiveLoaded),
		bool_json(map_load.terrainIniExists),
		bool_json(map_load.terrainIniParsed),
		bool_json(map_load.defaultRoadsIniExists),
		bool_json(map_load.defaultRoadsIniParsed),
		bool_json(map_load.roadsIniExists),
		bool_json(map_load.roadsIniParsed),
		static_cast<unsigned long>(map_load.terrainTypeCount),
		static_cast<unsigned long>(map_load.terrainRoadCount),
		static_cast<unsigned long>(map_load.terrainBridgeCount),
		ini_layout_report_json.c_str(),
		terrain_map_entry_json.c_str(),
		bool_json(map_load.mapEntryExists),
		bool_json(map_load.mapEntryOpenable),
		bool_json(map_load.mapStreamOpen),
		bool_json(map_load.mapParsed),
		map_load.mapBytes,
		map_load.width,
		map_load.height,
		map_load.border,
		static_cast<unsigned long>(map_load.heightChecksum),
		kMapPatchVertices,
		kMapPatchCells,
		map != nullptr ? map->getDrawWidth() : 0,
		map != nullptr ? map->getDrawHeight() : 0,
		map != nullptr ? map->getDrawOrgX() : 0,
		map != nullptr ? map->getDrawOrgY() : 0,
		map_load.patchOriginX,
		map_load.patchOriginY,
		map_load.patchCenterHeight,
		static_cast<unsigned long>(map_load.patchHeightChecksum),
		map_load.bitmapTileCount,
		map_load.textureClassCount,
		map_load.sourceTilesLoaded,
		map_load.sourceTilesPositioned,
		map_load.patchTileCells,
		map_load.patchTilesWithSource,
		map_load.patchTilesMissingSource,
		map_load.firstPatchTileIndex,
		map_load.firstPatchBaseTileIndex,
		bool_json(map_load.firstPatchSourceTileLoaded),
		map_load.firstPatchTextureClass,
		first_patch_texture_class_json.c_str(),
		map_load.firstPatchTileTextureX,
		map_load.firstPatchTileTextureY,
		bool_json(scene_created),
		bool_json(scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
		bridge_object_metrics.mapObjects,
		bridge_object_metrics.bridgePoint1,
		bridge_object_metrics.bridgePoint2,
		bridge_pair_candidate_count,
		selected_bridge_pair_candidate,
		bridge_pair_candidates_with_source,
		bridge_pair_candidates_with_model,
		bridge_pair_candidates_with_texture,
		bridge_pair_candidates_with_assets,
		bridge_pair_candidates_with_assets_and_source,
		selected_bridge_pair_source_cells,
		bool_json(selected_bridge_pair_model_available),
		bool_json(selected_bridge_pair_texture_available),
		bool_json(bridge_template_substituted),
		bool_json(bridge_pair_template_substituted_in_logical_list),
		selected_bridge_original_name_json.c_str(),
		selected_bridge_installed_name_json.c_str(),
		selected_bridge_model_json.c_str(),
		selected_bridge_texture_json.c_str(),
		bool_json(bridge_asset_diagnostics.modelArchiveExists),
		bool_json(bridge_asset_diagnostics.textureArchiveExists),
		bool_json(bridge_asset_diagnostics.bareModelFileAvailable),
		bool_json(bridge_asset_diagnostics.bareTextureFileAvailable),
		bool_json(bridge_asset_diagnostics.loadBareModel),
		bool_json(bridge_asset_diagnostics.createModel),
		bridge_asset_diagnostics.modelClassId,
		bridge_asset_diagnostics.modelSubObjects,
		bool_json(bridge_asset_diagnostics.modelHasLeft),
		bool_json(bridge_asset_diagnostics.modelHasSpan),
		bool_json(bridge_asset_diagnostics.modelHasRight),
		bool_json(bridge_asset_diagnostics.createLeft),
		bool_json(bridge_asset_diagnostics.createSpan),
		bool_json(bridge_asset_diagnostics.createRight),
		bridge_asset_diagnostics.leftClassId,
		bridge_asset_diagnostics.spanClassId,
		bridge_asset_diagnostics.rightClassId,
		bridge_asset_diagnostics.leftVertices,
		bridge_asset_diagnostics.spanVertices,
		bridge_asset_diagnostics.rightVertices,
		bridge_asset_diagnostics.leftPolygons,
		bridge_asset_diagnostics.spanPolygons,
		bridge_asset_diagnostics.rightPolygons,
		bool_json(bridge_asset_diagnostics.createTexture),
		bridge_pair_candidate_summaries_json.c_str(),
		bridge_object_metrics.bridgePairs,
		bridge_object_metrics.bridgePairsWithBridgeType,
		first_bridge_name_json.c_str(),
		bridge_object_metrics.firstBridgeFlags,
		bridge_object_metrics.firstBridgeX,
		bridge_object_metrics.firstBridgeY,
		bridge_object_metrics.secondBridgeX,
		bridge_object_metrics.secondBridgeY,
		bridge_center_x,
		bridge_center_y,
		bridge_center_z,
		bridges_after_load,
		bool_json(bridge_manual_geometry_after_load),
		bool_json(bridge_manual_geometry_exception),
		bridge_manual_vertices_after_load,
		bridge_manual_indices_after_load,
		bridge_vertices_after_update,
		bridge_indices_after_update,
		bool_json(bridge_buffer != nullptr && bridge_buffer->hasVertexBuffer()),
		bool_json(bridge_buffer != nullptr && bridge_buffer->hasIndexBuffer()),
		roads_after_load,
		road_segments_with_vertices,
		road_types_with_textures,
		road_types_with_draw_data,
		total_road_type_vertices,
		total_road_type_indices,
		render_object != nullptr ? render_object->probeRoadDrawMinX() : 0,
		render_object != nullptr ? render_object->probeRoadDrawMaxX() : 0,
		render_object != nullptr ? render_object->probeRoadDrawMinY() : 0,
		render_object != nullptr ? render_object->probeRoadDrawMaxY() : 0,
		tree_model_json.c_str(),
		tree_texture_json.c_str(),
		tree_tiles_after_scene,
		tree_location_x,
		tree_location_y,
		tree_location_z,
		camera_eye_x,
		camera_eye_y,
		camera_eye_z,
		camera_target_x,
		camera_target_y,
		camera_target_z,
		runtime_assets_json.c_str(),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->set_vertex_shader_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->present_calls : 0,
		state != nullptr ? state->last_draw_primitive_type : 0,
		state != nullptr ? state->last_draw_vertex_shader : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0);

	target_json = buffer;

	if (scene != nullptr && render_object != nullptr && scene_object_added) {
		scene->Remove_Render_Object(render_object);
	}
	REF_PTR_RELEASE(scene);
	REF_PTR_RELEASE(render_object);
	REF_PTR_RELEASE(camera);
	TheTerrainRenderObject = old_terrain_render_object;
	TheTerrainLogic = old_terrain_logic;
	TheWaterTransparency = old_water_transparency;
	if (probe_water_transparency != nullptr &&
			probe_water_transparency != old_water_transparency) {
		probe_water_transparency->deleteInstance();
	}
	REF_PTR_RELEASE(map_load.map);
	map = nullptr;
	WorldHeightMap::freeListOfMapObjects();
	if (asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}

	if (succeeded(init_result)) {
		if (shader_manager_initialized)
			W3DShaderManager::shutdown();
		wasm_shutdown_ww3d_probe();
	}

	if (bridge_drawable_globals_installed) {
		TheGlobalLanguageData = old_global_language;
		TheDisplayStringManager = old_display_string_manager;
		TheFontLibrary = old_font_library;
	}
	TheArmorStore = old_armor_store;
	TheDamageFXStore = old_damage_fx_store;
	TheFXListStore = old_fx_list_store;
	TheAudio = old_audio;
	ThePartitionManager = old_partition_manager;
	TheGhostObjectManager = old_ghost_object_manager;
	TheRadar = old_radar;
	ThePlayerList = old_player_list;
	TheGameLogic = old_game_logic;
	TheModuleFactory = old_module_factory;
	TheWritableGlobalData = old_writable_global_data;
	g_ww3d_terrain_probe_shroud_enabled = old_shroud_enabled;
	delete global_data;
	return target_json.c_str();
}

const char *run_ww3d_shader_manager_probe(std::string &target_json)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = NEW GlobalData;
	bool global_data_ready = global_data != nullptr;
	if (global_data_ready) {
		configure_global_data(*global_data);
		TheWritableGlobalData = global_data;
	}

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	HRESULT adapter_result = E_FAIL;
	HRESULT caps_result = E_FAIL;
	HRESULT create_pixel_shader_result = E_FAIL;
	D3DADAPTER_IDENTIFIER8 adapter;
	D3DCAPS8 caps;
	::ZeroMemory(&adapter, sizeof(adapter));
	::ZeroMemory(&caps, sizeof(caps));
	DWORD pixel_shader_handle = 0;
	ChipsetType chipset_before = DC_UNKNOWN;
	ChipsetType chipset_after = DC_UNKNOWN;
	bool shader_manager_initialized = false;
	bool can_render_to_texture = false;
	Int terrain_base_passes = 0;
	Int terrain_noise12_passes = 0;
	Int flat_terrain_base_passes = 0;

	init_result = WW3D::Init(nullptr, nullptr, false);
	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		IDirect3D8 *direct3d = DX8Wrapper::_Get_D3D8();
		IDirect3DDevice8 *device = DX8Wrapper::_Get_D3D_Device8();
		if (direct3d != nullptr) {
			adapter_result = direct3d->GetAdapterIdentifier(0, D3DENUM_NO_WHQL_LEVEL, &adapter);
		}
		if (device != nullptr) {
			caps_result = device->GetDeviceCaps(&caps);
			create_pixel_shader_result = device->CreatePixelShader(nullptr, &pixel_shader_handle);
		}

		chipset_before = W3DShaderManager::getChipset();
		W3DShaderManager::init();
		shader_manager_initialized = true;
		chipset_after = W3DShaderManager::getChipset();
		can_render_to_texture = W3DShaderManager::canRenderToTexture();
		terrain_base_passes = W3DShaderManager::getShaderPasses(W3DShaderManager::ST_TERRAIN_BASE);
		terrain_noise12_passes = W3DShaderManager::getShaderPasses(W3DShaderManager::ST_TERRAIN_BASE_NOISE12);
		flat_terrain_base_passes = W3DShaderManager::getShaderPasses(W3DShaderManager::ST_FLAT_TERRAIN_BASE);
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		global_data_ready &&
		succeeded(init_result) &&
		succeeded(set_device_result) &&
		adapter_result == S_OK &&
		caps_result == S_OK &&
		adapter.VendorId == 0x121a &&
		adapter.DeviceId == 0x0009 &&
		caps.PixelShaderVersion == 0 &&
		create_pixel_shader_result == D3DERR_NOTAVAILABLE &&
		chipset_after == DC_VOODOO5 &&
		can_render_to_texture &&
		terrain_base_passes > 0 &&
		terrain_noise12_passes > 0 &&
		flat_terrain_base_passes > 0 &&
		state != nullptr &&
		state->create_texture_calls >= 1;

	const std::string description_json = json_string(adapter.Description);
	const std::string driver_json = json_string(adapter.Driver);
	char buffer[4096];
	std::snprintf(
		buffer,
		sizeof(buffer),
		"{\"source\":\"ww3d_shader_manager_probe\",\"ok\":%s,"
		"\"globalDataReady\":%s,\"initResult\":%d,\"setDeviceResult\":%d,"
		"\"adapterResult\":%ld,\"capsResult\":%ld,\"createPixelShaderResult\":%ld,"
		"\"adapter\":{\"description\":%s,\"driver\":%s,\"vendorId\":%lu,\"deviceId\":%lu},"
		"\"caps\":{\"maxSimultaneousTextures\":%lu,\"pixelShaderVersion\":%lu,"
		"\"vertexShaderVersion\":%lu,\"maxTextureBlendStages\":%lu},"
		"\"chipsetBefore\":%d,\"chipsetAfter\":%d,\"expectedChipset\":%d,"
		"\"shaderManagerInitialized\":%s,\"canRenderToTexture\":%s,"
		"\"shaderPasses\":{\"terrainBase\":%d,\"terrainNoise12\":%d,\"flatTerrainBase\":%d},"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,\"createPixelShaderUnavailable\":%s}}",
		bool_json(ok),
		bool_json(global_data_ready),
		init_result,
		set_device_result,
		static_cast<long>(adapter_result),
		static_cast<long>(caps_result),
		static_cast<long>(create_pixel_shader_result),
		description_json.c_str(),
		driver_json.c_str(),
		static_cast<unsigned long>(adapter.VendorId),
		static_cast<unsigned long>(adapter.DeviceId),
		static_cast<unsigned long>(caps.MaxSimultaneousTextures),
		static_cast<unsigned long>(caps.PixelShaderVersion),
		static_cast<unsigned long>(caps.VertexShaderVersion),
		static_cast<unsigned long>(caps.MaxTextureBlendStages),
		static_cast<int>(chipset_before),
		static_cast<int>(chipset_after),
		static_cast<int>(DC_VOODOO5),
		bool_json(shader_manager_initialized),
		bool_json(can_render_to_texture),
		terrain_base_passes,
		terrain_noise12_passes,
		flat_terrain_base_passes,
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		bool_json(create_pixel_shader_result == D3DERR_NOTAVAILABLE));
	target_json = buffer;

	if (succeeded(init_result)) {
		if (shader_manager_initialized) {
			W3DShaderManager::shutdown();
		}
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	delete global_data;
	return target_json.c_str();
}

const char *run_ww3d_terrain_prop_buffer_render_probe(
	std::string &target_json,
	const char *archive_path,
	const char *texture_archive_path)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	GlobalData *old_writable_global_data = TheWritableGlobalData;
	GlobalData *global_data = NEW GlobalData;
	bool global_data_ready = global_data != nullptr;
	if (global_data_ready) {
		configure_global_data(*global_data);
		TheWritableGlobalData = global_data;
	}

	int init_result = WW3D_ERROR_GENERIC;
	int set_device_result = WW3D_ERROR_GENERIC;
	int begin_render_result = WW3D_ERROR_GENERIC;
	int render_result = WW3D_ERROR_GENERIC;
	int end_render_result = WW3D_ERROR_GENERIC;
	bool runtime_asset_system_installed = false;
	bool texture_file_factory_installed = false;
	bool mesh_file_exists = false;
	bool texture_file_exists = false;
	bool asset_manager_created = false;
	bool buffer_created = false;
	bool initialized = false;
	bool add_prop_invoked = false;
	bool update_prop_invoked = false;
	bool do_full_update_invoked = false;
	bool prop_type_created = false;
	bool prop_render_object_created = false;
	bool prop_visible_for_camera = false;
	int prop_render_object_class_id = RenderObjClass::CLASSID_UNKNOWN;
	bool prop_mesh_normalized = false;
	bool remove_prop_invoked = false;
	bool clear_props_invoked = false;
	bool prop_removed = false;
	Int prop_types_after_add = -1;
	Int props_after_add = -1;
	Int props_after_update = -1;
	Int props_after_remove = -1;
	Int props_after_clear = -1;
	float prop_bounds_center_x = 0.0f;
	float prop_bounds_center_y = 0.0f;
	float prop_bounds_center_z = 0.0f;
	float prop_bounds_radius = 0.0f;

	WW3DAssetManager *asset_manager = nullptr;
	ProbeW3DPropBuffer *prop_buffer = nullptr;
	CameraClass *camera = nullptr;

	if (global_data_ready) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}
	if (succeeded(init_result)) {
		asset_manager = W3DNEW W3DAssetManager();
		asset_manager_created = asset_manager != nullptr;
	}

	if (asset_manager != nullptr) {
		asset_manager->Set_WW3D_Load_On_Demand(true);
	}
	if (asset_manager_created) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}
	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		runtime_asset_system_installed =
			wasm_browser_runtime_assets_install_archive_paths(archive_path, texture_archive_path);
		const WasmBrowserRuntimeAssetsState &runtime_assets = wasm_browser_runtime_assets_state();
		texture_file_factory_installed = runtime_assets.w3d_file_system_installed;
		mesh_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kPropMeshArchiveEntry);
		texture_file_exists =
			runtime_asset_system_installed &&
			wasm_browser_runtime_assets_file_exists(kPropTextureArchiveEntry);
	}

	if (mesh_file_exists && texture_file_exists) {
		prop_buffer = NEW ProbeW3DPropBuffer;
		buffer_created = prop_buffer != nullptr;
	}

	if (buffer_created) {
		initialized = prop_buffer->initialized();
		Coord3D location;
		location.set(0.0f, 0.0f, 0.0f);
		prop_buffer->addProp(kPropProbeId, location, 0.0f, 1.0f, AsciiString(kPropModelName));
		add_prop_invoked = true;
		props_after_add = prop_buffer->numProps();
		prop_types_after_add = prop_buffer->numPropTypes();
		prop_type_created = prop_buffer->hasPropTypeRenderObject(0);
		prop_render_object_created = prop_buffer->hasPropRenderObject(0);
		RenderObjClass *prop_render_object = prop_buffer->propRenderObject(0);
		prop_mesh_normalized =
			normalize_probe_prop_mesh(prop_render_object, prop_render_object_class_id);

		location.set(0.0f, 0.0f, 0.0f);
		update_prop_invoked = prop_buffer->updatePropPosition(kPropProbeId, location, 0.0f, 1.0f);
		props_after_update = prop_buffer->numProps();
		const SphereClass bounds = prop_buffer->propBounds(0);
		prop_bounds_center_x = bounds.Center.X;
		prop_bounds_center_y = bounds.Center.Y;
		prop_bounds_center_z = bounds.Center.Z;
		prop_bounds_radius = bounds.Radius > 0.001f ? bounds.Radius : 1.0f;

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, std::max(1000.0f, prop_bounds_radius * 8.0f));
			Matrix3D camera_transform(true);
			const Vector3 target(prop_bounds_center_x, prop_bounds_center_y, prop_bounds_center_z);
			const Vector3 eye(
				prop_bounds_center_x,
				prop_bounds_center_y - prop_bounds_radius * 0.25f,
				prop_bounds_center_z + prop_bounds_radius * 3.0f);
			camera_transform.Look_At(eye, target, 0.0f);
			camera->Set_Transform(camera_transform);
		}
	}

	if (camera != nullptr && prop_render_object_created) {
		prop_buffer->doFullUpdate();
		do_full_update_invoked = true;
		prop_buffer->cullForProbe(camera);
		prop_visible_for_camera = prop_buffer->propVisible(0);
		RenderInfoClass render_info(*camera);
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			RenderObjClass *prop_render_object = prop_buffer->propRenderObject(0);
			render_result =
				prop_render_object != nullptr ? WW3D::Render(*prop_render_object, render_info) : WW3D_ERROR_GENERIC;
			end_render_result = WW3D::End_Render(false);
		}

		prop_buffer->removeProp(kPropProbeId);
		remove_prop_invoked = true;
		props_after_remove = prop_buffer->numProps();
		prop_removed = !prop_buffer->hasPropRenderObject(0);
		prop_buffer->clearAllProps();
		clear_props_invoked = true;
		props_after_clear = prop_buffer->numProps();
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const WasmD3D8DrawRenderState *draw_state =
		state != nullptr ? &state->last_draw_render_state : nullptr;
	const WasmD3D8DrawTextureStageState *stage0 =
		draw_state != nullptr ? &draw_state->texture_stages[0] : nullptr;
	const bool ok =
		state != nullptr &&
		global_data_ready &&
		succeeded(init_result) &&
		asset_manager_created &&
		succeeded(set_device_result) &&
		runtime_asset_system_installed &&
		texture_file_factory_installed &&
		mesh_file_exists &&
		texture_file_exists &&
		buffer_created &&
		initialized &&
		add_prop_invoked &&
		props_after_add == 1 &&
		prop_types_after_add == 1 &&
		prop_type_created &&
		prop_render_object_created &&
		prop_render_object_class_id == RenderObjClass::CLASSID_MESH &&
		prop_mesh_normalized &&
		update_prop_invoked &&
		props_after_update == 1 &&
		do_full_update_invoked &&
		prop_visible_for_camera &&
		succeeded(begin_render_result) &&
		succeeded(render_result) &&
		succeeded(end_render_result) &&
		remove_prop_invoked &&
		props_after_remove == 1 &&
		prop_removed &&
		clear_props_invoked &&
		props_after_clear == 0 &&
		state->browser_texture_create_calls >= 1 &&
		state->browser_texture_update_calls >= 1 &&
		state->browser_texture_bind_calls >= 1 &&
		state->browser_buffer_create_calls >= 2 &&
		state->browser_buffer_update_calls >= 2 &&
		state->set_stream_source_calls >= 1 &&
		state->set_indices_calls >= 1 &&
		state->set_texture_calls >= 1 &&
		state->draw_indexed_primitive_calls >= 1 &&
		stage0 != nullptr &&
		stage0->values[D3DTSS_COLOROP] != D3DTOP_DISABLE;

	const std::string archive_json = json_string(archive_path != nullptr ? archive_path : "");
	const std::string texture_archive_json =
		json_string(texture_archive_path != nullptr ? texture_archive_path : "");
	const std::string prop_model_json = json_string(kPropModelName);
	const std::string prop_mesh_entry_json = json_string(kPropMeshArchiveEntry);
	const std::string prop_texture_entry_json = json_string(kPropTextureArchiveEntry);
	const std::string runtime_assets_json = wasm_browser_runtime_assets_state_json();

	char buffer[10000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_prop_buffer_render_probe\","
		"\"ok\":%s,"
		"\"path\":\"original W3DPropBuffer addProp -> updatePropPosition -> "
		"doFullUpdate/cull -> WW3D::Render prop render object -> "
		"removeProp -> clearAllProps\","
		"\"archives\":{\"mesh\":%s,\"texture\":%s},"
		"\"asset\":{\"model\":%s,\"meshEntry\":%s,"
		"\"textureEntry\":%s},"
		"\"results\":{\"globalDataReady\":%s,\"init\":%d,"
		"\"assetManagerCreated\":%s,\"setRenderDevice\":%d,"
		"\"runtimeAssetSystemInstalled\":%s,"
		"\"textureFileFactoryInstalled\":%s,"
		"\"meshFileExists\":%s,\"textureFileExists\":%s,"
		"\"bufferCreated\":%s,\"initialized\":%s,"
		"\"addPropInvoked\":%s,\"updatePropInvoked\":%s,"
		"\"doFullUpdateInvoked\":%s,\"propTypeCreated\":%s,"
		"\"propRenderObjectCreated\":%s,\"propVisibleForCamera\":%s,"
		"\"beginRender\":%d,\"render\":%d,\"endRender\":%d,"
		"\"removePropInvoked\":%s,\"propRemoved\":%s,"
		"\"clearPropsInvoked\":%s,\"propRenderObjectClassId\":%d,"
		"\"propMeshNormalized\":%s},"
		"\"props\":{\"afterAdd\":%d,\"typesAfterAdd\":%d,"
		"\"afterUpdate\":%d,\"afterRemove\":%d,\"afterClear\":%d,"
		"\"bounds\":{\"center\":[%.4f,%.4f,%.4f],\"radius\":%.4f}},"
		"\"runtimeAssets\":%s,"
		"\"calls\":{\"createDevice\":%u,\"createTexture\":%u,"
		"\"createVertexBuffer\":%u,\"createIndexBuffer\":%u,"
		"\"browserTextureCreate\":%u,\"browserTextureUpdate\":%u,"
		"\"browserTextureBind\":%u,\"browserTextureRelease\":%u,"
		"\"browserBufferCreate\":%u,\"browserBufferUpdate\":%u,"
		"\"browserBufferRelease\":%u,\"setTexture\":%u,"
		"\"setStreamSource\":%u,\"setIndices\":%u,"
		"\"drawIndexed\":%u,\"setTransform\":%u,\"clear\":%u},"
		"\"draw\":{\"primitiveType\":%u,\"vertexCount\":%u,"
		"\"primitiveCount\":%u,\"vertexStride\":%u,"
		"\"vertexBufferId\":%u,\"indexBufferId\":%u,"
		"\"texture0ColorOp\":%lu,\"texture0ColorArg1\":%lu,"
		"\"texture0ColorArg2\":%lu}}",
		bool_json(ok),
		archive_json.c_str(),
		texture_archive_json.c_str(),
		prop_model_json.c_str(),
		prop_mesh_entry_json.c_str(),
		prop_texture_entry_json.c_str(),
		bool_json(global_data_ready),
		init_result,
		bool_json(asset_manager_created),
		set_device_result,
		bool_json(runtime_asset_system_installed),
		bool_json(texture_file_factory_installed),
		bool_json(mesh_file_exists),
		bool_json(texture_file_exists),
		bool_json(buffer_created),
		bool_json(initialized),
		bool_json(add_prop_invoked),
		bool_json(update_prop_invoked),
		bool_json(do_full_update_invoked),
		bool_json(prop_type_created),
		bool_json(prop_render_object_created),
		bool_json(prop_visible_for_camera),
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(remove_prop_invoked),
		bool_json(prop_removed),
		bool_json(clear_props_invoked),
		prop_render_object_class_id,
		bool_json(prop_mesh_normalized),
		props_after_add,
		prop_types_after_add,
		props_after_update,
		props_after_remove,
		props_after_clear,
		prop_bounds_center_x,
		prop_bounds_center_y,
		prop_bounds_center_z,
		prop_bounds_radius,
		runtime_assets_json.c_str(),
		state != nullptr ? state->create_device_calls : 0,
		state != nullptr ? state->create_texture_calls : 0,
		state != nullptr ? state->create_vertex_buffer_calls : 0,
		state != nullptr ? state->create_index_buffer_calls : 0,
		state != nullptr ? state->browser_texture_create_calls : 0,
		state != nullptr ? state->browser_texture_update_calls : 0,
		state != nullptr ? state->browser_texture_bind_calls : 0,
		state != nullptr ? state->browser_texture_release_calls : 0,
		state != nullptr ? state->browser_buffer_create_calls : 0,
		state != nullptr ? state->browser_buffer_update_calls : 0,
		state != nullptr ? state->browser_buffer_release_calls : 0,
		state != nullptr ? state->set_texture_calls : 0,
		state != nullptr ? state->set_stream_source_calls : 0,
		state != nullptr ? state->set_indices_calls : 0,
		state != nullptr ? state->draw_indexed_primitive_calls : 0,
		state != nullptr ? state->set_transform_calls : 0,
		state != nullptr ? state->clear_calls : 0,
		state != nullptr ? state->last_draw_primitive_type : 0,
		state != nullptr ? state->last_draw_vertex_count : 0,
		state != nullptr ? state->last_draw_primitive_count : 0,
		state != nullptr ? state->last_draw_stream_source_stride : 0,
		state != nullptr ? state->last_draw_vertex_buffer_id : 0,
		state != nullptr ? state->last_draw_index_buffer_id : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLOROP] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG1] : 0,
		stage0 != nullptr ? stage0->values[D3DTSS_COLORARG2] : 0);

	target_json = buffer;

	delete prop_buffer;
	prop_buffer = nullptr;
	REF_PTR_RELEASE(camera);
	if (asset_manager != nullptr) {
		delete asset_manager;
		asset_manager = nullptr;
	}
	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;
	delete global_data;

	return target_json.c_str();
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_tile()
{
	return run_ww3d_terrain_tile_probe(
		g_ww3d_terrain_tile_probe_json,
		"ww3d_terrain_tile_probe",
		nullptr,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_tile_archive(const char *terrain_archive_path)
{
	ProbeTerrainArchiveTileLoad archive_tile_load;
	archive_tile_load.archivePath = terrain_archive_path != nullptr ? terrain_archive_path : "";
	return run_ww3d_terrain_tile_probe(
		g_ww3d_terrain_tile_archive_probe_json,
		"ww3d_terrain_tile_archive_probe",
		&archive_tile_load,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_tile_archive_scene(const char *terrain_archive_path)
{
	ProbeTerrainArchiveTileLoad archive_tile_load;
	archive_tile_load.archivePath = terrain_archive_path != nullptr ? terrain_archive_path : "";
	return run_ww3d_terrain_tile_probe(
		g_ww3d_terrain_tile_archive_scene_probe_json,
		"ww3d_terrain_tile_archive_scene_probe",
		&archive_tile_load,
		true);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_map_patch_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_map_patch_scene_probe(
		g_ww3d_terrain_map_patch_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_shroud_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_map_patch_scene_probe(
		g_ww3d_terrain_shroud_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		true);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_visual_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_visual_scene_probe(
		g_ww3d_terrain_visual_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		false,
		false,
		false,
		false,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_visual_shroud_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_visual_scene_probe(
		g_ww3d_terrain_visual_shroud_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		false,
		false,
		false,
		true,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_visual_shroud_update_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_visual_scene_probe(
		g_ww3d_terrain_visual_shroud_update_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		false,
		false,
		false,
		false,
		true);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_full_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_visual_scene_probe(
		g_ww3d_terrain_full_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		true,
		false,
		false,
		false,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_full_scene_shroud_update(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_visual_scene_probe(
		g_ww3d_terrain_full_scene_shroud_update_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		true,
		false,
		false,
		false,
		true);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_visual_load_window_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_visual_scene_probe(
		g_ww3d_terrain_visual_load_window_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		false,
		true,
		false,
		false,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_visual_camera_pan_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path)
{
	return run_ww3d_terrain_visual_scene_probe(
		g_ww3d_terrain_visual_camera_pan_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		false,
		false,
		true,
		false,
		false);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_bib_buffer_lifecycle()
{
	return run_ww3d_terrain_bib_buffer_lifecycle_probe(
		g_ww3d_terrain_bib_buffer_lifecycle_probe_json);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_prop_buffer_render(
	const char *archive_path,
	const char *texture_archive_path)
{
	return run_ww3d_terrain_prop_buffer_render_probe(
		g_ww3d_terrain_prop_buffer_render_probe_json,
		archive_path,
		texture_archive_path);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_prop_buffer_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *archive_path,
	const char *texture_archive_path)
{
	return run_ww3d_terrain_prop_buffer_scene_probe(
		g_ww3d_terrain_prop_buffer_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		archive_path,
		texture_archive_path);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_tree_buffer_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *runtime_archive_directory,
	const char *runtime_archive_mask)
{
	return run_ww3d_terrain_tree_buffer_scene_probe(
		g_ww3d_terrain_tree_buffer_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		runtime_archive_directory,
		runtime_archive_mask);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_road_buffer_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *runtime_archive_directory,
	const char *runtime_archive_mask,
	const char *map_entry)
{
	return run_ww3d_terrain_road_buffer_scene_probe(
		g_ww3d_terrain_road_buffer_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		runtime_archive_directory,
		runtime_archive_mask,
		map_entry);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_bridge_buffer_scene(
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	const char *runtime_archive_directory,
	const char *runtime_archive_mask,
	const char *map_entry)
{
	return run_ww3d_terrain_bridge_buffer_scene_probe(
		g_ww3d_terrain_bridge_buffer_scene_probe_json,
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		runtime_archive_directory,
		runtime_archive_mask,
		map_entry);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_shader_manager()
{
	return run_ww3d_shader_manager_probe(
		g_ww3d_shader_manager_probe_json);
}

}
