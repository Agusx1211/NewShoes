#include "wasm_real_ini_probe.h"

#include <algorithm>
#include <cmath>
#include <string>

#include "PreRTS.h"

#include "Common/ArchiveFileSystem.h"
#include "Common/FileSystem.h"
#include "Common/GameMemory.h"
#include "Common/GlobalData.h"
#include "Common/INI.h"
#include "Common/LocalFileSystem.h"
#include "Common/NameKeyGenerator.h"
#include "Common/WellKnownKeys.h"
#include "GameClient/GameText.h"
#include "GameClient/MapUtil.h"
#include "GameClient/Snow.h"
#include "GameClient/VideoPlayer.h"
#include "GameClient/Water.h"
#include "Win32Device/Common/Win32BIGFileSystem.h"
#include "Win32Device/Common/Win32LocalFileSystem.h"

class TerrainVisual;

MapCache *TheMapCache __attribute__((weak)) = nullptr;
TerrainVisual *TheTerrainVisual __attribute__((weak)) = nullptr;
const StaticNameKey TheKey_InitialCameraPosition __attribute__((weak))("InitialCameraPosition");

namespace {
constexpr const char GAME_DATA_INI_PATH[] = "Data\\INI\\GameData.ini";
constexpr const char MAP_CACHE_INI_PATH[] = "Maps\\MapCache.ini";
constexpr const char DEFAULT_VIDEO_INI_PATH[] = "Data\\INI\\Default\\Video.ini";
constexpr const char VIDEO_INI_PATH[] = "Data\\INI\\Video.ini";
constexpr const char WATER_INI_PATH[] = "Data\\INI\\Water.ini";
constexpr const char WEATHER_INI_PATH[] = "Data\\INI\\Weather.ini";
constexpr const char EXPECTED_SHELL_MAP_NAME[] = "Maps\\ShellMapMD\\ShellMapMD.map";
constexpr const char SHELL_MAP_MD_PATH[] = "maps\\shellmapmd\\shellmapmd.map";
constexpr const char TOURNAMENT_DESERT_PATH[] = "maps\\tournament desert\\tournament desert.map";

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

std::size_t count_verified_fields(const RealGameDataIniProbeResult &result)
{
	return
		(result.shell_map_name == EXPECTED_SHELL_MAP_NAME ? 1U : 0U) +
		(result.use_fps_limit ? 1U : 0U) +
		(result.frames_per_second_limit == 30 ? 1U : 0U) +
		(result.max_shell_screens == 8 ? 1U : 0U) +
		(result.use_cloud_map ? 1U : 0U) +
		(std::fabs(result.default_structure_rubble_height - 10.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.group_select_volume_base - 0.5f) < 0.001f ? 1U : 0U) +
		(result.max_particle_count == 2500 ? 1U : 0U);
}

std::size_t count_verified_fields(const RealWeatherIniProbeResult &result)
{
	return
		(result.snow_texture == "ExSnowFlake.tga" ? 1U : 0U) +
		(!result.snow_enabled ? 1U : 0U) +
		(result.use_point_sprites ? 1U : 0U) +
		(std::fabs(result.snow_box_dimensions - 200.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_box_density - 1.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_frequency_scale_x - 0.0533f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.snow_frequency_scale_y - 0.0275f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.snow_amplitude - 5.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_velocity - 4.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_point_size - 1.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_quad_size - 0.5f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_max_point_size - 64.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.snow_min_point_size - 0.0f) < 0.001f ? 1U : 0U);
}

std::size_t count_verified_fields(const RealWaterIniProbeResult &result)
{
	return
		(result.water_set_count == 4 ? 1U : 0U) +
		(result.transparency_loaded ? 1U : 0U) +
		(result.morning_sky_texture == "TSCloudWis.tga" ? 1U : 0U) +
		(result.morning_water_texture == "TSWater.tga" ? 1U : 0U) +
		(result.morning_water_repeat_count == 32 ? 1U : 0U) +
		(std::fabs(result.morning_sky_texels_per_unit - 0.8f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.morning_u_scroll_per_ms - 0.002f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.morning_v_scroll_per_ms - 0.002f) < 0.0001f ? 1U : 0U) +
		(result.night_sky_texture == "TSStarFeld.tga" ? 1U : 0U) +
		(result.night_water_texture == "TSWater.tga" ? 1U : 0U) +
		(result.night_water_repeat_count == 32 ? 1U : 0U) +
		(std::fabs(result.night_sky_texels_per_unit - 1.6f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.night_u_scroll_per_ms - 0.0f) < 0.0001f ? 1U : 0U) +
		(std::fabs(result.night_v_scroll_per_ms - 0.0f) < 0.0001f ? 1U : 0U) +
		(result.standing_water_texture == "TWWater01.tga" ? 1U : 0U) +
		(std::fabs(result.transparent_water_depth - 3.0f) < 0.001f ? 1U : 0U) +
		(std::fabs(result.transparent_water_min_opacity - 1.0f) < 0.001f ? 1U : 0U) +
		(!result.additive_blending ? 1U : 0U);
}

std::size_t count_verified_fields(const RealVideoIniProbeResult &result)
{
	return
		(result.video_count > 0 ? 1U : 0U) +
		(!result.first_internal_name.empty() ? 1U : 0U) +
		(!result.first_filename.empty() ? 1U : 0U) +
		(!result.sample_internal_name.empty() ? 1U : 0U) +
		(!result.sample_filename.empty() ? 1U : 0U);
}

void reset_water_settings()
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		WaterSettings[index] = WaterSetting();
	}
}

