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

struct RealArmorIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool name_key_generator_loaded = false;
	bool original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t parsed_fields = 0;
	std::string source;
	std::string archive_path;
	bool no_armor_found = false;
	bool human_armor_found = false;
	bool tank_armor_found = false;
	float no_armor_explosion_damage = 0.0f;
	float no_armor_hazard_cleanup_damage = 0.0f;
	float human_crush_damage = 0.0f;
	float human_armor_piercing_damage = 0.0f;
	float human_flame_damage = 0.0f;
	float tank_small_arms_damage = 0.0f;
	float tank_radiation_damage = 0.0f;
	float tank_microwave_damage = 0.0f;
};

struct RealScienceIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool game_text_loaded = false;
	bool name_key_generator_loaded = false;
	bool original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t parsed_fields = 0;
	std::size_t science_count = 0;
	std::string source;
	std::string archive_path;
	bool america_science_found = false;
	bool rank3_science_found = false;
	bool paladin_science_found = false;
	bool paladin_name_loaded = false;
	bool paladin_description_loaded = false;
	int america_purchase_cost = 0;
	int paladin_purchase_cost = 0;
	bool america_grantable = false;
	bool paladin_grantable = false;
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

struct RealWaterIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool original_ini_load = false;
	bool transparency_loaded = false;
	std::size_t bytes = 0;
	std::size_t parsed_fields = 0;
	std::size_t water_set_count = 0;
	std::string source;
	std::string archive_path;
	std::string morning_sky_texture;
	std::string morning_water_texture;
	std::string night_sky_texture;
	std::string night_water_texture;
	std::string standing_water_texture;
	int morning_water_repeat_count = 0;
	int night_water_repeat_count = 0;
	float morning_sky_texels_per_unit = 0.0f;
	float night_sky_texels_per_unit = 0.0f;
	float morning_u_scroll_per_ms = 0.0f;
	float morning_v_scroll_per_ms = 0.0f;
	float night_u_scroll_per_ms = 0.0f;
	float night_v_scroll_per_ms = 0.0f;
	float transparent_water_depth = 0.0f;
	float transparent_water_min_opacity = 0.0f;
	bool additive_blending = false;
};

struct RealVideoIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool default_file_exists = false;
	bool original_ini_load = false;
	bool default_original_ini_load = false;
	bool shipped_original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t default_bytes = 0;
	std::size_t parsed_fields = 0;
	std::size_t video_count = 0;
	std::string source;
	std::string archive_path;
	std::string first_internal_name;
	std::string first_filename;
	std::string sample_internal_name;
	std::string sample_filename;
};

struct RealMultiplayerIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t parsed_fields = 0;
	std::size_t color_count = 0;
	std::size_t starting_money_count = 0;
	std::string source;
	std::string archive_path;
	int start_countdown_seconds = 0;
	int max_beacons_per_player = 0;
	bool use_shroud = false;
	bool show_random_player_template = false;
	bool show_random_start_pos = false;
	bool show_random_color = false;
	bool gold_color_found = false;
	bool purple_color_found = false;
	unsigned int gold_color = 0;
	unsigned int purple_night_color = 0;
	unsigned int chat_default_color = 0;
	unsigned int chat_game_color = 0;
	unsigned int chat_player_normal_color = 0;
	unsigned int chat_self_color = 0;
	unsigned int chat_map_selected_color = 0;
	int starting_money_first = 0;
	int starting_money_second = 0;
	int starting_money_third = 0;
	int starting_money_fourth = 0;
	int default_starting_money = 0;
};

struct RealTerrainIniProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded_archives = false;
	bool file_exists = false;
	bool original_ini_load = false;
	std::size_t bytes = 0;
	std::size_t parsed_fields = 0;
	std::size_t terrain_count = 0;
	std::string source;
	std::string archive_path;
	bool transition_found = false;
	bool asphalt_found = false;
	bool desert_dry_found = false;
	bool beach_tropical_found = false;
	bool snow_flat_found = false;
	std::string transition_texture;
	std::string asphalt_texture;
	std::string desert_dry_texture;
	std::string beach_tropical_texture;
	std::string snow_flat_texture;
	int transition_class = 0;
	int asphalt_class = 0;
	int desert_dry_class = 0;
	int beach_tropical_class = 0;
	int snow_flat_class = 0;
	bool asphalt_blend_edges = false;
	bool asphalt_restrict_construction = false;
};

RealGameDataIniProbeResult probe_original_game_data_ini_load(const char *archive_path);
RealArmorIniProbeResult probe_original_armor_ini_load(const char *archive_path);
RealScienceIniProbeResult probe_original_science_ini_load(const char *archive_path);
RealMapCacheIniProbeResult probe_original_map_cache_ini_load(const char *archive_path);
RealWeatherIniProbeResult probe_original_weather_ini_load(const char *archive_path);
RealWaterIniProbeResult probe_original_water_ini_load(const char *archive_path);
RealVideoIniProbeResult probe_original_video_ini_load(const char *archive_path);
RealMultiplayerIniProbeResult probe_original_multiplayer_ini_load(const char *archive_path);
RealTerrainIniProbeResult probe_original_terrain_ini_load(const char *archive_path);
