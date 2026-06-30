#include <algorithm>
#include <cstdio>
#include <cstdlib>
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

constexpr int kMapCells = 16;
constexpr int kMapVertices = kMapCells + 1;
constexpr int kViewportWidth = 800;
constexpr int kViewportHeight = 600;
constexpr unsigned int kExpectedFlatTextureSize = kMapCells * 8;
constexpr const char *kArchiveTerrainTileEntry = "Art\\Terrain\\PTBlossom01.tga";

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

const char *run_ww3d_terrain_tile_probe(
	std::string &target_json,
	const char *source_name,
	ProbeTerrainArchiveTileLoad *archive_tile_load)
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

	ProbeWorldHeightMapBuffers map_buffers;
	ProbeWorldHeightMap *map = nullptr;
	ProbeTerrainBackground *tile = nullptr;
	ProbeTerrainDiffuseOwner *diffuse_owner = nullptr;
	BaseHeightMapRenderObjClass *old_terrain_render_object = TheTerrainRenderObject;
	ProbeTerrainTileRenderObj *render_object = nullptr;
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

	if (render_object_created) {
		RenderInfoClass render_info(*camera);
		begin_render_result = WW3D::Begin_Render(true, true, Vector3(0.0f, 0.0f, 0.0f));
		if (succeeded(begin_render_result)) {
			render_result = WW3D::Render(*render_object, render_info);
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
	char buffer[5200];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"%s\","
		"\"ok\":%s,"
		"\"results\":{\"init\":%d,\"setRenderDevice\":%d,\"beginRender\":%d,"
		"\"render\":%d,\"endRender\":%d,\"mapCreated\":%s,\"tileCreated\":%s,"
		"\"ownerCreated\":%s,\"renderObjectCreated\":%s},"
		"\"terrain\":{\"verticesPerSide\":%d,\"cellsPerSide\":%d,"
		"\"expectedFlatTextureSize\":%u,\"tileSource\":\"%s\"},"
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

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_tile()
{
	return run_ww3d_terrain_tile_probe(
		g_ww3d_terrain_tile_probe_json,
		"ww3d_terrain_tile_probe",
		nullptr);
}

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_terrain_tile_archive(const char *terrain_archive_path)
{
	ProbeTerrainArchiveTileLoad archive_tile_load;
	archive_tile_load.archivePath = terrain_archive_path != nullptr ? terrain_archive_path : "";
	return run_ww3d_terrain_tile_probe(
		g_ww3d_terrain_tile_archive_probe_json,
		"ww3d_terrain_tile_archive_probe",
		&archive_tile_load);
}

}