void copy_water_settings(WaterSetting (&destination)[TIME_OF_DAY_COUNT])
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		destination[index] = WaterSettings[index];
	}
}

void restore_water_settings(const WaterSetting (&source)[TIME_OF_DAY_COUNT])
{
	for (int index = 0; index < TIME_OF_DAY_COUNT; ++index) {
		WaterSettings[index] = source[index];
	}
}

std::size_t count_loaded_water_settings()
{
	std::size_t count = 0;
	for (int index = TIME_OF_DAY_FIRST; index < TIME_OF_DAY_COUNT; ++index) {
		if (!WaterSettings[index].m_waterTextureFile.isEmpty()) {
			++count;
		}
	}
	return count;
}

bool unicode_not_empty(const UnicodeString &value)
{
	return !value.isEmpty() && value.getLength() > 0;
}

void inspect_map_cache_entry(
	MapCache &map_cache,
	const char *path,
	bool &exists,
	bool &has_display_name,
	int &player_count)
{
	MapCache::const_iterator it = map_cache.find(AsciiString(path));
	exists = it != map_cache.end();
	if (!exists) {
		has_display_name = false;
		player_count = 0;
		return;
	}

	has_display_name = unicode_not_empty(it->second.m_displayName);
	player_count = it->second.m_numPlayers;
}
}

