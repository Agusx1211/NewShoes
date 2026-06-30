#include <algorithm>
#include <cctype>
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
#include "Common/LocalFileSystem.h"
#include "Common/MapReaderWriterInfo.h"
#include "Common/NameKeyGenerator.h"
#include "Common/TerrainTypes.h"
#include "GameLogic/PolygonTrigger.h"
#include "GameLogic/SidesList.h"
#include "GameLogic/Scripts.h"
#include "GameClient/View.h"
#include "W3DDevice/GameClient/BaseHeightMap.h"
#include "W3DDevice/GameClient/W3DScene.h"
#include "W3DDevice/GameClient/TileData.h"
#include "W3DDevice/GameClient/W3DTerrainBackground.h"
#include "W3DDevice/GameClient/WorldHeightMap.h"
#include "camera.h"
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

namespace {

std::string g_ww3d_terrain_tile_probe_json;
std::string g_ww3d_terrain_tile_archive_probe_json;
std::string g_ww3d_terrain_tile_archive_scene_probe_json;
std::string g_ww3d_terrain_map_patch_scene_probe_json;

constexpr int kMapCells = 16;
constexpr int kMapVertices = kMapCells + 1;
constexpr int kViewportWidth = 800;
constexpr int kViewportHeight = 600;
constexpr unsigned int kExpectedFlatTextureSize = kMapCells * 8;
constexpr const char *kArchiveTerrainTileEntry = "Art\\Terrain\\PTBlossom01.tga";
constexpr const char *kArchiveTerrainMapEntry = "Maps\\Tournament Desert\\Tournament Desert.map";
constexpr const char *kArchiveTerrainIniEntry = "Data\\INI\\Terrain.ini";

bool succeeded(int result)
{
	return result == WW3D_ERROR_OK;
}

const char *bool_json(bool value)
{
	return value ? "true" : "false";
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
	Int patchCells = kMapCells;
	UnsignedByte firstHeight = 0;
	UnsignedByte patchCenterHeight = 0;
	unsigned long heightChecksum = 0;
	unsigned long patchHeightChecksum = 0;
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

std::string trim_ascii(const std::string &value)
{
	std::size_t first = 0;
	while (first < value.size() && std::isspace(static_cast<unsigned char>(value[first]))) {
		++first;
	}

	std::size_t last = value.size();
	while (last > first && std::isspace(static_cast<unsigned char>(value[last - 1]))) {
		--last;
	}

	return value.substr(first, last - first);
}

bool starts_with_token_ci(const std::string &line, const char *token)
{
	const std::size_t token_len = std::strlen(token);
	if (line.size() < token_len) {
		return false;
	}

	for (std::size_t index = 0; index < token_len; ++index) {
		const char left = static_cast<char>(std::tolower(static_cast<unsigned char>(line[index])));
		const char right = static_cast<char>(std::tolower(static_cast<unsigned char>(token[index])));
		if (left != right) {
			return false;
		}
	}

	return line.size() == token_len || std::isspace(static_cast<unsigned char>(line[token_len]));
}

bool starts_with_assignment_ci(const std::string &line, const char *key)
{
	const std::size_t key_len = std::strlen(key);
	if (line.size() < key_len) {
		return false;
	}

	for (std::size_t index = 0; index < key_len; ++index) {
		const char left = static_cast<char>(std::tolower(static_cast<unsigned char>(line[index])));
		const char right = static_cast<char>(std::tolower(static_cast<unsigned char>(key[index])));
		if (left != right) {
			return false;
		}
	}

	std::size_t cursor = key_len;
	while (cursor < line.size() && std::isspace(static_cast<unsigned char>(line[cursor]))) {
		++cursor;
	}
	return cursor < line.size() && line[cursor] == '=';
}

std::string assignment_value(const std::string &line)
{
	const std::size_t equals = line.find('=');
	if (equals == std::string::npos) {
		return std::string();
	}
	return trim_ascii(line.substr(equals + 1));
}

// Focused render smoke: seed the original terrain collection with shipped
// Terrain/Texture pairs while full INI parser ownership remains separate.
std::size_t load_terrain_texture_mappings_from_ini(TerrainTypeCollection *terrain_types)
{
	if (terrain_types == nullptr || TheFileSystem == nullptr) {
		return 0;
	}

	File *file = TheFileSystem->openFile(kArchiveTerrainIniEntry, File::READ | File::BINARY);
	if (file == nullptr) {
		return 0;
	}

	const Int file_size = file->size();
	if (file_size <= 0) {
		file->close();
		return 0;
	}

	std::string contents;
	contents.resize(static_cast<std::size_t>(file_size));
	const Int bytes_read = file->read(contents.data(), file_size);
	file->close();
	if (bytes_read <= 0) {
		return 0;
	}
	contents.resize(static_cast<std::size_t>(bytes_read));

	std::size_t count = 0;
	TerrainType *current_terrain = nullptr;
	std::size_t cursor = 0;
	while (cursor <= contents.size()) {
		const std::size_t next = contents.find('\n', cursor);
		std::string line = contents.substr(
			cursor,
			next == std::string::npos ? std::string::npos : next - cursor);
		cursor = next == std::string::npos ? contents.size() + 1 : next + 1;

		const std::size_t comment = line.find(';');
		if (comment != std::string::npos) {
			line.resize(comment);
		}
		line = trim_ascii(line);
		if (line.empty()) {
			continue;
		}

		if (starts_with_token_ci(line, "Terrain")) {
			const std::string name = trim_ascii(line.substr(std::strlen("Terrain")));
			if (!name.empty()) {
				current_terrain = terrain_types->findTerrain(AsciiString(name.c_str()));
				if (current_terrain == nullptr) {
					current_terrain = terrain_types->newTerrain(AsciiString(name.c_str()));
					if (current_terrain != nullptr) {
						++count;
					}
				}
			}
			continue;
		}

		if (current_terrain != nullptr && starts_with_assignment_ci(line, "Texture")) {
			const std::string texture = assignment_value(line);
			if (!texture.empty()) {
				current_terrain->friend_setTexture(AsciiString(texture.c_str()));
			}
		}
	}

	return count;
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
		FileInfo terrain_ini_info = {};
		load.terrainIniExists =
			archive_file_system.getFileInfo(AsciiString(kArchiveTerrainIniEntry), &terrain_ini_info) &&
			terrain_ini_info.sizeHigh == 0 &&
			terrain_ini_info.sizeLow > 0;
		if (load.terrainIniExists) {
			terrain_types = NEW TerrainTypeCollection;
			if (terrain_types != nullptr) {
				TheTerrainTypes = terrain_types;
				try {
					load.terrainTypeCount = load_terrain_texture_mappings_from_ini(terrain_types);
					load.terrainIniParsed = load.terrainTypeCount > 0;
				} catch (...) {
					load.terrainIniParsed = false;
				}
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
	global_data.m_drawEntireTerrain = TRUE;
	global_data.m_stretchTerrain = FALSE;
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

	GlobalData global_data;
	configure_global_data(global_data);
	GlobalData *old_writable_global_data = TheWritableGlobalData;
	TheWritableGlobalData = &global_data;

	int init_result = WW3D_ERROR_GENERIC;
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

	ProbeTerrainMapPatchLoad map_load;
	WorldHeightMap *map = load_archive_terrain_map_patch(
		ini_archive_path,
		maps_archive_path,
		terrain_archive_path,
		map_load);
	map_created = map_load.mapParsed && map != nullptr;

	ProbeTerrainBackground *tile = nullptr;
	ProbeTerrainDiffuseOwner *diffuse_owner = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	ProbeTerrainTileRenderObj *render_object = nullptr;
	RTS3DScene *scene = nullptr;
	CameraClass *camera = nullptr;

	if (map_created) {
		init_result = WW3D::Init(nullptr, nullptr, false);
	}

	if (succeeded(init_result)) {
		set_device_result = WW3D::Set_Render_Device(0, kViewportWidth, kViewportHeight, 32, 1, false, false, true);
	}

	if (succeeded(set_device_result) && map_created) {
		WW3D::Set_Thumbnail_Enabled(false);

		diffuse_owner = ProbeTerrainDiffuseOwner::create(map);
		owner_created = diffuse_owner != nullptr;
		if (owner_created) {
			TheTerrainRenderObject = diffuse_owner;
		}
	}

	if (owner_created) {
		tile = W3DNEW ProbeTerrainBackground();
		tile_created = tile != nullptr;
	}

	if (tile_created) {
		IRegion2D full_range = {};
		full_range.lo.x = map_load.patchOriginX;
		full_range.lo.y = map_load.patchOriginY;
		full_range.hi.x = map_load.patchOriginX + map_load.patchCells;
		full_range.hi.y = map_load.patchOriginY + map_load.patchCells;
		tile->allocateTerrainBuffers(map, map_load.patchOriginX, map_load.patchOriginY, map_load.patchCells);
		tile->setFlip(map);
		tile->doPartialUpdate(full_range, map, TRUE);

		camera = W3DNEW CameraClass();
		if (camera != nullptr) {
			camera->Set_Aspect_Ratio(static_cast<float>(kViewportWidth) / static_cast<float>(kViewportHeight));
			camera->Set_Clip_Planes(1.0f, 1000.0f);
		}

		render_object = W3DNEW ProbeTerrainTileRenderObj(tile, FALSE);
		render_object_created = render_object != nullptr && camera != nullptr;
	}

	if (render_object_created) {
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

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();
	const bool ok =
		state != nullptr &&
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
		map_load.width > kMapCells &&
		map_load.height > kMapCells &&
		map_load.heightChecksum > 0 &&
		map_load.patchHeightChecksum > 0 &&
		tile_created &&
		owner_created &&
		render_object_created &&
		scene_created &&
		scene_object_added &&
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

	char buffer[9000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_terrain_map_patch_scene_probe\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"mapCreated\":%s,\"tileCreated\":%s,"
		"\"ownerCreated\":%s,\"renderObjectCreated\":%s},"
		"\"ini\":{\"attempted\":%s,\"argumentSupplied\":%s,"
		"\"path\":\"%s\",\"directory\":\"%s\",\"mask\":\"%s\","
		"\"entry\":\"Data\\\\INI\\\\Terrain.ini\",\"loaded\":%s,"
		"\"entryExists\":%s,\"parsed\":%s,"
		"\"parser\":\"terrain-texture-mapping-reader\","
		"\"originalIniParser\":false,\"terrainTypeCount\":%lu,"
		"\"nameKeysReady\":%s,\"sidesListReady\":%s},"
		"\"archives\":{\"maps\":{\"argumentSupplied\":%s,\"path\":\"%s\","
		"\"directory\":\"%s\",\"mask\":\"%s\",\"loaded\":%s},"
		"\"terrain\":{\"argumentSupplied\":%s,\"path\":\"%s\","
		"\"directory\":\"%s\",\"mask\":\"%s\",\"loaded\":%s}},"
		"\"map\":{\"entry\":\"Maps\\\\Tournament Desert\\\\Tournament Desert.map\","
		"\"entryExists\":%s,\"entryOpenable\":%s,\"streamOpen\":%s,"
		"\"parsed\":%s,\"parseException\":%s,\"bytes\":%d,"
		"\"width\":%d,\"height\":%d,\"border\":%d,\"drawWidth\":%d,"
		"\"drawHeight\":%d,\"firstHeight\":%u,\"heightChecksum\":%lu},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"expectedFlatTextureSize\":%u,\"tileSource\":\"shipped-map-heightmap\","
		"\"patchOriginX\":%d,\"patchOriginY\":%d,\"patchCenterHeight\":%u,"
		"\"patchHeightChecksum\":%lu},"
		"\"scene\":{\"renderPath\":\"WW3D::Render(RTS3DScene,CameraClass) -> "
		"RTS3DScene::Customized_Render -> CLASSID_TILEMAP Render\","
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
		begin_render_result,
		render_result,
		end_render_result,
		bool_json(map_created),
		bool_json(tile_created),
		bool_json(owner_created),
		bool_json(render_object_created),
		bool_json(map_load.attempted),
		bool_json(map_load.iniArgumentSupplied),
		map_load.iniArchivePath.c_str(),
		map_load.iniArchiveDirectory.c_str(),
		map_load.iniArchiveMask.c_str(),
		bool_json(map_load.iniArchiveLoaded),
		bool_json(map_load.terrainIniExists),
		bool_json(map_load.terrainIniParsed),
		static_cast<unsigned long>(map_load.terrainTypeCount),
		bool_json(map_load.nameKeysReady),
		bool_json(map_load.sidesListReady),
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
		kMapVertices,
		kMapCells,
		kExpectedFlatTextureSize,
		map_load.patchOriginX,
		map_load.patchOriginY,
		map_load.patchCenterHeight,
		static_cast<unsigned long>(map_load.patchHeightChecksum),
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
	delete tile;
	ProbeTerrainDiffuseOwner::destroy(diffuse_owner);
	TheTerrainRenderObject = old_terrain_render_object;
	REF_PTR_RELEASE(map_load.map);
	map = nullptr;

	if (succeeded(init_result)) {
		wasm_shutdown_ww3d_probe();
	}

	TheWritableGlobalData = old_writable_global_data;

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

}
