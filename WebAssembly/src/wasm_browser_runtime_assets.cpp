#include "wasm_browser_runtime_assets.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
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
Win32BIGFileSystem *g_runtime_archive_file_system = nullptr;
FileSystem g_runtime_file_system;
NameKeyGenerator g_runtime_name_key_generator;
W3DFileSystem *g_runtime_w3d_file_system = nullptr;
WasmBrowserRuntimeAssetsState g_runtime_assets_state;
std::vector<std::pair<std::string, std::string>> g_loaded_archive_specs;

constexpr const char RUNTIME_LOCAL_DIRECTORY[] = "cnc-port-runtime-fs-owner";
constexpr const char RUNTIME_LOCAL_DIRECTORY_SLASH[] = "cnc-port-runtime-fs-owner/";
constexpr const char RUNTIME_LOCAL_PATH[] = "cnc-port-runtime-fs-owner/local-file.txt";
constexpr const char RUNTIME_LOCAL_PAYLOAD[] = "cnc-port runtime FileSystem owner\n";
constexpr const char RUNTIME_MISSING_PATH[] = "cnc-port-runtime-fs-owner/missing-file.txt";
constexpr const char RUNTIME_ARCHIVE_PATH[] = "Data\\INI\\Armor.ini";
constexpr const char RUNTIME_FILE_PROBE_SOURCE[] =
	"browser runtime persistent FileSystem globals + Win32BIGFileSystem";

const char *json_bool(bool value)
{
	return value ? "true" : "false";
}

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

