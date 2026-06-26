#pragma once

#include <cstddef>
#include <string>

struct RealGameDataIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t parsed_fields = 0;
	std::string source;
	std::string archive_path;
	std::string shell_map_name;
	bool use_fps_limit = false;
	bool use_cloud_map = false;
	int frames_per_second_limit = 0;
	int max_shell_screens = 0;
	int max_particle_count = 0;
	float default_structure_rubble_height = 0.0f;
	float group_select_volume_base = 0.0f;
};

struct RealMapCacheIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool game_text_loaded = false;
	bool name_key_generator_loaded = false;
	bool original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t map_count = 0;
	std::size_t multiplayer_count = 0;
	std::size_t official_count = 0;
	std::string source;
	std::string archive_path;
	bool has_shell_map_md = false;
	bool has_tournament_desert = false;
	bool shell_map_md_display_name = false;
	bool tournament_desert_display_name = false;
	int shell_map_md_players = 0;
	int tournament_desert_players = 0;
};

struct RealWeatherIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t parsed_fields = 0;
	std::string source;
	std::string archive_path;
	std::string snow_texture;
	bool snow_enabled = false;
	bool use_point_sprites = false;
	float snow_box_dimensions = 0.0f;
	float snow_box_density = 0.0f;
	float snow_frequency_scale_x = 0.0f;
	float snow_frequency_scale_y = 0.0f;
	float snow_amplitude = 0.0f;
	float snow_velocity = 0.0f;
	float snow_point_size = 0.0f;
	float snow_quad_size = 0.0f;
	float snow_max_point_size = 0.0f;
	float snow_min_point_size = 0.0f;
};

RealGameDataIniProbeResult probe_original_game_data_ini_load(const char *archive_path);
RealMapCacheIniProbeResult probe_original_map_cache_ini_load(const char *archive_path);
RealWeatherIniProbeResult probe_original_weather_ini_load(const char *archive_path);
