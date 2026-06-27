#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/SubsystemInterface.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "assetmgr.h"
#include "chunkio.h"
#include "mesh.h"
#include "meshmdl.h"
#include "ramfile.h"
#include "texture.h"
#include "w3d_file.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
class AudioManager;
AudioManager *TheAudio = nullptr;

namespace {

struct MeshCandidate
{
	std::string path;
	int bytes = 0;
	unsigned int top_level_chunks = 0;
	bool has_mesh = false;
	bool has_hierarchy = false;
	bool has_hmodel = false;
	uint32 first_mesh_length = 0;
};

struct LoadedMesh
{
	std::string archive_path;
	std::string mesh_path;
	std::string mesh_name;
	std::string texture_name;
	int bytes = 0;
	unsigned int top_level_chunks = 0;
	uint32 first_mesh_length = 0;
	WW3DErrorType load_result = WW3D_ERROR_GENERIC;
	int vertices = 0;
	int polygons = 0;
	bool has_hierarchy = false;
	bool has_hmodel = false;
	bool loaded = false;
};

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "FAIL: %s\n", message);
		return false;
	}
	return true;
}

void split_archive_path(const char *archive_path, AsciiString &directory, AsciiString &file_mask)
{
	std::string normalized = archive_path != nullptr ? archive_path : "";
	std::replace(normalized.begin(), normalized.end(), '\\', '/');

	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory = "";
		file_mask = normalized.c_str();
		return;
	}

	directory = normalized.substr(0, slash + 1).c_str();
	file_mask = normalized.substr(slash + 1).c_str();
}

bool ascii_ends_with_ignore_case(const std::string &value, const char *suffix)
{
	const std::size_t suffix_length = std::strlen(suffix);
	if (value.size() < suffix_length) {
		return false;
	}

	const std::size_t offset = value.size() - suffix_length;
	for (std::size_t index = 0; index < suffix_length; ++index) {
		const unsigned char left = static_cast<unsigned char>(value[offset + index]);
		const unsigned char right = static_cast<unsigned char>(suffix[index]);
		if (std::tolower(left) != std::tolower(right)) {
			return false;
		}
	}
	return true;
}

std::string json_escape(const std::string &value)
{
	std::string escaped;
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
				escaped += ch;
				break;
		}
	}
	return escaped;
}