std::string runtime_file_probe_state_json(const WasmBrowserRuntimeFileProbeState &probe)
{
	const std::string local_path_json = json_escape(probe.local_path);
	const std::string archive_path_json = json_escape(probe.archive_path);
	const std::string archive_owner_json = json_escape(probe.archive_owner);
	const std::string source_json = json_escape(probe.source);
	std::string json = "{";
	json += "\"attempted\":";
	json += json_bool(probe.attempted);
	json += ",\"ok\":";
	json += json_bool(probe.ok);
	json += ",\"source\":\"";
	json += source_json;
	json += "\",\"globals\":{\"ok\":";
	json += json_bool(probe.global_owner_ok);
	json += ",\"localFileSystem\":";
	json += json_bool(probe.local_file_system_global);
	json += ",\"archiveFileSystem\":";
	json += json_bool(probe.archive_file_system_global);
	json += ",\"fileSystem\":";
	json += json_bool(probe.file_system_global);
	json += ",\"nameKeyGenerator\":";
	json += json_bool(probe.name_key_generator_global);
	json += ",\"w3dFileSystem\":";
	json += json_bool(probe.w3d_file_system_global);
	json += "},\"local\":{\"ok\":";
	json += json_bool(probe.local_ok);
	json += ",\"path\":\"";
	json += local_path_json;
	json += "\",\"directory\":";
	json += json_bool(probe.local_directory_ok);
	json += ",\"write\":";
	json += json_bool(probe.local_write_ok);
	json += ",\"exists\":";
	json += json_bool(probe.local_exists_ok);
	json += ",\"cache\":";
	json += json_bool(probe.local_cache_ok);
	json += ",\"info\":";
	json += json_bool(probe.local_info_ok);
	json += ",\"infoSize\":";
	json += std::to_string(probe.local_info_size);
	json += ",\"list\":";
	json += json_bool(probe.local_list_ok);
	json += ",\"read\":";
	json += json_bool(probe.local_read_ok);
	json += ",\"missingCache\":";
	json += json_bool(probe.local_missing_cache_ok);
	json += ",\"bytes\":";
	json += std::to_string(probe.local_bytes);
	json += "},\"archive\":{\"attempted\":";
	json += json_bool(probe.archive_attempted);
	json += ",\"loaded\":";
	json += json_bool(probe.archive_loaded);
	json += ",\"ok\":";
	json += json_bool(probe.archive_ok);
	json += ",\"path\":\"";
	json += archive_path_json;
	json += "\",\"owner\":\"";
	json += archive_owner_json;
	json += "\",\"indexedFiles\":";
	json += std::to_string(probe.archive_indexed_file_count);
	json += ",\"exists\":";
	json += json_bool(probe.archive_exists_ok);
	json += ",\"info\":";
	json += json_bool(probe.archive_info_ok);
	json += ",\"infoSize\":";
	json += std::to_string(probe.archive_info_size);
	json += ",\"list\":";
	json += json_bool(probe.archive_list_ok);
	json += ",\"read\":";
	json += json_bool(probe.archive_read_ok);
	json += ",\"bytes\":";
	json += std::to_string(probe.archive_bytes);
	json += ",\"ownerLookup\":";
	json += json_bool(probe.archive_owner_ok);
	json += "}}";
	return json;
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

Win32BIGFileSystem &runtime_archive_file_system()
{
	if (g_runtime_archive_file_system == nullptr) {
		g_runtime_archive_file_system = new Win32BIGFileSystem;
	}
	return *g_runtime_archive_file_system;
}

Win32BIGFileSystem &recreate_runtime_archive_file_system()
{
	// Archive files are original-engine objects; after a focused probe resets the
	// original memory manager, reload the BIG tree into fresh objects instead of
	// walking stale archive state.
	g_runtime_archive_file_system = new Win32BIGFileSystem;
	return *g_runtime_archive_file_system;
}

void probe_persistent_runtime_file_system()
{
	WasmBrowserRuntimeFileProbeState probe;
	probe.attempted = true;
	probe.source = RUNTIME_FILE_PROBE_SOURCE;
	probe.local_path = RUNTIME_LOCAL_PATH;
	probe.archive_path = RUNTIME_ARCHIVE_PATH;
	probe.local_file_system_global = TheLocalFileSystem == &g_runtime_local_file_system;
	probe.archive_file_system_global = TheArchiveFileSystem == g_runtime_archive_file_system;
	probe.file_system_global = TheFileSystem == &g_runtime_file_system;
	probe.name_key_generator_global = TheNameKeyGenerator == &g_runtime_name_key_generator;
	probe.w3d_file_system_global =
		TheW3DFileSystem != nullptr &&
		_TheFileFactory == TheW3DFileSystem;
	probe.global_owner_ok =
		probe.local_file_system_global &&
		probe.archive_file_system_global &&
		probe.file_system_global &&
		probe.name_key_generator_global &&
		probe.w3d_file_system_global;

	if (!probe.local_file_system_global ||
		!probe.archive_file_system_global ||
		!probe.file_system_global ||
		!probe.name_key_generator_global) {
		g_runtime_assets_state.file_probe = probe;
		return;
	}

	std::remove(RUNTIME_LOCAL_PATH);
	probe.local_directory_ok =
		TheFileSystem->createDirectory(AsciiString(RUNTIME_LOCAL_DIRECTORY)) ||
		TheFileSystem->doesFileExist(RUNTIME_LOCAL_DIRECTORY);

	File *written = TheFileSystem->openFile(
		RUNTIME_LOCAL_PATH,
		File::WRITE | File::TEXT | File::CREATE);
	probe.local_write_ok = written != nullptr;
	if (written != nullptr) {
		probe.local_bytes = written->write(
			RUNTIME_LOCAL_PAYLOAD,
			static_cast<Int>(std::strlen(RUNTIME_LOCAL_PAYLOAD)));
		probe.local_write_ok =
			probe.local_bytes == static_cast<Int>(std::strlen(RUNTIME_LOCAL_PAYLOAD));
		written->close();
	}

	probe.local_exists_ok = TheFileSystem->doesFileExist(RUNTIME_LOCAL_PATH);

	FileInfo local_info = {};
	probe.local_info_ok =
		TheFileSystem->getFileInfo(AsciiString(RUNTIME_LOCAL_PATH), &local_info) &&
		local_info.sizeHigh == 0 &&
		local_info.sizeLow == probe.local_bytes;
	probe.local_info_size = local_info.sizeLow;

	FilenameList local_files;
	TheFileSystem->getFileListInDirectory(
		AsciiString(RUNTIME_LOCAL_DIRECTORY_SLASH),
		AsciiString("*.txt"),
		local_files,
		FALSE);
	probe.local_list_ok = local_files.find(AsciiString(RUNTIME_LOCAL_PATH)) != local_files.end();

	File *opened = TheFileSystem->openFile(RUNTIME_LOCAL_PATH, File::READ | File::BINARY);
	char local_readback[sizeof(RUNTIME_LOCAL_PAYLOAD)] = {};
	const Int local_bytes_read = opened != nullptr
		? opened->read(local_readback, static_cast<Int>(std::strlen(RUNTIME_LOCAL_PAYLOAD)))
		: 0;
	probe.local_read_ok =
		opened != nullptr &&
		local_bytes_read == static_cast<Int>(std::strlen(RUNTIME_LOCAL_PAYLOAD)) &&
		std::memcmp(local_readback, RUNTIME_LOCAL_PAYLOAD, std::strlen(RUNTIME_LOCAL_PAYLOAD)) == 0;
	if (opened != nullptr) {
		opened->close();
	}

	std::remove(RUNTIME_LOCAL_PATH);
	probe.local_cache_ok = TheFileSystem->doesFileExist(RUNTIME_LOCAL_PATH);
	const bool missing_first = !TheFileSystem->doesFileExist(RUNTIME_MISSING_PATH);
	const bool missing_second = !TheFileSystem->doesFileExist(RUNTIME_MISSING_PATH);
	probe.local_missing_cache_ok = missing_first && missing_second;
	probe.local_ok =
		probe.local_directory_ok &&
		probe.local_write_ok &&
		probe.local_exists_ok &&
		probe.local_cache_ok &&
		probe.local_info_ok &&
		probe.local_list_ok &&
		probe.local_read_ok &&
		probe.local_missing_cache_ok;

	probe.archive_loaded = g_runtime_assets_state.archive_loaded;
	if (g_runtime_assets_state.archive_loaded) {
		FilenameList indexed_files;
		runtime_archive_file_system().getFileListInDirectory(
			AsciiString(""),
			AsciiString(""),
			AsciiString("*"),
			indexed_files,
			TRUE);
		probe.archive_indexed_file_count = indexed_files.size();

		probe.archive_owner =
			runtime_archive_file_system().getArchiveFilenameForFile(RUNTIME_ARCHIVE_PATH).str();
		probe.archive_owner_ok = !probe.archive_owner.empty();
		if (probe.archive_owner_ok) {
			probe.archive_attempted = true;
			probe.archive_exists_ok = TheFileSystem->doesFileExist(RUNTIME_ARCHIVE_PATH);

			FileInfo archive_info = {};
			probe.archive_info_ok =
				TheFileSystem->getFileInfo(AsciiString(RUNTIME_ARCHIVE_PATH), &archive_info) &&
				archive_info.sizeHigh == 0 &&
				archive_info.sizeLow > 0;
			probe.archive_info_size = archive_info.sizeLow;

			FilenameList ini_files;
			TheFileSystem->getFileListInDirectory(
				AsciiString("Data\\INI\\"),
				AsciiString("*.ini"),
				ini_files,
				FALSE);
			probe.archive_list_ok =
				ini_files.find(AsciiString("data\\ini\\armor.ini")) != ini_files.end();

			File *archive_file = TheFileSystem->openFile(RUNTIME_ARCHIVE_PATH, File::READ | File::BINARY);
			char header[16] = {};
			probe.archive_bytes =
				archive_file != nullptr ? archive_file->read(header, sizeof(header)) : 0;
			probe.archive_read_ok =
				archive_file != nullptr &&
				probe.archive_bytes == static_cast<Int>(sizeof(header));
			if (archive_file != nullptr) {
				archive_file->close();
			}
		}

		probe.archive_ok =
			probe.archive_loaded &&
			probe.archive_indexed_file_count > 0 &&
			probe.archive_exists_ok &&
			probe.archive_info_ok &&
			probe.archive_list_ok &&
			probe.archive_read_ok &&
			probe.archive_owner_ok;
	}

	probe.ok = probe.global_owner_ok && probe.local_ok && (!probe.archive_attempted || probe.archive_ok);
	g_runtime_assets_state.file_probe = probe;
}

void assign_runtime_globals()
{
	TheLocalFileSystem = &g_runtime_local_file_system;
	TheArchiveFileSystem = &runtime_archive_file_system();
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
	} else if (_TheFileFactory != TheW3DFileSystem) {
		_TheFileFactory = TheW3DFileSystem;
	}

	g_runtime_assets_state.installed =
		TheLocalFileSystem == &g_runtime_local_file_system &&
		TheArchiveFileSystem == g_runtime_archive_file_system &&
		TheFileSystem == &g_runtime_file_system &&
		TheNameKeyGenerator == &g_runtime_name_key_generator;
	g_runtime_assets_state.w3d_file_system_installed =
		TheW3DFileSystem != nullptr &&
		_TheFileFactory == TheW3DFileSystem;
	g_runtime_assets_state.source =
		"browser runtime original FileSystem + Win32BIGFileSystem + W3DFileSystem";
}

