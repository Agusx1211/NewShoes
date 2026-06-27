// M4 loader smoke (bounded): exercise the original modern WW3D
// W3D_CHUNK_MATERIAL_PASS material install path
// (read_material_pass -> read_vertex_material_ids / read_shader_ids /
// read_texture_stage / read_stage_texcoords) against a real shipped
// multi-pass / multi-texture W3D mesh pulled from W3DZH.big through the
// original Win32BIGFileSystem + FileSystem path.
//
// This complements ww3d2_shipped_mesh_loader_smoke, whose smallest shipped
// candidate (cine_moon.w3d) only carries geometry plus a single legacy
// material, so the legacy read_per_tri_materials early-return (NumMaterials
// == 1) short-circuits before the modern per-pass install path runs. Here
// we deliberately select a shipped mesh whose W3D_CHUNK_MESH payload
// contains at least one W3D_CHUNK_MATERIAL_PASS (ideally multi-pass or
// multi-texture), feed it through MeshClass::Load_W3D, and assert the
// modern install path populated CurMatDesc with per-pass vertex materials,
// shaders, and texture stages rather than taking the single-material
// Set_Single_* fallback.
//
// This is a loader smoke target only -- it does not render. Browser
// rendering of the selected mesh remains covered by the shipped mesh
// render probe.

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
#include "vertmaterial.h"
#include "w3d_file.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
class AudioManager;
AudioManager *TheAudio = nullptr;

namespace {

struct MeshPassCandidate
{
	std::string path;
	int bytes = 0;
	unsigned int top_level_chunks = 0;
	bool has_mesh = false;
	bool has_material_info = false;
	unsigned int material_pass_count = 0;
	unsigned int max_texture_stages_in_pass = 0;
	unsigned int total_texture_stages = 0;
	bool has_vertex_material_ids = false;
	bool has_shader_ids = false;
	bool has_stage_texcoords = false;
	bool has_multiple_texture_ids = false;
	uint32 first_mesh_length = 0;

	// Classification of how strongly this candidate exercises the modern
	// material pass install path. Higher is better.
	int modern_rank() const
	{
		if (material_pass_count == 0) {
			return 0;
		}
		if (material_pass_count >= 2 && max_texture_stages_in_pass >= 2) {
			return 4; // true multi-pass + multi-texture
		}
		if (material_pass_count >= 2) {
			return 3; // multi-pass
		}
		if (max_texture_stages_in_pass >= 2) {
			return 2; // multi-texture in a single pass
		}
		return 1; // single-pass modern install path
	}
};

struct LoadedMaterialPassMesh
{
	std::string archive_path;
	std::string mesh_path;
	std::string mesh_name;
	int bytes = 0;
	unsigned int top_level_chunks = 0;
	uint32 first_mesh_length = 0;
	WW3DErrorType load_result = WW3D_ERROR_GENERIC;
	int vertices = 0;
	int polygons = 0;
	int pass_count = 0;
	int modern_rank = 0;
	unsigned int material_pass_count = 0;
	unsigned int max_texture_stages_in_pass = 0;
	bool has_vertex_material_ids = false;
	bool has_shader_ids = false;
	bool has_stage_texcoords = false;
	bool has_material_info = false;
	bool loaded = false;

