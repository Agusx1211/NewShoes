#include "wasm_browser_runtime_assets.h"

#include <algorithm>
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/AsciiString.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "ffactory.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"
#include "W3DDevice/GameClient/W3DFileSystem.h"

namespace {

Win32LocalFileSystem g_runtime_local_file_system;
Win32BIGFileSystem g_runtime_archive_file_system;
FileSystem g_runtime_file_system;
NameKeyGenerator g_runtime_name_key_generator;
W3DFileSystem *g_runtime_w3d_file_system = nullptr;
WasmBrowserRuntimeAssetsState g_runtime_assets_state;
std::vector<std::pair<std::string, std::string>> g_loaded_archive_specs;

std::string json_escape(const std::string &value)
{
	std::string escaped;
	escaped.reserve(value.size());
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

void split_archive_path(const char *archive_path, std::string &directory, std::string &file_mask)
{
	std::string normalized = archive_path != nullptr ? archive_path : "";
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

bool archive_spec_already_loaded(const std::string &directory, const std::string &file_mask)
{
	for (const auto &loaded : g_loaded_archive_specs) {
		if (loaded.first != directory) {
			continue;
		}
		if (loaded.second == file_mask || loaded.second == "*.big") {
			return true;
		}
	}

	return false;
}

void remember_archive_spec(const std::string &directory, const std::string &file_mask)
{
	if (!archive_spec_already_loaded(directory, file_mask)) {
		g_loaded_archive_specs.emplace_back(directory, file_mask);
	}
	g_runtime_assets_state.loaded_archive_specs = g_loaded_archive_specs.size();
}

void install_runtime_globals()
{
	++g_runtime_assets_state.install_calls;

	TheLocalFileSystem = &g_runtime_local_file_system;
	TheArchiveFileSystem = &g_runtime_archive_file_system;
	TheFileSystem = &g_runtime_file_system;
	TheNameKeyGenerator = &g_runtime_name_key_generator;

	if (!g_runtime_assets_state.name_key_generator_initialized) {
		g_runtime_name_key_generator.init();
		g_runtime_assets_state.name_key_generator_initialized = true;
	}

	if (!g_runtime_assets_state.file_system_initialized) {
		g_runtime_file_system.init();
		g_runtime_assets_state.file_system_initialized = true;
	}

	if (TheW3DFileSystem == nullptr) {
		g_runtime_w3d_file_system = new W3DFileSystem;
		TheW3DFileSystem = g_runtime_w3d_file_system;
		g_runtime_assets_state.owns_w3d_file_system = true;
	}

	g_runtime_assets_state.installed =
		TheLocalFileSystem == &g_runtime_local_file_system &&
		TheArchiveFileSystem == &g_runtime_archive_file_system &&
		TheFileSystem == &g_runtime_file_system &&
		TheNameKeyGenerator == &g_runtime_name_key_generator;
	g_runtime_assets_state.w3d_file_system_installed =
		TheW3DFileSystem != nullptr &&
		_TheFileFactory == TheW3DFileSystem;
	g_runtime_assets_state.source =
		"browser runtime original FileSystem + Win32BIGFileSystem + W3DFileSystem";
}

bool load_archive_set(const std::string &directory, const std::string &file_mask)
{
	if (file_mask.empty()) {
		return false;
	}

	install_runtime_globals();
	if (archive_spec_already_loaded(directory, file_mask)) {
		if (g_runtime_assets_state.archive_file_mask.empty()) {
			g_runtime_assets_state.archive_directory = directory;
			g_runtime_assets_state.archive_file_mask = file_mask;
		}
		g_runtime_assets_state.archive_loaded = true;
		return true;
	}

	g_runtime_assets_state.archive_directory = directory;
	g_runtime_assets_state.archive_file_mask = file_mask;

	const Bool loaded = g_runtime_archive_file_system.loadBigFilesFromDirectory(
		directory.c_str(),
		file_mask.c_str());
	++g_runtime_assets_state.archive_load_calls;
	if (loaded) {
		remember_archive_spec(directory, file_mask);
		g_runtime_assets_state.archive_loaded = true;
	}
	return loaded;
}

} // namespace

bool wasm_browser_runtime_assets_install_archive_set(
	const char *archive_directory,
	const char *archive_file_mask)
{
	const std::string directory = archive_directory != nullptr ? archive_directory : "";
	const std::string file_mask = archive_file_mask != nullptr ? archive_file_mask : "";
	return load_archive_set(directory, file_mask);
}

bool wasm_browser_runtime_assets_install_archive_paths(
	const char *first_archive_path,
	const char *second_archive_path)
{
	std::string first_directory;
	std::string first_file_mask;
	std::string second_directory;
	std::string second_file_mask;
	split_archive_path(first_archive_path, first_directory, first_file_mask);
	split_archive_path(second_archive_path, second_directory, second_file_mask);

	const bool first_loaded = load_archive_set(first_directory, first_file_mask);
	const bool second_loaded = second_file_mask.empty()
		? true
		: load_archive_set(second_directory, second_file_mask);
	return first_loaded && second_loaded;
}

bool wasm_browser_runtime_assets_file_exists(const char *path)
{
	return TheFileSystem != nullptr &&
		path != nullptr &&
		TheFileSystem->doesFileExist(path);
}

bool wasm_browser_runtime_assets_read_file(const char *path, std::vector<unsigned char> &data)
{
	data.clear();
	if (TheFileSystem == nullptr || path == nullptr) {
		return false;
	}

	File *file = TheFileSystem->openFile(path, File::READ | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	const int size = file->size();
	if (size <= 0) {
		file->close();
		return false;
	}

	data.assign(static_cast<std::size_t>(size), 0);
	const int bytes_read = file->read(data.data(), size);
	file->close();

	if (bytes_read != size) {
		data.clear();
		return false;
	}

	return true;
}

const WasmBrowserRuntimeAssetsState &wasm_browser_runtime_assets_state()
{
	return g_runtime_assets_state;
}

std::string wasm_browser_runtime_assets_state_json()
{
	const std::string directory_json = json_escape(g_runtime_assets_state.archive_directory);
	const std::string file_mask_json = json_escape(g_runtime_assets_state.archive_file_mask);
	const std::string source_json = json_escape(g_runtime_assets_state.source);
	char buffer[1400];
	std::snprintf(buffer, sizeof(buffer),
		"{\"installed\":%s,\"fileSystemInitialized\":%s,"
		"\"archiveLoaded\":%s,\"nameKeyGeneratorInitialized\":%s,"
		"\"w3dFileSystemInstalled\":%s,\"ownsW3DFileSystem\":%s,"
		"\"installCalls\":%d,\"archiveLoadCalls\":%d,"
		"\"loadedArchiveSpecs\":%zu,\"directory\":\"%s\","
		"\"fileMask\":\"%s\",\"source\":\"%s\"}",
		g_runtime_assets_state.installed ? "true" : "false",
		g_runtime_assets_state.file_system_initialized ? "true" : "false",
		g_runtime_assets_state.archive_loaded ? "true" : "false",
		g_runtime_assets_state.name_key_generator_initialized ? "true" : "false",
		g_runtime_assets_state.w3d_file_system_installed ? "true" : "false",
		g_runtime_assets_state.owns_w3d_file_system ? "true" : "false",
		g_runtime_assets_state.install_calls,
		g_runtime_assets_state.archive_load_calls,
		g_runtime_assets_state.loaded_archive_specs,
		directory_json.c_str(),
		file_mask_json.c_str(),
		source_json.c_str());
	return buffer;
}
