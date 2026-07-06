// Smoke: exercise the original TextureClass::Init / TextureLoader foreground
// filename-loading path under browser wasm.
//
// The shipped mesh render probe depends on this same path for real DDS assets.
// This smoke proves the *normal* asset-manager request flow --
// WW3DAssetManager::Get_Texture(name) -> TextureClass(name,NULL,...) ->
// TextureClass::Init -> TextureLoader::Request_Foreground_Loading ->
// Finish_Load -> DDSFileClass/Targa decode -> DX8 texture upload -- already
// runs end-to-end under the Emscripten/D3D8-shim build without the background
// loader thread.
//
// It stages a small uncompressed 32-bit TGA in MEMFS, requests it by name
// (texture name ".tga", no full path), and asserts the resulting TextureClass
// is initialized with a D3D texture whose dimensions match the source image
// (distinguishing a real load from the 128x128 MissingTexture fallback). It
// also verifies the same name resolves through the asset-manager texture hash
// on a second request.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "PreRTS.h"

#include "Common/GameMemory.h"
#include "Vector.H"
#include "assetmgr.h"
#include "dx8wrapper.h"
#include "texture.h"
#include "wasm_d3d8_shim.h"
#include "ww3d.h"

namespace {

constexpr const char *kTextureName = "loader_probe.tga";
constexpr const char *kTextureMemfsPath = "/loader_probe.tga";
constexpr unsigned int kTextureWidth = 4;
constexpr unsigned int kTextureHeight = 4;
constexpr unsigned int kMissingTextureWidth = 128; // see WW3D2/missingtexture.cpp

bool expect(bool condition, const char *message)
{
	if (!condition) {
		std::fprintf(stderr, "FAIL: %s\n", message);
		return false;
	}
	return true;
}

// Build a minimal valid uncompressed top-origin 32-bit BGRA TGA so the original
// WWLib Targa reader (used by TextureLoader's uncompressed branch) can decode it.
bool write_probe_tga()
{
	std::vector<unsigned char> bytes;
	bytes.push_back(0);   // IDLength
	bytes.push_back(0);   // ColorMapType
	bytes.push_back(2);   // ImageType = uncompressed truecolor
	bytes.push_back(0); bytes.push_back(0); bytes.push_back(0); bytes.push_back(0);
	bytes.push_back(0);   // ColorMap spec (5 bytes)
	bytes.push_back(0); bytes.push_back(0); // XOrigin
	bytes.push_back(0); bytes.push_back(0); // YOrigin
	bytes.push_back(static_cast<unsigned char>(kTextureWidth & 0xff));
	bytes.push_back(static_cast<unsigned char>((kTextureWidth >> 8) & 0xff));
	bytes.push_back(static_cast<unsigned char>(kTextureHeight & 0xff));
	bytes.push_back(static_cast<unsigned char>((kTextureHeight >> 8) & 0xff));
	bytes.push_back(32);  // PixelDepth
	bytes.push_back(0x20); // ImageDescriptor: top-origin, 8 attribute bits

	for (unsigned int i = 0; i < kTextureWidth * kTextureHeight; ++i) {
		bytes.push_back(0x0a); // B
		bytes.push_back(0x14); // G
		bytes.push_back(0x1e); // R
		bytes.push_back(0xff); // A
	}

	std::FILE *fp = std::fopen(kTextureMemfsPath, "wb");
	if (fp == nullptr) {
		return false;
	}
	const bool wrote = std::fwrite(bytes.data(), 1, bytes.size(), fp) == bytes.size();
	std::fclose(fp);
	return wrote;
}

} // namespace

