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

RealGameDataIniProbeResult probe_original_game_data_ini_load(const char *archive_path);
