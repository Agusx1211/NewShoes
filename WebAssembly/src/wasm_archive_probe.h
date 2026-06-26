#pragma once

#include <cstddef>
#include <string>

struct ArchiveProbeResult
{
	bool attempted = false;
	bool ok = false;
	bool loaded = false;
	bool has_armor_ini = false;
	bool has_command_button_ini = false;
	bool has_game_data_ini = false;
	bool has_weapon_ini = false;
	bool game_data_attempted = false;
	bool game_data_ok = false;
	bool has_generals_csf = false;
	bool game_text_attempted = false;
	bool game_text_ok = false;
	bool game_text_title_label = false;
	bool game_text_control_bar_label = false;
	std::size_t indexed_file_count = 0;
	std::size_t sample_bytes = 0;
	std::size_t game_data_bytes = 0;
	std::size_t game_data_parsed_fields = 0;
	std::size_t game_text_control_bar_label_count = 0;
	std::string game_data_shell_map_name;
	bool game_data_use_fps_limit = false;
	bool game_data_use_cloud_map = false;
	int game_data_frames_per_second_limit = 0;
	int game_data_max_shell_screens = 0;
	int game_data_max_particle_count = 0;
	float game_data_default_structure_rubble_height = 0.0f;
	float game_data_group_select_volume_base = 0.0f;
	std::string archive_path;
};

ArchiveProbeResult probe_original_archive(const char *archive_path);
