#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <string>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "chunkio.h"
#include "htree.h"
#include "ramfile.h"
#include "shatterplanes0_w3d.h"
#include "w3d_file.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

std::string g_ww3d_source_asset_probe_json;

const char *bool_json(bool value)
{
	return value ? "true" : "false";
}

struct ChunkInventory
{
	unsigned int chunks_scanned = 0;
	unsigned int hierarchy_chunks_seen = 0;
	unsigned int hmodel_chunks_seen = 0;
	unsigned int node_chunks_seen = 0;
	unsigned int collision_node_chunks_seen = 0;
	unsigned int skin_node_chunks_seen = 0;
	unsigned int max_depth = 0;
	unsigned int first_hierarchy_depth = 0;
	unsigned int first_hmodel_depth = 0;
	std::uint32_t first_hierarchy_length = 0;
	std::uint32_t first_hmodel_length = 0;
};

void record_chunk(ChunkLoadClass &cload, ChunkInventory &inventory)
{
	++inventory.chunks_scanned;
	inventory.max_depth = std::max(inventory.max_depth, static_cast<unsigned int>(cload.Cur_Chunk_Depth()));

	const std::uint32_t chunk_id = cload.Cur_Chunk_ID();
	switch (chunk_id) {
		case W3D_CHUNK_HIERARCHY:
			++inventory.hierarchy_chunks_seen;
			if (inventory.first_hierarchy_length == 0) {
				inventory.first_hierarchy_depth = static_cast<unsigned int>(cload.Cur_Chunk_Depth());
				inventory.first_hierarchy_length = cload.Cur_Chunk_Length();
			}
			break;
		case W3D_CHUNK_HMODEL:
			++inventory.hmodel_chunks_seen;
			if (inventory.first_hmodel_length == 0) {
				inventory.first_hmodel_depth = static_cast<unsigned int>(cload.Cur_Chunk_Depth());
				inventory.first_hmodel_length = cload.Cur_Chunk_Length();
			}
			break;
		case W3D_CHUNK_NODE:
			++inventory.node_chunks_seen;
			break;
		case W3D_CHUNK_COLLISION_NODE:
			++inventory.collision_node_chunks_seen;
			break;
		case W3D_CHUNK_SKIN_NODE:
			++inventory.skin_node_chunks_seen;
			break;
		default:
			break;
	}
}

void scan_chunks(ChunkLoadClass &cload, ChunkInventory &inventory)
{
	while (cload.Open_Chunk()) {
		record_chunk(cload, inventory);
		if (cload.Contains_Chunks()) {
			scan_chunks(cload, inventory);
		}
		cload.Close_Chunk();
	}
}

bool scan_asset(ChunkInventory &inventory)
{
	RAMFileClass file(
		const_cast<unsigned char *>(kShatterPlanes0W3d),
		static_cast<int>(kShatterPlanes0W3dSize));
	if (!file.Open(static_cast<int>(FileClass::READ))) {
		return false;
	}

	ChunkLoadClass cload(&file);
	scan_chunks(cload, inventory);
	file.Close();
	return true;
}

bool load_first_hierarchy_chunk(ChunkLoadClass &cload, HTreeClass &tree, int &load_result)
{
	while (cload.Open_Chunk()) {
		if (cload.Cur_Chunk_ID() == W3D_CHUNK_HIERARCHY) {
			load_result = tree.Load_W3D(cload);
			const bool loaded = load_result == HTreeClass::OK;
			cload.Close_Chunk();
			return loaded;
		}

		bool loaded = false;
		if (cload.Contains_Chunks()) {
			loaded = load_first_hierarchy_chunk(cload, tree, load_result);
		}
		cload.Close_Chunk();

		if (loaded) {
			return true;
		}
	}

	return false;
}

bool load_hierarchy(HTreeClass &tree, int &load_result)
{
	RAMFileClass file(
		const_cast<unsigned char *>(kShatterPlanes0W3d),
		static_cast<int>(kShatterPlanes0W3dSize));
	if (!file.Open(static_cast<int>(FileClass::READ))) {
		return false;
	}

	ChunkLoadClass cload(&file);
	const bool loaded = load_first_hierarchy_chunk(cload, tree, load_result);
	file.Close();
	return loaded;
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *cnc_port_probe_ww3d_source_asset_load()
{
	initMemoryManager();

	ChunkInventory inventory;
	const bool file_opened = scan_asset(inventory);

	HTreeClass hierarchy;
	int hierarchy_load_result = HTreeClass::LOAD_ERROR;
	const bool hierarchy_loaded = load_hierarchy(hierarchy, hierarchy_load_result);

	const char *hierarchy_name = hierarchy.Get_Name();
	const char *first_bone_name = hierarchy.Num_Pivots() > 0 ? hierarchy.Get_Bone_Name(0) : nullptr;

	const bool ok =
		file_opened &&
		inventory.chunks_scanned > 0 &&
		inventory.hierarchy_chunks_seen > 0 &&
		hierarchy_loaded &&
		hierarchy_load_result == HTreeClass::OK &&
		hierarchy_name != nullptr &&
		hierarchy_name[0] != '\0' &&
		hierarchy.Num_Pivots() > 0;

	char buffer[3000];
	std::snprintf(buffer, sizeof(buffer),
		"{\"source\":\"ww3d_source_asset_load_probe\","
		"\"ok\":%s,"
		"\"asset\":{\"name\":\"ShatterPlanes0.w3d\",\"bytes\":%u,"
		"\"origin\":\"GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/RequiredAssets\"},"
		"\"inventory\":{\"fileOpened\":%s,\"chunksScanned\":%u,"
		"\"hierarchyChunksSeen\":%u,\"hmodelChunksSeen\":%u,"
		"\"nodeChunksSeen\":%u,\"collisionNodeChunksSeen\":%u,\"skinNodeChunksSeen\":%u,"
		"\"maxDepth\":%u,\"firstHierarchyDepth\":%u,\"firstHierarchyLength\":%lu,"
		"\"firstHModelDepth\":%u,\"firstHModelLength\":%lu},"
		"\"hierarchy\":{\"load\":%d,\"loaded\":%s,\"name\":\"%s\","
		"\"pivots\":%d,\"firstBone\":\"%s\"}}",
		bool_json(ok),
		static_cast<unsigned int>(kShatterPlanes0W3dSize),
		bool_json(file_opened),
		inventory.chunks_scanned,
		inventory.hierarchy_chunks_seen,
		inventory.hmodel_chunks_seen,
		inventory.node_chunks_seen,
		inventory.collision_node_chunks_seen,
		inventory.skin_node_chunks_seen,
		inventory.max_depth,
		inventory.first_hierarchy_depth,
		static_cast<unsigned long>(inventory.first_hierarchy_length),
		inventory.first_hmodel_depth,
		static_cast<unsigned long>(inventory.first_hmodel_length),
		hierarchy_load_result,
		bool_json(hierarchy_loaded),
		hierarchy_name != nullptr ? hierarchy_name : "",
		hierarchy.Num_Pivots(),
		first_bone_name != nullptr ? first_bone_name : "");
	g_ww3d_source_asset_probe_json = buffer;
	return g_ww3d_source_asset_probe_json.c_str();
}

}
