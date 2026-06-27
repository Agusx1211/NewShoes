// M4 rendering probe (bounded): load the real source-tree W3D asset
// GeneralsMD/Code/Libraries/Source/WWVegas/WW3D2/RequiredAssets/ShatterPlanes0.w3d
// through the original WW3D MeshClass::Load_W3D parser (no synthetic writer),
// using the original WWLib chunk readers, and report the parse status.
//
// The real file bytes are fed in from the host through the wasm heap (by the
// Node/browser runner) and wrapped in an original RAMFileClass, mirroring how
// the browser harness will eventually hand fetched asset bytes to the engine.
//
// Finding this probe pins: ShatterPlanes0.w3d is NOT a renderable W3D mesh
// (W3D_CHUNK_MESH = 0x00000000). Its top-level container chunk is
// W3D_CHUNK_HIERARCHY (0x00000100) -- it is a hierarchy/pivot asset
// (root name "SHATTERPLANES0"). MeshClass::Load_W3D therefore correctly
// rejects the file with WW3D_ERROR_LOAD_FAILED, because the first sub-chunk
// it opens (W3D_CHUNK_HIERARCHY_HEADER) is not W3D_CHUNK_MESH_HEADER3.
//
// Rendering this asset through the browser draw bridge is blocked by the
// file format itself -- there is no mesh payload to draw. This probe is the
// "rendering blocked" fallback: it proves the original Load_W3D parse path
// runs against the real source bytes and reports the hierarchy-only status.

#include <cstdio>
#include <cstring>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "chunkio.h"
#include "mesh.h"
#include "ramfile.h"
#include "w3d_file.h"

namespace {

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "FAIL: %s\n", message);
		return false;
	}
	return true;
}

int run_shatterplanes_loader_smoke_impl(const unsigned char *w3d_bytes, int w3d_length)
{
	initMemoryManager();

	bool ok = true;

	// ---- Pass 1: prove the real file parses as a W3D hierarchy container ----
	uint32 top_chunk_id = 0xFFFFFFFFu;
	uint32 header_chunk_id = 0xFFFFFFFFu;
	uint32 hierarchy_version = 0;
	char hierarchy_name[W3D_NAME_LEN + 1];
	std::memset(hierarchy_name, 0, sizeof(hierarchy_name));

	{
		RAMFileClass file(const_cast<unsigned char *>(w3d_bytes), w3d_length);
		if (!expect(file.Open(FileClass::READ) != 0, "failed to open real ShatterPlanes0.w3d RAM file")) {
			ok = false;
		}

		if (ok) {
			ChunkLoadClass cload(&file);
			if (!expect(cload.Open_Chunk(), "could not open top-level W3D chunk")) {
				ok = false;
			} else {
				top_chunk_id = cload.Cur_Chunk_ID();
				ok = expect(top_chunk_id == W3D_CHUNK_HIERARCHY,
					"top-level chunk is not W3D_CHUNK_HIERARCHY") &&
					ok;

				if (cload.Open_Chunk()) {
					header_chunk_id = cload.Cur_Chunk_ID();
					ok = expect(header_chunk_id == W3D_CHUNK_HIERARCHY_HEADER,
						"first sub-chunk is not W3D_CHUNK_HIERARCHY_HEADER") &&
						ok;

					if (header_chunk_id == W3D_CHUNK_HIERARCHY_HEADER) {
						W3dHierarchyStruct header;
						std::memset(&header, 0, sizeof(header));
						const int read = cload.Read(&header, sizeof(header));
						ok = expect(read == sizeof(header),
							"could not read W3dHierarchyStruct") &&
							ok;
						if (read == sizeof(header)) {
							hierarchy_version = header.Version;
							std::memcpy(hierarchy_name, header.Name, W3D_NAME_LEN);
							ok = expect(hierarchy_version == W3D_CURRENT_HTREE_VERSION,
								"hierarchy version mismatch") &&
								ok;
							ok = expect(std::strncmp(hierarchy_name, "SHATTERPLANES0", W3D_NAME_LEN) == 0,
								"hierarchy name mismatch") &&
								ok;
						}
					}
					cload.Close_Chunk();
				} else {
					ok = false;
					std::fprintf(stderr, "FAIL: could not open hierarchy header sub-chunk\n");
				}

				cload.Close_Chunk();
			}
		}

		file.Close();
	}

	// ---- Pass 2: feed the real file to original MeshClass::Load_W3D ----
	WW3DErrorType load_result = WW3D_ERROR_GENERIC;
	bool model_released = false;

	if (ok) {
		RAMFileClass file(const_cast<unsigned char *>(w3d_bytes), w3d_length);
		if (!expect(file.Open(FileClass::READ) != 0, "failed to re-open real ShatterPlanes0.w3d RAM file")) {
			ok = false;
		}

		if (ok) {
			ChunkLoadClass cload(&file);
			if (cload.Open_Chunk() && cload.Cur_Chunk_ID() == W3D_CHUNK_HIERARCHY) {
				// Position the reader inside the hierarchy container and hand it to
				// the original mesh loader, exactly as a mesh load attempt would
				// after dispatching on the top-level chunk id. Load_W3D opens the
				// first sub-chunk expecting W3D_CHUNK_MESH_HEADER3 and rejects the
				// hierarchy header with WW3D_ERROR_LOAD_FAILED.
				MeshClass *mesh = NEW_REF(MeshClass, ());
				ok = expect(mesh != nullptr, "MeshClass allocation failed") && ok;
				if (mesh != nullptr) {
					load_result = mesh->Load_W3D(cload);
					model_released = (mesh->Peek_Model() == nullptr);

					ok = expect(load_result == WW3D_ERROR_LOAD_FAILED,
						"MeshClass::Load_W3D did not reject the non-mesh file") &&
						ok;
					ok = expect(model_released,
						"MeshClass kept a model after a failed Load_W3D") &&
						ok;

					mesh->Release_Ref();
				}
				cload.Close_Chunk();
			} else {
				ok = false;
				std::fprintf(stderr, "FAIL: second pass could not re-open hierarchy chunk\n");
			}
		}
		file.Close();
	}

	shutdownMemoryManager();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-shatterplanes-loader\","
		"\"source\":\"GeneralsMD original ShatterPlanes0.w3d\","
		"\"loader\":\"MeshClass::Load_W3D\",\"fileBytes\":%d,"
		"\"topChunkId\":%u,\"headerChunkId\":%u,"
		"\"hierarchyVersion\":%u,\"hierarchyName\":\"%s\","
		"\"loadResult\":%d,\"loadRejected\":%s,\"modelReleased\":%s,"
		"\"rendering\":\"blocked-by-format-not-a-mesh\"}\n",
		w3d_length,
		static_cast<unsigned int>(top_chunk_id),
		static_cast<unsigned int>(header_chunk_id),
		static_cast<unsigned int>(hierarchy_version),
		hierarchy_name,
		static_cast<int>(load_result),
		load_result == WW3D_ERROR_LOAD_FAILED ? "true" : "false",
		model_released ? "true" : "false");
	std::fflush(stdout);
	return 0;
}

} // namespace

extern "C" int run_ww3d2_shatterplanes_loader_smoke(const unsigned char *w3d_bytes, int w3d_length)
{
	return run_shatterplanes_loader_smoke_impl(w3d_bytes, w3d_length);
}
