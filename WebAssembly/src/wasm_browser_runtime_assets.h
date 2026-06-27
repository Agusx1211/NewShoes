#pragma once

#include <cstddef>
#include <string>
#include <vector>

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
};

bool wasm_browser_runtime_assets_install_archive_set(
	const char *archive_directory,
	const char *archive_file_mask);
bool wasm_browser_runtime_assets_install_archive_paths(
	const char *first_archive_path,
	const char *second_archive_path);
bool wasm_browser_runtime_assets_file_exists(const char *path);
bool wasm_browser_runtime_assets_read_file(const char *path, std::vector<unsigned char> &data);
const WasmBrowserRuntimeAssetsState &wasm_browser_runtime_assets_state();
std::string wasm_browser_runtime_assets_state_json();
