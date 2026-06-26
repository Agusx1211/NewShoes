#include "wasm_archive_probe.h"
#include "wasm_real_ini_probe.h"

#include <algorithm>
#include <cstddef>
#include <string>
#include <vector>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/File.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/LocalFileSystem.h"
#include "Common/SubsystemInterface.h"
#include "Common/UnicodeString.h"
#include "GameClient/GameText.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

SubsystemInterfaceList *TheSubsystemList = nullptr;
GlobalData *TheGlobalData = nullptr;
HWND ApplicationHWnd = NULL;
const Char *g_strFile = "Data\\Generals.str";
const Char *g_csfFile = "Data\\%s\\Generals.csf";

namespace {
constexpr const char ARMOR_INI_PATH[] = "Data\\INI\\Armor.ini";
constexpr const char GAME_DATA_INI_PATH[] = "Data\\INI\\GameData.ini";
constexpr const char MAP_CACHE_INI_PATH[] = "Maps\\MapCache.ini";
constexpr const char DEFAULT_VIDEO_INI_PATH[] = "Data\\INI\\Default\\Video.ini";
constexpr const char VIDEO_INI_PATH[] = "Data\\INI\\Video.ini";
constexpr const char WATER_INI_PATH[] = "Data\\INI\\Water.ini";
constexpr const char WEATHER_INI_PATH[] = "Data\\INI\\Weather.ini";

void split_archive_path(const char *archive_path, AsciiString &directory, AsciiString &file_mask)
{
	std::string normalized = archive_path != nullptr ? archive_path : "";
	std::replace(normalized.begin(), normalized.end(), '\\', '/');

	const std::size_t slash = normalized.find_last_of('/');
	if (slash == std::string::npos) {
		directory = "";
		file_mask = normalized.c_str();
		return;
	}

	directory = normalized.substr(0, slash + 1).c_str();
	file_mask = normalized.substr(slash + 1).c_str();
}

bool read_archive_file(FileSystem &file_system, const char *path, std::vector<char> &data)
{
	FileInfo info = {};
	if (!file_system.getFileInfo(AsciiString(path), &info) || info.sizeHigh != 0 || info.sizeLow <= 0) {
		return false;
	}

	File *file = file_system.openFile(path, File::READ | File::BINARY);
	if (file == nullptr) {
		return false;
	}

	data.assign(static_cast<std::size_t>(info.sizeLow), 0);
	const Int bytes_read = file->read(data.data(), info.sizeLow);
	file->close();
	return bytes_read == info.sizeLow;
}

bool read_first_indexed_archive_file(
	ArchiveFileSystem &archive_file_system,
	FileSystem &file_system,
	std::vector<char> &data,
	std::size_t &indexed_file_count)
{
	FilenameList files;
	archive_file_system.getFileListInDirectory(
		AsciiString(""), AsciiString(""), AsciiString("*"), files, TRUE);
	indexed_file_count = files.size();

	for (FilenameListIter it = files.begin(); it != files.end(); ++it) {
		FileInfo info = {};
		if (!archive_file_system.getFileInfo(*it, &info) ||
				info.sizeHigh != 0 || info.sizeLow <= 0) {
			continue;
		}

		if (read_archive_file(file_system, it->str(), data)) {
			return true;
		}
	}

	return false;
}

void copy_armor_probe(const RealArmorIniProbeResult &armor, ArchiveProbeResult &result)
{
	result.armor_attempted = armor.attempted;
	result.armor_ok = armor.ok;
	result.armor_loaded_archives = armor.loaded_archives;
	result.armor_file_exists = armor.file_exists;
	result.armor_name_key_generator_loaded = armor.name_key_generator_loaded;
	result.armor_original_ini_load = armor.original_ini_load;
	result.armor_bytes = armor.bytes;
	result.armor_parsed_fields = armor.parsed_fields;
	result.armor_source = armor.source;
	result.armor_no_armor_found = armor.no_armor_found;
	result.armor_human_armor_found = armor.human_armor_found;
	result.armor_tank_armor_found = armor.tank_armor_found;
	result.armor_no_armor_explosion_damage = armor.no_armor_explosion_damage;
	result.armor_no_armor_hazard_cleanup_damage = armor.no_armor_hazard_cleanup_damage;
	result.armor_human_crush_damage = armor.human_crush_damage;
	result.armor_human_armor_piercing_damage = armor.human_armor_piercing_damage;
	result.armor_human_flame_damage = armor.human_flame_damage;
	result.armor_tank_small_arms_damage = armor.tank_small_arms_damage;
	result.armor_tank_radiation_damage = armor.tank_radiation_damage;
	result.armor_tank_microwave_damage = armor.tank_microwave_damage;
}

void copy_game_data_probe(const RealGameDataIniProbeResult &game_data, ArchiveProbeResult &result)
{
	result.game_data_attempted = game_data.attempted;
	result.game_data_ok = game_data.ok;
	result.game_data_loaded_archives = game_data.loaded_archives;
	result.game_data_file_exists = game_data.file_exists;
	result.game_data_original_ini_load = game_data.original_ini_load;
	result.game_data_bytes = game_data.bytes;
	result.game_data_parsed_fields = game_data.parsed_fields;
	result.game_data_source = game_data.source;
	result.game_data_shell_map_name = game_data.shell_map_name;
	result.game_data_use_fps_limit = game_data.use_fps_limit;
	result.game_data_frames_per_second_limit = game_data.frames_per_second_limit;
	result.game_data_max_shell_screens = game_data.max_shell_screens;
	result.game_data_use_cloud_map = game_data.use_cloud_map;
	result.game_data_default_structure_rubble_height = game_data.default_structure_rubble_height;
	result.game_data_group_select_volume_base = game_data.group_select_volume_base;
	result.game_data_max_particle_count = game_data.max_particle_count;
}

void copy_water_probe(const RealWaterIniProbeResult &water, ArchiveProbeResult &result)
{
	result.water_attempted = water.attempted;
	result.water_ok = water.ok;
	result.water_loaded_archives = water.loaded_archives;
	result.water_file_exists = water.file_exists;
	result.water_original_ini_load = water.original_ini_load;
	result.water_transparency_loaded = water.transparency_loaded;
	result.water_bytes = water.bytes;
	result.water_parsed_fields = water.parsed_fields;
	result.water_set_count = water.water_set_count;
	result.water_source = water.source;
	result.water_morning_sky_texture = water.morning_sky_texture;
	result.water_morning_water_texture = water.morning_water_texture;
	result.water_night_sky_texture = water.night_sky_texture;
	result.water_night_water_texture = water.night_water_texture;
	result.water_standing_water_texture = water.standing_water_texture;
	result.water_morning_repeat_count = water.morning_water_repeat_count;
	result.water_night_repeat_count = water.night_water_repeat_count;
	result.water_morning_sky_texels_per_unit = water.morning_sky_texels_per_unit;
	result.water_night_sky_texels_per_unit = water.night_sky_texels_per_unit;
	result.water_morning_u_scroll_per_ms = water.morning_u_scroll_per_ms;
	result.water_morning_v_scroll_per_ms = water.morning_v_scroll_per_ms;
	result.water_night_u_scroll_per_ms = water.night_u_scroll_per_ms;
	result.water_night_v_scroll_per_ms = water.night_v_scroll_per_ms;
	result.water_transparent_depth = water.transparent_water_depth;
	result.water_transparent_min_opacity = water.transparent_water_min_opacity;
	result.water_additive_blending = water.additive_blending;
}

void copy_weather_probe(const RealWeatherIniProbeResult &weather, ArchiveProbeResult &result)
{
	result.weather_attempted = weather.attempted;
	result.weather_ok = weather.ok;
	result.weather_loaded_archives = weather.loaded_archives;
	result.weather_file_exists = weather.file_exists;
	result.weather_original_ini_load = weather.original_ini_load;
	result.weather_bytes = weather.bytes;
	result.weather_parsed_fields = weather.parsed_fields;
	result.weather_source = weather.source;
	result.weather_snow_texture = weather.snow_texture;
	result.weather_snow_enabled = weather.snow_enabled;
	result.weather_use_point_sprites = weather.use_point_sprites;
	result.weather_snow_box_dimensions = weather.snow_box_dimensions;
	result.weather_snow_box_density = weather.snow_box_density;
	result.weather_snow_frequency_scale_x = weather.snow_frequency_scale_x;
	result.weather_snow_frequency_scale_y = weather.snow_frequency_scale_y;
	result.weather_snow_amplitude = weather.snow_amplitude;
	result.weather_snow_velocity = weather.snow_velocity;
	result.weather_snow_point_size = weather.snow_point_size;
	result.weather_snow_quad_size = weather.snow_quad_size;
	result.weather_snow_max_point_size = weather.snow_max_point_size;
	result.weather_snow_min_point_size = weather.snow_min_point_size;
}

void copy_video_probe(const RealVideoIniProbeResult &video, ArchiveProbeResult &result)
{
	result.video_attempted = video.attempted;
	result.video_ok = video.ok;
	result.video_loaded_archives = video.loaded_archives;
	result.video_file_exists = video.file_exists;
	result.video_default_file_exists = video.default_file_exists;
	result.video_original_ini_load = video.original_ini_load;
	result.video_default_original_ini_load = video.default_original_ini_load;
	result.video_shipped_original_ini_load = video.shipped_original_ini_load;
	result.video_bytes = video.bytes;
	result.video_default_bytes = video.default_bytes;
	result.video_parsed_fields = video.parsed_fields;
	result.video_count = video.video_count;
	result.video_source = video.source;
	result.video_first_internal_name = video.first_internal_name;
	result.video_first_filename = video.first_filename;
	result.video_sample_internal_name = video.sample_internal_name;
	result.video_sample_filename = video.sample_filename;
}

void copy_map_cache_probe(const RealMapCacheIniProbeResult &map_cache, ArchiveProbeResult &result)
{
	result.map_cache_attempted = map_cache.attempted;
	result.map_cache_ok = map_cache.ok;
	result.map_cache_loaded_archives = map_cache.loaded_archives;
	result.map_cache_file_exists = map_cache.file_exists;
	result.map_cache_game_text_loaded = map_cache.game_text_loaded;
	result.map_cache_name_key_generator_loaded = map_cache.name_key_generator_loaded;
	result.map_cache_original_ini_load = map_cache.original_ini_load;
	result.map_cache_bytes = map_cache.bytes;
	result.map_cache_maps = map_cache.map_count;
	result.map_cache_multiplayer_maps = map_cache.multiplayer_count;
	result.map_cache_official_maps = map_cache.official_count;
	result.map_cache_source = map_cache.source;
	result.map_cache_has_shell_map_md = map_cache.has_shell_map_md;
	result.map_cache_has_tournament_desert = map_cache.has_tournament_desert;
	result.map_cache_shell_map_md_display_name = map_cache.shell_map_md_display_name;
	result.map_cache_tournament_desert_display_name = map_cache.tournament_desert_display_name;
	result.map_cache_shell_map_md_players = map_cache.shell_map_md_players;
	result.map_cache_tournament_desert_players = map_cache.tournament_desert_players;
}

void probe_original_game_text(ArchiveProbeResult &result)
{
	result.game_text_attempted = true;
	GameTextInterface *old_game_text = TheGameText;
	GameTextInterface *game_text = CreateGameTextInterface();
	TheGameText = game_text;

	try {
		if (game_text != nullptr) {
			game_text->init();

			Bool title_exists = FALSE;
			const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
			result.game_text_title_label = title_exists && !title.isEmpty();

			Bool control_bar_exists = FALSE;
			const UnicodeString control_bar_text =
				game_text->fetch("CONTROLBAR:ConstructAmericaCommandCenter", &control_bar_exists);
			result.game_text_control_bar_label = control_bar_exists && !control_bar_text.isEmpty();

			AsciiStringVec &control_bar_labels =
				game_text->getStringsWithLabelPrefix(AsciiString("CONTROLBAR:"));
			result.game_text_control_bar_label_count = control_bar_labels.size();
			result.game_text_ok =
				result.game_text_title_label &&
				result.game_text_control_bar_label &&
				result.game_text_control_bar_label_count > 20;
		}
	} catch (...) {
		result.game_text_ok = false;
	}

	TheGameText = old_game_text;
	delete game_text;
}
}

