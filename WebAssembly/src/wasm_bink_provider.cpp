#include "bink.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdio>
#include <string>
#include <vector>

namespace {
constexpr std::size_t kBikHeaderBytes = 44;

struct BrowserBinkHandle
{
	BINK public_handle = {};
	char path[512] = {};
	u32 flags = 0;
	u32 file_size = 0;
	u32 size_field = 0;
	u32 largest_frame_size = 0;
	u32 repeated_frame_count = 0;
	u32 fps_numerator = 0;
	u32 fps_denominator = 0;
	int volume = 0;
	bool frame_ready = true;
};

static_assert(offsetof(BrowserBinkHandle, public_handle) == 0, "HBINK must point at the first BINK field");

u32 read_le32(const unsigned char *bytes)
{
	return static_cast<u32>(bytes[0]) |
		(static_cast<u32>(bytes[1]) << 8) |
		(static_cast<u32>(bytes[2]) << 16) |
		(static_cast<u32>(bytes[3]) << 24);
}

std::string normalize_slashes(std::string path)
{
	std::replace(path.begin(), path.end(), '\\', '/');
	return path;
}

std::string basename_of(const std::string &path)
{
	const std::string normalized = normalize_slashes(path);
	const std::size_t slash = normalized.find_last_of('/');
	return slash == std::string::npos ? normalized : normalized.substr(slash + 1);
}

bool read_file_header(const std::string &path, std::array<unsigned char, kBikHeaderBytes> &header, long &file_size)
{
	FILE *file = std::fopen(path.c_str(), "rb");
	if (file == nullptr) {
		return false;
	}

	bool ok = false;
	if (std::fseek(file, 0, SEEK_END) == 0) {
		file_size = std::ftell(file);
		if (file_size >= static_cast<long>(kBikHeaderBytes) &&
				std::fseek(file, 0, SEEK_SET) == 0 &&
				std::fread(header.data(), 1, header.size(), file) == header.size()) {
			ok = true;
		}
	}

	std::fclose(file);
	return ok;
}

std::vector<std::string> candidate_paths(const char *name)
{
	std::vector<std::string> paths;
	if (name == nullptr || name[0] == '\0') {
		return paths;
	}

	const std::string original(name);
	const std::string normalized = normalize_slashes(original);
	const std::string basename = basename_of(original);

	paths.push_back(original);
	if (normalized != original) {
		paths.push_back(normalized);
	}
	if (basename != original && basename != normalized) {
		paths.push_back(basename);
	}
	if (!basename.empty()) {
		paths.push_back("artifacts/real-assets/" + basename);
		paths.push_back("WebAssembly/artifacts/real-assets/" + basename);
	}

	std::vector<std::string> unique_paths;
	for (const std::string &path : paths) {
		if (std::find(unique_paths.begin(), unique_paths.end(), path) == unique_paths.end()) {
			unique_paths.push_back(path);
		}
	}
	return unique_paths;
}

bool parse_bik_header(
	const std::array<unsigned char, kBikHeaderBytes> &header,
	long file_size,
	BrowserBinkHandle &handle)
{
	const bool is_bik =
		header[0] == 'B' && header[1] == 'I' && header[2] == 'K';
	if (!is_bik) {
		return false;
	}

	handle.file_size = static_cast<u32>(file_size);
	handle.size_field = read_le32(&header[4]);
	handle.public_handle.Frames = read_le32(&header[8]);
	handle.largest_frame_size = read_le32(&header[12]);
	handle.repeated_frame_count = read_le32(&header[16]);
	handle.public_handle.Width = read_le32(&header[20]);
	handle.public_handle.Height = read_le32(&header[24]);
	handle.fps_numerator = read_le32(&header[28]);
	handle.fps_denominator = read_le32(&header[32]);
	handle.public_handle.FrameNum = handle.public_handle.Frames > 0 ? 1 : 0;

	return handle.size_field == handle.file_size - 8 &&
		handle.public_handle.Frames > 0 &&
		handle.repeated_frame_count == handle.public_handle.Frames &&
		handle.public_handle.Width > 0 &&
		handle.public_handle.Height > 0 &&
		handle.fps_numerator > 0 &&
		handle.fps_denominator > 0;
}

BrowserBinkHandle *to_browser_handle(HBINK bink)
{
	return reinterpret_cast<BrowserBinkHandle *>(bink);
}
}

extern "C" {

HBINK BinkOpen(const char *name, u32 flags)
{
	for (const std::string &path : candidate_paths(name)) {
		std::array<unsigned char, kBikHeaderBytes> header = {};
		long file_size = 0;
		if (!read_file_header(path, header, file_size)) {
			continue;
		}

		BrowserBinkHandle *handle = new BrowserBinkHandle;
		handle->flags = flags;
		std::snprintf(handle->path, sizeof(handle->path), "%s", path.c_str());
		if (!parse_bik_header(header, file_size, *handle)) {
			delete handle;
			continue;
		}
		return &handle->public_handle;
	}
	return nullptr;
}

void BinkClose(HBINK bink)
{
	delete to_browser_handle(bink);
}

int BinkWait(HBINK bink)
{
	const BrowserBinkHandle *handle = to_browser_handle(bink);
	return handle != nullptr && handle->frame_ready ? 0 : 1;
}

void BinkDoFrame(HBINK bink)
{
	BrowserBinkHandle *handle = to_browser_handle(bink);
	if (handle != nullptr) {
		handle->frame_ready = true;
	}
}

void BinkNextFrame(HBINK bink)
{
	BrowserBinkHandle *handle = to_browser_handle(bink);
	if (handle != nullptr && handle->public_handle.FrameNum < handle->public_handle.Frames) {
		++handle->public_handle.FrameNum;
	}
}

void BinkGoto(HBINK bink, u32 frame, u32)
{
	BrowserBinkHandle *handle = to_browser_handle(bink);
	if (handle == nullptr || handle->public_handle.Frames == 0) {
		return;
	}
	if (frame < 1) {
		frame = 1;
	}
	if (frame > handle->public_handle.Frames) {
		frame = handle->public_handle.Frames;
	}
	handle->public_handle.FrameNum = frame;
}

void BinkCopyToBuffer(HBINK, void *, u32, u32, u32, u32, u32)
{
	// Frame decode/copy remains a WebCodecs/decoder task; this provider only
	// proves real-file open, metadata, and cursor lifecycle for the original API.
}

void BinkSetVolume(HBINK bink, u32, int volume)
{
	BrowserBinkHandle *handle = to_browser_handle(bink);
	if (handle != nullptr) {
		handle->volume = volume;
	}
}

int BinkSoundUseDirectSound(void *directSound)
{
	return directSound != nullptr ? 1 : 0;
}

void BinkSetSoundTrack(u32, const u32 *)
{
}

int WasmBinkProviderCanDecodeFrames()
{
	return 0;
}

}
