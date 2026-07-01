#include <algorithm>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#ifndef __PRERTS_H__
#define __PRERTS_H__
#endif

#include "windows.h"
#include "mmsystem.h"
#include "wwvegas_port.h"
#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/LocalFileSystem.h"
#include "Common/MapReaderWriterInfo.h"
#include "Common/NameKeyGenerator.h"
#include "Common/TerrainTypes.h"
#include "GameLogic/PolygonTrigger.h"
#include "GameLogic/SidesList.h"
#include "GameLogic/Scripts.h"
#include "GameClient/View.h"
#include "GameClient/Water.h"
#include "W3DDevice/GameClient/BaseHeightMap.h"
#include "W3DDevice/GameClient/HeightMap.h"
#include "W3DDevice/GameClient/W3DDisplay.h"
#include "W3DDevice/GameClient/W3DScene.h"
#include "W3DDevice/GameClient/W3DShaderManager.h"
#include "W3DDevice/GameClient/TileData.h"
#include "W3DDevice/GameClient/W3DTerrainBackground.h"
#include "W3DDevice/GameClient/W3DTerrainVisual.h"
#include "W3DDevice/GameClient/WorldHeightMap.h"
#include "camera.h"
#include "coltype.h"
#include "dx8fvf.h"
#include "dx8wrapper.h"
#include "rinfo.h"
#include "shader.h"
#include "vertmaterial.h"
#include "wasm_d3d8_shim.h"
#include "wasm_ww3d_probe_lifetime.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
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

namespace {

std::string g_ww3d_terrain_tile_probe_json;
std::string g_ww3d_terrain_tile_archive_probe_json;
std::string g_ww3d_terrain_tile_archive_scene_probe_json;
std::string g_ww3d_terrain_map_patch_scene_probe_json;
std::string g_ww3d_terrain_visual_scene_probe_json;
std::string g_ww3d_terrain_visual_load_window_scene_probe_json;

constexpr int kMapCells = 16;
constexpr int kMapVertices = kMapCells + 1;
constexpr int kMapPatchCells = 32;
constexpr int kMapPatchVertices = kMapPatchCells + 1;
constexpr int kViewportWidth = 800;
constexpr int kViewportHeight = 600;
constexpr unsigned int kExpectedFlatTextureSize = kMapCells * 8;
constexpr unsigned int kMapPatchExpectedFlatTextureSize = kMapPatchCells * 8;
constexpr const char *kArchiveTerrainTileEntry = "Art\\Terrain\\PTBlossom01.tga";
constexpr const char *kArchiveTerrainMapEntry = "Maps\\MD_GLA03\\MD_GLA03.map";
constexpr const char *kArchiveDefaultTerrainIniEntry = "Data\\INI\\Default\\Terrain.ini";
constexpr const char *kArchiveTerrainIniEntry = "Data\\INI\\Terrain.ini";
constexpr int kTextureClassDiagnosticsLimit = 6;

bool succeeded(int result)
{
	return result == WW3D_ERROR_OK;
}

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

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

void touch_ini_separator_table(const INI *ini)
{
	if (ini == nullptr) {
		return;
	}
	volatile const char *ini_separators = ini->getSeps();
	(void)ini_separators;
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
						touch_ini_separator_table(ini);
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
		TheSidesList = m_oldSidesList;
		TheNameKeyGenerator = m_oldNameKeyGenerator;

		delete m_sidesList;
		delete m_terrainTypes;
		delete m_nameKeyGenerator;
	}

