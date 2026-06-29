#pragma once

#include <cstddef>
#include <string>

struct StartupSingletonsProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool runtime_archive_registered = false;
	bool runtime_globals_installed = false;
	bool heap_allocated = false;
	bool global_data_owned = false;
	bool subsystem_list_owned = false;
	bool subsystem_init_shutdown_ok = false;
	int subsystem_init_count = 0;
	int subsystem_shutdown_count = 0;
	bool game_lod_owned = false;
	bool game_lod_files_ready = false;
	bool game_lod_initialized = false;
	int static_lod = -1;
	int dynamic_lod = -1;
	int texture_reduction = -1;
	bool memory_passed = false;
	bool map_cache_owned = false;
	bool map_cache_file_ready = false;
	bool map_cache_game_text_loaded = false;
	bool map_cache_loaded = false;
	std::size_t map_count = 0;
	std::size_t multiplayer_count = 0;
	std::size_t official_count = 0;
	bool has_shell_map_md = false;
	bool has_tournament_desert = false;
	int tournament_desert_players = 0;
	bool map_cache_update_runtime_ready = false;
	const char *source = "";
	const char *status = "";
	const char *next_required = "";
};

const StartupSingletonsProbeResult &wasm_startup_singletons_install(
	const char *archive_directory,
	const char *archive_file_mask);
const StartupSingletonsProbeResult &wasm_startup_singletons_state();
const char *wasm_startup_singletons_state_json();