void install_runtime_globals()
{
	++g_runtime_assets_state.install_calls;
	assign_runtime_globals();
	probe_persistent_runtime_file_system();
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
		probe_persistent_runtime_file_system();
		return true;
	}

	g_runtime_assets_state.archive_directory = directory;
	g_runtime_assets_state.archive_file_mask = file_mask;

	const Bool loaded = runtime_archive_file_system().loadBigFilesFromDirectory(
		directory.c_str(),
		file_mask.c_str());
	++g_runtime_assets_state.archive_load_calls;
	if (loaded) {
		remember_archive_spec(directory, file_mask);
		g_runtime_assets_state.archive_loaded = true;
	}
	probe_persistent_runtime_file_system();
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

bool wasm_browser_runtime_assets_restore_globals()
{
	const bool reload_registered_archive =
		g_runtime_assets_state.archive_loaded &&
		!g_runtime_assets_state.archive_file_mask.empty();
	++g_runtime_assets_state.install_calls;
	if (reload_registered_archive) {
		recreate_runtime_archive_file_system();
	}
	assign_runtime_globals();
	if (reload_registered_archive) {
		const Bool loaded = runtime_archive_file_system().loadBigFilesFromDirectory(
			g_runtime_assets_state.archive_directory.c_str(),
			g_runtime_assets_state.archive_file_mask.c_str(),
			TRUE);
		++g_runtime_assets_state.archive_load_calls;
		g_runtime_assets_state.archive_loaded = loaded;
	}
	return g_runtime_assets_state.installed;
}