	// Per-pass install verification (capped at MeshMatDescClass::MAX_PASSES).
	struct PassInfo
	{
		bool material_installed = false;
		bool material_array = false;
		bool shader_array = false;
		bool texture_stage0 = false;
		bool texture_stage1 = false;
		bool texture_array_stage0 = false;
		bool texture_array_stage1 = false;
		std::string material_name;
		std::string texture0_name;
		std::string texture1_name;
	};
	PassInfo passes[MeshMatDescClass::MAX_PASSES];
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

// Scan the sub-chunks of a W3D_CHUNK_MESH chunk for the modern material pass
// install path markers. `cload` is positioned inside the mesh chunk (i.e. the
// caller has already opened W3D_CHUNK_MESH and will close it). We descend one
// additional level into the optional prelit material wrappers
// (W3D_CHUNK_PRELIT_*) because multi-pass / multi-texture lightmap meshes
// store their W3D_CHUNK_MATERIAL_PASS payload there.
void scan_mesh_body_for_material_passes(ChunkLoadClass &cload, MeshPassCandidate &candidate)
{
	while (cload.Open_Chunk()) {
		const uint32 chunk_id = cload.Cur_Chunk_ID();

		switch (chunk_id) {
			case W3D_CHUNK_MATERIAL_INFO:
				candidate.has_material_info = true;
				break;

			case W3D_CHUNK_MATERIAL_PASS: {
				++candidate.material_pass_count;
				unsigned int stages_this_pass = 0;
				while (cload.Open_Chunk()) {
					const uint32 sub_id = cload.Cur_Chunk_ID();
					if (sub_id == W3D_CHUNK_TEXTURE_STAGE) {
						++stages_this_pass;
						++candidate.total_texture_stages;
						bool multiple_tex_ids = false;
						while (cload.Open_Chunk()) {
							if (cload.Cur_Chunk_ID() == W3D_CHUNK_TEXTURE_IDS) {
								if (cload.Cur_Chunk_Length() > sizeof(uint32)) {
									multiple_tex_ids = true;
								}
							}
							cload.Close_Chunk();
						}
						if (multiple_tex_ids) {
							candidate.has_multiple_texture_ids = true;
						}
					} else if (sub_id == W3D_CHUNK_VERTEX_MATERIAL_IDS) {
						candidate.has_vertex_material_ids = true;
					} else if (sub_id == W3D_CHUNK_SHADER_IDS) {
						candidate.has_shader_ids = true;
					} else if (sub_id == W3D_CHUNK_STAGE_TEXCOORDS) {
						candidate.has_stage_texcoords = true;
					}
					cload.Close_Chunk();
				}
				if (stages_this_pass > candidate.max_texture_stages_in_pass) {
					candidate.max_texture_stages_in_pass = stages_this_pass;
				}
				break;
			}

			case W3D_CHUNK_PRELIT_UNLIT:
			case W3D_CHUNK_PRELIT_VERTEX:
			case W3D_CHUNK_PRELIT_LIGHTMAP_MULTI_PASS:
			case W3D_CHUNK_PRELIT_LIGHTMAP_MULTI_TEXTURE:
				// Modern material pass payload may be nested inside a prelit
				// wrapper; descend into it without consuming the wrapper's
				// siblings.
				scan_mesh_body_for_material_passes(cload, candidate);
				break;

			default:
				break;
		}

		cload.Close_Chunk();
	}
}

bool scan_w3d_for_material_passes(const std::vector<unsigned char> &data, MeshPassCandidate &candidate)
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
			scan_mesh_body_for_material_passes(cload, candidate);
		}
		cload.Close_Chunk();
	}

	file.Close();
	return candidate.top_level_chunks > 0;
}

std::vector<MeshPassCandidate> collect_material_pass_candidates(
	ArchiveFileSystem &archive_file_system,
	FileSystem &file_system)
{
	FilenameList files;
	archive_file_system.getFileListInDirectory(
		AsciiString(""), AsciiString(""), AsciiString("*"), files, TRUE);

	std::vector<MeshPassCandidate> candidates;
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

		MeshPassCandidate candidate;
		candidate.path = path;
		candidate.bytes = info.sizeLow;
		if (scan_w3d_for_material_passes(data, candidate) &&
				candidate.has_mesh &&
				candidate.material_pass_count > 0) {
			candidates.push_back(candidate);
		}
	}

	// Rank by how strongly the candidate exercises the modern path, then by
	// size so the chosen mesh is deterministic and easy to inspect.
	std::sort(candidates.begin(), candidates.end(),
		[](const MeshPassCandidate &left, const MeshPassCandidate &right) {
			if (left.modern_rank() != right.modern_rank()) {
				return left.modern_rank() > right.modern_rank();
			}
			if (left.bytes != right.bytes) {
				return left.bytes < right.bytes;
			}
			return left.path < right.path;
		});
	return candidates;
}

bool load_material_pass_mesh(const std::vector<unsigned char> &data, const MeshPassCandidate &candidate, LoadedMaterialPassMesh &loaded)
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
					loaded.pass_count = model->Get_Pass_Count();

					const int max_passes = std::min<int>(
						loaded.pass_count, MeshMatDescClass::MAX_PASSES);
					for (int pass = 0; pass < max_passes; ++pass) {
						LoadedMaterialPassMesh::PassInfo &info = loaded.passes[pass];

						VertexMaterialClass *vmat = model->Peek_Single_Material(pass);
						info.material_installed = (vmat != nullptr) || model->Has_Material_Array(pass);
						info.material_array = model->Has_Material_Array(pass);
						if (vmat != nullptr && vmat->Get_Name() != nullptr) {
							info.material_name = vmat->Get_Name();
						}

						info.shader_array = model->Has_Shader_Array(pass);

						TextureClass *tex0 = model->Peek_Single_Texture(pass, 0);
						TextureClass *tex1 = model->Peek_Single_Texture(pass, 1);
						info.texture_stage0 = (tex0 != nullptr) || model->Has_Texture_Array(pass, 0);
						info.texture_stage1 = (tex1 != nullptr) || model->Has_Texture_Array(pass, 1);
						info.texture_array_stage0 = model->Has_Texture_Array(pass, 0);
						info.texture_array_stage1 = model->Has_Texture_Array(pass, 1);
						if (tex0 != nullptr && tex0->Get_Texture_Name().Peek_Buffer() != nullptr) {
							info.texture0_name = tex0->Get_Texture_Name().Peek_Buffer();
						}
						if (tex1 != nullptr && tex1->Get_Texture_Name().Peek_Buffer() != nullptr) {
							info.texture1_name = tex1->Get_Texture_Name().Peek_Buffer();
						}
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

} // namespace

