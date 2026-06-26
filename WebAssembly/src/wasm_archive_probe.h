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
	bool has_weapon_ini = false;
	bool has_generals_csf = false;
	bool game_text_attempted = false;
	bool game_text_ok = false;
	bool game_text_title_label = false;
	bool game_text_control_bar_label = false;
	std::size_t indexed_file_count = 0;
	std::size_t sample_bytes = 0;
	std::size_t game_text_control_bar_label_count = 0;
	std::string archive_path;
};

ArchiveProbeResult probe_original_archive(const char *archive_path);