bool wasm_browser_runtime_assets_file_exists(const char *path)
{
	if (path == nullptr) {
		return false;
	}

	if (TheFileSystem != nullptr && TheFileSystem->doesFileExist(path)) {
		return true;
	}

	if (TheLocalFileSystem != nullptr && TheLocalFileSystem->doesFileExist(path)) {
		return true;
	}

	return TheArchiveFileSystem != nullptr && TheArchiveFileSystem->doesFileExist(path);
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
	std::string json = "{";
	json += "\"installed\":";
	json += json_bool(g_runtime_assets_state.installed);
	json += ",\"fileSystemInitialized\":";
	json += json_bool(g_runtime_assets_state.file_system_initialized);
	json += ",\"archiveLoaded\":";
	json += json_bool(g_runtime_assets_state.archive_loaded);
	json += ",\"nameKeyGeneratorInitialized\":";
	json += json_bool(g_runtime_assets_state.name_key_generator_initialized);
	json += ",\"w3dFileSystemInstalled\":";
	json += json_bool(g_runtime_assets_state.w3d_file_system_installed);
	json += ",\"ownsW3DFileSystem\":";
	json += json_bool(g_runtime_assets_state.owns_w3d_file_system);
	json += ",\"installCalls\":";
	json += std::to_string(g_runtime_assets_state.install_calls);
	json += ",\"archiveLoadCalls\":";
	json += std::to_string(g_runtime_assets_state.archive_load_calls);
	json += ",\"loadedArchiveSpecs\":";
	json += std::to_string(g_runtime_assets_state.loaded_archive_specs);
	json += ",\"directory\":\"";
	json += directory_json;
	json += "\",\"fileMask\":\"";
	json += file_mask_json;
	json += "\",\"source\":\"";
	json += source_json;
	json += "\",\"fileProbe\":";
	json += runtime_file_probe_state_json(g_runtime_assets_state.file_probe);
	json += "}";
	return json;
}