int main()
{
	initMemoryManager();
	wasm_d3d8_reset_state();

	bool ok = true;

	if (!expect(WW3D::Init(nullptr, nullptr, false) == WW3D_ERROR_OK, "WW3D::Init failed")) {
		return 1;
	}
	ok = ok && expect(
		WW3D::Set_Render_Device(0, 64, 64, 32, 1, false, false, true) == WW3D_ERROR_OK,
		"WW3D::Set_Render_Device failed");

	if (ok) {
		// The foreground loader reads files relative to the process CWD through
		// the default SimpleFileFactoryClass / native Targa open(). Stage the
		// TGA at MEMFS root so a bare name resolves.
		WW3D::Set_Thumbnail_Enabled(false);
		ok = ok && expect(write_probe_tga(), "failed to stage probe TGA in MEMFS");
	}

	WW3DAssetManager *asset_manager = nullptr;
	TextureClass *texture = nullptr;
	TextureClass *hash_texture = nullptr;
	bool init_called = false;
	bool has_d3d_texture = false;
	int width = 0;
	int height = 0;

	const unsigned int create_texture_before = wasm_d3d8_get_state()->create_texture_calls;
	const unsigned int texture_lock_before = wasm_d3d8_get_state()->texture_lock_rect_calls;
	const unsigned int texture_unlock_before = wasm_d3d8_get_state()->texture_unlock_rect_calls;

	if (ok) {
		asset_manager = W3DNEW WW3DAssetManager();
		ok = ok && expect(asset_manager != nullptr, "WW3DAssetManager allocation failed");
	}

	if (ok) {
		// Normal asset-manager request flow: this constructs
		// TextureClass("loader_probe.tga", NULL, ...) which -- with thumbnails
		// disabled and on the DX8 thread -- calls TextureClass::Init ->
		// TextureLoader::Request_Foreground_Loading -> Finish_Load inline.
		texture = asset_manager->Get_Texture(kTextureName);
		ok = ok && expect(texture != nullptr, "Get_Texture returned null");

		if (texture != nullptr) {
			init_called = texture->Is_Initialized();
			has_d3d_texture = texture->Peek_D3D_Texture() != nullptr;
			width = texture->Get_Width();
			height = texture->Get_Height();

			// A second request must hit the asset-manager texture hash and
			// return the same TextureClass (AddRef'd), proving the normal
			// registration path ran.
			hash_texture = asset_manager->Get_Texture(kTextureName);
		}
	}

	const WasmD3D8ShimState *state = wasm_d3d8_get_state();

	if (texture != nullptr) {
		ok = ok &&
			expect(init_called, "TextureClass::Init did not initialize the texture") &&
			expect(has_d3d_texture, "foreground loader did not install a D3D texture") &&
			expect(width == static_cast<int>(kTextureWidth),
				"loaded texture width does not match the source TGA") &&
			expect(height == static_cast<int>(kTextureHeight),
				"loaded texture height does not match the source TGA") &&
			expect(width != static_cast<int>(kMissingTextureWidth),
				"loaded texture is the MissingTexture fallback, not the real file") &&
			expect(state->create_texture_calls > create_texture_before,
				"foreground loader did not create a DX8 texture") &&
			expect(state->texture_lock_rect_calls > texture_lock_before,
				"foreground loader did not lock the DX8 texture surface") &&
			expect(state->texture_unlock_rect_calls > texture_unlock_before,
				"foreground loader did not unlock the DX8 texture surface") &&
			expect(hash_texture == texture,
				"asset-manager texture hash did not return the loaded TextureClass");
	}

	if (hash_texture != nullptr) {
		hash_texture->Release_Ref();
	}
	if (texture != nullptr) {
		texture->Release_Ref();
	}
	if (asset_manager != nullptr) {
		delete asset_manager;
	}

	WW3D::Shutdown();

	if (!ok) {
		return 1;
	}

	std::printf("{\"ok\":true,\"smoke\":\"ww3d2-texture-loader\","
		"\"texture\":{\"name\":\"%s\",\"width\":%d,\"height\":%d,"
		"\"initialized\":%s,\"hasD3DTexture\":%s},"
		"\"createTexture\":%u,\"textureLockRect\":%u,\"textureUnlockRect\":%u,"
		"\"flow\":\"WW3DAssetManager::Get_Texture -> TextureClass::Init -> "
		"TextureLoader::Request_Foreground_Loading -> Finish_Load\"}\n",
		kTextureName,
		width,
		height,
		init_called ? "true" : "false",
		has_d3d_texture ? "true" : "false",
		state->create_texture_calls,
		state->texture_lock_rect_calls,
		state->texture_unlock_rect_calls);
	return 0;
}