int run_ww3d2_shipped_material_pass_smoke_impl(const char *archive_path)
{
	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (!expect(archive_mask.isNotEmpty(), "archive file mask is empty")) {
		return 1;
	}

	initMemoryManager();

	bool ok = true;
	std::size_t material_pass_candidate_count = 0;
	std::size_t multi_pass_candidate_count = 0;
	std::size_t multi_texture_candidate_count = 0;
	LoadedMaterialPassMesh loaded;
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

		std::vector<MeshPassCandidate> candidates;
		if (ok) {
			candidates = collect_material_pass_candidates(archive_file_system, file_system);
			material_pass_candidate_count = candidates.size();
			for (const MeshPassCandidate &candidate : candidates) {
				if (candidate.material_pass_count >= 2) {
					++multi_pass_candidate_count;
				}
				if (candidate.max_texture_stages_in_pass >= 2) {
					++multi_texture_candidate_count;
				}
			}

			ok = expect(!candidates.empty(),
				"W3DZH.big exposed no shipped mesh using W3D_CHUNK_MATERIAL_PASS") &&
				ok;
		}

		if (ok) {
			const MeshPassCandidate &chosen = candidates.front();
			std::vector<unsigned char> data;
			ok = expect(read_archive_file(file_system, chosen.path.c_str(), data),
				"could not re-read chosen shipped material-pass W3D mesh") &&
				ok;

			if (ok) {
				ok = expect(load_material_pass_mesh(data, chosen, loaded),
					"could not locate W3D_CHUNK_MESH in chosen candidate") &&
					ok;
				ok = expect(loaded.loaded,
					"MeshClass::Load_W3D failed for the modern material-pass mesh") &&
					ok;

				loaded.mesh_path = chosen.path;
				loaded.bytes = chosen.bytes;
				loaded.top_level_chunks = chosen.top_level_chunks;
				loaded.first_mesh_length = chosen.first_mesh_length;
				loaded.modern_rank = chosen.modern_rank();
				loaded.material_pass_count = chosen.material_pass_count;
				loaded.max_texture_stages_in_pass = chosen.max_texture_stages_in_pass;
				loaded.has_vertex_material_ids = chosen.has_vertex_material_ids;
				loaded.has_shader_ids = chosen.has_shader_ids;
				loaded.has_stage_texcoords = chosen.has_stage_texcoords;
				loaded.has_material_info = chosen.has_material_info;
			}

			if (ok) {
				// The modern install path must have populated CurMatDesc with
				// the per-pass material data driven by W3D_CHUNK_MATERIAL_PASS
				// rather than the legacy Set_Single_* fallback.
				ok = expect(loaded.pass_count == static_cast<int>(chosen.material_pass_count),
					"Get_Pass_Count does not match the parsed W3D_CHUNK_MATERIAL_PASS count") &&
					ok;
				ok = expect(loaded.pass_count >= 1,
					"loaded mesh exposes zero material passes") &&
					ok;

				const int max_passes = std::min<int>(
					loaded.pass_count, MeshMatDescClass::MAX_PASSES);
				bool any_pass_material_installed = false;
				bool any_pass_texture_installed = false;
				bool multi_texture_installed = false;
				for (int pass = 0; pass < max_passes; ++pass) {
					const LoadedMaterialPassMesh::PassInfo &info = loaded.passes[pass];
					any_pass_material_installed |= info.material_installed;
					any_pass_texture_installed |= info.texture_stage0;
					if (info.texture_stage1) {
						multi_texture_installed = true;
					}
				}
				ok = expect(any_pass_material_installed,
					"modern material pass path installed no vertex material") &&
					ok;
				ok = expect(any_pass_texture_installed,
					"modern material pass path installed no stage-0 texture") &&
					ok;

				// If the chosen candidate was selected for multi-pass or
				// multi-texture behavior, require the loaded model to reflect
				// it. This is the heart of the TODO: prove the modern path
				// installed additional passes / texture stages instead of
				// collapsing to the single-material legacy install.
				if (chosen.modern_rank() >= 3) {
					ok = expect(loaded.pass_count >= 2,
						"multi-pass candidate did not install >= 2 passes") &&
						ok;
				}
				if (chosen.max_texture_stages_in_pass >= 2) {
					ok = expect(multi_texture_installed,
						"multi-texture candidate did not install a stage-1 texture") &&
						ok;
				}
			}
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

	std::string passes_json;
	const int max_passes = std::min<int>(loaded.pass_count, MeshMatDescClass::MAX_PASSES);
	for (int pass = 0; pass < max_passes; ++pass) {
		const LoadedMaterialPassMesh::PassInfo &info = loaded.passes[pass];
		char entry[512];
		std::snprintf(entry, sizeof(entry),
			"{\"pass\":%d,\"materialInstalled\":%s,\"materialArray\":%s,"
			"\"shaderArray\":%s,\"textureStage0\":%s,\"textureStage1\":%s,"
			"\"textureArrayStage0\":%s,\"textureArrayStage1\":%s,"
			"\"material\":\"%s\",\"texture0\":\"%s\",\"texture1\":\"%s\"}%s",
			pass,
			info.material_installed ? "true" : "false",
			info.material_array ? "true" : "false",
			info.shader_array ? "true" : "false",
			info.texture_stage0 ? "true" : "false",
			info.texture_stage1 ? "true" : "false",
			info.texture_array_stage0 ? "true" : "false",
			info.texture_array_stage1 ? "true" : "false",
			json_escape(info.material_name).c_str(),
			json_escape(info.texture0_name).c_str(),
			json_escape(info.texture1_name).c_str(),
			(pass + 1 < max_passes) ? "," : "");
		passes_json += entry;
	}

	const std::string archive_json = json_escape(loaded.archive_path);
	const std::string path_json = json_escape(loaded.mesh_path);
	const std::string name_json = json_escape(loaded.mesh_name);
	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-shipped-material-pass\","
		"\"archive\":\"%s\",\"reader\":\"Win32BIGFileSystem\","
		"\"loader\":\"MeshClass::Load_W3D\","
		"\"installPath\":\"W3D_CHUNK_MATERIAL_PASS\","
		"\"materialPassCandidates\":%zu,\"multiPassCandidates\":%zu,"
		"\"multiTextureCandidates\":%zu,\"meshPath\":\"%s\","
		"\"meshName\":\"%s\",\"bytes\":%d,\"topLevelChunks\":%u,"
		"\"firstMeshLength\":%u,\"modernRank\":%d,"
		"\"materialPassCount\":%u,\"maxTextureStagesInPass\":%u,"
		"\"hasMaterialInfo\":%s,\"hasVertexMaterialIds\":%s,"
		"\"hasShaderIds\":%s,\"hasStageTexcoords\":%s,"
		"\"loadResult\":%d,\"vertices\":%d,\"polygons\":%d,"
		"\"passCount\":%d,\"passes\":[%s],"
		"\"source\":\"GeneralsMD shipped W3DZH.big\"}\n",
		archive_json.c_str(),
		material_pass_candidate_count,
		multi_pass_candidate_count,
		multi_texture_candidate_count,
		path_json.c_str(),
		name_json.c_str(),
		loaded.bytes,
		loaded.top_level_chunks,
		static_cast<unsigned int>(loaded.first_mesh_length),
		loaded.modern_rank,
		loaded.material_pass_count,
		loaded.max_texture_stages_in_pass,
		loaded.has_material_info ? "true" : "false",
		loaded.has_vertex_material_ids ? "true" : "false",
		loaded.has_shader_ids ? "true" : "false",
		loaded.has_stage_texcoords ? "true" : "false",
		static_cast<int>(loaded.load_result),
		loaded.vertices,
		loaded.polygons,
		loaded.pass_count,
		passes_json.c_str());
	std::fflush(stdout);
	return 0;
}

extern "C" int run_ww3d2_shipped_material_pass_smoke(const char *archive_path)
{
	return run_ww3d2_shipped_material_pass_smoke_impl(archive_path);
}

#ifndef WW3D2_SHIPPED_MATERIAL_PASS_SMOKE_NO_MAIN
int main(int argc, char **argv)
{
	if (argc != 2) {
		std::fprintf(stderr, "usage: %s path/to/W3DZH.big\n", argv[0]);
		return 2;
	}

	return run_ww3d2_shipped_material_pass_smoke_impl(argv[1]);
}
#endif