bool read_archive_file(FileSystem &file_system, const char *path, std::vector<unsigned char> &data)
{
	FileInfo info = {};
	if (!file_system.getFileInfo(AsciiString(path), &info) || info.sizeHigh != 0 || info.sizeLow <= 0) {
		return false;
	}

	File *file = file_system.openFile(path, File::READ | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	data.assign(static_cast<std::size_t>(info.sizeLow), 0);
	const Int bytes_read = file->read(data.data(), info.sizeLow);
	file->close();
	return bytes_read == info.sizeLow;
}

bool scan_w3d_chunks(const std::vector<unsigned char> &data, MeshCandidate &candidate)
{
	if (data.empty()) {
		return false;
	}

	RAMFileClass file(
		const_cast<unsigned char *>(data.data()),
		static_cast<int>(data.size()));
	if (!file.Open(static_cast<int>(FileClass::READ))) {
		return false;
	}

	ChunkLoadClass cload(&file);
	while (cload.Open_Chunk()) {
		++candidate.top_level_chunks;
		const uint32 chunk_id = cload.Cur_Chunk_ID();
		if (chunk_id == W3D_CHUNK_MESH) {
			candidate.has_mesh = true;
			if (candidate.first_mesh_length == 0) {
				candidate.first_mesh_length = cload.Cur_Chunk_Length();
			}
		} else if (chunk_id == W3D_CHUNK_HIERARCHY) {
			candidate.has_hierarchy = true;
		} else if (chunk_id == W3D_CHUNK_HMODEL) {
			candidate.has_hmodel = true;
		}
		cload.Close_Chunk();
	}

	file.Close();
	return candidate.top_level_chunks > 0;
}

bool load_first_mesh_chunk(const std::vector<unsigned char> &data, LoadedMesh &loaded)
{
	RAMFileClass file(
		const_cast<unsigned char *>(data.data()),
		static_cast<int>(data.size()));
	if (!file.Open(static_cast<int>(FileClass::READ))) {
		return false;
	}

	bool found_mesh_chunk = false;
	ChunkLoadClass cload(&file);
	while (cload.Open_Chunk()) {
		if (cload.Cur_Chunk_ID() == W3D_CHUNK_MESH) {
			found_mesh_chunk = true;
			MeshClass *mesh = NEW_REF(MeshClass, ());
			if (mesh != nullptr) {
				loaded.load_result = mesh->Load_W3D(cload);
				loaded.loaded = loaded.load_result == WW3D_ERROR_OK;
				if (loaded.loaded && mesh->Peek_Model() != nullptr) {
					MeshModelClass *model = mesh->Peek_Model();
					loaded.mesh_name = mesh->Get_Name() != nullptr ? mesh->Get_Name() : "";
					loaded.vertices = static_cast<int>(model->Get_Vertex_Count());
					loaded.polygons = static_cast<int>(model->Get_Polygon_Count());
					TextureClass *texture = model->Peek_Single_Texture(0, 0);
					if (texture != nullptr && texture->Get_Texture_Name() != nullptr) {
						loaded.texture_name = texture->Get_Texture_Name();
					}
				}
				mesh->Release_Ref();
			}
			cload.Close_Chunk();
			break;
		}
		cload.Close_Chunk();
	}

	file.Close();
	return found_mesh_chunk;
}

std::vector<MeshCandidate> collect_mesh_candidates(
	ArchiveFileSystem &archive_file_system,
	FileSystem &file_system)
{
	FilenameList files;
	archive_file_system.getFileListInDirectory(
		AsciiString(""), AsciiString(""), AsciiString("*"), files, TRUE);

	std::vector<MeshCandidate> candidates;
	for (FilenameListIter it = files.begin(); it != files.end(); ++it) {
		const std::string path = it->str();
		if (!ascii_ends_with_ignore_case(path, ".w3d")) {
			continue;
		}

		FileInfo info = {};
		if (!archive_file_system.getFileInfo(*it, &info) ||
				info.sizeHigh != 0 || info.sizeLow <= 0) {
			continue;
		}

		std::vector<unsigned char> data;
		if (!read_archive_file(file_system, it->str(), data)) {
			continue;
		}

		MeshCandidate candidate;
		candidate.path = path;
		candidate.bytes = info.sizeLow;
		if (scan_w3d_chunks(data, candidate) && candidate.has_mesh) {
			candidates.push_back(candidate);
		}
	}

	std::sort(candidates.begin(), candidates.end(),
		[](const MeshCandidate &left, const MeshCandidate &right) {
			if (left.bytes != right.bytes) {
				return left.bytes < right.bytes;
			}
			return left.path < right.path;
		});
	return candidates;
}

bool load_smallest_shipped_mesh(
	ArchiveFileSystem &archive_file_system,
	FileSystem &file_system,
	LoadedMesh &loaded,
	std::size_t &mesh_candidate_count)
{
	const std::vector<MeshCandidate> candidates =
		collect_mesh_candidates(archive_file_system, file_system);
	mesh_candidate_count = candidates.size();

	for (const MeshCandidate &candidate : candidates) {
		std::vector<unsigned char> data;
		if (!read_archive_file(file_system, candidate.path.c_str(), data)) {
			continue;
		}

		LoadedMesh attempt;
		attempt.mesh_path = candidate.path;
		attempt.bytes = candidate.bytes;
		attempt.top_level_chunks = candidate.top_level_chunks;
		attempt.first_mesh_length = candidate.first_mesh_length;
		attempt.has_hierarchy = candidate.has_hierarchy;
		attempt.has_hmodel = candidate.has_hmodel;
		if (load_first_mesh_chunk(data, attempt) &&
				attempt.loaded &&
				attempt.vertices > 0 &&
				attempt.polygons > 0) {
			attempt.archive_path = loaded.archive_path;
			loaded = attempt;
			return true;
		}
	}

	return false;
}

} // namespace

