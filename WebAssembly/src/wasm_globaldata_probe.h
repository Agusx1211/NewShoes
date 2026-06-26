#pragma once

#include <string>

struct GlobalDataProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool set_time_of_day_ok = false;
	int x_resolution = 0;
	int y_resolution = 0;
	int frames_per_second_limit = 0;
	int max_particle_count = 0;
	int max_field_particle_count = 0;
	unsigned int exe_crc = 0;
	unsigned int network_disconnect_time = 0;
	unsigned int network_player_timeout_time = 0;
	unsigned int double_click_time_ms = 0;
	int time_of_day = 0;
	bool use_trees = false;
	bool use_tree_sway = false;
	bool use_heat_effects = false;
	bool use_fps_limit = false;
	bool windowed = false;
	bool shell_map_on = false;
	std::string user_data_path;
	std::string shell_map_name;
	std::string source;
};

struct CommandLineProbeResult
{
	bool attempted = false;
	bool ok = false;
	int x_resolution = 0;
	int y_resolution = 0;
	bool windowed = false;
	bool shell_map_on = true;
	bool play_sizzle = true;
	bool animate_windows = true;
	bool script_debug = false;
	bool particle_edit = false;
	bool win_cursors = false;
	int play_stats = 0;
	int chip_set_type = 0;
	std::string source;
};

GlobalDataProbeResult probe_original_global_data();
CommandLineProbeResult probe_original_command_line();
