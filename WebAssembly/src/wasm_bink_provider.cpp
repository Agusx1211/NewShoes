#include "bink.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace {
constexpr std::size_t kBikHeaderBytes = 44;
constexpr std::size_t kPathBytes = 512;
constexpr std::size_t kCodecBytes = 32;
constexpr const char *kBrowserVideoManifestName = "bink-browser-video-manifest.json";
constexpr const char *kBrowserVideoManifestDir = "artifacts/browser-video/bink";

struct BrowserBinkHandle
{
	BINK public_handle = {};
	char path[kPathBytes] = {};
	char browser_video_path[kPathBytes] = {};
	char browser_video_codec[kCodecBytes] = {};
	char browser_audio_codec[kCodecBytes] = {};
	u32 flags = 0;
	u32 file_size = 0;
	u32 size_field = 0;
	u32 largest_frame_size = 0;
	u32 repeated_frame_count = 0;
	u32 fps_numerator = 0;
	u32 fps_denominator = 0;
	u32 browser_video_frame_count = 0;
	double browser_video_duration_seconds = 0.0;
	int volume = 0;
	bool frame_ready = true;
	bool browser_video_available = false;
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

std::string dirname_of(const std::string &path)
{
	const std::string normalized = normalize_slashes(path);
	const std::size_t slash = normalized.find_last_of('/');
	return slash == std::string::npos ? std::string() : normalized.substr(0, slash);
}

void copy_string(char *dest, std::size_t dest_size, const std::string &value)
{
	if (dest_size == 0) {
		return;
	}
	std::snprintf(dest, dest_size, "%s", value.c_str());
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

bool read_text_file(const std::string &path, std::string &text)
{
	FILE *file = std::fopen(path.c_str(), "rb");
	if (file == nullptr) {
		return false;
	}

	bool ok = false;
	if (std::fseek(file, 0, SEEK_END) == 0) {
		const long size = std::ftell(file);
		if (size >= 0 && std::fseek(file, 0, SEEK_SET) == 0) {
			text.assign(static_cast<std::size_t>(size), '\0');
			ok = size == 0 ||
				std::fread(text.data(), 1, static_cast<std::size_t>(size), file) ==
					static_cast<std::size_t>(size);
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

std::vector<std::string> manifest_candidate_paths(const std::string &source_path)
{
	std::vector<std::string> paths;
	const std::string manifest_relative =
		std::string(kBrowserVideoManifestDir) + "/" + kBrowserVideoManifestName;
	paths.push_back(manifest_relative);
	paths.push_back("WebAssembly/" + manifest_relative);

	const std::string normalized_source = normalize_slashes(source_path);
	const std::string marker = "artifacts/real-assets/";
	const std::size_t marker_pos = normalized_source.find(marker);
	if (marker_pos != std::string::npos) {
		paths.push_back(normalized_source.substr(0, marker_pos) + manifest_relative);
	}

	const std::string source_dir = dirname_of(normalized_source);
	if (!source_dir.empty()) {
		paths.push_back(source_dir + "/../browser-video/bink/" + kBrowserVideoManifestName);
	}

	std::vector<std::string> unique_paths;
	for (const std::string &path : paths) {
		if (std::find(unique_paths.begin(), unique_paths.end(), path) == unique_paths.end()) {
			unique_paths.push_back(path);
		}
	}
	return unique_paths;
}

std::string json_string_value(const std::string &section, const char *key)
{
	const std::string needle = std::string("\"") + key + "\"";
	const std::size_t key_pos = section.find(needle);
	if (key_pos == std::string::npos) {
		return std::string();
	}
	const std::size_t colon = section.find(':', key_pos + needle.size());
	if (colon == std::string::npos) {
		return std::string();
	}
	const std::size_t open_quote = section.find('"', colon + 1);
	if (open_quote == std::string::npos) {
		return std::string();
	}
	const std::size_t close_quote = section.find('"', open_quote + 1);
	if (close_quote == std::string::npos) {
		return std::string();
	}
	return section.substr(open_quote + 1, close_quote - open_quote - 1);
}

bool json_u32_value(const std::string &section, const char *key, u32 &value)
{
	const std::string needle = std::string("\"") + key + "\"";
	const std::size_t key_pos = section.find(needle);
	if (key_pos == std::string::npos) {
		return false;
	}
	const std::size_t colon = section.find(':', key_pos + needle.size());
	if (colon == std::string::npos) {
		return false;
	}
	char *end = nullptr;
	const unsigned long parsed = std::strtoul(section.c_str() + colon + 1, &end, 10);
	if (end == section.c_str() + colon + 1) {
		return false;
	}
	value = static_cast<u32>(parsed);
	return true;
}

bool json_double_value(const std::string &section, const char *key, double &value)
{
	const std::string needle = std::string("\"") + key + "\"";
	const std::size_t key_pos = section.find(needle);
	if (key_pos == std::string::npos) {
		return false;
	}
	const std::size_t colon = section.find(':', key_pos + needle.size());
	if (colon == std::string::npos) {
		return false;
	}
	char *end = nullptr;
	const double parsed = std::strtod(section.c_str() + colon + 1, &end);
	if (end == section.c_str() + colon + 1) {
		return false;
	}
	value = parsed;
	return true;
}

std::string json_first_array_string(const std::string &section, const char *key)
{
	const std::string needle = std::string("\"") + key + "\"";
	const std::size_t key_pos = section.find(needle);
	if (key_pos == std::string::npos) {
		return std::string();
	}
	const std::size_t open_bracket = section.find('[', key_pos + needle.size());
	if (open_bracket == std::string::npos) {
		return std::string();
	}
	const std::size_t close_bracket = section.find(']', open_bracket + 1);
	if (close_bracket == std::string::npos) {
		return std::string();
	}
	const std::size_t open_quote = section.find('"', open_bracket + 1);
	if (open_quote == std::string::npos || open_quote > close_bracket) {
		return std::string();
	}
	const std::size_t close_quote = section.find('"', open_quote + 1);
	if (close_quote == std::string::npos || close_quote > close_bracket) {
		return std::string();
	}
	return section.substr(open_quote + 1, close_quote - open_quote - 1);
}

bool parse_manifest_payload(const std::string &manifest, const std::string &source_file, BrowserBinkHandle &handle)
{
	std::size_t search_pos = 0;
	while (true) {
		const std::size_t source_key = manifest.find("\"sourceFile\"", search_pos);
		if (source_key == std::string::npos) {
			return false;
		}
		const std::size_t next_source_key = manifest.find("\"sourceFile\"", source_key + 12);
		const std::string section = manifest.substr(
			source_key,
			next_source_key == std::string::npos ? std::string::npos : next_source_key - source_key);
		if (json_string_value(section, "sourceFile") != source_file) {
			search_pos = source_key + 12;
			continue;
		}

		u32 frames = 0;
		u32 width = 0;
		u32 height = 0;
		u32 output_frames = 0;
		double duration = 0.0;
		if (!json_u32_value(section, "frames", frames) ||
				!json_u32_value(section, "width", width) ||
				!json_u32_value(section, "height", height) ||
				!json_u32_value(section, "outputFrameCount", output_frames) ||
				!json_double_value(section, "outputDurationSeconds", duration)) {
			return false;
		}

		const std::string output_file = json_string_value(section, "outputFile");
		const std::string output_codec = json_string_value(section, "outputVideoCodec");
		const std::string output_audio_codec = json_first_array_string(section, "outputAudioCodecs");
		if (output_file.empty() || output_codec.empty()) {
			return false;
		}
		if (frames != handle.public_handle.Frames ||
				output_frames != handle.public_handle.Frames ||
				width != handle.public_handle.Width ||
				height != handle.public_handle.Height) {
			return false;
		}

		handle.browser_video_available = true;
		handle.browser_video_frame_count = output_frames;
		handle.browser_video_duration_seconds = duration;
		copy_string(handle.browser_video_codec, sizeof(handle.browser_video_codec), output_codec);
		copy_string(handle.browser_audio_codec, sizeof(handle.browser_audio_codec), output_audio_codec);
		copy_string(
			handle.browser_video_path,
			sizeof(handle.browser_video_path),
			std::string(kBrowserVideoManifestDir) + "/" + output_file);
		return true;
	}
}

void attach_browser_video_metadata(const std::string &source_path, BrowserBinkHandle &handle)
{
	const std::string source_file = basename_of(source_path);

	for (const std::string &manifest_path : manifest_candidate_paths(source_path)) {
		std::string manifest;
		if (!read_text_file(manifest_path, manifest)) {
			continue;
		}
		if (parse_manifest_payload(manifest, source_file, handle)) {
			return;
		}
	}
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
		copy_string(handle->path, sizeof(handle->path), path);
		if (!parse_bik_header(header, file_size, *handle)) {
			delete handle;
			continue;
		}
		attach_browser_video_metadata(path, *handle);
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

int WasmBinkProviderHasBrowserVideo(HBINK bink)
{
	const BrowserBinkHandle *handle = to_browser_handle(bink);
	return handle != nullptr && handle->browser_video_available ? 1 : 0;
}

const char *WasmBinkProviderGetBrowserVideoPath(HBINK bink)
{
	const BrowserBinkHandle *handle = to_browser_handle(bink);
	return handle != nullptr ? handle->browser_video_path : "";
}

const char *WasmBinkProviderGetBrowserVideoCodec(HBINK bink)
{
	const BrowserBinkHandle *handle = to_browser_handle(bink);
	return handle != nullptr ? handle->browser_video_codec : "";
}

const char *WasmBinkProviderGetBrowserAudioCodec(HBINK bink)
{
	const BrowserBinkHandle *handle = to_browser_handle(bink);
	return handle != nullptr ? handle->browser_audio_codec : "";
}

u32 WasmBinkProviderGetBrowserVideoFrameCount(HBINK bink)
{
	const BrowserBinkHandle *handle = to_browser_handle(bink);
	return handle != nullptr ? handle->browser_video_frame_count : 0;
}

double WasmBinkProviderGetBrowserVideoDurationSeconds(HBINK bink)
{
	const BrowserBinkHandle *handle = to_browser_handle(bink);
	return handle != nullptr ? handle->browser_video_duration_seconds : 0.0;
}

}