int run_ww3d2_shipped_mesh_loader_smoke_impl(const char *archive_path)
{
	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (!expect(archive_mask.isNotEmpty(), "archive file mask is empty")) {
		return 1;
	}

	initMemoryManager();

	bool ok = true;
	std::size_t mesh_candidate_count = 0;
	LoadedMesh loaded;
	loaded.archive_path = archive_path != nullptr ? archive_path : "";
	{
		Win32LocalFileSystem local_file_system;
		FileSystem file_system;
		Win32BIGFileSystem archive_file_system;
		WW3DAssetManager *asset_manager = W3DNEW WW3DAssetManager();
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		ok = expect(asset_manager != nullptr, "WW3DAssetManager allocation failed") && ok;
		ok = expect(archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask),
			"Win32BIGFileSystem did not load W3DZH.big") && ok;

		if (ok) {
			ok = expect(load_smallest_shipped_mesh(
					archive_file_system,
					file_system,
					loaded,
					mesh_candidate_count),
				"no shipped W3D mesh loaded through MeshClass::Load_W3D") && ok;
			ok = expect(mesh_candidate_count > 3000,
				"W3DZH.big exposed too few mesh-bearing W3D candidates") && ok;
			ok = expect(loaded.mesh_path == "art\\w3d\\cine_moon.w3d",
				"smallest shipped mesh candidate changed") && ok;
			ok = expect(loaded.mesh_name == "CINE_MOON",
				"shipped mesh name mismatch") && ok;
			ok = expect(loaded.bytes == 594,
				"shipped mesh byte size mismatch") && ok;
			ok = expect(loaded.first_mesh_length == 586,
				"shipped mesh chunk length mismatch") && ok;
			ok = expect(loaded.vertices == 4 && loaded.polygons == 2,
				"shipped mesh geometry counts mismatch") && ok;
			ok = expect(loaded.texture_name == "cine_moon.tga",
				"shipped mesh texture reference mismatch") && ok;
			ok = expect(!loaded.has_hierarchy && !loaded.has_hmodel,
				"smallest shipped mesh should be a direct mesh chunk") && ok;
		}

		if (asset_manager != nullptr) {
			delete asset_manager;
			asset_manager = nullptr;
		}

		TheFileSystem = nullptr;
		TheArchiveFileSystem = nullptr;
		TheLocalFileSystem = nullptr;
	}

	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	const std::string archive_json = json_escape(loaded.archive_path);
	const std::string path_json = json_escape(loaded.mesh_path);
	const std::string name_json = json_escape(loaded.mesh_name);
	const std::string texture_json = json_escape(loaded.texture_name);
	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-shipped-mesh-loader\","
		"\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"loader\":\"MeshClass::Load_W3D\","
		"\"meshCandidates\":%zu,\"meshPath\":\"%s\","
		"\"meshName\":\"%s\",\"bytes\":%d,\"topLevelChunks\":%u,"
		"\"firstMeshLength\":%u,\"hasHierarchy\":%s,\"hasHModel\":%s,"
		"\"loadResult\":%d,\"vertices\":%d,\"polygons\":%d,"
		"\"texture\":\"%s\",\"source\":\"GeneralsMD shipped W3DZH.big\"}\n",
		archive_json.c_str(),
		mesh_candidate_count,
		path_json.c_str(),
		name_json.c_str(),
		loaded.bytes,
		loaded.top_level_chunks,
		static_cast<unsigned int>(loaded.first_mesh_length),
		loaded.has_hierarchy ? "true" : "false",
		loaded.has_hmodel ? "true" : "false",
		static_cast<int>(loaded.load_result),
		loaded.vertices,
		loaded.polygons,
		texture_json.c_str());
	std::fflush(stdout);
	return 0;
}

extern "C" int run_ww3d2_shipped_mesh_loader_smoke(const char *archive_path)
{
	return run_ww3d2_shipped_mesh_loader_smoke_impl(archive_path);
}

#ifndef WW3D2_SHIPPED_MESH_LOADER_SMOKE_NO_MAIN
int main(int argc, char **argv)
{
	if (argc != 2) {
		std::fprintf(stderr, "usage: %s path/to/W3DZH.big\n", argv[0]);
		return 2;
	}

	return run_ww3d2_shipped_mesh_loader_smoke_impl(argv[1]);
}
#endif