	bool prepare(
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
							touch_ini_separator_table(ini);
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
			m_archiveFileSystem.getFileInfo(AsciiString(kArchiveTerrainMapEntry), &map_file_info) &&
			map_file_info.sizeHigh == 0 &&
			map_file_info.sizeLow > 0;

		if (load.mapEntryExists) {
			File *map_file = TheFileSystem->openFile(kArchiveTerrainMapEntry, File::READ | File::BINARY);
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

	FileSystem *fileSystem()
	{
		return &m_fileSystem;
	}

private:
	Win32LocalFileSystem m_localFileSystem;
	Win32BIGFileSystem m_archiveFileSystem;
	FileSystem m_fileSystem;
	TerrainTypeCollection *m_terrainTypes = nullptr;
	SidesList *m_sidesList = nullptr;
	NameKeyGenerator *m_nameKeyGenerator = nullptr;
	LocalFileSystem *m_oldLocalFileSystem = nullptr;
	ArchiveFileSystem *m_oldArchiveFileSystem = nullptr;
	FileSystem *m_oldFileSystem = nullptr;
	TerrainTypeCollection *m_oldTerrainTypes = nullptr;
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
};

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

void configure_global_data(GlobalData &global_data)
{
	global_data.m_textureReductionFactor = 0;
	global_data.m_useCloudMap = FALSE;
	global_data.m_useLightMap = FALSE;
	global_data.m_showSoftWaterEdge = FALSE;
	global_data.m_use3WayTerrainBlends = FALSE;
	global_data.m_drawEntireTerrain = FALSE;
	global_data.m_stretchTerrain = FALSE;
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
}

} // namespace

View *TheTacticalView __attribute__((weak)) = nullptr;
class WaterRenderObjClass;
class TerrainTracksRenderObjClassSystem;
class W3DSmudgeManager;
class W3DProjectedShadowManager;
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

const char *run_ww3d_terrain_tile_probe(
	std::string &target_json,
	const char *source_name,
	ProbeTerrainArchiveTileLoad *archive_tile_load,
	bool render_via_scene = false)
{
	initMemoryManager();
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
	const char *terrain_archive_path)
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
	bool water_transparency_ready = false;
	bool render_object_created = false;
	bool render_object_initialized = false;
	bool scene_created = false;
	bool scene_object_added = false;

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
		}
	}

	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	HeightMapRenderObjClass *render_object = nullptr;
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

		if (old_water_transparency != nullptr) {
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

			render_object = NEW_REF(HeightMapRenderObjClass, ());
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
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(scene, camera);
			end_render_result = WW3D::End_Render(false);
		}
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

	char buffer[18000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_map_patch_scene_probe\","
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
		"\"renderObject\":\"HeightMapRenderObjClass\","
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
		"RTS3DScene::Customized_Render -> CLASSID_TILEMAP Render -> "
		"HeightMapRenderObjClass::Render\","
		"\"created\":%s,\"objectAdded\":%s,\"terrainClassId\":%d},"
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
		bool_json(scene_created),
		bool_json(scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
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

	return target_json.c_str();
}

const char *run_ww3d_terrain_visual_scene_probe(
	std::string &target_json,
	const char *ini_archive_path,
	const char *maps_archive_path,
	const char *terrain_archive_path,
	bool use_load_window)
{
	initMemoryManager();
	wasm_d3d8_reset_state();

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
	bool archive_context_ready = false;
	bool map_created = false;
	bool water_transparency_ready = false;
	bool visual_created = false;
	bool render_object_created = false;
	bool render_object_installed = false;
	bool visual_load_returned = false;
	bool visual_load_exception = false;
	bool visual_load_initialized_render_object = false;
	bool scene_created = false;
	bool visual_scene_object_added = false;
	bool load_window_render_selected = false;
	bool patch_reinitialized = false;
	bool shader_manager_initialized = false;
	Int visual_load_draw_width = 0;
	Int visual_load_draw_height = 0;
	Int visual_load_draw_origin_x = 0;
	Int visual_load_draw_origin_y = 0;
	Int render_window_width = 0;
	Int render_window_height = 0;
	Int render_window_cells = 0;
	UnsignedInt render_expected_flat_texture_size = 0;

	ProbeTerrainMapPatchLoad map_load;
	ProbeTerrainArchiveContext archive_context;
	archive_context_ready = archive_context.prepare(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load);

	if (archive_context_ready) {
		global_data = NEW GlobalData;
		if (global_data != nullptr) {
			configure_global_data(*global_data);
			TheWritableGlobalData = global_data;
		}
	}

	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterTransparencySetting *probe_water_transparency = nullptr;
	ProbeW3DTerrainVisual *visual = nullptr;
	HeightMapRenderObjClass *render_object = nullptr;
	CameraClass *camera = nullptr;
	WorldHeightMap *map = nullptr;

	if (archive_context_ready && global_data != nullptr) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result)) {
		WW3D::Set_Thumbnail_Enabled(false);
		W3DShaderManager::init();
		shader_manager_initialized = true;

		if (old_water_transparency != nullptr) {
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
			render_object = NEW_REF(HeightMapRenderObjClass, ());
			render_object_created = render_object != nullptr;
			render_object_installed = visual->installTerrainRenderObject(render_object);
			if (!render_object_installed) {
				REF_PTR_RELEASE(render_object);
			}
		}
	}

	if (render_object_installed) {
		try {
			visual_load_returned = visual->W3DTerrainVisual::load(AsciiString(kArchiveTerrainMapEntry));
		} catch (...) {
			visual_load_exception = true;
			visual_load_returned = false;
		}
	}

	if (visual_load_returned && visual != nullptr) {
		map = visual->getLogicHeightMap();
		map_created = map != nullptr;
		map_load.map = map;
		map_load.mapStreamOpen = map_created;
		map_load.mapParsed = map_created;
		if (map_created) {
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
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			const float camera_far_clip = use_load_window ? 6000.0f : 1000.0f;
			camera->Set_Clip_Planes(1.0f, camera_far_clip);
			const float terrain_center_z = static_cast<float>(map_load.patchCenterHeight) * MAP_HEIGHT_SCALE;
			const float render_span = static_cast<float>(std::max(1, render_window_cells)) * MAP_XY_FACTOR;
			const float camera_lift = use_load_window ? std::max(360.0f, render_span * 0.7f) : 240.0f;
			const float target_x = use_load_window ?
				(static_cast<float>(map_load.patchOriginX) +
				 static_cast<float>(render_window_cells) * 0.5f -
				 static_cast<float>(map_load.border)) * MAP_XY_FACTOR :
				0.0f;
			const float target_y = use_load_window ?
				(static_cast<float>(map_load.patchOriginY) +
				 static_cast<float>(render_window_cells) * 0.5f -
				 static_cast<float>(map_load.border)) * MAP_XY_FACTOR :
				0.0f;
			const float target_z = use_load_window ? terrain_center_z : terrain_center_z - 180.0f;
			Matrix3D camera_transform(true);
			camera_transform.Look_At(
				Vector3(target_x, target_y + render_span * 1.5f, target_z + camera_lift),
				Vector3(target_x, target_y, target_z),
				0.0f);
			camera->Set_Transform(camera_transform);
		}
	}

	if (camera != nullptr && W3DDisplay::m_3DScene != nullptr) {
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(W3DDisplay::m_3DScene, camera);
			end_render_result = WW3D::End_Render(false);
		}
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
		map_load.mapEntryExists &&
		map_load.mapEntryOpenable &&
		visual_created &&
		render_object_created &&
		render_object_installed &&
		visual_load_returned &&
		!visual_load_exception &&
		map_created &&
		visual_load_initialized_render_object &&
		scene_created &&
		visual_scene_object_added &&
		((use_load_window && load_window_render_selected && !patch_reinitialized) ||
			(!use_load_window && patch_reinitialized && patch_init_height_data_result == 0)) &&
		water_transparency_ready &&
		!visual->hasWaterRenderObject() &&
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

	const std::string first_patch_texture_class_json =
		json_string(map_load.firstPatchTextureClassName);
	const std::string terrain_map_entry_json = json_string(kArchiveTerrainMapEntry);
	const std::string ini_layout_report_json = ini_layout_json(ini_layout);
	const char *source_name = use_load_window ?
		"ww3d_terrain_visual_load_window_scene_probe" :
		"ww3d_terrain_visual_scene_probe";
	const char *render_mode = use_load_window ? "visual-load-window" : "selected-source-patch";

	char buffer[22000];
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
		"\"renderObjectCreated\":%s,\"renderObjectInstalled\":%s,"
		"\"visualLoadInitializedRenderObject\":%s,"
		"\"loadWindowRenderSelected\":%s,\"patchReinitialized\":%s},"
		"\"visual\":{\"class\":\"W3DTerrainVisual\","
		"\"loadPath\":\"W3DTerrainVisual::load -> TerrainVisual::load -> "
		"CachedFileInputStream -> WorldHeightMap -> HeightMapRenderObjClass::initHeightData -> "
		"W3DDisplay::m_3DScene::Add_Render_Object\","
		"\"ownedTerrainRenderObject\":%s,\"waterRenderObjectNull\":%s,"
		"\"loadDrawWidth\":%d,\"loadDrawHeight\":%d,"
		"\"loadDrawOriginX\":%d,\"loadDrawOriginY\":%d},"
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
		"\"renderObject\":\"HeightMapRenderObjClass\","
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
		"\"scene\":{\"renderPath\":\"WW3D::Render(W3DDisplay::m_3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> CLASSID_TILEMAP Render -> "
		"HeightMapRenderObjClass::Render\","
		"\"created\":%s,\"objectAddedByVisualLoad\":%s,"
		"\"path\":\"W3DDisplay::m_3DScene\",\"terrainClassId\":%d},"
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
		bool_json(render_object_created),
		bool_json(render_object_installed),
		bool_json(visual_load_initialized_render_object),
		bool_json(load_window_render_selected),
		bool_json(patch_reinitialized),
		bool_json(visual_load_initialized_render_object),
		bool_json(visual != nullptr && !visual->hasWaterRenderObject()),
		visual_load_draw_width,
		visual_load_draw_height,
		visual_load_draw_origin_x,
		visual_load_draw_origin_y,
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
		bool_json(scene_created),
		bool_json(visual_scene_object_added),
		render_object != nullptr ? render_object->Class_ID() : RenderObjClass::CLASSID_UNKNOWN,
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
	RTS3DScene *owned_3d_scene = W3DDisplay::m_3DScene;
	W3DDisplay::m_3DScene = old_3d_scene;
	REF_PTR_RELEASE(owned_3d_scene);
	TheTerrainRenderObject = old_terrain_render_object;
	TheTerrainVisual = old_terrain_visual;
	TheWaterTransparency = old_water_transparency;
	if (probe_water_transparency != nullptr &&
			probe_water_transparency != old_water_transparency) {
		probe_water_transparency->deleteInstance();
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
		false);
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
		true);
}

}
