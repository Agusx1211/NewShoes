#pragma once

#include <cstddef>
#include <string>
#include <vector>

struct WasmBrowserRuntimeFileProbeState
{
	bool attempted = false;
	bool ok = false;
	bool global_owner_ok = false;
	bool local_file_system_global = false;
	bool archive_file_system_global = false;
	bool file_system_global = false;
	bool name_key_generator_global = false;
	bool w3d_file_system_global = false;
	bool local_ok = false;
	bool local_directory_ok = false;
	bool local_write_ok = false;
	bool local_exists_ok = false;
	bool local_cache_ok = false;
	bool local_info_ok = false;
	bool local_list_ok = false;
	bool local_read_ok = false;
	bool local_missing_cache_ok = false;
	int local_bytes = 0;
	int local_info_size = 0;
	std::string local_path;
	bool archive_attempted = false;
	bool archive_loaded = false;
	bool archive_ok = false;
	bool archive_exists_ok = false;
	bool archive_info_ok = false;
	bool archive_list_ok = false;
	bool archive_read_ok = false;
	bool archive_owner_ok = false;
	std::size_t archive_indexed_file_count = 0;
	int archive_bytes = 0;
	int archive_info_size = 0;
	std::string archive_path;
	std::string archive_owner;
	std::string source;
};

struct WasmBrowserRuntimeAssetsState
{
	bool installed = false;
	bool file_system_initialized = false;
	bool archive_loaded = false;
	bool name_key_generator_initialized = false;
	bool w3d_file_system_installed = false;
	bool owns_w3d_file_system = false;
	int install_calls = 0;
	int archive_load_calls = 0;
	std::size_t loaded_archive_specs = 0;
	std::string archive_directory;
	std::string archive_file_mask;
	std::string source;
	WasmBrowserRuntimeFileProbeState file_probe;
};

bool wasm_browser_runtime_assets_install_archive_set(
	const char *archive_directory,
	const char *archive_file_mask);
bool wasm_browser_runtime_assets_install_archive_paths(
	const char *first_archive_path,
	const char *second_archive_path);
bool wasm_browser_runtime_assets_restore_globals();
bool wasm_browser_runtime_assets_file_exists(const char *path);
bool wasm_browser_runtime_assets_read_file(const char *path, std::vector<unsigned char> &data);
const WasmBrowserRuntimeAssetsState &wasm_browser_runtime_assets_state();
std::string wasm_browser_runtime_assets_state_json();