RealGameDataIniProbeResult probe_original_game_data_ini_load(const char *archive_path)
{
	RealGameDataIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GlobalData *old_global_data = TheWritableGlobalData;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GlobalData *global_data = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(GAME_DATA_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				global_data = NEW GlobalData;
				TheWritableGlobalData = global_data;

				INI ini;
				ini.load(AsciiString(GAME_DATA_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				result.shell_map_name = global_data->m_shellMapName.str();
				result.use_fps_limit = global_data->m_useFpsLimit;
				result.frames_per_second_limit = global_data->m_framesPerSecondLimit;
				result.max_shell_screens = global_data->m_maxShellScreens;
				result.use_cloud_map = global_data->m_useCloudMap;
				result.default_structure_rubble_height = global_data->m_defaultStructureRubbleHeight;
				result.group_select_volume_base = global_data->m_groupSelectVolumeBase;
				result.max_particle_count = global_data->m_maxParticleCount;
				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 10000 &&
					result.parsed_fields == 8 &&
					result.original_ini_load;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	if (global_data != nullptr) {
		delete global_data;
	}

	TheWritableGlobalData = old_global_data;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	shutdownMemoryManager();

	return result;
}

RealWaterIniProbeResult probe_original_water_ini_load(const char *archive_path)
{
	RealWaterIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIWater.cpp + GameClient/Water.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	TerrainVisual *old_terrain_visual = TheTerrainVisual;
	WaterTransparencySetting *old_water_transparency =
		const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
	WaterSetting old_water_settings[TIME_OF_DAY_COUNT];
	copy_water_settings(old_water_settings);

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	WaterTransparencySetting *water_transparency_to_delete = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;
		TheTerrainVisual = nullptr;
		TheWaterTransparency = nullptr;
		reset_water_settings();

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(WATER_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				INI ini;
				ini.load(AsciiString(WATER_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				water_transparency_to_delete =
					const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
				const WaterTransparencySetting *transparency = TheWaterTransparency;
				result.transparency_loaded = transparency != nullptr;
				result.water_set_count = count_loaded_water_settings();

				const WaterSetting &morning = WaterSettings[TIME_OF_DAY_MORNING];
				const WaterSetting &night = WaterSettings[TIME_OF_DAY_NIGHT];
				result.morning_sky_texture = morning.m_skyTextureFile.str();
				result.morning_water_texture = morning.m_waterTextureFile.str();
				result.morning_water_repeat_count = morning.m_waterRepeatCount;
				result.morning_sky_texels_per_unit = morning.m_skyTexelsPerUnit;
				result.morning_u_scroll_per_ms = morning.m_uScrollPerMs;
				result.morning_v_scroll_per_ms = morning.m_vScrollPerMs;
				result.night_sky_texture = night.m_skyTextureFile.str();
				result.night_water_texture = night.m_waterTextureFile.str();
				result.night_water_repeat_count = night.m_waterRepeatCount;
				result.night_sky_texels_per_unit = night.m_skyTexelsPerUnit;
				result.night_u_scroll_per_ms = night.m_uScrollPerMs;
				result.night_v_scroll_per_ms = night.m_vScrollPerMs;

				if (transparency != nullptr) {
					result.standing_water_texture = transparency->m_standingWaterTexture.str();
					result.transparent_water_depth = transparency->m_transparentWaterDepth;
					result.transparent_water_min_opacity = transparency->m_minWaterOpacity;
					result.additive_blending = transparency->m_additiveBlend;
				}
				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 2000 &&
					result.original_ini_load &&
					result.parsed_fields == 18;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	if (water_transparency_to_delete == nullptr) {
		WaterTransparencySetting *current_water_transparency =
			const_cast<WaterTransparencySetting *>(TheWaterTransparency.getNonOverloadedPointer());
		if (current_water_transparency != old_water_transparency) {
			water_transparency_to_delete = current_water_transparency;
		}
	}

	TheWaterTransparency = old_water_transparency;
	TheTerrainVisual = old_terrain_visual;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (water_transparency_to_delete != nullptr &&
		water_transparency_to_delete != old_water_transparency) {
		water_transparency_to_delete->deleteInstance();
	}
	restore_water_settings(old_water_settings);

	shutdownMemoryManager();

	return result;
}

RealVideoIniProbeResult probe_original_video_ini_load(const char *archive_path)
{
	RealVideoIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIVideo.cpp + GameClient/VideoPlayer.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	VideoPlayerInterface *old_video_player = TheVideoPlayer;

	{
		Win32LocalFileSystem local_file_system;
		Win32BIGFileSystem archive_file_system;
		FileSystem file_system;
		VideoPlayer video_player;

		try {
			TheLocalFileSystem = &local_file_system;
			TheArchiveFileSystem = &archive_file_system;
			TheFileSystem = &file_system;
			TheVideoPlayer = &video_player;

			result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
			if (result.loaded_archives) {
				FileInfo default_file_info = {};
				result.default_file_exists =
					archive_file_system.getFileInfo(AsciiString(DEFAULT_VIDEO_INI_PATH), &default_file_info) &&
					default_file_info.sizeHigh == 0 &&
					default_file_info.sizeLow > 0;
				result.default_bytes = result.default_file_exists ?
					static_cast<std::size_t>(default_file_info.sizeLow) : 0U;

				FileInfo file_info = {};
				result.file_exists =
					archive_file_system.getFileInfo(AsciiString(VIDEO_INI_PATH), &file_info) &&
					file_info.sizeHigh == 0 &&
					file_info.sizeLow > 0;
				result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

				INI ini;
				if (result.default_file_exists) {
					ini.load(AsciiString(DEFAULT_VIDEO_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
					result.default_original_ini_load = true;
				}
				if (result.file_exists) {
					ini.load(AsciiString(VIDEO_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
					result.shipped_original_ini_load = true;
				}
				result.original_ini_load =
					result.default_original_ini_load ||
					result.shipped_original_ini_load;

				result.video_count = static_cast<std::size_t>(video_player.getNumVideos());
				const Video *first_video = video_player.getVideo(0);
				if (first_video != nullptr) {
					result.first_internal_name = first_video->m_internalName.str();
					result.first_filename = first_video->m_filename.str();
				}
				const Video *sample_video = nullptr;
				for (Int index = 0; index < video_player.getNumVideos(); ++index) {
					const Video *video = video_player.getVideo(index);
					if (video != nullptr &&
						!video->m_internalName.isEmpty() &&
						!video->m_filename.isEmpty()) {
						sample_video = video;
						break;
					}
				}
				if (sample_video != nullptr) {
					result.sample_internal_name = sample_video->m_internalName.str();
					result.sample_filename = sample_video->m_filename.str();
				}
				result.parsed_fields = count_verified_fields(result);
				result.ok =
					result.bytes > 0 &&
					result.shipped_original_ini_load &&
					result.video_count > 0 &&
					result.parsed_fields == 5;
			}
		} catch (...) {
			result.ok = false;
		}

		TheVideoPlayer = old_video_player;
		TheFileSystem = old_file_system;
		TheArchiveFileSystem = old_archive_file_system;
		TheLocalFileSystem = old_local_file_system;
	}

	shutdownMemoryManager();

	return result;
}

RealWeatherIniProbeResult probe_original_weather_ini_load(const char *archive_path)
{
	RealWeatherIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + GameClient/Snow.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	OVERRIDE<WeatherSetting> old_weather_setting = TheWeatherSetting;
	SnowManager *old_snow_manager = TheSnowManager;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	WeatherSetting *weather_setting_to_delete = nullptr;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;
		TheWeatherSetting = nullptr;
		TheSnowManager = nullptr;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(WEATHER_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				INI ini;
				ini.load(AsciiString(WEATHER_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				weather_setting_to_delete =
					const_cast<WeatherSetting *>(TheWeatherSetting.getNonOverloadedPointer());
				const WeatherSetting *weather_setting = TheWeatherSetting;
				if (weather_setting != nullptr) {
					result.snow_texture = weather_setting->m_snowTexture.str();
					result.snow_enabled = weather_setting->m_snowEnabled;
					result.use_point_sprites = weather_setting->m_usePointSprites;
					result.snow_box_dimensions = weather_setting->m_snowBoxDimensions;
					result.snow_box_density = weather_setting->m_snowBoxDensity;
					result.snow_frequency_scale_x = weather_setting->m_snowFrequencyScaleX;
					result.snow_frequency_scale_y = weather_setting->m_snowFrequencyScaleY;
					result.snow_amplitude = weather_setting->m_snowAmplitude;
					result.snow_velocity = weather_setting->m_snowVelocity;
					result.snow_point_size = weather_setting->m_snowPointSize;
					result.snow_quad_size = weather_setting->m_snowQuadSize;
					result.snow_max_point_size = weather_setting->m_snowMaxPointSize;
					result.snow_min_point_size = weather_setting->m_snowMinPointSize;
					result.parsed_fields = count_verified_fields(result);
				}

				result.ok =
					result.bytes > 1000 &&
					result.original_ini_load &&
					result.parsed_fields == 13;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	if (weather_setting_to_delete == nullptr) {
		weather_setting_to_delete =
			const_cast<WeatherSetting *>(TheWeatherSetting.getNonOverloadedPointer());
	}

	TheWeatherSetting = old_weather_setting;
	TheSnowManager = old_snow_manager;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (weather_setting_to_delete != nullptr) {
		weather_setting_to_delete->deleteInstance();
	}

	shutdownMemoryManager();

	return result;
}

RealMapCacheIniProbeResult probe_original_map_cache_ini_load(const char *archive_path)
{
	RealMapCacheIniProbeResult result;
	result.attempted = true;
	result.source = "GameEngine/Common/INI.cpp::load + INIMapCache.cpp";
	result.archive_path = archive_path != nullptr ? archive_path : "";

	AsciiString archive_directory;
	AsciiString archive_mask;
	split_archive_path(archive_path, archive_directory, archive_mask);
	if (archive_mask.isEmpty()) {
		return result;
	}

	initMemoryManager();

	FileSystem *old_file_system = TheFileSystem;
	LocalFileSystem *old_local_file_system = TheLocalFileSystem;
	ArchiveFileSystem *old_archive_file_system = TheArchiveFileSystem;
	GameTextInterface *old_game_text = TheGameText;
	NameKeyGenerator *old_name_key_generator = TheNameKeyGenerator;
	MapCache *old_map_cache = TheMapCache;

	Win32LocalFileSystem local_file_system;
	Win32BIGFileSystem archive_file_system;
	FileSystem file_system;
	GameTextInterface *game_text = nullptr;
	NameKeyGenerator *name_key_generator = nullptr;
	MapCache map_cache;

	try {
		TheLocalFileSystem = &local_file_system;
		TheArchiveFileSystem = &archive_file_system;
		TheFileSystem = &file_system;

		result.loaded_archives = archive_file_system.loadBigFilesFromDirectory(archive_directory, archive_mask);
		if (result.loaded_archives) {
			FileInfo file_info = {};
			result.file_exists =
				archive_file_system.getFileInfo(AsciiString(MAP_CACHE_INI_PATH), &file_info) &&
				file_info.sizeHigh == 0 &&
				file_info.sizeLow > 0;
			result.bytes = result.file_exists ? static_cast<std::size_t>(file_info.sizeLow) : 0U;

			if (result.file_exists) {
				name_key_generator = NEW NameKeyGenerator;
				TheNameKeyGenerator = name_key_generator;
				name_key_generator->init();
				result.name_key_generator_loaded = true;

				game_text = CreateGameTextInterface();
				TheGameText = game_text;
				if (game_text != nullptr) {
					game_text->init();
					Bool title_exists = FALSE;
					const UnicodeString title = game_text->fetch("GUI:Command&ConquerGenerals", &title_exists);
					result.game_text_loaded = title_exists && unicode_not_empty(title);
				}

				TheMapCache = &map_cache;

				INI ini;
				ini.load(AsciiString(MAP_CACHE_INI_PATH), INI_LOAD_OVERWRITE, nullptr);
				result.original_ini_load = true;

				for (MapCache::const_iterator it = map_cache.begin(); it != map_cache.end(); ++it) {
					if (it->second.m_isMultiplayer) {
						++result.multiplayer_count;
					}
					if (it->second.m_isOfficial) {
						++result.official_count;
					}
				}

				result.map_count = map_cache.size();
				inspect_map_cache_entry(
					map_cache,
					SHELL_MAP_MD_PATH,
					result.has_shell_map_md,
					result.shell_map_md_display_name,
					result.shell_map_md_players);
				inspect_map_cache_entry(
					map_cache,
					TOURNAMENT_DESERT_PATH,
					result.has_tournament_desert,
					result.tournament_desert_display_name,
					result.tournament_desert_players);

				result.ok =
					result.bytes > 100000 &&
					result.game_text_loaded &&
					result.name_key_generator_loaded &&
					result.original_ini_load &&
					result.map_count > 80 &&
					result.multiplayer_count > 20 &&
					result.official_count > 20 &&
					result.has_shell_map_md &&
					result.has_tournament_desert &&
					result.tournament_desert_display_name &&
					result.tournament_desert_players >= 2;
			}
		}
	} catch (...) {
		result.ok = false;
	}

	TheMapCache = old_map_cache;
	TheNameKeyGenerator = old_name_key_generator;
	TheGameText = old_game_text;
	TheFileSystem = old_file_system;
	TheArchiveFileSystem = old_archive_file_system;
	TheLocalFileSystem = old_local_file_system;

	if (game_text != nullptr) {
		delete game_text;
	}
	if (name_key_generator != nullptr) {
		delete name_key_generator;
	}
	map_cache.clear();

	shutdownMemoryManager();

	return result;
}
