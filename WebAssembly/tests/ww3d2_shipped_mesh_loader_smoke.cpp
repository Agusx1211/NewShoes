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
#include "Vector.H"
#include "assetmgr.h"
#include "chunkio.h"
#include "mesh.h"
#include "meshmdl.h"
#include "ramfile.h"
#include "texture.h"
#include "w3d_file.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
HWND ApplicationHWnd = nullptr;

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

struct LoadedMaterialPassMesh
{
	std::string mesh_path;
	std::string mesh_name;
	std::vector<std::string> texture_names;
	std::vector<std::string> texture_slot_names;
	int bytes = 0;
	int mesh_chunk_index = -1;
	uint32 mesh_chunk_length = 0;
	WW3DErrorType load_result = WW3D_ERROR_GENERIC;
	int vertices = 0;
	int polygons = 0;
	int pass_count = 0;
	int uv_array_count = 0;
	int material_passes_with_data = 0;
	int material_array_passes = 0;
	int shader_passes_with_data = 0;
	int shader_array_passes = 0;
	int texture_passes_with_data = 0;
	int texture_stage_slots = 0;
	int texture_array_slots = 0;
	int uv_stage_slots = 0;
	int same_pass_multitexture_passes = 0;
	int max_texture_stages_in_pass = 0;
	int max_uv_stages_in_pass = 0;
	int first_same_pass_multitexture_pass = -1;
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

std::string json_string_array(const std::vector<std::string> &values)
{
	std::string json = "[";
	for (std::size_t index = 0; index < values.size(); ++index) {
		if (index != 0) {
			json += ",";
		}
		json += "\"";
		json += json_escape(values[index]);
		json += "\"";
	}
	json += "]";
	return json;
}

bool string_vector_contains(const std::vector<std::string> &values, const char *expected)
{
	return std::find(values.begin(), values.end(), std::string(expected)) != values.end();
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

void scan_child_w3d_chunks(ChunkLoadClass &cload, MeshCandidate &candidate)
{
	while (cload.Open_Chunk()) {
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
		if (cload.Contains_Chunks()) {
			scan_child_w3d_chunks(cload, candidate);
		}
		cload.Close_Chunk();
	}
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
		if (cload.Contains_Chunks()) {
			scan_child_w3d_chunks(cload, candidate);
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

void remember_texture_name(LoadedMaterialPassMesh &loaded, TextureClass *texture)
{
	if (texture == nullptr || texture->Get_Texture_Name() == nullptr ||
			texture->Get_Texture_Name()[0] == '\0') {
		return;
	}

	const std::string name = static_cast<const char *>(texture->Get_Texture_Name());
	if (std::find(loaded.texture_names.begin(), loaded.texture_names.end(), name) ==
			loaded.texture_names.end()) {
		loaded.texture_names.push_back(name);
	}
}

void remember_texture_slot_name(
	LoadedMaterialPassMesh &loaded,
	int pass,
	int stage,
	TextureClass *texture)
{
	if (texture == nullptr || texture->Get_Texture_Name() == nullptr ||
			texture->Get_Texture_Name()[0] == '\0') {
		return;
	}

	char slot_prefix[32];
	std::snprintf(slot_prefix, sizeof(slot_prefix), "p%ds%d:", pass, stage);
	const std::string name =
		std::string(slot_prefix) + static_cast<const char *>(texture->Get_Texture_Name());
	if (std::find(loaded.texture_slot_names.begin(), loaded.texture_slot_names.end(), name) ==
			loaded.texture_slot_names.end()) {
		loaded.texture_slot_names.push_back(name);
	}
}

bool record_texture_stage_names(
	MeshModelClass &model,
	int pass,
	int stage,
	LoadedMaterialPassMesh &loaded)
{
	bool has_texture = false;
	TextureClass *single_texture = model.Peek_Single_Texture(pass, stage);
	if (single_texture != nullptr) {
		has_texture = true;
		remember_texture_name(loaded, single_texture);
		remember_texture_slot_name(loaded, pass, stage, single_texture);
	}

	if (model.Has_Texture_Array(pass, stage)) {
		has_texture = true;
		for (int polygon = 0; polygon < loaded.polygons; ++polygon) {
			TextureClass *texture = model.Peek_Texture(polygon, pass, stage);
			remember_texture_name(loaded, texture);
			remember_texture_slot_name(loaded, pass, stage, texture);
		}
	} else if (single_texture == nullptr) {
		TextureClass *texture = model.Peek_Texture(0, pass, stage);
		if (texture != nullptr) {
			has_texture = true;
			remember_texture_name(loaded, texture);
			remember_texture_slot_name(loaded, pass, stage, texture);
		}
	}

	return has_texture;
}

bool summarize_material_pass_model(MeshClass &mesh, LoadedMaterialPassMesh &loaded)
{
	MeshModelClass *model = mesh.Peek_Model();
	if (model == nullptr) {
		return false;
	}

	loaded.mesh_name = mesh.Get_Name() != nullptr ? mesh.Get_Name() : "";
	loaded.vertices = static_cast<int>(model->Get_Vertex_Count());
	loaded.polygons = static_cast<int>(model->Get_Polygon_Count());
	loaded.pass_count = model->Get_Pass_Count();
	loaded.uv_array_count = model->Get_UV_Array_Count();

	const int pass_limit = std::min(loaded.pass_count, static_cast<int>(MeshMatDescClass::MAX_PASSES));
	for (int pass = 0; pass < pass_limit; ++pass) {
		bool has_material = false;
		if (model->Peek_Single_Material(pass) != nullptr) {
			has_material = true;
		}
		if (model->Has_Material_Array(pass)) {
			has_material = true;
			++loaded.material_array_passes;
		}
		if (has_material) {
			++loaded.material_passes_with_data;
		}

		bool has_shader = false;
		if (model->Get_Single_Shader(pass).Get_Bits() != MeshMatDescClass::NullShader.Get_Bits()) {
			has_shader = true;
		}
		if (model->Has_Shader_Array(pass)) {
			has_shader = true;
			++loaded.shader_array_passes;
		}
		if (has_shader) {
			++loaded.shader_passes_with_data;
		}

		bool has_texture_in_pass = false;
		int texture_stages_in_pass = 0;
		int uv_stages_in_pass = 0;
		for (int stage = 0; stage < MeshMatDescClass::MAX_TEX_STAGES; ++stage) {
			const bool has_texture_array = model->Has_Texture_Array(pass, stage);
			const bool has_texture = record_texture_stage_names(*model, pass, stage, loaded);
			if (has_texture || has_texture_array) {
				has_texture_in_pass = true;
				++loaded.texture_stage_slots;
				++texture_stages_in_pass;
			}
			if (has_texture_array) {
				++loaded.texture_array_slots;
			}
			if (model->Get_UV_Array(pass, stage) != nullptr) {
				++loaded.uv_stage_slots;
				++uv_stages_in_pass;
			}
		}
		if (has_texture_in_pass) {
			++loaded.texture_passes_with_data;
		}
		if (texture_stages_in_pass > loaded.max_texture_stages_in_pass ||
				(texture_stages_in_pass == loaded.max_texture_stages_in_pass &&
					uv_stages_in_pass > loaded.max_uv_stages_in_pass)) {
			loaded.max_texture_stages_in_pass = texture_stages_in_pass;
			loaded.max_uv_stages_in_pass = uv_stages_in_pass;
		}
		if (texture_stages_in_pass >= 2) {
			++loaded.same_pass_multitexture_passes;
			if (loaded.first_same_pass_multitexture_pass < 0) {
				loaded.first_same_pass_multitexture_pass = pass;
			}
		}
	}

	return true;
}

bool is_material_pass_probe_mesh(const LoadedMaterialPassMesh &loaded)
{
	return loaded.loaded &&
		loaded.pass_count >= 2 &&
		loaded.material_passes_with_data >= 2 &&
		loaded.shader_passes_with_data >= 2 &&
		loaded.texture_passes_with_data >= 2 &&
		loaded.texture_stage_slots >= 2 &&
		loaded.uv_stage_slots >= 2 &&
		loaded.vertices > 0 &&
		loaded.polygons > 0;
}

bool is_same_pass_multitexture_probe_mesh(const LoadedMaterialPassMesh &loaded)
{
	return loaded.loaded &&
		loaded.same_pass_multitexture_passes >= 1 &&
		loaded.max_texture_stages_in_pass >= 2 &&
		loaded.max_uv_stages_in_pass >= 2 &&
		loaded.texture_names.size() >= 2 &&
		loaded.vertices > 0 &&
		loaded.polygons > 0;
}

typedef bool (*MaterialPassMeshPredicate)(const LoadedMaterialPassMesh &loaded);

bool load_material_pass_mesh_chunks(
	ChunkLoadClass &cload,
	const MeshCandidate &candidate,
	int &mesh_chunk_index,
	LoadedMaterialPassMesh &loaded,
	MaterialPassMeshPredicate accept_mesh)
{
	while (cload.Open_Chunk()) {
		bool matched = false;
		if (cload.Cur_Chunk_ID() == W3D_CHUNK_MESH) {
			LoadedMaterialPassMesh attempt;
			attempt.mesh_path = candidate.path;
			attempt.bytes = candidate.bytes;
			attempt.mesh_chunk_index = mesh_chunk_index;
			attempt.mesh_chunk_length = cload.Cur_Chunk_Length();

			MeshClass *mesh = NEW_REF(MeshClass, ());
			if (mesh != nullptr) {
				attempt.load_result = mesh->Load_W3D(cload);
				attempt.loaded = attempt.load_result == WW3D_ERROR_OK;
				if (attempt.loaded && summarize_material_pass_model(*mesh, attempt) &&
						accept_mesh(attempt)) {
					loaded = attempt;
					matched = true;
				}
				mesh->Release_Ref();
			}
			++mesh_chunk_index;
		} else if (cload.Contains_Chunks()) {
			matched = load_material_pass_mesh_chunks(
				cload,
				candidate,
				mesh_chunk_index,
				loaded,
				accept_mesh);
		}

		cload.Close_Chunk();
		if (matched) {
			return true;
		}
	}

	return false;
}

bool load_material_pass_mesh_chunk(
	const std::vector<unsigned char> &data,
	const MeshCandidate &candidate,
	LoadedMaterialPassMesh &loaded,
	MaterialPassMeshPredicate accept_mesh)
{
	RAMFileClass file(
		const_cast<unsigned char *>(data.data()),
		static_cast<int>(data.size()));
	if (!file.Open(static_cast<int>(FileClass::READ))) {
		return false;
	}

	int mesh_chunk_index = 0;
	ChunkLoadClass cload(&file);
	const bool found = load_material_pass_mesh_chunks(
		cload,
		candidate,
		mesh_chunk_index,
		loaded,
		accept_mesh);

	file.Close();
	return found;
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
	const std::vector<MeshCandidate> &candidates,
	FileSystem &file_system,
	LoadedMesh &loaded)
{
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

bool load_smallest_material_pass_shipped_mesh(
	const std::vector<MeshCandidate> &candidates,
	FileSystem &file_system,
	LoadedMaterialPassMesh &loaded,
	MaterialPassMeshPredicate accept_mesh)
{
	for (const MeshCandidate &candidate : candidates) {
		std::vector<unsigned char> data;
		if (!read_archive_file(file_system, candidate.path.c_str(), data)) {
			continue;
		}

		LoadedMaterialPassMesh attempt;
		if (load_material_pass_mesh_chunk(data, candidate, attempt, accept_mesh)) {
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
	LoadedMaterialPassMesh material_loaded;
	LoadedMaterialPassMesh same_pass_loaded;
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
			const std::vector<MeshCandidate> mesh_candidates =
				collect_mesh_candidates(archive_file_system, file_system);
			mesh_candidate_count = mesh_candidates.size();

			ok = expect(load_smallest_shipped_mesh(
					mesh_candidates,
					file_system,
					loaded),
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

			ok = expect(load_smallest_material_pass_shipped_mesh(
					mesh_candidates,
					file_system,
					material_loaded,
					is_material_pass_probe_mesh),
				"no shipped W3D mesh loaded through the modern material-pass path") && ok;
			ok = expect(material_loaded.mesh_path == "art\\w3d\\exglsshd01.w3d",
				"smallest material-pass multi-pass mesh candidate changed") && ok;
			ok = expect(material_loaded.pass_count >= 2,
				"material-pass mesh did not load multiple passes") && ok;
			ok = expect(material_loaded.material_passes_with_data >= 2,
				"material-pass mesh did not install per-pass vertex material data") && ok;
			ok = expect(material_loaded.shader_passes_with_data >= 2,
				"material-pass mesh did not install per-pass shader data") && ok;
			ok = expect(material_loaded.texture_passes_with_data >= 2 &&
					material_loaded.texture_stage_slots >= 2,
				"material-pass mesh did not install per-pass texture-stage data") && ok;
			ok = expect(material_loaded.uv_stage_slots >= 2,
				"material-pass mesh did not install texture-stage UV data") && ok;
			ok = expect(string_vector_contains(
					material_loaded.texture_slot_names,
					"p0s0:lakedusk.tga") &&
					string_vector_contains(
						material_loaded.texture_slot_names,
						"p1s0:exglsshd.tga"),
				"material-pass mesh texture-stage names mismatch") && ok;

			ok = expect(load_smallest_material_pass_shipped_mesh(
					mesh_candidates,
					file_system,
					same_pass_loaded,
					is_same_pass_multitexture_probe_mesh),
				"no shipped W3D mesh loaded with same-pass texture stage 0 and stage 1 data") && ok;
			ok = expect(same_pass_loaded.mesh_path == "art\\w3d\\pablinkliteb.w3d",
				"smallest same-pass multi-texture mesh candidate changed") && ok;
			ok = expect(same_pass_loaded.mesh_name == "PABLINKLITEB.OBJECT01",
				"same-pass multi-texture mesh name mismatch") && ok;
			ok = expect(same_pass_loaded.bytes == 2436,
				"same-pass multi-texture mesh byte size mismatch") && ok;
			ok = expect(same_pass_loaded.mesh_chunk_index == 1,
				"same-pass multi-texture mesh chunk index mismatch") && ok;
			ok = expect(same_pass_loaded.mesh_chunk_length == 1163,
				"same-pass multi-texture mesh chunk length mismatch") && ok;
			ok = expect(same_pass_loaded.load_result == WW3D_ERROR_OK,
				"same-pass multi-texture mesh load result mismatch") && ok;
			ok = expect(same_pass_loaded.first_same_pass_multitexture_pass == 0,
				"same-pass multi-texture mesh used an unexpected pass") && ok;
			ok = expect(same_pass_loaded.same_pass_multitexture_passes >= 1 &&
					same_pass_loaded.max_texture_stages_in_pass >= 2,
				"same-pass multi-texture mesh did not expose both texture stages") && ok;
			ok = expect(same_pass_loaded.max_uv_stages_in_pass >= 2 &&
					same_pass_loaded.uv_stage_slots >= 2,
				"same-pass multi-texture mesh did not expose both texture-stage UV arrays") && ok;
			ok = expect(string_vector_contains(
					same_pass_loaded.texture_slot_names,
					"p0s0:psblink.tga") &&
					string_vector_contains(
						same_pass_loaded.texture_slot_names,
						"p0s1:psgrad.tga"),
				"same-pass multi-texture mesh texture-stage names mismatch") && ok;
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
	const std::string material_path_json = json_escape(material_loaded.mesh_path);
	const std::string material_name_json = json_escape(material_loaded.mesh_name);
	const std::string material_textures_json = json_string_array(material_loaded.texture_names);
	const std::string material_texture_slots_json = json_string_array(material_loaded.texture_slot_names);
	const std::string same_pass_path_json = json_escape(same_pass_loaded.mesh_path);
	const std::string same_pass_name_json = json_escape(same_pass_loaded.mesh_name);
	const std::string same_pass_textures_json = json_string_array(same_pass_loaded.texture_names);
	const std::string same_pass_texture_slots_json =
		json_string_array(same_pass_loaded.texture_slot_names);
	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-shipped-mesh-loader\","
		"\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"loader\":\"MeshClass::Load_W3D\","
		"\"meshCandidates\":%zu,\"meshPath\":\"%s\","
		"\"meshName\":\"%s\",\"bytes\":%d,\"topLevelChunks\":%u,"
		"\"firstMeshLength\":%u,\"hasHierarchy\":%s,\"hasHModel\":%s,"
		"\"loadResult\":%d,\"vertices\":%d,\"polygons\":%d,"
		"\"texture\":\"%s\","
		"\"materialPassMeshPath\":\"%s\","
		"\"materialPassMeshName\":\"%s\","
		"\"materialPassBytes\":%d,"
		"\"materialPassMeshChunkIndex\":%d,"
		"\"materialPassMeshChunkLength\":%u,"
		"\"materialPassLoadResult\":%d,"
		"\"materialPassVertices\":%d,"
		"\"materialPassPolygons\":%d,"
		"\"materialPassCount\":%d,"
		"\"materialPassUvArrayCount\":%d,"
		"\"materialPassMaterialPassesWithData\":%d,"
		"\"materialPassMaterialArrayPasses\":%d,"
		"\"materialPassShaderPassesWithData\":%d,"
		"\"materialPassShaderArrayPasses\":%d,"
		"\"materialPassTexturePassesWithData\":%d,"
		"\"materialPassTextureStageSlots\":%d,"
		"\"materialPassTextureArraySlots\":%d,"
		"\"materialPassUvStageSlots\":%d,"
		"\"materialPassSamePassMultitexturePasses\":%d,"
		"\"materialPassMaxTextureStagesInPass\":%d,"
		"\"materialPassMaxUvStagesInPass\":%d,"
		"\"materialPassTextureNames\":%s,"
		"\"materialPassTextureSlotNames\":%s,"
		"\"samePassMultitextureMeshPath\":\"%s\","
		"\"samePassMultitextureMeshName\":\"%s\","
		"\"samePassMultitextureBytes\":%d,"
		"\"samePassMultitextureMeshChunkIndex\":%d,"
		"\"samePassMultitextureMeshChunkLength\":%u,"
		"\"samePassMultitextureLoadResult\":%d,"
		"\"samePassMultitextureVertices\":%d,"
		"\"samePassMultitexturePolygons\":%d,"
		"\"samePassMultitexturePassCount\":%d,"
		"\"samePassMultitextureUvArrayCount\":%d,"
		"\"samePassMultitextureFirstPass\":%d,"
		"\"samePassMultitexturePasses\":%d,"
		"\"samePassMultitextureMaxTextureStagesInPass\":%d,"
		"\"samePassMultitextureMaxUvStagesInPass\":%d,"
		"\"samePassMultitextureTextureStageSlots\":%d,"
		"\"samePassMultitextureTextureArraySlots\":%d,"
		"\"samePassMultitextureUvStageSlots\":%d,"
		"\"samePassMultitextureTextureNames\":%s,"
		"\"samePassMultitextureTextureSlotNames\":%s,"
		"\"source\":\"GeneralsMD shipped W3DZH.big\"}\n",
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
		texture_json.c_str(),
		material_path_json.c_str(),
		material_name_json.c_str(),
		material_loaded.bytes,
		material_loaded.mesh_chunk_index,
		static_cast<unsigned int>(material_loaded.mesh_chunk_length),
		static_cast<int>(material_loaded.load_result),
		material_loaded.vertices,
		material_loaded.polygons,
		material_loaded.pass_count,
		material_loaded.uv_array_count,
		material_loaded.material_passes_with_data,
		material_loaded.material_array_passes,
		material_loaded.shader_passes_with_data,
		material_loaded.shader_array_passes,
		material_loaded.texture_passes_with_data,
		material_loaded.texture_stage_slots,
		material_loaded.texture_array_slots,
		material_loaded.uv_stage_slots,
		material_loaded.same_pass_multitexture_passes,
		material_loaded.max_texture_stages_in_pass,
		material_loaded.max_uv_stages_in_pass,
		material_textures_json.c_str(),
		material_texture_slots_json.c_str(),
		same_pass_path_json.c_str(),
		same_pass_name_json.c_str(),
		same_pass_loaded.bytes,
		same_pass_loaded.mesh_chunk_index,
		static_cast<unsigned int>(same_pass_loaded.mesh_chunk_length),
		static_cast<int>(same_pass_loaded.load_result),
		same_pass_loaded.vertices,
		same_pass_loaded.polygons,
		same_pass_loaded.pass_count,
		same_pass_loaded.uv_array_count,
		same_pass_loaded.first_same_pass_multitexture_pass,
		same_pass_loaded.same_pass_multitexture_passes,
		same_pass_loaded.max_texture_stages_in_pass,
		same_pass_loaded.max_uv_stages_in_pass,
		same_pass_loaded.texture_stage_slots,
		same_pass_loaded.texture_array_slots,
		same_pass_loaded.uv_stage_slots,
		same_pass_textures_json.c_str(),
		same_pass_texture_slots_json.c_str());
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