ArchiveProbeResult probe_original_archive(const char *archive_path)
{
	ArchiveProbeResult result;
	result.attempted = true;
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	{
		Win32LocalFileSystem local_file_system;
		FileSystem file_system;
		Win32BIGFileSystem archive_file_system;

		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded) {
			result.has_armor_ini = archive_file_system.doesFileExist(ARMOR_INI_PATH);
			result.has_command_button_ini = archive_file_system.doesFileExist("Data\\INI\\CommandButton.ini");
			result.has_game_data_ini = archive_file_system.doesFileExist(GAME_DATA_INI_PATH);
			result.has_weapon_ini = archive_file_system.doesFileExist("Data\\INI\\Weapon.ini");
			result.has_map_cache_ini = archive_file_system.doesFileExist(MAP_CACHE_INI_PATH);
			result.has_default_video_ini = archive_file_system.doesFileExist(DEFAULT_VIDEO_INI_PATH);
			result.has_video_ini = archive_file_system.doesFileExist(VIDEO_INI_PATH);
			result.has_water_ini = archive_file_system.doesFileExist(WATER_INI_PATH);
			result.has_weather_ini = archive_file_system.doesFileExist(WEATHER_INI_PATH);
			result.has_generals_csf = archive_file_system.doesFileExist("Data\\English\\Generals.csf");

			std::vector<char> sample_data;
			const bool sample_ok = read_first_indexed_archive_file(
				archive_file_system,
				file_system,
				sample_data,
				result.indexed_file_count);
			result.sample_bytes = sample_data.size();
			result.ok =
				sample_ok &&
				result.indexed_file_count > 0;
			if (result.has_generals_csf) {
				probe_original_game_text(result);
			}
		}

		TheFileSystem = nullptr;
		TheArchiveFileSystem = nullptr;
		TheLocalFileSystem = nullptr;
	}

	shutdownMemoryManager();

	if (result.loaded && result.has_game_data_ini) {
		copy_game_data_probe(probe_original_game_data_ini_load(archive_path), result);
		result.ok = result.ok && result.game_data_ok;
	}
	if (result.loaded && result.has_armor_ini) {
		copy_armor_probe(probe_original_armor_ini_load(archive_path), result);
		result.ok = result.ok && result.armor_ok;
	}
	if (result.loaded && result.has_water_ini) {
		copy_water_probe(probe_original_water_ini_load(archive_path), result);
		result.ok = result.ok && result.water_ok;
	}
	if (result.loaded && result.has_weather_ini) {
		copy_weather_probe(probe_original_weather_ini_load(archive_path), result);
		result.ok = result.ok && result.weather_ok;
	}
	if (result.loaded && result.has_video_ini) {
		copy_video_probe(probe_original_video_ini_load(archive_path), result);
		result.ok = result.ok && result.video_ok;
	}
	if (result.loaded && result.has_map_cache_ini && result.has_generals_csf) {
		copy_map_cache_probe(probe_original_map_cache_ini_load(archive_path), result);
		result.ok = result.ok && result.map_cache_ok;
	}

	return result;
}
